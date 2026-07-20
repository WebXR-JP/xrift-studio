use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex};

const MCP_SERVER_NAME: &str = "xrift-studio";
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const MCP_RENDEZVOUS_SCHEMA_VERSION: u32 = 1;
const MCP_EVENT_NAME: &str = "xrift-mcp-editor-request";
const MCP_REQUEST_TIMEOUT_SECONDS: u64 = 30;
const MCP_MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MCP_TOOL_NAMES: [&str; 4] = [
    "get_editor_context",
    "list_assets",
    "update_scene_settings",
    "place_asset",
];

#[derive(Default)]
pub struct XriftMcpBrokerState {
    pending: Mutex<HashMap<String, oneshot::Sender<XriftMcpEditorResponse>>>,
    request_lock: Mutex<()>,
    editor_ready: AtomicBool,
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
    pub message: String,
}

#[derive(Clone, Copy, Debug)]
enum SupportedMcpClient {
    Codex,
    ClaudeCode,
}

impl SupportedMcpClient {
    fn all() -> [Self; 2] {
        [Self::Codex, Self::ClaudeCode]
    }

    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
        }
    }

    fn command_name(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::all().into_iter().find(|client| client.id() == value)
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
    state.editor_ready.store(ready, Ordering::Release);
}

#[tauri::command]
pub async fn detect_xrift_mcp_clients(app: AppHandle) -> Result<Vec<XriftMcpClientStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        SupportedMcpClient::all()
            .into_iter()
            .map(detect_client)
            .collect()
    })
    .await
    .map_err(|error| format!("AI clientの確認に失敗しました: {error}"))
    .map(|statuses| {
        let _ = app;
        statuses
    })
}

#[tauri::command]
pub async fn register_xrift_mcp_client(
    app: AppHandle,
    client_id: String,
) -> Result<XriftMcpClientStatus, String> {
    let client = SupportedMcpClient::parse(&client_id)
        .ok_or_else(|| "対応していないAI clientです".to_string())?;
    let sidecar_path = resolve_sidecar_path()?;
    let rendezvous_path = rendezvous_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let executable = find_client_executable(client).ok_or_else(|| {
            format!(
                "{}が見つかりません。先にclientをinstallしてください",
                client.label()
            )
        })?;
        if client_is_registered(client, &executable) {
            return Ok(client_status(client, true, true, "登録済み"));
        }
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
            ],
        };
        arguments.push(sidecar_path.to_string_lossy().into_owned());
        arguments.push("--rendezvous".into());
        arguments.push(rendezvous_path.to_string_lossy().into_owned());
        let status = run_client_command(&executable, &arguments)
            .map_err(|error| format!("{}への登録を開始できません: {error}", client.label()))?;
        if !status.success() {
            return Err(format!(
                "{}へ登録できませんでした。client側のMCP設定を確認してください",
                client.label()
            ));
        }
        Ok(client_status(client, true, true, "登録しました"))
    })
    .await
    .map_err(|error| format!("AI clientへの登録に失敗しました: {error}"))?
}

async fn handle_broker_connection(
    app: AppHandle,
    stream: TcpStream,
    expected_token: String,
) -> Result<(), String> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = tokio::io::BufReader::new(reader);
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
        .await
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

    let state = app.state::<XriftMcpBrokerState>();
    if !state.editor_ready.load(Ordering::Acquire) {
        return write_broker_error(
            &mut writer,
            envelope.request.id,
            "EDITOR_UNAVAILABLE",
            "Visual EditorでProjectを開いてから再試行してください",
        )
        .await;
    }
    let _request_guard = state.request_lock.lock().await;
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

fn create_session_token(app: &AppHandle, port: u16) -> String {
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

fn detect_client(client: SupportedMcpClient) -> XriftMcpClientStatus {
    let Some(executable) = find_client_executable(client) else {
        return client_status(client, false, false, "未検出");
    };
    let registered = client_is_registered(client, &executable);
    client_status(
        client,
        true,
        registered,
        if registered {
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
        message: message.to_string(),
    }
}

fn client_is_registered(client: SupportedMcpClient, executable: &Path) -> bool {
    run_client_command(
        executable,
        &["mcp".into(), "get".into(), MCP_SERVER_NAME.into()],
    )
    .map(|status| status.success())
    .unwrap_or(false)
        && matches!(
            client,
            SupportedMcpClient::Codex | SupportedMcpClient::ClaudeCode
        )
}

fn find_client_executable(client: SupportedMcpClient) -> Option<PathBuf> {
    find_command_on_path(client.command_name())
}

fn find_command_on_path(command_name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let directories: Vec<PathBuf> = std::env::split_paths(&path).collect();
    #[cfg(windows)]
    let extensions = ["exe", "cmd", "bat"];
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
    command.stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = command.spawn().map_err(|error| error.to_string())?;
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

fn resolve_sidecar_path() -> Result<PathBuf, String> {
    let binary_name = if cfg!(windows) {
        "xrift-studio-mcp.exe"
    } else {
        "xrift-studio-mcp"
    };
    let mut candidates = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(binary_name));
        }
    }
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
    let mut stdout = std::io::stdout().lock();
    let mut client_name = "AI client".to_string();
    let request_counter = AtomicU64::new(1);
    for line in BufReader::new(stdin.lock()).lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.len() > MCP_MAX_MESSAGE_BYTES {
            write_json_rpc_error(&mut stdout, Value::Null, -32600, "Request is too large")?;
            continue;
        }
        let message: Value = match serde_json::from_str(&line) {
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
                client_name = name.to_string();
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
                    "instructions": "Call get_editor_context before a write. Send projectId, sceneId, and expectedRevision with each write, then verify the result. XRift Studio must be open with a visual project."
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
            MCP_REQUEST_TIMEOUT_SECONDS + 2,
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
    BufReader::new(stream)
        .read_line(&mut response)
        .map_err(|error| error.to_string())?;
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
        }
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(SupportedMcpClient::parse("unknown").is_none());
    }
}
