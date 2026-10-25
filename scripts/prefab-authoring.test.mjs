import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-prefab-authoring-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { executeXriftMcpEditorTool } = await load("mcp-editor-tools");
const { applyMcpR3fScene } = await load("mcp-code-authoring");
const { createPrototypeProject } = await load("prototype-project");
const { prefabDocumentCodec } = await load("serialization");
const { resolvePrefabInstances } = await load("compiler/prefab-resolver");
const { compileVisualProject } = await load("compiler/compile");

// The route the shared guide gives the production chat: one reusable object
// authored around its own origin, made a Prefab, then placed as copies.
const bench = (seatWidth, color) => `const slats = [{ id: 'front', z: 0.14 }, { id: 'middle', z: 0 }, { id: 'back', z: -0.14 }];
export default function Bench() {
  return <group name='Bench'>
    {slats.map(slat => <mesh key={slat.id} name='Slat' position={[0, 0.45, slat.z]}><boxGeometry args={[${seatWidth}, 0.04, 0.12]} /><meshStandardMaterial color='${color}' roughness={0.8} /></mesh>)}
    <mesh name='Leg left' position={[-0.7, 0.22, 0]}><boxGeometry args={[0.06, 0.44, 0.42]} /><meshStandardMaterial color='#2b2b2b' metalness={0.6} roughness={0.4} /></mesh>
    <mesh name='Leg right' position={[0.7, 0.22, 0]}><boxGeometry args={[0.06, 0.44, 0.42]} /><meshStandardMaterial color='#2b2b2b' metalness={0.6} roughness={0.4} /></mesh>
  </group>;
}`;

function session() {
  let context = { bundle: createPrototypeProject("world", "prefab-authoring-isolated-fixture"), sceneSelection: null, assetSelection: null,
    editorMode: "edit", importBusy: false, revision: 1, saveStatus: "saved", now: () => "2026-10-25T00:00:00.000Z" };
  const scope = () => ({ projectId: context.bundle.project.projectId, sceneId: context.bundle.scene.sceneId, expectedRevision: context.revision });
  const commit = outcome => { if (outcome.changed) context = { ...context, bundle: outcome.bundle, revision: context.revision + 1 }; return outcome.result; };
  return {
    get context() { return context; },
    scope,
    run: (tool, args = {}) => commit(executeXriftMcpEditorTool(context, { id: `prefab-authoring-${tool}`, tool, arguments: args })),
    r3f: async (args) => commit(await applyMcpR3fScene(context, { ...scope(), ...args }, () => {})),
  };
}

const center = bounds => bounds.min.map((value, index) => (value + bounds.max[index]) / 2);
const close = (actual, expected, label) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-6, `${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`));
/** Materials drawn by each placed copy, in the expanded Scene every runtime uses. */
function drawnMaterials(bundle, hostEntityId) {
  const resolved = resolvePrefabInstances(bundle.scene, bundle.assets, bundle.prefabs).scene;
  const ids = new Set();
  const visit = id => {
    const entity = resolved.entities[id];
    for (const component of entity.components) if (component.type === "mesh") component.materialBindings.forEach(binding => ids.add(binding.materialAssetId));
    entity.children.forEach(visit);
  };
  visit(hostEntityId);
  return [...ids].sort();
}

