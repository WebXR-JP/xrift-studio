import { tauri } from "../tauri";
import {
  commitAssetImportPlan,
  type AssetImportPlan,
  type AssetImportWrite,
} from "./asset-import";
import type { AssetManifest } from "./asset-manifest";

/**
 * Commits an import plan through the desktop shell's atomic Asset boundary.
 * The manifest is returned only after every source/thumbnail file is durable.
 */
export async function commitAssetImportPlanToDisk(
  projectPath: string,
  manifest: AssetManifest,
  plan: AssetImportPlan,
): Promise<AssetManifest> {
  return commitAssetImportPlan(manifest, plan, async (request) => {
    const writes = await Promise.all(
      request.writes.map(async (write) => ({
        relativePath: write.relativePath,
        dataUrl: await importWriteDataUrl(write),
      })),
    );
    await tauri.commitVisualAssetImport(
      projectPath,
      request.transactionId,
      writes,
    );
  });
}

async function importWriteDataUrl(write: AssetImportWrite): Promise<string> {
  if (write.payload.encoding === "data-url") return write.payload.dataUrl;
  const owned = new Uint8Array(write.payload.bytes.byteLength);
  owned.set(write.payload.bytes);
  return blobToDataUrl(new Blob([owned.buffer], { type: write.mediaType }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Asset payload could not be encoded"));
    });
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Asset payload could not be read")),
    );
    reader.readAsDataURL(blob);
  });
}
