import { getPrefabAssetDocumentReference } from "./compiler/prefab-resolver";
import { compileVisualProject } from "./compiler/compile";
import { serializeVisualProjectDocuments } from "./persistence";
import type { RegisteredSceneComponent } from "./scene-document";
import {
  STARTER_ASSET_FOLDER_IDS,
  createStarterWorldProject,
  defaultVisualStarterTemplateId,
  starterWorldContainsNoPrimitiveAssets,
  type StarterWorldTemplateId,
} from "./starter-templates";

/** Deterministic, filesystem-free assertions for the bundled world starters. */
export function runStarterTemplateFixtureAssertions(): void {
  assert(
    defaultVisualStarterTemplateId("world") === "openbrush",
    "A useful sample must be the default World starter",
  );

  for (const templateId of [
    "blank",
    "openbrush",
  ] as const satisfies readonly StarterWorldTemplateId[]) {
    const plan = createStarterWorldProject(templateId, "fixture-world");
    const assets = Object.values(plan.assets.assets);
    const modelAssets = assets.filter((asset) => asset.kind === "model");
    const textureAssets = assets.filter((asset) => asset.kind === "texture");
    const materialAssets = assets.filter(
      (asset) =>
        asset.kind === "material" &&
        asset.folderId === STARTER_ASSET_FOLDER_IDS.materials,
    );
    const prefabAssets = assets.filter(
      (asset) => asset.kind === "template" && asset.templateType === "prefab",
    );

    assert(plan.bundledAssetCopies.length === (templateId === "openbrush" ? 2 : 0),
      `${templateId}: bundled model and license copy plan is incorrect`);
    assert(modelAssets.length === (templateId === "openbrush" ? 1 : 0),
      `${templateId}: Model library is incorrect`);
    assert(textureAssets.length === 0, `${templateId}: Texture library must stay empty`);
    assert(materialAssets.length === 1, `${templateId}: Ground Material is missing`);
    assert(prefabAssets.length > 0, `${templateId}: Prefab library is empty`);
    assert(starterWorldContainsNoPrimitiveAssets(plan),
      `${templateId}: primitives must stay in the Create catalog`);

    const spawn = plan.scene.entities["starter-spawn"];
    const spawnComponent = spawn?.components.find(
      (component) => component.type === "xrift-component",
    );
    assert(spawnComponent?.type === "xrift-component",
      `${templateId}: Spawn Point must use the XRift component registry`);
    assert(spawnComponent?.schemaId === "xrift.spawn-point",
      `${templateId}: Spawn Point schema is incorrect`);
    assert(spawnComponent?.authoring?.source === "builtin-prefab" &&
      spawnComponent.authoring.readOnly,
      `${templateId}: Spawn Point source must stay read-only`);
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

    const result = compileVisualProject(
      {
        project: plan.project,
        scenes: { [plan.scene.sceneId]: plan.scene },
        assets: plan.assets,
        prefabs: plan.prefabs,
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );
    assert(result.canStage, `${templateId}: Starter World must compile for staging`);
    assert(!result.diagnostics.some((diagnostic) => diagnostic.severity === "blocking"),
      `${templateId}: Starter World has a blocking diagnostic`);
    assert(
      JSON.stringify(result.stagingPlan.runtimePackageSpecs) ===
        JSON.stringify(
          templateId === "openbrush" ? ["three-icosa@0.4.2-alpha.18"] : [],
        ),
      `${templateId}: compiler runtime package plan is incorrect`,
    );
    if (templateId === "openbrush") {
      const source = result.overlayFiles.find(
        (file) => file.relativePath === "src/World.tsx",
      )?.content ?? "";
      assert(source.includes("GLTFGoogleTiltBrushMaterialExtension"),
        "OpenBrush starter must compile the three-icosa loader extension");
      assert(source.includes("three-icosa-template/brushes/"),
        "OpenBrush starter must compile the hosted brush library path");
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
