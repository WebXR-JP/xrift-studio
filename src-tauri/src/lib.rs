use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const NODE_VERSION: &str = "v24.15.0";
const VISUAL_PROJECT_MANIFEST: &str = "xrift-studio.project.json";
const VISUAL_PROJECT_SCHEMA_VERSION: &str = "0.1.0";
const SCENE_DOCUMENT_SCHEMA_VERSION: &str = "0.1.0";
const ASSET_MANIFEST_SCHEMA_VERSION: &str = "0.1.0";
const PREFAB_DOCUMENT_SCHEMA_VERSION: &str = "0.1.0";
const VISUAL_SAVE_CACHE: &str = ".cache/xrift-studio-save";
const VISUAL_SAVE_OWNER: &str = "xrift-studio-visual-save-v1";
const COMPILER_STAGING_DIRECTORY: &str = "xrift-studio-staging";
static VISUAL_PROJECT_IO_LOCK: Mutex<()> = Mutex::new(());
static COMPILER_STAGING_IO_LOCK: Mutex<()> = Mutex::new(());
static VISUAL_ASSET_IMPORT_IO_LOCK: Mutex<()> = Mutex::new(());

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
    kind: String,
    format: String,
    title: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VisualProjectMetadata {
    name: String,
    title: String,
    description: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VisualProjectManifest {
    schema_version: String,
    project_id: String,
    project_kind: String,
    metadata: VisualProjectMetadata,
    entry_scene_id: String,
    scene_paths: HashMap<String, String>,
    asset_manifest_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualDocumentWrite {
    relative_path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualBinaryDocumentWrite {
    relative_path: String,
    data_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualProjectWriteRequest {
    project_json: String,
    scene_documents: Vec<VisualDocumentWrite>,
    #[serde(default)]
    prefab_documents: Vec<VisualDocumentWrite>,
    asset_manifest_json: String,
    #[serde(default)]
    binary_documents: Vec<VisualBinaryDocumentWrite>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualDocumentFile {
    relative_path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualProjectFiles {
    project_json: String,
    scene_documents: Vec<VisualDocumentFile>,
    prefab_documents: Vec<VisualDocumentFile>,
    asset_manifest_json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompilerStagingPaths {
    root_path: String,
    project_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompilerOverlayWrite {
    relative_path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompilerAssetCopy {
    source_relative_path: String,
    target_relative_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualAssetImportWrite {
    relative_path: String,
    data_url: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualSaveJournal {
    phase: String,
    entries: Vec<VisualSaveJournalEntry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualSaveJournalEntry {
    relative_path: String,
    original_existed: bool,
    backup_name: String,
    staged_name: String,
}

#[derive(Deserialize)]
struct ProjectMetadata {
    title: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct XriftJson {
    world: Option<ProjectMetadata>,
    item: Option<ProjectMetadata>,
    // 古いプロジェクトをライブラリから消さないための後方互換用。
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

async fn run_npm_install_global(paths: &RuntimePaths, package_spec: &str) -> Result<(), String> {
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
            if cfg!(target_os = "windows") {
                ";"
            } else {
                ":"
            },
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
    let sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
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
        let directory_name = entry.file_name().to_string_lossy().to_string();
        if directory_name == ".cache" || directory_name.starts_with(".xrift-studio-create-") {
            continue;
        }
        let is_dir = match entry.file_type() {
            Ok(ft) => ft.is_dir(),
            Err(_) => continue,
        };
        if !is_dir {
            continue;
        }

        let visual_manifest_path = path.join(VISUAL_PROJECT_MANIFEST);
        if visual_manifest_path.exists() {
            // A directory declaring the visual format is never guessed as classic.
            // Invalid manifests remain hidden until the visual project can be repaired.
            let visual = std::fs::read_to_string(&visual_manifest_path)
                .map_err(|e| e.to_string())
                .and_then(|content| parse_visual_project_manifest(&content));
            if let Ok(manifest) = visual {
                projects.push(project_from_visual_manifest(&path, &manifest));
            }
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
        let (kind, title, description) = std::fs::read_to_string(&xrift_json)
            .ok()
            .and_then(|c| serde_json::from_str::<XriftJson>(&c).ok())
            .map(|j| {
                if let Some(item) = j.item {
                    ("item".to_string(), item.title, item.description)
                } else if let Some(world) = j.world {
                    ("world".to_string(), world.title, world.description)
                } else {
                    ("world".to_string(), j.title, j.description)
                }
            })
            .unwrap_or(("world".to_string(), None, None));
        projects.push(Project {
            name,
            path: path.to_string_lossy().to_string(),
            kind,
            format: "classic".to_string(),
            title,
            description,
        });
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

struct ValidatedVisualWrite {
    manifest: VisualProjectManifest,
    files: Vec<(String, String)>,
    binary_files: Vec<(String, Vec<u8>)>,
}

#[derive(Clone)]
struct PrefabAssetDeclaration {
    asset_id: String,
    relative_path: String,
}

struct ValidatedAssetManifest {
    asset_kinds: HashMap<String, String>,
    prefab_assets: Vec<PrefabAssetDeclaration>,
}

struct ValidatedPrefabDocument {
    relative_path: String,
    prefab_id: String,
    entity_ids: HashSet<String>,
    prefab_instance_references: Vec<(String, String)>,
}

fn parse_visual_project_manifest(content: &str) -> Result<VisualProjectManifest, String> {
    let manifest: VisualProjectManifest = serde_json::from_str(content)
        .map_err(|e| format!("invalid visual project manifest: {}", e))?;
    validate_visual_project_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_visual_project_manifest(manifest: &VisualProjectManifest) -> Result<(), String> {
    if manifest.schema_version != VISUAL_PROJECT_SCHEMA_VERSION {
        return Err("unsupported visual project schema version".to_string());
    }
    if manifest.project_id.trim().is_empty() {
        return Err("visual project id is required".to_string());
    }
    if manifest.project_kind != "world" && manifest.project_kind != "item" {
        return Err("visual project kind must be world or item".to_string());
    }
    if manifest.metadata.name.trim().is_empty() || manifest.metadata.title.trim().is_empty() {
        return Err("visual project name and title are required".to_string());
    }
    if manifest.entry_scene_id.trim().is_empty()
        || !manifest.scene_paths.contains_key(&manifest.entry_scene_id)
    {
        return Err("entry scene is missing from scenePaths".to_string());
    }
    if manifest.scene_paths.is_empty() {
        return Err("visual project requires at least one scene".to_string());
    }

    let mut document_paths = HashSet::new();
    for (scene_id, relative_path) in &manifest.scene_paths {
        if scene_id.trim().is_empty() {
            return Err("scene id is empty".to_string());
        }
        let normalized = normalized_visual_document_path(relative_path)?;
        if normalized != *relative_path {
            return Err(format!(
                "scene path must use normalized forward slashes: {}",
                relative_path
            ));
        }
        if !document_paths.insert(normalized) {
            return Err("scene paths must be unique".to_string());
        }
    }

    let asset_path = normalized_visual_document_path(&manifest.asset_manifest_path)?;
    if asset_path != manifest.asset_manifest_path {
        return Err("asset manifest path must use normalized forward slashes".to_string());
    }
    if !document_paths.insert(asset_path) {
        return Err("asset manifest path collides with a scene path".to_string());
    }
    if document_paths.contains(VISUAL_PROJECT_MANIFEST) {
        return Err("visual document path collides with project manifest".to_string());
    }
    Ok(())
}

fn normalized_visual_document_path(relative_path: &str) -> Result<String, String> {
    let path = validate_visual_document_path(relative_path)?;
    Ok(path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

fn parse_scene_document(
    content: &str,
    expected_scene_id: &str,
) -> Result<serde_json::Value, String> {
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("invalid scene JSON: {}", e))?;
    if value.get("schemaVersion").and_then(|v| v.as_str()) != Some(SCENE_DOCUMENT_SCHEMA_VERSION) {
        return Err("unsupported scene document schema version".to_string());
    }
    if value.get("sceneId").and_then(|v| v.as_str()) != Some(expected_scene_id) {
        return Err(format!(
            "scene id does not match manifest: {}",
            expected_scene_id
        ));
    }
    if !value.get("rootEntityIds").is_some_and(|v| v.is_array())
        || !value.get("entities").is_some_and(|v| v.is_object())
    {
        return Err("scene document requires rootEntityIds and entities".to_string());
    }
    Ok(value)
}

fn parse_asset_manifest_document(
    content: &str,
    reserved_document_paths: &HashSet<String>,
) -> Result<ValidatedAssetManifest, String> {
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("invalid asset manifest JSON: {}", e))?;
    if value.get("schemaVersion").and_then(|v| v.as_str()) != Some(ASSET_MANIFEST_SCHEMA_VERSION) {
        return Err("unsupported asset manifest schema version".to_string());
    }
    let assets = value
        .get("assets")
        .and_then(|candidate| candidate.as_object())
        .ok_or_else(|| "asset manifest requires an assets record".to_string())?;

    let mut asset_kinds = HashMap::new();
    let mut project_source_paths = HashMap::<String, Vec<String>>::new();
    let mut prefab_assets = Vec::new();
    let mut prefab_paths = HashSet::new();
    for (asset_id, candidate) in assets {
        let asset = candidate
            .as_object()
            .ok_or_else(|| format!("asset must be an object: {}", asset_id))?;
        if asset.get("id").and_then(|entry| entry.as_str()) != Some(asset_id.as_str()) {
            return Err(format!(
                "asset id does not match manifest key: {}",
                asset_id
            ));
        }
        let kind = asset
            .get("kind")
            .and_then(|entry| entry.as_str())
            .ok_or_else(|| format!("asset kind is required: {}", asset_id))?;
        asset_kinds.insert(asset_id.clone(), kind.to_string());

        if let Some(source) = asset.get("source").and_then(|entry| entry.as_object()) {
            if source.get("kind").and_then(|entry| entry.as_str()) == Some("project") {
                if let Some(relative_path) =
                    source.get("relativePath").and_then(|entry| entry.as_str())
                {
                    let normalized = normalized_visual_document_path(relative_path)?;
                    if normalized != relative_path {
                        return Err(format!(
                            "asset source path must be normalized: {}",
                            asset_id
                        ));
                    }
                    project_source_paths
                        .entry(normalized)
                        .or_default()
                        .push(asset_id.clone());
                }
            }
        }

        let is_prefab = asset.get("templateType").and_then(|entry| entry.as_str())
            == Some("prefab")
            || asset.contains_key("prefabPath");
        if !is_prefab {
            continue;
        }
        if kind != "template" {
            return Err(format!("Prefab asset kind must be template: {}", asset_id));
        }
        let prefab_path = asset
            .get("prefabPath")
            .and_then(|entry| entry.as_str())
            .ok_or_else(|| format!("Prefab asset requires prefabPath: {}", asset_id))?;
        let normalized = normalized_prefab_document_path(prefab_path)?;
        if normalized != prefab_path {
            return Err(format!("Prefab path must be normalized: {}", asset_id));
        }
        if asset.get("templatePath").and_then(|entry| entry.as_str()) != Some(prefab_path) {
            return Err(format!(
                "Prefab templatePath must match prefabPath: {}",
                asset_id
            ));
        }
        let source = asset
            .get("source")
            .and_then(|entry| entry.as_object())
            .ok_or_else(|| format!("Prefab source is required: {}", asset_id))?;
        if source.get("kind").and_then(|entry| entry.as_str()) != Some("project")
            || source.get("relativePath").and_then(|entry| entry.as_str()) != Some(prefab_path)
        {
            return Err(format!(
                "Prefab source path must match prefabPath: {}",
                asset_id
            ));
        }
        if reserved_document_paths.contains(&normalized) || !prefab_paths.insert(normalized.clone())
        {
            return Err(format!("Prefab document path collision: {}", normalized));
        }
        prefab_assets.push(PrefabAssetDeclaration {
            asset_id: asset_id.clone(),
            relative_path: normalized,
        });
    }

    for prefab in &prefab_assets {
        if project_source_paths
            .get(&prefab.relative_path)
            .is_some_and(|asset_ids| asset_ids.len() != 1 || asset_ids[0] != prefab.asset_id)
        {
            return Err(format!(
                "Prefab path is also used by another manifest asset: {}",
                prefab.relative_path
            ));
        }
    }
    prefab_assets.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(ValidatedAssetManifest {
        asset_kinds,
        prefab_assets,
    })
}

fn normalized_prefab_document_path(relative_path: &str) -> Result<String, String> {
    let normalized = normalized_visual_document_path(relative_path)?;
    let path = Path::new(&normalized);
    if !normalized.starts_with("prefabs/")
        || !normalized.ends_with(".prefab.json")
        || path.components().count() < 2
    {
        return Err("Prefab documents must be stored under prefabs/**.prefab.json".to_string());
    }
    Ok(normalized)
}

fn prefab_id_from_path(relative_path: &str) -> Result<String, String> {
    Path::new(relative_path)
        .file_name()
        .and_then(|value| value.to_str())
        .and_then(|value| value.strip_suffix(".prefab.json"))
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| "Prefab path does not contain a valid prefab id".to_string())
}

fn validate_prefab_document(
    content: &str,
    relative_path: &str,
    scenes_by_id: &HashMap<String, serde_json::Value>,
    asset_manifest: &ValidatedAssetManifest,
) -> Result<ValidatedPrefabDocument, String> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("invalid Prefab JSON at {}: {}", relative_path, e))?;
    if value.get("schemaVersion").and_then(|entry| entry.as_str())
        != Some(PREFAB_DOCUMENT_SCHEMA_VERSION)
    {
        return Err(format!(
            "unsupported Prefab document schema version: {}",
            relative_path
        ));
    }
    let prefab_id = value
        .get("prefabId")
        .and_then(|entry| entry.as_str())
        .filter(|entry| !entry.trim().is_empty())
        .ok_or_else(|| format!("Prefab id is required: {}", relative_path))?
        .to_string();
    if prefab_id_from_path(relative_path)? != prefab_id {
        return Err(format!(
            "Prefab id must match its filename: {}",
            relative_path
        ));
    }
    if !value
        .get("name")
        .and_then(|entry| entry.as_str())
        .is_some_and(|entry| !entry.trim().is_empty())
    {
        return Err(format!("Prefab name is required: {}", relative_path));
    }

    let source = value
        .get("source")
        .and_then(|entry| entry.as_object())
        .ok_or_else(|| format!("Prefab source is required: {}", relative_path))?;
    let source_scene_id = source
        .get("sceneId")
        .and_then(|entry| entry.as_str())
        .filter(|entry| !entry.trim().is_empty())
        .ok_or_else(|| format!("Prefab source scene is required: {}", relative_path))?;
    let source_scene = scenes_by_id
        .get(source_scene_id)
        .ok_or_else(|| format!("Prefab source scene is missing: {}", source_scene_id))?;
    let source_entities = source_scene
        .get("entities")
        .and_then(|entry| entry.as_object())
        .ok_or_else(|| {
            format!(
                "Prefab source scene entities are invalid: {}",
                source_scene_id
            )
        })?;
    let source_root_ids = source
        .get("rootEntityIds")
        .and_then(|entry| entry.as_array())
        .ok_or_else(|| {
            format!(
                "Prefab source rootEntityIds are required: {}",
                relative_path
            )
        })?;
    if source_root_ids.is_empty() {
        return Err(format!(
            "Prefab source must contain a root entity: {}",
            relative_path
        ));
    }
    let mut unique_source_roots = HashSet::new();
    for source_root_id in source_root_ids {
        let source_root_id = source_root_id
            .as_str()
            .ok_or_else(|| format!("Prefab source entity id is invalid: {}", relative_path))?;
        if !unique_source_roots.insert(source_root_id) {
            return Err(format!(
                "duplicate Prefab source entity id: {}",
                source_root_id
            ));
        }
        if !source_entities.contains_key(source_root_id) {
            return Err(format!(
                "Prefab source entity is missing: {}",
                source_root_id
            ));
        }
    }

    let entities = value
        .get("entities")
        .and_then(|entry| entry.as_object())
        .ok_or_else(|| format!("Prefab entities are required: {}", relative_path))?;
    let root_ids = value
        .get("rootEntityIds")
        .and_then(|entry| entry.as_array())
        .ok_or_else(|| format!("Prefab rootEntityIds are required: {}", relative_path))?;
    if root_ids.is_empty() || entities.is_empty() {
        return Err(format!(
            "Prefab must contain at least one entity: {}",
            relative_path
        ));
    }
    let entity_ids: HashSet<String> = entities.keys().cloned().collect();
    let mut unique_roots = HashSet::new();
    for root_id in root_ids {
        let root_id = root_id
            .as_str()
            .ok_or_else(|| format!("Prefab root entity id is invalid: {}", relative_path))?;
        if !unique_roots.insert(root_id) {
            return Err(format!("duplicate Prefab root entity id: {}", root_id));
        }
        if !entities.contains_key(root_id) {
            return Err(format!("Prefab root entity is missing: {}", root_id));
        }
    }

    let mut component_ids = HashSet::new();
    let mut prefab_instance_references = Vec::new();
    for (entity_id, candidate) in entities {
        let entity = candidate
            .as_object()
            .ok_or_else(|| format!("Prefab entity must be an object: {}", entity_id))?;
        if entity.get("id").and_then(|entry| entry.as_str()) != Some(entity_id.as_str()) {
            return Err(format!(
                "Prefab entity id does not match record key: {}",
                entity_id
            ));
        }
        match entity.get("parentId") {
            Some(serde_json::Value::Null) if unique_roots.contains(entity_id.as_str()) => {}
            Some(serde_json::Value::String(parent_id))
                if !unique_roots.contains(entity_id.as_str())
                    && entities.contains_key(parent_id) =>
            {
                let parent_has_child = entities
                    .get(parent_id)
                    .and_then(|entry| entry.get("children"))
                    .and_then(|entry| entry.as_array())
                    .is_some_and(|children| {
                        children
                            .iter()
                            .any(|entry| entry.as_str() == Some(entity_id))
                    });
                if !parent_has_child {
                    return Err(format!("Prefab parent child mismatch: {}", entity_id));
                }
            }
            Some(serde_json::Value::Null) | None => {
                return Err(format!(
                    "non-root Prefab entity has no parent: {}",
                    entity_id
                ))
            }
            _ => return Err(format!("Prefab entity parent is missing: {}", entity_id)),
        }
        let children = entity
            .get("children")
            .and_then(|entry| entry.as_array())
            .ok_or_else(|| format!("Prefab entity children are required: {}", entity_id))?;
        let mut unique_children = HashSet::new();
        for child_id in children {
            let child_id = child_id
                .as_str()
                .ok_or_else(|| format!("Prefab child entity id is invalid: {}", entity_id))?;
            if child_id == entity_id || !unique_children.insert(child_id) {
                return Err(format!("duplicate or self Prefab child: {}", child_id));
            }
            let child = entities
                .get(child_id)
                .and_then(|entry| entry.as_object())
                .ok_or_else(|| format!("Prefab child entity is missing: {}", child_id))?;
            if child.get("parentId").and_then(|entry| entry.as_str()) != Some(entity_id.as_str()) {
                return Err(format!("Prefab child parent mismatch: {}", child_id));
            }
        }

        let components = entity
            .get("components")
            .and_then(|entry| entry.as_array())
            .ok_or_else(|| format!("Prefab entity components are required: {}", entity_id))?;
        for component in components {
            let component = component
                .as_object()
                .ok_or_else(|| format!("Prefab component must be an object: {}", entity_id))?;
            let component_id = component
                .get("id")
                .and_then(|entry| entry.as_str())
                .filter(|entry| !entry.trim().is_empty())
                .ok_or_else(|| format!("Prefab component id is required: {}", entity_id))?;
            if !component_ids.insert(component_id) {
                return Err(format!("duplicate Prefab component id: {}", component_id));
            }
            match component.get("type").and_then(|entry| entry.as_str()) {
                Some("mesh") => {
                    if let Some(asset_id) = component
                        .get("geometry")
                        .and_then(|entry| entry.as_object())
                        .filter(|geometry| {
                            geometry.get("kind").and_then(|entry| entry.as_str()) == Some("asset")
                        })
                        .and_then(|geometry| geometry.get("assetId"))
                        .and_then(|entry| entry.as_str())
                    {
                        require_manifest_asset(asset_manifest, asset_id, &["model", "primitive"])?;
                    }
                    if let Some(bindings) = component
                        .get("materialBindings")
                        .and_then(|entry| entry.as_array())
                    {
                        for binding in bindings {
                            let asset_id = binding
                                .get("materialAssetId")
                                .and_then(|entry| entry.as_str())
                                .ok_or_else(|| {
                                    format!("Prefab material binding is invalid: {}", component_id)
                                })?;
                            require_manifest_asset(asset_manifest, asset_id, &["material"])?;
                        }
                    }
                }
                Some("particle-emitter") => {
                    let asset_id = component
                        .get("particleAssetId")
                        .and_then(|entry| entry.as_str())
                        .ok_or_else(|| {
                            format!("Prefab particle reference is invalid: {}", component_id)
                        })?;
                    require_manifest_asset(asset_manifest, asset_id, &["particle"])?;
                }
                Some("prefab-instance") => {
                    let asset_id = component
                        .get("prefabAssetId")
                        .and_then(|entry| entry.as_str())
                        .ok_or_else(|| {
                            format!("Prefab instance reference is invalid: {}", component_id)
                        })?;
                    require_manifest_asset(asset_manifest, asset_id, &["template"])?;
                    let source_entity_id = component
                        .get("sourceEntityId")
                        .and_then(|entry| entry.as_str())
                        .filter(|entry| !entry.trim().is_empty())
                        .ok_or_else(|| {
                            format!("Prefab instance source is invalid: {}", component_id)
                        })?;
                    prefab_instance_references
                        .push((asset_id.to_string(), source_entity_id.to_string()));
                }
                Some("xrift-component") => {
                    if let Some(references) = component
                        .get("assetReferences")
                        .and_then(|entry| entry.as_array())
                    {
                        for asset_id in references {
                            let asset_id = asset_id.as_str().ok_or_else(|| {
                                format!("XRift Prefab asset reference is invalid: {}", component_id)
                            })?;
                            require_manifest_asset(asset_manifest, asset_id, &[])?;
                        }
                    }
                    if let Some(references) = component
                        .get("entityReferences")
                        .and_then(|entry| entry.as_array())
                    {
                        for entity_reference in references {
                            let entity_reference = entity_reference.as_str().ok_or_else(|| {
                                format!(
                                    "XRift Prefab entity reference is invalid: {}",
                                    component_id
                                )
                            })?;
                            if !entity_ids.contains(entity_reference) {
                                return Err(format!(
                                    "XRift Prefab entity reference is missing: {}",
                                    entity_reference
                                ));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let mut pending: Vec<String> = unique_roots.into_iter().map(str::to_string).collect();
    let mut reachable = HashSet::new();
    while let Some(entity_id) = pending.pop() {
        if !reachable.insert(entity_id.clone()) {
            return Err(format!("Prefab hierarchy contains a cycle: {}", entity_id));
        }
        if let Some(children) = entities
            .get(&entity_id)
            .and_then(|entry| entry.get("children"))
            .and_then(|entry| entry.as_array())
        {
            pending.extend(
                children
                    .iter()
                    .filter_map(|entry| entry.as_str().map(str::to_string)),
            );
        }
    }
    if reachable.len() != entities.len() {
        return Err(format!(
            "Prefab contains unreachable entities: {}",
            relative_path
        ));
    }

    Ok(ValidatedPrefabDocument {
        relative_path: relative_path.to_string(),
        prefab_id,
        entity_ids,
        prefab_instance_references,
    })
}

fn require_manifest_asset(
    manifest: &ValidatedAssetManifest,
    asset_id: &str,
    expected_kinds: &[&str],
) -> Result<(), String> {
    let kind = manifest
        .asset_kinds
        .get(asset_id)
        .ok_or_else(|| format!("Prefab references a missing asset: {}", asset_id))?;
    if !expected_kinds.is_empty() && !expected_kinds.contains(&kind.as_str()) {
        return Err(format!(
            "Prefab asset reference has the wrong kind: {}",
            asset_id
        ));
    }
    Ok(())
}

fn validate_prefab_instance_references(
    documents: &[ValidatedPrefabDocument],
    prefab_assets: &[PrefabAssetDeclaration],
) -> Result<(), String> {
    let documents_by_path: HashMap<_, _> = documents
        .iter()
        .map(|document| (document.relative_path.as_str(), document))
        .collect();
    let assets_by_id: HashMap<_, _> = prefab_assets
        .iter()
        .map(|asset| (asset.asset_id.as_str(), asset.relative_path.as_str()))
        .collect();
    let mut dependencies = HashMap::<String, Vec<String>>::new();
    for document in documents {
        for (asset_id, source_entity_id) in &document.prefab_instance_references {
            let target_path = assets_by_id.get(asset_id.as_str()).ok_or_else(|| {
                format!(
                    "Prefab instance does not reference a Prefab asset: {}",
                    asset_id
                )
            })?;
            let target = documents_by_path
                .get(target_path)
                .ok_or_else(|| format!("Prefab instance document is missing: {}", target_path))?;
            if !target.entity_ids.contains(source_entity_id) {
                return Err(format!(
                    "Prefab instance source entity is missing: {}/{}",
                    asset_id, source_entity_id
                ));
            }
            dependencies
                .entry(document.relative_path.clone())
                .or_default()
                .push((*target_path).to_string());
        }
    }
    fn visit_prefab_dependency(
        relative_path: &str,
        dependencies: &HashMap<String, Vec<String>>,
        visiting: &mut HashSet<String>,
        visited: &mut HashSet<String>,
    ) -> Result<(), String> {
        if visited.contains(relative_path) {
            return Ok(());
        }
        if !visiting.insert(relative_path.to_string()) {
            return Err(format!(
                "Prefab dependency cycle detected: {}",
                relative_path
            ));
        }
        if let Some(targets) = dependencies.get(relative_path) {
            for target in targets {
                visit_prefab_dependency(target, dependencies, visiting, visited)?;
            }
        }
        visiting.remove(relative_path);
        visited.insert(relative_path.to_string());
        Ok(())
    }
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    for document in documents {
        visit_prefab_dependency(
            &document.relative_path,
            &dependencies,
            &mut visiting,
            &mut visited,
        )?;
    }
    Ok(())
}

fn validate_visual_write_request(
    request: VisualProjectWriteRequest,
) -> Result<ValidatedVisualWrite, String> {
    let VisualProjectWriteRequest {
        project_json,
        scene_documents,
        prefab_documents,
        asset_manifest_json,
        binary_documents,
    } = request;
    let manifest = parse_visual_project_manifest(&project_json)?;
    let mut reserved_document_paths: HashSet<String> =
        manifest.scene_paths.values().cloned().collect();
    reserved_document_paths.insert(manifest.asset_manifest_path.clone());
    reserved_document_paths.insert(VISUAL_PROJECT_MANIFEST.to_string());
    let asset_manifest =
        parse_asset_manifest_document(&asset_manifest_json, &reserved_document_paths)?;

    let mut scenes_by_path = HashMap::new();
    for scene in scene_documents {
        let normalized = normalized_visual_document_path(&scene.relative_path)?;
        if normalized != scene.relative_path {
            return Err(format!(
                "scene document path must be normalized: {}",
                scene.relative_path
            ));
        }
        if scenes_by_path.insert(normalized, scene.content).is_some() {
            return Err("duplicate scene document path".to_string());
        }
    }
    if scenes_by_path.len() != manifest.scene_paths.len() {
        return Err("all manifest scenes must be included exactly once".to_string());
    }

    let mut ordered_scenes: Vec<_> = manifest.scene_paths.iter().collect();
    ordered_scenes.sort_by(|left, right| left.1.cmp(right.1));
    let mut files =
        Vec::with_capacity(manifest.scene_paths.len() + asset_manifest.prefab_assets.len() + 2);
    let mut scenes_by_id = HashMap::new();
    for (scene_id, relative_path) in ordered_scenes {
        let content = scenes_by_path
            .remove(relative_path)
            .ok_or_else(|| format!("scene document is missing: {}", relative_path))?;
        let parsed = parse_scene_document(&content, scene_id)?;
        scenes_by_id.insert(scene_id.clone(), parsed);
        files.push((relative_path.clone(), content));
    }
    if !scenes_by_path.is_empty() {
        return Err("request contains scenes not declared by the manifest".to_string());
    }
    let mut prefabs_by_path = HashMap::new();
    for prefab in prefab_documents {
        let normalized = normalized_prefab_document_path(&prefab.relative_path)?;
        if normalized != prefab.relative_path {
            return Err(format!(
                "Prefab document path must be normalized: {}",
                prefab.relative_path
            ));
        }
        if prefabs_by_path.insert(normalized, prefab.content).is_some() {
            return Err("duplicate Prefab document path".to_string());
        }
    }
    if prefabs_by_path.len() != asset_manifest.prefab_assets.len() {
        return Err("all manifest Prefabs must be included exactly once".to_string());
    }
    let mut validated_prefabs = Vec::with_capacity(asset_manifest.prefab_assets.len());
    let mut prefab_ids = HashSet::new();
    for prefab_asset in &asset_manifest.prefab_assets {
        let content = prefabs_by_path
            .remove(&prefab_asset.relative_path)
            .ok_or_else(|| format!("Prefab document is missing: {}", prefab_asset.relative_path))?;
        let validated = validate_prefab_document(
            &content,
            &prefab_asset.relative_path,
            &scenes_by_id,
            &asset_manifest,
        )?;
        if !prefab_ids.insert(validated.prefab_id.clone()) {
            return Err(format!("duplicate Prefab id: {}", validated.prefab_id));
        }
        files.push((prefab_asset.relative_path.clone(), content));
        validated_prefabs.push(validated);
    }
    if !prefabs_by_path.is_empty() {
        return Err("request contains Prefabs not declared by the asset manifest".to_string());
    }
    validate_prefab_instance_references(&validated_prefabs, &asset_manifest.prefab_assets)?;
    files.push((manifest.asset_manifest_path.clone(), asset_manifest_json));

    let mut occupied_paths: HashSet<String> = files
        .iter()
        .map(|(relative_path, _)| relative_path.clone())
        .collect();
    occupied_paths.insert(VISUAL_PROJECT_MANIFEST.to_string());
    let mut binary_files = Vec::with_capacity(binary_documents.len());
    let mut total_binary_bytes = 0usize;
    for binary in binary_documents {
        let normalized = normalized_visual_document_path(&binary.relative_path)?;
        if normalized != binary.relative_path {
            return Err(format!(
                "starter asset path must be normalized: {}",
                binary.relative_path
            ));
        }
        if !normalized.starts_with("assets/starter/") {
            return Err("starter assets must be stored under assets/starter".to_string());
        }
        if !occupied_paths.insert(normalized.clone()) {
            return Err(format!("starter asset path collision: {}", normalized));
        }
        let bytes = decode_starter_asset_data_url(&binary.data_url, &normalized)?;
        total_binary_bytes = total_binary_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| "starter asset size overflow".to_string())?;
        if total_binary_bytes > 32 * 1024 * 1024 {
            return Err("starter assets exceed the 32 MB creation limit".to_string());
        }
        binary_files.push((normalized, bytes));
    }
    binary_files.sort_by(|left, right| left.0.cmp(&right.0));

    // Commit the project manifest last so readers never discover references to
    // scene/asset documents that have not been installed yet.
    files.push((VISUAL_PROJECT_MANIFEST.to_string(), project_json));
    Ok(ValidatedVisualWrite {
        manifest,
        files,
        binary_files,
    })
}

fn decode_starter_asset_data_url(data_url: &str, relative_path: &str) -> Result<Vec<u8>, String> {
    let (media_type, encoded) = data_url
        .strip_prefix("data:")
        .and_then(|value| value.split_once(";base64,"))
        .ok_or_else(|| "starter asset must be a base64 data URL".to_string())?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "starter asset base64 is invalid".to_string())?;
    if bytes.is_empty() || bytes.len() > 16 * 1024 * 1024 {
        return Err("starter asset size must be between 1 byte and 16 MB".to_string());
    }

    if relative_path.ends_with(".glb") && media_type == "model/gltf-binary" {
        if bytes.len() < 12 || !bytes.starts_with(b"glTF") {
            return Err("starter asset is not a GLB file".to_string());
        }
        let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap_or_default());
        let declared_length = u32::from_le_bytes(bytes[8..12].try_into().unwrap_or_default());
        if version != 2 || declared_length as usize != bytes.len() {
            return Err("starter asset must be a complete glTF 2.0 GLB".to_string());
        }
        return Ok(bytes);
    }

    if relative_path.ends_with(".png") && media_type == "image/png" {
        const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
        if bytes.len() < 24 || !bytes.starts_with(PNG_SIGNATURE) || &bytes[12..16] != b"IHDR" {
            return Err("starter Texture is not a complete PNG file".to_string());
        }
        let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap_or_default());
        let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap_or_default());
        if width == 0 || height == 0 || width > 4096 || height > 4096 {
            return Err("starter Texture dimensions must be between 1 and 4096".to_string());
        }
        return Ok(bytes);
    }

    Err("starter asset media type does not match its file extension".to_string())
}

fn project_from_visual_manifest(path: &Path, manifest: &VisualProjectManifest) -> Project {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&manifest.metadata.name)
        .to_string();
    Project {
        name,
        path: path.to_string_lossy().to_string(),
        kind: manifest.project_kind.clone(),
        format: "visual".to_string(),
        title: Some(manifest.metadata.title.clone()),
        description: if manifest.metadata.description.trim().is_empty() {
            None
        } else {
            Some(manifest.metadata.description.clone())
        },
    }
}

#[tauri::command]
fn create_visual_project(
    root: String,
    directory_name: String,
    request: VisualProjectWriteRequest,
) -> Result<Project, String> {
    let _guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;
    let validated = validate_visual_write_request(request)?;

    std::fs::create_dir_all(&root).map_err(|e| format!("project root cannot be created: {}", e))?;
    let root_path = PathBuf::from(&root)
        .canonicalize()
        .map_err(|e| format!("project root cannot be resolved: {}", e))?;
    let directory_name = validate_project_directory_name(&directory_name)?;
    let destination = root_path.join(&directory_name);
    if destination.exists() {
        return Err("project directory already exists".to_string());
    }

    let transaction_id = transaction_id();
    let temporary = root_path.join(format!(".xrift-studio-create-{}", transaction_id));
    if temporary.exists() {
        return Err("temporary project directory already exists".to_string());
    }
    std::fs::create_dir(&temporary).map_err(|e| e.to_string())?;

    let result = (|| {
        for (relative_path, bytes) in &validated.binary_files {
            write_project_binary(&temporary, relative_path, bytes)?;
        }
        for (relative_path, content) in &validated.files {
            write_project_document(&temporary, relative_path, content)?;
        }
        std::fs::rename(&temporary, &destination)
            .map_err(|e| format!("visual project cannot be finalized: {}", e))?;
        Ok(project_from_visual_manifest(
            &destination,
            &validated.manifest,
        ))
    })();

    if result.is_err() && temporary.exists() {
        let _ = std::fs::remove_dir_all(&temporary);
    }
    result
}

#[tauri::command]
fn save_visual_project(
    project_path: String,
    request: VisualProjectWriteRequest,
) -> Result<(), String> {
    let _guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;
    let project_root = canonical_project_root(&project_path)?;
    recover_visual_save_transactions(&project_root)?;
    let validated = validate_visual_write_request(request)?;
    if !validated.binary_files.is_empty() {
        return Err(
            "binary starter assets can only be written during project creation".to_string(),
        );
    }

    let existing_manifest_path = project_root.join(VISUAL_PROJECT_MANIFEST);
    let existing_manifest_content = std::fs::read_to_string(&existing_manifest_path)
        .map_err(|_| "existing visual project manifest is missing".to_string())?;
    let existing_manifest = parse_visual_project_manifest(&existing_manifest_content)?;
    if existing_manifest.project_id != validated.manifest.project_id {
        return Err("visual project id cannot change during save".to_string());
    }

    save_visual_documents_transaction(&project_root, &validated.files)
}

#[tauri::command]
fn read_visual_project(project_path: String) -> Result<VisualProjectFiles, String> {
    let _guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;
    let project_root = canonical_project_root(&project_path)?;
    recover_visual_save_transactions(&project_root)?;

    let project_json = std::fs::read_to_string(project_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&project_json)?;
    let mut scene_entries: Vec<_> = manifest.scene_paths.iter().collect();
    scene_entries.sort_by(|left, right| left.1.cmp(right.1));
    let mut scene_documents = Vec::with_capacity(scene_entries.len());
    let mut scenes_by_id = HashMap::new();
    for (scene_id, relative_path) in scene_entries {
        let path = safe_join_path(&project_root, relative_path)?;
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("scene document cannot be read: {}", e))?;
        let parsed = parse_scene_document(&content, scene_id)?;
        scenes_by_id.insert(scene_id.clone(), parsed);
        scene_documents.push(VisualDocumentFile {
            relative_path: relative_path.clone(),
            content,
        });
    }
    let asset_path = safe_join_path(&project_root, &manifest.asset_manifest_path)?;
    let asset_manifest_json = std::fs::read_to_string(asset_path)
        .map_err(|e| format!("asset manifest cannot be read: {}", e))?;
    let mut reserved_document_paths: HashSet<String> =
        manifest.scene_paths.values().cloned().collect();
    reserved_document_paths.insert(manifest.asset_manifest_path.clone());
    reserved_document_paths.insert(VISUAL_PROJECT_MANIFEST.to_string());
    let asset_manifest =
        parse_asset_manifest_document(&asset_manifest_json, &reserved_document_paths)?;

    let mut prefab_documents = Vec::with_capacity(asset_manifest.prefab_assets.len());
    let mut validated_prefabs = Vec::with_capacity(asset_manifest.prefab_assets.len());
    let mut prefab_ids = HashSet::new();
    for prefab_asset in &asset_manifest.prefab_assets {
        let path = safe_join_path(&project_root, &prefab_asset.relative_path)?;
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Prefab document cannot be read: {}", e))?;
        let validated = validate_prefab_document(
            &content,
            &prefab_asset.relative_path,
            &scenes_by_id,
            &asset_manifest,
        )?;
        if !prefab_ids.insert(validated.prefab_id.clone()) {
            return Err(format!("duplicate Prefab id: {}", validated.prefab_id));
        }
        validated_prefabs.push(validated);
        prefab_documents.push(VisualDocumentFile {
            relative_path: prefab_asset.relative_path.clone(),
            content,
        });
    }
    validate_prefab_instance_references(&validated_prefabs, &asset_manifest.prefab_assets)?;

    Ok(VisualProjectFiles {
        project_json,
        scene_documents,
        prefab_documents,
        asset_manifest_json,
    })
}

fn validate_project_directory_name(value: &str) -> Result<String, String> {
    let path = validate_relative_path(value, false)?;
    if path.components().count() != 1 {
        return Err("project directory name must be one path segment".to_string());
    }
    let name = path.to_string_lossy().to_string();
    if name == ".cache" || name.starts_with(".xrift-studio-create-") {
        return Err("reserved project directory name".to_string());
    }
    Ok(name)
}

fn safe_join_path(project_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = validate_visual_document_path(relative_path)?;
    ensure_no_symlink_ancestors(project_root, &relative)?;
    Ok(project_root.join(relative))
}

fn write_project_document(
    project_root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<(), String> {
    let path = safe_join_path(project_root, relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    write_file_synced(&path, content.as_bytes())
}

fn write_project_binary(
    project_root: &Path,
    relative_path: &str,
    content: &[u8],
) -> Result<(), String> {
    let path = safe_join_path(project_root, relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    write_file_synced(&path, content)
}

fn write_file_synced(path: &Path, content: &[u8]) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(content).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

fn transaction_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

fn save_visual_documents_transaction(
    project_root: &Path,
    files: &[(String, String)],
) -> Result<(), String> {
    let transaction_root = project_root.join(VISUAL_SAVE_CACHE).join(transaction_id());
    let staged_root = transaction_root.join("staged");
    let backup_root = transaction_root.join("backup");
    if let Err(error) = std::fs::create_dir_all(&staged_root) {
        let _ = std::fs::remove_dir_all(&transaction_root);
        return Err(error.to_string());
    }
    if let Err(error) = std::fs::create_dir_all(&backup_root) {
        let _ = std::fs::remove_dir_all(&transaction_root);
        return Err(error.to_string());
    }
    if let Err(error) = write_file_synced(
        &transaction_root.join("owner"),
        VISUAL_SAVE_OWNER.as_bytes(),
    ) {
        let _ = std::fs::remove_dir_all(&transaction_root);
        return Err(error);
    }

    let prepare_result = (|| {
        let mut entries = Vec::with_capacity(files.len());
        for (index, (relative_path, content)) in files.iter().enumerate() {
            let target = safe_join_path(project_root, relative_path)?;
            if target.exists() {
                let metadata = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(format!(
                        "visual document target is not a regular file: {}",
                        relative_path
                    ));
                }
            }
            let staged_name = format!("{}.json", index);
            let backup_name = format!("{}.json", index);
            write_file_synced(&staged_root.join(&staged_name), content.as_bytes())?;
            entries.push(VisualSaveJournalEntry {
                relative_path: relative_path.clone(),
                original_existed: target.exists(),
                backup_name,
                staged_name,
            });
        }
        Ok(entries)
    })();
    let entries = match prepare_result {
        Ok(entries) => entries,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(error);
        }
    };

    let journal = VisualSaveJournal {
        phase: "prepared".to_string(),
        entries,
    };
    let journal_json = match serde_json::to_vec_pretty(&journal) {
        Ok(content) => content,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(error.to_string());
        }
    };
    if let Err(error) = write_file_synced(&transaction_root.join("journal.json"), &journal_json) {
        let _ = std::fs::remove_dir_all(&transaction_root);
        return Err(error);
    }

    let commit_result = (|| {
        for entry in &journal.entries {
            let target = safe_join_path(project_root, &entry.relative_path)?;
            let staged = staged_root.join(&entry.staged_name);
            let backup = backup_root.join(&entry.backup_name);
            if entry.original_existed {
                std::fs::rename(&target, &backup)
                    .map_err(|e| format!("existing visual document cannot be journaled: {}", e))?;
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&staged, &target)
                .map_err(|e| format!("staged visual document cannot be committed: {}", e))?;
        }
        write_file_synced(&transaction_root.join("committed"), b"committed")
    })();

    if let Err(commit_error) = commit_result {
        return match rollback_visual_save_transaction(project_root, &transaction_root, &journal) {
            Ok(()) => {
                let _ = std::fs::remove_dir_all(&transaction_root);
                Err(commit_error)
            }
            Err(rollback_error) => Err(format!(
                "{}; rollback is incomplete: {}",
                commit_error, rollback_error
            )),
        };
    }

    std::fs::remove_dir_all(&transaction_root)
        .map_err(|e| format!("committed save journal cannot be cleaned up: {}", e))?;
    Ok(())
}

fn recover_visual_save_transactions(project_root: &Path) -> Result<(), String> {
    let journal_root = project_root.join(VISUAL_SAVE_CACHE);
    if !journal_root.exists() {
        return Ok(());
    }
    let entries = std::fs::read_dir(&journal_root)
        .map_err(|e| format!("save journal cannot be inspected: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let transaction_root = entry.path();
        if std::fs::read_to_string(transaction_root.join("owner"))
            .ok()
            .as_deref()
            != Some(VISUAL_SAVE_OWNER)
        {
            // Never mutate an unknown directory, even below the app cache path.
            continue;
        }
        let journal_path = transaction_root.join("journal.json");
        if !journal_path.exists() {
            // The journal is written before any project document is moved, so
            // a transaction without it only contains disposable staged files.
            std::fs::remove_dir_all(&transaction_root)
                .map_err(|e| format!("orphaned save staging cannot be cleaned up: {}", e))?;
            continue;
        }
        if transaction_root.join("committed").exists() {
            std::fs::remove_dir_all(&transaction_root)
                .map_err(|e| format!("committed save journal cannot be cleaned up: {}", e))?;
            continue;
        }
        let journal_content = std::fs::read_to_string(&journal_path)
            .map_err(|e| format!("save journal cannot be read: {}", e))?;
        let journal: VisualSaveJournal = serde_json::from_str(&journal_content)
            .map_err(|e| format!("save journal is invalid: {}", e))?;
        if journal.phase != "prepared" {
            return Err("save journal has an unsupported phase".to_string());
        }
        rollback_visual_save_transaction(project_root, &transaction_root, &journal)?;
        std::fs::remove_dir_all(&transaction_root)
            .map_err(|e| format!("recovered save journal cannot be cleaned up: {}", e))?;
    }
    Ok(())
}

fn rollback_visual_save_transaction(
    project_root: &Path,
    transaction_root: &Path,
    journal: &VisualSaveJournal,
) -> Result<(), String> {
    let staged_root = transaction_root.join("staged");
    let backup_root = transaction_root.join("backup");
    for entry in journal.entries.iter().rev() {
        validate_journal_file_name(&entry.staged_name)?;
        validate_journal_file_name(&entry.backup_name)?;
        let target = safe_join_path(project_root, &entry.relative_path)?;
        let staged = staged_root.join(&entry.staged_name);
        let backup = backup_root.join(&entry.backup_name);

        if backup.exists() {
            if target.exists() {
                let metadata = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(format!(
                        "rollback target is not a regular file: {}",
                        entry.relative_path
                    ));
                }
                std::fs::remove_file(&target).map_err(|e| e.to_string())?;
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&backup, &target)
                .map_err(|e| format!("backup cannot be restored: {}", e))?;
        } else if !entry.original_existed && !staged.exists() && target.exists() {
            let metadata = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(format!(
                    "rollback target is not a regular file: {}",
                    entry.relative_path
                ));
            }
            std::fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn validate_journal_file_name(value: &str) -> Result<(), String> {
    let path = validate_relative_path(value, false)?;
    if path.components().count() != 1 {
        return Err("invalid save journal entry".to_string());
    }
    Ok(())
}

#[tauri::command]
fn read_world_file(project_path: String) -> Result<String, String> {
    let path = safe_join(&project_path, "src/World.tsx")?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_world_file(project_path: String, content: String) -> Result<(), String> {
    let path = safe_join(&project_path, "src/World.tsx")?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn safe_join(project_path: &str, rel: &str) -> Result<PathBuf, String> {
    let base = canonical_project_root(project_path)?;
    let relative = validate_relative_path(rel, false)?;
    ensure_no_symlink_ancestors(&base, &relative)?;
    Ok(base.join(relative))
}

fn canonical_project_root(project_path: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(project_path);
    if !base.is_dir() {
        return Err("project root does not exist".to_string());
    }
    base.canonicalize()
        .map_err(|e| format!("project root cannot be resolved: {}", e))
}

fn validate_relative_path(rel: &str, allow_empty: bool) -> Result<PathBuf, String> {
    let normalized = rel.trim().replace('\\', "/");
    if normalized.is_empty() {
        return if allow_empty {
            Ok(PathBuf::new())
        } else {
            Err("relative path is empty".to_string())
        };
    }
    let bytes = normalized.as_bytes();
    if normalized.starts_with('/')
        || normalized.contains("://")
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
    {
        return Err("absolute paths are not allowed".to_string());
    }

    let mut output = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(value) if !value.is_empty() => output.push(value),
            Component::CurDir | Component::ParentDir => {
                return Err("relative path traversal is not allowed".to_string())
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("absolute paths are not allowed".to_string())
            }
            _ => return Err("invalid relative path".to_string()),
        }
    }
    if output.as_os_str().is_empty() && !allow_empty {
        return Err("relative path is empty".to_string());
    }
    Ok(output)
}

fn ensure_no_symlink_ancestors(base: &Path, relative: &Path) -> Result<(), String> {
    let mut current = base.to_path_buf();
    for component in relative.components() {
        let Component::Normal(segment) = component else {
            return Err("invalid relative path".to_string());
        };
        current.push(segment);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("symbolic links are not allowed in project document paths".to_string())
            }
            Ok(_) => {
                let resolved = current
                    .canonicalize()
                    .map_err(|e| format!("path cannot be resolved: {}", e))?;
                if !resolved.starts_with(base) {
                    return Err("path escapes project root".to_string());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn validate_visual_document_path(rel: &str) -> Result<PathBuf, String> {
    let path = validate_relative_path(rel, false)?;
    if matches!(path.components().next(), Some(Component::Normal(value)) if value == ".cache") {
        return Err("visual project documents cannot be stored in .cache".to_string());
    }
    Ok(path)
}

fn validate_compiler_staging_name(directory_name: &str) -> Result<&str, String> {
    let name = directory_name.trim();
    if name.len() < "xrift-studio-x".len()
        || name.len() > 128
        || !name.starts_with("xrift-studio-")
        || name.contains("..")
        || name.ends_with('.')
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("invalid compiler staging directory name".to_string());
    }
    Ok(name)
}

fn compiler_staging_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_root(app)?.join(COMPILER_STAGING_DIRECTORY);
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("compiler staging root cannot be created: {}", e))?;
    root.canonicalize()
        .map_err(|e| format!("compiler staging root cannot be resolved: {}", e))
}

fn compiler_staging_project(
    app: &AppHandle,
    directory_name: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let name = validate_compiler_staging_name(directory_name)?;
    let root = compiler_staging_root(app)?;
    Ok((root.clone(), root.join(name)))
}

/// Clears only the compiler-owned directory selected by the deterministic
/// staging name. The visual authoring project is never accepted as a target.
#[tauri::command]
fn prepare_compiler_staging(
    app: AppHandle,
    directory_name: String,
) -> Result<CompilerStagingPaths, String> {
    let _guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    if project.exists() {
        let metadata = std::fs::symlink_metadata(&project).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("compiler staging target is not a regular directory".to_string());
        }
        std::fs::remove_dir_all(&project)
            .map_err(|e| format!("old compiler staging cannot be removed: {}", e))?;
    }
    Ok(CompilerStagingPaths {
        root_path: root.to_string_lossy().to_string(),
        project_path: project.to_string_lossy().to_string(),
    })
}

/// Applies compiler output after `xrift create` has produced the template.
/// All source files are copied from the visual project through validated,
/// project-relative paths; arbitrary absolute copy targets are not accepted.
#[tauri::command]
fn apply_compiler_staging(
    app: AppHandle,
    authoring_project_path: String,
    directory_name: String,
    overlay_files: Vec<CompilerOverlayWrite>,
    asset_copies: Vec<CompilerAssetCopy>,
) -> Result<String, String> {
    let _guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    if !project.is_dir() {
        return Err("XRift staging template has not been created".to_string());
    }
    let resolved_project = project
        .canonicalize()
        .map_err(|e| format!("compiler staging project cannot be resolved: {}", e))?;
    if !resolved_project.starts_with(&root) {
        return Err("compiler staging project escapes the app-owned root".to_string());
    }

    for overlay in overlay_files {
        let target = safe_join(&resolved_project.to_string_lossy(), &overlay.relative_path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        write_file_synced(&target, overlay.content.as_bytes())?;
    }

    for copy in asset_copies {
        let source = safe_join(&authoring_project_path, &copy.source_relative_path)?;
        let metadata = std::fs::symlink_metadata(&source)
            .map_err(|e| format!("compiler source asset cannot be read: {}", e))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "compiler source asset is not a regular file: {}",
                copy.source_relative_path
            ));
        }
        let target = safe_join(
            &resolved_project.to_string_lossy(),
            &copy.target_relative_path,
        )?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::copy(&source, &target)
            .map_err(|e| format!("compiler asset cannot be copied: {}", e))?;
    }

    Ok(resolved_project.to_string_lossy().to_string())
}

fn validate_asset_import_transaction_id(transaction_id: &str) -> Result<&str, String> {
    let id = transaction_id.trim();
    if id.len() < "asset-import-x".len()
        || id.len() > 96
        || !id.starts_with("asset-import-")
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("invalid asset import transaction id".to_string());
    }
    Ok(id)
}

fn validate_asset_import_path(relative_path: &str) -> Result<PathBuf, String> {
    let normalized = relative_path.trim().replace('\\', "/");
    if !normalized.starts_with("assets/imported/")
        && !normalized.starts_with("assets/.derived/thumbnails/")
    {
        return Err("asset import target is outside the managed Asset folders".to_string());
    }
    validate_relative_path(&normalized, false)
}

fn decode_data_url_bytes(data_url: &str) -> Result<Vec<u8>, String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "invalid data URL".to_string())?;
    if !header.starts_with("data:") || !header.ends_with(";base64") {
        return Err("asset payload must be a base64 data URL".to_string());
    }
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("asset payload cannot be decoded: {}", e))
}

/// Publishes imported sources and derived thumbnails as a single operation.
/// Import destinations are content-addressed and may never overwrite a file.
#[tauri::command]
fn commit_visual_asset_import(
    project_path: String,
    transaction_id: String,
    writes: Vec<VisualAssetImportWrite>,
) -> Result<(), String> {
    const MAX_IMPORT_BYTES: usize = 128 * 1024 * 1024;
    const MAX_TRANSACTION_BYTES: usize = 192 * 1024 * 1024;

    let _guard = VISUAL_ASSET_IMPORT_IO_LOCK
        .lock()
        .map_err(|_| "visual Asset import I/O lock is unavailable".to_string())?;
    let transaction_id = validate_asset_import_transaction_id(&transaction_id)?;
    if writes.is_empty() || writes.len() > 8 {
        return Err("asset import transaction has an invalid write count".to_string());
    }

    let project_root = canonical_project_root(&project_path)?;
    let transaction_relative = PathBuf::from(".cache")
        .join("xrift-studio-asset-import")
        .join(transaction_id);
    ensure_no_symlink_ancestors(&project_root, &transaction_relative)?;
    let transaction_root = project_root.join(&transaction_relative);
    if transaction_root.exists() {
        let metadata = std::fs::symlink_metadata(&transaction_root).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("asset import staging is not a regular directory".to_string());
        }
        std::fs::remove_dir_all(&transaction_root).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&transaction_root).map_err(|e| e.to_string())?;

    let mut targets = HashSet::new();
    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::with_capacity(writes.len());
    let mut transaction_bytes = 0usize;
    for (index, write) in writes.into_iter().enumerate() {
        let relative = validate_asset_import_path(&write.relative_path)?;
        let normalized = relative.to_string_lossy().replace('\\', "/");
        if !targets.insert(normalized) {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err("asset import transaction contains duplicate targets".to_string());
        }
        ensure_no_symlink_ancestors(&project_root, &relative)?;
        let target = project_root.join(&relative);
        if target.exists() {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(format!(
                "asset import target already exists: {}",
                write.relative_path
            ));
        }

        let bytes = decode_data_url_bytes(&write.data_url)?;
        if bytes.is_empty() || bytes.len() > MAX_IMPORT_BYTES {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err("asset import payload size is invalid".to_string());
        }
        transaction_bytes = transaction_bytes.saturating_add(bytes.len());
        if transaction_bytes > MAX_TRANSACTION_BYTES {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err("asset import transaction is too large".to_string());
        }
        let staged_path = transaction_root.join(format!("{:02}.asset", index));
        if let Err(error) = write_file_synced(&staged_path, &bytes) {
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(error);
        }
        staged.push((staged_path, target));
    }

    let mut committed = Vec::with_capacity(staged.len());
    for (staged_path, target) in staged {
        let publish = (|| -> Result<(), String> {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&staged_path, &target)
                .map_err(|e| format!("asset import cannot be published: {}", e))?;
            Ok(())
        })();
        if let Err(error) = publish {
            for path in committed {
                let _ = std::fs::remove_file(path);
            }
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(error);
        }
        committed.push(target);
    }

    std::fs::remove_dir_all(&transaction_root).map_err(|e| e.to_string())?;
    Ok(())
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
        Some("glb") => "model/gltf-binary",
        Some("gltf") => "model/gltf+json",
        Some("ktx2") => "image/ktx2",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn read_thumbnail(project_path: String) -> Result<Option<String>, String> {
    let path = safe_join(&project_path, "public/thumbnail.png")?;
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
        canonical_project_root(&project_path)?
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
fn rename_path(project_path: String, old_rel: String, new_rel: String) -> Result<(), String> {
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
fn write_binary_file(project_path: String, rel: String, data_url: String) -> Result<(), String> {
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
    let path = safe_join(&project_path, "public/thumbnail.png")?;
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
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_mcp_bridge::init());

    builder
        .invoke_handler(tauri::generate_handler![
            runtime_paths,
            runtime_status,
            setup_runtime,
            sandbox_env,
            ensure_dir,
            list_projects,
            create_visual_project,
            read_visual_project,
            save_visual_project,
            prepare_compiler_staging,
            apply_compiler_staging,
            commit_visual_asset_import,
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
