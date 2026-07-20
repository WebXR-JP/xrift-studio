import {
  getGeometryAsset,
  getGeometryMaterialSlots,
  getMaterialAsset,
  type AssetManifest,
  type MaterialSlotDefinition,
  type PrimitiveAsset,
  type PrimitiveGeometry,
} from "./asset-manifest";
import {
  getBuiltinPrimitiveCreation,
  type BuiltinPrimitiveCreationDefinition,
} from "./creation-catalog";
import { createDocumentId } from "./document-id";
import type { SceneSettings } from "./scene-settings";

export const SCENE_DOCUMENT_SCHEMA_VERSION = "0.1.0" as const;

export type Vec3 = [number, number, number];

type ComponentBase = {
  /** Unique inside its owning entity. */
  id: string;
  enabled: boolean;
};

export type TransformComponent = ComponentBase & {
  type: "transform";
  position: Vec3;
  /** Euler angles in radians. */
  rotation: Vec3;
  scale: Vec3;
};

export type MeshComponent = ComponentBase & {
  type: "mesh";
  /** @deprecated Compatibility key for the first prototype. */
  geometryAssetId: string;
  /** Canonical geometry reference for newly-authored scene documents. */
  geometry?: MeshGeometryReference;
  /** MaterialAsset IDs keyed by primitive or glTF material slot. */
  materialBindings: MaterialBinding[];
  castShadow: boolean;
  receiveShadow: boolean;
};

export type MeshGeometryReference =
  | { kind: "asset"; assetId: string }
  | {
      kind: "builtin-primitive";
      creationId: string;
      primitive: PrimitiveGeometry;
    };

export type MaterialBinding = {
  slot: string;
  materialAssetId: string;
};

export const COLLIDER_FIT_MODES = ["manual", "auto"] as const;
export type ColliderFitMode = (typeof COLLIDER_FIT_MODES)[number];

export const COLLIDER_MESH_MODES = ["convex", "trimesh"] as const;
export type ColliderMeshMode = (typeof COLLIDER_MESH_MODES)[number];

type ColliderComponentBase = ComponentBase & {
  type: "collider";
  isTrigger: boolean;
  /** Non-negative contact friction coefficient. */
  friction: number;
  /** Bounciness in the inclusive 0..1 range. */
  restitution: number;
};

export type BoxColliderComponent = ColliderComponentBase & {
  shape: "box";
  center: Vec3;
  /** Positive local-space half sizes. */
  halfExtents: Vec3;
  fitMode: ColliderFitMode;
};

export type MeshColliderComponent = ColliderComponentBase & {
  shape: "mesh";
  /** Mesh colliders always follow the sibling Mesh geometry. */
  fitMode: "auto";
  meshMode: ColliderMeshMode;
};

export type ColliderComponent =
  | BoxColliderComponent
  | MeshColliderComponent;

export type LightComponent = ComponentBase & {
  type: "light";
  lightType: "ambient" | "directional" | "point";
  color: string;
  intensity: number;
  castShadow: boolean;
};

export type SpawnPointComponent = ComponentBase & {
  type: "spawn-point";
  target: "player" | "item-preview";
};

export type ParticleEmitterComponent = ComponentBase & {
  type: "particle-emitter";
  particleAssetId: string;
};

