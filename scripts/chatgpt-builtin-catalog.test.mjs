import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-builtin-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const load = path => server.ssrLoadModule(`/src/lib/visual-editor/${path}.ts`);
const { listChatgptBuiltinCandidates: list, applyChatgptBuiltinOperation: apply } = await load("chatgpt-builtin-catalog");
const { createStarterVisualProject } = await load("starter-templates");
const { getTransform, getMesh, getTerrainGeometry, getPrimaryMaterialAssetId, createBuiltinPrimitiveMeshComponent } = await load("scene-document");
const { getBuiltinPrimitiveCreation, BUILTIN_PRIMITIVE_CREATION_IDS } = await load("creation-catalog");
const { SKY_SHADER_CATALOG } = await load("sky-shader-catalog");
const { WATER_SHADER_CATALOG } = await load("water-shader-catalog");
const { PARTICLE_AUTHORING_PRESETS } = await load("particle-system");
const { getSceneRecipesForProjectKind } = await load("scene-recipe-catalog");
const { catalogMaterialTextures } = await load("catalog-material-dependencies");
const { serializeVisualProjectDocuments, parseVisualProjectFiles } = await load("persistence");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const original = { fetch: globalThis.fetch, commit: tauri.commitVisualAssetImport, write: tauri.writeTextFile, FileReader: globalThis.FileReader, ProgressEvent: globalThis.ProgressEvent };
globalThis.FileReader ??= class FileReader extends EventTarget {
  readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.dispatchEvent(new Event("load")); }, error => { this.error = error; this.dispatchEvent(new Event("error")); }); }
};
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, init) { Object.assign(this, { type }, init); } };
const publicRoot = resolve("public");
let writes = [], requests = [], rejectWrites = false, corruptBytes = false;
globalThis.fetch = async request => {
  const url = new URL(typeof request === "string" ? request : request.url, "https://fixture.invalid");
  assert.equal(url.origin, "https://fixture.invalid", "Only shipped, local catalog bytes may be read");
  const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
  assert.ok(!relative(publicRoot, path).startsWith(".."));
  const bytes = await readFile(path);
  requests.push(url.pathname);
  if (corruptBytes) bytes[bytes.length - 1] ^= 1;
  return new Response(bytes, { status: 200 });
};
tauri.commitVisualAssetImport = async (projectPath, transactionId, entries) => {
  assert.equal(projectPath, "isolated-builtin-test");
  assert.ok(transactionId);
  if (rejectWrites) throw new Error("isolated persistence failure");
  for (const entry of entries) {
    assert.ok(!entry.relativePath.startsWith("/") && !entry.relativePath.split("/").includes(".."));
    const bytes = Buffer.from(entry.dataUrl.split(",")[1], "base64");
    assert.ok(bytes.length > 0);
    writes.push({ ...entry, bytes });
  }
};
tauri.writeTextFile = async (projectPath, relativePath, content) => {
  assert.equal(projectPath, "isolated-builtin-test");
  if (rejectWrites) throw new Error("isolated persistence failure");
  writes.push({ relativePath, content });
};
test.beforeEach(() => { writes = []; requests = []; rejectWrites = false; corruptBytes = false; });
test.after(async () => {
  globalThis.fetch = original.fetch;
  tauri.commitVisualAssetImport = original.commit;
  tauri.writeTextFile = original.write;
  globalThis.FileReader = original.FileReader;
  globalThis.ProgressEvent = original.ProgressEvent;
  await server.close();
});

const starter = () => createStarterVisualProject("world", "blank", "builtin-catalog-test");
const candidate = (provider, predicate = () => true) => {
  const found = list().find(item => item.providerId === provider && predicate(item));
  assert.ok(found, `Missing trusted candidate from ${provider}`);
  return found.candidateId;
};
const catalog = (id, extra = {}) => ({ kind: "catalog", candidateId: id, position: [3, 1, -2], ...extra });
const applyTo = (bundle, operation) => apply(bundle, operation, "isolated-builtin-test");
function validDocuments(bundle) {
  const documents = { project: bundle.project, assets: bundle.assets, scenes: { [bundle.scene.sceneId]: bundle.scene }, prefabs: bundle.prefabs };
  const serialized = serializeVisualProjectDocuments(documents);
  const parsed = parseVisualProjectFiles(serialized);
  assert.equal(parsed.project.projectId, bundle.project.projectId);
  assert.deepEqual(parsed.scenes[bundle.scene.sceneId].entities, JSON.parse(JSON.stringify(bundle.scene.entities)));
  return serialized;
}
function targetMesh(bundle) {
  return Object.values(bundle.scene.entities).find(entity => getMesh(entity));
}
function boundMaterial(bundle, entityId, componentId) {
  const mesh = getMesh(bundle.scene.entities[entityId], componentId);
  return bundle.assets.assets[getPrimaryMaterialAssetId(mesh)];
}
function unchangedInput(bundle, snapshot) { assert.equal(JSON.stringify(bundle), snapshot); }

