/**
 * Filesystem-free Script trust primitives.
 *
 * Trust is granted to an exact execution fingerprint inside an exact native
 * project scope. Provenance and Script display metadata are intentionally not
 * part of that decision: they are useful in the approval UI, but cannot make a
 * Script executable.
 */

export const SCRIPT_TRUST_KEY_VERSION = 1 as const;
export const SCRIPT_TRUST_ALLOW_REMOTE_MODULES = false as const;
/** Bump whenever the set or resolution rules of allowed module specifiers changes. */
export const SCRIPT_MODULE_POLICY_VERSION = "1" as const;

export const SCRIPT_PROVENANCE_KINDS = [
  "studio-template",
  "studio-editor",
  "mcp",
  "classic-import",
  "prefab",
  "starter",
  "external-store",
  "filesystem",
  "unknown",
] as const;

export type ScriptProvenanceKind =
  (typeof SCRIPT_PROVENANCE_KINDS)[number];

export type ScriptProvenanceDto = Readonly<{
  kind: ScriptProvenanceKind;
  /** Display-only MCP client name or other origin detail. */
  detail: string | null;
}>;

export type ScriptTrustLanguage = "ts" | "tsx";

export type ScriptExecutionFingerprint = Readonly<{
  sourceSha256: string;
  language: ScriptTrustLanguage;
  contractVersion: string;
  modulePolicyVersion: string;
  allowRemoteModules: false;
}>;

export type ScriptTrustFingerprint = ScriptExecutionFingerprint;

/**
 * The project path must be canonicalized by the native layer before this DTO
 * is created. JavaScript must not attempt to emulate filesystem canonicalize.
 */
export type ScriptTrustProjectScopeDto = Readonly<{
  projectId: string;
  canonicalProjectPath: string;
}>;

/**
 * Script identity and provenance are carried for an informative approval UI.
 * `executionKey` is derived only from `projectScope` and `fingerprint`.
 */
export type ScriptTrustRequestDto = Readonly<{
  projectScope: ScriptTrustProjectScopeDto;
  scriptAssetId: string;
  relativePath: string;
  displayName: string;
  provenance: ScriptProvenanceDto;
  fingerprint: ScriptExecutionFingerprint;
  executionKey: string;
}>;

/**
 * The exact source value used to compute the fingerprint. Consumers must
 * compile `source` from this snapshot instead of reading the file again.
 */
export type ScriptSourceSnapshot = Readonly<{
  assetId: string;
  name: string;
  path: string;
  source: string;
  language: ScriptTrustLanguage;
  provenance: ScriptProvenanceDto;
  snapshotKey: string;
  sourceByteLength: number;
  fingerprint: ScriptExecutionFingerprint;
}>;

export type ReadScriptSourceSnapshotInput = Readonly<{
  assetId: string;
  name: string;
  path: string;
  language: ScriptTrustLanguage;
  contractVersion: string;
  provenance?: Partial<ScriptProvenanceDto> | null;
  allowRemoteModules?: boolean;
  /**
   * Called exactly once by `readScriptSourceSnapshot`. Put the filesystem or
   * IPC read here so hashing and compilation share one immutable value.
   */
  readSource: () => string | Promise<string>;
}>;

export type CreateScriptTrustRequestInput = Readonly<{
  projectScope: ScriptTrustProjectScopeDto;
  snapshot: ScriptSourceSnapshot;
}>;

export type CreateScriptTrustFingerprintInput = Readonly<{
  source: string;
  language: ScriptTrustLanguage;
  contractVersion: string;
  allowRemoteModules: boolean;
}>;

export type ScriptTrustStatus = "pending" | "approved" | "skipped";

export type ScriptTrustExecutionState = Readonly<{
  request: ScriptTrustRequestDto;
  status: ScriptTrustStatus;
  canExecute: boolean;
}>;

export type ScriptTrustDecisionIndex = Readonly<{
  approvedExecutionKeys: ReadonlySet<string>;
  skippedExecutionKeys?: ReadonlySet<string>;
}>;

const PROVENANCE_LABELS: Readonly<Record<ScriptProvenanceKind, string>> = {
  "studio-template": "Studioテンプレート",
  "studio-editor": "Studioエディター",
  mcp: "MCP",
  "classic-import": "Classicプロジェクトからの取り込み",
  prefab: "Prefab",
  starter: "Starter Asset",
  "external-store": "外部ストア",
  filesystem: "ファイルシステム",
  unknown: "不明",
};

