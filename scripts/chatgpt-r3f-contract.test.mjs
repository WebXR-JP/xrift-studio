import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-r3f-contract-test",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { applyChatgptR3fScene } = await load("chatgpt-code-authoring");
const { parseChatgptWorldPlan } = await load("chatgpt-world");
const { collectChatgptSceneContext, collectChatgptSceneResources } = await load("chatgpt-scene-resources");
const { chatgptPlanSnapshots, assertChatgptPlanCurrent, ChatgptSceneConflictError } = await load("chatgpt-plan-guards");
const { rebaseChatgptStep } = await load("chatgpt-generation");
const { createPrototypeProject } = await load("prototype-project");
const { createEmptyEntity } = await load("editor-session");
const { R3F_SOURCE_MAX_BYTES } = await load("r3f-scene-source");

const production = { scope: "model", detail: "focused", focus: "家の屋根と壁を調整する", criteria: ["家の形状を保って指定部分を更新する"], maxPasses: 2 };
const code = height => `export default function World(){return <group name="house"><mesh name="wall"><boxGeometry args={[3,${height},2]}/><meshStandardMaterial color="#cca87a" roughness={0.8}/></mesh></group>}`;
const operation = (source, entityId = null) => ({ kind: "r3f-scene", name: "家", source, entityId });
const plan = operations => ({ title: "家を調整", description: "指定した部分だけを調整します", production, objects: [], edits: [], operations, hasMore: false });
const transform = entity => entity.components.find(component => component.type === "transform");
const mesh = entity => entity.components.find(component => component.type === "mesh");
const bytes = value => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
async function setup(text = code(3), bundle = createPrototypeProject("world", "r3f-contract-isolated")) {
  return applyChatgptR3fScene(bundle, operation(text), { prompt: "家を作って" });
}
function resources(bundle, selectedId) {
  const scene = collectChatgptSceneContext(bundle, selectedId);
  return { scene, resources: collectChatgptSceneResources(bundle, scene.entities.map(entity => entity.id), []) };
}
function wall(result) { return Object.values(result.bundle.scene.entities).find(entity => entity.name === "wall" && entity.id.startsWith(`${result.entityId}-r3f-`)); }

test("R3F parse requires finite production and latest source on the exact owning root", async () => {
  const one = await setup(), { scene, resources: context } = resources(one.bundle, one.entityId);
  const ids = scene.entities.map(entity => entity.id), raw = plan([operation(code(4), one.entityId)]);
  const parse = value => parseChatgptWorldPlan(JSON.stringify(value), [], false, ids, context);
  assert.equal(parse(raw).operations[0].entityId, one.entityId);
  assert.equal(context.authoredScenes[0].source, code(3));
  for (const direction of [undefined, null, { ...production, maxPasses: 7 }, { ...production, criteria: [] }]) assert.throws(() => parse({ ...raw, production: direction }));
  assert.doesNotThrow(() => parse({ ...raw, production: null, operations: [] }), "Legacy ordinary edits remain compatible");
  for (const target of [wall(one).id, "unavailable-root"]) assert.throws(() => parse({ ...raw, operations: [operation(code(4), target)] }));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw), [], false, ids, { ...context, authoredScenes: undefined }));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw), [], false, ids, { ...context, modelSource: "store" }));
  assert.doesNotThrow(() => parseChatgptWorldPlan(JSON.stringify(plan([operation(code(3))])), [], false, ids, { ...context, blenderAvailable: false }));
  const before = JSON.stringify(one.bundle);
  const two = await applyChatgptR3fScene(one.bundle, operation(code(4), one.entityId));
  assert.equal(resources(two.bundle, one.entityId).resources.authoredScenes[0].source, code(4));
  assert.equal(JSON.stringify(one.bundle), before, "Collecting and updating must not mutate the previous snapshot");
});

