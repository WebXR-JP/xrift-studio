import { checkAuthoringEvidence } from "./authoring-evidence";
import { xriftMcpToolSurface } from "./mcp-tool-registry";
import { authoringActionFingerprint } from "./authoring-action";
import { normalizeAuthoringProgress, observeAuthoringProgress, type AuthoringProgress } from "./authoring-progress";
import { chatgptPlanningSnapshot } from "./chatgpt-plan-guards";
import type { PrototypeVisualProject } from "./prototype-project";

export type AuthoringCapture = { id: string; view: "spawn" | "iso"; fingerprint: string; path: string };
export type AuthoringBudget = { maxWrites: number; maxPasses: number; maxNoProgress: number; maxConsecutiveFailures: number; maxElapsedMs: number };
export type AuthoringTerminalReason = "write-limit" | "pass-limit" | "no-progress" | "failure-limit" | "elapsed-limit" | "cancelled" | "completed";
export type AuthoringJournalEvent = { sequence: number; kind: "begin" | "write-start" | "write-changed" | "write-noop" | "write-failed" | "capture" | "review" | "complete" | "cancel" | "scene-changed";
  tool: string; at: string; fingerprint: string; reason?: string };
export type WorldAuthoringRun = { id: string; budget: AuthoringBudget; startedAt: string; writes: number; passes: number; noProgress: number; consecutiveFailures: number;
  lastInspectedFingerprint: string | null; terminalReason: AuthoringTerminalReason | null;
  pendingWrite?: { requestId: string; fingerprint: string; planFingerprint?: string; progressFingerprint?: string }; progress?: AuthoringProgress; journal: AuthoringJournalEvent[] };
export type WorldAuthoringState = {
  version: 1; sequence: number; blueprint: string; criteria: string[];
  captures: Partial<Record<"spawn" | "iso", AuthoringCapture>>;
  reviews: Record<string, { passed: boolean; reason: string; captureIds: string[]; fingerprint?: string }>;
  completedFingerprint: string | null;
  savedFingerprint?: string | null;
  /** Optional for legacy journals. Every new explicit run is bounded. */
  run?: WorldAuthoringRun;
  activity: { tool: string; at: string; fingerprint: string };
};
export const DEFAULT_AUTHORING_BUDGET: Readonly<AuthoringBudget> = Object.freeze({ maxWrites: 256, maxPasses: 8, maxNoProgress: 3, maxConsecutiveFailures: 3, maxElapsedMs: 900_000 });
const limits: Record<keyof AuthoringBudget, readonly [number, number]> = { maxWrites: [1, 4096], maxPasses: [1, 32], maxNoProgress: [1, 6], maxConsecutiveFailures: [1, 6], maxElapsedMs: [1000, 3_600_000] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
const integer = (value: unknown, max = 1_000_000): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const fingerprintValue = (value: unknown) => text(value, 256);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const terminalMessages: Record<AuthoringTerminalReason, string> = {
  "write-limit": "制作の変更回数が上限に達しました", "pass-limit": "制作の見直し回数が上限に達しました", "no-progress": "変更または見直しが続けて進まなかったため停止しました",
  "failure-limit": "制作の操作が続けて失敗したため停止しました", "elapsed-limit": "制作の時間が上限に達しました", cancelled: "制作を停止しました", completed: "この制作は完了しています",
};
export function parseAuthoringBudget(value?: unknown): AuthoringBudget {
  if (value !== undefined && (!object(value) || Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(limits, key)))) throw new Error("制作の上限を確認してください。");
  const budget = { ...DEFAULT_AUTHORING_BUDGET, ...(value as Partial<AuthoringBudget> | undefined) };
  for (const key of Object.keys(limits) as (keyof AuthoringBudget)[]) if (!Number.isSafeInteger(budget[key]) || budget[key] < limits[key][0] || budget[key] > limits[key][1]) throw new Error("制作の上限を確認してください。");
  return budget;
}

