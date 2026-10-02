import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { createSnapshotSqliteDatabase } from './fixtures/snapshot-sqlite.mjs';

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { createSnapshotStore, SNAPSHOT_LIMITS } = await server.ssrLoadModule('/packages/xrift-studio-cloud/snapshot-store.ts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function result(projectId = 'project-one', revision = 0, baseHash = null, operationId = `operation-${revision}`, extra = {}) {
  const bundle = { project: { projectId }, scene: { sceneId: 'scene-one', entities: { box: { color: operationId } } }, assets: {}, prefabs: {} };
  return { bundle, projectId, sceneId: 'scene-one', revision, hash: hash(bundle), baseHash, operationId, results: [{ ok: true }], refs: { box: 'entity-box' }, delivery: { status: 'awaiting_studio_verification' }, ...extra };
}
function fixture(t, owner = 'trusted-owner-a') {
  const sql = createSnapshotSqliteDatabase();
  t.after(() => sql.close());
  let clock = 1_800_000_000_000;
  const options = { now: () => clock };
  const store = createSnapshotStore(sql.db, owner, options);
  return { ...sql, store, owner, setTime: value => { clock = value; }, now: () => clock, other: id => createSnapshotStore(sql.db, id, options) };
}
const code = expected => error => { assert.equal(error.code, expected); return true; };
async function create(store, project = 'project-one', operation = 'operation-zero', extra = {}) {
  const value = result(project, 0, null, operation, extra);
  return store.write({ result: value, inputHash: hash({ create: project, operation }), expectedSnapshotId: null });
}
async function edit(store, previous, operation, extra = {}) {
  const value = result(previous.projectId, previous.revision + 1, previous.hash, operation, extra);
  return store.write({ result: value, inputHash: hash({ previous: previous.snapshotId, operation }), expectedSnapshotId: previous.snapshotId });
}

test('snapshots preserve full immutable results and are isolated by trusted owner', async t => {
  const f = fixture(t);
  const saved = await create(f.store);
  assert.equal(saved.expiresAt, saved.createdAt + SNAPSHOT_LIMITS.ttlMs);
  assert.equal(saved.createdAt, f.now());
  assert.deepEqual(saved.refs, { box: 'entity-box' });
  assert.deepEqual(saved.results, [{ ok: true }]);
  assert.deepEqual(saved.delivery, { status: 'awaiting_studio_verification' });
  saved.bundle.scene.entities.box.color = 'client mutation';
  assert.equal((await f.store.get(saved.snapshotId)).bundle.scene.entities.box.color, 'operation-zero');
  const other = f.other('trusted-owner-b');
  await assert.rejects(other.get(saved.snapshotId), code('snapshot_not_found'));
  await assert.rejects(other.retry(saved.snapshotId), code('snapshot_not_found'));
  assert.equal(await other.getByOperation(saved.operationId, hash({ create: 'project-one', operation: 'operation-zero' })), null);
  const theirs = await create(other);
  assert.notEqual(theirs.snapshotId, saved.snapshotId);
  assert.equal((await f.store.get(saved.snapshotId)).projectId, saved.projectId);
});

