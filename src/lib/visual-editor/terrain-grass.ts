import {
  terrainCellHasHole,
  type TerrainGeometry,
} from "./terrain";

/**
 * Grass on Terrain.
 *
 * Blades are placed by rule rather than by painting: a layer says how dense it
 * is, which height band it lives in and how steep a face it will still grow on,
 * and the Terrain's own shape decides the rest. That is what makes a vegetated
 * Terrain a one-step job — the author picks a look, and slope and altitude do
 * the work that a hand-painted mask would otherwise have to.
 *
 * Nothing about a placement is stored. Positions come back from the seed and
 * the height field every time, so a Scene document stays the same size whether
 * a Terrain carries a thousand blades or fifty thousand, and the published
 * world regenerates the identical field from the same few numbers.
 */
export const TERRAIN_GRASS_TYPE_IDS = [
  "short-grass",
  "tall-grass",
  "wildflower",
  "dry-grass",
] as const;

export type TerrainGrassTypeId = (typeof TERRAIN_GRASS_TYPE_IDS)[number];

export type TerrainGrassType = {
  id: TerrainGrassTypeId;
  label: string;
  description: string;
  /** Blade height in metres before per-instance variation. */
  height: number;
  /** Blade width at the base, in metres. */
  width: number;
  /** Crossed cards per blade. One is the cheap default; more reads fuller. */
  cards: number;
  /** Rows along the blade. More rows buy a smoother arc, not a wider blade. */
  segments: number;
  /** How far the blade arcs over. Straight blades read as spikes. */
  curve: number;
  /** Metres beyond which the layer stops drawing. */
  cullDistance: number;
  baseColor: string;
  tipColor: string;
  /** How far the tip leans under a unit of wind. */
  sway: number;
  /**
   * How much sun passes through the blade when it stands between the eye and
   * the light. Grass without it reads as painted card stock: a leaf is thin
   * enough to glow, and that glow is most of what says "plant".
   */
  translucency: number;
  /** Default spread of per-blade tint, 0..1. Nothing in a field is one colour. */
  colorVariation: number;
  /** Blades per tuft. Grass grows in clumps; scattered singles read as hair. */
  clumpSize: number;
  /** Metres a tuft's blades spread around its centre. */
  clumpRadius: number;
};

/**
 * The colour and size an author may take away from the type.
 *
 * A type is a starting point, not a verdict. Every field here is optional and
 * absent by default, so a layer that has never been tuned carries nothing and
 * a Scene document stays the size it was; the moment an author touches one, it
 * and only it overrides the type.
 */
export type TerrainGrassAppearance = {
  baseColor?: string;
  tipColor?: string;
  /** 0..1 spread of per-blade tint. */
  colorVariation?: number;
  /** Multiplies the type's height. */
  heightScale?: number;
  /** Multiplies the type's blade width. */
  widthScale?: number;
  /**
   * 0..1 sky bounce the blades answer to.
   *
   * Foliage under an open sky is never unlit, even where a Scene supplies no
   * ambient of its own — and a Scene lit only by its skybox supplies exactly
   * that, which is how grass came out as black strands over lit ground. This
   * is the material's answer to the sky, so it belongs to the layer rather
   * than to the lighting contract, and an author can take it to zero.
   */
  fill?: number;
};

export type ResolvedTerrainGrassAppearance = {
  baseColor: string;
  tipColor: string;
  colorVariation: number;
  height: number;
  width: number;
  fill: number;
};

/** The sky bounce a layer uses until an author says otherwise. */
export const TERRAIN_GRASS_DEFAULT_FILL = 0.34;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * The numbers a blade is actually drawn with.
 *
 * One resolver for the viewport, the Inspector swatch and the published world,
 * so a layer an author tuned in Studio cannot arrive in the world wearing the
 * type's colours instead.
 */
export function resolveTerrainGrassAppearance(
  type: TerrainGrassType,
  appearance: TerrainGrassAppearance | undefined,
): ResolvedTerrainGrassAppearance {
  return {
    baseColor: isHexColor(appearance?.baseColor)
      ? appearance.baseColor
      : type.baseColor,
    tipColor: isHexColor(appearance?.tipColor)
      ? appearance.tipColor
      : type.tipColor,
    colorVariation: clamp(
      appearance?.colorVariation ?? type.colorVariation,
      0,
      1,
    ),
    height: type.height * clamp(appearance?.heightScale ?? 1, 0.2, 4),
    width: type.width * clamp(appearance?.widthScale ?? 1, 0.2, 4),
    fill: clamp(appearance?.fill ?? TERRAIN_GRASS_DEFAULT_FILL, 0, 1),
  };
}

