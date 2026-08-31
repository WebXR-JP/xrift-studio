import { tauri } from "../tauri";
import type { AssetManifest, ModelAsset, ModelImportMetadata } from "./asset-manifest";
import { decimatePrimitive } from "./model-decimation";
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
  | "simplify"
  | "draco";

export const MODEL_OPTIMIZATION_STEP_LABELS: Record<ModelOptimizationStep, string> = {
  weld: "重複頂点の結合",
  "dedup-accessors": "同一頂点バッファの共有",
  "resample-animations": "Animationキーフレームの間引き",
  simplify: "ポリゴンの間引き",
  draco: "Dracoメッシュ圧縮",
};

/**
 * 間引きの対象。
 *
 * Draw callも三角形数もNodeごとに偏るので、重い一枚だけを削れる必要がある。
 * Model原本を書き換えるため、同じModelを使う配置すべてに反映される。
 */
export type ModelSimplifyTarget =
  | { kind: "model" }
  | { kind: "node"; sourceNodeIndex: number };

export type ModelSimplifyOptions = {
  /** 残す頂点の割合。0.5で半分。 */
  ratio: number;
  target: ModelSimplifyTarget;
};

export type ModelOptimizationOptions = {
  /** メッシュ形状を保ったまま頂点とバッファを整理する。 */
  optimizeMeshes: boolean;
  /** KHR_draco_mesh_compressionで配信サイズを下げる。 */
  compressWithDraco: boolean;
  /** 形状を犠牲にして三角形を減らす。省略すると実行しない。 */
  simplify?: ModelSimplifyOptions;
};

/** 間引きで選べる割合。UIと MCP で同じ選択肢を使う。 */
export const MODEL_SIMPLIFY_RATIOS = [0.75, 0.5, 0.25, 0.1] as const;

export function isValidSimplifyRatio(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > 0 && ratio < 1;
}

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
      /** 間引きを実行したときだけ入る、三角形数の前後。 */
      triangles?: { before: number; after: number };
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
  if (options.simplify && isValidSimplifyRatio(options.simplify.ratio)) {
    steps.push("simplify");
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
    preservedNotice: steps.includes("simplify")
      ? "Material Slot、Node構造、Animationの本数は変わりません。形状は変わるので、元に戻すときは「最適化を元に戻す」を使ってください。"
      : "Material Slot、Node構造、Animationの本数は変わりません。Entity側の割当はそのまま使えます。",
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
      simplify: options.simplify,
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
        // 参照先が最適化後のGLBになったので、いま見えている設定は反映済みへ戻す。
        // 実行時の設定は optimizedFrom に控えてあり、戻せば元へ復元される。
        ...asset.importSettings,
        optimizeMeshes: false,
      },
      // 原本のGLBは書き換えないので、ここを保持している限り必ず戻せる。
      // 二度目以降の最適化では最初の原本を指したまま、時刻だけ更新する。
      optimizedFrom: {
        ...(asset.optimizedFrom ?? {
          source: asset.source,
          sourceHash: asset.sourceHash,
          importMetadata: asset.importMetadata,
          importSettings: asset.importSettings,
        }),
        appliedAt: new Date().toISOString(),
      },
    };

    return {
      ok: true,
      manifest: { ...manifest, assets: { ...manifest.assets, [assetId]: processed } },
      assetName: asset.name,
      beforeBytes: metadata.byteLength || sourceBytes.byteLength,
      afterBytes: optimized.bytes.byteLength,
      steps: plan.steps,
      ...(optimized.triangles ? { triangles: optimized.triangles } : {}),
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
  /** 間引きを実行したときだけ入る、三角形数の前後。 */
  triangles?: { before: number; after: number };
};

/**
 * GLBのバイト列だけを最適化する。Manifestを触らないので、公開前の一括最適化と
 * Inspectorからの単体実行で同じ経路を使える。
 */
