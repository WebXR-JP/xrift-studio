/**
 * Shared implementation of the Image component's rendering.
 *
 * One Three.js object backs every surface that draws a Studio Image: the
 * editor viewport, Play, the published runtime and the generated Classic
 * source. Keeping the quad, its sizing and its material handling here is what
 * stops a gallery picture from being one size while editing and another once
 * the world is uploaded — the same reason the Text panel is shared.
 *
 * The object is a `Group` with one child, a plane sized from the config and
 * the decoded picture's own aspect ratio, so an author sets a width and the
 * photo keeps its proportions without anyone typing a height.
 */

import {
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
} from "three";

import {
  resolveImageQuadPlate,
  type XriftImageQuadConfig,
} from "./image-quad-layout.js";

export {
  DEFAULT_IMAGE_QUAD_CONFIG,
  resolveImageQuadPlate,
} from "./image-quad-layout.js";
export type {
  XriftImageQuadAlphaMode,
  XriftImageQuadAnchorX,
  XriftImageQuadAnchorY,
  XriftImageQuadConfig,
  XriftImageQuadPlate,
} from "./image-quad-layout.js";

type ImageQuadMaterial = MeshBasicMaterial | MeshStandardMaterial;

/**
 * Width divided by height of a decoded Texture, or null when it is not known.
 *
 * Both an ordinary image and a KTX2 `CompressedTexture` report their size on
 * `image`, so one read serves every format the runtime loads.
 */
export function imageTextureAspect(texture: Texture | null): number | null {
  const image = texture?.image as
    | { width?: unknown; height?: unknown }
    | null
    | undefined;
  const width = typeof image?.width === "number" ? image.width : 0;
  const height = typeof image?.height === "number" ? image.height : 0;
  return width > 0 && height > 0 ? width / height : null;
}

export class XriftImageQuadObject extends Group {
  readonly plate: Mesh<PlaneGeometry, ImageQuadMaterial>;

  constructor() {
    super();
    this.plate = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
    this.plate.visible = false;
    this.add(this.plate);
  }

  /**
   * Applies a config and the decoded picture.
   *
   * `awaitingTexture` says a picture was chosen but has not arrived yet. The
   * quad is hidden until it does rather than shown at a guessed size, the way
   * a text-fitted plate waits for its typesetting — a photo that pops in as a
   * square and then snaps to its real shape reads as a glitch.
   */
  update(
    config: XriftImageQuadConfig,
    texture: Texture | null,
    awaitingTexture = false,
  ): void {
    this.applyMaterial(config, texture);
    if (awaitingTexture && !texture) {
      this.plate.visible = false;
      return;
    }
    const plate = resolveImageQuadPlate(config, imageTextureAspect(texture));
    this.plate.visible = true;
    this.plate.scale.set(plate.width, plate.height, 1);
    this.plate.position.set(plate.centerX, plate.centerY, 0);
  }

  dispose(): void {
    this.plate.geometry.dispose();
    this.plate.material.dispose();
  }

  private applyMaterial(
    config: XriftImageQuadConfig,
    texture: Texture | null,
  ): void {
    const wantsLit = config.lit;
    const current = this.plate.material;
    const isLit = current instanceof MeshStandardMaterial;
    if (wantsLit !== isLit) {
      current.dispose();
      this.plate.material = wantsLit
        ? new MeshStandardMaterial({ roughness: 1, metalness: 0 })
        : new MeshBasicMaterial();
    }
    const material = this.plate.material;
    const opacity = clampUnit(config.opacity);
    material.color.set(config.color);
    material.map = texture;
    material.opacity = opacity;
    material.transparent = true;
    if (config.alphaMode === "blend") {
      // Sorted blending: a soft edge or a translucent overlay composes over
      // whatever is behind it, at the cost of not writing depth.
      material.alphaTest = 0;
      material.depthWrite = false;
    } else {
      // Cutout rather than sorted blending: a photo or a signage PNG keeps
      // writing depth, so it never vanishes behind or in front of nearby
      // geometry. The same choice the Text plate makes for its image.
      material.alphaTest = 0.01;
      material.depthWrite = true;
    }
    material.side = config.doubleSided ? DoubleSide : FrontSide;
    // An unlit picture is shown exactly as authored, so it skips tone mapping
    // the way the Text plate does; a lit one is part of the scene's light.
    material.toneMapped = wantsLit;
    material.needsUpdate = true;
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
