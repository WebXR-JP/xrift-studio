import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-code-authoring-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { applyChatgptR3fScene: apply } = await load("chatgpt-code-authoring");
const { validateR3fStaticSource } = await load("r3f-static-source");
const { isR3fSceneAuthoring } = await load("r3f-scene-source");
const { createPrototypeProject } = await load("prototype-project");
const { createEmptyEntity } = await load("editor-session");
const { createBoxColliderComponent } = await load("scene-document");
const { duplicateEntityHierarchy } = await load("scene-document");
const { createHierarchyTransfer, prepareHierarchyTransferFiles, planHierarchyImport } = await load("hierarchy-transfer");
const { sceneDocumentCodec, prefabDocumentCodec } = await load("serialization");
const { createPrefabDocument, addPrefabAsset } = await load("prefab-document");
const { createDefaultCustomShader } = await load("custom-shader-contract");
const source = ({ x = 2, y = 0, height = 3, color = "#ff0000", second = false } = {}) => `export function World(){return <group name="World"><mesh key="house" name="House" position={[${x},${y},0]}><boxGeometry args={[2,${height},2]}/><meshStandardMaterial color="${color}"/></mesh>${second ? '<mesh key="tree" name="Tree"><coneGeometry args={[1,3]}/><meshStandardMaterial color="#00ff00"/></mesh>' : ""}</group>}`;
const operation = (text, entityId) => ({ kind: "r3f-scene", name: "Town", source: text, ...(entityId ? { entityId } : {}) });
const metadata = result => result.bundle.scene.entities[result.entityId].codeAuthoring;
const houseId = result => Object.values(metadata(result).nodes).find(node => JSON.parse(node.baseline).name === "House").entityId;
const transform = entity => entity.components.find(component => component.type === "transform");
const mesh = entity => entity.components.find(component => component.type === "mesh");
const setup = async text => apply(createPrototypeProject("world", "r3f-authoring-fixture"), operation(text ?? source()), { prompt: "街の家を作ってください" });

test("bundled Monaco compiler dynamically loads under real Vite SSR; source persists", async () => {
  await validateR3fStaticSource(source());
  const result = await setup();
  assert.equal(metadata(result).revision, 1);
  assert.equal(metadata(result).originalPrompt, "街の家を作ってください");
  assert.ok(isR3fSceneAuthoring(metadata(result)));
  const serialized = sceneDocumentCodec.serialize(result.bundle.scene);
  assert.ok(serialized.includes("codeAuthoring"));
  assert.ok(serialized.includes("originalPrompt"));
  assert.equal(JSON.parse(serialized).entities[result.entityId].codeAuthoring.source, source());
  const decoded = sceneDocumentCodec.parse(serialized);
  assert.equal(decoded.ok, true, JSON.stringify(decoded));
  const reloaded = await apply({ ...result.bundle, scene: decoded.document }, operation(source({ height: 4 }), result.entityId));
  assert.equal(metadata(reloaded).revision, 2);
});

test("code updates reuse root/entity/component IDs and preserve the first prompt", async () => {
  const one = await setup();
  const id = houseId(one), before = one.bundle.scene.entities[id];
  const two = await apply(one.bundle, operation(source({ height: 5 }), one.entityId), { prompt: "高さを変更" });
  assert.equal(two.entityId, one.entityId);
  assert.equal(houseId(two), id);
  assert.deepEqual(two.bundle.scene.entities[id].components.map(component => component.id), before.components.map(component => component.id));
  assert.deepEqual(transform(two.bundle.scene.entities[id]).scale, [2,5,2]);
  assert.equal(metadata(two).revision, 2);
  assert.equal(metadata(two).originalPrompt, metadata(one).originalPrompt);
  assert.deepEqual(transform(one.bundle.scene.entities[id]).scale, [2,3,2]);
});

