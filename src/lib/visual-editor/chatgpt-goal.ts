import type { ChatgptGeneration, ChatgptGenerationMode } from "./chatgpt-generation";
import { sanitizeChatgptHistoryText, type ChatgptConversationTurn } from "./chatgpt-sessions";

export function parseChatgptComposerRequest(value: string): { prompt: string; mode: ChatgptGenerationMode } {
  const prompt = value.trim();
  const command = /^\/goal(?:\s+|$)/iu.exec(prompt);
  return command ? { prompt: prompt.slice(command[0].length).trim(), mode: "goal" } : { prompt, mode: "build" };
}

/** A changed pass always gets a fresh review, even if the model said it was done. */
export function chatgptGoalNextPass(job: ChatgptGeneration, changed: boolean) {
  if (job.mode !== "goal" || (!changed && !job.plan?.hasMore)) return null;
  const noProgressPasses = changed ? 0 : (job.goal?.noProgressPasses ?? 0) + 1;
  if (noProgressPasses >= 3) throw new Error("目標に向けた変更が3回続けて進まなかったため、制作を停止しました。保存済みの変更は残っています。目標や対象を具体的にして再開してください。");
  return { iteration: (job.goal?.iteration ?? 1) + 1, noProgressPasses };
}

export function chatgptGoalConversation(history: ChatgptConversationTurn[], job: ChatgptGeneration): ChatgptConversationTurn[] {
  const prefix = "目標に向けた継続制作の記録";
  const result = sanitizeChatgptHistoryText([
    `${prefix}（${job.goal?.iteration ?? 1}回目）。最新のSceneを正本として全体を見直してください。`,
    `この依頼の保存済み作業: ${job.progress.completed}件。完了した変更や既存Entityを重複して追加しないでください。`,
    ...(job.plan?.remainingWork ? [`残りの作業: ${job.plan.remainingWork}`] : []),
    ...job.progress.recentEvents.filter(event => event.saved).slice(-16).map(event => event.message),
    "目標の範囲で構成、配置、見た目、整合性を確認し、必要な改善だけを提案してください。すべて満たして追加の変更が不要なら、操作を空にしてhasMore=falseにしてください。",
  ].join("\n"), 2000);
  const retained = history.filter(turn => !turn.result.startsWith(prefix));
  const conversation = [...retained.slice(-5), { prompt: sanitizeChatgptHistoryText(job.prompt, 2000), result }];
  while (conversation.length > 1 && new TextEncoder().encode(JSON.stringify(conversation)).byteLength > 23 * 1024) conversation.shift();
  return conversation;
}
