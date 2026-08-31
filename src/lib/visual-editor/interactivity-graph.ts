import { isRecord } from "../json-guards";
import {
  getInteractivityRuntimeSupport as getRuntimeSupport,
  parseEasing,
  walkOnStart,
  type InteractivityEasing,
  type InteractivityRuntimeSupport,
} from "../../../packages/xrift-studio-runtime/src/interactivity-adapter";
import {
  collectXriftInteractionIssues,
  getXriftInteractionProperty,
  xriftInteractionEnumIndex,
  XRIFT_INTERACTION_EXTENSION_NAME,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger";
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
  /**
   * glTF extension that defines this operation.
   *
   * Present only for XRift's own operations. KHR_interactivity requires an
   * extension-defined declaration to name it, and the validator rejects a
   * non-core `op` without one, so the declaration writer reads it from here
   * rather than from a second list that could fall out of step.
   */
  extension?: string;
  category:
    | "event"
    | "flow"
    | "animation"
    | "variable"
    | "pointer"
    | "math"
    | "entity";
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
  /**
   * True when the factor is a colour rather than a plain vector.
   *
   * The editor needs this to offer a colour picker instead of three or four
   * raw channel fields, and it belongs here rather than in the editor because
   * a preset added later would otherwise silently fall back to raw fields.
   * glTF stores these factors in linear light, not sRGB.
   */
  color?: boolean;
};

