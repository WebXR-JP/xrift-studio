import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-authoring-host-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createChatgptAuthoringRunner, createChatgptAuthoringPass } = await load("chatgpt-authoring-host");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const { createChatgptScaffold, editChatgptEntity } = await load("chatgpt-generation");
const { createChatgptSession, upsertChatgptSessionTurn } = await load("chatgpt-sessions");
const { chatgptHarnessSceneFingerprint } = await load("chatgpt-harness-context");
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
  tauri.chatgptCancelGeneration = async generationId => { calls.cancels.push(generationId); };
  tauri.chatgptPlan = async (...args) => { calls.plans.push(args); const plan = await configuration.plan?.(calls.plans.length, api) ?? emptyPlan(); return { plan: JSON.stringify(plan), assetCandidates: [] }; };
  tauri.chatgptReviewScene = async (...args) => { calls.reviews.push({ args, fingerprint: chatgptHarnessSceneFingerprint(bundle) }); return await configuration.review?.(calls.reviews.length, api) ?? { approved: true, summary: "導線を確認しました", remainingWork: "", criteria: args[3].criteria.map(criterion => ({ criterion, passed: true, reason: "画像と最新のSceneの配置を確認しました" })) }; };
  all.add(api); return api;
}
test.afterEach(async () => { for (const item of all) await Promise.all([...item.host.chatgptHarnessRunsRef.current.values()].map(run => run.stop())); all.clear(); });
test.after(() => server.close());

test("a failed session checkpoint prevents native planner dispatch", async () => {
  const current = fixture({ flush() { throw new Error("checkpoint unavailable"); } });
  await assert.rejects(current.run(), /checkpoint unavailable/);
  assert.equal(current.calls.plans.length, 0); assert.equal(current.calls.commits.length, 0); assert.equal(current.calls.saves.length, 0);
  assert.equal(current.host.chatgptGenerationRef.current, null);
  assert.equal(current.job.status, "failed"); assert.equal(current.job.harness.phase, "failed");
});

test("the real authoring runner saves and finishes through its shared harness", async () => {
  const current = fixture();
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.plans.length, 1); assert.ok(current.calls.flushes > 0); assert.ok(current.calls.saves.length > 0);
  assert.equal(current.job.status, "completed"); assert.equal(current.job.harness.phase, "completed");
  assert.equal(current.job.harness.savedFingerprint, chatgptHarnessSceneFingerprint(current.bundle));
  assert.equal(current.host.chatgptGenerationRef.current, null); assert.equal(current.calls.unsubscribed, 1);
  assert.equal(current.job.contextRefs.length, 1);
  assert.match(current.job.contextRefs[0].relativePath, /^\.cache\/xrift-studio-harness\/contexts\/[a-f0-9]{64}\.json$/);
});

test("an input artifact failure prevents inference even when the session checkpoint succeeds", async () => {
  const current = fixture();
  tauri.writeChatgptHarnessContext = async () => { throw new Error("input artifact storage unavailable"); };
  await assert.rejects(current.run(), /input artifact storage unavailable/);
  assert.equal(current.calls.plans.length, 0); assert.equal(current.calls.commits.length, 0);
  assert.equal(current.job.contextRefs, undefined); assert.equal(current.job.harness.phase, "failed");
});

test("a global approval missing one original criterion cannot complete the saved Scene", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction }), review: () => ({ approved: true, summary: "見た目は完成です", remainingWork: "", criteria: [] }) });
  await assert.rejects(current.run(), /完成条件/);
  assert.equal(current.calls.reviews.length, 1); assert.equal(current.job.status, "failed");
  assert.equal(current.job.harness.inspection, undefined);
  assert.ok(current.calls.saves.length > 0);
});

test("the host commits real Editor geometry and records the exact saved result", async () => {
  const current = fixture({ plan: () => emptyPlan({ objects: [{ name: "広場の床", shape: "box", position: [0, -0.2, 0], scale: [12, 0.4, 12] }] }) });
  const before = current.bundle;
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.commits.length, 1); assert.equal(current.job.harness.counters.writes, 1);
  const floor = Object.values(current.bundle.scene.entities).find(entity => entity.name === "広場の床");
  assert.ok(floor); assert.deepEqual(floor.components.find(component => component.type === "transform").scale, [12, 0.4, 12]);
  assert.ok(floor.components.some(component => component.type === "mesh"));
  for (const [id, entity] of Object.entries(before.scene.entities)) assert.equal(current.bundle.scene.entities[id], entity, "unrelated authoring data retains identity");
  assert.equal(current.job.progress.completed, 1); assert.equal(current.job.plan.objects[0].saved, true);
  assert.equal(current.job.harness.savedFingerprint, chatgptHarnessSceneFingerprint(current.bundle));
});

