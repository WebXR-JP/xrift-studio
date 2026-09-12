// Source-level archive tests only; no browser, device or production build.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { unzipSync, zipSync } from "three/examples/jsm/libs/fflate.module.js";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-browser-transfer-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
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
    ["CON", "xrift-CON.xriftstudio"],
    ["nul.backup", "xrift-nul.backup.xriftstudio"],
    ["LPT1.zip", "xrift-LPT1.xriftstudio"],
  ]) assert.equal(projectPackageFileName(name), expected);
  for (const name of ["湖".repeat(96), "a".repeat(95) + "𠮷"]) {
    const fileName = projectPackageFileName(name);
    assert.ok(new TextEncoder().encode(fileName).length <= 255);
    assert.equal(fileName.isWellFormed(), true, "Truncation must not split a Unicode character");
  }
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

function archiveWithSource(level = 0) {
  const files = transfer.browserProjectDocumentFiles(projectDocuments());
  files.set("assets/imported/model.glb", new Uint8Array(16384).fill(42));
  return zipSync(Object.fromEntries(files), { level });
}

function centralHeaders(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const footer = archive.length - 22;
  let cursor = view.getUint32(footer + 16, true);
  const headers = [];
  for (let index = 0; index < view.getUint16(footer + 10, true); index++) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    headers.push({ offset: cursor, end: cursor + 46 + nameLength + extraLength + commentLength, name: new TextDecoder().decode(archive.subarray(cursor + 46, cursor + 46 + nameLength)) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return headers;
}

// Rust zip::SimpleFileOptions.large_file(true) uses ZIP64 entry sizes even
// when the small archive still has a ZIP32 footer. Mirror that exact boundary.
function withZip64EntrySizes(archive) {
  const headers = centralHeaders(archive);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const directory = [];
  for (const header of headers) {
    const bytes = archive.slice(header.offset, header.end);
    const next = new Uint8Array(bytes.length + 20);
    next.set(bytes);
    const central = new DataView(next.buffer);
    central.setUint32(20, 0xffffffff, true);
    central.setUint32(24, 0xffffffff, true);
    central.setUint16(30, 20, true);
    central.setUint16(bytes.length, 1, true);
    central.setUint16(bytes.length + 2, 16, true);
    central.setBigUint64(bytes.length + 4, BigInt(view.getUint32(header.offset + 24, true)), true);
    central.setBigUint64(bytes.length + 12, BigInt(view.getUint32(header.offset + 20, true)), true);
    directory.push(next);
  }
  const directoryStart = headers[0].offset;
  const directorySize = directory.reduce((sum, bytes) => sum + bytes.length, 0);
  const result = new Uint8Array(directoryStart + directorySize + 22);
  result.set(archive.subarray(0, directoryStart));
  let offset = directoryStart;
  for (const bytes of directory) { result.set(bytes, offset); offset += bytes.length; }
  result.set(archive.subarray(archive.length - 22), offset);
  new DataView(result.buffer).setUint32(offset + 12, directorySize, true);
  return result;
}

test("small native exports with ZIP64 entry sizes and ZIP32 footer import intact", async () => {
  const archive = withZip64EntrySizes(archiveWithSource(6));
  for (const name of ["desktop.xriftstudio", "desktop.zip"]) {
    const result = await transfer.readBrowserProjectArchive(new File([archive], name));
    assert.deepEqual(result.files.get("assets/imported/model.glb"), new Uint8Array(16384).fill(42));
    assert.equal(result.documents.project.metadata.name, "tablet-world");
  }
});

test("ZIP64 footer and entry metadata remain compatible within browser limits", async () => {
  const archive = withZip64EntrySizes(archiveWithSource(6));
  const oldFooter = archive.length - 22;
  const original = new DataView(archive.buffer);
  const count = original.getUint16(oldFooter + 10, true);
  const result = new Uint8Array(archive.length + 76);
  result.set(archive.subarray(0, oldFooter));
  result.set(archive.subarray(oldFooter), oldFooter + 76);
  const view = new DataView(result.buffer);
  view.setUint32(oldFooter, 0x06064b50, true);
  view.setBigUint64(oldFooter + 4, 44n, true);
  view.setUint16(oldFooter + 12, 45, true);
  view.setUint16(oldFooter + 14, 45, true);
  view.setBigUint64(oldFooter + 24, BigInt(count), true);
  view.setBigUint64(oldFooter + 32, BigInt(count), true);
  view.setBigUint64(oldFooter + 40, BigInt(original.getUint32(oldFooter + 12, true)), true);
  view.setBigUint64(oldFooter + 48, BigInt(original.getUint32(oldFooter + 16, true)), true);
  view.setUint32(oldFooter + 56, 0x07064b50, true);
  view.setBigUint64(oldFooter + 64, BigInt(oldFooter), true);
  view.setUint32(oldFooter + 72, 1, true);
  view.setUint16(oldFooter + 84, 0xffff, true);
  view.setUint16(oldFooter + 86, 0xffff, true);
  view.setUint32(oldFooter + 88, 0xffffffff, true);
  view.setUint32(oldFooter + 92, 0xffffffff, true);
  const restored = await transfer.readBrowserProjectArchive(new File([result], "zip64.zip"));
  assert.deepEqual(restored.files.get("assets/imported/model.glb"), new Uint8Array(16384).fill(42));
});

test("stored and Deflate archives reject corrupted source bytes using ZIP CRC", async () => {
  for (const level of [0, 6]) {
    const archive = archiveWithSource(level);
    const view = new DataView(archive.buffer);
    const source = centralHeaders(archive).find((header) => header.name.endsWith("model.glb"));
    if (level === 0) {
      const local = view.getUint32(source.offset + 42, true);
      const payload = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      archive[payload] ^= 1;
    } else view.setUint32(source.offset + 16, view.getUint32(source.offset + 16, true) ^ 1, true);
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "corrupt.xriftstudio")), /破損/);
  }
});

