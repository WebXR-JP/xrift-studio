/**
 * Where the recording camera sits, and how a caller moves it.
 *
 * The pose is three numbers the author can read back: position, look-at
 * target, and vertical field of view. It is saved per project as Editor State,
 * and applied to the live Scene View camera only while the recording view is
 * shown with `cameraSource: "recording"`.
 *
 * Moving it is a pure function over bounds the viewport measured, so an MCP
 * call can reframe the world without the camera ever leaving the pose the
 * author is looking at when the recording view is hidden.
 */

import { resolveFocusDistance } from "../visual-editor/gizmo-focus";
import type { Vec3 } from "../visual-editor/scene-document";

export type RecordingCameraPose = {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
};

export const DEFAULT_RECORDING_CAMERA_POSE: RecordingCameraPose = Object.freeze({
  position: [7, 5, 7],
  target: [0, 0.7, 0],
  fov: 50,
}) as RecordingCameraPose;

export const RECORDING_CAMERA_PRESETS = [
  "top",
  "front",
  "back",
  "left",
  "right",
  "iso",
] as const;
export type RecordingCameraPreset = (typeof RECORDING_CAMERA_PRESETS)[number];

/** Unit view directions, pointing from the target toward the camera. */
const PRESET_DIRECTIONS: Record<RecordingCameraPreset, Vec3> = {
  top: [0, 1, 0.0001],
  front: [0, 0.35, 1],
  back: [0, 0.35, -1],
  left: [-1, 0.35, 0],
  right: [1, 0.35, 0],
  iso: [1, 0.8, 1],
};

export type RecordingCameraBounds = {
  center: Vec3;
  radius: number;
};

export type RecordingCameraMove = {
  /** Explicit placement; taken literally. */
  position?: Vec3;
  target?: Vec3;
  /** A named direction. Keeps the current look-at unless bounds are given. */
  preset?: RecordingCameraPreset;
  /** Bounds to frame: the whole world, or one Entity. */
  bounds?: RecordingCameraBounds | null;
  /** Overrides the distance a preset or a framing would have chosen. */
  distance?: number;
  fov?: number;
};

export const RECORDING_CAMERA_MIN_DISTANCE = 1.5;
export const RECORDING_CAMERA_MAX_DISTANCE = 5_000;

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function scaleTo(v: Vec3, target: number): Vec3 {
  const current = length(v);
  if (current < 1e-6) return [0, 0, target];
  const factor = target / current;
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function round(v: Vec3): Vec3 {
  return [
    Math.round(v[0] * 1000) / 1000,
    Math.round(v[1] * 1000) / 1000,
    Math.round(v[2] * 1000) / 1000,
  ];
}

export function isRecordingCameraPreset(
  candidate: unknown,
): candidate is RecordingCameraPreset {
  return (RECORDING_CAMERA_PRESETS as readonly unknown[]).includes(candidate);
}

function isVec3(candidate: unknown): candidate is Vec3 {
  return (
    Array.isArray(candidate) &&
    candidate.length === 3 &&
    candidate.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

export function normalizeRecordingCameraPose(
  candidate: unknown,
  base: RecordingCameraPose = DEFAULT_RECORDING_CAMERA_POSE,
): RecordingCameraPose {
  const source =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : {};
  const fov =
    typeof source.fov === "number" && Number.isFinite(source.fov)
      ? Math.min(150, Math.max(10, source.fov))
      : base.fov;
  return {
    position: isVec3(source.position) ? [...source.position] : [...base.position],
    target: isVec3(source.target) ? [...source.target] : [...base.target],
    fov,
  };
}

/**
 * The pose a move produces.
 *
 * Explicit `position` / `target` win over everything else. Otherwise the
 * target is the bounds centre when bounds were given and the current target
 * when they were not, the direction is the preset's or the current one, and
 * the distance is what fits the bounds into the frame at this fov and aspect,
 * falling back to the current distance when there is nothing to fit.
 */
export function resolveRecordingCameraPose(
  current: RecordingCameraPose,
  move: RecordingCameraMove,
  frame: { aspect: number },
): RecordingCameraPose {
  const fov = move.fov ?? current.fov;
  if (move.position || move.target) {
    const target = move.target ?? current.target;
    const position =
      move.position ??
      add(target, subtract(current.position, current.target));
    return { position: round(position), target: round(target), fov };
  }

  const target = move.bounds ? move.bounds.center : current.target;
  const currentOffset = subtract(current.position, current.target);
  const previousDistance = length(currentOffset);
  const distance =
    move.distance ??
    resolveFocusDistance({
      radius: move.bounds?.radius ?? 0,
      currentDistance: previousDistance > 0.01 ? previousDistance : 8,
      verticalFov: (fov * Math.PI) / 180,
      aspect: frame.aspect,
      minDistance: RECORDING_CAMERA_MIN_DISTANCE,
      maxDistance: RECORDING_CAMERA_MAX_DISTANCE,
    });
  const direction: Vec3 = move.preset
    ? PRESET_DIRECTIONS[move.preset]
    : previousDistance > 1e-6
      ? currentOffset
      : PRESET_DIRECTIONS.iso;
  const offset = scaleTo(direction, distance);
  return { position: round(add(target, offset)), target: round(target), fov };
}

/** The bounding sphere that contains every sphere given. */
export function unionRecordingCameraBounds(
  bounds: readonly RecordingCameraBounds[],
): RecordingCameraBounds | null {
  if (bounds.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const entry of bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], entry.center[axis] - entry.radius);
      max[axis] = Math.max(max[axis], entry.center[axis] + entry.radius);
    }
  }
  const center: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius = length(subtract(max, center));
  return { center, radius };
}
