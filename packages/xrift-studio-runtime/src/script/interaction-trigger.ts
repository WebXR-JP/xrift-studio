/**
 * Interaction triggers: the XRift extension operations a KHR_interactivity
 * graph uses to answer "what happens when this Entity is interacted with".
 *
 * The Studio editor, the Play preview and the published world all read this
 * module, for the same reason `interactivity-adapter.ts` is shared: a trigger
 * that behaves one way while authoring and another way after publishing is
 * worse than no trigger at all. Only the classification and the parse live
 * here; presentation belongs to the Editor and application to the runtime.
 *
 * Input is untrusted published JSON, so every read is structural and the graph
 * is never rewritten. An action this module does not understand is preserved
 * in the canonical JSON and simply does not run.
 */

/** glTF extension that defines the operations below. */
export const XRIFT_INTERACTION_EXTENSION_NAME = "XRIFT_studio_interaction" as const;

export const XRIFT_INTERACTION_OPERATIONS = {
  onInteract: "xrift/onInteract",
  setProperty: "xrift/setProperty",
  toggleProperty: "xrift/toggleProperty",
} as const;

export type XriftInteractionOperation =
  (typeof XRIFT_INTERACTION_OPERATIONS)[keyof typeof XRIFT_INTERACTION_OPERATIONS];

/**
 * What an action writes to.
 *
 * `entity` is the Entity itself; every other member is a Scene Component type
 * whose runtime state can actually be changed while a world is running. The
 * set is deliberately small: a property belongs here only when Play and the
 * published world apply it through the same runtime bridge.
 */
export type XriftInteractionTargetKind =
  | "entity"
  | "transform"
  | "animation"
  | "audio-source"
  | "light"
  | "particle"
  | "material"
  | "scene";

/**
 * Stand-in Entity id for Scene-wide targets.
 *
 * Exposure and the screen fade belong to no Entity, but an action still needs
 * something in the `entity` slot: it is what the Editor's picker selects and
 * what the trigger records as a dependency. A reserved id keeps the shape of
 * every other action instead of making Scene actions a second format.
 */
export const XRIFT_INTERACTION_SCENE_ENTITY_ID = "__xrift_scene__" as const;

export const XRIFT_INTERACTION_TARGET_KINDS: readonly XriftInteractionTargetKind[] = [
  "entity",
  "transform",
  "animation",
  "audio-source",
  "light",
  "particle",
  "material",
  "scene",
];

export const XRIFT_INTERACTION_TARGET_LABELS: Readonly<
  Record<XriftInteractionTargetKind, string>
> = {
  entity: "Entity",
  transform: "Transform",
  animation: "Animation",
  "audio-source": "Audio Source",
  light: "Light",
  particle: "Particle",
  material: "Material",
  scene: "Scene",
};

export type XriftInteractionPropertyKind =
  | "bool"
  | "float"
  | "color"
  | "vector3"
  | "enum";

/**
 * Targets that belong to the Entity rather than to one of its Components.
 *
 * A Component target needs an id so two Audio Sources on one Entity stay
 * distinguishable; an Entity-scoped one has nothing to distinguish, so
 * requiring an id there would make a complete action look unfinished.
 */
export const XRIFT_INTERACTION_ENTITY_SCOPED_TARGETS: ReadonlySet<string> =
  new Set<XriftInteractionTargetKind>([
    "entity",
    "transform",
    "material",
    "scene",
  ]);

export function isXriftInteractionEntityScoped(target: string): boolean {
  return XRIFT_INTERACTION_ENTITY_SCOPED_TARGETS.has(target);
}

export type XriftInteractionPropertyOption = {
  value: string;
  label: string;
};

/** One property a trigger action can write, and how the Editor should edit it. */
export type XriftInteractionPropertyDescriptor = {
  target: XriftInteractionTargetKind;
  name: string;
  label: string;
  /** Shown under the property picker so the runtime limit is visible while authoring. */
  description: string;
  kind: XriftInteractionPropertyKind;
  /** Value written by a freshly placed action node. */
  defaultValue: boolean | number | string | readonly [number, number, number];
  min?: number;
  max?: number;
  step?: number;
  options?: readonly XriftInteractionPropertyOption[];
};

/**
 * Every property a trigger can write.
 *
 * Audio Source playback is an enum rather than a boolean because the runtime
 * bridge takes commands (`play` / `pause` / `stop`), not an enabled flag:
 * modelling it as "enabled" would promise a state the runtime cannot hold.
 */
