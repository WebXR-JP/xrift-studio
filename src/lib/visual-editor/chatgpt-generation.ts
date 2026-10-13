import type { ChatgptWorldPlan } from "./chatgpt-world";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";
import { createStarterVisualProject } from "./starter-templates";
import type { ChatgptAssetOptions } from "../tauri";
import { chatgptReferenceKey, type ChatgptOperation, type ChatgptResourceContext } from "./chatgpt-resources";
import { normalizeMaterialProperties } from "./asset-manifest";
import { mergeExternalStoreImport } from "./external-store";

/** Keep background previews and unrelated asset edits made during an async step. */
export function rebaseChatgptStep(before: XriftMcpEditorContext["bundle"], next: XriftMcpEditorContext["bundle"], latest: XriftMcpEditorContext["bundle"]) {
  if (before === latest) return next;
  const changedScene = next.scene !== before.scene;
  const changedPrefabs = next.prefabs !== before.prefabs;
  if (before.project.projectId !== latest.project.projectId || before.scene.sceneId !== latest.scene.sceneId
    || (changedScene && JSON.stringify(before.scene) !== JSON.stringify(latest.scene))
    || (changedPrefabs && JSON.stringify(before.prefabs) !== JSON.stringify(latest.prefabs))) {
    throw new Error("反映中に作品が編集されました。編集内容を保ち、依頼の反映を停止しました");
  }
  return { ...latest, scene: changedScene ? next.scene : latest.scene,
    prefabs: changedPrefabs ? next.prefabs : latest.prefabs,
    assets: mergeExternalStoreImport(before.assets, next.assets, latest.assets) };
}

export type ChatgptGenerationPhase = "planning" | "planned" | "preparing" | "importing" | "placing" | "saving" | "completed" | "failed" | "cancelled";
export type ChatgptGenerationMode = "build" | "plan";
export const CHATGPT_ALL_ASSETS: ChatgptAssetOptions = { models: true, materials: true, audio: true };
export type ChatgptGenerationEvent = {
  sequence: number;
  phase: ChatgptGenerationPhase;
  message: string;
  entityId?: string;
  name?: string;
};

/** Existing Entities retain their Components and identity. No raw document replacement. */
export function editChatgptEntity(bundle: XriftMcpEditorContext["bundle"], edit: NonNullable<ChatgptWorldPlan["edits"]>[number]) {
  if (!bundle.scene.entities[edit.entityId]) throw new Error("調整するEntityが現在のSceneにありません。Planを作り直してください");
  let current = bundle;
  let revision = 0;
  const apply = (tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) => {
    const outcome = executeXriftMcpEditorTool({ bundle: current, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision, saveStatus: "dirty" }, { id: crypto.randomUUID(), tool, arguments: { projectId: current.project.projectId, sceneId: current.scene.sceneId, expectedRevision: revision, entityId: edit.entityId, ...args } });
    current = outcome.bundle; revision += outcome.changed ? 1 : 0;
  };
  if (edit.position || edit.scale || edit.rotation) apply("update_transform", {
    ...(edit.position ? { position: edit.position } : {}), ...(edit.scale ? { scale: edit.scale } : {}),
    ...(edit.rotation ? { rotation: edit.rotation.map(n => n * Math.PI / 180) } : {}),
  });
  if (edit.name) apply("rename_entity", { name: edit.name });
  return { bundle: current, entityId: edit.entityId };
}
export type ChatgptGeneration = {
  generationId: string;
  status: "running" | "planned" | "completed" | "failed" | "cancelled";
  mode?: ChatgptGenerationMode;
  cancelling?: boolean;
  model: string;
  reasoningEffort?: string;
  sessionId?: string;
  createdAt?: string;
  revertedAt?: string;
  revertAvailable?: boolean;
  prompt: string;
  options: ChatgptAssetOptions;
  sourceProjectId: string;
  sourceSceneId?: string;
  projectId?: string;
  /** Scene that receives the edits; may differ from the source for a new world. */
  sceneId?: string;
  path?: string;
  name?: string;
  plan?: { title: string; description: string; hasMore?: boolean; remainingWork?: string; objects: { name: string; shape: string; detail?: string }[] };
  progress: { phase: ChatgptGenerationPhase; message: string; completed: number; total: number; recentEvents: ChatgptGenerationEvent[]; projectId?: string };
  error?: string;
  nextActions?: string[];
};

