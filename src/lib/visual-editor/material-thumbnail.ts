import type {
  AssetManifest,
  MaterialAsset,
  SceneAsset,
} from "./asset-manifest";
import { stableSerializeJson } from "./serialization";

export const MATERIAL_THUMBNAIL_RENDERER_VERSION =
  "xrift-studio-material-thumbnail@1";

/**
 * Builds a content fingerprint for the visible Material preview. The Material
 * itself is not enough: a Texture replacement or an OpenBrush source Model
 * update must also invalidate the generated image.
 */
export async function createMaterialThumbnailSourceHash(
  material: MaterialAsset,
  manifest: AssetManifest,
): Promise<string> {
  const referencedAssetIds = collectReferencedAssetIds(material, manifest);
  const dependencies = [...referencedAssetIds]
    .sort()
    .map((assetId) => thumbnailDependency(manifest.assets[assetId]))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const source = stableSerializeJson({
    rendererVersion: MATERIAL_THUMBNAIL_RENDERER_VERSION,
    material: {
      id: material.id,
      properties: material.properties,
      shader: material.shader,
      importedFromModel: material.importedFromModel,
    },
    dependencies,
  });
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function materialThumbnailNeedsRefresh(
  material: MaterialAsset,
  sourceHash: string,
): boolean {
  return (
    !material.thumbnail ||
    material.thumbnail.status !== "generated" ||
    material.thumbnail.sourceHash !== sourceHash ||
    material.thumbnail.rendererVersion !== MATERIAL_THUMBNAIL_RENDERER_VERSION
  );
}

export function materialThumbnailDerivedPath(
  materialId: string,
  sourceHash: string,
  extension: "png" | "webp",
): string {
  const safeId =
    materialId
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "material";
  return `assets/.derived/thumbnails/${safeId}-${sourceHash.slice(0, 20)}.${extension}`;
}

function collectReferencedAssetIds(
  material: MaterialAsset,
  manifest: AssetManifest,
): Set<string> {
  const stringValues = new Set<string>();
  collectStringValues(material.properties, stringValues);
  collectStringValues(material.shader, stringValues);

  const result = new Set<string>();
  for (const value of stringValues) {
    if (manifest.assets[value]) result.add(value);
  }
  const modelAssetId = material.importedFromModel?.modelAssetId;
  if (modelAssetId && manifest.assets[modelAssetId]) result.add(modelAssetId);
  return result;
}

function collectStringValues(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringValues(entry, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.values(value).forEach((entry) => collectStringValues(entry, output));
}

function thumbnailDependency(asset: SceneAsset | undefined): unknown {
  if (!asset) return undefined;
  if (asset.kind === "texture") {
    return {
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      source: asset.source,
      sourceHash: asset.sourceHash,
      importSettings: asset.importSettings,
    };
  }
  if (asset.kind === "model") {
    return {
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      source: asset.source,
      sourceHash: asset.sourceHash,
      openBrush: asset.importMetadata?.openBrush,
    };
  }
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    source: asset.source,
    sourceHash: asset.sourceHash,
  };
}
