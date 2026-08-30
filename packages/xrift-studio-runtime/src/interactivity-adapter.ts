/**
 * How far this runtime implements `KHR_interactivity`, and the timed report a
 * caller can get out of a graph without running a renderer.
 *
 * The behaviour itself lives in `./interactivity/`, which Studio's Play preview
 * and a published world both execute. This module is the classification and the
 * compatibility surface on top of it: the Editor asks here whether an operation
 * will run, and the Model visual asks here which clips a graph starts and when.
 *
 * Input is untrusted published JSON. The graph is never rewritten: an operation
 * this runtime does not implement stays in the canonical JSON and does not run.
 */

import {
  INTERACTIVITY_EXECUTED_OPERATIONS,
  INTERACTIVITY_VALUE_OPERATIONS,
  type InteractivityIssue,
} from "./interactivity/engine.js";
import { dryRunInteractivityGraph } from "./interactivity/schedule.js";

export type {
  InteractivityIssue,
  InteractivityIssueReason,
  InteractivityTraceEntry,
} from "./interactivity/engine.js";
export { InteractivityEngine } from "./interactivity/engine.js";
export {
  INTERACTIVITY_EXECUTED_OPERATIONS,
  INTERACTIVITY_VALUE_OPERATIONS,
} from "./interactivity/engine.js";
export { dryRunInteractivityGraph } from "./interactivity/schedule.js";
export type {
  InteractivityDryRun,
  InteractivityDryRunOptions,
  InteractivityScheduleEntry,
} from "./interactivity/schedule.js";
export type {
  InteractivityActionTarget,
  InteractivityAnimationRequest,
  InteractivityAnimationStopRequest,
  InteractivityHost,
  InteractivityLogEntry,
} from "./interactivity/host.js";
export type { InteractivityValue } from "./interactivity/value.js";
export {
  applyEasing,
  asBoolean,
  asNumber,
  asNumbers,
  boolValue,
  floatValue,
  fromJsonValue,
  intValue,
  parseEasing,
  vectorValue,
  INTERACTIVITY_EASINGS,
} from "./interactivity/value.js";
export type { InteractivityEasing } from "./interactivity/value.js";

/**
 * How far this runtime implements one operation.
 *
 * - `executed`: the interpreter runs it on its own.
 * - `conditional`: the interpreter runs it, but only reaches the world when the
 *   host provides that capability. An Interaction Trigger action needs an
 *   Entity to be attached to; an animation needs a Model that owns clips.
 * - `ignored`: the operation stays in the canonical JSON and does nothing.
 *
 * An ignored operation produces no flow output either, so the interpreter stops
 * there rather than running the rest of the chain as though it had succeeded.
 */
export type InteractivityRuntimeSupport = "executed" | "conditional" | "ignored";

/** Operations that need something from the host before they change anything. */
const HOST_DEPENDENT_OPERATIONS: ReadonlySet<string> = new Set([
  "animation/start",
  "animation/stop",
  "animation/stopAt",
  "event/send",
  "xrift/onInteract",
  "xrift/setProperty",
  "xrift/toggleProperty",
]);

/**
 * Operations the interpreter implements that no host implements yet.
 *
 * The glTF Object Model pointer needs a resolver Studio does not have, so a
 * `pointer/*` node still does nothing. Reporting it as unsupported keeps the
 * Editor badge honest: the alternative is a node that claims to work because
 * the interpreter would run it if anything were listening.
 */
const HOST_UNIMPLEMENTED_OPERATIONS: ReadonlySet<string> = new Set([
  "pointer/get",
  "pointer/set",
  "pointer/interpolate",
]);

export function getInteractivityRuntimeSupport(
  op: string,
): InteractivityRuntimeSupport {
  if (HOST_UNIMPLEMENTED_OPERATIONS.has(op)) return "ignored";
  const known =
    INTERACTIVITY_EXECUTED_OPERATIONS.has(op) ||
    INTERACTIVITY_VALUE_OPERATIONS.has(op);
  if (!known) return "ignored";
  return HOST_DEPENDENT_OPERATIONS.has(op) ? "conditional" : "executed";
}

/**
 * Every operation with a fixed classification, for callers that want the table.
 *
 * Derived from the interpreter's own sets so a newly implemented operation
 * cannot be executed while still being reported as unsupported.
 */
export const KHR_INTERACTIVITY_RUNTIME_SUPPORT: Readonly<
  Record<string, InteractivityRuntimeSupport>
> = Object.freeze(
  Object.fromEntries(
    [...INTERACTIVITY_EXECUTED_OPERATIONS, ...INTERACTIVITY_VALUE_OPERATIONS].map(
      (op) => [op, getInteractivityRuntimeSupport(op)],
    ),
  ),
);

/** One clip the graph plays, when it starts, and when the graph stops it. */
export type InteractivityAnimationCue = {
  animationIndex: number;
  /** Seconds after the graph starts. */
  delaySeconds: number;
  /** Seconds after the graph starts when it is stopped, when the graph says so. */
  stopSeconds?: number;
  /** Clip-local start offset. */
  startTime?: number;
  /** Clip-local end, or `null` to play to the end of the clip. */
  endTime?: number | null;
  speed?: number;
};

/** A node the interpreter refused to run, and why. */
export type InteractivityRuntimeIssue = InteractivityIssue;

export type InteractivityAdapterRun = {
  cues: InteractivityAnimationCue[];
  issues: InteractivityRuntimeIssue[];
};

/**
 * Runs the selected graph forward from `event/onStart` and reports the clips.
 *
 * The name is kept from the static walk this replaced, because the Model visual
 * and the Editor both call it. What changed is that the answer now comes from
 * actually running the graph, so a clip started after a wait, inside a loop, or
 * behind a computed condition is reported like any other.
 */
export function walkOnStart(
  value: unknown,
  options: { horizonSeconds?: number } = {},
): InteractivityAdapterRun {
  const run = dryRunInteractivityGraph(value, {
    ...(options.horizonSeconds === undefined
      ? {}
      : { horizonSeconds: options.horizonSeconds }),
  });
  const cues: InteractivityAnimationCue[] = [];
  for (const entry of run.entries) {
    if (entry.kind === "animation-start") {
      cues.push({
        animationIndex: entry.animationIndex,
        delaySeconds: entry.timeSeconds,
        startTime: entry.startTime,
        endTime: entry.endTime,
        speed: entry.speed,
      });
      continue;
    }
    if (entry.kind !== "animation-stop") continue;
    // A stop applies to the most recent start of the same clip. Stopping at the
    // moment it starts means the clip never plays, which is how a graph cancels
    // a start it just made rather than leaving a zero-length playback behind.
    for (let index = cues.length - 1; index >= 0; index -= 1) {
      const cue = cues[index];
      if (!cue || cue.animationIndex !== entry.animationIndex) continue;
      if (cue.stopSeconds !== undefined) continue;
      if (entry.timeSeconds <= cue.delaySeconds) {
        cues.splice(index, 1);
      } else {
        cue.stopSeconds = entry.timeSeconds;
      }
      break;
    }
  }
  return {
    cues: cues.sort(
      (left, right) =>
        left.delaySeconds - right.delaySeconds ||
        left.animationIndex - right.animationIndex,
    ),
    issues: [...run.issues],
  };
}

/** Animations the graph starts on `event/onStart`, with their delays. */
export function getKhrInteractivityOnStartAnimationCues(
  value: unknown,
): InteractivityAnimationCue[] {
  return walkOnStart(value).cues;
}
