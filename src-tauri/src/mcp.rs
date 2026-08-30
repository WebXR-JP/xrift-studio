use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Output, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex, Semaphore};

const MCP_SERVER_NAME: &str = "xrift-studio";
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const MCP_RENDEZVOUS_SCHEMA_VERSION: u32 = 1;
const MCP_EVENT_NAME: &str = "xrift-mcp-editor-request";
const MCP_REQUEST_TIMEOUT_SECONDS: u64 = 180;
const MCP_INITIAL_MESSAGE_TIMEOUT_SECONDS: u64 = 5;
const MCP_EDITOR_QUEUE_TIMEOUT_MILLISECONDS: u64 = 2_000;
// WebKit can throttle a background window's JavaScript timers to roughly one
// minute while the user's MCP client is in the foreground. Keep the lease
// comfortably beyond that interval; navigating away still clears it eagerly.
const MCP_EDITOR_HEARTBEAT_TIMEOUT_MILLISECONDS: u64 = 120_000;
const MCP_MAX_CONCURRENT_CONNECTIONS: usize = 32;
const MCP_MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MCP_MAX_CLIENT_NAME_CHARS: usize = 128;
// The allow-list is generated from src/lib/visual-editor/mcp-tool-registry.ts,
// the one place a tool is declared. Rust matches names and forwards; it never
// interprets them, so it has no reason to keep a second copy of the list.
include!("mcp_tool_names.rs");
static MCP_MONOTONIC_START: OnceLock<Instant> = OnceLock::new();

pub struct XriftMcpBrokerState {
    pending: Mutex<HashMap<String, oneshot::Sender<XriftMcpEditorResponse>>>,
    request_lock: Mutex<()>,
    editor_heartbeat: AtomicU64,
    ollama_configuration_active: AtomicBool,
    connections: Semaphore,
}

impl Default for XriftMcpBrokerState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            request_lock: Mutex::new(()),
            editor_heartbeat: AtomicU64::new(0),
            ollama_configuration_active: AtomicBool::new(false),
            connections: Semaphore::new(MCP_MAX_CONCURRENT_CONNECTIONS),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct XriftMcpRendezvous {
    schema_version: u32,
    host: String,
    port: u16,
    token: String,
    pid: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct XriftMcpToolRequest {
    id: String,
    tool: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct XriftMcpBrokerEnvelope {
    token: String,
    client_name: String,
    request: XriftMcpToolRequest,
}

enum LimitedLine {
    Eof,
    Line(Vec<u8>),
    TooLarge,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct XriftMcpEditorRequestEvent {
    id: String,
    client_name: String,
    tool: String,
    arguments: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftMcpEditorError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftMcpEditorResponse {
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<XriftMcpEditorError>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftMcpClientStatus {
    pub id: String,
    pub label: String,
    pub installed: bool,
    pub registered: bool,
    pub needs_update: bool,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftOllamaModelStatus {
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftOllamaStatus {
    pub installed: bool,
    pub server_reachable: bool,
    pub version: Option<String>,
    pub launch_supported: bool,
    pub models: Vec<XriftOllamaModelStatus>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XriftOllamaConfigurationResult {
    pub integration_id: String,
    pub integration_label: String,
    pub model: String,
    pub message: String,
}

struct ClientRegistration {
    registered: bool,
    command: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug)]
enum SupportedMcpClient {
    Codex,
    ClaudeCode,
    ClaudeDesktop,
    OpenCode,
    Cursor,
    Antigravity,
}

impl SupportedMcpClient {
    fn all() -> [Self; 6] {
        [
            Self::Codex,
            Self::ClaudeCode,
            Self::ClaudeDesktop,
            Self::OpenCode,
            Self::Cursor,
            Self::Antigravity,
        ]
    }

    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::ClaudeDesktop => "claude-desktop",
            Self::OpenCode => "opencode",
            Self::Cursor => "cursor",
            Self::Antigravity => "antigravity",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
            Self::ClaudeDesktop => "Claude Desktop / Cowork",
            Self::OpenCode => "OpenCode",
            Self::Cursor => "Cursor",
            Self::Antigravity => "Antigravity",
        }
    }

    fn command_name(self) -> Option<&'static str> {
        match self {
            Self::Codex => Some("codex"),
            Self::ClaudeCode => Some("claude"),
            Self::ClaudeDesktop => None,
            Self::OpenCode => Some("opencode"),
            Self::Cursor => Some("cursor"),
            Self::Antigravity => Some("agy"),
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::all().into_iter().find(|client| client.id() == value)
    }
}

#[derive(Clone, Copy, Debug)]
enum SupportedOllamaIntegration {
    Codex,
    ClaudeCode,
    OpenCode,
}

impl SupportedOllamaIntegration {
    fn all() -> [Self; 3] {
        [Self::Codex, Self::ClaudeCode, Self::OpenCode]
    }

    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::OpenCode => "opencode",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
            Self::OpenCode => "OpenCode",
        }
    }

    fn launch_id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude",
            Self::OpenCode => "opencode",
        }
    }

    fn mcp_client(self) -> SupportedMcpClient {
        match self {
            Self::Codex => SupportedMcpClient::Codex,
            Self::ClaudeCode => SupportedMcpClient::ClaudeCode,
            Self::OpenCode => SupportedMcpClient::OpenCode,
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::all()
            .into_iter()
            .find(|integration| integration.id() == value)
    }
}

pub fn start_broker(app: &AppHandle) -> Result<(), String> {
    let Some(session_token) = create_session_token() else {
        // The AI editor bridge is optional; the editor must still start.
        eprintln!(
            "XRift Studio MCP broker disabled: OS randomness is unavailable, \
             so no session token could be generated."
        );
        return Ok(());
    };
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("AI editor bridgeを開始できません: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("AI editor bridgeを初期化できません: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("AI editor bridgeのportを取得できません: {error}"))?
        .port();
    let rendezvous_path = rendezvous_path(app)?;
    let rendezvous = XriftMcpRendezvous {
        schema_version: MCP_RENDEZVOUS_SCHEMA_VERSION,
        host: "127.0.0.1".to_string(),
        port,
        token: session_token,
        pid: std::process::id(),
    };
    write_private_json(&rendezvous_path, &rendezvous)?;

    let token = rendezvous.token;
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("XRift Studio MCP broker could not start: {error}");
                return;
            }
        };
        loop {
            match listener.accept().await {
                Ok((stream, _address)) => {
                    let app_handle = app_handle.clone();
                    let token = token.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) =
                            handle_broker_connection(app_handle, stream, token).await
                        {
                            eprintln!("XRift Studio MCP broker request failed: {error}");
                        }
                    });
                }
                Err(error) => {
                    eprintln!("XRift Studio MCP broker stopped: {error}");
                    break;
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn complete_xrift_mcp_request(
    state: State<'_, XriftMcpBrokerState>,
    response: XriftMcpEditorResponse,
) -> Result<(), String> {
    let sender = state
        .pending
        .lock()
        .await
        .remove(&response.id)
        .ok_or_else(|| "AI編集requestは完了済みか、時間切れです".to_string())?;
    sender
        .send(response)
        .map_err(|_| "AI editor bridgeへ結果を返せませんでした".to_string())
}

#[tauri::command]
pub fn set_xrift_mcp_editor_ready(state: State<'_, XriftMcpBrokerState>, ready: bool) {
    state.editor_heartbeat.store(
        if ready { mcp_monotonic_tick() } else { 0 },
        Ordering::Release,
    );
}

#[tauri::command]
pub async fn detect_xrift_mcp_clients(app: AppHandle) -> Result<Vec<XriftMcpClientStatus>, String> {
    let expected_sidecar_path = resolve_sidecar_path().ok().and_then(|source| {
        app.path().app_data_dir().ok().and_then(|directory| {
            registration_sidecar_destination(&source, &directory.join("mcp").join("bin")).ok()
        })
    });
    tauri::async_runtime::spawn_blocking(move || {
        SupportedMcpClient::all()
            .into_iter()
            .map(|client| detect_client(client, expected_sidecar_path.as_deref()))
            .collect()
    })
    .await
    .map_err(|error| format!("AI clientの確認に失敗しました: {error}"))
}

#[tauri::command]
pub async fn register_xrift_mcp_client(
    app: AppHandle,
    client_id: String,
) -> Result<XriftMcpClientStatus, String> {
    let client = SupportedMcpClient::parse(&client_id)
        .ok_or_else(|| "対応していないAI clientです".to_string())?;
    let sidecar_source_path = resolve_sidecar_path()?;
    let sidecar_install_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data pathを取得できません: {error}"))?
        .join("mcp")
        .join("bin");
    let rendezvous_path = rendezvous_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if is_managed_config_client(client) && !managed_config_client_installed(client) {
            return Err(format!(
                "{}が見つかりません。先にclientをinstallしてください",
                client.label()
            ));
        }
        let sidecar_path =
            install_registration_sidecar(&sidecar_source_path, &sidecar_install_directory)?;
        if is_managed_config_client(client) {
            let registered_command = managed_config_registration_command(client);
            let updating = registered_command.is_some()
                && (!managed_config_registration_enabled(client)
                    || !registered_command
                        .as_deref()
                        .is_some_and(|command| same_path(command, &sidecar_path)));
            register_managed_config_client(client, &sidecar_path, &rendezvous_path)?;
            return Ok(client_status(
                client,
                true,
                true,
                if updating {
                    "更新しました。再起動してください"
                } else {
                    "登録しました。再起動してください"
                },
            ));
        }
        let executable = find_client_executable(client).ok_or_else(|| {
            format!(
                "{}が見つかりません。先にclientをinstallしてください",
                client.label()
            )
        })?;
        let registration = client_registration(client, &executable);
        if registration.registered
            && registration
                .command
                .as_deref()
                .is_some_and(|command| same_path(command, &sidecar_path))
        {
            return Ok(client_status(client, true, true, "登録済み"));
        }
        let updating = registration.registered;
        if updating && matches!(client, SupportedMcpClient::ClaudeCode) {
            let remove_status = run_client_command(
                &executable,
                &[
                    "mcp".into(),
                    "remove".into(),
                    "--scope".into(),
                    "user".into(),
                    MCP_SERVER_NAME.into(),
                ],
            )
            .map_err(|error| format!("Claude Codeの旧登録を更新できません: {error}"))?;
            if !remove_status.success() {
                return Err("Claude Codeの旧登録を更新できませんでした".to_string());
            }
        }
        let arguments = registration_arguments(client, &sidecar_path, &rendezvous_path)
            .ok_or_else(|| "このAI clientはCLI登録に対応していません".to_string())?;
        let status = run_client_command(&executable, &arguments)
            .map_err(|error| format!("{}への登録を開始できません: {error}", client.label()))?;
        if !status.success() {
            return Err(format!(
                "{}へ登録できませんでした。client側のMCP設定を確認してください",
                client.label()
            ));
        }
        Ok(client_status(
            client,
            true,
            true,
            if updating {
                "更新しました"
            } else {
                "登録しました"
            },
        ))
    })
    .await
    .map_err(|error| format!("AI clientへの登録に失敗しました: {error}"))?
}

#[tauri::command]
pub async fn detect_xrift_ollama() -> Result<XriftOllamaStatus, String> {
    tauri::async_runtime::spawn_blocking(detect_ollama)
        .await
        .map_err(|error| format!("Ollamaの確認に失敗しました: {error}"))
}

#[tauri::command]
pub async fn configure_xrift_ollama(
    state: State<'_, XriftMcpBrokerState>,
    integration_id: String,
    model: String,
) -> Result<XriftOllamaConfigurationResult, String> {
    let integration = SupportedOllamaIntegration::parse(&integration_id)
        .ok_or_else(|| "Ollamaで構成できないAI clientです".to_string())?;
    if state
        .ollama_configuration_active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("別のOllama構成を実行中です。完了後に再試行してください".to_string());
    }

    let task = tauri::async_runtime::spawn_blocking(move || {
        configure_ollama_integration(integration, &model)
    })
    .await;
    state
        .ollama_configuration_active
        .store(false, Ordering::Release);

    task.map_err(|error| format!("Ollama構成の実行に失敗しました: {error}"))?
}

fn registration_arguments(
    client: SupportedMcpClient,
    sidecar_path: &Path,
    rendezvous_path: &Path,
) -> Option<Vec<String>> {
    let mut arguments: Vec<String> = match client {
        SupportedMcpClient::Codex => vec![
            "mcp".into(),
            "add".into(),
            MCP_SERVER_NAME.into(),
            "--".into(),
        ],
        SupportedMcpClient::ClaudeCode => vec![
            "mcp".into(),
            "add".into(),
            "--scope".into(),
            "user".into(),
            MCP_SERVER_NAME.into(),
            // Claude Code parses subprocess flags as its own options unless
            // the command is introduced by the explicit stdio separator.
            "--".into(),
        ],
        SupportedMcpClient::ClaudeDesktop
        | SupportedMcpClient::OpenCode
        | SupportedMcpClient::Cursor
        | SupportedMcpClient::Antigravity => return None,
    };
    arguments.push(sidecar_path.to_string_lossy().into_owned());
    arguments.push("--rendezvous".into());
    arguments.push(rendezvous_path.to_string_lossy().into_owned());
    Some(arguments)
}

