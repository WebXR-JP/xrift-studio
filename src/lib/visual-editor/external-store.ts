import type { ExternalStoreInstallResult } from "../tauri";
import { reimportModelAssetFromDisk } from "./asset-import-persistence";
import {
  DEFAULT_MODEL_IMPORT_SETTINGS,
  createDefaultMaterialAsset,
  createTextureAsset,
  type AssetAttribution,
  type AssetFolder,
  type AssetManifest,
  type ModelAsset,
  type SceneAsset,
  type TextureAsset,
} from "./asset-manifest";
import {
  OPEN_BRUSH_CATALOG_LICENSE_URL,
  OPEN_BRUSH_CATALOG_REVISION,
  OPEN_BRUSH_CATALOG_SOURCE_URL,
  type OpenBrushCatalogEntry,
} from "./open-brush-catalog";
import {
  WATER_SHADER_CATALOG_AUTHOR,
  WATER_SHADER_CATALOG_REVISION,
  WATER_SHADER_CATALOG_SOURCE_URL,
  applyWaterShaderParameters,
  type WaterShaderCatalogEntry,
} from "./water-shader-catalog";
import {
  SKY_SHADER_CATALOG_AUTHOR,
  SKY_SHADER_CATALOG_REVISION,
  SKY_SHADER_CATALOG_SOURCE_URL,
  applySkyShaderParameters,
  type SkyShaderCatalogEntry,
} from "./sky-shader-catalog";

export type AppliedExternalStoreInstall = {
  manifest: AssetManifest;
  primaryAssetId: string;
  installedAssetIds: string[];
  kind: "skybox" | "material" | "model";
};

export type AppliedOpenBrushCatalogInstall = AppliedExternalStoreInstall & {
  alreadyInstalled: boolean;
};

function safeId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function externalFolder(manifest: AssetManifest, providerName: string): AssetFolder {
  const id = `external-${safeId(providerName)}`;
  const existing = manifest.folders?.[id];
  if (existing) return existing;
  const order = Math.max(
    -1,
    ...Object.values(manifest.folders ?? {}).map((folder) => folder.order),
  ) + 1;
  return { id, name: providerName, parentId: null, order };
}

function attribution(result: ExternalStoreInstallResult): AssetAttribution {
  return {
    providerId: result.providerId,
    providerName: result.providerName,
    externalId: result.externalId,
    assetUrl: result.assetUrl,
    licenseName: result.licenseName,
    licenseUrl: result.licenseUrl,
    authors: [...result.authors],
  };
}

function nextOrder(manifest: AssetManifest, folderId: string): number {
  return Math.max(
    -1,
    ...Object.values(manifest.assets)
      .filter((asset) => asset.folderId === folderId)
      .map((asset) => asset.order ?? -1),
  ) + 1;
}

function imageSourceFormat(format: string): "png" | "jpeg" | "webp" | "ktx2" {
  if (format === "png" || format === "webp" || format === "ktx2") return format;
  return "jpeg";
}

function imageMimeType(format: string): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "ktx2") return "image/ktx2";
  return "image/jpeg";
}

