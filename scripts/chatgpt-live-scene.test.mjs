import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-live-scene-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { rebaseChatgptStep, editChatgptEntity } = await load("chatgpt-generation");
const { ChatgptSceneConflictError, chatgptPlanningSnapshot, assertChatgptPlanningCurrent } = await load("chatgpt-plan-guards");
const { chatgptSceneRetryConversation, CHATGPT_SCENE_REPLAN_LIMIT } = await load("chatgpt-live-scene");
const { createStarterVisualProject } = await load("starter-templates");
const { createEmptyEntity } = await load("editor-session");
const { resolveSceneSettings } = await load("scene-settings");
const starter = () => createStarterVisualProject("world", "blank", "live-scene-isolated-fixture");

test("async authoring merges changes to different existing Entities without replacing either", () => {
  const before = starter(), [target, other] = Object.keys(before.scene.entities);
  const next = editChatgptEntity(before, { entityId: target, name: "ChatGPTの調整" }).bundle;
  const latest = editChatgptEntity(before, { entityId: other, position: [4, 5, 6] }).bundle;
  const merged = rebaseChatgptStep(before, next, latest);
  assert.equal(merged.scene.entities[target], next.scene.entities[target]);
  assert.equal(merged.scene.entities[other], latest.scene.entities[other]);
  assert.equal(before.scene.entities[target].name, latest.scene.entities[target].name);
});

test("independent new root Entities retain both insertions and current order", () => {
  const before = starter();
  const assistant = createEmptyEntity(before.scene, null, "ChatGPTの追加");
  const human = createEmptyEntity(before.scene, null, "手動で追加");
  const merged = rebaseChatgptStep(before, { ...before, scene: assistant.scene }, { ...before, scene: human.scene });
  assert.deepEqual(merged.scene.rootEntityIds, [...human.scene.rootEntityIds, assistant.entityId]);
  assert.equal(merged.scene.entities[assistant.entityId], assistant.scene.entities[assistant.entityId]);
  assert.equal(merged.scene.entities[human.entityId], human.scene.entities[human.entityId]);
});

test("separate Settings sections and Prefab documents can be edited together", () => {
  const original = starter(), settings = resolveSceneSettings(original.scene.settings);
  const before = { ...original, scene: { ...original.scene, settings } };
  const next = { ...before, scene: { ...before.scene, settings: { ...settings, skybox: { ...settings.skybox, exposure: 0.5 } } }, prefabs: { ...before.prefabs, assistant: { name: "制作するPrefab" } } };
  const latest = { ...before, scene: { ...before.scene, settings: { ...settings, fog: { ...settings.fog, near: 35 } } }, prefabs: { ...before.prefabs, human: { name: "手動で追加したPrefab" } } };
  const merged = rebaseChatgptStep(before, next, latest);
  assert.equal(merged.scene.settings.skybox.exposure, 0.5);
  assert.equal(merged.scene.settings.fog.near, 35);
  assert.equal(merged.prefabs.assistant, next.prefabs.assistant);
  assert.equal(merged.prefabs.human, latest.prefabs.human);
});

test("same authored targets produce typed conflicts; crossing project or Scene cannot replan", () => {
  const original = starter(), entityId = Object.keys(original.scene.entities)[0];
  const before = { ...original, scene: { ...original.scene, settings: resolveSceneSettings(original.scene.settings) } };
  const next = editChatgptEntity(before, { entityId, name: "ChatGPTの調整" }).bundle;
  const latest = editChatgptEntity(before, { entityId, position: [4, 5, 6] }).bundle;
  assert.throws(() => rebaseChatgptStep(before, next, latest), ChatgptSceneConflictError);
  const settings = before.scene.settings;
  assert.throws(() => rebaseChatgptStep(before,
    { ...before, scene: { ...before.scene, settings: { ...settings, skybox: { ...settings.skybox, exposure: 0.5 } } } },
    { ...before, scene: { ...before.scene, settings: { ...settings, skybox: { ...settings.skybox, exposure: 1.8 } } } }), ChatgptSceneConflictError);
  for (const boundary of [
    { ...before, scene: { ...before.scene, sceneId: "different-scene" } },
    { ...before, project: { ...before.project, projectId: "different-project" } },
  ]) assert.throws(() => rebaseChatgptStep(before, next, boundary), error => !(error instanceof ChatgptSceneConflictError));
});

test("fresh inference detects unrelated authoring changes but ignores thumbnail and save bookkeeping", () => {
  const bundle = starter(), snapshot = chatgptPlanningSnapshot(bundle);
  const added = createEmptyEntity(bundle.scene, null, "制作中に手動で追加");
  assert.throws(() => assertChatgptPlanningCurrent({ ...bundle, scene: added.scene }, snapshot), ChatgptSceneConflictError);
  const removed = structuredClone(bundle);
  delete removed.scene.entities[Object.keys(removed.scene.entities)[0]];
  assert.throws(() => assertChatgptPlanningCurrent(removed, snapshot), ChatgptSceneConflictError);
  const derived = structuredClone(bundle);
  derived.project.lastSavedAt = "2026-10-14T00:00:00Z";
  for (const asset of Object.values(derived.assets.assets)) asset.thumbnail = { status: "generated" };
  assert.doesNotThrow(() => assertChatgptPlanningCurrent(derived, snapshot));
});

const job = saved => ({ prompt: "広場を順に制作してください", progress: { completed: 1, recentEvents: [
  { phase: "planning", message: "床とベンチを提案しています" },
  { phase: "placing", message: "床を配置して保存しました", saved },
  { phase: "placing", message: "ベンチを配置する準備をしています" },
] }, plan: { remainingWork: "ベンチを追加する" } });

test("replanning states only saved steps as completed and keeps prior history as reference", () => {
  const history = [{ prompt: "以前の依頼", result: "以前の保存結果" }];
  const conversation = chatgptSceneRetryConversation(history, job(true));
  assert.equal(CHATGPT_SCENE_REPLAN_LIMIT, 2);
  assert.deepEqual(conversation[0], history[0]);
  assert.match(conversation[1].result, /床を配置して保存しました/);
  assert.match(conversation[1].result, /手動編集を保持/);
  assert.match(conversation[1].result, /以前のPlanに残っていた作業: ベンチを追加する/);
  assert.doesNotMatch(conversation[1].result, /床とベンチを提案|ベンチを配置する準備/);
  assert.doesNotMatch(chatgptSceneRetryConversation([], job(false))[0].result, /床を配置して保存しました/);
});

test("repeated manual edits replace automatic continuation and bound Unicode history for native input", () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ prompt: "依頼".repeat(600), result: `結果${index}`.repeat(400) }));
  const first = chatgptSceneRetryConversation(history, job(true));
  const repeated = chatgptSceneRetryConversation(first, job(true));
  assert.deepEqual(repeated, first);
  assert.ok(repeated.length <= 6);
  assert.ok(Buffer.byteLength(JSON.stringify(repeated)) <= 23 * 1024);
  assert.ok(repeated.every(turn => [...turn.prompt].length <= 2000 && [...turn.result].length <= 2000));
});
