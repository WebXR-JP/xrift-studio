import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import { XriftApiError, XriftNetworkError } from "@xrift/sdk";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-runtime-shell-fetch-tests",
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { loadRuntimeShell, describeSdkError, REQUIRED_RUNTIME_SHELL_CONTRACT } = await server.ssrLoadModule("/src/lib/visual-editor/web-upload.ts");
const paths = ["remoteEntry.js", ...Array.from({ length: 7 }, (_, i) => `chunk-${i}.js`)];
const body = path => `export const source = ${JSON.stringify(path)};`;
const digest = createHash("sha256");
for (const path of [...paths].sort()) digest.update(path).update(body(path));
const manifest = { version: digest.digest("hex").slice(0, 12), runtimeContract: REQUIRED_RUNTIME_SHELL_CONTRACT,
  entry: "remoteEntry.js", files: paths, modules: ["./World", "./Item"],
  dependencies: Object.fromEntries(paths.map(path => [path, []])) };
const manifestResponse = () => new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("SDK errors redact the actual compatible bearer token regardless of its prefix", () => {
  const token = "compatible/opaque.token+fixture";
  for (const error of [new XriftApiError(`denied token ${token}`, 403), new XriftNetworkError(`failed ${token}`), new Error(`unexpected ${token}`)]) {
    const message = describeSdkError(error, "item", token);
    assert.ok(!message.includes(token));
    assert.ok(message.includes("[REDACTED]"));
  }
  assert.ok(describeSdkError(new XriftApiError(`denied token ${token}`, 403), "item", token).includes("write:items"));
});

test("shell fetch limits concurrent requests, reports completed files and keeps manifest order", async () => {
  const originalFetch = globalThis.fetch;
  const gates = paths.map(deferred);
  const started = [];
  const progress = [];
  let active = 0; let maximum = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("shell-manifest.json")) return manifestResponse();
    const path = new URL(url).pathname.split("/").at(-1);
    const index = paths.indexOf(path);
    assert.equal(new URL(url).searchParams.get("v"), manifest.version);
    assert.equal(init.cache, "no-store");
    started.push(path); active++; maximum = Math.max(maximum, active);
    await gates[index].promise; active--;
    return new Response(body(path), { headers: { "content-type": "application/javascript" } });
  };
  try {
    const pending = loadRuntimeShell("https://fixture.invalid/shell", undefined, "item", (completed, total) => progress.push([completed, total]));
    await tick();
    assert.deepEqual(started, paths.slice(0, 4));
    gates[3].resolve(); await tick();
    assert.equal(started.length, 5);
    for (const gate of [...gates].reverse()) gate.resolve();
    const files = await pending;
    assert.equal(maximum, 4);
    assert.deepEqual(files.map(file => file.path), paths);
    assert.deepEqual(progress, paths.map((_, i) => [i + 1, paths.length]));
  } finally { globalThis.fetch = originalFetch; }
});

for (const mode of ["failure", "abort"]) {
  test(`shell ${mode} aborts in-flight siblings and prevents late progress or queued requests`, async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const gates = paths.map(deferred);
    const signals = [];
    const started = [];
    const progress = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("shell-manifest.json")) return manifestResponse();
      const path = new URL(url).pathname.split("/").at(-1);
      signals.push(init.signal); started.push(path);
      // Even a transport that resolves after abort must not report progress.
      await gates[paths.indexOf(path)].promise;
      return new Response(body(path), { status: mode === "failure" && path === paths[0] ? 404 : 200 });
    };
    try {
      const pending = loadRuntimeShell("https://fixture.invalid/shell", controller.signal, "item", completed => progress.push(completed));
      await tick();
      assert.deepEqual(started, paths.slice(0, 4));
      const rejected = mode === "failure" ? assert.rejects(pending, /remoteEntry.js \(404\)/) : assert.rejects(pending, { name: "AbortError" });
      if (mode === "abort") controller.abort();
      gates[0].resolve(); await rejected;
      assert.ok(signals.every(signal => signal.aborted));
      for (const gate of gates) gate.resolve();
      await tick();
      assert.deepEqual(started, paths.slice(0, 4));
      assert.deepEqual(progress, []);
    } finally { globalThis.fetch = originalFetch; }
  });
}
