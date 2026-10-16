import type { PrototypeVisualProject } from "./prototype-project";
import type { ChatgptWorldPlan } from "./chatgpt-world";
import { resolveSceneSettings } from "./scene-settings";
import type { ExternalStoreAsset } from "../tauri";
import { resolveChatgptCandidate, type ChatgptOperation, type ChatgptResourceContext } from "./chatgpt-resources";
import { CHATGPT_EDITOR_ACTIONS, parseChatgptComponentProperties, parseChatgptMaterialProperties, parseChatgptSceneSettings } from "./chatgpt-editor-actions";
import { chatgptAttachmentEntityIds } from "./chatgpt-attachments";
import { chatgptMaterialSettingsDisplay, chatgptSceneSettingsLabel, describeChatgptSceneSettings } from "./chatgpt-change-description";
import { chatgptSceneMaterialTargets } from "./chatgpt-scene-material";

/** Only same-Scene authoring conflicts are eligible for planning again. */
export class ChatgptSceneConflictError extends Error {
  constructor(message = "変更するEntity・素材・SkyboxがPlanの作成後に編集されました。編集内容を保ち、Planの反映を停止しました。Planを作り直してください") {
    super(message);
    this.name = "ChatgptSceneConflictError";
  }
}

/** Fresh reasoning must see author edits anywhere in its input, not just its eventual targets. */
export function chatgptPlanningSnapshot(bundle: PrototypeVisualProject): string {
  const assets = { ...bundle.assets, assets: Object.fromEntries(Object.entries(bundle.assets.assets).map(([id, asset]) => {
    const { thumbnail: _thumbnail, ...authored } = asset;
    return [id, authored];
  })) };
  return JSON.stringify({ title: bundle.project.metadata.title ?? bundle.project.metadata.name, scene: bundle.scene, assets, prefabs: bundle.prefabs });
}

/** Fingerprint authored values the plan changes or reuses; unrelated edits may continue. */
export function chatgptPlanSnapshots(bundle: PrototypeVisualProject, plan: ChatgptWorldPlan): Record<string, string> {
  const result: Record<string, string> = {};
  const snapshotProjectAsset = (reference?: string) => {
    if (!reference?.startsWith("project:")) return;
    const id = reference.slice("project:".length);
    const asset = bundle.assets.assets[id];
    if (asset) { const { thumbnail: _thumbnail, ...authored } = asset; result[`asset:${id}`] = JSON.stringify(authored); }
  };
  for (const object of plan.objects) {
    snapshotProjectAsset(object.externalId);
    snapshotProjectAsset(object.materialExternalId);
  }
  for (const edit of plan.edits ?? []) result[`entity:${edit.entityId}`] = JSON.stringify(bundle.scene.entities[edit.entityId]);
  for (const operation of plan.operations ?? []) {
    if (operation.kind === "material-scene") result.materialScene = chatgptPlanningSnapshot(bundle);
    if ("entityId" in operation && operation.entityId) result[`entity:${operation.entityId}`] = JSON.stringify(bundle.scene.entities[operation.entityId]);
    if (operation.kind === "entity-delete") {
      for (const id of chatgptAttachmentEntityIds(Object.values(bundle.scene.entities), [operation.entityId])) result[`entity:${id}`] = JSON.stringify(bundle.scene.entities[id]);
      const parentId = bundle.scene.entities[operation.entityId]?.parentId;
      if (parentId) result[`entity:${parentId}`] = JSON.stringify(bundle.scene.entities[parentId]);
    }
    if (operation.kind === "skybox") result.skybox = JSON.stringify(resolveSceneSettings(bundle.scene.settings).skybox);
    if (operation.kind === "scene-settings") for (const key of Object.keys(parseChatgptSceneSettings(operation.settingsJson))) result[`settings:${key}`] = JSON.stringify(resolveSceneSettings(bundle.scene.settings)[key as keyof ReturnType<typeof resolveSceneSettings>]);
    if ("candidateId" in operation) snapshotProjectAsset(operation.candidateId);
  }
  return result;
}
export function assertChatgptPlanCurrent(bundle: PrototypeVisualProject, plan: ChatgptWorldPlan, expected: Record<string, string>) {
  const current = chatgptPlanSnapshots(bundle, plan);
  if (Object.keys(current).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => current[key] !== value)) {
    throw new ChatgptSceneConflictError();
  }
}
export function assertChatgptPlanningCurrent(bundle: PrototypeVisualProject, expected: string) {
  if (chatgptPlanningSnapshot(bundle) !== expected) throw new ChatgptSceneConflictError("制作を考えている間にSceneや素材が編集されました。最新の内容から続きを考えます");
}
export function chatgptOperationLabel(operation: NonNullable<ChatgptWorldPlan["operations"]>[number], bundle: PrototypeVisualProject) {
  if (operation.kind === "material-scene") return "Scene全体のMaterialを一括変更";
  if (operation.kind === "scene-settings") return chatgptSceneSettingsLabel(parseChatgptSceneSettings(operation.settingsJson));
  if (operation.kind === "material-update") return `${bundle.assets.assets[operation.candidateId.slice(8)]?.name ?? "Material"}の設定を変更`;
  const labels: Partial<Record<ChatgptOperation["kind"], string>> = { skybox: "Skyboxを設定", audio: "Audio Sourceを設定", "mesh-collision": "Colliderを設定", "model-attachment": "モデルを設定", material: "Materialを設定", catalog: "素材を追加", "blender-model": "Blenderでモデルを作成" };
  const label = CHATGPT_EDITOR_ACTIONS.find(spec => spec.kind === operation.kind)?.label ?? labels[operation.kind] ?? "操作";
  const name = "entityId" in operation && operation.entityId ? bundle.scene.entities[operation.entityId]?.name : operation.kind === "catalog" || operation.kind === "component-add" ? operation.name : operation.kind === "blender-model" ? operation.model.name : undefined;
  return name ? `${name}：${label}` : label;
}

