import type { PrototypeVisualProject } from "./prototype-project";
import type {
  MaterialAsset,
  ModelAsset,
  SceneAsset,
  TextureAsset,
} from "./asset-manifest";
import type { RegisteredSceneComponent } from "./scene-document";
import { resolvePrefabInstances } from "./compiler/prefab-resolver";

const MIB = 1024 * 1024;
const RUNTIME_LOW_BYTES = 32 * MIB;
const RUNTIME_HIGH_BYTES = 96 * MIB;

export type VramDeviceRating = "comfortable" | "watch" | "high";

export type VramContribution = {
  assetId: string;
  name: string;
  kind: "texture" | "model";
  estimatedBytes: number;
  referenceCount: number;
  detail: string;
};

export type VramRecommendation = {
  id: string;
  severity: "recommended" | "consider";
  title: string;
  detail: string;
  assetId?: string;
  estimatedSavingBytes?: number;
};

export type WorldVramEstimate = {
  assetBytes: number;
  runtimeLowBytes: number;
  runtimeHighBytes: number;
  smartphoneRating: VramDeviceRating;
  desktopRating: VramDeviceRating;
  contributions: VramContribution[];
  recommendations: VramRecommendation[];
  textureCount: number;
  modelCount: number;
  meshPlacementCount: number;
  unknownDimensionTextureCount: number;
};

export function estimateWorldVram(
  bundle: PrototypeVisualProject,
): WorldVramEstimate {
  const resolvedScene = resolvePrefabInstances(
    bundle.scene,
    bundle.assets,
    bundle.prefabs,
  ).scene;
  const references = new Map<string, number>();
  const meshPlacements = new Map<string, number>();

  const addReference = (assetId: string | undefined, count = 1) => {
    if (!assetId) return;
    references.set(assetId, (references.get(assetId) ?? 0) + count);
  };

  for (const entity of Object.values(resolvedScene.entities)) {
    if (!entity.enabled) continue;
    for (const component of entity.components) {
      if (!component.enabled) continue;
      collectComponentReferences(component, addReference, meshPlacements);
    }
  }
  addReference(resolvedScene.settings?.skybox.imageAssetId);

  // Materials and particles can introduce textures that are not referenced
  // directly by an Entity.
  const queue = [...references.keys()];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const assetId = queue.shift();
    if (!assetId || visited.has(assetId)) continue;
    visited.add(assetId);
    const asset = bundle.assets.assets[assetId];
    if (!asset) continue;
    for (const dependencyId of collectAssetDependencies(asset)) {
      addReference(dependencyId);
      queue.push(dependencyId);
    }
  }

  const contributions: VramContribution[] = [];
  const recommendations: VramRecommendation[] = [];
  let textureCount = 0;
  let modelCount = 0;
  let unknownDimensionTextureCount = 0;

  for (const assetId of visited) {
    const asset = bundle.assets.assets[assetId];
    if (!asset) continue;
    const referenceCount = references.get(assetId) ?? 1;
    if (asset.kind === "texture") {
      textureCount += 1;
      const estimate = estimateTextureBytes(asset);
      if (!estimate.hasKnownDimensions) unknownDimensionTextureCount += 1;
      contributions.push({
        assetId,
        name: asset.name,
        kind: "texture",
        estimatedBytes: estimate.bytes,
        referenceCount,
        detail: estimate.detail,
      });
      recommendations.push(...textureRecommendations(asset, estimate.bytes));
    } else if (asset.kind === "model") {
      modelCount += 1;
      const estimate = estimateModelBytes(asset);
      contributions.push({
        assetId,
        name: asset.name,
        kind: "model",
        estimatedBytes: estimate.bytes,
        referenceCount,
        detail: estimate.detail,
      });
      recommendations.push(
        ...modelRecommendations(
          asset,
          meshPlacements.get(assetId) ?? referenceCount,
        ),
      );
    }
  }

  contributions.sort((left, right) => right.estimatedBytes - left.estimatedBytes);
  recommendations.sort(
    (left, right) =>
      (right.estimatedSavingBytes ?? 0) - (left.estimatedSavingBytes ?? 0),
  );
  const assetBytes = contributions.reduce(
    (total, contribution) => total + contribution.estimatedBytes,
    0,
  );
  const runtimeLowBytes = assetBytes + RUNTIME_LOW_BYTES;
  const runtimeHighBytes = assetBytes + RUNTIME_HIGH_BYTES;

  return {
    assetBytes,
    runtimeLowBytes,
    runtimeHighBytes,
    smartphoneRating: rateBytes(runtimeHighBytes, 256 * MIB, 384 * MIB),
    desktopRating: rateBytes(runtimeHighBytes, 768 * MIB, 1536 * MIB),
    contributions,
    recommendations,
    textureCount,
    modelCount,
    meshPlacementCount: [...meshPlacements.values()].reduce(
      (total, count) => total + count,
      0,
    ),
    unknownDimensionTextureCount,
  };
}

