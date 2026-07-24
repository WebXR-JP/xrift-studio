import type { AssetManifest, InteractivityAsset } from "./asset-manifest";

export const KHR_INTERACTIVITY_EXTENSION_NAME = "KHR_interactivity" as const;
export const KHR_INTERACTIVITY_SPEC_STATUS =
  "release-candidate-2026-07-16" as const;

export type KhrInteractivityJsonValue =
  | null
  | boolean
  | number
  | string
  | KhrInteractivityJsonValue[]
  | { [key: string]: KhrInteractivityJsonValue };

export type KhrInteractivityProperty = {
  extensions?: Record<string, KhrInteractivityJsonValue>;
  extras?: Record<string, KhrInteractivityJsonValue>;
};

export type KhrInteractivityType = KhrInteractivityProperty & {
  signature: string;
};

export type KhrInteractivityVariable = KhrInteractivityProperty & {
  type: number;
  value?: KhrInteractivityJsonValue[];
};

export type KhrInteractivityEvent = KhrInteractivityProperty & {
  id?: string;
  values?: Record<string, { type: number } & KhrInteractivityProperty>;
};

export type KhrInteractivityDeclaration = KhrInteractivityProperty & {
  op: string;
  extension?: string;
  inputValueSockets?: Record<string, { type: number } & KhrInteractivityProperty>;
  outputValueSockets?: Record<string, { type: number } & KhrInteractivityProperty>;
};

export type KhrInteractivityValueSocket = KhrInteractivityProperty & {
  node?: number;
  socket?: string;
  type?: number;
  value?: KhrInteractivityJsonValue[];
};

export type KhrInteractivityFlowSocket = KhrInteractivityProperty & {
  node: number;
  socket?: string;
};

export type KhrInteractivityNode = KhrInteractivityProperty & {
  declaration: number;
  configuration?: Record<
    string,
    { value?: KhrInteractivityJsonValue[] } & KhrInteractivityProperty
  >;
  values?: Record<string, KhrInteractivityValueSocket>;
  flows?: Record<string, KhrInteractivityFlowSocket>;
};

export type KhrInteractivityGraph = KhrInteractivityProperty & {
  name?: string;
  types?: KhrInteractivityType[];
  variables?: KhrInteractivityVariable[];
  events?: KhrInteractivityEvent[];
  declarations?: KhrInteractivityDeclaration[];
  nodes?: KhrInteractivityNode[];
};

export type KhrInteractivityExtension = KhrInteractivityProperty & {
  graphs: KhrInteractivityGraph[];
  graph?: number;
};

export type InteractivityDiagnostic = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type InteractivityOperationTemplate = {
  op: string;
  label: string;
  category: "event" | "flow" | "animation" | "variable" | "pointer" | "math";
  flowInputs: string[];
  flowOutputs: string[];
  valueInputs: string[];
  valueOutputs: string[];
  createNode?: (typeIndices: Record<string, number>) => Omit<KhrInteractivityNode, "declaration">;
};

export type InteractivityMaterialPointerPreset = {
  id: string;
  label: string;
  pointer: string;
  signature: "bool" | "float" | "float2" | "float3" | "float4";
  extension?: "KHR_texture_transform";
};

