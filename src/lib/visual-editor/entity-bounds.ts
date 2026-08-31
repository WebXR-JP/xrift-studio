import type { AssetManifest } from "./asset-manifest";
import {
  getModelNodeLocalBounds,
  isModelNodeGeometryEntity,
} from "./model-hierarchy";
import {
  getColliderAutoFitBounds,
  getTransform,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";

/**
 * How big a thing is, and where it actually sits.
 *
 * The Scene document records a Transform, not a size. That is enough for the
 * viewport, which has the real geometry in hand, but it is not enough for
 * anything reasoning about the Scene from the document alone: a caller placing
 * a bench beside a wall knows both their positions and neither of their
 * extents, so it stacks them, sinks them into the ground, or leaves them
 * floating, and only a human looking at the viewport ever notices.
 *
 * The local half-extents already exist — `getColliderAutoFitBounds` resolves
 * them for Terrain, builtin primitives and imported Models, which is what
 * auto-fitting a Box Collider uses. What was missing is the walk up the parent
 * chain that turns them into world space, and the union over a subtree.
 *
 * The matrix maths is written out here rather than taken from three.js on
 * purpose: `scene-document` and its callers stay free of the renderer, and the
 * document layer is what the CLI and the fixtures run.
 */

export type EntityBounds = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  /** Full extent per axis, not half. */
  size: Vec3;
};

export type EntityBoundsResult = {
  /** Null when nothing under the Entity has resolvable geometry. */
  world: EntityBounds | null;
  /** The Entity's own mesh in its own local space, before its Transform. */
  local: EntityBounds | null;
  /** Entities whose geometry contributed to `world`. */
  measured: string[];
  /**
   * Entities that carry a Mesh whose extent could not be resolved.
   *
   * A Model imported before its metadata existed is the usual case. Reporting
   * them beats quietly returning bounds that leave the Model out, which would
   * read as "this thing is small" rather than "this thing is unknown".
   */
  unmeasured: string[];
};

/** Row-major 4x4, which is what the two operations below need. */
export type EntityWorldMatrix = number[];

type Matrix4x4 = EntityWorldMatrix;

const IDENTITY: Matrix4x4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function multiply(left: Matrix4x4, right: Matrix4x4): Matrix4x4 {
  const result = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let index = 0; index < 4; index += 1) {
        sum += left[row * 4 + index] * right[index * 4 + column];
      }
      result[row * 4 + column] = sum;
    }
  }
  return result;
}

/**
 * Translate * Rotate * Scale, with the rotation in three.js's default XYZ
 * Euler order so a document authored in the viewport measures the same here.
 */
function compose(position: Vec3, rotation: Vec3, scale: Vec3): Matrix4x4 {
  const [cx, sx] = [Math.cos(rotation[0]), Math.sin(rotation[0])];
  const [cy, sy] = [Math.cos(rotation[1]), Math.sin(rotation[1])];
  const [cz, sz] = [Math.cos(rotation[2]), Math.sin(rotation[2])];
  // R = Rx * Ry * Rz
  const r = [
    cy * cz,
    -cy * sz,
    sy,
    sx * sy * cz + cx * sz,
    -sx * sy * sz + cx * cz,
    -sx * cy,
    -cx * sy * cz + sx * sz,
    cx * sy * sz + sx * cz,
    cx * cy,
  ];
  return [
    r[0] * scale[0], r[1] * scale[1], r[2] * scale[2], position[0],
    r[3] * scale[0], r[4] * scale[1], r[5] * scale[2], position[1],
    r[6] * scale[0], r[7] * scale[1], r[8] * scale[2], position[2],
    0, 0, 0, 1,
  ];
}

/** Places a point given in an Entity's local space into world space. */
export function transformPointByMatrix(
  matrix: EntityWorldMatrix,
  point: Vec3,
): Vec3 {
  return transformPoint(matrix, point);
}

function transformPoint(matrix: Matrix4x4, point: Vec3): Vec3 {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3],
    matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7],
    matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11],
  ];
}

/**
 * The Entity's world matrix, walking root-first down the parent chain.
 *
 * The visited set is the same guard the rest of the document layer uses: a
 * cycle introduced by a bad reparent would otherwise hang the caller rather
 * than report a broken Scene.
 */
