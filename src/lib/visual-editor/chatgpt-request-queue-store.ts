import { adoptChatgptDraftQueue, beginChatgptQueuedRequest, chatgptQueueFor, completeChatgptQueuedRequest,
  failChatgptQueuedRequest, type ChatgptRequestQueues } from "./chatgpt-request-queue";

export type ChatgptQueueLease = { id: string; scope: string; sceneScope: string };
type QueueStore = { queues: ChatgptRequestQueues; active: ChatgptQueueLease | null; drafts: Record<string, ChatgptQueueLease> };
let snapshot: QueueStore = { queues: {}, active: null, drafts: {} };
const listeners = new Set<() => void>();
export const readChatgptQueueStore = () => snapshot;
export function subscribeChatgptQueueStore(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: QueueStore) { snapshot = next; for (const listener of listeners) listener(); }
export function updateChatgptQueues(update: (queues: ChatgptRequestQueues) => ChatgptRequestQueues) { publish({ ...snapshot, queues: update(snapshot.queues) }); }
export function claimChatgptQueuedRequest(lease: ChatgptQueueLease): boolean {
  const queue = chatgptQueueFor(snapshot.queues, lease.scope);
  if (snapshot.active || queue.pauseReason || queue.items[0]?.id !== lease.id || queue.items[0].status !== "waiting") return false;
  publish({ ...snapshot, active: lease, queues: beginChatgptQueuedRequest(snapshot.queues, lease.scope, lease.id),
    drafts: lease.scope === lease.sceneScope ? { ...snapshot.drafts, [lease.sceneScope]: lease } : snapshot.drafts });
  return true;
}
export function finishChatgptQueuedRequest(id: string, error?: string) {
  if (snapshot.active?.id !== id) return;
  const { scope } = snapshot.active;
  publish({ ...snapshot, active: null, queues: error === undefined ? completeChatgptQueuedRequest(snapshot.queues, scope, id)
    : failChatgptQueuedRequest(snapshot.queues, scope, id, error) });
}
export function adoptChatgptQueueLease(id: string, to: string) {
  const lease = snapshot.active?.id === id ? snapshot.active : Object.values(snapshot.drafts).find(draft => draft.id === id);
  if (!lease || lease.scope === to) return;
  let queues = adoptChatgptDraftQueue(snapshot.queues, lease.scope, to);
  if (queues === snapshot.queues && queues[lease.scope]) {
    // New input can reach the just-created chat before its adoption effect.
    const source = queues[lease.scope], target = chatgptQueueFor(queues, to);
    const { [lease.scope]: _source, ...rest } = queues;
    queues = { ...rest, [to]: { pauseReason: source.pauseReason ?? target.pauseReason, items: [...source.items, ...target.items] } };
  }
  const { [lease.sceneScope]: _draft, ...drafts } = snapshot.drafts;
  publish({ ...snapshot, drafts, queues, active: snapshot.active?.id === id ? { ...snapshot.active, scope: to } : snapshot.active });
}
