import { Box3, Euler, Matrix4, Quaternion, Sphere, Vector3 } from "three";
import type { Object3D } from "three";

import type { SceneDocument, Vec3 } from "./scene-document";
import { getTransform } from "./scene-document";

const EDITOR_HELPER_FLAG = "editorHelper";

/**
 * Marks an Object3D as editor chrome rather than authored world content.
 *
 * The collider wireframe appears exactly when an Entity is selected, and it is
 * routinely larger than the mesh and offset from the Entity origin. Measuring
 * it would pull the focus frame onto a volume the author never sees, leaving
 * the transform gizmo sitting off-centre from the object it belongs to. Light
 * direction arrows and Terrain outlines have the same problem, so they carry
 * this flag too.
 */
export const EDITOR_HELPER_USER_DATA = Object.freeze({
  [EDITOR_HELPER_FLAG]: true,
});

export type EntityFocusBounds = {
  /** Centre of the bounding sphere, in world space. */
  center: Vec3;
  radius: number;
};

/**
 * Screen-sized draw types never describe how big an object is: gizmo handles,
 * selection edges and billboard icons keep a constant pixel size, and a
 * particle system's point cloud grows and shrinks every frame. Framing any of
 * them would move the camera for reasons the author cannot see.
 */
const NON_MEASURABLE_OBJECT_FLAGS = [
  "isTransformControls",
  "isLine",
  "isLineSegments",
  "isLine2",
  "isLineSegments2",
  "isPoints",
  "isSprite",
] as const;

/**
 * Whether an object is editor chrome or a screen-sized draw type, which never
 * says how big the authored world is. Exported for the recording camera's
 * whole-Scene measurement, which walks the scene graph directly.
 */
export function skipsFocusMeasurement(object: Object3D): boolean {
  if (object.userData?.[EDITOR_HELPER_FLAG] === true) return true;
  const flags = object as unknown as Record<string, unknown>;
  return NON_MEASURABLE_OBJECT_FLAGS.some((flag) => flags[flag] === true);
}

type MeasurableGeometry = {
  boundingBox: Box3 | null;
  computeBoundingBox: () => void;
};

/**
 * World-space bounds of what the author actually sees for one Entity.
 *
 * `Box3.setFromObject` cannot be used here: it walks hidden subtrees and every
 * editor helper, so a disabled child or a selected Entity's collider box would
 * decide where the camera lands. Returns null when the Entity draws nothing
 * measurable - a Spawn Point marker, a bare grouping Entity - and the caller
 * then frames the Entity origin, which is where the gizmo sits.
 */
export function computeEntityFocusBounds(
  root: Object3D,
): EntityFocusBounds | null {
  root.updateWorldMatrix(true, true);

  const bounds = new Box3();
  const geometryBounds = new Box3();
  let measured = false;

  const visit = (object: Object3D, isRoot: boolean): void => {
    // The root's own visibility is the Entity's enabled flag. An author can
    // focus a disabled Entity to find it again, so only descendants are
    // filtered by visibility.
    if (!isRoot && (!object.visible || skipsFocusMeasurement(object))) return;

    const geometry = (object as Object3D & { geometry?: MeasurableGeometry })
      .geometry;
    if (geometry) {
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        geometryBounds
          .copy(geometry.boundingBox)
          .applyMatrix4(object.matrixWorld);
        if (!geometryBounds.isEmpty()) {
          bounds.union(geometryBounds);
          measured = true;
        }
      }
    }

    for (const child of object.children) visit(child, false);
  };

  visit(root, true);
  if (!measured || bounds.isEmpty()) return null;

  const sphere = bounds.getBoundingSphere(new Sphere());
  return {
    center: [sphere.center.x, sphere.center.y, sphere.center.z],
    radius: sphere.radius,
  };
}

export type FocusDistanceOptions = {
  /** Bounding radius of the framed object; 0 when nothing was measurable. */
  radius: number;
  /** Distance between the camera and its orbit target before focusing. */
  currentDistance: number;
  /** Perspective vertical field of view in radians; omit for orthographic. */
  verticalFov?: number;
  /** Viewport aspect ratio, used to respect a narrow window's width. */
  aspect?: number;
  minDistance: number;
  maxDistance: number;
};

/** Keeps a focused object clear of the near plane without leaving it a speck. */
const FOCUS_DISTANCE_MARGIN = 1.15;

/**
 * Distance the camera should sit from a framed object.
 *
 * The limiting field of view is the narrower of vertical and horizontal, so a
 * wide, short window pulls back far enough to keep the object inside the frame
 * instead of cropping its sides.
 */
export function resolveFocusDistance({
  radius,
  currentDistance,
  verticalFov,
  aspect,
  minDistance,
  maxDistance,
}: FocusDistanceOptions): number {
  const fallback = Math.min(
    Math.max(minDistance, currentDistance),
    Math.max(minDistance, maxDistance),
  );
  if (!(radius > 0.001) || verticalFov === undefined || !(verticalFov > 0)) {
    return fallback;
  }
  const horizontalFov =
    aspect && aspect > 0
      ? 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
      : verticalFov;
  const limitingFov = Math.max(
    Math.min(verticalFov, horizontalFov),
    Math.PI / 180,
  );
  const fitted = (radius / Math.sin(limitingFov / 2)) * FOCUS_DISTANCE_MARGIN;
  return Math.min(
    Math.max(minDistance, fitted),
    Math.max(minDistance, maxDistance),
  );
}

/**
 * World position of an Entity as the document describes it.
 *
 * The Scene stores every transform in its parent's space, so the local
 * position of a child Entity is not a place the camera can look at. This walks
 * the ancestry the same way the renderer nests groups, and is the fallback used
 * when the Entity has no object in the scene graph yet.
 */
export function resolveEntityWorldPosition(
  scene: SceneDocument,
  entityId: string,
): Vec3 | null {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = entityId;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (!scene.entities[current]) return null;
    chain.unshift(current);
    current = scene.entities[current].parentId ?? undefined;
  }

  const world = new Matrix4();
  const local = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const euler = new Euler();
  for (const id of chain) {
    const transform = getTransform(scene.entities[id]);
    if (!transform) continue;
    position.fromArray(transform.position);
    euler.fromArray(transform.rotation);
    quaternion.setFromEuler(euler);
    scale.fromArray(transform.scale);
    world.multiply(local.compose(position, quaternion, scale));
  }
  position.setFromMatrixPosition(world);
  return [position.x, position.y, position.z];
}
