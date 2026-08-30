import {
  ASSET_IMPORT_PATH_PREFIXES,
  createAssetImportTransactionId,
  describeAssetImportFailure,
  isValidAssetImportPath,
  isValidAssetImportTransactionId,
} from "./asset-import-transaction";
import { processedAssetPath } from "./texture-processing";

/**
 * Rust側の `commit_visual_asset_import` は、transaction idと書き込み先を
 * 許可リストで検証する。フロントが規則を外した文字列を渡すと、Texture変換も
 * 自動最適化も実行前に失敗する。ここで両方の規則を固定する。
 */
export function runAssetImportTransactionFixtureAssertions(): void {
  assertTransactionIds();
  assertWritePaths();
  assertFailureMessages();
}

function assertTransactionIds(): void {
  for (const scope of ["texture", "optimize", "model-optimize"]) {
    const id = createAssetImportTransactionId(scope);
    assert(
      isValidAssetImportTransactionId(id),
      `Generated transaction id was rejected by the shared validator: ${id}`,
    );
    assert(
      id.startsWith(`asset-import-${scope}-`),
      `Generated transaction id lost its scope label: ${id}`,
    );
  }
  assert(
    createAssetImportTransactionId("texture") !==
      createAssetImportTransactionId("texture"),
    "Two transactions in the same millisecond shared an id",
  );
  assert(
    isValidAssetImportTransactionId(createAssetImportTransactionId("ﾃｸｽﾁｬ 変換")),
    "A non-ASCII scope label produced an id Rust would reject",
  );
  assert(
    isValidAssetImportTransactionId(createAssetImportTransactionId("x".repeat(200))),
    "A long scope label pushed the id past the accepted length",
  );

  // 実際に事故が起きた形。プレフィックスがないと Rust 側で必ず弾かれる。
  assert(
    !isValidAssetImportTransactionId("texture-convert-abc123"),
    "The pre-fix texture conversion id was accepted",
  );
  assert(
    !isValidAssetImportTransactionId("asset-optimize-abc123"),
    "The pre-fix optimization id was accepted",
  );
  assert(
    !isValidAssetImportTransactionId("asset-import-a/b"),
    "A path separator was accepted inside a transaction id",
  );
  assert(
    !isValidAssetImportTransactionId("asset-import-"),
    "An id without a suffix was accepted",
  );
}

function assertWritePaths(): void {
  // Texture変換と最適化の書き出し先が許可リストに載っていること。
  const processed = processedAssetPath("texture-abc", "0".repeat(64), "ktx2");
  assert(
    isValidAssetImportPath(processed),
    `The conversion output directory is not an allowed import target: ${processed}`,
  );
  assert(
    ASSET_IMPORT_PATH_PREFIXES.some((prefix) => processed.startsWith(prefix)),
    "The conversion output directory drifted from the shared prefix list",
  );
  assert(
    isValidAssetImportPath("assets/imported/models/a/b.glb") &&
      isValidAssetImportPath("assets/.derived/thumbnails/a.png"),
    "An existing managed import target was rejected",
  );
  assert(
    !isValidAssetImportPath("public/thumbnail.png") &&
      !isValidAssetImportPath("assets/other/a.png") &&
      !isValidAssetImportPath("assets/.optimized/../../escape.png"),
    "An unmanaged import target was accepted",
  );
}

function assertFailureMessages(): void {
  const rewritten = describeAssetImportFailure(
    new Error("invalid asset import transaction id"),
  );
  assert(
    !rewritten.includes("transaction"),
    "The internal Rust wording still reaches the author",
  );
  assert(
    describeAssetImportFailure(new Error("画像を読み込めませんでした。")) ===
      "画像を読み込めませんでした。",
    "A message that is already actionable was rewritten",
  );
  assert(
    describeAssetImportFailure("plain string") === "plain string",
    "A non-Error rejection value was dropped",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
