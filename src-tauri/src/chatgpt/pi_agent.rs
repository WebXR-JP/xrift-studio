//! Pi SDK subprocess; Studio remains the authority for credentials and document I/O.
use super::*;
use std::{path::PathBuf, process::Stdio};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};

const TOOLS: &[&str] = &[
    "get_editor_context",
    "get_world_authoring_guide",
    "get_project_health",
    "analyze_performance",
    "list_entities",
    "list_assets",
    "list_component_definitions",
    "get_entity_components",
    "get_entity_bounds",
    "create_primitive",
    "update_transform",
    "rename_entity",
    "reparent_entity",
    "delete_entity",
    "duplicate_entity",
    "add_component",
    "update_component",
    "remove_component",
    "set_entity_enabled",
    "get_material_asset",
    "update_material_asset",
    "update_material_assets",
    "set_material",
    "list_material_presets",
    "create_material_from_preset",
    "update_scene_settings",
    "place_asset",
    "get_model_asset",
    "get_texture_asset",
    "get_audio_asset",
    "set_entity_model",
    "list_scene_recipes",
    "place_builtin_prefab",
    "create_prefab",
    "set_mesh_collision",
    "inspect_colliders",
    "get_scripting_capabilities",
    "list_script_templates",
    "get_script_asset",
    "create_script_asset",
    "apply_script_template",
    "update_script_asset",
    "update_script_component",
    "set_play_mode",
    "analyze_component_code",
    "apply_component_code_import_plan",
    "apply_r3f_scene",
    "search_external_assets",
    "get_external_asset_options",
    "install_external_asset",
    "capture_scene_view",
    "set_scene_view_camera",
    "save_project",
    "get_modeling_tools",
    "create_blender_model",
    "get_terrain",
    "sample_terrain_point",
    "list_terrain_presets",
    "create_terrain",
    "create_terrain_from_preset",
    "apply_terrain_surface",
    "sculpt_terrain",
    "update_terrain",
    "list_terrain_grass_types",
    "apply_terrain_grass_preset",
    "add_terrain_grass_layer",
    "update_terrain_grass_layer",
    "delete_terrain_grass_layer",
    "paint_terrain_grass",
    "get_particle_asset",
    "update_particle_asset",
    "get_shader_asset",
    "update_shader_asset",
    "update_model_asset",
    "update_texture_asset",
    "create_document_asset",
];
const READ_TOOLS: &[&str] = &[
    "get_editor_context",
    "get_world_authoring_guide",
    "get_project_health",
    "analyze_performance",
    "list_entities",
    "list_assets",
    "list_component_definitions",
    "get_entity_components",
    "get_entity_bounds",
    "get_material_asset",
    "list_material_presets",
    "get_model_asset",
    "get_texture_asset",
    "get_audio_asset",
    "list_scene_recipes",
    "inspect_colliders",
    "get_scripting_capabilities",
    "list_script_templates",
    "get_script_asset",
    "search_external_assets",
    "get_external_asset_options",
    "get_modeling_tools",
    "get_terrain",
    "sample_terrain_point",
    "list_terrain_presets",
    "list_terrain_grass_types",
    "get_particle_asset",
    "get_shader_asset",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiAgentRequest {
    generation_id: String,
    session_id: String,
    project_id: String,
    scene_id: String,
    model: String,
    prompt: String,
    reasoning_effort: Option<String>,
    mode: String,
}

fn allowed_definitions(plan: bool) -> Vec<Value> {
    crate::mcp::tool_definitions()
        .as_array()
        .unwrap()
        .iter()
        .filter(|tool| {
            tool["name"].as_str().is_some_and(|name| {
                if plan {
                    READ_TOOLS.contains(&name)
                } else {
                    TOOLS.contains(&name)
                }
            })
        })
        .cloned()
        .collect()
}

fn entry_path(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../packages/xrift-studio-agent/dist/main.js");
        if entry.is_file() {
            return Ok(entry);
        }
    }
    let entry = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("pi-agent/dist/main.js");
    if !entry.is_file() {
        return Err("Piの内部ランタイムがありません。Studioを再インストールしてください".into());
    }
    Ok(entry)
}

