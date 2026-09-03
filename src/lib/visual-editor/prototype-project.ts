import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  normalizeMaterialProperties,
  type AssetManifest,
  type MaterialAsset,
  type PrimitiveAsset,
  type SceneAsset,
} from "./asset-manifest";
import {
  BUILTIN_PRIMITIVE_CREATION_IDS,
  getBuiltinPrimitiveCreation,
} from "./creation-catalog";
import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import {
  createGlowMaterialAsset,
  DEFAULT_GLOW_MATERIAL_PRESET,
} from "./glow-material-catalog";
import { getMaterialShowcaseAsset } from "./material-showcase-catalog";
import { createDocumentId } from "./document-id";
import {
  VISUAL_PROJECT_SCHEMA_VERSION,
  type VisualProjectDocument,
  type VisualProjectKind,
} from "./project-document";
import type { PrefabDocument } from "./prefab-document";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createBuiltinPrimitiveMeshComponent,
  createBoxColliderComponent,
  createTransformComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";

export { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";


export const BUILTIN_MATERIAL_ASSETS = [
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.blue,
    "ブルー",
    "material/blue",
    "#60a5fa",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.violet,
    "バイオレット",
    "material/violet",
    "#a78bfa",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.green,
    "グリーン",
    "material/green",
    "#34d399",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.orange,
    "オレンジ",
    "material/orange",
    "#fb923c",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.slate,
    "スレート",
    "material/slate",
    "#cbd5e1",
  ),
  // Neutrals the assembled sets are made of. A wooden bench and a stone
  // lantern both came out grey while the palette was only accent colours, and
  // a set is judged by whether it looks like the thing it is named after.
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.wood,
    "ウッド",
    "material/wood",
    "#8a5a3b",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.sand,
    "サンド",
    "material/sand",
    "#d8c9a3",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.white,
    "ホワイト",
    "material/white",
    "#e8eaee",
  ),
  createBuiltinMaterial(
    BUILTIN_ASSET_IDS.material.charcoal,
    "チャコール",
    "material/charcoal",
    "#3f4550",
  ),
  createGlowMaterialAsset(DEFAULT_GLOW_MATERIAL_PRESET),
] satisfies readonly MaterialAsset[];

/**
 * Adds a builtin Material to a manifest that predates it.
 *
 * Builtin Materials are seeded when a project is created, so a project made
 * before one existed does not have it. Placing something that depends on a
 * specific Material has to bring it along rather than silently fall back to
 * whatever Material happens to be present.
 */
export function ensureBuiltinMaterialAsset(
  assets: AssetManifest,
  materialAssetId: string,
): AssetManifest {
  if (assets.assets[materialAssetId]?.kind === "material") return assets;
  const builtin =
    BUILTIN_MATERIAL_ASSETS.find(
      (material) => material.id === materialAssetId,
    ) ??
    // Showcase Materials are resolvable here but absent from the seed list:
    // a project gets the one a placed 見本 uses and no more, which is why
    // thirteen extension demonstrations do not lengthen every new project's
    // Asset panel.
    getMaterialShowcaseAsset(materialAssetId);
  if (!builtin) return assets;
  return {
    ...assets,
    assets: { ...assets.assets, [builtin.id]: builtin },
  };
}

export const BUILTIN_PRIMITIVE_ASSETS = [
  createBuiltinPrimitive(
    BUILTIN_ASSET_IDS.geometry.box,
    "立方体",
    "primitive/box",
    "box",
    BUILTIN_ASSET_IDS.material.blue,
  ),
  createBuiltinPrimitive(
    BUILTIN_ASSET_IDS.geometry.sphere,
    "球",
    "primitive/sphere",
    "sphere",
    BUILTIN_ASSET_IDS.material.violet,
  ),
  createBuiltinPrimitive(
    BUILTIN_ASSET_IDS.geometry.cylinder,
    "円柱",
    "primitive/cylinder",
    "cylinder",
    BUILTIN_ASSET_IDS.material.green,
  ),
  createBuiltinPrimitive(
    BUILTIN_ASSET_IDS.geometry.cone,
    "円錐",
    "primitive/cone",
    "cone",
    BUILTIN_ASSET_IDS.material.orange,
  ),
  createBuiltinPrimitive(
    BUILTIN_ASSET_IDS.geometry.plane,
    "床",
    "primitive/plane",
    "plane",
    BUILTIN_ASSET_IDS.material.slate,
  ),
] satisfies readonly PrimitiveAsset[];

export type BuiltinAssetPaletteEntry = {
  geometryAssetId: string;
  name: string;
  description: string;
  previewColor: string;
};

