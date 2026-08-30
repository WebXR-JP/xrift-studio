import {
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type AssetManifest,
  type TextureAsset,
  type TextureCompressionFormat,
  type TextureSourceFormat,
} from "./asset-manifest";

/**
 * Texture Import設定（最大解像度・2のべき乗・圧縮）の「変換後がどうなるか」だけを
 * 決める純粋な計算をまとめる。
 *
 * 同じ計算を、原本を書き換えるInspectorの書き出し（texture-processing.ts）と、
 * 原本を書き換えない公開時の変換（compiler / publish / upload）の両方が使う。
 * Canvasにもファイル入出力にも触れないので、Compilerのfixtureからも呼べる。
 */

export const TEXTURE_MAX_SIZE_CHOICES = [256, 512, 1024, 2048, 4096, 8192] as const;

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
 * 公開・書き出しのときに原本へ適用する変換の内容。
 *
 * `null` を返す場合は原本をそのまま配れる。ここに値があるときだけ、
 * 出力側が画像を作り直す。
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
 * いま設定されているImport設定を、原本を書き換えずに出力側で適用するための計画。
 *
 * 原本がすでに設定を満たしている、変換に対応していない形式、環境Texture（HDRI）の
 * ような「変換しても意味がない・できない」場合は `null` を返す。公開は原本の
 * コピーで成立するので、呼び出し側は `null` を失敗として扱わない。
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
  const fitted =
    width !== null && height !== null
      ? resolveTargetSize(width, height, maxSize, powerOfTwo)
      : null;
  // 解像度が分からない原本は、指定がある限り実際に描き直して確かめるしかない。
  const resizePending =
    (maxSize !== null || powerOfTwo) &&
    (fitted === null || fitted.width !== width || fitted.height !== height);
  const formatPending = settings.compression.format !== "source";
  if (!resizePending && !formatPending) return null;

  const outputFormat = resolveOutputFormat(sourceFormat, settings.compression.format);
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
 * 未反映のImport設定は公開時に適用されるため、原本の拡張子だけを見ると
 * KTX2で配るTextureを通常の画像として読み込む生成コードになってしまう。
 */
export function resolvePublishedTextureFormat(
  asset: TextureAsset,
): TextureSourceFormat | TextureOutputFormat | undefined {
  return planTextureConversion(asset)?.outputFormat ?? getTextureSourceFormat(asset);
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
): { width: number; height: number } {
  const fitted = fitWithin(width, height, maxSize);
  if (!powerOfTwo) return fitted;
  return {
    width: nearestPowerOfTwo(fitted.width, maxSize),
    height: nearestPowerOfTwo(fitted.height, maxSize),
  };
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

export type TexturePublishConversionEntry = {
  assetId: string;
  assetName: string;
  /** 変換前の見え方。例: `4096 × 4096・PNG` */
  from: string;
  /** 公開されるものの見え方。例: `1024 × 1024・KTX2` */
  to: string;
};

export type TexturePublishConversionSummary = {
  /** 公開時に作り直すTexture。制作データの原本はそのまま残る。 */
  converted: TexturePublishConversionEntry[];
  /** 設定はあるが原本の形式が対応せず、原本のまま公開されるTexture。 */
  ignored: { assetId: string; assetName: string }[];
};

/**
 * 公開したときにTextureがどうなるかを、公開前に読める形へまとめる。
 *
 * 「設定したのに反映されていない」という状態を診断で知らせるのではなく、
 * 「公開すればこうなる」を先に見せるための材料。
 */
export function summarizeTexturePublishConversions(
  assets: AssetManifest,
): TexturePublishConversionSummary {
  const converted: TexturePublishConversionEntry[] = [];
  const ignored: { assetId: string; assetName: string }[] = [];
  for (const asset of Object.values(assets.assets).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (asset.kind !== "texture") continue;
    if (asset.status !== "ready") continue;
    if (asset.source.kind !== "project") continue;
    if (
      asset.importSettings.compression.format === "source" &&
      asset.importSettings.resize.mode === "original" &&
      asset.importSettings.resize.powerOfTwo !== true
    ) {
      continue;
    }
    const conversion = planTextureConversion(asset);
    if (!conversion) {
      // 原本がすでに設定を満たしているだけなら、知らせることは何もない。環境
      // Texture（HDRI）に解像度設定が効かないことはInspectorが説明する。
      if (isEnvironmentTextureAsset(asset)) continue;
      if (isConvertibleTextureSourceFormat(getTextureSourceFormat(asset))) continue;
      ignored.push({ assetId: asset.id, assetName: asset.name });
      continue;
    }
    const width = asset.importMetadata?.width ?? null;
    const height = asset.importMetadata?.height ?? null;
    const target =
      width !== null && height !== null
        ? resolveTargetSize(width, height, conversion.maxSize, conversion.powerOfTwo)
        : null;
    converted.push({
      assetId: asset.id,
      assetName: asset.name,
      from: `${width !== null && height !== null ? `${width} × ${height}` : "解像度不明"}・${conversion.sourceFormat.toUpperCase()}`,
      to: `${
        target
          ? `${target.width} × ${target.height}`
          : conversion.maxSize
            ? `最大 ${conversion.maxSize}px`
            : "解像度そのまま"
      }・${conversion.outputFormat === "jpeg" ? "JPEG" : conversion.outputFormat.toUpperCase()}`,
    });
  }
  return { converted, ignored };
}
