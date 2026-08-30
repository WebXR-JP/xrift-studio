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
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  linearRgbToTint,
  parseKhrInteractivityExtension,
  readInteractivityNodePosition,
  setInteractivityLiteralValue,
  tintToLinearRgb,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  type InteractivityAsset,
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
const CANVAS_NAVIGATION = {
  panOnScroll: true,
  panOnDrag: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  minZoom: 0.2,
  maxZoom: 2,
} as const;

function InteractivityNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  return (
    <article
      className={`min-w-56 rounded-lg border-2 shadow-lg ${CATEGORY_CLASS[data.category]} ${
        selected ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-900" : ""
      }`}
    >
      <header className="rounded-t-md border-b border-white/10 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">
            {CATEGORY_LABEL[data.category]}
          </p>
          {RUNTIME_SUPPORT_BADGE[data.runtimeSupport] ? (
            <span
              title={RUNTIME_SUPPORT_BADGE[data.runtimeSupport]?.title}
              className={`shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold ${
                RUNTIME_SUPPORT_BADGE[data.runtimeSupport]?.className ?? ""
              }`}
            >
              {RUNTIME_SUPPORT_BADGE[data.runtimeSupport]?.label}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm font-bold">{data.label}</p>
        {data.summary ? (
          <p className="mt-0.5 text-[11px] leading-4 opacity-90">{data.summary}</p>
        ) : null}
        <code className="text-[10px] opacity-60">{data.op}</code>
      </header>
      <div className="relative min-h-16 px-3 py-2 text-[11px]">
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            {data.flowInputs.map((socket) => (
              <p
                key={`flow-in-${socket}`}
                className="h-6 truncate text-left font-semibold text-violet-200"
              >
                {socket}
              </p>
            ))}
            {data.valueInputs.map((socket) => (
              <p key={`value-in-${socket}`} className="h-6 truncate text-left text-cyan-200">
                {socket}
              </p>
            ))}
          </div>
          <div>
            {data.flowOutputs.map((socket) => (
              <p
                key={`flow-out-${socket}`}
                className="h-6 truncate text-right font-semibold text-violet-200"
              >
                {socket}
              </p>
            ))}
            {data.valueOutputs.map((socket) => (
              <p key={`value-out-${socket}`} className="h-6 truncate text-right text-cyan-200">
                {socket}
              </p>
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
  });
}

function operationData(
  graph: KhrInteractivityGraph,
  node: KhrInteractivityNode,
  index: number,
  targets: readonly InteractionTriggerTargetEntity[],
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
    ...(isTriggerActionOp(op)
      ? { summary: triggerActionSummary(graph, index, op, targets) }
      : {}),
  };
}

function toFlowNodes(
  graph: KhrInteractivityGraph,
  targets: readonly InteractionTriggerTargetEntity[],
): GraphFlowNode[] {
  return (graph.nodes ?? []).map((node, index) => ({
    id: String(index),
    type: "interactivity",
    position: readInteractivityNodePosition(node, index),
    data: operationData(graph, node, index, targets),
  }));
}

function toFlowEdges(graph: KhrInteractivityGraph): Edge[] {
  const edges: Edge[] = [];
  for (const [sourceIndex, node] of (graph.nodes ?? []).entries()) {
    for (const [socket, target] of Object.entries(node.flows ?? {})) {
      edges.push({
        id: `flow:${sourceIndex}:${socket}:${target.node}:${target.socket ?? "in"}`,
        source: String(sourceIndex),
        target: String(target.node),
        sourceHandle: `flow-out:${socket}`,
        targetHandle: `flow-in:${target.socket ?? "in"}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: FLOW_SOCKET_COLOR, strokeWidth: 2 },
      });
    }
  }
  for (const [targetIndex, node] of (graph.nodes ?? []).entries()) {
    for (const [socket, input] of Object.entries(node.values ?? {})) {
      if (input.node === undefined) continue;
      edges.push({
        id: `value:${input.node}:${input.socket ?? "value"}:${targetIndex}:${socket}`,
        source: String(input.node),
        target: String(targetIndex),
        sourceHandle: `value-out:${input.socket ?? "value"}`,
        targetHandle: `value-in:${socket}`,
        type: "smoothstep",
        style: { stroke: VALUE_SOCKET_COLOR, strokeWidth: 2 },
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
  const [inspectorWidth, setInspectorWidth] = useState(288);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(asset.extension, null, 2));
  const [jsonMessage, setJsonMessage] = useState<string | null>(null);
  const graph = draft.graphs[graphIndex] ?? draft.graphs[0];
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const edges = useMemo(() => toFlowEdges(graph), [graph]);
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
            // An Interaction Trigger value is edited by the picker below, which
            // knows the property's range, options and colour space.
            !(socket === "value" && isTriggerActionOp(selectedDeclaration?.op)),
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
      toFlowNodes(graph, triggerTargets).map((node) => ({
        ...node,
        selected: node.data.index === selectedNodeIndex,
      })),
    );
  }, [graph, selectedNodeIndex, setFlowNodes, triggerTargets]);

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
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeConfirmOpen, paletteOpen, redo, requestClose, undo]);

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
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 160, y: 160 };
      const cascade = (count % 5) * 28;
      return {
        x: Math.round(center.x - 112 - leadIn + cascade),
        y: Math.round(center.y - 60 + cascade),
      };
    },
    [screenToFlowPosition],
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
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold">{asset.name}</h2>
              <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                KHR_interactivity RC
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Scene Viewを確認しながら編集・glTF準拠JSONを再利用
            </p>
          </div>
          <select
            value={graphIndex}
            onChange={(event) => {
              setGraphIndex(Number(event.target.value));
              setSelectedNodeIndex(null);
            }}
            className="h-8 rounded border border-slate-600 bg-slate-800 px-2 text-xs"
            aria-label="Behavior graph"
          >
            {draft.graphs.map((candidate, index) => (
              <option key={index} value={index}>
                {candidate.name || `Graph ${index + 1}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPaletteOpen((open) => !open)}
            disabled={readOnly}
            aria-expanded={paletteOpen}
            className={`flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold disabled:opacity-40 ${
              paletteOpen ? "bg-violet-500" : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            <CreateIcon size={13} aria-hidden="true" /> 追加
          </button>
          <div className="flex items-center gap-1">
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
            onClick={() => fitView({ padding: 0.25, duration: 200 })}
            className="h-8 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            全体表示
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-pressed={expanded}
            title={expanded ? "元の大きさに戻す" : "画面いっぱいに広げる"}
            className="h-8 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            {expanded ? "縮小" : "拡大"}
          </button>
          <button
            type="button"
            onClick={handleCopyJson}
            className="h-8 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => onSave(asset.id, draft)}
            disabled={readOnly || errors.length > 0}
            className="flex h-8 items-center gap-1.5 rounded bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-500 disabled:opacity-40"
          >
            <SaveIcon size={13} aria-hidden="true" /> 保存
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="rounded p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
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
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            selectionKeyCode="Shift"
            {...CANVAS_NAVIGATION}
            fitView
            fitViewOptions={{ padding: 0.25 }}
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
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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

        <footer className="flex min-h-8 shrink-0 items-center gap-3 border-t border-slate-700 bg-slate-900 px-3 text-[10px] text-slate-400">
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
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  updateGraph((nextGraph) =>
                    removeNodesAndReindex(nextGraph, [selectedNodeIndex]),
                  );
                  setSelectedNodeIndex(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-rose-700 px-2 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950 disabled:opacity-40"
              >
                <DeleteIcon size={13} aria-hidden="true" /> ノードを削除
              </button>
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
              {diagnostics.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.path}-${index}`}
                  className={`rounded border p-2 text-[10px] leading-4 ${
                    diagnostic.severity === "error"
                      ? "border-rose-800 bg-rose-950/40 text-rose-200"
                      : "border-amber-800 bg-amber-950/30 text-amber-200"
                  }`}
                >
                  <code>{diagnostic.path}</code>
                  <p>{diagnostic.message}</p>
                </div>
              ))}
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
