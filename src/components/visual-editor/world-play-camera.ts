/** Pointer speed for World Play look, in radians per pointer pixel. */
export const WORLD_PLAY_CAMERA_LOOK_SENSITIVITY = 0.0025;
/** Keeps the view just short of straight up or straight down. */
export const WORLD_PLAY_CAMERA_MAX_PITCH = Math.PI / 2 - 0.08;

/** Camera orientation for World Play, in radians, applied as a `YXZ` Euler. */
export type WorldPlayCameraLook = {
  yaw: number;
  pitch: number;
};

/**
 * Turns pointer drag distance into a new World Play look direction.
 *
 * Play follows the first-person convention players expect from a world: drag
 * right and the view turns right, drag down and the view looks down. The
 * camera faces its local -Z, so under Three.js' `YXZ` order a *positive* yaw
 * swings that forward vector toward -X (left) and a positive pitch tilts it up.
 * Both deltas are therefore subtracted. Play used to add them, which made the
 * view follow the pointer grab-style and read as inverted on both axes.
 */
export function applyWorldPlayCameraLook(
  look: WorldPlayCameraLook,
  deltaX: number,
  deltaY: number,
  sensitivity = WORLD_PLAY_CAMERA_LOOK_SENSITIVITY,
): WorldPlayCameraLook {
  return {
    yaw: look.yaw - deltaX * sensitivity,
    pitch: Math.max(
      -WORLD_PLAY_CAMERA_MAX_PITCH,
      Math.min(
        WORLD_PLAY_CAMERA_MAX_PITCH,
        look.pitch - deltaY * sensitivity,
      ),
    ),
  };
}