/**
 * The catalog.
 *
 * Blades are wide enough to survive a pixel and taper only near the tip, and
 * the colours sit in the same register as a lit ground rather than well under
 * it. Both were the difference between a field of grass and a field of dark
 * hairs: a needle that thins to nothing from its base is a hair, and a blade
 * two stops darker than the ground it stands on reads as one whatever its
 * shape.
 */
export const TERRAIN_GRASS_TYPES: readonly TerrainGrassType[] = [
  {
    id: "short-grass",
    label: "短い芝",
    description: "足元を埋める短い芝です。広い面積に敷いても軽い種類です。",
    height: 0.26,
    width: 0.022,
    cards: 1,
    segments: 4,
    curve: 0.4,
    cullDistance: 34,
    baseColor: "#4f7d33",
    tipColor: "#96c45e",
    sway: 0.5,
    translucency: 0.5,
    colorVariation: 0.22,
    clumpSize: 5,
    clumpRadius: 0.26,
  },
  {
    id: "tall-grass",
    label: "背の高い草",
    description: "腰までの高さの草です。風で大きくしなり、原っぱらしくなります。",
    height: 0.62,
    width: 0.028,
    cards: 1,
    segments: 5,
    curve: 0.62,
    cullDistance: 46,
    baseColor: "#46702f",
    tipColor: "#a9cc64",
    sway: 1,
    translucency: 0.62,
    colorVariation: 0.26,
    clumpSize: 6,
    clumpRadius: 0.38,
  },
  {
    id: "wildflower",
    label: "花付きの草",
    description: "先端に花を持つ草です。密度を下げて他の草へ散らすと映えます。",
    height: 0.38,
    width: 0.024,
    cards: 2,
    segments: 4,
    curve: 0.28,
    cullDistance: 38,
    baseColor: "#4c7635",
    tipColor: "#f0dc7a",
    sway: 0.8,
    translucency: 0.78,
    colorVariation: 0.3,
    clumpSize: 3,
    clumpRadius: 0.34,
  },
  {
    id: "dry-grass",
    label: "枯れ草",
    description: "乾いた草です。高い場所や急な斜面に置くと荒れた地形に見えます。",
    height: 0.46,
    width: 0.026,
    cards: 1,
    segments: 5,
    curve: 0.7,
    cullDistance: 40,
    baseColor: "#8a7440",
    tipColor: "#dcc684",
    sway: 1.2,
    translucency: 0.66,
    colorVariation: 0.28,
    clumpSize: 5,
    clumpRadius: 0.42,
  },
];

export function getTerrainGrassType(
  typeId: string,
): TerrainGrassType | undefined {
  return TERRAIN_GRASS_TYPES.find((type) => type.id === typeId);
}

export type TerrainGrassLayer = {
  id: string;
  typeId: TerrainGrassTypeId;
  /** Blades per square metre of Terrain footprint. */
  density: number;
  /** World-height band this layer grows in. */
  heightRange: [number, number];
  /** Faces steeper than this many degrees stay bare. */
  slopeLimitDegrees: number;
  /** Fixes the placement. Two layers with different seeds never overlap. */
  seed: number;
  /**
   * Colour and size taken away from the type, for this layer only.
   *
   * Absent until an author changes something, so an untouched layer costs no
   * bytes and keeps following its type when the catalog is retuned.
   */
  appearance?: TerrainGrassAppearance;
  /**
   * Optional per-sample coverage, 0..1, in the height field's own row-major
   * order and resolution.
   *
   * Rules cannot express "not here". Absent, the layer is a uniform 1 and
   * behaves exactly as it did before painting existed, so an unpainted layer
   * carries no array at all and costs nothing.
   */
  mask?: number[];
};

