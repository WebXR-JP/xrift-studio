import {
  resolvePrefabInstances,
  type AssetManifest,
  type PrefabDocument,
  type SceneDocument,
} from "../../lib/visual-editor";

export type SceneViewportPreview = {
  scene: SceneDocument;
  authoringEntityIdByEntityId: Readonly<Record<string, string>>;
};

/** Expands Prefabs for preview without mutating the authoring Scene. */
export function createSceneViewportPreview(
  scene: SceneDocument,
  assets: AssetManifest,
  prefabs: Readonly<Record<string, PrefabDocument>>,
): SceneViewportPreview {
  const previewScene = resolvePrefabInstances(scene, assets, prefabs).scene;
  const authoringIds = new Set(Object.keys(scene.entities));
  const memo = new Map<string, string>();

  const findAuthoringEntityId = (
    entityId: string,
    active: Set<string> = new Set(),
  ): string => {
    const cached = memo.get(entityId);
    if (cached) return cached;
    if (authoringIds.has(entityId)) {
      memo.set(entityId, entityId);
      return entityId;
    }
    if (active.has(entityId)) return entityId;
    active.add(entityId);
    const parentId = previewScene.entities[entityId]?.parentId;
    const resolved = parentId
      ? findAuthoringEntityId(parentId, active)
      : entityId;
    active.delete(entityId);
    memo.set(entityId, resolved);
    return resolved;
  };

  const authoringEntityIdByEntityId = Object.fromEntries(
    Object.keys(previewScene.entities).map((entityId) => [
      entityId,
      findAuthoringEntityId(entityId),
    ]),
  );
  return { scene: previewScene, authoringEntityIdByEntityId };
}
