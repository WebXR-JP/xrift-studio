import {
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type TextureAsset,
  type TextureCompressionFormat,
  type TextureSourceFormat,
} from "./asset-manifest";

/**
 * Texture Import設定（最大解像度・2のべき乗・圧縮）の「変換後がどうなるか」だけを
 * 決める純粋な計算をまとめる。
 *
 * Inspectorで明示的に画像へ適用するときに使う。公開時は加工せず、
 * エディターが現在表示している画像をそのまま配る。
 * Canvasにもファイル入出力にも触れないので、Compilerのfixtureからも呼べる。
 */

export const TEXTURE_MAX_SIZE_CHOICES = [256, 512, 1024, 2048, 4096, 8192] as const;

/** 自動最適化（VRAM推奨）がResizeで押さえる長辺。診断と適用で同じ値を使う。 */
export const RECOMMENDED_TEXTURE_MAX_SIZE = 2048;

export type TextureMaxSizeChoice = (typeof TEXTURE_MAX_SIZE_CHOICES)[number];

/** Canvas / KTX2エンコーダで書き出せる形式。 */
export type TextureOutputFormat = "png" | "jpeg" | "webp" | "ktx2";

/** 解像度変更・圧縮を実行できる原本の形式。 */
export const CONVERTIBLE_TEXTURE_SOURCE_FORMATS: readonly TextureSourceFormat[] = [
  "png",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "bmp",
];

export function isConvertibleTextureSourceFormat(
  format: TextureSourceFormat | undefined,
): boolean {
  return format !== undefined && CONVERTIBLE_TEXTURE_SOURCE_FORMATS.includes(format);
}

/**
 * Inspectorで画像へ適用する変換の内容。
 *
 * 明示的な適用操作で、この内容に従って画像を作り直す。
 */
export type TextureConversion = {
  sourceFormat: TextureSourceFormat;
  outputFormat: TextureOutputFormat;
  /** 出力ファイルの拡張子。JPEGだけ `jpg` になる。 */
  extension: string;
  mimeType: string;
  maxSize: number | null;
  powerOfTwo: boolean;
  quality: number;
  /** PNG / KTX2以外の可逆でない形式でだけQualityが効く。 */
  qualityApplies: boolean;
  generateMipmaps: boolean;
  srgb: boolean;
  /** 原本形式を保てず別形式で書き出す場合にtrue。 */
  outputFormatSubstituted: boolean;
};

/**
 * いま設定されているImport設定を、画像へ明示的に適用するための計画。
 *
 * 原本がすでに設定を満たしている、変換に対応していない形式、環境Texture（HDRI）の
 * ような「変換しても意味がない・できない」場合は `null` を返す。
 */
export function planTextureConversion(asset: TextureAsset): TextureConversion | null {
  if (asset.kind !== "texture") return null;
  if (asset.status !== "ready") return null;
  if (asset.source.kind !== "project") return null;
  // HDRIはCanvasでは階調を保てない。解像度は書き出し元で調整する。
  if (isEnvironmentTextureAsset(asset)) return null;

  const sourceFormat = getTextureSourceFormat(asset);
  if (!isConvertibleTextureSourceFormat(sourceFormat) || !sourceFormat) return null;

  const settings = asset.importSettings;
  const maxSize = settings.resize.mode === "max-size" ? settings.resize.maxSize : null;
  const powerOfTwo = settings.resize.powerOfTwo === true;
  const width = asset.importMetadata?.width ?? null;
  const height = asset.importMetadata?.height ?? null;
  const outputFormat = resolveOutputFormat(sourceFormat, settings.compression.format);
  const fitted =
    width !== null && height !== null
      ? resolveTargetSize(width, height, maxSize, powerOfTwo, outputFormat)
      : null;
  // 解像度が分からない原本は、指定がある限り実際に描き直して確かめるしかない。
  const resizePending =
    (maxSize !== null || powerOfTwo) &&
    (fitted === null || fitted.width !== width || fitted.height !== height);
  const formatPending = settings.compression.format !== "source";
  if (!resizePending && !formatPending) return null;

  return {
    sourceFormat,
    outputFormat,
    extension: textureOutputExtension(outputFormat),
    mimeType: mimeTypeOf(outputFormat),
    maxSize,
    powerOfTwo,
    quality: settings.compression.quality,
    qualityApplies: outputFormat !== "png",
    generateMipmaps: settings.generateMipmaps,
    srgb: settings.colorSpace === "srgb",
    outputFormatSubstituted:
      settings.compression.format === "source" && outputFormat !== sourceFormat,
  };
}

