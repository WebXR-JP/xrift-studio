import { tauri } from "../tauri";
import { createAssetImportTransactionId, describeAssetImportFailure } from "./asset-import-transaction";
import { createBrowserProjectArchive } from "./browser-project-transfer";
import { HIERARCHY_TRANSFER_MANIFEST, hierarchyTransferMetadata, prepareHierarchyTransferFiles, type HierarchyTransfer, type PreparedHierarchyTransfer } from "./hierarchy-transfer";
import { assetManifestCodec, sceneDocumentCodec, visualProjectDocumentCodec } from "./serialization";
import type { PrototypeVisualProject } from "./prototype-project";

export function validateHierarchyBundle(bundle: PrototypeVisualProject): void {
  const results = [
    assetManifestCodec.parse(assetManifestCodec.serialize(bundle.assets)),
    sceneDocumentCodec.parse(sceneDocumentCodec.serialize(bundle.scene)),
    visualProjectDocumentCodec.parse(visualProjectDocumentCodec.serialize(bundle.project)),
  ];
  for (const result of results) {
    if (!result.ok) throw new Error(`受け渡すデータを確認してください: ${result.issues[0]?.message ?? "形式が不正です"}`);
  }
}

export function hierarchyBlobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("素材の読み込みに失敗しました。"));
    reader.onabort = () => reject(new Error("素材の読み込みを中止しました。"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("素材を読み込めません。"));
    reader.readAsDataURL(blob);
  });
}

export async function prepareStoredHierarchy(transfer: HierarchyTransfer, projectPath?: string): Promise<PreparedHierarchyTransfer> {
  validateHierarchyBundle(transfer.bundle);
  return prepareHierarchyTransferFiles(transfer, async (path) => {
    if (!projectPath) throw new Error("プロジェクトを保存してから素材を受け渡してください。");
    const dataUrl = await tauri.readProjectFileDataUrl(projectPath, path);
    // This API only returns project-scoped local bytes. Never fetch an archive URL.
    if (!dataUrl.startsWith("data:")) throw new Error("素材のデータ形式を確認してください。");
    return new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
  });
}

export async function createHierarchyArchive(transfer: PreparedHierarchyTransfer): Promise<{ blob: Blob; fileName: string; fileCount: number }> {
  validateHierarchyBundle(transfer.bundle);
  const { project, scene, assets, prefabs } = transfer.bundle;
  const files = new Map(transfer.files);
  files.set(HIERARCHY_TRANSFER_MANIFEST, hierarchyTransferMetadata(transfer));
  return createBrowserProjectArchive({ project, scenes: { [scene.sceneId]: scene }, assets, prefabs }, files);
}

export async function writeHierarchyFiles(projectPath: string | undefined, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
  if (!files.size) return;
  if (!projectPath) throw new Error("プロジェクトの自動保存が完了してから追加してください。");
  const writes: { relativePath: string; dataUrl: string }[] = [];
  // Sequential encoding avoids allocating an extra Blob for every file at once.
  for (const [relativePath, bytes] of files) writes.push({ relativePath, dataUrl: await hierarchyBlobDataUrl(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" })) });
  try {
    await tauri.commitVisualAssetImport(projectPath, createAssetImportTransactionId("hierarchy"), writes);
  } catch (error) {
    throw new Error(describeAssetImportFailure(error));
  }
}
