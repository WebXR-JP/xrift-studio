import {
  DEFAULT_RECORDING_PROFILE,
  RECORDING_ASPECT_RATIOS,
  RECORDING_SHORT_EDGES,
  describeRecordingProfile,
  normalizeRecordingProfile,
  normalizeRecordingViewportSettings,
  recordingAspectValue,
  resolveRecordingBitrate,
  resolveRecordingResolution,
} from "./recording-profile";
import {
  IDLE_RECORDING_SNAPSHOT,
  createRecordingFileStem,
  decideRecordingStart,
  formatRecordingDuration,
  recordingExtensionForMimeType,
  reduceRecordingCompleted,
  reduceRecordingFailed,
  reduceRecordingProgress,
  reduceRecordingStarted,
  reduceRecordingStopping,
  serializeRecordingSnapshot,
  slugifyRecordingName,
} from "./recording-state";
import {
  DEFAULT_RECORDING_CAMERA_POSE,
  normalizeRecordingCameraPose,
  resolveRecordingCameraPose,
  unionRecordingCameraBounds,
} from "./recording-camera";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertProfiles(): void {
  for (const aspectRatio of RECORDING_ASPECT_RATIOS) {
    for (const shortEdge of RECORDING_SHORT_EDGES) {
      const { width, height } = resolveRecordingResolution({
        aspectRatio,
        shortEdge,
        frameRate: 30,
      });
      assert(width % 2 === 0 && height % 2 === 0, `${aspectRatio} at ${shortEdge} has an odd edge`);
      assert(Math.min(width, height) === shortEdge, `${aspectRatio} at ${shortEdge} moved the short edge`);
      const expected = recordingAspectValue(aspectRatio);
      assert(
        Math.abs(width / height - expected) < 0.01,
        `${aspectRatio} at ${shortEdge} came out as ${width}x${height}`,
      );
    }
  }
  const landscape = resolveRecordingResolution({ aspectRatio: "16:9", shortEdge: 1080, frameRate: 30 });
  assert(landscape.width === 1920 && landscape.height === 1080, "16:9 1080p is 1920x1080");
  const portrait = resolveRecordingResolution({ aspectRatio: "9:16", shortEdge: 1080, frameRate: 30 });
  assert(portrait.width === 1080 && portrait.height === 1920, "9:16 1080p is 1080x1920");
  const feed = resolveRecordingResolution({ aspectRatio: "4:5", shortEdge: 1080, frameRate: 30 });
  assert(feed.width === 1080 && feed.height === 1350, "4:5 1080p is 1080x1350");

  const normalized = normalizeRecordingProfile({ aspectRatio: "21:9", shortEdge: "1080", frameRate: 24 });
  assert(
    normalized.aspectRatio === DEFAULT_RECORDING_PROFILE.aspectRatio &&
      normalized.shortEdge === DEFAULT_RECORDING_PROFILE.shortEdge &&
      normalized.frameRate === DEFAULT_RECORDING_PROFILE.frameRate,
    "Unknown profile values fall back to the default one field at a time",
  );
  const partial = normalizeRecordingProfile({ aspectRatio: "9:16" });
  assert(partial.aspectRatio === "9:16" && partial.shortEdge === 1080, "A partial profile keeps the other fields");
  assert(
    describeRecordingProfile(partial) === "9:16 · 1080x1920 · 30fps",
    `Profile label was ${describeRecordingProfile(partial)}`,
  );
  const bitrate = resolveRecordingBitrate(partial);
  assert(bitrate >= 4_000_000 && bitrate <= 40_000_000, "Bitrate stays inside the encoder-safe range");

  const viewport = normalizeRecordingViewportSettings({ visible: true, cameraSource: "player", showEditorUi: "yes" });
  assert(
    viewport.visible === true && viewport.cameraSource === "recording" && viewport.showEditorUi === false,
    "Viewport settings reject unknown values field by field",
  );
}

function assertStateMachine(): void {
  const profile = DEFAULT_RECORDING_PROFILE;
  assert(decideRecordingStart(IDLE_RECORDING_SNAPSHOT).ok, "Idle may start");

  const started = reduceRecordingStarted({
    sessionId: "take-1",
    startedAt: 1_000,
    profile,
    width: 1920,
    height: 1080,
    mimeType: "video/webm;codecs=vp9",
    projectId: "project-a",
    projectTitle: "Demo",
    path: "/tmp/take.webm",
  });
  assert(started.status === "recording" && started.sessionId === "take-1", "Start enters recording");
  const secondStart = decideRecordingStart(started);
  assert(!secondStart.ok && secondStart.reason === "recording", "Start while recording is refused, not duplicated");

  const progressed = reduceRecordingProgress(started, { now: 61_000, bytesWritten: 2_048, chunkCount: 60 });
  assert(progressed.durationMs === 60_000 && progressed.bytesWritten === 2_048, "Progress tracks elapsed time and bytes");
  assert(formatRecordingDuration(progressed.durationMs) === "00:01:00", "Duration formats as HH:MM:SS");

  const stoppedIdle = reduceRecordingStopping(IDLE_RECORDING_SNAPSHOT, 5_000);
  assert(stoppedIdle === IDLE_RECORDING_SNAPSHOT, "Stop while idle returns the same state");
  const stopping = reduceRecordingStopping(progressed, 90_000);
  assert(stopping.status === "stopping" && stopping.stoppedAt === 90_000, "Stop enters stopping");
  const stopTwice = reduceRecordingStopping(stopping, 95_000);
  assert(stopTwice === stopping, "Stop while stopping changes nothing");
  const stoppingStart = decideRecordingStart(stopping);
  assert(!stoppingStart.ok && stoppingStart.reason === "stopping", "Start while stopping waits for the flush");

  const completed = reduceRecordingCompleted(stopping, {
    path: "/tmp/take.webm",
    metadataPath: "/tmp/take.json",
    bytesWritten: 4_096,
    now: 91_000,
  });
  assert(
    completed.status === "completed" && completed.durationMs === 89_000 && completed.path === "/tmp/take.webm",
    "Completed keeps the stop time, not the flush time",
  );
  assert(decideRecordingStart(completed).ok, "A completed take may be followed by a new one");
  assert(reduceRecordingCompleted(completed, { path: null, now: 99_000 }) === completed, "Completing twice is a no-op");

  const failed = reduceRecordingFailed(progressed, { message: "disk full", now: 70_000 });
  assert(failed.status === "failed" && failed.path === "/tmp/take.webm" && failed.message === "disk full", "Failure keeps the partial path");
  assert(decideRecordingStart(failed).ok, "A failed take may be retried");

  const serialized = serializeRecordingSnapshot(completed);
  assert(
    serialized.statusLabel === "保存済み" && typeof serialized.summary === "string" && serialized.durationLabel === "00:01:29",
    "Serialized snapshot carries the derived labels",
  );
}

