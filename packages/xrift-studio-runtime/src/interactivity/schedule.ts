/**
 * Runs a behavior graph forward without a renderer, and reports what happens.
 *
 * A graph that unfolds over time is impossible to review by reading it: the
 * author wants to know what happens at 35 seconds, not which node is wired to
 * which. The same dry run answers three separate needs, which is why it lives
 * here instead of inside any one of them:
 *
 * - the Editor's timeline view and its "what will Play do" diagnostics;
 * - the Model visual, which needs the clips a graph starts and when;
 * - the fixtures, which assert ordering and timing without a clock.
 *
 * Randomness is seeded so two runs of the same graph produce the same report.
 */

import {
  InteractivityEngine,
  type InteractivityEngineOptions,
  type InteractivityIssue,
} from "./engine.js";
import type {
  InteractivityActionTarget,
  InteractivityHost,
} from "./host.js";
import type { InteractivityValue } from "./value.js";

export type InteractivityScheduleEntry =
  | {
      readonly kind: "animation-start";
      readonly timeSeconds: number;
      readonly animationIndex: number;
      readonly startTime: number;
      readonly endTime: number | null;
      readonly speed: number;
    }
  | {
      readonly kind: "animation-stop";
      readonly timeSeconds: number;
      readonly animationIndex: number;
    }
  | {
      readonly kind: "property";
      readonly timeSeconds: number;
      readonly target: InteractivityActionTarget;
      readonly value: InteractivityValue;
    }
  | {
      readonly kind: "pointer";
      readonly timeSeconds: number;
      readonly pointer: string;
      readonly value: InteractivityValue;
    }
  | {
      readonly kind: "event";
      readonly timeSeconds: number;
      readonly name: string;
    }
  | {
      readonly kind: "log";
      readonly timeSeconds: number;
      readonly message: string;
    };

export type InteractivityDryRun = {
  readonly entries: readonly InteractivityScheduleEntry[];
  readonly issues: readonly InteractivityIssue[];
  /** Seconds actually simulated. Shorter than the horizon when nothing is left. */
  readonly simulatedSeconds: number;
  /** True when the run stopped at the horizon with work still pending. */
  readonly truncated: boolean;
};

export type InteractivityDryRunOptions = InteractivityEngineOptions & {
  /** How far to look ahead. Defaults to two minutes. */
  readonly horizonSeconds?: number;
  /** Frame length used while the graph needs one. Defaults to 1/30 s. */
  readonly stepSeconds?: number;
  /** Entry point to fire. `start` is the default; `interact` runs a trigger. */
  readonly entry?: "start" | "interact";
  readonly seed?: number;
  /** Property reads a dry run cannot perform, supplied by the caller. */
  readonly readProperty?: InteractivityHost["readProperty"];
  readonly readPointer?: InteractivityHost["readPointer"];
};

const DEFAULT_HORIZON_SECONDS = 120;
const DEFAULT_STEP_SECONDS = 1 / 30;
const MAX_STEPS = 20000;

/** Small deterministic generator, so a dry run is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function dryRunInteractivityGraph(
  extension: unknown,
  options: InteractivityDryRunOptions = {},
): InteractivityDryRun {
  const horizon = Math.max(0, options.horizonSeconds ?? DEFAULT_HORIZON_SECONDS);
  const step = Math.max(1 / 240, options.stepSeconds ?? DEFAULT_STEP_SECONDS);
  const entries: InteractivityScheduleEntry[] = [];
  let engine: InteractivityEngine | null = null;
  const at = () => engine?.currentTime ?? 0;

  const host: InteractivityHost = {
    random: seededRandom(options.seed ?? 1),
    startAnimation: (request) =>
      entries.push({
        kind: "animation-start",
        timeSeconds: at(),
        animationIndex: request.animationIndex,
        startTime: request.startTime,
        endTime: request.endTime,
        speed: request.speed,
      }),
    stopAnimation: (request) =>
      entries.push({
        kind: "animation-stop",
        timeSeconds: at(),
        animationIndex: request.animationIndex,
      }),
    writeProperty: (target, value) => {
      entries.push({ kind: "property", timeSeconds: at(), target, value });
      return true;
    },
    // No `writePointer`: nothing in Studio resolves a glTF Object Model pointer
    // yet, and a dry run that pretended otherwise would predict a Play the
    // author is not going to get. A caller with a resolver passes one in.
    emitEvent: (name) => entries.push({ kind: "event", timeSeconds: at(), name }),
    log: (entry) =>
      entries.push({ kind: "log", timeSeconds: at(), message: entry.message }),
    ...(options.readProperty ? { readProperty: options.readProperty } : {}),
    ...(options.readPointer ? { readPointer: options.readPointer } : {}),
  };

  engine = new InteractivityEngine(extension, host, options);
  if (options.entry === "interact") {
    engine.start();
    engine.interact();
  } else {
    engine.start();
  }

  const needsFrames = engine.usesTick;
  let steps = 0;
  while (engine.currentTime < horizon && steps < MAX_STEPS) {
    steps += 1;
    if (needsFrames) {
      engine.update(Math.min(step, horizon - engine.currentTime));
      continue;
    }
    const next = engine.nextScheduledTime();
    if (next === null) break;
    if (next > horizon) break;
    // Nothing continuous is running, so the clock can jump straight to the next
    // scheduled moment instead of simulating thousands of empty frames.
    engine.update(Math.max(next - engine.currentTime, 1e-6));
  }

  const truncated = engine.hasPendingWork;
  return {
    entries: [...entries].sort(
      (left, right) => left.timeSeconds - right.timeSeconds,
    ),
    issues: engine.getIssues(),
    simulatedSeconds: engine.currentTime,
    truncated,
  };
}
