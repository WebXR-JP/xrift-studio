import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  getXriftComponentDefinition,
  removeXriftComponent,
  updateXriftComponent,
  validateXriftComponent,
} from "./component-registry";
import { compileXriftComponent } from "./compiler/xrift-component-registry";
import {
  BUILTIN_PREFAB_RECIPES,
  BUILTIN_PREFAB_RECIPE_IDS,
  createBuiltinPrefabEntity,
  listBuiltinPrefabRecipes,
} from "./builtin-prefab-catalog";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  cloneEntityHierarchy,
  type SceneDocument,
  type XRiftComponent,
} from "./scene-document";
import { sceneDocumentCodec } from "./serialization";

const VALID_INSTANCE_ID = "ceffb128-23c7-4120-b4e6-19bf6c604c47";

/** Filesystem-free contract assertions for the read-only XRift recipe catalog. */
export function runBuiltinPrefabCatalogFixtureAssertions(): void {
  assertCatalogCoverageAndProjectKinds();
  assertRecipesCreateProtectedComponents();
  assertPortalConfigurationContract();
  assertAuthoringMetadataRoundTripAndClone();
}

function assertCatalogCoverageAndProjectKinds(): void {
  const expectedIds = Object.values(BUILTIN_PREFAB_RECIPE_IDS);
  assert(
    BUILTIN_PREFAB_RECIPES.length === expectedIds.length,
    "Every stable recipe ID must have exactly one catalog entry",
  );
  assert(
    new Set(BUILTIN_PREFAB_RECIPES.map((recipe) => recipe.id)).size ===
      BUILTIN_PREFAB_RECIPES.length,
    "Built-in recipe IDs must be unique",
  );
  for (const recipeId of expectedIds) {
    assert(
      BUILTIN_PREFAB_RECIPES.some((recipe) => recipe.id === recipeId),
      `Missing built-in recipe: ${recipeId}`,
    );
  }

  const worldIds = new Set(listBuiltinPrefabRecipes("world").map(({ id }) => id));
  const itemIds = new Set(listBuiltinPrefabRecipes("item").map(({ id }) => id));
  assert(
    worldIds.size === BUILTIN_PREFAB_RECIPES.length,
    "World projects must expose the complete XRift recipe catalog",
  );
  assert(
    !itemIds.has(BUILTIN_PREFAB_RECIPE_IDS.spawnPoint),
    "Spawn Point must remain World-only",
  );
  for (const recipeId of expectedIds) {
    if (recipeId === BUILTIN_PREFAB_RECIPE_IDS.spawnPoint) continue;
    assert(itemIds.has(recipeId), `${recipeId} must be available to Item projects`);
  }
  assert(
    createBuiltinPrefabEntity("item", BUILTIN_PREFAB_RECIPE_IDS.spawnPoint) ===
      null,
    "World-only recipes must reject Item placement",
  );
}

function assertRecipesCreateProtectedComponents(): void {
  for (const [index, recipe] of BUILTIN_PREFAB_RECIPES.entries()) {
    const created = createBuiltinPrefabEntity("world", recipe.id, {
      entityId: `fixture-entity-${index}`,
      componentId: `fixture-xrift-${index}`,
      transformComponentId: `fixture-transform-${index}`,
    });
    assert(created, `Could not create built-in recipe: ${recipe.id}`);
    const component = findXriftComponent(created.entity.components);
    assert(component, `${recipe.id} did not create an XRift component`);
    assert(
      component.schemaId === recipe.schemaId,
      `${recipe.id} created the wrong XRift schema`,
    );
    const definition = getXriftComponentDefinition(component.schemaId);
    assert(
      definition?.label,
      `${recipe.id} must resolve the label used by the Hierarchy`,
    );
    assert(
      component.authoring?.source === "builtin-prefab" &&
        component.authoring.readOnly === true &&
        component.authoring.recipeId === recipe.id,
      `${recipe.id} must retain protected recipe provenance`,
    );
    assertArrayEqual(
      component.authoring?.editablePropertyNames ?? [],
      recipe.editablePropertyNames,
      `${recipe.id} editable field allow-list changed`,
    );

    if (recipe.id === BUILTIN_PREFAB_RECIPE_IDS.portal) continue;
    const diagnostics = validateXriftComponent(component, {
      projectKind: "world",
      entityId: created.entity.id,
    });
    assert(
      !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      `${recipe.id} must be valid immediately after placement`,
    );
    const compiled = compileXriftComponent(component, "world", {
      sceneId: "fixture-scene",
      entityId: created.entity.id,
      componentId: component.id,
    });
    assert(compiled.mode !== "unsupported", `${recipe.id} must compile safely`);
  }

  const tagBoard = requiredRecipeComponent(BUILTIN_PREFAB_RECIPE_IDS.tagBoard);
  const videoScreen = requiredRecipeComponent(
    BUILTIN_PREFAB_RECIPE_IDS.videoScreen,
  );
  assert(
    typeof tagBoard.properties.instanceStateKey === "string" &&
      tagBoard.properties.instanceStateKey.length > 0,
    "Tag Board must retain its deterministic instanceStateKey default",
  );
  assert(
    typeof videoScreen.properties.id === "string" &&
      videoScreen.properties.id.length > 0,
    "Video Screen must retain its deterministic ID default",
  );
}

