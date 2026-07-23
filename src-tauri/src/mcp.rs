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
const MCP_EDITOR_HEARTBEAT_TIMEOUT_MILLISECONDS: u64 = 15_000;
const MCP_MAX_CONCURRENT_CONNECTIONS: usize = 32;
const MCP_MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MCP_MAX_CLIENT_NAME_CHARS: usize = 128;
const MCP_TOOL_NAMES: [&str; 31] = [
    "get_editor_context",
    "list_assets",
    "search_external_assets",
    "get_external_asset_options",
    "install_external_asset",
    "update_scene_settings",
    "place_asset",
    "list_entities",
    "create_primitive",
    "place_builtin_prefab",
    "add_component",
    "update_transform",
    "set_material",
    "get_material_asset",
    "update_material_asset",
    "set_material_texture_transform",
    "rename_entity",
    "duplicate_entity",
    "delete_entity",
    "create_empty_entity",
    "list_interactivity_operations",
    "get_interactivity_asset",
    "create_interactivity_asset",
    "add_interactivity_node",
    "connect_interactivity_nodes",
    "set_interactivity_value",
    "set_interactivity_configuration",
    "configure_interactivity_material_pointer",
    "disconnect_interactivity_socket",
    "delete_interactivity_node",
    "validate_interactivity_asset",
];
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
}

impl SupportedMcpClient {
    fn all() -> [Self; 5] {
        [
            Self::Codex,
            Self::ClaudeCode,
            Self::ClaudeDesktop,
            Self::OpenCode,
            Self::Cursor,
        ]
    }

    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::ClaudeDesktop => "claude-desktop",
            Self::OpenCode => "opencode",
            Self::Cursor => "cursor",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
            Self::ClaudeDesktop => "Claude Desktop / Cowork",
            Self::OpenCode => "OpenCode",
            Self::Cursor => "Cursor",
        }
    }

    fn command_name(self) -> Option<&'static str> {
        match self {
            Self::Codex => Some("codex"),
            Self::ClaudeCode => Some("claude"),
            Self::ClaudeDesktop => None,
            Self::OpenCode => Some("opencode"),
            Self::Cursor => Some("cursor"),
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
        token: create_session_token(app, port),
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
        | SupportedMcpClient::Cursor => return None,
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

fn create_session_token(app: &AppHandle, port: u16) -> String {
    let mut random = [0_u8; 32];
    if getrandom::fill(&mut random).is_ok() {
        return bytes_to_hex(&random);
    }

    // OS randomness should be available on supported desktop platforms. Keep
    // a per-process fallback so a transient provider failure does not prevent
    // the editor itself from starting.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let mut digest = Sha256::new();
    digest.update(app.package_info().name.as_bytes());
    digest.update(std::process::id().to_le_bytes());
    digest.update(port.to_le_bytes());
    digest.update(now.to_le_bytes());
    format!("{:x}", digest.finalize())
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
    )
}

fn managed_config_path(client: SupportedMcpClient) -> Option<PathBuf> {
    match client {
        SupportedMcpClient::ClaudeDesktop => claude_desktop_config_path(),
        SupportedMcpClient::OpenCode => opencode_config_path(),
        SupportedMcpClient::Cursor => cursor_config_path(),
        SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode => None,
    }
}