test('24-hour expiry is absolute; reads and retries neither renew nor resurrect a snapshot', async t => {
  const f = fixture(t);
  const saved = await create(f.store);
  f.setTime(saved.expiresAt - 1);
  assert.equal((await f.store.get(saved.snapshotId)).expiresAt, saved.expiresAt);
  assert.equal((await f.store.retry(saved.snapshotId)).expiresAt, saved.expiresAt);
  assert.equal((await f.store.getByOperation(saved.operationId, hash({ create: 'project-one', operation: 'operation-zero' }))).expiresAt, saved.expiresAt);
  f.setTime(saved.expiresAt);
  await assert.rejects(f.store.get(saved.snapshotId), code('snapshot_not_found'));
  await assert.rejects(f.store.retry(saved.snapshotId), code('snapshot_not_found'));
  await assert.rejects(f.store.getByOperation(saved.operationId, hash({ create: 'project-one', operation: 'operation-zero' })), code('snapshot_not_found'));
  await assert.rejects(edit(f.store, saved, 'after-expiry'), code('snapshot_conflict'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 0);
});

test('concurrent CAS edits have one winner and stale snapshots cannot be read, retried, or edited', async t => {
  const f = fixture(t);
  const saved = await create(f.store);
  const outcomes = await Promise.allSettled([edit(f.store, saved, 'edit-one'), edit(f.store, saved, 'edit-two')]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const loser = outcomes.find(item => item.status === 'rejected');
  assert.equal(loser.reason.code, 'snapshot_conflict');
  const winner = outcomes.find(item => item.status === 'fulfilled').value;
  assert.equal((await f.store.get(winner.snapshotId)).revision, 1);
  await assert.rejects(f.store.get(saved.snapshotId), code('snapshot_stale'));
  await assert.rejects(f.store.retry(saved.snapshotId), code('snapshot_stale'));
  await assert.rejects(edit(f.store, saved, 'stale-edit'), code('snapshot_conflict'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 2);
  await assert.rejects(create(f.store, saved.projectId, 'fresh-under-existing-project'), code('snapshot_conflict'));
});

test('operation idempotency binds input hash, including concurrent calls, without moving a later head', async t => {
  const f = fixture(t);
  const inputHash = hash('identical-create');
  const value = result();
  const args = { result: value, inputHash, expectedSnapshotId: null };
  const [a, b] = await Promise.all([f.store.write(args), f.store.write(args)]);
  assert.equal(a.snapshotId, b.snapshotId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 1);
  await assert.rejects(f.store.write({ ...args, inputHash: hash('different-input') }), code('operation_conflict'));
  await assert.rejects(f.store.getByOperation(value.operationId, hash('different-input')), code('operation_conflict'));
  const later = await edit(f.store, a, 'later-operation');
  assert.deepEqual(await f.store.write(args), a);
  assert.deepEqual(await f.store.getByOperation(value.operationId, inputHash), a);
  assert.equal((await f.store.get(later.snapshotId)).revision, 1);
  assert.equal(f.sqlite.prepare('SELECT snapshot_id FROM studio_project_heads').get().snapshot_id, later.snapshotId);
  const competing = result('project-second', 0, null, 'competing-id');
  const race = await Promise.allSettled([
    f.store.write({ result: competing, inputHash: hash('input-a'), expectedSnapshotId: null }),
    f.store.write({ result: competing, inputHash: hash('input-b'), expectedSnapshotId: null }),
  ]);
  assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(race.find(item => item.status === 'rejected').reason.code, 'operation_conflict');
});

test('project identity, exact next revision, and base hash are checked inside the write transaction', async t => {
  const f = fixture(t);
  const saved = await create(f.store);
  for (const value of [
    result('different-project', 1, saved.hash, 'wrong-project'),
    result(saved.projectId, 2, saved.hash, 'skipped-revision'),
    result(saved.projectId, 0, saved.hash, 'same-revision'),
    result(saved.projectId, 1, hash('wrong-base'), 'wrong-base'),
  ]) await assert.rejects(f.store.write({ result: value, inputHash: hash(value.operationId), expectedSnapshotId: saved.snapshotId }), code('snapshot_conflict'));
  assert.equal((await f.store.get(saved.snapshotId)).revision, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 1);
});

test('a database failure after snapshot insertion rolls the entire batch back and reads fail closed', async t => {
  const f = fixture(t);
  const saved = await create(f.store);
  f.failNextBatchAt(3); // after immutable insert, before updating the project head
  await assert.rejects(edit(f.store, saved, 'failed-write'), code('snapshot_store_unavailable'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 1);
  assert.equal((await f.store.get(saved.snapshotId)).revision, 0);
  f.failReads(true);
  await assert.rejects(f.store.get(saved.snapshotId), code('snapshot_store_unavailable'));
  await assert.rejects(f.store.getByOperation(saved.operationId, hash('anything')), code('snapshot_store_unavailable'));
  await assert.rejects(edit(f.store, saved, 'unreadable-write'), code('snapshot_store_unavailable'));
  f.failReads(false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count, 1);
});

test('snapshot count and project quotas are atomic and scoped to each owner', async t => {
  const f = fixture(t);
  let saved = await create(f.store);
  for (let revision = 1; revision < SNAPSHOT_LIMITS.snapshots; revision++) saved = await edit(f.store, saved, `edit-${revision}`);
  await assert.rejects(edit(f.store, saved, 'one-too-many'), code('snapshot_quota'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots WHERE owner = ?').get(f.owner).count, 128);
  const other = f.other('owner-project-quota');
  for (let i = 0; i < SNAPSHOT_LIMITS.projects; i++) await create(other, `project-${i}`, `create-${i}`);
  await assert.rejects(create(other, 'project-over', 'create-over'), code('snapshot_quota'));
  const last = await create(f.other('owner-independent'), 'project-new', 'create-independent');
  assert.ok(last.snapshotId);
  const racing = f.other('owner-project-race');
  for (let i = 0; i < SNAPSHOT_LIMITS.projects - 1; i++) await create(racing, `project-${i}`, `create-${i}`);
  const competing = await Promise.allSettled([
    create(racing, 'project-last-a', 'last-a'), create(racing, 'project-last-b', 'last-b'),
  ]);
  assert.equal(competing.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(competing.find(item => item.status === 'rejected').reason.code, 'snapshot_quota');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_project_heads WHERE owner = ?').get('owner-project-race').count, 20);
});

test('snapshot byte limit and aggregate byte quota measure UTF-8 bytes including full results', async t => {
  const f = fixture(t);
  await assert.rejects(create(f.store, 'project-large', 'large', { payload: '界'.repeat(Math.ceil(SNAPSHOT_LIMITS.snapshotBytes / 3)) }), code('snapshot_quota'));
  const payload = 'x'.repeat(900_000);
  let saved = await create(f.store, 'project-bytes', 'bytes-zero', { payload });
  for (let i = 1; i < 18; i++) saved = await edit(f.store, saved, `bytes-${i}`, { payload });
  await assert.rejects(edit(f.store, saved, 'bytes-over', { payload }), code('snapshot_quota'));
  const bytes = f.sqlite.prepare('SELECT SUM(byte_length) AS bytes FROM studio_snapshots WHERE owner = ?').get(f.owner).bytes;
  assert.ok(bytes <= SNAPSHOT_LIMITS.ownerBytes);
  assert.ok(bytes + payload.length > SNAPSHOT_LIMITS.ownerBytes);
});

test('cleanup is bounded, only removes expired rows for its owner, and never deletes live idempotency data', async t => {
  const f = fixture(t);
  let saved = await create(f.store);
  for (let i = 1; i < 100; i++) saved = await edit(f.store, saved, `cleanup-${i}`);
  const other = f.other('other-owner');
  await create(other);
  f.setTime(saved.expiresAt);
  await f.store.cleanup();
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots WHERE owner = ?').get(f.owner).count, 36);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots WHERE owner = ?').get('other-owner').count, 1);
  const fresh = await create(f.store, 'project-fresh', 'fresh-operation');
  await f.store.cleanup();
  assert.equal((await f.store.get(fresh.snapshotId)).expiresAt, fresh.expiresAt);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots WHERE owner = ?').get(f.owner).count, 1);
  await assert.rejects(f.store.getByOperation('fresh-operation', hash('different')), code('operation_conflict'));
});

test('known expired operations cannot renew; bounded cleanup ends idempotency history; corrupt data fails closed', async t => {
  const f = fixture(t);
  const expired = await create(f.store);
  f.setTime(expired.expiresAt);
  await assert.rejects(f.store.getByOperation(expired.operationId, hash({ create: 'project-one', operation: 'operation-zero' })), code('snapshot_not_found'));
  await assert.rejects(create(f.store), code('snapshot_not_found'));
  assert.equal(f.sqlite.prepare('SELECT expires_at FROM studio_snapshots').get().expires_at, expired.expiresAt);
  // This temporary store deliberately has no permanent operation tombstones.
  await f.store.cleanup();
  const fresh = await create(f.store);
  assert.notEqual(fresh.snapshotId, expired.snapshotId);
  assert.equal(fresh.createdAt, expired.expiresAt);
  await assert.rejects(f.store.get(expired.snapshotId), code('snapshot_not_found'));
  f.sqlite.prepare('UPDATE studio_snapshots SET result_json = ? WHERE owner = ? AND snapshot_id = ?').run('{broken', f.owner, fresh.snapshotId);
  await assert.rejects(f.store.get(fresh.snapshotId), code('snapshot_store_unavailable'));
  await assert.rejects(f.store.getByOperation(fresh.operationId, hash({ create: 'project-one', operation: 'operation-zero' })), code('snapshot_store_unavailable'));
});

test('migrations supply indexed lookups and no request path creates schema', async t => {
  const f = fixture(t);
  const plan = f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM studio_snapshots WHERE owner = ? AND operation_id = ? AND expires_at > ?').all('owner', 'operation', f.now());
  assert.ok(plan.some(row => row.detail.includes('idx_studio_snapshots_owner_operation')));
  const empty = createSnapshotSqliteDatabase();
  t.after(() => empty.close());
  empty.sqlite.exec('DROP TABLE studio_project_heads; DROP TABLE studio_snapshots');
  await assert.rejects(create(createSnapshotStore(empty.db, 'owner')), code('snapshot_store_unavailable'));
  assert.equal(empty.sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table'").get().count, 0);
});
