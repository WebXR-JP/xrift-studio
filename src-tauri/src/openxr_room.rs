use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

enum Job {
    Diagnostics,
    Capture {
        request_id: String,
        cancelled: Arc<AtomicBool>,
    },
}
#[derive(Default)]
pub struct RoomCaptureState(Arc<Mutex<Option<Job>>>);

// The guard is created before scheduling and moved into the blocking worker.
// Neither a dropped IPC future nor an early return can leave the native slot busy.
struct JobGuard(Arc<Mutex<Option<Job>>>);
impl Drop for JobGuard {
    fn drop(&mut self) {
        self.0.lock().unwrap_or_else(|error| error.into_inner()).take();
    }
}
impl RoomCaptureState {
    fn reserve(&self, job: Job) -> Result<JobGuard, String> {
        let mut active = self
            .0
            .lock()
            .map_err(|_| "STATE_ERROR: 取得状態を確認できません")?;
        if active.is_some() {
            return Err("BUSY: OpenXRの診断または部屋の取得が進行中です".into());
        }
        *active = Some(job);
        Ok(JobGuard(self.0.clone()))
    }

    fn cancel(&self, request_id: &str) -> Result<(), String> {
        let active = self
            .0
            .lock()
            .map_err(|_| "STATE_ERROR: 取得状態を確認できません")?;
        if let Some(Job::Capture {
            request_id: active_id,
            cancelled,
        }) = active.as_ref()
        {
            if active_id == request_id {
                cancelled.store(true, Ordering::Release);
            }
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn get_openxr_room_capabilities(
    state: tauri::State<'_, RoomCaptureState>,
) -> Result<xrift_openxr_room::Capabilities, String> {
    let guard = state.reserve(Job::Diagnostics)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        xrift_openxr_room::capabilities()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn capture_openxr_room(
    state: tauri::State<'_, RoomCaptureState>,
    request_id: String,
) -> Result<xrift_openxr_room::Room, String> {
    if request_id.is_empty() || request_id.len() > 128 {
        return Err("INVALID_REQUEST: 取得リクエストIDが不正です".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    let guard = state.reserve(Job::Capture {
        request_id,
        cancelled: cancelled.clone(),
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        xrift_openxr_room::capture(&cancelled)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_openxr_room_capture(
    state: tauri::State<'_, RoomCaptureState>,
    request_id: String,
) -> Result<(), String> {
    state.cancel(&request_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_and_capture_are_mutually_exclusive() {
        let state = RoomCaptureState::default();
        let diagnostics = state.reserve(Job::Diagnostics).unwrap();
        assert!(state
            .reserve(Job::Capture {
                request_id: "capture".into(),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .is_err());
        state.cancel("capture").unwrap();
        assert!(state.reserve(Job::Diagnostics).is_err());

        drop(diagnostics);
        let _capture = state
            .reserve(Job::Capture {
                request_id: "capture".into(),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .unwrap();
        assert!(state.reserve(Job::Diagnostics).is_err());
    }

    #[test]
    fn cancellation_requires_the_active_request_id_and_keeps_the_slot_busy() {
        let state = RoomCaptureState::default();
        let cancelled = Arc::new(AtomicBool::new(false));
        let _capture = state
            .reserve(Job::Capture {
                request_id: "active".into(),
                cancelled: cancelled.clone(),
            })
            .unwrap();

        state.cancel("other").unwrap();
        assert!(!cancelled.load(Ordering::Acquire));
        state.cancel("active").unwrap();
        assert!(cancelled.load(Ordering::Acquire));
        assert!(state.reserve(Job::Diagnostics).is_err());
    }

    #[test]
    fn releasing_a_job_allows_retry_without_inheriting_a_late_cancellation() {
        let state = RoomCaptureState::default();
        let first = state
            .reserve(Job::Capture {
                request_id: "first".into(),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .unwrap();
        drop(first);

        let cancelled = Arc::new(AtomicBool::new(false));
        let next = state
            .reserve(Job::Capture {
                request_id: "next".into(),
                cancelled: cancelled.clone(),
            })
            .unwrap();
        state.cancel("first").unwrap();
        assert!(!cancelled.load(Ordering::Acquire));

        drop(next);
        assert!(state.reserve(Job::Diagnostics).is_ok());
    }
}
