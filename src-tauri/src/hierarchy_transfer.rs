//! Atomic, bounded save for a package selected through the native save dialog.
//! Kept free of Tauri so filesystem safety can be tested without a GUI runtime.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_PACKAGE_BYTES: usize = 256 * 1024 * 1024;
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn save_package_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !path.is_absolute()
        || !path.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("xriftstudio"))
    {
        return Err("保存先を選び、.xriftstudio形式で保存してください。".into());
    }
    if bytes.len() < 22 || bytes.len() > MAX_PACKAGE_BYTES || !bytes.starts_with(b"PK\x03\x04") {
        return Err(".xriftstudioファイルのデータまたはサイズが不正です。".into());
    }
    let parent = path.parent().ok_or("保存先フォルダーを確認してください。")?
        .canonicalize().map_err(|error| format!("保存先フォルダーを開けません: {error}"))?;
    let name = path.file_name().ok_or("ファイル名を確認してください。")?;
    let target = parent.join(name);
    match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => return Err("保存先が通常のファイルではありません。".into()),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(format!("保存先を確認できません: {error}")),
        _ => {}
    }
    // create_new prevents following a pre-existing temporary symlink. Only a
    // completely written and synced file replaces an existing destination.
    for _ in 0..32 {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let temporary = parent.join(format!(".xrift-hierarchy-{}-{nonce}-{counter}.tmp", std::process::id()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let mut file = match options.open(&temporary) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("一時ファイルを作れません: {error}")),
        };
        let result = (|| {
            file.write_all(bytes).map_err(|error| format!("ファイルを書き込めません: {error}"))?;
            file.sync_all().map_err(|error| format!("ファイルを保存できません: {error}"))?;
            drop(file);
            fs::rename(&temporary, &target).map_err(|error| format!("ファイルを置き換えられません。別の名前で保存してください: {error}"))?;
            Ok(())
        })();
        if result.is_err() { let _ = fs::remove_file(&temporary); }
        return result;
    }
    Err("一時ファイルを作れません。保存先を選び直してください。".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Directory(std::path::PathBuf);
    impl Directory {
        fn new() -> Self {
            let id = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!("xrift-hierarchy-test-{}-{id}", std::process::id()));
            fs::create_dir(&path).unwrap(); Self(path)
        }
    }
    impl Drop for Directory { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
    fn payload(value: u8) -> Vec<u8> { let mut bytes = vec![value; 32]; bytes[..4].copy_from_slice(b"PK\x03\x04"); bytes }
    #[test]
    fn saves_and_replaces_only_complete_payloads() {
        let dir = Directory::new(); let path = dir.0.join("chair.xriftstudio");
        save_package_bytes(&path, &payload(1)).unwrap();
        save_package_bytes(&path, &payload(2)).unwrap();
        assert_eq!(fs::read(&path).unwrap(), payload(2));
        assert!(save_package_bytes(&path, b"broken").is_err());
        assert_eq!(fs::read(&path).unwrap(), payload(2));
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
    }
    #[test]
    fn rejects_wrong_extension_and_relative_paths() {
        let dir = Directory::new();
        assert!(save_package_bytes(&dir.0.join("chair.exe"), &payload(1)).is_err());
        assert!(save_package_bytes(Path::new("chair.xriftstudio"), &payload(1)).is_err());
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 0);
    }
    #[test]
    fn rejects_directory_destination() {
        let dir = Directory::new(); let path = dir.0.join("directory.xriftstudio");
        fs::create_dir(&path).unwrap();
        assert!(save_package_bytes(&path, &payload(1)).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_destination() {
        let dir = Directory::new(); let original = dir.0.join("original");
        fs::write(&original, b"keep").unwrap();
        let path = dir.0.join("chair.xriftstudio");
        std::os::unix::fs::symlink(&original, &path).unwrap();
        assert!(save_package_bytes(&path, &payload(1)).is_err());
        assert_eq!(fs::read(&original).unwrap(), b"keep");
    }
}
