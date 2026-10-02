import {
  isTextureImportCompression,
  loadTextureImportCompression,
  loadTextureImportMaxSize,
  saveTextureImportCompression,
  saveTextureImportMaxSize,
  TEXTURE_IMPORT_COMPRESSION_STORAGE_KEY,
  TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY,
  isTextureImportMaxSize,
  textureImportSettingsPatch,
  DEFAULT_TEXTURE_IMPORT_MAX_SIZE,
  DEFAULT_TEXTURE_IMPORT_COMPRESSION,
} from "./texture-import-defaults";
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  normalizeTextureImportSettings,
  type TextureAsset,
} from "../../lib/visual-editor/asset-manifest";
import { createAssetImportPlan, commitAssetImportPlan } from "../../lib/visual-editor/asset-import";
import { readImageDimensions } from "../../lib/visual-editor/gltf-derived-assets";
import { planTextureConversion } from "../../lib/visual-editor/texture-conversion";

/**
 * 取り込み時の共通設定（最大解像度・圧縮方式）が、Inspectorと同じ
 * Import設定へ写ることを確かめる。ここが崩れると、複数選択で取り込んだ
 * Textureだけ圧縮されない、といったサーフェス間の食い違いに戻る。
 */
export async function runTextureImportDefaultsFixtureAssertions(): Promise<void> {
  assertPatchShapes();
  assertPatchDrivesConversion();
  const defaults = textureImportSettingsPatch(DEFAULT_TEXTURE_IMPORT_MAX_SIZE, DEFAULT_TEXTURE_IMPORT_COMPRESSION);
  assert(defaults === undefined, "New imports must preserve source bytes without automatic resize or KTX2 compression");
  const original: TextureAsset = {
    id: "panorama", kind: "texture", name: "panorama", status: "ready",
    source: { kind: "project", relativePath: "assets/textures/panorama.png" },
    importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 8192, width: 4096, height: 2048 },
    importSettings: normalizeTextureImportSettings(defaults),
  };
  assert(planTextureConversion(original) === null, "A full-size PNG panorama must not schedule a conversion by default");
  assertStoredChoices();
  await assertPngSourceBytes();
}

function assertPatchShapes(): void {
  assert(
    textureImportSettingsPatch("original", "source") === undefined,
    "原寸・形式そのままの取り込みが不要な変換を予約した",
  );
  const resizeOnly = textureImportSettingsPatch(1024, "source");
  assert(
    resizeOnly?.resize?.mode === "max-size" &&
      resizeOnly.resize.maxSize === 1024 &&
      resizeOnly.compression === undefined,
    "最大解像度だけの取り込み設定が正しく写らなかった",
  );
  const compressionOnly = textureImportSettingsPatch("original", "ktx2");
  assert(
    compressionOnly?.compression?.format === "ktx2" &&
      compressionOnly.resize === undefined,
    "圧縮方式だけの取り込み設定が正しく写らなかった",
  );
  const both = textureImportSettingsPatch(2048, "webp");
  assert(
    both?.resize?.mode === "max-size" &&
      both.resize.maxSize === 2048 &&
      both.compression?.format === "webp",
    "最大解像度と圧縮方式の組み合わせが正しく写らなかった",
  );
  assert(
    isTextureImportMaxSize(1024) &&
      !isTextureImportMaxSize(1000) &&
      isTextureImportCompression("ktx2") &&
      !isTextureImportCompression("avif"),
    "取り込み設定の判定が期待と違う",
  );
}

/** 取り込み設定が、そのまま変換計画（＝公開時と同じ計算）を起こすこと。 */
function assertPatchDrivesConversion(): void {
  const patch = textureImportSettingsPatch(1024, "ktx2");
  const asset: TextureAsset = {
    id: "texture-import-defaults-fixture",
    kind: "texture",
    name: "wall",
    folderId: null,
    status: "ready",
    source: { kind: "project", relativePath: "assets/textures/wall.png" },
    sourceHash: "fixture",
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: 4096,
      width: 4096,
      height: 2048,
    },
    importSettings: normalizeTextureImportSettings(patch),
  };
  const conversion = planTextureConversion(asset);
  assert(
    conversion?.outputFormat === "ktx2" && conversion.maxSize === 1024,
    "取り込み設定がKTX2変換の計画に反映されなかった",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Existing Assets are untouched; only future-import preferences move to v2. */
function assertStoredChoices(): void {
  if (typeof window === "undefined") return;
  const keys = [TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY, TEXTURE_IMPORT_COMPRESSION_STORAGE_KEY,
    "xrift-studio.visual-editor.texture-import-max-size.v1",
    "xrift-studio.visual-editor.texture-import-compression.v1"];
  const previous = keys.map(key => window.localStorage.getItem(key));
  try {
    keys.forEach(key => window.localStorage.removeItem(key));
    window.localStorage.setItem(keys[2], "1024");
    window.localStorage.setItem(keys[3], "ktx2");
    assert(loadTextureImportMaxSize() === "original" && loadTextureImportCompression() === "source",
      "Legacy automatic compression preferences must not silently opt in after the fix");
    saveTextureImportMaxSize(2048);
    saveTextureImportCompression("webp");
    assert(loadTextureImportMaxSize() === 2048 && loadTextureImportCompression() === "webp",
      "Explicit optimization choices must remain available and persist");
    saveTextureImportMaxSize("original");
    saveTextureImportCompression("source");
    assert(textureImportSettingsPatch(loadTextureImportMaxSize(), loadTextureImportCompression()) === undefined,
      "Returning to original settings must stop automatic conversion");
    window.localStorage.setItem(keys[0], "invalid");
    window.localStorage.setItem(keys[1], "invalid");
    assert(loadTextureImportMaxSize() === "original" && loadTextureImportCompression() === "source",
      "Invalid preferences must fall back to original-preserving defaults");
  } finally {
    keys.forEach((key, index) => previous[index] === null
      ? window.localStorage.removeItem(key)
      : window.localStorage.setItem(key, previous[index]!));
  }
}

/** Transparent red and half-transparent green pixels in a real 2:1 RGBA PNG. */
async function assertPngSourceBytes(): Promise<void> {
  const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwHAipQEAC6ECrCMZHVoAAAAASUVORK5CYII="), value => value.charCodeAt(0));
  const plan = await createAssetImportPlan({
    fileName: "rgba-panorama.png", mimeType: "image/png", bytes,
    textureImportSettings: textureImportSettingsPatch(DEFAULT_TEXTURE_IMPORT_MAX_SIZE, DEFAULT_TEXTURE_IMPORT_COMPRESSION),
  });
  assert(plan.canCommit && plan.asset?.kind === "texture", "A valid PNG must be importable with original-preserving defaults");
  const original = plan.writes.find(write => write.purpose === "source");
  assert(original?.payload.encoding === "bytes", "The original PNG must be written directly");
  if (original?.payload.encoding !== "bytes") return;
  const written = original.payload.bytes;
  assert(written.length === bytes.length && written.every((value, index) => value === bytes[index]),
    "PNG source bytes, including color and alpha, must be preserved exactly");
  const size = readImageDimensions(written, "png")?.dimensions;
  assert(size?.width === 2 && size.height === 1 && written[25] === 6,
    "PNG dimensions and RGBA color type must remain unchanged");
  const committed = await commitAssetImportPlan({ schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: {} }, plan, async () => undefined);
  const asset = committed.assets[plan.asset!.id];
  assert(asset.kind === "texture" && asset.importMetadata?.sourceFormat === "png" && !asset.optimizedFrom && planTextureConversion(asset) === null,
    "Committing a PNG must keep the original source without a pending conversion");
}