/** Bilinear mask coverage at a Terrain-local point. 1 when unpainted. */
export function sampleTerrainGrassMask(
  terrain: TerrainGeometry,
  mask: readonly number[] | undefined,
  localX: number,
  localZ: number,
): number {
  if (!mask) return 1;
  const { width, depth, resolution } = terrain;
  if (mask.length !== resolution * resolution) return 1;
  const cells = resolution - 1;
  const u = ((localX + width / 2) / width) * cells;
  const v = ((localZ + depth / 2) / depth) * cells;
  const x0 = Math.min(Math.max(Math.floor(u), 0), cells);
  const z0 = Math.min(Math.max(Math.floor(v), 0), cells);
  const x1 = Math.min(x0 + 1, cells);
  const z1 = Math.min(z0 + 1, cells);
  const fx = Math.min(Math.max(u - x0, 0), 1);
  const fz = Math.min(Math.max(v - z0, 0), 1);
  const m00 = mask[z0 * resolution + x0] ?? 1;
  const m10 = mask[z0 * resolution + x1] ?? 1;
  const m01 = mask[z1 * resolution + x0] ?? 1;
  const m11 = mask[z1 * resolution + x1] ?? 1;
  return (
    m00 * (1 - fx) * (1 - fz) +
    m10 * fx * (1 - fz) +
    m01 * (1 - fx) * fz +
    m11 * fx * fz
  );
}

export const TERRAIN_GRASS_BRUSH_MODES = ["paint", "erase"] as const;
export type TerrainGrassBrushMode = (typeof TERRAIN_GRASS_BRUSH_MODES)[number];

export type TerrainGrassBrushOperation = {
  mode: TerrainGrassBrushMode;
  /** Terrain-local X/Z. */
  center: [number, number];
  radius: number;
  /** 0..1 coverage change at the brush centre. */
  strength: number;
};

/**
 * Paints or erases one layer's coverage.
 *
 * The stroke falls off toward the rim so a pass leaves a soft edge instead of
 * a stamped disc, which is what makes hand-placed grass read as grown rather
 * than cut out. The mask is created on first use, so a layer only starts
 * carrying an array once the author actually paints one.
 */
export function applyTerrainGrassBrush(
  terrain: TerrainGeometry,
  layer: TerrainGrassLayer,
  operation: TerrainGrassBrushOperation,
): TerrainGrassLayer {
  const { width, depth, resolution } = terrain;
  const radius = Math.max(operation.radius, 0);
  if (radius <= 0) return layer;
  const strength = Math.min(Math.max(operation.strength, 0), 1);
  if (strength <= 0) return layer;
  const length = resolution * resolution;
  const mask =
    layer.mask?.length === length ? [...layer.mask] : new Array(length).fill(1);
  const xStep = width / (resolution - 1);
  const zStep = depth / (resolution - 1);
  let changed = false;

  for (let z = 0; z < resolution; z += 1) {
    const localZ = z * zStep - depth / 2;
    for (let x = 0; x < resolution; x += 1) {
      const localX = x * xStep - width / 2;
      const distance = Math.hypot(
        localX - operation.center[0],
        localZ - operation.center[1],
      );
      if (distance > radius) continue;
      const falloff = 1 - (distance / radius) ** 2;
      const delta = strength * falloff;
      const index = z * resolution + x;
      const current = mask[index] ?? 1;
      const next =
        operation.mode === "paint"
          ? Math.min(current + delta, 1)
          : Math.max(current - delta, 0);
      if (next !== current) {
        mask[index] = next;
        changed = true;
      }
    }
  }

  if (!changed) return layer;
  // A mask that is 1 everywhere is the same as no mask, and dropping it keeps
  // the Scene document small when a stroke is fully undone by painting back.
  return mask.every((value) => value >= 1)
    ? { ...layer, mask: undefined }
    : { ...layer, mask };
}

export function isTerrainGrassMask(
  terrain: Pick<TerrainGeometry, "resolution">,
  value: unknown,
): boolean {
  return (
    Array.isArray(value) &&
    value.length === terrain.resolution * terrain.resolution &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        entry >= 0 &&
        entry <= 1,
    )
  );
}

/**
 * One layer may not exceed this many blades. A Terrain scaled up after the
 * density was chosen would otherwise turn a reasonable number into millions,
 * and the author would meet it as a frozen editor rather than as a limit.
 *
 * The number is a triangle budget, not a taste, and it moved when the blade
 * got cheaper: a single tapered card of four to five rows costs roughly a
 * third of the three crossed cards it replaced, so the same field of triangles
 * now buys close to three times the blades. Spending that on count is what
 * closes the gaps — a large Terrain used to run out of blades long before it
 * ran out of ground, and thin cover on wide ground is what read as a balding
 * field.
 */
export const TERRAIN_GRASS_MAX_INSTANCES = 140_000;

