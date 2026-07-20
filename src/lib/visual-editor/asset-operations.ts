import {
  isUserLibraryAsset,
  moveAssetFolder,
  moveAssetToFolder,
  type AssetManifest,
  type ParticleAsset,
  type SceneAsset,
} from "./asset-manifest";
import type { PrefabDocument } from "./prefab-document";
import type {
  RegisteredSceneComponent,
  SceneDocument,
  SceneEntity,
} from "./scene-document";

export type AssetReferenceKind =
  | "scene-geometry"
  | "scene-material"
  | "scene-particle"
  | "scene-audio"
  | "scene-prefab"
  | "scene-xrift"
  | "material-texture"
  | "model-material"
  | "particle-material"
  | "particle-texture"
  | "prefab-geometry"
  | "prefab-material"
  | "prefab-particle"
  | "prefab-audio"
  | "prefab-prefab"
  | "prefab-xrift";

/** A user-facing location which must be unlinked before an Asset can be deleted. */
export type AssetReferenceLocation = {
  kind: AssetReferenceKind;
  ownerId: string;
  ownerName: string;
  detail: string;
};

export type AssetDeletionAnalysis = {
  asset: SceneAsset | null;
  canDelete: boolean;
  reason: "ready" | "missing" | "not-library-asset" | "referenced";
  references: AssetReferenceLocation[];
};

export type AssetDeletionResult = AssetDeletionAnalysis & {
  assets: AssetManifest;
  prefabs: Record<string, PrefabDocument>;
  deletedPrefabId: string | null;
  changed: boolean;
};

export type AssetFolderDeletionAnalysis = {
  canDelete: boolean;
  reason: "ready" | "missing" | "contains-assets" | "contains-folders";
  assetCount: number;
  childFolderCount: number;
};

export type AssetLibraryMoveResult = {
  assets: AssetManifest;
  changed: boolean;
  reason:
    | "ready"
    | "missing"
    | "invalid-target"
    | "not-library-asset"
    | "same-parent"
    | "cycle"
    | "duplicate-name";
};

type AssetReferenceDocuments = {
  assets: AssetManifest;
  scene: SceneDocument;
  prefabs: Readonly<Record<string, PrefabDocument>>;
};

const ASSET_REFERENCE_LABELS: Record<AssetReferenceKind, string> = {
  "scene-geometry": "Mesh geometry",
  "scene-material": "Mesh material slot",
  "scene-particle": "Particle emitter",
  "scene-audio": "Audio Source",
  "scene-prefab": "Prefab instance",
  "scene-xrift": "XRift component",
  "material-texture": "Material texture slot",
  "model-material": "Model default material slot",
  "particle-material": "Particle material",
  "particle-texture": "Particle texture",
  "prefab-geometry": "Prefab mesh geometry",
  "prefab-material": "Prefab mesh material slot",
  "prefab-particle": "Prefab particle emitter",
  "prefab-audio": "Prefab Audio Source",
  "prefab-prefab": "Nested Prefab instance",
  "prefab-xrift": "Prefab XRift component",
};

export function assetReferenceKindLabel(kind: AssetReferenceKind): string {
  return ASSET_REFERENCE_LABELS[kind];
}

/**
 * Collects every direct authoring reference which would become dangling after
 * deleting an Asset. The output is stable and contains one row per slot/use.
 */
