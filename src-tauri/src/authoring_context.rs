//! Immutable local copies of bounded authoring input, excluded from world exports.
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const CACHE: &str = ".cache/xrift-studio-harness/contexts";
const MAX_BYTES: u64 = 1024 * 1024 + 512;

fn relative_path(fingerprint: &str) -> Result<String, String> {
    if fingerprint.len() != 64
        || !fingerprint
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("Authoring context fingerprint must be a lowercase SHA-256 digest".to_string());
    }
    Ok(format!("{CACHE}/{fingerprint}.json"))
}

fn read_context(project_path: &str, fingerprint: &str) -> Result<Option<String>, String> {
    let relative = relative_path(fingerprint)?;
    let path = super::safe_join(project_path, &relative)?;
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Authoring context metadata cannot be read: {error}"
            ))
        }
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Authoring context must be a regular file without symbolic links".to_string());
    }
    let root = super::canonical_project_root(project_path)?;
    let mut file = super::open_script_source_file(&root, Path::new(&relative))?;
    let opened = file
        .metadata()
        .map_err(|error| format!("Authoring context metadata cannot be read: {error}"))?;
    if !opened.is_file() || opened.len() > MAX_BYTES {
        return Err(
            "Authoring context must be a regular file within the archive size limit".to_string(),
        );
    }
    let mut bytes = Vec::with_capacity(opened.len() as usize);
    Read::by_ref(&mut file)
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Authoring context cannot be read: {error}"))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Authoring context exceeds the archive size limit".to_string());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Authoring context must be valid UTF-8".to_string())
}

struct StagedContext {
    project: PathBuf,
    relative: String,
    file: Option<File>,
}
impl Drop for StagedContext {
    fn drop(&mut self) {
        drop(self.file.take());
        // Only the random create_new file owned by this call is eligible for
        // cleanup. Refuse cleanup after an ancestor became a symbolic link.
        if let Ok(path) = super::safe_join(&self.project.to_string_lossy(), &self.relative) {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(windows)]
fn move_without_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "Kernel32")]
    extern "system" {
        #[link_name = "MoveFileW"]
        fn move_file_w(source: *const u16, destination: *const u16) -> i32;
    }
    if source.parent() != destination.parent() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Authoring context publication must stay in one cache folder",
        ));
    }
    let terminated = |path: &Path| -> std::io::Result<Vec<u16>> {
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.contains(&0) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Authoring context path contains an embedded NUL",
            ));
        }
        wide.push(0);
        Ok(wide)
    };
    let source = terminated(source)?;
    let destination = terminated(destination)?;
    // SAFETY: both UTF-16 buffers are live and NUL terminated. MoveFileW does
    // not replace an existing file; unlike std::fs::rename it has no implicit
    // REPLACE_EXISTING flag. The same-folder guard excludes cross-volume copy.
    // https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefilew
    if unsafe { move_file_w(source.as_ptr(), destination.as_ptr()) } == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn publish_without_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    match std::fs::hard_link(source, destination) {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(error) if matches!(error.raw_os_error(), Some(1 | 50)) => {
            // FAT/exFAT do not support hard links. A same-folder Win32 move
            // retains the no-overwrite contract without a copy/truncate path.
            move_without_replace(source, destination)
        }
        Err(error) => Err(error),
    }
}

fn write_context(project_path: &str, fingerprint: &str, content: &str) -> Result<(), String> {
    let relative = relative_path(fingerprint)?;
    if content.is_empty() || content.len() as u64 > MAX_BYTES {
        return Err("Authoring context exceeds the archive size limit".to_string());
    }
    let body: serde_json::Value = serde_json::from_str(content)
        .map_err(|_| "Authoring context must be valid JSON".to_string())?;
    if body.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || body.get("fingerprint").and_then(serde_json::Value::as_str) != Some(fingerprint)
    {
        return Err(
            "Authoring context version or fingerprint does not match its locator".to_string(),
        );
    }
    if let Some(previous) = read_context(project_path, fingerprint)? {
        return if previous == content {
            Ok(())
        } else {
            Err("An immutable authoring context already exists with different content".to_string())
        };
    }
    let target = super::safe_join(project_path, &relative)?;
    let parent = target
        .parent()
        .ok_or_else(|| "Authoring context cache path is invalid".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Authoring context cache cannot be created: {error}"))?;
    let target = super::safe_join(project_path, &relative)?;
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .map_err(|_| "Authoring context staging identity cannot be created".to_string())?;
    let nonce: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let staged_relative = format!("{CACHE}/.publish-{nonce}.tmp");
    let staged_path = super::safe_join(project_path, &staged_relative)?;
    let project = super::canonical_project_root(project_path)?;
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged_path)
        .map_err(|error| format!("Authoring context staging file cannot be created: {error}"))?;
    let mut staged = StagedContext {
        project,
        relative: staged_relative,
        file: Some(file),
    };
    staged
        .file
        .as_mut()
        .expect("staged context owns an open file")
        .write_all(content.as_bytes())
        .map_err(|error| format!("Authoring context cannot be written: {error}"))?;
    staged
        .file
        .as_ref()
        .expect("staged context owns an open file")
        .sync_all()
        .map_err(|error| format!("Authoring context cannot be flushed: {error}"))?;
    drop(staged.file.take());
    // hard_link atomically installs this complete file and never truncates or
    // replaces an existing destination, including a concurrent writer's file.
    super::safe_join(project_path, &relative)?;
    super::safe_join(project_path, &staged.relative)?;
    match publish_without_replace(&staged_path, &target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if read_context(project_path, fingerprint)?.as_deref() == Some(content) {
                Ok(())
            } else {
                Err(
                    "An immutable authoring context already exists with different content"
                        .to_string(),
                )
            }
        }
        Err(error) => Err(format!(
            "Authoring context cannot be published without overwriting: {error}"
        )),
    }
}

