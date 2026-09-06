/**
 * React 19.2's DEV Performance Tracks enumerate props (including Three typed
 * arrays), then structured-clone them into performance.measure(). Large models
 * can exhaust memory before the first frame. Disable the optional timestamp
 * capability BEFORE React/R3F module evaluation so they skip serialization too.
 * This only disables DevTools timeline tracks in development; React warnings,
 * the Profiler, performance.mark/measure and Studio metrics remain available.
 * Remove when both React DOM and R3F's bundled reconciler bound serialization.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.defineProperty(console, "timeStamp", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}
