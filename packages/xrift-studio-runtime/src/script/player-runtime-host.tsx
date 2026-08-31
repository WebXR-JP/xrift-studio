/**
 * Publishes the running player so Interactivity Graphs can move it.
 *
 * `useTeleport()` is the one call in the middle, which is what keeps Play and
 * the published world on one path: a graph that teleports in the editor
 * teleports after upload, or it fails in both places for the same reason.
 *
 * Mounted for the length of a run, inside whatever provides the teleport
 * implementation. Nothing here is synchronised: a graph runs inside each
 * viewer's own runtime, so「押したら移動する」moves whoever pressed it.
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useTeleportContext } from "@xrift/world-components";
import {
  XRIFT_PLAYER_RUNTIME_USER_DATA_KEY,
  type XriftPlayerRuntimeBridge,
} from "./player-runtime.js";

export function XriftPlayerRuntime({ enabled = true }: { enabled?: boolean }) {
  const scene = useThree((state) => state.scene);
  const { teleport } = useTeleportContext();
  const bridge = useMemo<XriftPlayerRuntimeBridge>(
    () => ({ teleport: (destination) => teleport(destination) }),
    [teleport],
  );

  useEffect(() => {
    if (!enabled) return;
    const holder = scene.userData as Record<string, unknown>;
    holder[XRIFT_PLAYER_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_PLAYER_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, enabled, scene]);

  return null;
}
