import {
  BUILTIN_PREFAB_RECIPE_IDS,
  listBuiltinPrefabRecipes,
} from "./builtin-prefab-catalog";
import {
  getSceneRecipesForProjectKind,
  type SceneRecipe,
  type SceneRecipeCategory,
} from "./scene-recipe-catalog";
import { TERRAIN_PRESETS } from "./terrain-presets";
import { TERRAIN_SURFACE_CATALOG } from "./terrain-surface-catalog";
import {
  getTransform,
  type SceneDocument,
  type Vec3,
} from "./scene-document";

export const FAST_AUTHORING_MAX_ELEMENTS = 50;
export const FAST_AUTHORING_MAX_FACILITIES = 6;
export const FAST_AUTHORING_MAX_PRIMITIVES = 6;

export type FastAuthoringPlacement =
  | "center"
  | "near-spawn"
  | "front-left"
  | "front-right"
  | "left"
  | "right"
  | "back-left"
  | "back-right"
  | "far"
  | "perimeter-left"
  | "perimeter-right";
export type FastAuthoringMood = "daylight" | "sunset" | "night" | "foggy";
export type FastAuthoringDensity = "sparse" | "balanced" | "lively";
export type FastAuthoringScale = "compact" | "balanced" | "wide";
export type FastAuthoringComposition =
  | "focal-center"
  | "open-center"
  | "path"
  | "ring"
  | "layered"
  | "natural";
export type FastAuthoringDetail =
  | "focused"
  | "rich"
  | "dense"
  | "maximal";
export type FastAuthoringCount =
  | "one"
  | "pair"
  | "few"
  | "group"
  | "many"
  | "mass";
export type FastAuthoringFinish =
  | "clean"
  | "natural-depth"
  | "cinematic"
  | "night-glow"
  | "soft-dream";
export type FastAuthoringWind = "still" | "breeze" | "windy";

export type FastAuthoringPrimitiveHelper =
  | "none"
  | "platform"
  | "path-marker"
  | "rest-step"
  | "low-wall"
  | "pedestal";

export type FastAuthoringTraceItem = { label: string; value: string };
export type FastAuthoringRecipeDecision = {
  role: string;
  recipeId: string;
  placement: FastAuthoringPlacement;
  position: Vec3;
  instanceIndex: number;
  instanceCount: number;
};
export type FastAuthoringFacilityDecision = {
  recipeId: string;
  name: string;
  placement: FastAuthoringPlacement;
  position: Vec3;
  heightOffset: number;
  configurationHint: string | null;
};
export type FastAuthoringPrimitiveDecision = {
  kind: Exclude<FastAuthoringPrimitiveHelper, "none">;
  shape: "box" | "cylinder";
  position: Vec3;
  scale: Vec3;
  name: string;
};
export type FastAuthoringDecision = {
  terrain: string;
  mood: FastAuthoringMood;
  density: FastAuthoringDensity;
  scale: FastAuthoringScale;
  composition: FastAuthoringComposition;
  detail: FastAuthoringDetail;
  terrainSurface: string;
  finish: FastAuthoringFinish;
  wind: FastAuthoringWind;
  elementBudget: number;
  recipes: FastAuthoringRecipeDecision[];
  facilities: FastAuthoringFacilityDecision[];
  primitives: FastAuthoringPrimitiveDecision[];
  decisionTrace: FastAuthoringTraceItem[];
};

type FastAuthoringRecipeRole = {
  id: string;
  label: string;
  instruction: string;
  variants: number;
  maxCount: number;
  categories?: readonly SceneRecipeCategory[];
  tutorialGroups?: readonly string[];
};

export const FAST_AUTHORING_RECIPE_ROLES: readonly FastAuthoringRecipeRole[] = [
  {
    id: "signature",
    label: "主役",
    instruction:
      "ワールドを一目で説明できる主役を選んでください。不要ならnone。",
    variants: 1,
    maxCount: 1,
    categories: [
      "light",
      "nature",
      "water",
      "structure",
      "furniture",
      "effect",
      "tutorial",
    ],
  },
  {
    id: "landscape",
    label: "景観",
    instruction:
      "自然・水・建物・天候から、場所らしさを作る要素を選んでください。異なる種類を混ぜて構いません。",
    variants: 3,
    maxCount: 12,
    categories: ["nature", "water", "structure", "weather"],
  },
  {
    id: "furniture",
    label: "家具・設備",
    instruction:
      "家具、休憩、建築部品など空間を成立させる要素を選んでください。",
    variants: 3,
    maxCount: 8,
    categories: ["furniture", "structure"],
  },
  {
    id: "lighting",
    label: "照明",
    instruction:
      "時間帯、導線、主役を補う灯りや発光表現を選んでください。",
    variants: 3,
    maxCount: 10,
    categories: ["light"],
    tutorialGroups: ["照明・発光"],
  },
  {
    id: "atmosphere",
    label: "天気・演出",
    instruction:
      "雪、雨、霧、花びら、魔法など空気感を作る演出を選んでください。",
    variants: 2,
    maxCount: 3,
    categories: ["weather", "effect", "nature"],
    tutorialGroups: ["パーティクル"],
  },
  {
    id: "interaction",
    label: "しかけ",
    instruction:
      "操作、音、表示、動きなど体験に必要なしかけを選んでください。景観だけならnone。",
    variants: 3,
    maxCount: 4,
    categories: ["tutorial"],
  },
  {
    id: "material",
    label: "マテリアル表現",
    instruction:
      "Clearcoat、Transmission、Iridescenceなど、見た目の見本を置く意味がある場合だけ選んでください。",
    variants: 2,
    maxCount: 4,
    categories: ["material"],
  },
] as const;

