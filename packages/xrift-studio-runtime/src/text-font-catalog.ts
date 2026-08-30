/**
 * Curated Google Fonts available to the Text component.
 *
 * Studio, the editor viewport, the published runtime and the generated Classic
 * source all resolve a font from this one table, so a world shows the same
 * lettering wherever it is opened. The document stores only `fontId`; the file
 * URL is derived here, which keeps the pinned CDN version in a single place.
 *
 * Why `@fontsource` files rather than the Google Fonts CSS API:
 *
 * - troika-three-text parses `.ttf`, `.otf` and WOFF 1.0, but explicitly
 *   rejects WOFF2, and the CSS API serves WOFF2 to any modern browser. The
 *   `@fontsource` packages publish both, so the `.woff` file is the one that
 *   can actually be parsed into an SDF atlas.
 * - `fonts.gstatic.com` paths carry an opaque `/v<n>/` revision that changes
 *   whenever Google re-publishes a family, which would silently break a world
 *   that was published months earlier. An npm version is immutable.
 *
 * Every family here is licensed under the SIL Open Font License 1.1; see
 * THIRD_PARTY_ASSETS.md for the pinned revision and the upstream links.
 */

/** Immutable npm version the file URLs are pinned to. */
export const TEXT_FONT_PACKAGE_VERSION = "5.3.0" as const;

/**
 * Where the font files are fetched from at runtime.
 *
 * Exported so the publish permission a world containing Text has to declare
 * derives its host from this same constant instead of repeating it.
 */
export const TEXT_FONT_FILE_BASE_URL = "https://cdn.jsdelivr.net/npm/@fontsource";

/** Font id meaning "let the runtime pick a Noto face that covers the text". */
export const AUTOMATIC_TEXT_FONT_ID = "auto" as const;

export type XriftTextFontCategory =
  | "sans"
  | "serif"
  | "rounded"
  | "display"
  | "handwriting"
  | "mono";

export type XriftTextFontScript = "japanese" | "latin";

export type XriftTextFontDefinition = {
  /** Stable authoring id stored in the Scene document. */
  id: string;
  /** Family name as published on Google Fonts. */
  label: string;
  /** Short Japanese description of the lettering, shown in the picker. */
  labelJa: string;
  category: XriftTextFontCategory;
  /**
   * Subset file requested from `@fontsource`. The `japanese` subsets of these
   * families also contain Basic Latin, so one file covers a mixed caption.
   */
  subset: XriftTextFontScript;
  /** Weights published for this family, in ascending order. */
  weights: readonly number[];
  license: "OFL-1.1";
};

/**
 * Ordered so the picker reads top-down from "safe for body copy" to
 * "deliberately decorative", with the Japanese families first because that is
 * what signage, captions and wall labels in a Japanese world need.
 */
