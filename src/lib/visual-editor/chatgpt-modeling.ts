import { tauri } from "../tauri";
import type { PrototypeVisualProject } from "./prototype-project";
import { parseBlenderModelSpec, type BlenderModelSpec } from "./blender-model-spec";
import { blenderModelSourceHash, createBlenderModelSource, readBlenderModelSource, type BlenderModelSourceMetadata } from "./chatgpt-model-source";

export { parseBlenderModelSpec, parseBlenderModelBrief, parseBlenderModel } from "./blender-model-spec";
export type { BlenderModelSpec, BlenderModelPart, BlenderModelBrief } from "./blender-model-spec";

const specSignature = (spec: BlenderModelSpec) => JSON.stringify(spec, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export type BlenderModelExecution = { generationId?: string; checkCurrent?: () => void };

/** Import the actual GLB and its editable geometry recipe in one atomic Asset commit. */
export async function createBlenderModelAsset(bundle: PrototypeVisualProject, model: BlenderModelSpec, projectPath: string, metadata: BlenderModelSourceMetadata = {}, execution: BlenderModelExecution = {}) {
  execution.checkCurrent?.();
  const spec = parseBlenderModelSpec(model);
  const previousAsset = metadata.previousAssetId ? bundle.assets.assets[metadata.previousAssetId] : undefined;
  if (metadata.previousAssetId && previousAsset?.kind !== "model") throw new Error("制作を続ける元のModelがAssetsにありません");
  const previous = previousAsset?.kind === "model" ? await readBlenderModelSource(previousAsset, projectPath) : null;
  execution.checkCurrent?.();
  if (previousAsset?.kind === "model" && previousAsset.status === "ready" && previous
    && specSignature(spec) === specSignature(previous.spec)) return { bundle, modelAssetId: previousAsset.id };
  const generated = await tauri.createBlenderModel(projectPath, spec, execution.generationId);
  execution.checkCurrent?.();
  const source = await tauri.readLocalModelImportSource(generated.path);
  execution.checkCurrent?.();
  const response = await fetch(source.dataUrl);
  const bytes = await response.arrayBuffer();
  execution.checkCurrent?.();
  if (!response.ok || !bytes.byteLength || bytes.byteLength !== source.byteLength) throw new Error("作成したGLBを読み込めませんでした");
  const recipe = await createBlenderModelSource(spec, await blenderModelSourceHash(new Uint8Array(bytes)), metadata, previous ?? undefined);
  const [{ createAssetImportPlan }, { commitAssetImportPlanToDisk }] = await Promise.all([import("./asset-import"), import("./asset-import-persistence")]);
  execution.checkCurrent?.();
  // Distinct recipe revisions remain separate Assets even if their GLB bytes match.
  const plan = await createAssetImportPlan({ fileName: `model-${recipe.authoring.sourceHash.slice(0, 24)}.glb`, bytes, mimeType: source.mimeType,
    displayName: spec.name, preferredKind: "model", folderId: null, existingManifest: bundle.assets });
  execution.checkCurrent?.();
  if (!plan.canCommit || plan.asset?.kind !== "model") throw new Error(plan.diagnostics.find(item => item.severity === "blocking")?.message ?? "作成したGLBをModelとして取り込めませんでした");
  plan.asset = { ...plan.asset, ...(previousAsset?.kind === "model" ? { importSettings: structuredClone(previousAsset.importSettings) } : {}), authoring: recipe.authoring };
  plan.writes.push(recipe.write);
  const assets = await commitAssetImportPlanToDisk(projectPath, bundle.assets, plan);
  execution.checkCurrent?.();
  return { bundle: { ...bundle, assets }, modelAssetId: plan.asset.id };
}
