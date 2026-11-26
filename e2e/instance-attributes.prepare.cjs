// Emit the actual publication of a Model that uses EXT_mesh_gpu_instancing,
// with a Custom Shader that reads its per-instance attribute, so the browser
// can draw the same Model through Edit, Play, the generated world and the
// Runtime loader.
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
  const { normalizeMaterialProperties, normalizeModelImportSettings } = await load("src/lib/visual-editor/asset-manifest.ts");
  const { compileVisualProject } = await load("src/lib/visual-editor/compiler/compile.ts");
  const instancing = await load("packages/xrift-studio-runtime/src/gltf-instance-attributes.fixture.ts");

  const bytes = instancing.createGpuInstancingFixtureGlb();
  const project = createPrototypeProject("world", "instance-attributes-parity");
  const model = {
    id: "instanced-tufts", name: "Instanced tufts", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/models/instanced-tufts.glb" },
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [{ slot: "material-0", name: "Tuft", sourceMaterialIndex: 0 }],
    importMetadata: {
      sourceFormat: "glb", byteLength: bytes.byteLength, nodeCount: 4, meshCount: 1, primitiveCount: 1,
      bounds: { min: [-1.1, -1.3, 0], max: [1.1, 1.2, 0], center: [0, -0.05, 0], size: [2.2, 2.5, 0], boundingSphereRadius: 1.7 },
      animations: [], extensionsUsed: ["EXT_mesh_gpu_instancing"], extensionsRequired: [],
    },
  };
  const material = {
    id: "instanced-tuft-shader", name: "Tuft shader", kind: "material", status: "ready", source: { kind: "document" },
    properties: normalizeMaterialProperties({}),
    shader: {
      kind: "classic-r3f", sourceModulePath: "studio://custom-shader",
      vertexShader: instancing.GPU_INSTANCING_FIXTURE_VERTEX_SHADER,
      fragmentShader: instancing.GPU_INSTANCING_FIXTURE_FRAGMENT_SHADER,
      uniforms: {},
      variants: [{ name: "default", defines: {}, side: "double", transparent: false, depthWrite: true }],
    },
  };
  Object.assign(project.assets.assets, { [model.id]: model, [material.id]: material });

  // One Entity at the origin, and nothing that would colour the background.
  const entity = project.scene.entities["entity-world-object"];
  const transform = entity.components.find((component) => component.type === "transform");
  Object.assign(transform, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const mesh = entity.components.find((component) => component.type === "mesh");
  Object.assign(mesh, {
    geometryAssetId: model.id,
    geometry: { kind: "asset", assetId: model.id },
    materialBindings: [{ slot: "material-0", materialAssetId: material.id }],
    castShadow: false,
    receiveShadow: false,
  });
  entity.components = [transform, mesh];
  project.scene.entities = { [entity.id]: entity };
  project.scene.rootEntityIds = [entity.id];
  project.scene.settings.skybox.enabled = false;
  project.scene.settings.skybox.iblEnabled = false;
  project.scene.settings.postprocessing.enabled = false;
  project.scene.settings.fog.enabled = false;

  const documents = { project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs };
  const published = compileVisualProject(documents);
  const runtime = compileVisualProject(documents, { outputMode: "classic-runtime" });
  for (const output of [published, runtime]) {
    if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics));
  }

  const root = path.resolve("node_modules/.cache/xrift-studio/instance-attributes-parity");
  fs.rmSync(root, { recursive: true, force: true });
  for (const file of published.overlayFiles) {
    if (!/\.(ts|tsx|js)$/.test(file.relativePath)) continue;
    const target = path.join(root, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  // Each publication names the copied Model its own way; both get the bytes.
  const copies = [published, runtime].map((output) => {
    const copy = output.assetCopyPlan.find((entry) => entry.assetId === model.id);
    if (!copy?.supportedByCompiler) throw new Error("The instanced Model is not part of the publication");
    const target = path.join(root, copy.targetRelativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return path.basename(copy.targetRelativePath);
  });
  fs.writeFileSync(path.join(root, "fixture.json"), JSON.stringify({
    manifest: JSON.parse(runtime.runtimeManifestFile.content),
    modelFile: copies[0],
    model, material, mesh, assets: project.assets,
  }));
  console.log("Prepared the actual publication of an instanced Model");
})().catch((error) => { console.error(error); process.exitCode = 1; });
