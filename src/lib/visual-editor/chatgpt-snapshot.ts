import { bundleHash } from './chatgpt-project';
import { parseStudioResult, type StudioResult } from './chatgpt-delivery';

export type StudioSnapshot = {
  snapshotId: string; projectId: string; revision: number; hash: string; expiresAt: number;
};
export type SnapshotStudioResult = StudioResult & {
  snapshotId?: string; projectId?: string; expiresAt?: number; delivery?: { hash: string };
};
type ToolEnvelope = { structuredContent?: unknown; _meta?: unknown };
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** UI documents travel only in metadata; a malformed new envelope must never fall back to older documents. */
export function studioToolData(envelope: ToolEnvelope): Record<string, unknown> {
  const summary = record(envelope.structuredContent) ?? {};
  const metadata = record(envelope._meta);
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, 'xriftStudio')) {
    if (summary.snapshotId !== undefined && !summary.bundle) throw new Error('表示用の作品データを受信できませんでした。show_worldで同じsnapshotIdを再送してください');
    return summary;
  }
  const data = record(metadata.xriftStudio);
  if (!data?.bundle) throw new Error('表示用の作品データが不正です。同じsnapshotIdで表示を再試行してください');
  for (const key of ['snapshotId', 'projectId', 'sceneId', 'revision', 'operationId', 'baseHash', 'expiresAt', 'hash']) {
    if (summary[key] !== undefined && data[key] !== undefined && summary[key] !== data[key]) throw new Error(`作品データと参照情報が一致しません: ${key}`);
  }
  const summaryDelivery = record(summary.delivery);
  const dataDelivery = record(data.delivery);
  if (summaryDelivery?.hash !== undefined && dataDelivery?.hash !== undefined && summaryDelivery.hash !== dataDelivery.hash) throw new Error('作品データと参照情報のハッシュが一致しません');
  // Only this response supplies fallback fields. No previous tool result or active project is used.
  return { ...summary, ...data, ...(summaryDelivery || dataDelivery ? { delivery: { ...summaryDelivery, ...dataDelivery } } : {}) };
}

export async function parseSnapshotStudioResult(data: Record<string, unknown>): Promise<SnapshotStudioResult> {
  const result = parseStudioResult(data);
  if (data.snapshotId === undefined) return result;
  const hash = record(data.delivery)?.hash;
  if (typeof data.snapshotId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(data.snapshotId) ||
      data.projectId !== result.bundle.project.projectId || !Number.isSafeInteger(data.expiresAt) || Number(data.expiresAt) <= 0 ||
      typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || !result.operationId) throw new Error('作品の参照情報が不正です');
  if (data.hash !== undefined && data.hash !== hash) throw new Error('作品の参照情報のハッシュが一致しません');
  if (hash !== await bundleHash(result.bundle)) throw new Error('受信した作品のハッシュが一致しません');
  return { ...result, snapshotId: data.snapshotId, projectId: data.projectId as string, expiresAt: data.expiresAt as number, delivery: { hash } };
}

export function resultSnapshot(result: SnapshotStudioResult): StudioSnapshot | undefined {
  if (!result.snapshotId || !result.projectId || !result.expiresAt || !result.delivery?.hash) return undefined;
  return { snapshotId: result.snapshotId, projectId: result.projectId, revision: result.revision, hash: result.delivery.hash, expiresAt: result.expiresAt };
}

/** Ordinary saves publish only freshness and short references, never a document or an upload request. */
export function studioSnapshotContext(active: { projectId: string; sceneId: string; revision: number; hash: string } | null, snapshot?: StudioSnapshot, now = Date.now()) {
  if (!active) return { projectId: null, sceneId: null, canEditProject: false, snapshotRequired: false };
  const matchingProject = snapshot?.projectId === active.projectId;
  const matchingHash = matchingProject && snapshot.hash === active.hash;
  const ready = matchingHash && snapshot.expiresAt > now;
  return {
    ...active,
    ...(ready ? { snapshotId: snapshot.snapshotId, revision: snapshot.revision, expiresAt: snapshot.expiresAt } : {}),
    ...(matchingProject && snapshot.expiresAt <= now ? { expiredSnapshotId: snapshot.snapshotId, expiresAt: snapshot.expiresAt } : {}),
    canEditProject: ready,
    snapshotRequired: !ready,
    manualChanges: matchingProject ? !matchingHash : false,
  };
}
