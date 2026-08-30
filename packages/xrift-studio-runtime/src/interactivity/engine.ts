/**
 * The single interpreter for `KHR_interactivity` behavior graphs.
 *
 * Studio's Play preview and a published world both run this module, so a graph
 * cannot behave one way while authoring and another way after publishing. It
 * replaces two earlier static walks that only ever answered one question each
 * ("which clips start, and when" and "which properties an interaction writes"),
 * and could therefore not express waiting, repeating, branching on a computed
 * value, or anything continuous.
 *
 * Two evaluation directions live here and are deliberately kept apart:
 *
 * - values are pulled on demand, so a socket is only computed when a running
 *   node asks for it, and a cycle among values is a reported error;
 * - flows are pushed from an entry point, and a cycle among flows is a loop,
 *   which is legal and bounded by an activation budget rather than forbidden.
 *
 * Input is untrusted published JSON. Every read is structural (see `graph.ts`)
 * and every world write goes through {@link InteractivityHost}.
 */

import {
  parseInteractivityExtension,
  signatureLength,
  type InteractivityTypeSignature,
  type KhrJsonValue,
  type ParsedGraph,
  type ParsedNode,
} from "./graph.js";
import type {
  InteractivityActionTarget,
  InteractivityHost,
} from "./host.js";
import {
  applyEasing,
  asBoolean,
  asInteger,
  asNumber,
  asNumbers,
  boolValue,
  defaultValue,
  floatValue,
  fromJsonValue,
  intValue,
  mixValues,
  parseEasing,
  valueLength,
  vectorValue,
  type InteractivityEasing,
  type InteractivityValue,
} from "./value.js";

/** Why the engine refused to run part of a graph. */
export type InteractivityIssueReason =
  | "missing-declaration"
  | "unsupported-operation"
  | "unsupported-by-host"
  | "value-cycle"
  | "invalid-input"
  | "budget-exceeded";

export type InteractivityIssue = {
  readonly graphIndex: number;
  readonly nodeIndex: number;
  readonly op: string | null;
  readonly reason: InteractivityIssueReason;
  readonly detail?: string;
};

/** One node activation, in the order the engine ran it. */
export type InteractivityTraceEntry = {
  readonly timeSeconds: number;
  readonly nodeIndex: number;
  readonly op: string | null;
  readonly socket: string;
};

export type InteractivityEngineOptions = {
  /** Which graph of the extension to run. Defaults to the document's own. */
  readonly graphIndex?: number;
  /** Node activations allowed per frame before the frame is cut short. */
  readonly activationBudget?: number;
  /** Trace entries kept for the debugger. Older entries are dropped. */
  readonly traceLimit?: number;
};

const DEFAULT_ACTIVATION_BUDGET = 20000;
const DEFAULT_TRACE_LIMIT = 500;
const MAX_PENDING_TIMERS = 4096;

/** Operations this engine executes. Anything else is reported, never guessed. */
export const INTERACTIVITY_EXECUTED_OPERATIONS: ReadonlySet<string> = new Set([
  "event/onStart",
  "event/onTick",
  "event/receive",
  "event/send",
  "flow/branch",
  "flow/switch",
  "flow/sequence",
  "flow/setDelay",
  "flow/cancelDelay",
  "flow/doN",
  "flow/multiGate",
  "flow/waitAll",
  "flow/throttle",
  "flow/for",
  "flow/while",
  "variable/get",
  "variable/set",
  "variable/interpolate",
  "pointer/get",
  "pointer/set",
  "pointer/interpolate",
  "animation/start",
  "animation/stop",
  "animation/stopAt",
  "debug/log",
  "xrift/onInteract",
  "xrift/setProperty",
  "xrift/toggleProperty",
]);

/**
 * Value operations the evaluator computes.
 *
 * Kept as data rather than derived from the switch below so the authoring side
 * can ask "will Play evaluate this" without importing the interpreter, and so a
 * fixture can prove the two agree.
 */
export const INTERACTIVITY_VALUE_OPERATIONS: ReadonlySet<string> = new Set([
  "math/E",
  "math/Pi",
  "math/Tau",
  "math/Inf",
  "math/NaN",
  "math/add",
  "math/sub",
  "math/mul",
  "math/div",
  "math/rem",
  "math/min",
  "math/max",
  "math/pow",
  "math/atan2",
  "math/neg",
  "math/abs",
  "math/sign",
  "math/floor",
  "math/ceil",
  "math/round",
  "math/trunc",
  "math/fract",
  "math/sqrt",
  "math/cbrt",
  "math/exp",
  "math/log",
  "math/log2",
  "math/log10",
  "math/sin",
  "math/cos",
  "math/tan",
  "math/asin",
  "math/acos",
  "math/atan",
  "math/rad",
  "math/deg",
  "math/saturate",
  "math/isInf",
  "math/isNaN",
  "math/clamp",
  "math/mix",
  "math/smoothStep",
  "math/random",
  "math/eq",
  "math/lt",
  "math/le",
  "math/gt",
  "math/ge",
  "math/and",
  "math/or",
  "math/xor",
  "math/not",
  "math/select",
  "math/length",
  "math/normalize",
  "math/dot",
  "math/cross",
  "math/combine2",
  "math/combine3",
  "math/combine4",
  "math/extract2",
  "math/extract3",
  "math/extract4",
  "ref/eq",
  "type/boolToFloat",
  "type/boolToInt",
  "type/floatToBool",
  "type/floatToInt",
  "type/intToBool",
  "type/intToFloat",
  "variable/get",
  "pointer/get",
]);

const A_INPUT = ["a", "0"];
const B_INPUT = ["b", "1"];
const C_INPUT = ["c", "2"];

type FlowFrame =
  | { readonly kind: "node"; readonly node: number; readonly socket: string }
  | { readonly kind: "loop"; readonly node: number };

