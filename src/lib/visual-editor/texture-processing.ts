import { tauri } from "../tauri";
import {
  getTextureAsset,
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type AssetManifest,
  type TextureAsset,
  type TextureCompressionFormat,
  type TextureSourceFormat,
} from "./asset-manifest";
import {
  createAssetImportTransactionId,
  describeAssetImportFailure,
} from "./asset-import-transaction";

/**
 * Texture Import設定（最大解像度・圧縮）を、原本の画像ファイルへ実際に反映する。
 *
 * 設定はAsset Manifestに保持されるだけで原本は書き換わらないため、変換前は
 * 表示も公開結果も原本のままになる。ここで書き出した画像を新しい原本にすると、
 * 設定は「原寸 / source」へ戻り、Compilerの静的コピー対象へ戻る。
 */

export const TEXTURE_MAX_SIZE_CHOICES = [256, 512, 1024, 2048, 4096, 8192] as const;

/** Canvas / KTX2エンコーダで書き出せる形式。 */
export type TextureOutputFormat = "png" | "jpeg" | "webp" | "ktx2";

/** 解像度変更・圧縮を実行できる原本の形式。 */
const CONVERTIBLE_SOURCE_FORMATS: readonly TextureSourceFormat[] = [
  "png",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "bmp",
];

export type TextureProcessingPlan =
  | { supported: false; reason: string }
  | {
      supported: true;
      /** 設定が原本へ未反映で、変換して意味がある状態。 */
      pending: boolean;
      /** pendingがfalseのときに、何もすることがない理由。 */
      settledReason: string | null;
      sourceFormat: TextureSourceFormat;
      sourceWidth: number | null;
      sourceHeight: number | null;
      sourceByteLength: number;
      maxSize: number | null;
      targetWidth: number | null;
      targetHeight: number | null;
      outputFormat: TextureOutputFormat;
      /** 原本形式を保てず別形式で書き出す場合にtrue。 */
      outputFormatSubstituted: boolean;
      quality: number;
      /** PNG / KTX2以外の可逆でない形式でだけQualityが効く。 */
      qualityApplies: boolean;
    };

export type TextureProcessingProgress = {
  phase: "reading" | "encoding" | "saving";
  message: string;
};

export type TextureProcessingResult =
  | { ok: false; message: string }
  | {
      ok: true;
      manifest: AssetManifest;
      assetName: string;
      beforeBytes: number;
      afterBytes: number;
      beforeWidth: number | null;
      beforeHeight: number | null;
      width: number;
      height: number;
      outputFormat: TextureOutputFormat;
    };

export function planTextureProcessing(asset: TextureAsset): TextureProcessingPlan {
  if (asset.source.kind !== "project") {
    return {
      supported: false,
      reason: "プロジェクト内に保存された画像だけ変換できます。",
    };
  }
  if (asset.status !== "ready") {
    return {
      supported: false,
      reason: "Assetの状態がReadyになってから変換できます。",
    };
  }
  if (isEnvironmentTextureAsset(asset)) {
    return {
      supported: false,
      reason:
        "環境Texture（HDRI）は解像度変更・圧縮に対応していません。Skyboxの解像度は書き出し元で調整してください。",
    };
  }
  const metadata = asset.importMetadata;
  const sourceFormat = getTextureSourceFormat(asset);
  if (!metadata || !sourceFormat) {
    return {
      supported: false,
      reason: "画像の解析結果がないため変換できません。再インポートしてください。",
    };
  }
  if (!CONVERTIBLE_SOURCE_FORMATS.includes(sourceFormat)) {
    return {
      supported: false,
      reason: `${sourceFormat.toUpperCase()}は解像度変更・圧縮に対応していません。PNG / JPEG / WEBPで読み込み直してください。`,
    };
  }

  const settings = asset.importSettings;
  const maxSize = settings.resize.mode === "max-size" ? settings.resize.maxSize : null;
  const sourceWidth = metadata.width ?? null;
  const sourceHeight = metadata.height ?? null;
  const fitted =
    sourceWidth && sourceHeight ? fitWithin(sourceWidth, sourceHeight, maxSize) : null;
  const outputFormat = resolveOutputFormat(sourceFormat, settings.compression.format);
  const resizePending =
    maxSize !== null &&
    (sourceWidth === null ||
      sourceHeight === null ||
      Math.max(sourceWidth, sourceHeight) > maxSize);
  const formatPending = settings.compression.format !== "source";

  return {
    supported: true,
    pending: resizePending || formatPending,
    settledReason:
      resizePending || formatPending
        ? null
        : maxSize !== null
          ? "原本はすでに指定した最大解像度に収まっています。"
          : "変換する設定がありません。最大解像度か圧縮方式を選んでください。",
    sourceFormat,
    sourceWidth,
    sourceHeight,
    sourceByteLength: metadata.byteLength,
    maxSize,
    targetWidth: fitted?.width ?? null,
    targetHeight: fitted?.height ?? null,
    outputFormat,
    outputFormatSubstituted:
      settings.compression.format === "source" && outputFormat !== sourceFormat,
    quality: settings.compression.quality,
    qualityApplies: outputFormat !== "png",
  };
}