function collectComponentReferences(
  component: RegisteredSceneComponent,
  addReference: (assetId: string | undefined, count?: number) => void,
  meshPlacements: Map<string, number>,
): void {
  if (component.type === "mesh") {
    const geometryId =
      component.geometry?.kind === "asset"
        ? component.geometry.assetId
        : component.geometryAssetId;
    addReference(geometryId);
    if (geometryId) {
      meshPlacements.set(geometryId, (meshPlacements.get(geometryId) ?? 0) + 1);
    }
    for (const binding of component.materialBindings) {
      addReference(binding.materialAssetId);
    }
  } else if (component.type === "particle-emitter") {
    addReference(component.particleAssetId);
  } else if (component.type === "audio-source") {
    addReference(component.audioAssetId);
  } else if (component.type === "xrift-component") {
    for (const assetId of component.assetReferences) addReference(assetId);
  }
}

function collectAssetDependencies(asset: SceneAsset): string[] {
  if (asset.kind === "material") return collectTextureIds(asset);
  if (asset.kind === "particle") {
    return [
      asset.properties.renderer.materialAssetId,
      asset.properties.renderer.textureAssetId,
    ].filter((value): value is string => Boolean(value));
  }
  if (asset.kind === "model") {
    return asset.materialSlots
      .map((slot) => slot.defaultMaterialAssetId)
      .filter((value): value is string => Boolean(value));
  }
  if (asset.kind === "primitive") {
    return asset.materialSlots
      .map((slot) => slot.defaultMaterialAssetId)
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

function collectTextureIds(material: MaterialAsset): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "textureAssetId" && typeof child === "string") ids.add(child);
      else walk(child);
    }
  };
  walk(material.properties);
  return [...ids];
}

type TextureByteEstimate = {
  bytes: number;
  hasKnownDimensions: boolean;
  detail: string;
};

function estimateTextureBytes(asset: TextureAsset): TextureByteEstimate {
  const metadata = asset.importMetadata;
  const sourceWidth = metadata?.width;
  const sourceHeight = metadata?.height;
  const maxSize =
    asset.importSettings.resize.mode === "max-size"
      ? asset.importSettings.resize.maxSize
      : undefined;
  const dimensions =
    sourceWidth && sourceHeight
      ? fitWithin(sourceWidth, sourceHeight, maxSize)
      : null;
  const compressed =
    asset.importSettings.compression.format === "ktx2" ||
    metadata?.sourceFormat === "ktx2";
  const bytesPerPixel =
    metadata?.sourceFormat === "hdr" || metadata?.sourceFormat === "exr"
      ? 8
      : compressed
        ? 1
        : 4;
  const mipFactor = asset.importSettings.generateMipmaps ? 4 / 3 : 1;
  const bytes = dimensions
    ? dimensions.width * dimensions.height * bytesPerPixel * mipFactor
    : Math.max((metadata?.byteLength ?? 256 * 1024) * (compressed ? 2 : 4), 256 * 1024);
  const sizeLabel = dimensions
    ? `${dimensions.width} × ${dimensions.height}`
    : "解像度不明";
  const formatLabel = compressed
    ? "KTX2 GPU圧縮を約1 byte/pxで計算"
    : bytesPerPixel === 8
      ? "HDRを約8 bytes/pxで計算"
      : "RGBA展開を4 bytes/pxで計算";
  return {
    bytes: Math.round(bytes),
    hasKnownDimensions: Boolean(dimensions),
    detail: `${sizeLabel} / ${formatLabel}${asset.importSettings.generateMipmaps ? " / mipmap込み" : ""}`,
  };
}