/** Hash UTF-8 bytes with the Web Crypto implementation available to Tauri. */
export async function sha256ScriptSource(sourceText: string): Promise<string> {
  if (typeof sourceText !== "string") {
    throw new TypeError("Script source must be a string");
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is not available");
  }
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceText),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function createScriptTrustFingerprint(
  input: CreateScriptTrustFingerprintInput,
): Promise<ScriptExecutionFingerprint> {
  assertLanguage(input.language);
  assertNonEmpty(input.contractVersion, "contractVersion");
  if (input.allowRemoteModules !== SCRIPT_TRUST_ALLOW_REMOTE_MODULES) {
    throw new TypeError("Remote Script modules cannot be approved");
  }
  return Object.freeze({
    sourceSha256: await sha256ScriptSource(input.source),
    language: input.language,
    contractVersion: input.contractVersion,
    modulePolicyVersion: SCRIPT_MODULE_POLICY_VERSION,
    allowRemoteModules: SCRIPT_TRUST_ALLOW_REMOTE_MODULES,
  });
}

/**
 * Read once, then bind the exact source text to its execution fingerprint.
 * Object freezing catches accidental mutation while the snapshot is in use.
 */
export async function readScriptSourceSnapshot(
  input: ReadScriptSourceSnapshotInput,
): Promise<ScriptSourceSnapshot> {
  assertNonEmpty(input.assetId, "assetId");
  assertNonEmpty(input.name, "name");
  assertNonEmpty(input.path, "path");
  assertLanguage(input.language);
  assertNonEmpty(input.contractVersion, "contractVersion");

  const source = await input.readSource();
  if (typeof source !== "string") {
    throw new TypeError("Script source reader must return a string");
  }
  const encodedSource = new TextEncoder().encode(source);
  const fingerprint = await createScriptTrustFingerprint({
    source,
    language: input.language,
    contractVersion: input.contractVersion,
    allowRemoteModules:
      input.allowRemoteModules ?? SCRIPT_TRUST_ALLOW_REMOTE_MODULES,
  });
  const provenance = normalizeScriptProvenance(input.provenance);
  return Object.freeze({
    assetId: input.assetId,
    name: input.name,
    path: input.path,
    source,
    language: input.language,
    provenance,
    snapshotKey: await createScriptSourceSnapshotKey(
      input.assetId,
      fingerprint,
    ),
    sourceByteLength: encodedSource.byteLength,
    fingerprint,
  });
}

/**
 * Stable identity for an exact source snapshot. Display metadata and
 * provenance are excluded so neither can affect execution decisions.
 */
export async function createScriptSourceSnapshotKey(
  assetId: string,
  fingerprint: ScriptExecutionFingerprint,
): Promise<string> {
  assertNonEmpty(assetId, "assetId");
  assertFingerprint(fingerprint);
  const canonicalSnapshot = JSON.stringify({
    assetId,
    fingerprint: {
      allowRemoteModules: fingerprint.allowRemoteModules,
      contractVersion: fingerprint.contractVersion,
      language: fingerprint.language,
      modulePolicyVersion: fingerprint.modulePolicyVersion,
      sourceSha256: fingerprint.sourceSha256,
    },
  });
  return `xrift-script-snapshot:v${SCRIPT_TRUST_KEY_VERSION}:sha256:${await sha256ScriptSource(
    canonicalSnapshot,
  )}`;
}

/**
 * Canonical JSON shared by execution-key fixtures and the native approval
 * store. Field order is deliberate and must only change with key version.
 */
export function serializeScriptExecutionScope(
  projectScope: ScriptTrustProjectScopeDto,
  fingerprint: ScriptExecutionFingerprint,
): string {
  assertProjectScope(projectScope);
  assertFingerprint(fingerprint);
  return JSON.stringify({
    schemaVersion: SCRIPT_TRUST_KEY_VERSION,
    projectScope: {
      canonicalProjectPath: projectScope.canonicalProjectPath,
      projectId: projectScope.projectId,
    },
    fingerprint: {
      allowRemoteModules: fingerprint.allowRemoteModules,
      contractVersion: fingerprint.contractVersion,
      language: fingerprint.language,
      modulePolicyVersion: fingerprint.modulePolicyVersion,
      sourceSha256: fingerprint.sourceSha256,
    },
  });
}

/** Stable, path-safe key for the app-data approval store. */
export async function createScriptExecutionKey(
  projectScope: ScriptTrustProjectScopeDto,
  fingerprint: ScriptExecutionFingerprint,
): Promise<string> {
  const canonicalScope = serializeScriptExecutionScope(
    projectScope,
    fingerprint,
  );
  return `xrift-script-trust:v${SCRIPT_TRUST_KEY_VERSION}:sha256:${await sha256ScriptSource(
    canonicalScope,
  )}`;
}