/** Mutable glTF material properties exposed by KHR_interactivity pointer nodes. */
export const KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS: readonly InteractivityMaterialPointerPreset[] = [
  { id: "base-color", label: "Base Color", pointer: "/materials/[material]/pbrMetallicRoughness/baseColorFactor", signature: "float4", color: true },
  { id: "metallic", label: "Metallic", pointer: "/materials/[material]/pbrMetallicRoughness/metallicFactor", signature: "float" },
  { id: "roughness", label: "Roughness", pointer: "/materials/[material]/pbrMetallicRoughness/roughnessFactor", signature: "float" },
  { id: "emissive", label: "Emissive", pointer: "/materials/[material]/emissiveFactor", signature: "float3", color: true },
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

/**
 * Two-input arithmetic, comparison and logic, generated from one shape.
 *
 * These all take `a` and `b` and publish `value`, so writing them out by hand
 * would be sixteen copies of the same eight lines and a place for one of them
 * to drift. The socket names match what the engine reads.
 */
const MATH_PAIR_OPERATIONS: readonly {
  op: string;
  label: string;
  kind: "float" | "bool";
}[] = [
  { op: "math/add", label: "足す", kind: "float" },
  { op: "math/sub", label: "引く", kind: "float" },
  { op: "math/mul", label: "掛ける", kind: "float" },
  { op: "math/div", label: "割る", kind: "float" },
  { op: "math/min", label: "小さいほう", kind: "float" },
  { op: "math/max", label: "大きいほう", kind: "float" },
  { op: "math/eq", label: "等しい", kind: "float" },
  { op: "math/lt", label: "より小さい", kind: "float" },
  { op: "math/le", label: "以下", kind: "float" },
  { op: "math/gt", label: "より大きい", kind: "float" },
  { op: "math/ge", label: "以上", kind: "float" },
  { op: "math/and", label: "かつ", kind: "bool" },
  { op: "math/or", label: "または", kind: "bool" },
];

const MATH_OPERATION_TEMPLATES: InteractivityOperationTemplate[] = [
  ...MATH_PAIR_OPERATIONS.map((entry) => ({
    op: entry.op,
    label: entry.label,
    category: "math" as const,
    flowInputs: [],
    flowOutputs: [],
    valueInputs: ["a", "b"],
    valueOutputs: ["value"],
    createNode: (types: Record<string, number>) => ({
      values: {
        a: { type: types[entry.kind], value: [entry.kind === "bool" ? false : 0] },
        b: { type: types[entry.kind], value: [entry.kind === "bool" ? false : 0] },
      },
    }),
  })),
  {
    op: "math/not",
    label: "否定",
    category: "math",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: ["a"],
    valueOutputs: ["value"],
    createNode: (types) => ({ values: { a: { type: types.bool, value: [false] } } }),
  },
  {
    op: "math/random",
    label: "乱数",
    category: "math",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: [],
    valueOutputs: ["value"],
  },
  {
    op: "math/mix",
    label: "2つの値を混ぜる",
    category: "math",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: ["a", "b", "c"],
    valueOutputs: ["value"],
    createNode: (types) => ({
      values: {
        a: { type: types.float, value: [0] },
        b: { type: types.float, value: [1] },
        c: { type: types.float, value: [0.5] },
      },
    }),
  },
  {
    op: "math/clamp",
    label: "範囲に収める",
    category: "math",
    flowInputs: [],
    flowOutputs: [],
    valueInputs: ["a", "b", "c"],
    valueOutputs: ["value"],
    createNode: (types) => ({
      values: {
        a: { type: types.float, value: [0] },
        b: { type: types.float, value: [0] },
        c: { type: types.float, value: [1] },
      },
    }),
  },
];

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
    // Without a declared socket the Inspector has nothing to edit and the
    // adapter has no condition to read, so a branch could only ever be
    // unevaluable. The default picks `false` explicitly rather than leaving
    // the taken side undefined.
    createNode: (types) => ({
      values: { condition: { type: types.bool, value: [false] } },
    }),
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
    op: XRIFT_INTERACTION_OPERATIONS.onInteract,
    label: "インタラクトされたとき",
    category: "event",
    extension: XRIFT_INTERACTION_EXTENSION_NAME,
    flowInputs: [],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: [],
  },
  {
    op: XRIFT_INTERACTION_OPERATIONS.setProperty,
    label: "プロパティを変える",
    category: "entity",
    extension: XRIFT_INTERACTION_EXTENSION_NAME,
    flowInputs: ["in"],
    // `out` continues at once; `done` waits for the change to finish, which is
    // what「2秒かけて動かしてから次」needs. Without it the completion the engine
    // already sends had nowhere to go.
    flowOutputs: ["out", "done"],
    valueInputs: ["value", "duration"],
    valueOutputs: [],
    // A new action starts complete: the Entity this graph is attached to, and
    // the one property every Entity has. Naming an id here instead would tie
    // the graph to one Scene before the author had chosen anything. The
    // duration starts at zero, which is an immediate write.
    createNode: (types) => ({
      configuration: {
        entity: { value: [XRIFT_INTERACTION_SELF_ENTITY_ID] },
        component: { value: [""] },
        targetKind: { value: ["entity"] },
        property: { value: ["enabled"] },
      },
      values: {
        value: { type: types.bool, value: [true] },
        duration: { type: types.float, value: [0] },
      },
    }),
  },
  {
    op: XRIFT_INTERACTION_OPERATIONS.toggleProperty,
    label: "プロパティを切り替える",
    category: "entity",
    extension: XRIFT_INTERACTION_EXTENSION_NAME,
    flowInputs: ["in"],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: [],
    createNode: () => ({
      configuration: {
        entity: { value: [""] },
        component: { value: [""] },
        targetKind: { value: ["entity"] },
        property: { value: ["enabled"] },
      },
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
  {
    op: "event/receive",
    label: "イベントを受け取る",
    category: "event",
    flowInputs: [],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: [],
  },
  {
    op: "event/send",
    label: "イベントを送る",
    category: "event",
    flowInputs: ["in"],
    flowOutputs: ["out"],
    valueInputs: [],
    valueOutputs: [],
  },
  {
    op: "flow/sequence",
    label: "順番に実行",
    category: "flow",
    flowInputs: ["in"],
    // Three outputs is what makes the node usable without a socket editor. The
    // engine runs whatever is connected, in socket-name order, so adding a
    // fourth later does not change what an existing graph does.
    flowOutputs: ["0", "1", "2"],
    valueInputs: [],
    valueOutputs: [],
  },
  {
    op: "flow/doN",
    label: "N回だけ通す",
    category: "flow",
    flowInputs: ["in", "reset"],
    flowOutputs: ["out"],
    valueInputs: ["n"],
    valueOutputs: ["currentCount"],
    createNode: (types) => ({ values: { n: { type: types.int, value: [1] } } }),
  },
  {
    op: "flow/for",
    label: "回数で繰り返す",
    category: "flow",
    flowInputs: ["in"],
    flowOutputs: ["loopBody", "completed"],
    valueInputs: ["startIndex", "endIndex"],
    valueOutputs: ["index"],
    createNode: (types) => ({
      values: {
        startIndex: { type: types.int, value: [0] },
        endIndex: { type: types.int, value: [3] },
      },
    }),
  },
  {
    op: "flow/while",
    label: "条件の間くり返す",
    category: "flow",
    flowInputs: ["in"],
    flowOutputs: ["loopBody", "completed"],
    valueInputs: ["condition"],
    valueOutputs: [],
    createNode: (types) => ({
      values: { condition: { type: types.bool, value: [false] } },
    }),
  },
  {
    op: "flow/multiGate",
    label: "順番に切り替え",
    category: "flow",
    flowInputs: ["in", "reset"],
    flowOutputs: ["0", "1", "2"],
    valueInputs: [],
    valueOutputs: [],
  },
  {
    op: "flow/waitAll",
    label: "すべて揃うまで待つ",
    category: "flow",
    flowInputs: ["0", "1", "reset"],
    flowOutputs: ["completed", "out"],
    valueInputs: [],
    valueOutputs: ["remainingInputs"],
  },
  {
    op: "flow/throttle",
    label: "連続実行を防ぐ",
    category: "flow",
    flowInputs: ["in", "reset"],
    flowOutputs: ["out", "err"],
    valueInputs: ["duration"],
    valueOutputs: ["lastRemainingTime"],
    createNode: (types) => ({
      values: { duration: { type: types.float, value: [1] } },
    }),
  },
  {
    op: "flow/cancelDelay",
    label: "待機を取り消す",
    category: "flow",
    flowInputs: ["in"],
    flowOutputs: ["out"],
    valueInputs: ["delay"],
    valueOutputs: [],
    createNode: (types) => ({ values: { delay: { type: types.int, value: [0] } } }),
  },
  {
    op: "flow/switch",
    label: "値で分岐",
    category: "flow",
    flowInputs: ["in"],
    flowOutputs: ["0", "1", "default"],
    valueInputs: ["selection"],
    valueOutputs: [],
    createNode: (types) => ({
      values: { selection: { type: types.int, value: [0] } },
    }),
  },
  {
    op: "animation/stopAt",
    label: "時間を指定して停止",
    category: "animation",
    flowInputs: ["in"],
    flowOutputs: ["out", "err", "done"],
    valueInputs: ["animation", "stopTime"],
    valueOutputs: [],
    createNode: (types) => ({
      values: {
        animation: { type: types.int },
        stopTime: { type: types.float, value: [0] },
      },
    }),
  },
  {
    op: "variable/interpolate",
    label: "変数をゆっくり変える",
    category: "variable",
    flowInputs: ["in"],
    flowOutputs: ["out", "err", "done"],
    valueInputs: ["value", "duration"],
    valueOutputs: [],
    createNode: (types) => ({
      values: {
        value: { type: types.float, value: [1] },
        duration: { type: types.float, value: [1] },
      },
    }),
  },
  ...MATH_OPERATION_TEMPLATES,
];

export function getInteractivityOperationTemplate(
  op: string,
): InteractivityOperationTemplate | undefined {
  return KHR_INTERACTIVITY_OPERATION_TEMPLATES.find(
    (template) => template.op === op,
  );
}

/**
 * How far the Play runtime adapter actually implements one operation.
 *
 * - `executed`: the adapter runs it and continues along its flow outputs.
 * - `conditional`: the adapter runs it only for the inputs named in `note`.
 * - `ignored`: the operation stays in the canonical JSON and does nothing.
 *
 * `ignored` is the boundary documented in `docs/KHR_INTERACTIVITY_EDITOR.md`:
 * an unimplemented operation must behave as a no-op instead of being
 * translated into arbitrary JavaScript. A no-op node produces no flow output
 * either, so the adapter stops there rather than running the rest of the chain
 * as though the skipped node had succeeded.
 */
export type InteractivityRuntimeAdapterEntry = {
  support: InteractivityRuntimeSupport;
  /** Shown verbatim in the Editor diagnostics panel and in publish diagnostics. */
  note: string;
};

const KHR_INTERACTIVITY_IGNORED_FLOW_NOTE =
  "Play の実行エンジンが未対応の operation です。この node と、ここから先の flow は動きません。canonical JSON には保存され、公開先でも同じく何も起きません。";

/**
 * Why an operation reads the way it does in the Editor.
 *
 * The classification itself comes from the runtime package, so this table only
 * has to explain it. An operation missing here still gets the right support
 * from the shared table and a generic note, which is what keeps a newly
 * adapted operation from silently reading as unsupported.
 */
const KHR_INTERACTIVITY_RUNTIME_NOTES: Readonly<Record<string, string>> = {
  "event/onStart": "Play の開始時に、この node から flow を辿ります。",
  "event/onTick": "毎フレーム、この node から flow を辿ります。",
  "event/receive": "同じ Asset の `event/send` が送ったイベントを受け取ります。",
  "event/send":
    "名前付きイベントを送ります。同じ Asset の `event/receive` が受け取り、Scene 側へも通知します。",
  "flow/setDelay":
    "`out` は待たずに続き、`done` は duration 秒後に続きます。`cancel` で待機を取り消せます。",
  "flow/sequence": "接続した出力を、番号順に上から実行します。",
  "flow/doN": "この node を通る回数を n 回までに制限します。`reset` で数え直します。",
  "flow/for": "startIndex から endIndex まで、`loopBody` を繰り返します。",
  "flow/while": "condition が true の間、`loopBody` を繰り返します。",
  "flow/multiGate": "通るたびに、接続した出力を順番に切り替えます。",
  "flow/waitAll": "接続したすべての入力が揃ってから `completed` へ進みます。",
  "flow/throttle": "duration 秒の間、2 回目以降の入力を `err` へ流します。",
  "animation/start":
    "Model の animation を再生します。対象の Model を持つ Entity へ接続されている必要があります。",
  "animation/stop":
    "再生中の animation を止めます。対象の Model を持つ Entity へ接続されている必要があります。",
  "pointer/set":
    "glTF の値を書き換えます。対象を解決できる Entity または Material へ接続されている必要があります。",
  "pointer/interpolate":
    "glTF の値を duration 秒かけて変えます。対象を解決できる接続が必要です。",
  "pointer/get": "glTF の値を読み取ります。",
  [XRIFT_INTERACTION_OPERATIONS.onInteract]:
    "このグラフをInteraction ComponentでEntityへ接続し、そのEntityに公式のInteractableがあるときに動きます。",
  [XRIFT_INTERACTION_OPERATIONS.setProperty]:
    "対象Entity、Component、プロパティへ値を書き込みます。duration を指定すると、その秒数をかけて変化させます。",
  [XRIFT_INTERACTION_OPERATIONS.toggleProperty]:
    "対象のON/OFFを、通るたびに反転します。切り替えられるのはON/OFFのプロパティだけです。",
};

/**
 * Why an operation the interpreter knows still does not run.
 *
 * Kept apart from {@link KHR_INTERACTIVITY_RUNTIME_NOTES}, which says what an
 * operation does when it runs. Reading the wrong one printed "glTF の値を
 * 書き換えます" under a「Play未対応」badge — the exact contradiction the badge
 * exists to prevent.
 */
const KHR_INTERACTIVITY_UNSUPPORTED_NOTES: Readonly<Record<string, string>> = {
  "pointer/get":
    "glTF Object Model の pointer を解決する接続がまだないため、Play と公開先では動きません。Entity や Material を変えるには「プロパティを変える」を使ってください。",
  "pointer/set":
    "glTF Object Model の pointer を解決する接続がまだないため、Play と公開先では動きません。Entity や Material を変えるには「プロパティを変える」を使ってください。",
  "pointer/interpolate":
    "glTF Object Model の pointer を解決する接続がまだないため、Play と公開先では動きません。時間をかけた変化は「プロパティを変える」の「かける時間」で作れます。",
};

export function getInteractivityRuntimeSupport(
  op: string,
): InteractivityRuntimeAdapterEntry {
  const support = getRuntimeSupport(op);
  if (support === "ignored") {
    return {
      support,
      note:
        KHR_INTERACTIVITY_UNSUPPORTED_NOTES[op] ??
        KHR_INTERACTIVITY_IGNORED_FLOW_NOTE,
    };
  }
  return {
    support,
    note:
      KHR_INTERACTIVITY_RUNTIME_NOTES[op] ??
      "Play の実行エンジンがこの operation を実行します。",
  };
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
/**
 * What a new graph starts as: one「開始時」node and nothing else.
 *
 * It used to start as `event/onStart` → `animation/start`, named "Animation on
 * start". That is a fine sample and a bad default: `animation/start` needs a
 * Model with clips on the Entity, so a fresh graph opened with a node already
 * marked「接続が必要」, and the graph list said "Animation on start" for a graph
 * that had nothing to do with animation. A single entry point makes no promise
 * the Scene has not kept.
 */
export function createDefaultKhrInteractivityExtension(): KhrInteractivityExtension {
  return {
    graph: 0,
    graphs: [
      {
        name: "メイン",
        declarations: [{ op: "event/onStart" }],
        nodes: [nodeWithPosition({ declaration: 0 }, 120, 160)],
      },
    ],
  };
}

/**
 * The Play preview and the published runtime share one walk.
 *
 * Keeping a second copy here is what let the Editor and the published world
 * drift apart, so the behaviour lives in the runtime package and this module
 * only adds the Japanese notes the Editor shows. `walkOnStart` reads untrusted
 * JSON structurally, which is also what the Editor needs: a graph is diagnosed
 * while the author is still building it, before it validates.
 */
export type {
  InteractivityAnimationCue,
  InteractivityAnimationPlan,
  InteractivityRuntimeSupport,
} from "../../../packages/xrift-studio-runtime/src/interactivity-adapter";
export {
  applyEasing,
  dryRunInteractivityGraph,
  getKhrInteractivityOnStartAnimationCues,
  planInteractivityAnimationCues,
  INTERACTIVITY_EASINGS,
} from "../../../packages/xrift-studio-runtime/src/interactivity-adapter";
export type { InteractivityEasing } from "../../../packages/xrift-studio-runtime/src/interactivity-adapter";
export type {
  InteractivityDryRun,
  InteractivityScheduleEntry,
} from "../../../packages/xrift-studio-runtime/src/interactivity-adapter";
export {
  collectXriftInteractionActions,
  collectXriftInteractionAssetIds,
  collectXriftInteractionIssues,
  collectXriftInteractionPrograms,
  getXriftInteractionProperties,
  getXriftInteractionProperty,
  hasXriftInteractionRuntimeWork,
  hasXriftInteractionTrigger,
  hasXriftSelfStartingEntry,
  xriftInteractionEnumIndex,
  XRIFT_INTERACTION_EXTENSION_NAME,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_PROPERTIES,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  XRIFT_INTERACTION_SCENE_ENTITY_ID,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  XRIFT_INTERACTION_TARGET_KINDS,
  XRIFT_INTERACTION_TARGET_LABELS,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger";
export type {
  XriftInteractionAction,
  XriftInteractionProgram,
  XriftInteractionPropertyDescriptor,
  XriftInteractionPropertyKind,
  XriftInteractionTargetKind,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger";


/**
 * Animation indices started by the selected graph, ignoring their delays.
 *
 * Kept for callers that only need the clip set; the delay-aware
 * {@link getKhrInteractivityOnStartAnimationCues} is what Play uses.
 */
/**
 * Why the engine refused to run a node, in the words the Editor shows.
 *
 * The reasons come from the interpreter itself rather than from a second guess
 * made here, so the Editor cannot report a node as fine while Play quietly
 * skips it.
 */
const RUNTIME_ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  "missing-declaration":
    "declaration を解決できないため、この node と、ここから先の flow は動きません。",
  "unsupported-operation":
    "Play の実行エンジンが未対応の operation です。この node と、ここから先の flow は動きません。",
  "unsupported-by-host":
    "この操作に必要な接続がありません。対象の Entity・Model・Material へ接続すると動きます。",
  "value-cycle":
    "value の接続が循環しています。循環した socket は評価できないため、この入力は使われません。",
  "invalid-input":
    "入力値をこの操作に使えません。値を確認してください。",
  "budget-exceeded":
    "1 フレームで実行できる回数の上限に達しました。繰り返しの回数か条件を見直してください。",
};

/**
 * Reports every node the runtime will not run.
 *
 * The Editor diagnostics panel, the compiler, and MCP validation all call this
 * so an unsupported operation reads the same way while authoring and after
 * publishing. These are warnings: an unsupported operation is a documented
 * boundary, not a broken graph, and it must stay serialized in the canonical
 * JSON either way.
 */
export function collectInteractivityRuntimeDiagnostics(
  value: unknown,
): InteractivityDiagnostic[] {
  const extension = parseKhrInteractivityExtension(value);
  if (!extension) return [];
  const diagnostics: InteractivityDiagnostic[] = [];
  const reported = new Set<string>();
  const push = (path: string, message: string) => {
    const key = `${path}|${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    diagnostics.push({ severity: "warning", path, message });
  };

  extension.graphs.forEach((graph, graphIndex) => {
    const declarations = graph.declarations ?? [];
    (graph.nodes ?? []).forEach((node, nodeIndex) => {
      const op = declarations[node.declaration]?.op;
      if (!op) return;
      const entry = getInteractivityRuntimeSupport(op);
      if (entry.support !== "ignored") return;
      push(`$.graphs[${graphIndex}].nodes[${nodeIndex}]`, `${op}: ${entry.note}`);
    });
  });

  // An Interaction Trigger action is not unsupported, it is unfinished: the
  // author still has to say which Entity and property it writes. Reporting it
  // here puts it in the same list as everything else Play will not run.
  for (const issue of collectXriftInteractionIssues(value)) {
    push(
      `$.graphs[${issue.graphIndex}].nodes[${issue.nodeIndex}]`,
      `${issue.op}: ${INTERACTION_ISSUE_MESSAGES[issue.reason]}`,
    );
  }

  // Path-dependent findings come from running the graph, so a node the engine
  // stops at is reported even when its operation is implemented.
  for (const issue of walkOnStart(value).issues) {
    const detail = issue.detail ? `（${issue.detail}）` : "";
    push(
      `$.graphs[${issue.graphIndex}].nodes[${issue.nodeIndex}]`,
      `${issue.op ?? "declaration"}: ${RUNTIME_ISSUE_MESSAGES[issue.reason] ?? issue.reason}${detail}`,
    );
  }
  return diagnostics;
}

const INTERACTION_ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  "incomplete-configuration":
    "対象のEntity・Component・値がまだ決まっていないため、この node と、ここから先の flow は動きません。",
  "unknown-property":
    "このプロパティはPlayと公開先のどちらでも変更できません。対応しているプロパティを選び直してください。",
  "unsupported-toggle":
    "切り替えはON/OFFのプロパティだけに使えます。数値や色は「プロパティを変える」で設定してください。",
};

/**
 * Writes an Interaction Trigger action's target.
 *
 * The selector lives in `configuration` rather than in value sockets because it
 * is structural: which Entity, which Component, which property. The value the
 * action writes stays in the `value` socket, where the KHR type system can
 * check it.
 */
export function configureInteractivityTriggerAction(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  target: {
    entityId: string;
    componentId: string;
    targetKind: XriftInteractionTargetKind;
    property: string;
  },
): boolean {
  const node = graph.nodes?.[nodeIndex];
  const declaration = node ? graph.declarations?.[node.declaration] : undefined;
  const op = declaration?.op;
  if (
    !node ||
    (op !== XRIFT_INTERACTION_OPERATIONS.setProperty &&
      op !== XRIFT_INTERACTION_OPERATIONS.toggleProperty)
  ) {
    return false;
  }
  const descriptor = getXriftInteractionProperty(
    target.targetKind,
    target.property,
  );
  if (!descriptor) return false;
  node.configuration = {
    ...(node.configuration ?? {}),
    entity: { value: [target.entityId] },
    component: { value: [target.componentId] },
    targetKind: { value: [target.targetKind] },
    property: { value: [target.property] },
  };
  if (descriptor.kind === "asset") {
    // An Asset id is configuration, not a socket value, and the key's presence
    // is what tells the runtime this is an Asset write at all. So it is always
    // written — empty until the author picks one, which reads as「元に戻す」.
    node.configuration.asset = { value: [""] };
    delete node.configuration.text;
    if (node.values) delete node.values.value;
    return true;
  }
  if (descriptor.kind === "string") {
    node.configuration.text = { value: [String(descriptor.defaultValue)] };
    delete node.configuration.asset;
    if (node.values) delete node.values.value;
    return true;
  }
  delete node.configuration.asset;
  delete node.configuration.text;
  if (op === XRIFT_INTERACTION_OPERATIONS.setProperty) {
    // The socket's type follows the property, so switching from a number to a
    // colour cannot leave a value the runtime would read as the wrong shape.
    setInteractivityTriggerActionValue(
      graph,
      nodeIndex,
      descriptor,
      defaultTriggerActionValue(descriptor),
    );
  } else if (node.values) {
    delete node.values.value;
  }
  return true;
}

/** The value a freshly targeted action writes, before the author edits it. */
export function defaultTriggerActionValue(
  descriptor: XriftInteractionPropertyDescriptor,
): KhrInteractivityJsonValue[] {
  switch (descriptor.kind) {
    case "bool":
      return [Boolean(descriptor.defaultValue)];
    case "float":
      return [Number(descriptor.defaultValue)];
    case "color":
    case "vector3": {
      const components = descriptor.defaultValue as readonly [number, number, number];
      return [components[0], components[1], components[2]];
    }
    case "enum":
      return [xriftInteractionEnumIndex(descriptor, String(descriptor.defaultValue))];
    case "asset":
    case "string":
      // Both live in `configuration`, not in a socket. A node placed with
      // nothing chosen is still a complete instruction — put the authored
      // value back — rather than an unfinished one.
      return [];
  }
}

/**
 * Points an Asset-valued action at an Asset, or at none.
 *
 * An empty id is a complete instruction rather than an unfinished action: it
 * puts the authored Asset back, which is the other half of「差し替える」.
 */
export function setInteractivityTriggerActionAsset(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  assetId: string,
): boolean {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return false;
  node.configuration = {
    ...(node.configuration ?? {}),
    asset: { value: [assetId] },
  };
  return true;
}

/** Writes the text a text-valued action shows. */
export function setInteractivityTriggerActionText(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  text: string,
): boolean {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return false;
  node.configuration = {
    ...(node.configuration ?? {}),
    text: { value: [text] },
  };
  return true;
}

/** The text a text-valued action shows, for the Editor's field. */
export function readInteractivityTriggerActionText(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): string {
  const entry = graph.nodes?.[nodeIndex]?.configuration?.text?.value?.[0];
  return typeof entry === "string" ? entry : "";
}

/** The Asset an action points at, for the Editor's picker. */
export function readInteractivityTriggerActionAsset(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): string {
  const entry = graph.nodes?.[nodeIndex]?.configuration?.asset?.value?.[0];
  return typeof entry === "string" ? entry : "";
}

/** Writes the action's value socket with the type its property requires. */
export function setInteractivityTriggerActionValue(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  descriptor: XriftInteractionPropertyDescriptor,
  value: KhrInteractivityJsonValue[],
): boolean {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return false;
  graph.types ??= [];
  const signature =
    descriptor.kind === "bool"
      ? "bool"
      : descriptor.kind === "float"
        ? "float"
        : descriptor.kind === "color" || descriptor.kind === "vector3"
          ? "float3"
          : "int";
  const existing = graph.types.findIndex((type) => type.signature === signature);
  const typeIndex = existing >= 0 ? existing : graph.types.push({ signature }) - 1;
  node.values = {
    ...(node.values ?? {}),
    value: { type: typeIndex, value },
  };
  return true;
}

/**
 * How long an action takes, and how the change is distributed over that time.
 *
 * Both live on the node rather than in a second node: "move this over two
 * seconds" is one thought, and splitting it into a write plus an interpolator
 * is what makes a simple sequence read like a circuit diagram.
 */
export function setInteractivityTriggerActionDuration(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  seconds: number,
): boolean {
  const node = graph.nodes?.[nodeIndex];
  if (!node || !Number.isFinite(seconds)) return false;
  graph.types ??= [];
  const existing = graph.types.findIndex((type) => type.signature === "float");
  const typeIndex =
    existing >= 0 ? existing : graph.types.push({ signature: "float" }) - 1;
  node.values = {
    ...(node.values ?? {}),
    duration: { type: typeIndex, value: [Math.max(0, seconds)] },
  };
  return true;
}

/**
 * The clip name a generated animation node was built from.
 *
 * `animation/start` addresses a clip by index, so a graph made from a Model's
 * sixty-four clips is sixty-four cards that read「アニメーション再生」and differ
 * only in a number. The name is written into `extras` at generation time and
 * shown on the card; it is documentation, and nothing reads it at runtime, so a
 * graph whose extras were stripped still plays.
 */
/**
 * A one-line note the generator left on a node, shown under its title.
 *
 * Documentation, not behaviour: nothing reads it at runtime, so a graph whose
 * extras were stripped still does the same thing.
 */
export function readInteractivityNodeNote(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): string | undefined {
  const extras = graph.nodes?.[nodeIndex]?.extras?.xriftStudio;
  if (typeof extras !== "object" || extras === null || Array.isArray(extras)) {
    return undefined;
  }
  const note = (extras as Record<string, unknown>).note;
  return typeof note === "string" && note.trim().length > 0 ? note : undefined;
}

export function readInteractivityClipName(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): string | undefined {
  const extras = graph.nodes?.[nodeIndex]?.extras?.xriftStudio;
  if (typeof extras !== "object" || extras === null || Array.isArray(extras)) {
    return undefined;
  }
  const name = (extras as Record<string, unknown>).clipName;
  return typeof name === "string" && name.trim().length > 0 ? name : undefined;
}

export function readInteractivityTriggerActionDuration(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): number {
  const socket = graph.nodes?.[nodeIndex]?.values?.duration;
  if (!socket || socket.node !== undefined) return 0;
  const first = socket.value?.[0];
  return typeof first === "number" && Number.isFinite(first) && first > 0
    ? first
    : 0;
}

export function setInteractivityTriggerActionEasing(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  easing: string,
): boolean {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return false;
  node.configuration = {
    ...(node.configuration ?? {}),
    easing: { value: [easing] },
  };
  return true;
}

export function readInteractivityTriggerActionEasing(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): InteractivityEasing {
  return parseEasing(
    graph.nodes?.[nodeIndex]?.configuration?.easing?.value?.[0],
  );
}

/** Reads an action's target, for the Editor's pickers and node summaries. */
export function readInteractivityTriggerAction(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): {
  entityId: string;
  componentId: string;
  targetKind: string;
  property: string;
  value: KhrInteractivityJsonValue[] | null;
} | null {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return null;
  const configured = (name: string): string => {
    const entry = node.configuration?.[name];
    const first = Array.isArray(entry?.value) ? entry.value[0] : undefined;
    return typeof first === "string" ? first : "";
  };
  const socket = node.values?.value;
  return {
    entityId: configured("entity"),
    componentId: configured("component"),
    targetKind: configured("targetKind"),
    property: configured("property"),
    value: Array.isArray(socket?.value) ? socket.value : null,
  };
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

    // Value connections are checked for cycles; flow connections are not,
    // because a flow cycle is how a graph repeats. The engine bounds a loop with
    // an activation budget rather than forbidding it here.
    const valueEdges = new Map<number, number[]>();
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
          if (hasNode && (!isNonNegativeInteger(input.node) || input.node >= nodes.length)) {
            error(`${nodePath}.values.${socket}.node`, "value source must reference a node in this graph");
          } else if (hasNode && isNonNegativeInteger(input.node)) {
            const sources = valueEdges.get(nodeIndex) ?? [];
            sources.push(input.node);
            valueEdges.set(nodeIndex, sources);
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
          if (!isRecord(target) || !isNonNegativeInteger(target.node) || target.node >= nodes.length) {
            error(`${nodePath}.flows.${socket}.node`, "flow target must reference a node in this graph");
          }
        }
      }
    });

    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (nodeIndex: number): boolean => {
      if (visiting.has(nodeIndex)) return true;
      if (visited.has(nodeIndex)) return false;
      visiting.add(nodeIndex);
      const cyclic = (valueEdges.get(nodeIndex) ?? []).some(visit);
      visiting.delete(nodeIndex);
      visited.add(nodeIndex);
      return cyclic;
    };
    if (nodes.some((_, nodeIndex) => visit(nodeIndex))) {
      error(`${graphPath}.nodes`, "behavior graph value connections contain a cycle");
    }
  });
  return diagnostics;
}

export const KHR_INTERACTIVITY_MAX_GRAPHS = 64;

/**
 * Document operations on the list of graphs inside one Asset.
 *
 * An Asset has always been able to hold several graphs — the schema allows up
 * to 64 — but nothing could create, copy or remove one, so the list was a
 * feature only a hand-written JSON file could use. These keep the default-graph
 * index consistent, which is the part that silently breaks when a graph in the
 * middle disappears.
 */
export function addInteractivityGraph(
  extension: KhrInteractivityExtension,
  name: string,
): number {
  if (extension.graphs.length >= KHR_INTERACTIVITY_MAX_GRAPHS) return -1;
  // No empty `types` array: the schema treats a present-but-empty one as an
  // error, so a freshly added graph would be unsaveable until its first node.
  extension.graphs.push({ name });
  return extension.graphs.length - 1;
}

export function duplicateInteractivityGraph(
  extension: KhrInteractivityExtension,
  graphIndex: number,
): number {
  const source = extension.graphs[graphIndex];
  if (!source || extension.graphs.length >= KHR_INTERACTIVITY_MAX_GRAPHS) {
    return -1;
  }
  const copy = JSON.parse(JSON.stringify(source)) as KhrInteractivityGraph;
  copy.name = `${source.name || `Graph ${graphIndex + 1}`} のコピー`;
  extension.graphs.push(copy);
  return extension.graphs.length - 1;
}

export function renameInteractivityGraph(
  extension: KhrInteractivityExtension,
  graphIndex: number,
  name: string,
): boolean {
  const graph = extension.graphs[graphIndex];
  if (!graph) return false;
  graph.name = name;
  return true;
}

/** Removes one graph, keeping the default-graph index pointing where it did. */
export function removeInteractivityGraph(
  extension: KhrInteractivityExtension,
  graphIndex: number,
): boolean {
  if (extension.graphs.length <= 1 || !extension.graphs[graphIndex]) return false;
  extension.graphs.splice(graphIndex, 1);
  const current = extension.graph ?? 0;
  if (current === graphIndex) {
    extension.graph = 0;
  } else if (current > graphIndex) {
    extension.graph = current - 1;
  }
  return true;
}

export function addDefaultInteractivityAsset(
  manifest: AssetManifest,
  input: {
    id: string;
    name: string;
    folderId: string | null;
    /**
     * A graph to seed instead of the empty default, for the creation paths that
     * already know what the Asset is for — a Model's clips, an Interaction
     * Trigger's entry point. Callers pass a graph they built with the same
     * authoring helpers the editor uses, so nothing here has to know the shape.
     */
    extension?: KhrInteractivityExtension;
  },
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
    extension: input.extension ?? createDefaultKhrInteractivityExtension(),
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

/**
 * Node layout, shared by the Editor canvas and the MCP tools.
 *
 * Placement lived in the canvas component while the graph was only ever built
 * by hand. A client that adds nodes through MCP lands on the same document, so
 * "add", "duplicate" and "整列" have to put cards in the same places from both
 * sides — otherwise a graph an AI wrote opens as a stack of overlapping cards
 * and the author's first act is to press 整列.
 */
export const INTERACTIVITY_NODE_CARD_WIDTH = 216;
const INTERACTIVITY_SOCKET_ROW_HEIGHT = 20;
const INTERACTIVITY_SOCKET_ROW_PADDING = 6;
const INTERACTIVITY_NODE_PLACEMENT_GAP = 32;
const INTERACTIVITY_LAYOUT_COLUMN_GAP = 88;
const INTERACTIVITY_LAYOUT_ROW_GAP = 40;

export function isInteractivityTriggerActionOp(op: string | undefined): boolean {
  return (
    op === XRIFT_INTERACTION_OPERATIONS.setProperty ||
    op === XRIFT_INTERACTION_OPERATIONS.toggleProperty
  );
}

/** The height the canvas will give a card, from its socket count. */
export function estimateInteractivityNodeHeight(
  graph: KhrInteractivityGraph,
  index: number,
): number {
  const node = graph.nodes?.[index];
  const op = node ? graph.declarations?.[node.declaration]?.op : undefined;
  const template = op ? getInteractivityOperationTemplate(op) : undefined;
  // Counted the way the card draws them: a socket the node actually uses is a
  // row whether or not its template declared one. `flow/sequence` is the case
  // that makes this matter — its template names three outputs and the spec runs
  // as many as are connected, so measuring the template alone puts the next
  // card on top of a sequence that fans out to eight.
  const inputs = new Set([
    ...(template?.flowInputs ?? ["in"]),
    ...(template?.valueInputs ?? []),
    ...Object.keys(node?.values ?? {}),
  ]).size;
  const outputs = new Set([
    ...(template?.flowOutputs ?? []),
    ...(template?.valueOutputs ?? []),
    ...Object.keys(node?.flows ?? {}),
  ]).size;
  const rows = Math.max(inputs, outputs, 1);
  // Header: category row, up to two title lines, the operation name, and the
  // optional summary an Interaction Trigger action carries.
  const header = op && isInteractivityTriggerActionOp(op) ? 94 : 76;
  return (
    header +
    rows * INTERACTIVITY_SOCKET_ROW_HEIGHT +
    INTERACTIVITY_SOCKET_ROW_PADDING * 2
  );
}

/**
 * Nudges a candidate position until it does not land on an existing node.
 *
 * Dropping a new node exactly on top of another is what made "add" feel like
 * nothing happened: the card was there, underneath the one already in view.
 */
export function freeInteractivityNodePosition(
  graph: KhrInteractivityGraph,
  candidate: { x: number; y: number },
): { x: number; y: number } {
  const placed = (graph.nodes ?? []).map((node, index) => ({
    position: readInteractivityNodePosition(node, index),
    height: estimateInteractivityNodeHeight(graph, index),
  }));
  let { x, y } = candidate;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const blocking = placed.find(
      (entry) =>
        Math.abs(entry.position.x - x) <
          INTERACTIVITY_NODE_CARD_WIDTH + INTERACTIVITY_NODE_PLACEMENT_GAP &&
        y < entry.position.y + entry.height + INTERACTIVITY_NODE_PLACEMENT_GAP &&
        y + entry.height > entry.position.y - INTERACTIVITY_NODE_PLACEMENT_GAP,
    );
    if (!blocking) break;
    y = blocking.position.y + blocking.height + INTERACTIVITY_NODE_PLACEMENT_GAP;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** Lays the graph out left to right in flow order. Mutates `graph`. */
export function autoLayoutInteractivityGraph(graph: KhrInteractivityGraph): void {
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
        x: column * (INTERACTIVITY_NODE_CARD_WIDTH + INTERACTIVITY_LAYOUT_COLUMN_GAP),
        y,
      });
      y +=
        estimateInteractivityNodeHeight(graph, index) + INTERACTIVITY_LAYOUT_ROW_GAP;
    }
  }
}

/**
 * Copies one node, without its connections.
 *
 * Values and configuration come along; connections do not. A copy that arrived
 * already wired would put two writers on one flow socket.
 */
export function duplicateInteractivityNode(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): number {
  const original = graph.nodes?.[nodeIndex];
  if (!original) return -1;
  const anchor = readInteractivityNodePosition(original, nodeIndex);
  const copy = JSON.parse(JSON.stringify(original)) as KhrInteractivityNode;
  delete copy.flows;
  if (copy.values) {
    copy.values = Object.fromEntries(
      Object.entries(copy.values).filter(([, input]) => input.node === undefined),
    );
    if (Object.keys(copy.values).length === 0) delete copy.values;
  }
  graph.nodes ??= [];
  graph.nodes.push(
    writeInteractivityNodePosition(
      copy,
      freeInteractivityNodePosition(graph, { x: anchor.x, y: anchor.y + 48 }),
    ),
  );
  return graph.nodes.length - 1;
}

/**
 * One node lifted out of a graph, ready to be placed in another one.
 *
 * Duplicating inside a graph can copy the node as-is, because its `declaration`
 * and its inline `type` indexes already point at the right entries. Across
 * graphs both are meaningless — index 2 is a different operation and a
 * different signature over there — so a copy carries the names instead, and
 * paste resolves them against wherever it lands.
 */
export type InteractivityNodeClipboard = {
  readonly op: string;
  readonly extension?: string;
  readonly node: KhrInteractivityNode;
  /** Signature per inline value socket, so paste can rebuild the type indexes. */
  readonly signatures: Readonly<Record<string, string>>;
};

export function readInteractivityNodeForCopy(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
): InteractivityNodeClipboard | null {
  const node = graph.nodes?.[nodeIndex];
  const declaration = node ? graph.declarations?.[node.declaration] : undefined;
  if (!node || !declaration) return null;
  const copy = cloneJson(node);
  // Connections do not come along. A pasted node that arrived already wired
  // would put two writers on one socket, and across graphs the indexes it
  // carried would point at whatever happens to sit there.
  delete copy.flows;
  const signatures: Record<string, string> = {};
  if (copy.values) {
    copy.values = Object.fromEntries(
      Object.entries(copy.values).filter(([socket, input]) => {
        if (input.node !== undefined) return false;
        const signature =
          input.type === undefined ? undefined : graph.types?.[input.type]?.signature;
        if (signature) signatures[socket] = signature;
        return true;
      }),
    );
    if (Object.keys(copy.values).length === 0) delete copy.values;
  }
  return {
    op: declaration.op,
    ...(declaration.extension ? { extension: declaration.extension } : {}),
    node: copy,
    signatures,
  };
}

/** Places a copied node in `graph`, resolving its declaration and types there. */
export function pasteInteractivityNode(
  graph: KhrInteractivityGraph,
  entry: InteractivityNodeClipboard,
  position?: { x: number; y: number },
): number {
  const node = cloneJson(entry.node);
  graph.declarations ??= [];
  let declaration = graph.declarations.findIndex(
    (candidate) =>
      candidate.op === entry.op && candidate.extension === entry.extension,
  );
  if (declaration < 0) {
    graph.declarations.push({
      op: entry.op,
      ...(entry.extension ? { extension: entry.extension } : {}),
    });
    declaration = graph.declarations.length - 1;
  }
  node.declaration = declaration;
  if (node.values) {
    graph.types ??= [];
    for (const [socket, input] of Object.entries(node.values)) {
      const signature = entry.signatures[socket];
      if (!signature) continue;
      const existing = graph.types.findIndex(
        (candidate) => candidate.signature === signature,
      );
      input.type =
        existing >= 0 ? existing : graph.types.push({ signature }) - 1;
    }
  }
  graph.nodes ??= [];
  const anchor = position ?? readInteractivityNodePosition(node, graph.nodes.length);
  graph.nodes.push(
    writeInteractivityNodePosition(node, freeInteractivityNodePosition(graph, anchor)),
  );
  return graph.nodes.length - 1;
}
