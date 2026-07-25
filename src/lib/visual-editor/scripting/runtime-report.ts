import {
  describeScriptProvenance,
  type ScriptSourceSnapshot,
} from "./script-trust";

export type ScriptTrustReportEntry = {
  assetId: string;
  name: string;
  relativePath: string;
  language: "ts" | "tsx";
  sourceSha256: string;
  provenance: string;
};

export type ScriptRuntimeTrustReport = {
  status: "not-required" | "approved" | "approval-required" | "skipped";
  pending: ScriptTrustReportEntry[];
  disabled: ScriptTrustReportEntry[];
  running: ScriptTrustReportEntry[];
};

export type ScriptRuntimeReport = {
  status: "idle" | "compiling" | "ready" | "error" | "approval-required";
  failureRevision: number;
  compileErrors: Array<{
    assetId: string;
    assetName: string;
    relativePath: string;
    message: string;
    code?: "SCRIPT_APPROVAL_REQUIRED";
    sourceSha256?: string;
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
  trust: ScriptRuntimeTrustReport;
};

export type ScriptRuntimeDiagnosticLike = Readonly<{
  assetId: string;
  code?: "SCRIPT_APPROVAL_REQUIRED";
}>;

export type ScriptRuntimeUpdatePolicy = Readonly<{
  unapprovedPolicy: "block" | "skip";
  /**
   * When present, approval errors for other Assets do not make a targeted
   * source update look stale during a skip session.
   */
  targetAssetIds?: readonly string[];
}>;

export type McpPlayStartFailure =
  | "approval-required"
  | "compile-failed"
  | "play-mode-change-failed";

/**
 * Classifies a failed MCP Play request without hiding a real compiler error
 * behind an approval error after the caller explicitly selected skip.
 */
export function classifyMcpPlayStartFailure(input: {
  started: boolean;
  unapprovedPolicy: "block" | "skip";
  approvalRequiredCount: number;
  errors: readonly ScriptRuntimeDiagnosticLike[];
}): McpPlayStartFailure | null {
  if (input.started) return null;
  if (
    input.unapprovedPolicy !== "skip" &&
    input.approvalRequiredCount > 0
  ) {
    return "approval-required";
  }
  if (
    input.errors.some(
      (error) => error.code !== "SCRIPT_APPROVAL_REQUIRED",
    )
  ) {
    return "compile-failed";
  }
  return "play-mode-change-failed";
}

/**
 * True only when the requested source update is represented by the resulting
 * runtime. A skip-session may ignore unrelated pending Assets, but never the
 * target Asset itself; block mode never applies any source while approval is
 * pending.
 */
export function didScriptRuntimeApplyLatestSources(
  errors: readonly ScriptRuntimeDiagnosticLike[],
  policy: ScriptRuntimeUpdatePolicy,
): boolean {
  if (
    errors.some((error) => error.code !== "SCRIPT_APPROVAL_REQUIRED")
  ) {
    return false;
  }
  const approvalErrors = errors.filter(
    (error) => error.code === "SCRIPT_APPROVAL_REQUIRED",
  );
  if (approvalErrors.length === 0) return true;
  if (
    policy.unapprovedPolicy !== "skip" ||
    policy.targetAssetIds === undefined
  ) {
    return false;
  }
  const targets = new Set(policy.targetAssetIds);
  return approvalErrors.every((error) => !targets.has(error.assetId));
}

/** Keep MCP `trust.running` aligned with hosts referenced by the current Scene. */
export function filterScriptTrustRunningByAssetIds<
  Entry extends Readonly<{ assetId: string }>,
>(
  entries: readonly Entry[],
  requiredAssetIds: readonly string[],
): Entry[] {
  const required = new Set(requiredAssetIds);
  return entries.filter((entry) => required.has(entry.assetId));
}

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
  trust: {
    status: ScriptRuntimeTrustReport["status"];
    pending: readonly ScriptSourceSnapshot[];
    skipped: readonly ScriptSourceSnapshot[];
    running: ReadonlyArray<
      Pick<
        ScriptSourceSnapshot,
        "assetId" | "name" | "path" | "language" | "fingerprint" | "provenance"
      >
    >;
  };
};

/** Builds a bounded, JSON-safe snapshot for the Script Console and MCP. */
export function createScriptRuntimeReport(
  state: RuntimeStateLike,
): ScriptRuntimeReport {
  return {
    status: state.status,
    failureRevision: state.failureRevision,
    compileErrors: state.errors.slice(-20).map((entry) => {
      const candidate = entry as typeof entry & {
        code?: "SCRIPT_APPROVAL_REQUIRED";
        trustSnapshot?: ScriptSourceSnapshot;
      };
      return {
        assetId: candidate.assetId,
        assetName: candidate.assetName,
        relativePath: candidate.relativePath,
        message: candidate.message,
        ...(candidate.code ? { code: candidate.code } : {}),
        ...(candidate.trustSnapshot
          ? {
              sourceSha256:
                candidate.trustSnapshot.fingerprint.sourceSha256,
            }
          : {}),
      };
    }),
    failures: state.failures.slice(-50).map((entry) => ({ ...entry })),
    logs: state.logs.slice(-50).map((entry) => ({
      entityId: entry.entityId,
      componentId: entry.componentId,
      scriptName: entry.scriptName,
      values: entry.values.slice(0, 12).map((value) => previewValue(value)),
    })),
    trust: {
      status: state.trust.status,
      pending: state.trust.pending.map(toTrustReportEntry),
      disabled: state.trust.skipped.map(toTrustReportEntry),
      running: state.trust.running.map(toTrustReportEntry),
    },
  };
}

function toTrustReportEntry(
  entry: Pick<
    ScriptSourceSnapshot,
    "assetId" | "name" | "path" | "language" | "fingerprint" | "provenance"
  >,
): ScriptTrustReportEntry {
  return {
    assetId: entry.assetId,
    name: entry.name,
    relativePath: entry.path,
    language: entry.language,
    sourceSha256: entry.fingerprint.sourceSha256,
    provenance: describeScriptProvenance(entry.provenance),
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
