import { getMaterialShowcaseAsset } from "./material-showcase-catalog";
import type { ExternalStoreAsset } from "../tauri";
import { createStarterVisualProject, type StarterVisualProjectPlan } from "./starter-templates";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";
import { parseChatgptQuestions, type ChatgptQuestion } from "./chatgpt-questions";
import { parseChatgptProduction, type ChatgptProduction } from "./chatgpt-production";
import { CHATGPT_REMOTE_KINDS, chatgptCandidateSupports, chatgptReferenceKey, parseChatgptOperations, resolveChatgptCandidate,
  type ChatgptOperation, type ChatgptResourceContext } from "./chatgpt-resources";

type Shape = "box" | "plane" | "sphere" | "cylinder" | "cone";
type Vec3 = [number, number, number];
export type ChatgptWorldPlan = { title: string; description: string; objects: {
  name: string; shape: Shape | "model" | "audio"; externalId?: string; materialExternalId?: string; gltfMaterialId?: string; position: Vec3; scale: Vec3; rotation?: Vec3;
}[]; edits?: { entityId: string; name?: string; position?: Vec3; scale?: Vec3; rotation?: Vec3 }[];
  operations?: ChatgptOperation[]; hasMore?: boolean; remainingWork?: string; questions?: ChatgptQuestion[]; production?: ChatgptProduction };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const length = (v: string) => [...v].length;