/**
 * 公開したTextureが最終的にどの形式で配られるか。
 *
 * 未適用の加工設定は公開時に実行しない。エディターと同じ画像形式で読み込む。
 */
export function resolvePublishedTextureFormat(
  asset: TextureAsset,
): TextureSourceFormat | TextureOutputFormat | undefined {
  return getTextureSourceFormat(asset);
}

export function isPublishedAsKtx2(asset: TextureAsset): boolean {
  return resolvePublishedTextureFormat(asset) === "ktx2";
}

export function fitWithin(
  width: number,
  height: number,
  maxSize: number | null,
): { width: number; height: number } {
  if (!maxSize || maxSize <= 0) return { width, height };
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Canvasが確実に扱える上限。これを超える辺は端末によって描画できない。 */
const MAX_RENDERED_TEXTURE_SIZE = 8192;

/**
 * 辺を最も近い2のべき乗へ丸める。最大解像度が指定されていればそれを超えない。
 *
 * KTX2 / BasisのGPU圧縮、mipmap、repeat wrapはどれも2のべき乗の辺を前提に
 * 設計されているため、1000 × 600のような半端な原本は 1024 × 512 にした方が
 * 転送先のGPU形式でも扱いが素直になる。縦横は別々に丸めるので、アスペクト比は
 * わずかに変わる。
 */
export function nearestPowerOfTwo(size: number, maxSize: number | null): number {
  const ceiling = Math.min(
    MAX_RENDERED_TEXTURE_SIZE,
    maxSize && maxSize > 0 ? maxSize : MAX_RENDERED_TEXTURE_SIZE,
  );
  if (!Number.isFinite(size) || size <= 1) return 1;
  const exponent = Math.round(Math.log2(size));
  const snapped = 2 ** Math.max(0, exponent);
  return Math.max(1, Math.min(ceiling, snapped));
}

/** 最大解像度へ収めてから、必要なら辺を2のべき乗へ丸める。 */
export function resolveTargetSize(
  width: number,
  height: number,
  maxSize: number | null,
  powerOfTwo: boolean,
  outputFormat?: TextureOutputFormat,
): { width: number; height: number } {
  const fitted = fitWithin(width, height, maxSize);
  const target = powerOfTwo ? {
    width: nearestPowerOfTwo(fitted.width, maxSize),
    height: nearestPowerOfTwo(fitted.height, maxSize),
  } : fitted;
  if (outputFormat !== "ktx2") return target;
  // WebGL's ETC/BC upload paths require the base level to cover complete 4x4
  // blocks. Resize the whole image to the nearest valid extent; never crop it.
  const ceiling = maxSize === null ? Infinity : Math.max(4, Math.floor(maxSize / 4) * 4);
  const align = (size: number) => Math.max(4, Math.min(ceiling, Math.round(size / 4) * 4));
  return { width: align(target.width), height: align(target.height) };
}

export function resolveOutputFormat(
  sourceFormat: TextureSourceFormat,
  compressionFormat: TextureCompressionFormat,
): TextureOutputFormat {
  if (compressionFormat === "ktx2") return "ktx2";
  if (compressionFormat === "webp") return "webp";
  // Canvasが書き戻せるのはPNG / JPEG / WEBPだけなので、それ以外はWEBPへ寄せる。
  if (sourceFormat === "png" || sourceFormat === "jpeg" || sourceFormat === "webp") {
    return sourceFormat;
  }
  return "webp";
}

export function mimeTypeOf(format: TextureOutputFormat): string {
  if (format === "ktx2") return "image/ktx2";
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

export function textureOutputExtension(format: TextureOutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

/**
 * Basis / KTX2のqualityLevelは 1..255 の探索量で、JPEGの画質パーセントとは
 * 意味が違う。Import設定の 0..100 をここで一度だけ写像する。
 */
export function ktx2QualityLevel(quality: number): number {
  const normalized = Number.isFinite(quality) ? quality : 100;
  return Math.max(1, Math.min(255, Math.round((normalized / 100) * 254) + 1));
}

/** 変換結果は原本と混ざらないよう、専用ディレクトリへハッシュ名で書き出す。 */
export function processedAssetPath(
  assetId: string,
  hash: string,
  extension: string,
): string {
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64);
  return `assets/.optimized/${safeAssetId}-${hash.slice(0, 16)}.${extension}`;
}
