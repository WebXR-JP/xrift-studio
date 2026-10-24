//! Bounded captures from the owned background Blender process, scoped to one chat run.
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
};

type Callback = Arc<dyn Fn(Value) + Send + Sync>;
static SUBSCRIBERS: OnceLock<Mutex<HashMap<String, Callback>>> = OnceLock::new();
pub(crate) struct PreviewSubscription {
    id: String,
    callback: Callback,
}
pub(crate) fn subscribe_previews(id: &str, callback: Callback) -> PreviewSubscription {
    SUBSCRIBERS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap()
        .insert(id.into(), callback.clone());
    PreviewSubscription {
        id: id.into(),
        callback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let mut nonce = [0; 16];
            getrandom::fill(&mut nonce).unwrap();
            let name: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
            let root = std::env::temp_dir().join(format!("xrift-blender-preview-test-{name}"));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn frame(&self, sequence: u64) {
            self.frame_total(sequence, 2);
        }
        fn frame_total(&self, sequence: u64, total: u64) {
            let metadata = json!({"sequence":sequence,"completed":sequence,"total":total,"capturedAt":1_790_000_000_000_u64}).to_string();
            fs::write(self.0.join(format!("preview-{sequence}.json")), &metadata).unwrap();
            fs::write(self.0.join("preview.json"), metadata).unwrap();
            fs::write(
                self.0.join(format!("preview-{sequence}.png")),
                include_bytes!("../../e2e/fixtures/blender-progress.png"),
            )
            .unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn captures_deduplicate_and_reject_oversized_or_invalid_files() {
        let fixture = Fixture::new();
        fixture.frame(1);
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let mut stream = PreviewStream::new(
            Arc::new(move |event| captured.lock().unwrap().push(event)),
            "Fixture".into(),
        );
        stream.poll(&fixture.0);
        stream.poll(&fixture.0);
        assert_eq!(events.lock().unwrap().len(), 1);
        fixture.frame(2);
        fs::write(fixture.0.join("preview-2.png"), vec![0; 1_048_577]).unwrap();
        stream.poll(&fixture.0);
        assert_eq!(events.lock().unwrap().len(), 1);
        fs::write(fixture.0.join("preview-2.png"), b"not a screenshot").unwrap();
        stream.poll(&fixture.0);
        assert_eq!(events.lock().unwrap().len(), 1);
        fixture.frame(2);
        stream.poll(&fixture.0);
        assert_eq!(events.lock().unwrap().len(), 2);
        fs::write(
            fixture.0.join("preview.json"),
            json!({"sequence":3,"completed":1,"total":0,"capturedAt":1}).to_string(),
        )
        .unwrap();
        stream.poll(&fixture.0);
        assert_eq!(events.lock().unwrap().len(), 2);
    }
    #[test]
    fn fast_captures_between_polls_preserve_partial_and_final_frames() {
        let fixture = Fixture::new();
        fixture.frame(1);
        fixture.frame(2);
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let mut stream = PreviewStream::new(
            Arc::new(move |event| captured.lock().unwrap().push(event)),
            "Fixture".into(),
        );
        stream.poll(&fixture.0);
        stream.poll(&fixture.0);
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["preview"]["completed"], 1);
        assert_eq!(events[1]["preview"]["completed"], 2);
    }

    #[test]
    fn delayed_poll_only_delivers_four_newest_captures() {
        let fixture = Fixture::new();
        for sequence in 1..=6 {
            fixture.frame_total(sequence, 6);
        }
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let mut stream = PreviewStream::new(
            Arc::new(move |event| captured.lock().unwrap().push(event)),
            "Fixture".into(),
        );
        stream.poll(&fixture.0);
        stream.poll(&fixture.0);
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 4);
        assert_eq!(events[0]["preview"]["sequence"], 3);
        assert_eq!(events[3]["preview"]["sequence"], 6);
    }

    #[test]
    fn subscribers_are_scoped_and_removed_on_run_completion() {
        let fixture = Fixture::new();
        let id = fixture.0.file_name().unwrap().to_string_lossy();
        assert!(callback_for(Some(&id)).is_none());
        let subscription = subscribe_previews(&id, Arc::new(|_| {}));
        assert!(callback_for(Some(&id)).is_some());
        assert!(callback_for(None).is_none());
        assert!(callback_for(Some("another-unregistered-run")).is_none());
        drop(subscription);
        assert!(callback_for(Some(&id)).is_none());
    }
}
impl Drop for PreviewSubscription {
    fn drop(&mut self) {
        if let Ok(mut entries) = SUBSCRIBERS.get_or_init(Mutex::default).lock() {
            if entries
                .get(&self.id)
                .is_some_and(|callback| Arc::ptr_eq(callback, &self.callback))
            {
                entries.remove(&self.id);
            }
        }
    }
}
pub(super) fn callback_for(id: Option<&str>) -> Option<Callback> {
    SUBSCRIBERS
        .get_or_init(Mutex::default)
        .lock()
        .ok()?
        .get(id?)
        .cloned()
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Frame {
    sequence: u64,
    completed: u64,
    total: u64,
    captured_at: u64,
}
fn bounded_file(path: &Path, maximum: u64) -> Option<Vec<u8>> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if super::is_link(&metadata) || !metadata.is_file() || metadata.len() > maximum {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    (bytes.len() as u64 <= maximum).then_some(bytes)
}
pub(super) struct PreviewStream {
    callback: Callback,
    sequence: u64,
    warned: bool,
    name: String,
}
impl PreviewStream {
    pub(super) fn new(callback: Callback, name: String) -> Self {
        Self {
            callback,
            sequence: 0,
            warned: false,
            name,
        }
    }
    pub(super) fn poll(&mut self, directory: &Path) {
        if !self.warned && bounded_file(&directory.join("preview-error.txt"), 1024).is_some() {
            self.warned = true;
            (self.callback)(
                json!({"type":"progress", "message":"Blenderの途中画像を作成できませんでした。モデルの制作は続けています"}),
            );
        }
        let Some(frame) = bounded_file(&directory.join("preview.json"), 1024)
            .and_then(|bytes| serde_json::from_slice::<Frame>(&bytes).ok())
        else {
            return;
        };
        if frame.sequence <= self.sequence
            || frame.sequence > 64
            || frame.total == 0
            || frame.total > 256
            || frame.completed == 0
            || frame.completed > frame.total
            || frame.captured_at > 8_000_000_000_000_000
        {
            return;
        }
        // Bound a delayed batch to the gallery's four newest actual captures.
        let first = (self.sequence + 1).max(frame.sequence.saturating_sub(3));
        for sequence in first..=frame.sequence {
            let captured = bounded_file(&directory.join(format!("preview-{sequence}.json")), 1024)
                .and_then(|bytes| serde_json::from_slice::<Frame>(&bytes).ok())
                .or_else(|| (sequence == frame.sequence).then_some(frame));
            if let Some(captured) = captured.filter(|captured| captured.sequence == sequence) {
                self.emit_frame(directory, captured);
            }
        }
    }

    fn emit_frame(&mut self, directory: &Path, frame: Frame) {
        if frame.total == 0
            || frame.total > 256
            || frame.completed == 0
            || frame.completed > frame.total
            || frame.captured_at > 8_000_000_000_000_000
        {
            return;
        }
        let Some(bytes) = bounded_file(
            &directory.join(format!("preview-{}.png", frame.sequence)),
            1_048_576,
        ) else {
            return;
        };
        if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
            return;
        }
        let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
        let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
        if width == 0 || width > 768 || height == 0 || height > 768 {
            return;
        }
        self.sequence = frame.sequence;
        (self.callback)(json!({"type":"preview", "preview":{
            "source":"blender", "operationId":directory.file_name().unwrap_or_default().to_string_lossy(), "name":self.name,
            "sequence":frame.sequence, "completed":frame.completed, "total":frame.total, "capturedAt":frame.captured_at,
            "image":{"mimeType":"image/png", "data":base64::engine::general_purpose::STANDARD.encode(bytes)}
        }}));
    }
}
