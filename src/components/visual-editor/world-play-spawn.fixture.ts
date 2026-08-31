import {
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from "@xrift/world-components/dist/components/DevEnvironment/constants";

import {
  WORLD_PLAY_CAPSULE_GROUND_OFFSET,
  WORLD_PLAY_PLAYER_HALF_HEIGHT,
  WORLD_PLAY_PLAYER_RADIUS,
  resolveWorldPlayCapsuleSpawn,
} from "./world-play-spawn";

/**
 * Asserts that Play spawns the official player capsule above the floor.
 *
 * The capsule numbers are the ones `@xrift/world-components` gives every world,
 * so they are compared against the package rather than trusted: a capsule
 * resize upstream would otherwise leave Play spawning the player half inside
 * the ground, and Rapier answers that by pushing them through it.
 */
export function runWorldPlaySpawnFixtureAssertions(): void {
  assert(
    WORLD_PLAY_PLAYER_HALF_HEIGHT === PLAYER_HALF_HEIGHT,
    `Capsule half height drifted from @xrift/world-components: ${WORLD_PLAY_PLAYER_HALF_HEIGHT} vs ${PLAYER_HALF_HEIGHT}`,
  );
  assert(
    WORLD_PLAY_PLAYER_RADIUS === PLAYER_RADIUS,
    `Capsule radius drifted from @xrift/world-components: ${WORLD_PLAY_PLAYER_RADIUS} vs ${PLAYER_RADIUS}`,
  );

  const spawn = resolveWorldPlayCapsuleSpawn([1.5, 2, -3.25]);
  assert(
    spawn[0] === 1.5 && spawn[2] === -3.25,
    `Spawn must keep the SpawnPoint's ground position on X and Z, got ${spawn.join(", ")}`,
  );
  assert(
    spawn[1] === 2 + WORLD_PLAY_CAPSULE_GROUND_OFFSET,
    `Spawn must lift the capsule centre by ${WORLD_PLAY_CAPSULE_GROUND_OFFSET}m, got ${spawn[1]}`,
  );
  assert(
    WORLD_PLAY_CAPSULE_GROUND_OFFSET > 0,
    "The capsule centre must sit above the floor a SpawnPoint marks",
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`World Play spawn fixture failed: ${message}`);
}
