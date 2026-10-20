import test from "node:test";
import assert from "node:assert/strict";
import { Document, NodeIO } from "@gltf-transform/core";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-model-integrity-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = path => server.ssrLoadModule(`/src/lib/visual-editor/${path}.ts`);
const { assertBlenderModelSourceCurrent } = await load("chatgpt-model-integrity");
const { createBlenderModelSource, readBlenderEntityModelSource } = await load("chatgpt-model-source");
const { createAssetImportPlan, createModelReimportPlan, commitAssetImportPlan } = await load("asset-import");
const { createStarterVisualProject } = await load("starter-templates");
const { placeTestModel } = await server.ssrLoadModule("/scripts/fixtures/pi-authoring.mjs");
const { createBlenderModelAsset } = await load("chatgpt-modeling");
const { setEntityModel } = await load("model-assignment");
const { createEmptyEntity } = await load("editor-session");
const { createHierarchyTransfer, prepareHierarchyTransferFiles, planHierarchyImport } = await load("hierarchy-transfer");
const { assetManifestCodec, sceneDocumentCodec } = await load("serialization");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");

// A small real glTF binary exercises the ordinary analyzer, Material expansion,
// node hierarchy and source handling. Rendering quality is outside this suite.
const document = new Document();
const buffer = document.createBuffer();
const positions = document.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
const material = document.createMaterial("木の表面").setBaseColorFactor([0.4, 0.2, 0.1, 1]).setMetallicFactor(0).setRoughnessFactor(0.7);
const mesh = document.createMesh("表示する形状").addPrimitive(document.createPrimitive().setAttribute("POSITION", positions).setMaterial(material));
document.createScene().addChild(document.createNode("主な部品").setMesh(mesh).setTranslation([0.25, 0.5, 0]));
const modelBytes = await new NodeIO().writeBinary(document);
const spec = { name: "制作原本のあるモデル", parts: [{ id: "surface", name: "主な部品", shape: "mesh", position: [0.25, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: [0.4, 0.2, 0.1, 1], metallic: 0, roughness: 0.7,
  vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]] }] };

async function harness() {
  let bundle = createStarterVisualProject("world", "blank", "model-integrity-isolated");
  const disk = new Map();
  const plan = await createAssetImportPlan({ fileName: "integrity.glb", bytes: modelBytes, mimeType: "model/gltf-binary", existingManifest: bundle.assets });
  assert.equal(plan.canCommit, true, JSON.stringify(plan.diagnostics));
  assert.equal(plan.asset.kind, "model");
  const recipe = await createBlenderModelSource(spec, plan.sourceHash, { prompt: "木のモデルを作る", brief: "幅1mの三角形の部品" });
  plan.asset.authoring = recipe.authoring;
  plan.writes.push(recipe.write);
  bundle.assets = await commitAssetImportPlan(bundle.assets, plan, async request => {
    for (const write of request.writes) disk.set(write.relativePath, write.payload.encoding === "bytes" ? write.payload.bytes : new Uint8Array(await (await fetch(write.payload.dataUrl)).arrayBuffer()));
  });
  const placed = placeTestModel(bundle, plan.asset.id, spec.name, [2, 0, -3], [1, 1, 1]);
  bundle = placed.bundle;
  const rootId = placed.entityId;
  const generatedIds = Object.keys(bundle.scene.entities).filter(id => id.startsWith(`${rootId}-model-node-`));
  assert.ok(generatedIds.length);
  assert.ok(!bundle.scene.entities[rootId].components.some(component => component.type === "mesh"), "the ordinary static GLB path expands the root into source-node meshes");
  return { bundle, disk, rootId, modelId: plan.asset.id, generatedIds, source: recipe.source };
}

async function readSource(h, entityId = h.rootId) {
  const original = tauri.readTextFile;
  tauri.readTextFile = async (_project, path) => {
    assert.ok(h.disk.has(path), `unexpected source path ${path}`);
    return new TextDecoder().decode(h.disk.get(path));
  };
  try { return await readBlenderEntityModelSource(h.bundle, entityId, "isolated-memory-project"); }
  finally { tauri.readTextFile = original; }
}

test("the normal expanded Model can reload its exact source while root placement changes remain allowed", async () => {
  const h = await harness();
  const root = h.bundle.scene.entities[h.rootId];
  const transform = root.components.find(component => component.type === "transform");
  transform.position = [12, 0.2, -7]; transform.rotation = [0, Math.PI / 3, 0]; transform.scale = [1.4, 1.4, 1.4];
  const before = JSON.stringify(h.bundle);
  assert.doesNotThrow(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId));
  assert.deepEqual((await readSource(h)).source, h.source);
  assert.equal(JSON.stringify(h.bundle), before, "checking a source does not modify placement or model nodes");
});

