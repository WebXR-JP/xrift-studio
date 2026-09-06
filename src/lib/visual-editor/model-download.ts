import type { ModelDownloadPlan } from "./compiler/download-plan";

type Json = Record<string, any>;
export type ModelDownloadResult = {
  bytes: Uint8Array;
  beforeBytes: number;
  removedImages: number;
  reused: boolean;
  skipped?: string;
};

// Only extensions whose binary/texture references this pass understands.
// In particular, meshopt, variants, animation pointers, VRM and custom shaders
// must never be silently rewritten by a generic JSON walk.
const SUPPORTED_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression", "KHR_mesh_quantization", "KHR_lights_punctual",
  "KHR_texture_transform", "KHR_texture_basisu", "EXT_texture_webp", "EXT_texture_avif",
  "KHR_materials_unlit", "KHR_materials_clearcoat", "KHR_materials_emissive_strength",
  "KHR_materials_ior", "KHR_materials_iridescence", "KHR_materials_sheen",
  "KHR_materials_specular", "KHR_materials_transmission", "KHR_materials_volume",
  "KHR_materials_anisotropy", "KHR_materials_dispersion", "KHR_materials_pbrSpecularGlossiness",
]);
const CACHE_NAME = "xrift-model-download-v1";
const CACHE_LIMIT = 64 * 1024 * 1024;
const memoryCache = new Map<string, ModelDownloadResult>();

export function describeModelDownload(name: string, result: ModelDownloadResult): string {
  const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  return `${name}: ${mib(result.beforeBytes)} → ${mib(result.bytes.byteLength)}、不要画像${result.removedImages}枚を除外${result.reused ? "（変換結果を再利用）" : ""}${result.skipped ? `。${result.skipped}` : ""}`;
}

/** Content-addressed, bounded cache. Cache failures never prevent publication. */
export async function optimizePublishedModel(
  source: Uint8Array,
  plan: ModelDownloadPlan,
): Promise<ModelDownloadResult> {
  const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map((n) => n.toString(16).padStart(2, "0")).join("");
  const key = `${await digest(source)}-${await digest(new TextEncoder().encode(JSON.stringify(plan)))}`;
  const existing = memoryCache.get(key);
  if (existing) return { ...existing, bytes: existing.bytes.slice(), reused: true };
  let cache: Cache | undefined;
  const url = `https://xrift-studio.invalid/${CACHE_NAME}/${key}`;
  try {
    if (typeof caches !== "undefined") {
      cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      if (response) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const expectedHash = response.headers.get("x-content-sha256");
        if (bytes.byteLength <= source.byteLength && expectedHash === await digest(bytes)) {
          return { bytes, beforeBytes: source.byteLength, removedImages: Number(response.headers.get("x-removed-images") ?? 0), reused: true };
        }
        await cache.delete(url);
      }
    }
  } catch { cache = undefined; }
  const result = compactPublishedGlb(source, plan);
  if (result.bytes.byteLength <= CACHE_LIMIT) {
    // Keep copies so callers cannot corrupt another publication's cache entry.
    memoryCache.set(key, { ...result, bytes: result.bytes.slice() });
    let size = [...memoryCache.values()].reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    for (const [oldKey, entry] of memoryCache) {
      if (size <= CACHE_LIMIT) break;
      memoryCache.delete(oldKey);
      size -= entry.bytes.byteLength;
    }
  }
  if (cache && !result.skipped && result.bytes.byteLength <= CACHE_LIMIT) {
    try {
      await cache.put(url, new Response(new Uint8Array(result.bytes), { headers: {
        "content-type": "model/gltf-binary",
        "content-length": String(result.bytes.byteLength),
        "x-content-sha256": await digest(result.bytes),
        "x-removed-images": String(result.removedImages),
      } }));
      // FIFO eviction bounds persistent storage even after repeated edits.
      const entries = await cache.keys();
      let size = 0;
      for (const request of [...entries].reverse()) {
        const response = await cache.match(request);
        size += Number(response?.headers.get("content-length") ?? CACHE_LIMIT);
        if (size > CACHE_LIMIT) await cache.delete(request);
      }
    } catch { /* Storage may be unavailable or full. The output is still valid. */ }
  }
  return result;
}

/**
 * Lossless GLB surgery: preserve node/material/accessor indices and compressed
 * mesh bytes, remove dead images and repack referenced bufferViews at 4-byte
 * boundaries. No decoder, canvas, image re-encoding or geometry transform.
 */