/** Mutable glTF material properties exposed by KHR_interactivity pointer nodes. */
export const KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS: readonly InteractivityMaterialPointerPreset[] = [
  { id: "base-color", label: "Base Color", pointer: "/materials/[material]/pbrMetallicRoughness/baseColorFactor", signature: "float4" },
  { id: "metallic", label: "Metallic", pointer: "/materials/[material]/pbrMetallicRoughness/metallicFactor", signature: "float" },
  { id: "roughness", label: "Roughness", pointer: "/materials/[material]/pbrMetallicRoughness/roughnessFactor", signature: "float" },
  { id: "emissive", label: "Emissive", pointer: "/materials/[material]/emissiveFactor", signature: "float3" },
  { id: "normal-scale", label: "Normal Scale", pointer: "/materials/[material]/normalTexture/scale", signature: "float" },
  { id: "occlusion-strength", label: "Occlusion Strength", pointer: "/materials/[material]/occlusionTexture/strength", signature: "float" },
  { id: "double-sided", label: "Double Sided", pointer: "/materials/[material]/doubleSided", signature: "bool" },
  { id: "base-color-tiling", label: "Base Color タイリング", pointer: "/materials/[material]/pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/scale", signature: "float2", extension: "KHR_texture_transform" },
  { id: "base-color-offset", label: "Base Color Offset", pointer: "/materials/[material]/pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/offset", signature: "float2", extension: "KHR_texture_transform" },
  { id: "base-color-rotation", label: "Base Color Rotation", pointer: "/materials/[material]/pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/rotation", signature: "float", extension: "KHR_texture_transform" },
  { id: "metallic-roughness-tiling", label: "Metallic / Roughness タイリング", pointer: "/materials/[material]/pbrMetallicRoughness/metallicRoughnessTexture/extensions/KHR_texture_transform/scale", signature: "float2", extension: "KHR_texture_transform" },
  { id: "normal-tiling", label: "Normal タイリング", pointer: "/materials/[material]/normalTexture/extensions/KHR_texture_transform/scale", signature: "float2", extension: "KHR_texture_transform" },
  { id: "occlusion-tiling", label: "Occlusion タイリング", pointer: "/materials/[material]/occlusionTexture/extensions/KHR_texture_transform/scale", signature: "float2", extension: "KHR_texture_transform" },
  { id: "emissive-tiling", label: "Emissive タイリング", pointer: "/materials/[material]/emissiveTexture/extensions/KHR_texture_transform/scale", signature: "float2", extension: "KHR_texture_transform" },
];

const KHR_INTERACTIVITY_TYPE_SIGNATURES = new Set([
  "bool",
  "float",
  "float2",
  "float3",
  "float4",
  "float2x2",
  "float3x3",
  "float4x4",
  "int",
  "ref",
  "custom",
]);

/** Operations defined by the July 16, 2026 KHR_interactivity release candidate. */
const KHR_INTERACTIVITY_CORE_OPERATIONS = new Set([
  "animation/start",
  "animation/stop",
  "animation/stopAt",
  "debug/log",
  "event/onStart",
  "event/onTick",
  "event/receive",
  "event/send",
  "event/stopPropagation",
  "flow/branch",
  "flow/cancelDelay",
  "flow/doN",
  "flow/for",
  "flow/multiGate",
  "flow/sequence",
  "flow/setDelay",
  "flow/switch",
  "flow/throttle",
  "flow/waitAll",
  "flow/while",
  "math/abs",
  "math/acos",
  "math/add",
  "math/and",
  "math/asin",
  "math/asr",
  "math/atan",
  "math/atan2",
  "math/cbrt",
  "math/ceil",
  "math/clamp",
  "math/clz",
  "math/combine2",
  "math/combine2x2",
  "math/combine3",
  "math/combine3x3",
  "math/combine4",
  "math/combine4x4",
  "math/cos",
  "math/cross",
  "math/ctz",
  "math/deg",
  "math/determinant",
  "math/div",
  "math/dot",
  "math/E",
  "math/eq",
  "math/exp",
  "math/extract2",
  "math/extract2x2",
  "math/extract3",
  "math/extract3x3",
  "math/extract4",
  "math/extract4x4",
  "math/floor",
  "math/fract",
  "math/ge",
  "math/gt",
  "math/Inf",
  "math/inverse",
  "math/isInf",
  "math/isNaN",
  "math/le",
  "math/length",
  "math/log",
  "math/log10",
  "math/log2",
  "math/lsl",
  "math/lt",
  "math/matCompose",
  "math/matDecompose",
  "math/matMul",
  "math/max",
  "math/min",
  "math/mix",
  "math/mul",
  "math/NaN",
  "math/neg",
  "math/normalize",
  "math/not",
  "math/or",
  "math/Pi",
  "math/popcnt",
  "math/pow",
  "math/quatAngleBetween",
  "math/quatConjugate",
  "math/quatFromAngles",
  "math/quatFromAxisAngle",
  "math/quatFromDirections",
  "math/quatFromUpForward",
  "math/quatMul",
  "math/quatSlerp",
  "math/quatToAxisAngle",
  "math/rad",
  "math/random",
  "math/rem",
  "math/rgbFromOkLCh",
  "math/rgbToOkLCh",
  "math/rotate2D",
  "math/rotate3D",
  "math/round",
  "math/saturate",
  "math/select",
  "math/sign",
  "math/sin",
  "math/slerp",
  "math/smoothStep",
  "math/sqrt",
  "math/sub",
  "math/switch",
  "math/tan",
  "math/Tau",
  "math/transform",
  "math/transpose",
  "math/trunc",
  "math/xor",
  "pointer/get",
  "pointer/interpolate",
  "pointer/set",
  "ref/eq",
  "type/boolToFloat",
  "type/boolToInt",
  "type/floatToBool",
  "type/floatToInt",
  "type/intToBool",
  "type/intToFloat",
  "variable/get",
  "variable/interpolate",
  "variable/set",
]);

