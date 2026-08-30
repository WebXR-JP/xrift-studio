/**
 * A structural read of an untrusted `KHR_interactivity` document.
 *
 * The engine never touches raw JSON. Everything it needs — which operation a
 * node runs, where its inputs come from, where its flows go — is resolved once
 * here, so the execution code below can be about semantics instead of about
 * defending itself from a hostile document on every access.
 *
 * Nothing is discarded silently. A node whose declaration cannot be resolved
 * keeps its place in the array with an unresolvable operation name, because the
 * canonical JSON keeps it too and the author has to be told which node it was.
 */

/** A JSON scalar as it appears inside a KHR typed value. */
export type KhrJsonValue = string | number | boolean | null;

export type InteractivityTypeSignature =
  | "bool"
  | "float"
  | "float2"
  | "float3"
  | "float4"
  | "float2x2"
  | "float3x3"
  | "float4x4"
  | "int"
  | "ref"
  | "custom";

const TYPE_SIGNATURES: ReadonlySet<string> = new Set<InteractivityTypeSignature>([
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

/** How many scalars one signature holds. `null` means the type is opaque. */
export function signatureLength(
  signature: InteractivityTypeSignature,
): number | null {
  switch (signature) {
    case "bool":
    case "float":
    case "int":
    case "ref":
      return 1;
    case "float2":
      return 2;
    case "float3":
      return 3;
    case "float4":
    case "float2x2":
      return 4;
    case "float3x3":
      return 9;
    case "float4x4":
      return 16;
    case "custom":
      return null;
  }
}

/** Where one value socket takes its value from. */
export type ParsedValueSocket =
  | {
      readonly kind: "inline";
      readonly typeIndex: number | null;
      readonly value: readonly KhrJsonValue[] | null;
    }
  | { readonly kind: "link"; readonly node: number; readonly socket: string };

export type ParsedFlowTarget = { readonly node: number; readonly socket: string };

export type ParsedNode = {
  readonly index: number;
  /** Operation name, or `null` when the declaration could not be resolved. */
  readonly op: string | null;
  /** Extension that defines the operation, when the declaration names one. */
  readonly extension: string | null;
  readonly configuration: ReadonlyMap<string, readonly KhrJsonValue[]>;
  readonly values: ReadonlyMap<string, ParsedValueSocket>;
  readonly flows: ReadonlyMap<string, ParsedFlowTarget>;
};

export type ParsedVariable = {
  readonly typeIndex: number | null;
  readonly value: readonly KhrJsonValue[] | null;
};

export type ParsedGraph = {
  readonly index: number;
  readonly name: string | null;
  readonly types: readonly InteractivityTypeSignature[];
  readonly variables: readonly ParsedVariable[];
  /** Custom event ids, addressed by `event/send` and `event/receive`. */
  readonly events: readonly (string | null)[];
  readonly nodes: readonly ParsedNode[];
};

export type ParsedExtension = {
  readonly graphs: readonly ParsedGraph[];
  readonly defaultGraphIndex: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function asJsonValues(value: unknown): readonly KhrJsonValue[] | null {
  if (!Array.isArray(value)) return null;
  const collected: KhrJsonValue[] = [];
  for (const entry of value) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
    ) {
      collected.push(entry);
      continue;
    }
    // A non-scalar inside a typed value is not representable; the whole socket
    // is treated as unset rather than half-read.
    return null;
  }
  return collected;
}

function parseConfiguration(
  value: unknown,
): ReadonlyMap<string, readonly KhrJsonValue[]> {
  const parsed = new Map<string, readonly KhrJsonValue[]>();
  const record = asRecord(value);
  if (!record) return parsed;
  for (const [key, entry] of Object.entries(record)) {
    const values = asJsonValues(asRecord(entry)?.value);
    if (values) parsed.set(key, values);
  }
  return parsed;
}

function parseValues(value: unknown): ReadonlyMap<string, ParsedValueSocket> {
  const parsed = new Map<string, ParsedValueSocket>();
  const record = asRecord(value);
  if (!record) return parsed;
  for (const [socket, entry] of Object.entries(record)) {
    const source = asRecord(entry);
    if (!source) continue;
    const linked = asIndex(source.node);
    if (linked !== null) {
      const named = source.socket;
      parsed.set(socket, {
        kind: "link",
        node: linked,
        socket: typeof named === "string" && named ? named : "value",
      });
      continue;
    }
    parsed.set(socket, {
      kind: "inline",
      typeIndex: asIndex(source.type),
      value: asJsonValues(source.value),
    });
  }
  return parsed;
}

function parseFlows(value: unknown): ReadonlyMap<string, ParsedFlowTarget> {
  const parsed = new Map<string, ParsedFlowTarget>();
  const record = asRecord(value);
  if (!record) return parsed;
  for (const [socket, entry] of Object.entries(record)) {
    const target = asRecord(entry);
    const node = asIndex(target?.node);
    if (node === null) continue;
    const named = target?.socket;
    parsed.set(socket, {
      node,
      socket: typeof named === "string" && named ? named : "in",
    });
  }
  return parsed;
}

function parseGraph(value: unknown, index: number): ParsedGraph {
  const record = asRecord(value);
  const declarations = asArray(record?.declarations);
  const types: InteractivityTypeSignature[] = [];
  for (const entry of asArray(record?.types)) {
    const signature = asRecord(entry)?.signature;
    types.push(
      typeof signature === "string" && TYPE_SIGNATURES.has(signature)
        ? (signature as InteractivityTypeSignature)
        : "custom",
    );
  }
  const variables: ParsedVariable[] = [];
  for (const entry of asArray(record?.variables)) {
    const variable = asRecord(entry);
    variables.push({
      typeIndex: asIndex(variable?.type),
      value: asJsonValues(variable?.value),
    });
  }
  const events: (string | null)[] = [];
  for (const entry of asArray(record?.events)) {
    const id = asRecord(entry)?.id;
    events.push(typeof id === "string" && id ? id : null);
  }
  const nodes: ParsedNode[] = [];
  for (const [nodeIndex, entry] of asArray(record?.nodes).entries()) {
    const node = asRecord(entry);
    const declarationIndex = asIndex(node?.declaration);
    const declaration =
      declarationIndex === null
        ? undefined
        : asRecord(declarations[declarationIndex]);
    const op = declaration?.op;
    const extension = declaration?.extension;
    nodes.push({
      index: nodeIndex,
      op: typeof op === "string" && op ? op : null,
      extension: typeof extension === "string" && extension ? extension : null,
      configuration: parseConfiguration(node?.configuration),
      values: parseValues(node?.values),
      flows: parseFlows(node?.flows),
    });
  }
  const name = asRecord(record)?.name;
  return {
    index,
    name: typeof name === "string" && name ? name : null,
    types,
    variables,
    events,
    nodes,
  };
}

/** Reads a whole `KHR_interactivity` extension object. */
export function parseInteractivityExtension(value: unknown): ParsedExtension {
  const record = asRecord(value);
  const graphs = asArray(record?.graphs).map((entry, index) =>
    parseGraph(entry, index),
  );
  const requested = asIndex(record?.graph) ?? 0;
  return {
    graphs,
    defaultGraphIndex: requested < graphs.length ? requested : 0,
  };
}

/** Reads one graph, defaulting to the extension's selected graph. */
export function parseInteractivityGraph(
  value: unknown,
  graphIndex?: number,
): ParsedGraph | null {
  const extension = parseInteractivityExtension(value);
  const index = graphIndex ?? extension.defaultGraphIndex;
  return extension.graphs[index] ?? null;
}
