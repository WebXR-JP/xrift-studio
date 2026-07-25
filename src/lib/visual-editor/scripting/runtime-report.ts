export type ScriptRuntimeReport = {
  status: "idle" | "compiling" | "ready" | "error";
  failureRevision: number;
  compileErrors: Array<{
    assetId: string;
    assetName: string;
    relativePath: string;
    message: string;
  }>;
  failures: Array<{
    entityId: string;
    componentId: string;
    scriptName: string;
    phase: string;
    message: string;
    stopped: boolean;
  }>;
  logs: Array<{
    entityId: string;
    componentId: string;
    scriptName: string;
    values: string[];
  }>;
};

type RuntimeStateLike = {
  status: ScriptRuntimeReport["status"];
  failureRevision: number;
  errors: ReadonlyArray<ScriptRuntimeReport["compileErrors"][number]>;
  failures: ReadonlyArray<ScriptRuntimeReport["failures"][number]>;
  logs: ReadonlyArray<{
    entityId: string;
    componentId: string;
    scriptName: string;
    values: unknown[];
  }>;
};

/** Builds a bounded, JSON-safe snapshot for the Script Console and MCP. */
export function createScriptRuntimeReport(
  state: RuntimeStateLike,
): ScriptRuntimeReport {
  return {
    status: state.status,
    failureRevision: state.failureRevision,
    compileErrors: state.errors.slice(-20).map((entry) => ({ ...entry })),
    failures: state.failures.slice(-50).map((entry) => ({ ...entry })),
    logs: state.logs.slice(-50).map((entry) => ({
      entityId: entry.entityId,
      componentId: entry.componentId,
      scriptName: entry.scriptName,
      values: entry.values.slice(0, 12).map((value) => previewValue(value)),
    })),
  };
}

function previewValue(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const formatted = formatValue(value, 0, seen);
    return formatted.length > 500 ? `${formatted.slice(0, 497)}...` : formatted;
  } catch {
    return "[Unserializable]";
  }
}

function formatValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(shorten(value, 240));
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (value instanceof Error) {
    return `${value.name}: ${shorten(value.message, 300)}`;
  }
  if (depth >= 2) return objectLabel(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const entries = value
      .slice(0, 8)
      .map((entry) => formatValue(entry, depth + 1, seen));
    if (value.length > 8) entries.push(`… ${value.length - 8} more`);
    return `[${entries.join(", ")}]`;
  }
  const entries = Object.entries(value).slice(0, 8);
  const formatted = entries.map(
    ([key, entry]) => `${key}: ${formatValue(entry, depth + 1, seen)}`,
  );
  if (Object.keys(value).length > entries.length) formatted.push("…");
  return `{ ${formatted.join(", ")} }`;
}

function objectLabel(value: object): string {
  const candidate = value as {
    type?: unknown;
    name?: unknown;
    constructor?: { name?: unknown };
  };
  const label =
    (typeof candidate.type === "string" && candidate.type) ||
    (typeof candidate.constructor?.name === "string" &&
      candidate.constructor.name) ||
    "Object";
  const name =
    typeof candidate.name === "string" && candidate.name
      ? ` ${candidate.name}`
      : "";
  return `[${label}${name}]`;
}

function shorten(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}
