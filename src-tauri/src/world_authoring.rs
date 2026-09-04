use super::*;
use std::io::{BufRead, Write};

static JOURNAL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(super) fn ignore_generated_directory(root: &Path, entry: &str) -> Result<(), String> {
    let path = safe_join_path(root, ".gitignore")?;
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    if !text.lines().any(|line| line.trim() == entry) {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        let prefix = if text.is_empty() || text.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        file.write_all(format!("{prefix}{entry}\n").as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn journal_path(project_path: &str, scene_id: &str) -> Result<PathBuf, String> {
    if scene_id.is_empty()
        || scene_id.len() > 128
        || !scene_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Scene IDが不正です。".into());
    }
    let root = canonical_project_root(project_path)?;
    if !root.join(VISUAL_PROJECT_MANIFEST).is_file() {
        return Err("制作プロジェクトが見つかりません。".into());
    }
    safe_join_path(&root, &format!(".xrift-authoring/{scene_id}.jsonl"))
}

fn read_latest(path: &Path) -> Result<Option<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut latest = None;
    for line in std::io::BufReader::new(file).lines() {
        let line = line.map_err(|e| e.to_string())?;
        latest = Some(
            serde_json::from_str(&line)
                .map_err(|_| "制作履歴が破損しています。履歴を確認してください。".to_string())?,
        );
    }
    Ok(latest)
}

#[tauri::command]
pub fn read_world_authoring(
    project_path: String,
    scene_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let _lock = JOURNAL_LOCK.lock().map_err(|e| e.to_string())?;
    read_latest(&journal_path(&project_path, &scene_id)?)
}

#[tauri::command]
pub fn read_world_authoring_images(
    app: AppHandle,
    project_path: String,
    scene_id: String,
    fingerprint: String,
) -> Result<Vec<serde_json::Value>, String> {
    use base64::Engine;
    let state = read_world_authoring(project_path, scene_id)?;
    let Some(state) = state else {
        return Ok(vec![]);
    };
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("debug-captures");
    let mut images = vec![];
    for view in ["spawn", "iso"] {
        let capture = &state["captures"][view];
        if capture["fingerprint"].as_str() != Some(fingerprint.as_str()) {
            continue;
        }
        let Some(path) = capture["path"].as_str() else {
            continue;
        };
        // Use only a registered regular PNG inside Studio's own capture directory.
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let path = PathBuf::from(path);
        let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > 8 * 1024 * 1024
        {
            return Err("保存された画像を読み取れません。撮り直してください。".into());
        }
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        if !path.starts_with(&root) {
            return Err("画像がStudioの保存先の外にあります。".into());
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        if !bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
            return Err("画像がPNGではありません。".into());
        }
        images.push(serde_json::json!({"view": view, "captureId": capture["id"], "mimeType": "image/png", "data": base64::engine::general_purpose::STANDARD.encode(bytes)}));
    }
    Ok(images)
}

#[tauri::command]
pub fn save_world_authoring(
    project_path: String,
    scene_id: String,
    expected_sequence: u64,
    state: serde_json::Value,
) -> Result<(), String> {
    let _lock = JOURNAL_LOCK.lock().map_err(|e| e.to_string())?;
    let path = journal_path(&project_path, &scene_id)?;
    let current = read_latest(&path)?;
    let sequence = current
        .as_ref()
        .and_then(|v| v["sequence"].as_u64())
        .unwrap_or(0);
    if sequence != expected_sequence || state["sequence"].as_u64() != Some(sequence + 1) {
        return Err("制作履歴が更新されています。状態を読み直してください。".into());
    }
    let mut bytes = serde_json::to_vec(&state).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("制作状態が大きすぎます。".into());
    }
    bytes.push(b'\n');
    ignore_generated_directory(
        &canonical_project_root(&project_path)?,
        "/.xrift-authoring/",
    )?;
    std::fs::create_dir_all(path.parent().ok_or("保存先が不正です。")?)
        .map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "xrift-authoring-{}",
            recording_random_id().unwrap()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join(VISUAL_PROJECT_MANIFEST), "{}").unwrap();
        root.canonicalize().unwrap()
    }
    #[test]
    fn journal_persists_and_rejects_stale_writes() {
        let root = project();
        let path = root.to_string_lossy().to_string();
        let value = serde_json::json!({"sequence":1,"blueprint":"courtyard"});
        save_world_authoring(path.clone(), "scene".into(), 0, value.clone()).unwrap();
        assert_eq!(
            read_world_authoring(path.clone(), "scene".into()).unwrap(),
            Some(value.clone())
        );
        assert!(save_world_authoring(path.clone(), "scene".into(), 0, value).is_err());
        assert!(read_world_authoring(path, "../escape".into()).is_err());
        assert!(std::fs::read_to_string(root.join(".gitignore"))
            .unwrap()
            .contains("/.xrift-authoring/"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_journal_is_not_silently_discarded() {
        let root = project();
        let file = root.join("damaged.jsonl");
        std::fs::write(&file, "{\"sequence\":1}\n{broken").unwrap();
        assert!(read_latest(&file).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn ignore_entries_preserve_existing_content_and_are_idempotent() {
        let root = project();
        std::fs::write(root.join(".gitignore"), "assets/private").unwrap();
        ignore_generated_directory(&root, "/Recording/").unwrap();
        ignore_generated_directory(&root, "/Recording/").unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join(".gitignore")).unwrap(),
            "assets/private\n/Recording/\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