async fn handle_broker_connection(
    app: AppHandle,
    stream: TcpStream,
    expected_token: String,
) -> Result<(), String> {
    let state = app.state::<XriftMcpBrokerState>();
    let _connection_permit = state
        .connections
        .try_acquire()
        .map_err(|_| "AI editor bridgeの同時接続数が上限に達しました".to_string())?;
    let (reader, mut writer) = stream.into_split();
    let reader = tokio::io::BufReader::new(reader);
    let mut line = String::new();
    let bytes = tokio::time::timeout(
        Duration::from_secs(MCP_INITIAL_MESSAGE_TIMEOUT_SECONDS),
        reader
            .take((MCP_MAX_MESSAGE_BYTES + 1) as u64)
            .read_line(&mut line),
    )
    .await
    .map_err(|_| "AI editor bridge requestの受信が時間切れです".to_string())?
    .map_err(|error| error.to_string())?;
    if bytes == 0 || bytes > MCP_MAX_MESSAGE_BYTES {
        return Err("AI editor bridge requestのsizeが不正です".to_string());
    }
    let envelope: XriftMcpBrokerEnvelope = serde_json::from_str(&line)
        .map_err(|_| "AI editor bridge requestが不正です".to_string())?;
    if envelope.token != expected_token {
        return write_broker_error(
            &mut writer,
            envelope.request.id,
            "UNAUTHORIZED",
            "AI editor bridgeの認証に失敗しました",
        )
        .await;
    }
    if !MCP_TOOL_NAMES.contains(&envelope.request.tool.as_str()) {
        return write_broker_error(
            &mut writer,
            envelope.request.id,
            "TOOL_NOT_FOUND",
            "対応していないAI editor toolです",
        )
        .await;
    }

    if !editor_heartbeat_is_fresh(
        state.editor_heartbeat.load(Ordering::Acquire),
        mcp_monotonic_tick(),
    ) {
        state.editor_heartbeat.store(0, Ordering::Release);
        return write_broker_error(
            &mut writer,
            envelope.request.id,
            "EDITOR_UNAVAILABLE",
            "Visual EditorでProjectを開いてから再試行してください",
        )
        .await;
    }
    let _request_guard = match tokio::time::timeout(
        Duration::from_millis(MCP_EDITOR_QUEUE_TIMEOUT_MILLISECONDS),
        state.request_lock.lock(),
    )
    .await
    {
        Ok(guard) => guard,
        Err(_) => {
            return write_broker_error(
                &mut writer,
                envelope.request.id,
                "EDITOR_BUSY",
                "別のAI編集を処理中です。少し待ってから最新contextを取得してください",
            )
            .await;
        }
    };
    let (sender, receiver) = oneshot::channel();
    let request_id = envelope.request.id.clone();
    state
        .pending
        .lock()
        .await
        .insert(request_id.clone(), sender);
    let event = XriftMcpEditorRequestEvent {
        id: request_id.clone(),
        client_name: envelope.client_name,
        tool: envelope.request.tool,
        arguments: envelope.request.arguments,
    };
    let emit_result = app
        .get_webview_window("main")
        .ok_or_else(|| "main Editor windowが見つかりません".to_string())?
        .emit(MCP_EVENT_NAME, event);
    if let Err(error) = emit_result {
        state.pending.lock().await.remove(&request_id);
        return write_broker_error(
            &mut writer,
            request_id,
            "EDITOR_UNAVAILABLE",
            &format!("Editorへrequestを渡せません: {error}"),
        )
        .await;
    }
    let response = match tokio::time::timeout(
        std::time::Duration::from_secs(MCP_REQUEST_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    {
        Ok(Ok(response)) => response,
        Ok(Err(_)) => XriftMcpEditorResponse {
            id: request_id.clone(),
            ok: false,
            result: None,
            error: Some(editor_error(
                "EDITOR_UNAVAILABLE",
                "Editorがrequestを完了できませんでした",
            )),
        },
        Err(_) => {
            state.pending.lock().await.remove(&request_id);
            state.editor_heartbeat.store(0, Ordering::Release);
            XriftMcpEditorResponse {
                id: request_id,
                ok: false,
                result: None,
                error: Some(editor_error(
                    "EDITOR_TIMEOUT",
                    "Editorの応答が時間内に完了しませんでした",
                )),
            }
        }
    };
    let payload = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
    if payload.len() > MCP_MAX_MESSAGE_BYTES {
        return write_broker_error(
            &mut writer,
            response.id,
            "RESPONSE_TOO_LARGE",
            "Editorの応答がsize上限を超えました",
        )
        .await;
    }
    writer
        .write_all(&payload)
        .await
        .map_err(|error| error.to_string())?;
    writer
        .write_all(b"\n")
        .await
        .map_err(|error| error.to_string())
}

async fn write_broker_error(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    id: String,
    code: &str,
    message: &str,
) -> Result<(), String> {
    let response = XriftMcpEditorResponse {
        id,
        ok: false,
        result: None,
        error: Some(editor_error(code, message)),
    };
    let payload = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
    writer
        .write_all(&payload)
        .await
        .map_err(|error| error.to_string())?;
    writer
        .write_all(b"\n")
        .await
        .map_err(|error| error.to_string())
}

fn editor_error(code: &str, message: &str) -> XriftMcpEditorError {
    XriftMcpEditorError {
        code: code.to_string(),
        message: message.to_string(),
        details: None,
    }
}

fn mcp_monotonic_tick() -> u64 {
    let started_at = MCP_MONOTONIC_START.get_or_init(Instant::now);
    u64::try_from(started_at.elapsed().as_millis())
        .unwrap_or(u64::MAX - 1)
        .saturating_add(1)
}

fn editor_heartbeat_is_fresh(last_heartbeat: u64, now: u64) -> bool {
    last_heartbeat > 0
        && now.saturating_sub(last_heartbeat) <= MCP_EDITOR_HEARTBEAT_TIMEOUT_MILLISECONDS
}

/// Returns `None` when OS randomness is unavailable.
///
/// This token is the only authentication on the loopback broker, so there is no
/// acceptable derived fallback: pid/port/clock inputs are all observable by a
/// local attacker. The caller skips the broker entirely instead, which leaves
/// the editor itself fully usable.
fn create_session_token() -> Option<String> {
    let mut random = [0_u8; 32];
    if getrandom::fill(&mut random).is_ok() {
        return Some(bytes_to_hex(&random));
    }
    None
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn rendezvous_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data pathを取得できません: {error}"))?;
    Ok(root.join("mcp").join("rendezvous.json"))
}

fn write_private_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "AI editor bridgeの保存先が不正です".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let payload = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    write_private_bytes(path, &payload)
}

fn write_private_bytes(path: &Path, payload: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut options = std::fs::OpenOptions::new();
        options.create(true).truncate(true).write(true).mode(0o600);
        let mut file = options.open(path).map_err(|error| error.to_string())?;
        file.write_all(&payload)
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    std::fs::write(path, payload).map_err(|error| error.to_string())?;
    Ok(())
}

fn detect_client(
    client: SupportedMcpClient,
    expected_sidecar_path: Option<&Path>,
) -> XriftMcpClientStatus {
    if is_managed_config_client(client) {
        if !managed_config_client_installed(client) {
            return client_status(client, false, false, "未検出");
        }
        let registered_command = managed_config_registration_command(client);
        let registered = registered_command.is_some();
        let needs_update = registered
            && (!managed_config_registration_enabled(client)
                || expected_sidecar_path.is_some_and(|expected| {
                    !expected.is_file()
                        || !registered_command
                            .as_deref()
                            .is_some_and(|command| same_path(command, expected))
                }));
        if needs_update {
            return client_update_status(client);
        }
        return client_status(
            client,
            true,
            registered,
            if registered {
                "登録済み"
            } else {
                "登録できます"
            },
        );
    }
    let Some(executable) = find_client_executable(client) else {
        return client_status(client, false, false, "未検出");
    };
    let registration = client_registration(client, &executable);
    let needs_update = registration.registered
        && expected_sidecar_path.is_some_and(|expected| {
            !expected.is_file()
                || !registration
                    .command
                    .as_deref()
                    .is_some_and(|command| same_path(command, expected))
        });
    if needs_update {
        return client_update_status(client);
    }
    client_status(
        client,
        true,
        registration.registered,
        if registration.registered {
            "登録済み"
        } else {
            "登録できます"
        },
    )
}

fn client_status(
    client: SupportedMcpClient,
    installed: bool,
    registered: bool,
    message: &str,
) -> XriftMcpClientStatus {
    XriftMcpClientStatus {
        id: client.id().to_string(),
        label: client.label().to_string(),
        installed,
        registered,
        needs_update: false,
        message: message.to_string(),
    }
}

fn client_update_status(client: SupportedMcpClient) -> XriftMcpClientStatus {
    XriftMcpClientStatus {
        id: client.id().to_string(),
        label: client.label().to_string(),
        installed: true,
        registered: true,
        needs_update: true,
        message: "MCP serverを更新できます".to_string(),
    }
}

fn client_registration(client: SupportedMcpClient, executable: &Path) -> ClientRegistration {
    if !matches!(
        client,
        SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode
    ) {
        return ClientRegistration {
            registered: false,
            command: None,
        };
    }
    match run_client_command_output(
        executable,
        &["mcp".into(), "get".into(), MCP_SERVER_NAME.into()],
    ) {
        Ok(output) if output.status.success() => ClientRegistration {
            registered: true,
            command: parse_registered_command(&output.stdout),
        },
        _ => ClientRegistration {
            registered: false,
            command: None,
        },
    }
}

fn find_client_executable(client: SupportedMcpClient) -> Option<PathBuf> {
    if matches!(client, SupportedMcpClient::Codex) {
        return find_codex_executable();
    }
    client.command_name().and_then(find_command_on_path)
}

fn find_codex_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("CODEX_CLI_PATH") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(executable) = find_command_on_path("codex") {
        candidates.push(executable);
    }

    #[cfg(windows)]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            candidates.extend(windows_codex_local_app_data_candidates(&local_app_data));
        }
        if let Some(app_data) = std::env::var_os("APPDATA").map(PathBuf::from) {
            candidates.extend(command_candidates(&app_data.join("npm"), "codex"));
        }
        if let Some(home) = dirs::home_dir() {
            candidates.push(
                home.join(".codex")
                    .join("packages")
                    .join("standalone")
                    .join("current")
                    .join("bin")
                    .join("codex.exe"),
            );
        }
    }

    #[cfg(not(windows))]
    {
        if let Some(home) = dirs::home_dir() {
            candidates.extend([
                home.join(".local").join("bin").join("codex"),
                home.join(".codex").join("bin").join("codex"),
                home.join(".npm-global").join("bin").join("codex"),
                home.join(".local").join("share").join("pnpm").join("codex"),
                home.join(".bun").join("bin").join("codex"),
            ]);
        }
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/codex"),
            PathBuf::from("/usr/local/bin/codex"),
            PathBuf::from("/home/linuxbrew/.linuxbrew/bin/codex"),
        ]);
    }

    for variable in ["NPM_CONFIG_PREFIX", "PNPM_HOME", "BUN_INSTALL"] {
        let Some(root) = std::env::var_os(variable).map(PathBuf::from) else {
            continue;
        };
        #[cfg(windows)]
        candidates.extend(command_candidates(&root, "codex"));
        #[cfg(not(windows))]
        {
            candidates.push(root.join("codex"));
            candidates.push(root.join("bin").join("codex"));
        }
    }

    select_codex_candidate(candidates, |candidate| {
        candidate.is_file()
            && run_client_command_output(candidate, &["--version".into()])
                .is_ok_and(|output| output.status.success())
    })
}

fn select_codex_candidate(
    candidates: impl IntoIterator<Item = PathBuf>,
    is_usable: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    candidates
        .into_iter()
        .find(|candidate| is_usable(candidate))
}

#[cfg(windows)]
fn windows_codex_local_app_data_candidates(local_app_data: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![local_app_data
        .join("Programs")
        .join("OpenAI")
        .join("Codex")
        .join("bin")
        .join("codex.exe")];
    candidates.extend(command_candidates(&local_app_data.join("pnpm"), "codex"));
    let winget_links = local_app_data
        .join("Microsoft")
        .join("WinGet")
        .join("Links");
    candidates.extend(command_candidates(&winget_links, "codex"));
    candidates.extend(find_target_suffixed_codex_commands(&winget_links));
    candidates
}

#[cfg(windows)]
fn command_candidates(directory: &Path, command_name: &str) -> Vec<PathBuf> {
    ["cmd", "bat", "exe"]
        .into_iter()
        .map(|extension| directory.join(format!("{command_name}.{extension}")))
        .collect()
}

#[cfg(windows)]
fn find_target_suffixed_codex_commands(directory: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut candidates: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            let Some(file_name) = path.file_name().and_then(OsStr::to_str) else {
                return false;
            };
            let normalized = file_name.to_ascii_lowercase();
            normalized.starts_with("codex-")
                && (normalized.ends_with(".exe")
                    || normalized.ends_with(".cmd")
                    || normalized.ends_with(".bat"))
                && path.is_file()
        })
        .collect();
    candidates.sort();
    candidates
}

fn is_managed_config_client(client: SupportedMcpClient) -> bool {
    matches!(
        client,
        SupportedMcpClient::ClaudeDesktop
            | SupportedMcpClient::OpenCode
            | SupportedMcpClient::Cursor
            | SupportedMcpClient::Antigravity
    )
}

fn managed_config_path(client: SupportedMcpClient) -> Option<PathBuf> {
    match client {
        SupportedMcpClient::ClaudeDesktop => claude_desktop_config_path(),
        SupportedMcpClient::OpenCode => opencode_config_path(),
        SupportedMcpClient::Cursor => cursor_config_path(),
        SupportedMcpClient::Antigravity => antigravity_config_path(),
        SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode => None,
    }
}

fn managed_config_client_installed(client: SupportedMcpClient) -> bool {
    let Some(config_path) = managed_config_path(client) else {
        return false;
    };
    let config_location_exists =
        config_path.is_file() || config_path.parent().is_some_and(Path::is_dir);
    let gemini_root_exists = matches!(client, SupportedMcpClient::Antigravity)
        && dirs::home_dir().is_some_and(|home| home.join(".gemini").is_dir());
    config_location_exists || gemini_root_exists || find_client_executable(client).is_some()
}

fn claude_desktop_config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|directory| directory.join("Claude").join("claude_desktop_config.json"))
}

fn opencode_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|directory| {
        directory
            .join(".config")
            .join("opencode")
            .join("opencode.json")
    })
}

fn cursor_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|directory| directory.join(".cursor").join("mcp.json"))
}

fn antigravity_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|directory| {
        directory
            .join(".gemini")
            .join("config")
            .join("mcp_config.json")
    })
}

fn managed_config_registration_command(client: SupportedMcpClient) -> Option<PathBuf> {
    let config_path = managed_config_path(client)?;
    let config = read_json_file(&config_path).ok().flatten()?;
    match client {
        SupportedMcpClient::ClaudeDesktop
        | SupportedMcpClient::Cursor
        | SupportedMcpClient::Antigravity => config
            .get("mcpServers")
            .and_then(Value::as_object)
            .and_then(|servers| servers.get(MCP_SERVER_NAME))
            .and_then(Value::as_object)
            .and_then(|server| server.get("command"))
            .and_then(Value::as_str)
            .map(PathBuf::from),
        SupportedMcpClient::OpenCode => config
            .get("mcp")
            .and_then(Value::as_object)
            .and_then(|servers| servers.get(MCP_SERVER_NAME))
            .and_then(Value::as_object)
            .and_then(|server| server.get("command"))
            .and_then(Value::as_array)
            .and_then(|command| command.first())
            .and_then(Value::as_str)
            .map(PathBuf::from),
        SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode => None,
    }
}

fn managed_config_registration_enabled(client: SupportedMcpClient) -> bool {
    if !matches!(client, SupportedMcpClient::OpenCode) {
        return true;
    }
    let Some(config_path) = managed_config_path(client) else {
        return false;
    };
    let Some(server) = read_json_file(&config_path)
        .ok()
        .flatten()
        .and_then(|config| {
            config
                .get("mcp")
                .and_then(Value::as_object)
                .and_then(|servers| servers.get(MCP_SERVER_NAME))
                .and_then(Value::as_object)
                .cloned()
        })
    else {
        return true;
    };
    server.get("type").and_then(Value::as_str) == Some("local")
        && server
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
}

fn register_managed_config_client(
    client: SupportedMcpClient,
    sidecar_path: &Path,
    rendezvous_path: &Path,
) -> Result<(), String> {
    let config_path = managed_config_path(client)
        .ok_or_else(|| format!("{}の設定先を取得できません", client.label()))?;
    let config_directory = config_path
        .parent()
        .ok_or_else(|| format!("{}の設定先が不正です", client.label()))?;
    if matches!(client, SupportedMcpClient::ClaudeDesktop) && !config_directory.is_dir() {
        return Err(
            "Claude Desktopが見つかりません。先にClaude Desktopを起動してください".to_string(),
        );
    }
    std::fs::create_dir_all(config_directory)
        .map_err(|_| format!("{}の設定先を作成できません", client.label()))?;

    let original = if config_path.is_file() {
        let metadata = std::fs::metadata(&config_path).map_err(|error| error.to_string())?;
        if metadata.len() > MCP_MAX_MESSAGE_BYTES as u64 {
            return Err(format!("{}の設定fileが大きすぎます", client.label()));
        }
        Some(std::fs::read(&config_path).map_err(|error| error.to_string())?)
    } else {
        None
    };
    let config = match original.as_deref() {
        Some(bytes) if !bytes.is_empty() => serde_json::from_slice(bytes)
            .map_err(|_| format!("{}のMCP設定がJSONとして不正です", client.label()))?,
        _ => json!({}),
    };
    let config = match client {
        SupportedMcpClient::ClaudeDesktop
        | SupportedMcpClient::Cursor
        | SupportedMcpClient::Antigravity => {
            merge_mcp_servers_config(config, sidecar_path, rendezvous_path, client.label())?
        }
        SupportedMcpClient::OpenCode => {
            merge_opencode_config(config, sidecar_path, rendezvous_path)?
        }
        SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode => {
            return Err("このAI clientは設定file登録に対応していません".to_string());
        }
    };

    if let Some(bytes) = original.as_deref() {
        write_config_backup(&config_path, bytes, client.label())?;
    }
    let mut payload = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
    payload.push(b'\n');
    write_private_bytes(&config_path, &payload)
        .map_err(|_| format!("{}のMCP設定を保存できませんでした", client.label()))
}

