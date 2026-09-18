import {
  getSceneRecipeShelf,
  getSceneRecipesForProjectKind,
} from "./scene-recipe-catalog";
import { TERRAIN_PRESETS } from "./terrain-presets";
import {
  getTransform,
  type SceneDocument,
  type Vec3,
} from "./scene-document";

export type FastAuthoringPlacement =
  | "center"
  | "near-spawn"
  | "left"
  | "right"
  | "far"
  | "perimeter";
export type FastAuthoringMood = "daylight" | "sunset" | "night" | "foggy";
export type FastAuthoringDensity = "sparse" | "balanced" | "lively";
export type FastAuthoringPrimitiveHelper =
  | "none"
  | "platform"
  | "path-marker"
  | "rest-step";
export type FastAuthoringTraceItem = { label: string; value: string };
export type FastAuthoringRecipeDecision = {
  recipeId: string;
  placement: FastAuthoringPlacement;
  position: Vec3;
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
  recipes: FastAuthoringRecipeDecision[];
  primitive: FastAuthoringPrimitiveDecision | null;
  decisionTrace: FastAuthoringTraceItem[];
};

export const FAST_AUTHORING_PLACEMENT_CRITERIA: Record<
  FastAuthoringPlacement,
  string
> = {
  center: "ワールドの中心。主役になるもの向け",
  "near-spawn": "開始位置の近く。最初に目に入るもの向け",
  left: "中心から左側",
  right: "中心から右側",
  far: "中心から奥側",
  perimeter: "中心を空けた外周側",
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
  sparse: "広く余白を取り、少数の要素を離して置く",
  balanced: "余白と要素数を均衡させる",
  lively: "比較的近くに置いて賑やかにする",
};
export const FAST_AUTHORING_PRIMITIVE_CRITERIA: Record<
  FastAuthoringPrimitiveHelper,
  string
> = {
  none: "Primitiveによる補助レイアウトは追加しない",
  platform:
    "主役の近くに低いBoxの足場を置く。平らな場所が役立つ場合だけ使う",
  "path-marker":
    "Spawn付近に細いCylinderの目印を置く。主役までの導線が分かりにくい場合だけ使う",
  "rest-step":
    "主役の少し手前に低いBoxの段を置く。腰掛けや小さな境界があると構図が良くなる場合だけ使う",
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

function createFastAuthoringCatalog() {
  const recipes = getSceneRecipesForProjectKind("world").filter(
    (recipe) => getSceneRecipeShelf(recipe) !== "materials",
  );
  const recipeCriteria = Object.fromEntries([
    ["none", "ギミックや3Dセットをこの枠には置かない"],
    ...recipes.map((recipe) => [
      recipe.id,
      [recipe.name, recipe.description, recipe.note]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 220),
    ]),
  ]);
  const terrainCriteria = Object.fromEntries([
    ["none", "新しいTerrainを追加しない"],
    ...TERRAIN_PRESETS.map((preset) => [
      preset.id,
      `${preset.label}: ${preset.description}`,
    ]),
  ]);
  return { recipes, recipeCriteria, terrainCriteria };
}
export type FastAuthoringCatalog = ReturnType<
  typeof createFastAuthoringCatalog
>;