export function applyExternalStoreInstall(
  manifest: AssetManifest,
  result: ExternalStoreInstallResult,
): AppliedExternalStoreInstall {
  const folder = externalFolder(manifest, result.providerName);
  const folders = { ...(manifest.folders ?? {}), [folder.id]: folder };
  const baseId = `external-${safeId(result.providerId)}-${safeId(result.externalId)}`;
  const credit = attribution(result);
  const assets: Record<string, SceneAsset> = { ...manifest.assets };
  let order = nextOrder({ ...manifest, folders }, folder.id);

  if (result.assetKind === "hdri") {
    const file = result.files.find((entry) => entry.role === "environment");
    if (!file) throw new Error("環境Texture用のHDRIファイルがありません");
    if (file.format !== "hdr" && file.format !== "exr") {
      throw new Error("環境Texture用のHDRまたはEXRファイルを確認できません");
    }
    const id = `${baseId}-skybox`;
    const texture = createTextureAsset({
      id,
      name: result.name,
      source: { kind: "project", relativePath: file.relativePath },
      folderId: folder.id,
      importSettings: {
        colorSpace: "linear",
        flipY: false,
        resize: { mode: "original" },
        compression: { format: "source", quality: 80 },
      },
    });
    if (!texture) throw new Error("環境Texture Assetを作成できませんでした");
    const asset: TextureAsset = {
      ...texture,
      sourceHash: file.sha256,
      thumbnail: { status: "missing" },
      order,
      attribution: credit,
      usage: "environment",
      projection: "equirectangular",
      importMetadata: {
        sourceFormat: file.format,
        mimeType: file.format === "hdr" ? "image/vnd.radiance" : "image/x-exr",
        byteLength: file.byteLength,
      },
    };
    assets[id] = asset;
    return {
      manifest: { ...manifest, folders, assets },
      primaryAssetId: id,
      installedAssetIds: [id],
      kind: "skybox",
    };
  }

  if (result.assetKind === "model") {
    const file = result.files.find((entry) => entry.role === "model");
    if (!file || file.format !== "gltf") {
      throw new Error("Model用の自己完結glTFファイルがありません");
    }
    const id = `${baseId}-model`;
    const model: ModelAsset = {
      id,
      name: result.name,
      kind: "model",
      status: "ready",
      source: { kind: "project", relativePath: file.relativePath },
      sourceHash: file.sha256,
      thumbnail: { status: "missing" },
      folderId: folder.id,
      order,
      attribution: credit,
      importSettings: { ...DEFAULT_MODEL_IMPORT_SETTINGS },
      materialSlots: [],
    };
    assets[id] = model;
    return {
      manifest: { ...manifest, folders, assets },
      primaryAssetId: id,
      installedAssetIds: [id],
      kind: "model",
    };
  }

  const installedAssetIds: string[] = [];
  const textureIds = new Map<string, string>();
  for (const file of result.files) {
    if (file.role === "environment") continue;
    const id = `${baseId}-${safeId(file.role)}`;
    const texture = createTextureAsset({
      id,
      name: `${result.name} ${file.role}`,
      source: { kind: "project", relativePath: file.relativePath },
      folderId: folder.id,
      importSettings: {
        colorSpace: file.role === "base-color" ? "srgb" : "linear",
        flipY: false,
      },
    });
    if (!texture) throw new Error("Texture Assetを作成できませんでした");
    const imported: TextureAsset = {
      ...texture,
      sourceHash: file.sha256,
      order: order++,
      attribution: credit,
      importMetadata: {
        sourceFormat: imageSourceFormat(file.format),
        mimeType: imageMimeType(file.format),
        byteLength: file.byteLength,
      },
    };
    assets[id] = imported;
    textureIds.set(file.role, id);
    installedAssetIds.push(id);
  }

  const materialId = `${baseId}-material`;
  const material = createDefaultMaterialAsset({
    id: materialId,
    name: result.name,
    folderId: folder.id,
    properties: {
      pbrMetallicRoughness: {
        metallicFactor: 1,
        roughnessFactor: 1,
        ...(textureIds.get("base-color")
          ? { baseColorTexture: { textureAssetId: textureIds.get("base-color")!, texCoord: 0 } }
          : {}),
        ...(textureIds.get("arm")
          ? { metallicRoughnessTexture: { textureAssetId: textureIds.get("arm")!, texCoord: 0 } }
          : {}),
      },
      ...(textureIds.get("normal")
        ? { normalTexture: { textureAssetId: textureIds.get("normal")!, texCoord: 0, scale: 1 } }
        : {}),
      ...(textureIds.get("arm")
        ? { occlusionTexture: { textureAssetId: textureIds.get("arm")!, texCoord: 0, strength: 1 } }
        : {}),
    },
  });
  if (!material) throw new Error("Material Assetを作成できませんでした");
  assets[materialId] = {
    ...material,
    order,
    attribution: credit,
  };
  installedAssetIds.push(materialId);

  return {
    manifest: { ...manifest, folders, assets },
    primaryAssetId: materialId,
    installedAssetIds,
    kind: "material",
  };
}

/**
 * Applies an external store install and, for a Model, immediately analyzes
 * the self-contained glTF that was just written to disk. The manifest
 * contract requires importMetadata whenever sourceHash is present, so a
 * Model asset must never be committed with one and not the other — a caller
 * that skipped this would leave the project permanently unable to save.
 */
export async function applyExternalStoreInstallAndAnalyzeModel(
  projectPath: string,
  manifest: AssetManifest,
  result: ExternalStoreInstallResult,
): Promise<AppliedExternalStoreInstall> {
  const applied = applyExternalStoreInstall(manifest, result);
  if (applied.kind !== "model") return applied;
  const reimport = await reimportModelAssetFromDisk(
    projectPath,
    applied.manifest,
    applied.primaryAssetId,
  );
  if (!reimport.ok) {
    throw new Error(
      `「${result.name}」の構造を解析できませんでした: ${reimport.message}`,
    );
  }
  return { ...applied, manifest: reimport.manifest };
}

/**
 * Installs a Sky Shader preset as a plain Custom Shader Material Asset.
 *
 * Reinstalling the same preset overwrites its Material so the store stays the
 * place to reset a sky to preset values, while every later tweak happens in the
 * Material Inspector on the same asset the scene already points at.
 */
