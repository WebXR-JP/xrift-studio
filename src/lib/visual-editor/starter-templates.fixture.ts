import { getPrefabAssetDocumentReference } from "./compiler/prefab-resolver";
import { compileVisualProject } from "./compiler/compile";
import { serializeVisualProjectDocuments } from "./persistence";
import { updatePrefabDocumentFromSource } from "./prefab-document";
import {
  getKhrInteractivityOnStartAnimationIndices,
  validateKhrInteractivityExtension,
} from "./interactivity-graph";
import {
  createTransformComponent,
  type RegisteredSceneComponent,
} from "./scene-document";
import {
  STARTER_ASSET_FOLDER_IDS,
  STUDIO_GUIDE_DOOR_INTERACTIVITY_ASSET_ID,
  STUDIO_GUIDE_PARTICLE_ASSET_IDS,
  STUDIO_GUIDE_SKYBOX_TEXTURE_ASSET_ID,
  createStarterWorldProject,
  defaultVisualStarterTemplateId,
  starterWorldContainsNoPrimitiveAssets,
  type StarterWorldTemplateId,
} from "./starter-templates";

/** Deterministic, filesystem-free assertions for the bundled world starters. */
export function runStarterTemplateFixtureAssertions(): void {
  assert(
    defaultVisualStarterTemplateId("world") === "studio-guide",
    "The Studio learning world must be the default World starter",
  );

  for (const templateId of [
    "studio-guide",
    "xrift-official",
    "blank",
    "openbrush",
  ] as const satisfies readonly StarterWorldTemplateId[]) {
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

    assert(
      plan.bundledAssetCopies.length ===
        (templateId === "studio-guide"
          ? 26
          : templateId === "openbrush"
            ? 2
            : templateId === "xrift-official"
              ? 5
              : 0),
      `${templateId}: bundled source copy plan is incorrect`,
    );
    if (templateId === "openbrush") {
      const licenseCopy = plan.bundledAssetCopies.find(
        (copy) => copy.assetId === "openbrush-apache-license",
      );
      assert(
        licenseCopy?.targetRelativePath.endsWith(".txt") &&
          licenseCopy.mediaType === "text/plain" &&
          licenseCopy.integrity === "license-text",
        "openbrush: license extension and media type must match",
      );
      assert(
        plan.bundledAssetCopies.some(
          (copy) =>
            copy.assetId === "openbrush-all-brushes" &&
            copy.integrity === "strict",
        ),
        "openbrush: model must retain strict integrity verification",
      );
    }
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
    assert(modelAssets.length ===
      (templateId === "studio-guide"
        ? 12
        : templateId === "openbrush"
          ? 1
          : templateId === "xrift-official"
            ? 2
            : 0),
      `${templateId}: Model library is incorrect`);
    assert(
      textureAssets.length ===
        (templateId === "studio-guide"
          ? 14
          : templateId === "xrift-official"
            ? 1
            : 0),
      `${templateId}: Texture library is incorrect`,
    );
    assert(
      textureAssets.every(
        (asset) => asset.kind === "texture" && asset.importSettings.flipY,
      ),
      `${templateId}: bundled direct-load Textures must render upright`,
    );
    assert(
      particleAssets.length === (templateId === "studio-guide" ? 10 : 0),
      `${templateId}: Particle library is incorrect`,
    );
    assert(
      templateId === "studio-guide"
        ? materialAssets.length === 13
        : templateId === "xrift-official"
          ? materialAssets.length >= 7
          : materialAssets.length === 1,
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
    assert(result.canStage, `${templateId}: Starter World must compile for staging`);
    assert(!result.diagnostics.some((diagnostic) => diagnostic.severity === "blocking"),
      `${templateId}: Starter World has a blocking diagnostic`);
    assert(
      JSON.stringify(result.stagingPlan.runtimePackageSpecs) ===
        JSON.stringify(
          templateId === "openbrush"
            ? [
                "xrift-studio-runtime@0.1.0",
                "three-icosa@0.4.2-alpha.18",
              ]
            : ["xrift-studio-runtime@0.1.0"],
        ),
      `${templateId}: compiler runtime package plan is incorrect`,
    );
    if (templateId === "openbrush") {
      const runtimeManifest = result.overlayFiles.find(
        (file) => file.relativePath === "public/xrift/runtime.json",
      )?.content ?? "";
      assert(runtimeManifest.includes('"renderer": "three-icosa"'),
        "OpenBrush starter must describe its runtime renderer");
      assert(runtimeManifest.includes("three-icosa-template/brushes/"),
        "OpenBrush starter must preserve the hosted brush library path");
    }
    if (templateId !== "xrift-official") {
      assert(
        Object.values(plan.scene.entities).filter((entity) =>
          entity.components.some((component) => component.type === "light"),
        ).length === 1,
        `${templateId}: Starter World must use one main light`,
      );
    }
    if (templateId === "studio-guide") {
      const sceneEntities = Object.values(plan.scene.entities);
      const skyboxAsset =
        plan.assets.assets[STUDIO_GUIDE_SKYBOX_TEXTURE_ASSET_ID];
      const worldSource =
        compileVisualProject(documents, {
          generatedAt: "2026-01-01T00:00:00.000Z",
          outputMode: "classic-jsx",
        }).overlayFiles.find(
          (file) => file.relativePath === "src/World.tsx",
        )?.content ?? "";
      assert(
        skyboxAsset?.kind === "texture" &&
          skyboxAsset.usage === "environment" &&
          skyboxAsset.projection === "equirectangular" &&
          skyboxAsset.importMetadata?.sourceFormat === "hdr" &&
          skyboxAsset.attribution?.providerId === "poly-haven" &&
          skyboxAsset.attribution.licenseName === "CC0 1.0" &&
          plan.scene.settings?.skybox.imageAssetId === skyboxAsset.id &&
          plan.scene.settings.skybox.enabled &&
          plan.scene.settings.skybox.iblEnabled,
        "Studio guide must use the attributed Poly Haven HDRI as Skybox and IBL",
      );
      assert(
        worldSource.includes("<XRiftStudioImageSkybox") &&
          worldSource.includes("flipY={true}"),
        "Studio guide must compile its HDR Skybox with the upright orientation",
      );
      assert(
        !worldSource.includes(
          "let sourceNodeIndex: number | undefined;",
        ) &&
          worldSource.includes(
            "return () => {\n      action.stop();\n    };",
          ),
        "Studio guide must not generate unused Model resolver locals or an invalid Animation cleanup",
      );
      assert(
        plan.bundledAssetCopies.every(
          (copy) =>
            !copy.targetRelativePath.includes(":") &&
            !copy.targetRelativePath.includes("\\"),
        ),
        "Studio guide bundled assets must never retain a Google Drive path",
      );
      const museumPropAssets = modelAssets.filter((asset) =>
        asset.name.startsWith("Museum Prop:"),
      );
      assert(
        museumPropAssets.length === 7 &&
          museumPropAssets.every(
            (asset) =>
              asset.kind === "model" &&
              !asset.importSettings.generateColliders &&
              asset.materialSlots.length >= 2,
          ),
        "Studio guide must register the optimized Drive prop library",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.id.startsWith("guide-planter-"),
        ).length === 4 &&
          [
            "guide-information-board",
            "guide-gallery-bench",
            "guide-telescope",
            "guide-sample-laptop",
            "guide-sample-globe",
            "guide-sample-vr-headset",
          ].every((entityId) => {
            const entity = plan.scene.entities[entityId];
            return (
              entity &&
              !entity.components.some(
                (component) => component.type === "collider",
              )
            );
          }),
        "Studio guide furnishings must add visual density without trimesh colliders",
      );
      const entityPosition = (entityId: string) => {
        const transform = plan.scene.entities[entityId]?.components.find(
          (component) => component.type === "transform",
        );
        return transform?.type === "transform"
          ? transform.position
          : undefined;
      };
      const entityScale = (entityId: string) => {
        const transform = plan.scene.entities[entityId]?.components.find(
          (component) => component.type === "transform",
        );
        return transform?.type === "transform"
          ? transform.scale
          : undefined;
      };
      assert(
        JSON.stringify(entityPosition("starter-floor")) === "[0,0,-2.5]" &&
          JSON.stringify(entityScale("starter-floor")) === "[26,40,1]" &&
          JSON.stringify(entityPosition("guide-museum-wall-left")) ===
            "[-11,2.6,-2.5]" &&
          JSON.stringify(entityPosition("guide-museum-wall-right")) ===
            "[11,2.6,-2.5]" &&
          JSON.stringify(entityPosition("guide-museum-wall-back")) ===
            "[0,2.6,-20]",
        "Studio guide museum must retain its compact 22 m by 35 m layout",
      );
      assert(
        [
          "guide-sample-plinth",
          "guide-laptop-plinth",
          "guide-vr-plinth",
        ].every((entityId) => {
          const position = entityPosition(entityId);
          return position && Math.abs(position[0]) >= 6;
        }) &&
          ["guide-museum-route-1", "guide-museum-route-2"].every(
            (entityId) => {
              const position = entityPosition(entityId);
              return position && Math.abs(position[0]) === 2.25;
            },
          ) &&
          JSON.stringify(entityPosition("guide-station-overview")) ===
            "[5.25,2.55,10.2]" &&
          JSON.stringify(entityScale("guide-station-overview-frame")) ===
            "[5.95,4.84,0.12]" &&
          Math.abs(
            entityPosition("guide-practice-label-backdrop")?.[0] ?? 0,
          ) >= 10 &&
          Math.abs(
            entityPosition("guide-components-backdrop")?.[0] ?? 0,
          ) >= 10,
        "Studio guide must keep the 4.5 m central promenade clear of plinths and large wall signs",
      );
      const gltfDoor = plan.scene.entities["guide-gltf-door"];
      const interactionDoor = plan.scene.entities["guide-interaction-door"];
      const gltfDoorAnimation = gltfDoor?.components.find(
        (component) => component.type === "animation",
      );
      const interactionDoorAnimation = interactionDoor?.components.find(
        (component) => component.type === "animation",
      );
      assert(
        gltfDoorAnimation?.type === "animation" &&
          gltfDoorAnimation.autoplay &&
          !gltfDoorAnimation.loop &&
          interactionDoorAnimation?.type === "animation" &&
          !interactionDoorAnimation.autoplay &&
          !interactionDoorAnimation.loop,
        "Studio guide doors must compare glTF Autoplay with Interaction playback",
      );
      assert(
        !gltfDoor?.components.some(
          (component) => component.type === "collider",
        ) &&
          !interactionDoor?.components.some(
            (component) => component.type === "collider",
          ),
        "Animated guide doors must not leave a static collider in the route",
      );
      const interactionAsset =
        plan.assets.assets[STUDIO_GUIDE_DOOR_INTERACTIVITY_ASSET_ID];
      assert(
        interactionAsset?.kind === "interactivity" &&
          interactionAsset.folderId ===
            STARTER_ASSET_FOLDER_IDS.behaviors &&
          !validateKhrInteractivityExtension(
            interactionAsset.extension,
          ).some((diagnostic) => diagnostic.severity === "error") &&
          JSON.stringify(
            getKhrInteractivityOnStartAnimationIndices(
              interactionAsset.extension,
            ),
          ) === "[0]",
        "Studio guide must include an editable onStart to animation/start graph",
      );
      assert(
        modelAssets.filter((asset) =>
          asset.name.startsWith("Demo Door:"),
        ).length === 2 &&
          modelAssets
            .filter((asset) => asset.name.startsWith("Demo Door:"))
            .every(
              (asset) =>
                asset.kind === "model" &&
                asset.importSettings.importAnimations &&
                asset.importMetadata?.animations.length === 1 &&
                asset.materialSlots.length === 3,
            ),
        "Studio guide must register both animated door Models and materials",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.name.endsWith("スクリーンショット"),
        ).length === 7,
        "Studio guide must include six visual learning screens and one install QR",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.components.some(
            (component) =>
              component.type === "xrift-component" &&
              component.schemaId !== "xrift.spawn-point",
          ),
        ).length >= 3,
        "Studio guide must include editable official XRift Component samples",
      );
      assert(
        textureAssets.filter((asset) =>
          asset.name.startsWith("Studio Guide:"),
        ).length === 7 &&
          textureAssets
            .filter(
              (asset) =>
                asset.name.startsWith("Studio Guide:") &&
                asset.name !== "Studio Guide: Install QR",
            )
            .every(
              (asset) =>
                asset.kind === "texture" &&
                asset.importMetadata?.width === 1024 &&
                asset.importMetadata.height === 576,
            ),
        "Studio guide screenshots must retain their learning-panel dimensions",
      );
      const installQr = textureAssets.find(
        (asset) => asset.name === "Studio Guide: Install QR",
      );
      assert(
        installQr?.kind === "texture" &&
          installQr.importMetadata?.width === 1024 &&
          installQr.importMetadata.height === 1024,
        "Studio guide install QR must retain its square dimensions",
      );
      const reusableParticleAssets = STUDIO_GUIDE_PARTICLE_ASSET_IDS.map(
        (assetId) => plan.assets.assets[assetId],
      );
      assert(
        reusableParticleAssets.every(
          (asset) =>
            asset?.kind === "particle" &&
            asset.folderId === STARTER_ASSET_FOLDER_IDS.particles &&
            typeof asset.properties.renderer.textureAssetId === "string" &&
            plan.assets.assets[asset.properties.renderer.textureAssetId]
              ?.kind === "texture",
        ),
        "Studio guide Particle samples must be reusable Assets with valid Texture references",
      );
      const particleTextureAssets = textureAssets.filter((asset) =>
        asset.name.startsWith("Particle Texture:"),
      );
      assert(
        particleTextureAssets.length === 4 &&
          particleTextureAssets.every(
            (asset) =>
              asset.kind === "texture" &&
              asset.importMetadata?.sourceFormat === "png" &&
              asset.importMetadata.width === 256 &&
              asset.importMetadata.height === 256 &&
              asset.importSettings.sampler.wrapS === "clamp-to-edge" &&
              asset.importSettings.sampler.wrapT === "clamp-to-edge",
          ),
        "Studio guide must bundle four optimized reusable Particle textures",
      );
      const particleEntities = sceneEntities.filter((entity) =>
        entity.components.some(
          (component) => component.type === "particle-emitter",
        ),
      );
      assert(
        particleEntities.length === STUDIO_GUIDE_PARTICLE_ASSET_IDS.length &&
          particleEntities.every(
            (entity) =>
              !entity.components.some(
                (component) => component.type === "collider",
              ),
          ) &&
          STUDIO_GUIDE_PARTICLE_ASSET_IDS.every((assetId) =>
            particleEntities.some((entity) =>
              entity.components.some(
                (component) =>
                  component.type === "particle-emitter" &&
                  component.particleAssetId === assetId,
              ),
            ),
          ),
        "Studio guide Particle Lab must place every sample without route colliders",
      );
      assert(
        sceneEntities.filter((entity) =>
          entity.id.startsWith("guide-museum-wall-"),
        ).length === 5,
        "Studio guide must provide an editable one-floor museum shell",
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