export function collectAssetReferences(
  documents: AssetReferenceDocuments,
  assetId: string,
): AssetReferenceLocation[] {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) return [];

  const references: AssetReferenceLocation[] = [];
  const seen = new Set<string>();
  const add = (reference: AssetReferenceLocation) => {
    const key = [
      reference.kind,
      reference.ownerId,
      reference.detail,
    ].join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    references.push(reference);
  };

  collectEntityReferences(
    Object.values(documents.scene.entities),
    normalizedAssetId,
    "scene",
    add,
  );

  for (const prefab of Object.values(documents.prefabs)) {
    collectEntityReferences(
      Object.values(prefab.entities),
      normalizedAssetId,
      "prefab",
      (reference) =>
        add({
          ...reference,
          ownerId: `${prefab.prefabId}/${reference.ownerId}`,
          ownerName: `${prefab.name} / ${reference.ownerName}`,
        }),
    );
  }

  for (const asset of Object.values(documents.assets.assets)) {
    if (asset.kind === "material") {
      collectNestedAssetIds(asset.properties).forEach(({ assetId: nestedId, path }) => {
        if (nestedId !== normalizedAssetId) return;
        add({
          kind: "material-texture",
          ownerId: asset.id,
          ownerName: asset.name,
          detail: materialTexturePathLabel(path),
        });
      });
    } else if (asset.kind === "model") {
      asset.materialSlots.forEach((slot) => {
        if (slot.defaultMaterialAssetId !== normalizedAssetId) return;
        add({
          kind: "model-material",
          ownerId: asset.id,
          ownerName: asset.name,
          detail: `Default material slot: ${slot.name}`,
        });
      });
    } else if (asset.kind === "particle") {
      collectParticleRendererReferences(asset, normalizedAssetId, add);
    }
  }

  return references.sort(
    (left, right) =>
      left.ownerName.localeCompare(right.ownerName) ||
      left.kind.localeCompare(right.kind) ||
      left.detail.localeCompare(right.detail),
  );
}

export function analyzeAssetDeletion(
  documents: AssetReferenceDocuments,
  assetId: string,
): AssetDeletionAnalysis {
  const asset = documents.assets.assets[assetId] ?? null;
  if (!asset) {
    return { asset, canDelete: false, reason: "missing", references: [] };
  }
  if (!isUserLibraryAsset(asset)) {
    return {
      asset,
      canDelete: false,
      reason: "not-library-asset",
      references: [],
    };
  }
  const references = collectAssetReferences(documents, assetId);
  return {
    asset,
    canDelete: references.length === 0,
    reason: references.length === 0 ? "ready" : "referenced",
    references,
  };
}

/** Safe delete boundary. Referenced and Creation-catalog Assets are immutable. */
export function deleteAssetIfUnreferenced(
  documents: AssetReferenceDocuments,
  assetId: string,
): AssetDeletionResult {
  const analysis = analyzeAssetDeletion(documents, assetId);
  if (!analysis.canDelete || !analysis.asset) {
    return {
      ...analysis,
      assets: documents.assets,
      prefabs: { ...documents.prefabs },
      deletedPrefabId: null,
      changed: false,
    };
  }

  const nextAssetEntries = { ...documents.assets.assets };
  delete nextAssetEntries[assetId];
  const prefabId = prefabIdForAsset(analysis.asset, documents.prefabs);
  const nextPrefabs = { ...documents.prefabs };
  if (prefabId) delete nextPrefabs[prefabId];

  return {
    ...analysis,
    assets: { ...documents.assets, assets: nextAssetEntries },
    prefabs: nextPrefabs,
    deletedPrefabId: prefabId,
    changed: true,
  };
}

export function analyzeAssetFolderDeletion(
  assets: AssetManifest,
  folderId: string,
): AssetFolderDeletionAnalysis {
  if (!assets.folders?.[folderId]) {
    return {
      canDelete: false,
      reason: "missing",
      assetCount: 0,
      childFolderCount: 0,
    };
  }
  const assetCount = Object.values(assets.assets).filter(
    (asset) => (asset.folderId ?? null) === folderId,
  ).length;
  const childFolderCount = Object.values(assets.folders).filter(
    (folder) => folder.parentId === folderId,
  ).length;
  return {
    canDelete: assetCount === 0 && childFolderCount === 0,
    reason:
      assetCount > 0
        ? "contains-assets"
        : childFolderCount > 0
          ? "contains-folders"
          : "ready",
    assetCount,
    childFolderCount,
  };
}