export type PrefabInstanceComponent = ComponentBase & {
  type: "prefab-instance";
  prefabAssetId: string;
  /** Entity ID inside the source PrefabDocument represented by this instance. */
  sourceEntityId: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ComponentAuthoringMetadata = {
  /** Stable catalog recipe used to create this component. */
  source: "builtin-prefab";
  recipeId: string;
  /** Built-in XRift recipes remain replaceable by deleting the Entity itself. */
  readOnly: true;
  /**
   * Functional recipe inputs which remain editable in the Inspector.
   * Component identity, lifecycle, transform props and every unlisted field
   * stay protected by `readOnly`.
   */
  editablePropertyNames?: string[];
};

/** Typed boundary for XRift-specific component schemas registered later. */
export type XRiftComponent = ComponentBase & {
  type: "xrift-component";
  schemaId: string;
  schemaVersion: string;
  properties: JsonObject;
  assetReferences: string[];
  entityReferences: string[];
  /** Editor-only provenance. The compiler deliberately ignores this field. */
  authoring?: ComponentAuthoringMetadata;
};

/** Core scene components kept compatible with the initial editor prototype. */
export interface SceneComponentSchemaRegistry {
  transform: TransformComponent;
  mesh: MeshComponent;
  collider: ColliderComponent;
  light: LightComponent;
  "spawn-point": SpawnPointComponent;
}

/** Declaration-merge boundary for future editor/runtime component schemas. */
export interface SceneComponentExtensionSchemaRegistry {
  "particle-emitter": ParticleEmitterComponent;
  "prefab-instance": PrefabInstanceComponent;
  "xrift-component": XRiftComponent;
}

export type CoreSceneComponent =
  SceneComponentSchemaRegistry[keyof SceneComponentSchemaRegistry];

export type RegisteredSceneComponent =
  | CoreSceneComponent
  | SceneComponentExtensionSchemaRegistry[keyof SceneComponentExtensionSchemaRegistry];

/**
 * Compatibility alias used by the first editor prototype. New code can use
 * RegisteredSceneComponent when it needs to make the registry boundary clear.
 */
export type SceneComponent = RegisteredSceneComponent;

export type SceneEntity = {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  enabled: boolean;
  components: RegisteredSceneComponent[];
};

export type SceneDocument = {
  schemaVersion: typeof SCENE_DOCUMENT_SCHEMA_VERSION;
  sceneId: string;
  name: string;
  /** Optional only to remain compatible with documents saved before scene settings. */
  settings?: SceneSettings;
  rootEntityIds: string[];
  entities: Record<string, SceneEntity>;
};

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function vectorsEqual(left: Vec3, right: Vec3): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function isFiniteVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function isValidScale(value: Vec3): boolean {
  return isFiniteVec3(value) && value.every((entry) => Math.abs(entry) >= 0.0001);
}

function isPositiveVec3(value: Vec3): boolean {
  return isFiniteVec3(value) && value.every((entry) => entry > 0);
}

function isValidFriction(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isValidRestitution(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isColliderFitMode(value: string): value is ColliderFitMode {
  return (COLLIDER_FIT_MODES as readonly string[]).includes(value);
}

function isColliderMeshMode(value: string): value is ColliderMeshMode {
  return (COLLIDER_MESH_MODES as readonly string[]).includes(value);
}

export function createTransformComponent(
  id: string,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): TransformComponent {
  return {
    id,
    type: "transform",
    enabled: true,
    position: isFiniteVec3(position) ? cloneVec3(position) : [0, 0, 0],
    rotation: isFiniteVec3(rotation) ? cloneVec3(rotation) : [0, 0, 0],
    scale: isValidScale(scale) ? cloneVec3(scale) : [1, 1, 1],
  };
}

export function createParticleEmitterComponent(
  id: string,
  particleAssetId: string,
): ParticleEmitterComponent | null {
  const normalizedId = id.trim();
  const normalizedAssetId = particleAssetId.trim();
  if (!normalizedId || !normalizedAssetId) return null;
  return {
    id: normalizedId,
    type: "particle-emitter",
    enabled: true,
    particleAssetId: normalizedAssetId,
  };
}

export function createMeshComponent(
  id: string,
  geometryAssetId: string,
  materialBindings: MaterialBinding[],
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): MeshComponent {
  return {
    id,
    type: "mesh",
    enabled: true,
    geometryAssetId,
    geometry: { kind: "asset", assetId: geometryAssetId },
    materialBindings: normalizeMaterialBindings(materialBindings),
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
  };
}

export function createBuiltinPrimitiveMeshComponent(
  id: string,
  definition: BuiltinPrimitiveCreationDefinition,
  materialBindings: MaterialBinding[],
): MeshComponent {
  return {
    id,
    type: "mesh",
    enabled: true,
    // Kept readable by the first prototype while canonical readers use geometry.
    geometryAssetId: definition.creationId,
    geometry: {
      kind: "builtin-primitive",
      creationId: definition.creationId,
      primitive: definition.primitive,
    },
    materialBindings: normalizeMaterialBindings(materialBindings),
    castShadow: definition.castShadow,
    receiveShadow: definition.receiveShadow,
  };
}

export type ColliderSurfaceOptions = {
  enabled?: boolean;
  isTrigger?: boolean;
  friction?: number;
  restitution?: number;
};

export type BoxColliderOptions = ColliderSurfaceOptions & {
  center?: Vec3;
  halfExtents?: Vec3;
  fitMode?: ColliderFitMode;
};

export type MeshColliderOptions = ColliderSurfaceOptions & {
  meshMode?: ColliderMeshMode;
};

export function createBoxColliderComponent(
  id: string,
  options: BoxColliderOptions = {},
): BoxColliderComponent {
  return {
    id,
    type: "collider",
    enabled: typeof options.enabled === "boolean" ? options.enabled : true,
    shape: "box",
    center: options.center && isFiniteVec3(options.center)
      ? cloneVec3(options.center)
      : [0, 0, 0],
    halfExtents:
      options.halfExtents && isPositiveVec3(options.halfExtents)
        ? cloneVec3(options.halfExtents)
        : [0.5, 0.5, 0.5],
    fitMode:
      options.fitMode && isColliderFitMode(options.fitMode)
        ? options.fitMode
        : "manual",
    isTrigger:
      typeof options.isTrigger === "boolean" ? options.isTrigger : false,
    friction:
      options.friction !== undefined && isValidFriction(options.friction)
        ? options.friction
        : 0.5,
    restitution:
      options.restitution !== undefined &&
      isValidRestitution(options.restitution)
        ? options.restitution
        : 0,
  };
}

export function createMeshColliderComponent(
  id: string,
  options: MeshColliderOptions = {},
): MeshColliderComponent {
  return {
    id,
    type: "collider",
    enabled: typeof options.enabled === "boolean" ? options.enabled : true,
    shape: "mesh",
    fitMode: "auto",
    meshMode:
      options.meshMode && isColliderMeshMode(options.meshMode)
        ? options.meshMode
        : "trimesh",
    isTrigger:
      typeof options.isTrigger === "boolean" ? options.isTrigger : false,
    friction:
      options.friction !== undefined && isValidFriction(options.friction)
        ? options.friction
        : 0.5,
    restitution:
      options.restitution !== undefined &&
      isValidRestitution(options.restitution)
        ? options.restitution
        : 0,
  };
}

export function getPrimaryMaterialAssetId(
  mesh: MeshComponent,
): string | undefined {
  return (
    mesh.materialBindings.find((binding) => binding.slot === "default")
      ?.materialAssetId ?? mesh.materialBindings[0]?.materialAssetId
  );
}

export function getTransform(
  entity: SceneEntity,
  componentId?: string,
): TransformComponent | undefined;
export function getTransform(
  scene: SceneDocument,
  entityId: string,
  componentId?: string,
): TransformComponent | undefined;
export function getTransform(
  entityOrScene: SceneEntity | SceneDocument,
  entityIdOrComponentId?: string,
  componentId?: string,
): TransformComponent | undefined {
  const isScene = "entities" in entityOrScene;
  const entity = isScene
    ? entityIdOrComponentId === undefined
      ? undefined
      : entityOrScene.entities[entityIdOrComponentId]
    : entityOrScene;
  const targetComponentId = isScene ? componentId : entityIdOrComponentId;

  return entity?.components.find(
    (candidate): candidate is TransformComponent =>
      candidate.type === "transform" &&
      (targetComponentId === undefined || candidate.id === targetComponentId),
  );
}

export function getMesh(
  entity: SceneEntity,
  componentId?: string,
): MeshComponent | undefined;
export function getMesh(
  scene: SceneDocument,
  entityId: string,
  componentId?: string,
): MeshComponent | undefined;
export function getMesh(
  entityOrScene: SceneEntity | SceneDocument,
  entityIdOrComponentId?: string,
  componentId?: string,
): MeshComponent | undefined {
  const isScene = "entities" in entityOrScene;
  const entity = isScene
    ? entityIdOrComponentId === undefined
      ? undefined
      : entityOrScene.entities[entityIdOrComponentId]
    : entityOrScene;
  const targetComponentId = isScene ? componentId : entityIdOrComponentId;

  return entity?.components.find(
    (candidate): candidate is MeshComponent =>
      candidate.type === "mesh" &&
      (targetComponentId === undefined || candidate.id === targetComponentId),
  );
}

export function getCollider(
  entity: SceneEntity,
  componentId?: string,
): ColliderComponent | undefined;
export function getCollider(
  scene: SceneDocument,
  entityId: string,
  componentId?: string,
): ColliderComponent | undefined;
export function getCollider(
  entityOrScene: SceneEntity | SceneDocument,
  entityIdOrComponentId?: string,
  componentId?: string,
): ColliderComponent | undefined {
  const isScene = "entities" in entityOrScene;
  const entity = isScene
    ? entityIdOrComponentId === undefined
      ? undefined
      : entityOrScene.entities[entityIdOrComponentId]
    : entityOrScene;
  const targetComponentId = isScene ? componentId : entityIdOrComponentId;

  return entity?.components.find(
    (candidate): candidate is ColliderComponent =>
      candidate.type === "collider" &&
      (targetComponentId === undefined || candidate.id === targetComponentId),
  );
}

export type ColliderAutoFitBounds = {
  center: Vec3;
  halfExtents: Vec3;
};

const MIN_COLLIDER_HALF_EXTENT = 0.0001;

/** Resolves local bounds without baking the Entity Transform into the Collider. */
export function getColliderAutoFitBounds(
  mesh: MeshComponent,
  assets: AssetManifest,
): ColliderAutoFitBounds | null {
  if (mesh.geometry?.kind === "builtin-primitive") {
    return getPrimitiveColliderBounds(mesh.geometry.primitive);
  }

  const assetId =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.assetId
      : mesh.geometryAssetId;
  const geometry = getGeometryAsset(assets, assetId);
  if (geometry?.kind === "primitive") {
    return getPrimitiveColliderBounds(geometry.primitive);
  }
  if (geometry?.kind === "model" && geometry.importMetadata) {
    const scale = geometry.importSettings.scale;
    if (!Number.isFinite(scale) || Math.abs(scale) < MIN_COLLIDER_HALF_EXTENT) {
      return null;
    }
    return colliderBoundsFromMinMax(
      geometry.importMetadata.bounds.min,
      geometry.importMetadata.bounds.max,
      scale,
    );
  }

  const legacyBuiltin = getBuiltinPrimitiveCreation(mesh.geometryAssetId);
  return legacyBuiltin
    ? getPrimitiveColliderBounds(legacyBuiltin.primitive)
    : null;
}

export function fitBoxColliderToMesh(
  collider: BoxColliderComponent,
  mesh: MeshComponent,
  assets: AssetManifest,
): BoxColliderComponent {
  const bounds = getColliderAutoFitBounds(mesh, assets);
  if (!bounds) return collider;
  return {
    ...collider,
    center: cloneVec3(bounds.center),
    halfExtents: cloneVec3(bounds.halfExtents),
    fitMode: "auto",
  };
}

export function autoFitBoxCollider(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const collider = entity
    ? componentId !== undefined
      ? getCollider(entity, componentId)
      : entity.components.find(
          (component): component is BoxColliderComponent =>
            component.type === "collider" && component.shape === "box",
        )
    : undefined;
  const mesh = entity ? getMesh(entity) : undefined;
  if (!entity || !collider || collider.shape !== "box" || !mesh) return scene;
  const fitted = fitBoxColliderToMesh(collider, mesh, assets);
  if (collidersEqual(collider, fitted)) return scene;
  return replaceCollider(scene, entityId, collider.id, fitted);
}

export type ColliderPatch = {
  enabled?: boolean;
  isTrigger?: boolean;
  friction?: number;
  restitution?: number;
  center?: Vec3;
  halfExtents?: Vec3;
  fitMode?: ColliderFitMode;
  meshMode?: ColliderMeshMode;
};

/** Applies a Collider edit atomically; an invalid field rejects the whole patch. */
export function updateColliderComponent(
  scene: SceneDocument,
  entityId: string,
  patch: ColliderPatch,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const current = entity ? getCollider(entity, componentId) : undefined;
  if (!entity || !current) return scene;
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
    return scene;
  }
  if (patch.isTrigger !== undefined && typeof patch.isTrigger !== "boolean") {
    return scene;
  }
  if (patch.friction !== undefined && !isValidFriction(patch.friction)) {
    return scene;
  }
  if (
    patch.restitution !== undefined &&
    !isValidRestitution(patch.restitution)
  ) {
    return scene;
  }
  if (
    patch.fitMode !== undefined &&
    !isColliderFitMode(patch.fitMode)
  ) {
    return scene;
  }
  if (
    patch.meshMode !== undefined &&
    !isColliderMeshMode(patch.meshMode)
  ) {
    return scene;
  }

  const surface = {
    enabled: patch.enabled ?? current.enabled,
    isTrigger: patch.isTrigger ?? current.isTrigger,
    friction: patch.friction ?? current.friction,
    restitution: patch.restitution ?? current.restitution,
  };
  let next: ColliderComponent;
  if (current.shape === "box") {
    if (patch.meshMode !== undefined) return scene;
    if (patch.center !== undefined && !isFiniteVec3(patch.center)) return scene;
    if (
      patch.halfExtents !== undefined &&
      !isPositiveVec3(patch.halfExtents)
    ) {
      return scene;
    }
    next = {
      ...current,
      ...surface,
      center:
        patch.center !== undefined
          ? cloneVec3(patch.center)
          : cloneVec3(current.center),
      halfExtents:
        patch.halfExtents !== undefined
          ? cloneVec3(patch.halfExtents)
          : cloneVec3(current.halfExtents),
      fitMode: patch.fitMode ?? current.fitMode,
    };
  } else {
    if (
      patch.center !== undefined ||
      patch.halfExtents !== undefined ||
      (patch.fitMode !== undefined && patch.fitMode !== "auto")
    ) {
      return scene;
    }
    next = {
      ...current,
      ...surface,
      meshMode: patch.meshMode ?? current.meshMode,
    };
  }
  if (collidersEqual(current, next)) return scene;
  return replaceCollider(scene, entityId, current.id, next);
}

function getPrimitiveColliderBounds(
  primitive: PrimitiveGeometry,
): ColliderAutoFitBounds {
  return primitive === "plane"
    ? { center: [0, 0, 0], halfExtents: [0.5, 0.5, 0.01] }
    : { center: [0, 0, 0], halfExtents: [0.5, 0.5, 0.5] };
}

function colliderBoundsFromMinMax(
  min: Vec3,
  max: Vec3,
  scale: number,
): ColliderAutoFitBounds | null {
  if (!isFiniteVec3(min) || !isFiniteVec3(max)) return null;
  const scaledMin: Vec3 = [min[0] * scale, min[1] * scale, min[2] * scale];
  const scaledMax: Vec3 = [max[0] * scale, max[1] * scale, max[2] * scale];
  const low: Vec3 = [
    Math.min(scaledMin[0], scaledMax[0]),
    Math.min(scaledMin[1], scaledMax[1]),
    Math.min(scaledMin[2], scaledMax[2]),
  ];
  const high: Vec3 = [
    Math.max(scaledMin[0], scaledMax[0]),
    Math.max(scaledMin[1], scaledMax[1]),
    Math.max(scaledMin[2], scaledMax[2]),
  ];
  return {
    center: [
      (low[0] + high[0]) / 2,
      (low[1] + high[1]) / 2,
      (low[2] + high[2]) / 2,
    ],
    halfExtents: [
      Math.max((high[0] - low[0]) / 2, MIN_COLLIDER_HALF_EXTENT),
      Math.max((high[1] - low[1]) / 2, MIN_COLLIDER_HALF_EXTENT),
      Math.max((high[2] - low[2]) / 2, MIN_COLLIDER_HALF_EXTENT),
    ],
  };
}

export function getMeshMaterialSlots(
  mesh: MeshComponent,
  assets: AssetManifest,
): MaterialSlotDefinition[] {
  if (mesh.geometry?.kind === "builtin-primitive") {
    return (
      getBuiltinPrimitiveCreation(mesh.geometry.creationId)?.materialSlots.map(
        (slot) => ({ ...slot }),
      ) ?? []
    );
  }

  const assetId =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.assetId
      : mesh.geometryAssetId;
  const geometry = getGeometryAsset(assets, assetId);
  if (geometry) return getGeometryMaterialSlots(geometry);

  return (
    getBuiltinPrimitiveCreation(mesh.geometryAssetId)?.materialSlots.map(
      (slot) => ({ ...slot }),
    ) ?? []
  );
}

export function setMeshMaterialBinding(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  slot: string,
  materialAssetId: string | null,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const mesh = entity ? getMesh(entity, componentId) : undefined;
  const normalizedSlot = slot.trim();
  if (!entity || !mesh || normalizedSlot.length === 0) return scene;

  const availableSlots = getMeshMaterialSlots(mesh, assets);
  if (!availableSlots.some((candidate) => candidate.slot === normalizedSlot)) {
    return scene;
  }
  if (materialAssetId !== null && !getMaterialAsset(assets, materialAssetId)) {
    return scene;
  }

  const nextBindings = mesh.materialBindings.filter(
    (binding) => binding.slot !== normalizedSlot,
  );
  if (materialAssetId !== null) {
    nextBindings.push({ slot: normalizedSlot, materialAssetId });
  }
  const normalized = orderMaterialBindings(
    normalizeMaterialBindings(nextBindings),
    availableSlots,
  );
  if (materialBindingsEqual(normalized, mesh.materialBindings)) return scene;
  return replaceMesh(scene, entityId, mesh.id, {
    ...mesh,
    materialBindings: normalized,
  });
}

export type MeshShadowPatch = {
  castShadow?: boolean;
  receiveShadow?: boolean;
};

export function updateMeshShadowSettings(
  scene: SceneDocument,
  entityId: string,
  patch: MeshShadowPatch,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const mesh = entity ? getMesh(entity, componentId) : undefined;
  if (!entity || !mesh) return scene;

  const castShadow =
    typeof patch.castShadow === "boolean"
      ? patch.castShadow
      : mesh.castShadow;
  const receiveShadow =
    typeof patch.receiveShadow === "boolean"
      ? patch.receiveShadow
      : mesh.receiveShadow;
  if (
    castShadow === mesh.castShadow &&
    receiveShadow === mesh.receiveShadow
  ) {
    return scene;
  }
  return replaceMesh(scene, entityId, mesh.id, {
    ...mesh,
    castShadow,
    receiveShadow,
  });
}

export function updateMeshGeometryAsset(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  geometryAssetId: string,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const mesh = entity ? getMesh(entity, componentId) : undefined;
  const geometry = getGeometryAsset(assets, geometryAssetId);
  if (!entity || !mesh || !geometry) return scene;

  const slots = getGeometryMaterialSlots(geometry);
  const materialBindings = slots.flatMap((slot) => {
    const current = mesh.materialBindings.find(
      (binding) => binding.slot === slot.slot,
    );
    const materialAssetId =
      current?.materialAssetId ?? slot.defaultMaterialAssetId;
    return materialAssetId && getMaterialAsset(assets, materialAssetId)
      ? [{ slot: slot.slot, materialAssetId }]
      : [];
  });
  return replaceMesh(scene, entityId, mesh.id, {
    ...mesh,
    geometryAssetId,
    geometry: { kind: "asset", assetId: geometryAssetId },
    materialBindings,
  });
}

export type TransformPatch = Partial<
  Pick<TransformComponent, "position" | "rotation" | "scale">
>;

export function updateEntityTransform(
  scene: SceneDocument,
  entityId: string,
  patch: TransformPatch,
  componentId?: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;

  const current = getTransform(entity, componentId);
  if (!current) return scene;

  const position =
    patch.position && isFiniteVec3(patch.position)
      ? cloneVec3(patch.position)
      : cloneVec3(current.position);
  const rotation =
    patch.rotation && isFiniteVec3(patch.rotation)
      ? cloneVec3(patch.rotation)
      : cloneVec3(current.rotation);
  const scale =
    patch.scale && isValidScale(patch.scale)
      ? cloneVec3(patch.scale)
      : cloneVec3(current.scale);

  if (
    vectorsEqual(position, current.position) &&
    vectorsEqual(rotation, current.rotation) &&
    vectorsEqual(scale, current.scale)
  ) {
    return scene;
  }

  const components = entity.components.map((candidate) =>
    candidate.id === current.id && candidate.type === "transform"
      ? { ...candidate, position, rotation, scale }
      : candidate,
  );

  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: { ...entity, components },
    },
  };
}

