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
  streetLight: "scene-recipe.street-light",
  torch: "scene-recipe.torch",
  fountain: "scene-recipe.fountain",
  fireflyBush: "scene-recipe.firefly-bush",
  bench: "scene-recipe.bench",
  lanterns: "scene-recipe.lanterns",
} as const;

/**
 * Blocks placed evenly around a circle, each turned and sized a little
 * differently.
 *
 * A ring of identical boxes at identical angles reads as a machine part. The
 * variation is what makes eight blocks read as stones, so it is computed from
 * the index rather than left to the caller to type out.
 */
function stoneRing(
  count: number,
  radius: number,
  size: readonly [number, number, number],
): SceneRecipePart[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const wobble = ((index * 37) % 11) / 11 - 0.5;
    const height = size[1] * (1 + wobble * 0.35);
    return {
      kind: "primitive" as const,
      name: `石 ${index + 1}`,
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [
        roundTo(Math.cos(angle) * radius),
        roundTo(height / 2),
        roundTo(Math.sin(angle) * radius),
      ] as Vec3,
      rotation: [0, roundTo(angle + wobble), 0] as Vec3,
      scale: [
        roundTo(size[0] * (1 + wobble * 0.3)),
        roundTo(height),
        roundTo(size[2] * (1 - wobble * 0.25)),
      ] as Vec3,
    };
  });
}

function roundTo(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const CAMPFIRE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.campfire,
  name: "焚き火",
  description: "炎、煙、暖色のライト、石の輪をひとまとめに置きます。",
  projectKinds: ["world", "item"],
  note: "音は含みません。焚き火の音を鳴らすには、MP3をAudio Assetとして取り込み、この焚き火へAudio Sourceを追加してください。",
  parts: [
    ...stoneRing(8, 0.5, [0.26, 0.14, 0.22]),
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

const STREET_LIGHT: SceneRecipe = {
  id: SCENE_RECIPE_IDS.streetLight,
  name: "街灯",
  description: "支柱、笠、光る球、届く範囲を決めたライトを1本で置きます。",
  projectKinds: ["world", "item"],
  note: "球が光って見えるのはScene設定のポストエフェクトとBloomが有効なときです。無効でもライトは点きます。",
  parts: [
    {
      kind: "primitive",
      name: "台座",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 0.06, 0],
      rotation: [0, 0, 0],
      scale: [0.16, 0.12, 0.16],
    },
    {
      kind: "primitive",
      name: "支柱",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 1.5, 0],
      rotation: [0, 0, 0],
      scale: [0.05, 3, 0.05],
    },
    {
      kind: "primitive",
      name: "笠",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.cone,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 3.16, 0],
      rotation: [0, 0, 0],
      scale: [0.3, 0.24, 0.3],
    },
    {
      kind: "primitive",
      name: "光る球",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
      materialAssetId: BUILTIN_ASSET_IDS.material.glow,
      position: [0, 2.94, 0],
      rotation: [0, 0, 0],
      scale: [0.13, 0.13, 0.13],
    },
    {
      kind: "light",
      name: "灯り",
      position: [0, 2.88, 0],
      light: {
        // Reaches a path rather than a room: far enough to walk under, short
        // enough that two of them do not wash the scene out.
        lightType: "point",
        color: "#ffe6b8",
        intensity: 3,
        distance: 12,
        decay: 2,
        castShadow: false,
      },
    },
  ],
};

const TORCH: SceneRecipe = {
  id: SCENE_RECIPE_IDS.torch,
  name: "松明",
  description: "細い柄に小さな炎と火の粉、手元を照らす暖色のライト。",
  projectKinds: ["world", "item"],
  note: "壁に付ける場合は、追加後にTransformのRotationで傾けてください。炎は柄の先に固定されているので一緒に傾きます。",
  parts: [
    {
      kind: "primitive",
      name: "柄",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 0.6, 0],
      rotation: [0, 0, 0],
      scale: [0.035, 1.2, 0.035],
    },
    {
      kind: "particle",
      name: "炎",
      presetId: "fire",
      // A torch flame is a fraction of a campfire's: the same preset at full
      // size swallows the stick it sits on.
      overrides: {
        maxParticles: 140,
        startSize: { min: 0.06, max: 0.16 },
        startLifetime: { min: 0.4, max: 0.8 },
        emission: { rateOverTime: 26, bursts: [] },
        shape: { type: "cone", radius: 0.06, angle: 12 },
      },
      position: [0, 1.24, 0],
    },
    {
      kind: "particle",
      name: "火の粉",
      presetId: "spark",
      overrides: {
        maxParticles: 60,
        startSpeed: { min: 0.5, max: 1.3 },
        emission: { rateOverTime: 12, bursts: [] },
        gravity: [0, -1.6, 0],
      },
      position: [0, 1.28, 0],
    },
    {
      kind: "light",
      name: "灯り",
      position: [0, 1.34, 0],
      light: {
        lightType: "point",
        color: "#ff9b4d",
        intensity: 1.6,
        distance: 5,
        decay: 2,
        castShadow: false,
      },
    },
  ],
};