#[tauri::command]
pub(crate) fn read_chatgpt_harness_context(
    project_path: String,
    fingerprint: String,
) -> Result<Option<String>, String> {
    read_context(&project_path, &fingerprint)
}
#[tauri::command]
pub(crate) fn write_chatgpt_harness_context(
    project_path: String,
    fingerprint: String,
    content: String,
) -> Result<(), String> {
    write_context(&project_path, &fingerprint, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "xrift-authoring-context-test-{}-{nonce}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn path(&self) -> String {
            self.0.to_string_lossy().to_string()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    fn body(source: &str) -> String {
        serde_json::json!({"version":1,"fingerprint":SHA,"source":source}).to_string()
    }

    #[test]
    fn authoring_context_publish_is_complete_idempotent_and_never_replaces_existing_content() {
        let fixture = Fixture::new();
        assert_eq!(read_context(&fixture.path(), SHA).unwrap(), None);
        let original = body("original");
        write_context(&fixture.path(), SHA, &original).unwrap();
        assert_eq!(
            read_context(&fixture.path(), SHA).unwrap(),
            Some(original.clone())
        );
        write_context(&fixture.path(), SHA, &original).unwrap();
        assert!(write_context(&fixture.path(), SHA, &body("changed"))
            .unwrap_err()
            .contains("different content"));
        assert_eq!(read_context(&fixture.path(), SHA).unwrap(), Some(original));
        let names = std::fs::read_dir(fixture.0.join(CACHE))
            .unwrap()
            .map(|item| item.unwrap().file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![std::ffi::OsString::from(format!("{SHA}.json"))]);
    }
    #[test]
    fn authoring_context_invalid_locators_payloads_and_oversized_files_fail_closed() {
        let fixture = Fixture::new();
        for fingerprint in [
            "../outside",
            "/private",
            "C:\\private",
            "0123",
            &"A".repeat(64),
        ] {
            assert!(read_context(&fixture.path(), fingerprint).is_err());
            assert!(write_context(&fixture.path(), fingerprint, &body("source")).is_err());
        }
        for invalid in [
            "not JSON".to_string(),
            "{}".to_string(),
            body("source").replace("\"version\":1", "\"version\":2"),
            "x".repeat(MAX_BYTES as usize + 1),
        ] {
            assert!(write_context(&fixture.path(), SHA, &invalid).is_err());
        }
        assert!(!fixture.0.join(CACHE).exists());
        let target = fixture.0.join(relative_path(SHA).unwrap());
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        File::create(&target)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(read_context(&fixture.path(), SHA)
            .unwrap_err()
            .contains("size limit"));
        std::fs::write(&target, [0xff]).unwrap();
        assert!(read_context(&fixture.path(), SHA)
            .unwrap_err()
            .contains("UTF-8"));
    }
    #[test]
    fn authoring_context_regular_file_failures_are_not_treated_as_missing() {
        let fixture = Fixture::new();
        let target = fixture.0.join(relative_path(SHA).unwrap());
        std::fs::create_dir_all(&target).unwrap();
        assert!(read_context(&fixture.path(), SHA).is_err());
        assert!(write_context(&fixture.path(), SHA, &body("source")).is_err());
        assert!(target.is_dir());
    }
    #[test]
    fn authoring_context_concurrent_writers_publish_one_whole_value() {
        let fixture = Fixture::new();
        let gate = std::sync::Arc::new(std::sync::Barrier::new(3));
        let workers = ["left", "right"].map(|value| {
            let path = fixture.path();
            let gate = gate.clone();
            std::thread::spawn(move || {
                let content = body(value);
                gate.wait();
                (write_context(&path, SHA, &content), content)
            })
        });
        gate.wait();
        let outcomes = workers.map(|worker| worker.join().unwrap());
        assert_eq!(
            outcomes.iter().filter(|(result, _)| result.is_ok()).count(),
            1
        );
        let retained = read_context(&fixture.path(), SHA).unwrap().unwrap();
        assert!(outcomes
            .iter()
            .any(|(result, content)| result.is_ok() && *content == retained));
        assert_eq!(std::fs::read_dir(fixture.0.join(CACHE)).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn authoring_context_windows_move_fallback_never_replaces_an_existing_file() {
        let fixture = Fixture::new();
        let source = fixture.0.join("staged.json");
        let destination = fixture.0.join("published.json");
        std::fs::write(&source, "complete value").unwrap();
        move_without_replace(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(
            std::fs::read_to_string(&destination).unwrap(),
            "complete value"
        );
        std::fs::write(&source, "must not replace").unwrap();
        assert!(move_without_replace(&source, &destination).is_err());
        assert_eq!(std::fs::read_to_string(source).unwrap(), "must not replace");
        assert_eq!(
            std::fs::read_to_string(destination).unwrap(),
            "complete value"
        );
    }
    #[cfg(unix)]
    #[test]
    fn authoring_context_symbolic_links_are_rejected_without_touching_the_target() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let target = fixture.0.join(relative_path(SHA).unwrap());
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        let outside = fixture.0.join("untouched.json");
        std::fs::write(&outside, "original").unwrap();
        symlink(&outside, &target).unwrap();
        assert!(read_context(&fixture.path(), SHA).is_err());
        assert!(write_context(&fixture.path(), SHA, &body("source")).is_err());
        assert_eq!(std::fs::read_to_string(outside).unwrap(), "original");
    }
}