test("all ten trusted shelves remain represented, Item excludes terrain, and query reaches tail entries", () => {
  const all = list(), providers = new Set(all.map(item => item.providerId));
  assert.equal(providers.size, 10);
  assert.equal(new Set(all.map(item => item.candidateId)).size, all.length);
  assert.deepEqual(new Set(all.slice(0, 128).map(item => item.providerId)), providers);
  assert.ok(all.every(item => item.candidateId.startsWith(`builtin:${item.providerId}:`)));
  assert.ok(!all.some(item => item.candidateId.includes("DevEnvironment")));
  assert.ok(!list("item").some(item => item.providerId === "xrift-terrain-presets"));
  const tail = all.at(-1);
  assert.ok(list("world", `${tail.name}を追加してください`).slice(0, 128).some(item => item.candidateId === tail.candidateId));
  assert.ok(list("world", "ＳＫＹＢＯＸ の空を作って").slice(0, 10).some(item => item.providerId === "xrift-sky-shaders"));
  all[0].actions.length = 0;
  assert.ok(list()[0].actions.length > 0, "Callers cannot mutate trusted registry actions");
});

test("Sky uses the authored shader Material and normal scene settings while preserving source documents", async () => {
  const bundle = starter(), before = JSON.stringify(bundle), preset = SKY_SHADER_CATALOG[0];
  const result = await applyTo(bundle, { kind: "skybox", candidateId: candidate("xrift-sky-shaders", c => c.candidateId.endsWith(`:${preset.id}`)), iblEnabled: false, exposure: 0.7, rotationDegrees: 40 });
  const sky = result.bundle.scene.settings.skybox;
  assert.equal(sky.enabled, true); assert.equal(sky.iblEnabled, false);
  assert.equal(sky.exposure, 0.7); assert.equal(sky.rotationDegrees, 40);
  assert.equal(result.bundle.assets.assets[sky.materialAssetId].shader.fragmentShader, preset.shader.fragmentShader);
  assert.equal(result.bundle.assets.assets[sky.materialAssetId].shader.vertexShader, preset.shader.vertexShader);
  assert.equal(result.bundle.project.projectId, bundle.project.projectId);
  assert.deepEqual(result.bundle.scene.entities, bundle.scene.entities);
  unchangedInput(bundle, before); validDocuments(result.bundle);
});

test("Water binds only the exact requested Mesh and retains transform, geometry and sibling Mesh", async () => {
  const bundle = starter(), entity = targetMesh(bundle), first = getMesh(entity);
  const second = createBuiltinPrimitiveMeshComponent("water-target-mesh", getBuiltinPrimitiveCreation(BUILTIN_PRIMITIVE_CREATION_IDS.box), first.materialBindings);
  assert.ok(second); entity.components.push(second);
  const before = JSON.stringify(bundle), transform = structuredClone(getTransform(entity));
  const result = await applyTo(bundle, { kind: "material", entityId: entity.id, componentId: second.id, candidateId: candidate("xrift-water-shaders") });
  assert.deepEqual(getMesh(result.bundle.scene.entities[entity.id], first.id), first);
  assert.equal(getMesh(result.bundle.scene.entities[entity.id], second.id).geometryAssetId, second.geometryAssetId);
  assert.deepEqual(getTransform(result.bundle.scene.entities[entity.id]), transform);
  assert.equal(boundMaterial(result.bundle, entity.id, second.id).shader.fragmentShader, WATER_SHADER_CATALOG[0].shader.fragmentShader);
  assert.equal(boundMaterial(result.bundle, entity.id, second.id).shader.vertexShader, WATER_SHADER_CATALOG[0].shader.vertexShader);
  unchangedInput(bundle, before); validDocuments(result.bundle);
});

