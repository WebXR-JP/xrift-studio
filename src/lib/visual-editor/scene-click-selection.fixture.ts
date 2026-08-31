import {
  isEntityDescendantOf,
  resolveSceneClickSelection,
  resolveSceneContextMenuTarget,
  type SceneClickPick,
} from "./scene-click-selection";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

/** Pure assertions for the click drill-down into nested Entities. */
export function runSceneClickSelectionFixtureAssertions(): void {
  const scene = clickFixtureScene();

  assert(
    isEntityDescendantOf(scene, "stair-1", "island"),
    "a grandchild must count as a descendant of the root",
  );
  assert(
    !isEntityDescendantOf(scene, "island", "island"),
    "an Entity must not count as its own descendant",
  );
  assert(
    !isEntityDescendantOf(scene, "other", "island"),
    "an unrelated root must not count as a descendant",
  );

  assertSelection(
    resolveSceneClickSelection(scene, null, pick(["island"], [], "island")),
    "island",
    "without a current selection the click must keep the frontmost pick",
  );

  assertSelection(
    resolveSceneClickSelection(scene, "island", pick(["other"], [], "other")),
    "other",
    "clicking an unrelated Entity must select it, not drill",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "island",
      pick(["stair-1", "island"], [], "stair-1"),
    ),
    "stair-1",
    "clicking a visible descendant surface must select it directly",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "island",
      pick(["island", "stairs", "stair-1"], [], "island"),
    ),
    "stairs",
    "clicking the selection again must step to the nearest buried descendant surface",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "stairs",
      pick(["island", "stairs", "stair-1"], [], "island"),
    ),
    "stair-1",
    "a second drill click must continue into the deeper descendant",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "island",
      pick(["island", "stair-1"], [], "island"),
    ),
    "stair-1",
    "the drill must skip mesh-less middle Entities that leave no surface on the ray",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "stair-1",
      pick(["island", "stair-1"], [], "island"),
    ),
    "stair-1",
    "clicking the buried selection again must keep it instead of bouncing to the ancestor",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "stair-1",
      pick(["island", "stair-2"], [], "island"),
    ),
    "island",
    "clicking a spot away from the buried selection must restart from the frontmost surface",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "island",
      pick(["island"], ["other", "hidden-collider"], "island"),
    ),
    "hidden-collider",
    "with no descendant surface on the ray the drill must reach a nearby descendant origin",
  );

  assertSelection(
    resolveSceneClickSelection(
      scene,
      "island",
      pick(["island"], ["other"], "island"),
    ),
    "island",
    "with nothing of the subtree under the click the selection must stay put",
  );

  assertSelection(
    resolveSceneClickSelection(scene, "gone", pick(["island"], [], "island")),
    "island",
    "a stale selection id must fall back to the frontmost pick",
  );

  assertSelection(
    resolveSceneClickSelection(scene, "island", pick([], [], null)),
    null,
    "an empty click must clear the selection through the fallback",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "stair-1",
      pick(["island", "stairs", "stair-1"], [], "island"),
    ),
    "stair-1",
    "the context menu must act on the drilled selection, not the enclosing ancestor",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "stairs",
      pick(["island", "stairs", "stair-1"], [], "island"),
    ),
    "stairs",
    "the context menu must keep the drilled selection instead of stepping deeper",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "stairs",
      pick(["island", "stair-1"], [], "island"),
    ),
    "stairs",
    "a right click inside the selection's subtree must stay on the selection",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "hidden-collider",
      pick(["island"], ["hidden-collider"], "island"),
    ),
    "hidden-collider",
    "a mesh-less selection reached by origin assist must stay the menu target",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "island",
      pick(["island", "stairs"], [], "island"),
    ),
    "island",
    "without a drill the context menu must act on the frontmost surface",
  );

  assertSelection(
    resolveSceneContextMenuTarget(scene, "stair-1", pick(["other"], [], "other")),
    "other",
    "right-clicking an unrelated Entity must retarget the menu to it",
  );

  assertSelection(
    resolveSceneContextMenuTarget(
      scene,
      "stair-1",
      pick(["island", "stair-2"], [], "island"),
    ),
    "island",
    "a right click away from the buried selection must restart from the frontmost surface",
  );

  assertSelection(
    resolveSceneContextMenuTarget(scene, "gone", pick(["island"], [], "island")),
    "island",
    "a stale selection id must leave the menu on the frontmost pick",
  );

  assertSelection(
    resolveSceneContextMenuTarget(scene, "island", pick([], [], null)),
    null,
    "a right click on empty space must leave the menu without an Entity target",
  );
}

function pick(
  rayEntityIds: readonly string[],
  originEntityIds: readonly string[],
  fallbackEntityId: string | null,
): SceneClickPick {
  return { rayEntityIds, originEntityIds, fallbackEntityId };
}

/**
 * island (large mesh)
 *   stairs (own mesh)
 *     stair-1, stair-2 (meshes)
 *   hidden-collider (no mesh, origin only)
 * other (unrelated root)
 */
function clickFixtureScene(): SceneDocument {
  const entities = {
    island: entity("island", null, ["stairs", "hidden-collider"]),
    stairs: entity("stairs", "island", ["stair-1", "stair-2"]),
    "stair-1": entity("stair-1", "stairs"),
    "stair-2": entity("stair-2", "stairs"),
    "hidden-collider": entity("hidden-collider", "island"),
    other: entity("other"),
  };
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-click-selection-fixture",
    name: "Click selection fixture",
    rootEntityIds: ["island", "other"],
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
  if (!condition) {
    throw new Error(`Scene click selection fixture failed: ${message}`);
  }
}

function assertSelection(
  actual: string | null,
  expected: string | null,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `Scene click selection fixture failed: ${message}; expected ${expected ?? "null"}, received ${actual ?? "null"}`,
    );
  }
}
