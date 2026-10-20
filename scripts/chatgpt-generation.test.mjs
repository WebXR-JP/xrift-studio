import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-generation-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { rebaseChatgptStep } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-generation.ts");
const { createChatgptScaffold, editChatgptEntity } = await server.ssrLoadModule("/scripts/fixtures/pi-authoring.mjs");
const { applyExternalStoreInstall } = await server.ssrLoadModule("/src/lib/visual-editor/external-store.ts");
const { serializeVisualProjectDocuments } = await server.ssrLoadModule("/src/lib/visual-editor/persistence.ts");
const { getMaterialShowcaseAsset, materialShowcaseAssetId } = await server.ssrLoadModule("/src/lib/visual-editor/material-showcase-catalog.ts");
test.after(() => server.close());

test("async Scene step retains concurrent thumbnails and metadata but refuses manual Scene edits", () => {
  const before = createChatgptScaffold({ title: "", description: "", objects: [] }, "async-world");
  const entity = Object.values(before.scene.entities)[0];
  const next = editChatgptEntity(before, { entityId: entity.id, name: "変更後" }).bundle;
  const latest = { ...before, project: { ...before.project, metadata: { ...before.project.metadata, title: "作品名" } }, assets: { ...before.assets, assets: { other: { id: "other", kind: "material", thumbnail: { status: "generated" } } } } };
  const merged = rebaseChatgptStep(before, next, latest);
  assert.equal(merged.scene.entities[entity.id].name, "変更後");
  assert.equal(merged.assets.assets.other, latest.assets.assets.other);
  assert.equal(merged.project, latest.project);
  const edited = editChatgptEntity(latest, { entityId: entity.id, position: [5, 6, 7] }).bundle;
  assert.throws(() => rebaseChatgptStep(before, next, edited), /編集内容を保ち/);
});

test("asset-only async step retains manual Scene edits, but cannot cross Scene or project boundaries", () => {
  const before = createChatgptScaffold({ title: "", description: "", objects: [] }, "async-assets");
  const entity = Object.values(before.scene.entities)[0];
  const next = { ...before, assets: { ...before.assets, assets: { imported: { id: "imported", kind: "material" } } } };
  const latest = editChatgptEntity(before, { entityId: entity.id, position: [5, 6, 7] }).bundle;
  const merged = rebaseChatgptStep(before, next, latest);
  assert.equal(merged.scene, latest.scene);
  assert.equal(merged.assets.assets.imported, next.assets.assets.imported);
  assert.throws(() => rebaseChatgptStep(before, next, { ...latest, scene: { ...latest.scene, sceneId: "other" } }));
  assert.throws(() => rebaseChatgptStep(before, next, { ...latest, project: { ...latest.project, projectId: "other" } }));
});
test("assistant edits preserve project, Entity identity, Components, Assets and the immutable source", () => {
  const before = createChatgptScaffold({ title: "編集", description: "", objects: [] }, "editing-world");
  const entity = Object.values(before.scene.entities).find(e => e.components.some(c => c.type === "light"));
  const original = JSON.stringify(before);
  const changed = editChatgptEntity(before, { entityId: entity.id, name: "調整したLight", position: [2,3,4], rotation: [0,90,0] });
  assert.equal(changed.entityId, entity.id);
  assert.equal(changed.bundle.project.projectId, before.project.projectId);
  assert.equal(changed.bundle.project.metadata.title, before.project.metadata.title);
  assert.equal(changed.bundle.project.metadata.name, before.project.metadata.name);
  assert.equal(changed.bundle.assets, before.assets);
  assert.equal(changed.bundle.scene.sceneId, before.scene.sceneId);
  const updated = changed.bundle.scene.entities[entity.id];
  assert.equal(updated.name, "調整したLight");
  assert.equal(updated.components.find(c => c.type === "light"), entity.components.find(c => c.type === "light"));
  assert.deepEqual(transform(updated).position, [2,3,4]);
  assert.deepEqual(transform(updated).rotation, [0, Math.PI/2, 0]);
  assert.deepEqual(transform(updated).scale, transform(entity).scale);
  assert.equal(Object.keys(changed.bundle.scene.entities).length, Object.keys(before.scene.entities).length);
  assert.equal(JSON.stringify(before), original);
  assert.doesNotThrow(() => serialize(changed.bundle));
  assert.throws(() => editChatgptEntity(before, { entityId: "foreign-id", position: [0,0,0] }));
});

const plan = { title: "段階的に作る公園", description: "地面から順番にベンチと音を配置する", objects: [] };
const object = (name, shape, extra = {}) => ({ name, shape, position: [0, 0, 0], scale: [1, 1, 1], ...extra });
const transform = entity => entity.components.find(c => c.type === "transform");
const mesh = entity => entity.components.find(c => c.type === "mesh");
const serialize = bundle => serializeVisualProjectDocuments({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs });

function assertPreserved(before, after) {
  assert.equal(after.project.projectId, before.project.projectId);
  assert.equal(after.scene.sceneId, before.scene.sceneId);
  for (const [id, entity] of Object.entries(before.scene.entities)) assert.equal(after.scene.entities[id], entity);
  for (const [id, asset] of Object.entries(before.assets.assets)) assert.equal(after.assets.assets[id], asset);
}

test("new scaffold keeps only Light and SpawnPoint, no unused starter assets, and separate project identity", () => {
  const source = JSON.stringify(plan);
  const first = createChatgptScaffold(plan, "incremental-world-a");
  const second = createChatgptScaffold(plan, "incremental-world-b");
  assert.notEqual(first.project.projectId, second.project.projectId);
  assert.equal(first.project.metadata.title, plan.title);
  assert.equal(first.project.metadata.description, plan.description);
  const entities = Object.values(first.scene.entities);
  assert.deepEqual(entities.map(entity => entity.name).sort(), ["Light", "SpawnPoint"]);
  assert.equal(entities.some(entity => entity.components.some(c => c.type === "mesh")), false);
  assert.equal(entities.some(entity => entity.components.some(c => c.type === "light")), true);
  assert.equal(entities.find(entity => entity.name === "SpawnPoint").components.some(c => c.type === "xrift-component"), true);
  assert.deepEqual(new Set(first.scene.rootEntityIds), new Set(entities.map(entity => entity.id)));
  assert.deepEqual(first.assets.assets, {});
  assert.deepEqual(first.prefabs, {});
  assert.deepEqual(first.bundledAssetCopies, []);
  assert.doesNotThrow(() => serialize(first));
  assert.equal(JSON.stringify(plan), source);
});
