import type { ModelAsset } from "./asset-manifest";

export const MODEL_THUMBNAIL_RENDERER_VERSION =
  "xrift-studio-model-thumbnail@1";

/**
 * A Model thumbnail is keyed to the Model's own sourceHash: the manifest
 * contract (validateModelThumbnail) requires thumbnail.sourceHash to equal
 * the Model's sourceHash exactly, unlike Material thumbnails which use a
 * composite fingerprint. A bound Material's own changes are therefore not
 * reflected here — only a re-imported/changed source file invalidates it.
 */
export function modelThumbnailNeedsRefresh(model: ModelAsset): boolean {
  if (!model.sourceHash) return false;
  return (
    !model.thumbnail ||
    model.thumbnail.status !== "generated" ||
    model.thumbnail.sourceHash !== model.sourceHash ||
    model.thumbnail.rendererVersion !== MODEL_THUMBNAIL_RENDERER_VERSION
  );
}

export function modelThumbnailDerivedPath(
  modelId: string,
  sourceHash: string,
  extension: "png" | "webp",
): string {
  const safeId =
    modelId
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "model";
  return `assets/.derived/thumbnails/${safeId}-${sourceHash.slice(0, 20)}.${extension}`;
}
