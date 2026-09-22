import type { AssetManifest, ModelAsset } from "../asset-manifest";
import type { SceneDocument } from "../scene-document";

/** Kept for existing callers; normal publication no longer creates this plan. */
export type ModelDownloadPlan = {
  replacedMaterials: Array<{ index: number; name: string }>;
};

/**
 * Keep every declared dependency, including disabled components and graph/script
 * assetReferences. Only authoring provenance is excluded from the closure.
 * Comparing exact IDs also covers custom shader uniforms and nested properties.
 */
export function collectPublishedAssetIds(scene: SceneDocument | null, manifest: AssetManifest): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (Object.prototype.hasOwnProperty.call(manifest.assets, value)) ids.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(scene);
  // Set iteration includes dependencies appended during the walk.
  for (const id of ids) {
    const asset = manifest.assets[id];
    if (asset.kind === "model" || asset.kind === "primitive") visit(asset.materialSlots);
    if (asset.kind === "primitive") visit(asset.defaultMaterialAssetId);
    if (asset.kind === "material") { visit(asset.properties); visit(asset.shader); }
    if (asset.kind === "particle") visit(asset.properties);
    if (asset.kind === "interactivity") visit(asset.extension);
  }
  return ids;
}

/** A known publication limitation, not a generic compiler failure. */
export class PublishModelTransformError extends Error {
  readonly assetId: string;

  constructor(model: ModelAsset) {
    super(`3Dモデル「${model.name}」の公開時だけのメッシュ結合は停止しています。Assetsのモデル設定で「公開時に静的メッシュをまとめる」をオフにしてください。`);
    this.name = "PublishModelTransformError";
    this.assetId = model.id;
  }
}

/**
 * Publish the stored model bytes, not another interpretation of the model.
 * Returning no plan keeps desktop staging and browser uploads on their normal
 * file-copy path, without stripping images, repacking buffers or using cached
 * conversions. Explicit reimports/optimizations remain authoring operations.
 *
 * Legacy publish-only mesh merging is rejected before either output backend
 * runs. Do not silently ignore or change a saved setting in the user's project.
 */
export function planModelDownload(
  model: ModelAsset,
  _scene: SceneDocument | null,
  _manifest: AssetManifest,
): ModelDownloadPlan | undefined {
  if (model.importSettings.mergeStaticMeshes === true) {
    throw new PublishModelTransformError(model);
  }
  return undefined;
}
