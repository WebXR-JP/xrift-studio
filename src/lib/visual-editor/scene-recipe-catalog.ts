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

/**
 * What an author is looking for when they open the shelf.
 *
 * Grouped by the job, not by which Component the set happens to use: someone
 * lighting a path wants 火と灯り whether that turns out to be a lamp post or a
 * brazier.
 */
export type SceneRecipeCategory =
  | "light"
  | "nature"
  | "weather"
  | "water"
  | "structure"
  | "furniture"
  | "effect";

export const SCENE_RECIPE_CATEGORY_LABELS: Readonly<
  Record<SceneRecipeCategory, string>
> = {
  light: "火と灯り",
  nature: "自然",
  weather: "天気",
  water: "水",
  structure: "建物",
  furniture: "家具",
  effect: "演出",
};

export type SceneRecipe = {
  id: string;
  name: string;
  description: string;
  category: SceneRecipeCategory;
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
  stoneLantern: "scene-recipe.stone-lantern",
  brazier: "scene-recipe.brazier",
  candelabra: "scene-recipe.candelabra",
  tree: "scene-recipe.tree",
  bamboo: "scene-recipe.bamboo",
  rocks: "scene-recipe.rocks",
  stump: "scene-recipe.stump",
  firewood: "scene-recipe.firewood",
  snowman: "scene-recipe.snowman",
  hotSpring: "scene-recipe.hot-spring",
  snowfall: "scene-recipe.snowfall",
  rainfall: "scene-recipe.rainfall",
  petalfall: "scene-recipe.petalfall",
  groundFog: "scene-recipe.ground-fog",
  magicCircle: "scene-recipe.magic-circle",
  warpPillar: "scene-recipe.warp-pillar",
  column: "scene-recipe.column",
  archGate: "scene-recipe.arch-gate",
  stairs: "scene-recipe.stairs",
  wall: "scene-recipe.wall",
  tableSet: "scene-recipe.table-set",
  well: "scene-recipe.well",
  pier: "scene-recipe.pier",
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

const M = BUILTIN_ASSET_IDS.material;
const C = BUILTIN_PRIMITIVE_CREATION_IDS;

/**
 * Shorthands for the parts a recipe is written from.
 *
 * Thirty sets written out longhand would be thousands of lines in which a
 * wrong axis is invisible. Named helpers keep each set short enough to read as
 * a description of the object.
 */
function shape(
  creationId: string,
  name: string,
  materialAssetId: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
): SceneRecipePart {
  return {
    kind: "primitive",
    name,
    creationId,
    materialAssetId,
    position,
    rotation,
    scale,
  };
}

const box = (
  name: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
) => shape(C.box, name, material, position, scale, rotation);

const cyl = (
  name: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
) => shape(C.cylinder, name, material, position, scale, rotation);

const ball = (
  name: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
) => shape(C.sphere, name, material, position, scale, rotation);

const cone = (
  name: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
) => shape(C.cone, name, material, position, scale, rotation);

function lamp(
  name: string,
  position: Vec3,
  color: string,
  intensity: number,
  distance: number,
): SceneRecipePart {
  return {
    kind: "light",
    name,
    position,
    light: {
      lightType: "point",
      color,
      intensity,
      distance,
      decay: 2,
      castShadow: false,
    },
  };
}

function emit(
  name: string,
  presetId: string,
  position: Vec3,
  overrides?: ParticlePropertiesPatch,
): SceneRecipePart {
  return { kind: "particle", name, presetId, position, ...(overrides ? { overrides } : {}) };
}

/** Evenly spaced posts or trunks, each nudged so a row is not a fence of clones. */
function scatterColumns(
  count: number,
  material: string,
  namePrefix: string,
  radius: number,
  height: number,
  thickness: number,
): SceneRecipePart[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + index * 0.7;
    const wobble = ((index * 53) % 13) / 13 - 0.5;
    const tall = height * (1 + wobble * 0.3);
    return cyl(
      `${namePrefix} ${index + 1}`,
      material,
      [
        roundTo(Math.cos(angle) * radius * (0.6 + Math.abs(wobble))),
        roundTo(tall / 2),
        roundTo(Math.sin(angle) * radius * (0.6 + Math.abs(wobble))),
      ],
      [thickness, roundTo(tall), thickness],
      [roundTo(wobble * 0.06), 0, roundTo(wobble * 0.05)],
    );
  });
}

