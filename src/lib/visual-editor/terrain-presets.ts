import {
  TERRAIN_RESOLUTION_MAX,
  TERRAIN_RESOLUTION_MIN,
  createTerrainGeometry,
  type TerrainGeometry,
} from "./terrain";
import {
  createTerrainGrassLayers,
  getTerrainGrassPreset,
  type TerrainGrassLayer,
} from "./terrain-grass";

/**
 * Ready-made Terrain.
 *
 * Terrain is the one thing in Studio that is hard to start: a new one is a
 * perfectly flat plate, and it takes a sculpting session before it looks like
 * anywhere. These presets hand the author a shaped, planted Terrain from the
 * Create menu, so the first thing they see is a place rather than a slab they
 * still owe work to.
 *
 * The shapes are generated rather than stored. A height field for a 129-sample
 * Terrain is sixteen thousand numbers; keeping the recipe instead means adding
 * a preset costs a few lines, and the author can immediately sculpt on top
 * because what they receive is an ordinary Terrain.
 */
export type TerrainPresetId =
  | "meadow-plain"
  | "rolling-hills"
  | "valley"
  | "dry-plateau"
  | "island"
  | "highland-ridge"
  | "basin-lake"
  | "dunes";

export type TerrainPreset = {
  id: TerrainPresetId;
  label: string;
  description: string;
  width: number;
  depth: number;
  resolution: number;
  /** Grass preset applied on top of the generated shape. */
  grassPresetId: string | null;
  /** Height in metres at a point, in Terrain-local coordinates. */
  height: (localX: number, localZ: number) => number;
};

/**
 * Smooth, seam-free hills.
 *
 * Summed sines rather than noise: the result is continuous everywhere, has no
 * grid direction to it, and is cheap enough to regenerate whenever a preset is
 * placed. Incommensurate frequencies keep it from repeating inside one Terrain.
 */
function hills(
  localX: number,
  localZ: number,
  amplitude: number,
  scale: number,
): number {
  const x = localX / scale;
  const z = localZ / scale;
  return (
    amplitude *
    (Math.sin(x) * Math.cos(z * 0.83) * 0.55 +
      Math.sin(x * 0.41 + 1.7) * Math.cos(z * 0.37 - 0.9) * 0.75 +
      Math.sin(x * 1.93 - 0.4) * Math.cos(z * 2.11 + 1.1) * 0.16)
  );
}

