#!/usr/bin/env node
/**
 * Grows the broadleaf trees that ship as Scene recipe models and writes them
 * as GLB.
 *
 *   node scripts/generate-foliage-models.mjs            write the GLBs, print the report
 *   node scripts/generate-foliage-models.mjs --check    fail when a committed GLB differs
 *   node scripts/generate-foliage-models.mjs --report   print the report, write nothing
 *
 * The trees are grown by the generator in this script. A trunk splits into
 * limbs; the limbs branch level by level or, for the open-centred garden tree,
 * by space colonization; alpha-cut leaf cards sit on the twigs. Every random
 * choice comes from the species' seed and every number is computed the same
 * way on every machine, so a run always writes the same bytes. `--check`
 * relies on that, and so do the hashes the recipe catalog records.
 *
 * GLB contract
 * ------------
 * A Material written for these models can rely on the following and needs
 * nothing else.
 *
 * - Units are metres and +Y is up. The origin is the foot of the trunk at
 *   ground level. The trunk itself starts 0.15 m below the origin so that its
 *   foot stays buried on uneven ground.
 * - One scene with one root node named after the file (`foliage-broadleaf`).
 *   The root has exactly two children, the nodes `bark` and `leaves`. Each is
 *   a mesh of the same name with one primitive. three.js GLTFLoader names the
 *   loaded objects `bark` and `leaves`.
 * - `bark`: POSITION, NORMAL, TEXCOORD_0, _ACROWN (VEC4), _ACORE (SCALAR) and
 *   indices. The primitive holds the tubes of the trunk and branches, followed
 *   by the crown core: a bumpy ellipsoid inside the crown that stands for the
 *   mass of leaves deep inside and hides the cards behind it. The standard
 *   garden tree has no core.
 * - `leaves`: POSITION, NORMAL, TEXCOORD_0, _ALEAF (VEC4), _ACROWN (VEC4) and
 *   indices. Every card is four vertices and two triangles, in card order:
 *   vertices 4k .. 4k+3 are bottom left, bottom right, top left, top right.
 *   NORMAL is the card's facing and is the same on its four vertices.
 * - _ALEAF: xyz is the card's pivot in model space, the point where it is
 *   attached to the twig (on the card's centre line, 6 % of its height above
 *   the bottom edge). w is a random value in 0..1 for the card. All four
 *   vertices of a card carry the same value.
 * - _ACROWN: xyz is the outward direction of the crown ellipsoid at the vertex
 *   (unit length; for leaves at the card's pivot, so it is the same on the
 *   four vertices). w is the depth in the crown: 0 at the centre, about 1 at
 *   the surface, clamped at 1.5. On the crown core, xyz is the core's own
 *   normal and w is 0.55.
 * - _ACORE: 1 on the crown core, 0 on trunk and branches.
 * - TEXCOORD_0 follows the three.js convention, not glTF's: v = 0 is the
 *   bottom row of a picture loaded with its top row at v = 1. GLTFLoader
 *   passes the values through unchanged.
 *   Bark tiles every 0.55 m: v is the length along the branch divided by 0.55,
 *   u runs around the branch over a whole number of tiles. The core has 0, 0.
 *   Leaves address one cell of a 2 x 2 atlas, inset by 0.02 on every side:
 *   u is cell + 0.02 on the left and cell + 0.48 on the right, v is
 *   cell + 0.02 at the bottom (twig end) and cell + 0.48 at the top, where
 *   cell is 0 or 0.5.
 * - All vertex data is float32. Indices are UNSIGNED_SHORT when the vertex
 *   count allows and UNSIGNED_INT otherwise.
 * - three.js GLTFLoader lower-cases the names of custom attributes, so a
 *   shader reads them as `_acrown`, `_aleaf` and `_acore`.
 * - Each primitive has a plain fallback material for viewers without the
 *   foliage shader: `bark` (brown, rough, not metallic) and `leaves` (green,
 *   double sided). The GLB carries no textures.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Quaternion,
  Vector3,
} from "three";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FOLIAGE_OUTPUT_DIRECTORY = path.join(
  repoRoot,
  "public",
  "visual-editor",
  "recipe-assets",
);

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TreeSpec
 * @property {number} seed Seed of every random choice for the tree.
 * @property {{ height: number, radius: number, lean: number, wobble: number, flare: number, segments: number }} trunk
 *   Height and radius in metres, lean off vertical, wobble per segment, how
 *   much wider the foot is, and the number of segments.
 * @property {{ count: number, spread: number, length: number, up: number, curl: number, radius: number }} split
 *   The limbs at the top of the trunk: how many, their angle off vertical in
 *   radians, length in metres, pull upwards, curl, and radius relative to the
 *   trunk's top.
 * @property {LevelSpec[]} [levels] Branching below the limbs, one entry per
 *   level. Unused when `colony` is set.
 * @property {ColonySpec} [colony] Grow the branches beyond the limbs by space
 *   colonization instead of `levels`.
 * @property {{ size: number, perTwig: number, along: number, tilt: number, droop: number }} leaves
 *   Card size in metres, cards per twig, how far down the twig they spread
 *   (0..1), how far they lean out, and how much they hang.
 * @property {[number, number, number]} radial Segments around a tube for
 *   thick, medium and thin branches.
 * @property {{ maxLevel: number, minRadius: number, stride?: number }} [bark]
 *   Which branches become tubes: up to this level and at least this thick at
 *   the base. `stride` keeps every n-th ring.
 * @property {number} [core] Size of the crown core relative to the crown's
 *   radii. 0 leaves it out.
 * @property {number} [coreDetail] Subdivision of the core's icosahedron.
 */

/**
 * @typedef {object} LevelSpec
 * @property {number} count Children per parent branch.
 * @property {number} angle Angle off the parent's direction in radians.
 * @property {number} length Length relative to the parent's.
 * @property {number} start Where along the parent the children begin (0..1).
 * @property {number} up Pull upwards; negative values hang.
 * @property {number} curl Random bend per step.
 * @property {number} radius Radius relative to the parent's at that point.
 */