/**
 * 現在のImport設定で原本を書き出し直し、Asset Manifestを更新して返す。
 * 元の原本ファイルは残るため、失敗しても表示中のTextureは壊れない。
 */
export async function applyTextureProcessing(
  projectPath: string,
  manifest: AssetManifest,
  assetId: string,
  report?: (progress: TextureProcessingProgress) => void,
): Promise<TextureProcessingResult> {
  const asset = getTextureAsset(manifest, assetId);
  if (!asset) {
    return { ok: false, message: "変換するTexture Assetが見つかりませんでした。" };
  }
  const plan = planTextureProcessing(asset);
  if (!plan.supported) return { ok: false, message: plan.reason };
  if (!plan.pending) {
    return { ok: false, message: plan.settledReason ?? "変換する設定がありません。" };
  }

  let encoded: EncodedTexture;
  try {
    encoded = await encodeTextureForPlan(projectPath, asset, plan, (progress) =>
      report?.(progress),
    );
  } catch (error) {
    return { ok: false, message: describeTextureFailure(asset.name, error) };
  }

  try {
    report?.({ phase: "saving", message: `${asset.name}を保存しています` });
    await commitProcessedTextures(projectPath, [encoded]);
  } catch (error) {
    return { ok: false, message: describeTextureFailure(asset.name, error) };
  }

  return {
    ok: true,
    manifest: {
      ...manifest,
      assets: { ...manifest.assets, [assetId]: encoded.asset },
    },
    assetName: asset.name,
    beforeBytes: encoded.beforeBytes,
    afterBytes: encoded.bytes.byteLength,
    beforeWidth: plan.sourceWidth,
    beforeHeight: plan.sourceHeight,
    width: encoded.width,
    height: encoded.height,
    outputFormat: encoded.outputFormat,
  };
}

export type TextureBatchProcessingProgress = {
  phase: "reading" | "encoding" | "saving";
  message: string;
  completed: number;
  total: number;
};

export type TextureBatchSkip = { assetId: string; assetName: string; reason: string };

export type TextureBatchProcessingResult =
  | { ok: false; message: string; skipped: TextureBatchSkip[] }
  | {
      ok: true;
      manifest: AssetManifest;
      convertedAssetNames: string[];
      beforeBytes: number;
      afterBytes: number;
      skipped: TextureBatchSkip[];
    };

/**
 * 選択した複数のTextureを、現在のImport設定でまとめて書き出す。
 *
 * 1枚ずつ実行すると、書き込みも履歴も枚数分に分かれる。ここでは全部を
 * エンコードしてから1回のtransactionで保存し、途中で失敗したら原本を
 * 1つも置き換えない。
 */