export type AddBuiltinAssetEntityResult = {
  scene: SceneDocument;
  entityId: string;
};

function getBuiltinPrimitive(
  assets: AssetManifest,
  geometryAssetId: string,
): PrimitiveAsset | undefined {
  const asset = assets.assets[geometryAssetId];
  return asset?.kind === "primitive" && asset.source.kind === "builtin"
    ? asset
    : undefined;
}

function defaultTransformForPrimitive(asset: PrimitiveAsset): {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  if (asset.primitive === "plane") {
    return {
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [6, 6, 6],
    };
  }

  return {
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

export function addBuiltinAssetEntity(
  scene: SceneDocument,
  assets: AssetManifest,
  geometryAssetId: string,
  position?: Vec3,
): AddBuiltinAssetEntityResult | null {
  const geometry = getBuiltinPrimitive(assets, geometryAssetId);
  if (!geometry) return null;

  const material = assets.assets[geometry.defaultMaterialAssetId];
  if (material?.kind !== "material") return null;

  const defaults = defaultTransformForPrimitive(geometry);
  const validPosition =
    position && isFiniteVec3(position) ? position : defaults.position;
  const entityId = createDocumentId("entity");
  const mesh = createMeshComponent(
    createDocumentId("component-mesh"),
    geometry.id,
    [{ slot: "default", materialAssetId: material.id }],
    { castShadow: geometry.primitive !== "plane" },
  );
  const collider = fitBoxColliderToMesh(
    createBoxColliderComponent(createDocumentId("component-collider")),
    mesh,
    assets,
  );
  const entity: SceneEntity = {
    id: entityId,
    name: geometry.name,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        validPosition,
        defaults.rotation,
        defaults.scale,
      ),
      mesh,
      collider,
    ],
  };

  return {
    entityId,
    scene: {
      ...scene,
      rootEntityIds: [...scene.rootEntityIds, entityId],
      entities: { ...scene.entities, [entityId]: entity },
    },
  };
}

