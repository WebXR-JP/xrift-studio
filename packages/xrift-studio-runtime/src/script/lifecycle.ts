import type {
  ScriptLifecycle,
  ScriptLifecycleCallback,
} from "./api.js";

export type OwnedScriptLifecycle = ScriptLifecycle & {
  dispose(): void;
};

/**
 * Owns asynchronous work for one Script instance.
 *
 * This stays separate from the React host so timer and disposal behavior can
 * be verified without mounting a renderer. The host supplies an error
 * callback already bound to the owning Entity, Component, and Script.
 */
export function createScriptLifecycle(
  isActive: () => boolean,
  onError: (error: unknown) => void,
): OwnedScriptLifecycle {
  const controller = new AbortController();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const disposeCallbacks = new Set<ScriptLifecycleCallback>();
  let disposed = false;

  const normalizeDelay = (milliseconds: number): number =>
    Number.isFinite(milliseconds)
      ? Math.max(0, Math.min(2_147_483_647, milliseconds))
      : 0;

  const reportError = (error: unknown): void => {
    try {
      onError(error);
    } catch {
      // A reporting consumer must not create another unhandled rejection.
    }
  };

  const invoke = (callback: ScriptLifecycleCallback): void => {
    try {
      const result = callback();
      if (result && typeof result.then === "function") {
        void Promise.resolve(result).then(undefined, reportError);
      }
    } catch (error) {
      reportError(error);
    }
  };

  return {
    signal: controller.signal,
    onDispose(callback) {
      if (disposed || !isActive()) return () => {};
      disposeCallbacks.add(callback);
      return () => {
        disposeCallbacks.delete(callback);
      };
    },
    timeout(callback, milliseconds) {
      if (disposed || !isActive()) return () => {};
      const handle = setTimeout(() => {
        timeouts.delete(handle);
        if (disposed || !isActive()) return;
        invoke(callback);
      }, normalizeDelay(milliseconds));
      timeouts.add(handle);
      return () => {
        if (!timeouts.delete(handle)) return;
        clearTimeout(handle);
      };
    },
    interval(callback, milliseconds) {
      if (disposed || !isActive()) return () => {};
      const handle = setInterval(() => {
        if (disposed || !isActive()) return;
        invoke(callback);
      }, normalizeDelay(milliseconds));
      intervals.add(handle);
      return () => {
        if (!intervals.delete(handle)) return;
        clearInterval(handle);
      };
    },
    async task<T>(run: (signal: AbortSignal) => Promise<T>) {
      if (disposed || !isActive()) return undefined;
      try {
        const value = await run(controller.signal);
        return disposed || controller.signal.aborted || !isActive()
          ? undefined
          : value;
      } catch (error) {
        if (!disposed && !controller.signal.aborted && isActive()) {
          reportError(error);
        }
        return undefined;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const handle of timeouts) clearTimeout(handle);
      for (const handle of intervals) clearInterval(handle);
      timeouts.clear();
      intervals.clear();
      for (const callback of [...disposeCallbacks].reverse()) {
        invoke(callback);
      }
      disposeCallbacks.clear();
    },
  };
}
