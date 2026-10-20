//! Pi runs out of process on Studio's managed Node. Only the native process
//! obtains OAuth credentials; the WebView receives bounded public progress.
use super::*;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::ipc::Channel;
pub(super) struct ActiveInput {
    pub generation_id: String,
    project_id: String,
    scene_id: String,
    session_id: String,
    sender: tokio::sync::mpsc::UnboundedSender<super::pi_transport::Input>,
    control: Arc<GenerationControl>,
}

#[tauri::command]
pub async fn chatgpt_pi_message(
    state: tauri::State<'_, ChatgptState>,
    generation_id: String,
    project_id: String,
    scene_id: String,
    session_id: String,
    id: String,
    prompt: String,
    delivery: String,
    attached_entity_ids: Option<Vec<String>>,
    attached_material_ids: Option<Vec<String>>,
) -> Result<(), String> {
    if !valid_history_id(&id) || prompt.trim().is_empty() || prompt.chars().count() > 2000
        || !matches!(delivery.as_str(), "steer" | "follow_up")
        || attached_entity_ids.as_ref().is_some_and(|ids| ids.len() > 100 || ids.iter().any(|id| id.len() > 512))
        || attached_material_ids.as_ref().is_some_and(|ids| ids.len() > 16 || ids.iter().any(|id| id.len() > 512)) {
        return Err("追加指示の内容を確認してください".into());
    }
    let (acknowledgement, reply) = tokio::sync::oneshot::channel();
    {
        let active = state.7.lock().map_err(|_| "制作中の依頼を確認できませんでした")?;
        let active = active.as_ref().ok_or("制作の準備中か応答が終了しています。入力を残したまま、もう一度送信してください")?;
        if active.generation_id != generation_id || active.project_id != project_id || active.scene_id != scene_id
            || active.session_id != session_id || active.control.cancelled.load(Ordering::Acquire) {
            return Err("追加指示の対象が変わりました。開いているSceneとチャットを確認してください".into());
        }
        active.sender.send(super::pi_transport::Input {
            message: json!({"id":id, "prompt":prompt, "delivery":delivery, "attachedEntityIds":attached_entity_ids, "attachedMaterialIds":attached_material_ids}),
            acknowledgement,
        }).map_err(|_| "この依頼は応答を終了しています。新しい依頼として送ってください")?;
    }
    reply.await.map_err(|_| "追加指示の受信を確認できませんでした。入力を確認して再送してください")?
}

