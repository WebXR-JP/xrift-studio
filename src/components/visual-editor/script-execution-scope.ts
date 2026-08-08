/**
 * Identity and approval helpers for the Script execution scope.
 *
 * Script approval is project-scoped: the same source approved in one project
 * must not run in another, and a moved project must be re-resolved before its
 * approvals apply. These comparisons decide when the shell has to rebuild the
 * scope instead of reusing the resolved one.
 */
import type { ScriptCompileError } from "./useScriptRuntime";
import type {
  ScriptExecutionFingerprint,
  ScriptSourceSnapshot,
} from "../../lib/visual-editor/scripting/script-trust";

export type ScriptExecutionScopeInput = {
  projectId: string;
  projectPath: string | null;
};

export type ResolvedScriptExecutionScope = ScriptExecutionScopeInput & {
  canonicalProjectPath: string;
};

export function sameScriptExecutionScopeInput(
  left: ScriptExecutionScopeInput,
  right: ScriptExecutionScopeInput,
): boolean {
  return (
    left.projectId === right.projectId && left.projectPath === right.projectPath
  );
}

export function sameResolvedScriptExecutionScope(
  left: ResolvedScriptExecutionScope,
  right: ResolvedScriptExecutionScope,
): boolean {
  return (
    sameScriptExecutionScopeInput(left, right) &&
    left.canonicalProjectPath === right.canonicalProjectPath
  );
}

/**
 * Keys an approval by everything that changes what the Script may do, so
 * editing the source or widening the module policy requires a new approval.
 */
export function scriptTrustFingerprintKey(
  fingerprint: ScriptExecutionFingerprint,
): string {
  return JSON.stringify([
    fingerprint.sourceSha256,
    fingerprint.language,
    fingerprint.contractVersion,
    fingerprint.modulePolicyVersion,
    fingerprint.allowRemoteModules,
  ]);
}

/** Collects the distinct sources Play is waiting on the author to approve. */
export function approvalRequiredSnapshots(
  errors: readonly ScriptCompileError[],
): ScriptSourceSnapshot[] {
  const snapshots = new Map<string, ScriptSourceSnapshot>();
  for (const error of errors) {
    if (error.code === "SCRIPT_APPROVAL_REQUIRED" && error.trustSnapshot) {
      snapshots.set(error.trustSnapshot.snapshotKey, error.trustSnapshot);
    }
  }
  return [...snapshots.values()];
}

/** Errors that keep Play from starting, as opposed to a pending approval. */
export function blockingScriptCompileErrors(
  errors: readonly ScriptCompileError[],
): ScriptCompileError[] {
  return errors.filter((error) => error.code !== "SCRIPT_APPROVAL_REQUIRED");
}
