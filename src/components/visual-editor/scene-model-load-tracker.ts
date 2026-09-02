import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ProjectModelLoadState } from "./ProjectModelVisual";

/**
 * Counts the Scene's models that are still being read from disk.
 *
 * Play needs it because a model arrives asynchronously and its Collider arrives
 * with it. Mounting the player first drops the capsule into a world that has no
 * floor yet: gravity pulls it down, the ground appears around it, and the
 * player starts the session buried. Waiting for the count to reach zero is what
 * makes Play start on the floor the author sees.
 *
 * It counts loads rather than measuring bytes because a load that fails still
 * settles - a broken Asset must not hold the player hostage - and because the
 * same count answers "is the Scene finished drawing" without knowing anything
 * about what any one Entity contains.
 */
export type SceneModelLoadTracker = {
  /**
   * Marks one model as loading. The returned function settles it, and is safe
   * to call twice: a model that errors and then unmounts settles once.
   */
  begin(): () => void;
  /** Models still loading. Zero means every mounted model has settled. */
  getPending(): number;
  subscribe(listener: () => void): () => void;
};

export function createSceneModelLoadTracker(): SceneModelLoadTracker {
  let pending = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    begin() {
      pending += 1;
      notify();
      let settled = false;
      return () => {
        if (settled) return;
        settled = true;
        pending -= 1;
        notify();
      };
    },
    getPending: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The Scene View's tracker, provided inside the Canvas.
 *
 * `null` outside it, so the same model component used for a thumbnail or an
 * Asset preview reports to nobody instead of holding up a Play session in
 * another part of the app.
 */
export const SceneModelLoadTrackerContext =
  createContext<SceneModelLoadTracker | null>(null);

/**
 * Reports one model's load state to the Scene's tracker.
 *
 * The returned callback keeps the same identity for the life of the component,
 * so passing it to a memoised model visual does not defeat the memo.
 */
export function useSceneModelLoadReport(): (
  state: ProjectModelLoadState,
) => void {
  const tracker = useContext(SceneModelLoadTrackerContext);
  const settleRef = useRef<(() => void) | null>(null);

  // A model unmounted mid-load - the Entity was deleted, or it fell outside its
  // render distance - must not leave the Scene permanently "loading".
  useEffect(
    () => () => {
      settleRef.current?.();
      settleRef.current = null;
    },
    [],
  );

  return useCallback(
    (state: ProjectModelLoadState) => {
      if (!tracker) return;
      if (state.status === "loading") {
        settleRef.current ??= tracker.begin();
        return;
      }
      settleRef.current?.();
      settleRef.current = null;
    },
    [tracker],
  );
}

/**
 * How long the Scene has to stay settled before Play accepts it as loaded.
 *
 * Entering Play remounts the Scene, so the models register a frame or two after
 * the mode changes and the count is briefly, misleadingly, zero. Requiring the
 * quiet to hold covers that gap and the gap between two models, and is short
 * enough to be invisible next to reading a model off disk.
 */
const PLAY_SCENE_SETTLE_MS = 150;

/**
 * How long Play waits before starting anyway.
 *
 * A model that never settles - a hung read, an Asset the loader cannot finish -
 * must not leave the author looking at a Play session that never begins. After
 * this the player spawns and the Scene finishes loading around them, which is
 * the old behaviour and still better than nothing happening at all.
 */
const PLAY_SCENE_WAIT_TIMEOUT_MS = 15_000;

/**
 * Whether Play may put the player into the Scene yet.
 *
 * False from the moment Play starts until every model mounted in the Scene has
 * settled - loaded or failed - and stayed settled. It latches true for the rest
 * of the session: a model that streams in later (an Entity outside its render
 * distance coming into range) must not take the running player back out of the
 * world.
 */
export function useWorldPlaySceneReady(
  tracker: SceneModelLoadTracker,
  playActive: boolean,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!playActive) {
      setReady(false);
      return;
    }
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = () => {
      done = true;
      setReady(true);
    };
    const check = () => {
      if (done) return;
      if (tracker.getPending() > 0) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
        return;
      }
      if (settleTimer !== undefined) return;
      settleTimer = setTimeout(finish, PLAY_SCENE_SETTLE_MS);
    };
    const unsubscribe = tracker.subscribe(check);
    check();
    const timeout = setTimeout(finish, PLAY_SCENE_WAIT_TIMEOUT_MS);
    return () => {
      unsubscribe();
      clearTimeout(settleTimer);
      clearTimeout(timeout);
    };
  }, [playActive, tracker]);

  return ready;
}
