import type { SceneEntity } from "./scene-document";

/** A user action in this Scene; it never sends a model request by itself. */
export type ChatgptComposerRequest = {
  id: string;
  sceneScope: string;
  entityId: string;
  prompt?: string;
  modelSource?: "auto";
};

export const ENTITY_REMAKE_BRIEF_MARKER = "希望する仕上がり：";

export function entityRemakePrompt(entity: SceneEntity): string {
  const name = [...entity.name.replace(/[\u0000-\u001f\u007f]/gu, " ")].slice(0, 80).join("");
  const brief = entity.components.some(component => component.type === "text")
    ? "角丸と余白のある、読みやすい案内UI。"
    : "用途が伝わる形と、統一感のある色・質感。";
  return `添付した「${name}」を、今のワールドに合う見た目に仕上げてください。\n${ENTITY_REMAKE_BRIEF_MARKER}\n${brief}\n\n現在の用途・大きさ・周囲との関係を確認し、既存のAssets、利用できる外部素材、コード、Blenderから適した方法を選んでください。案内やメニューなどのUIには、必要に応じて@react-three/uikitを使い、角丸・余白・文字の階層を整えてください。\n外部素材は利用条件と描画負荷を確認し、必要なものだけ取り込んでください。位置・回転・大きさ、既存のしかけ、手動で追加した子Entityは保ってください。変更する見た目は同じEntityを起点に更新し、元の表示と重複させないでください。\nVRとWebGLでの読みやすさと負荷を考慮し、保存後に実際の表示を確認してください。UIやしかけはPlayでも確認し、未確認の点は伝えてください。`;
}
