import {
  addDefaultMaterialAsset,
  isEnvironmentTextureAsset,
  type AssetManifest,
} from "./asset-manifest";
import {
  BUILTIN_PRIMITIVE_CREATION_IDS,
  type BuiltinPrimitiveCreationDefinition,
  getBuiltinPrimitiveCreation,
} from "./creation-catalog";
import { createDocumentId } from "./document-id";
import {
  addBuiltinPrimitiveEntity,
  createBuiltinPrimitiveMeshComponent,
  createTransformComponent,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

/** A texture-backed card preset for painted distance scenery or foreground foliage. */
export type TextureCardProfile =
  | "backdrop-flat"
  | "backdrop-arc-180"
  | "backdrop-arc-270"
  | "grass-single"
  | "grass-cross";

type TextureCardRecipe = {
  label: string;
  materialLabel: string;
  definitionId: string;
  opacity: number;
  cross?: boolean;
  arcDegrees?: 180 | 270;
  arcSegments?: number;
  arcRadius?: number;
};

const TEXTURE_CARD_RECIPES: Readonly<Record<TextureCardProfile, TextureCardRecipe>> = {
  "backdrop-flat": {
    label: "遠景カード",
    materialLabel: "遠景",
    definitionId: BUILTIN_PRIMITIVE_CREATION_IDS.backdropCard,
    opacity: 0.86,
  },
  "backdrop-arc-180": {
    label: "遠景カーブ 180°",
    materialLabel: "遠景 180°",
    definitionId: BUILTIN_PRIMITIVE_CREATION_IDS.backdropCard,
    opacity: 0.86,
    arcDegrees: 180,
    arcSegments: 7,
    arcRadius: 18,
  },
  "backdrop-arc-270": {
    label: "遠景カーブ 270°",
    materialLabel: "遠景 270°",
    definitionId: BUILTIN_PRIMITIVE_CREATION_IDS.backdropCard,
    opacity: 0.86,
    arcDegrees: 270,
    arcSegments: 10,
    arcRadius: 18,
  },
  "grass-single": {
    label: "草カード",
    materialLabel: "草",
    definitionId: BUILTIN_PRIMITIVE_CREATION_IDS.grassCard,
    opacity: 1,
  },
  "grass-cross": {
    label: "草クロス",
    materialLabel: "草クロス",
    definitionId: BUILTIN_PRIMITIVE_CREATION_IDS.grassCard,
    opacity: 1,
    cross: true,
  },
};

export type CreateTextureCardResult =
  | {
      created: true;
      assets: AssetManifest;
      scene: SceneDocument;
      entityId: string;
      materialId: string;
      entityName: string;
    }
  | {
      created: false;
      assets: AssetManifest;
      scene: SceneDocument;
      reason:
        | "texture-missing"
        | "environment-texture"
        | "material-create-failed"
        | "card-create-failed";
    };

/**
 * Adds a reusable transparent Material and its corresponding non-colliding
 * card Entity in one transaction. The preset matches the supplied reference
 * GLBs: alpha blend, two-sided rendering, and no unnecessary physics shape.
 */
export function createTextureCard(
  scene: SceneDocument,
  assets: AssetManifest,
  input: {
    textureAssetId: string;
    materialId: string;
    profile: TextureCardProfile;
  },
): CreateTextureCardResult {
  const texture = assets.assets[input.textureAssetId];
  if (!texture || texture.kind !== "texture") {
    return { created: false, assets, scene, reason: "texture-missing" };
  }
  if (isEnvironmentTextureAsset(texture)) {
    return { created: false, assets, scene, reason: "environment-texture" };
  }

  const recipe = TEXTURE_CARD_RECIPES[input.profile];
  const definition = getBuiltinPrimitiveCreation(recipe.definitionId);
  if (!definition) {
    return { created: false, assets, scene, reason: "card-create-failed" };
  }

  const materialCount = recipe.arcSegments ?? 1;
  const materialResult = createCardMaterials(
    assets,
    texture.id,
    texture.name,
    texture.folderId ?? null,
    input.materialId,
    recipe,
    materialCount,
  );
  if (!materialResult) {
    return { created: false, assets, scene, reason: "material-create-failed" };
  }
  const existingCards = scene.rootEntityIds.filter((entityId) => {
    const name = scene.entities[entityId]?.name;
    return name?.startsWith("遠景") || name?.startsWith("草");
  }).length;
  const offset = existingCards * (recipe.arcDegrees ? 4 : recipe.cross ? 1.8 : 3);
  const result = recipe.arcDegrees
    ? createArcBackdrop(
        scene,
        definition,
        materialResult.materialIds,
        recipe,
        offset,
      )
    : createFlatOrCrossCard(
        scene,
        materialResult.manifest,
        definition,
        materialResult.materialIds[0]!,
        recipe,
        offset,
      );
  if (!result) {
    return { created: false, assets, scene, reason: "card-create-failed" };
  }

  return {
    created: true,
    assets: materialResult.manifest,
    scene: result.scene,
    entityId: result.entityId,
    materialId: materialResult.materialIds[0]!,
    entityName: recipe.label,
  };
}

function createCardMaterials(
  initialAssets: AssetManifest,
  textureAssetId: string,
  textureName: string,
  folderId: string | null,
  materialIdPrefix: string,
  recipe: TextureCardRecipe,
  count: number,
): { manifest: AssetManifest; materialIds: string[] } | null {
  let manifest = initialAssets;
  const materialIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const materialId = count === 1 ? materialIdPrefix : `${materialIdPrefix}-${index + 1}`;
    const material = addDefaultMaterialAsset(manifest, {
      id: materialId,
      name:
        count === 1
          ? `${textureName} ${recipe.materialLabel}`
          : `${textureName} ${recipe.materialLabel} ${index + 1}/${count}`,
      folderId,
      properties: {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, recipe.opacity],
          baseColorTexture: {
            textureAssetId,
            texCoord: 0,
            ...(count > 1
              ? {
                  transform: {
                    offset: [index / count, 0] as [number, number],
                    rotation: 0,
                    scale: [1 / count, 1] as [number, number],
                  },
                }
              : {}),
          },
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        alphaMode: "BLEND",
        doubleSided: true,
      },
    });
    if (!material.added) return null;
    manifest = material.manifest;
    materialIds.push(material.assetId);
  }
  return { manifest, materialIds };
}

