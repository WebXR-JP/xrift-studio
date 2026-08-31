/**
 * Publishes XRift's instance state so a graph can share what an action changed.
 *
 * `useInstanceStateContext` is the platform's own synchronisation: the values
 * travel over xrift-frontend's socket, and `states` holds what the instance
 * currently agrees on. This component does nothing but make that reachable from
 * the Three.js scene, the way the Scene and player bridges are - so Studio's
 * Play and a published world go through one path.
 *
 * In Studio there is one viewer and the package's default implementation is a
 * local Map, so a shared action behaves like a local one. That is honest rather
 * than fake: the same send and the same receive run, and the room is simply a
 * room of one.
 */
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useInstanceStateContext } from "@xrift/world-components";
import {
  XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY,
  type XriftInstanceStateRuntimeBridge,
  type XriftSharedActionPayload,
} from "./instance-state-runtime.js";

/** Only the ids this runtime owns, so an unrelated world state is left alone. */
const SHARED_ACTION_PREFIX = "xrift-action:";

function isSharedActionPayload(
  value: unknown,
): value is XriftSharedActionPayload {
  return typeof value === "object" && value !== null && "value" in value;
}

export function XriftInstanceStateRuntime({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const { states, sendState } = useInstanceStateContext();
  const listeners = useRef(
    new Set<(stateId: string, payload: XriftSharedActionPayload) => void>(),
  );
  /** What each id was last seen as, so a re-render is not replayed as a change. */
  const seen = useRef(new Map<string, string>());

  const bridge = useMemo<XriftInstanceStateRuntimeBridge>(
    () => ({
      send(stateId, payload) {
        sendState(stateId, payload);
      },
      entries() {
        const collected: Array<readonly [string, XriftSharedActionPayload]> = [];
        for (const [stateId, payload] of states) {
          if (!stateId.startsWith(SHARED_ACTION_PREFIX)) continue;
          if (!isSharedActionPayload(payload)) continue;
          collected.push([stateId, payload]);
        }
        return collected;
      },
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [sendState, states],
  );

  useEffect(() => {
    if (!enabled) return;
    const holder = scene.userData as Record<string, unknown>;
    holder[XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, enabled, scene]);

  // The platform hands the map back on every change, so what changed is found
  // by comparing rather than by being told. Serialising is what makes a value
  // that arrived unchanged - a re-render, a reconnect - stop being an event.
  useEffect(() => {
    if (!enabled) return;
    for (const [stateId, payload] of states) {
      if (!stateId.startsWith(SHARED_ACTION_PREFIX)) continue;
      if (!isSharedActionPayload(payload)) continue;
      const encoded = JSON.stringify(payload);
      if (seen.current.get(stateId) === encoded) continue;
      seen.current.set(stateId, encoded);
      for (const listener of [...listeners.current]) listener(stateId, payload);
    }
  }, [enabled, states]);

  return null;
}
