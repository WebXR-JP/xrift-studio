/**
 * Shared implementation of the Text component's rendering.
 *
 * One Three.js object graph backs every surface that draws Studio text: the
 * editor viewport, Play, the published runtime and the generated Classic
 * source. Keeping the geometry, the plate layout and the font handling here is
 * what stops a wall label from being laid out one way while editing and another
 * way once the world is uploaded.
 *
 * The object is a `Group` of two children:
 *
 *   - a troika SDF `Text`, which stays crisp at any distance, and
 *   - an optional unlit background plate sized from the text's own measured
 *     bounds, so a caption plate fits its caption without anyone typing width
 *     and height by hand.
 */

import {
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from "three";
import { preloadFont, Text } from "troika-three-text";

import { resolveTextFontUrl } from "./text-font-catalog.js";
import {
  DEFAULT_TEXT_BACKGROUND,
  resolveTextPanelPlate,
  type XriftTextBackground,
  type XriftTextPanelConfig,
} from "./text-panel-layout.js";

export {
  DEFAULT_TEXT_BACKGROUND,
  resolveTextPanelPlate,
} from "./text-panel-layout.js";
export type {
  XriftTextAlign,
  XriftTextAnchorX,
  XriftTextAnchorY,
  XriftTextBackground,
  XriftTextBackgroundFit,
  XriftTextBackgroundMode,
  XriftTextPanelConfig,
  XriftTextPanelPlate,
} from "./text-panel-layout.js";

/**
 * Han unification means an unqualified CJK run can resolve to a Chinese face,
 * which renders Japanese kanji with the wrong shapes. Studio authors Japanese
 * worlds, so the fallback resolver is told which language it is typesetting.
 */
const TEXT_PANEL_LANG = "ja";

type FontLoadState = "loaded" | "failed";

const fontLoadStates = new Map<string, FontLoadState>();
const fontLoadRequests = new Map<string, Promise<FontLoadState>>();

/**
 * How long a font read may take before the automatic face is used instead.
 *
 * troika only logs a font it could not read, so nothing else would report one.
 * In practice its loader answers either way — a missing file resolves through
 * its own fallback in about the time a present one takes (measured against a
 * 404 base) — so this is the guard for a read that never answers at all rather
 * than the normal failure path. The wait is long enough that a slow connection
 * is never mistaken for a missing file.
 */
const FONT_LOAD_TIMEOUT_MS = 10_000;

/**
 * One character, so the request actually reaches the font.
 *
 * troika short-circuits an empty string before loading anything and reports
 * success, which would be indistinguishable from a font that loaded. Basic
 * Latin is present in every bundled subset, including the Japanese ones.
 */
const FONT_PROBE_CHARACTER = "A";

/**
 * Loads a catalog font through troika before handing its URL to a `Text`.
 *
 * troika logs a failed font read and then never resolves that request, so text
 * assigned an unreachable font simply never appears. The file is bundled rather
 * than downloaded, so this now guards a missing or misplaced copy rather than a
 * blocked CDN: checking first falls back to the automatic Noto face and still
 * shows the words.
 *
 * The check goes through troika's own loader rather than `fetch`. The read is
 * same-origin either way, but a published world is scanned as a bundle, and a
 * `fetch` in the world's own code is reported as `no-network-without-permission`
 * whatever it requests — which would make every world containing Text declare a
 * network permission it does not use. See THIRD_PARTY_ASSETS.md.
 */
export function loadTextPanelFont(url: string): Promise<FontLoadState> {
  const cached = fontLoadStates.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = fontLoadRequests.get(url);
  if (pending) return pending;
  const request = new Promise<FontLoadState>((resolve) => {
    const timer = setTimeout(() => resolve("failed"), FONT_LOAD_TIMEOUT_MS);
    const settle = (state: FontLoadState) => {
      clearTimeout(timer);
      resolve(state);
    };
    try {
      preloadFont({ font: url, characters: FONT_PROBE_CHARACTER }, () =>
        settle("loaded"),
      );
    } catch {
      settle("failed");
    }
  }).then((state) => {
    fontLoadStates.set(url, state);
    fontLoadRequests.delete(url);
    return state;
  });
  fontLoadRequests.set(url, request);
  return request;
}

/** Synchronous view of the font cache, for renderers that cannot await. */
export function peekTextPanelFont(url: string): FontLoadState | undefined {
  return fontLoadStates.get(url);
}

export class XriftTextPanelObject extends Group {
  readonly text: Text;

  private readonly plate: Mesh<PlaneGeometry, MeshBasicMaterial>;

  private config: XriftTextPanelConfig | null = null;

  /** Guards against a slow font resolving after a later config replaced it. */
  private fontGeneration = 0;

  private onLayout: (() => void) | null = null;

  constructor() {
    super();
    this.text = new Text();
    this.plate = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
    this.plate.visible = false;
    // Drawn before the glyphs so a translucent plate blends against the world
    // behind it rather than over the text it is meant to sit behind.
    this.plate.renderOrder = -1;
    this.add(this.plate);
    this.add(this.text);
  }

  /** Invoked after every sync, once the plate has been resized. */
  setLayoutListener(listener: (() => void) | null): void {
    this.onLayout = listener;
  }

  update(config: XriftTextPanelConfig, backgroundTexture: Texture | null): void {
    this.config = config;
    const text = this.text;
    text.text = config.text;
    text.color = config.color;
    text.fontSize = config.fontSize;
    text.maxWidth = config.maxWidth ?? Infinity;
    text.anchorX = config.anchorX;
    text.anchorY = config.anchorY;
    text.outlineWidth = config.outlineWidth;
    text.outlineColor = config.outlineColor;
    text.textAlign = config.textAlign ?? "center";
    text.lineHeight = config.lineHeight ?? "normal";
    text.letterSpacing = config.letterSpacing ?? 0;
    text.fontWeight = config.fontWeight ?? 400;
    text.lang = TEXT_PANEL_LANG;

    const background = config.background ?? DEFAULT_TEXT_BACKGROUND;
    const hasPlate = background.mode !== "none";
    // Only nudged when a plate exists: an offset applied to free-standing text
    // would bias its depth against unrelated geometry for no reason.
    text.depthOffset = hasPlate ? -1 : 0;
    this.applyPlateMaterial(background, backgroundTexture);

    // The plate is placed from whatever bounds are already known so a fixed
    // panel appears at once and an edited caption keeps its plate instead of
    // blinking out until the new typesetting lands.
    this.layoutPlate();
    this.applyFont(config);
  }

  dispose(): void {
    this.text.dispose();
    this.plate.geometry.dispose();
    this.plate.material.dispose();
  }

  /**
   * Decides the font before the Text is ever rendered, then typesets once.
   *
   * troika typesets from `onBeforeRender`, so the first drawn frame starts a
   * sync with whatever font is set at that moment, and a sync that never
   * completes silently swallows every sync queued behind it. Two consequences
   * shape this:
   *
   * - Assigning a URL that turns out to be unreachable is unrecoverable, which
   *   is why the file is fetched first and a failure falls back to troika's own
   *   face instead.
   * - Letting the first frame sync on troika's face while the bundled font
   *   downloads sends every glyph to its per-script fallback CDN, and if that
   *   CDN is blocked the Text is stuck there even after its own font arrives.
   *   Hiding the Text keeps `onBeforeRender` from firing until the decision is
   *   made; the background plate is already in place, so a panel is not blank
   *   while it waits.
   */
  private applyFont(config: XriftTextPanelConfig): void {
    const url =
      config.fontUrl ??
      resolveTextFontUrl(config.fontId, config.fontWeight, config.fontBaseUrl);
    const generation = ++this.fontGeneration;
    const known = peekTextPanelFont(url);
    if (known) {
      this.setFont(known === "loaded" ? url : null);
      return;
    }
    this.text.visible = false;
    void loadTextPanelFont(url).then((state) => {
      if (generation !== this.fontGeneration) return;
      this.setFont(state === "loaded" ? url : null);
      this.onLayout?.();
    });
  }

  private setFont(url: string | null): void {
    this.text.font = url;
    this.text.visible = true;
    this.text.sync(() => this.layoutPlate());
  }

  private applyPlateMaterial(
    background: XriftTextBackground,
    backgroundTexture: Texture | null,
  ): void {
    const material = this.plate.material;
    if (background.mode === "none") {
      this.plate.visible = false;
      material.map = null;
      return;
    }
    const opacity = clampUnit(background.opacity);
    material.color.set(background.color);
    material.map = background.mode === "texture" ? backgroundTexture : null;
    material.opacity = opacity;
    material.transparent = opacity < 1 || background.mode === "texture";
    // Cutout rather than sorted blending: a signage PNG keeps writing depth, so
    // it does not disappear behind or in front of nearby world geometry.
    material.alphaTest = background.mode === "texture" ? 0.01 : 0;
    material.depthWrite = true;
    material.side = background.doubleSided ? DoubleSide : FrontSide;
    material.toneMapped = false;
    material.needsUpdate = true;
  }

  private layoutPlate(): void {
    const config = this.config;
    if (!config) return;
    const background = config.background ?? DEFAULT_TEXT_BACKGROUND;
    const plate = resolveTextPanelPlate(
      background,
      this.text.textRenderInfo?.blockBounds ?? null,
      config.anchorX,
      config.anchorY,
    );
    if (!plate) {
      this.plate.visible = false;
      this.onLayout?.();
      return;
    }
    this.plate.visible = true;
    this.plate.scale.set(plate.width, plate.height, 1);
    this.plate.position.set(plate.centerX, plate.centerY, -Math.abs(background.offset));
    this.onLayout?.();
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
