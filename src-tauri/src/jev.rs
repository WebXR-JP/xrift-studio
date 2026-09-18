use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const JEV_CONFIG_FILE: &str = "jev.json";
const JEV_BASE_URL: &str = "https://api.typesafe.ai";
const JEV_DEFAULT_MODEL: &str = "jev-latest";
const JEV_MAX_REQUEST_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JevStatus {
    configured: bool,
    model: String,
    base_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JevConnectionResult {
    ok: bool,
    model: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JevConfig {
    api_key: String,
    #[serde(default = "default_base_url")]
    base_url: String,
    #[serde(default = "default_model")]
    model: String,
}

fn default_base_url() -> String {
    JEV_BASE_URL.to_string()
}

fn default_model() -> String {
    JEV_DEFAULT_MODEL.to_string()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|root| root.join(JEV_CONFIG_FILE))
        .map_err(|error| format!("Jev設定の保存先を取得できません: {error}"))
}

fn read_config(app: &AppHandle) -> Result<Option<JevConfig>, String> {
    let path = config_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|error| format!("Jev設定を読み込めません: {error}"))?;
    let config: JevConfig =
        serde_json::from_slice(&bytes).map_err(|error| format!("Jev設定が壊れています: {error}"))?;
    if config.api_key.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(config))
}

fn validate_api_key(api_key: &str) -> Result<String, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("Jev APIキーを入力してください".to_string());
    }
    if api_key.len() > 512 || api_key.chars().any(char::is_control) {
        return Err("Jev APIキーの形式を確認してください".to_string());
    }
    Ok(api_key.to_string())
}

fn write_config(app: &AppHandle, config: &JevConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Jev設定の保存先が不正です".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Jev設定の保存先を作成できません: {error}"))?;

    let bytes =
        serde_json::to_vec_pretty(config).map_err(|error| format!("Jev設定を保存できません: {error}"))?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes)
        .map_err(|error| format!("Jev設定を保存できません: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Jev設定の権限を設定できません: {error}"))?;
    }

    std::fs::rename(&temp, &path)
        .map_err(|error| format!("Jev設定を確定できません: {error}"))?;
    Ok(())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Jev HTTP clientを作成できません: {error}"))
}

fn base_url(config: &JevConfig) -> String {
    config.base_url.trim_end_matches('/').to_string()
}

async fn response_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let summary: String = body.chars().take(500).collect();
    if summary.trim().is_empty() {
        format!("Jev API returned HTTP {status}")
    } else {
        format!("Jev API returned HTTP {status}: {summary}")
    }
}

#[tauri::command]
pub fn get_jev_status(app: AppHandle) -> Result<JevStatus, String> {
    let config = read_config(&app)?;
    Ok(JevStatus {
        configured: config.is_some(),
        model: config
            .as_ref()
            .map(|value| value.model.clone())
            .unwrap_or_else(default_model),
        base_url: config
            .as_ref()
            .map(|value| value.base_url.clone())
            .unwrap_or_else(default_base_url),
    })
}

#[tauri::command]
pub fn set_jev_api_key(app: AppHandle, api_key: String) -> Result<JevStatus, String> {
    let config = JevConfig {
        api_key: validate_api_key(&api_key)?,
        base_url: default_base_url(),
        model: default_model(),
    };
    write_config(&app, &config)?;
    get_jev_status(app)
}

#[tauri::command]
pub fn clear_jev_api_key(app: AppHandle) -> Result<JevStatus, String> {
    let path = config_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|error| format!("Jev APIキーを削除できません: {error}"))?;
    }
    get_jev_status(app)
}

#[tauri::command]
pub async fn test_jev_connection(app: AppHandle) -> Result<JevConnectionResult, String> {
    let config = read_config(&app)?.ok_or_else(|| "Jev APIキーが設定されていません".to_string())?;
    let response = client()?
        .get(format!("{}/v1/models", base_url(&config)))
        .header(AUTHORIZATION, format!("Bearer {}", config.api_key))
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "xrift-studio/jev")
        .send()
        .await
        .map_err(|error| format!("Jev APIへ接続できません: {error}"))?;
    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    Ok(JevConnectionResult {
        ok: true,
        model: config.model,
        message: "Jev APIへ接続できました".to_string(),
    })
}

#[tauri::command]
pub async fn jev_system_one(app: AppHandle, request: Value) -> Result<Value, String> {
    let config = read_config(&app)?.ok_or_else(|| "Jev APIキーが設定されていません".to_string())?;
    let mut payload = request
        .as_object()
        .cloned()
        .ok_or_else(|| "Jev requestはJSON objectで指定してください".to_string())?;
    let questions = payload
        .get("questions")
        .and_then(Value::as_object)
        .ok_or_else(|| "Jev request.questionsを指定してください".to_string())?;
    if questions.is_empty() {
        return Err("Jev request.questionsは1件以上必要です".to_string());
    }
    payload
        .entry("model".to_string())
        .or_insert_with(|| Value::String(config.model.clone()));

    let payload = Value::Object(payload);
    let encoded =
        serde_json::to_vec(&payload).map_err(|error| format!("Jev requestを変換できません: {error}"))?;
    if encoded.len() > JEV_MAX_REQUEST_BYTES {
        return Err("Jev requestが大きすぎます".to_string());
    }

    let response = client()?
        .post(format!("{}/v1/systemone", base_url(&config)))
        .header(AUTHORIZATION, format!("Bearer {}", config.api_key))
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .header(USER_AGENT, "xrift-studio/jev")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Jev APIへ接続できません: {error}"))?;

    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Jev APIの応答をJSONとして読めません: {error}"))?;
    if !value.is_object() {
        return Err("Jev APIの応答形式を確認できません".to_string());
    }
    Ok(json!(value))
}
