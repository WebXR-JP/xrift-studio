use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;

fn valid_item_id(id: &str) -> bool {
    id.len() == 36 && id.bytes().enumerate().all(|(i, b)| {
        if matches!(i, 8 | 13 | 18 | 23) { b == b'-' } else { b.is_ascii_hexdigit() }
    })
}

fn read_cli_token(home: &Path) -> Result<String, String> {
    let path = home.join(".xrift/config.json");
    let metadata = std::fs::metadata(&path).map_err(|_| "LOGIN_REQUIRED:XRiftにログインしてください".to_owned())?;
    if metadata.len() > 64 * 1024 { return Err("LOGIN_REQUIRED:ログイン情報を確認できません".into()); }
    let config: Value = serde_json::from_slice(&std::fs::read(path).map_err(|_| "LOGIN_REQUIRED:ログイン情報を確認できません")?)
        .map_err(|_| "LOGIN_REQUIRED:ログイン情報を確認できません")?;
    let token = config.get("token").and_then(Value::as_str).filter(|s| !s.is_empty() && !s.chars().any(char::is_whitespace))
        .ok_or("LOGIN_REQUIRED:XRiftにログインしてください")?;
    Ok(token.to_owned())
}

/// Resolve only an official item id. Credentials remain in the native process.
#[tauri::command]
pub async fn resolve_xrift_item(app: AppHandle, item_id: String) -> Result<String, String> {
    if !valid_item_id(&item_id) { return Err("NOT_FOUND:Item IDにはUUIDを指定してください".into()); }
    let paths = crate::runtime_paths(app)?;
    let token = read_cli_token(Path::new(&paths.home))?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "LOAD_FAILED:通信を開始できません")?;
    let response = client.get(format!("https://api.xrift.net/api/public/v1/items/{item_id}/resolve"))
        .bearer_auth(token).send().await.map_err(|_| "LOAD_FAILED:アイテムの読み込みに失敗しました。再試行してください")?;
    match response.status().as_u16() {
        401 => return Err("LOGIN_REQUIRED:XRiftにログインし直してください".into()),
        403 => return Err("FORBIDDEN:このアイテムを使う権利がありません。マイアイテムやライブラリを確認してください".into()),
        404 => return Err("NOT_FOUND:アイテムが見つかりません".into()),
        _ => {}
    }
    if !response.status().is_success() { return Err("LOAD_FAILED:アイテムの解決に失敗しました。再試行してください".into()); }
    let body: Value = response.json().await.map_err(|_| "LOAD_FAILED:アイテムの応答を読み取れません")?;
    let scene_url = body.get("sceneUrl").and_then(Value::as_str)
        .ok_or("NOT_FOUND:このアイテムは審査中、または配信できる版がありません")?;
    let parsed = reqwest::Url::parse(scene_url).map_err(|_| "LOAD_FAILED:配信URLを確認できません")?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("LOAD_FAILED:配信URLを確認できません".into());
    }
    Ok(scene_url.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_uuid_item_ids_reach_the_api() {
        assert!(valid_item_id("550e8400-e29b-41d4-a716-446655440000"));
        for id in ["", "../worlds", "550e8400-e29b-41d4-a716-446655440000/resolve", "zzzzzzzz-e29b-41d4-a716-446655440000"] {
            assert!(!valid_item_id(id));
        }
    }
}
