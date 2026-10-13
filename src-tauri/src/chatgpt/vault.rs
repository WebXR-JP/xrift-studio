//! Bounded, transactional records in the OS credential store.
//!
//! Windows credentials hold at most 2,560 bytes. Store UTF-8 as raw secrets
//! in two fixed slots, and publish their manifest only when all chunks in the
//! inactive slot have been written. Fixed names make interrupted writes fully
//! discoverable for logout/reset. No plaintext or mock fallback is allowed.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const CHUNK_BYTES: usize = 2_000;
const MAX_RECORD_BYTES: usize = 64 * 1024;
const MAX_CHUNKS: usize = 40;
const READ_ERROR: &str = "OSに保存したChatGPTの接続を読み取れませんでした";
const WRITE_ERROR: &str =
    "ChatGPTの接続をOSに保存できませんでした。次回起動時は再接続が必要になる場合があります";
const DELETE_ERROR: &str =
    "OSに保存したChatGPTの接続を削除できませんでした。OSの資格情報ストアを確認してください";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u8,
    generation: String,
    slot: u8,
    chunks: usize,
    bytes: usize,
    sha256: String,
}
fn valid_generation(value: &str) -> bool {
    value.len() == 43
        && value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || v == b'_' || v == b'-')
}
fn chunk_name(name: &str, slot: u8, index: usize) -> String {
    format!("{name}.v1.slot{slot}.{index}")
}
impl Manifest {
    fn valid(&self) -> bool {
        self.version == 1
            && valid_generation(&self.generation)
            && self.slot <= 1
            && self.bytes <= MAX_RECORD_BYTES
            && self.chunks > 0
            && self.chunks <= MAX_CHUNKS
            && self.chunks == self.bytes.div_ceil(CHUNK_BYTES).max(1)
            && self.sha256.len() == 64
            && self
                .sha256
                .bytes()
                .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(&v))
    }
    fn chunk_name(&self, name: &str, index: usize) -> String {
        chunk_name(name, self.slot, index)
    }
}
trait RawStore {
    fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn write(&self, name: &str, value: &[u8]) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}
