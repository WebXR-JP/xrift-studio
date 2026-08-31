import { TEXTURE_MAX_SIZE_CHOICES } from "../../lib/visual-editor/texture-conversion";
import type { TextureImportSettingsPatch } from "../../lib/visual-editor/asset-manifest";

/**
 * 取り込むTextureへ最初から入れておく最大解像度。
 *
 * Editor State であって制作データではない。Undo履歴にも Asset Manifest にも
 * 入らず、保存に失敗しても取り込みは続けられる。設定は取り込んだTextureの
 * Import設定になり、取り込み時に編集用画像へ適用される。元画像を保持するので、
 * 後から Inspector で元画像から解像度を上げ直せる。
 */
export type TextureImportMaxSize = "original" | (typeof TEXTURE_MAX_SIZE_CHOICES)[number];

export const TEXTURE_IMPORT_MAX_SIZE_STORAGE_KEY =
  "xrift-studio.visual-editor.texture-import-max-size.v1";

export const DEFAULT_TEXTURE_IMPORT_MAX_SIZE: TextureImportMaxSize = "original";

export function isTextureImportMaxSize(value: unknown): value is TextureImportMaxSize {
  return (
    value === "original" ||
    (typeof value === "number" &&
      (TEXTURE_MAX_SIZE_CHOICES as readonly number[]).includes(value))
  );
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

/**
 * 取り込み時に渡すImport設定へ変換する。「原寸のまま」は設定を足さない。
 */
export function textureImportMaxSizePatch(
  value: TextureImportMaxSize,
): TextureImportSettingsPatch | undefined {
  if (value === "original") return undefined;
  return { resize: { mode: "max-size", maxSize: value } };
}

export function describeTextureImportMaxSize(value: TextureImportMaxSize): string {
  return value === "original" ? "原寸のまま" : `長辺 最大 ${value}px`;
}