test("a failed actual Scene save preserves the committed result and never reports completion", async () => {
  const current = fixture({ plan: () => emptyPlan({ objects: [{ name: "保存待ちの床", shape: "box", position: [0, 0, 0], scale: [6, 0.5, 6] }] }), save(count) { if (count === 2) throw new Error("disk unavailable"); } });
  await assert.rejects(current.run(), /disk unavailable/);
  assert.equal(current.calls.commits.length, 1); assert.ok(Object.values(current.bundle.scene.entities).some(entity => entity.name === "保存待ちの床"));
  assert.equal(current.job.status, "failed"); assert.equal(current.job.harness.phase, "failed"); assert.equal(current.job.harness.dirty, true);
  assert.notEqual(current.job.harness.savedFingerprint, chatgptHarnessSceneFingerprint(current.bundle));
  assert.equal(current.job.progress.completed, 0); assert.equal(current.job.plan.objects[0].saved, false);
});

test("a failed final completion checkpoint closes the run as failed without publishing success", async () => {
  let rejected = false;
  const current = fixture({ flush(_count, api) { if (!rejected && api.job?.harness?.phase === "completed") { rejected = true; throw new Error("completion checkpoint unavailable"); } } });
  await assert.rejects(current.run(), /completion checkpoint unavailable/);
  assert.equal(rejected, true); assert.ok(current.calls.saves.length > 0);
  assert.equal(current.job.status, "failed"); assert.equal(current.job.harness.phase, "failed");
  assert.equal(current.job.harness.events.some(event => event.outcome === "completed"), false);
  assert.equal(current.calls.snapshots.some(job => job.status === "completed" || job.harness?.phase === "completed"), false);
});

test("hasMore continues in the same run and stops at the agreed production budget", async () => {
  const current = fixture({ plan: count => emptyPlan({ production: { ...direction, maxPasses: 3 }, hasMore: true, remainingWork: "入口を整える",
    objects: [{ name: `通路${count}`, shape: "plane", position: [count * 2, 0, 0], scale: [2, 1, 3] }] }) });
  await assert.rejects(current.run(), /上限|回数/);
  assert.equal(current.calls.plans.length, 3);
  assert.equal(new Set(current.calls.plans.map(args => args[4])).size, 1);
  assert.equal(current.job.harness.runId, "host-generation"); assert.equal(current.job.harness.counters.passes, 3); assert.equal(current.job.harness.counters.modelCalls, 3);
  assert.equal(current.job.status, "failed"); assert.equal(current.job.harness.phase, "failed");
  assert.equal(current.calls.reviews.length, 0, "unfinished production never pretends to pass the final review");
});

test("legacy hasMore plans stop after three saved passes without progress", async () => {
  const current = fixture({ plan: () => emptyPlan({ hasMore: true, remainingWork: "続く制作" }) });
  await assert.rejects(current.run(), error => {
    assert.equal(current.job.harness.reason, "stalled-progress", error.message);
    assert.match(error.message, /3回/); return true;
  });
  assert.equal(current.calls.plans.length, 3); assert.equal(current.job.harness.counters.passes, 3); assert.equal(current.job.harness.counters.modelCalls, 3);
  assert.equal(current.job.status, "failed"); assert.equal(current.job.harness.phase, "failed");
  assert.equal(current.calls.snapshots.some(job => job.status === "completed"), false);
});

test("repeated unchanged R3F plans stop after the initial actual Scene contribution", async () => {
  const source = 'export default function World(){return <group name="World"><mesh key="house" name="House"><boxGeometry args={[2,3,2]}/><meshStandardMaterial color="#c68c52"/></mesh></group>}';
  const current = fixture({ plan(_count, api) {
    const root = Object.values(api.bundle.scene.entities).find(entity => entity.codeAuthoring);
    return emptyPlan({ production: { ...direction, maxPasses: 6 }, hasMore: true, remainingWork: "入口の通りやすさを整える",
      operations: [{ kind: "r3f-scene", name: "街の家", source, ...(root ? { entityId: root.id } : {}) }] });
  } });
  await assert.rejects(current.run(), error => {
    assert.equal(current.job.harness.reason, "stalled-progress", error.message);
    assert.match(error.message, /3回/); return true;
  });
  assert.equal(current.calls.plans.length, 4, "one actual addition followed by three unchanged attempts");
  assert.equal(current.job.harness.reason, "stalled-progress");
  const root = Object.values(current.bundle.scene.entities).find(entity => entity.codeAuthoring);
  assert.equal(root.codeAuthoring.revision, 1, "identical source is already a no-op in the importer");
  assert.equal(root.codeAuthoring.source, source);
  assert.equal(current.calls.commits.length, 1, "unchanged source must not dirty the Editor or add undo entries");
  assert.equal(current.job.harness.savedFingerprint, chatgptHarnessSceneFingerprint(current.bundle));
  assert.deepEqual(current.job.harness.progress.observations.map(item => item.kind), ["changed", "unchanged", "repeated-plan", "repeated-plan"]);
});

