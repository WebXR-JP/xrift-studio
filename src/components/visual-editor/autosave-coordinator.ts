export type SerializedAutosaveCoordinator<Value, Result> = {
  request: (value: Value) => Promise<Result>;
  latestRequested: () => Value | null;
};

export type SerializedAutosaveCoordinatorOptions<Value> = {
  maxAttempts?: number;
  retryDelayMs?: (
    failedAttempt: number,
    error: unknown,
    value: Value,
  ) => number;
};

/**
 * Runs persistence writes one at a time and deduplicates repeated requests for
 * the same immutable document snapshot. The latest snapshot may retry transient
 * failures, while a superseded snapshot yields immediately to the newer write.
 */
export function createSerializedAutosaveCoordinator<Value, Result>(
  save: (value: Value) => Promise<Result>,
  options: SerializedAutosaveCoordinatorOptions<Value> = {},
): SerializedAutosaveCoordinator<Value, Result> {
  let tail: Promise<void> = Promise.resolve();
  let latestValue: Value | null = null;
  let latestJob: { value: Value; promise: Promise<Result> } | null = null;
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 1));

  const saveWithRetry = async (value: Value): Promise<Result> => {
    let attempt = 1;
    while (true) {
      try {
        return await save(value);
      } catch (error) {
        if (attempt >= maxAttempts || latestValue !== value) throw error;
        const delayMs = Math.max(
          0,
          options.retryDelayMs?.(attempt, error, value) ?? 0,
        );
        if (delayMs > 0) {
          await new Promise<void>((resolve) =>
            globalThis.setTimeout(resolve, delayMs),
          );
        }
        if (latestValue !== value) throw error;
        attempt += 1;
      }
    }
  };

  return {
    request(value) {
      latestValue = value;
      if (latestJob?.value === value) return latestJob.promise;

      const promise = tail.then(() => saveWithRetry(value));
      tail = promise.then(
        () => undefined,
        () => undefined,
      );
      const job = { value, promise };
      latestJob = job;
      void promise.then(
        () => {
          if (latestJob === job) latestJob = null;
        },
        () => {
          if (latestJob === job) latestJob = null;
        },
      );
      return promise;
    },
    latestRequested() {
      return latestValue;
    },
  };
}
