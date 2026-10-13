import type { ChatgptWorldPlan } from "./chatgpt-world";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";
import { createStarterVisualProject } from "./starter-templates";
import type { ChatgptAssetOptions } from "../tauri";

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
  prompt: string;
  options: ChatgptAssetOptions;
  sourceProjectId: string;
  sourceSceneId?: string;
  projectId?: string;
  /** Scene that receives the edits; may differ from the source for a new world. */
  sceneId?: string;
  path?: string;
  name?: string;
  plan?: { title: string; description: string; objects: { name: string; shape: string }[] };
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
  const assetId = external ? assetIds.get(`${value.shape === "audio" ? "otogura" : "poly-haven"}:${value.externalId}`) : undefined;
  if (external && (!assetId || bundle.assets.assets[assetId]?.kind !== value.shape)) throw new Error(`${value.name}の素材を確認できません`);
  let materialAssetId = value.gltfMaterialId ?? (value.materialExternalId ? assetIds.get(`poly-haven:${value.materialExternalId}`) : undefined);
  if (value.materialExternalId || value.gltfMaterialId) {
    if (!materialAssetId || bundle.assets.assets[materialAssetId]?.kind !== "material") throw new Error(`${value.name}のマテリアルを確認できません`);
  }
  if (!external && !materialAssetId) {
    materialAssetId = Object.values(context.bundle.assets.assets).find(asset => asset.kind === "material")?.id;
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
