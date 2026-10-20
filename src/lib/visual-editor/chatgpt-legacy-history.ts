import { normalizeAuthoringProgress, type AuthoringProgress } from "./authoring-progress";

/** Strict decoder for legacy execution history. This module does not execute authoring. */
export type ChatgptHarnessKind = "context" | "plan" | "prepare" | "model" | "write" | "save" | "inspect" | "model-review" | "capture" | "tool";
export type ChatgptHarnessPhase = "idle" | "running" | "paused" | "stopping" | "completed" | "cancelled" | "failed";
export type ChatgptHarnessLimits = {
  maxPasses: number; maxRepairs: number; maxModelCalls: number; maxWrites: number; maxActiveMs: number; maxStepMs: number;
};
export type ChatgptHarnessEvent = {
  sequence: number; attempt: number; pass: number;
  phase: ChatgptHarnessKind | "run" | "commit" | "inspection" | "progress";
  outcome: "started" | "succeeded" | "failed" | "cancelled" | "paused" | "continued" | "completed";
  label: string; at: number; code?: string;
};
export type ChatgptHarnessInspection = { fingerprint: string; approved: boolean; views: number; pass: number; evidence?: string };
export type ChatgptHarnessSnapshot = {
  version: 1; runId: string; phase: ChatgptHarnessPhase; limits: ChatgptHarnessLimits;
  counters: { passes: number; repairs: number; modelCalls: number; writes: number; attempts: number; activeMs: number };
  sequence: number; dirty: boolean; committedFingerprint?: string; savedFingerprint?: string;
  inspection?: ChatgptHarnessInspection; progress?: AuthoringProgress; events: ChatgptHarnessEvent[]; reason?: string;
};
class ChatgptHarnessError extends Error {
  constructor(public readonly code: "invalid-snapshot" | "invalid-input", message: string) { super(message); this.name = "ChatgptHarnessError"; }
}
const EVENT_LIMIT = 128;
const phases = new Set<ChatgptHarnessPhase>(["idle", "running", "paused", "stopping", "completed", "cancelled", "failed"]);
const kinds = new Set<string>(["context", "plan", "prepare", "model", "write", "save", "inspect", "model-review", "capture", "tool", "run", "commit", "inspection", "progress"]);
const outcomes = new Set<string>(["started", "succeeded", "failed", "cancelled", "paused", "continued", "completed"]);
const limitCeilings: ChatgptHarnessLimits = { maxPasses: 128, maxRepairs: 64, maxModelCalls: 256, maxWrites: 4096, maxActiveMs: 24 * 60 * 60_000, maxStepMs: 60 * 60_000 };
const counterKeys = ["passes", "repairs", "modelCalls", "writes", "attempts", "activeMs"] as const;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function keys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value); }
function fingerprint(value: unknown): value is string { return text(value, 256); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
}
function invalid(): never { throw new ChatgptHarnessError("invalid-snapshot", "制作の実行記録を読み込めません。最新のSceneから制作を再開してください。"); }
function resolveLimits(value: unknown): ChatgptHarnessLimits {
  const fields = Object.keys(limitCeilings) as (keyof ChatgptHarnessLimits)[];
  if (!object(value) || !keys(value, fields)) invalid();
  const result = {} as ChatgptHarnessLimits;
  for (const key of fields) {
    if (!integer(value[key], key === "maxRepairs" ? 0 : 1, limitCeilings[key])) invalid();
    result[key] = value[key];
  }
  return result;
}

