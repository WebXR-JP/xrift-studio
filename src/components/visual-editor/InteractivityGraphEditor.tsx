import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  configureInteractivityMaterialPointer,
  appendInteractivityOperation,
  getInteractivityOperationTemplate,
  getInteractivityRecipeRuntimeSupport,
  getInteractivityRuntimeSupport,
  INTERACTIVITY_RECIPES,
  addInteractivityGraph,
  applyEasing,
  dryRunInteractivityGraph,
  INTERACTIVITY_EASINGS,
  duplicateInteractivityGraph,
  removeInteractivityGraph,
  renameInteractivityGraph,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  linearRgbToTint,
  parseKhrInteractivityExtension,
  readInteractivityNodePosition,
  readInteractivityTriggerActionDuration,
  readInteractivityTriggerActionEasing,
  setInteractivityLiteralValue,
  setInteractivityTriggerActionDuration,
  setInteractivityTriggerActionEasing,
  tintToLinearRgb,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  type InteractivityAsset,
  type InteractivityEasing,
  type InteractivityOperationTemplate,
  type InteractivityRecipe,
  type InteractivityRuntimeSupport,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
  type KhrInteractivityNode,
  type MaterialAsset,
} from "../../lib/visual-editor";
import {
  configureInteractivityTriggerAction,
  defaultTriggerActionValue,
  getXriftInteractionProperty,
  readInteractivityTriggerAction,
  setInteractivityTriggerActionValue,
  xriftInteractionEnumIndex,
  XRIFT_INTERACTION_OPERATIONS,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "../../lib/visual-editor";
import {
  describeInteractionTriggerAction,
  findInteractionTriggerTarget,
  findInteractionTriggerTargetComponent,
  type InteractionTriggerTargetEntity,
} from "../../lib/visual-editor";
import { EditorDialog } from "./EditorDialog";
import { InteractivityTimeline } from "./InteractivityTimeline";
import { EDITOR_ICONS } from "./editor-icons";
import { CodeTokens } from "../CodeBlock";

type GraphNodeCategory = InteractivityOperationTemplate["category"] | "extension";

type GraphNodeData = {
  index: number;
  op: string;
  label: string;
  category: GraphNodeCategory;
  flowInputs: string[];
  flowOutputs: string[];
  valueInputs: string[];
  valueOutputs: string[];
  runtimeSupport: InteractivityRuntimeSupport;
  /** One-line description of an Interaction Trigger action's target. */
  summary?: string;
  /**
   * When this node first ran in the timeline's dry run.
   *
   * `undefined` while the timeline is closed and nothing has been analysed;
   * `null` once it has been, and this node never ran.
   */
  reachedSeconds?: number | null;
};

/**
 * Card label for an operation Play will not run.
 *
 * Only the two states an author has to act on are labelled; a fully executed
 * operation stays unmarked so the badge means something when it appears.
 */
const RUNTIME_SUPPORT_BADGE: Partial<
  Record<
    InteractivityRuntimeSupport,
    { label: string; title: string; className: string }
  >
> = {
  ignored: {
    label: "Play未対応",
    title:
      "Play の実行エンジンがこの operation を実行しません。詳細は右の Diagnostics を確認してください",
    className: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  },
  conditional: {
    label: "接続が必要",
    title:
      "実行はされますが、対象の Entity・Model・Material へ接続されるまで何も変わりません",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  },
};

type GraphFlowNode = Node<GraphNodeData, "interactivity">;

/**
 * Node colours for a dark canvas.
 *
 * These were the light Tailwind steps (`bg-sky-50` and friends) while the
 * canvas sits at `slate-900` under `colorMode="dark"`, so every card glowed
 * white against it and the whole editor read as a different application from
 * the rest of Studio. The hue still carries the category; only the value
 * changed, so a graph an author already knows stays recognisable.
 */
const CATEGORY_CLASS: Record<GraphNodeCategory, string> = {
  event: "border-sky-500/70 bg-sky-950 text-sky-50",
  flow: "border-violet-500/70 bg-violet-950 text-violet-50",
  animation: "border-emerald-500/70 bg-emerald-950 text-emerald-50",
  variable: "border-amber-500/70 bg-amber-950 text-amber-50",
  pointer: "border-cyan-500/70 bg-cyan-950 text-cyan-50",
  math: "border-slate-500/70 bg-slate-800 text-slate-50",
  entity: "border-orange-500/70 bg-orange-950 text-orange-50",
  extension: "border-fuchsia-500/70 bg-fuchsia-950 text-fuchsia-50",
};

/** The same hues as flat colours, so the minimap is a map and not a legend of its own. */
const CATEGORY_MINIMAP_COLOR: Record<GraphNodeCategory, string> = {
  event: "#0284c7",
  flow: "#7c3aed",
  animation: "#059669",
  variable: "#d97706",
  pointer: "#0891b2",
  math: "#475569",
  entity: "#ea580c",
  extension: "#c026d3",
};

const CATEGORY_LABEL: Record<GraphNodeCategory, string> = {
  event: "イベント",
  flow: "フロー",
  animation: "アニメーション",
  variable: "変数",
  pointer: "glTFプロパティ",
  math: "数値",
  entity: "Entity操作",
  extension: "拡張",
};

const PALETTE_CATEGORY_ORDER: readonly GraphNodeCategory[] = [
  "event",
  "entity",
  "flow",
  "animation",
  "pointer",
  "variable",
  "math",
];

/**
 * Stable prop identities for the canvas.
 *
 * A fresh array here re-subscribes React Flow's key handler on every render,
 * and a re-render triggered by the key press itself then misses the key up:
 * the handler stays latched and the *next* Delete does nothing at all.
 */
const DELETE_KEY_CODES: string[] = ["Backspace", "Delete"];
const FIT_VIEW_OPTIONS = { padding: 0.25 } as const;

/**
 * Japanese names for the sockets an author actually reads.
 *
 * The canonical names are part of the KHR contract and stay in the saved JSON,
 * but `err`, `lastDelay` and `timeSinceLastTick` are not what a card should
 * show to someone building a sequence. The raw name stays in the row's tooltip,
 * so the two never drift apart in the author's head.
 */
const SOCKET_LABELS: Readonly<Record<string, string>> = {
  in: "入力",
  out: "出力",
  done: "完了後",
  err: "失敗時",
  cancel: "取り消し",
  reset: "やり直し",
  completed: "すべて完了後",
  loopBody: "繰り返す先",
  default: "その他",
  condition: "条件",
  selection: "選ぶ番号",
  duration: "秒数",
  delay: "待機ID",
  lastDelay: "待機ID",
  value: "値",
  animation: "クリップ番号",
  startTime: "開始位置",
  endTime: "終了位置",
  stopTime: "停止位置",
  speed: "速度",
  n: "回数",
  startIndex: "開始番号",
  endIndex: "終了番号",
  index: "現在の番号",
  currentCount: "通った回数",
  remainingInputs: "残りの入力",
  lastRemainingTime: "残り秒数",
  event: "イベント",
  timeSinceStart: "開始からの秒",
  timeSinceLastTick: "前フレームからの秒",
  material: "Material",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
};

/** Numbered sockets read as positions, not as names. */
function socketDisplayLabel(socket: string): string {
  const named = SOCKET_LABELS[socket];
  if (named) return named;
  return /^\d+$/.test(socket) ? `${Number(socket) + 1}番目` : socket;
}

/**
 * Every node is the same width.
 *
 * A card that grew to fit its longest line pushed its own summary past the
 * border and made the canvas read as a pile of different objects. One width
 * means the graph reads as a structure, and nothing can stick out of a card.
 */
const NODE_CARD_WIDTH = 256;

const FLOW_SOCKET_COLOR = "#a78bfa";
const VALUE_SOCKET_COLOR = "#22d3ee";

const SOCKET_ROW_HEIGHT = 24;
const SOCKET_ROW_PADDING = 8;

/**
 * Where a socket handle sits inside the node body.
 *
 * This has to agree with the row layout below it, not with a constant tuned by
 * eye: a handle that floats away from the label it belongs to is what makes an
 * author drag a wire into the wrong socket.
 */
function socketTop(index: number): number {
  return SOCKET_ROW_PADDING + index * SOCKET_ROW_HEIGHT + SOCKET_ROW_HEIGHT / 2;
}

/**
 * How the canvas moves under the pointer.
 *
 * Wheel and trackpad pan; Ctrl and wheel zooms. The library default is the
 * opposite, so scrolling to look at the next node pushed the whole graph into
 * the distance instead of moving the canvas, which is the single thing that
 * made this editor feel like it was fighting the author.
 */
/** Matches the background dots, so a snapped node lines up with what is drawn. */
const CANVAS_GRID: [number, number] = [24, 24];

const CANVAS_NAVIGATION = {
  panOnScroll: true,
  panOnDrag: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  minZoom: 0.2,
  maxZoom: 2,
} as const;

function SocketRow({
  socket,
  side,
  kind,
}: {
  socket: string;
  side: "left" | "right";
  kind: "flow" | "value";
}) {
  return (
    <p
      title={socket}
      className={`h-6 truncate leading-6 ${side === "right" ? "text-right" : "text-left"} ${
        kind === "flow" ? "font-semibold text-violet-200" : "text-cyan-200"
      }`}
    >
      {socketDisplayLabel(socket)}
    </p>
  );
}

function InteractivityNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  const badge = RUNTIME_SUPPORT_BADGE[data.runtimeSupport];
  const reachedSeconds = data.reachedSeconds;
  const unreached = reachedSeconds === null;
  return (
    <article
      style={{ width: NODE_CARD_WIDTH }}
      // No `overflow-hidden`: React Flow places the socket handles half outside
      // the border on purpose, and clipping them would leave nothing to grab.
      // The fixed width plus truncation is what keeps the content inside.
      className={`rounded-lg border-2 shadow-lg transition-opacity ${
        CATEGORY_CLASS[data.category]
      } ${
        selected ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-900" : ""
      } ${unreached ? "opacity-45" : ""}`}
    >
      <header className="rounded-t-md border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">
            {CATEGORY_LABEL[data.category]}
          </p>
          {unreached ? (
            <span
              title="タイムラインの範囲内では、このノードは一度も動きませんでした"
              className="shrink-0 rounded border border-slate-400/40 bg-slate-400/10 px-1.5 py-px text-[9px] font-semibold text-slate-300"
            >
              未到達
            </span>
          ) : reachedSeconds === undefined ? null : (
            <span
              title="タイムラインの実行で、このノードが最初に動いた時刻です"
              className="shrink-0 rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-emerald-200"
            >
              {Math.round(reachedSeconds * 100) / 100}s
            </span>
          )}
          {badge ? (
            <span
              title={badge.title}
              className={`shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <p
          title={data.label}
          className="mt-0.5 line-clamp-2 text-sm font-bold leading-5"
        >
          {data.label}
        </p>
        {data.summary ? (
          <p
            title={data.summary}
            className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-90"
          >
            {data.summary}
          </p>
        ) : null}
        <code
          title={data.op}
          className="mt-0.5 block truncate text-[10px] opacity-60"
        >
          {data.op}
        </code>
      </header>
      <div className="relative min-h-10 px-3 py-2 text-[11px]">
        <div className="grid grid-cols-2 gap-x-4">
          <div className="min-w-0">
            {data.flowInputs.map((socket) => (
              <SocketRow
                key={`flow-in-${socket}`}
                socket={socket}
                side="left"
                kind="flow"
              />
            ))}
            {data.valueInputs.map((socket) => (
              <SocketRow
                key={`value-in-${socket}`}
                socket={socket}
                side="left"
                kind="value"
              />
            ))}
          </div>
          <div className="min-w-0">
            {data.flowOutputs.map((socket) => (
              <SocketRow
                key={`flow-out-${socket}`}
                socket={socket}
                side="right"
                kind="flow"
              />
            ))}
            {data.valueOutputs.map((socket) => (
              <SocketRow
                key={`value-out-${socket}`}
                socket={socket}
                side="right"
                kind="value"
              />
            ))}
          </div>
        </div>
        {data.flowInputs.map((socket, index) => (
          <Handle
            key={`flow-in-${socket}`}
            id={`flow-in:${socket}`}
            type="target"
            position={Position.Left}
            style={{ top: socketTop(index), width: 10, height: 10, background: FLOW_SOCKET_COLOR }}
          />
        ))}
        {data.valueInputs.map((socket, index) => (
          <Handle
            key={`value-in-${socket}`}
            id={`value-in:${socket}`}
            type="target"
            position={Position.Left}
            style={{
              top: socketTop(data.flowInputs.length + index),
              width: 10,
              height: 10,
              borderRadius: 2,
              background: VALUE_SOCKET_COLOR,
            }}
          />
        ))}
        {data.flowOutputs.map((socket, index) => (
          <Handle
            key={`flow-out-${socket}`}
            id={`flow-out:${socket}`}
            type="source"
            position={Position.Right}
            style={{ top: socketTop(index), width: 10, height: 10, background: FLOW_SOCKET_COLOR }}
          />
        ))}
        {data.valueOutputs.map((socket, index) => (
          <Handle
            key={`value-out-${socket}`}
            id={`value-out:${socket}`}
            type="source"
            position={Position.Right}
            style={{
              top: socketTop(data.flowOutputs.length + index),
              width: 10,
              height: 10,
              borderRadius: 2,
              background: VALUE_SOCKET_COLOR,
            }}
          />
        ))}
      </div>
    </article>
  );
}

const nodeTypes = { interactivity: InteractivityNodeCard };

function isTriggerActionOp(op: string | undefined): boolean {
  return (
    op === XRIFT_INTERACTION_OPERATIONS.setProperty ||
    op === XRIFT_INTERACTION_OPERATIONS.toggleProperty
  );
}

function triggerActionSummary(
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

function operationData(
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
    ...(isTriggerActionOp(op)
      ? { summary: triggerActionSummary(graph, index, op, targets) }
      : {}),
  };
}

function toFlowNodes(
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
function toFlowEdges(
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

function parseHandle(handle: string | null | undefined): [string, string] | null {
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
function removeNodesAndReindex(
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
function applyConnectionToGraph(
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
function removeConnectionFromGraph(graph: KhrInteractivityGraph, edge: Edge): void {
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

function numbersOf(value: KhrInteractivityJsonValue[] | undefined, length: number): number[] {
  return Array.from({ length }, (_unused, index) => {
    const entry = value?.[index];
    return typeof entry === "number" && Number.isFinite(entry) ? entry : 0;
  });
}

/**
 * An editor for one literal socket value.
 *
 * Without this the only way to say which colour a `pointer/set` writes was to
 * hand-edit the KHR JSON, which is what made the graph editor feel like a
 * viewer rather than an editor.
 */
function LiteralValueField({
  socket,
  signature,
  value,
  isColor,
  disabled,
  onChange,
}: {
  socket: string;
  signature: string | undefined;
  value: KhrInteractivityJsonValue[] | undefined;
  isColor: boolean;
  disabled: boolean;
  onChange: (next: KhrInteractivityJsonValue[]) => void;
}) {
  const length =
    signature === "float2" ? 2 : signature === "float3" ? 3 : signature === "float4" ? 4 : 1;
  const channels = numbersOf(value, length);
  const alpha = signature === "float4" ? channels[3] : null;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-300">{socket}</span>
        <code className="text-[9px] text-slate-500">{signature ?? "型未設定"}</code>
      </div>
      {signature === "bool" ? (
        <label className="flex items-center gap-2 text-[10px] text-slate-300">
          <input
            type="checkbox"
            checked={value?.[0] === true}
            disabled={disabled}
            onChange={(event) => onChange([event.target.checked])}
            className="h-3.5 w-3.5"
          />
          {value?.[0] === true ? "true" : "false"}
        </label>
      ) : isColor ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={linearRgbToTint(channels)}
            disabled={disabled}
            onChange={(event) => {
              const [red, green, blue] = tintToLinearRgb(event.target.value);
              onChange(alpha === null ? [red, green, blue] : [red, green, blue, alpha]);
            }}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-950 disabled:opacity-45"
            aria-label={`${socket} の色`}
          />
          <code className="text-[10px] text-slate-400">{linearRgbToTint(channels)}</code>
          {alpha === null ? null : (
            <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
              A
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={alpha}
                disabled={disabled}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange([
                    channels[0],
                    channels[1],
                    channels[2],
                    Math.min(1, Math.max(0, next)),
                  ]);
                }}
                className="h-7 w-16 rounded border border-slate-600 bg-slate-950 px-1.5 text-[11px] disabled:opacity-45"
              />
            </label>
          )}
        </div>
      ) : (
        <div className="flex gap-1">
          {channels.map((entry, index) => (
            <input
              key={index}
              type="number"
              step={signature === "int" ? 1 : 0.1}
              value={entry}
              disabled={disabled}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                const channel = signature === "int" ? Math.round(next) : next;
                onChange(channels.map((prior, at) => (at === index ? channel : prior)));
              }}
              className="h-7 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1.5 text-[11px] disabled:opacity-45"
              aria-label={`${socket}${length > 1 ? ` ${index + 1}` : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * An editor for the value one Interaction Trigger action writes.
 *
 * The generic literal editor can only offer raw numbers because it knows the
 * KHR type and nothing else. Here the property descriptor supplies the range,
 * the option labels and whether the three floats are a colour, so the author
 * edits "音量 0.4" instead of "float[0] = 0.4".
 */
function TriggerValueField({
  descriptor,
  value,
  disabled,
  onChange,
}: {
  descriptor: XriftInteractionPropertyDescriptor;
  value: KhrInteractivityJsonValue[] | null;
  disabled: boolean;
  onChange: (next: KhrInteractivityJsonValue[]) => void;
}) {
  const current = value ?? defaultTriggerActionValue(descriptor);
  const first = current[0];
  if (descriptor.kind === "bool") {
    const checked = first !== false;
    return (
      <label className="flex items-center gap-2 text-[10px] text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange([event.target.checked])}
          className="h-3.5 w-3.5"
        />
        {descriptor.label}を{checked ? "ON" : "OFF"}にする
      </label>
    );
  }
  if (descriptor.kind === "enum") {
    const options = descriptor.options ?? [];
    const index =
      typeof first === "number" && options[first]
        ? first
        : xriftInteractionEnumIndex(descriptor, String(descriptor.defaultValue));
    return (
      <label className="block text-[10px] text-slate-300">
        {descriptor.label}
        <select
          value={index}
          disabled={disabled}
          onChange={(event) => onChange([Number(event.target.value)])}
          className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
        >
          {options.map((option, optionIndex) => (
            <option key={option.value} value={optionIndex}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (descriptor.kind === "color") {
    const channels = numbersOf(current, 3);
    return (
      <label className="block text-[10px] text-slate-300">
        {descriptor.label}
        <span className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={linearRgbToTint(channels)}
            disabled={disabled}
            onChange={(event) => onChange(tintToLinearRgb(event.target.value))}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-950 disabled:opacity-45"
            aria-label={`${descriptor.label} の色`}
          />
          <code className="text-[10px] text-slate-400">
            {linearRgbToTint(channels)}
          </code>
        </span>
      </label>
    );
  }
  if (descriptor.kind === "vector3") {
    const components = numbersOf(current, 3);
    return (
      <div className="space-y-1">
        <span className="block text-[10px] text-slate-300">{descriptor.label}</span>
        <div className="flex gap-1">
          {(["X", "Y", "Z"] as const).map((axis, index) => (
            <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="text-[9px] text-slate-500">{axis}</span>
              <input
                type="number"
                step={descriptor.step ?? 0.1}
                value={components[index] ?? 0}
                disabled={disabled}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange(
                    components.map((prior, at) => (at === index ? next : prior)),
                  );
                }}
                className="h-8 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1.5 text-xs disabled:opacity-45"
                aria-label={`${descriptor.label} ${axis}`}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }
  const numeric = typeof first === "number" ? first : Number(descriptor.defaultValue);
  return (
    <label className="block text-[10px] text-slate-300">
      {descriptor.label}
      <input
        type="number"
        value={numeric}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step ?? 0.1}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          const lower = descriptor.min ?? Number.NEGATIVE_INFINITY;
          const upper = descriptor.max ?? Number.POSITIVE_INFINITY;
          onChange([Math.min(Math.max(next, lower), upper)]);
        }}
        className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
      />
    </label>
  );
}

/**
 * Property kinds a timed change is meaningful for.
 *
 * A switch and a picked option have no halfway point; offering a duration for
 * them would promise a fade that can only ever be a jump at the end.
 */
const TIMED_PROPERTY_KINDS: ReadonlySet<string> = new Set([
  "float",
  "color",
  "vector3",
]);

const EASING_LABELS: Readonly<Record<InteractivityEasing, string>> = {
  linear: "一定の速さ",
  "ease-in": "ゆっくり始まる",
  "ease-out": "ゆっくり止まる",
  "ease-in-out": "両端がゆっくり",
  "ease-in-strong": "強くゆっくり始まる",
  "ease-out-strong": "強くゆっくり止まる",
  "ease-out-back": "少し行き過ぎて戻る",
};

/** Draws the chosen curve, so the wording and the motion are the same thing. */
function EasingCurve({ easing }: { easing: InteractivityEasing }) {
  const points = Array.from({ length: 33 }, (_unused, step) => {
    const ratio = step / 32;
    const eased = applyEasing(ratio, easing);
    // The back curve leaves the unit square; the viewBox is padded for it.
    return `${(ratio * 60).toFixed(2)},${(26 - eased * 20).toFixed(2)}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 60 32"
      role="img"
      aria-label={`${EASING_LABELS[easing]}の変化の仕方`}
      className="h-8 w-16 shrink-0 rounded border border-slate-700 bg-slate-950"
    >
      <line x1="0" y1="26" x2="60" y2="26" stroke="#334155" strokeWidth="0.5" />
      <line x1="0" y1="6" x2="60" y2="6" stroke="#334155" strokeWidth="0.5" />
      <polyline
        points={points}
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * How long an action takes, and how the change is spread over that time.
 *
 * A door that snaps open and a door that swings open are the same action with
 * a different duration, so this belongs on the action rather than in a separate
 * node. It is only offered for values that have an in-between: flipping a
 * switch or picking an option halfway through means nothing.
 */
function TriggerTimingField({
  seconds,
  easing,
  disabled,
  onSecondsChange,
  onEasingChange,
}: {
  seconds: number;
  easing: InteractivityEasing;
  disabled: boolean;
  onSecondsChange: (seconds: number) => void;
  onEasingChange: (easing: InteractivityEasing) => void;
}) {
  return (
    <div className="space-y-2 rounded border border-slate-700 bg-slate-950/60 p-2">
      <label className="block text-[10px] text-slate-300">
        かける時間（秒）
        <input
          type="number"
          min={0}
          max={600}
          step={0.1}
          value={seconds}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onSecondsChange(Math.min(600, Math.max(0, next)));
          }}
          className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs disabled:opacity-45"
        />
      </label>
      {seconds > 0 ? (
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-[10px] text-slate-300">
            変わり方
            <select
              value={easing}
              disabled={disabled}
              onChange={(event) =>
                onEasingChange(event.target.value as InteractivityEasing)
              }
              className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
            >
              {INTERACTIVITY_EASINGS.map((entry) => (
                <option key={entry} value={entry}>
                  {EASING_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
          <EasingCurve easing={easing} />
        </div>
      ) : (
        <p className="text-[10px] leading-4 text-slate-400">
          0 のままなら、その場ですぐ変わります。秒数を入れると、その時間をかけて変化します。
        </p>
      )}
    </div>
  );
}

export function InteractivityGraphEditor(props: {
  asset: InteractivityAsset;
  materials: readonly MaterialAsset[];
  /**
   * Entities this graph can write to, collected from the open Scene.
   *
   * Empty when the editor is opened without a Scene; the trigger pickers then
   * say so instead of offering targets that do not exist.
   */
  triggerTargets?: readonly InteractionTriggerTargetEntity[];
  readOnly: boolean;
  onSave: (assetId: string, extension: KhrInteractivityExtension) => void;
  onClose: () => void;
}) {
  // The provider sits above the body so the palette can place a new node at the
  // centre of what the author is actually looking at.
  return (
    <ReactFlowProvider>
      <InteractivityGraphEditorBody {...props} />
    </ReactFlowProvider>
  );
}

/** How many graph edits stay undoable. Older entries fall off the front. */
const GRAPH_HISTORY_LIMIT = 60;

const INSPECTOR_MIN_WIDTH = 240;
const INSPECTOR_MAX_WIDTH = 560;

type GraphDraftHistory = {
  entries: KhrInteractivityExtension[];
  index: number;
};

/** Gap kept between a new node and the ones already placed. */
const NODE_PLACEMENT_GAP = 32;

/**
 * How tall a card will be, from the sockets its operation declares.
 *
 * Placement has to know this: the animation node is three times the height of
 * an event node, and a fixed guess either dropped a new card on top of a tall
 * one or pushed it half a screen away from a short one.
 */
function estimateNodeHeight(graph: KhrInteractivityGraph, index: number): number {
  const node = graph.nodes?.[index];
  const op = node ? graph.declarations?.[node.declaration]?.op : undefined;
  const template = op ? getInteractivityOperationTemplate(op) : undefined;
  const inputs =
    (template?.flowInputs ?? ["in"]).length + (template?.valueInputs ?? []).length;
  const outputs =
    (template?.flowOutputs ?? []).length + (template?.valueOutputs ?? []).length;
  const rows = Math.max(inputs, outputs, 1);
  // Header: category row, up to two title lines, the operation name, and the
  // optional summary an Interaction Trigger action carries.
  const header = op && isTriggerActionOp(op) ? 112 : 92;
  return header + rows * SOCKET_ROW_HEIGHT + SOCKET_ROW_PADDING * 2;
}

/**
 * Nudges a candidate position until it does not land on an existing node.
 *
 * Dropping a new node exactly on top of another is what made "add" feel like
 * nothing happened: the card was there, underneath the one already in view.
 */
function freePositionNear(
  graph: KhrInteractivityGraph,
  candidate: { x: number; y: number },
): { x: number; y: number } {
  const placed = (graph.nodes ?? []).map((node, index) => ({
    position: readInteractivityNodePosition(node, index),
    height: estimateNodeHeight(graph, index),
  }));
  let { x, y } = candidate;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const blocking = placed.find(
      (entry) =>
        Math.abs(entry.position.x - x) < NODE_CARD_WIDTH + NODE_PLACEMENT_GAP &&
        y < entry.position.y + entry.height + NODE_PLACEMENT_GAP &&
        y + entry.height > entry.position.y - NODE_PLACEMENT_GAP,
    );
    if (!blocking) break;
    y = blocking.position.y + blocking.height + NODE_PLACEMENT_GAP;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** Horizontal distance between one layout column and the next. */
const LAYOUT_COLUMN_GAP = 88;
const LAYOUT_ROW_GAP = 40;

/**
 * Lays the graph out left to right, in the order it runs.
 *
 * A graph that arrived as JSON, or one built by adding nodes wherever there was
 * room, reads as a pile. Flow depth is the only ordering that matters to an
 * author, so it becomes the column; a value producer sits one column left of
 * whatever consumes it, which is where the eye already looks for it.
 */
function autoLayoutInteractivityGraph(graph: KhrInteractivityGraph): void {
  const nodes = graph.nodes ?? [];
  if (nodes.length === 0) return;
  const depth = new Array<number>(nodes.length).fill(0);
  const hasFlow = new Array<boolean>(nodes.length).fill(false);

  const flowEdges: [number, number][] = [];
  const valueEdges: [number, number][] = [];
  nodes.forEach((node, index) => {
    for (const target of Object.values(node.flows ?? {})) {
      if (target.node >= nodes.length) continue;
      flowEdges.push([index, target.node]);
      hasFlow[index] = true;
      hasFlow[target.node] = true;
    }
    for (const input of Object.values(node.values ?? {})) {
      if (input.node === undefined || input.node >= nodes.length) continue;
      valueEdges.push([input.node, index]);
    }
  });

  // Bounded relaxation rather than a topological sort: a loop is legal here, and
  // capping the passes is what keeps one from running forever.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const [from, to] of flowEdges) {
      const candidate = (depth[from] ?? 0) + 1;
      if (candidate > (depth[to] ?? 0)) {
        depth[to] = candidate;
        moved = true;
      }
    }
    if (!moved) break;
  }
  // A node that only feeds a value goes just left of its consumer.
  for (const [from, to] of valueEdges) {
    if (hasFlow[from]) continue;
    depth[from] = Math.max(0, (depth[to] ?? 0) - 1);
  }

  const columns = new Map<number, number[]>();
  depth.forEach((column, index) => {
    const existing = columns.get(column) ?? [];
    existing.push(index);
    columns.set(column, existing);
  });

  for (const [column, indices] of columns) {
    indices.sort((left, right) => {
      const leftY = readInteractivityNodePosition(nodes[left]!, left).y;
      const rightY = readInteractivityNodePosition(nodes[right]!, right).y;
      return leftY - rightY || left - right;
    });
    let y = 0;
    for (const index of indices) {
      const node = nodes[index];
      if (!node) continue;
      nodes[index] = writeInteractivityNodePosition(node, {
        x: column * (NODE_CARD_WIDTH + LAYOUT_COLUMN_GAP),
        y,
      });
      y += estimateNodeHeight(graph, index) + LAYOUT_ROW_GAP;
    }
  }
}

/**
 * Which entry point the timeline should show first.
 *
 * A graph seeded by an Interaction Trigger has no `event/onStart` at all, so
 * opening the timeline on "開始時" would answer a question the graph does not
 * ask and read as "this graph does nothing".
 */
function preferredTimelineEntry(
  graph: KhrInteractivityGraph,
): "start" | "interact" {
  const operations = new Set(
    (graph.nodes ?? []).map(
      (node) => graph.declarations?.[node.declaration]?.op ?? "",
    ),
  );
  if (operations.has("event/onStart")) return "start";
  return operations.has(XRIFT_INTERACTION_OPERATIONS.onInteract)
    ? "interact"
    : "start";
}

/**
 * The node a diagnostic is about, read from its JSON path.
 *
 * A diagnostic that only prints `$.graphs[0].nodes[3]` makes the author count
 * nodes by hand; the path already names the node, so the list can just go there.
 */
function parseDiagnosticTarget(
  path: string,
): { graphIndex: number; nodeIndex: number } | null {
  const match = /^\$\.graphs\[(\d+)\]\.nodes\[(\d+)\]/.exec(path);
  if (!match) return null;
  return { graphIndex: Number(match[1]), nodeIndex: Number(match[2]) };
}

/** Shown before the first dry run finishes, so the timeline has a shape to draw. */
const EMPTY_DRY_RUN = {
  entries: [],
  issues: [],
  visitedNodes: new Map<number, number>(),
  trace: [],
  simulatedSeconds: 0,
  truncated: false,
} as const;

/** Stable empty list: a fresh array per render would restart the node effect. */
const NO_TRIGGER_TARGETS: readonly InteractionTriggerTargetEntity[] = [];

function InteractivityGraphEditorBody({
  asset,
  materials,
  triggerTargets = NO_TRIGGER_TARGETS,
  readOnly,
  onSave,
  onClose,
}: {
  asset: InteractivityAsset;
  materials: readonly MaterialAsset[];
  triggerTargets?: readonly InteractionTriggerTargetEntity[];
  readOnly: boolean;
  onSave: (assetId: string, extension: KhrInteractivityExtension) => void;
  onClose: () => void;
}) {
  // The draft is kept as a history rather than as one value: a graph editor
  // without undo makes every experiment a risk, and the Scene's own history is
  // a different document with a different lifetime.
  const [history, setHistory] = useState<GraphDraftHistory>(() => ({
    entries: [cloneKhrInteractivityExtension(asset.extension)],
    index: 0,
  }));
  const draft = history.entries[history.index] ?? asset.extension;
  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;
  const [graphIndex, setGraphIndex] = useState(asset.extension.graph ?? 0);
  const [expanded, setExpanded] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineEntry, setTimelineEntry] = useState<"start" | "interact">("start");
  const [timelineHorizon, setTimelineHorizon] = useState(120);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [inspectorWidth, setInspectorWidth] = useState(288);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [graphMenuOpen, setGraphMenuOpen] = useState(false);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(asset.extension, null, 2));
  const [jsonMessage, setJsonMessage] = useState<string | null>(null);
  const graph = draft.graphs[graphIndex] ?? draft.graphs[0];
  const graphCount = draft.graphs.length;
  useEffect(() => {
    if (graphIndex < graphCount) return;
    setGraphIndex(Math.max(0, graphCount - 1));
  }, [graphCount, graphIndex]);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  /**
   * The graph run forward, while the timeline is open.
   *
   * Computed here rather than inside the timeline because the canvas needs the
   * same answer: a node that never ran is the first thing an author wants to
   * see when a graph does nothing, and it has to be marked on the node itself.
   */
  const timelineRun = useMemo(
    () =>
      timelineOpen
        ? dryRunInteractivityGraph(draft, {
            graphIndex,
            entry: timelineEntry,
            horizonSeconds: timelineHorizon,
          })
        : null,
    [draft, graphIndex, timelineEntry, timelineHorizon, timelineOpen],
  );
  const edges = useMemo(
    () =>
      toFlowEdges(graph, {
        selectedNodeIndex,
        visited: timelineRun?.visitedNodes ?? null,
      }),
    [graph, selectedNodeIndex, timelineRun],
  );
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(asset.extension),
    [asset.extension, draft],
  );
  // Schema validation and Play-runtime support are separate questions about the
  // same graph, so they are collected separately and shown in one list: a graph
  // can be perfectly valid KHR JSON and still do nothing when Play runs it.
  const diagnostics = useMemo(
    () => [
      ...validateKhrInteractivityExtension(draft),
      ...collectInteractivityRuntimeDiagnostics(draft),
    ],
    [draft],
  );
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const selectedNode =
    selectedNodeIndex === null ? undefined : graph.nodes?.[selectedNodeIndex];
  const selectedDeclaration = selectedNode
    ? graph.declarations?.[selectedNode.declaration]
    : undefined;
  const sortedMaterials = useMemo(
    () => [...materials].sort((left, right) => left.id.localeCompare(right.id)),
    [materials],
  );
  // Recipes are static, so this is computed once rather than per render.
  const recipeRuntimeSupport = useMemo(
    () =>
      new Map(
        INTERACTIVITY_RECIPES.map((recipe) => [
          recipe.id,
          getInteractivityRecipeRuntimeSupport(recipe),
        ]),
      ),
    [],
  );
  const selectedPointer = selectedNode?.configuration?.pointer?.value?.[0];
  const selectedPointerPreset = KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.find(
    (preset) => preset.pointer === selectedPointer,
  );
  const configuredMaterialIndex = selectedNode?.values?.material?.value?.[0];
  const selectedMaterialIndex =
    typeof configuredMaterialIndex === "number" &&
    Number.isInteger(configuredMaterialIndex) &&
    configuredMaterialIndex >= 0 &&
    configuredMaterialIndex < sortedMaterials.length
      ? configuredMaterialIndex
      : 0;
  const materialPointerNode = selectedDeclaration?.op.startsWith("pointer/") ?? false;
  const triggerActionNode = isTriggerActionOp(selectedDeclaration?.op);
  const triggerAction =
    triggerActionNode && selectedNodeIndex !== null
      ? readInteractivityTriggerAction(graph, selectedNodeIndex)
      : null;
  const triggerEntity = triggerAction
    ? findInteractionTriggerTarget(triggerTargets, triggerAction.entityId)
    : undefined;
  const triggerComponent = triggerAction
    ? findInteractionTriggerTargetComponent(
        triggerTargets,
        triggerAction.entityId,
        triggerAction.componentId,
      )
    : undefined;
  const triggerDescriptor = triggerAction
    ? getXriftInteractionProperty(triggerAction.targetKind, triggerAction.property)
    : undefined;
  const triggerToggleNode =
    selectedDeclaration?.op === XRIFT_INTERACTION_OPERATIONS.toggleProperty;
  const triggerDuration =
    triggerActionNode && selectedNodeIndex !== null
      ? readInteractivityTriggerActionDuration(graph, selectedNodeIndex)
      : 0;
  const triggerEasing =
    triggerActionNode && selectedNodeIndex !== null
      ? readInteractivityTriggerActionEasing(graph, selectedNodeIndex)
      : "linear";


  // `material` is authored through the picker above, and a socket fed by a wire
  // has no literal to edit - showing either as a number field would invite the
  // author to overwrite a connection they cannot see from here.
  const literalValues = useMemo(
    () =>
      Object.entries(selectedNode?.values ?? {})
        .filter(
          ([socket, input]) =>
            input.node === undefined &&
            socket !== "material" &&
            // An Interaction Trigger value and its timing are edited by the
            // pickers below, which know the property's range, options, colour
            // space, and whether a duration means anything for it.
            !(
              (socket === "value" || socket === "duration") &&
              isTriggerActionOp(selectedDeclaration?.op)
            ),
        )
        .map(([socket, input]) => ({
          socket,
          value: input.value,
          signature:
            input.type === undefined ? undefined : graph.types?.[input.type]?.signature,
        })),
    [graph.types, selectedDeclaration?.op, selectedNode],
  );

  const paletteGroups = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return PALETTE_CATEGORY_ORDER.map((category) => ({
      category,
      templates: KHR_INTERACTIVITY_OPERATION_TEMPLATES.filter(
        (template) =>
          template.category === category &&
          (query === "" ||
            template.label.toLowerCase().includes(query) ||
            template.op.toLowerCase().includes(query)),
      ),
    })).filter((group) => group.templates.length > 0);
  }, [paletteQuery]);

  const visibleRecipes = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (query === "") return INTERACTIVITY_RECIPES;
    return INTERACTIVITY_RECIPES.filter(
      (recipe) =>
        recipe.label.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query),
    );
  }, [paletteQuery]);

  // Selection is derived from the inspector's index rather than left to the
  // canvas: rebuilding the nodes on every graph change wiped the library's own
  // selection flag, so editing a value made the ring around the node you were
  // editing disappear.
  useEffect(() => {
    setFlowNodes(
      toFlowNodes(graph, triggerTargets, timelineRun?.visitedNodes ?? null).map(
        (node) => ({
          ...node,
          selected: node.data.index === selectedNodeIndex,
        }),
      ),
    );
  }, [
    graph,
    selectedNodeIndex,
    setFlowNodes,
    timelineRun,
    triggerTargets,
  ]);

  // Edges are canvas state as well as document state: without it the library
  // never marks one selected, and a connection could be drawn but not cut.
  useEffect(() => {
    setFlowEdges(edges);
  }, [edges, setFlowEdges]);


  const commitDraft = useCallback((next: KhrInteractivityExtension) => {
    setHistory((current) => {
      const entries = [
        ...current.entries.slice(0, current.index + 1),
        next,
      ].slice(-GRAPH_HISTORY_LIMIT);
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const updateGraph = useCallback(
    (mutate: (graph: KhrInteractivityGraph) => void) => {
      setHistory((current) => {
        const base = current.entries[current.index];
        if (!base) return current;
        const next = cloneKhrInteractivityExtension(base);
        const target = next.graphs[graphIndex] ?? next.graphs[0];
        if (!target) return current;
        mutate(target);
        const entries = [
          ...current.entries.slice(0, current.index + 1),
          next,
        ].slice(-GRAPH_HISTORY_LIMIT);
        return { entries, index: entries.length - 1 };
      });
    },
    [graphIndex],
  );

  /**
   * Edits the Asset itself rather than one graph inside it.
   *
   * Adding, copying and removing a graph all change the list and the default
   * index, which `updateGraph` cannot reach.
   */
  const updateExtension = useCallback(
    (mutate: (extension: KhrInteractivityExtension) => void) => {
      setHistory((current) => {
        const base = current.entries[current.index];
        if (!base) return current;
        const next = cloneKhrInteractivityExtension(base);
        mutate(next);
        const entries = [
          ...current.entries.slice(0, current.index + 1),
          next,
        ].slice(-GRAPH_HISTORY_LIMIT);
        return { entries, index: entries.length - 1 };
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((current) =>
      current.index > 0 ? { ...current, index: current.index - 1 } : current,
    );
    setSelectedNodeIndex(null);
  }, []);

  const redo = useCallback(() => {
    setHistory((current) =>
      current.index < current.entries.length - 1
        ? { ...current, index: current.index + 1 }
        : current,
    );
    setSelectedNodeIndex(null);
  }, []);

  const handleDuplicateNode = useCallback(() => {
    if (readOnly || selectedNodeIndex === null) return;
    const source = graph.nodes?.[selectedNodeIndex];
    if (!source) return;
    const created = graph.nodes?.length ?? 0;
    const anchor = readInteractivityNodePosition(source, selectedNodeIndex);
    updateGraph((nextGraph) => {
      const original = nextGraph.nodes?.[selectedNodeIndex];
      if (!original) return;
      // Values and configuration come along; connections do not. A copy that
      // arrived already wired would put two writers on one socket.
      const copy = JSON.parse(JSON.stringify(original)) as KhrInteractivityNode;
      delete copy.flows;
      if (copy.values) {
        copy.values = Object.fromEntries(
          Object.entries(copy.values).filter(([, input]) => input.node === undefined),
        );
        if (Object.keys(copy.values).length === 0) delete copy.values;
      }
      nextGraph.nodes ??= [];
      nextGraph.nodes.push(
        writeInteractivityNodePosition(
          copy,
          freePositionNear(nextGraph, { x: anchor.x, y: anchor.y + 48 }),
        ),
      );
    });
    setSelectedNodeIndex(created);
  }, [graph.nodes, readOnly, selectedNodeIndex, updateGraph]);

  const handleAutoLayout = useCallback(() => {
    if (readOnly) return;
    updateGraph((nextGraph) => autoLayoutInteractivityGraph(nextGraph));
    window.setTimeout(() => fitView({ padding: 0.25, duration: 250 }), 0);
  }, [fitView, readOnly, updateGraph]);


  const requestClose = useCallback(() => {
    if (dirty && !readOnly) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose, readOnly]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicateNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key !== "Escape") return;
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false);
        return;
      }
      if (graphMenuOpen) {
        setGraphMenuOpen(false);
        return;
      }
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeConfirmOpen,
    graphMenuOpen,
    handleDuplicateNode,
    paletteOpen,
    redo,
    requestClose,
    undo,
  ]);

  /**
   * Where the next node lands.
   *
   * The old fixed grid put node twelve at a coordinate the author had probably
   * panned away from minutes earlier, so adding a node looked like nothing had
   * happened. Placing it at the centre of the visible canvas, with a small
   * cascade so repeats do not stack, means the author sees what they added.
   */
  const nextNodePosition = useCallback(
    (count: number, leadIn = 0) => {
      // Adding a node while one is selected means "and then this", so the new
      // node lands to the right of it instead of on top of whatever is at the
      // centre of the view. A cascade alone never cleared a node's own width.
      const anchor =
        selectedNodeIndex === null
          ? undefined
          : graph.nodes?.[selectedNodeIndex]
            ? readInteractivityNodePosition(
                graph.nodes[selectedNodeIndex]!,
                selectedNodeIndex,
              )
            : undefined;
      if (anchor && leadIn === 0) {
        return freePositionNear(graph, {
          x: anchor.x + NODE_CARD_WIDTH + 64,
          y: anchor.y,
        });
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 160, y: 160 };
      const cascade = (count % 5) * 56;
      return freePositionNear(graph, {
        x: center.x - NODE_CARD_WIDTH / 2 - leadIn + cascade,
        y: center.y - 60 + cascade,
      });
    },
    [graph.nodes, screenToFlowPosition, selectedNodeIndex],
  );

  /**
   * Applies a target choice, keeping the property valid for the new target.
   *
   * Switching from an Audio Source to a Light must not leave `volume` behind:
   * the runtime would drop the action and the node would look configured.
   */
  const applyTriggerTarget = useCallback(
    (next: {
      entityId: string;
      componentId: string;
      targetKind: XriftInteractionTargetKind;
      property: string;
    }) => {
      if (readOnly || selectedNodeIndex === null) return;
      updateGraph((nextGraph) => {
        configureInteractivityTriggerAction(nextGraph, selectedNodeIndex, next);
      });
    },
    [readOnly, selectedNodeIndex, updateGraph],
  );

  const applyTriggerValue = useCallback(
    (
      descriptor: XriftInteractionPropertyDescriptor,
      value: KhrInteractivityJsonValue[],
    ) => {
      if (readOnly || selectedNodeIndex === null) return;
      updateGraph((nextGraph) => {
        setInteractivityTriggerActionValue(
          nextGraph,
          selectedNodeIndex,
          descriptor,
          value,
        );
      });
    },
    [readOnly, selectedNodeIndex, updateGraph],
  );

  /**
   * Whether a wire can land where it is being dragged.
   *
   * Without this the canvas happily draws a flow output into a value input and
   * then nothing happens, because the document has no way to say that. Refusing
   * it during the drag is the difference between "this cannot connect" and "the
   * editor ignored me".
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (connection.source === connection.target) return false;
      const source = parseHandle(connection.sourceHandle);
      const target = parseHandle(connection.targetHandle);
      if (!source || !target) return false;
      return (
        (source[0] === "flow-out" && target[0] === "flow-in") ||
        (source[0] === "value-out" && target[0] === "value-in")
      );
    },
    [],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || connection.source === connection.target) return;
      updateGraph((nextGraph) => applyConnectionToGraph(nextGraph, connection));
    },
    [readOnly, updateGraph],
  );

  /**
   * Moves an existing wire to a new socket.
   *
   * The canvas already let an author grab an edge end; without this the grab
   * simply snapped back, which reads as the editor refusing an edit rather than
   * as a missing handler.
   */
  const handleReconnect = useCallback(
    (previous: Edge, connection: Connection) => {
      if (readOnly) return;
      updateGraph((nextGraph) => {
        removeConnectionFromGraph(nextGraph, previous);
        applyConnectionToGraph(nextGraph, connection);
      });
    },
    [readOnly, updateGraph],
  );

  /**
   * Deletes a selection of nodes and wires in one document edit.
   *
   * Nodes and edges are removed together rather than through separate handlers:
   * removing a node renumbers the rest, so an edge deletion applied afterwards
   * would address the wrong connection.
   */
  const handleDeleteElements = useCallback(
    ({ nodes: removedNodes, edges: removedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (readOnly) return;
      const removedIndices = removedNodes
        .map((node) => Number(node.id))
        .filter((index) => Number.isInteger(index));
      if (removedIndices.length === 0 && removedEdges.length === 0) return;
      const dropped = new Set(removedIndices);
      updateGraph((nextGraph) => {
        for (const edge of removedEdges) {
          // A wire attached to a node that is going away is handled by the
          // renumbering below; deleting it by index first would be redundant.
          if (dropped.has(Number(edge.source)) || dropped.has(Number(edge.target))) {
            continue;
          }
          removeConnectionFromGraph(nextGraph, edge);
        }
        if (removedIndices.length > 0) {
          removeNodesAndReindex(nextGraph, removedIndices);
        }
      });
      if (removedIndices.length > 0) setSelectedNodeIndex(null);
    },
    [readOnly, updateGraph],
  );

  // An append always lands on the current length, so the node to select is known
  // before the draft updates and no state is set from inside the updater.
  const handleAddOperation = (op: string) => {
    if (readOnly) return;
    const created = graph.nodes?.length ?? 0;
    const position = nextNodePosition(created);
    updateGraph((nextGraph) => {
      appendInteractivityOperation(nextGraph, op, position);
    });
    setSelectedNodeIndex(created);
    setPaletteOpen(false);
  };

  const handleApplyRecipe = (recipe: InteractivityRecipe) => {
    if (readOnly) return;
    const base = graph.nodes?.length ?? 0;
    const origin = nextNodePosition(base, 160);
    updateGraph((nextGraph) => {
      recipe.build(nextGraph, origin, selectedMaterialIndex);
    });
    setSelectedNodeIndex(base + recipe.focusOffset);
    setPaletteOpen(false);
  };

  const handleApplyJson = () => {
    try {
      const parsed = parseKhrInteractivityExtension(JSON.parse(jsonDraft));
      if (!parsed) {
        setJsonMessage("公式スキーマ互換性エラーがあります。下の診断を確認してください");
        return;
      }
      commitDraft(parsed);
      setGraphIndex(parsed.graph ?? 0);
      setSelectedNodeIndex(null);
      setJsonMessage("KHR_interactivity JSONを読み込みました");
    } catch (error) {
      setJsonMessage(error instanceof Error ? error.message : "JSONを解析できませんでした");
    }
  };

  const handleCopyJson = async () => {
    const json = JSON.stringify(draft, null, 2);
    setJsonDraft(json);
    setJsonOpen(true);
    try {
      await navigator.clipboard.writeText(json);
      setJsonMessage("KHR_interactivity JSONをコピーしました");
    } catch {
      setJsonMessage("JSON欄を表示しました。手動でコピーできます");
    }
  };

  const CloseIcon = EDITOR_ICONS.close;
  const CreateIcon = EDITOR_ICONS.create;
  const DeleteIcon = EDITOR_ICONS.delete;
  const SaveIcon = EDITOR_ICONS.save;

  return (
    <section
      className={`absolute z-[75] flex min-h-0 overflow-hidden rounded-xl border border-slate-600 bg-slate-950/95 text-white shadow-2xl backdrop-blur ${
        expanded
          ? "bottom-3 left-3 right-3 top-14"
          : "bottom-6 left-[clamp(260px,26vw,440px)] right-6 top-20"
      }`}
      aria-label="KHR_interactivity graph editor"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-700 bg-slate-900 px-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold" title={asset.name}>
              {asset.name}
            </h2>
            <p className="truncate text-[10px] text-slate-400">
              Scene Viewを確認しながら編集・glTF準拠JSONを再利用
            </p>
          </div>
          <div className="relative shrink-0">
            <div className="flex items-center gap-1">
              <select
                value={graphIndex}
                onChange={(event) => {
                  setGraphIndex(Number(event.target.value));
                  setSelectedNodeIndex(null);
                }}
                className="h-8 shrink-0 rounded border border-slate-600 bg-slate-800 px-2 text-xs"
                aria-label="Behavior graph"
              >
                {draft.graphs.map((candidate, index) => (
                  <option key={index} value={index}>
                    {candidate.name || `Graph ${index + 1}`}
                    {(draft.graph ?? 0) === index ? "（既定）" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setGraphMenuOpen((open) => !open)}
                aria-expanded={graphMenuOpen}
                disabled={readOnly}
                title="グラフの追加・複製・削除"
                className="h-8 shrink-0 rounded border border-slate-600 px-2 text-xs hover:bg-slate-800 disabled:opacity-40"
              >
                グラフ
              </button>
            </div>
            {graphMenuOpen ? (
              <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-lg border border-slate-700 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur">
                <label className="block text-[10px] text-slate-300">
                  名前
                  <input
                    type="text"
                    value={graph.name ?? ""}
                    disabled={readOnly}
                    onChange={(event) => {
                      const name = event.target.value;
                      updateExtension((extension) => {
                        renameInteractivityGraph(extension, graphIndex, name);
                      });
                    }}
                    placeholder={`Graph ${graphIndex + 1}`}
                    className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-900 px-2 text-xs"
                  />
                </label>
                <p className="text-[10px] leading-4 text-slate-400">
                  Assetの中のすべてのグラフが動きます。「イベントを送る」と「イベントを受け取る」でグラフ同士をつなげます。
                </p>
                <button
                  type="button"
                  disabled={readOnly || draft.graphs.length >= 64}
                  onClick={() => {
                    const created = draft.graphs.length;
                    updateExtension((extension) => {
                      addInteractivityGraph(
                        extension,
                        `Graph ${extension.graphs.length + 1}`,
                      );
                    });
                    setGraphIndex(created);
                    setSelectedNodeIndex(null);
                    setGraphMenuOpen(false);
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-left text-xs hover:border-violet-500 hover:bg-slate-800 disabled:opacity-40"
                >
                  グラフを追加
                </button>
                <button
                  type="button"
                  disabled={readOnly || draft.graphs.length >= 64}
                  onClick={() => {
                    const created = draft.graphs.length;
                    updateExtension((extension) => {
                      duplicateInteractivityGraph(extension, graphIndex);
                    });
                    setGraphIndex(created);
                    setSelectedNodeIndex(null);
                    setGraphMenuOpen(false);
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-left text-xs hover:border-violet-500 hover:bg-slate-800 disabled:opacity-40"
                >
                  このグラフを複製
                </button>
                <button
                  type="button"
                  disabled={readOnly || (draft.graph ?? 0) === graphIndex}
                  onClick={() => {
                    updateExtension((extension) => {
                      extension.graph = graphIndex;
                    });
                    setGraphMenuOpen(false);
                  }}
                  title="Modelへ埋め込んだ場合や、1つだけを走らせる書き出しで使われるグラフです"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-left text-xs hover:border-violet-500 hover:bg-slate-800 disabled:opacity-40"
                >
                  既定のグラフにする
                </button>
                <button
                  type="button"
                  disabled={readOnly || draft.graphs.length <= 1}
                  onClick={() => {
                    const removed = graphIndex;
                    updateExtension((extension) => {
                      removeInteractivityGraph(extension, removed);
                    });
                    setGraphIndex(Math.max(0, removed - 1));
                    setSelectedNodeIndex(null);
                    setGraphMenuOpen(false);
                  }}
                  className="w-full rounded border border-rose-800 px-2 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-40"
                >
                  このグラフを削除
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setPaletteOpen((open) => {
                // A search left over from the last node makes the palette look
                // empty the next time it opens.
                if (!open) setPaletteQuery("");
                return !open;
              });
            }}
            disabled={readOnly}
            aria-expanded={paletteOpen}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded px-3 text-xs font-semibold disabled:opacity-40 ${
              paletteOpen ? "bg-violet-500" : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            <CreateIcon size={13} aria-hidden="true" /> 追加
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={readOnly || !canUndo}
              title="元に戻す (Ctrl+Z)"
              className="h-8 rounded border border-slate-600 px-2 text-xs hover:bg-slate-800 disabled:opacity-35"
            >
              元に戻す
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={readOnly || !canRedo}
              title="やり直す (Ctrl+Shift+Z)"
              className="h-8 rounded border border-slate-600 px-2 text-xs hover:bg-slate-800 disabled:opacity-35"
            >
              やり直す
            </button>
          </div>
          <button
            type="button"
            onClick={handleAutoLayout}
            disabled={readOnly}
            title="流れの順に、左から右へ並べ直します"
            className="h-8 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800 disabled:opacity-40"
          >
            整列
          </button>
          <button
            type="button"
            onClick={() => fitView({ padding: 0.25, duration: 200 })}
            className="h-8 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            全体表示
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelineOpen((current) => {
                if (!current) setTimelineEntry(preferredTimelineEntry(graph));
                return !current;
              });
            }}
            aria-pressed={timelineOpen}
            title="開始からの時間で、何が起きるかを並べます"
            className={`h-8 shrink-0 rounded border px-3 text-xs ${
              timelineOpen
                ? "border-violet-400 bg-violet-500/20 text-violet-100"
                : "border-slate-600 hover:bg-slate-800"
            }`}
          >
            タイムライン
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-pressed={expanded}
            title={expanded ? "元の大きさに戻す" : "画面いっぱいに広げる"}
            className="h-8 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            {expanded ? "縮小" : "拡大"}
          </button>
          <button
            type="button"
            onClick={handleCopyJson}
            className="h-8 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => onSave(asset.id, draft)}
            disabled={readOnly || errors.length > 0}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-500 disabled:opacity-40"
          >
            <SaveIcon size={13} aria-hidden="true" /> 保存
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="shrink-0 rounded p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Interactivity editorを閉じる"
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </header>

        <div ref={canvasRef} className="relative min-h-0 flex-1 bg-slate-900">
          <ReactFlow<GraphFlowNode>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => setSelectedNodeIndex(node.data.index)}
            onPaneClick={() => {
              setSelectedNodeIndex(null);
              setPaletteOpen(false);
            }}
            onNodeDragStop={(_, node) =>
              updateGraph((nextGraph) => {
                const target = nextGraph.nodes?.[node.data.index];
                if (target) {
                  nextGraph.nodes![node.data.index] = writeInteractivityNodePosition(
                    target,
                    node.position,
                  );
                }
              })
            }
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onReconnect={handleReconnect}
            onDelete={handleDeleteElements}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            deleteKeyCode={readOnly ? null : DELETE_KEY_CODES}
            selectionKeyCode="Shift"
            snapToGrid
            snapGrid={CANVAS_GRID}
            isValidConnection={isValidConnection}
            {...CANVAS_NAVIGATION}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            colorMode="dark"
          >
            <Background color="#475569" gap={24} size={1} />
            <Controls position="bottom-left" />
            <MiniMap<GraphFlowNode>
              pannable
              zoomable
              position="bottom-right"
              maskColor="rgba(2, 6, 23, 0.7)"
              nodeColor={(node) => CATEGORY_MINIMAP_COLOR[node.data.category]}
            />
          </ReactFlow>

          {paletteOpen ? (
            <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col rounded-lg border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur">
              <div className="shrink-0 border-b border-slate-700 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold">ノードを追加</p>
                  <button
                    type="button"
                    onClick={() => setPaletteOpen(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    aria-label="追加パネルを閉じる"
                  >
                    <CloseIcon size={13} aria-hidden="true" />
                  </button>
                </div>
                <input
                  type="search"
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  placeholder="色・アニメーション・待機"
                  className="h-8 w-full rounded border border-slate-600 bg-slate-900 px-2 text-xs placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                  aria-label="ノードを検索"
                />
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-2.5">
                {visibleRecipes.length > 0 ? (
                  <section className="mb-3">
                    <p className="sticky top-0 z-10 mb-1.5 bg-slate-950/95 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      よくある動き
                    </p>
                    <div className="space-y-1">
                      {visibleRecipes.map((recipe) => {
                        const blocked = recipe.needsMaterial === true && sortedMaterials.length === 0;
                        // A recipe stays usable when Play cannot run it: the
                        // graph is still saved and published. Saying so here
                        // keeps the author from learning it only after Play.
                        const playable = recipeRuntimeSupport.get(recipe.id) !== "ignored";
                        return (
                          <button
                            key={recipe.id}
                            type="button"
                            disabled={readOnly || blocked}
                            onClick={() => handleApplyRecipe(recipe)}
                            className="block w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-left hover:border-violet-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-700 disabled:hover:bg-slate-900"
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-xs font-semibold">{recipe.label}</span>
                              {playable ? null : (
                                <span className="shrink-0 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold text-amber-200">
                                  Play未対応
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">
                              {blocked
                                ? "Material Assetを1つ作るとこのレシピを使えます"
                                : recipe.description}
                            </span>
                            {!blocked && !playable ? (
                              <span className="mt-1 block text-[10px] leading-4 text-amber-200/80">
                                置いて保存はできますが、Play と公開先ではまだ動きません
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                {paletteGroups.map((group) => (
                  <section key={group.category} className="mb-3 last:mb-0">
                    <p className="sticky top-0 z-10 mb-1.5 bg-slate-950/95 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {CATEGORY_LABEL[group.category]}
                    </p>
                    <div className="space-y-1">
                      {group.templates.map((template) => (
                        <button
                          key={template.op}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleAddOperation(template.op)}
                          className="flex w-full items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-left hover:border-violet-500 hover:bg-slate-800 disabled:opacity-45"
                        >
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: CATEGORY_MINIMAP_COLOR[template.category] }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {template.label}
                            </span>
                            <code className="block truncate text-[9px] text-slate-500">
                              {template.op}
                            </code>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                {visibleRecipes.length === 0 && paletteGroups.length === 0 ? (
                  <p className="rounded border border-slate-700 bg-slate-900 p-3 text-[11px] leading-5 text-slate-400">
                    一致するノードがありません。検索語を短くしてください。
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {timelineOpen ? (
          <>
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="タイムラインの高さ"
              onPointerDown={(event) => {
                event.preventDefault();
                const startY = event.clientY;
                const startHeight = timelineHeight;
                const move = (moveEvent: PointerEvent) => {
                  const next = startHeight + (startY - moveEvent.clientY);
                  setTimelineHeight(Math.min(460, Math.max(120, next)));
                };
                const end = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", end);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", end);
              }}
              className="h-1 shrink-0 cursor-row-resize bg-slate-700 hover:bg-violet-500"
            />
            <div style={{ height: timelineHeight }} className="flex min-h-0 shrink-0">
              <InteractivityTimeline
                run={timelineRun ?? EMPTY_DRY_RUN}
                entryPoint={timelineEntry}
                horizonSeconds={timelineHorizon}
                playheadSeconds={playheadSeconds}
                triggerTargets={triggerTargets}
                selectedNodeIndex={selectedNodeIndex}
                onEntryPointChange={setTimelineEntry}
                onHorizonChange={(seconds) => {
                  setTimelineHorizon(seconds);
                  setPlayheadSeconds((current) => Math.min(current, seconds));
                }}
                onPlayheadChange={setPlayheadSeconds}
                onSelectNode={setSelectedNodeIndex}
              />
            </div>
          </>
        ) : null}

        <footer className="flex min-h-8 shrink-0 items-center gap-3 border-t border-slate-700 bg-slate-900 px-3 text-[10px] text-slate-400">
          {/* Spec provenance belongs here, not in the header: it never changes
              and the header needs its width for the actions. */}
          <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 font-semibold text-emerald-300">
            KHR_interactivity RC
          </span>
          <span>{graph.nodes?.length ?? 0} nodes</span>
          <span>{edges.length} connections</span>
          {errors.length > 0 ? (
            <span className="font-semibold text-rose-300">{errors.length} errors・保存不可</span>
          ) : warnings.length > 0 ? (
            <span className="text-amber-300">{warnings.length} warnings</span>
          ) : (
            <span className="text-emerald-300">KHR graph validation OK</span>
          )}
          {dirty ? <span className="text-slate-300">未保存の変更があります</span> : null}
          <span className="ml-auto">
            ドラッグ / ホイールで移動・Ctrl+ホイールで拡大・線を選んでDeleteで切断
          </span>
          <span>紫: flow / 水色: value</span>
        </footer>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Node Inspectorの幅"
        onPointerDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = inspectorWidth;
          const move = (moveEvent: PointerEvent) => {
            const next = startWidth + (startX - moveEvent.clientX);
            setInspectorWidth(
              Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, next)),
            );
          };
          const end = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
        }}
        className="w-1 shrink-0 cursor-col-resize bg-slate-700 hover:bg-violet-500"
      />

      <aside
        style={{ width: inspectorWidth }}
        className="flex shrink-0 flex-col border-l border-slate-700 bg-slate-900"
      >
        <div className="border-b border-slate-700 px-3 py-2">
          <p className="text-xs font-bold">Node Inspector</p>
          <p className="text-[10px] text-slate-400">
            {selectedDeclaration?.op ?? "ノードを選択してください"}
          </p>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {selectedNode && selectedNodeIndex !== null ? (
            <div className="space-y-3">
              {triggerActionNode && triggerAction ? (
                <section className="space-y-2 rounded border border-orange-800 bg-orange-950/30 p-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                      対象
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">
                      インタラクトされたときに書き込むEntityとプロパティを選びます。
                    </p>
                  </div>
                  {triggerTargets.length === 0 ? (
                    <p className="rounded border border-slate-700 bg-slate-950 p-2 text-[10px] leading-4 text-slate-400">
                      Sceneを開いた状態でこのグラフを編集すると、対象のEntityを選べます。
                    </p>
                  ) : (
                    <>
                      <label className="block text-[10px] text-slate-300">
                        Entity
                        <select
                          value={triggerAction.entityId}
                          disabled={readOnly}
                          onChange={(event) => {
                            const entity = findInteractionTriggerTarget(
                              triggerTargets,
                              event.target.value,
                            );
                            const first = entity?.components[0];
                            if (!entity || !first?.properties[0]) return;
                            applyTriggerTarget({
                              entityId: entity.entityId,
                              componentId: first.componentId,
                              targetKind: first.targetKind,
                              property: first.properties[0].name,
                            });
                          }}
                          className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
                        >
                          {triggerEntity ? null : (
                            <option value={triggerAction.entityId}>
                              {triggerAction.entityId
                                ? "見つからないEntity"
                                : "Entityを選択"}
                            </option>
                          )}
                          {triggerTargets.map((target) => (
                            <option key={target.entityId} value={target.entityId}>
                              {target.path}
                            </option>
                          ))}
                        </select>
                      </label>
                      {triggerEntity ? (
                        <label className="block text-[10px] text-slate-300">
                          Component
                          <select
                            value={triggerAction.componentId}
                            disabled={readOnly}
                            onChange={(event) => {
                              const component = triggerEntity.components.find(
                                (candidate) =>
                                  candidate.componentId === event.target.value,
                              );
                              if (!component?.properties[0]) return;
                              applyTriggerTarget({
                                entityId: triggerEntity.entityId,
                                componentId: component.componentId,
                                targetKind: component.targetKind,
                                property: component.properties[0].name,
                              });
                            }}
                            className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
                          >
                            {triggerComponent ? null : (
                              <option value={triggerAction.componentId}>
                                見つからないComponent
                              </option>
                            )}
                            {triggerEntity.components.map((component) => (
                              <option
                                key={component.componentId || "entity"}
                                value={component.componentId}
                              >
                                {component.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="rounded border border-amber-800 bg-amber-950/30 p-2 text-[10px] leading-4 text-amber-200">
                          このEntityはSceneにありません。対象を選び直すまで、この node は動きません。
                        </p>
                      )}
                      {triggerComponent ? (
                        <label className="block text-[10px] text-slate-300">
                          プロパティ
                          <select
                            value={triggerAction.property}
                            disabled={readOnly}
                            onChange={(event) =>
                              applyTriggerTarget({
                                entityId: triggerAction.entityId,
                                componentId: triggerAction.componentId,
                                targetKind: triggerComponent.targetKind,
                                property: event.target.value,
                              })
                            }
                            className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
                          >
                            {triggerComponent.properties
                              // Toggling is only meaningful for an ON/OFF
                              // property, so the picker never offers a
                              // property this node could not act on.
                              .filter(
                                (property) =>
                                  !triggerToggleNode || property.kind === "bool",
                              )
                              .map((property) => (
                                <option key={property.name} value={property.name}>
                                  {property.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                      {triggerDescriptor ? (
                        <p className="text-[10px] leading-4 text-slate-400">
                          {triggerDescriptor.description}
                        </p>
                      ) : null}
                      {triggerDescriptor && !triggerToggleNode ? (
                        <TriggerValueField
                          descriptor={triggerDescriptor}
                          value={triggerAction.value}
                          disabled={readOnly}
                          onChange={(next) =>
                            applyTriggerValue(triggerDescriptor, next)
                          }
                        />
                      ) : null}
                      {triggerDescriptor &&
                      !triggerToggleNode &&
                      TIMED_PROPERTY_KINDS.has(triggerDescriptor.kind) ? (
                        <TriggerTimingField
                          seconds={triggerDuration}
                          easing={triggerEasing}
                          disabled={readOnly}
                          onSecondsChange={(seconds) =>
                            updateGraph((nextGraph) => {
                              setInteractivityTriggerActionDuration(
                                nextGraph,
                                selectedNodeIndex,
                                seconds,
                              );
                            })
                          }
                          onEasingChange={(easing) =>
                            updateGraph((nextGraph) => {
                              setInteractivityTriggerActionEasing(
                                nextGraph,
                                selectedNodeIndex,
                                easing,
                              );
                            })
                          }
                        />
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {materialPointerNode ? (
                <section className="space-y-2 rounded border border-cyan-800 bg-cyan-950/30 p-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                      Material target
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">
                      glTFのMaterial項目を選ぶと、Pointer・型・Material indexをまとめて設定します。
                    </p>
                  </div>
                  <label className="block text-[10px] text-slate-300">
                    Material
                    <select
                      value={selectedMaterialIndex}
                      disabled={readOnly || sortedMaterials.length === 0}
                      onChange={(event) => {
                        if (!selectedPointerPreset) return;
                        updateGraph((nextGraph) => {
                          configureInteractivityMaterialPointer(
                            nextGraph,
                            selectedNodeIndex,
                            selectedPointerPreset.id,
                            Number(event.target.value),
                          );
                        });
                      }}
                      className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
                    >
                      {sortedMaterials.length === 0 ? (
                        <option value={0}>Material Assetなし</option>
                      ) : null}
                      {sortedMaterials.map((material, index) => (
                        <option key={material.id} value={index}>
                          {material.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10px] text-slate-300">
                    設定項目
                    <select
                      value={selectedPointerPreset?.id ?? ""}
                      disabled={readOnly || sortedMaterials.length === 0}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        updateGraph((nextGraph) => {
                          configureInteractivityMaterialPointer(
                            nextGraph,
                            selectedNodeIndex,
                            event.target.value,
                            selectedMaterialIndex,
                          );
                        });
                      }}
                      className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
                    >
                      <option value="">項目を選択</option>
                      {KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedPointerPreset ? (
                    <div className="rounded border border-slate-700 bg-slate-950 p-2 text-[9px] leading-4 text-slate-400">
                      <code className="break-all text-cyan-200">
                        {selectedPointerPreset.pointer}
                      </code>
                      <p>
                        type: {selectedPointerPreset.signature}
                        {selectedPointerPreset.extension
                          ? ` · ${selectedPointerPreset.extension}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {literalValues.length > 0 ? (
                <section className="space-y-2.5 rounded border border-slate-700 bg-slate-950/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    値
                  </p>
                  {literalValues.map((entry) => (
                    <LiteralValueField
                      key={entry.socket}
                      socket={entry.socket}
                      signature={entry.signature}
                      value={entry.value}
                      isColor={entry.socket === "value" && (selectedPointerPreset?.color ?? false)}
                      disabled={readOnly}
                      onChange={(next) =>
                        updateGraph((nextGraph) => {
                          setInteractivityLiteralValue(nextGraph, selectedNodeIndex, entry.socket, next);
                        })
                      }
                    />
                  ))}
                </section>
              ) : null}

              <details className="rounded border border-slate-700 bg-slate-950">
                <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold uppercase text-slate-400">
                  Canonical node
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-800 p-2 text-[10px] leading-4 text-slate-200">
                  <CodeTokens
                    code={JSON.stringify(selectedNode, null, 2)}
                    language="json"
                  />
                </pre>
              </details>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={handleDuplicateNode}
                  title="Ctrl+D"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-600 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  <CreateIcon size={13} aria-hidden="true" /> 複製
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    updateGraph((nextGraph) =>
                      removeNodesAndReindex(nextGraph, [selectedNodeIndex]),
                    );
                    setSelectedNodeIndex(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-rose-700 px-2 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950 disabled:opacity-40"
                >
                  <DeleteIcon size={13} aria-hidden="true" /> 削除
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
              <p>
                「追加」から始めます。よくある動きのレシピを選ぶと、つながった状態のノードがそのまま置かれます。
              </p>
              <p>
                ノードを選ぶと、色や時間などの値をこの欄で直接編集できます。独自JavaScriptは保存しません。
              </p>
            </div>
          )}

          {diagnostics.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Diagnostics</p>
              {diagnostics.map((diagnostic, index) => {
                const target = parseDiagnosticTarget(diagnostic.path);
                const tone =
                  diagnostic.severity === "error"
                    ? "border-rose-800 bg-rose-950/40 text-rose-200"
                    : "border-amber-800 bg-amber-950/30 text-amber-200";
                const body = (
                  <>
                    <code className="block">{diagnostic.path}</code>
                    <p>{diagnostic.message}</p>
                  </>
                );
                if (!target) {
                  return (
                    <div
                      key={`${diagnostic.path}-${index}`}
                      className={`rounded border p-2 text-[10px] leading-4 ${tone}`}
                    >
                      {body}
                    </div>
                  );
                }
                return (
                  <button
                    key={`${diagnostic.path}-${index}`}
                    type="button"
                    onClick={() => {
                      if (target.graphIndex !== graphIndex) {
                        setGraphIndex(target.graphIndex);
                      }
                      setSelectedNodeIndex(target.nodeIndex);
                    }}
                    title="このノードを選択します"
                    className={`block w-full rounded border p-2 text-left text-[10px] leading-4 hover:brightness-125 ${tone}`}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {jsonOpen ? (
          <div className="border-t border-slate-700 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold">KHR JSON import / export</p>
              <button
                type="button"
                onClick={() => setJsonOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="JSON欄を閉じる"
              >
                <CloseIcon size={13} aria-hidden="true" />
              </button>
            </div>
            <textarea
              value={jsonDraft}
              onChange={(event) => setJsonDraft(event.target.value)}
              readOnly={readOnly}
              spellCheck={false}
              className="h-48 w-full resize-none rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[9px] leading-4 text-cyan-100 focus:border-cyan-500 focus:outline-none"
              aria-label="KHR_interactivity JSON"
            />
            {jsonMessage ? <p className="mt-1 text-[10px] text-slate-300">{jsonMessage}</p> : null}
            <button
              type="button"
              disabled={readOnly}
              onClick={handleApplyJson}
              className="mt-2 w-full rounded bg-cyan-700 px-2 py-1.5 text-xs font-semibold hover:bg-cyan-600 disabled:opacity-40"
            >
              JSONを検証して読み込む
            </button>
          </div>
        ) : null}
      </aside>

      {closeConfirmOpen ? (
        <EditorDialog
          onDismiss={() => setCloseConfirmOpen(false)}
          ariaLabelledBy="interactivity-close-dialog-title"
          ariaDescribedBy="interactivity-close-dialog-description"
          backdropClassName="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          surfaceClassName="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          <header
            data-app-modal-header
            className="border-b border-slate-200 px-5 py-4"
          >
            <h2
              id="interactivity-close-dialog-title"
              className="text-sm font-semibold text-slate-900"
            >
              保存せずに閉じますか
            </h2>
          </header>
          <div data-app-modal-body className="px-5 py-4">
            <p
              id="interactivity-close-dialog-description"
              className="text-xs leading-5 text-slate-600"
            >
              このグラフの変更はまだ保存されていません。閉じると編集内容は失われます。
            </p>
          </div>
          <footer
            data-app-modal-footer
            className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"
          >
            <button
              type="button"
              autoFocus
              onClick={() => setCloseConfirmOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              編集に戻る
            </button>
            <button
              type="button"
              onClick={() => {
                setCloseConfirmOpen(false);
                onSave(asset.id, draft);
                onClose();
              }}
              disabled={errors.length > 0}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              保存して閉じる
            </button>
            <button
              type="button"
              onClick={() => {
                setCloseConfirmOpen(false);
                onClose();
              }}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              破棄して閉じる
            </button>
          </footer>
        </EditorDialog>
      ) : null}
    </section>
  );
}
