import type { PendingImport, PendingImportStatus } from "./types";

export type AssetOperationKind =
  | "asset-import"
  | "model-reimport"
  | "model-optimization"
  | "texture-processing";

export type AssetOperationSnapshot = Readonly<{
  readOnly: boolean;
  assetImportActive: boolean;
  modelReimportActive: boolean;
  textureProcessingActive: boolean;
}>;

export type AssetOperationBlocker =
  | "read-only"
  | "asset-import"
  | "model-reimport"
  | "texture-processing"
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
 * Central decision for the Asset source operations.
 *
 * A running regular import may accept more files into the same queue. Model reimport
 * and Texture conversion are exclusive because each replaces one Asset's last-good
 * source and metadata.
 */
export function resolveAssetOperationAvailability(
  requested: AssetOperationKind,
  snapshot: AssetOperationSnapshot,
): AssetOperationAvailability {
  if (snapshot.readOnly) {
    return blocked("read-only", READ_ONLY_REASONS[requested]);
  }

  if (requested === "asset-import") {
    if (snapshot.modelReimportActive) {
      return blocked(
        "model-reimport",
        "Modelの再インポート完了後にアセットをインポートできます",
      );
    }
    if (snapshot.textureProcessingActive) {
      return blocked(
        "texture-processing",
        "Textureの変換完了後にアセットをインポートできます",
      );
    }

    // Adding more files to the already-running regular queue is intentional.
    return available();
  }

  if (snapshot.assetImportActive) {
    return blocked("asset-import", BUSY_IMPORT_REASONS[requested]);
  }
  if (snapshot.modelReimportActive) {
    return blocked("model-reimport", MODEL_BUSY_REASONS[requested]);
  }
  if (snapshot.textureProcessingActive) {
    return blocked("texture-processing", TEXTURE_BUSY_REASONS[requested]);
  }

  return available();
}

const READ_ONLY_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "Playを停止してからアセットをインポートしてください",
  "model-reimport": "Playを停止してからModelを再インポートしてください",
  "model-optimization": "Playを停止してからModelを最適化してください",
  "texture-processing": "Playを停止してからTextureを変換してください",
};

const BUSY_IMPORT_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "アセットのインポートが進行中です",
  "model-reimport": "アセットのインポート完了後にModelを再インポートできます",
  "model-optimization": "アセットのインポート完了後にModelを最適化できます",
  "texture-processing": "アセットのインポート完了後にTextureを変換できます",
};

/** Model最適化は原本を差し替えるので、再インポートと同じ排他区間で扱う。 */
const MODEL_BUSY_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "Modelの再インポート完了後にアセットをインポートできます",
  "model-reimport": "Modelの再インポートが進行中です",
  "model-optimization": "Modelの再インポート完了後にModelを最適化できます",
  "texture-processing": "Modelの再インポート完了後にTextureを変換できます",
};

const TEXTURE_BUSY_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "Textureの変換完了後にアセットをインポートできます",
  "model-reimport": "Textureの変換完了後にModelを再インポートできます",
  "model-optimization": "Textureの変換完了後にModelを最適化できます",
  "texture-processing": "Textureの変換が進行中です",
};

function available(): AssetOperationAvailability {
  return { allowed: true, blocker: null, disabledReason: null };
}

function blocked(
  blocker: Exclude<AssetOperationBlocker, null>,
  disabledReason: string,
): AssetOperationAvailability {
  return { allowed: false, blocker, disabledReason };
}