export const KHR_INTERACTIVITY_OPERATION_TEMPLATES: InteractivityOperationTemplate[] = [
  {
    op: "event/onStart",
    label: "開始時",
    category: "event",
    flowInputs: [],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: ["event"],
  },
  {
    op: "event/onTick",
    label: "毎フレーム",
    category: "event",
    flowInputs: [],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: ["timeSinceStart", "timeSinceLastTick", "event"],
  },
  {
    op: "flow/branch",
    label: "条件分岐",
    category: "flow",
    flowInputs: ["in"],
    flowOutputs: ["true", "false"],
    valueInputs: ["condition"],
    valueOutputs: [],
  },
  {
    op: "flow/setDelay",
    label: "待機",
    category: "flow",
    flowInputs: ["in", "cancel"],
    flowOutputs: ["out", "err", "done"],
    valueInputs: ["duration"],
    valueOutputs: ["lastDelay"],
    createNode: (types) => ({
      values: { duration: { type: types.float, value: [1] } },
    }),
  },
  {
    op: "animation/start",
    label: "アニメーション再生",
    category: "animation",
    flowInputs: ["in"],
    flowOutputs: ["out", "err", "done"],
    valueInputs: ["animation", "startTime", "endTime", "speed"],
    valueOutputs: [],
    createNode: (types) => ({
      values: {
        animation: { type: types.int },
        startTime: { type: types.float, value: [0] },
        endTime: { type: types.float, value: [0] },
        speed: { type: types.float, value: [1] },
      },
    }),
  },
  {
    op: "animation/stop",
    label: "アニメーション停止",
    category: "animation",
    flowInputs: ["in"],
    flowOutputs: ["out", "err"],
    valueInputs: ["animation"],
    valueOutputs: [],
    createNode: (types) => ({ values: { animation: { type: types.int } } }),
  },
  {
    op: "variable/get",
    label: "変数を取得",
    category: "variable",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: [],
    valueOutputs: ["value", "isValid"],
  },
  {
    op: "variable/set",
    label: "変数を設定",
    category: "variable",
    flowInputs: ["in"],
    flowOutputs: ["out"],
    valueInputs: ["0"],
    valueOutputs: [],
  },
  {
    op: "pointer/get",
    label: "glTFプロパティを取得",
    category: "pointer",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: [],
    valueOutputs: ["value"],
  },
  {
    op: "pointer/set",
    label: "glTFプロパティを設定",
    category: "pointer",
    flowInputs: ["in"],
    flowOutputs: ["out", "err"],
    valueInputs: ["value"],
    valueOutputs: [],
  },
  {
    op: "pointer/interpolate",
    label: "glTFプロパティを補間",
    category: "animation",
    flowInputs: ["in"],
    flowOutputs: ["out", "err", "done"],
    valueInputs: ["value", "duration", "p1", "p2"],
    valueOutputs: [],
    createNode: (types) => ({
      values: { duration: { type: types.float, value: [1] } },
    }),
  },
  {
    op: "math/Inf",
    label: "無限値",
    category: "math",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: [],
    valueOutputs: ["value"],
  },
];