/**
 * @typedef {object} ColonySpec
 * @property {{ y: number, rx: number, ry: number, rz: number, offsetX?: number, offsetZ?: number }} crown
 *   The ellipsoid the attraction points are scattered in: height of its
 *   centre, its radii and an optional sideways offset, in metres.
 * @property {number} floor No points below this height.
 * @property {number} points Number of attraction points.
 * @property {number} shell 0 fills the crown evenly, 1 keeps only its shell.
 * @property {number} [hollow] Radius of the cylinder around the trunk axis
 *   that stays free of points (the open centre). It narrows towards the top.
 * @property {number} step Length of one growth step in metres.
 * @property {number} reach A point pulls the nearest node within this distance.
 * @property {number} kill A point is reached once a new node is this close.
 * @property {number} tropism Pull upwards per step; negative values hang.
 * @property {number} wiggle Random change of direction per step.
 * @property {number} tipRadius Radius of a branch tip in metres.
 * @property {number} pipe Exponent of the pipe model: a branch is as thick as
 *   its children combined, r^pipe = sum of child r^pipe.
 * @property {number} iterations Upper limit of growth rounds.
 * @property {number} [smooth] Smoothing passes over each branch.
 */

/** A large forest broadleaf: a tall trunk whose limbs rise at an angle. */
const BROADLEAF = {
  seed: 11,
  trunk: { height: 3.4, radius: 0.3, lean: 0.07, wobble: 0.045, flare: 1.45, segments: 6 },
  split: { count: 4, spread: 0.62, length: 6.0, up: 0.1, curl: 0.13, radius: 0.66 },
  levels: [
    { count: 6, angle: 0.85, length: 0.55, start: 0.2, up: 0.03, curl: 0.16, radius: 0.5 },
    { count: 5, angle: 0.8, length: 0.55, start: 0.2, up: 0.0, curl: 0.2, radius: 0.55 },
  ],
  leaves: { size: 0.85, perTwig: 7, along: 0.85, tilt: 0.6, droop: 0.08 },
  radial: [9, 5, 3],
  bark: { maxLevel: 2, minRadius: 0.025 },
  core: 0.3,
};

/**
 * A round garden tree: three limbs low on the trunk, then space colonization
 * into a wide crown with an open centre. The branching is meant to be seen, so
 * the standard version has no crown core and keeps its thin branches as tubes.
 */
const GARDEN_TREE = {
  seed: 7,
  trunk: { height: 1.25, radius: 0.2, lean: 0.22, wobble: 0.07, flare: 1.5, segments: 5 },
  split: { count: 3, spread: 0.95, length: 1.5, up: 0.05, curl: 0.14, radius: 0.76 },
  colony: {
    crown: { y: 3.05, rx: 3.5, ry: 1.75, rz: 3.2 },
    floor: 1.55,
    points: 1300,
    shell: 0.55,
    hollow: 0.85,
    step: 0.2,
    reach: 1.6,
    kill: 0.27,
    tropism: 0.05,
    wiggle: 0.35,
    tipRadius: 0.007,
    pipe: 2.4,
    iterations: 90,
    smooth: 2,
  },
  leaves: { size: 0.36, perTwig: 6, along: 0.85, tilt: 0.5, droop: 0.15 },
  radial: [12, 8, 5],
  bark: { maxLevel: 12, minRadius: 0.0085 },
  core: 0,
};

/** A shrub: many stems rising from the foot into a dense mound. */
const SHRUB = {
  seed: 31,
  trunk: { height: 0.12, radius: 0.06, lean: 0.05, wobble: 0.02, flare: 1.2, segments: 2 },
  split: { count: 7, spread: 1.0, length: 1.5, up: 0.3, curl: 0.2, radius: 0.7 },
  levels: [
    { count: 5, angle: 0.9, length: 0.6, start: 0.2, up: 0.12, curl: 0.25, radius: 0.6 },
  ],
  leaves: { size: 0.45, perTwig: 6, along: 0.85, tilt: 0.6, droop: 0.05 },
  radial: [5, 4, 3],
  bark: { maxLevel: 1, minRadius: 0.02 },
  core: 0.3,
};

/**
 * The same tree for the middle distance: half as many leaf cards, each larger,
 * tubes for the trunk and limbs only, and a larger crown core to fill in.
 * @param {TreeSpec} spec
 * @returns {TreeSpec}
 */
function lighterVersion(spec) {
  return {
    ...spec,
    leaves: {
      ...spec.leaves,
      size: spec.leaves.size * 1.6,
      perTwig: Math.max(2, Math.round(spec.leaves.perTwig * 0.5)),
    },
    radial: [6, 4, 3],
    bark: { maxLevel: 1, minRadius: 0.05, stride: 2 },
    core: 0.42,
  };
}

/** The files this script owns, in the order they are written. */
export const FOLIAGE_MODELS = [
  { fileName: "foliage-broadleaf.glb", spec: BROADLEAF },
  { fileName: "foliage-broadleaf-light.glb", spec: lighterVersion(BROADLEAF) },
  { fileName: "foliage-garden-tree.glb", spec: GARDEN_TREE },
  { fileName: "foliage-garden-tree-light.glb", spec: lighterVersion(GARDEN_TREE) },
  { fileName: "foliage-shrub.glb", spec: SHRUB },
  { fileName: "foliage-shrub-light.glb", spec: lighterVersion(SHRUB) },
];

// ---------------------------------------------------------------------------
// Numbers every machine agrees on
//
// + - * / and Math.sqrt are exact by IEEE 754, but Math.sin, Math.cos and **
// come from whichever maths library the runtime was built with, and those
// disagree in the last bit. One bit is enough to swap two branches of nearly
// equal thickness, after which the tree grows differently. So these three are
// computed here with fixed-point integers and rounded to a double once: the
// result is the nearest double to the true value on every machine.
// ---------------------------------------------------------------------------

