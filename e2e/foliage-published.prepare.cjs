// Emit the actual publication of a bundled tree wearing the foliage Material,
// so the browser can draw the published tree: the generated World and the
// Runtime JSON manifest, with the Model and the two pictures each of them reads.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));
(async () => {
  const load = (file) => import(pathToFileURL(path.resolve(file)).href);
  const { createPrototypeProject } = await load("src/lib/visual-editor/prototype-project.ts");
  const { normalizeModelImportSettings, normalizeTextureImportSettings } = await load("src/lib/visual-editor/asset-manifest.ts");
  const { compileVisualProject } = await load("src/lib/visual-editor/compiler/compile.ts");
  const { FOLIAGE_RECIPE_MODELS } = await load("src/lib/visual-editor/foliage-recipe-models.ts");
  const { FOLIAGE_TEXTURES } = await load("src/lib/visual-editor/foliage-textures.ts");
  const { FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID, getFoliageMaterialAsset } = await load("src/lib/visual-editor/foliage-shader-catalog.ts");

  // The smallest tree that has everything: bark, a crown core and leaf cards.
  const definition = FOLIAGE_RECIPE_MODELS.find((entry) => entry.modelId === "foliageShrub");
  const bytes = fs.readFileSync(path.join("public", definition.publicPath));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  const size = definition.bounds.max.map((value, axis) => value - definition.bounds.min[axis]);
  const center = definition.bounds.max.map((value, axis) => (value + definition.bounds.min[axis]) / 2);
  const project = createPrototypeProject("world", "foliage-published");
  const model = {
    id: definition.assetId, name: definition.displayName, kind: "model", status: "ready",
    source: { kind: "project", relativePath: `assets/models/${definition.fileName}` },
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    importSettings: normalizeModelImportSettings({}),
    // One slot per glTF material, as the import derives them.
    materialSlots: gltf.materials.map((material, index) => ({ slot: `material-${index}`, name: material.name, sourceMaterialIndex: index })),
    importMetadata: {
      sourceFormat: "glb", byteLength: bytes.byteLength, nodeCount: gltf.nodes.length, meshCount: gltf.meshes.length,
      primitiveCount: gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
      bounds: { min: [...definition.bounds.min], max: [...definition.bounds.max], center, size, boundingSphereRadius: Math.hypot(...size) / 2 },
      animations: [], extensionsUsed: gltf.extensionsUsed ?? [], extensionsRequired: gltf.extensionsRequired ?? [],
    },
  };
  const material = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  const textures = FOLIAGE_TEXTURES.map((texture) => ({
    id: texture.assetId, name: texture.displayName, kind: "texture", status: "ready",
    source: { kind: "project", relativePath: `assets/textures/${texture.fileName}` },
    importSettings: normalizeTextureImportSettings({ colorSpace: "srgb" }),
    importMetadata: { sourceFormat: "webp", mimeType: texture.mimeType, byteLength: texture.byteLength, width: texture.width, height: texture.height },
  }));
  for (const asset of [model, material, ...textures]) project.assets.assets[asset.id] = asset;

  // The tree at the origin under the Scene's own sun, and nothing else.
  const entity = project.scene.entities["entity-world-object"];
  const transform = entity.components.find((component) => component.type === "transform");
  Object.assign(transform, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const mesh = entity.components.find((component) => component.type === "mesh");
  Object.assign(mesh, {
    geometryAssetId: model.id,
    geometry: { kind: "asset", assetId: model.id },
    materialBindings: model.materialSlots.map((slot) => ({ slot: slot.slot, materialAssetId: material.id })),
    castShadow: false,
    receiveShadow: false,
  });
  entity.components = [transform, mesh];
  const light = Object.values(project.scene.entities).find((candidate) => candidate.components.some((component) => component.type === "light"));
  if (!light) throw new Error("The prototype world has no light");
  project.scene.entities = { [entity.id]: entity, [light.id]: light };
  project.scene.rootEntityIds = [entity.id, light.id];
  project.scene.settings.skybox.enabled = false;
  project.scene.settings.skybox.iblEnabled = false;
  project.scene.settings.postprocessing.enabled = false;
  project.scene.settings.fog.enabled = false;
  // A wind the Material's own defaults do not happen to have.
  project.scene.settings.vegetation = { ...project.scene.settings.vegetation, windSpeed: 1.3, windDirectionDegrees: 120 };

  const documents = { project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs };
  const published = compileVisualProject(documents);
  const runtime = compileVisualProject(documents, { outputMode: "classic-runtime" });
  for (const output of [published, runtime]) {
    if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics.filter((entry) => entry.severity === "blocking")));
  }

  const root = path.resolve("node_modules/.cache/xrift-studio/foliage-published");
  fs.rmSync(root, { recursive: true, force: true });
  const write = (relativePath, content) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of published.overlayFiles) {
    if (/\.(ts|tsx|js)$/.test(file.relativePath)) write(file.relativePath, file.content);
  }
  // Each publication names the copied files its own way; both get the bytes.
  const files = { [model.id]: bytes };
  for (const texture of FOLIAGE_TEXTURES) files[texture.assetId] = fs.readFileSync(path.join("public", texture.publicPath));
  for (const output of [published, runtime]) {
    for (const [assetId, content] of Object.entries(files)) {
      const copy = output.assetCopyPlan.find((entry) => entry.assetId === assetId && entry.supportedByCompiler);
      if (!copy) throw new Error(`A publication does not carry ${assetId}`);
      write(copy.targetRelativePath, content);
    }
  }
  write(runtime.runtimeManifestFile.relativePath, runtime.runtimeManifestFile.content);
  write("fixture.json", JSON.stringify({
    runtimeManifest: runtime.runtimeManifestFile.relativePath,
    bounds: definition.bounds,
    materialAssetId: material.id,
  }));
  console.log("Prepared the actual publication of a tree wearing the foliage Material");
})().catch((error) => { console.error(error); process.exitCode = 1; });
