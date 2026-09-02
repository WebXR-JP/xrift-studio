/**
 * The one recording controller the app has.
 *
 * It lives outside the React tree on purpose. The Scene View canvas is
 * remounted when the projection flips, when a project is reloaded, and when
 * the editor closes; a take must survive all of that. So the controller owns a
 * recording frame of its own (a plain canvas sized exactly to the profile),
 * the Scene View *registers* itself as the source, and every rendered frame is
 * copied into the recording frame. Lose the source and the video simply holds
 * its last picture until a Scene View comes back.
 *
 * Idempotency is the contract: `start` while recording returns the current
 * take, `stop` while idle returns the current state, and both are safe to call
 * from a button, from MCP, and from both at once.
 */

import {
  DEFAULT_RECORDING_PROFILE,
  DEFAULT_RECORDING_VIEWPORT_SETTINGS,
  describeRecordingProfile,
  normalizeRecordingProfile,
  normalizeRecordingViewportSettings,
  resolveRecordingBitrate,
  resolveRecordingResolution,
  type RecordingProfile,
  type RecordingViewportSettings,
} from "./recording-profile";
import {
  DEFAULT_RECORDING_CAMERA_POSE,
  normalizeRecordingCameraPose,
  type RecordingCameraPose,
} from "./recording-camera";
import {
  IDLE_RECORDING_SNAPSHOT,
  createRecordingFileStem,
  decideRecordingStart,
  isRecordingActive,
  recordingExtensionForMimeType,
  reduceRecordingCompleted,
  reduceRecordingFailed,
  reduceRecordingProgress,
  reduceRecordingStarted,
  reduceRecordingStopping,
  serializeRecordingSnapshot,
  type RecordingSnapshot,
} from "./recording-state";
import {
  createDefaultRecordingSink,
  type RecordingSink,
} from "./recording-sink";

export const RECORDING_STORAGE_KEY = "xrift-studio.recording.v1";

/** A take that nobody stopped still ends, so a forgotten REC cannot fill a disk. */
export const RECORDING_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
/** The in-memory browser sink has no disk behind it. */
export const RECORDING_MEMORY_MAX_DURATION_MS = 60 * 1000;
const RECORDING_TIMESLICE_MS = 1_000;

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
];

export type RecordingStoreState = {
  snapshot: RecordingSnapshot;
  profile: RecordingProfile;
  viewport: RecordingViewportSettings;
  /** Pose for the active project. */
  camera: RecordingCameraPose;
  /** null means the native default directory. */
  outputDirectory: string | null;
  /** Whether a Scene View is currently feeding frames. */
  sourceAvailable: boolean;
  activeProjectId: string | null;
};

type PersistedRecordingState = {
  profile?: unknown;
  viewport?: unknown;
  cameras?: Record<string, unknown>;
  outputDirectory?: unknown;
};

export type RecordingStartOptions = {
  label?: string | null;
  projectId?: string | null;
  projectTitle?: string | null;
  sceneId?: string | null;
  clientName?: string | null;
  /** Overrides the stored profile for this take only. */
  profile?: RecordingProfile;
  sink?: RecordingSink;
  now?: number;
};

export type RecordingStartResult = {
  /** false when a take was already running or still saving. */
  started: boolean;
  snapshot: RecordingSnapshot;
  message?: string;
};

export type RecordingStopResult = {
  /** false when nothing was recording. */
  stopped: boolean;
  snapshot: RecordingSnapshot;
};

type ActiveTake = {
  sessionId: string;
  recorder: MediaRecorder;
  stream: MediaStream;
  track: MediaStreamTrack & { requestFrame?: () => void };
  frame: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  sink: RecordingSink;
  frameIntervalMs: number;
  lastFrameAt: number;
  frameCount: number;
  bytesWritten: number;
  chunkCount: number;
  writeChain: Promise<void>;
  writeFailure: Error | null;
  stopRequested: boolean;
  /** Resolves once the take has left `stopping`. */
  settled: Promise<RecordingSnapshot>;
  settle: (snapshot: RecordingSnapshot) => void;
  timeout: number | null;
  metadata: Record<string, unknown>;
};

