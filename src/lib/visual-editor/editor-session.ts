import type { AssetManifest, SceneAsset } from "./asset-manifest";
import {
  XRIFT_COMPONENT_REGISTRY,
  addXriftComponent,
} from "./component-registry";
import { getBuiltinPrimitiveCreation } from "./creation-catalog";
import { createDocumentId } from "./document-id";
import type { VisualProjectKind } from "./project-document";
import {
  cloneEntityHierarchy,
  createAnimationComponent,
  createAudioSourceComponent,
  createBoxColliderComponent,
  createBuiltinPrimitiveMeshComponent,
  createMeshColliderComponent,
  createMeshComponent,
  createParticleEmitterComponent,
  createTextComponent,
  createTransformComponent,
  fitBoxColliderToMesh,
  getMesh,
  type LightComponent,
  type RegisteredSceneComponent,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

export type EditorComponentCategory =
  | "core"
  | "rendering"
  | "physics"
  | "interaction"
  | "media"
  | "world";

export type EditorComponentDefinition = {
  id: string;
  label: string;
  category: EditorComponentCategory;
  projectKinds: readonly VisualProjectKind[];
  allowMultiple: boolean;
  componentType:
    | RegisteredSceneComponent["type"]
    | "builtin-mesh"
    | "official-xrift";
  schemaId?: string;
  lightType?: LightComponent["lightType"];
};

const BOTH_PROJECT_KINDS = ["world", "item"] as const;

export const EDITOR_COMPONENT_REGISTRY: readonly EditorComponentDefinition[] = [
  definition("core.transform", "Transform", "core", false, "transform"),
  definition("core.mesh", "Mesh Renderer", "rendering", true, "builtin-mesh"),
  definition(
    "physics.box-collider",
    "Box Collider",
    "physics",
    true,
    "collider",
  ),
  definition(
    "physics.mesh-collider",
    "Mesh Collider",
    "physics",
    true,
    "collider",
  ),
  definition("core.light.ambient", "Ambient Light", "rendering", true, "light", {
    lightType: "ambient",
  }),
  definition("core.light.directional", "Directional Light", "rendering", true, "light", {
    lightType: "directional",
  }),
  definition("core.light.hemisphere", "Hemisphere Light", "rendering", true, "light", {
    lightType: "hemisphere",
  }),
  definition("core.light.point", "Point Light", "rendering", true, "light", {
    lightType: "point",
  }),
  definition("core.light.spot", "Spot Light", "rendering", true, "light", {
    lightType: "spot",
  }),
  definition("core.light.area", "Area Light", "rendering", true, "light", {
    lightType: "rectArea",
  }),
  definition("core.spawn", "Spawn Point", "world", false, "spawn-point"),
  definition("core.particle", "Particle Emitter", "rendering", true, "particle-emitter"),
  definition("core.animation", "Animation", "rendering", false, "animation"),
  definition("core.audio-source", "Audio Source", "media", true, "audio-source"),
  definition("core.text", "Text", "rendering", true, "text"),
  ...XRIFT_COMPONENT_REGISTRY.map(
    (component): EditorComponentDefinition => ({
      id: component.schemaId,
      label: component.label,
      category: component.category,
      projectKinds: component.allowedProjectKinds,
      allowMultiple: component.allowMultiplePerEntity,
      componentType: "official-xrift",
      schemaId: component.schemaId,
    }),
  ),
] as const;

/** Components shown by both the Create menu and Hierarchy context menu. */
export function getEditorComponentMenuDefinitions(
  projectKind: VisualProjectKind,
): readonly EditorComponentDefinition[] {
  return EDITOR_COMPONENT_REGISTRY.filter(
    (definition) =>
      definition.componentType !== "official-xrift" &&
      definition.projectKinds.includes(projectKind),
  );
}

export type AddEditorComponentResult = {
  scene: SceneDocument;
  componentId?: string;
  added: boolean;
  reason?: "entity-missing" | "definition-missing" | "project-kind" | "duplicate" | "dependency-missing";
};

export function addEditorComponent(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  definitionId: string,
  projectKind: VisualProjectKind,
): AddEditorComponentResult {
  const entity = scene.entities[entityId];
  if (!entity) return { scene, added: false, reason: "entity-missing" };
  const definition = EDITOR_COMPONENT_REGISTRY.find((candidate) => candidate.id === definitionId);
  if (!definition) return { scene, added: false, reason: "definition-missing" };
  if (!definition.projectKinds.includes(projectKind)) {
    return { scene, added: false, reason: "project-kind" };
  }
  if (!definition.allowMultiple && hasRegisteredComponent(entity, definition)) {
    return { scene, added: false, reason: "duplicate" };
  }

  if (definition.componentType === "official-xrift" && definition.schemaId) {
    const result = addXriftComponent(
      scene,
      entityId,
      definition.schemaId,
      projectKind,
    );
    return result.changed
      ? { scene: result.scene, componentId: result.componentId, added: true }
      : {
          scene,
          added: false,
          reason: result.diagnostics.some(
            (diagnostic) => diagnostic.code === "xrift-component-project-kind",
          )
            ? "project-kind"
            : result.diagnostics.some(
                  (diagnostic) => diagnostic.code === "duplicate-xrift-component",
                )
              ? "duplicate"
              : "dependency-missing",
        };
  }

  const componentId = createDocumentId("component");
  const component = createRegisteredComponent(
    definition,
    componentId,
    assets,
    projectKind,
    entity,
  );
  if (!component) return { scene, added: false, reason: "dependency-missing" };
  const components = [
    ...(entity.components as RegisteredSceneComponent[]),
    component,
  ] as SceneComponent[];
  return {
    added: true,
    componentId,
    scene: {
      ...scene,
      entities: {
        ...scene.entities,
        [entityId]: { ...entity, components },
      },
    },
  };
}

export type CreateEmptyEntityResult = {
  scene: SceneDocument;
  entityId: string;
};

/** Creates a transform-only Entity at Scene root or under an existing parent. */
export function createEmptyEntity(
  scene: SceneDocument,
  parentId: string | null = null,
  requestedName = "Empty Entity",
): CreateEmptyEntityResult | null {
  if (parentId !== null && !scene.entities[parentId]) return null;

  const baseName = requestedName.trim() || "Empty Entity";
  const existingNames = new Set(
    Object.values(scene.entities).map((entity) =>
      entity.name.toLocaleLowerCase(),
    ),
  );
  let name = baseName;
  let suffix = 2;
  while (existingNames.has(name.toLocaleLowerCase())) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }

  const entityId = createDocumentId("entity");
  const entity: SceneEntity = {
    id: entityId,
    name,
    parentId,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(createDocumentId("component-transform")),
    ],
  };
  const parent = parentId ? scene.entities[parentId] : undefined;

  return {
    entityId,
    scene: {
      ...scene,
      rootEntityIds: parentId
        ? scene.rootEntityIds
        : [...scene.rootEntityIds, entityId],
      entities: {
        ...scene.entities,
        ...(parent
          ? {
              [parent.id]: {
                ...parent,
                children: [...parent.children, entityId],
              },
            }
          : {}),
        [entityId]: entity,
      },
    },
  };
}

