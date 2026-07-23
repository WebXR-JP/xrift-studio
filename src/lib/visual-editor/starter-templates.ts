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
import { applyComponentCodeImportPlan } from "./component-code-import";
import { analyzeOfficialXriftWorldTemplate } from "./official-world-template-import";
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
  createTextComponent,
  createTransformComponent,
  renameEntity,
  type LightComponent,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";
import { OPEN_BRUSH_RENDERER } from "./open-brush";

export type StarterWorldTemplateId =
  | "studio-guide"
  | "xrift-official"
  | "blank"
  | "openbrush";
export type StarterItemTemplateId = "basic-item";
export type VisualStarterTemplateId =
  | StarterWorldTemplateId
  | StarterItemTemplateId;

export type BundledStarterModelId =
  | "xrift-official-duck"
  | "xrift-official-bunny"
  | "log-bench"
  | "torii-gate"
  | "mug"
  | "wine-glass"
  | "openbrush-all-brushes";

export type BundledStarterTextureId =
  | "xrift-official-tokyo-station"
  | "wood-planks-clean"
  | "polished-concrete"
  | "studio-guide-overview"
  | "studio-guide-hierarchy-create"
  | "studio-guide-scene-tools"
  | "studio-guide-inspector"
  | "studio-guide-assets"
  | "studio-guide-play-publish";

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
      license: "Apache-2.0" | "MIT";
    };