export const FAST_AUTHORING_PLACEMENT_CRITERIA: Record<
  FastAuthoringPlacement,
  string
> = {
  center: "ワールドの中心。主役向け",
  "near-spawn": "Spawnから少し進んだ入口側",
  "front-left": "入口側の左",
  "front-right": "入口側の右",
  left: "中心の左側",
  right: "中心の右側",
  "back-left": "中心より奥の左側",
  "back-right": "中心より奥の右側",
  far: "中心よりさらに奥。遠景向け",
  "perimeter-left": "中央を空けた左外周",
  "perimeter-right": "中央を空けた右外周",
};
export const FAST_AUTHORING_MOOD_CRITERIA: Record<
  FastAuthoringMood,
  string
> = {
  daylight: "明るい昼。見通しがよく自然な色",
  sunset: "暖色の夕方。柔らかくドラマチック",
  night: "暗い夜。低い環境光で光源が映える",
  foggy: "霧のある空気感。奥行きを霧で包む",
};
export const FAST_AUTHORING_DENSITY_CRITERIA: Record<
  FastAuthoringDensity,
  string
> = {
  sparse: "広い余白を取り、配置同士を離す",
  balanced: "余白と情報量を両立する",
  lively: "配置を増やして賑やかにする",
};
export const FAST_AUTHORING_SCALE_CRITERIA: Record<
  FastAuthoringScale,
  string
> = {
  compact: "小さな一角。移動距離を短くまとめる",
  balanced: "一般的なWorld規模",
  wide: "景観や遠景を含む広いWorld",
};
export const FAST_AUTHORING_COMPOSITION_CRITERIA: Record<
  FastAuthoringComposition,
  string
> = {
  "focal-center": "中央に主役を置き、周囲へ補助要素を展開する",
  "open-center": "中央を歩ける余白として空け、要素を外周へ置く",
  path: "Spawnから奥へ進む流れに沿って配置する",
  ring: "中心の周囲を囲むように分散する",
  layered: "手前・中央・奥の3層で奥行きを作る",
  natural: "左右対称を避け、自然なばらつきで配置する",
};
export const FAST_AUTHORING_DETAIL_CRITERIA: Record<
  FastAuthoringDetail,
  string
> = {
  focused: "主役中心。全体でおよそ12配置まで",
  rich: "十分に作り込む。全体でおよそ24配置まで",
  dense: "情報量の多いWorld。全体でおよそ36配置まで",
  maximal: "大型Worldや大量配置。最大50配置まで",
};
export const FAST_AUTHORING_COUNT_CRITERIA: Record<
  FastAuthoringCount,
  string
> = {
  one: "1個だけ置く",
  pair: "2個置く",
  few: "3個置く",
  group: "5個程度のまとまりを作る",
  many: "8個程度を繰り返して配置する",
  mass: "12個程度を群生・列・まとまりとして配置する",
};
export const FAST_AUTHORING_FINISH_CRITERIA: Record<
  FastAuthoringFinish,
  string
> = {
  clean: "Post Effectを使わず軽く自然に見せる",
  "natural-depth": "AOを中心に立体感を足し、Bloomは抑える",
  cinematic: "HDR・AO・控えめなBloom・色味調整で映画的に仕上げる",
  "night-glow": "夜景やEmissiveが映えるようBloomとコントラストを強める",
  "soft-dream": "柔らかいBloomと穏やかな色味で幻想的に仕上げる",
};
export const FAST_AUTHORING_WIND_CRITERIA: Record<
  FastAuthoringWind,
  string
> = {
  still: "風をほぼ感じない静かな空間",
  breeze: "草や水面が少し揺れる自然な風",
  windy: "山・海辺・荒天など、はっきり動きを感じる風",
};

export const FAST_AUTHORING_FINISH_SETTINGS: Record<
  FastAuthoringFinish,
  Record<string, unknown>
