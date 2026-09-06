import { SceneEntityTreeStore, type SceneEntityTreeInput } from "./scene-entity-tree-store";
import { SCENE_DOCUMENT_SCHEMA_VERSION, type SceneDocument } from "../../lib/visual-editor/scene-document";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Scene Entity store: ${message}`);
}

export function runSceneEntityTreeStoreFixtureAssertions(): void {
  const entities: SceneDocument["entities"] = {};
  for (let i = 0; i < 1000; i++) {
    const id = `entity-${i}`;
    entities[id] = { id, name: id, parentId: null, children: [], components: [], enabled: true };
  }
  let reads = 0;
  const scene: SceneDocument = {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "store-fixture", name: "Store fixture", rootEntityIds: Object.keys(entities),
    entities: new Proxy(entities, { get(target, key, receiver) {
      reads++;
      return Reflect.get(target, key, receiver);
    } }),
  };
  let input: SceneEntityTreeInput = {
    scene, authoringEntityIdByEntityId: {}, selectedEntityIds: new Set(["entity-0"]),
    primaryEntityId: "entity-0", runtimeEntityRevisions: undefined, materialDropTarget: null,
  };
  const store = new SceneEntityTreeStore(input);
  const notified = new Set<string>();
  const unsubscribe = new Map<string, () => void>();
  for (const id of Object.keys(entities)) {
    store.getSnapshot(id);
    unsubscribe.set(id, store.subscribe(id, () => notified.add(id)));
  }
  const publish = (patch: Partial<SceneEntityTreeInput>) => {
    notified.clear();
    reads = 0;
    input = { ...input, ...patch };
    store.publish(input);
  };
  const unrelated = store.getSnapshot("entity-999");
  publish({ selectedEntityIds: new Set(["entity-1"]), primaryEntityId: "entity-1" });
  assert(notified.size === 2 && notified.has("entity-0") && notified.has("entity-1"), "selection must wake only the old and new selection");
  assert(reads <= 2, `selection inspected ${reads} Entities instead of only affected Entities`);
  assert(store.getSnapshot("entity-999") === unrelated, "unrelated snapshots must remain stable");
  publish({ selectedEntityIds: new Set(["entity-1"]) });
  assert(notified.size === 0 && reads === 0, "an equivalent selection must not inspect Entities");

  // A Prefab may render several nodes for one authoring Entity.
  publish({ authoringEntityIdByEntityId: { "entity-2": "prefab", "entity-3": "prefab" } });
  publish({ selectedEntityIds: new Set(["prefab"]), primaryEntityId: "prefab" });
  assert(notified.size === 3 && notified.has("entity-1") && notified.has("entity-2") && notified.has("entity-3"), "selection must reach every node mapped to the authoring Entity");
  publish({ materialDropTarget: { entityId: "prefab", meshComponentId: "mesh-a" } });
  assert(notified.size === 2 && store.getSnapshot("entity-2").materialDropComponentId === "mesh-a", "material hover must reach mapped nodes");
  publish({ materialDropTarget: { entityId: "prefab", meshComponentId: "mesh-b" } });
  assert(notified.size === 2 && store.getSnapshot("entity-3").materialDropComponentId === "mesh-b", "moving between meshes on the same Entity must update the snapshot");
  publish({ materialDropTarget: null, runtimeEntityRevisions: { prefab: 4 } });
  assert(store.getSnapshot("entity-2").runtimeRevision === 4 && store.getSnapshot("entity-2").materialDropComponentId === null, "runtime and hover changes must not be lost");

  let secondListenerCalls = 0;
  const stopSecond = store.subscribe("entity-2", () => secondListenerCalls++);
  unsubscribe.get("entity-2")!();
  publish({ primaryEntityId: null });
  assert(secondListenerCalls === 1, "removing one listener must preserve other listeners on the Entity");
  stopSecond();
  const unmounted = store.getSnapshot("entity-2");
  publish({ selectedEntityIds: new Set() });
  assert(!store.getSnapshot("entity-2").selected && store.getSnapshot("entity-2") !== unmounted, "unmounted cached snapshots must not become stale");
  const stopRemounted = store.subscribe("entity-2", () => notified.add("entity-2"));
  publish({ authoringEntityIdByEntityId: { "entity-2": "new-prefab" } });
  publish({ selectedEntityIds: new Set(["new-prefab"]) });
  assert(notified.size === 1 && notified.has("entity-2"), "remount and remapping must refresh the reverse subscription index");

  const updated = { ...entities["entity-999"], name: "Updated" };
  publish({ scene: { ...scene, entities: { ...entities, "entity-999": updated } } });
  assert(store.getSnapshot("entity-999").entity === updated && notified.has("entity-999"), "document changes must still reach unselected nodes");
  stopRemounted();
  for (const stop of unsubscribe.values()) stop();
}
