import { tauri } from "./tauri";
import type { SceneAsset } from "./visual-editor/asset-manifest";

const BROWSER_DECODABLE_IMAGE_PATTERN =
  /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i;
export const PROJECT_THUMBNAIL_CHANGED_EVENT =
  "xrift:project-thumbnail-changed";

export function announceProjectThumbnailChanged(): void {
  window.dispatchEvent(new Event(PROJECT_THUMBNAIL_CHANGED_EVENT));
}

export function resolveProjectThumbnailAssetPath(
  asset: SceneAsset | undefined,
): string | null {
  if (!asset || (asset.kind !== "texture" && asset.kind !== "skybox")) {
    return null;
  }
  if (
    asset.source.kind === "project" &&
    BROWSER_DECODABLE_IMAGE_PATTERN.test(asset.source.relativePath)
  ) {
    return asset.source.relativePath;
  }
  if (asset.thumbnail && asset.thumbnail.status !== "missing") {
    return asset.thumbnail.derivedPath;
  }
  return null;
}

export async function imageDataUrlToPng(
  source: string,
  maxDimension = 1024,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () =>
      reject(new Error("画像をサムネイルとして読み込めませんでした"));
    next.src = source;
  });
  const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
  if (largestDimension <= 0) {
    throw new Error("画像のサイズを取得できませんでした");
  }
  const ratio = Math.min(1, maxDimension / largestDimension);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("画像をサムネイルへ変換できませんでした");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function setProjectThumbnailFromAsset(
  projectPath: string,
  asset: SceneAsset,
): Promise<void> {
  const relativePath = resolveProjectThumbnailAssetPath(asset);
  if (!relativePath) {
    throw new Error("このテクスチャにはサムネイルに使用できる画像がありません");
  }
  const source = await tauri.readProjectFileDataUrl(projectPath, relativePath);
  const png = await imageDataUrlToPng(source);
  await tauri.writeThumbnail(projectPath, png);
  announceProjectThumbnailChanged();
}
