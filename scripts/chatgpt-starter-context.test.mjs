import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-starter-context-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createStarterVisualProject } = await load("starter-templates");
const { untouchedChatgptStarterEntityIds } = await load("chatgpt-starter-context");
const { collectChatgptSceneContext } = await load("chatgpt-scene-resources");
const { buildChatgptHarnessContext, normalizeChatgptHarnessContext, serializeChatgptHarnessContext } = await load("chatgpt-harness-context");
const { serializeVisualProjectDocuments, parseVisualProjectFiles } = await load("persistence");
const { sha256Utf8 } = await load("compiler/hash");
const { executeXriftMcpEditorTool } = await load("mcp-editor-tools");
const blank = () => createStarterVisualProject("world", "blank", "starter-context-test");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object" ? `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value) ?? "null";
function reseal(packet) {
  const { fingerprint: _fingerprint, contextBytes: _contextBytes, ...content } = packet;
  const text = canonical(content);
  return { ...content, fingerprint: sha256Utf8(text), contextBytes: Buffer.byteLength(text) };
}

test("only untouched blank props are marked, including after the real save/open codecs", () => {
  const bundle = blank();
  const documents = { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
  const restored = parseVisualProjectFiles(serializeVisualProjectDocuments(documents));
  for (const current of [bundle, { ...restored, scene: restored.scenes[bundle.scene.sceneId] }]) {
    assert.deepEqual(untouchedChatgptStarterEntityIds(current), ["starter-floor", "starter-box"]);
    const scene = collectChatgptSceneContext(current, "starter-floor");
    assert.deepEqual(scene.starterEntityIds, ["starter-floor", "starter-box"]);
    assert.equal(scene.selectedEntityId, "starter-floor", "default selection does not turn the placeholder into required scenery");
    assert.ok(scene.entities.some(entity => entity.id === "starter-sun"));
    assert.ok(scene.entities.some(entity => entity.id === "starter-spawn"));
  }
});

test("MCP exposes the same verified placeholders and never classifies an edited box by its ID alone", () => {
  const bundle = blank();
  const context = { bundle, revision: 1, editorMode: "edit", importBusy: false, saveStatus: "saved", sceneSelection: { id: "starter-floor" }, assetSelection: null };
  const request = { id: "starter-context", tool: "get_editor_context", arguments: {} };
  assert.deepEqual(executeXriftMcpEditorTool(context, request).result.starterEntityIds, ["starter-floor", "starter-box"]);
  bundle.scene.entities["starter-box"].name = "手作りの案内板";
  assert.deepEqual(executeXriftMcpEditorTool(context, request).result.starterEntityIds, ["starter-floor"]);
});

test("a starter ID with any authored Entity change is protected", () => {
  const changes = [
    entity => { entity.name = "作者のモニュメント"; },
    entity => { entity.enabled = false; },
    entity => { entity.components.find(item => item.type === "transform").position[0] = 0.01; },
    entity => { entity.components.find(item => item.type === "mesh").geometry.width = 2; },
    entity => { entity.components.push({ id: "author-component", type: "script", enabled: true, scriptAssetId: "author-script", contractVersion: "1.0.0", runIn: "play", properties: {}, assetReferences: [], entityReferences: [] }); },
    entity => { entity.codeAuthoring = { version: 1, source: "export default () => <group />", originalPrompt: "箱", revision: 1, nodes: {}, materials: {} }; },
  ];
  for (const change of changes) {
    const bundle = blank();
    change(bundle.scene.entities["starter-box"]);
    assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor"]);
  }
});

test("material edits and missing dependencies protect a prop; derived thumbnails do not", () => {
  const bundle = blank();
  const materialId = bundle.scene.entities["starter-box"].components.find(item => item.type === "mesh").materialBindings[0].materialAssetId;
  bundle.assets.assets[materialId].thumbnail = { status: "generated", derivedPath: ".cache/preview.webp", sourceHash: "derived", rendererVersion: "test" };
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor", "starter-box"]);
  bundle.assets.assets[materialId].properties.pbrMetallicRoughness.roughnessFactor = 0.123;
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor"]);
  delete bundle.assets.assets[materialId];
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor"]);
});

test("children and hierarchy links protect props even when only one side of the tree changed", () => {
  for (const relation of ["parent", "children", "listed-parent", "missing-root", "duplicate-root"]) {
    const bundle = blank();
    const child = { ...structuredClone(bundle.scene.entities["starter-sun"]), id: "author-content", children: [], parentId: null };
    bundle.scene.entities[child.id] = child;
    if (relation === "parent") child.parentId = "starter-box";
    if (relation === "children") bundle.scene.entities["starter-box"].children = [child.id];
    if (relation === "listed-parent") child.children = ["starter-box"];
    if (relation === "missing-root") bundle.scene.rootEntityIds = bundle.scene.rootEntityIds.filter(id => id !== "starter-box");
    if (relation === "duplicate-root") bundle.scene.rootEntityIds.push("starter-box");
    assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor"], relation);
  }
});

test("authored Script, XRift and Interactivity Scene references protect unchanged starter targets", () => {
  const components = [
    { id: "author-script", type: "script", enabled: true, scriptAssetId: "author-script-asset", contractVersion: "1.0.0", runIn: "play", properties: {}, assetReferences: [], entityReferences: ["starter-box"] },
    { id: "author-xrift", type: "xrift-component", enabled: true, schemaId: "test-reference", schemaVersion: "1.0.0", properties: {}, assetReferences: [], entityReferences: ["starter-box"] },
    { id: "author-trigger", type: "interaction-trigger", enabled: true, interactivityAssetId: "author-graph", assetReferences: [], entityReferences: ["starter-box"] },
  ];
  for (const component of components) for (const enabled of [true, false]) {
    const bundle = blank();
    const controller = { ...structuredClone(bundle.scene.entities["starter-sun"]), id: "author-controller", enabled };
    controller.components.push(structuredClone(component));
    bundle.scene.entities[controller.id] = controller;
    bundle.scene.rootEntityIds.push(controller.id);
    const expected = ["starter-floor"];
    assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), expected, `${component.type}, enabled=${enabled}`);
    assert.deepEqual(collectChatgptSceneContext(bundle).starterEntityIds, expected);
    const context = { bundle, revision: 1, editorMode: "edit", importBusy: false, saveStatus: "saved", sceneSelection: null, assetSelection: null };
    assert.deepEqual(executeXriftMcpEditorTool(context, { id: "incoming-reference", tool: "get_editor_context", arguments: {} }).result.starterEntityIds, expected);
    controller.components.at(-1).entityReferences = ["starter-floor", "starter-box"];
    assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), []);
  }
});