export function entityWorldMatrix(
  scene: SceneDocument,
  entityId: string,
): Matrix4x4 {
  const chain: SceneEntity[] = [];
  const visited = new Set<string>();
  let current: SceneEntity | undefined = scene.entities[entityId];
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  let matrix = IDENTITY;
  for (const entity of chain.reverse()) {
    const transform = getTransform(entity);
    matrix = multiply(
      matrix,
      compose(
        transform?.position ?? [0, 0, 0],
        transform?.rotation ?? [0, 0, 0],
        transform?.scale ?? [1, 1, 1],
      ),
    );
  }
  return matrix;
}

function boundsOf(min: Vec3, max: Vec3): EntityBounds {
  return {
    min: [...min] as Vec3,
    max: [...max] as Vec3,
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

/** The Entity's own mesh extent, in its own local space. */
function localMeshBounds(
  entity: SceneEntity,
  assets: AssetManifest,
): EntityBounds | null {
  const mesh = entity.components.find(
    (component): component is Extract<SceneEntity["components"][number], { type: "mesh" }> =>
      component.type === "mesh",
  );
  if (!mesh) {
    // A shared-Model node draws through its Model root, so its extent comes
    // from the Model Asset's node metadata (absent for pre-bounds imports).
    const nodeBounds = getModelNodeLocalBounds(entity, assets);
    return nodeBounds ? boundsOf(nodeBounds.min, nodeBounds.max) : null;
  }
  const fit = getColliderAutoFitBounds(mesh, assets);
  if (!fit) return null;
  return boundsOf(
    [
      fit.center[0] - fit.halfExtents[0],
      fit.center[1] - fit.halfExtents[1],
      fit.center[2] - fit.halfExtents[2],
    ],
    [
      fit.center[0] + fit.halfExtents[0],
      fit.center[1] + fit.halfExtents[1],
      fit.center[2] + fit.halfExtents[2],
    ],
  );
}

/**
 * The axis-aligned world bounds of an Entity, optionally including its subtree.
 *
 * A rotated child is measured by transforming the eight corners of its local
 * box and taking the extremes, so the result is the axis-aligned box that
 * contains the rotated one — the same thing a viewport bounding box shows, and
 * conservative in the direction that matters when the caller is deciding
 * whether two things overlap.
 */
export function getEntityWorldBounds(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  options: { includeDescendants?: boolean } = {},
): EntityBoundsResult {
  const root = scene.entities[entityId];
  if (!root) {
    return { world: null, local: null, measured: [], unmeasured: [] };
  }
  const includeDescendants = options.includeDescendants ?? true;
  const measured: string[] = [];
  const unmeasured: string[] = [];
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;

  const visit = (current: SceneEntity): void => {
    const local = localMeshBounds(current, assets);
    const hasMesh =
      current.components.some((component) => component.type === "mesh") ||
      isModelNodeGeometryEntity(current);
    if (local) {
      measured.push(current.id);
      const matrix = entityWorldMatrix(scene, current.id);
      for (const corner of [
        [local.min[0], local.min[1], local.min[2]],
        [local.min[0], local.min[1], local.max[2]],
        [local.min[0], local.max[1], local.min[2]],
        [local.min[0], local.max[1], local.max[2]],
        [local.max[0], local.min[1], local.min[2]],
        [local.max[0], local.min[1], local.max[2]],
        [local.max[0], local.max[1], local.min[2]],
        [local.max[0], local.max[1], local.max[2]],
      ] as Vec3[]) {
        const point = transformPoint(matrix, corner);
        min = min
          ? [
              Math.min(min[0], point[0]),
              Math.min(min[1], point[1]),
              Math.min(min[2], point[2]),
            ]
          : point;
        max = max
          ? [
              Math.max(max[0], point[0]),
              Math.max(max[1], point[1]),
              Math.max(max[2], point[2]),
            ]
          : point;
      }
    } else if (hasMesh) {
      unmeasured.push(current.id);
    }
    if (!includeDescendants) return;
    for (const childId of current.children) {
      const child = scene.entities[childId];
      if (child) visit(child);
    }
  };
  visit(root);

  return {
    world: min && max ? boundsOf(min, max) : null,
    local: localMeshBounds(root, assets),
    measured,
    unmeasured,
  };
}