export function deleteEmptyAssetFolder(
  assets: AssetManifest,
  folderId: string,
): { assets: AssetManifest; changed: boolean; analysis: AssetFolderDeletionAnalysis } {
  const analysis = analyzeAssetFolderDeletion(assets, folderId);
  if (!analysis.canDelete) return { assets, changed: false, analysis };
  const folders = { ...(assets.folders ?? {}) };
  delete folders[folderId];
  return {
    assets: { ...assets, folders },
    changed: true,
    analysis,
  };
}

export function moveLibraryAsset(
  assets: AssetManifest,
  assetId: string,
  folderId: string | null,
): AssetLibraryMoveResult {
  const asset = assets.assets[assetId];
  if (!asset) return { assets, changed: false, reason: "missing" };
  if (!isUserLibraryAsset(asset)) {
    return { assets, changed: false, reason: "not-library-asset" };
  }
  if (folderId !== null && !assets.folders?.[folderId]) {
    return { assets, changed: false, reason: "invalid-target" };
  }
  if ((asset.folderId ?? null) === folderId) {
    return { assets, changed: false, reason: "same-parent" };
  }
  const next = moveAssetToFolder(assets, assetId, folderId);
  return {
    assets: next,
    changed: next !== assets,
    reason: next === assets ? "invalid-target" : "ready",
  };
}

export function moveLibraryFolder(
  assets: AssetManifest,
  folderId: string,
  parentId: string | null,
): AssetLibraryMoveResult {
  const folder = assets.folders?.[folderId];
  if (!folder) return { assets, changed: false, reason: "missing" };
  if (parentId !== null && !assets.folders?.[parentId]) {
    return { assets, changed: false, reason: "invalid-target" };
  }
  if (folder.parentId === parentId) {
    return { assets, changed: false, reason: "same-parent" };
  }
  if (parentId === folderId || isDescendantFolder(assets, parentId, folderId)) {
    return { assets, changed: false, reason: "cycle" };
  }
  const hasDuplicateName = Object.values(assets.folders ?? {}).some(
    (candidate) =>
      candidate.id !== folderId &&
      candidate.parentId === parentId &&
      candidate.name.localeCompare(folder.name, undefined, {
        sensitivity: "accent",
      }) === 0,
  );
  if (hasDuplicateName) {
    return { assets, changed: false, reason: "duplicate-name" };
  }
  const next = moveAssetFolder(assets, folderId, parentId);
  return {
    assets: next,
    changed: next !== assets,
    reason: next === assets ? "invalid-target" : "ready",
  };
}

function collectEntityReferences(
  entities: SceneEntity[],
  assetId: string,
  scope: "scene" | "prefab",
  add: (reference: AssetReferenceLocation) => void,
): void {
  for (const entity of entities) {
    for (const rawComponent of entity.components) {
      const component = rawComponent as RegisteredSceneComponent;
      collectComponentReferences(component, entity, assetId, scope, add);
    }
  }
}

function collectComponentReferences(
  component: RegisteredSceneComponent,
  entity: SceneEntity,
  assetId: string,
  scope: "scene" | "prefab",
  add: (reference: AssetReferenceLocation) => void,
): void {
  const kind = (suffix: "geometry" | "material" | "particle" | "audio" | "prefab" | "xrift") =>
    `${scope}-${suffix}` as AssetReferenceKind;
  if (component.type === "mesh") {
    const geometryAssetId =
      component.geometry?.kind === "asset"
        ? component.geometry.assetId
        : component.geometry
          ? null
          : component.geometryAssetId;
    if (geometryAssetId === assetId) {
      add({
        kind: kind("geometry"),
        ownerId: entity.id,
        ownerName: entity.name,
        detail: "Geometry",
      });
    }
    for (const binding of component.materialBindings) {
      if (binding.materialAssetId !== assetId) continue;
      add({
        kind: kind("material"),
        ownerId: entity.id,
        ownerName: entity.name,
        detail: `Material slot: ${binding.slot}`,
      });
    }
  } else if (
    component.type === "particle-emitter" &&
    component.particleAssetId === assetId
  ) {
    add({
      kind: kind("particle"),
      ownerId: entity.id,
      ownerName: entity.name,
      detail: "Particle emitter",
    });
  } else if (
    component.type === "audio-source" &&
    component.audioAssetId === assetId
  ) {
    add({
      kind: kind("audio"),
      ownerId: entity.id,
      ownerName: entity.name,
      detail: "Audio Source",
    });
  } else if (
    component.type === "prefab-instance" &&
    component.prefabAssetId === assetId
  ) {
    add({
      kind: kind("prefab"),
      ownerId: entity.id,
      ownerName: entity.name,
      detail: "Prefab instance",
    });
  } else if (component.type === "xrift-component") {
    component.assetReferences.forEach((referenceId, index) => {
      if (referenceId !== assetId) return;
      add({
        kind: kind("xrift"),
        ownerId: entity.id,
        ownerName: entity.name,
        detail: `${component.schemaId} / Asset ${index + 1}`,
      });
    });
  }
}

