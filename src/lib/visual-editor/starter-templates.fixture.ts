import { getPrefabAssetDocumentReference } from "./compiler/prefab-resolver";
import { compileVisualProject } from "./compiler/compile";
import { serializeVisualProjectDocuments } from "./persistence";
import { updatePrefabDocumentFromSource } from "./prefab-document";
import {
  createTransformComponent,
  type RegisteredSceneComponent,
} from "./scene-document";
import {
  STARTER_ASSET_FOLDER_IDS,
  STARTER_WORLD_TEMPLATES,
  createStarterWorldProject,
  defaultVisualStarterTemplateId,
  starterWorldContainsNoPrimitiveAssets,
  type StarterWorldTemplateId,
} from "./starter-templates";

/**
 * Per-template library expectations. Adding a starter means adding a row here,
 * which keeps the assertions below readable instead of a chain of ternaries.
 */
const STARTER_LIBRARY_EXPECTATIONS: Record<
  StarterWorldTemplateId,
  {
    bundledAssetCopies: number;
    models: number;
    textures: number;
    /** Exact count, or a lower bound for the converted official library. */
    materials: number | { atLeast: number };
  }
> = {
  "xrift-official": {
    bundledAssetCopies: 5,
    models: 2,
    textures: 1,
    materials: { atLeast: 7 },
  },
  blank: { bundledAssetCopies: 0, models: 0, textures: 0, materials: 1 },
};

