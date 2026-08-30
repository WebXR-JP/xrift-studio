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
  | "scene-text"
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
  | "prefab-text"
  | "prefab-xrift";

/** What unlinking one reference does to the owner it is stored on. */
export type AssetReferenceDetachEffect = "clear-slot" | "remove-component";

/** A user-facing location which must be unlinked before an Asset can be deleted. */
export type AssetReferenceLocation = {
  kind: AssetReferenceKind;
  ownerId: string;
  ownerName: string;
  detail: string;
  /**
   * Whether unlinking empties a slot or takes the whole Component with it.
   *
   * Geometry, Particle emitters and Prefab instances cannot exist without the
   * Asset they point at, so unlinking removes the Component and leaves the
   * Entity in place. Everything else is a slot the owner keeps working without.
   */
  detachEffect: AssetReferenceDetachEffect;
};

/** Identity of one reference row, stable across a re-analysis. */
export type AssetReferenceSelector = {
  kind: AssetReferenceKind;
  ownerId: string;
  detail: string;
};

export type AssetReferenceDetachResult = {
  assets: AssetManifest;
  scene: SceneDocument;
  prefabs: Record<string, PrefabDocument>;
  /** The rows that were actually unlinked, in the order they were applied. */
  detached: AssetReferenceLocation[];
  changed: boolean;
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
  "scene-text": "Text background",
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
  "prefab-text": "Prefab Text background",
  "prefab-xrift": "Prefab XRift component",
};

export function assetReferenceKindLabel(kind: AssetReferenceKind): string {
  return ASSET_REFERENCE_LABELS[kind];
}

const ASSET_REFERENCE_DETACH_EFFECT_LABELS: Record<
  AssetReferenceDetachEffect,
  string
> = {
  "clear-slot": "参照を空にする",
  "remove-component": "Componentごと外す",
};

export function assetReferenceDetachEffectLabel(
  effect: AssetReferenceDetachEffect,
): string {
  return ASSET_REFERENCE_DETACH_EFFECT_LABELS[effect];
}

/** Row identity, so the UI can key a list and re-target it after a re-analysis. */
export function assetReferenceKey(
  reference: AssetReferenceSelector,
): string {
  return [reference.kind, reference.ownerId, reference.detail].join("\u0000");
}

/**
 * Collects every direct authoring reference which would become dangling after
 * deleting an Asset. The output is stable and contains one row per slot/use.
 */
export function collectAssetReferences(
  documents: AssetReferenceDocuments,
  assetId: string,
): AssetReferenceLocation[] {
  const references: AssetReferenceLocation[] = [];
  visitAssetReferences(documents, assetId, (reference) => {
    references.push(reference);
  });
  return references.sort(
    (left, right) =>
      left.ownerName.localeCompare(right.ownerName) ||
      left.kind.localeCompare(right.kind) ||
      left.detail.localeCompare(right.detail),
  );
}

/**
 * Unlinks references to an Asset so it can be deleted from the same place the
 * author found the problem.
 *
 * The blocked delete dialog used to be a dead end: it named the reference and
 * left the author to find each owner by hand. Detaching is the same traversal
 * the analysis runs, so a row the dialog shows is exactly a row this can clear.
 * Pass `only` to unlink a single row; omit it to unlink every reference.
 */