test("Terrain is editable height geometry with its grass/collider and requested root transform", async () => {
  const bundle = starter(), before = JSON.stringify(bundle);
  const result = await applyTo(bundle, catalog(candidate("xrift-terrain-presets", c => c.candidateId.endsWith(":rolling-hills")), { name: "作業用の丘", rotation: [0, 90, 0], scale: [2, 1, 2] }));
  const entity = result.bundle.scene.entities[result.entityId], geometry = getTerrainGeometry(getMesh(entity));
  assert.ok(geometry.heights.some(height => height !== geometry.heights[0]));
  assert.ok(geometry.grass.length > 0); assert.ok(entity.components.some(component => component.type === "collider"));
  assert.equal(entity.name, "作業用の丘");
  assert.deepEqual(getTransform(entity).position, [3, 1, -2]);
  assert.deepEqual(getTransform(entity).rotation, [0, Math.PI / 2, 0]);
  assert.deepEqual(getTransform(entity).scale, [2, 1, 2]);
  unchangedInput(bundle, before); validDocuments(result.bundle);
});

test("Glow and Particle use the existing fixture proportions and authored emitter properties", async () => {
  const bundle = starter();
  const glow = await applyTo(bundle, catalog(candidate("xrift-glow-materials", c => c.candidateId.endsWith(":tube/cool-white"))));
  const entity = glow.bundle.scene.entities[glow.entityId];
  assert.deepEqual(getTransform(entity).scale, [0.06, 2.4, 0.06]);
  assert.ok(boundMaterial(glow.bundle, glow.entityId).properties.extensions.KHR_materials_emissive_strength.emissiveStrength > 1);
  const preset = PARTICLE_AUTHORING_PRESETS[0];
  const particle = await applyTo(glow.bundle, catalog(candidate("xrift-particle-presets", c => c.candidateId.endsWith(`:${preset.id}`))));
  const emitter = particle.bundle.scene.entities[particle.entityId].components.find(component => component.type === "particle-emitter");
  assert.ok(emitter); assert.equal(particle.bundle.assets.assets[emitter.particleAssetId].name, preset.name);
  assert.equal(particle.bundle.assets.assets[emitter.particleAssetId].properties.maxParticles, preset.properties.maxParticles);
  validDocuments(particle.bundle);
});

test("3D Particle set and audio gimmicks preserve real hierarchy, dependency files and Interactivity", async () => {
  // Textured GLBs require the browser image decoder. Node uses the authored
  // snowfall set here; browser coverage exercises textured catalog sets.
  const models = getSceneRecipesForProjectKind("world", "models"), recipe = models.find(item => item.id === "scene-recipe.snowfall");
  assert.ok(recipe);
  let result = await applyTo(starter(), catalog(candidate("xrift-scene-recipes", c => c.candidateId.endsWith(`:${recipe.id}`))));
  assert.ok(result.bundle.scene.entities[result.entityId].children.length > 0);
  assert.ok(Object.values(result.bundle.assets.assets).some(asset => asset.kind === "particle"));
  const gimmick = getSceneRecipesForProjectKind("world", "gimmicks").find(item => item.behaviours?.length && item.parts.some(part => part.kind === "audio" || part.audio));
  assert.ok(gimmick);
  result = await applyTo(result.bundle, catalog(candidate("xrift-gimmicks", c => c.candidateId.endsWith(`:${gimmick.id}`))));
  assert.ok(Object.values(result.bundle.assets.assets).some(asset => asset.kind === "interactivity"));
  assert.ok(writes.some(write => write.relativePath.endsWith(".wav")));
  for (const entity of Object.values(result.bundle.scene.entities)) for (const component of entity.components) {
    if (component.type === "audio-source" && component.audioAssetId) assert.equal(result.bundle.assets.assets[component.audioAssetId]?.kind, "audio");
  }
  validDocuments(result.bundle);
});