> = {
  clean: { enabled: false },
  "natural-depth": {
    enabled: true,
    hdr: { enabled: true, toneMapping: "aces" },
    bloom: { enabled: false },
    ao: {
      enabled: true,
      radius: 8,
      minDistance: 0.005,
      maxDistance: 0.1,
    },
    grading: {
      enabled: true,
      contrast: 1.06,
      saturation: 1.02,
      temperature: 0,
      tint: 0,
    },
    exposure: 1,
  },
  cinematic: {
    enabled: true,
    hdr: { enabled: true, toneMapping: "aces" },
    bloom: {
      enabled: true,
      threshold: 4,
      strength: 0.18,
      radius: 0.24,
    },
    ao: {
      enabled: true,
      radius: 8,
      minDistance: 0.005,
      maxDistance: 0.1,
    },
    grading: {
      enabled: true,
      contrast: 1.1,
      saturation: 1.04,
      temperature: 0.06,
      tint: 0,
    },
    exposure: 1,
  },
  "night-glow": {
    enabled: true,
    hdr: { enabled: true, toneMapping: "aces" },
    bloom: {
      enabled: true,
      threshold: 1.5,
      strength: 0.34,
      radius: 0.3,
    },
    ao: {
      enabled: true,
      radius: 7,
      minDistance: 0.005,
      maxDistance: 0.1,
    },
    grading: {
      enabled: true,
      contrast: 1.12,
      saturation: 1.08,
      temperature: -0.04,
      tint: 0.02,
    },
    exposure: 0.92,
  },
  "soft-dream": {
    enabled: true,
    hdr: { enabled: true, toneMapping: "aces" },
    bloom: {
      enabled: true,
      threshold: 2.5,
      strength: 0.24,
      radius: 0.34,
    },
    ao: { enabled: false },
    grading: {
      enabled: true,
      contrast: 0.98,
      saturation: 0.96,
      temperature: 0.08,
      tint: 0.02,
    },
    exposure: 1.02,
  },
};

export const FAST_AUTHORING_WIND_SETTINGS: Record<
  FastAuthoringWind,
  Record<string, unknown>
> = {
  still: {
    enabled: false,
    windStrength: 0,
    windSpeed: 0,
    gustStrength: 0,
    windDirectionDegrees: 0,
  },
  breeze: {
    enabled: true,
    windStrength: 0.35,
    windSpeed: 0.7,
    gustStrength: 0.18,
    windDirectionDegrees: 35,
  },
  windy: {
    enabled: true,
    windStrength: 0.85,
    windSpeed: 1.35,
    gustStrength: 0.5,
    windDirectionDegrees: 55,
  },
};

export const FAST_AUTHORING_PRIMITIVE_CRITERIA: Record<
  FastAuthoringPrimitiveHelper,
  string
> = {
  none: "Primitiveによる補助レイアウトは追加しない",
  platform: "低いBoxの足場や広場を追加する",
  "path-marker": "Spawn付近へ細いCylinderの目印を追加する",
  "rest-step": "主役の手前へ低いBoxの段を追加する",
  "low-wall": "外周や境界へ低いBoxの壁を追加する",
  pedestal: "展示物や主役を載せる低いCylinder台座を追加する",
};

const DETAIL_BUDGET: Record<FastAuthoringDetail, number> = {
  focused: 12,
  rich: 24,
  dense: 36,
  maximal: FAST_AUTHORING_MAX_ELEMENTS,
};
const COUNT_VALUE: Record<FastAuthoringCount, number> = {
  one: 1,
  pair: 2,
  few: 3,
  group: 5,
  many: 8,
  mass: 12,
};

export const FAST_AUTHORING_MOOD_SETTINGS: Record<
  FastAuthoringMood,
  Record<string, unknown>
> = {
  daylight: {
    skybox: {
      enabled: true,
      topColor: "#72b9f2",
      bottomColor: "#e7f3fb",
      exposure: 1,
    },
    ambient: { color: "#ffffff", intensity: 0.82 },
    fog: { enabled: false },
  },
  sunset: {
    skybox: {
      enabled: true,
      topColor: "#68508a",
      bottomColor: "#f0a06b",
      exposure: 0.9,
    },
    ambient: { color: "#ffd2b8", intensity: 0.62 },
    fog: { enabled: true, color: "#c98f82", near: 28, far: 150 },
  },
  night: {
    skybox: {
      enabled: true,
      topColor: "#071326",
      bottomColor: "#17213a",
      exposure: 0.55,
    },
    ambient: { color: "#8296c8", intensity: 0.32 },
    fog: { enabled: false },
  },
  foggy: {
    skybox: {
      enabled: true,
      topColor: "#8e9aa4",
      bottomColor: "#c9d0d4",
      exposure: 0.8,
    },
    ambient: { color: "#d5dadd", intensity: 0.58 },
    fog: { enabled: true, color: "#aeb8bf", near: 12, far: 80 },
  },
};

function recipeMatchesRole(
  recipe: SceneRecipe,
  role: FastAuthoringRecipeRole,
): boolean {
  if (!role.categories && !role.tutorialGroups) return true;
  if (role.categories?.includes(recipe.category)) return true;
  return Boolean(
    recipe.category === "tutorial" &&
      recipe.group &&
      role.tutorialGroups?.some((group) => recipe.group === group),
  );
}

function recipeCriteria(
  recipes: readonly SceneRecipe[],
  role: FastAuthoringRecipeRole,
): Record<string, string> {
  return Object.fromEntries([
    ["none", role.label + "は追加しない"],
    ...recipes.filter((recipe) => recipeMatchesRole(recipe, role)).map((recipe) => [
      recipe.id,
      [recipe.name, recipe.description, recipe.group, ...(recipe.tags ?? [])]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 160),
    ]),
  ]);
}