fn read_json_file(path: &Path) -> Result<Option<Value>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MCP_MAX_MESSAGE_BYTES as u64 {
        return Err("MCP設定fileが大きすぎます".to_string());
    }
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Ok(Some(json!({})));
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn merge_mcp_servers_config(
    mut config: Value,
    sidecar_path: &Path,
    rendezvous_path: &Path,
    client_label: &str,
) -> Result<Value, String> {
    let root = config
        .as_object_mut()
        .ok_or_else(|| format!("{client_label}のMCP設定rootがobjectではありません"))?;
    if !root.contains_key("mcpServers") {
        root.insert("mcpServers".to_string(), json!({}));
    }
    let servers = root
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| format!("{client_label}のmcpServers設定がobjectではありません"))?;
    servers.insert(
        MCP_SERVER_NAME.to_string(),
        json!({
            "command": sidecar_path.to_string_lossy(),
            "args": ["--rendezvous", rendezvous_path.to_string_lossy()],
        }),
    );
    Ok(config)
}

fn merge_opencode_config(
    mut config: Value,
    sidecar_path: &Path,
    rendezvous_path: &Path,
) -> Result<Value, String> {
    let root = config
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのMCP設定rootがobjectではありません".to_string())?;
    if !root.contains_key("mcp") {
        root.insert("mcp".to_string(), json!({}));
    }
    let servers = root
        .get_mut("mcp")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "OpenCodeのmcp設定がobjectではありません".to_string())?;
    servers.insert(
        MCP_SERVER_NAME.to_string(),
        json!({
            "type": "local",
            "command": [
                sidecar_path.to_string_lossy(),
                "--rendezvous",
                rendezvous_path.to_string_lossy()
            ],
            "enabled": true,
        }),
    );
    Ok(config)
}

fn merge_opencode_ollama_config(mut config: Value, model: &str) -> Result<Value, String> {
    let root = config
        .as_object_mut()
        .ok_or_else(|| "OpenCodeの設定rootがobjectではありません".to_string())?;
    root.insert("model".to_string(), json!(format!("ollama/{model}")));

    let provider = root
        .entry("provider")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのprovider設定がobjectではありません".to_string())?;
    let ollama = provider
        .entry("ollama")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのOllama provider設定がobjectではありません".to_string())?;

    ollama.insert("npm".to_string(), json!("@ai-sdk/openai-compatible"));
    ollama.insert("name".to_string(), json!("Ollama"));
    let options = ollama
        .entry("options")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのOllama options設定がobjectではありません".to_string())?;
    options.insert("baseURL".to_string(), json!("http://127.0.0.1:11434/v1"));
    let models = ollama
        .entry("models")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのOllama models設定がobjectではありません".to_string())?;
    let model_config = models
        .entry(model.to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "OpenCodeのOllama model設定がobjectではありません".to_string())?;
    model_config.insert("name".to_string(), json!(model));

    Ok(config)
}

fn write_config_backup(
    config_path: &Path,
    payload: &[u8],
    client_label: &str,
) -> Result<(), String> {
    let file_name = config_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| format!("{client_label}の設定file名が不正です"))?;
    let backup_path = config_path.with_file_name(format!("{file_name}.xrift-studio.backup"));
    let mut options = std::fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(backup_path) {
        Ok(mut file) => file.write_all(payload).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.to_string()),
    }
    .map_err(|_| format!("{client_label}設定のbackupを作成できませんでした"))
}

fn install_registration_sidecar(source: &Path, directory: &Path) -> Result<PathBuf, String> {
    let payload = std::fs::read(source)
        .map_err(|_| "XRift Studio MCP serverを読み込めませんでした".to_string())?;
    let destination = registration_sidecar_destination_for_payload(&payload, directory);
    std::fs::create_dir_all(directory)
        .map_err(|_| "MCP serverのinstall先を作成できませんでした".to_string())?;

    if destination.is_file() {
        let installed = std::fs::read(&destination)
            .map_err(|_| "install済みMCP serverを確認できませんでした".to_string())?;
        if installed != payload {
            return Err("install済みMCP serverの内容を確認できませんでした".to_string());
        }
    } else {
        let mut options = std::fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o700);
        }
        let mut file = options
            .open(&destination)
            .map_err(|_| "MCP serverをinstallできませんでした".to_string())?;
        file.write_all(&payload)
            .map_err(|_| "MCP serverをinstallできませんでした".to_string())?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&destination, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "MCP serverの実行権限を設定できませんでした".to_string())?;
    }

    destination
        .canonicalize()
        .map_err(|_| "installしたMCP serverを確認できませんでした".to_string())
}

fn registration_sidecar_destination(source: &Path, directory: &Path) -> Result<PathBuf, String> {
    let payload = std::fs::read(source)
        .map_err(|_| "XRift Studio MCP serverを読み込めませんでした".to_string())?;
    Ok(registration_sidecar_destination_for_payload(
        &payload, directory,
    ))
}

fn registration_sidecar_destination_for_payload(payload: &[u8], directory: &Path) -> PathBuf {
    let digest = Sha256::digest(payload);
    let digest = format!("{digest:x}");
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    directory.join(format!("xrift-studio-mcp-{}{suffix}", &digest[..12]))
}

fn detect_ollama() -> XriftOllamaStatus {
    let Some(executable) = find_ollama_executable() else {
        return XriftOllamaStatus {
            installed: false,
            server_reachable: false,
            version: None,
            launch_supported: false,
            models: Vec::new(),
            message: "未検出".to_string(),
        };
    };

    let version = run_ollama_command_output(&executable, &["--version".into()])
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| parse_ollama_version(&output.stdout));
    let launch_supported =
        run_ollama_command_output(&executable, &["launch".into(), "--help".into()])
            .is_ok_and(|output| output.status.success());
    let list_output = run_ollama_command_output(&executable, &["list".into()]).ok();
    let server_reachable = list_output
        .as_ref()
        .is_some_and(|output| output.status.success());
    let models = list_output
        .as_ref()
        .filter(|output| output.status.success())
        .map(|output| parse_ollama_models(&output.stdout))
        .unwrap_or_default();
    let message = if !launch_supported {
        "更新するとAI clientを構成できます"
    } else if !server_reachable {
        "Ollamaはinstall済みですが起動していません"
    } else if models.is_empty() {
        "Ollamaを起動し、modelを追加してください"
    } else {
        "ローカルmodelを利用できます"
    };

    XriftOllamaStatus {
        installed: true,
        server_reachable,
        version,
        launch_supported,
        models: models
            .into_iter()
            .map(|name| XriftOllamaModelStatus { name })
            .collect(),
        message: message.to_string(),
    }
}

fn configure_ollama_integration(
    integration: SupportedOllamaIntegration,
    model: &str,
) -> Result<XriftOllamaConfigurationResult, String> {
    let executable = find_ollama_executable()
        .ok_or_else(|| "Ollamaが見つかりません。先にOllamaをinstallしてください".to_string())?;
    if !ollama_integration_client_available(integration) {
        return Err(format!(
            "{}が見つかりません。先にclientをinstallしてください",
            integration.label()
        ));
    }
    let list_output =
        run_ollama_command_output(&executable, &["list".into()]).map_err(|error| {
            format!("Ollamaへ接続できません。Ollamaを起動して再試行してください: {error}")
        })?;
    if !list_output.status.success() {
        return Err(command_failure_message(
            "Ollamaへ接続できません。Ollamaを起動して再試行してください",
            &list_output,
        ));
    }
    let models = parse_ollama_models(&list_output.stdout);
    if model.is_empty() || !models.iter().any(|candidate| candidate == model) {
        return Err("選択したOllama modelが見つかりません。再検出してください".to_string());
    }
    let show_output = run_ollama_command_output(&executable, &["show".into(), model.into()])
        .map_err(|error| format!("Ollama modelの機能を確認できませんでした: {error}"))?;
    if !show_output.status.success() {
        return Err(command_failure_message(
            "Ollama modelの機能を確認できませんでした",
            &show_output,
        ));
    }
    if !ollama_model_supports_tools(&show_output.stdout) {
        return Err(
            "このOllama modelはtool callingに対応していません。別のmodelを選んでください"
                .to_string(),
        );
    }

    // `ollama launch <integration> --config` enters Ollama's interactive model
    // selector even when `--model` and `--yes` are supplied. The Tauri command
    // has no interactive terminal, so configure OpenCode through its documented
    // JSON provider format instead of starting the client or invoking the TUI.
    if matches!(integration, SupportedOllamaIntegration::OpenCode) {
        return configure_opencode_ollama(model);
    }

    let arguments = ollama_configuration_arguments(integration, model);
    let output = run_ollama_command_output(&executable, &arguments)
        .map_err(|error| format!("Ollamaのclient構成を完了できません: {error}"))?;
    if !output.status.success() {
        return Err(command_failure_message(
            &format!(
                "Ollamaで{}を構成できませんでした。client側のmodel設定を確認してください",
                integration.label()
            ),
            &output,
        ));
    }

    Ok(XriftOllamaConfigurationResult {
        integration_id: integration.id().to_string(),
        integration_label: integration.label().to_string(),
        model: model.to_string(),
        message: "構成しました。clientを起動または再起動してください".to_string(),
    })
}

fn configure_opencode_ollama(model: &str) -> Result<XriftOllamaConfigurationResult, String> {
    let config_path =
        opencode_config_path().ok_or_else(|| "OpenCodeの設定先を取得できません".to_string())?;
    let config_directory = config_path
        .parent()
        .ok_or_else(|| "OpenCodeの設定先が不正です".to_string())?;
    std::fs::create_dir_all(config_directory)
        .map_err(|_| "OpenCodeの設定先を作成できません".to_string())?;

    let original = if config_path.is_file() {
        let metadata = std::fs::metadata(&config_path).map_err(|error| error.to_string())?;
        if metadata.len() > MCP_MAX_MESSAGE_BYTES as u64 {
            return Err("OpenCodeの設定fileが大きすぎます".to_string());
        }
        Some(std::fs::read(&config_path).map_err(|error| error.to_string())?)
    } else {
        None
    };
    let config = read_json_file(&config_path)?.unwrap_or_else(|| json!({}));
    let config = merge_opencode_ollama_config(config, model)?;

    if let Some(bytes) = original.as_deref() {
        write_config_backup(&config_path, bytes, "OpenCode")?;
    }
    let mut payload = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
    payload.push(b'\n');
    write_private_bytes(&config_path, &payload)
        .map_err(|_| "OpenCodeのOllama設定を保存できませんでした".to_string())?;

    Ok(XriftOllamaConfigurationResult {
        integration_id: SupportedOllamaIntegration::OpenCode.id().to_string(),
        integration_label: SupportedOllamaIntegration::OpenCode.label().to_string(),
        model: model.to_string(),
        message: "構成しました。OpenCodeを再起動してください".to_string(),
    })
}

fn ollama_integration_client_available(integration: SupportedOllamaIntegration) -> bool {
    let client = integration.mcp_client();
    if is_managed_config_client(client) {
        managed_config_client_installed(client)
    } else {
        find_client_executable(client).is_some()
    }
}

fn command_failure_message(prefix: &str, output: &Output) -> String {
    match command_output_detail(output) {
        Some(detail) => format!("{prefix}: {detail}"),
        None => prefix.to_string(),
    }
}

fn command_output_detail(output: &Output) -> Option<String> {
    let mut lines = Vec::new();
    for bytes in [output.stderr.as_slice(), output.stdout.as_slice()] {
        for line in String::from_utf8_lossy(bytes).lines() {
            let line = line.trim();
            if !line.is_empty() {
                lines.push(line.to_string());
            }
            if lines.len() == 2 {
                break;
            }
        }
        if lines.len() == 2 {
            break;
        }
    }
    if lines.is_empty() {
        return None;
    }
    Some(lines.join(" ").chars().take(240).collect::<String>())
}

fn ollama_configuration_arguments(
    integration: SupportedOllamaIntegration,
    model: &str,
) -> Vec<String> {
    vec![
        "launch".into(),
        integration.launch_id().into(),
        "--model".into(),
        model.into(),
        "--config".into(),
        "--yes".into(),
    ]
}

fn parse_ollama_version(stdout: &[u8]) -> Option<String> {
    String::from_utf8_lossy(stdout)
        .split_whitespace()
        .rev()
        .find(|value| {
            value
                .chars()
                .next()
                .is_some_and(|first| first.is_ascii_digit())
        })
        .map(|value| value.trim_start_matches('v').to_string())
}

fn parse_ollama_models(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .filter(|name| !name.eq_ignore_ascii_case("name"))
        .map(str::to_string)
        .collect()
}

fn ollama_model_supports_tools(stdout: &[u8]) -> bool {
    let output = String::from_utf8_lossy(stdout);
    let mut capabilities = false;
    for line in output.lines() {
        let value = line.trim();
        if value.eq_ignore_ascii_case("Capabilities") {
            capabilities = true;
            continue;
        }
        if capabilities && value.is_empty() {
            break;
        }
        if capabilities && value.eq_ignore_ascii_case("tools") {
            return true;
        }
    }
    false
}

fn find_ollama_executable() -> Option<PathBuf> {
    if let Some(executable) = find_command_on_path("ollama") {
        return Some(executable);
    }
    #[cfg(windows)]
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let executable = PathBuf::from(local_app_data)
            .join("Programs")
            .join("Ollama")
            .join("ollama.exe");
        if executable.is_file() {
            return Some(executable);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let executable = PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama");
        if executable.is_file() {
            return Some(executable);
        }
    }
    None
}

fn run_ollama_command_output(executable: &Path, arguments: &[String]) -> Result<Output, String> {
    let mut command = ollama_command(executable, arguments);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let status = wait_for_client_command_status(&mut child)?;
    let mut stdout = Vec::new();
    if let Some(mut pipe) = child.stdout.take() {
        pipe.read_to_end(&mut stdout)
            .map_err(|error| error.to_string())?;
    }
    let mut stderr = Vec::new();
    if let Some(mut pipe) = child.stderr.take() {
        pipe.read_to_end(&mut stderr)
            .map_err(|error| error.to_string())?;
    }
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

fn ollama_command(executable: &Path, arguments: &[String]) -> Command {
    let mut command = client_command(executable, arguments);
    command.env("OLLAMA_HOST", "127.0.0.1:11434");
    command
}

fn find_command_on_path(command_name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let directories: Vec<PathBuf> = std::env::split_paths(&path).collect();
    #[cfg(windows)]
    // Package-manager shims are the supported CLI entry points. A WindowsApps
    // executable can exist on PATH while rejecting direct CreateProcess calls.
    let extensions = ["cmd", "bat", "exe"];
    #[cfg(not(windows))]
    let extensions = [""];

    for extension in extensions {
        for directory in &directories {
            let file_name = if extension.is_empty() {
                command_name.to_string()
            } else {
                format!("{command_name}.{extension}")
            };
            let candidate = directory.join(file_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn run_client_command(executable: &Path, arguments: &[String]) -> Result<ExitStatus, String> {
    let mut command = client_command(executable, arguments);
    command.stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn().map_err(|error| error.to_string())?;
    wait_for_client_command(child)
}

fn run_client_command_output(executable: &Path, arguments: &[String]) -> Result<Output, String> {
    let mut command = client_command(executable, arguments);
    command.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let status = wait_for_client_command_status(&mut child)?;
    let mut stdout = Vec::new();
    if let Some(mut pipe) = child.stdout.take() {
        pipe.read_to_end(&mut stdout)
            .map_err(|error| error.to_string())?;
    }
    Ok(Output {
        status,
        stdout,
        stderr: Vec::new(),
    })
}

fn client_command(executable: &Path, arguments: &[String]) -> Command {
    let mut command;
    #[cfg(windows)]
    if matches!(
        executable.extension().and_then(OsStr::to_str),
        Some(extension) if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
    ) {
        command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C"]);
        command.arg(executable);
        command.args(arguments);
    } else {
        command = Command::new(executable);
        command.args(arguments);
    }
    #[cfg(not(windows))]
    {
        command = Command::new(executable);
        command.args(arguments);
    }
    command
}

fn wait_for_client_command(mut child: Child) -> Result<ExitStatus, String> {
    wait_for_client_command_status(&mut child)
}

fn wait_for_client_command_status(child: &mut Child) -> Result<ExitStatus, String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => return Ok(status),
            None if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            None => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("client commandが時間内に完了しませんでした".to_string());
            }
        }
    }
}

fn parse_registered_command(stdout: &[u8]) -> Option<PathBuf> {
    String::from_utf8_lossy(stdout).lines().find_map(|line| {
        let (key, value) = line.trim().split_once(':')?;
        if !key.trim().eq_ignore_ascii_case("command") {
            return None;
        }
        let value = value.trim().trim_matches('"');
        (!value.is_empty()).then(|| PathBuf::from(value))
    })
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left = left.canonicalize().unwrap_or_else(|_| left.to_path_buf());
    let right = right.canonicalize().unwrap_or_else(|_| right.to_path_buf());
    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn resolve_sidecar_path() -> Result<PathBuf, String> {
    let binary_name = if cfg!(windows) {
        "xrift-studio-mcp.exe"
    } else {
        "xrift-studio-mcp"
    };
    let mut candidates = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let bundled_binary_name = if cfg!(windows) {
                "xrift-studio-mcp-sidecar.exe"
            } else {
                "xrift-studio-mcp-sidecar"
            };
            candidates.push(parent.join(bundled_binary_name));
            candidates.push(parent.join(binary_name));
        }
    }
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target-mcp-sidecar")
            .join("debug")
            .join(binary_name),
    );
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("debug")
            .join(binary_name),
    );
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .and_then(|path| path.canonicalize().ok())
        .ok_or_else(|| {
            "XRift Studio MCP serverが見つかりません。アプリを再installしてください".to_string()
        })
}

