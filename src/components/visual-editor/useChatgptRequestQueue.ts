import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ChatgptGeneration } from "../../lib/visual-editor/chatgpt-generation";
import type { ChatgptAssetOptions } from "../../lib/tauri";
import { cancelChatgptQueuedRequest, chatgptQueueFor, configureChatgptQueuedRequest, enqueueChatgptRequest, isChatgptInitialScopeAdoption,
  pauseChatgptRequestQueue, resumeChatgptRequestQueue, type ChatgptQueuedRequest, type ChatgptRequestScope } from "../../lib/visual-editor/chatgpt-request-queue";
import { adoptChatgptQueueLease, claimChatgptQueuedRequest, finishChatgptQueuedRequest, readChatgptQueueStore,
  subscribeChatgptQueueStore, updateChatgptQueues, type ChatgptQueueLease } from "../../lib/visual-editor/chatgpt-request-queue-store";

type QueueInput = {
  scope: string;
  sceneScope: string;
  generation?: ChatgptGeneration | null;
  blockedReason?: string;
  selectedModel: string;
  modelProblem: (request: ChatgptQueuedRequest, resolvedModel: string) => string | undefined;
  onDispatch: (request: ChatgptQueuedRequest, resolvedModel: string, expectedScope: ChatgptRequestScope) => Promise<void>;
};
function isInitialChatAdoption(lease: ChatgptQueueLease | null, input: QueueInput) {
  return isChatgptInitialScopeAdoption(lease, input.scope, input.sceneScope, input.generation);
}
/** Queues live for this Studio session, including Editor unmounts on Scene switches. */
export function useChatgptRequestQueue(input: QueueInput) {
  const snapshot = useSyncExternalStore(subscribeChatgptQueueStore, readChatgptQueueStore, readChatgptQueueStore);
  const latest = useRef(input);
  latest.current = input;
  const outcome = `${input.generation?.generationId ?? ""}:${input.generation?.status ?? ""}`;
  const previousOutcome = useRef(outcome);
  const queue = chatgptQueueFor(snapshot.queues, input.scope);
  const first = queue.items[0];
  const resolvedModel = first?.model || input.selectedModel;
  const modelProblem = first ? input.modelProblem(first, resolvedModel) : undefined;
  const blockedReason = queue.pauseReason ?? input.blockedReason ?? modelProblem
    ?? (snapshot.active && snapshot.active.scope !== input.scope ? "別のSceneの依頼が終了するまで送信を待っています。" : undefined);

  useEffect(() => {
    const draftLease = snapshot.drafts[input.sceneScope] ?? snapshot.active;
    if (isInitialChatAdoption(draftLease, input)) adoptChatgptQueueLease(draftLease!.id, input.scope);
  }, [input.scope, input.sceneScope, input.generation?.sessionId, input.generation?.generationId]);
  useEffect(() => () => {
    const current = readChatgptQueueStore();
    if (chatgptQueueFor(current.queues, input.scope).items.length && !isInitialChatAdoption(current.drafts[input.sceneScope] ?? current.active, latest.current)) {
      updateChatgptQueues(queues => pauseChatgptRequestQueue(queues, input.scope, "別のSceneやチャットへ移ったため、送信待ちの依頼を保留しています。"));
    }
  }, [input.scope, input.sceneScope]);
  useEffect(() => {
    if (previousOutcome.current === outcome) return;
    previousOutcome.current = outcome;
    if (input.generation?.status === "cancelled" || input.generation?.status === "failed") {
      updateChatgptQueues(queues => pauseChatgptRequestQueue(queues, input.scope, input.generation?.status === "cancelled"
        ? "制作を停止したため、送信待ちの依頼を保留しています。" : "依頼を完了できなかったため、送信待ちの依頼を保留しています。"));
    }
  }, [outcome, input.scope]);
  useEffect(() => {
    if (!first || first.status !== "waiting" || blockedReason || snapshot.active) return;
    const lease = { id: first.id, scope: input.scope, sceneScope: input.sceneScope };
    if (!claimChatgptQueuedRequest(lease)) return;
    void (async () => {
      try {
        // App resolves the current Scene when this request reaches the front.
        await latest.current.onDispatch(first, resolvedModel, { sceneScope: lease.sceneScope, scope: lease.scope, requestId: lease.id,
          attachedEntityIds: first.attachedEntityIds, attachedMaterialIds: first.attachedMaterialIds });
        finishChatgptQueuedRequest(first.id);
      } catch (error) { finishChatgptQueuedRequest(first.id, error instanceof Error ? error.message : String(error)); }
    })();
  }, [first, blockedReason, resolvedModel, snapshot.active, input.scope, input.sceneScope]);
  return {
    items: queue.items,
    pauseReason: queue.pauseReason,
    blockedReason,
    dispatching: snapshot.active !== null,
    isDispatching: () => readChatgptQueueStore().active !== null,
    isInitialScopeAdoption: () => {
      const current = readChatgptQueueStore();
      return Boolean(isInitialChatAdoption(current.drafts[latest.current.sceneScope] ?? current.active, latest.current));
    },
    enqueue: (request: Omit<ChatgptQueuedRequest, "status" | "error">) => updateChatgptQueues(queues => enqueueChatgptRequest(queues, latest.current.scope, request)),
    cancel: (id: string) => updateChatgptQueues(queues => cancelChatgptQueuedRequest(queues, latest.current.scope, id)),
    pause: (reason = "送信待ちの依頼を保留しています。") => updateChatgptQueues(queues => pauseChatgptRequestQueue(queues, latest.current.scope, reason)),
    resume: () => updateChatgptQueues(queues => resumeChatgptRequestQueue(queues, latest.current.scope)),
    configure: (id: string, model: string, reasoningEffort?: string, options?: ChatgptAssetOptions) => updateChatgptQueues(queues => configureChatgptQueuedRequest(queues, latest.current.scope, id, model, reasoningEffort, options)),
  };
}