test("a bench authored once becomes one Prefab whose copies follow every revision of the original", async () => {
  const studio = session();
  const created = await studio.r3f({ name: "ベンチ", source: bench(1.6, "#8a5a3b") });
  const original = created.entityId;
  // The original is one of the benches, placed with its own Transform.
  studio.run("update_transform", { ...studio.scope(), entityId: original, position: [6, 0, -2] });
  const prefab = studio.run("create_prefab", { ...studio.scope(), entityId: original, name: "ベンチ" });
  assert.equal(prefab.originWarning, undefined, "content authored around the root needs no origin warning");
  close(center(prefab.contentBounds), [0, center(prefab.contentBounds)[1], 0], "Prefab content is centred on its origin");
  assert.equal(JSON.stringify(prefab.document).includes('"source":"const slats'), false, "the result omits retained source baselines");

  const positions = [[-4, 0, 3], [0, 0, 5], [4, 0, 3]];
  const copies = positions.map(position => studio.run("place_asset", { ...studio.scope(), assetId: prefab.prefabAssetId, position }).entityId);
  studio.run("update_transform", { ...studio.scope(), entityId: copies[1], rotation: [0, Math.PI / 2, 0] });
  for (const [index, copy] of copies.entries()) {
    const measured = studio.run("get_entity_bounds", { entityId: copy });
    close([center(measured.world)[0], center(measured.world)[2]], [positions[index][0], positions[index][2]], `copy ${index} lands where it was placed`);
    assert.ok(measured.world.min[1] > -1e-6 && measured.world.min[1] < 0.01, "each copy stands on the floor");
  }

  // Each copy is one Hierarchy row instead of another full set of parts.
  const parts = Object.keys(studio.context.bundle.scene.entities[original].codeAuthoring.nodes).length;
  assert.equal(parts, 6, "the original owns its group, three slats and two legs");
  assert.ok(copies.every(copy => studio.context.bundle.scene.entities[copy].children.length === 0));
  const context = studio.run("get_editor_context");
  assert.deepEqual(context.prefabs.find(item => item.prefabAssetId === prefab.prefabAssetId),
    { prefabAssetId: prefab.prefabAssetId, name: "ベンチ", sourceEntityId: original, instanceCount: 3, sourceChanged: false });

  const saved = prefabDocumentCodec.parse(prefabDocumentCodec.serialize(studio.context.bundle.prefabs[prefab.prefabId]));
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));

  // Revise the original through its retained source, as the guide asks.
  const before = drawnMaterials(studio.context.bundle, copies[0]);
  const { r3fAuthoring } = studio.run("get_entity_components", { entityId: original });
  const revisedSource = r3fAuthoring.source.replace("args={[1.6, 0.04, 0.12]}", "args={[2.2, 0.04, 0.12]}").replace("#8a5a3b", "#3f6f4f");
  assert.notEqual(revisedSource, r3fAuthoring.source);
  await assert.rejects(studio.r3f({ name: "ベンチ", source: revisedSource, entityId: copies[0] }),
    error => error.code === "R3F_SOURCE_INVALID" && error.message.includes(original), "a copy points at the original to revise");
  const revision = await studio.r3f({ name: "ベンチ", source: revisedSource, entityId: original });
  assert.deepEqual(revision.prefabsPendingUpdate?.map(item => item.prefabAssetId), [prefab.prefabAssetId], "revising the original says its copies are stale");
  assert.equal(revision.nextActions[0], "update_prefab_from_source");
  assert.deepEqual(drawnMaterials(studio.context.bundle, copies[0]), before, "copies keep the saved Prefab until it is updated");
  const applied = studio.run("update_prefab_from_source", { ...studio.scope(), prefabAssetId: prefab.prefabAssetId });
  assert.equal(applied.changed, true);
  assert.equal(applied.instanceCount, 3);
  const after = drawnMaterials(studio.context.bundle, copies[0]);
  assert.notDeepEqual(after, before, "the new slat colour reaches every copy");
  for (const [index, copy] of copies.entries()) {
    assert.deepEqual(drawnMaterials(studio.context.bundle, copy), after);
    const measured = studio.run("get_entity_bounds", { entityId: copy });
    const extent = measured.world.max.map((value, axis) => value - measured.world.min[axis]);
    assert.ok(Math.max(extent[0], extent[2]) > 2.19, `copy ${index} uses the widened seat: ${JSON.stringify(extent)}`);
    close([center(measured.world)[0], center(measured.world)[2]], [positions[index][0], positions[index][2]], `copy ${index} stays in place`);
  }

  const compiled = compileVisualProject({ project: studio.context.bundle.project, scenes: { [studio.context.bundle.scene.sceneId]: studio.context.bundle.scene },
    assets: studio.context.bundle.assets, prefabs: studio.context.bundle.prefabs }, { generatedAt: "2026-10-25T00:00:00.000Z" });
  assert.equal(compiled.canStage, true, JSON.stringify(compiled.diagnostics.filter(item => item.severity === "error")));
  const world = compiled.overlayFiles.find(file => file.relativePath === "src/World.tsx").content;
  assert.equal(world.split('"Slat"').length - 1, 12, "publishing draws the original and all three copies with every slat");
});

test("one unpacked bench takes its own source revision while the others stay linked", async () => {
  const studio = session();
  const original = (await studio.r3f({ name: "ベンチ", source: bench(1.6, "#8a5a3b") })).entityId;
  const prefab = studio.run("create_prefab", { ...studio.scope(), entityId: original, name: "ベンチ" });
  const [single, linked] = [[-3, 0, 4], [3, 0, 4]].map(position =>
    studio.run("place_asset", { ...studio.scope(), assetId: prefab.prefabAssetId, position, rotation: [0, 0.4, 0] }).entityId);
  const linkedBefore = drawnMaterials(studio.context.bundle, linked);
  const unpacked = studio.run("unpack_prefab_instance", { ...studio.scope(), entityId: single });
  assert.ok(unpacked.r3fRootEntityId, "a copy of an R3F original keeps its own editable source");
  const { r3fAuthoring } = studio.run("get_entity_components", { entityId: unpacked.r3fRootEntityId });
  await studio.r3f({ name: "赤いベンチ", source: r3fAuthoring.source.replace("#8a5a3b", "#b03a2e"), entityId: unpacked.r3fRootEntityId });
  assert.notDeepEqual(drawnMaterials(studio.context.bundle, single), linkedBefore, "the unpacked bench changes alone");
  assert.deepEqual(drawnMaterials(studio.context.bundle, linked), linkedBefore, "the linked copy is untouched");
  const saved = prefabDocumentCodec.parse(prefabDocumentCodec.serialize(studio.context.bundle.prefabs[prefab.prefabId]));
  assert.equal(saved.ok, true);
  const compiled = compileVisualProject({ project: studio.context.bundle.project, scenes: { [studio.context.bundle.scene.sceneId]: studio.context.bundle.scene },
    assets: studio.context.bundle.assets, prefabs: studio.context.bundle.prefabs }, { generatedAt: "2026-10-25T00:00:00.000Z" });
  assert.equal(compiled.canStage, true, JSON.stringify(compiled.diagnostics.filter(item => item.severity === "error")));
});

test("making the Prefab from a root whose child carries the placement is reported, not silently offset", async () => {
  const studio = session();
  const placed = `export default function Lamp() {
  return <group name='Lamp' position={[5, 0, 5]}>
    <mesh name='Post' position={[0, 1.2, 0]}><cylinderGeometry args={[0.05, 0.05, 2.4]} /><meshStandardMaterial color='#30343a' /></mesh>
  </group>;
}`;
  const created = await studio.r3f({ name: "街灯", source: placed });
  const prefab = studio.run("create_prefab", { ...studio.scope(), entityId: created.entityId });
  assert.match(prefab.originWarning, /\[5, 0, 5\] m/);
  close([center(prefab.contentBounds)[0], center(prefab.contentBounds)[2]], [5, 5], "contentBounds shows where copies would draw");
});