const FOUNTAIN: SceneRecipe = {
  id: SCENE_RECIPE_IDS.fountain,
  name: "噴水",
  description: "石の縁と中央の台、弧を描いて落ちる飛沫。",
  projectKinds: ["world", "item"],
  note: "水音は含みません。Colliderは石にも台にも入っていないので、乗れないようにするならColliderを追加してください。",
  parts: [
    ...stoneRing(12, 0.95, [0.3, 0.24, 0.26]),
    {
      kind: "primitive",
      name: "台",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 0.14, 0],
      rotation: [0, 0, 0],
      scale: [0.22, 0.28, 0.22],
    },
    {
      kind: "particle",
      name: "飛沫",
      presetId: "fountain",
      position: [0, 0.32, 0],
    },
  ],
};

const FIREFLY_BUSH: SceneRecipe = {
  id: SCENE_RECIPE_IDS.fireflyBush,
  name: "蛍の茂み",
  description: "低い茂みと、その上をゆっくり漂う蛍。",
  projectKinds: ["world", "item"],
  note: "蛍は暗いほど見えます。昼の空のままだとほとんど見えないので、夜空のプリセットか暗めのライトと合わせてください。",
  parts: [
    {
      kind: "primitive",
      name: "茂み 1",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
      materialAssetId: BUILTIN_ASSET_IDS.material.green,
      position: [0, 0.22, 0],
      rotation: [0, 0, 0],
      scale: [0.55, 0.3, 0.5],
    },
    {
      kind: "primitive",
      name: "茂み 2",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
      materialAssetId: BUILTIN_ASSET_IDS.material.green,
      position: [0.6, 0.16, 0.35],
      rotation: [0, 0.4, 0],
      scale: [0.4, 0.22, 0.38],
    },
    {
      kind: "primitive",
      name: "茂み 3",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
      materialAssetId: BUILTIN_ASSET_IDS.material.green,
      position: [-0.5, 0.14, -0.3],
      rotation: [0, -0.6, 0],
      scale: [0.36, 0.2, 0.34],
    },
    {
      kind: "particle",
      name: "蛍",
      presetId: "firefly",
      // Held to the bush rather than the preset's wide sphere, so the set
      // reads as one object that can be moved as one object.
      overrides: {
        maxParticles: 60,
        emission: { rateOverTime: 9, bursts: [] },
        shape: { type: "sphere", radius: 1.1 },
      },
      position: [0, 0.7, 0],
    },
    {
      kind: "light",
      name: "灯り",
      position: [0, 0.6, 0],
      light: {
        // Just enough to say the bush is where the light comes from.
        lightType: "point",
        color: "#b6ff7a",
        intensity: 0.5,
        distance: 4,
        decay: 2,
        castShadow: false,
      },
    },
  ],
};

const BENCH: SceneRecipe = {
  id: SCENE_RECIPE_IDS.bench,
  name: "ベンチ",
  description: "座面、脚、背もたれの3つ分でできた1.6mのベンチ。",
  projectKinds: ["world", "item"],
  note: "座る機能は付いていません。見た目の家具として置けます。人が上を歩けないようにするならColliderを追加してください。",
  parts: [
    {
      kind: "primitive",
      name: "座面",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 0.44, 0],
      rotation: [0, 0, 0],
      scale: [1.6, 0.08, 0.45],
    },
    {
      kind: "primitive",
      name: "脚 左",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [-0.66, 0.2, 0],
      rotation: [0, 0, 0],
      scale: [0.1, 0.4, 0.4],
    },
    {
      kind: "primitive",
      name: "脚 右",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0.66, 0.2, 0],
      rotation: [0, 0, 0],
      scale: [0.1, 0.4, 0.4],
    },
    {
      kind: "primitive",
      name: "背もたれ",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 0.72, -0.19],
      rotation: [0, 0, 0],
      scale: [1.6, 0.48, 0.06],
    },
  ],
};

const LANTERNS: SceneRecipe = {
  id: SCENE_RECIPE_IDS.lanterns,
  name: "提灯",
  description: "横木に下げた3つの提灯と、下を照らす1灯。",
  projectKinds: ["world", "item"],
  note: "提灯が光って見えるのはBloomが有効なときです。ライトは提灯ごとではなく中央に1つだけ置いています。",
  parts: [
    {
      kind: "primitive",
      name: "横木",
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.box,
      materialAssetId: BUILTIN_ASSET_IDS.material.slate,
      position: [0, 2.4, 0],
      rotation: [0, 0, 0],
      scale: [2.6, 0.05, 0.05],
    },
    ...[-0.9, 0, 0.9].map((x, index) => ({
      kind: "primitive" as const,
      name: `提灯 ${index + 1}`,
      creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
      materialAssetId: BUILTIN_ASSET_IDS.material.glow,
      position: [x, 2.14, 0] as Vec3,
      rotation: [0, 0, 0] as Vec3,
      scale: [0.16, 0.21, 0.16] as Vec3,
    })),
    {
      kind: "light",
      name: "灯り",
      position: [0, 2.1, 0],
      light: {
        // One light for three lanterns. Three point lights here would triple
        // the cost for a difference nobody standing underneath can see.
        lightType: "point",
        color: "#ffd9a0",
        intensity: 1.4,
        distance: 7,
        decay: 2,
        castShadow: false,
      },
    },
  ],
};

export const SCENE_RECIPES: readonly SceneRecipe[] = [
  CAMPFIRE,
  TORCH,
  LANTERNS,
  STREET_LIGHT,
  FIREFLY_BUSH,
  FOUNTAIN,
  BENCH,
];

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
