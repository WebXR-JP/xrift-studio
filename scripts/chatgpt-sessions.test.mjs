import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript-test-api";

const sourceRoots = ["../src/", "../packages/xrift-studio-runtime/src/"].map(path => new URL(path, import.meta.url).href);
const isSource = url => sourceRoots.some(root => url.startsWith(root));
// Load production code and its local data dependencies, without rewriting packages.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL && isSource(context.parentURL)) {
      const candidate = new URL(specifier, context.parentURL);
      if (isSource(candidate.href) && !candidate.pathname.endsWith(".ts") && !candidate.pathname.endsWith(".json")) {
        const typed = new URL(`${candidate.href}.ts`);
        if (existsSync(fileURLToPath(typed))) return next(typed.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (isSource(url) && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    if (isSource(url) && url.endsWith(".json")) return { format: "module", shortCircuit: true,
      source: `export default JSON.parse(${JSON.stringify(readFileSync(fileURLToPath(url), "utf8"))});` };
    return next(url, context);
  },
});
const api = await import("../src/lib/visual-editor/chatgpt-sessions.ts");
const piSettings = await import("../src/lib/visual-editor/pi-settings.ts");
const { sceneSettingsDisplay } = await import("../src/lib/visual-editor/chatgpt-change-description.ts");
hooks.deregister();
const date = "2026-10-14T00:00:00.000Z";
const session = (id = "session-1", title = "新しいチャット") => api.createChatgptSession("project-1", "scene-1", title, date, id);
const turn = (id = "job-1", extra = {}) => ({
  generationId: id, status: "completed", model: "fixture-model", reasoningEffort: "low", prompt: "Lightを右に動かして", createdAt: date,
  options: { models: true, materials: true, audio: true }, sourceProjectId: "project-1", sourceSceneId: "scene-1", sceneId: "scene-1", projectId: "project-1",
  plan: { title: "Lightの調整", description: "既存のComponentsを保って移動します", objects: [{ name: "Light", shape: "調整" }] },
  progress: { phase: "completed", message: "Lightを保存しました", completed: 1, total: 1, recentEvents: [{ sequence: 1, phase: "saving", message: "Lightを保存", entityId: "light-1", name: "Light" }] },
  revertAvailable: true, ...extra,
});
class MemoryStorage {
  value = null;
  getItem(key) { assert.equal(key, api.CHATGPT_SESSION_STORAGE_KEY); return this.value; }
  setItem(key, value) { assert.equal(key, api.CHATGPT_SESSION_STORAGE_KEY); this.value = value; }
}
const withTurn = (...turns) => ({ ...session(), turns });

test("additional instructions and a neutral reply survive restart without claiming pending input was received", () => {
  const storage = new MemoryStorage();
  const messages = [
    { id: "pending-input", prompt: "入口を広く", delivery: "steer", state: "queued", attachedEntityIds: ["entry"] },
    { id: "received-input", prompt: "窓を調整", delivery: "follow_up", state: "applied", attachedMaterialIds: ["window-material"] },
  ];
  api.saveChatgptSessions([withTurn(turn("neutral", { completionVerified: false, liveMessages: messages }))], storage);
  const restored = api.loadChatgptSessions(storage)[0].turns[0];
  assert.equal(restored.completionVerified, false);
  assert.equal(restored.liveMessages[0].state, "unapplied");
  assert.deepEqual(restored.liveMessages[0].attachedEntityIds, ["entry"]);
  assert.equal(restored.liveMessages[1].state, "applied");
  assert.deepEqual(restored.liveMessages[1].attachedMaterialIds, ["window-material"]);
});
const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