test("an Inspector change to a generated child Transform stops recipe reuse before overwriting it", async () => {
  const h = await harness();
  const child = h.bundle.scene.entities[h.generatedIds[0]];
  const transform = child.components.find(component => component.type === "transform");
  transform.position[0] += 0.15;
  const before = JSON.stringify(h.bundle);
  assert.throws(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId), /手動編集/);
  await assert.rejects(readSource(h), /手動編集/);
  assert.equal(JSON.stringify(h.bundle), before);
});

test("per-node Material bindings and imported Material property overrides cannot silently disappear", async () => {
  for (const override of ["node-binding", "material-properties"]) {
    const h = await harness();
    const model = h.bundle.assets.assets[h.modelId];
    const materialId = model.materialSlots[0].defaultMaterialAssetId;
    assert.ok(materialId);
    const imported = h.bundle.assets.assets[materialId];
    assert.equal(imported.kind, "material");
    if (override === "node-binding") {
      const nodeMesh = h.generatedIds.flatMap(id => h.bundle.scene.entities[id].components).find(component => component.type === "mesh");
      h.bundle.assets.assets["manual-material"] = { ...structuredClone(imported), id: "manual-material", importedFromModel: undefined };
      nodeMesh.materialBindings[0].materialAssetId = "manual-material";
    } else {
      assert.ok(imported.importedFromModel);
      imported.properties.pbrMetallicRoughness.roughnessFactor = 0.2;
      imported.importedFromModel.isUserOverridden = true;
    }
    const before = JSON.stringify(h.bundle);
    assert.throws(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId), /手動編集/);
    await assert.rejects(readSource(h), /手動編集/);
    assert.equal(JSON.stringify(h.bundle), before);
  }
});

test("ordinary author-added children stay intact when the logical root becomes a direct Model mesh", async () => {
  const h = await harness();
  const added = createEmptyEntity(h.bundle.scene, h.rootId, "手動で付けた目印");
  assert.ok(added);
  h.bundle.scene = added.scene;
  const child = h.bundle.scene.entities[added.entityId];
  child.components.find(component => component.type === "transform").position = [3, 2, 1];
  const retainedChild = structuredClone(child);
  assert.doesNotThrow(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId));
  const changed = setEntityModel(h.bundle.scene, h.bundle.assets, h.rootId, h.modelId);
  assert.equal(changed.changed, true);
  h.bundle.scene = changed.scene;
  assert.deepEqual(h.bundle.scene.entities[added.entityId], retainedChild);
  assert.deepEqual(h.bundle.scene.entities[h.rootId].children, [added.entityId]);
  assert.ok(h.generatedIds.every(id => !h.bundle.scene.entities[id]));
  assert.doesNotThrow(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId));
  assert.deepEqual((await readSource(h)).source, h.source);
});

test("direct root Material bindings are protected after the ordinary replacement path", async () => {
  const h = await harness();
  h.bundle.scene = setEntityModel(h.bundle.scene, h.bundle.assets, h.rootId, h.modelId).scene;
  const rootMesh = h.bundle.scene.entities[h.rootId].components.find(component => component.type === "mesh");
  assert.ok(rootMesh.materialBindings.length);
  rootMesh.materialBindings[0].materialAssetId = "author-material";
  assert.throws(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId), /手動編集/);
});

test("custom or cleared Model Material defaults and stale import provenance stop recipe recreation", async () => {
  for (const override of ["custom-default", "cleared-default", "different-model", "different-source"]) {
    const h = await harness();
    const model = h.bundle.assets.assets[h.modelId];
    const slot = model.materialSlots[0];
    const imported = h.bundle.assets.assets[slot.defaultMaterialAssetId];
    if (override === "custom-default") {
      const custom = { ...structuredClone(imported), id: "custom-model-default", importedFromModel: undefined };
      h.bundle.assets.assets[custom.id] = custom;
      const old = slot.defaultMaterialAssetId;
      slot.defaultMaterialAssetId = custom.id;
      // Both the visible binding and the current slot point to the custom
      // Material: matching those alone would incorrectly accept the old recipe.
      for (const id of h.generatedIds) for (const component of h.bundle.scene.entities[id].components) {
        if (component.type === "mesh") for (const binding of component.materialBindings) if (binding.materialAssetId === old) binding.materialAssetId = custom.id;
      }
    } else if (override === "cleared-default") delete slot.defaultMaterialAssetId;
    else if (override === "different-model") imported.importedFromModel.modelAssetId = "some-other-model";
    else imported.importedFromModel.sourceHash = "f".repeat(64);
    assert.throws(() => assertBlenderModelSourceCurrent(h.bundle, h.rootId, h.modelId), /手動編集/);
    await assert.rejects(readSource(h), /手動編集/);
  }
});