function countCriteriaForRole(
  role: FastAuthoringRecipeRole,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(FAST_AUTHORING_COUNT_CRITERIA).filter(([id]) => {
      const value = COUNT_VALUE[id as FastAuthoringCount];
      return value <= role.maxCount;
    }),
  );
}

function createFastAuthoringCatalog() {
  const recipes = getSceneRecipesForProjectKind("world");
  const roleCriteria = Object.fromEntries(
    FAST_AUTHORING_RECIPE_ROLES.map((role) => [
      role.id,
      recipeCriteria(recipes, role),
    ]),
  ) as Record<string, Record<string, string>>;
  const terrainCriteria = Object.fromEntries([
    ["none", "新しいTerrainを追加しない"],
    ...TERRAIN_PRESETS.map((preset) => [
      preset.id,
      preset.label + ": " + preset.description,
    ]),
  ]);
  const terrainSurfaceCriteria = Object.fromEntries([
    ["none", "Terrain Surfaceを追加しない"],
    ...TERRAIN_SURFACE_CATALOG.map((surface) => [
      surface.id,
      surface.label + ": " + surface.description,
    ]),
  ]);
  const facilities = listBuiltinPrefabRecipes("world").filter(
    (recipe) => recipe.id !== BUILTIN_PREFAB_RECIPE_IDS.spawnPoint,
  );
  const facilityCriteria = Object.fromEntries([
    ["none", "XRift公式設備は追加しない"],
    ...facilities.map((recipe) => [
      recipe.id,
      [recipe.name, recipe.description, recipe.configuration?.hint]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 180),
    ]),
  ]);
  return {
    recipes,
    roleCriteria,
    terrainCriteria,
    terrainSurfaceCriteria,
    facilities,
    facilityCriteria,
  };
}
export type FastAuthoringCatalog = ReturnType<
  typeof createFastAuthoringCatalog
>;

export function findTerrainEntityId(scene: SceneDocument): string | null {
  return (
    scene.rootEntityIds.find((entityId) =>
      scene.entities[entityId]?.components.some(
        (component) =>
          component.type === "mesh" &&
          component.geometry?.kind === "terrain",
      ),
    ) ?? null
  );
}

export function buildFastAuthoringRequest({
  prompt,
  scene,
  projectName,
  sceneName,
}: {
  prompt: string;
  scene: SceneDocument;
  projectName: string;
  sceneName: string;
}) {
  const baseCatalog = createFastAuthoringCatalog();
  const terrainCriteria = findTerrainEntityId(scene)
    ? {
        none:
          "Sceneに既存Terrainがあります。重ねて追加せず、既存Terrainを使ってください",
      }
    : baseCatalog.terrainCriteria;
  const catalog = { ...baseCatalog, terrainCriteria };
  const questions: Record<string, unknown> = {
    terrain: {
      type: "choice",
      instructions:
        "依頼に合う地形を選んでください。既存Terrainがある場合やTerrainが不要ならnone。",
      criteria: catalog.terrainCriteria,
    },
    mood: {
      type: "choice",
      instructions: "World全体の時間帯・空気感を選んでください。",
      criteria: FAST_AUTHORING_MOOD_CRITERIA,
    },
    density: {
      type: "choice",
      instructions: "配置同士の距離感を選んでください。",
      criteria: FAST_AUTHORING_DENSITY_CRITERIA,
    },
    scale: {
      type: "choice",
      instructions: "依頼から空間全体の広さを選んでください。",
      criteria: FAST_AUTHORING_SCALE_CRITERIA,
    },
    composition: {
      type: "choice",
      instructions:
        "Spawn、主役、歩ける余白、遠景を考えて構図を選んでください。",
      criteria: FAST_AUTHORING_COMPOSITION_CRITERIA,
    },
    detail: {
      type: "choice",
      instructions:
        "依頼の作り込み量を選んでください。大量配置を求める依頼ではmaximalを使えます。",
      criteria: FAST_AUTHORING_DETAIL_CRITERIA,
    },
    terrainSurface: {
      type: "choice",
      instructions:
        "Terrainがある、または作る場合、依頼に合う地表表現を選んでください。不要ならnone。",
      criteria: catalog.terrainSurfaceCriteria,
    },
    finish: {
      type: "choice",
      instructions:
        "World全体の仕上げとしてPost Effectの方向を選んでください。軽さ優先ならclean。",
      criteria: FAST_AUTHORING_FINISH_CRITERIA,
    },
    wind: {
      type: "choice",
      instructions:
        "草・水面・植生へ与えるWorld全体の風を選んでください。",
      criteria: FAST_AUTHORING_WIND_CRITERIA,
    },
  };

  for (const role of FAST_AUTHORING_RECIPE_ROLES) {
    for (let variant = 0; variant < role.variants; variant += 1) {
      const suffix = role.id + (variant + 1);
      questions[suffix] = {
        type: "choice",
        instructions:
          role.instruction +
          (variant > 0
            ? " すでに同じ役割で選んだ種類とはなるべく違うものを選び、不要ならnone。"
            : ""),
        criteria: catalog.roleCriteria[role.id],
      };
      questions[suffix + "Count"] = {
        type: "choice",
        instructions:
          role.label +
          "としてこの種類を何個置くか選んでください。単体で十分ならone。",
        criteria: countCriteriaForRole(role),
      };
      questions[suffix + "Placement"] = {
        type: "choice",
        instructions:
          role.label +
          "のまとまりの基準位置を選んでください。複数個はこの周辺へ分散されます。",
        criteria: FAST_AUTHORING_PLACEMENT_CRITERIA,
      };
    }
  }

  for (let index = 0; index < FAST_AUTHORING_MAX_FACILITIES; index += 1) {
    questions["facility" + (index + 1)] = {
      type: "choice",
      instructions:
        "Mirror、TagBoard、VideoScreenなどXRift公式設備が用途に必要なら選んでください。不要ならnone。",
      criteria: catalog.facilityCriteria,
    };
    questions["facilityPlacement" + (index + 1)] = {
      type: "choice",
      instructions:
        "公式設備を利用しやすく、主役を邪魔しない場所へ置いてください。",
      criteria: FAST_AUTHORING_PLACEMENT_CRITERIA,
    };
  }

  for (let index = 0; index < FAST_AUTHORING_MAX_PRIMITIVES; index += 1) {
    questions["helper" + (index + 1)] = {
      type: "choice",
      instructions:
        "Scene Recipeや公式設備だけでは足りない足場・台座・導線・境界がある場合だけ補助Primitiveを選んでください。不要ならnone。",
      criteria: FAST_AUTHORING_PRIMITIVE_CRITERIA,
    };
  }

  return {
    catalog,
    request: {
      state: {
        request: prompt,
        limits: {
          maxElements: FAST_AUTHORING_MAX_ELEMENTS,
          maxFacilities: FAST_AUTHORING_MAX_FACILITIES,
          maxPrimitiveHelpers: FAST_AUTHORING_MAX_PRIMITIVES,
        },
        project: {
          name: projectName,
          scene: sceneName,
          entityCount: Object.keys(scene.entities).length,
          existingEntities: Object.values(scene.entities)
            .slice(0, 80)
            .map((entity) => entity.name),
        },
        roles: FAST_AUTHORING_RECIPE_ROLES.map((role) => ({
          id: role.id,
          label: role.label,
          variants: role.variants,
          maxCountPerVariant: role.maxCount,
          candidateCount:
            Object.keys(catalog.roleCriteria[role.id] ?? {}).length - 1,
        })),
        availableFacilities: catalog.facilities.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          configurationHint: recipe.configuration?.hint ?? null,
        })),
      },
      questions,
    },
  };
}

