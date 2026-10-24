use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, OnceLock, Weak};
use std::time::Duration;
use crate::background_process::tokio_command as hidden_command;
use tokio::sync::Notify;
#[path = "blender_preview.rs"]
mod preview;
pub(crate) use preview::subscribe_previews;

const RUNNER: &str = include_str!("blender_modeling.py");
const CACHE: &str = ".cache/xrift-studio-blender";
const TASK_PREFIX: &str = "model-";
const OWNER: &str = "xrift-studio-blender-model-v1";
const MODEL_TIMEOUT: Duration = Duration::from_secs(180);
const MODEL_CANCELLED: &str = "モデルの制作を停止しました。保存済みの変更は残っています";

#[derive(Default)]
struct ModelGenerationRegistry {
    active: HashMap<String, Vec<Weak<ModelGenerationControl>>>,
    // Remember recent Stops so a late IPC cannot start a new Blender process
    // after its request was cancelled, even when no ChatGPT lease is active.
    cancelled: VecDeque<String>,
}
static MODEL_GENERATIONS: OnceLock<Mutex<ModelGenerationRegistry>> = OnceLock::new();

struct ModelGenerationControl {
    cancelled: AtomicBool,
    notify: Notify,
}
impl ModelGenerationControl {
    async fn cancellation(&self) {
        if !self.cancelled.load(Ordering::Acquire) { self.notify.notified().await; }
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Acquire) { Err(MODEL_CANCELLED.into()) } else { Ok(()) }
    }
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        // Each Blender job has one waiter. A stored permit also closes the
        // race between checking the flag and awaiting cancellation.
        self.notify.notify_one();
    }
}
struct ModelGenerationGuard {
    id: String,
    control: Arc<ModelGenerationControl>,
}
impl Drop for ModelGenerationGuard {
    fn drop(&mut self) {
        if let Ok(mut registry) = MODEL_GENERATIONS.get_or_init(Mutex::default).lock() {
            if let Some(controls) = registry.active.get_mut(&self.id) {
                controls.retain(|control| control.upgrade().is_some_and(|control| !Arc::ptr_eq(&control, &self.control)));
                if controls.is_empty() { registry.active.remove(&self.id); }
            }
        }
    }
}

fn register_generation(id: Option<String>) -> Result<Option<ModelGenerationGuard>, String> {
    let Some(id) = id else { return Ok(None); };
    if id.is_empty() || id.len() > 160 || !id.bytes().all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_') {
        return Err("モデルの制作依頼の識別子が不正です".into());
    }
    let mut registry = MODEL_GENERATIONS.get_or_init(Mutex::default).lock().map_err(|_| "モデルの停止状態を確認できませんでした")?;
    if registry.cancelled.contains(&id) { return Err(MODEL_CANCELLED.into()); }
    let control = Arc::new(ModelGenerationControl { cancelled:AtomicBool::new(false), notify:Notify::new() });
    registry.active.entry(id.clone()).or_default().push(Arc::downgrade(&control));
    Ok(Some(ModelGenerationGuard { id, control }))
}

/// Cancels owned Blender jobs independently of the parallel ChatGPT workers'
/// lease. Ordinary MCP modeling without a generation id is not affected.
pub(crate) fn cancel_generation(id: &str) -> bool {
    if id.is_empty() || id.len() > 160 || !id.bytes().all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_') { return false; }
    let Ok(mut registry) = MODEL_GENERATIONS.get_or_init(Mutex::default).lock() else { return false; };
    let mut cancelled = false;
    if let Some(controls) = registry.active.get_mut(id) {
        controls.retain(|control| {
            if let Some(control) = control.upgrade() { control.cancel(); cancelled = true; true } else { false }
        });
    }
    if !registry.cancelled.iter().any(|value| value == id) {
        registry.cancelled.push_back(id.into());
        while registry.cancelled.len() > 256 { registry.cancelled.pop_front(); }
    }
    cancelled
}

