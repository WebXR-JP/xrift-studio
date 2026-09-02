import {
  ensureBuiltinAudioAsset,
  ensureBuiltinModelAsset,
} from "./asset-import-persistence";
import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import { getBuiltinRecipeAudio } from "./builtin-recipe-audio";
import { getBuiltinRecipeModel } from "./builtin-recipe-models";
import {
  createXriftComponent,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "./component-registry";
import { BUILTIN_PRIMITIVE_CREATION_IDS, getBuiltinPrimitiveCreation } from "./creation-catalog";
import { createDocumentId } from "./document-id";
import { tintToLinearRgb } from "./glow-material-catalog";
import { syncInteractionTriggerReferences } from "./interaction-trigger-targets";
import {
  addDefaultInteractivityAsset,
  configureInteractivityTriggerAction,
  createDefaultKhrInteractivityExtension,
  getXriftInteractionProperty,
  setInteractivityTriggerActionDuration,
  setInteractivityTriggerActionText,
  setInteractivityTriggerActionValue,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  XRIFT_INTERACTION_SCENE_ENTITY_ID,
  xriftInteractionEnumIndex,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
  setInteractivityLiteralValue,
} from "./interactivity-recipes";
import {
  addDefaultParticleAsset,
  getParticleAuthoringPreset,
  type ParticlePropertiesPatch,
} from "./particle-system";
import { ensureBuiltinMaterialAsset } from "./prototype-project";
import {
  createAudioSourceComponent,
  createBuiltinPrimitiveMeshComponent,
  createInteractionTriggerComponent,
  createMeshComponent,
  createMeshColliderComponent,
  createParticleEmitterComponent,
  createTextComponent,
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
      /** Makes this part pressable, which is what an `interact` graph needs. */
      interactable?: { label: string };
      audio?: SceneRecipeAudio;
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
      /**
       * Adds a Mesh Collider to this part. Only for models an avatar has to
       * stand on or inside -- a room's own floor and walls are the collision
       * surface, and telling the author to add one by hand would leave them
       * falling through the floor on the first Play.
       */
      collider?: "trimesh";
      interactable?: { label: string };
      audio?: SceneRecipeAudio;
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
      /**
       * Lands switched off, for a set whose whole point is switching it on.
       * The Light Component is still there and still selectable -- `enabled`
       * is exactly what the graph writes.
       */
      startsOff?: boolean;
    }
  | {
      /** A sound with nothing to look at: room tone, a loop under a machine. */
      kind: "audio";
      name: string;
      position: Vec3;
      audio: SceneRecipeAudio;
    }
  | {
      /** A sign. What a set has to say to the person standing in front of it. */
      kind: "text";
      name: string;
      position: Vec3;
      rotation: Vec3;
      text: string;
      fontSize: number;
      color?: string;
      maxWidth?: number;
    };

/** The variants the shorthand builders below return, named so a set can add
 * `interactable` or `audio` to one without the spread widening to the union. */
export type SceneRecipePrimitivePart = Extract<SceneRecipePart, { kind: "primitive" }>;
export type SceneRecipeLightPart = Extract<SceneRecipePart, { kind: "light" }>;

/**
 * An Audio Source on one of the set's parts.
 *
 * `audioId` names a bundled sound (`builtin-recipe-audio.ts`) rather than an
 * Asset the author has to find first: a set that lands with an empty Audio
 * Source teaches nothing, because the first Play is silent and the author has
 * no way to tell an unconfigured source from a broken one.
 */
export type SceneRecipeAudio = {
  audioId: string;
  /** False for a sound a graph starts. True for room tone. */
  autoplay: boolean;
  loop: boolean;
  volume: number;
  /** True places the sound in the world; false is one volume everywhere. */
  spatial: boolean;
  /** Metres the sound stays at full volume. Spatial sources only. */
  refDistance?: number;
  /** Metres past which it is inaudible. Spatial sources only. */
  maxDistance?: number;
};

/** Which Entity one action of a set's graph writes to. */
export type SceneRecipeActionTarget =
  | { scope: "part"; part: string }
  | { scope: "player" }
  | { scope: "scene" };

/**
 * One property write in a set's graph, in the same terms the node editor uses.
 *
 * Declarative rather than a build callback so the same rows can be shown in the
 * shelf before placing (「押すと何が起きるか」) and asserted in the fixture --
 * and so a set can never describe an effect its graph does not produce.
 */
export type SceneRecipeAction = {
  target: SceneRecipeActionTarget;
  targetKind: XriftInteractionTargetKind;
  property: string;
  /**
   * What to write: a bool, a number, an enum option's value, `#rrggbb` for a
   * colour, or three numbers for a position, rotation or scale. Omitted keeps
   * the property's own default, and is required for `mode: "toggle"`.
   */
  value?: boolean | number | string | readonly number[];
  /** Seconds to ramp over. Enum, Asset and string properties ignore it. */
  duration?: number;
  mode?: "set" | "toggle";
  /**
   * Which socket of the previous node continues into this one. `"done"` waits
   * for that node's timed change to finish; `"out"` runs alongside it.
   */
  after?: "out" | "done";
  /** Seconds to wait before this action, as a `flow/setDelay` in between. */
  delay?: number;
};

/**
 * A graph the set brings with it, already pointed at the set's own parts.
 *
 * Wiring one of these by hand is four pickers and a literal per action, and it
 * is the step where an author who has never opened the node editor stops. The
 * set does it once; what lands is an ordinary Interactivity Asset and an
 * ordinary Interaction Trigger, so the next thing the author does is edit it.
 */
export type SceneRecipeBehaviour = {
  /** Part name that carries the Interaction Trigger. */
  host: string;
  graphName: string;
  /** `interact` also adds the official Interactable the trigger needs. */
  start: "interact" | "sceneStart";
  /** Shown on the shelf card, in the author's words. */
  summary: string;
  /** Hover text on the Interactable. Interact-started behaviours only. */
  interactionText?: string;
  actions: readonly SceneRecipeAction[];
};

/**
 * What a set teaches, for the sets that exist to teach something.
 *
 * The tutorial sets are not a separate feature: they are ordinary sets whose
 * contents happen to be a working example of one mechanism. The steps are what
 * turns a placed example into a lesson — where to press, what to open, and
 * which value to change to make it yours.
 */
export type SceneRecipeLesson = {
  /** One line: what the author will be able to do afterwards. */
  goal: string;
  steps: readonly string[];
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
  | "effect"
  | "tutorial";

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
  tutorial: "しかけ・チュートリアル",
};

export type SceneRecipe = {
  id: string;
  name: string;
  description: string;
  category: SceneRecipeCategory;
  projectKinds: readonly VisualProjectKind[];
  /** Said before placing: what the author still has to do themselves. */
  note: string;
  /**
   * Where the catalog card's camera stands, for sets that need one.
   *
   * Framing derived from the parts puts the camera outside the set's bounds.
   * That is right for everything you look at, and wrong for a room you stand
   * inside: from outside, a studio is a closed grey box with a ceiling on top.
   */
  preview?: {
    cameraPosition: Vec3;
    lookAtY: number;
    /**
     * The card's own ground plane. A room brings its own floor, and the two
     * at the same height z-fight.
     */
    ground?: boolean;
  };
  parts: readonly SceneRecipePart[];
  /** Graphs wired to those parts, placed with them. */
  behaviours?: readonly SceneRecipeBehaviour[];
  /** Present on the sets that are also a lesson. */
  lesson?: SceneRecipeLesson;
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
  recordingStudio: "scene-recipe.recording-studio",
  soundButton: "scene-recipe.sound-button",
  lightSwitch: "scene-recipe.light-switch",
  ambientSpeaker: "scene-recipe.ambient-speaker",
  slidingDoor: "scene-recipe.sliding-door",
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
): SceneRecipePrimitivePart {
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
): SceneRecipeLightPart {
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

const RECORDING_STUDIO: SceneRecipe = {
  id: SCENE_RECIPE_IDS.recordingStudio,
  name: "収録スタジオ",
  description:
    "小さな FM ラジオ局の収録ブース。3.6 x 2.8m の一室に机、椅子、マイク、ON AIR サインまで入っています。",
  category: "structure",
  projectKinds: ["world"],
  preview: { cameraPosition: [-1.8, 2.15, 1.42], lookAtY: 0.85, ground: false },
  note: "床と壁を含む一体のModelです。原点は部屋の床の中心なので、既存の地面と同じ高さに置いてください。地面と床が重なるとZ-fightingするので、部屋の下の地面は消すか下げてください。Mesh Colliderが入っているので、そのまま中を歩けます。",
  parts: [
    {
      kind: "model",
      name: "収録スタジオ",
      modelId: "recordingStudio",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collider: "trimesh",
    },
  ],
};

/**
 * The four sets that are also the tutorial.
 *
 * Everything above this line is scenery: an author places it and it looks like
 * something. These four land as working mechanisms — a press that makes a
 * sound, a switch that turns a Light on, room tone that fades with distance, a
 * door that opens and closes itself — because that is the part of Studio that
 * cannot be learned by looking at it. Each carries a `lesson`, and each is
 * built only from Components the Inspector can already edit, so the first
 * change the author makes is to the set they just placed.
 */

const SOUND_BUTTON: SceneRecipe = {
  id: SCENE_RECIPE_IDS.soundButton,
  name: "音の出るボタン",
  description:
    "押すと音が鳴り、ボタンが一瞬光ります。Interactable、Audio Source、Interactivity Graphの3つがどう噛み合うかを、そのまま読める最小の形にしています。",
  category: "tutorial",
  projectKinds: ["world"],
  note: "Playを開始して、ボタンにカーソルを合わせてクリックしてください。音はボタンのAudio Sourceから鳴ります。Inspectorの「Audio Source」でAssetを差し替えると、そのまま自分の音になります。",
  lesson: {
    goal: "押したら何かが起きる、をひと通り自分で作れるようになります",
    steps: [
      "Playを開始し、ボタンを見てクリックします。音が鳴り、ボタンが一瞬オレンジに光ります。",
      "Playを停止し、Hierarchyで「ボタン」を選びます。Interactable、Audio Source、Interaction Triggerの3つが載っています。",
      "Interaction TriggerのGraphを開きます。「押されたとき」から、音を鳴らす・光らせる・戻す、の3つのアクションが順につながっています。",
      "光る色のアクションを選び、値を好きな色に変えてもう一度Playします。変えた色で光ります。",
      "Audio SourceのAssetを、自分でImportした音に差し替えます。グラフはそのままで音だけ変わります。",
    ],
  },
  behaviours: [
    {
      host: "ボタン",
      graphName: "押すと音が鳴る",
      start: "interact",
      summary: "押す → 音を鳴らし、ボタンを0.15秒かけて光らせ、0.4秒かけて戻す",
      interactionText: "押す",
      actions: [
        {
          target: { scope: "part", part: "ボタン" },
          targetKind: "audio-source",
          property: "playback",
          value: "play",
        },
        {
          target: { scope: "part", part: "ボタン" },
          targetKind: "material",
          property: "emissive",
          value: "#f97316",
          duration: 0.15,
        },
        {
          target: { scope: "part", part: "ボタン" },
          targetKind: "material",
          property: "emissive",
          value: "#000000",
          duration: 0.4,
          after: "done",
        },
      ],
    },
  ],
  parts: [
    box("台座", M.slate, [0, 0.06, 0], [0.62, 0.12, 0.62]),
    {
      ...cyl("ボタン", M.orange, [0, 0.19, 0], [0.34, 0.14, 0.34]),
      interactable: { label: "押す" },
      audio: {
        audioId: "pressChime",
        autoplay: false,
        loop: false,
        volume: 1,
        spatial: true,
        refDistance: 2,
        maxDistance: 30,
      },
    },
    {
      kind: "text",
      name: "案内",
      position: [0, 0.62, 0],
      rotation: [0, 0, 0],
      text: "押すと音が鳴ります",
      fontSize: 0.11,
      color: "#e2e8f0",
    },
  ],
};

const LIGHT_SWITCH: SceneRecipe = {
  id: SCENE_RECIPE_IDS.lightSwitch,
  name: "灯りのスイッチ",
  description:
    "スイッチを押すと、別のEntityに載ったLightが点いたり消えたりします。押したものとは違うEntityを書き換える、いちばん短い例です。",
  category: "tutorial",
  projectKinds: ["world"],
  note: "灯りは消えた状態で置かれます。Playを開始してスイッチを押すと点きます。Lightは「電球」の下のEntityにあるので、明るさや色はそこのInspectorで変えられます。",
  lesson: {
    goal: "押したEntityとは別のEntityを、グラフから動かせるようになります",
    steps: [
      "Playを開始してスイッチを押します。カチッと鳴って灯りが点き、もう一度押すと消えます。",
      "Playを停止し、「スイッチ」のInteraction Triggerのグラフを開きます。2つ目のアクションの対象が「灯り」になっています。",
      "対象のEntityを別のものに変えると、同じスイッチで別の灯りを点けられます。Sceneに灯りを増やして試してください。",
      "「点灯」のアクションは「切り替える」なので、値を持ちません。ON/OFFを決め打ちしたいときは「設定する」に変えます。",
      "「灯り」EntityのLightで、色と強さを変えてPlayし直します。",
    ],
  },
  behaviours: [
    {
      host: "スイッチ",
      graphName: "押すと灯りが切り替わる",
      start: "interact",
      summary: "押す → カチッと鳴らし、「灯り」のLightの点灯を切り替える",
      interactionText: "スイッチを押す",
      actions: [
        {
          target: { scope: "part", part: "スイッチ" },
          targetKind: "audio-source",
          property: "playback",
          value: "play",
        },
        {
          target: { scope: "part", part: "灯り" },
          targetKind: "light",
          property: "enabled",
          mode: "toggle",
        },
      ],
    },
  ],
  parts: [
    box("支柱", M.slate, [0, 0.9, 0], [0.14, 1.8, 0.14]),
    {
      ...box("スイッチ", M.white, [0, 1.15, 0.12], [0.2, 0.2, 0.1]),
      interactable: { label: "スイッチを押す" },
      audio: {
        audioId: "softClick",
        autoplay: false,
        loop: false,
        volume: 0.9,
        spatial: true,
        refDistance: 1.5,
        maxDistance: 20,
      },
    },
    shape(C.sphere, "電球", M.white, [0, 1.92, 0], [0.26, 0.26, 0.26]),
    {
      ...lamp("灯り", [0, 1.92, 0], "#ffd9a0", 6, 9),
      startsOff: true,
    },
    {
      kind: "text",
      name: "案内",
      position: [0, 2.35, 0],
      rotation: [0, 0, 0],
      text: "押すと灯りが点きます",
      fontSize: 0.11,
      color: "#e2e8f0",
    },
  ],
};

const AMBIENT_SPEAKER: SceneRecipe = {
  id: SCENE_RECIPE_IDS.ambientSpeaker,
  name: "環境音のスピーカー",
  description:
    "つなぎ目のない4秒のループを流し続けるスピーカーです。近づくと大きく、離れると聞こえなくなる距離の設定が、そのまま入っています。",
  category: "tutorial",
  projectKinds: ["world"],
  note: "Playを開始した時点から鳴り続けます。ブラウザの仕様で、最初のクリックまで音が出ないことがあります。無音のまま置きたいときは、Audio SourceのAutoplayをオフにしてください。",
  lesson: {
    goal: "空間に置く音の、聞こえる範囲を自分で決められるようになります",
    steps: [
      "Playを開始して、スピーカーに近づいたり離れたりします。音量が距離で変わります。",
      "Playを停止し、「環境音」EntityのAudio Sourceを開きます。Ref distanceが全開で聞こえる距離、Max distanceが聞こえなくなる距離です。",
      "Max distanceを小さくしてPlayし直すと、すぐ聞こえなくなります。部屋ごとに違う音を置くときの調整です。",
      "Spatialをオフにすると、どこにいても同じ音量で鳴ります。BGMはこちらです。",
      "AssetをImportした自分の音に差し替えます。ループさせる音は、始まりと終わりがつながっているものを選んでください。",
    ],
  },
  parts: [
    box("スピーカー本体", M.charcoal, [0, 0.45, 0], [0.5, 0.9, 0.42]),
    shape(C.cylinder, "コーン", M.slate, [0, 0.62, 0.22], [0.26, 0.04, 0.26], [
      Math.PI / 2,
      0,
      0,
    ]),
    shape(C.cylinder, "コーン下", M.slate, [0, 0.28, 0.22], [0.18, 0.04, 0.18], [
      Math.PI / 2,
      0,
      0,
    ]),
    {
      kind: "audio",
      name: "環境音",
      position: [0, 0.9, 0],
      audio: {
        audioId: "ambientHum",
        autoplay: true,
        loop: true,
        volume: 0.7,
        spatial: true,
        refDistance: 2,
        maxDistance: 22,
      },
    },
    {
      kind: "text",
      name: "案内",
      position: [0, 1.15, 0],
      rotation: [0, 0, 0],
      text: "近づくと聞こえます",
      fontSize: 0.1,
      color: "#e2e8f0",
    },
  ],
};

const SLIDING_DOOR: SceneRecipe = {
  id: SCENE_RECIPE_IDS.slidingDoor,
  name: "自動で閉まる扉",
  description:
    "押すと1秒かけて開き、2.5秒待って、また閉じます。時間をかけた変化と、変化が終わってからの続きを、1つのグラフで見せます。",
  category: "tutorial",
  projectKinds: ["world"],
  note: "扉は横へスライドするだけで、コライダーは入れていません。通り抜けさせたくない壁として使うときは、扉と枠にMesh Colliderを足してください。",
  lesson: {
    goal: "「動かす」「待つ」「戻す」を1本のグラフでつなげられるようになります",
    steps: [
      "Playを開始して扉を押します。音とともに開き、少し待って閉まります。",
      "Playを停止し、「扉」のInteraction Triggerのグラフを開きます。上から、音・開く・待つ・閉じる、の順に並んでいます。",
      "「開く」のアクションの「かける時間」を3秒にすると、ゆっくり開きます。位置の値を変えれば開く幅が変わります。",
      "待ち時間のノードの秒数を変えると、開いたままの長さが変わります。",
      "「開く」から「待つ」へのつなぎは、出力ではなく「完了後」です。移動し終わってから数え始めたいので、ここだけ別のソケットを使っています。",
    ],
  },
  behaviours: [
    {
      host: "扉",
      graphName: "押すと開いて閉じる",
      start: "interact",
      summary: "押す → 音を鳴らして1秒で開き、2.5秒待って1秒で閉じる",
      interactionText: "扉を開ける",
      actions: [
        {
          target: { scope: "part", part: "扉" },
          targetKind: "audio-source",
          property: "playback",
          value: "play",
        },
        {
          target: { scope: "part", part: "扉" },
          targetKind: "transform",
          property: "position",
          value: [0.92, 1.05, 0.14],
          duration: 1,
        },
        {
          target: { scope: "part", part: "扉" },
          targetKind: "audio-source",
          property: "playback",
          value: "play",
          after: "done",
          delay: 2.5,
        },
        {
          target: { scope: "part", part: "扉" },
          targetKind: "transform",
          property: "position",
          value: [0, 1.05, 0.14],
          duration: 1,
        },
      ],
    },
  ],
  parts: [
    box("枠 左", M.slate, [-0.62, 1.1, 0], [0.14, 2.2, 0.18]),
    box("枠 右", M.slate, [1.16, 1.1, 0], [0.14, 2.2, 0.18]),
    box("枠 上", M.slate, [0.27, 2.24, 0], [1.92, 0.16, 0.18]),
    {
      // The door hangs in front of the frame rather than inside it: sliding it
      // sideways in the frame's own plane would push it through the right post.
      ...box("扉", M.wood, [0, 1.05, 0.14], [1, 2.1, 0.08]),
      interactable: { label: "扉を開ける" },
      audio: {
        audioId: "doorSlide",
        autoplay: false,
        loop: false,
        volume: 0.9,
        spatial: true,
        refDistance: 2,
        maxDistance: 26,
      },
    },
    {
      kind: "text",
      name: "案内",
      position: [0, 2.55, 0],
      rotation: [0, 0, 0],
      text: "押すと開きます",
      fontSize: 0.12,
      color: "#e2e8f0",
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
  RECORDING_STUDIO,
  BENCH,
  TABLE_SET,
  MAGIC_CIRCLE,
  WARP_PILLAR,
  SNOWMAN,
  SOUND_BUTTON,
  LIGHT_SWITCH,
  AMBIENT_SPEAKER,
  SLIDING_DOOR,
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
  /**
   * Document Assets this placement added — Particle and Interactivity — for
   * the message and for tests. Bundled Models and sounds are not here: those
   * are files committed to disk and shared by content hash, so a second set
   * that uses the same sound adds nothing.
   */
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
  /**
   * Where each part landed, so a behaviour can point an action at another part
   * of the same set. A graph targets an Entity id and, for the Components that
   * can occur more than once on one Entity, a Component id — neither of which
   * exists until the part is built, which is why the wiring runs after this
   * loop rather than inside it.
   */
  const placed = new Map<string, SceneRecipePlacedPart>();

  for (const part of recipe.parts) {
    const entityId = createDocumentId("entity");
    const hasTransform =
      part.kind === "primitive" || part.kind === "model" || part.kind === "text";
    const components: SceneComponent[] = [
      createTransformComponent(
        createDocumentId("component-transform"),
        part.position,
        hasTransform ? part.rotation : [0, 0, 0],
        part.kind === "primitive" || part.kind === "model"
          ? part.scale
          : [1, 1, 1],
      ),
    ];
    const componentIds: Partial<Record<XriftInteractionTargetKind, string>> = {};

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
      if (part.collider === "trimesh") {
        components.push(
          createMeshColliderComponent(createDocumentId("component-collider"), {
            meshMode: "trimesh",
          }),
        );
      }
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
    } else if (part.kind === "light") {
      const lightComponentId = createDocumentId("component-light");
      componentIds.light = lightComponentId;
      components.push({
        id: lightComponentId,
        type: "light",
        enabled: !part.startsOff,
        ...part.light,
      });
    } else if (part.kind === "text") {
      const text = createTextComponent(createDocumentId("component-text"), {
        text: part.text,
        fontSize: part.fontSize,
        ...(part.color === undefined ? {} : { color: part.color }),
        ...(part.maxWidth === undefined ? {} : { maxWidth: part.maxWidth }),
      });
      if (!text) return null;
      componentIds.text = text.id;
      components.push(text);
    }

    const audio =
      part.kind === "audio"
        ? part.audio
        : part.kind === "primitive" || part.kind === "model"
          ? part.audio
          : undefined;
    if (audio) {
      const definition = getBuiltinRecipeAudio(audio.audioId);
      if (!definition) return null;
      const withAudio = await ensureBuiltinAudioAsset(
        projectPath,
        nextAssets,
        definition,
      );
      if (!withAudio || withAudio.assets[definition.assetId]?.kind !== "audio") {
        return null;
      }
      nextAssets = withAudio;
      const source = createAudioSourceComponent(
        createDocumentId("component-audio-source"),
        definition.assetId,
        audio.spatial,
      );
      if (!source) return null;
      componentIds["audio-source"] = source.id;
      components.push({
        ...source,
        volume: audio.volume,
        loop: audio.loop,
        autoplay: audio.autoplay,
        ...(audio.refDistance === undefined
          ? {}
          : { refDistance: audio.refDistance }),
        ...(audio.maxDistance === undefined
          ? {}
          : { maxDistance: audio.maxDistance }),
      });
    }

    if (part.kind === "primitive" || part.kind === "model") {
      if (part.interactable) {
        // The graph hears `onInteract` from the official Interactable, and the
        // compiler blocks a trigger without one. Its id has to be unique in the
        // published world, so it is derived from the Entity's own id.
        const interactable = createXriftComponent(
          XRIFT_COMPONENT_SCHEMA_IDS.interactable,
          {
            componentId: createDocumentId("component-xrift"),
            properties: {
              id: entityId,
              interactionText: part.interactable.label,
            },
          },
        );
        if (!interactable) return null;
        components.push(interactable);
      }
    }

    placed.set(part.name, { entityId, componentIds });

    children.push({
      id: entityId,
      name: part.name,
      parentId: rootEntityId,
      children: [],
      enabled: true,
      components,
    });
  }

  for (const behaviour of recipe.behaviours ?? []) {
    const host = placed.get(behaviour.host);
    const hostEntity = host
      ? children.find((child) => child.id === host.entityId)
      : undefined;
    if (!host || !hostEntity) return null;

    const extension = createSceneRecipeBehaviourExtension(behaviour, placed);
    if (!extension) return null;

    const assetId = createDocumentId("interactivity");
    const added = addDefaultInteractivityAsset(nextAssets, {
      id: assetId,
      name: uniqueAssetName(nextAssets, `${recipe.name}の${behaviour.graphName}`),
      folderId: null,
      extension,
    });
    if (!added.added) return null;
    nextAssets = added.manifest;
    createdAssetIds.push(assetId);

    const trigger = createInteractionTriggerComponent(
      createDocumentId("component-interaction-trigger"),
      assetId,
    );
    if (!trigger) return null;
    hostEntity.components.push(trigger);
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

  const nextScene: SceneDocument = {
    ...scene,
    rootEntityIds: [...scene.rootEntityIds, rootEntityId],
    entities,
  };

  return {
    // `entityReferences` is derived, never authored: the same sync every graph
    // write goes through is what records the Entities these behaviours depend
    // on, so a set placed here publishes exactly like one wired by hand.
    scene: recipe.behaviours?.length
      ? syncInteractionTriggerReferences(nextScene, nextAssets)
      : nextScene,
    assets: nextAssets,
    rootEntityId,
    createdAssetIds,
  };
}

/** Where one part of a set landed, for the graphs that write to it. */
export type SceneRecipePlacedPart = {
  entityId: string;
  componentIds: Partial<Record<XriftInteractionTargetKind, string>>;
};

/**
 * Builds one behaviour into an Interactivity Asset's extension.
 *
 * Exported so the fixture suite can prove every shipped behaviour produces a
 * graph the runtime actually runs, without a project on disk: the wiring is
 * where a set's promise is either kept or quietly broken, and the placement
 * path around it needs files.
 */
export function createSceneRecipeBehaviourExtension(
  behaviour: SceneRecipeBehaviour,
  placed: ReadonlyMap<string, SceneRecipePlacedPart>,
): KhrInteractivityExtension | null {
  const extension = createDefaultKhrInteractivityExtension();
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  graph.name = behaviour.graphName;
  graph.nodes = [];
  graph.declarations = [];
  graph.types = [];
  return buildRecipeBehaviourGraph(graph, behaviour, placed) ? extension : null;
}

/**
 * Wires one behaviour into an empty graph.
 *
 * The actions are a straight line by construction: each one continues from the
 * previous node's `out` — or from its `done`, which is what "after it has
 * finished moving" means — with an optional wait spliced in between. Branching
 * is deliberately not expressible here, because a set that lands as a chain is
 * a chain the author can read top to bottom on their first look at the node
 * editor.
 */
function buildRecipeBehaviourGraph(
  graph: KhrInteractivityGraph,
  behaviour: SceneRecipeBehaviour,
  placed: ReadonlyMap<string, SceneRecipePlacedPart>,
): boolean {
  let column = 0;
  const nextPosition = () => ({ x: 80 + column++ * 320, y: 160 });

  let previous = appendInteractivityOperation(
    graph,
    behaviour.start === "interact"
      ? XRIFT_INTERACTION_OPERATIONS.onInteract
      : "event/onStart",
    nextPosition(),
  );
  let previousSocket: "out" | "done" = "out";

  for (const action of behaviour.actions) {
    const socket = action.after ?? "out";
    if (action.delay !== undefined) {
      const delay = appendInteractivityOperation(graph, "flow/setDelay", nextPosition());
      setInteractivityLiteralValue(graph, delay, "duration", [action.delay]);
      connectInteractivityFlow(graph, previous, socket, delay);
      previous = delay;
      previousSocket = "done";
    } else {
      previousSocket = socket;
    }

    const target = resolveRecipeActionTarget(action, placed);
    if (!target) return false;
    const descriptor = getXriftInteractionProperty(
      action.targetKind,
      action.property,
    );
    if (!descriptor) return false;

    const node = appendInteractivityOperation(
      graph,
      action.mode === "toggle"
        ? XRIFT_INTERACTION_OPERATIONS.toggleProperty
        : XRIFT_INTERACTION_OPERATIONS.setProperty,
      nextPosition(),
    );
    if (
      !configureInteractivityTriggerAction(graph, node, {
        entityId: target.entityId,
        componentId: target.componentId,
        targetKind: action.targetKind,
        property: action.property,
      })
    ) {
      return false;
    }
    if (action.mode !== "toggle" && action.value !== undefined) {
      if (descriptor.kind === "string") {
        setInteractivityTriggerActionText(graph, node, String(action.value));
      } else {
        const value = recipeActionValue(descriptor, action.value);
        if (!value) return false;
        setInteractivityTriggerActionValue(graph, node, descriptor, value);
      }
    }
    if (action.duration !== undefined) {
      setInteractivityTriggerActionDuration(graph, node, action.duration);
    }
    connectInteractivityFlow(graph, previous, previousSocket, node);
    previous = node;
    previousSocket = "out";
  }

  return true;
}

function resolveRecipeActionTarget(
  action: SceneRecipeAction,
  placed: ReadonlyMap<string, SceneRecipePlacedPart>,
): { entityId: string; componentId: string } | null {
  if (action.target.scope === "player") {
    return { entityId: XRIFT_INTERACTION_PLAYER_ENTITY_ID, componentId: "" };
  }
  if (action.target.scope === "scene") {
    return { entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID, componentId: "" };
  }
  const part = placed.get(action.target.part);
  if (!part) return null;
  // Entity, Transform and Material are one per Entity, so they are addressed by
  // the Entity alone. An Audio Source, a Light or a Text is not — a set with
  // two speakers has to say which one — so those actions carry the Component
  // the part actually got.
  const componentId = part.componentIds[action.targetKind];
  if (
    componentId === undefined &&
    (action.targetKind === "audio-source" ||
      action.targetKind === "light" ||
      action.targetKind === "text")
  ) {
    return null;
  }
  return { entityId: part.entityId, componentId: componentId ?? "" };
}

/** The action's authored value, in the shape its property's socket takes. */
function recipeActionValue(
  descriptor: XriftInteractionPropertyDescriptor,
  value: boolean | number | string | readonly number[],
): KhrInteractivityJsonValue[] | null {
  switch (descriptor.kind) {
    case "bool":
      return typeof value === "boolean" ? [value] : null;
    case "float":
      return typeof value === "number" ? [value] : null;
    case "color": {
      if (typeof value === "string") {
        const [red, green, blue] = tintToLinearRgb(value);
        return [red, green, blue];
      }
      return Array.isArray(value) && value.length >= 3
        ? [value[0], value[1], value[2]]
        : null;
    }
    case "vector3":
      return Array.isArray(value) && value.length >= 3
        ? [value[0], value[1], value[2]]
        : null;
    case "enum": {
      if (typeof value !== "string") return null;
      const index = xriftInteractionEnumIndex(descriptor, value);
      return index < 0 ? null : [index];
    }
    case "asset":
    case "string":
      // Both live in `configuration`; nothing goes on the socket.
      return [];
  }
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