test("Scene model links protect targets without mistaking Asset, property or prefab-local IDs for Scene references", () => {
  const bundle = blank();
  const controller = { ...structuredClone(bundle.scene.entities["starter-sun"]), id: "author-controller", name: "starter-box" };
  controller.components.push(
    { id: "author-script", type: "script", enabled: true, scriptAssetId: "starter-box", contractVersion: "1.0.0", runIn: "play", properties: { text: "starter-floor" }, assetReferences: ["starter-floor"], entityReferences: [] },
    { id: "author-prefab", type: "prefab-instance", enabled: true, prefabAssetId: "author-prefab-asset", sourceEntityId: "starter-box" },
  );
  bundle.scene.entities[controller.id] = controller;
  bundle.scene.rootEntityIds.push(controller.id);
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor", "starter-box"]);
  controller.modelNode = { modelEntityId: "starter-box", modelAssetId: "author-model", sourceNodeIndex: 0, nodeType: "mesh", sourceMaterialIndices: [], restPosition: [0, 0, 0], restRotation: [0, 0, 0], restScale: [1, 1, 1] };
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor"]);
});

test("explicit attachments take priority and authored scenery is never inferred disposable by appearance", () => {
  const bundle = blank();
  const copied = { ...structuredClone(bundle.scene.entities["starter-box"]), id: "author-box" };
  bundle.scene.entities[copied.id] = copied;
  bundle.scene.rootEntityIds.push(copied.id);
  assert.deepEqual(collectChatgptSceneContext(bundle, undefined, [], ["starter-box"]).starterEntityIds, ["starter-floor"]);
  assert.equal(collectChatgptSceneContext(bundle, undefined, [], ["starter-box", "starter-floor"]).starterEntityIds, undefined);
  assert.deepEqual(untouchedChatgptStarterEntityIds(bundle), ["starter-floor", "starter-box"]);
  const item = createStarterVisualProject("item", "basic-item", "starter-item-test");
  assert.deepEqual(untouchedChatgptStarterEntityIds(item), []);
});

test("Scene context never marks omitted props and respects its UTF-8 budget", () => {
  const bundle = blank();
  const template = structuredClone(bundle.scene.entities["starter-sun"]);
  const extra = Array.from({ length: 120 }, (_, index) => ({ ...structuredClone(template), id: `author-${index}`, name: `Author ${index}` }));
  bundle.scene.entities = Object.fromEntries([...extra, ...Object.values(bundle.scene.entities)].map(entity => [entity.id, entity]));
  const scene = collectChatgptSceneContext(bundle);
  assert.equal(scene.starterEntityIds, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(scene)) <= 14 * 1024);
  const withBox = collectChatgptSceneContext(bundle, "starter-box");
  assert.deepEqual(withBox.starterEntityIds, ["starter-box"]);
  assert.ok(Buffer.byteLength(JSON.stringify(withBox)) <= 14 * 1024);
});

test("immutable context persists verified starter IDs and rejects forged or contradictory locators", () => {
  const packet = buildChatgptHarnessContext(blank());
  assert.deepEqual(normalizeChatgptHarnessContext(JSON.parse(serializeChatgptHarnessContext(packet))).scene.starterEntityIds, ["starter-floor", "starter-box"]);
  for (const ids of [["starter-box", "starter-box"], ["starter-sun"], ["author-object"], ["starter-floor", "starter-box", "starter-sun"]]) {
    const changed = structuredClone(packet);
    changed.scene.starterEntityIds = ids;
    assert.throws(() => normalizeChatgptHarnessContext(reseal(changed)), /制作入力/);
  }
  const attached = structuredClone(packet);
  attached.scene.attachedEntityIds = ["starter-box"];
  assert.throws(() => normalizeChatgptHarnessContext(reseal(attached)), /制作入力/);
  const absent = structuredClone(packet);
  absent.scene.entities = absent.scene.entities.filter(entity => entity.id !== "starter-box");
  absent.omittedEntities.included--;
  absent.omittedEntities.count++;
  assert.throws(() => normalizeChatgptHarnessContext(reseal(absent)), /制作入力/);
  const legacy = structuredClone(packet);
  delete legacy.scene.starterEntityIds;
  assert.equal(normalizeChatgptHarnessContext(reseal(legacy)).scene.starterEntityIds, undefined);
});
