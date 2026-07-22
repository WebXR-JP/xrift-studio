import { useCallback, useEffect, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import {
  MATERIAL_THUMBNAIL_RENDERER_VERSION,
  createMaterialThumbnailSourceHash,
  materialThumbnailDerivedPath,
  materialThumbnailNeedsRefresh,
  type AssetManifest,
  type AssetThumbnailDescriptor,
  type MaterialAsset,
} from "../../lib/visual-editor";
import { MaterialThumbnail } from "./AssetQuickEditor";

const GENERATION_DEBOUNCE_MS = 500;
const GENERATION_TIMEOUT_MS = 20_000;

type MaterialThumbnailJob = {
  assetId: string;
  sourceHash: string;
  key: string;
};

export function MaterialThumbnailGenerationQueue({
  assets,
  projectPath,
  enabled,
  onGenerated,
  onFailed,
}: {
  assets: AssetManifest;
  projectPath?: string;
  enabled: boolean;
  onGenerated: (
    assetId: string,
    thumbnail: AssetThumbnailDescriptor,
  ) => void;
  onFailed: (assetId: string, message: string) => void;
}) {
  const [jobs, setJobs] = useState<MaterialThumbnailJob[]>([]);
  const processingKeyRef = useRef<string | null>(null);
  const failedKeysRef = useRef(new Set<string>());
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const current = jobs[0];
  const currentAsset = current
    ? assets.assets[current.assetId]
    : undefined;
  const material =
    currentAsset?.kind === "material" ? currentAsset : undefined;

  useEffect(() => {
    setJobs([]);
    processingKeyRef.current = null;
    failedKeysRef.current.clear();
  }, [enabled, projectPath]);

  useEffect(() => {
    if (!enabled || !projectPath || jobs.length > 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const materials = Object.values(assets.assets).filter(
        (asset): asset is MaterialAsset => asset.kind === "material",
      );
      void Promise.all(
        materials.map(async (asset) => {
          const sourceHash = await createMaterialThumbnailSourceHash(
            asset,
            assets,
          );
          return {
            assetId: asset.id,
            sourceHash,
            key: `${asset.id}:${sourceHash}`,
            openBrush: asset.shader?.kind === "openbrush",
            refresh: materialThumbnailNeedsRefresh(asset, sourceHash),
          };
        }),
      )
        .then((candidates) => {
          if (cancelled) return;
          setJobs(
            candidates
              .filter(
                (candidate) =>
                  candidate.refresh &&
                  !failedKeysRef.current.has(candidate.key),
              )
              .sort(
                (left, right) =>
                  Number(right.openBrush) - Number(left.openBrush) ||
                  left.assetId.localeCompare(right.assetId),
              )
              .map(({ assetId, sourceHash, key }) => ({
                assetId,
                sourceHash,
                key,
              })),
          );
        })
        .catch((error) => {
          if (!cancelled) {
            onFailed(
              "material-thumbnail-queue",
              error instanceof Error
                ? error.message
                : "Material thumbnail fingerprint could not be created",
            );
          }
        });
    }, GENERATION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assets, enabled, jobs.length, onFailed, projectPath]);

  const finishJob = useCallback((job: MaterialThumbnailJob) => {
    processingKeyRef.current = null;
    setJobs((currentJobs) =>
      currentJobs[0]?.key === job.key ? currentJobs.slice(1) : currentJobs,
    );
  }, []);

  const failJob = useCallback(
    (job: MaterialThumbnailJob, message: string) => {
      failedKeysRef.current.add(job.key);
      onFailed(job.assetId, message);
      finishJob(job);
    },
    [finishJob, onFailed],
  );

  const handleCapture = useCallback(
    (dataUrl: string) => {
      const job = jobs[0];
      const activeProjectPath = projectPathRef.current;
      if (
        !job ||
        !activeProjectPath ||
        processingKeyRef.current === job.key
      ) {
        return;
      }
      processingKeyRef.current = job.key;
      const extension = dataUrl.startsWith("data:image/webp;")
        ? "webp"
        : "png";
      const derivedPath = materialThumbnailDerivedPath(
        job.assetId,
        job.sourceHash,
        extension,
      );
      const transactionId = `asset-import-thumbnail-${Date.now().toString(36)}`;

      void tauri
        .commitVisualAssetImport(activeProjectPath, transactionId, [
          { relativePath: derivedPath, dataUrl },
        ])
        .then(() => {
          if (projectPathRef.current !== activeProjectPath) return;
          onGenerated(job.assetId, {
            status: "generated",
            derivedPath,
            sourceHash: job.sourceHash,
            rendererVersion: MATERIAL_THUMBNAIL_RENDERER_VERSION,
          });
          failedKeysRef.current.delete(job.key);
          finishJob(job);
        })
        .catch((error) => {
          failJob(
            job,
            error instanceof Error
              ? error.message
              : "Material thumbnail could not be saved",
          );
        });
    },
    [failJob, finishJob, jobs, onGenerated],
  );

  const handleCaptureError = useCallback(
    (message: string) => {
      const job = jobs[0];
      if (job) failJob(job, message);
    },
    [failJob, jobs],
  );

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      if (processingKeyRef.current !== current.key) {
        failJob(current, "Material thumbnail generation timed out");
      }
    }, GENERATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [current, failJob]);

  useEffect(() => {
    if (current && !material) {
      finishJob(current);
    }
  }, [current, finishJob, material]);

  if (!enabled || !current || !material || !projectPath) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed -left-[10000px] top-0 h-[240px] w-[320px] overflow-hidden opacity-0"
    >
      <MaterialThumbnail
        asset={material}
        assets={assets}
        projectPath={projectPath}
        captureKey={current.key}
        onCapture={handleCapture}
        onCaptureError={handleCaptureError}
      />
    </div>
  );
}
