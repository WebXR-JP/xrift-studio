import type { AssetManifest } from "./asset-manifest";
import type {
  RegisteredSceneComponent,
  SceneDocument,
  SceneEntity,
} from "./scene-document";

export type PlayEntityReloadKind = "added" | "updated" | "removed";

export type PlayEntityReload = {
  entityId: string;
  kind: PlayEntityReloadKind;
  revision: number;
};

/**
 * Isolated document input for one Editor Play run.
 *
 * Runtime plugins keep their mutable state outside `runtimeScene`. Updating an
 * authoring Entity replaces the matching runtime input and increments only its
 * revision, so React/runtime adapters can restart that Entity without
 * remounting unrelated siblings.
 */
export type PlaySession = {
  sourceScene: SceneDocument;
  sourceAssets: AssetManifest;
  runtimeScene: SceneDocument;
  runtimeAssets: AssetManifest;
  entityRevisions: Readonly<Record<string, number>>;
  revision: number;
  lastReloads: readonly PlayEntityReload[];
};

export function createPlaySession(
  scene: SceneDocument,
  assets: AssetManifest,
): PlaySession {
  return {
    sourceScene: cloneSceneDocument(scene),
    sourceAssets: cloneAssetManifest(assets),
    runtimeScene: cloneSceneDocument(scene),
    runtimeAssets: cloneAssetManifest(assets),
    entityRevisions: Object.fromEntries(
      Object.keys(scene.entities).map((entityId) => [entityId, 0]),
    ),
    revision: 0,
    lastReloads: [],
  };
}

export function synchronizePlaySession(
  session: PlaySession,
  scene: SceneDocument,
  assets: AssetManifest,
): PlaySession {
  if (session.sourceScene.sceneId !== scene.sceneId) {
    return createPlaySession(scene, assets);
  }

  const entityIds = new Set([
    ...Object.keys(session.sourceScene.entities),
    ...Object.keys(scene.entities),
  ]);
  const entityRevisions = { ...session.entityRevisions };
  const reloads: PlayEntityReload[] = [];

  for (const entityId of [...entityIds].sort()) {
    const previous = session.sourceScene.entities[entityId];
    const next = scene.entities[entityId];
    if (serializedEqual(previous, next)) continue;
    // Script property values and Audio Source playback settings are live
    // inputs. Keep the Entity mounted so the runtime bridge can apply them on
    // the next render. References, source identity, spatial mode, component
    // order, Transform, hierarchy, and every other structural change still
    // take the targeted restart path below.
    if (
      previous &&
      next &&
      serializedEqual(
        withoutLiveRuntimeValues(previous),
        withoutLiveRuntimeValues(next),
      )
    ) {
      continue;
    }

    const revision = (entityRevisions[entityId] ?? 0) + 1;
    if (!next) delete entityRevisions[entityId];
    else entityRevisions[entityId] = revision;
    reloads.push({
      entityId,
      kind: !previous ? "added" : !next ? "removed" : "updated",
      revision,
    });
  }

  if (!serializedEqual(session.sourceAssets, assets)) {
    for (const entityId of collectAssetAffectedEntityIds(
      scene,
      session.sourceAssets,
      assets,
    )) {
      if (reloads.some((reload) => reload.entityId === entityId)) continue;
      const revision = (entityRevisions[entityId] ?? 0) + 1;
      entityRevisions[entityId] = revision;
      reloads.push({ entityId, kind: "updated", revision });
    }
  }

  if (
    reloads.length === 0 &&
    serializedEqual(session.sourceScene, scene) &&
    serializedEqual(session.sourceAssets, assets)
  ) {
    return session;
  }

  return {
    sourceScene: cloneSceneDocument(scene),
    sourceAssets: cloneAssetManifest(assets),
    runtimeScene: cloneSceneDocument(scene),
    runtimeAssets: cloneAssetManifest(assets),
    entityRevisions,
    revision: session.revision + 1,
    lastReloads: reloads,
  };
}

