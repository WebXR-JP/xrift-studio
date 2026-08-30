import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  configureInteractivityMaterialPointer,
  appendInteractivityOperation,
  addInteractivityGraph,
  autoLayoutInteractivityGraph,
  duplicateInteractivityNode,
  pasteInteractivityNode,
  readInteractivityNodeForCopy,
  freeInteractivityNodePosition,
  isInteractivityTriggerActionOp,
  dryRunInteractivityGraph,
  duplicateInteractivityGraph,
  removeInteractivityGraph,
  renameInteractivityGraph,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  parseKhrInteractivityExtension,
  readInteractivityNodePosition,
  readInteractivityTriggerActionDuration,
  readInteractivityTriggerActionEasing,
  setInteractivityLiteralValue,
  setInteractivityTriggerActionDuration,
  setInteractivityTriggerActionEasing,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  type InteractivityAsset,
  type InteractivityNodeClipboard,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
  type MaterialAsset,
} from "../../lib/visual-editor";
import {
  configureInteractivityTriggerAction,
  getXriftInteractionProperty,
  readInteractivityTriggerAction,
  setInteractivityTriggerActionValue,
  XRIFT_INTERACTION_OPERATIONS,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "../../lib/visual-editor";
import {
  findInteractionTriggerTarget,
  findInteractionTriggerTargetComponent,
  type InteractionTriggerTargetEntity,
} from "../../lib/visual-editor";
import { EditorDialog } from "./EditorDialog";
import { InteractivityTimeline } from "./InteractivityTimeline";
import { EDITOR_ICONS } from "./editor-icons";
import { CodeTokens } from "../CodeBlock";
import {
  CANVAS_GRID,
  CANVAS_NAVIGATION,
  CATEGORY_LABEL,
  CATEGORY_MINIMAP_COLOR,
  DELETE_KEY_CODES,
  FIT_VIEW_OPTIONS,
  NODE_CARD_WIDTH,
  PALETTE_CATEGORY_ORDER,
  nodeTypes,
  type GraphFlowNode,
} from "./InteractivityNodeCard";
import {
  applyConnectionToGraph,
  parseHandle,
  removeConnectionFromGraph,
  removeNodesAndReindex,
  toFlowEdges,
  toFlowNodes,
} from "./interactivity-graph-flow";
import {
  LiteralValueField,
  TIMED_PROPERTY_KINDS,
  TriggerTimingField,
  TriggerValueField,
} from "./InteractivityNodeFields";


/** True while a text field owns the keystroke, so editor shortcuts stand down. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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
  /** What the Scene already does with this graph, and how to finish wiring it. */
  setup?: InteractivityGraphSetup;
}) {
  // The provider sits above the body so the palette can place a new node at the
  // centre of what the author is actually looking at.
  return (
    <ReactFlowProvider>
      <InteractivityGraphEditorBody {...props} />
    </ReactFlowProvider>
  );
}

/**
 * What the Scene does with this graph, and the two things that finish it.
 *
 * A graph runs because an **Interaction Trigger** on some Entity points at it.
 * That is true of every graph, including one that starts itself on
 * `event/onStart` — the component is what mounts the runtime. Nothing said so,
 * so the ordinary first experience was to wire a graph, press Play and watch
 * nothing happen at all.
 */
export type InteractivityGraphSetup = {
  readonly attachments: readonly {
    entityId: string;
    name: string;
    hasInteractable: boolean;
    /** Clips the Entity's Model carries, for graphs that play them. */
    animationClipCount: number;
  }[];
  readonly selectedEntity: { entityId: string; name: string } | null;
  readonly onAttach: (entityId: string) => void;
  readonly onAddInteractable: (entityId: string) => void;
  readonly onSelectEntity: (entityId: string) => void;
};

/** How many graph edits stay undoable. Older entries fall off the front. */
const GRAPH_HISTORY_LIMIT = 60;

const INSPECTOR_MIN_WIDTH = 240;
const INSPECTOR_MAX_WIDTH = 560;

type GraphDraftHistory = {
  entries: KhrInteractivityExtension[];
  index: number;
};

/** Gap kept between a new node and the ones already placed. */

