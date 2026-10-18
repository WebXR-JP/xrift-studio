import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/vite-world-authoring-test', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { authoringFingerprint, authoringStatus, authoringTerminalReason, beginAuthoringWrite, finishAuthoringWrite, isAuthoringWriteTool,
  changeAuthoringState, readAuthoringState, parseAuthoringBudget, observeAuthoringScene, hasAuthoringRunOwner } = await server.ssrLoadModule('/src/lib/visual-editor/world-authoring.ts');
const { checkAuthoringEvidence } = await server.ssrLoadModule('/src/lib/visual-editor/authoring-evidence.ts');
const { acquireAuthoringProjectWrite } = await server.ssrLoadModule('/src/lib/visual-editor/world-authoring-native.ts');
const { authoringActionFingerprint } = await server.ssrLoadModule('/src/lib/visual-editor/authoring-action.ts');
const { authoringSceneProgressFingerprint } = await server.ssrLoadModule('/src/lib/visual-editor/authoring-scene-progress.ts');
const { isR3fSceneAuthoring } = await server.ssrLoadModule('/src/lib/visual-editor/r3f-scene-source.ts');

const begin = (budget, savedFingerprint = 'scene-a') => changeAuthoringState(null, 'begin_world_authoring', {
  blueprint: 'A courtyard with a tree visible from the entrance.', criteria: ['Tree visible', 'Within budget'],
  ...(budget ? { budget } : {}),
}, 'scene-a', { savedFingerprint });
const capture = (state, view, fingerprint = 'scene-a') => changeAuthoringState(state, 'capture_scene_view', {
  authoringView: view, path: `/captures/${view}.png`,
}, fingerprint);
const review = (state, criterion, passed = true) => changeAuthoringState(state, 'review_world_authoring', {
  criterion, passed, reason: 'Both views show the tree; measured metrics are within the blueprint budget.',
  captureIds: [state.captures.spawn.id, state.captures.iso.id],
}, 'scene-a');

test('goals and review state survive JSON persistence and reconnection', () => {
  const state = readAuthoringState(JSON.parse(JSON.stringify(begin())));
  assert.equal(state.blueprint, begin().blueprint);
  assert.deepEqual(authoringStatus(state, 'scene-a').missingViews, ['spawn', 'iso']);
  assert.throws(() => changeAuthoringState(state, 'begin_world_authoring', {}, 'scene-a'), /保存済み/);
});

test('completion requires both current views and every successful review', () => {
  let state = begin();
  assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a'), /未確認/);
  state = capture(capture(state, 'spawn'), 'iso');
  state = review(state, 'Tree visible');
  state = review(state, 'Within budget', false);
  assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a'), /Within budget/);
  state = review(state, 'Within budget');
  state = changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a');
  assert.equal(authoringStatus(state, 'scene-a').completed, true);
  const resumed = readAuthoringState(JSON.parse(JSON.stringify(state)));
  assert.equal(authoringStatus(resumed, 'scene-b').completed, false);
  assert.deepEqual(authoringStatus(resumed, 'scene-b').uncheckedCriteria, state.criteria);
});

test('recapturing invalidates reviews even when scene content stays the same', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  const oldIds = [state.captures.spawn.id, state.captures.iso.id];
  state = capture(state, 'spawn');
  assert.equal(authoringStatus(state, 'scene-a').uncheckedCriteria.length, 2);
  assert.throws(() => changeAuthoringState(state, 'review_world_authoring', {
    criterion: 'Tree visible', passed: true, reason: 'ok', captureIds: oldIds,
  }, 'scene-a'), /最新/);
});

test('each changed Scene counts once when both views arrive, while reframing keeps the budget and invalidates approval', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  assert.equal(state.run.passes, 1);
  for (const view of ['spawn', 'iso', 'iso', 'spawn']) state = capture(state, view);
  assert.equal(state.run.passes, 1); assert.equal(state.run.noProgress, 0);
  assert.equal(authoringStatus(state, 'scene-a').uncheckedCriteria.length, 2);
  state = capture(state, 'spawn', 'scene-b');
  assert.equal(state.run.passes, 1);
  state = capture(state, 'iso', 'scene-b');
  assert.equal(state.run.passes, 2);
  state = readAuthoringState(JSON.parse(JSON.stringify(state)));
  state = capture(capture(state, 'spawn', 'scene-b'), 'iso', 'scene-b');
  assert.equal(state.run.passes, 2);
  state = capture(capture(state, 'spawn'), 'iso');
  assert.equal(state.run.passes, 3, 'returning to an older Scene is another changed inspection');
});

