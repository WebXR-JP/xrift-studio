import type { ChatgptGeneration, ChatgptGenerationPhase } from "./chatgpt-generation";
import type { PrototypeVisualProject } from "./prototype-project";

export const CHATGPT_SESSION_STORAGE_KEY = "xrift-studio:chatgpt-sessions:v1";
export const CHATGPT_MAX_SESSIONS = 20;
export const CHATGPT_MAX_SESSION_TURNS = 30;
export const CHATGPT_SESSION_STORAGE_BYTES = 3 * 1024 * 1024;
export const CHATGPT_CONVERSATION_BYTES = 24 * 1024;
export type ChatgptSession = {
  id: string;
  projectId: string;
  sceneId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ChatgptGeneration[];
};
export type ChatgptConversationTurn = { prompt: string; result: string };
export type ChatgptRevertCheckpoint = { before: PrototypeVisualProject; after: PrototypeVisualProject };
type SessionStorage = Pick<Storage, "getItem" | "setItem">;
const statuses = ["running", "planned", "completed", "failed", "cancelled"];
const phases: ChatgptGenerationPhase[] = ["planning", "planned", "preparing", "importing", "placing", "saving", "completed", "failed", "cancelled"];
const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const points = (value: string, limit: number) => Array.from(value).slice(0, limit).join("");
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();

