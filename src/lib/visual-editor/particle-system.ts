import type {
  AssetManifest,
  Color4,
  ParticleAsset,
  ParticleBurst,
  ParticleProperties,
  ParticleScalarRange,
  Vec3Like,
} from "./asset-manifest";

export type ParticlePropertiesPatch = Partial<
  Omit<
    ParticleProperties,
    | "startDelay"
    | "startLifetime"
    | "startSpeed"
    | "startSize"
    | "startRotation"
    | "emission"
    | "shape"
    | "colorOverLifetime"
    | "sizeOverLifetime"
    | "velocityOverLifetime"
    | "renderer"
  >
> & {
  startDelay?: Partial<ParticleScalarRange>;
  startLifetime?: Partial<ParticleScalarRange>;
  startSpeed?: Partial<ParticleScalarRange>;
  startSize?: Partial<ParticleScalarRange>;
  startRotation?: Partial<ParticleScalarRange>;
  emission?: Partial<ParticleProperties["emission"]>;
  shape?: ParticleProperties["shape"];
  colorOverLifetime?: Partial<ParticleProperties["colorOverLifetime"]>;
  sizeOverLifetime?: Partial<ParticleScalarRange>;
  velocityOverLifetime?: Partial<ParticleProperties["velocityOverLifetime"]>;
  renderer?: Partial<ParticleProperties["renderer"]>;
};

export const DEFAULT_PARTICLE_PROPERTIES: ParticleProperties = {
  maxParticles: 1_000,
  duration: 5,
  looping: true,
  prewarm: false,
  simulationSpace: "local",
  startDelay: { min: 0, max: 0 },
  startLifetime: { min: 1, max: 2 },
  startSpeed: { min: 0.8, max: 1.6 },
  startSize: { min: 0.08, max: 0.16 },
  startRotation: { min: 0, max: Math.PI * 2 },
  gravity: [0, -0.35, 0],
  emission: { rateOverTime: 28, bursts: [] },
  shape: { type: "cone", radius: 0.18, angle: 24 },
  colorOverLifetime: {
    start: [1, 0.82, 0.35, 1],
    end: [1, 0.18, 0.04, 0],
  },
  sizeOverLifetime: { min: 1, max: 0.15 },
  velocityOverLifetime: {
    linear: [0, 0, 0],
    orbital: [0, 0, 0],
  },
  renderer: {
    mode: "billboard",
    blending: "additive",
    sortMode: "distance",
    castShadow: false,
    receiveShadow: false,
  },
};

/**
 * What a preset is for, so the catalog can group the shelf.
 *
 * The grouping is by what an author is trying to make — a fire, weather, water
 * — not by which simulation setting differs. Someone building a campfire looks
 * for fire, not for "additive blending with upward gravity".
 */
export type ParticlePresetCategory =
  | "fire"
  | "weather"
  | "water"
  | "nature"
  | "effect";

export const PARTICLE_PRESET_CATEGORY_LABELS: Readonly<
  Record<ParticlePresetCategory, string>
> = {
  fire: "火と煙",
  weather: "天気",
  water: "水",
  nature: "自然",
  effect: "演出",
};

/**
 * The Particle presets, shared by the Asset Inspector and the resource store.
 *
 * One list rather than a separate store catalog: a preset the store offers and
 * one the Inspector applies have to be the same numbers, and two lists drift.
 */
export type ParticleAuthoringPreset = {
  id: string;
  name: string;
  description: string;
  category: ParticlePresetCategory;
  properties: ParticlePropertiesPatch;
};

