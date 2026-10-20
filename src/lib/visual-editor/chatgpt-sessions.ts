import type { PiAuthoringRun as ChatgptGeneration, PiRunPhase as ChatgptGenerationPhase } from "./pi-authoring";
import type { PrototypeVisualProject } from "./prototype-project";
import { restoreChatgptChoicePreview, parseChatgptQuestions } from "./chatgpt-questions";
import { sceneSettingsDisplayFromLegacyDetail, type ChatgptSettingDisplay } from "./chatgpt-change-description";
import { parseChatgptProduction } from "./chatgpt-production";
import { interruptChatgptHarnessSnapshot, normalizeChatgptHarnessSnapshot } from "./chatgpt-legacy-history";
import { CHATGPT_HARNESS_CONTEXT_REF_LIMIT, normalizeChatgptHarnessContextRef } from "./chatgpt-harness-context-ref";

export const CHATGPT_SESSION_STORAGE_KEY = "xrift-studio:chatgpt-sessions:v1";
export const CHATGPT_MAX_SESSIONS = 20;
export const CHATGPT_MAX_SESSION_TURNS = 30;
export const CHATGPT_SESSION_STORAGE_BYTES = 3 * 1024 * 1024;
export const CHATGPT_CONVERSATION_BYTES = 24 * 1024;
export type ChatgptSession = {
  piBranch?: { sessionId: string; leafId: string; parentSessionId: string };
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
const statuses = ["running", "planned", "completed", "failed", "cancelled", "thinking", "compacting", "retrying"];
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
function normalizeSettingDisplays(value: unknown): ChatgptSettingDisplay[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const settings = value.slice(0, 96).filter(isRecord).filter(setting => typeof setting.label === "string" && typeof setting.value === "string").map(setting => ({
    label: text(setting.label, 80), value: text(setting.value, 240),
    ...(typeof setting.previousValue === "string" ? { previousValue: text(setting.previousValue, 240) } : {}),
    ...(typeof setting.enabled === "boolean" ? { enabled: setting.enabled } : {}),
    ...(typeof setting.color === "string" && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/iu.test(setting.color) ? { color: setting.color } : {}),
  })).filter(setting => setting.label && setting.value);
  return settings.length ? settings : undefined;
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
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : fallback;
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
  // Machine facts use the runtime's strict restoration boundary. Public text
  // sanitization must not rewrite identifiers, fingerprints or journal order.
  const harness = value.harness === undefined ? undefined : normalizeChatgptHarnessSnapshot(value.harness);
  if (value.contextRefs !== undefined && (!Array.isArray(value.contextRefs) || value.contextRefs.length > CHATGPT_HARNESS_CONTEXT_REF_LIMIT)) throw new Error("制作入力の参照記録を読み込めません。保存した会話履歴を確認してください。");
  const contextRefs = value.contextRefs === undefined ? undefined : (value.contextRefs as unknown[]).map(normalizeChatgptHarnessContextRef);
  if (harness && harness.runId !== value.generationId) throw new Error("会話履歴と制作の実行IDが一致しません。保存した履歴を確認してください。");
  const wasInterrupted = interrupted && (value.status === "running" || value.status === "planned" || harness?.phase === "running" || harness?.phase === "stopping");
  const turn: ChatgptGeneration = {
    generationId: identifier(value.generationId),
    status: wasInterrupted ? "cancelled" : value.status as ChatgptGeneration["status"],
    cancelling: interrupted ? false : value.cancelling === true,
    model: text(value.model, 128), prompt: text(value.prompt, 2000),
    options: {
      models: !isRecord(value.options) || value.options.models !== false,
      materials: !isRecord(value.options) || value.options.materials !== false,
      audio: !isRecord(value.options) || value.options.audio !== false,
      ...(isRecord(value.options) && ["auto", "blender", "store"].includes(String(value.options.modelSource))
        ? { modelSource: value.options.modelSource as "auto" | "blender" | "store" } : {}),
    },
    sourceProjectId: identifier(value.sourceProjectId),
    progress: {
      phase: wasInterrupted ? "cancelled" : phases.includes(progress.phase as ChatgptGenerationPhase) ? progress.phase as ChatgptGenerationPhase : "failed",
      message: wasInterrupted ? "Studioを再起動したため、この依頼は終了しました。続ける場合は依頼を送り直してください。" : text(progress.message, 1000),
      completed: integer(progress.completed), total: integer(progress.total),
      recentEvents: Array.isArray(progress.recentEvents) ? progress.recentEvents.slice(-128).filter(isRecord).map(event => ({
        sequence: integer(event.sequence), phase: phases.includes(event.phase as ChatgptGenerationPhase) ? event.phase as ChatgptGenerationPhase : "failed",
        message: text(event.message, 600), ...(typeof event.entityId === "string" ? { entityId: identifier(event.entityId) } : {}), ...(typeof event.name === "string" ? { name: text(event.name, 80) } : {}), ...(event.saved === true ? { saved: true } : {}),
      })) : [],
    },
    revertAvailable: interrupted ? false : value.revertAvailable === true,
    ...(harness ? { harness: interrupted ? interruptChatgptHarnessSnapshot(harness) : harness } : {}),
    ...(contextRefs ? { contextRefs } : {}),
  };
  if (typeof value.assistantText === "string") turn.assistantText = text(value.assistantText, 32_000);
  if (typeof value.completionVerified === "boolean") turn.completionVerified = value.completionVerified;
  if (Array.isArray(value.liveMessages)) turn.liveMessages = value.liveMessages.map(raw => {
    if (!isRecord(raw) || !["steer", "follow_up"].includes(String(raw.delivery)) || !["queued", "applied", "unapplied"].includes(String(raw.state))) throw new Error("追加指示の記録が不正です");
    return { id: identifier(raw.id), prompt: text(raw.prompt, 2000), delivery: raw.delivery as "steer" | "follow_up",
      state: interrupted && raw.state === "queued" ? "unapplied" : raw.state as "queued" | "applied" | "unapplied",
      ...(Array.isArray(raw.attachedEntityIds) ? { attachedEntityIds: raw.attachedEntityIds.slice(0, 100).map(identifier) } : {}),
      ...(Array.isArray(raw.attachedMaterialIds) ? { attachedMaterialIds: raw.attachedMaterialIds.slice(0, 16).map(identifier) } : {}) };
  });
  if (isRecord(value.usage)) {
    const usage = value.usage;
    const fields = ["modelTurns", "toolCalls", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "totalTokens"] as const;
    if (fields.some(key => typeof usage[key] !== "number" || !Number.isSafeInteger(usage[key]) || (usage[key] as number) < 0)) throw new Error("使用量の記録が不正です");
    turn.usage = Object.fromEntries(fields.map(key => [key, usage[key]])) as import("./pi-authoring").PiUsage;
  }
  if (value.piHistory !== undefined) {
    const history = value.piHistory;
    if (!isRecord(history) || !Array.isArray(history.nodes) || history.nodes.length > 300) throw new Error("会話履歴の形式が不正です");
    turn.piHistory = { sessionId: identifier(history.sessionId), leafId: history.leafId === null ? null : identifier(history.leafId), nodes: history.nodes.map(raw => {
      if (!isRecord(raw) || typeof raw.canBranch !== "boolean") throw new Error("会話履歴の項目が不正です");
      return { id: identifier(raw.id), parentId: raw.parentId === null ? null : identifier(raw.parentId), label: text(raw.label, 80), canBranch: raw.canBranch };
    }) };
  }
  if (isRecord(value.options)) {
    if (Array.isArray(value.options.extensions) && value.options.extensions.length <= 8 && value.options.extensions.every(source => typeof source === "string" && source.length <= 240)) turn.options.extensions = value.options.extensions as string[];
  }
  for (const key of ["sourceSceneId", "projectId", "sceneId", "sessionId"] as const) if (value[key] !== undefined) turn[key] = identifier(value[key]);
  if (progress.projectId !== undefined) turn.progress.projectId = identifier(progress.projectId);
  if (value.mode === "build" || value.mode === "plan" || value.mode === "goal") turn.mode = value.mode;
  if (turn.mode === "goal" && isRecord(value.goal)) turn.goal = { iteration: Math.max(1, integer(value.goal.iteration, 1)), noProgressPasses: integer(value.goal.noProgressPasses) };
  const production = parseChatgptProduction(value.production);
  if (production) {
    turn.production = { ...production, focus: text(production.focus, 160), criteria: production.criteria.map(criterion => text(criterion, 240)) };
    turn.productionPass = Math.min(production.maxPasses, Math.max(1, integer(value.productionPass, 1)));
    turn.productionNoProgressPasses = integer(value.productionNoProgressPasses);
    if (value.productionVisualReview === true) turn.productionVisualReview = true;
  }
  if (typeof value.reasoningEffort === "string" && efforts.includes(value.reasoningEffort)) turn.reasoningEffort = value.reasoningEffort;
  for (const key of ["createdAt", "revertedAt"] as const) if (value[key] !== undefined) turn[key] = timestamp(value[key]);
  if (value.name !== undefined) turn.name = text(value.name, 100);
  if (Array.isArray(value.attachedEntities)) turn.attachedEntities = value.attachedEntities.slice(0, 100).filter(isRecord).map(entity => ({ id: identifier(entity.id), name: text(entity.name, 80) }));
  if (Array.isArray(value.attachedMaterials)) turn.attachedMaterials = value.attachedMaterials.slice(0, 16).filter(isRecord).map(material => ({ id: identifier(material.id), name: text(material.name, 80) }));
  if (Array.isArray(value.clarifications)) turn.clarifications = value.clarifications.slice(-9).filter(isRecord).map(item => ({ question: text(item.question, 240), answer: text(item.answer, 500), ...(typeof item.candidateId === "string" && item.candidateId.length <= 320 && /^(?:builtin|project|poly-haven|ambient-cg|ai-lowpoly-props|otogura):[^\s\u0000-\u001f]+$/u.test(item.candidateId) ? { candidateId: item.candidateId } : {}) }));
  if (value.error !== undefined) turn.error = text(value.error, 2000);
  if (isRecord(value.plan)) turn.plan = {
    ...(value.plan.questions !== undefined ? { questions: parseChatgptQuestions(value.plan.questions) } : {}),
    title: text(value.plan.title, 160), description: text(value.plan.description, 8000),
    ...(typeof value.plan.hasMore === "boolean" ? { hasMore: value.plan.hasMore } : {}),
    ...(typeof value.plan.remainingWork === "string" ? { remainingWork: text(value.plan.remainingWork, 600) } : {}),
    objects: (Array.isArray(value.plan.objects) ? value.plan.objects : []).slice(0, 32).filter(isRecord).map(object => {
      const settings = normalizeSettingDisplays(object.settings) ?? normalizeSettingDisplays(typeof object.detail === "string" ? sceneSettingsDisplayFromLegacyDetail(object.detail) : undefined);
      const originalName = text(object.name, 80);
      const labels = settings ? [...new Set(settings.map(setting => setting.label))] : [];
      const name = originalName === "Scene設定を調整" && labels.length ? `${labels.slice(0, 3).join("・")}${labels.length > 3 ? `ほか${labels.length - 3}項目` : ""}を変更` : originalName;
      const preview = restoreChatgptChoicePreview(object.preview);
      return { name, shape: text(object.shape, 32), ...(preview ? { preview: { ...preview, name: text(preview.name, 80) } } : {}), ...(typeof object.saved === "boolean" ? { saved: object.saved } : {}), ...(typeof object.entityId === "string" ? { entityId: identifier(object.entityId) } : {}), ...(typeof object.detail === "string" ? { detail: text(object.detail, 500) } : {}), ...(typeof object.materialAssetId === "string" ? { materialAssetId: identifier(object.materialAssetId) } : {}), ...(Array.isArray(object.sceneSettingsSections) ? { sceneSettingsSections: [...new Set(object.sceneSettingsSections.filter((section): section is "skybox" | "fog" => section === "skybox" || section === "fog"))] } : {}), ...(settings ? { settings } : {}) };
    }),
  };
  if (isRecord(value.questionPreviews) && turn.plan?.questions?.length) {
    const referenced = new Set(turn.plan.questions.flatMap(question => question.choiceCandidateIds ?? []));
    turn.questionPreviews = {};
    for (const [id, rawPreview] of Object.entries(value.questionPreviews).slice(0, 36)) {
      if (!referenced.has(id)) continue;
      const preview = restoreChatgptChoicePreview(rawPreview);
      if (!preview || preview.kind === "sky" && id !== `builtin:xrift-sky-shaders:${preview.catalogId}`
        || preview.kind === "builtin" && id !== preview.candidateId
        || preview.kind === "project" && id !== `project:${preview.assetId}`) continue;
      turn.questionPreviews[id] = { ...preview, name: text(preview.name, 80) };
    }
  }
  return turn;
}
function normalizeSessions(values: readonly unknown[], interrupted: boolean): ChatgptSession[] {
  const sessions = values.map(value => {
    if (!isRecord(value) || !Array.isArray(value.turns)) throw new Error("会話履歴を読み取れませんでした。保存した履歴を確認してください。");
    // Validate retained and older entries before applying retention. Corrupt or
    // future-version journals must not disappear during a routine save.
    let piBranch: ChatgptSession["piBranch"];
    if (value.piBranch !== undefined) {
      if (!isRecord(value.piBranch)) throw new Error("会話履歴の分岐元が不正です");
      piBranch = { sessionId: identifier(value.piBranch.sessionId), leafId: identifier(value.piBranch.leafId), parentSessionId: identifier(value.piBranch.parentSessionId) };
    }
    return { id: identifier(value.id), projectId: identifier(value.projectId), sceneId: identifier(value.sceneId), title: text(value.title, 80) || "新しいチャット", createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt), turns: value.turns.map(turn => normalizeTurn(turn, interrupted)).slice(-CHATGPT_MAX_SESSION_TURNS), ...(piBranch ? { piBranch } : {}) };
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
const piTurnInSession = (session: ChatgptSession, turn: ChatgptGeneration) =>
  (turn.projectId ?? turn.sourceProjectId) === session.projectId && (turn.sceneId ?? turn.sourceSceneId ?? session.sceneId) === session.sceneId;
/** A request creating a new World is also listed in the source chat; its Pi file belongs to the target. */
export function piHistoryForSession(session: ChatgptSession) {
  return [...session.turns].reverse().find(turn => turn.piHistory && piTurnInSession(session, turn))?.piHistory;
}
export function piSessionHistoryRoots(session: ChatgptSession): Set<string> {
  return new Set([session.id, ...(session.piBranch ? [session.piBranch.sessionId] : []),
    ...session.turns.filter(turn => piTurnInSession(session, turn)).flatMap(turn => turn.piHistory ? [turn.piHistory.sessionId] : [])]);
}
export function branchChatgptSession(source: ChatgptSession, entryId: string, now = nowIso(), id = crypto.randomUUID()): ChatgptSession {
  const history = [...source.turns].reverse().filter(turn => piTurnInSession(source, turn)).map(turn => turn.piHistory).find(history => history?.nodes.some(node => node.id === entryId && node.canBranch));
  if (!history) throw new Error("分岐できる制作の応答を選んでください");
  return { ...createChatgptSession(source.projectId, source.sceneId, `${source.title.slice(0, 65)}・別案`, now, id), piBranch: { sessionId: history.sessionId, leafId: identifier(entryId), parentSessionId: source.id } };
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
  const status = turn.status === "completed" && turn.completionVerified === false ? "応答済み" : { running: "処理中", planned: "Plan確認待ち", completed: "完了", failed: "失敗", cancelled: "停止" }[turn.status];
  const lines = [turn.revertedAt ? `変更を戻しました（${turn.revertedAt}）。この依頼の変更は現在のSceneに残っていません。` : status, turn.progress.message, `保存済み ${turn.progress.completed} / ${turn.progress.total}`];
  if (turn.liveMessages) for (const message of turn.liveMessages) lines.push(`追加指示（${message.state === "applied" ? "受信済み" : message.state === "unapplied" ? "未反映" : "待機中"}）：${message.prompt}`);
  if (turn.usage) lines.push(`実行情報: モデル応答${turn.usage.modelTurns}回、ツール実行${turn.usage.toolCalls}回、合計${turn.usage.totalTokens}トークン`);
  if (turn.production) lines.push(`制作 ${turn.productionPass ?? 1} / ${turn.production.maxPasses}回。焦点: ${turn.production.focus}`, `完了条件: ${turn.production.criteria.join("、")}`);
  if (turn.attachedEntities?.length) lines.push(`添付Entity（配下を優先）: ${turn.attachedEntities.map(entity => entity.name).join("、")}`);
  if (turn.attachedMaterials?.length) lines.push(`添付Material: ${turn.attachedMaterials.map(material => material.name).join("、")}`);
  if (turn.clarifications?.length) lines.unshift(...turn.clarifications.slice(-3).map(item => `確認: ${Array.from(item.question).slice(0, 80).join("")}\n${item.candidateId ? `候補ID: ${item.candidateId}\n` : ""}回答: ${Array.from(item.answer).slice(0, Math.max(160, 500 - (item.candidateId?.length ?? 0))).join("")}`));
  if (turn.plan) lines.push(`Plan: ${turn.plan.title}`, turn.plan.description, ...(turn.plan.objects ?? []).map(object => `${object.name}（${object.shape}）${object.detail ? `：${object.detail}` : ""}`));
  if (turn.plan?.hasMore) lines.push(`残りの作業: ${turn.plan.remainingWork || "この依頼の続き"}`);
  if (turn.plan?.questions?.length) lines.push(...turn.plan.questions.map((question, index) => `確認${index + 1}: ${question.question}\n${question.choices.map((choice, i) => `${i + 1}. ${choice}`).join("\n")}\nその他（自由入力）`));
  lines.push(...turn.progress.recentEvents.map(event => event.message));
  if (turn.error) lines.push(`エラー: ${turn.error}`);
  return lines.filter(Boolean).join("\n");
}
export function chatgptSessionTranscript(session: ChatgptSession): string {
  const safe = normalizeSessions([session], false)[0];
  return [safe.title, `作成: ${safe.createdAt}`, `更新: ${safe.updatedAt}`, ...safe.turns.map((turn, index) => [
    `\n依頼 ${index + 1}${turn.createdAt ? `（${turn.createdAt}）` : ""}`, `モデル: ${turn.model}`, `思考量: ${turn.reasoningEffort ?? "モデルの既定"}`, ...(turn.mode === "goal" ? [turn.goal ? `Goal（${turn.goal.iteration}回）` : "Goal"] : []), turn.prompt, resultSummary(turn),
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
