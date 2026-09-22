import { createDefaultMaterialAsset, type AssetManifest, type MaterialAsset } from "./asset-manifest";
import { createDocumentId } from "./document-id";
import { createXriftComponent, XRIFT_COMPONENT_SCHEMA_IDS } from "./component-registry";
import { createEmptyEntity, reparentEntityHierarchy } from "./editor-session";
import { getEntityWorldBounds } from "./entity-bounds";
import type { PrototypeVisualProject } from "./prototype-project";
import {
  addTerrainEntity, createBoxColliderComponent, createMeshColliderComponent,
  duplicateEntityHierarchy, updateEntityTransform,
  type SceneDocument, type Vec3,
} from "./scene-document";
import { resolveSceneSettings } from "./scene-settings";
import { getSceneRecipe, instantiateSceneRecipe, SCENE_RECIPE_IDS } from "./scene-recipe-catalog";
import { applySkyShaderParameters, SKY_SHADER_CATALOG } from "./sky-shader-catalog";
import { createTerrainGeometry, terrainHeightRange, type TerrainGeometry } from "./terrain";
import { createTerrainGrassLayers, getTerrainGrassPreset, sampleTerrainHeight } from "./terrain-grass";
import { applyTerrainSurfaceParameters, fitTerrainSurfaceToRange, getTerrainSurfacePreset } from "./terrain-surface-catalog";

function choice<const C extends Record<string, string>>(instructions: string, criteria: C) {
  return { type: "choice" as const, instructions, criteria };
}

const COUNTS = { none: "Not needed", one: "One", few: "A few", many: "A larger group" } as const;

// Each answer is an independent, bounded decision. Jev never supplies code,
// asset URLs or coordinates, and the executor needs no second model or MCP.
const QUESTIONS = {
  support: choice("Can the main request be fulfilled with the capabilities listed in the shared state? Short Japanese scenery descriptions are sufficient. Reject requests that require custom buildings, vehicles, new scripts, editing/deleting existing objects, or unavailable assets. Do not reject merely because size or exact counts are unspecified.", {
    supported: "A simple forest, meadow, garden or plaza using the available elements",
    unsupported: "An essential requested feature is outside these capabilities",
  }),
  theme: choice("Choose the closest outdoor setting. A clearing, campsite or wooded rest area is forest. Select a reasonable setting when none is explicit.", {
    forest: "Forest or campsite", meadow: "Open grassy meadow", garden: "Garden or park", plaza: "Paved open plaza",
  }),
  size: choice("Choose the footprint. Default to small; use large only when explicitly requested.", {
    small: "28 metres across", medium: "42 metres across", large: "64 metres across",
  }),
  time: choice("Choose the requested time of day, defaulting to day.", {
    day: "Daylight", sunset: "Warm sunset", night: "Night with visible moonlight",
  }),
  terrain: choice("Choose the ground. Gentle hills keep the central clearing and entrance flat. Default to flat for plazas and gentle for forests.", {
    flat: "Flat, walkable ground", gentle: "Low hills around flat walking areas",
  }),
  layout: choice("Choose a clear arrangement, leaving a clear entrance and walking space.", {
    clearing: "A central clearing with scenery around it", path: "A broad central path with scenery to its sides",
  }),
  environment: choice("Apply sky and lighting for an explicit time/sky request or a starter Scene. Otherwise keep the existing world's environment.", {
    apply: "Set sky and lighting for this request", keep: "Preserve current sky and lighting",
  }),
  sky: choice("Choose an appropriate visible sky. Use stars for a starry night, clouds when requested, otherwise clear.", {
    clear: "Clear sky", clouds: "Cloudy sky", stars: "Starry night sky",
  }),
  finish: choice("Post effects are optional. Keep them unchanged unless glow/Bloom or disabling effects was explicitly requested.", {
    keep: "Leave post effects unchanged", bloom: "Enable restrained Bloom", off: "Disable post effects",
  }),
  tree: choice("How many tree models belong in this scene? A forest implies many; a meadow needs trees only when requested.", COUNTS),
  rocks: choice("How many small rock clusters? Use none unless requested or essential to the setting.", COUNTS),
  bamboo: choice("How many bamboo clusters? Each cluster has seven stalks. Use none unless bamboo is requested.", COUNTS),
  bench: choice("How many benches? These are visual furniture, without a sitting interaction. Use none unless requested or a park/rest area needs them.", { none: "None", one: "One bench", few: "Three benches" }),
  campfire: choice("Place a campfire only when fire, a campsite or a campfire is requested.", { none: "No campfire", one: "One campfire with real flame particles and light" }),
  lantern: choice("How many stone lanterns? They can illuminate a requested night garden or path. Avoid adding them to a natural forest unless requested.", { none: "None", few: "Two lanterns", many: "Six lanterns" }),
  fountain: choice("Place a fountain only when requested.", { none: "No fountain", one: "One fountain" }),
} as const;