test("Pi branch pointers survive storage and branch only at a finished response", () => {
  const storage = new MemoryStorage();
  const piHistory = { sessionId: 'pi-root', leafId: 'answer-1', nodes: [{ id: 'tool-1', parentId: null, label: 'ツール操作', canBranch: false }, { id: 'answer-1', parentId: 'tool-1', label: 'AIの応答', canBranch: true }] };
  const source = withTurn(turn('pi-turn', { piHistory, options: { models: true, materials: true, audio: false, teamwork: true, extensions: ['npm:example@1.2.3'] } }));
  const branched = api.branchChatgptSession(source, 'answer-1', date, 'branch-chat');
  assert.deepEqual(branched.piBranch, { sessionId: 'pi-root', leafId: 'answer-1', parentSessionId: source.id });
  assert.equal(branched.turns.length, 0);
  assert.throws(() => api.branchChatgptSession(source, 'tool-1'), /分岐できる/);
  api.saveChatgptSessions([source, branched], storage);
  const restored = api.loadChatgptSessions(storage);
  assert.deepEqual(restored.find(item => item.id === 'branch-chat').piBranch, branched.piBranch);
  assert.equal(restored.find(item => item.id === source.id).turns[0].options.teamwork, undefined);
  assert.deepEqual(restored.find(item => item.id === source.id).turns[0].options.extensions, ['npm:example@1.2.3']);
});
test("extension registrations require exact npm versions and persist explicit settings", () => {
  for (const value of ['npm:example@latest', 'git:example', 'npm:../example@1.0.0', 'npm:example@^1.0.0']) assert.throws(() => piSettings.parsePiPackages(value));
  let raw = null;
  const storage = { getItem: () => raw, setItem(_key, value) { raw = value; } };
  assert.deepEqual(piSettings.loadPiSettings(storage), { extensions: [] });
  raw = JSON.stringify({ version: 1, teamwork: true, extensions: ['npm:old@1.0.0'] });
  assert.deepEqual(piSettings.loadPiSettings(storage), { extensions: ['npm:old@1.0.0'] });
  piSettings.savePiSettings({ extensions: ['npm:@example/tools@1.2.3'] }, storage);
  assert.deepEqual(piSettings.loadPiSettings(storage), { extensions: ['npm:@example/tools@1.2.3'] });
});

test("twelve-choice metadata and catalog proposal thumbnails survive history reload", () => {
  const storage = new MemoryStorage();
  const ids = Array.from({ length: 12 }, (_, index) => `builtin:xrift-sky-shaders:sky-${index}`);
  const questions = [{ question: "空を選ぶ", choices: ids.map((_, index) => `空${index}`), choiceCandidateIds: ids }];
  const preview = { kind: "builtin", name: "素材", candidateId: "builtin:xrift-material-showcases:scene-recipe.material-clearcoat" };
  const value = turn("preview-turn", { plan: { title: "候補", description: "見た目を比較", questions, objects: [{ name: "素材", shape: "追加", preview }] }, questionPreviews: Object.fromEntries(ids.map((id, index) => [id, { kind: "sky", name: `空${index}`, catalogId: `sky-${index}` }])) });
  api.saveChatgptSessions([withTurn(value)], storage);
  const restored = api.loadChatgptSessions(storage)[0].turns[0];
  assert.equal(Object.keys(restored.questionPreviews).length, 12);
  assert.deepEqual(restored.plan.questions, questions);
  assert.deepEqual(restored.plan.objects[0].preview, preview);
});

test("out-of-order model results keep their saved flag and Inspector target after restart", () => {
  const storage = new MemoryStorage();
  const objects = [{ name: "制作中", shape: "追加", saved: false }, { name: "完成したモデル", shape: "追加", saved: true, entityId: "finished-model" }];
  api.saveChatgptSessions([withTurn(turn("models", { status: "running", plan: { title: "モデル制作", description: "完成順に反映", objects } }))], storage);
  assert.deepEqual(api.loadChatgptSessions(storage)[0].turns[0].plan.objects, objects);
});

test("Material attachments survive restart and remain named in copied history and continuation context", () => {
  const storage = new MemoryStorage();
  const attachedMaterials = [{ id: "material-1", name: "公園の床Material" }];
  api.saveChatgptSessions([withTurn(turn("material-request", { attachedMaterials,
    plan: { title: "Materialの調整", description: "既存の質感を調整", objects: [{ name: "Materialの設定を変更", shape: "調整", materialAssetId: "material-1" }] },
  }))], storage);
  const restored = api.loadChatgptSessions(storage)[0];
  assert.deepEqual(restored.turns[0].attachedMaterials, attachedMaterials);
  assert.equal(restored.turns[0].plan.objects[0].materialAssetId, "material-1");
  assert.match(api.chatgptSessionTranscript(restored), /添付Material: 公園の床Material/);
  assert.match(api.chatgptConversationContext(restored)[0].result, /添付Material: 公園の床Material/);
});

