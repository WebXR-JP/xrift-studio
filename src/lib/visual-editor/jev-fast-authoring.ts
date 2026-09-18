import {
  BUILTIN_PREFAB_RECIPE_IDS,
  listBuiltinPrefabRecipes,
} from "./builtin-prefab-catalog";
import {
  getSceneRecipeShelf,
  getSceneRecipesForProjectKind,
  type SceneRecipe,
  type SceneRecipeCategory,
} from "./scene-recipe-catalog";
import { TERRAIN_PRESETS } from "./terrain-presets";
import {
  getTransform,
  type SceneDocument,
  type Vec3,
} from "./scene-document";

export const FAST_AUTHORING_MAX_RECIPES = 6;
export const FAST_AUTHORING_MAX_FACILITIES = 2;
export const FAST_AUTHORING_MAX_PRIMITIVES = 2;

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
  recipes: FastAuthoringRecipeDecision[];
  facilities: FastAuthoringFacilityDecision[];
  primitives: FastAuthoringPrimitiveDecision[];
  decisionTrace: FastAuthoringTraceItem[];
};

type FastAuthoringRecipeRole = {
  id: string;
  label: string;
  instruction: string;
  categories?: readonly SceneRecipeCategory[];
  tutorialGroups?: readonly string[];
};

export const FAST_AUTHORING_RECIPE_ROLES: readonly FastAuthoringRecipeRole[] = [
  {
    id: "signature",
    label: "主役",
    instruction:
      "このワールドを一目で説明できる主役を1つ選んでください。不要ならnone。",
  },
  {
    id: "landscape",
    label: "景観",
    instruction:
      "自然・水・建物など、場所らしさを作る景観要素を1つ選んでください。不要ならnone。",
    categories: ["nature", "water", "structure", "weather"],
  },
  {
    id: "furniture",
    label: "家具・設備",
    instruction:
      "人が使う家具、休憩、建築部品など、空間を成立させる要素を1つ選んでください。不要ならnone。",
    categories: ["furniture", "structure"],
  },
  {
    id: "lighting",
    label: "照明",
    instruction:
      "時間帯と主役を補う灯りや発光表現を1つ選んでください。明るい昼など不要ならnone。",
    categories: ["light"],
    tutorialGroups: ["照明・発光"],
  },
  {
    id: "atmosphere",
    label: "天気・演出",
    instruction:
      "雪、雨、霧、花びら、魔法など、空気感を強める演出を1つ選んでください。不要ならnone。",
    categories: ["weather", "effect", "nature"],
    tutorialGroups: ["パーティクル"],
  },
  {
    id: "interaction",
    label: "しかけ",
    instruction:
      "操作、音、表示、動きなど、依頼に必要なしかけを1つ選んでください。景観だけならnone。",
    categories: ["tutorial"],
  },
] as const;

export const FAST_AUTHORING_PLACEMENT_CRITERIA: Record<
  FastAuthoringPlacement,
  string
> = {
  center: "ワールドの中心。主役向け",
  "near-spawn": "Spawnから少し進んだ入口側",
  "front-left": "入口側の左。手前の添景や案内向け",
  "front-right": "入口側の右。手前の添景や案内向け",
  left: "中心の左側",
  right: "中心の右側",
  "back-left": "中心より奥の左側",
  "back-right": "中心より奥の右側",
  far: "中心よりさらに奥。遠景や背景向け",
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
  sparse: "要素数を抑え、広い余白を取る",
  balanced: "主役と余白を両立する標準的な密度",
  lively: "複数要素を比較的近くに置き、情報量を増やす",
};
export const FAST_AUTHORING_SCALE_CRITERIA: Record<
  FastAuthoringScale,
  string
> = {
  compact: "小さな一角。移動距離を短くまとめる",
  balanced: "一般的なワールド規模",
  wide: "景観や遠景を含む広い空間",
};
export const FAST_AUTHORING_COMPOSITION_CRITERIA: Record<
  FastAuthoringComposition,
  string
> = {
  "focal-center": "中央に主役を置き、周囲へ補助要素を展開する",
  "open-center": "中央を歩ける余白として空け、要素を外周へ置く",
  path: "Spawnから奥へ進む流れに沿って要素を配置する",
  ring: "中心の周囲を囲むように要素を分散する",
  layered: "手前・中央・奥の3層で奥行きを作る",
  natural: "左右対称を避け、自然なばらつきで配置する",
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
        .slice(0, 240),
    ]),
  ]);
}