export function addBuiltinPrimitiveEntity(
  scene: SceneDocument,
  assets: AssetManifest,
  creationId: string,
  materialAssetId: string,
  position?: Vec3,
): AddBuiltinAssetEntityResult | null {
  const definition = getBuiltinPrimitiveCreation(creationId);
  const material = getMaterialAsset(assets, materialAssetId);
  if (!definition || !material) return null;

  const transform = definition.defaultTransform;
  const entityId = createDocumentId("entity");
  const mesh = createBuiltinPrimitiveMeshComponent(
    createDocumentId("component-mesh"),
    definition,
    [{ slot: "default", materialAssetId: material.id }],
  );
  const collider = fitBoxColliderToMesh(
    createBoxColliderComponent(createDocumentId("component-collider")),
    mesh,
    assets,
  );
  const entity: SceneEntity = {
    id: entityId,
    name: definition.name,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        position && isFiniteVec3(position) ? position : transform.position,
        transform.rotation,
        transform.scale,
      ),
      mesh,
      collider,
    ],
  };

  return {
    entityId,
    scene: {
      ...scene,
      rootEntityIds: [...scene.rootEntityIds, entityId],
      entities: { ...scene.entities, [entityId]: entity },
    },
  };
}

export function renameEntity(
  scene: SceneDocument,
  entityId: string,
  name: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  const normalizedName = name.trim();
  if (!entity || normalizedName.length === 0 || normalizedName === entity.name) {
    return scene;
  }

  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: { ...entity, name: normalizedName },
    },
  };
}