export function compactPublishedGlb(source: Uint8Array, plan: ModelDownloadPlan): ModelDownloadResult {
  const unchanged = (skipped?: string): ModelDownloadResult => ({ bytes: source, beforeBytes: source.byteLength, removedImages: 0, reused: false, ...(skipped ? { skipped } : {}) });
  try {
    const { json, binary } = readGlb(source);
    const extensions = new Set<string>([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]);
    walk(json, (object) => Object.keys(object.extensions ?? {}).forEach((name) => extensions.add(name)));
    const unsupported = [...extensions].find((name) => !SUPPORTED_EXTENSIONS.has(name));
    if (unsupported) return unchanged(`拡張 ${unsupported} のデータを保持しました`);
    if (json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > binary.byteLength) {
      return unchanged("単一の内蔵バッファを持つGLBだけを最適化します");
    }
    const materials: Json[] = json.materials ?? [];
    const referencedMaterials = new Set<number>();
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        if (primitive.material === undefined) continue;
        if (!Number.isInteger(primitive.material) || !materials[primitive.material]) throw new Error("invalid material reference");
        referencedMaterials.add(primitive.material);
      }
    }
    const clearedMaterials = new Set<number>();
    for (const replacement of plan.replacedMaterials) {
      const material = materials[replacement.index];
      if (!material || material.name !== replacement.name) return unchanged("Materialの番号と名前が取り込み時の情報と一致しません");
      clearedMaterials.add(replacement.index);
    }
    for (const [index, material] of materials.entries()) {
      // Keep material array slots stable even for materials no primitive uses.
      if (!clearedMaterials.has(index) && referencedMaterials.has(index)) continue;
      walk(material, (object) => {
        for (const key of Object.keys(object)) {
          if (key.endsWith("Texture") && object[key] && typeof object[key].index === "number") delete object[key];
        }
      });
    }

    const textureReferences: Array<{ object: Json; key: string }> = [];
    for (const material of materials) walk(material, (object) => {
      for (const [key, value] of Object.entries(object)) {
        if (key.endsWith("Texture") && value && typeof value === "object" && "index" in value) {
          textureReferences.push({ object: value as Json, key: "index" });
        }
      }
    });
    const textures = compactArray(json.textures ?? [], textureReferences);
    const imageReferences: Array<{ object: Json; key: string }> = [];
    for (const texture of textures) {
      if (texture.source !== undefined) imageReferences.push({ object: texture, key: "source" });
      for (const extension of Object.values(texture.extensions ?? {}) as Json[]) {
        if (extension.source !== undefined) imageReferences.push({ object: extension, key: "source" });
      }
    }
    const oldImageCount = (json.images ?? []).length;
    const images = compactArray(json.images ?? [], imageReferences);
    const samplers = compactArray(json.samplers ?? [], textures.filter((texture) => texture.sampler !== undefined).map((object) => ({ object, key: "sampler" })));
    setArray(json, "textures", textures);
    setArray(json, "images", images);
    setArray(json, "samplers", samplers);

    const viewReferences: Array<{ object: Json; key: string }> = [];
    walk(json, (object) => { if (object.bufferView !== undefined) viewReferences.push({ object, key: "bufferView" }); });
    const views = compactArray(json.bufferViews ?? [], viewReferences);
    let binaryLength = 0;
    const parts = views.map((view) => {
      const offset = view.byteOffset ?? 0;
      if (view.buffer !== 0 || !Number.isInteger(offset) || !Number.isInteger(view.byteLength) || offset < 0 || view.byteLength <= 0 || offset + view.byteLength > json.buffers[0].byteLength) throw new Error("invalid bufferView");
      const bytes = binary.subarray(offset, offset + view.byteLength);
      view.byteOffset = binaryLength;
      binaryLength += align4(bytes.byteLength);
      return bytes;
    });
    setArray(json, "bufferViews", views);
    json.buffers[0].byteLength = binaryLength;
    const packed = new Uint8Array(binaryLength);
    parts.forEach((bytes, index) => packed.set(bytes, views[index].byteOffset));
    if (binaryLength === 0) delete json.buffers;
    const bytes = writeGlb(json, packed);
    if (bytes.byteLength >= source.byteLength) return unchanged();
    return { bytes, beforeBytes: source.byteLength, removedImages: oldImageCount - images.length, reused: false };
  } catch {
    return unchanged("GLBの構造を安全に確認できなかったため原本を保持しました");
  }
}

function walk(value: unknown, visit: (object: Json) => void): void {
  if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
  else if (value && typeof value === "object") {
    const object = value as Json;
    visit(object);
    // extras are opaque author metadata, not glTF references.
    Object.entries(object).forEach(([key, entry]) => { if (key !== "extras") walk(entry, visit); });
  }
}

function compactArray(array: Json[], references: Array<{ object: Json; key: string }>): Json[] {
  const used = new Set<number>();
  for (const { object, key } of references) {
    const index = object[key];
    if (!Number.isInteger(index) || index < 0 || index >= array.length) throw new Error("invalid glTF reference");
    used.add(index);
  }
  const ordered = [...used].sort((a, b) => a - b);
  const remap = new Map(ordered.map((old, index) => [old, index]));
  references.forEach(({ object, key }) => { object[key] = remap.get(object[key]); });
  return ordered.map((index) => array[index]);
}

function setArray(json: Json, key: string, values: Json[]): void {
  if (values.length) json[key] = values;
  else delete json[key];
}
function align4(length: number): number { return Math.ceil(length / 4) * 4; }

function readGlb(bytes: Uint8Array): { json: Json; binary: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error("invalid GLB header");
  const length = view.getUint32(12, true);
  if (length % 4 || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("invalid JSON chunk");
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (json.asset?.version !== "2.0") throw new Error("unsupported glTF version");
  const start = 20 + length;
  if (start === bytes.byteLength) return { json, binary: new Uint8Array() };
  const binLength = view.getUint32(start, true);
  if (binLength % 4 || view.getUint32(start + 4, true) !== 0x004e4942 || start + 8 + binLength !== bytes.byteLength) throw new Error("invalid BIN chunk");
  return { json, binary: bytes.subarray(start + 8) };
}

function writeGlb(json: Json, binary: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const textLength = align4(text.byteLength);
  const binLength = align4(binary.byteLength);
  const bytes = new Uint8Array(20 + textLength + (binLength ? 8 + binLength : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, textLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + textLength); bytes.set(text, 20);
  if (binLength) {
    view.setUint32(20 + textLength, binLength, true); view.setUint32(24 + textLength, 0x004e4942, true);
    bytes.set(binary, 28 + textLength);
  }
  return bytes;
}
