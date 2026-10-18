import type { ChatgptGeneration } from "./chatgpt-generation";
import { sanitizeChatgptHistoryText, type ChatgptConversationTurn } from "./chatgpt-sessions";

export type ChatgptProduction = {
  scope: "edit" | "model" | "environment" | "world";
  detail: "focused" | "balanced" | "overview";
  focus: string;
  criteria: string[];
  maxPasses: number;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && Boolean(value.trim()) && [...value].length <= limit && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const productionKeys = ["scope", "detail", "focus", "criteria", "maxPasses"];
const prefix = "制作方針を固定した継続記録";

/** Null/missing is the legacy one-pass contract; scope is never guessed from text. */
export function parseChatgptProduction(value: unknown): ChatgptProduction | undefined {
  if (value === undefined || value === null) return undefined;
  if (!record(value) || Object.keys(value).some(key => !productionKeys.includes(key))
    || typeof value.scope !== "string" || !["edit", "model", "environment", "world"].includes(value.scope)
    || typeof value.detail !== "string" || !["focused", "balanced", "overview"].includes(value.detail) || !text(value.focus, 160)
    || !Array.isArray(value.criteria) || value.criteria.length < 1 || value.criteria.length > 6
    || new Set(value.criteria).size !== value.criteria.length
    || !value.criteria.every(criterion => text(criterion, 240) && Boolean(criterion.trim()))
    || !Number.isInteger(value.maxPasses) || (value.maxPasses as number) < 1 || (value.maxPasses as number) > 6) {
    throw new Error("制作の範囲・細かさ・完了条件・回数の上限を確認できませんでした");
  }
  return { scope: value.scope as ChatgptProduction["scope"], detail: value.detail as ChatgptProduction["detail"],
    focus: value.focus, criteria: [...value.criteria] as string[], maxPasses: value.maxPasses as number };
}

/** A later plan cannot reset the agreed direction or its request-wide budget. */
export function chatgptProductionDirection(previous: unknown, proposed: unknown): ChatgptProduction | undefined {
  const retained = parseChatgptProduction(previous);
  if (retained) return retained;
  const initial = parseChatgptProduction(proposed);
  // Reserve room for construction, visual review and a correction before the
  // first pass starts. Completion can still finish on the first approved pass.
  // Never extend a budget already stored with an in-flight or restored run.
  return initial && chatgptProductionNeedsWorldReview(initial)
    ? { ...initial, maxPasses: Math.max(3, initial.maxPasses) } : initial;
}

export function chatgptProductionNeedsWorldReview(direction?: ChatgptProduction): boolean {
  return direction?.scope === "environment" || direction?.scope === "world";
}

export type ChatgptProductionContinuation = { pass: number; noProgressPasses: number; remainingWork: string };

export class ChatgptProductionLimitError extends Error {
  constructor(readonly reason: "budget" | "no-progress" | "review-required", readonly remainingWork: string, message: string) { super(message); }
}

/** Called after saved Scene changes. An overall production cannot complete
 * until the real Scene images have passed the final review. */
export function chatgptProductionNextPass(job: ChatgptGeneration, input: {
  changed: boolean;
  review?: { approved: boolean; remainingWork?: string };
  noProgressPasses?: number;
  requireVisualReview?: boolean;
}): ChatgptProductionContinuation | null {
  const direction = parseChatgptProduction(job.production);
  if (!direction || job.status === "planned" || job.plan?.questions?.length || job.mode === "plan") return null;
  const wholeScene = chatgptProductionNeedsWorldReview(direction) || input.requireVisualReview === true;
  if (!wholeScene && job.mode !== "goal" && !job.plan?.hasMore) return null;
  const pass = job.productionPass ?? 1;
  if (!Number.isSafeInteger(pass) || pass < 1) throw new Error("制作の進行状況を確認できませんでした");
  const remainingWork = sanitizeChatgptHistoryText(input.review?.remainingWork?.trim() || job.plan?.remainingWork?.trim() || direction.criteria.join("、"), 600);
  if (wholeScene && !job.plan?.hasMore && !input.review) {
    throw new ChatgptProductionLimitError("review-required", remainingWork, `全体の見直しが完了していません。保存済みのSceneを確認してください。確認する項目: ${remainingWork}`);
  }
  const unfinished = Boolean(job.plan?.hasMore || input.review?.approved === false);
  if (!unfinished) return null;
  if (pass >= 12) {
    throw new ChatgptProductionLimitError("budget", remainingWork, `見直しを重ねても完成条件に届かなかったため停止しました。保存済みのSceneは残っています。未確認・未完了の項目: ${remainingWork}`);
  }
  const previousNoProgress = input.noProgressPasses ?? job.productionNoProgressPasses ?? 0;
  if (!Number.isSafeInteger(previousNoProgress) || previousNoProgress < 0) throw new Error("制作の進行状況を確認できませんでした");
  const noProgressPasses = input.changed ? 0 : previousNoProgress + 1;
  if (noProgressPasses >= 3) {
    throw new ChatgptProductionLimitError("no-progress", remainingWork, `Sceneに変化がない状態が続いたため停止しました。保存済みのSceneは残っています。未確認・未完了の項目: ${remainingWork}`);
  }
  return { pass: pass + 1, noProgressPasses, remainingWork };
}

/** The original direction and all completion criteria take priority over
 * repeated logs inside the bounded continuation context. */
export function chatgptProductionConversation(history: ChatgptConversationTurn[], job: ChatgptGeneration,
  continuation: ChatgptProductionContinuation): ChatgptConversationTurn[] {
  const direction = parseChatgptProduction(job.production);
  if (!direction) return history;
  const fixed = [prefix, `範囲: ${direction.scope}。細かさ: ${direction.detail}。焦点: ${direction.focus}。`,
    "完了条件:", ...direction.criteria.map((criterion, index) => `${index + 1}. ${criterion}`),
    `最新のScene JSONを正本として、差分が残る部分だけを少しずつ変えてください。`,
    "初回の方針と完了条件を保ち、最新Sceneから未完了の作業だけを続けてください。既存Entityや完了した作業を重複追加しないでください。"].join("\n");
  const available = Math.max(0, 2000 - [...sanitizeChatgptHistoryText(fixed, 2000)].length - 1);
  const updates = [`未完了: ${continuation.remainingWork}`, ...job.progress.recentEvents.filter(event => event.saved).slice(-4).map(event => event.message)].join("\n");
  const result = sanitizeChatgptHistoryText(`${fixed}\n${sanitizeChatgptHistoryText(updates, available)}`, 2000);
  const retained = history.filter(turn => !turn.result.startsWith(prefix));
  const conversation = [...retained.slice(-5), { prompt: sanitizeChatgptHistoryText(job.prompt, 2000), result }];
  while (conversation.length > 1 && new TextEncoder().encode(JSON.stringify(conversation)).byteLength > 23 * 1024) conversation.shift();
  return conversation;
}
