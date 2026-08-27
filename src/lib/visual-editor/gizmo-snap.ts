import type { TransformPatch, Vec3 } from "./scene-document";
import type { SceneGizmoSettings } from "./scene-settings";

/**
 * Snap turns a free gizmo drag into fixed steps. The step sizes live in
 * SceneGizmoSettings because a scene laid out on a 0.25m grid should keep that
 * grid when it is reopened; the helpers here are the only place that decides
 * whether snap is currently active and how far one step moves an Entity, so
 * the toolbar, the keyboard nudge and the gizmo cannot drift apart.
 */

/** Mirrors the editor's TransformMode without inverting the lib -> components dependency. */
export type GizmoTransformMode = "translate" | "rotate" | "scale";

export type NudgeAxis = "x" | "y" | "z";

/** +1 steps toward positive axis values, -1 toward negative. */
export type NudgeDirection = 1 | -1;

export const SNAP_TRANSLATE_MIN = 0.001;
export const SNAP_ROTATE_DEGREES_MIN = 0.1;
export const SNAP_SCALE_MIN = 0.001;

/** Offered as one-click chips so the common grids never need typing. */
export const SNAP_TRANSLATE_PRESETS = [0.1, 0.25, 0.5, 1] as const;
export const SNAP_ROTATE_DEGREES_PRESETS = [5, 15, 45, 90] as const;
export const SNAP_SCALE_PRESETS = [0.05, 0.1, 0.25, 0.5] as const;

/** Float noise from earlier drags must not read as "already off the lattice". */
const LATTICE_EPSILON = 1e-6;

/** Scale may approach zero but never reach it, or the Entity disappears. */
const MIN_SCALE = 1e-4;

/**
 * The toggle is the resting state and the hold modifier inverts it, so one key
 * covers both "snap just this drag" and "escape the grid for just this drag".
 */
export function resolveSnapActive(
  gizmo: Pick<SceneGizmoSettings, "snapEnabled" | "snapHoldShift">,
  modifierHeld: boolean,
): boolean {
  return gizmo.snapHoldShift && modifierHeld
    ? !gizmo.snapEnabled
    : gizmo.snapEnabled;
}

/** Degrees for rotate; world units for translate; a scale factor for scale. */
export function snapStepForMode(
  gizmo: Pick<
    SceneGizmoSettings,
    "translateSnap" | "rotateSnapDegrees" | "scaleSnap"
  >,
  mode: GizmoTransformMode,
): number {
  switch (mode) {
    case "rotate":
      return gizmo.rotateSnapDegrees;
    case "scale":
      return gizmo.scaleSnap;
    default:
      return gizmo.translateSnap;
  }
}

export function minSnapStepForMode(mode: GizmoTransformMode): number {
  switch (mode) {
    case "rotate":
      return SNAP_ROTATE_DEGREES_MIN;
    case "scale":
      return SNAP_SCALE_MIN;
    default:
      return SNAP_TRANSLATE_MIN;
  }
}

export function snapPresetsForMode(
  mode: GizmoTransformMode,
): readonly number[] {
  switch (mode) {
    case "rotate":
      return SNAP_ROTATE_DEGREES_PRESETS;
    case "scale":
      return SNAP_SCALE_PRESETS;
    default:
      return SNAP_TRANSLATE_PRESETS;
  }
}

/** Short enough for a toolbar button, with the unit so the number is readable. */
export function formatSnapStep(
  mode: GizmoTransformMode,
  step: number,
): string {
  const value = trimNumber(step);
  switch (mode) {
    case "rotate":
      return `${value}°`;
    case "scale":
      return `x${value}`;
    default:
      return `${value}m`;
  }
}

export function snapStepLabel(mode: GizmoTransformMode): string {
  switch (mode) {
    case "rotate":
      return "回転スナップ";
    case "scale":
      return "拡縮スナップ";
    default:
      return "移動スナップ";
  }
}

export function snapStepUnit(mode: GizmoTransformMode): string {
  switch (mode) {
    case "rotate":
      return "度";
    case "scale":
      return "倍";
    default:
      return "m";
  }
}

/**
 * One keyboard step of the active gizmo mode, applied to the Transform's own
 * X / Y / Z values so the result matches the Inspector fields the user reads.
 * With snap active the value lands on the next lattice point instead of adding
 * a step to an off-grid position, which is what makes repeated presses tidy an
 * Entity up rather than carry its old offset forever.
 */
export function nudgeTransformPatch(
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 },
  mode: GizmoTransformMode,
  axis: NudgeAxis,
  direction: NudgeDirection,
  gizmo: Pick<
    SceneGizmoSettings,
    "translateSnap" | "rotateSnapDegrees" | "scaleSnap"
  >,
  snapActive: boolean,
): TransformPatch | null {
  const index = AXIS_INDEX[axis];
  const step = snapStepForMode(gizmo, mode);
  if (!Number.isFinite(step) || step <= 0) return null;

  if (mode === "rotate") {
    const stepRadians = (step * Math.PI) / 180;
    const rotation = [...transform.rotation] as Vec3;
    rotation[index] = stepValue(
      transform.rotation[index],
      stepRadians,
      direction,
      snapActive,
    );
    return { rotation };
  }

  if (mode === "scale") {
    const scale = [...transform.scale] as Vec3;
    scale[index] = Math.max(
      MIN_SCALE,
      stepValue(transform.scale[index], step, direction, snapActive),
    );
    return { scale };
  }

  const position = [...transform.position] as Vec3;
  position[index] = stepValue(
    transform.position[index],
    step,
    direction,
    snapActive,
  );
  return { position };
}

const AXIS_INDEX: Record<NudgeAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * Off-lattice values step to the neighbouring lattice point in the requested
 * direction rather than jumping a full step past it.
 */
function stepValue(
  current: number,
  step: number,
  direction: NudgeDirection,
  snapActive: boolean,
): number {
  if (!Number.isFinite(current)) return direction * step;
  if (!snapActive) return roundNoise(current + direction * step);
  const ratio = current / step;
  const nearest = Math.round(ratio);
  const onLattice = Math.abs(ratio - nearest) < LATTICE_EPSILON;
  const nextRatio = onLattice
    ? nearest + direction
    : direction > 0
      ? Math.floor(ratio) + 1
      : Math.ceil(ratio) - 1;
  return roundNoise(nextRatio * step);
}

/** Keeps 0.1 + 0.2 style drift out of the document and the Inspector. */
function roundNoise(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(4)));
}