function createFlatOrCrossCard(
  scene: SceneDocument,
  assets: AssetManifest,
  definition: BuiltinPrimitiveCreationDefinition,
  materialId: string,
  recipe: TextureCardRecipe,
  offset: number,
): { scene: SceneDocument; entityId: string } | null {
  const result = addBuiltinPrimitiveEntity(
    scene,
    assets,
    definition.creationId,
    materialId,
    [
      definition.defaultTransform.position[0] + offset,
      definition.defaultTransform.position[1],
      definition.defaultTransform.position[2],
    ],
  );
  if (!result) return null;
  const root = result.scene.entities[result.entityId];
  if (!recipe.cross || !root) {
    return {
      scene: renameRootEntity(result.scene, result.entityId, recipe.label),
      entityId: result.entityId,
    };
  }
  const companionId = createDocumentId("entity");
  const companion: SceneEntity = {
    id: companionId,
    name: `${recipe.label} 背面`,
    parentId: root.id,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        [0, 0, 0],
        [0, Math.PI / 2, 0],
        [1, 1, 1],
      ),
      createBuiltinPrimitiveMeshComponent(
        createDocumentId("component-mesh"),
        definition,
        [{ slot: "default", materialAssetId: materialId }],
      ),
    ],
  };
  return {
    entityId: root.id,
    scene: {
      ...result.scene,
      entities: {
        ...result.scene.entities,
        [root.id]: { ...root, name: recipe.label, children: [...root.children, companionId] },
        [companionId]: companion,
      },
    },
  };
}

function createArcBackdrop(
  scene: SceneDocument,
  definition: BuiltinPrimitiveCreationDefinition,
  materialIds: readonly string[],
  recipe: TextureCardRecipe,
  offset: number,
): { scene: SceneDocument; entityId: string } | null {
  const segments = recipe.arcSegments;
  const radius = recipe.arcRadius;
  const degrees = recipe.arcDegrees;
  if (!segments || !radius || !degrees || materialIds.length !== segments) return null;
  const rootId = createDocumentId("entity");
  const childIds: string[] = [];
  const entities: Record<string, SceneEntity> = { ...scene.entities };
  const span = (degrees * Math.PI) / 180;
  const panelWidth = 2 * radius * Math.sin(span / (segments * 2));
  for (let index = 0; index < segments; index += 1) {
    const angle = -span / 2 + (index + 0.5) * (span / segments);
    const childId = createDocumentId("entity");
    childIds.push(childId);
    const position: Vec3 = [Math.sin(angle) * radius, 0, -Math.cos(angle) * radius];
    entities[childId] = {
      id: childId,
      name: `${recipe.label} ${index + 1}/${segments}`,
      parentId: rootId,
      children: [],
      enabled: true,
      components: [
        createTransformComponent(
          createDocumentId("component-transform"),
          position,
          [0, -angle, 0],
          [panelWidth, definition.defaultTransform.scale[1], 1],
        ),
        createBuiltinPrimitiveMeshComponent(
          createDocumentId("component-mesh"),
          definition,
          [{ slot: "default", materialAssetId: materialIds[index]! }],
        ),
      ],
    };
  }
  entities[rootId] = {
    id: rootId,
    name: recipe.label,
    parentId: null,
    children: childIds,
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        [offset, definition.defaultTransform.position[1], 0],
      ),
    ],
  };
  return {
    entityId: rootId,
    scene: {
      ...scene,
      entities,
      rootEntityIds: [...scene.rootEntityIds, rootId],
    },
  };
}

function renameRootEntity(
  scene: SceneDocument,
  entityId: string,
  name: string,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity || entity.name === name) return scene;
  return {
    ...scene,
    entities: { ...scene.entities, [entityId]: { ...entity, name } },
  };
}