/** Strict restoration boundary. Unknown versions and malformed or oversized records fail closed. */
export function normalizeChatgptHarnessSnapshot(value: unknown): ChatgptHarnessSnapshot {
  if (!object(value) || !keys(value, ["version", "runId", "phase", "limits", "counters", "sequence", "dirty", "committedFingerprint", "savedFingerprint", "inspection", "progress", "events", "reason"])
    || value.version !== 1 || !text(value.runId, 160) || !phases.has(value.phase as ChatgptHarnessPhase)
    || typeof value.dirty !== "boolean" || !integer(value.sequence) || !object(value.counters) || !keys(value.counters, [...counterKeys])) invalid();
  const limits = resolveLimits(value.limits);
  const counters = {} as ChatgptHarnessSnapshot["counters"];
  for (const key of counterKeys) { if (!integer(value.counters[key])) invalid(); counters[key] = value.counters[key]; }
  if (counters.passes > limits.maxPasses || counters.repairs > limits.maxRepairs || counters.repairs > counters.passes || counters.modelCalls > limits.maxModelCalls || counters.writes > limits.maxWrites
    || counters.attempts > 100_000 || counters.activeMs > limitCeilings.maxActiveMs + limitCeilings.maxStepMs) invalid();
  for (const key of ["committedFingerprint", "savedFingerprint"] as const) if (own(value, key) && !fingerprint(value[key])) invalid();
  if (own(value, "reason") && !text(value.reason, 240)) invalid();
  let inspection: ChatgptHarnessInspection | undefined;
  let progress: AuthoringProgress | undefined;
  if (own(value, "progress")) {
    try { progress = normalizeAuthoringProgress(value.progress, counters.passes); } catch { invalid(); }
  }
  if (own(value, "inspection")) {
    const entry = value.inspection;
    if (!object(entry) || !keys(entry, ["fingerprint", "approved", "views", "pass", "evidence"]) || !fingerprint(entry.fingerprint)
      || typeof entry.approved !== "boolean" || !integer(entry.views, 0, 8) || !integer(entry.pass, 0, counters.passes)
      || (own(entry, "evidence") && !text(entry.evidence, 240))) invalid();
    inspection = { fingerprint: entry.fingerprint, approved: entry.approved, views: entry.views, pass: entry.pass, ...(typeof entry.evidence === "string" ? { evidence: entry.evidence } : {}) };
  }
  if (!Array.isArray(value.events) || value.events.length > EVENT_LIMIT) invalid();
  const events: ChatgptHarnessEvent[] = [];
  let previous = value.sequence - value.events.length;
  if (previous < 0) invalid();
  for (const event of value.events) {
    if (!object(event) || !keys(event, ["sequence", "attempt", "pass", "phase", "outcome", "label", "at", "code"])
      || !integer(event.sequence, 1) || event.sequence !== previous + 1 || !integer(event.attempt, 0, counters.attempts)
      || !integer(event.pass, 0, counters.passes) || !kinds.has(event.phase as string) || !outcomes.has(event.outcome as string)
      || !text(event.label, 160) || !integer(event.at) || (own(event, "code") && !text(event.code, 80))) invalid();
    events.push({ sequence: event.sequence, attempt: event.attempt, pass: event.pass, phase: event.phase as ChatgptHarnessEvent["phase"], outcome: event.outcome as ChatgptHarnessEvent["outcome"], label: event.label, at: event.at, ...(typeof event.code === "string" ? { code: event.code } : {}) });
    previous = event.sequence;
  }
  if (previous !== value.sequence || (value.phase === "completed" && (value.dirty || !fingerprint(value.savedFingerprint) || value.committedFingerprint !== value.savedFingerprint))) invalid();
  return freeze({ version: 1, runId: value.runId, phase: value.phase as ChatgptHarnessPhase, limits, counters, sequence: value.sequence, dirty: value.dirty,
    ...(typeof value.committedFingerprint === "string" ? { committedFingerprint: value.committedFingerprint } : {}),
    ...(typeof value.savedFingerprint === "string" ? { savedFingerprint: value.savedFingerprint } : {}),
    ...(inspection ? { inspection } : {}), ...(progress ? { progress } : {}), events, ...(typeof value.reason === "string" ? { reason: value.reason } : {}) });
}

/** Process restart never restores automatic execution authority. */
export function interruptChatgptHarnessSnapshot(value: unknown, reason = "interrupted"): ChatgptHarnessSnapshot {
  const restored = normalizeChatgptHarnessSnapshot(value);
  if (!text(reason, 240)) throw new ChatgptHarnessError("invalid-input", "停止理由が不正です。");
  if (!["running", "stopping"].includes(restored.phase)) return restored;
  const next = structuredClone(restored);
  next.phase = "cancelled"; next.reason = reason;
  next.events.push({ sequence: ++next.sequence, attempt: next.counters.attempts, pass: next.counters.passes, phase: "run", outcome: "cancelled", label: "中断された制作を停止しました", at: Date.now(), code: "interrupted" });
  next.events = next.events.slice(-EVENT_LIMIT);
  return normalizeChatgptHarnessSnapshot(next);
}