export function getInteractivityOperationTemplate(
  op: string,
): InteractivityOperationTemplate | undefined {
  return KHR_INTERACTIVITY_OPERATION_TEMPLATES.find(
    (template) => template.op === op,
  );
}

export function configureInteractivityMaterialPointer(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  presetId: string,
  materialIndex: number,
): boolean {
  const node = graph.nodes?.[nodeIndex];
  const declaration = node ? graph.declarations?.[node.declaration] : undefined;
  const preset = KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (
    !node ||
    !declaration?.op.startsWith("pointer/") ||
    !preset ||
    !Number.isInteger(materialIndex) ||
    materialIndex < 0
  ) {
    return false;
  }
  graph.types ??= [];
  const ensureType = (signature: string) => {
    const current = graph.types!.findIndex((type) => type.signature === signature);
    if (current >= 0) return current;
    graph.types!.push({ signature });
    return graph.types!.length - 1;
  };
  const valueType = ensureType(preset.signature);
  const intType = ensureType("int");
  node.configuration = {
    ...(node.configuration ?? {}),
    pointer: { value: [preset.pointer] },
    type: { value: [valueType] },
  };
  node.values = {
    ...(node.values ?? {}),
    material: { type: intType, value: [materialIndex] },
    ...(declaration.op === "pointer/get"
      ? {}
      : {
          value:
            node.values?.value?.node === undefined
              ? { type: valueType, value: defaultInteractivityValue(preset.signature) }
              : { ...node.values.value, type: valueType },
        }),
  };
  return true;
}

