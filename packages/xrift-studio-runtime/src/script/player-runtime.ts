/**
 * The player, as an Interactivity Graph can move it.
 *
 * A graph that says「押したら移動する」has to reach the person holding the
 * mouse, and that person belongs to whoever is running the world:
 * xrift-frontend after upload, Studio's own player in Play. Neither is
 * reachable from a Scene the graph can see, so both park the same bridge on the
 * Three.js scene and the trigger applier finds it there - the same shape the
 * Scene, Audio Source, Light, Particle and Text bridges already use.
 *
 * Only the contract lives here. The component that fills it in is
 * `player-runtime-host.tsx`, which needs `@xrift/world-components`; keeping
 * them apart is what lets the trigger runtime read the bridge without dragging
 * an optional peer dependency into every consumer of `./script`.
 */
import type { Object3D } from "three";

export const XRIFT_PLAYER_RUNTIME_USER_DATA_KEY = "xriftPlayerRuntime" as const;

export type XriftPlayerTeleportDestination = {
  /** Where the player's feet land, in world space, like a SpawnPoint. */
  position: [number, number, number];
  /** Heading in degrees. Omitted keeps the direction the player is facing. */
  yaw?: number;
};

export type XriftPlayerRuntimeBridge = {
  teleport: (destination: XriftPlayerTeleportDestination) => void;
};

export function isXriftPlayerRuntimeBridge(
  value: unknown,
): value is XriftPlayerRuntimeBridge {
  const candidate = value as XriftPlayerRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.teleport === "function"
  );
}

export function findXriftPlayerRuntimeBridge(
  root: Object3D,
): XriftPlayerRuntimeBridge | null {
  const candidate = (root.userData as Record<string, unknown>)[
    XRIFT_PLAYER_RUNTIME_USER_DATA_KEY
  ];
  return isXriftPlayerRuntimeBridge(candidate) ? candidate : null;
}
