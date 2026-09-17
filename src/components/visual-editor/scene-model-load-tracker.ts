import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { XriftColliderLoadRegistration, XriftColliderLoadState } from "../../../packages/xrift-studio-runtime/src/mesh-collider-status";
import { waitForSceneReady, type SceneModelLoadTracker } from "./scene-load-state";
export { createSceneModelLoadTracker, type SceneModelLoadTracker } from "./scene-load-state";

/** Provided inside the Canvas, whose renderer has its own React root. */
export const SceneModelLoadTrackerContext = createContext<SceneModelLoadTracker | null>(null);

/** Mounted after the entities, inside the same Physics/Suspense boundary. */
export function SceneModelLoadCommit({ tracker }: { tracker: SceneModelLoadTracker }) {
  useLayoutEffect(() => tracker.mountScene(), [tracker]);
  return null;
}

/** Report failures as failures, and keep them until retry or unmount. */
export function useSceneModelLoadReport(initialState: XriftColliderLoadState = { status: "ready" }): (state: XriftColliderLoadState) => void {
  const tracker = useContext(SceneModelLoadTrackerContext);
  const registration = useRef<XriftColliderLoadRegistration | null>(null);
  const stateRef = useRef<XriftColliderLoadState>(initialState);
  useLayoutEffect(() => {
    const resource = tracker?.register() ?? null;
    registration.current = resource;
    resource?.update(stateRef.current);
    return () => {
      resource?.dispose();
      if (registration.current === resource) registration.current = null;
    };
  }, [tracker]);
  return useCallback((state: XriftColliderLoadState) => {
    stateRef.current = state;
    registration.current?.update(state);
  }, []);
}

export function useSceneModelLoadErrors(tracker: SceneModelLoadTracker): readonly string[] {
  return useSyncExternalStore(tracker.subscribe, tracker.getErrors, tracker.getErrors);
}

/** Initial start gate only; later streaming does not respawn an active player. */
export function useWorldPlaySceneReady(tracker: SceneModelLoadTracker, playActive: boolean): boolean {
  const [readyTracker, setReadyTracker] = useState<SceneModelLoadTracker | null>(null);
  useEffect(() => {
    if (!playActive) {
      setReadyTracker(null);
      return;
    }
    return waitForSceneReady(tracker, () => setReadyTracker(tracker));
  }, [playActive, tracker]);
  return playActive && readyTracker === tracker;
}
