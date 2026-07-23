import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  cloneKhrInteractivityExtension,
  configureInteractivityMaterialPointer,
  getInteractivityOperationTemplate,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  parseKhrInteractivityExtension,
  readInteractivityNodePosition,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  type InteractivityAsset,
  type InteractivityOperationTemplate,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
  type KhrInteractivityNode,
  type MaterialAsset,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

type GraphNodeData = {
  index: number;
  op: string;
  label: string;
  category: InteractivityOperationTemplate["category"] | "extension";
  flowInputs: string[];
  flowOutputs: string[];
  valueInputs: string[];
  valueOutputs: string[];
};

type GraphFlowNode = Node<GraphNodeData, "interactivity">;

const CATEGORY_CLASS: Record<GraphNodeData["category"], string> = {
  event: "border-sky-400 bg-sky-50",
  flow: "border-violet-400 bg-violet-50",
  animation: "border-emerald-400 bg-emerald-50",
  variable: "border-amber-400 bg-amber-50",
  pointer: "border-cyan-400 bg-cyan-50",
  math: "border-slate-400 bg-slate-50",
  extension: "border-fuchsia-400 bg-fuchsia-50",
};

function socketTop(index: number): number {
  return 68 + index * 24;
}

function InteractivityNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  return (
    <article
      className={`min-w-56 rounded-lg border-2 shadow-lg ${CATEGORY_CLASS[data.category]} ${
        selected ? "ring-2 ring-brand-400 ring-offset-2" : ""
      }`}
    >
      <header className="rounded-t-md border-b border-black/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {data.category}
        </p>
        <p className="mt-0.5 text-sm font-bold text-slate-900">{data.label}</p>
        <code className="text-[10px] text-slate-500">{data.op}</code>
      </header>
      <div className="relative min-h-16 px-3 py-2 text-[11px] text-slate-600">
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            {[...data.flowInputs, ...data.valueInputs].map((socket) => (
              <p key={`in-${socket}`} className="h-6 truncate text-left">{socket}</p>
            ))}
          </div>
          <div>
            {[...data.flowOutputs, ...data.valueOutputs].map((socket) => (
              <p key={`out-${socket}`} className="h-6 truncate text-right">{socket}</p>
            ))}
          </div>
        </div>
        {data.flowInputs.map((socket, index) => (
          <Handle
            key={`flow-in-${socket}`}
            id={`flow-in:${socket}`}
            type="target"
            position={Position.Left}
            style={{ top: socketTop(index), width: 10, height: 10, background: "#7c3aed" }}
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
              background: "#0891b2",
            }}
          />
        ))}
        {data.flowOutputs.map((socket, index) => (
          <Handle
            key={`flow-out-${socket}`}
            id={`flow-out:${socket}`}
            type="source"
            position={Position.Right}
            style={{ top: socketTop(index), width: 10, height: 10, background: "#7c3aed" }}
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
              background: "#0891b2",
            }}
          />
        ))}
      </div>
    </article>
  );
}

const nodeTypes = { interactivity: InteractivityNodeCard };

function operationData(
  graph: KhrInteractivityGraph,
  node: KhrInteractivityNode,
  index: number,
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
  };
}