test('read-only capture cannot erase stalled write progress or consume a second pass by reframing', () => {
  let state = begin({ maxPasses: 1 });
  for (const id of ['noop-1', 'noop-2']) {
    state = beginAuthoringWrite(state, 'update_transform', id, 'scene-a');
    state = finishAuthoringWrite(state, 'update_transform', id, 'scene-a', true);
  }
  assert.equal(state.run.noProgress, 2);
  state = capture(capture(state, 'spawn'), 'iso');
  assert.equal(state.run.noProgress, 2); assert.equal(state.run.passes, 1);
  state = capture(capture(state, 'spawn'), 'iso');
  assert.equal(state.run.noProgress, 2); assert.equal(state.run.passes, 1);
  state = review(review(state, 'Tree visible'), 'Within budget');
  assert.equal(authoringStatus(state, 'scene-a').canComplete, true);
  assert.equal(authoringStatus(state, 'scene-a').writeAdmission, false);
});

test('malformed goals, views, reviews and stored state fail explicitly', () => {
  assert.throws(() => readAuthoringState({ version: 99 }), /形式/);
  assert.throws(() => changeAuthoringState(null, 'begin_world_authoring', { blueprint: 'x', criteria: ['x', 'x'] }, 'a'));
  assert.throws(() => capture(begin(), 'fake'));
  assert.throws(() => changeAuthoringState(begin(), 'review_world_authoring', {
    criterion: 'Tree visible', passed: true, reason: 'without images', captureIds: [],
  }, 'scene-a'));
});

test('content fingerprints survive restart and change with scene content', async () => {
  const scene = { entities: { tree: { position: [0, 0, 0] } } };
  assert.equal(await authoringFingerprint(scene), await authoringFingerprint(JSON.parse(JSON.stringify(scene))));
  assert.notEqual(await authoringFingerprint(scene), await authoringFingerprint({ entities: {} }));
  assert.equal(await authoringFingerprint({ a: 1, b: { x: 2, y: 3 } }),
    await authoringFingerprint({ b: { y: 3, x: 2 }, a: 1 }));
  assert.equal(await authoringFingerprint({ color: 0.1 + 0.2 }), await authoringFingerprint({ color: 0.3 }));
  assert.notEqual(await authoringFingerprint({ position: 1e-9 }), await authoringFingerprint({ position: 2e-9 }));
});

test('ChatGPT and MCP share the exact saved, observed and approved completion gate', () => {
  const evidence = { currentFingerprint: 'b', savedFingerprint: 'b', requiredViews: ['spawn', 'iso'], captures: [{ view: 'spawn', fingerprint: 'b' }, { view: 'iso', fingerprint: 'b' }], review: { fingerprint: 'b', approved: true } };
  assert.equal(checkAuthoringEvidence(evidence).complete, true);
  for (const patch of [{ savedFingerprint: 'a' }, { pendingWrites: true }, { captures: evidence.captures.slice(0, 1) }, { review: { fingerprint: 'a', approved: true } }, { review: { fingerprint: 'b', approved: false } }, { review: undefined }]) {
    const result = checkAuthoringEvidence({ ...evidence, ...patch });
    assert.equal(result.complete, false);
    assert.ok(result.reasons.length);
  }
});

test('a finite run freezes budgets and preserves cumulative write admission across JSON reload', () => {
  assert.deepEqual(parseAuthoringBudget(), { maxWrites: 256, maxPasses: 8, maxNoProgress: 3, maxConsecutiveFailures: 3, maxElapsedMs: 900000 });
  for (const budget of [{ maxWrites: 0 }, { maxPasses: 33 }, { maxNoProgress: NaN }, { maxElapsedMs: 3600001 }, { modelCalls: 5 }, { constructor: 1 }]) assert.throws(() => parseAuthoringBudget(budget));
  let state = begin({ maxWrites: 2 });
  state = beginAuthoringWrite(state, 'update_transform', 'write-1', 'scene-a');
  assert.equal(state.run.writes, 1);
  assert.throws(() => beginAuthoringWrite(state, 'update_transform', 'overlap', 'scene-a'), /別の制作操作/);
  state = finishAuthoringWrite(state, 'update_transform', 'write-1', 'scene-b', true);
  state = readAuthoringState(JSON.parse(JSON.stringify(state)));
  state = beginAuthoringWrite(state, 'update_transform', 'write-2', 'scene-b');
  state = finishAuthoringWrite(state, 'update_transform', 'write-2', 'scene-c', true);
  assert.equal(state.run.writes, 2);
  assert.equal(authoringTerminalReason(state), 'write-limit');
  assert.equal(authoringStatus(state, 'scene-c').writeAdmission, false);
  assert.throws(() => beginAuthoringWrite(state, 'update_transform', 'write-3', 'scene-c'), /上限/);
  state = capture(capture(state, 'spawn', 'scene-c'), 'iso', 'scene-c');
  assert.equal(state.captures.iso.fingerprint, 'scene-c', 'read/capture remain possible after write admission stops');
  assert.deepEqual(state.run.journal.slice(0, 5).map(event => event.kind), ['begin', 'write-start', 'write-changed', 'write-start', 'write-changed']);
});

