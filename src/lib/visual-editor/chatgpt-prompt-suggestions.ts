import type { ChatgptEntityReference } from "./chatgpt-attachments";
import type { ChatgptGeneration } from "./chatgpt-generation";

export type ChatgptPromptSuggestion = {
  id: string;
  label: string;
  prompt: string;
  attachedEntityIds?: string[];
  attachedMaterialIds?: string[];
};

type SuggestionInput = {
  generation?: ChatgptGeneration | null;
  entities: readonly ChatgptEntityReference[];
  materials: readonly { id: string; name: string }[];
  attachedEntityIds: readonly string[];
  attachedMaterialIds: readonly string[];
  blenderAvailable?: boolean;
};
const publicName = (name: string) => [...name.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim()].slice(0, 60).join("");
const uniqueExisting = (ids: readonly string[], existing: ReadonlyMap<string, unknown>, limit: number) => [...new Set(ids)].filter(id => existing.has(id)).slice(0, limit);

/** Local drafting suggestions only. Targets always come from current Editor IDs;
 * generated descriptions and historical names never become executable prompts. */
export function chatgptPromptSuggestions({ generation, entities, materials, attachedEntityIds, attachedMaterialIds, blenderAvailable = false }: SuggestionInput): ChatgptPromptSuggestion[] {
  if (generation && (generation.status !== "completed" || generation.revertedAt || generation.cancelling)) return [];
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const materialById = new Map(materials.map(material => [material.id, material]));
  const explicit = attachedEntityIds.length > 0 || attachedMaterialIds.length > 0;
  const currentEntities = uniqueExisting(attachedEntityIds, entityById, 100);
  const currentMaterials = uniqueExisting(attachedMaterialIds, materialById, 16);
  // A deleted current attachment needs the author's attention, not a different target.
  if (explicit && !currentEntities.length && !currentMaterials.length) return [];
  const entityIds = explicit ? currentEntities : uniqueExisting([
    ...(generation?.attachedEntities?.map(entity => entity.id) ?? []),
    ...(generation?.progress.recentEvents.filter(event => event.saved && event.entityId).slice().reverse().map(event => event.entityId!) ?? []),
  ], entityById, 100);
  const materialIds = explicit ? currentMaterials : uniqueExisting([
    ...(generation?.attachedMaterials?.map(material => material.id) ?? []),
    ...(generation?.plan?.objects.flatMap(object => "materialAssetId" in object && typeof object.materialAssetId === "string" ? [object.materialAssetId] : []) ?? []),
  ], materialById, 16);
  const scope = { ...(entityIds.length ? { attachedEntityIds: entityIds } : {}), ...(materialIds.length ? { attachedMaterialIds: materialIds } : {}) };
  const result: ChatgptPromptSuggestion[] = [];
  const add = (id: string, label: string, prompt: string, targeted = false) => {
    if (result.length < 3) result.push({ id, label, prompt, ...(targeted ? scope : {}) });
  };
  const addSceneMaterials = () => add("scene-materials", "全体のMaterialを見比べて一括変更", "Scene全体に合うMaterialを使える素材から最大12候補、おすすめ順にサムネイル付きで提案してください。全体に使う候補を1つ選んだら、SceneのMesh Rendererへまとめて適用してください。Entityごとの質問には分けず、形状・配置は保ってください。");
  // A new explicit attachment takes priority over unfinished work from another turn.
  if (!explicit && generation?.plan?.hasMore) add("remaining-work", "残りの作業を進める", "保存済みの変更を保ち、直前の依頼で残っている作業を今のSceneから進めてください。完了した変更は繰り返さず、対象が見つからなければ確認してください。", true);

  if (!explicit && generation?.plan?.objects.some(object => object.name === "Scene全体のMaterialを一括変更")) addSceneMaterials();

  if (materialIds.length) {
    const name = publicName(materialById.get(materialIds[0])!.name) || "Material";
    const target = materialIds.length === 1 ? `Material「${name}」` : `「${name}」を含む添付したMaterial`;
    add(`material-colors:${materialIds[0]}`, "Materialの色を3案から選ぶ", `${target}に合う色を3つの選択肢で提案し、選んでから変更してください。`, true);
    if (entityIds.length) {
      const name = publicName(entityById.get(entityIds[0])!.name) || "Entity";
      add(`entity-layout:${entityIds[0]}`, "Entityの位置・大きさを調整", `添付したEntity「${name}」の位置と大きさを、周囲とのバランスに合わせて調整してください。`, true);
    }
    add(`material-surface:${materialIds[0]}`, "Materialの質感を調整", `${target}のRoughnessとMetallicを見直したいです。今の設定に合う質感を3つの選択肢で提案し、選んでから変更してください。`, true);
  } else if (entityIds.length) {
    const entity = entityById.get(entityIds[0])!;
    const name = publicName(entity.name) || "Entity";
    add(`entity-layout:${entity.id}`, "Entityの位置・大きさを調整", `添付したEntity「${name}」の位置と大きさを、周囲とのバランスに合わせて調整してください。`, true);
    const targets = entityIds.length === 1 ? `添付したEntity「${name}」` : `「${name}」を含む添付したEntity`;
    add(`entity-surface:${entity.id}`, "Materialを見比べて選ぶ", `${targets}に合うMaterialを、使える素材から最大12候補、合う順にサムネイル付きで提案し、選んでから変更してください。対象ごとに違うMaterialも選べるようにしてください。指定した対象だけ割り当てを変え、ほかのEntityや共有Material自体は変更しないでください。`, true);
    const primitive = generation?.progress.recentEvents.some(event => event.saved && event.entityId === entity.id)
      && generation.plan?.objects.some(object => ["box", "plane", "sphere", "cylinder", "cone"].includes(object.shape) && object.name === entity.name);
    if (blenderAvailable && primitive) add(`entity-blender:${entity.id}`, "PrimitiveをBlenderで仕上げる", `添付したEntity「${name}」をBlenderのモデルに置き換えて仕上げたいです。配置・名前・親子関係を保つ形で3つの仕上げ案を提案し、選んでから進めてください。`, true);
  }

  const skyResult = generation?.plan?.objects.some(object => object.settings?.some(setting => /^(?:Skybox|IBL)/u.test(setting.label)) || /^Skybox(?:を|の|：|$)/u.test(object.name));
  if (skyResult && !explicit) {
    add("sky-choices", "空の雰囲気を見比べて選ぶ", "今のSceneに合うSkyboxを、使える素材から最大12候補、合う順にサムネイル付きで提案し、選んでから設定してください。");
    add("sky-lighting", "空の明るさ・照明を調整", "今の空を保ち、Skyboxの明るさとAmbient LightをSceneに合わせて調整したいです。3つの選択肢で雰囲気を確認してから変更してください。");
  }
  if (explicit && result.length) return result;
  add("primitive-layout", "Primitiveで配置を考える", "まずPrimitiveで大まかな配置を考えたいです。このSceneの用途に合う配置を3つの選択肢で確認し、選んでから進めてください。");
  add("environment", "空・照明の雰囲気を選ぶ", "今のSceneに合うSkyboxを使える素材から最大12候補、合う順に見比べて選びたいです。選んだ空に合わせて照明も設定してください。");
  addSceneMaterials();
  return result;
}