export type DocumentIdGenerator = (
  kind: "entity" | "component",
  sourceId: string,
) => string;

export type ClonedEntityHierarchy = {
  rootEntityIds: string[];
  entities: Record<string, SceneEntity>;
  entityIdMap: Record<string, string>;
  componentIdMap: Record<string, string>;
};

export function cloneEntityHierarchy(
  scene: SceneDocument,
  sourceRootEntityIds: string[],
  generateId: DocumentIdGenerator,
): ClonedEntityHierarchy | null {
  const sourceIds = collectHierarchyEntityIds(scene, sourceRootEntityIds);
  if (sourceIds.length === 0) return null;

  const entityIdMap: Record<string, string> = {};
  const componentIdMap: Record<string, string> = {};
  const usedIds = new Set<string>();
  for (const sourceId of sourceIds) {
    const nextId = generateId("entity", sourceId).trim();
    if (!nextId || usedIds.has(nextId) || scene.entities[nextId]) return null;
    entityIdMap[sourceId] = nextId;
    usedIds.add(nextId);
  }

  const entities: Record<string, SceneEntity> = {};
  for (const sourceId of sourceIds) {
    const source = scene.entities[sourceId];
    const entityId = entityIdMap[sourceId];
    const componentIds = new Set<string>();
    const components: RegisteredSceneComponent[] = [];
    for (const component of source.components) {
      const nextId = generateId("component", component.id).trim();
      if (!nextId || componentIds.has(nextId)) return null;
      componentIds.add(nextId);
      componentIdMap[`${sourceId}/${component.id}`] = nextId;
      components.push(cloneSceneComponent(component, nextId, entityIdMap));
    }
    entities[entityId] = {
      ...source,
      id: entityId,
      parentId: source.parentId ? (entityIdMap[source.parentId] ?? null) : null,
      children: source.children.flatMap((childId) =>
        entityIdMap[childId] ? [entityIdMap[childId]] : [],
      ),
      components,
    };
  }

  return {
    rootEntityIds: sourceRootEntityIds.flatMap((id) =>
      entityIdMap[id] ? [entityIdMap[id]] : [],
    ),
    entities,
    entityIdMap,
    componentIdMap,
  };
}

