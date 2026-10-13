import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-scene-resources-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { collectChatgptSceneResources } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-scene-resources.ts");
const { chatgptPlanSnapshots, assertChatgptPlanCurrent } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-plan-guards.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
const starter = () => createStarterVisualProject("world", "blank", "resources-fixture");
test("resource context includes selected components and usable assets without paths, source URLs or bytes", () => {
  const bundle = starter(), entity = Object.values(bundle.scene.entities)[0];
  entity.components.push({ id: "audio-1", type: "audio-source", enabled: true, audioAssetId: "audio", sourceUrl: "https://fixture.invalid/private?token=private", volume: 0.4, loop: true, autoplay: true, spatial: false, refDistance: 1, rolloffFactor: 1, maxDistance: 100 });
  bundle.assets.assets.audio = { id: "audio", name: "BGM", kind: "audio", status: "ready", source: { type: "file", relativePath: "private.wav" } };
  bundle.assets.assets.sky = { id: "sky", name: "Sky", kind: "texture", status: "ready", usage: "environment" };
  bundle.assets.assets.missing = { id: "missing", name: "Missing", kind: "model", status: "missing" };
  const resources = collectChatgptSceneResources(bundle, [entity.id], []);
  assert.deepEqual(resources.components.find(c => c.componentId === "audio-1").audio, { audioAssetId: "audio", enabled: true, volume: 0.4, loop: true, autoplay: true, spatial: false });
  assert.ok(resources.projectAssets.some(asset => asset.id === "sky" && asset.kind === "hdri"));
  assert.ok(!resources.projectAssets.some(asset => asset.id === "missing"));
  assert.doesNotMatch(JSON.stringify(resources), /private|sourceUrl|relativePath/);
});
test("large Japanese resource context respects the native UTF8 budget and preserves first selected components", () => {
  const bundle = starter(), entity = Object.values(bundle.scene.entities)[0];
  entity.components.push({ id: "mesh-selected", type: "mesh", geometryAssetId: "model-0", enabled: true });
  for (let i = 0; i < 500; i++) bundle.assets.assets[`model-${i}`] = { id: `model-${i}`, name: "日本語".repeat(100), kind: "model", status: "ready" };
  const resources = collectChatgptSceneResources(bundle, [entity.id], Array.from({ length: 128 }, (_, i) => ({ candidateId: `builtin:provider:${i}`, providerId: `provider${i % 10}`, name: "日本語".repeat(100), description: "素材説明".repeat(100), actions: ["catalog"] })));
  assert.ok(Buffer.byteLength(JSON.stringify(resources)) <= 31 * 1024);
  assert.ok(resources.components.some(c => c.componentId === "mesh-selected"));
  assert.ok(resources.projectAssets.some(asset => asset.id === "model-0"));
  assert.ok(resources.projectAssets.length <= 128);
});
test("Plan guards refuse touched Entity, project asset or sky changes but allow unrelated edits and generated thumbnails", () => {
  const bundle = starter(), entity = Object.values(bundle.scene.entities)[0];
  bundle.assets.assets.model = { id: "model", name: "Model", kind: "model", status: "ready" };
  const plan = { title: "", description: "", objects: [], operations: [{ kind: "skybox", exposure: 0.7 }, { kind: "model-attachment", entityId: entity.id, candidateId: "project:model" }] };
  const snapshots = chatgptPlanSnapshots(bundle, plan);
  for (const mutate of [b => { b.scene.entities[entity.id].name = "手動変更"; }, b => { b.assets.assets.model.name = "手動変更"; }, b => { b.scene.settings = { ...b.scene.settings, skybox: { ...b.scene.settings?.skybox, exposure: 3 } }; }, b => { delete b.assets.assets.model; }]) {
    const changed = structuredClone(bundle); mutate(changed);
    assert.throws(() => assertChatgptPlanCurrent(changed, plan, snapshots), /Planの作成後/);
  }
  const derived = structuredClone(bundle); derived.assets.assets.model.thumbnail = { status: "generated" }; derived.project.metadata.title = "作品名の変更";
  assert.doesNotThrow(() => assertChatgptPlanCurrent(derived, plan, snapshots));
});
