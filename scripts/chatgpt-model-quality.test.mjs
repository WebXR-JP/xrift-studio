import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const dependencyId = "\0chatgpt-model-quality-test-dependencies";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-model-quality-test",
  plugins: [{ name: "quality-control-flow-dependencies", enforce: "pre", resolveId(source) {
    if (source === "virtual:quality-dependencies") return dependencyId;
  }, transform(code, id) {
    if (id.replaceAll("\\", "/").endsWith("/chatgpt-model-quality.ts")) return code.replaceAll('from "./chatgpt-model-source"', 'from "virtual:quality-dependencies"').replaceAll('from "./chatgpt-generation"', 'from "virtual:quality-dependencies"');
  }, load(id) {
    if (id === dependencyId) return `export const hooks = {};
      export const readBlenderEntityModelSource = (...args) => hooks.readSource(...args);
      export const applyChatgptOperation = (...args) => hooks.apply(...args);`;
  } }],
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { hooks } = await server.ssrLoadModule("virtual:quality-dependencies");
const { reviewChatgptModel, chatgptModelSnapshot } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-model-quality.ts");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
const { createMeshComponent } = await server.ssrLoadModule("/src/lib/visual-editor/scene-document.ts");
const { parseBlenderModelSpec } = await server.ssrLoadModule("/src/lib/visual-editor/blender-model-spec.ts");
const { rebaseChatgptStep } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-generation.ts");

const target = "quality-target", meshId = "quality-mesh";
const initialSpec = parseBlenderModelSpec({ name: "木のベンチ", parts: [{ id: "seat", name: "座面", shape: "box",
  position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1.8, 0.1, 0.5], color: [0.4, 0.2, 0.1, 1], metallic: 0, roughness: 0.6 }] });
const viewImages = ["正面", "斜め前", "斜め後ろ"].map(label => ({ label, dataUrl: "data:image/png;base64,test-image-fixture" }));

function harness() {
  let current = createStarterVisualProject("world", "blank", "model-quality-control-flow-fixture");
  const template = Object.values(current.scene.entities)[0];
  current.scene.entities[target] = { ...structuredClone(template), id: target, name: initialSpec.name, parentId: null, children: [],
    components: [structuredClone(template.components.find(component => component.type === "transform")), createMeshComponent(meshId, "model-initial", [])] };
  current.scene.rootEntityIds.push(target);
  current.assets.assets["model-initial"] = { id: "model-initial", kind: "model", name: initialSpec.name, status: "ready", sourceHash: "a".repeat(64), materialSlots: [] };
  const sources = new Map([["model-initial", { spec: structuredClone(initialSpec), originalPrompt: "木のベンチを作る", prompt: "木のベンチを作る", brief: "幅1.8mの木のベンチ" }]]);
  const state = { cancelled: false, applyCalls: 0, commits: 0, saves: 0, reviews: 0, captures: [], progress: [], replies: [] };
  hooks.readSource = async (bundle, entityId) => {
    const mesh = bundle.scene.entities[entityId].components.find(component => component.id === meshId);
    const id = mesh.geometry.assetId;
    return { entityId, componentId: meshId, modelAssetId: id, source: structuredClone(sources.get(id)) };
  };
  hooks.apply = async (before, operation) => {
    state.applyCalls++;
    const after = structuredClone(before), id = `model-corrected-${state.applyCalls}`;
    after.assets.assets[id] = { ...after.assets.assets["model-initial"], id, sourceHash: String(state.applyCalls).repeat(64) };
    const mesh = after.scene.entities[target].components.find(component => component.id === meshId);
    mesh.geometryAssetId = id; mesh.geometry.assetId = id;
    sources.set(id, { ...sources.get("model-initial"), spec: structuredClone(operation.model) });
    return { bundle: after, entityId: target };
  };
  tauri.chatgptReviewModel = async (...args) => {
    state.reviews++;
    state.lastReviewArgs = args;
    const reply = state.replies.shift() ?? { approved: true, summary: "輪郭と寸法を確認しました", model: null };
    return typeof reply === "function" ? reply(...args) : structuredClone(reply);
  };
  const options = { model: "fixture-model", generationId: "quality-request", prompt: "座面を少し高く", brief: { name: initialSpec.name, brief: "幅1.8mの木のベンチ" },
    entityId: target, projectPath: "isolated-memory-fixture", componentId: meshId, reasoningEffort: "high",
    resources: { projectAssets: [], builtinCandidates: [], components: [], blenderAvailable: true, modelSource: "blender" },
    currentBundle: () => current, checkCurrent: () => { if (state.cancelled) throw new Error("cancelled"); },
    capture: async (entityId, sourceHash) => { state.captures.push({ entityId, sourceHash }); return structuredClone(viewImages); },
    commit: (before, after) => { current = rebaseChatgptStep(before, after, current); state.commits++; },
    save: async () => { state.saves++; }, progress: message => state.progress.push(message) };
  return { state, options, current: () => current, sources };
}
function corrected(height) { const result = structuredClone(initialSpec); result.parts[0].position[1] = height; return result; }

test("approved actual-source review passes original intent and renders without rewriting the saved model", async () => {
  const h = harness(), before = JSON.stringify(h.current());
  await reviewChatgptModel(h.options);
  assert.equal(h.state.lastReviewArgs[7], "木のベンチを作る");
  assert.deepEqual(h.state.lastReviewArgs[5], viewImages);
  assert.deepEqual(h.state.captures, [{ entityId: target, sourceHash: "a".repeat(64) }]);
  assert.equal(h.state.commits, 0); assert.equal(h.state.applyCalls, 0); assert.equal(h.state.saves, 0);
  assert.equal(JSON.stringify(h.current()), before);
});

