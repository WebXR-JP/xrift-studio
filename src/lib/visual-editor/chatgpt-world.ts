import { getMaterialShowcaseAsset } from "./material-showcase-catalog";
import type { ExternalStoreAsset } from "../tauri";
import { createStarterVisualProject, type StarterVisualProjectPlan } from "./starter-templates";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";

type Shape = "box" | "plane" | "sphere" | "cylinder" | "cone";
type Vec3 = [number, number, number];
export type ChatgptWorldPlan = { title: string; description: string; objects: {
  name: string; shape: Shape | "model" | "audio"; externalId?: string; materialExternalId?: string; gltfMaterialId?: string; position: Vec3; scale: Vec3; rotation?: Vec3;
}[]; edits?: { entityId: string; name?: string; position?: Vec3; scale?: Vec3; rotation?: Vec3 }[] };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const length = (v: string) => [...v].length;
function vector(v: unknown, min: number, max: number, field: string, index: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || ![...v].every(n => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max)) {
    throw new Error(`配置プランの${index + 1}番目: ${field}は${min}から${max}までの数値3つで指定してください。もう一度生成してください`);
  }
  return [...v] as Vec3;
}
export function parseChatgptWorldPlan(text: string, candidates: readonly ExternalStoreAsset[] = [], allowGltfMaterials = false, entityIds: readonly string[] = []): ChatgptWorldPlan {
  if (text.length > 100000) throw new Error("生成結果が大きすぎます");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("配置プランを読み取れませんでした。依頼を短くして再試行してください"); }
  if (!object(raw) || !keys(raw, ["title", "description", "objects", "edits"])) throw new Error("配置プランに未対応の項目があります。もう一度生成してください");
  if (typeof raw.title !== "string" || !raw.title.trim() || length(raw.title) > 100) throw new Error("配置プランのタイトルは1から100文字で指定してください。もう一度生成してください");
  if (typeof raw.description !== "string" || length(raw.description) > 600) throw new Error("配置プランの説明は600文字以内で指定してください。もう一度生成してください");
  const editValues = raw.edits ?? [];
  if (!Array.isArray(raw.objects) || !Array.isArray(editValues) || raw.objects.length + editValues.length < 1 || raw.objects.length + editValues.length > 32) throw new Error("制作プランの追加と調整は合計1から32件で指定してください。範囲を絞ってもう一度依頼してください");
  const plan: ChatgptWorldPlan = { title: raw.title.trim(), description: raw.description, objects: raw.objects.map((value, index) => {
    const invalid = (reason: string) => new Error(`配置プランの${index + 1}番目: ${reason}。もう一度生成してください`);
    if (!object(value) || !keys(value, ["name", "shape", "externalId", "materialExternalId", "gltfMaterialId", "position", "scale", "rotation"])) throw invalid("未対応の項目があります");
    // Strict Structured Outputs represents optional fields as null. Convert
    // only the documented optional fields; required values still fail closed.
    const v = { ...value };
    for (const key of ["externalId", "materialExternalId", "gltfMaterialId", "rotation"]) if (v[key] === null) delete v[key];
    if (typeof v.name !== "string" || !v.name.trim() || length(v.name) > 80) throw invalid("名前は1から80文字で指定してください");
    if (typeof v.shape !== "string" || !["box", "plane", "sphere", "cylinder", "cone", "model", "audio"].includes(v.shape)) throw invalid("形状はbox、plane、sphere、cylinder、cone、model、audioのいずれかで指定してください");
    const externalKind = v.shape === "model" ? "model" : v.shape === "audio" ? "audio" : null;
    if (externalKind ? (typeof v.externalId !== "string" || !candidates.some(c => c.providerId === (externalKind === "audio" ? "otogura" : "poly-haven") && c.assetKind === externalKind && c.externalId === v.externalId)) : v.externalId !== undefined) throw invalid("この種類で使える外部素材がカタログ候補にありません");
    if (v.materialExternalId !== undefined && (externalKind !== null || typeof v.materialExternalId !== "string" || !candidates.some(c => c.providerId === "poly-haven" && c.assetKind === "texture" && c.externalId === v.materialExternalId))) throw invalid("マテリアルはプリミティブにカタログ候補から指定してください");
    if (v.gltfMaterialId !== undefined && (!allowGltfMaterials || v.shape === "audio" || v.materialExternalId !== undefined || typeof v.gltfMaterialId !== "string" || !getMaterialShowcaseAsset(v.gltfMaterialId))) throw invalid("glTFマテリアルは音声以外に候補から1種類だけ指定してください");
    return { ...(v.gltfMaterialId === undefined ? {} : { gltfMaterialId: v.gltfMaterialId as string }), ...(externalKind ? { externalId: v.externalId as string } : {}), ...(v.materialExternalId === undefined ? {} : { materialExternalId: v.materialExternalId as string }), name: v.name.trim(), shape: v.shape as Shape | "model" | "audio", position: vector(v.position, -50, 50, "位置", index), scale: vector(v.scale, 0.02, 40, "スケール", index),
      ...(v.rotation === undefined ? {} : { rotation: vector(v.rotation, -360, 360, "回転（度）", index) }) };
  }) };
  const seen = new Set<string>();
  plan.edits = editValues.map((value, index) => {
    if (!object(value) || !keys(value, ["entityId", "name", "position", "scale", "rotation"]) || typeof value.entityId !== "string" || !entityIds.includes(value.entityId) || seen.has(value.entityId)) throw new Error(`調整プランの${index + 1}番目: 現在のSceneのEntityを重複せず指定してください`);
    seen.add(value.entityId);
    const v = { ...value };
    for (const key of ["name", "position", "scale", "rotation"]) if (v[key] === null) delete v[key];
    if (v.name !== undefined && (typeof v.name !== "string" || !v.name.trim() || length(v.name) > 80)) throw new Error("調整する名前は1から80文字で指定してください");
    if (["name", "position", "scale", "rotation"].every(key => v[key] === undefined)) throw new Error("調整プランに変更する内容がありません");
    return { entityId: value.entityId, ...(typeof v.name === "string" ? { name: v.name.trim() } : {}),
      ...(v.position !== undefined ? { position: vector(v.position, -50, 50, "位置", index) } : {}),
      ...(v.scale !== undefined ? { scale: vector(v.scale, 0.02, 40, "スケール", index) } : {}),
      ...(v.rotation !== undefined ? { rotation: vector(v.rotation, -360, 360, "回転（度）", index) } : {}) };
  });
  if (!plan.edits.length) delete plan.edits;
  if (chatgptAssetRequests(plan).length + new Set(plan.objects.flatMap(v => v.gltfMaterialId ? [v.gltfMaterialId] : [])).size > 6) throw new Error("外部素材とglTFマテリアルは合計6種類以内で指定してください。素材の種類を絞ってもう一度生成してください");
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
    const providerId = v.shape === "audio" ? "otogura" : "poly-haven";
    const assetId = externalKind ? assetIds.get(`${providerId}:${v.externalId}`) : undefined;
    if (externalKind && (!assetId || context.bundle.assets.assets[assetId]?.kind !== v.shape)) throw new Error("取り込んだ外部素材を確認できません");
    const result = externalKind ? apply("place_asset", { assetId, position: v.position }) : apply("create_primitive", { shape: v.shape, position: v.position });
    if (v.materialExternalId) {
      const materialAssetId = assetIds.get(`poly-haven:${v.materialExternalId}`);
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
