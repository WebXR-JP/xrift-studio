import { bundleHash, validateBundle } from './chatgpt-project';
import type { PrototypeVisualProject } from './prototype-project';

export type StudioResult = {
  bundle: PrototypeVisualProject; revision: number; baseHash: string | null;
  operationId?: string; results?: unknown[];
};
export type StudioReceipt = {
  operationId: string; projectId: string; revision: number; hash: string;
  status: 'verified' | 'failed' | 'waiting'; message: string; at: string; reported: boolean;
  verification?: StudioVerification;
};
export type StudioVerification = { applied: boolean; saved: boolean; rendered: boolean; captured: boolean };
const unverified = (): StudioVerification => ({ applied: false, saved: false, rendered: false, captured: false });
export class StudioVerificationError extends Error {
  readonly verification: StudioVerification;
  constructor(error: unknown, verification: StudioVerification) {
    super(error instanceof Error ? error.message : '反映を確認できませんでした');
    this.name = 'StudioVerificationError';
    this.verification = { ...verification };
  }
}
/** Older receipts only retained the overall result, not each completed stage. */
export function studioReceiptVerification(receipt: Pick<StudioReceipt, 'status' | 'verification'>): StudioVerification {
  return receipt.verification ?? (receipt.status === 'verified'
    ? { applied: true, saved: true, rendered: true, captured: true }
    : unverified());
}
export type StudioRecovery = {
  active: { path: string; projectId: string; revision: number; hash: string } | null;
  pending: StudioResult | null; history: StudioReceipt[];
  projects: Record<string, { revision: number; hash: string }>;
  queue: StudioResult[];
  operations?: Record<string, StudioResult>;
};
/** Startup may reopen the pending operation's saved project, never switch it. */
export function assertStudioProjectOpenAllowed(projectId: string, currentProjectId: string | null, pending: StudioResult | null, restoring: StudioRecovery['active'] = null) {
  if (!pending || currentProjectId === projectId) return;
  if (currentProjectId === null && restoring?.projectId === projectId && pending.bundle.project.projectId === projectId) return;
  throw new Error('AIの編集が未完了です。反映を再確認してから作品を切り替えてください');
}
export const emptyRecovery = (): StudioRecovery => ({ active: null, pending: null, history: [], projects: {}, queue: [] });
export function parseStudioResult(data: Record<string, unknown>): StudioResult {
  if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0 ||
      !(data.baseHash === null || typeof data.baseHash === 'string') ||
      (data.operationId !== undefined && (typeof data.operationId !== 'string' || !/^[A-Za-z0-9-]{1,120}$/.test(data.operationId)))) {
    throw new Error('AIの結果が不正です');
  }
  return { results: Array.isArray(data.results) ? data.results : undefined, bundle: validateBundle(data.bundle), revision: data.revision as number,
    baseHash: data.baseHash as string | null, operationId: data.operationId as string | undefined };
}
export function addReceipt(state: StudioRecovery, receipt: StudioReceipt): StudioRecovery {
  return { ...state, history: [...state.history.filter(item => item.operationId !== receipt.operationId), receipt].slice(-20) };
}
export interface DeliveryEditor {
  currentBundle(): PrototypeVisualProject;
  saveNow(): Promise<string | undefined>;
  captureSceneView(): Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }>;
}
/** A document result alone never proves that the Studio displayed it. */
export async function verifyStudioResult(result: StudioResult, editor: DeliveryEditor, stillCurrent: () => boolean) {
  const verification = unverified();
  try {
    const expected = await bundleHash(result.bundle);
    const check = async () => {
      verification.applied = false;
      if (!stillCurrent()) throw new Error('確認中に編集対象が切り替わりました');
      if (await bundleHash(editor.currentBundle()) !== expected) throw new Error('Studioの編集データが作成結果と一致しません');
      verification.applied = true;
    };
    await check();
    if (!(await editor.saveNow())) throw new Error('ブラウザへの保存を確認できませんでした');
    await check();
    verification.saved = true;
    const frame = await editor.captureSceneView();
    await check();
    if (!frame.ok) throw new Error(frame.message);
    if (!frame.dataUrl.startsWith('data:image/png;base64,')) throw new Error('Scene ViewのPNGを確認できませんでした');
    verification.rendered = true;
    verification.captured = true;
    return { hash: expected, data: frame.dataUrl.slice('data:image/png;base64,'.length), verification };
  } catch (error) {
    // A failed frame read does not undo the document application or browser save.
    throw new StudioVerificationError(error, verification);
  }
}
