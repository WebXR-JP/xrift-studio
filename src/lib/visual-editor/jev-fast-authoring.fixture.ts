import { BUILTIN_PREFAB_RECIPE_IDS } from "./builtin-prefab-catalog";
import {
  applyFastAuthoringEntityMetadata,
  buildFastAuthoringMcpHandoffPrompt,
  buildFastAuthoringRequest,
  createFastAuthoringSceneFeatures,
  findFastAuthoringSpawnPosition,
  listFastAuthoringGeneratedEntities,
  resolveFastAuthoringDecision,
  validateFastAuthoringScene,
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

  const rotatedScene = {
    ...project.scene,
    entities: {
      ...project.scene.entities,
      [legacySpawnEntity.id]: {
        ...legacySpawnEntity,
        components: legacySpawnEntity.components.map((component) =>
          component.type === "transform"
            ? {
                ...component,
                rotation: [0, Math.PI / 2, 0] as [number, number, number],
              }
            : component,
        ),
      },
    },
  };
  const rotatedPlanned = buildFastAuthoringRequest({
    prompt: "Spawnの前に操作ボタンを置く",
    scene: rotatedScene,
    projectName: project.project.metadata.name,
    sceneName: rotatedScene.name,
  });
  const rotatedDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        editScope: { choice: "append" },
        detail: { choice: "focused" },
        interaction1: { choice: SCENE_RECIPE_IDS.soundButton },
        interaction1Count: { choice: "one" },
        interaction1Placement: { choice: "near-spawn" },
        interaction1Zone: { choice: "entrance" },
      },
    },
    scene: rotatedScene,
    catalog: rotatedPlanned.catalog,
  });
  const rotatedNearSpawn = rotatedDecision.recipes.find(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.soundButton,
  );
  assert(rotatedNearSpawn, "rotated Spawn fixture should place the requested recipe");
  const rotatedSpawn = findFastAuthoringSpawnPosition(rotatedScene);
  assert(
    rotatedSpawn[0] - rotatedNearSpawn.position[0] > 0.5,
    "near-spawn placement should follow Spawn yaw instead of fixed world -Z",
  );

  const planned = buildFastAuthoringRequest({
    prompt:
      "広い霧の庭園。竹林、岩、木、ベンチ、街灯、温泉、しかけを大量に使って作り込む",
    scene: project.scene,
    projectName: project.project.metadata.name,
    sceneName: project.scene.name,
    selectedEntityIds: [project.scene.rootEntityIds[0]],
  });

  for (const question of [
    "operation",
    "mutationScope",
    "focusDomain",
    "needsVisualReview",
    "needsSystemTwo",
    "issueSeverity",
    "intentClarity",
    "editScope",
    "detail",
    "terrainSurface",
    "grassPreset",
    "skybox",
    "finish",
    "wind",
    "humanize",
    "landscape1",
    "landscape1Count",
    "landscape1Zone",
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

  const features = createFastAuthoringSceneFeatures(project.scene);
  assert(
    features.spawn.clearForwardMeters >= 0 &&
      Number.isFinite(features.spawn.clearForwardMeters),
    "scene snapshot should summarize Spawn forward clearance numerically",
  );
  const initialBudgetDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: { choice: "clear", confidence: 0.96 },
        editScope: { choice: "append", confidence: 0.95 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    initialBudgetDecision.performancePlan.existing.entityEquivalent ===
      Object.keys(project.scene.entities).length,
    "performance budget should account for the whole Scene hierarchy, not only root Entity count",
  );
  assert(
    planned.request.state.sceneFeatures.performance.rootEntityCount ===
      project.scene.rootEntityIds.length,
    "Jev request should carry a numeric Scene snapshot instead of only names",
  );
  assert(
    planned.request.state.selection.count === 1 &&
      planned.request.state.selection.entities[0]?.id ===
        project.scene.rootEntityIds[0],
    "Jev request should include the selected Entity as local iterative context",
  );

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
        operation: { choice: "create", confidence: 0.96 },
        mutationScope: { choice: "world", confidence: 0.96 },
        focusDomain: { choice: "scene", confidence: 0.97 },
        needsVisualReview: { type: "noul", noul: 0.18 },
        needsSystemTwo: { type: "noul", noul: 0.12 },
        issueSeverity: {
          type: "score",
          score: 1.0,
          confidence: 0.88,
        },
        intentClarity: { choice: "clear", confidence: 0.95 },
        editScope: { choice: "append", confidence: 0.94 },
        terrain: { choice: "rolling-hills", confidence: 0.93 },
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
        signature1Zone: { choice: "main" },

        landscape1: { choice: SCENE_RECIPE_IDS.bamboo },
        landscape1Count: { choice: "mass" },
        landscape1Placement: { choice: "back-left" },
        landscape1Zone: { choice: "perimeter" },
        landscape2: { choice: SCENE_RECIPE_IDS.rocks },
        landscape2Count: { choice: "many" },
        landscape2Placement: { choice: "perimeter-right" },
        landscape2Zone: { choice: "perimeter" },
        landscape3: { choice: SCENE_RECIPE_IDS.tree },
        landscape3Count: { choice: "many" },
        landscape3Placement: { choice: "far" },
        landscape3Zone: { choice: "view" },

        furniture1: { choice: SCENE_RECIPE_IDS.bench },
        furniture1Count: { choice: "group" },
        furniture1Placement: { choice: "left" },
        furniture1Zone: { choice: "rest" },
        furniture2: { choice: SCENE_RECIPE_IDS.tableSet },
        furniture2Count: { choice: "few" },
        furniture2Placement: { choice: "right" },
        furniture3: { choice: SCENE_RECIPE_IDS.well },
        furniture3Count: { choice: "pair" },
        furniture3Placement: { choice: "back-right" },

        lighting1: { choice: SCENE_RECIPE_IDS.streetLight },
        lighting1Count: { choice: "group" },
        lighting1Placement: { choice: "front-left" },
        lighting1Zone: { choice: "rest" },
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
        interaction1Zone: { choice: "entrance" },
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
  assert(decision.editScope === "append", "edit scope should survive");
  assert(
    decision.operation === "create" &&
      decision.mutationScope === "world",
    "operation and mutation scope should survive into the decision",
  );
  assert(
    decision.judgement.focusDomain === "scene" &&
      decision.judgement.needsVisualReview === 0.18 &&
      decision.judgement.issueSeverity === 1 &&
      decision.executionPath === "generator",
    "atomic Choice/Noul/Score answers should be composed by code into the execution path",
  );
  assert(
    decision.intentClarity === "clear" &&
      decision.requiresClarification === false &&
      decision.confidence.minimumCritical !== null,
    "high-confidence clear intent should be eligible for automatic application",
  );
  assert(
    decision.recipes.some(
      (recipe) =>
        recipe.recipeId === SCENE_RECIPE_IDS.bench &&
        recipe.zoneId === "rest",
    ),
    "semantic zones should survive into placement decisions",
  );
  const iterativeRepairDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        operation: { choice: "repair", confidence: 0.94 },
        mutationScope: { choice: "local", confidence: 0.93 },
        focusDomain: { choice: "material", confidence: 0.92 },
        needsVisualReview: { type: "noul", noul: 0.22 },
        needsSystemTwo: { type: "noul", noul: 0.14 },
        issueSeverity: {
          type: "score",
          score: 0.7,
          confidence: 0.84,
        },
        intentClarity: { choice: "clear", confidence: 0.92 },
        editScope: { choice: "append", confidence: 0.91 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    iterativeRepairDecision.operation === "repair" &&
      iterativeRepairDecision.mutationScope === "local",
    "a concrete follow-up should be planned as a local repair instead of recreating the World",
  );
  assert(
    iterativeRepairDecision.executionPath === "typed-edit",
    "local material repair should route to typed editing instead of generating a new World",
  );

  const createEvenWithReviewSignals = resolveFastAuthoringDecision({
    response: {
      answers: {
        operation: { choice: "create", confidence: 0.95 },
        mutationScope: { choice: "world", confidence: 0.94 },
        focusDomain: { choice: "scene", confidence: 0.93 },
        needsVisualReview: { type: "noul", noul: 0.96 },
        needsSystemTwo: { type: "noul", noul: 0.91 },
        intentClarity: { choice: "clear", confidence: 0.92 },
        editScope: { choice: "append", confidence: 0.91 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    createEvenWithReviewSignals.executionPath === "generator",
    "create should stay executable even when visual/system-two signals are high",
  );

  const visualRepairDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        operation: { choice: "repair", confidence: 0.94 },
        mutationScope: { choice: "local", confidence: 0.93 },
        focusDomain: { choice: "material", confidence: 0.92 },
        needsVisualReview: { type: "noul", noul: 0.91 },
        needsSystemTwo: { type: "noul", noul: 0.18 },
        intentClarity: { choice: "clear", confidence: 0.92 },
        editScope: { choice: "append", confidence: 0.91 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    visualRepairDecision.executionPath === "visual-review",
    "appearance complaints should route to visual review before any mutation",
  );
  const handoffPrompt = buildFastAuthoringMcpHandoffPrompt({
    prompt: "この建物のマテリアルが剥がれて見える",
    decision: visualRepairDecision,
    selectedEntityId: project.scene.rootEntityIds[0],
    selectedEntityName:
      project.scene.entities[project.scene.rootEntityIds[0]]?.name ?? null,
  });
  assert(
    handoffPrompt.includes("この建物のマテリアルが剥がれて見える") &&
      handoffPrompt.includes("executionPath: visual-review") &&
      handoffPrompt.includes("selectedEntityId:") &&
      handoffPrompt.includes("World全体を作り直さない"),
    "non-generator decisions should produce a copyable MCP handoff with the original request and target",
  );

  const ambiguousDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: {
          choice: "ambiguous-edit-scope",
          confidence: 0.91,
        },
        editScope: { choice: "append", confidence: 0.88 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    ambiguousDecision.requiresClarification &&
      ambiguousDecision.clarificationMessage?.includes("Zone"),
    "ambiguous edit scope should stop automatic mutation and ask a bounded clarification",
  );

  const lowConfidenceDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: { choice: "clear", confidence: 0.92 },
        editScope: { choice: "append", confidence: 0.91 },
        terrain: { choice: "none", confidence: 0.41 },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  assert(
    lowConfidenceDecision.requiresClarification &&
      lowConfidenceDecision.confidence.lowConfidenceQuestions.includes(
        "terrain",
      ),
    "low confidence on a critical decision should require clarification before writes",
  );

  const budgetDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: { choice: "clear", confidence: 0.95 },
        editScope: { choice: "append", confidence: 0.94 },
        detail: { choice: "rich" },
        lighting1: { choice: SCENE_RECIPE_IDS.campfire },
        lighting1Count: { choice: "many" },
        lighting1Placement: { choice: "right" },
        lighting1Zone: { choice: "rest" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  const budgetCampfires = budgetDecision.recipes.filter(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.campfire,
  );
  assert(
    budgetCampfires.length < 8 &&
      budgetDecision.performancePlan.projected.particles <=
        budgetDecision.performancePlan.budget.particleMax,
    "realtime-heavy recipes should be clamped by projected particle budget instead of a blind global placement cap",
  );
  assert(
    budgetDecision.performancePlan.clampedSelections.some((entry) =>
      entry.includes("焚き火"),
    ),
    "decision trace should explain when a heavy recipe count was automatically reduced",
  );

  const corridorDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: { choice: "clear", confidence: 0.95 },
        editScope: { choice: "append", confidence: 0.94 },
        detail: { choice: "focused" },
        landscape1: { choice: SCENE_RECIPE_IDS.tree },
        landscape1Count: { choice: "one" },
        landscape1Placement: { choice: "center" },
        landscape1Zone: { choice: "main" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  const corridorTree = corridorDecision.recipes.find(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.tree,
  );
  assert(corridorTree, "corridor fixture should place a landscape tree");
  const corridorSpawn = findFastAuthoringSpawnPosition(project.scene);
  const treeDistanceFromSpawn = Math.hypot(
    corridorTree.position[0] - corridorSpawn[0],
    corridorTree.position[2] - corridorSpawn[2],
  );
  assert(
    treeDistanceFromSpawn > 1.5,
    "landscape placement should reserve a usable corridor away from Spawn",
  );

  const campfireRestDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        editScope: { choice: "append" },
        mood: { choice: "night" },
        detail: { choice: "rich" },
        density: { choice: "balanced" },
        scale: { choice: "balanced" },
        signature1: { choice: SCENE_RECIPE_IDS.campfire },
        signature1Count: { choice: "one" },
        signature1Placement: { choice: "center" },
        signature1Zone: { choice: "rest" },
        furniture1: { choice: SCENE_RECIPE_IDS.bench },
        furniture1Count: { choice: "few" },
        furniture1Placement: { choice: "center" },
        furniture1Zone: { choice: "rest" },
      },
    },
    scene: project.scene,
    catalog: planned.catalog,
  });
  const campfirePlacement = campfireRestDecision.recipes.find(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.campfire,
  );
  const benchPlacements = campfireRestDecision.recipes.filter(
    (recipe) => recipe.recipeId === SCENE_RECIPE_IDS.bench,
  );
  assert(campfirePlacement, "campfire should be placeable as the rest Zone focal");
  assert(
    benchPlacements.length === 3,
    "rest Zone should expand a bench recipe into the requested group",
  );
  assert(
    benchPlacements.some((bench) => {
      const distance = Math.hypot(
        bench.position[0] - campfirePlacement.position[0],
        bench.position[2] - campfirePlacement.position[2],
      );
      return distance >= 1.8 && distance <= 4.5;
    }),
    "rest Zone benches should stay spatially related to the campfire",
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

  const taggedEntityId = project.scene.rootEntityIds[0];
  const taggedScene = applyFastAuthoringEntityMetadata(
    project.scene,
    taggedEntityId,
    {
      generationId: "fixture-generation",
      zoneId: "rest",
      groupId: "fixture-rest",
      role: "家具・設備",
      recipeId: SCENE_RECIPE_IDS.bench,
      instanceIndex: 0,
      placement: {
        requestedPosition: [2, 0, -4],
        maxSlopeDegrees: 10,
        flatRadius: 2.4,
      },
    },
  );
  const generated = listFastAuthoringGeneratedEntities(taggedScene);
  assert(
    generated.length === 1 &&
      generated[0].metadata.zoneId === "rest",
    "generated Entity provenance should persist semantic Zone metadata",
  );
  assert(
    generated[0].metadata.placement?.maxSlopeDegrees === 10 &&
      generated[0].metadata.placement?.flatRadius === 2.4,
    "generated Entity provenance should retain local terrain repair constraints",
  );
  const taggedRequest = buildFastAuthoringRequest({
    prompt: "休憩所だけ作り直して",
    scene: taggedScene,
    projectName: project.project.metadata.name,
    sceneName: taggedScene.name,
  });
  assert(
    taggedRequest.request.state.sceneFeatures.generated.zones.rest === 1,
    "numeric snapshot should tell Jev which generated Zones already exist",
  );

  const replacementDecision = resolveFastAuthoringDecision({
    response: {
      answers: {
        intentClarity: { choice: "clear", confidence: 0.96 },
        editScope: { choice: "replace-generated", confidence: 0.95 },
      },
    },
    scene: taggedScene,
    catalog: taggedRequest.catalog,
  });
  assert(
    replacementDecision.performancePlan.existing.entityEquivalent <
      Object.keys(taggedScene.entities).length,
    "replace-generated should reclaim the outgoing generated hierarchy before budgeting the replacement",
  );

  const validation = validateFastAuthoringScene({
    scene: taggedScene,
    generatedEntityIds: [taggedEntityId],
  });
  assert(
    validation.some((check) => check.id === "overlap") &&
      validation.some((check) => check.id === "performance"),
    "post-generation validator should report geometry and performance checks",
  );
}
