/**
 * Rust側の `commit_visual_asset_import` は、書き込み先ディレクトリと
 * transaction id をどちらも許可リストで検証する。フロント側で id を素の
 * テンプレート文字列から組み立てていたため、Texture変換と自動最適化は
 * `invalid asset import transaction id` で必ず失敗していた。
 *
 * ここで id の生成と検証を1か所へ寄せ、fixtureでRust側の規則と突き合わせる。
 */

/** Rust: `validate_asset_import_transaction_id` と同じ規則。 */
const TRANSACTION_ID_PREFIX = "asset-import-";
const TRANSACTION_ID_MIN_LENGTH = "asset-import-x".length;
const TRANSACTION_ID_MAX_LENGTH = 96;

/** Rust: `validate_asset_import_path` が受け付ける書き込み先。 */
export const ASSET_IMPORT_PATH_PREFIXES = [
  "assets/imported/",
  "assets/.derived/thumbnails/",
  "assets/.optimized/",
] as const;

export function isValidAssetImportTransactionId(transactionId: string): boolean {
  const id = transactionId.trim();
  return (
    id.length >= TRANSACTION_ID_MIN_LENGTH &&
    id.length <= TRANSACTION_ID_MAX_LENGTH &&
    id.startsWith(TRANSACTION_ID_PREFIX) &&
    /^[A-Za-z0-9_-]+$/.test(id)
  );
}

export function isValidAssetImportPath(relativePath: string): boolean {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.endsWith("/")) return false;
  return ASSET_IMPORT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * `asset-import-<scope>-<一意な接尾辞>` を返す。scopeは読みやすさのためだけの
 * ラベルで、Rust側の文字集合へ丸めてから使う。
 */
export function createAssetImportTransactionId(scope: string): string {
  const safeScope = scope
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const id = `${TRANSACTION_ID_PREFIX}${safeScope ? `${safeScope}-` : ""}${unique}`.slice(
    0,
    TRANSACTION_ID_MAX_LENGTH,
  );
  // 呼び出し側が壊れたidをRustへ渡さないよう、ここで必ず弾く。
  if (!isValidAssetImportTransactionId(id)) {
    throw new Error("Asset書き込み用のtransaction idを生成できませんでした。");
  }
  return id;
}

/**
 * Rust側の失敗メッセージは原因を英語の内部語彙で返す。そのまま画面へ出すと
 * 「何をすれば直るのか」が分からないので、次の一手が分かる文へ置き換える。
 */
export function describeAssetImportFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("invalid asset import transaction id")) {
    return "書き込み処理の識別子をStudioが正しく作れませんでした。Studioを再起動しても続く場合は不具合として報告してください。";
  }
  if (raw.includes("outside the managed Asset folders")) {
    return "変換結果の保存先がAsset管理フォルダーの外でした。Studioを最新版へ更新してください。";
  }
  if (raw.includes("has different content")) {
    return "同じ名前の変換結果が別内容で残っています。Assetを選び直してもう一度変換してください。";
  }
  if (raw.includes("transaction is too large")) {
    return "一度に書き出す容量が上限を超えました。選択するAssetを減らして変換し直してください。";
  }
  if (raw.includes("invalid write count")) {
    return "一度に変換できるAsset数の上限を超えました。選択を分けて変換してください。";
  }
  if (raw.includes("payload size is invalid")) {
    return "変換結果のサイズが上限を超えました。最大解像度を下げてから変換してください。";
  }
  if (raw.includes("duplicate targets")) {
    return "同じ保存先へ複数の変換結果が向いています。選択を減らしてもう一度試してください。";
  }
  return raw;
}
