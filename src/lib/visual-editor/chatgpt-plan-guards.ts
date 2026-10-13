import type { PrototypeVisualProject } from "./prototype-project";
import type { ChatgptWorldPlan } from "./chatgpt-world";
import { resolveSceneSettings } from "./scene-settings";

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