export type JevWorldPlan = {
  [K in keyof typeof QUESTIONS]: keyof (typeof QUESTIONS)[K]["criteria"];
};

export function buildJevWorldRequest(prompt: string, bundle: PrototypeVisualProject) {
  const request = prompt.trim();
  if (!request || request.length > 2000) throw new Error("作りたい場所を2000文字以内で入力してください");
  if (bundle.project.projectKind !== "world") throw new Error("ワールドのプロジェクトを開いてください");
  return {
    state: {
      request,
      scene: {
        entityCount: Object.keys(bundle.scene.entities).length,
        starter: Object.keys(bundle.scene.entities).every((id) =>
          ["starter-environment", "starter-floor", "starter-sun", "starter-spawn",
            "entity-world-floor", "entity-world-object", "entity-world-light", "entity-world-spawn"].includes(id)),
      },
      capabilities: {
        themes: ["Forest or campsite", "Grassy meadow", "Garden or park", "Paved outdoor plaza"],
        elements: {
          tree: "Tree models", rocks: "Small rock clusters", bamboo: "Bamboo clusters",
          bench: "Visual bench furniture; no sitting interaction",
          campfire: "Campfire model with flame particles and light; no audio",
          lantern: "Stone lantern models with lights",
          fountain: "Fountain model with animated water particles; no audio",
        },
        sceneFeatures: ["Walkable flat or gently rolling Terrain", "Clear entrance and new SpawnPoint",
          "Day, sunset or night sky and lighting", "Optional Bloom"],
        unsupported: ["Custom models or buildings", "Vehicles", "New scripts or interactions",
          "Moving, replacing or deleting existing objects", "New audio or assets outside the listed sets"],
      },
      behavior: "Add one complete, editable outdoor area. Preserve existing objects. Use the named built-in model sets, walkable terrain, a clear entrance and a new SpawnPoint. Missing minor details use modest defaults. Do not fill unused element slots.",
      examples: ["夜の森に焚き火とベンチ", "草原に木と岩", "夕方の庭園に竹と石灯籠"],
    },
    questions: QUESTIONS,
  };
}

export function resolveJevWorldPlan(response: unknown): JevWorldPlan {
  const answers = response && typeof response === "object" && !Array.isArray(response)
    ? (response as { answers?: unknown }).answers : undefined;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("Jevの回答を確認できませんでした。もう一度実行してください");
  }
  const plan: Record<string, string> = {};
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const answer = (answers as Record<string, unknown>)[id];
    const value = answer && typeof answer === "object" ? (answer as { choice?: unknown }).choice : null;
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(question.criteria, value)) {
      throw new Error(`Jevの回答「${id}」を確認できませんでした。もう一度実行してください`);
    }
    plan[id] = value;
  }
  if (plan.support !== "supported") {
    throw new Error("この指示に必要な素材や機能には、まだ対応していません。森・草原・庭園・広場と、木・岩・竹・ベンチ・焚き火・石灯籠・噴水を指定できます");
  }
  return plan as JevWorldPlan;
}