function createFastAuthoringCatalog() {
  const recipes = getSceneRecipesForProjectKind("world").filter(
    (recipe) => getSceneRecipeShelf(recipe) !== "materials",
  );
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
  const facilities = listBuiltinPrefabRecipes("world").filter(
    (recipe) => recipe.id !== BUILTIN_PREFAB_RECIPE_IDS.spawnPoint,
  );
  const facilityCriteria = Object.fromEntries([
    ["none", "XRift公式設備は追加しない"],
    ...facilities.map((recipe) => [
      recipe.id,
      [
        recipe.name,
        recipe.description,
        recipe.configuration?.hint,
        recipe.configuration?.requiredBeforeCompile
          ? "利用前に設定が必要"
          : "そのまま配置可能",
      ]
        .filter(Boolean)
        .join(" / "),
    ]),
  ]);
  return {
    recipes,
    roleCriteria,
    terrainCriteria,
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
  maxGimmicks = FAST_AUTHORING_MAX_RECIPES,
}: {
  prompt: string;
  scene: SceneDocument;
  projectName: string;
  sceneName: string;
  maxGimmicks?: number;
}) {
  const baseCatalog = createFastAuthoringCatalog();
  const terrainCriteria = findTerrainEntityId(scene)
    ? {
        none:
          "Sceneに既存Terrainがあります。重ねて追加せず、既存Terrainを使ってください",
      }
    : baseCatalog.terrainCriteria;
  const catalog = { ...baseCatalog, terrainCriteria };
  const boundedMaxGimmicks = Math.min(
    FAST_AUTHORING_MAX_RECIPES,
    Math.max(1, maxGimmicks),
  );
  const questions: Record<string, unknown> = {
    terrain: {
      type: "choice",
      instructions:
        "依頼に合う地形を選んでください。既存Terrainがある場合やTerrainが不要ならnone。",
      criteria: catalog.terrainCriteria,
    },
    mood: {
      type: "choice",
      instructions: "ワールド全体の時間帯・空気感を選んでください。",
      criteria: FAST_AUTHORING_MOOD_CRITERIA,
    },
    density: {
      type: "choice",
      instructions:
        "依頼の情報量と余白から、オブジェクト密度を選んでください。",
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
        "Spawnから見た主役、歩ける余白、奥行きを考えて構図を選んでください。",
      criteria: FAST_AUTHORING_COMPOSITION_CRITERIA,
    },
  };

  FAST_AUTHORING_RECIPE_ROLES.slice(0, boundedMaxGimmicks).forEach(
    (role, index) => {
      questions["gimmick" + (index + 1)] = {
        type: "choice",
        instructions: role.instruction,
        criteria: catalog.roleCriteria[role.id],
      };
      questions["placement" + (index + 1)] = {
        type: "choice",
        instructions:
          role.label +
          "を構図に合う場所へ置いてください。主役の視界や歩ける中央を不必要に塞がないでください。",
        criteria: FAST_AUTHORING_PLACEMENT_CRITERIA,
      };
    },
  );

  for (let index = 0; index < FAST_AUTHORING_MAX_FACILITIES; index += 1) {
    questions["facility" + (index + 1)] = {
      type: "choice",
      instructions:
        index === 0
          ? "Mirror、TagBoard、VideoScreenなどXRift公式設備が依頼に必要なら1つ選んでください。景観だけならnone。"
          : "追加でもう1つXRift公式設備が必要なら選んでください。不要ならnone。",
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
        index === 0
          ? "Scene Recipeや公式設備だけでは足りない足場・台座・導線がある場合に補助Primitiveを選んでください。不要ならnone。"
          : "さらにもう1つだけ補助Primitiveが必要なら選んでください。不要ならnone。",
      criteria: FAST_AUTHORING_PRIMITIVE_CRITERIA,
    };
  }

  return {
    catalog,
    maxGimmicks: boundedMaxGimmicks,
    request: {
      state: {
        request: prompt,
        project: {
          name: projectName,
          scene: sceneName,
          entityCount: Object.keys(scene.entities).length,
          existingEntities: Object.values(scene.entities)
            .slice(0, 60)
            .map((entity) => entity.name),
        },
        availableRecipeRoles: FAST_AUTHORING_RECIPE_ROLES.map((role) => ({
          id: role.id,
          label: role.label,
          candidateCount:
            Object.keys(catalog.roleCriteria[role.id] ?? {}).length - 1,
        })),
        availableFacilities: catalog.facilities.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          configurationHint: recipe.configuration?.hint ?? null,
        })),
        placementSlots: Object.keys(FAST_AUTHORING_PLACEMENT_CRITERIA),
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
  if (scale === "wide") return 16;
  return 10;
}

function minimumDistanceForDensity(
  density: FastAuthoringDensity,
): number {
  if (density === "sparse") return 5;
  if (density === "lively") return 2.4;
  return 3.5;
}