const worldSource = size => `export default function World(){return <mesh key="ground" name="Ground"><boxGeometry args={[${size},0.2,${size}]}/><meshStandardMaterial color="#669955"/></mesh>}`;
const rejectedReview = () => ({ approved: false, summary: "入口に改善が必要です", remainingWork: "入口から中央への通路を広げる", criteria: direction.criteria.map(criterion => ({ criterion, passed: false, reason: "入口が狭いため歩行を確認できません" })) });

test("unchanged rejected R3F work reuses its failed inspection without recapture or inference", async () => {
  const current = fixture({ plan(_count, api) {
    const root = Object.values(api.bundle.scene.entities).find(entity => entity.codeAuthoring);
    return emptyPlan({ production: { ...direction, maxPasses: 6 }, operations: [{ kind: "r3f-scene", name: "公園", source: worldSource(10), ...(root ? { entityId: root.id } : {}) }] });
  }, review: rejectedReview });
  await assert.rejects(current.run(), /3回/);
  assert.equal(current.calls.plans.length, 4);
  assert.equal(current.calls.commits.length, 1);
  assert.equal(current.calls.captures.length, 1); assert.equal(current.calls.reviews.length, 1);
  assert.equal(current.job.harness.counters.modelCalls, 5);
  assert.equal(current.calls.snapshots.some(job => job.status === "completed"), false);
  assert.match(JSON.stringify(current.calls.plans[1][5].conversation), /入口から中央への通路を広げる/);
});

test("a changed source is photographed and reviewed again before completion", async () => {
  const current = fixture({ plan(count, api) {
    const root = Object.values(api.bundle.scene.entities).find(entity => entity.codeAuthoring);
    return emptyPlan({ production: direction, operations: [{ kind: "r3f-scene", name: "公園", source: worldSource(count === 1 ? 10 : 20), ...(root ? { entityId: root.id } : {}) }] });
  }, review: count => count === 1 ? rejectedReview() : undefined });
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.commits.length, 2);
  assert.equal(current.calls.captures.length, 2); assert.equal(current.calls.reviews.length, 2);
  assert.equal(current.job.harness.inspection.approved, true);
  assert.equal(current.job.harness.inspection.fingerprint, chatgptHarnessSceneFingerprint(current.bundle));
});

test("manual changes invalidate an unsuccessful inspection even with a no-op plan", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction }),
    review: count => count === 1 ? rejectedReview() : undefined,
    save(count, api) { if (count === 3) api.manualEdit("見直し後の手動編集"); } });
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.reviews.length, 2); assert.equal(current.calls.captures.length, 2);
  assert.notEqual(current.calls.reviews[0].fingerprint, current.calls.reviews[1].fingerprint);
  assert.equal(current.calls.reviews[1].fingerprint, chatgptHarnessSceneFingerprint(current.bundle));
});

test("an author's clarification requires a fresh review even for unchanged Scene data", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction }), review: count => count === 1 ? rejectedReview() : undefined });
  const pass = createChatgptAuthoringPass(current.host);
  const request = ["fixture-model", "広場全体を整えてください", options, "host-generation", "build", "current", undefined, undefined, undefined];
  const continuation = await pass(...request);
  assert.equal(continuation.retry.reason, "production");
  const result = await pass(...request, { ...continuation.retry, reason: "clarification",
    conversation: [...continuation.retry.conversation, { prompt: "入口の用途", result: "この入口は徒歩専用です" }] });
  assert.equal(result, current.project);
  assert.equal(current.calls.commits.length, 0);
  assert.equal(current.calls.reviews.length, 2); assert.equal(current.calls.captures.length, 2);
});