export type TerrainGrassInstances = {
  /** Interleaved xyz per blade, in Terrain-local space. */
  positions: Float32Array;
  /** Y rotation per blade, in radians. */
  rotations: Float32Array;
  /** Uniform scale per blade. */
  scales: Float32Array;
  placed: number;
  /** Candidates the density asked for before the rules and the cap applied. */
  requested: number;
  /** True when the cap, not the rules, decided the count. */
  clampedByLimit: boolean;
};

/** Integer hash. Small, exact in float64, and identical wherever it runs. */
function hash(seed: number, index: number, salt: number): number {
  let value = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value ^= Math.imul(salt | 0, 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  // Unsigned, then to [0, 1).
  return (value >>> 0) / 4294967296;
}

/** Bilinear height at a Terrain-local point, matching the rendered surface. */
export function sampleTerrainHeight(
  terrain: TerrainGeometry,
  localX: number,
  localZ: number,
): number {
  const { width, depth, resolution, heights } = terrain;
  const cells = resolution - 1;
  const u = ((localX + width / 2) / width) * cells;
  const v = ((localZ + depth / 2) / depth) * cells;
  const x0 = Math.min(Math.max(Math.floor(u), 0), cells);
  const z0 = Math.min(Math.max(Math.floor(v), 0), cells);
  const x1 = Math.min(x0 + 1, cells);
  const z1 = Math.min(z0 + 1, cells);
  const fx = Math.min(Math.max(u - x0, 0), 1);
  const fz = Math.min(Math.max(v - z0, 0), 1);
  const h00 = heights[z0 * resolution + x0] ?? 0;
  const h10 = heights[z0 * resolution + x1] ?? 0;
  const h01 = heights[z1 * resolution + x0] ?? 0;
  const h11 = heights[z1 * resolution + x1] ?? 0;
  return (
    h00 * (1 - fx) * (1 - fz) +
    h10 * fx * (1 - fz) +
    h01 * (1 - fx) * fz +
    h11 * fx * fz
  );
}

/** Surface tilt in degrees, from the height field's local gradient. */
export function sampleTerrainSlopeDegrees(
  terrain: TerrainGeometry,
  localX: number,
  localZ: number,
): number {
  const stepX = terrain.width / Math.max(terrain.resolution - 1, 1);
  const stepZ = terrain.depth / Math.max(terrain.resolution - 1, 1);
  const dx =
    (sampleTerrainHeight(terrain, localX + stepX, localZ) -
      sampleTerrainHeight(terrain, localX - stepX, localZ)) /
    (2 * stepX);
  const dz =
    (sampleTerrainHeight(terrain, localX, localZ + stepZ) -
      sampleTerrainHeight(terrain, localX, localZ - stepZ)) /
    (2 * stepZ);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

function candidateCount(terrain: TerrainGeometry, density: number): number {
  const area = Math.max(terrain.width, 0) * Math.max(terrain.depth, 0);
  return Math.max(0, Math.floor(area * Math.max(density, 0)));
}

/** How a type's blades gather into tufts. Unknown types scatter singly. */
export type TerrainGrassClump = { size: number; radius: number };

export function terrainGrassClump(typeId: string): TerrainGrassClump {
  const type = getTerrainGrassType(typeId);
  return {
    size: Math.max(Math.floor(type?.clumpSize ?? 1), 1),
    radius: Math.max(type?.clumpRadius ?? 0, 0),
  };
}

/**
 * Places one layer's blades.
 *
 * Candidate positions depend only on the seed and the candidate's index, never
 * on the density, so raising the density adds blades between the existing ones
 * instead of moving the field the author already approved of — the same rule
 * the Sky's star layers and the Water's wave layers follow.
 *
 * Candidates arrive in tufts rather than one at a time. A blade standing on
 * its own with clear ground all round it is a hair; grass grows in clumps, and
 * a handful of blades sharing a root is what the eye reads as a plant. Each
 * tuft's centre comes from the tuft's index and each blade's offset from its
 * own, so the density rule above survives intact: a denser layer adds blades
 * to the tufts that are already there and starts new ones between them.
 */
export function generateTerrainGrassInstances(
  terrain: TerrainGeometry,
  layer: TerrainGrassLayer,
  maxInstances: number = TERRAIN_GRASS_MAX_INSTANCES,
  clump: TerrainGrassClump = terrainGrassClump(layer.typeId),
): TerrainGrassInstances {
  const requested = candidateCount(terrain, layer.density);
  const limit = Math.max(0, Math.floor(maxInstances));
  const positions: number[] = [];
  const rotations: number[] = [];
  const scales: number[] = [];
  const [minHeight, maxHeight] = layer.heightRange;
  const low = Math.min(minHeight, maxHeight);
  const high = Math.max(minHeight, maxHeight);
  const slopeLimit = Math.max(layer.slopeLimitDegrees, 0);
  const cells = terrain.resolution - 1;
  const clumpSize = Math.max(Math.floor(clump.size), 1);
  const clumpRadius = Math.max(clump.radius, 0);
  const halfWidth = terrain.width / 2;
  const halfDepth = terrain.depth / 2;

  for (let index = 0; index < requested; index += 1) {
    if (positions.length / 3 >= limit) break;
    const tuft = Math.floor(index / clumpSize);
    const tuftX = (hash(layer.seed, tuft, 6) - 0.5) * terrain.width;
    const tuftZ = (hash(layer.seed, tuft, 7) - 0.5) * terrain.depth;
    // Square-rooted radius keeps a tuft evenly filled rather than piling its
    // blades onto the centre, which would put a bald ring around every clump.
    const spreadAngle = hash(layer.seed, index, 1) * Math.PI * 2;
    const spreadRadius =
      Math.sqrt(hash(layer.seed, index, 2)) * clumpRadius;
    const localX = Math.min(
      Math.max(tuftX + Math.cos(spreadAngle) * spreadRadius, -halfWidth),
      halfWidth,
    );
    const localZ = Math.min(
      Math.max(tuftZ + Math.sin(spreadAngle) * spreadRadius, -halfDepth),
      halfDepth,
    );

    // A hole is a removed part of the surface, so nothing may stand on it.
    const cellX = Math.min(
      Math.max(Math.floor(((localX + terrain.width / 2) / terrain.width) * cells), 0),
      cells - 1,
    );
    const cellZ = Math.min(
      Math.max(Math.floor(((localZ + terrain.depth / 2) / terrain.depth) * cells), 0),
      cells - 1,
    );
    if (terrainCellHasHole(terrain, cellX, cellZ)) continue;

    const height = sampleTerrainHeight(terrain, localX, localZ);
    if (height < low || height > high) continue;
    if (sampleTerrainSlopeDegrees(terrain, localX, localZ) > slopeLimit) continue;
    // Coverage is a per-candidate probability drawn from the candidate's own
    // hash, so painting thins a patch out rather than moving the blades that
    // remain, and raising the density still fills in around them.
    if (hash(layer.seed, index, 5) >= sampleTerrainGrassMask(terrain, layer.mask, localX, localZ)) {
      continue;
    }

    positions.push(localX, height, localZ);
    rotations.push(hash(layer.seed, index, 3) * Math.PI * 2);
    // Even a uniform species is never one size, and the variation is what
    // keeps a dense field from reading as a repeated stamp.
    scales.push(0.7 + hash(layer.seed, index, 4) * 0.6);
  }

  return {
    positions: new Float32Array(positions),
    rotations: new Float32Array(rotations),
    scales: new Float32Array(scales),
    placed: scales.length,
    requested,
    clampedByLimit: requested > 0 && scales.length >= limit,
  };
}

export function isTerrainGrassLayer(value: unknown): value is TerrainGrassLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as Partial<TerrainGrassLayer>;
  return (
    typeof layer.id === "string" &&
    layer.id.trim().length > 0 &&
    typeof layer.typeId === "string" &&
    TERRAIN_GRASS_TYPE_IDS.some((id) => id === layer.typeId) &&
    typeof layer.density === "number" &&
    Number.isFinite(layer.density) &&
    layer.density >= 0 &&
    Array.isArray(layer.heightRange) &&
    layer.heightRange.length === 2 &&
    layer.heightRange.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    ) &&
    typeof layer.slopeLimitDegrees === "number" &&
    Number.isFinite(layer.slopeLimitDegrees) &&
    layer.slopeLimitDegrees >= 0 &&
    typeof layer.seed === "number" &&
    Number.isFinite(layer.seed) &&
    isTerrainGrassAppearance(layer.appearance) &&
    (layer.mask === undefined ||
      (Array.isArray(layer.mask) &&
        layer.mask.every(
          (entry) =>
            typeof entry === "number" &&
            Number.isFinite(entry) &&
            entry >= 0 &&
            entry <= 1,
        )))
  );
}