export type EntityClipboard = {
  scene: SceneDocument;
  rootEntityIds: string[];
};

export function copyEntityHierarchy(
  scene: SceneDocument,
  rootEntityIds: string[],
): EntityClipboard | null {
  const validRoots = rootEntityIds.filter((id) => Boolean(scene.entities[id]));
  return validRoots.length > 0 ? { scene, rootEntityIds: validRoots } : null;
}

export function pasteEntityHierarchy(
  scene: SceneDocument,
  clipboard: EntityClipboard,
  parentId: string | null,
): { scene: SceneDocument; rootEntityIds: string[] } | null {
  if (parentId !== null && !scene.entities[parentId]) return null;
  const clone = cloneEntityHierarchy(
    clipboard.scene,
    clipboard.rootEntityIds,
    (kind) => createDocumentId(kind),
  );
  if (!clone) return null;
  const rootSet = new Set(clone.rootEntityIds);
  const clonedEntities = Object.fromEntries(
    Object.entries(clone.entities).map(([id, entity]) => [
      id,
      rootSet.has(id) ? { ...entity, parentId } : entity,
    ]),
  );
  const entities = { ...scene.entities, ...clonedEntities };
  if (parentId) {
    const parent = entities[parentId];
    entities[parentId] = {
      ...parent,
      children: [...parent.children, ...clone.rootEntityIds],
    };
  }
  return {
    rootEntityIds: clone.rootEntityIds,
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

export function deleteEntityHierarchy(
  scene: SceneDocument,
  rootEntityIds: string[],
): SceneDocument {
  const removed = new Set<string>();
  const visit = (entityId: string) => {
    if (removed.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    removed.add(entityId);
    entity.children.forEach(visit);
  };
  rootEntityIds.forEach(visit);
  if (removed.size === 0) return scene;
  const entities = Object.fromEntries(
    Object.entries(scene.entities)
      .filter(([id]) => !removed.has(id))
      .map(([id, entity]) => [
        id,
        {
          ...entity,
          children: entity.children.filter((childId) => !removed.has(childId)),
        },
      ]),
  );
  return {
    ...scene,
    rootEntityIds: scene.rootEntityIds.filter((id) => !removed.has(id)),
    entities,
  };
}

export type EntityReparentBlockReason =
  | "entity-missing"
  | "parent-missing"
  | "same-entity"
  | "descendant-parent"
  | "unchanged-parent"
  | "unchanged-order";

export type EntityReparentDecision =
  | { allowed: true }
  | { allowed: false; reason: EntityReparentBlockReason };

/**
 * Checks a Hierarchy move without mutating the document. Keeping this check in
 * the Scene layer lets every command surface share the same cycle and no-op
 * rules instead of relying on drag state from the panel.
 */
export function getEntityReparentDecision(
  scene: SceneDocument,
  entityId: string,
  parentEntityId: string | null,
  siblingIndex?: number,
): EntityReparentDecision {
  const entity = scene.entities[entityId];
  if (!entity) return { allowed: false, reason: "entity-missing" };
  if (parentEntityId !== null && !scene.entities[parentEntityId]) {
    return { allowed: false, reason: "parent-missing" };
  }
  if (parentEntityId === entityId) {
    return { allowed: false, reason: "same-entity" };
  }
  if (
    parentEntityId !== null &&
    wouldCreateEntityHierarchyCycle(scene, entityId, parentEntityId)
  ) {
    return { allowed: false, reason: "descendant-parent" };
  }
  if (entity.parentId === parentEntityId) {
    if (siblingIndex === undefined) {
      return { allowed: false, reason: "unchanged-parent" };
    }
    const siblings = getHierarchySiblings(scene, parentEntityId);
    const reordered = insertHierarchyEntity(siblings, entityId, siblingIndex);
    if (
      reordered.length === siblings.length &&
      reordered.every((candidateId, index) => candidateId === siblings[index])
    ) {
      return { allowed: false, reason: "unchanged-order" };
    }
  }
  return { allowed: true };
}

/**
 * Moves one Entity subtree below another Entity, or back to the Scene root.
 * The subtree itself is kept intact and the source Entity ID is preserved so
 * selection and Undo/Redo can restore the exact same authoring state.
 */
export function reparentEntityHierarchy(
  scene: SceneDocument,
  entityId: string,
  parentEntityId: string | null,
  siblingIndex?: number,
): SceneDocument {
  const decision = getEntityReparentDecision(
    scene,
    entityId,
    parentEntityId,
    siblingIndex,
  );
  if (!decision.allowed) return scene;

  const source = scene.entities[entityId];
  const entities: Record<string, SceneEntity> = { ...scene.entities };

  // A valid document has exactly one incoming hierarchy link. Removing every
  // stale incoming link here also prevents a move from creating two parents if
  // an older document was authored before strict hierarchy validation.
  for (const [candidateId, candidate] of Object.entries(scene.entities)) {
    if (!candidate.children.includes(entityId)) continue;
    entities[candidateId] = {
      ...candidate,
      children: candidate.children.filter((childId) => childId !== entityId),
    };
  }

  entities[entityId] = { ...source, parentId: parentEntityId };
  let rootEntityIds = scene.rootEntityIds.filter(
    (rootId) => rootId !== entityId,
  );
  if (parentEntityId !== null) {
    const parent = entities[parentEntityId];
    entities[parentEntityId] = {
      ...parent,
      children: insertHierarchyEntity(
        parent.children,
        entityId,
        siblingIndex,
      ),
    };
  } else {
    rootEntityIds = insertHierarchyEntity(
      rootEntityIds,
      entityId,
      siblingIndex,
    );
  }

  return {
    ...scene,
    rootEntityIds,
    entities,
  };
}

function getHierarchySiblings(
  scene: SceneDocument,
  parentEntityId: string | null,
): readonly string[] {
  return parentEntityId === null
    ? scene.rootEntityIds
    : scene.entities[parentEntityId]?.children ?? [];
}

function insertHierarchyEntity(
  siblings: readonly string[],
  entityId: string,
  siblingIndex?: number,
): string[] {
  const withoutEntity = siblings.filter((candidateId) => candidateId !== entityId);
  const requestedIndex =
    typeof siblingIndex === "number" && Number.isFinite(siblingIndex)
      ? siblingIndex
      : withoutEntity.length;
  const insertIndex = Math.max(
    0,
    Math.min(withoutEntity.length, Math.trunc(requestedIndex)),
  );
  return [
    ...withoutEntity.slice(0, insertIndex),
    entityId,
    ...withoutEntity.slice(insertIndex),
  ];
}

export function updateEntityEnabled(
  scene: SceneDocument,
  entityId: string,
  enabled: boolean,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity || entity.enabled === enabled) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: { ...entity, enabled },
    },
  };
}