/** A Lehmer generator: the same seed gives the same sequence of values in 0..1. */
function seeded(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const FIXED_BITS = 192n;
const FIXED_ONE = 1n << FIXED_BITS;
const FIXED_SCALE = Number(FIXED_ONE);
const doubleBits = new DataView(new ArrayBuffer(8));

/** The double as an integer count of 2^-192. */
function fixedOf(value) {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  doubleBits.setFloat64(0, value);
  const bits = doubleBits.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const shift = BigInt(exponent === 0 ? -1074 : exponent - 1075) + FIXED_BITS;
  const magnitude = shift >= 0n ? mantissa << shift : mantissa >> -shift;
  return bits >> 63n ? -magnitude : magnitude;
}

/** Number() rounds the integer to the nearest double; the division by 2^192 is exact. */
const doubleOf = (fixed) => Number(fixed) / FIXED_SCALE;
const fixedMultiply = (a, b) => (a * b) >> FIXED_BITS;

function floorDivide(a, b) {
  const quotient = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? quotient - 1n : quotient;
}

/** atan(1 / n) by its power series. */
function fixedArctanInverse(n) {
  const square = BigInt(n * n);
  let power = FIXED_ONE / BigInt(n);
  let sum = power;
  for (let k = 3n; power !== 0n; k += 2n) {
    power = -power / square;
    sum += power / k;
  }
  return sum;
}

/** Machin's formula: pi / 4 = 4 atan(1 / 5) - atan(1 / 239). */
const FIXED_HALF_PI = 8n * fixedArctanInverse(5) - 2n * fixedArctanInverse(239);

/** The series of sin (odd) or cos around 0, for |angle| up to pi / 4. */
function fixedSeries(angle, odd) {
  const square = fixedMultiply(angle, angle);
  let term = odd ? angle : FIXED_ONE;
  let sum = term;
  for (let n = odd ? 2 : 1; term !== 0n; n += 2) {
    term = -fixedMultiply(term, square) / BigInt(n * (n + 1));
    sum += term;
  }
  return sum;
}

/** |angle| as a number of quarter turns (0..3) and a remainder within pi / 4 of 0. */
function quarterTurns(angle) {
  const fixed = fixedOf(Math.abs(angle));
  const turns = floorDivide(2n * fixed + FIXED_HALF_PI, 2n * FIXED_HALF_PI);
  return [Number(turns % 4n), fixed - turns * FIXED_HALF_PI];
}

export function sin(angle) {
  const [quarter, rest] = quarterTurns(angle);
  const series = fixedSeries(rest, quarter % 2 === 0);
  const value = quarter < 2 ? series : -series;
  return doubleOf(angle < 0 ? -value : value);
}

export function cos(angle) {
  const [quarter, rest] = quarterTurns(angle);
  const series = fixedSeries(rest, quarter % 2 === 1);
  return doubleOf(quarter === 1 || quarter === 2 ? -series : series);
}

/** ln of a value in 1..2: 2 atanh((m - 1) / (m + 1)) by its power series. */
function fixedLnMantissa(mantissa) {
  const z = ((mantissa - FIXED_ONE) << FIXED_BITS) / (mantissa + FIXED_ONE);
  const square = fixedMultiply(z, z);
  let power = z;
  let sum = z;
  for (let k = 3n; power !== 0n; k += 2n) {
    power = fixedMultiply(power, square);
    sum += power / k;
  }
  return 2n * sum;
}

const FIXED_LN2 = fixedLnMantissa(2n * FIXED_ONE);

function fixedLn(fixed) {
  const exponent = BigInt(fixed.toString(2).length - 1) - FIXED_BITS;
  const mantissa = exponent >= 0n ? fixed >> exponent : fixed << -exponent;
  return fixedLnMantissa(mantissa) + exponent * FIXED_LN2;
}

function fixedExp(fixed) {
  const doublings = floorDivide(2n * fixed + FIXED_LN2, 2n * FIXED_LN2);
  const rest = fixed - doublings * FIXED_LN2;
  let term = FIXED_ONE;
  let sum = FIXED_ONE;
  for (let n = 1n; term !== 0n; n += 1n) {
    term = fixedMultiply(term, rest) / n;
    sum += term;
  }
  return doublings >= 0n ? sum << doublings : sum >> -doublings;
}

/** base ** exponent for a positive base. */
export function pow(base, exponent) {
  if (!(base > 0)) throw new RangeError(`pow needs a positive base: ${base}`);
  return doubleOf(fixedExp(fixedMultiply(fixedOf(exponent), fixedLn(fixedOf(base)))));
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

const UP = new Vector3(0, 1, 0);

/** A unit vector at a right angle to v. */
function perpendicular(v) {
  const other = Math.abs(v.y) < 0.9 ? UP : new Vector3(1, 0, 0);
  return new Vector3().crossVectors(v, other).normalize();
}

/** Vector3.applyAxisAngle, with the sine and cosine from above. */
function rotateAround(v, axis, angle) {
  const half = angle / 2;
  const s = sin(half);
  return v.applyQuaternion(new Quaternion(axis.x * s, axis.y * s, axis.z * s, cos(half)));
}

// ---------------------------------------------------------------------------
// Space colonization (after Runions et al. 2007)
//
//   1. Scatter attraction points in the crown: more towards the outside, none
//      in the open centre.
//   2. Each point pulls the one nearest branch node within its reach.
//   3. Each pulled node grows one step towards the average of its pulls, plus
//      a pull upwards and a random wiggle.
//   4. Points that a new node has come close to are reached and removed.
//   5. Repeat 2 to 4 until no point is left or nothing grows.
//
// Branches compete for the same points, so they divide and fill the free
// space on their own. Thickness follows the pipe model from the tips back to
// the trunk. The node graph is then cut into branches: at every fork the
// thickest child continues the branch and the others start new ones.
// ---------------------------------------------------------------------------

/** Scatters the attraction points in the crown ellipsoid. */
function sampleCrown(spec, random) {
  const { y, rx, ry, rz, offsetX = 0, offsetZ = 0 } = spec.crown;
  const points = [];
  let attempts = 0;
  while (points.length < spec.points && attempts++ < spec.points * 60) {
    const u = random() * 2 - 1;
    const v = random() * 2 - 1;
    const w = random() * 2 - 1;
    const r2 = u * u + v * v + w * w;
    if (r2 > 1) continue;
    // Keep more of the points near the surface.
    if (random() > 1 - spec.shell + spec.shell * r2) continue;
    const p = new Vector3(offsetX + u * rx, y + v * ry, offsetZ + w * rz);
    if (p.y < spec.floor) continue;
    if (
      spec.hollow &&
      Math.sqrt(p.x * p.x + p.z * p.z) < spec.hollow * (1 - 0.5 * Math.max(0, (p.y - y) / ry))
    ) {
      continue;
    }
    points.push(p);
  }
  return points;
}

/** Buckets node indices by cell so that only nearby nodes are searched. */
class NodeGrid {
  constructor(size) {
    this.size = size;
    this.cells = new Map();
  }

  add(p, index) {
    const key = `${Math.floor(p.x / this.size)},${Math.floor(p.y / this.size)},${Math.floor(p.z / this.size)}`;
    const list = this.cells.get(key);
    if (list) list.push(index);
    else this.cells.set(key, [index]);
  }

  /** Fills `out` with the nodes in the 27 cells around p. */
  near(p, out) {
    out.length = 0;
    const cx = Math.floor(p.x / this.size);
    const cy = Math.floor(p.y / this.size);
    const cz = Math.floor(p.z / this.size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (list) for (const index of list) out.push(index);
        }
      }
    }
    return out;
  }
}

