/**
 * Settings and display helpers for the long Scene View recording.
 *
 * The short diagnostic clip records at 30fps for fifteen seconds. A session
 * recording runs for hours and is watched later as a timelapse, so it records
 * few frames per second at a bitrate that keeps each frame sharp, and it is
 * the kit script, not the recorder, that speeds it up. These numbers are pure
 * so the fixture can pin them and the UI can quote them.
 */

export const SESSION_RECORDING_FPS_OPTIONS = [1, 2, 5, 10] as const;
export type SessionRecordingFps = (typeof SESSION_RECORDING_FPS_OPTIONS)[number];

export const DEFAULT_SESSION_RECORDING_FPS: SessionRecordingFps = 5;
export const SESSION_RECORDING_MIN_FPS = 1;
export const SESSION_RECORDING_MAX_FPS = 10;

/** How often MediaRecorder hands over a chunk to append to disk. */
export const SESSION_RECORDING_TIMESLICE_MS = 5_000;

/**
 * A safety stop, not a design limit. A recording that has run for a day was
 * forgotten, and stopping it keeps the disk from filling silently.
 */
export const SESSION_RECORDING_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Per-frame budget: 300 kbit keeps a 1080p frame readable in a timelapse
 * where every source frame may end up on screen. The floor stops 1fps from
 * starving the encoder.
 */
const SESSION_RECORDING_BITS_PER_FRAME = 300_000;
const SESSION_RECORDING_MIN_BITS_PER_SECOND = 600_000;

export type SessionRecordingSettings = {
  fps: number;
  bitsPerSecond: number;
  timesliceMs: number;
  maxDurationMs: number;
};

/**
 * Accepts an integer frame rate within the session range. Anything else
 * returns null so a caller can report the bad value instead of recording at
 * a rate it did not ask for.
 */
export function resolveSessionRecordingFps(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < SESSION_RECORDING_MIN_FPS || value > SESSION_RECORDING_MAX_FPS) return null;
  return value;
}

export function sessionRecordingBitsPerSecond(fps: number): number {
  return Math.max(
    SESSION_RECORDING_MIN_BITS_PER_SECOND,
    fps * SESSION_RECORDING_BITS_PER_FRAME,
  );
}

export function createSessionRecordingSettings(fps: number): SessionRecordingSettings {
  return {
    fps,
    bitsPerSecond: sessionRecordingBitsPerSecond(fps),
    timesliceMs: SESSION_RECORDING_TIMESLICE_MS,
    maxDurationMs: SESSION_RECORDING_MAX_DURATION_MS,
  };
}

/** Rough disk use per hour at the given frame rate, for the UI to quote. */
export function estimateSessionRecordingBytesPerHour(fps: number): number {
  return (sessionRecordingBitsPerSecond(fps) / 8) * 3600;
}

/** `h:mm:ss`, always with hours so a long recording reads at a glance. */
export function formatRecordingElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatRecordingBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
