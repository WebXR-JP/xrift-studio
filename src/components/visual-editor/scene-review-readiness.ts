import { useCallback, useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Scene } from "three";

export type SceneReviewLoadState = { status: "loading" | "ready" | "error"; message?: string };
const resources = new WeakMap<Scene, Map<symbol, SceneReviewLoadState>>();

/** Review-only registrations: loading never blocks the normal viewport or Play. */
export function registerSceneReviewResource(scene: Scene, initial: SceneReviewLoadState) {
  let entries = resources.get(scene);
  if (!entries) { entries = new Map(); resources.set(scene, entries); }
  const token = Symbol();
  entries.set(token, initial);
  return {
    update(state: SceneReviewLoadState) { if (entries.has(token)) entries.set(token, state); },
    dispose() { entries.delete(token); },
  };
}

export function sceneReviewReadiness(scene: Scene): { ready: boolean; error?: string } {
  let ready = true;
  for (const state of resources.get(scene)?.values() ?? []) {
    if (state.status === "error") return { ready: false, error: state.message || "シーンの素材を読み込めず、見た目を確認できませんでした" };
    if (state.status !== "ready") ready = false;
  }
  return { ready };
}

/** A changed identity starts pending before capture's next animation frame.
 * Updates belonging to an old asset/hash cannot complete the new registration. */
export function useSceneReviewResource(key: string, initial: SceneReviewLoadState) {
  const scene = useThree(state => state.scene);
  const current = useRef<{ key: string; scene: Scene; registration: ReturnType<typeof registerSceneReviewResource> } | null>(null);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useLayoutEffect(() => {
    const registration = registerSceneReviewResource(scene, initialRef.current);
    current.current = { key, scene, registration };
    return () => {
      registration.dispose();
      if (current.current?.registration === registration) current.current = null;
    };
  }, [key, scene]);
  return useCallback((state: SceneReviewLoadState) => {
    if (current.current?.key === key && current.current.scene === scene) current.current.registration.update(state);
  }, [key, scene]);
}