export type BundledStarterAssetDefinition = {
  id: BundledStarterAssetId;
  kind: "model" | "texture";
  publicPath: string;
  projectRelativePath: string;
  byteLength: number;
  sha256: string;
  mediaType: "model/gltf-binary" | "image/png" | "image/jpeg";
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
  "xrift-official-duck": {
    id: "xrift-official-duck",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/xrift-world-template-duck.glb",
    projectRelativePath: "assets/starter/xrift-official/duck.glb",
    byteLength: 119808,
    sha256:
      "154d3d5f025f9a0a614b5ea27b5e816120e0d286077b05ba67281e4b2823684d",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "third-party",
      sourceName: "WebXR-JP/xrift-world-template public/duck.glb",
      sourceUrl: "https://github.com/WebXR-JP/xrift-world-template",
      license: "MIT",
    },
  },
  "xrift-official-bunny": {
    id: "xrift-official-bunny",
    kind: "model",
    publicPath: "/visual-editor/starter-assets/xrift-world-template-bunny.glb",
    projectRelativePath: "assets/starter/xrift-official/bunny.glb",
    byteLength: 1670664,
    sha256:
      "7f903e35e249f399e440a3bce6bf694e72dc80ce9dfd33df7f4fd83d4e960fff",
    mediaType: "model/gltf-binary",
    provenance: {
      ownership: "third-party",
      sourceName: "WebXR-JP/xrift-world-template public/bunny.drc (Studio GLB conversion)",
      sourceUrl: "https://github.com/WebXR-JP/xrift-world-template",
      license: "MIT",
    },
  },
  "xrift-official-tokyo-station": {
    id: "xrift-official-tokyo-station",
    kind: "texture",
    publicPath:
      "/visual-editor/starter-assets/xrift-world-template-tokyo-station.png",
    projectRelativePath: "assets/starter/xrift-official/tokyo-station.png",
    byteLength: 904831,
    sha256:
      "613c5e5af594cf273bc14076cc86761a74826e9c57fbcec1e45c42a988fd3265",
    mediaType: "image/png",
    provenance: {
      ownership: "third-party",
      sourceName: "WebXR-JP/xrift-world-template public/tokyo-station.jpg",
      sourceUrl: "https://github.com/WebXR-JP/xrift-world-template",
      license: "MIT",
    },
  },
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
  "studio-guide-overview": {
    id: "studio-guide-overview",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/studio-guide-overview.png",
    projectRelativePath: "assets/starter/studio-guide/overview.png",
    byteLength: 302097,
    sha256:
      "c7fbe7cb9e7673ba6e6ed0794141c42c020970afbb3e5e7669bbdeee10a25f01",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Visual Editor overview screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "studio-guide-hierarchy-create": {
    id: "studio-guide-hierarchy-create",
    kind: "texture",
    publicPath:
      "/visual-editor/starter-assets/studio-guide-hierarchy-create.png",
    projectRelativePath: "assets/starter/studio-guide/hierarchy-create.png",
    byteLength: 201187,
    sha256:
      "78785f867f78a163527cd2b0e08909b650ae6b5f075a55cf7711a95b02b40235",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Hierarchy and Create screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "studio-guide-scene-tools": {
    id: "studio-guide-scene-tools",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/studio-guide-scene-tools.png",
    projectRelativePath: "assets/starter/studio-guide/scene-tools.png",
    byteLength: 334635,
    sha256:
      "eb6ef27105e09f6bec49af8e31aa4915926e629edf9aadcfbae920a9490a3866",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Scene View tools screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "studio-guide-inspector": {
    id: "studio-guide-inspector",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/studio-guide-inspector.png",
    projectRelativePath: "assets/starter/studio-guide/inspector.png",
    byteLength: 120214,
    sha256:
      "c7cffb4d21ddce7016822e59431db85c12251d944f1ee3132f711a40ad7038b4",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Inspector screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "studio-guide-assets": {
    id: "studio-guide-assets",
    kind: "texture",
    publicPath: "/visual-editor/starter-assets/studio-guide-assets.png",
    projectRelativePath: "assets/starter/studio-guide/assets.png",
    byteLength: 129292,
    sha256:
      "995cd6a08d60811d48c196ae148a430b2ea060ce607dac9fd14d677afcf2b39f",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Assets screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
  "studio-guide-play-publish": {
    id: "studio-guide-play-publish",
    kind: "texture",
    publicPath:
      "/visual-editor/starter-assets/studio-guide-play-publish.png",
    projectRelativePath: "assets/starter/studio-guide/play-publish.png",
    byteLength: 72363,
    sha256:
      "98931813ca5db59cf07c5ac2d9e98b799be41470e01e644c6b7eed5fcf1cf132",
    mediaType: "image/png",
    provenance: {
      ownership: "project-owned",
      sourceName: "XRift Studio Play and publish screenshot",
      permissionBasis: "provided-for-xrift-studio",
    },
  },
} as const satisfies Record<string, BundledStarterAssetDefinition>;

export const BUNDLED_STARTER_ASSET_IDS = [
  "xrift-official-duck",
  "xrift-official-bunny",
  "xrift-official-tokyo-station",
  "openbrush-all-brushes",
  "log-bench",
  "torii-gate",
  "mug",
  "wine-glass",
  "wood-planks-clean",
  "polished-concrete",
  "studio-guide-overview",
  "studio-guide-hierarchy-create",
  "studio-guide-scene-tools",
  "studio-guide-inspector",
  "studio-guide-assets",
  "studio-guide-play-publish",
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

const XRIFT_OFFICIAL_SOURCE_COPY: StarterAssetCopyPlanEntry = {
  assetId: "xrift-world-template-source",
  bundledPublicPath:
    "/visual-editor/starter-assets/xrift-world-template-World.tsx.txt",
  targetRelativePath: "assets/starter/xrift-world-template-World.tsx.txt",
  expectedByteLength: 8791,
  expectedSha256:
    "7269c522aa105b5f22a066d0c0b7818589149788a639d9b14b0c0d9c58070522",
  mediaType: "text/plain",
  integrity: "strict",
};

const XRIFT_OFFICIAL_LICENSE_COPY: StarterAssetCopyPlanEntry = {
  assetId: "xrift-world-template-license",
  bundledPublicPath:
    "/visual-editor/starter-assets/xrift-world-template-LICENSE.txt",
  targetRelativePath: "assets/starter/xrift-world-template-LICENSE.txt",
  expectedByteLength: 1086,
  expectedSha256:
    "ab63a7a7e02339cd5547c0fbd3ed89e8ab740c72a7d1696719bbaa67ee11a2f8",
  mediaType: "text/plain",
  integrity: "strict",
};

export const STARTER_ASSET_FOLDER_IDS = {
  root: "starter-library",
  models: "starter-library-models",
  materials: "starter-library-materials",
  textures: "starter-library-textures",
  prefabs: "starter-library-prefabs",
} as const;

export const STUDIO_GUIDE_TEMPLATE_THUMBNAIL =
  "/visual-editor/starter-assets/studio-guide-overview.png";

export const STARTER_WORLD_TEMPLATES = [
  {
    id: "studio-guide",
    name: "XRift Studio ガイド",
    description:
      "実画面の教材パネルと編集サンプルを歩きながら、制作から公開まで学べるワールド",
    bundledAssetIds: [
      "studio-guide-overview",
      "studio-guide-hierarchy-create",
      "studio-guide-scene-tools",
      "studio-guide-inspector",
      "studio-guide-assets",
      "studio-guide-play-publish",
      "log-bench",
      "torii-gate",
      "mug",
      "wine-glass",
      "wood-planks-clean",
      "polished-concrete",
    ],
  },
  {
    id: "xrift-official",
    name: "XRift公式サンプル",
    description: "公式ClassicテンプレートのR3F / JSXをVisualへ変換した作例",
    bundledAssetIds: [
      "xrift-official-duck",
      "xrift-official-bunny",
      "xrift-official-tokyo-station",
    ],
  },
  {
    id: "blank",
    name: "空のワールド",
    description: "床、メインライト1灯、Spawn Pointだけの最小構成",
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
  return kind === "world" ? "studio-guide" : "basic-item";
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
  const imported =
    templateId === "xrift-official"
      ? createOfficialTemplateDocuments(prototype.scene, baseAssets)
      : null;
  const entities = imported ? [] : createTemplateEntities(templateId);
  const scene: SceneDocument = imported
    ? { ...imported.scene, name: definition.name }
    : {
        ...prototype.scene,
        name: definition.name,
        rootEntityIds: entities
          .filter((entity) => entity.parentId === null)
          .map((entity) => entity.id),
        entities: Object.fromEntries(
          entities.map((entity) => [entity.id, entity]),
        ),
      };
  const resolvedBaseAssets = imported?.assets ?? baseAssets;
  const prefabLibrary = createStarterPrefabLibrary(
    templateId,
    scene,
    resolvedBaseAssets,
  );
  const assets: AssetManifest = {
    ...resolvedBaseAssets,
    assets: {
      ...resolvedBaseAssets.assets,
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
      ...(templateId === "xrift-official"
        ? [XRIFT_OFFICIAL_SOURCE_COPY, XRIFT_OFFICIAL_LICENSE_COPY]
        : []),
    ],
  };
}

function createOfficialTemplateDocuments(
  prototypeScene: SceneDocument,
  baseAssets: AssetManifest,
): { scene: SceneDocument; assets: AssetManifest } {
  const plan = analyzeOfficialXriftWorldTemplate();
  const errors = plan.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(
      `Official XRift template conversion failed: ${errors
        .map((diagnostic) => diagnostic.code)
        .join(", ")}`,
    );
  }
  const emptyScene: SceneDocument = {
    ...prototypeScene,
    rootEntityIds: [],
    entities: {},
  };
  const applied = applyComponentCodeImportPlan({
    scene: emptyScene,
    assets: baseAssets,
    projectKind: "world",
    plan,
    assetIdBySourcePath: {
      "public/duck.glb": STARTER_MODEL_IDS.xriftDuck,
      "public/bunny.drc": STARTER_MODEL_IDS.xriftBunny,
      "public/tokyo-station.jpg": STARTER_TEXTURE_IDS.xriftTokyoStation,
    },
  });
  const applyErrors = applied.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (applyErrors.length > 0 || applied.entityIds.length !== plan.nodes.length) {
    throw new Error(
      `Official XRift template application failed: ${applyErrors
        .map((diagnostic) => diagnostic.code)
        .join(", ") || "entity-count"}`,
    );
  }
  return {
    scene: applied.scene.rootEntityIds[0]
      ? renameEntity(applied.scene, applied.scene.rootEntityIds[0], "World")
      : applied.scene,
    assets: rehomeOfficialImportedMaterials(applied.assets),
  };
}

function rehomeOfficialImportedMaterials(
  manifest: AssetManifest,
): AssetManifest {
  let nextOrder = 0;
  return {
    ...manifest,
    assets: Object.fromEntries(
      Object.entries(manifest.assets).map(([assetId, asset]) => {
        if (
          asset.kind !== "material" ||
          asset.source.kind !== "document" ||
          asset.folderId !== null
        ) {
          return [assetId, asset];
        }
        const order = nextOrder;
        nextOrder += 1;
        return [
          assetId,
          {
            ...asset,
            folderId: STARTER_ASSET_FOLDER_IDS.materials,
            order,
          },
        ];
      }),
    ),
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
  const seeds = starterPrefabSeeds(templateId, scene);

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
  scene: SceneDocument,
): StarterPrefabSeed[] {
  if (templateId === "xrift-official") {
    const ground = Object.values(scene.entities).find(
      (entity) => entity.name === "Ground",
    );
    return ground
      ? [
          {
            prefabId: "starter-xrift-official-ground",
            assetId: "starter-prefab-xrift-official-ground",
            name: "XRift Official Ground",
            sourceEntityId: ground.id,
          },
        ]
      : [];
  }
  const ground: StarterPrefabSeed = {
    prefabId: "starter-ground",
    assetId: "starter-prefab-ground",
    name: "Ground Platform",
    sourceEntityId: "starter-floor",
  };
  if (templateId === "blank" || templateId === "studio-guide") return [ground];
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
  if (templateId === "studio-guide") return createStudioGuideEntities();
  const entities: SceneEntity[] = [
    createFloorEntity(templateId),
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
  const lightId = "starter-sun";
  const spawnId = "starter-spawn";
  const environmentChildren = entities
    .filter((entity) => entity.id !== lightId && entity.id !== spawnId)
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
  const organized = entities.map((entity) => {
    if (entity.id === lightId || entity.id === spawnId) return entity;
    return { ...entity, parentId: environment.id };
  });
  return [environment, ...organized];
}

type GuideStationInput = {
  id: string;
  parentId: string;
  name: string;
  title: string;
  body: string;
  materialAssetId: string;
  position: Vec3;
  rotationY?: number;
  screenScale?: readonly [number, number];
};

function createStudioGuideEntities(): SceneEntity[] {
  const environmentId = "guide-environment";
  const welcomeId = "guide-section-welcome";
  const editId = "guide-section-edit";
  const assetsId = "guide-section-assets";
  const playId = "guide-section-play";

  const floor = createFloorEntity("studio-guide");
  const torii = {
    ...createModelEntity(
      "guide-entrance-torii",
      "入口の鳥居",
      STARTER_MODEL_IDS.toriiGate,
      [0, 0, 9],
      [0, 0, 0],
      [1.45, 1.45, 1.45],
    ),
    parentId: environmentId,
  };
  const benches = [
    {
      ...createModelEntity(
        "guide-bench-left",
        "休憩用ベンチ 左",
        STARTER_MODEL_IDS.logBench,
        [-4.2, 0, 1],
        [0, 0.25, 0],
        [1.2, 1.2, 1.2],
      ),
      parentId: environmentId,
    },
    {
      ...createModelEntity(
        "guide-bench-right",
        "休憩用ベンチ 右",
        STARTER_MODEL_IDS.logBench,
        [4.2, 0, -9],
        [0, -0.25, 0],
        [1.2, 1.2, 1.2],
      ),
      parentId: environmentId,
    },
  ];
  const environmentChildren = [
    floor.id,
    torii.id,
    ...benches.map((entity) => entity.id),
  ];
  const environment = createGuideGroup(
    environmentId,
    "Environment",
    null,
    environmentChildren,
  );
  const guideFloor = { ...floor, parentId: environmentId };

  const welcomeStation = createGuideStation({
    id: "guide-station-overview",
    parentId: welcomeId,
    name: "Studio全体を知る",
    title: "XRift Studioへようこそ",
    body:
      "左のHierarchyで選ぶ。中央のScene Viewで配置する。右のInspectorで調整する。\n下のAssetsから素材を使い、Playで体験してから保存・アップロードします。",
    materialAssetId: STARTER_MATERIAL_IDS.guideOverview,
    position: [0, 3.35, 3.6],
    screenScale: [7.2, 4.05],
  });
  const welcomeHeading = createGuideTextEntity(
    "guide-welcome-heading",
    "入口タイトル",
    "XRift Studio Learning World",
    welcomeId,
    [0, 5.6, 7.7],
    0.56,
    11,
    "#ffffff",
  );
  const welcomeSubheading = createGuideTextEntity(
    "guide-welcome-subheading",
    "入口サブタイトル",
    "このワールド自体を編集しながら、制作の流れを学べます",
    welcomeId,
    [0, 4.9, 7.7],
    0.24,
    9,
    "#ddd6fe",
  );
  const welcome = createGuideGroup(welcomeId, "00 はじめに", null, [
    welcomeHeading.id,
    welcomeSubheading.id,
    welcomeStation[0].id,
  ]);

  const hierarchyStation = createGuideStation({
    id: "guide-station-hierarchy",
    parentId: editId,
    name: "HierarchyとCreate",
    title: "1. 選ぶ・作る",
    body:
      "Hierarchyはシーンの構造です。CreateからEmpty、Primitive、XRift Componentを追加し、親子関係を整理します。",
    materialAssetId: STARTER_MATERIAL_IDS.guideHierarchyCreate,
    position: [-4.6, 3, -4.3],
    rotationY: 0.36,
  });
  const sceneStation = createGuideStation({
    id: "guide-station-scene-tools",
    parentId: editId,
    name: "Scene Viewとツール",
    title: "2. 見ながら動かす",
    body:
      "Scene ViewでEntityを選び、移動・回転・拡縮を使います。ギズモとInspectorの数値は同じTransformを編集します。",
    materialAssetId: STARTER_MATERIAL_IDS.guideSceneTools,
    position: [4.6, 3, -4.3],
    rotationY: -0.36,
  });
  const edit = createGuideGroup(editId, "01 シーンを編集する", null, [
    hierarchyStation[0].id,
    sceneStation[0].id,
  ]);

  const assetsStation = createGuideStation({
    id: "guide-station-assets",
    parentId: assetsId,
    name: "Assets",
    title: "3. 素材を置く",
    body:
      "Model、Texture、Material、PrefabをAssetsで管理します。Scene Viewへドラッグし、再利用できる素材として育てます。",
    materialAssetId: STARTER_MATERIAL_IDS.guideAssets,
    position: [-4.6, 3, -13.2],
    rotationY: 0.36,
  });
  const inspectorStation = createGuideStation({
    id: "guide-station-inspector",
    parentId: assetsId,
    name: "Inspector",
    title: "4. 選んだ対象を調整する",
    body:
      "Entity、Asset、SceneでInspectorが切り替わります。Transform、Material、Collider、Componentの設定はここに集まります。",
    materialAssetId: STARTER_MATERIAL_IDS.guideInspector,
    position: [4.6, 3, -13.2],
    rotationY: -0.36,
  });
  const samplePlinth = createGuidePrimitiveEntity(
    "guide-sample-plinth",
    "Assetサンプル台",
    assetsId,
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    STARTER_MATERIAL_IDS.guidePlinth,
    [0, 0.55, -14],
    [0, 0, 0],
    [2.8, 1.1, 1.5],
    true,
  );
  const mug = {
    ...createModelEntity(
      "guide-sample-mug",
      "編集できるマグカップ",
      STARTER_MODEL_IDS.mug,
      [-0.7, 1.15, -14],
      [0, 0.3, 0],
      [3, 3, 3],
    ),
    parentId: assetsId,
  };
  const wineGlass = {
    ...createModelEntity(
      "guide-sample-wine-glass",
      "編集できるワイングラス",
      STARTER_MODEL_IDS.wineGlass,
      [0.8, 1.15, -14],
      [0, -0.3, 0],
      [3, 3, 3],
    ),
    parentId: assetsId,
  };
  const samplesLabel = createGuideTextEntity(
    "guide-samples-label",
    "Assetサンプル説明",
    "実習: この2つを選び、移動・複製・Material変更を試してください",
    assetsId,
    [0, 2.25, -14],
    0.23,
    7,
    "#18181b",
  );
  const assets = createGuideGroup(assetsId, "02 AssetsとInspector", null, [
    assetsStation[0].id,
    inspectorStation[0].id,
    samplePlinth.id,
    mug.id,
    wineGlass.id,
    samplesLabel.id,
  ]);

  const playStation = createGuideStation({
    id: "guide-station-play-publish",
    parentId: playId,
    name: "Play・保存・アップロード",
    title: "5. Playして、保存して、公開する",
    body:
      "Playは編集データのコピーを実行します。問題がなければ保存し、タイトル・説明・サムネイルを整えてアップロードします。",
    materialAssetId: STARTER_MATERIAL_IDS.guidePlayPublish,
    position: [0, 3, -21.5],
    screenScale: [6.4, 3.6],
  });
  const mirror = createGuideXriftEntity(
    "guide-xrift-mirror",
    "XRift Mirror サンプル",
    playId,
    BUILTIN_PREFAB_RECIPE_IDS.mirror,
    [-4.4, 1.5, -28],
  );
  const tagBoard = createGuideXriftEntity(
    "guide-xrift-tag-board",
    "XRift TagBoard サンプル",
    playId,
    BUILTIN_PREFAB_RECIPE_IDS.tagBoard,
    [0, 0, -28],
  );
  const entryLog = createGuideXriftEntity(
    "guide-xrift-entry-log",
    "XRift EntryLogBoard サンプル",
    playId,
    BUILTIN_PREFAB_RECIPE_IDS.entryLogBoard,
    [4.4, 1.5, -28],
  );
  const componentHeading = createGuideTextEntity(
    "guide-components-heading",
    "XRift Component説明",
    "実習: XRift Components",
    playId,
    [0, 4.8, -27.8],
    0.42,
    8,
    "#ffffff",
  );
  const componentBody = createGuideTextEntity(
    "guide-components-body",
    "XRift Component実習説明",
    "Mirror・TagBoard・EntryLogBoardは公式Componentです。選択してInspectorを確認し、Playで実際の動作を試してください。",
    playId,
    [0, 4.15, -27.8],
    0.23,
    10,
    "#ddd6fe",
  );
  const play = createGuideGroup(playId, "03 Playと公開", null, [
    playStation[0].id,
    mirror.id,
    tagBoard.id,
    entryLog.id,
    componentHeading.id,
    componentBody.id,
  ]);

  return [
    environment,
    welcome,
    edit,
    assets,
    play,
    createLightEntity(
      "starter-sun",
      "メインライト",
      "directional",
      [8, 12, 10],
      3,
      true,
    ),
    createSpawnEntity([0, 0.05, 12]),
    guideFloor,
    torii,
    ...benches,
    welcomeHeading,
    welcomeSubheading,
    ...welcomeStation,
    ...hierarchyStation,
    ...sceneStation,
    ...assetsStation,
    ...inspectorStation,
    samplePlinth,
    mug,
    wineGlass,
    samplesLabel,
    ...playStation,
    mirror,
    tagBoard,
    entryLog,
    componentHeading,
    componentBody,
  ];
}

function createGuideStation(input: GuideStationInput): SceneEntity[] {
  const frameId = `${input.id}-frame`;
  const screenId = `${input.id}-screen`;
  const titleId = `${input.id}-title`;
  const bodyId = `${input.id}-body`;
  const [screenWidth, screenHeight] = input.screenScale ?? [5.4, 3.04];
  const root = createGuideGroup(
    input.id,
    input.name,
    input.parentId,
    [frameId, screenId, titleId, bodyId],
    input.position,
    [0, input.rotationY ?? 0, 0],
  );
  const frame = createGuidePrimitiveEntity(
    frameId,
    `${input.name} フレーム`,
    input.id,
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    STARTER_MATERIAL_IDS.guideFrame,
    [0, 0, 0],
    [0, 0, 0],
    [screenWidth + 0.34, screenHeight + 0.34, 0.12],
  );
  const screen = createGuidePrimitiveEntity(
    screenId,
    `${input.name} スクリーンショット`,
    input.id,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    input.materialAssetId,
    [0, 0, 0.07],
    [0, 0, 0],
    [screenWidth, screenHeight, 1],
  );
  const title = createGuideTextEntity(
    titleId,
    `${input.name} 見出し`,
    input.title,
    input.id,
    [0, screenHeight / 2 + 0.65, 0.09],
    0.36,
    screenWidth + 0.5,
    "#ffffff",
  );
  const body = createGuideTextEntity(
    bodyId,
    `${input.name} 説明`,
    input.body,
    input.id,
    [0, -(screenHeight / 2 + 0.72), 0.09],
    0.22,
    screenWidth + 0.5,
    "#e4e4e7",
  );
  return [root, frame, screen, title, body];
}

function createGuideGroup(
  id: string,
  name: string,
  parentId: string | null,
  children: string[],
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
): SceneEntity {
  return {
    id,
    name,
    parentId,
    children,
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, position, rotation),
    ],
  };
}

function createGuidePrimitiveEntity(
  id: string,
  name: string,
  parentId: string,
  creationId: string,
  materialAssetId: string,
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
  collider = false,
): SceneEntity {
  const definition = getBuiltinPrimitiveCreation(creationId);
  if (!definition) throw new Error(`Builtin primitive is unavailable: ${creationId}`);
  return {
    id,
    name,
    parentId,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, position, rotation, scale),
      createBuiltinPrimitiveMeshComponent(`${id}-mesh`, definition, [
        { slot: "default", materialAssetId },
      ]),
      ...(collider
        ? [
            createBoxColliderComponent(`${id}-collider`, {
              fitMode: "auto",
            }),
          ]
        : []),
    ],
  };
}

function createGuideTextEntity(
  id: string,
  name: string,
  text: string,
  parentId: string,
  position: Vec3,
  fontSize: number,
  maxWidth: number,
  color: string,
): SceneEntity {
  const component = createTextComponent(`${id}-text`, {
    text,
    color,
    fontSize,
    maxWidth,
    anchorX: "center",
    anchorY: "middle",
    outlineWidth: 0.012,
    outlineColor: "#09090b",
  });
  if (!component) throw new Error(`Guide Text could not be created: ${id}`);
  return {
    id,
    name,
    parentId,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, position),
      component,
    ],
  };
}

function createGuideXriftEntity(
  id: string,
  name: string,
  parentId: string,
  recipeId: string,
  position: Vec3,
): SceneEntity {
  const created = createBuiltinPrefabEntity("world", recipeId, {
    entityId: id,
    componentId: `${id}-xrift-component`,
    transformComponentId: `${id}-transform`,
    name,
    position,
  });
  if (!created) throw new Error(`XRift guide sample is unavailable: ${recipeId}`);
  return { ...created.entity, parentId };
}

const STARTER_MODEL_IDS = {
  xriftDuck: "starter-model-xrift-official-duck",
  xriftBunny: "starter-model-xrift-official-bunny",
  logBench: "starter-model-log-bench",
  toriiGate: "starter-model-torii-gate",
  mug: "starter-model-mug",
  wineGlass: "starter-model-wine-glass",
  openBrush: "starter-model-openbrush-all-brushes",
} as const;

const STARTER_MODEL_ORDER: Record<BundledStarterModelId, number> = {
  "xrift-official-duck": 0,
  "xrift-official-bunny": 1,
  "log-bench": 0,
  "torii-gate": 1,
  mug: 2,
  "wine-glass": 3,
  "openbrush-all-brushes": 0,
};

const STARTER_TEXTURE_IDS = {
  xriftTokyoStation: "starter-texture-xrift-official-tokyo-station",
  woodPlanks: "starter-texture-wood-planks-clean",
  polishedConcrete: "starter-texture-polished-concrete",
  guideOverview: "starter-texture-studio-guide-overview",
  guideHierarchyCreate: "starter-texture-studio-guide-hierarchy-create",
  guideSceneTools: "starter-texture-studio-guide-scene-tools",
  guideInspector: "starter-texture-studio-guide-inspector",
  guideAssets: "starter-texture-studio-guide-assets",
  guidePlayPublish: "starter-texture-studio-guide-play-publish",
} as const;

const STARTER_MATERIAL_IDS = {
  ground: "starter-material-ground",
  guideFrame: "starter-material-guide-frame",
  guideAccent: "starter-material-guide-accent",
  guidePlinth: "starter-material-guide-plinth",
  guideOverview: "starter-material-guide-overview",
  guideHierarchyCreate: "starter-material-guide-hierarchy-create",
  guideSceneTools: "starter-material-guide-scene-tools",
  guideInspector: "starter-material-guide-inspector",
  guideAssets: "starter-material-guide-assets",
  guidePlayPublish: "starter-material-guide-play-publish",
} as const;

function createStarterMaterials(
  templateId: StarterWorldTemplateId,
): MaterialAsset[] {
  if (templateId === "xrift-official") return [];
  if (templateId === "studio-guide") {
    return [
      createMaterial(
        STARTER_MATERIAL_IDS.ground,
        "Guide Floor",
        "#d8dee9",
        0,
        0.72,
        STARTER_TEXTURE_IDS.polishedConcrete,
        0,
      ),
      createMaterial(
        STARTER_MATERIAL_IDS.guideFrame,
        "Guide Panel Frame",
        "#18181b",
        0.25,
        0.42,
        undefined,
        1,
      ),
      createMaterial(
        STARTER_MATERIAL_IDS.guideAccent,
        "Guide Accent",
        "#7c3aed",
        0.05,
        0.48,
        undefined,
        2,
      ),
      createMaterial(
        STARTER_MATERIAL_IDS.guidePlinth,
        "Guide Plinth",
        "#e4e4e7",
        0.05,
        0.7,
        STARTER_TEXTURE_IDS.woodPlanks,
        3,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guideOverview,
        "Guide Screen: Overview",
        STARTER_TEXTURE_IDS.guideOverview,
        4,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guideHierarchyCreate,
        "Guide Screen: Hierarchy and Create",
        STARTER_TEXTURE_IDS.guideHierarchyCreate,
        5,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guideSceneTools,
        "Guide Screen: Scene Tools",
        STARTER_TEXTURE_IDS.guideSceneTools,
        6,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guideInspector,
        "Guide Screen: Inspector",
        STARTER_TEXTURE_IDS.guideInspector,
        7,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guideAssets,
        "Guide Screen: Assets",
        STARTER_TEXTURE_IDS.guideAssets,
        8,
      ),
      createGuideScreenMaterial(
        STARTER_MATERIAL_IDS.guidePlayPublish,
        "Guide Screen: Play and Publish",
        STARTER_TEXTURE_IDS.guidePlayPublish,
        9,
      ),
    ];
  }
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

function createGuideScreenMaterial(
  id: string,
  name: string,
  textureAssetId: string,
  order: number,
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
      color: "#ffffff",
      metalness: 0,
      roughness: 1,
      baseColorTextureId: textureAssetId,
      doubleSided: true,
      extensions: { KHR_materials_unlit: {} },
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
  "xrift-official-duck": {
    assetId: STARTER_MODEL_IDS.xriftDuck,
    name: "Duck",
    materialName: "Duck Material",
    importMetadata: modelMetadata(2, 1, 1, {
      min: [-0.692985, 0.099294, -0.613282],
      max: [0.961799, 1.6397, 0.539252],
      center: [0.134407, 0.869497, -0.037015],
      size: [1.654784, 1.540406, 1.152534],
      boundingSphereRadius: 1.268,
    }),
  },
  "xrift-official-bunny": {
    assetId: STARTER_MODEL_IDS.xriftBunny,
    name: "Draco Bunny",
    materialName: "Draco Material",
    importMetadata: modelMetadata(2, 1, 1, {
      min: [-0.09469, 0.032987, -0.061874],
      max: [0.061009, 0.187317, 0.058836],
      center: [-0.016841, 0.110152, -0.001519],
      size: [0.155699, 0.15433, 0.12071],
      boundingSphereRadius: 0.125,
    }),
  },
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
    id === "xrift-official-duck" ||
    id === "xrift-official-bunny" ||
    id === "log-bench" ||
    id === "torii-gate" ||
    id === "mug" ||
    id === "wine-glass" ||
    id === "openbrush-all-brushes"
  );
}

const STARTER_TEXTURE_METADATA = {
  "xrift-official-tokyo-station": {
    assetId: STARTER_TEXTURE_IDS.xriftTokyoStation,
    name: "Tokyo Station Panorama",
    order: 0,
    width: 1024,
    height: 512,
    wrap: "clamp-to-edge",
  },
  "wood-planks-clean": {
    assetId: STARTER_TEXTURE_IDS.woodPlanks,
    name: "Wood Planks",
    order: 0,
    width: 1024,
    height: 1024,
    wrap: "repeat",
  },
  "polished-concrete": {
    assetId: STARTER_TEXTURE_IDS.polishedConcrete,
    name: "Polished Concrete",
    order: 1,
    width: 1254,
    height: 1254,
    wrap: "repeat",
  },
  "studio-guide-overview": {
    assetId: STARTER_TEXTURE_IDS.guideOverview,
    name: "Studio Guide: Overview",
    order: 2,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
  "studio-guide-hierarchy-create": {
    assetId: STARTER_TEXTURE_IDS.guideHierarchyCreate,
    name: "Studio Guide: Hierarchy and Create",
    order: 3,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
  "studio-guide-scene-tools": {
    assetId: STARTER_TEXTURE_IDS.guideSceneTools,
    name: "Studio Guide: Scene View Tools",
    order: 4,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
  "studio-guide-inspector": {
    assetId: STARTER_TEXTURE_IDS.guideInspector,
    name: "Studio Guide: Inspector",
    order: 5,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
  "studio-guide-assets": {
    assetId: STARTER_TEXTURE_IDS.guideAssets,
    name: "Studio Guide: Assets",
    order: 6,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
  "studio-guide-play-publish": {
    assetId: STARTER_TEXTURE_IDS.guidePlayPublish,
    name: "Studio Guide: Play and Publish",
    order: 7,
    width: 1024,
    height: 576,
    wrap: "clamp-to-edge",
  },
} as const satisfies Record<
  BundledStarterTextureId,
  {
    assetId: string;
    name: string;
    order: number;
    width: number;
    height: number;
    wrap: "repeat" | "clamp-to-edge";
  }
>;

function createStarterTextureAsset(bundledId: BundledStarterAssetId): TextureAsset {
  if (isBundledStarterModelId(bundledId)) {
    throw new Error(`Starter asset is not a Texture: ${bundledId}`);
  }
  const bundled = BUNDLED_STARTER_ASSETS[bundledId];
  const metadata = STARTER_TEXTURE_METADATA[bundledId];
  return {
    id: metadata.assetId,
    name: metadata.name,
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: bundled.projectRelativePath },
    sourceHash: bundled.sha256,
    thumbnail: { status: "missing" },
    folderId: STARTER_ASSET_FOLDER_IDS.textures,
    order: metadata.order,
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      generateMipmaps: true,
      flipY: false,
      resize: { mode: "original" },
      sampler: {
        wrapS: metadata.wrap,
        wrapT: metadata.wrap,
        magFilter: "linear",
        minFilter: "linear-mipmap-linear",
      },
      compression: { format: "source", quality: 80 },
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: bundled.byteLength,
      width: metadata.width,
      height: metadata.height,
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
  const floorScale: Vec3 =
    templateId === "studio-guide"
      ? [14, 44, 1]
      : templateId === "openbrush"
        ? [10, 10, 10]
        : [8, 8, 8];
  const floorPosition: Vec3 =
    templateId === "studio-guide" ? [0, 0, -8] : [0, 0, 0];
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
        floorPosition,
        [-Math.PI / 2, 0, 0],
        floorScale,
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

function createSpawnEntity(position: Vec3 = [0, 0.05, 4]): SceneEntity {
  const created = createBuiltinPrefabEntity(
    "world",
    BUILTIN_PREFAB_RECIPE_IDS.spawnPoint,
    {
      entityId: "starter-spawn",
      componentId: "starter-spawn-xrift-component",
      transformComponentId: "starter-spawn-transform",
      name: "Spawn Point",
      position,
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
