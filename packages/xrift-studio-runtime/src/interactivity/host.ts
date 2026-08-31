/**
 * The boundary between a behavior graph and the world it changes.
 *
 * The engine knows nothing about three.js, React or the Scene document. Every
 * read and write goes through this contract, which is what lets Studio's Play
 * preview and a published world run the same graph code over different
 * plumbing — and what makes the engine testable without a renderer.
 *
 * Every method is optional. A host that cannot do something simply omits it,
 * and the engine reports the node as unrunnable instead of guessing.
 */

import type { InteractivityEasing, InteractivityValue } from "./value.js";

/** Which Component of which Entity a property write lands on. */
export type InteractivityActionTarget = {
  readonly entityId: string;
  /** `null` for a property that belongs to the Entity itself. */
  readonly componentId: string | null;
  readonly targetKind: string;
  readonly property: string;
  /**
   * Asset the property should point at, for a property whose value is a
   * project Asset rather than a number.
   *
   * `undefined` means this is not one of those — the value comes from the
   * `value` socket as usual. `null` means the action names no Asset, which is
   * a complete instruction: put the authored one back.
   *
   * It rides on the target rather than the value because an Asset id is
   * structural, like the Entity and Component ids beside it: KHR_interactivity
   * has no string type, and an Asset is not a quantity to interpolate toward.
   */
  readonly assetId?: string | null;
};

export type InteractivityAnimationRequest = {
  readonly animationIndex: number;
  readonly startTime: number;
  /** `null` plays to the end of the clip. */
  readonly endTime: number | null;
  readonly speed: number;
};

export type InteractivityAnimationStopRequest = {
  readonly animationIndex: number;
  /** Clip-local time to stop at, for `animation/stopAt`. `null` stops now. */
  readonly atSeconds: number | null;
};

export type InteractivityLogEntry = {
  readonly nodeIndex: number;
  readonly timeSeconds: number;
  readonly message: string;
};

/** A change that will be spread over a duration rather than applied at once. */
export type InteractivityTimedWrite = {
  readonly target: InteractivityActionTarget | null;
  /** Set instead of `target` when the write goes to a glTF pointer. */
  readonly pointer: string | null;
  readonly from: InteractivityValue;
  readonly to: InteractivityValue;
  readonly durationSeconds: number;
  readonly easing: InteractivityEasing;
};

export type InteractivityHost = {
  readProperty?(target: InteractivityActionTarget): InteractivityValue | null;
  /**
   * Announced once when a timed change starts.
   *
   * The per-frame writes still arrive through `writeProperty`; this exists for
   * a caller that needs the shape of the change rather than its samples — the
   * timeline draws it as a bar from here, which a stream of samples could only
   * approximate.
   */
  beginTimedWrite?(write: InteractivityTimedWrite): void;
  writeProperty?(
    target: InteractivityActionTarget,
    value: InteractivityValue,
  ): boolean;
  /**
   * Points an Asset-valued property at `target.assetId`, or back at the
   * authored Asset when that is `null`.
   *
   * Separate from `writeProperty` because there is no `InteractivityValue`
   * that can carry an Asset id, and because the change has no midpoint: a
   * duration on one of these would promise a cross-fade nothing performs.
   */
  writeAsset?(target: InteractivityActionTarget, assetId: string | null): boolean;
  readPointer?(pointer: string): InteractivityValue | null;
  writePointer?(pointer: string, value: InteractivityValue): boolean;
  startAnimation?(request: InteractivityAnimationRequest): void;
  stopAnimation?(request: InteractivityAnimationStopRequest): void;
  /** A graph-authored event leaving the graph, for the Scene to act on. */
  emitEvent?(
    name: string,
    payload: ReadonlyMap<string, InteractivityValue>,
  ): void;
  log?(entry: InteractivityLogEntry): void;
  /** Deterministic randomness for a dry run. Defaults to `Math.random`. */
  random?(): number;
};
