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

/**
 * Resolves the first active player SpawnPoint using the same hierarchy and
 * transform composition as the Scene View.
 */
export function resolveRuntimeSpawnPosition(scene: SceneDocument): Vec3 {
  for (const entity of entitiesInHierarchyOrder(scene)) {
    if (!isEntityHierarchyEnabled(scene, entity)) continue;
    const localPosition = findSpawnPointLocalPosition(entity);
    if (!localPosition) continue;
    return transformPointToWorld(scene, entity, localPosition);
  }
  return [...DEFAULT_RUNTIME_SPAWN_POSITION];
}

function findSpawnPointLocalPosition(entity: SceneEntity): Vec3 | null {
  for (const component of entity.components) {
    if (!component.enabled) continue;
    if (component.type === "spawn-point" && component.target === "player") {
      return [0, 0, 0];
    }
    if (
      component.type === "xrift-component" &&
      component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint
    ) {
      return jsonVec3(component.properties.position) ?? [0, 0, 0];
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
