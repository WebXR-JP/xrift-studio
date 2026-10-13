import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-generation-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { createChatgptScaffold, placeChatgptObject, editChatgptEntity, rebaseChatgptStep } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-generation.ts");
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

test("one primitive at a time preserves existing entities and asset references and returns the new entity", () => {
  const steps = [
    object("地面", "plane", { scale: [12, 10, 1] }),
    object("ベンチ", "box", { position: [2, 0.5, 1], scale: [2, 1, 0.5], rotation: [0, 90, 0] }),
    object("球", "sphere", { position: [-2, 1, 0], scale: [2, 2, 2] }),
    object("柱", "cylinder", { position: [3, 2, 1], scale: [0.5, 4, 0.5] }),
    object("屋根", "cone", { position: [3, 4, 1], scale: [2, 1, 2] }),
    object("壁", "plane", { position: [0, 2, -4], scale: [4, 4, 1], rotation: [0, 0, 0] }),
  ];
  const original = JSON.stringify(steps);
  let bundle = createChatgptScaffold(plan, "primitive-steps");
  const scaffold = bundle;
  const ids = new Set();
  for (const [index, value] of steps.entries()) {
    const before = bundle;
    const snapshot = JSON.stringify(before);
    const result = placeChatgptObject(before, value, new Map());
    bundle = result.bundle;
    assert.equal(JSON.stringify(before), snapshot);
    assertPreserved(before, bundle);
    assert.equal(Object.keys(bundle.scene.entities).length, 2 + index + 1);
    assert.equal(ids.has(result.entityId), false);
    ids.add(result.entityId);
    const entity = bundle.scene.entities[result.entityId];
    assert.equal(entity.name, value.name);
    assert.equal(bundle.scene.rootEntityIds.includes(result.entityId), true);
    assert.deepEqual(transform(entity).position, value.position);
    assert.deepEqual(transform(entity).scale, value.scale);
    const expectedRotation = value.rotation ?? (value.shape === "plane" ? [-90, 0, 0] : [0, 0, 0]);
    assert.deepEqual(transform(entity).rotation, expectedRotation.map(n => n * Math.PI / 180));
    const renderer = mesh(entity);
    assert.equal(renderer.geometry.kind, "builtin-primitive");
    assert.equal(renderer.geometry.primitive, value.shape);
    for (const binding of renderer.materialBindings) assert.equal(bundle.assets.assets[binding.materialAssetId]?.kind, "material");
    assert.doesNotThrow(() => serialize(bundle));
  }
  assert.equal(Object.keys(scaffold.scene.entities).length, 2);
  assert.deepEqual(scaffold.assets.assets, {});
  const materials = Object.values(bundle.assets.assets).filter(asset => asset.kind === "material");
  assert.equal(materials.length, 1);
  assert.deepEqual(materials[0].properties.pbrMetallicRoughness, {
    baseColorFactor: [0.82, 0.84, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.65,
  });
  assert.equal(JSON.stringify(steps), original);
});

function importedScaffold() {
  let bundle = createChatgptScaffold(plan, "imported-steps");
  const imports = [
    { providerId: "poly-haven", providerName: "Poly Haven", externalId: "bench", name: "Bench", assetKind: "model", resolution: "1k", files: [{ role: "model", format: "gltf", relativePath: "assets/bench.gltf", byteLength: 1024, sha256: "a".repeat(64) }], authors: ["Artist"], assetUrl: "https://polyhaven.com/a/bench", licenseName: "CC0 1.0", licenseUrl: "https://polyhaven.com/license" },
    { providerId: "poly-haven", providerName: "Poly Haven", externalId: "wood", name: "Wood", assetKind: "texture", resolution: "1k", files: [{ role: "base-color", format: "jpg", relativePath: "assets/wood.jpg", byteLength: 10, sha256: "b".repeat(64) }, { role: "normal", format: "png", relativePath: "assets/normal.png", byteLength: 10, sha256: "c".repeat(64) }], authors: ["Artist"], assetUrl: "https://polyhaven.com/a/wood", licenseName: "CC0 1.0", licenseUrl: "https://polyhaven.com/license" },
    { providerId: "otogura", providerName: "音蔵", externalId: "birds", name: "Birds", assetKind: "audio", resolution: "src", files: [{ role: "audio", format: "wav", relativePath: "assets/birds.wav", byteLength: 10, sha256: "d".repeat(64) }], authors: ["音蔵"], assetUrl: "https://yushimatenjin.github.io/sound-generator/", licenseName: "Free to use", licenseUrl: "" },
  ];
  const assetIds = new Map();
  for (const install of imports) {
    const applied = applyExternalStoreInstall(bundle.assets, install);
    bundle = { ...bundle, assets: applied.manifest };
    assetIds.set(`${install.providerId}:${install.externalId}`, applied.primaryAssetId);
  }
  const modelId = assetIds.get("poly-haven:bench");
  // Model fixture is already analyzed, with its imported default material.
  const model = bundle.assets.assets[modelId];
  const defaultMaterialId = assetIds.get("poly-haven:wood");
  bundle = { ...bundle, assets: { ...bundle.assets, assets: { ...bundle.assets.assets, [modelId]: {
    ...model,
    materialSlots: [{ slot: "0", name: "Wood", sourceMaterialIndex: 0, defaultMaterialAssetId: defaultMaterialId }],
    importMetadata: { sourceFormat: "gltf", byteLength: 1024, nodeCount: 1, meshCount: 1, primitiveCount: 1,
      bounds: { min: [-1, 0, -0.5], max: [1, 1, 0.5], center: [0, 0.5, 0], size: [2, 1, 1], boundingSphereRadius: 1.225 },
      animations: [], extensionsUsed: [], extensionsRequired: [],
    },
  } } } };
  const gltfMaterialId = materialShowcaseAssetId("car-paint");
  bundle = { ...bundle, assets: { ...bundle.assets, assets: { ...bundle.assets.assets, [gltfMaterialId]: structuredClone(getMaterialShowcaseAsset(gltfMaterialId)) } } };
  return { bundle, assetIds, modelId, defaultMaterialId, gltfMaterialId };
}

test("sequential material, reused model, glTF material and audio placements retain normal Editor asset bindings", () => {
  const imported = importedScaffold();
  const steps = [
    object("木の床", "plane", { scale: [12, 12, 1], materialExternalId: "wood" }),
    object("ベンチA", "model", { externalId: "bench", position: [1, 0, 1], rotation: [0, 90, 0] }),
    object("ベンチB", "model", { externalId: "bench", position: [3, 0, 1] }),
    object("塗装の板", "box", { gltfMaterialId: imported.gltfMaterialId, position: [-1, 0.5, 1] }),
    object("鳥の声", "audio", { externalId: "birds" }),
  ];
  const inputSnapshot = JSON.stringify(imported.bundle);
  let bundle = imported.bundle;
  const newIds = [];
  for (const value of steps) {
    const before = bundle;
    const snapshot = JSON.stringify(before);
    const result = placeChatgptObject(before, value, imported.assetIds);
    bundle = result.bundle;
    newIds.push(result.entityId);
    assert.equal(JSON.stringify(before), snapshot);
    assertPreserved(before, bundle);
    assert.equal(bundle.scene.entities[result.entityId].name, value.name);
    assert.doesNotThrow(() => serialize(bundle));
  }
  assert.equal(Object.keys(bundle.scene.entities).length, 2 + steps.length);
  assert.deepEqual(Object.keys(bundle.assets.assets), Object.keys(imported.bundle.assets.assets));
  const [floor, benchA, benchB, painted, audio] = newIds.map(id => bundle.scene.entities[id]);
  assert.equal(transform(floor).rotation[0], -Math.PI / 2);
  assert.equal(mesh(floor).materialBindings[0].materialAssetId, imported.assetIds.get("poly-haven:wood"));
  const floorMaterial = bundle.assets.assets[imported.assetIds.get("poly-haven:wood")];
  assert.ok(floorMaterial.properties.pbrMetallicRoughness.baseColorTexture.textureAssetId);
  assert.ok(floorMaterial.properties.normalTexture.textureAssetId);
  for (const bench of [benchA, benchB]) {
    assert.equal(mesh(bench).geometryAssetId, imported.modelId);
    assert.deepEqual(mesh(bench).materialBindings, [{ slot: "0", materialAssetId: imported.defaultMaterialId }]);
  }
  assert.equal(transform(benchA).rotation[1], Math.PI / 2);
  assert.deepEqual(transform(benchB).rotation, [0, 0, 0]);
  assert.equal(Object.values(bundle.assets.assets).filter(a => a.kind === "model").length, 1);
  assert.equal(mesh(painted).materialBindings[0].materialAssetId, imported.gltfMaterialId);
  assert.ok(bundle.assets.assets[imported.gltfMaterialId].properties.extensions.KHR_materials_clearcoat);
  const source = audio.components.find(c => c.type === "audio-source");
  assert.equal(source.audioAssetId, imported.assetIds.get("otogura:birds"));
  assert.equal(source.spatial, false);
  assert.equal(source.loop, true);
  assert.equal(source.autoplay, true);
  assert.equal(source.volume, 0.35);
  assert.equal(bundle.assets.assets[source.audioAssetId].attribution.providerId, "otogura");
  assert.equal(JSON.stringify(imported.bundle), inputSnapshot);
});

test("missing and wrong-kind imports reject the whole object without changing an existing bundle", () => {
  const imported = importedScaffold();
  const bundle = imported.bundle;
  const snapshot = JSON.stringify(bundle);
  const cases = [
    [object("モデル", "model", { externalId: "bench" }), new Map()],
    [object("音", "audio", { externalId: "birds" }), new Map()],
    [object("モデル", "model", { externalId: "bench" }), new Map([["poly-haven:bench", "missing-model"]])],
    [object("音", "audio", { externalId: "birds" }), new Map([["otogura:birds", imported.modelId]])],
    [object("モデル", "model", { externalId: "bench" }), new Map([["poly-haven:bench", imported.assetIds.get("otogura:birds")]])],
    [object("床", "plane", { materialExternalId: "wood" }), new Map()],
    [object("床", "plane", { materialExternalId: "wood" }), new Map([["poly-haven:wood", "missing-material"]])],
    [object("床", "plane", { materialExternalId: "wood" }), new Map([["poly-haven:wood", imported.modelId]])],
    [object("板", "box", { gltfMaterialId: "missing-gltf-material" }), new Map()],
  ];
  for (const [value, mapping] of cases) {
    assert.throws(() => placeChatgptObject(bundle, value, mapping));
    assert.equal(JSON.stringify(bundle), snapshot);
  }
  const valid = placeChatgptObject(bundle, object("再試行した床", "plane", { materialExternalId: "wood" }), imported.assetIds);
  assert.equal(Object.keys(valid.bundle.scene.entities).length, 3);
  assert.equal(valid.bundle.scene.entities[valid.entityId].name, "再試行した床");
  assertPreserved(bundle, valid.bundle);
});
