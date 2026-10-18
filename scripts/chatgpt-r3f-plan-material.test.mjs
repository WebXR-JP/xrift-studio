import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-r3f-plan-material-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { applyChatgptR3fScene: apply } = await load("chatgpt-code-authoring");
const { createPrototypeProject } = await load("prototype-project");
const { createDefaultCustomShader } = await load("custom-shader-contract");
const { chatgptPlanSnapshots, assertChatgptPlanCurrent } = await load("chatgpt-plan-guards");

const source = color => `export function World(){return <mesh key="house" name="House"><boxGeometry args={[2,3,2]}/><meshStandardMaterial color="${color}"/></mesh>}`;
const operation = (color, entityId) => ({ kind: "r3f-scene", name: "Town", source: source(color), ...(entityId ? { entityId } : {}) });
const red = await apply(createPrototypeProject("world", "r3f-palette-guard-isolated-fixture"), operation("#ff0000"));
const rootId = red.entityId;
const redId = Object.keys(red.bundle.scene.entities[rootId].codeAuthoring.materials)[0];
const blue = await apply(red.bundle, operation("#0000ff", rootId));
const plan = { title: "Restore red", description: "Reuse the earlier palette", objects: [], operations: [operation("#ff0000", rootId)] };

test("a retired palette remains protected after its recipe and Scene bindings are gone", () => {
  assert.equal(blue.bundle.scene.entities[rootId].codeAuthoring.materials[redId], undefined);
  assert.ok(blue.bundle.assets.assets[redId]);
  assert.ok(!Object.values(blue.bundle.scene.entities).some(entity => entity.components.some(component => component.type === "mesh" && component.materialBindings.some(binding => binding.materialAssetId === redId))));
  const snapshots = chatgptPlanSnapshots(blue.bundle, plan);
  assert.ok(snapshots[`asset:${redId}`]);
  for (const change of [
    asset => { asset.shader = createDefaultCustomShader(); },
    asset => { asset.source = { kind: "project", relativePath: "assets/manual-material.json" }; },
    asset => { asset.name = "Hand-authored palette"; },
    asset => { asset.properties.roughness = 0.99; },
  ]) {
    const current = structuredClone(blue.bundle);
    change(current.assets.assets[redId]);
    assert.throws(() => assertChatgptPlanCurrent(current, plan, snapshots), /Planの作成後/);
  }
  const removed = structuredClone(blue.bundle);
  delete removed.assets.assets[redId];
  assert.throws(() => assertChatgptPlanCurrent(removed, plan, snapshots), /Planの作成後/);
});

test("canonical palette matching survives property ordering and authored source/Shader changes", () => {
  const current = structuredClone(blue.bundle);
  const material = current.assets.assets[redId];
  material.properties = Object.fromEntries(Object.entries(material.properties).reverse());
  material.source = { kind: "project", relativePath: "assets/authored-red.json" };
  material.shader = createDefaultCustomShader();
  const snapshots = chatgptPlanSnapshots(current, plan);
  assert.ok(snapshots[`asset:${redId}`]);
  assert.doesNotThrow(() => assertChatgptPlanCurrent(current, plan, snapshots));
  material.source.relativePath = "assets/changed-red.json";
  assert.throws(() => assertChatgptPlanCurrent(current, plan, snapshots), /Planの作成後/);
});

test("another R3F root and ordinary Materials do not cause unrelated conflicts", async () => {
  const other = await apply(blue.bundle, operation("#ff0000"));
  const otherMaterialId = Object.keys(other.bundle.scene.entities[other.entityId].codeAuthoring.materials)[0];
  const current = structuredClone(other.bundle);
  current.assets.assets["ordinary-material"] = { ...structuredClone(current.assets.assets[redId]), id: "ordinary-material" };
  const snapshots = chatgptPlanSnapshots(current, plan);
  assert.equal(snapshots[`asset:${otherMaterialId}`], undefined);
  assert.equal(snapshots["asset:ordinary-material"], undefined);
  current.assets.assets[otherMaterialId].properties.roughness = 0.98;
  current.assets.assets[otherMaterialId].name = "Other world's Material";
  current.assets.assets["ordinary-material"].shader = createDefaultCustomShader();
  current.assets.assets[redId].thumbnail = { status: "stale", derivedPath: "thumbnails/red.png", sourceHash: "fixture", rendererVersion: "fixture" };
  assert.doesNotThrow(() => assertChatgptPlanCurrent(current, plan, snapshots));
});
