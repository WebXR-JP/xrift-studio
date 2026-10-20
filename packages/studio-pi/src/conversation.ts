import type { PiContext } from "./protocol.js";

/** Pi's SessionManager restores the conversation; only the new user action is appended. */
export function studioUserMessage(prompt: string, context: PiContext): string {
  const { continuation, legacyConversation, ...conditions } = context;
  const action = continuation?.kind === "approved_plan"
    ? `利用者が次のPlanを承認しました。現在のSceneを再確認し、承認した内容を進めてください。\n${JSON.stringify(continuation.plan)}`
    : continuation?.kind === "answers"
      ? `確認事項への利用者の回答です。これまでの会話と現在のSceneに合わせて続きを進めてください。\n${JSON.stringify(continuation.answers)}`
      : prompt;
  return [action, `Studioの現在の作業条件：\n${JSON.stringify(conditions)}`,
    ...(legacyConversation?.length ? [`Piへ移行する以前の会話（現在のSceneを正本として参照）：\n${JSON.stringify(legacyConversation)}`] : [])].join("\n\n");
}