export const XRIFT_INTERACTION_PROPERTIES: readonly XriftInteractionPropertyDescriptor[] = [
  {
    target: "entity",
    name: "enabled",
    label: "表示",
    description: "Entityとその子の表示を切り替えます。物理コライダーは残ります。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "transform",
    name: "position",
    label: "位置",
    description:
      "Entityの位置を、親から見たXYZ（メートル）で設定します。Playを止めると元の位置に戻ります。",
    kind: "vector3",
    defaultValue: [0, 0, 0],
  },
  {
    target: "transform",
    name: "rotation",
    label: "回転",
    description:
      "EntityのXYZ回転を度で設定します。Playを止めると元の回転に戻ります。",
    kind: "vector3",
    defaultValue: [0, 0, 0],
  },
  {
    target: "transform",
    name: "scale",
    label: "大きさ",
    description:
      "EntityのXYZ倍率を設定します。0にすると見えなくなります。Playを止めると元に戻ります。",
    kind: "vector3",
    defaultValue: [1, 1, 1],
  },
  {
    target: "animation",
    name: "playing",
    label: "再生中",
    description:
      "AnimationのclipをONで再生し、OFFで止めます。押したときに動かすには、AnimationのAutoplayをオフにしておきます。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "animation",
    name: "clip",
    label: "クリップ番号",
    description:
      "再生するclipを番号で選びます。0がModelの最初のclipです。範囲外の番号は最後のclipになります。",
    kind: "float",
    defaultValue: 0,
    min: 0,
    max: 63,
    step: 1,
  },
  {
    target: "animation",
    name: "speed",
    label: "再生速度",
    description: "1で等速、0.5で半分の速さになります。",
    kind: "float",
    defaultValue: 1,
    min: 0.01,
    max: 10,
    step: 0.05,
  },
  {
    target: "animation",
    name: "time",
    label: "再生位置",
    description: "clipの先頭からの秒数へ移動します。再生中なら、その位置から続けます。",
    kind: "float",
    defaultValue: 0,
    min: 0,
    max: 600,
    step: 0.1,
  },
  {
    target: "material",
    name: "baseColor",
    label: "色",
    description:
      "このEntityが描くMaterialの色を変えます。Entity内のすべてのMaterialが対象です。Playを止めると元へ戻ります。",
    kind: "color",
    defaultValue: [1, 1, 1],
  },
  {
    target: "material",
    name: "emissive",
    label: "発光色",
    description:
      "自己発光の色を変えます。Bloomと合わせると光って見えます。値はリニア空間のRGBです。",
    kind: "color",
    defaultValue: [0, 0, 0],
  },
  {
    target: "material",
    name: "emissiveIntensity",
    label: "発光の強さ",
    description: "発光色の強さを変えます。0で消灯します。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    target: "material",
    name: "opacity",
    label: "不透明度",
    description:
      "1で不透明、0で透明になります。1未満にすると半透明として描きます。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    target: "particle",
    name: "emitting",
    label: "放出",
    description:
      "ONで粒を出し、OFFで止めて消します。押したときに出すには、最初はOFFにしておきます。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "particle",
    name: "restart",
    label: "出し直す",
    description:
      "この値を書き込むたびに、粒を最初から出し直します。一瞬だけ吹き出す表現に使います。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "particle",
    name: "emissionRate",
    label: "放出量",
    description: "1秒あたりに出る粒の数を上書きします。",
    kind: "float",
    defaultValue: 20,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    target: "particle",
    name: "sizeMultiplier",
    label: "粒の大きさ",
    description: "1で元の大きさ、2で倍になります。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    target: "particle",
    name: "opacity",
    label: "粒の不透明度",
    description: "0で見えなくなり、1で元の濃さになります。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    target: "particle",
    name: "color",
    label: "粒の色",
    description: "粒の色を変えます。値はリニア空間のRGBで保存されます。",
    kind: "color",
    defaultValue: [1, 1, 1],
  },
  {
    target: "scene",
    name: "exposure",
    label: "露出",
    description:
      "画面全体の明るさを設定します。1が既定です。Playを止めるとSceneの設定へ戻ります。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 8,
    step: 0.05,
  },
  {
    target: "scene",
    name: "fade",
    label: "画面のフェード",
    description:
      "0で世界が見え、1で画面全体を覆います。時間をかけて変えるとホワイトアウトや暗転になります。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    target: "scene",
    name: "fadeColor",
    label: "フェードの色",
    description: "画面を覆う色です。値はリニア空間のRGBで保存されます。",
    kind: "color",
    defaultValue: [1, 1, 1],
  },
  {
    target: "audio-source",
    name: "playback",
    label: "再生",
    description:
      "Audio Sourceの再生・一時停止・停止を切り替えます。押したときに鳴らすには、Audio SourceのEnabledはONのまま、Autoplayをオフにしておきます。",
    kind: "enum",
    defaultValue: "play",
    options: [
      { value: "play", label: "再生" },
      { value: "pause", label: "一時停止" },
      { value: "stop", label: "停止" },
    ],
  },
  {
    target: "audio-source",
    name: "volume",
    label: "音量",
    description: "0で無音、1で元の音量になります。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    target: "audio-source",
    name: "loop",
    label: "ループ",
    description: "再生し終わったあと繰り返すかどうかを変えます。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "light",
    name: "enabled",
    label: "点灯",
    description: "Lightの点灯と消灯を切り替えます。",
    kind: "bool",
    defaultValue: true,
  },
  {
    target: "light",
    name: "intensity",
    label: "強さ",
    description: "Lightの強度を変えます。",
    kind: "float",
    defaultValue: 1,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    target: "light",
    name: "color",
    label: "色",
    description: "Lightの色を変えます。値はリニア空間のRGBで保存されます。",
    kind: "color",
    defaultValue: [1, 1, 1],
  },
];