function assertPortalConfigurationContract(): void {
  const created = createBuiltinPrefabEntity(
    "world",
    BUILTIN_PREFAB_RECIPE_IDS.portal,
    {
      entityId: "fixture-portal",
      componentId: "fixture-portal-component",
      transformComponentId: "fixture-portal-transform",
    },
  );
  assert(created, "Portal recipe could not be created");
  const component = findXriftComponent(created.entity.components);
  assert(component, "Portal recipe XRift component is missing");
  assert(
    component.properties.instanceId === undefined,
    "Portal recipe must never invent a remote Instance ID",
  );
  const incomplete = compileXriftComponent(component, "world", {
    sceneId: "fixture-scene",
    entityId: created.entity.id,
    componentId: component.id,
  });
  assert(
    incomplete.mode === "unsupported" &&
      incomplete.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "missing-xrift-component-prop" &&
          diagnostic.fieldPath === "properties.instanceId",
      ),
    "Portal compile must block until Instance ID is configured",
  );

  const scene = sceneWithEntity(created.entity);
  const invalid = updateXriftComponent(
    scene,
    created.entity.id,
    component.id,
    { properties: { instanceId: "not-an-instance-id" } },
    "world",
  );
  assert(invalid.changed, "Allowed Portal settings must reach the document");
  assert(
    invalid.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "invalid-xrift-component-field" &&
        diagnostic.fieldName === "instanceId",
    ),
    "Malformed Portal Instance IDs must produce a blocking authoring diagnostic",
  );
  const invalidComponent = entityComponent(
    invalid.scene,
    created.entity.id,
    component.id,
  );
  const invalidCompile = compileXriftComponent(invalidComponent, "world", {
    sceneId: invalid.scene.sceneId,
    entityId: created.entity.id,
    componentId: component.id,
  });
  assert(
    invalidCompile.mode === "unsupported" &&
      invalidCompile.diagnostics.some(
        (diagnostic) => diagnostic.code === "invalid-xrift-component-prop",
      ),
    "Malformed Portal Instance IDs must block compile",
  );

  const configured = updateXriftComponent(
    scene,
    created.entity.id,
    component.id,
    { properties: { instanceId: VALID_INSTANCE_ID, disabled: false } },
    "world",
  );
  assert(configured.changed, "Portal configuration allow-list was not applied");
  assert(
    !configured.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    "A configured Portal must pass authoring validation",
  );
  const configuredComponent = entityComponent(
    configured.scene,
    created.entity.id,
    component.id,
  );
  const compiled = compileXriftComponent(configuredComponent, "world", {
    sceneId: configured.scene.sceneId,
    entityId: created.entity.id,
    componentId: component.id,
  });
  assert(compiled.mode === "leaf", "A configured Portal must compile as a leaf");

  const protectedPosition = updateXriftComponent(
    configured.scene,
    created.entity.id,
    component.id,
    {
      properties: {
        instanceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        position: [1, 2, 3],
      },
    },
    "world",
  );
  assert(
    !protectedPosition.changed &&
      entityComponent(
        protectedPosition.scene,
        created.entity.id,
        component.id,
      ).properties.instanceId === VALID_INSTANCE_ID,
    "A mixed allowed/protected patch must be rejected atomically",
  );

  const protectedEnabled = updateXriftComponent(
    configured.scene,
    created.entity.id,
    component.id,
    { enabled: false },
    "world",
  );
  assert(!protectedEnabled.changed, "Built-in component lifecycle must stay locked");
  const removed = removeXriftComponent(
    configured.scene,
    created.entity.id,
    component.id,
  );
  assert(!removed.changed, "Built-in component identity must stay locked");
}