async fn cancelled(control: Option<&ModelGenerationControl>) {
    match control { Some(control) => control.cancellation().await, None => std::future::pending().await }
}
fn check_generation(control: Option<&ModelGenerationControl>) -> Result<(), String> {
    control.map_or(Ok(()), ModelGenerationControl::check)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BlenderModelSpec {
    pub name: String,
    pub parts: Vec<BlenderModelPart>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BlenderModelPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub shape: String,
    pub position: [f64; 3],
    pub rotation: [f64; 3],
    pub scale: [f64; 3],
    pub color: [f64; 4],
    pub metallic: f64,
    pub roughness: f64,
    pub vertices: Option<Vec<[f64; 3]>>,
    pub faces: Option<Vec<Vec<usize>>>,
    pub bevel: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat: Option<BlenderModelRepeat>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BlenderModelRepeat {
    pub count: usize,
    pub offset: [f64; 3],
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BlenderStatus {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BlenderModelResult {
    path: String,
    file_name: String,
    byte_length: u64,
}

pub(crate) fn blender_model_schema() -> serde_json::Value {
    use serde_json::json;
    let vector = |min: f64, max: f64| json!({"type":"array","minItems":3,"maxItems":3,"items":{"type":"number","minimum":min,"maximum":max}});
    json!({"type":"object","additionalProperties":false,"required":["name","parts"],"properties":{
        "name":{"type":"string","minLength":1,"maxLength":80},
        "parts":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"object","additionalProperties":false,
            "required":["id","name","shape","position","rotation","scale","color","metallic","roughness","vertices","faces","bevel","depth","repeat"],"properties":{
                "id":{"anyOf":[{"type":"null"},{"type":"string","pattern":"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$"}]},
                "name":{"type":"string","minLength":1,"maxLength":80},
                "shape":{"type":"string","enum":["box","sphere","cylinder","cone","torus","mesh","tube","lathe","extrude"]},
                "position":vector(-50.,50.),"rotation":vector(-360.,360.),"scale":vector(0.02,50.),
                "color":{"type":"array","minItems":4,"maxItems":4,"items":{"type":"number","minimum":0,"maximum":1}},
                "metallic":{"type":"number","minimum":0,"maximum":1},"roughness":{"type":"number","minimum":0,"maximum":1},
                "vertices":{"anyOf":[{"type":"null"},{"type":"array","minItems":2,"maxItems":2048,"items":vector(-50.,50.)}]},
                "faces":{"anyOf":[{"type":"null"},{"type":"array","minItems":1,"maxItems":4096,"items":{"type":"array","minItems":3,"maxItems":64,"items":{"type":"integer","minimum":0,"maximum":2047}}}]},
                "bevel":{"anyOf":[{"type":"null"},{"type":"number","minimum":0,"maximum":1}]},
                "depth":{"anyOf":[{"type":"null"},{"type":"number","minimum":0.001,"maximum":50}]},
                "repeat":{"anyOf":[{"type":"null"},{"type":"object","additionalProperties":false,"required":["count","offset"],"properties":{
                    "count":{"type":"integer","minimum":1,"maximum":32},"offset":vector(-50.,50.)
                }}]}
            }}}
    }})
}

pub(crate) fn validate_model_spec(model: &BlenderModelSpec) -> Result<(), String> {
    let name = |value: &str| {
        !value.trim().is_empty()
            && value.chars().count() <= 80
            && !value.chars().any(char::is_control)
    };
    let bounded =
        |value: f64, min: f64, max: f64| value.is_finite() && (min..=max).contains(&value);
    if !name(&model.name) || model.parts.is_empty() || model.parts.len() > 64 {
        return Err("モデル名と1〜64個のパーツを指定してください".into());
    }
    let mut ids = std::collections::HashSet::new();
    let mut instances = 0;
    for (index, part) in model.parts.iter().enumerate() {
        if !name(&part.name) {
            return Err(format!("parts[{index}].name: 1〜80文字の名前を指定し、制御文字を除いてください"));
        }
        let label = format!("parts[{index}]（{}）", part.name);
        if let Some(id) = &part.id {
            let valid = (1..=64).contains(&id.len())
                && id.bytes().next().is_some_and(|c| c.is_ascii_alphanumeric())
                && id.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'));
            if !valid {
                return Err(format!("{label}.id: 英数字で始まる1〜64文字の英数字・_・-を指定してください"));
            }
            if !ids.insert(id) {
                return Err(format!("{label}.id: {id}が重複しています。パーツごとに一意のIDを指定してください"));
            }
        }
        let label = part.id.as_ref().map_or(label.clone(), |id| format!("{label} id={id}"));
        let error = |field: &str, detail: &str| format!("{label}.{field}: {detail}");
        if !matches!(part.shape.as_str(), "box" | "sphere" | "cylinder" | "cone" | "torus" | "mesh" | "tube" | "lathe" | "extrude") {
            return Err(error("shape", "対応する形状を指定してください"));
        }
        for (field, values, min, max) in [
            ("position", part.position.as_slice(), -50., 50.),
            ("rotation", part.rotation.as_slice(), -360., 360.),
            ("scale", part.scale.as_slice(), 0.02, 50.),
            ("color", part.color.as_slice(), 0., 1.),
        ] {
            if values.iter().any(|v| !bounded(*v, min, max)) {
                return Err(error(field, &format!("有限の{min}〜{max}の値を指定してください")));
            }
        }
        for (field, value) in [("metallic", part.metallic), ("roughness", part.roughness)] {
            if !bounded(value, 0., 1.) {
                return Err(error(field, "有限の0〜1の値を指定してください"));
            }
        }
        if part.bevel.is_some_and(|v| !bounded(v, 0., 1.)) {
            return Err(error("bevel", "有限の0〜1mの値を指定してください"));
        }
        let count = if let Some(repeat) = &part.repeat {
            if !(1..=32).contains(&repeat.count) {
                return Err(error("repeat.count", "1〜32の整数を指定してください"));
            }
            if repeat.offset.iter().any(|v| !bounded(*v, -50., 50.)) {
                return Err(error("repeat.offset", "各軸に有限の-50〜50mの値を指定してください"));
            }
            for axis in 0..3 {
                let last = part.position[axis] + (repeat.count - 1) as f64 * repeat.offset[axis];
                if !bounded(last, -50., 50.) {
                    return Err(error("repeat.offset", &format!("展開後のposition[{axis}]={last}mが-50〜50mを超えています")));
                }
            }
            repeat.count
        } else { 1 };
        instances += count;
        if instances > 256 {
            return Err(error("repeat.count", "モデル全体の展開後のパーツ数を256個以内にしてください"));
        }
        if part.shape != "extrude" && part.depth.is_some() {
            return Err(error("depth", "depthはextrudeだけに指定し、他の形状ではnullにしてください"));
        }
        if part.shape == "mesh" {
            let (Some(vertices), Some(faces)) = (&part.vertices, &part.faces) else {
                return Err(error("vertices/faces", "meshには頂点と面を指定してください"));
            };
            if !(3..=2048).contains(&vertices.len()) || vertices.iter().flatten().any(|v| !bounded(*v, -50., 50.)) {
                return Err(error("vertices", "meshには-50〜50mの頂点を3〜2048個指定してください"));
            }
            if !(1..=4096).contains(&faces.len()) || faces.iter().any(|face| {
                    !(3..=64).contains(&face.len())
                        || face.iter().any(|index| *index >= vertices.len())
                })
            {
                return Err(error("faces", &format!("1〜4096個の面を指定し、各面は3〜64個の頂点番号（0〜{}）で構成してください", vertices.len() - 1)));
            }
        } else if matches!(part.shape.as_str(), "tube" | "lathe") {
            let Some(vertices) = &part.vertices else { return Err(error("vertices", "曲線または回転面の断面を指定してください")); };
            if !(2..=128).contains(&vertices.len()) || vertices.iter().flatten().any(|v| !bounded(*v, -50., 50.)) {
                return Err(error("vertices", "-50〜50mの点を2〜128個指定してください"));
            }
            if part.faces.is_some() { return Err(error("faces", "tube/latheではnullにしてください")); }
            if part.shape == "tube" && !part.bevel.is_some_and(|v| bounded(v, 0.001, 1.)) {
                return Err(error("bevel", "tubeの半径を0.001〜1mで指定してください"));
            }
            if part.shape == "lathe" && vertices.iter().any(|v| v[0] < 0. || v[2] != 0.) {
                return Err(error("vertices", "latheの点は[0以上の半径, 高さ, 0]で指定してください"));
            }
        } else if part.shape == "extrude" {
            if !part.depth.is_some_and(|v| bounded(v, 0.001, 50.)) {
                return Err(error("depth", "押し出す厚みを0.001〜50mで指定してください"));
            }
            let Some(vertices) = &part.vertices else { return Err(error("vertices", "押し出す輪郭を指定してください")); };
            if !(3..=128).contains(&vertices.len()) || vertices.iter().flatten().any(|v| !bounded(*v, -50., 50.)) || vertices.iter().any(|v| v[2] != 0.) {
                return Err(error("vertices", "輪郭は3〜128個の[x,y,0]で指定し、各値を-50〜50mにしてください"));
            }
            if part.faces.is_some() { return Err(error("faces", "extrudeではnullにしてください")); }
            if !simple_extrude_profile(vertices) {
                return Err(error("vertices", "輪郭の重複点・自己交差・面積0を除いてください。閉じる始点の再記載は不要です"));
            }
        } else if part.vertices.is_some() || part.faces.is_some() {
            return Err(error("vertices/faces", "この形状ではnullにしてください"));
        }
    }
    Ok(())
}

/// Closed simple XY polygon, with its closing edge implied rather than repeated.
fn simple_extrude_profile(vertices: &[[f64; 3]]) -> bool {
    let epsilon = 1e-10;
    let cross = |a: &[f64; 3], b: &[f64; 3], c: &[f64; 3]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let on = |a: &[f64; 3], b: &[f64; 3], p: &[f64; 3]| {
        p[0] >= a[0].min(b[0]) - epsilon && p[0] <= a[0].max(b[0]) + epsilon
            && p[1] >= a[1].min(b[1]) - epsilon && p[1] <= a[1].max(b[1]) + epsilon
    };
    let mut area = 0.;
    for i in 0..vertices.len() {
        let a = &vertices[i];
        let b = &vertices[(i + 1) % vertices.len()];
        area += a[0] * b[1] - b[0] * a[1];
        for j in i + 1..vertices.len() {
            let c = &vertices[j];
            if (a[0] - c[0]).abs() <= epsilon && (a[1] - c[1]).abs() <= epsilon { return false; }
            if j == i + 1 || (i == 0 && j == vertices.len() - 1) { continue; }
            let d = &vertices[(j + 1) % vertices.len()];
            let (ac, ad, ca, cb) = (cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b));
            if (ac * ad < 0. && ca * cb < 0.)
                || (ac.abs() <= epsilon && on(a, b, c)) || (ad.abs() <= epsilon && on(a, b, d))
                || (ca.abs() <= epsilon && on(c, d, a)) || (cb.abs() <= epsilon && on(c, d, b)) {
                return false;
            }
        }
    }
    area.abs() > epsilon
}

fn is_link(metadata: &Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}
fn trusted_executable(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    let metadata = fs::symlink_metadata(path).ok()?;
    if is_link(&metadata) || !metadata.is_file() {
        return None;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return None;
        }
    }
    let resolved = path.canonicalize().ok()?;
    let metadata = fs::symlink_metadata(&resolved).ok()?;
    if is_link(&metadata) || !metadata.is_file() {
        return None;
    }
    Some(resolved)
}
fn installed_candidates() -> Vec<PathBuf> {
    let mut result = Vec::new();
    #[cfg(windows)]
    for variable in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            let directory = PathBuf::from(root).join("Blender Foundation");
            if let Ok(entries) = fs::read_dir(directory) {
                for entry in entries.flatten() {
                    if entry.file_name().to_string_lossy().starts_with("Blender ") {
                        result.push(entry.path().join("blender.exe"));
                    }
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        result.push(PathBuf::from(
            "/Applications/Blender.app/Contents/MacOS/Blender",
        ));
        if let Some(home) = dirs::home_dir() {
            result.push(home.join("Applications/Blender.app/Contents/MacOS/Blender"));
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path).filter(|directory| directory.is_absolute()) {
            result.push(directory.join(if cfg!(windows) {
                "blender.exe"
            } else {
                "blender"
            }));
        }
    }
    let mut seen = std::collections::HashSet::new();
    result
        .into_iter()
        .filter_map(|path| trusted_executable(&path))
        .filter(|path| seen.insert(path.clone()))
        .collect()
}
fn blender_path(path: &Path) -> PathBuf {
    // Rust canonical paths use Win32's verbatim prefix. Blender's file API
    // treats that prefix as a UNC path and its glTF exporter duplicates it.
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        if let Some(unc) = value.strip_prefix("\\\\?\\UNC\\") {
            return PathBuf::from(format!("\\\\{unc}"));
        }
        if let Some(value) = value.strip_prefix("\\\\?\\") {
            return PathBuf::from(value);
        }
    }
    path.to_path_buf()
}
fn parse_version(output: &[u8]) -> Option<semver::Version> {
    String::from_utf8_lossy(output).lines().find_map(|line| {
        let version = line.strip_prefix("Blender ")?.split_whitespace().next()?;
        semver::Version::parse(version).ok()
    })
}
async fn find_blender() -> Option<(PathBuf, semver::Version)> {
    let mut installed = Vec::new();
    for path in installed_candidates() {
        let result = tokio::time::timeout(
            Duration::from_secs(5),
            hidden_command(&path)
                .arg("--version")
                .stderr(Stdio::null())
                .output(),
        )
        .await;
        if let Ok(Ok(output)) = result {
            if output.status.success() {
                if let Some(version) = parse_version(&output.stdout) {
                    installed.push((path, version));
                }
            }
        }
    }
    installed.into_iter().max_by(|a, b| a.1.cmp(&b.1))
}
#[tauri::command]
pub(crate) async fn get_blender_status() -> BlenderStatus {
    match find_blender().await {
        Some((_, version)) => BlenderStatus {
            available: true,
            version: Some(version.to_string()),
        },
        None => BlenderStatus {
            available: false,
            version: None,
        },
    }
}