function cloneSceneDocument(scene: SceneDocument): SceneDocument {
  return JSON.parse(JSON.stringify(scene)) as SceneDocument;
}

function cloneAssetManifest(assets: AssetManifest): AssetManifest {
  return JSON.parse(JSON.stringify(assets)) as AssetManifest;
}

function withoutLiveRuntimeValues(entity: SceneEntity): SceneEntity {
  return {
    ...entity,
    components: entity.components.map((component) => {
      if (component.type === "script") {
        return { ...component, properties: {} };
      }
      if (component.type === "audio-source") {
        return {
          ...component,
          volume: 0,
          loop: false,
          autoplay: false,
          refDistance: 0,
          rolloffFactor: 0,
          maxDistance: 0,
        };
      }
      if (component.type === "light") {
        return {
          ...component,
          enabled: false,
          color: "",
          intensity: 0,
          castShadow: false,
          groundColor: "",
          distance: 0,
          decay: 0,
          angle: 0,
          penumbra: 0,
          width: 0,
          height: 0,
        };
      }
      return component;
    }),
  };
}

function serializedEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Asset edits restart only Entities that consume the changed Asset (directly
 * or through a Material / Particle / Model dependency). The isolated runtime
 * Asset snapshot still advances when an unreferenced Asset changes.
 */
function collectAssetAffectedEntityIds(
  scene: SceneDocument,
  previous: AssetManifest,
  next: AssetManifest,
): string[] {
  const changedAssetIds = new Set(
    [...new Set([
      ...Object.keys(previous.assets),
      ...Object.keys(next.assets),
    ])].filter(
      (assetId) =>
        !serializedEqual(previous.assets[assetId], next.assets[assetId]),
    ),
  );
  if (changedAssetIds.size === 0) return [];

  // If a Texture changes, a Material or Particle that owns that Texture is
  // effectively changed too. Expand backwards until the dependency graph is
  // stable so only its consumers remount.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const manifest of [previous, next]) {
      for (const asset of Object.values(manifest.assets)) {
        if (changedAssetIds.has(asset.id)) continue;
        if (
          collectAssetDependencies(asset).some((assetId) =>
            changedAssetIds.has(assetId),
          )
        ) {
          changedAssetIds.add(asset.id);
          expanded = true;
        }
      }
    }
  }

  return Object.values(scene.entities)
    .filter((entity) =>
      collectEntityAssetReferences(entity).some((assetId) =>
        changedAssetIds.has(assetId),
      ),
    )
    .map((entity) => entity.id)
    .sort();
}

function collectEntityAssetReferences(entity: SceneEntity): string[] {
  const references = new Set<string>();
  if (entity.modelNode?.modelAssetId) {
    references.add(entity.modelNode.modelAssetId);
  }
  for (const component of entity.components as RegisteredSceneComponent[]) {
    if (component.type === "mesh") {
      const geometryAssetId =
        component.geometry?.kind === "asset"
          ? component.geometry.assetId
          : component.geometry
            ? undefined
            : component.geometryAssetId;
      if (geometryAssetId) references.add(geometryAssetId);
      component.materialBindings.forEach((binding) =>
        references.add(binding.materialAssetId),
      );
    } else if (component.type === "particle-emitter") {
      references.add(component.particleAssetId);
    } else if (component.type === "audio-source" && component.audioAssetId) {
      references.add(component.audioAssetId);
    } else if (component.type === "prefab-instance") {
      references.add(component.prefabAssetId);
    } else if (
      component.type === "xrift-component" ||
      component.type === "script"
    ) {
      component.assetReferences.forEach((assetId) => references.add(assetId));
      if (component.type === "script") {
        references.add(component.scriptAssetId);
      }
    }
  }
  return [...references];
}

function collectAssetDependencies(asset: unknown): string[] {
  const references = new Set<string>();
  const visited = new Set<object>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if (key.endsWith("AssetId")) references.add(value);
      return;
    }
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
      return;
    }
    Object.entries(value).forEach(([childKey, child]) =>
      visit(child, childKey),
    );
  };
  visit(asset);
  return [...references];
}