/** Only the public conversation is persisted or copied, never raw IPC state. */
export function sanitizeChatgptHistoryText(value: string, limit = 2000): string {
  const safe = value.replace(/\r\n?/g, "\n")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [削除]")
    .replace(/\b(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|api[_ -]?key|authorization|cookie|password|secret)["']?\s*[:=]\s*["']?[^\s,;"']+/gi, "$1=[削除]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|xrf_[A-Za-z0-9_-]{8,})\b/g, "[削除]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[削除]")
    .replace(/\b(?:https?|file):\/\/[^\s<>"']+/gi, value => {
      try {
        const url = new URL(value);
        if (url.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return "[ローカルURL]";
        url.username = ""; url.password = ""; url.search = ""; url.hash = "";
        return url.toString();
      } catch { return "[URL]"; }
    })
    .replace(/\b[A-Za-z]:[\\/][^\r\n;]*/g, "[ローカルパス]")
    .replace(/\\\\[^\r\n;]*/g, "[ローカルパス]")
    .replace(/(^|[\s("'=])\/(?:[^/\s]+\/)[^\r\n;]*/g, "$1[ローカルパス]");
  return points(safe.trim(), limit);
}
function text(value: unknown, limit: number): string {
  return sanitizeChatgptHistoryText(typeof value === "string" ? value : "", limit);
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value)) throw new Error("会話履歴のIDを読み取れませんでした。保存した履歴を確認してください。");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("会話履歴の日付を読み取れませんでした。保存した履歴を確認してください。");
  return new Date(value).toISOString();
}
function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? value : fallback;
}
function browserStorage(): SessionStorage {
  try {
    if (typeof window !== "undefined") return window.localStorage;
  } catch { /* Access to localStorage itself can be denied. */ }
  throw new Error("会話履歴の保存先を開けませんでした。このチャットの内容をコピーして残してください。");
}
function normalizeTurn(value: unknown, interrupted: boolean): ChatgptGeneration {
  if (!isRecord(value) || !statuses.includes(String(value.status)) || !isRecord(value.progress)) throw new Error("会話履歴の依頼を読み取れませんでした。保存した履歴を確認してください。");
  const progress = value.progress;
  const wasInterrupted = interrupted && (value.status === "running" || value.status === "planned");
  const turn: ChatgptGeneration = {
    generationId: identifier(value.generationId),
    status: wasInterrupted ? "cancelled" : value.status as ChatgptGeneration["status"],
    cancelling: interrupted ? false : value.cancelling === true,
    model: text(value.model, 128), prompt: text(value.prompt, 2000),
    options: { models: !isRecord(value.options) || value.options.models !== false, materials: !isRecord(value.options) || value.options.materials !== false, audio: !isRecord(value.options) || value.options.audio !== false },
    sourceProjectId: identifier(value.sourceProjectId),
    progress: {
      phase: wasInterrupted ? "cancelled" : phases.includes(progress.phase as ChatgptGenerationPhase) ? progress.phase as ChatgptGenerationPhase : "failed",
      message: wasInterrupted ? "Studioを再起動したため、この依頼は終了しました。続ける場合は依頼を送り直してください。" : text(progress.message, 1000),
      completed: integer(progress.completed), total: integer(progress.total),
      recentEvents: Array.isArray(progress.recentEvents) ? progress.recentEvents.slice(-128).filter(isRecord).map(event => ({
        sequence: integer(event.sequence), phase: phases.includes(event.phase as ChatgptGenerationPhase) ? event.phase as ChatgptGenerationPhase : "failed",
        message: text(event.message, 600), ...(typeof event.entityId === "string" ? { entityId: identifier(event.entityId) } : {}), ...(typeof event.name === "string" ? { name: text(event.name, 80) } : {}),
      })) : [],
    },
    revertAvailable: interrupted ? false : value.revertAvailable === true,
  };
  for (const key of ["sourceSceneId", "projectId", "sceneId", "sessionId"] as const) if (value[key] !== undefined) turn[key] = identifier(value[key]);
  if (progress.projectId !== undefined) turn.progress.projectId = identifier(progress.projectId);
  if (value.mode === "build" || value.mode === "plan") turn.mode = value.mode;
  if (typeof value.reasoningEffort === "string" && efforts.includes(value.reasoningEffort)) turn.reasoningEffort = value.reasoningEffort;
  for (const key of ["createdAt", "revertedAt"] as const) if (value[key] !== undefined) turn[key] = timestamp(value[key]);
  if (value.name !== undefined) turn.name = text(value.name, 100);
  if (value.error !== undefined) turn.error = text(value.error, 2000);
  if (isRecord(value.plan) && Array.isArray(value.plan.objects)) turn.plan = {
    title: text(value.plan.title, 100), description: text(value.plan.description, 600),
    ...(typeof value.plan.hasMore === "boolean" ? { hasMore: value.plan.hasMore } : {}),
    ...(typeof value.plan.remainingWork === "string" ? { remainingWork: text(value.plan.remainingWork, 600) } : {}),
    objects: value.plan.objects.slice(0, 32).filter(isRecord).map(object => ({ name: text(object.name, 80), shape: text(object.shape, 32) })),
  };
  return turn;
}
function normalizeSessions(values: readonly unknown[], interrupted: boolean): ChatgptSession[] {
  const sessions = values.map(value => {
    if (!isRecord(value) || !Array.isArray(value.turns)) throw new Error("会話履歴を読み取れませんでした。保存した履歴を確認してください。");
    return { id: identifier(value.id), projectId: identifier(value.projectId), sceneId: identifier(value.sceneId), title: text(value.title, 80) || "新しいチャット", createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt), turns: value.turns.slice(-CHATGPT_MAX_SESSION_TURNS).map(turn => normalizeTurn(turn, interrupted)) };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const seen = new Set<string>();
  return sessions.filter(session => { if (seen.has(session.id)) return false; seen.add(session.id); return true; }).slice(0, CHATGPT_MAX_SESSIONS);
}
function storageEnvelope(sessions: ChatgptSession[]): string { return JSON.stringify({ version: 1, sessions }); }
function boundBytes(sessions: ChatgptSession[]): ChatgptSession[] {
  const result = sessions.map(session => ({ ...session, turns: [] as ChatgptGeneration[] }));
  let bytes = utf8Bytes(storageEnvelope(result));
  for (let index = 0; index < sessions.length; index++) {
    for (const turn of [...sessions[index].turns].reverse()) {
      const addition = utf8Bytes(JSON.stringify(turn)) + (result[index].turns.length ? 1 : 0);
      if (bytes + addition > CHATGPT_SESSION_STORAGE_BYTES) break;
      result[index].turns.unshift(turn); bytes += addition;
    }
  }
  return result;
}
export function createChatgptSession(projectId: string, sceneId: string, title = "新しいチャット", now = nowIso(), id = crypto.randomUUID()): ChatgptSession {
  return { id: identifier(id), projectId: identifier(projectId), sceneId: identifier(sceneId), title: text(title, 80) || "新しいチャット", createdAt: timestamp(now), updatedAt: timestamp(now), turns: [] };
}
export function loadChatgptSessions(storage: SessionStorage = browserStorage()): ChatgptSession[] {
  let raw: string | null;
  try { raw = storage.getItem(CHATGPT_SESSION_STORAGE_KEY); }
  catch { throw new Error("会話履歴を読み込めませんでした。保存先へのアクセスを確認してください。"); }
  if (raw === null) return [];
  if (utf8Bytes(raw) > CHATGPT_SESSION_STORAGE_BYTES) throw new Error("会話履歴の保存サイズが上限を超えています。保存した履歴を確認してください。");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("会話履歴を読み取れませんでした。保存した履歴を確認してください。"); }
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.sessions)) throw new Error("会話履歴の形式に対応していません。保存した履歴を確認してください。");
  return boundBytes(normalizeSessions(data.sessions, true));
}
export function saveChatgptSessions(sessions: readonly ChatgptSession[], storage: SessionStorage = browserStorage()): ChatgptSession[] {
  const bounded = boundBytes(normalizeSessions(sessions, false));
  try { storage.setItem(CHATGPT_SESSION_STORAGE_KEY, storageEnvelope(bounded)); }
  catch { throw new Error("会話履歴を保存できませんでした。このチャットの内容をコピーして残してください。"); }
  return bounded;
}
export function upsertChatgptSessionTurn(sessions: readonly ChatgptSession[], sessionId: string, turn: ChatgptGeneration, now = nowIso()): ChatgptSession[] {
  if (!sessions.some(session => session.id === sessionId)) throw new Error("この会話が見つかりません。チャットを開き直してください。");
  return normalizeSessions(sessions.map(session => {
    if (session.id !== sessionId) return session;
    const next = normalizeTurn({ ...turn, sessionId, createdAt: turn.createdAt ?? now }, false);
    const sourceMatches = next.sourceProjectId === session.projectId && next.sourceSceneId === session.sceneId;
    const targetMatches = next.projectId === session.projectId && next.sceneId === session.sceneId;
    if (!sourceMatches && !targetMatches) throw new Error("この依頼は別の作品やSceneの会話です。");
    const prior = session.turns.find(turn => turn.generationId === next.generationId);
    if (prior?.createdAt) next.createdAt = prior.createdAt;
    const turns = prior ? session.turns.map(turn => turn.generationId === next.generationId ? next : turn) : [...session.turns, next];
    return { ...session, updatedAt: timestamp(now), title: !session.turns.length && session.title === "新しいチャット" ? text(next.prompt.split("\n")[0], 80) || session.title : session.title, turns };
  }), false);
}
function resultSummary(turn: ChatgptGeneration): string {
  const status = { running: "処理中", planned: "Plan確認待ち", completed: "完了", failed: "失敗", cancelled: "停止" }[turn.status];
  const lines = [turn.revertedAt ? `変更を戻しました（${turn.revertedAt}）。この依頼の変更は現在のSceneに残っていません。` : status, turn.progress.message, `保存済み ${turn.progress.completed} / ${turn.progress.total}`];
  if (turn.plan) lines.push(`Plan: ${turn.plan.title}`, turn.plan.description, ...turn.plan.objects.map(object => `${object.name}（${object.shape}）`));
  if (turn.plan?.hasMore) lines.push(`残りの作業: ${turn.plan.remainingWork || "この依頼の続き"}`);
  lines.push(...turn.progress.recentEvents.map(event => event.message));
  if (turn.error) lines.push(`エラー: ${turn.error}`);
  return lines.filter(Boolean).join("\n");
}
export function chatgptSessionTranscript(session: ChatgptSession): string {
  const safe = normalizeSessions([session], false)[0];
  return [safe.title, `作成: ${safe.createdAt}`, `更新: ${safe.updatedAt}`, ...safe.turns.map((turn, index) => [
    `\n依頼 ${index + 1}${turn.createdAt ? `（${turn.createdAt}）` : ""}`, `モデル: ${turn.model}`, `思考量: ${turn.reasoningEffort ?? "モデルの既定"}`, turn.prompt, resultSummary(turn),
  ].join("\n"))].join("\n");
}
/** Earlier turns are data, not instructions. The native prompt enforces this too. */
export function chatgptConversationContext(session: ChatgptSession): ChatgptConversationTurn[] {
  const result: ChatgptConversationTurn[] = [];
  for (const raw of [...session.turns].reverse()) {
    const turn = normalizeTurn(raw, false);
    if (turn.status === "running") continue;
    const next = { prompt: text(turn.prompt, 2000), result: text(resultSummary(turn), 2000) };
    if (utf8Bytes(JSON.stringify([next, ...result])) > CHATGPT_CONVERSATION_BYTES) break;
    result.unshift(next);
    if (result.length >= 6) break;
  }
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function authoredContent(bundle: PrototypeVisualProject): string {
  // Background thumbnail rendering is derived data, not a later author edit.
  const assets = { ...bundle.assets, assets: Object.fromEntries(Object.entries(bundle.assets.assets).map(([id, asset]) => {
    const { thumbnail: _thumbnail, ...authored } = asset;
    return [id, authored];
  })) };
  return canonical({ scene: bundle.scene, assets, prefabs: bundle.prefabs });
}
export function createChatgptRevertCheckpoint(before: PrototypeVisualProject, after: PrototypeVisualProject): ChatgptRevertCheckpoint {
  if (before.project.projectId !== after.project.projectId || before.scene.sceneId !== after.scene.sceneId) throw new Error("別の作品やSceneの変更は戻せません。");
  return structuredClone({ before, after });
}
/** Keep one original + latest snapshot per request instead of every full step. */
export function extendChatgptRevertCheckpoint(previous: ChatgptRevertCheckpoint | undefined, before: PrototypeVisualProject, after: PrototypeVisualProject): ChatgptRevertCheckpoint {
  if (!previous) return createChatgptRevertCheckpoint(before, after);
  for (const bundle of [previous.before, previous.after, after]) if (bundle.project.projectId !== before.project.projectId || bundle.scene.sceneId !== before.scene.sceneId) throw new Error("別の作品やSceneの変更は戻せません。");
  if (authoredContent(previous.after) !== authoredContent(before)) throw new Error("制作の途中に別の編集が入りました。変更を戻せません。");
  return { before: previous.before, after: structuredClone(after) };
}
/** Does not save or delete files. The caller rechecks immediately before saving. */
export function chatgptRevertBundle(current: PrototypeVisualProject, checkpoints: readonly ChatgptRevertCheckpoint[]): PrototypeVisualProject {
  if (!checkpoints.length) throw new Error("戻せる制作の変更がありません。");
  for (let index = 0; index < checkpoints.length; index++) {
    const checkpoint = checkpoints[index];
    for (const bundle of [checkpoint.before, checkpoint.after]) if (bundle.project.projectId !== current.project.projectId || bundle.scene.sceneId !== current.scene.sceneId) throw new Error("変更を行った作品とSceneを開いてください。");
    if (index && authoredContent(checkpoints[index - 1].after) !== authoredContent(checkpoint.before)) throw new Error("制作の途中に別の編集が入りました。変更を戻せません。");
  }
  if (authoredContent(current) !== authoredContent(checkpoints[checkpoints.length - 1].after)) throw new Error("制作の後に編集が入りました。手動編集を守るため変更を戻せません。");
  const before = structuredClone(checkpoints[0].before);
  return { ...current, scene: before.scene, assets: before.assets, prefabs: before.prefabs };
}
