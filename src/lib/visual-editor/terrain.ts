/**
 * Pure terrain authoring primitives shared by the Inspector, MCP tools, the
 * Scene View, and generated runtime output. Terrain keeps sampled heights in
 * the Scene document so every edit is deterministic and undoable.
 */

export const TERRAIN_MATERIAL_SLOT = "terrain" as const;

export const TERRAIN_RESOLUTION_MIN = 9;
/** 257 samples keeps an authored Terrain responsive while supporting real detail. */
export const TERRAIN_RESOLUTION_MAX = 257;
export const TERRAIN_SIZE_MIN = 0.5;
export const TERRAIN_SIZE_MAX = 512;
export const TERRAIN_HEIGHT_ABSOLUTE_MAX = 256;

import type { TerrainGrassLayer } from "./terrain-grass";

export type TerrainGeometry = {
  width: number;
  depth: number;
  /** Number of samples along each horizontal axis. */
  resolution: number;
  /** Row-major heights, ordered from the local -Z edge toward +Z. */
  heights: number[];
  /**
   * Row-major cell mask. `true` removes the two triangles for that cell.
   * It is optional so Terrain documents authored before holes were introduced
   * remain valid and render as a solid surface.
   */
  holes?: boolean[];
  /**
   * Rule-placed vegetation. Only the rules are stored; the blades themselves
   * are regenerated from the seed and this height field, so a densely planted
   * Terrain costs no more document than a bare one.
   */
  grass?: TerrainGrassLayer[];
};

export type TerrainGeometryOptions = Partial<TerrainGeometry>;

export const TERRAIN_BRUSH_KINDS = [
  "raise",
  "lower",
  "flatten",
  "smooth",
  "stamp",
  "hole-add",
  "hole-remove",
] as const;

export type TerrainBrushKind = (typeof TERRAIN_BRUSH_KINDS)[number];

export type TerrainBrushOperation = {
  kind: TerrainBrushKind;
  /** Local Terrain X/Z coordinates. */
  center: [number, number];
  radius: number;
  strength: number;
  /** Required by flatten and stamp; ignored by the other brushes. */
  targetHeight?: number;
  /** 0 is a hard brush and 1 is the softest edge. */
  falloff?: number;
};

/** Active Scene View brush configuration; its center is resolved from the raycast. */
export type TerrainViewportEditing = Pick<
  TerrainBrushOperation,
  "kind" | "radius" | "strength" | "targetHeight" | "falloff"
> & {
  entityId: string;
  componentId: string;
};

export type TerrainMeshBuffers = {
  positions: Float32Array;
  indices: Uint32Array;
};

export type TerrainHeightRange = {
  min: number;
  max: number;
};

const DEFAULT_TERRAIN_WIDTH = 16;
const DEFAULT_TERRAIN_DEPTH = 16;
const DEFAULT_TERRAIN_RESOLUTION = 33;

export function createTerrainGeometry(
  options: TerrainGeometryOptions = {},
): TerrainGeometry {
  const width = terrainSize(options.width, DEFAULT_TERRAIN_WIDTH);
  const depth = terrainSize(options.depth, DEFAULT_TERRAIN_DEPTH);
  const resolution = terrainResolution(options.resolution, DEFAULT_TERRAIN_RESOLUTION);
  const length = resolution * resolution;
  const heights =
    Array.isArray(options.heights) &&
    options.heights.length === length &&
    options.heights.every(isTerrainHeight)
      ? options.heights.map((height) => clampHeight(height))
      : Array.from({ length }, () => 0);
  const holeLength = (resolution - 1) * (resolution - 1);
  const holes =
    Array.isArray(options.holes) &&
    options.holes.length === holeLength &&
    options.holes.every((hole) => typeof hole === "boolean")
      ? [...options.holes]
      : Array.from({ length: holeLength }, () => false);
  const grass = Array.isArray(options.grass) ? [...options.grass] : undefined;
  return grass
    ? { width, depth, resolution, heights, holes, grass }
    : { width, depth, resolution, heights, holes };
}

