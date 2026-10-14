import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript-test-api";
import { indexedDB } from "fake-indexeddb";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const file = fileURLToPath(new URL(specifier, context.parentURL));
      if (existsSync(`${file}.ts`)) return next(pathToFileURL(`${file}.ts`).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return next(url, context);
  },
});
const ai = await import("../src/lib/ai-lowpoly-props-store.ts");
const shared = await import("../src/lib/shared-material-library-store.ts");
const storage = await import("../src/lib/browser-project-storage.ts");
const { hasGlbContainerHeader, readGlbResponse } = await import("../src/lib/glb-container.ts");
hooks.deregister();
const MAX_BYTES = 128 * 1024 * 1024;
const aiRoot = "https://apps.n-jelly.com/ai-lowpoly-props";
const sharedRoot = "https://shared-material-library.kkkkkkasdad.chatgpt.site";
const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

function glb(binaryLength) {
  const document = { asset: { version: "2.0" }, buffers: [{ byteLength: binaryLength }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0,0,0], max: [1,1,0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonLength + binaryLength), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength); bytes.set(encoded, 20);
  header.setUint32(20 + jsonLength, binaryLength, true); header.setUint32(24 + jsonLength, 0x004e4942, true);
  new Float32Array(bytes.buffer, 28 + jsonLength, 9).set([0,0,0,1,0,0,0,1,0]);
  return bytes;
}
function stream(bytes, chunkSize = 1024 * 1024) {
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const end = Math.min(bytes.length, offset + chunkSize);
    controller.enqueue(bytes.subarray(offset, end)); offset = end;
  } }), { headers: { "content-length": String(bytes.length) } });
}
function browserPrimitives(t) {
  const previousReader = globalThis.FileReader, previousDB = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  globalThis.FileReader = class { readAsDataURL(blob) {
    blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); });
  } };
  t.after(() => {
    if (previousReader === undefined) delete globalThis.FileReader; else globalThis.FileReader = previousReader;
    if (previousDB === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = previousDB;
  });
}
function aiModel(file) {
  return { id: "large_model", name_en: "Large original model", triangles: 1, previews: [], downloads: [file], asset_license: { id: "CC0-1.0" } };
}
function sharedFile(size, sha256, format = "glb") {
  return { filename: `large_model.${format}`, url: `${sharedRoot}/api/v1/download/large_model.${format}`,
    format, available: true, size, sha256, animated: true };
}
function sharedInfo(type = "model") {
  return { id: "large_model", type, name: "Original animated model", license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" } };
}

test("GLB stream validates a fragmented prefix, exact length and JSON chunk before accepting bytes", async () => {
  const bytes = glb(36);
  assert.deepEqual(await readGlbResponse(stream(bytes, 3), "invalid GLB"), bytes);
  for (const variant of ["signature", "version", "json", "chunk", "truncated", "appended"]) {
    const damaged = variant === "appended" ? new Uint8Array(bytes.length + 4) : bytes.slice(0, variant === "truncated" ? -4 : undefined);
    if (variant === "appended") damaged.set(bytes);
    if (variant === "signature") damaged[0] = 0;
    if (variant === "version") damaged[4] = 1;
    if (variant === "json") damaged[16] = 0;
    if (variant === "chunk") new DataView(damaged.buffer).setUint32(12, damaged.length, true);
    await assert.rejects(readGlbResponse(stream(damaged, 3), "invalid GLB"), /invalid GLB/, variant);
  }
  let canceled = false;
  const invalid = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { canceled = true; } }));
  await assert.rejects(readGlbResponse(invalid, "invalid GLB"), /invalid GLB/);
  assert.equal(canceled, true);
  const header = bytes.slice(0, 20); new DataView(header.buffer).setUint32(8, 1024 * 1024 * 1024, true);
  assert.equal(hasGlbContainerHeader(header, 1024 * 1024 * 1024), true);
  assert.equal(hasGlbContainerHeader(header, 1024 * 1024 * 1024 + 4), false);
});

test("both catalogs offer declared GLB sizes over 128 MiB; PNG and catalog JSON keep their limits", async (t) => {
  const size = 1024 * 1024 * 1024;
  t.mock.method(globalThis, "fetch", async (input) => String(input).startsWith(aiRoot)
    ? json({ id: "large_model", files: [{ format: "glb", url: `${aiRoot}/assets/large_model.glb`, size, sha256: null }] })
    : String(input).includes("/files/") ? json({ id: "large_model", files: [sharedFile(size, null)] }) : json(sharedInfo()));
  assert.equal((await ai.getAiLowpolyPropsAssetOptions("large_model")).resolutions[0].byteLength, size);
  assert.equal((await shared.getSharedLibraryAssetOptions("large_model")).resolutions[0].byteLength, size);
  globalThis.fetch = async input => String(input).includes("/files/") ? json({ id: "large_model", files: [sharedFile(size, null, "png")] }) : json(sharedInfo("texture"));
  await assert.rejects(shared.getSharedLibraryAssetOptions("large_model"), /128 MiB/);
  globalThis.fetch = async () => new Response("{}", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } });
  await assert.rejects(ai.getAiLowpolyPropsAssetOptions("large_model"), /容量/);
  await assert.rejects(shared.getSharedLibraryAssetOptions("large_model"), /大きすぎ/);
  globalThis.fetch = async input => String(input).includes("/download/")
    ? new Response(new Uint8Array(24), { headers: { "content-length": String(MAX_BYTES + 1) } })
    : String(input).includes("/files/") ? json({ id: "large_model", files: [sharedFile(null, null, "png")] }) : json(sharedInfo("texture"));
  await assert.rejects(shared.installSharedLibraryAsset("isolated", { providerId: "shared-material-library", externalId: "large_model", resolution: "large_model.png" }, async () => assert.fail("PNG must not commit")), /大きすぎ/);
});

