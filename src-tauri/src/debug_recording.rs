//! A long Scene View recording: the WebM the editor streams in chunks, and the
//! activity log written beside it.
//!
//! The short diagnostic clip keeps its frames in memory and hands the whole
//! file over at the end, which is right for fifteen seconds and wrong for a
//! session that runs for hours. Here the editor appends each `MediaRecorder`
//! chunk as it arrives, so memory stays flat however long the recording runs,
//! and the file on disk is complete up to the last chunk even if the app dies.
//!
//! The recording lands in app data, never in the project, for the same reason
//! `save_debug_video` does: a capture is a temporary artifact, and an AI
//! client that starts one must not get to choose where files are written.
//! Only one recording runs at a time.

use crate::debug_recording_log::{
    log_line, recording_directory_name, sanitize_event_name, MAX_EVENT_DATA_BYTES,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// `MediaRecorder` hands over a few seconds of video per chunk. A chunk this
/// large means the caller is not the recorder.
const MAX_CHUNK_BYTES: usize = 64 * 1024 * 1024;
const VIDEO_FILE_NAME: &str = "scene-view.webm";
const LOG_FILE_NAME: &str = "activity.jsonl";

#[derive(Default)]
pub struct DebugRecordingState {
    active: Mutex<Option<ActiveDebugRecording>>,
}

struct ActiveDebugRecording {
    directory: PathBuf,
    video_path: PathBuf,
    log_path: PathBuf,
    video: File,
    log: File,
    started_at_ms: u64,
    started: Instant,
    video_bytes: u64,
    tool_calls: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugRecordingSettings {
    pub fps: u32,
    pub bits_per_second: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugRecordingSession {
    pub directory: String,
    pub video_path: String,
    pub log_path: String,
    pub started_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugRecordingSummary {
    pub directory: String,
    pub video_path: String,
    pub log_path: String,
    pub started_at_ms: u64,
    pub duration_ms: u64,
    pub video_bytes: u64,
    pub tool_calls: u64,
}

fn unix_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("時刻を取得できません: {}", error))
}

fn lock_active(
    state: &DebugRecordingState,
) -> Result<std::sync::MutexGuard<'_, Option<ActiveDebugRecording>>, String> {
    state
        .active
        .lock()
        .map_err(|_| "長期録画の状態を読めません。アプリを再起動してください。".to_string())
}

impl ActiveDebugRecording {
    fn elapsed_seconds(&self) -> f64 {
        self.started.elapsed().as_secs_f64()
    }

    fn append_log(&mut self, event: &str, fields: Map<String, Value>) -> Result<(), String> {
        let line = log_line(unix_millis()?, self.elapsed_seconds(), event, fields);
        self.log
            .write_all(line.as_bytes())
            .and_then(|_| self.log.write_all(b"\n"))
            .map_err(|error| format!("活動ログへ書き込めません: {}", error))
    }
}

/// Starts a recording. Creates `debug-captures/recording-<start>/` with an
/// empty WebM and a log whose first line records the settings.
#[tauri::command]
pub fn begin_debug_recording(
    app: AppHandle,
    state: State<'_, DebugRecordingState>,
    settings: DebugRecordingSettings,
) -> Result<DebugRecordingSession, String> {
    if settings.fps == 0 || settings.fps > 60 {
        return Err("長期録画のフレームレートは1〜60fpsで指定してください。".to_string());
    }
    if settings.bits_per_second < 100_000 || settings.bits_per_second > 50_000_000 {
        return Err("長期録画のビットレートが範囲外です。".to_string());
    }
    let mut active = lock_active(&state)?;
    if active.is_some() {
        return Err("長期録画は同時に1つだけ実行できます。先に停止してください。".to_string());
    }
    let captures = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("長期録画の保存先を確認できません: {}", error))?
        .join("debug-captures");
    let started_at_ms = unix_millis()?;
    let mut directory = captures.join(recording_directory_name(started_at_ms));
    // Two recordings begun within the same second get distinct directories
    // rather than one clobbering the other.
    let mut suffix = 2;
    while directory.exists() {
        directory = captures.join(format!(
            "{}-{}",
            recording_directory_name(started_at_ms),
            suffix
        ));
        suffix += 1;
    }
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("長期録画の保存先を作成できません: {}", error))?;
    let video_path = directory.join(VIDEO_FILE_NAME);
    let log_path = directory.join(LOG_FILE_NAME);
    let video = OpenOptions::new()
        .create_new(true)
        .append(true)
        .open(&video_path)
        .map_err(|error| format!("録画ファイルを作成できません: {}", error))?;
    let log = OpenOptions::new()
        .create_new(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("活動ログを作成できません: {}", error))?;
    let mut recording = ActiveDebugRecording {
        directory: directory.clone(),
        video_path: video_path.clone(),
        log_path: log_path.clone(),
        video,
        log,
        started_at_ms,
        started: Instant::now(),
        video_bytes: 0,
        tool_calls: 0,
    };
    let mut fields = Map::new();
    fields.insert("fps".to_string(), json!(settings.fps));
    fields.insert(
        "bitsPerSecond".to_string(),
        json!(settings.bits_per_second),
    );
    fields.insert("video".to_string(), json!(VIDEO_FILE_NAME));
    recording.append_log("session-begin", fields)?;
    *active = Some(recording);
    Ok(DebugRecordingSession {
        directory: directory.to_string_lossy().to_string(),
        video_path: video_path.to_string_lossy().to_string(),
        log_path: log_path.to_string_lossy().to_string(),
        started_at_ms,
    })
}

