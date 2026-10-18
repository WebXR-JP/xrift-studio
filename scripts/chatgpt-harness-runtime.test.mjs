import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-harness-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { createChatgptHarnessRun, normalizeChatgptHarnessSnapshot, interruptChatgptHarnessSnapshot } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-harness-runtime.ts");
const { normalizeAuthoringProgress, observeAuthoringProgress, AUTHORING_PROGRESS_HISTORY_LIMIT } = await server.ssrLoadModule("/src/lib/visual-editor/authoring-progress.ts");
const runs = new Set();
const run = (options = {}) => { const result = createChatgptHarnessRun({ runId: "generation-1", ...options }); runs.add(result); return result; };
const deferred = () => { let resolve; const promise = new Promise(accept => { resolve = accept; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const code = expected => error => error?.code === expected;
test.afterEach(async () => { await Promise.all([...runs].map(item => item.stop())); runs.clear(); });
test.after(() => server.close());

test("a saved run completes only against its exact latest Scene and visual evidence", () => {
  const current = run(); current.beginPass();
  assert.throws(() => current.finish({ fingerprint: "a" }), code("unsaved"));
  current.recordCommit("a");
  assert.throws(() => current.recordSaved("other"), code("unsaved"));
  current.recordSaved("a"); current.recordInspection({ fingerprint: "a", approved: true, views: 1 });
  assert.throws(() => current.finish({ fingerprint: "a", requireInspection: true }), code("inspection-required"));
  current.recordInspection({ fingerprint: "a", approved: true, views: 2, evidence: "camera-front-camera-overview" });
  current.recordCommit("b");
  assert.equal(current.snapshot().inspection, undefined, "any later mutation invalidates the earlier inspection");
  assert.throws(() => current.finish({ fingerprint: "b", requireInspection: true }), code("unsaved"));
  current.recordSaved("b");
  assert.throws(() => current.recordInspection({ fingerprint: "a", approved: true, views: 2 }), code("inspection-required"));
  current.recordInspection({ fingerprint: "b", approved: false, views: 2 });
  assert.throws(() => current.finish({ fingerprint: "b", requireInspection: true }), code("inspection-required"));
  current.recordInspection({ fingerprint: "b", approved: true, views: 2 });
  assert.equal(current.finish({ fingerprint: "b", requireInspection: true, hasMore: true }), false);
  assert.equal(current.snapshot().phase, "running", "remaining work never becomes completed");
  assert.equal(current.finish({ fingerprint: "b", requireInspection: true }), true);
  assert.equal(current.snapshot().phase, "completed");
  assert.throws(() => current.recordCommit("c"), code("terminal"));
});

test("all request budgets survive passes and exact-run restoration", async () => {
  const current = run({ limits: { maxPasses: 3, maxRepairs: 1, maxModelCalls: 2, maxWrites: 2 } });
  current.beginPass();
  await current.step("model", "構成を考えます", async () => "first", { modelCalls: 1 });
  current.recordCommit("a"); current.recordSaved("a"); current.pause();
  const saved = current.snapshot();
  assert.throws(() => createChatgptHarnessRun({ runId: "other", snapshot: saved }), code("invalid-input"));
  const restored = run({ snapshot: saved });
  assert.equal(restored.snapshot().phase, "paused");
  restored.beginPass("repair");
  await restored.step("plan", "構成を修正します", async () => "second", { modelCalls: 1 });
  restored.recordCommit("b"); restored.recordSaved("b");
  const counters = restored.snapshot().counters;
  assert.deepEqual(counters, { passes: 2, repairs: 1, modelCalls: 2, writes: 2, attempts: 2, activeMs: counters.activeMs });
  let bodyCalled = false;
  await assert.rejects(restored.step("plan", "追加で考えます", async () => { bodyCalled = true; }, { modelCalls: 1 }), code("budget-model-calls"));
  assert.equal(bodyCalled, false);
  await restored.stop(); assert.equal(restored.snapshot().phase, "failed");
  const repairs = run({ runId: "repairs", limits: { maxRepairs: 0 } });
  assert.throws(() => repairs.beginPass("repair"), code("budget-repairs"));
  const passes = run({ runId: "passes", limits: { maxPasses: 1 } });
  passes.beginPass(); assert.throws(() => passes.beginPass("continue"), code("budget-passes"));
  const writes = run({ runId: "writes", limits: { maxWrites: 1 } });
  writes.beginPass(); writes.recordCommit("a"); assert.throws(() => writes.recordCommit("b"), code("budget-writes"));
  assert.equal(writes.snapshot().committedFingerprint, "a", "a rejected commit never becomes an admitted fact");
});

test("questions and plan pauses exclude waiting time without resetting active time", async () => {
  let time = 1_000;
  const current = run({ now: () => time, limits: { maxActiveMs: 500 } });
  current.beginPass(); time += 100; current.pause();
  assert.equal(current.snapshot().counters.activeMs, 100);
  time += 100_000; current.pause();
  assert.equal(current.snapshot().counters.activeMs, 100);
  current.beginPass("continue"); time += 100;
  assert.equal(current.snapshot().counters.activeMs, 200);
  time += 301;
  assert.throws(() => current.check(), code("deadline"));
  await current.stop();
  assert.equal(current.snapshot().counters.passes, 2);
  assert.equal(current.snapshot().phase, "failed");
});

test("step timeout requests cancellation, drains its body, and refuses its late success", async () => {
  const started = deferred(); const released = deferred(); const aborted = deferred();
  let signal; let aborts = 0;
  const current = run({ limits: { maxStepMs: 15 }, onAbort: reason => { aborts++; assert.equal(reason, "step-deadline"); aborted.resolve(); } });
  current.beginPass();
  const task = current.step("model", "形を作ります", async ownedSignal => { signal = ownedSignal; started.resolve(); await released.promise; return "late success"; }, { modelCalls: 1 });
  const rejection = assert.rejects(task, code("step-deadline"));
  await started.promise; await aborted.promise;
  assert.equal(signal.aborted, true);
  assert.equal(current.snapshot().phase, "stopping");
  released.resolve(); await rejection; await current.stop();
  assert.equal(current.snapshot().phase, "failed"); assert.equal(aborts, 1);
  assert.equal(current.snapshot().events.filter(event => event.phase === "model" && event.outcome === "succeeded").length, 0);
});

test("caller cancellation and native cleanup settle before stop reports completion", async () => {
  const owner = new AbortController(); const started = deferred(); const release = deferred(); const nativeCleanup = deferred();
  let signal; let stopped = false; let aborts = 0;
  const current = run({ signal: owner.signal, onAbort: async () => { aborts++; await nativeCleanup.promise; } }); current.beginPass();
  const task = current.step("model", "モデルを作ります", async value => { signal = value; started.resolve(); await release.promise; return "ignored"; });
  const rejection = assert.rejects(task, code("cancelled"));
  await started.promise; owner.abort(); const stop = current.stop().then(() => { stopped = true; });
  await tick(); assert.equal(stopped, false); assert.equal(signal.aborted, true); assert.equal(current.snapshot().phase, "stopping");
  release.resolve(); await tick(); assert.equal(stopped, false, "native cancel cleanup is owned as well");
  nativeCleanup.resolve(); await rejection; await stop;
  assert.equal(aborts, 1); assert.equal(current.snapshot().phase, "cancelled");
  assert.throws(() => current.recordSaved("a"), code("cancelled"));
});

test("a synchronous cancellation inside work still owns and drains its async remainder", async () => {
  const release = deferred(); const started = deferred(); let stopSettled = false;
  const current = run(); current.beginPass();
  const task = current.step("model", "制作します", async () => { void current.stop().then(() => { stopSettled = true; }); started.resolve(); await release.promise; });
  const rejection = assert.rejects(task, code("cancelled"));
  await started.promise; await tick(); assert.equal(stopSettled, false);
  release.resolve(); await rejection; await current.stop(); assert.equal(stopSettled, true);
});

test("explicit writers are exclusive and a streamed outer model may save between chunks", async () => {
  const current = run(); current.beginPass();
  const first = deferred(); const release = deferred(); const starts = [];
  const writer = current.step("write", "最初の変更", async () => { starts.push("a"); first.resolve(); await release.promise; }, { write: true });
  const following = current.step("write", "次の変更", async () => { starts.push("b"); }, { write: true });
  await first.promise; await tick(); assert.deepEqual(starts, ["a"]);
  release.resolve(); await Promise.all([writer, following]); assert.deepEqual(starts, ["a", "b"]);
  await current.step("model", "制作を配信します", async () => {
    current.recordCommit("a");
    await current.step("save", "途中の変更を保存します", async () => { current.recordSaved("a"); });
    return "stream finished";
  }, { modelCalls: 1, write: false });
  assert.equal(current.finish({ fingerprint: "a" }), true);
});

test("a bounded rolling pool overlaps safe reads and commits results in submission order", async () => {
  const current = run(); current.beginPass();
  const gates = Array.from({ length: 4 }, deferred); const started = []; const starts = Array.from({ length: 4 }, deferred);
  const batch = current.tools(gates.map((gate, index) => ({ kind: "context", label: `read-${index}`, work: async () => { started.push(index); starts[index].resolve(); await gate.promise; return index; } })), { maxParallel: 2 });
  await Promise.all([starts[0].promise, starts[1].promise]); assert.deepEqual(started, [0, 1]);
  gates[1].resolve(); await starts[2].promise;
  assert.deepEqual(started, [0, 1, 2], "a settled slot replenishes without waiting for the oldest result");
  assert.equal(current.snapshot().events.filter(event => event.phase === "context" && event.outcome === "succeeded").length, 0, "later results wait for model order");
  gates[0].resolve(); gates[2].resolve(); await starts[3].promise; gates[3].resolve();
  assert.deepEqual(await batch, [0, 1, 2, 3]);
  assert.deepEqual(current.snapshot().events.filter(event => event.phase === "context" && event.outcome === "succeeded").map(event => event.label), ["read-0", "read-1", "read-2", "read-3"]);
});

test("a GPU/write barrier waits for all earlier reads and blocks later reads", async () => {
  const current = run(); current.beginPass(); const starts = []; const readGate = deferred(); const gpuGate = deferred(); const readStarted = deferred(); const gpuStarted = deferred();
  const batch = current.tools([
    { kind: "context", label: "read-before", work: async () => { starts.push("read-before"); readStarted.resolve(); await readGate.promise; return "read-before"; } },
    { kind: "capture", label: "gpu", work: async () => { starts.push("gpu"); gpuStarted.resolve(); await gpuGate.promise; return "gpu"; } },
    { kind: "context", label: "read-after", work: async () => { starts.push("read-after"); return "read-after"; } },
  ]);
  await readStarted.promise; await tick(); assert.deepEqual(starts, ["read-before"]);
  readGate.resolve(); await gpuStarted.promise; await tick(); assert.deepEqual(starts, ["read-before", "gpu"]);
  gpuGate.resolve(); assert.deepEqual(await batch, ["read-before", "gpu", "read-after"]);
});

test("a failed read stops replenishment and drains its already-started sibling", async () => {
  const current = run(); current.beginPass(); const fail = deferred(); const drain = deferred(); const started = []; const both = deferred();
  const batch = current.tools([0, 1, 2, 3].map(index => ({ kind: "context", label: `read-${index}`, work: async () => { started.push(index); if (started.length === 2) both.resolve(); await (index === 0 ? fail.promise : drain.promise); if (index === 0) throw new Error("read failed"); return index; } })), { maxParallel: 2 });
  let settled = false; const rejection = assert.rejects(batch, /read failed/).then(() => { settled = true; });
  await both.promise; fail.resolve(); await tick(); assert.deepEqual(started, [0, 1]); assert.equal(settled, false);
  drain.resolve(); await rejection; assert.deepEqual(started, [0, 1]);
  assert.deepEqual(current.snapshot().events.filter(event => event.phase === "context" && event.outcome !== "started").map(event => [event.label, event.outcome]), [["read-0", "failed"], ["read-1", "succeeded"], ["read-2", "failed"], ["read-3", "failed"]]);
});

test("cancelling a read pool drains active reads and records skipped barriers in order", async () => {
  const current = run(); current.beginPass(); const release = deferred(); const both = deferred(); const started = [];
  const batch = current.tools([0, 1, 2, 3].map(index => ({ kind: index === 2 ? "capture" : "context", label: `tool-${index}`, work: async () => { started.push(index); if (started.length === 2) both.resolve(); await release.promise; return index; } })), { maxParallel: 2 });
  const rejection = assert.rejects(batch, code("cancelled"));
  await both.promise; let stopped = false; const stopping = current.stop("scene-changed").then(() => { stopped = true; });
  await tick(); assert.equal(stopped, false); release.resolve(); await rejection; await stopping;
  assert.deepEqual(started, [0, 1]); assert.equal(current.snapshot().phase, "cancelled"); assert.equal(current.snapshot().reason, "scene-changed");
  assert.deepEqual(current.snapshot().events.filter(event => event.label.startsWith("tool-") && event.outcome !== "started").map(event => event.label), ["tool-0", "tool-1", "tool-2", "tool-3"]);
});

test("a normal terminal failure drains owned work and remains distinct from user cancellation", async () => {
  const current = run(); current.beginPass(); const release = deferred(); const started = deferred();
  const task = current.step("context", "素材を確認します", async () => { started.resolve(); await release.promise; return "late"; });
  const rejection = assert.rejects(task, code("step-failed"));
  await started.promise; let failed = false; const failure = current.fail("save-failed").then(() => { failed = true; });
  await tick(); assert.equal(failed, false); release.resolve(); await rejection; await failure;
  assert.equal(current.snapshot().phase, "failed"); assert.equal(current.snapshot().reason, "save-failed");
  await current.stop(); assert.equal(current.snapshot().phase, "failed", "a later stop never overwrites the authoritative cause");
  assert.equal(current.snapshot().events.some(event => event.phase === "run" && event.outcome === "cancelled"), false);
});

test("a verified manual Scene rebase invalidates review without charging generated writes", () => {
  const current = run({ limits: { maxWrites: 1 } }); current.beginPass();
  current.recordCommit("generated"); current.recordSaved("generated"); current.recordInspection({ fingerprint: "generated", approved: true, views: 2 });
  assert.throws(() => current.recordSaved("manual-edit"), code("unsaved"));
  current.observeScene("manual-edit");
  assert.equal(current.snapshot().counters.writes, 1); assert.equal(current.snapshot().inspection, undefined);
  assert.throws(() => current.finish({ fingerprint: "manual-edit" }), code("unsaved"));
  current.recordSaved("manual-edit");
  assert.throws(() => current.finish({ fingerprint: "manual-edit", requireInspection: true }), code("inspection-required"));
  current.recordInspection({ fingerprint: "manual-edit", approved: true, views: 2 });
  assert.equal(current.finish({ fingerprint: "manual-edit", requireInspection: true }), true);
});

test("completion is admitted only after its authoritative durable checkpoint succeeds", async () => {
  const observed = []; const current = run({ onSnapshot: snapshot => observed.push(snapshot) }); current.beginPass(); current.recordSaved("saved");
  const before = current.snapshot(); let candidate;
  assert.throws(() => current.finish({ fingerprint: "saved", checkpoint(completed) {
    candidate = completed;
    assert.equal(current.snapshot().phase, "running", "the candidate has not entered live state");
    assert.equal(completed.phase, "completed"); assert.equal(completed.events.at(-1).outcome, "completed");
    assert.equal(Object.isFrozen(completed), true);
    assert.throws(() => current.recordCommit("other"), code("busy"));
    throw new Error("durable store failed");
  } }), /durable store failed/);
  assert.equal(current.snapshot().phase, "running"); assert.equal(current.snapshot().sequence, before.sequence);
  assert.equal(observed.some(snapshot => snapshot.phase === "completed"), false);
  await current.fail("checkpoint-failed"); assert.equal(current.snapshot().phase, "failed");
  assert.equal(current.snapshot().events.some(event => event.outcome === "completed"), false);
  assert.equal(candidate.sequence, before.sequence + 1);
  const succeeds = run({ runId: "checkpoint-success" }); succeeds.beginPass(); succeeds.recordSaved("saved"); let persisted;
  assert.equal(succeeds.finish({ fingerprint: "saved", checkpoint(completed) { persisted = completed; } }), true);
  assert.deepEqual(succeeds.snapshot(), persisted, "the saved completion candidate is exactly the admitted state");
});

test("the journal is immutable and bounded while cumulative budgets remain intact", async () => {
  const current = run(); current.beginPass();
  for (let index = 0; index < 90; index++) await current.step("context", `context-${index}`, async () => undefined);
  const snapshot = current.snapshot(); assert.equal(snapshot.events.length, 128); assert.equal(snapshot.sequence, 181); assert.equal(snapshot.counters.attempts, 90);
  assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen(snapshot.events[0]), true);
  assert.throws(() => { snapshot.counters.modelCalls = 0; });
  const roundtrip = normalizeChatgptHarnessSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(roundtrip, snapshot);
  const interrupted = interruptChatgptHarnessSnapshot(snapshot);
  assert.equal(interrupted.phase, "cancelled"); assert.equal(interrupted.counters.attempts, 90); assert.equal(interrupted.events.length, 128); assert.equal(interrupted.sequence, 182);
  assert.equal(interrupted.events.at(-1).code, "interrupted");
  assert.deepEqual(interruptChatgptHarnessSnapshot(interrupted), interrupted);
  for (const bad of [ { ...snapshot, version: 2 }, { ...snapshot, rawSource: "ignored code" }, { ...snapshot, events: [...snapshot.events, snapshot.events[0]] }, { ...snapshot, counters: { ...snapshot.counters, modelCalls: NaN } }, { ...snapshot, counters: { ...snapshot.counters, extra: 1 } }, { ...snapshot, events: [{ ...snapshot.events.at(-1), label: "bad\nlabel" }] }, { ...snapshot, phase: "completed", dirty: false, savedFingerprint: "a", committedFingerprint: "b" } ]) assert.throws(() => normalizeChatgptHarnessSnapshot(bad), code("invalid-snapshot"));
});

test("observer failures cannot change tool outcomes or the committed lifecycle", async () => {
  const current = run({ onSnapshot: () => { throw new Error("observer broke"); } }); current.beginPass();
  assert.equal(await current.step("plan", "構成を確認します", async () => "result", { modelCalls: 1 }), "result");
  current.recordSaved("a"); assert.equal(current.finish({ fingerprint: "a" }), true);
  assert.equal(current.snapshot().events.at(-1).outcome, "completed");
  const asynchronous = run({ runId: "async-observer", onSnapshot: async () => { throw new Error("async observer broke"); } });
  asynchronous.beginPass(); await asynchronous.step("context", "素材を確認します", async () => "read"); await tick();
  assert.equal(asynchronous.snapshot().counters.attempts, 1);
});

test("repeating a plan is allowed while each pass reaches a new saved Scene", () => {
  const current = run();
  for (let index = 1; index <= 5; index++) {
    current.beginPass(index === 1 ? "initial" : "continue"); current.observeScene(`scene-${index}`); current.recordSaved(`scene-${index}`);
    const result = current.recordProgress({ planFingerprint: "same-canonical-plan", beforeFingerprint: `scene-${index - 1}`, afterFingerprint: `scene-${index}` });
    assert.equal(result.kind, "changed"); assert.equal(result.stalledPasses, 0); assert.equal(result.shouldReplan, false);
  }
  assert.equal(current.snapshot().counters.passes, 5);
  assert.equal(current.finish({ fingerprint: "scene-5" }), true);
});

test("unchanged Scenes and identical plans escalate to a durable bounded stop", async () => {
  const current = run(); current.beginPass(); current.recordSaved("same-scene");
  const first = current.recordProgress({ planFingerprint: "same-plan", beforeFingerprint: "same-scene", afterFingerprint: "same-scene" });
  assert.equal(first.kind, "unchanged"); assert.equal(first.shouldReplan, true); assert.equal(first.stalledPasses, 1);
  current.beginPass("continue"); current.recordSaved("same-scene");
  const second = current.recordProgress({ planFingerprint: "same-plan", beforeFingerprint: "same-scene", afterFingerprint: "same-scene" });
  assert.equal(second.kind, "repeated-plan"); assert.equal(second.repeatedPlanPasses, 2); current.pause();
  const restored = run({ snapshot: JSON.parse(JSON.stringify(current.snapshot())) }); restored.beginPass("continue"); restored.recordSaved("same-scene");
  assert.throws(() => restored.recordProgress({ planFingerprint: "same-plan", beforeFingerprint: "same-scene", afterFingerprint: "same-scene" }), code("stalled-progress"));
  await restored.stop(); assert.equal(restored.snapshot().phase, "failed"); assert.equal(restored.snapshot().reason, "stalled-progress");
  assert.equal(restored.snapshot().progress.observations.at(-1).stalledPasses, 3);
  assert.equal(restored.snapshot().progress.observations.at(-1).repeatedPlanPasses, 3);
  assert.throws(() => restored.recordCommit("late"), code("stalled-progress"));
});

test("changing plan hashes without changing the Scene does not reset stalled work", async () => {
  const current = run();
  for (let index = 1; index <= 3; index++) {
    current.beginPass(index === 1 ? "initial" : "continue"); current.recordSaved("unchanged");
    const record = () => current.recordProgress({ planFingerprint: `different-plan-${index}`, beforeFingerprint: "unchanged", afterFingerprint: "unchanged" });
    if (index === 3) assert.throws(record, code("stalled-progress"));
    else { const observed = record(); assert.equal(observed.stalledPasses, index); assert.equal(observed.repeatedPlanPasses, 1); }
  }
  await current.stop(); assert.equal(current.snapshot().phase, "failed");
});

test("returning to previously authored Scenes detects A to B to A cycles after restoration", async () => {
  let current = run();
  for (let index = 1; index <= 4; index++) {
    const before = index % 2 ? "a" : "b"; const after = index % 2 ? "b" : "a";
    current.beginPass(index === 1 ? "initial" : "continue"); current.observeScene(after); current.recordSaved(after);
    const record = () => current.recordProgress({ planFingerprint: `plan-${index}`, beforeFingerprint: before, afterFingerprint: after });
    if (index === 4) assert.throws(record, code("stalled-progress"));
    else {
      const observed = record(); assert.equal(observed.kind, index === 1 ? "changed" : "cycle");
      if (index > 1) { assert.equal(observed.cycleLength, 2); assert.equal(observed.stalledPasses, index - 1); }
    }
    if (index === 2) { current.pause(); current = run({ snapshot: current.snapshot() }); }
  }
  await current.stop(); assert.equal(current.snapshot().progress.observations.at(-1).kind, "cycle");
});

test("manual Scene changes break old repetition chains and novel states reset stalls", () => {
  let progress;
  const record = (pass, before, after) => { const result = observeAuthoringProgress(progress, { pass, planFingerprint: "same-plan", beforeFingerprint: before, afterFingerprint: after }); progress = result.progress; return result; };
  assert.equal(record(1, "a", "b").kind, "changed"); assert.equal(record(2, "b", "a").kind, "cycle");
  const manual = record(3, "manual-edit", "a"); assert.equal(manual.kind, "changed"); assert.equal(manual.stalledPasses, 0);
  assert.equal(record(4, "a", "c").kind, "changed"); assert.equal(record(5, "c", "c").stalledPasses, 1);
  const novel = record(6, "c", "d"); assert.equal(novel.kind, "changed"); assert.equal(novel.stalledPasses, 0);
});

test("a final unchanged verification may complete and progress never admits unsaved claims", () => {
  const current = run(); current.beginPass(); current.recordCommit("scene");
  assert.throws(() => current.recordProgress({ planFingerprint: "plan", beforeFingerprint: "scene", afterFingerprint: "scene" }), code("unsaved"));
  current.recordSaved("scene");
  assert.throws(() => current.recordProgress({ planFingerprint: "plan", beforeFingerprint: "scene", afterFingerprint: "fabricated" }), code("unsaved"));
  for (let index = 1; index <= 3; index++) {
    if (index > 1) current.beginPass("continue");
    const progress = current.recordProgress({ planFingerprint: "plan", beforeFingerprint: "scene", afterFingerprint: "scene", continuing: index !== 3 });
    assert.equal(progress.stalledPasses, index); assert.equal(progress.stopped, false);
  }
  assert.equal(current.finish({ fingerprint: "scene" }), true);
  const old = { ...current.snapshot() }; delete old.progress;
  assert.equal(normalizeChatgptHarnessSnapshot(old).progress, undefined, "schema 1 snapshots without progress remain compatible");
});

test("progress restoration is strict, immutable, and bounded independently from lifecycle events", () => {
  let progress;
  for (let pass = 1; pass <= 30; pass++) progress = observeAuthoringProgress(progress, { pass, planFingerprint: "digest-only", beforeFingerprint: `scene-${pass - 1}`, afterFingerprint: `scene-${pass}` }).progress;
  assert.equal(progress.observations.length, AUTHORING_PROGRESS_HISTORY_LIMIT); assert.equal(progress.observations.at(-1).pass, 30);
  assert.equal(Object.isFrozen(progress.observations[0]), true);
  assert.deepEqual(normalizeAuthoringProgress(JSON.parse(JSON.stringify(progress)), 30), progress);
  const current = run(); current.beginPass(); current.recordSaved("scene"); current.recordProgress({ planFingerprint: "plan", beforeFingerprint: "scene", afterFingerprint: "scene" });
  const snapshot = current.snapshot(); const observation = snapshot.progress.observations[0];
  for (const malformed of [
    { ...snapshot.progress, rawSource: "code must not be persisted here" }, { ...snapshot.progress, version: 2 },
    { version: 1, observations: [{ ...observation, pass: 2 }] },
    { version: 1, observations: [{ ...observation, afterFingerprint: "different" }] },
    { version: 1, observations: [{ ...observation, kind: "cycle", afterFingerprint: "different", cycleLength: 1 }] },
    { version: 1, observations: [{ ...observation, kind: "changed", afterFingerprint: "different" }] },
    { version: 1, observations: [{ ...observation, planFingerprint: "bad\nplan" }] },
    { version: 1, observations: [observation, observation] },
  ]) assert.throws(() => normalizeChatgptHarnessSnapshot({ ...snapshot, progress: malformed }), code("invalid-snapshot"));
  assert.throws(() => current.recordProgress({ planFingerprint: "plan", beforeFingerprint: "scene", afterFingerprint: "scene" }), code("invalid-input"), "a pass cannot add duplicate progress facts");
});

test("semantic progress cannot substitute for exact saved or inspected Scene evidence", () => {
  const current = run(); current.beginPass(); current.recordCommit("exact-recipe-2");
  const input = { planFingerprint: "plan", beforeFingerprint: "same-source-and-scene", afterFingerprint: "same-source-and-scene", savedFingerprint: "exact-recipe-2", continuing: false };
  assert.throws(() => current.recordProgress(input), code("unsaved"));
  current.recordSaved("exact-recipe-2");
  assert.throws(() => current.recordProgress({ ...input, savedFingerprint: "exact-recipe-1" }), code("unsaved"));
  const progress = current.recordProgress(input);
  assert.equal(progress.kind, "unchanged");
  assert.equal(current.snapshot().savedFingerprint, "exact-recipe-2");
  assert.throws(() => current.recordInspection({ fingerprint: "same-source-and-scene", approved: true, views: 2 }), code("inspection-required"));
  assert.throws(() => current.finish({ fingerprint: "same-source-and-scene" }), code("unsaved"));
  current.recordInspection({ fingerprint: "exact-recipe-2", approved: true, views: 2 });
  assert.equal(current.finish({ fingerprint: "exact-recipe-2", requireInspection: true }), true);
});
