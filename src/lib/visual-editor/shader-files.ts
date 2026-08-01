import type {
  AssetManifest,
  ShaderAsset,
  ShaderAssetStage,
} from "./asset-manifest";
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  SHADER_ASSET_CONTRACT_VERSION,
} from "./asset-manifest";

export const SHADER_DIRECTORY = "shaders";

/** Returns the stage suggested by a conventional GLSL filename. */
export function shaderStageFromFileName(fileName: string): ShaderAssetStage {
  return /\.(?:vert|vertex|vs)$/i.test(fileName) ? "vertex" : "fragment";
}

/** Project-relative path for an imported Shader Asset. */
export function createShaderRelativePath(
  name: string,
  assets: AssetManifest,
  reservedPaths: Iterable<string> = [],
): string {
  const stem = toFileStem(name);
  const extension = fileExtension(name) || "glsl";
  const taken = new Set([
    ...Object.values(assets.assets)
      .filter((asset): asset is ShaderAsset => asset.kind === "shader")
      .map((asset) => asset.source.relativePath),
    ...reservedPaths,
  ]);
  let candidate = `${SHADER_DIRECTORY}/${stem}.${extension}`;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${SHADER_DIRECTORY}/${stem}-${counter}.${extension}`;
    counter += 1;
  }
  return candidate;
}

export function createShaderAsset(
  id: string,
  name: string,
  relativePath: string,
  sourceHash: string,
  folderId: string | null = null,
  stage: ShaderAssetStage = shaderStageFromFileName(name),
): ShaderAsset {
  return {
    id,
    name,
    kind: "shader",
    status: "ready",
    folderId,
    sourceHash,
    contractVersion: SHADER_ASSET_CONTRACT_VERSION,
    language: "glsl",
    stage,
    source: { kind: "project", relativePath },
  };
}

export function addShaderAsset(
  assets: AssetManifest,
  asset: ShaderAsset,
): AssetManifest {
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    ...(assets.folders ? { folders: assets.folders } : {}),
    assets: { ...assets.assets, [asset.id]: asset },
  };
}

export function listShaderAssets(assets: AssetManifest): ShaderAsset[] {
  return Object.values(assets.assets)
    .filter((asset): asset is ShaderAsset => asset.kind === "shader")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function fileExtension(value: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(value.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function toFileStem(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "shader";
}