test("transferred and reloaded fresh node/component IDs match canonical expansion and retain exact source", async () => {
  const h = await harness();
  const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(h.bundle, [h.rootId]), async path => {
    assert.ok(h.disk.has(path)); return h.disk.get(path);
  });
  const imported = planHierarchyImport(createStarterVisualProject("world", "blank", "model-integrity-transfer-isolated"), prepared);
  const assets = assetManifestCodec.parse(JSON.stringify(imported.bundle.assets));
  const scene = sceneDocumentCodec.parse(JSON.stringify(imported.bundle.scene));
  assert.equal(assets.ok, true, JSON.stringify(assets.issues));
  assert.equal(scene.ok, true, JSON.stringify(scene.issues));
  const reloaded = { ...h, bundle: { ...imported.bundle, assets: assets.document, scene: scene.document }, rootId: imported.rootEntityIds[0], modelId: imported.assetIdMap[h.modelId], disk: imported.files };
  assert.notEqual(reloaded.rootId, h.rootId);
  assert.notEqual(reloaded.modelId, h.modelId);
  assert.doesNotThrow(() => assertBlenderModelSourceCurrent(reloaded.bundle, reloaded.rootId, reloaded.modelId));
  assert.deepEqual((await readSource(reloaded)).source, h.source);
  const model = reloaded.bundle.assets.assets[reloaded.modelId];
  assert.match(model.authoring.sourcePath, /^assets\/imported\/hierarchy-/);
  const transferredMaterial = reloaded.bundle.assets.assets[model.materialSlots[0].defaultMaterialAssetId];
  assert.equal(transferredMaterial.importedFromModel.modelAssetId, model.id, "import provenance follows the new Model Asset ID");
  assert.equal(transferredMaterial.importedFromModel.sourceHash, model.sourceHash, "import provenance keeps the unchanged GLB hash");
  const generated = Object.values(reloaded.bundle.scene.entities).find(entity => entity.id.startsWith(`${reloaded.rootId}-model-node-`));
  assert.ok(generated);
  generated.components[0].id = "unrelated-component-id";
  assert.throws(() => assertBlenderModelSourceCurrent(reloaded.bundle, reloaded.rootId, reloaded.modelId), /手動編集/);
});