const CAMPFIRE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.campfire,
  name: "焚き火",
  description: "炎、煙、暖色のライト、石の輪をひとまとめに置きます。",
  category: "light",
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
  category: "light",
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
  category: "light",
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
  category: "water",
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
  category: "nature",
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
  category: "furniture",
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
  category: "light",
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


const STONE_LANTERN: SceneRecipe = {
  id: SCENE_RECIPE_IDS.stoneLantern,
  name: "石灯籠",
  description: "基礎、竿、火袋、笠を積んだ石の灯り。",
  category: "light",
  projectKinds: ["world", "item"],
  note: "火袋の光はBloomが有効なときに強く見えます。無効でもライトは点きます。",
  parts: [
    cyl("基礎", M.slate, [0, 0.08, 0], [0.28, 0.16, 0.28]),
    cyl("竿", M.slate, [0, 0.5, 0], [0.1, 0.7, 0.1]),
    box("中台", M.slate, [0, 0.9, 0], [0.34, 0.1, 0.34]),
    // Four corner posts rather than a solid box: a lantern whose light is
    // sealed inside a block is a block.
    box("火袋の柱 1", M.slate, [0.12, 1.1, 0.12], [0.04, 0.32, 0.04]),
    box("火袋の柱 2", M.slate, [-0.12, 1.1, 0.12], [0.04, 0.32, 0.04]),
    box("火袋の柱 3", M.slate, [0.12, 1.1, -0.12], [0.04, 0.32, 0.04]),
    box("火袋の柱 4", M.slate, [-0.12, 1.1, -0.12], [0.04, 0.32, 0.04]),
    ball("灯り玉", M.glow, [0, 1.1, 0], [0.09, 0.09, 0.09]),
    cone("笠", M.slate, [0, 1.38, 0], [0.36, 0.22, 0.36]),
    lamp("灯り", [0, 1.1, 0], "#ffd9a0", 1.4, 6),
  ],
};

const BRAZIER: SceneRecipe = {
  id: SCENE_RECIPE_IDS.brazier,
  name: "かがり火",
  description: "三脚の鉢で燃える火。焚き火より高い位置を照らします。",
  category: "light",
  projectKinds: ["world", "item"],
  note: "音は含みません。鉢と脚にColliderは入っていないので、通り抜けを止めるなら追加してください。",
  parts: [
    cyl("脚 1", M.charcoal, [0.2, 0.3, 0], [0.045, 0.6, 0.045]),
    cyl("脚 2", M.charcoal, [-0.1, 0.3, 0.173], [0.045, 0.6, 0.045]),
    cyl("脚 3", M.charcoal, [-0.1, 0.3, -0.173], [0.045, 0.6, 0.045]),
    cyl("鉢", M.charcoal, [0, 0.66, 0], [0.34, 0.14, 0.34]),
    emit("炎", "fire", [0, 0.76, 0], {
      maxParticles: 220,
      startSize: { min: 0.1, max: 0.24 },
      emission: { rateOverTime: 36, bursts: [] },
      shape: { type: "cone", radius: 0.2, angle: 14 },
    }),
    emit("煙", "smoke", [0, 1.1, 0], {
      maxParticles: 70,
      startSize: { min: 0.16, max: 0.34 },
      emission: { rateOverTime: 5, bursts: [] },
      shape: { type: "cone", radius: 0.14, angle: 16 },
    }),
    lamp("灯り", [0, 0.9, 0], "#ff9b4d", 2, 7),
  ],
};

const CANDELABRA: SceneRecipe = {
  id: SCENE_RECIPE_IDS.candelabra,
  name: "燭台",
  description: "3本のろうそくと小さな炎。机の上に置く大きさです。",
  category: "light",
  projectKinds: ["world", "item"],
  note: "机に置く場合は、Transformで机の高さまで上げてください。原点は台の底です。",
  parts: [
    cyl("台", M.charcoal, [0, 0.025, 0], [0.14, 0.05, 0.14]),
    cyl("軸", M.charcoal, [0, 0.18, 0], [0.025, 0.26, 0.025]),
    box("腕", M.charcoal, [0, 0.3, 0], [0.3, 0.03, 0.03]),
    cyl("ろうそく 1", M.white, [-0.13, 0.4, 0], [0.022, 0.16, 0.022]),
    cyl("ろうそく 2", M.white, [0, 0.44, 0], [0.022, 0.2, 0.022]),
    cyl("ろうそく 3", M.white, [0.13, 0.4, 0], [0.022, 0.16, 0.022]),
    emit("炎", "fire", [0, 0.55, 0], {
      maxParticles: 60,
      startSize: { min: 0.03, max: 0.07 },
      startLifetime: { min: 0.3, max: 0.6 },
      emission: { rateOverTime: 18, bursts: [] },
      shape: { type: "box", size: [0.28, 0.02, 0.02] },
    }),
    lamp("灯り", [0, 0.58, 0], "#ffcf8a", 0.7, 3),
  ],
};

