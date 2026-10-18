import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-reasoning-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { preferredChatgptReasoningEffort, createChatgptReasoningPreferences } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-reasoning.ts");
const catalog = [
  { slug: "low-capable", displayName: "Low", supportedReasoningEfforts: ["high", "medium", "low"], defaultReasoningEffort: "high" },
  { slug: "medium-only", displayName: "Medium", supportedReasoningEfforts: ["medium"], defaultReasoningEffort: "medium" },
  { slug: "unknown", displayName: "Unknown" },
];

test("new choices prefer low only when supported, then a supported model default", () => {
  assert.equal(preferredChatgptReasoningEffort(catalog[0]), "low");
  assert.equal(preferredChatgptReasoningEffort(catalog[1]), "medium");
  assert.equal(preferredChatgptReasoningEffort(catalog[2]), "");
  assert.equal(preferredChatgptReasoningEffort(), "");
  assert.equal(preferredChatgptReasoningEffort({ ...catalog[1], defaultReasoningEffort: "low" }), "", "never send unsupported metadata");
  assert.equal(preferredChatgptReasoningEffort({ ...catalog[1], defaultReasoningEffort: undefined }), "", "do not guess from a list without a default");
});

test("MCP reuses recent model metadata without additional discovery and expires it", () => {
  let now = 0;
  const preferences = createChatgptReasoningPreferences(() => now);
  assert.equal(preferences.forModel("low-capable"), undefined);
  preferences.remember(catalog);
  assert.equal(preferences.forModel("low-capable"), "low");
  assert.equal(preferences.forModel("medium-only"), "medium");
  assert.equal(preferences.forModel("unknown"), undefined);
  assert.equal(preferences.forModel("missing"), undefined);
  now = 59_999;
  assert.equal(preferences.forModel("low-capable"), "low");
  now = 60_000;
  assert.equal(preferences.forModel("low-capable"), undefined);
});

test("connection changes and failed refreshes can clear advisory metadata", () => {
  const preferences = createChatgptReasoningPreferences();
  const connection = { signedIn: true, planUsageEnabled: true, connecting: false, restoring: false, accountId: "account-a" };
  preferences.observeConnection(connection);
  preferences.remember(catalog);
  preferences.observeConnection({ ...connection });
  assert.equal(preferences.forModel("low-capable"), "low");
  preferences.observeConnection({ ...connection, accountId: "account-b" });
  assert.equal(preferences.forModel("low-capable"), undefined);
  preferences.remember(catalog);
  preferences.observeConnection({ ...connection, signedIn: false });
  assert.equal(preferences.forModel("low-capable"), undefined);
  preferences.remember(catalog);
  preferences.clear();
  assert.equal(preferences.forModel("low-capable"), undefined);
});
