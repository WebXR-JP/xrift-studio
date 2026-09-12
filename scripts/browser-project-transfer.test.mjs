// Source-level archive tests only; no browser, device or production build.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { unzipSync, zipSync } from "three/examples/jsm/libs/fflate.module.js";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-browser-transfer-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false },
});
after(async () => { await server.close(); });
const transfer = await server.ssrLoadModule("/src/lib/visual-editor/browser-project-transfer.ts");
const { projectPackageFileName } = await server.ssrLoadModule("/src/lib/project-package.ts");
const { createPrototypeProject } = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");
const { createPrefabDocument, addPrefabAsset } = await server.ssrLoadModule("/src/lib/visual-editor/prefab-document.ts");

function projectDocuments() {
  const bundle = createPrototypeProject("world", "tablet-world");
  return { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
}

test(".xriftstudio preserves all scenes, Prefabs and source bytes, and remains readable as legacy ZIP", async () => {
  const documents = projectDocuments();
  const scene = documents.scenes[documents.project.entrySceneId];
  documents.scenes["scene-second"] = { ...scene, sceneId: "scene-second", name: "別のシーン" };
  documents.project.scenePaths["scene-second"] = "scenes/second.scene.json";
  const prefab = createPrefabDocument(scene, documents.assets, { prefabId: "prefab-tablet", name: "Tablet Prefab", sourceRootEntityIds: [scene.rootEntityIds[0]] });
  assert.ok(prefab);
  documents.prefabs[prefab.document.prefabId] = prefab.document;
  documents.assets = addPrefabAsset(documents.assets, { id: "asset-tablet-prefab", name: "Tablet Prefab", prefabPath: "prefabs/prefab-tablet.prefab.json" }).manifest;
  documents.assets.assets["asset-fragment"] = {
    id: "asset-fragment", name: "Scene fragment", kind: "template", status: "ready",
    source: { kind: "project", relativePath: "assets/imported/fragment.json" },
    templatePath: "assets/imported/fragment.json", templateType: "scene-fragment",
  };
  const bytes = new Uint8Array([0, 1, 2, 128, 255, 10]);
  const files = new Map([
    ["assets/imported/model.glb", bytes],
    ["public/thumbnail.png", bytes],
    ["assets/imported/fragment.json", new TextEncoder().encode('{"fragment":true}')],
    [".xrift/world.json", new TextEncoder().encode('{"id":"old-world"}')],
  ]);
  const result = await transfer.createBrowserProjectArchive(documents, files);
  assert.equal(result.fileName, "tablet-world.xriftstudio");
  assert.equal(result.blob.type, "application/octet-stream");
  const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.ok(entries["tablet-world/xrift-studio.project.json"]);
  assert.ok(entries["tablet-world/.xrift-studio/package-manifest.json"]);
  assert.equal(entries["tablet-world/.xrift/world.json"], undefined);
  assert.deepEqual(entries["tablet-world/assets/imported/model.glb"], bytes);
  for (const fileName of [result.fileName, "legacy.zip"]) {
    const restored = await transfer.readBrowserProjectArchive(new File([result.blob], fileName));
    assert.deepEqual(restored.documents.scenes, JSON.parse(JSON.stringify(documents.scenes)));
    assert.deepEqual(restored.documents.prefabs, documents.prefabs);
    assert.deepEqual(restored.files.get("assets/imported/model.glb"), bytes);
    assert.deepEqual(restored.files.get("public/thumbnail.png"), bytes);
    assert.notEqual(restored.documents.project.projectId, documents.project.projectId);
    assert.equal(restored.documents.project.lastPublication, undefined);
  }
  assert.equal(files.has(".xrift/world.json"), true, "Export does not mutate stored files");
  files.delete("assets/imported/fragment.json");
  await assert.rejects(() => transfer.createBrowserProjectArchive(documents, files), /素材.*ファイルがありません/);
});

test("project package names replace existing suffixes and are safe download filenames", () => {
  for (const [name, expected] of [
    ["tablet-world", "tablet-world.xriftstudio"],
    ["tablet-world.zip", "tablet-world.xriftstudio"],
    ["tablet-world.XriftStudio", "tablet-world.xriftstudio"],
    [" 湖:夜?.ZIP ", "湖-夜-.xriftstudio"],
    [".xriftstudio", "xrift-project.xriftstudio"],
    [" ... ", "xrift-project.xriftstudio"],
  ]) assert.equal(projectPackageFileName(name), expected);
});

test("both extensions reject corrupt archives and archives without project documents", async () => {
  const unrelatedArchive = zipSync({ "readme.txt": new TextEncoder().encode("No project here") });
  for (const fileName of ["invalid.xriftstudio", "invalid.zip"]) {
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File(["not an archive"], fileName)));
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File([unrelatedArchive], fileName)), /XRift Studio/);
  }
});

test("missing scene files and unsafe paths are rejected before opening another project", async () => {
  const files = transfer.browserProjectDocumentFiles(projectDocuments());
  files.delete("scenes/main.scene.json");
  assert.throws(() => transfer.parseBrowserProjectFiles(files), /見つかりません/);
  for (const path of ["../outside", "/absolute", "folder\\outside", "C:/outside"]) {
    const archive = zipSync({ [path]: new Uint8Array([1]) }, { level: 0 });
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "unsafe.zip")), /不正/);
  }
});

test("file and directory collisions cannot be re-exported as a broken desktop project", async () => {
  const files = transfer.browserProjectDocumentFiles(projectDocuments());
  files.set("assets/imported/file", new Uint8Array([1]));
  files.set("assets/imported/file-extra", new Uint8Array([1]));
  files.set("assets/imported/file/child", new Uint8Array([2]));
  assert.throws(() => transfer.parseBrowserProjectFiles(files), /重複/);
});

test("oversized archives are refused before reading their payload", async () => {
  let read = false;
  await assert.rejects(() => transfer.readBrowserProjectArchive({ size: transfer.BROWSER_PROJECT_ARCHIVE_MAX_BYTES + 1, arrayBuffer: () => { read = true; throw new Error("Unexpected read"); } }), /256 MB/);
  assert.equal(read, false);
});
