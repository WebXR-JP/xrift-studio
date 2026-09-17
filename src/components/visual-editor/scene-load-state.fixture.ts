import { createSceneModelLoadTracker, waitForSceneReady, PLAY_SCENE_SETTLE_MS, type SceneReadyScheduler } from "./scene-load-state";

/** Deterministic lifecycle tests. The clock is fake; no renderer is simulated. */
export function runSceneLoadStateFixtureAssertions() {
  let assertions = 0;
  const assert = (condition: unknown, message: string) => {
    assertions += 1;
    if (!condition) throw new Error(`Play readiness: ${message}`);
  };
  function clock() {
    let now = 0;
    const timers: Array<{ at: number; callback(): void; cancelled: boolean; ran: boolean }> = [];
    const scheduler: SceneReadyScheduler = {
      schedule(callback, delay) {
        const timer = { at: now + delay, callback, cancelled: false, ran: false };
        timers.push(timer);
        return () => { timer.cancelled = true; };
      },
    };
    return {
      scheduler,
      advance(ms: number) {
        now += ms;
        for (const timer of [...timers]) {
          if (!timer.cancelled && !timer.ran && timer.at <= now) {
            timer.ran = true;
            timer.callback();
          }
        }
      },
      // Deliberately invoke cancelled callbacks to exercise stale-task guards.
      flushStale() { for (const timer of timers) timer.callback(); },
    };
  }
  const tracker = createSceneModelLoadTracker({ waitForSceneMount: true });
  const time = clock();
  let starts = 0;
  const stop = waitForSceneReady(tracker, () => { starts += 1; }, time.scheduler);
  assert(tracker.getPending() === 1, "Physics/Suspense not mounted is pending, not an empty loaded scene");
  time.advance(30_000);
  assert(starts === 0, "a slow WASM import cannot trigger the old 150ms/15s early start");
  const unmountScene = tracker.mountScene();
  const model = tracker.register();
  const mesh = tracker.register();
  assert(tracker.getPending() === 2, "model and collider have distinct pending registrations");
  model.update({ status: "ready" });
  time.advance(500);
  assert(starts === 0 && tracker.getPending() === 1, "download complete does not mean a collider exists");
  mesh.update({ status: "ready" });
  time.advance(PLAY_SCENE_SETTLE_MS - 1);
  assert(starts === 0, "quiet time covers effects and queued shape refreshes");
  mesh.update({ status: "loading" });
  time.advance(1_000);
  assert(starts === 0, "a queued shape replacement cancels the previous readiness timer");
  mesh.update({ status: "ready" });
  time.advance(PLAY_SCENE_SETTLE_MS);
  assert(starts === 1, "start only after the committed generation is ready");
  mesh.update({ status: "loading" });
  mesh.update({ status: "ready" });
  time.advance(500);
  assert(starts === 1, "later streaming does not respawn the active player");
  stop(); stop(); unmountScene(); unmountScene();
  assert(tracker.getPending() === 1, "scene cleanup is idempotent and restores the mount barrier");
  time.flushStale();
  assert(starts === 1, "callbacks from a stopped session cannot start a player");

  const failed = createSceneModelLoadTracker();
  const failedClock = clock();
  let recovered = 0;
  const asset = failed.register();
  const cancelFailure = waitForSceneReady(failed, () => { recovered += 1; }, failedClock.scheduler);
  asset.update({ status: "error", message: "floor.glb failed" });
  assert(failed.getPending() === 0, "a failed request is no longer loading");
  assert(failed.getErrors()[0] === "floor.glb failed", "error state is retained instead of being treated as success");
  failedClock.advance(60_000);
  assert(recovered === 0, "model or geometry failures never release the player");
  const errors = failed.getErrors();
  asset.update({ status: "error", message: "floor.glb failed" });
  assert(errors === failed.getErrors(), "unchanged error snapshots retain identity for React subscriptions");
  asset.update({ status: "loading" });
  assert(failed.getErrors().length === 0 && failed.getPending() === 1, "retry clears the previous error but remains blocked");
  asset.update({ status: "ready" });
  failedClock.advance(PLAY_SCENE_SETTLE_MS);
  assert(recovered === 1, "successful retry can finish the same startup");
  cancelFailure(); asset.dispose(); asset.dispose();
  asset.update({ status: "loading" });
  asset.update({ status: "error", message: "late result" });
  assert(failed.getPending() === 0 && failed.getErrors().length === 0, "unmounted resources ignore late callbacks");

  const deleted = createSceneModelLoadTracker();
  const deletedClock = clock();
  let deletionStarts = 0;
  const broken = deleted.register();
  broken.update({ status: "error", message: "missing mesh" });
  const cancelDeletion = waitForSceneReady(deleted, () => { deletionStarts += 1; }, deletedClock.scheduler);
  broken.dispose();
  deletedClock.advance(PLAY_SCENE_SETTLE_MS);
  assert(deletionStarts === 1, "removing a broken entity removes its startup error");
  cancelDeletion();

  const cancelled = createSceneModelLoadTracker();
  const cancelledClock = clock();
  let cancelledStarts = 0;
  const cancel = waitForSceneReady(cancelled, () => { cancelledStarts += 1; }, cancelledClock.scheduler);
  cancel();
  cancelledClock.advance(10_000); cancelledClock.flushStale();
  assert(cancelledStarts === 0, "Stop invalidates an already queued settle callback");

  const strict = createSceneModelLoadTracker({ waitForSceneMount: true });
  const unmountFirst = strict.mountScene();
  const first = strict.register();
  first.update({ status: "ready" });
  first.dispose(); unmountFirst();
  assert(strict.getPending() === 1, "StrictMode cleanup restores pending mount state");
  const unmountSecond = strict.mountScene();
  const second = strict.register();
  first.update({ status: "error", message: "obsolete first mount" });
  assert(strict.getPending() === 1 && strict.getErrors().length === 0, "StrictMode remount is not contaminated by the first resource");
  second.update({ status: "ready" });
  assert(strict.getPending() === 0, "second mount can settle normally");
  second.dispose(); unmountSecond();

  const replacement = createSceneModelLoadTracker({ waitForSceneMount: true });
  assert(replacement !== tracker && replacement.getPending() === 1, "each Play session starts with a fresh not-ready tracker");
  const unsubscribed = createSceneModelLoadTracker();
  let notifications = 0;
  const unsubscribe = unsubscribed.subscribe(() => { notifications += 1; });
  const resource = unsubscribed.register();
  assert(notifications === 1, "register notifies subscribers");
  resource.update({ status: "loading" });
  assert(notifications === 1, "duplicate state does not restart timers");
  resource.update({ status: "ready" });
  assert(notifications === 2, "ready notifies subscribers");
  unsubscribe(); resource.dispose();
  assert(notifications === 2, "unsubscribed listeners are not retained");
  return { assertions };
}
