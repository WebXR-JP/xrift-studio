import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-harness-context-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { buildChatgptHarnessContext, chatgptHarnessContextSummary } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-context.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
const { sha256Utf8 } = await server.ssrLoadModule("/src/lib/visual-editor/compiler/hash.ts");
const sessions = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-sessions.ts");
const { CHATGPT_HARNESS_DEFAULT_LIMITS } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-runtime.ts");
const { useChatgptSessions } = await server.ssrLoadModule("/src/components/visual-editor/useChatgptSessions.ts");
const starter = () => createStarterVisualProject("world", "blank", "harness-context-fixture");
const production = { scope: "world", detail: "overview", focus: "街路全体", criteria: ["連続する街路", "歩ける空間"], maxPasses: 3 };
const source = (bundle, id, text) => {
  const template = Object.values(bundle.scene.entities)[0];
  bundle.scene.entities[id] = { ...structuredClone(template), id, parentId: null, children: [], name: id,
    codeAuthoring: { version: 1, source: text, originalPrompt: "街", revision: 1, nodes: {}, materials: {} } };
  bundle.scene.rootEntityIds.push(id);
};

test("one detached immutable packet binds current Scene, full originals and production direction", () => {
  const bundle = starter();
  source(bundle, "r3f-root", "export default function World() { return <group name=\"街\" /> }");
  const conversation = [{ prompt: "街を作る", result: "道路を保存" }];
  const candidates = [{ candidateId: "builtin:fixture:brick", providerId: "fixture", name: "煉瓦", description: "壁", actions: ["material"] }];
  const packet = buildChatgptHarnessContext(bundle, { selectedEntityId: "r3f-root", attachedEntityIds: ["r3f-root"], conversation, builtinCandidates: candidates, production, goal: true, blenderAvailable: false, modelSource: "auto" });
  assert.equal(packet.scene.selectedEntityId, "r3f-root");
  assert.equal(packet.scene.goal, true);
  assert.deepEqual(packet.production, production);
  assert.deepEqual(JSON.parse(packet.scene.conversation.at(-1).result).production, production, "fixed criteria also reach the validated native planner boundary after a repair");
  assert.equal(packet.resources.authoredScenes[0].source, bundle.scene.entities["r3f-root"].codeAuthoring.source);
  assert.equal(packet.resources.blenderAvailable, false);
  assert.equal(packet.resources.modelSource, "auto");
  assert.match(packet.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(packet.contextBytes > 0);
  assert.equal(Object.isFrozen(packet), true);
  assert.equal(Object.isFrozen(packet.scene.entities[0].position), true);
  assert.equal(Object.isFrozen(packet.resources.authoredScenes), true);
  assert.equal(Object.isFrozen(bundle.scene), false);
  assert.equal(Object.isFrozen(candidates[0].actions), false);
  conversation[0].result = "後の会話";
  candidates[0].actions.push("skybox");
  bundle.scene.entities["r3f-root"].name = "後の変更";
  assert.equal(packet.scene.conversation[0].result, "道路を保存");
  assert.equal(packet.scene.entities.find(entity => entity.id === "r3f-root").name, "r3f-root");
  assert.throws(() => packet.scene.entities[0].position.push(999), TypeError);
});

test("fingerprints ignore dictionary insertion order and derived thumbnails, but cover omitted Entities", () => {
  const bundle = starter(), template = Object.values(bundle.scene.entities)[0];
  for (let index = 0; index < 125; index++) {
    const id = `surrounding-${index}`;
    bundle.scene.entities[id] = { ...structuredClone(template), id, name: id, parentId: null, children: [] };
  }
  const first = buildChatgptHarnessContext(bundle);
  assert.ok(first.omittedEntities.count > 0);
  const omittedId = Object.keys(bundle.scene.entities).find(id => !first.scene.entities.some(entity => entity.id === id));
  assert.ok(omittedId);
  bundle.scene.entities[omittedId].name = "画面の外も編集済み";
  const changed = buildChatgptHarnessContext(bundle);
  assert.notEqual(changed.sceneFingerprint, first.sceneFingerprint);
  assert.notEqual(changed.fingerprint, first.fingerprint);
  const reordered = structuredClone(bundle);
  reordered.assets.assets = Object.fromEntries(Object.entries(reordered.assets.assets).reverse());
  assert.equal(buildChatgptHarnessContext(reordered).sceneFingerprint, changed.sceneFingerprint);
  const thumbnails = structuredClone(bundle);
  thumbnails.assets.assets = Object.fromEntries(Object.entries(thumbnails.assets.assets).map(([id, asset]) => [id, { ...asset, thumbnail: "derived-thumbnail" }]));
  assert.equal(buildChatgptHarnessContext(thumbnails).fingerprint, changed.fingerprint);
  const repeated = buildChatgptHarnessContext(bundle);
  assert.equal(repeated.fingerprint, changed.fingerprint, "random Component default IDs never enter the packet");
});

test("source budget omits whole originals and reports exact omissions without clipping TSX", () => {
  const bundle = starter();
  source(bundle, "large-first", `/*${"a".repeat(29_990)}*/`);
  source(bundle, "large-second", `/*${"b".repeat(29_990)}*/`);
  source(bundle, "small-third", "export default () => <group name=\"追加\" />");
  const packet = buildChatgptHarnessContext(bundle, { selectedEntityId: "large-first" });
  const originals = packet.resources.authoredScenes;
  assert.ok(originals.some(item => item.entityId === "large-first"));
  assert.ok(originals.some(item => item.entityId === "small-third"));
  assert.ok(!originals.some(item => item.entityId === "large-second"));
  for (const original of originals) assert.equal(original.source, bundle.scene.entities[original.entityId].codeAuthoring.source);
  assert.deepEqual(packet.omittedSources, { total: 3, included: 2, count: 1, bytes: Buffer.byteLength(bundle.scene.entities["large-second"].codeAuthoring.source), entityBudget: 0, sourceBudget: 1 });
  const coverage = packet.scene.conversation.at(-1);
  assert.equal(coverage.prompt, "Studioが記録したコンテキストの範囲");
  assert.equal(JSON.parse(coverage.result).omittedSourceCount, 1);
  assert.equal(JSON.parse(coverage.result).omittedSourceBytes, packet.omittedSources.bytes);
  const summary = chatgptHarnessContextSummary(packet);
  assert.equal(summary.omittedSourceCount, 1);
  assert.equal(summary.sourceHashes.length, 2);
  assert.equal(summary.sourceHashes[0].sha256, sha256Utf8(originals[0].source));
  assert.doesNotMatch(JSON.stringify(summary), /export default|source\"|originalPrompt|data:image|aaaaa/);
  assert.equal(Object.isFrozen(summary.sourceHashes[0]), true);
});

test("conversation retention drops complete older turns before the current Scene or exact source", () => {
  const bundle = starter();
  source(bundle, "code", "export default () => <group name=\"家\" />");
  const conversation = Array.from({ length: 8 }, (_, index) => ({ prompt: `依頼${index}`, result: "古い制作記録".repeat(700) }));
  const packet = buildChatgptHarnessContext(bundle, { conversation, selectedEntityId: "code" });
  assert.ok(packet.scene.conversation.length < conversation.length);
  assert.deepEqual(packet.scene.conversation.at(-1), conversation.at(-1));
  assert.ok(Buffer.byteLength(JSON.stringify(packet.scene.conversation)) <= 24 * 1024);
  assert.equal(packet.resources.authoredScenes[0].source, bundle.scene.entities.code.codeAuthoring.source);
  assert.notEqual(buildChatgptHarnessContext(bundle, { selectedEntityId: "code", production }).fingerprint, packet.fingerprint);
});

const date = "2026-10-17T00:00:00.000Z";
const snapshot = (runId = "job-1", phase = "running") => ({
  version: 1, runId, phase, limits: { ...CHATGPT_HARNESS_DEFAULT_LIMITS },
  counters: { passes: 1, repairs: 0, modelCalls: 1, writes: 1, attempts: 2, activeMs: 150 },
  sequence: 2, dirty: false, committedFingerprint: sha256Utf8("saved-scene"), savedFingerprint: sha256Utf8("saved-scene"),
  events: [
    { sequence: 1, attempt: 1, pass: 1, phase: "plan", outcome: "succeeded", label: "制作方針を作成", at: 1000 },
    { sequence: 2, attempt: 2, pass: 1, phase: "save", outcome: "succeeded", label: "Sceneを保存", at: 1100 },
  ],
});
const turn = (id = "job-1", extra = {}) => ({
  generationId: id, status: "running", model: "fixture", prompt: "街を制作する", options: { models: true, materials: true, audio: true },
  sourceProjectId: "project-1", sourceSceneId: "scene-1", createdAt: date,
  progress: { phase: "saving", message: "Sceneを保存", completed: 1, total: 2, recentEvents: [] },
  harness: snapshot(id), ...extra,
});
const session = (...turns) => ({ ...sessions.createChatgptSession("project-1", "scene-1", "街の制作", date, "session-1"), turns });
class MemoryStorage {
  value = null;
  fail = false;
  getItem() { return this.value; }
  setItem(_key, value) { if (this.fail) throw new Error("private storage implementation detail"); this.value = value; }
}

test("session restart interrupts in-flight journal once and retains its exact committed facts", () => {
  const storage = new MemoryStorage(), original = turn();
  sessions.saveChatgptSessions([session(original)], storage);
  const restored = sessions.loadChatgptSessions(storage)[0].turns[0];
  assert.equal(restored.status, "cancelled");
  assert.equal(restored.harness.phase, "cancelled");
  assert.equal(restored.harness.reason, "interrupted");
  assert.deepEqual(restored.harness.counters, original.harness.counters);
  assert.equal(restored.harness.savedFingerprint, original.harness.savedFingerprint);
  assert.equal(restored.harness.sequence, original.harness.sequence + 1);
  assert.equal(restored.harness.events.at(-1).code, "interrupted");
  assert.equal(Object.isFrozen(restored.harness.events), true);
  sessions.saveChatgptSessions([session(restored)], storage);
  assert.equal(sessions.loadChatgptSessions(storage)[0].turns[0].harness.sequence, restored.harness.sequence);
  assert.equal(original.harness.phase, "running");
});

test("future or damaged journals protect the complete stored history even outside the retention tail", () => {
  const storage = new MemoryStorage();
  sessions.saveChatgptSessions([session(turn("valid", { status: "completed", harness: snapshot("valid", "completed") }))], storage);
  const before = storage.value;
  for (const bad of [
    { ...snapshot(), version: 2 },
    { ...snapshot(), source: "export default function Secret() {}" },
    { ...snapshot(), runId: "another-job" },
    { ...snapshot(), events: [{ ...snapshot().events[0], sequence: 9 }] },
  ]) {
    const entries = [turn("job-1", { harness: bad }), ...Array.from({ length: 30 }, (_, index) => turn(`later-${index}`))];
    assert.throws(() => sessions.saveChatgptSessions([session(...entries)], storage), /実行|記録/);
    assert.equal(storage.value, before);
    storage.value = JSON.stringify({ version: 1, sessions: [session(...entries)] });
    const damaged = storage.value;
    assert.throws(() => sessions.loadChatgptSessions(storage), /実行|記録/);
    assert.equal(storage.value, damaged);
    storage.value = before;
  }
});

test("exposed session flush throws storage failure and refuses to replace unreadable history", () => {
  const previousWindow = globalThis.window;
  try {
    const storage = new MemoryStorage();
    globalThis.window = { localStorage: storage };
    let hook;
    const Harness = () => { hook = useChatgptSessions(); return null; };
    renderToString(createElement(Harness));
    hook.updateSessions([session(turn())]);
    hook.flush();
    const persisted = storage.value;
    assert.ok(persisted);
    storage.fail = true;
    assert.throws(() => hook.flush(), /会話履歴を保存できません/);
    assert.equal(storage.value, persisted);
    storage.fail = false;
    storage.value = "unreadable original history";
    renderToString(createElement(Harness));
    assert.match(hook.historyError, /会話履歴を読み取れません/);
    hook.updateSessions([session(turn("new-job"))], true);
    assert.throws(() => hook.flush(), /会話履歴を読み取れません/);
    assert.equal(storage.value, "unreadable original history");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
