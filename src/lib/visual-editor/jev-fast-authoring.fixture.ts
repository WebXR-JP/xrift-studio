import { BUILTIN_PREFAB_RECIPE_IDS } from "./builtin-prefab-catalog";
import {
  buildFastAuthoringRequest,
  findFastAuthoringSpawnPosition,
  resolveFastAuthoringDecision,
} from "./jev-fast-authoring";
import { createPrototypeProject } from "./prototype-project";
import { SCENE_RECIPE_IDS } from "./scene-recipe-catalog";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("Jev fast authoring fixture: " + message);
}

export function runJevFastAuthoringFixtureAssertions(): void {
  const project = createPrototypeProject("world", "jev-fast-authoring");
  const spawn = findFastAuthoringSpawnPosition(project.scene);
  assert(
    spawn[2] !== 0 || spawn[0] !== 0,
    "starter SpawnPoint should be detected from the legacy spawn component",
  );

  const legacySpawnEntity = Object.values(project.scene.entities).find(
    (entity) =>
      entity.components.some((component) => component.type === "spawn-point"),
  );
  assert(legacySpawnEntity, "fixture needs a legacy SpawnPoint");
  const modernScene = {
    ...project.scene,
    entities: {
      ...project.scene.entities,
      [legacySpawnEntity.id]: {
        ...legacySpawnEntity,
        components: legacySpawnEntity.components.map((component) =>
          component.type === "spawn-point"
            ? {
                id: component.id,
                type: "xrift-component" as const,
                enabled: component.enabled,
                schemaId: "xrift.spawn-point",
                schemaVersion: "1.0.0",
                properties: { position: [0, 0, 0], yaw: 0 },
                assetReferences: [],
                entityReferences: [],
              }
            : component,
        ),
      },
    },
  };
  const modernSpawn = findFastAuthoringSpawnPosition(modernScene);
  assert(
    modernSpawn[0] === spawn[0] &&
      modernSpawn[1] === spawn[1] &&
      modernSpawn[2] === spawn[2],
    "official xrift.spawn-point should resolve to the same Transform",
  );

  const planned = buildFastAuthoringRequest({
    prompt:
      "広い霧の庭園。竹林、岩、木、ベンチ、街灯、温泉、しかけを大量に使って作り込む",
    scene: project.scene,
    projectName: project.project.metadata.name,
    sceneName: project.scene.name,
  });

  for (const question of [
    "detail",
    "terrainSurface",
    "grassPreset",
    "skybox",
    "finish",
    "wind",
    "humanize",
    "landscape1",
    "landscape1Count",
    "landscape3Placement",
    "furniture3",
    "lighting3",
    "atmosphere2",
    "interaction3",
    "material2",
    "facility6",
    "helper6",
  ]) {
    assert(
      Object.prototype.hasOwnProperty.call(planned.request.questions, question),
      question + " should be included in the bounded Jev request",
    );
  }

  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.roleCriteria.landscape,
      SCENE_RECIPE_IDS.bamboo,
    ),
    "landscape role should include bamboo",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.roleCriteria.material,
      SCENE_RECIPE_IDS.materialIridescence,
    ),
    "material role should include material showcase recipes",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.facilityCriteria,
      BUILTIN_PREFAB_RECIPE_IDS.mirror,
    ),
    "official XRift facilities should be available to Jev",
  );

  const decision = resolveFastAuthoringDecision({
    response: {
      answers: {
        terrain: { choice: "rolling-hills" },
        mood: { choice: "foggy" },
        density: { choice: "lively" },
        scale: { choice: "wide" },
        composition: { choice: "natural" },
        detail: { choice: "maximal" },
        terrainSurface: { choice: "forest-floor" },
        grassPreset: { choice: "meadow" },
        skybox: { choice: "alpine-cumulus" },
        finish: { choice: "cinematic" },
        wind: { choice: "breeze" },
        humanize: { choice: "natural" },

        signature1: { choice: SCENE_RECIPE_IDS.stoneLantern },
        signature1Count: { choice: "one" },
        signature1Placement: { choice: "center" },

        landscape1: { choice: SCENE_RECIPE_IDS.bamboo },
        landscape1Count: { choice: "mass" },
        landscape1Placement: { choice: "back-left" },
        landscape2: { choice: SCENE_RECIPE_IDS.rocks },
        landscape2Count: { choice: "many" },
        landscape2Placement: { choice: "perimeter-right" },
        landscape3: { choice: SCENE_RECIPE_IDS.tree },
        landscape3Count: { choice: "many" },
        landscape3Placement: { choice: "far" },

        furniture1: { choice: SCENE_RECIPE_IDS.bench },
        furniture1Count: { choice: "group" },
        furniture1Placement: { choice: "left" },
        furniture2: { choice: SCENE_RECIPE_IDS.tableSet },
        furniture2Count: { choice: "few" },
        furniture2Placement: { choice: "right" },
        furniture3: { choice: SCENE_RECIPE_IDS.well },
        furniture3Count: { choice: "pair" },
        furniture3Placement: { choice: "back-right" },

        lighting1: { choice: SCENE_RECIPE_IDS.streetLight },
        lighting1Count: { choice: "group" },
        lighting1Placement: { choice: "front-left" },
        lighting2: { choice: SCENE_RECIPE_IDS.lanterns },
        lighting2Count: { choice: "pair" },
        lighting2Placement: { choice: "front-right" },
        lighting3: { choice: "none" },
        lighting3Count: { choice: "one" },
        lighting3Placement: { choice: "right" },

        atmosphere1: { choice: SCENE_RECIPE_IDS.groundFog },
        atmosphere1Count: { choice: "one" },
        atmosphere1Placement: { choice: "center" },
        atmosphere2: { choice: "none" },
        atmosphere2Count: { choice: "one" },
        atmosphere2Placement: { choice: "far" },

        interaction1: { choice: SCENE_RECIPE_IDS.soundButton },
        interaction1Count: { choice: "one" },
        interaction1Placement: { choice: "near-spawn" },
        interaction2: { choice: "none" },
        interaction2Count: { choice: "one" },
        interaction2Placement: { choice: "left" },
        interaction3: { choice: "none" },
        interaction3Count: { choice: "one" },
        interaction3Placement: { choice: "right" },

        material1: { choice: SCENE_RECIPE_IDS.materialIridescence },
        material1Count: { choice: "one" },
        material1Placement: { choice: "perimeter-left" },
        material2: { choice: "none" },
        material2Count: { choice: "one" },
        material2Placement: { choice: "perimeter-right" },

        facility1: { choice: BUILTIN_PREFAB_RECIPE_IDS.mirror },
        facilityPlacement1: { choice: "perimeter-right" },
        facility2: { choice: BUILTIN_PREFAB_RECIPE_IDS.tagBoard },
        facilityPlacement2: { choice: "near-spawn" },
        facility3: { choice: "none" },
        facilityPlacement3: { choice: "left" },
        facility4: { choice: "none" },
        facilityPlacement4: { choice: "right" },
        facility5: { choice: "none" },
        facilityPlacement5: { choice: "far" },
        facility6: { choice: "none" },
        facilityPlacement6: { choice: "far" },

        helper1: { choice: "platform" },
        helper2: { choice: "path-marker" },
        helper3: { choice: "none" },
        helper4: { choice: "none" },
        helper5: { choice: "none" },
        helper6: { choice: "none" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });

  assert(decision.terrain === "rolling-hills", "terrain choice should survive");
  assert(decision.mood === "foggy", "mood choice should survive");
  assert(decision.scale === "wide", "scale choice should survive");
  assert(decision.composition === "natural", "composition choice should survive");
  assert(decision.detail === "maximal", "maximal detail choice should survive");
  assert(
    decision.terrainSurface === "forest-floor",
    "Terrain Surface choice should survive",
  );
  assert(decision.grassPreset === "meadow", "grass preset choice should survive");
  assert(
    decision.skybox === "alpine-cumulus",
    "Skybox Shader choice should survive",
  );
  assert(decision.finish === "cinematic", "finish choice should survive");
  assert(decision.wind === "breeze", "wind choice should survive");
  assert(
    decision.humanize === "natural",
    "humanize choice should survive",
  );
  const totalPlacements =
    decision.recipes.length +
    decision.facilities.length +
    decision.primitives.length;
  assert(
    totalPlacements > 50,
    "maximal detail should be able to exceed fifty placements without a global cap",
  );
  assert(
    decision.recipes.filter(
      (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.bamboo,
    ).length === 12,
    "one bamboo archetype should expand into twelve placements",
  );
  const bambooPlacements = decision.recipes.filter(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.bamboo,
  );
  assert(
    bambooPlacements.some(
      (recipe) =>
        Math.abs(recipe.rotation[1]) > 0.001 ||
        recipe.scale.some((value) => Math.abs(value - 1) > 0.001),
    ),
    "natural placement should vary bamboo yaw or scale",
  );
  assert(
    decision.recipes.filter(
      (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.rocks,
    ).length === 8,
    "one rocks archetype should expand into eight placements",
  );
  assert(
    decision.facilities.length === 2 &&
      decision.primitives.length === 2,
    "selected official facilities and Primitive helpers should reserve part of the budget",
  );
  assert(
    decision.decisionTrace.some(
      (item) =>
        item.label === "景観" &&
        item.value.includes("× 12"),
    ),
    "decision trace should summarize repeated placement counts",
  );
  assert(
    decision.decisionTrace.some(
      (item) => item.label === "地表" && item.value.includes("森林"),
    ) &&
      decision.decisionTrace.some(
        (item) => item.label === "草" && item.value.includes("草原"),
      ) &&
      decision.decisionTrace.some(
        (item) =>
          item.label === "Skybox" &&
          item.value.includes("Alpine Cumulus"),
      ) &&
      decision.decisionTrace.some(
        (item) => item.label === "仕上げ" && item.value === "cinematic",
      ) &&
      decision.decisionTrace.some(
        (item) => item.label === "風" && item.value === "breeze",
      ) &&
      decision.decisionTrace.some(
        (item) =>
          item.label === "配置の自然さ" &&
          item.value === "natural",
      ),
    "decision trace should expose Terrain Surface, finish, and wind",
  );
}
