/** Temporary, owner-scoped conversation snapshots. Schema is migration-owned. */
export interface SnapshotQueryResult<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta?: { changes?: number; [key: string]: unknown };
}
export interface SnapshotPreparedStatement {
  bind(...values: Array<string | number | null>): SnapshotPreparedStatement;
  all<T = Record<string, unknown>>(): Promise<SnapshotQueryResult<T>>;
}
export interface SnapshotDatabase {
  prepare(sql: string): SnapshotPreparedStatement;
  batch<T = Record<string, unknown>>(statements: SnapshotPreparedStatement[]): Promise<SnapshotQueryResult<T>[]>;
}
export type SnapshotResult = {
  bundle: unknown;
  projectId: string;
  sceneId: string;
  revision: number;
  hash: string;
  baseHash: string | null;
  operationId: string;
  results?: unknown[];
  refs?: Record<string, string>;
  [key: string]: unknown;
};
export type StoredSnapshot = SnapshotResult & { snapshotId: string; createdAt: number; expiresAt: number };
export const SNAPSHOT_LIMITS = Object.freeze({ ttlMs: 24 * 60 * 60 * 1000, snapshotBytes: 1024 * 1024, snapshots: 128, projects: 20, ownerBytes: 16 * 1024 * 1024, cleanupRows: 64 });
export class SnapshotStoreError extends Error {
  constructor(readonly code: 'snapshot_not_found' | 'snapshot_stale' | 'snapshot_conflict' | 'operation_conflict' | 'snapshot_quota' | 'snapshot_invalid' | 'snapshot_store_unavailable', message: string) {
    super(message); this.name = 'SnapshotStoreError';
  }
}
type SnapshotRow = {
  owner: string; snapshot_id: string; project_id: string; scene_id: string; revision: number;
  hash: string; base_hash: string | null; operation_id: string; input_hash: string;
  result_json: string; byte_length: number; created_at: number; expires_at: number;
  head_snapshot_id?: string | null;
};
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const invalid = () => new SnapshotStoreError('snapshot_invalid', '一時保存する編集データが不正です');
const unavailable = () => new SnapshotStoreError('snapshot_store_unavailable', '作品の一時保存を確認できませんでした。保存先の状態を確認して再試行してください');
function checkId(value: string) { if (typeof value !== 'string' || !idPattern.test(value)) throw invalid(); }
function checkHash(value: string) { if (typeof value !== 'string' || !hashPattern.test(value)) throw invalid(); }
function checkResult(result: SnapshotResult) {
  if (!result || typeof result !== 'object' || !result.bundle || typeof result.bundle !== 'object') throw invalid();
  checkId(result.projectId); checkId(result.sceneId); checkId(result.operationId); checkHash(result.hash);
  if (result.baseHash !== null) checkHash(result.baseHash);
  if (!Number.isSafeInteger(result.revision) || result.revision < 0) throw invalid();
}

