import type { ExternalStoreAsset } from "../tauri";
import { parseBlenderModel, type BlenderModelSpec, type BlenderModelBrief } from "./chatgpt-modeling";
import { CHATGPT_EDITOR_ACTIONS, validateChatgptEditorAction, type ChatgptEditorAction } from "./chatgpt-editor-actions";
import type { JsonValue, SceneComponent } from "./scene-document";

export type ChatgptResourceKind = "model" | "material" | "audio" | "hdri";
export type ChatgptBuiltinAction = "catalog" | "material" | "skybox";
export type ChatgptBuiltinCandidate = {
  candidateId: string;
  providerId: string;
  name: string;
  description: string;
  actions: ChatgptBuiltinAction[];
};
export type ChatgptResourceContext = {
  blenderAvailable?: boolean;
  modelSource?: "auto" | "blender" | "store";
  currentSettingsJson?: string;
  componentDefinitions?: { id: string; label: string; description: string; fields: Record<string, JsonValue>[]; fieldsFrom?: string }[];
  projectAssets: { id: string; kind: ChatgptResourceKind; name: string; skyboxMaterial?: boolean; attached?: boolean; propertiesJson?: string }[];
  builtinCandidates: ChatgptBuiltinCandidate[];
  components: {
    entityId: string;
    componentId: string;
    type: SceneComponent["type"];
    definitionId?: string;
    propertiesJson?: string;
    enabled?: boolean;
    modelAssetId?: string;
    audio?: { audioAssetId?: string; enabled: boolean; volume: number; loop: boolean; spatial: boolean; autoplay: boolean };
  }[];
  sceneSettings?: {
    skybox: { enabled: boolean; iblEnabled: boolean; imageAssetId?: string; materialAssetId?: string; rotationDegrees: number; exposure: number };
  };
};
/** References are catalog keys, never paths or download URLs. */
export const chatgptProjectCandidateId = (assetId: string) => `project:${assetId}`;
export const chatgptExternalCandidateId = (asset: Pick<ExternalStoreAsset, "providerId" | "externalId">) => `${asset.providerId}:${asset.externalId}`;
export function chatgptReferenceKey(reference: string, legacyProviderId: string) {
  return reference.includes(":") ? reference : `${legacyProviderId}:${reference}`;
}

export type ChatgptOperation =
  | ChatgptEditorAction
  | { kind: "skybox"; candidateId?: string; enabled?: boolean; iblEnabled?: boolean; rotationDegrees?: number; exposure?: number }
  | { kind: "audio"; entityId: string; componentId?: string; candidateId?: string; enabled?: boolean; volume?: number; loop?: boolean; spatial?: boolean; autoplay?: boolean }
  | { kind: "mesh-collision"; entityId: string; action: "add" | "remove" }
  | { kind: "model-attachment"; entityId: string; componentId?: string; candidateId: string }
  | { kind: "material"; entityId: string; componentId?: string; candidateId: string }
  | { kind: "material-scene"; candidateId: string }
  | { kind: "catalog"; candidateId: string; name?: string; position: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }
  | { kind: "blender-model"; model: BlenderModelSpec | BlenderModelBrief; entityId?: string; componentId?: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] };

export type ChatgptCatalogSearchRequest = {
  providerId: "poly-haven" | "ambient-cg" | "ai-lowpoly-props" | "otogura";
  kind: "model" | "texture" | "audio" | "hdri";
  query: string;
};

export const CHATGPT_REMOTE_KINDS: Readonly<Record<string, readonly string[]>> = {
  "poly-haven": ["model", "texture", "hdri"],
  "ambient-cg": ["texture", "hdri"],
  "ai-lowpoly-props": ["model"],
  otogura: ["audio"],
};
export type ChatgptCandidate =
  | { source: "project"; asset: ChatgptResourceContext["projectAssets"][number] }
  | { source: "external"; asset: ExternalStoreAsset }
  | { source: "builtin"; asset: ChatgptBuiltinCandidate };

export function resolveChatgptCandidate(candidateId: string, resources: ChatgptResourceContext | undefined,
  external: readonly ExternalStoreAsset[] = [], legacyProviderId?: string): ChatgptCandidate | undefined {
  const project = resources?.projectAssets.find(asset => chatgptProjectCandidateId(asset.id) === candidateId);
  if (project) return { source: "project", asset: project };
  const builtin = resources?.builtinCandidates.find(asset => asset.candidateId === candidateId);
  if (builtin) return { source: "builtin", asset: builtin };
  const remote = external.find(asset => CHATGPT_REMOTE_KINDS[asset.providerId]?.includes(asset.assetKind)
    && (chatgptExternalCandidateId(asset) === candidateId || (asset.providerId === legacyProviderId && asset.externalId === candidateId)));
  return remote ? { source: "external", asset: remote } : undefined;
}

