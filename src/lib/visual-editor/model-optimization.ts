import { tauri } from "../tauri";
import type { AssetManifest, ModelAsset, ModelImportMetadata } from "./asset-manifest";
import {
  createAssetImportTransactionId,
  describeAssetImportFailure,
} from "./asset-import-transaction";
import {
  assetBytesToDataUrl,
  copyAssetBytes,
  processedAssetPath,
  readProjectAssetBytes,
  sha256Hex,
} from "./texture-processing";

/**
 * Model原本のメッシュ最適化とDraco圧縮を、Inspectorから実行できる形にまとめる。
 *
 * Import設定の「Mesh最適化」は長らく保存値だけで、変換にも再インポートにも
 * 反映されていなかった。ここでは実際にglTFを書き換えるが、Material Slotと
 * Entity側の割当を壊さないことを最優先にする。そのため、Materialの統合、
 * Nodeの平坦化、Primitiveの結合のように索引が動く変換は行わない。
 */

/** Model最適化で実行する処理。 */
export type ModelOptimizationStep =
  | "weld"
  | "dedup-accessors"
  | "resample-animations"
  | "draco";

export const MODEL_OPTIMIZATION_STEP_LABELS: Record<ModelOptimizationStep, string> = {
  weld: "重複頂点の結合",
  "dedup-accessors": "同一頂点バッファの共有",
  "resample-animations": "Animationキーフレームの間引き",
  draco: "Dracoメッシュ圧縮",
};

export type ModelOptimizationOptions = {
  /** メッシュ形状を保ったまま頂点とバッファを整理する。 */
  optimizeMeshes: boolean;
  /** KHR_draco_mesh_compressionで配信サイズを下げる。 */
  compressWithDraco: boolean;
};

export type ModelOptimizationPlan =
  | { supported: false; reason: string }
  | {
      supported: true;
      sourceByteLength: number;
      /** 現在のオプションで実行される処理。空なら実行するものがない。 */
      steps: ModelOptimizationStep[];
      alreadyDraco: boolean;
      /** 原本がDraco圧縮済みで、読み込みにデコーダーが要る。 */
      requiresDracoDecoder: boolean;
      /** 索引が動く変換を避けた理由。UIで前置きに使う。 */
      preservedNotice: string;
    };

export type ModelOptimizationProgress = {
  phase: "reading" | "encoding" | "saving";
  message: string;
};

export type ModelOptimizationResult =
  | { ok: false; message: string }
  | {
      ok: true;
      manifest: AssetManifest;
      assetName: string;
      beforeBytes: number;
      afterBytes: number;
      steps: ModelOptimizationStep[];
    };

export function planModelOptimization(
  asset: ModelAsset,
  options: ModelOptimizationOptions,
): ModelOptimizationPlan {
  if (asset.source.kind !== "project") {
    return {
      supported: false,
      reason: "プロジェクト内に保存されたModelだけ最適化できます。",
    };
  }
  if (asset.status !== "ready") {
    return {
      supported: false,
      reason: "Assetの状態がReadyになってから最適化できます。",
    };
  }
  const metadata = asset.importMetadata;
  if (!metadata) {
    return {
      supported: false,
      reason: "構造解析結果がないため最適化できません。再インポートしてください。",
    };
  }
  if (metadata.sourceFormat !== "glb") {
    return {
      supported: false,
      reason: `${metadata.sourceFormat.toUpperCase()}は最適化に対応していません。GLBで読み込み直してください。`,
    };
  }
  const declared = [...metadata.extensionsUsed, ...metadata.extensionsRequired];
  if (declared.some((extension) => /^(?:VRM|VRMC_)/.test(extension))) {
    // VRMの拡張はNode構造と頂点順序に依存する。壊すと復旧できない。
    return {
      supported: false,
      reason: "VRMは自動最適化の対象外です。書き出し元で軽量化してください。",
    };
  }

  const alreadyDraco = declared.includes("KHR_draco_mesh_compression");
  const steps: ModelOptimizationStep[] = [];
  if (options.optimizeMeshes) {
    steps.push("weld", "dedup-accessors");
    if (metadata.animations.length > 0) steps.push("resample-animations");
  }
  // すでにDraco圧縮済みのGLBは、Mesh最適化のために一度展開される。そのまま
  // 書き戻すと圧縮が外れて配信サイズが増えるので、再圧縮まで含める。
  if (
    (options.compressWithDraco && !alreadyDraco) ||
    (alreadyDraco && steps.length > 0)
  ) {
    steps.push("draco");
  }

  return {
    supported: true,
    sourceByteLength: metadata.byteLength,
    steps,
    alreadyDraco,
    requiresDracoDecoder: alreadyDraco,
    preservedNotice:
      "Material Slot、Node構造、Animationの本数は変わりません。Entity側の割当はそのまま使えます。",
  };
}

/**
 * 原本を最適化し直し、Asset Manifestを更新して返す。元の原本ファイルは残るため、
 * 失敗しても表示中のModelは壊れない。
 */
