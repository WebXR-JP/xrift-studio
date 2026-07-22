import {
  normalizeMaterialProperties,
  normalizeTextureImportSettings,
  type AssetFolder,
  type AssetManifest,
  type MaterialAsset,
  type ModelAsset,
  type PrefabAsset,
  type TextureAsset,
} from "./asset-manifest";
import {
  BUILTIN_PREFAB_RECIPE_IDS,
  createBuiltinPrefabEntity,
} from "./builtin-prefab-catalog";
import {
  BUILTIN_PRIMITIVE_CREATION_IDS,
  getBuiltinPrimitiveCreation,
} from "./creation-catalog";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
  type PrototypeVisualProject,
} from "./prototype-project";
import {
  createPrefabAsset,
  createPrefabDocument,
  type PrefabDocument,
} from "./prefab-document";
import {
  createBuiltinPrimitiveMeshComponent,
  createBoxColliderComponent,
  createMeshComponent,
  createMeshColliderComponent,
  createTransformComponent,
  type LightComponent,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";
import { OPEN_BRUSH_RENDERER } from "./open-brush";

export type StarterWorldTemplateId = "blank" | "openbrush";
export type StarterItemTemplateId = "basic-item";
export type VisualStarterTemplateId =
  | StarterWorldTemplateId
  | StarterItemTemplateId;

export type BundledStarterModelId =
  | "log-bench"
  | "torii-gate"
  | "mug"
  | "wine-glass"
  | "openbrush-all-brushes";

export type BundledStarterTextureId =
  | "wood-planks-clean"
  | "polished-concrete";

export type BundledStarterAssetId =
  | BundledStarterModelId
  | BundledStarterTextureId;

export type StarterAssetProvenance =
  | {
      ownership: "project-owned";
      sourceName: string;
      permissionBasis: "provided-for-xrift-studio";
    }
  | {
      ownership: "third-party";
      sourceName: string;
      sourceUrl: string;
      license: "Apache-2.0";
    };

export type BundledStarterAssetDefinition = {
  id: BundledStarterAssetId;
  kind: "model" | "texture";
  publicPath: string;
  projectRelativePath: string;
  byteLength: number;
  sha256: string;
  mediaType: "model/gltf-binary" | "image/png";
  provenance: StarterAssetProvenance;
};

export type StarterAssetCopyPlanEntry = {
  assetId: string;
  bundledPublicPath: string;
  targetRelativePath: string;
  expectedByteLength: number;
  expectedSha256: string;
  mediaType: string;
  /**
   * Models and textures need byte-for-byte verification before import. License
   * text must be copied, but line-ending changes must not block a starter.
   */
  integrity: "strict" | "license-text";
};

export type StarterWorldProjectPlan = PrototypeVisualProject & {
  templateId: StarterWorldTemplateId;
  bundledAssetCopies: StarterAssetCopyPlanEntry[];
};

export type StarterItemProjectPlan = PrototypeVisualProject & {
  templateId: StarterItemTemplateId;
  bundledAssetCopies: [];
};

export type StarterVisualProjectPlan =
  | StarterWorldProjectPlan
  | StarterItemProjectPlan;

export type StarterWorldTemplateDefinition = {
  id: StarterWorldTemplateId;
  name: string;
  description: string;
  bundledAssetIds: readonly BundledStarterAssetDefinition["id"][];
};

export type StarterItemTemplateDefinition = {
  id: StarterItemTemplateId;
  name: string;
  description: string;
  bundledAssetIds: readonly [];
};

export const BUNDLED_STARTER_ASSETS = {
  "openbrush-all-brushes": {
    id: "openbrush-all-brushes",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/openbrush-all-brushes.glb",
    projectRelativePath: "assets/starter/openbrush-all-brushes.glb",
    byteLength: 1258708,
    sha256:
      "587fc0c477a8028a6acac21291868dbf4402f5aebd1fca71661e1ba83dd0a380",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "third-party",
      sourceName: "three-icosa examples/all_brushes.glb",
      sourceUrl: "https://github.com/icosa-foundation/three-icosa",
      license: "Apache-2.0",
    },
  },
  "log-bench": {
    id: "log-bench",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/log-bench.glb",
    projectRelativePath: "assets/starter/log-bench.glb",
    byteLength: 396400,
    sha256:
      "f7c57473cd2ead96aa2b7b820914b6c9b114915946b5dc00eb576c707b92aafd",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "project-owned",
      sourceName: "屋外プロップ_08_丸太ベンチ.glb",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "torii-gate": {
    id: "torii-gate",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/torii-gate.glb",
    projectRelativePath: "assets/starter/torii-gate.glb",
    byteLength: 455408,
    sha256:
      "dd21cfcb12aa03fdb28ba95924d38e6e905d1c3f32da87c1352d17a6f3237786",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "project-owned",
      sourceName: "屋外プロップ_17_鳥居.glb",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  mug: {
    id: "mug",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/mug.glb",
    projectRelativePath: "assets/starter/mug.glb",
    byteLength: 280008,
    sha256:
      "33fb6b5fd7681d9f465f5fa6f6b1f50c6c61be8658df38ae79dfc98b04b73bfa",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "project-owned",
      sourceName: "小物プロップ_01_マグカップ.glb",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "wine-glass": {
    id: "wine-glass",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/wine-glass.glb",
    projectRelativePath: "assets/starter/wine-glass.glb",
    byteLength: 66160,
    sha256:
      "a2765c0512ea6484573662e61cd62965dd68e8a7355380920d5be67a8f83e7ba",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "project-owned",
      sourceName: "小物プロップ_31_ワイングラス.glb",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "wood-planks-clean": {
    id: "wood-planks-clean",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/wood-planks-clean.png",
    projectRelativePath: "assets/starter/wood-planks-clean.png",
    byteLength: 1891395,
    sha256:
      "ebb12ef7d3d743e2d1bab5ee6d9fe392f6e0205651fa154f739e7300b26cb0ad",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "tile-wood-planks-clean.png",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "polished-concrete": {
    id: "polished-concrete",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/polished-concrete.png",
    projectRelativePath: "assets/starter/polished-concrete.png",
    byteLength: 3216770,
    sha256:
      "f82525e2c1117fd36b276538a72d765e34178435f7759b27acf151578f895458",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "t300_floor_04_polished_concrete_floor_with_subtl.png",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
} as const satisfies Record<string, BundledStarterAssetDefinition>;

export const BUNDLED_STARTER_ASSET_IDS = [
  "openbrush-all-brushes",
  "log-bench",
  "torii-gate",
  "mug",
  "wine-glass",
  "wood-planks-clean",
  "polished-concrete",
] as const satisfies readonly BundledStarterAssetId[];

const OPEN_BRUSH_LICENSE_COPY: StarterAssetCopyPlanEntry = {
  assetId: "openbrush-apache-license",
  bundledPublicPath: "/visual-editor/starter-assets/openbrush-LICENSE.txt",
  targetRelativePath: "assets/starter/openbrush-LICENSE.txt",
  expectedByteLength: 11560,
  expectedSha256:
    "3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5",
  mediaType: "text/plain",
  integrity: "license-text",
};

export const STARTER_ASSET_FOLDER_IDS = {
  root: "starter-library",
  models: "starter-library-models",
  materials: "starter-library-materials",
  textures: "starter-library-textures",
  prefabs: "starter-library-prefabs",
} as const;

export const STARTER_WORLD_TEMPLATES = [
  {
    id: "blank",
    name: "Blank",
    description: "床、照明、Spawn Pointだけの最小構成",
    bundledAssetIds: [],
  },
  {
    id: "openbrush",
    name: "OpenBrush",
    description: "48種類のOpenBrushストロークをthree-icosaで再現するサンプル",
    bundledAssetIds: ["openbrush-all-brushes"],
  },
] as const satisfies readonly StarterWorldTemplateDefinition[];

export const STARTER_ITEM_TEMPLATES = [
  {
    id: "basic-item",
    name: "Basic Item",
    description: "原点、プレビュー基準点、編集可能なマテリアルを持つ最小アイテム",
    bundledAssetIds: [],
  },
] as const satisfies readonly StarterItemTemplateDefinition[];

export function getStarterWorldTemplate(
  templateId: StarterWorldTemplateId,
): StarterWorldTemplateDefinition {
  const template = STARTER_WORLD_TEMPLATES.find(
    (candidate) => candidate.id === templateId,
  );
  if (!template) throw new Error(`Unknown Starter World template: ${templateId}`);
  return template;
}

export function getStarterItemTemplate(
  templateId: StarterItemTemplateId,
): StarterItemTemplateDefinition {
  const template = STARTER_ITEM_TEMPLATES.find(
    (candidate) => candidate.id === templateId,
  );
  if (!template) throw new Error(`Unknown Starter Item template: ${templateId}`);
  return template;
}

export function defaultVisualStarterTemplateId(
  kind: "world" | "item",
): VisualStarterTemplateId {
  return kind === "world" ? "openbrush" : "basic-item";
}

export function isStarterTemplateForKind(
  kind: "world" | "item",
  templateId: VisualStarterTemplateId,
): boolean {
  return kind === "world"
    ? STARTER_WORLD_TEMPLATES.some((template) => template.id === templateId)
    : STARTER_ITEM_TEMPLATES.some((template) => template.id === templateId);
}

function createStarterAssetFolders(): Record<string, AssetFolder> {
  return {
    [STARTER_ASSET_FOLDER_IDS.root]: {
      id: STARTER_ASSET_FOLDER_IDS.root,
      name: "Starter Library",
      parentId: null,
      order: 0,
    },
    [STARTER_ASSET_FOLDER_IDS.models]: {
      id: STARTER_ASSET_FOLDER_IDS.models,
      name: "Models",
      parentId: STARTER_ASSET_FOLDER_IDS.root,
      order: 0,
    },
    [STARTER_ASSET_FOLDER_IDS.materials]: {
      id: STARTER_ASSET_FOLDER_IDS.materials,
      name: "Materials",
      parentId: STARTER_ASSET_FOLDER_IDS.root,
      order: 1,
    },
    [STARTER_ASSET_FOLDER_IDS.textures]: {
      id: STARTER_ASSET_FOLDER_IDS.textures,
      name: "Textures",
      parentId: STARTER_ASSET_FOLDER_IDS.root,
      order: 2,
    },
    [STARTER_ASSET_FOLDER_IDS.prefabs]: {
      id: STARTER_ASSET_FOLDER_IDS.prefabs,
      name: "Prefabs",
      parentId: STARTER_ASSET_FOLDER_IDS.root,
      order: 3,
    },
  };
}

/** Creates documents plus an explicit copy plan; it performs no file writes. */
export function createStarterWorldProject(
  templateId: StarterWorldTemplateId,
  projectName?: string,
): StarterWorldProjectPlan {
  const definition = getStarterWorldTemplate(templateId);
  const prototype = createPrototypeProject("world", projectName);
  const bundledDefinitions = definition.bundledAssetIds.map(
    (assetId) => BUNDLED_STARTER_ASSETS[assetId],
  );
  const customMaterials = createStarterMaterials(templateId);
  const models = bundledDefinitions
    .filter((definition) => definition.kind === "model")
    .map((definition) => createStarterModelAsset(definition.id));
  const textures = bundledDefinitions
    .filter((definition) => definition.kind === "texture")
    .map((definition) => createStarterTextureAsset(definition.id));
  const baseAssets: AssetManifest = {
    ...prototype.assets,
    folders: createStarterAssetFolders(),
    assets: {
      ...prototype.assets.assets,
      ...Object.fromEntries(customMaterials.map((asset) => [asset.id, asset])),
      ...Object.fromEntries(models.map((asset) => [asset.id, asset])),
      ...Object.fromEntries(textures.map((asset) => [asset.id, asset])),
    },
  };
  const entities = createTemplateEntities(templateId);
  const scene: SceneDocument = {
    ...prototype.scene,
    name: definition.name,
    rootEntityIds: entities
      .filter((entity) => entity.parentId === null)
      .map((entity) => entity.id),
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
  };
  const prefabLibrary = createStarterPrefabLibrary(
    templateId,
    scene,
    baseAssets,
  );
  const assets: AssetManifest = {
    ...baseAssets,
    assets: {
      ...baseAssets.assets,
      ...Object.fromEntries(
        prefabLibrary.assets.map((asset) => [asset.id, asset]),
      ),
    },
  };
  const project = {
    ...prototype.project,
    metadata: {
      ...prototype.project.metadata,
      title: projectName?.trim() || definition.name,
      description: definition.description,
    },
  };

  return {
    templateId,
    project,
    scene,
    assets,
    prefabs: prefabLibrary.documents,
    bundledAssetCopies: [
      ...bundledDefinitions.map((bundled) => ({
        assetId: bundled.id,
        bundledPublicPath: bundled.publicPath,
        targetRelativePath: bundled.projectRelativePath,
        expectedByteLength: bundled.byteLength,
        expectedSha256: bundled.sha256,
        mediaType: bundled.mediaType,
        integrity: "strict" as const,
      })),
      ...(templateId === "openbrush" ? [OPEN_BRUSH_LICENSE_COPY] : []),
    ],
  };
}

export function createStarterItemProject(
  templateId: StarterItemTemplateId = "basic-item",
  projectName?: string,
): StarterItemProjectPlan {
  const definition = getStarterItemTemplate(templateId);
  const prototype = createPrototypeProject("item", projectName);
  return {
    ...prototype,
    templateId,
    project: {
      ...prototype.project,
      metadata: {
        ...prototype.project.metadata,
        title: projectName?.trim() || definition.name,
        description: definition.description,
      },
    },
    scene: { ...prototype.scene, name: definition.name },
    bundledAssetCopies: [],
  };
}

export function createStarterVisualProject(
  kind: "world" | "item",
  templateId: VisualStarterTemplateId,
  projectName?: string,
): StarterVisualProjectPlan {
  if (!isStarterTemplateForKind(kind, templateId)) {
    throw new Error(`Starter template ${templateId} is not available for ${kind}`);
  }
  return kind === "world"
    ? createStarterWorldProject(templateId as StarterWorldTemplateId, projectName)
    : createStarterItemProject(templateId as StarterItemTemplateId, projectName);
}

type StarterPrefabSeed = {
  prefabId: string;
  assetId: string;
  name: string;
  sourceEntityId: string;
};

function createStarterPrefabLibrary(
  templateId: StarterWorldTemplateId,
  scene: SceneDocument,
  assets: AssetManifest,
): { assets: PrefabAsset[]; documents: Record<string, PrefabDocument> } {
  const prefabAssets: PrefabAsset[] = [];
  const documents: Record<string, PrefabDocument> = {};
  const seeds = starterPrefabSeeds(templateId);

  seeds.forEach((seed, order) => {
    const result = createPrefabDocument(scene, assets, {
      prefabId: seed.prefabId,
      name: seed.name,
      sourceRootEntityIds: [seed.sourceEntityId],
      generateId: (kind, sourceId) =>
        `${seed.prefabId}-${kind}-${sourceId}`,
    });
    const prefabPath = `prefabs/starter/${seed.prefabId}.prefab.json`;
    const asset = createPrefabAsset(seed.assetId, seed.name, prefabPath);
    if (!result || !asset) {
      throw new Error(`Starter Prefab could not be created: ${seed.prefabId}`);
    }
    documents[result.document.prefabId] = result.document;
    prefabAssets.push({
      ...asset,
      folderId: STARTER_ASSET_FOLDER_IDS.prefabs,
      order,
    });
  });

  return { assets: prefabAssets, documents };
}

function starterPrefabSeeds(
  templateId: StarterWorldTemplateId,
): StarterPrefabSeed[] {
  const ground: StarterPrefabSeed = {
    prefabId: "starter-ground",
    assetId: "starter-prefab-ground",
    name: "Ground Platform",
    sourceEntityId: "starter-floor",
  };
  if (templateId === "blank") return [ground];
  return [
    ground,
    {
      prefabId: "starter-openbrush-gallery",
      assetId: "starter-prefab-openbrush-gallery",
      name: "OpenBrush Brush Gallery",
      sourceEntityId: "starter-openbrush-gallery",
    },
  ];
}

function createTemplateEntities(
  templateId: StarterWorldTemplateId,
): SceneEntity[] {
  const entities: SceneEntity[] = [
    createFloorEntity(templateId),
    createLightEntity("starter-ambient", "環境光", "ambient", [0, 4, 0], 0.65, false),
    createLightEntity(
      "starter-sun",
      "メインライト",
      "directional",
      [5, 8, 4],
      2.4,
      true,
    ),
    createSpawnEntity(),
  ];
  if (templateId === "blank") return organizeStarterHierarchy(entities);
  entities.push(
    createModelEntity(
      "starter-openbrush-gallery",
      "OpenBrush Brush Gallery",
      STARTER_MODEL_IDS.openBrush,
      [0.5, 0, 0.3],
      [0, 0, 0],
      [2.4, 2.4, 2.4],
    ),
  );
  return organizeStarterHierarchy(entities);
}

function organizeStarterHierarchy(entities: SceneEntity[]): SceneEntity[] {
  const lightingIds = new Set(["starter-ambient", "starter-sun"]);
  const spawnId = "starter-spawn";
  const environmentChildren = entities
    .filter((entity) => !lightingIds.has(entity.id) && entity.id !== spawnId)
    .map((entity) => entity.id);
  const lightingChildren = entities
    .filter((entity) => lightingIds.has(entity.id))
    .map((entity) => entity.id);
  const environment: SceneEntity = {
    id: "starter-environment",
    name: "Environment",
    parentId: null,
    children: environmentChildren,
    enabled: true,
    components: [
      createTransformComponent("starter-environment-transform"),
    ],
  };
  const lighting: SceneEntity = {
    id: "starter-lighting",
    name: "Lighting",
    parentId: null,
    children: lightingChildren,
    enabled: true,
    components: [createTransformComponent("starter-lighting-transform")],
  };
  const organized = entities.map((entity) => {
    if (lightingIds.has(entity.id)) return { ...entity, parentId: lighting.id };
    if (entity.id === spawnId) return entity;
    return { ...entity, parentId: environment.id };
  });
  return [environment, lighting, ...organized];
}

const STARTER_MODEL_IDS = {
  logBench: "starter-model-log-bench",
  toriiGate: "starter-model-torii-gate",
  mug: "starter-model-mug",
  wineGlass: "starter-model-wine-glass",
  openBrush: "starter-model-openbrush-all-brushes",
} as const;

const STARTER_MODEL_ORDER: Record<BundledStarterModelId, number> = {
  "log-bench": 0,
  "torii-gate": 1,
  mug: 2,
  "wine-glass": 3,
  "openbrush-all-brushes": 0,
};

const STARTER_TEXTURE_IDS = {
  woodPlanks: "starter-texture-wood-planks-clean",
  polishedConcrete: "starter-texture-polished-concrete",
} as const;

const STARTER_MATERIAL_IDS = {
  ground: "starter-material-ground",
} as const;

function createStarterMaterials(
  _templateId: StarterWorldTemplateId,
): MaterialAsset[] {
  return [
    createMaterial(
      STARTER_MATERIAL_IDS.ground,
      "Neutral Ground",
      "#dbe4ee",
      0,
      0.82,
      undefined,
      0,
    ),
  ];
}

function createMaterial(
  id: string,
  name: string,
  color: string,
  metalness: number,
  roughness: number,
  baseColorTextureId?: string,
  order = 0,
): MaterialAsset {
  return {
    id,
    name,
    kind: "material",
    status: "ready",
    source: { kind: "document" },
    thumbnail: { status: "missing" },
    folderId: STARTER_ASSET_FOLDER_IDS.materials,
    order,
    properties: normalizeMaterialProperties({
      color,
      metalness,
      roughness,
      ...(baseColorTextureId ? { baseColorTextureId } : {}),
    }),
  };
}

type StarterModelMetadata = {
  assetId: string;
  name: string;
  materialName: string;
  importMetadata: NonNullable<ModelAsset["importMetadata"]>;
};

const STARTER_MODEL_METADATA = {
  "openbrush-all-brushes": {
    assetId: STARTER_MODEL_IDS.openBrush,
    name: "OpenBrush Brush Gallery",
    materialName: "OpenBrush Brushes",
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 0,
      nodeCount: 50,
      meshCount: 48,
      primitiveCount: 48,
      bounds: {
        min: [-1.41114533, 0.915535271, -1.36520159],
        max: [0.47456786, 1.62704182, 0.791838825],
        center: [-0.468288735, 1.2712885455, -0.2866813825],
        size: [1.88571319, 0.711506549, 2.157040415],
        boundingSphereRadius: 1.476057177,
      },
      animations: [],
      extensionsUsed: ["GOOGLE_tilt_brush_material"],
      extensionsRequired: [],
      openBrush: {
        renderer: "three-icosa",
        rendererVersion: OPEN_BRUSH_RENDERER,
        extensionNames: ["GOOGLE_tilt_brush_material"],
        exporter: "Tilt Brush 0.3.0.",
        brushNames: [],
      },
    },
  },
  "log-bench": {
    assetId: STARTER_MODEL_IDS.logBench,
    name: "丸太ベンチ",
    materialName: "wood_dark",
    importMetadata: modelMetadata(3, 3, 3, {
      min: [-0.800001, 0, -0.180001],
      max: [0.800001, 0.430001, 0.180001],
      center: [0, 0.215, 0],
      size: [1.600001, 0.430001, 0.360001],
      boundingSphereRadius: 0.847718,
    }),
  },
  "torii-gate": {
    assetId: STARTER_MODEL_IDS.toriiGate,
    name: "鳥居",
    materialName: "wood_dark",
    importMetadata: modelMetadata(10, 10, 10, {
      min: [-1.315127, 0, -0.200001],
      max: [1.315127, 2.609323, 0.200001],
      center: [0, 1.304661, 0],
      size: [2.630254, 2.609323, 0.400001],
      boundingSphereRadius: 1.86325,
    }),
  },
  mug: {
    assetId: STARTER_MODEL_IDS.mug,
    name: "マグカップ",
    materialName: "ceramic_white",
    importMetadata: modelMetadata(3, 3, 3, {
      min: [-0.067353, 0, -0.0415],
      max: [0.067353, 0.10187, 0.0415],
      center: [0, 0.050935, 0],
      size: [0.134705, 0.10187, 0.083],
      boundingSphereRadius: 0.09409,
    }),
  },
  "wine-glass": {
    assetId: STARTER_MODEL_IDS.wineGlass,
    name: "ワイングラス",
    materialName: "glass_clear",
    importMetadata: modelMetadata(6, 6, 6, {
      min: [-0.0421, 0, -0.042101],
      max: [0.0421, 0.2129, 0.0421],
      center: [0, 0.10645, 0],
      size: [0.0842, 0.2129, 0.0842],
      boundingSphereRadius: 0.121969,
    }),
  },
} satisfies Record<BundledStarterModelId, StarterModelMetadata>;

function modelMetadata(
  nodeCount: number,
  meshCount: number,
  primitiveCount: number,
  bounds: NonNullable<ModelAsset["importMetadata"]>["bounds"],
): NonNullable<ModelAsset["importMetadata"]> {
  return {
    sourceFormat: "glb",
    byteLength: 0,
    nodeCount,
    meshCount,
    primitiveCount,
    bounds,
    animations: [],
    extensionsUsed: [],
    extensionsRequired: [],
  };
}

function createStarterModelAsset(bundledId: BundledStarterAssetId): ModelAsset {
  if (!isBundledStarterModelId(bundledId)) {
    throw new Error(`Starter asset is not a Model: ${bundledId}`);
  }
  const bundled = BUNDLED_STARTER_ASSETS[bundledId];
  const metadata = STARTER_MODEL_METADATA[bundledId];
  return {
    id: metadata.assetId,
    name: metadata.name,
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: bundled.projectRelativePath },
    sourceHash: bundled.sha256,
    thumbnail: { status: "missing" },
    folderId: STARTER_ASSET_FOLDER_IDS.models,
    order: STARTER_MODEL_ORDER[bundledId],
    importSettings: {
      ...defaultModelImportSettings(false),
      ...(bundledId === "openbrush-all-brushes"
        ? { generateColliders: false }
        : {}),
    },
    materialSlots:
      bundledId === "openbrush-all-brushes"
        ? []
        : [
            {
              slot: "material-0",
              name: metadata.materialName,
              sourceMaterialIndex: 0,
            },
          ],
    importMetadata: {
      ...metadata.importMetadata,
      byteLength: bundled.byteLength,
    },
  };
}

function isBundledStarterModelId(
  id: BundledStarterAssetId,
): id is BundledStarterModelId {
  return (
    id === "log-bench" ||
    id === "torii-gate" ||
    id === "mug" ||
    id === "wine-glass" ||
    id === "openbrush-all-brushes"
  );
}

function createStarterTextureAsset(bundledId: BundledStarterAssetId): TextureAsset {
  if (bundledId !== "wood-planks-clean" && bundledId !== "polished-concrete") {
    throw new Error(`Starter asset is not a Texture: ${bundledId}`);
  }
  const bundled = BUNDLED_STARTER_ASSETS[bundledId];
  const isWood = bundledId === "wood-planks-clean";
  return {
    id: isWood
      ? STARTER_TEXTURE_IDS.woodPlanks
      : STARTER_TEXTURE_IDS.polishedConcrete,
    name: isWood ? "Wood Planks" : "Polished Concrete",
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: bundled.projectRelativePath },
    sourceHash: bundled.sha256,
    thumbnail: { status: "missing" },
    folderId: STARTER_ASSET_FOLDER_IDS.textures,
    order: isWood ? 0 : 1,
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      generateMipmaps: true,
      flipY: false,
      resize: { mode: "original" },
      sampler: {
        wrapS: "repeat",
        wrapT: "repeat",
        magFilter: "linear",
        minFilter: "linear-mipmap-linear",
      },
      compression: { format: "source", quality: 80 },
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: bundled.byteLength,
      width: isWood ? 1024 : 1254,
      height: isWood ? 1024 : 1254,
    },
  };
}

function defaultModelImportSettings(importAnimations: boolean) {
  return {
    scale: 1,
    generateColliders: true,
    optimizeMeshes: false,
    importAnimations,
  };
}

function createFloorEntity(templateId: StarterWorldTemplateId): SceneEntity {
  const definition = getBuiltinPrimitiveCreation(
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
  );
  if (!definition) throw new Error("Builtin plane is unavailable");
  const floorScale = templateId === "openbrush" ? 10 : 8;
  const floorMaterialAssetId = STARTER_MATERIAL_IDS.ground;
  return {
    id: "starter-floor",
    name: "床",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        "starter-floor-transform",
        [0, 0, 0],
        [-Math.PI / 2, 0, 0],
        [floorScale, floorScale, floorScale],
      ),
      createBuiltinPrimitiveMeshComponent(
        "starter-floor-mesh",
        definition,
        [{ slot: "default", materialAssetId: floorMaterialAssetId }],
      ),
      createBoxColliderComponent("starter-floor-collider", {
        halfExtents: [0.5, 0.5, 0.01],
        fitMode: "auto",
      }),
    ],
  };
}