const invalidPlan = () => new Error("編集プランを確認できませんでした。再試行してください");
function vector(v: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || ![...v].every(n => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max)) {
    throw invalidPlan();
  }
  return [...v] as Vec3;
}
export function parseChatgptWorldPlan(text: string, candidates: readonly ExternalStoreAsset[] = [], allowGltfMaterials = false, entityIds: readonly string[] = [], resources?: ChatgptResourceContext): ChatgptWorldPlan {
  if (text.length > 100000) throw invalidPlan();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw invalidPlan(); }
  if (!object(raw) || !keys(raw, ["title", "description", "objects", "edits", "operations", "hasMore", "remainingWork", "questions", "production"])) throw invalidPlan();
  if (typeof raw.title !== "string" || !raw.title.trim() || length(raw.title) > 100) throw invalidPlan();
  if (typeof raw.description !== "string" || length(raw.description) > 600) throw invalidPlan();
  const editValues = raw.edits ?? [];
  const operations = parseChatgptOperations(raw.operations, resources, candidates, entityIds);
  if (!Array.isArray(raw.objects) || !Array.isArray(editValues) || raw.objects.length + editValues.length + operations.length > 32) throw invalidPlan();
  if (raw.hasMore !== undefined && typeof raw.hasMore !== "boolean") throw invalidPlan();
  if (raw.remainingWork !== undefined && raw.remainingWork !== null && (typeof raw.remainingWork !== "string" || length(raw.remainingWork) > 600)) throw invalidPlan();
  const plan: ChatgptWorldPlan = { title: raw.title.trim(), description: raw.description, objects: raw.objects.map(value => {
    if (!object(value) || !keys(value, ["name", "shape", "externalId", "materialExternalId", "gltfMaterialId", "position", "scale", "rotation"])) throw invalidPlan();
    // Strict Structured Outputs represents optional fields as null. Convert
    // only the documented optional fields; required values still fail closed.
    const v = { ...value };
    for (const key of ["externalId", "materialExternalId", "gltfMaterialId", "rotation"]) if (v[key] === null) delete v[key];
    if (typeof v.name !== "string" || !v.name.trim() || length(v.name) > 80) throw invalidPlan();
    if (typeof v.shape !== "string" || !["box", "plane", "sphere", "cylinder", "cone", "model", "audio"].includes(v.shape)) throw invalidPlan();
    const externalKind = v.shape === "model" ? "model" : v.shape === "audio" ? "audio" : null;
    if (externalKind ? (typeof v.externalId !== "string" || !chatgptCandidateSupports(resolveChatgptCandidate(v.externalId, resources, candidates, externalKind === "audio" ? "otogura" : "poly-haven"), externalKind)) : v.externalId !== undefined) throw invalidPlan();
    if (v.materialExternalId !== undefined && (resolveChatgptCandidate(String(v.materialExternalId), resources, candidates, "poly-haven")?.source === "builtin" || v.shape === "audio" || typeof v.materialExternalId !== "string" || !chatgptCandidateSupports(resolveChatgptCandidate(v.materialExternalId, resources, candidates, "poly-haven"), "material"))) throw invalidPlan();
    if (v.gltfMaterialId !== undefined && (!allowGltfMaterials || v.shape === "audio" || v.materialExternalId !== undefined || typeof v.gltfMaterialId !== "string" || !getMaterialShowcaseAsset(v.gltfMaterialId))) throw invalidPlan();
    return { ...(v.gltfMaterialId === undefined ? {} : { gltfMaterialId: v.gltfMaterialId as string }), ...(externalKind ? { externalId: v.externalId as string } : {}), ...(v.materialExternalId === undefined ? {} : { materialExternalId: v.materialExternalId as string }), name: v.name.trim(), shape: v.shape as Shape | "model" | "audio", position: vector(v.position, -50, 50), scale: vector(v.scale, 0.02, 40),
      ...(v.rotation === undefined ? {} : { rotation: vector(v.rotation, -360, 360) }) };
  }) };
  const seen = new Set<string>();
  plan.edits = editValues.map(value => {
    if (!object(value) || !keys(value, ["entityId", "name", "position", "scale", "rotation"]) || typeof value.entityId !== "string" || !entityIds.includes(value.entityId) || seen.has(value.entityId)) throw invalidPlan();
    seen.add(value.entityId);
    const v = { ...value };
    for (const key of ["name", "position", "scale", "rotation"]) if (v[key] === null) delete v[key];
    if (v.name !== undefined && (typeof v.name !== "string" || !v.name.trim() || length(v.name) > 80)) throw invalidPlan();
    if (["name", "position", "scale", "rotation"].every(key => v[key] === undefined)) throw invalidPlan();
    return { entityId: value.entityId, ...(typeof v.name === "string" ? { name: v.name.trim() } : {}),
      ...(v.position !== undefined ? { position: vector(v.position, -50, 50) } : {}),
      ...(v.scale !== undefined ? { scale: vector(v.scale, 0.02, 40) } : {}),
      ...(v.rotation !== undefined ? { rotation: vector(v.rotation, -360, 360) } : {}) };
  });
  if (!plan.edits.length) delete plan.edits;
  if (operations.length) plan.operations = operations;
  if (typeof raw.hasMore === "boolean") plan.hasMore = raw.hasMore;
  if (typeof raw.remainingWork === "string") plan.remainingWork = raw.remainingWork;
  const production = parseChatgptProduction(raw.production);
  if (operations.some(operation => operation.kind === "r3f-scene") && !production) throw invalidPlan();
  if (production) plan.production = production;
  const questions = parseChatgptQuestions(raw.questions);
  for (const question of questions) for (const id of question.choiceCandidateIds ?? []) if (id !== null && !resolveChatgptCandidate(id, resources, candidates)) throw invalidPlan();
  if (questions.length) {
    if (plan.objects.length || plan.edits?.length || operations.length) throw invalidPlan();
    plan.questions = questions;
  }
  if (chatgptAssetRequests(plan).length + new Set(plan.objects.flatMap(v => v.gltfMaterialId ? [v.gltfMaterialId] : [])).size > 6) throw invalidPlan();
  return plan;
}
/** Build a new document set with the same operations used by the live Editor.
 * Never applies model data to the currently open project; no file I/O here. */
export function buildChatgptWorld(plan: ChatgptWorldPlan, name: string, candidates: readonly ExternalStoreAsset[] = [], allowGltfMaterials = false): StarterVisualProjectPlan {
  const validated = parseChatgptWorldPlan(JSON.stringify(plan), candidates, allowGltfMaterials);
  const starter = createStarterVisualProject("world", "blank", name);
  let context: XriftMcpEditorContext = { bundle: starter, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "dirty" };
  const apply = (tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) => {
    const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: {
      projectId: context.bundle.project.projectId, sceneId: context.bundle.scene.sceneId, expectedRevision: context.revision, ...args
    } });
    context = { ...context, bundle: outcome.bundle, sceneSelection: outcome.sceneSelection, assetSelection: outcome.assetSelection, revision: context.revision + (outcome.changed ? 1 : 0) };
    return outcome.result;
  };
  apply("update_project_metadata", { patch: { title: validated.title, description: validated.description } });
  for (const v of validated.objects.filter(v => v.shape !== "model" && v.shape !== "audio" && !v.materialExternalId && !v.gltfMaterialId)) {
    const result = apply("create_primitive", { shape: v.shape, position: v.position });
    if (typeof result.entityId !== "string") throw new Error("オブジェクトを配置できませんでした");
    apply("update_transform", { entityId: result.entityId, scale: v.scale, ...(v.rotation ? { rotation: v.rotation.map(n => n * Math.PI / 180) } : {}) });
    apply("rename_entity", { entityId: result.entityId, name: v.name });
  }
  return { ...starter, ...context.bundle };
}

