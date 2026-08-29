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
    textureProcessingActive: false,
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
  const textureDuringReimport = resolveAssetOperationAvailability(
    "texture-processing",
    modelReimportActive,
  );
  assert(
    !textureDuringReimport.allowed &&
      textureDuringReimport.blocker === "model-reimport",
    "Texture conversion was not blocked by a running Model reimport",
  );

  const textureProcessingActive = {
    ...idle,
    textureProcessingActive: true,
  };
  assert(
    resolveAssetOperationAvailability("texture-processing", idle).allowed,
    "Idle editor rejected a Texture conversion",
  );
  const secondTexture = resolveAssetOperationAvailability(
    "texture-processing",
    textureProcessingActive,
  );
  assert(
    !secondTexture.allowed && secondTexture.blocker === "texture-processing",
    "A second Texture conversion was accepted",
  );
  const importDuringTexture = resolveAssetOperationAvailability(
    "asset-import",
    textureProcessingActive,
  );
  assert(
    !importDuringTexture.allowed &&
      importDuringTexture.blocker === "texture-processing" &&
      Boolean(importDuringTexture.disabledReason),
    "Regular import was not blocked by a running Texture conversion",
  );
  const reimportDuringTexture = resolveAssetOperationAvailability(
    "model-reimport",
    textureProcessingActive,
  );
  assert(
    !reimportDuringTexture.allowed &&
      reimportDuringTexture.blocker === "texture-processing",
    "Model reimport was not blocked by a running Texture conversion",
  );
  const textureDuringRegular = resolveAssetOperationAvailability(
    "texture-processing",
    regularImportActive,
  );
  assert(
    !textureDuringRegular.allowed &&
      textureDuringRegular.blocker === "asset-import",
    "Texture conversion was not blocked by a running regular import",
  );
  const textureReadOnly = resolveAssetOperationAvailability(
    "texture-processing",
    { ...idle, readOnly: true },
  );
  assert(
    !textureReadOnly.allowed &&
      textureReadOnly.blocker === "read-only" &&
      Boolean(textureReadOnly.disabledReason),
    "Play mode did not block Texture conversion",
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
    "updated",
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
