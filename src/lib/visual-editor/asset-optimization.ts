import { tauri } from "../tauri";
import type {
  ModelAsset,
  SceneAsset,
  TextureAsset,
} from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import {
  assetBytesToDataUrl,
  copyAssetBytes,
  processedAssetPath,
  readProjectAssetBytes,
  renderImageBytes,
  sha256Hex,
} from "./texture-processing";
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

export type AssetOptimizationResult = {
  bundle: PrototypeVisualProject;
  optimizedAssetCount: number;
  beforeBytes: number;
  afterBytes: number;
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
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const sourceAsset = bundle.assets.assets[plan.assetId];
    if (!sourceAsset || sourceAsset.source.kind !== "project") {
      throw new Error("最適化するアセットの原本を確認できませんでした。");
    }
    report?.({
      completed: index,
      total: plans.length,
      label: `${sourceAsset.name}を読み込んでいます`,
      phase: "reading",
    });
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
    if (sourceAsset.kind === "texture") {
      optimized.push(
        await optimizeTexture(
          sourceAsset,
          sourceBytes,
          plan.operations,
        ),
      );
    } else if (
      sourceAsset.kind === "model" &&
      plan.operations.has("draco-model")
    ) {
      optimized.push(await optimizeModel(sourceAsset, sourceBytes));
    } else {
      throw new Error(`${sourceAsset.name}は選択した自動最適化に対応していません。`);
    }
  }

  report?.({
    completed: plans.length,
    total: plans.length,
    label: "変換したアセットをまとめて保存しています",
    phase: "saving",
  });
  await tauri.commitVisualAssetImport(
    projectPath,
    `asset-optimize-${Date.now().toString(36)}`,
    await Promise.all(
      optimized.map(async (entry) => ({
        relativePath: entry.relativePath,
        dataUrl: await assetBytesToDataUrl(entry.bytes, mimeTypeForPath(entry.relativePath)),
      })),
    ),
  );

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

async function optimizeTexture(
  asset: TextureAsset,
  sourceBytes: Uint8Array,
  operations: ReadonlySet<AssetOptimizationOperation>,
): Promise<OptimizedAsset> {
  const shouldResize = operations.has("resize-texture");
  const shouldEncodeKtx2 = operations.has("ktx2-texture");
  if (!shouldResize && !shouldEncodeKtx2) {
    throw new Error(`${asset.name}にはTexture最適化が選択されていません。`);
  }
  if (
    asset.usage === "environment" ||
    !asset.importMetadata ||
    !["png", "jpeg", "webp", "avif"].includes(asset.importMetadata.sourceFormat)
  ) {
    throw new Error(`${asset.name}の形式は自動Texture最適化に対応していません。`);
  }

  const resized = shouldResize
    ? await renderImageBytes(sourceBytes, {
        maxSize: 2048,
        mimeType: "image/webp",
        quality: 0.86,
      })
    : {
        bytes: sourceBytes,
        width: asset.importMetadata.width,
        height: asset.importMetadata.height,
      };
  let bytes = resized.bytes;
  let extension = "webp";
  let mimeType = "image/webp";
  let sourceFormat: "webp" | "ktx2" = "webp";

  if (shouldEncodeKtx2) {
    const { encodeToKTX2 } = await import("ktx2-encoder");
    bytes = await encodeToKTX2(copyAssetBytes(resized.bytes), {
      isUASTC: false,
      qualityLevel: Math.max(
        1,
        Math.min(255, Math.round(asset.importSettings.compression.quality * 2.55)),
      ),
      compressionLevel: 2,
      generateMipmap: asset.importSettings.generateMipmaps,
      isPerceptual: asset.importSettings.colorSpace === "srgb",
      isSetKTX2SRGBTransferFunc: asset.importSettings.colorSpace === "srgb",
      isKTX2File: true,
    });
    extension = "ktx2";
    mimeType = "image/ktx2";
    sourceFormat = "ktx2";
  }

  const sourceHash = await sha256Hex(bytes);
  const relativePath = processedAssetPath(asset.id, sourceHash, extension);
  return {
    beforeBytes: sourceBytes.byteLength,
    bytes,
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
        sourceFormat,
        mimeType,
        byteLength: bytes.byteLength,
        width: resized.width ?? asset.importMetadata.width,
        height: resized.height ?? asset.importMetadata.height,
      },
      importSettings: {
        ...asset.importSettings,
        resize: { mode: "original" },
        compression: {
          ...asset.importSettings.compression,
          format: "source",
        },
      },
    },
  };
}

async function optimizeModel(
  asset: ModelAsset,
  sourceBytes: Uint8Array,
): Promise<OptimizedAsset> {
  const metadata = asset.importMetadata;
  if (
    metadata?.sourceFormat !== "glb" ||
    [...metadata.extensionsUsed, ...metadata.extensionsRequired].some(
      (extension) => /^(?:VRM|VRMC_)/.test(extension),
    )
  ) {
    throw new Error(`${asset.name}は安全なDraco自動変換の対象ではありません。`);
  }
  const [{ WebIO }, { ALL_EXTENSIONS, KHRDracoMeshCompression }, { draco }, encoder] =
    await Promise.all([
      import("@gltf-transform/core"),
      import("@gltf-transform/extensions"),
      import("@gltf-transform/functions"),
      createDracoEncoder(),
    ]);
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "draco3d.encoder": encoder });
  const document = await io.readBinary(copyAssetBytes(sourceBytes));
  await document.transform(draco({ method: "edgebreaker" }));
  const bytes = copyAssetBytes(await io.writeBinary(document));
  const sourceHash = await sha256Hex(bytes);
  const relativePath = processedAssetPath(asset.id, sourceHash, "glb");
  const extensionsUsed = new Set([
    ...metadata.extensionsUsed,
    KHRDracoMeshCompression.EXTENSION_NAME,
  ]);
  const extensionsRequired = new Set([
    ...metadata.extensionsRequired,
    KHRDracoMeshCompression.EXTENSION_NAME,
  ]);
  return {
    beforeBytes: sourceBytes.byteLength,
    bytes,
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
        byteLength: bytes.byteLength,
        extensionsUsed: [...extensionsUsed],
        extensionsRequired: [...extensionsRequired],
      },
    },
  };
}

async function createDracoEncoder(): Promise<object> {
  const [{ default: createEncoderModule }, wasmModule] = await Promise.all([
    import("draco3dgltf/draco_encoder_gltf_nodejs.js"),
    import("draco3dgltf/draco_encoder.wasm?url"),
  ]);
  const wasmUrl = (wasmModule as { default: string }).default;
  const wasmBinary = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  return createEncoderModule({ wasmBinary });
}

function mimeTypeForPath(relativePath: string): string {
  if (relativePath.endsWith(".ktx2")) return "image/ktx2";
  if (relativePath.endsWith(".webp")) return "image/webp";
  return "model/gltf-binary";
}
