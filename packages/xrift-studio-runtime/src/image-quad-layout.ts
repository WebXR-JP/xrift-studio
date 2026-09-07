/**
 * Image component configuration and quad geometry, with no Three.js import.
 *
 * The authoring layer (SceneDocument, Inspector, compiler) and the renderers
 * describe an Image with the same types, the way the Text panel does, so a
 * picture cannot be sized one way while it is edited and another way once the
 * world is published. Keeping this file free of `three` is what lets the
 * document layer share it.
 */

export type XriftImageQuadAnchorX = "left" | "center" | "right";
export type XriftImageQuadAnchorY = "top" | "middle" | "bottom";

/**
 * How the image's alpha channel is drawn.
 *
 * `cutout` keeps writing depth, so a framed photo or a signage PNG never
 * disappears behind nearby geometry; `blend` sorts and blends, which is what a
 * soft-edged or semi-transparent overlay needs.
 */
export type XriftImageQuadAlphaMode = "cutout" | "blend";

export type XriftImageQuadConfig = {
  /** Width of the quad in local units. */
  width: number;
  /**
   * Height of the quad. Absent derives it from the image's own pixel aspect
   * ratio, so a photo is never squashed unless the author asks for it.
   */
  height?: number;
  anchorX: XriftImageQuadAnchorX;
  anchorY: XriftImageQuadAnchorY;
  /** Tint multiplied over the image. White keeps it as-is. */
  color: string;
  opacity: number;
  alphaMode: XriftImageQuadAlphaMode;
  doubleSided: boolean;
  /**
   * Lit by the Scene's lights instead of drawn as-is.
   *
   * A photo, a screen or a sign reads best unlit: the same picture in any
   * room. A poster in a spotlit gallery wants the light, so it is a choice.
   */
  lit: boolean;
};

export const DEFAULT_IMAGE_QUAD_CONFIG: Readonly<XriftImageQuadConfig> = {
  width: 1,
  anchorX: "center",
  anchorY: "middle",
  color: "#ffffff",
  opacity: 1,
  alphaMode: "cutout",
  doubleSided: false,
  lit: false,
};

export type XriftImageQuadPlate = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/**
 * Size and centre of the quad in the Image's local space.
 *
 * `imageAspect` is width divided by height of the decoded picture, or `null`
 * when there is no picture to measure. Without a fixed height and without a
 * picture the quad is square, which is the honest shape for「まだ画像を選んで
 * いない」rather than a guess at what will be chosen.
 */
export function resolveImageQuadPlate(
  config: XriftImageQuadConfig,
  imageAspect: number | null,
): XriftImageQuadPlate {
  const width = Math.max(0.001, config.width);
  const aspect =
    imageAspect !== null && Number.isFinite(imageAspect) && imageAspect > 0
      ? imageAspect
      : 1;
  const height = Math.max(
    0.001,
    config.height !== undefined && Number.isFinite(config.height) && config.height > 0
      ? config.height
      : width / aspect,
  );
  return {
    width,
    height,
    centerX:
      config.anchorX === "left" ? width / 2 : config.anchorX === "right" ? -width / 2 : 0,
    centerY:
      config.anchorY === "top" ? -height / 2 : config.anchorY === "bottom" ? height / 2 : 0,
  };
}
