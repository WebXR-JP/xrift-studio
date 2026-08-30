import { tauri } from "../tauri";
import {
  getTextureAsset,
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type AssetManifest,
  type TextureAsset,
  type TextureSourceFormat,
} from "./asset-manifest";
import {
  isConvertibleTextureSourceFormat,
  mimeTypeOf,
  processedAssetPath,
  resolveOutputFormat,
  resolveTargetSize,
  textureOutputExtension,
  type TextureOutputFormat,
} from "./texture-conversion";
import {
  assetBytesToDataUrl,
  convertTextureBytes,
  sha256Hex,
} from "./texture-codec";
import {
  createAssetImportTransactionId,
  describeAssetImportFailure,
} from "./asset-import-transaction";

/**
 * Texture Import設定（最大解像度・圧縮）を、原本の画像ファイルへ実際に反映する。
 *
 * 設定はAsset Manifestに保持されるだけで原本は書き換わらない。公開だけが目的なら
 * 出力側の変換（texture-conversion.ts）で足りるため、ここは「プロジェクトの原本
 * そのものを軽くしたい」ときの操作になる。書き出した画像を新しい原本にすると、
 * 設定は「原寸 / source」へ戻り、変換前の原本は `optimizedFrom` に残る。
 */

// 既存の呼び出し元が texture-processing から読み続けられるよう、変換の計算は
// texture-conversion.ts に移したうえでここから再輸出する。
export {
  assetBytesToDataUrl,
  convertPublishedTextureBytes,
  convertTextureBytes,
  copyAssetBytes,
  encodeKtx2,
  renderImageBytes,
  sha256Hex,
} from "./texture-codec";
export {
  CONVERTIBLE_TEXTURE_SOURCE_FORMATS,
  TEXTURE_MAX_SIZE_CHOICES,
  fitWithin,
  isConvertibleTextureSourceFormat,
  isPublishedAsKtx2,
  ktx2QualityLevel,
  mimeTypeOf,
  nearestPowerOfTwo,
  planTextureConversion,
  processedAssetPath,
  resolveOutputFormat,
  resolvePublishedTextureFormat,
  resolveTargetSize,
  summarizeTexturePublishConversions,
  textureOutputExtension,
} from "./texture-conversion";
export type {
  TextureConversion,
  TextureMaxSizeChoice,
  TextureOutputFormat,
  TexturePublishConversionEntry,
  TexturePublishConversionSummary,
} from "./texture-conversion";

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
      /** 辺を2のべき乗へ丸めるか。最大解像度とは独立に効く。 */
      powerOfTwo: boolean;
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
  if (!isConvertibleTextureSourceFormat(sourceFormat)) {
    return {
      supported: false,
      reason: `${sourceFormat.toUpperCase()}は解像度変更・圧縮に対応していません。PNG / JPEG / WEBPで読み込み直してください。`,
    };
  }

  const settings = asset.importSettings;
  const maxSize = settings.resize.mode === "max-size" ? settings.resize.maxSize : null;
  const powerOfTwo = settings.resize.powerOfTwo === true;
  const sourceWidth = metadata.width ?? null;
  const sourceHeight = metadata.height ?? null;
  const fitted =
    sourceWidth && sourceHeight
      ? resolveTargetSize(sourceWidth, sourceHeight, maxSize, powerOfTwo)
      : null;
  const outputFormat = resolveOutputFormat(sourceFormat, settings.compression.format);
  // 解像度が分からない原本は、指定がある限り実際に描き直して確かめるしかない。
  const sizeUnknown = sourceWidth === null || sourceHeight === null;
  const resizePending =
    (maxSize !== null || powerOfTwo) &&
    (sizeUnknown ||
      fitted === null ||
      fitted.width !== sourceWidth ||
      fitted.height !== sourceHeight);
  const formatPending = settings.compression.format !== "source";

  return {
    supported: true,
    pending: resizePending || formatPending,
    settledReason:
      resizePending || formatPending
        ? null
        : powerOfTwo && maxSize !== null
          ? "原本はすでに指定した最大解像度に収まっていて、辺も2のべき乗です。"
          : powerOfTwo
            ? "原本の辺はすでに2のべき乗です。"
            : maxSize !== null
              ? "原本はすでに指定した最大解像度に収まっています。"
              : "変換する設定がありません。最大解像度、2のべき乗、圧縮方式のいずれかを選んでください。",
    sourceFormat,
    sourceWidth,
    sourceHeight,
    sourceByteLength: metadata.byteLength,
    maxSize,
    powerOfTwo,
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
  const rendered = await convertTextureBytes(sourceBytes, {
    sourceFormat: plan.sourceFormat,
    outputFormat: plan.outputFormat,
    extension: textureOutputExtension(plan.outputFormat),
    mimeType: mimeTypeOf(plan.outputFormat),
    maxSize: plan.maxSize,
    powerOfTwo: plan.powerOfTwo,
    quality: asset.importSettings.compression.quality,
    qualityApplies: plan.qualityApplies,
    generateMipmaps: asset.importSettings.generateMipmaps,
    srgb: asset.importSettings.colorSpace === "srgb",
    outputFormatSubstituted: plan.outputFormatSubstituted,
  });
  const bytes = rendered.bytes;

  const sourceHash = await sha256Hex(bytes);
  const extension = textureOutputExtension(plan.outputFormat);
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
        // 参照先が変換後の画像になったので、いま見えている設定は反映済みへ戻す。
        // 変換に使った設定は optimizedFrom に控えてあり、戻せば元へ復元される。
        ...asset.importSettings,
        resize: { mode: "original", powerOfTwo: false },
        compression: { ...asset.importSettings.compression, format: "source" },
      },
      // 原本ファイルは書き換えないので、ここを保持している限り必ず戻せる。
      // 二度目以降の変換では最初の原本を指したまま、時刻だけ更新する。
      optimizedFrom: {
        ...(asset.optimizedFrom ?? {
          source: asset.source,
          sourceHash: asset.sourceHash,
          importMetadata: asset.importMetadata,
          importSettings: asset.importSettings,
        }),
        appliedAt: new Date().toISOString(),
      },
      ...(asset.importedFromModel
        ? {
            importedFromModel: { ...asset.importedFromModel, isUserOverridden: true },
          }
        : {}),
    },
  };
}