test("session updates preserve identity, user titles, request times and live cancellation", () => {
  const before = [session()];
  const result = api.upsertChatgptSessionTurn(before, "session-1", turn());
  assert.equal(before[0].turns.length, 0);
  assert.equal(result[0].title, "Lightを右に動かして");
  const later = "2026-10-14T00:01:00.000Z";
  const updated = api.upsertChatgptSessionTurn(result, "session-1", turn("job-1", { status: "running", cancelling: true, createdAt: later }), later);
  assert.equal(updated[0].turns.length, 1);
  assert.equal(updated[0].turns[0].createdAt, date);
  assert.equal(updated[0].turns[0].cancelling, true);
  assert.equal(updated[0].updatedAt, later);
  const renamed = api.upsertChatgptSessionTurn([session("session-2", "照明の相談")], "session-2", turn());
  assert.equal(renamed[0].title, "照明の相談");
});

test("requests cannot enter another Scene; a new-world result can retain its source conversation", () => {
  assert.throws(() => api.upsertChatgptSessionTurn([session()], "session-1", turn("foreign", { sourceSceneId: "scene-2", sceneId: "scene-2" })), /別の作品やScene/);
  assert.throws(() => api.upsertChatgptSessionTurn([session()], "session-1", turn("foreign", { sourceProjectId: "project-2", projectId: "project-2" })), /別の作品やScene/);
  const moved = api.upsertChatgptSessionTurn([session()], "session-1", turn("new", { projectId: "project-2", sceneId: "scene-2" }));
  assert.equal(moved[0].turns[0].sourceSceneId, "scene-1");
  assert.throws(() => api.upsertChatgptSessionTurn([], "missing", turn()), /見つかりません/);
});

test("restarting ends native running/planned jobs without advertising lost apply/revert controls", () => {
  const storage = new MemoryStorage();
  api.saveChatgptSessions([withTurn(turn("running", { status: "running", cancelling: true }), turn("planned", { status: "planned" }), turn("done"))], storage);
  const restored = api.loadChatgptSessions(storage)[0];
  assert.deepEqual(restored.turns.map(t => t.status), ["cancelled", "cancelled", "completed"]);
  assert.ok(restored.turns.every(t => t.revertAvailable === false && t.cancelling === false));
  assert.match(restored.turns[0].progress.message, /再起動/);
  assert.equal(restored.turns[1].plan.title, "Lightの調整");
  assert.equal(restored.turns[2].progress.completed, 1);
});

test("public Plan settings remain readable after reload and in a copied transcript", () => {
  const storage = new MemoryStorage();
  const value = turn();
  value.plan.objects = [{ name: "BGM", shape: "調整", detail: "音量30%、ループあり" }];
  api.saveChatgptSessions([withTurn(value)], storage);
  const restored = api.loadChatgptSessions(storage)[0];
  assert.equal(restored.turns[0].plan.objects[0].detail, "音量30%、ループあり");
  assert.match(api.chatgptSessionTranscript(restored), /音量30%、ループあり/);
});

test("Scene setting rows retain labels, units, previous values and safe visual metadata after reload", () => {
  const storage = new MemoryStorage();
  const settings = [
    { label: "Fog", value: "有効", previousValue: "無効", enabled: true },
    { label: "Fogの開始距離", value: "35 m", previousValue: "20 m" },
    { label: "Fogの色", value: "#dce8ed", previousValue: "#112233", color: "#dce8ed" },
    { label: "型の不正な付加情報", value: "値", enabled: "true", color: "url(unsafe)" },
    { label: "長".repeat(100), value: "値".repeat(300), previousValue: "前".repeat(300) },
  ];
  api.saveChatgptSessions([withTurn(turn("settings", { plan: { title: "Fog", description: "遠景を調整", objects: [{ name: "Fogを変更", shape: "調整", settings }] } }))], storage);
  const restored = api.loadChatgptSessions(storage)[0].turns[0].plan.objects[0].settings;
  assert.deepEqual(restored.slice(0, 3), settings.slice(0, 3));
  assert.deepEqual(restored[3], { label: "型の不正な付加情報", value: "値" });
  assert.equal(restored[4].label.length, 80);
  assert.equal(restored[4].value.length, 240);
  assert.equal(restored[4].previousValue.length, 240);
});

