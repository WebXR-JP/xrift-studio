import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-blender-status-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { createChatgptBlenderStatus, CHATGPT_BLENDER_PLANNING_WAIT_MS } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-blender-status.ts");
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test("Panel and planning share one pending native probe, then reuse owned cached results", async () => {
  const gate = deferred(); let calls = 0;
  const status = createChatgptBlenderStatus(() => { calls++; return gate.promise; });
  const panel = status.get(), planning = status.forPlanning(), another = status.get();
  await flush(); assert.equal(calls, 1);
  gate.resolve({ available: true, version: "Blender fixture" });
  const results = await Promise.all([panel, planning, another]);
  assert.deepEqual(results, Array.from({ length: 3 }, () => ({ available: true, version: "Blender fixture" })));
  results[0].available = false;
  assert.equal((await status.get()).available, true, "A caller cannot mutate the shared result");
  assert.equal((await status.forPlanning()).available, true);
  assert.equal(calls, 1);
});

test("an unknown hanging probe releases planning at one second; late completion updates only the cache", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = deferred(); let calls = 0, deliveries = 0;
  const status = createChatgptBlenderStatus(() => { calls++; return gate.promise; });
  const pending = status.forPlanning().then(result => { deliveries++; return result; });
  await flush();
  context.mock.timers.tick(CHATGPT_BLENDER_PLANNING_WAIT_MS - 1);
  await flush(); assert.equal(deliveries, 0);
  context.mock.timers.tick(1);
  assert.deepEqual(await pending, { available: false });
  assert.equal(deliveries, 1);
  gate.resolve({ available: true, version: "late" }); await flush();
  assert.equal(deliveries, 1, "A timed-out or cancelled job cannot receive a second continuation");
  assert.deepEqual(await status.forPlanning(), { available: true, version: "late" });
  assert.equal(calls, 1);
});

test("a late rejection is handled, and an unknown failed probe lets planning proceed", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = deferred(); let calls = 0;
  const status = createChatgptBlenderStatus(() => { calls++; return calls === 1 ? gate.promise : Promise.reject(new Error("not available")); });
  const pending = status.forPlanning(); await flush();
  context.mock.timers.tick(CHATGPT_BLENDER_PLANNING_WAIT_MS);
  assert.deepEqual(await pending, { available: false });
  gate.reject(new Error("late native failure")); await flush();
  assert.deepEqual(await status.forPlanning(), { available: false });
  assert.equal(calls, 2);
});

test("manual refresh bypasses the cache, shares concurrent refreshes and preserves the last good result after failure", async () => {
  const refresh = deferred(); let calls = 0;
  const status = createChatgptBlenderStatus(() => { calls++; return calls === 1 ? Promise.resolve({ available: true, version: "known" }) : refresh.promise; });
  assert.equal((await status.get()).available, true);
  const first = status.get({ refresh: true }), second = status.get({ refresh: true });
  await flush(); assert.equal(calls, 2);
  assert.deepEqual(await status.forPlanning(), { available: true, version: "known" }, "Known status must not wait on refresh");
  refresh.reject(new Error("refresh failed"));
  const failures = await Promise.allSettled([first, second]);
  assert(failures.every(result => result.status === "rejected"));
  assert.deepEqual(await status.get(), { available: true, version: "known" });
  assert.equal(calls, 2);
});

test("an explicit refresh can detect Blender installed after an unavailable result", async () => {
  let available = false, calls = 0;
  const status = createChatgptBlenderStatus(async () => { calls++; return { available }; });
  assert.deepEqual(await status.get(), { available: false });
  available = true;
  assert.deepEqual(await status.forPlanning(), { available: false });
  assert.deepEqual(await status.get({ refresh: true }), { available: true });
  assert.deepEqual(await status.forPlanning(), { available: true });
  assert.equal(calls, 2);
});