test("AI LOWPOLY PROPS installs and rereads original GLB above 128 MiB, including a GLB transaction above 320 MiB", async (t) => {
  browserPrimitives(t);
  const bytes = glb(MAX_BYTES + 4), sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = { format: "glb", url: `${aiRoot}/assets/large_model.glb`, size: bytes.length, sha256 };
  t.mock.method(globalThis, "fetch", async input => String(input).includes("/info/") ? json(aiModel(file)) : stream(bytes));
  const project = await storage.createBrowserProject(new Map(), { activate: false });
  t.after(() => storage.deleteBrowserProject(project));
  let commits = 0;
  const result = await ai.installAiLowpolyPropsAsset(project, { providerId: "ai-lowpoly-props", externalId: "large_model", resolution: "src" }, async (path, id, writes) => {
    commits++;
    await assert.rejects(storage.commitBrowserAssetImport(path, id, [{ ...writes[0], relativePath: "assets/imported/oversized.png" }]), /payload size/);
    const batch = [writes[0], { ...writes[0], relativePath: "assets/imported/second-original.glb" }, { ...writes[0], relativePath: "assets/imported/third-original.glb" }];
    assert.ok(bytes.length * batch.length > 320 * 1024 * 1024);
    await storage.commitBrowserAssetImport(path, id, batch);
  });
  assert.equal(commits, 1); assert.equal(result.files[0].byteLength, bytes.length); assert.equal(result.files[0].sha256, sha256);
  assert.equal(result.licenseName, "CC0-1.0");
  assert.equal((await storage.listBrowserFiles(project, "assets/imported")).filter(entry => entry.name.endsWith(".glb")).length, 2);
  const reread = await storage.readBrowserFile(project, result.files[0].relativePath);
  assert.equal(createHash("sha256").update(reread).digest("hex"), sha256);
  assert.equal(reread.byteLength, bytes.length);
  const dataUrl = await storage.readBrowserFileDataUrl(project, result.files[0].relativePath);
  assert.match(dataUrl.slice(0, 64), /^data:model\/gltf-binary;base64,/);
  assert.equal(Buffer.from(dataUrl.split(",")[1], "base64").length, bytes.length);
});

test("shared material library installs the large original GLB and retains its hash and supplied license", async (t) => {
  browserPrimitives(t);
  const bytes = glb(MAX_BYTES + 4), sha256 = createHash("sha256").update(bytes).digest("hex");
  t.mock.method(globalThis, "fetch", async input => String(input).includes("/download/") ? stream(bytes)
    : String(input).includes("/files/") ? json({ id: "large_model", files: [sharedFile(bytes.length, sha256)] }) : json(sharedInfo()));
  let commits = 0;
  const result = await shared.installSharedLibraryAsset("isolated", { providerId: "shared-material-library", externalId: "large_model", resolution: "large_model.glb" }, async (_path, _id, writes) => {
    commits++; assert.equal(writes.length, 1);
    assert.match(writes[0].relativePath, new RegExp(`${sha256}\\.glb$`));
    assert.equal(writes[0].dataUrl.length, "data:model/gltf-binary;base64,".length + Math.ceil(bytes.length / 3) * 4);
  });
  assert.equal(commits, 1); assert.equal(result.files[0].byteLength, bytes.length); assert.equal(result.files[0].sha256, sha256);
  assert.equal(result.licenseName, "CC BY 4.0"); assert.equal(result.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
});

test("shared library still rejects hash, size, source, and signature mismatches before writing", async (t) => {
  const bytes = glb(36), sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const failure of ["hash", "size", "url", "glb"]) {
    const file = { ...sharedFile(bytes.length, sha256), ...(failure === "hash" ? { sha256: "0".repeat(64) } : {}),
      ...(failure === "size" ? { size: bytes.length + 4 } : {}), ...(failure === "url" ? { url: "https://example.com/large_model.glb" } : {}) };
    t.mock.method(globalThis, "fetch", async input => String(input).includes("/download/") ? stream(failure === "glb" ? new Uint8Array(20) : bytes)
      : String(input).includes("/files/") ? json({ id: "large_model", files: [file] }) : json(sharedInfo()));
    await assert.rejects(shared.installSharedLibraryAsset("isolated", { providerId: "shared-material-library", externalId: "large_model", resolution: "large_model.glb" }, async () => assert.fail("Invalid source must not commit")), /ハッシュ|容量|配布先|形式/, failure);
    t.mock.restoreAll();
  }
});
