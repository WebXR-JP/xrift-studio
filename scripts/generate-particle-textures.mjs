import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Original monochrome sprites. Particle colors tint the RGB; transparency
// carries the silhouette. No renderer-specific fallback or external artwork.
const size = 256;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (edge, width = 0.02) => clamp(0.5 - edge / width);
const gaussian = (x, y, sx, sy) => Math.exp(-((x / sx) ** 2 + (y / sy) ** 2) * 3);
const polygon = (x, y, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i], [c, d] = points[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside ? 1 : 0;
};
const sprites = [
  { id: "glow", name: "柔らかな光", alpha: (x, y) => gaussian(x, y, 0.6, 0.6) * smooth(Math.hypot(x, y) - 0.93, 0.12) },
  { id: "smoke", name: "煙と霧", alpha: (x, y) => {
    const puffs = [[-.28, .08, .52], [.25, .12, .54], [0, -.26, .58], [-.2, -.28, .42], [.05, .3, .48]];
    const density = puffs.reduce((sum, [px, py, scale]) => sum + gaussian(x - px, y - py, scale, scale), 0);
    return clamp(density * .65) * smooth(Math.hypot(x, y) - .94, .1);
  } },
  { id: "flame", name: "炎", alpha: (x, y) => {
    const height = (y + .9) / 1.75;
    if (height < 0 || height > 1) return 0;
    const center = Math.sin(height * 6) * .13 * (1 - height);
    const width = .5 * Math.sin(Math.PI * height) * (.3 + height);
    return smooth(Math.abs(x - center) - width, .16) * smooth(Math.abs(y) - .88, .12);
  } },
  { id: "streak", name: "細い光の筋", alpha: (x, y) => gaussian(x, y, .13, .9) * smooth(Math.abs(y) - .93, .1) },
  { id: "droplet", name: "水滴", alpha: (x, y) => {
    const t = (y + .85) / 1.6;
    if (t <= 0 || t >= 1) return 0;
    const width = .48 * Math.sin(Math.PI * t) * Math.sqrt(t);
    return smooth(Math.abs(x) - width, .05) * .9;
  } },
  { id: "bubble", name: "泡", alpha: (x, y) => {
    const r = Math.hypot(x, y);
    const rim = Math.exp(-(((r - .7) / .045) ** 2));
    const highlight = gaussian(x + .28, y + .37, .15, .11);
    return clamp(rim * .7 + highlight + (r < .7 ? .035 : 0)) * smooth(r - .8, .04);
  } },
  { id: "petal", name: "桜の花びら", alpha: (x, y) => polygon(x, y, [[0,.82],[-.36,.4],[-.6,-.12],[-.52,-.52],[-.22,-.72],[0,-.48],[.22,-.72],[.52,-.52],[.6,-.12],[.36,.4]]) },
  { id: "leaf", name: "落ち葉", alpha: (x, y) => {
    const shape = polygon(x, y, [[-.12,.85],[-.1,.55],[-.55,.25],[-.75,-.1],[-.48,-.08],[-.58,-.42],[-.22,-.32],[0,-.88],[.22,-.32],[.58,-.42],[.48,-.08],[.75,-.1],[.55,.25],[.1,.55],[.04,.85]]);
    const vein = Math.abs(x) < .014 && y > -.65 && y < .55 ? .55 : 1;
    return shape * vein;
  } },
  { id: "confetti", name: "紙片", alpha: (x, y) => polygon(x, y, [[-.48,-.64],[.36,-.48],[.55,.64],[-.3,.48]]) },
  { id: "snowflake", name: "雪の結晶", alpha: (x, y) => {
    let result = gaussian(x, y, .16, .16);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const along = x * Math.cos(angle) + y * Math.sin(angle);
      const side = -x * Math.sin(angle) + y * Math.cos(angle);
      result = Math.max(result, smooth(Math.abs(side) - .025) * smooth(along - .78) * smooth(-along));
      for (const at of [.36, .56]) result = Math.max(result, smooth(Math.abs(Math.abs(side) - (along - at)) - .018) * smooth(at - along) * smooth(along - at - .16));
    }
    return result;
  } },
  { id: "star", name: "光のきらめき", alpha: (x, y) => {
    const rays = Math.exp(-Math.abs(x) * 20 - Math.abs(y) * 3) + Math.exp(-Math.abs(y) * 20 - Math.abs(x) * 3);
    return clamp(rays + gaussian(x, y, .35, .35) * .5) * smooth(Math.hypot(x, y) - .94, .08);
  } },
];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function png(alpha) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0;
    for (const dy of [.25, .75]) for (const dx of [.25, .75]) coverage += clamp(alpha((x + dx) / size * 2 - 1, (y + dy) / size * 2 - 1));
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set([255, 255, 255, Math.round(coverage / 4 * 255)], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const directory = new URL("../public/visual-editor/particle-textures/v1/", import.meta.url);
const check = process.argv.includes("--check");
if (!check) mkdirSync(directory, { recursive: true });
const manifest = sprites.map(({ id, name, alpha }) => {
  const bytes = png(alpha);
  const target = new URL(`${id}.png`, directory);
  if (check) {
    if (!bytes.equals(readFileSync(target))) throw new Error(`Particle texture differs: ${fileURLToPath(target)}`);
  } else writeFileSync(target, bytes);
  return { id, name, width: size, height: size, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
const target = new URL("../src/lib/visual-editor/particle-textures.manifest.json", import.meta.url);
const json = JSON.stringify(manifest, null, 2) + "\n";
if (check) {
  if (json !== readFileSync(target, "utf8")) throw new Error("Particle texture manifest differs");
} else writeFileSync(target, json);
console.log(`${manifest.length} Particle textures ${check ? "verified" : "generated"}`);
