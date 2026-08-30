/**
 * The one value representation the engine passes between nodes.
 *
 * KHR types are all fixed-length arrays of scalars, so a signature and a data
 * array is enough. Keeping a single shape here is what lets a math operation
 * accept a float and a float3 without every operation re-deriving what it was
 * handed.
 */

import {
  signatureLength,
  type InteractivityTypeSignature,
  type KhrJsonValue,
} from "./graph.js";

export type InteractivityValue = {
  readonly signature: InteractivityTypeSignature;
  /** `bool` holds booleans; every other signature holds finite numbers. */
  readonly data: readonly (number | boolean)[];
};

export const TRUE: InteractivityValue = { signature: "bool", data: [true] };
export const FALSE: InteractivityValue = { signature: "bool", data: [false] };

export function boolValue(value: boolean): InteractivityValue {
  return value ? TRUE : FALSE;
}

export function floatValue(value: number): InteractivityValue {
  return { signature: "float", data: [Number.isFinite(value) ? value : 0] };
}

export function intValue(value: number): InteractivityValue {
  return {
    signature: "int",
    data: [Number.isFinite(value) ? Math.trunc(value) : 0],
  };
}

export function vectorValue(components: readonly number[]): InteractivityValue {
  const signature: InteractivityTypeSignature =
    components.length === 2
      ? "float2"
      : components.length === 3
        ? "float3"
        : components.length === 4
          ? "float4"
          : "float";
  return {
    signature,
    data: components.map((entry) => (Number.isFinite(entry) ? entry : 0)),
  };
}

/** The all-zero value of a signature, which the RC uses when nothing is set. */
export function defaultValue(
  signature: InteractivityTypeSignature,
): InteractivityValue {
  if (signature === "bool") return FALSE;
  const length = signatureLength(signature);
  if (length === null) return { signature, data: [] };
  return { signature, data: new Array<number>(length).fill(0) };
}

/** Reads a JSON typed value into the engine's representation. */
export function fromJsonValue(
  signature: InteractivityTypeSignature,
  value: readonly KhrJsonValue[] | null,
): InteractivityValue {
  if (!value || value.length === 0) return defaultValue(signature);
  if (signature === "bool") {
    return boolValue(value[0] === true);
  }
  const length = signatureLength(signature);
  const size = length ?? value.length;
  const data: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const entry = value[index];
    data.push(typeof entry === "number" && Number.isFinite(entry) ? entry : 0);
  }
  return { signature, data };
}

/** Writes a value back out as JSON scalars, for a host that stores JSON. */
export function toJsonValue(value: InteractivityValue): KhrJsonValue[] {
  return value.data.map((entry) => (typeof entry === "boolean" ? entry : entry));
}

export function asBoolean(value: InteractivityValue | null): boolean {
  if (!value) return false;
  const first = value.data[0];
  if (typeof first === "boolean") return first;
  return typeof first === "number" && first !== 0;
}

export function asNumber(value: InteractivityValue | null): number {
  if (!value) return 0;
  const first = value.data[0];
  if (typeof first === "boolean") return first ? 1 : 0;
  return typeof first === "number" && Number.isFinite(first) ? first : 0;
}

export function asInteger(value: InteractivityValue | null): number {
  return Math.trunc(asNumber(value));
}

/** Numeric components, padded with zeroes so callers can index safely. */
export function asNumbers(
  value: InteractivityValue | null,
  length: number,
): number[] {
  const components: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const entry = value?.data[index];
    if (typeof entry === "number" && Number.isFinite(entry)) {
      components.push(entry);
    } else if (typeof entry === "boolean") {
      components.push(entry ? 1 : 0);
    } else {
      components.push(0);
    }
  }
  return components;
}

/** How many scalars a value actually carries. */
export function valueLength(value: InteractivityValue | null): number {
  if (!value) return 0;
  return signatureLength(value.signature) ?? value.data.length;
}

/**
 * Linear blend between two values of the same shape.
 *
 * Interpolation is the whole point of a timed property write, so it lives
 * beside the value model rather than inside one operation: `variable/interpolate`,
 * `pointer/interpolate` and a timed Entity property write all use this.
 */
export function mixValues(
  from: InteractivityValue,
  to: InteractivityValue,
  ratio: number,
): InteractivityValue {
  const clamped = ratio <= 0 ? 0 : ratio >= 1 ? 1 : ratio;
  if (to.signature === "bool") {
    // A boolean has no midpoint; it flips once the blend passes the halfway
    // point, so a timed write of a switch still lands on a legal value.
    return clamped < 1 ? from : to;
  }
  const length = Math.max(valueLength(from), valueLength(to));
  const start = asNumbers(from, length);
  const end = asNumbers(to, length);
  const blended = end.map((entry, index) => {
    const base = start[index] ?? 0;
    return base + (entry - base) * clamped;
  });
  if (to.signature === "int") {
    return { signature: "int", data: blended.map((entry) => Math.round(entry)) };
  }
  return { signature: to.signature, data: blended };
}

/**
 * How a timed change is distributed over its duration.
 *
 * A curated set rather than arbitrary curves: an author picking "ゆっくり止まる"
 * for a door is making a real choice, and a bezier editor is not what that
 * choice needs. Every entry is monotonic except `ease-out-back`, which
 * deliberately overshoots and settles.
 */
export type InteractivityEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-strong"
  | "ease-out-strong"
  | "ease-out-back";

export const INTERACTIVITY_EASINGS: readonly InteractivityEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "ease-in-strong",
  "ease-out-strong",
  "ease-out-back",
];

const EASINGS: ReadonlySet<string> = new Set<InteractivityEasing>(
  INTERACTIVITY_EASINGS,
);

export function parseEasing(value: unknown): InteractivityEasing {
  return typeof value === "string" && EASINGS.has(value)
    ? (value as InteractivityEasing)
    : "linear";
}

/** Shapes a 0..1 progress ratio. Kept here so Play and publish ease alike. */
export function applyEasing(ratio: number, easing: InteractivityEasing): number {
  const clamped = ratio <= 0 ? 0 : ratio >= 1 ? 1 : ratio;
  const back = 1 - clamped;
  switch (easing) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return 1 - back * back;
    case "ease-in-out":
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - 2 * back * back;
    case "ease-in-strong":
      return clamped * clamped * clamped;
    case "ease-out-strong":
      return 1 - back * back * back;
    case "ease-out-back": {
      // Overshoots by about ten percent and settles, which is what a lid or a
      // sign wants when it stops. The constants are the usual "back" pair.
      const overshoot = 1.70158;
      return 1 + (overshoot + 1) * back * back * back - overshoot * back * back;
    }
    case "linear":
      return clamped;
  }
}
