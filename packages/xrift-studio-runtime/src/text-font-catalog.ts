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
 * Directory the font files are served from, relative to the runtime base URL.
 *
 * Studio and a published world use the same relative path: Studio's Vite plugin
 * serves and emits it, and the compiler copies the files a world uses into its
 * `public/`. Only the base in front of it differs, which is why
 * `resolveTextFontUrl` takes one.
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
 * Face a published world uses when the author left the automatic font.
 *
 * The automatic font is troika's per-script resolver, which downloads faces
 * from a CDN. A published world has no permission to reach one, so its Text
 * would never appear. Publishing therefore substitutes one bundled face; the
 * japanese subset also carries Basic Latin, so mixed Japanese and English text
 * is covered by the single file the world ships.
 *
 * Studio's own surfaces keep the automatic font: they can reach the resolver,
 * and it is what keeps other scripts legible while authoring.
 */
export const PUBLISHED_FALLBACK_TEXT_FONT_ID = "noto-sans-jp" as const;

/**
 * Font id a published world actually renders with: the author's choice when it
 * is in the catalog, otherwise the bundled fallback.
 */
export function resolvePublishedTextFontId(fontId: string | undefined): string {
  return getTextFontDefinition(fontId)?.id ?? PUBLISHED_FALLBACK_TEXT_FONT_ID;
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
 * Bundled file URL for a catalog entry, or `undefined` for the automatic font.
 * `undefined` is meaningful: it tells troika to resolve Noto faces per script,
 * which is what keeps mixed-script text legible without any explicit choice.
 *
 * `baseUrl` is where the host serves its public files from; see
 * `TEXT_FONT_DIRECTORY`.
 */
export function resolveTextFontUrl(
  fontId: string | undefined,
  fontWeight?: number,
  baseUrl?: string,
): string | undefined {
  const font = getTextFontDefinition(fontId);
  if (!font) return undefined;
  const weight = resolveTextFontWeight(font, fontWeight);
  return `${resolveTextFontDirectoryUrl(baseUrl)}${textFontFileName(font, weight)}`;
}

/** Directory the host serves the bundled fonts from, with a trailing slash. */
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

