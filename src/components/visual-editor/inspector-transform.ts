import type { Vec3 } from "../../lib/visual-editor/scene-document";

export const DEFAULT_SCALE_LINKED = false;
export const MIN_SCALE_MAGNITUDE = 0.0001;
export type TransformValueKind = "position" | "rotation" | "scale";

function normalizeScaleAxis(value: number, fallback: number): number {
  if (Math.abs(value) >= MIN_SCALE_MAGNITUDE) return value;
  const sign = value < 0 ? -1 : value > 0 ? 1 : fallback < 0 ? -1 : 1;
  return sign * MIN_SCALE_MAGNITUDE;
}

export function updateVectorAxis(
  value: Vec3,
  axisIndex: number,
  axisValue: number,
  valueKind: TransformValueKind,
  scaleLinked: boolean,
): Vec3 {
  const next: Vec3 = [value[0], value[1], value[2]];
  if (valueKind !== "scale") {
    next[axisIndex] = axisValue;
    return next;
  }

  const normalizedAxisValue = normalizeScaleAxis(axisValue, value[axisIndex]);
  if (!scaleLinked) {
    next[axisIndex] = normalizedAxisValue;
    return next;
  }

  const ratio = normalizedAxisValue / value[axisIndex];
  return value.map((entry) =>
    normalizeScaleAxis(entry * ratio, entry),
  ) as Vec3;
}