test("Inspector field overrides, added Components, root Transform and manual children survive", async () => {
  const one = await setup(), id = houseId(one);
  let edited = structuredClone(one.bundle);
  transform(edited.scene.entities[id]).position[0] = 99;
  transform(edited.scene.entities[one.entityId]).position = [10,0,20];
  edited.scene.entities[id].components.push(createBoxColliderComponent("manual-extra"));
  const child = createEmptyEntity(edited.scene, id, "Manual child");
  assert.ok(child);
  edited = { ...edited, scene: child.scene };
  const two = await apply(edited, operation(source({ x: 4, y: 1, height: 5 }), one.entityId));
  assert.deepEqual(transform(two.bundle.scene.entities[id]).position, [99,1,0]);
  assert.deepEqual(transform(two.bundle.scene.entities[id]).scale, [2,5,2]);
  assert.deepEqual(transform(two.bundle.scene.entities[one.entityId]).position, [10,0,20]);
  assert.ok(two.bundle.scene.entities[id].components.some(component => component.id === "manual-extra"));
  assert.equal(two.bundle.scene.entities[child.entityId].parentId, id);
  assert.ok(two.bundle.scene.entities[id].children.includes(child.entityId));
});

test("manual material changes remain bound when the generated color changes", async () => {
  const one = await setup(), id = houseId(one), edited = structuredClone(one.bundle);
  const materialId = mesh(edited.scene.entities[id]).materialBindings[0].materialAssetId;
  edited.assets.assets[materialId].properties.roughness = 0.99;
  const two = await apply(edited, operation(source({ color: "#0000ff", height: 4 }), one.entityId));
  assert.equal(mesh(two.bundle.scene.entities[id]).materialBindings[0].materialAssetId, materialId);
  assert.equal(two.bundle.assets.assets[materialId].properties.roughness, 0.99);
  assert.deepEqual(transform(two.bundle.scene.entities[id]).scale, [2,4,2]);
});

test("same and visually identical source produce no Scene or recipe revision", async () => {
  const one = await setup();
  const exact = await apply(one.bundle, operation(source(), one.entityId));
  assert.equal(exact.bundle, one.bundle);
  const formatting = await apply(one.bundle, operation(source().replace('name="World"', 'name = "World"'), one.entityId));
  assert.equal(formatting.bundle, one.bundle);
});

test("ordinary removals work; manually changed entities cannot be removed", async () => {
  const one = await setup(source({ second: true }));
  const tree = Object.values(metadata(one).nodes).find(node => JSON.parse(node.baseline).name === "Tree").entityId;
  const removed = await apply(one.bundle, operation(source(), one.entityId));
  assert.equal(removed.bundle.scene.entities[tree], undefined);
  const edited = structuredClone(one.bundle);
  transform(edited.scene.entities[tree]).position[2] = 17;
  const snapshot = JSON.stringify(edited);
  await assert.rejects(apply(edited, operation(source(), one.entityId)), /手動|保持|削除/);
  assert.equal(JSON.stringify(edited), snapshot);
});

test("invalid, lossy and executable code rejects atomically", async () => {
  const one = await setup(), snapshot = JSON.stringify(one.bundle);
  for (const text of [
    "export function World(){return <mesh>",
    source().replace('color="#ff0000"', 'color="#ff0000" opacity={0.2}'),
    source().replace("[2,0,0]", "[unknownValue,0,0]"),
    "export function World(){fetch('https://example.invalid');return <mesh/>}",
    'export function World(props){return <group name="World">{props.items.map(x=><mesh name="A"><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh>)}</group>}',
    'export function World(){return <group name="World"><mesh name="Same"><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh><mesh name="Same"><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh></group>}',
  ]) await assert.rejects(apply(one.bundle, operation(text, one.entityId)));
  assert.equal(JSON.stringify(one.bundle), snapshot);
});

test("Stop during validation/import leaves the original project unchanged", async () => {
  const one = await setup(), snapshot = JSON.stringify(one.bundle);
  let checks = 0;
  await assert.rejects(apply(one.bundle, operation(source({ height: 5 }), one.entityId), { checkCurrent() { if (++checks === 3) throw new Error("Stopped"); } }), /Stopped/);
  assert.equal(JSON.stringify(one.bundle), snapshot);
});

test("damaged ownership metadata cannot overwrite another Scene entity", async () => {
  const one = await setup(), edited = structuredClone(one.bundle);
  const external = edited.scene.entities["entity-world-floor"];
  const meta = edited.scene.entities[one.entityId].codeAuthoring;
  const key = Object.keys(meta.nodes).find(key => JSON.parse(meta.nodes[key].baseline).name === "House");
  meta.nodes[key] = { entityId: external.id, baseline: JSON.stringify(external) };
  const snapshot = JSON.stringify(edited);
  await assert.rejects(apply(edited, operation(source({ height: 5 }), one.entityId)), /原本|所有|破損|整合|保持|対象|別/);
  assert.equal(JSON.stringify(edited), snapshot);
});

