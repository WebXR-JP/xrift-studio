import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-external-store-merge-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { mergeExternalStoreImport } = await server.ssrLoadModule("/src/lib/visual-editor/external-store.ts");
const { createDefaultMaterialAsset } = await server.ssrLoadModule("/src/lib/visual-editor/asset-manifest.ts");
const material = (id, name = id) => createDefaultMaterialAsset({ id, name });
const manifest = () => ({ schemaVersion: "0.1.0", assets: { old: material("old"), untouched: material("untouched") } });

test("analyzed import preserves concurrent thumbnails, unrelated author edits and new assets", () => {
  const before = manifest();
  const imported = { ...before, assets: { ...before.assets, incoming: material("incoming") }, folders: { store: { id: "store", name: "Store", parentId: null, order: 0 } } };
  const latest = structuredClone(before);
  latest.assets.old.thumbnail = { status: "generated", derivedPath: "assets/derived/old.png", sourceHash: "fixture", rendererVersion: "fixture" };
  latest.assets.untouched.name = "手動で変更";
  latest.assets.manual = material("manual");
  const merged = mergeExternalStoreImport(before, imported, latest);
  assert.equal(merged.assets.old, latest.assets.old);
  assert.equal(merged.assets.untouched.name, "手動で変更");
  assert.equal(merged.assets.manual, latest.assets.manual);
  assert.equal(merged.assets.incoming, imported.assets.incoming);
  assert.deepEqual(merged.folders.store, imported.folders.store);
  assert.equal(before.assets.untouched.name, "untouched");
});

test("replacement accepts only background thumbnails and refuses edited, deleted or conflicting target IDs", () => {
  const before = manifest();
  const imported = { ...before, assets: { ...before.assets, old: material("old", "Imported replacement") } };
  const thumbnailOnly = structuredClone(before); thumbnailOnly.assets.old.thumbnail = { status: "missing" };
  assert.equal(mergeExternalStoreImport(before, imported, thumbnailOnly).assets.old.name, "Imported replacement");
  for (const change of [latest => { latest.assets.old.name = "手動"; }, latest => { delete latest.assets.old; }]) {
    const latest = structuredClone(before); change(latest);
    assert.throws(() => mergeExternalStoreImport(before, imported, latest), /処理中に編集/);
  }
  const add = { ...before, assets: { ...before.assets, incoming: material("incoming") } };
  const latest = { ...before, assets: { ...before.assets, incoming: material("incoming", "手動") } };
  assert.throws(() => mergeExternalStoreImport(before, add, latest), /処理中に編集/);
});

test("derived-asset removals and imported folders are checked without deleting unrelated assets", () => {
  const before = manifest();
  const imported = { ...before, assets: { untouched: before.assets.untouched } };
  assert.equal(mergeExternalStoreImport(before, imported, before).assets.old, undefined);
  const edited = structuredClone(before); edited.assets.old.name = "手動";
  assert.throws(() => mergeExternalStoreImport(before, imported, edited), /処理中に編集/);
  const withFolder = { ...before, folders: { store: { id: "store", name: "Store", parentId: null, order: 0 } } };
  const folderImport = { ...withFolder, assets: { ...withFolder.assets, incoming: { ...material("incoming"), folderId: "store" } } };
  const deletedFolder = { ...withFolder, folders: {} };
  assert.throws(() => mergeExternalStoreImport(withFolder, folderImport, deletedFolder), /フォルダー/);
  const addFolder = { ...before, folders: withFolder.folders };
  const conflictingFolder = { ...before, folders: { store: { ...withFolder.folders.store, name: "手動" } } };
  assert.throws(() => mergeExternalStoreImport(before, addFolder, conflictingFolder), /フォルダー/);
});