test("old JSON Scene details recover readable rows without inventing historical previous values", () => {
  for (const detail of [
    'fog: {"enabled":true,"color":"#dce8ed","near":35,"far":110}',
    '{"fog":{"enabled":true,"color":"#dce8ed","near":35,"far":110}}',
  ]) {
    const storage = new MemoryStorage();
    api.saveChatgptSessions([withTurn(turn("legacy", { plan: { title: "設定", description: "設定", objects: [{ name: "Scene設定を調整", shape: "調整", detail }] } }))], storage);
    const object = api.loadChatgptSessions(storage)[0].turns[0].plan.objects[0];
    assert.match(object.name, /^Fog・Fogの色・Fogの開始距離/);
    assert.deepEqual(object.settings, [
      { label: "Fog", value: "有効", enabled: true },
      { label: "Fogの色", value: "#dce8ed", color: "#dce8ed" },
      { label: "Fogの開始距離", value: "35 m" },
      { label: "Fogの終了距離", value: "110 m" },
    ]);
    assert.ok(object.settings.every(setting => setting.previousValue === undefined));
  }
  const storage = new MemoryStorage();
  const details = ['shadowMapType: "pcfSoft"', 'fog: {"enabled":true', '{"__proto__":{"enabled":true}}'];
  api.saveChatgptSessions([withTurn(turn("legacy-shadow", { plan: { title: "設定", description: "設定", objects: details.map(detail => ({ name: "Scene設定を調整", shape: "調整", detail })) } }))], storage);
  const objects = api.loadChatgptSessions(storage)[0].turns[0].plan.objects;
  assert.deepEqual(objects[0].settings, [{ label: "Shadow Mapの種類", value: "PCF Soft" }]);
  assert.ok(objects.slice(1).every(object => object.settings === undefined && object.name === "Scene設定を調整"));
});

test("saved Scene rows show actual disabled IBL after the proposed value was normalized", () => {
  const before = bundle(), after = structuredClone(before);
  before.scene.settings.skybox = { iblEnabled: false };
  after.scene.settings.skybox = { iblEnabled: false };
  const patch = { skybox: { iblEnabled: true } };
  assert.equal(sceneSettingsDisplay(patch, before)[0].enabled, true);
  const settings = sceneSettingsDisplay(patch, before, after);
  assert.deepEqual(settings, [{ label: "IBL（画像による照明）", value: "無効", previousValue: "無効", enabled: false }]);
  const storage = new MemoryStorage();
  api.saveChatgptSessions([withTurn(turn("actual-ibl", { plan: { title: "Skybox", description: "画像なしのIBL", objects: [{ name: "IBLを変更", shape: "調整", settings }] } }))], storage);
  assert.deepEqual(api.loadChatgptSessions(storage)[0].turns[0].plan.objects[0].settings, settings);
});

test("saved requests retain their modeling source across updates and restart", () => {
  for (const modelSource of ["auto", "blender", "store"]) {
    const storage = new MemoryStorage();
    const options = { models: true, materials: false, audio: false, modelSource };
    const updated = api.upsertChatgptSessionTurn([session()], "session-1", turn("model", { options }));
    assert.deepEqual(updated[0].turns[0].options, options);
    api.saveChatgptSessions(updated, storage);
    assert.deepEqual(api.loadChatgptSessions(storage)[0].turns[0].options, options);
  }
  const storage = new MemoryStorage();
  api.saveChatgptSessions([withTurn(turn("unknown-source", { options: { models: true, materials: true, audio: true, modelSource: "unrecognized" } }))], storage);
  assert.equal(api.loadChatgptSessions(storage)[0].turns[0].options.modelSource, undefined);
});