export function buildFastAuthoringRequest({
  prompt,
  scene,
  projectName,
  sceneName,
  maxGimmicks = 3,
}: {
  prompt: string;
  scene: SceneDocument;
  projectName: string;
  sceneName: string;
  maxGimmicks?: number;
}) {
  const catalog = createFastAuthoringCatalog();
  const boundedMaxGimmicks = Math.min(3, Math.max(1, maxGimmicks));
  const questions: Record<string, unknown> = {
    terrain: {
      type: "choice",
      instructions:
        "依頼に最も合う地形を1つ選んでください。建物中心などTerrainが不要ならnone。",
      criteria: catalog.terrainCriteria,
    },
    mood: {
      type: "choice",
      instructions: "ワールド全体の時間帯・空気感を選んでください。",
      criteria: FAST_AUTHORING_MOOD_CRITERIA,
    },
    density: {
      type: "choice",
      instructions: "オブジェクト同士の間隔と情報量を選んでください。",
      criteria: FAST_AUTHORING_DENSITY_CRITERIA,
    },
    primitive: {
      type: "choice",
      instructions:
        "既存Scene Recipeだけでは土台や導線が不足する場合に限り補助Primitiveを1つ選んでください。不要ならnone。",
      criteria: FAST_AUTHORING_PRIMITIVE_CRITERIA,
    },
  };
  for (let index = 0; index < boundedMaxGimmicks; index += 1) {
    questions[`gimmick${index + 1}`] = {
      type: "choice",
      instructions:
        index === 0
          ? "依頼の主役になる既存のXRiftギミックまたは3Dセットを選んでください。"
          : "追加すると依頼が良くなる既存のXRiftギミックまたは3Dセットを選んでください。不要ならnone。",
      criteria: catalog.recipeCriteria,
    };
    questions[`placement${index + 1}`] = {
      type: "choice",
      instructions:
        "同じ番号で選んだギミックを置く場所を選んでください。",
      criteria: FAST_AUTHORING_PLACEMENT_CRITERIA,
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
            .slice(0, 40)
            .map((entity) => entity.name),
        },
        availableRecipes: catalog.recipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          description: recipe.description.slice(0, 160),
          shelf: getSceneRecipeShelf(recipe),
          category: recipe.category,
          tags: recipe.tags ?? [],
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
function primitiveDecision(
  kind: FastAuthoringPrimitiveHelper,
  spawn: Vec3,
  occupied: readonly Vec3[],
  minimumDistance: number,
): FastAuthoringPrimitiveDecision | null {
  if (kind === "none") return null;
  if (kind === "path-marker") {
    return {
      kind,
      shape: "cylinder",
      position: safePosition(
        [spawn[0] + 1.5, 0, spawn[2] + 1.5],
        occupied,
        Math.max(1.5, minimumDistance * 0.55),
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
  const primitiveKind = selectedChoice(
    answers,
    "primitive",
    FAST_AUTHORING_PRIMITIVE_CRITERIA,
    "none",
  ) as FastAuthoringPrimitiveHelper;
  const spread =
    density === "sparse" ? 16 : density === "lively" ? 6 : 10;
  const minimumDistance =
    density === "sparse" ? 5 : density === "lively" ? 2.5 : 3.5;
  const spawn = findFastAuthoringSpawnPosition(scene);
  const occupied = occupiedRootPositions(scene);
  const nominalForPlacement = (placement: FastAuthoringPlacement): Vec3 => {
    switch (placement) {
      case "near-spawn":
        return [spawn[0] + 3, 0, spawn[2] + 3];
      case "left":
        return [-spread, 0, 0];
      case "right":
        return [spread, 0, 0];
      case "far":
        return [0, 0, spread];
      case "perimeter":
        return [spread, 0, spread];
      default:
        return [0, 0, 0];
    }
  };
  const recipes: FastAuthoringRecipeDecision[] = [];
  const usedRecipeIds = new Set<string>();
  const placed = [...occupied];
  for (let index = 0; index < maxGimmicks; index += 1) {
    const recipeId = selectedChoice(
      answers,
      `gimmick${index + 1}`,
      catalog.recipeCriteria,
      "none",
    );
    if (recipeId === "none" || usedRecipeIds.has(recipeId)) continue;
    const placement = selectedChoice(
      answers,
      `placement${index + 1}`,
      FAST_AUTHORING_PLACEMENT_CRITERIA,
      index === 0 ? "center" : "perimeter",
    ) as FastAuthoringPlacement;
    const position = safePosition(
      nominalForPlacement(placement),
      placed,
      minimumDistance,
    );
    usedRecipeIds.add(recipeId);
    placed.push(position);
    recipes.push({ recipeId, placement, position });
  }
  const primitive = primitiveDecision(
    primitiveKind,
    spawn,
    placed,
    minimumDistance,
  );
  const decisionTrace: FastAuthoringTraceItem[] = [
    {
      label: "地形",
      value:
        terrain === "none"
          ? "追加しない"
          : TERRAIN_PRESETS.find((preset) => preset.id === terrain)?.label ??
            terrain,
    },
    { label: "雰囲気", value: mood },
    { label: "密度", value: density },
    ...recipes.map((selected, index) => ({
      label: `ギミック${index + 1}`,
      value: `${
        catalog.recipes.find((recipe) => recipe.id === selected.recipeId)
          ?.name ?? selected.recipeId
      } → ${selected.placement}`,
    })),
    ...(primitive
      ? [{ label: "補助レイアウト", value: primitive.name }]
      : []),
  ];
  return {
    terrain,
    mood,
    density,
    recipes,
    primitive,
    decisionTrace,
  };
}
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
