import type {
  MaterialSlotDefinition,
  ModelAsset,
} from "./asset-manifest";
import type { PrefabDocument } from "./prefab-document";
import type {
  MeshComponent,
  SceneDocument,
  SceneEntity,
} from "./scene-document";

export type ModelMaterialSlotDiff = {
  /** Slots whose stable authoring identity survived the source change. */
  retainedSlotIds: string[];
  /** Slots which existed in the last-good Model but not in the new source. */
  removedSlots: MaterialSlotDefinition[];
  /** Slots which were introduced by the new source. */
  addedSlots: MaterialSlotDefinition[];
};

export type ModelMaterialBindingImpact = {
  documentKind: "scene" | "prefab";
  documentId: string;
  documentName: string;
  entityId: string;
  entityName: string;
  componentId: string;
  slot: string;
  materialAssetId: string;
  /** Index in the Mesh component's authoring binding array. */
  bindingIndex: number;
};

export type ModelReimportImpactDocuments = {
  scene: SceneDocument;
  prefabs?: Readonly<Record<string, PrefabDocument>>;
};

export type ModelReimportImpact = {
  modelAssetId: string;
  slotDiff: ModelMaterialSlotDiff;
  /** Explicit Scene / Prefab overrides which point at a removed slot. */
  bindingReferences: ModelMaterialBindingImpact[];
  /** A removed slot needs review even when it has no explicit override. */
  requiresAttention: boolean;
};

export type ModelReimportImpactResolution = {
  scene: SceneDocument;
  prefabs?: Readonly<Record<string, PrefabDocument>>;
  removedBindingCount: number;
};

/**
 * Compares stable authoring slot IDs. Names and source indices may legitimately
 * change during reconciliation without invalidating an existing binding.
 */
export function diffModelMaterialSlots(
  previous: readonly MaterialSlotDefinition[],
  next: readonly MaterialSlotDefinition[],
): ModelMaterialSlotDiff {
  const previousIds = new Set(previous.map((slot) => slot.slot));
  const nextIds = new Set(next.map((slot) => slot.slot));

  return {
    retainedSlotIds: uniqueStrings(
      previous
        .filter((slot) => nextIds.has(slot.slot))
        .map((slot) => slot.slot),
    ),
    removedSlots: previous
      .filter((slot) => !nextIds.has(slot.slot))
      .map(cloneMaterialSlot),
    addedSlots: next
      .filter((slot) => !previousIds.has(slot.slot))
      .map(cloneMaterialSlot),
  };
}

/**
 * Finds every explicit Material override which would target a removed slot.
 * Disabled entities/components are included because enabling them later must
 * not reveal a silently broken authoring reference.
 */
export function collectModelMaterialBindingImpacts(
  modelAssetId: string,
  removedSlotIds: readonly string[],
  documents: ModelReimportImpactDocuments,
): ModelMaterialBindingImpact[] {
  const normalizedModelAssetId = modelAssetId.trim();
  const removed = new Set(removedSlotIds);
  if (!normalizedModelAssetId || removed.size === 0) return [];

  const references: ModelMaterialBindingImpact[] = [];
  collectDocumentBindingImpacts(
    Object.values(documents.scene.entities),
    normalizedModelAssetId,
    removed,
    {
      documentKind: "scene",
      documentId: documents.scene.sceneId,
      documentName: documents.scene.name,
    },
    references,
  );

  const prefabs = Object.values(documents.prefabs ?? {}).sort(
    (left, right) =>
      left.name.localeCompare(right.name, "ja") ||
      left.prefabId.localeCompare(right.prefabId),
  );
  for (const prefab of prefabs) {
    collectDocumentBindingImpacts(
      Object.values(prefab.entities),
      normalizedModelAssetId,
      removed,
      {
        documentKind: "prefab",
        documentId: prefab.prefabId,
        documentName: prefab.name,
      },
      references,
    );
  }

  return references.sort(compareBindingImpacts);
}

/** Pure preflight/result analysis; neither input Asset nor document is changed. */
export function analyzeModelReimportImpact(
  previousModel: ModelAsset,
  nextModel: ModelAsset,
  documents: ModelReimportImpactDocuments,
): ModelReimportImpact {
  const slotDiff = diffModelMaterialSlots(
    previousModel.materialSlots,
    nextModel.materialSlots,
  );
  const bindingReferences = collectModelMaterialBindingImpacts(
    previousModel.id,
    slotDiff.removedSlots.map((slot) => slot.slot),
    documents,
  );

  return {
    modelAssetId: previousModel.id,
    slotDiff,
    bindingReferences,
    requiresAttention: slotDiff.removedSlots.length > 0,
  };
}

