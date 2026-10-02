import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { createPrototypeProject } = await server.ssrLoadModule('/src/lib/visual-editor/prototype-project.ts');
const { bundleHash } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-project.ts');
const { studioToolData, parseSnapshotStudioResult, resultSnapshot, studioSnapshotContext } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-snapshot.ts');

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