function nominalPosition(
  placement: FastAuthoringPlacement,
  composition: FastAuthoringComposition,
  spread: number,
  spawn: Vec3,
  roleIndex: number,
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

  if (placement === "center" && roleIndex > 0) {
    if (composition === "open-center") {
      return roleIndex % 2 === 0
        ? [-spread * 0.7, 0, -spread * 0.45]
        : [spread * 0.7, 0, -spread * 0.45];
    }
    if (composition === "ring") {
      const angle = ((roleIndex - 1) / 5) * Math.PI * 2;
      return [
        Math.cos(angle) * spread * 0.7,
        0,
        Math.sin(angle) * spread * 0.7,
      ];
    }
    if (composition === "path") {
      return [0, 0, -spread * Math.min(0.85, 0.2 + roleIndex * 0.13)];
    }
  }

  if (composition === "natural" && placement !== "center") {
    const offset = roleIndex % 2 === 0 ? 0.12 : -0.12;
    return [
      position[0] + spread * offset,
      position[1],
      position[2] - spread * offset * 0.65,
    ];
  }

  return position;
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
        [spawn[0] + (index === 0 ? -1.2 : 1.2), 0, spawn[2] - 1.5],
        occupied,
        Math.max(1.2, minimumDistance * 0.5),
      ),
      scale: [0.28, 1.6, 0.28],
      name: "入口の目印",
    };
  }
  if (kind === "rest-step") {
    return {
      kind,
      shape: "box",
      position: safePosition([0, 0, 3.5], occupied, minimumDistance),
      scale: [3.2, 0.45, 1.2],
      name: "休憩スペースの段",
    };
  }
  if (kind === "low-wall") {
    return {
      kind,
      shape: "box",
      position: safePosition(
        [index === 0 ? -4.5 : 4.5, 0, -2],
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
      position: safePosition([0, 0, -2.5], occupied, minimumDistance),
      scale: [1.8, 0.7, 1.8],
      name: "展示台座",
    };
  }
  return {
    kind: "platform",
    shape: "box",
    position: safePosition([0, 0, -3], occupied, minimumDistance),
    scale: [4.5, 0.4, 3.5],
    name: "補助プラットフォーム",
  };
}

export function resolveFastAuthoringDecision({
  response,
  scene,
  catalog,
  maxGimmicks,
}: {
  response: Record<string, unknown>;
  scene: SceneDocument;
  catalog: FastAuthoringCatalog;
  maxGimmicks: number;
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

  const spread = spreadForScale(scale);
  const minimumDistance = minimumDistanceForDensity(density);
  const spawn = findFastAuthoringSpawnPosition(scene);
  const occupied = occupiedRootPositions(scene);
  const placed = [...occupied];

  const recipes: FastAuthoringRecipeDecision[] = [];
  const usedRecipeIds = new Set<string>();
  FAST_AUTHORING_RECIPE_ROLES.slice(0, maxGimmicks).forEach(
    (role, index) => {
      const criteria = catalog.roleCriteria[role.id] ?? { none: "" };
      const recipeId = selectedChoice(
        answers,
        "gimmick" + (index + 1),
        criteria,
        "none",
      );
      if (recipeId === "none" || usedRecipeIds.has(recipeId)) return;
      const placement = selectedChoice(
        answers,
        "placement" + (index + 1),
        FAST_AUTHORING_PLACEMENT_CRITERIA,
        index === 0 ? "center" : index % 2 === 0 ? "left" : "right",
      ) as FastAuthoringPlacement;
      const position = safePosition(
        nominalPosition(placement, composition, spread, spawn, index),
        placed,
        minimumDistance,
      );
      usedRecipeIds.add(recipeId);
      placed.push(position);
      recipes.push({
        role: role.label,
        recipeId,
        placement,
        position,
      });
    },
  );

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
      index === 0 ? "right" : "left",
    ) as FastAuthoringPlacement;
    const position = safePosition(
      nominalPosition(
        placement,
        composition,
        spread,
        spawn,
        FAST_AUTHORING_MAX_RECIPES + index,
      ),
      placed,
      minimumDistance,
    );
    usedFacilityIds.add(recipeId);
    placed.push(position);
    facilities.push({
      recipeId,
      name: recipe.name,
      placement,
      position,
      heightOffset: recipe.defaultTransform.position[1],
      configurationHint: recipe.configuration?.hint ?? null,
    });
  }

  const primitives: FastAuthoringPrimitiveDecision[] = [];
  const usedHelperKinds = new Set<string>();
  for (let index = 0; index < FAST_AUTHORING_MAX_PRIMITIVES; index += 1) {
    const kind = selectedChoice(
      answers,
      "helper" + (index + 1),
      FAST_AUTHORING_PRIMITIVE_CRITERIA,
      "none",
    ) as FastAuthoringPrimitiveHelper;
    if (kind === "none" || usedHelperKinds.has(kind)) continue;
    const helper = primitiveDecision(
      kind,
      spawn,
      placed,
      minimumDistance,
      index,
    );
    if (!helper) continue;
    usedHelperKinds.add(kind);
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
    ...recipes.map((selected) => ({
      label: selected.role,
      value:
        (catalog.recipes.find((recipe) => recipe.id === selected.recipeId)
          ?.name ?? selected.recipeId) +
        " → " +
        selected.placement,
    })),
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
    recipes,
    facilities,
    primitives,
    decisionTrace,
  };
}
