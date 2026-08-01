import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { XRIFT_COMPONENT_SCHEMA_IDS } from "./component-registry";
import {
  getTransform,
  type JsonValue,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

export const DEFAULT_RUNTIME_SPAWN_POSITION: Vec3 = [0, 0, 2.5];

export type RuntimeSpawn = {
  position: Vec3;
  /** SpawnPoint yaw in radians, including the authored Entity hierarchy. */
  yaw: number;
};

export const DEFAULT_RUNTIME_SPAWN: RuntimeSpawn = {
  position: DEFAULT_RUNTIME_SPAWN_POSITION,
  yaw: 0,
};

/**
 * Resolves the first active player SpawnPoint using the same hierarchy and
 * transform composition as the Scene View.
 */
export function resolveRuntimeSpawnPosition(scene: SceneDocument): Vec3 {
  return resolveRuntimeSpawn(scene).position;
}

/**
 * Resolves the first active player SpawnPoint position and orientation using
 * the same hierarchy composition as the Scene View and generated World.
 */
export function resolveRuntimeSpawn(scene: SceneDocument): RuntimeSpawn {
  for (const entity of entitiesInHierarchyOrder(scene)) {
    if (!isEntityHierarchyEnabled(scene, entity)) continue;
    const spawn = findSpawnPoint(entity);
    if (!spawn) continue;
    return {
      position: transformPointToWorld(scene, entity, spawn.position),
      yaw: getWorldYaw(scene, entity) + spawn.yaw,
    };
  }
  return {
    position: [...DEFAULT_RUNTIME_SPAWN_POSITION],
    yaw: DEFAULT_RUNTIME_SPAWN.yaw,
  };
}

function findSpawnPoint(entity: SceneEntity): { position: Vec3; yaw: number } | null {
  for (const component of entity.components) {
    if (!component.enabled) continue;
    if (component.type === "spawn-point" && component.target === "player") {
      return { position: [0, 0, 0], yaw: 0 };
    }
    if (
      component.type === "xrift-component" &&
      component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint
    ) {
      const yawDegrees = jsonNumber(component.properties.yaw) ?? 0;
      return {
        position: jsonVec3(component.properties.position) ?? [0, 0, 0],
        yaw: (yawDegrees * Math.PI) / 180,
      };
    }
  }
  return null;
}

function entitiesInHierarchyOrder(scene: SceneDocument): SceneEntity[] {
  const ordered: SceneEntity[] = [];
  const visited = new Set<string>();
  const visit = (entityId: string) => {
    if (visited.has(entityId)) return;
    visited.add(entityId);
    const entity = scene.entities[entityId];
    if (!entity) return;
    ordered.push(entity);
    entity.children.forEach(visit);
  };
  scene.rootEntityIds.forEach(visit);
  Object.keys(scene.entities).forEach(visit);
  return ordered;
}

function isEntityHierarchyEnabled(
  scene: SceneDocument,
  entity: SceneEntity,
): boolean {
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current) {
    if (!current.enabled || visited.has(current.id)) return false;
    visited.add(current.id);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return true;
}

function transformPointToWorld(
  scene: SceneDocument,
  entity: SceneEntity,
  localPosition: Vec3,
): Vec3 {
  const chain: SceneEntity[] = [];
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }

  const worldMatrix = new Matrix4();
  const localMatrix = new Matrix4();
  const quaternion = new Quaternion();
  for (const ancestor of chain.reverse()) {
    const transform = getTransform(ancestor);
    const position = transform?.position ?? [0, 0, 0];
    const rotation = transform?.rotation ?? [0, 0, 0];
    const scale = transform?.scale ?? [1, 1, 1];
    quaternion.setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
    localMatrix.compose(
      new Vector3(position[0], position[1], position[2]),
      quaternion,
      new Vector3(scale[0], scale[1], scale[2]),
    );
    worldMatrix.multiply(localMatrix);
  }

  const result = new Vector3(...localPosition).applyMatrix4(worldMatrix);
  return [result.x, result.y, result.z];
}

function getWorldYaw(scene: SceneDocument, entity: SceneEntity): number {
  const chain: SceneEntity[] = [];
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }

  const worldQuaternion = new Quaternion();
  const localQuaternion = new Quaternion();
  for (const ancestor of chain.reverse()) {
    const rotation = getTransform(ancestor)?.rotation ?? [0, 0, 0];
    localQuaternion.setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
    worldQuaternion.multiply(localQuaternion);
  }
  return new Euler().setFromQuaternion(worldQuaternion, "YXZ").y;
}

function jsonVec3(value: JsonValue | undefined): Vec3 | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((part) => typeof part === "number" && Number.isFinite(part))
  ) {
    return null;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function jsonNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