export async function applyTextureProcessingBatch(
  projectPath: string,
  manifest: AssetManifest,
  assetIds: readonly string[],
  report?: (progress: TextureBatchProcessingProgress) => void,
): Promise<TextureBatchProcessingResult> {
  const skipped: TextureBatchSkip[] = [];
  const targets: { asset: TextureAsset; plan: Extract<TextureProcessingPlan, { supported: true }> }[] =
    [];

  for (const assetId of assetIds) {
    const asset = getTextureAsset(manifest, assetId);
    if (!asset) {
      skipped.push({
        assetId,
        assetName: assetId,
        reason: "Texture Assetが見つかりませんでした。",
      });
      continue;
    }
    const plan = planTextureProcessing(asset);
    if (!plan.supported) {
      skipped.push({ assetId, assetName: asset.name, reason: plan.reason });
      continue;
    }
    if (!plan.pending) {
      skipped.push({
        assetId,
        assetName: asset.name,
        reason: plan.settledReason ?? "変換する設定がありません。",
      });
      continue;
    }
    targets.push({ asset, plan });
  }

  if (targets.length === 0) {
    return {
      ok: false,
      message:
        "変換できるTextureがありません。最大解像度か圧縮方式を設定してから実行してください。",
      skipped,
    };
  }

  const encoded: EncodedTexture[] = [];
  for (const [index, target] of targets.entries()) {
    try {
      encoded.push(
        await encodeTextureForPlan(projectPath, target.asset, target.plan, (progress) =>
          report?.({
            ...progress,
            completed: index,
            total: targets.length,
          }),
        ),
      );
    } catch (error) {
      return {
        ok: false,
        message: describeTextureFailure(target.asset.name, error),
        skipped,
      };
    }
  }

  // 保存先が重なると transaction ごと弾かれるので、同じ内容の書き出しは1件へ寄せる。
  const writes = new Map<string, EncodedTexture>();
  for (const entry of encoded) writes.set(entry.relativePath, entry);

  try {
    report?.({
      phase: "saving",
      message: `${encoded.length}件の変換結果をまとめて保存しています`,
      completed: targets.length,
      total: targets.length,
    });
    await commitProcessedTextures(projectPath, [...writes.values()]);
  } catch (error) {
    return {
      ok: false,
      message: `${encoded.length}件の変換結果を保存できませんでした。${describeAssetImportFailure(error)}`,
      skipped,
    };
  }

  const assets = { ...manifest.assets };
  for (const entry of encoded) assets[entry.asset.id] = entry.asset;
  return {
    ok: true,
    manifest: { ...manifest, assets },
    convertedAssetNames: encoded.map((entry) => entry.asset.name),
    beforeBytes: encoded.reduce((total, entry) => total + entry.beforeBytes, 0),
    afterBytes: encoded.reduce((total, entry) => total + entry.bytes.byteLength, 0),
    skipped,
  };
}

type EncodedTexture = {
  asset: TextureAsset;
  bytes: Uint8Array;
  relativePath: string;
  mimeType: string;
  beforeBytes: number;
  width: number;
  height: number;
  outputFormat: TextureOutputFormat;
};

async function encodeTextureForPlan(
  projectPath: string,
  asset: TextureAsset,
  plan: Extract<TextureProcessingPlan, { supported: true }>,
  report?: (progress: TextureProcessingProgress) => void,
): Promise<EncodedTexture> {
  if (asset.source.kind !== "project") {
    throw new Error("プロジェクト内に保存された画像だけ変換できます。");
  }
  report?.({ phase: "reading", message: `${asset.name}を読み込んでいます` });
  const sourceBytes = await readProjectAssetBytes(
    projectPath,
    asset.source.relativePath,
  );

  report?.({ phase: "encoding", message: `${asset.name}を変換しています` });
  // KTX2はBasis圧縮の前段なので、中間画像は可逆のPNGで渡して二重の劣化を避ける。
  const rendered = await renderImageBytes(sourceBytes, {
    maxSize: plan.maxSize,
    mimeType: plan.outputFormat === "ktx2" ? "image/png" : mimeTypeOf(plan.outputFormat),
    quality: plan.qualityApplies && plan.outputFormat !== "ktx2" ? plan.quality / 100 : undefined,
  });

  let bytes = rendered.bytes;
  if (plan.outputFormat === "ktx2") {
    bytes = await encodeKtx2(rendered.bytes, {
      quality: asset.importSettings.compression.quality,
      generateMipmaps: asset.importSettings.generateMipmaps,
      srgb: asset.importSettings.colorSpace === "srgb",
    });
  }

  const sourceHash = await sha256Hex(bytes);
  const extension = plan.outputFormat === "jpeg" ? "jpg" : plan.outputFormat;
  const relativePath = processedAssetPath(asset.id, sourceHash, extension);
  const mimeType = mimeTypeOf(plan.outputFormat);

  return {
    bytes,
    relativePath,
    mimeType,
    beforeBytes: plan.sourceByteLength || sourceBytes.byteLength,
    width: rendered.width,
    height: rendered.height,
    outputFormat: plan.outputFormat,
    asset: {
      ...asset,
      source: { kind: "project", relativePath },
      sourceHash,
      thumbnail:
        asset.thumbnail?.status === "generated"
          ? { ...asset.thumbnail, status: "stale" }
          : asset.thumbnail,
      importMetadata: {
        sourceFormat: plan.outputFormat,
        mimeType,
        byteLength: bytes.byteLength,
        width: rendered.width,
        height: rendered.height,
      },
      importSettings: {
        ...asset.importSettings,
        // 書き出した画像が新しい原本なので、設定は未反映のない状態へ戻す。
        resize: { mode: "original" },
        compression: { ...asset.importSettings.compression, format: "source" },
      },
      ...(asset.importedFromModel
        ? {
            importedFromModel: { ...asset.importedFromModel, isUserOverridden: true },
          }
        : {}),
    },
  };
}

