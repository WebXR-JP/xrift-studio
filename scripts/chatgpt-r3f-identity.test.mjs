import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-r3f-identity-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { applyChatgptR3fScene: apply } = await load("chatgpt-code-authoring");
const { createPrototypeProject } = await load("prototype-project");
const { createEmptyEntity } = await load("editor-session");
const { duplicateEntityHierarchy, createBoxColliderComponent } = await load("scene-document");
const { createHierarchyTransfer, prepareHierarchyTransferFiles, planHierarchyImport } = await load("hierarchy-transfer");
const { createPrefabDocument } = await load("prefab-document");
const { sceneDocumentCodec, prefabDocumentCodec } = await load("serialization");
const { isR3fSceneAuthoring, r3fManagedEntityId } = await load("r3f-scene-source");
const operation = (source, entityId) => ({ kind: "r3f-scene", name: "Town", source, ...(entityId ? { entityId } : {}) });
const meta = result => result.bundle.scene.entities[result.entityId].codeAuthoring;
const nodeId = (result, name) => Object.values(meta(result).nodes).find(node => JSON.parse(node.baseline).name === name)?.entityId;
const transform = entity => entity.components.find(component => component.type === "transform");
const mesh = entity => entity.components.find(component => component.type === "mesh");
const setup = async source => apply(createPrototypeProject("world", "r3f-identity-fixture"), operation(source), { prompt: "家と街全体を仕上げて" });
const source = ({ moved = false, height = 3, color = "#ff0000", duplicate = false } = {}) => {
  const house = `<group key="house" name="House" position={[2,${moved ? 1 : 0},0]}><mesh name="Wall"><boxGeometry args={[2,${height},2]}/><meshStandardMaterial color="${color}"/></mesh><group name="Windows"><mesh key="pane" name="Pane"><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh></group></group>`;
  const other = duplicate ? '<group key="house" name="Other House"/>' : '<group name="Other House"/>';
  return `export function World(){return <group name="World"><group name="GroupA">${moved ? other : house}</group><group name="GroupB">${moved ? `<group name="New Wrapper">${house}</group>` : other}</group></group>}`;
};

test("a globally unique JSX key preserves identity, edits and children through a parent move and wrapper", async () => {
  const one = await setup(source()), id = nodeId(one, "House"), wallId = nodeId(one, "Wall"), paneId = nodeId(one, "Pane");
  let edited = structuredClone(one.bundle);
  transform(edited.scene.entities[id]).position[0] = 99;
  const materialId = mesh(edited.scene.entities[wallId]).materialBindings[0].materialAssetId;
  edited.assets.assets[materialId].properties.roughness = 0.99;
  const child = createEmptyEntity(edited.scene, id, "Manual child");
  assert.ok(child);
  edited = { ...edited, scene: child.scene };
  const snapshot = JSON.stringify(edited);
  const two = await apply(edited, operation(source({ moved: true, height: 5, color: "#0000ff" }), one.entityId));
  assert.equal(nodeId(two, "House"), id);
  assert.equal(nodeId(two, "Wall"), wallId);
  assert.equal(nodeId(two, "Pane"), paneId);
  assert.equal(two.bundle.scene.entities[id].parentId, nodeId(two, "New Wrapper"));
  assert.deepEqual(transform(two.bundle.scene.entities[id]).position, [99,1,0]);
  assert.deepEqual(transform(two.bundle.scene.entities[wallId]).scale, [2,5,2]);
  assert.equal(mesh(two.bundle.scene.entities[wallId]).materialBindings[0].materialAssetId, materialId);
  assert.equal(two.bundle.assets.assets[materialId].properties.roughness, 0.99);
  assert.equal(two.bundle.scene.entities[child.entityId].parentId, id);
  assert.ok(two.bundle.scene.entities[id].children.includes(child.entityId));
  assert.equal(JSON.stringify(edited), snapshot);
  for (const [key, node] of Object.entries(meta(two).nodes)) assert.equal(node.entityId, r3fManagedEntityId(two.entityId, key));
  assert.ok(isR3fSceneAuthoring(meta(two)));
});

