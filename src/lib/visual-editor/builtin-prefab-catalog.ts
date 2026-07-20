import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
  getXriftComponentDefinition,
  type XriftComponentSchemaId,
} from "./component-registry";
import { createDocumentId } from "./document-id";
import type { VisualProjectKind } from "./project-document";
import {
  createTransformComponent,
  type JsonObject,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

export const BUILTIN_PREFAB_DRAG_MIME =
  "application/x-xrift-visual-editor-builtin-prefab" as const;

export const BUILTIN_PREFAB_RECIPE_IDS = {
  spawnPoint: "xrift-prefab.spawn-point",
  mirror: "xrift-prefab.mirror",
  portal: "xrift-prefab.portal",
  tagBoard: "xrift-prefab.tag-board",
  videoScreen: "xrift-prefab.video-screen",
  videoPlayer: "xrift-prefab.video-player",
  liveVideoPlayer: "xrift-prefab.live-video-player",
  screenShareDisplay: "xrift-prefab.screen-share-display",
} as const;

export type BuiltinPrefabVisual =
  | { kind: "spawn-point"; radius: number }
  | { kind: "mirror"; size: readonly [number, number] }
  | { kind: "portal" }
  | { kind: "tag-board" }
  | { kind: "screen"; width: number };

export type BuiltinPrefabRecipe = {
  id: string;
  name: string;
  description: string;
  projectKinds: readonly VisualProjectKind[];
  schemaId: XriftComponentSchemaId;
  componentProperties: JsonObject;
  /** Functional Inspector fields that remain editable after placement. */
  editablePropertyNames: readonly string[];
  /** Shown before placement when the recipe needs a value to compile. */
  configuration?: {
    requiredBeforeCompile: boolean;
    hint: string;
  };
  defaultTransform: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  visual: BuiltinPrefabVisual;
};

const WORLD_ONLY = ["world"] as const;
const ALL_PROJECTS = ["world", "item"] as const;

/**
 * XRift-owned building blocks are catalog recipes, not mutable project assets.
 * Dropping one creates a normal Entity whose Transform can move while the
 * defining XRift component remains protected from accidental edits.
 */
export const BUILTIN_PREFAB_RECIPES: readonly BuiltinPrefabRecipe[] = [
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.spawnPoint,
    name: "SpawnPoint",
    description: "プレイヤーがワールドへ入る位置と向きを配置します。",
    projectKinds: WORLD_ONLY,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint,
    componentProperties: {
      position: [0, 0, 0],
      yaw: 0,
    },
    editablePropertyNames: [],
    defaultTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "spawn-point", radius: 0.45 },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.mirror,
    name: "Mirror",
    description: "XRiftのリアルタイム反射面を配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.mirror,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      size: [3, 2],
      color: 16777215,
      textureResolution: 1024,
      lodDistance: 10,
    },
    editablePropertyNames: [],
    defaultTransform: {
      position: [0, 1.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "mirror", size: [3, 2] },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.portal,
    name: "Portal",
    description: "別のXRiftインスタンスへ移動するゲートを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.portal,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      disabled: false,
    },
    editablePropertyNames: ["instanceId", "disabled"],
    configuration: {
      requiredBeforeCompile: true,
      hint: "配置後にInspectorで移動先のInstance IDを設定してください。",
    },
    defaultTransform: {
      position: [0, 0, -3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "portal" },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.tagBoard,
    name: "TagBoard",
    description: "ユーザーがタグを選択できるボードを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.tagBoard,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    },
    editablePropertyNames: [
      "tags",
      "columns",
      "title",
      "instanceStateKey",
    ],
    configuration: {
      requiredBeforeCompile: false,
      hint: "標準タグをそのまま使うか、Inspectorで内容を変更できます。",
    },
    defaultTransform: {
      position: [0, 0, -3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "tag-board" },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.videoScreen,
    name: "VideoScreen",
    description: "同期再生に対応する動画スクリーンを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.videoScreen,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [16 / 9 * 3, 3],
    },
    editablePropertyNames: [
      "id",
      "url",
      "playing",
      "currentTime",
      "sync",
      "muted",
      "volume",
    ],
    configuration: {
      requiredBeforeCompile: false,
      hint: "Inspectorで動画URLと同期方法を設定できます。",
    },
    defaultTransform: {
      position: [0, 2, -4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "screen", width: 16 / 9 * 3 },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.videoPlayer,
    name: "VideoPlayer",
    description: "操作UI付きの録画動画プレイヤーを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      width: 4,
    },
    editablePropertyNames: ["id", "url", "playing", "volume"],
    configuration: {
      requiredBeforeCompile: false,
      hint: "Inspectorまたは実行中の操作UIから動画URLを設定できます。",
    },
    defaultTransform: {
      position: [0, 2, -4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "screen", width: 4 },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.liveVideoPlayer,
    name: "LiveVideoPlayer",
    description: "ライブストリーム向けの動画プレイヤーを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      width: 4,
    },
    editablePropertyNames: ["id", "url", "playing", "volume", "sync"],
    configuration: {
      requiredBeforeCompile: false,
      hint: "Inspectorまたは実行中の操作UIから配信URLを設定できます。",
    },
    defaultTransform: {
      position: [0, 2, -4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "screen", width: 4 },
  },
  {
    id: BUILTIN_PREFAB_RECIPE_IDS.screenShareDisplay,
    name: "ScreenShareDisplay",
    description: "画面共有の映像を表示するスクリーンを配置します。",
    projectKinds: ALL_PROJECTS,
    schemaId: XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
    componentProperties: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      width: 4,
    },
    editablePropertyNames: ["id", "targetFps"],
    configuration: {
      requiredBeforeCompile: false,
      hint: "Inspectorで識別IDと更新フレームレートを設定できます。",
    },
    defaultTransform: {
      position: [0, 2, -4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visual: { kind: "screen", width: 4 },
  },
] as const;

export type InstantiateBuiltinPrefabResult = {
  scene: SceneDocument;
  entityId: string;
  componentId: string;
  recipe: BuiltinPrefabRecipe;
};

export type CreateBuiltinPrefabEntityOptions = {
  entityId?: string;
  componentId?: string;
  transformComponentId?: string;
  name?: string;
  position?: Vec3;
};

export type CreateBuiltinPrefabEntityResult = {
  entity: SceneEntity;
  componentId: string;
  recipe: BuiltinPrefabRecipe;
};

export function listBuiltinPrefabRecipes(
  projectKind: VisualProjectKind,
): readonly BuiltinPrefabRecipe[] {
  return BUILTIN_PREFAB_RECIPES.filter((recipe) =>
    recipe.projectKinds.includes(projectKind),
  );
}

export function getBuiltinPrefabRecipe(
  recipeId: string,
): BuiltinPrefabRecipe | undefined {
  return BUILTIN_PREFAB_RECIPES.find((recipe) => recipe.id === recipeId);
}

/**
 * Creates the authoring Entity for a built-in recipe without mutating a Scene.
 * Stable IDs may be supplied by starter documents and fixtures; interactive
 * placement can omit them and receive normal document IDs.
 */
export function createBuiltinPrefabEntity(
  projectKind: VisualProjectKind,
  recipeId: string,
  options: CreateBuiltinPrefabEntityOptions = {},
): CreateBuiltinPrefabEntityResult | null {
  const recipe = getBuiltinPrefabRecipe(recipeId);
  if (!recipe || !recipe.projectKinds.includes(projectKind)) return null;
  const definition = getXriftComponentDefinition(recipe.schemaId);
  if (!definition || !definition.allowedProjectKinds.includes(projectKind)) {
    return null;
  }

  const entityId = normalizedId(options.entityId) ?? createDocumentId("entity");
  const transformComponentId =
    normalizedId(options.transformComponentId) ??
    createDocumentId("component-transform");
  const component = createXriftComponent(recipe.schemaId, {
    componentId:
      normalizedId(options.componentId) ?? createDocumentId("component-xrift"),
    properties: recipe.componentProperties,
    authoring: {
      source: "builtin-prefab",
      recipeId: recipe.id,
      readOnly: true,
      ...(recipe.editablePropertyNames.length > 0
        ? { editablePropertyNames: [...recipe.editablePropertyNames] }
        : {}),
    },
  });
  if (!component) return null;

  const resolvedPosition = isFiniteVec3(options.position)
    ? [...options.position]
    : [...recipe.defaultTransform.position];
  const name = options.name?.trim() || recipe.name;
  return {
    recipe,
    componentId: component.id,
    entity: {
      id: entityId,
      name,
      parentId: null,
      children: [],
      enabled: true,
      components: [
        createTransformComponent(
          transformComponentId,
          resolvedPosition as Vec3,
          recipe.defaultTransform.rotation,
          recipe.defaultTransform.scale,
        ),
        component,
      ],
    },
  };
}

export function instantiateBuiltinPrefab(
  scene: SceneDocument,
  projectKind: VisualProjectKind,
  recipeId: string,
  position?: Vec3,
): InstantiateBuiltinPrefabResult | null {
  const recipe = getBuiltinPrefabRecipe(recipeId);
  if (!recipe) return null;
  const created = createBuiltinPrefabEntity(projectKind, recipeId, {
    name: createUniqueEntityName(scene, recipe.name),
    position,
  });
  if (!created) return null;
  const { componentId, entity } = created;
  const entityId = entity.id;

  return {
    recipe: created.recipe,
    entityId,
    componentId,
    scene: {
      ...scene,
      rootEntityIds: [...scene.rootEntityIds, entityId],
      entities: { ...scene.entities, [entityId]: entity },
    },
  };
}

export function getBuiltinPrefabRecipeForEntity(
  entity: SceneEntity | undefined,
): BuiltinPrefabRecipe | undefined {
  if (!entity) return undefined;
  const component = entity.components.find(
    (candidate) =>
      candidate.type === "xrift-component" &&
      candidate.authoring?.source === "builtin-prefab" &&
      candidate.authoring.readOnly,
  );
  const recipeId =
    component?.type === "xrift-component"
      ? component.authoring?.recipeId
      : undefined;
  return recipeId ? getBuiltinPrefabRecipe(recipeId) : undefined;
}

function isFiniteVec3(value: Vec3 | undefined): value is Vec3 {
  return Boolean(
    value &&
      value.length === 3 &&
      value.every((entry) => Number.isFinite(entry)),
  );
}

function normalizedId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function createUniqueEntityName(scene: SceneDocument, baseName: string): string {
  const names = new Set(
    Object.values(scene.entities).map((entity) => entity.name.toLocaleLowerCase()),
  );
  if (!names.has(baseName.toLocaleLowerCase())) return baseName;
  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${baseName} ${suffix}`;
}
