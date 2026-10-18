import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-production-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const production = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-production.ts");
const { parseChatgptWorldPlan } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-world.ts");
const sessions = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-sessions.ts");
const { chatgptGoalNextPass } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-goal.ts");
const direction = { scope: "world", detail: "overview", focus: "街全体の構成と歩く導線", criteria: ["広場から建物へ歩ける", "建物と道路の大きさを揃える", "照明と空の雰囲気を揃える"], maxPasses: 4 };
const plan = { title: "街の制作", description: "街全体を仕上げる", objects: [], hasMore: false, production: direction };
const job = (overrides = {}) => ({ generationId: "generation-1", status: "running", mode: "build", model: "fixture-model", prompt: "街を作って仕上げてください", options: { models: true, materials: true, audio: true }, sourceProjectId: "project-1", sourceSceneId: "scene-1", sessionId: "session-1", production: direction, productionPass: 1, productionNoProgressPasses: 0,
  plan: { title: plan.title, description: plan.description, hasMore: false, objects: [] }, progress: { phase: "saving", message: "保存しました", completed: 3, total: 3, recentEvents: [{ sequence: 1, phase: "placing", message: "広場を配置して保存しました", saved: true }] }, ...overrides });

test("production is optional for old plans and validates the explicit bounded direction", () => {
  assert.equal(production.parseChatgptProduction(undefined), undefined);
  assert.equal(production.parseChatgptProduction(null), undefined);
  const parsed = production.parseChatgptProduction(direction);
  assert.deepEqual(parsed, direction);
  parsed.criteria[0] = "別の条件";
  assert.notEqual(parsed.criteria[0], direction.criteria[0], "direction arrays are owned copies");
  for (const candidate of [{ ...direction, scope: "city" }, { ...direction, scope: ["world"] }, { ...direction, detail: "maximum" }, { ...direction, maxPasses: 0 }, { ...direction, maxPasses: 7 }, { ...direction, maxPasses: 1.5 }, { ...direction, criteria: [] }, { ...direction, criteria: Array(7).fill("条件") }, { ...direction, criteria: [" "] }, { ...direction, criteria: ["a".repeat(241)] }, { ...direction, criteria: ["line\nbreak"] }, { ...direction, focus: "" }, { ...direction, focus: "a".repeat(161) }, { ...direction, rawPrompt: "unexpected" }]) assert.throws(() => production.parseChatgptProduction(candidate));
  assert.equal(production.parseChatgptProduction({ ...direction, focus: "家".repeat(160), criteria: ["面".repeat(240)] }).focus.length, 160);
  assert.equal(parseChatgptWorldPlan(JSON.stringify({ ...plan, production: null })).production, undefined);
  const { production: _removed, ...legacy } = plan;
  assert.equal(parseChatgptWorldPlan(JSON.stringify(legacy)).production, undefined);
  assert.deepEqual(parseChatgptWorldPlan(JSON.stringify(plan)).production, direction);
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({ ...plan, production: { ...direction, extra: true } })));
});

test("world and environment requests finish only after the actual final visual review", () => {
  for (const scope of ["world", "environment"]) {
    const current = job({ production: { ...direction, scope } });
    assert.equal(production.chatgptProductionNeedsWorldReview(current.production), true);
    assert.throws(() => production.chatgptProductionNextPass(current, { changed: true }), error => error.reason === "review-required");
    assert.equal(production.chatgptProductionNextPass(current, { changed: true, review: { approved: true } }), null);
    const next = production.chatgptProductionNextPass(current, { changed: true, review: { approved: false, remainingWork: "道路の幅を揃える" } });
    assert.deepEqual(next, { pass: 2, noProgressPasses: 0, remainingWork: "道路の幅を揃える" });
  }
});

test("new whole-world production reserves correction room before starting and can finish early", () => {
  for (const scope of ["world", "environment"]) {
    const proposed = { ...direction, scope, maxPasses: 1 };
    const accepted = production.chatgptProductionDirection(undefined, proposed);
    assert.equal(accepted.maxPasses, 3);
    assert.equal(proposed.maxPasses, 1, "do not mutate the planner's response");
    assert.deepEqual(accepted.criteria, proposed.criteria);
    const current = job({ production: accepted, productionPass: 1 });
    assert.equal(production.chatgptProductionNextPass(current, { changed: true, review: { approved: true } }), null);
    assert.equal(production.chatgptProductionNextPass(current, { changed: true, review: { approved: false, remainingWork: "休憩場所をつなぐ" } }).pass, 2);
    assert.deepEqual(production.chatgptProductionDirection(proposed, { ...direction, maxPasses: 6 }), proposed, "a previously admitted legacy budget is never extended");
  }
  for (const scope of ["model", "edit"]) assert.equal(production.chatgptProductionDirection(undefined, { ...direction, scope, maxPasses: 1 }).maxPasses, 1);
});