test("persisted/copy/context records exclude transport credentials, URL queries and local paths", () => {
  const storage = new MemoryStorage();
  const secret = "testsecret987654321";
  const unsafe = turn("private", {
    path: "C:/private/work/world", accessToken: secret,
    prompt: `Bearer ${secret}\naccess_token=${secret}\nhttps://example.test/asset?code=${secret}&state=private\nfile:///private/work/world\nC:/private/work/world\n/home/private/world`,
    error: `refresh_token=${secret}\napi_key=${secret}\nAuthorization: Bearer ${secret}\n\\\\private-server\\private-share\\world`,
    plan: { title: "接続", description: `https://user:${secret}@example.test/path?token=${secret}`, objects: [] },
  });
  const saved = api.saveChatgptSessions([withTurn(unsafe)], storage);
  for (const value of [storage.value, api.chatgptSessionTranscript(saved[0]), JSON.stringify(api.chatgptConversationContext(saved[0]))]) {
    assert.ok(!value.includes(secret));
    assert.ok(!value.includes("private/work"));
    assert.ok(!value.includes("private-server"));
    assert.ok(!value.includes("?code="));
    assert.ok(!value.includes("accessToken"));
  }
  assert.equal(saved[0].turns[0].path, undefined);
  assert.ok(storage.value.includes("https://example.test/asset"));
});

test("quota/read errors retain previous bytes and never echo private storage failures", () => {
  const storage = new MemoryStorage();
  api.saveChatgptSessions([withTurn(turn())], storage);
  const previous = storage.value;
  storage.setItem = () => { throw new Error("C:/private/quota secret=hidden"); };
  assert.throws(() => api.saveChatgptSessions([session()], storage), /内容をコピー/);
  assert.equal(storage.value, previous);
  assert.throws(() => api.loadChatgptSessions({ getItem() { throw new Error("Bearer hidden"); } }), /保存先へのアクセス/);
});

test("invalid or oversized history fails visibly without deleting the original", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(api.loadChatgptSessions(storage), []);
  for (const raw of ["not-json", JSON.stringify({ version: 99, sessions: [] }), JSON.stringify({ version: 1, sessions: [{ id: "broken" }] }), "x".repeat(api.CHATGPT_SESSION_STORAGE_BYTES + 1)]) {
    storage.value = raw;
    assert.throws(() => api.loadChatgptSessions(storage), /会話履歴/);
    assert.equal(storage.value, raw);
  }
});

test("storage keeps at most twenty sessions and thirty latest requests in chronological order", () => {
  const storage = new MemoryStorage();
  const sessions = Array.from({ length: 25 }, (_, i) => ({ ...session(`session-${i}`), updatedAt: new Date(Date.parse(date) + i * 1000).toISOString(), turns: Array.from({ length: 35 }, (_, j) => turn(`job-${i}-${j}`)) }));
  const saved = api.saveChatgptSessions(sessions, storage);
  assert.equal(saved.length, 20);
  assert.equal(saved[0].id, "session-24");
  assert.equal(saved.at(-1).id, "session-5");
  assert.equal(saved[0].turns.length, 30);
  assert.equal(saved[0].turns[0].generationId, "job-24-5");
  assert.equal(saved[0].turns.at(-1).generationId, "job-24-34");
  assert.ok(Buffer.byteLength(storage.value, "utf8") <= api.CHATGPT_SESSION_STORAGE_BYTES);
});

test("large Unicode event histories obey a global byte budget and preserve newest requests", () => {
  const storage = new MemoryStorage();
  const sessions = Array.from({ length: 20 }, (_, i) => ({ ...session(`session-${i}`), updatedAt: new Date(Date.parse(date) + i * 1000).toISOString(), turns: Array.from({ length: 30 }, (_, j) => turn(`job-${i}-${j}`, { prompt: "あ".repeat(2000), progress: { phase: "completed", message: "あ".repeat(1000), completed: 1, total: 1, recentEvents: Array.from({ length: 128 }, (_, k) => ({ sequence: k, phase: "saving", message: "あ".repeat(600) })) } })) }));
  const saved = api.saveChatgptSessions(sessions, storage);
  assert.ok(Buffer.byteLength(storage.value, "utf8") <= api.CHATGPT_SESSION_STORAGE_BYTES);
  assert.equal(saved[0].turns.at(-1).generationId, "job-19-29");
  assert.ok(saved.reduce((count, s) => count + s.turns.length, 0) < 600);
  assert.doesNotThrow(() => api.loadChatgptSessions(storage));
});

