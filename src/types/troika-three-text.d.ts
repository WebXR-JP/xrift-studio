// Mirrors packages/xrift-studio-runtime/src/troika-three-text.d.ts. The root
// program only includes `src`, so the runtime package's own ambient
// declaration is not visible here, the same way three-icosa.d.ts is mirrored.
declare module "troika-three-text" {
  import { Mesh } from "three";

  /** Measured layout troika publishes once `sync()` completes. */
  export type TroikaTextRenderInfo = {
    /** `[minX, minY, maxX, maxY]` of the whole block, after anchoring. */
    blockBounds: [number, number, number, number];
  };

  export class Text extends Mesh {
    text: string;
    color: string | number;
    fontSize: number;
    maxWidth: number;
    anchorX: "left" | "center" | "right";
    anchorY: "top" | "middle" | "bottom";
    outlineWidth: number | string;
    outlineColor: string | number;
    /** URL of a `.ttf`/`.otf`/`.woff` file. `null` resolves Noto per script. */
    font: string | null;
    /** Only applied to the automatically resolved fallback fonts. */
    fontWeight: number | "normal" | "bold";
    fontStyle: "normal" | "italic";
    /** BCP 47 code used to disambiguate unified CJK code points. */
    lang: string | null;
    textAlign: "left" | "right" | "center" | "justify";
    lineHeight: number | "normal";
    letterSpacing: number;
    /** Polygon offset applied to the glyph material, in depth units. */
    depthOffset: number;
    readonly textRenderInfo: TroikaTextRenderInfo | null;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  /**
   * Loads a font and generates glyphs for `characters` ahead of any `Text`.
   *
   * The callback is invoked once the font is readable. A font troika cannot
   * read is only logged, so the callback never runs for one — the caller has
   * to decide how long to wait.
   */
  export function preloadFont(
    options: {
      font: string;
      characters: string | readonly string[];
      sdfGlyphSize?: number;
    },
    callback: () => void,
  ): void;
}
