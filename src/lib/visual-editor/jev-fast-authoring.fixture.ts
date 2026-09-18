import { BUILTIN_PREFAB_RECIPE_IDS } from "./builtin-prefab-catalog";
import {
  buildFastAuthoringRequest,
  FAST_AUTHORING_MAX_RECIPES,
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
    prompt: "霧の山中に、小さな和風庭園と温泉、石灯籠、竹を配置する",
    scene: project.scene,
    projectName: project.project.metadata.name,
    sceneName: project.scene.name,
  });
  assert(
    planned.maxGimmicks === FAST_AUTHORING_MAX_RECIPES &&
      planned.maxGimmicks === 6,
    "default Fast Authoring should expose all six recipe roles",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.roleCriteria.signature,
      SCENE_RECIPE_IDS.campfire,
    ),
    "signature role should be able to choose from the broad recipe catalog",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.roleCriteria.landscape,
      SCENE_RECIPE_IDS.bamboo,
    ),
    "landscape role should include nature recipes",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.roleCriteria.lighting,
      SCENE_RECIPE_IDS.streetLight,
    ),
    "lighting role should include light recipes",
  );
  for (const question of [
    "composition",
    "scale",
    "facility1",
    "facility2",
    "helper1",
    "helper2",
  ]) {
    assert(
      Object.prototype.hasOwnProperty.call(planned.request.questions, question),
      question + " should be included in the bounded Jev request",
    );
  }
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
        density: { choice: "balanced" },
        scale: { choice: "wide" },
        composition: { choice: "natural" },

        gimmick1: { choice: SCENE_RECIPE_IDS.stoneLantern },
        placement1: { choice: "center" },
        gimmick2: { choice: SCENE_RECIPE_IDS.bamboo },
        placement2: { choice: "back-left" },
        gimmick3: { choice: SCENE_RECIPE_IDS.bench },
        placement3: { choice: "front-right" },
        gimmick4: { choice: SCENE_RECIPE_IDS.streetLight },
        placement4: { choice: "right" },
        gimmick5: { choice: SCENE_RECIPE_IDS.hotSpring },
        placement5: { choice: "far" },
        gimmick6: { choice: SCENE_RECIPE_IDS.soundButton },
        placement6: { choice: "near-spawn" },

        facility1: { choice: BUILTIN_PREFAB_RECIPE_IDS.mirror },
        facilityPlacement1: { choice: "perimeter-right" },
        facility2: { choice: BUILTIN_PREFAB_RECIPE_IDS.tagBoard },
        facilityPlacement2: { choice: "near-spawn" },

        helper1: { choice: "platform" },
        helper2: { choice: "path-marker" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
    maxGimmicks: planned.maxGimmicks,
  });

  assert(decision.terrain === "rolling-hills", "terrain choice should survive");
  assert(decision.mood === "foggy", "mood choice should survive");
  assert(decision.scale === "wide", "scale choice should survive");
  assert(decision.composition === "natural", "composition choice should survive");
  assert(
    decision.recipes.length >= 5,
    "role-based planning should be able to select a richer set of recipes",
  );
  assert(
    decision.recipes[0]?.recipeId === SCENE_RECIPE_IDS.stoneLantern,
    "signature choice should survive",
  );
  assert(
    decision.recipes[0]?.position[0] !== 0 ||
      decision.recipes[0]?.position[2] !== 0,
    "an occupied center must move the signature away from the starter object",
  );
  assert(
    decision.facilities.length === 2 &&
      decision.facilities.some(
        (facility) => facility.recipeId === BUILTIN_PREFAB_RECIPE_IDS.mirror,
      ),
    "two official facilities should resolve when requested",
  );
  assert(
    decision.primitives.length === 2 &&
      decision.primitives.some((helper) => helper.kind === "platform") &&
      decision.primitives.some((helper) => helper.kind === "path-marker"),
    "two distinct Primitive helpers should resolve",
  );
  assert(
    decision.decisionTrace.some((item) => item.label === "構図") &&
      decision.decisionTrace.some((item) => item.label === "公式設備1") &&
      decision.decisionTrace.some((item) => item.label === "補助1"),
    "decision trace should expose composition, facilities, and helpers",
  );
}