test("hasMore continues saved production within the original pass budget and reports unfinished criteria", () => {
  const current = job({ plan: { ...job().plan, hasMore: true, remainingWork: "入口と照明を仕上げる" }, productionPass: 3 });
  assert.deepEqual(production.chatgptProductionNextPass(current, { changed: true }), { pass: 4, noProgressPasses: 0, remainingWork: "入口と照明を仕上げる" });
  assert.throws(() => production.chatgptProductionNextPass({ ...current, productionPass: 4 }, { changed: true }), error => error.reason === "budget" && error.message.includes("入口と照明") && error.message.includes("保存済み"));
  assert.throws(() => production.chatgptProductionNextPass(job({ productionPass: 4 }), { changed: false, review: { approved: false, remainingWork: "屋根と入口の大きさ" } }), error => error.reason === "budget" && error.remainingWork === "屋根と入口の大きさ");
  assert.equal(production.chatgptProductionNextPass(job({ productionPass: 4 }), { changed: true, review: { approved: true } }), null, "approval may complete on the final allowed pass");
});

test("no-progress detection persists across passes and resets only after a real change", () => {
  const current = job({ plan: { ...job().plan, hasMore: true }, productionNoProgressPasses: 1 });
  assert.equal(production.chatgptProductionNextPass(current, { changed: false }).noProgressPasses, 2);
  assert.equal(production.chatgptProductionNextPass(current, { changed: true }).noProgressPasses, 0);
  assert.throws(() => production.chatgptProductionNextPass({ ...current, productionNoProgressPasses: 2 }, { changed: false }), error => error.reason === "no-progress");
});

test("a model or edit never becomes whole-world production by prompt keywords", () => {
  for (const scope of ["model", "edit"]) {
    const current = job({ production: { ...direction, scope }, plan: { ...job().plan, hasMore: true }, prompt: "世界 都市 街 ワールド world city environment" });
    assert.equal(production.chatgptProductionNeedsWorldReview(current.production), false);
    assert.equal(production.chatgptProductionNextPass(current, { changed: true }).pass, 2, "remaining model/edit work shares its original finite budget without escalating scope");
    assert.equal(current.production.scope, scope);
    assert.throws(() => production.chatgptProductionNextPass({ ...current, production: { ...current.production, maxPasses: 1 } }, { changed: true }), error => error.reason === "budget");
  }
  assert.equal(production.chatgptProductionNextPass(job({ production: undefined }), { changed: true }), null);
  assert.deepEqual(chatgptGoalNextPass(job({ production: undefined, mode: "goal", goal: { iteration: 1, noProgressPasses: 0 } }), true), { iteration: 2, noProgressPasses: 0 }, "old /goal behavior stays separate");
  const boundedGoal = job({ mode: "goal", production: { ...direction, scope: "model", maxPasses: 1 } });
  assert.equal(production.chatgptProductionNextPass(boundedGoal, { changed: true }), null, "a production goal with no remaining work needs no empty extra planning pass");
  assert.throws(() => production.chatgptProductionNextPass({ ...boundedGoal, plan: { ...boundedGoal.plan, hasMore: true } }, { changed: true }), error => error.reason === "budget");
});

test("questions and plan approval wait without consuming automatic passes", () => {
  for (const pending of [job({ status: "planned" }), job({ mode: "plan" }), job({ plan: { ...job().plan, questions: [{ question: "時間帯", choices: ["朝", "昼", "夜"] }] } })]) {
    assert.equal(production.chatgptProductionNextPass(pending, { changed: false }), null);
  }
});

test("continuation keeps the first direction, all criteria and saved progress in bounded context", () => {
  const first = { ...direction, focus: "家".repeat(160), criteria: Array.from({ length: 6 }, (_, index) => `${index + 1}${"面".repeat(239)}`) };
  const retained = production.chatgptProductionDirection(first, { ...direction, scope: "model", maxPasses: 6 });
  assert.deepEqual(retained, first);
  const current = job({ production: retained });
  const next = { pass: 2, noProgressPasses: 0, remainingWork: "建物の入口を仕上げる" };
  const prior = Array.from({ length: 6 }, () => ({ prompt: "前の依頼".repeat(500), result: "前の結果".repeat(500) }));
  const conversation = production.chatgptProductionConversation(prior, current, next);
  const summary = conversation.at(-1).result;
  assert.ok([...summary].length <= 2000);
  assert.ok(new TextEncoder().encode(JSON.stringify(conversation)).byteLength <= 23 * 1024);
  for (const criterion of first.criteria) assert.ok(summary.includes(criterion));
  assert.ok(summary.includes("保存済み: 3件"));
  assert.ok(summary.includes("2/4回目"));
  const repeated = production.chatgptProductionConversation(conversation, current, { ...next, pass: 3 });
  assert.equal(repeated.filter(turn => turn.result.startsWith("制作方針を固定した継続記録")).length, 1);
});

test("session save/reload preserves production and counters while leaving interrupted work stopped", () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const session = sessions.createChatgptSession("project-1", "scene-1", "制作の記録", "2026-10-17T00:00:00Z", "session-1");
  const current = job({ productionPass: 3, productionNoProgressPasses: 2 });
  const saved = sessions.saveChatgptSessions([{ ...session, turns: [current] }], storage);
  assert.deepEqual(saved[0].turns[0].production, direction);
  const reloaded = sessions.loadChatgptSessions(storage)[0].turns[0];
  assert.deepEqual(reloaded.production, direction);
  assert.equal(reloaded.productionPass, 3);
  assert.equal(reloaded.productionNoProgressPasses, 2);
  assert.equal(reloaded.status, "cancelled");
  assert.match(sessions.chatgptSessionTranscript(saved[0]), /制作 3 \/ 4回/);
});