test("damaged material metadata cannot delete another unused Material asset", async () => {
  const one = await setup(), edited = structuredClone(one.bundle);
  const used = new Set(Object.values(edited.scene.entities).flatMap(entity => entity.components.flatMap(component => component.type === "mesh" ? component.materialBindings.map(binding => binding.materialAssetId) : [])));
  const external = Object.values(edited.assets.assets).find(asset => asset.kind === "material" && !asset.id.startsWith("asset-r3f-") && !used.has(asset.id));
  assert.ok(external);
  const { thumbnail: _thumbnail, ...baseline } = external;
  edited.scene.entities[one.entityId].codeAuthoring.materials[external.id] = JSON.stringify(baseline);
  const snapshot = JSON.stringify(edited);
  await assert.rejects(apply(edited, operation(source({ height: 5 }), one.entityId)), /原本|所有|破損|整合|保持|対象|別/);
  assert.equal(JSON.stringify(edited), snapshot);
});

test("copying a generated hierarchy keeps the original immutable and the copy editable", async () => {
  const one = await setup(), snapshot = JSON.stringify(one.bundle);
  let sequence = 0;
  const duplicate = duplicateEntityHierarchy(one.bundle.scene, [one.entityId], kind => `copy-${kind}-${++sequence}`);
  assert.ok(duplicate);
  const copyId = duplicate.clone.rootEntityIds[0];
  assert.notEqual(duplicate.scene.entities[copyId].codeAuthoring, metadata(one));
  const two = await apply({ ...one.bundle, scene: duplicate.scene }, operation(source({ height: 7, color: "#0000ff" }), copyId));
  assert.equal(metadata(two).revision, 2);
  assert.deepEqual(transform(two.bundle.scene.entities[houseId(two)]).scale, [2,7,2]);
  assert.deepEqual(two.bundle.scene.entities[one.entityId], one.bundle.scene.entities[one.entityId]);
  assert.deepEqual(two.bundle.scene.entities[houseId(one)], one.bundle.scene.entities[houseId(one)]);
  assert.equal(JSON.stringify(one.bundle), snapshot);
});

test("hierarchy transfer remaps baselines, reloads, and edits without touching its source", async () => {
  const one = await setup(), snapshot = JSON.stringify(one.bundle);
  const transfer = createHierarchyTransfer(one.bundle, [one.entityId]);
  const prepared = await prepareHierarchyTransferFiles(transfer, async path => { throw new Error(`Unexpected source read: ${path}`); });
  const target = createPrototypeProject("world", "r3f-transfer-target");
  const imported = planHierarchyImport(target, prepared);
  const transferredId = imported.rootEntityIds[0];
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(imported.bundle.scene));
  assert.ok(decoded.ok, JSON.stringify(decoded));
  const two = await apply({ ...imported.bundle, scene: decoded.document }, operation(source({ height: 8, color: "#0000ff" }), transferredId));
  assert.equal(metadata(two).revision, 2);
  assert.deepEqual(transform(two.bundle.scene.entities[houseId(two)]).scale, [2,8,2]);
  assert.equal(JSON.stringify(one.bundle), snapshot);
  for (const entity of Object.values(target.scene.entities)) assert.deepEqual(two.bundle.scene.entities[entity.id], entity);
});

test("strict validation permits data property names and lexically scoped window/document", async () => {
  const text = `const data={window:[{x:1},{x:2}]};function Row({document}){return <group name="Row">{document.map(window=><mesh key={window.x} name="Pane" position={[window.x,0,0]}><boxGeometry/><meshStandardMaterial color="#ffffff"/></mesh>)}</group>}export function World(){return <Row document={data.window}/>}`;
  await validateR3fStaticSource(text);
  const result = await setup(text);
  const panes = Object.values(result.bundle.scene.entities).filter(entity => entity.name === "Pane");
  assert.deepEqual(panes.map(entity => transform(entity).position[0]), [1,2]);
  await validateR3fStaticSource(`const window=[1,2];export function World(){return <group name="World">{window.map(document=><mesh key={document} name="Pane"><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>)}</group>}`);
  await validateR3fStaticSource('interface Pane { window: number }; const panes: Pane[] = [{window:1}]; export function World(){return <group name="World"/>}');
  await assert.rejects(validateR3fStaticSource('function Local(window){return <group name="Local"/>}export function World(){const value=window.innerWidth;return <group name="World"/>}'));
  for (const bad of ['window.innerWidth', 'document.location', 'globalThis.someValue']) await assert.rejects(validateR3fStaticSource(`export function World(){const x=${bad};return <group name="World"/>}`));
});

