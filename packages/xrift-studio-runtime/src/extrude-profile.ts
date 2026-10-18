/** Bounded, portable profile data shared by authoring, compilation and rendering. */
export type XriftExtrudeProfile = {
  /** A simple polygon in local XY; closure is implicit. */
  points: [number, number][];
  /** Extends from local Z=0 to Z=depth. */
  depth: number;
};

export const MAX_EXTRUDE_PROFILE_POINTS = 128;
export const MAX_EXTRUDE_LOCAL_COORDINATE = 1000;
export const MIN_EXTRUDE_DEPTH = 0.0001;
export const MAX_EXTRUDE_DEPTH = 1000;
const EPSILON = 1e-9;

/** Returns an actionable error before triangulation allocates any geometry. */
export function validateXriftExtrudeProfile(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Extrude must contain points and depth";
  }
  const profile = value as Record<string, unknown>;
  for (const key of Object.keys(profile)) {
    if (key !== "points" && key !== "depth" && !(key === "kind" && profile.kind === "extrude")) {
      return `Extrude option ${key} is unsupported; use only points and depth`;
    }
  }
  if (!Array.isArray(profile.points) || profile.points.length < 3 || profile.points.length > MAX_EXTRUDE_PROFILE_POINTS) {
    return `Extrude points must contain 3..${MAX_EXTRUDE_PROFILE_POINTS} vertices with implicit closure`;
  }
  if (typeof profile.depth !== "number" || !Number.isFinite(profile.depth) || profile.depth < MIN_EXTRUDE_DEPTH || profile.depth > MAX_EXTRUDE_DEPTH) {
    return `Extrude depth must be finite and within ${MIN_EXTRUDE_DEPTH}..${MAX_EXTRUDE_DEPTH} metres`;
  }
  for (const [index, point] of profile.points.entries()) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(entry => typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= MAX_EXTRUDE_LOCAL_COORDINATE)) {
      return `Extrude points[${index}] must be finite [x, y] within +/-${MAX_EXTRUDE_LOCAL_COORDINATE} metres`;
    }
  }
  const points = profile.points as [number, number][];
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += (a[0] - points[0]![0]) * (b[1] - points[0]![1]) - (b[0] - points[0]![0]) * (a[1] - points[0]![1]);
    for (let j = i + 1; j < points.length; j += 1) {
      const c = points[j]!;
      if (Math.abs(a[0] - c[0]) <= EPSILON && Math.abs(a[1] - c[1]) <= EPSILON) {
        return `Extrude points[${i}] and points[${j}] repeat a vertex; closure is implicit`;
      }
      const d = points[(j + 1) % points.length]!;
      if ((i + 1) % points.length === j || (j + 1) % points.length === i) continue;
      if (segmentsMeet(a, b, c, d)) return `Extrude edges ${i} and ${j} intersect or touch`;
    }
    // Adjacent collinear edges may continue straight, but cannot double back.
    const c = points[(i + 2) % points.length]!;
    if (Math.abs(cross(a, b, c)) <= EPSILON && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) {
      return `Extrude edges at points[${(i + 1) % points.length}] overlap`;
    }
  }
  return Math.abs(area) <= EPSILON ? "Extrude profile must enclose a nonzero area" : null;
}

export function isXriftExtrudeProfile(value: unknown): value is XriftExtrudeProfile {
  return validateXriftExtrudeProfile(value) === null;
}

/** Non-indexed caps and walls: position, normal and UV, with one depth step. */
export function estimateXriftExtrudeGeometryBytes(profile: XriftExtrudeProfile): number {
  return isXriftExtrudeProfile(profile) ? (12 * profile.points.length - 12) * 8 * 4 : 0;
}

function cross(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: [number, number], b: [number, number], p: [number, number]): boolean {
  return Math.abs(cross(a, b, p)) <= EPSILON && p[0] >= Math.min(a[0], b[0]) - EPSILON && p[0] <= Math.max(a[0], b[0]) + EPSILON && p[1] >= Math.min(a[1], b[1]) - EPSILON && p[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function segmentsMeet(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  return (((ac > EPSILON && ad < -EPSILON) || (ac < -EPSILON && ad > EPSILON)) && ((ca > EPSILON && cb < -EPSILON) || (ca < -EPSILON && cb > EPSILON))) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