export function readAuthoringState(value: unknown): WorldAuthoringState | null {
  if (value === null) return null;
  const invalid = () => new Error("制作状態を読み取れません。履歴の形式を確認してください。");
  if (!object(value) || value.version !== 1 || !integer(value.sequence) || !text(value.blueprint, 20_000) || !Array.isArray(value.criteria) || !value.criteria.length || value.criteria.length > 100
    || value.criteria.some(c => !text(c, 1000)) || new Set(value.criteria).size !== value.criteria.length || !object(value.captures) || !object(value.reviews)
    || !object(value.activity) || !text(value.activity.tool, 128) || !timestamp(value.activity.at) || !fingerprintValue(value.activity.fingerprint)
    || value.completedFingerprint !== null && !fingerprintValue(value.completedFingerprint)
    || value.savedFingerprint !== undefined && value.savedFingerprint !== null && !fingerprintValue(value.savedFingerprint)) throw invalid();
  for (const [view, capture] of Object.entries(value.captures)) if (!["spawn", "iso"].includes(view) || !object(capture) || capture.view !== view || !text(capture.id, 160) || !fingerprintValue(capture.fingerprint) || !text(capture.path, 4096)) throw invalid();
  for (const [criterion, review] of Object.entries(value.reviews)) if (!value.criteria.includes(criterion) || !object(review) || typeof review.passed !== "boolean" || !text(review.reason, 5000)
    || !Array.isArray(review.captureIds) || review.captureIds.length !== 2 || !review.captureIds.every(id => text(id, 160)) || new Set(review.captureIds).size !== 2
    || review.fingerprint !== undefined && !fingerprintValue(review.fingerprint)) throw invalid();
  if (value.run !== undefined) {
    const run = value.run;
    if (!object(run) || !object(run.budget) || Object.keys(run.budget).length !== Object.keys(limits).length || !text(run.id, 160) || !timestamp(run.startedAt) || !integer(run.writes) || !integer(run.passes) || !integer(run.noProgress) || !integer(run.consecutiveFailures)
      || run.lastInspectedFingerprint !== null && !fingerprintValue(run.lastInspectedFingerprint)
      || run.terminalReason !== null && (typeof run.terminalReason !== "string" || !Object.prototype.hasOwnProperty.call(terminalMessages, run.terminalReason))
      || !Array.isArray(run.journal) || run.journal.length > 128 || run.pendingWrite !== undefined && (!object(run.pendingWrite) || !text(run.pendingWrite.requestId, 160) || !fingerprintValue(run.pendingWrite.fingerprint))) throw invalid();
    parseAuthoringBudget(run.budget);
    if (run.progress !== undefined) normalizeAuthoringProgress(run.progress, run.writes as number);
    if (object(run.pendingWrite) && run.pendingWrite.planFingerprint !== undefined && !fingerprintValue(run.pendingWrite.planFingerprint)) throw invalid();
    if (object(run.pendingWrite) && run.pendingWrite.progressFingerprint !== undefined && !fingerprintValue(run.pendingWrite.progressFingerprint)) throw invalid();
    for (const event of run.journal) if (!object(event) || !integer(event.sequence) || !["begin", "write-start", "write-changed", "write-noop", "write-failed", "capture", "review", "complete", "cancel", "scene-changed"].includes(String(event.kind))
      || !text(event.tool, 128) || !timestamp(event.at) || !fingerprintValue(event.fingerprint) || event.reason !== undefined && !text(event.reason, 600)) throw invalid();
  }
  return value as WorldAuthoringState;
}

