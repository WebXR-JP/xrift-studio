import { DEFAULT_MODEL_IMPORT_SETTINGS, type ModelAsset } from "./asset-manifest";
import { BUILTIN_RECIPE_MODELS } from "./builtin-recipe-models";
import { compilePrototypeVisualProject } from "./compiler";
import { createEditorHistory, commitEditorHistory, undoEditorHistory } from "./editor-history";
import { getEntityWorldBounds } from "./entity-bounds";
import {
  buildJevWorldRequest, prepareJevWorld, resolveJevWorldPlan,
  type JevWorldPlan,
} from "./jev-world-builder";
import type { PrototypeVisualProject } from "./prototype-project";
import { resolveRuntimeSpawnPosition } from "./runtime-spawn";
import { getTransform, type SceneDocument } from "./scene-document";
import { instantiateSceneRecipe, SCENE_RECIPE_IDS } from "./scene-recipe-catalog";
import { createStarterWorldProject } from "./starter-templates";
import { sampleTerrainHeight } from "./terrain-grass";
import { resolveWorldPlayCapsuleSpawn } from "../../components/visual-editor/world-play-spawn";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("Jev world builder fixture: " + message);
}

const BASIC_PLAN: JevWorldPlan = {
  support: "supported", theme: "forest", size: "small", time: "night",
  terrain: "gentle", layout: "clearing", environment: "apply", sky: "stars", finish: "keep",
  tree: "many", rocks: "none", bamboo: "none", bench: "few", campfire: "one", lantern: "none", fountain: "none",
};

function responseFor(plan: JevWorldPlan) {
  return { answers: Object.fromEntries(Object.entries(plan).map(([key, value]) => [key, { type: "choice", choice: value }])) };
}

/** Uses the actual Recipe installer with already imported bundled model
 * metadata. Only disk/network import is skipped; real Recipe hierarchies,
 * model references, particles, materials and duplication all execute. */
function preparedSource(): PrototypeVisualProject {
  const initial = createStarterWorldProject("blank", "builder-fixture");
  const models = Object.fromEntries(BUILTIN_RECIPE_MODELS.map((definition) => {
    const min = [...(definition.bounds?.min ?? [-1, -1, -1])] as [number, number, number];
    const max = [...(definition.bounds?.max ?? [1, 1, 1])] as [number, number, number];
    const asset: ModelAsset = {
      id: definition.assetId, kind: "model", name: definition.displayName, status: "ready",
      source: { kind: "project", relativePath: `assets/${definition.fileName}` },
      sourceHash: definition.sha256, importSettings: { ...DEFAULT_MODEL_IMPORT_SETTINGS }, materialSlots: [],
      importMetadata: {
        sourceFormat: "glb", byteLength: definition.byteLength, nodeCount: 1, meshCount: 1, primitiveCount: 1,
        bounds: { min, max, center: min.map((value, axis) => (value + max[axis]) / 2) as [number, number, number],
          size: min.map((value, axis) => max[axis] - value) as [number, number, number], boundingSphereRadius: definition.approxRadius },
        animations: [], extensionsUsed: [], extensionsRequired: [],
      },
    };
    return [asset.id, asset];
  }));
  return { project: initial.project, scene: initial.scene, prefabs: initial.prefabs,
    assets: { ...initial.assets, assets: { ...initial.assets.assets, ...models } } };
}

function terrainIn(scene: SceneDocument) {
  const ground = Object.values(scene.entities).find((entity) => entity.name === "歩ける地面");
  const mesh = ground?.components.find((component) => component.type === "mesh");
  assert(ground && mesh?.type === "mesh" && mesh.geometry?.kind === "terrain", "generated ground must be a real Terrain");
  assert(ground.components.some((component) => component.type === "collider" && component.shape === "mesh" && component.enabled), "ground must have an active collision mesh");
  return { ground, terrain: mesh.geometry.terrain };
}