/** trustedOwner must come from the verified Worker identity, never tool arguments. */
export function createSnapshotStore(db: SnapshotDatabase, trustedOwner: string, options: { now?: () => number } = {}) {
  if (typeof trustedOwner !== 'string' || !trustedOwner.trim() || trustedOwner.length > 512) throw invalid();
  const owner = trustedOwner;
  const now = () => {
    const value = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(value) || value < 0) throw unavailable();
    return value;
  };
  const statement = (sql: string, values: Array<string | number | null>) => db.prepare(sql).bind(...values);
  async function database<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) { if (error instanceof SnapshotStoreError) throw error; throw unavailable(); }
  }
  async function rows<T>(sql: string, values: Array<string | number | null>): Promise<T[]> {
    return database(async () => {
      const result = await statement(sql, values).all<T>();
      if (result.success !== true || !Array.isArray(result.results)) throw unavailable();
      return result.results;
    });
  }
  function decode(row: SnapshotRow, timestamp: number): StoredSnapshot {
    try {
      const result = JSON.parse(row.result_json) as SnapshotResult;
      checkResult(result);
      if (row.owner !== owner || row.expires_at <= timestamp || row.expires_at !== row.created_at + SNAPSHOT_LIMITS.ttlMs ||
          result.projectId !== row.project_id || result.sceneId !== row.scene_id || result.revision !== row.revision ||
          result.operationId !== row.operation_id || result.hash !== row.hash || result.baseHash !== row.base_hash ||
          new TextEncoder().encode(row.result_json).byteLength !== row.byte_length || row.byte_length > SNAPSHOT_LIMITS.snapshotBytes) throw unavailable();
      return { ...result, snapshotId: row.snapshot_id, createdAt: row.created_at, expiresAt: row.expires_at };
    } catch { throw unavailable(); }
  }
  function cleanupStatements(timestamp: number) {
    return [
      statement(`DELETE FROM studio_snapshots WHERE owner = ? AND expires_at <= ? AND snapshot_id IN (
        SELECT snapshot_id FROM studio_snapshots WHERE owner = ? AND expires_at <= ?
        ORDER BY expires_at LIMIT ?
      )`, [owner, timestamp, owner, timestamp, SNAPSHOT_LIMITS.cleanupRows]),
      statement(`DELETE FROM studio_project_heads WHERE owner = ? AND expires_at <= ? AND project_id IN (
        SELECT project_id FROM studio_project_heads WHERE owner = ? AND expires_at <= ? ORDER BY expires_at LIMIT ?
      )`, [owner, timestamp, owner, timestamp, SNAPSHOT_LIMITS.cleanupRows]),
    ];
  }
  async function executeBatch(statements: SnapshotPreparedStatement[]) {
    return database(async () => {
      const result = await db.batch<SnapshotRow>(statements);
      if (result.length !== statements.length || result.some(item => item.success !== true || !Array.isArray(item.results))) throw unavailable();
      return result;
    });
  }
  async function getByOperation(operationId: string, inputHash: string): Promise<StoredSnapshot | null> {
    checkId(operationId); checkHash(inputHash);
    const timestamp = now();
    const [row] = await rows<SnapshotRow>('SELECT * FROM studio_snapshots WHERE owner = ? AND operation_id = ? AND expires_at > ? LIMIT 1', [owner, operationId, timestamp]);
    if (!row) {
      // While its record remains, an expired operation cannot masquerade as a
      // new request. Bounded cleanup eventually removes this idempotency history.
      const [expired] = await rows<{ expired: number }>('SELECT 1 AS expired FROM studio_snapshots WHERE owner = ? AND operation_id = ? AND expires_at <= ? LIMIT 1', [owner, operationId, timestamp]);
      if (expired) throw new SnapshotStoreError('snapshot_not_found', 'この操作の一時保存期限が過ぎています。新しい操作IDで明示的に作成し直してください');
      return null;
    }
    if (row.input_hash !== inputHash) throw new SnapshotStoreError('operation_conflict', '同じ操作IDで異なる編集要求を再実行できません');
    // Idempotent operation replay returns history; it never restores the head.
    return decode(row, timestamp);
  }
  async function get(snapshotId: string, _options?: { requireHead: true }): Promise<StoredSnapshot> {
    checkId(snapshotId);
    const timestamp = now();
    const [row] = await rows<SnapshotRow>(`SELECT s.*, h.snapshot_id AS head_snapshot_id FROM studio_snapshots s
      LEFT JOIN studio_project_heads h ON h.owner = s.owner AND h.project_id = s.project_id AND h.expires_at > ?
      WHERE s.owner = ? AND s.snapshot_id = ? AND s.expires_at > ? LIMIT 1`, [timestamp, owner, snapshotId, timestamp]);
    if (!row) throw new SnapshotStoreError('snapshot_not_found', '一時保存した作品が見つからないか、保存期限が過ぎています');
    if (row.head_snapshot_id !== row.snapshot_id) throw new SnapshotStoreError('snapshot_stale', 'この作品には新しい編集があります。最新のsnapshotIdを使ってください');
    return decode(row, timestamp);
  }
  async function write({ result, inputHash, expectedSnapshotId }: { result: SnapshotResult; inputHash: string; expectedSnapshotId: string | null }): Promise<StoredSnapshot> {
    checkResult(result); checkHash(inputHash);
    if (expectedSnapshotId !== null) checkId(expectedSnapshotId);
    const replay = await getByOperation(result.operationId, inputHash);
    if (replay) return replay;
    let json: string;
    try { json = JSON.stringify(result); } catch { throw invalid(); }
    const size = new TextEncoder().encode(json).byteLength;
    if (size > SNAPSHOT_LIMITS.snapshotBytes) throw new SnapshotStoreError('snapshot_quota', '一時保存する編集データは1 MiBまでです');
    const timestamp = now();
    const snapshotId = `snapshot-${crypto.randomUUID()}`;
    const expiresAt = timestamp + SNAPSHOT_LIMITS.ttlMs;
    // All quota checks, immutable insertion and head replacement occur in one
    // D1 transaction. Concurrent writers cannot both match the previous head.
    const batch = await executeBatch([
      ...cleanupStatements(timestamp),
      statement(`INSERT INTO studio_snapshots
        (owner, snapshot_id, project_id, scene_id, revision, hash, base_hash, operation_id, input_hash, result_json, byte_length, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM studio_snapshots WHERE owner = ? AND operation_id = ? AND expires_at > ?)
          AND (SELECT COUNT(*) FROM studio_snapshots WHERE owner = ? AND expires_at > ?) < ?
          AND (SELECT COALESCE(SUM(byte_length), 0) FROM studio_snapshots WHERE owner = ? AND expires_at > ?) + ? <= ?
          AND (EXISTS (SELECT 1 FROM studio_snapshots WHERE owner = ? AND project_id = ? AND expires_at > ?)
            OR (SELECT COUNT(DISTINCT project_id) FROM studio_snapshots WHERE owner = ? AND expires_at > ?) < ?)
          AND ((? IS NULL AND ? = 0 AND ? IS NULL AND NOT EXISTS (
              SELECT 1 FROM studio_project_heads WHERE owner = ? AND project_id = ? AND expires_at > ?))
            OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM studio_project_heads
              WHERE owner = ? AND project_id = ? AND snapshot_id = ? AND expires_at > ? AND revision + 1 = ? AND hash = ?)))`,
      [owner, snapshotId, result.projectId, result.sceneId, result.revision, result.hash, result.baseHash, result.operationId, inputHash, json, size, timestamp, expiresAt,
        owner, result.operationId, timestamp, owner, timestamp, SNAPSHOT_LIMITS.snapshots, owner, timestamp, size, SNAPSHOT_LIMITS.ownerBytes,
        owner, result.projectId, timestamp, owner, timestamp, SNAPSHOT_LIMITS.projects,
        expectedSnapshotId, result.revision, result.baseHash, owner, result.projectId, timestamp,
        expectedSnapshotId, owner, result.projectId, expectedSnapshotId, timestamp, result.revision, result.baseHash]),
      statement(`INSERT INTO studio_project_heads (owner, project_id, snapshot_id, revision, hash, expires_at)
        SELECT owner, project_id, snapshot_id, revision, hash, expires_at FROM studio_snapshots
        WHERE owner = ? AND snapshot_id = ? AND expires_at > ?
        ON CONFLICT (owner, project_id) DO UPDATE SET snapshot_id = excluded.snapshot_id,
          revision = excluded.revision, hash = excluded.hash, expires_at = excluded.expires_at
        WHERE studio_project_heads.snapshot_id = ? OR studio_project_heads.expires_at <= ?`,
      [owner, snapshotId, timestamp, expectedSnapshotId, timestamp]),
      statement('SELECT * FROM studio_snapshots WHERE owner = ? AND operation_id = ? AND expires_at > ? LIMIT 1', [owner, result.operationId, timestamp]),
    ]);
    const row = batch[batch.length - 1].results[0];
    if (row) {
      if (row.input_hash !== inputHash) throw new SnapshotStoreError('operation_conflict', '同じ操作IDで異なる編集要求を再実行できません');
      return decode(row, timestamp);
    }
    const [head] = await rows<{ snapshot_id: string; revision: number; hash: string }>('SELECT snapshot_id, revision, hash FROM studio_project_heads WHERE owner = ? AND project_id = ? AND expires_at > ? LIMIT 1', [owner, result.projectId, timestamp]);
    if (expectedSnapshotId === null ? !!head || result.revision !== 0 || result.baseHash !== null : !head || head.snapshot_id !== expectedSnapshotId || head.revision + 1 !== result.revision || head.hash !== result.baseHash) {
      throw new SnapshotStoreError('snapshot_conflict', '編集元が最新の作品と一致しません。最新のsnapshotIdを使ってください');
    }
    throw new SnapshotStoreError('snapshot_quota', '作品の一時保存の上限に達しました。保存期限が過ぎてから再試行してください');
  }
  return { get, getByOperation, write, retry: get, cleanup: async () => { await executeBatch(cleanupStatements(now())); } };
}
