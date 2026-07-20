import {
  DEFAULT_MODEL_IMPORT_SETTINGS,
  type MaterialSlotDefinition,
  type ModelAsset,
} from "./asset-manifest";
import {
  analyzeModelReimportImpact,
  collectModelMaterialBindingImpacts,
  diffModelMaterialSlots,
  removeImpactedModelMaterialBindings,
} from "./model-reimport-impact";
import {
  PREFAB_DOCUMENT_SCHEMA_VERSION,
  type PrefabDocument,
} from "./prefab-document";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type MeshComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

/** Filesystem-free checks for destructive Model reimport slot changes. */
export function runModelReimportImpactFixtureAssertions(): void {
  const previous = modelAsset("model-building", [
    slot("body", "Body", 0, "material-body"),
    slot("glass", "Glass", 1, "material-glass"),
    slot("decal", "Decal", 2),
  ]);
  const next = modelAsset("model-building", [
    slot("body", "Renamed Body", 2, "material-body"),
    slot("trim", "Trim", 3),
  ]);
  const scene = sceneDocument();
  const prefab = prefabDocument();
  const previousSnapshot = JSON.stringify(previous);
  const nextSnapshot = JSON.stringify(next);
  const sceneSnapshot = JSON.stringify(scene);
  const prefabSnapshot = JSON.stringify(prefab);

  const diff = diffModelMaterialSlots(
    previous.materialSlots,
    next.materialSlots,
  );
  assert(
    diff.retainedSlotIds.join(",") === "body",
    "Stable retained slot identity was not recognized",
  );
  assert(
    diff.removedSlots.map((candidate) => candidate.slot).join(",") ===
      "glass,decal",
    "Removed slots did not preserve the previous authoring order",
  );
  assert(
    diff.addedSlots.map((candidate) => candidate.slot).join(",") === "trim",
    "Added slot was not reported",
  );
  assert(
    diff.removedSlots[0] !== previous.materialSlots[1],
    "Slot diff exposed a mutable input object",
  );

  const impact = analyzeModelReimportImpact(previous, next, {
    scene,
    prefabs: { [prefab.prefabId]: prefab },
  });
  assert(impact.requiresAttention, "Removed slots were not marked for review");
  assert(
    impact.bindingReferences.length === 3,
    "Scene and Prefab overrides for removed slots were not all reported",
  );
  assert(
    impact.bindingReferences
      .map(
        (reference) =>
          `${reference.documentKind}:${reference.entityName}:${reference.slot}`,
      )
      .join("|") ===
      "scene:Building:glass|scene:Legacy Sign:decal|prefab:Window Module:glass",
    "Impact references were incomplete or not deterministically ordered",
  );
  assert(
    impact.bindingReferences[0].materialAssetId === "material-glass",
    "Impact did not preserve the currently assigned Material ID",
  );
  assert(
    impact.bindingReferences[1].componentId === "mesh-legacy-sign",
    "Deprecated geometry reference was not included",
  );

  const resolution = removeImpactedModelMaterialBindings(
    { scene, prefabs: { [prefab.prefabId]: prefab } },
    impact,
  );
  assert(
    resolution.removedBindingCount === 3,
    "Impact resolution did not remove every invalid override",
  );
  assert(
    resolution.scene.entities["entity-building"].components.some(
      (component) =>
        component.type === "mesh" &&
        component.materialBindings.length === 1 &&
        component.materialBindings[0]?.slot === "body",
    ),
    "Impact resolution removed a retained Scene binding",
  );
  assert(
    resolution.prefabs?.[prefab.prefabId].entities[
      "prefab-window"
    ].components.some(
      (component) =>
        component.type === "mesh" &&
        component.materialBindings.length === 1 &&
        component.materialBindings[0]?.slot === "body",
    ),
    "Impact resolution did not preserve the retained Prefab binding",
  );

  const direct = collectModelMaterialBindingImpacts(
    previous.id,
    ["glass"],
    { scene, prefabs: { [prefab.prefabId]: prefab } },
  );
  assert(
    direct.length === 2 &&
      direct.every((reference) => reference.slot === "glass"),
    "Direct slot reference collection did not respect its slot filter",
  );

  const unchanged = analyzeModelReimportImpact(previous, {
    ...previous,
    materialSlots: previous.materialSlots.map((candidate) => ({
      ...candidate,
      name: `Updated ${candidate.name}`,
    })),
  }, { scene, prefabs: {} });
  assert(
    !unchanged.requiresAttention && unchanged.bindingReferences.length === 0,
    "A name-only source change was treated as a destructive slot change",
  );

  assert(JSON.stringify(previous) === previousSnapshot, "Previous Model was mutated");
  assert(JSON.stringify(next) === nextSnapshot, "Next Model was mutated");
  assert(JSON.stringify(scene) === sceneSnapshot, "Scene was mutated");
  assert(JSON.stringify(prefab) === prefabSnapshot, "Prefab was mutated");
}