/// Appends one `MediaRecorder` chunk. The bytes travel as the raw request
/// body, not JSON, so a chunk is never base64-encoded twice. Returns the
/// total bytes written so far, which the editor shows as the file size.
#[tauri::command]
pub fn append_debug_recording_chunk(
    state: State<'_, DebugRecordingState>,
    request: tauri::ipc::Request<'_>,
) -> Result<u64, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("録画データはバイナリで渡してください。".to_string());
    };
    if bytes.is_empty() {
        return Err("空の録画データは追記できません。".to_string());
    }
    if bytes.len() > MAX_CHUNK_BYTES {
        return Err("録画データの1回分が大きすぎます。".to_string());
    }
    let mut active = lock_active(&state)?;
    let recording = active
        .as_mut()
        .ok_or_else(|| "実行中の長期録画がありません。".to_string())?;
    recording
        .video
        .write_all(bytes)
        .map_err(|error| format!("録画ファイルへ書き込めません: {}", error))?;
    recording.video_bytes += bytes.len() as u64;
    Ok(recording.video_bytes)
}

/// Appends one editor-side event, such as `video-start` when the recorder
/// produced its first frame or `visibility` when the window was hidden.
#[tauri::command]
pub fn append_debug_recording_event(
    state: State<'_, DebugRecordingState>,
    event: String,
    data: Option<Value>,
) -> Result<(), String> {
    let event = sanitize_event_name(&event)
        .ok_or_else(|| "イベント名は英数字、-、_ で指定してください。".to_string())?;
    let fields = match data {
        None | Some(Value::Null) => Map::new(),
        Some(Value::Object(fields)) => {
            let encoded = Value::Object(fields.clone()).to_string();
            if encoded.len() > MAX_EVENT_DATA_BYTES {
                return Err("イベントのデータが大きすぎます。".to_string());
            }
            fields
        }
        Some(_) => return Err("イベントのデータはオブジェクトで渡してください。".to_string()),
    };
    let mut active = lock_active(&state)?;
    let recording = active
        .as_mut()
        .ok_or_else(|| "実行中の長期録画がありません。".to_string())?;
    recording.append_log(event, fields)
}

/// Closes the recording and returns where it landed. The WebM is complete on
/// disk already; this writes the closing log line and releases the files.
#[tauri::command]
pub fn finish_debug_recording(
    state: State<'_, DebugRecordingState>,
) -> Result<DebugRecordingSummary, String> {
    let mut active = lock_active(&state)?;
    let mut recording = active
        .take()
        .ok_or_else(|| "実行中の長期録画がありません。".to_string())?;
    let duration_ms = recording.started.elapsed().as_millis() as u64;
    let mut fields = Map::new();
    fields.insert("durationMs".to_string(), json!(duration_ms));
    fields.insert("videoBytes".to_string(), json!(recording.video_bytes));
    fields.insert("toolCalls".to_string(), json!(recording.tool_calls));
    recording.append_log("session-end", fields)?;
    recording
        .video
        .sync_all()
        .map_err(|error| format!("録画ファイルを閉じられません: {}", error))?;
    recording
        .log
        .sync_all()
        .map_err(|error| format!("活動ログを閉じられません: {}", error))?;
    Ok(DebugRecordingSummary {
        directory: recording.directory.to_string_lossy().to_string(),
        video_path: recording.video_path.to_string_lossy().to_string(),
        log_path: recording.log_path.to_string_lossy().to_string(),
        started_at_ms: recording.started_at_ms,
        duration_ms,
        video_bytes: recording.video_bytes,
        tool_calls: recording.tool_calls,
    })
}

/// Records one MCP tool call while a recording is active. Called by the
/// broker for every call it forwards, so the log needs nothing from the
/// editor's per-tool handlers. Arguments are deliberately not written: they
/// carry paths and prompts, and a log meant to be cut into a video should not
/// need redacting first.
pub fn log_mcp_call(
    app: &AppHandle,
    client_name: &str,
    tool: &str,
    ok: bool,
    error_code: Option<&str>,
    duration_ms: u128,
) {
    let Some(state) = app.try_state::<DebugRecordingState>() else {
        return;
    };
    let Ok(mut active) = state.active.lock() else {
        return;
    };
    let Some(recording) = active.as_mut() else {
        return;
    };
    let mut fields = Map::new();
    fields.insert("client".to_string(), json!(client_name));
    fields.insert("tool".to_string(), json!(tool));
    fields.insert("ok".to_string(), json!(ok));
    if let Some(code) = error_code {
        fields.insert("errorCode".to_string(), json!(code));
    }
    fields.insert("durationMs".to_string(), json!(duration_ms as u64));
    recording.tool_calls += 1;
    if let Err(error) = recording.append_log("tool", fields) {
        eprintln!("XRift Studio debug recording could not log a tool call: {error}");
    }
}
