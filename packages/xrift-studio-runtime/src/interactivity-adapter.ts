/**
 * The KHR_interactivity operations this runtime actually executes.
 *
 * XRift Studio's Play preview and the published runtime both animate from the
 * same graph, so they have to agree on which operations run and what a
 * partially supported one does. This module is that agreement: Studio imports
 * it for its Play preview and its authoring diagnostics, and the three.js and
 * React Three Fiber runtimes import it for playback.
 *
 * Input is untrusted published JSON, so every read is structural. The graph is
 * never rewritten here: an unsupported operation stays in the canonical JSON
 * and simply does not run.
 */

/** How far this runtime implements one operation. */
export type InteractivityRuntimeSupport = "executed" | "conditional" | "ignored";

/** One animation the adapter will start, and when. */
export type InteractivityAnimationCue = {
  animationIndex: number;
  /** Seconds after the graph starts, accumulated from `flow/setDelay`. */
  delaySeconds: number;
};

/** A node the walk refused to run, and why, for the caller to surface. */
export type InteractivityRuntimeIssue = {
  graphIndex: number;
  nodeIndex: number;
  op: string;
  reason: "stop-after-start";
};

/**
 * Single source of truth for operation support.
 *
 * Extending the runtime means changing this table and {@link walkOnStart}
 * together. Presentation (labels, translated notes) belongs to the caller;
 * only the classification lives here.
 */
export const KHR_INTERACTIVITY_RUNTIME_SUPPORT: Readonly<
  Record<string, InteractivityRuntimeSupport>
> = {
  "event/onStart": "executed",
  "animation/start": "executed",
  "animation/stop": "conditional",
  "flow/branch": "conditional",
  "flow/setDelay": "conditional",
  // XRIFT_studio_interaction. Run by the Interaction Trigger runtime rather
  // than by the walk below, and only once the graph is attached to an Entity,
  // which is why they are conditional instead of executed.
  "xrift/onInteract": "conditional",
  "xrift/setProperty": "conditional",
  "xrift/toggleProperty": "conditional",
};

