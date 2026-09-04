import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { InteractivityEngine } = await server.ssrLoadModule(
    "/packages/xrift-studio-runtime/src/interactivity/engine.ts",
  );
  for (const count of [100, 1000, 2000]) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const offset = nodes.length;
      nodes.push(
        { declaration: 0, flows: { out: { node: offset + 1, socket: "in" } } },
        { declaration: 1, values: { duration: { type: 0, value: [1] } },
          flows: { done: { node: offset + 2, socket: "in" } } },
        { declaration: 2, configuration: { message: { value: [String(i)] } } },
      );
    }
    const graph = { graph: 0, graphs: [{
      types: [{ signature: "float" }],
      declarations: [{ op: "event/onStart" }, { op: "flow/setDelay" }, { op: "debug/log" }],
      nodes,
    }] };
    const samples = [];
    for (let iteration = 0; iteration < 25; iteration++) {
      const logged = [];
      const engine = new InteractivityEngine(graph, {
        log: (entry) => logged.push(entry.message),
      });
      engine.start();
      const start = performance.now();
      engine.update(1);
      const elapsed = performance.now() - start;
      assert.deepEqual(logged, Array.from({ length: count }, (_, i) => String(i)));
      if (iteration >= 5) samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    console.log(`${count} simultaneous timers: median ${samples[10].toFixed(3)} ms (20 samples, 5 warmups)`);
  }
} finally {
  await server.close();
}