test("strict authoring rejects known lossy geometry/native attributes and preserves Basic unlit", async () => {
  for (const jsx of ['<mesh name="Shape"><cylinderGeometry args={[1,2,3]}/><meshStandardMaterial color="#fff"/></mesh>', '<mesh name="Shape"><sphereGeometry args={[1,8,8]}/><meshStandardMaterial color="#fff"/></mesh>', '<mesh name="Shape" scale={0}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<mesh name="Shape" renderOrder={10}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<pointLight name="Light" args={["#fff",2]}/>']) {
    await assert.rejects(setup(`export function World(){return ${jsx}}`));
  }
  const basic = await setup('export function World(){return <mesh name="Unlit"><boxGeometry/><meshBasicMaterial color="#abcdef"/></mesh>}');
  const entity = Object.values(basic.bundle.scene.entities).find(entity => entity.name === "Unlit");
  assert.ok(basic.bundle.assets.assets[mesh(entity).materialBindings[0].materialAssetId].properties.extensions.KHR_materials_unlit);
});

test("regenerating a palette retains Materials reused by a normal Prefab", async () => {
  const one = await setup(), id = houseId(one);
  const materialId = mesh(one.bundle.scene.entities[id]).materialBindings[0].materialAssetId;
  const prefab = createPrefabDocument(one.bundle.scene, one.bundle.assets, { prefabId: "reused-house", name: "Reused house", sourceRootEntityIds: [id] });
  assert.ok(prefab);
  const added = addPrefabAsset(one.bundle.assets, { id: "reused-house-asset", name: "Reused house", prefabPath: "prefabs/reused-house.prefab.json" });
  assert.ok(added.added);
  const current = { ...one.bundle, assets: added.manifest, prefabs: { ...one.bundle.prefabs, "reused-house": prefab.document } };
  const snapshot = JSON.stringify(current);
  const two = await apply(current, operation(source({ color: "#0000ff" }), one.entityId));
  assert.deepEqual(two.bundle.assets.assets[materialId], current.assets.assets[materialId]);
  assert.deepEqual(two.bundle.prefabs["reused-house"], prefab.document);
  const copiedHouse = Object.values(prefab.document.entities).find(entity => entity.name === "House");
  assert.equal(mesh(copiedHouse).materialBindings[0].materialAssetId, materialId);
  assert.equal(JSON.stringify(current), snapshot);
});

test("normal Prefab namespaces retain a valid R3F original through the real codec", async () => {
  const one = await setup();
  const prefab = createPrefabDocument(one.bundle.scene, one.bundle.assets, { prefabId: "code-town-prefab", name: "Code town", sourceRootEntityIds: [one.entityId] });
  assert.ok(prefab);
  const root = prefab.document.entities[prefab.document.rootEntityIds[0]];
  assert.ok(root.id.includes("/entity/"));
  assert.ok(isR3fSceneAuthoring(root.codeAuthoring));
  assert.equal(root.codeAuthoring.source, metadata(one).source);
  const decoded = prefabDocumentCodec.parse(prefabDocumentCodec.serialize(prefab.document));
  assert.ok(decoded.ok, JSON.stringify(decoded));
  assert.deepEqual(decoded.document.entities[root.id].codeAuthoring, root.codeAuthoring);
  assert.ok(isR3fSceneAuthoring(metadata(one)));
});

test("red-blue-red reuses the retired canonical Material after its recipe entry is gone", async () => {
  const one = await setup();
  const redId = mesh(one.bundle.scene.entities[houseId(one)]).materialBindings[0].materialAssetId;
  const oldRed = structuredClone(one.bundle.assets.assets[redId]);
  const blue = await apply(one.bundle, operation(source({ color: "#0000ff" }), one.entityId));
  assert.equal(metadata(blue).materials[redId], undefined);
  assert.deepEqual(blue.bundle.assets.assets[redId], oldRed);
  const restored = await apply(blue.bundle, operation(source(), one.entityId));
  assert.equal(mesh(restored.bundle.scene.entities[houseId(restored)]).materialBindings[0].materialAssetId, redId);
  assert.deepEqual(restored.bundle.assets.assets[redId], oldRed);
  assert.equal(metadata(restored).revision, 3);
  assert.ok(metadata(restored).materials[redId]);
});