type LoopState = {
  index: number;
  end: number;
  bodySocket: string;
  completedSocket: string;
  indexSocket: string | null;
  /** `while` re-reads its condition instead of counting. */
  condition: boolean;
};

type PendingTimer = {
  readonly id: number;
  readonly dueAt: number;
  readonly node: number;
  readonly socket: string;
  cancelled: boolean;
};

type Interpolation = {
  readonly id: number;
  readonly node: number;
  readonly kind: "variable" | "pointer" | "property";
  readonly variableIndex: number;
  readonly pointer: string;
  readonly target: InteractivityActionTarget | null;
  readonly from: InteractivityValue;
  readonly to: InteractivityValue;
  readonly duration: number;
  readonly easing: InteractivityEasing;
  elapsed: number;
  cancelled: boolean;
};

function isPureOperation(op: string | null): boolean {
  if (!op) return false;
  return (
    op.startsWith("math/") ||
    op.startsWith("type/") ||
    op === "variable/get" ||
    op === "pointer/get" ||
    op === "ref/eq"
  );
}

/** Signature guessed from an inline value that carries no type index. */
function inferSignature(
  value: readonly KhrJsonValue[] | null,
): InteractivityTypeSignature {
  if (!value || value.length === 0) return "float";
  if (typeof value[0] === "boolean") return "bool";
  switch (value.length) {
    case 2:
      return "float2";
    case 3:
      return "float3";
    case 4:
      return "float4";
    default:
      return "float";
  }
}

function componentWise(
  left: InteractivityValue | null,
  right: InteractivityValue | null,
  combine: (a: number, b: number) => number,
): InteractivityValue {
  const leftLength = Math.max(1, valueLength(left));
  const rightLength = Math.max(1, valueLength(right));
  const length = Math.max(leftLength, rightLength);
  const a = asNumbers(left, leftLength);
  const b = asNumbers(right, rightLength);
  const data: number[] = [];
  for (let index = 0; index < length; index += 1) {
    // A scalar broadcasts over a vector, which is how "multiply this colour by
    // 0.5" is written without a combine node in front of it.
    const leftEntry = leftLength === 1 ? (a[0] ?? 0) : (a[index] ?? 0);
    const rightEntry = rightLength === 1 ? (b[0] ?? 0) : (b[index] ?? 0);
    const result = combine(leftEntry, rightEntry);
    data.push(Number.isFinite(result) ? result : 0);
  }
  const signature =
    (length === leftLength ? left?.signature : right?.signature) ??
    (length === 1 ? "float" : length === 2 ? "float2" : length === 3 ? "float3" : "float4");
  return { signature: signature === "bool" ? "float" : signature, data };
}

function mapComponents(
  value: InteractivityValue | null,
  transform: (entry: number) => number,
): InteractivityValue {
  const length = Math.max(1, valueLength(value));
  const components = asNumbers(value, length).map((entry) => {
    const result = transform(entry);
    return Number.isFinite(result) ? result : 0;
  });
  const signature = value?.signature ?? "float";
  return { signature: signature === "bool" ? "float" : signature, data: components };
}

/** Runs one behavior graph against one host. */
export class InteractivityEngine {
  private readonly graph: ParsedGraph | null;
  private readonly graphIndex: number;
  private readonly host: InteractivityHost;
  private readonly activationBudget: number;
  private readonly traceLimit: number;

  private readonly variables: InteractivityValue[] = [];
  private readonly outputs = new Map<string, InteractivityValue>();
  private readonly loops = new Map<number, LoopState>();
  private readonly gateCursor = new Map<number, number>();
  private readonly waitAllSeen = new Map<number, Set<string>>();
  private readonly throttleUntil = new Map<number, number>();
  private timers: PendingTimer[] = [];
  private interpolations: Interpolation[] = [];
  private readonly issues: InteractivityIssue[] = [];
  private readonly trace: InteractivityTraceEntry[] = [];

  private timeSeconds = 0;
  private lastTickSeconds = 0;
  private activeNode = -1;
  private nextTimerId = 1;
  private budget = 0;
  private started = false;

  constructor(
    extension: unknown,
    host: InteractivityHost = {},
    options: InteractivityEngineOptions = {},
  ) {
    const parsed = parseInteractivityExtension(extension);
    const index = options.graphIndex ?? parsed.defaultGraphIndex;
    this.graph = parsed.graphs[index] ?? null;
    this.graphIndex = this.graph?.index ?? index;
    this.host = host;
    this.activationBudget = options.activationBudget ?? DEFAULT_ACTIVATION_BUDGET;
    this.traceLimit = options.traceLimit ?? DEFAULT_TRACE_LIMIT;
    for (const variable of this.graph?.variables ?? []) {
      const signature =
        variable.typeIndex === null
          ? inferSignature(variable.value)
          : (this.graph?.types[variable.typeIndex] ?? "float");
      this.variables.push(fromJsonValue(signature, variable.value));
    }
  }

  /** Seconds since {@link start}, advanced by {@link update}. */
  get currentTime(): number {
    return this.timeSeconds;
  }

  /**
   * The node currently running, or -1 between activations.
   *
   * A host is called from inside one node's execution and otherwise has no way
   * to say which node asked for a write. The timeline needs that to send an
   * author from "at 35 s the light changes" back to the node that changed it.
   */
  get activeNodeIndex(): number {
    return this.activeNode;
  }

  getIssues(): readonly InteractivityIssue[] {
    return this.issues;
  }

  getTrace(): readonly InteractivityTraceEntry[] {
    return this.trace;
  }

  /** True while a timer or an interpolation is still pending. */
  get hasPendingWork(): boolean {
    return (
      this.timers.some((timer) => !timer.cancelled) ||
      this.interpolations.some((entry) => !entry.cancelled)
    );
  }

  /** Whether this graph reacts to every frame, which a dry run has to honour. */
  get usesTick(): boolean {
    return (this.graph?.nodes ?? []).some((node) => node.op === "event/onTick");
  }

