import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeWhiteFixture(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    assert(offset + length + 12 <= png.length, "Truncated PNG chunk");
    const kind = png.toString("ascii", offset + 4, offset + 8);
    assert.equal(png.readUInt32BE(offset + length + 8), crc32(png.subarray(offset + 4, offset + length + 8)), `${kind} CRC mismatch`);
    chunks.push({ kind, bytes: png.subarray(offset + 8, offset + length + 8) });
    offset += length + 12;
  }
  assert.deepEqual(chunks.map(chunk => chunk.kind), ["IHDR", "IDAT", "IEND"]);
  const header = chunks[0].bytes;
  assert.equal(header.readUInt32BE(0), 1);
  assert.equal(header.readUInt32BE(4), 1);
  // Eight-bit grayscale + alpha, no interlace. Sub on a single pixel has
  // no left neighbor, so its two channel bytes are the decoded pixel.
  assert.deepEqual([...header.subarray(8)], [8, 4, 0, 0, 0]);
  assert.deepEqual([...inflateSync(chunks[1].bytes)], [1, 255, 255]);
}

for (const filename of ["scripts/prepare-classic-mtoon-exports.cjs", "src/lib/visual-editor/classic-export.fixture.ts"]) {
  test(`${filename} uses a valid opaque white 1×1 PNG`, () => {
    const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
    const base64 = source.match(/["'](iVBOR[\w+/=]+)["']/)?.[1];
    assert(base64, "The actual Classic fixture PNG must be inspected");
    decodeWhiteFixture(Buffer.from(base64, "base64"));
  });
}

test("the old PNG is rejected even though its image dimensions and white scanline decode", () => {
  const broken = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP6kAAAAASUVORK5CYII=", "base64");
  assert.throws(() => decodeWhiteFixture(broken), /IDAT CRC mismatch/);
});
