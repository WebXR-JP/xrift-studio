import { isValidAssetImportPath } from "./asset-import-transaction";
import { HIERARCHY_TRANSFER_MAX_BYTES, HIERARCHY_TRANSFER_MAX_FILES, type HierarchyImportPlan } from "./hierarchy-transfer";

/** Files commit first; document history commits once, only into the same revision. */
export async function applyHierarchyImportPlan(plan: HierarchyImportPlan, port: {
  isCurrent: () => boolean;
  writeFiles: (files: ReadonlyMap<string, Uint8Array>) => Promise<void>;
  commitDocuments: (plan: HierarchyImportPlan) => void;
}): Promise<void> {
  const assertCurrent = () => {
    if (!port.isCurrent()) throw new Error("編集中のシーンが更新されました。内容を確認し直してください。");
  };
  assertCurrent();
  let total = 0;
  if (plan.files.size > HIERARCHY_TRANSFER_MAX_FILES) throw new Error("素材ファイルは512件までです。");
  for (const [path, bytes] of plan.files) {
    if (!isValidAssetImportPath(path)) throw new Error(`素材の保存先が不正です: ${path}`);
    if (!bytes.length || bytes.length > 128 * 1024 * 1024) throw new Error(`素材は1ファイル128 MB以下にしてください: ${path}`);
    total += bytes.length;
  }
  if (total > HIERARCHY_TRANSFER_MAX_BYTES) throw new Error("素材の合計が256 MBを超えています。");
  if (plan.files.size) await port.writeFiles(plan.files);
  // A stale write can leave unreferenced managed files, never a partial Scene.
  // Keep these bytes on Undo too: Redo must not reference deleted assets.
  assertCurrent();
  port.commitDocuments(plan);
}