pub fn run_stdio_server() -> Result<(), String> {
    let rendezvous_path = parse_rendezvous_argument()?;
    let stdin = std::io::stdin();
    let mut stdin = BufReader::new(stdin.lock());
    let mut stdout = std::io::stdout().lock();
    let mut client_name = "AI client".to_string();
    let request_counter = AtomicU64::new(1);
    loop {
        let line = match read_limited_line(&mut stdin, MCP_MAX_MESSAGE_BYTES)
            .map_err(|error| error.to_string())?
        {
            LimitedLine::Eof => break,
            LimitedLine::TooLarge => {
                write_json_rpc_error(&mut stdout, Value::Null, -32600, "Request is too large")?;
                continue;
            }
            LimitedLine::Line(line) => line,
        };
        let message: Value = match serde_json::from_slice(&line) {
            Ok(message) => message,
            Err(_) => {
                write_json_rpc_error(&mut stdout, Value::Null, -32700, "Parse error")?;
                continue;
            }
        };
        let Some(method) = message.get("method").and_then(Value::as_str) else {
            continue;
        };
        let id = message.get("id").cloned();
        if method == "initialize" {
            if let Some(name) = message
                .pointer("/params/clientInfo/name")
                .and_then(Value::as_str)
            {
                client_name = name.chars().take(MCP_MAX_CLIENT_NAME_CHARS).collect();
            }
        }
        let Some(id) = id else {
            continue;
        };
        match method {
            "initialize" => write_json_rpc_result(
                &mut stdout,
                id,
                json!({
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": MCP_SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
                    "instructions": "Call get_editor_context before a write. Send projectId, sceneId, and expectedRevision with each document or Script write, then verify the result. Use get_terrain before sculpt_terrain; Terrain is a static height-sampled mesh with a fixed Trimesh Collider, so create_terrain and sculpt_terrain are Edit-only. Script execution is not sandboxed. XRift Studio enforces a project-scoped content-hash approval gate before evaluating Script source. XRift Studio's stdio MCP editor tools cannot grant approval. The debug-only privileged Tauri MCP bridge can execute webview JavaScript and is outside this trust boundary. set_play_mode returns SCRIPT_APPROVAL_REQUIRED when referenced source is not approved; the user must review and approve it in the Studio UI, or the client may explicitly request unapprovedPolicy:'skip' to start without those Scripts. Call get_scripting_capabilities and list_script_templates before authoring a Script. Use create_script_asset with templateId to create a built-in example, or apply_script_template to create it and attach its Script Component to an Entity in one editor revision. For custom source, use create_script_asset or update_script_asset, add_component with definitionId scripting.script and scriptAssetId, update_script_component to declare properties and references, then set_play_mode. Use import_audio_asset, import_texture_asset, import_model_asset, import_skybox_asset, or import_shader_asset only for a trusted absolute local path while Edit is active; the Editor validates extension, signature, regular-file/no-link status, and size limits, then copies it into managed project storage without returning file bytes or the external path. Use get_model_asset/update_model_asset for import settings and material slots, and reimport_model_asset to apply derived Model changes. Use get_shader_asset/update_shader_asset for project shader source. Use get_audio_asset plus place_asset, or add_component with core.audio-source and update_component, for persistent Audio Source authoring. Use get_texture_asset/update_texture_asset for persistent sampler and import settings; updates are supported during Play and restart only consuming Entities. Runtime ctx.audioSources, ctx.materials, and ctx.particles changes reset on Stop; use persistent Audio Source, Material, or Particle tools to save authoring data. Call list_component_definitions and get_entity_components before add_component, update_component, or remove_component. Use create_prefab to turn an Entity hierarchy into a reusable Prefab Asset, then place_asset to instantiate it. While Play is active, Entity enabled state and supported component/scene structure tools synchronize immediately; fetch context again after every write. For portable behavior, call list_interactivity_operations, author a KHR_interactivity Asset, and validate it after edits. If EDITOR_BUSY or STALE_REVISION is returned, wait briefly, fetch context again, and retry from the latest revision. XRift Studio must be open with a visual project."
                }),
            )?,
            "ping" => write_json_rpc_result(&mut stdout, id, json!({}))?,
            "tools/list" => {
                write_json_rpc_result(&mut stdout, id, json!({ "tools": tool_definitions() }))?
            }
            "tools/call" => {
                let Some(tool_name) = message.pointer("/params/name").and_then(Value::as_str)
                else {
                    write_json_rpc_error(&mut stdout, id, -32602, "Tool name is required")?;
                    continue;
                };
                if !MCP_TOOL_NAMES.contains(&tool_name) {
                    write_json_rpc_error(&mut stdout, id, -32602, "Unknown tool")?;
                    continue;
                }
                let arguments = message
                    .pointer("/params/arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let internal_id = format!(
                    "{}-{}-{}",
                    std::process::id(),
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|duration| duration.as_nanos())
                        .unwrap_or_default(),
                    request_counter.fetch_add(1, Ordering::Relaxed)
                );
                match proxy_tool_call(
                    &rendezvous_path,
                    &client_name,
                    XriftMcpToolRequest {
                        id: internal_id,
                        tool: tool_name.to_string(),
                        arguments,
                    },
                ) {
                    Ok(response) if response.ok => {
                        let result = response.result.unwrap_or_else(|| json!({}));
                        write_json_rpc_result(
                            &mut stdout,
                            id,
                            json!({
                                "content": [{ "type": "text", "text": serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()) }],
                                "structuredContent": result,
                                "isError": false
                            }),
                        )?;
                    }
                    Ok(response) => {
                        let error = response.error.unwrap_or_else(|| {
                            editor_error(
                                "EDITOR_ERROR",
                                "XRift Studio could not complete the request",
                            )
                        });
                        write_json_rpc_result(
                            &mut stdout,
                            id,
                            json!({
                                "content": [{ "type": "text", "text": format!("{}: {}", error.code, error.message) }],
                                "structuredContent": { "error": error },
                                "isError": true
                            }),
                        )?;
                    }
                    Err(error) => write_json_rpc_result(
                        &mut stdout,
                        id,
                        json!({
                            "content": [{ "type": "text", "text": format!("EDITOR_UNAVAILABLE: {error}") }],
                            "structuredContent": { "error": { "code": "EDITOR_UNAVAILABLE", "message": error } },
                            "isError": true
                        }),
                    )?,
                }
            }
            _ => write_json_rpc_error(&mut stdout, id, -32601, "Method not found")?,
        }
    }
    Ok(())
}

fn read_limited_line(reader: &mut impl BufRead, max_bytes: usize) -> std::io::Result<LimitedLine> {
    let mut line = Vec::new();
    let mut too_large = false;
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok(if too_large {
                LimitedLine::TooLarge
            } else if line.is_empty() {
                LimitedLine::Eof
            } else {
                LimitedLine::Line(line)
            });
        }
        let consumed = buffer
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|position| position + 1)
            .unwrap_or(buffer.len());
        let completed = buffer[consumed - 1] == b'\n';
        if !too_large {
            if line.len().saturating_add(consumed) > max_bytes {
                too_large = true;
            } else {
                line.extend_from_slice(&buffer[..consumed]);
            }
        }
        reader.consume(consumed);
        if completed {
            return Ok(if too_large {
                LimitedLine::TooLarge
            } else {
                LimitedLine::Line(line)
            });
        }
    }
}

fn parse_rendezvous_argument() -> Result<PathBuf, String> {
    let mut arguments = std::env::args_os().skip(1);
    while let Some(argument) = arguments.next() {
        if argument == OsStr::new("--rendezvous") {
            return arguments
                .next()
                .map(PathBuf::from)
                .ok_or_else(|| "--rendezvous requires a path".to_string());
        }
        if argument == OsStr::new("--help") || argument == OsStr::new("-h") {
            eprintln!("Usage: xrift-studio-mcp --rendezvous <path>");
            std::process::exit(0);
        }
    }
    std::env::var_os("XRIFT_STUDIO_MCP_RENDEZVOUS")
        .map(PathBuf::from)
        .ok_or_else(|| "XRift Studio rendezvous path is required".to_string())
}

fn proxy_tool_call(
    rendezvous_path: &Path,
    client_name: &str,
    request: XriftMcpToolRequest,
) -> Result<XriftMcpEditorResponse, String> {
    let rendezvous_metadata = std::fs::metadata(rendezvous_path)
        .map_err(|_| "Open XRift Studio before using its editor tools".to_string())?;
    if rendezvous_metadata.len() > MCP_MAX_MESSAGE_BYTES as u64 {
        return Err("XRift Studio connection information is invalid".to_string());
    }
    let payload = std::fs::read(rendezvous_path)
        .map_err(|_| "Open XRift Studio before using its editor tools".to_string())?;
    let rendezvous: XriftMcpRendezvous = serde_json::from_slice(&payload)
        .map_err(|_| "XRift Studio connection information is invalid".to_string())?;
    if rendezvous.schema_version != MCP_RENDEZVOUS_SCHEMA_VERSION || rendezvous.host != "127.0.0.1"
    {
        return Err("XRift Studio connection information is not supported".to_string());
    }
    let mut stream = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], rendezvous.port)),
        std::time::Duration::from_secs(3),
    )
    .map_err(|_| "XRift Studio is not running".to_string())?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(
            MCP_REQUEST_TIMEOUT_SECONDS + (MCP_EDITOR_QUEUE_TIMEOUT_MILLISECONDS / 1_000) + 5,
        )))
        .map_err(|error| error.to_string())?;
    let envelope = XriftMcpBrokerEnvelope {
        token: rendezvous.token,
        client_name: client_name.to_string(),
        request,
    };
    serde_json::to_writer(&mut stream, &envelope).map_err(|error| error.to_string())?;
    stream.write_all(b"\n").map_err(|error| error.to_string())?;
    stream.flush().map_err(|error| error.to_string())?;
    let mut response = String::new();
    let bytes = BufReader::new(stream)
        .take((MCP_MAX_MESSAGE_BYTES + 1) as u64)
        .read_line(&mut response)
        .map_err(|error| error.to_string())?;
    if bytes == 0 || bytes > MCP_MAX_MESSAGE_BYTES {
        return Err("XRift Studio returned an invalid response".to_string());
    }
    serde_json::from_str(&response)
        .map_err(|_| "XRift Studio returned an invalid response".to_string())
}

fn write_json_rpc_result(writer: &mut impl Write, id: Value, result: Value) -> Result<(), String> {
    serde_json::to_writer(
        &mut *writer,
        &json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        }),
    )
    .map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn write_json_rpc_error(
    writer: &mut impl Write,
    id: Value,
    code: i32,
    message: &str,
) -> Result<(), String> {
    serde_json::to_writer(
        &mut *writer,
        &json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message }
        }),
    )
    .map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn texture_import_settings_schema(require_non_empty: bool) -> Value {
    let mut schema = json!({
        "type": "object",
        "properties": {
            "colorSpace": {
                "type": "string",
                "enum": ["auto", "srgb", "linear"]
            },
            "generateMipmaps": { "type": "boolean" },
            "flipY": { "type": "boolean" },
            "resize": {
                "oneOf": [
                    {
                        "type": "object",
                        "properties": {
                            "mode": { "const": "original" }
                        },
                        "required": ["mode"],
                        "additionalProperties": false
                    },
                    {
                        "type": "object",
                        "properties": {
                            "mode": { "const": "max-size" },
                            "maxSize": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 16384
                            }
                        },
                        "required": ["mode", "maxSize"],
                        "additionalProperties": false
                    }
                ]
            },
            "sampler": {
                "type": "object",
                "properties": {
                    "wrapS": {
                        "type": "string",
                        "enum": ["repeat", "clamp-to-edge", "mirrored-repeat"]
                    },
                    "wrapT": {
                        "type": "string",
                        "enum": ["repeat", "clamp-to-edge", "mirrored-repeat"]
                    },
                    "magFilter": {
                        "type": "string",
                        "enum": ["nearest", "linear"]
                    },
                    "minFilter": {
                        "type": "string",
                        "enum": [
                            "nearest",
                            "linear",
                            "nearest-mipmap-nearest",
                            "linear-mipmap-nearest",
                            "nearest-mipmap-linear",
                            "linear-mipmap-linear"
                        ]
                    }
                },
                "minProperties": 1,
                "additionalProperties": false
            },
            "compression": {
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["source", "webp", "ktx2"]
                    },
                    "quality": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 100
                    }
                },
                "minProperties": 1,
                "additionalProperties": false
            }
        },
        "additionalProperties": false
    });
    if require_non_empty {
        schema
            .as_object_mut()
            .expect("Texture settings schema must be an object")
            .insert("minProperties".to_string(), Value::from(1));
    }
    schema
}

fn material_texture_slot_schema() -> Value {
    json!({
        "description": "Assign a Texture Asset by id or texture info, or use null to clear the slot.",
        "oneOf": [
            { "type": "string", "minLength": 1 },
            {
                "type": "object",
                "properties": {
                    "textureAssetId": { "type": "string", "minLength": 1 },
                    "texCoord": { "type": "integer", "minimum": 0 },
                    "transform": { "type": ["object", "null"] },
                    "scale": { "type": "number" },
                    "strength": { "type": "number", "minimum": 0, "maximum": 1 }
                },
                "required": ["textureAssetId"],
                "additionalProperties": false
            },
            { "type": "null" }
        ]
    })
}