type Listener = () => void;

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readPersisted(): PersistedRecordingState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RECORDING_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as PersistedRecordingState)
      : {};
  } catch {
    return {};
  }
}

class RecordingSessionStore {
  private state: RecordingStoreState;
  private listeners = new Set<Listener>();
  private cameras: Record<string, RecordingCameraPose>;
  private source: HTMLCanvasElement | null = null;
  private active: ActiveTake | null = null;

  constructor() {
    const persisted = readPersisted();
    this.cameras = {};
    for (const [projectId, pose] of Object.entries(persisted.cameras ?? {})) {
      this.cameras[projectId] = normalizeRecordingCameraPose(pose);
    }
    this.state = {
      snapshot: IDLE_RECORDING_SNAPSHOT,
      profile: normalizeRecordingProfile(persisted.profile),
      viewport: {
        ...normalizeRecordingViewportSettings(persisted.viewport),
        visible: false,
      },
      camera: DEFAULT_RECORDING_CAMERA_POSE,
      outputDirectory:
        typeof persisted.outputDirectory === "string" &&
        persisted.outputDirectory.length > 0
          ? persisted.outputDirectory
          : null,
      sourceAvailable: false,
      activeProjectId: null,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): RecordingStoreState => this.state;

  private setState(patch: Partial<RecordingStoreState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    const { visible: _visible, ...viewport } = this.state.viewport;
    const payload: PersistedRecordingState = {
      profile: this.state.profile,
      viewport,
      cameras: this.cameras,
      outputDirectory: this.state.outputDirectory,
    };
    try {
      window.localStorage.setItem(RECORDING_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Best effort: the current session still has the values.
    }
  }

  // ---------------------------------------------------------------- settings

  setActiveProject(projectId: string | null): void {
    if (projectId === this.state.activeProjectId) return;
    this.setState({
      activeProjectId: projectId,
      camera:
        (projectId ? this.cameras[projectId] : undefined) ??
        DEFAULT_RECORDING_CAMERA_POSE,
    });
  }

  /**
   * Stored for the next take. A running take keeps the profile it opened its
   * file with; the caller is told which of the two happened.
   */
  setProfile(patch: Partial<RecordingProfile>): {
    profile: RecordingProfile;
    effectiveFrom: "now" | "next-recording";
  } {
    const profile = normalizeRecordingProfile(
      { ...this.state.profile, ...patch },
      this.state.profile,
    );
    this.setState({ profile });
    this.persist();
    return {
      profile,
      effectiveFrom: isRecordingActive(this.state.snapshot)
        ? "next-recording"
        : "now",
    };
  }

  setViewport(patch: Partial<RecordingViewportSettings>): RecordingViewportSettings {
    const viewport = normalizeRecordingViewportSettings(
      { ...this.state.viewport, ...patch },
      this.state.viewport,
    );
    this.setState({ viewport });
    this.persist();
    return viewport;
  }

  setCamera(pose: RecordingCameraPose): RecordingCameraPose {
    const camera = normalizeRecordingCameraPose(pose, this.state.camera);
    if (this.state.activeProjectId) {
      this.cameras[this.state.activeProjectId] = camera;
    }
    this.setState({ camera });
    this.persist();
    return camera;
  }

  setOutputDirectory(directory: string | null): void {
    this.setState({ outputDirectory: directory });
    this.persist();
  }

  // ------------------------------------------------------------------ source

  /** The Scene View calls this from inside its Canvas; returns the unregister. */
  registerSource(canvas: HTMLCanvasElement): () => void {
    this.source = canvas;
    this.setState({ sourceAvailable: true });
    return () => {
      if (this.source !== canvas) return;
      this.source = null;
      this.setState({ sourceAvailable: false });
    };
  }

  /**
   * Copies the current Scene View frame into the recording frame. Called right
   * after React Three Fiber renders, while the drawing buffer is still valid.
   * Cover-crops rather than stretches, so a source of a different shape never
   * distorts the take.
   */
  pumpFrame(now = performance.now()): void {
    const take = this.active;
    const source = this.source;
    if (!take || !source || take.stopRequested) return;
    if (now - take.lastFrameAt < take.frameIntervalMs - 1) return;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    if (sourceWidth === 0 || sourceHeight === 0) return;
    const { width, height } = take.frame;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const cropWidth = width / scale;
    const cropHeight = height / scale;
    const cropX = (sourceWidth - cropWidth) / 2;
    const cropY = (sourceHeight - cropHeight) / 2;
    try {
      take.context.drawImage(
        source,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height,
      );
    } catch {
      return;
    }
    take.lastFrameAt = now;
    take.frameCount += 1;
    take.track.requestFrame?.();
  }

  // ------------------------------------------------------------------- takes

  async startRecording(
    options: RecordingStartOptions = {},
  ): Promise<RecordingStartResult> {
    const decision = decideRecordingStart(this.state.snapshot);
    if (!decision.ok) {
      return {
        started: false,
        snapshot: this.state.snapshot,
        message: decision.message,
      };
    }
    if (this.active) {
      // Snapshot and controller disagree only if a previous take never
      // settled; treat it like `stopping` rather than opening a second file.
      return {
        started: false,
        snapshot: this.state.snapshot,
        message: "前の録画がまだ終了していません",
      };
    }

    const now = options.now ?? Date.now();
    const profile = options.profile
      ? normalizeRecordingProfile(options.profile, this.state.profile)
      : this.state.profile;
    const { width, height } = resolveRecordingResolution(profile);

    if (typeof MediaRecorder === "undefined" || typeof document === "undefined") {
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: "このWebViewは動画の録画に対応していません",
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }
    const mimeType = MIME_CANDIDATES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    );
    if (!mimeType) {
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: "このWebViewで利用できる動画形式がありません",
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }

    const frame = document.createElement("canvas");
    frame.width = width;
    frame.height = height;
    const context = frame.getContext("2d", { alpha: false });
    const capture = frame as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (!context || !capture.captureStream) {
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: "録画用のフレームを作成できませんでした",
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);

    const sink = options.sink ?? createDefaultRecordingSink();
    const usesMemorySink = !options.sink && !isDesktop();
    const sessionId = createSessionId();
    const extension = recordingExtensionForMimeType(mimeType);
    const fileStem = createRecordingFileStem({
      projectTitle: options.projectTitle,
      startedAt: new Date(now),
      profile,
      label: options.label,
    });

    let opened: { path: string; directory: string };
    try {
      opened = await sink.open({
        fileStem,
        extension,
        directory: this.state.outputDirectory,
      });
    } catch (error) {
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: `録画ファイルを作成できませんでした: ${errorMessage(error)}`,
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }
    // Two callers racing through `await open` land here one after the other;
    // the second must not replace the first take's recorder.
    if (this.active) {
      await sink.abort();
      return {
        started: false,
        snapshot: this.state.snapshot,
        message: "すでに録画中です。現在の録画をそのまま続けます",
      };
    }

    let stream: MediaStream;
    let recorder: MediaRecorder;
    try {
      stream = capture.captureStream(profile.frameRate);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: resolveRecordingBitrate(profile),
      });
    } catch (error) {
      await sink.abort();
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: `録画を開始できませんでした: ${errorMessage(error)}`,
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }
    const [track] = stream.getVideoTracks();