/** Deterministic, filesystem-free assertions for the bundled world starters. */
export function runStarterTemplateFixtureAssertions(): void {
  assert(
    defaultVisualStarterTemplateId("world") === "xrift-official",
    "The official XRift sample must be the default World starter",
  );

  const availableStarterTemplateIds: readonly StarterWorldTemplateId[] =
    STARTER_WORLD_TEMPLATES.map((template) => template.id);
  for (const templateId of availableStarterTemplateIds) {
    const plan = createStarterWorldProject(templateId, "fixture-world");
    const assets = Object.values(plan.assets.assets);
    const modelAssets = assets.filter((asset) => asset.kind === "model");
    const textureAssets = assets.filter((asset) => asset.kind === "texture");
    const particleAssets = assets.filter((asset) => asset.kind === "particle");
    const materialAssets = assets.filter(
      (asset) =>
        asset.kind === "material" &&
        asset.folderId === STARTER_ASSET_FOLDER_IDS.materials,
    );
    const prefabAssets = assets.filter(
      (asset) => asset.kind === "template" && asset.templateType === "prefab",
    );

    const expected = STARTER_LIBRARY_EXPECTATIONS[templateId];
    assert(
      plan.bundledAssetCopies.length === expected.bundledAssetCopies,
      `${templateId}: bundled source copy plan is incorrect`,
    );
    if (templateId === "xrift-official") {
      assert(
        plan.bundledAssetCopies.some(
          (copy) =>
            copy.assetId === "xrift-world-template-source" &&
            copy.integrity === "strict",
        ) &&
          plan.bundledAssetCopies.some(
            (copy) =>
              copy.assetId === "xrift-world-template-license" &&
              copy.integrity === "strict",
          ),
        "xrift-official: source and MIT license must retain strict verification",
      );
    }
    assert(
      modelAssets.length === expected.models,
      `${templateId}: Model library is incorrect`,
    );
    assert(
      textureAssets.length === expected.textures,
      `${templateId}: Texture library is incorrect`,
    );
    assert(
      textureAssets.every(
        (asset) => asset.kind === "texture" && asset.importSettings.flipY,
      ),
      `${templateId}: bundled direct-load Textures must render upright`,
    );
    assert(
      particleAssets.length === 0,
      `${templateId}: Particle library is incorrect`,
    );
    assert(
      typeof expected.materials === "number"
        ? materialAssets.length === expected.materials
        : materialAssets.length >= expected.materials.atLeast,
      `${templateId}: converted Material library is incorrect`,
    );
    assert(prefabAssets.length > 0, `${templateId}: Prefab library is empty`);
    assert(starterWorldContainsNoPrimitiveAssets(plan),
      `${templateId}: primitives must stay in the Create catalog`);

    const spawn = Object.values(plan.scene.entities).find((entity) =>
      entity.components.some(
        (component) =>
          component.type === "xrift-component" &&
          component.schemaId === "xrift.spawn-point",
      ),
    );
    const spawnComponent = spawn?.components.find(
      (component) => component.type === "xrift-component",
    );
    assert(spawnComponent?.type === "xrift-component",
      `${templateId}: Spawn Point must use the XRift component registry`);
    assert(spawnComponent?.schemaId === "xrift.spawn-point",
      `${templateId}: Spawn Point schema is incorrect`);
    if (templateId !== "xrift-official") {
      assert(spawnComponent?.authoring?.source === "builtin-prefab" &&
        spawnComponent.authoring.readOnly,
        `${templateId}: Spawn Point source must stay read-only`);
    }
    assert(!spawn?.components.some((component) => component.type === "spawn-point"),
      `${templateId}: legacy SpawnPoint component must not be emitted`);

    for (const asset of prefabAssets) {
      const reference = getPrefabAssetDocumentReference(asset);
      assert(reference !== null, `${templateId}: Prefab path is invalid: ${asset.id}`);
      const prefab = reference ? plan.prefabs[reference.prefabId] : undefined;
      assert(prefab !== undefined, `${templateId}: Prefab document is missing: ${asset.id}`);
      if (!prefab) continue;
      assert(prefab.source.sceneId === plan.scene.sceneId,
        `${templateId}: Prefab source Scene is unstable`);
      assert(prefab.source.rootEntityIds.every((entityId) => Boolean(plan.scene.entities[entityId])),
        `${templateId}: Prefab source Entity is missing`);
      assertPrefabAssetReferencesExist(
        Object.values(prefab.entities).flatMap((entity) => entity.components),
        new Set(Object.keys(plan.assets.assets)),
        templateId,
      );
    }

    const documents = {
      project: plan.project,
      scenes: { [plan.scene.sceneId]: plan.scene },
      assets: plan.assets,
      prefabs: plan.prefabs,
    };
    const result = compileVisualProject(
      documents,
      {
        generatedAt: "2026-01-01T00:00:00.000Z",
        outputMode: "classic-runtime",
      },
    );
    assert(
      result.canStage,
      `${templateId}: Starter World must compile for staging: ${result.diagnostics
        .filter((diagnostic) => diagnostic.severity === "blocking")
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.message}`)
        .join(" / ")}`,
    );
    assert(
      !result.diagnostics.some(
        (diagnostic) => diagnostic.severity === "blocking",
      ),
      `${templateId}: Starter World has a blocking diagnostic`,
    );
    assert(
      JSON.stringify(result.stagingPlan.runtimePackageSpecs) ===
        JSON.stringify(["xrift-studio-runtime@0.1.0"]),
      `${templateId}: compiler runtime package plan is incorrect`,
    );
    if (templateId !== "xrift-official") {
      assert(
        Object.values(plan.scene.entities).filter((entity) =>
          entity.components.some((component) => component.type === "light"),
        ).length === 1,
        `${templateId}: Starter World must use one main light`,
      );
    }
    if (templateId === "xrift-official") {
      const sceneEntities = Object.values(plan.scene.entities);
      assert(
        sceneEntities.filter((entity) =>
          entity.components.some((component) => component.type === "light"),
        ).length === 5,
        "Official XRift starter must preserve lights across the source module graph",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.components.some((component) => component.type === "rigid-body"),
        ).length === 23,
        "Official XRift starter must preserve Rapier parent-body coverage",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.components.some(
            (component) =>
              component.type === "rigid-body" && component.bodyType === "dynamic",
          ),
        ).length >= 2,
        "Official XRift starter must preserve dynamic Rapier rigid bodies",
      );
      const worldRootId = plan.scene.rootEntityIds[0];
      const worldRoot = worldRootId ? plan.scene.entities[worldRootId] : undefined;
      assert(
        plan.scene.rootEntityIds.length === 1 &&
          worldRoot?.name === "World" &&
          spawn?.parentId !== null,
        "Official XRift starter must retain the JSX World hierarchy instead of flattening roots",
      );
      const duckAsset = modelAssets.find((asset) => asset.name === "Duck");
      const bunnyAsset = modelAssets.find((asset) => asset.name === "Draco Bunny");
      const panoramaAsset = textureAssets.find(
        (asset) => asset.name === "Tokyo Station Panorama",
      );
      const duckEntity = sceneEntities.find((entity) => entity.name === "Duck Model");
      const bunnyEntity = sceneEntities.find((entity) => entity.name === "Draco Sample");
      const modelReference = (entity: (typeof sceneEntities)[number] | undefined) =>
        entity?.components.find(
          (component) =>
            component.type === "mesh" && component.geometry?.kind === "asset",
        );
      const duckMesh = modelReference(duckEntity);
      const bunnyMesh = modelReference(bunnyEntity);
      assert(
        duckAsset?.kind === "model" &&
          bunnyAsset?.kind === "model" &&
          panoramaAsset?.kind === "texture" &&
          duckMesh?.type === "mesh" &&
          duckMesh.geometry?.kind === "asset" &&
          duckMesh.geometry.assetId === duckAsset.id &&
          bunnyMesh?.type === "mesh" &&
          bunnyMesh.geometry?.kind === "asset" &&
          bunnyMesh.geometry.assetId === bunnyAsset.id,
        "Official XRift starter Models must be registered as Assets and linked by Studio ID",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.components.some((component) => component.type === "text"),
        ).length === 6,
        "Official XRift Text/UI elements must be materialized as editable Text components",
      );
      assert(
        Object.values(plan.assets.assets).some(
          (asset) =>
            asset.kind === "material" &&
            asset.properties.baseColorTextureId === panoramaAsset?.id,
        ),
        "Official panorama must be linked from the converted sky material by Texture Asset ID",
      );
    }

    const serialized = serializeVisualProjectDocuments({
      project: plan.project,
      scenes: { [plan.scene.sceneId]: plan.scene },
      assets: plan.assets,
      prefabs: plan.prefabs,
    });
    assert(serialized.prefabDocuments.length === prefabAssets.length,
      `${templateId}: Save set does not contain every Prefab document`);
  }

  const blank = createStarterWorldProject("blank", "blank-fixture");
  const blankModelsInScene = Object.values(blank.scene.entities).filter((entity) =>
    entity.components.some(
      (component) =>
        component.type === "mesh" && component.geometry?.kind === "asset" &&
        blank.assets.assets[component.geometry.assetId]?.kind === "model",
    ),
  );
  assert(blankModelsInScene.length === 0,
    "Blank World must not place optional Models in the Scene");

  const groundPrefab = blank.prefabs["starter-ground"];
  assert(groundPrefab !== undefined, "Ground Prefab fixture is missing");
  const childId = "starter-floor-fixture-child";
  const floor = blank.scene.entities["starter-floor"];
  const editedScene = {
    ...blank.scene,
    entities: {
      ...blank.scene.entities,
      "starter-floor": {
        ...floor,
        children: [...floor.children, childId],
      },
      [childId]: {
        id: childId,
        name: "Updated Prefab Child",
        parentId: "starter-floor",
        children: [],
        enabled: true,
        components: [createTransformComponent(`${childId}-transform`)],
      },
    },
  };
  const updatedPrefab = updatePrefabDocumentFromSource(
    editedScene,
    blank.assets,
    groundPrefab,
  );
  assert(updatedPrefab !== null, "Prefab source update failed");
  assert(Object.keys(updatedPrefab.document.entities).length === 2,
    "Prefab Update did not retain the edited child hierarchy");
  assert(Object.values(updatedPrefab.document.entities).some(
    (entity) => entity.name === "Updated Prefab Child"),
  "Prefab Update did not copy the edited child Entity");
  assert(Object.keys(updatedPrefab.document.sourceEntityMap ?? {}).length === 2,
    "Prefab Update did not retain source Entity mappings");
}

function assertPrefabAssetReferencesExist(
  components: RegisteredSceneComponent[],
  assetIds: ReadonlySet<string>,
  templateId: StarterWorldTemplateId,
): void {
  for (const component of components) {
    if (component.type === "mesh") {
      if (component.geometry?.kind === "asset") {
        assert(assetIds.has(component.geometry.assetId),
          `${templateId}: Prefab Model reference is missing`);
      }
      for (const binding of component.materialBindings) {
        assert(assetIds.has(binding.materialAssetId),
          `${templateId}: Prefab Material reference is missing`);
      }
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
