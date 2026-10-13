import type { PrototypeVisualProject } from "./prototype-project";
import type { ChatgptWorldPlan } from "./chatgpt-world";
import { resolveSceneSettings } from "./scene-settings";
import type { ExternalStoreAsset } from "../tauri";
import { resolveChatgptCandidate, type ChatgptOperation, type ChatgptResourceContext } from "./chatgpt-resources";

/** Only fingerprint values the plan can overwrite; unrelated edits may continue. */
export function chatgptPlanSnapshots(bundle: PrototypeVisualProject, plan: ChatgptWorldPlan): Record<string, string> {
  const result: Record<string, string> = {};
  for (const edit of plan.edits ?? []) result[`entity:${edit.entityId}`] = JSON.stringify(bundle.scene.entities[edit.entityId]);
  for (const operation of plan.operations ?? []) {
    if ("entityId" in operation) result[`entity:${operation.entityId}`] = JSON.stringify(bundle.scene.entities[operation.entityId]);
    if (operation.kind === "skybox") result.skybox = JSON.stringify(resolveSceneSettings(bundle.scene.settings).skybox);
    if ("candidateId" in operation && operation.candidateId?.startsWith("project:")) {
      const id = operation.candidateId.slice("project:".length);
      const asset = bundle.assets.assets[id];
      if (asset) { const { thumbnail: _thumbnail, ...authored } = asset; result[`asset:${id}`] = JSON.stringify(authored); }
    }
  }
  return result;
}
export function assertChatgptPlanCurrent(bundle: PrototypeVisualProject, plan: ChatgptWorldPlan, expected: Record<string, string>) {
  const current = chatgptPlanSnapshots(bundle, plan);
  if (Object.keys(current).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => current[key] !== value)) {
    throw new Error("変更するEntity・素材・SkyboxがPlanの作成後に編集されました。編集内容を保ち、Planの反映を停止しました。Planを作り直してください");
  }
}
export function chatgptOperationLabel(operation: NonNullable<ChatgptWorldPlan["operations"]>[number], bundle: PrototypeVisualProject) {
  const labels = { skybox: "Skyboxを設定", audio: "Audio Sourceを設定", "mesh-collision": "Colliderを設定", "model-attachment": "モデルを設定", material: "Materialを設定", catalog: "素材を追加" };
  const name = "entityId" in operation ? bundle.scene.entities[operation.entityId]?.name : operation.kind === "catalog" ? operation.name : undefined;
  return name ? `${name}：${labels[operation.kind]}` : labels[operation.kind];
}

/** Public proposed values, using catalog names instead of opaque reference IDs. */
export function chatgptOperationDetail(operation: ChatgptOperation, resources: ChatgptResourceContext,
  externalCandidates: readonly ExternalStoreAsset[] = []): string {
  const number = (value: number) => new Intl.NumberFormat("ja-JP", { useGrouping: false, maximumFractionDigits: 3 }).format(value);
  const state = (value: boolean) => value ? "有効" : "無効";
  const candidate = "candidateId" in operation && operation.candidateId
    ? resolveChatgptCandidate(operation.candidateId, resources, externalCandidates) : undefined;
  const name = candidate ? [...candidate.asset.name.replace(/\s+/g, " ").trim()].slice(0, 80).join("") : "";
  if (operation.kind === "mesh-collision") return operation.action === "add" ? "Colliderを追加" : "Colliderを解除";
  if (operation.kind === "model-attachment") return `${name || "選択したモデル"}を装着（名前・位置・回転・スケールを保持）`;
  if (operation.kind === "material") return `Material：${name || "選択したMaterial"}`;
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