function materialUpdateDescription(operation: Extract<ChatgptOperation, { kind: "material-update" }>, before?: PrototypeVisualProject, after?: PrototypeVisualProject): string {
  const patch = parseChatgptMaterialProperties(operation.propertiesJson);
  const old = before?.assets.assets[operation.candidateId.slice(8)], next = after?.assets.assets[operation.candidateId.slice(8)];
  return chatgptMaterialSettingsDisplay(patch, old?.kind === "material" ? old : undefined, next?.kind === "material" ? next : undefined)
    .map(setting => `${setting.label}：${setting.previousValue !== undefined ? `${setting.previousValue} → ` : ""}${setting.value}`).join("、");
}

/** Public proposed values, using catalog names instead of opaque reference IDs. */
export function chatgptOperationDetail(operation: ChatgptOperation, resources: ChatgptResourceContext,
  externalCandidates: readonly ExternalStoreAsset[] = [], bundle?: PrototypeVisualProject): string {
  const number = (value: number) => new Intl.NumberFormat("ja-JP", { useGrouping: false, maximumFractionDigits: 3 }).format(value);
  if (operation.kind === "scene-settings") return describeChatgptSceneSettings(parseChatgptSceneSettings(operation.settingsJson), bundle);
  if (operation.kind === "material-update") return materialUpdateDescription(operation, bundle);
  if (operation.kind === "entity-delete") {
    if (bundle?.scene.entities[operation.entityId]?.modelNode) return "Modelの一部であるEntityを非表示にします。「変更を戻す」で復元できます。";
    const count = bundle ? chatgptAttachmentEntityIds(Object.values(bundle.scene.entities), [operation.entityId]).length : undefined;
    return `対象のEntityと配下${count !== undefined ? `（合計${count}件）` : ""}を削除します。「変更を戻す」で復元できます。`;
  }
  if (operation.kind === "component-remove") {
    const component = resources.components.find(component => component.entityId === operation.entityId && component.componentId === operation.componentId);
    const definition = resources.componentDefinitions?.find(definition => definition.id === component?.definitionId);
    return `${definition?.label ?? component?.type ?? "Component"}を対象のEntityから取り外します。「変更を戻す」で復元できます。`;
  }
  if (operation.kind === "component-add" || operation.kind === "component-update") {
    const definitionId = operation.kind === "component-add" ? operation.definitionId : resources.components.find(component => component.entityId === operation.entityId && component.componentId === operation.componentId)?.definitionId;
    const definition = resources.componentDefinitions?.find(definition => definition.id === definitionId);
    const properties = parseChatgptComponentProperties(operation.propertiesJson);
    return [definition?.label ?? definitionId ?? "公式Component", ...Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), ...(operation.enabled !== undefined ? [operation.enabled ? "有効" : "無効"] : [])].join("、");
  }
  const state = (value: boolean) => value ? "有効" : "無効";
  const candidate = "candidateId" in operation && operation.candidateId
    ? resolveChatgptCandidate(operation.candidateId, resources, externalCandidates) : undefined;
  const name = candidate ? [...candidate.asset.name.replace(/\s+/g, " ").trim()].slice(0, 80).join("") : "";
  if (operation.kind === "blender-model") {
    const action = operation.entityId ? `${operation.model.name}をBlenderで作成し、Mesh Rendererを置き換え（名前・Transform・親子関係・ほかのComponentを保持）` : `${operation.model.name}をBlenderで作成してGLBを取り込み`;
    return "brief" in operation.model ? `${action}。${operation.model.brief}` : action;
  }
  if (operation.kind === "mesh-collision") return operation.action === "add" ? "Colliderを追加" : "Colliderを解除";
  if (operation.kind === "model-attachment") return `${name || "選択したモデル"}を装着（名前・位置・回転・スケールを保持）`;
  if (operation.kind === "material") return `Material：${name || "選択したMaterial"}`;
  if (operation.kind === "material-scene") return `${name || "選択したMaterial"}をScene全体へ一括適用${bundle ? `（${chatgptSceneMaterialTargets(bundle).length}スロット）` : ""}`;
  if (operation.kind === "catalog") return `${name || "選択した素材"}を追加`;
  const details: string[] = [];
  if (operation.kind === "skybox") {
    if (operation.candidateId) details.push(`背景：${name || "選択した素材"}`);
    if (operation.enabled !== undefined) details.push(`背景 ${state(operation.enabled)}`);
    if (operation.iblEnabled !== undefined) details.push(`IBL ${state(operation.iblEnabled)}`);
    if (operation.rotationDegrees !== undefined) details.push(`回転 ${number(operation.rotationDegrees)}°`);
    if (operation.exposure !== undefined) details.push(`明るさ ${number(operation.exposure)}`);
  } else {
    if (operation.candidateId) details.push(`音声：${name || "選択した音声"}`);
    if (operation.enabled !== undefined) details.push(`音源 ${state(operation.enabled)}`);
    if (operation.volume !== undefined) details.push(`音量 ${number(operation.volume * 100)}%`);
    if (operation.loop !== undefined) details.push(`ループ ${state(operation.loop)}`);
    if (operation.spatial !== undefined) details.push(`空間音声 ${state(operation.spatial)}`);
    if (operation.autoplay !== undefined) details.push(`自動再生 ${state(operation.autoplay)}`);
  }
  return details.join("、");
}

/** The work log states concrete settings and values, using actual changes after
 * applying rather than claiming that every requested value was accepted. */
export function chatgptOperationProgress(operation: ChatgptOperation, before: PrototypeVisualProject, resources: ChatgptResourceContext,
  externalCandidates: readonly ExternalStoreAsset[] = [], after?: PrototypeVisualProject): string {
  if (operation.kind === "scene-settings") return describeChatgptSceneSettings(parseChatgptSceneSettings(operation.settingsJson), before, after);
  if (operation.kind === "material-update") return `${chatgptOperationLabel(operation, before)}：${materialUpdateDescription(operation, before, after)}`;
  if (operation.kind === "skybox" && after) return describeChatgptSceneSettings({ skybox: resolveSceneSettings(after.scene.settings).skybox }, before, after);
  const label = chatgptOperationLabel(operation, before);
  const detail = chatgptOperationDetail(operation, resources, externalCandidates, before);
  return detail ? `${label}：${detail}` : label;
}