export function duplicateEntityHierarchy(
  scene: SceneDocument,
  sourceRootEntityIds: string[],
  generateId: DocumentIdGenerator,
  parentId: string | null = null,
): { scene: SceneDocument; clone: ClonedEntityHierarchy } | null {
  if (parentId !== null && !scene.entities[parentId]) return null;
  const clone = cloneEntityHierarchy(scene, sourceRootEntityIds, generateId);
  if (!clone) return null;

  const rootSet = new Set(clone.rootEntityIds);
  const clonedEntities = Object.fromEntries(
    Object.entries(clone.entities).map(([id, entity]) => [
      id,
      rootSet.has(id) ? { ...entity, parentId } : entity,
    ]),
  );
  const entities = { ...scene.entities, ...clonedEntities };
  if (parentId !== null) {
    const parent = entities[parentId];
    entities[parentId] = {
      ...parent,
      children: [...parent.children, ...clone.rootEntityIds],
    };
  }

  return {
    clone: { ...clone, entities: clonedEntities },
    scene: {
      ...scene,
      rootEntityIds:
        parentId === null
          ? [...scene.rootEntityIds, ...clone.rootEntityIds]
          : scene.rootEntityIds,
      entities,
    },
  };
}

function collectHierarchyEntityIds(
  scene: SceneDocument,
  sourceRootEntityIds: string[],
): string[] {
  const collected: string[] = [];
  const visited = new Set<string>();
  const visit = (entityId: string) => {
    if (visited.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    visited.add(entityId);
    collected.push(entityId);
    entity.children.forEach(visit);
  };
  sourceRootEntityIds.forEach(visit);
  return collected;
}

function cloneSceneComponent(
  component: RegisteredSceneComponent,
  id: string,
  entityIdMap: Readonly<Record<string, string>>,
): RegisteredSceneComponent {
  if (component.type === "transform") {
    return {
      ...component,
      id,
      position: cloneVec3(component.position),
      rotation: cloneVec3(component.rotation),
      scale: cloneVec3(component.scale),
    };
  }
  if (component.type === "mesh") {
    return {
      ...component,
      id,
      ...(component.geometry ? { geometry: { ...component.geometry } } : {}),
      materialBindings: component.materialBindings.map((binding) => ({
        ...binding,
      })),
    };
  }
  if (component.type === "collider") {
    return component.shape === "box"
      ? {
          ...component,
          id,
          center: cloneVec3(component.center),
          halfExtents: cloneVec3(component.halfExtents),
        }
      : { ...component, id };
  }
  if (component.type === "xrift-component") {
    return {
      ...component,
      id,
      properties: cloneJsonObject(component.properties),
      assetReferences: [...component.assetReferences],
      entityReferences: component.entityReferences.map(
        (entityId) => entityIdMap[entityId] ?? entityId,
      ),
      ...(component.authoring
        ? {
            authoring: {
              ...component.authoring,
              ...(component.authoring.editablePropertyNames
                ? {
                    editablePropertyNames: [
                      ...component.authoring.editablePropertyNames,
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };
  }
  return { ...component, id };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  );
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (typeof value === "object" && value !== null) return cloneJsonObject(value);
  return value;
}

function replaceMesh(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
  mesh: MeshComponent,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: entity.components.map((component) =>
          component.type === "mesh" && component.id === componentId
            ? mesh
            : component,
        ),
      },
    },
  };
}

function replaceCollider(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
  collider: ColliderComponent,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: entity.components.map((component) =>
          component.type === "collider" && component.id === componentId
            ? collider
            : component,
        ),
      },
    },
  };
}

