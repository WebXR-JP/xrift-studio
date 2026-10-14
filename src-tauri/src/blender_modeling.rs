use serde::{Deserialize, Serialize};
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

const RUNNER: &str = include_str!("blender_modeling.py");
const CACHE: &str = ".cache/xrift-studio-blender";
const TASK_PREFIX: &str = "model-";
const OWNER: &str = "xrift-studio-blender-model-v1";
const MODEL_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BlenderModelSpec {
    pub name: String,
    pub parts: Vec<BlenderModelPart>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BlenderModelPart {
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
            "required":["name","shape","position","rotation","scale","color","metallic","roughness","vertices","faces","bevel"],"properties":{
                "name":{"type":"string","minLength":1,"maxLength":80},
                "shape":{"type":"string","enum":["box","sphere","cylinder","cone","torus","mesh"]},
                "position":vector(-50.,50.),"rotation":vector(-360.,360.),"scale":vector(0.02,50.),
                "color":{"type":"array","minItems":4,"maxItems":4,"items":{"type":"number","minimum":0,"maximum":1}},
                "metallic":{"type":"number","minimum":0,"maximum":1},"roughness":{"type":"number","minimum":0,"maximum":1},
                "vertices":{"anyOf":[{"type":"null"},{"type":"array","minItems":3,"maxItems":2048,"items":vector(-50.,50.)}]},
                "faces":{"anyOf":[{"type":"null"},{"type":"array","minItems":1,"maxItems":4096,"items":{"type":"array","minItems":3,"maxItems":64,"items":{"type":"integer","minimum":0,"maximum":2047}}}]},
                "bevel":{"anyOf":[{"type":"null"},{"type":"number","minimum":0,"maximum":1}]}
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
    for part in &model.parts {
        if !name(&part.name)
            || !matches!(
                part.shape.as_str(),
                "box" | "sphere" | "cylinder" | "cone" | "torus" | "mesh"
            )
            || part.position.iter().any(|v| !bounded(*v, -50., 50.))
            || part.rotation.iter().any(|v| !bounded(*v, -360., 360.))
            || part.scale.iter().any(|v| !bounded(*v, 0.02, 50.))
            || part.color.iter().any(|v| !bounded(*v, 0., 1.))
            || !bounded(part.metallic, 0., 1.)
            || !bounded(part.roughness, 0., 1.)
            || part.bevel.is_some_and(|v| !bounded(v, 0., 1.))
        {
            return Err("モデルの形状・Transform・Materialが対応範囲を超えています".into());
        }
        if part.shape == "mesh" {
            let (Some(vertices), Some(faces)) = (&part.vertices, &part.faces) else {
                return Err("Meshには頂点と面を指定してください".into());
            };
            if !(3..=2048).contains(&vertices.len())
                || !(1..=4096).contains(&faces.len())
                || vertices.iter().flatten().any(|v| !bounded(*v, -50., 50.))
                || faces.iter().any(|face| {
                    !(3..=64).contains(&face.len())
                        || face.iter().any(|index| *index >= vertices.len())
                })
            {
                return Err("Meshの頂点・面・頂点番号が対応範囲を超えています".into());
            }
        } else if part.vertices.is_some() || part.faces.is_some() {
            return Err("頂点と面はMeshだけに指定できます".into());
        }
    }
    Ok(())
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
fn hidden_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    command.kill_on_drop(true).stdin(Stdio::null());
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    command
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
async fn run_model(
    executable: &Path,
    version: &semver::Version,
    directory: &Path,
    model: &BlenderModelSpec,
) -> Result<BlenderModelResult, String> {
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
    let mut child = command
        .spawn()
        .map_err(|_| "Blenderをバックグラウンドで起動できませんでした")?;
    let status = match tokio::time::timeout(MODEL_TIMEOUT, child.wait()).await {
        Ok(status) => status.map_err(|_| "Blenderの終了を確認できませんでした")?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err("Blenderでのモデル作成が時間内に完了しませんでした。パーツを減らして再試行してください".into());
        }
    };
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
) -> Result<BlenderModelResult, String> {
    validate_model_spec(&model)?;
    let root = project_root(&project_path)?;
    let (executable, version) = find_blender()
        .await
        .ok_or("Blenderが見つかりませんでした。Blenderをインストールして再試行してください")?;
    let directory = task_directory(&root)?;
    let result = run_model(&executable, &version, &directory, &model).await;
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
            use std::os::windows::process::CommandExt;
            let output = std::process::Command::new("powershell.exe")
                .creation_flags(0x08000000)
                .args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:XRIFT_BLENDER_TEST_LINK -Target $env:XRIFT_BLENDER_TEST_TARGET -ErrorAction Stop | Out-Null"])
                .env("XRIFT_BLENDER_TEST_LINK", &link)
                .env("XRIFT_BLENDER_TEST_TARGET", &target)
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
    async fn command_failure_does_not_report_a_model_or_replace_files() {
        let fixture = Fixture::new();
        let directory = task_directory(&fixture.0).unwrap();
        let result = run_model(
            &fixture.0.join("no-such-blender"),
            &semver::Version::new(5, 1, 0),
            &directory,
            &model(),
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
        let result = create_blender_model(fixture.0.to_string_lossy().to_string(), spec)
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
