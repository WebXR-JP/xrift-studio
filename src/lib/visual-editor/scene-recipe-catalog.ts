import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import { BUILTIN_PRIMITIVE_CREATION_IDS, getBuiltinPrimitiveCreation } from "./creation-catalog";
import { createDocumentId } from "./document-id";
import {
  addDefaultParticleAsset,
  getParticleAuthoringPreset,
  type ParticlePropertiesPatch,
} from "./particle-system";
import { ensureBuiltinMaterialAsset } from "./prototype-project";
import {
  createBuiltinPrimitiveMeshComponent,
  createParticleEmitterComponent,
  createTransformComponent,
  type LightComponent,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";
import type { AssetManifest } from "./asset-manifest";
import type { VisualProjectKind } from "./project-document";

/**
 * Scene recipes: one Entity subtree assembled from parts that already exist.
 *
 * A campfire is a fire, a smoke, a warm light and a ring of stones. Every one
 * of those is already in the editor, and an author who knows that still has to
 * make two Particle Assets, add a Light, place eight stones and line them all
 * up before anything looks like a campfire. That assembly is the whole cost,
 * and it is the same assembly every time — so it belongs here rather than in
 * each author's first hour.
 *
 * These are not a new runtime. What lands is ordinary Entities with ordinary
 * Components, so every part stays selectable, movable and deletable, and the
 * compiler needs to know nothing about recipes.
 */

export type SceneRecipePart =
  | {
      kind: "primitive";
      name: string;
      creationId: string;
      materialAssetId: string;
      position: Vec3;
      rotation: Vec3;
      scale: Vec3;
    }
  | {
      kind: "particle";
      name: string;
      /** Preset from PARTICLE_AUTHORING_PRESETS this part starts from. */
      presetId: string;
      /** Applied over the preset, for values this recipe needs different. */
      overrides?: ParticlePropertiesPatch;
      position: Vec3;
    }
  | {
      kind: "light";
      name: string;
      position: Vec3;
      light: Omit<LightComponent, "id" | "type" | "enabled">;
    };

export type SceneRecipe = {
  id: string;
  name: string;
  description: string;
  projectKinds: readonly VisualProjectKind[];
  /** Said before placing: what the author still has to do themselves. */
  note: string;
  parts: readonly SceneRecipePart[];
};

export const SCENE_RECIPE_IDS = {
  campfire: "scene-recipe.campfire",
} as const;

/** Eight stones on a 0.5 m ring, each a slightly different block. */
const CAMPFIRE_STONES: readonly {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}[] = [
  { position: [0.5, 0.07, 0], rotation: [0, 0.35, 0], scale: [0.26, 0.14, 0.22] },
  { position: [0.35, 0.06, 0.35], rotation: [0, -0.8, 0], scale: [0.22, 0.12, 0.24] },
  { position: [0, 0.08, 0.5], rotation: [0, 0.15, 0], scale: [0.3, 0.16, 0.2] },
  { position: [-0.35, 0.06, 0.35], rotation: [0, 0.9, 0], scale: [0.24, 0.13, 0.22] },
  { position: [-0.5, 0.07, 0], rotation: [0, -0.25, 0], scale: [0.26, 0.15, 0.24] },
  { position: [-0.35, 0.06, -0.35], rotation: [0, 0.6, 0], scale: [0.22, 0.12, 0.2] },
  { position: [0, 0.07, -0.5], rotation: [0, -0.45, 0], scale: [0.28, 0.14, 0.22] },
  { position: [0.35, 0.06, -0.35], rotation: [0, 1.1, 0], scale: [0.24, 0.13, 0.24] },
];

const CAMPFIRE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.campfire,
  name: "焚き火",
  description: "炎、煙、暖色のライト、石の輪をひとまとめに置きます。",
  projectKinds: ["world", "item"],
  note: "音は含みません。焚き火の音を鳴らすには、MP3をAudio Assetとして取り込み、この焚き火へAudio Sourceを追加してください。",
  parts: [
    ...CAMPFIRE_STONES.map((stone, index) => ({
      kind: "primitive" as const,
      name: `石 ${index + 1}`,
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: stone.position,
      rotation: stone.rotation,
      scale: stone.scale,
    })),
    {
      kind: "particle",
      name: "炎",
      presetId: "fire",
      position: [0, 0.06, 0],
    },
    {
      kind: "particle",
      name: "煙",
      presetId: "smoke",
      // The plain 煙 preset is sized for a chimney. A campfire's smoke starts
      // inside the stone ring, so it has to be narrower and thinner or it
      // swallows the flame it is supposed to sit above.
      overrides: {
        maxParticles: 90,
        startSize: { min: 0.18, max: 0.38 },
        emission: { rateOverTime: 6, bursts: [] },
        shape: { type: "cone", radius: 0.16, angle: 18 },
        colorOverLifetime: {
          start: [0.72, 0.74, 0.78, 0.34],
          end: [0.24, 0.26, 0.32, 0],
        },
      },
      position: [0, 0.45, 0],
    },
    {
      kind: "light",
      name: "灯り",
      position: [0, 0.55, 0],
      light: {
        lightType: "point",
        color: "#ff9b4d",
        // Bright and short-range: a campfire lights what is around it without
        // becoming the scene's key light.
        intensity: 2.4,
        distance: 6,
        decay: 2,
        castShadow: false,
      },
    },
  ],
};

