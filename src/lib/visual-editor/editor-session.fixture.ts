import {
  addEditorComponent,
  getEntityReparentDecision,
  reparentEntityHierarchy,
  updateEntityEnabled,
} from "./editor-session";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createBoxColliderComponent,
  migrateLegacyParentRigidBodies,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import { createPrototypeProject } from "./prototype-project";

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

  const corruptedScene = corruptedHierarchyFixtureScene();
  const corruptedCycle = getEntityReparentDecision(
    corruptedScene,
    "entity-a",
    "entity-b",
  );
  assert(
    !corruptedCycle.allowed && corruptedCycle.reason === "descendant-parent",
    "a stale child link must not allow a cyclic hierarchy move",
  );
  assert(
    reparentEntityHierarchy(corruptedScene, "entity-a", "entity-b") ===
      corruptedScene,
    "a rejected corrupt-document move must leave the Scene unchanged",
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

  const project = createPrototypeProject("world", "rigid-body-editor-fixture");
  const physicsEntityId = "entity-world-object";
  const physicsEntity = project.scene.entities[physicsEntityId]!;
  const physicsScene: SceneDocument = {
    ...project.scene,
    entities: {
      ...project.scene.entities,
      [physicsEntityId]: {
        ...physicsEntity,
        components: [
          ...physicsEntity.components.filter(
            (component) => component.type !== "collider",
          ),
          createBoxColliderComponent("legacy-dynamic-collider", {
            bodyType: "dynamic",
            gravityScale: 0.5,
            ccd: true,
          }),
        ],
      },
    },
  };
  const addedBody = addEditorComponent(
    physicsScene,
    project.assets,
    physicsEntityId,
    "physics.rigid-body",
    "world",
  );
  const body = addedBody.scene.entities[physicsEntityId]?.components.find(
    (component) => component.type === "rigid-body",
  );
  assert(
    addedBody.added &&
      body?.bodyType === "dynamic" &&
      body.autoColliders === "none" &&
      body.gravityScale === 0.5 &&
      body.ccd,
    "adding a parent Rigid Body must migrate legacy Collider body settings",
  );
  assert(
    !addEditorComponent(
      addedBody.scene,
      project.assets,
      physicsEntityId,
      "physics.rigid-body",
      "world",
    ).added,
    "an Entity must not receive duplicate Rigid Body components",
  );

  const legacyParentScene: SceneDocument = {
    ...physicsScene,
    entities: {
      ...physicsScene.entities,
      [physicsEntityId]: {
        ...physicsScene.entities[physicsEntityId]!,
        name: "Duck RigidBody",
        children: ["legacy-body-child"],
        components: [
          createBoxColliderComponent("legacy-imported-body-carrier", {
            bodyType: "dynamic",
            friction: 0,
            ccd: true,
          }),
        ],
      },
      "legacy-body-child": entity(
        "legacy-body-child",
        physicsEntityId,
      ),
    },
  };
  const migrated = migrateLegacyParentRigidBodies(legacyParentScene);
  const migratedParent = migrated.entities[physicsEntityId]!;
  assert(
    migratedParent.components.some(
      (component) =>
        component.type === "rigid-body" &&
        component.bodyType === "dynamic" &&
        component.autoColliders === "cuboid" &&
        component.friction === 0 &&
        component.ccd,
    ) &&
      !migratedParent.components.some(
        (component) => component.type === "collider",
      ),
    "legacy imported origin carriers must migrate to parent Rigid Body components",
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

function corruptedHierarchyFixtureScene(): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-corrupted-hierarchy-fixture",
    name: "Corrupted hierarchy fixture",
    rootEntityIds: ["entity-a", "entity-b"],
    entities: {
      "entity-a": entity("entity-a", null, ["entity-middle"]),
      "entity-middle": entity("entity-middle", "entity-a", ["entity-b"]),
      // Legacy corruption: the child array reaches entity-b, but its parentId
      // still marks it as a root.
      "entity-b": entity("entity-b"),
    },
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
