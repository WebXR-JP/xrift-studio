//! Native ChatGPT connection. Renewable credentials are kept only in the OS vault.
pub(crate) mod pi;
mod pi_transport;
mod vault;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Mutex, Notify},
};

const AUTH: &str = "https://auth.openai.com";
const API: &str = "https://api.openai.com/v1";
const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
pub struct ChatgptState(
    pub Mutex<Option<Session>>,
    std::sync::Mutex<Connection>,
    std::sync::Mutex<Option<Arc<GenerationControl>>>,
    Arc<dyn CredentialStore>,
    std::sync::Mutex<Option<Registration>>,
    Arc<dyn RefreshTransport>,
    std::sync::Mutex<std::collections::VecDeque<String>>,
);
impl Default for ChatgptState {
    fn default() -> Self {
        Self(
            Mutex::new(None),
            std::sync::Mutex::new(Connection::default()),
            std::sync::Mutex::new(None),
            Arc::new(OsCredentialStore),
            std::sync::Mutex::new(None),
            Arc::new(OpenAiRefreshTransport),
            std::sync::Mutex::new(std::collections::VecDeque::new()),
        )
    }
}
#[derive(Clone)]
pub struct Session {
    client_id: String,
    subject: String,
    email: Option<String>,
    id_token: String,
    access_token: String,
    refresh_token: Option<String>,
    scopes: Vec<String>,
    expires_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
struct Registration {
    client_id: String,
    subject: String,
    email: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct SavedSession {
    version: u8,
    registration: Registration,
    refresh_token: String,
    scopes: Vec<String>,
    refresh_expires_at: u64,
}
const VAULT_SERVICE: &str = "net.xrift.studio.chatgpt";
const SESSION_ENTRY: &str = "renewable-session-v1";
const REGISTRATION_ENTRY: &str = "account-registration-v1";
const REFRESH_LIFETIME: u64 = 30 * 24 * 60 * 60;
trait CredentialStore: Send + Sync {
    fn read(&self, entry: &str) -> Result<Option<String>, String>;
    fn write(&self, entry: &str, value: &str) -> Result<(), String>;
    fn delete(&self, entry: &str) -> Result<(), String>;
}
struct OsCredentialStore;
struct GenerationControl {
    id: String,
    cancelled: AtomicBool,
    notify: Notify,
}
impl GenerationControl {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.notify.notify_one();
    }
    async fn cancellation(&self) {
        if !self.cancelled.load(Ordering::Acquire) {
            self.notify.notified().await;
        }
    }
}
struct GenerationLease<'a> {
    state: &'a ChatgptState,
    control: Arc<GenerationControl>,
}
impl Drop for GenerationLease<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.2.lock() {
            if active
                .as_ref()
                .is_some_and(|v| Arc::ptr_eq(v, &self.control))
            {
                *active = None;
            }
        }
    }
}
fn ensure_no_generation(state: &ChatgptState) -> Result<(), String> {
    if state
        .2
        .lock()
        .map_err(|_| "生成状態を確認できませんでした")?
        .is_some()
    {
        return Err("生成を停止するか、完了してから接続を変更してください".into());
    }
    Ok(())
}
fn begin_generation(
    state: &ChatgptState,
    id: Option<String>,
) -> Result<GenerationLease<'_>, String> {
    let id = id.map(Ok).unwrap_or_else(random)?;
    if id.is_empty()
        || id.len() > 160
        || !id
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || v == b'-' || v == b'_')
    {
        return Err("生成の識別子が不正です".into());
    }
    let cancelled = state
        .6
        .lock()
        .map_err(|_| "停止済みの制作を確認できませんでした")?;
    if cancelled.contains(&id) {
        return Err("停止した制作は再実行できません。新しい依頼として送信してください".into());
    }
    let mut active = state
        .2
        .lock()
        .map_err(|_| "生成状態を確認できませんでした")?;
    if active.is_some() {
        return Err("別の生成が進行中です。停止するか、完了後に実行してください".into());
    }
    let control = Arc::new(GenerationControl {
        id,
        cancelled: AtomicBool::new(false),
        notify: Notify::new(),
    });
    *active = Some(control.clone());
    Ok(GenerationLease { state, control })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancellationResult {
    generation_id: String,
    cancelled: bool,
}
#[tauri::command]
pub async fn chatgpt_cancel_generation(
    state: tauri::State<'_, ChatgptState>,
    generation_id: String,
) -> Result<CancellationResult, String> {
    cancel_generation(&state, generation_id)
}
pub(crate) fn cancel_generation(
    state: &ChatgptState,
    generation_id: String,
) -> Result<CancellationResult, String> {
    // Closing admission also covers cancellation arriving before native startup.
    let mut closed = state
        .6
        .lock()
        .map_err(|_| "制作の停止を記録できませんでした")?;
    if !closed.contains(&generation_id) {
        closed.push_back(generation_id.clone());
    }
    while closed.len() > 128 {
        closed.pop_front();
    }
    let modeling_cancelled = crate::blender_modeling::cancel_generation(&generation_id);
    let active = state
        .2
        .lock()
        .map_err(|_| "生成状態を確認できませんでした")?;
    let cancelled = active.as_ref().is_some_and(|v| {
        if v.id == generation_id {
            v.cancel();
            true
        } else {
            false
        }
    });
    let cancelled = modeling_cancelled || cancelled;
    Ok(CancellationResult {
        generation_id,
        cancelled,
    })
}
async fn run_cancellable<T>(
    control: &GenerationControl,
    timeout: Duration,
    operation: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::select! {
        biased;
        _ = control.cancellation() => Err("生成を停止しました。作品の編集を続けられます".into()),
        result = tokio::time::timeout(timeout, operation) => {
            result.map_err(|_| "制作の処理が時間切れになりました。通信状態を確認し、依頼を絞って再試行してください".to_string())?
        }
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    signed_in: bool,
    account_id: Option<String>,
    email: Option<String>,
    plan_usage_enabled: bool,
    connecting: bool,
    restoring: bool,
    error: Option<String>,
}
fn connection(session: Option<&Session>) -> Connection {
    Connection {
        signed_in: session.is_some(),
        account_id: session.map(account_id),
        email: session.and_then(|s| s.email.clone()),
        plan_usage_enabled: session
            .is_some_and(|s| s.scopes.iter().any(|v| v == "chatgpt.tokens.use.direct")),
        connecting: false,
        restoring: false,
        error: None,
    }
}
fn account_id(session: &Session) -> String {
    let mut hash = Sha256::new();
    // Length-prefix the issued registration so two adjacent fields cannot
    // collide. The public summary must contain neither claims nor tokens.
    hash.update((session.client_id.len() as u64).to_be_bytes());
    hash.update(session.client_id.as_bytes());
    hash.update(session.subject.as_bytes());
    URL_SAFE_NO_PAD.encode(hash.finalize())
}
fn check_catalog_account(status: &Connection, expected: &str) -> Result<(), String> {
    if !status.signed_in
        || !status.plan_usage_enabled
        || status.connecting
        || status.restoring
        || status.account_id.as_deref() != Some(expected)
    {
        return Err(
            "ChatGPTの接続が変わりました。現在の接続でモデル一覧を取得し直してください".into(),
        );
    }
    Ok(())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "認証用の乱数を作れませんでした".to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
fn client(timeout: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(timeout))
        .build()
        .map_err(|_| "ChatGPTの接続を準備できませんでした".into())
}
fn form_body(fields: &[(&str, &str)]) -> String {
    let mut url = reqwest::Url::parse("https://form.invalid").unwrap();
    url.query_pairs_mut().extend_pairs(fields.iter().copied());
    url.query().unwrap_or_default().to_string()
}

async fn response_json(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|_| "ChatGPTの応答を読み取れませんでした".to_string())?;
    if !status.is_success() {
        return Err(format!(
            "ChatGPTからの応答: HTTP {}{}",
            status.as_u16(),
            error_code(&value)
        ));
    }
    Ok(value)
}
fn error_code(value: &Value) -> String {
    let code = oauth_error_code(value).unwrap_or("");
    if !code.is_empty()
        && code.len() <= 100
        && code
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        format!(" ({code})")
    } else {
        String::new()
    }
}
fn oauth_error_code(value: &Value) -> Option<&str> {
    value
        .pointer("/error/code")
        .or_else(|| value.get("code"))
        .or_else(|| value.get("error"))
        .and_then(Value::as_str)
}
fn terminal_refresh_error(value: &Value) -> bool {
    matches!(
        oauth_error_code(value),
        Some(
            "invalid_grant"
                | "invalid_refresh_token"
                | "token_expired"
                | "refresh_token_expired"
                | "refresh_token_invalidated"
                | "refresh_token_reused"
        )
    )
}
fn host_id(app: &AppHandle) -> Result<String, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "アプリの保存先を確認できませんでした".to_string())?;
    std::fs::create_dir_all(&root)
        .map_err(|_| "アプリの保存先を用意できませんでした".to_string())?;
    let path = root.join("chatgpt-host-id.txt");
    if let Ok(value) = std::fs::read_to_string(&path) {
        if value.starts_with("urn:uuid:") && value.len() == 45 {
            return Ok(value);
        }
    }
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|_| "端末IDを作れませんでした".to_string())?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|v| format!("{v:02x}")).collect();
    let value = format!(
        "urn:uuid:{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    );
    std::fs::write(path, &value).map_err(|_| "端末IDを保存できませんでした".to_string())?;
    Ok(value)
}
fn parse_callback(
    target: &str,
    state: &str,
    previous: Option<&str>,
) -> Result<(String, String), String> {
    let uri = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "認証の応答が不正です".to_string())?;
    let args: std::collections::HashMap<_, _> = uri.query_pairs().into_owned().collect();
    if uri.path() != "/auth/callback" || args.get("state").map(String::as_str) != Some(state) {
        return Err("認証の状態が一致しません".into());
    }
    if args.contains_key("error") {
        return Err("ChatGPTへの接続がキャンセルされました".into());
    }
    let issued = args.get("client_id").map(String::as_str);
    if previous.is_some() && issued.is_some() && previous != issued {
        return Err("認証先の登録が一致しません".into());
    }
    let id = previous
        .or(issued)
        .filter(|v| !v.is_empty() && *v != "dynamic_agent_client")
        .ok_or("認証先の登録を確認できませんでした")?;
    let code = args
        .get("code")
        .filter(|v| !v.is_empty())
        .ok_or("認証コードがありません")?;
    Ok((code.clone(), id.to_string()))
}
fn verify_identity(jwt: &str, client_id: &str, nonce: &str, keys: &Value) -> Result<Value, String> {
    verify_identity_with_nonce(jwt, client_id, Some(nonce), keys)
}
fn verify_identity_with_nonce(
    jwt: &str,
    client_id: &str,
    nonce: Option<&str>,
    keys: &Value,
) -> Result<Value, String> {
    let parts: Vec<_> = jwt.split('.').collect();
    let invalid = || "ChatGPTの本人確認に失敗しました".to_string();
    if parts.len() != 3 {
        return Err(invalid());
    }
    let decode = |part: &str| -> Result<Value, String> {
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(part).map_err(|_| invalid())?)
            .map_err(|_| invalid())
    };
    let header = decode(parts[0])?;
    let claims = decode(parts[1])?;
    if header["alg"] != "RS256" {
        return Err(identity_error("署名方式が対応していません"));
    }
    validate_identity_claims_with_nonce(&claims, client_id, nonce)?;
    let key = keys["keys"]
        .as_array()
        .and_then(|v| {
            v.iter().find(|k| {
                k["kid"] == header["kid"]
                    && k["kty"] == "RSA"
                    && (k["use"].is_null() || k["use"] == "sig")
            })
        })
        .ok_or_else(|| identity_error("署名を確認する鍵が見つかりません"))?;
    let n = URL_SAFE_NO_PAD
        .decode(key["n"].as_str().ok_or_else(invalid)?)
        .map_err(|_| invalid())?;
    let e = URL_SAFE_NO_PAD
        .decode(key["e"].as_str().ok_or_else(invalid)?)
        .map_err(|_| invalid())?;
    let signature = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| invalid())?;
    ring::signature::RsaPublicKeyComponents { n: &n, e: &e }
        .verify(
            &ring::signature::RSA_PKCS1_2048_8192_SHA256,
            format!("{}.{}", parts[0], parts[1]).as_bytes(),
            &signature,
        )
        .map_err(|_| identity_error("署名を検証できませんでした"))?;
    Ok(claims)
}
fn identity_error(reason: &str) -> String {
    // Only fixed diagnostic labels reach UI/MCP; never include claims or tokens.
    format!("ChatGPTの本人確認に失敗しました（{reason}）。もう一度接続してください")
}
#[cfg(test)]
fn validate_identity_claims(claims: &Value, client_id: &str, nonce: &str) -> Result<(), String> {
    validate_identity_claims_with_nonce(claims, client_id, Some(nonce))
}
fn validate_identity_claims_with_nonce(
    claims: &Value,
    client_id: &str,
    nonce: Option<&str>,
) -> Result<(), String> {
    let audiences = claims["aud"].as_array();
    let audience = claims["aud"].as_str() == Some(client_id)
        || audiences.is_some_and(|v| {
            !v.is_empty()
                && v.iter().all(Value::is_string)
                && v.iter().any(|v| v.as_str() == Some(client_id))
        });
    let party = claims["azp"].as_str();
    if claims["iss"] != AUTH {
        return Err(identity_error("認証元が一致しません"));
    }
    if !audience
        || (audiences.is_some_and(|v| v.len() > 1) && party != Some(client_id))
        || (!claims["azp"].is_null() && party != Some(client_id))
    {
        return Err(identity_error("対象アプリが一致しません"));
    }
    if nonce.is_some_and(|expected| claims["nonce"].as_str() != Some(expected)) {
        return Err(identity_error("接続操作の照合に失敗しました"));
    }
    if claims["sub"].as_str().is_none_or(str::is_empty) {
        return Err(identity_error("アカウントを確認できませんでした"));
    }
    if claims["exp"].as_u64().unwrap_or(0) <= now() {
        return Err(identity_error("認証の有効期限が切れています"));
    }
    if claims["iat"].as_u64().is_some_and(|v| v > now() + 120)
        || claims["nbf"].as_u64().is_some_and(|v| v > now())
    {
        return Err(identity_error("端末の日時と認証の日時が一致しません"));
    }
    Ok(())
}
fn update_token(session: &mut Session, token: &Value) -> Result<(), String> {
    if !token["token_type"]
        .as_str()
        .is_some_and(|v| v.eq_ignore_ascii_case("bearer"))
    {
        return Err("ChatGPTの認証情報が不正です".into());
    }
    session.access_token = token["access_token"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or("ChatGPTの認証情報がありません")?
        .to_string();
    if let Some(value) = token["refresh_token"].as_str().filter(|v| !v.is_empty()) {
        session.refresh_token = Some(value.to_string());
    }
    if let Some(value) = token["scope"].as_str() {
        session.scopes = value.split_whitespace().map(str::to_string).collect();
    }
    session.expires_at = now().saturating_add(token["expires_in"].as_u64().unwrap_or(0));
    Ok(())
}
struct RefreshFailure {
    message: String,
    terminal: bool,
}
impl RefreshFailure {
    fn temporary(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            terminal: false,
        }
    }
    fn terminal(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            terminal: true,
        }
    }
}
trait RefreshTransport: Send + Sync {
    fn exchange<'a>(
        &'a self,
        session: &'a Session,
    ) -> BoxFuture<'a, Result<(u16, Value), RefreshFailure>>;
    fn keys(&self) -> BoxFuture<'_, Result<Value, String>>;
}
struct OpenAiRefreshTransport;
impl RefreshTransport for OpenAiRefreshTransport {
    fn exchange<'a>(
        &'a self,
        session: &'a Session,
    ) -> BoxFuture<'a, Result<(u16, Value), RefreshFailure>> {
        Box::pin(async move {
            let refresh = session
                .refresh_token
                .as_deref()
                .filter(|v| !v.is_empty())
                .ok_or_else(|| RefreshFailure::terminal("ChatGPTへの再接続が必要です"))?;
            let response = client(15)
                .map_err(RefreshFailure::temporary)?
                .post(format!("{AUTH}/api/accounts/oauth/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(form_body(&[
                    ("grant_type", "refresh_token"),
                    ("client_id", &session.client_id),
                    ("refresh_token", refresh),
                    ("resource", API),
                ]))
                .send()
                .await
                .map_err(|_| {
                    RefreshFailure::temporary(
                        "ChatGPTの接続を更新できませんでした。通信状態を確認してください",
                    )
                })?;
            let status = response.status().as_u16();
            let token: Value = response.json().await.map_err(|_| {
                RefreshFailure::temporary("ChatGPTの更新応答を読み取れませんでした")
            })?;
            Ok((status, token))
        })
    }
    fn keys(&self) -> BoxFuture<'_, Result<Value, String>> {
        Box::pin(async { identity_keys(&client(15)?).await })
    }
}
async fn identity_keys(http: &reqwest::Client) -> Result<Value, String> {
    let metadata = response_json(
        http.get(format!("{AUTH}/.well-known/openid-configuration"))
            .send()
            .await
            .map_err(|_| "本人確認の設定を取得できませんでした".to_string())?,
    )
    .await?;
    let uri = metadata["jwks_uri"]
        .as_str()
        .and_then(|v| reqwest::Url::parse(v).ok())
        .ok_or("本人確認の設定が不正です")?;
    if metadata["issuer"] != AUTH
        || uri.scheme() != "https"
        || uri.host_str() != Some("auth.openai.com")
        || !uri.username().is_empty()
        || uri.password().is_some()
    {
        return Err("本人確認の接続先が不正です".into());
    }
    response_json(
        http.get(uri)
            .send()
            .await
            .map_err(|_| "本人確認の鍵を取得できませんでした".to_string())?,
    )
    .await
}
fn refreshed_identity(session: &mut Session, token: &Value, keys: &Value) -> Result<(), String> {
    let claims = if let Some(jwt) = token["id_token"].as_str() {
        // A refresh is authenticated by its original grant; it is not a new
        // authorization request with a newly generated nonce.
        let claims = verify_identity_with_nonce(jwt, &session.client_id, None, keys)?;
        if claims["sub"].as_str() != Some(session.subject.as_str()) {
            return Err(identity_error("接続中のアカウントと一致しません"));
        }
        session.id_token = jwt.into();
        claims
    } else {
        // OIDC allows refresh responses without an ID token. The documented
        // access-token JWT still binds the signed subject, client and resource.
        let claims = verify_identity_with_nonce(&session.access_token, API, None, keys)?;
        if claims["client_id"].as_str() != Some(session.client_id.as_str())
            || claims["sub"].as_str() != Some(session.subject.as_str())
        {
            return Err(identity_error("接続中のアカウントと一致しません"));
        }
        claims
    };
    if let Some(email) = claims["email"].as_str() {
        session.email = Some(email.into());
    }
    Ok(())
}
async fn refresh_session(
    state: &ChatgptState,
    session: &mut Session,
) -> Result<(), RefreshFailure> {
    let (status, token) = state.5.exchange(session).await?;
    if !(200..300).contains(&status) {
        if terminal_refresh_error(&token) {
            return Err(RefreshFailure::terminal(
                "ChatGPTの接続の有効期限が切れているか、解除されています。再接続してください",
            ));
        }
        return Err(RefreshFailure::temporary(format!(
            "ChatGPTの接続を更新できませんでした: HTTP {}{}",
            status,
            error_code(&token)
        )));
    }
    let mut next = session.clone();
    update_token(&mut next, &token).map_err(RefreshFailure::terminal)?;
    if next.expires_at <= now() || token["refresh_token"].as_str().is_none_or(str::is_empty) {
        return Err(RefreshFailure::terminal(
            "ChatGPTの更新応答が不正です。再接続してください",
        ));
    }
    // A replacement invalidates the previous refresh credential. Persist it
    // before subsequent network work, which may fail temporarily.
    *session = next;
    let _ = persist_session(state, session).await;
    let verified_expires_at = session.expires_at;
    session.expires_at = 0;
    let keys = state.5.keys().await.map_err(RefreshFailure::temporary)?;
    refreshed_identity(session, &token, &keys).map_err(RefreshFailure::terminal)?;
    session.expires_at = verified_expires_at;
    if let Err(error) = persist_session(state, session).await {
        set_connection_error(state, Some(error));
    } else {
        set_connection_error(state, None);
    }
    Ok(())
}
fn set_connection_error(state: &ChatgptState, error: Option<String>) {
    if let Ok(mut status) = state.1.lock() {
        status.error = error;
    }
}
pub fn clear_for_app_reset(app: &AppHandle) -> Result<(), String> {
    clear_saved_login_for_reset(&app.state::<ChatgptState>())
}
fn clear_saved_login_for_reset(state: &ChatgptState) -> Result<(), String> {
    ensure_no_generation(state)?;
    let mut session = state
        .0
        .try_lock()
        .map_err(|_| "ChatGPTの処理が終わってから完全リセットしてください")?;
    {
        let status = state
            .1
            .lock()
            .map_err(|_| "接続状態を確認できませんでした")?;
        if status.connecting || status.restoring {
            return Err("ChatGPTの接続確認が終わってから完全リセットしてください".into());
        }
    }
    // Do this before deleting any app files. An inaccessible OS vault must
    // stop a full reset rather than leave a renewable login behind.
    state.3.delete(SESSION_ENTRY)?;
    *session = None;
    *state
        .4
        .lock()
        .map_err(|_| "アカウントを確認できませんでした")? = None;
    let result = state.3.delete(REGISTRATION_ENTRY);
    let mut status = state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?;
    *status = connection(None);
    status.error = result.as_ref().err().cloned();
    result
}
pub fn restore_session(app: &AppHandle) {
    let state = app.state::<ChatgptState>();
    if let Ok(mut status) = state.1.lock() {
        status.restoring = true;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<ChatgptState>();
        // Hold the same lock as login/refresh/logout, so a late restoration
        // cannot reconnect an account the user has just disconnected.
        let mut session = state.0.lock().await;
        let result = restore_saved_session(&state).await;
        let error = match result {
            Ok(next) => {
                *session = next;
                None
            }
            Err(error) => Some(error),
        };
        if let Ok(mut status) = state.1.lock() {
            let persistence_error = status.error.clone();
            *status = connection(session.as_ref());
            status.error = error.or(persistence_error);
        };
    });
}
async fn restore_saved_session(state: &ChatgptState) -> Result<Option<Session>, String> {
    let Some(value) = vault_read(state.3.clone(), SESSION_ENTRY).await? else {
        if let Some(value) = vault_read(state.3.clone(), REGISTRATION_ENTRY).await? {
            if let Ok(account) = serde_json::from_str::<Registration>(&value) {
                if valid_registration(&account) {
                    *state
                        .4
                        .lock()
                        .map_err(|_| "アカウントを確認できませんでした")? = Some(account);
                }
            }
        }
        return Ok(None);
    };
    let mut session = match decode_saved_session(&value) {
        Ok(value) => value,
        Err(error) => {
            vault_delete(state.3.clone()).await?;
            return Err(error);
        }
    };
    *state
        .4
        .lock()
        .map_err(|_| "アカウントを確認できませんでした")? = Some(registration(&session));
    // Each HTTP exchange is bounded. Do not drop an in-flight OS write: a
    // spawn_blocking task could otherwise complete after login or logout and
    // overwrite their newer credential state.
    match refresh_session(state, &mut session).await {
        Ok(()) => Ok(Some(session)),
        Err(error) => {
            if error.terminal {
                vault_delete(state.3.clone()).await?;
            }
            Err(error.message)
        }
    }
}
#[tauri::command]
pub async fn chatgpt_status(state: tauri::State<'_, ChatgptState>) -> Result<Connection, String> {
    // Do not block status reads on browser authorization or inference.
    state
        .1
        .lock()
        .map(|status| status.clone())
        .map_err(|_| "接続状態を確認できませんでした".into())
}
#[tauri::command]
pub async fn chatgpt_logout(state: tauri::State<'_, ChatgptState>) -> Result<Connection, String> {
    ensure_no_generation(&state)?;
    let mut guard = state
        .0
        .try_lock()
        .map_err(|_| "ChatGPTの処理が終わってから接続を解除してください".to_string())?;
    // Hold the session before checking status so login cannot start between
    // this check and revocation and later reconnect a logged-out session.
    {
        let status = state
            .1
            .lock()
            .map_err(|_| "接続状態を確認できませんでした")?;
        if status.connecting || status.restoring {
            return Err("ChatGPTの接続確認が終わってから解除してください".into());
        }
    }
    let error = if let Some(session) = guard.as_ref() {
        revoke_session(session).await.err()
    } else {
        None
    };
    finish_logout(&state, &mut guard, error).await
}
async fn finish_logout(
    state: &ChatgptState,
    session: &mut Option<Session>,
    error: Option<String>,
) -> Result<Connection, String> {
    let deletion_error = vault_delete(state.3.clone()).await.err();
    let account_deletion_error = {
        let store = state.3.clone();
        tokio::task::spawn_blocking(move || store.delete(REGISTRATION_ENTRY))
            .await
            .map_err(|_| "保存したアカウントを削除できませんでした".to_string())
            .and_then(|value| value)
            .err()
    };
    *session = None;
    *state
        .4
        .lock()
        .map_err(|_| "アカウントを確認できませんでした")? = None;
    let mut status = state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?;
    *status = connection(None);
    let errors = [error, deletion_error, account_deletion_error]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    status.error = if errors.is_empty() {
        None
    } else {
        Some(errors.join("\n"))
    };
    Ok(status.clone())
}

