import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-goal-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const goal = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-goal.ts");
const sessions = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-sessions.ts");
const job = (extra = {}) => ({ generationId: "goal-1", sourceProjectId: "p1", sourceSceneId: "s1", status: "running", mode: "goal", model: "fixture-model", prompt: "公園全体を仕上げる", options: {}, goal: { iteration: 1, noProgressPasses: 0 }, progress: { phase: "saving", completed: 1, total: 1, recentEvents: [{ sequence: 1, phase: "saving", saved: true, message: "ベンチを保存しました" }] }, ...extra });

test("only the complete /goal command selects Goal and preserves the author's full objective", () => {
  for (const command of ["/goal 公園を作る", "/GOAL\n公園を作る"]) assert.deepEqual(goal.parseChatgptComposerRequest(command), { prompt: "公園を作る", mode: "goal" });
  assert.deepEqual(goal.parseChatgptComposerRequest("/goal"), { prompt: "", mode: "goal" });
  for (const text of ["公園を作る", "/goalkeeper", "例: /goal 公園"]) assert.deepEqual(goal.parseChatgptComposerRequest(text), { prompt: text, mode: "build" });
  const objective = "あ".repeat(1994);
  assert.equal(goal.parseChatgptComposerRequest(`/goal ${objective}`).prompt, objective);
});

test("changed passes get another review; ordinary requests and satisfied goals finish", () => {
  assert.equal(goal.chatgptGoalNextPass(job({ mode: "build", plan: { hasMore: true } }), true), null);
  assert.equal(goal.chatgptGoalNextPass(job({ plan: { hasMore: false } }), false), null);
  assert.deepEqual(goal.chatgptGoalNextPass(job({ plan: { hasMore: false } }), true), { iteration: 2, noProgressPasses: 0 });
  assert.deepEqual(goal.chatgptGoalNextPass(job({ goal: { iteration: 80, noProgressPasses: 2 } }), true), { iteration: 81, noProgressPasses: 0 });
});

test("three unchanged passes with unfinished work stop rather than looping forever", () => {
  let value = job({ plan: { hasMore: true } });
  for (let index = 0; index < 2; index++) value = { ...value, goal: goal.chatgptGoalNextPass(value, false) };
  assert.throws(() => goal.chatgptGoalNextPass(value, false), /3回続けて/);
});

test("continuations retain decisions and saved evidence in a bounded conversation", () => {
  const decision = { prompt: "確認事項への回答", result: "木製のベンチ" };
  let history = [decision];
  const value = job({ plan: { hasMore: true, remainingWork: "照明を整える" } });
  for (let pass = 0; pass < 100; pass++) history = goal.chatgptGoalConversation(history, value);
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], decision);
  assert.equal(history[1].prompt, value.prompt);
  assert.match(history[1].result, /ベンチを保存しました/);
  assert.match(history[1].result, /照明を整える/);
  assert.ok(new TextEncoder().encode(JSON.stringify(history)).byteLength <= 23 * 1024);
});

test("Goal history survives restart as stopped work and never resumes automatically", () => {
  let data;
  const storage = { getItem: () => data ?? null, setItem: (_, value) => { data = value; } };
  const session = sessions.createChatgptSession("p1", "s1");
  sessions.saveChatgptSessions(sessions.upsertChatgptSessionTurn([session], session.id, job({ goal: { iteration: 8, noProgressPasses: 1 } })), storage);
  const restored = sessions.loadChatgptSessions(storage)[0].turns[0];
  assert.equal(restored.status, "cancelled");
  assert.equal(restored.mode, "goal");
  assert.deepEqual(restored.goal, { iteration: 8, noProgressPasses: 1 });
  assert.match(sessions.chatgptSessionTranscript(sessions.loadChatgptSessions(storage)[0]), /Goal（8回）/);
});
