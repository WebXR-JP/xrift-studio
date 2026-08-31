import { TEXTURE_MAX_SIZE_CHOICES } from "../../lib/visual-editor/texture-conversion";
import type { TextureImportSettingsPatch } from "../../lib/visual-editor/asset-manifest";

/**
 * 取り込むTextureへ最初から入れておく最大解像度と圧縮方式。
 *
 * Editor State であって制作データではない。Undo履歴にも Asset Manifest にも
 * 入らず、保存に失敗しても取り込みは続けられる。設定は取り込んだTextureの
 * Import設定になり、取り込み時に編集用画像へ適用される。元画像を保持するので、
 * 後から Inspector で元画像から解像度・形式を変え直せる。
 */
export type TextureImportMaxSize = "original" | (typeof TEXTURE_MAX_SIZE_CHOICES)[number];

/** "source" は原本の画像形式のまま。Inspectorの圧縮方式と同じ語彙を使う。 */
export type TextureImportCompression = "source" | "webp" | "ktx2";

export const TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY =
  "xrift-studio.visual-editor.texture-import-max-size.v1";

export const TEXTURE_IMPORT_COMPRESSION_STORAGE_KEY =
  "xrift-studio.visual-editor.texture-import-compression.v1";

export const DEFAULT_TEXTURE_IMPORT_MAX_SIZE: TextureImportMaxSize = "original";

export const DEFAULT_TEXTURE_IMPORT_COMPRESSION: TextureImportCompression = "source";

export function isTextureImportMaxSize(value: unknown): value is TextureImportMaxSize {
  return (
    value === "original" ||
    (typeof value === "number" &&
      (TEXTURE_MAX_SIZE_CHOICES as readonly number[]).includes(value))
  );
}

export function isTextureImportCompression(
  value: unknown,
): value is TextureImportCompression {
  return value === "source" || value === "webp" || value === "ktx2";
}

export function loadTextureImportMaxSize(): TextureImportMaxSize {
  if (typeof window === "undefined") return DEFAULT_TEXTURE_IMPORT_MAX_SIZE;
  try {
    const stored = window.localStorage.getItem(TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY);
    if (stored === null) return DEFAULT_TEXTURE_IMPORT_MAX_SIZE;
    const parsed = stored === "original" ? "original" : Number(stored);
    return isTextureImportMaxSize(parsed) ? parsed : DEFAULT_TEXTURE_IMPORT_MAX_SIZE;
  } catch {
    return DEFAULT_TEXTURE_IMPORT_MAX_SIZE;
  }
}

export function saveTextureImportMaxSize(value: TextureImportMaxSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY, String(value));
  } catch {
    // 取り込み設定の保存は best-effort。失敗してもこのセッションでは効く。
  }
}

export function loadTextureImportCompression(): TextureImportCompression {
  if (typeof window === "undefined") return DEFAULT_TEXTURE_IMPORT_COMPRESSION;
  try {
    const stored = window.localStorage.getItem(
      TEXTURE_IMPORT_COMPRESSION_STORAGE_KEY,
    );
    return isTextureImportCompression(stored)
      ? stored
      : DEFAULT_TEXTURE_IMPORT_COMPRESSION;
  } catch {
    return DEFAULT_TEXTURE_IMPORT_COMPRESSION;
  }
}

export function saveTextureImportCompression(value: TextureImportCompression): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEXTURE_IMPORT_COMPRESSION_STORAGE_KEY, value);
  } catch {
    // 取り込み設定の保存は best-effort。失敗してもこのセッションでは効く。
  }
}

/**
 * 取り込み時に渡すImport設定へ変換する。「原寸のまま・形式そのまま」は設定を
 * 足さず、取り込み後の自動変換も起こさない。
 */
export function textureImportSettingsPatch(
  maxSize: TextureImportMaxSize,
  compression: TextureImportCompression = "source",
): TextureImportSettingsPatch | undefined {
  const patch: TextureImportSettingsPatch = {
    ...(maxSize === "original"
      ? {}
      : { resize: { mode: "max-size", maxSize } }),
    ...(compression === "source" ? {} : { compression: { format: compression } }),
  };
  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function describeTextureImportMaxSize(value: TextureImportMaxSize): string {
  return value === "original" ? "原寸のまま" : `長辺 最大 ${value}px`;
}