test("source byte bounds preserve exact complete code and keep the old catalog budget without sources", async () => {
  const exact = `${code(3)}${" ".repeat(R3F_SOURCE_MAX_BYTES - bytes(code(3)))}`;
  assert.equal(bytes(exact), 48_000);
  const one = await setup(exact), snapshot = JSON.stringify(one.bundle), context = resources(one.bundle, one.entityId).resources;
  assert.equal(context.authoredScenes[0].source, exact);
  assert.ok(bytes(context) <= 96 * 1024 && bytes(context) > 31 * 1024);
  assert.equal(JSON.stringify(one.bundle), snapshot);
  const ordinary = resources(createPrototypeProject("world", "r3f-contract-no-source")).resources;
  assert.equal(ordinary.authoredScenes, undefined); assert.ok(bytes(ordinary) <= 31 * 1024);
  for (const invalid of [exact + " ", `${code(3)}/*${"あ".repeat(16_000)}*/`]) {
    const raw = plan([operation(invalid)]);
    assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw), [], false, [], ordinary), "UTF-8 byte limits cannot be bypassed with shorter multibyte strings");
  }
});

test("aggregate source allowance follows priority and drops whole programs rather than truncating", async () => {
  const padded = length => `${code(3)}/*${"x".repeat(length - bytes(code(3)) - 4)}*/`;
  const a = await setup(padded(28_000)), b = await setup(padded(24_000), a.bundle), c = await setup(code(3), b.bundle);
  const snapshot = JSON.stringify(c.bundle);
  const forward = collectChatgptSceneResources(c.bundle, [a.entityId, b.entityId, c.entityId], []);
  assert.deepEqual(forward.authoredScenes.map(scene => scene.entityId), [a.entityId, c.entityId]);
  assert.equal(forward.authoredScenes[0].source, padded(28_000));
  const reverse = collectChatgptSceneResources(c.bundle, [b.entityId, a.entityId, c.entityId], []);
  assert.deepEqual(reverse.authoredScenes.map(scene => scene.entityId), [b.entityId, c.entityId]);
  for (const context of [forward, reverse]) {
    assert.ok(context.authoredScenes.reduce((sum, scene) => sum + bytes(scene.source), 0) <= 48_000);
    assert.ok(bytes(context) <= 96 * 1024);
  }
  const broken = structuredClone(c.bundle);
  broken.scene.entities[a.entityId].codeAuthoring.source += "x".repeat(48_001);
  assert.ok(!collectChatgptSceneResources(broken, [a.entityId, c.entityId], []).authoredScenes.some(scene => scene.entityId === a.entityId));
  assert.equal(JSON.stringify(c.bundle), snapshot);
});

test("selecting a generated part in a large Scene retains its owning root and exact editable source", async () => {
  let bundle = createPrototypeProject("world", "r3f-contract-large-scene");
  for (let index = 0; index < 120; index++) {
    const created = createEmptyEntity(bundle.scene, null, `Existing Entity ${index}`);
    bundle = { ...bundle, scene: created.scene };
  }
  const one = await setup(code(3), bundle), selected = wall(one).id;
  for (const target of [{ selected, attached: [] }, { selected: undefined, attached: [selected] }]) {
    const scene = collectChatgptSceneContext(one.bundle, target.selected, [], target.attached);
    const context = collectChatgptSceneResources(one.bundle, scene.entities.map(entity => entity.id), []);
    assert.equal(scene.selectedEntityId, target.selected);
    assert.ok(scene.entities.some(entity => entity.id === one.entityId), "A selected or attached generated part must not lose its owning root behind the 100-Entity context cap");
    assert.ok(context.authoredScenes?.some(scene => scene.entityId === one.entityId && scene.source === code(3)), "Retain the latest source rather than making the planner reconstruct the selected model");
  }
});

