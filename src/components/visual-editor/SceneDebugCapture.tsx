import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Scene } from "three";
import { estimateSceneVram, type SceneVramEstimate } from "./scene-vram-estimate";

export type ScenePerformanceMetrics = SceneVramEstimate & {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  visibleMeshes: number;
  totalMeshes: number;
  cameraPosition: [number, number, number];
  cameraFar: number;
  sampledAt: number;
};

export type SceneDebugCaptureRequest = {
  id: number;
  action: "metrics" | "start" | "stop";
  /**
   * `clip` (default) is the bounded in-memory diagnostic clip. `session` is the
   * long recording that streams to app data with an activity log beside it.
   */
  mode?: "clip" | "session";
  durationMs?: number;
  /** Session mode only: frames per second, 1 to 10. */
  fps?: number;
  autoSave?: boolean;
};

export type SceneDebugCaptureResult = {
  requestId: number;
  action: SceneDebugCaptureRequest["action"];
  status: "ready" | "recording" | "saved" | "error";
  mode?: "clip" | "session";
  metrics?: ScenePerformanceMetrics;
  path?: string;
  /** Session mode: the folder holding the video and the activity log. */
  directory?: string;
  logPath?: string;
  videoBytes?: number;
  toolCalls?: number;
  durationMs?: number;
  message?: string;
};

type ScenePerformanceProbeProps = {
  enabled: boolean;
  onSample: (metrics: ScenePerformanceMetrics) => void;
};

/**
 * Samples the actual Three.js renderer rather than estimating performance from
 * React state. The low sample rate keeps the Inspector responsive while still
 * giving an agent enough evidence to compare a good and a bad frame.
 */
export function ScenePerformanceProbe({
  enabled,
  onSample,
}: ScenePerformanceProbeProps) {
  const { camera, gl, scene } = useThree();
  const elapsedRef = useRef(0);
  const frameCountRef = useRef(0);
  const frameTimeRef = useRef(0);

  useFrame((_state, delta) => {
    if (!enabled) return;
    elapsedRef.current += delta;
    frameCountRef.current += 1;
    frameTimeRef.current += delta;
    if (elapsedRef.current < 0.5) return;

    const elapsed = elapsedRef.current;
    const totalMeshes = countMeshes(scene, false);
    const visibleMeshes = countMeshes(scene, true);
    const fps = Math.min(240, frameCountRef.current / elapsed);
    const frameTimeMs = (frameTimeRef.current / frameCountRef.current) * 1000;
    onSample({
      ...estimateSceneVram(scene),
      fps,
      frameTimeMs,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      visibleMeshes,
      totalMeshes,
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      cameraFar: camera.far,
      sampledAt: Date.now(),
    });
    elapsedRef.current = 0;
    frameCountRef.current = 0;
    frameTimeRef.current = 0;
  });

  return null;
}

function countMeshes(scene: Scene, visibleOnly: boolean): number {
  let count = 0;
  const visit = (object: { type: string }) => {
    if (object.type !== "Mesh" && object.type !== "SkinnedMesh") return;
    count += 1;
  };
  if (visibleOnly) {
    scene.traverseVisible(visit);
  } else {
    scene.traverse(visit);
  }
  return count;
}

export type SceneVideoCaptureProps = {
  recording: boolean;
  maxDurationMs?: number;
  onComplete: (blob: Blob) => void;
  onError: (message: string) => void;
  onAutoStop?: () => void;
};

type ActiveRecorder = {
  recorder: MediaRecorder;
  chunks: Blob[];
  stream: MediaStream;
};

/**
 * Records the real Scene View canvas for a short reproducible clip. This is
 * intentionally bounded: debugging should leave a small artifact that can be
 * attached to a report, not an unbounded screen recorder.
 */