test('failed attempts and no-op writes consume request-wide budgets without inventing model calls', () => {
  let state = begin({ maxConsecutiveFailures: 2, maxNoProgress: 6 });
  for (let index = 0; index < 2; index++) {
    state = beginAuthoringWrite(state, 'update_component', `failed-${index}`, 'scene-a');
    state = finishAuthoringWrite(state, 'update_component', `failed-${index}`, 'scene-a', false, 'unsupported property');
  }
  assert.equal(state.run.writes, 2);
  assert.equal(authoringTerminalReason(state), 'failure-limit');
  assert.equal(state.run.journal.at(-1).kind, 'write-failed');
  assert.equal('modelCalls' in state.run, false);
  let noProgress = begin({ maxNoProgress: 2 });
  for (let index = 0; index < 2; index++) {
    noProgress = beginAuthoringWrite(noProgress, 'update_transform', `noop-${index}`, 'scene-a');
    noProgress = finishAuthoringWrite(noProgress, 'update_transform', `noop-${index}`, 'scene-a', true);
  }
  assert.equal(authoringTerminalReason(noProgress), 'no-progress');
});

test('elapsed and inspection limits persist, and completion is still allowed on the final permitted pass', () => {
  const expired = begin({ maxElapsedMs: 1000 });
  expired.run.startedAt = new Date(Date.now() - 1001).toISOString();
  assert.equal(authoringTerminalReason(expired), 'elapsed-limit');
  assert.throws(() => beginAuthoringWrite(expired, 'create_primitive', 'late', 'scene-a'), /時間/);
  let state = capture(capture(begin({ maxPasses: 1 }), 'spawn'), 'iso');
  assert.equal(authoringTerminalReason(state), 'pass-limit');
  state = review(review(state, 'Tree visible'), 'Within budget');
  assert.equal(authoringStatus(state, 'scene-a').canComplete, true);
  state = changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a');
  assert.equal(state.run.terminalReason, 'completed');
});

test('dirty saving state and interrupted writers cannot reuse visual approval as completion', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  for (const options of [{ savedFingerprint: null }, { savedFingerprint: 'old' }, { pendingWrites: true }]) {
    const status = authoringStatus(state, 'scene-a', options);
    assert.equal(status.canComplete, false);
    assert.ok(status.reasons.some(reason => reason.includes('保存') || reason.includes('処理')));
    assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a', options), /保存待ち/);
  }
  const pending = beginAuthoringWrite(state, 'update_transform', 'interrupted-request', 'scene-a');
  assert.equal(authoringStatus(readAuthoringState(JSON.parse(JSON.stringify(pending))), 'scene-a').canComplete, false);
});

test('cancellation invalidates capture and review evidence and late outcomes cannot restart a run', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  state = beginAuthoringWrite(state, 'update_transform', 'late-request', 'scene-a');
  state = changeAuthoringState(state, 'cancel_world_authoring', {}, 'scene-a');
  state = finishAuthoringWrite(state, 'update_transform', 'late-request', 'scene-b', true);
  assert.equal(state.run.terminalReason, 'cancelled');
  assert.deepEqual(state.captures, {});
  assert.deepEqual(state.reviews, {});
  assert.equal(authoringStatus(state, 'scene-b').completed, false);
  assert.throws(() => beginAuthoringWrite(state, 'create_primitive', 'next', 'scene-b'), /停止/);
  assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-b'), /停止/);
});

