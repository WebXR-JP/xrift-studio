import { createSerializedAutosaveCoordinator } from "./autosave-coordinator";

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
  const secondRequest = coordinator.request({ id: "second" });
  assert(firstRequest === duplicateRequest, "same snapshot was not deduplicated");
  await waitFor(() => started.length === 1);
  assert(started.join(",") === "first", "first save did not start first");
  releases.shift()?.();
  await waitFor(() => started.length === 2);
  assert(started.join(",") === "first,second", "second save did not wait for first");
  releases.shift()?.();
  await Promise.all([firstRequest, secondRequest]);
  assert(maxActive === 1, "autosave writes ran concurrently");
  assert(completed.join(",") === "first,second", "autosave completion order changed");

  const attempts: string[] = [];
  const recovery = createSerializedAutosaveCoordinator(async (value: string) => {
    attempts.push(value);
    if (value === "failed") throw new Error("expected failure");
    return value;
  });
  const failed = recovery.request("failed").catch(() => "rejected");
  const recovered = recovery.request("recovered");
  assert((await failed) === "rejected", "failed autosave did not reject");
  assert((await recovered) === "recovered", "newer autosave did not recover");
  assert(attempts.join(",") === "failed,recovered", "recovery order changed");
}

function nextMicrotask(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await nextMicrotask();
  }
  throw new Error("Autosave fixture timed out");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Autosave fixture failed: ${message}`);
}
