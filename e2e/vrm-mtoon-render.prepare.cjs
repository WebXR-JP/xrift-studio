// Compile real native VRM and imported editable-material manifests for WebGL.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
let shellServer;
(async () => {
  const withShell = process.argv.includes("--shell");
  if (withShell) {
    const { createServer } = await import("vite");
    shellServer = await createServer({ configFile: false, cacheDir: "node_modules/.cache/xrift-studio/vrm-mtoon-render/vite-shell",
      optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false } });
  } else {
    eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));
  }
  const load = relative => shellServer ? shellServer.ssrLoadModule(`/${relative}`) : import(pathToFileURL(path.resolve(relative)).href);
  const { createPrototypeProject } = await load("src/lib/visual-editor/prototype-project.ts");
  const { normalizeModelImportSettings, updateMaterialAsset } = await load("src/lib/visual-editor/asset-manifest.ts");
  const { expandGltfAssets } = await load("src/lib/visual-editor/gltf-derived-assets.ts");
  const { compileVisualProject } = await load("src/lib/visual-editor/compiler/compile.ts");
  const { createVrmAvatarFixtureBytes } = await load("src/lib/visual-editor/compiler/vrm-avatar.fixture.ts");
  const { BUILTIN_PRIMITIVE_CREATION_IDS } = await load("src/lib/visual-editor/creation-catalog.ts");
  const shellUpload = withShell ? await load("src/lib/visual-editor/web-upload.ts") : {};
  const { assembleWebUploadFiles, resolveWebRuntimePermissions } = shellUpload;
  const shellRootArg = process.argv.indexOf("--shell-root");
  const shellRoot = path.resolve(shellRootArg >= 0 ? process.argv[shellRootArg + 1] : "public/xrift-runtime-shell");
  const shellFiles = withShell ? JSON.parse(fs.readFileSync(path.join(shellRoot, "shell-manifest.json"), "utf8")).files
    .map(relativePath => ({ path: relativePath, data: new Uint8Array(fs.readFileSync(path.join(shellRoot, relativePath))) })) : [];
  const root = path.resolve("node_modules/.cache/xrift-studio/vrm-mtoon-render");
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  for (const version of ["0", "1"]) {
    const bytes = createVrmAvatarFixtureBytes(version, "sphere");
    const sourceHash = hash(bytes);
    const view = new DataView(bytes.buffer);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
    const prototype = createPrototypeProject("world", `vrm-${version}-render`);
    prototype.assets.folders = {
      "fixture-materials": { id: "fixture-materials", name: "Imported materials", parentId: null, order: 0 },
      "fixture-textures": { id: "fixture-textures", name: "Imported textures", parentId: null, order: 1 },
    };
    const model = {
      id: "native-vrm-avatar", name: "Native VRM avatar", kind: "model", status: "ready",
      source: { kind: "project", relativePath: `assets/avatar-${version}.vrm` },
      importSettings: normalizeModelImportSettings({}),
      materialSlots: [{ slot: "default", name: "Native toon", sourceMaterialIndex: 0 }],
    };
    prototype.assets.assets[model.id] = model;
    let mesh;
    for (const entity of Object.values(prototype.scene.entities)) {
      entity.components = entity.components.filter(component => {
        if (component.type !== "mesh") return true;
        if (mesh) return false;
        mesh = component;
        entity.transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        const transform = entity.components.find(candidate => candidate.type === "transform");
        if (transform) Object.assign(transform, entity.transform);
        component.geometry = { kind: "asset", assetId: model.id };
        component.materialBindings = [];
        return true;
      });
    }
    const emit = async mode => {
      const compiled = compileVisualProject({ project: prototype.project, assets: prototype.assets, scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs }, { outputMode: "classic-runtime" });
      if (!compiled.canStage || !compiled.runtimeManifestFile) throw new Error(JSON.stringify(compiled.diagnostics));
      const targetRoot = path.join(root, `${version}-${mode}`);
      fs.mkdirSync(targetRoot, { recursive: true });
      const manifest = JSON.parse(compiled.runtimeManifestFile.content);
      if (manifest.assets[model.id]) {
        const modelFile = path.join(targetRoot, manifest.assets[model.id].url);
        fs.mkdirSync(path.dirname(modelFile), { recursive: true });
        fs.writeFileSync(modelFile, bytes);
      }
      fs.writeFileSync(path.join(targetRoot, "manifest.json"), JSON.stringify(manifest));
      if (withShell) {
        const assembled = await assembleWebUploadFiles({
          documents: { project: prototype.project, assets: prototype.assets, scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs },
          readAssetBytes: async relativePath => {
            if (relativePath !== model.source.relativePath) throw new Error(`Unknown isolated shell fixture asset: ${relativePath}`);
            return bytes;
          }, shellFiles, signal: new AbortController().signal,
        });
        for (const file of assembled) {
          const destination = path.join(targetRoot, file.remotePath);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, file.data);
        }
        // Browser upload passes this config separately to the SDK. Persist
        // it here only so the official CLI checks that identical declaration.
        const config = JSON.parse(compiled.overlayFiles.find(file => file.relativePath === "xrift.json").content);
        config.world.permissions = resolveWebRuntimePermissions(config.world.permissions);
        config.world.distDir = ".";
        fs.writeFileSync(path.join(targetRoot, "xrift.json"), JSON.stringify(config, null, 2));
      }
    };
    await emit("native");
    const expanded = await expandGltfAssets({
      json, modelBytes: bytes, sourceFormat: "glb", modelAssetId: model.id,
      modelSourceHash: sourceHash, materialSlots: model.materialSlots,
      materialFolderId: "fixture-materials", textureFolderId: "fixture-textures",
      hashBytes: async bytes => hash(bytes),
    });
    if (expanded.warnings.length) throw new Error(JSON.stringify(expanded.warnings));
    const material = expanded.materialAssets[0];
    if (!material?.properties.extensions.VRMC_materials_mtoon) throw new Error(`VRM ${version} did not derive an editable MToon material`);
    if (hash(bytes) !== sourceHash) throw new Error("Import modified source bytes");
    prototype.assets.assets[material.id] = material;
    model.materialSlots = expanded.materialSlots;
    mesh.materialBindings = [{ slot: "default", materialAssetId: material.id }];
    await emit("imported");
    prototype.assets = updateMaterialAsset(prototype.assets, material.id, {
      pbrMetallicRoughness: { baseColorFactor: [0.03, 0.8, 0.07, 1] },
      extensions: { VRMC_materials_mtoon: {
        shadeColorFactor: [0.015, 0.5, 0.025], outlineWidthFactor: 0.07,
        outlineColorFactor: [0, 0, 1], outlineLightingMixFactor: 0,
      } },
    });
    await emit("edited");
    if (withShell) {
      mesh.geometry = { kind: "builtin-primitive", creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: "sphere" };
      await emit("authored");
    }
  }
  console.log("Prepared VRM 0.x/1.0 native, imported, and edited runtime manifests");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await shellServer?.close(); });