export function SceneVideoCapture({
  recording,
  maxDurationMs = 15_000,
  onComplete,
  onError,
  onAutoStop,
}: SceneVideoCaptureProps) {
  const { gl } = useThree();
  const activeRef = useRef<ActiveRecorder | null>(null);
  const completeRef = useRef(onComplete);
  const errorRef = useRef(onError);
  const autoStopRef = useRef(onAutoStop);
  completeRef.current = onComplete;
  errorRef.current = onError;
  autoStopRef.current = onAutoStop;

  useEffect(() => {
    if (!recording || activeRef.current) return;
    const canvas = gl.domElement as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      errorRef.current("このWebViewはScene Viewの動画録画に対応していません。");
      return;
    }

    let stream: MediaStream;
    try {
      stream = canvas.captureStream(30);
    } catch (error) {
      errorRef.current(error instanceof Error ? error.message : "Scene Viewを録画できませんでした。");
      return;
    }

    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      errorRef.current("このWebViewで利用できるWebM録画形式がありません。");
      return;
    }

    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      errorRef.current(error instanceof Error ? error.message : "Scene Viewを録画できませんでした。");
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      activeRef.current = null;
      errorRef.current("Scene Viewの動画録画中にエラーが発生しました。");
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      activeRef.current = null;
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        errorRef.current("録画されたフレームがありません。");
        return;
      }
      completeRef.current(blob);
    };
    activeRef.current = { recorder, chunks, stream };
    recorder.start(250);

    const timeout = window.setTimeout(() => {
      if (activeRef.current?.recorder === recorder) {
        autoStopRef.current?.();
      }
    }, maxDurationMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [gl, maxDurationMs, recording]);

  useEffect(() => {
    if (recording || !activeRef.current) return;
    const { recorder } = activeRef.current;
    if (recorder.state !== "inactive") recorder.stop();
  }, [recording]);

  useEffect(
    () => () => {
      const active = activeRef.current;
      if (!active) return;
      active.stream.getTracks().forEach((track) => track.stop());
      if (active.recorder.state !== "inactive") active.recorder.stop();
      activeRef.current = null;
    },
    [],
  );

  return null;
}

export type SceneSessionRecorderSettings = {
  fps: number;
  bitsPerSecond: number;
  timesliceMs: number;
  maxDurationMs: number;
};

export type SceneSessionRecorderProps = {
  /** Non-null while a session should be recording. Set null to stop. */
  settings: SceneSessionRecorderSettings | null;
  /** The recorder produced its first data; the video clock starts here. */
  onStarted: () => void;
  /**
   * One chunk of WebM. Chunks are delivered in order and the next is not
   * handed over until the returned promise settles, so appending them to one
   * file reproduces exactly the Blob the clip recorder would have built.
   */
  onChunk: (bytes: Uint8Array) => Promise<void>;
  /** The recorder stopped and every chunk has been handed over. */
  onStopped: () => void;
  onError: (message: string) => void;
  /** The safety cap was reached; the parent is expected to set settings null. */
  onAutoStop: () => void;
};

type ActiveSessionRecorder = {
  recorder: MediaRecorder;
  stream: MediaStream;
  /** Serialises chunk delivery so appends never race or reorder. */
  queue: Promise<void>;
  failed: boolean;
};

/**
 * Records the real Scene View canvas for as long as it is asked to, handing
 * each chunk over as it arrives instead of holding the whole recording in
 * memory. Frame rate and bitrate come from the settings: a session is watched
 * as a timelapse, so it records few frames and keeps each one sharp.
 */
