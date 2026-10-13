import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-model-assignment-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { setEntityModel } = await server.ssrLoadModule("/src/lib/visual-editor/model-assignment.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
const { createEmptyEntity } = await server.ssrLoadModule("/src/lib/visual-editor/editor-session.ts");
const docs = await server.ssrLoadModule("/src/lib/visual-editor/scene-document.ts");
const { createDefaultMaterialAsset } = await server.ssrLoadModule("/src/lib/visual-editor/asset-manifest.ts");
const { executeXriftMcpEditorTool } = await server.ssrLoadModule("/src/lib/visual-editor/mcp-editor-tools.ts");
const { serializeVisualProjectDocuments } = await server.ssrLoadModule("/src/lib/visual-editor/persistence.ts");

function fixture() {
  const bundle = createStarterVisualProject("world", "blank", "model-assignment");
  const added = createEmptyEntity(bundle.scene, null, "名前を保つEntity");
  bundle.scene = added.scene;
  const entityId = added.entityId;
  const entity = bundle.scene.entities[entityId];
  entity.components[0] = { ...entity.components[0], position: [3, 4, 5], rotation: [0.2, 0.3, 0.4], scale: [2, 3, 4] };
  entity.components.push({ id: "lamp", type: "light", enabled: true, lightType: "point", color: "#ffffff", intensity: 2, castShadow: false, distance: 10, decay: 2 });
  const child = createEmptyEntity(bundle.scene, entityId, "手動の子"); bundle.scene = child.scene;
  bundle.assets.assets.material = createDefaultMaterialAsset({ id: "material", name: "標準材質" });
  for (const id of ["first", "second"]) bundle.assets.assets[id] = {
    id, kind: "model", name: id, source: { kind: "project", relativePath: `assets/${id}.glb` }, sourceHash: "a".repeat(64), status: "ready", thumbnail: { status: "missing" },
    importSettings: { scale: 1, generateColliders: true, optimizeMeshes: false, importAnimations: true, instanceMeshes: false },
    materialSlots: [{ slot: "0", name: "Default", sourceMaterialIndex: 0, defaultMaterialAssetId: "material" }],
    importMetadata: { sourceFormat: "glb", byteLength: 100, nodeCount: 1, meshCount: 1, primitiveCount: 1, bounds: { min: [-2, 0, -1], max: [2, 2, 1], center: [0, 1, 0], size: [4, 2, 2], boundingSphereRadius: 2.45 }, animations: [], extensionsUsed: [], extensionsRequired: [] },
  };
  return { bundle, entityId, childId: child.entityId };
}
const mesh = entity => entity.components.find(c => c.type === "mesh");
const collider = entity => entity.components.find(c => c.type === "collider");
const serialize = bundle => serializeVisualProjectDocuments({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs });

test("an Empty Entity receives a Model while its identity, name, Transform, Components and manual children survive", () => {
  const { bundle, entityId, childId } = fixture();
  const before = bundle.scene.entities[entityId];
  const snapshot = JSON.stringify(bundle);
  const result = setEntityModel(bundle.scene, bundle.assets, entityId, "first");
  const entity = result.scene.entities[entityId];
  assert.equal(entity.id, before.id); assert.equal(entity.name, before.name);
  assert.equal(entity.components[0], before.components[0]);
  assert.equal(entity.components[1], before.components[1]);
  assert.deepEqual(entity.children, [childId]);
  assert.equal(result.scene.entities[childId], bundle.scene.entities[childId]);
  assert.equal(mesh(entity).geometry.assetId, "first");
  assert.equal(mesh(entity).geometry.sourceNodeIndex, undefined);
  assert.deepEqual(mesh(entity).materialBindings, [{ slot: "0", materialAssetId: "material" }]);
  assert.equal(JSON.stringify(bundle), snapshot);
  assert.doesNotThrow(() => serialize({ ...bundle, scene: result.scene }));
});

test("replacement keeps Mesh identity/visibility but resets old pose and Materials to the new Model", () => {
  const { bundle, entityId } = fixture();
  const first = setEntityModel(bundle.scene, bundle.assets, entityId, "first");
  const old = mesh(first.scene.entities[entityId]);
  old.enabled = false; old.castShadow = false; old.maxDistance = 75; old.renderOrder = 4;
  old.modelPose = { bones: { oldBone: [1, 2, 3] }, morphTargets: { oldFace: 1 } };
  old.materialBindings = [];
  const next = setEntityModel(first.scene, bundle.assets, entityId, "second");
  const current = mesh(next.scene.entities[entityId]);
  assert.equal(current.id, old.id); assert.equal(current.enabled, false); assert.equal(current.castShadow, false);
  assert.equal(current.maxDistance, 75); assert.equal(current.renderOrder, 4); assert.equal(current.modelPose, undefined);
  assert.deepEqual(current.materialBindings, [{ slot: "0", materialAssetId: "material" }]);
  assert.equal(setEntityModel(next.scene, bundle.assets, entityId, "second").changed, false);
});

test("automatic Box Colliders follow new bounds and manual boxes remain untouched", () => {
  for (const fitMode of ["auto", "manual"]) {
    const { bundle, entityId } = fixture();
    const box = docs.createBoxColliderComponent("collision", { center: [9, 9, 9], halfExtents: [0.5, 0.5, 0.5], fitMode, friction: 0.7, isTrigger: true });
    bundle.scene.entities[entityId].components.push(box);
    const result = setEntityModel(bundle.scene, bundle.assets, entityId, "first");
    const updated = collider(result.scene.entities[entityId]);
    assert.equal(updated.id, box.id); assert.equal(updated.friction, box.friction); assert.equal(updated.isTrigger, box.isTrigger);
    if (fitMode === "auto") { assert.deepEqual(updated.center, [0, 1, 0]); assert.deepEqual(updated.halfExtents, [2, 1, 1]); }
    else assert.equal(updated, box);
  }
});

function addGenerated(bundle, entityId, { manualChild = false, manualComponent = false, collision = false } = {}) {
  const id = `${entityId}-model-node-0`;
  const node = { id, name: "元モデルの部分", parentId: entityId, children: [], enabled: true, components: [docs.createTransformComponent(`${id}-transform`), docs.createMeshComponent(`${id}-mesh`, "first", [], { sourceNodeIndex: 0 })] };
  if (collision) node.components.push(docs.createMeshColliderComponent(`${id}-collider`, { friction: 0.9 }));
  if (manualComponent) node.components.push({ id: "manual-lamp", type: "light", enabled: true, lightType: "point", color: "#ffffff", intensity: 1, castShadow: false, distance: 10, decay: 2 });
  bundle.scene.entities[entityId].children.push(id); bundle.scene.entities[id] = node;
  if (manualChild) { const added = createEmptyEntity(bundle.scene, id, "子への手動追加"); bundle.scene = added.scene; }
  return id;
}

test("old generated geometry is removed, manual root children survive and prior model collision is carried forward", () => {
  const { bundle, entityId, childId } = fixture();
  const old = addGenerated(bundle, entityId, { collision: true });
  const result = setEntityModel(bundle.scene, bundle.assets, entityId, "second");
  assert.equal(result.scene.entities[old], undefined);
  assert.deepEqual(result.scene.entities[entityId].children, [childId]);
  assert.equal(collider(result.scene.entities[entityId]).meshMode, "trimesh");
  assert.equal(collider(result.scene.entities[entityId]).friction, 0.9);
  assert.doesNotThrow(() => serialize({ ...bundle, scene: result.scene }));
});

test("retained collision uses convex geometry when a dynamic body owns the replacement", () => {
  const { bundle, entityId } = fixture();
  addGenerated(bundle, entityId, { collision: true });
  bundle.scene.entities[entityId].components.push(docs.createRigidBodyComponent("body", { bodyType: "dynamic" }));
  const result = setEntityModel(bundle.scene, bundle.assets, entityId, "second");
  assert.equal(collider(result.scene.entities[entityId]).meshMode, "convex");
});

test("generated children with custom Components or child Entities refuse replacement without partial edits", () => {
  for (const extra of [{ manualChild: true }, { manualComponent: true }]) {
    const { bundle, entityId } = fixture(); addGenerated(bundle, entityId, extra);
    const original = JSON.stringify(bundle);
    assert.throws(() => setEntityModel(bundle.scene, bundle.assets, entityId, "second"), /手動の編集/);
    assert.equal(JSON.stringify(bundle), original);
  }
});

test("model-node proxy targets and separately baked collider geometry fail closed", () => {
  const { bundle, entityId } = fixture();
  const nodeId = addGenerated(bundle, entityId);
  assert.throws(() => setEntityModel(bundle.scene, bundle.assets, nodeId, "second"), /元モデルのEntity/);
  bundle.scene.entities[entityId].components.push({ ...docs.createMeshColliderComponent("baked"), collisionModelAssetId: "first" });
  assert.throws(() => setEntityModel(bundle.scene, bundle.assets, entityId, "second"), /差し替えを解除/);
});

test("an explicit Component is required for multiple Mesh Renderers and invalid assets never change data", () => {
  const { bundle, entityId } = fixture();
  const first = docs.createMeshComponent("mesh-a", "first", []), second = docs.createMeshComponent("mesh-b", "first", []);
  bundle.scene.entities[entityId].components.push(first, second);
  assert.throws(() => setEntityModel(bundle.scene, bundle.assets, entityId, "second"), /複数/);
  const selected = setEntityModel(bundle.scene, bundle.assets, entityId, "second", "mesh-b");
  assert.equal(selected.scene.entities[entityId].components.find(c => c.id === "mesh-a"), first);
  assert.equal(selected.scene.entities[entityId].components.find(c => c.id === "mesh-b").geometry.assetId, "second");
  for (const [entity, asset, component] of [["missing", "first"], [entityId, "material"], [entityId, "missing"], [entityId, "second", "missing"]]) assert.throws(() => setEntityModel(bundle.scene, bundle.assets, entity, asset, component));
});

test("MCP assignment uses fresh context, the same document operation and one Editor revision", () => {
  const { bundle, entityId } = fixture();
  const context = { bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 7, saveStatus: "saved" };
  const request = { id: "request-1", tool: "set_entity_model", arguments: { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: 7, entityId, modelAssetId: "first" } };
  const result = executeXriftMcpEditorTool(context, request);
  assert.equal(result.result.revisionAfter, 8); assert.equal(result.sceneSelection.id, entityId);
  assert.equal(result.bundle.scene.entities[entityId].name, bundle.scene.entities[entityId].name);
  assert.equal(mesh(result.bundle.scene.entities[entityId]).geometry.assetId, "first");
  assert.throws(() => executeXriftMcpEditorTool(context, { ...request, arguments: { ...request.arguments, expectedRevision: 6 } }), error => error.code === "STALE_REVISION");
  assert.throws(() => executeXriftMcpEditorTool({ ...context, editorMode: "play" }, request), error => error.code === "EDITOR_READ_ONLY");
});