function toFlowNodes(graph: KhrInteractivityGraph): GraphFlowNode[] {
  return (graph.nodes ?? []).map((node, index) => ({
    id: String(index),
    type: "interactivity",
    position: readInteractivityNodePosition(node, index),
    data: operationData(graph, node, index),
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
        style: { stroke: "#7c3aed", strokeWidth: 2 },
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
        style: { stroke: "#0891b2", strokeWidth: 2 },
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

function ensureGraphTypes(graph: KhrInteractivityGraph): Record<string, number> {
  graph.types ??= [];
  const ensure = (signature: string) => {
    const current = graph.types!.findIndex((type) => type.signature === signature);
    if (current >= 0) return current;
    graph.types!.push({ signature });
    return graph.types!.length - 1;
  };
  return { float: ensure("float"), int: ensure("int"), bool: ensure("bool") };
}

function removeNodeAndReindex(
  graph: KhrInteractivityGraph,
  removedIndex: number,
): void {
  graph.nodes = (graph.nodes ?? []).filter((_, index) => index !== removedIndex);
  for (const node of graph.nodes) {
    if (node.flows) {
      node.flows = Object.fromEntries(
        Object.entries(node.flows)
          .filter(([, target]) => target.node !== removedIndex)
          .map(([socket, target]) => [
            socket,
            { ...target, node: target.node > removedIndex ? target.node - 1 : target.node },
          ]),
      );
      if (Object.keys(node.flows).length === 0) delete node.flows;
    }
    if (node.values) {
      node.values = Object.fromEntries(
        Object.entries(node.values)
          .filter(([, input]) => input.node !== removedIndex)
          .map(([socket, input]) => [
            socket,
            input.node !== undefined && input.node > removedIndex
              ? { ...input, node: input.node - 1 }
              : input,
          ]),
      );
      if (Object.keys(node.values).length === 0) delete node.values;
    }
  }
}

export function InteractivityGraphEditor({
  asset,
  materials,
  readOnly,
  onSave,
  onClose,
}: {
  asset: InteractivityAsset;
  materials: readonly MaterialAsset[];
  readOnly: boolean;
  onSave: (assetId: string, extension: KhrInteractivityExtension) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => cloneKhrInteractivityExtension(asset.extension));
  const [graphIndex, setGraphIndex] = useState(asset.extension.graph ?? 0);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [operationToAdd, setOperationToAdd] = useState("animation/start");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(asset.extension, null, 2));
  const [jsonMessage, setJsonMessage] = useState<string | null>(null);
  const graph = draft.graphs[graphIndex] ?? draft.graphs[0];
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const edges = useMemo(() => toFlowEdges(graph), [graph]);
  const diagnostics = useMemo(() => validateKhrInteractivityExtension(draft), [draft]);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const selectedNode =
    selectedNodeIndex === null ? undefined : graph.nodes?.[selectedNodeIndex];
  const selectedDeclaration = selectedNode
    ? graph.declarations?.[selectedNode.declaration]
    : undefined;
  const sortedMaterials = useMemo(
    () => [...materials].sort((left, right) => left.id.localeCompare(right.id)),
    [materials],
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

  useEffect(() => {
    setFlowNodes(toFlowNodes(graph));
  }, [graph, setFlowNodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateGraph = useCallback(
    (mutate: (graph: KhrInteractivityGraph) => void) => {
      setDraft((current) => {
        const next = cloneKhrInteractivityExtension(current);
        const target = next.graphs[graphIndex] ?? next.graphs[0];
        mutate(target);
        return next;
      });
    },
    [graphIndex],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || connection.source === connection.target) return;
      const sourceIndex = Number(connection.source);
      const targetIndex = Number(connection.target);
      const sourceHandle = parseHandle(connection.sourceHandle);
      const targetHandle = parseHandle(connection.targetHandle);
      if (!sourceHandle || !targetHandle) return;
      updateGraph((nextGraph) => {
        const source = nextGraph.nodes?.[sourceIndex];
        const target = nextGraph.nodes?.[targetIndex];
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
      });
    },
    [readOnly, updateGraph],
  );

  const handleDeleteEdges = useCallback(
    (deleted: Edge[]) => {
      if (readOnly) return;
      updateGraph((nextGraph) => {
        for (const edge of deleted) {
          const source = Number(edge.source);
          const target = Number(edge.target);
          const sourceHandle = parseHandle(edge.sourceHandle);
          const targetHandle = parseHandle(edge.targetHandle);
          if (sourceHandle?.[0] === "flow-out") {
            const node = nextGraph.nodes?.[source];
            if (node?.flows) delete node.flows[sourceHandle[1]];
          }
          if (targetHandle?.[0] === "value-in") {
            const node = nextGraph.nodes?.[target];
            if (node?.values) delete node.values[targetHandle[1]];
          }
        }
      });
    },
    [readOnly, updateGraph],
  );

  const handleAddOperation = () => {
    if (readOnly) return;
    updateGraph((nextGraph) => {
      nextGraph.declarations ??= [];
      nextGraph.nodes ??= [];
      let declaration = nextGraph.declarations.findIndex(
        (candidate) => candidate.op === operationToAdd,
      );
      if (declaration < 0) {
        nextGraph.declarations.push({ op: operationToAdd });
        declaration = nextGraph.declarations.length - 1;
      }
      const types = ensureGraphTypes(nextGraph);
      const template = getInteractivityOperationTemplate(operationToAdd);
      const nextNode: KhrInteractivityNode = {
        declaration,
        ...(template?.createNode?.(types) ?? {}),
      };
      nextGraph.nodes.push(
        writeInteractivityNodePosition(nextNode, {
          x: 120 + (nextGraph.nodes.length % 3) * 280,
          y: 120 + Math.floor(nextGraph.nodes.length / 3) * 200,
        }),
      );
      setSelectedNodeIndex(nextGraph.nodes.length - 1);
    });
  };

  const handleApplyJson = () => {
    try {
      const parsed = parseKhrInteractivityExtension(JSON.parse(jsonDraft));
      if (!parsed) {
        setJsonMessage("公式スキーマ互換性エラーがあります。下の診断を確認してください");
        return;
      }
      setDraft(parsed);
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
  const DeleteIcon = EDITOR_ICONS.delete;
  const SaveIcon = EDITOR_ICONS.save;

  return (
    <section
      className="absolute bottom-6 left-[clamp(260px,26vw,440px)] right-6 top-20 z-[75] flex min-h-0 overflow-hidden rounded-xl border border-slate-600 bg-slate-950/95 text-white shadow-2xl backdrop-blur"
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
          <select
            value={operationToAdd}
            onChange={(event) => setOperationToAdd(event.target.value)}
            disabled={readOnly}
            className="h-8 max-w-48 rounded border border-slate-600 bg-slate-800 px-2 text-xs disabled:opacity-50"
            aria-label="追加する公式operation"
          >
            {KHR_INTERACTIVITY_OPERATION_TEMPLATES.map((template) => (
              <option key={template.op} value={template.op}>
                {template.label} · {template.op}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddOperation}
            disabled={readOnly}
            className="h-8 rounded bg-violet-600 px-3 text-xs font-semibold hover:bg-violet-500 disabled:opacity-40"
          >
            ノード追加
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
            onClick={onClose}
            className="rounded p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Interactivity editorを閉じる"
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-slate-900">
          <ReactFlowProvider>
            <ReactFlow<GraphFlowNode>
              nodes={flowNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={(_, node) => setSelectedNodeIndex(node.data.index)}
              onNodeDragStop={(_, node) =>
                updateGraph((nextGraph) => {
                  const target = nextGraph.nodes?.[node.data.index];
                  if (target) nextGraph.nodes![node.data.index] = writeInteractivityNodePosition(target, node.position);
                })
              }
              onConnect={handleConnect}
              onEdgesDelete={handleDeleteEdges}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              edgesReconnectable={!readOnly}
              deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              colorMode="dark"
            >
              <Background color="#475569" gap={24} size={1} />
              <Controls position="bottom-left" />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeColor={(node) =>
                  node.data.category === "animation" ? "#10b981" : "#8b5cf6"
                }
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <footer className="flex min-h-8 shrink-0 items-center gap-3 border-t border-slate-700 bg-slate-900 px-3 text-[10px] text-slate-400">
          <span>{graph.nodes?.length ?? 0} nodes</span>
          <span>{edges.length} connections</span>
          {errors.length > 0 ? (
            <span className="font-semibold text-rose-300">{errors.length} errors・保存不可</span>
          ) : diagnostics.length > 0 ? (
            <span className="text-amber-300">{diagnostics.length} warnings</span>
          ) : (
            <span className="text-emerald-300">KHR graph validation OK</span>
          )}
          <span className="ml-auto">紫: flow / 水色: value</span>
        </footer>
      </div>

      <aside className="flex w-72 shrink-0 flex-col border-l border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 px-3 py-2">
          <p className="text-xs font-bold">Node Inspector</p>
          <p className="text-[10px] text-slate-400">
            {selectedDeclaration?.op ?? "ノードを選択してください"}
          </p>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {selectedNode && selectedNodeIndex !== null ? (
            <div className="space-y-3">
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
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Canonical node</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-slate-950 p-2 text-[10px] leading-4 text-cyan-100">
                  {JSON.stringify(selectedNode, null, 2)}
                </pre>
              </div>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  updateGraph((nextGraph) => removeNodeAndReindex(nextGraph, selectedNodeIndex));
                  setSelectedNodeIndex(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-rose-700 px-2 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950 disabled:opacity-40"
              >
                <DeleteIcon size={13} aria-hidden="true" /> ノードを削除
              </button>
            </div>
          ) : (
            <p className="rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
              公式operationを追加して、紫のflowソケットまたは水色のvalueソケットを接続します。独自JavaScriptは保存しません。
            </p>
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
              <button type="button" onClick={() => setJsonOpen(false)} className="text-slate-400 hover:text-white">
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
    </section>
  );
}
