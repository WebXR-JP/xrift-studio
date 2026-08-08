import {
  approvalRequiredSnapshots,
  blockingScriptCompileErrors,
  sameResolvedScriptExecutionScope,
  sameScriptExecutionScopeInput,
  scriptTrustFingerprintKey,
} from "./script-execution-scope";
import type { ScriptCompileError } from "./useScriptRuntime";
import type {
  ScriptExecutionFingerprint,
  ScriptSourceSnapshot,
} from "../../lib/visual-editor/scripting/script-trust";

const BASE_FINGERPRINT: ScriptExecutionFingerprint = {
  sourceSha256: "sha256:aaa",
  language: "ts",
  contractVersion: "1.0.0",
  modulePolicyVersion: "1",
  allowRemoteModules: false,
};

function snapshot(
  assetId: string,
  snapshotKey: string,
  fingerprint: ScriptExecutionFingerprint = BASE_FINGERPRINT,
): ScriptSourceSnapshot {
  return {
    assetId,
    name: assetId,
    path: `scripts/${assetId}.ts`,
    source: "export default {};",
    language: fingerprint.language,
    provenance: { kind: "studio-template", detail: null },
    snapshotKey,
    sourceByteLength: 19,
    fingerprint,
  };
}

/** Assertions for the Script approval scope the editor shell resolves. */
export function runScriptExecutionScopeFixtureAssertions(): void {
  const scope = { projectId: "project_a", projectPath: "/projects/a" };
  assert(
    sameScriptExecutionScopeInput(scope, { ...scope }),
    "The same project and path must resolve to the same scope",
  );
  assert(
    !sameScriptExecutionScopeInput(scope, {
      ...scope,
      projectId: "project_b",
    }) &&
      !sameScriptExecutionScopeInput(scope, {
        ...scope,
        projectPath: "/projects/b",
      }) &&
      !sameScriptExecutionScopeInput(scope, { ...scope, projectPath: null }),
    "A different project or path must not reuse an approved scope",
  );

  const resolved = { ...scope, canonicalProjectPath: "/canonical/a" };
  assert(
    sameResolvedScriptExecutionScope(resolved, { ...resolved }) &&
      !sameResolvedScriptExecutionScope(resolved, {
        ...resolved,
        canonicalProjectPath: "/canonical/b",
      }),
    "A moved project must be re-resolved before its approvals apply",
  );

  const baseKey = scriptTrustFingerprintKey(BASE_FINGERPRINT);
  assert(
    baseKey === scriptTrustFingerprintKey({ ...BASE_FINGERPRINT }),
    "The same fingerprint must produce the same approval key",
  );
  for (const changed of [
    { sourceSha256: "sha256:bbb" },
    { language: "tsx" as const },
    { contractVersion: "2.0.0" },
    { modulePolicyVersion: "2" },
  ]) {
    assert(
      scriptTrustFingerprintKey({ ...BASE_FINGERPRINT, ...changed }) !== baseKey,
      `An approval key must change with ${Object.keys(changed)[0]}`,
    );
  }

  const errors: ScriptCompileError[] = [
    {
      assetId: "asset_a",
      assetName: "A",
      relativePath: "scripts/a.ts",
      message: "承認が必要です",
      code: "SCRIPT_APPROVAL_REQUIRED",
      trustSnapshot: snapshot("asset_a", "key_a"),
    },
    {
      assetId: "asset_a",
      assetName: "A",
      relativePath: "scripts/a.ts",
      message: "承認が必要です",
      code: "SCRIPT_APPROVAL_REQUIRED",
      trustSnapshot: snapshot("asset_a", "key_a"),
    },
    {
      assetId: "asset_b",
      assetName: "B",
      relativePath: "scripts/b.ts",
      message: "承認が必要です",
      code: "SCRIPT_APPROVAL_REQUIRED",
      trustSnapshot: snapshot("asset_b", "key_b"),
    },
    {
      // An approval code without a snapshot cannot be approved, so it is dropped.
      assetId: "asset_c",
      assetName: "C",
      relativePath: "scripts/c.ts",
      message: "承認が必要です",
      code: "SCRIPT_APPROVAL_REQUIRED",
    },
    {
      assetId: "asset_d",
      assetName: "D",
      relativePath: "scripts/d.ts",
      message: "構文エラー",
    },
  ];

  const pending = approvalRequiredSnapshots(errors);
  assert(
    pending.length === 2 &&
      pending.map((entry) => entry.snapshotKey).join(",") === "key_a,key_b",
    "Pending approvals must be deduplicated by snapshot key",
  );

  const blocking = blockingScriptCompileErrors(errors);
  assert(
    blocking.length === 1 && blocking[0]?.assetId === "asset_d",
    "Only errors other than a pending approval may block Play",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
