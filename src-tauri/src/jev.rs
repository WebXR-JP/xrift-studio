use reqwest::header::{HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const JEV_CONFIG_FILE: &str = "jev.json";
const JEV_BASE_URL: &str = "https://api.typesafe.ai";
const JEV_DEFAULT_MODEL: &str = "jev-latest";
const JEV_MAX_REQUEST_BYTES: usize = 256 * 1024;
const JEV_MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const JEV_MAX_CONFIG_BYTES: u64 = 4096;

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

// Legacy baseUrl/model fields are deliberately ignored when reading settings.
// A settings file must never be able to redirect a user's API key to another API.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JevConfig {
    api_key: String,
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
        .map_err(|_| "Jev設定の保存先を取得できません".to_string())
}

fn read_config(app: &AppHandle) -> Result<Option<JevConfig>, String> {
    read_config_at(&config_path(app)?)
}

fn read_config_at(path: &Path) -> Result<Option<JevConfig>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Jev設定を読み込めません".to_string()),
    };
    let mut bytes = Vec::new();
    file.take(JEV_MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Jev設定を読み込めません".to_string())?;
    if bytes.len() as u64 > JEV_MAX_CONFIG_BYTES {
        return Err("Jev設定を読み込めません。APIキーを保存し直してください".to_string());
    }
    let mut config: JevConfig = serde_json::from_slice(&bytes)
        .map_err(|_| "Jev設定を読み込めません。APIキーを保存し直してください".to_string())?;
    if config.api_key.trim().is_empty() {
        return Ok(None);
    }
    config.api_key = validate_api_key(&config.api_key)?;
    Ok(Some(config))
}

fn validate_api_key(api_key: &str) -> Result<String, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("Jev APIキーを入力してください".to_string());
    }
    if api_key.len() > 512 || !api_key.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err("Jev APIキーの形式を確認してください".to_string());
    }
    Ok(api_key.to_string())
}

fn write_config(app: &AppHandle, config: &JevConfig) -> Result<(), String> {
    write_config_at(&config_path(app)?, config)
}

fn write_config_at(path: &Path, config: &JevConfig) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Jev設定の保存先が不正です".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "Jev設定の保存先を作成できません".to_string())?;
    let bytes =
        serde_json::to_vec_pretty(config).map_err(|_| "Jev設定を保存できません".to_string())?;
    for _ in 0..8 {
        let mut nonce = [0u8; 16];
        getrandom::fill(&mut nonce)
            .map_err(|_| "Jev設定の一時ファイルを作成できません".to_string())?;
        let temp = parent.join(format!(".jev-{:032x}.tmp", u128::from_le_bytes(nonce)));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        // Restrict access at creation, before the first secret byte is written.
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = match options.open(&temp) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Jev設定の一時ファイルを作成できません".to_string()),
        };
        let result = (|| {
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| "Jev設定を保存できません".to_string())?;
            // Close before rename for Windows. std::fs::rename also replaces
            // an existing regular file there; never delete the old key first.
            drop(file);
            fs::rename(&temp, path).map_err(|_| "Jev設定を確定できません".to_string())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        return result;
    }
    Err("Jev設定の一時ファイルを作成できません".to_string())
}

fn client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
}

fn client() -> Result<reqwest::Client, String> {
    client_builder()
        .build()
        .map_err(|_| "Jev APIへの接続を準備できません".to_string())
}

#[derive(Clone, Copy)]
enum JevEndpoint {
    Models,
    SystemOne,
}

fn official_request(
    endpoint: JevEndpoint,
    api_key: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let mut authorization =
        HeaderValue::from_str(&format!("Bearer {}", validate_api_key(api_key)?))
            .map_err(|_| "Jev APIキーの形式を確認してください".to_string())?;
    authorization.set_sensitive(true);
    let client = client()?;
    let request = match endpoint {
        JevEndpoint::Models => client.get("https://api.typesafe.ai/v1/models"),
        JevEndpoint::SystemOne => client.post("https://api.typesafe.ai/v1/systemone"),
    };
    Ok(request
        .header(AUTHORIZATION, authorization)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "xrift-studio/jev"))
}

