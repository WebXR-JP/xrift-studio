import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

export type SceneScreenshotRequest = {
  /**
   * Identifies one capture. Must change to trigger a new one, so a parent that
   * re-renders while holding the same request does not capture repeatedly.
   */
  id: number;
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

    invalidate();
    firstFrame = window.requestAnimationFrame(() => {
      invalidate();
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        // Marked before the read so a failure cannot retry in a loop.
        capturedIdRef.current = requestId;
        const current = requestRef.current;
        try {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/png");
          if (!dataUrl.startsWith("data:image/") || dataUrl.length < 100) {
            throw new Error("Scene Viewから画像を取得できませんでした");
          }
          current?.onCapture(dataUrl);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Scene Viewから画像を取得できませんでした";
          current?.onError?.(message);
        } finally {
          completeRef.current?.();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [camera, gl, invalidate, requestId, scene]);

  return null;
}
