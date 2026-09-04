export type AuthoringCapture = { id: string; view: "spawn" | "iso"; fingerprint: string; path: string };
export type WorldAuthoringState = {
  version: 1;
  sequence: number;
  blueprint: string;
  criteria: string[];
  captures: Partial<Record<"spawn" | "iso", AuthoringCapture>>;
  reviews: Record<string, { passed: boolean; reason: string; captureIds: string[] }>;
  completedFingerprint: string | null;
  activity: { tool: string; at: string; fingerprint: string };
};

export function readAuthoringState(value: unknown): WorldAuthoringState | null {
  if (value === null) return null;
  const state = value as WorldAuthoringState;
  if (!state || state.version !== 1 || !Number.isInteger(state.sequence) ||
      typeof state.blueprint !== "string" || !Array.isArray(state.criteria) ||
      state.criteria.some(c => typeof c !== "string") || !state.captures || !state.reviews) {
    throw new Error("制作状態を読み取れません。履歴の形式を確認してください。");
  }
  return state;
}

export async function authoringFingerprint(value: unknown): Promise<string> {
  // Rust's JSON writer and the in-memory editor use different key orders.
  // Normalize key order and insignificant f64 round-trip noise so reopening
  // an unchanged project preserves its evidence. Small magnitudes stay distinct.
  const bytes = new TextEncoder().encode(JSON.stringify(value, (_key, item) =>
    typeof item === "number" && Number.isFinite(item) ? Number(item.toPrecision(12)) :
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function authoringStatus(state: WorldAuthoringState | null, fingerprint: string) {
  if (!state) return { state: null, completed: false, nextActions: ["begin_world_authoring"] };
  const missingViews = (["spawn", "iso"] as const).filter(view => state.captures[view]?.fingerprint !== fingerprint);
  const captureIds = [state.captures.spawn?.id, state.captures.iso?.id];
  const uncheckedCriteria = state.criteria.filter(criterion => {
    const review = state.reviews[criterion];
    return missingViews.length > 0 || !review?.passed || !captureIds.every(id => id && review.captureIds.includes(id));
  });
  const completed = state.completedFingerprint === fingerprint && uncheckedCriteria.length === 0;
  return { state, completed,
    missingViews, uncheckedCriteria,
    nextActions: completed ? [] : missingViews.length ? ["set_scene_view_camera", "capture_scene_view"]
      : uncheckedCriteria.length ? ["review_world_authoring"] : ["complete_world_authoring"] };
}

export function changeAuthoringState(current: WorldAuthoringState | null, tool: string,
  args: Record<string, unknown>, fingerprint: string): WorldAuthoringState {
  const activity = { tool, at: new Date().toISOString(), fingerprint };
  if (tool === "begin_world_authoring") {
    if (current && args.replaceExisting !== true) throw new Error("制作目標は保存済みです。get_world_authoringで再開してください。");
    if (typeof args.blueprint !== "string" || !args.blueprint.trim() || args.blueprint.length > 20000 ||
        !Array.isArray(args.criteria) || !args.criteria.length || args.criteria.length > 100 ||
        args.criteria.some(c => typeof c !== "string" || !c.trim() || c.length > 1000) ||
        new Set(args.criteria).size !== args.criteria.length) throw new Error("設計図と重複のない完成条件を指定してください。");
    return { version: 1, sequence: (current?.sequence ?? 0) + 1, blueprint: args.blueprint, criteria: args.criteria,
      captures: {}, reviews: {}, completedFingerprint: null, activity };
  }
  if (!current) throw new Error("begin_world_authoringで設計図を保存してください。");
  const state = structuredClone(current);
  state.sequence++;
  state.activity = activity;
  if (tool === "capture_scene_view") {
    if (args.authoringView !== "spawn" && args.authoringView !== "iso") throw new Error("authoringViewを指定してください。");
    if (typeof args.path !== "string") throw new Error("撮影結果がありません。");
    state.captures[args.authoringView] = { id: crypto.randomUUID(), view: args.authoringView, fingerprint, path: args.path };
    state.completedFingerprint = null;
  } else if (tool === "review_world_authoring") {
    if (typeof args.criterion !== "string" || !state.criteria.includes(args.criterion) ||
        typeof args.passed !== "boolean" || typeof args.reason !== "string" || !args.reason.trim() || args.reason.length > 5000) {
      throw new Error("完成条件、合否、画像から判断した根拠を指定してください。");
    }
    const ids = [state.captures.spawn?.id, state.captures.iso?.id];
    if (authoringStatus(state, fingerprint).missingViews?.length || !Array.isArray(args.captureIds) ||
        !ids.every(id => id && (args.captureIds as unknown[]).includes(id))) throw new Error("最新の両画像を確認し、captureIdsを指定してください。");
    Object.defineProperty(state.reviews, args.criterion, { value: { passed: args.passed, reason: args.reason, captureIds: ids as string[] }, enumerable: true, writable: true, configurable: true });
    state.completedFingerprint = null;
  } else if (tool === "complete_world_authoring") {
    const status = authoringStatus(state, fingerprint);
    if (status.uncheckedCriteria?.length) throw new Error(`未確認の完成条件があります: ${status.uncheckedCriteria.join("、")}`);
    state.completedFingerprint = fingerprint;
  }
  return state;
}
