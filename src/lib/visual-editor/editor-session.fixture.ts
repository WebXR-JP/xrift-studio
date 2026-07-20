import {
  getEntityReparentDecision,
  reparentEntityHierarchy,
  updateEntityEnabled,
} from "./editor-session";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

/** Pure assertions for sibling ordering, reparenting, and Entity Enabled state. */
export function runEditorSessionHierarchyFixtureAssertions(): void {
  const scene = hierarchyFixtureScene();

  const reordered = reparentEntityHierarchy(scene, "entity-b", null, 2);
  assertEqual(
    reordered.rootEntityIds,
    ["entity-a", "entity-c", "entity-b"],
    "root siblings must move to the requested insertion index",
  );

  const parented = reparentEntityHierarchy(
    reordered,
    "entity-c",
    "entity-a",
    0,
  );
  assertEqual(
    parented.rootEntityIds,
    ["entity-a", "entity-b"],
    "reparenting must remove the subtree from Scene Root",
  );
  assertEqual(
    parented.entities["entity-a"]?.children ?? [],
    ["entity-c", "entity-d"],
    "reparenting must insert before the requested sibling",
  );
  assert(
    parented.entities["entity-c"]?.parentId === "entity-a",
    "the moved Entity must point back to its new parent",
  );

  const unchanged = getEntityReparentDecision(
    parented,
    "entity-c",
    "entity-a",
    0,
  );
  assert(
    !unchanged.allowed && unchanged.reason === "unchanged-order",
    "dropping onto the current insertion point must be a no-op",
  );

  const cycle = getEntityReparentDecision(
    parented,
    "entity-a",
    "entity-d",
    0,
  );
  assert(
    !cycle.allowed && cycle.reason === "descendant-parent",
    "a subtree must not be moved below one of its descendants",
  );

  const disabled = updateEntityEnabled(parented, "entity-a", false);
  assert(
    disabled.entities["entity-a"]?.enabled === false,
    "Entity Enabled must update the selected Entity",
  );
  assert(
    disabled.entities["entity-c"]?.enabled === true,
    "disabling a parent must preserve each child's own Enabled value",
  );
}

function hierarchyFixtureScene(): SceneDocument {
  const entities = {
    "entity-a": entity("entity-a", null, ["entity-d"]),
    "entity-b": entity("entity-b"),
    "entity-c": entity("entity-c"),
    "entity-d": entity("entity-d", "entity-a"),
  };
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-hierarchy-fixture",
    name: "Hierarchy fixture",
    rootEntityIds: ["entity-a", "entity-b", "entity-c"],
    entities,
  };
}

function entity(
  id: string,
  parentId: string | null = null,
  children: string[] = [],
): SceneEntity {
  return { id, name: id, parentId, children, enabled: true, components: [] };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Editor hierarchy fixture failed: ${message}`);
}

function assertEqual(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `Editor hierarchy fixture failed: ${message}; expected ${expected.join(",")}, received ${actual.join(",")}`,
    );
  }
}
