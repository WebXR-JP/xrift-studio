/**
 * The recording state machine, as plain data and pure transitions.
 *
 * The browser controller (`recording-session.ts`) owns the MediaRecorder and
 * the file, and it is not testable without a canvas. Everything it has to get
 * right about *state* lives here instead, so "start twice", "stop while idle"
 * and "fail mid-write" are checked by the fixture runner rather than by
 * someone recording for an hour and looking at the result.
 *
 *   idle ──start──▶ recording ──stop──▶ stopping ──flushed──▶ completed
 *     ▲                 │                   │                     │
 *     │                 └──── error ────────┴──▶ failed           │
 *     └────────────────── start (a new session) ◀─────────────────┘
 *
 * Start is only refused while a session is recording or stopping. Stop is
 * never refused: outside `recording` it returns the current state unchanged.
 */

import {
  describeRecordingProfile,
  type RecordingProfile,
} from "./recording-profile";

export const RECORDING_STATUSES = [
  "idle",
  "recording",
  "stopping",
  "completed",
  "failed",
] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export type RecordingSnapshot = {
  status: RecordingStatus;
  /** Stable id for one take, so a caller can tell two starts apart. */
  sessionId: string | null;
  /** Optional caller-supplied name, kept in the file name and sidecar. */
  label: string | null;
  projectId: string | null;
  projectTitle: string | null;
  sceneId: string | null;
  /** MCP client that started the take, when one did. */
  clientName: string | null;
  profile: RecordingProfile | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  startedAt: number | null;
  stoppedAt: number | null;
  /** Milliseconds recorded so far, or the final length once completed. */
  durationMs: number;
  bytesWritten: number;
  chunkCount: number;
  /** Frames copied into the recording frame. Stops rising while no Scene View is mounted. */
  frameCount: number;
  path: string | null;
  metadataPath: string | null;
  /** Why the last take failed, or a note about the current one. */
  message: string | null;
};

export const IDLE_RECORDING_SNAPSHOT: RecordingSnapshot = Object.freeze({
  status: "idle",
  sessionId: null,
  label: null,
  projectId: null,
  projectTitle: null,
  sceneId: null,
  clientName: null,
  profile: null,
  width: null,
  height: null,
  mimeType: null,
  startedAt: null,
  stoppedAt: null,
  durationMs: 0,
  bytesWritten: 0,
  chunkCount: 0,
  frameCount: 0,
  path: null,
  metadataPath: null,
  message: null,
}) as RecordingSnapshot;

export function isRecordingActive(snapshot: RecordingSnapshot): boolean {
  return snapshot.status === "recording" || snapshot.status === "stopping";
}

export type RecordingStartDecision =
  | { ok: true }
  | { ok: false; reason: "recording" | "stopping"; message: string };

/**
 * Whether a new take may begin. A take that is still flushing must finish
 * before another one opens a file, or two sessions would race for the sink.
 */
export function decideRecordingStart(
  snapshot: RecordingSnapshot,
): RecordingStartDecision {
  if (snapshot.status === "recording") {
    return {
      ok: false,
      reason: "recording",
      message: "すでに録画中です。現在の録画をそのまま続けます",
    };
  }
  if (snapshot.status === "stopping") {
    return {
      ok: false,
      reason: "stopping",
      message: "前の録画を保存しています。完了してから開始してください",
    };
  }
  return { ok: true };
}

export type RecordingStartInit = {
  sessionId: string;
  startedAt: number;
  profile: RecordingProfile;
  width: number;
  height: number;
  mimeType: string;
  label?: string | null;
  projectId?: string | null;
  projectTitle?: string | null;
  sceneId?: string | null;
  clientName?: string | null;
  path?: string | null;
};

export function reduceRecordingStarted(
  init: RecordingStartInit,
): RecordingSnapshot {
  return {
    ...IDLE_RECORDING_SNAPSHOT,
    status: "recording",
    sessionId: init.sessionId,
    label: init.label ?? null,
    projectId: init.projectId ?? null,
    projectTitle: init.projectTitle ?? null,
    sceneId: init.sceneId ?? null,
    clientName: init.clientName ?? null,
    profile: init.profile,
    width: init.width,
    height: init.height,
    mimeType: init.mimeType,
    startedAt: init.startedAt,
    path: init.path ?? null,
  };
}

export function reduceRecordingProgress(
  snapshot: RecordingSnapshot,
  progress: {
    now: number;
    bytesWritten?: number;
    chunkCount?: number;
    frameCount?: number;
  },
): RecordingSnapshot {
  if (!isRecordingActive(snapshot)) return snapshot;
  return {
    ...snapshot,
    durationMs:
      snapshot.status === "recording" && snapshot.startedAt !== null
        ? Math.max(0, progress.now - snapshot.startedAt)
        : snapshot.durationMs,
    bytesWritten: progress.bytesWritten ?? snapshot.bytesWritten,
    chunkCount: progress.chunkCount ?? snapshot.chunkCount,
    frameCount: progress.frameCount ?? snapshot.frameCount,
  };
}