export const BUILTIN_ASSET_PALETTE = [
  {
    geometryAssetId: BUILTIN_ASSET_IDS.geometry.box,
    name: "立方体",
    description: "壁、台、建物のブロックに使える基本形状",
    previewColor: "#60a5fa",
  },
  {
    geometryAssetId: BUILTIN_ASSET_IDS.geometry.sphere,
    name: "球",
    description: "装飾やインタラクションの目印に使える球体",
    previewColor: "#a78bfa",
  },
  {
    geometryAssetId: BUILTIN_ASSET_IDS.geometry.cylinder,
    name: "円柱",
    description: "柱や足場のベースに使える円柱",
    previewColor: "#34d399",
  },
  {
    geometryAssetId: BUILTIN_ASSET_IDS.geometry.cone,
    name: "円錐",
    description: "マーカーや屋根に使える円錐",
    previewColor: "#fb923c",
  },
  {
    geometryAssetId: BUILTIN_ASSET_IDS.geometry.plane,
    name: "床",
    description: "ワールドの土台として配置できる床",
    previewColor: "#94a3b8",
  },
] satisfies readonly BuiltinAssetPaletteEntry[];

export type PrototypeVisualProject = {
  project: VisualProjectDocument;
  scene: SceneDocument;
  assets: AssetManifest;
  /** Prefab authoring documents keyed by their stable prefabId. */
  prefabs: Record<string, PrefabDocument>;
};

function createBuiltinMaterial(
  id: string,
  name: string,
  key: string,
  color: string,
): MaterialAsset {
  return {
    id,
    name,
    kind: "material",
    status: "ready",
    source: { kind: "builtin", key },
    properties: normalizeMaterialProperties({
      color,
      metalness: 0.05,
      roughness: 0.72,
    }),
  };
}

function createBuiltinPrimitive(
  id: string,
  name: string,
  key: string,
  primitive: PrimitiveAsset["primitive"],
  defaultMaterialAssetId: string,
): PrimitiveAsset {
  return {
    id,
    name,
    kind: "primitive",
    status: "ready",
    source: { kind: "builtin", key },
    primitive,
    defaultMaterialAssetId,
    materialSlots: [
      {
        slot: "default",
        name: "Default",
        defaultMaterialAssetId,
      },
    ],
  };
}

function cloneBuiltinAsset(asset: SceneAsset): SceneAsset {
  if (asset.kind === "material") {
    return {
      ...asset,
      source: { ...asset.source },
      properties: normalizeMaterialProperties(
        asset.properties as unknown as Parameters<
          typeof normalizeMaterialProperties
        >[0],
      ),
    };
  }

  if (asset.kind === "primitive") {
    return {
      ...asset,
      source: { ...asset.source },
      materialSlots: asset.materialSlots.map((slot) => ({ ...slot })),
    };
  }

  if (asset.kind === "model") {
    return {
      ...asset,
      source: { ...asset.source },
      importSettings: { ...asset.importSettings },
      materialSlots: asset.materialSlots.map((slot) => ({ ...slot })),
    };
  }

  if (asset.kind === "particle") {
    return {
      ...asset,
      source: { ...asset.source },
      properties: { ...asset.properties },
    };
  }

  // Script sources are project files by contract, so the narrowed `source`
  // has to be cloned in its own branch to survive the union widening below.
  if (asset.kind === "script") {
    return { ...asset, source: { ...asset.source } };
  }

  if (asset.kind === "shader") {
    return { ...asset, source: { ...asset.source } };
  }

  return { ...asset, source: { ...asset.source } };
}

function createBuiltinAssetManifest(): AssetManifest {
  // Primitive tools live in the creation catalog and never appear as Assets.
  const assets = [...BUILTIN_MATERIAL_ASSETS];
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: Object.fromEntries(
      assets.map((asset) => [asset.id, cloneBuiltinAsset(asset)]),
    ),
  };
}

function toEntityRecord(entities: SceneEntity[]): Record<string, SceneEntity> {
  return Object.fromEntries(entities.map((entity) => [entity.id, entity]));
}

