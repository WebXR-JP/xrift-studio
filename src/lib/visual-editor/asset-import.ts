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
  type Object3D,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  normalizeProjectRelativePath,
  normalizeTextureImportSettings,
  type AssetManifest,
  type MaterialSlotDefinition,
  type ModelAsset,
  type ModelBoundsMetadata,
  type ModelImportMetadata,
  type TextureAsset,
  type TextureImportSettingsPatch,
} from "./asset-manifest";

export const ASSET_IMPORT_THUMBNAIL_RENDERER_VERSION = "three-white-v1";
export const ASSET_IMPORT_MAX_BYTES = 128 * 1024 * 1024;

export type SupportedAssetImportFormat =
  | "glb"
  | "gltf"
  | "png"
  | "jpeg"
  | "webp"
  | "ktx2";

export type ClassifiedAssetImport =
  | {
      kind: "model";
      format: "glb" | "gltf";
      mimeType: "model/gltf-binary" | "model/gltf+json";
      extension: "glb" | "gltf";
    }
  | {
      kind: "texture";
      format: "png" | "jpeg" | "webp" | "ktx2";
      mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/ktx2";
      extension: "png" | "jpg" | "jpeg" | "webp" | "ktx2";
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
  classification?: ClassifiedAssetImport;
  asset?: ModelAsset | TextureAsset;
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
};

export type AtomicAssetImportCommitRequest = {
  transactionId: string;
  /** The shell must publish all writes, or none of them. */
  writes: readonly AssetImportWrite[];
};

export type AtomicAssetImportCommit = (
  request: AtomicAssetImportCommitRequest,
) => Promise<void>;

type GltfJson = {
  materials?: Array<{ name?: unknown }>;
  meshes?: Array<{ primitives?: Array<{ material?: unknown }> }>;
  buffers?: Array<{ uri?: unknown }>;
  images?: Array<{ uri?: unknown }>;
  extensionsUsed?: unknown;
  extensionsRequired?: unknown;
};

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
  return undefined;
}

/**
 * Builds a self-contained plan. It never writes files and GLTFLoader is not
 * invoked until external URI references have been rejected.
 */