function collectNestedAssetIds(
  value: unknown,
  path = "properties",
  visited = new Set<object>(),
): Array<{ assetId: string; path: string }> {
  if (typeof value !== "object" || value === null) return [];
  if (visited.has(value)) return [];
  visited.add(value);
  const output: Array<{ assetId: string; path: string }> = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key === "textureAssetId" && typeof entry === "string") {
      output.push({ assetId: entry, path: nextPath });
    } else if (/TextureId$/.test(key) && typeof entry === "string") {
      output.push({ assetId: entry, path: nextPath });
    } else {
      output.push(...collectNestedAssetIds(entry, nextPath, visited));
    }
  }
  return output;
}

function collectParticleRendererReferences(
  asset: ParticleAsset,
  assetId: string,
  add: (reference: AssetReferenceLocation) => void,
): void {
  if (asset.properties.renderer.materialAssetId === assetId) {
    add({
      kind: "particle-material",
      ownerId: asset.id,
      ownerName: asset.name,
      detail: "Renderer material",
    });
  }
  if (asset.properties.renderer.textureAssetId === assetId) {
    add({
      kind: "particle-texture",
      ownerId: asset.id,
      ownerName: asset.name,
      detail: "Renderer texture",
    });
  }
}

function materialTexturePathLabel(path: string): string {
  const normalized = path
    .replace(/^properties\./, "")
    .replace(/\.textureAssetId$/, "")
    .replace(/TextureId$/, "");
  const compatibilityAliases: Record<string, string> = {
    baseColor: "pbrMetallicRoughness.baseColorTexture",
    metallicRoughness: "pbrMetallicRoughness.metallicRoughnessTexture",
    normal: "normalTexture",
    occlusion: "occlusionTexture",
    emissive: "emissiveTexture",
  };
  return (compatibilityAliases[normalized] ?? normalized).split(".").join(" / ");
}

function prefabIdForAsset(
  asset: SceneAsset,
  prefabs: Readonly<Record<string, PrefabDocument>>,
): string | null {
  if (asset.kind !== "template" || asset.templateType !== "prefab") return null;
  const prefabPath =
    "prefabPath" in asset && typeof asset.prefabPath === "string"
      ? asset.prefabPath
      : asset.templatePath;
  const pathId = prefabPath
    .slice(prefabPath.lastIndexOf("/") + 1)
    .replace(/\.prefab\.json$/, "");
  if (prefabs[pathId]) return pathId;
  const normalizedPath = prefabPath.replace(/\\/g, "/");
  return (
    Object.values(prefabs).find(
      (prefab) =>
        normalizedPath.endsWith(`/${prefab.prefabId}.prefab.json`) ||
        normalizedPath === `${prefab.prefabId}.prefab.json`,
    )?.prefabId ?? null
  );
}

function isDescendantFolder(
  assets: AssetManifest,
  candidateId: string | null,
  ancestorId: string,
): boolean {
  let currentId = candidateId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = assets.folders?.[currentId]?.parentId ?? null;
  }
  return false;
}
