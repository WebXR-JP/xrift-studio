use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
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
const VISUAL_PUBLICATION_SAVE_OWNER: &str = "xrift-studio-publication-save-v1";
const COMPILER_STAGING_DIRECTORY: &str = "xrift-studio-staging";
const COMPILER_STAGING_OWNER_PATH: &str = ".xrift-studio/staging-owner.json";
const COMPILER_STAGING_OWNER_SCHEMA_VERSION: &str = "1";
const XRIFT_PUBLICATION_METADATA_MAX_BYTES: u64 = 16 * 1024;
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
    #[serde(default)]
    last_publication: Option<VisualPublicationRecord>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VisualPublicationRecord {
    uploaded_at: String,
    world_id: Option<String>,
    item_id: Option<String>,
    content_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompilerPublicationMetadata {
    id: String,
    created_at: String,
    last_uploaded_at: String,
}

#[derive(Clone, Debug)]
struct LoadedCompilerPublicationMetadata {
    raw: String,
    metadata: CompilerPublicationMetadata,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompilerStagingOwner {
    schema_version: String,
    project_id: String,
    project_kind: String,
    #[serde(default)]
    pre_upload_id: Option<String>,
    #[serde(default)]
    pre_upload_last_uploaded_at: Option<String>,
    #[serde(default)]
    upload_attempt_started_unix_ms: Option<u64>,
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

#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompilerRequiredPublicationFileCopy {
    purpose: String,
    source_relative_path: String,
    target_relative_path: String,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompilerRequiredPublicationFileVerification {
    purpose: String,
    source_relative_path: String,
    target_relative_path: String,
    sha256: String,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompilerStagingResult {
    project_path: String,
    required_publication_files: Vec<CompilerRequiredPublicationFileVerification>,
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

fn is_managed_publication_metadata_path(relative_path: &str) -> Result<bool, String> {
    let relative = validate_relative_path(relative_path, false)?;
    let normalized = relative.to_string_lossy().replace('\\', "/");
    Ok(matches!(
        normalized.to_ascii_lowercase().as_str(),
        ".xrift/world.json" | ".xrift/item.json"
    ))
}

fn safe_join_managed_publication_path(
    project_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    if !is_managed_publication_metadata_path(relative_path)? {
        return Err("invalid managed XRift publication metadata path".to_string());
    }
    let relative = validate_relative_path(relative_path, false)?;
    ensure_no_symlink_ancestors(project_root, &relative)?;
    Ok(project_root.join(relative))
}

fn safe_join_save_transaction_path(
    project_root: &Path,
    relative_path: &str,
    allow_managed_publication_metadata: bool,
) -> Result<PathBuf, String> {
    if allow_managed_publication_metadata && is_managed_publication_metadata_path(relative_path)? {
        safe_join_managed_publication_path(project_root, relative_path)
    } else {
        safe_join_path(project_root, relative_path)
    }
}

fn save_visual_documents_transaction(
    project_root: &Path,
    files: &[(String, String)],
) -> Result<(), String> {
    save_visual_documents_transaction_with_owner(project_root, files, VISUAL_SAVE_OWNER, false)
}

fn save_publication_metadata_transaction(
    project_root: &Path,
    files: &[(String, String)],
) -> Result<(), String> {
    save_visual_documents_transaction_with_owner(
        project_root,
        files,
        VISUAL_PUBLICATION_SAVE_OWNER,
        true,
    )
}

fn save_visual_documents_transaction_with_owner(
    project_root: &Path,
    files: &[(String, String)],
    transaction_owner: &str,
    allow_managed_publication_metadata: bool,
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
        transaction_owner.as_bytes(),
    ) {
        let _ = std::fs::remove_dir_all(&transaction_root);
        return Err(error);
    }

    let prepare_result = (|| {
        let mut entries = Vec::with_capacity(files.len());
        for (index, (relative_path, content)) in files.iter().enumerate() {
            let target = safe_join_save_transaction_path(
                project_root,
                relative_path,
                allow_managed_publication_metadata,
            )?;
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
            let target = safe_join_save_transaction_path(
                project_root,
                &entry.relative_path,
                allow_managed_publication_metadata,
            )?;
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
        return match rollback_visual_save_transaction(
            project_root,
            &transaction_root,
            &journal,
            allow_managed_publication_metadata,
        ) {
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
        let allow_managed_publication_metadata =
            match std::fs::read_to_string(transaction_root.join("owner"))
                .ok()
                .as_deref()
            {
                Some(VISUAL_SAVE_OWNER) => false,
                Some(VISUAL_PUBLICATION_SAVE_OWNER) => true,
                // Never mutate an unknown directory, even below the app cache path.
                _ => continue,
            };
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
        rollback_visual_save_transaction(
            project_root,
            &transaction_root,
            &journal,
            allow_managed_publication_metadata,
        )?;
        std::fs::remove_dir_all(&transaction_root)
            .map_err(|e| format!("recovered save journal cannot be cleaned up: {}", e))?;
    }
    Ok(())
}

fn rollback_visual_save_transaction(
    project_root: &Path,
    transaction_root: &Path,
    journal: &VisualSaveJournal,
    allow_managed_publication_metadata: bool,
) -> Result<(), String> {
    let staged_root = transaction_root.join("staged");
    let backup_root = transaction_root.join("backup");
    for entry in journal.entries.iter().rev() {
        validate_journal_file_name(&entry.staged_name)?;
        validate_journal_file_name(&entry.backup_name)?;
        let target = safe_join_save_transaction_path(
            project_root,
            &entry.relative_path,
            allow_managed_publication_metadata,
        )?;
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
    if let Some(Component::Normal(value)) = path.components().next() {
        let root = value.to_string_lossy();
        if root.eq_ignore_ascii_case(".cache") {
            return Err("visual project documents cannot be stored in .cache".to_string());
        }
        if root.eq_ignore_ascii_case(".xrift") {
            return Err(
                "visual project documents cannot overwrite XRift publication metadata".to_string(),
            );
        }
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

fn compiler_staging_owner_for_manifest(
    manifest: &VisualProjectManifest,
    publication: Option<&LoadedCompilerPublicationMetadata>,
) -> CompilerStagingOwner {
    CompilerStagingOwner {
        schema_version: COMPILER_STAGING_OWNER_SCHEMA_VERSION.to_string(),
        project_id: manifest.project_id.clone(),
        project_kind: manifest.project_kind.clone(),
        pre_upload_id: publication.map(|loaded| loaded.metadata.id.clone()),
        pre_upload_last_uploaded_at: publication
            .map(|loaded| loaded.metadata.last_uploaded_at.clone()),
        upload_attempt_started_unix_ms: None,
    }
}

fn validate_compiler_staging_owner(owner: &CompilerStagingOwner) -> Result<(), String> {
    if owner.schema_version != COMPILER_STAGING_OWNER_SCHEMA_VERSION {
        return Err("compiler staging owner has an unsupported schema version".to_string());
    }
    if owner.project_id.trim().is_empty() || owner.project_id.len() > 512 {
        return Err("compiler staging owner has an invalid project id".to_string());
    }
    if !matches!(owner.project_kind.as_str(), "world" | "item") {
        return Err("compiler staging owner has an invalid project kind".to_string());
    }
    match (
        owner.pre_upload_id.as_deref(),
        owner.pre_upload_last_uploaded_at.as_deref(),
    ) {
        (None, None) => {}
        (Some(id), Some(uploaded_at))
            if !id.trim().is_empty()
                && id.len() <= 512
                && !uploaded_at.trim().is_empty()
                && uploaded_at.len() <= 128 => {}
        _ => return Err("compiler staging owner has invalid pre-upload metadata".to_string()),
    }
    Ok(())
}

fn compiler_staging_owner_matches_manifest(
    owner: &CompilerStagingOwner,
    manifest: &VisualProjectManifest,
) -> bool {
    owner.schema_version == COMPILER_STAGING_OWNER_SCHEMA_VERSION
        && owner.project_id == manifest.project_id
        && owner.project_kind == manifest.project_kind
}

fn read_compiler_staging_owner(
    project_root: &Path,
) -> Result<Option<CompilerStagingOwner>, String> {
    let path = safe_join_path(project_root, COMPILER_STAGING_OWNER_PATH)?;
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("compiler staging owner is not a regular file".to_string());
    }
    if metadata.len() > XRIFT_PUBLICATION_METADATA_MAX_BYTES {
        return Err("compiler staging owner is too large".to_string());
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("compiler staging owner cannot be read: {}", e))?;
    let owner: CompilerStagingOwner = serde_json::from_str(&raw)
        .map_err(|e| format!("compiler staging owner is invalid: {}", e))?;
    validate_compiler_staging_owner(&owner)?;
    Ok(Some(owner))
}

fn write_compiler_staging_owner(
    project_root: &Path,
    manifest: &VisualProjectManifest,
    publication: Option<&LoadedCompilerPublicationMetadata>,
) -> Result<(), String> {
    let owner = compiler_staging_owner_for_manifest(manifest, publication);
    write_compiler_staging_owner_record(project_root, &owner)
}

fn write_compiler_staging_owner_record(
    project_root: &Path,
    owner: &CompilerStagingOwner,
) -> Result<(), String> {
    validate_compiler_staging_owner(owner)?;
    let raw = serde_json::to_string_pretty(&owner)
        .map_err(|e| format!("compiler staging owner cannot be serialized: {}", e))?;
    let path = safe_join_path(project_root, COMPILER_STAGING_OWNER_PATH)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    write_file_synced(&path, format!("{}\n", raw).as_bytes())
}

fn verify_compiler_upload_advanced(
    owner: &CompilerStagingOwner,
    uploaded: &LoadedCompilerPublicationMetadata,
) -> Result<(), String> {
    if let Some(previous_id) = owner.pre_upload_id.as_deref() {
        if previous_id != uploaded.metadata.id {
            return Err("XRift upload changed the saved publication id".to_string());
        }
        if owner.pre_upload_last_uploaded_at.as_deref()
            == Some(uploaded.metadata.last_uploaded_at.as_str())
        {
            return Err(
                "XRift CLI exited without advancing the publication metadata; upload completion is unknown"
                    .to_string(),
            );
        }
    }
    Ok(())
}

fn publication_matches_owner_baseline(
    owner: &CompilerStagingOwner,
    publication: Option<&LoadedCompilerPublicationMetadata>,
) -> bool {
    match (owner.pre_upload_id.as_deref(), publication) {
        (None, None) => owner.pre_upload_last_uploaded_at.is_none(),
        (Some(expected_id), Some(loaded)) => {
            expected_id == loaded.metadata.id
                && owner.pre_upload_last_uploaded_at.as_deref()
                    == Some(loaded.metadata.last_uploaded_at.as_str())
        }
        _ => false,
    }
}

fn xrift_publication_metadata_relative_path(project_kind: &str) -> Result<String, String> {
    match project_kind {
        "world" => Ok(".xrift/world.json".to_string()),
        "item" => Ok(".xrift/item.json".to_string()),
        _ => Err("visual project kind must be world or item".to_string()),
    }
}

fn validate_compiler_publication_metadata(
    metadata: &CompilerPublicationMetadata,
) -> Result<(), String> {
    if metadata.id.trim().is_empty() || metadata.id.len() > 512 {
        return Err("XRift publication metadata has an invalid id".to_string());
    }
    for (label, value) in [
        ("createdAt", metadata.created_at.as_str()),
        ("lastUploadedAt", metadata.last_uploaded_at.as_str()),
    ] {
        if value.trim().is_empty() || value.len() > 128 {
            return Err(format!(
                "XRift publication metadata has an invalid {}",
                label
            ));
        }
    }
    Ok(())
}

fn parse_compiler_publication_metadata(
    raw: String,
) -> Result<LoadedCompilerPublicationMetadata, String> {
    if raw.len() as u64 > XRIFT_PUBLICATION_METADATA_MAX_BYTES {
        return Err("XRift publication metadata is too large".to_string());
    }
    let metadata: CompilerPublicationMetadata = serde_json::from_str(&raw)
        .map_err(|e| format!("XRift publication metadata is invalid: {}", e))?;
    validate_compiler_publication_metadata(&metadata)?;
    Ok(LoadedCompilerPublicationMetadata { raw, metadata })
}

fn read_compiler_publication_metadata(
    project_root: &Path,
    project_kind: &str,
) -> Result<Option<LoadedCompilerPublicationMetadata>, String> {
    let relative_path = xrift_publication_metadata_relative_path(project_kind)?;
    let relative = validate_relative_path(&relative_path, false)?;
    ensure_no_symlink_ancestors(project_root, &relative)?;
    let path = project_root.join(relative);
    let file_metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if file_metadata.file_type().is_symlink() || !file_metadata.is_file() {
        return Err("XRift publication metadata is not a regular file".to_string());
    }
    if file_metadata.len() > XRIFT_PUBLICATION_METADATA_MAX_BYTES {
        return Err("XRift publication metadata is too large".to_string());
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("XRift publication metadata cannot be read: {}", e))?;
    parse_compiler_publication_metadata(raw).map(Some)
}

fn write_compiler_publication_metadata(
    project_root: &Path,
    project_kind: &str,
    loaded: &LoadedCompilerPublicationMetadata,
) -> Result<(), String> {
    let relative_path = xrift_publication_metadata_relative_path(project_kind)?;
    let target = safe_join_managed_publication_path(project_root, &relative_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    write_file_synced(&target, loaded.raw.as_bytes())
}

fn persist_authoring_publication_metadata(
    project_root: &Path,
    project_kind: &str,
    loaded: &LoadedCompilerPublicationMetadata,
) -> Result<(), String> {
    let relative_path = xrift_publication_metadata_relative_path(project_kind)?;
    let raw = if loaded.raw.ends_with('\n') {
        loaded.raw.clone()
    } else {
        format!("{}\n", loaded.raw)
    };
    save_publication_metadata_transaction(project_root, &[(relative_path, raw)])
}

fn manifest_publication_id(manifest: &VisualProjectManifest) -> Option<&str> {
    let publication = manifest.last_publication.as_ref()?;
    let kind_id = match manifest.project_kind.as_str() {
        "world" => publication.world_id.as_deref(),
        "item" => publication.item_id.as_deref(),
        _ => None,
    };
    kind_id
        .or(publication.content_id.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn persist_verified_authoring_publication_metadata(
    authoring_root: &Path,
    manifest: &VisualProjectManifest,
    loaded: &LoadedCompilerPublicationMetadata,
) -> Result<(), String> {
    if let Some(expected_id) = manifest_publication_id(manifest) {
        if loaded.metadata.id != expected_id {
            return Err(
                "XRift returned a different publication id than the saved project target"
                    .to_string(),
            );
        }
    }
    if let Some(existing) =
        read_compiler_publication_metadata(authoring_root, &manifest.project_kind)?
    {
        if existing.metadata.id != loaded.metadata.id {
            return Err(
                "XRift returned a different publication id than the local CLI metadata".to_string(),
            );
        }
    }
    persist_authoring_publication_metadata(authoring_root, &manifest.project_kind, loaded)
}

fn metadata_from_manifest(
    manifest: &VisualProjectManifest,
) -> Result<Option<LoadedCompilerPublicationMetadata>, String> {
    let Some(id) = manifest_publication_id(manifest) else {
        return Ok(None);
    };
    let uploaded_at = manifest
        .last_publication
        .as_ref()
        .map(|publication| publication.uploaded_at.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "saved XRift publication is missing uploadedAt".to_string())?;
    let metadata = CompilerPublicationMetadata {
        id: id.to_string(),
        created_at: uploaded_at.to_string(),
        last_uploaded_at: uploaded_at.to_string(),
    };
    validate_compiler_publication_metadata(&metadata)?;
    let raw = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("XRift publication metadata cannot be serialized: {}", e))?;
    Ok(Some(LoadedCompilerPublicationMetadata {
        raw: format!("{}\n", raw),
        metadata,
    }))
}

fn publication_timestamp_second(value: &str) -> Option<&str> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }
    for (index, byte) in bytes[..19].iter().enumerate() {
        if matches!(index, 4 | 7 | 10 | 13 | 16) {
            continue;
        }
        if !byte.is_ascii_digit() {
            return None;
        }
    }
    value.get(..19)
}

fn select_unique_publication_candidate(
    candidates: Vec<LoadedCompilerPublicationMetadata>,
) -> Result<Option<LoadedCompilerPublicationMetadata>, String> {
    let mut by_id = HashMap::new();
    for candidate in candidates {
        by_id
            .entry(candidate.metadata.id.clone())
            .or_insert(candidate);
    }
    if by_id.len() > 1 {
        return Err(
            "以前のXRift公開先が複数見つかったため、自動では選択できません。再アップロードせず公開先IDを確認してください。"
                .to_string(),
        );
    }
    Ok(by_id.into_values().next())
}

fn compiler_legacy_project_segment(value: &str) -> String {
    let mut normalized = String::new();
    let mut replacing = false;
    for character in value.trim().chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            normalized.push(character);
            replacing = false;
        } else if !replacing {
            normalized.push('-');
            replacing = true;
        }
    }
    let trimmed = normalized.trim_matches('-');
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn legacy_staging_config_matches_manifest(
    candidate_root: &Path,
    manifest: &VisualProjectManifest,
) -> bool {
    let path = match safe_join_path(candidate_root, "xrift.json") {
        Ok(path) => path,
        Err(_) => return false,
    };
    match std::fs::symlink_metadata(&path) {
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() <= XRIFT_PUBLICATION_METADATA_MAX_BYTES => {}
        _ => return false,
    }
    let config = match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<XriftJson>(&raw).ok())
    {
        Some(config) => config,
        None => return false,
    };
    let project_metadata = match manifest.project_kind.as_str() {
        "world" => config.world.as_ref(),
        "item" => config.item.as_ref(),
        _ => None,
    };
    matches!(
        project_metadata,
        Some(project_metadata)
            if project_metadata.title.as_deref() == Some(manifest.metadata.title.as_str())
                && project_metadata.description.as_deref()
                    == Some(manifest.metadata.description.as_str())
    )
}

fn recover_legacy_compiler_publication_metadata(
    app: &AppHandle,
    manifest: &VisualProjectManifest,
) -> Result<Option<LoadedCompilerPublicationMetadata>, String> {
    let Some(publication) = manifest.last_publication.as_ref() else {
        return Ok(None);
    };
    let uploaded_at = publication.uploaded_at.trim();
    if uploaded_at.is_empty() {
        return Ok(None);
    }
    let root = compiler_staging_root(app)?;
    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("old compiler staging cannot be inspected: {}", e))?;
    let legacy_name_prefix = format!(
        "xrift-studio-{}-{}-",
        manifest.project_kind,
        compiler_legacy_project_segment(&manifest.metadata.name)
    );
    let mut exact_matches = Vec::new();
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("xrift-studio-") {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let candidate_root = match entry.path().canonicalize() {
            Ok(path) if path.starts_with(&root) => path,
            _ => continue,
        };
        let owner_matches = match read_compiler_staging_owner(&candidate_root) {
            Ok(Some(owner)) => compiler_staging_owner_matches_manifest(&owner, manifest),
            Ok(None) => {
                name.starts_with(&legacy_name_prefix)
                    && legacy_staging_config_matches_manifest(&candidate_root, manifest)
            }
            Err(_) => false,
        };
        if !owner_matches {
            continue;
        }
        let loaded =
            match read_compiler_publication_metadata(&candidate_root, &manifest.project_kind) {
                Ok(Some(loaded)) => loaded,
                _ => continue,
            };
        let timestamp_matches = loaded.metadata.last_uploaded_at.trim() == uploaded_at
            || matches!(
                (
                    publication_timestamp_second(&loaded.metadata.last_uploaded_at),
                    publication_timestamp_second(uploaded_at),
                ),
                (Some(candidate), Some(saved)) if candidate == saved
            );
        if timestamp_matches {
            exact_matches.push(loaded);
        }
    }
    select_unique_publication_candidate(exact_matches)
}

fn resolve_authoring_publication_metadata(
    app: &AppHandle,
    authoring_root: &Path,
    manifest: &VisualProjectManifest,
) -> Result<(Option<LoadedCompilerPublicationMetadata>, bool), String> {
    if let Some(loaded) =
        read_compiler_publication_metadata(authoring_root, &manifest.project_kind)?
    {
        if let Some(expected_id) = manifest_publication_id(manifest) {
            if loaded.metadata.id != expected_id {
                return Err(
                    "XRift publication metadata does not match the saved project target"
                        .to_string(),
                );
            }
        }
        return Ok((Some(loaded), false));
    }

    if let Some(loaded) = metadata_from_manifest(manifest)? {
        return Ok((Some(loaded), true));
    }

    if manifest.last_publication.is_some() {
        let recovered = recover_legacy_compiler_publication_metadata(app, manifest)?;
        if let Some(loaded) = recovered {
            return Ok((Some(loaded), true));
        }
        return Err(
            "以前のXRift公開先IDを復元できません。別のワールドを作らないようアップロードを停止しました。"
                .to_string(),
        );
    }

    Ok((None, false))
}

/// Clears only the compiler-owned directory selected by the deterministic
/// staging name. The visual authoring project is never accepted as a target.
#[tauri::command]
fn prepare_compiler_staging(
    app: AppHandle,
    authoring_project_path: String,
    directory_name: String,
) -> Result<CompilerStagingPaths, String> {
    let _compiler_guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let _visual_guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;

    let authoring_root = canonical_project_root(&authoring_project_path)?;
    recover_visual_save_transactions(&authoring_root)?;
    let manifest_content = std::fs::read_to_string(authoring_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&manifest_content)?;

    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    if project.exists() {
        let metadata = std::fs::symlink_metadata(&project).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("compiler staging target is not a regular directory".to_string());
        }
        let resolved_project = project
            .canonicalize()
            .map_err(|e| format!("compiler staging project cannot be resolved: {}", e))?;
        if !resolved_project.starts_with(&root) {
            return Err("compiler staging project escapes the app-owned root".to_string());
        }
        let owner = read_compiler_staging_owner(&resolved_project)?;
        if let Some(owner) = owner.as_ref() {
            if !compiler_staging_owner_matches_manifest(owner, &manifest) {
                return Err(
                    "compiler staging belongs to a different visual project; it was not removed"
                        .to_string(),
                );
            }
        }
        let staged_publication =
            read_compiler_publication_metadata(&resolved_project, &manifest.project_kind)?;
        match (owner.as_ref(), staged_publication.as_ref()) {
            (None, Some(_)) => {
                return Err(
                    "unowned compiler staging contains an XRift publication id; it was not removed"
                        .to_string(),
                )
            }
            (Some(owner), Some(loaded)) if owner.upload_attempt_started_unix_ms.is_some() => {
                // Only a sidecar advanced beyond the recorded pre-upload
                // baseline proves that the prior remote attempt completed.
                verify_compiler_upload_advanced(owner, loaded)?;
                persist_verified_authoring_publication_metadata(
                    &authoring_root,
                    &manifest,
                    loaded,
                )?;
            }
            (Some(owner), Some(loaded)) => {
                if !publication_matches_owner_baseline(owner, Some(loaded)) {
                    return Err(
                        "compiler staging publication metadata changed without an upload attempt"
                            .to_string(),
                    );
                }
                persist_verified_authoring_publication_metadata(
                    &authoring_root,
                    &manifest,
                    loaded,
                )?;
            }
            (Some(owner), None) if owner.upload_attempt_started_unix_ms.is_some() => {
                return Err(
                    "a previous XRift upload attempt has no saved remote result; automatic retry is blocked"
                        .to_string(),
                )
            }
            _ => {}
        }
        std::fs::remove_dir_all(&project)
            .map_err(|e| format!("old compiler staging cannot be removed: {}", e))?;
    }
    Ok(CompilerStagingPaths {
        root_path: root.to_string_lossy().to_string(),
        project_path: project.to_string_lossy().to_string(),
    })
}

fn required_thumbnail_copy() -> CompilerRequiredPublicationFileCopy {
    CompilerRequiredPublicationFileCopy {
        purpose: "thumbnail".to_string(),
        source_relative_path: "public/thumbnail.png".to_string(),
        target_relative_path: "public/thumbnail.png".to_string(),
    }
}

fn validate_required_publication_files(
    copies: &[CompilerRequiredPublicationFileCopy],
) -> Result<(), String> {
    if copies != [required_thumbnail_copy()] {
        return Err(
            "compiler staging requires exactly public/thumbnail.png as its publication thumbnail"
                .to_string(),
        );
    }
    Ok(())
}

fn sha256_file(path: &Path, label: &str) -> Result<String, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("{} cannot be opened for SHA-256 verification: {}", label, e))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("{} cannot be read for SHA-256 verification: {}", label, e))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn required_publication_file_paths(
    authoring_root: &Path,
    staging_root: &Path,
    copy: &CompilerRequiredPublicationFileCopy,
) -> Result<(PathBuf, PathBuf), String> {
    let source_relative = validate_relative_path(&copy.source_relative_path, false)?;
    let target_relative = validate_relative_path(&copy.target_relative_path, false)?;
    ensure_no_symlink_ancestors(authoring_root, &source_relative)?;
    ensure_no_symlink_ancestors(staging_root, &target_relative)?;
    Ok((
        authoring_root.join(source_relative),
        staging_root.join(target_relative),
    ))
}

fn verify_required_publication_file_copy(
    authoring_root: &Path,
    staging_root: &Path,
    copy: &CompilerRequiredPublicationFileCopy,
) -> Result<CompilerRequiredPublicationFileVerification, String> {
    let (source, target) =
        required_publication_file_paths(authoring_root, staging_root, copy)?;
    for (path, label) in [
        (&source, "required publication thumbnail source"),
        (&target, "required publication thumbnail staging target"),
    ] {
        let metadata = std::fs::symlink_metadata(path)
            .map_err(|e| format!("{} cannot be read: {}", label, e))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() == 0 {
            return Err(format!("{} is not a non-empty regular file", label));
        }
    }

    let source_sha256 = sha256_file(&source, "required publication thumbnail source")?;
    let target_sha256 = sha256_file(&target, "required publication thumbnail staging target")?;
    if source_sha256 != target_sha256 {
        return Err(
            "required publication thumbnail SHA-256 does not match after staging".to_string(),
        );
    }

    Ok(CompilerRequiredPublicationFileVerification {
        purpose: copy.purpose.clone(),
        source_relative_path: copy.source_relative_path.clone(),
        target_relative_path: copy.target_relative_path.clone(),
        sha256: source_sha256,
    })
}

fn copy_required_publication_file(
    authoring_root: &Path,
    staging_root: &Path,
    copy: &CompilerRequiredPublicationFileCopy,
) -> Result<CompilerRequiredPublicationFileVerification, String> {
    let (source, target) =
        required_publication_file_paths(authoring_root, staging_root, copy)?;
    let source_metadata = std::fs::symlink_metadata(&source)
        .map_err(|e| format!("required publication thumbnail source cannot be read: {}", e))?;
    if source_metadata.file_type().is_symlink()
        || !source_metadata.is_file()
        || source_metadata.len() == 0
    {
        return Err(
            "required publication thumbnail source is not a non-empty regular file".to_string(),
        );
    }
    if let Ok(target_metadata) = std::fs::symlink_metadata(&target) {
        if target_metadata.file_type().is_symlink() || !target_metadata.is_file() {
            return Err(
                "required publication thumbnail staging target is not a regular file".to_string(),
            );
        }
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("required publication thumbnail directory cannot be created: {}", e))?;
    }
    std::fs::copy(&source, &target)
        .map_err(|e| format!("required publication thumbnail cannot be copied: {}", e))?;
    verify_required_publication_file_copy(authoring_root, staging_root, copy)
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
    required_publication_files: Vec<CompilerRequiredPublicationFileCopy>,
) -> Result<CompilerStagingResult, String> {
    let _compiler_guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let _visual_guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;
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
    let authoring_root = canonical_project_root(&authoring_project_path)?;
    recover_visual_save_transactions(&authoring_root)?;
    let manifest_content = std::fs::read_to_string(authoring_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&manifest_content)?;
    validate_required_publication_files(&required_publication_files)?;
    let (publication_metadata, persist_recovered_metadata) =
        resolve_authoring_publication_metadata(&app, &authoring_root, &manifest)?;
    if persist_recovered_metadata {
        let loaded = publication_metadata
            .as_ref()
            .ok_or_else(|| "recovered XRift publication metadata is missing".to_string())?;
        persist_authoring_publication_metadata(&authoring_root, &manifest.project_kind, loaded)?;
    }

    for overlay in overlay_files {
        if is_reserved_project_path(&overlay.relative_path)? {
            return Err("compiler output cannot write XRift publication metadata".to_string());
        }
        let target = safe_join(&resolved_project.to_string_lossy(), &overlay.relative_path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        write_file_synced(&target, overlay.content.as_bytes())?;
    }

    for copy in asset_copies {
        if is_reserved_project_path(&copy.source_relative_path)?
            || is_reserved_project_path(&copy.target_relative_path)?
        {
            return Err("compiler assets cannot use XRift publication metadata paths".to_string());
        }
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

    let mut required_file_verifications = Vec::with_capacity(required_publication_files.len());
    for copy in &required_publication_files {
        required_file_verifications.push(copy_required_publication_file(
            &authoring_root,
            &resolved_project,
            copy,
        )?);
    }

    if let Some(loaded) = publication_metadata.as_ref() {
        write_compiler_publication_metadata(&resolved_project, &manifest.project_kind, loaded)?;
    }
    // Written last: only fully materialized staging is eligible for upload
    // and for crash recovery of a CLI-created publication sidecar.
    write_compiler_staging_owner(&resolved_project, &manifest, publication_metadata.as_ref())?;

    Ok(CompilerStagingResult {
        project_path: resolved_project.to_string_lossy().to_string(),
        required_publication_files: required_file_verifications,
    })
}

/// Marks the point after which a remote commit may have happened. If the app
/// stops before the CLI writes its sidecar, the next attempt is blocked rather
/// than silently creating a second remote target.
#[tauri::command]
fn mark_compiler_upload_started(
    app: AppHandle,
    authoring_project_path: String,
    directory_name: String,
) -> Result<(), String> {
    let _compiler_guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let _visual_guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;

    let authoring_root = canonical_project_root(&authoring_project_path)?;
    recover_visual_save_transactions(&authoring_root)?;
    let manifest_content = std::fs::read_to_string(authoring_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&manifest_content)?;

    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    let staging_root = project
        .canonicalize()
        .map_err(|e| format!("compiler staging project cannot be resolved: {}", e))?;
    if !staging_root.starts_with(&root) {
        return Err("compiler staging project escapes the app-owned root".to_string());
    }
    let mut owner = read_compiler_staging_owner(&staging_root)?
        .ok_or_else(|| "compiler staging owner is missing before upload".to_string())?;
    if !compiler_staging_owner_matches_manifest(&owner, &manifest) {
        return Err("compiler staging owner does not match the visual project".to_string());
    }
    if owner.upload_attempt_started_unix_ms.is_some() {
        return Err(
            "a previous XRift upload attempt has an unknown remote result; automatic retry is blocked"
                .to_string(),
        );
    }

    let staged_publication =
        read_compiler_publication_metadata(&staging_root, &manifest.project_kind)?;
    let authoring_publication =
        read_compiler_publication_metadata(&authoring_root, &manifest.project_kind)?;
    if let Some(expected_id) = manifest_publication_id(&manifest) {
        if authoring_publication
            .as_ref()
            .map(|loaded| loaded.metadata.id.as_str())
            != Some(expected_id)
        {
            return Err(
                "saved publication target changed after compiler staging was prepared".to_string(),
            );
        }
    }
    if !publication_matches_owner_baseline(&owner, staged_publication.as_ref())
        || !publication_matches_owner_baseline(&owner, authoring_publication.as_ref())
    {
        return Err("publication metadata changed before upload".to_string());
    }

    // Re-check immediately before handing control to the CLI. If the source
    // thumbnail changed after staging, the compiled output is stale and the
    // remote upload must not begin.
    verify_required_publication_file_copy(
        &authoring_root,
        &staging_root,
        &required_thumbnail_copy(),
    )?;

    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system time is before the Unix epoch".to_string())?
        .as_millis();
    owner.upload_attempt_started_unix_ms = Some(
        u64::try_from(started_at)
            .map_err(|_| "upload attempt timestamp is out of range".to_string())?,
    );
    write_compiler_staging_owner_record(&staging_root, &owner)
}

/// Clears an attempt only when the CLI never reached remote transfer and the
/// staging sidecar is byte-semantically unchanged from the recorded baseline.
#[tauri::command]
fn clear_compiler_upload_attempt(
    app: AppHandle,
    authoring_project_path: String,
    directory_name: String,
) -> Result<(), String> {
    let _compiler_guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let _visual_guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;

    let authoring_root = canonical_project_root(&authoring_project_path)?;
    recover_visual_save_transactions(&authoring_root)?;
    let manifest_content = std::fs::read_to_string(authoring_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&manifest_content)?;

    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    let staging_root = project
        .canonicalize()
        .map_err(|e| format!("compiler staging project cannot be resolved: {}", e))?;
    if !staging_root.starts_with(&root) {
        return Err("compiler staging project escapes the app-owned root".to_string());
    }
    let mut owner = read_compiler_staging_owner(&staging_root)?
        .ok_or_else(|| "compiler staging owner is missing after upload attempt".to_string())?;
    if !compiler_staging_owner_matches_manifest(&owner, &manifest) {
        return Err("compiler staging owner does not match the visual project".to_string());
    }
    if owner.upload_attempt_started_unix_ms.is_none() {
        return Ok(());
    }
    let staged_publication =
        read_compiler_publication_metadata(&staging_root, &manifest.project_kind)?;
    if !publication_matches_owner_baseline(&owner, staged_publication.as_ref()) {
        return Err(
            "upload attempt changed XRift publication metadata and cannot be cleared".to_string(),
        );
    }
    owner.upload_attempt_started_unix_ms = None;
    write_compiler_staging_owner_record(&staging_root, &owner)
}

/// Copies the CLI-owned remote identifier back to the visual authoring
/// project after a successful upload. The next fresh staging project restores
/// this sidecar before invoking the CLI, so upload remains an update.
#[tauri::command]
fn persist_compiler_publication_metadata(
    app: AppHandle,
    authoring_project_path: String,
    directory_name: String,
) -> Result<CompilerPublicationMetadata, String> {
    let _compiler_guard = COMPILER_STAGING_IO_LOCK
        .lock()
        .map_err(|_| "compiler staging I/O lock is unavailable".to_string())?;
    let _visual_guard = VISUAL_PROJECT_IO_LOCK
        .lock()
        .map_err(|_| "visual project I/O lock is unavailable".to_string())?;

    let authoring_root = canonical_project_root(&authoring_project_path)?;
    recover_visual_save_transactions(&authoring_root)?;
    let manifest_content = std::fs::read_to_string(authoring_root.join(VISUAL_PROJECT_MANIFEST))
        .map_err(|e| format!("visual project manifest cannot be read: {}", e))?;
    let manifest = parse_visual_project_manifest(&manifest_content)?;

    let (root, project) = compiler_staging_project(&app, &directory_name)?;
    let staging_root = project
        .canonicalize()
        .map_err(|e| format!("compiler staging project cannot be resolved: {}", e))?;
    if !staging_root.starts_with(&root) {
        return Err("compiler staging project escapes the app-owned root".to_string());
    }
    let loaded = read_compiler_publication_metadata(&staging_root, &manifest.project_kind)?
        .ok_or_else(|| {
            "XRift CLI completed without saving publication metadata; the remote result is unknown"
                .to_string()
        })?;
    let owner = read_compiler_staging_owner(&staging_root)?
        .ok_or_else(|| "compiler staging owner is missing after upload".to_string())?;
    if !compiler_staging_owner_matches_manifest(&owner, &manifest) {
        return Err("compiler staging owner does not match the visual project".to_string());
    }
    if owner.upload_attempt_started_unix_ms.is_none() {
        return Err("compiler upload attempt was not marked before completion".to_string());
    }
    verify_compiler_upload_advanced(&owner, &loaded)?;
    persist_verified_authoring_publication_metadata(&authoring_root, &manifest, &loaded)?;
    Ok(loaded.metadata)
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
/// Import destinations are content-addressed. An existing byte-identical file
/// is reused, while a different payload at the same path is never overwritten.
#[tauri::command]
fn commit_visual_asset_import(
    project_path: String,
    transaction_id: String,
    writes: Vec<VisualAssetImportWrite>,
) -> Result<(), String> {
    const MAX_IMPORT_BYTES: usize = 128 * 1024 * 1024;
    // Model source plus extracted embedded images can approach twice the source size.
    const MAX_TRANSACTION_BYTES: usize = 320 * 1024 * 1024;

    let _guard = VISUAL_ASSET_IMPORT_IO_LOCK
        .lock()
        .map_err(|_| "visual Asset import I/O lock is unavailable".to_string())?;
    let transaction_id = validate_asset_import_transaction_id(&transaction_id)?;
    if writes.is_empty() || writes.len() > 512 {
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

        if let Ok(metadata) = std::fs::symlink_metadata(&target) {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                let _ = std::fs::remove_dir_all(&transaction_root);
                return Err(format!(
                    "asset import target is not a regular file: {}",
                    write.relative_path
                ));
            }
            let existing = std::fs::read(&target).map_err(|error| {
                let _ = std::fs::remove_dir_all(&transaction_root);
                format!("asset import target cannot be verified: {}", error)
            })?;
            if existing == bytes {
                continue;
            }
            let _ = std::fs::remove_dir_all(&transaction_root);
            return Err(format!(
                "asset import target has different content: {}",
                write.relative_path
            ));
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
    if is_reserved_project_path(&rel)? {
        return Err("XRift publication metadata cannot be edited".to_string());
    }
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

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    ".git",
    ".xrift",
    ".next",
    ".cache",
    "target",
];

fn is_reserved_project_path(rel: &str) -> Result<bool, String> {
    let relative = validate_relative_path(rel, false)?;
    Ok(matches!(
        relative.components().next(),
        Some(Component::Normal(value))
            if value.to_string_lossy().eq_ignore_ascii_case(".xrift")
    ))
}

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
        if SKIP_DIRS
            .iter()
            .any(|skipped| skipped.eq_ignore_ascii_case(&name))
        {
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
    if is_reserved_project_path(&rel)? {
        return Err("XRift publication metadata cannot be deleted".into());
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
    if is_reserved_project_path(&old_rel)? || is_reserved_project_path(&new_rel)? {
        return Err("XRift publication metadata cannot be renamed".into());
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
    if is_reserved_project_path(&rel)? {
        return Err("XRift publication metadata cannot be edited".to_string());
    }
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
    let mut builder = tauri::Builder::default();

    // Publication staging uses process-local mutexes, so desktop launches are
    // single-instance. A second launch focuses the existing authoring window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    let builder = builder
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
            mark_compiler_upload_started,
            clear_compiler_upload_attempt,
            persist_compiler_publication_metadata,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn publication_metadata(id: &str, uploaded_at: &str) -> LoadedCompilerPublicationMetadata {
        let metadata = CompilerPublicationMetadata {
            id: id.to_string(),
            created_at: "2026-07-19T00:00:00.000Z".to_string(),
            last_uploaded_at: uploaded_at.to_string(),
        };
        LoadedCompilerPublicationMetadata {
            raw: serde_json::to_string(&metadata).expect("metadata must serialize"),
            metadata,
        }
    }

    fn visual_manifest(
        project_kind: &str,
        publication: Option<VisualPublicationRecord>,
    ) -> VisualProjectManifest {
        VisualProjectManifest {
            schema_version: "1.0.0".to_string(),
            project_id: "project-01".to_string(),
            project_kind: project_kind.to_string(),
            metadata: VisualProjectMetadata {
                name: "fixture".to_string(),
                title: "Fixture".to_string(),
                description: String::new(),
            },
            entry_scene_id: "scene-01".to_string(),
            scene_paths: HashMap::new(),
            asset_manifest_path: "assets/manifest.json".to_string(),
            last_publication: publication,
        }
    }

    #[test]
    fn parses_official_cli_publication_metadata() {
        let loaded = parse_compiler_publication_metadata(
            r#"{"id":"world-01","createdAt":"2026-07-19T00:00:00.000Z","lastUploadedAt":"2026-07-20T00:00:00.000Z"}"#
                .to_string(),
        )
        .expect("valid metadata must parse");

        assert_eq!(loaded.metadata.id, "world-01");
        assert_eq!(loaded.metadata.last_uploaded_at, "2026-07-20T00:00:00.000Z");
    }

    #[test]
    fn rejects_ambiguous_legacy_publication_targets() {
        let result = select_unique_publication_candidate(vec![
            publication_metadata("world-01", "2026-07-20T00:00:00.000Z"),
            publication_metadata("world-02", "2026-07-20T00:00:00.000Z"),
        ]);

        assert!(result.is_err());
    }

    #[test]
    fn accepts_duplicate_candidates_for_the_same_target() {
        let result = select_unique_publication_candidate(vec![
            publication_metadata("world-01", "2026-07-20T00:00:00.000Z"),
            publication_metadata("world-01", "2026-07-20T00:00:00.000Z"),
        ])
        .expect("the same remote id is unambiguous")
        .expect("a candidate must remain");

        assert_eq!(result.metadata.id, "world-01");
    }

    #[test]
    fn rebuilds_cli_metadata_from_a_saved_world_target() {
        let manifest = visual_manifest(
            "world",
            Some(VisualPublicationRecord {
                uploaded_at: "2026-07-20T00:00:00.000Z".to_string(),
                world_id: Some("world-01".to_string()),
                item_id: None,
                content_id: Some("world-01".to_string()),
            }),
        );

        let loaded = metadata_from_manifest(&manifest)
            .expect("saved publication must be valid")
            .expect("saved target must produce CLI metadata");

        assert_eq!(loaded.metadata.id, "world-01");
        assert_eq!(loaded.metadata.last_uploaded_at, "2026-07-20T00:00:00.000Z");
    }

    #[test]
    fn accepts_same_second_legacy_timestamps() {
        assert_eq!(
            publication_timestamp_second("2026-07-20T11:45:55.816Z"),
            publication_timestamp_second("2026-07-20T11:45:55.851Z")
        );
        assert_eq!(publication_timestamp_second("not-a-date"), None);
    }

    #[test]
    fn rejects_an_upload_that_did_not_advance_cli_metadata() {
        let manifest = visual_manifest("world", None);
        let previous = publication_metadata("world-01", "2026-07-20T00:00:00.000Z");
        let owner = compiler_staging_owner_for_manifest(&manifest, Some(&previous));

        assert!(verify_compiler_upload_advanced(&owner, &previous).is_err());

        let uploaded = publication_metadata("world-01", "2026-07-20T00:01:00.000Z");
        assert!(verify_compiler_upload_advanced(&owner, &uploaded).is_ok());
    }

    #[test]
    fn reserves_cli_publication_paths_from_generic_writes() {
        assert!(validate_visual_document_path(".xrift/world.json").is_err());
        assert!(validate_visual_document_path(".XRIFT/item.json").is_err());
        assert!(is_managed_publication_metadata_path(".xrift/world.json")
            .expect("managed path must validate"));
        assert!(
            !is_managed_publication_metadata_path(".xrift-studio/owner.json")
                .expect("ordinary compiler metadata path must validate")
        );
    }

    #[test]
    fn copies_and_rechecks_the_required_publication_thumbnail() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock must be available")
            .as_nanos();
        let fixture_root = std::env::temp_dir().join(format!(
            "xrift-studio-thumbnail-staging-{}-{}",
            std::process::id(),
            unique
        ));
        let authoring_root = fixture_root.join("authoring");
        let staging_root = fixture_root.join("staging");
        std::fs::create_dir_all(authoring_root.join("public"))
            .expect("authoring public directory must be created");
        std::fs::create_dir_all(staging_root.join("public"))
            .expect("staging public directory must be created");
        let authoring_root = authoring_root
            .canonicalize()
            .expect("authoring root must resolve");
        let staging_root = staging_root
            .canonicalize()
            .expect("staging root must resolve");
        std::fs::write(
            authoring_root.join("public/thumbnail.png"),
            b"edited-thumbnail",
        )
        .expect("authoring thumbnail must be written");
        std::fs::write(
            staging_root.join("public/thumbnail.png"),
            b"template-thumbnail",
        )
        .expect("template thumbnail must be written");

        let copy = required_thumbnail_copy();
        let verification =
            copy_required_publication_file(&authoring_root, &staging_root, &copy)
                .expect("required thumbnail must be copied and verified");
        assert_eq!(verification.purpose, "thumbnail");
        assert_eq!(
            std::fs::read(staging_root.join("public/thumbnail.png"))
                .expect("staged thumbnail must remain readable"),
            b"edited-thumbnail"
        );
        assert_eq!(
            verification.sha256,
            sha256_file(
                &authoring_root.join("public/thumbnail.png"),
                "fixture thumbnail"
            )
            .expect("fixture SHA-256 must be available")
        );

        std::fs::write(
            authoring_root.join("public/thumbnail.png"),
            b"changed-after-staging",
        )
        .expect("source thumbnail must be changed");
        assert!(verify_required_publication_file_copy(
            &authoring_root,
            &staging_root,
            &copy
        )
        .expect_err("a changed source must make staging stale")
        .contains("SHA-256 does not match"));

        std::fs::remove_dir_all(&fixture_root).expect("fixture directory must be removed");
    }

    #[test]
    fn reuses_only_byte_identical_asset_import_targets() {
        use base64::Engine;

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock must be available")
            .as_nanos();
        let project_root = std::env::temp_dir().join(format!(
            "xrift-studio-asset-import-{}-{}",
            std::process::id(),
            unique
        ));
        let relative_path = "assets/imported/models/aaaaaaaaaaaaaaaa/Avocado.glb";
        let target = project_root.join(relative_path);
        std::fs::create_dir_all(target.parent().expect("target parent must exist"))
            .expect("fixture directory must be created");
        std::fs::write(&target, [1_u8, 2, 3]).expect("fixture source must be written");
        let project_path = project_root.to_string_lossy().to_string();
        let data_url = |bytes: &[u8]| {
            format!(
                "data:model/gltf-binary;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            )
        };

        let reused = commit_visual_asset_import(
            project_path.clone(),
            "asset-import-identical-fixture".to_string(),
            vec![VisualAssetImportWrite {
                relative_path: relative_path.to_string(),
                data_url: data_url(&[1, 2, 3]),
            }],
        );
        assert!(reused.is_ok(), "byte-identical target must be reusable");

        let rejected = commit_visual_asset_import(
            project_path,
            "asset-import-different-fixture".to_string(),
            vec![VisualAssetImportWrite {
                relative_path: relative_path.to_string(),
                data_url: data_url(&[4, 5, 6]),
            }],
        );
        assert!(rejected
            .expect_err("different content must be rejected")
            .contains("different content"));
        assert_eq!(
            std::fs::read(&target).expect("fixture source must remain readable"),
            vec![1_u8, 2, 3]
        );

        std::fs::remove_dir_all(&project_root).expect("fixture directory must be removed");
    }
}
