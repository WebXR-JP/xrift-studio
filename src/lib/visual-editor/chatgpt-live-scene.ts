import type { ChatgptGeneration } from "./chatgpt-generation";
import { sanitizeChatgptHistoryText, type ChatgptConversationTurn } from "./chatgpt-sessions";

export const CHATGPT_SCENE_REPLAN_LIMIT = 2;
export type ChatgptSceneRetry = {
  attempt: number;
  completed: number;
  conversation: ChatgptConversationTurn[];
  reconfirm: boolean;
};

/** Saved steps are evidence; a previous, partly executed plan is not completion. */
export function chatgptSceneRetryConversation(history: ChatgptConversationTurn[], job: ChatgptGeneration): ChatgptConversationTurn[] {
  const saved = job.progress.recentEvents.filter(event => event.saved).map(event => event.message);
  const result = sanitizeChatgptHistoryText([
    "同じ依頼の制作中に手動編集が加わりました。現在のSceneを優先し、手動編集を保持して未完了の作業だけを提案してください。",
    `この依頼で保存済みの作業は${job.progress.completed}件です。下記の作業や現在存在するEntityを重複して追加しないでください。`,
    ...saved,
    job.plan?.remainingWork ? `以前のPlanに残っていた作業: ${job.plan.remainingWork}` : "以前のPlanの未実行項目を完了済みと扱わないでください。",
  ].join("\n"), 2000);
  const updated = { prompt: sanitizeChatgptHistoryText(job.prompt, 2000), result };
  // Replace the previous automatic continuation rather than spending the
  // conversation budget repeating the same request after another edit.
  const previous = history[history.length - 1];
  const retained = previous?.result.startsWith("同じ依頼の制作中に手動編集が加わりました。") ? history.slice(0, -1) : history;
  const conversation = [...retained.slice(-5), updated];
  while (conversation.length > 1 && new TextEncoder().encode(JSON.stringify(conversation)).byteLength > 23 * 1024) conversation.shift();
  return conversation;
}
