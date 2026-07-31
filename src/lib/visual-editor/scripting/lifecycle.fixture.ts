import { createScriptLifecycle } from "../../../../packages/xrift-studio-runtime/src/script/lifecycle";
import {
  invokeScriptEventHandler,
  type ScriptFailure,
} from "../../../../packages/xrift-studio-runtime/src/script/host";

/** Async ownership assertions for lifecycle callbacks shared by Play/publish. */
export async function runScriptLifecycleFixtureAssertions(): Promise<void> {
  const failures: ScriptFailure[] = [];
  const recordFailure = (error: unknown) => {
    failures.push({
      entityId: "entity-lifecycle-fixture",
      componentId: "component-lifecycle-fixture",
      scriptName: "Lifecycle Fixture",
      phase: "async",
      message: error instanceof Error ? error.message : String(error),
      stopped: true,
    });
  };

  const timeoutLifecycle = createScriptLifecycle(() => true, recordFailure);
  timeoutLifecycle.timeout(async () => {
    await Promise.resolve();
    throw new Error("timeout rejected");
  }, 0);
  await flushTimers();
  timeoutLifecycle.dispose();

  const intervalLifecycle = createScriptLifecycle(() => true, recordFailure);
  let cancelInterval = () => {};
  cancelInterval = intervalLifecycle.interval(async () => {
    cancelInterval();
    await Promise.resolve();
    throw new Error("interval rejected");
  }, 0);
  await flushTimers();
  intervalLifecycle.dispose();

  const disposeLifecycle = createScriptLifecycle(() => true, recordFailure);
  disposeLifecycle.onDispose(async () => {
    await Promise.resolve();
    throw new Error("dispose rejected");
  });
  disposeLifecycle.dispose();
  await Promise.resolve();
  await Promise.resolve();

  const taskLifecycle = createScriptLifecycle(() => true, recordFailure);
  await taskLifecycle.task(async () => {
    throw new Error("task rejected");
  });
  taskLifecycle.dispose();

  let healthyEventCalls = 0;
  invokeScriptEventHandler(
    async () => {
      await Promise.resolve();
      throw new Error("event rejected");
    },
    { source: "fixture" },
    (error) => {
      failures.push({
        entityId: "entity-event-fixture",
        componentId: "component-event-fixture",
        scriptName: "Event Fixture",
        phase: "event",
        message: error instanceof Error ? error.message : String(error),
        stopped: true,
      });
    },
  );
  invokeScriptEventHandler(
    async () => {
      await Promise.resolve();
      healthyEventCalls += 1;
    },
    { source: "fixture" },
    () => {
      throw new Error("healthy event handler unexpectedly failed");
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  for (const message of [
    "timeout rejected",
    "interval rejected",
    "dispose rejected",
    "task rejected",
  ]) {
    const failure = failures.find((candidate) => candidate.message === message);
    assert(Boolean(failure), `${message} was not reported`);
    assert(
      failure?.entityId === "entity-lifecycle-fixture" &&
        failure.componentId === "component-lifecycle-fixture" &&
        failure.scriptName === "Lifecycle Fixture" &&
        failure.phase === "async" &&
        failure.stopped,
      `${message} lost its owning Script identity`,
    );
  }

  const eventFailure = failures.find(
    (candidate) => candidate.message === "event rejected",
  );
  assert(Boolean(eventFailure), "async event rejection was not reported");
  assert(
    eventFailure?.entityId === "entity-event-fixture" &&
      eventFailure.componentId === "component-event-fixture" &&
      eventFailure.scriptName === "Event Fixture" &&
      eventFailure.phase === "event" &&
      eventFailure.stopped,
    "async event rejection lost its owning Script identity or stop state",
  );
  assert(
    healthyEventCalls === 1,
    "one Script event rejection blocked another Script listener",
  );
}

async function flushTimers(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
  await Promise.resolve();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script lifecycle fixture failed: ${message}`);
  }
}
