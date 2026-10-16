import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-model-stream-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { streamChatgptModels } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-model-stream.ts");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const briefs = [{ name: "ベンチ", brief: "幅1.8mの木製ベンチ" }, { name: "植木鉢", brief: "曲線断面の植木鉢" }];
const spec = index => ({ index, model: { name: briefs[index].name, parts: [{ name: "本体", shape: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: [0.5, 0.3, 0.2, 1], metallic: 0, roughness: 0.6 }] } });
function worker() {
  let ready, resolve, reject, cancelled = 0;
  tauri.chatgptModelSpecs = (model, input, generationId, effort, callback) => {
    assert.equal(generationId, "fixture-generation");
    assert.equal(effort, "low");
    assert.deepEqual(input, briefs);
    ready = callback;
    return new Promise((yes, no) => { resolve = yes; reject = no; });
  };
  tauri.chatgptCancelGeneration = async () => { cancelled++; reject(new Error("cancelled")); };
  return { ready: value => ready(value), resolve: value => resolve(value), reject: value => reject(value), get cancelled() { return cancelled; } };
}
const start = () => streamChatgptModels("fixture-model", briefs, "fixture-generation", "low");

test("a finished model is yielded before the slower worker completes", async () => {
  const native = worker(), stream = start();
  const first = stream.next();
  native.ready(spec(1));
  assert.equal((await first).value.index, 1);
  native.ready(spec(0));
  native.resolve([spec(1), spec(0)]);
  assert.equal((await stream.next()).value.index, 0);
  assert.equal((await stream.next()).done, true);
  assert.equal(native.cancelled, 0);
});
test("a later failure preserves the delivered model and reports unfinished work", async () => {
  const native = worker(), stream = start();
  const first = stream.next();
  native.ready(spec(0));
  native.reject(new Error("worker failed"));
  assert.equal((await first).value.index, 0);
  await assert.rejects(stream.next(), /worker failed/);
});
test("closing the stream cancels and drains outstanding native work", async () => {
  const native = worker(), stream = start();
  const first = stream.next();
  native.ready(spec(0));
  await first;
  await stream.return();
  assert.equal(native.cancelled, 1);
});
test("the final command result recovers a delayed channel result exactly once", async () => {
  const native = worker(), stream = start();
  const first = stream.next();
  native.ready(spec(1));
  native.resolve([spec(0), spec(1)]);
  assert.equal((await first).value.index, 1);
  assert.equal((await stream.next()).value.index, 0);
  assert.equal((await stream.next()).done, true);
});
test("wrong names and invalid geometry are rejected before importing a Model", async () => {
  const native = worker(), stream = start();
  const first = stream.next();
  native.ready({ ...spec(0), model: { ...spec(0).model, name: "別の作品" } });
  await assert.rejects(first, /名前/);
  assert.equal(native.cancelled, 1);
});