export async function createAssetImportPlan(
  input: CreateAssetImportPlanInput,
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
    return blockedPlan("asset-import-unhashed", "", diagnostics);
  }
  const transactionId = `asset-import-${sourceHash.slice(0, 20)}`;
  const diagnostics: AssetImportDiagnostic[] = [];
  const classification = classifyAssetImport(fileName, input.mimeType);

  if (!classification) {
    diagnostics.push({
      severity: "blocking",
      code: "unsupported-asset-format",
      message: "GLB、glTF、PNG、JPG、WebP、KTX2 のみ取り込めます",
      fileName,
      fieldPath: "fileName",
    });
    return blockedPlan(transactionId, sourceHash, diagnostics);
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
    );
  }

  return classification.kind === "model"
    ? createModelImportPlan(
        input,
        fileName,
        bytes,
        sourceHash,
        transactionId,
        classification,
      )
    : createTextureImportPlan(
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
  if (existing) {
    if (existing.sourceHash === plan.sourceHash && existing.kind === plan.asset.kind) {
      return manifest;
    }
    throw new Error(`Asset ID collision: ${plan.asset.id}`);
  }
  const folderId = plan.asset.folderId ?? null;
  if (folderId !== null && !manifest.folders?.[folderId]) {
    throw new Error(`Asset folder does not exist: ${folderId}`);
  }
  if (
    plan.writes.some(
      (write) => !isSafeAssetImportDestination(write.relativePath),
    )
  ) {
    throw new Error("Asset import plan contains an unsafe destination");
  }

  await commit({ transactionId: plan.transactionId, writes: plan.writes });

  const order =
    Math.max(
      -1,
      ...Object.values(manifest.assets)
        .filter((asset) => (asset.folderId ?? null) === folderId)
        .map((asset) => asset.order ?? -1),
    ) + 1;
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [plan.asset.id]: { ...plan.asset, order },
    },
  };
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
): Promise<AssetImportPlan> {
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
    );
  }

  const externalReferences = findExternalGltfReferences(parsedJson.json);
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
    );
  }

  let gltf: GLTF;
  try {
    gltf = await parseWithGltfLoader(bytes, classification.format);
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
    );
  }

  const assetId = createImportedAssetId("model", fileName, sourceHash);
  const sourceRelativePath = createSourceDestination(
    "models",
    fileName,
    sourceHash,
    classification.extension,
  );
  const materialSlots = extractMaterialSlots(parsedJson.json);
  const importMetadata = extractModelMetadata(
    gltf,
    parsedJson.json,
    classification.format,
    bytes.byteLength,
  );
  let thumbnail: ModelAsset["thumbnail"] = { status: "missing" };
  const writes: AssetImportWrite[] = [
    {
      relativePath: sourceRelativePath,
      purpose: "source",
      mediaType: classification.mimeType,
      sha256: sourceHash,
      payload: { encoding: "bytes", bytes: bytes.slice() },
    },
  ];

  try {
    const rendered = await renderModelThumbnail(gltf.scene);
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
      code: "model-thumbnail-failed",
      message: `モデルのサムネイルを生成できませんでした: ${errorMessage(error)}`,
      fileName,
      assetId,
      fieldPath: "thumbnail",
    });
  }

  const asset: ModelAsset = {
    id: assetId,
    name: normalizedDisplayName(input.displayName, fileName),
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: sourceRelativePath },
    sourceHash,
    thumbnail,
    folderId: normalizeFolderId(input.folderId),
    importSettings: {
      scale: 1,
      generateColliders: true,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots,
    importMetadata,
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
  format: SupportedAssetImportFormat,
):
  | { ok: true; json: GltfJson }
  | { ok: false; code: string; message: string; fieldPath?: string } {
  if (format !== "glb" && format !== "gltf") {
    return {
      ok: false,
      code: "gltf-format-mismatch",
      message: "モデル形式ではありません",
    };
  }
  try {
    const jsonText =
      format === "glb" ? readGlbJsonChunk(bytes) : new TextDecoder().decode(bytes);
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
      code: format === "glb" ? "glb-invalid" : "gltf-json-invalid",
      message: errorMessage(error),
    };
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
  format: "glb" | "gltf",
): Promise<GLTF> {
  const loader = new GLTFLoader();
  const source =
    format === "glb"
      ? toOwnedArrayBuffer(bytes)
      : new TextDecoder().decode(bytes);
  return new Promise((resolve, reject) => {
    loader.parse(source, "", resolve, reject);
  });
}

function extractMaterialSlots(json: GltfJson): MaterialSlotDefinition[] {
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
  sourceFormat: "glb" | "gltf",
  byteLength: number,
): ModelImportMetadata {
  let nodeCount = 0;
  let meshCount = 0;
  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((object) => {
    nodeCount += 1;
    if ((object as { isMesh?: boolean }).isMesh) meshCount += 1;
  });
  const primitiveCount =
    json.meshes?.reduce(
      (total, mesh) => total + (mesh.primitives?.length ?? 0),
      0,
    ) ?? meshCount;
  return {
    sourceFormat,
    byteLength,
    nodeCount,
    meshCount,
    primitiveCount,
    bounds: extractBounds(gltf.scene),
    animations: gltf.animations.map((clip, index) => ({
      name: clip.name.trim() || `Animation ${index + 1}`,
      duration: finiteNumber(clip.duration),
      trackCount: clip.tracks.length,
    })),
    extensionsUsed: stringArray(json.extensionsUsed),
    extensionsRequired: stringArray(json.extensionsRequired),
  };
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
    boundingSphereRadius: finiteNumber(size.length() / 2),
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

function asciiAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function createSourceDestination(
  category: "models" | "textures",
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
  kind: "model" | "texture",
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
): AssetImportPlan {
  return {
    transactionId,
    sourceHash,
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
  asset: ModelAsset | TextureAsset,
  writes: AssetImportWrite[],
  diagnostics: AssetImportDiagnostic[],
): AssetImportPlan {
  const canCommit = !diagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  return {
    transactionId,
    sourceHash,
    classification,
    asset,
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
  return [finiteNumber(value.x), finiteNumber(value.y), finiteNumber(value.z)];
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
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
