use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenXrRuntimeManifest {
    pub name: String,
    pub manifest_path: String,
    pub library_path: Option<String>,
    pub api_version: Option<String>,
    pub active: bool,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenXrRuntimeStatus {
    pub supported_platform: bool,
    pub active: bool,
    pub runtime_name: Option<String>,
    pub manifest_path: Option<String>,
    pub source: Option<String>,
    pub quest_pcvr_hint: bool,
    pub message: String,
    pub available_runtimes: Vec<OpenXrRuntimeManifest>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XrHostDiagnostics {
    pub openxr: OpenXrRuntimeStatus,
    pub adb_installed: bool,
    pub adb_version: Option<String>,
    pub quest_devices: Vec<String>,
    pub steamvr_running: bool,
    pub meta_link_running: bool,
    pub chromium_browsers: Vec<String>,
    pub notes: Vec<String>,
}

fn runtime_name(path: &str, manifest_name: Option<&str>) -> String {
    if let Some(name) = manifest_name.map(str::trim).filter(|v| !v.is_empty()) {
        return name.to_string();
    }
    let lower = path.to_ascii_lowercase();
    if lower.contains("steam") { "SteamVR".to_string() }
    else if lower.contains("oculus") || lower.contains("meta") { "Meta Horizon Link".to_string() }
    else if lower.contains("mixedreality") || lower.contains("windows mixed reality") { "Windows Mixed Reality".to_string() }
    else { PathBuf::from(path).file_stem().and_then(|v| v.to_str()).unwrap_or("OpenXR Runtime").to_string() }
}

fn parse_runtime_manifest(path: &str, active: bool, source: &str) -> OpenXrRuntimeManifest {
    let mut manifest_name = None;
    let mut library_path = None;
    let mut api_version = None;
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            manifest_name = value.get("runtime").and_then(|v| v.get("name")).or_else(|| value.get("name")).and_then(|v| v.as_str()).map(ToOwned::to_owned);
            if let Some(runtime) = value.get("runtime") {
                library_path = runtime.get("library_path").and_then(|v| v.as_str()).map(ToOwned::to_owned);
                api_version = runtime.get("api_version").and_then(|v| v.as_str()).map(ToOwned::to_owned);
            }
        }
    }
    OpenXrRuntimeManifest {
        name: runtime_name(path, manifest_name.as_deref()),
        manifest_path: path.to_string(),
        library_path,
        api_version,
        active,
        source: source.to_string(),
    }
}

#[cfg(target_os = "windows")]
fn active_runtime_path() -> Option<(String, String)> {
    if let Ok(path) = std::env::var("XR_RUNTIME_JSON") {
        if !path.trim().is_empty() { return Some((path, "XR_RUNTIME_JSON".to_string())); }
    }
    let output = Command::new("reg").args(["query", r"HKLM\SOFTWARE\Khronos\OpenXR\1", "/v", "ActiveRuntime"]).output().ok()?;
    if !output.status.success() { return None; }
    parse_reg_sz(&String::from_utf8_lossy(&output.stdout), "ActiveRuntime").map(|v| (v, "Windows Registry".to_string()))
}

