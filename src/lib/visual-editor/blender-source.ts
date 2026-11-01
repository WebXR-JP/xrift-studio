import { tauri } from "../tauri";
import { createAssetImportPlan, type AssetImportPlan, type CreateAssetImportPlanInput } from "./asset-import";
import { blenderModelSourceHash } from "./chatgpt-model-source";

export async function blendDataUrl(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Blenderファイルを読み込めませんでした"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: "application/x-blender" }));
  });
}

export async function attachBlenderSource(plan: AssetImportPlan, bytes: Uint8Array, fileName: string) {
  if (!plan.canCommit || plan.asset?.kind !== "model") return;
  const hash = await blenderModelSourceHash(bytes);
  const name = fileName.replace(/.*[\\/]/u, "").replace(/[^\p{L}\p{N}_.-]/gu, "_").replace(/\.blend$/iu, "") || "model";
  const relativePath = `assets/imported/blender/${plan.asset.id}/${hash}/${name}.blend`;
  plan.asset = { ...plan.asset, blenderSource: { kind: "project", relativePath } };
  plan.writes.push({ relativePath, purpose: "source", mediaType: "application/x-blender", sha256: hash,
    payload: { encoding: "bytes", bytes } });
}

export async function convertBlendBytes(projectPath: string, bytes: Uint8Array) {
  const converted = await tauri.convertBlenderSource(projectPath, await blendDataUrl(bytes));
  const source = await tauri.readLocalModelImportSource(converted.path);
  const glb = new Uint8Array(await (await fetch(source.dataUrl)).arrayBuffer());
  if (!glb.length || glb.length !== source.byteLength) throw new Error("Blenderの書き出し結果を読み込めませんでした");
  return glb;
}

/** Both the desktop picker and MCP use the normal Model commit after conversion. */
export async function createDesktopAssetImportPlan(projectPath: string | undefined, input: CreateAssetImportPlanInput) {
  if (!/\.blend$/iu.test(input.fileName)) return createAssetImportPlan(input);
  if (!projectPath) throw new Error(".blendの取り込みにはデスクトップ版とBlenderが必要です");
  const bytes = new Uint8Array(input.bytes);
  const glb = await convertBlendBytes(projectPath, bytes);
  const plan = await createAssetImportPlan({ ...input, fileName: input.fileName.replace(/\.blend$/iu, ".glb"),
    bytes: glb, mimeType: "model/gltf-binary", preferredKind: "model" });
  await attachBlenderSource(plan, bytes, input.fileName);
  return plan;
}
