/**
 * Turning a canonical graph into what React Flow draws, and back.
 *
 * Every function here is pure: the editor owns the draft and the history, and
 * asks these to read it or to return the next one. Keeping them out of the
 * component is what lets a fixture reason about "delete this node" without a
 * canvas.
 */

import type { Edge } from "@xyflow/react";
import {
  getInteractivityOperationTemplate,
  getInteractivityRuntimeSupport,
  isInteractivityTriggerActionOp,
  readInteractivityClipName,
  readInteractivityNodeNote,
  readInteractivityNodePosition,
  readInteractivityTriggerAction,
  readInteractivityTriggerActionDuration,
  XRIFT_INTERACTION_OPERATIONS,
  type KhrInteractivityGraph,
  type KhrInteractivityNode,
} from "../../lib/visual-editor";
import {
  describeInteractionTriggerAction,
  type InteractionTriggerTargetEntity,
} from "../../lib/visual-editor/interaction-trigger-targets";
import {
  FLOW_SOCKET_COLOR,
  VALUE_SOCKET_COLOR,
  type GraphFlowNode,
  type GraphNodeData,
} from "./InteractivityNodeCard";

export function triggerActionSummary(
  graph: KhrInteractivityGraph,
  index: number,
  op: string,
  targets: readonly InteractionTriggerTargetEntity[],
): string | undefined {
  const action = readInteractivityTriggerAction(graph, index);
  if (!action) return undefined;
  return describeInteractionTriggerAction(targets, {
    ...action,
    mode: op === XRIFT_INTERACTION_OPERATIONS.toggleProperty ? "toggle" : "set",
    durationSeconds: readInteractivityTriggerActionDuration(graph, index),
  });
}

export function operationData(
  graph: KhrInteractivityGraph,
  node: KhrInteractivityNode,
  index: number,
  targets: readonly InteractionTriggerTargetEntity[],
  visited: ReadonlyMap<number, number> | null,
): GraphNodeData {
  const declaration = graph.declarations?.[node.declaration];
  const op = declaration?.op ?? `missing/declaration-${node.declaration}`;
  const template = getInteractivityOperationTemplate(op);
  const valueOutputs = new Set(template?.valueOutputs ?? []);
  for (const candidate of graph.nodes ?? []) {
    for (const input of Object.values(candidate.values ?? {})) {
      if (input.node === index) valueOutputs.add(input.socket ?? "value");
    }
  }
  return {
    index,
    op,
    label: template?.label ?? op,
    category: template?.category ?? "extension",
    flowInputs: template?.flowInputs ?? ["in"],
    flowOutputs: Array.from(
      new Set([...(template?.flowOutputs ?? []), ...Object.keys(node.flows ?? {})]),
    ),
    valueInputs: Array.from(
      new Set([...(template?.valueInputs ?? []), ...Object.keys(node.values ?? {})]),
    ),
    valueOutputs: Array.from(valueOutputs),
    runtimeSupport: getInteractivityRuntimeSupport(op).support,
    ...(visited === null
      ? {}
      : { reachedSeconds: visited.get(index) ?? null }),
    ...(isInteractivityTriggerActionOp(op)
      ? { summary: triggerActionSummary(graph, index, op, targets) }
      : {}),
    ...(op.startsWith("animation/")
      ? { summary: readInteractivityClipName(graph, index) }
      : {}),
    ...(readInteractivityNodeNote(graph, index) === undefined
      ? {}
      : { summary: readInteractivityNodeNote(graph, index) }),
  };
}

export function toFlowNodes(
  graph: KhrInteractivityGraph,
  targets: readonly InteractionTriggerTargetEntity[],
  visited: ReadonlyMap<number, number> | null,
): GraphFlowNode[] {
  return (graph.nodes ?? []).map((node, index) => ({
    id: String(index),
    type: "interactivity",
    position: readInteractivityNodePosition(node, index),
    data: operationData(graph, node, index, targets, visited),
  }));
}

/**
 * Draws the connections, with the two readings a dense graph needs.
 *
 * Selecting a node brings its own wires forward and pushes the rest back, which
 * is the only way to follow one chain through a graph with thirty of them. When
 * the timeline has run, a wire whose source never ran is drawn as faint as the
 * node it comes from, so "this half is dead" is visible without reading labels.
 */
