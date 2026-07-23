import { useCallback, useEffect, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import {
  ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION,
  createEnvironmentTextureThumbnailSourceHash,
  environmentTextureThumbnailDerivedPath,
  environmentTextureThumbnailNeedsRefresh,
  isEnvironmentTextureAsset,
  renderEnvironmentTextureThumbnail,
  type AssetManifest,
  type AssetThumbnailDescriptor,
  type TextureAsset,
} from "../../lib/visual-editor";

const GENERATION_DEBOUNCE_MS = 250;
const GENERATION_TIMEOUT_MS = 30_000;

type EnvironmentTextureThumbnailJob = {
  assetId: string;
  sourceHash: string;
  key: string;
};

export function EnvironmentTextureThumbnailGenerationQueue({
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
  const [jobs, setJobs] = useState<EnvironmentTextureThumbnailJob[]>([]);
  const processingKeyRef = useRef<string | null>(null);
  const failedKeysRef = useRef(new Set<string>());
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const current = jobs[0];
  const currentAsset = current ? assets.assets[current.assetId] : undefined;
  const texture =
    currentAsset?.kind === "texture" &&
    isEnvironmentTextureAsset(currentAsset)
      ? currentAsset
      : undefined;

  useEffect(() => {
    setJobs([]);
    processingKeyRef.current = null;
    failedKeysRef.current.clear();
  }, [enabled, projectPath]);

  useEffect(() => {
    if (!enabled || !projectPath || jobs.length > 0 || processingKeyRef.current) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const textures = Object.values(assets.assets).filter(
        (asset): asset is TextureAsset =>
          asset.kind === "texture" &&
          asset.status === "ready" &&
          asset.source.kind === "project" &&
          isEnvironmentTextureAsset(asset),
      );
      void Promise.all(
        textures.map(async (asset) => {
          const sourceHash =
            await createEnvironmentTextureThumbnailSourceHash(asset);
          return {
            assetId: asset.id,
            sourceHash,
            key: `${asset.id}:${sourceHash}`,
            refresh: environmentTextureThumbnailNeedsRefresh(asset, sourceHash),
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
              .sort((left, right) => left.assetId.localeCompare(right.assetId))
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
              "environment-texture-thumbnail-queue",
              error instanceof Error
                ? error.message
                : "HDRIプレビューの更新対象を確認できませんでした",
            );
          }
        });
    }, GENERATION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assets, enabled, jobs.length, onFailed, projectPath]);

  const finishJob = useCallback((job: EnvironmentTextureThumbnailJob) => {
    processingKeyRef.current = null;
    setJobs((currentJobs) =>
      currentJobs[0]?.key === job.key ? currentJobs.slice(1) : currentJobs,
    );
  }, []);

  const failJob = useCallback(
    (job: EnvironmentTextureThumbnailJob, message: string) => {
      failedKeysRef.current.add(job.key);
      onFailed(job.assetId, message);
      finishJob(job);
    },
    [finishJob, onFailed],
  );

  useEffect(() => {
    if (!enabled || !current || !texture || !projectPath) return;
    if (processingKeyRef.current === current.key) return;
    processingKeyRef.current = current.key;
    let cancelled = false;

    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("HDRIプレビューの生成がタイムアウトしました")),
        GENERATION_TIMEOUT_MS,
      );
    });
    void Promise.race([
      renderEnvironmentTextureThumbnail(projectPath, texture),
      timeout,
    ])
      .then(async (dataUrl) => {
        if (cancelled) return;
        const derivedPath = environmentTextureThumbnailDerivedPath(
          current.assetId,
          current.sourceHash,
        );
        const transactionId = `asset-import-thumbnail-${Date.now().toString(36)}`;
        await tauri.commitVisualAssetImport(projectPath, transactionId, [
          { relativePath: derivedPath, dataUrl },
        ]);
        if (cancelled || projectPathRef.current !== projectPath) return;
        onGenerated(current.assetId, {
          status: "generated",
          derivedPath,
          sourceHash: current.sourceHash,
          rendererVersion: ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION,
        });
        failedKeysRef.current.delete(current.key);
        finishJob(current);
      })
      .catch((error) => {
        if (cancelled) return;
        failJob(
          current,
          error instanceof Error
            ? error.message
            : "HDRIプレビューを生成できませんでした",
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (processingKeyRef.current === current.key) {
        processingKeyRef.current = null;
      }
    };
  }, [current, enabled, failJob, finishJob, onGenerated, projectPath, texture]);

  useEffect(() => {
    if (current && !texture) finishJob(current);
  }, [current, finishJob, texture]);

  return null;
}
