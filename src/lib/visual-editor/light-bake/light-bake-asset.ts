import { tauri } from "../../tauri";
import {
  LIGHTMAP_ASSET_DIRECTORY,
  LIGHTMAP_ASSET_FORMAT_VERSION,
  type AssetManifest,
  type LightmapAsset,
} from "../asset-manifest";
import { createAssetImportTransactionId } from "../asset-import-transaction";
import type { SceneDocument } from "../scene-document";
import { assetBytesToDataUrl, sha256Hex } from "../texture-codec";
import type { LightBakeOutput } from "./light-bake-job";

/**
 * ベイクの結果を、プロジェクトのLightmap Assetとして保存する。
 *
 * 画像（EXR）とUV2データをプロジェクトへ書き、その二つを指すAssetを作る。
 * Scene Viewはこのファイルを読んで描き、公開は同じファイルをコピーする。
 */

const LIGHTMAP_IMAGE_FILE = "lightmap.exr";
const LIGHTMAP_DATA_FILE = "lightmap-uv.bin";

export type SaveLightmapInput = {
  projectPath: string;
  manifest: AssetManifest;
  scene: SceneDocument;
  output: LightBakeOutput;
  entityIds: string[];
  bakedLightComponentIds: string[];
  signature: string;
  settings: LightmapAsset["lightmap"]["settings"];
  /** 焼き直しのときは、今のAssetのidを渡して同じAssetを更新する。 */
  existingAssetId?: string;
  createAssetId: () => string;
  now?: () => Date;
};

export async function saveLightmapAsset(input: SaveLightmapInput): Promise<LightmapAsset> {
  const { output } = input;
  const [imageHash, dataHash] = await Promise.all([
    sha256Hex(output.exr),
    sha256Hex(output.data),
  ]);
  // 中身のハッシュを場所にする。焼き直すたびに別の場所へ書くので、
  // 「元に戻す」で前のライトマップへ戻っても、前のファイルが残っている。
  const directory = `${LIGHTMAP_ASSET_DIRECTORY}/${imageHash.slice(0, 16)}`;
  const imagePath = `${directory}/${LIGHTMAP_IMAGE_FILE}`;
  const dataPath = `${directory}/${LIGHTMAP_DATA_FILE}`;
  await tauri.commitVisualAssetImport(
    input.projectPath,
    createAssetImportTransactionId("light-bake"),
    [
      { relativePath: imagePath, dataUrl: await assetBytesToDataUrl(output.exr, "image/x-exr") },
      {
        relativePath: dataPath,
        dataUrl: await assetBytesToDataUrl(output.data, "application/octet-stream"),
      },
    ],
  );

  const existing = input.existingAssetId
    ? input.manifest.assets[input.existingAssetId]
    : undefined;
  const reuse = existing?.kind === "lightmap" ? existing : undefined;
  return {
    id: reuse?.id ?? input.createAssetId(),
    name: reuse?.name ?? `${input.scene.name} のライトマップ`,
    kind: "lightmap",
    status: "ready",
    source: { kind: "project", relativePath: imagePath },
    sourceHash: imageHash,
    folderId: reuse?.folderId ?? null,
    ...(reuse?.order !== undefined ? { order: reuse.order } : {}),
    lightmap: {
      formatVersion: LIGHTMAP_ASSET_FORMAT_VERSION,
      size: output.size,
      byteLength: output.exr.byteLength,
      dataPath,
      dataHash,
      dataByteLength: output.data.byteLength,
      sceneId: input.scene.sceneId,
      bakedAt: (input.now?.() ?? new Date()).toISOString(),
      signature: input.signature,
      entityIds: [...input.entityIds],
      bakedLightComponentIds: [...input.bakedLightComponentIds],
      settings: { ...input.settings },
      stats: {
        meshCount: output.stats.receiverCount,
        triangleCount: output.stats.triangleCount,
        texelCount: output.stats.texelCount,
        texelsPerMeter: output.texelsPerMeter,
        durationMs: Math.round(output.durationMs),
      },
    },
  };
}

function decodeBase64DataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("ライトマップのファイルを読み込めませんでした。");
  }
  // 配布版のWebViewはdata URLのfetchを許可しないので、自前で復号する。
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Lightmap Assetの画像とUV2データを、プロジェクトから読む。 */
export async function readLightmapAssetFiles(
  projectPath: string,
  asset: LightmapAsset,
): Promise<{ image: Uint8Array; data: Uint8Array }> {
  const [image, data] = await Promise.all([
    tauri.readProjectFileDataUrl(projectPath, asset.source.relativePath),
    tauri.readProjectFileDataUrl(projectPath, asset.lightmap.dataPath),
  ]);
  return { image: decodeBase64DataUrl(image), data: decodeBase64DataUrl(data) };
}