export function renameAsset(
  manifest: AssetManifest,
  assetId: string,
  name: string,
): AssetManifest {
  const asset = manifest.assets[assetId];
  const normalized = name.trim();
  if (!asset || !normalized || normalized.length > 100 || asset.name === normalized) {
    return manifest;
  }
  const renamed: SceneAsset = { ...asset, name: normalized };
  return {
    ...manifest,
    assets: { ...manifest.assets, [assetId]: renamed },
  };
}

/**
 * Valid Editor documents maintain matching parentId and children links. During
 * dragover, following the proposed parent's ancestor chain is O(depth), while
 * walking the dragged subtree is O(all descendants) on every pointer event.
 * Retain the slower child-link check only for legacy/corrupt documents whose
 * parent chain is not internally consistent.
 */
const ENTITY_HIERARCHY_CONSISTENCY_CACHE = new WeakMap<
  SceneDocument,
  boolean
>();

function entityHierarchyLinksAreConsistent(scene: SceneDocument): boolean {
  const cached = ENTITY_HIERARCHY_CONSISTENCY_CACHE.get(scene);
  if (cached !== undefined) return cached;

  let consistent = true;
  const linkedParentByChild = new Map<string, string>();
  for (const parent of Object.values(scene.entities)) {
    for (const childId of parent.children) {
      if (
        linkedParentByChild.has(childId) ||
        scene.entities[childId]?.parentId !== parent.id
      ) {
        consistent = false;
        break;
      }
      linkedParentByChild.set(childId, parent.id);
    }
    if (!consistent) break;
  }
  if (consistent) {
    for (const entity of Object.values(scene.entities)) {
      const linkedParentId = linkedParentByChild.get(entity.id);
      if (
        (entity.parentId === null && linkedParentId !== undefined) ||
        (entity.parentId !== null && linkedParentId !== entity.parentId)
      ) {
        consistent = false;
        break;
      }
    }
  }

  ENTITY_HIERARCHY_CONSISTENCY_CACHE.set(scene, consistent);
  return consistent;
}

