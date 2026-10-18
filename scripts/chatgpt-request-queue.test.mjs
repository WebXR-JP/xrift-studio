import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-queue-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const queue = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-request-queue.ts");
const store = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-request-queue-store.ts");
const request = (id, extra = {}) => ({ id, model: "model-a", prompt: `依頼${id}`, options: { models: true, materials: true, audio: true }, mode: "build", ...extra });

test("FIFO captures each request's settings and completes only the dispatched request", () => {
  const first = request("first", { mode: "plan", reasoningEffort: "high", options: { models: true, materials: true, audio: true, modelSource: "blender" } });
  let state = queue.enqueueChatgptRequest({}, "scene-a", first);
  first.options.models = false;
  state = queue.enqueueChatgptRequest(state, "scene-a", request("second", { model: "model-b" }));
  assert.equal(state["scene-a"].items[0].options.models, true);
  assert.equal(state["scene-a"].items[0].options.modelSource, "blender");
  assert.equal(queue.beginChatgptQueuedRequest(state, "scene-a", "second")["scene-a"].items[1].status, "waiting");
  state = queue.beginChatgptQueuedRequest(state, "scene-a", "first");
  assert.equal(state["scene-a"].items[0].status, "running");
  assert.equal(state["scene-a"].items[0].mode, "plan");
  assert.equal(state["scene-a"].items[0].reasoningEffort, "high");
  state = queue.completeChatgptQueuedRequest(state, "scene-a", "first");
  assert.deepEqual(state["scene-a"].items.map(item => item.id), ["second"]);
  assert.equal(state["scene-a"].items[0].model, "model-b");
});
test("failure preserves the failed prompt and holds later requests until an explicit retry", () => {
  let state = queue.enqueueChatgptRequest({}, "chat-a", request("first"));
  state = queue.enqueueChatgptRequest(state, "chat-a", request("second"));
  state = queue.failChatgptQueuedRequest(state, "chat-a", "first", "fixture failure");
  assert.equal(state["chat-a"].items[0].prompt, "依頼first");
  assert.equal(state["chat-a"].items[0].error, "fixture failure");
  assert.equal(state["chat-a"].items[1].status, "waiting");
  assert.equal(queue.beginChatgptQueuedRequest(state, "chat-a", "first")["chat-a"].items[0].status, "failed");
  state = queue.resumeChatgptRequestQueue(state, "chat-a");
  assert.equal(state["chat-a"].pauseReason, undefined);
  assert.equal(state["chat-a"].items[0].status, "waiting");
  assert.notEqual(state["chat-a"].items[0].id, "first", "explicit retry creates a new execution while the failed run remains terminal");
  assert.equal(state["chat-a"].items[0].prompt, "依頼first");
  assert.equal(state["chat-a"].items[1].id, "second", "waiting requests retain their original identity");
  assert.equal(state["chat-a"].items[0].error, undefined);
});
test("queues stay in their own Scene/chat and draft adoption never replaces an existing chat queue", () => {
  let state = queue.enqueueChatgptRequest({}, "scene-a", request("a"));
  state = queue.enqueueChatgptRequest(state, "scene-b", request("b"));
  const adopted = queue.adoptChatgptDraftQueue(state, "scene-a", "new-chat-a");
  assert.equal(adopted["scene-a"], undefined);
  assert.deepEqual(adopted["new-chat-a"].items.map(item => item.id), ["a"]);
  assert.deepEqual(adopted["scene-b"].items.map(item => item.id), ["b"]);
  assert.equal(queue.adoptChatgptDraftQueue(state, "scene-a", "scene-b"), state);
});
test("waiting cancellation cannot cancel native work or resume a queue paused by Stop", () => {
  let state = queue.enqueueChatgptRequest({}, "chat-a", request("first"));
  state = queue.enqueueChatgptRequest(state, "chat-a", request("second"));
  state = queue.beginChatgptQueuedRequest(state, "chat-a", "first");
  state = queue.pauseChatgptRequestQueue(state, "chat-a", "Stop");
  state = queue.cancelChatgptQueuedRequest(state, "chat-a", "first");
  assert.equal(state["chat-a"].items.length, 2);
  state = queue.cancelChatgptQueuedRequest(state, "chat-a", "second");
  assert.equal(state["chat-a"].items.length, 1);
  assert.equal(state["chat-a"].pauseReason, "Stop");
});
test("an unavailable captured model changes only after an explicit settings update", () => {
  let state = queue.enqueueChatgptRequest({}, "chat-a", request("first", { reasoningEffort: "high" }));
  state = queue.configureChatgptQueuedRequest(state, "chat-a", "first", "model-b", "low");
  assert.equal(state["chat-a"].items[0].model, "model-b");
  assert.equal(state["chat-a"].items[0].reasoningEffort, "low");
  state = queue.beginChatgptQueuedRequest(state, "chat-a", "first");
  assert.equal(queue.configureChatgptQueuedRequest(state, "chat-a", "first", "model-c")["chat-a"].items[0].model, "model-b");
});
test("the app-session store leases only one native request across Scene mounts", () => {
  store.updateChatgptQueues(() => queue.enqueueChatgptRequest(queue.enqueueChatgptRequest({}, "scene-a", request("a")), "scene-b", request("b")));
  assert.equal(store.claimChatgptQueuedRequest({ id: "a", scope: "scene-a", sceneScope: "scene-a" }), true);
  assert.equal(store.claimChatgptQueuedRequest({ id: "b", scope: "scene-b", sceneScope: "scene-b" }), false);
  store.finishChatgptQueuedRequest("a");
  assert.equal(store.claimChatgptQueuedRequest({ id: "b", scope: "scene-b", sceneScope: "scene-b" }), true);
  store.finishChatgptQueuedRequest("b", "isolated failure");
  assert.equal(store.readChatgptQueueStore().active, null);
  assert.equal(store.readChatgptQueueStore().queues["scene-b"].items[0].status, "failed");
});
test("a new chat inherits its active draft lease and completion updates the new scope", () => {
  store.updateChatgptQueues(() => queue.enqueueChatgptRequest(queue.enqueueChatgptRequest({}, "scene-a", request("first")), "scene-a", request("second")));
  assert.equal(store.claimChatgptQueuedRequest({ id: "first", scope: "scene-a", sceneScope: "scene-a" }), true);
  store.adoptChatgptQueueLease("first", "new-chat");
  store.finishChatgptQueuedRequest("first");
  assert.equal(store.readChatgptQueueStore().queues["scene-a"], undefined);
  assert.deepEqual(store.readChatgptQueueStore().queues["new-chat"].items.map(item => item.id), ["second"]);
});

