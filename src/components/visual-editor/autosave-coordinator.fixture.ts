import {
  AUTOSAVE_SUPERSEDED,
  createSerializedAutosaveCoordinator,
} from "./autosave-coordinator";

/** Filesystem-free assertions for the visual editor autosave queue. */
export async function runAutosaveCoordinatorFixtureAssertions(): Promise<void> {
  const started: string[] = [];
  const completed: string[] = [];
  const releases: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;
  const coordinator = createSerializedAutosaveCoordinator(
    async (value: { id: string }) => {
      started.push(value.id);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      completed.push(value.id);
      return value.id;
    },
  );

  const first = { id: "first" };
  const firstRequest = coordinator.request(first);
  const duplicateRequest = coordinator.request(first);
  assert(firstRequest === duplicateRequest, "same snapshot was not deduplicated");
  await waitFor(() => started.length === 1);
  const skippedRequests = Array.from({ length: 100 }, (_, i) => coordinator.request({ id: `obsolete-${i}` }));
  const secondRequest = coordinator.request({ id: "second" });
  assert(started.join(",") === "first", "first save did not start first");
  releases.shift()?.();
  await waitFor(() => started.length === 2);
  assert(started.join(",") === "first,second", "second save did not wait for first");
  releases.shift()?.();
  await Promise.all([firstRequest, secondRequest]);
  assert((await Promise.all(skippedRequests)).every(result => result === AUTOSAVE_SUPERSEDED), "queued obsolete snapshots must skip disk writes");
  assert(maxActive === 1, "autosave writes ran concurrently");
  assert(completed.join(",") === "first,second", "autosave completion order changed");

  const attempts: string[] = [];
  const recovery = createSerializedAutosaveCoordinator(async (value: string) => {
    attempts.push(value);
    if (value === "failed") throw new Error("expected failure");
    return value;
  });
  const failed = recovery.request("failed");
  const recovered = recovery.request("recovered");
  assert(
    (await failed) === AUTOSAVE_SUPERSEDED,
    "superseded failed autosave did not resolve as superseded",
  );
  assert((await recovered) === "recovered", "newer autosave did not recover");
  assert(attempts.join(",") === "recovered", "an obsolete snapshot must be skipped before its first attempt");

  let retryAttempts = 0;
  const retrying = createSerializedAutosaveCoordinator(
    async (value: string) => {
      retryAttempts += 1;
      if (retryAttempts < 3) throw new Error("transient failure");
      return value;
    },
    {
      maxAttempts: 4,
      retryDelayMs: () => 0,
    },
  );
  assert(
    (await retrying.request("retried")) === "retried",
    "latest autosave did not recover after a transient failure",
  );
  assert(retryAttempts === 3, "autosave retry count changed");

  const supersededAttempts: string[] = [];
  const firstFailure = { reject: null as (() => void) | null };
  const superseding = createSerializedAutosaveCoordinator(
    async (value: string) => {
      supersededAttempts.push(value);
      if (value === "old") {
        await new Promise<void>((_, reject) => {
          firstFailure.reject = () => reject(new Error("superseded failure"));
        });
      }
      return value;
    },
    {
      maxAttempts: 4,
      retryDelayMs: () => 0,
    },
  );
  const superseded = superseding.request("old");
  await waitFor(() => firstFailure.reject !== null);
  const latest = superseding.request("latest");
  firstFailure.reject?.();
  assert(
    (await superseded) === AUTOSAVE_SUPERSEDED,
    "superseded save did not resolve as superseded",
  );
  assert((await latest) === "latest", "latest save did not run after superseding");
  assert(
    supersededAttempts.join(",") === "old,latest",
    "superseded snapshot was retried before the latest save",
  );
  await assertNewSnapshotInterruptsRetryDelay();
}

async function assertNewSnapshotInterruptsRetryDelay(): Promise<void> {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let waiting = false;
  let cleared = false;
  // A controllable timer proves wake-up without sleeping or timing thresholds.
  globalThis.setTimeout = (() => { waiting = true; return 1; }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = (() => { cleared = true; }) as typeof globalThis.clearTimeout;
  try {
    const started: string[] = [];
    const coordinator = createSerializedAutosaveCoordinator(async (value: string) => {
      started.push(value);
      if (value === "old") throw new Error("transient");
      return value;
    }, { maxAttempts: 3, retryDelayMs: () => 60000 });
    const old = coordinator.request("old");
    await waitFor(() => waiting);
    assert(coordinator.request("old") === old && !cleared, "duplicate requests must retain the same retry delay and promise");
    const latest = coordinator.request("latest");
    await waitFor(() => started.includes("latest"));
    assert(cleared, "superseding a delayed retry must clear its timer");
    assert(await old === AUTOSAVE_SUPERSEDED && await latest === "latest", "new snapshot must run immediately after superseding a retry delay");
    assert(started.join(",") === "old,latest", "the superseded snapshot must not retry");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

function nextMicrotask(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    if (condition()) return;
    await nextMicrotask();
  }
  throw new Error("Autosave fixture timed out");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Autosave fixture failed: ${message}`);
}