#[tauri::command]
pub async fn run_pi_agent(
    app: AppHandle,
    state: tauri::State<'_, ChatgptState>,
    request: PiAgentRequest,
    on_event: Channel<Value>,
) -> Result<Value, String> {
    if request.prompt.trim().is_empty()
        || request.prompt.len() > 32_000
        || [
            &request.generation_id,
            &request.session_id,
            &request.project_id,
            &request.scene_id,
        ]
        .iter()
        .any(|id| id.is_empty() || id.len() > 160)
        || !["build", "plan"].contains(&request.mode.as_str())
    {
        return Err("Piへの制作依頼が不正です".into());
    }
    let effort = request.reasoning_effort.as_deref().unwrap_or("medium");
    validate_reasoning_effort(Some(effort))?;
    let lease = begin_generation(&state, Some(request.generation_id.clone()))?;
    let mut guard = state
        .0
        .try_lock()
        .map_err(|_| "ChatGPTの接続を確認中です")?;
    ensure_authorization_complete(&state)?;
    let token = access_token(&state, &mut guard).await;
    update_connection_summary(&state, guard.as_ref());
    let token = token?;
    drop(guard);
    validate_plan_model(&catalog(&token).await?, &request.model, Some(effort))?;
    let root = crate::app_root(&app)?;
    let paths = crate::derive_paths(&root);
    let node = PathBuf::from(paths.node_exe);
    if !node.is_file() {
        return Err(
            "設定から制作ツールをセットアップしてください。Piには同梱Node.jsが必要です".into(),
        );
    }
    let entry = entry_path(&app)?;
    let session_key = format!(
        "{:x}",
        Sha256::digest(format!(
            "{}:{}:{}",
            request.project_id, request.scene_id, request.session_id
        ))
    );
    let session_dir = root.join("pi-agent-sessions").join(session_key);
    std::fs::create_dir_all(&session_dir).map_err(|_| "Piの会話保存先を作成できません")?;
    let tools = allowed_definitions(request.mode == "plan");
    let mut command = tokio::process::Command::new(node);
    command
        .arg(entry)
        .current_dir(&session_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|_| "Piの内部ランタイムを開始できません")?;
    let mut stdin = child.stdin.take().ok_or("Piの入力に接続できません")?;
    let stdout = child.stdout.take().ok_or("Piの出力に接続できません")?;
    let initial = json!({ "type":"start", "input": {
        "model":request.model, "accessToken":token, "thinkingLevel":effort, "prompt":request.prompt,
        "projectId":request.project_id, "sceneId":request.scene_id, "mode":request.mode,
        "sessionDir":session_dir, "cwd":session_dir, "tools":tools,
        "instructions":authoring_core_instructions(),
    }});
    stdin
        .write_all(format!("{initial}\n").as_bytes())
        .await
        .map_err(|_| "Piへ依頼を送れません")?;
    let mut reader = BufReader::new(stdout);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20 * 60);
    let mut calls = 0;
    loop {
        let mut line = String::new();
        let mut limited = (&mut reader).take(2 * 1024 * 1024);
        let read = tokio::select! {
            biased;
            _ = lease.control.cancellation() => { let _ = child.kill().await; return Err("制作を停止しました。保存済みの変更は保持されています".into()); },
            _ = tokio::time::sleep_until(deadline) => { let _ = child.kill().await; return Err("制作時間の上限に達しました。保存済みのSceneから再開してください".into()); },
            value = limited.read_line(&mut line) => value,
        }.map_err(|_| "Piの応答を読み取れません")?;
        if read == 0 {
            return Err("Piが制作の完了前に終了しました".into());
        }
        let message: Value =
            serde_json::from_str(&line).map_err(|_| "Piの応答形式を確認できません")?;
        match message["type"].as_str() {
            Some("tool") => {
                calls += 1;
                if calls > 256 {
                    return Err("Studioの操作回数の上限に達しました".into());
                }
                let name = message["tool"].as_str().ok_or("操作名がありません")?;
                if !tools.iter().any(|tool| tool["name"] == name) {
                    return Err("許可されていないStudio操作です".into());
                }
                let id = message["id"].as_str().ok_or("操作IDがありません")?;
                // Every call is scoped to the originally requested Scene, including reads.
                let context = crate::mcp::dispatch_internal(
                    &app,
                    format!("pi-{}-{calls}-scope", request.generation_id),
                    "get_editor_context".into(),
                    json!({}),
                    &request.generation_id,
                )
                .await?;
                if !context.ok
                    || context.result.as_ref().is_none_or(|v| {
                        v["projectId"] != request.project_id || v["sceneId"] != request.scene_id
                    })
                {
                    return Err(
                        "制作中に対象Sceneが切り替わりました。保存済みの変更は保持されています"
                            .into(),
                    );
                }
                if lease.control.cancelled.load(Ordering::Acquire) {
                    return Err("制作を停止しました".into());
                }
                let mut args = message["arguments"]
                    .as_object()
                    .ok_or("操作の引数が不正です")?
                    .clone();
                // Pi owns its independent review gate; do not require or alter an external MCP run journal.
                if name == "capture_scene_view" {
                    args.insert("recordAuthoring".into(), json!(false));
                }
                for (key, expected) in [
                    ("projectId", &request.project_id),
                    ("sceneId", &request.scene_id),
                ] {
                    if args.get(key).is_some_and(|v| v != expected) {
                        return Err("別のSceneには操作できません".into());
                    }
                    if tools.iter().find(|t| t["name"] == name).unwrap()["inputSchema"]
                        ["properties"]
                        .get(key)
                        .is_some()
                    {
                        args.insert(key.into(), json!(expected));
                    }
                }
                let _ = on_event.send(json!({"type":"tool_start","tool":name}));
                // Drain an admitted Editor operation before acknowledging cancellation.
                let response = crate::mcp::dispatch_internal(
                    &app,
                    format!("pi-{}-{calls}", request.generation_id),
                    name.into(),
                    json!(args),
                    &request.generation_id,
                )
                .await?;
                let _ = on_event.send(json!({"type":"tool_end","tool":name,"ok":response.ok,
                    "changed":response.result.as_ref().and_then(|v| v["revisionAfter"].as_u64().zip(v["revisionBefore"].as_u64())).is_some_and(|(after,before)| after > before)}));
                let reply = json!({"type":"result","id":id,"response":response});
                stdin
                    .write_all(format!("{reply}\n").as_bytes())
                    .await
                    .map_err(|_| "Piへ操作結果を返せません")?;
            }
            Some("text") => {
                let _ = on_event.send(json!({"type":"text","text":message["text"]}));
            }
            Some("done") => {
                let _ = child.wait().await;
                return Ok(message);
            }
            Some("failed") => {
                return Err(message["message"]
                    .as_str()
                    .unwrap_or("Piの制作が中断しました")
                    .replace(&token, "[削除]"))
            }
            _ => return Err("Piの応答形式に対応していません".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn internal_tools_are_official_scoped_and_cannot_publish_or_recurse() {
        let tools = allowed_definitions(false);
        for name in TOOLS {
            assert!(
                tools.iter().any(|tool| tool["name"] == *name),
                "missing {name}"
            );
        }
        for name in [
            "publish_project",
            "generate_chatgpt_world",
            "open_project",
            "import_model_asset",
        ] {
            assert!(!tools.iter().any(|tool| tool["name"] == name));
        }
        let read = allowed_definitions(true);
        for name in [
            "apply_r3f_scene",
            "update_transform",
            "save_project",
            "set_play_mode",
        ] {
            assert!(!read.iter().any(|tool| tool["name"] == name));
        }
    }
}
