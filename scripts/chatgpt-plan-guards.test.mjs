import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-plan-guards-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { chatgptPlanSnapshots, assertChatgptPlanCurrent } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-plan-guards.ts");
const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");

function fixture() {
  const bundle = createStarterVisualProject("world", "blank", "plan-guards-isolated-fixture");
  for (const kind of ["model", "material", "audio"]) bundle.assets.assets[kind] = { id: kind, kind, name: kind, status: "ready" };
  return bundle;
}
const object = { name: "追加するEntity", shape: "box", position: [0, 0, 0], scale: [1, 1, 1] };
const planWith = objects => ({ title: "素材を配置", description: "既存の素材を再利用", objects });

for (const [kind, placement] of [
  ["model", { ...object, shape: "model", externalId: "project:model" }],
  ["audio", { ...object, shape: "audio", externalId: "project:audio" }],
  ["material", { ...object, materialExternalId: "project:material" }],
]) {
  test(`placing a project ${kind} refuses authored asset changes or removal after planning`, () => {
    const bundle = fixture(), plan = planWith([placement]);
    const snapshots = chatgptPlanSnapshots(bundle, plan);
    assert.ok(snapshots[`asset:${kind}`]);
    for (const change of [
      asset => { asset.name = "手動で変更した素材"; },
      asset => { asset.status = "missing"; },
      asset => { asset.source = { type: "file", relativePath: "changed-fixture-file" }; },
    ]) {
      const current = structuredClone(bundle);
      change(current.assets.assets[kind]);
      assert.throws(() => assertChatgptPlanCurrent(current, plan, snapshots), /Planの作成後/);
    }
    const deleted = structuredClone(bundle);
    delete deleted.assets.assets[kind];
    assert.throws(() => assertChatgptPlanCurrent(deleted, plan, snapshots), /Planの作成後/);
  });
}

test("all reused placement assets are protected while unrelated edits and derived thumbnails remain allowed", () => {
  const bundle = fixture(), plan = planWith([
    { ...object, shape: "model", externalId: "project:model", materialExternalId: "project:material" },
    { ...object, shape: "model", externalId: "project:model" },
    { ...object, shape: "model", externalId: "poly-haven:remote-model" },
  ]);
  const snapshots = chatgptPlanSnapshots(bundle, plan);
  assert.deepEqual(Object.keys(snapshots).sort(), ["asset:material", "asset:model"]);
  const current = structuredClone(bundle);
  current.assets.assets.model.thumbnail = { status: "generated" };
  current.assets.assets.material.thumbnail = { status: "generated" };
  current.assets.assets.audio.name = "配置しない素材の編集";
  current.project.metadata.title = "作品名の変更";
  Object.values(current.scene.entities)[0].name = "配置Planと関係のないEntity";
  assert.doesNotThrow(() => assertChatgptPlanCurrent(current, plan, snapshots));
});

test("placement and operation references share protection for the same authored asset", () => {
  const bundle = fixture(), entityId = Object.keys(bundle.scene.entities)[0];
  const plan = { ...planWith([{ ...object, materialExternalId: "project:material" }]), operations: [
    { kind: "material", entityId, candidateId: "project:material" },
  ] };
  const snapshots = chatgptPlanSnapshots(bundle, plan);
  assert.deepEqual(Object.keys(snapshots).sort(), ["asset:material", `entity:${entityId}`].sort());
  const current = structuredClone(bundle);
  current.assets.assets.material.name = "手動で変更した素材";
  assert.throws(() => assertChatgptPlanCurrent(current, plan, snapshots), /Planの作成後/);
});
