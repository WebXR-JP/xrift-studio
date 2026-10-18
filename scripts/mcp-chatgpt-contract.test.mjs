import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-mcp-chatgpt-contract-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const registry = await server.ssrLoadModule("/src/lib/visual-editor/mcp-tool-registry.ts");
const chatgptTools = ["get_chatgpt_connection", "connect_chatgpt", "disconnect_chatgpt", "list_chatgpt_models", "open_chatgpt_panel", "generate_chatgpt_world", "get_chatgpt_generation", "apply_chatgpt_plan", "cancel_chatgpt_generation", "list_chatgpt_sessions", "get_chatgpt_session", "manage_chatgpt_session", "revert_chatgpt_generation"];

test("ChatGPT planning, application and cancellation route through the project shell", () => {
  for (const name of chatgptTools) {
    assert.equal(registry.xriftMcpToolSurface(name), "project", name);
    assert.ok(registry.XRIFT_MCP_PROJECT_TOOLS.includes(name), name);
    assert.ok(!registry.XRIFT_MCP_EDITOR_TOOLS.includes(name), `${name} must not bypass project lifecycle guards`);
  }
  assert.equal(registry.xriftMcpToolSurface("chatgpt_unknown_tool"), undefined);
});

test("all ChatGPT actions are advertised once and accepted by the native allow-list", async () => {
  const native = await readFile(new URL("../src-tauri/src/mcp_tool_names.rs", import.meta.url), "utf8");
  const allowed = [...native.matchAll(/^\s*"([a-z][a-z0-9_]+)",$/gm)].map(match => match[1]);
  assert.deepEqual(allowed, registry.XRIFT_MCP_TOOL_NAMES);
  for (const name of chatgptTools) {
    assert.equal(registry.XRIFT_MCP_TOOLS.filter(tool => tool.name === name).length, 1, name);
  }
});
