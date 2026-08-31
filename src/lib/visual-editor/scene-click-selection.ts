import type { SceneDocument } from "./scene-document";

/**
 * Everything one Scene View click saw, resolved before selection is decided.
 *
 * `rayEntityIds` are the authoring Entity ids of every surface the pick ray
 * crossed, front to back and deduplicated. `originEntityIds` are Entities whose
 * origin projects within the origin-assist radius of the click, nearest first;
 * they are how mesh-less Entities (colliders, lights, empties) buried inside a
 * larger mesh stay reachable. `fallbackEntityId` is what the click selects when
 * no drill-down applies — the frontmost surface, or the origin-assist pick.
 */
export type SceneClickPick = {
  rayEntityIds: readonly string[];
  originEntityIds: readonly string[];
  fallbackEntityId: string | null;
};

/** True when `entityId` sits strictly below `ancestorId` in the Entity tree. */
export function isEntityDescendantOf(
  scene: SceneDocument,
  entityId: string,
  ancestorId: string,
): boolean {
  if (entityId === ancestorId) return false;
  const seen = new Set<string>();
  let parentId = scene.entities[entityId]?.parentId ?? null;
  while (parentId !== null) {
    if (parentId === ancestorId) return true;
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    parentId = scene.entities[parentId]?.parentId ?? null;
  }
  return false;
}

/**
 * Decides what a left click selects, drilling into the current selection.
 *
 * A large Entity whose mesh encloses its children swallows every ray: the
 * frontmost surface is always its own, so nested content is unreachable by
 * clicking alone. Clicking an Entity that is already selected therefore
 * re-aims the same ray at its subtree — the nearest surface belonging to a
 * strict descendant wins, and when no descendant surface is on the ray, the
 * nearest descendant origin near the click (mesh-less colliders and empties)
 * wins instead. Each click steps one visible surface deeper, so "island →
 * stairs → one stair" is repeated clicks on the same spot.
 *
 * The drill anchors only when the frontmost surface is the selection itself or
 * one of its ancestors (the selection is buried under it). Clicking anything
 * unrelated — including a visible descendant — keeps the picker's normal
 * frontmost behavior, and clicking the buried selection again keeps it
 * selected instead of bouncing back to its ancestor.
 */
export function resolveSceneClickSelection(
  scene: SceneDocument,
  currentEntityId: string | null,
  pick: SceneClickPick,
): string | null {
  const first = pick.rayEntityIds[0] ?? null;
  if (!currentEntityId || !scene.entities[currentEntityId]) {
    return pick.fallbackEntityId;
  }
  const anchored =
    first !== null &&
    (first === currentEntityId ||
      isEntityDescendantOf(scene, currentEntityId, first));
  if (!anchored) return pick.fallbackEntityId;
  const surfaceDescendant = pick.rayEntityIds.find((id) =>
    isEntityDescendantOf(scene, id, currentEntityId),
  );
  if (surfaceDescendant) return surfaceDescendant;
  const originDescendant = pick.originEntityIds.find((id) =>
    isEntityDescendantOf(scene, id, currentEntityId),
  );
  if (originDescendant) return originDescendant;
  if (
    first === currentEntityId ||
    pick.rayEntityIds.includes(currentEntityId)
  ) {
    return currentEntityId;
  }
  return pick.fallbackEntityId;
}