struct OsStore<'a> {
    service: &'a str,
}
impl OsStore<'_> {
    fn entry(&self, name: &str) -> Result<keyring::Entry, String> {
        if !cfg!(any(
            target_os = "windows",
            target_os = "macos",
            target_os = "linux"
        )) {
            return Err("この端末ではChatGPTの接続を安全に保存できません".into());
        }
        keyring::Entry::new(self.service, name)
            .map_err(|_| "OSの資格情報ストアを開けませんでした".into())
    }
}
impl RawStore for OsStore<'_> {
    fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        match self.entry(name)?.get_secret() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(READ_ERROR.into()),
        }
    }
    fn write(&self, name: &str, value: &[u8]) -> Result<(), String> {
        self.entry(name)?
            .set_secret(value)
            .map_err(|_| WRITE_ERROR.into())
    }
    fn delete(&self, name: &str) -> Result<(), String> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(DELETE_ERROR.into()),
        }
    }
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn manifest(store: &impl RawStore, name: &str) -> Result<Option<Manifest>, String> {
    let Some(value) = store.read(name)? else {
        return Ok(None);
    };
    if value.len() > CHUNK_BYTES {
        return Err(READ_ERROR.into());
    }
    let value: Manifest = serde_json::from_slice(&value).map_err(|_| READ_ERROR.to_string())?;
    if !value.valid() {
        return Err(READ_ERROR.into());
    }
    Ok(Some(value))
}
fn read_from(store: &impl RawStore, name: &str) -> Result<Option<String>, String> {
    let Some(manifest) = manifest(store, name)? else {
        return Ok(None);
    };
    let mut bytes = Vec::with_capacity(manifest.bytes);
    for index in 0..manifest.chunks {
        let chunk = store
            .read(&manifest.chunk_name(name, index))?
            .ok_or(READ_ERROR)?;
        let expected = if index + 1 < manifest.chunks {
            CHUNK_BYTES
        } else {
            manifest.bytes - index * CHUNK_BYTES
        };
        if chunk.len() != expected {
            return Err(READ_ERROR.into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if hash(&bytes) != manifest.sha256 {
        return Err(READ_ERROR.into());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| READ_ERROR.into())
}
fn delete_slot(store: &impl RawStore, name: &str, slot: u8) -> Result<(), String> {
    let mut error = None;
    for index in 0..MAX_CHUNKS {
        if let Err(value) = store.delete(&chunk_name(name, slot, index)) {
            error = Some(value)
        }
    }
    error.map_or(Ok(()), Err)
}
fn write_to(store: &impl RawStore, name: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_RECORD_BYTES {
        return Err(WRITE_ERROR.into());
    }
    let old = manifest(store, name)?;
    let slot = old.as_ref().map_or(0, |old| 1 - old.slot);
    // Incomplete writes are confined to this inactive fixed slot. Clear all
    // its keys before reuse, without touching the current active record.
    delete_slot(store, name, slot)?;
    let next = Manifest {
        version: 1,
        generation: super::random()?,
        slot,
        chunks: value.len().div_ceil(CHUNK_BYTES).max(1),
        bytes: value.len(),
        sha256: hash(value.as_bytes()),
    };
    for index in 0..next.chunks {
        let start = index * CHUNK_BYTES;
        let chunk = &value.as_bytes()[start..(start + CHUNK_BYTES).min(value.len())];
        if let Err(error) = store.write(&next.chunk_name(name, index), chunk) {
            let _ = delete_slot(store, name, slot);
            return Err(error);
        }
    }
    let encoded = serde_json::to_vec(&next).map_err(|_| WRITE_ERROR.to_string())?;
    if let Err(error) = store.write(name, &encoded) {
        let _ = delete_slot(store, name, slot);
        return Err(error);
    }
    // The new record is already committed. A cleanup failure is reported,
    // without rolling back its valid replacement credential.
    if let Some(old) = old {
        delete_slot(store, name, old.slot)?
    }
    Ok(())
}
fn delete_from(store: &impl RawStore, name: &str) -> Result<(), String> {
    // Always visit the entire fixed namespace, even if the manifest is
    // missing/malformed or a prior write died before committing it.
    let first = delete_slot(store, name, 0);
    let second = delete_slot(store, name, 1);
    first.and(second)?;
    // Keep the manifest on chunk deletion failure, so restoration cannot
    // silently lose an error and logout/reset can be retried.
    store.delete(name)
}
pub(super) fn read(service: &str, name: &str) -> Result<Option<String>, String> {
    read_from(&OsStore { service }, name)
}
pub(super) fn write(service: &str, name: &str, value: &str) -> Result<(), String> {
    write_to(&OsStore { service }, name, value)
}
pub(super) fn delete(service: &str, name: &str) -> Result<(), String> {
    delete_from(&OsStore { service }, name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::BTreeMap};
    #[derive(Default)]
    struct MemoryStore {
        values: RefCell<BTreeMap<String, Vec<u8>>>,
        writes_until_failure: RefCell<Option<usize>>,
        failing_delete: RefCell<Option<String>>,
    }
    impl RawStore for MemoryStore {
        fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            Ok(self.values.borrow().get(name).cloned())
        }
        fn write(&self, name: &str, value: &[u8]) -> Result<(), String> {
            let mut fail = self.writes_until_failure.borrow_mut();
            if let Some(left) = *fail {
                if left == 0 {
                    return Err(WRITE_ERROR.into());
                }
                *fail = Some(left - 1);
            }
            assert!(value.len() <= CHUNK_BYTES);
            self.values.borrow_mut().insert(name.into(), value.into());
            Ok(())
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            if self.failing_delete.borrow().as_deref() == Some(name) {
                return Err(DELETE_ERROR.into());
            }
            self.values.borrow_mut().remove(name);
            Ok(())
        }
    }
    #[test]
    fn records_roundtrip_raw_utf8_across_chunks_and_remove_previous_generations() {
        let store = MemoryStore::default();
        for value in [
            "".into(),
            "小さな接続のテスト".into(),
            "日本語abc".repeat(3_000),
            "x".repeat(MAX_RECORD_BYTES),
        ] {
            write_to(&store, "synthetic", &value).unwrap();
            assert_eq!(
                read_from(&store, "synthetic").unwrap().as_deref(),
                Some(value.as_str())
            );
            let saved = manifest(&store, "synthetic").unwrap().unwrap();
            assert_eq!(store.values.borrow().len(), saved.chunks + 1);
        }
        delete_from(&store, "synthetic").unwrap();
        delete_from(&store, "synthetic").unwrap();
        assert!(store.values.borrow().is_empty());
    }
    #[test]
    fn chunk_or_manifest_failure_preserves_the_previous_complete_record() {
        for fail_after in [0, 1, 3] {
            let store = MemoryStore::default();
            write_to(&store, "synthetic", "old").unwrap();
            *store.writes_until_failure.borrow_mut() = Some(fail_after);
            assert!(write_to(&store, "synthetic", &"new".repeat(2_000)).is_err());
            assert_eq!(
                read_from(&store, "synthetic").unwrap().as_deref(),
                Some("old")
            );
            assert_eq!(store.values.borrow().len(), 2);
        }
    }
    #[test]
    fn cleanup_failure_remains_tracked_and_deletion_can_be_retried() {
        let store = MemoryStore::default();
        write_to(&store, "synthetic", &"old".repeat(1_000)).unwrap();
        let old = manifest(&store, "synthetic").unwrap().unwrap();
        let old_chunk = old.chunk_name("synthetic", 0);
        *store.failing_delete.borrow_mut() = Some(old_chunk.clone());
        assert!(write_to(&store, "synthetic", "replacement").is_err());
        assert_eq!(
            read_from(&store, "synthetic").unwrap().as_deref(),
            Some("replacement")
        );
        let current = manifest(&store, "synthetic").unwrap().unwrap();
        assert_ne!(current.slot, old.slot);
        // The inactive slot cannot be reused while cleanup still fails.
        assert!(write_to(&store, "synthetic", "next").is_err());
        assert!(delete_from(&store, "synthetic").is_err());
        assert!(store.values.borrow().contains_key("synthetic"));
        assert!(store.values.borrow().contains_key(&old_chunk));
        *store.failing_delete.borrow_mut() = None;
        delete_from(&store, "synthetic").unwrap();
        assert!(store.values.borrow().is_empty());
    }

    #[test]
    fn logout_removes_crashed_orphans_even_without_a_valid_manifest() {
        let store = MemoryStore::default();
        store
            .values
            .borrow_mut()
            .insert(chunk_name("synthetic", 0, 39), b"unfinished-write".to_vec());
        store.values.borrow_mut().insert(
            chunk_name("synthetic", 1, 17),
            b"previous-unfinished-write".to_vec(),
        );
        assert!(read_from(&store, "synthetic").unwrap().is_none());
        delete_from(&store, "synthetic").unwrap();
        assert!(store.values.borrow().is_empty());
        store
            .values
            .borrow_mut()
            .insert("synthetic".into(), b"malformed-manifest".to_vec());
        store
            .values
            .borrow_mut()
            .insert(chunk_name("synthetic", 1, 39), b"orphan".to_vec());
        assert!(read_from(&store, "synthetic").is_err());
        delete_from(&store, "synthetic").unwrap();
        assert!(store.values.borrow().is_empty());
    }
    #[test]
    fn failed_rollback_cleanup_keeps_active_data_and_logout_finds_orphans() {
        let store = MemoryStore::default();
        write_to(&store, "synthetic", "original").unwrap();
        let active = manifest(&store, "synthetic").unwrap().unwrap();
        let inactive_chunk = chunk_name("synthetic", 1 - active.slot, 0);
        // Failure is armed only after the initial inactive-slot cleanup.
        struct FailingRollback<'a> {
            inner: &'a MemoryStore,
            orphan: &'a str,
        }
        impl RawStore for FailingRollback<'_> {
            fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
                self.inner.read(name)
            }
            fn write(&self, name: &str, value: &[u8]) -> Result<(), String> {
                let result = self.inner.write(name, value);
                if result.is_err() {
                    *self.inner.failing_delete.borrow_mut() = Some(self.orphan.into())
                }
                result
            }
            fn delete(&self, name: &str) -> Result<(), String> {
                self.inner.delete(name)
            }
        }
        *store.writes_until_failure.borrow_mut() = Some(1);
        let wrapper = FailingRollback {
            inner: &store,
            orphan: &inactive_chunk,
        };
        assert!(write_to(&wrapper, "synthetic", &"replacement".repeat(500)).is_err());
        assert_eq!(
            read_from(&store, "synthetic").unwrap().as_deref(),
            Some("original")
        );
        assert!(store.values.borrow().contains_key(&inactive_chunk));
        assert!(delete_from(&store, "synthetic").is_err());
        assert!(store.values.borrow().contains_key("synthetic"));
        *store.failing_delete.borrow_mut() = None;
        delete_from(&store, "synthetic").unwrap();
        assert!(store.values.borrow().is_empty());
    }

    #[test]
    fn oversized_corrupt_missing_or_changed_chunks_never_restore_a_record() {
        let store = MemoryStore::default();
        assert!(write_to(&store, "synthetic", &"x".repeat(MAX_RECORD_BYTES + 1)).is_err());
        assert!(store.values.borrow().is_empty());
        write_to(&store, "synthetic", &"x".repeat(3_000)).unwrap();
        let saved = manifest(&store, "synthetic").unwrap().unwrap();
        let first = saved.chunk_name("synthetic", 0);
        store.values.borrow_mut().get_mut(&first).unwrap()[0] = b'y';
        assert!(read_from(&store, "synthetic").is_err());
        store.values.borrow_mut().remove(&first);
        assert!(read_from(&store, "synthetic").is_err());
        store
            .values
            .borrow_mut()
            .insert("synthetic".into(), b"{}".to_vec());
        assert!(read_from(&store, "synthetic").is_err());
    }
    #[test]
    #[ignore = "writes only disposable synthetic credentials to the real OS vault"]
    fn os_secure_store_roundtrip_small_and_large_synthetic_records() {
        const SERVICE: &str = "net.xrift.studio.audit.synthetic-vault";
        let name = format!("isolated-roundtrip-{}", super::super::random().unwrap());
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = delete(SERVICE, &self.0);
            }
        }
        let _cleanup = Cleanup(name.clone());
        assert!(read(SERVICE, &name).unwrap().is_none());
        for value in [
            "synthetic-data".to_string(),
            "日本語-synthetic-data-".repeat(1_500),
        ] {
            write(SERVICE, &name, &value).unwrap();
            assert_eq!(
                read(SERVICE, &name).unwrap().as_deref(),
                Some(value.as_str())
            );
        }
        delete(SERVICE, &name).unwrap();
        assert!(read(SERVICE, &name).unwrap().is_none());
    }
}