export type JevWorldBuildOptions = {
  onProgress?: (message: string) => void;
  assertCurrent?: () => void;
  /** Dependency injection for document tests; production uses Studio's importer. */
  installRecipe?: typeof instantiateSceneRecipe;
};

export type JevWorldBuildResult = {
  bundle: PrototypeVisualProject;
  rootEntityId: string;
  spawnPosition: Vec3;
  summary: string[];
  counts: { entities: number; recipes: number; recipeKinds: number };
};

const THEMES = { forest: "森", meadow: "草原", garden: "庭園", plaza: "広場" };
const WIDTHS = { small: 28, medium: 42, large: 64 };
const ELEMENTS = {
  campfire: { id: SCENE_RECIPE_IDS.campfire, radius: 1.3 },
  fountain: { id: SCENE_RECIPE_IDS.fountain, radius: 2 },
  bench: { id: SCENE_RECIPE_IDS.bench, radius: 1.3 },
  lantern: { id: SCENE_RECIPE_IDS.stoneLantern, radius: 0.8 },
  rocks: { id: SCENE_RECIPE_IDS.rocks, radius: 1.8 },
  bamboo: { id: SCENE_RECIPE_IDS.bamboo, radius: 1.8 },
  tree: { id: SCENE_RECIPE_IDS.tree, radius: 1.4 },
} as const;
type Element = keyof typeof ELEMENTS;
type Placement = { element: Element; position: Vec3; yaw: number; scale: number; radius: number };
class PlacementSpaceError extends Error {}

function countFor(plan: JevWorldPlan, element: Element): number {
  const count = plan[element];
  if (count === "none") return 0;
  if (count === "one") return 1;
  if (element === "tree") return count === "few" ? 4 : { small: 12, medium: 20, large: 32 }[plan.size];
  if (element === "lantern") return count === "few" ? 2 : 6;
  if (element === "bench") return 3;
  return count === "few" ? 2 : { small: 4, medium: 6, large: 8 }[plan.size];
}

function terrainFor(plan: JevWorldPlan, width: number): TerrainGeometry {
  const resolution = 65;
  const heights: number[] = [];
  const mask: number[] = [];
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const px = (x / (resolution - 1) - 0.5) * width;
      const pz = (z / (resolution - 1) - 0.5) * width;
      const edge = Math.min(1, Math.max(0, (Math.hypot(px, pz) - 7.5) / 5));
      const path = Math.min(1, Math.max(0, (Math.abs(px) - 2.5) / 2));
      heights.push(plan.terrain === "gentle" ? edge * path * 0.6 * (Math.sin(px * 0.23) + Math.cos(pz * 0.21)) : 0);
      mask.push(Math.min(edge, path));
    }
  }
  const preset = getTerrainGrassPreset("meadow");
  const grass = plan.theme !== "plaza" && preset
    ? createTerrainGrassLayers(preset).map((layer) => ({ ...layer, density: Math.min(layer.density, 8), mask })) : [];
  return createTerrainGeometry({ width, depth: width, resolution, heights, grass });
}

