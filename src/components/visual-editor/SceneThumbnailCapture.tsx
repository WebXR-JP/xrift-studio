import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

type Props = {
  requestId: number;
  ready: boolean;
  onCapture: (dataUrl: string) => void;
  onError: (message: string) => void;
};

/**
 * Captures the same rendered Scene View that the author is looking at.
 * Keeping this inside the R3F Canvas means thumbnails use the real scene
 * renderer, including project models, materials, lights, and skybox assets.
 */
export function SceneThumbnailCapture({
  requestId,
  ready,
  onCapture,
  onError,
}: Props) {
  const { camera, gl, invalidate, scene } = useThree();
  const capturedRequestRef = useRef(0);

  useEffect(() => {
    if (!ready || requestId <= 0 || capturedRequestRef.current === requestId) {
      return;
    }

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    invalidate();
    firstFrame = window.requestAnimationFrame(() => {
      invalidate();
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        capturedRequestRef.current = requestId;
        try {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/png");
          if (!dataUrl.startsWith("data:image/") || dataUrl.length < 100) {
            throw new Error("Scene Viewから画像を取得できませんでした");
          }
          onCapture(dataUrl);
        } catch (error) {
          onError(
            error instanceof Error
              ? error.message
              : "Scene Viewから画像を取得できませんでした",
          );
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [camera, gl, invalidate, onCapture, onError, ready, requestId, scene]);

  return null;
}
