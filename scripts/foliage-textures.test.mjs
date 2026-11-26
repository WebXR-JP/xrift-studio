/**
 * The two pictures the foliage Material samples: the bundled files are the
 * ones the app pins, and their provenance is recorded beside them.
 * Run: node --test scripts/foliage-textures.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, "public", "visual-editor", "foliage", "v1");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8"));

/** The entries of FOLIAGE_TEXTURES, read from the source without running it. */
function pinnedTextures() {
  const source = fs.readFileSync(path.join(root, "src", "lib", "visual-editor", "foliage-textures.ts"), "utf8");
  const list = source.match(/FOLIAGE_TEXTURES[^=]*= \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(list, "foliage-textures.ts must define FOLIAGE_TEXTURES");
  return [...list.matchAll(/\{([^{}]*)\}/g)].map(([, body]) => {
    const field = (name) => body.match(new RegExp(`\\b${name}: (?:"([^"]*)"|(\\d+))`));
    const text = (name) => field(name)?.[1];
    const number = (name) => Number(field(name)?.[2]);
    return {
      assetId: text("assetId"),
      publicPath: text("publicPath"),
      fileName: text("fileName"),
      mimeType: text("mimeType"),
      sha256: text("sha256"),
      byteLength: number("byteLength"),
      width: number("width"),
      height: number("height"),
    };
  });
}

/** Chunk names and the canvas size of an extended WebP file. */
function readWebp(bytes, label) {
  assert.equal(bytes.toString("latin1", 0, 4), "RIFF", `${label}: container`);
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${label}: declared length`);
  assert.equal(bytes.toString("latin1", 8, 12), "WEBP", `${label}: format`);
  const chunks = [];
  for (let offset = 12; offset < bytes.length; ) {
    const size = bytes.readUInt32LE(offset + 4);
    chunks.push(bytes.toString("latin1", offset, offset + 4));
    offset += 8 + size + (size & 1);
  }
  assert.equal(chunks[0], "VP8X", `${label}: extended format`);
  return {
    chunks,
    hasAlpha: (bytes[20] & 0x10) !== 0,
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
  };
}

const textures = pinnedTextures();
const catalog = readJson("catalog.json");
const prompts = readJson("generation-prompts.json");

test("the app pins the leaf picture and the bark picture", () => {
  assert.deepEqual(
    textures.map((texture) => texture.fileName),
    ["foliage-leaves.webp", "foliage-bark.webp"],
  );
});

for (const texture of textures) {
  test(`${texture.fileName}: the bundled file is the one the app pins`, () => {
    const bytes = fs.readFileSync(path.join(folder, texture.fileName));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(sha256, texture.sha256);
    assert.equal(bytes.length, texture.byteLength);
    assert.equal(texture.publicPath, `/visual-editor/foliage/v1/${texture.fileName}`);
    assert.equal(texture.mimeType, "image/webp");
    // The id the import pipeline derives from the file name and the content.
    assert.equal(texture.assetId, `texture-${path.basename(texture.fileName, ".webp")}-${sha256.slice(0, 12)}`);

    // The shader reads the cut-out of the leaves and the height of the bark
    // from alpha, and tiles or mip-filters both: a square power of two.
    const webp = readWebp(bytes, texture.fileName);
    assert.equal(webp.width, texture.width);
    assert.equal(webp.height, texture.height);
    assert.equal(webp.width, webp.height);
    assert.equal(Math.log2(webp.width) % 1, 0, `${texture.fileName}: power of two`);
    assert.ok(webp.hasAlpha && webp.chunks.includes("ALPH"), `${texture.fileName}: alpha channel`);
    // Colour and alpha only: no embedded profile, camera data or editing history.
    assert.deepEqual(webp.chunks, ["VP8X", "ALPH", "VP8 "]);
  });

  test(`${texture.fileName}: the folder's catalog and prompts describe it`, () => {
    const id = path.basename(texture.fileName, ".webp");
    const entry = catalog.find((candidate) => candidate.id === id);
    assert.ok(entry, `catalog.json has no entry for ${id}`);
    assert.equal(entry.fileName, texture.fileName);
    assert.equal(entry.sha256, texture.sha256);
    assert.equal(entry.byteLength, texture.byteLength);
    assert.equal(entry.width, texture.width);
    assert.equal(entry.height, texture.height);
    const prompt = prompts.find((candidate) => candidate.id === id);
    assert.ok(prompt, `generation-prompts.json has no entry for ${id}`);
    for (const key of ["tool", "generatedOn", "inputImages", "prompt", "processing"]) {
      assert.ok(typeof prompt[key] === "string" && prompt[key].length > 0, `${id}: ${key}`);
    }
  });
}

test("the folder holds the pictures, the tree models and their records, and nothing else", () => {
  const models = fs
    .readFileSync(path.join(root, "src", "lib", "visual-editor", "foliage-recipe-models.ts"), "utf8")
    .matchAll(/fileName: "([^"]+\.glb)"/g);
  const expected = [
    "LICENSE.txt",
    "catalog.json",
    "generation-prompts.json",
    ...textures.map((texture) => texture.fileName),
    ...[...models].map(([, fileName]) => fileName),
  ].sort();
  assert.deepEqual(fs.readdirSync(folder).sort(), expected);
  assert.equal(catalog.length, textures.length);
  assert.equal(prompts.length, textures.length);
  assert.match(fs.readFileSync(path.join(folder, "LICENSE.txt"), "utf8"), /^MIT License\r?\n\r?\nCopyright \(c\) 2026 XRift Studio contributors/);
});
