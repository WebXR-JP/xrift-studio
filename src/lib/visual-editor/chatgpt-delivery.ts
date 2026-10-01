import { bundleHash, validateBundle } from './chatgpt-project';
import type { PrototypeVisualProject } from './prototype-project';

export type StudioResult = {
  bundle: PrototypeVisualProject; revision: number; baseHash: string | null;
  operationId?: string; results?: unknown[];
};
export type StudioReceipt = {
  operationId: string; projectId: string; revision: number; hash: string;
  status: 'verified' | 'failed' | 'waiting'; message: string; at: string; reported: boolean;
};
export type StudioRecovery = {
  active: { path: string; projectId: string; revision: number; hash: string } | null;
  pending: StudioResult | null; history: StudioReceipt[];
  projects: Record<string, { revision: number; hash: string }>;
  queue: StudioResult[];
  operations?: Record<string, StudioResult>;
};
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
  const expected = await bundleHash(result.bundle);
  const check = async () => {
    if (!stillCurrent()) throw new Error('確認中に編集対象が切り替わりました');
    if (await bundleHash(editor.currentBundle()) !== expected) throw new Error('Studioの編集データが作成結果と一致しません');
  };
  await check();
  if (!(await editor.saveNow())) throw new Error('ブラウザへの保存を確認できませんでした');
  await check();
  const frame = await editor.captureSceneView();
  if (!frame.ok) throw new Error(frame.message);
  if (!frame.dataUrl.startsWith('data:image/png;base64,')) throw new Error('Scene ViewのPNGを確認できませんでした');
  await check();
  return { hash: expected, data: frame.dataUrl.slice('data:image/png;base64,'.length) };
}