function selectedChoice(
  answers: Record<string, unknown>,
  name: string,
  allowed: Record<string, unknown>,
  fallback: string,
): string {
  const answer = answers[name];
  const selected =
    answer && typeof answer === "object"
      ? (answer as { choice?: unknown }).choice
      : undefined;
  return typeof selected === "string" &&
    Object.prototype.hasOwnProperty.call(allowed, selected)
    ? selected
    : fallback;
}

function isGroundLikeEntity(scene: SceneDocument, entityId: string): boolean {
  const entity = scene.entities[entityId];
  if (!entity) return false;
  return entity.components.some((component) => {
    if (component.type !== "mesh") return false;
    if (component.geometry?.kind === "terrain") return true;
    return (
      component.geometry?.kind === "builtin-primitive" &&
      component.geometry.primitive === "plane"
    );
  });
}

export function findFastAuthoringSpawnPosition(scene: SceneDocument): Vec3 {
  const spawn = Object.values(scene.entities).find((entity) =>
    entity.components.some(
      (component) =>
        component.type === "spawn-point" ||
        (component.type === "xrift-component" &&
          component.schemaId === "xrift.spawn-point"),
    ),
  );
  return spawn
    ? getTransform(scene, spawn.id)?.position ?? [0, 0, 0]
    : [0, 0, 0];
}

function isPlacementObstacle(
  scene: SceneDocument,
  entityId: string,
): boolean {
  const entity = scene.entities[entityId];
  if (!entity || isGroundLikeEntity(scene, entityId)) return false;
  if (entity.children.length > 0) return true;
  return entity.components.some(
    (component) =>
      component.type === "mesh" ||
      component.type === "collider" ||
      component.type === "spawn-point" ||
      (component.type === "xrift-component" &&
        component.schemaId === "xrift.spawn-point"),
  );
}

function occupiedRootPositions(scene: SceneDocument): Vec3[] {
  return scene.rootEntityIds.flatMap((entityId) => {
    if (!isPlacementObstacle(scene, entityId)) return [];
    const position = getTransform(scene, entityId)?.position;
    return position ? [[...position] as Vec3] : [];
  });
}

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function safePosition(
  nominal: Vec3,
  occupied: readonly Vec3[],
  minimumDistance: number,
): Vec3 {
  const offsets: readonly [number, number][] = [
    [0, 0],
    [minimumDistance, 0],
    [-minimumDistance, 0],
    [0, minimumDistance],
    [0, -minimumDistance],
    [minimumDistance, minimumDistance],
    [-minimumDistance, minimumDistance],
    [minimumDistance, -minimumDistance],
    [-minimumDistance, -minimumDistance],
  ];
  const candidate =
    offsets
      .map(
        ([x, z]) =>
          [nominal[0] + x, nominal[1], nominal[2] + z] as Vec3,
      )
      .find((position) =>
        occupied.every(
          (existing) =>
            horizontalDistance(position, existing) >= minimumDistance,
        ),
      ) ?? nominal;
  return [
    Math.round(candidate[0] * 10) / 10,
    candidate[1],
    Math.round(candidate[2] * 10) / 10,
  ];
}