/** An absent override is valid; a present one must be usable as written. */
function isTerrainGrassAppearance(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const appearance = value as Record<string, unknown>;
  const colors: ReadonlyArray<"baseColor" | "tipColor"> = [
    "baseColor",
    "tipColor",
  ];
  for (const key of colors) {
    const entry = appearance[key];
    if (entry !== undefined && !isHexColor(entry)) return false;
  }
  const numbers: ReadonlyArray<
    ["colorVariation" | "heightScale" | "widthScale" | "fill", number, number]
  > = [
    ["colorVariation", 0, 1],
    ["heightScale", 0.2, 4],
    ["widthScale", 0.2, 4],
    ["fill", 0, 1],
  ];
  for (const [key, low, high] of numbers) {
    const entry = appearance[key];
    if (entry === undefined) continue;
    if (typeof entry !== "number" || !Number.isFinite(entry)) return false;
    if (entry < low || entry > high) return false;
  }
  return true;
}

/**
 * Merges one appearance change into a layer, dropping the override entirely
 * when nothing is left.
 *
 * An empty change means "back to the type", so the layer loses its
 * `appearance` key rather than keeping an empty object: a Scene document that
 * has been tuned and untuned again should weigh what it did before the tuning.
 * The Inspector and the MCP tool both go through here so a layer edited by an
 * agent and one edited by hand cannot end up shaped differently.
 */