function modelAsset(
  id: string,
  materialSlots: MaterialSlotDefinition[],
): ModelAsset {
  return {
    id,
    name: "Building",
    kind: "model",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/imported/models/building.glb",
    },
    sourceHash: "a".repeat(64),
    importSettings: { ...DEFAULT_MODEL_IMPORT_SETTINGS },
    materialSlots,
  };
}

function slot(
  id: string,
  name: string,
  sourceMaterialIndex: number,
  defaultMaterialAssetId?: string,
): MaterialSlotDefinition {
  return {
    slot: id,
    name,
    sourceMaterialIndex,
    ...(defaultMaterialAssetId ? { defaultMaterialAssetId } : {}),
  };
}

function sceneDocument(): SceneDocument {
  const building = entity(
    "entity-building",
    "Building",
    mesh("mesh-building", "model-building", [
      { slot: "body", materialAssetId: "material-body" },
      { slot: "glass", materialAssetId: "material-glass" },
    ]),
  );
  const legacySign = entity(
    "entity-sign",
    "Legacy Sign",
    mesh("mesh-legacy-sign", "model-building", [
      { slot: "decal", materialAssetId: "material-decal" },
    ], false),
  );
  const otherModel = entity(
    "entity-other",
    "Other Model",
    mesh("mesh-other", "model-other", [
      { slot: "glass", materialAssetId: "material-glass" },
    ]),
  );
  const builtin = entity(
    "entity-builtin",
    "Builtin Box",
    {
      ...mesh("mesh-builtin", "model-building", [
        { slot: "glass", materialAssetId: "material-glass" },
      ]),
      geometry: {
        kind: "builtin-primitive",
        creationId: "primitive-box",
        primitive: "box",
      },
    },
  );
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-main",
    name: "Main Scene",
    rootEntityIds: [building.id, legacySign.id, otherModel.id, builtin.id],
    entities: {
      [legacySign.id]: legacySign,
      [otherModel.id]: otherModel,
      [building.id]: building,
      [builtin.id]: builtin,
    },
  };
}

function prefabDocument(): PrefabDocument {
  const window = entity(
    "prefab-window",
    "Window Module",
    mesh("prefab-window-mesh", "model-building", [
      { slot: "glass", materialAssetId: "material-prefab-glass" },
      { slot: "body", materialAssetId: "material-prefab-body" },
    ]),
  );
  return {
    schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
    prefabId: "prefab-building-window",
    name: "Building Window",
    source: { sceneId: "scene-main", rootEntityIds: ["entity-building"] },
    rootEntityIds: [window.id],
    entities: { [window.id]: window },
  };
}

function entity(
  id: string,
  name: string,
  meshComponent: MeshComponent,
): SceneEntity {
  return {
    id,
    name,
    parentId: null,
    children: [],
    enabled: true,
    components: [meshComponent],
  };
}

function mesh(
  id: string,
  modelAssetId: string,
  materialBindings: MeshComponent["materialBindings"],
  canonicalGeometry = true,
): MeshComponent {
  return {
    id,
    type: "mesh",
    enabled: true,
    geometryAssetId: modelAssetId,
    ...(canonicalGeometry
      ? { geometry: { kind: "asset" as const, assetId: modelAssetId } }
      : {}),
    materialBindings,
    castShadow: true,
    receiveShadow: true,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