/** Fades a shape out at the border so a Terrain never ends on a cliff. */
function edgeFalloff(
  localX: number,
  localZ: number,
  width: number,
  depth: number,
): number {
  const u = Math.abs(localX) / (width / 2);
  const v = Math.abs(localZ) / (depth / 2);
  const edge = Math.max(u, v);
  return 1 - smoothstep(0.72, 1, edge);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

const BASE_PRESETS: readonly TerrainPreset[] = [
  {
    id: "meadow-plain",
    label: "草原",
    description:
      "ゆるやかな起伏の草地です。歩き回るワールドの土台に向きます。",
    width: 80,
    depth: 80,
    resolution: 97,
    grassPresetId: "meadow",
    height: (x, z) => hills(x, z, 0.9, 14) * edgeFalloff(x, z, 80, 80),
  },
  {
    id: "rolling-hills",
    label: "なだらかな丘",
    description:
      "はっきりした起伏の丘です。低い所に芝、高い所に枯れ草が乗ります。",
    width: 120,
    depth: 120,
    resolution: 129,
    grassPresetId: "hillside",
    height: (x, z) => hills(x, z, 5.5, 22) * edgeFalloff(x, z, 120, 120),
  },
  {
    id: "valley",
    label: "谷",
    description:
      "中央がくぼんだ谷です。底に水面を置くと川や湖になります。",
    width: 120,
    depth: 120,
    resolution: 129,
    grassPresetId: "meadow",
    height: (x, z) => {
      // A trough along X, so the floor reads as somewhere to walk rather than
      // as a bowl the author has to carve an exit from.
      const across = Math.abs(z) / 60;
      const walls = smoothstep(0.18, 0.92, across) * 9;
      return (walls + hills(x, z, 1.1, 16)) * edgeFalloff(x, z, 120, 120);
    },
  },
  {
    id: "dry-plateau",
    label: "乾いた台地",
    description:
      "平らな面と段差のある乾いた土地です。まばらな枯れ草だけが生えます。",
    width: 100,
    depth: 100,
    resolution: 113,
    grassPresetId: "sparse-dry",
    height: (x, z) => {
      const step = Math.round(hills(x, z, 2.2, 26));
      return (step * 1.6 + hills(x, z, 0.35, 7)) * edgeFalloff(x, z, 100, 100);
    },
  },
];

const EXTRA_PRESETS: readonly TerrainPreset[] = [
  {
    id: "island",
    label: "島",
    description:
      "周囲が落ち込む島です。外周へ水面を置くと海に浮かびます。",
    width: 100,
    depth: 100,
    resolution: 113,
    grassPresetId: "meadow",
    height: (x, z) => {
      const radius = Math.hypot(x, z) / 42;
      const dome = (1 - smoothstep(0.15, 1, radius)) * 7;
      return dome + hills(x, z, 0.9, 13) * (1 - smoothstep(0.5, 1, radius));
    },
  },
  {
    id: "highland-ridge",
    label: "尾根",
    description:
      "細長い尾根が走る高地です。斜面が急なので枯れ草が上へ回ります。",
    width: 140,
    depth: 100,
    resolution: 129,
    grassPresetId: "hillside",
    height: (x, z) => {
      const ridge = Math.exp(-((z / 18) ** 2)) * 12;
      return (ridge + hills(x, z, 1.6, 15)) * edgeFalloff(x, z, 140, 100);
    },
  },
  {
    id: "basin-lake",
    label: "湖のくぼ地",
    description:
      "中央が深く落ちたくぼ地です。底へ水面を置くと湖になります。",
    width: 110,
    depth: 110,
    resolution: 129,
    grassPresetId: "meadow",
    height: (x, z) => {
      const radius = Math.hypot(x, z) / 34;
      const basin = smoothstep(0, 1, Math.min(radius, 1)) * 8 - 8;
      return (basin + 8 + hills(x, z, 1, 15)) * edgeFalloff(x, z, 110, 110);
    },
  },
  {
    id: "dunes",
    label: "砂丘",
    description:
      "一定方向に連なる砂丘です。草はごくまばらにしか生えません。",
    width: 130,
    depth: 130,
    resolution: 129,
    grassPresetId: "sparse-dry",
    height: (x, z) => {
      const crest = Math.sin(x / 11 + Math.sin(z / 26) * 1.3) * 3.4;
      return (crest + hills(x, z, 0.7, 9)) * edgeFalloff(x, z, 130, 130);
    },
  },
];

export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  ...BASE_PRESETS,
  ...EXTRA_PRESETS,
];

export function getTerrainPreset(
  presetId: string,
): TerrainPreset | undefined {
  return TERRAIN_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * Builds the Terrain a preset describes.
 *
 * The result is an ordinary Terrain with ordinary grass layers, so everything
 * the author can do to a hand-made one — sculpt it, add a hole, change the
 * density — works on it immediately.
 */
export function createTerrainFromPreset(
  preset: TerrainPreset,
  /** Overrides the preset's own grass. `null` places the Terrain bare. */
  grassPresetId?: string | null,
): TerrainGeometry {
  const resolution = Math.min(
    Math.max(Math.round(preset.resolution), TERRAIN_RESOLUTION_MIN),
    TERRAIN_RESOLUTION_MAX,
  );
  const heights: number[] = new Array(resolution * resolution);
  const xStep = preset.width / (resolution - 1);
  const zStep = preset.depth / (resolution - 1);
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      heights[z * resolution + x] = preset.height(
        x * xStep - preset.width / 2,
        z * zStep - preset.depth / 2,
      );
    }
  }
  const grass = terrainPresetGrassLayers(
    grassPresetId === undefined ? preset : { ...preset, grassPresetId },
  );
  return createTerrainGeometry({
    width: preset.width,
    depth: preset.depth,
    resolution,
    heights,
    ...(grass.length > 0 ? { grass } : {}),
  });
}

export function terrainPresetGrassLayers(
  preset: TerrainPreset,
): TerrainGrassLayer[] {
  if (!preset.grassPresetId) return [];
  const grassPreset = getTerrainGrassPreset(preset.grassPresetId);
  return grassPreset ? createTerrainGrassLayers(grassPreset) : [];
}
