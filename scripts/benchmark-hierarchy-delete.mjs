import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { deleteEntityHierarchy } from "../src/lib/visual-editor/editor-session.ts";
import { SceneEntityTreeStore } from "../src/components/visual-editor/scene-entity-tree-store.ts";
import { runEditorSessionHierarchyFixtureAssertions } from "../src/lib/visual-editor/editor-session.fixture.ts";

// Run with: bun scripts/benchmark-hierarchy-delete.mjs (no production build).
runEditorSessionHierarchyFixtureAssertions();
console.log("Editor hierarchy fixtures passed");

for (const count of [1000, 5000, 10000]) {
  const entities = Object.fromEntries(Array.from({ length: count }, (_, i) => {
    const id = `entity-${i}`;
    return [id, { id, name: id, enabled: true, parentId: i === 1 ? "entity-0" : null,
      children: i === 0 ? ["entity-1"] : [], components: [] }];
  }));
  const scene = { schemaVersion: 1, sceneId: "benchmark", name: "benchmark",
    entities, rootEntityIds: Object.keys(entities).filter(id => id !== "entity-1") };
  const input = { scene, authoringEntityIdByEntityId: {}, selectedEntityIds: new Set(),
    primaryEntityId: null, runtimeEntityRevisions: undefined, materialDropTarget: null };
  const samples = [];
  let notifications = 0;
  let changedSurvivors = 0;
  for (let run = 0; run < 35; run++) {
    const store = new SceneEntityTreeStore(input);
    notifications = 0;
    for (const id of Object.keys(entities)) {
      store.getSnapshot(id);
      store.subscribe(id, () => { notifications++; });
    }
    const start = performance.now();
    const next = deleteEntityHierarchy(scene, ["entity-1"]);
    store.publish({ ...input, scene: next });
    const elapsed = performance.now() - start;
    if (run >= 5) samples.push(elapsed);
    assert.equal(next.entities["entity-1"], undefined);
    assert.deepEqual(next.entities["entity-0"].children, []);
    changedSurvivors = Object.keys(next.entities).filter(id => next.entities[id] !== entities[id]).length;
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ entities: count, changedSurvivors, notifications,
    medianDeleteAndPublishMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)) }));
}
