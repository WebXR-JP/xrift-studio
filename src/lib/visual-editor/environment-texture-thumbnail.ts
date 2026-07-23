import {
  ACESFilmicToneMapping,
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { tauri } from "../tauri";
import {
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type TextureAsset,
} from "./asset-manifest";
import { stableSerializeJson } from "./serialization";

export const ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION =
  "xrift-studio-environment-texture-thumbnail@1";

const THUMBNAIL_WIDTH = 512;
const THUMBNAIL_HEIGHT = 256;

export async function createEnvironmentTextureThumbnailSourceHash(
  asset: TextureAsset,
): Promise<string> {
  const source = stableSerializeJson({
    rendererVersion: ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION,
    source: asset.source,
    sourceHash: asset.sourceHash ?? "",
    sourceFormat: getTextureSourceFormat(asset),
    flipY: asset.importSettings.flipY,
    projection: asset.projection,
  });
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function environmentTextureThumbnailNeedsRefresh(
  asset: TextureAsset,
  sourceHash: string,
): boolean {
  return (
    isEnvironmentTextureAsset(asset) &&
    (!asset.thumbnail ||
      asset.thumbnail.status !== "generated" ||
      asset.thumbnail.sourceHash !== sourceHash ||
      asset.thumbnail.rendererVersion !==
        ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION)
  );
}

export function environmentTextureThumbnailDerivedPath(
  assetId: string,
  sourceHash: string,
): string {
  const safeId =
    assetId
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "environment-texture";
  return `assets/.derived/thumbnails/${safeId}-${sourceHash.slice(0, 20)}.png`;
}

export async function renderEnvironmentTextureThumbnail(
  projectPath: string,
  asset: TextureAsset,
): Promise<string> {
  if (!isEnvironmentTextureAsset(asset) || asset.source.kind !== "project") {
    throw new Error("HDRI Textureのプロジェクトソースを確認できません");
  }
  const sourceFormat = getTextureSourceFormat(asset);
  if (sourceFormat !== "hdr" && sourceFormat !== "exr") {
    throw new Error("HDRI Textureの形式を確認できません");
  }

  const dataUrl = await tauri.readProjectFileDataUrl(
    projectPath,
    asset.source.relativePath,
  );
  const texture = await loadEnvironmentTexture(dataUrl, sourceFormat);
  return renderTextureToDataUrl(texture, asset.importSettings.flipY);
}

async function loadEnvironmentTexture(
  dataUrl: string,
  sourceFormat: "hdr" | "exr",
): Promise<Texture> {
  return sourceFormat === "hdr"
    ? await new HDRLoader().loadAsync(dataUrl)
    : await new EXRLoader().loadAsync(dataUrl);
}

function renderTextureToDataUrl(texture: Texture, flipY: boolean): string {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new MeshBasicMaterial({ map: texture, toneMapped: true });
  const plane = new Mesh(geometry, material);

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, false);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(new Color("#0f172a"), 1);
    texture.flipY = flipY;
    texture.needsUpdate = true;
    scene.add(plane);
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  } finally {
    scene.remove(plane);
    geometry.dispose();
    material.dispose();
    texture.dispose();
    renderer.dispose();
  }
}