test("invalid later R3F source is rejected before earlier edits, objects or deletions", async () => {
  const current = fixture({ plan(_count, api) {
    const id = Object.values(api.bundle.scene.entities).find(entity => entity.name !== "SpawnPoint").id;
    return emptyPlan({ production: direction, edits: [{ entityId: id, name: "先に変更してはいけない" }],
      objects: [{ name: "先に追加してはいけない", shape: "box", position: [0, 0, 0], scale: [1, 1, 1] }],
      operations: [{ kind: "entity-delete", entityId: id }, { kind: "r3f-scene", name: "公園", source: 'export default function World(){return <mesh><boxGeometry args={[20,1,20]}/></mesh>}' }] });
  } });
  const before = current.bundle;
  await assert.rejects(current.run(), /自動で解決できなかった/);
  assert.equal(current.calls.plans.length, 3, "preflight failures use the bounded repair path");
  assert.equal(current.bundle, before); assert.equal(current.calls.commits.length, 0); assert.equal(current.calls.saves.length, 0);
  assert.equal(current.job.harness.counters.writes, 0);
});

test("a repaired R3F plan starts from the untouched original Scene", async () => {
  let initial;
  const current = fixture({ plan(count, api) {
    assert.equal(api.bundle, initial);
    return emptyPlan({ production: direction, operations: [{ kind: "r3f-scene", name: "公園", source: count === 1
      ? 'export default function World(){return <mesh><boxGeometry args={[20,1,20]}/></mesh>}' : worldSource(20) }] });
  } });
  initial = current.bundle;
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.plans.length, 2); assert.equal(current.calls.commits.length, 1);
  assert.equal(current.job.harness.counters.repairs, 1);
  assert.equal(current.job.status, "completed");
});

test("cancelling at R3F preflight leaves the Scene untouched", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction, operations: [{ kind: "r3f-scene", name: "公園", source: worldSource(20) }] }),
    flush(_count, api) { if (api.job?.progress.message.includes("Sceneを変更する前に")) { const control = api.host.chatgptControlsRef.current.get("host-generation"); if (control) control.cancelled = true; } } });
  const before = current.bundle;
  await assert.rejects(current.run(), /停止/);
  assert.equal(current.bundle, before); assert.equal(current.calls.commits.length, 0); assert.equal(current.calls.saves.length, 0);
  assert.equal(current.job.status, "cancelled", JSON.stringify({ error: current.job.error, progress: current.job.progress, harness: current.job.harness }));
});

test("a manual edit while saving is retained and only the fresh saved Scene can be reviewed", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction }), save(count, api) { if (count === 2) api.manualEdit(); } });
  assert.equal(await current.run(), current.project);
  const final = chatgptHarnessSceneFingerprint(current.bundle);
  assert.equal(current.calls.reviews.length, 1); assert.equal(current.calls.reviews[0].fingerprint, final);
  assert.equal(current.job.harness.savedFingerprint, final); assert.equal(current.job.harness.inspection.fingerprint, final);
  assert.equal(current.job.harness.inspection.approved, true); assert.equal(current.job.harness.counters.writes, 0);
  assert.ok(Object.values(current.bundle.scene.entities).some(entity => entity.name === "手動で変えたLight"));
});

test("an approved review for an earlier Scene cannot complete a later manual edit", async () => {
  const current = fixture({ plan: () => emptyPlan({ production: direction }), review(count, api) { if (count === 1) api.manualEdit("確認中の手動編集"); } });
  assert.equal(await current.run(), current.project);
  assert.equal(current.calls.plans.length, 2); assert.equal(current.calls.reviews.length, 2);
  assert.notEqual(current.calls.reviews[0].fingerprint, current.calls.reviews[1].fingerprint);
  assert.equal(current.job.harness.inspection.fingerprint, chatgptHarnessSceneFingerprint(current.bundle));
  assert.equal(current.job.harness.counters.passes, 2); assert.equal(current.job.harness.counters.repairs, 1);
});

test("cancel during native planning drains the request and prevents a late Scene writer", async () => {
  const started = deferred(); const release = deferred();
  const current = fixture({ async plan(_count, api) { started.resolve(); await release.promise; return emptyPlan({ edits: [{ entityId: Object.values(api.bundle.scene.entities)[0].id, name: "適用してはいけない変更" }] }); } });
  const task = current.run(); const rejection = assert.rejects(task, /停止/);
  await started.promise;
  current.host.chatgptControlsRef.current.get("host-generation").cancelled = true;
  const harness = current.host.chatgptHarnessRunsRef.current.get("host-generation"); let stopped = false;
  const stopping = harness.stop("user").then(() => { stopped = true; });
  await tick(); assert.equal(stopped, false); assert.equal(harness.snapshot().phase, "stopping");
  release.resolve(); await rejection; await stopping;
  assert.equal(current.calls.commits.length, 0); assert.equal(current.calls.saves.length, 0); assert.equal(current.job.status, "cancelled"); assert.equal(current.job.harness.phase, "cancelled");
  assert.equal(current.host.chatgptGenerationRef.current, null); assert.ok(current.calls.cancels.includes("host-generation"));
});
