import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { captureModelReviewView, captureWorldReviewView, modelReviewTarget, renderReviewFrame, worldReviewReady, type ModelReviewView, type WorldReviewView } from "./model-review-capture";
import { sceneReviewReadiness } from "./scene-review-readiness";

export type SceneScreenshotRequest = {
  /**
   * Identifies one capture. Must change to trigger a new one, so a parent that
   * re-renders while holding the same request does not capture repeatedly.
   */
  id: number;
  /** Capture a loaded Model from a temporary camera, leaving the Edit camera intact. */
  modelView?: ModelReviewView;
  worldView?: WorldReviewView;
  /** Receives the captured PNG as a data URL. */
  onCapture: (dataUrl: string) => void;
  /** Called instead of `onCapture` when the frame could not be read. */
  onError?: (message: string) => void;
};

type Props = {
  request: SceneScreenshotRequest | null;
  /** Fires after success or failure so the parent can clear its request. */
  onComplete?: () => void;
};

/**
 * Captures the Scene View exactly as rendered, from inside the R3F Canvas.
 *
 * Sits next to `SceneThumbnailCapture` and uses the same technique for the
 * same reason: reading the canvas is only reliable immediately after an
 * explicit render, because the renderer is configured on-demand and its
 * drawing buffer is not preserved between frames. Two `requestAnimationFrame`
 * hops let any state committed in this tick (selection outlines being hidden,
 * a material swap) reach the GPU before the read.
 *
 * Unlike the thumbnail capture, the delivery target travels on the request
 * rather than in props, so one viewport can serve callers that each want the
 * image for a different purpose.
 */
export function SceneScreenshotCapture({ request, onComplete }: Props) {
  const { camera, gl, invalidate, scene } = useThree();
  const capturedIdRef = useRef(0);

  // Keeping the latest request in a ref lets the effect depend only on the id.
  // Callers commonly pass inline closures, which would otherwise re-run the
  // effect — and re-capture — on every parent render.
  const requestRef = useRef(request);
  requestRef.current = request;
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const requestId = request?.id ?? 0;

  useEffect(() => {
    if (requestId <= 0 || capturedIdRef.current === requestId) return;

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const startedAt = performance.now();

    const schedule = () => {
      invalidate();
      firstFrame = window.requestAnimationFrame(() => {
        invalidate();
        secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const current = requestRef.current;
        const readiness = sceneReviewReadiness(scene);
        const target = current?.modelView ? modelReviewTarget(scene, current.modelView) : null;
        const waiting = current?.modelView && !target || current?.worldView && !worldReviewReady(scene);
        if (waiting && !readiness.error && performance.now() - startedAt < 12_000) { schedule(); return; }
        // Marked before the read so a failure cannot retry in a loop.
        capturedIdRef.current = requestId;
        try {
          if (current?.modelView || current?.worldView) {
            if (readiness.error) throw new Error(readiness.error);
          }
          if (current?.modelView && !target) throw new Error("制作したモデルの読み込みが終わらず、見た目を確認できませんでした");
          if (current?.worldView && waiting) throw new Error("ワールドの素材の読み込みが終わらず、見た目を確認できませんでした");
          let dataUrl: string;
          try {
            if (current?.modelView && target) dataUrl = captureModelReviewView(gl, scene, target, current.modelView);
            else if (current?.worldView) dataUrl = captureWorldReviewView(gl, scene, current.worldView);
            else { gl.render(scene, camera); dataUrl = gl.domElement.toDataURL("image/png"); }
          } finally {
            // Restore the visible frame before yielding, including on failure.
            if (current?.modelView || current?.worldView) renderReviewFrame(gl, scene, camera);
          }
          if (!dataUrl.startsWith("data:image/") || dataUrl.length < 100) {
            throw new Error("シーンから画像を取得できませんでした");
          }
          current?.onCapture(dataUrl);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "シーンから画像を取得できませんでした";
          current?.onError?.(message);
        } finally {
          completeRef.current?.();
        }
        });
      });
    };
    schedule();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [camera, gl, invalidate, requestId, scene]);

  return null;
}