test('manual Scene changes invalidate completion without counting a model call or an MCP write', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  state = changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a');
  const next = observeAuthoringScene(state, 'get_editor_context', 'scene-b');
  assert.equal(next.completedFingerprint, null);
  assert.equal(next.run.writes, state.run.writes);
  assert.equal(next.run.journal.at(-1).kind, 'scene-changed');
  assert.equal(authoringStatus(next, 'scene-b').canComplete, false);
  assert.equal(isAuthoringWriteTool('update_transform'), true);
  assert.equal(isAuthoringWriteTool('install_external_asset'), true);
  for (const name of ['capture_scene_view', 'get_entity_components', 'validate_interactivity_asset', 'set_play_mode', 'begin_world_authoring', 'not-a-tool']) assert.equal(isAuthoringWriteTool(name), false, name);
});

test('typed journals reject corrupted runtime records and legacy histories require fresh completion evidence', () => {
  const state = begin();
  for (const change of [next => delete next.run.budget, next => delete next.run.budget.maxWrites, next => next.run.budget.maxWrites = 0, next => next.run.writes = -1, next => next.run.terminalReason = 'unknown', next => next.run.journal[0].kind = 'execute-code', next => next.captures.extra = {}]) {
    const next = structuredClone(state); change(next); assert.throws(() => readAuthoringState(next));
  }
  const legacy = structuredClone(state); delete legacy.run; delete legacy.savedFingerprint;
  assert.ok(readAuthoringState(legacy));
  assert.equal(authoringStatus(legacy, 'scene-a').canComplete, false);
});

test('project-surface file generation acquires and settles the same run exactly once', async () => {
  let state = begin({ maxWrites: 1 }), writes = 0;
  const journal = { read: async () => structuredClone(state), write: async (_path, _scene, sequence, next) => {
    assert.equal(state.sequence, sequence); state = structuredClone(next); writes++;
  } };
  const options = { projectPath: 'isolated-project', sceneId: 'scene', requestId: 'project-model', tool: 'create_blender_model', bundle: { assets: {} }, journal, checkCurrent() {} };
  const lease = await acquireAuthoringProjectWrite(options);
  assert.ok(lease);
  assert.equal(state.run.writes, 1);
  assert.equal(state.run.pendingWrite.requestId, options.requestId);
  await lease.finish({ assets: { model: 'new' } }, true);
  await lease.finish({ assets: { model: 'new' } }, true);
  assert.equal(writes, 2, 'one reservation and one settlement only');
  assert.equal(state.run.pendingWrite, undefined);
  assert.equal(state.run.journal.at(-1).kind, 'write-changed');
  await assert.rejects(acquireAuthoringProjectWrite({ ...options, requestId: 'over-budget' }), /上限/);
  assert.equal(writes, 2, 'a rejected native creation cannot reserve or create files');
});

test('a project tool cannot settle a replacement run or write after a stale-revision check', async () => {
  let state = begin(), calls = 0;
  const journal = { read: async () => structuredClone(state), write: async (_path, _scene, _sequence, next) => { state = structuredClone(next); calls++; } };
  const options = { projectPath: 'isolated-project', sceneId: 'scene', requestId: 'project-model', tool: 'create_blender_model', bundle: {}, journal, checkCurrent() {} };
  await assert.rejects(acquireAuthoringProjectWrite({ ...options, checkCurrent() { throw new Error('stale revision'); } }), /stale/);
  assert.equal(calls, 0);
  const lease = await acquireAuthoringProjectWrite(options);
  state = changeAuthoringState(state, 'begin_world_authoring', { blueprint: 'explicit different request', criteria: ['new criterion'], replaceExisting: true }, 'scene-a', { savedFingerprint: 'scene-a' });
  const before = JSON.stringify(state);
  await lease.finish({ changed: true }, true);
  assert.equal(JSON.stringify(state), before);
});

test('MCP active ownership excludes a second ChatGPT run until completion or cancellation', () => {
  assert.equal(hasAuthoringRunOwner(null), false);
  const active = begin();
  assert.equal(hasAuthoringRunOwner(active), true);
  active.run.terminalReason = 'write-limit';
  assert.equal(hasAuthoringRunOwner(active), true, 'a new model run cannot evade the same request budget');
  const stopped = changeAuthoringState(active, 'cancel_world_authoring', {}, 'scene-a');
  assert.equal(hasAuthoringRunOwner(stopped), false);
  const legacyCompleted = structuredClone(active); delete legacyCompleted.run; legacyCompleted.completedFingerprint = 'previously-completed-scene';
  assert.equal(hasAuthoringRunOwner(legacyCompleted), false, 'an old completed world does not hold new ChatGPT authoring forever');
  legacyCompleted.completedFingerprint = null;
  assert.equal(hasAuthoringRunOwner(legacyCompleted), false, 'an old unbounded blueprint has no live writer lease; an explicit begin creates one');
});