export async function createScriptTrustRequest(
  input: CreateScriptTrustRequestInput,
): Promise<ScriptTrustRequestDto> {
  assertProjectScope(input.projectScope);
  await validateScriptSourceSnapshot(input.snapshot);

  return Object.freeze({
    projectScope: Object.freeze({ ...input.projectScope }),
    scriptAssetId: input.snapshot.assetId,
    relativePath: input.snapshot.path,
    displayName: input.snapshot.name,
    provenance: normalizeScriptProvenance(input.snapshot.provenance),
    fingerprint: input.snapshot.fingerprint,
    executionKey: await createScriptExecutionKey(
      input.projectScope,
      input.snapshot.fingerprint,
    ),
  });
}

/**
 * Fail closed if a hand-built or stale snapshot does not bind its exact source
 * to its fingerprint and snapshot key.
 */
export async function validateScriptSourceSnapshot(
  snapshot: ScriptSourceSnapshot,
): Promise<void> {
  assertNonEmpty(snapshot.assetId, "snapshot.assetId");
  assertNonEmpty(snapshot.path, "snapshot.path");
  assertNonEmpty(snapshot.name, "snapshot.name");
  assertLanguage(snapshot.language);
  assertFingerprint(snapshot.fingerprint);
  if (typeof snapshot.source !== "string") {
    throw new TypeError("snapshot source must be a string");
  }
  if (snapshot.language !== snapshot.fingerprint.language) {
    throw new TypeError("snapshot language does not match its fingerprint");
  }
  if (
    new TextEncoder().encode(snapshot.source).byteLength !==
    snapshot.sourceByteLength
  ) {
    throw new TypeError("snapshot byte length does not match its source");
  }
  if (
    (await sha256ScriptSource(snapshot.source)) !==
    snapshot.fingerprint.sourceSha256
  ) {
    throw new TypeError("snapshot source does not match its fingerprint");
  }
  if (
    (await createScriptSourceSnapshotKey(
      snapshot.assetId,
      snapshot.fingerprint,
    )) !== snapshot.snapshotKey
  ) {
    throw new TypeError("snapshot key does not match its source identity");
  }
}

/**
 * Resolve approval without consulting provenance, template identity, display
 * name, or path. An exact approval key is the only executable state.
 */
export function resolveScriptTrustState(
  request: ScriptTrustRequestDto,
  decisions: ScriptTrustDecisionIndex,
): ScriptTrustExecutionState {
  const approved = decisions.approvedExecutionKeys.has(request.executionKey);
  const skipped =
    !approved &&
    (decisions.skippedExecutionKeys?.has(request.executionKey) ?? false);
  const status: ScriptTrustStatus = approved
    ? "approved"
    : skipped
      ? "skipped"
      : "pending";
  return Object.freeze({
    request,
    status,
    canExecute: status === "approved",
  });
}

export function normalizeScriptProvenance(
  provenance: Partial<ScriptProvenanceDto> | null | undefined,
): ScriptProvenanceDto {
  const kind = isScriptProvenanceKind(provenance?.kind)
    ? provenance.kind
    : "unknown";
  const detail =
    typeof provenance?.detail === "string" && provenance.detail.trim()
      ? provenance.detail.trim()
      : null;
  return Object.freeze({ kind, detail });
}

export function describeScriptProvenance(
  provenance: ScriptProvenanceDto,
): string {
  const label = PROVENANCE_LABELS[provenance.kind];
  return provenance.detail ? `${label} (${provenance.detail})` : label;
}

export function isScriptProvenanceKind(
  value: unknown,
): value is ScriptProvenanceKind {
  return (
    typeof value === "string" &&
    (SCRIPT_PROVENANCE_KINDS as readonly string[]).includes(value)
  );
}

function assertProjectScope(projectScope: ScriptTrustProjectScopeDto): void {
  assertNonEmpty(projectScope.projectId, "projectScope.projectId");
  assertNonEmpty(
    projectScope.canonicalProjectPath,
    "projectScope.canonicalProjectPath",
  );
}

function assertFingerprint(fingerprint: ScriptExecutionFingerprint): void {
  if (!/^[a-f0-9]{64}$/.test(fingerprint.sourceSha256)) {
    throw new TypeError(
      "fingerprint.sourceSha256 must be a lowercase SHA-256 digest",
    );
  }
  assertLanguage(fingerprint.language);
  assertNonEmpty(fingerprint.contractVersion, "fingerprint.contractVersion");
  assertNonEmpty(
    fingerprint.modulePolicyVersion,
    "fingerprint.modulePolicyVersion",
  );
  if (fingerprint.allowRemoteModules !== false) {
    throw new TypeError("Remote Script modules cannot be approved");
  }
}

function assertLanguage(
  language: ScriptTrustLanguage,
): asserts language is ScriptTrustLanguage {
  if (language !== "ts" && language !== "tsx") {
    throw new TypeError(`Unsupported Script language: ${String(language)}`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}