fn managed_config_client_installed(client: SupportedMcpClient) -> bool {
    let Some(config_path) = managed_config_path(client) else {
        return false;
    };
    let config_location_exists =
        config_path.is_file() || config_path.parent().is_some_and(Path::is_dir);
    config_location_exists || find_client_executable(client).is_some()
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

fn managed_config_registration_command(client: SupportedMcpClient) -> Option<PathBuf> {
    let config_path = managed_config_path(client)?;
    let config = read_json_file(&config_path).ok().flatten()?;
    match client {
        SupportedMcpClient::ClaudeDesktop | SupportedMcpClient::Cursor => config
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
        SupportedMcpClient::ClaudeDesktop | SupportedMcpClient::Cursor => {
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
    let models = run_ollama_command_output(&executable, &["list".into()])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| parse_ollama_models(&output.stdout))
        .unwrap_or_default();
    let message = if !launch_supported {
        "更新するとAI clientを構成できます"
    } else if models.is_empty() {
        "Ollamaを起動し、modelを追加してください"
    } else {
        "ローカルmodelを利用できます"
    };

    XriftOllamaStatus {
        installed: true,
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
    if find_client_executable(integration.mcp_client()).is_none() {
        return Err(format!(
            "{}が見つかりません。先にclientをinstallしてください",
            integration.label()
        ));
    }
    let list_output = run_ollama_command_output(&executable, &["list".into()])
        .map_err(|_| "Ollamaへ接続できません。Ollamaを起動して再試行してください".to_string())?;
    if !list_output.status.success() {
        return Err("Ollamaへ接続できません。Ollamaを起動して再試行してください".to_string());
    }
    let models = parse_ollama_models(&list_output.stdout);
    if model.is_empty() || !models.iter().any(|candidate| candidate == model) {
        return Err("選択したOllama modelが見つかりません。再検出してください".to_string());
    }
    let show_output = run_ollama_command_output(&executable, &["show".into(), model.into()])
        .map_err(|_| "Ollama modelの機能を確認できませんでした".to_string())?;
    if !show_output.status.success() {
        return Err("Ollama modelの機能を確認できませんでした".to_string());
    }
    if !ollama_model_supports_tools(&show_output.stdout) {
        return Err(
            "このOllama modelはtool callingに対応していません。別のmodelを選んでください"
                .to_string(),
        );
    }

    let arguments = ollama_configuration_arguments(integration, model);
    let status = run_ollama_command(&executable, &arguments)
        .map_err(|error| format!("Ollamaのclient構成を完了できません: {error}"))?;
    if !status.success() {
        return Err(format!(
            "Ollamaで{}を構成できませんでした。client側のmodel設定を確認してください",
            integration.label()
        ));
    }

    Ok(XriftOllamaConfigurationResult {
        integration_id: integration.id().to_string(),
        integration_label: integration.label().to_string(),
        model: model.to_string(),
        message: "構成しました。clientを起動または再起動してください".to_string(),
    })
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

fn run_ollama_command(executable: &Path, arguments: &[String]) -> Result<ExitStatus, String> {
    let mut command = ollama_command(executable, arguments);
    command.stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn().map_err(|error| error.to_string())?;
    wait_for_client_command(child)
}

fn run_ollama_command_output(executable: &Path, arguments: &[String]) -> Result<Output, String> {
    let mut command = ollama_command(executable, arguments);
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
    let deadline = Instant::now() + Duration::from_secs(10);
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
                    "instructions": "Call get_editor_context before a write. Send projectId, sceneId, and expectedRevision with each write, then verify the result. For portable behavior, call list_interactivity_operations, author a KHR_interactivity Asset, and validate it after edits. If EDITOR_BUSY or STALE_REVISION is returned, wait briefly, fetch context again, and retry from the latest revision. XRift Studio must be open with a visual project."
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

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_editor_context",
            "description": "Read the currently open XRift Studio project, scene, selection, mode, save state, and revision. Call this before a write.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
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
            "name": "search_external_assets",
            "description": "Search the Poly Haven catalog for CC0 HDRIs, textures/materials, and models. Returns external IDs that can be passed to the option and install tools.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "providerId": { "type": "string", "enum": ["poly-haven"] },
                    "query": { "type": "string" },
                    "kind": { "type": "string", "enum": ["hdri", "texture", "model"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 120 }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_external_asset_options",
            "description": "List installable resolutions and formats for a Poly Haven external asset.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "providerId": { "type": "string", "enum": ["poly-haven"] },
                    "externalId": { "type": "string" }
                },
                "required": ["externalId"],
                "additionalProperties": false
            }
        },
        {
            "name": "install_external_asset",
            "description": "Download a Poly Haven HDRI, PBR texture bundle, or model into the open project and create XRift Studio assets. Models are validated and saved as self-contained glTF.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "providerId": { "type": "string", "enum": ["poly-haven"] },
                    "externalId": { "type": "string" },
                    "resolution": { "type": "string", "enum": ["1k", "2k", "4k", "8k", "16k", "24k"] },
                    "format": { "type": "string", "enum": ["hdr", "exr"] },
                    "applySkybox": { "type": "boolean" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "externalId", "resolution"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_scene_settings",
            "description": "Update Fog settings in the current XRift Studio scene through the editor history and autosave pipeline.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "fog": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
                            "near": { "type": "number", "minimum": 0 },
                            "far": { "type": "number", "exclusiveMinimum": 0 }
                        },
                        "additionalProperties": false
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "fog"],
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
            "name": "add_component",
            "description": "Add a component (light, collider, mesh renderer, particle emitter, audio source, spawn point, or an XRift component such as Interactable, Grabbable, Mirror, Skybox, VideoScreen, VideoPlayer, LiveVideoPlayer, Video180Sphere, ScreenShareDisplay, SpawnPoint, TextInput, TagBoard, Portal, or BillboardY) to an existing entity.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "entityId": { "type": "string" },
                    "definitionId": {
                        "type": "string",
                        "enum": [
                            "core.mesh",
                            "physics.box-collider",
                            "physics.mesh-collider",
                            "core.light.ambient",
                            "core.light.directional",
                            "core.light.hemisphere",
                            "core.light.point",
                            "core.light.spot",
                            "core.light.area",
                            "core.spawn",
                            "core.particle",
                            "core.audio-source",
                            "xrift.interactable",
                            "xrift.grabbable",
                            "xrift.mirror",
                            "xrift.skybox",
                            "xrift.video-screen",
                            "xrift.video-player",
                            "xrift.live-video-player",
                            "xrift.video-180-sphere",
                            "xrift.screen-share-display",
                            "xrift.spawn-point",
                            "xrift.text-input",
                            "xrift.tag-board",
                            "xrift.portal",
                            "xrift.billboard-y"
                        ]
                    }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "entityId", "definitionId"],
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
            "description": "Assign a material asset to a mesh slot on an existing entity.",
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
            "description": "Read a Material Asset with canonical glTF material properties and KHR_texture_transform values.",
            "inputSchema": {
                "type": "object",
                "properties": { "materialAssetId": { "type": "string" } },
                "required": ["materialAssetId"],
                "additionalProperties": false
            }
        },
        {
            "name": "update_material_asset",
            "description": "Update canonical glTF Material Asset properties, including PBR factors, texture slots, alpha settings, and supported KHR_materials extensions.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "materialAssetId": { "type": "string" },
                    "patch": { "type": "object" }
                },
                "required": ["projectId", "sceneId", "expectedRevision", "materialAssetId", "patch"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_material_texture_transform",
            "description": "Set glTF KHR_texture_transform tiling (scale), offset, rotation, and TEXCOORD set for a Material texture slot. The slot must already contain a Texture Asset.",
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
            "description": "Create a reusable KHR_interactivity Asset. Use animation-on-start for a spec-shaped event/onStart to animation/start sample, or empty to build a graph incrementally.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": { "type": "string" },
                    "sceneId": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "name": { "type": "string", "minLength": 1 },
                    "folderId": { "type": ["string", "null"] },
                    "template": { "type": "string", "enum": ["animation-on-start", "empty"] }
                },
                "required": ["projectId", "sceneId", "expectedRevision"],
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
            "description": "Connect two KHR_interactivity nodes through a named flow or value socket. Invalid references and flow cycles are rejected atomically.",
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
            "description": "Validate node declarations, references, inline types, graph indexes, and acyclic flow for a reusable KHR_interactivity Asset without changing the project.",
            "inputSchema": {
                "type": "object",
                "properties": { "assetId": { "type": "string" } },
                "required": ["assetId"],
                "additionalProperties": false
            }
        }
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn tool_list_exposes_the_initial_editor_surface() {
        let tools = tool_definitions();
        let names: Vec<&str> = tools
            .as_array()
            .expect("tool list")
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        assert_eq!(names, MCP_TOOL_NAMES);
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