export const TEXT_FONT_CATALOG: readonly XriftTextFontDefinition[] = [
  japanese("noto-sans-jp", "Noto Sans JP", "標準的なゴシック体", "sans", [400, 700]),
  japanese("noto-serif-jp", "Noto Serif JP", "標準的な明朝体", "serif", [400, 700]),
  japanese(
    "zen-kaku-gothic-new",
    "Zen Kaku Gothic New",
    "字面が広く読みやすい角ゴシック",
    "sans",
    [400, 700],
  ),
  japanese(
    "m-plus-rounded-1c",
    "M PLUS Rounded 1c",
    "角が丸く柔らかい丸ゴシック",
    "rounded",
    [400, 700],
  ),
  japanese("zen-maru-gothic", "Zen Maru Gothic", "線が均一な丸ゴシック", "rounded", [400, 700]),
  japanese("kosugi-maru", "Kosugi Maru", "小さめでも読める丸ゴシック", "rounded", [400]),
  japanese("shippori-mincho", "Shippori Mincho", "筆味を残した明朝体", "serif", [400, 700]),
  japanese("zen-old-mincho", "Zen Old Mincho", "古典的な骨格の明朝体", "serif", [400, 700]),
  japanese("klee-one", "Klee One", "教科書体に近い手書き調", "handwriting", [400]),
  japanese("yuji-syuku", "Yuji Syuku", "毛筆で書いた楷書体", "handwriting", [400]),
  japanese("dela-gothic-one", "Dela Gothic One", "極太の見出し用ゴシック", "display", [400]),
  japanese("rocknroll-one", "RocknRoll One", "太めで軽快な見出し書体", "display", [400]),
  japanese("train-one", "Train One", "縁取りのある看板書体", "display", [400]),
  japanese("dotgothic16", "DotGothic16", "ドット絵風のビットマップ体", "display", [400]),
  japanese("yusei-magic", "Yusei Magic", "油性マーカーで書いた文字", "display", [400]),
  japanese("hachi-maru-pop", "Hachi Maru Pop", "丸くポップな手書き文字", "display", [400]),
  latin("inter", "Inter", "画面表示向けのサンセリフ", "sans", [400, 700]),
  latin("montserrat", "Montserrat", "幾何学的なサンセリフ", "sans", [400, 700]),
  latin("oswald", "Oswald", "縦長で密度の高い見出し体", "sans", [400, 700]),
  latin("space-grotesk", "Space Grotesk", "やや癖のあるサンセリフ", "sans", [400, 700]),
  latin("bebas-neue", "Bebas Neue", "大文字だけの看板書体", "display", [400]),
  latin("playfair-display", "Playfair Display", "コントラストの強いセリフ", "serif", [400, 700]),
  latin(
    "cormorant-garamond",
    "Cormorant Garamond",
    "細く上品なガラモン系セリフ",
    "serif",
    [400, 700],
  ),
  latin("libre-baskerville", "Libre Baskerville", "読みやすい本文用セリフ", "serif", [400, 700]),
  latin("dm-serif-display", "DM Serif Display", "見出し向けのセリフ", "serif", [400]),
  latin("jetbrains-mono", "JetBrains Mono", "等幅（コード表示向け）", "mono", [400, 700]),
];

const CATALOG_BY_ID = new Map(TEXT_FONT_CATALOG.map((font) => [font.id, font]));

export function getTextFontDefinition(
  fontId: string | undefined,
): XriftTextFontDefinition | undefined {
  if (!fontId || fontId === AUTOMATIC_TEXT_FONT_ID) return undefined;
  return CATALOG_BY_ID.get(fontId);
}

/**
 * Rounds to a weight the family actually publishes. Asking `@fontsource` for a
 * weight it never built returns a 404, and troika treats a failed font download
 * as "never resolves", so the text would simply never appear.
 */
export function resolveTextFontWeight(
  font: XriftTextFontDefinition,
  requested: number | undefined,
): number {
  const target = Number.isFinite(requested) ? Number(requested) : 400;
  let best = font.weights[0] ?? 400;
  for (const weight of font.weights) {
    if (Math.abs(weight - target) < Math.abs(best - target)) best = weight;
  }
  return best;
}

/**
 * Pinned file URL for a catalog entry, or `undefined` for the automatic font.
 * `undefined` is meaningful: it tells troika to resolve Noto faces per script,
 * which is what keeps mixed-script text legible without any explicit choice.
 */
export function resolveTextFontUrl(
  fontId: string | undefined,
  fontWeight?: number,
): string | undefined {
  const font = getTextFontDefinition(fontId);
  if (!font) return undefined;
  const weight = resolveTextFontWeight(font, fontWeight);
  return `${TEXT_FONT_FILE_BASE_URL}/${font.id}@${TEXT_FONT_PACKAGE_VERSION}/files/${font.id}-${font.subset}-${weight}-normal.woff`;
}

/** Weights offered by the picker for a font id, including the automatic one. */
export function textFontWeightOptions(fontId: string | undefined): readonly number[] {
  const font = getTextFontDefinition(fontId);
  // The automatic font resolves Noto faces per script, and those are published
  // in the full weight range rather than the two a single family may ship.
  return font ? font.weights : [400, 700];
}

function japanese(
  id: string,
  label: string,
  labelJa: string,
  category: XriftTextFontCategory,
  weights: readonly number[],
): XriftTextFontDefinition {
  return { id, label, labelJa, category, subset: "japanese", weights, license: "OFL-1.1" };
}

function latin(
  id: string,
  label: string,
  labelJa: string,
  category: XriftTextFontCategory,
  weights: readonly number[],
): XriftTextFontDefinition {
  return { id, label, labelJa, category, subset: "latin", weights, license: "OFL-1.1" };
}