export function chatgptGenerationMatchesScene(job: ChatgptGeneration, projectId: string, sceneId: string) {
  return (job.projectId ?? job.sourceProjectId) === projectId &&
    ((job.sceneId ?? job.sourceSceneId) === undefined || (job.sceneId ?? job.sourceSceneId) === sceneId);
}

export function createChatgptScaffold(plan: ChatgptWorldPlan, name: string) {
  const starter = createStarterVisualProject("world", "blank", name);
  const entities = Object.fromEntries(Object.entries(starter.scene.entities).filter(([, entity]) => !entity.components.some(c => c.type === "mesh")));
  return { ...starter,
    project: { ...starter.project, metadata: { ...starter.project.metadata, title: plan.title, description: plan.description } },
    scene: { ...starter.scene, entities, rootEntityIds: starter.scene.rootEntityIds.filter(id => id in entities) },
    assets: { ...starter.assets, assets: {} },
  };
}

/** One atomic Editor history step per object, using the same operations as MCP. */
export function placeChatgptObject(bundle: XriftMcpEditorContext["bundle"], value: ChatgptWorldPlan["objects"][number], assetIds: ReadonlyMap<string, string>) {
  let context: XriftMcpEditorContext = { bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "dirty" };
  const apply = (tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) => {
    const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: {
      projectId: context.bundle.project.projectId, sceneId: context.bundle.scene.sceneId, expectedRevision: context.revision, ...args,
    } });
    context = { ...context, bundle: outcome.bundle, revision: context.revision + (outcome.changed ? 1 : 0) };
    return outcome.result;
  };
  const external = value.shape === "model" || value.shape === "audio";
  const reference = value.externalId ? chatgptReferenceKey(value.externalId, value.shape === "audio" ? "otogura" : "poly-haven") : undefined;
  const assetId = external && reference ? (reference.startsWith("project:") ? reference.slice(8) : assetIds.get(reference)) : undefined;
  if (external && (!assetId || bundle.assets.assets[assetId]?.kind !== value.shape)) throw new Error(`${value.name}の素材を確認できません`);
  const materialReference = value.materialExternalId ? chatgptReferenceKey(value.materialExternalId, "poly-haven") : undefined;
  let materialAssetId = value.gltfMaterialId ?? (materialReference ? (materialReference.startsWith("project:") ? materialReference.slice(8) : assetIds.get(materialReference)) : undefined);
  if (value.materialExternalId || value.gltfMaterialId) {
    if (!materialAssetId || bundle.assets.assets[materialAssetId]?.kind !== "material") throw new Error(`${value.name}のマテリアルを確認できません`);
  }
  if (!external && !materialAssetId) {
    // An unspecified primitive must not inherit an unrelated Sky/Water shader
    // merely because that Material is first in the current world's Assets.
    const defaultProperties = normalizeMaterialProperties({ pbrMetallicRoughness: { baseColorFactor: [0.82, 0.84, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.65 } });
    materialAssetId = Object.values(context.bundle.assets.assets).find(asset => asset.kind === "material"
      && JSON.stringify(asset.properties) === JSON.stringify(defaultProperties))?.id;
    if (!materialAssetId) {
      // The scaffold has no unused starter assets. Create the normal Editor
      // default material when the first primitive needs one, then reuse it.
      const created = apply("create_document_asset", { kind: "material" });
      const asset = created.asset;
      if (!asset || typeof asset !== "object" || typeof (asset as { id?: unknown }).id !== "string") throw new Error("既定のマテリアルを作成できませんでした");
      materialAssetId = (asset as { id: string }).id;
    }
  }
  const result = external ? apply("place_asset", { assetId, position: value.position }) : apply("create_primitive", { shape: value.shape, position: value.position, materialAssetId });
  if (typeof result.entityId !== "string") throw new Error(`${value.name}を配置できませんでした`);
  const entityId = result.entityId;
  if (external && materialAssetId) apply("set_material", { entityId, materialAssetId });
  if (value.shape === "audio") {
    const component = context.bundle.scene.entities[entityId]?.components.find(c => c.type === "audio-source");
    if (!component) throw new Error("Audio Sourceを作成できません");
    apply("update_component", { entityId, componentId: component.id, patch: { spatial: false, loop: true, autoplay: true, volume: 0.35 } });
  }
  apply("update_transform", { entityId, scale: value.scale, rotation: (value.rotation ?? (value.shape === "plane" ? [-90, 0, 0] : [0, 0, 0])).map(n => n * Math.PI / 180) });
  apply("rename_entity", { entityId, name: value.name });
  return { bundle: context.bundle, entityId };
}