export function getXriftInteractionProperty(
  target: string,
  property: string,
): XriftInteractionPropertyDescriptor | undefined {
  return XRIFT_INTERACTION_PROPERTIES.find(
    (descriptor) => descriptor.target === target && descriptor.name === property,
  );
}

export function getXriftInteractionProperties(
  target: XriftInteractionTargetKind,
): readonly XriftInteractionPropertyDescriptor[] {
  return XRIFT_INTERACTION_PROPERTIES.filter(
    (descriptor) => descriptor.target === target,
  );
}

/** Value an action writes, already narrowed to what the property accepts. */
export type XriftInteractionValue =
  | { kind: "bool"; value: boolean }
  | { kind: "float"; value: number }
  /** Linear-light RGB, matching how KHR_interactivity stores glTF colour factors. */
  | { kind: "color"; value: [number, number, number] }
  /** Position, rotation in degrees, or scale. */
  | { kind: "vector3"; value: [number, number, number] }
  | { kind: "enum"; value: string };

export type XriftInteractionAction = {
  nodeIndex: number;
  mode: "set" | "toggle";
  /** Authored Entity the action writes to. */
  entityId: string;
  /** Component inside that Entity, or null when the Entity itself is the target. */
  componentId: string | null;
  target: XriftInteractionTargetKind;
  property: string;
  /** Absent for `toggle`, which reads the live value instead. */
  value: XriftInteractionValue | null;
};

/** One `xrift/onInteract` entry point and the actions its flow reaches. */
export type XriftInteractionProgram = {
  event: "interact";
  nodeIndex: number;
  actions: XriftInteractionAction[];
};

export type XriftInteractionIssueReason =
  | "incomplete-configuration"
  | "unknown-property"
  | "unsupported-toggle";

