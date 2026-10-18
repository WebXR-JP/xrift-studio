import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-mcp-code-authoring-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { applyMcpR3fScene, rebaseMcpR3fOutcome } = await load("mcp-code-authoring");
const { isDerivedMcpDocumentUpdate, isMcpDerivedRevisionCurrent } = await load("mcp-derived-update");
const { executeXriftMcpEditorTool, XriftMcpEditorToolError } = await load("mcp-editor-tools");
const { createStarterVisualProject } = await load("starter-templates");
const { isAuthoringWriteTool } = await load("world-authoring");
const { runXriftMcpEditorToolFixtures } = await load("mcp-editor-tools.fixture");
const context = bundle => ({ bundle: bundle ?? createStarterVisualProject("world", "blank", "mcp-code-fixture"), revision: 7, editorMode: "edit", importBusy: false, saveStatus: "saved", sceneSelection: null, assetSelection: null });
const source = (height = 2) => `export default function Park(){return <group name="Park"><mesh name="Shelter" key="shelter"><boxGeometry args={[3,${height},3]}/><meshStandardMaterial color="#987450"/></mesh><mesh name="Lawn" key="lawn" position={[0,-0.1,0]}><boxGeometry args={[24,0.2,24]}/><meshStandardMaterial color="#70a056"/></mesh></group>}`;
const args = (ctx, extra = {}) => ({ projectId: ctx.bundle.project.projectId, sceneId: ctx.bundle.scene.sceneId, expectedRevision: ctx.revision, name: "公園", source: source(), ...extra });
const read = (ctx, tool, parameters = {}) => executeXriftMcpEditorTool(ctx, { id: "read", tool, arguments: parameters });
const apply = (ctx, extra = {}, check = () => {}) => applyMcpR3fScene(ctx, args(ctx, extra), check);

test("registry routes source writes through the finite run and keeps existing document tools coherent", () => {
  assert.equal(isAuthoringWriteTool("apply_r3f_scene"), true);
  assert.equal(isAuthoringWriteTool("get_world_authoring_guide"), false);
  runXriftMcpEditorToolFixtures();
});

test("guide returns only the requested route and never adds it to every editor context", () => {
  const ctx = context(), overview = read(ctx, "get_world_authoring_guide");
  assert.equal(overview.changed, false); assert.equal(overview.result.topic, "overview");
  assert.ok(overview.result.core.length); assert.ok(overview.result.routes.r3f.summary);
  assert.equal(overview.result.routes.r3f.instructions, undefined);
  const route = read(ctx, "get_world_authoring_guide", { topic: "r3f" }).result;
  assert.ok(route.route.instructions.length); assert.equal(route.core, undefined); assert.equal(route.routes, undefined);
  assert.equal(read(ctx, "get_editor_context").result.worldAuthoringGuide, undefined);
  assert.throws(() => read(ctx, "get_world_authoring_guide", { topic: "unknown" }), /topic/);
});

test("MCP creates one retained source root and exposes its complete original without merge baselines", async () => {
  const ctx = context(), before = JSON.stringify(ctx.bundle), result = await apply(ctx, { entityId: null });
  assert.equal(JSON.stringify(ctx.bundle), before); assert.equal(result.changed, true);
  assert.equal(result.result.revisionAfter, 8); assert.equal(result.result.sourceRevision, 1);
  const original = read(context(result.bundle), "get_entity_components", { entityId: result.result.entityId }).result.r3fAuthoring;
  assert.deepEqual(original, { version: 1, revision: 1, source: source() });
  assert.equal(original.nodes, undefined);
});

test("MCP revisions retain entity IDs, manual transforms and unchanged roots", async () => {
  const first = await apply(context());
  const ctx = context(first.bundle), rootId = first.result.entityId;
  const root = ctx.bundle.scene.entities[rootId], ids = Object.values(root.codeAuthoring.nodes).map(node => node.entityId);
  const shelter = ids.find(id => ctx.bundle.scene.entities[id].name === "Shelter");
  ctx.bundle.scene.entities[shelter].components.find(component => component.type === "transform").position = [6, 0, 0];
  const edited = await apply(ctx, { source: source(4), entityId: rootId });
  assert.equal(edited.result.entityId, rootId);
  assert.deepEqual(Object.values(edited.bundle.scene.entities[rootId].codeAuthoring.nodes).map(node => node.entityId), ids);
  const transform = edited.bundle.scene.entities[shelter].components.find(component => component.type === "transform");
  assert.deepEqual(transform.position, [6, 0, 0]); assert.deepEqual(transform.scale, [3, 4, 3]);
  const noOp = await apply(context(edited.bundle), { source: source(4), entityId: rootId });
  assert.equal(noOp.changed, false); assert.equal(noOp.bundle, edited.bundle); assert.equal(noOp.result.revisionAfter, 7);
});