const TREE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.tree,
  name: "木",
  description: "幹と3つの葉のかたまりでできた3.5mの木。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "森にするときはこのセットを複製し、Transformで大きさと向きを変えてください。同じ木が並ぶと不自然に見えます。",
  parts: [
    cyl("幹", M.wood, [0, 1.1, 0], [0.16, 2.2, 0.16]),
    ball("葉 1", M.green, [0, 2.5, 0], [1.1, 0.85, 1.1]),
    ball("葉 2", M.green, [0.45, 2.05, 0.3], [0.72, 0.6, 0.72]),
    ball("葉 3", M.green, [-0.4, 2.15, -0.25], [0.66, 0.55, 0.66]),
  ],
};

const BAMBOO: SceneRecipe = {
  id: SCENE_RECIPE_IDS.bamboo,
  name: "竹林",
  description: "高さの違う竹が7本。狭い場所の目隠しにも使えます。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "Colliderは入っていません。通り抜けさせたくない場合は幹ごとに追加してください。",
  parts: scatterColumns(7, M.green, "竹", 1.1, 3.6, 0.05),
};

const ROCKS: SceneRecipe = {
  id: SCENE_RECIPE_IDS.rocks,
  name: "岩場",
  description: "大きさの違う岩が6つ。地形の切れ目を隠すのに向きます。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "地面へめり込ませる前提の配置です。Transformで少し沈めると据わりが良くなります。",
  parts: [
    box("岩 1", M.slate, [0, 0.34, 0], [0.9, 0.68, 0.8], [0.06, 0.4, 0.04]),
    box("岩 2", M.slate, [0.75, 0.22, 0.4], [0.6, 0.44, 0.55], [0, -0.7, 0.05]),
    ball("岩 3", M.slate, [-0.6, 0.24, 0.35], [0.5, 0.36, 0.46]),
    box("岩 4", M.slate, [-0.35, 0.16, -0.7], [0.44, 0.32, 0.4], [0.04, 1.1, 0]),
    ball("岩 5", M.slate, [0.5, 0.14, -0.6], [0.34, 0.26, 0.32]),
    box("岩 6", M.slate, [1.1, 0.1, -0.15], [0.3, 0.2, 0.28], [0, 0.5, 0.06]),
  ],
};

const STUMP: SceneRecipe = {
  id: SCENE_RECIPE_IDS.stump,
  name: "切り株",
  description: "年輪の見える切り株と、根元のきのこ。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "座れる機能は付いていません。見た目の小物として置けます。",
  parts: [
    cyl("切り株", M.wood, [0, 0.2, 0], [0.42, 0.4, 0.42]),
    cyl("年輪", M.sand, [0, 0.405, 0], [0.38, 0.02, 0.38]),
    ball("きのこ 1", M.white, [0.34, 0.06, 0.2], [0.07, 0.06, 0.07]),
    ball("きのこ 2", M.white, [0.42, 0.05, 0.02], [0.05, 0.045, 0.05]),
  ],
};

const FIREWOOD: SceneRecipe = {
  id: SCENE_RECIPE_IDS.firewood,
  name: "薪の山",
  description: "横に寝かせた薪を積んだ小山。焚き火の隣に。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "薪は寝かせた円柱です。向きを変えるときは親のTransformを回すと束のまま動きます。",
  parts: [
    cyl("薪 1", M.wood, [-0.16, 0.09, 0.02], [0.09, 0.9, 0.09], [0, 0, Math.PI / 2]),
    cyl("薪 2", M.wood, [0.16, 0.09, -0.04], [0.09, 0.86, 0.09], [0, 0, Math.PI / 2]),
    cyl("薪 3", M.wood, [-0.02, 0.09, 0.24], [0.085, 0.8, 0.085], [0.05, 0, Math.PI / 2]),
    cyl("薪 4", M.wood, [0, 0.26, 0.06], [0.09, 0.88, 0.09], [0, 0, Math.PI / 2]),
    cyl("薪 5", M.wood, [-0.02, 0.42, 0.02], [0.085, 0.76, 0.085], [-0.04, 0, Math.PI / 2]),
  ],
};