function textureRecommendations(
  asset: TextureAsset,
  currentBytes: number,
): VramRecommendation[] {
  const recommendations: VramRecommendation[] = [];
  const width = asset.importMetadata?.width;
  const height = asset.importMetadata?.height;
  const maxDimension = Math.max(width ?? 0, height ?? 0);
  if (maxDimension > 2048) {
    const resized = fitWithin(width ?? maxDimension, height ?? maxDimension, 2048);
    const mipFactor = asset.importSettings.generateMipmaps ? 4 / 3 : 1;
    const resizedBytes = resized.width * resized.height * 4 * mipFactor;
    recommendations.push({
      id: `resize:${asset.id}`,
      severity: maxDimension > 4096 ? "recommended" : "consider",
      title: `${asset.name}を最大2048pxへ縮小`,
      detail: `${width} × ${height}です。スマートフォン向けでは、見た目を確認しながら最大サイズを下げられます。`,
      assetId: asset.id,
      estimatedSavingBytes: Math.max(0, currentBytes - resizedBytes),
    });
  }
  const isKtx2 =
    asset.importSettings.compression.format === "ktx2" ||
    asset.importMetadata?.sourceFormat === "ktx2";
  if (!isKtx2 && width && height) {
    const dimensions = fitWithin(
      width,
      height,
      asset.importSettings.resize.mode === "max-size"
        ? asset.importSettings.resize.maxSize
        : undefined,
    );
    const ktx2Bytes =
      dimensions.width *
      dimensions.height *
      (asset.importSettings.generateMipmaps ? 4 / 3 : 1);
    recommendations.push({
      id: `ktx2:${asset.id}`,
      severity: currentBytes >= 16 * MIB ? "recommended" : "consider",
      title: `${asset.name}をKTX2へ変換`,
      detail:
        "PNG・JPEG・WebPもGPU上では通常RGBAへ展開されます。KTX2は対応GPU形式の目安で、端末により結果が変わります。",
      assetId: asset.id,
      estimatedSavingBytes: Math.max(0, currentBytes - ktx2Bytes),
    });
  }
  return recommendations;
}

function estimateModelBytes(asset: ModelAsset): {
  bytes: number;
  detail: string;
} {
  const metadata = asset.importMetadata;
  if (!metadata) {
    return {
      bytes: 512 * 1024,
      detail: "頂点情報不明 / 0.5 MBの仮値",
    };
  }
  const usesDraco =
    metadata.extensionsUsed.includes("KHR_draco_mesh_compression") ||
    metadata.extensionsRequired.includes("KHR_draco_mesh_compression");
  const expansionFactor = usesDraco ? 6 : 1.5;
  const bytes = Math.max(
    metadata.byteLength * expansionFactor,
    metadata.primitiveCount * 64 * 1024,
  );
  return {
    bytes: Math.round(bytes),
    detail: `${metadata.meshCount}メッシュ / ${metadata.primitiveCount}プリミティブ / ${
      usesDraco ? "Draco展開後をソースの約6倍" : "GPUバッファをソースの約1.5倍"
    }で計算`,
  };
}

function modelRecommendations(
  asset: ModelAsset,
  placementCount: number,
): VramRecommendation[] {
  const recommendations: VramRecommendation[] = [];
  const metadata = asset.importMetadata;
  const usesDraco =
    metadata?.extensionsUsed.includes("KHR_draco_mesh_compression") ||
    metadata?.extensionsRequired.includes("KHR_draco_mesh_compression");
  if (metadata && metadata.byteLength >= 1024 * 1024 && !usesDraco) {
    recommendations.push({
      id: `draco:${asset.id}`,
      severity: metadata.byteLength >= 8 * MIB ? "recommended" : "consider",
      title: `${asset.name}にDraco圧縮を検討`,
      detail:
        "Dracoは配信サイズを減らしますが、描画時は頂点へ展開されるためVRAM自体は大きく減りません。",
      assetId: asset.id,
    });
  }
  if (placementCount >= 5) {
    recommendations.push({
      id: `instances:${asset.id}`,
      severity: placementCount >= 20 ? "recommended" : "consider",
      title: `${asset.name}の${placementCount}配置をインスタンス化`,
      detail:
        "同じメッシュの大量配置です。インスタンス描画にまとめると、主にドローコールとCPU負荷を減らせます。",
      assetId: asset.id,
    });
  }
  return recommendations;
}

function fitWithin(
  width: number,
  height: number,
  maxSize?: number,
): { width: number; height: number } {
  if (!maxSize || Math.max(width, height) <= maxSize) {
    return { width, height };
  }
  const scale = maxSize / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function rateBytes(
  bytes: number,
  comfortableLimit: number,
  watchLimit: number,
): VramDeviceRating {
  if (bytes <= comfortableLimit) return "comfortable";
  if (bytes <= watchLimit) return "watch";
  return "high";
}

export function formatVramBytes(bytes: number): string {
  if (bytes < MIB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.round(bytes / MIB)} MB`;
}
