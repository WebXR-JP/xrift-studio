import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-modeling-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { parseBlenderModelSpec } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-modeling.ts");
const { parseChatgptOperations } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-resources.ts");
const { createAssetImportPlan } = await server.ssrLoadModule("/src/lib/visual-editor/asset-import.ts");
const part = { name: "座面", shape: "box", position: [0, 0.4, 0], rotation: [10, 20, 30], scale: [1.2, 0.1, 0.5], color: [0.4, 0.2, 0.1, 1], metallic: 0, roughness: 0.6, vertices: null, faces: null, bevel: 0.02 };
const model = { name: "木のベンチ", parts: [part] };
test("Blender parts and custom indexed mesh retain the proposed geometry and PBR data", () => {
  const before = JSON.stringify(model);
  const parsed = parseBlenderModelSpec(model);
  assert.deepEqual(parsed.parts[0].rotation, [10, 20, 30]);
  assert.deepEqual(parsed.parts[0].color, [0.4, 0.2, 0.1, 1]);
  assert.equal(parsed.parts[0].vertices, undefined);
  assert.equal(JSON.stringify(model), before);
  const mesh = { ...part, shape: "mesh", vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]] };
  assert.deepEqual(parseBlenderModelSpec({ ...model, parts: [mesh] }).parts[0].faces, [[0, 1, 2]]);
  for (const bad of [{ ...mesh, faces: [[0, 1, 3]] }, { ...part, shape: "python", source: "print('unexpected')" }, { ...part, position: [0, Infinity, 0] }, { ...part, color: [0, 0, 0, 2] }, { ...part, name: "line\nbreak" }]) {
    assert.throws(() => parseBlenderModelSpec({ ...model, parts: [bad] }));
  }
});
test("a Blender plan is enabled only by actual availability and the selected modeling source", () => {
  const resources = { projectAssets: [], builtinCandidates: [], components: [], blenderAvailable: true, modelSource: "blender" };
  const operation = { kind: "blender-model", model, position: [2, 0, -1], rotation: null, scale: null };
  assert.equal(parseChatgptOperations([operation], resources, [], [])[0].model.name, model.name);
  for (const unavailable of [{ ...resources, blenderAvailable: false }, { ...resources, modelSource: "store" }]) assert.throws(() => parseChatgptOperations([operation], unavailable, [], []));
});
test("the GLB exported by real Blender is analyzed as an ordinary Model with actual materials and bounds", async context => {
  let source;
  try { source = await readFile(new URL("../node_modules/.cache/chatgpt-blender-model/fixture.glb", import.meta.url)); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Run the installed Blender native smoke to provide its actual GLB first"); return; } throw error; }
  const plan = await createAssetImportPlan({ fileName: "blender-fixture.glb", bytes: new Uint8Array(source), mimeType: "model/gltf-binary" });
  assert.ok(plan.canCommit, JSON.stringify(plan.diagnostics));
  assert.equal(plan.asset.kind, "model");
  assert.ok(plan.asset.importMetadata.meshCount > 0);
  assert.ok(plan.asset.materialSlots.length > 0);
  assert.ok(plan.asset.importMetadata.bounds.size.some(value => value > 0));
  assert.deepEqual(plan.writes.find(write => write.purpose === "source").payload.bytes, new Uint8Array(source));
});
