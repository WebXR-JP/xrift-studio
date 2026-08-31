/**
 * Text component configuration and plate geometry, with no Three.js import.
 *
 * The authoring layer (SceneDocument, Inspector, compiler) and the renderers
 * describe a Text panel with the same types, so a caption cannot be normalized
 * one way when it is edited and another way when it is drawn. Keeping this file
 * free of `three` is what lets the document layer share it.
 */

export type XriftTextBackgroundMode = "none" | "color" | "texture";

export type XriftTextBackgroundFit = "text" | "fixed";

export type XriftTextBackground = {
  mode: XriftTextBackgroundMode;
  /** Plate tint. With a texture it multiplies, so white keeps the image as-is. */
  color: string;
  opacity: number;
  /** Texture Asset drawn on the plate. Only read when `mode` is `texture`. */
  textureAssetId?: string;
  /** Margin added around the measured text block, in local units. */
  paddingX: number;
  paddingY: number;
  /** `text` fits the plate to the rendered text; `fixed` uses width/height. */
  fit: XriftTextBackgroundFit;
  width: number;
  height: number;
  /** Gap behind the glyphs, so the plate cannot z-fight the text. */
  offset: number;
  doubleSided: boolean;
};

export type XriftTextAnchorX = "left" | "center" | "right";
export type XriftTextAnchorY = "top" | "middle" | "bottom";
export type XriftTextAlign = "left" | "center" | "right" | "justify";

export type XriftTextPanelConfig = {
  text: string;
  color: string;
  fontSize: number;
  maxWidth?: number;
  anchorX: XriftTextAnchorX;
  anchorY: XriftTextAnchorY;
  outlineWidth: number;
  outlineColor: string;
  /** Catalog id from text-font-catalog. Absent or `auto` resolves the default. */
  fontId?: string;
  fontWeight?: number;
  /**
   * Font file to typeset with, overriding the catalog.
   *
   * A project font is a file the author imported, so it has no catalog entry
   * and no derived weights: the URL is the whole answer. It is always the
   * world's own file - a data URL while authoring, a copied file once
   * published - never a font fetched from somewhere else at runtime.
   */
  fontUrl?: string;
  /**
   * Directory the bundled font files are served from.
   *
   * Absent means Studio's own font directory. A published world carries the
   * file at its root — it serves nothing below it — so its generated source
   * passes the world's base URL instead.
   */
  fontDirectoryUrl?: string;
  textAlign?: XriftTextAlign;
  /** Multiple of `fontSize`. Absent uses the font's own metrics. */
  lineHeight?: number;
  letterSpacing?: number;
  background?: XriftTextBackground;
};

export const DEFAULT_TEXT_BACKGROUND: Readonly<XriftTextBackground> = {
  mode: "none",
  color: "#0f172a",
  opacity: 0.85,
  paddingX: 0.08,
  paddingY: 0.06,
  fit: "text",
  width: 1,
  height: 0.4,
  offset: 0.005,
  doubleSided: false,
};

export type XriftTextPanelPlate = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/**
 * Size and centre of the background plate in the Text's local space.
 *
 * `blockBounds` is troika's measured `[minX, minY, maxX, maxY]` for the whole
 * text block, already shifted by the anchor. It is `null` before the first sync
 * completes, which is why a text-fitted plate reports no rectangle rather than
 * flashing at some guessed size.
 */
export function resolveTextPanelPlate(
  background: XriftTextBackground,
  blockBounds: readonly number[] | null,
  anchorX: XriftTextAnchorX,
  anchorY: XriftTextAnchorY,
): XriftTextPanelPlate | null {
  if (background.mode === "none") return null;
  if (background.fit === "fixed") {
    const width = Math.max(0.001, background.width);
    const height = Math.max(0.001, background.height);
    return {
      width,
      height,
      centerX: anchorX === "left" ? width / 2 : anchorX === "right" ? -width / 2 : 0,
      centerY: anchorY === "top" ? -height / 2 : anchorY === "bottom" ? height / 2 : 0,
    };
  }
  if (!blockBounds || blockBounds.length < 4) return null;
  const minX = blockBounds[0] ?? 0;
  const minY = blockBounds[1] ?? 0;
  const maxX = blockBounds[2] ?? 0;
  const maxY = blockBounds[3] ?? 0;
  if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return null;
  const width = Math.max(0.001, maxX - minX + background.paddingX * 2);
  const height = Math.max(0.001, maxY - minY + background.paddingY * 2);
  return {
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}
