import {
  isTextureImportCompression,
  isTextureImportMaxSize,
  textureImportSettingsPatch,
} from "./texture-import-defaults";
import {
  normalizeTextureImportSettings,
  type TextureAsset,
} from "../../lib/visual-editor/asset-manifest";
import { planTextureConversion } from "../../lib/visual-editor/texture-conversion";

/**
 * 取り込み時の共通設定（最大解像度・圧縮方式）が、Inspectorと同じ
 * Import設定へ写ることを確かめる。ここが崩れると、複数選択で取り込んだ
 * Textureだけ圧縮されない、といったサーフェス間の食い違いに戻る。
 */
export function runTextureImportDefaultsFixtureAssertions(): void {
  assertPatchShapes();
  assertPatchDrivesConversion();
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
