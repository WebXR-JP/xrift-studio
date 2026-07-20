import type { PendingImport, PendingImportStatus } from "./types";

export type AssetOperationKind = "asset-import" | "model-reimport";

export type AssetOperationSnapshot = Readonly<{
  readOnly: boolean;
  assetImportActive: boolean;
  modelReimportActive: boolean;
}>;

export type AssetOperationBlocker =
  | "read-only"
  | "asset-import"
  | "model-reimport"
  | null;

export type AssetOperationAvailability = Readonly<{
  allowed: boolean;
  blocker: AssetOperationBlocker;
  disabledReason: string | null;
}>;

const ACTIVE_IMPORT_STATUSES = new Set<PendingImportStatus>([
  "queued",
  "reading",
  "processing",
  "committing",
]);

/**
 * Returns true only while an import can still mutate the Asset Manifest.
 * Waiting-for-save and terminal queue entries remain visible without owning the lock.
 */
export function isAssetImportOperationActive(
  status: PendingImportStatus,
): boolean {
  return ACTIVE_IMPORT_STATUSES.has(status);
}

export function hasActiveAssetImport(
  entries: ReadonlyArray<Pick<PendingImport, "status">>,
): boolean {
  return entries.some((entry) => isAssetImportOperationActive(entry.status));
}

/**
 * Central decision for the two Asset source operations.
 *
 * A running regular import may accept more files into the same queue. Model reimport
 * is exclusive because it replaces one Asset's last-good source and metadata.
 */
export function resolveAssetOperationAvailability(
  requested: AssetOperationKind,
  snapshot: AssetOperationSnapshot,
): AssetOperationAvailability {
  if (snapshot.readOnly) {
    return blocked(
      "read-only",
      requested === "asset-import"
        ? "Playを停止してからアセットをインポートしてください"
        : "Playを停止してからModelを再インポートしてください",
    );
  }

  if (requested === "asset-import") {
    if (snapshot.modelReimportActive) {
      return blocked(
        "model-reimport",
        "Modelの再インポート完了後にアセットをインポートできます",
      );
    }

    // Adding more files to the already-running regular queue is intentional.
    return available();
  }

  if (snapshot.assetImportActive) {
    return blocked(
      "asset-import",
      "アセットのインポート完了後にModelを再インポートできます",
    );
  }
  if (snapshot.modelReimportActive) {
    return blocked(
      "model-reimport",
      "Modelの再インポートが進行中です",
    );
  }

  return available();
}

function available(): AssetOperationAvailability {
  return { allowed: true, blocker: null, disabledReason: null };
}

function blocked(
  blocker: Exclude<AssetOperationBlocker, null>,
  disabledReason: string,
): AssetOperationAvailability {
  return { allowed: false, blocker, disabledReason };
}
