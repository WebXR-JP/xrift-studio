import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "../../scene-document";
import type { SpatialSurface } from "./spatial-capture";

export function quaternionToEuler(rotation: [number, number, number, number]): Vec3 {
  const e = new Euler().setFromQuaternion(new Quaternion(...rotation).normalize(), "XYZ");
  return [e.x, e.y, e.z];
}

export function localOffsetPosition(surface: SpatialSurface, offset: Vec3): Vec3 {
  const value = new Vector3(...offset).multiply(new Vector3(...(surface.pose.scale ?? [1, 1, 1])))
    .applyQuaternion(new Quaternion(...surface.pose.rotation).normalize()).add(new Vector3(...surface.pose.position));
  return [value.x, value.y, value.z];
}
