import type { SceneDocument, ScriptComponent } from "../scene-document";

/**
 * Deterministic script scheduling and collection.
 *
 * Update order is Entity hierarchy order, then Component order within an
 * Entity. It is computed from the document rather than taken from React mount
 * order, because a hot-reloaded Entity remounts and would otherwise move to
 * the end of the frame. Play and published output share this rule.
 */

export type ScheduledScript = {
  entityId: string;
  componentId: string;
  scriptAssetId: string;
  /** Lower runs first. */
  order: number;
};

export function collectScheduledScripts(
  scene: SceneDocument,
  options: { includeDisabled?: boolean } = {},
): ScheduledScript[] {
  const scheduled: ScheduledScript[] = [];
  const visited = new Set<string>();
  let order = 0;

  const visit = (entityId: string, ancestorEnabled: boolean) => {
    if (visited.has(entityId)) return;
    visited.add(entityId);
    const entity = scene.entities[entityId];
    if (!entity) return;
    const enabled = ancestorEnabled && entity.enabled;
    for (const component of entity.components) {
      if (component.type !== "script") continue;
      const script = component as ScriptComponent;
      if (!options.includeDisabled && (!enabled || !script.enabled)) {
        order += 1;
        continue;
      }
      scheduled.push({
        entityId,
        componentId: script.id,
        scriptAssetId: script.scriptAssetId,
        order,
      });
      order += 1;
    }
    entity.children.forEach((childId) => visit(childId, enabled));
  };

  scene.rootEntityIds.forEach((entityId) => visit(entityId, true));
  return scheduled;
}

/** Script Assets a Play run has to compile before it can start. */
export function collectRequiredScriptAssetIds(
  scene: SceneDocument,
): string[] {
  const ids = new Set<string>();
  for (const entry of collectScheduledScripts(scene)) {
    if (entry.scriptAssetId) ids.add(entry.scriptAssetId);
  }
  return [...ids].sort();
}

/**
 * Assets reachable through `asset` props.
 *
 * Resolved to URLs before Play starts so `ctx.getAssetUrl` can stay
 * synchronous; the underlying read is asynchronous IPC.
 */
export function collectScriptReferencedAssetIds(
  scene: SceneDocument,
): string[] {
  const ids = new Set<string>();
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "script" || !component.enabled) continue;
      for (const assetId of (component as ScriptComponent).assetReferences) {
        if (assetId) ids.add(assetId);
      }
    }
  }
  return [...ids].sort();
}