/**
 * How tall a card will be, from the sockets its operation declares.
 *
 * Placement has to know this: the animation node is three times the height of
 * an event node, and a fixed guess either dropped a new card on top of a tall
 * one or pushed it half a screen away from a short one.
 */
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
  setup,
}: {
  asset: InteractivityAsset;
  materials: readonly MaterialAsset[];
  triggerTargets?: readonly InteractionTriggerTargetEntity[];
  readOnly: boolean;
  onSave: (assetId: string, extension: KhrInteractivityExtension) => void;
  onClose: () => void;
  setup?: InteractivityGraphSetup;
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
  /**
   * The one thing still standing between this graph and running.
   *
   * Reported in the order an author hits it: nothing runs the graph at all,
   * then the graph can be pressed but the Entity cannot be.
   */
  const setupStep = useMemo(() => {
    if (!setup) return null;
    const usesInteract = (draft.graphs ?? []).some((candidate) =>
      (candidate.nodes ?? []).some(
        (node) =>
          candidate.declarations?.[node.declaration]?.op ===
          XRIFT_INTERACTION_OPERATIONS.onInteract,
      ),
    );
    if (setup.attachments.length === 0) {
      return { kind: "unattached" as const, usesInteract };
    }
    const pressable = setup.attachments.find((entry) => entry.hasInteractable);
    if (usesInteract && !pressable) {
      return {
        kind: "not-pressable" as const,
        usesInteract,
        entity: setup.attachments[0]!,
      };
    }
    // A graph that plays clips on an Entity with none is the quiet failure a
    // generated animation graph runs into: it was attached to the wrong Entity,
    // and Play just does nothing.
    const playsAnimation = (draft.graphs ?? []).some((candidate) =>
      (candidate.nodes ?? []).some((node) =>
        candidate.declarations?.[node.declaration]?.op?.startsWith("animation/"),
      ),
    );
    if (
      playsAnimation &&
      setup.attachments.every((entry) => entry.animationClipCount === 0)
    ) {
      return {
        kind: "no-clips" as const,
        usesInteract,
        entity: setup.attachments[0]!,
      };
    }
    return { kind: "ready" as const, usesInteract };
  }, [draft.graphs, setup]);

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
  const triggerActionNode = isInteractivityTriggerActionOp(selectedDeclaration?.op);
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
              isInteractivityTriggerActionOp(selectedDeclaration?.op)
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

  /** Survives switching graphs, so a node can be carried between them. */
  const [clipboard, setClipboard] = useState<InteractivityNodeClipboard | null>(null);

  const handleDuplicateNode = useCallback(() => {
    if (readOnly || selectedNodeIndex === null) return;
    const source = graph.nodes?.[selectedNodeIndex];
    if (!source) return;
    const created = graph.nodes?.length ?? 0;
    updateGraph((nextGraph) => {
      duplicateInteractivityNode(nextGraph, selectedNodeIndex);
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


  /**
   * Where the next node lands.
   *
   * The old fixed grid put node twelve at a coordinate the author had probably
   * panned away from minutes earlier, so adding a node looked like nothing had
   * happened. Placing it at the centre of the visible canvas, with a small
   * cascade so repeats do not stack, means the author sees what they added.
   */
  /** Flow coordinates of the last right-click, cleared once a node is placed. */
  const [paletteDropAt, setPaletteDropAt] = useState<{ x: number; y: number } | null>(
    null,
  );
  /** Where the palette opens, so a right-click menu appears under the cursor. */
  const [paletteAt, setPaletteAt] = useState<{ left: number; top: number } | null>(
    null,
  );

  /**
   * Right-click puts the add menu under the cursor, and the node after it.
   *
   * The canvas is where an author is already looking and already pointing.
   * Sending them to a toolbar for the next node is the difference between
   * drawing a graph and filling in a form. Cards answer too — right-clicking
   * one and getting nothing reads as the editor ignoring the press.
   */
  const paletteSearchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (paletteOpen) paletteSearchRef.current?.focus();
  }, [paletteOpen]);

  const openPaletteAtPointer = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      if (readOnly) return;
      event.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPaletteQuery("");
      setPaletteDropAt(
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
      setPaletteAt({
        left: Math.min(
          Math.max(event.clientX - rect.x, 8),
          Math.max(rect.width - 328, 8),
        ),
        top: Math.min(
          Math.max(event.clientY - rect.y, 8),
          Math.max(rect.height - 280, 8),
        ),
      });
      setPaletteOpen(true);
    },
    [readOnly, screenToFlowPosition],
  );

  const nextNodePosition = useCallback(
    (count: number, leadIn = 0) => {
      // A right-click said where. Nothing else has to guess.
      if (paletteDropAt) {
        return freeInteractivityNodePosition(graph, {
          x: paletteDropAt.x - NODE_CARD_WIDTH / 2,
          y: paletteDropAt.y - 24,
        });
      }
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
        return freeInteractivityNodePosition(graph, {
          x: anchor.x + NODE_CARD_WIDTH + 64,
          y: anchor.y,
        });
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 160, y: 160 };
      const cascade = (count % 5) * 56;
      return freeInteractivityNodePosition(graph, {
        x: center.x - NODE_CARD_WIDTH / 2 - leadIn + cascade,
        y: center.y - 60 + cascade,
      });
    },
    [graph.nodes, paletteDropAt, screenToFlowPosition, selectedNodeIndex],
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
  /**
   * Copy and paste, which duplicate cannot replace.
   *
   * Ctrl+D makes a copy beside the original. Copy and paste is for the other
   * two things: placing the same node several times, and carrying one into
   * another graph of the same Asset — where its declaration index and its type
   * indexes mean something different, so the clipboard carries the names.
   */
  const handleCopyNode = useCallback(() => {
    if (selectedNodeIndex === null) return;
    const entry = readInteractivityNodeForCopy(graph, selectedNodeIndex);
    if (!entry) return;
    setClipboard(entry);
  }, [graph, selectedNodeIndex]);

  const handlePasteNode = useCallback(() => {
    if (readOnly || !clipboard) return;
    const created = graph.nodes?.length ?? 0;
    updateGraph((nextGraph) => {
      pasteInteractivityNode(nextGraph, clipboard, nextNodePosition(created));
    });
    setSelectedNodeIndex(created);
  }, [clipboard, graph.nodes, nextNodePosition, readOnly, updateGraph]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      // Ctrl+Z belongs to whatever text field has focus. Taking it while the
      // author is typing in the JSON panel or renaming a graph would undo the
      // graph instead of the sentence, and the rename pushes one history entry
      // per keystroke, so the two undos are not even the same size.
      if (modifier && isTextEntryTarget(event.target)) return;
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
      if (modifier && event.key.toLowerCase() === "c") {
        // Only when a node is selected: otherwise Ctrl+C is the browser's, and
        // taking it would stop an author copying text out of the JSON panel.
        if (selectedNodeIndex === null) return;
        event.preventDefault();
        handleCopyNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        if (!clipboard) return;
        event.preventDefault();
        handlePasteNode();
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
    handleCopyNode,
    handleDuplicateNode,
    handlePasteNode,
    clipboard,
    selectedNodeIndex,
    paletteOpen,
    redo,
    requestClose,
    undo,
  ]);

  const handleAddOperation = (op: string) => {
    if (readOnly) return;
    const created = graph.nodes?.length ?? 0;
    const position = nextNodePosition(created);
    updateGraph((nextGraph) => {
      appendInteractivityOperation(nextGraph, op, position);
    });
    setSelectedNodeIndex(created);
    setPaletteOpen(false);
    setPaletteDropAt(null);
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
  const UndoIcon = EDITOR_ICONS.undo;
  const RedoIcon = EDITOR_ICONS.redo;

  /** Built once, pinned to the right of the tool row and outside its scroll. */
  const saveButton = (
    <button
      type="button"
      onClick={() => onSave(asset.id, draft)}
      disabled={readOnly || errors.length > 0}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded bg-emerald-600 px-2.5 text-xs font-bold hover:bg-emerald-500 disabled:opacity-40"
    >
      <SaveIcon size={13} aria-hidden="true" /> 保存
    </button>
  );
  const closeButton = (
    <button
      type="button"
      onClick={requestClose}
      className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
      aria-label="Interactivity editorを閉じる"
    >
      <CloseIcon size={16} aria-hidden="true" />
    </button>
  );

  return (
    <section
      className="absolute z-[75] flex min-h-0 overflow-hidden border-t border-slate-800 bg-slate-950 text-white"
      /*
       * Docked, the editor fills the Scene View's cell and the two are tabs of
       * one place. It used to float over the viewport with a fixed 24px inset
       * from the window, which put its last 300px — the save button among them
       * — under the Inspector and left the Inspector's own resize handle
       * unreachable. The tracks are draggable, so they are read rather than
       * guessed, and the cell's tab strip stays visible above.
       */
      style={{
        top: "2.25rem",
        left: "var(--xrift-hierarchy-track, 0px)",
        right: "var(--xrift-inspector-track, 0px)",
        bottom: "var(--xrift-assets-track, 0px)",
      }}
      aria-label="KHR_interactivity graph editor"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Wraps instead of clipping. Every control after the title was
          `shrink-0` on a fixed-height row, so a narrow editor pushed the save
          and close buttons past the panel's edge, where `overflow-hidden` cut
          them off: the graph could still be edited but no longer saved. The row
          now grows to a second line, which costs canvas height and hides
          nothing.
        */}
        {/*
          The tools sit on their own row, and that row wraps.
          Everything used to share one fixed-height line with the title and the
          save button; a narrow editor pushed the end of it past the panel,
          where `overflow-hidden` cut it off — the graph stayed editable but
          could no longer be saved. Splitting by role keeps save and close in
          one place at any width, and lets the tools take a second line instead
          of disappearing.
        */}
        <div className="relative shrink-0 border-b border-slate-700 bg-slate-900/60">
        <div className="flex h-9 items-center gap-1 overflow-x-auto overflow-y-hidden px-2">
          <div className="relative shrink-0">
            <div className="flex items-center gap-1">
              <select
                value={graphIndex}
                onChange={(event) => {
                  setGraphIndex(Number(event.target.value));
                  setSelectedNodeIndex(null);
                }}
                className="h-7 max-w-[11rem] shrink-0 rounded border border-slate-600 bg-slate-800 px-2 text-xs"
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
                className="h-7 shrink-0 rounded border border-slate-600 px-2 text-xs hover:bg-slate-800 disabled:opacity-40"
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
              // Opened from the toolbar, so it belongs in the corner and the
              // node lands where the toolbar would have put it.
              setPaletteAt(null);
              setPaletteDropAt(null);
            }}
            disabled={readOnly}
            aria-expanded={paletteOpen}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded px-2.5 text-xs font-semibold disabled:opacity-40 ${
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
              aria-label="元に戻す"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-600 hover:bg-slate-800 disabled:opacity-35"
            >
              <UndoIcon size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={readOnly || !canRedo}
              title="やり直す (Ctrl+Shift+Z)"
              aria-label="やり直す"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-600 hover:bg-slate-800 disabled:opacity-35"
            >
              <RedoIcon size={14} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleAutoLayout}
            disabled={readOnly}
            title="流れの順に、左から右へ並べ直します"
            className="h-7 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800 disabled:opacity-40"
          >
            整列
          </button>
          <button
            type="button"
            onClick={() => fitView({ padding: 0.25, duration: 200 })}
            className="h-7 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
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
            className={`h-7 shrink-0 rounded border px-3 text-xs ${
              timelineOpen
                ? "border-violet-400 bg-violet-500/20 text-violet-100"
                : "border-slate-600 hover:bg-slate-800"
            }`}
          >
            タイムライン
          </button>
          <button
            type="button"
            onClick={handleCopyJson}
            className="h-7 shrink-0 rounded border border-slate-600 px-3 text-xs hover:bg-slate-800"
          >
            JSON
          </button>
        </div>
          {/*
            The row scrolls rather than wrapping, so its height stays the same
            at any width and the canvas keeps its space. The fade is what says
            so: without it a row that ends mid-button reads as clipped, which is
            the thing this panel was doing for real a moment ago. Save and close
            sit outside the scroll, because the one thing that must never need
            a scroll to reach is the way to keep the work.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-900 to-transparent" 
          />
          <div className="absolute inset-y-0 right-0 flex items-center gap-1 bg-slate-900 pl-2 pr-2">
            {saveButton}
            {closeButton}
          </div>
        </div>

        {/*
          Says what the Scene is missing, and does it. The graph itself cannot
          answer「なぜ Play で何も起きないのか」, because the answer is always
          about an Entity that is not on this canvas.
        */}
        {setup && setupStep && setupStep.kind !== "ready" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100">
            {setupStep.kind === "unattached" ? (
              <>
                <span className="font-semibold">このグラフはまだ動きません。</span>
                <span className="text-amber-200/90">
                  Entity へ付けると、{setupStep.usesInteract ? "押したときに" : "ワールドに入ったときに"}動きます。
                </span>
                {setup.selectedEntity ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setup.onAttach(setup.selectedEntity!.entityId)}
                    className="h-6 shrink-0 rounded bg-amber-400 px-2 text-[11px] font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-40"
                  >
                    「{setup.selectedEntity.name}」に付ける
                  </button>
                ) : (
                  <span className="text-amber-200/80">
                    Hierarchy で Entity を選ぶと、ここから付けられます。
                  </span>
                )}
              </>
            ) : setupStep.kind === "no-clips" ? (
              <>
                <span className="font-semibold">再生するclipがありません。</span>
                <span className="text-amber-200/90">
                  「{setupStep.entity.name}」のModelにanimation
                  clipがないため、アニメーションのノードは何も動かしません。clipを持つModelのEntityへ付け替えてください。
                </span>
                <button
                  type="button"
                  onClick={() => setup.onSelectEntity(setupStep.entity.entityId)}
                  className="h-6 shrink-0 rounded border border-amber-400/60 px-2 text-[11px] font-bold text-amber-100 hover:bg-amber-400/20"
                >
                  「{setupStep.entity.name}」を選ぶ
                </button>
              </>
            ) : (
              <>
                <span className="font-semibold">押しても始まりません。</span>
                <span className="text-amber-200/90">
                  「インタラクト時」から始まるグラフには、付け先の Entity に Interactable が要ります。
                </span>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setup.onAddInteractable(setupStep.entity.entityId)}
                  className="h-6 shrink-0 rounded bg-amber-400 px-2 text-[11px] font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-40"
                >
                  「{setupStep.entity.name}」に Interactable を追加
                </button>
              </>
            )}
          </div>
        ) : null}

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
            onPaneContextMenu={openPaletteAtPointer}
            onNodeContextMenu={openPaletteAtPointer}
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
          </ReactFlow>

          {paletteOpen ? (
            <div
              className="absolute z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col rounded-lg border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur"
              style={paletteAt ?? { left: "0.75rem", top: "0.75rem" }}
            >
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
                {/*
                  Focused the moment the panel opens, so the whole gesture is
                  right-click, type the name, Enter. Reaching for the field
                  first is the step that made adding a node feel like a form.
                */}
                <input
                  ref={paletteSearchRef}
                  type="search"
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const first = paletteGroups[0]?.templates[0];
                      if (!first) return;
                      event.preventDefault();
                      handleAddOperation(first.op);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setPaletteOpen(false);
                    }
                  }}
                  placeholder="名前で絞り込む（待機・色・音）"
                  className="h-8 w-full rounded border border-slate-600 bg-slate-900 px-2 text-xs placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                  aria-label="ノードを検索"
                />
                {paletteQuery && paletteGroups[0]?.templates[0] ? (
                  <p className="mt-1 truncate text-[10px] text-slate-400">
                    Enter で「{paletteGroups[0].templates[0].label}」を置きます
                  </p>
                ) : null}
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-2.5">
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
                {paletteGroups.length === 0 ? (
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

        {/*
          One line, always. Wrapping turned six short labels into a six-line
          column that took most of a narrow canvas — the status of the graph
          crowding out the graph. State stays; the two hints step aside where
          there is no room, since they say the same thing every time.
        */}
        <footer className="flex h-7 shrink-0 items-center gap-2.5 overflow-hidden whitespace-nowrap border-t border-slate-700 bg-slate-900 px-2.5 text-[10px] text-slate-400">
          {/* Spec provenance belongs here, not in the header: it never changes
              and the header needs its width for the actions. */}
          <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 font-semibold text-emerald-300">
            KHR_interactivity RC
          </span>
          <span className="shrink-0">{graph.nodes?.length ?? 0} nodes</span>
          <span className="shrink-0">{edges.length} connections</span>
          {errors.length > 0 ? (
            <span className="shrink-0 font-semibold text-rose-300">
              {errors.length} errors・保存不可
            </span>
          ) : warnings.length > 0 ? (
            <span className="shrink-0 text-amber-300">{warnings.length} warnings</span>
          ) : (
            <span className="shrink-0 text-emerald-300">KHR graph validation OK</span>
          )}
          {dirty ? (
            <span className="shrink-0 text-slate-300">未保存の変更があります</span>
          ) : null}
          {setupStep?.kind === "ready" && setup ? (
            <span className="flex shrink-0 items-center gap-1 text-slate-400">
              付いている Entity:
              {setup.attachments.slice(0, 3).map((entry) => (
                <button
                  key={entry.entityId}
                  type="button"
                  onClick={() => setup.onSelectEntity(entry.entityId)}
                  title={`${entry.name}を選ぶ`}
                  className="rounded px-1 text-slate-200 underline decoration-dotted hover:bg-slate-800"
                >
                  {entry.name}
                </button>
              ))}
              {setup.attachments.length > 3
                ? `ほか${setup.attachments.length - 3}件`
                : null}
            </span>
          ) : null}
          <span className="ml-auto hidden shrink-0 2xl:inline">
            ドラッグ / ホイールで移動・Ctrl+ホイールで拡大・線を選んでDeleteで切断
          </span>
          <span className="hidden shrink-0 xl:inline">紫: flow / 水色: value</span>
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
        // Never more than a third of the editor. At a fixed 240–560px the
        // Inspector took 294 of a 487px-wide editor, leaving 193px of canvas —
        // narrower than one node card, so the graph the panel exists to show
        // was the thing that disappeared.
        style={{ width: `min(${inspectorWidth}px, 34%)`, minWidth: 0 }}
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
                canvas を右クリック、または「追加」からノードを置きます。「開始時」から線をつないでいくと動きになります。
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