export function toFlowEdges(
  graph: KhrInteractivityGraph,
  options: {
    selectedNodeIndex: number | null;
    visited: ReadonlyMap<number, number> | null;
  },
): Edge[] {
  const { selectedNodeIndex, visited } = options;
  const emphasis = (sourceIndex: number, targetIndex: number): number => {
    if (visited && !visited.has(sourceIndex)) return 0.2;
    if (selectedNodeIndex === null) return 1;
    return sourceIndex === selectedNodeIndex || targetIndex === selectedNodeIndex
      ? 1
      : 0.3;
  };
  const width = (sourceIndex: number, targetIndex: number): number =>
    selectedNodeIndex !== null &&
    (sourceIndex === selectedNodeIndex || targetIndex === selectedNodeIndex)
      ? 3
      : 2;

  const edges: Edge[] = [];
  for (const [sourceIndex, node] of (graph.nodes ?? []).entries()) {
    for (const [socket, target] of Object.entries(node.flows ?? {})) {
      const opacity = emphasis(sourceIndex, target.node);
      edges.push({
        id: `flow:${sourceIndex}:${socket}:${target.node}:${target.socket ?? "in"}`,
        source: String(sourceIndex),
        target: String(target.node),
        sourceHandle: `flow-out:${socket}`,
        targetHandle: `flow-in:${target.socket ?? "in"}`,
        type: "smoothstep",
        animated: opacity === 1,
        style: {
          stroke: FLOW_SOCKET_COLOR,
          strokeWidth: width(sourceIndex, target.node),
          opacity,
        },
      });
    }
  }
  for (const [targetIndex, node] of (graph.nodes ?? []).entries()) {
    for (const [socket, input] of Object.entries(node.values ?? {})) {
      if (input.node === undefined) continue;
      const opacity = emphasis(input.node, targetIndex);
      edges.push({
        id: `value:${input.node}:${input.socket ?? "value"}:${targetIndex}:${socket}`,
        source: String(input.node),
        target: String(targetIndex),
        sourceHandle: `value-out:${input.socket ?? "value"}`,
        targetHandle: `value-in:${socket}`,
        type: "smoothstep",
        style: {
          stroke: VALUE_SOCKET_COLOR,
          strokeWidth: width(input.node, targetIndex),
          opacity,
        },
      });
    }
  }
  return edges;
}

export function parseHandle(handle: string | null | undefined): [string, string] | null {
  if (!handle) return null;
  const separator = handle.indexOf(":");
  if (separator < 0) return null;
  return [handle.slice(0, separator), handle.slice(separator + 1)];
}

/**
 * Removes nodes and repairs every index that pointed past them.
 *
 * Node identity in a KHR graph is its position in the array, so deleting one
 * renumbers the rest. Doing several at once in a single pass is what keeps a
 * multi-select delete from remapping against indices an earlier removal already
 * moved.
 */
export function removeNodesAndReindex(
  graph: KhrInteractivityGraph,
  removed: readonly number[],
): void {
  const dropped = new Set(removed);
  const nodes = graph.nodes ?? [];
  const remap = new Map<number, number>();
  let next = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    if (dropped.has(index)) continue;
    remap.set(index, next);
    next += 1;
  }
  graph.nodes = nodes.filter((_unused, index) => !dropped.has(index));
  for (const node of graph.nodes) {
    if (node.flows) {
      node.flows = Object.fromEntries(
        Object.entries(node.flows).flatMap(([socket, target]) => {
          const moved = remap.get(target.node);
          return moved === undefined ? [] : [[socket, { ...target, node: moved }]];
        }),
      );
      if (Object.keys(node.flows).length === 0) delete node.flows;
    }
    if (node.values) {
      node.values = Object.fromEntries(
        Object.entries(node.values).flatMap(([socket, input]) => {
          if (input.node === undefined) return [[socket, input]];
          const moved = remap.get(input.node);
          return moved === undefined ? [] : [[socket, { ...input, node: moved }]];
        }),
      );
      if (Object.keys(node.values).length === 0) delete node.values;
    }
  }
}

/** Writes one connection into the graph, in whichever direction it runs. */
export function applyConnectionToGraph(
  graph: KhrInteractivityGraph,
  connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null },
): void {
  const sourceIndex = Number(connection.source);
  const targetIndex = Number(connection.target);
  const sourceHandle = parseHandle(connection.sourceHandle);
  const targetHandle = parseHandle(connection.targetHandle);
  if (!sourceHandle || !targetHandle) return;
  const source = graph.nodes?.[sourceIndex];
  const target = graph.nodes?.[targetIndex];
  if (!source || !target) return;
  if (sourceHandle[0] === "flow-out" && targetHandle[0] === "flow-in") {
    source.flows = {
      ...(source.flows ?? {}),
      [sourceHandle[1]]: {
        node: targetIndex,
        ...(targetHandle[1] === "in" ? {} : { socket: targetHandle[1] }),
      },
    };
  }
  if (sourceHandle[0] === "value-out" && targetHandle[0] === "value-in") {
    target.values = {
      ...(target.values ?? {}),
      [targetHandle[1]]: {
        node: sourceIndex,
        ...(sourceHandle[1] === "value" ? {} : { socket: sourceHandle[1] }),
      },
    };
  }
}

/** Removes one connection, addressed the same way the canvas draws it. */
export function removeConnectionFromGraph(graph: KhrInteractivityGraph, edge: Edge): void {
  const sourceHandle = parseHandle(edge.sourceHandle);
  const targetHandle = parseHandle(edge.targetHandle);
  if (sourceHandle?.[0] === "flow-out") {
    const node = graph.nodes?.[Number(edge.source)];
    if (node?.flows) {
      delete node.flows[sourceHandle[1]];
      if (Object.keys(node.flows).length === 0) delete node.flows;
    }
  }
  if (targetHandle?.[0] === "value-in") {
    const node = graph.nodes?.[Number(edge.target)];
    if (node?.values) {
      delete node.values[targetHandle[1]];
      if (Object.keys(node.values).length === 0) delete node.values;
    }
  }
}