test("copy includes every retained request, model, effort, Plan, saved results, errors and revert time", () => {
  const value = withTurn(turn("first"), turn("second", { status: "failed", error: "通信が止まりました", revertedAt: "2026-10-14T00:02:00.000Z" }));
  const transcript = api.chatgptSessionTranscript(value);
  for (const expected of ["依頼 1", "依頼 2", "fixture-model", "回答の検討度: low", "Lightの調整", "保存済み 1 / 1", "通信が止まりました", "変更を戻しました", "2026-10-14T00:02:00.000Z"]) assert.ok(transcript.includes(expected));
  assert.equal((transcript.match(/Lightを右に動かして/g) || []).length, 2);
});

test("Continue uses the six newest finished requests, keeps order and distinguishes reverted changes", () => {
  const value = withTurn(...Array.from({ length: 9 }, (_, i) => turn(`job-${i}`, { prompt: `依頼${i}`, ...(i === 8 ? { status: "running" } : {}), ...(i === 7 ? { revertedAt: date } : {}) })));
  const context = api.chatgptConversationContext(value);
  assert.deepEqual(context.map(t => t.prompt), ["依頼2", "依頼3", "依頼4", "依頼5", "依頼6", "依頼7"]);
  assert.match(context.at(-1).result, /現在のSceneに残っていません/);
});

test("Continue truncates codepoints without splitting emoji and caps serialized UTF8 at 24 KiB", () => {
  const value = withTurn(...Array.from({ length: 6 }, (_, i) => turn(`unicode-${i}`, { prompt: "😀".repeat(3000), progress: { phase: "completed", message: "界".repeat(1000), completed: 1, total: 1, recentEvents: Array.from({ length: 10 }, (_, k) => ({ sequence: k, phase: "saving", message: "界".repeat(600) })) } })));
  const context = api.chatgptConversationContext(value);
  assert.ok(context.length > 0 && context.length < 6);
  assert.ok(bytes(context) <= api.CHATGPT_CONVERSATION_BYTES);
  for (const t of context) {
    assert.equal(Array.from(t.prompt).length, 2000);
    assert.ok(Array.from(t.result).length <= 2000);
    assert.ok(!t.prompt.includes("\uFFFD"));
  }
});

function bundle() {
  return { project: { projectId: "project-1", metadata: { title: "制作前", updatedAt: date }, lastPublication: { worldId: "world-1" } },
    scene: { sceneId: "scene-1", rootEntityIds: ["light-1"], entities: { "light-1": { id: "light-1", name: "Light", components: [{ type: "transform", position: [0, 0, 0] }, { type: "light", intensity: 1 }] } }, settings: { background: "#fff" } },
    assets: { assets: { original: { id: "original", kind: "material", properties: { color: "#abc" } } }, folders: [] }, prefabs: {} };
}
function sequence() {
  const first = bundle(), imported = structuredClone(first);
  imported.assets.assets.imported = { id: "imported", kind: "model", source: { relativePath: "assets/imported/model.glb" } };
  const placed = structuredClone(imported);
  placed.scene.entities["light-1"].components[0].position = [1, 0, 0];
  placed.prefabs.example = { prefabId: "example", rootEntityId: "root" };
  return { first, imported, placed, checkpoints: [api.createChatgptRevertCheckpoint(first, imported), api.createChatgptRevertCheckpoint(imported, placed)] };
}

test("Revert restores a continuous AI request while preserving current metadata/publication and immutable inputs", () => {
  const { first, placed, checkpoints } = sequence();
  placed.project.metadata.title = "手で付けた作品名";
  placed.project.lastPublication = { worldId: "world-2", versionNumber: 2 };
  const snapshot = JSON.stringify(placed);
  const restored = api.chatgptRevertBundle(placed, checkpoints);
  assert.equal(restored.project, placed.project);
  assert.deepEqual(restored.scene, first.scene);
  assert.deepEqual(restored.assets, first.assets);
  assert.deepEqual(restored.prefabs, first.prefabs);
  assert.equal(restored.project.metadata.title, "手で付けた作品名");
  assert.equal(restored.project.lastPublication.worldId, "world-2");
  assert.equal(JSON.stringify(placed), snapshot);
  restored.scene.entities["light-1"].name = "別名";
  assert.equal(checkpoints[0].before.scene.entities["light-1"].name, "Light");
});