async fn revoke_session(session: &Session) -> Result<(), String> {
    let Some(refresh) = session.refresh_token.as_deref() else {
        return Ok(());
    };
    let failed = || {
        "Studioの接続は解除しましたが、ChatGPT側の解除を確認できませんでした。ChatGPTの設定でアプリの接続状態を確認してください".to_string()
    };
    let http = client(15)?;
    let metadata = response_json(
        http.get(format!("{AUTH}/.well-known/openid-configuration"))
            .send()
            .await
            .map_err(|_| failed())?,
    )
    .await
    .map_err(|_| failed())?;
    let uri = metadata["revocation_endpoint"]
        .as_str()
        .and_then(|v| reqwest::Url::parse(v).ok())
        .ok_or_else(failed)?;
    if metadata["issuer"] != AUTH
        || uri.scheme() != "https"
        || uri.host_str() != Some("auth.openai.com")
        || !uri.username().is_empty()
        || uri.password().is_some()
    {
        return Err(failed());
    }
    let response = http
        .post(uri)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_body(&[
            ("token", refresh),
            ("token_type_hint", "refresh_token"),
            ("client_id", &session.client_id),
        ]))
        .send()
        .await
        .map_err(|_| failed())?;
    if response.status().as_u16() != 200 {
        return Err(failed());
    }
    Ok(())
}
#[tauri::command]
pub async fn chatgpt_login(
    app: AppHandle,
    state: tauri::State<'_, ChatgptState>,
) -> Result<Connection, String> {
    ensure_no_generation(&state)?;
    let mut status = state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?;
    if status.connecting || status.restoring {
        return Ok(status.clone());
    }
    let guard = state
        .0
        .try_lock()
        .map_err(|_| "ChatGPTの処理中です".to_string())?;
    let previous = guard.clone();
    let account = state
        .4
        .lock()
        .map_err(|_| "アカウントを確認できませんでした")?
        .clone();
    drop(guard);
    status.connecting = true;
    status.error = None;
    let started = status.clone();
    drop(status);
    // A browser round trip can outlive a panel and an MCP request. Keep its
    // result in native state and let both consumers poll without losing errors.
    tauri::async_runtime::spawn(async move {
        let result = authorize(&app, previous, account).await;
        let state = app.state::<ChatgptState>();
        let mut session = state.0.lock().await;
        let error = match result {
            Ok(next) => {
                let error = persist_session(&state, &next).await.err();
                *session = Some(next);
                error
            }
            Err(error) => Some(error),
        };
        if let Ok(mut status) = state.1.lock() {
            *status = connection(session.as_ref());
            status.error = error;
        };
    });
    Ok(started)
}