test("invalid source and deletion of a manually edited generated part preserve the whole Scene", async () => {
  const first = await apply(context()), ctx = context(first.bundle), rootId = first.result.entityId;
  const shelter = Object.values(ctx.bundle.scene.entities[rootId].codeAuthoring.nodes).find(node => JSON.parse(node.baseline).name === "Shelter").entityId;
  ctx.bundle.scene.entities[shelter].name = "手動で編集した休憩所";
  const before = JSON.stringify(ctx.bundle);
  await assert.rejects(() => apply(ctx, { entityId: rootId, source: "export default function Park(){return <Canvas/>}" }), error => error.code === "R3F_SOURCE_INVALID");
  const missing = source().replace(/<mesh name="Shelter"[\s\S]*?<\/mesh>/, "");
  await assert.rejects(() => apply(ctx, { entityId: rootId, source: missing }), error => error.code === "R3F_EDIT_CONFLICT");
  assert.equal(JSON.stringify(ctx.bundle), before);
});

test("source conversion enforces scope/revision/edit mode before work and rechecks the lease after await", async () => {
  const ctx = context(), before = JSON.stringify(ctx.bundle);
  for (const [patch, code] of [[{ expectedRevision: 6 }, "STALE_REVISION"], [{ sceneId: "different" }, "SCENE_MISMATCH"], [{ projectId: "different" }, "PROJECT_MISMATCH"]]) {
    await assert.rejects(() => apply(ctx, patch), error => error.code === code);
  }
  await assert.rejects(() => apply({ ...ctx, editorMode: "play" }), error => error.code === "EDITOR_READ_ONLY");
  await assert.rejects(() => apply({ ...ctx, importBusy: true }), error => error.code === "EDITOR_BUSY");
  let checks = 0;
  await assert.rejects(() => apply(ctx, {}, () => { if (++checks >= 3) throw new XriftMcpEditorToolError("STALE_REVISION", "cancelled or edited"); }), error => error.code === "STALE_REVISION");
  assert.equal(JSON.stringify(ctx.bundle), before);
});

test("async source leases permit only observed thumbnail/timestamp revisions, not authored edits or explicit invalidation", async () => {
  const first = await apply(context()), before = first.bundle, derived = structuredClone(before);
  const materialId = Object.keys(before.scene.entities[first.result.entityId].codeAuthoring.materials)[0];
  derived.assets.assets[materialId].thumbnail = { status: "generated", derivedPath: "Cache/material.png", sourceHash: "material-hash", rendererVersion: "test" };
  derived.project.metadata.updatedAt = "2026-10-18T12:00:00.000Z";
  assert.equal(isDerivedMcpDocumentUpdate(before, derived), true);
  assert.equal(isMcpDerivedRevisionCurrent(before, derived, 7, 8, 2, 3), true);
  assert.equal(isMcpDerivedRevisionCurrent(before, derived, 7, 9, 2, 3), false, "cancel/Script source invalidation is not credited as a derived revision");
  assert.equal(isMcpDerivedRevisionCurrent(before, before, 7, 9, 2, 2), false, "manual edit followed by Undo still invalidates the lease");
  for (const mutate of [value => value.project.metadata.name = "manual title", value => value.project.projectId = "other-project", value => value.scene.name = "manual scene", value => value.assets.assets[materialId].properties.pbrMetallicRoughness.roughnessFactor = 0.11,
    value => value.scene.entities[first.result.entityId].name = "manual entity", value => value.assets.folders = { manual: { id: "manual", name: "folder", parentId: null, order: 0 } }]) {
    const manual = structuredClone(derived); mutate(manual);
    assert.equal(isDerivedMcpDocumentUpdate(before, manual), false);
    assert.equal(isMcpDerivedRevisionCurrent(before, manual, 7, 8, 2, 3), false);
  }
});

test("a derived update during async conversion is retained on commit and invalid source still reports its diagnostic", async () => {
  const first = await apply(context()), ctx = context(first.bundle), entityId = first.result.entityId;
  const materialId = Object.keys(ctx.bundle.scene.entities[entityId].codeAuthoring.materials)[0];
  const thumbnail = { status: "generated", derivedPath: "Cache/fresh.png", sourceHash: "current-hash", rendererVersion: "test" };
  let latest = ctx.bundle, revision = ctx.revision, derived = 0, checks = 0;
  const check = () => {
    if (++checks === 3) { latest = structuredClone(ctx.bundle); latest.assets.assets[materialId].thumbnail = thumbnail; latest.project.metadata.updatedAt = "2026-10-18T12:00:00.000Z"; revision++; derived++; }
    assert.equal(isMcpDerivedRevisionCurrent(ctx.bundle, latest, ctx.revision, revision, 0, derived), true);
  };
  const generated = await apply(ctx, { entityId, source: source(4) }, check);
  const merged = rebaseMcpR3fOutcome(ctx, generated, latest, revision);
  assert.deepEqual(merged.bundle.assets.assets[materialId].thumbnail, thumbnail);
  assert.equal(merged.bundle.project.metadata.updatedAt, latest.project.metadata.updatedAt);
  assert.equal(merged.result.revisionBefore, revision); assert.equal(merged.result.revisionAfter, revision + 1);
  checks = 0; latest = ctx.bundle; revision = ctx.revision; derived = 0;
  await assert.rejects(() => apply(ctx, { entityId, source: "export default function Park(){return <Canvas/>}" }, check), error => error.code === "R3F_SOURCE_INVALID");
  const noOp = await apply(ctx, { entityId });
  const retained = rebaseMcpR3fOutcome(ctx, noOp, latest, revision);
  assert.equal(retained.changed, false); assert.equal(retained.bundle, latest);
});