const SNOWMAN: SceneRecipe = {
  id: SCENE_RECIPE_IDS.snowman,
  name: "雪だるま",
  description: "雪玉2つに目と鼻。冬の広場の目印に。",
  category: "effect",
  projectKinds: ["world", "item"],
  note: "顔は前(+Z)を向いています。向きを変えるときは親のTransformを回してください。",
  parts: [
    ball("下の雪玉", M.white, [0, 0.42, 0], [0.84, 0.84, 0.84]),
    ball("上の雪玉", M.white, [0, 1.05, 0], [0.56, 0.56, 0.56]),
    ball("目 1", M.charcoal, [-0.11, 1.14, 0.24], [0.05, 0.05, 0.05]),
    ball("目 2", M.charcoal, [0.11, 1.14, 0.24], [0.05, 0.05, 0.05]),
    cone("鼻", M.orange, [0, 1.04, 0.3], [0.05, 0.2, 0.05], [Math.PI / 2, 0, 0]),
  ],
};

const HOT_SPRING: SceneRecipe = {
  id: SCENE_RECIPE_IDS.hotSpring,
  name: "露天風呂",
  description: "石で囲った湯船と、立ちのぼる湯気。",
  category: "water",
  projectKinds: ["world", "item"],
  note: "湯は青いMaterialの面です。波を立てるには、外部リソースのWater Shaderを湯のMaterialへ割り当ててください。",
  parts: [
    ...stoneRing(10, 1.25, [0.34, 0.26, 0.3]),
    cyl("湯", M.blue, [0, 0.12, 0], [1.1, 0.22, 1.1]),
    emit("湯気", "steam", [0, 0.3, 0], {
      maxParticles: 140,
      emission: { rateOverTime: 16, bursts: [] },
      shape: { type: "box", size: [1.6, 0.05, 1.6] },
    }),
  ],
};

const SNOWFALL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.snowfall,
  name: "雪を降らせる",
  description: "上空から広い範囲へ静かに降る雪。",
  category: "weather",
  projectKinds: ["world", "item"],
  note: "降る範囲はParticleのShapeで決まります。広げるにはAsset Inspectorで箱の大きさを変えてください。ワールド全体に降らせるには複数置きます。",
  parts: [emit("雪", "snow", [0, 3, 0])],
};

const RAINFALL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.rainfall,
  name: "雨を降らせる",
  description: "上空からまっすぐ落ちる雨。",
  category: "weather",
  projectKinds: ["world", "item"],
  note: "降る範囲はParticleのShapeで決まります。地面で跳ねる表現は含みません。",
  parts: [emit("雨", "rain", [0, 3.5, 0])],
};

const PETALFALL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.petalfall,
  name: "桜吹雪",
  description: "風に流されながら舞い落ちる花びら。",
  category: "weather",
  projectKinds: ["world", "item"],
  note: "花びらは木から出ているわけではありません。木の上へ置くと自然に見えます。",
  parts: [emit("花びら", "sakura", [0, 3, 0])],
};

const GROUND_FOG: SceneRecipe = {
  id: SCENE_RECIPE_IDS.groundFog,
  name: "立ちこめる霧",
  description: "地面すれすれをゆっくり漂う霧。",
  category: "weather",
  projectKinds: ["world", "item"],
  note: "Scene設定のフォグとは別物です。こちらは置いた場所だけに溜まります。両方使うと濃くなりすぎることがあります。",
  parts: [
    emit("霧", "smoke", [0, 0.35, 0], {
      maxParticles: 120,
      startSize: { min: 1.2, max: 2.6 },
      startSpeed: { min: 0.02, max: 0.08 },
      startLifetime: { min: 6, max: 11 },
      gravity: [0, 0.01, 0],
      emission: { rateOverTime: 5, bursts: [] },
      shape: { type: "box", size: [6, 0.1, 6] },
      colorOverLifetime: {
        start: [0.8, 0.83, 0.88, 0.16],
        end: [0.7, 0.74, 0.8, 0],
      },
      sizeOverLifetime: { min: 1, max: 1.5 },
    }),
  ],
};

const MAGIC_CIRCLE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.magicCircle,
  name: "魔法陣",
  description: "床に描いた円と、そこから立ちのぼる光の粒。",
  category: "effect",
  projectKinds: ["world", "item"],
  note: "床の模様はMaterialの色だけです。文様を入れるにはTextureを割り当ててください。",
  parts: [
    cyl("陣", M.violet, [0, 0.015, 0], [1.5, 0.03, 1.5]),
    cyl("内円", M.glow, [0, 0.035, 0], [0.9, 0.02, 0.9]),
    emit("光の粒", "magic", [0, 0.5, 0], {
      shape: { type: "sphere", radius: 0.75 },
    }),
    lamp("灯り", [0, 0.6, 0], "#a78bfa", 1.6, 6),
  ],
};

