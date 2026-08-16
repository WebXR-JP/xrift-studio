import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Scene } from "three";

export type ScenePerformanceMetrics = {
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
  durationMs?: number;
  autoSave?: boolean;
};

export type SceneDebugCaptureResult = {
  requestId: number;
  action: SceneDebugCaptureRequest["action"];
  status: "ready" | "recording" | "saved" | "error";
  metrics?: ScenePerformanceMetrics;
  path?: string;
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

export function formatDebugNumber(value: number, digits = 0): string {
  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