function createLightEntity(
  id: string,
  name: string,
  lightType: LightComponent["lightType"],
  position: Vec3,
  intensity: number,
  castShadow: boolean,
): SceneEntity {
  return {
    id,
    name,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, position, [-0.65, 0.55, 0]),
      {
        id: `${id}-light`,
        type: "light",
        enabled: true,
        lightType,
        color: lightType === "ambient" ? "#dbeafe" : "#fff7ed",
        intensity,
        castShadow,
      },
    ],
  };
}

function createSpawnEntity(): SceneEntity {
  const created = createBuiltinPrefabEntity(
    "world",
    BUILTIN_PREFAB_RECIPE_IDS.spawnPoint,
    {
      entityId: "starter-spawn",
      componentId: "starter-spawn-xrift-component",
      transformComponentId: "starter-spawn-transform",
      name: "Spawn Point",
      position: [0, 0.05, 4],
    },
  );
  if (!created) throw new Error("Builtin Spawn Point recipe is unavailable");
  return created.entity;
}

function createModelEntity(
  id: string,
  name: string,
  modelAssetId: string,
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
  materialBindings: Array<{ slot: string; materialAssetId: string }> = [],
): SceneEntity {
  return {
    id,
    name,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, position, rotation, scale),
      createMeshComponent(`${id}-mesh`, modelAssetId, materialBindings, {
        castShadow: true,
        receiveShadow: true,
      }),
      createMeshColliderComponent(`${id}-collider`, {
        meshMode: "trimesh",
      }),
    ],
  };
}

/** Builtin materials remain assets; builtin primitives remain creation tools. */
export function starterWorldContainsNoPrimitiveAssets(
  plan: StarterWorldProjectPlan,
): boolean {
  return Object.values(plan.assets.assets).every(
    (asset) => asset.kind !== "primitive",
  );
}

/** Exposed so callers can select a fallback material without hard-coded IDs. */
export const STARTER_WORLD_DEFAULT_MATERIAL_ASSET_ID =
  BUILTIN_ASSET_IDS.material.slate;
