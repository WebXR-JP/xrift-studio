import {
  BUILTIN_PREFAB_RECIPE_IDS,
  listBuiltinPrefabRecipes,
} from "./builtin-prefab-catalog";
import {
  getSceneRecipesForProjectKind,
  SCENE_RECIPE_IDS,
  type SceneRecipe,
  type SceneRecipeCategory,
} from "./scene-recipe-catalog";
import { TERRAIN_PRESETS } from "./terrain-presets";
import { TERRAIN_SURFACE_CATALOG } from "./terrain-surface-catalog";
import { TERRAIN_GRASS_PRESETS } from "./terrain-grass";
import { SKY_SHADER_CATALOG } from "./sky-shader-catalog";
import {
  getTransform,
  type FastAuthoringEntityMetadata,
  type SceneDocument,
  type Vec3,
} from "./scene-document";

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
export type FastAuthoringHumanize = "off" | "subtle" | "natural" | "handmade";

export type FastAuthoringZoneId =
  | "entrance"
  | "main"
  | "rest"
  | "view"
  | "perimeter";

export type FastAuthoringEditScope =
  | "append"
  | "replace-generated"
  | "replace-entrance"
  | "replace-main"
  | "replace-rest"
  | "replace-view"
  | "replace-perimeter";

export type FastAuthoringIntentClarity =
  | "clear"
  | "ambiguous-goal"
  | "ambiguous-scale"
  | "ambiguous-focal"
  | "ambiguous-edit-scope"
  | "ambiguous-performance";

export type FastAuthoringDecisionConfidence = {
  minimumCritical: number | null;
  lowConfidenceQuestions: string[];
};

export type FastAuthoringPerformancePlan = {
  budget: {
    entityEquivalentMax: number;
    lightMax: number;
    particleMax: number;
  };
  existing: {
    entityEquivalent: number;
    lights: number;
    particles: number;
  };
  projected: {
    entityEquivalent: number;
    lights: number;
    particles: number;
  };
  clampedSelections: string[];
};

export type FastAuthoringValidationCheck = {
  id: string;
  label: string;
  status: "ok" | "warning";
  message: string;
};

