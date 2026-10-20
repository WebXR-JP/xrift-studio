import type { XriftMcpEditorContext } from "./mcp-editor-tools";
import { mergeExternalStoreImport } from "./external-store";
import { ChatgptSceneConflictError } from "./chatgpt-plan-guards";

const equalAuthoredValue = (left: unknown, right: unknown) => left === right || JSON.stringify(left) === JSON.stringify(right);
function mergeChangedEntries<T extends object>(before: T, next: T, latest: T): T {
  const merged = { ...latest } as Record<string, unknown>;
  const oldValues = before as Record<string, unknown>, newValues = next as Record<string, unknown>, currentValues = latest as Record<string, unknown>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (equalAuthoredValue(oldValues[key], newValues[key])) continue;
    if (!equalAuthoredValue(oldValues[key], currentValues[key])) throw new ChatgptSceneConflictError("変更するEntity・設定・Prefabが制作中に編集されました。編集内容を保ち、現在のSceneから制作を続けます");
    if (key in newValues) merged[key] = newValues[key];
    else delete merged[key];
  }
  return merged as T;
}
function mergeRootEntityIds(before: string[], next: string[], latest: string[]): string[] {
  if (equalAuthoredValue(before, next)) return latest;
  if (equalAuthoredValue(before, latest)) return next;
  // Independent additions/removals preserve each other's roots. Reordering
  // existing roots still requires a new plan rather than guessing an order.
  const preservesOrder = (value: string[]) => equalAuthoredValue(value.filter(id => before.includes(id)), before.filter(id => value.includes(id)));
  if (preservesOrder(next) && preservesOrder(latest)) {
    const removed = new Set(before.filter(id => !next.includes(id)));
    return [...latest.filter(id => !removed.has(id)), ...next.filter(id => !before.includes(id) && !latest.includes(id))];
  }
  throw new ChatgptSceneConflictError("Entityの階層が制作中に編集されました。編集内容を保ち、現在のSceneから制作を続けます");
}

/** Merge separate author edits; conflicts on the same authored data need a fresh plan. */
export function rebaseChatgptStep(before: XriftMcpEditorContext["bundle"], next: XriftMcpEditorContext["bundle"], latest: XriftMcpEditorContext["bundle"]) {
  if (before === latest) return next;
  const changedScene = next.scene !== before.scene;
  if (before.project.projectId !== latest.project.projectId || before.scene.sceneId !== latest.scene.sceneId) {
    throw new Error("反映中に作品が編集されました。編集内容を保ち、依頼の反映を停止しました");
  }
  let scene = latest.scene;
  if (changedScene) {
    const { entities: _oldEntities, rootEntityIds: _oldRoots, settings: _oldSettings, ...oldFields } = before.scene;
    const { entities: _nextEntities, rootEntityIds: _nextRoots, settings: _nextSettings, ...nextFields } = next.scene;
    const { entities: _latestEntities, rootEntityIds: _latestRoots, settings: _latestSettings, ...latestFields } = latest.scene;
    scene = { ...mergeChangedEntries(oldFields, nextFields, latestFields),
      entities: mergeChangedEntries(before.scene.entities, next.scene.entities, latest.scene.entities),
      rootEntityIds: mergeRootEntityIds(before.scene.rootEntityIds, next.scene.rootEntityIds, latest.scene.rootEntityIds),
      ...(before.scene.settings || next.scene.settings || latest.scene.settings ? {
        settings: mergeChangedEntries(before.scene.settings ?? {}, next.scene.settings ?? {}, latest.scene.settings ?? {}) as NonNullable<XriftMcpEditorContext["bundle"]["scene"]["settings"]>,
      } : {}),
    };
  }
  let assets;
  try { assets = mergeExternalStoreImport(before.assets, next.assets, latest.assets); }
  catch (error) { throw new ChatgptSceneConflictError(error instanceof Error ? error.message : String(error)); }
  return { ...latest, scene, prefabs: mergeChangedEntries(before.prefabs, next.prefabs, latest.prefabs), assets };
}

/** Compatibility names for document operations and previously stored requests. */
export type { PiRunPhase as ChatgptGenerationPhase, PiMode as ChatgptGenerationMode, PiRunEvent as ChatgptGenerationEvent, PiAuthoringRun as ChatgptGeneration } from "./pi-authoring";
import type { PiAuthoringRun as ChatgptGeneration } from "./pi-authoring";
export { PI_ALL_ASSETS as CHATGPT_ALL_ASSETS } from "./pi-authoring";

export function chatgptGenerationMatchesScene(job: ChatgptGeneration, projectId: string, sceneId: string) {
  return (job.projectId ?? job.sourceProjectId) === projectId &&
    ((job.sceneId ?? job.sourceSceneId) === undefined || (job.sceneId ?? job.sourceSceneId) === sceneId);
}
