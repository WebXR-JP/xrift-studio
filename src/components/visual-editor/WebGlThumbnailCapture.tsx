import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

export function WebGlThumbnailCapture({
  captureKey,
  ready,
  onCapture,
  onError,
}: {
  captureKey: string;
  ready: boolean;
  onCapture: (dataUrl: string) => void;
  onError?: (message: string) => void;
}) {
  const { camera, gl, invalidate, scene } = useThree();
  const capturedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || capturedKeyRef.current === captureKey) return;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    invalidate();
    firstFrame = window.requestAnimationFrame(() => {
      invalidate();
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/webp", 0.86);
          if (!dataUrl.startsWith("data:image/") || dataUrl.length < 100) {
            throw new Error("WebGL preview returned an empty image");
          }
          capturedKeyRef.current = captureKey;
          onCapture(dataUrl);
        } catch (error) {
          capturedKeyRef.current = captureKey;
          onError?.(
            error instanceof Error
              ? error.message
              : "Material preview could not be captured",
          );
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [camera, captureKey, gl, invalidate, onCapture, onError, ready, scene]);

  return null;
}
