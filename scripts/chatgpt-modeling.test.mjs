import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-modeling-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { parseBlenderModelSpec, parseBlenderModelBrief } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-modeling.ts");
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
  const brief = { name: model.name, brief: "幅1.8m。スラット座面、傾いた背もたれ、曲線の肘掛け" };
  assert.deepEqual(parseChatgptOperations([{ ...operation, model: brief }], resources, [], [])[0].model, brief);
  assert.throws(() => parseBlenderModelBrief({ ...brief, python: "unexpected" }));
  for (const unavailable of [{ ...resources, blenderAvailable: false }, { ...resources, modelSource: "store" }]) assert.throws(() => parseChatgptOperations([operation], unavailable, [], []));
});
test("curved supports and revolved profiles have bounded geometry", () => {
  const tube = { ...part, shape: "tube", vertices: [[0, 0, 0], [0, 0.5, 0.2]], faces: null, bevel: 0.025 };
  const lathe = { ...part, shape: "lathe", vertices: [[0, 0, 0], [0.2, 0.5, 0], [0, 0.5, 0]], faces: null };
  assert.equal(parseBlenderModelSpec({ ...model, parts: [tube, lathe] }).parts.length, 2);
  for (const bad of [{ ...tube, bevel: 0 }, { ...tube, vertices: [[0, 0, 0]] }, { ...lathe, vertices: [[-1, 0, 0], [1, 1, 0]] }, { ...lathe, vertices: [[1, 0, 1], [1, 1, 0]] }]) {
    assert.throws(() => parseBlenderModelSpec({ ...model, parts: [bad] }));
  }
});
test("part source IDs survive revision edits and legacy IDs normalize without collisions", () => {
  const source = { ...model, parts: [{ ...part, id: null }, { ...part, id: "part-001" }, { ...part, id: "back_support" }] };
  const before = JSON.stringify(source);
  const normalized = parseBlenderModelSpec(source);
  assert.deepEqual(normalized.parts.map(part => part.id), ["part-002", "part-001", "back_support"]);
  assert.deepEqual(parseBlenderModelSpec(normalized), normalized);
  assert.deepEqual(parseBlenderModelSpec({ ...normalized, parts: normalized.parts.toReversed() }).parts.map(part => part.id), ["back_support", "part-001", "part-002"]);
  normalized.parts[0].position[0] = 9;
  assert.equal(JSON.stringify(source), before, "editing a new source revision must preserve its base revision");
  for (const id of ["", "_part", "part.name", "日本語", "part\n", "a".repeat(65)]) {
    assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...part, id }] }), /\.id/);
  }
  assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...part, id: "slat" }, { ...part, id: "slat" }] }), /slat.*重複/);
});
test("repeated details enforce model budgets and bound every translated instance", () => {
  const repeated = { ...part, id: "slats", repeat: { count: 32, offset: [0.1, 0, 0] } };
  const exactBudget = { ...model, parts: Array.from({ length: 8 }, (_, index) => ({ ...repeated, id: `slats-${index}` })) };
  assert.equal(parseBlenderModelSpec(exactBudget).parts.length, 8);
  assert.throws(() => parseBlenderModelSpec({ ...exactBudget, parts: [...exactBudget.parts, part] }), /256/);
  const boundary = { ...part, position: [50, -50, 0], repeat: { count: 2, offset: [-50, 50, 0] } };
  assert.deepEqual(parseBlenderModelSpec({ ...model, parts: [boundary] }).parts[0].repeat, boundary.repeat);
  for (const repeat of [{ count: 0, offset: [0, 0, 0] }, { count: 33, offset: [0, 0, 0] }, { count: 1.5, offset: [0, 0, 0] },
    { count: 32, offset: [2, 0, 0] }, { count: 2, offset: [0, Infinity, 0] }, { count: 2, offset: [0, 0, 0], source: "unexpected" }]) {
    assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...repeated, repeat }] }), /slats.*repeat/);
  }
});
test("extrusion keeps concise concave contours and rejects ambiguous or invalid profiles", () => {
  const profile = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0.5, 1, 0], [0.5, 2, 0], [0, 2, 0]];
  const extruded = { ...part, id: "side", shape: "extrude", vertices: profile, faces: null, depth: 0.2 };
  const parsed = parseBlenderModelSpec({ ...model, parts: [extruded] }).parts[0];
  assert.deepEqual(parsed.vertices, profile);
  assert.equal(parsed.depth, 0.2);
  assert.equal(parsed.faces, undefined);
  assert.equal(parseBlenderModelSpec({ ...model, parts: [{ ...extruded, vertices: profile.toReversed() }] }).parts.length, 1);
  for (const vertices of [[[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
    [[0, 0, 0], [3, 2, 0], [0, 2, 0], [2, 0, 0]], [...profile, profile[0]], [[0, 0, 0], [1, 0, 0], [0, 1, 0.001]]]) {
    assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...extruded, vertices }] }), /id=side.*vertices/);
  }
  for (const depth of [undefined, null, 0, 50.01, Infinity]) assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...extruded, depth }] }), /depth/);
  assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...part, depth: 0.2 }] }), /depth/);
  assert.throws(() => parseBlenderModelSpec({ ...model, parts: [{ ...extruded, faces: [[0, 1, 2]] }] }), /faces/);
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
test("a repaired source produces different real imported bounds while preserving its other parts", async context => {
  let files;
  try {
    files = await Promise.all(["before", "after"].flatMap(version => ["json", "glb"].map(extension =>
      readFile(new URL(`../node_modules/.cache/chatgpt-blender-model/fixture-quality-${version}.${extension}`, import.meta.url)))));
  } catch (error) {
    if (error.code === "ENOENT") { context.skip("Run the installed Blender two-revision quality smoke to provide its actual GLBs first"); return; }
    throw error;
  }
  const [beforeJson, beforeGlb, afterJson, afterGlb] = files;
  const before = parseBlenderModelSpec(JSON.parse(beforeJson.toString("utf8")));
  const after = parseBlenderModelSpec(JSON.parse(afterJson.toString("utf8")));
  assert.equal(before.name, after.name);
  assert.equal(before.parts[0].id, "backrest");
  assert.deepEqual(before.parts.slice(1), after.parts.slice(1));
  assert.ok(after.parts[0].scale[1] > before.parts[0].scale[1]);
  assert.notDeepEqual(before.parts[0].color, after.parts[0].color);
  assert.notDeepEqual(beforeGlb, afterGlb, "the repair must be backed by an actual regenerated GLB");
  const [beforePlan, afterPlan] = await Promise.all([beforeGlb, afterGlb].map((bytes, index) =>
    createAssetImportPlan({ fileName: `quality-${index}.glb`, bytes: new Uint8Array(bytes), mimeType: "model/gltf-binary" })));
  for (const plan of [beforePlan, afterPlan]) assert.ok(plan.canCommit, JSON.stringify(plan.diagnostics));
  const beforeBounds = beforePlan.asset.importMetadata.bounds.size;
  const afterBounds = afterPlan.asset.importMetadata.bounds.size;
  assert.ok(afterBounds[1] > beforeBounds[1], `expected a higher imported backrest: ${beforeBounds} → ${afterBounds}`);
  assert.ok(Math.abs(afterBounds[0] - beforeBounds[0]) < 0.00001);
  assert.ok(Math.abs(afterBounds[2] - beforeBounds[2]) < 0.00001);
});
