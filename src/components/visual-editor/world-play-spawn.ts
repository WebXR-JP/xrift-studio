import type { Vec3 } from "../../lib/visual-editor/scene-document";

/**
 * The player capsule XRift spawns, mirrored from `@xrift/world-components`.
 *
 * Play drives the official `PhysicsPlayer`, and that component positions its
 * RigidBody by the capsule *centre*. A SpawnPoint marks the floor the author
 * dropped it on, so the two differ by half the capsule. Getting this wrong is
 * not cosmetic: spawning at the floor position drops the capsule half inside
 * the ground, and Rapier answers by shoving the player through it.
 *
 * The numbers are duplicated rather than imported so this module stays free of
 * Three.js and can run in the fixture suite; `runWorldPlaySpawnFixtureAssertions`
 * compares them against the package's own constants, so a capsule resize in
 * `@xrift/world-components` fails the suite instead of drifting silently.
 */
export const WORLD_PLAY_PLAYER_HALF_HEIGHT = 0.4;
export const WORLD_PLAY_PLAYER_RADIUS = 0.4;

/** Distance from the floor a SpawnPoint marks to the capsule's centre. */
export const WORLD_PLAY_CAPSULE_GROUND_OFFSET =
  WORLD_PLAY_PLAYER_HALF_HEIGHT + WORLD_PLAY_PLAYER_RADIUS;

/**
 * Lifts a resolved SpawnPoint position onto the player capsule's centre.
 */
export function resolveWorldPlayCapsuleSpawn(groundPosition: Vec3): Vec3 {
  return [
    groundPosition[0],
    groundPosition[1] + WORLD_PLAY_CAPSULE_GROUND_OFFSET,
    groundPosition[2],
  ];
}