function wouldCreateEntityHierarchyCycle(
  scene: SceneDocument,
  ancestorId: string,
  entityId: string,
): boolean {
  const visited = new Set<string>();
  let currentId: string | null = entityId;
  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    // Do not attach a subtree below an already cyclic parent chain.
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = scene.entities[currentId]?.parentId ?? null;
  }
  // Valid immutable documents use the O(depth) parent-chain check above. Cache
  // the full bidirectional-link scan so repeated dragover events stay cheap.
  if (entityHierarchyLinksAreConsistent(scene)) return false;

  const descendants = new Set<string>();
  const pending = [...(scene.entities[ancestorId]?.children ?? [])];
  while (pending.length > 0) {
    const candidateId = pending.pop();
    if (!candidateId || descendants.has(candidateId)) continue;
    descendants.add(candidateId);
    pending.push(...(scene.entities[candidateId]?.children ?? []));
  }
  return descendants.has(entityId);
}

function definition(
  id: string,
  label: string,
  category: EditorComponentCategory,
  allowMultiple: boolean,
  componentType: EditorComponentDefinition["componentType"],
  options: Pick<EditorComponentDefinition, "lightType"> = {},
): EditorComponentDefinition {
  return {
    id,
    label,
    category,
    allowMultiple,
    componentType,
    projectKinds: BOTH_PROJECT_KINDS,
    ...options,
  };
}