export async function applyModelOptimization(
  projectPath: string,
  manifest: AssetManifest,
  assetId: string,
  options: ModelOptimizationOptions,
  report?: (progress: ModelOptimizationProgress) => void,
): Promise<ModelOptimizationResult> {
  const asset = manifest.assets[assetId];
  if (!asset || asset.kind !== "model") {
    return { ok: false, message: "最適化するModel Assetが見つかりませんでした。" };
  }
  const plan = planModelOptimization(asset, options);
  if (!plan.supported) return { ok: false, message: plan.reason };
  if (plan.steps.length === 0) {
    return {
      ok: false,
      message: plan.alreadyDraco
        ? "このModelはすでにDraco圧縮済みです。Mesh最適化を選ぶと頂点だけ整理できます。"
        : "実行する処理が選ばれていません。Mesh最適化かDraco圧縮を有効にしてください。",
    };
  }
  if (asset.source.kind !== "project") {
    return { ok: false, message: "プロジェクト内に保存されたModelだけ最適化できます。" };
  }

  try {
    report?.({ phase: "reading", message: `${asset.name}を読み込んでいます` });
    const sourceBytes = await readProjectAssetBytes(
      projectPath,
      asset.source.relativePath,
    );

    report?.({
      phase: "encoding",
      message: `${asset.name}を最適化しています（${plan.steps
        .map((step) => MODEL_OPTIMIZATION_STEP_LABELS[step])
        .join(" / ")}）`,
    });
    const optimized = await optimizeModelBytes(sourceBytes, plan.steps, {
      decodeDraco: plan.requiresDracoDecoder,
    });

    report?.({ phase: "saving", message: `${asset.name}を保存しています` });
    const sourceHash = await sha256Hex(optimized.bytes);
    const relativePath = processedAssetPath(asset.id, sourceHash, "glb");
    await tauri.commitVisualAssetImport(
      projectPath,
      createAssetImportTransactionId("model-optimize"),
      [
        {
          relativePath,
          dataUrl: await assetBytesToDataUrl(optimized.bytes, "model/gltf-binary"),
        },
      ],
    );

    const metadata = asset.importMetadata as ModelImportMetadata;
    const processed: ModelAsset = {
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
      importSettings: {
        ...asset.importSettings,
        // 書き出したGLBが新しい原本なので、設定は反映済みの状態へ戻す。
        optimizeMeshes: false,
      },
    };

    return {
      ok: true,
      manifest: { ...manifest, assets: { ...manifest.assets, [assetId]: processed } },
      assetName: asset.name,
      beforeBytes: metadata.byteLength || sourceBytes.byteLength,
      afterBytes: optimized.bytes.byteLength,
      steps: plan.steps,
    };
  } catch (error) {
    return {
      ok: false,
      message: `${asset.name}を最適化できませんでした。${describeAssetImportFailure(error)}`,
    };
  }
}

export type OptimizedModelBytes = {
  bytes: Uint8Array;
  meshCount: number;
  primitiveCount: number;
  extensionsUsed: string[];
  extensionsRequired: string[];
};

/**
 * GLBのバイト列だけを最適化する。Manifestを触らないので、公開前の一括最適化と
 * Inspectorからの単体実行で同じ経路を使える。
 */
export async function optimizeModelBytes(
  sourceBytes: Uint8Array,
  steps: readonly ModelOptimizationStep[],
  options: { decodeDraco?: boolean } = {},
): Promise<OptimizedModelBytes> {
  const [core, extensions, functions] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("@gltf-transform/functions"),
  ]);
  const io = new core.WebIO().registerExtensions(extensions.ALL_EXTENSIONS);
  const dependencies: Record<string, object> = {};
  if (steps.includes("draco")) {
    dependencies["draco3d.encoder"] = await createDracoEncoder();
  }
  // 圧縮済みGLBはデコーダーがないと読み込み自体が失敗する。
  if (options.decodeDraco) {
    dependencies["draco3d.decoder"] = await createDracoDecoder();
  }
  if (Object.keys(dependencies).length > 0) io.registerDependencies(dependencies);

  const document = await io.readBinary(copyAssetBytes(sourceBytes));

  // cleanup を切って、未使用に見えるMaterialやTextureが消えないようにする。
  // Material Slotはソースのmaterial indexで対応付けているので、索引が動くと
  // Entity側の割当が別のMaterialへ移ってしまう。
  if (steps.includes("weld")) {
    await document.transform(functions.weld());
  }
  if (steps.includes("resample-animations")) {
    await document.transform(functions.resample({ cleanup: false }));
  }
  if (steps.includes("dedup-accessors")) {
    await document.transform(
      functions.dedup({ propertyTypes: [core.PropertyType.ACCESSOR] }),
    );
  }
  if (steps.includes("draco")) {
    await document.transform(functions.draco({ method: "edgebreaker" }));
  }

  const bytes = copyAssetBytes(await io.writeBinary(document));
  const root = document.getRoot();
  const meshes = root.listMeshes();
  return {
    bytes,
    meshCount: meshes.length,
    primitiveCount: meshes.reduce((total, mesh) => total + mesh.listPrimitives().length, 0),
    extensionsUsed: root
      .listExtensionsUsed()
      .map((extension) => extension.extensionName),
    extensionsRequired: root
      .listExtensionsRequired()
      .map((extension) => extension.extensionName),
  };
}

export async function createDracoDecoder(): Promise<object> {
  const [{ default: createDecoderModule }, wasmModule] = await Promise.all([
    import("draco3dgltf/draco_decoder_gltf_nodejs.js"),
    import("draco3dgltf/draco_decoder_gltf.wasm?url"),
  ]);
  const wasmUrl = (wasmModule as { default: string }).default;
  const wasmBinary = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  return createDecoderModule({ wasmBinary });
}

export async function createDracoEncoder(): Promise<object> {
  const [{ default: createEncoderModule }, wasmModule] = await Promise.all([
    import("draco3dgltf/draco_encoder_gltf_nodejs.js"),
    import("draco3dgltf/draco_encoder.wasm?url"),
  ]);
  const wasmUrl = (wasmModule as { default: string }).default;
  const wasmBinary = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  return createEncoderModule({ wasmBinary });
}
