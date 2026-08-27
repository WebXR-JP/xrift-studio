import { Euler, Vector3 } from "three";

import {
  WORLD_PLAY_CAMERA_MAX_PITCH,
  applyWorldPlayCameraLook,
  type WorldPlayCameraLook,
} from "./world-play-camera";

/** The world direction the Play camera faces for a given look. */
function forwardOf(look: WorldPlayCameraLook): Vector3 {
  return new Vector3(0, 0, -1).applyEuler(
    new Euler(look.pitch, look.yaw, 0, "YXZ"),
  );
}

/** Asserts that World Play look follows the pointer's own direction. */
export function runWorldPlayCameraFixtureAssertions(): void {
  const level: WorldPlayCameraLook = { yaw: 0, pitch: 0 };

  const draggedRight = forwardOf(applyWorldPlayCameraLook(level, 120, 0));
  assert(
    draggedRight.x > 0,
    `Dragging right must turn the view right (+X), got forward x ${draggedRight.x}`,
  );

  const draggedLeft = forwardOf(applyWorldPlayCameraLook(level, -120, 0));
  assert(
    draggedLeft.x < 0,
    `Dragging left must turn the view left (-X), got forward x ${draggedLeft.x}`,
  );

  const draggedDown = forwardOf(applyWorldPlayCameraLook(level, 0, 120));
  assert(
    draggedDown.y < 0,
    `Dragging down must look down, got forward y ${draggedDown.y}`,
  );

  const draggedUp = forwardOf(applyWorldPlayCameraLook(level, 0, -120));
  assert(
    draggedUp.y > 0,
    `Dragging up must look up, got forward y ${draggedUp.y}`,
  );

  const flungUp = applyWorldPlayCameraLook(level, 0, -100000);
  const flungDown = applyWorldPlayCameraLook(level, 0, 100000);
  assert(
    flungUp.pitch === WORLD_PLAY_CAMERA_MAX_PITCH &&
      flungDown.pitch === -WORLD_PLAY_CAMERA_MAX_PITCH,
    `Pitch must stay within +-${WORLD_PLAY_CAMERA_MAX_PITCH}, got ${flungUp.pitch} and ${flungDown.pitch}`,
  );

  const spun = applyWorldPlayCameraLook({ yaw: 2, pitch: 0 }, 100000, 0);
  assert(
    Number.isFinite(spun.yaw) && spun.yaw < 2,
    `Yaw must keep turning without a clamp, got ${spun.yaw}`,
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`World Play camera fixture failed: ${message}`);
}
