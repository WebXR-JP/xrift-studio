use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SCRIPT_TRUST_STORE_SCHEMA_VERSION: u32 = 1;
pub(crate) const SCRIPT_TRUST_STORE_DIRECTORY: &str = "script-trust";
const SCRIPT_TRUST_STORE_FILE: &str = "approvals-v1.json";
const SCRIPT_TRUST_STORE_MAX_BYTES: u64 = 8 * 1024 * 1024;
const SCRIPT_TRUST_STORE_MAX_APPROVALS: usize = 16_384;
const SCRIPT_TRUST_FIELD_MAX_BYTES: usize = 256;

static SCRIPT_TRUST_STORE_LOCK: Mutex<()> = Mutex::new(());
static SCRIPT_TRUST_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptTrustProjectInput {
    pub project_path: String,
    pub project_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptTrustProjectScope {
    pub canonical_project_path: String,
    pub project_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptTrustFingerprint {
    pub source_sha256: String,
    pub language: String,
    pub contract_version: String,
    pub module_policy_version: String,
    pub allow_remote_modules: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptTrustApproval {
    pub project: ScriptTrustProjectScope,
    pub fingerprint: ScriptTrustFingerprint,
    pub approved_at_unix_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTrustApprovalCheck {
    pub fingerprint: ScriptTrustFingerprint,
    pub approved: bool,
    pub approved_at_unix_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTrustStatus {
    pub project: ScriptTrustProjectScope,
    pub checks: Vec<ScriptTrustApprovalCheck>,
    pub approved_count: usize,
    pub pending_count: usize,
    pub stored_approval_count: usize,
    pub all_approved: bool,
    pub store_schema_version: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTrustApprovalList {
    pub project: ScriptTrustProjectScope,
    pub approvals: Vec<ScriptTrustApproval>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTrustMutationResult {
    pub project: ScriptTrustProjectScope,
    pub checks: Vec<ScriptTrustApprovalCheck>,
    pub changed_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTrustResetResult {
    pub project: Option<ScriptTrustProjectScope>,
    pub removed_count: usize,
    pub reset_all: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScriptTrustStore {
    schema_version: u32,
    approvals: Vec<ScriptTrustApproval>,
}

impl ScriptTrustStore {
    fn empty() -> Self {
        Self {
            schema_version: SCRIPT_TRUST_STORE_SCHEMA_VERSION,
            approvals: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn get_script_trust_status(
    app: AppHandle,
    project: ScriptTrustProjectInput,
    fingerprints: Vec<ScriptTrustFingerprint>,
) -> Result<ScriptTrustStatus, String> {
    let _guard = lock_store()?;
    let (store_path, project) = resolve_command_scope(&app, project, false)?;
    let fingerprints = validate_fingerprints(fingerprints, true)?;
    let store = read_store(&store_path)?;
    Ok(status_for(&store, project, fingerprints))
}

#[tauri::command]
pub fn list_script_trust_approvals(
    app: AppHandle,
    project: ScriptTrustProjectInput,
) -> Result<ScriptTrustApprovalList, String> {
    let _guard = lock_store()?;
    let (store_path, project) = resolve_command_scope(&app, project, false)?;
    let store = read_store(&store_path)?;
    let mut approvals = store
        .approvals
        .into_iter()
        .filter(|approval| approval.project == project)
        .collect::<Vec<_>>();
    sort_approvals(&mut approvals);
    Ok(ScriptTrustApprovalList { project, approvals })
}

#[tauri::command]
pub fn check_script_trust_approval(
    app: AppHandle,
    project: ScriptTrustProjectInput,
    fingerprint: ScriptTrustFingerprint,
) -> Result<ScriptTrustApprovalCheck, String> {
    let _guard = lock_store()?;
    let (store_path, project) = resolve_command_scope(&app, project, false)?;
    let fingerprint = validate_fingerprint(fingerprint)?;
    let store = read_store(&store_path)?;
    Ok(check_for(&store, &project, fingerprint))
}

/// Records an explicit decision made by the Studio approval UI.
///
/// This command is deliberately not exposed as an MCP editor tool. Every
/// fingerprint is validated before the store is modified, and the whole batch
/// is persisted with one atomic store replacement.
#[tauri::command]
pub fn approve_script_trust_fingerprint_for_ui(
    app: AppHandle,
    project: ScriptTrustProjectInput,
    fingerprints: Vec<ScriptTrustFingerprint>,
) -> Result<ScriptTrustMutationResult, String> {
    let _guard = lock_store()?;
    let (store_path, project) = resolve_command_scope(&app, project, true)?;
    let fingerprints = validate_fingerprints(fingerprints, false)?;
    let mut store = read_store(&store_path)?;
    let approved_at_unix_ms = unix_time_ms()?;
    let mut changed_count = 0;

    for fingerprint in &fingerprints {
        if find_approval(&store, &project, fingerprint).is_none() {
            if store.approvals.len() >= SCRIPT_TRUST_STORE_MAX_APPROVALS {
                return Err(script_trust_error(
                    "STORE_LIMIT",
                    "approval store has reached its safe entry limit",
                ));
            }
            store.approvals.push(ScriptTrustApproval {
                project: project.clone(),
                fingerprint: fingerprint.clone(),
                approved_at_unix_ms,
            });
            changed_count += 1;
        }
    }

    if changed_count > 0 {
        sort_approvals(&mut store.approvals);
        write_store_atomic(&store_path, &store)?;
    }

    Ok(ScriptTrustMutationResult {
        project: project.clone(),
        checks: fingerprints
            .into_iter()
            .map(|fingerprint| check_for(&store, &project, fingerprint))
            .collect(),
        changed_count,
    })
}

#[tauri::command]
pub fn revoke_script_trust_fingerprints(
    app: AppHandle,
    project: ScriptTrustProjectInput,
    fingerprints: Vec<ScriptTrustFingerprint>,
) -> Result<ScriptTrustMutationResult, String> {
    let _guard = lock_store()?;
    let (store_path, project) = resolve_command_scope(&app, project, true)?;
    let fingerprints = validate_fingerprints(fingerprints, false)?;
    let requested = fingerprints.iter().cloned().collect::<HashSet<_>>();
    let mut store = read_store(&store_path)?;
    let previous_len = store.approvals.len();
    store.approvals.retain(|approval| {
        approval.project != project || !requested.contains(&approval.fingerprint)
    });
    let changed_count = previous_len - store.approvals.len();

    if changed_count > 0 {
        write_store_atomic(&store_path, &store)?;
    }

    Ok(ScriptTrustMutationResult {
        project,
        checks: fingerprints
            .into_iter()
            .map(|fingerprint| ScriptTrustApprovalCheck {
                fingerprint,
                approved: false,
                approved_at_unix_ms: None,
            })
            .collect(),
        changed_count,
    })
}

/// Clears approvals for one project, or the complete store when `project` is
/// `None`. A complete reset intentionally replaces even a corrupt store so the
/// user has an explicit recovery path; a project-only reset remains
/// fail-closed because it must preserve other projects.
#[tauri::command]
pub fn reset_script_trust_approvals(
    app: AppHandle,
    project: Option<ScriptTrustProjectInput>,
) -> Result<ScriptTrustResetResult, String> {
    let _guard = lock_store()?;
    match project {
        Some(project) => {
            let (store_path, project) = resolve_command_scope(&app, project, true)?;
            let mut store = read_store(&store_path)?;
            let previous_len = store.approvals.len();
            store
                .approvals
                .retain(|approval| approval.project != project);
            let removed_count = previous_len - store.approvals.len();
            if removed_count > 0 {
                write_store_atomic(&store_path, &store)?;
            }
            Ok(ScriptTrustResetResult {
                project: Some(project),
                removed_count,
                reset_all: false,
            })
        }
        None => {
            let store_path = resolve_store_path(&app, None, true)?;
            let removed_count = read_store(&store_path)
                .map(|store| store.approvals.len())
                .unwrap_or_default();
            write_store_atomic(&store_path, &ScriptTrustStore::empty())?;
            Ok(ScriptTrustResetResult {
                project: None,
                removed_count,
                reset_all: true,
            })
        }
    }
}

pub(crate) fn reset_script_trust_store_for_app_reset(app_data_root: &Path) -> Result<(), String> {
    let _guard = lock_store()?;
    let store_directory = app_data_root.join(SCRIPT_TRUST_STORE_DIRECTORY);
    let metadata = match std::fs::symlink_metadata(&store_directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(script_trust_error(
                "IO_ERROR",
                &format!("approval store metadata cannot be read: {}", error),
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return std::fs::remove_file(&store_directory).map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("invalid approval store path cannot be removed: {}", error),
            )
        });
    }
    super::remove_or_quarantine_for_reset(app_data_root, &store_directory)
        .map_err(|error| script_trust_error("IO_ERROR", &error))
}

fn lock_store() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    SCRIPT_TRUST_STORE_LOCK
        .lock()
        .map_err(|_| script_trust_error("LOCK_UNAVAILABLE", "approval store lock is unavailable"))
}

fn resolve_command_scope(
    app: &AppHandle,
    project: ScriptTrustProjectInput,
    create_store_directory: bool,
) -> Result<(PathBuf, ScriptTrustProjectScope), String> {
    let project = resolve_project_scope(project)?;
    let store_path = resolve_store_path(app, Some(&project), create_store_directory)?;
    Ok((store_path, project))
}

fn resolve_project_scope(
    project: ScriptTrustProjectInput,
) -> Result<ScriptTrustProjectScope, String> {
    let project_id = validate_text_field("projectId", project.project_id)?;
    let project_path = PathBuf::from(project.project_path);
    let metadata = std::fs::metadata(&project_path).map_err(|error| {
        script_trust_error(
            "INVALID_PROJECT",
            &format!("project path cannot be read: {}", error),
        )
    })?;
    if !metadata.is_dir() {
        return Err(script_trust_error(
            "INVALID_PROJECT",
            "project path must identify a directory",
        ));
    }
    let canonical_project_path = project_path.canonicalize().map_err(|error| {
        script_trust_error(
            "INVALID_PROJECT",
            &format!("project path cannot be canonicalized: {}", error),
        )
    })?;
    let canonical_project_path = canonical_project_path.to_str().ok_or_else(|| {
        script_trust_error(
            "INVALID_PROJECT",
            "canonical project path must be valid UTF-8",
        )
    })?;
    Ok(ScriptTrustProjectScope {
        canonical_project_path: canonical_project_path.to_string(),
        project_id,
    })
}

fn resolve_store_path(
    app: &AppHandle,
    project: Option<&ScriptTrustProjectScope>,
    create_store_directory: bool,
) -> Result<PathBuf, String> {
    let app_data_root = app.path().app_data_dir().map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("app data directory cannot be resolved: {}", error),
        )
    })?;
    resolve_store_path_at(&app_data_root, project, create_store_directory)
}

fn resolve_store_path_at(
    app_data_root: &Path,
    project: Option<&ScriptTrustProjectScope>,
    create_store_directory: bool,
) -> Result<PathBuf, String> {
    if create_store_directory {
        std::fs::create_dir_all(app_data_root).map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("app data directory cannot be created: {}", error),
            )
        })?;
    }

    let canonical_app_data_root = canonical_existing_directory(app_data_root, "app data")?;
    if let Some(project) = project {
        ensure_path_outside_project(&canonical_app_data_root, project)?;
    }

    let store_directory = app_data_root.join(SCRIPT_TRUST_STORE_DIRECTORY);
    let store_metadata = match std::fs::symlink_metadata(&store_directory) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(script_trust_error(
                "IO_ERROR",
                &format!("approval store directory cannot be inspected: {}", error),
            ))
        }
    };
    match store_metadata {
        Some(metadata) if metadata.file_type().is_symlink() => {
            return Err(script_trust_error(
                "STORE_CORRUPT",
                "approval store directory must not be a symbolic link",
            ))
        }
        Some(metadata) if !metadata.is_dir() => {
            return Err(script_trust_error(
                "STORE_CORRUPT",
                "approval store path must be a directory",
            ))
        }
        Some(_) => {}
        None if create_store_directory => {
            std::fs::create_dir(&store_directory).map_err(|error| {
                script_trust_error(
                    "IO_ERROR",
                    &format!("approval store directory cannot be created: {}", error),
                )
            })?;
        }
        None => return Ok(store_directory.join(SCRIPT_TRUST_STORE_FILE)),
    }

    let canonical_store_directory =
        canonical_existing_directory(&store_directory, "approval store")?;
    if !canonical_store_directory.starts_with(&canonical_app_data_root) {
        return Err(script_trust_error(
            "STORE_OUTSIDE_APP_DATA",
            "approval store directory must remain inside canonical app data",
        ));
    }
    if let Some(project) = project {
        ensure_path_outside_project(&canonical_store_directory, project)?;
    }
    Ok(store_directory.join(SCRIPT_TRUST_STORE_FILE))
}

fn canonical_existing_directory(path: &Path, label: &str) -> Result<PathBuf, String> {
    if !path.exists() {
        return Ok(path.to_path_buf());
    }
    let metadata = std::fs::metadata(path).map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("{} directory cannot be read: {}", label, error),
        )
    })?;
    if !metadata.is_dir() {
        return Err(script_trust_error(
            "IO_ERROR",
            &format!("{} path is not a directory", label),
        ));
    }
    path.canonicalize().map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("{} directory cannot be canonicalized: {}", label, error),
        )
    })
}