function collidersEqual(
  left: ColliderComponent,
  right: ColliderComponent,
): boolean {
  if (
    left.shape !== right.shape ||
    left.enabled !== right.enabled ||
    left.isTrigger !== right.isTrigger ||
    left.friction !== right.friction ||
    left.restitution !== right.restitution ||
    left.fitMode !== right.fitMode
  ) {
    return false;
  }
  return left.shape === "box" && right.shape === "box"
    ? vectorsEqual(left.center, right.center) &&
        vectorsEqual(left.halfExtents, right.halfExtents)
    : left.shape === "mesh" &&
        right.shape === "mesh" &&
        left.meshMode === right.meshMode;
}

function normalizeMaterialBindings(
  bindings: MaterialBinding[],
): MaterialBinding[] {
  const bySlot = new Map<string, MaterialBinding>();
  for (const binding of bindings) {
    const slot = binding.slot.trim();
    const materialAssetId = binding.materialAssetId.trim();
    if (!slot || !materialAssetId) continue;
    bySlot.set(slot, { slot, materialAssetId });
  }
  return [...bySlot.values()];
}

function orderMaterialBindings(
  bindings: MaterialBinding[],
  slots: MaterialSlotDefinition[],
): MaterialBinding[] {
  const slotOrder = new Map(slots.map((slot, index) => [slot.slot, index]));
  return [...bindings].sort(
    (left, right) =>
      (slotOrder.get(left.slot) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(right.slot) ?? Number.MAX_SAFE_INTEGER),
  );
}

function materialBindingsEqual(
  left: MaterialBinding[],
  right: MaterialBinding[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (binding, index) =>
        binding.slot === right[index]?.slot &&
        binding.materialAssetId === right[index]?.materialAssetId,
    )
  );
}
