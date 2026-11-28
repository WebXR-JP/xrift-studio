import type { PrototypeVisualProject } from "./prototype-project";

/** Only same-Scene authoring conflicts are eligible for planning again. */
export class ChatgptSceneConflictError extends Error {
  constructor(message = "変更対象のEntity・素材・Skyboxがプランの作成後に編集されました。現在の編集内容を残すため反映を停止しました。最新の状態からプランを作り直してください") {
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

export function assertChatgptPlanningCurrent(bundle: PrototypeVisualProject, expected: string) {
  if (chatgptPlanningSnapshot(bundle) !== expected) throw new ChatgptSceneConflictError("制作プランを作成している間にSceneや素材が編集されました。最新の内容から考え直します");
}