fn ensure_path_outside_project(
    candidate: &Path,
    project: &ScriptTrustProjectScope,
) -> Result<(), String> {
    let project_path = Path::new(&project.canonical_project_path);
    if candidate.starts_with(project_path) {
        return Err(script_trust_error(
            "STORE_INSIDE_PROJECT",
            "approval store must be outside the project directory",
        ));
    }
    Ok(())
}

fn validate_fingerprints(
    fingerprints: Vec<ScriptTrustFingerprint>,
    allow_empty: bool,
) -> Result<Vec<ScriptTrustFingerprint>, String> {
    if fingerprints.is_empty() && !allow_empty {
        return Err(script_trust_error(
            "INVALID_FINGERPRINT",
            "at least one fingerprint is required",
        ));
    }
    let mut validated = Vec::with_capacity(fingerprints.len());
    let mut unique = HashSet::with_capacity(fingerprints.len());
    for fingerprint in fingerprints {
        let fingerprint = validate_fingerprint(fingerprint)?;
        if unique.insert(fingerprint.clone()) {
            validated.push(fingerprint);
        }
    }
    Ok(validated)
}

fn validate_fingerprint(
    fingerprint: ScriptTrustFingerprint,
) -> Result<ScriptTrustFingerprint, String> {
    if fingerprint.source_sha256.len() != 64
        || !fingerprint
            .source_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(script_trust_error(
            "INVALID_FINGERPRINT",
            "sourceSha256 must be a lowercase SHA-256 digest",
        ));
    }
    if !matches!(fingerprint.language.as_str(), "ts" | "tsx") {
        return Err(script_trust_error(
            "INVALID_FINGERPRINT",
            "language must be ts or tsx",
        ));
    }
    let contract_version = validate_text_field("contractVersion", fingerprint.contract_version)?;
    let module_policy_version =
        validate_text_field("modulePolicyVersion", fingerprint.module_policy_version)?;
    if fingerprint.allow_remote_modules {
        return Err(script_trust_error(
            "REMOTE_MODULES_NOT_ALLOWED",
            "remote Script modules cannot be approved",
        ));
    }
    Ok(ScriptTrustFingerprint {
        source_sha256: fingerprint.source_sha256,
        language: fingerprint.language,
        contract_version,
        module_policy_version,
        allow_remote_modules: false,
    })
}