  /** The next moment something is scheduled to happen, or `null`. */
  nextScheduledTime(): number | null {
    let next: number | null = null;
    for (const timer of this.timers) {
      if (timer.cancelled) continue;
      if (next === null || timer.dueAt < next) next = timer.dueAt;
    }
    for (const entry of this.interpolations) {
      if (entry.cancelled) continue;
      const due = this.timeSeconds + Math.max(0, entry.duration - entry.elapsed);
      if (next === null || due < next) next = due;
    }
    return next;
  }

  /** Fires every `event/onStart`. Safe to call once. */
  start(): void {
    if (this.started || !this.graph) return;
    this.started = true;
    this.budget = this.activationBudget;
    for (const node of this.graph.nodes) {
      if (node.op !== "event/onStart") continue;
      this.runFrom(node.index, "out");
    }
  }

  /**
   * Advances the clock.
   *
   * Timers are processed at the time they were due rather than at the end of
   * the frame, so a chain of one-second waits lands on whole seconds instead of
   * drifting by a frame on every hop.
   */
  update(deltaSeconds: number): void {
    if (!this.graph || !this.started) return;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    const frameEnd = this.timeSeconds + delta;
    this.budget = this.activationBudget;

    for (;;) {
      const due = this.timers
        .filter((timer) => !timer.cancelled && timer.dueAt <= frameEnd)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
      if (!due) break;
      const step = Math.max(0, due.dueAt - this.timeSeconds);
      this.advanceInterpolations(step);
      this.timeSeconds = due.dueAt;
      due.cancelled = true;
      this.timers = this.timers.filter((timer) => timer !== due);
      this.runOutput(due.node, due.socket);
    }

    this.advanceInterpolations(Math.max(0, frameEnd - this.timeSeconds));
    this.timeSeconds = frameEnd;

    for (const node of this.graph.nodes) {
      if (node.op !== "event/onTick") continue;
      this.runFrom(node.index, "out");
    }
    this.lastTickSeconds = this.timeSeconds;
  }

  /** Delivers a custom event to every matching `event/receive`. */
  receiveEvent(eventId: string): void {
    if (!this.graph) return;
    this.budget = this.activationBudget;
    for (const node of this.graph.nodes) {
      if (node.op !== "event/receive") continue;
      if (this.configurationEventId(node) !== eventId) continue;
      this.runFrom(node.index, "out");
    }
  }

  /** Runs every interaction entry point, used by the Interaction Trigger. */
  interact(): void {
    if (!this.graph) return;
    this.budget = this.activationBudget;
    for (const node of this.graph.nodes) {
      if (node.op !== "xrift/onInteract") continue;
      this.runFrom(node.index, "out");
    }
  }

  /** Drops pending work so a stopped Play session leaves nothing running. */
  dispose(): void {
    this.timers = [];
    this.interpolations = [];
    this.loops.clear();
  }

  // ---------------------------------------------------------------- flow

  /**
   * Continues from one of a node's flow outputs.
   *
   * A scheduled continuation names the socket that becomes ready, not a node to
   * re-enter: waking `flow/setDelay` at its own `done` socket would run the wait
   * a second time instead of continuing past it.
   */
  private runOutput(nodeIndex: number, socket: string): void {
    const node = this.graph?.nodes[nodeIndex];
    const target = node?.flows.get(socket);
    if (!target) return;
    this.runFrom(target.node, target.socket);
  }

