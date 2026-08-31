/**
 * Instance-synchronised action state.
 *
 * A trigger graph runs in the runtime of whoever pressed the button, so a door
 * it opens is open for that person alone. That is right for the picture and for
 * where somebody is standing, and wrong for a door - and an author cannot tell
 * which one they built without a second person in the room.
 *
 * XRift already answers this: `useInstanceState(stateId, initial)` is a
 * `useState` whose value the platform synchronises across the instance over its
 * own socket, and `states` holds the current value for every id. Nothing here
 * invents a protocol on top of it. An action marked shared sends its resolved
 * value under a stable id; every runtime in the room applies what arrives, and
 * a late joiner applies what is already in the map. Last write wins, because
 * that is what `sendState` does.
 *
 * Only the contract lives here. The component that fills it in is
 * `instance-state-runtime-host.tsx`, which needs `@xrift/world-components`;
 * keeping them apart is what lets the trigger runtime read the bridge without
 * dragging an optional peer dependency into every consumer of `./script`.
 */
import type { Object3D } from "three";

export const XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY =
  "xriftInstanceStateRuntime" as const;

/**
 * What one shared action broadcasts.
 *
 * The resolved value, never the instruction: a toggle that flipped to `true`
 * must arrive as `true`, or every receiver would flip its own copy and the room
 * would end up in two states.
 */
export type XriftSharedActionPayload = {
  /** Matches `XriftInteractionValue`, minus the kinds that cannot travel. */
  value: unknown;
};

export type XriftInstanceStateRuntimeBridge = {
  /** Broadcasts one action's resolved value to the instance. */
  send: (stateId: string, payload: XriftSharedActionPayload) => void;
  /** Everything the instance already agrees on, for a runtime that just joined. */
  entries: () => ReadonlyArray<readonly [string, XriftSharedActionPayload]>;
  /** Fires whenever any shared value changes, including this viewer's own. */
  subscribe: (
    listener: (stateId: string, payload: XriftSharedActionPayload) => void,
  ) => () => void;
};

export function isXriftInstanceStateRuntimeBridge(
  value: unknown,
): value is XriftInstanceStateRuntimeBridge {
  const candidate = value as XriftInstanceStateRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.send === "function" &&
    typeof candidate.entries === "function" &&
    typeof candidate.subscribe === "function"
  );
}

export function findXriftInstanceStateRuntimeBridge(
  root: Object3D,
): XriftInstanceStateRuntimeBridge | null {
  const candidate = (root.userData as Record<string, unknown>)[
    XRIFT_INSTANCE_STATE_RUNTIME_USER_DATA_KEY
  ];
  return isXriftInstanceStateRuntimeBridge(candidate) ? candidate : null;
}

/**
 * The id one shared action broadcasts under.
 *
 * Every viewer runs the same graph over the same Scene, so the id has to be
 * derived from what the action is - not from anything a runtime generates. Two
 * actions writing the same property of the same Component are the same shared
 * fact and deliberately collide: the last press wins for everyone, which is the
 * only answer that leaves the room agreeing.
 *
 * The Entity must already be resolved: `__xrift_self__` names a different
 * Entity in every graph that uses it, and an unresolved sentinel would make one
 * id mean several doors.
 */
export function xriftSharedActionStateId(target: {
  entityId: string;
  componentId: string | null;
  targetKind: string;
  property: string;
}): string {
  return [
    "xrift-action",
    target.entityId,
    target.componentId ?? "",
    target.targetKind,
    target.property,
  ].join(":");
}
