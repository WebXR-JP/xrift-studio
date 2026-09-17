import type { XriftColliderLoadRegistration, XriftColliderLoadState, XriftColliderLoadTracker } from "../../../packages/xrift-studio-runtime/src/mesh-collider-status";

export type SceneModelLoadTracker = XriftColliderLoadTracker & {
  /** A commit inside Physics/Suspense, not merely the outer Play button. */
  mountScene(): () => void;
  getPending(): number;
  getErrors(): readonly string[];
  subscribe(listener: () => void): () => void;
};

/** Each mounted resource owns its registration; late results cannot revive it. */
export function createSceneModelLoadTracker(
  { waitForSceneMount = false }: { waitForSceneMount?: boolean } = {},
): SceneModelLoadTracker {
  let mountedScenes = 0;
  const entries = new Map<symbol, XriftColliderLoadState>();
  const listeners = new Set<() => void>();
  let pending = 0;
  let errors: readonly string[] = [];
  const notify = () => {
    pending = 0;
    const nextErrors: string[] = [];
    for (const state of entries.values()) {
      if (state.status === "loading") pending += 1;
      if (state.status === "error") nextErrors.push(state.message);
    }
    if (nextErrors.length !== errors.length || nextErrors.some((message, i) => message !== errors[i])) {
      errors = nextErrors;
    }
    for (const listener of listeners) listener();
  };
  return {
    register(): XriftColliderLoadRegistration {
      const key = Symbol("scene-resource");
      entries.set(key, { status: "loading" });
      notify();
      return {
        update(state) {
          const previous = entries.get(key);
          if (!previous || (previous.status === state.status &&
              (previous.status !== "error" || state.status !== "error" || previous.message === state.message))) return;
          entries.set(key, state);
          notify();
        },
        dispose() {
          if (entries.delete(key)) notify();
        },
      };
    },
    mountScene() {
      mountedScenes += 1;
      notify();
      let mounted = true;
      return () => {
        if (!mounted) return;
        mounted = false;
        mountedScenes -= 1;
        notify();
      };
    },
    getPending: () => pending + (waitForSceneMount && mountedScenes === 0 ? 1 : 0),
    getErrors: () => errors,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const PLAY_SCENE_SETTLE_MS = 150;
export type SceneReadyScheduler = {
  schedule(callback: () => void, delay: number): () => void;
};
const DEFAULT_SCHEDULER: SceneReadyScheduler = {
  schedule(callback, delay) {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};

/** Wait for models AND committed physics shapes. Errors never count as ready. */
export function waitForSceneReady(
  tracker: SceneModelLoadTracker,
  onReady: () => void,
  scheduler: SceneReadyScheduler = DEFAULT_SCHEDULER,
): () => void {
  let active = true;
  let cancelTimer: (() => void) | undefined;
  let revision = 0;
  const check = () => {
    if (!active) return;
    const thisRevision = ++revision;
    cancelTimer?.();
    cancelTimer = undefined;
    if (tracker.getPending() !== 0 || tracker.getErrors().length !== 0) return;
    cancelTimer = scheduler.schedule(() => {
      if (!active || thisRevision !== revision || tracker.getPending() !== 0 || tracker.getErrors().length !== 0) return;
      active = false;
      onReady();
    }, PLAY_SCENE_SETTLE_MS);
  };
  const unsubscribe = tracker.subscribe(check);
  check();
  return () => {
    active = false;
    revision += 1;
    cancelTimer?.();
    unsubscribe();
  };
}