/**
 * Grows branches from the existing ones (`seeds`: the trunk and limbs, whose
 * points and radii are settled) into the crown. Returns the new branches and
 * the twigs at their ends, where the leaf cards go.
 */
function colonize(spec, seeds, random) {
  const nodes = [];
  const grid = new NodeGrid(Math.max(spec.reach, spec.kill * 2));
  const addNode = (node) => {
    nodes.push(node);
    grid.add(node.p, nodes.length - 1);
    return nodes.length - 1;
  };
  // Turn the settled branches into nodes. From the second branch on, the
  // first point hangs off the nearest node there is.
  seeds.forEach((seed, seedIndex) => {
    let parent = -1;
    if (seedIndex > 0) {
      let best = Infinity;
      nodes.forEach((node, index) => {
        const distance = node.p.distanceToSquared(seed.points[0]);
        if (distance < best) {
          best = distance;
          parent = index;
        }
      });
    }
    seed.points.forEach((p, k) => {
      const index = addNode({
        p: p.clone(),
        parent,
        children: [],
        r: seed.radii[k],
        seed: true,
        level: seed.level,
      });
      if (parent >= 0) nodes[parent].children.push(index);
      parent = index;
    });
  });
  const firstGrown = nodes.length;

  let attractors = sampleCrown(spec, random);
  const near = [];
  const reach2 = spec.reach * spec.reach;
  const kill2 = spec.kill * spec.kill;
  for (let round = 0; round < spec.iterations && attractors.length; round++) {
    // Each point pulls the nearest node within reach.
    const pulls = new Map();
    for (const attractor of attractors) {
      let best = -1;
      let bestDistance = reach2;
      for (const index of grid.near(attractor, near)) {
        const distance = nodes[index].p.distanceToSquared(attractor);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      if (best < 0) continue;
      const direction = attractor.clone().sub(nodes[best].p).normalize();
      const sum = pulls.get(best);
      if (sum) sum.add(direction);
      else pulls.set(best, direction);
    }
    if (!pulls.size) break;
    // Each pulled node grows one step.
    const born = [];
    for (const [index, sum] of pulls) {
      const node = nodes[index];
      const direction = sum.normalize();
      direction.y += spec.tropism;
      direction.x += (random() * 2 - 1) * spec.wiggle;
      direction.y += (random() * 2 - 1) * spec.wiggle * 0.5;
      direction.z += (random() * 2 - 1) * spec.wiggle;
      direction.normalize();
      // A child already grows this way: a second one would sit on top of it
      // and the two would keep sharing the same points without getting there.
      if (
        node.children.some(
          (child) => nodes[child].p.clone().sub(node.p).normalize().dot(direction) > 0.96,
        )
      ) {
        continue;
      }
      const child = addNode({
        p: node.p.clone().addScaledVector(direction, spec.step),
        parent: index,
        children: [],
        r: 0,
        seed: false,
        level: node.level + 1,
      });
      node.children.push(child);
      born.push(child);
    }
    if (!born.length) break;
    // Remove the points a grown node has reached.
    attractors = attractors.filter((attractor) => {
      for (const index of grid.near(attractor, near)) {
        if (index >= firstGrown && nodes[index].p.distanceToSquared(attractor) < kill2) return false;
      }
      return true;
    });
  }

  // Thickness from the tips back to the trunk. Later nodes have higher
  // indices, so walking backwards visits children before their parents.
  for (let index = nodes.length - 1; index >= firstGrown; index--) {
    const node = nodes[index];
    if (!node.children.length) {
      node.r = spec.tipRadius;
    } else {
      let sum = 0;
      for (const child of node.children) sum += pow(nodes[child].r, spec.pipe);
      node.r = pow(sum, 1 / spec.pipe);
    }
  }
  // Never thicker than the parent, and thinner where it leaves a settled branch.
  for (let index = firstGrown; index < nodes.length; index++) {
    const node = nodes[index];
    const parent = nodes[node.parent];
    node.r = Math.min(node.r, parent.seed ? parent.r * 0.8 : parent.r);
  }

  const branches = [];
  const twigs = [];
  const passes = spec.smooth ?? 2;
  const chain = (start, from, level) => {
    const points = [from.clone()];
    const radii = [nodes[start].r];
    let index = start;
    for (;;) {
      points.push(nodes[index].p.clone());
      radii.push(nodes[index].r);
      const children = nodes[index].children;
      if (!children.length) break;
      children.sort((a, b) => nodes[b].r - nodes[a].r);
      for (const child of children.slice(1)) chain(child, nodes[index].p, level + 1);
      index = children[0];
    }
    // Smooth the zigzag of the steps. The two ends stay where they are.
    for (let pass = 0; pass < passes; pass++) {
      for (let k = 2; k < points.length - 1; k++) {
        points[k].lerp(
          points[k - 1]
            .clone()
            .add(points[k + 1])
            .multiplyScalar(0.5),
          0.5,
        );
      }
    }
    branches.push({ points, radii, level });
    twigs.push({ points: points.slice(-4), level });
  };
  for (let index = 0; index < firstGrown; index++) {
    const node = nodes[index];
    for (const child of node.children) {
      if (child >= firstGrown) chain(child, node.p, node.level + 1);
    }
  }
  return { branches, twigs };
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/** How far below the origin the trunk starts, in metres. */
const TRUNK_ROOT_DEPTH = 0.15;

/**
 * Grows one tree. Returns the vertex data of its two meshes and the crown:
 * the centre of the leaf cards and their extent along each axis.
 * @param {TreeSpec} spec
 */
export function growTree(spec) {
  const random = seeded(spec.seed);
  const jitter = (amount) => (random() * 2 - 1) * amount;
  const branches = [];
  const twigs = [];

  /** Grows one branch step by step, bending a little and leaning up or down. */
  function extend(start, direction, length, startRadius, endRadius, level, up, curl, steps) {
    const points = [start.clone()];
    const radii = [startRadius];
    const d = direction.clone().normalize();
    const p = start.clone();
    const stepLength = length / steps;
    for (let i = 1; i <= steps; i++) {
      d.x += jitter(curl);
      d.z += jitter(curl);
      d.y += jitter(curl * 0.6) + up * stepLength * 0.35;
      d.normalize();
      p.addScaledVector(d, stepLength);
      points.push(p.clone());
      radii.push(startRadius + (endRadius - startRadius) * (i / steps));
    }
    const branch = { points, radii, level };
    branches.push(branch);
    return branch;
  }

  const leanAngle = random() * Math.PI * 2;
  const trunkDirection = new Vector3(
    cos(leanAngle) * spec.trunk.lean,
    1,
    sin(leanAngle) * spec.trunk.lean,
  ).normalize();
  const trunk = extend(
    new Vector3(0, -TRUNK_ROOT_DEPTH, 0),
    trunkDirection,
    spec.trunk.height + TRUNK_ROOT_DEPTH,
    spec.trunk.radius * spec.trunk.flare,
    spec.trunk.radius * 0.82,
    0,
    0.2,
    spec.trunk.wobble,
    spec.trunk.segments,
  );
  // The foot swells where it meets the ground.
  trunk.radii[0] *= 1.25;

  /** Children along `parent`, level by level; the last level ends in twigs. */
  function spawnChildren(parent, depth) {
    const level = spec.levels[depth];
    if (!level) {
      twigs.push({ points: parent.points, level: parent.level });
      return;
    }
    const n = parent.points.length;
    let parentLength = 0;
    for (let k = 1; k < n; k++) parentLength += parent.points[k].distanceTo(parent.points[k - 1]);
    let azimuth = random() * Math.PI * 2;
    for (let c = 0; c < level.count; c++) {
      const t = level.start + (1 - level.start) * ((c + 0.5 + jitter(0.35)) / level.count);
      const fi = Math.min(Math.max(t, 0), 0.999) * (n - 1);
      const i = Math.floor(fi);
      const f = fi - i;
      const next = Math.min(i + 1, n - 1);
      const at = parent.points[i].clone().lerp(parent.points[next], f);
      const along = parent.points[next].clone().sub(parent.points[i]).normalize();
      const parentRadius = parent.radii[i] + (parent.radii[next] - parent.radii[i]) * f;
      // Roughly the golden angle between neighbours, so they spread around.
      azimuth += 2.39996 + jitter(0.5);
      const side = rotateAround(perpendicular(along), along, azimuth);
      const direction = along
        .clone()
        .multiplyScalar(cos(level.angle))
        .addScaledVector(side, sin(level.angle))
        .normalize();
      const length = parentLength * level.length * (1 - t * 0.45) * (0.75 + random() * 0.5);
      const radius = Math.max(parentRadius * level.radius, 0.004);
      const steps = Math.max(2, Math.round(length / 0.35));
      const child = extend(at, direction, length, radius, radius * 0.35, parent.level + 1, level.up, level.curl, steps);
      spawnChildren(child, depth + 1);
    }
    // The end of the parent carries leaves too.
    if (depth === spec.levels.length - 1) {
      twigs.push({ points: parent.points.slice(-3), level: parent.level });
    }
  }

  const limbs = [];
  const top = trunk.points[trunk.points.length - 1];
  const trunkTopRadius = trunk.radii[trunk.radii.length - 1];
  let splitAzimuth = random() * Math.PI * 2;
  for (let k = 0; k < spec.split.count; k++) {
    splitAzimuth += (Math.PI * 2) / spec.split.count + jitter(0.5);
    const spread = spec.split.spread * (0.8 + random() * 0.4);
    const direction = new Vector3(
      sin(spread) * cos(splitAzimuth),
      cos(spread),
      sin(spread) * sin(splitAzimuth),
    );
    const start = top.clone().addScaledVector(trunkDirection, -0.12 - random() * 0.25);
    const length = spec.split.length * (0.8 + random() * 0.4);
    const limb = extend(
      start,
      direction,
      length,
      trunkTopRadius * spec.split.radius,
      trunkTopRadius * spec.split.radius * (spec.colony ? 0.75 : 0.4),
      1,
      spec.split.up,
      spec.split.curl,
      Math.max(3, Math.round(length / 0.4)),
    );
    limbs.push(limb);
    if (!spec.colony) spawnChildren(limb, 0);
  }
  if (spec.colony) {
    const grown = colonize(spec.colony, [trunk, ...limbs], random);
    for (const branch of grown.branches) branches.push(branch);
    for (const twig of grown.twigs) twigs.push(twig);
  }

  // Leaf cards: each one leaves its twig sideways and hangs a little.
  const cards = [];
  for (const twig of twigs) {
    const points = twig.points;
    for (let k = 0; k < spec.leaves.perTwig; k++) {
      const t = 1 - spec.leaves.along * (k / Math.max(spec.leaves.perTwig - 1, 1)) - random() * 0.1;
      const fi = Math.min(Math.max(t, 0), 1) * (points.length - 1);
      const i = Math.min(Math.floor(fi), points.length - 2);
      const at = points[i].clone().lerp(points[i + 1], fi - i);
      const along = points[i + 1].clone().sub(points[i]).normalize();
      const side = rotateAround(perpendicular(along), along, random() * Math.PI * 2);
      const up = along
        .clone()
        .multiplyScalar(0.55)
        .addScaledVector(side, spec.leaves.tilt)
        .add(new Vector3(0, -spec.leaves.droop, 0))
        .normalize();
      const normal = rotateAround(perpendicular(up), up, random() * Math.PI * 2);
      // Faces turn somewhat towards the sky, where the light comes from.
      if (normal.y < 0) normal.negate();
      normal.y += 0.4;
      normal.normalize();
      const size = spec.leaves.size * (0.75 + random() * 0.5);
      const atlas = Math.floor(random() * 4);
      const variation = random();
      cards.push({ pivot: at, up, normal, size, atlas, variation });
    }
  }

  // The crown: the centre of the cards and their extent along each axis.
  const centre = new Vector3();
  for (const card of cards) centre.add(card.pivot);
  centre.divideScalar(Math.max(cards.length, 1));
  const radius = new Vector3(0.5, 0.5, 0.5);
  for (const card of cards) {
    radius.x = Math.max(radius.x, Math.abs(card.pivot.x - centre.x));
    radius.y = Math.max(radius.y, Math.abs(card.pivot.y - centre.y));
    radius.z = Math.max(radius.z, Math.abs(card.pivot.z - centre.z));
  }
  radius.multiplyScalar(0.92);

  const tubes = buildBark(branches, spec.radial, spec.bark ?? { maxLevel: 9, minRadius: 0.006 });
  tubes.crown = crownAttribute(tubes.position, 3, centre, radius);
  const leaves = buildLeaves(cards);
  leaves.crown = crownAttribute(leaves.leaf, 4, centre, radius);
  const bark = withCore(
    tubes,
    centre.clone().add(new Vector3(0, radius.y * 0.15, 0)),
    radius.clone().multiplyScalar(spec.core ?? 0.56),
    spec.coreDetail ?? 1,
  );
  return { bark, leaves, cards: cards.length, crown: { centre, radius } };
}

/**
 * Turns branches into tubes: rings along each branch, with the ring's
 * orientation carried from one ring to the next so the tube does not twist.
 */
function buildBark(branches, radial, limit) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  for (const branch of branches) {
    const baseRadius = branch.radii[0];
    // Thin twigs hide behind the leaves.
    if (baseRadius < limit.minRadius || branch.level > limit.maxLevel) continue;
    const segments = baseRadius > 0.12 ? radial[0] : baseRadius > 0.035 ? radial[1] : radial[2];
    // Lighter versions keep every n-th ring, and always the last one.
    const stride = limit.stride ?? 1;
    const kept = [];
    for (let i = 0; i < branch.points.length; i++) {
      if (i % stride === 0 || i === branch.points.length - 1) kept.push(i);
    }
    const points = kept.map((i) => branch.points[i]);
    const radii = kept.map((i) => branch.radii[i]);
    const n = points.length;
    if (n < 2) continue;
    let previous = points[1].clone().sub(points[0]).normalize();
    let normal = perpendicular(previous);
    const base = positions.length / 3;
    let length = 0;
    // A whole number of 0.55 m tiles around the branch.
    const around = Math.max(1, Math.round((Math.PI * 2 * baseRadius) / 0.55));
    for (let i = 0; i < n; i++) {
      const direction = (
        i < n - 1 ? points[i + 1].clone().sub(points[i]) : points[i].clone().sub(points[i - 1])
      ).normalize();
      // Turn the previous ring's orientation by as much as the branch bent.
      normal = normal
        .applyQuaternion(new Quaternion().setFromUnitVectors(previous, direction))
        .normalize();
      previous = direction;
      const binormal = new Vector3().crossVectors(direction, normal).normalize();
      if (i > 0) length += points[i].distanceTo(points[i - 1]);
      const radius = radii[i];
      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const c = cos(angle);
        const d = sin(angle);
        const nx = normal.x * c + binormal.x * d;
        const ny = normal.y * c + binormal.y * d;
        const nz = normal.z * c + binormal.z * d;
        // Thick bark has ridges that run along the branch.
        const ridge = radius > 0.08 ? 1 + 0.05 * sin(angle * 7 + length * 1.3) : 1;
        positions.push(
          points[i].x + nx * radius * ridge,
          points[i].y + ny * radius * ridge,
          points[i].z + nz * radius * ridge,
        );
        normals.push(nx, ny, nz);
        uvs.push((s / segments) * around, length / 0.55);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < segments; s++) {
        const a = base + i * (segments + 1) + s;
        const b = a + segments + 1;
        // Counter-clockwise seen from outside.
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    uv: new Float32Array(uvs),
    index,
  };
}

/**
 * Leaf cards: four vertices each, attached to the twig at the bottom centre
 * of the picture.
 */
function buildLeaves(cards) {
  const position = new Float32Array(cards.length * 12);
  const normal = new Float32Array(cards.length * 12);
  const uv = new Float32Array(cards.length * 8);
  const leaf = new Float32Array(cards.length * 16);
  const index = [];
  cards.forEach((card, k) => {
    const right = new Vector3().crossVectors(card.up, card.normal).normalize();
    const half = card.size * 0.5;
    const corners = [
      [-half, 0],
      [half, 0],
      [-half, card.size],
      [half, card.size],
    ];
    const u0 = (card.atlas % 2) * 0.5;
    const v0 = Math.floor(card.atlas / 2) * 0.5;
    corners.forEach(([x, y], j) => {
      const vertex = k * 4 + j;
      const p = card.pivot
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(card.up, y - card.size * 0.06);
      position.set([p.x, p.y, p.z], vertex * 3);
      normal.set([card.normal.x, card.normal.y, card.normal.z], vertex * 3);
      uv.set([u0 + (j % 2 === 0 ? 0.02 : 0.48), v0 + (j < 2 ? 0.02 : 0.48)], vertex * 2);
      leaf.set([card.pivot.x, card.pivot.y, card.pivot.z, card.variation], vertex * 4);
    });
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2);
  });
  return { position, normal, uv, leaf, index };
}

/**
 * The crown attribute for points stored `stride` floats apart: the outward
 * direction of the crown ellipsoid at the point, and the point's depth in the
 * crown (0 at the centre, 1 on the ellipsoid, at most 1.5).
 */
function crownAttribute(points, stride, centre, radius) {
  const count = points.length / stride;
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const rx = (points[i * stride] - centre.x) / radius.x;
    const ry = (points[i * stride + 1] - centre.y) / radius.y;
    const rz = (points[i * stride + 2] - centre.z) / radius.z;
    const outward = new Vector3(rx / radius.x, ry / radius.y, rz / radius.z).normalize();
    const depth = Math.min(Math.sqrt(rx * rx + ry * ry + rz * rz), 1.5);
    out.set([outward.x, outward.y, outward.z, depth], i * 4);
  }
  return out;
}

