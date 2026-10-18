import { normalizeAuthoringProgress, observeAuthoringProgress, type AuthoringProgress, type AuthoringProgressInput, type AuthoringProgressResult } from "./authoring-progress";

/** Request-wide lifecycle for bounded authoring, independent of model and Editor adapters. */
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
export type ChatgptHarnessErrorCode = "invalid-snapshot" | "invalid-input" | "budget-passes" | "budget-repairs" | "budget-model-calls" | "budget-writes" | "stalled-progress" | "deadline" | "step-deadline" | "step-failed" | "cancelled" | "paused" | "terminal" | "busy" | "unsaved" | "inspection-required";
export class ChatgptHarnessError extends Error {
  constructor(public readonly code: ChatgptHarnessErrorCode, message: string) { super(message); this.name = "ChatgptHarnessError"; }
}
export const CHATGPT_HARNESS_DEFAULT_LIMITS: Readonly<ChatgptHarnessLimits> = Object.freeze({
  maxPasses: 12, maxRepairs: 4, maxModelCalls: 24, maxWrites: 192,
  maxActiveMs: 20 * 60_000, maxStepMs: 4 * 60_000,
});
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
function resolveLimits(value: unknown, partial = false): ChatgptHarnessLimits {
  if (!object(value) || !keys(value, Object.keys(CHATGPT_HARNESS_DEFAULT_LIMITS))) invalid();
  const result = { ...CHATGPT_HARNESS_DEFAULT_LIMITS };
  for (const key of Object.keys(result) as (keyof ChatgptHarnessLimits)[]) {
    if (partial && !own(value, key)) continue;
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

export type ChatgptHarnessStepOptions = { modelCalls?: number; write?: boolean };
export type ChatgptHarnessTool<T> = ChatgptHarnessStepOptions & { kind: ChatgptHarnessKind; label: string; work: (signal: AbortSignal) => Promise<T> };
export type ChatgptHarnessRun = {
  beginPass(reason?: "initial" | "continue" | "repair"): ChatgptHarnessSnapshot;
  step<T>(kind: ChatgptHarnessKind, label: string, work: (signal: AbortSignal) => Promise<T>, options?: ChatgptHarnessStepOptions): Promise<T>;
  tools<T>(calls: ChatgptHarnessTool<T>[], options?: { maxParallel?: number }): Promise<T[]>;
  check(): void; recordCommit(fingerprint?: string): void; observeScene(fingerprint: string): void; recordSaved(fingerprint: string): void;
  recordProgress(input: Omit<AuthoringProgressInput, "pass"> & { savedFingerprint?: string }): AuthoringProgressResult;
  recordInspection(inspection: Omit<ChatgptHarnessInspection, "pass">): void;
  finish(options: { fingerprint: string; requireInspection?: boolean; hasMore?: boolean; checkpoint?: (completed: ChatgptHarnessSnapshot) => void }): boolean;
  pause(): ChatgptHarnessSnapshot; stop(reason?: string): Promise<void>; fail(reason?: string): Promise<void>; snapshot(): ChatgptHarnessSnapshot;
};
export type CreateChatgptHarnessRunOptions = {
  runId: string; snapshot?: ChatgptHarnessSnapshot; limits?: Partial<ChatgptHarnessLimits>; signal?: AbortSignal;
  onSnapshot?: (snapshot: ChatgptHarnessSnapshot) => void | Promise<void>; onAbort?: (reason: string) => void | Promise<void>; now?: () => number;
};

/** No generated source, image bytes, model arguments, or credentials enter this journal. */
export function createChatgptHarnessRun(options: CreateChatgptHarnessRunOptions): ChatgptHarnessRun {
  if (!text(options.runId, 160)) throw new ChatgptHarnessError("invalid-input", "制作の実行IDが不正です。");
  const restored = options.snapshot ? normalizeChatgptHarnessSnapshot(options.snapshot) : undefined;
  if (restored && restored.runId !== options.runId) throw new ChatgptHarnessError("invalid-input", "別の制作の実行記録は使えません。");
  const limits = restored ? { ...restored.limits } : resolveLimits(options.limits ?? {}, true);
  if (restored && options.limits) {
    const requested = resolveLimits(options.limits, true);
    for (const key of Object.keys(limits) as (keyof ChatgptHarnessLimits)[]) if (own(options.limits, key)) limits[key] = Math.min(limits[key], requested[key]);
  }
  if (restored && (restored.counters.passes > limits.maxPasses || restored.counters.repairs > limits.maxRepairs || restored.counters.modelCalls > limits.maxModelCalls || restored.counters.writes > limits.maxWrites)) throw new ChatgptHarnessError("invalid-input", "消費済みの制作回数より小さい上限は設定できません。");
  const state: ChatgptHarnessSnapshot = restored ? structuredClone(restored) : { version: 1, runId: options.runId, phase: "idle", limits,
    counters: { passes: 0, repairs: 0, modelCalls: 0, writes: 0, attempts: 0, activeMs: 0 }, sequence: 0, dirty: false, events: [] };
  state.limits = limits;
  if (state.phase === "running" || state.phase === "stopping" || state.phase === "idle") state.phase = "paused";
  const now = options.now ?? Date.now;
  const clock = (): number => { const value = now(); if (!integer(value)) throw new ChatgptHarnessError("invalid-input", "制作の時刻が不正です。"); return value; };
  let activeSince: number | undefined;
  let elapsedTimer: ReturnType<typeof setTimeout> | undefined;
  let abortError: ChatgptHarnessError | undefined;
  const controller = new AbortController();
  const pending = new Set<Promise<unknown>>();
  let abortWork: Promise<void> = Promise.resolve();
  let stopping: Promise<void> | undefined;
  let closed = ["completed", "cancelled", "failed"].includes(state.phase);
  let checkpointing = false;
  let writing = false;
  let readers = 0;
  type Waiter = { write: boolean; grant: () => void };
  const lane: Waiter[] = [];
  const account = (): void => { if (activeSince !== undefined) { const current = clock(); state.counters.activeMs += Math.max(0, current - activeSince); activeSince = current; } };
  const publish = (): void => { const snapshot = getSnapshot(); try { void Promise.resolve(options.onSnapshot?.(snapshot)).catch(() => undefined); } catch { /* Observers cannot invalidate an admitted fact. */ } };
  const event = (phase: ChatgptHarnessEvent["phase"], outcome: ChatgptHarnessEvent["outcome"], label: string, attempt = state.counters.attempts, code?: string): void => {
    state.events.push(freeze({ sequence: ++state.sequence, attempt, pass: state.counters.passes, phase, outcome, label, at: clock(), ...(code ? { code } : {}) }));
    state.events = state.events.slice(-EVENT_LIMIT); publish();
  };
  function getSnapshot(): ChatgptHarnessSnapshot { if (!checkpointing) account(); return freeze(structuredClone(state)); }
  const clearTimer = (): void => { if (elapsedTimer !== undefined) clearTimeout(elapsedTimer); elapsedTimer = undefined; };
  const detach = (): void => { clearTimer(); options.signal?.removeEventListener("abort", onExternalAbort); closed = true; };
  const abort = (error: ChatgptHarnessError, reason: string = error.code): void => {
    if (abortError || closed) return;
    account(); activeSince = undefined; clearTimer(); abortError = error; state.phase = "stopping"; state.reason = reason;
    controller.abort(error);
    try { abortWork = Promise.resolve(options.onAbort?.(reason)).catch(() => undefined); } catch { abortWork = Promise.resolve(); }
    event("run", error.code === "cancelled" ? "cancelled" : "failed", error.code === "cancelled" ? "制作を停止しています" : error.code === "step-failed" ? "失敗した制作を終了しています" : "制作の上限に達しました", state.counters.attempts, error.code);
    pump();
    stopping = (async () => {
      await Promise.allSettled([...pending]); await abortWork;
      state.phase = error.code === "cancelled" ? "cancelled" : "failed";
      detach(); publish();
    })();
  };
  const budget = (condition: boolean, code: ChatgptHarnessErrorCode, message: string): void => { if (condition) { const error = new ChatgptHarnessError(code, message); abort(error); throw error; } };
  const check = (): void => {
    if (checkpointing) throw new ChatgptHarnessError("busy", "制作の完了記録を保存しています。");
    if (abortError) throw abortError;
    if (state.phase === "completed" || state.phase === "cancelled" || state.phase === "failed") throw new ChatgptHarnessError("terminal", "この制作の実行は終了しています。");
    if (options.signal?.aborted) { onExternalAbort(); throw abortError!; }
    account();
    budget(state.counters.activeMs >= limits.maxActiveMs, "deadline", "制作時間の上限に達しました。保存済みのSceneから続けてください。");
    if (state.phase !== "running") throw new ChatgptHarnessError("paused", "制作は停止中です。制作を再開してから操作してください。");
  };
  function onExternalAbort(): void { abort(new ChatgptHarnessError("cancelled", "制作を停止しました。")); }
  const arm = (): void => { clearTimer(); elapsedTimer = setTimeout(() => abort(new ChatgptHarnessError("deadline", "制作時間の上限に達しました。")), Math.max(1, limits.maxActiveMs - state.counters.activeMs)); };
  function pump(): void {
    if (writing) return;
    while (lane.length) {
      const first = lane[0]!;
      if (first.write && readers > 0) return;
      lane.shift();
      if (first.write) writing = true; else readers++;
      first.grant();
      if (first.write) return;
    }
  }
  const acquire = (write: boolean): Promise<() => void> => new Promise(resolve => {
    lane.push({ write, grant: () => resolve(() => { if (write) writing = false; else readers--; pump(); }) }); pump();
  });
  const exclusive = (kind: ChatgptHarnessKind, value?: boolean): boolean => value === true || ["prepare", "write", "save", "inspect", "model-review", "capture"].includes(kind);
  const validateStep = (kind: ChatgptHarnessKind, label: string, value: ChatgptHarnessStepOptions): number => {
    if (!kinds.has(kind) || ["run", "commit", "inspection", "progress"].includes(kind) || !text(label, 160) || (value.write !== undefined && typeof value.write !== "boolean") || !integer(value.modelCalls ?? 0, 0, 256)) throw new ChatgptHarnessError("invalid-input", "制作工程の指定が不正です。");
    return value.modelCalls ?? 0;
  };
  type Settlement = { phase: ChatgptHarnessKind; outcome: "succeeded" | "failed" | "cancelled"; label: string; attempt: number; code?: string };
  const settle = (entry: Settlement): void => { event(entry.phase, entry.outcome, entry.label, entry.attempt, entry.code); };
  const perform = async <T>(kind: ChatgptHarnessKind, label: string, work: (signal: AbortSignal) => Promise<T>, value: ChatgptHarnessStepOptions, defer?: (settlement: Settlement) => void): Promise<T> => {
    // Register ownership in pending before user code or observers can cancel synchronously.
    await Promise.resolve();
    const modelCalls = validateStep(kind, label, value); check();
    // A streamed model step may invoke save/write steps before its stream ends.
    // Only explicit writer scopes acquire a lane; tools() owns batch read/write barriers.
    const release = value.write === true ? await acquire(true) : () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt: number | undefined;
    try {
      check(); budget(state.counters.modelCalls + modelCalls > limits.maxModelCalls, "budget-model-calls", "推論回数の上限に達しました。保存済みのSceneから続けてください。");
      state.counters.modelCalls += modelCalls; attempt = ++state.counters.attempts;
      event(kind, "started", label, attempt); check();
      timer = setTimeout(() => abort(new ChatgptHarnessError("step-deadline", "制作工程の時間上限に達しました。")), limits.maxStepMs);
      const result = await work(controller.signal);
      check(); (defer ?? settle)({ phase: kind, outcome: "succeeded", label, attempt }); return result;
    } catch (error: unknown) {
      if (attempt !== undefined) (defer ?? settle)({ phase: kind, outcome: abortError ? "cancelled" : "failed", label, attempt, code: abortError?.code ?? "step-failed" });
      if (abortError) { await abortWork; throw abortError; }
      throw error;
    } finally { if (timer !== undefined) clearTimeout(timer); release(); }
  };
  const track = <T>(task: Promise<T>): Promise<T> => {
    pending.add(task); void task.then(() => pending.delete(task), () => pending.delete(task)); return task;
  };
  const step = <T>(kind: ChatgptHarnessKind, label: string, work: (signal: AbortSignal) => Promise<T>, value: ChatgptHarnessStepOptions = {}): Promise<T> => {
    return track(perform(kind, label, work, value));
  };
  const run: ChatgptHarnessRun = {
    beginPass(reason = "initial") {
      if (!["initial", "continue", "repair"].includes(reason)) throw new ChatgptHarnessError("invalid-input", "制作の継続理由が不正です。");
      if (checkpointing || pending.size || writing || readers) throw new ChatgptHarnessError("busy", "実行中の工程が終了してから制作を続けてください。");
      if (abortError || ["completed", "cancelled", "failed"].includes(state.phase)) throw abortError ?? new ChatgptHarnessError("terminal", "この制作の実行は終了しています。");
      account(); budget(state.counters.passes >= limits.maxPasses, "budget-passes", "制作回数の上限に達しました。保存済みのSceneから続けてください。");
      budget(reason === "repair" && state.counters.repairs >= limits.maxRepairs, "budget-repairs", "修正回数の上限に達しました。保存済みのSceneから続けてください。");
      if (reason === "repair") state.counters.repairs++;
      state.counters.passes++; state.phase = "running"; activeSince ??= clock(); arm(); check(); event("run", "started", reason === "repair" ? "制作を修正します" : "制作を進めます"); return getSnapshot();
    },
    step,
    tools<T>(calls: ChatgptHarnessTool<T>[], configuration: { maxParallel?: number } = {}): Promise<T[]> {
      return track((async () => {
      const cap = configuration.maxParallel ?? 3;
      if (!integer(cap, 1, 8) || calls.length > 256) throw new ChatgptHarnessError("invalid-input", "同時実行する工程の指定が不正です。");
      for (const call of calls) validateStep(call.kind, call.label, call);
      const results: T[] = [];
      let next = 0;
      while (next < calls.length) {
        check();
        if (exclusive(calls[next]!.kind, calls[next]!.write)) { const call = calls[next]!; results.push(await step(call.kind, call.label, call.work, call)); next++; continue; }
        const end = calls.findIndex((call, index) => index > next && exclusive(call.kind, call.write));
        const boundary = end < 0 ? calls.length : end;
        let cursor = next; let committed = next;
        const settlements = new Map<number, Settlement>();
        const commitReady = (): void => { while (settlements.has(committed)) { settle(settlements.get(committed)!); settlements.delete(committed++); } };
        const slots = new Map<number, Promise<void>>(); let failure: { error: unknown } | undefined;
        const fill = (): void => {
          while (failure === undefined && !controller.signal.aborted && cursor < boundary && slots.size < cap) {
            const index = cursor++; const call = calls[index]!;
            const task = track(perform(call.kind, call.label, call.work, call, settlement => { settlements.set(index, settlement); })).then(result => { results[index] = result; }, error => {
              failure ??= { error };
              if (!settlements.has(index) && index >= committed) settlements.set(index, { phase: call.kind, outcome: abortError ? "cancelled" : "failed", label: call.label, attempt: state.counters.attempts, code: abortError?.code ?? "not-started" });
            }).finally(() => { slots.delete(index); commitReady(); });
            slots.set(index, task);
          }
        };
        fill();
        while (slots.size) { await Promise.race(slots.values()); fill(); }
        if (failure !== undefined) {
          for (let index = cursor; index < calls.length; index++) { const call = calls[index]!; event(call.kind, abortError ? "cancelled" : "failed", call.label, state.counters.attempts, "not-started"); }
          throw failure.error;
        }
        check(); next = boundary;
      }
      return results;
      })());
    },
    check,
    recordCommit(nextFingerprint) {
      check(); if (nextFingerprint !== undefined && !fingerprint(nextFingerprint)) throw new ChatgptHarnessError("invalid-input", "Sceneの識別情報が不正です。");
      budget(state.counters.writes >= limits.maxWrites, "budget-writes", "Scene更新回数の上限に達しました。保存済みのSceneから続けてください。");
      state.counters.writes++; state.dirty = true; delete state.inspection;
      if (nextFingerprint === undefined) delete state.committedFingerprint; else state.committedFingerprint = nextFingerprint;
      event("commit", "succeeded", "Sceneの変更を反映しました");
    },
    observeScene(observedFingerprint) {
      check(); if (!fingerprint(observedFingerprint)) throw new ChatgptHarnessError("invalid-input", "Sceneの識別情報が不正です。");
      if (state.committedFingerprint === observedFingerprint) return;
      state.committedFingerprint = observedFingerprint; state.dirty = true; delete state.inspection;
      event("context", "succeeded", "最新のSceneの変更を確認しました");
    },
    recordSaved(savedFingerprint) {
      check(); if (!fingerprint(savedFingerprint)) throw new ChatgptHarnessError("invalid-input", "保存したSceneの識別情報が不正です。");
      if (state.committedFingerprint !== undefined && state.committedFingerprint !== savedFingerprint) throw new ChatgptHarnessError("unsaved", "最新のSceneと保存内容が一致していません。");
      state.committedFingerprint = savedFingerprint; state.savedFingerprint = savedFingerprint; state.dirty = false; event("save", "succeeded", "最新のSceneを保存しました");
    },
    recordProgress(input) {
      check(); if (pending.size || writing || readers) throw new ChatgptHarnessError("busy", "実行中の工程が終了してから制作の進展を確認してください。");
      // Progress may exclude recipe bookkeeping. Save and completion always
      // attest the complete authored snapshot, including that bookkeeping.
      const savedFingerprint = input.savedFingerprint ?? input.afterFingerprint;
      if (!fingerprint(savedFingerprint)) throw new ChatgptHarnessError("invalid-input", "保存したSceneの識別情報が不正です。");
      if (state.dirty || state.savedFingerprint !== savedFingerprint || state.committedFingerprint !== savedFingerprint) throw new ChatgptHarnessError("unsaved", "最新のSceneを保存してから制作の進展を確認してください。");
      let result: AuthoringProgressResult;
      try { result = observeAuthoringProgress(state.progress, { ...input, pass: state.counters.passes }); }
      catch { throw new ChatgptHarnessError("invalid-input", "制作の進展情報が不正です。"); }
      state.progress = result.progress;
      event("progress", result.shouldReplan ? "continued" : "succeeded", result.kind === "changed" ? "Sceneの変化を確認しました"
        : result.kind === "cycle" ? "以前のSceneへの繰り返しを確認しました" : result.kind === "repeated-plan" ? "同じ制作内容にSceneの変化がありません" : "Sceneに追加の変化がありません", state.counters.attempts, result.kind);
      budget(result.stopped, "stalled-progress", "Sceneの変化がない制作や同じ状態への繰り返しが3回続いたため停止しました。保存済みのSceneを確認し、制作方針を変えて依頼してください。");
      return result;
    },
    recordInspection(inspection) {
      check(); if (!fingerprint(inspection.fingerprint) || typeof inspection.approved !== "boolean" || !integer(inspection.views, 0, 8) || (inspection.evidence !== undefined && !text(inspection.evidence, 240))) throw new ChatgptHarnessError("invalid-input", "Sceneの確認記録が不正です。");
      if (state.dirty || state.savedFingerprint !== inspection.fingerprint) throw new ChatgptHarnessError("inspection-required", "確認対象が最新の保存済みSceneと一致していません。");
      state.inspection = { fingerprint: inspection.fingerprint, approved: inspection.approved, views: inspection.views, pass: state.counters.passes, ...(inspection.evidence !== undefined ? { evidence: inspection.evidence } : {}) };
      event("inspection", "succeeded", inspection.approved ? "Sceneの仕上がりを確認しました" : "Sceneに残る修正を確認しました");
    },
    finish({ fingerprint: finalFingerprint, requireInspection = false, hasMore = false, checkpoint }) {
      check(); if (pending.size) throw new ChatgptHarnessError("busy", "実行中の工程が残っています。");
      if (!fingerprint(finalFingerprint) || state.dirty || state.savedFingerprint !== finalFingerprint || state.committedFingerprint !== finalFingerprint) throw new ChatgptHarnessError("unsaved", "最新のSceneを保存してから制作を完了してください。");
      if (hasMore) { event("run", "continued", "残る制作を続けます"); return false; }
      if (requireInspection && (!state.inspection?.approved || state.inspection.views < 2 || state.inspection.fingerprint !== finalFingerprint)) throw new ChatgptHarnessError("inspection-required", "最新のSceneを2方向から確認してから制作を完了してください。");
      account();
      const baselineSequence = state.sequence;
      const completed = structuredClone(state);
      completed.phase = "completed";
      completed.events.push({ sequence: ++completed.sequence, attempt: completed.counters.attempts, pass: completed.counters.passes, phase: "run", outcome: "completed", label: "保存済みのSceneの制作を完了しました", at: clock() });
      completed.events = completed.events.slice(-EVENT_LIMIT);
      if (checkpoint) {
        checkpointing = true;
        try {
          const returned: unknown = checkpoint(freeze(completed));
          if (returned !== undefined && typeof (returned as PromiseLike<unknown>)?.then === "function") {
            void Promise.resolve(returned).catch(() => undefined);
            throw new ChatgptHarnessError("invalid-input", "制作の完了記録は同期して保存してください。");
          }
        } finally { checkpointing = false; }
      }
      if (abortError) throw abortError;
      if (state.phase !== "running" || state.sequence !== baselineSequence) throw new ChatgptHarnessError("busy", "完了記録の保存中に制作の状態が変わりました。");
      activeSince = undefined; state.phase = "completed"; state.sequence = completed.sequence; state.events = completed.events;
      detach(); publish(); return true;
    },
    pause() {
      if (state.phase === "paused" && !abortError) return getSnapshot();
      check(); if (pending.size) throw new ChatgptHarnessError("busy", "実行中の工程が終了してから制作を一時停止してください。");
      account(); activeSince = undefined; clearTimer(); state.phase = "paused"; event("run", "paused", "次の入力を待っています"); return getSnapshot();
    },
    async stop(reason = "user") {
      if (!text(reason, 240)) throw new ChatgptHarnessError("invalid-input", "停止理由が不正です。");
      if (!closed) abort(new ChatgptHarnessError("cancelled", "制作を停止しました。"), reason);
      await stopping;
    },
    async fail(reason = "step-failed") {
      if (!text(reason, 240)) throw new ChatgptHarnessError("invalid-input", "終了理由が不正です。");
      if (!closed) abort(new ChatgptHarnessError("step-failed", "制作の処理に失敗しました。保存済みのSceneを確認してください。"), reason);
      await stopping;
    },
    snapshot: getSnapshot,
  };
  if (!closed) {
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (options.signal?.aborted) onExternalAbort();
  }
  return run;
}