fn validate_text_field(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > SCRIPT_TRUST_FIELD_MAX_BYTES
        || trimmed.chars().any(char::is_control)
    {
        return Err(script_trust_error(
            "INVALID_INPUT",
            &format!(
                "{} must be non-empty, control-free, and at most {} UTF-8 bytes",
                field, SCRIPT_TRUST_FIELD_MAX_BYTES
            ),
        ));
    }
    Ok(trimmed.to_string())
}

fn read_store(path: &Path) -> Result<ScriptTrustStore, String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ScriptTrustStore::empty())
        }
        Err(error) => {
            return Err(script_trust_error(
                "IO_ERROR",
                &format!("approval store metadata cannot be read: {}", error),
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(script_trust_error(
            "STORE_CORRUPT",
            "approval store must be a regular file",
        ));
    }
    if metadata.len() > SCRIPT_TRUST_STORE_MAX_BYTES {
        return Err(script_trust_error(
            "STORE_CORRUPT",
            "approval store exceeds its safe size limit",
        ));
    }
    let bytes = std::fs::read(path).map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("approval store cannot be read: {}", error),
        )
    })?;
    let store = serde_json::from_slice::<ScriptTrustStore>(&bytes).map_err(|error| {
        script_trust_error(
            "STORE_CORRUPT",
            &format!("approval store JSON is invalid: {}", error),
        )
    })?;
    validate_store(store)
}