/** An icosphere with the vertices at the same position merged. */
function mergedIcosphere(detail) {
  const source = new IcosahedronGeometry(1, detail).getAttribute("position");
  const seen = new Map();
  const positions = [];
  const index = [];
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i);
    const y = source.getY(i);
    const z = source.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let merged = seen.get(key);
    if (merged === undefined) {
      merged = positions.length / 3;
      seen.set(key, merged);
      positions.push(x, y, z);
    }
    index.push(merged);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Appends the crown core to the tubes: a bumpy ellipsoid inside the crown.
 * `core` is 1 on it and 0 on the tubes. A core with no size is left out.
 */
function withCore(tubes, centre, radius, detail) {
  const tubeCount = tubes.position.length / 3;
  if (radius.x <= 0.01) return { ...tubes, core: new Float32Array(tubeCount), coreTriangles: 0 };
  const geometry = mergedIcosphere(detail);
  const position = geometry.getAttribute("position");
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const bump =
      1 + 0.22 * sin(p.x * 5.1 + p.y * 3.3) * sin(p.z * 4.2) + 0.1 * sin(p.y * 9.0 + p.x * 7.0);
    position.setXYZ(
      i,
      centre.x + p.x * radius.x * bump,
      centre.y + p.y * radius.y * bump,
      centre.z + p.z * radius.z * bump,
    );
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const coreCount = position.count;
  const append = (tubeValues, size, coreValue) => {
    const out = new Float32Array((tubeCount + coreCount) * size);
    out.set(tubeValues, 0);
    for (let i = 0; i < coreCount; i++) out.set(coreValue(i), (tubeCount + i) * size);
    return out;
  };
  const normalAt = (i) => [normal.getX(i), normal.getY(i), normal.getZ(i)];
  const coreIndex = geometry.getIndex();
  const index = tubes.index.slice();
  for (let i = 0; i < coreIndex.count; i++) index.push(tubeCount + coreIndex.getX(i));
  return {
    position: append(tubes.position, 3, (i) => [position.getX(i), position.getY(i), position.getZ(i)]),
    normal: append(tubes.normal, 3, normalAt),
    uv: append(tubes.uv, 2, () => [0, 0]),
    crown: append(tubes.crown, 4, (i) => [...normalAt(i), 0.55]),
    core: append(new Float32Array(tubeCount), 1, () => [1]),
    index,
    coreTriangles: coreIndex.count / 3,
  };
}

