// Exercise the real storage adapter against the IndexedDB implementation used
// for Node tests. This does not substitute for Safari or device verification.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBKeyRange, forceCloseDatabase } from "fake-indexeddb";
import { createServer } from "vite";

const factory = new IDBFactory();
globalThis.indexedDB = factory;
globalThis.IDBKeyRange = IDBKeyRange;
let connection;
// Observe the actual connection so a test can reproduce a browser-forced close.
const open = factory.open.bind(factory);
factory.open = (...args) => {
  const request = open(...args);
  request.addEventListener("success", () => { connection = request.result; });
  return request;
};
const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-browser-storage-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(async () => { connection?.close(); await server.close(); });
const storage = await server.ssrLoadModule("/src/lib/browser-project-storage.ts");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { createPrototypeProject } = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");
const { serializeVisualProjectDocuments, parseVisualProjectFiles } = await server.ssrLoadModule("/src/lib/visual-editor/persistence.ts");
const { browserProjectDocumentFiles } = await server.ssrLoadModule("/src/lib/visual-editor/browser-project-transfer.ts");
const encode = (text) => new TextEncoder().encode(text);
const dataUrl = (bytes) => `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;

function projectDocuments(name) {
  const bundle = createPrototypeProject("world", name);
  return { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
}

test("browser identities and relative paths cannot escape the project", () => {
  assert.equal(storage.isBrowserProjectPath("browser-project://123-abc"), true);
  for (const path of [undefined, "/tmp/project", "browser-project://abc/folder", "browser-project://abc?query", "browser-project://"]) {
    assert.equal(storage.isBrowserProjectPath(path), false);
  }
  for (const path of ["", "../outside", "folder/../outside", "/absolute", "folder//file", "folder\\file", "C:/file", " file", "file\u0000", "folder/./file"]) {
    assert.throws(() => storage.validateBrowserRelativePath(path), /不正/);
  }
  assert.equal(storage.validateBrowserRelativePath("assets/imported/日本語.glb"), "assets/imported/日本語.glb");
});

test("create, save and restore keep complete project documents and independent binary bytes", async () => {
  const documents = projectDocuments("storage-roundtrip");
  const scene = documents.scenes[documents.project.entrySceneId];
  documents.project.scenePaths["scene-second"] = "scenes/second.scene.json";
  documents.scenes["scene-second"] = { ...scene, sceneId: "scene-second", name: "Second scene" };
  const files = browserProjectDocumentFiles(documents);
  const bytes = new Uint8Array([0, 127, 128, 255]);
  files.set("assets/imported/model.glb", bytes);
  const projectPath = await storage.createBrowserProject(files);
  bytes.fill(0);
  documents.project.metadata.title = "Saved title";
  await tauri.saveVisualProject(projectPath, serializeVisualProjectDocuments(documents));
  const restored = parseVisualProjectFiles(await tauri.readVisualProject(projectPath));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(documents)));
  assert.deepEqual(await storage.readBrowserFile(projectPath, "assets/imported/model.glb"), new Uint8Array([0, 127, 128, 255]));
  assert.equal(await storage.restoreBrowserProject(), projectPath);
  const recent = (await storage.listBrowserProjects()).find((item) => item.path === projectPath);
  assert.equal(recent?.title, "Saved title");
});

test("a rejected save leaves every document, binary and the active-project pointer intact", async () => {
  const documents = projectDocuments("storage-original");
  const originalPath = await storage.createBrowserProject(browserProjectDocumentFiles(documents));
  const before = await storage.getBrowserProjectFiles(originalPath);
  const activePath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-active")));
  const invalid = structuredClone(documents);
  invalid.project.projectId = "project-unrelated";
  invalid.project.metadata.title = "Should not be written";
  await assert.rejects(() => storage.saveBrowserVisualProject(originalPath, serializeVisualProjectDocuments(invalid)), /プロジェクトID/);
  assert.deepEqual(await storage.getBrowserProjectFiles(originalPath), before);
  assert.equal(await storage.restoreBrowserProject(), activePath);
});

test("a project can be prepared without changing restore until it is opened successfully", async () => {
  const activePath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-current")));
  const newPath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-prepared")), { activate: false });
  assert.equal(await storage.restoreBrowserProject(), activePath);
  const restored = parseVisualProjectFiles(await storage.readBrowserVisualProject(newPath));
  assert.equal(restored.project.metadata.name, "storage-prepared");
  await storage.activateBrowserProject(newPath);
  assert.equal(await storage.restoreBrowserProject(), newPath);
});

test("asset import collision rolls back all writes and keeps another project's restore pointer", async () => {
  const files = browserProjectDocumentFiles(projectDocuments("storage-assets"));
  files.set("assets/imported/existing.glb", new Uint8Array([1, 2, 3]));
  const projectPath = await storage.createBrowserProject(files);
  const activePath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-other")));
  await assert.rejects(() => tauri.commitVisualAssetImport(projectPath, "asset-import-collision", [
    { relativePath: "assets/imported/new.glb", dataUrl: dataUrl([8, 9]) },
    { relativePath: "assets/imported/existing.glb", dataUrl: dataUrl([4, 5, 6]) },
  ]), /different content/);
  assert.deepEqual(await storage.getBrowserProjectFiles(projectPath), files);
  assert.equal(await storage.restoreBrowserProject(), activePath);
  await tauri.commitVisualAssetImport(projectPath, "asset-import-identical", [
    { relativePath: "assets/imported/existing.glb", dataUrl: dataUrl([1, 2, 3]) },
    { relativePath: "assets/imported/new.glb", dataUrl: dataUrl([8, 9]) },
  ]);
  assert.deepEqual(await storage.readBrowserFile(projectPath, "assets/imported/new.glb"), new Uint8Array([8, 9]));
});

test("invalid imports fail before any file or active-project setting is written", async () => {
  const activePath = await storage.restoreBrowserProject();
  const count = (await storage.listBrowserProjects()).length;
  await assert.rejects(() => storage.createBrowserProject(new Map([
    ["assets/valid.txt", encode("valid")], ["../outside.txt", encode("invalid")],
  ])), /不正/);
  assert.equal(await storage.restoreBrowserProject(), activePath);
  assert.equal((await storage.listBrowserProjects()).length, count);
});

test("file deletion is confined to one subtree and one project", async () => {
  const files = browserProjectDocumentFiles(projectDocuments("storage-delete"));
  for (const path of ["assets/imported/one.glb", "assets/imported/sub/two.glb", "assets/imported-more/three.glb"]) files.set(path, new Uint8Array([1]));
  const projectPath = await storage.createBrowserProject(files);
  const otherPath = await storage.createBrowserProject(files);
  await tauri.deletePath(projectPath, "assets/imported");
  const remaining = await storage.getBrowserProjectFiles(projectPath);
  assert.equal(remaining.has("assets/imported/one.glb"), false);
  assert.equal(remaining.has("assets/imported/sub/two.glb"), false);
  assert.equal(remaining.has("assets/imported-more/three.glb"), true);
  assert.deepEqual(await storage.getBrowserProjectFiles(otherPath), files);
});

test("browser file adapters do not advertise native IPC or accept arbitrary script files", async () => {
  assert.equal(tauri.isAvailable(), false);
  const projectPath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-scripts")));
  await tauri.writeTextFile(projectPath, "assets/scripts/example.ts", "export default {};");
  assert.equal(await tauri.readScriptSource(projectPath, "assets/scripts/example.ts"), "export default {};");
  await assert.rejects(() => tauri.readScriptSource(projectPath, "assets/scripts/example.json"), /\.ts/);
  await assert.rejects(() => tauri.readTextFile(projectPath, "../other-project"), /不正/);
});

test("a browser-forced database close can reopen the saved project without a page reload", async () => {
  const projectPath = await storage.createBrowserProject(browserProjectDocumentFiles(projectDocuments("storage-reopen")));
  const closed = new Promise((resolve) => connection.addEventListener("close", resolve, { once: true }));
  forceCloseDatabase(connection);
  await closed;
  assert.equal(await storage.restoreBrowserProject(), projectPath);
  const restored = parseVisualProjectFiles(await storage.readBrowserVisualProject(projectPath));
  assert.equal(restored.project.metadata.name, "storage-reopen");
});
