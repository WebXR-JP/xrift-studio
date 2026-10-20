import type { ChatgptWorldPlan } from "./chatgpt-world";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";
import { createStarterVisualProject } from "./starter-templates";
import type { ChatgptAssetOptions } from "../tauri";
import { chatgptReferenceKey, type ChatgptOperation, type ChatgptResourceContext } from "./chatgpt-resources";
import { normalizeMaterialProperties } from "./asset-manifest";
import { mergeExternalStoreImport } from "./external-store";
import { ChatgptSceneConflictError } from "./chatgpt-plan-guards";
import { normalizeChatgptSkyboxPatch } from "./chatgpt-skybox";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { applyChatgptEditorAction, type ChatgptEditorAction } from "./chatgpt-editor-actions";
import { applyChatgptSceneMaterial } from "./chatgpt-scene-material";
import { createSceneOperationRegistry, SceneOperationRegistryError, type SceneOperationPlugin } from "./chatgpt-operation-registry";

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

export type ChatgptGenerationPhase = "planning" | "planned" | "preparing" | "importing" | "placing" | "saving" | "completed" | "failed" | "cancelled";
export type ChatgptGenerationMode = "build" | "plan";
export const CHATGPT_ALL_ASSETS: ChatgptAssetOptions = { models: true, materials: true, audio: true };
export type ChatgptGenerationEvent = {
  sequence: number;
  phase: ChatgptGenerationPhase;
  message: string;
  entityId?: string;
  name?: string;
  saved?: boolean;
};

/** Existing Entities retain their Components and identity. No raw document replacement. */
export function editChatgptEntity(bundle: XriftMcpEditorContext["bundle"], edit: NonNullable<ChatgptWorldPlan["edits"]>[number]) {
  if (!bundle.scene.entities[edit.entityId]) throw new ChatgptPlanInputError("調整するEntityが現在のSceneにありません");
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
  engine?: "pi";
  generationId: string;
  harness?: import("./chatgpt-harness-runtime").ChatgptHarnessSnapshot;
  contextRefs?: import("./chatgpt-harness-context-ref").ChatgptHarnessContextRef[];
  status: "running" | "planned" | "completed" | "failed" | "cancelled";
  mode?: ChatgptGenerationMode;
  agentRounds?: number;
  
  cancelling?: boolean;
  model: string;
  reasoningEffort?: string;
  sessionId?: string;
  createdAt?: string;
  revertedAt?: string;
  revertAvailable?: boolean;
  prompt: string;
  attachedEntities?: { id: string; name: string }[];
  attachedMaterials?: { id: string; name: string }[];
  questionPreviews?: Record<string, import("./chatgpt-questions").ChatgptChoicePreview>;
  clarifications?: { question: string; answer: string; candidateId?: string }[];
  options: ChatgptAssetOptions;
  sourceProjectId: string;
  sourceSceneId?: string;
  projectId?: string;
  /** Scene that receives the edits; may differ from the source for a new world. */
  sceneId?: string;
  path?: string;
  name?: string;
  plan?: { title: string; description: string; hasMore?: boolean; remainingWork?: string; questions?: import("./chatgpt-questions").ChatgptQuestion[]; objects: { name: string; shape: string; preview?: import("./chatgpt-questions").ChatgptChoicePreview; detail?: string; saved?: boolean; entityId?: string; materialAssetId?: string; sceneSettingsSections?: ("skybox" | "fog")[]; settings?: import("./chatgpt-change-description").ChatgptSettingDisplay[] }[] };
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
  if (external && (!assetId || bundle.assets.assets[assetId]?.kind !== value.shape)) throw new ChatgptPlanInputError(`${value.name}の素材を確認できません`);
  const materialReference = value.materialExternalId ? chatgptReferenceKey(value.materialExternalId, "poly-haven") : undefined;
  let materialAssetId = value.gltfMaterialId ?? (materialReference ? (materialReference.startsWith("project:") ? materialReference.slice(8) : assetIds.get(materialReference)) : undefined);
  if (value.materialExternalId || value.gltfMaterialId) {
    if (!materialAssetId || bundle.assets.assets[materialAssetId]?.kind !== "material") throw new ChatgptPlanInputError(`${value.name}のマテリアルを確認できません`);
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

type ChatgptOperationResult = { bundle: XriftMcpEditorContext["bundle"]; entityId?: string };
type ChatgptOperationHost = {
  bundle: XriftMcpEditorContext["bundle"];
  assetIds: ReadonlyMap<string, string>;
  resources: ChatgptResourceContext;
  projectPath?: string;
  authoring?: { prompt?: string; originalPrompt?: string; brief?: string };
  execution?: import("./chatgpt-modeling").BlenderModelExecution;
};
type ChatgptOperationCapability = "scene-write" | "code-authoring" | "blender-authoring" | "project-files";
type ChatgptOperationPlugin = SceneOperationPlugin<ChatgptOperation, ChatgptOperationHost, ChatgptOperationResult, ChatgptOperationCapability>;

/** Exact, exhaustive built-in tool surface. No generated operation can select
 * an MCP method, a module path or an arbitrary function through this table. */
export const CHATGPT_SCENE_OPERATION_KINDS = ["r3f-scene", "blender-model", "catalog", "component-add", "component-update", "component-remove", "entity-delete",
  "material-update", "scene-settings", "material-scene", "skybox", "mesh-collision", "model-attachment", "material", "audio"] as const satisfies readonly ChatgptOperation["kind"][];
const missingOperationKinds: Record<Exclude<ChatgptOperation["kind"], typeof CHATGPT_SCENE_OPERATION_KINDS[number]>, never> = {};
void missingOperationKinds;

function editorOperationHost(host: ChatgptOperationHost) {
  let context: XriftMcpEditorContext = { bundle: host.bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "dirty" };
  return {
    get bundle() { return context.bundle; },
    apply(tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) {
      host.execution?.checkCurrent?.();
      const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: {
        projectId: host.bundle.project.projectId, sceneId: host.bundle.scene.sceneId, expectedRevision: context.revision, ...args,
      } });
      context = { ...context, bundle: outcome.bundle, revision: context.revision + (outcome.changed ? 1 : 0) };
      return outcome.result;
    },
  };
}

