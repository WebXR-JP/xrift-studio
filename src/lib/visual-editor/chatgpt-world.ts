import { createStarterVisualProject, type StarterVisualProjectPlan } from "./starter-templates";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";

type Shape = "box" | "plane" | "sphere" | "cylinder" | "cone";
type Vec3 = [number, number, number];
export type ChatgptWorldPlan = { title: string; description: string; objects: {
  name: string; shape: Shape; position: Vec3; scale: Vec3; rotation?: Vec3;
}[] };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
function vector(v: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || ![...v].every(n => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max)) throw new Error("配置データの数値が不正です");
  return [...v] as Vec3;
}
export function parseChatgptWorldPlan(text: string): ChatgptWorldPlan {
  if (text.length > 100000) throw new Error("生成結果が大きすぎます");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("配置プランを読み取れませんでした。依頼を短くして再試行してください"); }
  if (!object(raw) || !keys(raw, ["title", "description", "objects"]) || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 100 ||
      typeof raw.description !== "string" || raw.description.length > 600 || !Array.isArray(raw.objects) || raw.objects.length < 1 || raw.objects.length > 32) throw new Error("生成した配置プランが対応範囲を超えています");
  return { title: raw.title.trim(), description: raw.description, objects: raw.objects.map(v => {
    if (!object(v) || !keys(v, ["name", "shape", "position", "scale", "rotation"]) || typeof v.name !== "string" || !v.name.trim() || v.name.length > 80 ||
        typeof v.shape !== "string" || !["box", "plane", "sphere", "cylinder", "cone"].includes(v.shape)) throw new Error("生成したオブジェクトが対応範囲を超えています");
    return { name: v.name.trim(), shape: v.shape as Shape, position: vector(v.position, -50, 50), scale: vector(v.scale, 0.02, 40),
      ...(v.rotation === undefined ? {} : { rotation: vector(v.rotation, -360, 360) }) };
  }) };
}
/** Build a new document set with the same operations used by the live Editor.
 * Never applies model data to the currently open project; no file I/O here. */
export function buildChatgptWorld(plan: ChatgptWorldPlan, name: string): StarterVisualProjectPlan {
  const validated = parseChatgptWorldPlan(JSON.stringify(plan));
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
  for (const v of validated.objects) {
    const result = apply("create_primitive", { shape: v.shape, position: v.position });
    if (typeof result.entityId !== "string") throw new Error("オブジェクトを配置できませんでした");
    apply("update_transform", { entityId: result.entityId, scale: v.scale, ...(v.rotation ? { rotation: v.rotation.map(n => n * Math.PI / 180) } : {}) });
    apply("rename_entity", { entityId: result.entityId, name: v.name });
  }
  return { ...starter, ...context.bundle };
}