export const SCENE_RECIPES: readonly SceneRecipe[] = [CAMPFIRE];

export function getSceneRecipe(recipeId: string): SceneRecipe | undefined {
  return SCENE_RECIPES.find((recipe) => recipe.id === recipeId);
}

export function getSceneRecipesForProjectKind(
  projectKind: VisualProjectKind,
): readonly SceneRecipe[] {
  return SCENE_RECIPES.filter((recipe) =>
    recipe.projectKinds.includes(projectKind),
  );
}

export type SceneRecipeInstantiation = {
  scene: SceneDocument;
  assets: AssetManifest;
  rootEntityId: string;
  /** Particle Assets this placement added, for the message and for tests. */
  createdAssetIds: readonly string[];
};

/**
 * Builds the recipe's subtree into `scene`, creating the Particle Assets it
 * needs along the way.
 *
 * Returns the new scene and assets together so the caller commits both as one
 * history entry: undoing a campfire nobody wanted should not leave its two
 * Particle Assets behind in the library.
 */
export function instantiateSceneRecipe(
  scene: SceneDocument,
  assets: AssetManifest,
  recipeId: string,
  projectKind: VisualProjectKind,
  position: Vec3 = [0, 0, 0],
): SceneRecipeInstantiation | null {
  const recipe = getSceneRecipe(recipeId);
  if (!recipe || !recipe.projectKinds.includes(projectKind)) return null;

  let nextAssets = assets;
  const createdAssetIds: string[] = [];
  const rootEntityId = createDocumentId("entity");
  const children: SceneEntity[] = [];

  for (const part of recipe.parts) {
    const entityId = createDocumentId("entity");
    const components: SceneComponent[] = [
      createTransformComponent(
        createDocumentId("component-transform"),
        part.position,
        part.kind === "primitive" ? part.rotation : [0, 0, 0],
        part.kind === "primitive" ? part.scale : [1, 1, 1],
      ),
    ];

    if (part.kind === "primitive") {
      const definition = getBuiltinPrimitiveCreation(part.creationId);
      if (!definition) return null;
      nextAssets = ensureBuiltinMaterialAsset(nextAssets, part.materialAssetId);
      if (nextAssets.assets[part.materialAssetId]?.kind !== "material") {
        return null;
      }
      components.push(
        createBuiltinPrimitiveMeshComponent(
          createDocumentId("component-mesh"),
          definition,
          [{ slot: "default", materialAssetId: part.materialAssetId }],
        ),
      );
    } else if (part.kind === "particle") {
      const preset = getParticleAuthoringPreset(part.presetId);
      if (!preset) return null;
      const assetId = createDocumentId("particle");
      const added = addDefaultParticleAsset(nextAssets, {
        id: assetId,
        name: uniqueAssetName(nextAssets, `${recipe.name}の${part.name}`),
        folderId: null,
        properties: { ...preset.properties, ...(part.overrides ?? {}) },
      });
      if (!added.added) return null;
      nextAssets = added.manifest;
      createdAssetIds.push(assetId);
      const emitter = createParticleEmitterComponent(
        createDocumentId("component-particle-emitter"),
        assetId,
      );
      if (!emitter) return null;
      components.push(emitter);
    } else {
      components.push({
        id: createDocumentId("component-light"),
        type: "light",
        enabled: true,
        ...part.light,
      });
    }

    children.push({
      id: entityId,
      name: part.name,
      parentId: rootEntityId,
      children: [],
      enabled: true,
      components,
    });
  }

  const root: SceneEntity = {
    id: rootEntityId,
    name: uniqueEntityName(scene, recipe.name),
    parentId: null,
    children: children.map((child) => child.id),
    enabled: true,
    components: [
      createTransformComponent(
        createDocumentId("component-transform"),
        position,
      ),
    ],
  };

  const entities = { ...scene.entities, [rootEntityId]: root };
  for (const child of children) entities[child.id] = child;

  return {
    scene: {
      ...scene,
      rootEntityIds: [...scene.rootEntityIds, rootEntityId],
      entities,
    },
    assets: nextAssets,
    rootEntityId,
    createdAssetIds,
  };
}

function uniqueEntityName(scene: SceneDocument, base: string): string {
  const names = new Set(
    Object.values(scene.entities).map((entity) =>
      entity.name.toLocaleLowerCase(),
    ),
  );
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let index = 2; index < 1000; index += 1) {
    if (!names.has(`${base} ${index}`.toLocaleLowerCase())) {
      return `${base} ${index}`;
    }
  }
  return base;
}

function uniqueAssetName(assets: AssetManifest, base: string): string {
  const names = new Set(Object.values(assets.assets).map((asset) => asset.name));
  if (!names.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    if (!names.has(`${base} ${index}`)) return `${base} ${index}`;
  }
  return base;
}