test("existing version 1 originals recover anchors from their exact source", async () => {
  const one = await setup(source()), id = nodeId(one, "House"), wallId = nodeId(one, "Wall"), edited = structuredClone(one.bundle);
  for (const node of Object.values(edited.scene.entities[one.entityId].codeAuthoring.nodes)) delete node.identityKey;
  transform(edited.scene.entities[id]).position[0] = 71;
  assert.ok(isR3fSceneAuthoring(edited.scene.entities[one.entityId].codeAuthoring));
  const two = await apply(edited, operation(source({ moved: true, height: 6 }), one.entityId));
  assert.equal(nodeId(two, "House"), id);
  assert.equal(nodeId(two, "Wall"), wallId);
  assert.equal(transform(two.bundle.scene.entities[id]).position[0], 71);
  assert.ok(Object.values(meta(two).nodes).some(node => node.entityId === id && node.identityKey === "house"));
});

test("a wrapper occupying an anchor's historical path cannot take its identity", async () => {
  const house = height => `<mesh key="house" name="House"><boxGeometry args={[2,${height},2]}/><meshStandardMaterial color="#ffffff"/></mesh>`;
  const text = (wrapped, height) => `export function World(){return <group name="World">${wrapped ? `<group name="house">${house(height)}</group>` : house(height)}</group>}`;
  const one = await setup(text(false, 3)), id = nodeId(one, "House"), edited = structuredClone(one.bundle);
  transform(edited.scene.entities[id]).position[0] = 81;
  const two = await apply(edited, operation(text(true, 4), one.entityId));
  assert.equal(nodeId(two, "House"), id);
  assert.notEqual(nodeId(two, "house"), id);
  assert.equal(two.bundle.scene.entities[id].parentId, nodeId(two, "house"));
  assert.equal(transform(two.bundle.scene.entities[id]).position[0], 81);
  const three = await apply(two.bundle, operation(text(true, 5), two.entityId));
  assert.equal(nodeId(three, "House"), id);
  assert.equal(nodeId(three, "house"), nodeId(two, "house"));
  assert.deepEqual(transform(three.bundle.scene.entities[id]).scale, [2,5,2]);
});

test("a saved global key becoming ambiguous rejects without any partial update", async () => {
  const one = await setup(source()), snapshot = JSON.stringify(one.bundle);
  await assert.rejects(apply(one.bundle, operation(source({ moved: true, duplicate: true }), one.entityId)), /key.*複数|一意/);
  assert.equal(JSON.stringify(one.bundle), snapshot);
});

test("reusable child keys stay scoped to each anchored parent", async () => {
  const row = (key, name, x) => `<group key="${key}" name="${name}" position={[${x},0,0]}><mesh key="pane" name="${name} Pane"><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh></group>`;
  const text = moved => `export function World(){return <group name="World"><group name="Left">${moved ? "" : row("house-a", "House A", 1)}</group><group name="Right">${moved ? `<group name="Wrapper">${row("house-a", "House A", 3)}</group>` : ""}${row("house-b", "House B", 4)}</group></group>}`;
  const one = await setup(text(false)), paneA = nodeId(one, "House A Pane"), paneB = nodeId(one, "House B Pane");
  assert.notEqual(paneA, paneB);
  const two = await apply(one.bundle, operation(text(true), one.entityId));
  assert.equal(nodeId(two, "House A Pane"), paneA);
  assert.equal(nodeId(two, "House B Pane"), paneB);
  assert.ok(Object.values(meta(two).nodes).every(node => node.identityKey !== "pane"));
});

test("deleted generated nodes stay deleted after source reparenting", async () => {
  const one = await setup(source()), id = nodeId(one, "House"), edited = structuredClone(one.bundle);
  const removed = new Set();
  const visit = current => { removed.add(current); for (const child of edited.scene.entities[current].children) visit(child); };
  visit(id);
  for (const current of removed) delete edited.scene.entities[current];
  for (const entity of Object.values(edited.scene.entities)) entity.children = entity.children.filter(child => !removed.has(child));
  const two = await apply(edited, operation(source({ moved: true, height: 6 }), one.entityId));
  assert.equal(nodeId(two, "House"), id);
  for (const current of removed) assert.equal(two.bundle.scene.entities[current], undefined);
  assert.ok(two.bundle.scene.entities[nodeId(two, "New Wrapper")]);
});