fn project_root(project_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(project_path);
    if !path.is_absolute()
        || project_path.len() > 4096
        || project_path.chars().any(char::is_control)
    {
        return Err("モデルの保存先に現在のプロジェクトを指定してください".into());
    }
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "プロジェクトの保存先を確認できません")?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err("プロジェクトの保存先が通常のフォルダーではありません".into());
    }
    let root = super::canonical_project_root(project_path)?;
    super::ensure_no_symlink_ancestors(&root, Path::new(super::VISUAL_PROJECT_MANIFEST))?;
    let manifest = root.join(super::VISUAL_PROJECT_MANIFEST);
    let metadata =
        fs::symlink_metadata(&manifest).map_err(|_| "ビジュアルプロジェクトを開いてください")?;
    if is_link(&metadata) || !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err("ビジュアルプロジェクトの保存先を確認できません".into());
    }
    super::parse_visual_project_manifest(
        &fs::read_to_string(manifest).map_err(|error| error.to_string())?,
    )?;
    Ok(root)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())
}
fn ensure_no_link_ancestors(root: &Path, relative: &Path) -> Result<(), String> {
    super::ensure_no_symlink_ancestors(root, relative)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if is_link(&metadata) => {
                return Err("モデルの作業フォルダーにリンクは使用できません".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
fn task_directory(root: &Path) -> Result<PathBuf, String> {
    let cache = Path::new(CACHE);
    ensure_no_link_ancestors(root, cache)?;
    fs::create_dir_all(root.join(cache)).map_err(|error| error.to_string())?;
    ensure_no_link_ancestors(root, cache)?;
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| "モデルの作業フォルダーを準備できません")?;
    let nonce: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    let directory = root.join(cache).join(format!("{TASK_PREFIX}{nonce}"));
    fs::create_dir(&directory).map_err(|error| error.to_string())?;
    if let Err(error) = write_new(&directory.join("owner.json"), OWNER.as_bytes()) {
        let _ = fs::remove_dir(&directory);
        return Err(error);
    }
    Ok(directory)
}
fn cleanup_task(root: &Path, directory: &Path) -> Result<(), String> {
    let relative = directory
        .strip_prefix(root)
        .map_err(|_| "モデルの作業フォルダーが保存先の外にあります")?;
    ensure_no_link_ancestors(root, relative)?;
    let canonical = directory
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let cache = root
        .join(CACHE)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let suffix = name.strip_prefix(TASK_PREFIX).unwrap_or_default();
    if canonical.parent() != Some(cache.as_path())
        || !canonical.starts_with(root)
        || suffix.len() != 32
        || !suffix.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("モデルの作業フォルダーの所有者を確認できません".into());
    }
    let owner = canonical.join("owner.json");
    let metadata = fs::symlink_metadata(&owner).map_err(|error| error.to_string())?;
    if is_link(&metadata)
        || !metadata.is_file()
        || fs::read_to_string(owner).map_err(|error| error.to_string())? != OWNER
    {
        return Err("モデルの作業フォルダーの所有者を確認できません".into());
    }
    // remove_dir_all never follows directory symlinks, and the resolved root
    // above is exactly the nonce directory created by this request.
    super::retry_transient_io(|| fs::remove_dir_all(&canonical)).map_err(|error| error.to_string())
}
fn model_filename(name: &str) -> String {
    let filtered: String = name
        .chars()
        .filter(|value| value.is_alphanumeric() || matches!(value, '-' | '_'))
        .take(48)
        .collect();
    format!(
        "blender-{}.glb",
        if filtered.is_empty() {
            "model"
        } else {
            &filtered
        }
    )
}
fn glb_metadata(path: &Path, directory: &Path) -> Result<u64, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "BlenderからGLBが出力されませんでした")?;
    if is_link(&metadata) || !metadata.is_file() || metadata.len() < 20 {
        return Err("Blenderが出力したモデルの形式・サイズを確認できませんでした".into());
    }
    if path
        .canonicalize()
        .map_err(|error| error.to_string())?
        .parent()
        != Some(
            directory
                .canonicalize()
                .map_err(|error| error.to_string())?
                .as_path(),
        )
    {
        return Err("モデルの出力先が作業フォルダーの外にあります".into());
    }
    let mut header = [0u8; 20];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|error| error.to_string())?;
    let json_length = u32::from_le_bytes(header[12..16].try_into().unwrap()) as u64;
    if &header[..4] != b"glTF"
        || u32::from_le_bytes(header[4..8].try_into().unwrap()) != 2
        || u32::from_le_bytes(header[8..12].try_into().unwrap()) as u64 != metadata.len()
        || &header[16..20] != b"JSON"
        || json_length < 2
        || json_length > metadata.len() - 20
    {
        return Err("Blenderが出力したGLBの署名が一致しません".into());
    }
    Ok(metadata.len())
}
async fn wait_model_process(child: &mut tokio::process::Child, control: Option<&ModelGenerationControl>) -> Result<std::process::ExitStatus, String> {
    let result = tokio::select! {
        biased;
        _ = cancelled(control) => None,
        result = tokio::time::timeout(MODEL_TIMEOUT, child.wait()) => Some(result),
    };
    match result {
        Some(Ok(status)) => status.map_err(|_| "Blenderの終了を確認できませんでした".into()),
        stopped => {
            // Do not return a cancelled invoke until this owned process has
            // exited and released its output files. Other Blender apps stay intact.
            if child.try_wait().map_err(|_| "Blenderの停止状態を確認できませんでした")?.is_none() {
                child.start_kill().map_err(|_| "Blenderを停止できませんでした")?;
            }
            tokio::time::timeout(Duration::from_secs(5), child.wait()).await
                .map_err(|_| "Blenderの停止を確認できませんでした")?
                .map_err(|_| "Blenderの終了を確認できませんでした")?;
            Err(if stopped.is_none() { MODEL_CANCELLED.into() } else { "Blenderでのモデル作成が時間内に完了しませんでした。パーツを減らして再試行してください".into() })
        }
    }
}

