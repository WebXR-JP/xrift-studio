import { ensureBuiltinModelAsset, ensureBuiltinRecipeAudioAsset } from "./asset-import-persistence";
import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import { getBuiltinRecipeAudio } from "./builtin-recipe-audio";
import { getBuiltinRecipeModel } from "./builtin-recipe-models";
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
  createAudioSourceComponent,
  createMeshComponent,
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
      /**
       * A bundled GLB (BUILTIN_RECIPE_MODELS), self-contained materials and
       * all -- unlike "primitive", no materialAssetId to bind.
       */
      kind: "model";
      name: string;
      modelId: string;
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
      /**
       * A bundled ambience MP3 (BUILTIN_RECIPE_AUDIO) placed as an Audio
       * Source. `spatial` decides positional falloff versus global playback;
       * autoplay follows the same rule as createAudioSourceComponent.
       */
      kind: "audio";
      name: string;
      audioId: string;
      position: Vec3;
      spatial: boolean;
      volume: number;
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
  door: "scene-recipe.door",
  window: "scene-recipe.window",
  floorPanel: "scene-recipe.floor-panel",
  wallPanel: "scene-recipe.wall-panel",
  summerCicadas: "scene-recipe.summer-cicadas",
  summerRiver: "scene-recipe.summer-river",
  summerNight: "scene-recipe.summer-night",
} as const;

/**
 * Blocks placed evenly around a circle, each turned and sized a little
 * differently.
 *
 * A ring of identical boxes at identical angles reads as a machine part. The
 * variation is what makes eight blocks read as stones, so it is computed from
 * the index rather than left to the caller to type out.
 */
/** Authored diameter (meters, scale 1) of each hand-modeled rock GLB, so a
 * caller's box-sized `size` param still maps to a real-world size. */
const ROCK_MODEL_DIAMETER: Record<string, number> = { rockA: 0.84, rockB: 0.72 };
const ROCK_MODEL_IDS = Object.keys(ROCK_MODEL_DIAMETER);

