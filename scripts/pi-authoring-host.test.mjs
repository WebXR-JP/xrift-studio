import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-authoring-host-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createChatgptAuthoringRunner } = await load("chatgpt-authoring-host");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { createChatgptScaffold, editChatgptEntity } = await load("chatgpt-generation");
const { createChatgptSession, upsertChatgptSessionTurn } = await load("chatgpt-sessions");
const { chatgptHarnessSceneFingerprint } = await load("chatgpt-harness-context");
const all = new Set();
const options = { models: false, materials: false, audio: false };
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
    async captureWorldViews(checkCurrent) { checkCurrent?.(); calls.captures.push(chatgptHarnessSceneFingerprint(bundle)); await configuration.capture?.(calls.captures.length, api); return [{ label: "ワールド全体の俯瞰", dataUrl: image }, { label: "スポーン位置からの視界（目の高さ1.6m）", dataUrl: image }]; },
    async captureModelViews() { throw new Error("model capture is outside this fixture"); },
    async leave() { return true; },
  };
  const host = {
    chatgptGenerationRef: { current: null }, mcpPublishActiveRef: { current: false }, mcpModelingActiveRef: { current: false },
    visualSessionRef: { current: { bundle, project } }, projectsRoot: "C:/isolated-authoring-host-fixture",
    requireMcpProjectBridge: () => bridge, mcpProjectBridgeRef: { current: bridge },
    chatgptSessionsRef: { current: [session] }, selectedChatgptSessionIdRef: { current: session.id },
    updateChatgptSessions(sessions) { host.chatgptSessionsRef.current = sessions; }, selectChatgptSession(id) { host.selectedChatgptSessionIdRef.current = id; },
    flushChatgptSessions() { calls.flushes++; configuration.flush?.(calls.flushes, api); },
    chatgptHarnessRunsRef: { current: new Map() }, chatgptGenerationsRef: { current: new Map() }, chatgptControlsRef: { current: new Map() }, chatgptPlansRef: { current: new Map() }, chatgptRevertsRef: { current: new Map() },
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
  const archived = new Map();
  tauri.readChatgptHarnessContext = async (_path, fingerprint) => archived.get(fingerprint) ?? null;
  tauri.writeChatgptHarnessContext = async (_path, fingerprint, content) => { if (archived.has(fingerprint) && archived.get(fingerprint) !== content) throw new Error("immutable context exists"); archived.set(fingerprint, content); };
  tauri.onChatgptGenerationProgress = async () => () => { calls.unsubscribed++; };
  tauri.chatgptAgentTurn = async (...args) => await configuration.action?.(api, args) ?? (calls.captures.length ? "studio_finish" : "studio_inspect");
  tauri.chatgptCancelGeneration = async generationId => { calls.cancels.push(generationId); };
  tauri.chatgptPlan = async (...args) => { calls.plans.push(args); const plan = await configuration.plan?.(calls.plans.length, api) ?? emptyPlan(); return { plan: JSON.stringify(plan), assetCandidates: [] }; };
  tauri.chatgptReviewScene = async (...args) => { calls.reviews.push({ args, fingerprint: chatgptHarnessSceneFingerprint(bundle) }); return await configuration.review?.(calls.reviews.length, api) ?? { approved: true, summary: "導線を確認しました", remainingWork: "", criteria: args[3].criteria.map(criterion => ({ criterion, passed: true, reason: "画像と最新のSceneの配置を確認しました" })) }; };
  all.add(api); return api;
}
test.afterEach(async () => { for (const item of all) await Promise.all([...item.host.chatgptHarnessRunsRef.current.values()].map(run => run.stop())); all.clear(); });
test.after(() => server.close());
const edit = (current, name) => emptyPlan({ edits: [{ entityId: Object.values(current.bundle.scene.entities).find(entity => entity.name !== "SpawnPoint").id, name }] });
test("Pi uses the real host edit/save/capture/review paths and attests the final revision", async () => {
  const current = fixture({ plan: (_n, api) => edit(api, "Pi edited Light") });
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.commits.length, 1);
  assert.ok(current.calls.saves.length >= 3);
  assert.equal(current.calls.captures.length, 1);
  assert.equal(current.calls.reviews.length, 1);
  assert.equal(current.job.status, "completed");
  assert.equal(current.job.harness.savedFingerprint, chatgptHarnessSceneFingerprint(current.bundle));
  assert.equal(current.job.harness.inspection.fingerprint, current.job.harness.savedFingerprint);
  assert.equal(current.host.chatgptGenerationRef.current, null);
});
test("a rejected rendered-view review feeds a repair pass before fresh review and completion", async () => {
  const current = fixture({
    plan: (n, api) => edit(api, `Repaired Light ${n}`),
    action: api => api.calls.reviews.length === 1 && api.calls.plans.length === 1 ? "studio_author" : api.calls.reviews.length < api.calls.plans.length ? "studio_inspect" : "studio_finish",
    review: (n, api) => ({ approved: n > 1, summary: n > 1 ? "修正後を確認しました" : "Lightの調整が不足しています", remainingWork: n > 1 ? "" : "Lightを調整する", criteria: api.calls.reviews.at(-1).args[3].criteria.map(criterion => ({ criterion, passed: n > 1, reason: "最新画像とSceneを照合" })) }),
  });
  await current.run();
  assert.equal(current.calls.plans.length, 2);
  assert.equal(current.calls.commits.length, 2);
  assert.equal(current.calls.reviews.length, 2);
  assert.match(JSON.stringify(current.calls.plans[1][5]), /Lightを調整する/);
  assert.equal(current.job.status, "completed");
});
test("no-op plans cannot manufacture completion even when the model repeatedly requests it", async () => {
  const current = fixture({ action: () => "studio_finish" });
  await assert.rejects(current.run(), /上限/);
  assert.equal(current.calls.commits.length, 0);
  assert.equal(current.job.status, "failed");
  assert.equal(current.job.harness.phase, "failed");
});
test("save failure preserves the edit and cannot produce completed or inspected state", async () => {
  const current = fixture({ plan: (_n, api) => edit(api, "Saved later"), save: n => { if (n > 1) throw new Error("isolated disk failure"); } });
  await assert.rejects(current.run(), /isolated disk failure/);
  assert.equal(current.calls.commits.length, 1);
  assert.equal(current.calls.reviews.length, 0);
  assert.equal(current.job.status, "failed");
});
test("a manual edit during capture prevents stale review and completion", async () => {
  const current = fixture({ plan: (_n, api) => edit(api, "AI Light"), capture: (_n, api) => api.manualEdit("manual wins") });
  await assert.rejects(current.run(), /画像確認中にScene/);
  assert.equal(current.calls.reviews.length, 0);
  assert.equal(current.job.status, "failed");
  assert.ok(Object.values(current.bundle.scene.entities).some(entity => entity.name === "manual wins"));
});
test("cancel between Pi turns retains the same visible owner and prevents later tools", async () => {
  const current = fixture({ plan: (_n, api) => edit(api, "Before cancel"), action: async api => {
    assert.equal(api.host.chatgptGenerationRef.current, "host-generation");
    api.host.chatgptControlsRef.current.get("host-generation").cancelled = true;
    void api.host.chatgptHarnessRunsRef.current.get("host-generation").stop("user");
    return "studio_inspect";
  } });
  await assert.rejects(current.run());
  assert.equal(current.job.status, "cancelled");
  assert.equal(current.calls.captures.length, 0);
  assert.equal(current.host.chatgptControlsRef.current.size, 0);
});
test("invalid plan validation is repaired using a new bounded pass", async () => {
  const current = fixture({ plan: (n, api) => n === 1 ? { bad: true } : edit(api, "Valid repair"),
    action: api => api.calls.commits.length === 0 ? "studio_author" : api.calls.reviews.length ? "studio_finish" : "studio_inspect" });
  await current.run();
  assert.equal(current.calls.plans.length, 2);
  assert.equal(current.calls.commits.length, 1);
  assert.equal(current.job.status, "completed");
});
test("non-empty unchanged edits also cannot count as completed work", async () => {
  const current = fixture({ plan: (_n, api) => {
    const entity = Object.values(api.bundle.scene.entities).find(entity => entity.name !== "SpawnPoint");
    return edit(api, entity.name);
  }, action: () => "studio_finish" });
  await assert.rejects(current.run(), /上限/);
  assert.equal(current.calls.commits.length, 0);
  assert.equal(current.job.status, "failed");
});
test("plan mode pauses Pi for the user's confirmation without editing or reviewing", async () => {
  const current = fixture({ plan: (_n, api) => edit(api, "Pending approval") });
  assert.equal(await current.run("plan"), null);
  assert.equal(current.job.status, "planned");
  assert.equal(current.calls.commits.length, 0);
  assert.equal(current.calls.reviews.length, 0);
  assert.equal(current.job.harness.phase, "paused");
});
