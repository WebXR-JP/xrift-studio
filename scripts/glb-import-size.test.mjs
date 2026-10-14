import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-glb-import-size-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { classifyAssetImport, assetImportSizeIsSupported, ASSET_IMPORT_MAX_BYTES, createAssetImportPlan } = await server.ssrLoadModule("/src/lib/visual-editor/asset-import.ts");

function header(size) {
  const bytes = new Uint8Array(20), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, size, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

test("verified large GLB containers are accepted while generic quotas and signature checks remain", () => {
  const size = 1024 * 1024 * 1024, bytes = header(size), glb = classifyAssetImport("model.glb");
  assert.ok(assetImportSizeIsSupported(glb, size, bytes));
  assert.ok(!assetImportSizeIsSupported(glb, size + 4, bytes));
  for (const fileName of ["model.gltf", "model.vrm", "model.obj", "texture.png", "sound.wav", "sky.hdr"]) {
    assert.ok(!assetImportSizeIsSupported(classifyAssetImport(fileName), size, bytes), fileName);
  }
  const malformed = bytes.slice(); malformed[0] = 0;
  assert.ok(!assetImportSizeIsSupported(glb, size, malformed));
  assert.ok(!assetImportSizeIsSupported(glb, 0, bytes));
});

test("the real importer parses a GLB above 128 MiB and keeps its source bytes and triangle", async () => {
  const binaryLength = ASSET_IMPORT_MAX_BYTES + 4;
  const json = { asset: { version: "2.0" }, buffers: [{ byteLength: binaryLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0, name: "LargeSourceTriangle" }], scenes: [{ nodes: [0] }], scene: 0 };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const total = 20 + jsonLength + 8 + binaryLength;
  const source = new Uint8Array(total), view = new DataView(source.buffer);
  source.set(header(total));
  view.setUint32(12, jsonLength, true);
  source.fill(0x20, 20, 20 + jsonLength);
  source.set(encoded, 20);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Float32Array(source.buffer, 28 + jsonLength, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const plan = await createAssetImportPlan({ fileName: "large-source.glb", bytes: source, mimeType: "model/gltf-binary" });
  assert.ok(plan.canCommit, JSON.stringify(plan.diagnostics));
  assert.equal(plan.asset.kind, "model");
  assert.equal(plan.asset.importMetadata.byteLength, total);
  const saved = plan.writes.find(write => write.purpose === "source" && write.relativePath.endsWith(".glb"));
  assert.equal(saved.payload.bytes.byteLength, total);
  assert.deepEqual(saved.payload.bytes.subarray(0, 20), source.subarray(0, 20));
  assert.deepEqual(new Float32Array(saved.payload.bytes.buffer, saved.payload.bytes.byteOffset + 28 + jsonLength, 9), new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  assert.ok(!plan.diagnostics.some(diagnostic => diagnostic.code === "asset-too-large"));
});
