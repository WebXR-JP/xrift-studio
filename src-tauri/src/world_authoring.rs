use super::*;
use std::io::{BufRead, Write};

static JOURNAL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
const JOURNAL_CACHE_LIMIT: usize = 64;
#[derive(Clone, PartialEq, Eq)]
struct JournalStamp { length: u64, modified: std::time::SystemTime }
struct JournalCacheEntry { path: PathBuf, stamp: JournalStamp, latest: Option<serde_json::Value> }
static JOURNAL_CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::VecDeque<JournalCacheEntry>>> = std::sync::OnceLock::new();

fn journal_stamp(path: &Path) -> Option<JournalStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    Some(JournalStamp { length: metadata.len(), modified: metadata.modified().ok()? })
}
fn cache_journal(path: &Path, stamp: JournalStamp, latest: Option<serde_json::Value>) {
    let Ok(mut cache) = JOURNAL_CACHE.get_or_init(Default::default).lock() else { return; };
    if let Some(index) = cache.iter().position(|entry| entry.path == path) { cache.remove(index); }
    cache.push_back(JournalCacheEntry { path: path.to_path_buf(), stamp, latest });
    while cache.len() > JOURNAL_CACHE_LIMIT { cache.pop_front(); }
}

pub(super) fn ignore_generated_directory(root: &Path, entry: &str) -> Result<(), String> {
    let path = safe_join_path(root, ".gitignore")?;
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    if !text.lines().any(|line| line.trim() == entry) {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        let prefix = if text.is_empty() || text.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        file.write_all(format!("{prefix}{entry}\n").as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn journal_path(project_path: &str, scene_id: &str) -> Result<PathBuf, String> {
    if scene_id.is_empty()
        || scene_id.len() > 128
        || !scene_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Scene IDが不正です。".into());
    }
    let root = canonical_project_root(project_path)?;
    if !root.join(VISUAL_PROJECT_MANIFEST).is_file() {
        return Err("制作プロジェクトが見つかりません。".into());
    }
    safe_join_path(&root, &format!(".xrift-authoring/{scene_id}.jsonl"))
}

fn read_latest(path: &Path) -> Result<Option<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let stamp = journal_stamp(path);
    if let Some(stamp) = &stamp {
        if let Ok(mut cache) = JOURNAL_CACHE.get_or_init(Default::default).lock() {
            if let Some(index) = cache.iter().position(|entry| entry.path == path) {
                let entry = cache.remove(index).unwrap();
                if entry.stamp == *stamp {
                    let latest = entry.latest.clone();
                    cache.push_back(entry);
                    return Ok(latest);
                }
            }
        }
    }
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut latest = None;
    for line in std::io::BufReader::new(file).lines() {
        let line = line.map_err(|e| e.to_string())?;
        latest = Some(
            serde_json::from_str(&line)
                .map_err(|_| "制作履歴が破損しています。履歴を確認してください。".to_string())?,
        );
    }
    // An external update requires a complete read again. Never mark a moving
    // file as current, nor cache a parse failure or an unflushed future state.
    if let Some(stamp) = stamp.filter(|stamp| journal_stamp(path).as_ref() == Some(stamp)) {
        cache_journal(path, stamp, latest.clone());
    }
    Ok(latest)
}

fn authoring_text(value: &serde_json::Value, max: usize) -> bool {
    value.as_str().is_some_and(|value| !value.trim().is_empty() && value.encode_utf16().count() <= max
        && !value.chars().any(|character| character <= '\u{8}' || ('\u{b}'..='\u{1f}').contains(&character) || character == '\u{7f}'))
}
fn authoring_count(value: &serde_json::Value) -> bool { value.as_u64().is_some_and(|value| value <= 1_000_000) }
fn authoring_fingerprint(value: &serde_json::Value) -> bool {
    value.as_str().is_some_and(|value| !value.is_empty() && value.encode_utf16().count() <= 256
        && !value.chars().any(|character| character <= '\u{1f}' || character == '\u{7f}'))
}
fn only_authoring_keys(value: &serde_json::Value, allowed: &[&str]) -> bool {
    value.as_object().is_some_and(|value| value.keys().all(|key| allowed.contains(&key.as_str())))
}
fn authoring_progress_valid(progress: &serde_json::Value, writes: u64) -> bool {
    if !only_authoring_keys(progress, &["version", "observations"]) || progress["version"] != 1 { return false; }
    let Some(observations) = progress["observations"].as_array().filter(|items| items.len() <= 16) else { return false; };
    let mut previous_pass = 0;
    for (index, observation) in observations.iter().enumerate() {
        if !only_authoring_keys(observation, &["pass", "planFingerprint", "beforeFingerprint", "afterFingerprint", "kind", "stalledPasses", "repeatedPlanPasses", "cycleLength"]) { return false; }
        let Some(pass) = observation["pass"].as_u64().filter(|pass| *pass > previous_pass && *pass <= writes) else { return false; };
        let Some(stalled) = observation["stalledPasses"].as_u64().filter(|count| *count <= pass) else { return false; };
        let Some(repeated) = observation["repeatedPlanPasses"].as_u64().filter(|count| *count <= stalled) else { return false; };
        if ["planFingerprint", "beforeFingerprint", "afterFingerprint"].iter().any(|key| !authoring_fingerprint(&observation[*key])) { return false; }
        let Some(kind) = observation["kind"].as_str() else { return false; };
        let unchanged = observation["beforeFingerprint"] == observation["afterFingerprint"];
        match kind {
            "changed" if unchanged || stalled != 0 || repeated != 0 => return false,
            "unchanged" if !unchanged || stalled == 0 || repeated != 1 => return false,
            "repeated-plan" if !unchanged || stalled == 0 || repeated < 2 => return false,
            "cycle" if unchanged || stalled == 0 || repeated == 0
                || !observation["cycleLength"].as_u64().is_some_and(|length| length >= 2 && length <= 17 && length <= pass) => return false,
            "changed" | "unchanged" | "repeated-plan" | "cycle" => {},
            _ => return false,
        }
        if kind != "cycle" && observation.get("cycleLength").is_some() { return false; }
        if let Some(previous) = index.checked_sub(1).map(|index| &observations[index]) {
            let continuous = previous["afterFingerprint"] == observation["beforeFingerprint"];
            if kind != "changed" {
                let previous_stalled = previous["stalledPasses"].as_u64().unwrap_or(0);
                let expected_stalled = if continuous { previous_stalled + 1 } else { 1 };
                let expected_repeated = if continuous && previous_stalled > 0 && previous["planFingerprint"] == observation["planFingerprint"] {
                    previous["repeatedPlanPasses"].as_u64().unwrap_or(0) + 1
                } else { 1 };
                if stalled != expected_stalled || repeated != expected_repeated { return false; }
            }
            if continuous && !unchanged {
                for previous_index in (0..index).rev() {
                    let prior = &observations[previous_index];
                    if prior["beforeFingerprint"] == observation["afterFingerprint"] {
                        if kind != "cycle" || observation["cycleLength"].as_u64() != Some((index - previous_index + 1) as u64) { return false; }
                        break;
                    }
                    if previous_index == 0 || observations[previous_index - 1]["afterFingerprint"] != prior["beforeFingerprint"] { break; }
                }
            }
        }
        previous_pass = pass;
    }
    true
}

/// The frontend owns Scene comparisons; the journal boundary still rejects
/// malformed budgets, counters and completion claims before writing to disk.
fn validate_authoring_state(state: &serde_json::Value) -> Result<(), String> {
    let invalid = || "制作状態の形式または完了証跡を確認してください。".to_string();
    if state["version"] != 1 || !authoring_count(&state["sequence"]) || !authoring_text(&state["blueprint"], 20_000)
        || !authoring_text(&state["activity"]["tool"], 128) || !authoring_text(&state["activity"]["at"], 64)
        || !authoring_text(&state["activity"]["fingerprint"], 256) { return Err(invalid()); }
    let criteria = state["criteria"].as_array().ok_or_else(invalid)?;
    if criteria.is_empty() || criteria.len() > 100 || criteria.iter().any(|criterion| !authoring_text(criterion, 1000))
        || criteria.iter().map(|criterion| criterion.as_str().unwrap()).collect::<std::collections::HashSet<_>>().len() != criteria.len() { return Err(invalid()); }
    let captures = state["captures"].as_object().ok_or_else(invalid)?;
    for (view, capture) in captures {
        if !["spawn", "iso"].contains(&view.as_str()) || capture["view"].as_str() != Some(view) || !authoring_text(&capture["id"], 160)
            || !authoring_text(&capture["fingerprint"], 256) || !authoring_text(&capture["path"], 4096) { return Err(invalid()); }
    }
    let reviews = state["reviews"].as_object().ok_or_else(invalid)?;
    for (criterion, review) in reviews {
        let ids = review["captureIds"].as_array().ok_or_else(invalid)?;
        if !criteria.iter().any(|value| value.as_str() == Some(criterion)) || !review["passed"].is_boolean() || !authoring_text(&review["reason"], 5000)
            || ids.len() != 2 || ids[0] == ids[1] || ids.iter().any(|id| !authoring_text(id, 160))
            || review.get("fingerprint").is_some_and(|value| !authoring_text(value, 256)) { return Err(invalid()); }
    }
    for field in ["completedFingerprint", "savedFingerprint"] {
        if state.get(field).is_some_and(|value| !value.is_null() && !authoring_text(value, 256)) { return Err(invalid()); }
    }
    if let Some(run) = state.get("run") {
        if !authoring_text(&run["id"], 160) || !authoring_text(&run["startedAt"], 64) || ["writes", "passes", "noProgress", "consecutiveFailures"].iter().any(|key| !authoring_count(&run[*key]))
            || !run["lastInspectedFingerprint"].is_null() && !authoring_text(&run["lastInspectedFingerprint"], 256)
            || !run["terminalReason"].is_null() && !["write-limit", "pass-limit", "no-progress", "failure-limit", "elapsed-limit", "cancelled", "completed"].contains(&run["terminalReason"].as_str().unwrap_or("")) { return Err(invalid()); }
        let budget = run["budget"].as_object().ok_or_else(invalid)?;
        let ranges = [("maxWrites", 1, 4096), ("maxPasses", 1, 32), ("maxNoProgress", 1, 6), ("maxConsecutiveFailures", 1, 6), ("maxElapsedMs", 1000, 3_600_000)];
        if budget.len() != ranges.len() || ranges.iter().any(|(key, min, max)| !budget[*key].as_u64().is_some_and(|value| value >= *min && value <= *max)) { return Err(invalid()); }
        if let Some(pending) = run.get("pendingWrite") {
            if !authoring_text(&pending["requestId"], 160) || !authoring_text(&pending["fingerprint"], 256)
                || pending.get("planFingerprint").is_some_and(|value| !authoring_fingerprint(value))
                || pending.get("progressFingerprint").is_some_and(|value| !authoring_fingerprint(value)) { return Err(invalid()); }
        }
        if run.get("progress").is_some_and(|progress| !authoring_progress_valid(progress, run["writes"].as_u64().unwrap_or(0))) { return Err(invalid()); }
        let journal = run["journal"].as_array().ok_or_else(invalid)?;
        if journal.len() > 128 { return Err(invalid()); }
        for event in journal {
            if !authoring_count(&event["sequence"]) || !["begin", "write-start", "write-changed", "write-noop", "write-failed", "capture", "review", "complete", "cancel", "scene-changed"].contains(&event["kind"].as_str().unwrap_or(""))
                || !authoring_text(&event["tool"], 128) || !authoring_text(&event["at"], 64) || !authoring_text(&event["fingerprint"], 256)
                || event.get("reason").is_some_and(|value| !authoring_text(value, 600)) { return Err(invalid()); }
        }
    }
    if let Some(fingerprint) = state["completedFingerprint"].as_str() {
        // Legacy entries may be read, but a new completion must carry saved,
        // current captures and a current verdict for every original criterion.
        if state["savedFingerprint"].as_str() != Some(fingerprint) || state["run"]["pendingWrite"].is_object()
            || state["run"]["terminalReason"] == "cancelled" { return Err(invalid()); }
        for view in ["spawn", "iso"] { if state["captures"][view]["fingerprint"].as_str() != Some(fingerprint) { return Err(invalid()); } }
        for criterion in criteria {
            let review = &state["reviews"][criterion.as_str().unwrap()];
            if review["passed"] != true || review["fingerprint"].as_str() != Some(fingerprint)
                || !["spawn", "iso"].iter().all(|view| review["captureIds"].as_array().is_some_and(|ids| ids.contains(&state["captures"][*view]["id"]))) { return Err(invalid()); }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_world_authoring(
    project_path: String,
    scene_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let _lock = JOURNAL_LOCK.lock().map_err(|e| e.to_string())?;
    read_latest(&journal_path(&project_path, &scene_id)?)
}

#[tauri::command]
pub fn read_world_authoring_images(
    app: AppHandle,
    project_path: String,
    scene_id: String,
    fingerprint: String,
) -> Result<Vec<serde_json::Value>, String> {
    use base64::Engine;
    let state = read_world_authoring(project_path, scene_id)?;
    let Some(state) = state else {
        return Ok(vec![]);
    };
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("debug-captures");
    let mut images = vec![];
    for view in ["spawn", "iso"] {
        let capture = &state["captures"][view];
        if capture["fingerprint"].as_str() != Some(fingerprint.as_str()) {
            continue;
        }
        let Some(path) = capture["path"].as_str() else {
            continue;
        };
        // Use only a registered regular PNG inside Studio's own capture directory.
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let path = PathBuf::from(path);
        let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > 8 * 1024 * 1024
        {
            return Err("保存された画像を読み取れません。撮り直してください。".into());
        }
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        if !path.starts_with(&root) {
            return Err("画像がStudioの保存先の外にあります。".into());
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        if !bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
            return Err("画像がPNGではありません。".into());
        }
        images.push(serde_json::json!({"view": view, "captureId": capture["id"], "mimeType": "image/png", "data": base64::engine::general_purpose::STANDARD.encode(bytes)}));
    }
    Ok(images)
}

#[tauri::command]
pub fn save_world_authoring(
    project_path: String,
    scene_id: String,
    expected_sequence: u64,
    state: serde_json::Value,
) -> Result<(), String> {
    let _lock = JOURNAL_LOCK.lock().map_err(|e| e.to_string())?;
    let path = journal_path(&project_path, &scene_id)?;
    let current = read_latest(&path)?;
    let sequence = current
        .as_ref()
        .and_then(|v| v["sequence"].as_u64())
        .unwrap_or(0);
    if sequence != expected_sequence || state["sequence"].as_u64() != Some(sequence + 1) {
        return Err("制作履歴が更新されています。状態を読み直してください。".into());
    }
    validate_authoring_state(&state)?;
    if let Some(previous) = current.as_ref().filter(|previous| previous["run"].is_object() && previous["run"]["id"] == state["run"]["id"]) {
        if previous["run"]["budget"] != state["run"]["budget"] || ["writes", "passes"].iter().any(|key| state["run"][*key].as_u64().unwrap_or(0) < previous["run"][*key].as_u64().unwrap_or(0)) {
            return Err("同じ制作の上限と累積回数はリセットできません。".into());
        }
        if let Some(progress) = previous["run"].get("progress") {
            let next = state["run"].get("progress").ok_or("同じ制作の進展記録は削除できません。")?;
            let old_observations = progress["observations"].as_array().ok_or("制作の進展記録を確認してください。")?;
            let next_observations = next["observations"].as_array().ok_or("制作の進展記録を確認してください。")?;
            if let Some(old_last) = old_observations.last() {
                let old_pass = old_last["pass"].as_u64().ok_or("制作の進展記録を確認してください。")?;
                let next_pass = next_observations.last().and_then(|entry| entry["pass"].as_u64()).unwrap_or(0);
                if next_pass < old_pass || next_pass == old_pass && next != progress
                    || next_pass > old_pass && next_observations.iter().find(|entry| entry["pass"].as_u64() == Some(old_pass)).is_some_and(|entry| entry != old_last) {
                    return Err("同じ制作の進展記録は巻き戻せません。".into());
                }
            }
        }
    }
    let mut bytes = serde_json::to_vec(&state).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("制作状態が大きすぎます。".into());
    }
    bytes.push(b'\n');
    ignore_generated_directory(
        &canonical_project_root(&project_path)?,
        "/.xrift-authoring/",
    )?;
    std::fs::create_dir_all(path.parent().ok_or("保存先が不正です。")?)
        .map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let previous_length = file.metadata().map_err(|error| error.to_string())?.len();
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    // The append is durable before it becomes a cached receipt. If another
    // writer changed the length, read and validate that file on the next call.
    // Windows can finalize last-write time when the writer closes its handle.
    drop(file);
    if let Some(stamp) = journal_stamp(&path).filter(|stamp| stamp.length == previous_length + bytes.len() as u64) {
        cache_journal(&path, stamp, Some(state));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "xrift-authoring-{}",
            recording_random_id().unwrap()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join(VISUAL_PROJECT_MANIFEST), "{}").unwrap();
        root.canonicalize().unwrap()
    }
    fn state() -> serde_json::Value {
        serde_json::json!({"version":1,"sequence":1,"blueprint":"courtyard","criteria":["Tree visible"],
            "captures":{},"reviews":{},"completedFingerprint":null,"savedFingerprint":"scene-a",
            "activity":{"tool":"begin_world_authoring","at":"2026-10-17T00:00:00.000Z","fingerprint":"scene-a"},
            "run":{"id":"run-a","budget":{"maxWrites":256,"maxPasses":8,"maxNoProgress":3,"maxConsecutiveFailures":3,"maxElapsedMs":900000},
              "startedAt":"2026-10-17T00:00:00.000Z","writes":0,"passes":0,"noProgress":0,"consecutiveFailures":0,
              "lastInspectedFingerprint":null,"terminalReason":null,"journal":[]}})
    }
    #[test]
    fn journal_persists_and_rejects_stale_writes() {
        let root = project();
        let path = root.to_string_lossy().to_string();
        let value = state();
        save_world_authoring(path.clone(), "scene".into(), 0, value.clone()).unwrap();
        assert_eq!(
            read_world_authoring(path.clone(), "scene".into()).unwrap(),
            Some(value.clone())
        );
        assert!(save_world_authoring(path.clone(), "scene".into(), 0, value).is_err());
        assert!(read_world_authoring(path, "../escape".into()).is_err());
        assert!(std::fs::read_to_string(root.join(".gitignore"))
            .unwrap()
            .contains("/.xrift-authoring/"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_journal_is_not_silently_discarded() {
        let root = project();
        let file = root.join("damaged.jsonl");
        std::fs::write(&file, "{\"sequence\":1}\n{broken").unwrap();
        assert!(read_latest(&file).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn ignore_entries_preserve_existing_content_and_are_idempotent() {
        let root = project();
        std::fs::write(root.join(".gitignore"), "assets/private").unwrap();
        ignore_generated_directory(&root, "/Recording/").unwrap();
        ignore_generated_directory(&root, "/Recording/").unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join(".gitignore")).unwrap(),
            "assets/private\n/Recording/\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn finite_run_budget_and_counters_cannot_reset_inside_one_run() {
        let root = project();
        let path = root.to_string_lossy().to_string();
        let mut current = state();
        current["run"]["writes"] = 2.into();
        save_world_authoring(path.clone(), "scene".into(), 0, current.clone()).unwrap();
        let mut next = current.clone(); next["sequence"] = 2.into(); next["run"]["writes"] = 1.into();
        assert!(save_world_authoring(path.clone(), "scene".into(), 1, next).is_err());
        let mut next = current.clone(); next["sequence"] = 2.into(); next["run"]["budget"]["maxWrites"] = 300.into();
        assert!(save_world_authoring(path.clone(), "scene".into(), 1, next).is_err());
        let mut next = current; next["sequence"] = 2.into(); next["run"]["id"] = "explicit-new-run".into(); next["run"]["writes"] = 0.into();
        save_world_authoring(path, "scene".into(), 1, next).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
    fn progress_observation(pass: u64, before: &str, after: &str, kind: &str, stalled: u64, repeated: u64) -> serde_json::Value {
        serde_json::json!({"pass":pass,"planFingerprint":"canonical-plan-sha","beforeFingerprint":before,"afterFingerprint":after,
            "kind":kind,"stalledPasses":stalled,"repeatedPlanPasses":repeated})
    }
    #[test]
    fn progress_and_semantic_plan_receipts_round_trip_without_resetting_counters() {
        let root = project(); let path = root.to_string_lossy().to_string();
        let mut value = state();
        value["run"]["writes"] = 1.into();
        value["run"]["progress"] = serde_json::json!({"version":1,"observations":[progress_observation(1,"a","b","changed",0,0)]});
        value["run"]["pendingWrite"] = serde_json::json!({"requestId":"next-write","fingerprint":"b","planFingerprint":"canonical-semantic-plan","progressFingerprint":"semantic-r3f-scene"});
        save_world_authoring(path.clone(), "scene".into(), 0, value.clone()).unwrap();
        assert_eq!(read_world_authoring(path.clone(), "scene".into()).unwrap(), Some(value.clone()));
        let mut cycle = progress_observation(2,"b","a","cycle",1,1); cycle["cycleLength"] = 2.into();
        value["sequence"] = 2.into(); value["run"]["writes"] = 2.into();
        value["run"]["progress"]["observations"].as_array_mut().unwrap().push(cycle);
        value["run"].as_object_mut().unwrap().remove("pendingWrite");
        save_world_authoring(path.clone(), "scene".into(), 1, value.clone()).unwrap();
        let restored = read_world_authoring(path, "scene".into()).unwrap().unwrap();
        assert_eq!(restored["run"]["writes"], 2);
        assert_eq!(restored["run"]["progress"]["observations"][1]["stalledPasses"], 1);
        assert_eq!(restored["run"]["progress"]["observations"][1]["cycleLength"], 2);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_progress_and_pending_semantic_hashes_are_rejected_at_durable_boundary() {
        let mut valid = state(); valid["run"]["writes"] = 2.into();
        valid["run"]["progress"] = serde_json::json!({"version":1,"observations":[progress_observation(1,"a","b","changed",0,0), {
            "pass":2,"planFingerprint":"canonical-plan-sha","beforeFingerprint":"b","afterFingerprint":"a","kind":"cycle","stalledPasses":1,"repeatedPlanPasses":1,"cycleLength":2}]});
        validate_authoring_state(&valid).unwrap();
        for (pointer, bad) in [
            ("/run/progress/version", serde_json::json!(2)),
            ("/run/progress/observations/1/pass", serde_json::json!(3)),
            ("/run/progress/observations/1/kind", serde_json::json!("improved")),
            ("/run/progress/observations/1/cycleLength", serde_json::json!(1)),
            ("/run/progress/observations/1/stalledPasses", serde_json::json!(0)),
            ("/run/progress/observations/1/repeatedPlanPasses", serde_json::json!(2)),
            ("/run/progress/observations/1/planFingerprint", serde_json::json!("bad\nsource")),
        ] {
            let mut value = valid.clone(); *value.pointer_mut(pointer).unwrap() = bad;
            assert!(validate_authoring_state(&value).is_err(), "{pointer}");
        }
        let mut value = valid.clone(); value["run"]["progress"]["rawSource"] = "must not enter the digest journal".into();
        assert!(validate_authoring_state(&value).is_err());
        let mut value = valid.clone(); value["run"]["progress"]["observations"] = serde_json::json!(vec![progress_observation(1,"a","b","changed",0,0);17]);
        assert!(validate_authoring_state(&value).is_err());
        for bad in [serde_json::json!(null), serde_json::json!(""), serde_json::json!("bad\nplan"), serde_json::json!("a".repeat(257))] {
            let mut value = valid.clone(); value["run"]["pendingWrite"] = serde_json::json!({"requestId":"pending","fingerprint":"a","planFingerprint":bad});
            assert!(validate_authoring_state(&value).is_err());
            let mut value = valid.clone(); value["run"]["pendingWrite"] = serde_json::json!({"requestId":"pending","fingerprint":"a","progressFingerprint":bad});
            assert!(validate_authoring_state(&value).is_err());
        }
    }
    #[test]
    fn a_same_run_cannot_erase_or_rewrite_persisted_progress() {
        let root = project(); let path = root.to_string_lossy().to_string();
        let mut current = state(); current["run"]["writes"] = 2.into();
        current["run"]["progress"] = serde_json::json!({"version":1,"observations":[progress_observation(1,"a","a","unchanged",1,1), progress_observation(2,"a","a","repeated-plan",2,2)]});
        save_world_authoring(path.clone(), "scene".into(), 0, current.clone()).unwrap();
        let mut next = current.clone(); next["sequence"] = 2.into(); next["run"].as_object_mut().unwrap().remove("progress");
        assert!(save_world_authoring(path.clone(), "scene".into(), 1, next).is_err());
        let mut next = current.clone(); next["sequence"] = 2.into(); next["run"]["progress"]["observations"].as_array_mut().unwrap().pop();
        assert!(save_world_authoring(path.clone(), "scene".into(), 1, next).is_err());
        let mut next = current.clone(); next["sequence"] = 2.into(); next["run"]["progress"]["observations"][1]["planFingerprint"] = "rewritten-plan".into();
        assert!(save_world_authoring(path.clone(), "scene".into(), 1, next).is_err());
        assert_eq!(read_world_authoring(path.clone(), "scene".into()).unwrap(), Some(current.clone()));
        // A new explicit run owns a fresh progress chain, as it owns fresh budgets.
        let mut next = current; next["sequence"] = 2.into(); next["run"]["id"] = "new-run".into();
        next["run"]["writes"] = 0.into(); next["run"].as_object_mut().unwrap().remove("progress");
        save_world_authoring(path, "scene".into(), 1, next).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_runtime_records_and_forged_completion_are_rejected() {
        for pointer in ["/run/budget/maxWrites", "/run/budget/maxPasses", "/run/budget/maxNoProgress", "/run/budget/maxConsecutiveFailures", "/run/budget/maxElapsedMs"] {
            let mut value = state(); *value.pointer_mut(pointer).unwrap() = 0.into();
            assert!(validate_authoring_state(&value).is_err(), "{pointer}");
        }
        let mut value = state(); value["run"]["writes"] = (-1).into(); assert!(validate_authoring_state(&value).is_err());
        let mut value = state(); value["run"]["terminalReason"] = "unknown".into(); assert!(validate_authoring_state(&value).is_err());
        let mut value = state(); value["completedFingerprint"] = "scene-a".into(); assert!(validate_authoring_state(&value).is_err());
        value["captures"] = serde_json::json!({"spawn":{"id":"s","view":"spawn","fingerprint":"scene-a","path":"/captures/s.png"},
            "iso":{"id":"i","view":"iso","fingerprint":"scene-a","path":"/captures/i.png"}});
        value["reviews"] = serde_json::json!({"Tree visible":{"passed":true,"reason":"Visible in both actual captures","captureIds":["s","i"],"fingerprint":"scene-a"}});
        value["run"]["terminalReason"] = "completed".into();
        validate_authoring_state(&value).unwrap();
        value["savedFingerprint"] = "scene-old".into(); assert!(validate_authoring_state(&value).is_err());
        value["savedFingerprint"] = "scene-a".into(); value["reviews"]["Tree visible"]["fingerprint"] = "scene-old".into(); assert!(validate_authoring_state(&value).is_err());
        value["reviews"]["Tree visible"]["fingerprint"] = "scene-a".into(); value["run"]["pendingWrite"] = serde_json::json!({"requestId":"pending","fingerprint":"scene-a"});
        assert!(validate_authoring_state(&value).is_err());
    }
    #[test]
    fn journal_cache_keeps_disk_authoritative_after_external_updates_and_corruption() {
        let root = project();
        let path = root.to_string_lossy().to_string();
        let first = state();
        save_world_authoring(path.clone(), "scene".into(), 0, first.clone()).unwrap();
        let file = root.join(".xrift-authoring/scene.jsonl");
        assert_eq!(read_latest(&file).unwrap(), Some(first.clone()));
        let mut next = first; next["sequence"] = 2.into(); next["blueprint"] = "external courtyard revision".into();
        std::fs::OpenOptions::new().append(true).open(&file).unwrap()
            .write_all(format!("{}\n", next).as_bytes()).unwrap();
        assert_eq!(read_latest(&file).unwrap(), Some(next.clone()), "a longer externally appended journal invalidates the cache");
        // Same-length replacement also invalidates when its mtime changes.
        let old_stamp = journal_stamp(&file).unwrap();
        let modified = old_stamp.modified + std::time::Duration::from_secs(2);
        let mut replaced = next; replaced["blueprint"] = "external courtyard revisioN".into();
        let original_bytes = std::fs::read_to_string(&file).unwrap();
        let replaced_bytes = original_bytes.replacen("external courtyard revision", "external courtyard revisioN", 1);
        assert_eq!(original_bytes.len(), replaced_bytes.len());
        std::fs::write(&file, replaced_bytes).unwrap();
        std::fs::File::options().write(true).open(&file).unwrap().set_times(std::fs::FileTimes::new().set_modified(modified)).unwrap();
        assert_eq!(read_latest(&file).unwrap(), Some(replaced));
        std::fs::OpenOptions::new().append(true).open(&file).unwrap().write_all(b"{broken\n").unwrap();
        assert!(read_latest(&file).is_err(), "cached success never hides an externally corrupted journal");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn journal_cache_evicts_old_entries_at_a_fixed_capacity() {
        let root = project();
        for index in 0..JOURNAL_CACHE_LIMIT + 4 {
            let file = root.join(format!("cached-{index}.jsonl"));
            std::fs::write(&file, "{\"sequence\":1}\n").unwrap();
            read_latest(&file).unwrap();
        }
        assert!(JOURNAL_CACHE.get().unwrap().lock().unwrap().len() <= JOURNAL_CACHE_LIMIT);
        std::fs::remove_dir_all(root).unwrap();
    }
}