/** Stop is idempotent: outside `recording` the snapshot comes back as is. */
export function reduceRecordingStopping(
  snapshot: RecordingSnapshot,
  now: number,
): RecordingSnapshot {
  if (snapshot.status !== "recording") return snapshot;
  return {
    ...snapshot,
    status: "stopping",
    stoppedAt: now,
    durationMs:
      snapshot.startedAt !== null
        ? Math.max(0, now - snapshot.startedAt)
        : snapshot.durationMs,
    message: null,
  };
}

export function reduceRecordingCompleted(
  snapshot: RecordingSnapshot,
  result: {
    path: string | null;
    metadataPath?: string | null;
    bytesWritten?: number;
    now: number;
  },
): RecordingSnapshot {
  if (!isRecordingActive(snapshot)) return snapshot;
  const stoppedAt = snapshot.stoppedAt ?? result.now;
  return {
    ...snapshot,
    status: "completed",
    stoppedAt,
    durationMs:
      snapshot.startedAt !== null
        ? Math.max(0, stoppedAt - snapshot.startedAt)
        : snapshot.durationMs,
    bytesWritten: result.bytesWritten ?? snapshot.bytesWritten,
    path: result.path,
    metadataPath: result.metadataPath ?? null,
    message: null,
  };
}

/**
 * A failure keeps everything known about the take, including a partial file
 * path when one was written: an hour of footage that lost its last second is
 * still worth opening.
 */
export function reduceRecordingFailed(
  snapshot: RecordingSnapshot,
  failure: { message: string; now: number; path?: string | null },
): RecordingSnapshot {
  return {
    ...snapshot,
    status: "failed",
    stoppedAt: snapshot.stoppedAt ?? failure.now,
    durationMs:
      snapshot.startedAt !== null
        ? Math.max(0, (snapshot.stoppedAt ?? failure.now) - snapshot.startedAt)
        : snapshot.durationMs,
    path: failure.path === undefined ? snapshot.path : failure.path,
    message: failure.message,
  };
}

export function formatRecordingDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatRecordingBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Short Japanese label for the status, used by the panel and the badge. */
export function describeRecordingStatus(snapshot: RecordingSnapshot): string {
  switch (snapshot.status) {
    case "idle":
      return "待機中";
    case "recording":
      return "録画中";
    case "stopping":
      return "保存中";
    case "completed":
      return "保存済み";
    case "failed":
      return "失敗";
  }
}

/** One line the panel shows under the status, and the MCP result echoes. */
export function summarizeRecording(snapshot: RecordingSnapshot): string {
  const profile = snapshot.profile
    ? describeRecordingProfile(snapshot.profile)
    : null;
  switch (snapshot.status) {
    case "idle":
      return "録画はまだ開始していません";
    case "recording":
      return `${formatRecordingDuration(snapshot.durationMs)} 録画中${profile ? ` · ${profile}` : ""}`;
    case "stopping":
      return "最後のデータを書き込んでいます";
    case "completed":
      return `${formatRecordingDuration(snapshot.durationMs)} · ${formatRecordingBytes(snapshot.bytesWritten)}${snapshot.path ? ` · ${snapshot.path}` : ""}`;
    case "failed":
      return snapshot.message ?? "録画に失敗しました";
  }
}

/**
 * ASCII-only, so the file name survives every file system and every shell an
 * author pastes it into. Non-ASCII titles collapse to "world" rather than to
 * an empty stem.
 */
export function slugifyRecordingName(value: string, fallback = "world"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** "20260902-143005" in local time, so files sort by when they were taken. */
export function formatRecordingTimestamp(at: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}

/**
 * `xrift-<project>-<timestamp>-<aspect>-<edge>p[-<label>]`, without extension.
 *
 * Every take from the same project sorts together, the timestamp keeps two
 * takes apart, and the frame shape is readable before the file is opened.
 * The native side still refuses to overwrite, so a clock that runs backwards
 * gets a numbered suffix rather than a clobbered file.
 */
export function createRecordingFileStem(input: {
  projectTitle: string | null | undefined;
  startedAt: Date;
  profile: RecordingProfile;
  label?: string | null;
}): string {
  const project = slugifyRecordingName(input.projectTitle ?? "");
  const aspect = input.profile.aspectRatio.replace(":", "x");
  const label = input.label ? slugifyRecordingName(input.label, "") : "";
  return [
    "xrift",
    project,
    formatRecordingTimestamp(input.startedAt),
    aspect,
    `${input.profile.shortEdge}p`,
    ...(label ? [label] : []),
  ].join("-");
}

/** File extension the container needs, from the MediaRecorder MIME type. */
export function recordingExtensionForMimeType(mimeType: string): "webm" | "mp4" {
  return /^video\/mp4/i.test(mimeType) ? "mp4" : "webm";
}

/**
 * Serializable view of a snapshot for MCP results and the sidecar file. Same
 * fields, plus the derived strings a client would otherwise recompute.
 */
export function serializeRecordingSnapshot(
  snapshot: RecordingSnapshot,
): Record<string, unknown> {
  return {
    ...snapshot,
    statusLabel: describeRecordingStatus(snapshot),
    summary: summarizeRecording(snapshot),
    durationLabel: formatRecordingDuration(snapshot.durationMs),
    ...(snapshot.profile
      ? { profileLabel: describeRecordingProfile(snapshot.profile) }
      : {}),
  };
}
