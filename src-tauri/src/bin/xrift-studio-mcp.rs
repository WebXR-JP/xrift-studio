fn main() {
    if let Some(code) = xrift_studio_lib::mcp::cli::run() {
        std::process::exit(code);
    }
    if let Err(error) = xrift_studio_lib::mcp::run_stdio_server() {
        eprintln!("XRift Studio MCP server stopped: {error}");
        std::process::exit(1);
    }
}