/// One Terrain grass layer's override of its type's colour and blade size.
///
/// Every field is optional and absent means "follow the type"; `null` clears an
/// override that was set earlier, which is not the same as leaving it out.
fn terrain_grass_appearance_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "baseColor": { "type": ["string", "null"], "pattern": "^#[0-9a-fA-F]{6}$" },
            "tipColor": { "type": ["string", "null"], "pattern": "^#[0-9a-fA-F]{6}$" },
            "colorVariation": { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
            "heightScale": { "type": ["number", "null"], "minimum": 0.2, "maximum": 4 },
            "widthScale": { "type": ["number", "null"], "minimum": 0.2, "maximum": 4 },
            "fill": { "type": ["number", "null"], "minimum": 0, "maximum": 1 }
        },
        "additionalProperties": false
    })
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_editor_context",
            "description": "Read the currently open XRift Studio project, scene, selection, mode, save state, revision, and JSON-safe Script runtime diagnostics. Call this before a write and after Play changes.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_scripting_capabilities",
            "description": "Read the Script authoring workflow; xrift:script lifecycle, Asset, targeted Material, and Particle runtime APIs; persistent authoring tools; and the explicit sandboxed:false, content-hash trust gate boundary.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "analyze_component_code",
            "description": "Analyze React Three Fiber (R3F) component source and return an import plan describing the Entities, Components, and Asset dependencies it would create. Read-only; pass the returned plan to apply_component_code_import_plan to commit it to the Scene.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": { "type": "string", "minLength": 1 }
                },
                "required": ["source"],
                "additionalProperties": false
            }
        },
        {
            "name": "apply_component_code_import_plan",
            "description": "Apply a plan returned by analyze_component_code by creating the Entities and Components it describes in the current Scene. Pass assetIdBySourcePath to reuse already-imported Assets for the plan's model dependencies instead of re-importing them.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "plan": {
                        "type": "object",
                        "properties": {
                            "nodes": { "type": "array" }
                        },
                        "required": ["nodes"]
                    },
                    "assetIdBySourcePath": {
                        "type": "object",
                        "additionalProperties": { "type": "string", "minLength": 1 }
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "plan"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_assets",
            "description": "List assets in the open XRift Studio project and whether each asset can be placed in the scene.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "kind": { "type": "string" }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "update_project_metadata",
            "description": "Persist the visual project's publish title and description through Editor history and autosave.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "patch": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "description": { "type": "string" }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_asset_folder",
            "description": "Create an empty Asset Library folder, optionally under an existing folder.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "parentId": { "type": ["string", "null"], "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "name"],
                "additionalProperties": false
            }
        },
        {
            "name": "rename_asset",
            "description": "Rename a user Asset in the Asset Library.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "name"],
                "additionalProperties": false
            }
        },
        {
            "name": "rename_asset_folder",
            "description": "Rename an Asset Library folder.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "folderId": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "folderId", "name"],
                "additionalProperties": false
            }
        },
        {
            "name": "move_asset",
            "description": "Move a user Asset to an existing Asset Library folder or the project root by passing folderId:null.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string", "minLength": 1 },
                    "folderId": { "type": ["string", "null"], "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "folderId"],
                "additionalProperties": false
            }
        },
        {
            "name": "move_asset_folder",
            "description": "Move an Asset Library folder to an existing parent folder or the project root by passing parentId:null. Cycles and duplicate sibling names are rejected.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "folderId": { "type": "string", "minLength": 1 },
                    "parentId": { "type": ["string", "null"], "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "folderId", "parentId"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_asset",
            "description": "Delete an unreferenced user Asset. Built-in Assets and referenced Assets are protected; rejection returns reference details.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_asset_folder",
            "description": "Delete an empty Asset Library folder. Non-empty folders are protected and return their contents in the rejection details.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "folderId"],
                "additionalProperties": false
            }
        },
        {
            "name": "inspect_colliders",
            "description": "Inspect Collider and Rigid Body configuration, including fixable runtime and compile diagnostics. Pass entityIds to limit the read-only inspection.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entityIds": {
                        "type": "array",
                        "items": { "type": "string", "minLength": 1 },
                        "uniqueItems": true
                    }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "optimize_colliders",
            "description": "Apply the safe Collider diagnostics fixes used by the Scene View: dynamic Trimesh to Convex, duplicate Mesh Collider disable, CCD enable, and surface-value normalization. Pass entityIds to limit the operation.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityIds": {
                        "type": "array",
                        "items": { "type": "string", "minLength": 1 },
                        "uniqueItems": true
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_audio_asset",
            "description": "Read one managed Audio Asset and its project-relative source format, MIME type, and byte length. File bytes, data URLs, and external source paths are never returned.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "audioAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["audioAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "import_audio_asset",
            "description": "Validate and import one trusted local audio file into managed project storage while Edit is active. MP3, WAV, OGG, FLAC, M4A/AAC and WebM are accepted, covering every container a browser runtime can decode. sourcePath must be an absolute path to a regular non-symlink/non-reparse file no larger than 128 MB. Extension and file signature must agree. The result returns the Audio Asset and project-relative destination, never file bytes, a data URL, or the external source path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "sourcePath": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 4096
                    },
                    "name": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 100
                    },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "sourcePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_model_asset",
            "description": "Read one Model Asset, its import recipe, stable material slots, source metadata, and derived model metadata without returning file bytes or external paths.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "modelAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["modelAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "import_model_asset",
            "description": "Validate and import one trusted local single-file GLB, VRM, glTF, or OBJ model while Edit is active. sourcePath must be an absolute regular non-symlink file no larger than 128 MB; external companion files are not read implicitly.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "sourcePath": { "type": "string", "minLength": 1, "maxLength": 4096 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "sourcePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_texture_asset",
            "description": "Read a persistent Texture Asset, its managed project-relative source metadata, and all normalized color-space, resize, mipmap, sampler, and compression settings. Source file bytes and external paths are never returned.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "textureAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["textureAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "import_texture_asset",
            "description": "Validate and import one trusted local PNG, JPEG, WebP, AVIF, GIF, BMP, SVG, or KTX2 file into managed project storage while Edit is active. sourcePath must be an absolute path to a regular non-symlink file no larger than 128 MB. The result returns the Texture Asset and project-relative destination, never file bytes or the external source path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "sourcePath": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 4096
                    },
                    "name": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 100
                    },
                    "folderId": { "type": "string", "minLength": 1 },
                    "importSettings": texture_import_settings_schema(false)
                },
                "required": ["projectId", "sceneId", "expectedRevision", "sourcePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "import_skybox_asset",
            "description": "Validate and import a trusted local HDR or EXR equirectangular environment texture, set it as the Scene skybox, and save the operation as one Editor revision.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "sourcePath": { "type": "string", "minLength": 1, "maxLength": 4096 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "sourcePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "import_shader_asset",
            "description": "Validate and import one trusted local UTF-8 GLSL shader file while Edit is active. The source is stored in the project and exposed as a Shader Asset without returning the external path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "sourcePath": { "type": "string", "minLength": 1, "maxLength": 4096 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "sourcePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_shader_asset",
            "description": "Read a managed GLSL Shader Asset source and project-relative metadata. External paths are never returned.",
            "inputSchema": {
                "type": "object",
                "properties": { "shaderAssetId": { "type": "string", "minLength": 1 } },
                "required": ["shaderAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_shader_asset",
            "description": "Replace a managed GLSL Shader Asset source through the same revision, history, and autosave boundary as the Shader Editor.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "shaderAssetId": { "type": "string", "minLength": 1 },
                    "source": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "shaderAssetId", "source"],
                "additionalProperties": false
            }
        },
        {
            "name": "reimport_model_asset",
            "description": "Re-read a project-managed Model Asset source and atomically update its derived metadata while preserving the Model Asset ID and references. Edit mode only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "modelAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "modelAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "process_texture_asset",
            "description": "Run a Texture Asset's import settings against its source image, writing the resized or re-encoded result back into the project. update_texture_asset only records maxSize, format and quality; until this runs the original image is what ships. Reports the before and after size, or the reason the settings are already settled. Edit mode only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "textureAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "textureAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "optimize_model_asset",
            "description": "Rewrite a project-managed GLB Model Asset in place with mesh optimization (vertex welding, shared vertex buffers, animation keyframe resampling) and optional Draco compression, keeping Material Slots, node structure and animation clips intact. update_model_asset only records the import recipe; until this runs the original GLB is what ships. Reports the before and after size, or that the settings are already settled. Edit mode only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "modelAssetId": { "type": "string", "minLength": 1 },
                    "optimizeMeshes": { "type": "boolean", "default": true },
                    "compressWithDraco": { "type": "boolean", "default": true }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "modelAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "revert_asset_optimization",
            "description": "Point a converted Texture or optimized Model Asset back at the original file it was made from, restoring the import settings used at conversion time. Conversion never rewrites the original, so this always succeeds while the Asset still uses a converted file. Edit mode only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_project_thumbnail",
            "description": "Set the saved project thumbnail from an existing browser-decodable Texture or environment Texture Asset without exposing file bytes or external paths.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_model_asset",
            "description": "Persist Model import settings and authoring default Material slot bindings through Editor history and autosave. Reimport is required before source-derived geometry changes take effect.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "modelAssetId": { "type": "string", "minLength": 1 },
                    "patch": {
                        "type": "object",
                        "properties": {
                            "importSettings": {
                                "type": "object",
                                "properties": {
                                    "scale": { "type": "number", "exclusiveMinimum": 0 },
                                    "generateColliders": { "type": "boolean" },
                                    "optimizeMeshes": { "type": "boolean" },
                                    "importAnimations": { "type": "boolean" }
                                },
                                "minProperties": 1,
                                "additionalProperties": false
                            },
                            "materialSlotBindings": {
                                "type": "object",
                                "additionalProperties": { "type": ["string", "null"] }
                            }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "modelAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_texture_asset",
            "description": "Persist Texture color space, mipmaps, flip Y, resize, wrap, filter, and compression authoring settings in Edit or Play mode. During Play the dependency graph restarts only Entities that consume this Texture directly or through Material and Particle Assets.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "textureAssetId": { "type": "string", "minLength": 1 },
                    "patch": texture_import_settings_schema(true)
                },
                "required": ["projectId", "sceneId", "expectedRevision", "textureAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_document_asset",
            "description": "Create a persistent authored Material or Particle Asset, optionally inside an Asset folder, through the same revision and history boundary as the Editor.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "kind": { "type": "string", "enum": ["material", "particle"] },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "folderId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "kind"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_particle_asset",
            "description": "Read a persistent Particle Asset and all normalized authoring properties.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "particleAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["particleAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_particle_asset",
            "description": "Persist Particle Asset simulation, emission, shape, lifetime, velocity, color, size, and renderer settings. Runtime ctx.particles overrides remain Play-only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "particleAssetId": { "type": "string", "minLength": 1 },
                    "patch": { "type": "object", "minProperties": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "particleAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_script_templates",
            "description": "List the built-in, offline Script templates available to create_script_asset and apply_script_template, including their category and required Asset, Component, and Entity bindings.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "get_script_asset",
            "description": "Read the TypeScript source and project-relative path of a Script Asset.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scriptAssetId": { "type": "string" }
                },
                "required": ["scriptAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_script_asset",
            "description": "Create a TypeScript or TSX Script Asset in the open visual project and select it in Assets. Set templateId to an ID from list_script_templates, or set source for custom code; do not send both. Built-in templates choose their declared language automatically. For custom JSX source set language to tsx. Omitting both keeps the runnable default template. The currently open Script Editor buffer is preserved.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1 },
                    "folderId": { "type": "string" },
                    "templateId": { "type": "string", "minLength": 1 },
                    "language": { "type": "string", "enum": ["ts", "tsx"] },
                    "source": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "apply_script_template",
            "description": "Create a built-in Script template and attach a Script Component referencing it to one existing Entity. The Asset and Component are committed as one editor revision and one Undo history entry. Configure any required Asset or Entity properties afterward with update_script_component.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "templateId": { "type": "string", "minLength": 1 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1 },
                    "folderId": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "templateId", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_script_asset",
            "description": "Replace a Script Asset's TypeScript source. This remains available during Play, awaits recompilation, and returns sourceSaved, runtimeUpdated, and compileErrors. A failed live compile keeps the previous running module. Declare every Asset or Entity used by the source through update_script_component.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "scriptAssetId": { "type": "string" },
                    "source": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "scriptAssetId", "source"],
                "additionalProperties": false
            }
        },
        {
            "name": "capture_scene_debug",
            "description": "Read live Scene View renderer metrics or start/stop a bounded, MCP-owned WebM capture. This does not change SceneDocument, AssetManifest, selection, or Undo history. metrics returns FPS, frame time, draw calls, triangles, visible mesh count, geometry/texture memory counts, and camera Far. start accepts durationMs from 1000 to 15000; stop saves the recording to the app debug-captures directory and returns its path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "action": { "type": "string", "enum": ["metrics", "start", "stop"] },
                    "durationMs": { "type": "integer", "minimum": 1000, "maximum": 15000 }
                },
                "required": ["projectId", "sceneId", "action"],
                "additionalProperties": false
            }
        },
        {
            "name": "capture_scene_view",
            "description": "Save one PNG of the Scene View exactly as rendered and return its path in the app debug-captures directory. This is how a change is checked rather than assumed: metrics and the document say what should be on screen, and only a frame says what is. Point the camera with set_scene_view_camera first. Changes nothing in the project.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_scene_view_camera",
            "description": "Move the Scene View camera. Give a named view (top and bottom look straight down and up, front/back/left/right look along an axis, iso is the default three-quarter view), or focusEntityId to frame one Entity's real rendered bounds the way the editor's focus shortcut does, or an explicit position and target. distance overrides how far back the camera sits. A named view with no Entity keeps the current look-at point, so switching to top answers what the current subject looks like from above. Returns the resulting position and target; changes nothing in the project.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "minLength": 1 },
                    "sceneId": { "type": "string", "minLength": 1 },
                    "preset": {
                        "type": "string",
                        "enum": ["top", "bottom", "front", "back", "left", "right", "iso"]
                    },
                    "focusEntityId": { "type": "string", "minLength": 1 },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    },
                    "target": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    },
                    "distance": { "type": "number", "minimum": 0.1, "maximum": 5000 }
                },
                "required": ["projectId", "sceneId"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_play_mode",
            "description": "Start or stop the visual editor Play session. Starting Play checks the project-scoped content-hash approval for every referenced Script before evaluation. XRift Studio's stdio MCP editor tools cannot approve source; the debug-only privileged Tauri MCP bridge is outside this trust boundary. Unapproved source returns SCRIPT_APPROVAL_REQUIRED unless unapprovedPolicy is explicitly set to skip. Compilation failure leaves the editor in Edit mode.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "mode": { "type": "string", "enum": ["play", "edit"] },
                    "unapprovedPolicy": {
                        "type": "string",
                        "enum": ["skip"],
                        "description": "Play without evaluating unapproved Scripts. Omit to fail with SCRIPT_APPROVAL_REQUIRED so the user can review them in Studio."
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "mode"],
                "additionalProperties": false
            }
        },
        {
            "name": "search_external_assets",
            "description": "Search the Poly Haven or ambientCG catalog for CC0 HDRIs, textures/materials, and models. Returns external IDs that can be passed to the option and install tools.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "providerId": { "type": "string", "enum": ["poly-haven", "ambient-cg"] },
                    "query": { "type": "string" },
                    "kind": { "type": "string", "enum": ["hdri", "texture", "model"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 120 }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_external_asset_options",
            "description": "List installable resolutions and formats for a Poly Haven or ambientCG external asset.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "providerId": { "type": "string", "enum": ["poly-haven", "ambient-cg"] },
                    "externalId": { "type": "string" }
                },
                "required": ["externalId"],
                "additionalProperties": false
            }
        },
        {
            "name": "install_external_asset",
            "description": "Download a Poly Haven or ambientCG HDRI or PBR texture bundle into the open project and create XRift Studio assets. Poly Haven Models are validated and saved as self-contained glTF; ambientCG Models remain catalog-only until a compatible glTF download is available.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "providerId": { "type": "string", "enum": ["poly-haven", "ambient-cg"] },
                    "externalId": { "type": "string" },
                    "resolution": { "type": "string", "enum": ["1k", "2k", "4k", "8k", "12k", "16k", "24k"] },
                    "format": { "type": "string", "enum": ["hdr", "exr"] },
                    "applySkybox": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "externalId", "resolution"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_scene_settings",
            "description": "Update persisted Skybox, Sky Shader, Fog, ambient light, camera, post effects, and editor viewport settings through XRift Studio history and autosave. skybox.materialAssetId assigns a Custom Shader Material as the procedural sky; it draws the background instead of the image and the gradient. This is supported during Edit and Play; Play reflects the shared Scene settings immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "skybox": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "iblEnabled": { "type": "boolean" },
                            "projection": { "type": "string", "enum": ["infinite", "box", "dome"] },
                            "imageAssetId": { "type": ["string", "null"], "minLength": 1 },
                            "materialAssetId": { "type": ["string", "null"], "minLength": 1 },
                            "topColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "bottomColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "offset": { "type": "number" },
                            "exponent": { "type": "number", "minimum": 0.01 },
                            "rotationDegrees": { "type": "number" },
                            "flipY": { "type": "boolean" },
                            "exposure": { "type": "number", "minimum": 0 },
                            "meshPosition": {
                                "type": "array",
                                "items": { "type": "number" },
                                "minItems": 3,
                                "maxItems": 3
                            },
                            "meshRotationDegrees": {
                                "type": "array",
                                "items": { "type": "number" },
                                "minItems": 3,
                                "maxItems": 3
                            },
                            "meshScale": {
                                "type": "array",
                                "items": { "type": "number", "minimum": 0.001 },
                                "minItems": 3,
                                "maxItems": 3
                            },
                            "center": {
                                "type": "array",
                                "items": { "type": "number" },
                                "minItems": 3,
                                "maxItems": 3
                            }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "fog": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "near": { "type": "number", "minimum": 0 },
                            "far": { "type": "number", "minimum": 0.001 }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "ambient": {
                        "type": "object",
                        "properties": {
                            "color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "intensity": { "type": "number", "minimum": 0 }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "camera": {
                        "type": "object",
                        "properties": {
                            "near": { "type": "number", "minimum": 0.01 },
                            "far": { "type": "number", "minimum": 1 },
                            "fov": { "type": "number", "minimum": 1, "maximum": 179 }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "postprocessing": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "exposure": { "type": "number", "minimum": 0 },
                            "bloom": {
                                "type": "object",
                                "properties": {
                                    "enabled": { "type": "boolean" },
                                    "threshold": { "type": "number", "minimum": 0 },
                                    "strength": { "type": "number", "minimum": 0 },
                                    "radius": { "type": "number", "minimum": 0 }
                                },
                                "minProperties": 1,
                                "additionalProperties": false
                            }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "vegetation": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "windStrength": { "type": "number", "minimum": 0 },
                            "windSpeed": { "type": "number", "minimum": 0 },
                            "gustStrength": { "type": "number", "minimum": 0 },
                            "windDirectionDegrees": { "type": "number" }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    },
                    "editor": {
                        "type": "object",
                        "properties": {
                            "backgroundColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "gizmo": {
                                "type": "object",
                                "properties": {
                                    "size": { "type": "number", "minimum": 0.1 },
                                    "gridVisible": { "type": "boolean" },
                                    "gridSize": { "type": "number", "minimum": 1 },
                                    "gridDivisions": { "type": "integer", "minimum": 1 },
                                    "snapEnabled": { "type": "boolean" },
                                    "translateSnap": { "type": "number", "minimum": 0.001 },
                                    "rotateSnapDegrees": { "type": "number", "minimum": 0.1 },
                                    "scaleSnap": { "type": "number", "minimum": 0.001 }
                                },
                                "minProperties": 1,
                                "additionalProperties": false
                            }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "anyOf": [
                    { "required": ["skybox"] },
                    { "required": ["fog"] },
                    { "required": ["ambient"] },
                    { "required": ["camera"] },
                    { "required": ["postprocessing"] },
                    { "required": ["vegetation"] },
                    { "required": ["editor"] }
                ],
                "additionalProperties": false
            }
        },
        {
            "name": "place_asset",
            "description": "Place a project asset into the current XRift Studio scene and select the created entity.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    },
                    "parentEntityId": { "type": ["string", "null"] }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_entities",
            "description": "List every entity in the current scene with its hierarchy (parentId/children) and components.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "list_component_definitions",
            "description": "List the central Editor Component registry with stable definition IDs, categories, project-kind availability, multiplicity, and required Asset kinds. Call this instead of guessing add_component definitionId values.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_entity_components",
            "description": "Read one Entity's enabled state and complete serialized Component list, including the stable definitionId for each registered Component.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entityId": { "type": "string", "minLength": 1 }
                },
                "required": ["entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_entity_bounds",
            "description": "Measure how big an Entity actually is: the axis-aligned world box (min, max, center, size) for the Entity and, by default, its whole subtree, plus its own untransformed local box. get_entity_components returns a Transform and no extent, so this is what answers whether two things overlap, how high to place something, or how far apart to space a row. unmeasuredEntityIds names Entities whose Mesh extent could not be resolved rather than leaving them out of the box.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entityId": { "type": "string", "minLength": 1 },
                    "includeDescendants": { "type": "boolean" }
                },
                "required": ["entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_primitive",
            "description": "Create a builtin primitive shape (box, sphere, cylinder, cone, or plane) as a new scene entity.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "shape": { "type": "string", "enum": ["box", "sphere", "cylinder", "cone", "plane"] },
                    "materialAssetId": { "type": "string" },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "shape"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_terrain",
            "description": "Read one Terrain's size, resolution, height range, sample count, and assigned Material without returning the complete height array.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 }
                },
                "required": ["entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "sample_terrain_point",
            "description": "Read the ground at one Terrain-local X/Z: the interpolated height, the same point in world space, the slope in degrees, whether the cell is a hole, and each grass layer's coverage there. Call this before placing anything on a sculpted Terrain — the document stores heights as a flat array, so y=0 is only correct on ground nobody has raised.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "point": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 2,
                        "maxItems": 2
                    }
                },
                "required": ["entityId", "point"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_terrain_presets",
            "description": "List the shaped Terrain presets the Create menu offers (meadow, rolling hills, valley, plateau, island, ridge, basin, dunes) with their footprint and default grass set, and the ground surface catalog with each surface's tunable uniforms, ranges and defaults. create_terrain only makes a flat plate; these are what a shaped, planted, textured Terrain starts from.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "create_terrain_from_preset",
            "description": "Place a shaped Terrain from a preset, already sculpted and planted, instead of sculpting a flat plate stamp by stamp. Omit grassPresetId to keep the preset's own grass, or pass null to place it bare. Omit position and it lands clear of the Terrains already in the scene, because two Terrains over the same ground tear into moire bands; overlappingTerrainCount reports any overlap rather than blocking it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "presetId": { "type": "string", "minLength": 1 },
                    "grassPresetId": { "type": ["string", "null"] },
                    "materialAssetId": { "type": "string", "minLength": 1 },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "presetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "apply_terrain_surface",
            "description": "Paint a Terrain's ground with a surface preset from the catalog, blending materials by height and slope. The preset's height bands are absolute metres, so they are fitted to this Terrain's own elevation range unless parameters are given — applied unchanged on a Terrain of a different scale the ground comes out one flat colour, which reads as a broken shader. The surface lands as an ordinary Material, so it can be retuned afterwards with the Material tools.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "surfaceId": { "type": "string", "minLength": 1 },
                    "parameters": {
                        "type": "object",
                        "description": "Uniform values from list_terrain_presets; numbers are clamped to the listed range and colours are #rrggbb.",
                        "additionalProperties": { "type": ["number", "string"] }
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "surfaceId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_terrain",
            "description": "Create a static height-sampled Terrain with a fixed Trimesh Collider. It starts flat; use sculpt_terrain for deterministic Raise, Lower, Set Height, Smooth, Stamp, and Paint Holes operations.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "width": { "type": "number", "minimum": 0.5, "maximum": 512 },
                    "depth": { "type": "number", "minimum": 0.5, "maximum": 512 },
                    "resolution": { "type": "integer", "minimum": 9, "maximum": 257 },
                    "materialAssetId": { "type": "string", "minLength": 1 },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "sculpt_terrain",
            "description": "Apply one deterministic Terrain brush stamp in local X/Z coordinates. Raise and Lower use height strength; Flatten and Stamp require targetHeight; Smooth uses strength as a 0..1 blend; hole-add and hole-remove change the actual runtime mesh. Fetch the latest editor context after the write.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "kind": { "type": "string", "enum": ["raise", "lower", "flatten", "smooth", "stamp", "hole-add", "hole-remove"] },
                    "center": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 2,
                        "maxItems": 2
                    },
                    "radius": { "type": "number", "exclusiveMinimum": 0 },
                    "strength": { "type": "number", "exclusiveMinimum": 0 },
                    "targetHeight": { "type": "number", "minimum": -256, "maximum": 256 },
                    "falloff": { "type": "number", "minimum": 0, "maximum": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "kind", "center", "radius", "strength"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_terrain",
            "description": "Resize or resample a Terrain while preserving its sculpted heights and hole mask. Omitted values keep their current setting.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "width": { "type": "number", "minimum": 0.5, "maximum": 512 },
                    "depth": { "type": "number", "minimum": 0.5, "maximum": 512 },
                    "resolution": { "type": "integer", "minimum": 9, "maximum": 257 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_terrain_grass_types",
            "description": "List the Terrain grass catalog: every grass type with its default blade size and colours, every one-step preset with the layers it expands into, and the density, slope, height-band and per-layer instance limits the grass tools enforce. Call this before adding or tuning a grass layer instead of guessing typeId or presetId values.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "apply_terrain_grass_preset",
            "description": "Replace a Terrain's grass layers with one preset's stack, matching the Inspector's one-step vegetation button. This discards existing layers, including any painted coverage; use add_terrain_grass_layer to add to a stack instead.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "presetId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "presetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "add_terrain_grass_layer",
            "description": "Add one grass layer to a Terrain. Blades are placed by rule rather than stored, so a layer is a density, a world-height band, a slope limit and a seed; appearance overrides the type's colours and blade size for this layer only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "typeId": { "type": "string", "minLength": 1 },
                    "density": { "type": "number", "minimum": 0, "maximum": 40 },
                    "heightRange": {
                        "type": "array",
                        "items": { "type": "number", "minimum": -1000, "maximum": 1000 },
                        "minItems": 2,
                        "maxItems": 2
                    },
                    "slopeLimitDegrees": { "type": "number", "minimum": 0, "maximum": 90 },
                    "seed": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
                    "appearance": terrain_grass_appearance_schema()
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "typeId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_terrain_grass_layer",
            "description": "Change one grass layer's type, density, height band, slope limit, seed or appearance, and optionally move it in the draw order with index. Send patch.appearance as null to drop every override back to the type, an appearance field as null to clear just that one, and patch.mask as null to discard painted coverage.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "layerId": { "type": "string", "minLength": 1 },
                    "index": { "type": "integer", "minimum": 0 },
                    "patch": {
                        "type": "object",
                        "properties": {
                            "typeId": { "type": "string", "minLength": 1 },
                            "density": { "type": "number", "minimum": 0, "maximum": 40 },
                            "heightRange": {
                                "type": "array",
                                "items": { "type": "number", "minimum": -1000, "maximum": 1000 },
                                "minItems": 2,
                                "maxItems": 2
                            },
                            "slopeLimitDegrees": { "type": "number", "minimum": 0, "maximum": 90 },
                            "seed": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
                            "appearance": {
                                "anyOf": [
                                    terrain_grass_appearance_schema(),
                                    { "type": "null" }
                                ]
                            },
                            "mask": { "type": "null" }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "layerId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_terrain_grass_layer",
            "description": "Remove one grass layer from a Terrain, along with any coverage painted on it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "layerId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "layerId"],
                "additionalProperties": false
            }
        },
        {
            "name": "paint_terrain_grass",
            "description": "Paint or erase one grass layer's coverage with a soft-edged brush in Terrain-local X/Z. A layer's rules cannot express \"not here\", so this is how grass is kept off a path or a clearing; erasing everywhere a layer covers drops the mask again.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "layerId": { "type": "string", "minLength": 1 },
                    "mode": { "type": "string", "enum": ["paint", "erase"] },
                    "center": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 2,
                        "maxItems": 2
                    },
                    "radius": { "type": "number", "exclusiveMinimum": 0 },
                    "strength": { "type": "number", "exclusiveMinimum": 0, "maximum": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "layerId", "mode", "center", "radius"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_scene_recipes",
            "description": "List the ready-made 3D sets available for this project kind — campfire, torch, tree, rocks, snowfall, fountain, column, stairs, well, bench, recording studio and more — with their category, part count and the note saying what the author still has to do after placing. Each set is a subtree whose lights, particles and materials already agree with one another; building the same thing from primitives takes a dozen calls and comes out worse.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "apply_scene_recipe",
            "description": "Place one ready-made 3D set into the scene as a single subtree, creating the Particle Assets and writing the bundled Models it needs. Returns the root Entity, its children and any Assets created, so each part can be adjusted afterwards. Omit position and it lands on the same grid the catalog uses rather than stacking at the origin. Requires a saved project; Edit mode only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "recipeId": { "type": "string", "minLength": 1 },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "recipeId"],
                "additionalProperties": false
            }
        },
        {
            "name": "place_builtin_prefab",
            "description": "Place a builtin XRift prefab (SpawnPoint, Mirror, Portal, TagBoard, VideoScreen, VideoPlayer, LiveVideoPlayer, or ScreenShareDisplay) into the scene.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "recipeId": {
                        "type": "string",
                        "enum": [
                            "xrift-prefab.spawn-point",
                            "xrift-prefab.mirror",
                            "xrift-prefab.portal",
                            "xrift-prefab.tag-board",
                            "xrift-prefab.video-screen",
                            "xrift-prefab.video-player",
                            "xrift-prefab.live-video-player",
                            "xrift-prefab.screen-share-display"
                        ]
                    },
                    "position": {
                        "type": "array",
                        "items": { "type": "number" },
                        "minItems": 3,
                        "maxItems": 3
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "recipeId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_prefab",
            "description": "Create a reusable project Prefab Asset and document from an Entity and its child hierarchy.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "add_component",
            "description": "Add a Component from the central Editor registry to an existing Entity. Call list_component_definitions for valid definitionId values. For scripting.script, also pass the Script Asset ID returned by list_assets. For interaction.trigger, pass the Interactivity Asset ID as interactivityAssetId.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "scriptAssetId": { "type": "string" },
                    "interactivityAssetId": { "type": "string" },
                    "definitionId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "definitionId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_component",
            "description": "Persist supported Component fields and enabled state through Editor history. Built-in Mesh Renderer, Rigid Body, Collider, Light, Text, Audio Source, Animation, and Particle Emitter patches use the same validators as Inspector. Mesh Renderer patches can update enabled, complete materialBindings, Cast/Receive Shadow, static Model pose, and optional maxDistance (null clears the Mesh Far Clip and restores Scene Camera Far). Use update_transform for Transform values and update_script_component for Script properties/references.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 },
                    "patch": {
                        "type": "object",
                        "minProperties": 1,
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "materialBindings": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "slot": { "type": "string", "minLength": 1 },
                                        "materialAssetId": { "type": "string", "minLength": 1 },
                                        "sourceNodeIndex": { "type": "integer", "minimum": 0 }
                                    },
                                    "required": ["slot", "materialAssetId"],
                                    "additionalProperties": false
                                }
                            },
                            "castShadow": { "type": "boolean" },
                            "receiveShadow": { "type": "boolean" },
                            "maxDistance": { "type": ["number", "null"], "minimum": 0.1, "maximum": 1000000 },
                            "modelPose": {
                                "type": ["object", "null"],
                                "properties": {
                                    "bones": { "type": "object" },
                                    "morphTargets": { "type": "object" },
                                    "nodes": { "type": "object" }
                                },
                                "additionalProperties": false
                            }
                        },
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "componentId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "remove_component",
            "description": "Remove a Component from an Entity through Editor history. Transform is required and cannot be removed; protected built-in XRift Components preserve their authoring lock.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "componentId": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "componentId"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_entity_enabled",
            "description": "Persist an Entity's enabled state. During Play the authoring and running scenes synchronize immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string", "minLength": 1 },
                    "enabled": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "enabled"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_script_component",
            "description": "Update Script Component property values and replace the declared Asset or Entity reference allowlists used by ctx.assets and ctx.find. During Play, property-only changes reach the same Script instance on the next frame; reference changes restart only the affected Entity.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "componentId": { "type": "string" },
                    "properties": { "type": "object" },
                    "assetReferences": {
                        "type": "array",
                        "items": { "type": "string", "minLength": 1 },
                        "uniqueItems": true,
                        "description": "Complete allowlist of project Asset IDs reachable through ctx.assets. Send [] to clear it."
                    },
                    "entityReferences": {
                        "type": "array",
                        "items": { "type": "string", "minLength": 1 },
                        "uniqueItems": true,
                        "description": "Complete allowlist of Entity IDs reachable through ctx.find. Send [] to clear it."
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "componentId"],
                "anyOf": [
                    { "required": ["properties"] },
                    { "required": ["assetReferences"] },
                    { "required": ["entityReferences"] }
                ],
                "additionalProperties": false
            }
        },
        {
            "name": "update_transform",
            "description": "Update position, rotation, and/or scale on an existing entity's Transform component.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "position": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
                    "rotation": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
                    "scale": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
                    "componentId": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_material",
            "description": "Persist a Material Asset assignment to a mesh slot on an existing entity in Edit or Play mode. During Play only the affected Entity restarts. For temporary Play-only changes, use Script ctx.materials.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "materialAssetId": { "type": "string" },
                    "slot": { "type": "string" },
                    "meshComponentId": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "materialAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_material_asset",
            "description": "Read a persistent Material Asset with canonical glTF material properties and KHR_texture_transform values. For temporary Play-only changes on one Entity, author a Script with ctx.materials instead.",
            "inputSchema": {
                "type": "object",
                "properties": { "materialAssetId": { "type": "string" } },
                "required": ["materialAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_material_asset",
            "description": "Persist canonical glTF Material Asset properties in Edit or Play mode, including PBR factors, texture slots, alpha settings, and supported KHR_materials extensions. Texture slots accept MCP-friendly baseColor, metallicRoughness, normal, occlusion, and emissive aliases. During Play only consuming Entities restart. Unlike Script ctx.materials overrides, this changes saved authoring data.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string" },
                    "patch": {
                        "type": "object",
                        "description": "Material properties. Canonical glTF fields are accepted; the listed aliases assign imported Texture Assets directly.",
                        "properties": {
                            "baseColor": material_texture_slot_schema(),
                            "baseColorTexture": material_texture_slot_schema(),
                            "metallicRoughness": material_texture_slot_schema(),
                            "metallicRoughnessTexture": material_texture_slot_schema(),
                            "normal": material_texture_slot_schema(),
                            "occlusion": material_texture_slot_schema(),
                            "emissive": material_texture_slot_schema(),
                            "pbrMetallicRoughness": { "type": "object" },
                            "normalTexture": material_texture_slot_schema(),
                            "occlusionTexture": material_texture_slot_schema(),
                            "emissiveTexture": material_texture_slot_schema(),
                            "emissiveFactor": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
                            "alphaMode": { "type": "string", "enum": ["OPAQUE", "MASK", "BLEND"] },
                            "alphaCutoff": { "type": "number", "minimum": 0 },
                            "doubleSided": { "type": "boolean" },
                            "extensions": { "type": "object" },
                            "color": { "type": "string" },
                            "opacity": { "type": "number", "minimum": 0, "maximum": 1 },
                            "metalness": { "type": "number", "minimum": 0, "maximum": 1 },
                            "roughness": { "type": "number", "minimum": 0, "maximum": 1 },
                            "baseColorTextureId": { "type": ["string", "null"] },
                            "normalTextureId": { "type": ["string", "null"] },
                            "occlusionTextureId": { "type": ["string", "null"] },
                            "metallicRoughnessTextureId": { "type": ["string", "null"] },
                            "emissiveTextureId": { "type": ["string", "null"] }
                        },
                        "minProperties": 1,
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "materialAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_material_presets",
            "description": "List the Material catalogs an author picks from: sky shaders by category, water surfaces, and glow tints for emissive fixtures, each with its named parameters, ranges and defaults. create_custom_shader takes arbitrary GLSL, which is the wrong tool for \"make this look like a sky\" — writing one from scratch invents numbers this catalog already has. Terrain ground surfaces are in list_terrain_presets instead, because they are chosen together with a Terrain shape.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "create_material_from_preset",
            "description": "Create one Material from a catalog preset: a sky or water shader Material with optional parameter overrides, or a glow tint. Returns the Material Asset id and the next step, because neither is finished on its own — a sky Material becomes the sky only once update_scene_settings points the skybox at it, and water is a Material assigned to a plane with set_material. Re-creating an already installed preset reports alreadyInstalled rather than duplicating it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "kind": { "type": "string", "enum": ["sky", "water", "glow"] },
                    "presetId": { "type": "string", "minLength": 1 },
                    "parameters": {
                        "type": "object",
                        "description": "Uniform values from list_material_presets; numbers are clamped to the listed range and colours are #rrggbb. Not accepted for glow.",
                        "additionalProperties": { "type": ["number", "string"] }
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "kind", "presetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_texture_card",
            "description": "Turn a transparent Texture into a cut-out card Entity: a flat or curved distant backdrop, or a single or crossed grass card. Creates the alpha-blended two-sided Material and the collider-free Entity in one transaction, so undoing the card does not leave its Material behind. Environment Textures are rejected — they belong on the skybox.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "textureAssetId": { "type": "string", "minLength": 1 },
                    "profile": {
                        "type": "string",
                        "enum": ["backdrop-flat", "backdrop-arc-180", "backdrop-arc-270", "grass-single", "grass-cross"]
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "textureAssetId", "profile"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_custom_shader",
            "description": "Create a reusable Material with an authored GLSL Custom Shader, or attach a starter/provided Custom Shader to an existing Material. The shader is saved inside the Material and is immediately available to set_material, Scene View, Play, and compile.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
                    "folderId": { "type": "string", "minLength": 1 },
                    "shader": { "type": "object", "description": "Optional complete or partial classic-r3f shader. Omitted fields use the starter shader." }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_custom_shader",
            "description": "Read the authored GLSL, uniforms, variants, and animated time uniform stored in a Material. Returns an error when the Material is still PBR or an OpenBrush preset.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "materialAssetId": { "type": "string", "minLength": 1 }
                },
                "required": ["materialAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_custom_shader",
            "description": "Validate and persist a partial GLSL Custom Shader update inside one Material. Updates use the same project, scene, revision, history, autosave, Play dependency, and Scene View path as Material editing; invalid GLSL IR is rejected with diagnostics and does not change the document.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string", "minLength": 1 },
                    "patch": { "type": "object", "minProperties": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "materialAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_material_texture_transform",
            "description": "Persist glTF KHR_texture_transform tiling (scale), offset, rotation, and TEXCOORD set for a Material texture slot in Edit or Play mode. During Play only consuming Entities restart. The slot must already contain a Texture Asset. Script-loaded Texture transforms remain runtime-only.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string" },
                    "slot": { "type": "string", "enum": ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"] },
                    "offset": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
                    "scale": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
                    "rotationDegrees": { "type": "number" },
                    "texCoord": { "type": "integer", "minimum": 0 },
                    "reset": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "materialAssetId", "slot"],
                "additionalProperties": false
            }
        },
        {
            "name": "rename_entity",
            "description": "Rename an existing entity.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "name": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "name"],
                "additionalProperties": false
            }
        },
        {
            "name": "duplicate_entity",
            "description": "Duplicate an entity and its child hierarchy, optionally reparenting or repositioning the copy.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "parentEntityId": { "type": ["string", "null"] },
                    "position": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "reparent_entity",
            "description": "Move an entity hierarchy under another entity or Scene Root. During Play, the authoring and running scenes are synchronized immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "parentEntityId": { "type": ["string", "null"] },
                    "siblingIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "parentEntityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_entity",
            "description": "Delete an entity and its child hierarchy from the scene.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_empty_entity",
            "description": "Create an empty transform-only entity, useful as a group or container.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string" },
                    "parentEntityId": { "type": ["string", "null"] }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_interactivity_operations",
            "description": "List KHR_interactivity operation templates and their flow/value sockets supported by XRift Studio. Unknown extension operations can still be preserved generically.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_interactivity_asset",
            "description": "Read a reusable Interactivity Asset as canonical KHR_interactivity JSON, including validation diagnostics.",
            "inputSchema": {
                "type": "object",
                "properties": { "assetId": { "type": "string" } },
                "required": ["assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_interactivity_asset",
            "description": "Create a reusable KHR_interactivity Asset. `start` (the default) gives one event/onStart entry point to build from; `empty` gives a graph with no nodes.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1 },
                    "folderId": { "type": ["string", "null"] },
                    "template": { "type": "string", "enum": ["start", "empty"] }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
                "additionalProperties": false
            }
        },
        {
            "name": "create_model_animation_graph",
            "description": "Create a KHR_interactivity Asset that plays every animation clip of a Model Asset at once, looping, on event/onStart. The Asset is created only; attach it to an Entity with add_component (interaction.trigger) to make it run.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "modelAssetId": { "type": "string" },
                    "name": { "type": "string", "minLength": 1 },
                    "folderId": { "type": ["string", "null"] }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "modelAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "add_interactivity_node",
            "description": "Add any KHR_interactivity operation node to a graph. Known operations receive XRift socket templates; unknown operations remain canonical generic nodes, with an optional defining extension name.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "op": { "type": "string", "minLength": 1 },
                    "extension": { "type": "string", "minLength": 1 },
                    "position": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "op"],
                "additionalProperties": false
            }
        },
        {
            "name": "connect_interactivity_nodes",
            "description": "Connect two KHR_interactivity nodes through a named flow or value socket. Invalid references are rejected atomically. A flow cycle is a loop and is allowed; a value cycle cannot be evaluated and is rejected.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "kind": { "type": "string", "enum": ["flow", "value"] },
                    "sourceNode": { "type": "integer", "minimum": 0 },
                    "sourceSocket": { "type": "string", "minLength": 1 },
                    "targetNode": { "type": "integer", "minimum": 0 },
                    "targetSocket": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "kind", "sourceNode", "sourceSocket", "targetNode", "targetSocket"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_interactivity_value",
            "description": "Set a canonical inline value on a KHR_interactivity node input socket using a glTF type signature such as bool, int, float, float3, or ref.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "socket": { "type": "string", "minLength": 1 },
                    "signature": { "type": "string", "minLength": 1 },
                    "value": { "type": "array", "minItems": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex", "socket", "signature", "value"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_interactivity_configuration",
            "description": "Set a canonical operation configuration array, such as a pointer, event, variable, or type reference, on a KHR_interactivity node.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "key": { "type": "string", "minLength": 1 },
                    "value": { "type": "array", "minItems": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex", "key", "value"],
                "additionalProperties": false
            }
        },
        {
            "name": "configure_interactivity_material_pointer",
            "description": "Configure a pointer/get, pointer/set, or pointer/interpolate node to target a supported glTF Material property, including KHR_texture_transform tiling properties.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string" },
                    "presetId": {
                        "type": "string",
                        "enum": [
                            "base-color", "metallic", "roughness", "emissive",
                            "normal-scale", "occlusion-strength", "double-sided",
                            "base-color-tiling", "base-color-offset", "base-color-rotation",
                            "metallic-roughness-tiling", "normal-tiling", "occlusion-tiling",
                            "emissive-tiling"
                        ]
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex", "materialAssetId", "presetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "disconnect_interactivity_socket",
            "description": "Remove a named flow output or value input connection from a KHR_interactivity node.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "kind": { "type": "string", "enum": ["flow", "value"] },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "socket": { "type": "string", "minLength": 1 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "kind", "nodeIndex", "socket"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_interactivity_node",
            "description": "Delete a KHR_interactivity node and atomically reindex or remove every flow/value reference to it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex"],
                "additionalProperties": false
            }
        },
        {
            "name": "validate_interactivity_asset",
            "description": "Validate node declarations, references, inline types, graph indexes, and value cycles for a reusable KHR_interactivity Asset without changing the project. Also reports which nodes the Play runtime will not execute.",
            "inputSchema": {
                "type": "object",
                "properties": { "assetId": { "type": "string" } },
                "required": ["assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_interactivity_asset",
            "description": "Replace the whole KHR_interactivity extension of an Asset with canonical JSON. Writes a graph in one call instead of node by node; refused unless the JSON parses as a valid extension.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "extension": { "type": "object" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "extension"],
                "additionalProperties": false
            }
        },
        {
            "name": "simulate_interactivity_asset",
            "description": "Run a graph without a renderer and report what happens and when: animation starts and stops, property writes with the seconds they are spread over, events, logs, the first time each node runs, and which nodes are never reached. This is the Editor timeline as data and the way to debug delays, loops and dead branches. Changes nothing.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "entry": { "type": "string", "enum": ["start", "interact"] },
                    "horizonSeconds": { "type": "number", "exclusiveMinimum": 0, "maximum": 600 },
                    "stepSeconds": { "type": "number", "exclusiveMinimum": 0, "maximum": 1 }
                },
                "required": ["assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "add_interactivity_graph",
            "description": "Add a behavior graph to an Interactivity Asset, or copy an existing one with duplicateFromGraphIndex. An Asset holds up to 64 graphs, and every graph of an Asset runs.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "name": { "type": "string", "minLength": 1 },
                    "duplicateFromGraphIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_interactivity_graph",
            "description": "Rename a behavior graph, or make it the Asset's default graph with isDefault. The default is the graph used when a Model embeds the extension or an export runs a single graph.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1 },
                    "isDefault": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "graphIndex"],
                "additionalProperties": false
            }
        },
        {
            "name": "delete_interactivity_graph",
            "description": "Delete one behavior graph from an Interactivity Asset, keeping the default-graph index pointing where it did. The last remaining graph cannot be deleted.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "graphIndex"],
                "additionalProperties": false
            }
        },
        {
            "name": "move_interactivity_node",
            "description": "Move a node's card on the graph canvas. Set avoidOverlap to push it clear of the cards already there instead of landing on top of one.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "position": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
                    "avoidOverlap": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex", "position"],
                "additionalProperties": false
            }
        },
        {
            "name": "duplicate_interactivity_node",
            "description": "Copy a node with its inline values and configuration, placed clear of the original. Connections are not copied. Pass targetGraphIndex to paste it into another graph of the same Asset, where its operation and value types are resolved again.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "targetGraphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex"],
                "additionalProperties": false
            }
        },
        {
            "name": "layout_interactivity_graph",
            "description": "Lay every card of one graph out left to right in flow order, the same arrangement the Editor's align button produces. Use it after building a graph so an author opens a readable canvas.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "configure_interactivity_trigger_action",
            "description": "Point an xrift/setProperty or xrift/toggleProperty node at an Entity, Component and property from list_interaction_trigger_targets, and set its value, the seconds the change takes, and the easing curve. The value is written with the type the property needs, and an unknown Entity, Component or property is refused rather than saved as a graph that does nothing. Omit the target fields to adjust only the value, duration or easing of the action already configured.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "assetId": { "type": "string" },
                    "graphIndex": { "type": "integer", "minimum": 0 },
                    "nodeIndex": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "componentId": { "type": "string" },
                    "property": { "type": "string", "minLength": 1 },
                    "value": {},
                    "durationSeconds": { "type": "number", "minimum": 0 },
                    "easing": {
                        "type": "string",
                        "enum": [
                            "linear", "ease-in", "ease-out", "ease-in-out",
                            "ease-in-strong", "ease-out-strong", "ease-out-back"
                        ]
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "assetId", "nodeIndex"],
                "additionalProperties": false
            }
        },
        {
            "name": "list_interaction_trigger_targets",
            "description": "List every Entity and Component an Interaction Trigger action can write to, with the exact property names, value kinds, ranges and enum options each one accepts. Call this before wiring xrift/interaction action nodes: a property name that is not on this list validates as a graph and then does nothing at runtime.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// The allow-list is generated from the TypeScript registry, so its order
    /// follows that table rather than the order schemas happen to be written in
    /// here. What has to hold is that the two describe the same set of tools:
    /// a schema with no allow-list entry can never be called, and an allow-list
    /// entry with no schema is invisible to clients.
    #[test]
    fn tool_list_matches_the_generated_allow_list() {
        let tools = tool_definitions();
        let mut names: Vec<&str> = tools
            .as_array()
            .expect("tool list")
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        let schema_count = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), schema_count, "a tool schema is declared twice");

        let mut allowed: Vec<&str> = MCP_TOOL_NAMES.to_vec();
        allowed.sort_unstable();
        assert_eq!(names, allowed);
    }

    #[test]
    fn persistent_editor_writes_expose_revision_contracts() {
        let tools = tool_definitions();
        let tools = tools.as_array().expect("tool list");
        for name in [
            "import_audio_asset",
            "import_texture_asset",
            "update_texture_asset",
            "create_document_asset",
            "update_particle_asset",
            "update_component",
            "remove_component",
            "set_entity_enabled",
            "update_scene_settings",
        ] {
            let tool = tools
                .iter()
                .find(|tool| tool.get("name").and_then(Value::as_str) == Some(name))
                .unwrap_or_else(|| panic!("missing tool: {name}"));
            let required = tool
                .pointer("/inputSchema/required")
                .and_then(Value::as_array)
                .expect("required fields");
            for field in ["projectId", "sceneId", "expectedRevision"] {
                assert!(
                    required
                        .iter()
                        .any(|candidate| candidate.as_str() == Some(field)),
                    "{name} should require {field}"
                );
            }
        }

        let update_component = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("update_component"))
            .expect("update_component");
        assert_eq!(
            update_component
                .pointer("/inputSchema/properties/patch/minProperties")
                .and_then(Value::as_u64),
            Some(1)
        );
        assert!(
            update_component
                .pointer("/inputSchema/properties/patch/properties/maxDistance")
                .is_some(),
            "update_component should expose Mesh maxDistance"
        );

        let update_scene_settings = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("update_scene_settings"))
            .expect("update_scene_settings");
        for section in [
            "skybox",
            "fog",
            "ambient",
            "camera",
            "postprocessing",
            "vegetation",
            "editor",
        ] {
            assert_eq!(
                update_scene_settings
                    .pointer(&format!("/inputSchema/properties/{section}/minProperties"))
                    .and_then(Value::as_u64),
                Some(1),
                "{section} should reject an empty patch"
            );
        }
        assert_eq!(
            update_scene_settings
                .pointer("/inputSchema/anyOf")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(7)
        );
        // Wind drives both the transform-based Wind component and every
        // wind-aware Shader Material, so MCP has to be able to set it.
        assert!(
            update_scene_settings
                .pointer("/inputSchema/properties/vegetation/properties/windDirectionDegrees")
                .is_some(),
            "update_scene_settings should expose the scene wind direction"
        );
        assert!(
            update_scene_settings
                .get("description")
                .and_then(Value::as_str)
                .is_some_and(|description| {
                    description.contains("Edit") && description.contains("Play")
                }),
            "Scene settings should disclose Edit and Play support"
        );

        let import_texture = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("import_texture_asset"))
            .expect("import_texture_asset");
        assert_eq!(
            import_texture
                .pointer("/inputSchema/properties/sourcePath/maxLength")
                .and_then(Value::as_u64),
            Some(4096)
        );
        let import_audio = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("import_audio_asset"))
            .expect("import_audio_asset");
        assert_eq!(
            import_audio
                .pointer("/inputSchema/properties/sourcePath/maxLength")
                .and_then(Value::as_u64),
            Some(4096)
        );
        assert!(
            import_audio
                .get("description")
                .and_then(Value::as_str)
                .is_some_and(|description| {
                    description.contains("MP3")
                        && description.contains("WAV")
                        && description.contains("signature")
                        && description.contains("never")
                }),
            "Audio import should disclose validation and response privacy"
        );
        let get_audio = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("get_audio_asset"))
            .expect("get_audio_asset");
        assert!(
            get_audio
                .get("description")
                .and_then(Value::as_str)
                .is_some_and(|description| {
                    description.contains("project-relative")
                        && description.contains("never returned")
                }),
            "Audio reads should disclose managed metadata and response privacy"
        );
        let update_texture = tools
            .iter()
            .find(|tool| tool.get("name").and_then(Value::as_str) == Some("update_texture_asset"))
            .expect("update_texture_asset");
        assert_eq!(
            update_texture
                .pointer("/inputSchema/properties/patch/minProperties")
                .and_then(Value::as_u64),
            Some(1)
        );
    }

    #[test]
    fn supported_clients_are_allowlisted() {
        assert!(matches!(
            SupportedMcpClient::parse("codex"),
            Some(SupportedMcpClient::Codex)
        ));
        assert!(matches!(
            SupportedMcpClient::parse("claude-desktop"),
            Some(SupportedMcpClient::ClaudeDesktop)
        ));
        assert!(matches!(
            SupportedMcpClient::parse("opencode"),
            Some(SupportedMcpClient::OpenCode)
        ));
        assert!(matches!(
            SupportedMcpClient::parse("cursor"),
            Some(SupportedMcpClient::Cursor)
        ));
        assert!(matches!(
            SupportedMcpClient::parse("antigravity"),
            Some(SupportedMcpClient::Antigravity)
        ));
        assert!(SupportedMcpClient::parse("unknown").is_none());
    }

    #[cfg(windows)]
    #[test]
    fn codex_candidates_cover_supported_windows_install_methods() {
        let local_app_data = Path::new(r"C:\Users\fixture\AppData\Local");
        let candidates = windows_codex_local_app_data_candidates(local_app_data);

        assert!(candidates.contains(
            &local_app_data
                .join("Programs")
                .join("OpenAI")
                .join("Codex")
                .join("bin")
                .join("codex.exe")
        ));
        assert!(candidates.contains(&local_app_data.join("pnpm").join("codex.cmd")));
        assert!(candidates.contains(
            &local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("codex.exe")
        ));
    }

    #[test]
    fn codex_candidate_selection_skips_a_broken_install() {
        let broken = PathBuf::from("broken-codex");
        let working = PathBuf::from("working-codex");

        assert_eq!(
            select_codex_candidate([broken, working.clone()], |candidate| candidate == working),
            Some(working)
        );
    }

    #[test]
    fn ollama_integrations_are_allowlisted() {
        assert!(matches!(
            SupportedOllamaIntegration::parse("codex"),
            Some(SupportedOllamaIntegration::Codex)
        ));
        assert!(matches!(
            SupportedOllamaIntegration::parse("claude-code"),
            Some(SupportedOllamaIntegration::ClaudeCode)
        ));
        assert!(matches!(
            SupportedOllamaIntegration::parse("opencode"),
            Some(SupportedOllamaIntegration::OpenCode)
        ));
        assert!(SupportedOllamaIntegration::parse("cursor").is_none());
        assert!(SupportedOllamaIntegration::parse("unknown").is_none());
    }

    #[test]
    fn ollama_list_parser_only_returns_model_names() {
        let output = b"NAME          ID              SIZE      MODIFIED\nqwen3:14b     abcdef123456    9.3 GB    3 weeks ago\ngemma4:e2b    fedcba654321    7.2 GB    2 months ago\n";

        assert_eq!(
            parse_ollama_models(output),
            vec!["qwen3:14b".to_string(), "gemma4:e2b".to_string()]
        );
    }

    #[test]
    fn ollama_tool_capability_is_required() {
        let supported =
            b"  Capabilities\n    completion\n    tools\n    thinking\n\n  Parameters\n";
        let unsupported = b"  Capabilities\n    completion\n    vision\n\n  Parameters\n";

        assert!(ollama_model_supports_tools(supported));
        assert!(!ollama_model_supports_tools(unsupported));
    }

    #[test]
    fn opencode_ollama_config_preserves_mcp_and_selects_model() {
        let config = json!({
            "mcp": {
                MCP_SERVER_NAME: {
                    "type": "local",
                    "enabled": true
                }
            },
            "permission": {
                "bash": "ask"
            }
        });

        let merged = merge_opencode_ollama_config(config, "gemma4:e2b").expect("merge config");

        assert_eq!(
            merged.pointer("/mcp/xrift-studio/enabled"),
            Some(&json!(true))
        );
        assert_eq!(merged.pointer("/permission/bash"), Some(&json!("ask")));
        assert_eq!(merged.pointer("/model"), Some(&json!("ollama/gemma4:e2b")));
        assert_eq!(
            merged.pointer("/provider/ollama/options/baseURL"),
            Some(&json!("http://127.0.0.1:11434/v1"))
        );
        assert_eq!(
            merged.pointer("/provider/ollama/models/gemma4:e2b/name"),
            Some(&json!("gemma4:e2b"))
        );
    }

    #[test]
    fn command_failure_prefers_stderr_and_limits_detail() {
        let output = Output {
            status: ExitStatus::default(),
            stdout: b"stdout detail".to_vec(),
            stderr: b"Error: Ollama is not running\nsecond line\nthird line".to_vec(),
        };

        let message = command_failure_message("構成に失敗しました", &output);
        assert_eq!(
            message,
            "構成に失敗しました: Error: Ollama is not running second line"
        );
    }

    #[test]
    fn ollama_configuration_uses_fixed_non_launching_arguments() {
        assert_eq!(
            ollama_configuration_arguments(SupportedOllamaIntegration::ClaudeCode, "qwen3:14b"),
            vec![
                "launch",
                "claude",
                "--model",
                "qwen3:14b",
                "--config",
                "--yes",
            ]
        );
    }

    #[test]
    fn broker_rejects_connections_over_the_bounded_capacity() {
        let state = XriftMcpBrokerState::default();
        let permits: Vec<_> = (0..MCP_MAX_CONCURRENT_CONNECTIONS)
            .map(|_| state.connections.try_acquire().expect("connection permit"))
            .collect();

        assert!(state.connections.try_acquire().is_err());
        drop(permits);
        assert!(state.connections.try_acquire().is_ok());
    }

    #[tokio::test]
    async fn broker_serializes_editor_requests() {
        let state = XriftMcpBrokerState::default();
        let _first_request = state.request_lock.lock().await;

        assert!(
            tokio::time::timeout(Duration::from_millis(10), state.request_lock.lock())
                .await
                .is_err()
        );
    }

    #[test]
    fn editor_heartbeat_expires_after_the_lease_window() {
        let heartbeat = 100;

        assert!(editor_heartbeat_is_fresh(
            heartbeat,
            heartbeat + MCP_EDITOR_HEARTBEAT_TIMEOUT_MILLISECONDS
        ));
        assert!(!editor_heartbeat_is_fresh(
            heartbeat,
            heartbeat + MCP_EDITOR_HEARTBEAT_TIMEOUT_MILLISECONDS + 1
        ));
        assert!(!editor_heartbeat_is_fresh(0, heartbeat));
    }

    #[test]
    fn claude_registration_separates_the_stdio_command_from_cli_options() {
        let arguments = registration_arguments(
            SupportedMcpClient::ClaudeCode,
            Path::new("xrift-studio-mcp"),
            Path::new("rendezvous.json"),
        )
        .expect("Claude Code registration arguments");
        assert_eq!(
            arguments,
            vec![
                "mcp",
                "add",
                "--scope",
                "user",
                MCP_SERVER_NAME,
                "--",
                "xrift-studio-mcp",
                "--rendezvous",
                "rendezvous.json",
            ]
        );
    }

    #[test]
    fn claude_desktop_registration_preserves_existing_settings() {
        let config = json!({
            "preferences": { "theme": "dark" },
            "mcpServers": {
                "existing-server": {
                    "command": "existing-command"
                }
            }
        });
        let merged = merge_mcp_servers_config(
            config,
            Path::new("xrift-studio-mcp"),
            Path::new("rendezvous.json"),
            "Claude Desktop",
        )
        .expect("merge Claude Desktop config");

        assert_eq!(merged.pointer("/preferences/theme"), Some(&json!("dark")));
        assert_eq!(
            merged.pointer("/mcpServers/existing-server/command"),
            Some(&json!("existing-command"))
        );
        assert_eq!(
            merged.pointer("/mcpServers/xrift-studio/command"),
            Some(&json!("xrift-studio-mcp"))
        );
        assert_eq!(
            merged.pointer("/mcpServers/xrift-studio/args"),
            Some(&json!(["--rendezvous", "rendezvous.json"]))
        );
    }

    #[test]
    fn cursor_registration_preserves_existing_servers() {
        let config = json!({
            "mcpServers": {
                "existing-server": { "command": "existing-command" }
            }
        });
        let merged = merge_mcp_servers_config(
            config,
            Path::new("xrift-studio-mcp"),
            Path::new("rendezvous.json"),
            "Cursor",
        )
        .expect("merge Cursor config");

        assert_eq!(
            merged.pointer("/mcpServers/existing-server/command"),
            Some(&json!("existing-command"))
        );
        assert_eq!(
            merged.pointer("/mcpServers/xrift-studio/command"),
            Some(&json!("xrift-studio-mcp"))
        );
    }

    #[test]
    fn antigravity_registration_preserves_existing_servers() {
        let config = json!({
            "mcpServers": {
                "existing-server": { "command": "existing-command" }
            }
        });
        let merged = merge_mcp_servers_config(
            config,
            Path::new("xrift-studio-mcp"),
            Path::new("rendezvous.json"),
            "Antigravity",
        )
        .expect("merge Antigravity config");

        assert_eq!(
            merged.pointer("/mcpServers/existing-server/command"),
            Some(&json!("existing-command"))
        );
        assert_eq!(
            merged.pointer("/mcpServers/xrift-studio/command"),
            Some(&json!("xrift-studio-mcp"))
        );
    }

    #[test]
    fn opencode_registration_uses_local_command_array_and_preserves_settings() {
        let config = json!({
            "$schema": "https://opencode.ai/config.json",
            "mcp": {
                "existing-server": { "type": "remote", "url": "https://example.com/mcp" }
            }
        });
        let merged = merge_opencode_config(
            config,
            Path::new("xrift-studio-mcp"),
            Path::new("rendezvous.json"),
        )
        .expect("merge OpenCode config");

        assert_eq!(
            merged.pointer("/$schema"),
            Some(&json!("https://opencode.ai/config.json"))
        );
        assert_eq!(
            merged.pointer("/mcp/existing-server/url"),
            Some(&json!("https://example.com/mcp"))
        );
        assert_eq!(
            merged.pointer("/mcp/xrift-studio/type"),
            Some(&json!("local"))
        );
        assert_eq!(
            merged.pointer("/mcp/xrift-studio/command"),
            Some(&json!([
                "xrift-studio-mcp",
                "--rendezvous",
                "rendezvous.json"
            ]))
        );
        assert_eq!(
            merged.pointer("/mcp/xrift-studio/enabled"),
            Some(&json!(true))
        );
    }

    #[test]
    fn limited_line_discards_an_oversized_message_and_recovers() {
        let mut input = vec![b'x'; 9];
        input.extend_from_slice(b"\n{}\n");
        let mut reader = Cursor::new(input);

        assert!(matches!(
            read_limited_line(&mut reader, 8).expect("oversized line"),
            LimitedLine::TooLarge
        ));
        match read_limited_line(&mut reader, 8).expect("next line") {
            LimitedLine::Line(line) => assert_eq!(line, b"{}\n"),
            _ => panic!("expected the next bounded line"),
        }
        assert!(matches!(
            read_limited_line(&mut reader, 8).expect("end of input"),
            LimitedLine::Eof
        ));
    }

    #[test]
    fn token_hex_encoding_has_a_stable_width() {
        assert_eq!(
            bytes_to_hex(&[0x00, 0x0f, 0x10, 0xff]),
            "000f10ff".to_string()
        );
    }

    #[test]
    fn registered_command_parser_supports_codex_and_claude_output() {
        let codex = b"xrift-studio\n  enabled: true\n  command: C:\\MCP\\server.exe\n";
        let claude = b"xrift-studio:\n  Scope: User config\n  Command: C:\\MCP\\server.exe\n";

        assert_eq!(
            parse_registered_command(codex),
            Some(PathBuf::from(r"C:\MCP\server.exe"))
        );
        assert_eq!(
            parse_registered_command(claude),
            Some(PathBuf::from(r"C:\MCP\server.exe"))
        );
    }

    #[test]
    fn registration_sidecar_name_changes_with_binary_content() {
        let directory = Path::new("mcp-bin");
        let first = registration_sidecar_destination_for_payload(b"first", directory);
        let second = registration_sidecar_destination_for_payload(b"second", directory);

        assert_ne!(first, second);
        assert_eq!(first.parent(), Some(directory));
        assert!(first
            .file_stem()
            .and_then(OsStr::to_str)
            .is_some_and(|name| name.starts_with("xrift-studio-mcp-")));
    }
}