/** A node the trigger walk refuses to run, and why, for the caller to surface. */
export type XriftInteractionIssue = {
  graphIndex: number;
  nodeIndex: number;
  op: string;
  reason: XriftInteractionIssueReason;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function configurationString(
  node: Record<string, unknown> | undefined,
  name: string,
): string | null {
  const entry = asRecord(asRecord(node?.configuration)?.[name]);
  const values = entry?.value;
  const first = Array.isArray(values) ? values[0] : undefined;
  return typeof first === "string" ? first : null;
}

function inlineSocketValues(
  node: Record<string, unknown> | undefined,
  socket: string,
): unknown[] | null {
  const entry = asRecord(asRecord(node?.values)?.[socket]);
  // A socket fed by another node is unevaluable here for the same reason the
  // animation adapter refuses it: there is no expression evaluator, and reading
  // the literal the author replaced with a wire would run the wrong value.
  if (!entry || entry.node !== undefined) return null;
  return Array.isArray(entry.value) ? entry.value : [];
}

/**
 * Reads the value socket for one property.
 *
 * An empty inline value takes the descriptor's default, which is what the RC
 * specifies for a declared socket with no value written yet.
 */
function readActionValue(
  node: Record<string, unknown> | undefined,
  descriptor: XriftInteractionPropertyDescriptor,
): XriftInteractionValue | null {
  const values = inlineSocketValues(node, "value");
  if (values === null) return null;
  const first = values[0];
  switch (descriptor.kind) {
    case "bool":
      if (first === undefined) return { kind: "bool", value: Boolean(descriptor.defaultValue) };
      return typeof first === "boolean" ? { kind: "bool", value: first } : null;
    case "float": {
      if (first === undefined) {
        return { kind: "float", value: Number(descriptor.defaultValue) };
      }
      if (typeof first !== "number" || !Number.isFinite(first)) return null;
      return { kind: "float", value: clampFloat(first, descriptor) };
    }
    case "color": {
      if (first === undefined) {
        const fallback = descriptor.defaultValue as readonly [number, number, number];
        return { kind: "color", value: [fallback[0], fallback[1], fallback[2]] };
      }
      const channels = values.slice(0, 3);
      if (
        channels.length !== 3 ||
        channels.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
      ) {
        return null;
      }
      const [red, green, blue] = channels as [number, number, number];
      return { kind: "color", value: [red, green, blue] };
    }
    case "vector3": {
      if (first === undefined) {
        const fallback = descriptor.defaultValue as readonly [number, number, number];
        return { kind: "vector3", value: [fallback[0], fallback[1], fallback[2]] };
      }
      const components = values.slice(0, 3);
      if (
        components.length !== 3 ||
        components.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
      ) {
        return null;
      }
      const [x, y, z] = components as [number, number, number];
      return { kind: "vector3", value: [x, y, z] };
    }
    case "enum": {
      const options = descriptor.options ?? [];
      if (first === undefined) {
        return { kind: "enum", value: String(descriptor.defaultValue) };
      }
      // Stored as the option index because KHR_interactivity has no string type.
      if (typeof first !== "number" || !Number.isInteger(first)) return null;
      const option = options[first];
      return option ? { kind: "enum", value: option.value } : null;
    }
  }
}

function clampFloat(
  value: number,
  descriptor: XriftInteractionPropertyDescriptor,
): number {
  const lower = descriptor.min ?? Number.NEGATIVE_INFINITY;
  const upper = descriptor.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(value, lower), upper);
}

/** Index of an enum option, for writing a value socket from the Editor. */
export function xriftInteractionEnumIndex(
  descriptor: XriftInteractionPropertyDescriptor,
  value: string,
): number {
  const index = (descriptor.options ?? []).findIndex(
    (option) => option.value === value,
  );
  return index < 0 ? 0 : index;
}

type ParsedGraph = {
  graphIndex: number;
  nodes: unknown[];
  operationFor: (node: Record<string, unknown> | undefined) => string | undefined;
};