export async function runJevWorldBuilderFixtureAssertions(): Promise<void> {
  const source = preparedSource();
  const original = JSON.stringify(source);
  const request = buildJevWorldRequest("夜の森に焚き火とベンチ", source);
  assert(request.state.request === "夜の森に焚き火とベンチ" && request.state.scene.starter,
    "actual blank starter must allow a short Japanese description and default environment");
  assert(Object.keys(request.questions).length <= 20, "one request should ask a small set of independent choices");
  assert(Object.keys(request.state.capabilities.elements).length === 7 &&
    request.state.capabilities.elements.bench.includes("no sitting interaction") &&
    request.state.capabilities.unsupported.includes("Custom models or buildings"),
    "shared state must describe supported elements and limits independently of other questions");
  const plan = resolveJevWorldPlan(responseFor(BASIC_PLAN));
  for (const bad of [{}, { answers: {} }, responseFor({ ...BASIC_PLAN, support: "unsupported" }),
    { answers: { ...responseFor(BASIC_PLAN).answers, tree: { choice: "arbitrary-code" } } }]) {
    let rejected = false;
    try { resolveJevWorldPlan(bad); } catch { rejected = true; }
    assert(rejected, "invalid or unsupported API choices must fail before generation");
  }

  const calls = new Map<string, number>();
  const generated = await prepareJevWorld(source, plan, "/fixtures/world", {
    installRecipe: async (...args) => {
      calls.set(args[2], (calls.get(args[2]) ?? 0) + 1);
      return instantiateSceneRecipe(...args);
    },
  });
  assert(JSON.stringify(source) === original, "preparation must not change any source document");
  assert(calls.get(SCENE_RECIPE_IDS.tree) === 1 && calls.get(SCENE_RECIPE_IDS.bench) === 1,
    "repeated trees and benches should reuse one installed Recipe rather than repeat I/O");
  assert(generated.counts.recipes === 16 && generated.counts.recipeKinds === 3,
    "night forest should contain twelve trees, three benches and a campfire");
  const scene = generated.bundle.scene;
  const { terrain, ground } = terrainIn(scene);
  assert(generated.bundle.assets !== source.assets && generated.bundle.prefabs === source.prefabs,
    "new assets belong to the result while unrelated Prefabs retain identity");
  assert(scene.entities["starter-floor"] === source.scene.entities["starter-floor"],
    "existing geometry must retain its object identity");
  assert(scene.entities["starter-spawn"] === source.scene.entities["starter-spawn"],
    "the old SpawnPoint remains intact");
  const sun = scene.entities["starter-sun"].components.find((component) => component.type === "light");
  assert(sun?.type === "light" && sun.intensity < 0.3, "the starter sun must not keep a night world brightly lit");
  assert(scene.settings?.skybox.enabled && scene.settings.skybox.materialAssetId && !scene.settings.postprocessing.enabled,
    "a real selected Skybox must be installed while Post Effects remain optional");
  const resolvedSpawn = resolveRuntimeSpawnPosition(scene);
  assert(resolvedSpawn.every((value, axis) => Math.abs(value - generated.spawnPosition[axis]) < 1e-6),
    "runtime must choose the new grouped SpawnPoint before the retained starter SpawnPoint");
  assert(resolveWorldPlayCapsuleSpawn(resolvedSpawn)[1] > resolvedSpawn[1],
    "Play must start the player capsule above the generated ground");
  for (let z = 0; z <= terrain.depth * 0.32; z += 0.5) {
    assert(Math.abs(sampleTerrainHeight(terrain, 0, z)) < 1e-6, "entrance-to-clearing route must remain flat");
  }
  const groundBounds = getEntityWorldBounds(scene, generated.bundle.assets, ground.id).world;
  const previousBounds = getEntityWorldBounds(source.scene, source.assets, "starter-environment").world;
  assert(groundBounds && previousBounds && groundBounds.min[0] > previousBounds.max[0],
    "the new ground must not overlap the existing world");
  for (const childId of scene.entities[generated.rootEntityId].children) {
    if (childId === ground.id) continue;
    const bounds = getEntityWorldBounds(scene, generated.bundle.assets, childId).world;
    if (!bounds) continue;
    const x = Math.max(bounds.min[0], Math.min(resolvedSpawn[0], bounds.max[0]));
    const z = Math.max(bounds.min[2], Math.min(resolvedSpawn[2], bounds.max[2]));
    assert(Math.hypot(x - resolvedSpawn[0], z - resolvedSpawn[2]) > 1.2,
      "Recipe geometry must not obstruct the new SpawnPoint");
  }
  const compiled = compilePrototypeVisualProject(generated.bundle);
  assert(compiled.canStage, "generated actual Recipe documents must compile for publication");
  const world = compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  assert(world.indexOf('name="Jev · 森"') >= 0 && world.indexOf('name="Jev · 森"') < world.indexOf('name="Environment"'),
    "publication must preserve root traversal order so the generated SpawnPoint is first");

  const meadow = await prepareJevWorld(source, { ...BASIC_PLAN, theme: "meadow", time: "day", tree: "few", rocks: "few", bench: "none", campfire: "none", environment: "keep" }, "/fixtures/world");
  assert(meadow.summary.some((line) => line.startsWith("木 ×")) && meadow.summary.some((line) => line.startsWith("岩場 ×")),
    "a simple meadow must keep both trees and rocks");
  assert(meadow.bundle.scene.settings === source.scene.settings &&
    Object.values(source.scene.entities).every((entity) => meadow.bundle.scene.entities[entity.id] === entity),
    "keeping the environment preserves every existing Entity and settings by reference");
  const garden = await prepareJevWorld(source, { ...BASIC_PLAN, theme: "garden", time: "sunset", tree: "none", bamboo: "few", lantern: "few", campfire: "none", bench: "one" }, "/fixtures/world");
  assert(garden.counts.recipeKinds === 3, "sunset garden should create bamboo, lanterns and a bench");

  const mixedForest = await prepareJevWorld(source, { ...BASIC_PLAN, size: "small", layout: "clearing", rocks: "few", bench: "one" }, "/fixtures/world");
  assert(mixedForest.counts.recipes === 16 && mixedForest.counts.recipeKinds === 4,
    "a small forest must fit twelve trees, two rock clusters, one bench and a campfire without dropping anything");
  assert(mixedForest.summary[0].includes(`${terrainIn(mixedForest.bundle.scene).terrain.width}m四方`),
    "reported size must always match the actual ground dimensions");

  // Stress the finite options themselves, not an artificial overall cap.
  for (const size of ["small", "medium", "large"] as const) {
    for (const layout of ["clearing", "path"] as const) {
      const dense = await prepareJevWorld(source, { ...BASIC_PLAN, size, layout, rocks: "many", bamboo: "many", lantern: "many", fountain: "one" }, "/fixtures/world");
      assert(dense.counts.recipeKinds === 7, `${size}/${layout} must fit every supported requested kind`);
      if (size === "large") assert(dense.counts.recipes > 50, "large scenery must not inherit an arbitrary fifty-object cap");
    }
  }

  let history = createEditorHistory(source);
  let release!: () => void;
  const suspended = new Promise<void>((resolve) => { release = resolve; });
  let signalReached!: () => void;
  const reached = new Promise<void>((resolve) => { signalReached = resolve; });
  let current = true;
  let installs = 0;
  const pending = prepareJevWorld(source, BASIC_PLAN, "/fixtures/world", {
    assertCurrent: () => { if (!current) throw new Error("Scene changed"); },
    installRecipe: async (...args) => {
      installs += 1;
      if (installs === 2) { signalReached(); await suspended; }
      return instantiateSceneRecipe(...args);
    },
  }).then((result) => { history = commitEditorHistory(history, result.bundle); return true; }).catch(() => false);
  await reached;
  assert(history.past.length === 0 && history.present === source && JSON.stringify(source) === original,
    "partially prepared terrain and first imported Recipe must not appear in live documents or Undo history");
  current = false;
  release();
  assert(await pending === false && history.present === source && history.past.length === 0,
    "a late preparation after editing must fail without committing any part of the world");
  let failed = false;
  try {
    await prepareJevWorld(source, BASIC_PLAN, "/fixtures/world", { installRecipe: async () => null });
  } catch { failed = true; }
  assert(failed && JSON.stringify(source) === original, "import failure must leave source documents intact");
  history = commitEditorHistory(history, generated.bundle);
  assert(history.past.length === 1 && undoEditorHistory(history).history.present === source,
    "one history entry must undo the complete generated Scene and all new Asset references");
  assert(getTransform(scene, generated.rootEntityId)?.position[0] === generated.spawnPosition[0],
    "generated group and spawn must share the chosen free origin");
}