function spreadForScale(scale: FastAuthoringScale): number {
  if (scale === "compact") return 6;
  if (scale === "wide") return 18;
  return 11;
}

function minimumDistanceForDensity(
  density: FastAuthoringDensity,
): number {
  if (density === "sparse") return 4.5;
  if (density === "lively") return 1.8;
  return 2.8;
}

function nominalPosition(
  placement: FastAuthoringPlacement,
  composition: FastAuthoringComposition,
  spread: number,
  spawn: Vec3,
  index: number,
): Vec3 {
  if (placement === "near-spawn") {
    return [spawn[0], 0, spawn[2] - 2];
  }
  let position: Vec3;
  switch (placement) {
    case "front-left":
      position = [-spread * 0.65, 0, spread * 0.55];
      break;
    case "front-right":
      position = [spread * 0.65, 0, spread * 0.55];
      break;
    case "left":
      position = [-spread, 0, 0];
      break;
    case "right":
      position = [spread, 0, 0];
      break;
    case "back-left":
      position = [-spread * 0.68, 0, -spread * 0.68];
      break;
    case "back-right":
      position = [spread * 0.68, 0, -spread * 0.68];
      break;
    case "far":
      position = [0, 0, -spread];
      break;
    case "perimeter-left":
      position = [-spread, 0, -spread * 0.35];
      break;
    case "perimeter-right":
      position = [spread, 0, -spread * 0.35];
      break;
    default:
      position = [0, 0, 0];
  }
  if (placement === "center" && index > 0) {
    if (composition === "open-center") {
      return index % 2 === 0
        ? [-spread * 0.7, 0, -spread * 0.45]
        : [spread * 0.7, 0, -spread * 0.45];
    }
    if (composition === "path") {
      return [0, 0, -spread * Math.min(0.9, 0.2 + index * 0.1)];
    }
    if (composition === "ring") {
      const angle = ((index - 1) / 7) * Math.PI * 2;
      return [
        Math.cos(angle) * spread * 0.7,
        0,
        Math.sin(angle) * spread * 0.7,
      ];
    }
  }
  if (composition === "natural" && placement !== "center") {
    const offset = index % 2 === 0 ? 0.1 : -0.1;
    return [
      position[0] + spread * offset,
      0,
      position[2] - spread * offset * 0.65,
    ];
  }
  return position;
}

function instancePosition(
  anchor: Vec3,
  instanceIndex: number,
  minimumDistance: number,
  roleId: string,
): Vec3 {
  if (instanceIndex === 0) return anchor;
  if (roleId === "lighting") {
    const side = instanceIndex % 2 === 0 ? 1 : -1;
    const step = Math.ceil(instanceIndex / 2);
    return [
      anchor[0] + side * step * minimumDistance * 1.25,
      anchor[1],
      anchor[2],
    ];
  }
  if (roleId === "furniture" || roleId === "interaction") {
    const columns = 3;
    const row = Math.floor((instanceIndex - 1) / columns);
    const column = (instanceIndex - 1) % columns;
    return [
      anchor[0] + (column - 1) * minimumDistance * 1.3,
      anchor[1],
      anchor[2] - (row + 1) * minimumDistance * 1.3,
    ];
  }
  const angle = instanceIndex * 2.399963229728653;
  const radius =
    minimumDistance * (1.2 + Math.sqrt(instanceIndex) * 1.15);
  return [
    anchor[0] + Math.cos(angle) * radius,
    anchor[1],
    anchor[2] + Math.sin(angle) * radius,
  ];
}

function maxInstancesForRecipe(
  recipe: SceneRecipe,
  role: FastAuthoringRecipeRole,
): number {
  if (recipe.assembly) return 1;
  if (recipe.category === "weather" || recipe.category === "effect") {
    return Math.min(role.maxCount, 2);
  }
  if (recipe.category === "tutorial") {
    return Math.min(role.maxCount, 3);
  }
  if (recipe.category === "material") {
    return Math.min(role.maxCount, 3);
  }
  if (recipe.parts.length >= 12) {
    return Math.min(role.maxCount, 3);
  }
  return role.maxCount;
}

