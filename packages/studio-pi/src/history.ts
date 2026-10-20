import { mkdir, open, stat, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { PiHistory } from "./protocol.js";
export type { PiHistory } from "./protocol.js";

export type StoredSession = { id: string; path: string; leafId?: string };
export function canBranch(entry: SessionEntry): boolean {
  return entry.type === "message" && entry.message.role === "assistant"
    && !entry.message.content.some(block => block.type === "toolCall")
    && entry.message.stopReason === "stop";
}
const resumeBoundary = (entry: SessionEntry) => canBranch(entry) || entry.type === "message" && entry.message.role === "custom" && entry.message.customType === "studio-run-outcome";
/** Keep an interrupted tool batch on its own branch and persist the actual outcome. */
export function recordFailedRun(manager: SessionManager, message: string, request: string): void {
  const safe = [...manager.getBranch()].reverse().find(resumeBoundary);
  if (safe) manager.branch(safe.id); else manager.resetLeaf();
  manager.appendMessage({ role: "custom", customType: "studio-run-outcome", display: false, timestamp: Date.now(),
    content: `直前の依頼・回答：\n${request}\n\nStudioは直前の依頼を完了として受け付けませんでした。理由：${message}\n保存済みの変更や手動編集は残っています。次の依頼では現在のSceneを読み直し、未確認の結果を完了済みと扱わないでください。` });
}
export async function openHistory(stored?: StoredSession): Promise<SessionManager> {
  if (!stored) return SessionManager.inMemory();
  await mkdir(dirname(stored.path), { recursive: true, mode: 0o700 });
  try { const file = await open(stored.path, "wx", 0o600); await file.close(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if ((await stat(stored.path)).size > 32 * 1024 * 1024) throw new Error("会話履歴が32 MiBを超えました。新しいチャットで続けてください");
  if (process.platform !== "win32") await chmod(stored.path, 0o600);
  const manager = SessionManager.open(stored.path, dirname(stored.path), dirname(stored.path));
  if (stored.leafId) {
    const entry = manager.getEntry(stored.leafId);
    if (!entry || !resumeBoundary(entry)) throw new Error("分岐元・再開元の会話履歴が見つからないか、作業途中の記録です。完了した応答を選んでください");
    manager.branch(stored.leafId);
  } else {
    // A process can stop between a tool call and its reply. Never restore an
    // incomplete tool batch as the starting context of the next request.
    const safe = [...manager.getBranch()].reverse().find(resumeBoundary);
    if (safe) manager.branch(safe.id);
    else manager.resetLeaf();
  }
  return manager;
}
export function historySummary(manager: SessionManager, id?: string): PiHistory | undefined {
  const leafId = [...manager.getBranch()].reverse().find(resumeBoundary)?.id;
  if (!id) return undefined;
  return { sessionId: id, leafId: leafId ?? null, nodes: manager.getEntries().slice(-300).map(entry => {
    let label = "会話の記録";
    if (entry.type === "message") {
      const message = entry.message;
      label = message.role === "toolResult" ? "操作の結果" : message.role === "assistant"
        ? message.content.some(block => block.type === "toolCall") ? "AIの操作" : "AIの応答"
        : message.role === "user" ? "依頼" : message.role === "custom" && message.customType === "studio-run-outcome" ? "停止・エラーの記録" : "会話の記録";
    } else if (entry.type === "compaction") label = "会話の要約";
    return { id: entry.id, parentId: entry.parentId, label, canBranch: canBranch(entry) };
  }) };
}