async fn authorize(
    app: &AppHandle,
    previous: Option<Session>,
    account: Option<Registration>,
) -> Result<Session, String> {
    let issued_client = previous
        .as_ref()
        .map(|s| s.client_id.as_str())
        .or_else(|| account.as_ref().map(|v| v.client_id.as_str()));
    let state_value = random()?;
    let nonce = random()?;
    let verifier = random()?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "認証の受信を開始できませんでした".to_string())?;
    let redirect = format!(
        "http://127.0.0.1:{}/auth/callback",
        listener
            .local_addr()
            .map_err(|_| "認証の受信先を確認できませんでした".to_string())?
            .port()
    );
    let mut url = reqwest::Url::parse(&format!("{AUTH}/api/accounts/authorize")).unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", issued_client.unwrap_or("dynamic_agent_client")),
        ("ext_agent_host_id", &host_id(app)?),
        ("response_type", "code"),
        ("redirect_uri", &redirect),
        ("scope", SCOPES),
        ("resource", API),
        ("state", &state_value),
        ("nonce", &nonce),
        ("code_challenge_method", "S256"),
        (
            "code_challenge",
            &URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())),
        ),
    ]);
    if let Some(old) = previous.as_ref().filter(|v| !v.id_token.is_empty()) {
        url.query_pairs_mut()
            .append_pair("id_token_hint", &old.id_token);
    } else if issued_client.is_none() {
        url.query_pairs_mut()
            .append_pair("agent_name_hint", "XRift Studio");
    }
    if let Some(email) = account.as_ref().and_then(|v| v.email.as_deref()) {
        url.query_pairs_mut().append_pair("login_hint", email);
    }
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "ログイン用ブラウザを開けませんでした".to_string())?;
    let callback = tokio::time::timeout(Duration::from_secs(180), async {
        loop {
            let (mut socket, _) = listener.accept().await.map_err(|_| "認証の受信に失敗しました".to_string())?;
            let request = tokio::time::timeout(Duration::from_secs(3), async {
                let mut data = Vec::new(); let mut buffer = [0u8; 1024];
                while data.len() < 8192 {
                    let n = socket.read(&mut buffer).await.map_err(|_| "認証の応答を読めませんでした")?;
                    if n == 0 { break; } data.extend_from_slice(&buffer[..n]);
                    if data.windows(4).any(|w| w == b"\r\n\r\n") { break; }
                }
                String::from_utf8(data).map_err(|_| "認証の応答が不正です")
            }).await;
            let target = request.ok().and_then(Result::ok).and_then(|v| {
                let mut parts = v.lines().next()?.split_whitespace();
                if parts.next()? != "GET" { return None; } Some(parts.next()?.to_string())
            });
            let result = target.as_deref().map(|v| parse_callback(v, &state_value, issued_client));
            let valid_state = target.as_ref().is_some_and(|v| reqwest::Url::parse(&format!("http://127.0.0.1{v}")).ok().is_some_and(|u| u.path() == "/auth/callback" && u.query_pairs().any(|(k,v)| k == "state" && v == state_value)));
            let body = if valid_state { "認証の応答を受信しました。XRift StudioのChatGPTタブで、接続完了またはエラーを確認してください。" } else { "Invalid callback" };
            let reply = format!("HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", if valid_state { "200 OK" } else { "400 Bad Request" }, body.len(), body);
            let _ = tokio::time::timeout(Duration::from_secs(1), socket.write_all(reply.as_bytes())).await;
            if valid_state { return result.unwrap(); }
        }
    }).await.map_err(|_| "ログインが時間切れになりました。もう一度接続してください".to_string())??;
    let http = client(30)?;
    let token = response_json(
        http.post(format!("{AUTH}/api/accounts/oauth/token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form_body(&[
                ("grant_type", "authorization_code"),
                ("code", &callback.0),
                ("client_id", &callback.1),
                ("code_verifier", &verifier),
                ("redirect_uri", &redirect),
                ("resource", API),
            ]))
            .send()
            .await
            .map_err(|_| "ChatGPTの認証情報を取得できませんでした".to_string())?,
    )
    .await?;
    let keys = identity_keys(&http).await?;
    let jwt = token["id_token"]
        .as_str()
        .ok_or("本人確認の応答がありません")?;
    let claims = verify_identity(jwt, &callback.1, &nonce, &keys)?;
    if previous
        .as_ref()
        .map(|s| s.subject.as_str())
        .or_else(|| account.as_ref().map(|v| v.subject.as_str()))
        .is_some_and(|subject| claims["sub"].as_str() != Some(subject))
    {
        return Err("接続中のアカウントと異なります。一度接続を解除してください".into());
    }
    let mut session = Session {
        client_id: callback.1,
        subject: claims["sub"].as_str().unwrap().into(),
        email: claims["email"].as_str().map(str::to_string),
        id_token: jwt.into(),
        access_token: String::new(),
        refresh_token: None,
        scopes: vec![],
        expires_at: 0,
    };
    update_token(&mut session, &token)?;
    Ok(session)
}
async fn access_token(state: &ChatgptState, guard: &mut Option<Session>) -> Result<String, String> {
    let session = guard.as_mut().ok_or("ChatGPTに接続してください")?;
    if !connection(Some(session)).plan_usage_enabled {
        return Err("ChatGPTプランの利用許可がありません。再接続して許可してください".into());
    }
    if now() + 21 * 60 >= session.expires_at {
        if let Err(error) = refresh_session(state, session).await {
            let deletion = if error.terminal {
                *guard = None;
                vault_delete(state.3.clone()).await.err()
            } else {
                None
            };
            let message = deletion
                .map(|v| format!("{}\n{v}", error.message))
                .unwrap_or(error.message);
            set_connection_error(state, Some(message.clone()));
            return Err(message);
        }
        if !connection(Some(session)).plan_usage_enabled {
            return Err("ChatGPTプランの利用許可が取り消されています".into());
        }
    }
    Ok(guard
        .as_ref()
        .ok_or("ChatGPTへの再接続が必要です")?
        .access_token
        .clone())
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    slug: String,
    display_name: String,
    #[serde(default)]
    supported_reasoning_efforts: Vec<String>,
    #[serde(default)]
    default_reasoning_effort: Option<String>,
}
fn is_reasoning_effort(value: &str) -> bool {
    matches!(
        value,
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
    )
}
fn validate_reasoning_effort(value: Option<&str>) -> Result<(), String> {
    if value.is_some_and(|value| !is_reasoning_effort(value)) {
        return Err("思考量の設定が不正です。対応する思考量を選び直してください".into());
    }
    Ok(())
}
fn parse_model_catalog(result: &Value) -> Result<Vec<Model>, String> {
    let list = result["models"]
        .as_array()
        .ok_or("モデル一覧の応答が不正です")?;
    Ok(list
        .iter()
        .filter(|v| v["visibility"] == "list")
        .filter_map(|v| {
            let mut supported_reasoning_efforts = Vec::<String>::new();
            if let Some(levels) = v["supported_reasoning_levels"].as_array() {
                for level in levels {
                    let Some(effort) = level["effort"].as_str() else {
                        continue;
                    };
                    // The catalog may also advertise Codex-only choices such
                    // as automatic delegation. Public Responses does not
                    // accept those as reasoning.effort.
                    if is_reasoning_effort(effort)
                        && !supported_reasoning_efforts
                            .iter()
                            .any(|v| v.as_str() == effort)
                    {
                        supported_reasoning_efforts.push(effort.into());
                    }
                }
            }
            let default_reasoning_effort = v["default_reasoning_level"]
                .as_str()
                .filter(|value| {
                    supported_reasoning_efforts
                        .iter()
                        .any(|v| v.as_str() == *value)
                })
                .map(String::from);
            Some(Model {
                slug: v["slug"].as_str()?.into(),
                display_name: v["display_name"].as_str()?.into(),
                supported_reasoning_efforts,
                default_reasoning_effort,
            })
        })
        .collect())
}
fn validate_authoring_model(
    models: &[Model],
    slug: &str,
    reasoning_effort: Option<&str>,
) -> Result<(), String> {
    validate_reasoning_effort(reasoning_effort)?;
    let model = models
        .iter()
        .find(|model| model.slug == slug)
        .ok_or("選択したモデルをこのアカウントで利用できません")?;
    if reasoning_effort.is_some_and(|effort| {
        !model
            .supported_reasoning_efforts
            .iter()
            .any(|v| v.as_str() == effort)
    }) {
        return Err("選択したモデルはこの思考量に対応していません。モデルの既定を使うか、対応する思考量を選び直してください".into());
    }
    Ok(())
}
async fn catalog(token: &str) -> Result<Vec<Model>, String> {
    let result = response_json(
        client(30)?
            .get(format!("{API}/models"))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "モデル一覧を取得できませんでした".to_string())?,
    )
    .await?;
    parse_model_catalog(&result)
}
#[tauri::command]
pub async fn chatgpt_models(state: tauri::State<'_, ChatgptState>) -> Result<Vec<Model>, String> {
    let mut guard = state
        .0
        .try_lock()
        .map_err(|_| "ChatGPTの処理中です".to_string())?;
    ensure_authorization_complete(&state)?;
    let token = access_token(&state, &mut guard).await;
    update_connection_summary(&state, guard.as_ref());
    let token = token?;
    let account = guard
        .as_ref()
        .map(account_id)
        .ok_or("ChatGPTに接続してください")?;
    drop(guard);
    let result = catalog(&token).await;
    let status = state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?;
    check_catalog_account(&status, &account)?;
    result
}
fn ensure_authorization_complete(state: &ChatgptState) -> Result<(), String> {
    if state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?
        .connecting
    {
        return Err("ブラウザでの接続が終わってから実行してください".into());
    }
    if state
        .1
        .lock()
        .map_err(|_| "接続状態を確認できませんでした")?
        .restoring
    {
        return Err("保存したChatGPTの接続を確認しています。完了後に実行してください".into());
    }
    Ok(())
}
fn update_connection_summary(state: &ChatgptState, session: Option<&Session>) {
    if let Ok(mut status) = state.1.lock() {
        let next = connection(session);
        status.signed_in = next.signed_in;
        status.account_id = next.account_id;
        status.email = next.email;
        status.plan_usage_enabled = next.plan_usage_enabled;
    }
}
pub(crate) fn authoring_guide() -> &'static Value {
    static GUIDE: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    GUIDE.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../src/lib/visual-editor/world-authoring-guide.json"
        ))
        .expect("trusted world authoring guide")
    })
}
pub(crate) fn authoring_core_instructions() -> String {
    guide_lines(&authoring_guide()["core"])
}
fn guide_lines(value: &Value) -> String {
    value
        .as_array()
        .expect("trusted guide lines")
        .iter()
        .map(|line| line.as_str().expect("trusted guide text"))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_catalog_exposes_only_supported_public_reasoning_efforts() {
        let models = parse_model_catalog(&json!({"models":[
            {"slug":"fixture-one", "display_name":"Fixture one", "visibility":"list",
             "default_reasoning_level":"high", "supported_reasoning_levels":[
                 {"effort":"high"}, {"effort":"low"}, {"effort":"high"},
                 {"effort":"ultra"}, {"effort":"future-value"}, null, {"effort":3}]},
            {"slug":"fixture-hidden", "display_name":"Hidden", "visibility":"hide",
             "default_reasoning_level":"medium", "supported_reasoning_levels":[{"effort":"medium"}]},
            {"slug":"fixture-two", "display_name":"Fixture two", "visibility":"list",
             "default_reasoning_level":"medium", "supported_reasoning_levels":[{"effort":"none"}]}
        ]})).unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].slug, "fixture-one");
        assert_eq!(models[0].supported_reasoning_efforts, ["high", "low"]);
        assert_eq!(models[0].default_reasoning_effort.as_deref(), Some("high"));
        assert_eq!(models[1].slug, "fixture-two");
        assert_eq!(models[1].supported_reasoning_efforts, ["none"]);
        assert_eq!(models[1].default_reasoning_effort, None);
        let serialized = serde_json::to_value(&models[0]).unwrap();
        assert_eq!(
            serialized["supportedReasoningEfforts"],
            json!(["high", "low"])
        );
        assert_eq!(serialized["defaultReasoningEffort"], "high");
    }
    #[test]
    fn incomplete_model_metadata_does_not_invent_reasoning_capabilities() {
        let models = parse_model_catalog(&json!({"models":[
            {"slug":"gpt-6.1-sol", "display_name":"Catalog without capabilities", "visibility":"list"},
            {"slug":"fixture-invalid", "display_name":"Invalid metadata", "visibility":"list",
             "supported_reasoning_levels":{}, "default_reasoning_level":"low"}
        ]})).unwrap();
        for model in &models {
            assert!(model.supported_reasoning_efforts.is_empty());
            assert!(model.default_reasoning_effort.is_none());
            validate_authoring_model(&models, &model.slug, None).unwrap();
            assert!(validate_authoring_model(&models, &model.slug, Some("low")).is_err());
        }
        let legacy: Model =
            serde_json::from_value(json!({"slug":"fixture-legacy", "displayName":"Legacy"}))
                .unwrap();
        assert!(legacy.supported_reasoning_efforts.is_empty());
        assert!(legacy.default_reasoning_effort.is_none());
        assert!(parse_model_catalog(&json!({"models":{}})).is_err());
    }
    #[test]
    fn explicit_reasoning_effort_requires_current_selected_model_support() {
        let make_catalog = |effort| {
            parse_model_catalog(&json!({"models":[
                {"slug":"fixture-one", "display_name":"One", "visibility":"list",
                 "supported_reasoning_levels":[{"effort":effort}]},
                {"slug":"fixture-two", "display_name":"Two", "visibility":"list",
                 "supported_reasoning_levels":[{"effort":"low"}]}
            ]}))
            .unwrap()
        };
        let earlier = make_catalog("high");
        validate_authoring_model(&earlier, "fixture-one", Some("high")).unwrap();
        assert!(validate_authoring_model(&earlier, "fixture-two", Some("high")).is_err());
        assert!(validate_authoring_model(&earlier, "unavailable-model", None).is_err());
        let current = make_catalog("low");
        assert!(validate_authoring_model(&current, "fixture-one", Some("high")).is_err());
        validate_authoring_model(&current, "fixture-one", Some("low")).unwrap();
        validate_authoring_model(&current, "fixture-one", None).unwrap();
        for invalid in [
            "", "auto", "ultra", "unknown", "HIGH", " high", "high ", "{}",
        ] {
            assert!(validate_reasoning_effort(Some(invalid)).is_err());
        }
    }
    #[derive(Default)]
    struct MemoryVault {
        values: std::sync::Mutex<std::collections::HashMap<String, String>>,
        reject_writes: AtomicBool,
        reject_entry_writes: std::sync::Mutex<Option<String>>,
        reject_deletes: std::sync::Mutex<Option<String>>,
    }
    impl CredentialStore for MemoryVault {
        fn read(&self, entry: &str) -> Result<Option<String>, String> {
            Ok(self.values.lock().unwrap().get(entry).cloned())
        }
        fn write(&self, entry: &str, value: &str) -> Result<(), String> {
            if self.reject_writes.load(Ordering::Acquire)
                || self.reject_entry_writes.lock().unwrap().as_deref() == Some(entry)
            {
                return Err("資格情報ストアがロックされています".into());
            }
            self.values
                .lock()
                .unwrap()
                .insert(entry.into(), value.into());
            Ok(())
        }
        fn delete(&self, entry: &str) -> Result<(), String> {
            if self.reject_deletes.lock().unwrap().as_deref() == Some(entry) {
                return Err("fixture OS vault deletion failure".into());
            }
            self.values.lock().unwrap().remove(entry);
            Ok(())
        }
    }
    struct FixtureRefresh {
        responses: std::sync::Mutex<std::collections::VecDeque<(u16, Value)>>,
        vault: Arc<MemoryVault>,
        fail_keys: AtomicBool,
        exchanges: std::sync::atomic::AtomicUsize,
    }
    impl RefreshTransport for FixtureRefresh {
        fn exchange<'a>(
            &'a self,
            session: &'a Session,
        ) -> BoxFuture<'a, Result<(u16, Value), RefreshFailure>> {
            Box::pin(async move {
                assert_eq!(session.client_id, "fixture-client");
                assert_eq!(session.subject, "fixture-user");
                assert!(session
                    .refresh_token
                    .as_ref()
                    .is_some_and(|v| v.starts_with("fixture-refresh-")));
                self.exchanges.fetch_add(1, Ordering::AcqRel);
                self.responses
                    .lock()
                    .unwrap()
                    .pop_front()
                    .ok_or_else(|| RefreshFailure::temporary("fixture transport failure"))
            })
        }
        fn keys(&self) -> BoxFuture<'_, Result<Value, String>> {
            Box::pin(async move {
                let saved = self.vault.read(SESSION_ENTRY)?.unwrap();
                // The rotating credential must be committed before a later
                // identity-network request can fail.
                assert!(saved.contains("fixture-refresh-replacement"));
                if self.fail_keys.load(Ordering::Acquire) {
                    return Err("fixture temporary key outage".into());
                }
                Ok(signed_identity_fixture().0)
            })
        }
    }
    fn fixture_session() -> Session {
        Session {
            client_id: "fixture-client".into(),
            subject: "fixture-user".into(),
            email: Some("fixture@example.invalid".into()),
            id_token: signed_identity_fixture().1.into(),
            access_token: "fixture-access-secret".into(),
            refresh_token: Some("fixture-refresh-original".into()),
            scopes: vec!["openid".into(), "chatgpt.tokens.use.direct".into()],
            expires_at: 0,
        }
    }
    fn fixture_refresh_token(scope: &str) -> Value {
        json!({"token_type":"Bearer", "access_token":"fixture-new-access-secret", "refresh_token":"fixture-refresh-replacement",
            "id_token":signed_identity_fixture().1, "scope":scope, "expires_in":3600})
    }
    fn fixture_state(
        vault: Arc<MemoryVault>,
        responses: Vec<(u16, Value)>,
    ) -> (ChatgptState, Arc<FixtureRefresh>) {
        let transport = Arc::new(FixtureRefresh {
            responses: std::sync::Mutex::new(responses.into()),
            vault: vault.clone(),
            fail_keys: AtomicBool::new(false),
            exchanges: std::sync::atomic::AtomicUsize::new(0),
        });
        let mut state = ChatgptState::default();
        state.3 = vault;
        state.5 = transport.clone();
        (state, transport)
    }
    #[tokio::test]
    async fn secure_restore_rotates_credentials_and_rechecks_identity_and_permission() {
        let vault = Arc::new(MemoryVault::default());
        let (first, _) = fixture_state(vault.clone(), vec![]);
        persist_session(&first, &fixture_session()).await.unwrap();
        let saved = vault.read(SESSION_ENTRY).unwrap().unwrap();
        assert!(!saved.contains("fixture-access-secret"));
        assert!(!saved.contains(signed_identity_fixture().1));
        let (restarted, transport) = fixture_state(
            vault.clone(),
            vec![(
                200,
                fixture_refresh_token("openid chatgpt.tokens.use.direct"),
            )],
        );
        let restored = restore_saved_session(&restarted).await.unwrap().unwrap();
        assert_eq!(restored.subject, "fixture-user");
        assert_eq!(
            restored.refresh_token.as_deref(),
            Some("fixture-refresh-replacement")
        );
        assert!(restored.expires_at > now());
        assert!(connection(Some(&restored)).plan_usage_enabled);
        assert_eq!(transport.exchanges.load(Ordering::Acquire), 1);
        let summary = serde_json::to_string(&connection(Some(&restored))).unwrap();
        assert!(
            !summary.contains("secret")
                && !summary.contains("refresh")
                && !summary.contains(signed_identity_fixture().1)
        );
        let (permission_changed, _) = fixture_state(
            vault.clone(),
            vec![(200, fixture_refresh_token("openid profile"))],
        );
        let restored = restore_saved_session(&permission_changed)
            .await
            .unwrap()
            .unwrap();
        assert!(connection(Some(&restored)).signed_in);
        assert!(!connection(Some(&restored)).plan_usage_enabled);
        assert!(vault.read(SESSION_ENTRY).unwrap().is_some());
    }
    #[tokio::test]
    async fn auxiliary_registration_failure_cannot_prevent_saving_the_rotating_credential() {
        let vault = Arc::new(MemoryVault::default());
        *vault.reject_entry_writes.lock().unwrap() = Some(REGISTRATION_ENTRY.into());
        let (state, _) = fixture_state(
            vault.clone(),
            vec![(
                200,
                fixture_refresh_token("openid chatgpt.tokens.use.direct"),
            )],
        );
        // Even the first login can be restored if the auxiliary write failed;
        // the renewable session contains its own verified registration.
        assert!(persist_session(&state, &fixture_session()).await.is_err());
        assert!(vault.read(SESSION_ENTRY).unwrap().is_some());
        assert!(vault.read(REGISTRATION_ENTRY).unwrap().is_none());
        let restored = restore_saved_session(&state).await.unwrap().unwrap();
        assert_eq!(
            restored.refresh_token.as_deref(),
            Some("fixture-refresh-replacement")
        );
        assert!(connection(Some(&restored)).plan_usage_enabled);
        assert!(vault
            .read(SESSION_ENTRY)
            .unwrap()
            .unwrap()
            .contains("fixture-refresh-replacement"));
        assert!(state.1.lock().unwrap().error.is_some());
    }
    #[tokio::test]
    async fn terminal_refresh_clears_credentials_but_preserves_issued_registration() {
        for code in [
            "invalid_grant",
            "invalid_refresh_token",
            "token_expired",
            "refresh_token_expired",
            "refresh_token_invalidated",
            "refresh_token_reused",
        ] {
            let vault = Arc::new(MemoryVault::default());
            let (state, _) = fixture_state(
                vault.clone(),
                vec![(
                    400,
                    json!({"error":code,"error_description":"fixture-private-description"}),
                )],
            );
            persist_session(&state, &fixture_session()).await.unwrap();
            let error = restore_saved_session(&state).await.err().unwrap();
            assert!(error.contains("再接続") && !error.contains("fixture-private"));
            assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
            let registration = vault.read(REGISTRATION_ENTRY).unwrap().unwrap();
            assert!(registration.contains("fixture-client"));
            assert!(
                !registration.contains("refresh")
                    && !registration.contains(signed_identity_fixture().1)
            );
            assert_eq!(
                state.4.lock().unwrap().as_ref().unwrap().client_id,
                "fixture-client"
            );
        }
    }
    #[tokio::test]
    async fn temporary_refresh_failure_keeps_credentials_and_replacement_is_safe_before_key_failure(
    ) {
        let vault = Arc::new(MemoryVault::default());
        let (state, _) = fixture_state(
            vault.clone(),
            vec![(503, json!({"error":{"code":"temporarily_unavailable"}}))],
        );
        persist_session(&state, &fixture_session()).await.unwrap();
        let before = vault.read(SESSION_ENTRY).unwrap().unwrap();
        assert!(restore_saved_session(&state).await.is_err());
        assert_eq!(
            vault.read(SESSION_ENTRY).unwrap().as_deref(),
            Some(before.as_str())
        );
        let (state, transport) = fixture_state(
            vault.clone(),
            vec![(
                200,
                fixture_refresh_token("openid chatgpt.tokens.use.direct"),
            )],
        );
        transport.fail_keys.store(true, Ordering::Release);
        let mut session = fixture_session();
        let failure = refresh_session(&state, &mut session).await.err().unwrap();
        assert!(!failure.terminal);
        assert_eq!(session.expires_at, 0);
        assert_eq!(
            session.refresh_token.as_deref(),
            Some("fixture-refresh-replacement")
        );
        assert!(vault
            .read(SESSION_ENTRY)
            .unwrap()
            .unwrap()
            .contains("fixture-refresh-replacement"));
    }
    #[tokio::test]
    async fn invalid_identity_and_expired_saved_credentials_cannot_restore_a_signed_in_account() {
        let vault = Arc::new(MemoryVault::default());
        let mut token = fixture_refresh_token("openid chatgpt.tokens.use.direct");
        token["id_token"] = json!(format!(
            "{}.AA",
            signed_identity_fixture().1.rsplit_once('.').unwrap().0
        ));
        let (state, _) = fixture_state(vault.clone(), vec![(200, token)]);
        persist_session(&state, &fixture_session()).await.unwrap();
        assert!(restore_saved_session(&state).await.is_err());
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
        let mut saved: Value =
            serde_json::from_str(&saved_session(&fixture_session()).unwrap()).unwrap();
        saved["refresh_expires_at"] = json!(0);
        vault.write(SESSION_ENTRY, &saved.to_string()).unwrap();
        assert!(restore_saved_session(&state).await.is_err());
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
        assert!(!state.1.lock().unwrap().signed_in);
    }
    #[tokio::test]
    async fn refreshes_are_serialized_and_explicit_logout_allows_a_different_account() {
        let vault = Arc::new(MemoryVault::default());
        let (state, transport) = fixture_state(
            vault.clone(),
            vec![(
                200,
                fixture_refresh_token("openid chatgpt.tokens.use.direct"),
            )],
        );
        persist_session(&state, &fixture_session()).await.unwrap();
        *state.0.lock().await = Some(fixture_session());
        let state = Arc::new(state);
        let requests = (0..2)
            .map(|_| {
                let state = state.clone();
                tokio::spawn(async move {
                    let mut session = state.0.lock().await;
                    access_token(&state, &mut session).await
                })
            })
            .collect::<Vec<_>>();
        for request in requests {
            assert!(request.await.unwrap().is_ok());
        }
        assert_eq!(transport.exchanges.load(Ordering::Acquire), 1);
        let mut session = state.0.lock().await;
        let status = finish_logout(
            &state,
            &mut session,
            Some("fixture remote revocation unconfirmed".into()),
        )
        .await
        .unwrap();
        assert!(!status.signed_in && session.is_none());
        assert_eq!(
            status.error.as_deref(),
            Some("fixture remote revocation unconfirmed")
        );
        drop(session);
        vault_delete(state.3.clone()).await.unwrap();
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
        assert!(vault.read(REGISTRATION_ENTRY).unwrap().is_none());
        assert!(state.4.lock().unwrap().is_none());
        vault.reject_writes.store(true, Ordering::Release);
        assert!(persist_session(&state, &fixture_session()).await.is_err());
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
    }
    #[tokio::test]
    async fn full_reset_forgets_session_and_registration_and_fails_closed_on_secure_delete_failure()
    {
        let vault = Arc::new(MemoryVault::default());
        let (state, _) = fixture_state(vault.clone(), vec![]);
        persist_session(&state, &fixture_session()).await.unwrap();
        *state.0.lock().await = Some(fixture_session());
        *state.1.lock().unwrap() = connection(Some(&fixture_session()));
        *vault.reject_deletes.lock().unwrap() = Some(SESSION_ENTRY.into());
        assert!(clear_saved_login_for_reset(&state).is_err());
        assert!(state.0.lock().await.is_some());
        assert!(state.1.lock().unwrap().signed_in);
        assert!(vault.read(SESSION_ENTRY).unwrap().is_some());
        *vault.reject_deletes.lock().unwrap() = Some(REGISTRATION_ENTRY.into());
        assert!(clear_saved_login_for_reset(&state).is_err());
        assert!(state.0.lock().await.is_none());
        assert!(!state.1.lock().unwrap().signed_in);
        assert!(state.1.lock().unwrap().error.is_some());
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
        assert!(vault.read(REGISTRATION_ENTRY).unwrap().is_some());
        *vault.reject_deletes.lock().unwrap() = None;
        clear_saved_login_for_reset(&state).unwrap();
        assert!(vault.read(SESSION_ENTRY).unwrap().is_none());
        assert!(vault.read(REGISTRATION_ENTRY).unwrap().is_none());
        assert!(state.4.lock().unwrap().is_none());
        assert!(state.1.lock().unwrap().error.is_none());
        let lease = begin_generation(&state, Some("fixture-reset-generation".into())).unwrap();
        assert!(clear_saved_login_for_reset(&state).is_err());
        drop(lease);
        state.1.lock().unwrap().restoring = true;
        assert!(clear_saved_login_for_reset(&state).is_err());
    }
    #[tokio::test]
    async fn cancellation_is_id_scoped_prompt_and_releases_exclusive_generation() {
        let state = ChatgptState::default();
        let lease = begin_generation(&state, Some("fixture-generation".into())).unwrap();
        assert!(begin_generation(&state, None).is_err());
        assert!(ensure_no_generation(&state).is_err());
        assert!(
            !cancel_generation(&state, "stale-generation".into())
                .unwrap()
                .cancelled
        );
        assert!(!lease.control.cancelled.load(Ordering::Acquire));
        let request = run_cancellable(
            &lease.control,
            Duration::from_secs(30),
            futures_util::future::pending::<Result<(), String>>(),
        );
        let stop = async {
            tokio::task::yield_now().await;
            assert!(
                cancel_generation(&state, "fixture-generation".into())
                    .unwrap()
                    .cancelled
            );
        };
        let (cancelled, _) = tokio::time::timeout(Duration::from_millis(100), async {
            tokio::join!(request, stop)
        })
        .await
        .unwrap();
        assert!(cancelled.unwrap_err().contains("停止しました"));
        let previous = lease.control.clone();
        drop(lease);
        assert!(ensure_no_generation(&state).is_ok());
        let next = begin_generation(&state, Some("next-generation".into())).unwrap();
        previous.cancel();
        assert!(!next.control.cancelled.load(Ordering::Acquire));
        assert!(state.0.try_lock().is_ok());
        let timed_out = run_cancellable(
            &next.control,
            Duration::from_millis(1),
            futures_util::future::pending::<Result<(), String>>(),
        )
        .await;
        assert!(timed_out.unwrap_err().contains("時間切れ"));
        drop(next);
        assert!(begin_generation(&state, Some("invalid id".into())).is_err());
    }
    fn signed_identity_fixture() -> (Value, &'static str) {
        let keys: Value = serde_json::from_str(r#"{"keys":[{"kty":"RSA","n":"umptwWnSOZsYQ6XjAUpLO4mVspTk2otV1LHBGe-_s2t7cWRUoUcC8hrqac8PJbKUd7jJVQv2H9OWrTh8jEwTpH8ucVoF7D10s1aAhEaQi5UxKo24GLExXqFehu-W6WcZUgtKEjUZ00Lw_xoS8g8q4dmcBkTmwViAc2weEpAHTseUmWIlMnVPV12A2SBXQeMtQ8ncGnd6RMR3J7Sk3b_q9IOZmOXBbhqzwCuCLh_K5Qn0Jx59qv09PkSmvSDYoc4vzcZJ7C_VzSHsrUtXGpLltMb09JufC6Y0MeoSZ219zEeZUGQsxEq-HIzGhnhntbwC1KHusEEdKDI58h0WVudy0w","e":"AQAB","kid":"fixture","use":"sig"}]}"#).unwrap();
        let jwt = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImZpeHR1cmUifQ.eyJpc3MiOiJodHRwczovL2F1dGgub3BlbmFpLmNvbSIsImF1ZCI6ImZpeHR1cmUtY2xpZW50Iiwibm9uY2UiOiJmaXh0dXJlLW5vbmNlIiwic3ViIjoiZml4dHVyZS11c2VyIiwiZXhwIjo0MTAyNDQ0ODAwfQ.Fr3AOuz1bcIhc4oOlqAYlvb5m7385BhWHe5MvvHGOxGAiRYtlgqGAU0QUMvB1R9SKWZUfaxtogVcq1MG3V6bzHMzRX3M60pwFh89Ro4G2muJv7FS06U30urkXmmUtCmFZETfJppBgajRLB8QuBQhLf2vtChR3h7L7lNSV68j4D4c3o788r-wLJN4dL5_09B1xXoVkVnEBHxH17F5TTxj_ZZGLDU45nNDWC08BXhydqJ2gbA6R40UezZ8C5pH8KMT2xwJ0df_O1tyljr0ec78atsvtvH9eHTmQ78bdObL_tmpsW7bXufuBgNBWNyFO56MJhao6XBV4Z3WmL3sAmA5mg";
        (keys, jwt)
    }
    #[test]
    fn signed_identity_checks_trust_claims_and_signature() {
        let (keys, jwt) = signed_identity_fixture();
        assert_eq!(
            verify_identity(jwt, "fixture-client", "fixture-nonce", &keys).unwrap()["sub"],
            "fixture-user"
        );
        assert!(verify_identity(jwt, "wrong-client", "fixture-nonce", &keys).is_err());
        assert!(verify_identity(jwt, "fixture-client", "wrong-nonce", &keys).is_err());
        let changed = format!("{}.AA", jwt.rsplit_once('.').unwrap().0);
        assert!(verify_identity(&changed, "fixture-client", "fixture-nonce", &keys).is_err());
        assert!(
            verify_identity(jwt, "fixture-client", "fixture-nonce", &json!({"keys":[]})).is_err()
        );
    }

    #[test]
    fn callback_checks_state_and_client() {
        assert!(parse_callback(
            "/auth/callback?state=wrong&code=x&client_id=issued",
            "right",
            None
        )
        .is_err());
        assert!(parse_callback(
            "/auth/callback?state=right&code=x&client_id=issued",
            "right",
            Some("other")
        )
        .is_err());
        assert!(parse_callback(
            "/auth/callback?state=right&error=access_denied",
            "right",
            None
        )
        .is_err());
        assert_eq!(
            parse_callback(
                "/auth/callback?state=right&code=x&client_id=issued",
                "right",
                None
            )
            .unwrap(),
            ("x".into(), "issued".into())
        );
    }
    #[test]
    fn identity_accepts_single_audience_array_and_checks_authorized_party() {
        let mut claims = json!({ "iss": AUTH, "aud": ["fixture"], "nonce": "nonce", "sub": "user", "exp": now() + 300 });
        assert!(validate_identity_claims(&claims, "fixture", "nonce").is_ok());
        claims["aud"] = json!(["fixture", "other"]);
        assert!(validate_identity_claims(&claims, "fixture", "nonce").is_err());
        claims["azp"] = json!("fixture");
        assert!(validate_identity_claims(&claims, "fixture", "nonce").is_ok());
        claims["aud"] = json!("fixture");
        claims["azp"] = json!("other");
        assert!(validate_identity_claims(&claims, "fixture", "nonce").is_err());
        claims["azp"] = Value::Null;
        assert!(validate_identity_claims(&claims, "fixture", "wrong")
            .unwrap_err()
            .contains("接続操作の照合"));
        claims["exp"] = json!(0);
        assert!(validate_identity_claims(&claims, "fixture", "nonce").is_err());
    }
    #[test]
    fn session_summary_has_no_tokens() {
        assert_eq!(
            serde_json::to_value(connection(None)).unwrap(),
            json!({"signedIn":false,"accountId":null,"email":null,"planUsageEnabled":false,"connecting":false,"restoring":false,"error":null})
        );
    }
    #[test]
    fn model_catalog_rejects_an_account_change_even_when_email_is_unchanged() {
        let session = fixture_session();
        let expected = account_id(&session);
        let original = connection(Some(&session));
        assert!(check_catalog_account(&original, &expected).is_ok());
        let mut refreshed = session.clone();
        refreshed.access_token = "replacement-access".into();
        refreshed.refresh_token = Some("replacement-refresh".into());
        assert_eq!(account_id(&refreshed), expected);
        refreshed.client_id = "another-issued-registration".into();
        let switched = connection(Some(&refreshed));
        assert_eq!(switched.email, original.email);
        assert!(check_catalog_account(&switched, &expected).is_err());
        refreshed.client_id = session.client_id.clone();
        refreshed.subject = "another-subject".into();
        assert!(check_catalog_account(&connection(Some(&refreshed)), &expected).is_err());
        for unavailable in [
            connection(None),
            Connection {
                connecting: true,
                ..original.clone()
            },
            Connection {
                restoring: true,
                ..original.clone()
            },
            Connection {
                plan_usage_enabled: false,
                ..original.clone()
            },
        ] {
            assert!(check_catalog_account(&unavailable, &expected).is_err());
        }
        let public = serde_json::to_string(&original).unwrap();
        assert!(!public.contains(&session.client_id));
        assert!(!public.contains(&session.subject));
        assert!(!public.contains(&session.access_token));
    }
    #[test]
    fn connection_status_remains_readable_during_native_work() {
        let state = ChatgptState::default();
        let _session = state.0.blocking_lock();
        {
            let mut status = state.1.lock().unwrap();
            status.connecting = true;
            status.error = Some("検証用エラー".into());
        }
        // Browser authorization and inference hold or use the session lock;
        // reading the last result must use the independent summary.
        let status = state.1.try_lock().unwrap().clone();
        assert!(status.connecting);
        assert_eq!(status.error.as_deref(), Some("検証用エラー"));
    }
    #[test]
    fn refreshed_scope_summary_preserves_authorization_result() {
        let state = ChatgptState::default();
        state.1.lock().unwrap().error = Some("再接続の検証用エラー".into());
        let mut session = Session {
            client_id: "fixture".into(),
            subject: "fixture".into(),
            email: None,
            id_token: "private-id".into(),
            access_token: "private-access".into(),
            refresh_token: Some("private-refresh".into()),
            scopes: vec!["chatgpt.tokens.use.direct".into()],
            expires_at: 0,
        };
        update_connection_summary(&state, Some(&session));
        assert!(state.1.lock().unwrap().plan_usage_enabled);
        session.scopes.clear();
        update_connection_summary(&state, Some(&session));
        let status = serde_json::to_value(state.1.lock().unwrap().clone()).unwrap();
        assert_eq!(status["planUsageEnabled"], false);
        assert_eq!(status["signedIn"], true);
        assert_eq!(status["error"], "再接続の検証用エラー");
        assert!(!status.to_string().contains("private-"));
    }
    #[test]
    fn cancellation_before_native_start_closes_admission_for_that_id() {
        let state = ChatgptState::default();
        assert!(
            !cancel_generation(&state, "not-started-yet".into())
                .unwrap()
                .cancelled
        );
        assert!(begin_generation(&state, Some("not-started-yet".into())).is_err());
        assert!(begin_generation(&state, Some("new-request".into())).is_ok());
    }
}