export function getInteractivityRuntimeSupport(
  op: string,
): InteractivityRuntimeSupport {
  return KHR_INTERACTIVITY_RUNTIME_SUPPORT[op] ?? "ignored";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function socketOf(
  node: Record<string, unknown> | undefined,
  name: string,
): Record<string, unknown> | undefined {
  return asRecord(asRecord(node?.values)?.[name]);
}

/**
 * Reads a value socket without evaluating the graph.
 *
 * A declared socket with no inline value takes its type default, which is what
 * the RC specifies and what Studio's "start an animation" recipe relies on: it
 * writes no value and means animation 0. A socket fed by another node returns
 * `null`, because there is no expression evaluator here and reading its stale
 * inline literal would run the graph on a value the author replaced with a
 * wire.
 */
function socketNumber(
  socket: Record<string, unknown> | undefined,
  allowFractions: boolean,
): number | null {
  if (!socket || socket.node !== undefined) return null;
  const values = socket.value;
  const first = Array.isArray(values) ? values[0] : undefined;
  if (first === undefined) return 0;
  if (typeof first !== "number" || !Number.isFinite(first) || first < 0) {
    return null;
  }
  return allowFractions || Number.isInteger(first) ? first : null;
}

function socketBoolean(
  socket: Record<string, unknown> | undefined,
): boolean | null {
  if (!socket || socket.node !== undefined) return null;
  const values = socket.value;
  const first = Array.isArray(values) ? values[0] : undefined;
  if (first === undefined) return false;
  return typeof first === "boolean" ? first : null;
}

export type InteractivityAdapterRun = {
  cues: InteractivityAnimationCue[];
  issues: InteractivityRuntimeIssue[];
};

/**
 * Walks the selected graph's `event/onStart` flows.
 *
 * The walk only continues through operations this runtime executes. Walking
 * past an unimplemented node would run the rest of the chain as though the
 * skipped node had succeeded, which is worse than a no-op: a graph gated
 * behind `flow/branch` started both branches at once, and one behind
 * `flow/setDelay` started with no delay at all.
 */
export function walkOnStart(value: unknown): InteractivityAdapterRun {
  const extension = asRecord(value);
  const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
  const rawGraphIndex = extension?.graph;
  const graphIndex =
    typeof rawGraphIndex === "number" &&
    Number.isInteger(rawGraphIndex) &&
    rawGraphIndex >= 0
      ? rawGraphIndex
      : 0;
  const graph = asRecord(graphs[graphIndex]);
  const declarations = Array.isArray(graph?.declarations) ? graph.declarations : [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  const operationFor = (
    node: Record<string, unknown> | undefined,
  ): string | undefined => {
    const declarationIndex = node?.declaration;
    if (
      typeof declarationIndex !== "number" ||
      !Number.isInteger(declarationIndex) ||
      declarationIndex < 0
    ) {
      return undefined;
    }
    const op = asRecord(declarations[declarationIndex])?.op;
    return typeof op === "string" ? op : undefined;
  };

  const cues = new Map<number, InteractivityAnimationCue>();
  const issues: InteractivityRuntimeIssue[] = [];

  // Ordered walk, not a queue: `animation/stop` only cancels an
  // `animation/start` the same chain already reached.
  const walk = (
    nodeIndex: number,
    delaySeconds: number,
    visited: Set<number>,
  ): void => {
    if (visited.has(nodeIndex)) return;
    const node = asRecord(nodes[nodeIndex]);
    if (!node) return;
    visited.add(nodeIndex);
    const op = operationFor(node);
    const follow = (socket: string, nextDelay = delaySeconds): void => {
      const flow = asRecord(asRecord(node.flows)?.[socket]);
      const target = flow?.node;
      if (typeof target === "number" && Number.isInteger(target) && target >= 0) {
        walk(target, nextDelay, visited);
      }
    };

    switch (op) {
      case "event/onStart":
        follow("out");
        return;
      case "animation/start": {
        const animationIndex = socketNumber(socketOf(node, "animation"), false);
        if (animationIndex === null) return;
        cues.set(animationIndex, { animationIndex, delaySeconds });
        follow("out");
        return;
      }
      case "animation/stop": {
        const animationIndex = socketNumber(socketOf(node, "animation"), false);
        if (animationIndex === null) return;
        const pending = cues.get(animationIndex);
        if (pending && pending.delaySeconds >= delaySeconds) {
          cues.delete(animationIndex);
        } else if (pending) {
          // The clip is already running by the time this node is reached, and
          // stopping a running clip is not implemented.
          issues.push({
            graphIndex,
            nodeIndex,
            op,
            reason: "stop-after-start",
          });
        }
        follow("out");
        return;
      }
      case "flow/setDelay": {
        const duration = socketNumber(socketOf(node, "duration"), true);
        if (duration === null) return;
        // RC semantics: `out` continues as soon as the delay is scheduled,
        // `done` continues once it elapses.
        follow("out");
        follow("done", delaySeconds + duration);
        return;
      }
      case "flow/branch": {
        const condition = socketBoolean(socketOf(node, "condition"));
        if (condition === null) return;
        follow(condition ? "true" : "false");
        return;
      }
      default:
        // Unimplemented operation: no side effect and no flow output.
        return;
    }
  };

  nodes.forEach((candidate, nodeIndex) => {
    if (operationFor(asRecord(candidate)) !== "event/onStart") return;
    walk(nodeIndex, 0, new Set<number>());
  });

  return {
    cues: [...cues.values()].sort(
      (left, right) =>
        left.delaySeconds - right.delaySeconds ||
        left.animationIndex - right.animationIndex,
    ),
    issues,
  };
}

/** Animations the graph starts on `event/onStart`, with their delays. */
export function getKhrInteractivityOnStartAnimationCues(
  value: unknown,
): InteractivityAnimationCue[] {
  return walkOnStart(value).cues;
}
