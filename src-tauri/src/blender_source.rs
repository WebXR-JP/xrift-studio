use super::*;

const EXPORT_SOURCE: &str = include_str!("blender_source.py");
const MAX_BLEND_BYTES: usize = 128 * 1024 * 1024;

fn validate_blend_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 12 || bytes.len() > MAX_BLEND_BYTES
        || !(bytes.starts_with(b"BLENDER") || bytes.starts_with(&[0x1f, 0x8b])
            || bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd])) {
        return Err("128MB以内のBlenderファイルを選択してください".into());
    }
    Ok(())
}

/// Convert an isolated copy. Never execute embedded scripts or overwrite the
/// user's editable source; the caller commits source and GLB together.
#[tauri::command]
pub(crate) async fn convert_blender_source(project_path: String, data_url: String) -> Result<BlenderModelResult, String> {
    let root = project_root(&project_path)?;
    if data_url.len() > MAX_BLEND_BYTES * 4 / 3 + 1024 { return Err("Blenderファイルが大きすぎます".into()); }
    let bytes = crate::decode_data_url_bytes(&data_url)?;
    validate_blend_bytes(&bytes)?;
    let (executable, version) = find_blender().await.ok_or("Blenderが見つかりません。Blenderをインストールして再試行してください")?;
    let directory = task_directory(&root)?;
    let result = async {
        let blend = directory.join("source.blend");
        let glb = directory.join("model.glb");
        let runner = directory.join("export.py");
        write_new(&blend, &bytes)?;
        write_new(&runner, EXPORT_SOURCE.as_bytes())?;
        let mut command = hidden_command(&executable);
        command.current_dir(&directory).arg("--background").arg("--factory-startup").arg("--disable-autoexec");
        if version >= semver::Version::new(4, 2, 0) { command.arg("--offline-mode"); }
        command.arg("--python-exit-code").arg("1").arg("--python").arg(blender_path(&runner))
            .arg("--").arg(blender_path(&blend)).arg(blender_path(&glb))
            .env("BLENDER_USER_CONFIG", directory.join("config"))
            .env("BLENDER_USER_SCRIPTS", directory.join("scripts"))
            .env("BLENDER_USER_DATAFILES", directory.join("datafiles"))
            .env("PYTHONNOUSERSITE", "1").env("PYTHONSAFEPATH", "1")
            .env_remove("PYTHONPATH").env_remove("PYTHONHOME")
            .stdout(Stdio::from(File::create(directory.join("blender.stdout.log")).map_err(|e| e.to_string())?))
            .stderr(Stdio::from(File::create(directory.join("blender.stderr.log")).map_err(|e| e.to_string())?));
        let mut child = command.spawn().map_err(|_| "Blenderを起動できませんでした")?;
        if !wait_model_process(&mut child, None).await?.success() {
            return Err("Blenderから書き出せませんでした。外部参照をローカル化し、テクスチャを.blendにパックして保存してください。元の素材は保持されています".into());
        }
        let byte_length = glb_metadata(&glb, &directory)?;
        Ok(BlenderModelResult { path: blender_path(&glb).to_string_lossy().into(), file_name: "model.glb".into(), byte_length,
            blend_path: blender_path(&blend).to_string_lossy().into() })
    }.await;
    if result.is_err() { let _ = cleanup_task(&root, &directory); }
    result
}

#[tauri::command]
pub(crate) async fn open_blender_source(project_path: String, relative_path: String) -> Result<(), String> {
    let root = project_root(&project_path)?;
    let relative = crate::validate_asset_import_path(&relative_path)?;
    if relative.extension().and_then(|s| s.to_str()) != Some("blend") { return Err("Blenderの編集元を選択してください".into()); }
    ensure_no_link_ancestors(&root, &relative)?;
    let path = root.join(relative).canonicalize().map_err(|_| "Blenderの編集元が見つかりません")?;
    if !path.starts_with(&root) || !path.is_file() { return Err("プロジェクト内のBlenderファイルを選択してください".into()); }
    let (executable, _) = find_blender().await.ok_or("Blenderが見つかりません")?;
    // Explicit user action: open the graphical editor, not a background job.
    std::process::Command::new(executable).arg("--disable-autoexec").arg(blender_path(&path))
        .spawn().map_err(|_| "Blenderを開けませんでした")?;
    Ok(())
}

#[cfg(test)]
mod source_tests {
    use super::*;
    #[test]
    fn validates_blend_headers() {
        assert!(validate_blend_bytes(b"BLENDER-v500payload").is_ok());
        assert!(validate_blend_bytes(b"not a blender file").is_err());
        assert!(validate_blend_bytes(b"BLENDER").is_err());
    }
}