test('operation identity retains full authored arguments while excluding transport revisions', () => {
  const first = authoringActionFingerprint('update_transform', { projectId: 'project', sceneId: 'scene', expectedRevision: 1, entityId: 'house', position: [1, 2, 3] });
  const reordered = authoringActionFingerprint('update_transform', { position: [1, 2, 3], expectedRevision: 8, entityId: 'house', sceneId: 'scene', projectId: 'project' });
  assert.equal(first, reordered);
  assert.notEqual(first, authoringActionFingerprint('update_transform', { entityId: 'house', position: [1, 2, 4] }));
  assert.notEqual(first, authoringActionFingerprint('rename_entity', { entityId: 'house', position: [1, 2, 3] }));
});

test('MCP detects reversing authored changes across reloads rather than counting every reversal as progress', () => {
  let state = begin(), before = 'scene-a';
  for (const [index, after] of ['scene-b', 'scene-a', 'scene-b', 'scene-a'].entries()) {
    state = beginAuthoringWrite(state, 'update_transform', `cycle-${index}`, before, { entityId: 'house', position: [index % 2, 0, 0], expectedRevision: index });
    state = finishAuthoringWrite(state, 'update_transform', `cycle-${index}`, after, true);
    state = readAuthoringState(JSON.parse(JSON.stringify(state))); before = after;
  }
  assert.equal(state.run.writes, 4); assert.equal(state.run.noProgress, 3);
  assert.equal(state.run.progress.observations.at(-1).kind, 'cycle');
  assert.equal(authoringTerminalReason(state), 'no-progress');
  assert.throws(() => beginAuthoringWrite(state, 'update_transform', 'extra', before), /停止/);
  assert.doesNotMatch(JSON.stringify(state.run.progress), /entityId|position|expectedRevision/);
});

test('new Scene results and independent manual changes do not trigger a false repetition stop', () => {
  let state = begin(), before = 'scene-a';
  for (let index = 0; index < 5; index++) {
    const after = `novel-${index}`;
    state = beginAuthoringWrite(state, 'create_primitive', `new-${index}`, before, { shape: 'box' });
    state = finishAuthoringWrite(state, 'create_primitive', `new-${index}`, after, true); before = after;
  }
  assert.equal(state.run.noProgress, 0); assert.equal(authoringTerminalReason(state), null);
  state = observeAuthoringScene(state, 'get_editor_context', 'manual-change');
  state = beginAuthoringWrite(state, 'update_transform', 'after-manual', 'manual-change', { position: [1, 0, 0] });
  state = finishAuthoringWrite(state, 'update_transform', 'after-manual', 'scene-a', true);
  assert.equal(state.run.progress.observations.at(-1).kind, 'changed');
  assert.equal(state.run.noProgress, 0);
});

test('derived asset thumbnails do not create authored progress or invalidate matching world evidence', async () => {
  const { createChatgptScaffold } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-generation.ts');
  const bundle = createChatgptScaffold({ title: 'isolated', description: 'test', objects: [] }, 'isolated');
  const before = await authoringFingerprint(bundle), next = structuredClone(bundle);
  for (const asset of Object.values(next.assets.assets)) asset.thumbnail = 'derived-only-thumbnail';
  assert.equal(await authoringFingerprint(next), before);
  const id = Object.keys(next.scene.entities)[0]; next.scene.entities[id].name = 'real authored change';
  assert.notEqual(await authoringFingerprint(next), before);
});

async function codeAuthoredFixture() {
  const { createChatgptScaffold } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-generation.ts');
  const bundle = createChatgptScaffold({ title: 'isolated', description: 'test', objects: [] }, 'isolated');
  const entity = Object.values(bundle.scene.entities)[0];
  entity.components.push({ id: 'authored-mesh', type: 'mesh', enabled: true, geometryAssetId: 'builtin:box',
    geometry: { kind: 'builtin-primitive', creationId: 'builtin:box', primitive: 'box' },
    materialBindings: [{ slot: 0, materialAssetId: 'paint' }], castShadow: true, receiveShadow: true });
  bundle.assets.assets.paint = { id: 'paint', kind: 'material', name: 'Paint', properties: { color: '#aabbcc', roughness: 0.5 } };
  entity.codeAuthoring = { version: 1, source: '<mesh><boxGeometry /></mesh>', originalPrompt: 'A box', revision: 1,
    nodes: { box: { entityId: entity.id, baseline: JSON.stringify(entity) } }, materials: { paint: JSON.stringify(bundle.assets.assets.paint) } };
  assert.equal(isR3fSceneAuthoring(entity.codeAuthoring), true);
  return { bundle, id: entity.id };
}