export function detachAssetReferences(
  documents: AssetReferenceDocuments,
  assetId: string,
  only?: AssetReferenceSelector,
): AssetReferenceDetachResult {
  const wanted = only ? assetReferenceKey(only) : null;
  const nextEntities = { ...documents.scene.entities };
  const nextAssetEntries = { ...documents.assets.assets };
  const rewrittenPrefabs: Record<string, PrefabDocument> = {};
  const detached: AssetReferenceLocation[] = [];

  const prefabEntitiesFor = (
    prefabId: string,
  ): Record<string, SceneEntity> | null => {
    const existing = rewrittenPrefabs[prefabId];
    if (existing) return existing.entities;
    const source = documents.prefabs[prefabId];
    if (!source) return null;
    const clone: PrefabDocument = { ...source, entities: { ...source.entities } };
    rewrittenPrefabs[prefabId] = clone;
    return clone.entities;
  };

  visitAssetReferences(documents, assetId, (reference, target) => {
    if (wanted !== null && assetReferenceKey(reference) !== wanted) return;
    if (target.scope === "asset") {
      const owner = nextAssetEntries[target.assetId];
      if (!owner) return;
      nextAssetEntries[target.assetId] = target.match.detach(owner);
      detached.push(reference);
      return;
    }
    const entities =
      target.scope === "scene"
        ? nextEntities
        : prefabEntitiesFor(target.prefabId);
    if (!entities) return;
    const entity = entities[target.entityId];
    if (!entity) return;
    const index = entity.components.findIndex(
      (component) => component.id === target.componentId,
    );
    if (index < 0) return;
    const rewritten = target.match.detach(
      entity.components[index] as RegisteredSceneComponent,
    );
    entities[target.entityId] = {
      ...entity,
      components:
        rewritten === null
          ? entity.components.filter((_, position) => position !== index)
          : entity.components.map((component, position) =>
              position === index ? rewritten : component,
            ),
    };
    detached.push(reference);
  });

  if (detached.length === 0) {
    return {
      assets: documents.assets,
      scene: documents.scene,
      prefabs: { ...documents.prefabs },
      detached,
      changed: false,
    };
  }

  return {
    assets: { ...documents.assets, assets: nextAssetEntries },
    scene: { ...documents.scene, entities: nextEntities },
    prefabs: { ...documents.prefabs, ...rewrittenPrefabs },
    detached,
    changed: true,
  };
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

/**
 * Where a reference lives, so a detach can be applied to the exact owner the
 * analysis reported. The traversal below is the single source for both.
 */
type AssetReferenceTarget =
  | {
      scope: "scene";
      entityId: string;
      componentId: string;
      match: ComponentReferenceMatch;
    }
  | {
      scope: "prefab";
      prefabId: string;
      entityId: string;
      componentId: string;
      match: ComponentReferenceMatch;
    }
  | { scope: "asset"; assetId: string; match: AssetOwnedReferenceMatch };

type ComponentReferenceSuffix =
  | "geometry"
  | "material"
  | "particle"
  | "audio"
  | "prefab"
  | "text"
  | "xrift";

type ComponentReferenceMatch = {
  suffix: ComponentReferenceSuffix;
  detail: string;
  detachEffect: AssetReferenceDetachEffect;
  /** Rewritten Component, or null when it cannot exist without the Asset. */
  detach: (component: RegisteredSceneComponent) => RegisteredSceneComponent | null;
};

type AssetOwnedReferenceMatch = {
  kind: AssetReferenceKind;
  detail: string;
  detachEffect: AssetReferenceDetachEffect;
  detach: (asset: SceneAsset) => SceneAsset;
};

/**
 * Walks every reference to an Asset once, in the order the delete dialog lists
 * them. Duplicated rows are dropped here so a row the author sees is one
 * detachable unit.
 */
function visitAssetReferences(
  documents: AssetReferenceDocuments,
  assetId: string,
  visit: (
    reference: AssetReferenceLocation,
    target: AssetReferenceTarget,
  ) => void,
): void {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) return;

  const seen = new Set<string>();
  const emit = (
    reference: AssetReferenceLocation,
    target: AssetReferenceTarget,
  ) => {
    const key = assetReferenceKey(reference);
    if (seen.has(key)) return;
    seen.add(key);
    visit(reference, target);
  };

  for (const entity of Object.values(documents.scene.entities)) {
    for (const rawComponent of entity.components) {
      const component = rawComponent as RegisteredSceneComponent;
      for (const match of describeComponentReferences(
        component,
        normalizedAssetId,
      )) {
        emit(
          {
            kind: `scene-${match.suffix}` as AssetReferenceKind,
            ownerId: entity.id,
            ownerName: entity.name,
            detail: match.detail,
            detachEffect: match.detachEffect,
          },
          {
            scope: "scene",
            entityId: entity.id,
            componentId: component.id,
            match,
          },
        );
      }
    }
  }

  for (const prefab of Object.values(documents.prefabs)) {
    for (const entity of Object.values(prefab.entities)) {
      for (const rawComponent of entity.components) {
        const component = rawComponent as RegisteredSceneComponent;
        for (const match of describeComponentReferences(
          component,
          normalizedAssetId,
        )) {
          emit(
            {
              kind: `prefab-${match.suffix}` as AssetReferenceKind,
              ownerId: `${prefab.prefabId}/${entity.id}`,
              ownerName: `${prefab.name} / ${entity.name}`,
              detail: match.detail,
              detachEffect: match.detachEffect,
            },
            {
              scope: "prefab",
              prefabId: prefab.prefabId,
              entityId: entity.id,
              componentId: component.id,
              match,
            },
          );
        }
      }
    }
  }

  for (const asset of Object.values(documents.assets.assets)) {
    for (const match of describeAssetOwnedReferences(
      asset,
      normalizedAssetId,
    )) {
      emit(
        {
          kind: match.kind,
          ownerId: asset.id,
          ownerName: asset.name,
          detail: match.detail,
          detachEffect: match.detachEffect,
        },
        { scope: "asset", assetId: asset.id, match },
      );
    }
  }
}

