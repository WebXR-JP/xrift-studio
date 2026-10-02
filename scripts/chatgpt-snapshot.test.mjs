import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { createPrototypeProject } = await server.ssrLoadModule('/src/lib/visual-editor/prototype-project.ts');
const { bundleHash } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-project.ts');
const { studioToolData, parseSnapshotStudioResult, resultSnapshot, studioSnapshotContext } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-snapshot.ts');
const { prepareStableEditorSnapshot } = await server.ssrLoadModule('/src/lib/visual-editor/studio-snapshot-barrier.ts');

async function fixture() {
  const bundle = JSON.parse(JSON.stringify(createPrototypeProject('world', 'metadata-delivery-regression')));
  const hash = await bundleHash(bundle);
  const summary = { snapshotId: 'snapshot-metadata-test', projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId,
    revision: 2, operationId: 'operation-metadata-test', baseHash: null, hash, delivery: { hash }, expiresAt: Date.now() + 86400000 };
  return { bundle, summary, envelope: { structuredContent: summary, _meta: { xriftStudio: { ...summary, bundle } } } };
}

test('app metadata restores the exact document while the model sees only a short reference', async () => {
  const { bundle, summary, envelope } = await fixture();
  assert.equal('bundle' in envelope.structuredContent, false);
  const result = await parseSnapshotStudioResult(studioToolData(envelope));
  assert.deepEqual(result.bundle, bundle);
  assert.deepEqual(resultSnapshot(result), { snapshotId: summary.snapshotId, projectId: summary.projectId, revision: 2, hash: summary.hash, expiresAt: summary.expiresAt });
  const context = studioSnapshotContext({ projectId: summary.projectId, sceneId: summary.sceneId, revision: 8, hash: summary.hash }, resultSnapshot(result));
  assert.equal(context.snapshotId, summary.snapshotId);
  assert.equal(context.revision, summary.revision);
  assert.equal(context.canEditProject, true);
  assert.equal('bundle' in context, false);
  assert.equal('studioHistory' in context, false);
});

test('metadata and summary conflicts or missing metadata never reuse legacy or unrelated documents', async () => {
  const { bundle, summary, envelope } = await fixture();
  for (const [field, value] of Object.entries({ snapshotId: 'snapshot-other', projectId: 'project-other', sceneId: 'scene-other', revision: 3, operationId: 'operation-other', baseHash: 'a'.repeat(64), hash: 'b'.repeat(64), expiresAt: summary.expiresAt + 1 })) {
    assert.throws(() => studioToolData({ ...envelope, structuredContent: { ...summary, [field]: value } }), /一致/, field);
  }
  assert.throws(() => studioToolData({ ...envelope, structuredContent: { ...summary, delivery: { hash: '0'.repeat(64) } } }), /一致/);
  assert.throws(() => studioToolData({ structuredContent: summary }), /受信できません/);
  assert.throws(() => studioToolData({ structuredContent: { ...summary, bundle }, _meta: { xriftStudio: null } }), /不正/);
  assert.throws(() => studioToolData({ structuredContent: { ...summary, bundle }, _meta: { xriftStudio: {} } }), /不正/);
  await assert.rejects(parseSnapshotStudioResult({ ...summary, bundle, hash: '0'.repeat(64), delivery: { hash: '0'.repeat(64) } }), /ハッシュ/);
  await assert.rejects(parseSnapshotStudioResult({ ...summary, bundle, snapshotId: '' }), /不正/);
  await assert.rejects(parseSnapshotStudioResult({ ...summary, bundle, expiresAt: 'tomorrow' }), /不正/);
});

test('old structuredContent documents still work but do not invent snapshot references', async () => {
  const { bundle } = await fixture();
  const legacy = { bundle, revision: 0, baseHash: null, operationId: 'legacy-operation' };
  const parsed = await parseSnapshotStudioResult(studioToolData({ structuredContent: legacy }));
  assert.deepEqual(parsed.bundle, bundle);
  assert.equal(parsed.operationId, legacy.operationId);
  assert.equal(resultSnapshot(parsed), undefined);
});