export function applyTerrainGrassAppearance(
  layer: TerrainGrassLayer,
  change: TerrainGrassAppearance,
): TerrainGrassLayer {
  const merged: TerrainGrassAppearance = Object.keys(change).length
    ? { ...layer.appearance, ...change }
    : {};
  const cleaned = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as TerrainGrassAppearance;
  if (Object.keys(cleaned).length === 0) {
    const { appearance: _dropped, ...rest } = layer;
    return rest;
  }
  return { ...layer, appearance: cleaned };
}

export type TerrainGrassPreset = {
  id: string;
  label: string;
  description: string;
  layers: readonly Omit<TerrainGrassLayer, "id">[];
};

/**
 * One-step vegetation.
 *
 * Each preset is a small stack of layers whose rules already disagree with one
 * another — a short base everywhere, taller clumps on the gentle ground,
 * flowers thinly on top — because a single uniform layer is what makes
 * procedural grass look procedural. The author picks the look, not the numbers.
 */
export const TERRAIN_GRASS_PRESETS: readonly TerrainGrassPreset[] = [
  {
    id: "meadow",
    label: "草原",
    description:
      "短い芝を一面に敷き、緩やかな所へ背の高い草と花を重ねます。まずこれを選べば草地になります。",
    layers: [
      {
        typeId: "short-grass",
        density: 26,
        heightRange: [-1000, 1000],
        slopeLimitDegrees: 42,
        seed: 1301,
      },
      {
        typeId: "tall-grass",
        density: 7,
        heightRange: [-1000, 1000],
        slopeLimitDegrees: 26,
        seed: 2207,
      },
      {
        typeId: "wildflower",
        density: 1.4,
        heightRange: [-1000, 1000],
        slopeLimitDegrees: 20,
        seed: 3319,
      },
    ],
  },
  {
    id: "hillside",
    label: "丘の斜面",
    description:
      "低い所を芝、高い所を枯れ草にします。起伏のあるTerrainほど差がはっきり出ます。",
    layers: [
      {
        typeId: "short-grass",
        density: 20,
        heightRange: [-1000, 6],
        slopeLimitDegrees: 38,
        seed: 4127,
      },
      {
        typeId: "dry-grass",
        density: 9,
        heightRange: [4, 1000],
        slopeLimitDegrees: 48,
        seed: 5231,
      },
    ],
  },
  {
    id: "sparse-dry",
    label: "まばらな枯れ地",
    description:
      "枯れ草だけを薄く置きます。荒地や砂地のTerrainに向きます。",
    layers: [
      {
        typeId: "dry-grass",
        density: 4,
        heightRange: [-1000, 1000],
        slopeLimitDegrees: 40,
        seed: 6337,
      },
    ],
  },
];

export function getTerrainGrassPreset(
  presetId: string,
): TerrainGrassPreset | undefined {
  return TERRAIN_GRASS_PRESETS.find((preset) => preset.id === presetId);
}

/** Expands a preset into layers with stable ids for the Scene document. */
export function createTerrainGrassLayers(
  preset: TerrainGrassPreset,
): TerrainGrassLayer[] {
  return preset.layers.map((layer, index) => ({
    ...layer,
    id: `grass-${preset.id}-${index}`,
    heightRange: [layer.heightRange[0], layer.heightRange[1]],
  }));
}