function stoneRing(
  count: number,
  radius: number,
  size: readonly [number, number, number],
): SceneRecipePart[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const wobble = ((index * 37) % 11) / 11 - 0.5;
    const height = size[1] * (1 + wobble * 0.35);
    const modelId = ROCK_MODEL_IDS[index % ROCK_MODEL_IDS.length];
    const base = ROCK_MODEL_DIAMETER[modelId];
    return {
      kind: "model" as const,
      name: `石 ${index + 1}`,
      modelId,
      position: [
        roundTo(Math.cos(angle) * radius),
        0,
        roundTo(Math.sin(angle) * radius),
      ] as Vec3,
      rotation: [0, roundTo(angle + wobble * 2), 0] as Vec3,
      scale: [
        roundTo((size[0] * (1 + wobble * 0.3)) / base),
        roundTo(height / base),
        roundTo((size[2] * (1 - wobble * 0.25)) / base),
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

/** A firewood log, authored lying along +X from its own end -- `rotationY`
 * turns it to face a little differently so a pile does not read as clones. */
const logPart = (
  name: string,
  position: Vec3,
  rotationY: number,
  scale: Vec3,
): SceneRecipePart => ({
  kind: "model",
  name,
  modelId: "log",
  position,
  rotation: [0, rotationY, 0],
  scale,
});

const rockPart = (
  name: string,
  modelId: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = [0, 0, 0],
): SceneRecipePart => ({ kind: "model", name, modelId, position, rotation, scale });

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

/** Evenly spaced bamboo culms, each nudged so a row is not a fence of clones.
 * `height` is the reference height the bambooStalk GLB was modeled at. */
function scatterBamboo(
  count: number,
  namePrefix: string,
  radius: number,
  height: number,
): SceneRecipePart[] {
  const modelHeight = 3.2;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + index * 0.7;
    const wobble = ((index * 53) % 13) / 13 - 0.5;
    const tall = (height * (1 + wobble * 0.3)) / modelHeight;
    return {
      kind: "model" as const,
      name: `${namePrefix} ${index + 1}`,
      modelId: "bambooStalk",
      position: [
        roundTo(Math.cos(angle) * radius * (0.6 + Math.abs(wobble))),
        0,
        roundTo(Math.sin(angle) * radius * (0.6 + Math.abs(wobble))),
      ] as Vec3,
      rotation: [roundTo(wobble * 0.06), roundTo(angle), roundTo(wobble * 0.05)] as Vec3,
      scale: [roundTo(tall), roundTo(tall), roundTo(tall)] as Vec3,
    };
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
      kind: "model",
      name: "支柱と笠",
      modelId: "streetLight",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
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
      kind: "model",
      name: "柄",
      modelId: "torch",
      position: [0, 0.6, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
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
      kind: "model",
      name: "茂み",
      modelId: "bush",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
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
  description: "木の座面と背もたれ、脚を渡す貫木を持つ1.6mの公園ベンチ。",
  category: "furniture",
  projectKinds: ["world", "item"],
  note: "座る機能は付いていません。見た目の家具として置けます。人が上を歩けないようにするならColliderを追加してください。",
  parts: [
    {
      kind: "model",
      name: "ベンチ本体",
      modelId: "bench",
      position: [0, 0.44, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
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
    ...[-0.9, 0, 0.9].map(
      (x, index) =>
        ({
          kind: "model",
          name: `提灯 ${index + 1}`,
          modelId: "lantern",
          position: [x, 1.9, 0] as Vec3,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }) satisfies SceneRecipePart,
    ),
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
    {
      kind: "model",
      name: "本体",
      modelId: "stoneLantern",
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "鉢と脚",
      modelId: "brazier",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1.6, 1, 1.6],
    },
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
    {
      kind: "model",
      name: "台と燭",
      modelId: "candelabra",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
  description: "幹と根元の張り、重なる3つの葉のかたまりでできた3.5mの木。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "森にするときはこのセットを複製し、Transformで大きさと向きを変えてください。同じ木が並ぶと不自然に見えます。",
  parts: [
    {
      kind: "model",
      name: "本体",
      modelId: "tree",
      position: [0, 0.86, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const BAMBOO: SceneRecipe = {
  id: SCENE_RECIPE_IDS.bamboo,
  name: "竹林",
  description: "高さの違う竹が7本。狭い場所の目隠しにも使えます。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "Colliderは入っていません。通り抜けさせたくない場合は幹ごとに追加してください。",
  parts: scatterBamboo(7, "竹", 1.1, 3.6),
};

const ROCKS: SceneRecipe = {
  id: SCENE_RECIPE_IDS.rocks,
  name: "岩場",
  description: "大きさの違う岩が6つ。地形の切れ目を隠すのに向きます。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "地面へめり込ませる前提の配置です。Transformで少し沈めると据わりが良くなります。",
  parts: [
    rockPart("岩 1", "rockA", [0, 0, 0], [1.071, 0.81, 0.952], [0.06, 0.4, 0.04]),
    rockPart("岩 2", "rockB", [0.75, 0, 0.4], [0.833, 0.611, 0.764], [0, -0.7, 0.05]),
    rockPart("岩 3", "rockA", [-0.6, 0, 0.35], [0.595, 0.429, 0.548], [0, 0, 0]),
    rockPart("岩 4", "rockB", [-0.35, 0, -0.7], [0.611, 0.444, 0.556], [0.04, 1.1, 0]),
    rockPart("岩 5", "rockA", [0.5, 0, -0.6], [0.405, 0.31, 0.381], [0, 0, 0]),
    rockPart("岩 6", "rockB", [1.1, 0, -0.15], [0.417, 0.278, 0.389], [0, 0.5, 0.06]),
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
    {
      kind: "model",
      name: "切り株",
      modelId: "stump",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const FIREWOOD: SceneRecipe = {
  id: SCENE_RECIPE_IDS.firewood,
  name: "薪の山",
  description: "横に寝かせた薪を積んだ小山。焚き火の隣に。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "薪はモデルパーツです。向きを変えるときは親のTransformを回すと束のまま動きます。",
  parts: [
    logPart("薪 1", [-0.42, 0, 0.16], 0.05, [1, 1, 1]),
    logPart("薪 2", [-0.4, 0, -0.1], -0.08, [0.95, 0.95, 0.95]),
    logPart("薪 3", [-0.38, 0, 0.42], 0.15, [0.85, 0.9, 0.9]),
    logPart("薪 4", [-0.4, 0.09, 0.03], 0.02, [0.97, 0.95, 0.95]),
    logPart("薪 5", [-0.38, 0.17, 0.1], -0.05, [0.8, 0.85, 0.85]),
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
    {
      kind: "model",
      name: "雪だるま",
      modelId: "snowman",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
    },
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
    {
      kind: "model",
      name: "陣",
      modelId: "magicCircle",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
    },
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
    {
      kind: "model",
      name: "台と柱",
      modelId: "warpPillar",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1.8, 1, 1.8],
    },
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
    {
      kind: "model",
      name: "柱",
      modelId: "pillar",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "左柱",
      modelId: "pillar",
      position: [-1.2, 0, 0],
      rotation: [0, 0, 0],
      scale: [0.93, 0.93, 0.93],
    },
    {
      kind: "model",
      name: "右柱",
      modelId: "pillar",
      position: [1.2, 0, 0],
      rotation: [0, 0, 0],
      scale: [0.93, 0.93, 0.93],
    },
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
    {
      kind: "model",
      name: "階段",
      modelId: "stairs",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "塀",
      modelId: "wall",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "テーブル",
      modelId: "table",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    {
      kind: "model",
      name: "椅子 1",
      modelId: "stool",
      position: [0, 0, 0.85],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    {
      kind: "model",
      name: "椅子 2",
      modelId: "stool",
      position: [0, 0, -0.85],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "柱と屋根",
      modelId: "wellFrame",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
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
    {
      kind: "model",
      name: "桟橋",
      modelId: "pier",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const DOOR: SceneRecipe = {
  id: SCENE_RECIPE_IDS.door,
  name: "ドア",
  description: "枠とノブ付きのドア。幅0.9m、壁の開口部に置きます。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。通り抜けを止めるにはドアへBox Colliderを追加してください。開閉はできない見た目だけのドアです。",
  parts: [
    {
      kind: "model",
      name: "ドア",
      modelId: "door",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const WINDOW: SceneRecipe = {
  id: SCENE_RECIPE_IDS.window,
  name: "窓",
  description: "木枠とガラス、水切りのある窓。幅0.9m、壁にはめ込んで使います。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。ガラスは見た目だけで、開閉はできません。",
  parts: [
    {
      kind: "model",
      name: "窓",
      modelId: "window",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const FLOOR_PANEL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.floorPanel,
  name: "床パネル",
  description: "2m四方の床板タイル。並べて部屋の床に敷けます。",
  category: "structure",
  projectKinds: ["world"],
  note: "原点は歩ける面（上面）です。板の厚みぶんだけ下に沈むので、既存の地面と同じ高さに置くと段差なく馴染みます。隣に並べるときは2mぶんずらしてください。",
  parts: [
    {
      kind: "model",
      name: "床パネル",
      modelId: "floorPanel",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

const WALL_PANEL: SceneRecipe = {
  id: SCENE_RECIPE_IDS.wallPanel,
  name: "壁パネル",
  description: "幅2m・高さ2.4mの壁パネル。幅木付き。並べて部屋の壁を組めます。",
  category: "structure",
  projectKinds: ["world"],
  note: "Colliderは入っていません。通り抜けを止めるには壁へBox Colliderを追加してください。並べるときは幅2mぶん横にずらすと隙間なく続きます。",
  parts: [
    {
      kind: "model",
      name: "壁パネル",
      modelId: "wallPanel",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

/**
 * 環境音セット。空間音源（spatial）は置いた位置から距離減衰し、Global
 * （spatial: false）はワールド全体に一定音量で流れる。いずれも Play 開始時に
 * 自動再生を試み、ブラウザがブロックした場合は視聴者の最初の操作で鳴る。
 */
const SUMMER_CICADAS: SceneRecipe = {
  id: SCENE_RECIPE_IDS.summerCicadas,
  name: "セミの声（夏）",
  description: "夏の昼下がりのセミの声。ワールド全体にゆるくかかる環境音です。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "Play開始時に自動再生します。音量はAudio Sourceのvolumeで調整できます。再生・停止を切り替えるには、Audio SourceコントローラーのScriptを同じEntityへ追加してください。",
  parts: [
    {
      kind: "audio",
      name: "セミの声",
      audioId: "summerCicadas",
      position: [0, 0, 0],
      spatial: false,
      volume: 0.4,
    },
  ],
};

const SUMMER_RIVER: SceneRecipe = {
  id: SCENE_RECIPE_IDS.summerRiver,
  name: "川のせせらぎ（夏）",
  description: "流れる水の音。置いた場所に近づくほど大きく聞こえる空間音源です。",
  category: "water",
  projectKinds: ["world", "item"],
  note: "近づくと大きくなる空間音源です。聞こえはじめる距離はAudio SourceのrefDistance、減衰の強さはrolloffFactorで調整できます。",
  parts: [
    {
      kind: "audio",
      name: "川のせせらぎ",
      audioId: "summerRiver",
      position: [0, 0, 0],
      spatial: true,
      volume: 0.9,
    },
  ],
};

const SUMMER_NIGHT: SceneRecipe = {
  id: SCENE_RECIPE_IDS.summerNight,
  name: "夜の虫の声（夏）",
  description: "静かな夏の夜のコオロギなどの虫の声。ワールド全体に流れる環境音です。",
  category: "nature",
  projectKinds: ["world", "item"],
  note: "Play開始時に自動再生します。夜のワールド向け。音量はAudio Sourceのvolumeで調整できます。",
  parts: [
    {
      kind: "audio",
      name: "夜の虫の声",
      audioId: "summerNight",
      position: [0, 0, 0],
      spatial: false,
      volume: 0.35,
    },
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
  DOOR,
  WINDOW,
  FLOOR_PANEL,
  WALL_PANEL,
  BENCH,
  TABLE_SET,
  MAGIC_CIRCLE,
  WARP_PILLAR,
  SNOWMAN,
  SUMMER_CICADAS,
  SUMMER_RIVER,
  SUMMER_NIGHT,
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
export async function instantiateSceneRecipe(
  scene: SceneDocument,
  assets: AssetManifest,
  recipeId: string,
  projectKind: VisualProjectKind,
  projectPath: string,
  position: Vec3 = [0, 0, 0],
): Promise<SceneRecipeInstantiation | null> {
  const recipe = getSceneRecipe(recipeId);
  if (!recipe || !recipe.projectKinds.includes(projectKind)) return null;

  let nextAssets = assets;
  const createdAssetIds: string[] = [];
  const rootEntityId = createDocumentId("entity");
  const children: SceneEntity[] = [];

  for (const part of recipe.parts) {
    const entityId = createDocumentId("entity");
    const hasTransform =
      part.kind === "primitive" || part.kind === "model" || part.kind === "audio";
    const rotation: Vec3 =
      hasTransform && part.kind !== "audio" ? part.rotation : [0, 0, 0];
    const scale: Vec3 =
      hasTransform && part.kind !== "audio" ? part.scale : [1, 1, 1];
    const components: SceneComponent[] = [
      createTransformComponent(
        createDocumentId("component-transform"),
        part.position,
        rotation,
        scale,
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
    } else if (part.kind === "model") {
      const definition = getBuiltinRecipeModel(part.modelId);
      if (!definition) return null;
      const withModel = await ensureBuiltinModelAsset(
        projectPath,
        nextAssets,
        definition,
      );
      if (!withModel || withModel.assets[definition.assetId]?.kind !== "model") {
        return null;
      }
      nextAssets = withModel;
      components.push(
        createMeshComponent(createDocumentId("component-mesh"), definition.assetId, []),
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
    } else if (part.kind === "audio") {
      const definition = getBuiltinRecipeAudio(part.audioId);
      if (!definition) return null;
      const withAudio = await ensureBuiltinRecipeAudioAsset(
        projectPath,
        nextAssets,
        definition,
      );
      if (!withAudio || withAudio.assets[definition.assetId]?.kind !== "audio") {
        return null;
      }
      nextAssets = withAudio;
      createdAssetIds.push(definition.assetId);
      const audioSource = createAudioSourceComponent(
        createDocumentId("component-audio-source"),
        definition.assetId,
        part.spatial,
      );
      if (!audioSource) return null;
      components.push({ ...audioSource, volume: part.volume });
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