test('passive manual edits, project changes and expiry expose freshness without documents or usable stale IDs', async () => {
  const { summary } = await fixture();
  const snapshot = { snapshotId: summary.snapshotId, projectId: summary.projectId, revision: summary.revision, hash: summary.hash, expiresAt: summary.expiresAt };
  const active = { projectId: summary.projectId, sceneId: summary.sceneId, revision: 3, hash: summary.hash };
  for (const context of [
    studioSnapshotContext(active),
    studioSnapshotContext({ ...active, hash: '0'.repeat(64) }, snapshot),
    studioSnapshotContext({ ...active, projectId: 'another-project' }, snapshot),
    studioSnapshotContext(active, snapshot, snapshot.expiresAt),
  ]) {
    assert.equal(context.canEditProject, false);
    assert.equal(context.snapshotRequired, true);
    assert.equal('snapshotId' in context, false);
    assert.equal('bundle' in context, false);
  }
  assert.equal(studioSnapshotContext({ ...active, hash: '0'.repeat(64) }, snapshot).manualChanges, true);
  assert.equal(studioSnapshotContext(active, snapshot, snapshot.expiresAt).expiredSnapshotId, snapshot.snapshotId);
  assert.deepEqual(studioSnapshotContext(null), { projectId: null, sceneId: null, canEditProject: false, snapshotRequired: false });
});

test('snapshot preparation includes all derived updates through the final queue rescan before saving', async () => {
  let bundle = { thumbnails: [] };
  let phase = 0;
  const saved = [];
  await prepareStableEditorSnapshot({
    currentBundle: () => bundle,
    backgroundPending: () => phase < 4,
    stillCurrent: () => true,
    saveNow: async () => { saved.push(bundle); return 'project-path'; },
  }, { now: () => phase, timeoutMs: 10, wait: async () => {
    assert.equal(saved.length, 0, 'Debounce, render, commit and rescan must all precede the save');
    phase += 1;
    if (phase === 2) bundle = { thumbnails: ['material-thumbnail'] };
    if (phase === 3) bundle = { thumbnails: [...bundle.thumbnails, 'model-thumbnail'] };
  } });
  assert.equal(phase, 4);
  assert.deepEqual(saved, [{ thumbnails: ['material-thumbnail', 'model-thumbnail'] }]);
});

test('snapshot preparation rechecks document changes and background work that begin during autosave', async () => {
  let bundle = { revision: 0 };
  let pending = false;
  let saves = 0;
  let ticks = 0;
  await prepareStableEditorSnapshot({
    currentBundle: () => bundle,
    backgroundPending: () => pending,
    stillCurrent: () => true,
    saveNow: async () => {
      saves += 1;
      if (saves === 1) { bundle = { revision: 1 }; pending = true; }
      return 'project-path';
    },
  }, { now: () => ticks, timeoutMs: 10, wait: async () => { ticks += 1; pending = false; } });
  assert.equal(saves, 2);
  assert.equal(bundle.revision, 1);
});

test('stuck thumbnail work has a bounded preparation deadline and never reaches saving or upload', async () => {
  let time = 0;
  await assert.rejects(prepareStableEditorSnapshot({
    currentBundle: () => ({}), backgroundPending: () => true, stillCurrent: () => true,
    saveNow: async () => assert.fail('Cannot save a prepared snapshot before background jobs settle'),
  }, { timeoutMs: 30, now: () => time, wait: async () => { time += 10; } }), /編集データの準備が時間内/);
  assert.equal(time, 30);
});

test('snapshot preparation bounds a hung autosave and safely ignores its late completion', { timeout: 1000 }, async () => {
  const bundle = {};
  let finishSave;
  const save = new Promise(resolve => { finishSave = resolve; });
  let prepared = false;
  const preparation = prepareStableEditorSnapshot({
    currentBundle: () => bundle, backgroundPending: () => false, stillCurrent: () => true,
    saveNow: () => save,
  }, { timeoutMs: 10 }).then(() => { prepared = true; });
  await assert.rejects(preparation, /編集データの準備が時間内/);
  finishSave('project-path');
  await save;
  await Promise.resolve();
  assert.equal(prepared, false, 'A late local save must never continue to upload');
});

test('the injected deadline is rechecked after a save resolves', async () => {
  const bundle = {};
  let time = 0;
  await assert.rejects(prepareStableEditorSnapshot({
    currentBundle: () => bundle, backgroundPending: () => false, stillCurrent: () => true,
    saveNow: async () => { time = 31; return 'project-path'; },
  }, { timeoutMs: 30, now: () => time }), /編集データの準備が時間内/);
});

test('snapshot preparation rejects session changes before and during saving and preserves save errors', async () => {
  const bundle = {};
  const editor = { currentBundle: () => bundle, backgroundPending: () => false,
    stillCurrent: () => false, saveNow: async () => assert.fail('A changed session must not be saved') };
  await assert.rejects(prepareStableEditorSnapshot(editor), /切り替わり/);
  let current = true;
  await assert.rejects(prepareStableEditorSnapshot({ ...editor, stillCurrent: () => current,
    saveNow: async () => { current = false; return 'project-path'; } }), /切り替わり/);
  await assert.rejects(prepareStableEditorSnapshot({ ...editor, stillCurrent: () => true,
    saveNow: async () => undefined }), /保存できません/);
});