export type TextureOptimizationStatus =
  | { optimized: false }
  | {
      optimized: true;
      /** いま使っている変換結果。 */
      current: { label: string; byteLength: number };
      /** 残してある原本。ここへ戻せる。 */
      original: { label: string; byteLength: number | null };
    };

/**
 * 「いま何を使っているか」と「戻せる原本があるか」を1か所で判定する。
 * Inspectorはこの結果だけを見て、現在の参照先と解除操作を出す。
 */
export function describeTextureOptimization(
  asset: TextureAsset,
): TextureOptimizationStatus {
  const origin = asset.optimizedFrom;
  if (!origin) return { optimized: false };
  return {
    optimized: true,
    current: {
      label: describeTextureVariant(asset.importMetadata),
      byteLength: asset.importMetadata?.byteLength ?? 0,
    },
    original: {
      label: describeTextureVariant(origin.importMetadata),
      byteLength: origin.importMetadata?.byteLength ?? null,
    },
  };
}

function describeTextureVariant(
  metadata: TextureAsset["importMetadata"],
): string {
  if (!metadata) return "解析結果なし";
  const size =
    metadata.width && metadata.height
      ? `${metadata.width} × ${metadata.height}`
      : "解像度不明";
  return `${size}・${metadata.sourceFormat.toUpperCase()}`;
}

/**
 * 変換結果の参照をやめ、控えてある原本へ戻す。
 *
 * 変換結果のファイルは消さない。同じ設定で作り直せば同じ内容・同じハッシュに
 * なるため、消す判断はプロジェクトの掃除としてまとめて行う方が安全になる。
 */
export function revertTextureOptimization(
  manifest: AssetManifest,
  assetId: string,
): { ok: false; message: string } | { ok: true; manifest: AssetManifest; assetName: string } {
  const asset = getTextureAsset(manifest, assetId);
  if (!asset) {
    return { ok: false, message: "対象のTexture Assetが見つかりませんでした。" };
  }
  const origin = asset.optimizedFrom;
  if (!origin) {
    return { ok: false, message: `${asset.name}は原本をそのまま使っています。` };
  }

  const restored: TextureAsset = {
    ...asset,
    source: origin.source,
    sourceHash: origin.sourceHash,
    importMetadata: origin.importMetadata,
    importSettings: origin.importSettings,
    thumbnail:
      asset.thumbnail?.status === "generated"
        ? { ...asset.thumbnail, status: "stale" }
        : asset.thumbnail,
  };
  delete restored.optimizedFrom;

  return {
    ok: true,
    assetName: asset.name,
    manifest: { ...manifest, assets: { ...manifest.assets, [assetId]: restored } },
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

export async function readProjectAssetBytes(
  projectPath: string,
  relativePath: string,
): Promise<Uint8Array> {
  const dataUrl = await tauri.readProjectFileDataUrl(projectPath, relativePath);
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("アセット原本を読み込めませんでした。");
  return new Uint8Array(await response.arrayBuffer());
}
