use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

const NODE_VERSION: &str = "v24.15.0";

#[cfg(target_os = "windows")]
const NODE_DIST: &str = "node-v24.15.0-win-x64";
#[cfg(target_os = "windows")]
const NODE_ARCHIVE_NAME: &str = "node-v24.15.0-win-x64.zip";
#[cfg(target_os = "windows")]
const NODE_EXE_NAME: &str = "node.exe";
#[cfg(target_os = "windows")]
const NODE_BIN_REL: &str = "";

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const NODE_DIST: &str = "node-v24.15.0-darwin-arm64";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const NODE_ARCHIVE_NAME: &str = "node-v24.15.0-darwin-arm64.tar.gz";

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const NODE_DIST: &str = "node-v24.15.0-darwin-x64";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const NODE_ARCHIVE_NAME: &str = "node-v24.15.0-darwin-x64.tar.gz";

#[cfg(target_os = "macos")]
const NODE_EXE_NAME: &str = "node";
#[cfg(target_os = "macos")]
const NODE_BIN_REL: &str = "bin";

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const NODE_DIST: &str = "node-v24.15.0-linux-x64";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const NODE_ARCHIVE_NAME: &str = "node-v24.15.0-linux-x64.tar.gz";

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const NODE_DIST: &str = "node-v24.15.0-linux-arm64";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const NODE_ARCHIVE_NAME: &str = "node-v24.15.0-linux-arm64.tar.gz";

#[cfg(target_os = "linux")]
const NODE_EXE_NAME: &str = "node";
#[cfg(target_os = "linux")]
const NODE_BIN_REL: &str = "bin";