const isBuiltinOperation = (operation: { candidateId?: string }, host: ChatgptOperationHost) => Boolean(operation.candidateId
  && host.resources.builtinCandidates.some(candidate => candidate.candidateId === operation.candidateId));
const candidateCapabilities = (operation: { candidateId?: string }, host: ChatgptOperationHost): readonly ChatgptOperationCapability[] =>
  isBuiltinOperation(operation, host) ? ["scene-write", "project-files"] : ["scene-write"];
type BuiltinOperation = Extract<ChatgptOperation, { kind: "catalog" | "material" | "material-scene" | "skybox" }>;
async function applyBuiltinOperation(operation: BuiltinOperation, host: ChatgptOperationHost): Promise<ChatgptOperationResult | undefined> {
  if (!isBuiltinOperation(operation, host)) return undefined;
  if (!host.projectPath) throw new ChatgptPlanInputError("素材を適用するためのプロジェクトを確認できませんでした");
  const builtin = await import("./chatgpt-builtin-catalog");
  return builtin.applyChatgptBuiltinOperation(host.bundle, operation, host.projectPath);
}
function operationAssetId(operation: { candidateId?: string }, host: ChatgptOperationHost) {
  const candidateId = operation.candidateId;
  const assetId = candidateId ? candidateId.startsWith("project:") ? candidateId.slice(8) : host.assetIds.get(candidateId) : undefined;
  if (candidateId && (!assetId || !Object.prototype.hasOwnProperty.call(host.bundle.assets.assets, assetId))) throw new ChatgptPlanInputError("適用する素材を確認できませんでした");
  return assetId;
}
function applyEditorOperation(operation: ChatgptEditorAction, host: ChatgptOperationHost): ChatgptOperationResult {
  const editor = editorOperationHost(host);
  const entityId = applyChatgptEditorAction(operation, editor.bundle, editor.apply);
  return { bundle: editor.bundle, ...(entityId ? { entityId } : {}) };
}