fn validate_store(store: ScriptTrustStore) -> Result<ScriptTrustStore, String> {
    if store.schema_version != SCRIPT_TRUST_STORE_SCHEMA_VERSION {
        return Err(script_trust_error(
            "STORE_CORRUPT",
            &format!(
                "unsupported approval store schema version: {}",
                store.schema_version
            ),
        ));
    }
    if store.approvals.len() > SCRIPT_TRUST_STORE_MAX_APPROVALS {
        return Err(script_trust_error(
            "STORE_CORRUPT",
            "approval store exceeds its safe entry limit",
        ));
    }

    let mut identities = HashSet::with_capacity(store.approvals.len());
    for approval in &store.approvals {
        validate_stored_project(&approval.project)?;
        validate_fingerprint(approval.fingerprint.clone()).map_err(|error| {
            script_trust_error(
                "STORE_CORRUPT",
                &format!("approval contains an invalid fingerprint: {}", error),
            )
        })?;
        if !identities.insert((approval.project.clone(), approval.fingerprint.clone())) {
            return Err(script_trust_error(
                "STORE_CORRUPT",
                "approval store contains duplicate identities",
            ));
        }
    }
    Ok(store)
}

fn validate_stored_project(project: &ScriptTrustProjectScope) -> Result<(), String> {
    if project.canonical_project_path.is_empty()
        || !Path::new(&project.canonical_project_path).is_absolute()
    {
        return Err(script_trust_error(
            "STORE_CORRUPT",
            "approval contains a non-absolute project path",
        ));
    }
    validate_text_field("projectId", project.project_id.clone())
        .map(|_| ())
        .map_err(|error| {
            script_trust_error(
                "STORE_CORRUPT",
                &format!("approval contains an invalid project ID: {}", error),
            )
        })
}