test("Revert refuses intervening manual edits in Scene, Assets or Prefabs", () => {
  for (const change of [value => { value.scene.entities["light-1"].name = "手動編集"; }, value => { value.assets.assets.original.properties.color = "#123"; }, value => { value.prefabs.example.rootEntityId = "manual-root"; }]) {
    const { placed, checkpoints } = sequence();
    change(placed);
    const snapshot = JSON.stringify(placed);
    assert.throws(() => api.chatgptRevertBundle(placed, checkpoints), /手動編集/);
    assert.equal(JSON.stringify(placed), snapshot);
  }
  const { first, imported, placed } = sequence();
  const manual = structuredClone(imported);
  manual.scene.entities["light-1"].name = "途中の手動編集";
  assert.throws(() => api.chatgptRevertBundle(placed, [api.createChatgptRevertCheckpoint(first, imported), api.createChatgptRevertCheckpoint(manual, placed)]), /途中に別の編集/);
});

test("Revert rejects another project/Scene and empty history; key ordering alone is harmless", () => {
  const { placed, checkpoints } = sequence();
  assert.throws(() => api.chatgptRevertBundle(placed, []), /戻せる/);
  for (const change of [value => { value.project.projectId = "project-2"; }, value => { value.scene.sceneId = "scene-2"; }]) {
    const foreign = structuredClone(placed); change(foreign);
    assert.throws(() => api.chatgptRevertBundle(foreign, checkpoints), /作品とScene/);
    assert.throws(() => api.createChatgptRevertCheckpoint(placed, foreign), /別の作品やScene/);
  }
  const reordered = structuredClone(placed);
  reordered.scene.entities["light-1"] = { components: reordered.scene.entities["light-1"].components, name: "Light", id: "light-1" };
  assert.doesNotThrow(() => api.chatgptRevertBundle(reordered, checkpoints));
});

test("checkpoint capture detaches both sides from later asynchronous mutations", () => {
  const { first, imported } = sequence();
  const checkpoint = api.createChatgptRevertCheckpoint(first, imported);
  first.scene.entities["light-1"].name = "後の変更";
  imported.assets.assets.original.properties.color = "#000";
  assert.equal(checkpoint.before.scene.entities["light-1"].name, "Light");
  assert.equal(checkpoint.after.assets.assets.original.properties.color, "#abc");
});

test("background thumbnails do not prevent Revert, while authored Material changes still do", () => {
  const { first, imported } = sequence();
  const checkpoint = api.createChatgptRevertCheckpoint(first, imported);
  const derived = structuredClone(imported);
  derived.assets.assets.original.thumbnail = { status: "generated", relativePath: "thumbnails/original.png" };
  assert.doesNotThrow(() => api.chatgptRevertBundle(derived, [checkpoint]));
  derived.assets.assets.original.properties.color = "#000";
  assert.throws(() => api.chatgptRevertBundle(derived, [checkpoint]), /制作の後に編集/);
});

test("a request can extend one checkpoint without retaining intermediate bundles or swallowing manual edits", () => {
  const { first, imported, placed } = sequence();
  const initial = api.extendChatgptRevertCheckpoint(undefined, first, imported);
  const combined = api.extendChatgptRevertCheckpoint(initial, imported, placed);
  assert.equal(combined.before, initial.before);
  assert.notEqual(combined.after, placed);
  assert.deepEqual(api.chatgptRevertBundle(placed, [combined]).scene, first.scene);
  const manual = structuredClone(imported);
  manual.scene.settings.background = "#123";
  assert.throws(() => api.extendChatgptRevertCheckpoint(initial, manual, placed), /途中に別の編集/);
  const foreign = structuredClone(placed); foreign.scene.sceneId = "scene-2";
  assert.throws(() => api.extendChatgptRevertCheckpoint(initial, imported, foreign), /別の作品やScene/);
  placed.assets.assets.original.properties.color = "#000";
  assert.equal(combined.after.assets.assets.original.properties.color, "#abc");
});