function arrange(plan: JevWorldPlan, terrain: TerrainGeometry): Placement[] {
  const placed: Placement[] = [];
  const half = terrain.width / 2;
  const fits = (x: number, z: number, radius: number) =>
    Math.abs(x) + radius < half - 1 && Math.abs(z) + radius < half - 1 &&
    placed.every((other) => Math.hypot(x - other.position[0], z - other.position[2]) >= radius + other.radius + 0.6);
  for (const [elementName, definition] of Object.entries(ELEMENTS)) {
    const element = elementName as Element;
    const count = countFor(plan, element);
    for (let index = 0; index < count; index += 1) {
      let point: [number, number] | undefined;
      if (element === "campfire") point = [0, -2];
      if (element === "fountain") point = [0, -7];
      if (element === "bench") point = [[-4, -1], [4, -1], [-4, 3]][index] as [number, number];
      if (element === "lantern") point = [index % 2 === 0 ? -3.6 : 3.6, half * 0.62 - Math.floor(index / 2) * 3.7];
      if (!point || !fits(...point, definition.radius)) {
        for (let attempt = 0; attempt < 600; attempt += 1) {
          const seed = index * 37 + attempt + Object.keys(ELEMENTS).indexOf(element) * 53;
          // Use the full square perimeter, including its corners. A narrow
          // ring can run out of room while most of the ground is still empty.
          const reach = half - definition.radius - 1.2;
          const x = (((seed * 0.754877666) % 1) * 2 - 1) * reach;
          const z = (((seed * 0.569840296) % 1) * 2 - 1) * reach;
          const corridor = plan.layout === "path" ? 4 : 3;
          if (Math.abs(x) < corridor || Math.hypot(x, z) < 7.5 || !fits(x, z, definition.radius)) continue;
          point = [x, z];
          break;
        }
      }
      if (!point || !fits(...point, definition.radius)) {
        throw new PlacementSpaceError("この広さでは指定した物を安全に配置できません。広さを大きくするか、個数を減らしてください");
      }
      const [x, z] = point;
      placed.push({
        element, position: [x, sampleTerrainHeight(terrain, x, z), z], radius: definition.radius,
        yaw: element === "bench" ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : index * 2.3999632297,
        scale: element === "tree" ? 0.9 + (index % 5) * 0.06 : 1,
      });
    }
  }
  return placed;
}

function freeOrigin(bundle: PrototypeVisualProject, width: number): Vec3 {
  let right: number | null = null;
  for (const id of bundle.scene.rootEntityIds) {
    const measured = getEntityWorldBounds(bundle.scene, bundle.assets, id);
    if (measured.unmeasured.length) throw new Error("既存のモデルの大きさを確認できません。素材の読み込みを完了してから実行してください");
    if (measured.world) right = Math.max(right ?? Number.NEGATIVE_INFINITY, measured.world.max[0]);
  }
  return [right === null ? 0 : right + width / 2 + 6, 0, 0];
}

function appendMaterial(assets: AssetManifest, name: string, shader?: MaterialAsset["shader"]) {
  const material = createDefaultMaterialAsset({ id: createDocumentId("material"), name, properties: { color: "#c1b9ab", roughness: 0.95 } });
  if (!material) throw new Error("地表のマテリアルを作成できませんでした");
  const complete = shader ? { ...material, shader } : material;
  return { assets: { ...assets, assets: { ...assets.assets, [material.id]: complete } }, materialId: material.id };
}

function addRecipeColliders(scene: SceneDocument, rootId: string, element: Element): SceneDocument {
  const entities = { ...scene.entities };
  if (element === "tree") {
    const root = entities[rootId];
    entities[rootId] = { ...root, components: [...root.components, createBoxColliderComponent(createDocumentId("collider"), {
      halfExtents: [0.18, 1.4, 0.18], center: [0, 1.4, 0], fitMode: "manual",
    })] };
  } else {
    const pending = [rootId];
    while (pending.length) {
      const entity = entities[pending.pop()!];
      if (!entity) continue;
      pending.push(...entity.children);
      if (entity.components.some((component) => component.type === "mesh") &&
          !entity.components.some((component) => component.type === "collider")) {
        entities[entity.id] = { ...entity, components: [...entity.components,
          createMeshColliderComponent(createDocumentId("collider"), { meshMode: "trimesh" })] };
      }
    }
  }
  return { ...scene, entities };
}