test("a correction is saved and captured from its new source before approval", async () => {
  const h = harness();
  h.state.replies.push({ approved: false, summary: "座面の高さを修正します", model: corrected(0.5) });
  await reviewChatgptModel(h.options);
  assert.equal(h.state.applyCalls, 1); assert.equal(h.state.commits, 1); assert.equal(h.state.saves, 1);
  assert.deepEqual(h.state.captures.map(view => view.sourceHash), ["a".repeat(64), "1".repeat(64)]);
  assert.equal(h.state.reviews, 2);
  assert.equal(h.sources.get("model-initial").spec.parts[0].position[1], 0.4);
});

test("capture and inference failures preserve the saved version without approval", async () => {
  for (const step of ["capture", "review"]) {
    const h = harness(), before = JSON.stringify(h.current());
    if (step === "capture") h.options.capture = async () => { throw new Error("capture failed"); };
    else h.state.replies.push(() => { throw new Error("review failed"); });
    await assert.rejects(reviewChatgptModel(h.options), /failed/);
    assert.equal(h.state.commits, 0); assert.equal(h.state.applyCalls, 0);
    assert.equal(JSON.stringify(h.current()), before);
    assert.ok(!h.state.progress.some(message => message.startsWith("見直しました：")));
  }
});

test("cancellation and a manual target edit reject a late correction before model generation", async () => {
  for (const mutation of ["cancel", "target", "material"]) {
    const h = harness();
    h.state.replies.push(() => {
      if (mutation === "cancel") h.state.cancelled = true;
      else if (mutation === "target") h.current().scene.entities[target].name = "手動の編集";
      else h.current().assets.assets["model-initial"].materialSlots.push({ slot: "wood", defaultMaterialAssetId: "manual-material" });
      return { approved: false, summary: "座面を直す", model: corrected(0.5) };
    });
    await assert.rejects(reviewChatgptModel(h.options), mutation === "cancel" ? /cancelled/ : /手動編集/);
    assert.equal(h.state.applyCalls, 0); assert.equal(h.state.commits, 0);
    if (mutation === "target") assert.equal(h.current().scene.entities[target].name, "手動の編集");
  }
});

test("a manual target edit during background model creation rejects the generated late result", async () => {
  const h = harness(), originalApply = hooks.apply;
  h.state.replies.push({ approved: false, summary: "座面を直す", model: corrected(0.5) });
  hooks.apply = async (...args) => {
    const changed = await originalApply(...args);
    h.current().scene.entities[target].name = "推論後の手動編集";
    return changed;
  };
  await assert.rejects(reviewChatgptModel(h.options), /手動編集/);
  assert.equal(h.state.commits, 0); assert.equal(h.state.saves, 0);
  assert.equal(h.current().scene.entities[target].name, "推論後の手動編集");
});

test("unrelated manual edits and derived thumbnails survive a corrected model commit", async () => {
  const h = harness(), unrelated = Object.keys(h.current().scene.entities).find(id => id !== target);
  h.state.replies.push(() => {
    h.current().scene.entities[unrelated].name = "無関係な手動編集";
    h.current().assets.assets["model-initial"].thumbnail = { status: "generated", sourceHash: "a".repeat(64) };
    return { approved: false, summary: "座面を直す", model: corrected(0.5) };
  });
  await reviewChatgptModel(h.options);
  assert.equal(h.current().scene.entities[unrelated].name, "無関係な手動編集");
  assert.equal(h.state.commits, 1);
});

test("same output and correction cycles stop while preserving the last saved version", async () => {
  const same = harness(); same.state.replies.push({ approved: false, summary: "修正", model: structuredClone(initialSpec) });
  await assert.rejects(reviewChatgptModel(same.options), /進まなかった/);
  assert.equal(same.state.commits, 0);
  const cycle = harness(); cycle.state.replies.push({ approved: false, summary: "修正1", model: corrected(0.5) }, { approved: false, summary: "元へ戻す", model: structuredClone(initialSpec) });
  await assert.rejects(reviewChatgptModel(cycle.options), /進まなかった/);
  assert.equal(cycle.state.commits, 1); assert.equal(cycle.state.saves, 1);
  assert.equal(cycle.sources.get("model-corrected-1").spec.parts[0].position[1], 0.5);
});

test("the bounded last unapproved response is not applied or reported as complete", async () => {
  const h = harness();
  for (const height of [0.5, 0.6, 0.7]) h.state.replies.push({ approved: false, summary: `高さを${height}へ`, model: corrected(height) });
  await assert.rejects(reviewChatgptModel(h.options), /見直しが完了しませんでした/);
  assert.equal(h.state.reviews, 3); assert.equal(h.state.commits, 2); assert.equal(h.state.saves, 2);
  assert.equal(h.sources.get("model-corrected-2").spec.parts[0].position[1], 0.6);
  assert.ok(!h.state.progress.some(message => message.startsWith("見直しました：")));
});

test("a stale expected model snapshot stops before capture or inference", async () => {
  const h = harness(); h.options.expectedSnapshot = chatgptModelSnapshot(h.current(), target);
  h.current().scene.entities[target].name = "待っている間の編集";
  await assert.rejects(reviewChatgptModel(h.options), /手動編集/);
  assert.equal(h.state.reviews, 0); assert.equal(h.state.captures.length, 0);
});