fn connection_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Jev APIの応答が時間内に届きませんでした。少し待ってからやり直してください".to_string()
    } else {
        "Jev APIへ接続できません。通信環境を確認してやり直してください".to_string()
    }
}

fn response_error(status: reqwest::StatusCode) -> String {
    // Do not surface response bodies: upstream errors may echo request data.
    match status.as_u16() {
        401 | 403 => "Jev APIキーを確認し、保存し直してください".to_string(),
        422 => "Jev APIが依頼の形式を受け付けませんでした".to_string(),
        429 => "Jev APIの利用上限に達しました。少し待ってからやり直してください".to_string(),
        529 => "Jev APIが混み合っています。少し待ってからやり直してください".to_string(),
        300..=399 => "Jev APIから別の接続先へ案内されたため、通信を中止しました".to_string(),
        _ => format!("Jev APIでエラーが発生しました（HTTP {}）", status.as_u16()),
    }
}

async fn read_response(mut response: reqwest::Response) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(response_error(response.status()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(connection_error)? {
        if bytes.len().saturating_add(chunk.len()) > JEV_MAX_RESPONSE_BYTES {
            return Err("Jev APIの応答が大きすぎます".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Jev APIの応答形式を確認できません".to_string())
}

fn is_text_input(value: &Value) -> bool {
    value.is_string() || value.is_object() || value.is_array()
}

fn is_model_name(value: &str) -> bool {
    value.starts_with("jev-")
        && value.len() > 4
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._".contains(&byte))
}

fn prepare_request(mut request: Value) -> Result<Value, String> {
    let payload = request
        .as_object_mut()
        .ok_or_else(|| "Jevへの依頼をJSONオブジェクトで指定してください".to_string())?;
    if !payload.get("state").is_some_and(is_text_input) {
        return Err("Jevへ送る依頼内容を指定してください".to_string());
    }
    payload
        .entry("model".to_string())
        .or_insert_with(|| Value::String(default_model()));
    if !payload
        .get("model")
        .and_then(Value::as_str)
        .is_some_and(is_model_name)
    {
        return Err("Jevのモデル名を確認してください".to_string());
    }
    let questions = payload
        .get("questions")
        .and_then(Value::as_object)
        .filter(|questions| !questions.is_empty())
        .ok_or_else(|| "Jevへ送る質問を1件以上指定してください".to_string())?;
    for question in questions.values() {
        if !question.get("instructions").is_some_and(is_text_input) {
            return Err("Jevへ送る質問の説明を確認してください".to_string());
        }
        let criteria = question.get("criteria");
        let valid = match question.get("type").and_then(Value::as_str) {
            Some("choice") => criteria.and_then(Value::as_object).is_some_and(|options| {
                !options.is_empty()
                    && options.len() <= 255
                    && options
                        .values()
                        .all(|value| value.is_null() || is_text_input(value))
            }),
            Some("noul") => {
                criteria.is_none()
                    || criteria.and_then(Value::as_object).is_some_and(|options| {
                        options.iter().all(|(key, value)| {
                            matches!(key.as_str(), "true" | "false") && is_text_input(value)
                        })
                    })
            }
            Some("score") => criteria.and_then(Value::as_array).is_some_and(|levels| {
                (2..=10).contains(&levels.len()) && levels.iter().all(is_text_input)
            }),
            _ => false,
        };
        if !valid {
            return Err("Jevへ送る質問の種類と選択肢を確認してください".to_string());
        }
    }
    let encoded =
        serde_json::to_vec(&request).map_err(|_| "Jevへの依頼を変換できません".to_string())?;
    if encoded.len() > JEV_MAX_REQUEST_BYTES {
        return Err("Jevへの依頼が大きすぎます。内容を短くしてください".to_string());
    }
    Ok(request)
}

fn validate_models(value: &Value) -> Result<(), String> {
    let models = value
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| "Jev APIのモデル一覧を確認できません".to_string())?;
    if !models.iter().all(|model| {
        model
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| !name.is_empty())
            && model.get("description").is_some_and(Value::is_string)
            && model.get("release_date").is_some_and(Value::is_string)
    }) {
        return Err("Jev APIのモデル一覧を確認できません".to_string());
    }
    if !models
        .iter()
        .any(|model| model.get("name").and_then(Value::as_str) == Some(JEV_DEFAULT_MODEL))
    {
        return Err("このAPIキーではjev-latestを利用できません".to_string());
    }
    Ok(())
}

fn probability(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && (0.0..=1.0).contains(value))
}

fn valid_distribution(distribution: &Map<String, Value>, expected: &[&str]) -> bool {
    if distribution.len() != expected.len()
        || expected.iter().any(|key| !distribution.contains_key(*key))
    {
        return false;
    }
    let sum: Option<f64> = distribution
        .values()
        .map(|value| probability(Some(value)))
        .sum();
    // The API documents a normalized distribution but no fixed decimal precision.
    // Allow rounding to four decimal places across all 255 supported options,
    // plus a small floor for short lists; reject clearly unnormalized results.
    let tolerance = 0.001_f64.max(expected.len() as f64 * 0.00005) + 1e-9;
    sum.is_some_and(|sum| (sum - 1.0).abs() <= tolerance)
}

fn validate_answers(value: &Value, request: &Value) -> Result<(), String> {
    let invalid = || "Jev APIの判断結果を確認できません。もう一度やり直してください".to_string();
    if !value
        .get("model")
        .and_then(Value::as_str)
        .is_some_and(is_model_name)
    {
        return Err(invalid());
    }
    let usage = value
        .get("usage")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    if ["input_tokens", "output_tokens"].iter().any(|key| {
        usage
            .get(*key)
            .is_some_and(|value| value.as_u64().is_none())
    }) {
        return Err(invalid());
    }
    let questions = request
        .get("questions")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    let answers = value
        .get("answers")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    if answers.len() != questions.len() {
        return Err(invalid());
    }
    for (id, question) in questions {
        let answer = answers.get(id).ok_or_else(invalid)?;
        let kind = question
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        if answer.get("type").and_then(Value::as_str) != Some(kind) {
            return Err(invalid());
        }
        if kind == "noul" {
            if probability(answer.get("noul")).is_none() {
                return Err(invalid());
            }
            continue;
        }
        if probability(answer.get("confidence")).is_none() {
            return Err(invalid());
        }
        let distribution = answer
            .get("probabilities")
            .and_then(Value::as_object)
            .ok_or_else(invalid)?;
        match kind {
            "choice" => {
                let criteria = question
                    .get("criteria")
                    .and_then(Value::as_object)
                    .ok_or_else(invalid)?;
                let keys: Vec<&str> = criteria.keys().map(String::as_str).collect();
                let choice = answer
                    .get("choice")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                if !criteria.contains_key(choice) || !valid_distribution(distribution, &keys) {
                    return Err(invalid());
                }
                let selected = probability(distribution.get(choice)).ok_or_else(invalid)?;
                if distribution.values().any(|value| {
                    value
                        .as_f64()
                        .is_some_and(|value| value > selected + 0.000001)
                }) {
                    return Err(invalid());
                }
            }
            "score" => {
                let levels = question
                    .get("criteria")
                    .and_then(Value::as_array)
                    .ok_or_else(invalid)?;
                let keys: Vec<String> = (0..levels.len()).map(|index| index.to_string()).collect();
                let key_refs: Vec<&str> = keys.iter().map(String::as_str).collect();
                let legend = answer
                    .get("legend")
                    .and_then(Value::as_object)
                    .ok_or_else(invalid)?;
                let score = answer
                    .get("score")
                    .and_then(Value::as_f64)
                    .ok_or_else(invalid)?;
                if !score.is_finite()
                    || score < 0.0
                    || score > (levels.len().saturating_sub(1)) as f64
                    || !valid_distribution(distribution, &key_refs)
                    || legend.len() != levels.len()
                    || keys
                        .iter()
                        .any(|key| !legend.get(key).is_some_and(Value::is_string))
                {
                    return Err(invalid());
                }
            }
            _ => return Err(invalid()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_jev_status(app: AppHandle) -> Result<JevStatus, String> {
    let config = read_config(&app)?;
    Ok(JevStatus {
        configured: config.is_some(),
        model: default_model(),
        base_url: default_base_url(),
    })
}

#[tauri::command]
pub fn set_jev_api_key(app: AppHandle, api_key: String) -> Result<JevStatus, String> {
    let config = JevConfig {
        api_key: validate_api_key(&api_key)?,
    };
    write_config(&app, &config)?;
    get_jev_status(app)
}

#[tauri::command]
pub fn clear_jev_api_key(app: AppHandle) -> Result<JevStatus, String> {
    let path = config_path(&app)?;
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Jev APIキーを削除できません".to_string()),
    }
    get_jev_status(app)
}

#[tauri::command]
pub async fn test_jev_connection(app: AppHandle) -> Result<JevConnectionResult, String> {
    let config = read_config(&app)?.ok_or_else(|| "Jev APIキーが設定されていません".to_string())?;
    let response = official_request(JevEndpoint::Models, &config.api_key)?
        .send()
        .await
        .map_err(connection_error)?;
    validate_models(&read_response(response).await?)?;
    Ok(JevConnectionResult {
        ok: true,
        model: default_model(),
        message: "Jev APIへ接続できました".to_string(),
    })
}

#[tauri::command]
pub async fn jev_system_one(app: AppHandle, request: Value) -> Result<Value, String> {
    let config = read_config(&app)?.ok_or_else(|| "Jev APIキーが設定されていません".to_string())?;
    let payload = prepare_request(request)?;
    let response = official_request(JevEndpoint::SystemOne, &config.api_key)?
        .json(&payload)
        .send()
        .await
        .map_err(connection_error)?;
    let value = read_response(response).await?;
    validate_answers(&value, &payload)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let mut nonce = [0u8; 16];
            getrandom::fill(&mut nonce).unwrap();
            let path = std::env::temp_dir().join(format!(
                "xrift-jev-test-{:032x}",
                u128::from_le_bytes(nonce)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn config_path(&self) -> PathBuf {
            self.0.join(JEV_CONFIG_FILE)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request() -> Value {
        json!({
            "state": { "request": "夕方の森を作って" },
            "questions": {
                "terrain": { "type": "choice", "instructions": "地形を選ぶ", "criteria": { "forest": "森", "sea": null } },
                "review": { "type": "noul", "instructions": { "question": "確認が必要か" } },
                "severity": { "type": "score", "instructions": "問題の程度", "criteria": ["軽い", "中程度", "重い"] }
            }
        })
    }

    fn response() -> Value {
        json!({
            "model": "jev-1.13.0",
            "answers": {
                "terrain": { "type": "choice", "choice": "forest", "probabilities": { "forest": 0.9, "sea": 0.1 }, "confidence": 0.8 },
                "review": { "type": "noul", "noul": 0.2 },
                "severity": { "type": "score", "score": 0.8, "probabilities": { "0": 0.2, "1": 0.8, "2": 0.0 }, "legend": { "0": "軽い", "1": "中程度", "2": "重い" }, "confidence": 0.7 }
            },
            "usage": { "input_tokens": 400, "output_tokens": 40 }
        })
    }

    #[test]
    fn keys_accept_pasted_whitespace_but_reject_invalid_header_characters() {
        assert_eq!(
            validate_api_key("  test-key_123\n").unwrap(),
            "test-key_123"
        );
        for key in [
            "",
            "\t",
            "Bearer test-key",
            "test\nkey",
            "test\0key",
            "日本語",
        ] {
            assert!(validate_api_key(key).is_err());
        }
        assert!(validate_api_key(&"a".repeat(513)).is_err());
    }

    #[test]
    fn legacy_endpoint_cannot_change_requests_or_expose_authorization_in_debug() {
        let config: JevConfig = serde_json::from_value(json!({
            "apiKey": "test-key", "baseUrl": "https://untrusted.invalid", "model": "untrusted-model"
        }))
        .unwrap();
        for (endpoint, method, path) in [
            (JevEndpoint::Models, reqwest::Method::GET, "/v1/models"),
            (
                JevEndpoint::SystemOne,
                reqwest::Method::POST,
                "/v1/systemone",
            ),
        ] {
            let request = official_request(endpoint, &config.api_key)
                .unwrap()
                .build()
                .unwrap();
            assert_eq!(request.url().scheme(), "https");
            assert_eq!(request.url().host_str(), Some("api.typesafe.ai"));
            assert_eq!(request.url().path(), path);
            assert_eq!(request.method(), method);
            assert!(request.headers()[AUTHORIZATION].is_sensitive());
            assert!(!format!("{request:?}").contains("test-key"));
        }
        assert_eq!(
            serde_json::to_value(config).unwrap(),
            json!({ "apiKey": "test-key" })
        );
    }

    #[tokio::test]
    async fn transport_returns_redirect_without_following_it() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut buffer = [0u8; 2048];
            stream.read(&mut buffer).unwrap();
            stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: https://untrusted.invalid/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        // Only the loopback fixture permits HTTP; production also requires HTTPS.
        let response = client_builder()
            .https_only(false)
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{address}/"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::FOUND);
        assert!(read_response(response)
            .await
            .unwrap_err()
            .contains("通信を中止"));
        server.join().unwrap();
    }

    #[test]
    fn models_connection_requires_documented_list_and_default_model_access() {
        assert!(validate_models(&json!({ "ok": true })).is_err());
        assert!(validate_models(&json!({ "models": [] })).is_err());
        assert!(validate_models(&json!({ "models": [{ "name": "jev-latest" }] })).is_err());
        validate_models(&json!({ "models": [{ "name": "jev-latest", "description": "Stable model", "release_date": "2026-09-01" }] })).unwrap();
    }

    #[test]
    fn accepts_all_existing_official_question_types_and_their_answers() {
        let prepared = prepare_request(request()).unwrap();
        assert_eq!(prepared["model"], JEV_DEFAULT_MODEL);
        validate_answers(&response(), &prepared).unwrap();
    }

    #[test]
    fn accepts_probability_rounding_across_the_maximum_choice_count() {
        let keys: Vec<String> = (0..255).map(|index| format!("option-{index}")).collect();
        let distribution: Map<String, Value> = keys
            .iter()
            .map(|key| (key.clone(), json!(0.0039)))
            .collect();
        let key_refs: Vec<&str> = keys.iter().map(String::as_str).collect();
        // 1 / 255 rounds to 0.0039; their displayed sum is 0.9945.
        assert!(valid_distribution(&distribution, &key_refs));
        assert!(valid_distribution(
            &json!({"a": 0.333, "b": 0.333, "c": 0.333})
                .as_object()
                .unwrap(),
            &["a", "b", "c"]
        ));
        assert!(!valid_distribution(
            &json!({"a": 0.9, "b": 0.9}).as_object().unwrap(),
            &["a", "b"]
        ));
    }

    #[test]
    fn rejects_requests_that_cannot_match_the_official_schema() {
        let mut cases = Vec::new();
        let mut missing_state = request();
        missing_state.as_object_mut().unwrap().remove("state");
        cases.push(missing_state);
        let mut missing_instructions = request();
        missing_instructions["questions"]["terrain"]
            .as_object_mut()
            .unwrap()
            .remove("instructions");
        cases.push(missing_instructions);
        let mut missing_choices = request();
        missing_choices["questions"]["terrain"]["criteria"] = json!({});
        cases.push(missing_choices);
        let mut unsupported_type = request();
        unsupported_type["questions"]["terrain"]["type"] = json!("generate");
        cases.push(unsupported_type);
        let mut invalid_model = request();
        invalid_model["model"] = json!("https://untrusted.invalid");
        cases.push(invalid_model);
        let mut oversized = request();
        oversized["state"] = json!("a".repeat(JEV_MAX_REQUEST_BYTES));
        cases.push(oversized);
        for invalid in cases {
            assert!(prepare_request(invalid).is_err());
        }
    }

    #[test]
    fn refuses_missing_unknown_or_inconsistent_decisions_before_scene_changes() {
        let prepared = prepare_request(request()).unwrap();
        let mut cases = Vec::new();
        let mut missing = response();
        missing["answers"]
            .as_object_mut()
            .unwrap()
            .remove("terrain");
        cases.push(missing);
        let mut unknown = response();
        unknown["answers"]["terrain"]["choice"] = json!("unknown-recipe");
        cases.push(unknown);
        let mut incomplete = response();
        incomplete["answers"]["terrain"]["probabilities"]
            .as_object_mut()
            .unwrap()
            .remove("sea");
        cases.push(incomplete);
        let mut unnormalized = response();
        unnormalized["answers"]["terrain"]["probabilities"]["sea"] = json!(0.9);
        cases.push(unnormalized);
        let mut wrong_choice = response();
        wrong_choice["answers"]["terrain"]["choice"] = json!("sea");
        cases.push(wrong_choice);
        let mut confidence = response();
        confidence["answers"]["terrain"]["confidence"] = json!(1.5);
        cases.push(confidence);
        let mut noul = response();
        noul["answers"]["review"]["noul"] = json!(-0.1);
        cases.push(noul);
        let mut score = response();
        score["answers"]["severity"]["score"] = json!(3.0);
        cases.push(score);
        let mut wrong_type = response();
        wrong_type["answers"]["review"]["type"] = json!("choice");
        cases.push(wrong_type);
        for invalid in cases {
            assert!(validate_answers(&invalid, &prepared).is_err());
        }
    }

    #[test]
    fn settings_replace_complete_files_without_shared_temporary_names() {
        let dir = TestDirectory::new();
        let path = dir.config_path();
        assert!(read_config_at(&path).unwrap().is_none());
        write_config_at(
            &path,
            &JevConfig {
                api_key: "first-key".into(),
            },
        )
        .unwrap();
        let mut writers = Vec::new();
        for index in 0..8 {
            let path = path.clone();
            writers.push(std::thread::spawn(move || {
                write_config_at(
                    &path,
                    &JevConfig {
                        api_key: format!("test-key-{index}"),
                    },
                )
                .unwrap();
                // A concurrent replacement must still leave a complete JSON file.
                assert!(read_config_at(&path).unwrap().is_some());
            }));
        }
        for writer in writers {
            writer.join().unwrap();
        }
        let saved = read_config_at(&path).unwrap().unwrap();
        assert!(saved.api_key.starts_with("test-key-"));
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn failed_settings_replacement_cleans_secret_temp_file_and_preserves_target() {
        let dir = TestDirectory::new();
        let path = dir.config_path();
        fs::create_dir(&path).unwrap();
        assert!(write_config_at(
            &path,
            &JevConfig {
                api_key: "secret-key".into()
            }
        )
        .is_err());
        assert!(path.is_dir());
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
    }

    #[test]
    fn invalid_saved_credentials_do_not_leak_through_errors() {
        let dir = TestDirectory::new();
        let path = dir.config_path();
        for bytes in [
            br#"{"apiKey":{"secret-key":"invalid-type"}}"#.as_slice(),
            br#"{"apiKey":"secret-key invalid-space"}"#.as_slice(),
        ] {
            fs::write(&path, bytes).unwrap();
            let error = read_config_at(&path).err().unwrap();
            assert!(!error.contains("secret-key"));
        }
    }
}
