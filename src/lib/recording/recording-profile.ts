/**
 * What one recording looks like: the frame's aspect ratio, its size, and how
 * many frames a second it keeps.
 *
 * The profile is Editor State, not authoring data. It never enters the
 * SceneDocument or the published world, and it is the same for every project
 * because it describes where the video is going (a 9:16 post, a 16:9 embed)
 * rather than what the world is.
 *
 * This module deliberately imports nothing, so the fixture runner and the
 * Rust-facing MCP layer can share it without pulling in React or Three.js.
 */

export const RECORDING_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type RecordingAspectRatio = (typeof RECORDING_ASPECT_RATIOS)[number];

/** The shorter edge of the frame in pixels. The longer edge follows the ratio. */
export const RECORDING_SHORT_EDGES = [720, 1080, 1440] as const;
export type RecordingShortEdge = (typeof RECORDING_SHORT_EDGES)[number];

export const RECORDING_FRAME_RATES = [30, 60] as const;
export type RecordingFrameRate = (typeof RECORDING_FRAME_RATES)[number];

export type RecordingProfile = {
  aspectRatio: RecordingAspectRatio;
  shortEdge: RecordingShortEdge;
  frameRate: RecordingFrameRate;
};

export const DEFAULT_RECORDING_PROFILE: RecordingProfile = {
  aspectRatio: "16:9",
  shortEdge: 1080,
  frameRate: 30,
};

export const RECORDING_ASPECT_RATIO_OPTIONS: readonly {
  value: RecordingAspectRatio;
  label: string;
  description: string;
}[] = [
  { value: "16:9", label: "16:9", description: "横型。YouTube、X の埋め込み、LP" },
  { value: "9:16", label: "9:16", description: "縦型。Shorts、Reels、TikTok" },
  { value: "1:1", label: "1:1", description: "正方形。X、Instagram のフィード" },
  { value: "4:5", label: "4:5", description: "縦長。Instagram のフィード" },
];

const ASPECT_RATIO_TERMS: Record<RecordingAspectRatio, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:5": [4, 5],
};

export type RecordingResolution = { width: number; height: number };

/** Width divided by height, e.g. 1.777 for 16:9. */
export function recordingAspectValue(aspectRatio: RecordingAspectRatio): number {
  const [w, h] = ASPECT_RATIO_TERMS[aspectRatio];
  return w / h;
}

/**
 * Pixel size of the frame. Both edges are kept even because H.264 and most
 * WebM encoders reject odd dimensions, and a 4:5 frame at 1080 would otherwise
 * be 1080 x 1350 exactly but 720 x 900 only by luck.
 */
export function resolveRecordingResolution(
  profile: RecordingProfile,
): RecordingResolution {
  const [w, h] = ASPECT_RATIO_TERMS[profile.aspectRatio];
  const shortEdge = profile.shortEdge;
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  if (w >= h) {
    return { width: even((shortEdge * w) / h), height: even(shortEdge) };
  }
  return { width: even(shortEdge), height: even((shortEdge * h) / w) };
}

/** A safe encoder bitrate for the frame, in bits per second. */
export function resolveRecordingBitrate(profile: RecordingProfile): number {
  const { width, height } = resolveRecordingResolution(profile);
  const raw = width * height * profile.frameRate * 0.2;
  return Math.round(Math.min(40_000_000, Math.max(4_000_000, raw)));
}

export function isRecordingAspectRatio(
  candidate: unknown,
): candidate is RecordingAspectRatio {
  return (RECORDING_ASPECT_RATIOS as readonly unknown[]).includes(candidate);
}

export function isRecordingShortEdge(
  candidate: unknown,
): candidate is RecordingShortEdge {
  return (RECORDING_SHORT_EDGES as readonly unknown[]).includes(candidate);
}

export function isRecordingFrameRate(
  candidate: unknown,
): candidate is RecordingFrameRate {
  return (RECORDING_FRAME_RATES as readonly unknown[]).includes(candidate);
}

/**
 * Accepts a stored or supplied profile and returns one every field of which is
 * a value this build knows. Unknown fields fall back to the default one at a
 * time, so a profile saved by a newer build still loads.
 */
export function normalizeRecordingProfile(
  candidate: unknown,
  base: RecordingProfile = DEFAULT_RECORDING_PROFILE,
): RecordingProfile {
  const source =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : {};
  return {
    aspectRatio: isRecordingAspectRatio(source.aspectRatio)
      ? source.aspectRatio
      : base.aspectRatio,
    shortEdge: isRecordingShortEdge(source.shortEdge)
      ? source.shortEdge
      : base.shortEdge,
    frameRate: isRecordingFrameRate(source.frameRate)
      ? source.frameRate
      : base.frameRate,
  };
}

export function sameRecordingProfile(
  a: RecordingProfile,
  b: RecordingProfile,
): boolean {
  return (
    a.aspectRatio === b.aspectRatio &&
    a.shortEdge === b.shortEdge &&
    a.frameRate === b.frameRate
  );
}

/** "16:9 · 1920x1080 · 30fps", the way the panel and the MCP result say it. */
export function describeRecordingProfile(profile: RecordingProfile): string {
  const { width, height } = resolveRecordingResolution(profile);
  return `${profile.aspectRatio} · ${width}x${height} · ${profile.frameRate}fps`;
}

/**
 * How the recording view is shown and what it draws.
 *
 * `visible` is not persisted: a restart always comes back in the editing
 * layout, and a recording started through MCP shows the view itself.
 */
export type RecordingViewportSettings = {
  visible: boolean;
  /**
   * `recording` shows the saved recording camera and keeps it while the world
   * changes. `editor` records whatever the Scene View camera is doing, for a
   * take that follows the author's own hand.
   */
  cameraSource: "recording" | "editor";
  /** Keep Hierarchy, Inspector and Assets around the frame. */
  showEditorUi: boolean;
  /** Draw the grid, gizmo, selection and helper icons into the frame. */
  showEditorHelpers: boolean;
  /** The small REC badge over the frame. Never part of the recorded pixels. */
  showRecordingIndicator: boolean;
};

export const DEFAULT_RECORDING_VIEWPORT_SETTINGS: RecordingViewportSettings = {
  visible: false,
  cameraSource: "recording",
  showEditorUi: false,
  showEditorHelpers: false,
  showRecordingIndicator: true,
};

export function normalizeRecordingViewportSettings(
  candidate: unknown,
  base: RecordingViewportSettings = DEFAULT_RECORDING_VIEWPORT_SETTINGS,
): RecordingViewportSettings {
  const source =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : {};
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  return {
    visible: bool(source.visible, base.visible),
    cameraSource:
      source.cameraSource === "editor" || source.cameraSource === "recording"
        ? source.cameraSource
        : base.cameraSource,
    showEditorUi: bool(source.showEditorUi, base.showEditorUi),
    showEditorHelpers: bool(source.showEditorHelpers, base.showEditorHelpers),
    showRecordingIndicator: bool(
      source.showRecordingIndicator,
      base.showRecordingIndicator,
    ),
  };
}
