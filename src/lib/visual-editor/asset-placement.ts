import type {
  AssetManifest,
  ModelAsset,
  ParticleAsset,
  PrefabAsset,
  SceneAsset,
} from "./asset-manifest";
import { createDocumentId } from "./document-id";
import {
  createPrefabInstanceComponent,
  type PrefabDocument,
} from "./prefab-document";
import {
  createMeshColliderComponent,
  createMeshComponent,
  createParticleEmitterComponent,
  createTransformComponent,
  type MaterialBinding,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

export type SceneAssetPlacementResult =
  | {
      placed: true;
      scene: SceneDocument;
      entityId: string;
      assetName: string;
      assetKind: "model" | "particle" | "prefab";
    }
  | {
      placed: false;
      scene: SceneDocument;
      reason:
        | "asset-missing"
        | "unsupported-kind"
        | "parent-missing"
        | "prefab-document-missing"
        | "prefab-empty";
    };

export function isScenePlaceableAsset(
  asset: SceneAsset | undefined,
): asset is ModelAsset | ParticleAsset | PrefabAsset {
  return Boolean(
    asset &&
      (asset.kind === "model" ||
        asset.kind === "particle" ||
        (asset.kind === "template" && asset.templateType === "prefab")),
  );
}

/**
 * Instantiates a project Model or Prefab Asset as a Scene Entity. Browser D&D
 * surfaces share this function so hierarchy and viewport placement produce the
 * same IR and can be committed as one editor-history transaction.
 */
export function instantiateSceneAsset(
  scene: SceneDocument,
  assets: AssetManifest,
  prefabs: Readonly<Record<string, PrefabDocument>>,
  assetId: string,
  options: { position?: Vec3; parentEntityId?: string | null } = {},
): SceneAssetPlacementResult {
  const asset = assets.assets[assetId];
  if (!asset) return { placed: false, scene, reason: "asset-missing" };
  const parentEntityId = options.parentEntityId ?? null;
  if (parentEntityId !== null && !scene.entities[parentEntityId]) {
    return { placed: false, scene, reason: "parent-missing" };
  }

  const entityId = createDocumentId("entity");
  const position = options.position ?? [0, 0, 0];
  let entity: SceneEntity;
  let assetKind: "model" | "particle" | "prefab";

  if (!isScenePlaceableAsset(asset)) {
    return { placed: false, scene, reason: "unsupported-kind" };
  }

  if (asset.kind === "model") {
    entity = createModelEntity(
      scene,
      entityId,
      asset,
      assets,
      position,
      parentEntityId,
    );
    assetKind = "model";
  } else if (asset.kind === "particle") {
    entity = createParticleEntity(
      scene,
      entityId,
      asset,
      position,
      parentEntityId,
    );
    assetKind = "particle";
  } else if (asset.kind === "template") {
    const prefabAsset = asset;
    const prefab = resolvePrefabDocument(prefabAsset, prefabs);
    if (!prefab) {
      return { placed: false, scene, reason: "prefab-document-missing" };
    }
    const sourceEntityId = prefab.rootEntityIds[0];
    if (!sourceEntityId) return { placed: false, scene, reason: "prefab-empty" };
    const instance = createPrefabInstanceComponent(
      createDocumentId("component-prefab-instance"),
      prefabAsset.id,
      sourceEntityId,
    );
    if (!instance) return { placed: false, scene, reason: "prefab-empty" };
    entity = {
      id: entityId,
      name: uniqueEntityName(scene, prefabAsset.name),
      parentId: parentEntityId,
      children: [],
      enabled: true,
      components: [
        createTransformComponent(
          createDocumentId("component-transform"),
          position,
        ),
        instance,
      ],
    };
    assetKind = "prefab";
  } else {
    return { placed: false, scene, reason: "unsupported-kind" };
  }

  const entities = { ...scene.entities, [entityId]: entity };
  if (parentEntityId !== null) {
    const parent = entities[parentEntityId];
    entities[parentEntityId] = {
      ...parent,
      children: [...parent.children, entityId],
    };
  }
  return {
    placed: true,
    assetKind,
    assetName: asset.name,
    entityId,
    scene: {
      ...scene,
      entities,
      rootEntityIds:
        parentEntityId === null
          ? [...scene.rootEntityIds, entityId]
          : scene.rootEntityIds,
    },
  };
}

function createParticleEntity(
  scene: SceneDocument,
  entityId: string,
  asset: ParticleAsset,
  position: Vec3,
  parentEntityId: string | null,
): SceneEntity {
  const emitter = createParticleEmitterComponent(
    createDocumentId("component-particle-emitter"),
    asset.id,
  );
  return {
    id: entityId,
    name: uniqueEntityName(scene, asset.name),
    parentId: parentEntityId,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        position,
      ),
      ...(emitter ? [emitter] : []),
    ],
  };
}

function createModelEntity(
  scene: SceneDocument,
  entityId: string,
  asset: ModelAsset,
  assets: AssetManifest,
  position: Vec3,
  parentEntityId: string | null,
): SceneEntity {
  const materialBindings: MaterialBinding[] = asset.materialSlots.flatMap(
    (slot) =>
      slot.defaultMaterialAssetId &&
      assets.assets[slot.defaultMaterialAssetId]?.kind === "material"
        ? [{ slot: slot.slot, materialAssetId: slot.defaultMaterialAssetId }]
        : [],
  );
  return {
    id: entityId,
    name: uniqueEntityName(scene, asset.name),
    parentId: parentEntityId,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        position,
      ),
      createMeshComponent(
        createDocumentId("component-mesh"),
        asset.id,
        materialBindings,
      ),
      ...(asset.importSettings.generateColliders
        ? [
            createMeshColliderComponent(
              createDocumentId("component-collider"),
              { meshMode: "trimesh" },
            ),
          ]
        : []),
    ],
  };
}

function resolvePrefabDocument(
  asset: PrefabAsset,
  prefabs: Readonly<Record<string, PrefabDocument>>,
): PrefabDocument | undefined {
  const pathId = asset.prefabPath
    .slice(asset.prefabPath.lastIndexOf("/") + 1)
    .replace(/\.prefab\.json$/, "");
  return prefabs[pathId];
}

function uniqueEntityName(scene: SceneDocument, name: string): string {
  const base = name.trim() || "Asset";
  const names = new Set(
    Object.values(scene.entities).map((entity) => entity.name.toLocaleLowerCase()),
  );
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}
