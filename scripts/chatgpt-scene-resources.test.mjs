import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-scene-resources-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { collectChatgptSceneResources } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-scene-resources.ts");
const { chatgptPlanSnapshots, assertChatgptPlanCurrent, chatgptOperationDetail } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-plan-guards.ts");
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

test("public Plan details expose proposed audio and Skybox settings without raw JSON or target IDs", () => {
  const resources = { projectAssets: [], builtinCandidates: [], components: [] };
  const audio = chatgptOperationDetail({kind:"audio",entityId:"private-entity-id",componentId:"private-component-id",enabled:false,volume:.125,loop:true,spatial:false,autoplay:true}, resources);
  assert.equal(audio,"音源 無効、音量 12.5%、ループ 有効、空間音声 無効、自動再生 有効");
  assert.equal(chatgptOperationDetail({kind:"audio",entityId:"target",volume:3},resources),"音量 300%");
  assert.equal(chatgptOperationDetail({kind:"skybox",enabled:true,iblEnabled:false,rotationDegrees:-45.25,exposure:.8},resources),"背景 有効、IBL 無効、回転 -45.25°、明るさ 0.8");
  assert.equal(chatgptOperationDetail({kind:"skybox",rotationDegrees:0,exposure:0},resources),"回転 0°、明るさ 0");
  assert.equal(chatgptOperationDetail({kind:"mesh-collision",entityId:"target",action:"add"},resources),"Colliderを追加");
  assert.equal(chatgptOperationDetail({kind:"mesh-collision",entityId:"target",action:"remove"},resources),"Colliderを解除");
  assert.doesNotMatch(audio,/private|entityId|componentId|[{}]/);
});

test("public Plan details use project, builtin and remote candidate names with safe missing-candidate fallbacks", () => {
  const resources={projectAssets:[{id:"private-model",kind:"model",name:"木の椅子"},{id:"private-material",kind:"material",name:"木材"}],builtinCandidates:[{candidateId:"builtin:private:sky",providerId:"private",name:"星空",description:"",actions:["skybox"]},{candidateId:"builtin:private:props",providerId:"private",name:"石のベンチ",description:"",actions:["catalog"]}],components:[]};
  const external=[{providerId:"ai-lowpoly-props",externalId:"private-remote-id",assetKind:"model",name:"小さなランプ"},{providerId:"otogura",externalId:"private-audio-id",assetKind:"audio",name:"鳥の声"}];
  assert.equal(chatgptOperationDetail({kind:"model-attachment",entityId:"target",candidateId:"project:private-model"},resources),"木の椅子を装着（名前・位置・回転・スケールを保持）");
  assert.equal(chatgptOperationDetail({kind:"material",entityId:"target",candidateId:"project:private-material"},resources),"Material：木材");
  assert.equal(chatgptOperationDetail({kind:"skybox",candidateId:"builtin:private:sky"},resources),"背景：星空");
  assert.equal(chatgptOperationDetail({kind:"catalog",candidateId:"builtin:private:props",position:[1,0,2]},resources),"石のベンチを追加");
  const remote=chatgptOperationDetail({kind:"model-attachment",entityId:"target",candidateId:"ai-lowpoly-props:private-remote-id"},resources,external);
  assert.match(remote,/小さなランプ/); assert.doesNotMatch(remote,/private|ai-lowpoly-props/);
  assert.equal(chatgptOperationDetail({kind:"audio",entityId:"target",candidateId:"otogura:private-audio-id",volume:.3},resources,external),"音声：鳥の声、音量 30%");
  for (const op of [{kind:"model-attachment",entityId:"target",candidateId:"private-unknown-id"},{kind:"material",entityId:"target",candidateId:"private-unknown-id"},{kind:"skybox",candidateId:"private-unknown-id"}]) {
    assert.doesNotMatch(chatgptOperationDetail(op,resources),/private|unknown|candidateId/);
  }
});
