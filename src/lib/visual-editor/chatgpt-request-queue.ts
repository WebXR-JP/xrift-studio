import type { ChatgptAssetOptions } from "../tauri";
import type { PiAuthoringRun as ChatgptGeneration, PiMode as ChatgptGenerationMode } from "./pi-authoring";

export type ChatgptRequestScope = { sceneScope: string; scope: string; requestId: string; attachedEntityIds?: readonly string[]; attachedMaterialIds?: readonly string[] };
/** A Scene draft follows only the chat created by its own dispatched request. */
export function isChatgptInitialScopeAdoption(lease: { id: string; scope: string; sceneScope: string } | null, scope: string, sceneScope: string,
  generation?: Pick<ChatgptGeneration, "sessionId" | "generationId" | "sourceProjectId" | "sourceSceneId"> | null): boolean {
  return Boolean(lease && lease.scope !== scope && lease.scope === lease.sceneScope && lease.sceneScope === sceneScope
    && generation?.sessionId === scope && generation.generationId === lease.id
    && `${generation.sourceProjectId}:${generation.sourceSceneId}` === lease.sceneScope);
}

export type ChatgptQueuedRequest = {
  id: string;
  prompt: string;
  attachedEntityIds?: readonly string[];
  attachedMaterialIds?: readonly string[];
  model: string;
  reasoningEffort?: string;
  options: ChatgptAssetOptions;
  mode: ChatgptGenerationMode;
  status: "waiting" | "running" | "failed";
  error?: string;
};
export type ChatgptRequestQueue = { items: ChatgptQueuedRequest[]; pauseReason?: string };
export type ChatgptRequestQueues = Record<string, ChatgptRequestQueue>;
const emptyQueue: ChatgptRequestQueue = { items: [] };
export function chatgptQueueFor(queues: ChatgptRequestQueues, scope: string): ChatgptRequestQueue {
  return queues[scope] ?? emptyQueue;
}
function change(queues: ChatgptRequestQueues, scope: string, update: (queue: ChatgptRequestQueue) => ChatgptRequestQueue): ChatgptRequestQueues {
  return { ...queues, [scope]: update(chatgptQueueFor(queues, scope)) };
}
export function enqueueChatgptRequest(queues: ChatgptRequestQueues, scope: string, request: Omit<ChatgptQueuedRequest, "status" | "error">) {
  return change(queues, scope, queue => ({ ...queue, items: [...queue.items, { ...request,
    attachedEntityIds: request.attachedEntityIds ? [...request.attachedEntityIds] : undefined,
    attachedMaterialIds: request.attachedMaterialIds?.slice(0, 16),
    options: { ...request.options }, status: "waiting" }] }));
}
export function beginChatgptQueuedRequest(queues: ChatgptRequestQueues, scope: string, id: string) {
  return change(queues, scope, queue => queue.pauseReason || queue.items[0]?.id !== id || queue.items[0].status !== "waiting" ? queue
    : { ...queue, items: queue.items.map(item => item.id === id ? { ...item, status: "running" } : item) });
}
export function completeChatgptQueuedRequest(queues: ChatgptRequestQueues, scope: string, id: string) {
  return change(queues, scope, queue => ({ ...queue, items: queue.items.filter(item => item.id !== id) }));
}
export function failChatgptQueuedRequest(queues: ChatgptRequestQueues, scope: string, id: string, error: string) {
  return change(queues, scope, queue => ({ ...queue, pauseReason: "依頼を完了できなかったため、送信を保留しています。",
    items: queue.items.map(item => item.id === id ? { ...item, status: "failed", error } : item) }));
}
export function pauseChatgptRequestQueue(queues: ChatgptRequestQueues, scope: string, reason: string) {
  return change(queues, scope, queue => ({ ...queue, pauseReason: reason }));
}
export function resumeChatgptRequestQueue(queues: ChatgptRequestQueues, scope: string) {
  // An explicit user retry is a new execution. Its failed run remains closed
  // in history; automatic in-run repairs keep their original ID and budget.
  return change(queues, scope, queue => ({ items: queue.items.map(item => item.status === "failed" ? { ...item, id: crypto.randomUUID(), status: "waiting", error: undefined } : item) }));
}
export function cancelChatgptQueuedRequest(queues: ChatgptRequestQueues, scope: string, id: string) {
  return change(queues, scope, queue => ({ ...queue, items: queue.items.filter(item => item.id !== id || item.status === "running") }));
}
export function configureChatgptQueuedRequest(queues: ChatgptRequestQueues, scope: string, id: string, model: string, reasoningEffort?: string, options?: ChatgptAssetOptions) {
  return change(queues, scope, queue => ({ ...queue, items: queue.items.map(item => item.id === id && item.status !== "running" ? { ...item, model, reasoningEffort, options: options ? { ...options } : item.options } : item) }));
}
/** Only the first request's newly created chat can inherit a Scene draft queue. */
export function adoptChatgptDraftQueue(queues: ChatgptRequestQueues, from: string, to: string) {
  if (from === to || !queues[from] || chatgptQueueFor(queues, to).items.length) return queues;
  const { [from]: queue, ...rest } = queues;
  return { ...rest, [to]: queue };
}
