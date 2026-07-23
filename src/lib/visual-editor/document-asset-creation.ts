import {
  addDefaultMaterialAsset,
  type AssetManifest,
} from "./asset-manifest";
import { addDefaultParticleAsset } from "./particle-system";
import { addDefaultInteractivityAsset } from "./interactivity-graph";

export type DocumentAssetKind = "material" | "particle" | "interactivity";

export type AddDefaultDocumentAssetResult = {
  manifest: AssetManifest;
  assetId: string;
  added: boolean;
};

export type AssetCreationTarget = {
  assetId?: string;
  folderId?: string;
};

/**
 * Resolves a physical Asset folder for creation commands. Virtual kind folders
 * are filters only, so an unknown active/target folder resolves to Assets root.
 */
export function resolveAssetCreationFolderId(
  manifest: AssetManifest,
  activeFolderId: string | null,
  target: AssetCreationTarget = {},
): string | null {
  if (target.assetId) {
    const asset = manifest.assets[target.assetId];
    const folderId = asset?.folderId ?? null;
    return folderId && manifest.folders?.[folderId] ? folderId : null;
  }
  if (target.folderId && manifest.folders?.[target.folderId]) {
    return target.folderId;
  }
  return activeFolderId && manifest.folders?.[activeFolderId]
    ? activeFolderId
    : null;
}

/** Adds an authored reusable Asset with folder membership and stable order. */
export function addDefaultDocumentAsset(
  manifest: AssetManifest,
  input: {
    kind: DocumentAssetKind;
    id: string;
    folderId: string | null;
  },
): AddDefaultDocumentAssetResult {
  const count = Object.values(manifest.assets).filter(
    (asset) => asset.kind === input.kind && asset.source.kind === "document",
  ).length;
  const assetName =
    input.kind === "material"
      ? `新規マテリアル ${count + 1}`
      : input.kind === "particle"
        ? `新規Particle ${count + 1}`
        : `Interactivity Graph ${count + 1}`;
  const result =
    input.kind === "material"
      ? addDefaultMaterialAsset(manifest, {
          id: input.id,
          name: assetName,
          folderId: input.folderId,
          properties: {
            pbrMetallicRoughness: {
              baseColorFactor: [0.82, 0.84, 0.9, 1],
              metallicFactor: 0,
              roughnessFactor: 0.65,
            },
          },
        })
      : input.kind === "particle"
        ? addDefaultParticleAsset(manifest, {
            id: input.id,
            name: assetName,
            folderId: input.folderId,
          })
        : addDefaultInteractivityAsset(manifest, {
            id: input.id,
            name: assetName,
            folderId: input.folderId,
          });
  return {
    manifest: result.manifest,
    assetId: result.assetId,
    added: result.added,
  };
}
