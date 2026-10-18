import type { ChatgptGeneration } from "./chatgpt-generation";
import { sanitizeChatgptHistoryText, type ChatgptConversationTurn } from "./chatgpt-sessions";

export const CHATGPT_SCENE_REPLAN_LIMIT = 2;
export type ChatgptSceneRetry = {
  attempt: number;
  completed: number;
  conversation: ChatgptConversationTurn[];
  reconfirm: boolean;
  reason?: "plan-input" | "clarification" | "agent";
};

/** Agent continuation: the latest Scene is the only source of truth. Saved
 * steps are evidence of what exists now, never a reason to add it again. */
export function chatgptAgentConversation(history: ChatgptConversationTurn[], job: ChatgptGeneration): ChatgptConversationTurn[] {
  const saved = job.progress.recentEvents.filter(event => event.saved).map(event => event.message);
  const result = sanitizeChatgptHistoryText([
    "最新のScene JSONを正本として、残っている差分だけを提案してください。進め方の原則: 既存を再利用して最小の差分にする。現在の値と同じ設定は再指定しない。1件ずつSceneに反映できる単位に分ける。",
    `この依頼で反映済みの作業は${job.progress.completed}件です。下記の作業や現在存在するEntityを重複して追加しないでください。`,
    ...saved.slice(-16),
    job.plan?.remainingWork ? `以前のPlanに残っていた作業: ${job.plan.remainingWork}` : "追加の変更が不要なら、操作を空にしてください。",
  ].join("\n"), 2000);
  const updated = { prompt: sanitizeChatgptHistoryText(job.prompt, 2000), result };
  const previous = history[history.length - 1];
  const retained = previous?.result.startsWith("最新のScene JSONを正本として") ? history.slice(0, -1) : history;
  const conversation = [...retained.slice(-5), updated];
  while (conversation.length > 1 && new TextEncoder().encode(JSON.stringify(conversation)).byteLength > 23 * 1024) conversation.shift();
  return conversation;
}

/** Saved steps are evidence; a previous, partly executed plan is not completion. */
export function chatgptSceneRetryConversation(history: ChatgptConversationTurn[], job: ChatgptGeneration, failure?: string): ChatgptConversationTurn[] {
  const saved = job.progress.recentEvents.filter(event => event.saved).map(event => event.message);
  const result = sanitizeChatgptHistoryText([
    failure ? "同じ依頼の制作中に素材・設定の前提が不足していました。現在のSceneと利用可能な素材を確認し、不足を解決して未完了の作業だけを提案してください。" : "同じ依頼の制作中に手動編集が加わりました。現在のSceneを優先し、手動編集を保持して未完了の作業だけを提案してください。",
    ...(failure ? [`未反映の操作と理由: ${sanitizeChatgptHistoryText(failure, 500)}`, "失敗した操作を同じ条件で繰り返さず、必要な素材を先に選ぶか、利用可能な設定・操作へ変更してください。保存済みの変更と手動編集は保持してください。"] : []),
    `この依頼で保存済みの作業は${job.progress.completed}件です。下記の作業や現在存在するEntityを重複して追加しないでください。`,
    ...saved,
    job.plan?.remainingWork ? `以前のPlanに残っていた作業: ${job.plan.remainingWork}` : "以前のPlanの未実行項目を完了済みと扱わないでください。",
  ].join("\n"), 2000);
  const updated = { prompt: sanitizeChatgptHistoryText(job.prompt, 2000), result };
  // Replace the previous automatic continuation rather than spending the
  // conversation budget repeating the same request after another edit.
  const previous = history[history.length - 1];
  const retained = previous?.result.startsWith("同じ依頼の制作中に") ? history.slice(0, -1) : history;
  const conversation = [...retained.slice(-5), updated];
  while (conversation.length > 1 && new TextEncoder().encode(JSON.stringify(conversation)).byteLength > 23 * 1024) conversation.shift();
  return conversation;
}