export function applySkyShaderCatalogInstall(
  manifest: AssetManifest,
  entry: SkyShaderCatalogEntry,
  parameterValues: Readonly<Record<string, number | string>> = {},
): AppliedOpenBrushCatalogInstall {
  const folder = externalFolder(manifest, "空 Shader");
  const folders = { ...(manifest.folders ?? {}), [folder.id]: folder };
  const materialId = `external-sky-shader-${safeId(entry.id)}-material`;
  const existing = manifest.assets[materialId];
  const alreadyInstalled = existing?.kind === "material";
  const material = createDefaultMaterialAsset({
    id: materialId,
    name: `空 · ${entry.label}`,
    folderId: folder.id,
  });
  if (!material) throw new Error("空Shader Material Assetを作成できませんでした");
  const order = alreadyInstalled
    ? (existing.order ?? nextOrder({ ...manifest, folders }, folder.id))
    : nextOrder({ ...manifest, folders }, folder.id);
  const assets: Record<string, SceneAsset> = {
    ...manifest.assets,
    [materialId]: {
      ...material,
      order,
      shader: applySkyShaderParameters(entry, parameterValues),
      attribution: {
        providerId: "xrift-sky-shaders",
        providerName: "XRift公式 空Shader",
        externalId: entry.id,
        assetUrl: SKY_SHADER_CATALOG_SOURCE_URL,
        licenseName: "MIT",
        licenseUrl: `${SKY_SHADER_CATALOG_SOURCE_URL}/blob/main/LICENSE`,
        authors: [SKY_SHADER_CATALOG_AUTHOR],
      },
      sourceHash: `${SKY_SHADER_CATALOG_REVISION}:${entry.id}`,
    },
  };
  return {
    manifest: { ...manifest, folders, assets },
    primaryAssetId: materialId,
    installedAssetIds: [materialId],
    kind: "material",
    alreadyInstalled,
  };
}

/**
 * Installs a Water preset as a plain Custom Shader Material Asset. Unlike the
 * sky it claims no scene slot: the author assigns it to a mesh like any other
 * Material, so one preset serves a pond and an ocean.
 */
export function applyWaterShaderCatalogInstall(
  manifest: AssetManifest,
  entry: WaterShaderCatalogEntry,
  parameterValues: Readonly<Record<string, number | string>> = {},
): AppliedOpenBrushCatalogInstall {
  const folder = externalFolder(manifest, "Water Shader");
  const folders = { ...(manifest.folders ?? {}), [folder.id]: folder };
  const materialId = `external-water-shader-${safeId(entry.id)}-material`;
  const existing = manifest.assets[materialId];
  const alreadyInstalled = existing?.kind === "material";
  const material = createDefaultMaterialAsset({
    id: materialId,
    name: `Water · ${entry.label}`,
    folderId: folder.id,
  });
  if (!material) throw new Error("Water Material Assetを作成できませんでした");
  const order = alreadyInstalled
    ? (existing.order ?? nextOrder({ ...manifest, folders }, folder.id))
    : nextOrder({ ...manifest, folders }, folder.id);
  const assets: Record<string, SceneAsset> = {
    ...manifest.assets,
    [materialId]: {
      ...material,
      order,
      shader: applyWaterShaderParameters(entry, parameterValues),
      attribution: {
        providerId: "xrift-water-shaders",
        providerName: "XRift公式 Water Shader",
        externalId: entry.id,
        assetUrl: WATER_SHADER_CATALOG_SOURCE_URL,
        licenseName: "MIT",
        licenseUrl: `${WATER_SHADER_CATALOG_SOURCE_URL}/blob/main/LICENSE`,
        // The Gerstner core is adapted from Mochie's Unity Shaders, so the
        // credit travels with the Material rather than living only in a doc.
        authors: [WATER_SHADER_CATALOG_AUTHOR, "MochiesCode (Gerstner waves, MIT)"],
      },
      sourceHash: `${WATER_SHADER_CATALOG_REVISION}:${entry.id}`,
    },
  };
  return {
    manifest: { ...manifest, folders, assets },
    primaryAssetId: materialId,
    installedAssetIds: [materialId],
    kind: "material",
    alreadyInstalled,
  };
}

export function applyOpenBrushCatalogInstall(
  manifest: AssetManifest,
  entry: OpenBrushCatalogEntry,
): AppliedOpenBrushCatalogInstall {
  const folder = externalFolder(manifest, "Open Brush");
  const folders = { ...(manifest.folders ?? {}), [folder.id]: folder };
  const materialId = `external-open-brush-${safeId(entry.brushGuid)}-material`;
  if (manifest.assets[materialId]?.kind === "material") {
    return {
      manifest: { ...manifest, folders },
      primaryAssetId: materialId,
      installedAssetIds: [materialId],
      kind: "material",
      alreadyInstalled: true,
    };
  }
  const material = createDefaultMaterialAsset({
    id: materialId,
    name: `Open Brush · ${entry.label}`,
    folderId: folder.id,
  });
  if (!material) throw new Error("Open Brush Material Assetを作成できませんでした");
  const order = nextOrder({ ...manifest, folders }, folder.id);
  const assets: Record<string, SceneAsset> = {
    ...manifest.assets,
    [materialId]: {
      ...material,
      order,
      shader: { ...entry.shader },
      attribution: {
        providerId: "open-brush",
        providerName: "Open Brush",
        externalId: entry.brushGuid,
        assetUrl: OPEN_BRUSH_CATALOG_SOURCE_URL,
        licenseName: "Apache-2.0",
        licenseUrl: OPEN_BRUSH_CATALOG_LICENSE_URL,
        authors: ["Icosa Foundation contributors"],
      },
      sourceHash: `${OPEN_BRUSH_CATALOG_REVISION}:${entry.brushGuid}`,
    },
  };
  return {
    manifest: { ...manifest, folders, assets },
    primaryAssetId: materialId,
    installedAssetIds: [materialId],
    kind: "material",
    alreadyInstalled: false,
  };
}
