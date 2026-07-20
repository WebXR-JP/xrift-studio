import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import {
  normalizeModelImportSettings,
  normalizeProjectRelativePath,
  normalizeTextureImportSettings,
  type AudioAsset,
  type AssetFolder,
  type AssetManifest,
  type MaterialAsset,
  type ModelAsset,
  type ModelBoneMetadata,
  type ModelBoundsMetadata,
  type ModelImportMetadata,
  type ModelMorphTargetMetadata,
  type SceneAsset,
  type TextureAsset,
  type TextureImportSettingsPatch,
} from "./asset-manifest";
import {
  reconcileModelMaterialSlots,
  validateModelAssetContract,
  type DiscoveredModelMaterialSlot,
} from "./model-import-contract";
import {
  expandGltfAssets,
  type GltfJson,
} from "./gltf-derived-assets";
import {
  detectOpenBrushGltfDocument,
  prepareOpenBrushGltfSource,
} from "./open-brush";

export const ASSET_IMPORT_THUMBNAIL_RENDERER_VERSION = "three-white-v1";
export const ASSET_IMPORT_MAX_BYTES = 128 * 1024 * 1024;

export type SupportedAssetImportFormat =
  | "glb"
  | "gltf"
  | "obj"
  | "vrm"
  | "png"
  | "jpeg"
  | "webp"
  | "ktx2"
  | "mp3";

export type ClassifiedAssetImport =
  | {
      kind: "model";
      format: "glb" | "gltf" | "obj" | "vrm";
      mimeType:
        | "model/gltf-binary"
        | "model/gltf+json"
        | "model/obj"
        | "model/vrm";
      extension: "glb" | "gltf" | "obj" | "vrm";
    }
  | {
      kind: "texture";
      format: "png" | "jpeg" | "webp" | "ktx2";
      mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/ktx2";
      extension: "png" | "jpg" | "jpeg" | "webp" | "ktx2";
    }
  | {
      kind: "audio";
      format: "mp3";
      mimeType: "audio/mpeg";
      extension: "mp3";
    };

export type AssetImportDiagnostic = {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  fileName: string;
  assetId?: string;
  fieldPath?: string;
};

export type AssetImportWritePayload =
  | { encoding: "bytes"; bytes: Uint8Array }
  | { encoding: "data-url"; dataUrl: string };

export type AssetImportWrite = {
  relativePath: string;
  purpose: "source" | "thumbnail";
  mediaType: string;
  /** Present when the payload is the original imported source. */
  sha256?: string;
  payload: AssetImportWritePayload;
};

export type AssetImportPlan = {
  transactionId: string;
  sourceHash: string;
  /** Existing Asset replaced by a reimport. Omitted for a new import. */
  replacesAssetId?: string;
  classification?: ClassifiedAssetImport;
  /** Primary Model, standalone Texture, or Audio selected after the transaction. */
  asset?: ModelAsset | TextureAsset | AudioAsset;
  /** Material/Texture Assets expanded from an imported Model. */
  derivedAssets?: Array<MaterialAsset | TextureAsset>;
  /** Logical Asset folders created with the Model import. */
  folders?: AssetFolder[];
  writes: AssetImportWrite[];
  diagnostics: AssetImportDiagnostic[];
  canCommit: boolean;
};

export type CreateAssetImportPlanInput = {
  fileName: string;
  bytes: ArrayBuffer | Uint8Array;
  mimeType?: string;
  displayName?: string;
  folderId?: string | null;
  textureImportSettings?: TextureImportSettingsPatch;
  /** Enables same-folder update matching and derived Asset reuse. */
  existingManifest?: AssetManifest;
};

export type CreateModelReimportPlanInput = Omit<
  CreateAssetImportPlanInput,
  "folderId" | "textureImportSettings"
>;

export type AtomicAssetImportCommitRequest = {
  transactionId: string;
  /** The shell must publish all writes, or none of them. */
  writes: readonly AssetImportWrite[];
};

export type AtomicAssetImportCommit = (
  request: AtomicAssetImportCommitRequest,
) => Promise<void>;

type ThumbnailResult = {
  dataUrl: string;
  mediaType: string;
  extension: "webp" | "png";
  width: number;
  height: number;
};

/** Classifies only formats handled by the visual editor import boundary. */
export function classifyAssetImport(
  fileName: string,
  mimeType = "",
): ClassifiedAssetImport | undefined {
  const extension = extensionOf(fileName);
  const normalizedMime = mimeType.trim().toLowerCase().split(";")[0];

  if (extension === "glb" || normalizedMime === "model/gltf-binary") {
    return {
      kind: "model",
      format: "glb",
      mimeType: "model/gltf-binary",
      extension: "glb",
    };
  }
  if (extension === "gltf" || normalizedMime === "model/gltf+json") {
    return {
      kind: "model",
      format: "gltf",
      mimeType: "model/gltf+json",
      extension: "gltf",
    };
  }
  if (extension === "vrm" || normalizedMime === "model/vrm") {
    return {
      kind: "model",
      format: "vrm",
      mimeType: "model/vrm",
      extension: "vrm",
    };
  }
  if (extension === "obj" || normalizedMime === "model/obj") {
    return {
      kind: "model",
      format: "obj",
      mimeType: "model/obj",
      extension: "obj",
    };
  }
  if (extension === "png" || normalizedMime === "image/png") {
    return {
      kind: "texture",
      format: "png",
      mimeType: "image/png",
      extension: "png",
    };
  }
  if (
    extension === "jpg" ||
    extension === "jpeg" ||
    normalizedMime === "image/jpeg"
  ) {
    return {
      kind: "texture",
      format: "jpeg",
      mimeType: "image/jpeg",
      extension: extension === "jpeg" ? "jpeg" : "jpg",
    };
  }
  if (extension === "webp" || normalizedMime === "image/webp") {
    return {
      kind: "texture",
      format: "webp",
      mimeType: "image/webp",
      extension: "webp",
    };
  }
  if (
    extension === "ktx2" ||
    normalizedMime === "image/ktx2" ||
    normalizedMime === "image/ktx"
  ) {
    return {
      kind: "texture",
      format: "ktx2",
      mimeType: "image/ktx2",
      extension: "ktx2",
    };
  }
  if (
    extension === "mp3" ||
    normalizedMime === "audio/mpeg" ||
    normalizedMime === "audio/mp3"
  ) {
    return {
      kind: "audio",
      format: "mp3",
      mimeType: "audio/mpeg",
      extension: "mp3",
    };
  }
  return undefined;
}

/**
 * Builds a self-contained plan. It never writes files and GLTFLoader is not
 * invoked until external URI references have been rejected.
 */
export async function createAssetImportPlan(
  input: CreateAssetImportPlanInput,
): Promise<AssetImportPlan> {
  return createAssetImportPlanInternal(input);
}

/**
 * Builds a Model replacement plan while preserving its authoring identity.
 * The caller commits it through the same atomic boundary as a new import.
 */
export async function createModelReimportPlan(
  existingAsset: ModelAsset,
  input: CreateModelReimportPlanInput,
  manifest?: AssetManifest,
): Promise<AssetImportPlan> {
  return createAssetImportPlanInternal(
    {
      ...input,
      folderId: existingAsset.folderId ?? null,
      existingManifest: manifest ?? input.existingManifest,
    },
    existingAsset,
  );
}

