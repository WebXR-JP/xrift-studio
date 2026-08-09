import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { tauri } from "../../lib/tauri";
import {
  MODEL_THUMBNAIL_RENDERER_VERSION,
  modelThumbnailDerivedPath,
  modelThumbnailNeedsRefresh,
  type AssetManifest,
  type AssetThumbnailDescriptor,
  type ModelAsset,
} from "../../lib/visual-editor";
import {
  ProjectModelVisual,
  type ProjectModelLoadState,
  type ProjectModelMaterialAssignment,
} from "./ProjectModelVisual";
import { WebGlThumbnailCapture } from "./WebGlThumbnailCapture";

const GENERATION_DEBOUNCE_MS = 500;
const GENERATION_TIMEOUT_MS = 20_000;

type ModelThumbnailJob = {
  assetId: string;
  sourceHash: string;
  key: string;
};

/**
 * Renders each stale Model thumbnail through the real Scene renderer
 * (ProjectModelVisual) off-screen, one at a time, and persists the capture
 * as a derived Asset file. Mirrors MaterialThumbnailGenerationQueue.
 */
export function ModelThumbnailGenerationQueue({
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
  const [jobs, setJobs] = useState<ModelThumbnailJob[]>([]);
  const processingKeyRef = useRef<string | null>(null);
  const failedKeysRef = useRef(new Set<string>());
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const current = jobs[0];
  const currentAsset = current
    ? assets.assets[current.assetId]
    : undefined;
  const model =
    currentAsset?.kind === "model" && currentAsset.source.kind === "project"
      ? currentAsset
      : undefined;

  useEffect(() => {
    setJobs([]);
    processingKeyRef.current = null;
    failedKeysRef.current.clear();
  }, [enabled, projectPath]);

  useEffect(() => {
    if (!enabled || !projectPath || jobs.length > 0) return;
    const timer = window.setTimeout(() => {
      const models = Object.values(assets.assets).filter(
        (asset): asset is ModelAsset & { sourceHash: string } =>
          asset.kind === "model" &&
          asset.status === "ready" &&
          asset.source.kind === "project" &&
          Boolean(asset.sourceHash) &&
          modelThumbnailNeedsRefresh(asset),
      );
      setJobs(
        models
          .map((asset) => ({
            assetId: asset.id,
            sourceHash: asset.sourceHash,
            key: `${asset.id}:${asset.sourceHash}`,
          }))
          .filter((candidate) => !failedKeysRef.current.has(candidate.key))
          .sort((left, right) => left.assetId.localeCompare(right.assetId)),
      );
    }, GENERATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [assets, enabled, jobs.length, projectPath]);

  const finishJob = useCallback((job: ModelThumbnailJob) => {
    processingKeyRef.current = null;
    setJobs((currentJobs) =>
      currentJobs[0]?.key === job.key ? currentJobs.slice(1) : currentJobs,
    );
  }, []);

  const failJob = useCallback(
    (job: ModelThumbnailJob, message: string) => {
      failedKeysRef.current.add(job.key);
      onFailed(job.assetId, message);
      finishJob(job);
    },
    [finishJob, onFailed],
  );

  // Keyed by job, not just asset id, so a load resolved for the previous job
  // can never be read as "ready" for the job that just replaced it.
  const [loadSnapshot, setLoadSnapshot] = useState<{
    key: string;
    state: ProjectModelLoadState;
  }>({ key: "", state: { status: "loading" } });
  const loadState =
    current && loadSnapshot.key === current.key
      ? loadSnapshot.state
      : ({ status: "loading" } satisfies ProjectModelLoadState);
  const handleLoadStateChange = useCallback(
    (state: ProjectModelLoadState) => {
      if (current) setLoadSnapshot({ key: current.key, state });
    },
    [current],
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
      const derivedPath = modelThumbnailDerivedPath(
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
            rendererVersion: MODEL_THUMBNAIL_RENDERER_VERSION,
          });
          failedKeysRef.current.delete(job.key);
          finishJob(job);
        })
        .catch((error) => {
          failJob(
            job,
            error instanceof Error
              ? error.message
              : "Model thumbnail could not be saved",
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
        failJob(current, "Model thumbnail generation timed out");
      }
    }, GENERATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [current, failJob]);

  useEffect(() => {
    if (current && !model) {
      finishJob(current);
    }
  }, [current, finishJob, model]);

  useEffect(() => {
    if (current && loadState.status === "error") {
      failJob(current, loadState.message);
    }
    // failJob intentionally excluded: it mutates failedKeysRef/jobs, which
    // must not retrigger this effect from its own state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, loadState]);

  if (!enabled || !current || !model || !projectPath) return null;
  // model is only ever selected from a "project"-sourced asset (see the
  // `model` computation above); re-check here so the compiler narrows
  // model.source for the JSX below instead of widening it back to AssetSource.
  if (model.source.kind !== "project") return null;

  const assignedMaterials: ProjectModelMaterialAssignment[] =
    model.materialSlots.flatMap((slot) => {
      if (
        slot.sourceMaterialIndex === undefined ||
        !slot.defaultMaterialAssetId
      ) {
        return [];
      }
      const material = assets.assets[slot.defaultMaterialAssetId];
      if (material?.kind !== "material") return [];
      return [
        {
          slot: slot.slot,
          sourceMaterialIndex: slot.sourceMaterialIndex,
          material,
        },
      ];
    });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed -left-[10000px] top-0 h-[240px] w-[320px] overflow-hidden opacity-0"
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        camera={{ position: [0, 0.15, 2.65], fov: 34 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
        }}
      >
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={1.45} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.8} />
        <directionalLight
          position={[-2, -1, 1]}
          intensity={0.65}
          color="#ddd6fe"
        />
        <ProjectModelVisual
          key={current.key}
          projectPath={projectPath}
          sourceRelativePath={model.source.relativePath}
          sourceHash={model.sourceHash}
          importScale={model.importSettings.scale}
          castShadow={false}
          receiveShadow={false}
          selected={false}
          assets={assets}
          assignedMaterials={assignedMaterials}
          fitPreview
          onLoadStateChange={handleLoadStateChange}
        />
        <WebGlThumbnailCapture
          captureKey={current.key}
          ready={loadState.status === "ready"}
          onCapture={handleCapture}
          onError={handleCaptureError}
        />
      </Canvas>
    </div>
  );
}