function hasRegisteredComponent(
  entity: SceneEntity,
  definition: EditorComponentDefinition,
): boolean {
  return (entity.components as RegisteredSceneComponent[]).some((component) => {
    if (definition.componentType === "builtin-mesh") return component.type === "mesh";
    if (definition.componentType === "official-xrift") {
      return component.type === "xrift-component" && component.schemaId === definition.schemaId;
    }
    return component.type === definition.componentType;
  });
}

function createRegisteredComponent(
  definition: EditorComponentDefinition,
  id: string,
  assets: AssetManifest,
  projectKind: VisualProjectKind,
  entity: SceneEntity,
): RegisteredSceneComponent | null {
  if (definition.componentType === "transform") return createTransformComponent(id);
  if (definition.componentType === "builtin-mesh") {
    const geometry = Object.values(assets.assets).find((asset) => asset.kind === "primitive");
    const material = Object.values(assets.assets).find((asset) => asset.kind === "material");
    if (!material) return null;
    if (geometry) {
      return createMeshComponent(
        id,
        geometry.id,
        [{ slot: "default", materialAssetId: material.id }],
      );
    }
    const builtin = getBuiltinPrimitiveCreation("builtin-primitive/box");
    return builtin
      ? createBuiltinPrimitiveMeshComponent(
          id,
          builtin,
          [{ slot: "default", materialAssetId: material.id }],
        )
      : null;
  }
  if (definition.id === "physics.box-collider") {
    const collider = createBoxColliderComponent(id);
    const mesh = getMesh(entity);
    return mesh ? fitBoxColliderToMesh(collider, mesh, assets) : collider;
  }
  if (definition.id === "physics.mesh-collider") {
    return getMesh(entity) ? createMeshColliderComponent(id) : null;
  }
  if (definition.componentType === "light") {
    const lightType = definition.lightType ?? "point";
    return {
      id,
      type: "light",
      enabled: true,
      lightType,
      color: "#ffffff",
      intensity: lightType === "ambient" || lightType === "hemisphere" ? 0.6 : 1,
      castShadow: lightType === "directional" || lightType === "point" || lightType === "spot",
      ...(lightType === "hemisphere" ? { groundColor: "#334155" } : {}),
      ...(lightType === "point" || lightType === "spot"
        ? { distance: 0, decay: 2 }
        : {}),
      ...(lightType === "spot"
        ? { angle: Math.PI / 3, penumbra: 0.5 }
        : {}),
      ...(lightType === "rectArea" ? { width: 1, height: 1 } : {}),
    };
  }
  if (definition.componentType === "spawn-point") {
    return {
      id,
      type: "spawn-point",
      enabled: true,
      target: projectKind === "world" ? "player" : "item-preview",
    };
  }
  if (definition.componentType === "particle-emitter") {
    const particle = Object.values(assets.assets).find((asset) => asset.kind === "particle");
    return particle ? createParticleEmitterComponent(id, particle.id) : null;
  }
  if (definition.componentType === "animation") {
    return entityHasImportedAnimation(entity, assets)
      ? createAnimationComponent(id)
      : null;
  }
  if (definition.componentType === "audio-source") {
    const audio = Object.values(assets.assets).find(
      (asset) => asset.kind === "audio",
    );
    return createAudioSourceComponent(id, audio?.id ?? "");
  }
  if (definition.componentType === "text") {
    return createTextComponent(id);
  }
  return null;
}

function entityHasImportedAnimation(
  entity: SceneEntity,
  assets: AssetManifest,
): boolean {
  return entity.components.some((component) => {
    if (component.type !== "mesh") return false;
    const assetId =
      component.geometry?.kind === "asset"
        ? component.geometry.assetId
        : component.geometryAssetId;
    const asset = assets.assets[assetId];
    return (
      asset?.kind === "model" &&
      asset.importSettings.importAnimations &&
      Boolean(asset.importMetadata?.animations.length)
    );
  });
}
