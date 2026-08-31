import { tauri } from "../tauri";
import {
  normalizeTextureImportSettings,
  type ModelAsset,
  type SceneAsset,
  type TextureAsset,
} from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import {
  RECOMMENDED_TEXTURE_MAX_SIZE,
  assetBytesToDataUrl,
  encodeTextureForPlan,
  planTextureProcessing,
  processedAssetPath,
  readProjectAssetBytes,
  sha256Hex,
  textureProcessingSettings,
} from "./texture-processing";
import {
  createAssetImportTransactionId,
  describeAssetImportFailure,
} from "./asset-import-transaction";
import {
  optimizeModelBytes,
  planModelOptimization,
} from "./model-optimization";
import type { VramRecommendation } from "./vram-estimate";

export type AssetOptimizationOperation = NonNullable<
  VramRecommendation["operation"]
>;

export type AssetOptimizationProgress = {
  completed: number;
  total: number;
  label: string;
  phase: "reading" | "encoding" | "saving";
};

export type AssetOptimizationSkip = {
  assetId: string;
  assetName: string;
  reason: string;
};

export type AssetOptimizationResult = {
  bundle: PrototypeVisualProject;
  optimizedAssetCount: number;
  beforeBytes: number;
  afterBytes: number;
  /** 対応していない、または変換に失敗して見送ったAsset。 */
  skipped: AssetOptimizationSkip[];
};

type PlannedOperation = {
  assetId: string;
  operations: Set<AssetOptimizationOperation>;
};

type OptimizedAsset = {
  asset: SceneAsset;
  bytes: Uint8Array;
  relativePath: string;
  beforeBytes: number;
};