fn valid_history_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
}
fn digest_key(values: &[&str]) -> String {
    let mut hash = Sha256::new();
    for value in values {
        hash.update((value.len() as u64).to_be_bytes());
        hash.update(value.as_bytes());
    }
    URL_SAFE_NO_PAD.encode(hash.finalize())
}
#[tauri::command]
pub async fn chatgpt_pi_delete_history(
    app: AppHandle,
    state: tauri::State<'_, ChatgptState>,
    project_id: String,
    scene_id: String,
    session_id: String,
) -> Result<(), String> {
    let _lease = begin_generation(&state, None)?;
    if !valid_history_id(&session_id) || project_id.is_empty() || scene_id.is_empty() {
        return Err("会話履歴のIDが不正です".into());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| "制作の保存先を開けません")?
        .join("pi")
        .join("sessions")
        .join(digest_key(&[&project_id, &scene_id]))
        .join(format!("{}.jsonl", digest_key(&[&session_id])));
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => {
            Err("制作の詳細履歴を削除できませんでした。履歴を保持したまま再試行してください".into())
        }
    }
}
fn pinned_package(source: &str) -> Result<(&str, &str), String> {
    let invalid =
        || "追加機能はnpm:package@1.2.3のように、正確なバージョンを指定してください".to_string();
    let spec = source.strip_prefix("npm:").ok_or_else(invalid)?;
    let (name, version) = spec.rsplit_once('@').ok_or_else(invalid)?;
    let parts: Vec<&str> = name.strip_prefix('@').unwrap_or(name).split('/').collect();
    if source.len() > 240
        || parts.len() != if name.starts_with('@') { 2 } else { 1 }
        || parts.iter().any(|part| {
            part.is_empty()
                || part.starts_with('.')
                || part.starts_with('-')
                || !part.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_.".contains(&byte)
                })
        })
        || semver::Version::parse(version).is_err()
    {
        return Err(invalid());
    }
    Ok((name, version))
}
async fn prepare_packages(
    root: &std::path::Path,
    sources: &[String],
    paths: &crate::RuntimePaths,
    control: &GenerationControl,
    progress: &Channel<Value>,
) -> Result<Vec<Value>, String> {
    let mut packages = Vec::new();
    for source in sources {
        let (name, version) = pinned_package(source)?;
        let install_root = root.join("packages").join(digest_key(&[source]));
        let package_root = install_root.join("node_modules").join(name);
        let marker = install_root.join("installed.json");
        if !marker.is_file() || !package_root.join("package.json").is_file() {
            progress.send(json!({ "type": "progress", "message": format!("追加機能を導入しています：{source}") })).map_err(|_| "制作画面との接続が終了しました")?;
            tokio::fs::create_dir_all(&install_root)
                .await
                .map_err(|_| "追加機能の保存先を作れませんでした")?;
            let mut command = tokio::process::Command::new(&paths.node_exe);
            crate::configure_runtime_command(&mut command, paths);
            command
                .current_dir(&install_root)
                .arg(&paths.npm_cli_js)
                .arg("install")
                .arg("--prefix")
                .arg(&install_root)
                .arg("--ignore-scripts")
                .arg("--no-audit")
                .arg("--no-fund")
                .arg("--save-exact")
                .arg("--legacy-peer-deps")
                .arg("--registry=https://npm.flatt.tech/")
                .arg(format!("{name}@{version}"))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true);
            let status = run_cancellable(control, Duration::from_secs(120), async {
                command
                    .status()
                    .await
                    .map_err(|_| "追加機能の導入を開始できませんでした".to_string())
            })
            .await?;
            if !status.success() {
                return Err(format!("追加機能の導入に失敗しました：{source}。設定を修正または無効化して再試行してください"));
            }
            let manifest: Value = serde_json::from_slice(
                &tokio::fs::read(package_root.join("package.json"))
                    .await
                    .map_err(|_| "導入した追加機能を確認できません")?,
            )
            .map_err(|_| "追加機能のpackage.jsonが不正です")?;
            if manifest["name"] != name || manifest["version"] != version {
                return Err("追加機能の名前またはバージョンが一致しません".into());
            }
            tokio::fs::write(&marker, source)
                .await
                .map_err(|_| "追加機能の導入結果を保存できません")?;
        }
        packages.push(json!({ "source": source, "path": package_root }));
    }
    Ok(packages)
}