test("actual extraction size must match the directory before source bytes are accepted", async () => {
  for (const level of [0, 6]) {
    const archive = archiveWithSource(level);
    const source = centralHeaders(archive).find((header) => header.name.endsWith("model.glb"));
    new DataView(archive.buffer).setUint32(source.offset + 24, 1, true);
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "wrong-size.zip")), /破損/);
  }
  const archive = archiveWithSource(6);
  const source = centralHeaders(archive).find((header) => header.name.endsWith("model.glb"));
  new DataView(archive.buffer).setUint32(source.offset + 24, transfer.BROWSER_PROJECT_ARCHIVE_MAX_BYTES + 1, true);
  await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "oversized.zip")), /256 MB/);
});

test("missing project source files are rejected on import, before saving a broken project", async () => {
  const documents = projectDocuments();
  documents.assets.assets["asset-model"] = {
    id: "asset-model", name: "Missing model", kind: "model", status: "ready", importSettings: { scale: 1, generateColliders: false, optimizeMeshes: false, importAnimations: true }, materialSlots: [],
    source: { kind: "project", relativePath: "assets/imported/missing.glb" },
  };
  const archive = zipSync(Object.fromEntries(transfer.browserProjectDocumentFiles(documents)));
  await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "missing.xriftstudio")), /素材.*見つかりません/);
});


test("invalid directory metadata is rejected before extraction", async () => {
  const original = archiveWithSource(6);
  const source = centralHeaders(original).find((header) => header.name.endsWith("model.glb"));
  for (const mutate of [
    (view) => view.setUint32(source.offset + 42, original.length, true),
    (view) => view.setUint16(source.offset + 28, 65535, true),
    (view) => view.setUint32(source.offset, 0, true),
    (view) => view.setUint16(source.offset + 8, 1, true),
    (view) => view.setUint32(source.offset + 20, 0xffffffff, true),
  ]) {
    const archive = original.slice();
    mutate(new DataView(archive.buffer));
    await assert.rejects(() => transfer.readBrowserProjectArchive(new File([archive], "malformed.zip")), /破損/);
  }
  const tooMany = original.slice();
  const footer = tooMany.length - 22;
  const view = new DataView(tooMany.buffer);
  view.setUint16(footer + 8, 20001, true);
  view.setUint16(footer + 10, 20001, true);
  await assert.rejects(() => transfer.readBrowserProjectArchive(new File([tooMany], "too-many.zip")), /20,000/);
});