fn write_store_atomic(path: &Path, store: &ScriptTrustStore) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        script_trust_error("IO_ERROR", "approval store path has no parent directory")
    })?;
    std::fs::create_dir_all(parent).map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("approval store directory cannot be created: {}", error),
        )
    })?;

    let mut payload = serde_json::to_vec_pretty(store).map_err(|error| {
        script_trust_error(
            "IO_ERROR",
            &format!("approval store cannot be serialized: {}", error),
        )
    })?;
    payload.push(b'\n');
    if payload.len() as u64 > SCRIPT_TRUST_STORE_MAX_BYTES {
        return Err(script_trust_error(
            "STORE_LIMIT",
            "approval store exceeds its safe size limit",
        ));
    }

    let (temporary_path, mut temporary_file) = create_temporary_store_file(parent)?;
    let write_result = (|| {
        temporary_file.write_all(&payload).map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("temporary approval store cannot be written: {}", error),
            )
        })?;
        temporary_file.sync_all().map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("temporary approval store cannot be synchronized: {}", error),
            )
        })?;
        drop(temporary_file);
        std::fs::rename(&temporary_path, path).map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("approval store cannot be atomically replaced: {}", error),
            )
        })?;
        sync_parent_directory(parent)?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    write_result
}

fn create_temporary_store_file(parent: &Path) -> Result<(PathBuf, File), String> {
    for _ in 0..32 {
        let counter = SCRIPT_TRUST_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let path = parent.join(format!(
            ".approvals-v1-{}-{}-{}.tmp",
            std::process::id(),
            nonce,
            counter
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(script_trust_error(
                    "IO_ERROR",
                    &format!("temporary approval store cannot be created: {}", error),
                ))
            }
        }
    }
    Err(script_trust_error(
        "IO_ERROR",
        "a unique temporary approval store cannot be created",
    ))
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| {
            script_trust_error(
                "IO_ERROR",
                &format!("approval store directory cannot be synchronized: {}", error),
            )
        })
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> Result<(), String> {
    Ok(())
}