function describeComponentReferences(
  component: RegisteredSceneComponent,
  assetId: string,
): ComponentReferenceMatch[] {
  if (component.type === "mesh") {
    const matches: ComponentReferenceMatch[] = [];
    const geometryAssetId =
      component.geometry?.kind === "asset"
        ? component.geometry.assetId
        : component.geometry
          ? null
          : component.geometryAssetId;
    if (geometryAssetId === assetId) {
      matches.push({
        suffix: "geometry",
        detail: "Geometry",
        detachEffect: "remove-component",
        detach: () => null,
      });
    }
    for (const binding of component.materialBindings) {
      if (binding.materialAssetId !== assetId) continue;
      const slot = binding.slot;
      matches.push({
        suffix: "material",
        detail: `Material slot: ${slot}`,
        detachEffect: "clear-slot",
        // Dropping the binding restores the geometry's own default Material for
        // that slot, which is what an unbound slot means everywhere else.
        detach: (current) =>
          current.type === "mesh"
            ? {
                ...current,
                materialBindings: current.materialBindings.filter(
                  (candidate) =>
                    !(
                      candidate.slot === slot &&
                      candidate.materialAssetId === assetId
                    ),
                ),
              }
            : current,
      });
    }
    return matches;
  }

  if (
    component.type === "particle-emitter" &&
    component.particleAssetId === assetId
  ) {
    return [
      {
        suffix: "particle",
        detail: "Particle emitter",
        detachEffect: "remove-component",
        detach: () => null,
      },
    ];
  }

  if (component.type === "audio-source" && component.audioAssetId === assetId) {
    return [
      {
        suffix: "audio",
        detail: "Audio Source",
        detachEffect: "clear-slot",
        detach: (current) =>
          current.type === "audio-source"
            ? { ...current, audioAssetId: "" }
            : current,
      },
    ];
  }

  if (
    component.type === "text" &&
    component.background?.mode === "texture" &&
    component.background.textureAssetId === assetId
  ) {
    return [
      {
        suffix: "text",
        detail: "Text background",
        detachEffect: "clear-slot",
        detach: (current) => {
          if (current.type !== "text" || !current.background) return current;
          const { textureAssetId: _removed, ...background } = current.background;
          return { ...current, background: { ...background, mode: "color" } };
        },
      },
    ];
  }

  if (
    component.type === "prefab-instance" &&
    component.prefabAssetId === assetId
  ) {
    return [
      {
        suffix: "prefab",
        detail: "Prefab instance",
        detachEffect: "remove-component",
        detach: () => null,
      },
    ];
  }

  if (component.type === "xrift-component") {
    return component.assetReferences.flatMap((referenceId, index) =>
      referenceId === assetId
        ? [
            {
              suffix: "xrift" as const,
              detail: `${component.schemaId} / Asset ${index + 1}`,
              detachEffect: "clear-slot" as const,
              detach: (current: RegisteredSceneComponent) =>
                current.type === "xrift-component"
                  ? {
                      ...current,
                      assetReferences: current.assetReferences.filter(
                        (candidate) => candidate !== assetId,
                      ),
                    }
                  : current,
            },
          ]
        : [],
    );
  }

  return [];
}

