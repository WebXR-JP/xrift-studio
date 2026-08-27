import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";
import {
  formatSnapStep,
  nudgeTransformPatch,
  resolveSnapActive,
  snapStepForMode,
} from "./gizmo-snap";
import type { Vec3 } from "./scene-document";

/**
 * Snap has three entry points that must agree: the toolbar toggle, the held
 * modifier and the keyboard nudge. These assertions hold the rules that keep
 * them agreeing - the modifier inverts rather than forces, and one nudge is
 * always one step of the tool the toolbar is showing.
 */
export function runGizmoSnapFixtureAssertions(): void {
  assertModifierInvertsRatherThanForces();
  assertNudgeLandsOnTheLattice();
  assertNudgeWithoutSnapKeepsTheOffset();
  assertNudgeFollowsTheActiveTool();
  assertScaleNudgeStaysPositive();
}

const GIZMO = {
  ...DEFAULT_SCENE_SETTINGS.editor.gizmo,
  translateSnap: 0.5,
  rotateSnapDegrees: 15,
  scaleSnap: 0.1,
};

function transformAt(position: Vec3): {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  return { position, rotation: [0, 0, 0], scale: [1, 1, 1] };
}

/**
 * One key has to cover both "snap just this drag" and "leave the grid just
 * this drag", so the modifier flips whatever the toggle currently says.
 */
function assertModifierInvertsRatherThanForces(): void {
  const off = { snapEnabled: false, snapHoldShift: true };
  const on = { snapEnabled: true, snapHoldShift: true };
  assert(!resolveSnapActive(off, false), "Snap off with no modifier is off");
  assert(resolveSnapActive(off, true), "The modifier snaps a free gizmo");
  assert(resolveSnapActive(on, false), "Snap on with no modifier is on");
  assert(!resolveSnapActive(on, true), "The modifier frees a snapped gizmo");

  const disabled = { snapEnabled: false, snapHoldShift: false };
  assert(
    !resolveSnapActive(disabled, true),
    "A user who turned the modifier off must not get snapping from Shift",
  );
}

/**
 * An Entity nudged off the grid should tidy onto the neighbouring grid line
 * rather than carry its old offset one step further.
 */
function assertNudgeLandsOnTheLattice(): void {
  const patch = nudgeTransformPatch(
    transformAt([0.3, 0, 0]),
    "translate",
    "x",
    1,
    GIZMO,
    true,
  );
  assert(patch?.position?.[0] === 0.5, `0.3 steps up to 0.5, got ${patch?.position?.[0]}`);

  const back = nudgeTransformPatch(
    transformAt([0.3, 0, 0]),
    "translate",
    "x",
    -1,
    GIZMO,
    true,
  );
  assert(back?.position?.[0] === 0, `0.3 steps down to 0, got ${back?.position?.[0]}`);

  const onGrid = nudgeTransformPatch(
    transformAt([0.5, 0, 0]),
    "translate",
    "x",
    1,
    GIZMO,
    true,
  );
  assert(
    onGrid?.position?.[0] === 1,
    `An on-grid value moves a whole step, got ${onGrid?.position?.[0]}`,
  );

  assert(
    onGrid?.position?.[1] === 0 && onGrid?.position?.[2] === 0,
    "Only the requested axis moves",
  );
  assert(
    onGrid?.rotation === undefined && onGrid?.scale === undefined,
    "A translate nudge must not patch rotation or scale",
  );
}

/** With snap off the step is still exact, but it must not reposition anything. */
function assertNudgeWithoutSnapKeepsTheOffset(): void {
  const patch = nudgeTransformPatch(
    transformAt([0.3, 0, 0]),
    "translate",
    "x",
    1,
    GIZMO,
    false,
  );
  assert(
    patch?.position?.[0] === 0.8,
    `A free nudge adds the step, got ${patch?.position?.[0]}`,
  );
}

/** The nudge is the keyboard form of the active gizmo, not a second tool. */
function assertNudgeFollowsTheActiveTool(): void {
  const rotated = nudgeTransformPatch(
    transformAt([0, 0, 0]),
    "rotate",
    "y",
    1,
    GIZMO,
    true,
  );
  const expected = Number(((15 * Math.PI) / 180).toFixed(6));
  assert(
    rotated?.rotation?.[1] === expected,
    `A rotate nudge steps the snap angle in radians, got ${rotated?.rotation?.[1]}`,
  );
  assert(
    rotated?.position === undefined,
    "A rotate nudge must not patch position",
  );

  assert(
    snapStepForMode(GIZMO, "rotate") === 15 &&
      snapStepForMode(GIZMO, "scale") === 0.1 &&
      snapStepForMode(GIZMO, "translate") === 0.5,
    "Each tool reads its own step",
  );
  assert(
    formatSnapStep("rotate", 15) === "15°" &&
      formatSnapStep("translate", 0.5) === "0.5m" &&
      formatSnapStep("scale", 0.1) === "x0.1",
    "The toolbar label carries the unit of the active tool",
  );
}

/** A scale that reaches zero makes the Entity vanish with no way back. */
function assertScaleNudgeStaysPositive(): void {
  let scale = 1;
  for (let step = 0; step < 40; step += 1) {
    const patch = nudgeTransformPatch(
      { position: [0, 0, 0], rotation: [0, 0, 0], scale: [scale, 1, 1] },
      "scale",
      "x",
      -1,
      GIZMO,
      true,
    );
    scale = patch?.scale?.[0] ?? scale;
    assert(scale > 0, `Scale must stay positive, reached ${scale}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
