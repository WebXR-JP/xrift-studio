import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-harness-context-archive-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { prepareChatgptHarnessContext, restoreChatgptHarnessContext } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-context-archive.ts");
const { normalizeChatgptHarnessContextRef } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-context-ref.ts");
const { buildChatgptHarnessContext, normalizeChatgptHarnessContext, serializeChatgptHarnessContext } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-context.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
const sessions = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-sessions.ts");
const starter = () => createStarterVisualProject("world", "blank", "harness-archive-fixture");
const source = "export default function City() { return <group name=\"街の原本\" /> }";
const packet = () => {
  const bundle = starter(), original = Object.values(bundle.scene.entities)[0];
  bundle.scene.entities.code = { ...structuredClone(original), id: "code", name: "街", parentId: null, children: [], codeAuthoring: { version: 1, source, originalPrompt: "街", revision: 1, nodes: {}, materials: {} } };
  bundle.scene.rootEntityIds.push("code");
  return buildChatgptHarnessContext(bundle, { selectedEntityId: "code" });
};
class MemoryStore {
  values = new Map();
  events = [];
  read = async relative => { this.events.push(["read", relative]); return this.values.get(relative) ?? null; };
  write = async (relative, content) => { this.events.push(["write", relative]); this.values.set(relative, content); };
}

test("a reference is published only after canonical content is saved and verified by readback", async () => {
  const store = new MemoryStore(), original = packet();
  const prepared = await prepareChatgptHarnessContext(original, store);
  assert.deepEqual(store.events.map(event => event[0]), ["read", "write", "read"]);
  assert.equal(prepared.ref.fingerprint, original.fingerprint);
  assert.equal(prepared.ref.relativePath, `.cache/xrift-studio-harness/contexts/${original.fingerprint}.json`);
  const retained = store.values.get(prepared.ref.relativePath);
  assert.equal(Buffer.byteLength(retained), prepared.ref.byteLength);
  assert.equal(prepared.packet.resources.authoredScenes[0].source, source);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.ref), true);
  assert.equal(Object.isFrozen(prepared.packet.resources.authoredScenes[0]), true);
  assert.doesNotMatch(JSON.stringify(prepared.ref), /export default|data:image|originalPrompt|[A-Z]:\\/);
  assert.deepEqual(await restoreChatgptHarnessContext(prepared.ref, store), JSON.parse(retained));
  const writesBefore = store.events.filter(event => event[0] === "write").length;
  const again = await prepareChatgptHarnessContext(original, store);
  assert.deepEqual(again.ref, prepared.ref);
  assert.equal(store.events.filter(event => event[0] === "write").length, writesBefore, "same immutable artifact is reused without rewriting it");
});

test("storage failures and unsuccessful readback never issue a reference", async () => {
  for (const stage of ["read", "write", "readback"]) {
    const store = new MemoryStore(), originalRead = store.read;
    let reads = 0, issued = false;
    store.read = async relative => {
      reads++;
      if (stage === "read" || stage === "readback" && reads === 2) throw new Error("storage unavailable");
      return originalRead(relative);
    };
    if (stage === "write") store.write = async () => { throw new Error("storage full"); };
    await assert.rejects(prepareChatgptHarnessContext(packet(), store).then(() => { issued = true; }), /storage/);
    assert.equal(issued, false);
  }
  const lost = new MemoryStore();
  lost.write = async () => undefined;
  await assert.rejects(prepareChatgptHarnessContext(packet(), lost), /制作入力/);
});

test("existing malformed or different bytes are retained and rejected instead of overwritten", async () => {
  const original = packet(), relative = `.cache/xrift-studio-harness/contexts/${original.fingerprint}.json`;
  for (const bad of ["malformed saved artifact", serializeChatgptHarnessContext(original) + " ", serializeChatgptHarnessContext(original).replace("街の原本", "別の原本")]) {
    const store = new MemoryStore();
    store.values.set(relative, bad);
    await assert.rejects(prepareChatgptHarnessContext(original, store), /制作入力/);
    assert.equal(store.values.get(relative), bad);
    assert.equal(store.events.some(event => event[0] === "write"), false);
  }
});

test("every restore and dispatch checks the saved content again after external modification", async () => {
  const store = new MemoryStore(), prepared = await prepareChatgptHarnessContext(packet(), store);
  const before = store.values.get(prepared.ref.relativePath);
  store.values.set(prepared.ref.relativePath, before.replace("街の原本", "別の原本"));
  await assert.rejects(restoreChatgptHarnessContext(prepared.ref, store), /制作入力/);
  let dispatched = false;
  await assert.rejects(prepared.dispatch(async () => { dispatched = true; }), /制作入力/);
  assert.equal(dispatched, false);
  store.values.set(prepared.ref.relativePath, before);
  assert.equal((await restoreChatgptHarnessContext(prepared.ref, store)).resources.authoredScenes[0].source, source);
  await assert.rejects(prepared.dispatch(async () => { dispatched = true; }), /すでに/);
  assert.equal(dispatched, false, "failed verification consumed the seal and cannot be retried with stale authorization");
});