const WARP_PILLAR: SceneRecipe = {
  id: SCENE_RECIPE_IDS.warpPillar,
  name: "ワープの柱",
  description: "光の柱と昇っていく粒。移動先の目印に。",
  category: "effect",
  projectKinds: ["world", "item"],
  note: "見た目だけのセットです。実際に移動させるには、XRift公式ComponentのPortalを重ねて置いてください。",
  parts: [
    cyl("台", M.charcoal, [0, 0.08, 0], [0.62, 0.16, 0.62]),
    cyl("柱", M.glow, [0, 1.5, 0], [0.3, 3, 0.3]),
    emit("粒", "magic", [0, 1.4, 0], {
      shape: { type: "cone", radius: 0.3, angle: 6 },
      startLifetime: { min: 1.6, max: 2.6 },
      velocityOverLifetime: { linear: [0, 1.2, 0], orbital: [0, 1.6, 0] },
    }),
    lamp("灯り", [0, 1.6, 0], "#7dd3fc", 2.2, 8),
  ],
};

const COLUMN: SceneRecipe = {
  id: SCENE_RECIPE_IDS.column,
  name: "石柱",
  description: "基礎、柱身、柱頭でできた3.2mの柱。",
  category: "structure",
  projectKinds: ["world", "item"],
  note: "Colliderは入っていません。ぶつかるようにするには柱身へBox Colliderを追加してください。",
  parts: [
    box("基礎", M.slate, [0, 0.09, 0], [0.62, 0.18, 0.62]),
    cyl("柱身", M.white, [0, 1.6, 0], [0.22, 2.8, 0.22]),
    box("柱頭", M.slate, [0, 3.08, 0], [0.56, 0.16, 0.56]),
  ],
};

const ARCH_GATE: SceneRecipe = {
  id: SCENE_RECIPE_IDS.archGate,
  name: "アーチ門",
  description: "2本の柱と梁。くぐれる幅で置いています。",
  category: "structure",
  projectKinds: ["world", "item"],
  note: "内側の幅は約2.2mです。くぐれるようにするには、柱にだけColliderを足してください。",
  parts: [
    box("左基礎", M.slate, [-1.2, 0.08, 0], [0.52, 0.16, 0.52]),
    box("右基礎", M.slate, [1.2, 0.08, 0], [0.52, 0.16, 0.52]),
    cyl("左柱", M.white, [-1.2, 1.5, 0], [0.2, 2.8, 0.2]),
    cyl("右柱", M.white, [1.2, 1.5, 0], [0.2, 2.8, 0.2]),
    box("梁", M.slate, [0, 3.05, 0], [2.9, 0.3, 0.42]),
  ],
};

const STAIRS: SceneRecipe = {
  id: SCENE_RECIPE_IDS.stairs,
  name: "階段",
  description: "5段の階段。1段18cmで上れる高さです。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。上れるようにするには段ごとにBox Colliderを追加してください。",
  parts: [
    box("段 1", M.slate, [0, 0.09, 0], [1.6, 0.18, 0.4]),
    box("段 2", M.slate, [0, 0.27, -0.4], [1.6, 0.18, 0.4]),
    box("段 3", M.slate, [0, 0.45, -0.8], [1.6, 0.18, 0.4]),
    box("段 4", M.slate, [0, 0.63, -1.2], [1.6, 0.18, 0.4]),
    box("段 5", M.slate, [0, 0.81, -1.6], [1.6, 0.18, 0.4]),
  ],
};

const WALL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.wall,
  name: "塀",
  description: "柱で区切った5mの塀。並べて敷地を囲えます。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。通り抜けを止めるには塀の面へBox Colliderを追加してください。",
  parts: [
    box("塀 1", M.slate, [-1.3, 0.9, 0], [2.3, 1.8, 0.2]),
    box("塀 2", M.slate, [1.3, 0.9, 0], [2.3, 1.8, 0.2]),
    box("柱 1", M.charcoal, [-2.5, 1, 0], [0.3, 2, 0.3]),
    box("柱 2", M.charcoal, [0, 1, 0], [0.3, 2, 0.3]),
    box("柱 3", M.charcoal, [2.5, 1, 0], [0.3, 2, 0.3]),
  ],
};

