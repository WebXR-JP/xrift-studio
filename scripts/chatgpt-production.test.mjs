import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-production-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const production = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-production.ts");
const sessions = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-sessions.ts");
const direction = { scope: "world", detail: "overview", focus: "街全体の構成と歩く導線", criteria: ["広場から建物へ歩ける", "建物と道路の大きさを揃える", "照明と空の雰囲気を揃える"], maxPasses: 4 };
const plan = { title: "街の制作", description: "街全体を仕上げる", objects: [], hasMore: false, production: direction };
const job = (overrides = {}) => ({ generationId: "generation-1", status: "running", mode: "build", model: "fixture-model", prompt: "街を作って仕上げてください", options: { models: true, materials: true, audio: true }, sourceProjectId: "project-1", sourceSceneId: "scene-1", sessionId: "session-1", production: direction, productionPass: 1, productionNoProgressPasses: 0,
  plan: { title: plan.title, description: plan.description, hasMore: false, objects: [] }, progress: { phase: "saving", message: "保存しました", completed: 3, total: 3, recentEvents: [{ sequence: 1, phase: "placing", message: "広場を配置して保存しました", saved: true }] }, ...overrides });

test("production is optional for old plans and validates the explicit bounded direction", () => {
  assert.equal(production.parseChatgptProduction(undefined), undefined);
  assert.equal(production.parseChatgptProduction(null), undefined);
  const parsed = production.parseChatgptProduction(direction);
  assert.deepEqual(parsed, direction);
  parsed.criteria[0] = "別の条件";
  assert.notEqual(parsed.criteria[0], direction.criteria[0], "direction arrays are owned copies");
  for (const candidate of [{ ...direction, scope: "city" }, { ...direction, scope: ["world"] }, { ...direction, detail: "maximum" }, { ...direction, maxPasses: 0 }, { ...direction, maxPasses: 7 }, { ...direction, maxPasses: 1.5 }, { ...direction, criteria: [] }, { ...direction, criteria: Array(7).fill("条件") }, { ...direction, criteria: [" "] }, { ...direction, criteria: ["a".repeat(241)] }, { ...direction, criteria: ["line\nbreak"] }, { ...direction, focus: "" }, { ...direction, focus: "a".repeat(161) }, { ...direction, rawPrompt: "unexpected" }]) assert.throws(() => production.parseChatgptProduction(candidate));
  assert.equal(production.parseChatgptProduction({ ...direction, focus: "家".repeat(160), criteria: ["面".repeat(240)] }).focus.length, 160);

});

test("session save/reload preserves production and counters while leaving interrupted work stopped", () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const session = sessions.createChatgptSession("project-1", "scene-1", "制作の記録", "2026-10-17T00:00:00Z", "session-1");
  const current = job({ productionPass: 3, productionNoProgressPasses: 2 });
  const saved = sessions.saveChatgptSessions([{ ...session, turns: [current] }], storage);
  assert.deepEqual(saved[0].turns[0].production, direction);
  const reloaded = sessions.loadChatgptSessions(storage)[0].turns[0];
  assert.deepEqual(reloaded.production, direction);
  assert.equal(reloaded.productionPass, 3);
  assert.equal(reloaded.productionNoProgressPasses, 2);
  assert.equal(reloaded.status, "cancelled");
  assert.match(sessions.chatgptSessionTranscript(saved[0]), /制作 3 \/ 4回/);
});
