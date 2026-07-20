import { tauri } from "../tauri";
import {
  commitAssetImportPlan,
  createModelReimportPlan,
  type AssetImportDiagnostic,
  type AssetImportPlan,
  type AssetImportWrite,
} from "./asset-import";
import { getModelAsset, type AssetManifest } from "./asset-manifest";

export type ModelReimportPhase =
  | "reading-source"
  | "inspecting-source"
  | "committing-assets"
  | "complete"
  | "failed";

export type ModelReimportProgress = {
  phase: ModelReimportPhase;
  message: string;
};

export type ModelReimportResult =
  | {
      ok: true;
      manifest: AssetManifest;
      diagnostics: AssetImportDiagnostic[];
    }
  | {
      ok: false;
      /** Last-known-good manifest. Never contains a partially reimported Asset. */
      manifest: AssetManifest;
      diagnostics: AssetImportDiagnostic[];
      message: string;
    };

export type ModelReimportProgressListener = (
  progress: ModelReimportProgress,
) => void;

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

/**
 * Commits every file produced by a compound import in one native transaction.
 * Unity packages use this boundary so a package cannot leave half of its
 * convertible models and textures on disk when a later asset fails.
 */
export async function commitAssetImportPlansToDisk(
  projectPath: string,
  manifest: AssetManifest,
  plans: readonly AssetImportPlan[],
): Promise<AssetManifest> {
  let candidate = manifest;
  const writes = new Map<string, AssetImportWrite>();

  for (const plan of plans) {
    candidate = await commitAssetImportPlan(candidate, plan, async (request) => {
      for (const write of request.writes) {
        // Import destinations are content-addressed. Repeated package entries
        // with the same destination therefore represent the same source.
        writes.set(write.relativePath, write);
      }
    });
  }

  if (writes.size === 0) return candidate;
  const transactionId = `asset-import-unity-${Date.now().toString(36)}`;
  await tauri.commitVisualAssetImport(
    projectPath,
    transactionId,
    await Promise.all(
      [...writes.values()].map(async (write) => ({
        relativePath: write.relativePath,
        dataUrl: await importWriteDataUrl(write),
      })),
    ),
  );
  return candidate;
}

/**
 * Reimports a Model from its current project-relative source. IPC, data URL
 * transport, inspection and the atomic Asset commit stay outside React. A
 * failure always returns the exact input manifest as the last-known-good state.
 */
export async function reimportModelAssetFromDisk(
  projectPath: string,
  manifest: AssetManifest,
  assetId: string,
  onProgress?: ModelReimportProgressListener,
): Promise<ModelReimportResult> {
  const asset = getModelAsset(manifest, assetId);
  if (!asset || asset.source.kind !== "project") {
    return failedModelReimport(
      manifest,
      [],
      "再取り込みできるプロジェクト内のModel Assetを選択してください",
      onProgress,
    );
  }

  const sourcePath = asset.source.relativePath;
  const fileName = sourcePath.split("/").pop() ?? `${asset.id}.glb`;
  const extension = fileName.toLowerCase().split(".").pop();
  const sourceFormat =
    extension === "glb" ||
    extension === "gltf" ||
    extension === "obj" ||
    extension === "vrm"
      ? extension
      : undefined;
  if (!sourceFormat) {
    return failedModelReimport(
      manifest,
      [],
      "再取り込み元はGLB、glTF、OBJまたはVRMである必要があります",
      onProgress,
    );
  }

  let diagnostics: AssetImportDiagnostic[] = [];
  try {
    reportModelReimport(onProgress, "reading-source", "モデルファイルを読み込んでいます");
    const dataUrl = await tauri.readProjectFileDataUrl(projectPath, sourcePath);
    const bytes = await dataUrlToArrayBuffer(dataUrl);
    reportModelReimport(onProgress, "inspecting-source", "モデル構造を検査しています");
    const plan = await createModelReimportPlan(asset, {
      fileName,
      bytes,
      mimeType:
        sourceFormat === "glb"
          ? "model/gltf-binary"
          : sourceFormat === "gltf"
            ? "model/gltf+json"
            : sourceFormat === "obj"
              ? "model/obj"
              : "model/vrm",
    }, manifest);
    diagnostics = plan.diagnostics;
    if (!plan.canCommit || !plan.asset) {
      const blocking = plan.diagnostics.find(
        (diagnostic) => diagnostic.severity === "blocking",
      );
      return failedModelReimport(
        manifest,
        plan.diagnostics,
        blocking?.message ?? "モデルの検査を完了できませんでした",
        onProgress,
      );
    }

    reportModelReimport(
      onProgress,
      "committing-assets",
      "検査済みモデルを保存しています",
    );
    const committed = await commitAssetImportPlanToDisk(
      projectPath,
      manifest,
      plan,
    );
    reportModelReimport(onProgress, "complete", "モデルを再取り込みしました");
    return {
      ok: true,
      manifest: committed,
      diagnostics,
    };
  } catch {
    return failedModelReimport(
      manifest,
      diagnostics,
      "モデルの再取り込みに失敗しました。元のAssetは保持されています",
      onProgress,
    );
  }
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

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  if (!/^data:[^,]*;base64,/i.test(dataUrl)) {
    throw new Error("Project source did not use a base64 data URL");
  }
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Project source data could not be decoded");
  return response.arrayBuffer();
}

function failedModelReimport(
  manifest: AssetManifest,
  diagnostics: AssetImportDiagnostic[],
  message: string,
  listener?: ModelReimportProgressListener,
): ModelReimportResult {
  reportModelReimport(listener, "failed", message);
  return { ok: false, manifest, diagnostics, message };
}

function reportModelReimport(
  listener: ModelReimportProgressListener | undefined,
  phase: ModelReimportPhase,
  message: string,
): void {
  try {
    listener?.({ phase, message });
  } catch {
    // Progress rendering cannot invalidate an already verified import plan.
  }
}
