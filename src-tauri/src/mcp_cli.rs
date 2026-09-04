//! Terminal entry point for the same authenticated broker used by MCP.
use super::*;
use base64::Engine;
use std::ffi::OsString;

const HELP: &str = "XRift Studio editor CLI (Studio must be running for call)\n\n  xrift-studio-mcp-sidecar tools\n  xrift-studio-mcp-sidecar describe <tool>\n  xrift-studio-mcp-sidecar call <tool> [--args <JSON> | --args-file <path> | --stdin]\n      [--rendezvous <path>] [--output-dir <path>]\n\nResults are JSON. Images remain base64 unless --output-dir is supplied.\nExit codes: 0 success, 1 editor rejection, 2 invalid arguments, 3 connection failure,\n4 image export failure (the operation may already have succeeded; do not retry blindly).\nWithout a subcommand, runs the existing MCP stdio server.\n";

struct Call {
    tool: String,
    arguments: Value,
    rendezvous: PathBuf,
    output: Option<PathBuf>,
}

fn read_arguments(reader: impl Read) -> Result<Value, String> {
    let mut bytes = Vec::new();
    reader
        .take((MCP_MAX_MESSAGE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MCP_MAX_MESSAGE_BYTES {
        return Err("Arguments exceed 1 MiB".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if !value.is_object() {
        return Err("Arguments must be a JSON object".into());
    }
    Ok(value)
}

fn parse_call(args: &[OsString]) -> Result<Call, String> {
    let tool = args
        .first()
        .and_then(|v| v.to_str())
        .ok_or("Tool name is required")?;
    if !MCP_TOOL_NAMES.contains(&tool) {
        return Err(format!("Unknown tool: {tool}"));
    }
    let mut input = None;
    let mut output = None;
    let mut rendezvous = None;
    let mut options = args[1..].iter();
    while let Some(option) = options.next() {
        let name = option.to_str().ok_or("Invalid option")?;
        match name {
            "--args" | "--args-file" | "--stdin" => {
                if input.is_some() {
                    return Err("Choose only one argument source".into());
                }
                input = Some(match name {
                    "--stdin" => read_arguments(std::io::stdin().lock())?,
                    "--args-file" => read_arguments(
                        std::fs::File::open(options.next().ok_or("Missing argument file")?)
                            .map_err(|e| e.to_string())?,
                    )?,
                    _ => read_arguments(
                        options
                            .next()
                            .and_then(|v| v.to_str())
                            .ok_or("Missing JSON")?
                            .as_bytes(),
                    )?,
                });
            }
            "--output-dir" | "--rendezvous" => {
                let slot = if name == "--output-dir" {
                    &mut output
                } else {
                    &mut rendezvous
                };
                if slot.is_some() {
                    return Err(format!("Duplicate option: {name}"));
                }
                *slot = Some(PathBuf::from(options.next().ok_or("Missing path")?));
            }
            _ => return Err(format!("Unknown option: {name}")),
        }
    }
    let rendezvous = rendezvous
        .or_else(|| std::env::var_os("XRIFT_STUDIO_MCP_RENDEZVOUS").map(PathBuf::from))
        .or_else(|| dirs::data_dir().map(|p| p.join("net.xrift.studio/mcp/rendezvous.json")))
        .ok_or("Cannot locate Studio; supply --rendezvous")?;
    Ok(Call {
        tool: tool.into(),
        arguments: input.unwrap_or_else(|| json!({})),
        rendezvous,
        output,
    })
}

fn export_image(image: &mut Value, directory: &Path, index: usize) -> Result<(), String> {
    if image["mimeType"] != "image/png" {
        return Err("Unsupported image type".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image["data"].as_str().ok_or("Missing image data")?)
        .map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid PNG data".into());
    }
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let directory = std::fs::canonicalize(directory).map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let path = directory.join(format!(
        "capture-{}-{timestamp}-{index}.png",
        std::process::id()
    ));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    let object = image.as_object_mut().ok_or("Invalid image")?;
    object.remove("data");
    object.insert("path".into(), json!(path));
    Ok(())
}

fn export_images(tool: &str, result: &mut Value, directory: &Path) -> Result<(), String> {
    if tool == "capture_scene_view" {
        if let Some(image) = result.get_mut("image") {
            export_image(image, directory, 0)?;
        }
    }
    if tool == "get_world_authoring" {
        if let Some(images) = result.get_mut("images").and_then(Value::as_array_mut) {
            for (index, image) in images.iter_mut().enumerate() {
                export_image(image, directory, index)?;
            }
        }
    }
    Ok(())
}

fn error(code: &str, message: String) -> Value {
    json!({"ok":false,"error":{"code":code,"message":message}})
}

fn execute(args: &[OsString]) -> (i32, Value) {
    let command = args[0].to_str().unwrap_or_default();
    let definitions = tool_definitions();
    match command {
        "tools" if args.len() == 1 => (0, json!({"tools":definitions})),
        "describe" if args.len() == 2 => {
            match definitions.as_array().and_then(|tools| {
                tools
                    .iter()
                    .find(|t| t["name"].as_str() == args[1].to_str())
            }) {
                Some(tool) => (0, tool.clone()),
                None => (2, error("INVALID_ARGUMENTS", "Unknown tool".into())),
            }
        }
        "call" => {
            let call = match parse_call(&args[1..]) {
                Ok(v) => v,
                Err(e) => return (2, error("INVALID_ARGUMENTS", e)),
            };
            let request = XriftMcpToolRequest {
                id: format!(
                    "cli-{}-{}",
                    std::process::id(),
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_nanos()
                ),
                tool: call.tool.clone(),
                arguments: call.arguments,
            };
            // Leave space for the broker envelope and authentication token.
            if serde_json::to_vec(&request).map_or(true, |v| v.len() > MCP_MAX_MESSAGE_BYTES - 4096)
            {
                return (
                    2,
                    error("INVALID_ARGUMENTS", "Request exceeds broker limit".into()),
                );
            }
            match proxy_tool_call(&call.rendezvous, "XRift Studio CLI", request) {
                Err(e) => (3, error("EDITOR_UNAVAILABLE", e)),
                Ok(mut response) => {
                    let mut code = if response.ok { 0 } else { 1 };
                    let mut export_error = None;
                    if let (Some(directory), Some(result)) = (call.output, response.result.as_mut())
                    {
                        if let Err(e) = export_images(&call.tool, result, &directory) {
                            code = 4;
                            export_error = Some(e);
                        }
                    }
                    let mut value = serde_json::to_value(response).unwrap();
                    if let Some(e) = export_error {
                        value["exportError"] = json!(e);
                    }
                    (code, value)
                }
            }
        }
        _ => (
            2,
            error(
                "INVALID_ARGUMENTS",
                "Use tools, describe <tool>, or call <tool>; see --help".into(),
            ),
        ),
    }
}

/// None preserves legacy MCP stdio invocations, including --rendezvous.
pub fn run() -> Option<i32> {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let first = args.first()?.to_str().unwrap_or_default();
    if first == "--rendezvous" {
        return None;
    }
    if first == "--help" || first == "-h" {
        print!("{HELP}");
        return Some(0);
    }
    let (code, result) = execute(&args);
    match serde_json::to_writer(std::io::stdout().lock(), &result) {
        Ok(()) => {
            println!();
            Some(code)
        }
        Err(e) => {
            eprintln!("Could not write CLI result: {e}");
            Some(4)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn catalogue_covers_every_mcp_tool() {
        let (code, value) = execute(&args(&["tools"]));
        assert_eq!(code, 0);
        for name in MCP_TOOL_NAMES {
            assert!(value["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|t| t["name"] == *name));
        }
    }

    #[test]
    fn rejects_bad_arguments_before_connecting() {
        for input in [
            vec!["call"],
            vec!["call", "unknown"],
            vec!["call", "get_editor_context", "--args", "[]"],
            vec!["call", "get_editor_context", "--args", "{}", "--args", "{}"],
            vec!["tools", "extra"],
        ] {
            assert_eq!(execute(&args(&input)).0, 2);
        }
    }

    #[test]
    fn preserves_paths_and_json() {
        let call = parse_call(&args(&[
            "get_editor_context",
            "--args",
            "{\"title\":\"日本語\"}",
            "--rendezvous",
            "日本語 folder/connection.json",
            "--output-dir",
            "my world/Recording",
        ]))
        .unwrap();
        assert_eq!(call.arguments["title"], "日本語");
        assert_eq!(
            call.rendezvous,
            PathBuf::from("日本語 folder/connection.json")
        );
    }

    #[test]
    fn missing_studio_is_connection_failure() {
        assert_eq!(
            execute(&args(&[
                "call",
                "get_editor_context",
                "--rendezvous",
                "nonexistent-cli-test-rendezvous.json"
            ]))
            .0,
            3
        );
    }

    #[test]
    fn image_export_retains_metadata_and_avoids_overwrite() {
        let dir = std::env::temp_dir().join(format!(
            "xrift-cli-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let original = json!({"mimeType":"image/png","captureId":"capture-1","data":base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\nfixture")});
        let mut first = original.clone();
        let mut second = original;
        export_image(&mut first, &dir, 0).unwrap();
        export_image(&mut second, &dir, 0).unwrap();
        assert_ne!(first["path"], second["path"]);
        assert_eq!(first["captureId"], "capture-1");
        assert!(first.get("data").is_none());
        std::fs::remove_file(first["path"].as_str().unwrap()).unwrap();
        std::fs::remove_file(second["path"].as_str().unwrap()).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
