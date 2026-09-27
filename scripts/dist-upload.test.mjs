// Verify the upload boundary without filesystem IPC or remote transfers.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-dist-upload-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(async () => { await server.close(); });
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { listDistUploadPaths, collectDistUploadFiles } = await server.ssrLoadModule("/src/lib/visual-editor/dist-upload-files.ts");
const { assertCompiledModuleEntry, materializeVisualCompilation } = await server.ssrLoadModule("/src/lib/visual-editor/publish.ts");

test("CLI preflight and SDK collection inspect the same nested and ignored files", async () => {
  const originalListFiles = tauri.listFiles;
  const originalRead = tauri.readProjectFileDataUrl;
  const reads = [];
  const directory = {
    dist: [
      { name: "remoteEntry.js", rel: "dist/remoteEntry.js", isDir: false },
      { name: "__federation_shared_@scope", rel: "dist/__federation_shared_@scope", isDir: true },
      { name: "types", rel: "dist/types", isDir: true },
    ],
    "dist/__federation_shared_@scope": [
      { name: "library.js", rel: "dist/__federation_shared_@scope/library.js", isDir: false },
    ],
    "dist/types": [
      { name: "world.d.ts", rel: "dist/types/world.d.ts", isDir: false },
    ],
  };
  tauri.listFiles = async (_project, rel) => {
    assert.ok(directory[rel], `unexpected directory: ${rel}`);
    return directory[rel];
  };
  tauri.readProjectFileDataUrl = async (_project, rel) => {
    reads.push(rel);
    return "data:application/javascript;base64,ZXhwb3J0IHt9";
  };
  try {
    const ignore = ["**/*.d.ts"];
    const selected = await listDistUploadPaths("test-project", "dist", ignore);
    assert.deepEqual(reads, [], "CLI preflight should not read asset bytes");
    assert.deepEqual(selected.ignoredPaths, ["types/world.d.ts"]);
    assert.throws(() => assertCompiledModuleEntry(selected.paths.map(remotePath => ({ remotePath }))), /サブフォルダー/);
    const collected = await collectDistUploadFiles("test-project", "dist", ignore);
    assert.deepEqual(collected.files.map(file => file.remotePath), selected.paths);
    assert.throws(() => assertCompiledModuleEntry(collected.files), /サブフォルダー/);
    assert.equal(reads.length, 2);

    // An excluded nested source declaration must not block a valid publication.
    const excluded = await listDistUploadPaths("test-project", "dist", [...ignore, "__federation_shared_@scope/**"]);
    assert.deepEqual(excluded.paths, ["remoteEntry.js"]);
    assert.doesNotThrow(() => assertCompiledModuleEntry(excluded.paths.map(remotePath => ({ remotePath }))));

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(listDistUploadPaths("test-project", "dist", ignore, controller.signal), { name: "AbortError" });
  } finally {
    tauri.listFiles = originalListFiles;
    tauri.readProjectFileDataUrl = originalRead;
  }
});

test("interrupted materialization keeps retry ownership and copies current texture bytes", async () => {
  const { xrift } = await server.ssrLoadModule("/src/lib/xrift-cli.ts");
  const { compileVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/compiler/index.ts");
  const { createPrototypeProject } = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");
  const { normalizeTextureImportSettings } = await server.ssrLoadModule("/src/lib/visual-editor/asset-manifest.ts");
  const prototype = createPrototypeProject("world", "staging-retry-fixture");
  prototype.assets.assets["pending-texture"] = {
    id: "pending-texture", name: "Pending Texture", kind: "texture", status: "ready",
    source: { kind: "project", relativePath: "assets/image.png" },
    importSettings: normalizeTextureImportSettings({
      resize: { mode: "max-size", maxSize: 256 }, compression: { format: "ktx2" },
    }),
    importMetadata: { sourceFormat: "png", mimeType: "image/png", width: 2048, height: 2048, byteLength: 6 },
  };
  for (const asset of Object.values(prototype.assets.assets)) {
    if (asset.kind === "material") asset.properties.baseColorTextureId = "pending-texture";
  }
  const compiled = compileVisualProject({
    project: prototype.project, scenes: { [prototype.scene.sceneId]: prototype.scene },
    assets: prototype.assets, prefabs: prototype.prefabs,
  });
  const savedTauri = Object.fromEntries(["prepareCompilerStaging", "initializeCompilerStaging", "applyCompilerStaging"]
    .map(key => [key, tauri[key]]));
  const savedXrift = Object.fromEntries(["createCompilerStagingTemplate", "installCompilerStagingDependencies"]
    .map(key => [key, xrift[key]]));
  let initialized = false;
  let failed = false;
  let completed = false;
  const success = { code: 0, stdout: "", stderr: "" };
  Object.assign(tauri, {
    prepareCompilerStaging: async () => {
      if (failed) assert.ok(initialized, "the failed stage must have an owner for retry");
      initialized = false;
      return { rootPath: "fixture/staging", projectPath: "fixture/staging/world" };
    },
    initializeCompilerStaging: async () => { initialized = true; },
    applyCompilerStaging: async (_authoring, _directory, _source, binary, copies) => {
      assert.ok(initialized, "ownership must be recorded before asset materialization can fail");
      assert.deepEqual(binary, [], "pending KTX2 settings must not generate replacement image bytes");
      assert.ok(copies.some(entry => entry.sourceRelativePath === "assets/image.png" && entry.targetRelativePath.endsWith("image.png")));
      if (!failed) {
        failed = true;
        throw new Error("fixture copy interrupted");
      }
      completed = true;
      return { projectPath: "fixture/staging/world", requiredPublicationFiles: [{ purpose: "thumbnail", sha256: "fixture" }] };
    },
  });
  Object.assign(xrift, {
    createCompilerStagingTemplate: async () => success,
    installCompilerStagingDependencies: async () => {
      assert.ok(completed, "failed asset copies must not progress to dependency installation");
      return success;
    },
  });
  const run = () => materializeVisualCompilation("fixture/authoring", compiled, () => {}, new AbortController().signal, () => {});
  try {
    await assert.rejects(run(), /fixture copy interrupted/);
    assert.equal(completed, false);
    assert.equal(await run(), "fixture/staging/world");
  } finally {
    Object.assign(tauri, savedTauri);
    Object.assign(xrift, savedXrift);
  }
});
