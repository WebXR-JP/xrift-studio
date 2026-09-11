use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Default)]
struct Job {
    busy: AtomicBool,
    cancelled: AtomicBool,
}
#[derive(Default)]
pub struct RoomCaptureState(Arc<Job>);
struct BusyGuard(Arc<Job>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn get_openxr_room_capabilities() -> Result<xrift_openxr_room::Capabilities, String> {
    tauri::async_runtime::spawn_blocking(xrift_openxr_room::capabilities)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn capture_openxr_room(
    state: tauri::State<'_, RoomCaptureState>,
) -> Result<xrift_openxr_room::Room, String> {
    let job = state.inner().0.clone();
    if job
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("BUSY: 部屋の取得が進行中です".into());
    }
    job.cancelled.store(false, Ordering::Release);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = BusyGuard(job.clone());
        xrift_openxr_room::capture(&job.cancelled)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_openxr_room_capture(state: tauri::State<'_, RoomCaptureState>) {
    state.inner().0.cancelled.store(true, Ordering::Release);
}