test("actual unchanged Model reimport retains the recipe and changed source bytes remain ineligible for old geometry reuse", async () => {
  const h = await harness();
  const originalModel = h.bundle.assets.assets[h.modelId];
  const unchanged = await createModelReimportPlan(originalModel, { fileName: "integrity.glb", bytes: modelBytes, mimeType: "model/gltf-binary" }, h.bundle.assets);
  assert.equal(unchanged.canCommit, true, JSON.stringify(unchanged.diagnostics));
  h.bundle.assets = await commitAssetImportPlan(h.bundle.assets, unchanged, async () => {});
  assert.deepEqual(h.bundle.assets.assets[h.modelId].authoring, originalModel.authoring, "the regular reimport path must preserve source provenance");
  assert.notEqual(h.bundle.assets.assets[h.modelId].authoring, originalModel.authoring, "new import plans own their metadata pointer");
  assert.deepEqual((await readSource(h)).source, h.source);
  const objectPlan = await createModelReimportPlan(originalModel, { fileName: "integrity.obj", bytes: new TextEncoder().encode("o Part\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), mimeType: "model/obj" }, h.bundle.assets);
  assert.equal(objectPlan.canCommit, true, JSON.stringify(objectPlan.diagnostics));
  assert.deepEqual(objectPlan.asset.authoring, originalModel.authoring, "OBJ conversion retains provenance so a different source cannot silently reuse old geometry");
  assert.notEqual(objectPlan.asset.authoring, originalModel.authoring);
  const changedDocument = await new NodeIO().readBinary(modelBytes);
  changedDocument.getRoot().listMaterials()[0].setRoughnessFactor(0.25);
  const changedBytes = await new NodeIO().writeBinary(changedDocument);
  const changed = await createModelReimportPlan(h.bundle.assets.assets[h.modelId], { fileName: "integrity.glb", bytes: changedBytes, mimeType: "model/gltf-binary" }, h.bundle.assets);
  assert.equal(changed.canCommit, true, JSON.stringify(changed.diagnostics));
  h.bundle.assets = await commitAssetImportPlan(h.bundle.assets, changed, async () => {});
  assert.deepEqual(h.bundle.assets.assets[h.modelId].authoring, originalModel.authoring, "the retained pointer detects a GLB that no longer matches its old recipe");
  assert.notEqual(h.bundle.assets.assets[h.modelId].sourceHash, h.source.modelSourceHash);
  await assert.rejects(readSource(h), /制作データ|手動編集/);
});

test("identical normalized geometry reuses the exact Asset and Scene without native work or a synthetic revision", async () => {
  const h = await harness();
  const before = JSON.stringify(h.bundle), originalRead = tauri.readTextFile, originalCreate = tauri.createBlenderModel;
  let nativeCalls = 0;
  tauri.readTextFile = async (_project, path) => new TextDecoder().decode(h.disk.get(path));
  tauri.createBlenderModel = async () => { nativeCalls++; throw new Error("unchanged geometry must not invoke Blender"); };
  try {
    const normalizedSame = { parts: h.source.spec.parts.map(part => ({ ...Object.fromEntries(Object.entries(part).reverse()), bevel: null })), name: h.source.spec.name };
    const reused = await createBlenderModelAsset(h.bundle, normalizedSame, "isolated-memory-project", { previousAssetId: h.modelId, prompt: "別の言い方で同じ形を依頼" });
    assert.equal(reused.bundle, h.bundle);
    assert.equal(reused.modelAssetId, h.modelId);
    h.bundle.assets.assets[h.modelId].sourceHash = "f".repeat(64);
    await assert.rejects(createBlenderModelAsset(h.bundle, normalizedSame, "isolated-memory-project", { previousAssetId: h.modelId }), /制作データ/);
    assert.equal(nativeCalls, 0, "stale source checks still run before the reuse path");
  } finally { tauri.readTextFile = originalRead; tauri.createBlenderModel = originalCreate; }
});

test("a late Blender result after Stop cannot read or commit model files", async () => {
  const h = await harness(), before = JSON.stringify(h.bundle);
  const originals = { readTextFile: tauri.readTextFile, createBlenderModel: tauri.createBlenderModel,
    readLocalModelImportSource: tauri.readLocalModelImportSource, commitVisualAssetImport: tauri.commitVisualAssetImport };
  let cancelled = false, sourceReads = 0, commits = 0, startNative, finishNative;
  const started = new Promise(resolve => { startNative = resolve; });
  const nativeResult = new Promise(resolve => { finishNative = resolve; });
  tauri.readTextFile = async (_project, path) => new TextDecoder().decode(h.disk.get(path));
  tauri.createBlenderModel = async (_path, _spec, generationId) => { assert.equal(generationId, "late-model-request"); startNative(); return nativeResult; };
  tauri.readLocalModelImportSource = async () => { sourceReads++; return { path: "isolated-memory-output.glb", fileName: "output.glb", byteLength: modelBytes.byteLength, mimeType: "model/gltf-binary", dataUrl: `data:model/gltf-binary;base64,${Buffer.from(modelBytes).toString("base64")}` }; };
  tauri.commitVisualAssetImport = async () => { commits++; };
  try {
    const changedSpec = structuredClone(h.source.spec);
    changedSpec.parts[0].position[1] += 0.1;
    const pending = createBlenderModelAsset(h.bundle, changedSpec, "isolated-memory-project", { previousAssetId: h.modelId },
      { generationId: "late-model-request", checkCurrent: () => { if (cancelled) throw new Error("isolated Stop"); } });
    await Promise.race([started, pending.then(() => { throw new Error("generation returned before the delayed native result"); })]);
    cancelled = true;
    const stopped = assert.rejects(pending, /isolated Stop/);
    finishNative({ path: "isolated-memory-output.glb", fileName: "output.glb", byteLength: modelBytes.byteLength });
    await stopped;
    assert.equal(sourceReads, 0);
    assert.equal(commits, 0);
    assert.equal(JSON.stringify(h.bundle), before);
  } finally { Object.assign(tauri, originals); }
});
