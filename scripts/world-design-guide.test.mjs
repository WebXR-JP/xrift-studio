import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-world-design-guide-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { executeXriftMcpEditorTool: execute } = await load("mcp-editor-tools");
const { createPrototypeProject } = await load("prototype-project");
const { applyChatgptR3fScene: apply } = await load("chatgpt-code-authoring");
const { analyzeComponentCode: analyze } = await load("component-code-import");
const { sceneDocumentCodec } = await load("serialization");
const { compileVisualProject } = await load("compiler/compile");
const guide = JSON.parse(await readFile(new URL("../src/lib/visual-editor/world-authoring-guide.json", import.meta.url), "utf8"));
const context = bundle => ({ bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 1, saveStatus: "saved" });
const request = (tool, args) => ({ id: "design-fixture", tool, arguments: args });

test("design topics are discoverable, read-only and fetched separately from production routes", () => {
  const ctx = context(createPrototypeProject("world", "design-isolated-fixture"));
  const overview = execute(ctx, request("get_world_authoring_guide", {}));
  assert.equal(overview.changed, false);
  assert.equal(overview.bundle, ctx.bundle);
  assert.equal(overview.result.design["spatial-ui"].summary, guide.design["spatial-ui"].summary);
  assert.equal(overview.result.design["spatial-ui"].exampleSource, undefined);
  for (const topic of ["spatial-ui", "environment"]) {
    const result = execute(ctx, request("get_world_authoring_guide", { topic }));
    assert.deepEqual(result.result.design, guide.design[topic]);
    assert.equal(result.result.route, undefined);
    result.result.design.instructions[0] = "changed caller copy";
    assert.notEqual(execute(ctx, request("get_world_authoring_guide", { topic })).result.design.instructions[0], "changed caller copy");
  }
  assert.ok(execute(ctx, request("get_world_authoring_guide", { topic: "r3f" })).result.route.instructions.length);
  assert.throws(() => execute(ctx, request("get_world_authoring_guide", { topic: "unknown" })), /topic/);
});

test("spatial card example imports, persists, compiles and revises with its typography intact", async () => {
  const initial = createPrototypeProject("world", "cards-isolated-fixture");
  const source = guide.design["spatial-ui"].exampleSource;
  const one = await apply(initial, { kind: "r3f-scene", name: "Learning Stations", source });
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(one.bundle.scene));
  assert.equal(decoded.ok, true);
  const texts = Object.values(decoded.document.entities).flatMap(entity => entity.components.filter(component => component.type === "text"));
  assert.equal(texts.length, 9);
  assert.equal(texts.filter(text => text.fontWeight === 700).length, 3);
  assert.equal(texts.filter(text => text.lineHeight === 1.45 && text.textAlign === "left").length, 3);
  assert.equal(texts.filter(text => text.letterSpacing === 0.06).length, 3);
  assert.ok(texts.every(text => text.maxWidth === 1.54 && text.anchorX === "left" && text.anchorY === "top"));
  assert.equal(texts.filter(text => text.text.includes("\n")).length, 3);
  const compiled = compileVisualProject({ project: one.bundle.project, scenes: { [decoded.document.sceneId]: decoded.document }, assets: one.bundle.assets, prefabs: one.bundle.prefabs }, { generatedAt: "2026-10-23T00:00:00.000Z" });
  assert.equal(compiled.canStage, true, JSON.stringify(compiled.diagnostics));
  const world = compiled.overlayFiles.find(file => file.relativePath === "src/World.tsx").content;
  assert.ok(world.includes("<XriftTextPanel"));
  for (const field of ['"fontWeight":700', '"lineHeight":1.45', '"textAlign":"left"', '"letterSpacing":0.06']) assert.ok(world.includes(field), field);
  const two = await apply({ ...one.bundle, scene: decoded.document }, { kind: "r3f-scene", name: "Learning Stations", source: source.replace('lineHeight={1.45}', 'lineHeight={1.5}'), entityId: one.entityId });
  assert.equal(two.entityId, one.entityId);
  assert.deepEqual(Object.keys(two.bundle.scene.entities).sort(), Object.keys(one.bundle.scene.entities).sort());
  assert.equal(Object.values(two.bundle.scene.entities).flatMap(entity => entity.components).filter(component => component.type === "text" && component.lineHeight === 1.5).length, 3);
});

test("invalid typography and unsupported UIKit fail without a partial Scene edit", async () => {
  const initial = createPrototypeProject("world", "invalid-type-isolated-fixture");
  const before = JSON.stringify(initial);
  for (const props of ['fontWeight={0}', 'fontWeight={700.5}', 'textAlign="middle"', 'textAlign={["left"]}', 'lineHeight={0}', 'letterSpacing="wide"']) {
    const source = `import { Text } from '@react-three/drei'; export default function World(){ return <Text name="Label" ${props}>文字</Text>; }`;
    await assert.rejects(apply(initial, { kind: "r3f-scene", name: "Invalid", source }));
    const plan = analyze(source, "world");
    const text = plan.nodes.find(node => node.kind === "text").text;
    for (const field of ["fontWeight", "textAlign", "lineHeight", "letterSpacing"]) assert.equal(text[field], undefined);
    assert.equal(JSON.stringify(initial), before);
  }
  await assert.rejects(apply(initial, { kind: "r3f-scene", name: "Unsupported", source: "import { Container } from '@react-three/uikit'; export default function World(){ return <Container />; }" }));
});

test("AI can enable ambient light independently of Skybox and reject invalid switches atomically", () => {
  const initial = createPrototypeProject("world", "environment-isolated-fixture");
  const before = JSON.stringify(initial);
  const ctx = context(initial);
  const scope = { projectId: initial.project.projectId, sceneId: initial.scene.sceneId, expectedRevision: 1 };
  const enabled = execute(ctx, request("update_scene_settings", { ...scope, ambient: { enabled: true, intensity: 0.4, color: "#ddeeff" }, skybox: { enabled: true, topColor: "#739ab5", bottomColor: "#e6eef1" } }));
  assert.equal(enabled.changed, true);
  assert.deepEqual(enabled.bundle.scene.settings.ambient, { enabled: true, intensity: 0.4, color: "#ddeeff" });
  assert.equal(enabled.bundle.scene.settings.skybox.iblEnabled, false);
  const disabled = execute(context(enabled.bundle), request("update_scene_settings", { ...scope, ambient: { enabled: false } }));
  assert.equal(disabled.bundle.scene.settings.ambient.enabled, false);
  assert.equal(disabled.bundle.scene.settings.ambient.intensity, 0.4);
  assert.throws(() => execute(ctx, request("update_scene_settings", { ...scope, ambient: { enabled: "yes" } })), /ambient.enabled/);
  assert.equal(JSON.stringify(initial), before);
});
