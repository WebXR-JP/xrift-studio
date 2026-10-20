import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-authoring-host-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createPiAuthoringRunner: createChatgptAuthoringRunner } = await load("pi-authoring-host");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { createChatgptScaffold, editChatgptEntity } = await server.ssrLoadModule("/scripts/fixtures/pi-authoring.mjs");
const { createChatgptSession, upsertChatgptSessionTurn } = await load("chatgpt-sessions");
const { authoringSceneProgressFingerprint } = await load("authoring-scene-progress");
const all = new Set();
const deferred = () => { let resolve; const promise = new Promise(accept => { resolve = accept; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const options = { models: false, materials: false, audio: false };
const direction = { scope: "world", detail: "overview", focus: "広場の導線", criteria: ["歩いて移動できる"], maxPasses: 2 };
const emptyPlan = extra => ({ title: "隔離した制作テスト", description: "最新のSceneを確認します", objects: [], hasMore: false, ...extra });
// Transport fixtures at the native review boundary; these do not test rendered appearance.
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fixture(configuration = {}) {
  let bundle = createChatgptScaffold(emptyPlan(), "isolated-authoring-host-fixture");
  const project = { name: "isolated-authoring-host-fixture", path: "C:/isolated-authoring-host-fixture", kind: "world", format: "visual", title: "fixture", description: null, modifiedAtMs: null, uploadedAt: null, publicationId: null };
  const session = createChatgptSession(bundle.project.projectId, bundle.scene.sceneId, "制作テスト", "2026-10-17T00:00:00Z", "host-session");
  const calls = { plans: [], reviews: [], captures: [], commits: [], saves: [], cancels: [], snapshots: [], flushes: 0, toasts: [], unsubscribed: 0 };
  const bridge = {
    currentBundle: () => bundle,
    currentContext: () => ({ projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, revision: calls.commits.length, canGenerate: true }),
    openChatgpt() {},
    applyGenerationStep({ expectedBundle, nextBundle }) { if (expectedBundle !== bundle) return false; calls.commits.push(nextBundle); update(nextBundle); return true; },
    async saveNow() { calls.saves.push(bundle); await configuration.save?.(calls.saves.length, api); return project.path; },
    async captureWorldViews() { return [{ label: "fixture", dataUrl: image }]; },
    async captureModelViews() { return []; },
    async leave() { return true; },
  };
  const host = {
    chatgptGenerationRef: { current: null }, mcpPublishActiveRef: { current: false }, mcpModelingActiveRef: { current: false },
    visualSessionRef: { current: { bundle, project } }, projectsRoot: "C:/isolated-authoring-host-fixture",
    requireMcpProjectBridge: () => bridge, mcpProjectBridgeRef: { current: bridge },
    chatgptSessionsRef: { current: [session] }, selectedChatgptSessionIdRef: { current: session.id },
    updateChatgptSessions(sessions) { host.chatgptSessionsRef.current = sessions; }, selectChatgptSession(id) { host.selectedChatgptSessionIdRef.current = id; },
    flushChatgptSessions() { calls.flushes++; configuration.flush?.(calls.flushes, api); },
    piRunsRef: { current: new Map() }, chatgptGenerationsRef: { current: new Map() }, chatgptControlsRef: { current: new Map() }, chatgptPlansRef: { current: new Map() }, chatgptRevertsRef: { current: new Map() },
    setChatgptGeneration(job) { if (job) calls.snapshots.push(job); },
    recordChatgptGeneration(job) { host.chatgptGenerationsRef.current.set(job.generationId, job); host.chatgptSessionsRef.current = upsertChatgptSessionTurn(host.chatgptSessionsRef.current, job.sessionId, job); },
    async uniqueProjectDirectoryName() { throw new Error("new-project creation is outside this fixture"); },
    setVisualCompilationFresh() {}, setVisualThumbnailReadiness() {}, setVisualSession(value) { host.visualSessionRef.current = value; },
    async waitForMcpProjectBridge() { return bridge; }, async refreshProjects() {}, toast(value) { calls.toasts.push(value); },
  };
  const update = next => { bundle = next; host.visualSessionRef.current = { bundle, project }; };
  const api = { host, calls, bridge, project, get bundle() { return bundle; }, get job() { return host.chatgptGenerationsRef.current.get("host-generation"); },
    manualEdit(name = "手動で変えたLight") { const id = Object.values(bundle.scene.entities).find(entity => entity.name !== "SpawnPoint").id; update(editChatgptEntity(bundle, { entityId: id, name }).bundle); },
    run(mode = "build") { return createChatgptAuthoringRunner(host)("fixture-model", "広場全体を整えてください", options, "host-generation", mode); },
  };
  tauri.isAvailable = () => true;
  tauri.readWorldAuthoring = async () => null;
  tauri.chatgptCancelGeneration = async generationId => { calls.cancels.push(generationId); };
  tauri.chatgptPiRun = async (request, onEvent) => {
    calls.plans.push(request);
    return await configuration.pi?.(request, onEvent, api) ?? { text: "保存と完成確認が完了しました" };
  };
  all.add(api); return api;
}
test.afterEach(async () => { for (const item of all) await Promise.all([...item.host.piRunsRef.current.values()].map(run => run.stop())); all.clear(); });
test.after(() => server.close());

test("a normal reply stays neutral and preserves an unconsumed additional instruction", async () => {
  const current = fixture({ pi(_request, emit) {
    emit({ type: "input", message: { id: "extra-one", prompt: "入口を広く", delivery: "steer" }, state: "queued" });
    return { text: "現在のSceneを確認できます", completionVerified: false };
  } });
  await current.run();
  assert.equal(current.job.status, "completed");
  assert.equal(current.job.completionVerified, false);
  assert.equal(current.job.error, undefined);
  assert.equal(current.job.liveMessages[0].state, "unapplied");
  assert.equal(current.host.chatgptSessionsRef.current[0].turns[0].liveMessages[0].prompt, "入口を広く");
});

test("native cancellation keeps accepted but unconsumed additional instructions recoverable", async () => {
  const current = fixture({ pi(_request, emit, current) {
    emit({ type: "input", message: { id: "extra-one", prompt: "窓を調整", delivery: "follow_up" }, state: "queued" });
    current.host.chatgptControlsRef.current.get("host-generation").cancelled = true;
    throw new Error("制作を停止しました");
  } });
  await assert.rejects(current.run(), /停止/);
  assert.equal(current.job.status, "cancelled");
  assert.equal(current.job.liveMessages[0].state, "unapplied");
  assert.equal(current.host.chatgptGenerationRef.current, null);
});

test("a failed history checkpoint prevents Pi dispatch and releases the request", async () => {
  const current = fixture({ flush() { throw new Error("checkpoint unavailable"); } });
  await assert.rejects(current.run(), /checkpoint unavailable/);
  assert.equal(current.calls.plans.length, 0);
  assert.equal(current.host.chatgptGenerationRef.current, null);
  assert.equal(current.job.status, "failed");
});

test("the host saves before starting Pi, passes preferences and scopes the request", async () => {
  const current = fixture();
  assert.equal(await current.run(), current.project);
  const request = current.calls.plans[0];
  assert.equal(request.projectId, current.bundle.project.projectId);
  assert.equal(request.sceneId, current.bundle.scene.sceneId);
  assert.deepEqual(JSON.parse(request.context).options, options);
  assert.equal(current.calls.saves.length, 1);
  assert.equal(current.job.status, "completed");
  assert.equal(current.host.piRunsRef.current.size, 0);
});

test("plan mode neither saves nor changes documents and stores a reviewable plan", async () => {
  const current = fixture({ pi: async () => ({ text: "", plan: { title: "入口", description: "入口に屋根と窓のある家を作る" } }) });
  const before = current.bundle;
  assert.equal(await current.run("plan"), null);
  assert.equal(current.bundle, before);
  assert.equal(current.calls.saves.length, 0);
  assert.equal(current.job.status, "planned");
  assert.ok(current.host.chatgptPlansRef.current.has("host-generation"));
  assert.match(current.job.plan.description, /屋根/);
});

test("a manual edit invalidates a previously approved plan before Pi starts", async () => {
  const current = fixture({ pi: async () => ({ text: "", plan: { title: "入口", description: "家を作る" } }) });
  await current.run("plan");
  const stored = current.host.chatgptPlansRef.current.get("host-generation");
  current.manualEdit();
  await assert.rejects(createChatgptAuthoringRunner(current.host)("fixture-model", "家を作る", options, "host-generation", "build", "current", stored.plan), /プラン.*Scene/);
  assert.equal(current.calls.plans.length, 1);
});

test("only actual changes followed by a save count as saved progress and can be reverted", async () => {
  const current = fixture({ async pi(_request, emit, api) {
    const mutationBeforeFingerprint = authoringSceneProgressFingerprint(api.bundle);
    emit({ type: "progress", operationId: "write", readOnly: false, tool: "rename_entity", message: "編集中" });
    api.manualEdit("Piが変えたLight");
    emit({ type: "progress", operationId: "parallel-read", readOnly: true, tool: "get_scene", message: "読み取り中" });
    emit({ type: "progress", operationId: "write", readOnly: false, tool: "rename_entity", message: "変更しました", changed: true, mutationBeforeFingerprint });
    assert.equal(api.job.progress.completed, 0);
    emit({ type: "progress", tool: "save_scene", message: "保存しました", saved: true });
    return { text: "保存と確認が完了しました" };
  } });
  const before = current.bundle;
  await current.run();
  assert.equal(current.job.progress.completed, 1);
  assert.equal(current.job.revertAvailable, true);
  assert.deepEqual(current.host.chatgptRevertsRef.current.get("host-generation").before, before);
  assert.deepEqual(current.host.chatgptRevertsRef.current.get("host-generation").after, current.bundle);
});

test("cancellation retains the active lease until the native operation settles", async () => {
  const started = deferred(), release = deferred();
  const current = fixture({ async pi() { started.resolve(); await release.promise; throw new Error("制作を停止しました"); } });
  const running = current.run(), rejection = assert.rejects(running, /停止/);
  await started.promise;
  await current.host.piRunsRef.current.get("host-generation").stop("user");
  assert.equal(current.host.chatgptGenerationRef.current, "host-generation");
  release.resolve(); await rejection;
  assert.equal(current.job.status, "cancelled");
  assert.equal(current.host.chatgptGenerationRef.current, null);
  assert.equal(current.calls.commits.length, 0);
});

test("native errors preserve partial documents and never publish completion", async () => {
  const current = fixture({ async pi(_request, emit, api) {
    emit({ type: "progress", tool: "rename_entity", message: "編集中" }); api.manualEdit("保存済みの変更");
    emit({ type: "progress", tool: "rename_entity", message: "変更しました", changed: true });
    throw new Error("native connection failed");
  } });
  await assert.rejects(current.run(), /native connection failed/);
  assert.equal(current.job.status, "failed");
  assert.ok(Object.values(current.bundle.scene.entities).some(entity => entity.name === "保存済みの変更"));
  assert.equal(current.calls.snapshots.some(job => job.status === "completed"), false);
});

test("an overlapping manual edit disables the whole request's Revert instead of swallowing user work", async () => {
  const current = fixture({ async pi(_request, emit, api) {
    emit({ type: "progress", operationId: "import", readOnly: false, tool: "import_model_asset", message: "取り込み中" });
    api.manualEdit("取り込み中の手動編集");
    emit({ type: "progress", tool: "import_model_asset", message: "取り込みました", changed: true, operationId: "import", readOnly: false, mutationBeforeFingerprint: authoringSceneProgressFingerprint(api.bundle) });
    emit({ type: "progress", tool: "save_scene", message: "保存しました", saved: true });
    return { text: "保存と確認が完了しました" };
  } });
  await current.run();
  assert.equal(current.job.revertAvailable, false);
  assert.equal(current.host.chatgptRevertsRef.current.has("host-generation"), false);
});
