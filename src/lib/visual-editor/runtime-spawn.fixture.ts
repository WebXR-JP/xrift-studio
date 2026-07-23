import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
} from "./component-registry";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import {
  DEFAULT_RUNTIME_SPAWN_POSITION,
  resolveRuntimeSpawnPosition,
} from "./runtime-spawn";

export function runRuntimeSpawnFixtureAssertions(): void {
  const scene = fixtureScene();
  assertVec3(
    resolveRuntimeSpawnPosition(scene),
    [12, 3, 4],
    "Official SpawnPoint position must be composed with its Entity hierarchy",
  );

  const spawn = scene.entities.spawn;
  if (!spawn) throw new Error("Runtime spawn fixture is missing SpawnPoint");
  spawn.enabled = false;
  assertVec3(
    resolveRuntimeSpawnPosition(scene),
    DEFAULT_RUNTIME_SPAWN_POSITION,
    "Disabled SpawnPoint must use the fallback position",
  );
}

function fixtureScene(): SceneDocument {
  const root = entity("root", null, ["spawn"], [10, 1, 0]);
  const spawn = entity("spawn", "root", [], [2, 0, 3]);
  spawn.components.push(
    createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint, {
      componentId: "spawn-component",
      properties: { position: [0, 2, 1], yaw: 0 },
    })!,
  );
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "runtime-spawn-fixture",
    name: "Runtime Spawn fixture",
    rootEntityIds: ["root"],
    entities: { root, spawn },
  };
}

function entity(
  id: string,
  parentId: string | null,
  children: string[],
  position: [number, number, number],
): SceneEntity {
  return {
    id,
    name: id,
    parentId,
    children,
    enabled: true,
    components: [createTransformComponent(`transform-${id}`, position)],
  };
}

function assertVec3(
  actual: readonly number[],
  expected: readonly number[],
  message: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => Math.abs(value - expected[index]!) > 1e-6)
  ) {
    throw new Error(
      `Runtime spawn fixture failed: ${message}. Expected ${expected.join(", ")}, received ${actual.join(", ")}`,
    );
  }
}