/** Trusted operations keep the current Entity and its unrelated data intact. */
export async function applyChatgptOperation(bundle: XriftMcpEditorContext["bundle"], operation: ChatgptOperation,
  assetIds: ReadonlyMap<string, string>, resources: ChatgptResourceContext, projectPath?: string): Promise<{ bundle: typeof bundle; entityId?: string }> {
  const candidateId = "candidateId" in operation ? operation.candidateId : undefined;
  if (candidateId && resources.builtinCandidates.some(candidate => candidate.candidateId === candidateId)) {
    if (!["catalog", "material", "skybox"].includes(operation.kind) || !projectPath) throw new Error("素材を適用するためのプロジェクトを確認できませんでした");
    const builtin = await import("./chatgpt-builtin-catalog");
    return builtin.applyChatgptBuiltinOperation(bundle, operation as Extract<ChatgptOperation, { kind: "catalog" | "material" | "skybox" }>, projectPath);
  }
  if (operation.kind === "catalog") throw new Error("素材の候補を確認できませんでした。Planを作り直してください");
  let context: XriftMcpEditorContext = { bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "dirty" };
  const apply = (tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) => {
    const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: context.revision, ...args } });
    context = { ...context, bundle: outcome.bundle, revision: context.revision + (outcome.changed ? 1 : 0) };
    return outcome.result;
  };
  const assetId = candidateId ? (candidateId.startsWith("project:") ? candidateId.slice(8) : assetIds.get(candidateId)) : undefined;
  if (candidateId && (!assetId || !bundle.assets.assets[assetId])) throw new Error("適用する素材を確認できませんでした。Planを作り直してください");
  if (operation.kind === "skybox") {
    const { kind: _kind, candidateId: _candidate, ...skybox } = operation;
    const patch: Record<string, unknown> = { ...skybox };
    if (assetId) {
      const asset = bundle.assets.assets[assetId];
      if (asset.kind === "texture" || asset.kind === "skybox") {
        Object.assign(patch, { imageAssetId: assetId, materialAssetId: null, projection: "infinite", enabled: operation.enabled ?? true });
        if (asset.kind === "texture") patch.flipY = asset.importSettings.flipY;
      } else if (asset.kind === "material") Object.assign(patch, { materialAssetId: assetId, enabled: operation.enabled ?? true });
      else throw new Error("背景に使える素材を確認できませんでした");
    }
    apply("update_scene_settings", { skybox: patch });
    return { bundle: context.bundle };
  }
  const entityId = operation.entityId;
  if (operation.kind === "mesh-collision") apply("set_mesh_collision", { entityId, action: operation.action });
  else if (operation.kind === "model-attachment") apply("set_entity_model", { entityId, modelAssetId: assetId, componentId: operation.componentId });
  else if (operation.kind === "material") apply("set_material", { entityId, materialAssetId: assetId, meshComponentId: operation.componentId });
  else {
    const sources = bundle.scene.entities[entityId]?.components.filter(component => component.type === "audio-source") ?? [];
    let componentId = operation.componentId ?? (sources.length === 1 ? sources[0]?.id : undefined);
    if (!componentId && sources.length > 1) throw new Error("調整するAudio Sourceを選んでPlanを作り直してください");
    if (!componentId) {
      if (!assetId) throw new Error("追加するBGMの素材を選んでPlanを作り直してください");
      const added = apply("add_component", { entityId, definitionId: "core.audio-source" });
      if (typeof added.componentId !== "string") throw new Error("Audio Sourceを追加できませんでした");
      componentId = added.componentId;
    }
    const { kind: _kind, candidateId: _candidate, entityId: _entity, componentId: _component, ...patch } = operation;
    apply("update_component", { entityId, componentId, patch: { ...patch, ...(assetId ? { audioAssetId: assetId } : {}) } });
  }
  return { bundle: context.bundle, entityId };
}