function primitiveDecision(
  kind: FastAuthoringPrimitiveHelper,
  spawn: Vec3,
  occupied: readonly Vec3[],
  minimumDistance: number,
  index: number,
): FastAuthoringPrimitiveDecision | null {
  if (kind === "none") return null;
  if (kind === "path-marker") {
    return {
      kind,
      shape: "cylinder",
      position: safePosition(
        [spawn[0] + ((index % 3) - 1) * 1.4, 0, spawn[2] - 1.5],
        occupied,
        Math.max(1.1, minimumDistance * 0.45),
      ),
      scale: [0.28, 1.6, 0.28],
      name: "入口の目印",
    };
  }
  if (kind === "rest-step") {
    return {
      kind,
      shape: "box",
      position: safePosition(
        [((index % 3) - 1) * 3.4, 0, 3.5],
        occupied,
        minimumDistance,
      ),
      scale: [3.2, 0.45, 1.2],
      name: "休憩スペースの段",
    };
  }
  if (kind === "low-wall") {
    return {
      kind,
      shape: "box",
      position: safePosition(
        [index % 2 === 0 ? -5 : 5, 0, -2 - index],
        occupied,
        minimumDistance,
      ),
      scale: [3.8, 0.8, 0.3],
      name: "低い境界壁",
    };
  }
  if (kind === "pedestal") {
    return {
      kind,
      shape: "cylinder",
      position: safePosition(
        [((index % 3) - 1) * 3, 0, -2.5],
        occupied,
        minimumDistance,
      ),
      scale: [1.8, 0.7, 1.8],
      name: "展示台座",
    };
  }
  return {
    kind: "platform",
    shape: "box",
    position: safePosition(
      [((index % 3) - 1) * 5, 0, -3 - index],
      occupied,
      minimumDistance,
    ),
    scale: [4.5, 0.4, 3.5],
    name: "補助プラットフォーム",
  };
}