/**
 * Removes only bindings that would become invalid after the reviewed Model
 * replacement. The source documents remain untouched and all unrelated
 * Entity, Component and Prefab identities are preserved.
 */
export function removeImpactedModelMaterialBindings(
  documents: ModelReimportImpactDocuments,
  impact: ModelReimportImpact,
): ModelReimportImpactResolution {
  const removedSlots = new Set(
    impact.slotDiff.removedSlots.map((slot) => slot.slot),
  );
  const sceneResult = removeBindingsFromEntities(
    documents.scene.entities,
    impact.modelAssetId,
    removedSlots,
  );
  const scene = sceneResult.changed
    ? { ...documents.scene, entities: sceneResult.entities }
    : documents.scene;

  let removedBindingCount = sceneResult.removedBindingCount;
  let prefabsChanged = false;
  const prefabs = documents.prefabs
    ? { ...documents.prefabs }
    : undefined;
  for (const [prefabId, prefab] of Object.entries(documents.prefabs ?? {})) {
    const result = removeBindingsFromEntities(
      prefab.entities,
      impact.modelAssetId,
      removedSlots,
    );
    removedBindingCount += result.removedBindingCount;
    if (!result.changed || !prefabs) continue;
    prefabsChanged = true;
    prefabs[prefabId] = { ...prefab, entities: result.entities };
  }

  return {
    scene,
    prefabs:
      documents.prefabs === undefined
        ? undefined
        : prefabsChanged
          ? prefabs
          : documents.prefabs,
    removedBindingCount,
  };
}

function removeBindingsFromEntities(
  source: Readonly<Record<string, SceneEntity>>,
  modelAssetId: string,
  removedSlots: ReadonlySet<string>,
): {
  entities: Record<string, SceneEntity>;
  changed: boolean;
  removedBindingCount: number;
} {
  let changed = false;
  let removedBindingCount = 0;
  const entities: Record<string, SceneEntity> = { ...source };
  for (const [entityId, entity] of Object.entries(source)) {
    let entityChanged = false;
    const components = entity.components.map((component) => {
      if (
        component.type !== "mesh" ||
        geometryAssetId(component) !== modelAssetId
      ) {
        return component;
      }
      const materialBindings = component.materialBindings.filter((binding) => {
        const remove = removedSlots.has(binding.slot);
        if (remove) removedBindingCount += 1;
        return !remove;
      });
      if (materialBindings.length === component.materialBindings.length) {
        return component;
      }
      entityChanged = true;
      return { ...component, materialBindings };
    });
    if (!entityChanged) continue;
    changed = true;
    entities[entityId] = { ...entity, components };
  }
  return { entities, changed, removedBindingCount };
}

function collectDocumentBindingImpacts(
  entities: readonly SceneEntity[],
  modelAssetId: string,
  removedSlotIds: ReadonlySet<string>,
  document: Pick<
    ModelMaterialBindingImpact,
    "documentKind" | "documentId" | "documentName"
  >,
  output: ModelMaterialBindingImpact[],
): void {
  for (const entity of entities) {
    for (const component of entity.components) {
      if (
        component.type !== "mesh" ||
        geometryAssetId(component) !== modelAssetId
      ) {
        continue;
      }
      component.materialBindings.forEach((binding, bindingIndex) => {
        if (!removedSlotIds.has(binding.slot)) return;
        output.push({
          ...document,
          entityId: entity.id,
          entityName: entity.name,
          componentId: component.id,
          slot: binding.slot,
          materialAssetId: binding.materialAssetId,
          bindingIndex,
        });
      });
    }
  }
}

function geometryAssetId(component: MeshComponent): string | undefined {
  if (component.geometry) {
    return component.geometry.kind === "asset"
      ? component.geometry.assetId
      : undefined;
  }
  return component.geometryAssetId;
}

function compareBindingImpacts(
  left: ModelMaterialBindingImpact,
  right: ModelMaterialBindingImpact,
): number {
  const documentKindOrder =
    (left.documentKind === "scene" ? 0 : 1) -
    (right.documentKind === "scene" ? 0 : 1);
  return (
    documentKindOrder ||
    left.documentName.localeCompare(right.documentName, "ja") ||
    left.documentId.localeCompare(right.documentId) ||
    left.entityName.localeCompare(right.entityName, "ja") ||
    left.entityId.localeCompare(right.entityId) ||
    left.componentId.localeCompare(right.componentId) ||
    left.bindingIndex - right.bindingIndex ||
    left.slot.localeCompare(right.slot) ||
    left.materialAssetId.localeCompare(right.materialAssetId)
  );
}

function cloneMaterialSlot(
  slot: MaterialSlotDefinition,
): MaterialSlotDefinition {
  return { ...slot };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
