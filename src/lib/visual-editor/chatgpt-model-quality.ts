import { tauri } from "../tauri";
import type { PrototypeVisualProject } from "./prototype-project";
import { parseBlenderModelSpec, type BlenderModelBrief } from "./chatgpt-modeling";
import { readBlenderEntityModelSource } from "./chatgpt-model-source";
import { applyChatgptOperation } from "./chatgpt-generation";
import { ChatgptSceneConflictError } from "./chatgpt-plan-guards";
import { chatgptAttachmentEntityIds } from "./chatgpt-attachments";
import type { ChatgptResourceContext } from "./chatgpt-resources";

/** Protect the actual model and manual node/material edits, allowing unrelated
 * Entities to change while the reviewer waits for an inference response. */
export function chatgptModelSnapshot(bundle: PrototypeVisualProject, entityId: string): string {
  const entityIds = chatgptAttachmentEntityIds(Object.values(bundle.scene.entities), [entityId]);
  const assetIds = new Set<string>();
  const entities = entityIds.map(id => bundle.scene.entities[id]);
  for (const entity of entities) for (const component of entity.components) {
    if (component.type !== "mesh") continue;
    assetIds.add(component.geometry?.kind === "asset" ? component.geometry.assetId : component.geometryAssetId);
    for (const binding of component.materialBindings) assetIds.add(binding.materialAssetId);
  }
  for (const id of assetIds) {
    const asset = bundle.assets.assets[id];
    if (asset?.kind === "model") for (const slot of asset.materialSlots) if (slot.defaultMaterialAssetId) assetIds.add(slot.defaultMaterialAssetId);
  }
  return JSON.stringify({ entities, assets: [...assetIds].sort().map(id => {
    const asset = bundle.assets.assets[id];
    if (!asset) return [id, null];
    const { thumbnail: _thumbnail, ...authored } = asset;
    return [id, authored];
  }) });
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
const signature = (spec: ReturnType<typeof parseBlenderModelSpec>) => JSON.stringify(stable({ ...spec, parts: [...spec.parts].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? "")) }));

export async function reviewChatgptModel(options: {
  model: string; generationId: string; prompt: string; brief: BlenderModelBrief;
  entityId: string; componentId?: string; projectPath: string; reasoningEffort?: string;
  expectedSnapshot?: string;
  request?: <T>(label: string, work: () => Promise<T>) => Promise<T>;
  resources: ChatgptResourceContext;
  currentBundle: () => PrototypeVisualProject;
  checkCurrent: () => void;
  capture: (entityId: string, sourceHash: string, checkCurrent?: () => void) => Promise<{ label: string; dataUrl: string }[]>;
  commit: (before: PrototypeVisualProject, after: PrototypeVisualProject, entityId?: string) => void;
  save: () => Promise<void>;
  progress: (message: string, saved?: boolean) => void;
}) {
  const seen = new Set<string>();
  // A request has a bounded repair budget; every correction is rendered and
  // checked again, and an unapproved last version is never reported as approved.
  for (let pass = 0; pass < 3; pass++) {
    options.checkCurrent();
    const before = options.currentBundle();
    const expected = pass === 0 && options.expectedSnapshot ? options.expectedSnapshot : chatgptModelSnapshot(before, options.entityId);
    const check = () => {
      options.checkCurrent();
      if (chatgptModelSnapshot(options.currentBundle(), options.entityId) !== expected) throw new ChatgptSceneConflictError("モデルの見直し中に対象が編集されました。手動編集を保ち、最新の形状から制作を続けます");
    };
    check();
    const authored = await readBlenderEntityModelSource(before, options.entityId, options.projectPath, options.componentId);
    if (!authored) throw new Error("モデルの制作原本が見つからず、見た目を見直せませんでした。保存済みのモデルは残っています");
    const asset = before.assets.assets[authored.modelAssetId];
    if (!asset?.sourceHash) throw new Error("見直すモデルの保存データを照合できませんでした");
    check();
    options.progress(`${options.brief.name}の実際の形を3方向から確認しています`);
    const images = await options.capture(options.entityId, asset.sourceHash, check);
    check();
    options.progress(`${options.brief.name}の輪郭・寸法・構造・材質を見直しています`);
    const request = () => tauri.chatgptReviewModel(options.model, options.generationId, options.prompt, options.brief,
      authored.source.spec, images, options.reasoningEffort, authored.source.originalPrompt || options.prompt);
    const review = await (options.request ? options.request(`${options.brief.name}の形を見直し`.slice(0, 160), request) : request());
    check();
    if (typeof review.approved !== "boolean" || typeof review.summary !== "string" || !review.summary.trim() || [...review.summary].length > 600
      || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(review.summary)) throw new Error("モデルの見直し結果を確認できませんでした");
    if (review.approved) {
      if (review.model !== null) throw new Error("モデルの見直し結果と修正内容が一致しません");
      options.progress(`見直しました：${review.summary}`);
      return;
    }
    if (!review.model || pass === 2) throw new Error(`モデルの見直しが完了しませんでした。保存済みの形状から続けられます。${review.summary}`);
    const corrected = parseBlenderModelSpec(review.model);
    const currentSignature = signature(authored.source.spec), nextSignature = signature(corrected);
    seen.add(currentSignature);
    if (corrected.name !== authored.source.spec.name || seen.has(nextSignature)) throw new Error("モデルの見直しが進まなかったため停止しました。最後に保存した形状は残っています");
    options.progress(`モデルを修正しています：${review.summary}`);
    const changed = await applyChatgptOperation(before, { kind: "blender-model", entityId: options.entityId,
      componentId: authored.componentId, model: corrected }, new Map(), options.resources, options.projectPath,
    { prompt: options.prompt, brief: options.brief.brief, originalPrompt: authored.source.originalPrompt },
    { generationId: options.generationId, checkCurrent: check });
    check();
    options.commit(before, changed.bundle, options.entityId);
    await options.save();
    options.progress(`修正して保存しました：${review.summary}`, true);
  }
}