/** Place imported assets through the regular Editor operation, preserving materials and model hierarchy. */
export function placeChatgptAssets(starter: StarterVisualProjectPlan, plan: ChatgptWorldPlan, assetIds: ReadonlyMap<string, string>): StarterVisualProjectPlan {
  let context: XriftMcpEditorContext = { bundle: starter, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "dirty" };
  const apply = (tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) => {
    const out = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: { projectId: context.bundle.project.projectId, sceneId: context.bundle.scene.sceneId, expectedRevision: context.revision, ...args } });
    context = { ...context, bundle: out.bundle, revision: context.revision + (out.changed ? 1 : 0) };
    return out.result;
  };
  for (const v of plan.objects.filter(v => v.shape === "model" || v.shape === "audio" || v.materialExternalId || v.gltfMaterialId)) {
    const externalKind = v.shape === "model" || v.shape === "audio";
    const reference = v.externalId ? chatgptReferenceKey(v.externalId, v.shape === "audio" ? "otogura" : "poly-haven") : undefined;
    const assetId = externalKind && reference ? (reference.startsWith("project:") ? reference.slice(8) : assetIds.get(reference)) : undefined;
    if (externalKind && (!assetId || context.bundle.assets.assets[assetId]?.kind !== v.shape)) throw new Error("取り込んだ外部素材を確認できません");
    const result = externalKind ? apply("place_asset", { assetId, position: v.position }) : apply("create_primitive", { shape: v.shape, position: v.position });
    if (v.materialExternalId) {
      const materialReference = chatgptReferenceKey(v.materialExternalId, "poly-haven");
      const materialAssetId = materialReference.startsWith("project:") ? materialReference.slice(8) : assetIds.get(materialReference);
      if (!materialAssetId) throw new Error("取り込んだマテリアルを確認できません");
      apply("set_material", { entityId: result.entityId, materialAssetId });
    }
    if (v.gltfMaterialId) apply("set_material", { entityId: result.entityId, materialAssetId: v.gltfMaterialId });
    if (v.shape === "audio") {
      const component = context.bundle.scene.entities[String(result.entityId)]?.components.find(c => c.type === "audio-source");
      if (!component) throw new Error("Audio Sourceを作成できません");
      apply("update_component", { entityId: result.entityId, componentId: component.id, patch: { spatial: false, loop: true, autoplay: true, volume: 0.35 } });
    }
    apply("update_transform", { entityId: result.entityId, scale: v.scale, rotation: (v.rotation ?? (v.shape === "plane" ? [-90,0,0] : [0,0,0])).map(n => n * Math.PI / 180) });
    apply("rename_entity", { entityId: result.entityId, name: v.name });
  }
  return { ...starter, ...context.bundle };
}

/** The bounded plan names catalog assets, never URLs or local paths. */
export function chatgptAssetRequests(plan: ChatgptWorldPlan) {
  const requests = new Map<string, { providerId: string; externalId: string; kind: "model" | "texture" | "audio" | "hdri" }>();
  const add = (reference: string, kind: "model" | "texture" | "audio" | "hdri", legacyProvider?: string) => {
    const key = legacyProvider ? chatgptReferenceKey(reference, legacyProvider) : reference;
    const colon = key.indexOf(":");
    const providerId = key.slice(0, colon), externalId = key.slice(colon + 1);
    if (!CHATGPT_REMOTE_KINDS[providerId]?.includes(kind)) return;
    requests.set(key, { providerId, externalId, kind });
  };
  for (const v of plan.objects) {
    if (v.shape === "model" || v.shape === "audio") {
      add(v.externalId!, v.shape, v.shape === "audio" ? "otogura" : "poly-haven");
    }
    if (v.materialExternalId) add(v.materialExternalId, "texture", "poly-haven");
  }
  for (const operation of plan.operations ?? []) if ("candidateId" in operation && operation.candidateId) {
    if (operation.kind === "skybox") add(operation.candidateId, "hdri");
    else if (operation.kind === "audio") add(operation.candidateId, "audio");
    else if (operation.kind === "model-attachment") add(operation.candidateId, "model");
    else if (operation.kind === "material" || operation.kind === "material-scene") add(operation.candidateId, "texture");
  }
  return [...requests.values()];
}