export type FastAuthoringSceneFeatures = {
  spawn: {
    position: Vec3;
    yawRadians: number;
    forward: Vec3;
    clearForwardMeters: number;
  };
  terrain: {
    present: boolean;
    size: [number, number] | null;
    heightRange: [number, number] | null;
    flatCellRatio: number | null;
    walkableCellRatio: number | null;
  };
  occupancy: Record<
    FastAuthoringZoneId,
    {
      obstacleCount: number;
      clearanceMeters: number;
    }
  >;
  performance: {
    rootEntityCount: number;
    meshCount: number;
    lightCount: number;
    particleCount: number;
    colliderCount: number;
  };
  generated: {
    count: number;
    zones: Record<FastAuthoringZoneId, number>;
  };
};

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
  zoneId: FastAuthoringZoneId;
  placement: FastAuthoringPlacement;
  position: Vec3;
  instanceIndex: number;
  instanceCount: number;
  rotation: Vec3;
  scale: Vec3;
};
export type FastAuthoringFacilityDecision = {
  recipeId: string;
  name: string;
  zoneId: FastAuthoringZoneId;
  placement: FastAuthoringPlacement;
  position: Vec3;
  heightOffset: number;
  configurationHint: string | null;
};
export type FastAuthoringPrimitiveDecision = {
  kind: Exclude<FastAuthoringPrimitiveHelper, "none">;
  zoneId: FastAuthoringZoneId;
  shape: "box" | "cylinder";
  position: Vec3;
  scale: Vec3;
  name: string;
};
export type FastAuthoringDecision = {
  intentClarity: FastAuthoringIntentClarity;
  confidence: FastAuthoringDecisionConfidence;
  requiresClarification: boolean;
  clarificationMessage: string | null;
  editScope: FastAuthoringEditScope;
  terrain: string;
  mood: FastAuthoringMood;
  density: FastAuthoringDensity;
  scale: FastAuthoringScale;
  composition: FastAuthoringComposition;
  detail: FastAuthoringDetail;
  terrainSurface: string;
  grassPreset: string;
  skybox: string;
  finish: FastAuthoringFinish;
  wind: FastAuthoringWind;
  humanize: FastAuthoringHumanize;
  performancePlan: FastAuthoringPerformancePlan;
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

export const FAST_AUTHORING_ZONE_CRITERIA: Record<
  FastAuthoringZoneId,
  string
> = {
  entrance: "Spawn直後の入口・案内・導線のZone",
  main: "Worldの主役を置くメインZone",
  rest: "座る・集まる・焚き火などの休憩Zone",
  view: "奥行きや景色を見せる展望・遠景Zone",
  perimeter: "木・岩・境界など中央を囲む外周Zone",
};

export const FAST_AUTHORING_EDIT_SCOPE_CRITERIA: Record<
  FastAuthoringEditScope,
  string
> = {
  append: "既存の生成物は残し、今回の内容を追加する",
  "replace-generated":
    "Fast Authoringで以前生成したEntityだけを全て置き換える。手作業や既存Entityは消さない",
  "replace-entrance": "以前生成した入口Zoneだけを置き換える",
  "replace-main": "以前生成したメインZoneだけを置き換える",
  "replace-rest": "以前生成した休憩Zoneだけを置き換える",
  "replace-view": "以前生成した展望Zoneだけを置き換える",
  "replace-perimeter": "以前生成した外周Zoneだけを置き換える",
};

export const FAST_AUTHORING_INTENT_CLARITY_CRITERIA: Record<
  FastAuthoringIntentClarity,
  string
> = {
  clear:
    "依頼だけで、安全にWorldの構成・主役・規模・編集範囲を決められる",
  "ambiguous-goal":
    "何を体験するWorldなのか、完成形の目的が複数解釈できる",
  "ambiguous-scale":
    "小さな一角か広いWorldかで結果が大きく変わるが依頼から決めにくい",
  "ambiguous-focal":
    "何を主役にするかで構図が大きく変わるが依頼から決めにくい",
  "ambiguous-edit-scope":
    "既存の生成物を残す・置き換える範囲が依頼から安全に決められない",
  "ambiguous-performance":
    "大量配置・重い演出の要求があり、軽さと見た目のどちらを優先するか決めにくい",
};

export const FAST_AUTHORING_AUTONOMY_CONFIDENCE_THRESHOLD = 0.62;
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
  focused: "主役中心。種類と個数をかなり絞る",
  rich: "十分に作り込み、複数のまとまりを置く",
  dense: "情報量の多いWorld。群生や列を積極的に使う",
  maximal: "大型World向け。全体数を固定せず、必要な種類と個数をすべて使う",
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

export const FAST_AUTHORING_HUMANIZE_CRITERIA: Record<
  FastAuthoringHumanize,
  string
> = {
  off: "規則どおりに整列する。展示、建築、機能優先の空間向け",
  subtle:
    "位置を数cm〜十数cm、Yawを数度、Scaleを数%だけ変えて少し手作業感を出す",
  natural:
    "自然物や家具を少し不揃いにして、人が置いたような位置・向き・大きさの差を出す",
  handmade:
    "自然物や小物をより大胆に不揃いにする。建物やUIには強いズレを掛けない",
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

const DETAIL_ROLE_VARIANTS: Record<FastAuthoringDetail, number> = {
  focused: 1,
  rich: 2,
  dense: 3,
  maximal: 3,
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
  const grassPresetCriteria = Object.fromEntries([
    ["keep", "Terrain presetの既定または現在の草設定をそのまま使う"],
    ...TERRAIN_GRASS_PRESETS.map((preset) => [
      preset.id,
      preset.label + ": " + preset.description,
    ]),
  ]);
  const skyboxCriteria = Object.fromEntries([
    ["gradient", "Moodに合わせた軽量なグラデーションSkyboxを使う"],
    ["off", "Skyboxを表示しない"],
    ...SKY_SHADER_CATALOG.map((entry) => [
      entry.id,
      [entry.label, entry.description, ...(entry.tags ?? [])]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 180),
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
    grassPresetCriteria,
    skyboxCriteria,
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

function summarizeFastAuthoringTerrain(
  scene: SceneDocument,
): FastAuthoringSceneFeatures["terrain"] {
  const terrainEntityId = findTerrainEntityId(scene);
  const terrainEntity = terrainEntityId
    ? scene.entities[terrainEntityId]
    : undefined;
  const terrain = terrainEntity?.components.find(
    (component) =>
      component.type === "mesh" &&
      component.geometry?.kind === "terrain",
  );
  if (
    !terrain ||
    terrain.type !== "mesh" ||
    terrain.geometry?.kind !== "terrain"
  ) {
    return {
      present: false,
      size: null,
      heightRange: null,
      flatCellRatio: null,
      walkableCellRatio: null,
    };
  }

  const geometry = terrain.geometry.terrain;
  let minimum = 0;
  let maximum = 0;
  for (const height of geometry.heights) {
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  const cells = geometry.resolution - 1;
  const xStep = geometry.width / cells;
  const zStep = geometry.depth / cells;
  const horizontalStep = Math.max(0.001, Math.min(xStep, zStep));
  let sampledCells = 0;
  let flatCells = 0;
  let walkableCells = 0;

  for (let z = 0; z < cells; z += 1) {
    for (let x = 0; x < cells; x += 1) {
      const cellIndex = z * cells + x;
      if (geometry.holes?.[cellIndex] === true) continue;
      const topLeft = z * geometry.resolution + x;
      const heights = [
        geometry.heights[topLeft],
        geometry.heights[topLeft + 1],
        geometry.heights[topLeft + geometry.resolution],
        geometry.heights[topLeft + geometry.resolution + 1],
      ];
      const localRange = Math.max(...heights) - Math.min(...heights);
      const slopeDegrees =
        (Math.atan2(localRange, horizontalStep) * 180) / Math.PI;
      sampledCells += 1;
      if (slopeDegrees <= 10) flatCells += 1;
      if (slopeDegrees <= 30) walkableCells += 1;
    }
  }

  const ratio = (count: number) =>
    sampledCells > 0
      ? Math.round((count / sampledCells) * 1000) / 1000
      : 0;
  return {
    present: true,
    size: [geometry.width, geometry.depth],
    heightRange: [
      Math.round(minimum * 100) / 100,
      Math.round(maximum * 100) / 100,
    ],
    flatCellRatio: ratio(flatCells),
    walkableCellRatio: ratio(walkableCells),
  };
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
    intentClarity: {
      type: "choice",
      instructions:
        "実行前に、依頼だけで安全にWorldを作れるか判定してください。主役・規模・既存生成物の扱い・負荷方針のどれかが結果を大きく左右し、依頼から決められない場合は対応するambiguousを選んでください。些細な曖昧さはclearで構いません。",
      criteria: FAST_AUTHORING_INTENT_CLARITY_CRITERIA,
    },
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
    grassPreset: {
      type: "choice",
      instructions:
        "Terrainの草表現を選んでください。既定のままでよければkeep。",
      criteria: catalog.grassPresetCriteria,
    },
    skybox: {
      type: "choice",
      instructions:
        "Worldの空を選んでください。軽量な色空ならgradient、空を出さないならoff、表現が必要ならSkybox Shader presetを選んでください。",
      criteria: catalog.skyboxCriteria,
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
    humanize: {
      type: "choice",
      instructions:
        "配置の人間らしい不揃いさを選んでください。自然物や大量配置はnaturalかhandmade、展示・建築・UI中心ならoffかsubtleを優先してください。",
      criteria: FAST_AUTHORING_HUMANIZE_CRITERIA,
    },
    editScope: {
      type: "choice",
      instructions:
        "以前のFast Authoring生成物を直す依頼なら対象Zoneだけを置き換えてください。新規追加ならappend。Fast Authoring以外のEntityは削除対象にしません。",
      criteria:
        createFastAuthoringSceneFeatures(scene).generated.count > 0
          ? FAST_AUTHORING_EDIT_SCOPE_CRITERIA
          : { append: FAST_AUTHORING_EDIT_SCOPE_CRITERIA.append },
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
      questions[suffix + "Zone"] = {
        type: "choice",
        instructions:
          role.label +
          "をどの意味的Zoneへ所属させるか選んでください。後からZone単位で安全に再生成できます。",
        criteria: FAST_AUTHORING_ZONE_CRITERIA,
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
          maxFacilities: FAST_AUTHORING_MAX_FACILITIES,
          maxPrimitiveHelpers: FAST_AUTHORING_MAX_PRIMITIVES,
          note:
            "全体配置数の固定上限はありません。各Recipe種類ごとの複製上限だけを守ります。",
        },
        project: {
          name: projectName,
          scene: sceneName,
          entityCount: Object.keys(scene.entities).length,
          existingEntities: Object.values(scene.entities)
            .slice(0, 80)
            .map((entity) => entity.name),
        },
        sceneFeatures: createFastAuthoringSceneFeatures(scene),
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

function answerConfidence(
  answers: Record<string, unknown>,
  name: string,
): number | null {
  const answer = answers[name];
  if (!answer || typeof answer !== "object") return null;
  const record = answer as Record<string, unknown>;
  for (const key of [
    "confidence",
    "probability",
    "selectedProbability",
    "selected_probability",
  ]) {
    const value = record[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    ) {
      return value;
    }
  }

  const selected =
    typeof record.choice === "string" ? record.choice : null;
  for (const key of ["probabilities", "distribution", "probs"]) {
    const value = record[key];
    if (
      selected &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const probability = (value as Record<string, unknown>)[selected];
      if (
        typeof probability === "number" &&
        Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1
      ) {
        return probability;
      }
    }
  }
  return null;
}

function fastAuthoringDecisionConfidence(
  answers: Record<string, unknown>,
): FastAuthoringDecisionConfidence {
  const criticalQuestions = [
    "intentClarity",
    "editScope",
    "terrain",
    "mood",
    "scale",
    "composition",
    "detail",
    "signature1",
    "signature1Zone",
  ];
  const observed = criticalQuestions.flatMap((name) => {
    const confidence = answerConfidence(answers, name);
    return confidence === null ? [] : [{ name, confidence }];
  });
  return {
    minimumCritical:
      observed.length > 0
        ? Math.min(...observed.map((entry) => entry.confidence))
        : null,
    lowConfidenceQuestions: observed
      .filter(
        (entry) =>
          entry.confidence < FAST_AUTHORING_AUTONOMY_CONFIDENCE_THRESHOLD,
      )
      .map((entry) => entry.name),
  };
}

function clarificationMessageFor(
  clarity: FastAuthoringIntentClarity,
  confidence: FastAuthoringDecisionConfidence,
): string | null {
  if (clarity === "ambiguous-goal") {
    return "どんな体験をするWorldにしたいか、主な目的を1つだけ教えてください";
  }
  if (clarity === "ambiguous-scale") {
    return "小さな一角・通常規模・広いWorldのどれにしたいか教えてください";
  }
  if (clarity === "ambiguous-focal") {
    return "このWorldで一番見せたい主役を1つ教えてください";
  }
  if (clarity === "ambiguous-edit-scope") {
    return "既存の生成物を残すか、どのZoneだけ作り直すか教えてください";
  }
  if (clarity === "ambiguous-performance") {
    return "見た目の作り込みと軽さのどちらを優先するか教えてください";
  }
  if (confidence.lowConfidenceQuestions.length > 0) {
    return "Jevの重要判断の確度が低いため、主役・広さ・残したい既存物をもう少し具体的にしてください";
  }
  return null;
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

type FastAuthoringSpawnFrame = {
  entityId: string | null;
  position: Vec3;
  yawRadians: number;
  forward: Vec3;
  right: Vec3;
};

type OccupiedFootprint = {
  entityId?: string;
  position: Vec3;
  radius: number;
};

function findFastAuthoringSpawnFrame(scene: SceneDocument): FastAuthoringSpawnFrame {
  const spawn = Object.values(scene.entities).find((entity) =>
    entity.components.some(
      (component) =>
        component.type === "spawn-point" ||
        (component.type === "xrift-component" &&
          component.schemaId === "xrift.spawn-point"),
    ),
  );
  const transform = spawn ? getTransform(scene, spawn.id) : undefined;
  const position: Vec3 = transform?.position ?? [0, 0, 0];
  const yawRadians = transform?.rotation?.[1] ?? 0;
  const forward: Vec3 = [
    -Math.sin(yawRadians),
    0,
    -Math.cos(yawRadians),
  ];
  const right: Vec3 = [
    Math.cos(yawRadians),
    0,
    -Math.sin(yawRadians),
  ];
  return {
    entityId: spawn?.id ?? null,
    position,
    yawRadians,
    forward,
    right,
  };
}

export function findFastAuthoringSpawnPosition(scene: SceneDocument): Vec3 {
  return findFastAuthoringSpawnFrame(scene).position;
}

function relativePosition(
  frame: FastAuthoringSpawnFrame,
  rightMeters: number,
  forwardMeters: number,
  y = 0,
): Vec3 {
  return [
    frame.position[0] +
      frame.right[0] * rightMeters +
      frame.forward[0] * forwardMeters,
    y,
    frame.position[2] +
      frame.right[2] * rightMeters +
      frame.forward[2] * forwardMeters,
  ];
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

function placementObstacleRadius(scene: SceneDocument, entityId: string): number {
  const entity = scene.entities[entityId];
  if (!entity) return 0.75;
  const transform = getTransform(scene, entityId);
  const scale = transform?.scale ?? [1, 1, 1];
  const scaleXZ = Math.max(Math.abs(scale[0]), Math.abs(scale[2]), 0.01);
  const box = entity.components.find(
    (component) => component.type === "collider" && component.shape === "box",
  );
  if (box && box.type === "collider" && box.shape === "box") {
    return Math.max(
      0.5,
      Math.hypot(
        box.halfExtents[0] * Math.abs(scale[0]),
        box.halfExtents[2] * Math.abs(scale[2]),
      ),
    );
  }
  if (entity.children.length > 0) return Math.max(2, scaleXZ * 1.5);
  if (
    entity.components.some(
      (component) =>
        component.type === "spawn-point" ||
        (component.type === "xrift-component" &&
          component.schemaId === "xrift.spawn-point"),
    )
  ) {
    return 0.8;
  }
  if (entity.components.some((component) => component.type === "mesh")) {
    return Math.max(0.9, scaleXZ * 1.25);
  }
  return Math.max(0.65, scaleXZ * 0.75);
}

function occupiedRootFootprints(scene: SceneDocument): OccupiedFootprint[] {
  return scene.rootEntityIds.flatMap((entityId) => {
    if (!isPlacementObstacle(scene, entityId)) return [];
    const position = getTransform(scene, entityId)?.position;
    return position
      ? [{
          entityId,
          position: [...position] as Vec3,
          radius: placementObstacleRadius(scene, entityId),
        }]
      : [];
  });
}

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function horizontalDistanceToSegment(
  point: Vec3,
  start: Vec3,
  end: Vec3,
): number {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.000001) {
    return horizontalDistance(point, start);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + dx * t),
    point[2] - (start[2] + dz * t),
  );
}

function positionClearOfFootprints(
  position: Vec3,
  occupied: readonly OccupiedFootprint[],
  radius: number,
  minimumDistance: number,
): boolean {
  return occupied.every((existing) => {
    const required = Math.max(
      minimumDistance,
      radius + existing.radius + 0.25,
    );
    return horizontalDistance(position, existing.position) >= required;
  });
}

function safePosition(
  nominal: Vec3,
  occupied: readonly OccupiedFootprint[],
  minimumDistance: number,
  radius = 0.75,
): Vec3 {
  const candidates: Vec3[] = [[nominal[0], nominal[1], nominal[2]]];
  const ringStep = Math.max(1.2, minimumDistance);
  for (let ring = 1; ring <= 8; ring += 1) {
    const ringRadius = ring * ringStep;
    const points = Math.max(8, ring * 8);
    for (let index = 0; index < points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      candidates.push([
        nominal[0] + Math.cos(angle) * ringRadius,
        nominal[1],
        nominal[2] + Math.sin(angle) * ringRadius,
      ]);
    }
  }
  const clearCandidate = candidates.find((position) =>
    positionClearOfFootprints(position, occupied, radius, minimumDistance),
  );
  const candidate =
    clearCandidate ??
    candidates.reduce((best, position) => {
      const margin = occupied.reduce((minimum, existing) => {
        const required = Math.max(
          minimumDistance,
          radius + existing.radius + 0.25,
        );
        return Math.min(
          minimum,
          horizontalDistance(position, existing.position) - required,
        );
      }, Number.POSITIVE_INFINITY);
      const bestMargin = occupied.reduce((minimum, existing) => {
        const required = Math.max(
          minimumDistance,
          radius + existing.radius + 0.25,
        );
        return Math.min(
          minimum,
          horizontalDistance(best, existing.position) - required,
        );
      }, Number.POSITIVE_INFINITY);
      return margin > bestMargin ? position : best;
    }, candidates[0]);
  return [
    Math.round(candidate[0] * 10) / 10,
    candidate[1],
    Math.round(candidate[2] * 10) / 10,
  ];
}

function zoneOrigin(
  zoneId: FastAuthoringZoneId,
  spread: number,
  frame: FastAuthoringSpawnFrame,
): Vec3 {
  switch (zoneId) {
    case "entrance":
      return relativePosition(frame, 0, Math.max(2.5, spread * 0.18));
    case "rest":
      return relativePosition(frame, spread * 0.22, Math.max(4.5, spread * 0.42));
    case "view":
      return relativePosition(frame, 0, Math.max(8, spread * 0.9));
    case "perimeter":
      return relativePosition(frame, -spread * 0.72, Math.max(5, spread * 0.55));
    case "main":
    default:
      return relativePosition(frame, 0, Math.max(4.5, spread * 0.48));
  }
}

function defaultZoneForRole(
  roleId: string,
  placement: FastAuthoringPlacement,
): FastAuthoringZoneId {
  if (placement === "near-spawn") return "entrance";
  if (placement === "far") return "view";
  if (placement === "perimeter-left" || placement === "perimeter-right") {
    return "perimeter";
  }
  if (roleId === "furniture" || roleId === "lighting" || roleId === "interaction") {
    return "rest";
  }
  if (roleId === "atmosphere") return "view";
  return "main";
}

function placementRadiusForRecipe(recipe: SceneRecipe): number {
  if (recipe.category === "structure" || recipe.category === "water") return 2.2;
  if (recipe.category === "furniture") return 1.25;
  if (recipe.category === "nature") return 1.1;
  if (recipe.category === "light") return 0.85;
  if (recipe.category === "weather" || recipe.category === "effect") return 0.5;
  return 0.8;
}

export function listFastAuthoringGeneratedEntities(scene: SceneDocument): Array<{
  entityId: string;
  metadata: FastAuthoringEntityMetadata;
}> {
  return Object.values(scene.entities).flatMap((entity) => {
    const metadata = entity.authoring?.fastAuthoring;
    return metadata ? [{ entityId: entity.id, metadata }] : [];
  });
}

function fastAuthoringReplacementEntityIds(
  scene: SceneDocument,
  editScope: FastAuthoringEditScope,
): Set<string> {
  if (editScope === "append") return new Set();
  const targetZone =
    editScope === "replace-generated"
      ? null
      : (editScope.replace("replace-", "") as FastAuthoringZoneId);
  const roots = listFastAuthoringGeneratedEntities(scene)
    .filter(
      (entry) =>
        targetZone === null || entry.metadata.zoneId === targetZone,
    )
    .map((entry) => entry.entityId);
  const removed = new Set<string>();
  const visit = (entityId: string) => {
    if (removed.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    removed.add(entityId);
    entity.children.forEach(visit);
  };
  roots.forEach(visit);
  return removed;
}

function performanceAfterEditScope(
  scene: SceneDocument,
  editScope: FastAuthoringEditScope,
): {
  entityEquivalent: number;
  lights: number;
  particles: number;
} {
  const removed = fastAuthoringReplacementEntityIds(scene, editScope);
  let entityEquivalent = 0;
  let lights = 0;
  let particles = 0;
  for (const entity of Object.values(scene.entities)) {
    if (removed.has(entity.id)) continue;
    entityEquivalent += 1;
    for (const component of entity.components) {
      if (component.type === "light") lights += 1;
      if (component.type === "particle-emitter") particles += 1;
    }
  }
  return { entityEquivalent, lights, particles };
}

export function applyFastAuthoringEntityMetadata(
  scene: SceneDocument,
  entityId: string,
  metadata: FastAuthoringEntityMetadata,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        authoring: {
          ...entity.authoring,
          fastAuthoring: metadata,
        },
      },
    },
  };
}

export function createFastAuthoringSceneFeatures(
  scene: SceneDocument,
): FastAuthoringSceneFeatures {
  const spawn = findFastAuthoringSpawnFrame(scene);
  const occupied = occupiedRootFootprints(scene).filter(
    (entry) => entry.entityId !== spawn.entityId,
  );
  let clearForwardMeters = 20;
  for (let distance = 0.5; distance <= 20; distance += 0.5) {
    const point = relativePosition(spawn, 0, distance);
    if (
      occupied.some(
        (entry) =>
          horizontalDistance(point, entry.position) < entry.radius + 0.8,
      )
    ) {
      clearForwardMeters = Math.max(0, distance - 0.5);
      break;
    }
  }

  const zoneCenters: Record<FastAuthoringZoneId, Vec3> = {
    entrance: zoneOrigin("entrance", 11, spawn),
    main: zoneOrigin("main", 11, spawn),
    rest: zoneOrigin("rest", 11, spawn),
    view: zoneOrigin("view", 11, spawn),
    perimeter: zoneOrigin("perimeter", 11, spawn),
  };
  const occupancy = Object.fromEntries(
    (Object.keys(zoneCenters) as FastAuthoringZoneId[]).map((zoneId) => {
      const center = zoneCenters[zoneId];
      const distances = occupied.map(
        (entry) => horizontalDistance(center, entry.position) - entry.radius,
      );
      return [
        zoneId,
        {
          obstacleCount: occupied.filter(
            (entry) => horizontalDistance(center, entry.position) <= 6 + entry.radius,
          ).length,
          clearanceMeters:
            distances.length > 0
              ? Math.max(0, Math.round(Math.min(...distances) * 10) / 10)
              : 20,
        },
      ];
    }),
  ) as FastAuthoringSceneFeatures["occupancy"];

  const allComponents = Object.values(scene.entities).flatMap(
    (entity) => entity.components,
  );
  const generatedEntities = listFastAuthoringGeneratedEntities(scene);
  const generatedZones = {
    entrance: 0,
    main: 0,
    rest: 0,
    view: 0,
    perimeter: 0,
  } satisfies Record<FastAuthoringZoneId, number>;
  for (const entry of generatedEntities) {
    generatedZones[entry.metadata.zoneId] += 1;
  }

  return {
    spawn: {
      position: spawn.position,
      yawRadians: spawn.yawRadians,
      forward: spawn.forward,
      clearForwardMeters: Math.round(clearForwardMeters * 10) / 10,
    },
    terrain: summarizeFastAuthoringTerrain(scene),
    occupancy,
    performance: {
      rootEntityCount: scene.rootEntityIds.length,
      meshCount: allComponents.filter((component) => component.type === "mesh").length,
      lightCount: allComponents.filter((component) => component.type === "light").length,
      particleCount: allComponents.filter(
        (component) => component.type === "particle-emitter",
      ).length,
      colliderCount: allComponents.filter(
        (component) => component.type === "collider",
      ).length,
    },
    generated: {
      count: generatedEntities.length,
      zones: generatedZones,
    },
  };
}

export function validateFastAuthoringScene({
  scene,
  generatedEntityIds,
  focalEntityId,
}: {
  scene: SceneDocument;
  generatedEntityIds: readonly string[];
  focalEntityId?: string | null;
}): FastAuthoringValidationCheck[] {
  const generated = new Set(generatedEntityIds);
  const footprints = occupiedRootFootprints(scene);
  let overlaps = 0;
  for (let left = 0; left < footprints.length; left += 1) {
    for (let right = left + 1; right < footprints.length; right += 1) {
      const a = footprints[left];
      const b = footprints[right];
      if (!generated.has(a.entityId ?? "") && !generated.has(b.entityId ?? "")) {
        continue;
      }
      if (
        horizontalDistance(a.position, b.position) <
        (a.radius + b.radius) * 0.72
      ) {
        overlaps += 1;
      }
    }
  }
  const features = createFastAuthoringSceneFeatures(scene);
  const performanceWarnings =
    features.performance.lightCount >
      FAST_AUTHORING_PERFORMANCE_BUDGET.lightMax ||
    features.performance.particleCount >
      FAST_AUTHORING_PERFORMANCE_BUDGET.particleMax ||
    features.performance.rootEntityCount >
      FAST_AUTHORING_PERFORMANCE_BUDGET.entityEquivalentMax;

  const checks: FastAuthoringValidationCheck[] = [
    {
      id: "overlap",
      label: "重なり",
      status: overlaps === 0 ? "ok" : "warning",
      message:
        overlaps === 0
          ? "生成物と既存Entityの大きな重なりは見つかりませんでした"
          : `${overlaps}件の近接・重なり候補があります。Scene Viewで確認してください`,
    },
    {
      id: "spawn-clearance",
      label: "Spawn前方",
      status: features.spawn.clearForwardMeters >= 2 ? "ok" : "warning",
      message: `前方クリア距離 ${features.spawn.clearForwardMeters}m`,
    },
    {
      id: "performance",
      label: "負荷目安",
      status: performanceWarnings ? "warning" : "ok",
      message: `Root ${features.performance.rootEntityCount} / Light ${features.performance.lightCount} / Particle ${features.performance.particleCount}`,
    },
  ];

  if (focalEntityId) {
    const focal = getTransform(scene, focalEntityId)?.position;
    if (focal) {
      const spawn = findFastAuthoringSpawnFrame(scene);
      const distance = horizontalDistance(spawn.position, focal);
      const blockers = footprints.filter((entry) => {
        if (
          entry.entityId === focalEntityId ||
          entry.entityId === spawn.entityId
        ) {
          return false;
        }
        const toStart = horizontalDistance(entry.position, spawn.position);
        const toEnd = horizontalDistance(entry.position, focal);
        if (toStart >= distance + entry.radius || toEnd >= distance + entry.radius) {
          return false;
        }
        return (
          horizontalDistanceToSegment(
            entry.position,
            spawn.position,
            focal,
          ) < entry.radius + 0.35
        );
      });
      checks.push({
        id: "focal-visibility",
        label: "Spawnから主役",
        status: blockers.length === 0 ? "ok" : "warning",
        message:
          blockers.length === 0
            ? `主役まで ${distance.toFixed(1)}m / 大きな遮蔽物候補なし`
            : `主役まで ${distance.toFixed(1)}m / 遮蔽物候補 ${blockers.length}件`,
      });
    }
  }

  return checks;
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
  spawn: FastAuthoringSpawnFrame,
  zoneId: FastAuthoringZoneId,
  index: number,
): Vec3 {
  const origin = zoneOrigin(zoneId, spread, spawn);
  const localSpread = Math.max(2.5, spread * 0.38);
  if (placement === "near-spawn") {
    return zoneOrigin("entrance", spread, spawn);
  }

  const at = (rightMeters: number, forwardMeters: number): Vec3 => [
    origin[0] +
      spawn.right[0] * rightMeters +
      spawn.forward[0] * forwardMeters,
    0,
    origin[2] +
      spawn.right[2] * rightMeters +
      spawn.forward[2] * forwardMeters,
  ];

  let position: Vec3;
  switch (placement) {
    case "front-left":
      position = at(-localSpread * 0.65, -localSpread * 0.5);
      break;
    case "front-right":
      position = at(localSpread * 0.65, -localSpread * 0.5);
      break;
    case "left":
      position = at(-localSpread, 0);
      break;
    case "right":
      position = at(localSpread, 0);
      break;
    case "back-left":
      position = at(-localSpread * 0.68, localSpread * 0.68);
      break;
    case "back-right":
      position = at(localSpread * 0.68, localSpread * 0.68);
      break;
    case "far":
      position = at(0, localSpread);
      break;
    case "perimeter-left":
      position = at(-localSpread, localSpread * 0.35);
      break;
    case "perimeter-right":
      position = at(localSpread, localSpread * 0.35);
      break;
    default:
      position = origin;
  }

  if (placement === "center" && index > 0) {
    if (composition === "open-center") {
      return index % 2 === 0
        ? at(-localSpread * 0.7, localSpread * 0.45)
        : at(localSpread * 0.7, localSpread * 0.45);
    }
    if (composition === "path") {
      return at(0, localSpread * Math.min(0.9, 0.2 + index * 0.1));
    }
    if (composition === "ring") {
      const angle = ((index - 1) / 7) * Math.PI * 2;
      return at(
        Math.cos(angle) * localSpread * 0.7,
        Math.sin(angle) * localSpread * 0.7,
      );
    }
  }

  if (composition === "natural" && placement !== "center") {
    const offset = index % 2 === 0 ? 0.1 : -0.1;
    return [
      position[0] +
        spawn.right[0] * spread * offset +
        spawn.forward[0] * spread * offset * 0.65,
      0,
      position[2] +
        spawn.right[2] * spread * offset +
        spawn.forward[2] * spread * offset * 0.65,
    ];
  }
  return position;
}

function instancePosition(
  anchor: Vec3,
  instanceIndex: number,
  minimumDistance: number,
  roleId: string,
  frame: FastAuthoringSpawnFrame,
): Vec3 {
  if (instanceIndex === 0) return anchor;
  const offset = (rightMeters: number, forwardMeters: number): Vec3 => [
    anchor[0] +
      frame.right[0] * rightMeters +
      frame.forward[0] * forwardMeters,
    anchor[1],
    anchor[2] +
      frame.right[2] * rightMeters +
      frame.forward[2] * forwardMeters,
  ];
  if (roleId === "lighting") {
    const side = instanceIndex % 2 === 0 ? 1 : -1;
    const step = Math.ceil(instanceIndex / 2);
    return offset(side * step * minimumDistance * 1.25, 0);
  }
  if (roleId === "furniture" || roleId === "interaction") {
    const columns = 3;
    const row = Math.floor((instanceIndex - 1) / columns);
    const column = (instanceIndex - 1) % columns;
    return offset(
      (column - 1) * minimumDistance * 1.3,
      (row + 1) * minimumDistance * 1.3,
    );
  }
  const angle = instanceIndex * 2.399963229728653;
  const radius =
    minimumDistance * (1.2 + Math.sqrt(instanceIndex) * 1.15);
  return offset(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
  );
}

function semanticClusterPosition({
  recipeId,
  zoneId,
  instanceIndex,
  instanceCount,
  spread,
  frame,
}: {
  recipeId: string;
  zoneId: FastAuthoringZoneId;
  instanceIndex: number;
  instanceCount: number;
  spread: number;
  frame: FastAuthoringSpawnFrame;
}): Vec3 | null {
  if (zoneId !== "rest") return null;
  const center = zoneOrigin("rest", spread, frame);

  if (recipeId === SCENE_RECIPE_IDS.campfire) {
    return center;
  }

  if (recipeId === SCENE_RECIPE_IDS.bench) {
    const count = Math.max(1, instanceCount);
    const angle =
      Math.PI * 0.2 + (instanceIndex / count) * Math.PI * 1.6;
    const radius = Math.max(2.4, Math.min(3.4, spread * 0.22));
    const right = Math.cos(angle) * radius;
    const forward = Math.sin(angle) * radius;
    return [
      center[0] +
        frame.right[0] * right +
        frame.forward[0] * forward,
      0,
      center[2] +
        frame.right[2] * right +
        frame.forward[2] * forward,
    ];
  }

  if (recipeId === SCENE_RECIPE_IDS.firewood) {
    return [
      center[0] + frame.right[0] * 1.9 + frame.forward[0] * 0.8,
      0,
      center[2] + frame.right[2] * 1.9 + frame.forward[2] * 0.8,
    ];
  }

  return null;
}

function humanizeHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 99999;
}

function humanizeSigned(seed: string): number {
  return humanizeHash(seed) * 2 - 1;
}

function humanizeStrength(humanize: FastAuthoringHumanize): {
  position: number;
  yawDegrees: number;
  scale: number;
} {
  if (humanize === "subtle") {
    return { position: 0.14, yawDegrees: 3, scale: 0.018 };
  }
  if (humanize === "natural") {
    return { position: 0.42, yawDegrees: 10, scale: 0.055 };
  }
  if (humanize === "handmade") {
    return { position: 0.85, yawDegrees: 22, scale: 0.11 };
  }
  return { position: 0, yawDegrees: 0, scale: 0 };
}

function humanizeRoleFactor(
  recipe: SceneRecipe,
  roleId: string,
  instanceIndex: number,
): number {
  if (roleId === "signature" && instanceIndex === 0) return 0.08;
  if (recipe.assembly) return 0;
  if (recipe.category === "nature") return 1;
  if (recipe.category === "furniture") return 0.5;
  if (recipe.category === "light") return 0.42;
  if (recipe.category === "water") return 0.16;
  if (recipe.category === "structure") return 0.12;
  if (recipe.category === "tutorial") return 0.08;
  if (recipe.category === "material") return 0.08;
  if (recipe.category === "weather" || recipe.category === "effect") return 0.04;
  return 0.1;
}

function humanizedRecipeTransform(
  recipe: SceneRecipe,
  roleId: string,
  instanceIndex: number,
  humanize: FastAuthoringHumanize,
): {
  positionOffset: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  const strength = humanizeStrength(humanize);
  const factor = humanizeRoleFactor(recipe, roleId, instanceIndex);
  if (factor === 0 || humanize === "off") {
    return {
      positionOffset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
  }

  const seed = recipe.id + ":" + roleId + ":" + instanceIndex;
  const x = humanizeSigned(seed + ":x") * strength.position * factor;
  const z = humanizeSigned(seed + ":z") * strength.position * factor;
  const yawDegrees =
    humanizeSigned(seed + ":yaw") * strength.yawDegrees * factor;
  const scaleDelta =
    humanizeSigned(seed + ":scale") * strength.scale * factor;
  const uniformScale = Math.max(0.78, 1 + scaleDelta);
  return {
    positionOffset: [
      Math.round(x * 100) / 100,
      0,
      Math.round(z * 100) / 100,
    ],
    rotation: [0, (yawDegrees * Math.PI) / 180, 0],
    scale: [uniformScale, uniformScale, uniformScale],
  };
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

const FAST_AUTHORING_PERFORMANCE_BUDGET = {
  entityEquivalentMax: 900,
  lightMax: 24,
  particleMax: 18,
} as const;

function recipePerformanceCost(recipe: SceneRecipe): {
  entityEquivalent: number;
  lights: number;
  particles: number;
} {
  return {
    entityEquivalent: Math.max(1, recipe.parts.length + 1),
    lights: recipe.parts.filter((part) => part.kind === "light").length,
    particles: recipe.parts.filter((part) => part.kind === "particle").length,
  };
}

function maxInstancesWithinPerformanceBudget({
  requested,
  recipe,
  projected,
}: {
  requested: number;
  recipe: SceneRecipe;
  projected: FastAuthoringPerformancePlan["projected"];
}): number {
  const cost = recipePerformanceCost(recipe);
  let allowed = requested;
  if (cost.entityEquivalent > 0) {
    allowed = Math.min(
      allowed,
      Math.max(
        0,
        Math.floor(
          (FAST_AUTHORING_PERFORMANCE_BUDGET.entityEquivalentMax -
            projected.entityEquivalent) /
            cost.entityEquivalent,
        ),
      ),
    );
  }
  if (cost.lights > 0) {
    allowed = Math.min(
      allowed,
      Math.max(
        0,
        Math.floor(
          (FAST_AUTHORING_PERFORMANCE_BUDGET.lightMax -
            projected.lights) /
            cost.lights,
        ),
      ),
    );
  }
  if (cost.particles > 0) {
    allowed = Math.min(
      allowed,
      Math.max(
        0,
        Math.floor(
          (FAST_AUTHORING_PERFORMANCE_BUDGET.particleMax -
            projected.particles) /
            cost.particles,
        ),
      ),
    );
  }
  return Math.max(0, allowed);
}

function addRecipePerformanceCost(
  projected: FastAuthoringPerformancePlan["projected"],
  recipe: SceneRecipe,
  count: number,
): void {
  const cost = recipePerformanceCost(recipe);
  projected.entityEquivalent += cost.entityEquivalent * count;
  projected.lights += cost.lights * count;
  projected.particles += cost.particles * count;
}

function navigationCorridorFootprints(
  frame: FastAuthoringSpawnFrame,
  spread: number,
): OccupiedFootprint[] {
  const targets = [
    zoneOrigin("main", spread, frame),
    zoneOrigin("rest", spread, frame),
  ];
  const footprints: OccupiedFootprint[] = [];
  for (const target of targets) {
    const distance = horizontalDistance(frame.position, target);
    const steps = Math.max(1, Math.floor(distance / 1.8));
    for (let index = 1; index < steps; index += 1) {
      const t = index / steps;
      footprints.push({
        position: [
          frame.position[0] + (target[0] - frame.position[0]) * t,
          0,
          frame.position[2] + (target[2] - frame.position[2]) * t,
        ],
        radius: 0.85,
      });
    }
  }
  return footprints;
}

function primitiveDecision(
  kind: FastAuthoringPrimitiveHelper,
  spawn: FastAuthoringSpawnFrame,
  occupied: readonly OccupiedFootprint[],
  minimumDistance: number,
  index: number,
): FastAuthoringPrimitiveDecision | null {
  if (kind === "none") return null;
  if (kind === "path-marker") {
    const zoneId: FastAuthoringZoneId = "entrance";
    return {
      kind,
      zoneId,
      shape: "cylinder",
      position: safePosition(
        relativePosition(
          spawn,
          ((index % 3) - 1) * 1.4,
          1.5,
        ),
        occupied,
        Math.max(1.1, minimumDistance * 0.45),
        0.35,
      ),
      scale: [0.28, 1.6, 0.28],
      name: "入口の目印",
    };
  }
  if (kind === "rest-step") {
    const zoneId: FastAuthoringZoneId = "rest";
    return {
      kind,
      zoneId,
      shape: "box",
      position: safePosition(
        relativePosition(spawn, ((index % 3) - 1) * 3.4, 5),
        occupied,
        minimumDistance,
        2.2,
      ),
      scale: [3.2, 0.45, 1.2],
      name: "休憩スペースの段",
    };
  }
  if (kind === "low-wall") {
    const zoneId: FastAuthoringZoneId = "perimeter";
    return {
      kind,
      zoneId,
      shape: "box",
      position: safePosition(
        relativePosition(spawn, index % 2 === 0 ? -5 : 5, 5 + index),
        occupied,
        minimumDistance,
        2.1,
      ),
      scale: [3.8, 0.8, 0.3],
      name: "低い境界壁",
    };
  }
  if (kind === "pedestal") {
    const zoneId: FastAuthoringZoneId = "main";
    return {
      kind,
      zoneId,
      shape: "cylinder",
      position: safePosition(
        relativePosition(spawn, ((index % 3) - 1) * 3, 6),
        occupied,
        minimumDistance,
        1.2,
      ),
      scale: [1.8, 0.7, 1.8],
      name: "展示台座",
    };
  }
  const zoneId: FastAuthoringZoneId = "rest";
  return {
    kind: "platform",
    zoneId,
    shape: "box",
    position: safePosition(
      relativePosition(spawn, ((index % 3) - 1) * 5, 6 + index),
      occupied,
      minimumDistance,
      2.8,
    ),
    scale: [4.5, 0.4, 3.5],
    name: "補助プラットフォーム",
  };
}

export function resolveFastAuthoringDecision({
  response,
  scene,
  catalog,
}: {
  response: Record<string, unknown>;
  scene: SceneDocument;
  catalog: FastAuthoringCatalog;
}): FastAuthoringDecision {
  const answers =
    response.answers && typeof response.answers === "object"
      ? (response.answers as Record<string, unknown>)
      : {};
  const intentClarity = selectedChoice(
    answers,
    "intentClarity",
    FAST_AUTHORING_INTENT_CLARITY_CRITERIA,
    "clear",
  ) as FastAuthoringIntentClarity;
  const confidence = fastAuthoringDecisionConfidence(answers);
  const clarificationMessage = clarificationMessageFor(
    intentClarity,
    confidence,
  );
  const requiresClarification = clarificationMessage !== null;
  const editScope = selectedChoice(
    answers,
    "editScope",
    FAST_AUTHORING_EDIT_SCOPE_CRITERIA,
    "append",
  ) as FastAuthoringEditScope;
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
  const grassPreset = selectedChoice(
    answers,
    "grassPreset",
    catalog.grassPresetCriteria,
    "keep",
  );
  const skybox = selectedChoice(
    answers,
    "skybox",
    catalog.skyboxCriteria,
    "gradient",
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
  const humanize = selectedChoice(
    answers,
    "humanize",
    FAST_AUTHORING_HUMANIZE_CRITERIA,
    "natural",
  ) as FastAuthoringHumanize;
  const spread = spreadForScale(scale);
  const minimumDistance = minimumDistanceForDensity(density);
  const spawn = findFastAuthoringSpawnFrame(scene);
  const occupied = occupiedRootFootprints(scene);
  const placed: OccupiedFootprint[] = [...occupied];
  const navigationCorridors = navigationCorridorFootprints(spawn, spread);
  const sceneFeatures = createFastAuthoringSceneFeatures(scene);
  const postReplacementPerformance = performanceAfterEditScope(
    scene,
    editScope,
  );
  const performancePlan: FastAuthoringPerformancePlan = {
    budget: { ...FAST_AUTHORING_PERFORMANCE_BUDGET },
    existing: postReplacementPerformance,
    projected: { ...postReplacementPerformance },
    clampedSelections: [],
  };

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
      zoneId: defaultZoneForRole("facility", placement),
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

  const selectedVariantLimit = DETAIL_ROLE_VARIANTS[detail];
  const recipes: FastAuthoringRecipeDecision[] = [];
  const recipeTrace: FastAuthoringTraceItem[] = [];
  const usedArchetypeIds = new Set<string>();
  let archetypeIndex = 0;

  for (const role of FAST_AUTHORING_RECIPE_ROLES) {
    const variantsForDetail = Math.min(role.variants, selectedVariantLimit);
    for (let variant = 0; variant < variantsForDetail; variant += 1) {
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
      const roleLimitedCount = Math.min(
        requestedCount,
        maxInstancesForRecipe(recipe, role),
      );
      const count = maxInstancesWithinPerformanceBudget({
        requested: roleLimitedCount,
        recipe,
        projected: performancePlan.projected,
      });
      if (count < roleLimitedCount) {
        performancePlan.clampedSelections.push(
          recipe.name + " " + roleLimitedCount + "→" + count,
        );
      }
      if (count <= 0) continue;
      addRecipePerformanceCost(
        performancePlan.projected,
        recipe,
        count,
      );
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
      const zoneId = selectedChoice(
        answers,
        suffix + "Zone",
        FAST_AUTHORING_ZONE_CRITERIA,
        defaultZoneForRole(role.id, placement),
      ) as FastAuthoringZoneId;
      const semanticAnchor = semanticClusterPosition({
        recipeId,
        zoneId,
        instanceIndex: 0,
        instanceCount: count,
        spread,
        frame: spawn,
      });
      const anchor =
        semanticAnchor ??
        nominalPosition(
          placement,
          composition,
          spread,
          spawn,
          zoneId,
          archetypeIndex,
        );
      let placedCount = 0;
      for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
        const variation = humanizedRecipeTransform(
          recipe,
          role.id,
          instanceIndex,
          humanize,
        );
        const semanticPosition = semanticClusterPosition({
          recipeId,
          zoneId,
          instanceIndex,
          instanceCount: count,
          spread,
          frame: spawn,
        });
        const basePosition =
          semanticPosition ??
          instancePosition(
            anchor,
            instanceIndex,
            minimumDistance,
            role.id,
            spawn,
          );
        const placementRadius = placementRadiusForRecipe(recipe);
        const placementObstacles =
          role.id === "landscape" || zoneId === "perimeter"
            ? [...placed, ...navigationCorridors]
            : placed;
        const position = safePosition(
          [
            basePosition[0] + variation.positionOffset[0],
            basePosition[1],
            basePosition[2] + variation.positionOffset[2],
          ],
          placementObstacles,
          minimumDistance,
          placementRadius,
        );
        placed.push({ position, radius: placementRadius });
        recipes.push({
          role: role.label,
          recipeId,
          zoneId,
          placement,
          position,
          instanceIndex,
          instanceCount: count,
          rotation: variation.rotation,
          scale: variation.scale,
        });
        placedCount += 1;
      }
      usedArchetypeIds.add(recipeId);
      recipeTrace.push({
        label: role.label,
        value:
          recipe.name +
          " × " +
          placedCount +
          " → " +
          zoneId +
          " / " +
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
      facility.zoneId,
      archetypeIndex + index,
    );
    const position = safePosition(anchor, placed, minimumDistance, 1.4);
    placed.push({ position, radius: 1.4 });
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
    placed.push({
      position: helper.position,
      radius: Math.max(helper.scale[0], helper.scale[2]) * 0.6,
    });
    primitives.push(helper);
  }

  const decisionTrace: FastAuthoringTraceItem[] = [
    {
      label: "実行判断",
      value:
        intentClarity +
        (confidence.minimumCritical === null
          ? ""
          : " / confidence " +
            confidence.minimumCritical.toFixed(2)),
    },
    {
      label: "編集範囲",
      value: editScope,
    },
    {
      label: "Scene",
      value:
        "Spawn前方 " +
        sceneFeatures.spawn.clearForwardMeters +
        "m / Root " +
        sceneFeatures.performance.rootEntityCount +
        " / Light " +
        sceneFeatures.performance.lightCount +
        (sceneFeatures.terrain.walkableCellRatio === null
          ? ""
          : " / Terrain歩行目安 " +
            Math.round(sceneFeatures.terrain.walkableCellRatio * 100) +
            "%"),
    },
    {
      label: "負荷予算",
      value:
        "EntityEq " +
        performancePlan.projected.entityEquivalent +
        "/" +
        performancePlan.budget.entityEquivalentMax +
        " / Light " +
        performancePlan.projected.lights +
        "/" +
        performancePlan.budget.lightMax +
        " / Particle " +
        performancePlan.projected.particles +
        "/" +
        performancePlan.budget.particleMax +
        (performancePlan.clampedSelections.length > 0
          ? " / 自動調整 " +
            performancePlan.clampedSelections.join(", ")
          : ""),
    },
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
      value:
        detail +
        " / " +
        (recipes.length + facilities.length + primitives.length) +
        "配置",
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
    {
      label: "草",
      value:
        grassPreset === "keep"
          ? "既定を使う"
          : TERRAIN_GRASS_PRESETS.find(
              (preset) => preset.id === grassPreset,
            )?.label ?? grassPreset,
    },
    {
      label: "Skybox",
      value:
        skybox === "gradient"
          ? "Gradient"
          : skybox === "off"
            ? "Off"
            : SKY_SHADER_CATALOG.find((entry) => entry.id === skybox)?.label ??
              skybox,
    },
    { label: "仕上げ", value: finish },
    { label: "風", value: wind },
    { label: "配置の自然さ", value: humanize },
    ...recipeTrace,
    ...facilities.map((facility, index) => ({
      label: "公式設備" + (index + 1),
      value:
        facility.name +
        " → " +
        facility.zoneId +
        " / " +
        facility.placement,
    })),
    ...primitives.map((primitive, index) => ({
      label: "補助" + (index + 1),
      value: primitive.name,
    })),
  ];

  return {
    intentClarity,
    confidence,
    requiresClarification,
    clarificationMessage,
    editScope,
    terrain,
    mood,
    density,
    scale,
    composition,
    detail,
    terrainSurface,
    grassPreset,
    skybox,
    finish,
    wind,
    humanize,
    performancePlan,
    recipes,
    facilities,
    primitives,
    decisionTrace,
  };
}