function assertAuthoringMetadataRoundTripAndClone(): void {
  const created = createBuiltinPrefabEntity(
    "world",
    BUILTIN_PREFAB_RECIPE_IDS.videoPlayer,
    {
      entityId: "fixture-video-player",
      componentId: "fixture-video-player-component",
      transformComponentId: "fixture-video-player-transform",
    },
  );
  assert(created, "Video Player recipe could not be created");
  const scene = sceneWithEntity(created.entity);
  const parsed = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(scene));
  assert(parsed.ok, "Recipe authoring metadata must survive serialization");
  const parsedComponent = entityComponent(
    parsed.document,
    created.entity.id,
    created.componentId,
  );
  assertArrayEqual(
    parsedComponent.authoring?.editablePropertyNames ?? [],
    created.recipe.editablePropertyNames,
    "Serialized editable property allow-list changed",
  );
  type SerializedRecipeScene = {
    entities: Record<
      string,
      {
        components: Array<{
          schemaId?: string;
          authoring?: {
            recipeId?: string;
            editablePropertyNames?: string[];
          };
        }>;
      }
    >;
  };
  const serializedScene = sceneDocumentCodec.serialize(scene);
  const invalidMetadata = JSON.parse(serializedScene) as SerializedRecipeScene;
  const invalidComponent = invalidMetadata.entities[created.entity.id].components.find(
    (component) => component.authoring,
  );
  assert(invalidComponent?.authoring, "Serialized recipe metadata is missing");
  invalidComponent.authoring.editablePropertyNames = ["url", "url"];
  assert(
    !sceneDocumentCodec.parse(JSON.stringify(invalidMetadata)).ok,
    "Duplicate editable property names must fail document validation",
  );

  const forgedAllowList = JSON.parse(serializedScene) as SerializedRecipeScene;
  const forgedAllowListComponent = forgedAllowList.entities[
    created.entity.id
  ].components.find((component) => component.authoring);
  assert(
    forgedAllowListComponent?.authoring,
    "Serialized recipe metadata is missing",
  );
  forgedAllowListComponent.authoring.editablePropertyNames = ["sync"];
  assert(
    !sceneDocumentCodec.parse(JSON.stringify(forgedAllowList)).ok,
    "A property outside the canonical recipe allow-list must fail validation",
  );

  const mismatchedSchema = JSON.parse(serializedScene) as SerializedRecipeScene;
  const mismatchedSchemaComponent = mismatchedSchema.entities[
    created.entity.id
  ].components.find((component) => component.authoring);
  assert(mismatchedSchemaComponent, "Serialized recipe component is missing");
  mismatchedSchemaComponent.schemaId = XRIFT_COMPONENT_SCHEMA_IDS.portal;
  assert(
    !sceneDocumentCodec.parse(JSON.stringify(mismatchedSchema)).ok,
    "A protected recipe must reject a mismatched XRift schema",
  );

  const unknownRecipe = JSON.parse(serializedScene) as SerializedRecipeScene;
  const unknownRecipeComponent = unknownRecipe.entities[
    created.entity.id
  ].components.find((component) => component.authoring);
  assert(unknownRecipeComponent?.authoring, "Serialized recipe metadata is missing");
  unknownRecipeComponent.authoring.recipeId = "xrift-prefab.unknown";
  assert(
    !sceneDocumentCodec.parse(JSON.stringify(unknownRecipe)).ok,
    "Unknown protected recipe IDs must fail validation",
  );

  const cloned = cloneEntityHierarchy(
    scene,
    [created.entity.id],
    (kind, sourceId) => `clone-${kind}-${sourceId}`,
  );
  assert(cloned, "Recipe Entity hierarchy could not be cloned");
  const clonedEntity = cloned.entities[cloned.rootEntityIds[0]];
  const clonedComponent = findXriftComponent(clonedEntity.components);
  const sourceComponent = findXriftComponent(created.entity.components);
  assert(clonedComponent && sourceComponent, "Cloned recipe component is missing");
  assertArrayEqual(
    clonedComponent.authoring?.editablePropertyNames ?? [],
    sourceComponent.authoring?.editablePropertyNames ?? [],
    "Cloned editable property allow-list changed",
  );
  assert(
    clonedComponent.authoring?.editablePropertyNames !==
      sourceComponent.authoring?.editablePropertyNames,
    "Clone must not alias the source editable property allow-list",
  );
}

function requiredRecipeComponent(recipeId: string): XRiftComponent {
  const created = createBuiltinPrefabEntity("world", recipeId, {
    componentId: `fixture-${recipeId}`,
  });
  assert(created, `Missing recipe: ${recipeId}`);
  const component = findXriftComponent(created.entity.components);
  assert(component, `Missing XRift component: ${recipeId}`);
  return component;
}

function sceneWithEntity(
  entity: NonNullable<ReturnType<typeof createBuiltinPrefabEntity>>["entity"],
): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "fixture-scene",
    name: "XRift recipe fixture",
    rootEntityIds: [entity.id],
    entities: { [entity.id]: entity },
  };
}

function findXriftComponent(
  components: NonNullable<
    ReturnType<typeof createBuiltinPrefabEntity>
  >["entity"]["components"],
): XRiftComponent | undefined {
  return components.find(
    (component): component is XRiftComponent =>
      component.type === "xrift-component",
  );
}

function entityComponent(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
): XRiftComponent {
  const entity = scene.entities[entityId];
  assert(entity, `Missing fixture Entity: ${entityId}`);
  const component = entity.components.find(
    (candidate): candidate is XRiftComponent =>
      candidate.type === "xrift-component" && candidate.id === componentId,
  );
  assert(component, `Missing fixture XRift component: ${componentId}`);
  return component;
}

function assertArrayEqual(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((entry, index) => entry === expected[index]),
    message,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Built-in XRift recipe fixture failed: ${message}`);
}