test("single-use preparation dispatches exact verified input and rechecks Scene after archive IO", async () => {
  const store = new MemoryStore(), original = packet();
  const prepared = await prepareChatgptHarnessContext(original, store);
  let sceneFingerprint = original.sceneFingerprint, calls = 0;
  const originalRead = store.read;
  store.read = async relative => {
    const value = await originalRead(relative);
    sceneFingerprint = "edited while reading the archive";
    return value;
  };
  await assert.rejects(prepared.dispatch(async () => { calls++; }, () => {
    assert.equal(sceneFingerprint, original.sceneFingerprint, "Scene changed after preparation");
  }), /Scene changed/);
  assert.equal(calls, 0);
  await assert.rejects(prepared.dispatch(async () => { calls++; }), /すでに/);
  assert.equal(calls, 0);
  store.read = originalRead;
  const next = await prepareChatgptHarnessContext(original, store);
  const result = await next.dispatch(async sealed => { calls++; assert.deepEqual(sealed, JSON.parse(serializeChatgptHarnessContext(original))); return "sent once"; }, () => { sceneFingerprint = original.sceneFingerprint; });
  assert.equal(result, "sent once");
  assert.equal(calls, 1);
  await assert.rejects(next.dispatch(async () => { calls++; }), /すでに/);
  assert.equal(calls, 1);
});

test("concurrent consumers cannot dispatch the same prepared request twice", async () => {
  const store = new MemoryStore(), prepared = await prepareChatgptHarnessContext(packet(), store);
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  store.read = async relative => { await gate; return store.values.get(relative); };
  const first = prepared.dispatch(async () => { calls++; return 1; });
  await assert.rejects(prepared.dispatch(async () => { calls++; return 2; }), /すでに/);
  release();
  assert.equal(await first, 1);
  assert.equal(calls, 1);
});

test("altered packets and unsafe references fail before touching the store", async () => {
  const original = packet(), store = new MemoryStore();
  for (const corrupted of [
    { ...original, version: 2 },
    { ...original, token: "private-provider-token" },
    { ...original, contextBytes: original.contextBytes + 1 },
    { ...original, scene: { ...original.scene, entities: [] } },
  ]) {
    assert.throws(() => normalizeChatgptHarnessContext(corrupted), /制作入力/);
    await assert.rejects(prepareChatgptHarnessContext(corrupted, store), /制作入力/);
  }
  assert.equal(store.events.length, 0);
  const prepared = await prepareChatgptHarnessContext(original, store);
  for (const corrupted of [
    { ...prepared.ref, version: 2 }, { ...prepared.ref, kind: "provider-request" },
    { ...prepared.ref, relativePath: "../../credentials.json" },
    { ...prepared.ref, relativePath: "C:\\private\\input.json" },
    { ...prepared.ref, contextBytes: Infinity }, { ...prepared.ref, byteLength: prepared.ref.byteLength + 1 }, { ...prepared.ref, source: "raw-source-must-not-enter-history" },
  ]) assert.throws(() => normalizeChatgptHarnessContextRef(corrupted), /参照記録/);
});

test("session history stores only bounded exact references and preserves corrupt history", async () => {
  const prepared = await prepareChatgptHarnessContext(packet(), new MemoryStore());
  const date = "2026-10-17T00:00:00.000Z";
  const session = sessions.createChatgptSession("project", "scene", "街", date, "session");
  const turn = { generationId: "request", status: "completed", model: "fixture", prompt: "街を作る", options: { models: true, materials: true, audio: true }, sourceProjectId: "project", sourceSceneId: "scene", progress: { phase: "completed", message: "完了", completed: 1, total: 1, recentEvents: [] }, contextRefs: [prepared.ref] };
  const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  sessions.saveChatgptSessions([{ ...session, turns: [turn] }], storage);
  assert.doesNotMatch(storage.value, /export default|街の原本|componentDefinitions|data:image/);
  assert.deepEqual(sessions.loadChatgptSessions(storage)[0].turns[0].contextRefs, [prepared.ref]);
  const before = storage.value;
  for (const refs of [[{ ...prepared.ref, version: 2 }], Array.from({ length: 9 }, () => prepared.ref), [{ ...prepared.ref, relativePath: "/private/data.json" }]]) {
    assert.throws(() => sessions.saveChatgptSessions([{ ...session, turns: [{ ...turn, contextRefs: refs }] }], storage), /参照記録/);
    assert.equal(storage.value, before);
    storage.value = JSON.stringify({ version: 1, sessions: [{ ...session, turns: [{ ...turn, contextRefs: refs }] }] });
    const damaged = storage.value;
    assert.throws(() => sessions.loadChatgptSessions(storage), /参照記録/);
    assert.equal(storage.value, damaged);
    storage.value = before;
  }
});