function describeAssetOwnedReferences(
  asset: SceneAsset,
  assetId: string,
): AssetOwnedReferenceMatch[] {
  if (asset.kind === "material") {
    // One slot can be stored twice: the canonical glTF TextureInfo and the
    // deprecated `*TextureId` mirror normalization keeps beside it. They read as
    // one slot, so the row clears both rather than leaving half the binding.
    const pathsBySlot = new Map<string, string[]>();
    for (const entry of collectNestedAssetIds(asset.properties)) {
      if (entry.assetId !== assetId) continue;
      const label = materialTexturePathLabel(entry.path);
      pathsBySlot.set(label, [...(pathsBySlot.get(label) ?? []), entry.path]);
    }
    return [...pathsBySlot].map(([detail, paths]) => ({
      kind: "material-texture" as const,
      detail,
      detachEffect: "clear-slot" as const,
      detach: (current: SceneAsset) =>
        current.kind === "material"
          ? {
              ...current,
              properties: paths.reduce(
                (properties, path) => clearNestedAssetId(properties, path),
                current.properties,
              ),
            }
          : current,
    }));
  }

  if (asset.kind === "model") {
    return asset.materialSlots
      .filter((slot) => slot.defaultMaterialAssetId === assetId)
      .map((slot) => ({
        kind: "model-material" as const,
        detail: `Default material slot: ${slot.name}`,
        detachEffect: "clear-slot" as const,
        detach: (current: SceneAsset) =>
          current.kind === "model"
            ? {
                ...current,
                materialSlots: current.materialSlots.map((candidate) => {
                  if (
                    candidate.slot !== slot.slot ||
                    candidate.defaultMaterialAssetId !== assetId
                  ) {
                    return candidate;
                  }
                  const { defaultMaterialAssetId: _removed, ...rest } =
                    candidate;
                  return rest;
                }),
              }
            : current,
      }));
  }

  if (asset.kind === "particle") {
    const matches: AssetOwnedReferenceMatch[] = [];
    if (asset.properties.renderer.materialAssetId === assetId) {
      matches.push({
        kind: "particle-material",
        detail: "Renderer material",
        detachEffect: "clear-slot",
        detach: (current) =>
          current.kind === "particle"
            ? detachParticleRendererAsset(current, "materialAssetId")
            : current,
      });
    }
    if (asset.properties.renderer.textureAssetId === assetId) {
      matches.push({
        kind: "particle-texture",
        detail: "Renderer texture",
        detachEffect: "clear-slot",
        detach: (current) =>
          current.kind === "particle"
            ? detachParticleRendererAsset(current, "textureAssetId")
            : current,
      });
    }
    return matches;
  }

  return [];
}

function detachParticleRendererAsset(
  asset: ParticleAsset,
  field: "materialAssetId" | "textureAssetId",
): ParticleAsset {
  const { [field]: _removed, ...renderer } = asset.properties.renderer;
  return {
    ...asset,
    properties: { ...asset.properties, renderer },
  };
}

/**
 * Removes the Asset ID `collectNestedAssetIds` found at `path`.
 *
 * A glTF-shaped texture slot is an object whose only purpose is the Asset it
 * points at, so the slot object goes with it; the compatibility `*TextureId`
 * keys are plain strings and only the key is removed.
 */
function clearNestedAssetId<T>(properties: T, path: string): T {
  const segments = path.split(".").slice(1);
  const target =
    segments[segments.length - 1] === "textureAssetId"
      ? segments.slice(0, -1)
      : segments;
  if (target.length === 0) return properties;
  const clone = structuredCloneJson(properties);
  let current: Record<string, unknown> = clone as Record<string, unknown>;
  for (const segment of target.slice(0, -1)) {
    const next = current[segment];
    if (typeof next !== "object" || next === null) return clone;
    current = next as Record<string, unknown>;
  }
  delete current[target[target.length - 1]];
  return clone;
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