export function isTerrainGeometry(value: unknown): value is TerrainGeometry {
  if (!value || typeof value !== "object") return false;
  const terrain = value as Partial<TerrainGeometry>;
  return (
    isTerrainSize(terrain.width) &&
    isTerrainSize(terrain.depth) &&
    isTerrainResolution(terrain.resolution) &&
    Array.isArray(terrain.heights) &&
    terrain.heights.length === terrain.resolution * terrain.resolution &&
    terrain.heights.every(isTerrainHeight) &&
    (terrain.holes === undefined ||
      (Array.isArray(terrain.holes) &&
        terrain.holes.length === (terrain.resolution - 1) * (terrain.resolution - 1) &&
        terrain.holes.every((hole) => typeof hole === "boolean")))
  );
}

export function terrainHeightRange(terrain: TerrainGeometry): TerrainHeightRange {
  let min = 0;
  let max = 0;
  for (const height of terrain.heights) {
    min = Math.min(min, height);
    max = Math.max(max, height);
  }
  return { min, max };
}

/** Builds a horizontal X/Z grid with upward-facing triangle winding. */
export function createTerrainMeshBuffers(
  terrain: TerrainGeometry,
): TerrainMeshBuffers {
  const { width, depth, resolution, heights } = terrain;
  const positions = new Float32Array(resolution * resolution * 3);
  const indices: number[] = [];
  const xStep = width / (resolution - 1);
  const zStep = depth / (resolution - 1);

  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const vertex = z * resolution + x;
      const offset = vertex * 3;
      positions[offset] = x * xStep - width / 2;
      positions[offset + 1] = heights[vertex] ?? 0;
      positions[offset + 2] = z * zStep - depth / 2;
    }
  }

  for (let z = 0; z < resolution - 1; z += 1) {
    for (let x = 0; x < resolution - 1; x += 1) {
      if (terrainCellHasHole(terrain, x, z)) continue;
      const topLeft = z * resolution + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + resolution;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      );
    }
  }

  return { positions, indices: new Uint32Array(indices) };
}

/** Returns the stable row-major index for a Terrain cell, or `-1` outside it. */
export function terrainCellIndex(
  terrain: Pick<TerrainGeometry, "resolution">,
  x: number,
  z: number,
): number {
  const cells = terrain.resolution - 1;
  return x >= 0 && z >= 0 && x < cells && z < cells ? z * cells + x : -1;
}

export function terrainCellHasHole(
  terrain: TerrainGeometry,
  x: number,
  z: number,
): boolean {
  const index = terrainCellIndex(terrain, x, z);
  return index >= 0 && terrain.holes?.[index] === true;
}

/**
 * Changes Terrain dimensions or sample density without throwing existing
 * sculpting away. Heights are bilinearly resampled and holes use nearest-cell
 * sampling, matching the distinct continuous/discrete nature of each map.
 */
export function resampleTerrainGeometry(
  terrain: TerrainGeometry,
  options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
): TerrainGeometry {
  if (!isTerrainGeometry(terrain)) return terrain;
  const width = terrainSize(options.width, terrain.width);
  const depth = terrainSize(options.depth, terrain.depth);
  const resolution = terrainResolution(options.resolution, terrain.resolution);
  if (
    width === terrain.width &&
    depth === terrain.depth &&
    resolution === terrain.resolution
  ) {
    return terrain;
  }
  const heights = Array.from({ length: resolution * resolution }, (_, index) => {
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    return sampleTerrainHeight(
      terrain,
      resolution === 1 ? 0 : x / (resolution - 1),
      resolution === 1 ? 0 : z / (resolution - 1),
    );
  });
  const cells = resolution - 1;
  const holes = Array.from({ length: cells * cells }, (_, index) => {
    const x = index % cells;
    const z = Math.floor(index / cells);
    const sourceCells = terrain.resolution - 1;
    const sourceX = Math.min(
      sourceCells - 1,
      Math.max(0, Math.round(((x + 0.5) / cells) * sourceCells - 0.5)),
    );
    const sourceZ = Math.min(
      sourceCells - 1,
      Math.max(0, Math.round(((z + 0.5) / cells) * sourceCells - 0.5)),
    );
    return terrainCellHasHole(terrain, sourceX, sourceZ);
  });
  return { width, depth, resolution, heights, holes };
}