function defaultInteractivityValue(
  signature: InteractivityMaterialPointerPreset["signature"],
): KhrInteractivityJsonValue[] {
  if (signature === "bool") return [false];
  const length = signature === "float2" ? 2 : signature === "float3" ? 3 : signature === "float4" ? 4 : 1;
  return Array.from({ length }, () => 0);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneKhrInteractivityExtension(
  extension: KhrInteractivityExtension,
): KhrInteractivityExtension {
  return cloneJson(extension);
}

export function readInteractivityNodePosition(
  node: KhrInteractivityNode,
  fallbackIndex: number,
): { x: number; y: number } {
  const studio = node.extras?.xriftStudio;
  if (
    studio &&
    typeof studio === "object" &&
    !Array.isArray(studio) &&
    Array.isArray(studio.position) &&
    studio.position.length === 2 &&
    studio.position.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return { x: studio.position[0] as number, y: studio.position[1] as number };
  }
  return { x: 80 + (fallbackIndex % 4) * 260, y: 80 + Math.floor(fallbackIndex / 4) * 190 };
}

export function writeInteractivityNodePosition(
  node: KhrInteractivityNode,
  position: { x: number; y: number },
): KhrInteractivityNode {
  const priorStudio = node.extras?.xriftStudio;
  const xriftStudio =
    priorStudio && typeof priorStudio === "object" && !Array.isArray(priorStudio)
      ? priorStudio
      : {};
  return {
    ...node,
    extras: {
      ...(node.extras ?? {}),
      xriftStudio: {
        ...xriftStudio,
        position: [position.x, position.y],
      },
    },
  };
}

function nodeWithPosition(
  node: KhrInteractivityNode,
  x: number,
  y: number,
): KhrInteractivityNode {
  return writeInteractivityNodePosition(node, { x, y });
}

/** The Khronos specification's onStart -> animation/start shape, with animation 0. */
export function createDefaultKhrInteractivityExtension(): KhrInteractivityExtension {
  return {
    graph: 0,
    graphs: [
      {
        name: "Animation on start",
        types: [{ signature: "float" }, { signature: "int" }],
        declarations: [
          { op: "event/onStart" },
          { op: "math/Inf" },
          { op: "animation/start" },
        ],
        nodes: [
          nodeWithPosition(
            { declaration: 0, flows: { out: { node: 2 } } },
            80,
            160,
          ),
          nodeWithPosition({ declaration: 1 }, 330, 330),
          nodeWithPosition(
            {
              declaration: 2,
              values: {
                animation: { type: 1, value: [0] },
                startTime: { type: 0, value: [0] },
                endTime: { node: 1 },
                speed: { type: 0, value: [1] },
              },
            },
            590,
            160,
          ),
        ],
      },
    ],
  };
}

/**
 * Resolves animation indices started by the selected graph's event/onStart
 * flow. This is the intentionally small runtime bridge used by the Studio
 * guide: the graph remains canonical KHR_interactivity data while Play can
 * demonstrate its direct animation/start behavior.
 */
export function getKhrInteractivityOnStartAnimationIndices(
  value: unknown,
): number[] {
  const extension = parseKhrInteractivityExtension(value);
  if (!extension) return [];
  const graph = extension.graphs[extension.graph ?? 0];
  const declarations = graph?.declarations ?? [];
  const nodes = graph?.nodes ?? [];
  const startNodes = nodes.flatMap((node, nodeIndex) =>
    declarations[node.declaration]?.op === "event/onStart" ? [nodeIndex] : [],
  );
  const pending = [...startNodes];
  const visited = new Set<number>();
  const animationIndices = new Set<number>();
  while (pending.length > 0) {
    const nodeIndex = pending.shift();
    if (nodeIndex === undefined || visited.has(nodeIndex)) continue;
    visited.add(nodeIndex);
    const node = nodes[nodeIndex];
    if (!node) continue;
    if (declarations[node.declaration]?.op === "animation/start") {
      const animationIndex = node.values?.animation?.value?.[0];
      if (
        typeof animationIndex === "number" &&
        Number.isInteger(animationIndex) &&
        animationIndex >= 0
      ) {
        animationIndices.add(animationIndex);
      }
    }
    for (const flow of Object.values(node.flows ?? {})) {
      if (!visited.has(flow.node)) pending.push(flow.node);
    }
  }
  return [...animationIndices].sort((left, right) => left - right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isJsonPointer(value: string): boolean {
  return value === "" || (value.startsWith("/") && !/~(?![01])/u.test(value));
}

function expectedValueLength(signature: string): number | null {
  switch (signature) {
    case "bool":
    case "float":
    case "int":
    case "ref":
      return 1;
    case "float2":
    case "float2x2":
      return signature === "float2" ? 2 : 4;
    case "float3":
      return 3;
    case "float4":
      return 4;
    case "float3x3":
      return 9;
    case "float4x4":
      return 16;
    default:
      return null;
  }
}

export function parseKhrInteractivityExtension(
  value: unknown,
): KhrInteractivityExtension | null {
  const diagnostics = validateKhrInteractivityExtension(value);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return null;
  return cloneJson(value) as KhrInteractivityExtension;
}

export function validateKhrInteractivityExtension(
  value: unknown,
): InteractivityDiagnostic[] {
  const diagnostics: InteractivityDiagnostic[] = [];
  const error = (path: string, message: string) =>
    diagnostics.push({ severity: "error", path, message });
  const warning = (path: string, message: string) =>
    diagnostics.push({ severity: "warning", path, message });

  if (!isRecord(value)) {
    error("$", "KHR_interactivity must be an object");
    return diagnostics;
  }
  if (!Array.isArray(value.graphs) || value.graphs.length === 0) {
    error("$.graphs", "graphs must contain at least one behavior graph");
    return diagnostics;
  }
  if (value.graphs.length > 64) error("$.graphs", "XRift Studio supports up to 64 graphs per asset");
  if (
    value.graph !== undefined &&
    (!isNonNegativeInteger(value.graph) || value.graph >= value.graphs.length)
  ) {
    error("$.graph", "default graph index is out of range");
  }

  value.graphs.forEach((candidate, graphIndex) => {
    const graphPath = `$.graphs[${graphIndex}]`;
    if (!isRecord(candidate)) {
      error(graphPath, "graph must be an object");
      return;
    }
    const types = candidate.types;
    const declarations = candidate.declarations;
    const nodes = candidate.nodes;
    if (types !== undefined && (!Array.isArray(types) || types.length === 0)) {
      error(`${graphPath}.types`, "types must be omitted or contain at least one type");
    }
    if (Array.isArray(types)) {
      const seenSignatures = new Set<string>();
      types.forEach((type, typeIndex) => {
        if (!isRecord(type) || typeof type.signature !== "string" || !type.signature) {
          error(`${graphPath}.types[${typeIndex}]`, "type signature is required");
          return;
        }
        if (!KHR_INTERACTIVITY_TYPE_SIGNATURES.has(type.signature)) {
          error(`${graphPath}.types[${typeIndex}].signature`, `unsupported type signature ${type.signature}`);
        }
        if (type.signature !== "custom" && seenSignatures.has(type.signature)) {
          error(`${graphPath}.types[${typeIndex}].signature`, `duplicate type signature ${type.signature}`);
        }
        seenSignatures.add(type.signature);
      });
    }

    const validateTypedValue = (
      candidateValue: unknown,
      typeIndex: unknown,
      path: string,
    ) => {
      if (!isNonNegativeInteger(typeIndex) || !Array.isArray(types) || typeIndex >= types.length) {
        error(`${path}.type`, "value type index is out of range");
        return;
      }
      if (!Array.isArray(candidateValue) || candidateValue.length === 0) {
        error(`${path}.value`, "value must be a non-empty array");
        return;
      }
      const type = types[typeIndex];
      if (!isRecord(type) || typeof type.signature !== "string") return;
      const length = expectedValueLength(type.signature);
      if (length !== null && candidateValue.length !== length) {
        error(`${path}.value`, `${type.signature} requires exactly ${length} value(s)`);
        return;
      }
      if (type.signature === "bool" && candidateValue.some((entry) => typeof entry !== "boolean")) {
        error(`${path}.value`, "bool values must contain JSON booleans");
      } else if (
        type.signature === "int" &&
        candidateValue.some(
          (entry) =>
            !Number.isInteger(entry) || Number(entry) < -2147483648 || Number(entry) > 2147483647,
        )
      ) {
        error(`${path}.value`, "int values must contain signed 32-bit integers");
      } else if (type.signature === "ref") {
        if (
          candidateValue.some(
            (entry) => typeof entry !== "string" || !isJsonPointer(entry),
          )
        ) {
          error(`${path}.value`, "ref values must contain a valid static JSON Pointer");
        }
      } else if (
        type.signature.startsWith("float") &&
        candidateValue.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
      ) {
        error(`${path}.value`, `${type.signature} values must contain finite JSON numbers`);
      }
    };

    const variables = candidate.variables;
    if (variables !== undefined && (!Array.isArray(variables) || variables.length === 0)) {
      error(`${graphPath}.variables`, "variables must be omitted or contain at least one variable");
    }
    if (Array.isArray(variables)) {
      variables.forEach((variable, variableIndex) => {
        const variablePath = `${graphPath}.variables[${variableIndex}]`;
        if (!isRecord(variable)) {
          error(variablePath, "variable must be an object");
          return;
        }
        if (!isNonNegativeInteger(variable.type) || !Array.isArray(types) || variable.type >= types.length) {
          error(`${variablePath}.type`, "variable type index is out of range");
        } else if (variable.value !== undefined) {
          validateTypedValue(variable.value, variable.type, variablePath);
        }
      });
    }

    const events = candidate.events;
    if (events !== undefined && (!Array.isArray(events) || events.length === 0)) {
      error(`${graphPath}.events`, "events must be omitted or contain at least one event");
    }
    if (Array.isArray(events)) {
      const eventIds = new Set<string>();
      events.forEach((event, eventIndex) => {
        const eventPath = `${graphPath}.events[${eventIndex}]`;
        if (!isRecord(event)) {
          error(eventPath, "event must be an object");
          return;
        }
        if (event.id !== undefined && typeof event.id !== "string") {
          error(`${eventPath}.id`, "event id must be a string");
        } else if (typeof event.id === "string") {
          if (eventIds.has(event.id)) error(`${eventPath}.id`, `duplicate event id ${event.id}`);
          eventIds.add(event.id);
        }
        if (event.values !== undefined && !isRecord(event.values)) {
          error(`${eventPath}.values`, "event values must be an object");
        } else if (isRecord(event.values)) {
          for (const [socket, socketValue] of Object.entries(event.values)) {
            const socketPath = `${eventPath}.values.${socket}`;
            if (socket === "event") error(socketPath, "event is a reserved event value socket id");
            if (!isRecord(socketValue)) {
              error(socketPath, "event value socket must be an object");
              continue;
            }
            if (
              !isNonNegativeInteger(socketValue.type) ||
              !Array.isArray(types) ||
              socketValue.type >= types.length
            ) {
              error(`${socketPath}.type`, "event value type index is out of range");
            } else if (socketValue.value !== undefined) {
              validateTypedValue(socketValue.value, socketValue.type, socketPath);
            }
          }
        }
      });
    }
    if (declarations !== undefined && (!Array.isArray(declarations) || declarations.length === 0)) {
      error(`${graphPath}.declarations`, "declarations must be omitted or contain at least one declaration");
    }
    if (Array.isArray(declarations)) {
      declarations.forEach((declaration, declarationIndex) => {
        if (!isRecord(declaration) || typeof declaration.op !== "string" || !declaration.op) {
          error(`${graphPath}.declarations[${declarationIndex}]`, "operation id is required");
          return;
        }
        if (!KHR_INTERACTIVITY_CORE_OPERATIONS.has(declaration.op) && !declaration.extension) {
          error(
            `${graphPath}.declarations[${declarationIndex}].op`,
            `Operation ${declaration.op} is not defined by KHR_interactivity and requires extension`,
          );
        } else if (!getInteractivityOperationTemplate(declaration.op)) {
          warning(
            `${graphPath}.declarations[${declarationIndex}].op`,
            `Operation ${declaration.op} is preserved generically; no dedicated XRift editor template is installed`,
          );
        }
        if (
          !declaration.extension &&
          (declaration.inputValueSockets !== undefined || declaration.outputValueSockets !== undefined)
        ) {
          error(
            `${graphPath}.declarations[${declarationIndex}]`,
            "core KHR_interactivity declarations must not redefine value sockets",
          );
        }
        for (const property of ["inputValueSockets", "outputValueSockets"] as const) {
          const sockets = declaration[property];
          if (sockets === undefined) continue;
          if (!isRecord(sockets) || Object.keys(sockets).length === 0) {
            error(`${graphPath}.declarations[${declarationIndex}].${property}`, "socket declarations must be a non-empty object");
            continue;
          }
          for (const [socket, definition] of Object.entries(sockets)) {
            if (
              !isRecord(definition) ||
              !isNonNegativeInteger(definition.type) ||
              !Array.isArray(types) ||
              definition.type >= types.length
            ) {
              error(`${graphPath}.declarations[${declarationIndex}].${property}.${socket}.type`, "socket type index is out of range");
            }
          }
        }
      });
    }
    if (nodes !== undefined && (!Array.isArray(nodes) || nodes.length === 0)) {
      error(`${graphPath}.nodes`, "nodes must be omitted or contain at least one node");
      return;
    }
    if (!Array.isArray(nodes)) return;
    if (!Array.isArray(declarations)) {
      error(`${graphPath}.declarations`, "nodes require declarations");
      return;
    }
    if (nodes.length > 1024) error(`${graphPath}.nodes`, "XRift Studio supports up to 1024 nodes per graph");

    const flowEdges = new Map<number, number[]>();
    nodes.forEach((node, nodeIndex) => {
      const nodePath = `${graphPath}.nodes[${nodeIndex}]`;
      if (!isRecord(node) || !isNonNegativeInteger(node.declaration)) {
        error(nodePath, "node declaration index is required");
        return;
      }
      if (node.declaration >= declarations.length) {
        error(`${nodePath}.declaration`, "declaration index is out of range");
      }
      if (node.configuration !== undefined) {
        if (!isRecord(node.configuration) || Object.keys(node.configuration).length === 0) {
          error(`${nodePath}.configuration`, "configuration must be a non-empty object");
        } else {
          for (const [property, configured] of Object.entries(node.configuration)) {
            if (
              !isRecord(configured) ||
              !Array.isArray(configured.value) ||
              configured.value.length === 0
            ) {
              error(`${nodePath}.configuration.${property}.value`, "configuration value must be a non-empty array");
            }
          }
        }
      }
      if (isRecord(node.values)) {
        for (const [socket, input] of Object.entries(node.values)) {
          if (!isRecord(input)) {
            error(`${nodePath}.values.${socket}`, "value socket must be an object");
            continue;
          }
          const hasNode = input.node !== undefined;
          const hasValue = input.value !== undefined;
          if (hasNode && hasValue) {
            error(`${nodePath}.values.${socket}`, "value socket cannot contain both node and inline value");
          }
          if (hasNode && (!isNonNegativeInteger(input.node) || input.node >= nodeIndex)) {
            error(`${nodePath}.values.${socket}.node`, "value source must reference an earlier node");
          }
          if (hasValue) {
            validateTypedValue(input.value, input.type, `${nodePath}.values.${socket}`);
          } else if (!hasNode) {
            if (!isNonNegativeInteger(input.type) || !Array.isArray(types) || input.type >= types.length) {
              error(`${nodePath}.values.${socket}.type`, "type-default value requires a valid type index");
            }
          } else if (
            input.type !== undefined &&
            (!isNonNegativeInteger(input.type) || !Array.isArray(types) || input.type >= types.length)
          ) {
            error(`${nodePath}.values.${socket}.type`, "connected value type index is out of range");
          }
        }
      }
      if (isRecord(node.flows)) {
        for (const [socket, target] of Object.entries(node.flows)) {
          if (!isRecord(target) || !isNonNegativeInteger(target.node) || target.node <= nodeIndex || target.node >= nodes.length) {
            error(`${nodePath}.flows.${socket}.node`, "flow target must reference a later node");
            continue;
          }
          const targets = flowEdges.get(nodeIndex) ?? [];
          targets.push(target.node);
          flowEdges.set(nodeIndex, targets);
        }
      }
    });

    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (nodeIndex: number): boolean => {
      if (visiting.has(nodeIndex)) return true;
      if (visited.has(nodeIndex)) return false;
      visiting.add(nodeIndex);
      const cyclic = (flowEdges.get(nodeIndex) ?? []).some(visit);
      visiting.delete(nodeIndex);
      visited.add(nodeIndex);
      return cyclic;
    };
    if (nodes.some((_, nodeIndex) => visit(nodeIndex))) {
      error(`${graphPath}.nodes`, "behavior graph flow contains a cycle");
    }
  });
  return diagnostics;
}

export function addDefaultInteractivityAsset(
  manifest: AssetManifest,
  input: { id: string; name: string; folderId: string | null },
): { manifest: AssetManifest; assetId: string; added: boolean } {
  const id = input.id.trim();
  const name = input.name.trim();
  if (
    !id ||
    !name ||
    manifest.assets[id] ||
    (input.folderId && !manifest.folders?.[input.folderId])
  ) {
    return { manifest, assetId: id || input.id, added: false };
  }
  const siblingOrders = Object.values(manifest.assets)
    .filter((asset) => (asset.folderId ?? null) === input.folderId)
    .map((asset) => asset.order ?? -1);
  const asset: InteractivityAsset = {
    id,
    name,
    kind: "interactivity",
    status: "ready",
    source: { kind: "document" },
    thumbnail: { status: "missing" },
    folderId: input.folderId,
    order: Math.max(-1, ...siblingOrders) + 1,
    extensionName: KHR_INTERACTIVITY_EXTENSION_NAME,
    specStatus: KHR_INTERACTIVITY_SPEC_STATUS,
    extension: createDefaultKhrInteractivityExtension(),
  };
  return {
    manifest: {
      ...manifest,
      assets: { ...manifest.assets, [id]: asset },
    },
    assetId: id,
    added: true,
  };
}

export function updateInteractivityAsset(
  manifest: AssetManifest,
  assetId: string,
  extension: KhrInteractivityExtension,
): AssetManifest {
  const asset = manifest.assets[assetId];
  if (asset?.kind !== "interactivity") return manifest;
  if (validateKhrInteractivityExtension(extension).some((item) => item.severity === "error")) {
    return manifest;
  }
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, extension: cloneKhrInteractivityExtension(extension) },
    },
  };
}