test("copying a moved original preserves canonical identities without touching the source", async () => {
  const one = await setup(source());
  const moved = await apply(one.bundle, operation(source({ moved: true }), one.entityId));
  const snapshot = JSON.stringify(moved.bundle);
  let sequence = 0;
  const duplicate = duplicateEntityHierarchy(moved.bundle.scene, [moved.entityId], kind => `identity-copy-${kind}-${++sequence}`);
  assert.ok(duplicate);
  const copyId = duplicate.clone.rootEntityIds[0];
  const copy = { bundle: { ...moved.bundle, scene: duplicate.scene }, entityId: copyId };
  const id = nodeId(copy, "House");
  const updated = await apply(copy.bundle, operation(source({ height: 7 }), copyId));
  assert.equal(nodeId(updated, "House"), id);
  assert.equal(updated.bundle.scene.entities[id].parentId, nodeId(updated, "GroupA"));
  assert.deepEqual(updated.bundle.scene.entities[moved.entityId], moved.bundle.scene.entities[moved.entityId]);
  assert.deepEqual(updated.bundle.scene.entities[nodeId(moved, "House")], moved.bundle.scene.entities[nodeId(moved, "House")]);
  assert.equal(JSON.stringify(moved.bundle), snapshot);
});

test("transferred and Prefab originals retain movable anchors through their real codecs", async () => {
  const one = await setup(source());
  const moved = await apply(one.bundle, operation(source({ moved: true }), one.entityId));
  const transfer = createHierarchyTransfer(moved.bundle, [moved.entityId]);
  const prepared = await prepareHierarchyTransferFiles(transfer, async path => { throw new Error(`Unexpected source read: ${path}`); });
  const imported = planHierarchyImport(createPrototypeProject("world", "r3f-identity-target"), prepared);
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(imported.bundle.scene));
  assert.ok(decoded.ok, JSON.stringify(decoded));
  const transferred = { bundle: { ...imported.bundle, scene: decoded.document }, entityId: imported.rootEntityIds[0] };
  const id = nodeId(transferred, "House");
  const updated = await apply(transferred.bundle, operation(source({ height: 8 }), transferred.entityId));
  assert.equal(nodeId(updated, "House"), id);
  const prefab = createPrefabDocument(moved.bundle.scene, moved.bundle.assets, { prefabId: "identity-prefab", name: "Movable town", sourceRootEntityIds: [moved.entityId] });
  assert.ok(prefab);
  const prefabDecoded = prefabDocumentCodec.parse(prefabDocumentCodec.serialize(prefab.document));
  assert.ok(prefabDecoded.ok, JSON.stringify(prefabDecoded));
  const root = prefabDecoded.document.entities[prefabDecoded.document.rootEntityIds[0]];
  assert.ok(isR3fSceneAuthoring(root.codeAuthoring));
  assert.ok(Object.values(root.codeAuthoring.nodes).some(node => node.identityKey === "house"));
  const prefabBundle = { ...moved.bundle, scene: { ...moved.bundle.scene, rootEntityIds: [root.id], entities: prefabDecoded.document.entities } };
  const prior = { bundle: prefabBundle, entityId: root.id };
  const prefabUpdated = await apply(prefabBundle, operation(source({ height: 9 }), root.id));
  assert.equal(nodeId(prefabUpdated, "House"), nodeId(prior, "House"));
});

test("metadata rejects duplicate identities and reserves generated geometry helper keys", async () => {
  const one = await setup(source()), value = structuredClone(meta(one)), nodes = Object.values(value.nodes);
  nodes[0].identityKey = nodes[1].identityKey = "ambiguous";
  assert.equal(isR3fSceneAuthoring(value), false);
  nodes[1].identityKey = "$xrift-geometry";
  assert.equal(isR3fSceneAuthoring(value), false);
});

test("leaf surface restructuring preserves manual child and Component dependencies by stopping atomically", async () => {
  const text = nested => `export function World(){return <mesh key="house" name="House"><boxGeometry args={[4,3,4]}/><meshStandardMaterial color="#ffffff"/>${nested ? '<mesh key="door" name="Door"><boxGeometry/><meshStandardMaterial color="#ff0000"/></mesh>' : ""}</mesh>}`;
  const one = await setup(text(false)), id = nodeId(one, "House");
  const child = createEmptyEntity(one.bundle.scene, id, "Manual child");
  assert.ok(child);
  transform(child.scene.entities[child.entityId]).position = [2,1,0];
  const withChild = { ...one.bundle, scene: child.scene };
  const withComponent = structuredClone(one.bundle);
  withComponent.scene.entities[id].components.push(createBoxColliderComponent("manual-collider"));
  for (const edited of [withChild, withComponent]) {
    const snapshot = JSON.stringify(edited);
    await assert.rejects(apply(edited, operation(text(true), one.entityId)), /手動|保持|停止/);
    assert.equal(JSON.stringify(edited), snapshot);
  }
});