/** Prepares a complete Scene independently. The caller commits the result once. */
export async function prepareJevWorld(
  bundle: PrototypeVisualProject, plan: JevWorldPlan, projectPath: string,
  options: JevWorldBuildOptions = {},
): Promise<JevWorldBuildResult> {
  options.assertCurrent?.();
  if (bundle.project.projectKind !== "world" || !projectPath.trim()) throw new Error("保存済みのワールドを開いてください");
  // Validate even typed callers; imported JSON must not bypass finite choices.
  resolveJevWorldPlan({ answers: Object.fromEntries(Object.entries(plan).map(([key, value]) => [key, { choice: value }])) });
  let width = WIDTHS[plan.size];
  let terrain = terrainFor(plan, width);
  let placements: Placement[] = [];
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    try {
      placements = arrange(plan, terrain);
      break;
    } catch (error) {
      if (!(error instanceof PlacementSpaceError) || attempt === 4) throw error;
      // Keep every requested kind and count; a slightly wider area is more
      // useful than dropping the rocks after filling the space with trees.
      width += 4;
      terrain = terrainFor(plan, width);
    }
  }
  const origin = freeOrigin(bundle, width);
  const group = createEmptyEntity(bundle.scene, null, `Jev · ${THEMES[plan.theme]}`);
  if (!group) throw new Error("作成先のグループを追加できませんでした");
  let scene = updateEntityTransform(group.scene, group.entityId, { position: origin });
  let assets = bundle.assets;
  const summary: string[] = [`${THEMES[plan.theme]} · ${width}m四方`];
  if (width !== WIDTHS[plan.size]) summary.push("指定した物が収まるように広さを調整");
  options.onProgress?.("歩ける地面と入口を用意しています");
  const surface = getTerrainSurfacePreset(plan.theme === "forest" ? "forest-floor" : "meadow-slopes");
  const groundMaterial = appendMaterial(assets, `${THEMES[plan.theme]}の地表`,
    plan.theme !== "plaza" && surface ? applyTerrainSurfaceParameters(surface, fitTerrainSurfaceToRange(surface, terrainHeightRange(terrain))) : undefined);
  assets = groundMaterial.assets;
  const ground = addTerrainEntity(scene, assets, groundMaterial.materialId, { ...terrain, name: "歩ける地面" });
  if (!ground) throw new Error("地面を作成できませんでした");
  scene = reparentEntityHierarchy(ground.scene, ground.entityId, group.entityId);
  const spawn = createEmptyEntity(scene, group.entityId, "開始位置");
  if (!spawn) throw new Error("開始位置を作成できませんでした");
  const localSpawn: Vec3 = [0, 0.08, width * 0.32];
  scene = updateEntityTransform(spawn.scene, spawn.entityId, { position: localSpawn });
  const spawnComponent = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint, { properties: { position: [0, 0, 0], yaw: 0 } });
  if (!spawnComponent) throw new Error("開始位置のComponentを作成できませんでした");
  scene = { ...scene, entities: { ...scene.entities, [spawn.entityId]: {
    ...scene.entities[spawn.entityId], components: [...scene.entities[spawn.entityId].components,
      spawnComponent],
  } } };

  const installed = new Map<Element, string>();
  const install = options.installRecipe ?? instantiateSceneRecipe;
  for (const placement of placements) {
    options.assertCurrent?.();
    const recipe = getSceneRecipe(ELEMENTS[placement.element].id);
    if (!recipe) throw new Error("必要な素材が見つかりませんでした");
    options.onProgress?.(`${recipe.name}を配置しています`);
    let entityId = installed.get(placement.element);
    if (!entityId) {
      const result = await install(scene, assets, recipe.id, "world", projectPath, [0, 0, 0]);
      options.assertCurrent?.();
      if (!result) throw new Error(`「${recipe.name}」を読み込めませんでした。編集内容は変更していません`);
      scene = reparentEntityHierarchy(result.scene, result.rootEntityId, group.entityId);
      assets = result.assets;
      entityId = result.rootEntityId;
      scene = addRecipeColliders(scene, entityId, placement.element);
      installed.set(placement.element, entityId);
    } else {
      const duplicated = duplicateEntityHierarchy(scene, [entityId], (kind) => createDocumentId(kind), group.entityId);
      if (!duplicated) throw new Error(`「${recipe.name}」を複製できませんでした`);
      scene = duplicated.scene;
      entityId = duplicated.clone.rootEntityIds[0];
    }
    scene = updateEntityTransform(scene, entityId, { position: placement.position, rotation: [0, placement.yaw, 0], scale: [placement.scale, placement.scale, placement.scale] });
  }
  for (const element of Object.keys(ELEMENTS) as Element[]) {
    const count = countFor(plan, element);
    if (count) summary.push(`${getSceneRecipe(ELEMENTS[element].id)!.name} × ${count}`);
  }

  if (plan.environment === "apply") {
    options.onProgress?.("空と照明を整えています");
    const night = plan.time === "night";
    const sunset = plan.time === "sunset";
    const skyId = night && plan.sky === "stars" ? "starfield-night" : night ? "moonlit-night" : sunset ? "golden-sunset" : "daylight-clear";
    const sky = SKY_SHADER_CATALOG.find((entry) => entry.id === skyId);
    if (!sky) throw new Error("空の素材が見つかりませんでした");
    const skyMaterial = appendMaterial(assets, sky.label, applySkyShaderParameters(sky, plan.sky === "clouds" ? { uCloudCoverage: 0.65 } : {}));
    assets = skyMaterial.assets;
    const color = night ? "#8fa7de" : sunset ? "#ffb36b" : "#fff4df";
    const intensity = night ? 0.22 : sunset ? 1.4 : 2.4;
    const lights = Object.values(scene.entities).flatMap((entity) => entity.components
      .filter((component) => component.type === "light" && component.enabled && component.lightType === "directional")
      .map((component) => ({ entityId: entity.id, componentId: component.id })));
    if (lights.length) {
      const entities = { ...scene.entities };
      for (const light of lights) {
        const entity = entities[light.entityId];
        entities[entity.id] = { ...entity, components: entity.components.map((component) =>
          component.id === light.componentId && component.type === "light" ? { ...component, color, intensity: intensity / lights.length } : component) };
      }
      scene = { ...scene, entities };
    } else {
      const sun = createEmptyEntity(scene, group.entityId, night ? "月明かり" : "太陽光");
      if (!sun) throw new Error("照明を作成できませんでした");
      scene = updateEntityTransform(sun.scene, sun.entityId, { position: [4, 8, 3], rotation: [-0.7, 0.6, 0] });
      scene = { ...scene, entities: { ...scene.entities, [sun.entityId]: { ...scene.entities[sun.entityId], components: [...scene.entities[sun.entityId].components,
        { id: createDocumentId("light"), type: "light", enabled: true, lightType: "directional", color, intensity, castShadow: true }],
      } } };
    }
    const settings = resolveSceneSettings(scene.settings);
    scene = { ...scene, settings: { ...settings,
      skybox: { ...settings.skybox, enabled: true, iblEnabled: false, projection: "infinite", imageAssetId: undefined, materialAssetId: skyMaterial.materialId },
      ambient: { enabled: true, color, intensity: night ? 0.18 : 0.35 },
      fog: { enabled: true, color: night ? "#101728" : sunset ? "#c2a596" : "#bdcbd6", near: width * 0.8, far: width * 4 },
    } };
    summary.push("空と照明を設定");
  }
  if (plan.finish !== "keep") {
    const settings = resolveSceneSettings(scene.settings);
    scene = { ...scene, settings: { ...settings, postprocessing: { ...settings.postprocessing,
      enabled: plan.finish === "bloom", bloom: { ...settings.postprocessing.bloom, enabled: plan.finish === "bloom", strength: 0.3, threshold: 1, radius: 0.4 },
    } } };
    summary.push(plan.finish === "bloom" ? "控えめなBloom" : "Post Effectsを無効化");
  }
  scene = { ...scene, rootEntityIds: [group.entityId, ...scene.rootEntityIds.filter((id) => id !== group.entityId)] };
  summary.push("開始位置を作成した場所に設定");
  options.assertCurrent?.();
  return {
    bundle: { ...bundle, scene, assets, project: { ...bundle.project, metadata: { ...bundle.project.metadata, updatedAt: new Date().toISOString() } } },
    rootEntityId: group.entityId,
    spawnPosition: [origin[0], localSpawn[1], localSpawn[2]],
    summary,
    counts: { entities: Object.keys(scene.entities).length - Object.keys(bundle.scene.entities).length, recipes: placements.length, recipeKinds: installed.size },
  };
}
