import { tauri } from "../tauri";
import type { PrototypeVisualProject } from "./prototype-project";

export type BlenderModelPart = {
  name: string;
  shape: "box" | "sphere" | "cylinder" | "cone" | "torus" | "mesh" | "tube" | "lathe";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number, number];
  metallic: number;
  roughness: number;
  vertices?: [number, number, number][];
  faces?: number[][];
  bevel?: number;
};
export type BlenderModelSpec = { name: string; parts: BlenderModelPart[] };
export type BlenderModelBrief = { name: string; brief: string };
export function parseBlenderModelBrief(value: unknown): BlenderModelBrief {
  if (!record(value) || Object.keys(value).some(key => !["name", "brief"].includes(key)) || !name(value.name)
    || typeof value.brief !== "string" || !value.brief.trim() || [...value.brief].length > 1600 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value.brief)) {
    throw new Error("モデルの制作内容を確認できませんでした。形や寸法を指定して再試行してください");
  }
  return { name: value.name, brief: value.brief };
}
export function parseBlenderModel(value: unknown): BlenderModelSpec | BlenderModelBrief {
  return record(value) && "brief" in value ? parseBlenderModelBrief(value) : parseBlenderModelSpec(value);
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const scalar = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const vector = (value: unknown, size: number, min: number, max: number) => Array.isArray(value) && value.length === size && value.every(number => scalar(number, min, max));
const name = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && [...value].length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);

/** Geometry data is interpreted by a shipped runner; model output is never Python. */
export function parseBlenderModelSpec(value: unknown): BlenderModelSpec {
  const invalid = () => new Error("モデルの形状を確認できませんでした。形や寸法を変えて再試行してください");
  if (!record(value) || Object.keys(value).some(key => !["name", "parts"].includes(key)) || !name(value.name)
    || !Array.isArray(value.parts) || !value.parts.length || value.parts.length > 64) throw invalid();
  const parts = value.parts.map(raw => {
    if (!record(raw) || Object.keys(raw).some(key => !["name", "shape", "position", "rotation", "scale", "color", "metallic", "roughness", "vertices", "faces", "bevel"].includes(key))) throw invalid();
    const part = { ...raw };
    for (const key of ["vertices", "faces", "bevel"]) if (part[key] === null) delete part[key];
    if (!name(part.name) || !["box", "sphere", "cylinder", "cone", "torus", "mesh", "tube", "lathe"].includes(String(part.shape))
      || !vector(part.position, 3, -50, 50) || !vector(part.rotation, 3, -360, 360) || !vector(part.scale, 3, 0.02, 50)
      || !vector(part.color, 4, 0, 1) || !scalar(part.metallic, 0, 1) || !scalar(part.roughness, 0, 1)
      || (part.bevel !== undefined && !scalar(part.bevel, 0, 1))) throw invalid();
    if (part.shape === "mesh") {
      if (!Array.isArray(part.vertices) || part.vertices.length < 3 || part.vertices.length > 2048
        || !part.vertices.every(vertex => vector(vertex, 3, -50, 50)) || !Array.isArray(part.faces)
        || !part.faces.length || part.faces.length > 4096) throw invalid();
      const count = part.vertices.length;
      if (!part.faces.every(face => Array.isArray(face) && face.length >= 3 && face.length <= 64
        && face.every(index => Number.isInteger(index) && index >= 0 && index < count))) throw invalid();
    } else if (part.shape === "tube" || part.shape === "lathe") {
      if (!Array.isArray(part.vertices) || part.vertices.length < 2 || part.vertices.length > 128
        || !part.vertices.every(vertex => vector(vertex, 3, -50, 50)) || part.faces !== undefined
        || (part.shape === "tube" && !scalar(part.bevel, 0.001, 1))
        || (part.shape === "lathe" && !part.vertices.every(vertex => (vertex as number[])[0] >= 0 && (vertex as number[])[2] === 0))) throw invalid();
    } else if (part.vertices !== undefined || part.faces !== undefined) throw invalid();
    return part as unknown as BlenderModelPart;
  });
  return { name: value.name, parts };
}

/** Import the actual Blender GLB through the same analyzer and atomic save as a local Model. */
export async function createBlenderModelAsset(bundle: PrototypeVisualProject, model: BlenderModelSpec, projectPath: string) {
  const spec = parseBlenderModelSpec(model);
  const generated = await tauri.createBlenderModel(projectPath, spec);
  const source = await tauri.readLocalModelImportSource(generated.path);
  const response = await fetch(source.dataUrl);
  const bytes = await response.arrayBuffer();
  if (!response.ok || !bytes.byteLength || bytes.byteLength !== source.byteLength) throw new Error("作成したGLBを読み込めませんでした");
  const [{ createAssetImportPlan }, { commitAssetImportPlanToDisk }] = await Promise.all([import("./asset-import"), import("./asset-import-persistence")]);
  const plan = await createAssetImportPlan({ fileName: source.fileName, bytes, mimeType: source.mimeType,
    displayName: spec.name, preferredKind: "model", folderId: null, existingManifest: bundle.assets });
  if (!plan.canCommit || plan.asset?.kind !== "model") throw new Error(plan.diagnostics.find(item => item.severity === "blocking")?.message ?? "作成したGLBをModelとして取り込めませんでした");
  const assets = await commitAssetImportPlanToDisk(projectPath, bundle.assets, plan);
  return { bundle: { ...bundle, assets }, modelAssetId: plan.asset.id };
}