export async function optimizeModelBytes(
  sourceBytes: Uint8Array,
  steps: readonly ModelOptimizationStep[],
  options: { decodeDraco?: boolean; simplify?: ModelSimplifyOptions } = {},
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
  let triangles: { before: number; after: number } | undefined;
  if (steps.includes("simplify") && options.simplify) {
    triangles = await simplifyDocument(document, options.simplify);
    // 差し替え前の頂点バッファは誰からも参照されなくなるが、残したままだと
    // 書き出しサイズが増える。ACCESSORだけを対象にして、Material索引と
    // Node構造には触れない。
    await document.transform(
      functions.prune({
        propertyTypes: [core.PropertyType.ACCESSOR],
        keepAttributes: true,
        keepLeaves: true,
        keepSolidTextures: true,
        keepExtras: true,
      }),
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
    ...(triangles ? { triangles } : {}),
  };
}

/**
 * 対象のPrimitiveだけを間引く。
 *
 * `simplify()` はDocument全体を対象にするので、Nodeを選べるようPrimitive単位の
 * APIを使う。索引を動かす変換は挟まない。Nodeの並び、Mesh、Materialはそのまま
 * なので、Entity側の `sourceNodeIndex` とMaterial Slotの割当は生きたままになる。
 */
async function simplifyDocument(
  document: import("@gltf-transform/core").Document,
  options: ModelSimplifyOptions,
): Promise<{ before: number; after: number }> {
  const targets = collectSimplifyTargetMeshes(document, options.target);
  if (targets.length === 0) {
    throw new Error(
      "間引く対象のMeshが見つかりませんでした。Meshを持つNodeを選んでください。",
    );
  }
  let before = 0;
  let after = 0;
  for (const mesh of targets) {
    for (const primitive of mesh.listPrimitives()) {
      const result = await decimatePrimitive(document, primitive, options.ratio);
      before += result.before;
      after += result.after;
    }
  }
  return { before, after };
}

function collectSimplifyTargetMeshes(
  document: import("@gltf-transform/core").Document,
  target: ModelSimplifyTarget,
): import("@gltf-transform/core").Mesh[] {
  const root = document.getRoot();
  if (target.kind === "model") return root.listMeshes();
  // Nodeの並びはglTFのnodes配列そのままで、Entityが持つsourceNodeIndexと同じ。
  const node = root.listNodes()[target.sourceNodeIndex];
  const mesh = node?.getMesh();
  return mesh ? [mesh] : [];
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


export type ModelOptimizationStatus =
  | { optimized: false }
  | {
      optimized: true;
      current: { label: string; byteLength: number };
      original: { label: string; byteLength: number | null };
    };

/** 「いま何を使っているか」と「戻せる原本があるか」をInspector向けにまとめる。 */
export function describeModelOptimization(
  asset: ModelAsset,
): ModelOptimizationStatus {
  const origin = asset.optimizedFrom;
  if (!origin) return { optimized: false };
  return {
    optimized: true,
    current: {
      label: describeModelVariant(asset.importMetadata),
      byteLength: asset.importMetadata?.byteLength ?? 0,
    },
    original: {
      label: describeModelVariant(origin.importMetadata),
      byteLength: origin.importMetadata?.byteLength ?? null,
    },
  };
}

function describeModelVariant(metadata: ModelImportMetadata | undefined): string {
  if (!metadata) return "解析結果なし";
  const draco =
    metadata.extensionsUsed.includes("KHR_draco_mesh_compression") ||
    metadata.extensionsRequired.includes("KHR_draco_mesh_compression");
  return `${metadata.meshCount}メッシュ・${draco ? "Draco圧縮あり" : "メッシュ圧縮なし"}`;
}

/**
 * 最適化結果の参照をやめ、控えてある原本のGLBへ戻す。
 * 最適化後のファイルは消さない。同じ設定で作り直せば同じ内容になる。
 */
export function revertModelOptimization(
  manifest: AssetManifest,
  assetId: string,
):
  | { ok: false; message: string }
  | { ok: true; manifest: AssetManifest; assetName: string } {
  const asset = manifest.assets[assetId];
  if (!asset || asset.kind !== "model") {
    return { ok: false, message: "対象のModel Assetが見つかりませんでした。" };
  }
  const origin = asset.optimizedFrom;
  if (!origin) {
    return { ok: false, message: `${asset.name}は原本をそのまま使っています。` };
  }

  const restored: ModelAsset = {
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
