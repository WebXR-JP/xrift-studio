import {
  SCENE_VIEWPORT_QUALITY_OPTIONS,
  getSceneViewportQualityProfile,
  normalizeSceneViewportQualityMode,
} from "./scene-viewport-quality";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * The Scene View's quality switch only ever makes the editing view cheaper.
 * These assertions keep it from drifting into something that changes what the
 * author is looking at rather than how hard it is drawn.
 */
export function runSceneViewportQualityFixtureAssertions(): void {
  const high = getSceneViewportQualityProfile("high");
  assert(
    high.shadows && high.postprocessing,
    "The default Scene View quality dropped part of the Scene",
  );
  assert(
    high.dpr[0] >= 1 && high.dpr[1] >= high.dpr[0],
    "The default Scene View quality renders below display resolution",
  );

  const low = getSceneViewportQualityProfile("low");
  assert(
    !low.shadows && !low.postprocessing,
    "The lightweight Scene View quality kept the passes it exists to skip",
  );
  assert(
    low.dpr[1] <= high.dpr[1] && low.dpr[0] > 0.5,
    "The lightweight Scene View quality is not a cheaper, still readable render",
  );

  assert(
    SCENE_VIEWPORT_QUALITY_OPTIONS.length === 4 &&
      SCENE_VIEWPORT_QUALITY_OPTIONS.every(
        (option) => option.label.length > 0 && option.description.length > 0,
      ),
    "A Scene View quality option is missing its readable label",
  );

  // Stored preferences are read back from a browser the editor does not own, so
  // anything unexpected has to land on full quality instead of a silent downgrade.
  assert(
    normalizeSceneViewportQualityMode("low") === "low",
    "A stored lightweight preference was not restored",
  );
  for (const candidate of [null, undefined, "", "ultra", 3, {}]) {
    assert(
      normalizeSceneViewportQualityMode(candidate) === "high",
      `Unreadable stored quality "${String(candidate)}" did not fall back to 高品質`,
    );
  }
  for (const mode of ["half", "quarter"] as const) {
    const profile = getSceneViewportQualityProfile(mode);
    const scale = mode === "half" ? 0.5 : 0.25;
    assert(profile.dpr[0] === scale && profile.dpr[1] === scale && !profile.shadows && !profile.postprocessing, "Reduced resolution must remain fixed on HiDPI displays");
    assert(normalizeSceneViewportQualityMode(mode) === mode, "Reduced resolution preference was lost");
  }
}