test("glTF material assignment saves exact public texture bytes before exposing material references", async () => {
  const bundle = starter(), entity = targetMesh(bundle);
  const id = candidate("xrift-material-showcases", c => c.actions.includes("material") && /carbon|fabric|wood|normal|texture|ao|orm/i.test(c.candidateId));
  const result = await applyTo(bundle, { kind: "material", entityId: entity.id, candidateId: id });
  const material = boundMaterial(result.bundle, entity.id), textures = catalogMaterialTextures(material.properties);
  assert.ok(textures.length > 0);
  for (const texture of textures) {
    const asset = result.bundle.assets.assets[texture.assetId];
    assert.equal(asset.kind, "texture");
    const saved = writes.find(write => write.relativePath === asset.source.relativePath);
    assert.ok(saved, "Every bound texture must reach native persistence");
    assert.deepEqual(saved.bytes, await readFile(resolve(publicRoot, `.${texture.publicPath}`)));
  }
  validDocuments(result.bundle);
});

test("OpenBrush installs real catalog shader provenance into a normal Material slot", async () => {
  const bundle = starter(), entity = targetMesh(bundle);
  const result = await applyTo(bundle, { kind: "material", entityId: entity.id, candidateId: candidate("open-brush") });
  const material = boundMaterial(result.bundle, entity.id);
  assert.ok(JSON.stringify(material).includes("open-brush"));
  assert.equal(writes.length, 0);
  validDocuments(result.bundle);
});

test("official Component is imported from the same reviewed sample and remains serializable", async () => {
  const result = await applyTo(starter(), catalog(candidate("xrift-components", c => /mirror/i.test(c.candidateId)), { name: "鏡の確認" }));
  const entity = result.bundle.scene.entities[result.entityId];
  assert.equal(entity.name, "鏡の確認");
  assert.ok(entity.components.some(component => component.type === "xrift-component"));
  assert.deepEqual(getTransform(entity).position, [3, 1, -2]);
  validDocuments(result.bundle);
});

test("Vehicle and Seat persist actual shared model/script templates and editable prefab documents", async () => {
  let bundle = starter();
  for (const template of ["vehicle", "seat"]) {
    const result = await applyTo(bundle, catalog(candidate("xrift-components", c => c.candidateId.endsWith(`:studio.${template}`))));
    const entity = result.bundle.scene.entities[result.entityId];
    assert.ok(entity.components.some(component => component.type === "script"));
    assert.ok(entity.children.length > 0);
    bundle = result.bundle;
  }
  assert.ok(Object.values(bundle.assets.assets).filter(asset => asset.kind === "model").length >= 3);
  const scripts = Object.values(bundle.assets.assets).filter(asset => asset.kind === "script");
  assert.ok(scripts.length >= 4);
  for (const script of scripts) assert.ok(writes.some(write => write.relativePath === script.source.relativePath && write.content));
  assert.equal(Object.keys(bundle.prefabs).length, 2);
  assert.equal(validDocuments(bundle).prefabDocuments.length, 2);
});

test("unknown candidates, wrong actions and non-Mesh targets fail before network or persistence", async () => {
  const bundle = starter(), before = JSON.stringify(bundle);
  for (const operation of [
    catalog("builtin:xrift-components:forged"),
    catalog(candidate("open-brush")),
    { kind: "material", entityId: "not-in-scene", candidateId: candidate("xrift-material-showcases", c => c.actions.includes("material")) },
    { kind: "material", entityId: targetMesh(bundle).id, componentId: "unknown-mesh", candidateId: candidate("xrift-water-shaders") },
  ]) await assert.rejects(applyTo(bundle, operation));
  assert.equal(writes.length, 0); assert.equal(requests.length, 0);
  unchangedInput(bundle, before);
});

test("failed writes and corrupt catalog hashes cannot expose partial material or dependency documents", async () => {
  const bundle = starter(), before = JSON.stringify(bundle), entity = targetMesh(bundle);
  const id = candidate("xrift-material-showcases", c => c.actions.includes("material") && /carbon|fabric|wood|normal|texture|ao|orm/i.test(c.candidateId));
  rejectWrites = true;
  await assert.rejects(applyTo(bundle, { kind: "material", entityId: entity.id, candidateId: id }), /保存できませんでした/);
  unchangedInput(bundle, before); assert.equal(writes.length, 0);
  rejectWrites = false; corruptBytes = true;
  await assert.rejects(applyTo(bundle, { kind: "material", entityId: entity.id, candidateId: id }), /保存できませんでした/);
  unchangedInput(bundle, before); assert.equal(writes.length, 0);
});
