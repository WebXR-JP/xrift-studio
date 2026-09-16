import { createDocumentId } from "./document-id";
import {
  cloneEntityHierarchy,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

export const ENTITY_MIRROR_AXES = ["x", "y", "z"] as const;
export type EntityMirrorAxis = (typeof ENTITY_MIRROR_AXES)[number];

export type EntityPasteOptions = {
  /** Reflect each copied root about its own local origin, not the scene origin. */
  mirrorAxis?: EntityMirrorAxis;
};

export type EntityClipboard = {
  /** Immutable authoring snapshot: subsequent edits do not change the copy. */
  scene: SceneDocument;
  rootEntityIds: string[];
};

/** A selected child of a selected parent must not be cloned or reflected twice. */
export function getEntityClipboardRoots(
  scene: SceneDocument,
  entityIds: readonly string[],
): string[] {
  const selected = new Set(entityIds.filter((id) => Boolean(scene.entities[id])));
  return [...selected].filter((id) => {
    const visited = new Set([id]);
    let parentId = scene.entities[id].parentId;
    while (parentId && !visited.has(parentId)) {
      if (selected.has(parentId)) return false;
      visited.add(parentId);
      parentId = scene.entities[parentId]?.parentId ?? null;
    }
    return true;
  });
}

/** Shared animation/bone nodes have no independent renderer to duplicate. */
export function getEntityCopyDisabledReason(scene: SceneDocument, rootEntityIds: readonly string[]): string | null {
  const copied = new Set<string>();
  const visit = (id: string) => {
    if (copied.has(id) || !scene.entities[id]) return;
    copied.add(id);
    scene.entities[id].children.forEach(visit);
  };
  rootEntityIds.forEach(visit);
  for (const id of copied) {
    const owner = scene.entities[id].modelNode?.modelEntityId;
    if (owner && !copied.has(owner)) {
      return "このノードはモデルの一部です。Hierarchyでモデル全体を選択してコピーしてください";
    }
  }
  return null;
}

export function copyEntityHierarchy(
  scene: SceneDocument,
  rootEntityIds: readonly string[],
): EntityClipboard | null {
  const validRoots = getEntityClipboardRoots(scene, rootEntityIds);
  if (getEntityCopyDisabledReason(scene, validRoots)) return null;
  return validRoots.length > 0 ? { scene, rootEntityIds: validRoots } : null;
}

/** An undefined parent preserves each source root's parent (used by Duplicate). */
export function pasteEntityHierarchy(
  scene: SceneDocument,
  clipboard: EntityClipboard,
  parentId: string | null | undefined,
  options: EntityPasteOptions = {},
): { scene: SceneDocument; rootEntityIds: string[] } | null {
  if (parentId != null && !scene.entities[parentId]) return null;
  const axisIndex = options.mirrorAxis === undefined
    ? -1
    : ENTITY_MIRROR_AXES.indexOf(options.mirrorAxis);
  if (options.mirrorAxis !== undefined && axisIndex < 0) return null;
  const roots = getEntityClipboardRoots(clipboard.scene, clipboard.rootEntityIds);
  if (getEntityCopyDisabledReason(clipboard.scene, roots)) return null;
  const clone = cloneEntityHierarchy(
    clipboard.scene,
    roots,
    (kind) => createDocumentId(kind),
  );
  if (!clone) return null;
  const rootSet = new Set(clone.rootEntityIds);
  const sourceParents = new Map(roots.map((id) => [clone.entityIdMap[id], clipboard.scene.entities[id].parentId]));
  const clonedEntities: Record<string, SceneEntity> = {};
  for (const [id, entity] of Object.entries(clone.entities)) {
    if (scene.entities[id]) return null;
    if (!rootSet.has(id)) {
      clonedEntities[id] = entity;
      continue;
    }
    const sourceParent = sourceParents.get(id) ?? null;
    const targetParent = parentId === undefined
      ? sourceParent && scene.entities[sourceParent] ? sourceParent : null
      : parentId;
    const root = { ...entity, parentId: targetParent };
    if (axisIndex >= 0) {
      // Only the root changes. Its descendants inherit the reflection, and
      // animation, materials, prefab links and component references stay intact.
      const transform = root.components.find((component) => component.type === "transform");
      if (!transform || !transform.scale.every(Number.isFinite)) return null;
      const scale: Vec3 = [...transform.scale];
      scale[axisIndex] = scale[axisIndex] === 0 ? 0 : -scale[axisIndex];
      root.components = root.components.map((component) =>
        component === transform ? { ...transform, scale } : component,
      );
    }
    clonedEntities[id] = root;
  }
  const entities = { ...scene.entities, ...clonedEntities };
  const insertedSceneRoots: string[] = [];
  for (const id of clone.rootEntityIds) {
    const targetParent = clonedEntities[id].parentId;
    if (targetParent === null) {
      insertedSceneRoots.push(id);
    } else {
      const parent = entities[targetParent];
      entities[targetParent] = { ...parent, children: [...parent.children, id] };
    }
  }
  return {
    rootEntityIds: clone.rootEntityIds,
    scene: {
      ...scene,
      rootEntityIds: insertedSceneRoots.length > 0
        ? [...scene.rootEntityIds, ...insertedSceneRoots]
        : scene.rootEntityIds,
      entities,
    },
  };
}