test("returning to an old palette never overwrites its manually authored Shader", async () => {
  const one = await setup();
  const redId = mesh(one.bundle.scene.entities[houseId(one)]).materialBindings[0].materialAssetId;
  const blue = await apply(one.bundle, operation(source({ color: "#0000ff" }), one.entityId));
  const edited = structuredClone(blue.bundle);
  edited.assets.assets[redId].shader = createDefaultCustomShader();
  const snapshot = JSON.stringify(edited);
  await assert.rejects(apply(edited, operation(source(), one.entityId)), /Material|保持|素材|原本/);
  assert.equal(JSON.stringify(edited), snapshot);
  assert.deepEqual(edited.assets.assets[redId].shader, createDefaultCustomShader());
});

const nestedSource = ({ color = "#ff0000" } = {}) => source({ color }).replace("</mesh></group>", '<mesh key="roof" name="Roof" position={[0,3,0]}><coneGeometry args={[2,1]}/><meshStandardMaterial color="#ff8800"/></mesh></mesh></group>');

test("leaf to nested to leaf preserves root identity and never duplicates its surface", async () => {
  const leaf = await setup(), id = houseId(leaf);
  const nested = await apply(leaf.bundle, operation(nestedSource(), leaf.entityId));
  assert.equal(houseId(nested), id);
  assert.equal(mesh(nested.bundle.scene.entities[id]), undefined);
  const geometry = Object.values(metadata(nested).nodes).find(node => JSON.parse(node.baseline).name === "House Geometry");
  assert.ok(geometry);
  assert.deepEqual(transform(nested.bundle.scene.entities[geometry.entityId]).scale, [2,3,2]);
  assert.deepEqual(transform(nested.bundle.scene.entities[id]).scale, [1,1,1]);
  const restored = await apply(nested.bundle, operation(source(), leaf.entityId));
  assert.equal(houseId(restored), id);
  assert.ok(mesh(restored.bundle.scene.entities[id]));
  assert.equal(restored.bundle.scene.entities[geometry.entityId], undefined);
  assert.equal(Object.values(metadata(restored).nodes).filter(node => JSON.parse(node.baseline).components.some(item => item.type === "mesh")).length, 1);
});

test("surface restructuring stops atomically when Inspector geometry, dimensions or Material have overrides", async () => {
  for (const edit of [
    (bundle, id) => { mesh(bundle.scene.entities[id]).castShadow = false; },
    (bundle, id) => { transform(bundle.scene.entities[id]).scale[1] = 7; },
    (bundle, id) => { bundle.assets.assets[mesh(bundle.scene.entities[id]).materialBindings[0].materialAssetId].properties.roughness = 0.2; },
  ]) {
    const leaf = await setup(), edited = structuredClone(leaf.bundle), id = houseId(leaf);
    edit(edited, id);
    const snapshot = JSON.stringify(edited);
    await assert.rejects(apply(edited, operation(nestedSource({ color: "#0000ff" }), leaf.entityId)), /手動|保持|停止/);
    assert.equal(JSON.stringify(edited), snapshot);
  }
  const nested = await setup(nestedSource()), edited = structuredClone(nested.bundle);
  const geometry = Object.values(metadata(nested).nodes).find(node => JSON.parse(node.baseline).name === "House Geometry");
  transform(edited.scene.entities[geometry.entityId]).scale[1] = 7;
  const snapshot = JSON.stringify(edited);
  await assert.rejects(apply(edited, operation(source(), nested.entityId)), /手動|保持|停止/);
  assert.equal(JSON.stringify(edited), snapshot);
});

test("strict source authoring retains Text contents and rejects unsupported child placement", async () => {
  const result = await setup(`import {Text} from '@react-three/drei';const label='Welcome';export default function World(){return <group name="World"><Text name="Literal">Hello</Text><Text name="Expression">{label} {42}</Text></group>}`);
  assert.deepEqual(Object.values(metadata(result).nodes).flatMap(node => JSON.parse(node.baseline).components.filter(item => item.type === "text").map(item => item.text)), ["Hello", "Welcome 42"]);
  await assert.rejects(setup(`function Shell({children}){return <group name="Offset" position={[10,0,0]}>{children}</group>}export default function World(){return <Shell><mesh name="Body"><boxGeometry/><meshStandardMaterial color="#fff"/></mesh></Shell>}`), /children|子要素/);
});