fn status_for(
    store: &ScriptTrustStore,
    project: ScriptTrustProjectScope,
    fingerprints: Vec<ScriptTrustFingerprint>,
) -> ScriptTrustStatus {
    let checks = fingerprints
        .into_iter()
        .map(|fingerprint| check_for(store, &project, fingerprint))
        .collect::<Vec<_>>();
    let approved_count = checks.iter().filter(|check| check.approved).count();
    let pending_count = checks.len() - approved_count;
    let stored_approval_count = store
        .approvals
        .iter()
        .filter(|approval| approval.project == project)
        .count();
    ScriptTrustStatus {
        project,
        all_approved: pending_count == 0,
        checks,
        approved_count,
        pending_count,
        stored_approval_count,
        store_schema_version: SCRIPT_TRUST_STORE_SCHEMA_VERSION,
    }
}

fn check_for(
    store: &ScriptTrustStore,
    project: &ScriptTrustProjectScope,
    fingerprint: ScriptTrustFingerprint,
) -> ScriptTrustApprovalCheck {
    let approval = find_approval(store, project, &fingerprint);
    ScriptTrustApprovalCheck {
        fingerprint,
        approved: approval.is_some(),
        approved_at_unix_ms: approval.map(|approval| approval.approved_at_unix_ms),
    }
}

fn find_approval<'a>(
    store: &'a ScriptTrustStore,
    project: &ScriptTrustProjectScope,
    fingerprint: &ScriptTrustFingerprint,
) -> Option<&'a ScriptTrustApproval> {
    store
        .approvals
        .iter()
        .find(|approval| approval.project == *project && approval.fingerprint == *fingerprint)
}

fn sort_approvals(approvals: &mut [ScriptTrustApproval]) {
    approvals.sort_by(|left, right| {
        left.project
            .canonical_project_path
            .cmp(&right.project.canonical_project_path)
            .then_with(|| left.project.project_id.cmp(&right.project.project_id))
            .then_with(|| {
                left.fingerprint
                    .source_sha256
                    .cmp(&right.fingerprint.source_sha256)
            })
            .then_with(|| left.fingerprint.language.cmp(&right.fingerprint.language))
            .then_with(|| {
                left.fingerprint
                    .contract_version
                    .cmp(&right.fingerprint.contract_version)
            })
            .then_with(|| {
                left.fingerprint
                    .module_policy_version
                    .cmp(&right.fingerprint.module_policy_version)
            })
    });
}

fn unix_time_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| {
            script_trust_error(
                "CLOCK_ERROR",
                &format!("system clock is before the Unix epoch: {}", error),
            )
        })
}

