import { assertWritableContext, prefabCopyGuidance, withPendingPrefabNotice, XriftMcpEditorToolError, type XriftMcpEditorContext, type XriftMcpEditorToolOutcome } from "./mcp-editor-tools";
import { applyChatgptR3fScene } from "./chatgpt-code-authoring";
import { ChatgptSceneConflictError } from "./chatgpt-plan-guards";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { rebaseChatgptStep } from "./chatgpt-generation";

/** The same atomic source conversion used by ChatGPT, inside a fresh MCP
 * revision lease. The Editor commits and autosaves only the complete outcome. */
export async function applyMcpR3fScene(context: XriftMcpEditorContext, args: Record<string, unknown>, checkCurrent: () => void): Promise<XriftMcpEditorToolOutcome> {
  assertWritableContext(context, args);
  checkCurrent();
  if (typeof args.name !== "string" || !args.name.trim() || [...args.name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(args.name)) {
    throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "nameには80文字以内の空でない名前を指定してください");
  }
  if (typeof args.source !== "string" || !args.source.trim()) throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "sourceには完全なR3Fの原本を指定してください");
  if (args.entityId !== undefined && args.entityId !== null && (typeof args.entityId !== "string" || !args.entityId.trim())) {
    throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "entityIdには制作原本を持つルートEntityのIDを指定してください");
  }
  // A placed Prefab copy has no source of its own; its shape lives in the original.
  const copy = typeof args.entityId === "string" && !context.bundle.scene.entities[args.entityId]?.codeAuthoring
    ? prefabCopyGuidance(context, args.entityId) : null;
  if (copy) throw new XriftMcpEditorToolError("R3F_SOURCE_INVALID", copy.message, { entityId: args.entityId, prefab: copy.prefab });
  try {
    const result = await applyChatgptR3fScene(context.bundle, { kind: "r3f-scene", name: args.name, source: args.source,
      ...(typeof args.entityId === "string" ? { entityId: args.entityId } : {}) }, { checkCurrent });
    checkCurrent();
    const changed = result.bundle !== context.bundle;
    const bundle = changed ? { ...result.bundle, project: { ...result.bundle.project, metadata: {
      ...result.bundle.project.metadata, updatedAt: context.now?.() ?? new Date().toISOString(),
    } } } : result.bundle;
    const authoring = bundle.scene.entities[result.entityId].codeAuthoring!;
    return withPendingPrefabNotice(context, "apply_r3f_scene", { changed, bundle, sceneSelection: changed ? { kind: "entity", id: result.entityId } : context.sceneSelection,
      assetSelection: changed ? null : context.assetSelection,
      result: { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, entityId: result.entityId, changed,
        revisionBefore: context.revision, revisionAfter: context.revision + Number(changed), sourceRevision: authoring.revision,
        entityCount: Object.keys(authoring.nodes).length, nextActions: ["get_entity_components", "capture_scene_view"] },
      activity: changed ? `「${args.name}」の形状と配置を原本から反映しました` : `「${args.name}」の原本による変更はありません` });
  } catch (error) {
    if (error instanceof XriftMcpEditorToolError) throw error;
    if (error instanceof ChatgptSceneConflictError) throw new XriftMcpEditorToolError("R3F_EDIT_CONFLICT", error.message);
    if (error instanceof ChatgptPlanInputError) throw new XriftMcpEditorToolError("R3F_SOURCE_INVALID", error.message);
    throw error;
  }
}

/** Called synchronously after the live lease check. Preserve thumbnails and
 * timestamps completed while the static compiler loaded, even for a no-op. */
export function rebaseMcpR3fOutcome(context: XriftMcpEditorContext, outcome: XriftMcpEditorToolOutcome,
  latest: XriftMcpEditorContext["bundle"], revision: number): XriftMcpEditorToolOutcome {
  let bundle = outcome.changed ? rebaseChatgptStep(context.bundle, outcome.bundle, latest) : latest;
  // Regenerating an unchanged palette can allocate a Material with a missing
  // thumbnail. Keep the latest derived image when its authored fields agree.
  if (outcome.changed && latest !== context.bundle) {
    const assets = { ...bundle.assets.assets };
    for (const [id, current] of Object.entries(latest.assets.assets)) {
      const generated = assets[id];
      if (!generated || generated === current) continue;
      const { thumbnail: _currentThumbnail, ...currentAuthoring } = current;
      const { thumbnail: _generatedThumbnail, ...generatedAuthoring } = generated;
      if (JSON.stringify(currentAuthoring) === JSON.stringify(generatedAuthoring)) assets[id] = current;
    }
    bundle = { ...bundle, assets: { ...bundle.assets, assets } };
  }
  return { ...outcome, bundle,
    result: { ...outcome.result, revisionBefore: revision, revisionAfter: revision + Number(outcome.changed) } };
}