// ---------------------------------------------------------------------------
// GLB
// ---------------------------------------------------------------------------

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const ACCESSOR_TYPE = { 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4" };

/** Fallback materials, in linear colour. */
const MATERIALS = [
  {
    name: "bark",
    pbrMetallicRoughness: {
      baseColorFactor: [0.16, 0.1, 0.06, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
  },
  {
    name: "leaves",
    pbrMetallicRoughness: {
      baseColorFactor: [0.1, 0.24, 0.05, 1],
      metallicFactor: 0,
      roughnessFactor: 0.8,
    },
    doubleSided: true,
  },
];

/**
 * Packs one tree into a GLB. Data is written little-endian value by value and
 * the JSON keys in a fixed order, so the bytes do not depend on the machine.
 */
function encodeGlb(name, tree) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteLength = 0;
  const addView = (bytes, target) => {
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
    chunks.push(bytes);
    byteLength += bytes.length;
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    return bufferViews.length - 1;
  };
  const addAttribute = (values, size, withBounds = false) => {
    const bytes = Buffer.alloc(values.length * 4);
    for (let i = 0; i < values.length; i++) bytes.writeFloatLE(values[i], i * 4);
    const accessor = {
      bufferView: addView(bytes, ARRAY_BUFFER),
      componentType: FLOAT,
      count: values.length / size,
      type: ACCESSOR_TYPE[size],
    };
    if (withBounds) Object.assign(accessor, boundsOf(values));
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const addIndices = (index, vertexCount) => {
    // 65535 is reserved in a 16-bit index buffer, so it cannot be an index.
    const short = vertexCount <= 65535;
    const bytes = Buffer.alloc(index.length * (short ? 2 : 4));
    index.forEach((value, i) => {
      if (short) bytes.writeUInt16LE(value, i * 2);
      else bytes.writeUInt32LE(value, i * 4);
    });
    accessors.push({
      bufferView: addView(bytes, ELEMENT_ARRAY_BUFFER),
      componentType: short ? UNSIGNED_SHORT : UNSIGNED_INT,
      count: index.length,
      type: "SCALAR",
    });
    return accessors.length - 1;
  };

  const { bark, leaves } = tree;
  const barkPrimitive = {
    attributes: {
      POSITION: addAttribute(bark.position, 3, true),
      NORMAL: addAttribute(bark.normal, 3),
      TEXCOORD_0: addAttribute(bark.uv, 2),
      _ACROWN: addAttribute(bark.crown, 4),
      _ACORE: addAttribute(bark.core, 1),
    },
    indices: addIndices(bark.index, bark.position.length / 3),
    material: 0,
    mode: 4,
  };
  const leavesPrimitive = {
    attributes: {
      POSITION: addAttribute(leaves.position, 3, true),
      NORMAL: addAttribute(leaves.normal, 3),
      TEXCOORD_0: addAttribute(leaves.uv, 2),
      _ALEAF: addAttribute(leaves.leaf, 4),
      _ACROWN: addAttribute(leaves.crown, 4),
    },
    indices: addIndices(leaves.index, leaves.position.length / 3),
    material: 1,
    mode: 4,
  };
  const json = {
    asset: { version: "2.0", generator: "XRift Studio generate-foliage-models" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name, children: [1, 2] },
      { name: "bark", mesh: 0 },
      { name: "leaves", mesh: 1 },
    ],
    meshes: [
      { name: "bark", primitives: [barkPrimitive] },
      { name: "leaves", primitives: [leavesPrimitive] },
    ],
    materials: MATERIALS,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  let text = Buffer.from(JSON.stringify(json), "utf8");
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(text.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, text, binaryHeader, binary]);
}

/** Smallest and largest value per component of a VEC3 array. */
function boundsOf(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i++) {
    const axis = i % 3;
    if (values[i] < min[axis]) min[axis] = values[i];
    if (values[i] > max[axis]) max[axis] = values[i];
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const rounded = (value) => Math.round(value * 1e4) / 1e4;

/**
 * Grows and packs one model. `bytes` is the file; `report` describes it. The
 * bounds in the report are the exact float32 values the GLB records.
 */
export function buildFoliageModel({ fileName, spec }) {
  const tree = growTree(spec);
  const bytes = encodeGlb(path.basename(fileName, ".glb"), tree);
  const barkBounds = boundsOf(tree.bark.position);
  const leafBounds = boundsOf(tree.leaves.position);
  const min = barkBounds.min.map((value, axis) => Math.min(value, leafBounds.min[axis]));
  const max = barkBounds.max.map((value, axis) => Math.max(value, leafBounds.max[axis]));
  const report = {
    fileName,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    barkVertices: tree.bark.position.length / 3,
    barkTriangles: tree.bark.index.length / 3,
    coreTriangles: tree.bark.coreTriangles,
    leafCards: tree.cards,
    leafVertices: tree.leaves.position.length / 3,
    leafTriangles: tree.leaves.index.length / 3,
    bounds: { min, max },
    // Half the longest dimension, the framing hint the recipe catalog records.
    approxRadius: rounded(Math.max(...max.map((value, axis) => value - min[axis])) / 2),
    crown: {
      centre: tree.crown.centre.toArray().map(rounded),
      radius: tree.crown.radius.toArray().map(rounded),
    },
  };
  return { fileName, bytes, report };
}

export function buildFoliageModels() {
  return FOLIAGE_MODELS.map(buildFoliageModel);
}

/**
 * Compares freshly built models with the files in `directory`. Returns one
 * message per file that is missing or differs; an empty list means they match.
 */
export function checkFoliageModels(directory = FOLIAGE_OUTPUT_DIRECTORY, models = buildFoliageModels()) {
  const problems = [];
  for (const { fileName, bytes, report } of models) {
    const target = path.join(directory, fileName);
    if (!fs.existsSync(target)) {
      problems.push(`${fileName} is missing`);
      continue;
    }
    const committed = fs.readFileSync(target);
    const sha256 = createHash("sha256").update(committed).digest("hex");
    if (sha256 !== report.sha256) {
      problems.push(
        `${fileName} differs: the file has sha256 ${sha256} (${committed.length} bytes), ` +
          `the generator writes ${report.sha256} (${bytes.length} bytes)`,
      );
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const models = buildFoliageModels();
  if (process.argv.includes("--check")) {
    const problems = checkFoliageModels(FOLIAGE_OUTPUT_DIRECTORY, models);
    if (problems.length) {
      console.error(
        [
          "Foliage models in public/visual-editor/recipe-assets are out of date:",
          ...problems.map((problem) => `  ${problem}`),
          "Run: node scripts/generate-foliage-models.mjs",
        ].join("\n"),
      );
      process.exit(1);
    }
    console.log(`foliage models checked: ${models.length} files`);
  } else {
    if (!process.argv.includes("--report")) {
      fs.mkdirSync(FOLIAGE_OUTPUT_DIRECTORY, { recursive: true });
      for (const { fileName, bytes } of models) {
        fs.writeFileSync(path.join(FOLIAGE_OUTPUT_DIRECTORY, fileName), bytes);
      }
    }
    process.stdout.write(`${JSON.stringify(models.map((model) => model.report), null, 2)}\n`);
  }
}
