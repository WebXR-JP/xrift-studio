import type { AssetManifest } from "./asset-manifest";
import type { SceneDocument } from "./scene-document";

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
    for (const entityId of Object.keys(scene.entities).sort()) {
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

function serializedEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