async function createAssetImportPlanInternal(
  input: CreateAssetImportPlanInput,
  reimportAsset?: ModelAsset,
): Promise<AssetImportPlan> {
  const fileName = leafFileName(input.fileName);
  const bytes = cloneBytes(input.bytes);
  let sourceHash: string;
  try {
    sourceHash = await sha256AssetBytes(bytes);
  } catch (error) {
    const diagnostics: AssetImportDiagnostic[] = [
      {
        severity: "blocking",
        code: "source-hash-failed",
        message: `ソースのSHA-256を計算できませんでした: ${errorMessage(error)}`,
        fileName,
        fieldPath: "bytes",
      },
    ];
    return blockedPlan(
      "asset-import-unhashed",
      "",
      diagnostics,
      undefined,
      reimportAsset?.id,
    );
  }
  const transactionId = `asset-import-${sourceHash.slice(0, 20)}`;
  const diagnostics: AssetImportDiagnostic[] = [];
  const classification = classifyAssetImport(fileName, input.mimeType);

  if (!classification) {
    diagnostics.push({
      severity: "blocking",
      code: "unsupported-asset-format",
      message: "GLB、glTF、OBJ、VRM、PNG、JPG、WebP、KTX2、MP3 のみ取り込めます",
      fileName,
      fieldPath: "fileName",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      undefined,
      reimportAsset?.id,
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > ASSET_IMPORT_MAX_BYTES) {
    diagnostics.push({
      severity: "blocking",
      code: bytes.byteLength === 0 ? "asset-empty" : "asset-too-large",
      message:
        bytes.byteLength === 0
          ? "空のファイルは取り込めません"
          : `取り込み上限 ${ASSET_IMPORT_MAX_BYTES / 1024 / 1024} MB を超えています`,
      fileName,
      fieldPath: "bytes",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  if (reimportAsset && classification.kind !== "model") {
    diagnostics.push({
      severity: "blocking",
      code: "reimport-kind-mismatch",
      message: "Model AssetにはGLB、glTF、OBJまたはVRMを再取り込みしてください",
      fileName,
      assetId: reimportAsset.id,
      fieldPath: "fileName",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset.id,
    );
  }

  const matchedModel =
    classification.kind === "model" && !reimportAsset
      ? findMatchingModelImport(
          input.existingManifest,
          fileName,
          normalizeFolderId(input.folderId),
        )
      : undefined;

  if (classification.kind === "model") {
    return classification.format === "obj"
      ? createObjModelImportPlan(
          input,
          fileName,
          bytes,
          sourceHash,
          transactionId,
          classification,
          reimportAsset ?? matchedModel,
        )
      : createModelImportPlan(
          input,
          fileName,
          bytes,
          sourceHash,
          transactionId,
          classification,
          reimportAsset ?? matchedModel,
        );
  }
  return classification.kind === "texture"
    ? createTextureImportPlan(
        input,
        fileName,
        bytes,
        sourceHash,
        transactionId,
        classification,
      )
    : createAudioImportPlan(
        input,
        fileName,
        bytes,
        sourceHash,
        transactionId,
        classification,
      );
}

/**
 * Commits a validated plan through one atomic shell call. The returned
 * manifest is produced only after the shell reports success.
 */
export async function commitAssetImportPlan(
  manifest: AssetManifest,
  plan: AssetImportPlan,
  commit: AtomicAssetImportCommit,
): Promise<AssetManifest> {
  if (!plan.canCommit || !plan.asset) {
    throw new Error("Blocking diagnostics must be resolved before import commit");
  }
  const existing = manifest.assets[plan.asset.id];
  const isReplacement = plan.replacesAssetId === plan.asset.id;
  if (existing) {
    if (!isReplacement) {
      if (
        existing.sourceHash === plan.sourceHash &&
        existing.kind === plan.asset.kind
      ) {
        // Keep validating and applying derived Assets. This also migrates a
        // pre-expansion Model whose content-addressed source is already durable.
      } else {
        throw new Error(`Asset ID collision: ${plan.asset.id}`);
      }
    } else if (existing.kind !== "model" || plan.asset.kind !== "model") {
      throw new Error("Only a Model Asset can be replaced by Model reimport");
    }
  } else if (plan.replacesAssetId) {
    throw new Error(`Reimport target is missing: ${plan.replacesAssetId}`);
  }

  const folders: Record<string, AssetFolder> = { ...(manifest.folders ?? {}) };
  for (const folder of plan.folders ?? []) {
    const current = folders[folder.id];
    if (
      current &&
      (current.name !== folder.name || current.parentId !== folder.parentId)
    ) {
      throw new Error(`Asset folder ID collision: ${folder.id}`);
    }
    folders[folder.id] = current ?? { ...folder };
  }
  for (const folder of Object.values(folders)) {
    if (folder.parentId !== null && !folders[folder.parentId]) {
      throw new Error(`Asset folder parent does not exist: ${folder.parentId}`);
    }
  }

  if (
    plan.writes.some(
      (write) => !isSafeAssetImportDestination(write.relativePath),
    )
  ) {
    throw new Error("Asset import plan contains an unsafe destination");
  }

  const plannedAssets: SceneAsset[] = [
    plan.asset,
    ...(plan.derivedAssets ?? []),
  ];
  const candidateAssets: Record<string, SceneAsset> = { ...manifest.assets };
  for (const plannedAsset of plannedAssets) {
    const current = candidateAssets[plannedAsset.id];
    if (current && current.kind !== plannedAsset.kind) {
      throw new Error(`Derived Asset ID collision: ${plannedAsset.id}`);
    }
    const folderId = plannedAsset.folderId ?? null;
    if (folderId !== null && !folders[folderId]) {
      throw new Error(`Asset folder does not exist: ${folderId}`);
    }
    const order =
      current?.order ??
      nextImportedAssetOrder(
        { ...manifest, folders, assets: candidateAssets },
        folderId,
      );
    candidateAssets[plannedAsset.id] = { ...plannedAsset, order };
  }

  if (plan.asset.kind === "model") {
    const contractIssues = validateModelAssetContract(
      candidateAssets[plan.asset.id],
      candidateAssets,
      `$.assets.${plan.asset.id}`,
    );
    if (contractIssues.length > 0) {
      throw new Error(
        `Model import contract is invalid: ${contractIssues[0].path} ${contractIssues[0].message}`,
      );
    }
    if (
      plan.asset.sourceHash !== plan.sourceHash ||
      plan.asset.source.kind !== "project"
    ) {
      throw new Error("Model import source identity does not match its plan");
    }
    const verifiedSourceWrite = plan.writes.find(
      (write) =>
        write.purpose === "source" &&
        plan.asset?.source.kind === "project" &&
        write.relativePath === plan.asset.source.relativePath,
    );
    const sourceIsAlreadyDurable =
      isReplacement && existing?.sourceHash === plan.sourceHash;
    if (
      !sourceIsAlreadyDurable &&
      (!verifiedSourceWrite || verifiedSourceWrite.sha256 !== plan.sourceHash)
    ) {
      throw new Error("Model import plan does not contain its verified source");
    }
  }

  if (plan.asset.kind === "audio") {
    if (
      plan.asset.sourceHash !== plan.sourceHash ||
      plan.asset.source.kind !== "project"
    ) {
      throw new Error("Audio import source identity does not match its plan");
    }
    const verifiedSourceWrite = plan.writes.find(
      (write) =>
        write.purpose === "source" &&
        plan.asset?.source.kind === "project" &&
        write.relativePath === plan.asset.source.relativePath,
    );
    if (!verifiedSourceWrite || verifiedSourceWrite.sha256 !== plan.sourceHash) {
      throw new Error("Audio import plan does not contain its verified source");
    }
  }

  if (plan.writes.length > 0) {
    await commit({ transactionId: plan.transactionId, writes: plan.writes });
  }

  return {
    ...manifest,
    folders,
    assets: candidateAssets,
  };
}

function nextImportedAssetOrder(
  manifest: AssetManifest,
  folderId: string | null,
): number {
  return (
    Math.max(
      -1,
      ...Object.values(manifest.assets)
        .filter((asset) => (asset.folderId ?? null) === folderId)
        .map((asset) => asset.order ?? -1),
    ) + 1
  );
}

export function isSafeAssetImportDestination(value: string): boolean {
  const normalized = normalizeProjectRelativePath(value);
  if (!normalized) return false;
  return (
    normalized === value.replace(/\\/g, "/") &&
    (normalized.startsWith("assets/imported/") ||
      normalized.startsWith("assets/.derived/thumbnails/"))
  );
}

export async function sha256AssetBytes(
  input: ArrayBuffer | Uint8Array,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const bytes = cloneBytes(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function createModelImportPlan(
  input: CreateAssetImportPlanInput,
  fileName: string,
  bytes: Uint8Array,
  sourceHash: string,
  transactionId: string,
  classification: Extract<ClassifiedAssetImport, { kind: "model" }>,
  reimportAsset?: ModelAsset,
): Promise<AssetImportPlan> {
  if (classification.format === "obj") {
    throw new Error("OBJ import must use the OBJ import plan");
  }
  const diagnostics: AssetImportDiagnostic[] = [];
  const parsedJson = parseGltfJson(bytes, classification.format);
  if (!parsedJson.ok) {
    diagnostics.push({
      severity: "blocking",
      code: parsedJson.code,
      message: parsedJson.message,
      fileName,
      fieldPath: parsedJson.fieldPath,
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  const structureIssues = validateGltfImportStructure(parsedJson.json);
  diagnostics.push(
    ...structureIssues.map((candidate) => ({
      severity: "blocking" as const,
      code: candidate.code,
      message: candidate.message,
      fileName,
      assetId: reimportAsset?.id,
      fieldPath: candidate.fieldPath,
    })),
  );
  if (structureIssues.length > 0) {
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  if (
    classification.format === "vrm" &&
    !stringArray(parsedJson.json.extensionsUsed).some(
      (extension) => extension === "VRM" || extension === "VRMC_vrm",
    )
  ) {
    diagnostics.push({
      severity: "blocking",
      code: "vrm-extension-missing",
      message: "VRM 0.xまたは1.xの拡張が見つかりません。VRMとして書き出したファイルを選んでください",
      fileName,
      assetId: reimportAsset?.id,
      fieldPath: "extensionsUsed",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  const openBrush = detectOpenBrushGltfDocument(parsedJson.json);
  const discoveredExternalReferences = findExternalGltfReferences(
    parsedJson.json,
  );
  const externalReferences = discoveredExternalReferences.filter(
    (reference) => !openBrush || !reference.fieldPath.startsWith("images["),
  );
  if (
    openBrush &&
    discoveredExternalReferences.some((reference) =>
      reference.fieldPath.startsWith("images["),
    )
  ) {
    diagnostics.push({
      severity: "warning",
      code: "openbrush-hosted-brush-library",
      message:
        "OpenBrushの旧画像URLはImport時に取得せず、表示時にthree-icosaのブラシ素材へ置き換えます",
      fileName,
      assetId: reimportAsset?.id,
      fieldPath: "images",
    });
  }
  for (const reference of externalReferences) {
    diagnostics.push({
      severity: "blocking",
      code: "gltf-external-dependency",
      message: `外部依存 ${reference.uri} が不足しています。GLBへ埋め込むか、依存ファイルをまとめて取り込んでください`,
      fileName,
      fieldPath: reference.fieldPath,
    });
  }
  if (externalReferences.length > 0) {
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  let gltf: GLTF;
  try {
    gltf = await parseWithGltfLoader(
      bytes,
      classification.format,
      openBrush !== undefined,
    );
  } catch (error) {
    diagnostics.push({
      severity: "blocking",
      code: "gltf-parse-failed",
      message: `Three GLTFLoaderで解析できませんでした: ${errorMessage(error)}`,
      fileName,
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }
  if (classification.format === "vrm" && !gltf.userData.vrm) {
    diagnostics.push({
      severity: "blocking",
      code: "vrm-runtime-metadata-missing",
      message: "VRMのhumanoid / expression metadataを解析できませんでした",
      fileName,
      assetId: reimportAsset?.id,
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  const assetId =
    reimportAsset?.id ?? createImportedAssetId("model", fileName, sourceHash);
  const modelName =
    input.displayName !== undefined
      ? normalizedDisplayName(input.displayName, fileName)
      : reimportAsset?.name ?? normalizedDisplayName(undefined, fileName);
  const folderPlan = createModelFolderPlan(
    input.existingManifest,
    assetId,
    modelName,
    normalizeFolderId(input.folderId),
    reimportAsset,
  );
  const sourceUnchanged = reimportAsset?.sourceHash === sourceHash;
  const sourceRelativePath =
    sourceUnchanged && reimportAsset.source.kind === "project"
      ? reimportAsset.source.relativePath
      : createSourceDestination(
          "models",
          fileName,
          sourceHash,
          classification.extension,
        );
  let materialSlots: ModelAsset["materialSlots"];
  try {
    materialSlots = reconcileModelMaterialSlots(
      extractMaterialSlots(parsedJson.json),
      reimportAsset?.materialSlots,
    );
    if (openBrush) {
      materialSlots = materialSlots.map((slot) => {
        const defaultMaterial = slot.defaultMaterialAssetId
          ? input.existingManifest?.assets[slot.defaultMaterialAssetId]
          : undefined;
        if (
          defaultMaterial?.kind !== "material" ||
          defaultMaterial.importedFromModel?.modelAssetId !== assetId ||
          defaultMaterial.importedFromModel.isUserOverridden
        ) {
          return slot;
        }
        const { defaultMaterialAssetId: _autoImportedDefault, ...sourceSlot } = slot;
        return sourceSlot;
      });
    }
  } catch (error) {
    diagnostics.push({
      severity: "blocking",
      code: "model-material-slots-invalid",
      message: `Material slotを正規化できませんでした: ${errorMessage(error)}`,
      fileName,
      assetId,
      fieldPath: "materials",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }
  const importMetadata = extractModelMetadata(
    gltf,
    parsedJson.json,
    classification.format,
    fileName,
    bytes.byteLength,
  );
  if (openBrush) importMetadata.openBrush = openBrush;
  let thumbnail: ModelAsset["thumbnail"] = sourceUnchanged
    ? cloneThumbnail(reimportAsset.thumbnail)
    : staleThumbnailForReimport(reimportAsset);
  const writes: AssetImportWrite[] = sourceUnchanged
    ? []
    : [
        {
          relativePath: sourceRelativePath,
          purpose: "source",
          mediaType: classification.mimeType,
          sha256: sourceHash,
          payload: { encoding: "bytes", bytes: bytes.slice() },
        },
      ];

  if (!sourceUnchanged) {
    try {
      const rendered = await renderModelThumbnail(gltf.scene);
      const derivedPath = `assets/.derived/thumbnails/${assetId}-${sourceHash.slice(0, 16)}.${rendered.extension}`;
      thumbnail = {
        status: "generated",
        derivedPath,
        sourceHash,
        rendererVersion: ASSET_IMPORT_THUMBNAIL_RENDERER_VERSION,
      };
      writes.push({
        relativePath: derivedPath,
        purpose: "thumbnail",
        mediaType: rendered.mediaType,
        payload: { encoding: "data-url", dataUrl: rendered.dataUrl },
      });
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        code: "model-thumbnail-failed",
        message: `モデルのサムネイルを生成できませんでした: ${errorMessage(error)}`,
        fileName,
        assetId,
        fieldPath: "thumbnail",
      });
    }
  }

  const derivedAssets: Array<MaterialAsset | TextureAsset> = [];
  if (!openBrush) {
    const expanded = await expandGltfAssets({
    json: parsedJson.json,
    modelBytes: bytes,
    sourceFormat: classification.format === "vrm" ? "glb" : classification.format,
    modelAssetId: assetId,
    modelSourceHash: sourceHash,
    materialSlots,
    manifest: input.existingManifest,
    materialFolderId: folderPlan.materialFolderId,
    textureFolderId: folderPlan.textureFolderId,
    hashBytes: sha256AssetBytes,
  });
    materialSlots = expanded.materialSlots;
    derivedAssets.push(...expanded.materialAssets, ...expanded.textureAssets);
  writes.push(
    ...expanded.writes.map((write) => ({
      relativePath: write.relativePath,
      purpose: "source" as const,
      mediaType: write.mediaType,
      sha256: write.sha256,
      payload: { encoding: "bytes" as const, bytes: write.bytes },
    })),
  );
  diagnostics.push(
    ...expanded.warnings.map((warning) => ({
      severity: "warning" as const,
      code: warning.code,
      message: warning.message,
      fileName,
      assetId,
      fieldPath: warning.fieldPath,
    })),
  );

  }

  const asset: ModelAsset = {
    id: assetId,
    name: modelName,
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: sourceRelativePath },
    sourceHash,
    thumbnail,
    folderId: folderPlan.modelFolderId,
    ...(reimportAsset?.order === undefined ? {} : { order: reimportAsset.order }),
    importSettings: reimportAsset
      ? normalizeModelImportSettings({}, reimportAsset.importSettings)
      : normalizeModelImportSettings(),
    materialSlots,
    importMetadata,
  };
  diagnostics.push(
    ...validateModelAssetContract(asset).map((candidate) => ({
      severity: "blocking" as const,
      code: `model-contract-${candidate.code}`,
      message: candidate.message,
      fileName,
      assetId,
      fieldPath: candidate.path,
    })),
  );
  return finishPlan(
    transactionId,
    sourceHash,
    classification,
    asset,
    writes,
    diagnostics,
    reimportAsset?.id,
    derivedAssets,
    folderPlan.folders,
  );
}

async function createObjModelImportPlan(
  input: CreateAssetImportPlanInput,
  fileName: string,
  bytes: Uint8Array,
  sourceHash: string,
  transactionId: string,
  classification: Extract<ClassifiedAssetImport, { kind: "model" }>,
  reimportAsset?: ModelAsset,
): Promise<AssetImportPlan> {
  const diagnostics: AssetImportDiagnostic[] = [];
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*v\s+[-+\d.]/m.test(text) || !/^\s*f\s+\S+/m.test(text)) {
    diagnostics.push({
      severity: "blocking",
      code: "obj-geometry-missing",
      message: "OBJに頂点または面のgeometryが見つかりません",
      fileName,
      assetId: reimportAsset?.id,
      fieldPath: "bytes",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  let object: Object3D;
  try {
    object = new OBJLoader().parse(text);
  } catch (error) {
    diagnostics.push({
      severity: "blocking",
      code: "obj-parse-failed",
      message: `Three OBJLoaderで解析できませんでした: ${errorMessage(error)}`,
      fileName,
      assetId: reimportAsset?.id,
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  const discoveredSlots = tagObjSourceMaterialIndices(object);
  if (discoveredSlots.length === 0) {
    diagnostics.push({
      severity: "blocking",
      code: "obj-renderable-mesh-missing",
      message: "OBJに表示できるMeshが見つかりません",
      fileName,
      assetId: reimportAsset?.id,
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  if (/^\s*mtllib\s+\S+/im.test(text)) {
    diagnostics.push({
      severity: "warning",
      code: "obj-external-material-library",
      message: "OBJの外部MTL / textureは自動取得しません。配置後にMaterial Slotへ割り当ててください",
      fileName,
      assetId: reimportAsset?.id,
      fieldPath: "mtllib",
    });
  }

  const assetId =
    reimportAsset?.id ?? createImportedAssetId("model", fileName, sourceHash);
  const modelName =
    input.displayName !== undefined
      ? normalizedDisplayName(input.displayName, fileName)
      : reimportAsset?.name ?? normalizedDisplayName(undefined, fileName);
  const folderPlan = createModelFolderPlan(
    input.existingManifest,
    assetId,
    modelName,
    normalizeFolderId(input.folderId),
    reimportAsset,
  );
  const sourceUnchanged = reimportAsset?.sourceHash === sourceHash;
  const sourceRelativePath =
    sourceUnchanged && reimportAsset.source.kind === "project"
      ? reimportAsset.source.relativePath
      : createSourceDestination("models", fileName, sourceHash, "obj");
  let materialSlots: ModelAsset["materialSlots"];
  try {
    materialSlots = reconcileModelMaterialSlots(
      discoveredSlots,
      reimportAsset?.materialSlots,
    );
  } catch (error) {
    diagnostics.push({
      severity: "blocking",
      code: "model-material-slots-invalid",
      message: `Material slotを正規化できませんでした: ${errorMessage(error)}`,
      fileName,
      assetId,
      fieldPath: "materials",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
      reimportAsset?.id,
    );
  }

  const metadata = extractObjectModelMetadata(
    object,
    "obj",
    fileName,
    bytes.byteLength,
  );
  let thumbnail: ModelAsset["thumbnail"] = sourceUnchanged
    ? cloneThumbnail(reimportAsset.thumbnail)
    : staleThumbnailForReimport(reimportAsset);
  const writes: AssetImportWrite[] = sourceUnchanged
    ? []
    : [
        {
          relativePath: sourceRelativePath,
          purpose: "source",
          mediaType: classification.mimeType,
          sha256: sourceHash,
          payload: { encoding: "bytes", bytes: bytes.slice() },
        },
      ];
  if (!sourceUnchanged) {
    try {
      const rendered = await renderModelThumbnail(object);
      const derivedPath = `assets/.derived/thumbnails/${assetId}-${sourceHash.slice(0, 16)}.${rendered.extension}`;
      thumbnail = {
        status: "generated",
        derivedPath,
        sourceHash,
        rendererVersion: ASSET_IMPORT_THUMBNAIL_RENDERER_VERSION,
      };
      writes.push({
        relativePath: derivedPath,
        purpose: "thumbnail",
        mediaType: rendered.mediaType,
        payload: { encoding: "data-url", dataUrl: rendered.dataUrl },
      });
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        code: "model-thumbnail-failed",
        message: `モデルのサムネイルを生成できませんでした: ${errorMessage(error)}`,
        fileName,
        assetId,
        fieldPath: "thumbnail",
      });
    }
  }

  const asset: ModelAsset = {
    id: assetId,
    name: modelName,
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: sourceRelativePath },
    sourceHash,
    thumbnail,
    folderId: folderPlan.modelFolderId,
    ...(reimportAsset?.order === undefined ? {} : { order: reimportAsset.order }),
    importSettings: reimportAsset
      ? normalizeModelImportSettings({}, reimportAsset.importSettings)
      : normalizeModelImportSettings(),
    materialSlots,
    importMetadata: metadata,
  };
  diagnostics.push(
    ...validateModelAssetContract(asset).map((candidate) => ({
      severity: "blocking" as const,
      code: `model-contract-${candidate.code}`,
      message: candidate.message,
      fileName,
      assetId,
      fieldPath: candidate.path,
    })),
  );
  return finishPlan(
    transactionId,
    sourceHash,
    classification,
    asset,
    writes,
    diagnostics,
    reimportAsset?.id,
    [],
    folderPlan.folders,
  );
}

function staleThumbnailForReimport(
  asset: ModelAsset | undefined,
): ModelAsset["thumbnail"] {
  const thumbnail = asset?.thumbnail;
  return thumbnail && thumbnail.status !== "missing"
    ? { ...thumbnail, status: "stale" }
    : { status: "missing" };
}

function cloneThumbnail(
  thumbnail: ModelAsset["thumbnail"] | undefined,
): ModelAsset["thumbnail"] {
  return thumbnail ? { ...thumbnail } : { status: "missing" };
}

async function createTextureImportPlan(
  input: CreateAssetImportPlanInput,
  fileName: string,
  bytes: Uint8Array,
  sourceHash: string,
  transactionId: string,
  classification: Extract<ClassifiedAssetImport, { kind: "texture" }>,
): Promise<AssetImportPlan> {
  const diagnostics: AssetImportDiagnostic[] = [];
  if (!hasTextureSignature(bytes, classification.format)) {
    diagnostics.push({
      severity: "blocking",
      code: "texture-signature-invalid",
      message: `${classification.format.toUpperCase()} のファイルシグネチャが不正です`,
      fileName,
      fieldPath: "bytes",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
    );
  }
  const assetId = createImportedAssetId("texture", fileName, sourceHash);
  const sourceRelativePath = createSourceDestination(
    "textures",
    fileName,
    sourceHash,
    classification.extension,
  );
  const writes: AssetImportWrite[] = [
    {
      relativePath: sourceRelativePath,
      purpose: "source",
      mediaType: classification.mimeType,
      sha256: sourceHash,
      payload: { encoding: "bytes", bytes: bytes.slice() },
    },
  ];
  let thumbnail: TextureAsset["thumbnail"] = { status: "missing" };
  let dimensions =
    classification.format === "ktx2" ? readKtx2Dimensions(bytes) : undefined;

  try {
    const rendered = await renderTextureThumbnail(bytes, classification.mimeType);
    dimensions = { width: rendered.width, height: rendered.height };
    const derivedPath = `assets/.derived/thumbnails/${assetId}.${rendered.extension}`;
    thumbnail = {
      status: "generated",
      derivedPath,
      sourceHash,
      rendererVersion: ASSET_IMPORT_THUMBNAIL_RENDERER_VERSION,
    };
    writes.push({
      relativePath: derivedPath,
      purpose: "thumbnail",
      mediaType: rendered.mediaType,
      payload: { encoding: "data-url", dataUrl: rendered.dataUrl },
    });
  } catch (error) {
    diagnostics.push({
      severity: "warning",
      code:
        classification.format === "ktx2"
          ? "ktx2-thumbnail-unsupported"
          : "texture-thumbnail-failed",
      message: `テクスチャのサムネイルを生成できませんでした: ${errorMessage(error)}`,
      fileName,
      assetId,
      fieldPath: "thumbnail",
    });
  }

  const asset: TextureAsset = {
    id: assetId,
    name: normalizedDisplayName(input.displayName, fileName),
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: sourceRelativePath },
    sourceHash,
    thumbnail,
    folderId: normalizeFolderId(input.folderId),
    importSettings: normalizeTextureImportSettings(
      input.textureImportSettings,
    ),
    importMetadata: {
      sourceFormat: classification.format,
      mimeType: classification.mimeType,
      byteLength: bytes.byteLength,
      ...(dimensions ?? {}),
    },
  };
  return finishPlan(
    transactionId,
    sourceHash,
    classification,
    asset,
    writes,
    diagnostics,
  );
}

function parseGltfJson(
  bytes: Uint8Array,
  format: "glb" | "gltf" | "vrm",
):
  | { ok: true; json: GltfJson }
  | { ok: false; code: string; message: string; fieldPath?: string } {
  try {
    const jsonText = format === "gltf"
      ? new TextDecoder().decode(bytes)
      : readGlbJsonChunk(bytes);
    const json = JSON.parse(jsonText) as unknown;
    if (!isRecord(json)) {
      return {
        ok: false,
        code: "gltf-json-invalid",
        message: "glTF JSON rootはobjectである必要があります",
      };
    }
    return { ok: true, json: json as GltfJson };
  } catch (error) {
    return {
      ok: false,
      code: format === "gltf" ? "gltf-json-invalid" : "glb-invalid",
      message: errorMessage(error),
    };
  }
}

type GltfImportStructureIssue = {
  code: string;
  message: string;
  fieldPath: string;
};

function validateGltfImportStructure(
  json: GltfJson,
): GltfImportStructureIssue[] {
  const issues: GltfImportStructureIssue[] = [];
  if (!isRecord(json.asset) || json.asset.version !== "2.0") {
    issues.push({
      code: "gltf-version-invalid",
      message: "glTF 2.0のasset.versionが必要です",
      fieldPath: "asset.version",
    });
  }

  validateOptionalRecordArray(json.materials, "materials", issues, (entry, path) => {
    if (entry.name !== undefined && typeof entry.name !== "string") {
      issues.push({
        code: "gltf-material-name-invalid",
        message: "Material名は文字列である必要があります",
        fieldPath: `${path}.name`,
      });
    }
  });
  validateOptionalRecordArray(json.meshes, "meshes", issues, (mesh, meshPath) => {
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
      issues.push({
        code: "gltf-mesh-primitives-invalid",
        message: "Meshには1つ以上のprimitiveが必要です",
        fieldPath: `${meshPath}.primitives`,
      });
      return;
    }
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      const primitivePath = `${meshPath}.primitives[${primitiveIndex}]`;
      if (!isRecord(primitive)) {
        issues.push({
          code: "gltf-primitive-invalid",
          message: "Mesh primitiveはobjectである必要があります",
          fieldPath: primitivePath,
        });
        return;
      }
      if (primitive.material === undefined) return;
      if (
        !Number.isInteger(primitive.material) ||
        Number(primitive.material) < 0 ||
        !Array.isArray(json.materials) ||
        Number(primitive.material) >= json.materials.length
      ) {
        issues.push({
          code: "gltf-material-index-invalid",
          message: "Mesh primitiveのMaterial indexが不正です",
          fieldPath: `${primitivePath}.material`,
        });
      }
    });
  });

  validateOptionalRecordArray(json.nodes, "nodes", issues);
  validateOptionalRecordArray(json.animations, "animations", issues, (entry, path) => {
    if (entry.name !== undefined && typeof entry.name !== "string") {
      issues.push({
        code: "gltf-animation-name-invalid",
        message: "Animation名は文字列である必要があります",
        fieldPath: `${path}.name`,
      });
    }
  });
  validateOptionalRecordArray(json.buffers, "buffers", issues);
  validateOptionalRecordArray(json.images, "images", issues);
  validateExtensionNameArray(json.extensionsUsed, "extensionsUsed", issues);
  validateExtensionNameArray(
    json.extensionsRequired,
    "extensionsRequired",
    issues,
  );
  if (
    Array.isArray(json.extensionsUsed) &&
    Array.isArray(json.extensionsRequired)
  ) {
    const used = new Set(json.extensionsUsed);
    json.extensionsRequired.forEach((extension, index) => {
      if (typeof extension === "string" && !used.has(extension)) {
        issues.push({
          code: "gltf-required-extension-missing",
          message: "extensionsRequiredの拡張はextensionsUsedにも必要です",
          fieldPath: `extensionsRequired[${index}]`,
        });
      }
    });
  }
  return issues;
}

function validateOptionalRecordArray(
  value: unknown,
  path: string,
  issues: GltfImportStructureIssue[],
  inspect?: (entry: Record<string, unknown>, path: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({
      code: "gltf-array-invalid",
      message: `${path}は配列である必要があります`,
      fieldPath: path,
    });
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issues.push({
        code: "gltf-entry-invalid",
        message: `${entryPath}はobjectである必要があります`,
        fieldPath: entryPath,
      });
      return;
    }
    inspect?.(entry, entryPath);
  });
}

function validateExtensionNameArray(
  value: unknown,
  path: string,
  issues: GltfImportStructureIssue[],
): void {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    issues.push({
      code: "gltf-extensions-invalid",
      message: `${path}には空でない拡張名だけを指定してください`,
      fieldPath: path,
    });
    return;
  }
  if (new Set(value).size !== value.length) {
    issues.push({
      code: "gltf-extensions-duplicated",
      message: `${path}の拡張名は重複できません`,
      fieldPath: path,
    });
  }
}

function readGlbJsonChunk(bytes: Uint8Array): string {
  if (bytes.byteLength < 20) throw new Error("GLB header is incomplete");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("GLB magic is invalid");
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error("Only glTF 2.0 GLB is supported");
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength || declaredLength < 20) {
    throw new Error("GLB length is invalid");
  }
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || 20 + chunkLength > declaredLength) {
    throw new Error("GLB JSON chunk is missing");
  }
  return new TextDecoder()
    .decode(bytes.subarray(20, 20 + chunkLength))
    .replace(/[\u0000\u0020]+$/g, "");
}

function findExternalGltfReferences(
  json: GltfJson,
): Array<{ fieldPath: string; uri: string }> {
  const references: Array<{ fieldPath: string; uri: string }> = [];
  const visit = (entries: Array<{ uri?: unknown }> | undefined, root: string) => {
    entries?.forEach((entry, index) => {
      if (
        typeof entry.uri === "string" &&
        entry.uri.trim().length > 0 &&
        !entry.uri.trim().toLowerCase().startsWith("data:")
      ) {
        references.push({
          fieldPath: `${root}[${index}].uri`,
          uri: entry.uri,
        });
      }
    });
  };
  visit(json.buffers, "buffers");
  visit(json.images, "images");
  return references;
}

function parseWithGltfLoader(
  bytes: Uint8Array,
  format: "glb" | "gltf" | "vrm",
  isOpenBrush = false,
): Promise<GLTF> {
  const loader = new GLTFLoader();
  if (format === "vrm") {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  }
  const source = isOpenBrush
    ? prepareOpenBrushGltfSource(bytes, format)
    : format === "gltf"
      ? new TextDecoder().decode(bytes)
      : toOwnedArrayBuffer(bytes);
  return new Promise((resolve, reject) => {
    loader.parse(
      source,
      "",
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (vrm) VRMUtils.rotateVRM0(vrm);
        resolve(gltf);
      },
      reject,
    );
  });
}

function createAudioImportPlan(
  input: CreateAssetImportPlanInput,
  fileName: string,
  bytes: Uint8Array,
  sourceHash: string,
  transactionId: string,
  classification: Extract<ClassifiedAssetImport, { kind: "audio" }>,
): AssetImportPlan {
  const diagnostics: AssetImportDiagnostic[] = [];
  if (!hasMp3Signature(bytes)) {
    diagnostics.push({
      severity: "blocking",
      code: "mp3-signature-invalid",
      message: "MP3のファイルシグネチャを確認できませんでした",
      fileName,
      fieldPath: "bytes",
    });
    return blockedPlan(
      transactionId,
      sourceHash,
      diagnostics,
      classification,
    );
  }

  const assetId = createImportedAssetId("audio", fileName, sourceHash);
  const sourceRelativePath = createSourceDestination(
    "audio",
    fileName,
    sourceHash,
    classification.extension,
  );
  const asset: AudioAsset = {
    id: assetId,
    name: normalizedDisplayName(input.displayName, fileName),
    kind: "audio",
    status: "ready",
    source: { kind: "project", relativePath: sourceRelativePath },
    sourceHash,
    thumbnail: { status: "missing" },
    folderId: normalizeFolderId(input.folderId),
    importMetadata: {
      sourceFormat: "mp3",
      mimeType: classification.mimeType,
      byteLength: bytes.byteLength,
    },
  };
  return finishPlan(
    transactionId,
    sourceHash,
    classification,
    asset,
    [
      {
        relativePath: sourceRelativePath,
        purpose: "source",
        mediaType: classification.mimeType,
        sha256: sourceHash,
        payload: { encoding: "bytes", bytes: bytes.slice() },
      },
    ],
    diagnostics,
  );
}

function extractMaterialSlots(json: GltfJson): DiscoveredModelMaterialSlot[] {
  const usedIndices = new Set<number>();
  json.meshes?.forEach((mesh) =>
    mesh.primitives?.forEach((primitive) => {
      if (
        typeof primitive.material === "number" &&
        Number.isInteger(primitive.material) &&
        primitive.material >= 0
      ) {
        usedIndices.add(primitive.material);
      }
    }),
  );
  return [...usedIndices]
    .sort((left, right) => left - right)
    .map((materialIndex) => {
      const declaredName = json.materials?.[materialIndex]?.name;
      return {
        slot: `material-${materialIndex}`,
        name:
          typeof declaredName === "string" && declaredName.trim().length > 0
            ? declaredName.trim()
            : `Material ${materialIndex + 1}`,
        sourceMaterialIndex: materialIndex,
      };
    });
}

function extractModelMetadata(
  gltf: GLTF,
  json: GltfJson,
  sourceFormat: "glb" | "gltf" | "vrm",
  sourceFileName: string,
  byteLength: number,
): ModelImportMetadata {
  gltf.scene.updateWorldMatrix(true, true);
  const vrm = gltf.userData.vrm as VRM | undefined;
  const poseTargets = extractModelPoseTargets(gltf.scene, vrm);
  const nodeCount = json.nodes?.length ?? 0;
  const meshCount = json.meshes?.length ?? 0;
  const primitiveCount =
    json.meshes?.reduce(
      (total, mesh) => total + (mesh.primitives?.length ?? 0),
      0,
    ) ?? 0;
  return {
    sourceFormat,
    sourceFileName,
    byteLength,
    nodeCount,
    meshCount,
    primitiveCount,
    bounds: extractBounds(gltf.scene),
    animations: gltf.animations.map((clip, index) => ({
      name:
        sourceName(json.animations?.[index]?.name) ??
        (clip.name.trim() || `Animation ${index + 1}`),
      duration: metadataNumber(clip.duration),
      trackCount: clip.tracks.length,
      sourceAnimationIndex: index,
    })),
    bones: poseTargets.bones,
    morphTargets: poseTargets.morphTargets,
    ...(vrm?.meta.metaVersion === "0" || vrm?.meta.metaVersion === "1"
      ? { vrmVersion: vrm.meta.metaVersion }
      : {}),
    extensionsUsed: stringArray(json.extensionsUsed),
    extensionsRequired: stringArray(json.extensionsRequired),
  };
}

function extractObjectModelMetadata(
  object: Object3D,
  sourceFormat: "obj",
  sourceFileName: string,
  byteLength: number,
): ModelImportMetadata {
  let nodeCount = 0;
  let meshCount = 0;
  let primitiveCount = 0;
  object.traverse((child) => {
    nodeCount += 1;
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh) return;
    meshCount += 1;
    primitiveCount += Array.isArray(mesh.material) ? mesh.material.length : 1;
  });
  const poseTargets = extractModelPoseTargets(object);
  return {
    sourceFormat,
    sourceFileName,
    byteLength,
    nodeCount,
    meshCount,
    primitiveCount,
    bounds: extractBounds(object),
    animations: [],
    bones: poseTargets.bones,
    morphTargets: poseTargets.morphTargets,
    extensionsUsed: [],
    extensionsRequired: [],
  };
}

function extractModelPoseTargets(
  object: Object3D,
  vrm?: VRM,
): {
  bones: ModelBoneMetadata[];
  morphTargets: ModelMorphTargetMetadata[];
} {
  const humanoidByNode = new Map<Object3D, string>();
  Object.entries(vrm?.humanoid?.humanBones ?? {}).forEach(([name, bone]) => {
    if (bone?.node) humanoidByNode.set(bone.node, name);
  });
  const boneNames = new Set<string>();
  const morphNames = new Set<string>();
  const bones: ModelBoneMetadata[] = [];
  object.traverse((child) => {
    const bone = child as Object3D & { isBone?: boolean };
    const name = child.name.trim();
    if (bone.isBone && name && !boneNames.has(name)) {
      boneNames.add(name);
      const humanoidName = humanoidByNode.get(child);
      bones.push({
        key: name,
        name,
        ...(humanoidName ? { humanoidName } : {}),
      });
    }
    const mesh = child as Object3D & {
      morphTargetDictionary?: Record<string, number>;
    };
    Object.keys(mesh.morphTargetDictionary ?? {}).forEach((targetName) => {
      const normalized = targetName.trim();
      if (!normalized || morphNames.has(normalized)) return;
      morphNames.add(normalized);
    });
  });
  return {
    bones: bones.sort((left, right) =>
      (left.humanoidName ?? left.name).localeCompare(
        right.humanoidName ?? right.name,
      ),
    ),
    morphTargets: [...morphNames]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ key: name, name })),
  };
}

function tagObjSourceMaterialIndices(
  object: Object3D,
): DiscoveredModelMaterialSlot[] {
  const sourceIndexByMaterial = new Map<Material, number>();
  const discovered: DiscoveredModelMaterialSlot[] = [];
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => {
      let sourceMaterialIndex = sourceIndexByMaterial.get(material);
      if (sourceMaterialIndex === undefined) {
        sourceMaterialIndex = sourceIndexByMaterial.size;
        sourceIndexByMaterial.set(material, sourceMaterialIndex);
        discovered.push({
          name: material.name.trim() || `Material ${sourceMaterialIndex + 1}`,
          sourceMaterialIndex,
        });
      }
      material.userData.xriftSourceMaterialIndex = sourceMaterialIndex;
    });
  });
  return discovered;
}

function extractBounds(object: Object3D): ModelBoundsMetadata {
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: [0, 0, 0],
      boundingSphereRadius: 0,
    };
  }
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  return {
    min: vectorTuple(bounds.min),
    max: vectorTuple(bounds.max),
    center: vectorTuple(center),
    size: vectorTuple(size),
    boundingSphereRadius: metadataNumber(size.length() / 2),
  };
}

async function renderTextureThumbnail(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ThumbnailResult> {
  if (typeof globalThis.createImageBitmap !== "function") {
    throw new Error("createImageBitmap is unavailable");
  }
  const bitmap = await globalThis.createImageBitmap(
    new Blob([toOwnedArrayBuffer(bytes)], { type: mimeType }),
  );
  try {
    const maxSize = 256;
    const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = createThumbnailCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context || !("drawImage" in context)) {
      throw new Error("2D canvas is unavailable");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const encoded = await encodeThumbnail(canvas);
    return {
      ...encoded,
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

async function renderModelThumbnail(object: Object3D): Promise<ThumbnailResult> {
  const canvas = createThumbnailCanvas(320, 240);
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  const preview = new Scene();
  const originalParent = object.parent;
  preview.background = new Color("#f8fafc");
  preview.add(object);
  preview.add(new AmbientLight("#ffffff", 1.8));
  const key = new DirectionalLight("#ffffff", 3.2);
  key.position.set(4, 6, 5);
  preview.add(key);
  const fill = new DirectionalLight("#dbeafe", 1.2);
  fill.position.set(-4, 2, -3);
  preview.add(fill);

  try {
    renderer.setSize(320, 240, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    object.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) throw new Error("Model has no renderable bounds");
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    const camera = new PerspectiveCamera(35, 320 / 240, 0.001, radius * 100);
    const distance = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.25;
    const viewDirection = new Vector3(1, 0.72, 1).normalize();
    camera.position.copy(center).addScaledVector(viewDirection, distance);
    camera.near = Math.max(distance / 100, 0.001);
    camera.far = Math.max(distance * 10, radius * 20);
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    renderer.render(preview, camera);
    const encoded = await encodeThumbnail(canvas);
    return { ...encoded, width: 320, height: 240 };
  } finally {
    preview.remove(object);
    if (originalParent) originalParent.add(object);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

type ThumbnailCanvas = HTMLCanvasElement | OffscreenCanvas;

function createThumbnailCanvas(width: number, height: number): ThumbnailCanvas {
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("Canvas is unavailable");
}

async function encodeThumbnail(
  canvas: ThumbnailCanvas,
): Promise<Pick<ThumbnailResult, "dataUrl" | "mediaType" | "extension">> {
  if ("convertToBlob" in canvas) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
    const mediaType = blob.type === "image/webp" ? "image/webp" : "image/png";
    return {
      dataUrl: await blobToDataUrl(blob),
      mediaType,
      extension: mediaType === "image/webp" ? "webp" : "png",
    };
  }
  const requested = canvas.toDataURL("image/webp", 0.86);
  const isWebp = requested.startsWith("data:image/webp;");
  return {
    dataUrl: requested,
    mediaType: isWebp ? "image/webp" : "image/png",
    extension: isWebp ? "webp" : "png",
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Thumbnail encoding returned no data")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Thumbnail encoding failed")),
    );
    reader.readAsDataURL(blob);
  });
}

function readKtx2Dimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  const signature = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 28 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(20, true);
  const height = view.getUint32(24, true);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function hasTextureSignature(
  bytes: Uint8Array,
  format: "png" | "jpeg" | "webp" | "ktx2",
): boolean {
  if (format === "png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (format === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (format === "webp") {
    return (
      asciiAt(bytes, 0, "RIFF") &&
      asciiAt(bytes, 8, "WEBP")
    );
  }
  const signature = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((value, index) => bytes[index] === value);
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return true;
  }
  const scanLength = Math.min(bytes.byteLength - 2, 4096);
  for (let index = 0; index < scanLength; index += 1) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    if (first !== 0xff || (second & 0xe0) !== 0xe0) continue;
    const layer = (second >> 1) & 0x03;
    const bitrateIndex = (third >> 4) & 0x0f;
    const sampleRateIndex = (third >> 2) & 0x03;
    if (
      layer !== 0 &&
      bitrateIndex !== 0 &&
      bitrateIndex !== 0x0f &&
      sampleRateIndex !== 0x03
    ) {
      return true;
    }
  }
  return false;
}

function asciiAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

type ModelFolderPlan = {
  modelFolderId: string | null;
  materialFolderId: string;
  textureFolderId: string;
  folders: AssetFolder[];
};

function findMatchingModelImport(
  manifest: AssetManifest | undefined,
  fileName: string,
  requestedParentId: string | null,
): ModelAsset | undefined {
  if (!manifest) return undefined;
  const sourceKey = fileName.trim().toLocaleLowerCase();
  return Object.values(manifest.assets)
    .filter((asset): asset is ModelAsset => asset.kind === "model")
    .filter((asset) => {
      const sourceFileName =
        asset.importMetadata?.sourceFileName ??
        (asset.source.kind === "project"
          ? leafFileName(asset.source.relativePath)
          : "");
      if (sourceFileName.toLocaleLowerCase() !== sourceKey) return false;
      const currentFolder = asset.folderId
        ? manifest.folders?.[asset.folderId]
        : undefined;
      const logicalParent =
        currentFolder &&
        currentFolder.name.toLocaleLowerCase() === asset.name.toLocaleLowerCase()
          ? currentFolder.parentId
          : asset.folderId ?? null;
      return (
        logicalParent === requestedParentId ||
        (asset.folderId ?? null) === requestedParentId
      );
    })
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) -
          (right.order ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    )[0];
}

function createModelFolderPlan(
  manifest: AssetManifest | undefined,
  modelAssetId: string,
  modelName: string,
  requestedParentId: string | null,
  existingModel?: ModelAsset,
): ModelFolderPlan {
  const knownFolders: Record<string, AssetFolder> = {
    ...(manifest?.folders ?? {}),
  };
  const created: AssetFolder[] = [];
  let modelFolderId = existingModel?.folderId ?? null;

  if (!existingModel) {
    const modelFolder = ensureImportFolder(
      knownFolders,
      created,
      `folder-${safeSegment(modelAssetId)}`,
      modelName,
      requestedParentId,
    );
    modelFolderId = modelFolder.id;
  }

  const childParentId = modelFolderId;
  const materialFolder = ensureImportFolder(
    knownFolders,
    created,
    `folder-${safeSegment(modelAssetId)}-materials`,
    childParentId ? "Materials" : `${modelName} Materials`,
    childParentId,
  );
  const textureFolder = ensureImportFolder(
    knownFolders,
    created,
    `folder-${safeSegment(modelAssetId)}-textures`,
    childParentId ? "Textures" : `${modelName} Textures`,
    childParentId,
  );
  return {
    modelFolderId,
    materialFolderId: materialFolder.id,
    textureFolderId: textureFolder.id,
    folders: created,
  };
}

function ensureImportFolder(
  knownFolders: Record<string, AssetFolder>,
  created: AssetFolder[],
  preferredId: string,
  name: string,
  parentId: string | null,
): AssetFolder {
  const matching = Object.values(knownFolders).find(
    (folder) =>
      folder.parentId === parentId &&
      folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (matching) return matching;

  let id = preferredId;
  let suffix = 2;
  while (knownFolders[id]) {
    id = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  const folder: AssetFolder = {
    id,
    name,
    parentId,
    order:
      Math.max(
        -1,
        ...Object.values(knownFolders)
          .filter((candidate) => candidate.parentId === parentId)
          .map((candidate) => candidate.order),
      ) + 1,
  };
  knownFolders[id] = folder;
  created.push(folder);
  return folder;
}

function createSourceDestination(
  category: "models" | "textures" | "audio",
  fileName: string,
  sourceHash: string,
  extension: string,
): string {
  const stem = safeSegment(removeExtension(fileName));
  const destination = `assets/imported/${category}/${sourceHash.slice(0, 16)}/${stem}.${extension}`;
  if (!isSafeAssetImportDestination(destination)) {
    throw new Error("Unable to create a safe asset destination");
  }
  return destination;
}

function createImportedAssetId(
  kind: "model" | "texture" | "audio",
  fileName: string,
  sourceHash: string,
): string {
  return `${kind}-${safeSegment(removeExtension(fileName))}-${sourceHash.slice(0, 12)}`;
}

function normalizedDisplayName(value: string | undefined, fileName: string): string {
  const normalized = value?.trim();
  return normalized || removeExtension(fileName) || "Imported Asset";
}

function normalizeFolderId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function blockedPlan(
  transactionId: string,
  sourceHash: string,
  diagnostics: AssetImportDiagnostic[],
  classification?: ClassifiedAssetImport,
  replacesAssetId?: string,
): AssetImportPlan {
  return {
    transactionId,
    sourceHash,
    ...(replacesAssetId ? { replacesAssetId } : {}),
    classification,
    writes: [],
    diagnostics,
    canCommit: false,
  };
}

function finishPlan(
  transactionId: string,
  sourceHash: string,
  classification: ClassifiedAssetImport,
  asset: ModelAsset | TextureAsset | AudioAsset,
  writes: AssetImportWrite[],
  diagnostics: AssetImportDiagnostic[],
  replacesAssetId?: string,
  derivedAssets?: Array<MaterialAsset | TextureAsset>,
  folders?: AssetFolder[],
): AssetImportPlan {
  const canCommit = !diagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  return {
    transactionId,
    sourceHash,
    ...(replacesAssetId ? { replacesAssetId } : {}),
    classification,
    asset,
    ...(derivedAssets && derivedAssets.length > 0 ? { derivedAssets } : {}),
    ...(folders && folders.length > 0 ? { folders } : {}),
    writes,
    diagnostics,
    canCommit,
  };
}

function cloneBytes(input: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const source =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function toOwnedArrayBuffer(input: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function leafFileName(value: string): string {
  const leaf = value.trim().replace(/\\/g, "/").split("/").pop()?.trim();
  return leaf || "asset";
}

function extensionOf(value: string): string {
  const leaf = leafFileName(value);
  const index = leaf.lastIndexOf(".");
  return index > 0 && index < leaf.length - 1
    ? leaf.slice(index + 1).toLowerCase()
    : "";
}

function removeExtension(value: string): string {
  const leaf = leafFileName(value);
  const index = leaf.lastIndexOf(".");
  return index > 0 ? leaf.slice(0, index) : leaf;
}

function safeSegment(value: string): string {
  return (
    value
      .normalize("NFKC")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || "asset"
  );
}

function vectorTuple(value: Vector3): [number, number, number] {
  return [
    metadataNumber(value.x),
    metadataNumber(value.y),
    metadataNumber(value.z),
  ];
}

function metadataNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : value;
}

function sourceName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "unknown error";
}