export function resolveFastAuthoringDecision({
  response,
  scene,
  catalog,
  maxElements = FAST_AUTHORING_MAX_ELEMENTS,
}: {
  response: Record<string, unknown>;
  scene: SceneDocument;
  catalog: FastAuthoringCatalog;
  maxElements?: number;
}): FastAuthoringDecision {
  const answers =
    response.answers && typeof response.answers === "object"
      ? (response.answers as Record<string, unknown>)
      : {};
  const terrain = selectedChoice(
    answers,
    "terrain",
    catalog.terrainCriteria,
    "none",
  );
  const mood = selectedChoice(
    answers,
    "mood",
    FAST_AUTHORING_MOOD_CRITERIA,
    "daylight",
  ) as FastAuthoringMood;
  const density = selectedChoice(
    answers,
    "density",
    FAST_AUTHORING_DENSITY_CRITERIA,
    "balanced",
  ) as FastAuthoringDensity;
  const scale = selectedChoice(
    answers,
    "scale",
    FAST_AUTHORING_SCALE_CRITERIA,
    "balanced",
  ) as FastAuthoringScale;
  const composition = selectedChoice(
    answers,
    "composition",
    FAST_AUTHORING_COMPOSITION_CRITERIA,
    "focal-center",
  ) as FastAuthoringComposition;
  const detail = selectedChoice(
    answers,
    "detail",
    FAST_AUTHORING_DETAIL_CRITERIA,
    "rich",
  ) as FastAuthoringDetail;
  const terrainSurface = selectedChoice(
    answers,
    "terrainSurface",
    catalog.terrainSurfaceCriteria,
    "none",
  );
  const finish = selectedChoice(
    answers,
    "finish",
    FAST_AUTHORING_FINISH_CRITERIA,
    "clean",
  ) as FastAuthoringFinish;
  const wind = selectedChoice(
    answers,
    "wind",
    FAST_AUTHORING_WIND_CRITERIA,
    "breeze",
  ) as FastAuthoringWind;
  const elementBudget = Math.min(
    FAST_AUTHORING_MAX_ELEMENTS,
    Math.max(1, Math.min(maxElements, DETAIL_BUDGET[detail])),
  );

  const spread = spreadForScale(scale);
  const minimumDistance = minimumDistanceForDensity(density);
  const spawn = findFastAuthoringSpawnPosition(scene);
  const occupied = occupiedRootPositions(scene);
  const placed = [...occupied];

  const facilities: FastAuthoringFacilityDecision[] = [];
  const usedFacilityIds = new Set<string>();
  for (let index = 0; index < FAST_AUTHORING_MAX_FACILITIES; index += 1) {
    const recipeId = selectedChoice(
      answers,
      "facility" + (index + 1),
      catalog.facilityCriteria,
      "none",
    );
    if (recipeId === "none" || usedFacilityIds.has(recipeId)) continue;
    const recipe = catalog.facilities.find(
      (candidate) => candidate.id === recipeId,
    );
    if (!recipe) continue;
    const placement = selectedChoice(
      answers,
      "facilityPlacement" + (index + 1),
      FAST_AUTHORING_PLACEMENT_CRITERIA,
      index % 2 === 0 ? "right" : "left",
    ) as FastAuthoringPlacement;
    facilities.push({
      recipeId,
      name: recipe.name,
      placement,
      position: [0, 0, 0],
      heightOffset: recipe.defaultTransform.position[1],
      configurationHint: recipe.configuration?.hint ?? null,
    });
    usedFacilityIds.add(recipeId);
  }

  const primitiveKinds: Array<Exclude<FastAuthoringPrimitiveHelper, "none">> =
    [];
  const usedHelperKinds = new Set<string>();
  for (let index = 0; index < FAST_AUTHORING_MAX_PRIMITIVES; index += 1) {
    const kind = selectedChoice(
      answers,
      "helper" + (index + 1),
      FAST_AUTHORING_PRIMITIVE_CRITERIA,
      "none",
    ) as FastAuthoringPrimitiveHelper;
    if (kind === "none" || usedHelperKinds.has(kind)) continue;
    usedHelperKinds.add(kind);
    primitiveKinds.push(kind);
  }

  const reserved = Math.min(
    elementBudget,
    facilities.length + primitiveKinds.length,
  );
  let remainingRecipeBudget = Math.max(0, elementBudget - reserved);
  const recipes: FastAuthoringRecipeDecision[] = [];
  const recipeTrace: FastAuthoringTraceItem[] = [];
  const usedArchetypeIds = new Set<string>();
  let archetypeIndex = 0;

  for (const role of FAST_AUTHORING_RECIPE_ROLES) {
    for (let variant = 0; variant < role.variants; variant += 1) {
      if (remainingRecipeBudget <= 0) break;
      const suffix = role.id + (variant + 1);
      const criteria = catalog.roleCriteria[role.id] ?? { none: "" };
      const recipeId = selectedChoice(
        answers,
        suffix,
        criteria,
        "none",
      );
      if (recipeId === "none" || usedArchetypeIds.has(recipeId)) continue;
      const recipe = catalog.recipes.find(
        (candidate) => candidate.id === recipeId,
      );
      if (!recipe) continue;
      const countChoice = selectedChoice(
        answers,
        suffix + "Count",
        countCriteriaForRole(role),
        "one",
      ) as FastAuthoringCount;
      const requestedCount = COUNT_VALUE[countChoice] ?? 1;
      const count = Math.min(
        requestedCount,
        maxInstancesForRecipe(recipe, role),
        remainingRecipeBudget,
      );
      if (count <= 0) continue;
      const placement = selectedChoice(
        answers,
        suffix + "Placement",
        FAST_AUTHORING_PLACEMENT_CRITERIA,
        role.id === "signature"
          ? "center"
          : archetypeIndex % 2 === 0
            ? "left"
            : "right",
      ) as FastAuthoringPlacement;
      const anchor = nominalPosition(
        placement,
        composition,
        spread,
        spawn,
        archetypeIndex,
      );
      let placedCount = 0;
      for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
        const position = safePosition(
          instancePosition(
            anchor,
            instanceIndex,
            minimumDistance,
            role.id,
          ),
          placed,
          minimumDistance,
        );
        placed.push(position);
        recipes.push({
          role: role.label,
          recipeId,
          placement,
          position,
          instanceIndex,
          instanceCount: count,
        });
        placedCount += 1;
      }
      usedArchetypeIds.add(recipeId);
      remainingRecipeBudget -= placedCount;
      recipeTrace.push({
        label: role.label,
        value:
          recipe.name +
          " × " +
          placedCount +
          " → " +
          placement,
      });
      archetypeIndex += 1;
    }
  }

  for (let index = 0; index < facilities.length; index += 1) {
    const facility = facilities[index];
    const anchor = nominalPosition(
      facility.placement,
      composition,
      spread,
      spawn,
      archetypeIndex + index,
    );
    const position = safePosition(anchor, placed, minimumDistance);
    placed.push(position);
    facilities[index] = { ...facility, position };
  }

  const primitives: FastAuthoringPrimitiveDecision[] = [];
  for (let index = 0; index < primitiveKinds.length; index += 1) {
    const helper = primitiveDecision(
      primitiveKinds[index],
      spawn,
      placed,
      minimumDistance,
      index,
    );
    if (!helper) continue;
    placed.push(helper.position);
    primitives.push(helper);
  }

  const decisionTrace: FastAuthoringTraceItem[] = [
    {
      label: "地形",
      value:
        terrain === "none"
          ? findTerrainEntityId(scene)
            ? "既存Terrainを使う"
            : "追加しない"
          : TERRAIN_PRESETS.find((preset) => preset.id === terrain)?.label ??
            terrain,
    },
    { label: "雰囲気", value: mood },
    { label: "構図", value: composition },
    { label: "広さ", value: scale },
    { label: "密度", value: density },
    {
      label: "作り込み",
      value: detail + " / 最大" + elementBudget + "配置",
    },
    {
      label: "地表",
      value:
        terrainSurface === "none"
          ? "変更しない"
          : TERRAIN_SURFACE_CATALOG.find(
              (surface) => surface.id === terrainSurface,
            )?.label ?? terrainSurface,
    },
    { label: "仕上げ", value: finish },
    { label: "風", value: wind },
    ...recipeTrace,
    ...facilities.map((facility, index) => ({
      label: "公式設備" + (index + 1),
      value: facility.name + " → " + facility.placement,
    })),
    ...primitives.map((primitive, index) => ({
      label: "補助" + (index + 1),
      value: primitive.name,
    })),
  ];

  return {
    terrain,
    mood,
    density,
    scale,
    composition,
    detail,
    terrainSurface,
    finish,
    wind,
    elementBudget,
    recipes,
    facilities,
    primitives,
    decisionTrace,
  };
}