async fn run_model(
    executable: &Path,
    version: &semver::Version,
    directory: &Path,
    model: &BlenderModelSpec,
    control: Option<&ModelGenerationControl>,
    preview_callback: Option<Arc<dyn Fn(serde_json::Value) + Send + Sync>>,
) -> Result<BlenderModelResult, String> {
    check_generation(control)?;
    let source = directory.join("model.json");
    let runner = directory.join("runner.py");
    let file_name = model_filename(&model.name);
    let glb = directory.join(&file_name);
    let blend = directory.join("model.blend");
    write_new(
        &source,
        &serde_json::to_vec(model).map_err(|error| error.to_string())?,
    )?;
    write_new(&runner, RUNNER.as_bytes())?;
    let external_directory = blender_path(directory);
    if external_directory
        .canonicalize()
        .map_err(|error| error.to_string())?
        != directory
            .canonicalize()
            .map_err(|error| error.to_string())?
    {
        return Err("Blenderが扱えるモデルの作業フォルダーを確認できませんでした".into());
    }
    let stdout = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join("blender.stdout.log"))
        .map_err(|error| error.to_string())?;
    let stderr = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join("blender.stderr.log"))
        .map_err(|error| error.to_string())?;
    let mut command = hidden_command(executable);
    command
        .current_dir(directory)
        .arg("--background")
        .arg("--factory-startup")
        .arg("--disable-autoexec");
    if version >= &semver::Version::new(4, 2, 0) {
        command.arg("--offline-mode");
    }
    command
        .arg("--python-exit-code")
        .arg("1")
        .arg("--python")
        .arg(blender_path(&runner))
        .arg("--")
        .arg(blender_path(&source))
        .arg(blender_path(&glb))
        .arg(blender_path(&blend))
        .env("BLENDER_USER_CONFIG", directory.join("config"))
        .env("BLENDER_USER_SCRIPTS", directory.join("scripts"))
        .env("BLENDER_USER_DATAFILES", directory.join("datafiles"))
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONSAFEPATH", "1")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    if preview_callback.is_some() { command.arg("--progress-previews"); }
    check_generation(control)?;
    let mut child = command
        .spawn()
        .map_err(|_| "Blenderをバックグラウンドで起動できませんでした")?;
    let mut previews = preview_callback.map(|callback| preview::PreviewStream::new(callback, model.name.clone()));
    let status = {
        let waiting = wait_model_process(&mut child, control);
        tokio::pin!(waiting);
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            tokio::select! {
                biased;
                status = &mut waiting => break status?,
                _ = interval.tick(), if previews.is_some() => { if let Some(previews) = &mut previews { previews.poll(directory); } }
            }
        }
    };
    check_generation(control)?;
    if let Some(previews) = &mut previews { previews.poll(directory); }
    if !status.success() {
        let detail = fs::read_to_string(directory.join("blender.stderr.log")).unwrap_or_default();
        let detail: String = detail
            .chars()
            .rev()
            .take(2000)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!(
            "Blenderでモデルを作成できませんでした{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {}", detail.trim())
            }
        ));
    }
    let byte_length = glb_metadata(&glb, directory)?;
    let metadata =
        fs::symlink_metadata(&blend).map_err(|_| "Blenderの編集用データを保存できませんでした")?;
    if is_link(&metadata) || !metadata.is_file() || metadata.len() == 0 {
        return Err("Blenderの編集用データを保存できませんでした".into());
    }
    Ok(BlenderModelResult {
        path: blender_path(&glb).to_string_lossy().to_string(),
        file_name,
        byte_length,
    })
}
#[tauri::command]
pub(crate) async fn create_blender_model(
    project_path: String,
    model: BlenderModelSpec,
    generation_id: Option<String>,
) -> Result<BlenderModelResult, String> {
    validate_model_spec(&model)?;
    let preview_callback = preview::callback_for(generation_id.as_deref());
    let generation = register_generation(generation_id)?;
    let control = generation.as_ref().map(|generation| generation.control.as_ref());
    check_generation(control)?;
    let root = project_root(&project_path)?;
    let (executable, version) = tokio::select! {
        biased;
        _ = cancelled(control) => return Err(MODEL_CANCELLED.into()),
        result = find_blender() => result.ok_or("Blenderが見つかりませんでした。Blenderをインストールして再試行してください")?,
    };
    check_generation(control)?;
    let directory = task_directory(&root)?;
    let result = run_model(&executable, &version, &directory, &model, control, preview_callback).await;
    if result.is_err() {
        let _ = cleanup_task(&root, &directory);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let mut nonce = [0u8; 16];
            getrandom::fill(&mut nonce).unwrap();
            let nonce: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
            let root = std::env::temp_dir()
                .canonicalize()
                .unwrap()
                .join(format!("xrift-blender-test-{nonce}"));
            fs::create_dir(&root).unwrap();
            write_new(&root.join("fixture-owner"), b"xrift-blender-model-tests").unwrap();
            write_new(&root.join(super::super::VISUAL_PROJECT_MANIFEST), json!({
                "schemaVersion":"0.1.0","projectId":"blender-test-only","projectKind":"world",
                "metadata":{"name":"Blender fixture","title":"Blender fixture","description":""},
                "entrySceneId":"scene","scenePaths":{"scene":"scenes/main.json"},"assetManifestPath":"assets.json"
            }).to_string().as_bytes()).unwrap();
            Self(root)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let Ok(root) = self.0.canonicalize() else {
                return;
            };
            let temp = std::env::temp_dir().canonicalize().unwrap();
            if root.parent() == Some(temp.as_path())
                && root
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("xrift-blender-test-")
                && fs::read(root.join("fixture-owner")).ok().as_deref()
                    == Some(b"xrift-blender-model-tests")
                && !is_link(&fs::symlink_metadata(&root).unwrap())
            {
                let _ = super::super::retry_transient_io(|| fs::remove_dir_all(root.clone()));
            }
        }
    }
    fn part(shape: &str) -> BlenderModelPart {
        BlenderModelPart {
            id: None,
            name: format!("{shape} part"),
            shape: shape.into(),
            position: [0., 0., 0.],
            rotation: [0., 0., 0.],
            scale: [1., 1., 1.],
            color: [0.15, 0.5, 0.85, 1.],
            metallic: 0.35,
            roughness: 0.6,
            vertices: None,
            faces: None,
            bevel: None,
            depth: None,
            repeat: None,
        }
    }
    fn model() -> BlenderModelSpec {
        BlenderModelSpec {
            name: "Isolated model".into(),
            parts: vec![part("box")],
        }
    }
    fn mesh_part() -> BlenderModelPart {
        BlenderModelPart {
            name: "Axis Probe".into(),
            shape: "mesh".into(),
            position: [2., 3., 4.],
            rotation: [10., 20., 30.],
            scale: [1., 2., 3.],
            vertices: Some(vec![[0., 0., 0.], [1., 0., 0.], [0., 2., 3.]]),
            faces: Some(vec![vec![0, 1, 2]]),
            ..part("mesh")
        }
    }
    #[test]
    fn data_contract_accepts_null_optionals_and_rejects_source_or_invalid_geometry() {
        let mut value = serde_json::to_value(model()).unwrap();
        let spec: BlenderModelSpec = serde_json::from_value(value.clone()).unwrap();
        validate_model_spec(&spec).unwrap();
        value["python"] = json!("arbitrary source");
        assert!(serde_json::from_value::<BlenderModelSpec>(value).is_err());
        let valid = BlenderModelSpec {
            parts: vec![mesh_part()],
            ..model()
        };
        validate_model_spec(&valid).unwrap();
        for change in [
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].faces = Some(vec![vec![0, 1, 3]]);
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].vertices = None;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].vertices = Some(vec![[0., 0., 0.]; 2049]);
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].faces = Some(vec![vec![0, 1, 2]; 4097]);
            },
        ] {
            let mut spec = valid.clone();
            change(&mut spec);
            assert!(validate_model_spec(&spec).is_err());
        }
        let mut non_mesh = model();
        non_mesh.parts[0].vertices = mesh_part().vertices;
        assert!(validate_model_spec(&non_mesh).is_err());
        let mut negative_index = serde_json::to_value(valid).unwrap();
        negative_index["parts"][0]["faces"] = json!([[-1, 1, 2]]);
        assert!(serde_json::from_value::<BlenderModelSpec>(negative_index).is_err());
    }
    #[test]
    fn transform_and_material_values_obey_authoring_bounds() {
        for change in [
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].position[0] = 50.01;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].rotation[0] = 361.;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].scale[0] = 0.;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].color[3] = 1.01;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].metallic = f64::NAN;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].roughness = f64::INFINITY;
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts[0].bevel = Some(-0.01);
            },
            |spec: &mut BlenderModelSpec| {
                spec.parts = vec![part("box"); 65];
            },
        ] {
            let mut spec = model();
            change(&mut spec);
            assert!(validate_model_spec(&spec).is_err());
        }
        let mut spec = model();
        spec.name = "name\ncode".into();
        assert!(validate_model_spec(&spec).is_err());
        assert_eq!(model_filename("../../CON:日本語"), "blender-CON日本語.glb");
    }
    #[test]
    fn stable_part_ids_preserve_legacy_data_and_reject_invalid_or_duplicate_ids() {
        let mut value = serde_json::to_value(model()).unwrap();
        for key in ["id", "depth", "repeat"] {
            value["parts"][0].as_object_mut().unwrap().remove(key);
        }
        let legacy: BlenderModelSpec = serde_json::from_value(value).unwrap();
        validate_model_spec(&legacy).unwrap();
        let too_long = "a".repeat(65);
        for id in ["", "a.b", "_part", "日本語", "part\n", too_long.as_str()] {
            let mut spec = model();
            spec.parts[0].id = Some(id.into());
            let error = validate_model_spec(&spec).unwrap_err();
            assert!(error.contains("parts[0]") && error.contains(".id"), "{error}");
        }
        let mut spec = model();
        spec.parts[0].id = Some("seat-slats_1".into());
        validate_model_spec(&spec).unwrap();
        spec.parts.push(spec.parts[0].clone());
        assert!(validate_model_spec(&spec).unwrap_err().contains("seat-slats_1が重複"));
    }
    #[test]
    fn repeated_details_limit_instances_and_report_the_failing_parameter() {
        let mut spec = model();
        spec.parts[0].id = Some("slats".into());
        spec.parts[0].repeat = Some(BlenderModelRepeat { count: 32, offset: [0.1, 0., 0.] });
        spec.parts = vec![spec.parts[0].clone(); 8];
        for part in &mut spec.parts { part.id = None; }
        validate_model_spec(&spec).unwrap();
        spec.parts.push(spec.parts[0].clone());
        assert!(validate_model_spec(&spec).unwrap_err().contains("256"));
        for count in [0, 33] {
            let mut spec = model();
            spec.parts[0].id = Some("slats".into());
            spec.parts[0].repeat = Some(BlenderModelRepeat { count, offset: [0., 0., 0.] });
            let error = validate_model_spec(&spec).unwrap_err();
            assert!(error.contains("id=slats") && error.contains("repeat.count"), "{error}");
        }
        for offset in [[f64::NAN, 0., 0.], [51., 0., 0.], [2., 0., 0.]] {
            let mut spec = model();
            spec.parts[0].repeat = Some(BlenderModelRepeat { count: 32, offset });
            assert!(validate_model_spec(&spec).unwrap_err().contains("repeat.offset"));
        }
        let mut spec = model();
        spec.parts[0].position = [50., -50., 0.];
        spec.parts[0].repeat = Some(BlenderModelRepeat { count: 2, offset: [-50., 50., 0.] });
        validate_model_spec(&spec).unwrap();
    }
    fn extrude_part() -> BlenderModelPart {
        BlenderModelPart {
            id: Some("profile".into()),
            name: "Extruded side".into(),
            vertices: Some(vec![[0., 0., 0.], [1., 0., 0.], [1., 1., 0.], [0.5, 1., 0.], [0.5, 2., 0.], [0., 2., 0.]]),
            depth: Some(0.2),
            ..part("extrude")
        }
    }
    #[test]
    fn extrusion_accepts_simple_concave_profiles_and_rejects_bad_contours() {
        let valid = BlenderModelSpec { parts: vec![extrude_part()], ..model() };
        validate_model_spec(&valid).unwrap();
        let mut clockwise = valid.clone();
        clockwise.parts[0].vertices.as_mut().unwrap().reverse();
        validate_model_spec(&clockwise).unwrap();
        for vertices in [
            vec![[0., 0., 0.], [1., 0., 0.]],
            vec![[0., 0., 0.], [1., 0., 0.], [2., 0., 0.]],
            vec![[0., 0., 0.], [1., 1., 0.], [0., 1., 0.], [1., 0., 0.]],
            vec![[0., 0., 0.], [1., 0., 0.], [0., 1., 0.], [0., 0., 0.]],
            vec![[0., 0., 0.], [1., 0., 0.], [0., 1., 0.001]],
        ] {
            let mut spec = valid.clone();
            spec.parts[0].vertices = Some(vertices);
            let error = validate_model_spec(&spec).unwrap_err();
            assert!(error.contains("id=profile") && error.contains("vertices"), "{error}");
        }
        for depth in [None, Some(0.), Some(50.01), Some(f64::INFINITY)] {
            let mut spec = valid.clone();
            spec.parts[0].depth = depth;
            assert!(validate_model_spec(&spec).unwrap_err().contains("depth"));
        }
        let mut spec = valid.clone();
        spec.parts[0].faces = Some(vec![vec![0, 1, 2]]);
        assert!(validate_model_spec(&spec).unwrap_err().contains("faces"));
        let mut spec = model();
        spec.parts[0].depth = Some(1.);
        assert!(validate_model_spec(&spec).unwrap_err().contains("depth"));
    }
    #[cfg(windows)]
    #[test]
    fn blender_cli_paths_preserve_drive_and_unc_without_verbatim_prefix() {
        assert_eq!(
            blender_path(Path::new(r"\\?\C:\work\日本語\model.glb")),
            PathBuf::from(r"C:\work\日本語\model.glb")
        );
        assert_eq!(
            blender_path(Path::new(r"\\?\UNC\server\share\model.glb")),
            PathBuf::from(r"\\server\share\model.glb")
        );
    }
    #[test]
    fn schema_is_self_contained_strict_and_matches_geometry_limits() {
        let schema = blender_model_schema();
        assert_eq!(schema["additionalProperties"], false);
        assert!(schema.get("$defs").is_none());
        let parts = &schema["properties"]["parts"];
        assert_eq!(parts["maxItems"], 64);
        let fields = &parts["items"]["properties"];
        assert_eq!(
            parts["items"]["required"].as_array().unwrap().len(),
            fields.as_object().unwrap().len()
        );
        assert_eq!(fields["vertices"]["anyOf"][1]["maxItems"], 2048);
        assert_eq!(fields["faces"]["anyOf"][1]["maxItems"], 4096);
        assert_eq!(fields["faces"]["anyOf"][1]["items"]["maxItems"], 64);
        assert_eq!(fields["repeat"]["anyOf"][1]["properties"]["count"]["maximum"], 32);
        assert_eq!(fields["depth"]["anyOf"][1]["minimum"], 0.001);
        assert!(fields["shape"]["enum"].as_array().unwrap().contains(&json!("extrude")));
    }
    #[test]
    fn project_and_cleanup_guards_preserve_existing_files() {
        let fixture = Fixture::new();
        let root = project_root(fixture.0.to_str().unwrap()).unwrap();
        let first = task_directory(&root).unwrap();
        let second = task_directory(&root).unwrap();
        assert_ne!(first, second);
        write_new(&first.join("model.blend"), b"existing fixture").unwrap();
        assert!(write_new(&first.join("model.blend"), b"replacement").is_err());
        assert_eq!(
            fs::read(first.join("model.blend")).unwrap(),
            b"existing fixture"
        );
        assert!(cleanup_task(&root, &root).is_err());
        fs::write(second.join("owner.json"), "someone else").unwrap();
        assert!(cleanup_task(&root, &second).is_err());
        assert!(second.exists());
        cleanup_task(&root, &first).unwrap();
        assert!(!first.exists());
        assert!(project_root("relative-project").is_err());
        let foreign = root.join("unrecognized");
        fs::create_dir(&foreign).unwrap();
        assert!(project_root(foreign.to_str().unwrap()).is_err());
    }
    #[test]
    fn cache_links_are_rejected_even_when_they_point_inside_the_project() {
        let fixture = Fixture::new();
        let target = fixture.0.join("existing-data");
        fs::create_dir(&target).unwrap();
        write_new(&target.join("keep.txt"), b"existing data").unwrap();
        let link = fixture.0.join(".cache");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &link).unwrap();
        #[cfg(windows)]
        {
            let output = crate::background_process::command("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:XRIFT_BLENDER_TEST_LINK -Target $env:XRIFT_BLENDER_TEST_TARGET -ErrorAction Stop | Out-Null"])
                .env("XRIFT_BLENDER_TEST_LINK", blender_path(&link))
                .env("XRIFT_BLENDER_TEST_TARGET", blender_path(&target))
                .output().unwrap();
            assert!(
                output.status.success(),
                "Isolated junction fixture failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        assert!(is_link(&fs::symlink_metadata(&link).unwrap()));
        assert!(task_directory(&fixture.0).is_err());
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"existing data");
        assert!(!target.join("xrift-studio-blender").exists());
    }
    #[test]
    fn glb_container_checks_signature_declared_length_and_output_boundary() {
        let fixture = Fixture::new();
        let directory = task_directory(&fixture.0).unwrap();
        let path = directory.join("fixture.glb");
        let mut bytes = b"glTF".to_vec();
        bytes.extend(2u32.to_le_bytes());
        bytes.extend(24u32.to_le_bytes());
        bytes.extend(4u32.to_le_bytes());
        bytes.extend(b"JSON{}  ");
        write_new(&path, &bytes).unwrap();
        assert_eq!(glb_metadata(&path, &directory).unwrap(), 24);
        assert!(glb_metadata(&path, &fixture.0).is_err());
        bytes[8] = 25;
        fs::write(&path, &bytes).unwrap();
        assert!(glb_metadata(&path, &directory).is_err());
        bytes[8] = 24;
        bytes[0] = b'x';
        fs::write(&path, &bytes).unwrap();
        assert!(glb_metadata(&path, &directory).is_err());
    }
    #[tokio::test]
    async fn cancelled_late_blender_invoke_never_creates_files_or_starts_blender() {
        let fixture = Fixture::new();
        let id = format!("cancel-before-{}", fixture.0.file_name().unwrap().to_str().unwrap());
        let state = crate::chatgpt::ChatgptState::default();
        assert_eq!(serde_json::to_value(crate::chatgpt::cancel_generation(&state, id.clone()).unwrap()).unwrap()["cancelled"], false);
        let result = create_blender_model(fixture.0.to_string_lossy().to_string(), model(), Some(id)).await;
        assert!(result.unwrap_err().contains("停止しました"));
        assert!(!fixture.0.join(CACHE).exists(), "A late cancelled IPC must not create even an isolated output directory");
        assert!(register_generation(None).unwrap().is_none(), "Ordinary MCP modeling stays outside generation cancellation");
    }

    #[test]
    fn blender_controls_are_id_scoped_and_all_same_request_jobs_are_cancelled() {
        let fixture = Fixture::new();
        let id = format!("shared-{}", fixture.0.file_name().unwrap().to_str().unwrap());
        let other = format!("other-{}", fixture.0.file_name().unwrap().to_str().unwrap());
        let first = register_generation(Some(id.clone())).unwrap().unwrap();
        let second = register_generation(Some(id.clone())).unwrap().unwrap();
        let unrelated = register_generation(Some(other)).unwrap().unwrap();
        assert!(cancel_generation(&id));
        assert!(first.control.check().is_err()); assert!(second.control.check().is_err());
        unrelated.control.check().unwrap();
        drop(first); drop(second);
        assert!(register_generation(Some(id)).is_err(), "A late queued job cannot restart a stopped request");
        assert!(register_generation(Some("invalid id".into())).is_err());
    }

    fn sleeping_owned_process() -> tokio::process::Child {
        #[cfg(windows)]
        let mut command = {
            let root = std::env::var_os("SystemRoot").unwrap();
            let executable = PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
            let mut command = hidden_command(&executable);
            command.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 60"]);
            command
        };
        #[cfg(not(windows))]
        let mut command = { let mut command = hidden_command(Path::new("/bin/sh")); command.args(["-c", "exec sleep 60"]); command };
        command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap()
    }

    #[tokio::test]
    async fn stop_without_an_active_chatgpt_lease_kills_and_reaps_the_owned_process() {
        let fixture = Fixture::new();
        let id = format!("live-process-{}", fixture.0.file_name().unwrap().to_str().unwrap());
        let generation = register_generation(Some(id.clone())).unwrap().unwrap();
        let state = crate::chatgpt::ChatgptState::default();
        let mut child = sleeping_owned_process();
        let stop = async {
            tokio::time::sleep(Duration::from_millis(30)).await;
            let result = crate::chatgpt::cancel_generation(&state, id).unwrap();
            assert_eq!(serde_json::to_value(result).unwrap()["cancelled"], true);
        };
        let (result, _) = tokio::time::timeout(Duration::from_secs(5), async {
            tokio::join!(wait_model_process(&mut child, Some(&generation.control)), stop)
        }).await.expect("Stop must not wait for the 180-second Blender deadline");
        assert!(result.unwrap_err().contains("停止しました"));
        assert!(child.try_wait().unwrap().is_some(), "The owned child must have exited before returning cancellation");
    }

    #[tokio::test]
    async fn command_failure_does_not_report_a_model_or_replace_files() {
        let fixture = Fixture::new();
        let directory = task_directory(&fixture.0).unwrap();
        let result = run_model(
            &fixture.0.join("no-such-blender"),
            &semver::Version::new(5, 1, 0),
            &directory,
            &model(),
            None,
            None,
        )
        .await;
        assert!(result.is_err());
        assert!(!directory.join("model.blend").exists());
        assert!(!directory.join(model_filename(&model().name)).exists());
        cleanup_task(&fixture.0, &directory).unwrap();
        assert!(!directory.exists());
    }
    fn glb_json(path: &Path) -> Value {
        let bytes = fs::read(path).unwrap();
        let length = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
        serde_json::from_slice(&bytes[20..20 + length]).unwrap()
    }
    fn assert_vector(actual: &Value, expected: &[f64]) {
        let actual = actual.as_array().unwrap();
        assert_eq!(actual.len(), expected.len());
        for (actual, expected) in actual.iter().zip(expected) {
            assert!(
                (actual.as_f64().unwrap() - expected).abs() < 0.00001,
                "{actual} != {expected}"
            );
        }
    }
    fn cache_quality_fixture(source: &Path, name: &str) {
        assert!(matches!(name, "fixture-quality-before" | "fixture-quality-after"));
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().canonicalize().unwrap();
        let relative = Path::new("node_modules/.cache/chatgpt-blender-model");
        for extension in ["glb", "json"] {
            super::super::ensure_no_symlink_ancestors(&workspace, &relative.join(format!("{name}.{extension}"))).unwrap();
        }
        let directory = blender_path(&workspace.join(relative));
        fs::create_dir_all(&directory).unwrap();
        let target = directory.join(format!("{name}.glb"));
        if target.exists() {
            let existing = glb_json(&target);
            let generated = glb_json(source);
            for field in ["nodes", "materials", "scenes"] {
                assert_eq!(existing[field], generated[field], "Cached quality fixture {name}.{field} differs");
            }
        } else {
            write_new(&target, &fs::read(source).unwrap()).unwrap();
        }
        let source = fs::read(source.parent().unwrap().join("model.json")).unwrap();
        let target = directory.join(format!("{name}.json"));
        if target.exists() {
            assert_eq!(fs::read(&target).unwrap(), source, "Cached quality source {name} differs");
        } else {
            write_new(&target, &source).unwrap();
        }
    }
    #[tokio::test]
    async fn installed_blender_exports_two_real_quality_revisions_preserving_other_parts() {
        if std::env::var("XRIFT_TEST_BLENDER").as_deref() != Ok("1") { return; }
        let fixture = Fixture::new();
        let before = BlenderModelSpec { name: "Quality review chair".into(), parts: vec![
            BlenderModelPart { id: Some("backrest".into()), name: "Backrest".into(), position: [0., 0.8, -0.25],
                scale: [1.1, 0.25, 0.1], color: [0.5, 0.22, 0.08, 1.], ..part("box") },
            BlenderModelPart { id: Some("seat".into()), name: "Seat".into(), position: [0., 0.5, 0.],
                scale: [1.2, 0.1, 0.6], color: [0.4, 0.2, 0.1, 1.], ..part("box") },
            BlenderModelPart { id: Some("front-legs".into()), name: "Front legs".into(), position: [-0.45, 0.225, 0.2],
                scale: [0.08, 0.45, 0.08], color: [0.08, 0.08, 0.08, 1.],
                repeat: Some(BlenderModelRepeat { count: 2, offset: [0.9, 0., 0.] }), ..part("box") },
            BlenderModelPart { id: Some("rear-legs".into()), name: "Rear legs".into(), position: [-0.45, 0.225, -0.2],
                scale: [0.08, 0.45, 0.08], color: [0.08, 0.08, 0.08, 1.],
                repeat: Some(BlenderModelRepeat { count: 2, offset: [0.9, 0., 0.] }), ..part("box") },
        ] };
        let mut after = before.clone();
        after.parts[0].scale[1] = 0.6;
        after.parts[0].color = [0.08, 0.3, 0.8, 1.];
        assert_eq!(serde_json::to_value(&before.parts[1..]).unwrap(), serde_json::to_value(&after.parts[1..]).unwrap());
        let mut documents = Vec::new();
        let mut paths = Vec::new();
        for spec in [before, after] {
            validate_model_spec(&spec).unwrap();
            let result = create_blender_model(fixture.0.to_string_lossy().to_string(), spec, None).await.unwrap();
            let path = PathBuf::from(result.path);
            documents.push(glb_json(&path));
            paths.push(path);
        }
        assert_ne!(fs::read(&paths[0]).unwrap(), fs::read(&paths[1]).unwrap(), "A repaired source must export its actual changed geometry/Material");
        for (index, document) in documents.iter().enumerate() {
            assert_eq!(document["meshes"].as_array().unwrap().len(), 6);
            let node = document["nodes"].as_array().unwrap().iter().find(|node| node["extras"]["xriftPartId"] == "backrest").unwrap();
            assert_vector(&node["scale"], &[1.1, if index == 0 { 0.25 } else { 0.6 }, 0.1]);
            let primitive = &document["meshes"][node["mesh"].as_u64().unwrap() as usize]["primitives"][0];
            assert!(primitive["attributes"]["NORMAL"].is_number());
            assert!(primitive["attributes"]["TEXCOORD_0"].is_number());
            let material = &document["materials"][primitive["material"].as_u64().unwrap() as usize]["pbrMetallicRoughness"];
            assert_vector(&material["baseColorFactor"], if index == 0 { &[0.5, 0.22, 0.08, 1.] } else { &[0.08, 0.3, 0.8, 1.] });
        }
        for node in documents[0]["nodes"].as_array().unwrap().iter().filter(|node| node["extras"]["xriftPartId"].is_string() && node["extras"]["xriftPartId"] != "backrest") {
            let matching = documents[1]["nodes"].as_array().unwrap().iter().find(|other| other["name"] == node["name"]).unwrap();
            assert_eq!(node, matching, "Unchanged part {} must keep its transform and mesh binding", node["name"]);
        }
        if std::env::var_os("XRIFT_TEST_BLENDER_OUTPUT").is_some() {
            for (path, name) in paths.iter().zip(["fixture-quality-before", "fixture-quality-after"]) {
                cache_quality_fixture(path, name);
            }
        }
    }
    #[tokio::test]
    async fn installed_blender_exports_repeated_extrusions_with_stable_ids_and_studio_axes() {
        if std::env::var("XRIFT_TEST_BLENDER").as_deref() != Ok("1") { return; }
        let fixture = Fixture::new();
        let spec = BlenderModelSpec { name: "Extruded repeat fixture".into(), parts: vec![BlenderModelPart {
            position: [2., 3., 4.], scale: [2., 3., 4.],
            repeat: Some(BlenderModelRepeat { count: 3, offset: [-1., 0., 0.5] }),
            ..extrude_part()
        }] };
        validate_model_spec(&spec).unwrap();
        let result = create_blender_model(fixture.0.to_string_lossy().to_string(), spec, None).await.unwrap();
        let document = glb_json(Path::new(&result.path));
        assert_eq!(document["meshes"].as_array().unwrap().len(), 3);
        let mut instances = document["nodes"].as_array().unwrap().iter()
            .filter(|node| node["extras"]["xriftPartId"] == "profile").collect::<Vec<_>>();
        instances.sort_by_key(|node| node["extras"]["xriftPartInstance"].as_u64().unwrap());
        assert_eq!(instances.len(), 3);
        for (index, node) in instances.iter().enumerate() {
            assert_vector(&node["translation"], &[2. - index as f64, 3., 4. + index as f64 * 0.5]);
            assert_vector(&node["scale"], &[2., 3., 4.]);
            let primitive = &document["meshes"][node["mesh"].as_u64().unwrap() as usize]["primitives"][0];
            assert!(primitive["attributes"]["NORMAL"].is_number());
            assert!(primitive["attributes"]["TEXCOORD_0"].is_number());
            let positions = primitive["attributes"]["POSITION"].as_u64().unwrap() as usize;
            assert_vector(&document["accessors"][positions]["min"], &[0., 0., -0.1]);
            assert_vector(&document["accessors"][positions]["max"], &[1., 2., 0.1]);
            let material = &document["materials"][primitive["material"].as_u64().unwrap() as usize]["pbrMetallicRoughness"];
            assert!((material["metallicFactor"].as_f64().unwrap() - 0.35).abs() < 0.00001);
        }
        assert!(Path::new(&result.path).parent().unwrap().join("model.blend").is_file());
    }
    #[tokio::test]
    async fn installed_blender_exports_curved_supports_and_revolved_surfaces_with_uvs() {
        if std::env::var("XRIFT_TEST_BLENDER").as_deref() != Ok("1") { return; }
        let fixture = Fixture::new();
        let spec = BlenderModelSpec { name: "Curved furniture fixture".into(), parts: vec![
            BlenderModelPart { name: "Curved arm".into(), shape: "tube".into(),
                vertices: Some(vec![[0., 0.4, -0.3], [0., 0.75, -0.2], [0., 0.75, 0.2], [0., 0.4, 0.3]]),
                bevel: Some(0.025), ..part("tube") },
            BlenderModelPart { name: "Revolved planter".into(), shape: "lathe".into(), position: [2., 0., 0.],
                vertices: Some(vec![[0., 0., 0.], [0.2, 0., 0.], [0.3, 0.5, 0.], [0.27, 0.5, 0.], [0.18, 0.04, 0.], [0., 0.04, 0.]]),
                ..part("lathe") }
        ] };
        validate_model_spec(&spec).unwrap();
        let result = create_blender_model(fixture.0.to_string_lossy().to_string(), spec, None).await.unwrap();
        let document = glb_json(Path::new(&result.path));
        assert_eq!(document["meshes"].as_array().unwrap().len(), 2);
        for mesh in document["meshes"].as_array().unwrap() {
            for primitive in mesh["primitives"].as_array().unwrap() {
                assert!(primitive["attributes"]["NORMAL"].is_number());
                assert!(primitive["attributes"]["TEXCOORD_0"].is_number());
                let positions = primitive["attributes"]["POSITION"].as_u64().unwrap() as usize;
                assert!(document["accessors"][positions]["count"].as_u64().unwrap() > 30);
            }
        }
    }
    #[tokio::test]
    async fn installed_blender_streams_real_partial_and_final_captures_without_exporting_camera() {
        if std::env::var("XRIFT_TEST_BLENDER").as_deref() != Ok("1") { return; }
        let fixture = Fixture::new();
        let frames = Arc::new(Mutex::new(Vec::new()));
        let captured = frames.clone();
        let id = format!("preview-{}", fixture.0.file_name().unwrap().to_string_lossy());
        let _subscription = subscribe_previews(&id, Arc::new(move |event| { captured.lock().unwrap().push(event); }));
        let mut spec = model();
        spec.parts = ["box", "sphere", "cylinder", "cone", "torus"].into_iter().enumerate().map(|(index, shape)| {
            let mut value = part(shape); value.position[0] = index as f64 * 1.5; value
        }).collect();
        let result = create_blender_model(fixture.0.to_string_lossy().into(), spec, Some(id)).await.unwrap();
        let frames = frames.lock().unwrap();
        assert!(!frames.iter().any(|event| event["type"] == "progress"), "Capture warning: {frames:?}");
        let frames: Vec<_> = frames.iter().filter(|event| event["type"] == "preview").collect();
        assert!(frames.len() >= 2, "Expected partial and final actual captures");
        assert_eq!(frames.first().unwrap()["preview"]["completed"], 1);
        assert_eq!(frames.last().unwrap()["preview"]["completed"], 5);
        let output = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("node_modules/.cache/blender-progress");
        fs::create_dir_all(&output).unwrap();
        for (name, frame) in [("first.png", frames[0]), ("final.png", frames[frames.len() - 1])] {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD.decode(frame["preview"]["image"]["data"].as_str().unwrap()).unwrap();
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
            assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 480);
            assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 320);
            fs::write(output.join(name), bytes).unwrap();
        }
        assert_ne!(frames[0]["preview"]["image"], frames[frames.len() - 1]["preview"]["image"]);
        let document = glb_json(Path::new(&result.path));
        assert_eq!(document["meshes"].as_array().unwrap().len(), 5);
        assert!(document.get("cameras").is_none());
        assert!(!document["nodes"].as_array().unwrap().iter().any(|node| node["name"].as_str().is_some_and(|name| name.contains("progress camera"))));
    }
    #[tokio::test]
    async fn installed_blender_exports_real_geometry_pbr_and_studio_axes() {
        if std::env::var("XRIFT_TEST_BLENDER").as_deref() != Ok("1") {
            return;
        }
        let fixture = Fixture::new();
        let status = get_blender_status().await;
        assert!(
            status.available,
            "Opt-in integration test requires a real installed Blender"
        );
        let mut spec = BlenderModelSpec {
            name: "Native geometry fixture".into(),
            parts: ["box", "sphere", "cylinder", "cone", "torus"]
                .into_iter()
                .map(part)
                .collect(),
        };
        spec.parts[0].bevel = Some(0.1);
        spec.parts.push(mesh_part());
        let result = create_blender_model(fixture.0.to_string_lossy().to_string(), spec, None)
            .await
            .unwrap();
        let path = PathBuf::from(&result.path);
        assert!(path
            .canonicalize()
            .unwrap()
            .starts_with(fixture.0.join(CACHE)));
        assert!(result.byte_length > 1000);
        let bytes = fs::read(path.parent().unwrap().join("model.blend")).unwrap();
        assert!(
            bytes.starts_with(b"BLENDER"),
            "Unexpected editable blend header: {:?}",
            &bytes[..bytes.len().min(16)]
        );
        let document = glb_json(&path);
        assert_eq!(document["meshes"].as_array().unwrap().len(), 6);
        assert_eq!(document["materials"].as_array().unwrap().len(), 6);
        assert!(document["buffers"]
            .as_array()
            .unwrap()
            .iter()
            .all(|buffer| buffer.get("uri").is_none()));
        let axis = document["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|node| node["name"] == "Axis Probe")
            .unwrap();
        assert_vector(&axis["translation"], &[2., 3., 4.]);
        assert_vector(&axis["scale"], &[1., 2., 3.]);
        let expected = [0.1276794407, 0.1448781254, 0.2685358228, 0.9437143641];
        assert_vector(&axis["rotation"], &expected);
        let mesh_index = axis["mesh"].as_u64().unwrap() as usize;
        let primitive = &document["meshes"][mesh_index]["primitives"][0];
        let position_index = primitive["attributes"]["POSITION"].as_u64().unwrap() as usize;
        assert_vector(&document["accessors"][position_index]["min"], &[0., 0., 0.]);
        assert_vector(&document["accessors"][position_index]["max"], &[1., 2., 3.]);
        let material = &document["materials"][primitive["material"].as_u64().unwrap() as usize]
            ["pbrMetallicRoughness"];
        for (actual, expected) in material["baseColorFactor"]
            .as_array()
            .unwrap()
            .iter()
            .zip([0.15, 0.5, 0.85, 1.])
        {
            assert!((actual.as_f64().unwrap() - expected).abs() < 0.00001);
        }
        assert!((material["metallicFactor"].as_f64().unwrap() - 0.35).abs() < 0.00001);
        assert!((material["roughnessFactor"].as_f64().unwrap() - 0.6).abs() < 0.00001);
        if let Some(output) = std::env::var_os("XRIFT_TEST_BLENDER_OUTPUT") {
            let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .canonicalize()
                .unwrap();
            let target = PathBuf::from(output);
            let expected_parent =
                blender_path(&workspace.join("node_modules/.cache/chatgpt-blender-model"));
            assert!(
                target.is_absolute()
                    && target.parent() == Some(expected_parent.as_path())
                    && target.file_name().unwrap() == "fixture.glb"
            );
            super::super::ensure_no_symlink_ancestors(
                &workspace,
                Path::new("node_modules/.cache/chatgpt-blender-model/fixture.glb"),
            )
            .unwrap();
            fs::create_dir_all(&expected_parent).unwrap();
            let bytes = fs::read(&path).unwrap();
            if target.exists() {
                // Blender may reorder binary vertices across fresh processes.
                // Keep the verified first export without overwriting it; its
                // hierarchy, transforms and PBR must still match this spec.
                let existing = glb_json(&target);
                for field in ["nodes", "materials", "scenes"] {
                    assert!(
                        existing[field] == document[field],
                        "Existing isolated GLB {field} differs from this generated fixture"
                    );
                }
            } else {
                write_new(&target, &bytes).unwrap();
            }
            let source = fs::read(path.parent().unwrap().join("model.json")).unwrap();
            let target = expected_parent.join("fixture.json");
            if target.exists() {
                assert!(
                    fs::read(&target).unwrap() == source,
                    "Existing model fixture specification differs"
                );
            } else {
                write_new(&target, &source).unwrap();
            }
            println!("Real Blender GLB fixture: {}", target.display());
        }
        println!(
            "Blender {:?}: {} bytes, 6 meshes with authored PBR and Studio XYZ transforms",
            status.version, result.byte_length
        );
    }
}