export async function applyAssetOptimizations(
  projectPath: string,
  bundle: PrototypeVisualProject,
  recommendations: readonly VramRecommendation[],
  selectedRecommendationIds: readonly string[],
  report?: (progress: AssetOptimizationProgress) => void,
): Promise<AssetOptimizationResult> {
  const selected = new Set(selectedRecommendationIds);
  const plans = groupOperations(
    recommendations.filter(
      (recommendation) =>
        selected.has(recommendation.id) &&
        recommendation.assetId &&
        recommendation.operation,
    ),
  );
  if (plans.length === 0) {
    throw new Error("適用できる最適化を1件以上選択してください。");
  }

  const optimized: OptimizedAsset[] = [];
  const skipped: AssetOptimizationSkip[] = [];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const sourceAsset = bundle.assets.assets[plan.assetId];
    // 1件でも対応外があると全部が止まっていた。まとめて選ぶ操作なので、
    // 変換できたものは残し、見送った理由を呼び出し側へ返す。
    if (!sourceAsset || sourceAsset.source.kind !== "project") {
      skipped.push({
        assetId: plan.assetId,
        assetName: sourceAsset?.name ?? plan.assetId,
        reason: "プロジェクト内に保存された原本を確認できませんでした。",
      });
      continue;
    }
    report?.({
      completed: index,
      total: plans.length,
      label: `${sourceAsset.name}を読み込んでいます`,
      phase: "reading",
    });
    try {
      if (sourceAsset.kind === "texture") {
        report?.({
          completed: index,
          total: plans.length,
          label: `${sourceAsset.name}を最適化しています`,
          phase: "encoding",
        });
        optimized.push(
          await optimizeTexture(projectPath, sourceAsset, plan.operations),
        );
      } else if (sourceAsset.kind === "model" && plan.operations.has("draco-model")) {
        const sourceBytes = await readProjectAssetBytes(
          projectPath,
          sourceAsset.source.relativePath,
        );
        report?.({
          completed: index,
          total: plans.length,
          label: `${sourceAsset.name}を最適化しています`,
          phase: "encoding",
        });
        optimized.push(await optimizeModel(sourceAsset, sourceBytes));
      } else {
        skipped.push({
          assetId: plan.assetId,
          assetName: sourceAsset.name,
          reason: "選択した自動最適化に対応していません。",
        });
      }
    } catch (error) {
      skipped.push({
        assetId: plan.assetId,
        assetName: sourceAsset.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (optimized.length === 0) {
    throw new Error(
      `選択した${plans.length}件はどれも最適化できませんでした。${
        skipped[0]?.reason ?? ""
      }`,
    );
  }

  report?.({
    completed: plans.length,
    total: plans.length,
    label: "変換したアセットをまとめて保存しています",
    phase: "saving",
  });
  try {
    await tauri.commitVisualAssetImport(
      projectPath,
      createAssetImportTransactionId("optimize"),
      await Promise.all(
        optimized.map(async (entry) => ({
          relativePath: entry.relativePath,
          dataUrl: await assetBytesToDataUrl(entry.bytes, mimeTypeForPath(entry.relativePath)),
        })),
      ),
    );
  } catch (error) {
    throw new Error(
      `最適化した${optimized.length}件を保存できませんでした。${describeAssetImportFailure(error)}`,
    );
  }

  const assets = { ...bundle.assets.assets };
  for (const entry of optimized) assets[entry.asset.id] = entry.asset;
  return {
    bundle: {
      ...bundle,
      project: {
        ...bundle.project,
        metadata: {
          ...bundle.project.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      assets: { ...bundle.assets, assets },
    },
    optimizedAssetCount: optimized.length,
    beforeBytes: optimized.reduce((sum, entry) => sum + entry.beforeBytes, 0),
    afterBytes: optimized.reduce((sum, entry) => sum + entry.bytes.byteLength, 0),
    skipped,
  };
}

function groupOperations(
  recommendations: readonly VramRecommendation[],
): PlannedOperation[] {
  const grouped = new Map<string, Set<AssetOptimizationOperation>>();
  for (const recommendation of recommendations) {
    if (!recommendation.assetId || !recommendation.operation) continue;
    const operations = grouped.get(recommendation.assetId) ?? new Set();
    operations.add(recommendation.operation);
    grouped.set(recommendation.assetId, operations);
  }
  return [...grouped].map(([assetId, operations]) => ({ assetId, operations }));
}

/**
 * VRAM推奨をInspectorと同じImport設定の語彙へ写し、共有の変換パイプライン
 * （planTextureProcessing / encodeTextureForPlan）へ委譲する。以前はここが
 * 独自のエンコード経路を持っていて、2048px・画質86のような、UIから再現
 * できない recipe を残していた。共有経路は保持した元画像から描き直すので、
 * 変換済みTextureをもう一度最適化しても二重に劣化しない。
 */
async function optimizeTexture(
  projectPath: string,
  asset: TextureAsset,
  operations: ReadonlySet<AssetOptimizationOperation>,
): Promise<OptimizedAsset> {
  const shouldResize = operations.has("resize-texture");
  const shouldEncodeKtx2 = operations.has("ktx2-texture");
  if (!shouldResize && !shouldEncodeKtx2) {
    throw new Error(`${asset.name}にはTexture最適化が選択されていません。`);
  }

  const base = textureProcessingSettings(asset);
  const target = normalizeTextureImportSettings(
    {
      // GPU圧縮は2のべき乗の辺で素直に効くので、KTX2のときだけ辺を丸める。
      resize: shouldResize
        ? {
            mode: "max-size",
            maxSize: RECOMMENDED_TEXTURE_MAX_SIZE,
            powerOfTwo: base.resize.powerOfTwo === true || shouldEncodeKtx2,
          }
        : {
            ...base.resize,
            powerOfTwo: base.resize.powerOfTwo === true || shouldEncodeKtx2,
          },
      compression: { format: shouldEncodeKtx2 ? "ktx2" : "webp" },
    },
    base,
  );
  const candidate: TextureAsset = { ...asset, importSettings: target };
  const plan = planTextureProcessing(candidate);
  if (!plan.supported) {
    throw new Error(`${asset.name}は自動最適化できません。${plan.reason}`);
  }
  if (!plan.pending) {
    throw new Error(
      `${asset.name}は${plan.settledReason ?? "すでにこの設定で最適化済みです。"}`,
    );
  }

  const encoded = await encodeTextureForPlan(projectPath, candidate, plan);
  return {
    beforeBytes: encoded.beforeBytes,
    bytes: encoded.bytes,
    relativePath: encoded.relativePath,
    asset: encoded.asset,
  };
}

async function optimizeModel(
  asset: ModelAsset,
  sourceBytes: Uint8Array,
): Promise<OptimizedAsset> {
  const plan = planModelOptimization(asset, {
    optimizeMeshes: true,
    compressWithDraco: true,
  });
  if (!plan.supported) throw new Error(`${asset.name}は${plan.reason}`);
  if (plan.steps.length === 0) {
    throw new Error(`${asset.name}はすでに最適化済みです。`);
  }
  const metadata = asset.importMetadata;
  if (!metadata) {
    throw new Error(`${asset.name}の構造解析結果がありません。`);
  }
  const optimized = await optimizeModelBytes(sourceBytes, plan.steps, {
    decodeDraco: plan.requiresDracoDecoder,
  });
  const sourceHash = await sha256Hex(optimized.bytes);
  const relativePath = processedAssetPath(asset.id, sourceHash, "glb");
  return {
    beforeBytes: sourceBytes.byteLength,
    bytes: optimized.bytes,
    relativePath,
    asset: {
      ...asset,
      source: { kind: "project", relativePath },
      sourceHash,
      thumbnail:
        asset.thumbnail?.status === "generated"
          ? { ...asset.thumbnail, status: "stale" }
          : asset.thumbnail,
      importMetadata: {
        ...metadata,
        sourceFormat: "glb",
        sourceFileName: relativePath.split("/").pop(),
        byteLength: optimized.bytes.byteLength,
        meshCount: optimized.meshCount,
        primitiveCount: optimized.primitiveCount,
        extensionsUsed: optimized.extensionsUsed,
        extensionsRequired: optimized.extensionsRequired,
      },
      importSettings: { ...asset.importSettings, optimizeMeshes: false },
      optimizedFrom: {
        ...(asset.optimizedFrom ?? {
          source: asset.source,
          sourceHash: asset.sourceHash,
          importMetadata: asset.importMetadata,
          importSettings: asset.importSettings,
        }),
        appliedAt: new Date().toISOString(),
      },
    },
  };
}

function mimeTypeForPath(relativePath: string): string {
  if (relativePath.endsWith(".ktx2")) return "image/ktx2";
  if (relativePath.endsWith(".webp")) return "image/webp";
  return "model/gltf-binary";
}
