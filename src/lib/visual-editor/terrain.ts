/**
 * Pure terrain authoring primitives shared by the Inspector, MCP tools, the
 * Scene View, and generated runtime output. Terrain keeps sampled heights in
 * the Scene document so every edit is deterministic and undoable.
 */

export const TERRAIN_MATERIAL_SLOT = "terrain" as const;

export const TERRAIN_RESOLUTION_MIN = 9;
export const TERRAIN_RESOLUTION_MAX = 65;
export const TERRAIN_SIZE_MIN = 0.5;
export const TERRAIN_SIZE_MAX = 512;
export const TERRAIN_HEIGHT_ABSOLUTE_MAX = 256;

export type TerrainGeometry = {
  width: number;
  depth: number;
  /** Number of samples along each horizontal axis. */
  resolution: number;
  /** Row-major heights, ordered from the local -Z edge toward +Z. */
  heights: number[];
};

export type TerrainGeometryOptions = Partial<TerrainGeometry>;

export const TERRAIN_BRUSH_KINDS = [
  "raise",
  "lower",
  "flatten",
  "smooth",
] as const;

export type TerrainBrushKind = (typeof TERRAIN_BRUSH_KINDS)[number];

export type TerrainBrushOperation = {
  kind: TerrainBrushKind;
  /** Local Terrain X/Z coordinates. */
  center: [number, number];
  radius: number;
  strength: number;
  /** Required by flatten; ignored by the other brushes. */
  targetHeight?: number;
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
  return { width, depth, resolution, heights };
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
    terrain.heights.every(isTerrainHeight)
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
  const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6);
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

  let index = 0;
  for (let z = 0; z < resolution - 1; z += 1) {
    for (let x = 0; x < resolution - 1; x += 1) {
      const topLeft = z * resolution + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + resolution;
      const bottomRight = bottomLeft + 1;
      indices[index++] = topLeft;
      indices[index++] = bottomLeft;
      indices[index++] = topRight;
      indices[index++] = topRight;
      indices[index++] = bottomLeft;
      indices[index++] = bottomRight;
    }
  }

  return { positions, indices };
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
      const falloff = Math.cos((distance / operation.radius) * Math.PI * 0.5) ** 2;
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
      } else {
        const average = averageTerrainNeighbourhood(source, resolution, x, z);
        heights[index] = clampHeight(
          current + (average - current) * Math.min(1, operation.strength) * falloff,
        );
      }
    }
  }

  return { ...terrain, heights };
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
    (operation.kind !== "flatten" || isTerrainHeight(operation.targetHeight)) &&
    (operation.targetHeight === undefined || isTerrainHeight(operation.targetHeight))
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
