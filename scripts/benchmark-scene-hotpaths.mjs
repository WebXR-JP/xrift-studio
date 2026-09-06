// Run with: bun scripts/benchmark-scene-hotpaths.mjs
// Source-level CPU benchmarks; excludes React/WebGL drawing and file I/O.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { SceneEntityTreeStore } from "../src/components/visual-editor/scene-entity-tree-store.ts";
import { getEntityWorldBounds } from "../src/lib/visual-editor/entity-bounds.ts";
import { createPrototypeProject, BUILTIN_ASSET_IDS } from "../src/lib/visual-editor/prototype-project.ts";
import { addBuiltinPrimitiveEntity, createTransformComponent } from "../src/lib/visual-editor/scene-document.ts";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../src/lib/visual-editor/creation-catalog.ts";
import { InteractivityEngine } from "../packages/xrift-studio-runtime/src/interactivity/engine.ts";

function median(samples) {
  samples.sort((a, b) => a - b);
  return Number(samples[Math.floor(samples.length / 2)].toFixed(3));
}

function measure(makeRun, repetitions = 25) {
  const samples = [];
  for (let i = 0; i < repetitions + 5; i++) {
    const run = makeRun();
    const start = performance.now();
    const verify = run();
    const elapsed = performance.now() - start;
    verify?.();
    if (i >= 5) samples.push(elapsed);
  }
  return median(samples);
}

const bundle = createPrototypeProject("world", "hotpath-benchmark");
const box = addBuiltinPrimitiveEntity(bundle.scene, bundle.assets,
  BUILTIN_PRIMITIVE_CREATION_IDS.box, BUILTIN_ASSET_IDS.material.blue, [0, 0, 0]);
assert(box);
const mesh = box.scene.entities[box.entityId].components.find(c => c.type === "mesh");

function sceneOf(count, nested) {
  const entities = Object.fromEntries(Array.from({ length: count }, (_, i) => {
    const id = `entity-${i}`;
    return [id, {
      id, name: id, enabled: true,
      parentId: nested && i > 0 ? `entity-${i - 1}` : null,
      children: nested && i + 1 < count ? [`entity-${i + 1}`] : [],
      components: [createTransformComponent(`transform-${i}`, [1, 0, 0]), mesh],
    }];
  }));
  return { ...bundle.scene, entities, rootEntityIds: nested ? ["entity-0"] : Object.keys(entities) };
}

// One hundred selection changes with ten thousand mounted Entity subscriptions.
{
  const scene = sceneOf(10000, false);
  const input = { scene, authoringEntityIdByEntityId: {}, selectedEntityIds: new Set(),
    primaryEntityId: null, runtimeEntityRevisions: undefined, materialDropTarget: null };
  const medianMs = measure(() => {
    const store = new SceneEntityTreeStore(input);
    let notifications = 0;
    for (const id of Object.keys(scene.entities)) {
      store.getSnapshot(id);
      store.subscribe(id, () => notifications++);
    }
    return () => {
      for (let i = 0; i < 100; i++) {
        const id = `entity-${i}`;
        store.publish({ ...input, selectedEntityIds: new Set([id]), primaryEntityId: id });
      }
      return () => assert.equal(notifications, 199);
    };
  });
  console.log(JSON.stringify({ case: "100 selection changes / 10000 entities", medianMs }));
}

// Every node in an 800-deep hierarchy has geometry; all bounds must contribute.
{
  const scene = sceneOf(800, true);
  const medianMs = measure(() => () => {
    const result = getEntityWorldBounds(scene, bundle.assets, "entity-0");
    return () => {
      assert.equal(result.measured.length, 800);
      assert.equal(result.world.min[0], 0.5);
      assert.equal(result.world.max[0], 800.5);
    };
  }, 15);
  console.log(JSON.stringify({ case: "bounds / 800 nested meshes", medianMs }));
}

// Mixed due times and ties, deliberately scheduled out of chronological order.
{
  const count = 2000;
  const due = Array.from({ length: count }, (_, i) => ((i * 137) % 101) + 1);
  const expected = Array.from({ length: count }, (_, i) => i).sort((a, b) => due[a] - due[b] || a - b);
  const nodes = due.flatMap((duration, i) => [
    { declaration: 0, flows: { out: { node: i * 3 + 1 } } },
    { declaration: 1, values: { duration: { type: 0, value: [duration] } }, flows: { done: { node: i * 3 + 2 } } },
    { declaration: 2, configuration: { message: { value: [String(i)] } } },
  ]);
  const graph = { graph: 0, graphs: [{ types: [{ signature: "float" }],
    declarations: [{ op: "event/onStart" }, { op: "flow/setDelay" }, { op: "debug/log" }], nodes }] };
  const medianMs = measure(() => {
    const fired = [];
    const engine = new InteractivityEngine(graph, { log: entry => fired.push(Number(entry.message)) }, { traceLimit: 0 });
    return () => {
      engine.start();
      engine.update(102);
      return () => {
        assert.deepEqual(fired, expected);
        assert.equal(engine.hasPendingWork, false);
        assert.equal(engine.getIssues().length, 0);
      };
    };
  }, 15);
  console.log(JSON.stringify({ case: "schedule and drain / 2000 timers", medianMs }));
}