export const PARTICLE_AUTHORING_PRESETS: readonly ParticleAuthoringPreset[] = [
  {
    id: "fire",
    name: "炎",
    description: "上昇しながら赤く消える炎",
    category: "fire",
    properties: {
      maxParticles: 320,
      duration: 4,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 0.6, max: 1.25 },
      startSpeed: { min: 0.45, max: 1.15 },
      startSize: { min: 0.12, max: 0.32 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, 0.45, 0],
      emission: { rateOverTime: 48, bursts: [] },
      shape: { type: "cone", radius: 0.28, angle: 15 },
      colorOverLifetime: {
        start: [1, 0.72, 0.12, 0.95],
        end: [0.85, 0.03, 0.01, 0],
      },
      sizeOverLifetime: { min: 1, max: 0.08 },
      velocityOverLifetime: {
        linear: [0, 0.35, 0],
        orbital: [0, 0.35, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "additive",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "smoke",
    name: "煙",
    description: "広がって薄くなる煙",
    category: "fire",
    properties: {
      maxParticles: 180,
      duration: 6,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 2.8, max: 4.8 },
      startSpeed: { min: 0.08, max: 0.28 },
      startSize: { min: 0.32, max: 0.7 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, 0.08, 0],
      emission: { rateOverTime: 10, bursts: [] },
      shape: { type: "cone", radius: 0.35, angle: 22 },
      colorOverLifetime: {
        start: [0.76, 0.8, 0.86, 0.56],
        end: [0.24, 0.28, 0.36, 0],
      },
      sizeOverLifetime: { min: 0.7, max: 1.9 },
      velocityOverLifetime: {
        linear: [0.08, 0.28, 0],
        orbital: [0, 0.18, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "normal",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "magic",
    name: "魔法",
    description: "青紫の浮遊光",
    category: "effect",
    properties: {
      maxParticles: 280,
      duration: 5,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 1.4, max: 2.8 },
      startSpeed: { min: 0.04, max: 0.22 },
      startSize: { min: 0.05, max: 0.16 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, 0.02, 0],
      emission: { rateOverTime: 38, bursts: [] },
      shape: { type: "sphere", radius: 0.85 },
      colorOverLifetime: {
        start: [0.28, 0.96, 1, 1],
        end: [0.66, 0.18, 1, 0],
      },
      sizeOverLifetime: { min: 0.9, max: 0.12 },
      velocityOverLifetime: {
        linear: [0, 0.08, 0],
        orbital: [0, 1.4, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "additive",
        sortMode: "youngest",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "snow",
    name: "雪",
    description: "広い範囲へ降る雪",
    category: "weather",
    properties: {
      maxParticles: 720,
      duration: 8,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 5, max: 8 },
      startSpeed: { min: 0, max: 0.12 },
      startSize: { min: 0.04, max: 0.12 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, -0.42, 0],
      emission: { rateOverTime: 52, bursts: [] },
      shape: { type: "box", size: [4, 0.1, 4] },
      colorOverLifetime: {
        start: [0.92, 0.98, 1, 0.95],
        end: [0.68, 0.84, 1, 0],
      },
      sizeOverLifetime: { min: 1, max: 0.65 },
      velocityOverLifetime: {
        linear: [0.12, -0.08, 0],
        orbital: [0, 0.16, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "normal",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "confetti",
    name: "紙吹雪",
    description: "勢いよく広がって落下する紙片",
    category: "effect",
    properties: {
      maxParticles: 460,
      duration: 5,
      looping: true,
      prewarm: false,
      startDelay: { min: 0, max: 0.2 },
      startLifetime: { min: 2.2, max: 4.2 },
      startSpeed: { min: 2, max: 4.5 },
      startSize: { min: 0.08, max: 0.2 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, -3.2, 0],
      emission: { rateOverTime: 28, bursts: [] },
      shape: { type: "cone", radius: 0.4, angle: 48 },
      colorOverLifetime: {
        start: [1, 0.2, 0.64, 1],
        end: [0.12, 0.82, 1, 0.18],
      },
      sizeOverLifetime: { min: 1, max: 0.7 },
      velocityOverLifetime: {
        linear: [0.18, 0, 0],
        orbital: [0, 1.2, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "normal",
        sortMode: "youngest",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "fountain",
    name: "噴水",
    description: "重力で弧を描く細かな飛沫",
    category: "water",
    properties: {
      maxParticles: 520,
      duration: 5,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 1.4, max: 2.4 },
      startSpeed: { min: 2.4, max: 3.8 },
      startSize: { min: 0.035, max: 0.09 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, -2.8, 0],
      emission: { rateOverTime: 72, bursts: [] },
      shape: { type: "cone", radius: 0.18, angle: 22 },
      colorOverLifetime: {
        start: [0.72, 0.94, 1, 0.9],
        end: [0.18, 0.58, 1, 0],
      },
      sizeOverLifetime: { min: 1, max: 0.35 },
      velocityOverLifetime: {
        linear: [0, 0, 0],
        orbital: [0, 0.15, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "additive",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "spark",
    name: "火花",
    description: "弾けて短く消える明るい火の粉",
    category: "fire",
    properties: {
      maxParticles: 260,
      duration: 3,
      looping: true,
      prewarm: false,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 0.35, max: 0.9 },
      startSpeed: { min: 1.8, max: 3.6 },
      startSize: { min: 0.02, max: 0.05 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, -4.5, 0],
      emission: { rateOverTime: 60, bursts: [] },
      shape: { type: "cone", radius: 0.06, angle: 42 },
      colorOverLifetime: {
        start: [1, 0.92, 0.6, 1],
        end: [1, 0.3, 0.05, 0],
      },
      sizeOverLifetime: { min: 1, max: 0.25 },
      velocityOverLifetime: {
        linear: [0, 0, 0],
        orbital: [0, 0, 0],
      },
      renderer: {
        mode: "stretched-billboard",
        blending: "additive",
        sortMode: "youngest",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "steam",
    name: "湯気",
    description: "細く立ちのぼって消える白い湯気",
    category: "water",
    properties: {
      maxParticles: 120,
      duration: 5,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 1.6, max: 3 },
      startSpeed: { min: 0.12, max: 0.3 },
      startSize: { min: 0.14, max: 0.3 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, 0.22, 0],
      emission: { rateOverTime: 14, bursts: [] },
      shape: { type: "cone", radius: 0.12, angle: 14 },
      colorOverLifetime: {
        start: [1, 1, 1, 0.32],
        end: [0.9, 0.94, 1, 0],
      },
      sizeOverLifetime: { min: 0.6, max: 2.1 },
      velocityOverLifetime: {
        linear: [0.04, 0.24, 0],
        orbital: [0, 0.3, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "normal",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "rain",
    name: "雨",
    description: "広い範囲へまっすぐ落ちる雨",
    category: "weather",
    properties: {
      maxParticles: 900,
      duration: 4,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 1.1, max: 1.6 },
      startSpeed: { min: 0.2, max: 0.6 },
      startSize: { min: 0.02, max: 0.05 },
      startRotation: { min: 0, max: 0 },
      gravity: [0, -12, 0],
      emission: { rateOverTime: 260, bursts: [] },
      shape: { type: "box", size: [6, 0.1, 6] },
      colorOverLifetime: {
        start: [0.72, 0.82, 0.95, 0.55],
        end: [0.6, 0.72, 0.9, 0.25],
      },
      sizeOverLifetime: { min: 1, max: 1 },
      velocityOverLifetime: {
        linear: [0.3, -1.2, 0],
        orbital: [0, 0, 0],
      },
      renderer: {
        mode: "stretched-billboard",
        blending: "normal",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "sakura",
    name: "桜",
    description: "風に流れて落ちる花びら",
    category: "weather",
    properties: {
      maxParticles: 420,
      duration: 8,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 5, max: 9 },
      startSpeed: { min: 0, max: 0.1 },
      startSize: { min: 0.05, max: 0.11 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, -0.28, 0],
      emission: { rateOverTime: 28, bursts: [] },
      shape: { type: "box", size: [5, 0.1, 5] },
      colorOverLifetime: {
        start: [1, 0.78, 0.86, 0.95],
        end: [1, 0.62, 0.76, 0],
      },
      sizeOverLifetime: { min: 1, max: 0.9 },
      velocityOverLifetime: {
        linear: [0.22, -0.06, 0],
        orbital: [0, 0.5, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "normal",
        sortMode: "distance",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  {
    id: "firefly",
    name: "蛍",
    description: "漂って明滅する小さな光",
    category: "nature",
    properties: {
      maxParticles: 90,
      duration: 6,
      looping: true,
      prewarm: true,
      startDelay: { min: 0, max: 0 },
      startLifetime: { min: 2.5, max: 5 },
      startSpeed: { min: 0.02, max: 0.12 },
      startSize: { min: 0.03, max: 0.07 },
      startRotation: { min: 0, max: Math.PI * 2 },
      gravity: [0, 0.01, 0],
      emission: { rateOverTime: 12, bursts: [] },
      shape: { type: "sphere", radius: 2.4 },
      colorOverLifetime: {
        start: [0.86, 1, 0.5, 0.9],
        end: [0.5, 0.9, 0.25, 0],
      },
      sizeOverLifetime: { min: 0.6, max: 1.1 },
      velocityOverLifetime: {
        linear: [0, 0.05, 0],
        orbital: [0, 0.35, 0],
      },
      renderer: {
        mode: "billboard",
        blending: "additive",
        sortMode: "youngest",
        castShadow: false,
        receiveShadow: false,
      },
    },
  },
  ...createAdditionalParticlePresets(),
];

function createAdditionalParticlePresets(): ParticleAuthoringPreset[] {
  // Resolve every preset independently so no settings leak from the previously
  // selected Inspector preset. These use the shared runtime's existing features.
  const entries: ParticleAuthoringPreset[] = [
    { id: "embers", name: "舞い上がる火の粉", category: "fire", description: "ゆっくり上昇しながら赤く消える小さな火の粉", properties: {
      maxParticles: 160, prewarm: true, startLifetime: { min: 2, max: 4 }, startSpeed: { min: 0.15, max: 0.5 }, startSize: { min: 0.015, max: 0.045 }, gravity: [0, 0.1, 0], emission: { rateOverTime: 24 }, shape: { type: "cone", radius: 0.5, angle: 20 }, velocityOverLifetime: { orbital: [0, 0.5, 0] },
    } },
    { id: "torch", name: "たいまつ", category: "fire", description: "小さな灯りに合う細く勢いのある炎", properties: {
      maxParticles: 120, prewarm: true, startLifetime: { min: 0.25, max: 0.6 }, startSpeed: { min: 0.6, max: 1.2 }, startSize: { min: 0.06, max: 0.12 }, gravity: [0, 0.6, 0], emission: { rateOverTime: 90 }, shape: { type: "cone", radius: 0.06, angle: 12 },
    } },
    { id: "blizzard", name: "吹雪", category: "weather", description: "強い横風に流されて斜めに降る雪", properties: {
      maxParticles: 900, prewarm: true, startLifetime: { min: 2, max: 3.5 }, startSpeed: { min: 0, max: 0.1 }, startSize: { min: 0.025, max: 0.06 }, gravity: [0, -0.7, 0], emission: { rateOverTime: 220 }, shape: { type: "box", size: [7, 2, 7] }, velocityOverLifetime: { linear: [2, -0.5, 0.3] }, colorOverLifetime: { start: [0.9, 0.96, 1, 0.8], end: [0.8, 0.9, 1, 0] }, renderer: { blending: "normal" },
    } },
    { id: "mist", name: "地面の霧", category: "weather", description: "地面近くをゆっくり流れる薄い霧", properties: {
      maxParticles: 100, prewarm: true, startLifetime: { min: 4, max: 7 }, startSpeed: { min: 0, max: 0.02 }, startSize: { min: 0.7, max: 1.4 }, gravity: [0, 0, 0], emission: { rateOverTime: 12 }, shape: { type: "box", size: [6, 0.2, 6] }, velocityOverLifetime: { linear: [0.12, 0, 0] }, sizeOverLifetime: { min: 0.8, max: 2 }, colorOverLifetime: { start: [0.8, 0.88, 0.94, 0.12], end: [0.8, 0.88, 0.94, 0] }, renderer: { blending: "normal" },
    } },
    { id: "bubbles", name: "水中の泡", category: "water", description: "水底から浮かび上がる青白い粒子", properties: {
      maxParticles: 140, prewarm: true, startLifetime: { min: 2.5, max: 4 }, startSpeed: { min: 0.05, max: 0.2 }, startSize: { min: 0.04, max: 0.12 }, gravity: [0, 0.18, 0], emission: { rateOverTime: 25 }, shape: { type: "box", size: [2, 0.1, 2] }, sizeOverLifetime: { min: 0.6, max: 1.3 }, colorOverLifetime: { start: [0.5, 0.85, 1, 0.5], end: [0.8, 0.95, 1, 0] }, renderer: { blending: "normal" },
    } },
    { id: "waterfall", name: "滝のしぶき", category: "water", description: "横に広がる放出口から勢いよく落ちる水", properties: {
      maxParticles: 600, prewarm: true, startLifetime: { min: 0.8, max: 1.5 }, startSpeed: { min: 0, max: 0.1 }, startSize: { min: 0.04, max: 0.1 }, gravity: [0, -4, 0], emission: { rateOverTime: 240 }, shape: { type: "box", size: [2, 0.1, 0.3] }, velocityOverLifetime: { linear: [0, -1.5, 0.3] }, colorOverLifetime: { start: [0.65, 0.9, 1, 0.65], end: [0.9, 0.98, 1, 0] }, renderer: { mode: "stretched-billboard", blending: "normal" },
    } },
    { id: "splash", name: "水しぶき", category: "water", description: "一度だけ扇状に弾けて落ちる飛沫", properties: {
      maxParticles: 160, duration: 1.5, looping: false, startLifetime: { min: 0.5, max: 1.2 }, startSpeed: { min: 1, max: 3 }, startSize: { min: 0.03, max: 0.08 }, gravity: [0, -5, 0], emission: { rateOverTime: 0, bursts: [{ time: 0, count: 100, cycles: 1, interval: 0 }] }, shape: { type: "cone", radius: 0.15, angle: 65 }, colorOverLifetime: { start: [0.6, 0.88, 1, 0.9], end: [0.8, 0.95, 1, 0] },
    } },
    { id: "pollen", name: "花粉", category: "nature", description: "暖かな光の中に漂う細かな黄色い粒子", properties: {
      maxParticles: 150, prewarm: true, startLifetime: { min: 4, max: 7 }, startSpeed: { min: 0.01, max: 0.04 }, startSize: { min: 0.01, max: 0.025 }, gravity: [0, -0.005, 0], emission: { rateOverTime: 18 }, shape: { type: "box", size: [4, 3, 4] }, velocityOverLifetime: { linear: [0.05, 0.015, 0], orbital: [0, 0.12, 0] }, colorOverLifetime: { start: [1, 0.9, 0.45, 0.65], end: [1, 0.8, 0.3, 0] },
    } },
    { id: "autumn-leaves", name: "落ち葉", category: "nature", description: "風に流されながら舞い落ちる橙色の粒子", properties: {
      maxParticles: 180, prewarm: true, startLifetime: { min: 4, max: 6 }, startSpeed: { min: 0, max: 0.08 }, startSize: { min: 0.05, max: 0.12 }, gravity: [0, -0.2, 0], emission: { rateOverTime: 20 }, shape: { type: "box", size: [5, 0.2, 5] }, velocityOverLifetime: { linear: [0.3, -0.1, 0], orbital: [0, 0.7, 0] }, colorOverLifetime: { start: [1, 0.5, 0.08, 0.9], end: [0.55, 0.15, 0.02, 0] }, renderer: { blending: "normal" },
    } },
    { id: "dust", name: "ほこり", category: "nature", description: "室内の光に浮かぶゆっくりした白い微粒子", properties: {
      maxParticles: 120, prewarm: true, startLifetime: { min: 5, max: 9 }, startSpeed: { min: 0, max: 0.015 }, startSize: { min: 0.008, max: 0.02 }, gravity: [0, -0.002, 0], emission: { rateOverTime: 10 }, shape: { type: "box", size: [3, 3, 3] }, velocityOverLifetime: { linear: [0.015, 0, 0] }, colorOverLifetime: { start: [1, 0.96, 0.85, 0.35], end: [1, 0.96, 0.85, 0] }, renderer: { blending: "normal" },
    } },
    { id: "fireworks", name: "花火", category: "effect", description: "一点から球状に広がる一度きりの光の破裂", properties: {
      maxParticles: 260, duration: 3, looping: false, startLifetime: { min: 1.2, max: 2.4 }, startSpeed: { min: 2, max: 4 }, startSize: { min: 0.025, max: 0.06 }, gravity: [0, -1, 0], emission: { rateOverTime: 0, bursts: [{ time: 0, count: 240, cycles: 1, interval: 0 }] }, shape: { type: "sphere", radius: 0.02 }, colorOverLifetime: { start: [1, 0.7, 0.25, 1], end: [1, 0.1, 0.3, 0] }, renderer: { mode: "stretched-billboard" },
    } },
    { id: "magic-aura", name: "魔法のオーラ", category: "effect", description: "紫の光が渦を巻きながら上昇する演出", properties: {
      maxParticles: 240, prewarm: true, startLifetime: { min: 1.5, max: 3 }, startSpeed: { min: 0.1, max: 0.3 }, startSize: { min: 0.025, max: 0.07 }, gravity: [0, 0.15, 0], emission: { rateOverTime: 65 }, shape: { type: "sphere", radius: 0.8 }, velocityOverLifetime: { linear: [0, 0.25, 0], orbital: [0, 2, 0] }, colorOverLifetime: { start: [0.6, 0.2, 1, 0.9], end: [0.1, 0.8, 1, 0] },
    } },
    { id: "healing", name: "回復の光", category: "effect", description: "足元から立ちのぼる柔らかな緑の光", properties: {
      maxParticles: 160, prewarm: true, startLifetime: { min: 1, max: 2.2 }, startSpeed: { min: 0.2, max: 0.5 }, startSize: { min: 0.04, max: 0.09 }, gravity: [0, 0.2, 0], emission: { rateOverTime: 45 }, shape: { type: "cone", radius: 0.7, angle: 5 }, colorOverLifetime: { start: [0.3, 1, 0.5, 0.85], end: [0.8, 1, 0.6, 0] },
    } },
    { id: "confetti-burst", name: "お祝いの紙吹雪", category: "effect", description: "一度に広がり、重力で落ちるお祝いの粒子", properties: {
      maxParticles: 220, duration: 4, looping: false, startLifetime: { min: 2, max: 3.5 }, startSpeed: { min: 2.5, max: 5 }, startSize: { min: 0.06, max: 0.14 }, gravity: [0, -3, 0], emission: { rateOverTime: 0, bursts: [{ time: 0, count: 200, cycles: 1, interval: 0 }] }, shape: { type: "cone", radius: 0.2, angle: 55 }, velocityOverLifetime: { orbital: [0, 0.8, 0] }, colorOverLifetime: { start: [1, 0.3, 0.65, 1], end: [0.2, 0.7, 1, 0] }, renderer: { blending: "normal" },
    } },
  ];
  return entries.map((entry) => ({ ...entry, properties: normalizeParticleProperties(entry.properties) }));
}

/** Apply a partial edit without losing the other values in nested settings. */
export function patchParticleProperties(
  current: ParticleProperties,
  patch: ParticlePropertiesPatch,
): ParticleProperties {
  return applyParticlePropertiesPatch(current, patch);
}

export function getParticleAuthoringPreset(
  presetId: string,
): ParticleAuthoringPreset | undefined {
  return PARTICLE_AUTHORING_PRESETS.find((preset) => preset.id === presetId);
}

export function scaleParticleEmission(
  properties: ParticleProperties,
  multiplier: number,
): ParticlePropertiesPatch {
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return {
    maxParticles: Math.max(
      1,
      Math.min(10_000, Math.round(properties.maxParticles * safeMultiplier)),
    ),
    emission: {
      rateOverTime: Math.max(
        0,
        Math.min(100_000, properties.emission.rateOverTime * safeMultiplier),
      ),
    },
  };
}

export function createDefaultParticleAsset(input: {
  id: string;
  name: string;
  folderId?: string | null;
  properties?: ParticlePropertiesPatch;
}): ParticleAsset | null {
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    kind: "particle",
    status: "ready",
    source: { kind: "document" },
    thumbnail: { status: "missing" },
    folderId: input.folderId ?? null,
    properties: applyParticlePropertiesPatch(
      cloneParticleProperties(DEFAULT_PARTICLE_PROPERTIES),
      input.properties ?? {},
    ),
  };
}

export function addDefaultParticleAsset(
  manifest: AssetManifest,
  input: Parameters<typeof createDefaultParticleAsset>[0],
): { manifest: AssetManifest; assetId: string; added: boolean } {
  const asset = createDefaultParticleAsset(input);
  if (
    !asset ||
    manifest.assets[asset.id] ||
    (asset.folderId && !manifest.folders?.[asset.folderId])
  ) {
    return { manifest, assetId: input.id, added: false };
  }
  const siblingOrders = Object.values(manifest.assets)
    .filter((candidate) => (candidate.folderId ?? null) === (asset.folderId ?? null))
    .map((candidate) => candidate.order ?? -1);
  asset.order = Math.max(-1, ...siblingOrders) + 1;
  return {
    manifest: {
      ...manifest,
      assets: { ...manifest.assets, [asset.id]: asset },
    },
    assetId: asset.id,
    added: true,
  };
}

/**
 * The properties an Asset created from `input` will hold.
 *
 * Takes the same patch shape the creation path takes, so a preview can resolve
 * exactly what will be saved instead of approximating it.
 */
export function normalizeParticleProperties(
  input: ParticlePropertiesPatch | undefined,
): ParticleProperties {
  return applyParticlePropertiesPatch(
    cloneParticleProperties(DEFAULT_PARTICLE_PROPERTIES),
    input ?? {},
  );
}

export function updateParticleAsset(
  manifest: AssetManifest,
  assetId: string,
  patch: ParticlePropertiesPatch,
): AssetManifest {
  const asset = manifest.assets[assetId];
  if (asset?.kind !== "particle") return manifest;
  const current = normalizeParticleProperties(asset.properties);
  const properties = applyParticlePropertiesPatch(current, patch, manifest);
  if (JSON.stringify(properties) === JSON.stringify(asset.properties)) return manifest;
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, properties },
    },
  };
}

function applyParticlePropertiesPatch(
  current: ParticleProperties,
  patch: ParticlePropertiesPatch,
  manifest?: AssetManifest,
): ParticleProperties {
  const renderer = { ...current.renderer, ...patch.renderer };
  if (
    renderer.materialAssetId &&
    manifest &&
    manifest.assets[renderer.materialAssetId]?.kind !== "material"
  ) {
    delete renderer.materialAssetId;
  }
  if (
    renderer.textureAssetId &&
    manifest &&
    manifest.assets[renderer.textureAssetId]?.kind !== "texture"
  ) {
    delete renderer.textureAssetId;
  }

  return {
    maxParticles: integer(patch.maxParticles, current.maxParticles, 1, 10_000),
    duration: finite(patch.duration, current.duration, 0.01, 600),
    looping: booleanValue(patch.looping, current.looping),
    prewarm: booleanValue(patch.prewarm, current.prewarm),
    simulationSpace:
      patch.simulationSpace === "local" || patch.simulationSpace === "world"
        ? patch.simulationSpace
        : current.simulationSpace,
    startDelay: normalizedRange(current.startDelay, patch.startDelay, 0, 600),
    startLifetime: normalizedRange(current.startLifetime, patch.startLifetime, 0.01, 600),
    startSpeed: normalizedRange(current.startSpeed, patch.startSpeed, -1_000, 1_000),
    startSize: normalizedRange(current.startSize, patch.startSize, 0, 1_000),
    startRotation: normalizedRange(current.startRotation, patch.startRotation, -Math.PI * 100, Math.PI * 100),
    gravity: vector3(patch.gravity, current.gravity, -1_000, 1_000),
    emission: {
      rateOverTime: finite(
        patch.emission?.rateOverTime,
        current.emission.rateOverTime,
        0,
        100_000,
      ),
      bursts: normalizeBursts(patch.emission?.bursts ?? current.emission.bursts),
    },
    shape: normalizeShape(patch.shape ?? current.shape),
    colorOverLifetime: {
      start: color4(patch.colorOverLifetime?.start, current.colorOverLifetime.start),
      end: color4(patch.colorOverLifetime?.end, current.colorOverLifetime.end),
    },
    sizeOverLifetime: normalizedRange(
      current.sizeOverLifetime,
      patch.sizeOverLifetime,
      0,
      100,
      false,
    ),
    velocityOverLifetime: {
      linear: vector3(
        patch.velocityOverLifetime?.linear,
        current.velocityOverLifetime.linear,
        -1_000,
        1_000,
      ),
      orbital: vector3(
        patch.velocityOverLifetime?.orbital,
        current.velocityOverLifetime.orbital,
        -1_000,
        1_000,
      ),
    },
    renderer: {
      mode:
        renderer.mode === "billboard" || renderer.mode === "stretched-billboard"
          ? renderer.mode
          : current.renderer.mode,
      blending:
        renderer.blending === "normal" || renderer.blending === "additive"
          ? renderer.blending
          : current.renderer.blending,
      sortMode:
        renderer.sortMode === "none" ||
        renderer.sortMode === "distance" ||
        renderer.sortMode === "youngest" ||
        renderer.sortMode === "oldest"
          ? renderer.sortMode
          : current.renderer.sortMode,
      ...(renderer.materialAssetId
        ? { materialAssetId: renderer.materialAssetId }
        : {}),
      ...(renderer.textureAssetId
        ? { textureAssetId: renderer.textureAssetId }
        : {}),
      castShadow: booleanValue(renderer.castShadow, current.renderer.castShadow),
      receiveShadow: booleanValue(
        renderer.receiveShadow,
        current.renderer.receiveShadow,
      ),
    },
  };
}

function normalizedRange(
  current: ParticleScalarRange,
  patch: Partial<ParticleScalarRange> | undefined,
  minimum: number,
  maximum: number,
  sort = true,
): ParticleScalarRange {
  const min = finite(patch?.min, current.min, minimum, maximum);
  const max = finite(patch?.max, current.max, minimum, maximum);
  return sort && min > max ? { min: max, max: min } : { min, max };
}

function normalizeBursts(value: ParticleBurst[]): ParticleBurst[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map((burst) => ({
    time: finite(burst?.time, 0, 0, 600),
    count: integer(burst?.count, 1, 1, 100_000),
    cycles: integer(burst?.cycles, 1, 1, 10_000),
    interval: finite(burst?.interval, 0, 0, 600),
  }));
}

function normalizeShape(shape: ParticleProperties["shape"]): ParticleProperties["shape"] {
  if (!shape || typeof shape !== "object") return { type: "point" };
  if (shape.type === "sphere") {
    return { type: "sphere", radius: finite(shape.radius, 0.5, 0, 10_000) };
  }
  if (shape.type === "cone") {
    return {
      type: "cone",
      radius: finite(shape.radius, 0.25, 0, 10_000),
      angle: finite(shape.angle, 25, 0, 90),
    };
  }
  if (shape.type === "box") {
    return { type: "box", size: vector3(shape.size, [1, 1, 1], 0, 10_000) };
  }
  return { type: "point" };
}

function cloneParticleProperties(value: ParticleProperties): ParticleProperties {
  return {
    ...value,
    startDelay: { ...value.startDelay },
    startLifetime: { ...value.startLifetime },
    startSpeed: { ...value.startSpeed },
    startSize: { ...value.startSize },
    startRotation: { ...value.startRotation },
    gravity: cloneVec3(value.gravity),
    emission: {
      rateOverTime: value.emission.rateOverTime,
      bursts: value.emission.bursts.map((burst) => ({ ...burst })),
    },
    shape:
      value.shape.type === "box"
        ? { ...value.shape, size: cloneVec3(value.shape.size) }
        : { ...value.shape },
    colorOverLifetime: {
      start: cloneColor4(value.colorOverLifetime.start),
      end: cloneColor4(value.colorOverLifetime.end),
    },
    sizeOverLifetime: { ...value.sizeOverLifetime },
    velocityOverLifetime: {
      linear: cloneVec3(value.velocityOverLifetime.linear),
      orbital: cloneVec3(value.velocityOverLifetime.orbital),
    },
    renderer: { ...value.renderer },
  };
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.round(finite(value, fallback, minimum, maximum));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function vector3(
  value: unknown,
  fallback: Vec3Like,
  minimum: number,
  maximum: number,
): Vec3Like {
  if (!Array.isArray(value) || value.length !== 3) return cloneVec3(fallback);
  return [
    finite(value[0], fallback[0], minimum, maximum),
    finite(value[1], fallback[1], minimum, maximum),
    finite(value[2], fallback[2], minimum, maximum),
  ];
}

function color4(value: unknown, fallback: Color4): Color4 {
  if (!Array.isArray(value) || value.length !== 4) return cloneColor4(fallback);
  return [
    finite(value[0], fallback[0], 0, 1),
    finite(value[1], fallback[1], 0, 1),
    finite(value[2], fallback[2], 0, 1),
    finite(value[3], fallback[3], 0, 1),
  ];
}

function cloneVec3(value: Vec3Like): Vec3Like {
  return [value[0], value[1], value[2]];
}

function cloneColor4(value: Color4): Color4 {
  return [value[0], value[1], value[2], value[3]];
}
