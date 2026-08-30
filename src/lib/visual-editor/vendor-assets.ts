/**
 * 公開したワールドが自前で配る decoder ファイルの一覧。
 *
 * KTX2 や Draco のように、読み込みに decoder / transcoder を必要とする形式は
 * 「Asset を配れば動く」形式ではない。decoder が無ければ CDN を取りに行き、
 * 公開したワールドは通信権限を持たないので読み込みごと失敗する。どの形式が
 * どのファイルを必要とするかをここに一箇所だけ持ち、生成コード・Runtime
 * manifest・staging のコピー計画がすべて同じ表を見るようにする。
 *
 * 形式を増やすときは、ここに bundle を足し、compiler の
 * `resolveRequiredVendorBundles` に判定を足す。生成コードの文字列を見て
 * 同梱を決めない。出力モードごとに生成物の形が違うので、文字列一致は
 * 片方の出力モードで静かに外れる。
 */
export type VendorBundleId = "three-basis" | "three-draco";

export type VendorBundle = {
  readonly id: VendorBundleId;
  /** 診断文で使う、作者に見える名前。 */
  readonly label: string;
  /**
   * Studio 自身が読み込むときの public directory。
   *
   * scripts/vite-local-three-vendor.ts が同じ値で配信・出力する。
   */
  readonly localDirectory: string;
  /**
   * 公開用 staging の public directory。XRift の `baseUrl` からの相対。
   */
  readonly publishedDirectory: string;
  readonly files: readonly string[];
};

export const VENDOR_BUNDLES = {
  "three-basis": {
    id: "three-basis",
    label: "KTX2変換ファイル",
    localDirectory: "visual-editor/vendor/three-basis",
    publishedDirectory: "xrift-studio/vendor/three-basis",
    files: ["basis_transcoder.js", "basis_transcoder.wasm", "README.md"],
  },
  "three-draco": {
    id: "three-draco",
    label: "Dracoデコーダー",
    localDirectory: "visual-editor/vendor/three-draco",
    publishedDirectory: "xrift-studio/vendor/three-draco",
    files: [
      "draco_decoder.js",
      "draco_decoder.wasm",
      "draco_wasm_wrapper.js",
      "README.md",
    ],
  },
} as const satisfies Record<VendorBundleId, VendorBundle>;

export const VENDOR_BUNDLE_IDS = Object.keys(
  VENDOR_BUNDLES,
) as readonly VendorBundleId[];

/**
 * Studio 内で decoder を読み込むディレクトリ URL。
 *
 * Vite の BASE_URL を使うので、root 直下の Tauri アプリでも、path prefix の
 * 下にホストしたビルドでも同じ helper が使える。
 */
export function resolveLocalVendorAssetPath(
  id: VendorBundleId,
  baseUrl: string = import.meta.env?.BASE_URL ?? "/",
): string {
  const normalizedBase = baseUrl.trim() || "/";
  const baseWithTrailingSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;
  return `${baseWithTrailingSlash}${VENDOR_BUNDLES[id].localDirectory}/`;
}
