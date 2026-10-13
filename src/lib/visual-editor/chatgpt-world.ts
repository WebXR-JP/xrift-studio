import type { ExternalStoreAsset } from "../tauri";
import { createStarterVisualProject, type StarterVisualProjectPlan } from "./starter-templates";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";

type Shape = "box" | "plane" | "sphere" | "cylinder" | "cone";
type Vec3 = [number, number, number];
export type ChatgptWorldPlan = { title: string; description: string; objects: {
  name: string; shape: Shape | "model" | "audio"; externalId?: string; materialExternalId?: string; position: Vec3; scale: Vec3; rotation?: Vec3;
}[] };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
function vector(v: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || ![...v].every(n => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max)) throw new Error("配置データの数値が不正です");
  return [...v] as Vec3;
}
export function parseChatgptWorldPlan(text: string, candidates: readonly ExternalStoreAsset[] = []): ChatgptWorldPlan {
  if (text.length > 100000) throw new Error("生成結果が大きすぎます");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("配置プランを読み取れませんでした。依頼を短くして再試行してください"); }
  if (!object(raw) || !keys(raw, ["title", "description", "objects"]) || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 100 ||
      typeof raw.description !== "string" || raw.description.length > 600 || !Array.isArray(raw.objects) || raw.objects.length < 1 || raw.objects.length > 32) throw new Error("生成した配置プランが対応範囲を超えています");
  return { title: raw.title.trim(), description: raw.description, objects: raw.objects.map(v => {
    if (!object(v) || !keys(v, ["name", "shape", "externalId", "materialExternalId", "position", "scale", "rotation"]) || typeof v.name !== "string" || !v.name.trim() || v.name.length > 80 ||
        typeof v.shape !== "string" || !["box", "plane", "sphere", "cylinder", "cone", "model", "audio"].includes(v.shape)) throw new Error("生成したオブジェクトが対応範囲を超えています");
    const externalKind = v.shape === "model" ? "model" : v.shape === "audio" ? "audio" : null;
    if (externalKind ? (typeof v.externalId !== "string" || !candidates.some(c => c.providerId === (externalKind === "audio" ? "otogura" : "poly-haven") && c.assetKind === externalKind && c.externalId === v.externalId)) : v.externalId !== undefined) throw new Error("カタログにない外部素材が指定されました");
    if (v.materialExternalId !== undefined && (externalKind !== null || typeof v.materialExternalId !== "string" || !candidates.some(c => c.providerId === "poly-haven" && c.assetKind === "texture" && c.externalId === v.materialExternalId))) throw new Error("カタログにないマテリアルが指定されました");
    return { ...(externalKind ? { externalId: v.externalId as string } : {}), ...(v.materialExternalId === undefined ? {} : { materialExternalId: v.materialExternalId as string }), name: v.name.trim(), shape: v.shape as Shape | "model" | "audio", position: vector(v.position, -50, 50), scale: vector(v.scale, 0.02, 40),
      ...(v.rotation === undefined ? {} : { rotation: vector(v.rotation, -360, 360) }) };
  }) };
}
/** Build a new document set with the same operations used by the live Editor.
 * Never applies model data to the currently open project; no file I/O here. */
export function buildChatgptWorld(plan: ChatgptWorldPlan, name: string, candidates: readonly ExternalStoreAsset[] = []): StarterVisualProjectPlan {
  const validated = parseChatgptWorldPlan(JSON.stringify(plan), candidates);
  if (chatgptAssetRequests(validated).length > 6) throw new Error("外部素材は合計6種類以内で指定してください");
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
  for (const v of validated.objects.filter(v => v.shape !== "model" && v.shape !== "audio" && !v.materialExternalId)) {
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
  for (const v of plan.objects.filter(v => v.shape === "model" || v.shape === "audio" || v.materialExternalId)) {
    const externalKind = v.shape === "model" || v.shape === "audio";
    const providerId = v.shape === "audio" ? "otogura" : "poly-haven";
    const assetId = externalKind ? assetIds.get(`${providerId}:${v.externalId}`) : undefined;
    if (externalKind && (!assetId || context.bundle.assets.assets[assetId]?.kind !== v.shape)) throw new Error("取り込んだ外部素材を確認できません");
    const result = externalKind ? apply("place_asset", { assetId, position: v.position }) : apply("create_primitive", { shape: v.shape, position: v.position });
    if (v.materialExternalId) {
      const materialAssetId = assetIds.get(`poly-haven:${v.materialExternalId}`);
      if (!materialAssetId) throw new Error("取り込んだマテリアルを確認できません");
      apply("set_material", { entityId: result.entityId, materialAssetId });
    }
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
  const requests = new Map<string, { providerId: string; externalId: string; kind: "model" | "texture" | "audio" }>();
  for (const v of plan.objects) {
    if (v.shape === "model" || v.shape === "audio") {
      const providerId = v.shape === "audio" ? "otogura" : "poly-haven";
      requests.set(`${providerId}:${v.externalId}`, {providerId, externalId:v.externalId!, kind:v.shape});
    }
    if (v.materialExternalId) requests.set(`poly-haven:${v.materialExternalId}`, {providerId:"poly-haven",externalId:v.materialExternalId,kind:"texture"});
  }
  return [...requests.values()];
}
