import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "../../scene-document";
import type { SpatialSurface } from "./spatial-capture";

/** Bounds in the captured local frame; do not assume polygons are centred at the origin. */
export function spatialSurfaceBounds(surface: SpatialSurface): SpatialSurface["bounds"] {
  if (surface.bounds) return surface.bounds;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, z: number) => {
    min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x);
    min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y);
    min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
  };
  if (surface.boundary?.points.length) {
    for (const point of surface.boundary.points) add(...point);
  } else if (surface.mesh?.vertices.length) {
    const vertices = surface.mesh.vertices;
    for (let i = 0; i + 2 < vertices.length; i += 3) add(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!);
  } else {
    return undefined;
  }
  return { min, max };
}

export function spatialSurfaceSize(surface: SpatialSurface): Vec3 | null {
  const bounds = spatialSurfaceBounds(surface);
  return bounds ? bounds.max.map((max, axis) => Math.max(0.01, max - bounds.min[axis]!)) as Vec3 : null;
}

export function quaternionToEuler(rotation: [number, number, number, number]): Vec3 {
  const e = new Euler().setFromQuaternion(new Quaternion(...rotation).normalize(), "XYZ");
  return [e.x, e.y, e.z];
}

export function localOffsetPosition(surface: SpatialSurface, offset: Vec3): Vec3 {
  const value = new Vector3(...offset).multiply(new Vector3(...(surface.pose.scale ?? [1, 1, 1])))
    .applyQuaternion(new Quaternion(...surface.pose.rotation).normalize()).add(new Vector3(...surface.pose.position));
  return [value.x, value.y, value.z];
}