fn script_trust_error(code: &str, message: &str) -> String {
    format!("SCRIPT_TRUST_{}: {}", code, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        app_data: PathBuf,
        project_a: PathBuf,
        project_b: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let root = std::env::temp_dir().join(format!(
                "xrift-script-trust-{}-{}-{}",
                label,
                std::process::id(),
                SCRIPT_TRUST_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let app_data = root.join("app-data");
            let project_a = root.join("project-a");
            let project_b = root.join("project-b");
            std::fs::create_dir_all(&app_data).expect("app data fixture must be created");
            std::fs::create_dir_all(&project_a).expect("project A fixture must be created");
            std::fs::create_dir_all(&project_b).expect("project B fixture must be created");
            Self {
                root,
                app_data,
                project_a,
                project_b,
            }
        }

        fn scope(&self, project_path: &Path, project_id: &str) -> ScriptTrustProjectScope {
            resolve_project_scope(ScriptTrustProjectInput {
                project_path: project_path.to_string_lossy().to_string(),
                project_id: project_id.to_string(),
            })
            .expect("fixture project scope must resolve")
        }

        fn store_path(&self) -> PathBuf {
            resolve_store_path_at(&self.app_data, None, true)
                .expect("fixture store path must resolve")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn fingerprint(source_sha256: &str) -> ScriptTrustFingerprint {
        ScriptTrustFingerprint {
            source_sha256: source_sha256.to_string(),
            language: "ts".to_string(),
            contract_version: "1.0.0".to_string(),
            module_policy_version: "1".to_string(),
            allow_remote_modules: false,
        }
    }

    fn source_a() -> ScriptTrustFingerprint {
        fingerprint("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb")
    }

    fn source_b() -> ScriptTrustFingerprint {
        fingerprint("3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d")
    }

    fn approve_at(
        store_path: &Path,
        store: &mut ScriptTrustStore,
        project: &ScriptTrustProjectScope,
        fingerprint: &ScriptTrustFingerprint,
    ) {
        store.approvals.push(ScriptTrustApproval {
            project: project.clone(),
            fingerprint: fingerprint.clone(),
            approved_at_unix_ms: 1,
        });
        sort_approvals(&mut store.approvals);
        write_store_atomic(store_path, store).expect("approval fixture must be saved");
    }

    #[test]
    fn exact_fingerprint_is_approved_only_in_the_same_project_scope() {
        let fixture = Fixture::new("scope");
        let store_path = fixture.store_path();
        let project_a = fixture.scope(&fixture.project_a, "project-a");
        let project_b = fixture.scope(&fixture.project_b, "project-a");
        let exact = source_a();
        let mut store = ScriptTrustStore::empty();
        approve_at(&store_path, &mut store, &project_a, &exact);
        let loaded = read_store(&store_path).expect("approval store must load");

        assert!(check_for(&loaded, &project_a, exact.clone()).approved);
        assert!(!check_for(&loaded, &project_a, source_b()).approved);
        assert!(!check_for(&loaded, &project_b, exact.clone()).approved);

        let same_path_different_id = ScriptTrustProjectScope {
            canonical_project_path: project_a.canonical_project_path.clone(),
            project_id: "project-b".to_string(),
        };
        assert!(!check_for(&loaded, &same_path_different_id, exact).approved);
    }

    #[test]
    fn fingerprint_field_changes_invalidate_approval() {
        let fixture = Fixture::new("fingerprint");
        let store_path = fixture.store_path();
        let project = fixture.scope(&fixture.project_a, "project-a");
        let exact = source_a();
        let mut store = ScriptTrustStore::empty();
        approve_at(&store_path, &mut store, &project, &exact);
        let loaded = read_store(&store_path).expect("approval store must load");

        for changed in [
            source_b(),
            ScriptTrustFingerprint {
                language: "tsx".to_string(),
                ..exact.clone()
            },
            ScriptTrustFingerprint {
                contract_version: "2.0.0".to_string(),
                ..exact.clone()
            },
            ScriptTrustFingerprint {
                module_policy_version: "2".to_string(),
                ..exact.clone()
            },
        ] {
            assert!(!check_for(&loaded, &project, changed).approved);
        }
    }

    #[test]
    fn corrupt_store_fails_closed_and_cannot_be_approved_over() {
        let fixture = Fixture::new("corrupt");
        let store_path = fixture.store_path();
        std::fs::write(&store_path, b"{not-json").expect("corrupt fixture must be written");
        let error = read_store(&store_path).expect_err("corrupt store must fail");
        assert!(error.starts_with("SCRIPT_TRUST_STORE_CORRUPT:"));

        let project = fixture.scope(&fixture.project_a, "project-a");
        assert!(read_store(&store_path)
            .and_then(|mut store| {
                store.approvals.push(ScriptTrustApproval {
                    project,
                    fingerprint: source_a(),
                    approved_at_unix_ms: 1,
                });
                write_store_atomic(&store_path, &store)
            })
            .is_err());
        assert_eq!(
            std::fs::read(&store_path).expect("corrupt store must remain"),
            b"{not-json"
        );
    }

    #[test]
    fn reset_one_project_preserves_other_projects_and_full_reset_recovers_corruption() {
        let fixture = Fixture::new("reset");
        let store_path = fixture.store_path();
        let project_a = fixture.scope(&fixture.project_a, "project-a");
        let project_b = fixture.scope(&fixture.project_b, "project-b");
        let mut store = ScriptTrustStore::empty();
        store.approvals.extend([
            ScriptTrustApproval {
                project: project_a.clone(),
                fingerprint: source_a(),
                approved_at_unix_ms: 1,
            },
            ScriptTrustApproval {
                project: project_b.clone(),
                fingerprint: source_a(),
                approved_at_unix_ms: 2,
            },
        ]);
        write_store_atomic(&store_path, &store).expect("approval store must be saved");

        let mut loaded = read_store(&store_path).expect("approval store must load");
        loaded
            .approvals
            .retain(|approval| approval.project != project_a);
        write_store_atomic(&store_path, &loaded).expect("project reset must save");
        let loaded = read_store(&store_path).expect("project reset must remain valid");
        assert_eq!(loaded.approvals.len(), 1);
        assert_eq!(loaded.approvals[0].project, project_b);

        std::fs::write(&store_path, b"corrupt").expect("corrupt fixture must be written");
        write_store_atomic(&store_path, &ScriptTrustStore::empty())
            .expect("full reset must recover corrupt store");
        let loaded = read_store(&store_path).expect("reset store must load");
        assert!(loaded.approvals.is_empty());
    }

    #[test]
    fn remote_modules_and_duplicate_store_entries_are_rejected() {
        let mut remote = source_a();
        remote.allow_remote_modules = true;
        assert!(validate_fingerprint(remote)
            .expect_err("remote modules must fail")
            .starts_with("SCRIPT_TRUST_REMOTE_MODULES_NOT_ALLOWED:"));

        let fixture = Fixture::new("duplicate");
        let store_path = fixture.store_path();
        let project = fixture.scope(&fixture.project_a, "project-a");
        let approval = ScriptTrustApproval {
            project,
            fingerprint: source_a(),
            approved_at_unix_ms: 1,
        };
        let store = ScriptTrustStore {
            schema_version: SCRIPT_TRUST_STORE_SCHEMA_VERSION,
            approvals: vec![approval.clone(), approval],
        };
        let payload = serde_json::to_vec(&store).expect("fixture store must serialize");
        std::fs::write(&store_path, payload).expect("fixture store must be written");
        assert!(read_store(&store_path)
            .expect_err("duplicate entries must fail")
            .starts_with("SCRIPT_TRUST_STORE_CORRUPT:"));
    }

    #[test]
    fn store_is_rejected_when_app_data_is_inside_the_project() {
        let fixture = Fixture::new("outside");
        let project = fixture.scope(&fixture.root, "project-a");
        let error = resolve_store_path_at(&fixture.app_data, Some(&project), true)
            .expect_err("project-contained store must fail");
        assert!(error.starts_with("SCRIPT_TRUST_STORE_INSIDE_PROJECT:"));
    }

    #[test]
    fn store_directory_must_be_a_real_directory_inside_app_data() {
        let fixture = Fixture::new("store-directory");
        let store_directory = fixture.app_data.join(SCRIPT_TRUST_STORE_DIRECTORY);
        std::fs::write(&store_directory, b"not a directory")
            .expect("invalid store path fixture must be written");
        let error = resolve_store_path_at(&fixture.app_data, None, false)
            .expect_err("non-directory store path must fail");
        assert!(error.starts_with("SCRIPT_TRUST_STORE_CORRUPT:"));
        std::fs::remove_file(&store_directory).expect("invalid store path must be removed");

        #[cfg(unix)]
        {
            let outside = fixture.root.join("outside-store");
            std::fs::create_dir(&outside).expect("outside store fixture must be created");
            std::os::unix::fs::symlink(&outside, &store_directory)
                .expect("store symlink fixture must be created");
            let error = resolve_store_path_at(&fixture.app_data, None, false)
                .expect_err("store directory symlink must fail");
            assert!(error.starts_with("SCRIPT_TRUST_STORE_CORRUPT:"));
            std::fs::remove_file(&store_directory).expect("store symlink must be removed");
        }
    }

    #[test]
    fn complete_app_reset_removes_script_trust_store() {
        let fixture = Fixture::new("app-reset");
        let store_path = fixture.store_path();
        std::fs::write(&store_path, b"{\"schemaVersion\":1,\"approvals\":[]}\n")
            .expect("approval fixture must be written");

        reset_script_trust_store_for_app_reset(&fixture.app_data)
            .expect("complete app reset must remove approval store");

        assert!(
            !fixture.app_data.join(SCRIPT_TRUST_STORE_DIRECTORY).exists(),
            "approval store directory must not survive a complete app reset"
        );
    }
}