function createWorldEntities(): SceneEntity[] {
  const floor: SceneEntity = {
    id: "entity-world-floor",
    name: "床",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        "component-world-floor-transform",
        [0, 0, 0],
        [-Math.PI / 2, 0, 0],
        [6, 6, 6],
      ),
      createPrototypePrimitiveMesh(
        "component-world-floor-mesh",
        BUILTIN_PRIMITIVE_CREATION_IDS.plane,
        BUILTIN_ASSET_IDS.material.slate,
      ),
      createBoxColliderComponent("component-world-floor-collider", {
        halfExtents: [0.5, 0.5, 0.01],
        fitMode: "auto",
      }),
    ],
  };

  const object: SceneEntity = {
    id: "entity-world-object",
    name: "立方体",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        "component-world-object-transform",
        [0, 0.5, 0],
      ),
      createPrototypePrimitiveMesh(
        "component-world-object-mesh",
        BUILTIN_PRIMITIVE_CREATION_IDS.box,
        BUILTIN_ASSET_IDS.material.blue,
      ),
      createBoxColliderComponent("component-world-object-collider", {
        fitMode: "auto",
      }),
    ],
  };

  const sun: SceneEntity = {
    id: "entity-world-light",
    name: "太陽光",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        "component-world-light-transform",
        [4, 6, 3],
        [-0.7, 0.6, 0],
      ),
      {
        id: "component-world-light",
        type: "light",
        enabled: true,
        lightType: "directional",
        color: "#fff7ed",
        intensity: 2.4,
        castShadow: true,
      },
    ],
  };

  const spawn: SceneEntity = {
    id: "entity-world-spawn",
    name: "スポーン地点",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        "component-world-spawn-transform",
        [0, 0.05, 3],
      ),
      {
        id: "component-world-spawn",
        type: "spawn-point",
        enabled: true,
        target: "player",
      },
    ],
  };

  return [floor, object, sun, spawn];
}

function createItemEntities(): SceneEntity[] {
  return [
    {
      id: "entity-item-object",
      name: "アイテム",
      parentId: null,
      children: [],
      enabled: true,
      components: [
        createTransformComponent(
          "component-item-object-transform",
          [0, 0.75, 0],
        ),
        createPrototypePrimitiveMesh(
          "component-item-object-mesh",
          BUILTIN_PRIMITIVE_CREATION_IDS.box,
          BUILTIN_ASSET_IDS.material.violet,
        ),
        createBoxColliderComponent("component-item-object-collider", {
          fitMode: "auto",
        }),
      ],
    },
    {
      id: "entity-item-preview-spawn",
      name: "プレビュー基準点",
      parentId: null,
      children: [],
      enabled: true,
      components: [
        createTransformComponent(
          "component-item-preview-spawn-transform",
          [0, 0, 0],
        ),
        {
          id: "component-item-preview-spawn",
          type: "spawn-point",
          enabled: true,
          target: "item-preview",
        },
      ],
    },
  ];
}

function createPrototypePrimitiveMesh(
  componentId: string,
  creationId: string,
  materialAssetId: string,
) {
  const definition = getBuiltinPrimitiveCreation(creationId);
  if (!definition) throw new Error(`Unknown builtin primitive: ${creationId}`);
  return createBuiltinPrimitiveMeshComponent(componentId, definition, [
    { slot: "default", materialAssetId },
  ]);
}

export function createPrototypeProject(
  projectKind: VisualProjectKind,
  name?: string,
): PrototypeVisualProject {
  const timestamp = new Date().toISOString();
  const projectId = createDocumentId("project");
  const sceneId = createDocumentId("scene");
  const fallbackName =
    projectKind === "world" ? "untitled-world" : "untitled-item";
  const normalizedName = name?.trim() || fallbackName;
  const entities =
    projectKind === "world" ? createWorldEntities() : createItemEntities();

  const scene: SceneDocument = {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId,
    name: "メインシーン",
    settings: DEFAULT_SCENE_SETTINGS,
    rootEntityIds: entities.map((entity) => entity.id),
    entities: toEntityRecord(entities),
  };

  const project: VisualProjectDocument = {
    schemaVersion: VISUAL_PROJECT_SCHEMA_VERSION,
    projectId,
    projectKind,
    metadata: {
      name: normalizedName,
      title:
        name?.trim() ||
        (projectKind === "world" ? "新しいワールド" : "新しいアイテム"),
      description: "XRift Studioで制作するビジュアルプロジェクト",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    entrySceneId: sceneId,
    scenePaths: { [sceneId]: "scenes/main.scene.json" },
    assetManifestPath: "assets/assets.json",
  };

  return {
    project,
    scene,
    assets: createBuiltinAssetManifest(),
    prefabs: {},
  };
}

/**
 * Classic conversion starts from an empty authoring scene. The imported
 * source remains the only authority for floors, lights, SpawnPoint, and other
 * scene content; starter objects must never leak into a conversion.
 */
export function createClassicImportBaseProject(
  projectKind: VisualProjectKind,
  projectName: string,
): PrototypeVisualProject {
  const prototype = createPrototypeProject(projectKind, projectName);
  return {
    ...prototype,
    scene: {
      ...prototype.scene,
      name: "インポートしたシーン",
      rootEntityIds: [],
      entities: {},
    },
  };
}