fn readonly(name: &str) -> bool {
    [
        "get_",
        "list_",
        "inspect_",
        "analyze_",
        "sample_",
        "validate_",
        "simulate_",
        "search_",
    ]
    .iter()
    .any(|prefix| name.starts_with(*prefix))
}
fn allowed(name: &str) -> bool {
    if matches!(
        name,
        "get_modeling_tools"
            | "create_blender_model"
            | "save_scene"
            | "capture_scene_view"
            | "set_scene_view_camera"
    ) {
        return true;
    }
    crate::mcp::MCP_TOOL_SURFACES.iter().any(|(tool, surface)| {
        *tool == name
            && matches!(
                *surface,
                "document" | "async-document" | "local-asset" | "script" | "external-store"
            )
    }) && !matches!(name, "set_play_mode" | "set_project_thumbnail")
}
fn tools() -> Vec<Value> {
    crate::mcp::tool_definitions()
        .as_array()
        .unwrap()
        .iter()
        .filter(|tool| allowed(tool["name"].as_str().unwrap_or_default()))
        .map(|tool| {
            let mut tool = tool.clone();
            tool["readOnly"] = json!(readonly(tool["name"].as_str().unwrap_or_default()));
            tool
        })
        .collect()
}
fn runner_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packages/studio-pi/dist/stdio.js");
        if path.is_file() {
            return Ok(path);
        }
    }
    let path = app
        .path()
        .resource_dir()
        .map_err(|_| "制作のリソース保存先を確認できませんでした")?
        .join("pi/dist/stdio.js");
    if path.is_file() {
        Ok(path)
    } else {
        Err("制作の実行ファイルがありません。Studioをビルドし直してください".into())
    }
}
#[tauri::command]
pub async fn chatgpt_pi_run(
    app: AppHandle,
    state: tauri::State<'_, ChatgptState>,
    model: String,
    prompt: String,
    generation_id: String,
    project_id: String,
    scene_id: String,
    mode: String,
    context: String,
    reasoning_effort: Option<String>,
    session_id: Option<String>,
    history_session_id: Option<String>,
    history_leaf_id: Option<String>,
    on_progress: Channel<Value>,
) -> Result<Value, String> {
    validate_reasoning_effort(reasoning_effort.as_deref())?;
    if prompt.trim().is_empty()
        || prompt.chars().count() > 2000
        || context.len() > 128 * 1024
        || !matches!(mode.as_str(), "build" | "plan" | "goal")
        || project_id.is_empty()
        || scene_id.is_empty()
        || project_id.len() > 160
        || scene_id.len() > 160
    {
        return Err("制作の制作依頼が不正です".into());
    }
    let chat_session_id = session_id.clone().unwrap_or_else(|| generation_id.clone());
    let session_id = history_session_id
        .or(session_id)
        .unwrap_or_else(|| generation_id.clone());
    if !valid_history_id(&session_id) || !valid_history_id(&chat_session_id)
        || history_leaf_id
            .as_deref()
            .is_some_and(|id| !valid_history_id(id))
    {
        return Err("会話履歴のIDが不正です".into());
    }
    let context_value: Value =
        serde_json::from_str(&context).map_err(|_| "制作条件のJSONが不正です")?;
    let sources: Vec<String> = match context_value["options"].get("extensions") {
        Some(value) => serde_json::from_value(value.clone()).map_err(|_| "追加機能の一覧が不正です")?,
        None => Vec::new(),
    };
    if sources.len() > 8 {
        return Err("追加機能は8件まで登録できます".into());
    }
    for source in &sources {
        pinned_package(source)?;
    }
    ensure_authorization_complete(&state)?;
    let lease = begin_generation(&state, Some(generation_id.clone()))?;
    let mut guard = state.0.lock().await;
    let token = access_token(&state, &mut guard).await;
    update_connection_summary(&state, guard.as_ref());
    let token = token?;
    drop(guard);
    let catalog = run_cancellable(&lease.control, Duration::from_secs(30), catalog(&token)).await?;
    validate_authoring_model(&catalog, &model, reasoning_effort.as_deref())?;
    if lease.control.cancelled.load(Ordering::Acquire) {
        return Err("制作を停止しました".into());
    }
    let paths = crate::runtime_paths(app.clone())?;
    let pi_root = app
        .path()
        .app_data_dir()
        .map_err(|_| "制作の保存先を開けません")?
        .join("pi");
    let session_path = pi_root
        .join("sessions")
        .join(digest_key(&[&project_id, &scene_id]))
        .join(format!("{}.jsonl", digest_key(&[&session_id])));
    let resource_root = pi_root.join("resources");
    let packages = if mode == "plan" {
        Vec::new()
    } else {
        prepare_packages(
            &resource_root,
            &sources,
            &paths,
            &lease.control,
            &on_progress,
        )
        .await?
    };
    let mut command = tokio::process::Command::new(&paths.node_exe);
    crate::configure_runtime_command(&mut command, &paths);
    command
        .arg(runner_path(&app)?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|_| "制作処理を起動できませんでした。制作ツールのセットアップを確認してください")?;
    let stdin = child.stdin.take().ok_or("制作の入力を開けませんでした")?;
    let stdout = child.stdout.take().ok_or("制作の出力を開けませんでした")?;
    let definitions = tools();
    let (input_sender, inputs) = tokio::sync::mpsc::unbounded_channel();
    *state.7.lock().map_err(|_| "制作中の依頼を登録できませんでした")? = Some(ActiveInput {
        generation_id: generation_id.clone(), project_id: project_id.clone(), scene_id: scene_id.clone(),
        session_id: chat_session_id, sender: input_sender, control: lease.control.clone(),
    });
    let initial = json!({ "type": "start", "input": { "token": token, "model": model, "prompt": prompt, "projectId": project_id,
        "sceneId": scene_id, "mode": mode, "context": context, "reasoningEffort": reasoning_effort, "tools": definitions,
        "session": { "id": session_id, "path": session_path, "leafId": history_leaf_id }, "packages": packages, "resourceRoot": resource_root } });
    let operation = super::pi_transport::run(
        stdout,
        stdin,
        &initial,
        lease.control.cancellation(),
        |name, args| {
            let app = &app;
            let generation_id = &generation_id;
            let project_id = &project_id;
            let scene_id = &scene_id;
            let mode = &mode;
            let cancelled = &lease.control.cancelled;
            async move {
                if !allowed(&name) || mode == "plan" && !readonly(&name) {
                    return Err("制作処理が許可されていない操作を要求しました".into());
                }
                for (key, expected) in [
                    ("projectId", project_id.as_str()),
                    ("sceneId", scene_id.as_str()),
                ] {
                    if args
                        .get(key)
                        .is_some_and(|value| value.as_str() != Some(expected))
                    {
                        return Err("別の作品・Sceneへの操作を停止しました".into());
                    }
                }
                let scope = json!({ "projectId": project_id, "sceneId": scene_id });
                let response = crate::mcp::call_pi_tool(
                    app,
                    generation_id,
                    &name,
                    Value::Object(args),
                    scope,
                    readonly(&name),
                    cancelled,
                )
                .await?;
                serde_json::to_value(response).map_err(|_| "Editorの応答を作れませんでした".into())
            }
        },
        |message| {
            on_progress
                .send(message)
                .map_err(|_| "制作画面との接続が終了しました".into())
        },
        Some(inputs),
    )
    .await;
    // The transport has settled every accepted call before the process and
    // generation lease are released.
    let _ = child.kill().await;
    let _ = child.wait().await;
    operation
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn package_sources_are_pinned_and_history_paths_are_scoped() {
        assert!(pinned_package("npm:@example/pi-tools@1.2.3").is_ok());
        for source in [
            "npm:tools@latest",
            "npm:tools@^1.2.3",
            "git:example",
            "npm:../tools@1.2.3",
            "npm:tools@1.2.3;echo",
        ] {
            assert!(pinned_package(source).is_err(), "{source}");
        }
        assert!(!valid_history_id("../../outside"));
        assert_ne!(digest_key(&["ab", "c"]), digest_key(&["a", "bc"]));
    }
    #[test]
    fn pi_exposes_official_authoring_and_never_account_or_publish_tools() {
        let definitions = tools();
        for name in [
            "get_editor_context",
            "apply_r3f_scene",
            "save_scene",
            "capture_scene_view",
            "create_blender_model",
        ] {
            assert!(
                definitions.iter().any(|tool| tool["name"] == name),
                "{name}"
            );
        }
        for name in [
            "publish_project",
            "login",
            "open_project",
            "generate_chatgpt_world",
            "begin_world_authoring",
            "set_play_mode",
        ] {
            assert!(!allowed(name), "{name}");
        }
        assert!(readonly("get_project_health"));
        assert!(!readonly("save_scene"));
    }
}