function assertFileNaming(): void {
  assert(slugifyRecordingName("My Cool World!!") === "my-cool-world", "Slug lowercases and joins words");
  assert(slugifyRecordingName("森のワールド") === "world", "A non-ASCII title falls back to world");
  assert(slugifyRecordingName("", "") === "", "An empty label stays empty");
  const stem = createRecordingFileStem({
    projectTitle: "Sky Garden",
    startedAt: new Date(2026, 8, 2, 14, 30, 5),
    profile: { aspectRatio: "9:16", shortEdge: 1080, frameRate: 30 },
    label: "Codex run 3",
  });
  assert(stem === "xrift-sky-garden-20260902-143005-9x16-1080p-codex-run-3", `File stem was ${stem}`);
  assert(recordingExtensionForMimeType("video/mp4;codecs=avc1") === "mp4", "mp4 MIME maps to mp4");
  assert(recordingExtensionForMimeType("video/webm;codecs=vp9") === "webm", "webm MIME maps to webm");
}

function assertCamera(): void {
  const frame = { aspect: 16 / 9 };
  const explicit = resolveRecordingCameraPose(
    DEFAULT_RECORDING_CAMERA_POSE,
    { position: [1, 2, 3], target: [0, 0, 0], fov: 40 },
    frame,
  );
  assert(
    explicit.position.join(",") === "1,2,3" && explicit.target.join(",") === "0,0,0" && explicit.fov === 40,
    "Explicit placement is taken literally",
  );
  const targetOnly = resolveRecordingCameraPose(
    { position: [0, 0, 10], target: [0, 0, 0], fov: 50 },
    { target: [5, 0, 0] },
    frame,
  );
  assert(targetOnly.position.join(",") === "5,0,10", "Target alone keeps the current offset");

  const fitted = resolveRecordingCameraPose(
    DEFAULT_RECORDING_CAMERA_POSE,
    { preset: "iso", bounds: { center: [10, 0, 10], radius: 20 } },
    frame,
  );
  const distance = Math.hypot(
    fitted.position[0] - fitted.target[0],
    fitted.position[1] - fitted.target[1],
    fitted.position[2] - fitted.target[2],
  );
  assert(fitted.target.join(",") === "10,0,10", "Framing looks at the bounds centre");
  assert(distance > 20, `Framing backs off past the radius, got ${distance}`);
  assert(fitted.position[1] > fitted.target[1], "The iso preset looks down on the world");

  const portraitFit = resolveRecordingCameraPose(
    DEFAULT_RECORDING_CAMERA_POSE,
    { preset: "iso", bounds: { center: [0, 0, 0], radius: 20 } },
    { aspect: 9 / 16 },
  );
  const portraitDistance = Math.hypot(...portraitFit.position);
  assert(portraitDistance > distance, "A narrow frame backs further away to keep the width");

  const presetOnly = resolveRecordingCameraPose(
    { position: [0, 5, 10], target: [1, 1, 1], fov: 50 },
    { preset: "top" },
    frame,
  );
  assert(presetOnly.target.join(",") === "1,1,1", "A preset with no bounds keeps the look-at point");
  assert(presetOnly.position[1] > presetOnly.target[1] + 5, "Top looks down from above");

  const union = unionRecordingCameraBounds([
    { center: [0, 0, 0], radius: 1 },
    { center: [10, 0, 0], radius: 1 },
  ]);
  assert(union !== null && union.center[0] === 5 && union.radius >= 6 && union.radius < 6.5, "Union covers both spheres");
  assert(unionRecordingCameraBounds([]) === null, "No bounds means nothing to frame");

  const normalized = normalizeRecordingCameraPose({ position: [1, "x", 3], fov: 500 });
  assert(
    normalized.position.join(",") === DEFAULT_RECORDING_CAMERA_POSE.position.join(",") && normalized.fov === 150,
    "Bad camera values fall back and fov is clamped",
  );
}

export function runRecordingFixtureAssertions(): void {
  assertProfiles();
  assertStateMachine();
  assertFileNaming();
  assertCamera();
}
