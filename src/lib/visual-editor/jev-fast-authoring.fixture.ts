import {
  buildFastAuthoringRequest,
  findFastAuthoringSpawnPosition,
  resolveFastAuthoringDecision,
} from "./jev-fast-authoring";
import { createPrototypeProject } from "./prototype-project";
import { SCENE_RECIPE_IDS } from "./scene-recipe-catalog";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Jev fast authoring fixture: ${message}`);
}

export function runJevFastAuthoringFixtureAssertions(): void {
  const project = createPrototypeProject("world", "jev-fast-authoring");
  const spawn = findFastAuthoringSpawnPosition(project.scene);
  assert(
    spawn[2] !== 0 || spawn[0] !== 0,
    "starter SpawnPoint should be detected from the legacy spawn component",
  );

  const planned = buildFastAuthoringRequest({
    prompt: "夜の山に焚き火がある休憩所",
    scene: project.scene,
    projectName: project.project.metadata.name,
    sceneName: project.scene.name,
    maxGimmicks: 3,
  });
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.catalog.recipeCriteria,
      SCENE_RECIPE_IDS.campfire,
    ),
    "campfire must be one of the bounded Jev choices",
  );
  assert(
    Object.prototype.hasOwnProperty.call(
      planned.request.questions,
      "primitive",
    ),
    "primitive helper choice must be included",
  );

  const decision = resolveFastAuthoringDecision({
    response: {
      answers: {
        terrain: { choice: "rolling-hills" },
        mood: { choice: "night" },
        density: { choice: "balanced" },
        primitive: { choice: "platform" },
        gimmick1: { choice: SCENE_RECIPE_IDS.campfire },
        placement1: { choice: "center" },
        gimmick2: { choice: "none" },
        placement2: { choice: "perimeter" },
        gimmick3: { choice: "none" },
        placement3: { choice: "perimeter" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
    maxGimmicks: planned.maxGimmicks,
  });

  assert(decision.terrain === "rolling-hills", "terrain choice should survive");
  assert(decision.mood === "night", "mood choice should survive");
  assert(
    decision.recipes[0]?.recipeId === SCENE_RECIPE_IDS.campfire,
    "campfire should be selected",
  );
  assert(
    decision.recipes[0]?.position[0] !== 0 ||
      decision.recipes[0]?.position[2] !== 0,
    "an occupied center must move the main recipe away from the existing Entity",
  );
  assert(decision.primitive?.kind === "platform", "platform helper should resolve");
  assert(
    decision.decisionTrace.some((item) => item.label === "補助レイアウト"),
    "decision trace should expose the helper",
  );
}