const sceneOperationPlugins: readonly ChatgptOperationPlugin[] = [
  { kind: "r3f-scene", requiredCapabilities: ["scene-write", "code-authoring"], async execute(operation, host) {
    const { applyChatgptR3fScene } = await import("./chatgpt-code-authoring");
    return applyChatgptR3fScene(host.bundle, operation, { prompt: host.authoring?.prompt, checkCurrent: host.execution?.checkCurrent });
  } },
  { kind: "blender-model", requiredCapabilities: ["scene-write", "blender-authoring", "project-files"], async execute(operation, host) {
    const { bundle, resources, projectPath, authoring, execution } = host;
    if ("brief" in operation.model) throw new Error("モデルの詳細制作が完了していません");
    if (!projectPath || !resources.blenderAvailable || resources.modelSource === "store") throw new Error("Blenderでモデルを作成する設定を確認してください");
    const { createBlenderModelAsset } = await import("./chatgpt-modeling");
    const { resolveBlenderEntityModelAsset } = await import("./chatgpt-model-source");
    const previousTarget = operation.entityId ? resolveBlenderEntityModelAsset(bundle, operation.entityId, operation.componentId) : null;
    if (operation.entityId && previousTarget) {
      const { assertBlenderModelSourceCurrent } = await import("./chatgpt-model-integrity");
      assertBlenderModelSourceCurrent(bundle, operation.entityId, previousTarget.modelAssetId);
    }
    // Validate the target before generating files; replacement retains its Transform.
    if (operation.entityId) {
      const meshes = bundle.scene.entities[operation.entityId]?.components.filter(component => component.type === "mesh") ?? [];
      if ((!meshes.length && !previousTarget) || (operation.componentId ? !meshes.some(component => component.id === operation.componentId) : meshes.length > 1)
        || operation.position || operation.rotation || operation.scale) throw new ChatgptPlanInputError("置き換えるMesh Rendererを確認してください");
    } else if (!operation.position || operation.componentId) throw new ChatgptPlanInputError("モデルの配置先を確認してください");
    const previousMesh = operation.entityId ? bundle.scene.entities[operation.entityId]?.components.find(component => component.type === "mesh" && (!operation.componentId || component.id === operation.componentId)) : undefined;
    const previousGeometryId = previousMesh?.type === "mesh" ? previousMesh.geometry?.kind === "asset" ? previousMesh.geometry.assetId : previousMesh.geometryAssetId : undefined;
    const previousAssetId = previousTarget?.modelAssetId ?? (previousGeometryId && bundle.assets.assets[previousGeometryId]?.kind === "model" ? previousGeometryId : undefined);
    const imported = await createBlenderModelAsset(bundle, operation.model, projectPath, { ...authoring, previousAssetId }, execution);
    execution?.checkCurrent?.();
    if (operation.entityId && imported.bundle === bundle) return { bundle, entityId: operation.entityId };
    if (operation.entityId) return applyChatgptOperation(imported.bundle, { kind: "model-attachment", entityId: operation.entityId, componentId: operation.componentId, candidateId: `project:${imported.modelAssetId}` }, new Map(), resources, projectPath, authoring, execution);
    return placeChatgptObject(imported.bundle, { name: operation.model.name, shape: "model", externalId: `project:${imported.modelAssetId}`,
      position: operation.position!, rotation: operation.rotation, scale: operation.scale ?? [1, 1, 1] }, new Map());
  } },
  { kind: "catalog", requiredCapabilities: ["scene-write", "project-files"], async execute(operation, host) {
    const result = await applyBuiltinOperation(operation, host);
    if (!result) throw new ChatgptPlanInputError("素材の候補を確認できませんでした");
    return result;
  } },
  { kind: "component-add", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "component-update", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "component-remove", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "entity-delete", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "material-update", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "scene-settings", requiredCapabilities: ["scene-write"], execute: applyEditorOperation },
  { kind: "material-scene", requiredCapabilities: candidateCapabilities, async execute(operation, host) {
    const builtin = await applyBuiltinOperation(operation, host);
    if (builtin) return builtin;
    const assetId = operationAssetId(operation, host), editor = editorOperationHost(host);
    applyChatgptSceneMaterial(editor.bundle, assetId!, args => editor.apply("set_material", args));
    return { bundle: editor.bundle };
  } },
  { kind: "skybox", requiredCapabilities: candidateCapabilities, async execute(operation, host) {
    const builtin = await applyBuiltinOperation(operation, host);
    if (builtin) return builtin;
    const assetId = operationAssetId(operation, host), editor = editorOperationHost(host);
    const { kind: _kind, candidateId: _candidate, ...skybox } = operation;
    const patch: Record<string, unknown> = { ...skybox };
    if (assetId) {
      const asset = host.bundle.assets.assets[assetId];
      if (asset.kind === "texture" || asset.kind === "skybox") {
        Object.assign(patch, { imageAssetId: assetId, materialAssetId: null, projection: "infinite", enabled: operation.enabled ?? true });
        if (asset.kind === "texture") patch.flipY = asset.importSettings.flipY;
      } else if (asset.kind === "material") Object.assign(patch, { materialAssetId: assetId, enabled: operation.enabled ?? true });
      else throw new ChatgptPlanInputError("背景に使える素材を確認できませんでした");
    }
    editor.apply("update_scene_settings", { skybox: normalizeChatgptSkyboxPatch(editor.bundle, patch) });
    return { bundle: editor.bundle };
  } },
  { kind: "mesh-collision", requiredCapabilities: ["scene-write"], execute(operation, host) {
    const editor = editorOperationHost(host);
    editor.apply("set_mesh_collision", { entityId: operation.entityId, action: operation.action });
    return { bundle: editor.bundle, entityId: operation.entityId };
  } },
  { kind: "model-attachment", requiredCapabilities: ["scene-write"], execute(operation, host) {
    const assetId = operationAssetId(operation, host), editor = editorOperationHost(host);
    editor.apply("set_entity_model", { entityId: operation.entityId, modelAssetId: assetId, componentId: operation.componentId });
    return { bundle: editor.bundle, entityId: operation.entityId };
  } },
  { kind: "material", requiredCapabilities: candidateCapabilities, async execute(operation, host) {
    const builtin = await applyBuiltinOperation(operation, host);
    if (builtin) return builtin;
    const assetId = operationAssetId(operation, host), editor = editorOperationHost(host);
    editor.apply("set_material", { entityId: operation.entityId, materialAssetId: assetId, meshComponentId: operation.componentId });
    return { bundle: editor.bundle, entityId: operation.entityId };
  } },
  { kind: "audio", requiredCapabilities: ["scene-write"], execute(operation, host) {
    const entityId = operation.entityId, assetId = operationAssetId(operation, host), editor = editorOperationHost(host);
    const sources = host.bundle.scene.entities[entityId]?.components.filter(component => component.type === "audio-source") ?? [];
    let componentId = operation.componentId ?? (sources.length === 1 ? sources[0]?.id : undefined);
    if (!componentId && sources.length > 1) throw new ChatgptPlanInputError("Audio Sourceが複数あるため、調整するcomponentIdを選んでください");
    if (!componentId) {
      if (!assetId) throw new ChatgptPlanInputError("Audio Sourceを追加するには音声素材の候補が必要です");
      const added = editor.apply("add_component", { entityId, definitionId: "core.audio-source" });
      if (typeof added.componentId !== "string") throw new Error("Audio Sourceを追加できませんでした");
      componentId = added.componentId;
    }
    const { kind: _kind, candidateId: _candidate, entityId: _entity, componentId: _component, ...patch } = operation;
    editor.apply("update_component", { entityId, componentId, patch: { ...patch, ...(assetId ? { audioAssetId: assetId } : {}) } });
    return { bundle: editor.bundle, entityId };
  } },
];