export function chatgptCandidateSupports(candidate: ChatgptCandidate | undefined, action: ChatgptResourceKind | "catalog" | "skybox") {
  if (!candidate) return false;
  if (candidate.source === "builtin") return candidate.asset.actions.includes(action === "hdri" ? "skybox" : action as ChatgptBuiltinAction);
  if (action === "catalog") return false;
  if (candidate.source === "project") return candidate.asset.kind === action
    || (action === "skybox" && (candidate.asset.kind === "hdri" || candidate.asset.skyboxMaterial === true));
  return candidate.asset.assetKind === (action === "material" ? "texture" : action === "skybox" ? "hdri" : action);
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && [...value].length <= max;
const vector = (value: unknown, min: number, max: number) => Array.isArray(value) && value.length === 3 && value.every(v => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max);

export function parseChatgptOperations(raw: unknown, resources: ChatgptResourceContext | undefined,
  candidates: readonly ExternalStoreAsset[], entityIds: readonly string[]): ChatgptOperation[] {
  if (raw === undefined) return [];
  if (!resources || !Array.isArray(raw) || raw.length > 32) throw new Error("編集プランを確認できませんでした。再試行してください");
  return raw.map(value => {
    const invalid = () => new Error("編集プランを確認できませんでした。再試行してください");
    if (!record(value) || !text(value.kind, 32)) throw invalid();
    const keys: Record<string, readonly string[]> = {
      ...Object.fromEntries(CHATGPT_EDITOR_ACTIONS.map(spec => [spec.kind, Object.keys(spec.properties)])),
      skybox: ["candidateId", "enabled", "iblEnabled", "rotationDegrees", "exposure"],
      audio: ["entityId", "componentId", "candidateId", "enabled", "volume", "loop", "spatial", "autoplay"],
      "mesh-collision": ["entityId", "action"],
      "model-attachment": ["entityId", "componentId", "candidateId"],
      material: ["entityId", "componentId", "candidateId"],
      "material-scene": ["candidateId"],
      catalog: ["candidateId", "name", "position", "rotation", "scale"],
      "blender-model": ["model", "entityId", "componentId", "position", "rotation", "scale"],
    };
    const allowed = keys[value.kind as string];
    if (!allowed || Object.keys(value).some(key => key !== "kind" && !allowed.includes(key))) throw invalid();
    const operation = { ...value };
    for (const key of allowed) if (operation[key] === null) delete operation[key];
    if (CHATGPT_EDITOR_ACTIONS.some(spec => spec.kind === operation.kind)) {
      if (operation.enabled !== undefined && typeof operation.enabled !== "boolean") throw invalid();
      if (operation.name !== undefined && !text(operation.name, 80)) throw invalid();
      if (operation.position !== undefined && !vector(operation.position, -50, 50)) throw invalid();
      if (!validateChatgptEditorAction(operation, resources, entityIds)) throw invalid();
      return operation as ChatgptEditorAction;
    }
    if (["audio", "mesh-collision", "model-attachment", "material"].includes(operation.kind as string)) {
      if (typeof operation.entityId !== "string" || !entityIds.includes(operation.entityId)) throw invalid();
      if (operation.componentId !== undefined && (typeof operation.componentId !== "string"
        || !resources.components.some(component => component.entityId === operation.entityId && component.componentId === operation.componentId
          && component.type === (operation.kind === "audio" ? "audio-source" : "mesh")))) throw invalid();
    }
    if (operation.candidateId !== undefined) {
      if (!text(operation.candidateId, 320)) throw invalid();
      const action = operation.kind === "model-attachment" ? "model" : operation.kind === "material-scene" ? "material" : operation.kind;
      if (!chatgptCandidateSupports(resolveChatgptCandidate(operation.candidateId as string, resources, candidates), action as ChatgptResourceKind | "catalog" | "skybox")) throw invalid();
    } else if (["model-attachment", "material", "material-scene", "catalog"].includes(operation.kind as string)) throw invalid();
    for (const key of ["enabled", "iblEnabled", "loop", "spatial", "autoplay"]) if (operation[key] !== undefined && typeof operation[key] !== "boolean") throw invalid();
    for (const [key, min, max] of [["volume", 0, 1], ["exposure", 0, 20], ["rotationDegrees", -360, 360]] as const) {
      const number = operation[key];
      if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max)) throw invalid();
    }
    if (operation.kind === "mesh-collision" && operation.action !== "add" && operation.action !== "remove") throw invalid();
    if (operation.kind === "catalog" || operation.kind === "blender-model" && operation.entityId === undefined) {
      if (!vector(operation.position, -50, 50) || (operation.rotation !== undefined && !vector(operation.rotation, -360, 360))
        || (operation.scale !== undefined && !vector(operation.scale, 0.02, 40)) || (operation.name !== undefined && !text(operation.name, 80))) throw invalid();
    }
    if (operation.kind === "blender-model") {
      if (!resources.blenderAvailable || resources.modelSource === "store") throw invalid();
      if (operation.entityId !== undefined) {
        if (typeof operation.entityId !== "string" || !entityIds.includes(operation.entityId)
          || ["position", "rotation", "scale"].some(key => operation[key] !== undefined)) throw invalid();
        const meshes = resources.components.filter(component => component.entityId === operation.entityId && component.type === "mesh");
        if (!meshes.length || (operation.componentId === undefined ? meshes.length !== 1 : !meshes.some(component => component.componentId === operation.componentId))) throw invalid();
      } else if (operation.componentId !== undefined) throw invalid();
      operation.model = parseBlenderModel(operation.model);
    }
    if (["audio", "model-attachment", "material"].includes(operation.kind as string)) {
      const relevant = resources.components.filter(component => component.entityId === operation.entityId && component.type === (operation.kind === "audio" ? "audio-source" : "mesh"));
      if (operation.componentId === undefined && relevant.length > 1) throw invalid();
      if (operation.kind === "audio" && relevant.length === 0 && operation.candidateId === undefined) throw invalid();
    }
    if (operation.kind === "audio" && !["candidateId", "enabled", "volume", "loop", "spatial", "autoplay"].some(key => operation[key] !== undefined)) throw invalid();
    if (operation.kind === "skybox" && !allowed.some(key => operation[key] !== undefined)) throw invalid();
    return operation as ChatgptOperation;
  });
}