function parseSelectedGraph(value: unknown): ParsedGraph | null {
  const extension = asRecord(value);
  const graphs = Array.isArray(extension?.graphs) ? extension.graphs : [];
  const rawIndex = extension?.graph;
  const graphIndex =
    typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0
      ? rawIndex
      : 0;
  const graph = asRecord(graphs[graphIndex]);
  if (!graph) return null;
  const declarations = Array.isArray(graph.declarations) ? graph.declarations : [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  return {
    graphIndex,
    nodes,
    operationFor: (node) => {
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
    },
  };
}

function readAction(
  node: Record<string, unknown>,
  nodeIndex: number,
  op: string,
): XriftInteractionAction | null {
  const entityId = configurationString(node, "entity");
  const componentId = configurationString(node, "component");
  const target = configurationString(node, "targetKind");
  const property = configurationString(node, "property");
  if (!entityId || !target || !property) return null;
  const descriptor = getXriftInteractionProperty(target, property);
  if (!descriptor) return null;
  if (!isXriftInteractionEntityScoped(descriptor.target) && !componentId) {
    return null;
  }
  const mode = op === XRIFT_INTERACTION_OPERATIONS.toggleProperty ? "toggle" : "set";
  if (mode === "toggle") {
    if (descriptor.kind !== "bool") return null;
    return {
      nodeIndex,
      mode,
      entityId,
      componentId: isXriftInteractionEntityScoped(descriptor.target)
        ? null
        : componentId,
      target: descriptor.target,
      property: descriptor.name,
      value: null,
    };
  }
  const value = readActionValue(node, descriptor);
  if (!value) return null;
  return {
    nodeIndex,
    mode,
    entityId,
    componentId: isXriftInteractionEntityScoped(descriptor.target)
      ? null
      : componentId,
    target: descriptor.target,
    property: descriptor.name,
    value,
  };
}

/**
 * Walks every `xrift/onInteract` entry point of the selected graph.
 *
 * The walk stops at any node it cannot run, exactly like the animation adapter:
 * continuing past an unimplemented operation would run the rest of the chain as
 * though the skipped node had succeeded.
 */
export function collectXriftInteractionPrograms(
  value: unknown,
): XriftInteractionProgram[] {
  const parsed = parseSelectedGraph(value);
  if (!parsed) return [];
  const programs: XriftInteractionProgram[] = [];

  const walk = (
    nodeIndex: number,
    actions: XriftInteractionAction[],
    visited: Set<number>,
  ): void => {
    if (visited.has(nodeIndex)) return;
    const node = asRecord(parsed.nodes[nodeIndex]);
    if (!node) return;
    visited.add(nodeIndex);
    const op = parsed.operationFor(node);
    const follow = (socket: string): void => {
      const flow = asRecord(asRecord(node.flows)?.[socket]);
      const target = flow?.node;
      if (typeof target === "number" && Number.isInteger(target) && target >= 0) {
        walk(target, actions, visited);
      }
    };
    switch (op) {
      case XRIFT_INTERACTION_OPERATIONS.onInteract:
        follow("out");
        return;
      case XRIFT_INTERACTION_OPERATIONS.setProperty:
      case XRIFT_INTERACTION_OPERATIONS.toggleProperty: {
        const action = readAction(node, nodeIndex, op);
        if (!action) return;
        actions.push(action);
        follow("out");
        return;
      }
      default:
        // Unimplemented operation: no side effect and no flow output.
        return;
    }
  };

  parsed.nodes.forEach((candidate, nodeIndex) => {
    const node = asRecord(candidate);
    if (parsed.operationFor(node) !== XRIFT_INTERACTION_OPERATIONS.onInteract) {
      return;
    }
    const actions: XriftInteractionAction[] = [];
    walk(nodeIndex, actions, new Set<number>());
    programs.push({ event: "interact", nodeIndex, actions });
  });

  return programs;
}

/** True when the graph has at least one interact entry point. */
export function hasXriftInteractionTrigger(value: unknown): boolean {
  return collectXriftInteractionPrograms(value).length > 0;
}

/**
 * Reports every trigger action node the runtime will not run.
 *
 * Unlike an unsupported operation, an incomplete action is something the author
 * can finish, so the Editor shows it next to the schema diagnostics instead of
 * silently dropping the node.
 */
export function collectXriftInteractionIssues(
  value: unknown,
): XriftInteractionIssue[] {
  const parsed = parseSelectedGraph(value);
  if (!parsed) return [];
  const issues: XriftInteractionIssue[] = [];
  parsed.nodes.forEach((candidate, nodeIndex) => {
    const node = asRecord(candidate);
    if (!node) return;
    const op = parsed.operationFor(node);
    if (
      op !== XRIFT_INTERACTION_OPERATIONS.setProperty &&
      op !== XRIFT_INTERACTION_OPERATIONS.toggleProperty
    ) {
      return;
    }
    const target = configurationString(node, "targetKind");
    const property = configurationString(node, "property");
    const descriptor =
      target && property ? getXriftInteractionProperty(target, property) : undefined;
    if (!configurationString(node, "entity") || !target || !property) {
      issues.push({
        graphIndex: parsed.graphIndex,
        nodeIndex,
        op,
        reason: "incomplete-configuration",
      });
      return;
    }
    if (!descriptor) {
      issues.push({
        graphIndex: parsed.graphIndex,
        nodeIndex,
        op,
        reason: "unknown-property",
      });
      return;
    }
    if (
      !isXriftInteractionEntityScoped(descriptor.target) &&
      !configurationString(node, "component")
    ) {
      issues.push({
        graphIndex: parsed.graphIndex,
        nodeIndex,
        op,
        reason: "incomplete-configuration",
      });
      return;
    }
    if (
      op === XRIFT_INTERACTION_OPERATIONS.toggleProperty &&
      descriptor.kind !== "bool"
    ) {
      issues.push({
        graphIndex: parsed.graphIndex,
        nodeIndex,
        op,
        reason: "unsupported-toggle",
      });
      return;
    }
    if (readAction(node, nodeIndex, op) === null) {
      issues.push({
        graphIndex: parsed.graphIndex,
        nodeIndex,
        op,
        reason: "incomplete-configuration",
      });
    }
  });
  return issues;
}