const sceneOperationRegistry = createSceneOperationRegistry<ChatgptOperation, ChatgptOperationHost, ChatgptOperationResult, ChatgptOperationCapability>({
  kinds: CHATGPT_SCENE_OPERATION_KINDS, plugins: sceneOperationPlugins,
});

/** Compatibility adapter for the live Editor driver. Registry dispatch keeps
 * every operation on one trusted handler and checks authoring capabilities
 * before any async import, native call or Scene mutation. */
export async function applyChatgptOperation(bundle: XriftMcpEditorContext["bundle"], operation: ChatgptOperation,
  assetIds: ReadonlyMap<string, string>, resources: ChatgptResourceContext, projectPath?: string,
  authoring?: ChatgptOperationHost["authoring"], execution?: ChatgptOperationHost["execution"]): Promise<ChatgptOperationResult> {
  execution?.checkCurrent?.();
  const capabilities = new Set<ChatgptOperationCapability>(["scene-write"]);
  if (resources.modelSource !== "store") capabilities.add("code-authoring");
  if (projectPath) capabilities.add("project-files");
  if (resources.modelSource !== "store" && resources.blenderAvailable && projectPath) capabilities.add("blender-authoring");
  try {
    const result = await sceneOperationRegistry.dispatch(operation, { bundle, assetIds, resources, projectPath, authoring, execution }, capabilities);
    execution?.checkCurrent?.();
    return result;
  } catch (error) {
    if (error instanceof SceneOperationRegistryError) throw new ChatgptPlanInputError(error.message);
    throw error;
  }
}