    let settle: (snapshot: RecordingSnapshot) => void = () => {};
    const settled = new Promise<RecordingSnapshot>((resolve) => {
      settle = resolve;
    });
    const take: ActiveTake = {
      sessionId,
      recorder,
      stream,
      track: track as ActiveTake["track"],
      frame,
      context,
      sink,
      frameIntervalMs: 1000 / profile.frameRate,
      lastFrameAt: -Infinity,
      frameCount: 0,
      bytesWritten: 0,
      chunkCount: 0,
      writeChain: Promise.resolve(),
      writeFailure: null,
      stopRequested: false,
      settled,
      settle,
      timeout: null,
      metadata: {
        sessionId,
        label: options.label ?? null,
        projectId: options.projectId ?? null,
        projectTitle: options.projectTitle ?? null,
        sceneId: options.sceneId ?? null,
        clientName: options.clientName ?? null,
        profile,
        profileLabel: describeRecordingProfile(profile),
        width,
        height,
        mimeType,
        startedAt: new Date(now).toISOString(),
        camera: this.state.camera,
        viewport: this.state.viewport,
        outputDirectory: opened.directory,
      },
    };
    this.active = take;

    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      this.enqueueChunk(take, event.data);
    };
    recorder.onerror = () => {
      this.failTake(take, "録画中にエンコーダーがエラーを返しました");
    };
    recorder.onstop = () => {
      void this.finalizeTake(take);
    };

    try {
      recorder.start(RECORDING_TIMESLICE_MS);
    } catch (error) {
      this.active = null;
      stream.getTracks().forEach((t) => t.stop());
      await sink.abort();
      const snapshot = reduceRecordingFailed(IDLE_RECORDING_SNAPSHOT, {
        message: `録画を開始できませんでした: ${errorMessage(error)}`,
        now,
      });
      this.setState({ snapshot });
      return { started: false, snapshot, message: snapshot.message ?? undefined };
    }

    const snapshot = reduceRecordingStarted({
      sessionId,
      startedAt: now,
      profile,
      width,
      height,
      mimeType,
      label: options.label,
      projectId: options.projectId,
      projectTitle: options.projectTitle,
      sceneId: options.sceneId,
      clientName: options.clientName,
      path: opened.path,
    });
    this.setState({ snapshot });

    const maxDuration = usesMemorySink
      ? RECORDING_MEMORY_MAX_DURATION_MS
      : RECORDING_MAX_DURATION_MS;
    take.timeout = window.setTimeout(() => {
      if (this.active !== take) return;
      void this.stopRecording({ reason: "上限時間に達したため録画を停止しました" });
    }, maxDuration);

    // Prime the first frame so a take never opens on black.
    this.pumpFrame();
    return { started: true, snapshot };
  }

  private enqueueChunk(take: ActiveTake, blob: Blob): void {
    take.writeChain = take.writeChain
      .then(async () => {
        if (take.writeFailure) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await take.sink.append(bytes);
        take.bytesWritten += bytes.byteLength;
        take.chunkCount += 1;
        if (this.active === take) {
          this.setState({
            snapshot: reduceRecordingProgress(this.state.snapshot, {
              now: Date.now(),
              bytesWritten: take.bytesWritten,
              chunkCount: take.chunkCount,
              frameCount: take.frameCount,
            }),
          });
        }
      })
      .catch((error: unknown) => {
        if (take.writeFailure) return;
        take.writeFailure =
          error instanceof Error ? error : new Error(String(error));
        this.failTake(
          take,
          `録画データを書き込めませんでした: ${take.writeFailure.message}`,
        );
      });
  }

  /** Marks the take failed and stops the encoder; the partial file is kept. */
  private failTake(take: ActiveTake, message: string): void {
    if (this.active !== take) return;
    take.stopRequested = true;
    if (take.timeout !== null) window.clearTimeout(take.timeout);
    this.setState({
      snapshot: reduceRecordingFailed(this.state.snapshot, {
        message,
        now: Date.now(),
      }),
    });
    if (take.recorder.state !== "inactive") {
      try {
        take.recorder.stop();
      } catch {
        void this.finalizeTake(take);
      }
    } else {
      void this.finalizeTake(take);
    }
  }

  private async finalizeTake(take: ActiveTake): Promise<void> {
    if (this.active !== take) return;
    take.stream.getTracks().forEach((t) => t.stop());
    if (take.timeout !== null) window.clearTimeout(take.timeout);
    await take.writeChain;
    const now = Date.now();
    const failed = this.state.snapshot.status === "failed" || take.writeFailure;
    let snapshot: RecordingSnapshot;
    if (failed) {
      const partial = await take.sink.abort();
      snapshot = reduceRecordingFailed(this.state.snapshot, {
        message:
          this.state.snapshot.message ??
          take.writeFailure?.message ??
          "録画に失敗しました",
        now,
        path: partial.path,
      });
    } else {
      try {
        const stopped = this.state.snapshot.stoppedAt ?? now;
        const closed = await take.sink.close({
          ...take.metadata,
          stoppedAt: new Date(stopped).toISOString(),
          durationMs: this.state.snapshot.durationMs,
          bytesWritten: take.bytesWritten,
          chunkCount: take.chunkCount,
          frameCount: take.frameCount,
        });
        snapshot = reduceRecordingCompleted(this.state.snapshot, {
          path: closed.path,
          metadataPath: closed.metadataPath,
          bytesWritten: closed.bytesWritten || take.bytesWritten,
          now,
        });
        if (take.bytesWritten === 0) {
          snapshot = reduceRecordingFailed(snapshot, {
            message: "録画されたフレームがありません",
            now,
          });
        }
      } catch (error) {
        snapshot = reduceRecordingFailed(this.state.snapshot, {
          message: `録画ファイルを閉じられませんでした: ${errorMessage(error)}`,
          now,
        });
      }
    }
    this.active = null;
    this.setState({ snapshot });
    take.settle(snapshot);
  }

  /**
   * Stops the current take and resolves once the file is closed. Safe to call
   * any number of times: while stopping it waits for the same completion, and
   * when idle it returns immediately.
   */
  async stopRecording(
    options: { reason?: string } = {},
  ): Promise<RecordingStopResult> {
    const take = this.active;
    if (!take) {
      return { stopped: false, snapshot: this.state.snapshot };
    }
    if (take.stopRequested) {
      const snapshot = await take.settled;
      return { stopped: false, snapshot };
    }
    take.stopRequested = true;
    if (take.timeout !== null) window.clearTimeout(take.timeout);
    const stopping = reduceRecordingStopping(this.state.snapshot, Date.now());
    this.setState({
      snapshot: options.reason
        ? { ...stopping, message: options.reason }
        : stopping,
    });
    if (take.recorder.state !== "inactive") {
      try {
        take.recorder.stop();
      } catch {
        void this.finalizeTake(take);
      }
    } else {
      void this.finalizeTake(take);
    }
    const snapshot = await take.settled;
    return { stopped: true, snapshot };
  }

  /** Progress the panel shows while recording, refreshed on a timer. */
  tick(now = Date.now()): void {
    if (!isRecordingActive(this.state.snapshot)) return;
    this.setState({
      snapshot: reduceRecordingProgress(this.state.snapshot, {
        now,
        frameCount: this.active?.frameCount,
      }),
    });
  }

  /** What an MCP client or the panel needs in one object. */
  describe(): Record<string, unknown> {
    const { width, height } = resolveRecordingResolution(this.state.profile);
    return {
      recording: serializeRecordingSnapshot(this.state.snapshot),
      profile: {
        ...this.state.profile,
        width,
        height,
        label: describeRecordingProfile(this.state.profile),
      },
      viewport: this.state.viewport,
      camera: this.state.camera,
      outputDirectory: this.state.outputDirectory,
      sourceAvailable: this.state.sourceAvailable,
    };
  }
}

function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const recordingSession = new RecordingSessionStore();

export type { RecordingProfile, RecordingViewportSettings, RecordingCameraPose };
export { DEFAULT_RECORDING_PROFILE, DEFAULT_RECORDING_VIEWPORT_SETTINGS };
