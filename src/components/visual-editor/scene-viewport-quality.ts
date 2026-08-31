/**
 * How hard the Scene View draws while editing.
 *
 * A Scene with many Models spends most of its frame on work the author is not
 * looking at while placing things: shadow map passes, postprocessing, and
 * pixels above the display's own resolution. This is Editor State, never
 * authoring data — it stays out of the SceneDocument, the Undo history and the
 * published world, and Play restores full quality so the preview stays honest.
 */
export type SceneViewportQualityMode = "high" | "low" | "half" | "quarter";

export type SceneViewportQualityProfile = {
  /** Canvas device pixel ratio range, passed to React Three Fiber. */
  dpr: [number, number];
  shadows: boolean;
  postprocessing: boolean;
};

export const SCENE_VIEWPORT_QUALITY_OPTIONS: readonly {
  value: SceneViewportQualityMode;
  label: string;
  description: string;
}[] = [
  {
    value: "high",
    label: "高品質",
    description: "影とポストエフェクトを含む通常の描画",
  },
  {
    value: "low",
    label: "軽量 (描画75%)",
    description:
      "影とポストエフェクトを外し、CSS表示サイズの75%で描画する。Modelが多いSceneの編集用で、Play中と公開物には影響しない",
  },
  {
    value: "half",
    label: "描画50%",
    description: "CSS表示サイズの50%の解像度。影・ポストエフェクトなし。編集時のみ",
  },
  {
    value: "quarter",
    label: "描画25%",
    description: "CSS表示サイズの25%の解像度。影・ポストエフェクトなし。編集時のみ",
  },
] as const;

export function getSceneViewportQualityProfile(
  mode: SceneViewportQualityMode,
): SceneViewportQualityProfile {
  switch (mode) {
    case "half":
      return { dpr: [0.5, 0.5], shadows: false, postprocessing: false };
    case "quarter":
      return { dpr: [0.25, 0.25], shadows: false, postprocessing: false };
    case "high":
      // The only mode that follows the display: a HiDPI screen gets its own
      // sharpness up to 1.5x, a 1x screen gets exactly its CSS pixels.
      return { dpr: [1, 1.5], shadows: true, postprocessing: true };
    case "low":
      // A single number, not a range. React Three Fiber clamps the display's
      // own devicePixelRatio into whatever range it is given, so the previous
      // [0.75, 1] came back as 1 on an ordinary 1x display: the label promised
      // a cheaper view and the renderer drew every pixel it had before. Pinning
      // both ends makes 75% mean 75% on every display, which is the whole
      // reason to reach for this mode.
      return { dpr: [0.75, 0.75], shadows: false, postprocessing: false };
  }
}

/**
 * Fraction of the CSS size the Scene View actually draws, for a given display.
 *
 * The toolbar states this, and the end-to-end test asserts against it, so the
 * number a mode advertises and the number the canvas ends up with cannot drift
 * apart unnoticed.
 */
export function getSceneViewportRenderScale(
  mode: SceneViewportQualityMode,
  devicePixelRatio: number,
): number {
  const [min, max] = getSceneViewportQualityProfile(mode).dpr;
  return Math.min(Math.max(min, devicePixelRatio), max);
}

export const SCENE_VIEWPORT_QUALITY_STORAGE_KEY =
  "xrift-studio.visual-editor.viewport-quality.v1";

export function normalizeSceneViewportQualityMode(
  candidate: unknown,
): SceneViewportQualityMode {
  return candidate === "low" || candidate === "half" || candidate === "quarter" ? candidate : "high";
}

/** Unreadable storage falls back to full quality rather than to a surprise. */
export function loadSceneViewportQualityMode(): SceneViewportQualityMode {
  if (typeof window === "undefined") return "high";
  try {
    return normalizeSceneViewportQualityMode(
      window.localStorage.getItem(SCENE_VIEWPORT_QUALITY_STORAGE_KEY),
    );
  } catch {
    return "high";
  }
}

export function saveSceneViewportQualityMode(
  mode: SceneViewportQualityMode,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCENE_VIEWPORT_QUALITY_STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort; the viewport still honours the choice.
  }
}
