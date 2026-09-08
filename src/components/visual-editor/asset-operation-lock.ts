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
        "3Dモデルの再インポート完了後にアセットをインポートできます",
      );
    }
    if (snapshot.textureProcessingActive) {
      return blocked(
        "texture-processing",
        "テクスチャの変換完了後にアセットをインポートできます",
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
  "asset-import": "動作確認を停止してからアセットをインポートしてください",
  "model-reimport": "動作確認を停止してから3Dモデルを再インポートしてください",
  "model-optimization": "動作確認を停止してから3Dモデルを最適化してください",
  "texture-processing": "動作確認を停止してからテクスチャを変換してください",
};

const BUSY_IMPORT_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "アセットのインポートが進行中です",
  "model-reimport": "アセットのインポート完了後に3Dモデルを再インポートできます",
  "model-optimization": "アセットのインポート完了後に3Dモデルを最適化できます",
  "texture-processing": "アセットのインポート完了後にテクスチャを変換できます",
};

/** Model最適化は原本を差し替えるので、再インポートと同じ排他区間で扱う。 */
const MODEL_BUSY_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "3Dモデルの再インポート完了後にアセットをインポートできます",
  "model-reimport": "3Dモデルの再インポートが進行中です",
  "model-optimization": "3Dモデルの再インポート完了後に3Dモデルを最適化できます",
  "texture-processing": "3Dモデルの再インポート完了後にテクスチャを変換できます",
};

const TEXTURE_BUSY_REASONS: Record<AssetOperationKind, string> = {
  "asset-import": "テクスチャの変換完了後にアセットをインポートできます",
  "model-reimport": "テクスチャの変換完了後に3Dモデルを再インポートできます",
  "model-optimization": "テクスチャの変換完了後に3Dモデルを最適化できます",
  "texture-processing": "テクスチャの変換が進行中です",
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
