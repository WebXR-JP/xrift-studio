import type { Object3D } from "three";

/** Match the official Mirror default without counting recursive renderer passes. */
export function installMirrorReflectionInterval(
  reflector: Pick<Object3D, "onBeforeRender">,
  reflectionInterval = 2,
): () => void {
  const interval = Math.max(1, Math.floor(reflectionInterval));
  let frame = 0;
  const originalOnBeforeRender = reflector.onBeforeRender.bind(reflector);
  reflector.onBeforeRender = (...args) => {
    if (frame % interval !== 0) return;
    originalOnBeforeRender(...args);
  };
  // Call exactly once from useFrame. Both XR eyes share this decision, and a
  // nested Reflector render must not advance the counter between the eyes.
  return () => {
    frame += 1;
  };
}
