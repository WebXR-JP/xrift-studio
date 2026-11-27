/**
 * The pictures the foliage shader samples, bundled with the app.
 *
 * They are imported into a project as ordinary Texture Assets the first time a
 * tree is placed (`ensureCatalogMaterialTextures`). `assetId` is the id the
 * import pipeline derives from the file name and the content hash, pinned here
 * so the Material can name its Textures before any file has been read.
 *
 * Provenance, prompts and the licence are in
 * `public/visual-editor/foliage/v1/`.
 */
export type FoliageTextureDefinition = {
  key: "leaves" | "bark";
  assetId: string;
  publicPath: string;
  fileName: string;
  mimeType: "image/webp";
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  colorSpace: "srgb";
  displayName: string;
};

export const FOLIAGE_TEXTURES: readonly FoliageTextureDefinition[] = [
  {
    key: "leaves",
    assetId: "texture-foliage-leaves-c0c2242b0eb5",
    publicPath: "/visual-editor/foliage/v1/foliage-leaves.webp",
    fileName: "foliage-leaves.webp",
    mimeType: "image/webp",
    sha256: "c0c2242b0eb59d9e40a421ed3bfbda92ead92137d1c3dafb90c45020d574881c",
    byteLength: 204596,
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    displayName: "葉の小枝（2×2）",
  },
  {
    key: "bark",
    assetId: "texture-foliage-bark-e0ea47af859c",
    publicPath: "/visual-editor/foliage/v1/foliage-bark.webp",
    fileName: "foliage-bark.webp",
    mimeType: "image/webp",
    sha256: "e0ea47af859c3490884fb143e2354a50c8e94a6de9c0d0a3b628a457b8b37aaa",
    byteLength: 223560,
    width: 512,
    height: 512,
    colorSpace: "srgb",
    displayName: "樹皮",
  },
];

export function getFoliageTexture(
  key: FoliageTextureDefinition["key"],
): FoliageTextureDefinition {
  const definition = FOLIAGE_TEXTURES.find((entry) => entry.key === key);
  if (!definition) throw new Error(`Unknown foliage texture: ${key}`);
  return definition;
}

export function getFoliageTextureByAssetId(
  assetId: string,
): FoliageTextureDefinition | undefined {
  return FOLIAGE_TEXTURES.find((entry) => entry.assetId === assetId);
}
