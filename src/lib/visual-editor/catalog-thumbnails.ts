const CATALOG_THUMBNAIL_ROOT = "/visual-editor/catalog-thumbnails";
const OPEN_BRUSH_THUMBNAIL_REVISION = "v1-r1";
const XRIFT_COMPONENT_THUMBNAIL_REVISION = "v0.43.0-r1";

export function openBrushCatalogThumbnailUrl(brushGuid: string): string {
  return `${CATALOG_THUMBNAIL_ROOT}/open-brush-${OPEN_BRUSH_THUMBNAIL_REVISION}/${brushGuid}.webp`;
}

export function xriftComponentCatalogThumbnailUrl(
  importName: string,
): string {
  const fileName = importName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
  return `${CATALOG_THUMBNAIL_ROOT}/xrift-components-${XRIFT_COMPONENT_THUMBNAIL_REVISION}/${fileName}.webp`;
}