#[cfg(target_os = "windows")]
fn parse_reg_sz(text: &str, value_name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        if !line.contains(value_name) || !line.contains("REG_SZ") { return None; }
        let pos = line.find("REG_SZ")?;
        let value = line[pos + "REG_SZ".len()..].trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

#[cfg(target_os = "windows")]
fn available_runtime_paths() -> Vec<(String, String)> {
    let output = Command::new("reg").args(["query", r"HKLM\SOFTWARE\Khronos\OpenXR\1\AvailableRuntimes"]).output();
    let Ok(output) = output else { return Vec::new(); };
    if !output.status.success() { return Vec::new(); }
    String::from_utf8_lossy(&output.stdout).lines().filter_map(|line| {
        let trimmed = line.trim();
        let pos = trimmed.find("REG_DWORD")?;
        let path = trimmed[..pos].trim();
        let state = trimmed[pos + "REG_DWORD".len()..].trim();
        if path.is_empty() || !(state.ends_with("0x0") || state == "0") { return None; }
        Some((path.to_string(), "Windows AvailableRuntimes".to_string()))
    }).collect()
}

#[cfg(target_os = "linux")]
fn active_runtime_path() -> Option<(String, String)> {
    if let Ok(path) = std::env::var("XR_RUNTIME_JSON") {
        if !path.trim().is_empty() { return Some((path, "XR_RUNTIME_JSON".to_string())); }
    }
    linux_runtime_candidates(true).into_iter().next()
}

#[cfg(target_os = "linux")]
fn available_runtime_paths() -> Vec<(String, String)> { linux_runtime_candidates(false) }

#[cfg(target_os = "linux")]
fn linux_runtime_candidates(active_only: bool) -> Vec<(String, String)> {
    let mut roots = Vec::<PathBuf>::new();
    if let Ok(config_home) = std::env::var("XDG_CONFIG_HOME") {
        if !config_home.is_empty() { roots.push(PathBuf::from(config_home)); }
    }
    if roots.is_empty() {
        if let Ok(user_home) = std::env::var("HOME") { roots.push(PathBuf::from(user_home).join(".config")); }
    }
    let config_dirs = std::env::var("XDG_CONFIG_DIRS").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| "/etc/xdg".to_string());
    roots.extend(config_dirs.split(':').filter(|v| !v.is_empty()).map(PathBuf::from));
    roots.push(PathBuf::from("/etc"));
    let mut found = Vec::new();
    for root in roots {
        let dir = root.join("openxr/1");
        if active_only {
            let arch = if cfg!(target_arch = "x86") { "i686" } else { std::env::consts::ARCH };
            for name in [format!("active_runtime.{arch}.json"), "active_runtime.json".to_string()] {
                let path = dir.join(name);
                if path.is_file() { return vec![(path.to_string_lossy().to_string(), "XDG OpenXR config".to_string())]; }
            }
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue; };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_active = name.starts_with("active_runtime") && name.ends_with(".json");
            let is_available = name.ends_with(".json") && !name.starts_with('.');
            if (active_only && is_active) || (!active_only && is_available) {
                found.push((entry.path().to_string_lossy().to_string(), "XDG OpenXR config".to_string()));
            }
        }
    }
    found
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn active_runtime_path() -> Option<(String, String)> {
    std::env::var("XR_RUNTIME_JSON").ok().filter(|v| !v.trim().is_empty()).map(|v| (v, "XR_RUNTIME_JSON".to_string()))
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn available_runtime_paths() -> Vec<(String, String)> { Vec::new() }

#[tauri::command]
pub fn get_openxr_runtime_status() -> OpenXrRuntimeStatus {
    let supported_platform = cfg!(any(target_os = "windows", target_os = "linux"));
    let active_path = active_runtime_path();
    let mut available = Vec::<OpenXrRuntimeManifest>::new();
    if let Some((path, source)) = active_path.as_ref() {
        available.push(parse_runtime_manifest(path, true, source));
    }
    for (path, source) in available_runtime_paths() {
        if available.iter().any(|v| v.manifest_path.eq_ignore_ascii_case(&path)) { continue; }
        available.push(parse_runtime_manifest(&path, false, &source));
    }
    let active_path = active_path.filter(|(path, _)| parse_runtime_manifest(path, true, "").library_path.is_some());
    match active_path {
        Some((path, source)) => {
            let active_manifest = parse_runtime_manifest(&path, true, &source);
            let name = active_manifest.name.clone();
            let lower = format!("{} {}", name, path).to_ascii_lowercase();
            OpenXrRuntimeStatus {
                supported_platform,
                active: true,
                runtime_name: Some(name.clone()),
                manifest_path: Some(path),
                source: Some(source),
                quest_pcvr_hint: lower.contains("meta") || lower.contains("oculus") || lower.contains("steam"),
                message: format!("{} がOpenXR Runtimeとして有効です", name),
                available_runtimes: available,
            }
        }
        None => OpenXrRuntimeStatus {
            supported_platform,
            active: false,
            runtime_name: None,
            manifest_path: None,
            source: None,
            quest_pcvr_hint: false,
            message: if supported_platform { "有効なOpenXR Runtimeを検出できませんでした。SteamVRまたはMeta Horizon LinkでOpenXR Runtimeを有効にしてください".to_string() } else { "このOSではOpenXR Runtimeの自動検出対象外です。Quest単体WebXRは利用できます".to_string() },
            available_runtimes: available,
        },
    }
}

fn command_first_line(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().next().map(str::trim).filter(|v| !v.is_empty()).map(ToOwned::to_owned)
}

fn process_running(names: &[&str]) -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist").args(["/FO", "CSV", "/NH"]).output();
        let Ok(output) = output else { return false; };
        let text = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
        return names.iter().any(|name| text.contains(&name.to_ascii_lowercase()));
    }
    #[cfg(not(target_os = "windows"))]
    {
        names.iter().any(|name| Command::new("pgrep").args(["-f", name]).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false))
    }
}