async function commitProcessedTextures(
  projectPath: string,
  entries: readonly EncodedTexture[],
): Promise<void> {
  await tauri.commitVisualAssetImport(
    projectPath,
    createAssetImportTransactionId("texture"),
    await Promise.all(
      entries.map(async (entry) => ({
        relativePath: entry.relativePath,
        dataUrl: await assetBytesToDataUrl(entry.bytes, entry.mimeType),
      })),
    ),
  );
}

function describeTextureFailure(assetName: string, error: unknown): string {
  return `${assetName}を変換できませんでした。${describeAssetImportFailure(error)}`;
}

/**
 * Basis / KTX2のqualityLevelは 1..255 の探索量で、JPEGの画質パーセントとは
 * 意味が違う。Import設定の 0..100 をここで一度だけ写像する。
 */
export function ktx2QualityLevel(quality: number): number {
  const normalized = Number.isFinite(quality) ? quality : 100;
  return Math.max(1, Math.min(255, Math.round((normalized / 100) * 254) + 1));
}

async function encodeKtx2(
  bytes: Uint8Array,
  options: { quality: number; generateMipmaps: boolean; srgb: boolean },
): Promise<Uint8Array> {
  const { encodeToKTX2 } = await import("ktx2-encoder");
  const encoded = await encodeToKTX2(copyAssetBytes(bytes), {
    isUASTC: false,
    qualityLevel: ktx2QualityLevel(options.quality),
    compressionLevel: 2,
    generateMipmap: options.generateMipmaps,
    isPerceptual: options.srgb,
    isSetKTX2SRGBTransferFunc: options.srgb,
    isKTX2File: true,
  });
  const result = new Uint8Array(encoded);
  if (result.byteLength === 0) {
    throw new Error(
      "KTX2エンコーダーが空の結果を返しました。最大解像度を下げるか、WEBPで書き出してください。",
    );
  }
  return result;
}

export function fitWithin(
  width: number,
  height: number,
  maxSize: number | null,
): { width: number; height: number } {
  if (!maxSize || maxSize <= 0) return { width, height };
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function resolveOutputFormat(
  sourceFormat: TextureSourceFormat,
  compressionFormat: TextureCompressionFormat,
): TextureOutputFormat {
  if (compressionFormat === "ktx2") return "ktx2";
  if (compressionFormat === "webp") return "webp";
  // Canvasが書き戻せるのはPNG / JPEG / WEBPだけなので、それ以外はWEBPへ寄せる。
  if (sourceFormat === "png" || sourceFormat === "jpeg" || sourceFormat === "webp") {
    return sourceFormat;
  }
  return "webp";
}

export function mimeTypeOf(format: TextureOutputFormat): string {
  if (format === "ktx2") return "image/ktx2";
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

/** 変換結果は原本と混ざらないよう、専用ディレクトリへハッシュ名で書き出す。 */
export function processedAssetPath(
  assetId: string,
  hash: string,
  extension: string,
): string {
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64);
  return `assets/.optimized/${safeAssetId}-${hash.slice(0, 16)}.${extension}`;
}

export async function readProjectAssetBytes(
  projectPath: string,
  relativePath: string,
): Promise<Uint8Array> {
  const dataUrl = await tauri.readProjectFileDataUrl(projectPath, relativePath);
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("アセット原本を読み込めませんでした。");
  return new Uint8Array(await response.arrayBuffer());
}

export async function assetBytesToDataUrl(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("変換結果を保存形式へ変換できませんでした。")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("変換結果を保存形式へ変換できませんでした。")),
    );
    reader.readAsDataURL(new Blob([copyAssetBytes(bytes)], { type: mimeType }));
  });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", copyAssetBytes(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function copyAssetBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/** Canvasで縮小と再エンコードをまとめて行う。maxSizeがnullなら解像度は保つ。 */
export async function renderImageBytes(
  bytes: Uint8Array,
  options: { maxSize: number | null; mimeType: string; quality?: number },
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([copyAssetBytes(bytes)]));
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, options.maxSize);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("画像変換用のCanvasを作成できませんでした。");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("画像の変換結果をエンコードできませんでした。")),
        options.mimeType,
        options.quality,
      );
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}