const TABLE_SET: SceneRecipe = {
  id: SCENE_RECIPE_IDS.tableSet,
  name: "テーブルと椅子",
  description: "4本脚のテーブルと丸椅子2脚。",
  category: "furniture",
  projectKinds: ["world", "item"],
  note: "座る機能は付いていません。物を置くならテーブル天板の高さは0.74mです。",
  parts: [
    box("天板", M.wood, [0, 0.74, 0], [1.4, 0.06, 0.8]),
    box("脚 1", M.wood, [-0.62, 0.36, -0.32], [0.08, 0.72, 0.08]),
    box("脚 2", M.wood, [0.62, 0.36, -0.32], [0.08, 0.72, 0.08]),
    box("脚 3", M.wood, [-0.62, 0.36, 0.32], [0.08, 0.72, 0.08]),
    box("脚 4", M.wood, [0.62, 0.36, 0.32], [0.08, 0.72, 0.08]),
    cyl("椅子 1 座面", M.wood, [0, 0.44, 0.85], [0.2, 0.06, 0.2]),
    cyl("椅子 1 脚", M.wood, [0, 0.21, 0.85], [0.06, 0.42, 0.06]),
    cyl("椅子 2 座面", M.wood, [0, 0.44, -0.85], [0.2, 0.06, 0.2]),
    cyl("椅子 2 脚", M.wood, [0, 0.21, -0.85], [0.06, 0.42, 0.06]),
  ],
};

const WELL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.well,
  name: "井戸",
  description: "石囲いと屋根、水面まで。広場の中心に。",
  category: "structure",
  projectKinds: ["world", "item"],
  note: "水は青いMaterialの面です。落ちないようにするなら石囲いへColliderを追加してください。",
  parts: [
    ...stoneRing(10, 0.62, [0.24, 0.4, 0.2]),
    cyl("水", M.blue, [0, 0.06, 0], [0.5, 0.1, 0.5]),
    box("柱 1", M.wood, [-0.6, 0.9, 0], [0.09, 1.8, 0.09]),
    box("柱 2", M.wood, [0.6, 0.9, 0], [0.09, 1.8, 0.09]),
    cyl("巻き上げ棒", M.wood, [0, 1.6, 0], [0.05, 1.2, 0.05], [0, 0, Math.PI / 2]),
    box("屋根", M.wood, [0, 1.86, 0], [1.5, 0.1, 0.9]),
  ],
};

const PIER: SceneRecipe = {
  id: SCENE_RECIPE_IDS.pier,
  name: "桟橋",
  description: "水面へ張り出す板と杭。水辺の入口に。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。上を歩けるようにするには板へBox Colliderを追加してください。",
  parts: [
    box("板 1", M.wood, [0, 0.5, 0], [1.4, 0.06, 0.44]),
    box("板 2", M.wood, [0, 0.5, -0.5], [1.4, 0.06, 0.44]),
    box("板 3", M.wood, [0, 0.5, -1], [1.4, 0.06, 0.44]),
    box("板 4", M.wood, [0, 0.5, -1.5], [1.4, 0.06, 0.44]),
    box("板 5", M.wood, [0, 0.5, -2], [1.4, 0.06, 0.44]),
    cyl("杭 1", M.wood, [-0.6, 0.25, -0.05], [0.07, 0.5, 0.07]),
    cyl("杭 2", M.wood, [0.6, 0.25, -0.05], [0.07, 0.5, 0.07]),
    cyl("杭 3", M.wood, [-0.6, 0.25, -1.95], [0.07, 0.5, 0.07]),
    cyl("杭 4", M.wood, [0.6, 0.25, -1.95], [0.07, 0.5, 0.07]),
  ],
};

export const SCENE_RECIPES: readonly SceneRecipe[] = [
  CAMPFIRE,
  TORCH,
  BRAZIER,
  LANTERNS,
  STREET_LIGHT,
  STONE_LANTERN,
  CANDELABRA,
  TREE,
  BAMBOO,
  ROCKS,
  STUMP,
  FIREWOOD,
  FIREFLY_BUSH,
  SNOWFALL,
  RAINFALL,
  PETALFALL,
  GROUND_FOG,
  FOUNTAIN,
  HOT_SPRING,
  COLUMN,
  ARCH_GATE,
  STAIRS,
  WALL,
  WELL,
  PIER,
  BENCH,
  TABLE_SET,
  MAGIC_CIRCLE,
  WARP_PILLAR,
  SNOWMAN,
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
