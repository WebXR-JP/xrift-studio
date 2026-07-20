import {
  hasActiveAssetImport,
  isAssetImportOperationActive,
  resolveAssetOperationAvailability,
} from "./asset-operation-lock";
import type { PendingImportStatus } from "./types";

/** Filesystem-free assertions for exclusive Asset source operations. */
export function runAssetOperationLockFixtureAssertions(): void {
  const idle = {
    readOnly: false,
    assetImportActive: false,
    modelReimportActive: false,
  } as const;
  assert(
    resolveAssetOperationAvailability("asset-import", idle).allowed,
    "Idle editor rejected a regular Asset import",
  );
  assert(
    resolveAssetOperationAvailability("model-reimport", idle).allowed,
    "Idle editor rejected a Model reimport",
  );

  const regularImportActive = {
    ...idle,
    assetImportActive: true,
  };
  assert(
    resolveAssetOperationAvailability("asset-import", regularImportActive)
      .allowed,
    "A running regular import stopped additional files joining its queue",
  );
  const reimportDuringRegular = resolveAssetOperationAvailability(
    "model-reimport",
    regularImportActive,
  );
  assert(
    !reimportDuringRegular.allowed &&
      reimportDuringRegular.blocker === "asset-import" &&
      Boolean(reimportDuringRegular.disabledReason),
    "Model reimport was not blocked by a running regular import",
  );

  const modelReimportActive = {
    ...idle,
    modelReimportActive: true,
  };
  const importDuringReimport = resolveAssetOperationAvailability(
    "asset-import",
    modelReimportActive,
  );
  assert(
    !importDuringReimport.allowed &&
      importDuringReimport.blocker === "model-reimport" &&
      Boolean(importDuringReimport.disabledReason),
    "Regular import was not blocked by a running Model reimport",
  );
  assert(
    !resolveAssetOperationAvailability("model-reimport", modelReimportActive)
      .allowed,
    "A second Model reimport was accepted",
  );

  const readOnly = resolveAssetOperationAvailability("asset-import", {
    ...idle,
    readOnly: true,
  });
  assert(
    !readOnly.allowed && readOnly.blocker === "read-only",
    "Play mode did not block Asset import",
  );

  const activeStatuses: PendingImportStatus[] = [
    "queued",
    "reading",
    "processing",
    "committing",
  ];
  const inactiveStatuses: PendingImportStatus[] = [
    "waiting-save",
    "succeeded",
    "duplicate",
    "failed",
  ];
  assert(
    activeStatuses.every(isAssetImportOperationActive),
    "An active import stage did not own the operation lock",
  );
  assert(
    inactiveStatuses.every((status) => !isAssetImportOperationActive(status)),
    "A non-running queue entry incorrectly owned the operation lock",
  );
  assert(
    hasActiveAssetImport([
      { status: "succeeded" },
      { status: "processing" },
    ]),
    "Active import detection missed a processing queue entry",
  );
  assert(
    !hasActiveAssetImport([
      { status: "waiting-save" },
      { status: "failed" },
    ]),
    "Inactive import entries were treated as a running operation",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
