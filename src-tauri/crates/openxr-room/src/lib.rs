//! Read-only room acquisition. No registry writes, browser, network or file access.
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub runtime: String,
    pub available: bool,
    pub missing_extensions: Vec<String>,
    pub mesh: bool,
    pub message: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub runtime: String,
    pub reference_space: String,
    pub surfaces: Vec<Value>,
    pub warnings: Vec<String>,
}
pub const REQUIRED: [&str; 5] = [
    "XR_KHR_D3D11_enable",
    "XR_FB_spatial_entity",
    // Query depends on storage even though acquisition never saves or erases spaces.
    "XR_FB_spatial_entity_storage",
    "XR_FB_spatial_entity_query",
    "XR_FB_scene",
];
pub fn missing_extensions(names: &[&str]) -> Vec<String> {
    REQUIRED
        .iter()
        .filter(|name| !names.contains(name))
        .map(|name| name.to_string())
        .collect()
}
pub fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Acquire) {
        Err("CANCELLED: 部屋の取得を取り消しました".into())
    } else {
        Ok(())
    }
}
#[cfg(windows)]
mod native;
#[cfg(windows)]
pub use native::{capabilities, capture};
#[cfg(not(windows))]
pub fn capabilities() -> Result<Capabilities, String> {
    Err("UNSUPPORTED_PLATFORM: OpenXRの部屋取得はWindowsで利用できます".into())
}
#[cfg(not(windows))]
pub fn capture(_: &AtomicBool) -> Result<Room, String> {
    Err("UNSUPPORTED_PLATFORM: OpenXRの部屋取得はWindowsで利用できます".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runtime_name_is_not_a_capability() {
        assert_eq!(
            missing_extensions(&["SteamVR", "Meta", "XR_KHR_D3D11_enable"]).len(),
            4
        );
        assert!(missing_extensions(&REQUIRED).is_empty());
    }
    #[test]
    fn cancellation_is_explicit() {
        assert!(check_cancel(&AtomicBool::new(false)).is_ok());
        assert!(check_cancel(&AtomicBool::new(true))
            .unwrap_err()
            .starts_with("CANCELLED:"));
    }
}