export async function authoringFingerprint(value: unknown): Promise<string> {
  if (object(value) && object(value.project) && object(value.scene) && object(value.assets) && object(value.prefabs)) {
    value = JSON.parse(chatgptPlanningSnapshot(value as PrototypeVisualProject));
  }
  // JSON writers can reorder keys and round insignificant f64 noise.
  const bytes = new TextEncoder().encode(JSON.stringify(value, (_key, item) =>
    typeof item === "number" && Number.isFinite(item) ? Number(item.toPrecision(12)) :
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function authoringTerminalReason(state: WorldAuthoringState, now = Date.now()): AuthoringTerminalReason | null {
  const run = state.run;
  if (!run) return null;
  if (run.terminalReason) return run.terminalReason;
  if (now - Date.parse(run.startedAt) >= run.budget.maxElapsedMs) return "elapsed-limit";
  if (run.writes >= run.budget.maxWrites) return "write-limit";
  if (run.passes >= run.budget.maxPasses) return "pass-limit";
  if (run.consecutiveFailures >= run.budget.maxConsecutiveFailures) return "failure-limit";
  if (run.noProgress >= run.budget.maxNoProgress) return "no-progress";
  return null;
}
export function authoringStatus(state: WorldAuthoringState | null, fingerprint: string, options: { savedFingerprint?: string | null; pendingWrites?: boolean; now?: number } = {}) {
  if (!state) return { state: null, completed: false, canComplete: false, reasons: ["制作目標がありません"], missingViews: ["spawn", "iso"] as readonly string[], uncheckedCriteria: [] as string[],
    terminalReason: null, writeAdmission: false, nextActions: ["begin_world_authoring"] };
  const missingViews = (["spawn", "iso"] as const).filter(view => state.captures[view]?.fingerprint !== fingerprint);
  const captureIds = [state.captures.spawn?.id, state.captures.iso?.id];
  const uncheckedCriteria = state.criteria.filter(criterion => {
    const review = state.reviews[criterion];
    return missingViews.length > 0 || !review?.passed || review.fingerprint !== fingerprint || !captureIds.every(id => id && review.captureIds.includes(id));
  });
  const cancelled = state.run?.terminalReason === "cancelled";
  const gate = checkAuthoringEvidence({ currentFingerprint: fingerprint, savedFingerprint: options.savedFingerprint === undefined ? state.savedFingerprint : options.savedFingerprint,
    requiredViews: ["spawn", "iso"], captures: Object.values(state.captures), pendingWrites: options.pendingWrites || Boolean(state.run?.pendingWrite),
    requiredCriteria: state.criteria,
    review: cancelled ? undefined : { fingerprint, approved: uncheckedCriteria.length === 0,
      criteria: state.criteria.map(criterion => ({ criterion, passed: state.reviews[criterion]?.passed === true && !uncheckedCriteria.includes(criterion), reason: state.reviews[criterion]?.reason ?? "未確認" })) } });
  const completed = !cancelled && gate.complete && state.completedFingerprint === fingerprint;
  const terminalReason = authoringTerminalReason(state, options.now);
  const nextActions = completed ? [] : cancelled ? ["begin_world_authoring"] : gate.reasons.some(reason => reason.includes("保存")) ? ["get_editor_context", "get_world_authoring"]
    : missingViews.length ? ["set_scene_view_camera", "capture_scene_view"] : uncheckedCriteria.length ? ["review_world_authoring"] : ["complete_world_authoring"];
  return { state, completed, canComplete: !cancelled && gate.complete, reasons: cancelled ? [terminalMessages.cancelled] : gate.reasons,
    missingViews, uncheckedCriteria, terminalReason, writeAdmission: Boolean(state.run && !terminalReason && !state.run.pendingWrite),
    ...(terminalReason ? { stopReason: terminalMessages[terminalReason] } : {}), nextActions };
}

function append(state: WorldAuthoringState, kind: AuthoringJournalEvent["kind"], tool: string, fingerprint: string, reason?: string) {
  state.sequence++;
  state.activity = { tool, at: new Date().toISOString(), fingerprint };
  const detail = reason?.trim().slice(0, 600);
  if (state.run) state.run.journal = [...state.run.journal, { sequence: state.sequence, kind, ...state.activity, ...(detail ? { reason: detail } : {}) }].slice(-128);
  return state;
}
/** Explicit runs constrain writes only; read, camera and capture stay usable. */
export function isAuthoringWriteTool(tool: string): boolean {
  const surface = xriftMcpToolSurface(tool);
  return Boolean(surface && ["document", "async-document", "local-asset", "script", "external-store"].includes(surface)
    && !/^(?:get_|list_|inspect_|analyze_|sample_|validate_|simulate_|search_)/u.test(tool) && tool !== "set_play_mode");
}
export function hasAuthoringRunOwner(state: WorldAuthoringState | null): boolean {
  if (!state) return false;
  // Old blueprints have no writer identity or finite run lease. Keep their
  // history readable, but do not let it own all later ChatGPT work forever.
  if (!state.run) return false;
  return !["cancelled", "completed"].includes(state.run.terminalReason ?? "");
}
export function beginAuthoringWrite(state: WorldAuthoringState, tool: string, requestId: string, fingerprint: string, args: Record<string, unknown> = {}, progressFingerprint?: string): WorldAuthoringState {
  if (!state.run) return state;
  const reason = authoringTerminalReason(state);
  if (reason) throw new Error(`${terminalMessages[reason]}。保存済みの変更を確認してください。`);
  if (state.run.pendingWrite) throw new Error("別の制作操作を処理しています。結果を確認してから再試行してください。");
  const next = structuredClone(state);
  next.run!.writes++;
  next.run!.pendingWrite = { requestId, fingerprint, planFingerprint: authoringActionFingerprint(tool, args), ...(progressFingerprint !== undefined ? { progressFingerprint } : {}) };
  next.completedFingerprint = null;
  return append(next, "write-start", tool, fingerprint);
}
export function finishAuthoringWrite(state: WorldAuthoringState, tool: string, requestId: string, fingerprint: string, ok: boolean, reason?: string, progressFingerprint = fingerprint): WorldAuthoringState {
  if (!state.run?.pendingWrite || state.run.pendingWrite.requestId !== requestId) return state;
  const next = structuredClone(state), run = next.run!;
  const previous = run.pendingWrite!;
  const changed = previous.fingerprint !== fingerprint;
  const progress = observeAuthoringProgress(run.progress, { pass: run.writes, planFingerprint: previous.planFingerprint ?? authoringActionFingerprint(tool, {}),
    beforeFingerprint: previous.progressFingerprint ?? previous.fingerprint, afterFingerprint: progressFingerprint, continuing: run.terminalReason !== "cancelled" });
  run.progress = progress.progress;
  delete run.pendingWrite;
  run.consecutiveFailures = ok ? 0 : run.consecutiveFailures + 1;
  run.noProgress = progress.kind === "changed" ? 0 : Math.max(run.noProgress + 1, progress.stalledPasses);
  if (progress.kind === "changed" && !changed) {
    // A saved Script can change without changing Scene/Asset JSON. Its old
    // screenshots and reviews are no longer evidence of the current program.
    next.captures = {};
    next.reviews = {};
  }
  if (run.terminalReason !== "cancelled") run.terminalReason = authoringTerminalReason(next);
  next.completedFingerprint = null;
  return append(next, ok ? changed || progress.kind === "changed" ? "write-changed" : "write-noop" : "write-failed", tool, fingerprint, reason);
}
export function observeAuthoringScene(state: WorldAuthoringState, tool: string, fingerprint: string): WorldAuthoringState {
  if (state.activity.fingerprint === fingerprint) return state;
  const next = structuredClone(state);
  next.completedFingerprint = null;
  return append(next, "scene-changed", tool, fingerprint);
}

export function changeAuthoringState(current: WorldAuthoringState | null, tool: string,
  args: Record<string, unknown>, fingerprint: string, options: { savedFingerprint?: string | null; pendingWrites?: boolean } = {}): WorldAuthoringState {
  if (tool === "begin_world_authoring") {
    if (current && args.replaceExisting !== true) throw new Error("制作目標は保存済みです。get_world_authoringで再開してください。");
    if (!text(args.blueprint, 20_000) || !Array.isArray(args.criteria) || !args.criteria.length || args.criteria.length > 100 || args.criteria.some(c => !text(c, 1000)) || new Set(args.criteria).size !== args.criteria.length) throw new Error("設計図と重複のない完成条件を指定してください。");
    const at = new Date().toISOString();
    return append({ version: 1, sequence: current?.sequence ?? 0, blueprint: args.blueprint, criteria: args.criteria as string[], captures: {}, reviews: {}, completedFingerprint: null,
      savedFingerprint: options.savedFingerprint ?? null, activity: { tool, at, fingerprint }, run: { id: crypto.randomUUID(), budget: parseAuthoringBudget(args.budget), startedAt: at,
        writes: 0, passes: 0, noProgress: 0, consecutiveFailures: 0, lastInspectedFingerprint: null, terminalReason: null, journal: [] } }, "begin", tool, fingerprint);
  }
  if (!current) throw new Error("begin_world_authoringで設計図を保存してください。");
  const state = structuredClone(current);
  if (options.savedFingerprint !== undefined) state.savedFingerprint = options.savedFingerprint;
  let event: AuthoringJournalEvent["kind"];
  if (tool === "cancel_world_authoring") {
    if (!state.run) throw new Error("制作目標を改めて保存してください。");
    state.run.terminalReason = "cancelled";
    state.captures = {}; state.reviews = {}; state.completedFingerprint = null;
    event = "cancel";
  } else if (tool === "capture_scene_view") {
    if (args.authoringView !== "spawn" && args.authoringView !== "iso" || !text(args.path, 4096)) throw new Error("authoringViewと撮影結果を指定してください。");
    state.captures[args.authoringView] = { id: crypto.randomUUID(), view: args.authoringView, fingerprint, path: args.path };
    state.completedFingerprint = null;
    if (state.run && state.captures.spawn?.fingerprint === fingerprint && state.captures.iso?.fingerprint === fingerprint
      && state.run.lastInspectedFingerprint !== fingerprint) {
      const run = state.run;
      // Count each newly inspected Scene once. Reframing either camera changes
      // capture IDs (and invalidates review), but is not another construction
      // pass. Read-only inspection must not reset stalled write progress.
      run.passes++;
      run.lastInspectedFingerprint = fingerprint;
      if (!run.terminalReason) run.terminalReason = authoringTerminalReason(state);
    }
    event = "capture";
  } else if (tool === "review_world_authoring") {
    if (state.run?.terminalReason === "cancelled") throw new Error("停止した制作は確認できません。制作目標を改めて保存してください。");
    if (typeof args.criterion !== "string" || !state.criteria.includes(args.criterion) || typeof args.passed !== "boolean" || !text(args.reason, 5000)) throw new Error("完成条件、合否、画像から判断した根拠を指定してください。");
    const ids = [state.captures.spawn?.id, state.captures.iso?.id];
    if (authoringStatus(state, fingerprint, options).missingViews?.length || !Array.isArray(args.captureIds) || args.captureIds.length !== 2 || !ids.every(id => id && (args.captureIds as unknown[]).includes(id))) throw new Error("最新の両画像を確認し、captureIdsを指定してください。");
    Object.defineProperty(state.reviews, args.criterion, { value: { passed: args.passed, reason: args.reason, captureIds: ids as string[], fingerprint }, enumerable: true, writable: true, configurable: true });
    state.completedFingerprint = null;
    event = "review";
  } else if (tool === "complete_world_authoring") {
    const status = authoringStatus(state, fingerprint, options);
    if (!status.canComplete) throw new Error(`未確認の完成条件または保存待ちがあります: ${[...status.reasons, ...status.uncheckedCriteria ?? []].join("、")}`);
    state.completedFingerprint = fingerprint;
    if (state.run) state.run.terminalReason = "completed";
    event = "complete";
  } else throw new Error("対応していない制作操作です。");
  return append(state, event, tool, fingerprint);
}
