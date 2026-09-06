// Run with: node scripts/check-scene-hotpaths.mjs (Vite source loading, no build).
import { createServer } from "vite";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-hotpath-fixtures",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false } });
try {

  const suites = [
    ["../src/components/visual-editor/autosave-coordinator.fixture.ts", "runAutosaveCoordinatorFixtureAssertions"],
    ["../src/components/visual-editor/scene-entity-tree-store.fixture.ts", "runSceneEntityTreeStoreFixtureAssertions"],
    ["../src/lib/visual-editor/editor-session.fixture.ts", "runEditorSessionHierarchyFixtureAssertions"],
    ["../src/lib/visual-editor/entity-bounds.fixture.ts", "runEntityBoundsFixtureAssertions"],
    ["../packages/xrift-studio-runtime/src/interactivity/timer-queue.fixture.ts", "runTimerQueueFixtureAssertions"],
    ["../packages/xrift-studio-runtime/src/interactivity/engine.fixture.ts", "runInteractivityEngineFixtureAssertions"],
    ["../packages/xrift-studio-runtime/src/interactivity-animation-plan.fixture.ts", "runInteractivityAnimationPlanFixtureAssertions"],
    ["../src/lib/visual-editor/interactivity-recipes.fixture.ts", "runInteractivityRecipeFixtureAssertions"],
    ["../src/lib/visual-editor/interactivity-recipes.fixture.ts", "runInteractivityRuntimeAdapterFixtureAssertions"],
    ["../src/lib/visual-editor/interactivity-recipes.fixture.ts", "runModelAnimationGraphFixtureAssertions"],
    ["../src/lib/visual-editor/compiler/script-emit.fixture.ts", "runScriptEmitFixtureAssertions"],
    ["../src/lib/visual-editor/compiler/fixture.ts", "runVisualCompilerFixtureAssertions"],
    ["../src/lib/visual-editor/mcp-editor-tools.fixture.ts", "runXriftMcpEditorToolFixtures"],
  ];
  for (const [source, name] of suites) {
    const suite = await server.ssrLoadModule(path.resolve(import.meta.dirname, source).replaceAll("\\", "/"));
    await suite[name]();
    console.log(`passed: ${name}`);
  }

  // Load the actual emitted modules from the flattened publication layout.
  // This catches a new runtime dependency that typechecks in Studio but fails
  // when its source or rewritten import is missing in an exported world.
  const { createInteractivityRuntimeOverlayFiles, INTERACTIVITY_ENGINE_OVERLAY_PATH } =
    await server.ssrLoadModule("/src/lib/visual-editor/compiler/script-emit.ts");
  await mkdir("test-results", { recursive: true });
  const staging = await mkdtemp(path.resolve("test-results", "hotpath-overlays-"));
  for (const file of createInteractivityRuntimeOverlayFiles()) {
    const destination = path.join(staging, file.relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  const { InteractivityEngine } = await server.ssrLoadModule(path.join(staging, INTERACTIVITY_ENGINE_OVERLAY_PATH).replaceAll("\\", "/"));
  const logs = [];
  const engine = new InteractivityEngine({ graph: 0, graphs: [{
    types: [{ signature: "float" }],
    declarations: [{ op: "event/onStart" }, { op: "flow/setDelay" }, { op: "debug/log" }],
    nodes: [
      { declaration: 0, flows: { out: { node: 1 } } },
      { declaration: 1, values: { duration: { type: 0, value: [1] } }, flows: { done: { node: 2 } } },
      { declaration: 2, configuration: { message: { value: ["published timer fired"] } } },
    ],
  }] }, { log: entry => logs.push(entry) });
  engine.start();
  engine.update(2);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, "published timer fired");
  assert.equal(logs[0].timeSeconds, 1);
  assert.equal(engine.hasPendingWork, false);
  assert.deepEqual(engine.getIssues(), []);
  console.log("passed: emitted runtime timer execution");
} finally {
  await server.close();
}