fn node_url() -> String {
    format!(
        "https://nodejs.org/dist/{}/{}",
        NODE_VERSION, NODE_ARCHIVE_NAME
    )
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePaths {
    pub app_root: String,
    pub runtime_dir: String,
    pub node_dist_dir: String,
    pub node_bin_dir: String,
    pub node_exe: String,
    pub npm_cli_js: String,
    pub npm_prefix: String,
    pub npm_cache: String,
    pub home: String,
    pub projects_root: String,
    pub xrift_cmd: String,
    pub xrift_js: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub ready: bool,
    pub node_installed: bool,
    pub xrift_installed: bool,
    pub paths: RuntimePaths,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct SetupProgress {
    step: String,
    percent: f64,
    message: String,
}

#[derive(Serialize)]
struct Project {
    name: String,
    path: String,
    title: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct XriftJson {
    title: Option<String>,
    description: Option<String>,
}

fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn derive_paths(root: &Path) -> RuntimePaths {
    let runtime_dir = root.join("runtime");
    let node_dist_dir = runtime_dir.join(NODE_DIST);
    let node_bin_dir = if NODE_BIN_REL.is_empty() {
        node_dist_dir.clone()
    } else {
        node_dist_dir.join(NODE_BIN_REL)
    };
    let node_exe = node_bin_dir.join(NODE_EXE_NAME);
    let npm_cli_js = node_dist_dir
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js");
    let npm_prefix = root.join("npm-prefix");
    let npm_cache = root.join("npm-cache");
    let home = root.join("home");
    let projects_root = root.join("projects");

    let xrift_cmd = if cfg!(target_os = "windows") {
        npm_prefix.join("xrift.cmd")
    } else {
        npm_prefix.join("bin").join("xrift")
    };
    let xrift_js = if cfg!(target_os = "windows") {
        npm_prefix
            .join("node_modules")
            .join("@xrift")
            .join("cli")
            .join("dist")
            .join("cli.js")
    } else {
        npm_prefix
            .join("lib")
            .join("node_modules")
            .join("@xrift")
            .join("cli")
            .join("dist")
            .join("cli.js")
    };

    RuntimePaths {
        app_root: root.to_string_lossy().to_string(),
        runtime_dir: runtime_dir.to_string_lossy().to_string(),
        node_dist_dir: node_dist_dir.to_string_lossy().to_string(),
        node_bin_dir: node_bin_dir.to_string_lossy().to_string(),
        node_exe: node_exe.to_string_lossy().to_string(),
        npm_cli_js: npm_cli_js.to_string_lossy().to_string(),
        npm_prefix: npm_prefix.to_string_lossy().to_string(),
        npm_cache: npm_cache.to_string_lossy().to_string(),
        home: home.to_string_lossy().to_string(),
        projects_root: projects_root.to_string_lossy().to_string(),
        xrift_cmd: xrift_cmd.to_string_lossy().to_string(),
        xrift_js: xrift_js.to_string_lossy().to_string(),
    }
}

#[tauri::command]
fn runtime_paths(app: AppHandle) -> Result<RuntimePaths, String> {
    let root = app_root(&app)?;
    Ok(derive_paths(&root))
}

#[tauri::command]
fn runtime_status(app: AppHandle) -> Result<RuntimeStatus, String> {
    let paths = runtime_paths(app)?;
    let node_installed = Path::new(&paths.node_exe).exists();
    let xrift_installed = Path::new(&paths.xrift_cmd).exists();
    Ok(RuntimeStatus {
        ready: node_installed && xrift_installed,
        node_installed,
        xrift_installed,
        paths,
    })
}

fn emit_progress(app: &AppHandle, step: &str, percent: f64, message: &str) {
    let _ = app.emit(
        "setup-progress",
        SetupProgress {
            step: step.to_string(),
            percent,
            message: message.to_string(),
        },
    );
}

async fn download_node(app: &AppHandle, paths: &RuntimePaths) -> Result<PathBuf, String> {
    let archive_path = PathBuf::from(&paths.runtime_dir).join(NODE_ARCHIVE_NAME);
    let url = node_url();
    emit_progress(app, "download", 0.0, &format!("DL中: {}", url));

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = tokio::fs::File::create(&archive_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let percent = (downloaded as f64 / total as f64) * 100.0;
            emit_progress(
                app,
                "download",
                percent,
                &format!(
                    "Node.js DL中  {:.1} / {:.1} MB",
                    downloaded as f64 / 1_048_576.0,
                    total as f64 / 1_048_576.0
                ),
            );
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(archive_path)
}

#[cfg(target_os = "windows")]
fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    zip.extract(dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(gz);
    tar.unpack(dest).map_err(|e| e.to_string())?;
    Ok(())
}

async fn run_npm_install_global(
    paths: &RuntimePaths,
    package_spec: &str,
) -> Result<(), String> {
    let mut cmd = tokio::process::Command::new(&paths.node_exe);
    cmd.arg(&paths.npm_cli_js)
        .arg("install")
        .arg("--global")
        .arg("--prefix")
        .arg(&paths.npm_prefix)
        .arg("--cache")
        .arg(&paths.npm_cache)
        .arg("--no-audit")
        .arg("--no-fund")
        .arg(package_spec);

    cmd.env_clear();
    cmd.env(
        "PATH",
        format!(
            "{}{}{}",
            paths.node_bin_dir,
            if cfg!(target_os = "windows") { ";" } else { ":" },
            std::env::var("PATH").unwrap_or_default()
        ),
    );
    cmd.env("NPM_CONFIG_PREFIX", &paths.npm_prefix);
    cmd.env("NPM_CONFIG_CACHE", &paths.npm_cache);
    cmd.env("NPM_CONFIG_FUND", "false");
    cmd.env("NPM_CONFIG_AUDIT", "false");
    cmd.env("HOME", &paths.home);
    cmd.env("USERPROFILE", &paths.home);
    if let Ok(v) = std::env::var("SystemRoot") {
        cmd.env("SystemRoot", v);
    }
    if let Ok(v) = std::env::var("TEMP") {
        cmd.env("TEMP", v);
    }
    if let Ok(v) = std::env::var("TMP") {
        cmd.env("TMP", v);
    }

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "npm install failed:\nstdout: {}\nstderr: {}",
            stdout, stderr
        ));
    }
    Ok(())
}

async fn install_xrift(app: &AppHandle, paths: &RuntimePaths) -> Result<(), String> {
    emit_progress(app, "npm-install", 0.0, "xrift CLI をインストール中...");
    run_npm_install_global(paths, "@xrift/cli").await
}

#[tauri::command]
async fn check_xrift_latest() -> Result<Option<String>, String> {
    let url = "https://registry.npmjs.org/@xrift/cli/latest";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let version = json
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok(version)
}

#[tauri::command]
async fn update_xrift(app: AppHandle) -> Result<(), String> {
    let paths = runtime_paths(app.clone())?;
    emit_progress(&app, "xrift-update", 0.0, "@xrift/cli をアップデート中...");
    run_npm_install_global(&paths, "@xrift/cli@latest").await?;
    emit_progress(&app, "xrift-update", 100.0, "アップデート完了");
    Ok(())
}

#[tauri::command]
async fn setup_runtime(app: AppHandle) -> Result<RuntimeStatus, String> {
    let paths = runtime_paths(app.clone())?;

    for d in [
        &paths.runtime_dir,
        &paths.npm_prefix,
        &paths.npm_cache,
        &paths.home,
        &paths.projects_root,
    ] {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }

    if !Path::new(&paths.node_exe).exists() {
        emit_progress(&app, "download", 0.0, "Node.js をダウンロード中...");
        let archive = download_node(&app, &paths).await?;
        emit_progress(&app, "extract", 0.0, "アーカイブを展開中...");
        extract_archive(&archive, Path::new(&paths.runtime_dir))?;
        let _ = std::fs::remove_file(&archive);
    } else {
        emit_progress(&app, "node-cached", 100.0, "Node.js は導入済み");
    }

    if !Path::new(&paths.xrift_cmd).exists() {
        install_xrift(&app, &paths).await?;
    } else {
        emit_progress(&app, "xrift-cached", 100.0, "xrift CLI は導入済み");
    }

    emit_progress(&app, "done", 100.0, "セットアップ完了");
    runtime_status(app)
}

#[tauri::command]
fn sandbox_env(app: AppHandle) -> Result<std::collections::HashMap<String, String>, String> {
    let paths = runtime_paths(app)?;
    let mut env = std::collections::HashMap::new();
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let path = format!(
        "{}{}{}",
        paths.node_bin_dir,
        sep,
        std::env::var("PATH").unwrap_or_default()
    );
    env.insert("PATH".into(), path);
    env.insert("NPM_CONFIG_PREFIX".into(), paths.npm_prefix.clone());
    env.insert("NPM_CONFIG_CACHE".into(), paths.npm_cache.clone());
    env.insert("NPM_CONFIG_FUND".into(), "false".into());
    env.insert("NPM_CONFIG_AUDIT".into(), "false".into());
    env.insert("HOME".into(), paths.home.clone());
    env.insert("USERPROFILE".into(), paths.home);
    if let Ok(v) = std::env::var("SystemRoot") {
        env.insert("SystemRoot".into(), v);
    }
    if let Ok(v) = std::env::var("TEMP") {
        env.insert("TEMP".into(), v);
    }
    if let Ok(v) = std::env::var("TMP") {
        env.insert("TMP".into(), v);
    }
    if let Ok(v) = std::env::var("APPDATA") {
        env.insert("APPDATA".into(), v);
    }
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        env.insert("LOCALAPPDATA".into(), v);
    }
    Ok(env)
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects(root: String) -> Result<Vec<Project>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        if let Err(e) = std::fs::create_dir_all(&root_path) {
            return Err(format!("プロジェクトディレクトリを作成できません: {}", e));
        }
    }
    let mut projects = Vec::new();
    let entries = match std::fs::read_dir(&root_path) {
        Ok(r) => r,
        Err(e) => return Err(format!("プロジェクトディレクトリを読み込めません: {}", e)),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_dir = match entry.file_type() {
            Ok(ft) => ft.is_dir(),
            Err(_) => continue,
        };
        if !is_dir {
            continue;
        }
        let xrift_json = path.join("xrift.json");
        if !xrift_json.exists() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let (title, description) = std::fs::read_to_string(&xrift_json)
            .ok()
            .and_then(|c| serde_json::from_str::<XriftJson>(&c).ok())
            .map(|j| (j.title, j.description))
            .unwrap_or((None, None));
        projects.push(Project {
            name,
            path: path.to_string_lossy().to_string(),
            title,
            description,
        });
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
fn read_world_file(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join("src").join("World.tsx");
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_world_file(project_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path).join("src").join("World.tsx");
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn safe_join(project_path: &str, rel: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(project_path);
    let rel_clean = rel.replace('\\', "/");
    if rel_clean.contains("..") {
        return Err("invalid path".to_string());
    }
    Ok(base.join(rel_clean))
}

#[tauri::command]
fn read_text_file(project_path: String, rel: String) -> Result<String, String> {
    let path = safe_join(&project_path, &rel)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(project_path: String, rel: String, content: String) -> Result<(), String> {
    let path = safe_join(&project_path, &rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image_data_url(project_path: String, rel: String) -> Result<String, String> {
    let path = safe_join(&project_path, &rel)?;
    if !path.exists() {
        return Err("file not found".to_string());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn read_thumbnail(project_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&project_path)
        .join("public")
        .join("thumbnail.png");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:image/png;base64,{}", b64)))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    rel: String,
    is_dir: bool,
    size: Option<u64>,
}

const SKIP_DIRS: &[&str] = &["node_modules", "dist", ".git", ".next", ".cache", "target"];

#[tauri::command]
fn list_files(project_path: String, rel: String) -> Result<Vec<FsEntry>, String> {
    let base = if rel.is_empty() {
        PathBuf::from(&project_path)
    } else {
        safe_join(&project_path, &rel)?
    };
    if !base.exists() {
        return Ok(vec![]);
    }
    let read = match std::fs::read_dir(&base) {
        Ok(r) => r,
        // Access denied or other read failure → treat as empty rather than error
        Err(_) => return Ok(vec![]),
    };
    let mut entries: Vec<FsEntry> = Vec::new();
    for item in read {
        let entry = match item {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if SKIP_DIRS.iter().any(|s| *s == name) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let rel_full = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel.trim_end_matches('/'), name)
        };
        entries.push(FsEntry {
            name,
            rel: rel_full,
            is_dir: meta.is_dir(),
            size: if meta.is_file() {
                Some(meta.len())
            } else {
                None
            },
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
fn delete_path(project_path: String, rel: String) -> Result<(), String> {
    if rel.trim().is_empty() {
        return Err("project root cannot be deleted".into());
    }
    let path = safe_join(&project_path, &rel)?;
    if !path.exists() {
        return Err("path does not exist".into());
    }
    let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_path(
    project_path: String,
    old_rel: String,
    new_rel: String,
) -> Result<(), String> {
    if old_rel.trim().is_empty() || new_rel.trim().is_empty() {
        return Err("invalid path".into());
    }
    let from = safe_join(&project_path, &old_rel)?;
    let to = safe_join(&project_path, &new_rel)?;
    if !from.exists() {
        return Err("source does not exist".into());
    }
    if to.exists() {
        return Err("destination already exists".into());
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn write_binary_file(
    project_path: String,
    rel: String,
    data_url: String,
) -> Result<(), String> {
    let path = safe_join(&project_path, &rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let comma = data_url.find(',').ok_or("invalid data url")?;
    let b64 = &data_url[comma + 1..];
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Versions {
    app_version: String,
    node_version: String,
}

#[tauri::command]
fn get_versions() -> Versions {
    Versions {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        node_version: NODE_VERSION.trim_start_matches('v').to_string(),
    }
}

// Windows の npm でインストールされたファイルは read-only 属性が付くことがあり、
// そのままでは remove_dir_all が `Access is denied` で失敗する。
// このヘルパは事前に属性をクリアし、短い待機を挟みつつ数回リトライする。
fn clear_readonly_recursive(path: &Path) {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    let mut perm = meta.permissions();
    if perm.readonly() {
        perm.set_readonly(false);
        let _ = std::fs::set_permissions(path, perm);
    }
    if meta.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                clear_readonly_recursive(&entry.path());
            }
        }
    }
}

fn force_remove_dir_all(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if std::fs::remove_dir_all(path).is_ok() {
        return Ok(());
    }
    clear_readonly_recursive(path);
    let mut last_err: Option<std::io::Error> = None;
    for attempt in 0..3 {
        match std::fs::remove_dir_all(path) {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(300 * (attempt + 1)));
                clear_readonly_recursive(path);
            }
        }
    }
    if !path.exists() {
        return Ok(());
    }
    Err(format!(
        "{}: {}",
        path.display(),
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

#[tauri::command]
fn reset_app_data(app: AppHandle, scope: String) -> Result<(), String> {
    let root = app_root(&app)?;
    let paths = derive_paths(&root);

    // 削除に失敗したパスを収集し、全ターゲットを試行してからまとめてエラー化する。
    // 途中で失敗しても残りの領域は掃除されるので、ユーザの再試行が効きやすい。
    let mut failures: Vec<String> = Vec::new();
    let mut try_remove = |p: &str| {
        if let Err(e) = force_remove_dir_all(Path::new(p)) {
            failures.push(e);
        }
    };

    match scope.as_str() {
        "runtime" => {
            try_remove(&paths.runtime_dir);
            try_remove(&paths.npm_prefix);
            try_remove(&paths.npm_cache);
            try_remove(&paths.home);
        }
        "projects" => {
            try_remove(&paths.projects_root);
        }
        "all" => {
            // 既知のサブディレクトリを個別に削除（ログイン状態・ランタイム・
            // プロジェクトを全て含む）。Tauri 自体が app_data_dir に書く
            // 付随データはそのまま残す。
            try_remove(&paths.runtime_dir);
            try_remove(&paths.npm_prefix);
            try_remove(&paths.npm_cache);
            try_remove(&paths.home);
            try_remove(&paths.projects_root);
        }
        other => return Err(format!("unknown reset scope: {}", other)),
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("\n"))
    }
}

#[tauri::command]
fn kill_pid_tree(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if !stderr.contains("not found") && !stderr.contains("見つかりません") {
                return Err(stderr);
            }
        }
    }
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .status();
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status();
    }
    Ok(())
}

#[tauri::command]
fn write_thumbnail(project_path: String, data_url: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path)
        .join("public")
        .join("thumbnail.png");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let comma = data_url.find(',').ok_or("invalid data url")?;
    let b64 = &data_url[comma + 1..];
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            runtime_paths,
            runtime_status,
            setup_runtime,
            sandbox_env,
            ensure_dir,
            list_projects,
            read_world_file,
            write_world_file,
            read_text_file,
            write_text_file,
            read_thumbnail,
            write_thumbnail,
            read_image_data_url,
            list_files,
            write_binary_file,
            delete_path,
            rename_path,
            get_versions,
            kill_pid_tree,
            reset_app_data,
            check_xrift_latest,
            update_xrift,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