/** Applies one deterministic brush stamp without mutating the original terrain. */
export function applyTerrainBrush(
  terrain: TerrainGeometry,
  operation: TerrainBrushOperation,
): TerrainGeometry {
  if (!isTerrainGeometry(terrain) || !isTerrainBrushOperation(operation)) {
    return terrain;
  }
  const source = terrain.heights;
  const heights = [...source];
  const holes = terrain.holes
    ? [...terrain.holes]
    : Array.from({ length: (terrain.resolution - 1) ** 2 }, () => false);
  const resolution = terrain.resolution;
  const xStep = terrain.width / (resolution - 1);
  const zStep = terrain.depth / (resolution - 1);
  const [centerX, centerZ] = operation.center;
  const minX = Math.max(0, Math.floor((centerX - operation.radius + terrain.width / 2) / xStep));
  const maxX = Math.min(resolution - 1, Math.ceil((centerX + operation.radius + terrain.width / 2) / xStep));
  const minZ = Math.max(0, Math.floor((centerZ - operation.radius + terrain.depth / 2) / zStep));
  const maxZ = Math.min(resolution - 1, Math.ceil((centerZ + operation.radius + terrain.depth / 2) / zStep));

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const localX = x * xStep - terrain.width / 2;
      const localZ = z * zStep - terrain.depth / 2;
      const distance = Math.hypot(localX - centerX, localZ - centerZ);
      if (distance > operation.radius) continue;
      const falloff = terrainBrushFalloff(
        distance / operation.radius,
        operation.falloff,
      );
      const index = z * resolution + x;
      const current = source[index] ?? 0;
      if (operation.kind === "raise") {
        heights[index] = clampHeight(current + operation.strength * falloff);
      } else if (operation.kind === "lower") {
        heights[index] = clampHeight(current - operation.strength * falloff);
      } else if (operation.kind === "flatten") {
        const target = operation.targetHeight ?? 0;
        heights[index] = clampHeight(
          current + (target - current) * Math.min(1, operation.strength) * falloff,
        );
      } else if (operation.kind === "smooth") {
        const average = averageTerrainNeighbourhood(source, resolution, x, z);
        heights[index] = clampHeight(
          current + (average - current) * Math.min(1, operation.strength) * falloff,
        );
      } else if (operation.kind === "stamp") {
        const target = operation.targetHeight ?? 0;
        heights[index] = clampHeight(
          current + (target - current) * Math.min(1, operation.strength) * falloff,
        );
      }
    }
  }

  if (operation.kind === "hole-add" || operation.kind === "hole-remove") {
    const cells = resolution - 1;
    for (let z = Math.max(0, minZ - 1); z < Math.min(cells, maxZ + 1); z += 1) {
      for (let x = Math.max(0, minX - 1); x < Math.min(cells, maxX + 1); x += 1) {
        const localX = (x + 0.5) * xStep - terrain.width / 2;
        const localZ = (z + 0.5) * zStep - terrain.depth / 2;
        if (Math.hypot(localX - centerX, localZ - centerZ) > operation.radius) continue;
        const index = terrainCellIndex(terrain, x, z);
        holes[index] = operation.kind === "hole-add";
      }
    }
  }

  return { ...terrain, heights, holes };
}