test("reparented parts retain their original source owner and forged foreign metadata cannot steal priority", async () => {
  let bundle = createPrototypeProject("world", "r3f-contract-reparented-part");
  for (let index = 0; index < 120; index++) bundle = { ...bundle, scene: createEmptyEntity(bundle.scene, null, `Existing ${index}`).scene };
  const one = await setup(code(3), bundle), two = await setup(code(4), one.bundle);
  const current = structuredClone(two.bundle), part = wall(one).id;
  const entity = current.scene.entities[part], priorParent = current.scene.entities[entity.parentId];
  priorParent.children = priorParent.children.filter(id => id !== part);
  const external = Object.values(bundle.scene.entities)[0];
  entity.parentId = external.id; current.scene.entities[external.id].children.push(part);
  current.scene.entities[two.entityId].codeAuthoring.nodes = structuredClone(current.scene.entities[one.entityId].codeAuthoring.nodes);
  const { scene, resources: context } = resources(current, part);
  assert.ok(scene.entities.some(entity => entity.id === one.entityId));
  assert.equal(context.authoredScenes[0].entityId, one.entityId);
  assert.equal(context.authoredScenes[0].source, code(3));
  assert.ok(!context.authoredScenes.some(source => source.entityId === two.entityId), "A foreign root cannot claim another root's stable node IDs");
});

test("one root update guards its whole generated subtree, added children, source and bound Materials", async () => {
  const one = await setup();
  const withChild = createEmptyEntity(one.bundle.scene, one.entityId, "Manual child");
  assert.ok(withChild);
  const bundle = { ...one.bundle, scene: withChild.scene }, childId = wall(one).id;
  const materialId = mesh(bundle.scene.entities[childId]).materialBindings[0].materialAssetId;
  const proposed = plan([operation(code(4), one.entityId)]), snapshots = chatgptPlanSnapshots(bundle, proposed);
  assert.ok(snapshots[`entity:${withChild.entityId}`] && snapshots[`entity:${childId}`] && snapshots[`asset:${materialId}`]);
  for (const change of [
    current => { transform(current.scene.entities[childId]).position[1] = 4; },
    current => { current.scene.entities[withChild.entityId].name = "Edited manual child"; },
    current => { current.scene.entities[one.entityId].codeAuthoring.source = code(9); },
    current => { current.assets.assets[materialId].properties.roughness = 0.3; },
    current => { delete current.scene.entities[childId]; },
  ]) {
    const edited = structuredClone(bundle); change(edited);
    assert.throws(() => assertChatgptPlanCurrent(edited, proposed, snapshots), ChatgptSceneConflictError);
  }
  const extra = createEmptyEntity(bundle.scene, one.entityId, "Added during planning");
  assert.throws(() => assertChatgptPlanCurrent({ ...bundle, scene: extra.scene }, proposed, snapshots), ChatgptSceneConflictError);
});

test("unrelated changes and derived thumbnails remain safe, while a late edit on the same part cannot be overwritten", async () => {
  const one = await setup(), proposed = plan([operation(code(4), one.entityId)]), snapshot = chatgptPlanSnapshots(one.bundle, proposed);
  const before = JSON.stringify(one.bundle), id = wall(one).id;
  const next = await applyChatgptR3fScene(one.bundle, operation(code(4), one.entityId));
  const unrelated = createEmptyEntity(one.bundle.scene, null, "Independent author edit");
  const latest = { ...one.bundle, scene: unrelated.scene, assets: structuredClone(one.bundle.assets) };
  const materialId = mesh(latest.scene.entities[id]).materialBindings[0].materialAssetId;
  latest.assets.assets[materialId].thumbnail = { status: "generated", derivedPath: "derived-only.webp" };
  assert.doesNotThrow(() => assertChatgptPlanCurrent(latest, proposed, snapshot));
  const merged = rebaseChatgptStep(one.bundle, next.bundle, latest);
  assert.equal(merged.scene.entities[unrelated.entityId].name, "Independent author edit");
  const concurrent = structuredClone(latest); transform(concurrent.scene.entities[id]).scale[1] = 8;
  const currentSnapshot = JSON.stringify(concurrent);
  assert.throws(() => rebaseChatgptStep(one.bundle, next.bundle, concurrent), ChatgptSceneConflictError);
  assert.equal(JSON.stringify(concurrent), currentSnapshot);
  assert.equal(JSON.stringify(one.bundle), before);
});
