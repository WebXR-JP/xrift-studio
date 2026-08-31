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
    label: "軽量",
    description:
      "影とポストエフェクトを外し、描画解像度を下げる。Modelが多いSceneの編集用で、Play中と公開物には影響しない",
  },
  { value: "half", label: "描画50%", description: "CSS表示サイズの50%の解像度。影・ポストエフェクトなし。編集時のみ" },
  { value: "quarter", label: "描画25%", description: "CSS表示サイズの25%の解像度。影・ポストエフェクトなし。編集時のみ" },
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
      return { dpr: [1, 1.5], shadows: true, postprocessing: true };
    case "low":
      // Half resolution reads as blurry on a HiDPI display, so the floor stays
      // at 0.75: enough to drop the pixel count without making text unreadable.
      return { dpr: [0.75, 1], shadows: false, postprocessing: false };
  }
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