  private runFrom(nodeIndex: number, socket: string): void {
    const stack: FlowFrame[] = [{ kind: "node", node: nodeIndex, socket }];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;
      if (this.budget <= 0) {
        this.report(nodeIndex, null, "budget-exceeded");
        return;
      }
      this.budget -= 1;
      const next =
        frame.kind === "loop"
          ? this.stepLoop(frame.node)
          : this.stepNode(frame.node, frame.socket);
      // Pushed in reverse so the first target the operation named runs first.
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const entry = next[index];
        if (entry) stack.push(entry);
      }
    }
  }

  private follow(node: ParsedNode, socket: string): FlowFrame[] {
    const target = node.flows.get(socket);
    if (!target) return [];
    return [{ kind: "node", node: target.node, socket: target.socket }];
  }

  private stepNode(nodeIndex: number, socket: string): FlowFrame[] {
    const node = this.graph?.nodes[nodeIndex];
    if (!node) return [];
    if (!node.op) {
      this.report(nodeIndex, null, "missing-declaration");
      return [];
    }
    this.record(nodeIndex, node.op, socket);
    this.activeNode = nodeIndex;
    const seen = new Set<string>();

    switch (node.op) {
      case "event/onStart":
      case "event/onTick":
      case "event/receive":
      case "xrift/onInteract":
        return this.follow(node, "out");

      case "event/send": {
        const name = this.configurationEventId(node);
        if (name && this.host.emitEvent) {
          const payload = new Map<string, InteractivityValue>();
          for (const [key, source] of node.values) {
            const value = this.readSocket(node, key, seen);
            if (value) payload.set(key, value);
            void source;
          }
          this.host.emitEvent(name, payload);
        }
        // A graph can also address its own receivers, which is how two graphs
        // in one Asset are composed without a shared variable.
        const targets = this.follow(node, "out");
        if (name) this.queueLocalEvent(name, targets);
        return targets;
      }

      case "flow/branch": {
        const condition = this.readSocket(node, "condition", seen);
        return this.follow(node, asBoolean(condition) ? "true" : "false");
      }

      case "flow/switch": {
        const selection = asInteger(this.readSocket(node, "selection", seen));
        const named = node.flows.has(String(selection))
          ? String(selection)
          : "default";
        return this.follow(node, named);
      }

      case "flow/sequence": {
        const sockets = [...node.flows.keys()].sort(compareFlowSocketNames);
        return sockets.flatMap((name) => this.follow(node, name));
      }

      case "flow/setDelay": {
        if (socket === "cancel") {
          this.cancelTimersOf(nodeIndex);
          return [];
        }
        const duration = asNumber(this.readSocket(node, "duration", seen));
        if (!Number.isFinite(duration) || duration < 0) {
          this.report(nodeIndex, node.op, "invalid-input", "duration");
          return this.follow(node, "err");
        }
        const timerId = this.schedule(nodeIndex, "done", duration);
        if (timerId === null) {
          this.report(nodeIndex, node.op, "budget-exceeded", "pending delays");
          return this.follow(node, "err");
        }
        this.setOutput(nodeIndex, "lastDelay", intValue(timerId));
        return this.follow(node, "out");
      }

      case "flow/cancelDelay": {
        const delayId = asInteger(this.readSocket(node, "delay", seen));
        for (const timer of this.timers) {
          if (timer.id === delayId) timer.cancelled = true;
        }
        this.timers = this.timers.filter((timer) => !timer.cancelled);
        return this.follow(node, "out");
      }

      case "flow/doN": {
        if (socket === "reset") {
          this.setOutput(nodeIndex, "currentCount", intValue(0));
          return [];
        }
        const limit = asInteger(this.readSocket(node, "n", seen)) || 1;
        const current = asInteger(this.outputs.get(outputKey(nodeIndex, "currentCount")) ?? null);
        if (current >= limit) return [];
        this.setOutput(nodeIndex, "currentCount", intValue(current + 1));
        return this.follow(node, "out");
      }

      case "flow/multiGate": {
        const sockets = [...node.flows.keys()]
          .filter((name) => name !== "reset")
          .sort(compareFlowSocketNames);
        if (socket === "reset" || sockets.length === 0) {
          this.gateCursor.set(nodeIndex, 0);
          return [];
        }
        const cursor = this.gateCursor.get(nodeIndex) ?? 0;
        const loop = this.configurationFlag(node, "isLoop", true);
        if (cursor >= sockets.length && !loop) return [];
        const chosen = sockets[cursor % sockets.length];
        this.gateCursor.set(nodeIndex, cursor + 1);
        return chosen ? this.follow(node, chosen) : [];
      }

      case "flow/waitAll": {
        const expected = this.waitAllInputs(node);
        if (socket === "reset") {
          this.waitAllSeen.delete(nodeIndex);
          this.setOutput(nodeIndex, "remainingInputs", intValue(expected.length));
          return [];
        }
        const seenInputs = this.waitAllSeen.get(nodeIndex) ?? new Set<string>();
        seenInputs.add(socket);
        this.waitAllSeen.set(nodeIndex, seenInputs);
        const remaining = expected.filter((name) => !seenInputs.has(name)).length;
        this.setOutput(nodeIndex, "remainingInputs", intValue(remaining));
        const passthrough = this.follow(node, "out");
        if (remaining > 0) return passthrough;
        this.waitAllSeen.delete(nodeIndex);
        return [...this.follow(node, "completed"), ...passthrough];
      }

      case "flow/throttle": {
        if (socket === "reset") {
          this.throttleUntil.delete(nodeIndex);
          return [];
        }
        const duration = asNumber(this.readSocket(node, "duration", seen));
        const openAt = this.throttleUntil.get(nodeIndex);
        if (openAt !== undefined && this.timeSeconds < openAt) {
          this.setOutput(
            nodeIndex,
            "lastRemainingTime",
            floatValue(openAt - this.timeSeconds),
          );
          return this.follow(node, "err");
        }
        this.throttleUntil.set(nodeIndex, this.timeSeconds + Math.max(0, duration));
        this.setOutput(nodeIndex, "lastRemainingTime", floatValue(0));
        return this.follow(node, "out");
      }

      case "flow/for": {
        const start = asInteger(this.readSocket(node, "startIndex", seen));
        const end = asInteger(this.readSocket(node, "endIndex", seen));
        this.loops.set(nodeIndex, {
          index: start,
          end,
          bodySocket: node.flows.has("loopBody") ? "loopBody" : "body",
          completedSocket: "completed",
          indexSocket: "index",
          condition: true,
        });
        return [{ kind: "loop", node: nodeIndex }];
      }

      case "flow/while": {
        this.loops.set(nodeIndex, {
          index: 0,
          end: Number.POSITIVE_INFINITY,
          bodySocket: node.flows.has("loopBody") ? "loopBody" : "body",
          completedSocket: "completed",
          indexSocket: null,
          condition: false,
        });
        return [{ kind: "loop", node: nodeIndex }];
      }

      case "variable/set": {
        const index = this.configurationIndex(node, "variable");
        const value = this.readSocket(node, "value", seen) ??
          this.readSocket(node, "0", seen) ??
          this.readSocket(node, "a", seen);
        if (index !== null && value) this.variables[index] = value;
        return this.follow(node, "out");
      }

      case "variable/interpolate": {
        const index = this.configurationIndex(node, "variable");
        const value =
          this.readSocket(node, "value", seen) ?? this.readSocket(node, "0", seen);
        const duration = asNumber(this.readSocket(node, "duration", seen));
        if (index === null || !value) {
          this.report(nodeIndex, node.op, "invalid-input", "variable");
          return this.follow(node, "err");
        }
        const from = this.variables[index] ?? defaultValue(value.signature);
        this.beginInterpolation({
          node: nodeIndex,
          kind: "variable",
          variableIndex: index,
          pointer: "",
          target: null,
          from,
          to: value,
          duration,
          easing: this.readEasing(node, seen),
        });
        return this.follow(node, "out");
      }

      case "pointer/set": {
        const pointer = this.configurationString(node, "pointer");
        const value = this.readSocket(node, "value", seen);
        if (!pointer || !value) {
          this.report(nodeIndex, node.op, "invalid-input", "pointer");
          return this.follow(node, "err");
        }
        if (!this.host.writePointer) {
          this.report(nodeIndex, node.op, "unsupported-by-host", pointer);
          return this.follow(node, "err");
        }
        const written = this.host.writePointer(pointer, value);
        return this.follow(node, written ? "out" : "err");
      }

      case "pointer/interpolate": {
        const pointer = this.configurationString(node, "pointer");
        const value = this.readSocket(node, "value", seen);
        const duration = asNumber(this.readSocket(node, "duration", seen));
        if (!pointer || !value || !this.host.writePointer) {
          this.report(nodeIndex, node.op, "unsupported-by-host", pointer ?? "pointer");
          return this.follow(node, "err");
        }
        const from =
          this.host.readPointer?.(pointer) ?? defaultValue(value.signature);
        this.beginInterpolation({
          node: nodeIndex,
          kind: "pointer",
          variableIndex: -1,
          pointer,
          target: null,
          from,
          to: value,
          duration,
          easing: this.readEasing(node, seen),
        });
        return this.follow(node, "out");
      }

      case "animation/start": {
        const animationIndex = asInteger(this.readSocket(node, "animation", seen));
        if (animationIndex < 0) {
          this.report(nodeIndex, node.op, "invalid-input", "animation");
          return this.follow(node, "err");
        }
        const startTime = asNumber(this.readSocket(node, "startTime", seen));
        const endSocket = this.readSocket(node, "endTime", seen);
        const endTime = endSocket === null ? null : asNumber(endSocket);
        const speedSocket = this.readSocket(node, "speed", seen);
        const speed = speedSocket === null ? 1 : asNumber(speedSocket) || 1;
        this.host.startAnimation?.({
          animationIndex,
          startTime,
          // An unset or non-positive end plays the whole clip; the RC uses
          // `math/Inf` for "do not stop", which arrives here as a non-finite
          // number rather than as a separate socket shape.
          endTime:
            endTime === null || !Number.isFinite(endTime) || endTime <= startTime
              ? null
              : endTime,
          speed,
        });
        if (!this.host.startAnimation) {
          this.report(nodeIndex, node.op, "unsupported-by-host", "startAnimation");
        }
        const finish =
          endTime !== null && Number.isFinite(endTime) && endTime > startTime
            ? (endTime - startTime) / Math.abs(speed || 1)
            : null;
        if (finish !== null && node.flows.has("done")) {
          this.schedule(nodeIndex, "done", finish);
        }
        return this.follow(node, "out");
      }

      case "animation/stop":
      case "animation/stopAt": {
        const animationIndex = asInteger(this.readSocket(node, "animation", seen));
        const stopAt =
          node.op === "animation/stopAt"
            ? asNumber(this.readSocket(node, "stopTime", seen))
            : null;
        if (!this.host.stopAnimation) {
          this.report(nodeIndex, node.op, "unsupported-by-host", "stopAnimation");
          return this.follow(node, "err");
        }
        this.host.stopAnimation({ animationIndex, atSeconds: stopAt });
        return this.follow(node, "out");
      }

      case "debug/log": {
        const message = this.configurationString(node, "message") ?? "";
        const value = this.readSocket(node, "value", seen);
        this.host.log?.({
          nodeIndex,
          timeSeconds: this.timeSeconds,
          message: value ? `${message} ${JSON.stringify(value.data)}`.trim() : message,
        });
        return this.follow(node, "out");
      }

      case "xrift/setProperty":
      case "xrift/toggleProperty": {
        const target = this.actionTarget(node);
        if (!target) {
          this.report(nodeIndex, node.op, "invalid-input", "target");
          return this.follow(node, "err");
        }
        if (!this.host.writeProperty) {
          this.report(nodeIndex, node.op, "unsupported-by-host", "writeProperty");
          return this.follow(node, "err");
        }
        const current = this.host.readProperty?.(target) ?? null;
        const next =
          node.op === "xrift/toggleProperty"
            ? boolValue(!asBoolean(current))
            : this.readSocket(node, "value", seen);
        if (!next) {
          this.report(nodeIndex, node.op, "invalid-input", "value");
          return this.follow(node, "err");
        }
        const duration = asNumber(this.readSocket(node, "duration", seen));
        if (duration > 0) {
          this.beginInterpolation({
            node: nodeIndex,
            kind: "property",
            variableIndex: -1,
            pointer: "",
            target,
            // A host that cannot report the current value still gets a ramp:
            // starting from the signature's zero is what "fade this in" means,
            // and it is predictable rather than silently instantaneous.
            from: current ?? defaultValue(next.signature),
            to: next,
            duration,
            easing: this.readEasing(node, seen),
          });
          return this.follow(node, "out");
        }
        const written = this.host.writeProperty(target, next);
        return this.follow(node, written ? "out" : "err");
      }

      default:
        this.report(nodeIndex, node.op, "unsupported-operation");
        return [];
    }
  }

  private stepLoop(nodeIndex: number): FlowFrame[] {
    const node = this.graph?.nodes[nodeIndex];
    const state = this.loops.get(nodeIndex);
    if (!node || !state) return [];
    if (state.condition) {
      if (state.index >= state.end) {
        this.loops.delete(nodeIndex);
        return this.follow(node, state.completedSocket);
      }
      if (state.indexSocket) {
        this.setOutput(nodeIndex, state.indexSocket, intValue(state.index));
      }
      state.index += 1;
    } else {
      const condition = this.readSocket(node, "condition", new Set<string>());
      if (!asBoolean(condition)) {
        this.loops.delete(nodeIndex);
        return this.follow(node, state.completedSocket);
      }
      state.index += 1;
      if (state.index > this.activationBudget) {
        this.loops.delete(nodeIndex);
        this.report(nodeIndex, node.op, "budget-exceeded", "flow/while");
        return [];
      }
    }
    // The loop frame goes back underneath the body, so the body's whole chain
    // runs before the next iteration is considered.
    return [
      { kind: "loop", node: nodeIndex },
      ...this.follow(node, state.bodySocket),
    ];
  }

  private queueLocalEvent(name: string, exclude: readonly FlowFrame[]): void {
    void exclude;
    for (const candidate of this.graph?.nodes ?? []) {
      if (candidate.op !== "event/receive") continue;
      if (this.configurationEventId(candidate) !== name) continue;
      // Scheduled at the current time rather than run inline: a receiver that
      // sends back to the sender would otherwise recurse inside one activation.
      this.schedule(candidate.index, "out", 0);
    }
  }

  // -------------------------------------------------------------- values

  private readSocket(
    node: ParsedNode,
    name: string,
    seen: Set<string>,
  ): InteractivityValue | null {
    const socket = node.values.get(name);
    if (!socket) return null;
    if (socket.kind === "link") {
      return this.evaluate(socket.node, socket.socket, seen);
    }
    const signature =
      socket.typeIndex === null
        ? inferSignature(socket.value)
        : (this.graph?.types[socket.typeIndex] ?? inferSignature(socket.value));
    return fromJsonValue(signature, socket.value);
  }

  private readAny(
    node: ParsedNode,
    names: readonly string[],
    seen: Set<string>,
  ): InteractivityValue | null {
    for (const name of names) {
      const value = this.readSocket(node, name, seen);
      if (value) return value;
    }
    return null;
  }

  private readEasing(node: ParsedNode, seen: Set<string>): InteractivityEasing {
    void seen;
    const configured = node.configuration.get("easing")?.[0];
    return parseEasing(configured);
  }

  private evaluate(
    nodeIndex: number,
    socket: string,
    seen: Set<string>,
  ): InteractivityValue | null {
    const node = this.graph?.nodes[nodeIndex];
    if (!node) return null;
    const key = outputKey(nodeIndex, socket);
    if (seen.has(key)) {
      this.report(nodeIndex, node.op, "value-cycle", socket);
      return null;
    }
    if (!isPureOperation(node.op)) {
      // A flow node's outputs are whatever its last activation produced. An
      // output that has not been produced yet is genuinely unknown, so it is
      // reported rather than substituted with a plausible zero.
      const stored = this.outputs.get(key);
      if (stored) return stored;
      if (node.op === "event/onTick") {
        if (socket === "timeSinceStart") return floatValue(this.timeSeconds);
        if (socket === "timeSinceLastTick") {
          return floatValue(this.timeSeconds - this.lastTickSeconds);
        }
      }
      return null;
    }
    seen.add(key);
    const computed = this.evaluatePure(node, socket, seen);
    seen.delete(key);
    return computed;
  }

  private evaluatePure(
    node: ParsedNode,
    socket: string,
    seen: Set<string>,
  ): InteractivityValue | null {
    const op = node.op ?? "";
    if (op === "variable/get") {
      const index = this.configurationIndex(node, "variable");
      if (socket === "isValid") {
        return boolValue(index !== null && this.variables[index] !== undefined);
      }
      return index === null ? null : (this.variables[index] ?? null);
    }
    if (op === "pointer/get") {
      const pointer = this.configurationString(node, "pointer");
      if (socket === "isValid") return boolValue(Boolean(pointer));
      if (!pointer) return null;
      return this.host.readPointer?.(pointer) ?? null;
    }
    if (op.startsWith("type/")) {
      const source = this.readAny(node, A_INPUT, seen);
      switch (op) {
        case "type/boolToFloat":
          return floatValue(asBoolean(source) ? 1 : 0);
        case "type/boolToInt":
          return intValue(asBoolean(source) ? 1 : 0);
        case "type/floatToBool":
        case "type/intToBool":
          return boolValue(asNumber(source) !== 0);
        case "type/floatToInt":
          return intValue(Math.trunc(asNumber(source)));
        case "type/intToFloat":
          return floatValue(asNumber(source));
        default:
          return null;
      }
    }
    if (op === "ref/eq") {
      const left = this.readAny(node, A_INPUT, seen);
      const right = this.readAny(node, B_INPUT, seen);
      return boolValue(asNumber(left) === asNumber(right));
    }
    return this.evaluateMath(op, node, socket, seen);
  }

  private evaluateMath(
    op: string,
    node: ParsedNode,
    socket: string,
    seen: Set<string>,
  ): InteractivityValue | null {
    const a = () => this.readAny(node, A_INPUT, seen);
    const b = () => this.readAny(node, B_INPUT, seen);
    const c = () => this.readAny(node, C_INPUT, seen);

    switch (op) {
      case "math/E":
        return floatValue(Math.E);
      case "math/Pi":
        return floatValue(Math.PI);
      case "math/Tau":
        return floatValue(Math.PI * 2);
      case "math/Inf":
        return floatValue(Number.POSITIVE_INFINITY);
      case "math/NaN":
        return { signature: "float", data: [Number.NaN] };
      case "math/add":
        return componentWise(a(), b(), (left, right) => left + right);
      case "math/sub":
        return componentWise(a(), b(), (left, right) => left - right);
      case "math/mul":
        return componentWise(a(), b(), (left, right) => left * right);
      case "math/div":
        return componentWise(a(), b(), (left, right) => (right === 0 ? 0 : left / right));
      case "math/rem":
        return componentWise(a(), b(), (left, right) => (right === 0 ? 0 : left % right));
      case "math/min":
        return componentWise(a(), b(), Math.min);
      case "math/max":
        return componentWise(a(), b(), Math.max);
      case "math/pow":
        return componentWise(a(), b(), Math.pow);
      case "math/atan2":
        return componentWise(a(), b(), Math.atan2);
      case "math/neg":
        return mapComponents(a(), (entry) => -entry);
      case "math/abs":
        return mapComponents(a(), Math.abs);
      case "math/sign":
        return mapComponents(a(), Math.sign);
      case "math/floor":
        return mapComponents(a(), Math.floor);
      case "math/ceil":
        return mapComponents(a(), Math.ceil);
      case "math/round":
        return mapComponents(a(), Math.round);
      case "math/trunc":
        return mapComponents(a(), Math.trunc);
      case "math/fract":
        return mapComponents(a(), (entry) => entry - Math.floor(entry));
      case "math/sqrt":
        return mapComponents(a(), (entry) => (entry < 0 ? 0 : Math.sqrt(entry)));
      case "math/cbrt":
        return mapComponents(a(), Math.cbrt);
      case "math/exp":
        return mapComponents(a(), Math.exp);
      case "math/log":
        return mapComponents(a(), (entry) => (entry > 0 ? Math.log(entry) : 0));
      case "math/log2":
        return mapComponents(a(), (entry) => (entry > 0 ? Math.log2(entry) : 0));
      case "math/log10":
        return mapComponents(a(), (entry) => (entry > 0 ? Math.log10(entry) : 0));
      case "math/sin":
        return mapComponents(a(), Math.sin);
      case "math/cos":
        return mapComponents(a(), Math.cos);
      case "math/tan":
        return mapComponents(a(), Math.tan);
      case "math/asin":
        return mapComponents(a(), Math.asin);
      case "math/acos":
        return mapComponents(a(), Math.acos);
      case "math/atan":
        return mapComponents(a(), Math.atan);
      case "math/rad":
        return mapComponents(a(), (entry) => (entry * Math.PI) / 180);
      case "math/deg":
        return mapComponents(a(), (entry) => (entry * 180) / Math.PI);
      case "math/saturate":
        return mapComponents(a(), (entry) => Math.min(1, Math.max(0, entry)));
      case "math/isInf":
        return boolValue(!Number.isFinite(asNumber(a())) && !Number.isNaN(asNumber(a())));
      case "math/isNaN":
        return boolValue(Number.isNaN(asNumber(a())));
      case "math/clamp": {
        const value = a();
        const low = asNumber(b());
        const high = asNumber(c());
        return mapComponents(value, (entry) => Math.min(Math.max(entry, low), high));
      }
      case "math/mix": {
        const from = a();
        const to = b();
        return mixValues(from ?? floatValue(0), to ?? floatValue(0), asNumber(c()));
      }
      case "math/smoothStep": {
        const value = asNumber(a());
        const edge0 = asNumber(b());
        const edge1 = asNumber(c());
        const span = edge1 - edge0;
        const ratio = span === 0 ? 0 : Math.min(1, Math.max(0, (value - edge0) / span));
        return floatValue(ratio * ratio * (3 - 2 * ratio));
      }
      case "math/random":
        return floatValue((this.host.random ?? Math.random)());
      case "math/eq":
        return boolValue(asNumber(a()) === asNumber(b()));
      case "math/lt":
        return boolValue(asNumber(a()) < asNumber(b()));
      case "math/le":
        return boolValue(asNumber(a()) <= asNumber(b()));
      case "math/gt":
        return boolValue(asNumber(a()) > asNumber(b()));
      case "math/ge":
        return boolValue(asNumber(a()) >= asNumber(b()));
      case "math/and":
        return boolValue(asBoolean(a()) && asBoolean(b()));
      case "math/or":
        return boolValue(asBoolean(a()) || asBoolean(b()));
      case "math/xor":
        return boolValue(asBoolean(a()) !== asBoolean(b()));
      case "math/not":
        return boolValue(!asBoolean(a()));
      case "math/select":
        return asBoolean(c()) ? a() : b();
      case "math/length": {
        const value = a();
        const components = asNumbers(value, Math.max(1, valueLength(value)));
        return floatValue(Math.hypot(...components));
      }
      case "math/normalize": {
        const value = a();
        const length = Math.max(1, valueLength(value));
        const components = asNumbers(value, length);
        const magnitude = Math.hypot(...components);
        return magnitude === 0
          ? vectorValue(components)
          : vectorValue(components.map((entry) => entry / magnitude));
      }
      case "math/dot": {
        const left = asNumbers(a(), Math.max(1, valueLength(a())));
        const right = asNumbers(b(), left.length);
        return floatValue(
          left.reduce((total, entry, index) => total + entry * (right[index] ?? 0), 0),
        );
      }
      case "math/cross": {
        const left = asNumbers(a(), 3);
        const right = asNumbers(b(), 3);
        return vectorValue([
          (left[1] ?? 0) * (right[2] ?? 0) - (left[2] ?? 0) * (right[1] ?? 0),
          (left[2] ?? 0) * (right[0] ?? 0) - (left[0] ?? 0) * (right[2] ?? 0),
          (left[0] ?? 0) * (right[1] ?? 0) - (left[1] ?? 0) * (right[0] ?? 0),
        ]);
      }
      case "math/combine2":
        return vectorValue([asNumber(a()), asNumber(b())]);
      case "math/combine3":
        return vectorValue([asNumber(a()), asNumber(b()), asNumber(c())]);
      case "math/combine4":
        return vectorValue([
          asNumber(a()),
          asNumber(b()),
          asNumber(c()),
          asNumber(this.readAny(node, ["d", "3"], seen)),
        ]);
      case "math/extract2":
      case "math/extract3":
      case "math/extract4": {
        // Extract publishes one output per component, named by its index, so
        // the socket the caller asked for is what selects the component.
        const value = a();
        if (!value) return null;
        const components = asNumbers(value, Math.max(1, valueLength(value)));
        const index = Number.isInteger(Number(socket)) ? Number(socket) : 0;
        return floatValue(components[index] ?? 0);
      }
      default:
        return null;
    }
  }

  // ------------------------------------------------------------ scheduling

  private schedule(node: number, socket: string, delaySeconds: number): number | null {
    if (this.timers.length >= MAX_PENDING_TIMERS) return null;
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.push({
      id,
      dueAt: this.timeSeconds + Math.max(0, delaySeconds),
      node,
      socket,
      cancelled: false,
    });
    return id;
  }

  private cancelTimersOf(nodeIndex: number): void {
    for (const timer of this.timers) {
      if (timer.node === nodeIndex) timer.cancelled = true;
    }
    this.timers = this.timers.filter((timer) => !timer.cancelled);
  }

  private beginInterpolation(entry: {
    node: number;
    kind: Interpolation["kind"];
    variableIndex: number;
    pointer: string;
    target: InteractivityActionTarget | null;
    from: InteractivityValue;
    to: InteractivityValue;
    duration: number;
    easing: InteractivityEasing;
  }): void {
    // Restarting the same node replaces its interpolation instead of stacking
    // two writers on one property.
    this.interpolations = this.interpolations.filter(
      (candidate) => candidate.node !== entry.node,
    );
    const duration = Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : 0;
    const interpolation: Interpolation = {
      id: this.nextTimerId,
      node: entry.node,
      kind: entry.kind,
      variableIndex: entry.variableIndex,
      pointer: entry.pointer,
      target: entry.target,
      from: entry.from,
      to: entry.to,
      duration,
      easing: entry.easing,
      elapsed: 0,
      cancelled: false,
    };
    this.nextTimerId += 1;
    if (duration === 0) {
      this.applyInterpolation(interpolation, 1);
      this.schedule(entry.node, "done", 0);
      return;
    }
    this.interpolations.push(interpolation);
  }

  private advanceInterpolations(deltaSeconds: number): void {
    if (deltaSeconds <= 0 || this.interpolations.length === 0) return;
    const finished: Interpolation[] = [];
    for (const entry of this.interpolations) {
      if (entry.cancelled) continue;
      entry.elapsed += deltaSeconds;
      const ratio = entry.duration === 0 ? 1 : entry.elapsed / entry.duration;
      this.applyInterpolation(entry, ratio);
      if (ratio >= 1) finished.push(entry);
    }
    if (finished.length === 0) return;
    this.interpolations = this.interpolations.filter(
      (entry) => !finished.includes(entry) && !entry.cancelled,
    );
    for (const entry of finished) {
      const node = this.graph?.nodes[entry.node];
      if (!node) continue;
      const target = node.flows.get("done");
      if (target) this.runFrom(target.node, target.socket);
    }
  }

  private applyInterpolation(entry: Interpolation, ratio: number): void {
    const eased = applyEasing(ratio, entry.easing);
    const value = mixValues(entry.from, entry.to, eased);
    if (entry.kind === "variable") {
      this.variables[entry.variableIndex] = value;
      return;
    }
    if (entry.kind === "pointer") {
      this.host.writePointer?.(entry.pointer, value);
      return;
    }
    if (entry.target) this.host.writeProperty?.(entry.target, value);
  }

  // -------------------------------------------------------------- helpers

  private setOutput(node: number, socket: string, value: InteractivityValue): void {
    this.outputs.set(outputKey(node, socket), value);
  }

  private configurationString(node: ParsedNode, key: string): string | null {
    const entry = node.configuration.get(key)?.[0];
    return typeof entry === "string" && entry ? entry : null;
  }

  private configurationIndex(node: ParsedNode, key: string): number | null {
    const entry = node.configuration.get(key)?.[0];
    return typeof entry === "number" && Number.isInteger(entry) && entry >= 0
      ? entry
      : null;
  }

  private configurationFlag(node: ParsedNode, key: string, fallback: boolean): boolean {
    const entry = node.configuration.get(key)?.[0];
    return typeof entry === "boolean" ? entry : fallback;
  }

  private configurationEventId(node: ParsedNode): string | null {
    const named = this.configurationString(node, "event");
    if (named) return named;
    const index = this.configurationIndex(node, "event");
    if (index === null) return null;
    return this.graph?.events[index] ?? null;
  }

  private waitAllInputs(node: ParsedNode): string[] {
    const declared = this.configurationIndex(node, "inputFlows");
    if (declared !== null && declared > 0) {
      return Array.from({ length: declared }, (_unused, index) => String(index));
    }
    // Without a declared count the node waits for every input another node
    // actually targets, which is what the editor writes when it connects one.
    const inputs = new Set<string>();
    for (const candidate of this.graph?.nodes ?? []) {
      for (const target of candidate.flows.values()) {
        if (target.node === node.index && target.socket !== "reset") {
          inputs.add(target.socket);
        }
      }
    }
    return [...inputs].sort(compareFlowSocketNames);
  }

  private actionTarget(node: ParsedNode): InteractivityActionTarget | null {
    const entityId = this.configurationString(node, "entity");
    const targetKind = this.configurationString(node, "targetKind");
    const property = this.configurationString(node, "property");
    if (!entityId || !targetKind || !property) return null;
    const componentId = this.configurationString(node, "component");
    return {
      entityId,
      componentId: targetKind === "entity" ? null : componentId,
      targetKind,
      property,
    };
  }

  private record(nodeIndex: number, op: string | null, socket: string): void {
    this.trace.push({ timeSeconds: this.timeSeconds, nodeIndex, op, socket });
    if (this.trace.length > this.traceLimit) this.trace.shift();
  }

  private report(
    nodeIndex: number,
    op: string | null,
    reason: InteractivityIssueReason,
    detail?: string,
  ): void {
    const duplicate = this.issues.some(
      (issue) =>
        issue.nodeIndex === nodeIndex &&
        issue.reason === reason &&
        issue.detail === detail,
    );
    if (duplicate) return;
    this.issues.push({
      graphIndex: this.graphIndex,
      nodeIndex,
      op,
      reason,
      ...(detail === undefined ? {} : { detail }),
    });
  }
}

function outputKey(node: number, socket: string): string {
  return `${node}:${socket}`;
}

/** Orders `0`, `1`, `10` numerically, and anything else alphabetically. */
function compareFlowSocketNames(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumber = Number.isInteger(leftNumber);
  const rightIsNumber = Number.isInteger(rightNumber);
  if (leftIsNumber && rightIsNumber) return leftNumber - rightNumber;
  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;
  return left.localeCompare(right);
}

/** Signature length re-exported so hosts can size a write without importing graph.ts. */
export { signatureLength };
