import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript-test-api";
import { indexedDB } from "fake-indexeddb";

// Execute the production TS modules without requiring a browser installation.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const file = fileURLToPath(new URL(specifier, context.parentURL));
      if (existsSync(`${file}.ts`)) return next(pathToFileURL(`${file}.ts`).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return next(url, context);
  },
});
const store = await import("../src/lib/ai-lowpoly-props-store.ts");
const storage = await import("../src/lib/browser-project-storage.ts");
hooks.deregister();
const root = "https://apps.n-jelly.com/ai-lowpoly-props";
const glb = readFileSync(new URL("../public/visual-editor/catalog-samples/catalog-vase.glb", import.meta.url));
const sha256 = createHash("sha256").update(glb).digest("hex");
const file = { format: "glb", url: `${root}/assets/test_vase.${sha256.slice(0, 12)}.glb`, size: glb.length, sha256 };
const model = {
  id: "test_vase", name_ja: "木製ランタン", name_en: "Wooden Lantern", tags: ["wood"],
  triangles: 1262, dimensions_m: [1, 2, 3], previews: [], downloads: [file],
  keywords_ja: ["灯り", "らんたん"], keywords_en: ["wooden lantern"], asset_license: { id: "CC0-1.0" },
};
const version = "a".repeat(64);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const collection = (items, offset, next, total, catalogVersion = version) => ({
  items, offset, next_offset: next, total, limit: 100, catalog_version: catalogVersion, catalog_asset_count: total,
});

test("all catalog pages share a version, including multilingual search and Blender dimension axes", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return json(Number(url.searchParams.get("offset")) === 0
      ? collection([model], 0, 1, 2) : collection([{ ...model, id: "last_model" }], 1, null, 2));
  });
  const assets = await store.listAiLowpolyPropsAssets();
  assert.equal(assets.length, 2);
  assert.equal(requests[1].searchParams.get("catalog_version"), version);
  assert.equal(requests[0].searchParams.get("include"), "previews,keywords");
  assert.deepEqual(assets[0].dimensionsMm, [1000, 2000, 3000]);
  for (const query of ["木製,ﾗﾝﾀﾝ", "ＷＯＯＤＥＮ lantern", "灯り", "test_vase"]) {
    assert.equal(store.matchesAiLowpolyPropsQuery(assets[0], query), true, query);
  }
  assert.equal(store.matchesAiLowpolyPropsQuery(assets[0], "wooden missing"), false);
});

test("409 discards the old pages and restarts once; repeated changes terminate", async (t) => {
  let changed = false;
  const offsets = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    if (offset && !changed) { changed = true; return json({}, 409); }
    const current = (changed ? "b" : "a").repeat(64);
    if (offset) assert.equal(url.searchParams.get("catalog_version"), current);
    return json(collection([{ ...model, id: offset ? "last" : changed ? "new" : "old" }], offset, offset ? null : 1, 2, current));
  });
  assert.deepEqual((await store.listAiLowpolyPropsAssets()).map((item) => item.externalId), ["new", "last"]);
  assert.deepEqual(offsets, [0, 1, 0, 1]);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}, 409); };
  await assert.rejects(store.listAiLowpolyPropsAssets(), /更新されました/);
  assert.equal(calls, 2);
});

test("invalid pagination and failed catalogs return an error, never partial results", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(collection([model], 0, 0, 2)));
  await assert.rejects(store.listAiLowpolyPropsAssets(), /次ページ/);
  globalThis.fetch = async () => json({}, 502);
  await assert.rejects(store.listAiLowpolyPropsAssets(), /502/);
});

for (const failure of ["hash", "url", "license", "size", "glb", "id"]) {
  test(`reject ${failure} before committing any project file`, async (t) => {
    const downloads = [{ ...file,
      ...(failure === "hash" ? { sha256: "0".repeat(64) } : {}),
      ...(failure === "url" ? { url: "https://example.com/test_vase.glb" } : {}),
      ...(failure === "size" ? { size: glb.length + 1 } : {}),
    }];
    t.mock.method(globalThis, "fetch", async (input) => String(input).includes("/info/")
      ? json({ ...model, downloads, ...(failure === "license" ? { asset_license: { id: "other" } } : {}), ...(failure === "id" ? { id: "wrong" } : {}) })
      : new Response(failure === "glb" ? Buffer.alloc(glb.length) : glb));
    let writes = 0;
    await assert.rejects(store.installAiLowpolyPropsAsset("isolated-test", {
      providerId: "ai-lowpoly-props", externalId: "test_vase", resolution: "src",
    }, async () => { writes++; }), /ハッシュ|配布先|CC0|容量|GLB|ID/);
    assert.equal(writes, 0);
  });
}

test("verified original GLB and CC0 persist through browser storage; write failure propagates", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => String(input).includes("/info/") ? json(model) : new Response(glb));
  // Only the browser's byte-to-data-URL primitive is supplied by the Node harness.
  const previousFileReader = globalThis.FileReader;
  t.after(() => {
    if (previousFileReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = previousFileReader;
  });
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((bytes) => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); });
    }
  };
  const previousIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  t.after(() => {
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  });
  const projectPath = await storage.createBrowserProject(new Map(), { activate: false });
  let writes;
  const result = await store.installAiLowpolyPropsAsset(projectPath, {
    providerId: "ai-lowpoly-props", externalId: "test_vase", resolution: "src",
  }, async (path, id, value) => {
    assert.equal(path, projectPath);
    assert.match(id, /^asset-import-ai-lowpoly-props-/);
    writes = value;
    await storage.commitBrowserAssetImport(path, id, value);
  });
  assert.equal(result.licenseName, "CC0-1.0");
  assert.equal(result.files[0].sha256, sha256);
  assert.match(writes[0].relativePath, new RegExp(`test_vase\\.${sha256}\\.glb$`));
  assert.deepEqual(Buffer.from(writes[0].dataUrl.split(",")[1], "base64"), glb);
  assert.deepEqual(Buffer.from(await storage.readBrowserFile(projectPath, result.files[0].relativePath)), glb);
  await assert.rejects(store.installAiLowpolyPropsAsset("isolated-test", {
    providerId: "ai-lowpoly-props", externalId: "test_vase", resolution: "src",
  }, async () => { throw new Error("disk full"); }), /disk full/);
});
