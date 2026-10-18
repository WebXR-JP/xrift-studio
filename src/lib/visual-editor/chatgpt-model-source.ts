import { tauri } from "../tauri";
import type { ModelAsset } from "./asset-manifest";
import type { AssetImportWrite } from "./asset-import";
import { parseBlenderModelSpec, type BlenderModelSpec } from "./blender-model-spec";
import type { PrototypeVisualProject } from "./prototype-project";
import { assertBlenderModelSourceCurrent } from "./chatgpt-model-integrity";

export type BlenderModelSource = {
  version: 1;
  originalPrompt: string;
  prompt: string;
  brief: string;
  spec: BlenderModelSpec;
  /** SHA-256 of the GLB produced from this recipe, independent of recipe hashing. */
  modelSourceHash: string;
  revision: number;
  parentAssetId?: string;
};

export type BlenderModelSourceMetadata = {
  prompt?: string;
  originalPrompt?: string;
  brief?: string;
  previousAssetId?: string;
};

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && [...value].length <= limit && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value);
const assetId = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= 240 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const invalidSource = () => new Error("モデルの制作データを確認できませんでした。Assetsの元モデルと制作データを確認してください");

export async function blenderModelSourceHash(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function parseBlenderModelSource(value: unknown): BlenderModelSource {
  if (!record(value) || Object.keys(value).some(key => !["version", "originalPrompt", "prompt", "brief", "spec", "modelSourceHash", "revision", "parentAssetId"].includes(key))
    || value.version !== 1 || !text(value.originalPrompt, 2000) || !text(value.prompt, 2000) || !text(value.brief, 1600)
    || !hash(value.modelSourceHash) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || (value.parentAssetId !== undefined && !assetId(value.parentAssetId))) throw invalidSource();
  const spec = parseBlenderModelSpec(value.spec);
  if (new TextEncoder().encode(JSON.stringify(spec)).byteLength > 400_000) throw invalidSource();
  return { version: 1, originalPrompt: value.originalPrompt, prompt: value.prompt, brief: value.brief,
    spec, modelSourceHash: value.modelSourceHash, revision: value.revision as number,
    ...(value.parentAssetId !== undefined ? { parentAssetId: value.parentAssetId } : {}) };
}

/** Hierarchy append adds a managed namespace without changing the recipe bytes. */
export function isBlenderModelSourcePath(path: unknown, sourceHash: string): path is string {
  if (typeof path !== "string" || !hash(sourceHash)) return false;
  const suffix = `assets/imported/model-sources/${sourceHash}/source.json`;
  if (!path.endsWith(suffix)) return false;
  const prefix = path.slice(0, -suffix.length);
  return /^(?:assets\/imported\/hierarchy-[a-zA-Z0-9_-]+\/)*$/u.test(prefix);
}

/** Build the sidecar write before committing either the GLB or its recipe. */
export async function createBlenderModelSource(spec: BlenderModelSpec, modelSourceHash: string,
  metadata: BlenderModelSourceMetadata = {}, previous?: BlenderModelSource): Promise<{
    source: BlenderModelSource; authoring: NonNullable<ModelAsset["authoring"]>; write: AssetImportWrite;
  }> {
  const source = parseBlenderModelSource({ version: 1,
    originalPrompt: previous?.originalPrompt ?? metadata.originalPrompt ?? metadata.prompt ?? "",
    prompt: metadata.prompt ?? "", brief: metadata.brief ?? previous?.brief ?? "", spec,
    modelSourceHash, revision: (previous?.revision ?? 0) + 1,
    ...(metadata.previousAssetId !== undefined ? { parentAssetId: metadata.previousAssetId } : {}) });
  const bytes = new TextEncoder().encode(JSON.stringify(source));
  const sourceHash = await blenderModelSourceHash(bytes);
  const sourcePath = `assets/imported/model-sources/${sourceHash}/source.json`;
  return { source, authoring: { kind: "blender", version: 1, sourcePath, sourceHash, revision: source.revision,
    ...(source.parentAssetId ? { parentAssetId: source.parentAssetId } : {}) },
  write: { relativePath: sourcePath, purpose: "source", mediaType: "application/json", sha256: sourceHash,
    payload: { encoding: "bytes", bytes } } };
}

/** Reject stale recipes after manual GLB reimport instead of rebuilding from old geometry. */
export async function readBlenderModelSource(asset: ModelAsset, projectPath: string): Promise<BlenderModelSource | null> {
  const pointer = asset.authoring;
  if (!pointer) return null;
  if (pointer.kind !== "blender" || pointer.version !== 1 || !hash(pointer.sourceHash) || !hash(asset.sourceHash)
    || !isBlenderModelSourcePath(pointer.sourcePath, pointer.sourceHash)
    || !Number.isSafeInteger(pointer.revision) || pointer.revision < 1
    || (pointer.parentAssetId !== undefined && !assetId(pointer.parentAssetId))) throw invalidSource();
  let content: string;
  try { content = await tauri.readTextFile(projectPath, pointer.sourcePath); }
  catch { throw new Error("モデルの制作データを読み込めませんでした。元のプロジェクトに制作データがあることを確認してください"); }
  if (await blenderModelSourceHash(new TextEncoder().encode(content)) !== pointer.sourceHash) throw invalidSource();
  let source: BlenderModelSource;
  try { source = parseBlenderModelSource(JSON.parse(content)); }
  catch { throw invalidSource(); }
  if (source.modelSourceHash !== asset.sourceHash || source.revision !== pointer.revision || source.parentAssetId !== pointer.parentAssetId) throw invalidSource();
  return source;
}

/** Resolve one exact Mesh Renderer or a logical root of owned generated nodes. */
export function resolveBlenderEntityModelAsset(bundle: PrototypeVisualProject, entityId: string, componentId?: string): {
  modelAssetId: string; componentId?: string;
} | null {
  const entity = bundle.scene.entities[entityId];
  const meshes = entity?.components.filter(component => component.type === "mesh") ?? [];
  const mesh = componentId ? meshes.find(component => component.id === componentId) : meshes.length === 1 ? meshes[0] : undefined;
  if (!entity || entity.modelNode || (componentId && !mesh) || (!componentId && meshes.length > 1)
    || mesh?.geometry?.kind === "asset" && (mesh.geometry.sourceNodeIndex !== undefined || mesh.geometry.sourceNodeName !== undefined)) {
    throw new Error("制作を続けるモデルのMesh Rendererを指定してください。モデル内部の一部を選んだ場合は元のEntityを選び直してください");
  }
  let modelAssetId = mesh?.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh?.geometryAssetId;
  if (!mesh) {
    // Static glTF placement expands the logical root into shared-source child
    // meshes. Resolve only that root's owned generated nodes, never manual ones.
    const candidates = new Set<string>();
    const pending = [...entity.children], seen = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const child = bundle.scene.entities[id];
      if (!child) continue;
      pending.push(...child.children);
      const owned = [`${entityId}-model-node-`, `${entityId}-openbrush-node-`].some(prefix => id.startsWith(prefix) && /^\d+$/u.test(id.slice(prefix.length)));
      if (!owned) continue;
      for (const component of child.components) if (component.type === "mesh") candidates.add(component.geometry?.kind === "asset" ? component.geometry.assetId : component.geometryAssetId);
    }
    if (candidates.size > 1) throw new Error("制作を続けるモデルを一つに絞ってください");
    modelAssetId = [...candidates][0];
  }
  if (!modelAssetId) return null;
  const asset = bundle.assets.assets[modelAssetId];
  if (asset?.kind !== "model") return null;
  return { modelAssetId, ...(mesh ? { componentId: mesh.id } : {}) };
}

export async function readBlenderEntityModelSource(bundle: PrototypeVisualProject, entityId: string, projectPath: string, componentId?: string): Promise<{
  entityId: string; componentId?: string; modelAssetId: string; source: BlenderModelSource;
} | null> {
  const target = resolveBlenderEntityModelAsset(bundle, entityId, componentId);
  if (!target) return null;
  const asset = bundle.assets.assets[target.modelAssetId] as ModelAsset;
  assertBlenderModelSourceCurrent(bundle, entityId, asset.id);
  const source = await readBlenderModelSource(asset, projectPath);
  return source ? { entityId, ...target, source } : null;
}