export function isTerrainBrushOperation(
  value: unknown,
): value is TerrainBrushOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<TerrainBrushOperation>;
  return (
    TERRAIN_BRUSH_KINDS.includes(operation.kind as TerrainBrushKind) &&
    Array.isArray(operation.center) &&
    operation.center.length === 2 &&
    operation.center.every((coordinate) => Number.isFinite(coordinate)) &&
    typeof operation.radius === "number" &&
    Number.isFinite(operation.radius) &&
    operation.radius > 0 &&
    typeof operation.strength === "number" &&
    Number.isFinite(operation.strength) &&
    operation.strength > 0 &&
    operation.strength <= TERRAIN_HEIGHT_ABSOLUTE_MAX &&
    ((operation.kind !== "flatten" && operation.kind !== "stamp") ||
      isTerrainHeight(operation.targetHeight)) &&
    (operation.targetHeight === undefined || isTerrainHeight(operation.targetHeight))
    &&
    (operation.falloff === undefined ||
      (typeof operation.falloff === "number" &&
        Number.isFinite(operation.falloff) &&
        operation.falloff >= 0 &&
        operation.falloff <= 1))
  );
}

function terrainSize(value: number | undefined, fallback: number): number {
  return isTerrainSize(value) ? value : fallback;
}

function terrainResolution(value: number | undefined, fallback: number): number {
  return isTerrainResolution(value) ? value : fallback;
}

function isTerrainSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= TERRAIN_SIZE_MIN &&
    value <= TERRAIN_SIZE_MAX
  );
}

function isTerrainResolution(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TERRAIN_RESOLUTION_MIN &&
    value <= TERRAIN_RESOLUTION_MAX
  );
}

function isTerrainHeight(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= TERRAIN_HEIGHT_ABSOLUTE_MAX
  );
}

function clampHeight(value: number): number {
  return Math.max(
    -TERRAIN_HEIGHT_ABSOLUTE_MAX,
    Math.min(TERRAIN_HEIGHT_ABSOLUTE_MAX, value),
  );
}

function averageTerrainNeighbourhood(
  source: readonly number[],
  resolution: number,
  x: number,
  z: number,
): number {
  let total = 0;
  let count = 0;
  for (let neighbourZ = Math.max(0, z - 1); neighbourZ <= Math.min(resolution - 1, z + 1); neighbourZ += 1) {
    for (let neighbourX = Math.max(0, x - 1); neighbourX <= Math.min(resolution - 1, x + 1); neighbourX += 1) {
      total += source[neighbourZ * resolution + neighbourX] ?? 0;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function terrainBrushFalloff(normalizedDistance: number, softness = 0.5): number {
  if (normalizedDistance >= 1) return 0;
  if (softness <= 0) return 1;
  const edgeStart = Math.max(0, 1 - softness);
  if (normalizedDistance <= edgeStart) return 1;
  const edgeT = (normalizedDistance - edgeStart) / softness;
  return Math.cos(edgeT * Math.PI * 0.5) ** 2;
}

function sampleTerrainHeight(
  terrain: TerrainGeometry,
  normalizedX: number,
  normalizedZ: number,
): number {
  const maximum = terrain.resolution - 1;
  const x = Math.max(0, Math.min(maximum, normalizedX * maximum));
  const z = Math.max(0, Math.min(maximum, normalizedZ * maximum));
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(maximum, x0 + 1);
  const z1 = Math.min(maximum, z0 + 1);
  const xT = x - x0;
  const zT = z - z0;
  const top = (terrain.heights[z0 * terrain.resolution + x0] ?? 0) * (1 - xT) +
    (terrain.heights[z0 * terrain.resolution + x1] ?? 0) * xT;
  const bottom = (terrain.heights[z1 * terrain.resolution + x0] ?? 0) * (1 - xT) +
    (terrain.heights[z1 * terrain.resolution + x1] ?? 0) * xT;
  return clampHeight(top * (1 - zT) + bottom * zT);
}
