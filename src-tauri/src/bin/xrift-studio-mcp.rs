fn main() {
    if let Err(error) = xrift_studio_lib::mcp::run_stdio_server() {
        eprintln!("XRift Studio MCP server stopped: {error}");
        std::process::exit(1);
    }
}
