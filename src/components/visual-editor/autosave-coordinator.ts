export type SerializedAutosaveCoordinator<Value, Result> = {
  request: (value: Value) => Promise<Result>;
  latestRequested: () => Value | null;
};

/**
 * Runs persistence writes one at a time and deduplicates repeated requests for
 * the same immutable document snapshot. A failed write never blocks a newer
 * snapshot from being attempted.
 */
export function createSerializedAutosaveCoordinator<Value, Result>(
  save: (value: Value) => Promise<Result>,
): SerializedAutosaveCoordinator<Value, Result> {
  let tail: Promise<void> = Promise.resolve();
  let latestValue: Value | null = null;
  let latestJob: { value: Value; promise: Promise<Result> } | null = null;

  return {
    request(value) {
      latestValue = value;
      if (latestJob?.value === value) return latestJob.promise;

      const promise = tail.then(() => save(value));
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
