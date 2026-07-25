import {
  classifyMcpPlayStartFailure,
  didScriptRuntimeApplyLatestSources,
  filterScriptTrustRunningByAssetIds,
} from "./runtime-report";

/** Pure assertions for MCP Script result semantics and trust reporting. */
export function runScriptRuntimeReportFixtureAssertions(): void {
  const approvalError = {
    assetId: "script-pending",
    code: "SCRIPT_APPROVAL_REQUIRED" as const,
  };
  const compileError = {
    assetId: "script-broken",
  };

  assert(
    classifyMcpPlayStartFailure({
      started: false,
      unapprovedPolicy: "block",
      approvalRequiredCount: 1,
      errors: [approvalError, compileError],
    }) === "approval-required",
    "block mode should preserve the approval-required response",
  );
  assert(
    classifyMcpPlayStartFailure({
      started: false,
      unapprovedPolicy: "skip",
      approvalRequiredCount: 1,
      errors: [approvalError, compileError],
    }) === "compile-failed",
    "skip mode hid a real compiler error behind approval-required",
  );
  assert(
    classifyMcpPlayStartFailure({
      started: true,
      unapprovedPolicy: "skip",
      approvalRequiredCount: 1,
      errors: [approvalError],
    }) === null,
    "a successful skip Play was classified as a failure",
  );

  assert(
    !didScriptRuntimeApplyLatestSources([approvalError], {
      unapprovedPolicy: "block",
      targetAssetIds: ["script-approved"],
    }),
    "block mode reported an update while any approval was pending",
  );
  assert(
    !didScriptRuntimeApplyLatestSources([approvalError], {
      unapprovedPolicy: "skip",
      targetAssetIds: ["script-pending"],
    }),
    "skip mode reported a pending target source as running",
  );
  assert(
    didScriptRuntimeApplyLatestSources([approvalError], {
      unapprovedPolicy: "skip",
      targetAssetIds: ["script-approved"],
    }),
    "an unrelated skipped Asset hid a successfully updated target source",
  );
  assert(
    !didScriptRuntimeApplyLatestSources([compileError], {
      unapprovedPolicy: "skip",
      targetAssetIds: ["script-approved"],
    }),
    "a compiler error reported the latest source as running",
  );
  assert(
    !didScriptRuntimeApplyLatestSources([approvalError], {
      unapprovedPolicy: "skip",
    }),
    "a partial structural runtime synchronization reported full success",
  );

  const running = filterScriptTrustRunningByAssetIds(
    [
      { assetId: "script-removed", sourceSha256: "old" },
      { assetId: "script-active", sourceSha256: "current" },
    ],
    ["script-active", "script-missing"],
  );
  assert(
    running.length === 1 &&
      running[0]?.assetId === "script-active" &&
      running[0]?.sourceSha256 === "current",
    "trust.running included a compiled Script with no current Scene host",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script runtime report fixture failed: ${message}`);
  }
}
