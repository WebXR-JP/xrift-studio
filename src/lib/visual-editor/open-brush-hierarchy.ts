import type { AssetManifest, ModelAsset } from "./asset-manifest";
import {
  expandModelEntityHierarchy,
  hasModelNodeHierarchy,
} from "./model-hierarchy";
import type { SceneDocument } from "./scene-document";

/** @deprecated Use hasModelNodeHierarchy for both ordinary glTF and OpenBrush. */
export function hasOpenBrushNodeHierarchy(asset: ModelAsset): boolean {
  return Boolean(asset.importMetadata?.openBrush?.nodes?.length) &&
    hasModelNodeHierarchy(asset);
}

/** @deprecated Use expandModelEntityHierarchy for both ordinary glTF and OpenBrush. */
export function expandOpenBrushModelEntityHierarchy(
  scene: SceneDocument,
  assets: AssetManifest,
  asset: ModelAsset,
  rootEntityId: string,
): SceneDocument {
  if (!hasOpenBrushNodeHierarchy(asset)) return scene;
  return expandModelEntityHierarchy(scene, assets, asset, rootEntityId);
}