fn adb_devices() -> Vec<String> {
    let output = Command::new("adb").args(["devices", "-l"]).output();
    let Ok(output) = output else { return Vec::new(); };
    if !output.status.success() { return Vec::new(); }
    String::from_utf8_lossy(&output.stdout).lines().skip(1).filter_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.split_whitespace().nth(1) != Some("device") || line.contains("unauthorized") { None } else { Some(line.to_string()) }
    }).collect()
}

fn chromium_browsers() -> Vec<String> {
    let candidates: &[&str] = if cfg!(target_os = "windows") { &["chrome.exe", "msedge.exe", "brave.exe"] }
    else if cfg!(target_os = "macos") { &["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"] }
    else { &["google-chrome", "chromium", "chromium-browser", "microsoft-edge"] };
    candidates.iter().filter_map(|candidate| {
        if candidate.contains('/') {
            Path::new(candidate).is_file().then(|| candidate.to_string())
        } else {
            command_first_line(candidate, &["--version"]).map(|version| format!("{} ({})", candidate, version))
        }
    }).collect()
}

#[tauri::command]
pub fn get_xr_host_diagnostics() -> XrHostDiagnostics {
    let openxr = get_openxr_runtime_status();
    let adb_version = command_first_line("adb", &["version"]);
    let quest_devices = if adb_version.is_some() { adb_devices() } else { Vec::new() };
    let steamvr_running = process_running(&["vrserver", "vrmonitor"]);
    let meta_link_running = process_running(&["OculusClient", "OVRServer_x64", "Meta Quest Link"]);
    let chromium_browsers = chromium_browsers();
    let mut notes = Vec::new();
    if openxr.active && !steamvr_running && !meta_link_running { notes.push("OpenXR Runtimeは登録されていますが、SteamVR / Meta Horizon Linkの実行状態は確認できませんでした".to_string()); }
    if !quest_devices.is_empty() { notes.push("ADBでAndroidデバイスを確認しました。Questかどうかは端末情報で確認してください".to_string()); }
    if chromium_browsers.is_empty() { notes.push("外部WebXR Preview向けChromium系ブラウザを自動確認できませんでした".to_string()); }
    XrHostDiagnostics { openxr, adb_installed: adb_version.is_some(), adb_version, quest_devices, steamvr_running, meta_link_running, chromium_browsers, notes }
}

fn validate_preview_url(value: &str) -> Result<(), String> {
    let url = tauri::Url::parse(value).map_err(|_| "XR Preview URLが不正です".to_string())?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if url.username().is_empty() && url.password().is_none()
        && (url.scheme() == "https" || (url.scheme() == "http" && local)) {
        Ok(())
    } else {
        Err("XR PreviewはlocalhostまたはHTTPS URLだけ開けます".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_preview_url;
    #[test]
    fn preview_url_checks_parsed_host() {
        assert!(validate_preview_url("http://localhost:5173/").is_ok());
        assert!(validate_preview_url("https://example.org/xr").is_ok());
        assert!(validate_preview_url("http://localhost:5173@evil.example/").is_err());
        assert!(validate_preview_url("http://example.org/").is_err());
        assert!(validate_preview_url("file:///tmp/test").is_err());
    }
}

#[tauri::command]
pub fn open_xr_preview_url(app: AppHandle, url: String) -> Result<(), String> {
    validate_preview_url(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("XR Previewを開けません: {e}"))
}