export function SceneSessionRecorder({
  settings,
  onStarted,
  onChunk,
  onStopped,
  onError,
  onAutoStop,
}: SceneSessionRecorderProps) {
  const { gl } = useThree();
  const activeRef = useRef<ActiveSessionRecorder | null>(null);
  const startedRef = useRef(onStarted);
  const chunkRef = useRef(onChunk);
  const stoppedRef = useRef(onStopped);
  const errorRef = useRef(onError);
  const autoStopRef = useRef(onAutoStop);
  startedRef.current = onStarted;
  chunkRef.current = onChunk;
  stoppedRef.current = onStopped;
  errorRef.current = onError;
  autoStopRef.current = onAutoStop;

  useEffect(() => {
    if (!settings || activeRef.current) return;
    const canvas = gl.domElement as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      errorRef.current("このWebViewはScene Viewの動画録画に対応していません。");
      return;
    }

    let stream: MediaStream;
    try {
      stream = canvas.captureStream(settings.fps);
    } catch (error) {
      errorRef.current(error instanceof Error ? error.message : "Scene Viewを録画できませんでした。");
      return;
    }

    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      errorRef.current("このWebViewで利用できるWebM録画形式がありません。");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: settings.bitsPerSecond,
      });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      errorRef.current(error instanceof Error ? error.message : "Scene Viewを録画できませんでした。");
      return;
    }

    const active: ActiveSessionRecorder = {
      recorder,
      stream,
      queue: Promise.resolve(),
      failed: false,
    };
    const fail = (message: string) => {
      if (active.failed) return;
      active.failed = true;
      stream.getTracks().forEach((track) => track.stop());
      if (recorder.state !== "inactive") recorder.stop();
      errorRef.current(message);
    };
    recorder.onstart = () => {
      startedRef.current();
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0 || active.failed) return;
      const blob = event.data;
      active.queue = active.queue
        .then(async () => {
          if (active.failed) return;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await chunkRef.current(bytes);
        })
        .catch((error: unknown) => {
          fail(error instanceof Error ? error.message : "録画データを保存できませんでした。");
        });
    };
    recorder.onerror = () => {
      fail("Scene Viewの動画録画中にエラーが発生しました。");
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      // onstop fires after the final ondataavailable, so once the queue
      // drains every chunk has reached the file.
      void active.queue.finally(() => {
        if (activeRef.current === active) activeRef.current = null;
        if (!active.failed) stoppedRef.current();
      });
    };
    activeRef.current = active;
    try {
      recorder.start(settings.timesliceMs);
    } catch (error) {
      activeRef.current = null;
      fail(error instanceof Error ? error.message : "Scene Viewを録画できませんでした。");
      return;
    }

    const timeout = window.setTimeout(() => {
      if (activeRef.current === active) {
        autoStopRef.current();
      }
    }, settings.maxDurationMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [gl, settings]);

  useEffect(() => {
    if (settings || !activeRef.current) return;
    const { recorder } = activeRef.current;
    if (recorder.state !== "inactive") recorder.stop();
  }, [settings]);

  useEffect(
    () => () => {
      const active = activeRef.current;
      if (!active) return;
      active.stream.getTracks().forEach((track) => track.stop());
      if (active.recorder.state !== "inactive") active.recorder.stop();
      activeRef.current = null;
    },
    [],
  );

  return null;
}

export function formatDebugNumber(value: number, digits = 0): string {
  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function SceneVramMetrics({ metrics }: { metrics: SceneVramEstimate }) {
  const format = (bytes: number) => `${formatDebugNumber(bytes / (1024 * 1024), 1)} MiB`;
  return (
    <div className="mt-1 border-t border-cyan-200/20 pt-1 text-cyan-100/90">
      <div className="font-semibold">VRAM概算（シーン参照分）</div>
      <div className="grid grid-cols-2 gap-x-3">
        <span>Geometry {format(metrics.geometryVramBytes)}</span>
        <span>Texture {format(metrics.textureVramBytes)}</span>
      </div>
      <dl className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-2">
        <dt>GPU圧縮済み {metrics.compressedTextureCount}件</dt>
        <dd className="text-right">{format(metrics.compressedTextureVramBytes)}</dd>
        <dt>非圧縮 {metrics.uncompressedTextureCount}件</dt>
        <dd className="text-right">{format(metrics.uncompressedTextureVramBytes)}</dd>
      </dl>
      <div className="text-[10px] text-cyan-200/70">Textureの内訳。JPEG / WEBPもGPU上では非圧縮です。</div>
      <div>合計 {format(metrics.geometryVramBytes + metrics.textureVramBytes)}{metrics.unknownVramTextures > 0 ? `・未算定Texture ${metrics.unknownVramTextures}件` : ""}</div>
      <div className="text-[10px] text-cyan-200/70">共有参照は重複除外。影・描画バッファ・内部生成領域は含みません。</div>
    </div>
  );
}