test("only the dispatched request can adopt a Scene draft, including after immediate failure", () => {
  const lease = { id: "queued-request", scope: "project-a:scene-a", sceneScope: "project-a:scene-a" };
  const generation = { generationId: lease.id, sessionId: "created-chat", sourceProjectId: "project-a", sourceSceneId: "scene-a" };
  assert.equal(queue.isChatgptInitialScopeAdoption(lease, "created-chat", lease.sceneScope, generation), true);
  assert.equal(queue.isChatgptInitialScopeAdoption(lease, "created-chat", lease.sceneScope, { ...generation, generationId: "unrelated-request-with-the-same-prompt" }), false);
  assert.equal(queue.isChatgptInitialScopeAdoption(lease, "another-chat", lease.sceneScope, generation), false);
  assert.equal(queue.isChatgptInitialScopeAdoption(lease, "created-chat", "project-b:scene-a", generation), false);
  assert.equal(queue.isChatgptInitialScopeAdoption({ ...lease, scope: "existing-chat" }, "created-chat", lease.sceneScope, generation), false);
  store.updateChatgptQueues(() => queue.enqueueChatgptRequest({}, lease.scope, request(lease.id)));
  assert.equal(store.claimChatgptQueuedRequest(lease), true);
  store.finishChatgptQueuedRequest(lease.id, "immediate API failure");
  assert.equal(queue.isChatgptInitialScopeAdoption(store.readChatgptQueueStore().drafts[lease.sceneScope], "created-chat", lease.sceneScope, generation), true);
  store.adoptChatgptQueueLease(lease.id, "created-chat");
  assert.equal(store.readChatgptQueueStore().queues["created-chat"].items[0].status, "failed");
});
