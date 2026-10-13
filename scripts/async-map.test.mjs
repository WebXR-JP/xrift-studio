import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-async-map-tests",
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { mapWithConcurrency } = await server.ssrLoadModule("/src/lib/async-map.ts");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("bounded tasks keep input order even when requests finish in reverse order", async () => {
  const gates = Array.from({ length: 12 }, deferred);
  const started = [];
  let active = 0;
  let maximum = 0;
  const pending = mapWithConcurrency(gates, 4, async (gate, index) => {
    started.push(index); active++; maximum = Math.max(maximum, active);
    await gate.promise; active--; return index;
  });
  assert.deepEqual(started, [0, 1, 2, 3]);
  for (const gate of [...gates].reverse()) gate.resolve();
  assert.deepEqual(await pending, Array.from({ length: 12 }, (_, index) => index));
  assert.equal(maximum, 4);
});

test("abort stops queued requests and fails with AbortError", async () => {
  const controller = new AbortController();
  const gate = deferred();
  const started = [];
  const pending = mapWithConcurrency([0, 1, 2, 3, 4, 5], 4, async value => {
    started.push(value); await gate.promise; return value;
  }, controller.signal);
  controller.abort(); gate.resolve();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(started, [0, 1, 2, 3]);
  await assert.rejects(mapWithConcurrency([1], 4, async () => { throw new Error("must not start"); }, controller.signal), { name: "AbortError" });
  await assert.rejects(mapWithConcurrency([], 4, async value => value, controller.signal), { name: "AbortError" });
});

test("a failed request prevents queued work from starting", async () => {
  const gate = deferred();
  const started = [];
  const pending = mapWithConcurrency([0, 1, 2, 3, 4, 5], 4, async value => {
    started.push(value); await gate.promise;
    if (value === 0) throw new Error("file missing");
    return value;
  });
  gate.resolve();
  await assert.rejects(pending, /file missing/);
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.deepEqual(await mapWithConcurrency([], 4, async value => value), []);
});