test('R3F bookkeeping cannot disguise a stall while source, geometry, material and manual edits remain progress', async () => {
  const { bundle, id } = await codeAuthoredFixture();
  const exact = await authoringFingerprint(bundle), progress = authoringSceneProgressFingerprint(bundle);
  const metadataOnly = structuredClone(bundle), authored = metadataOnly.scene.entities[id].codeAuthoring;
  authored.revision++; authored.originalPrompt = 'Same Scene in another pass';
  authored.nodes.box.baseline = JSON.stringify({ id, components: [], children: [], name: 'new baseline' });
  authored.materials.paint = JSON.stringify({ roughness: 0.8 });
  assert.equal(isR3fSceneAuthoring(authored), true);
  assert.equal(authoringSceneProgressFingerprint(metadataOnly), progress);
  const exactAfter = await authoringFingerprint(metadataOnly);
  assert.notEqual(exactAfter, exact, 'save and inspection evidence still identifies the complete authored Scene');
  assert.equal(checkAuthoringEvidence({ currentFingerprint: exactAfter, savedFingerprint: exact,
    requiredViews: ['spawn', 'iso'], captures: [{ view: 'spawn', fingerprint: exact }, { view: 'iso', fingerprint: exact }],
    review: { approved: true, fingerprint: exact } }).complete, false);
  for (const mutate of [
    value => { value.scene.entities[id].codeAuthoring.source = '<mesh><sphereGeometry /></mesh>'; },
    value => { value.scene.entities[id].components.find(component => component.type === 'mesh').geometry.primitive = 'sphere'; },
    value => { value.assets.assets.paint.properties.roughness = 0.7; },
    value => { value.scene.entities[id].components.find(component => component.type === 'transform').position[0] = 3; },
    value => { value.scene.entities[id].name = 'Manual edit'; },
    value => { value.scene.entities[id].codeAuthoring.revision = 0; },
  ]) {
    const changed = structuredClone(bundle); mutate(changed);
    assert.notEqual(authoringSceneProgressFingerprint(changed), progress, 'only validated reconciliation bookkeeping is excluded');
  }
  const reordered = JSON.parse(JSON.stringify(bundle, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(authoringSceneProgressFingerprint(reordered), progress);
});

test('project writers persist semantic R3F stalls across reloads while retaining exact write receipts', async () => {
  const { bundle, id } = await codeAuthoredFixture();
  let state = begin(), current = bundle;
  const journal = { read: async () => JSON.parse(JSON.stringify(state)), write: async (_path, _scene, sequence, next) => {
    assert.equal(sequence, state.sequence); state = JSON.parse(JSON.stringify(next));
  } };
  const options = { projectPath: 'isolated-project', sceneId: 'scene', tool: 'create_blender_model', journal, checkCurrent() {} };
  for (let index = 0; index < 3; index++) {
    const lease = await acquireAuthoringProjectWrite({ ...options, requestId: `bookkeeping-${index}`, bundle: current });
    const next = structuredClone(current); next.scene.entities[id].codeAuthoring.revision++;
    await lease.finish(next, true); current = next;
    assert.equal(state.run.noProgress, index + 1);
    assert.equal(state.run.journal.at(-1).kind, 'write-changed', 'the exact authored receipt still records the revision change');
    assert.equal(state.activity.fingerprint, await authoringFingerprint(current));
  }
  assert.equal(state.run.progress.observations.at(-1).kind, 'repeated-plan');
  assert.equal(authoringTerminalReason(state), 'no-progress');
  await assert.rejects(acquireAuthoringProjectWrite({ ...options, requestId: 'stop', bundle: current }), /停止/);
  const invalid = structuredClone(state);
  invalid.run.pendingWrite = { requestId: 'invalid', fingerprint: 'exact', progressFingerprint: '' };
  assert.throws(() => readAuthoringState(invalid), /形式/);
});
