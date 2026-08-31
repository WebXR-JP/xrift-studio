/**
 * The font shipped with XRift Studio and copied into every world that uses it.
 *
 * Studio, the editor viewport, the published runtime and the generated Classic
 * source all resolve a font from this one table, so a world shows the same
 * lettering wherever it is opened. The document stores only `fontId`; the file
 * path is derived here, which keeps the layout in a single place.
 *
 * Why the file is bundled rather than fetched from a CDN:
 *
 * - A published world that downloads its font makes a network request, and the
 *   platform rejects a world that has not declared one. The declaration cannot
 *   be narrowed to a host either: the URL is built per font and weight, so the
 *   analyzer reports `no-network-without-permission` however the domain is
 *   allowed. Shipping the file makes the request same-origin and removes the
 *   permission entirely.
 * - A world published months ago keeps working when the CDN does not.
 *
 * Why `@fontsource` files rather than the Google Fonts CSS API: troika parses
 * `.ttf`, `.otf` and WOFF 1.0 but explicitly rejects WOFF2, and the CSS API
 * serves WOFF2 to any modern browser. The `@fontsource` packages publish both,
 * so the `.woff` file is the one that can be parsed into an SDF atlas.
 *
 * The family here is licensed under the SIL Open Font License 1.1; see
 * THIRD_PARTY_ASSETS.md for the pinned revision and the upstream links.
 */

/**
 * Version of the `@fontsource` package the bundled files come from.
 *
 * `scripts/vite-local-text-fonts.ts` fails the build when the installed package
 * no longer matches, so this can never quietly describe a different file than
 * the one Studio ships.
 */
export const TEXT_FONT_PACKAGE_VERSION = "5.3.0" as const;

/**
 * Directory Studio serves the font files from, relative to its base URL.
 *
 * Studio's Vite plugin serves and emits this path. A published world cannot
 * serve a subdirectory at all, so the compiler copies the file it needs to the
 * world root instead; `resolveTextFontUrl` therefore takes the directory rather
 * than deriving it.
 */
export const TEXT_FONT_DIRECTORY = "xrift-studio/vendor/text-fonts";

/** File published by `@fontsource` for one family and weight. */
export function textFontFileName(
  font: XriftTextFontDefinition,
  weight: number,
): string {
  return `${font.id}-${font.subset}-${weight}-normal.woff`;
}

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
 * Every family Studio bundles, and therefore every family a world can publish
 * without reaching the network. Noto Sans JP covers Japanese and Basic Latin in
 * one file, so a mixed caption needs no second download.
 *
 * Adding a family means shipping its files too: `@fontsource` Japanese subsets
 * are around 1.4MB each, so this is deliberately one face rather than a picker
 * whose entries only work while a CDN answers.
 */
export const TEXT_FONT_CATALOG: readonly XriftTextFontDefinition[] = [
  japanese("noto-sans-jp", "Noto Sans JP", "標準的なゴシック体", "sans", [400, 700]),
];

const CATALOG_BY_ID = new Map(TEXT_FONT_CATALOG.map((font) => [font.id, font]));

/**
 * Face used when the document names no font, or names one this build does not
 * ship.
 *
 * troika's own default is a per-script resolver that downloads faces from a
 * CDN. Nothing here uses it: a published world has no permission to reach a
 * CDN, so its Text would never appear, and Studio would show a face the
 * published world cannot. One bundled file answers for both — the japanese
 * subset also carries Basic Latin, so mixed Japanese and English text is
 * covered by the single file a world ships.
 */
export const DEFAULT_TEXT_FONT_ID = "noto-sans-jp" as const;

/**
 * Font id that is actually rendered: the author's choice when this build ships
 * it, otherwise the bundled default. Every surface — the editor viewport, Play,
 * generated Classic source and the published world — resolves through here, so
 * they cannot disagree about the lettering.
 */
export function resolveRenderedTextFontId(fontId: string | undefined): string {
  return getTextFontDefinition(fontId)?.id ?? DEFAULT_TEXT_FONT_ID;
}

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
 * File URL for the face a Text renders with.
 *
 * The automatic font resolves here too, to `DEFAULT_TEXT_FONT_ID`: leaving it
 * unresolved handed the typesetting to troika's per-script CDN resolver, which
 * a published world cannot reach.
 *
 * `directoryUrl` is the directory the font files themselves are in, not a base
 * to append `TEXT_FONT_DIRECTORY` to. Studio serves them from that directory;
 * a published world serves nothing below its own root and therefore carries
 * them at the root, so the two layouts differ and the caller names the one it
 * is serving from.
 */
export function resolveTextFontUrl(
  fontId: string | undefined,
  fontWeight?: number,
  directoryUrl?: string,
): string {
  const font =
    getTextFontDefinition(fontId) ??
    (CATALOG_BY_ID.get(DEFAULT_TEXT_FONT_ID) as XriftTextFontDefinition);
  const weight = resolveTextFontWeight(font, fontWeight);
  const directory = directoryUrl ?? resolveTextFontDirectoryUrl();
  const withTrailingSlash = directory.endsWith("/")
    ? directory
    : `${directory}/`;
  return `${withTrailingSlash}${textFontFileName(font, weight)}`;
}

/** Directory Studio itself serves the bundled fonts from, with a trailing slash. */
export function resolveTextFontDirectoryUrl(baseUrl?: string): string {
  const base = (baseUrl ?? defaultTextFontBaseUrl()).trim() || "/";
  const baseWithTrailingSlash = base.endsWith("/") ? base : `${base}/`;
  return `${baseWithTrailingSlash}${TEXT_FONT_DIRECTORY}/`;
}

function defaultTextFontBaseUrl(): string {
  // Studio and the generated Classic project are both Vite apps, so this is
  // right for every surface except a published world, which is served under a
  // base XRift decides at load time and therefore passes in explicitly.
  //
  // The type is widened at the access rather than read off `ImportMeta`: this
  // module is also emitted into the staged publish project, whose tsconfig does
  // not pull in Vite's ambient types, and `import.meta.env` there is a `tsc`
  // error that only surfaces once the world is being published. The cast stays
  // inside the member expression on purpose — a bundler replaces
  // `import.meta.env`, not a local alias of `import.meta`.
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL ?? "/";
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

