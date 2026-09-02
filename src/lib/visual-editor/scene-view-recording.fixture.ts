import {
  DEFAULT_SESSION_RECORDING_FPS,
  SESSION_RECORDING_FPS_OPTIONS,
  SESSION_RECORDING_MAX_DURATION_MS,
  createSessionRecordingSettings,
  estimateSessionRecordingBytesPerHour,
  formatRecordingBytes,
  formatRecordingElapsed,
  resolveSessionRecordingFps,
  sessionRecordingBitsPerSecond,
} from "./scene-view-recording";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runSceneViewRecordingFixtureAssertions(): void {
  assert(
    SESSION_RECORDING_FPS_OPTIONS.includes(DEFAULT_SESSION_RECORDING_FPS),
    "the default session fps is one of the offered options",
  );

  assert(resolveSessionRecordingFps(5) === 5, "an in-range integer fps passes through");
  assert(resolveSessionRecordingFps(1) === 1 && resolveSessionRecordingFps(10) === 10, "the range bounds are inclusive");
  assert(resolveSessionRecordingFps(0) === null, "0fps is rejected");
  assert(resolveSessionRecordingFps(11) === null, "11fps is rejected");
  assert(resolveSessionRecordingFps(2.5) === null, "a fractional fps is rejected");
  assert(resolveSessionRecordingFps("5") === null, "a string fps is rejected");

  assert(sessionRecordingBitsPerSecond(5) === 1_500_000, "5fps records at 1.5 Mbps");
  assert(sessionRecordingBitsPerSecond(10) === 3_000_000, "10fps records at 3 Mbps");
  assert(sessionRecordingBitsPerSecond(1) === 600_000, "1fps keeps the bitrate floor");

  const settings = createSessionRecordingSettings(5);
  assert(settings.fps === 5 && settings.bitsPerSecond === 1_500_000, "settings carry fps and bitrate");
  assert(settings.timesliceMs === 5_000, "chunks are handed over every 5 seconds");
  assert(settings.maxDurationMs === SESSION_RECORDING_MAX_DURATION_MS, "the safety stop is the 24 hour cap");

  const perHour = estimateSessionRecordingBytesPerHour(5);
  assert(Math.round(perHour / (1024 * 1024)) === 644, "5fps uses about 644 MB per hour");

  assert(formatRecordingElapsed(0) === "0:00:00", "elapsed starts at zero");
  assert(formatRecordingElapsed(59_999) === "0:00:59", "elapsed floors partial seconds");
  assert(formatRecordingElapsed(3_661_000) === "1:01:01", "elapsed shows hours without padding");
  assert(formatRecordingElapsed(39_600_000) === "11:00:00", "an eleven hour recording reads as hours");

  assert(formatRecordingBytes(512) === "1 KB", "small sizes round to whole KB");
  assert(formatRecordingBytes(15 * 1024 * 1024) === "15 MB", "MB sizes have no decimals");
  assert(formatRecordingBytes(1.5 * 1024 * 1024 * 1024) === "1.50 GB", "GB sizes keep two decimals");
}
