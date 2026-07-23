import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type {
  AssetManifest,
  MaterialAsset,
  ModelAsset,
} from "../../lib/visual-editor";
import { OPEN_BRUSH_CATALOG } from "../../lib/visual-editor";
import { OpenBrushCatalogPreview } from "./OpenBrushCatalogPreview";
import {
  ProjectModelVisual,
  type ProjectModelLoadState,
  type ProjectModelMaterialRuntimeInfo,
} from "./ProjectModelVisual";
import { WebGlThumbnailCapture } from "./WebGlThumbnailCapture";

export type CustomMaterialPreviewSource = {
  renderer: "three-icosa";
  model: ModelAsset;
  sourceRelativePath: string;
  sourceMaterialIndex: number;
  sourceNodeIndex?: number;
};

export type CustomMaterialPreviewResolution =
  | { status: "ready"; source: CustomMaterialPreviewSource }
  | {
      status: "standalone";
      entry: (typeof OPEN_BRUSH_CATALOG)[number];
    }
  | { status: "unavailable"; reason: string };

type Props = {
  asset: MaterialAsset;
  assets: AssetManifest;
  projectPath?: string;
  className?: string;
  compact?: boolean;
  onRuntimeInfoChange?: (
    info: ProjectModelMaterialRuntimeInfo | null,
  ) => void;
  captureKey?: string;
  onCapture?: (dataUrl: string) => void;
  onCaptureError?: (message: string) => void;
};

/**
 * Resolves custom Material Assets through renderer-specific adapters. Future
 * shader kinds can add another branch without teaching the standard sphere
 * preview about their GLSL, geometry attributes, or resource loaders.
 */
export function resolveCustomMaterialPreviewSource(
  asset: MaterialAsset,
  assets: AssetManifest,
): CustomMaterialPreviewResolution {
  const shader = asset.shader;
  if (shader?.kind === "classic-r3f") {
    const candidate = shader.sourceModelAssetId
      ? assets.assets[shader.sourceModelAssetId]
      : undefined;
    if (
      !candidate ||
      candidate.kind !== "model" ||
      candidate.source.kind !== "project"
    ) {
      return {
        status: "unavailable",
        reason: "元のClassic Model Assetが見つかりません",
      };
    }
    return {
      status: "ready",
      source: {
        renderer: "three-icosa",
        model: candidate,
        sourceRelativePath: candidate.source.relativePath,
        sourceMaterialIndex:
          candidate.materialSlots[0]?.sourceMaterialIndex ?? 0,
      },
    };
  }
  if (shader?.kind !== "openbrush") {
    return {
      status: "unavailable",
      reason: "このMaterialにはCustom Shader Preview Adapterがありません",
    };
  }
  const modelAssetId = asset.importedFromModel?.modelAssetId;
  if (!modelAssetId) {
    const entry = OPEN_BRUSH_CATALOG.find(
      (candidate) =>
        candidate.brushGuid === shader.brushGuid ||
        candidate.brushName === shader.brushName,
    );
    if (entry) return { status: "standalone", entry };
    return {
      status: "unavailable",
      reason: "元のOpenBrush Model参照がMaterialに保存されていません",
    };
  }
  const candidate = assets.assets[modelAssetId];
  if (!candidate || candidate.kind !== "model") {
    return {
      status: "unavailable",
      reason: "元のOpenBrush Model Assetが見つかりません",
    };
  }
  if (candidate.source.kind !== "project") {
    return {
      status: "unavailable",
      reason: "プレビュー可能なOpenBrush Modelソースがありません",
    };
  }
  const sourceMaterialIndex = shader.sourceMaterialIndex;
  const node = candidate.importMetadata?.openBrush?.nodes?.find(
    (entry) =>
      entry.meshIndex !== undefined &&
      entry.sourceMaterialIndices.includes(sourceMaterialIndex),
  );
  if (!node) {
    return {
      status: "unavailable",
      reason: `glTF Material #${sourceMaterialIndex}の代表ストローク形状が見つかりません`,
    };
  }
  return {
    status: "ready",
    source: {
      renderer: "three-icosa",
      model: candidate,
      sourceRelativePath: candidate.source.relativePath,
      sourceMaterialIndex,
      sourceNodeIndex: node.sourceNodeIndex,
    },
  };
}

export function CustomMaterialPreview({
  asset,
  assets,
  projectPath,
  className = "h-full w-full",
  compact = false,
  onRuntimeInfoChange,
  captureKey,
  onCapture,
  onCaptureError,
}: Props) {
  const resolution = useMemo(
    () => resolveCustomMaterialPreviewSource(asset, assets),
    [asset, assets],
  );
  const [loadRevision, setLoadRevision] = useState(0);
  const [loadSnapshot, setLoadSnapshot] = useState<{
    assetId: string;
    state: ProjectModelLoadState;
  }>({ assetId: asset.id, state: { status: "loading" } });
  const loadState =
    loadSnapshot.assetId === asset.id
      ? loadSnapshot.state
      : ({ status: "loading" } satisfies ProjectModelLoadState);
  const [runtimeInfo, setRuntimeInfo] =
    useState<ProjectModelMaterialRuntimeInfo | null>(null);
  const assignment = useMemo(
    () =>
      resolution.status === "ready"
        ? [
            {
              slot: `material-${resolution.source.sourceMaterialIndex}`,
              sourceMaterialIndex: resolution.source.sourceMaterialIndex,
              material: asset,
            },
          ]
        : [],
    [asset, resolution],
  );

  useEffect(() => {
    setLoadSnapshot({ assetId: asset.id, state: { status: "loading" } });
    setLoadRevision(0);
    setRuntimeInfo(null);
    onRuntimeInfoChange?.(null);
  }, [asset.id, onRuntimeInfoChange]);

  const handleLoadStateChange = useCallback(
    (state: ProjectModelLoadState) => {
      setLoadSnapshot({ assetId: asset.id, state });
    },
    [asset.id],
  );

  const handleRuntimeInfo = useCallback(
    (materials: readonly ProjectModelMaterialRuntimeInfo[]) => {
      const info = materials[0] ?? null;
      setRuntimeInfo(info);
      onRuntimeInfoChange?.(info);
    },
    [onRuntimeInfoChange],
  );

  useEffect(() => {
    if (
      captureKey &&
      loadSnapshot.assetId === asset.id &&
      loadState.status === "error"
    ) {
      onCaptureError?.(loadState.message);
    }
  }, [
    asset.id,
    captureKey,
    loadSnapshot.assetId,
    loadState,
    onCaptureError,
  ]);

  if (resolution.status === "standalone") {
    return (
      <OpenBrushCatalogPreview
        entry={resolution.entry}
        className={className}
        compact={compact}
        captureKey={captureKey}
        onCapture={onCapture}
        onCaptureError={onCaptureError}
      />
    );
  }

  if (!projectPath || resolution.status === "unavailable") {
    const reason = projectPath
      ? resolution.status === "unavailable"
        ? resolution.reason
        : ""
      : "デスクトップ版でprojectを開くと描画できます";
    return (
      <PreviewMessage className={className}>
        <span className="font-semibold text-slate-700">プレビューできません</span>
        <span className="mt-1 text-[11px] leading-4 text-slate-500">{reason}</span>
      </PreviewMessage>
    );
  }

  const { model, sourceNodeIndex, sourceRelativePath } = resolution.source;

  return (
    <div
      className={`relative overflow-hidden bg-slate-950 ${className}`}
      data-custom-material-preview={asset.shader?.kind}
      data-custom-material-renderer={
        runtimeInfo?.pbrFallback ? "gltf-pbr-fallback" : resolution.source.renderer
      }
    >
      <Canvas
        frameloop={compact ? "demand" : "always"}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.15, 2.65], fov: 34 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: Boolean(onCapture),
        }}
      >
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.8} />
        <directionalLight
          position={[-2, -1, 1]}
          intensity={0.8}
          color="#c4b5fd"
        />
        <PreviewTurntable enabled={!compact}>
          <ProjectModelVisual
            key={`${asset.id}-${loadRevision}`}
            projectPath={projectPath}
            sourceRelativePath={sourceRelativePath}
            sourceHash={model.sourceHash}
            castShadow={false}
            receiveShadow={false}
            selected={false}
            assets={assets}
            assignedMaterials={assignment}
            sourceNodeIndex={sourceNodeIndex}
            fitPreview
            loadRevision={loadRevision}
            onLoadStateChange={handleLoadStateChange}
            onMaterialRuntimeInfoChange={handleRuntimeInfo}
          />
        </PreviewTurntable>
        {captureKey && onCapture ? (
          <WebGlThumbnailCapture
            captureKey={captureKey}
            ready={
              loadSnapshot.assetId === asset.id && loadState.status === "ready"
            }
            onCapture={onCapture}
            onError={onCaptureError}
          />
        ) : null}
        {!compact ? (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={1.4}
            maxDistance={5}
          />
        ) : null}
      </Canvas>

      {!compact ? <span
        className={`pointer-events-none absolute left-2 top-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur ${
          loadState.status === "ready"
            ? runtimeInfo?.pbrFallback
              ? "border-amber-300/50 bg-amber-950/80 text-amber-100"
              : "border-emerald-300/50 bg-emerald-950/75 text-emerald-100"
            : loadState.status === "error"
              ? "border-rose-300/50 bg-rose-950/80 text-rose-100"
              : "border-white/20 bg-slate-950/70 text-slate-200"
        }`}
      >
        {loadState.status === "ready"
          ? runtimeInfo?.pbrFallback
            ? "glTF PBRへフォールバック"
            : "three-icosa shader適用済み"
          : loadState.status === "error"
            ? "shader読込失敗"
            : "three-icosa shaderを再構築中"}
      </span> : null}

      {!compact && loadState.status === "error" ? (
        <div className="absolute inset-x-2 bottom-2 rounded border border-rose-300/40 bg-rose-950/90 p-2 text-[10px] leading-4 text-rose-100 backdrop-blur">
          <p>{loadState.message}</p>
          <button
            type="button"
            onClick={() => setLoadRevision((value) => value + 1)}
            className="mt-1 rounded border border-rose-200/50 bg-white/10 px-2 py-0.5 font-semibold hover:bg-white/20"
          >
            再試行
          </button>
        </div>
      ) : !compact && runtimeInfo?.pbrFallback ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded border border-amber-300/40 bg-amber-950/90 px-2 py-1.5 text-[10px] leading-4 text-amber-100 backdrop-blur">
          {formatPbrFallbackReason(runtimeInfo.pbrFallback.reason)}
        </div>
      ) : !compact ? (
        <span className="pointer-events-none absolute inset-x-2 bottom-1.5 text-center text-[9px] text-slate-300/80">
          実ストローク形状 · ドラッグで回転 · ホイールでズーム
        </span>
      ) : null}
    </div>
  );
}

function formatPbrFallbackReason(
  reason: "unsupported-preset" | "shader-load-error" | "attribute-mismatch",
): string {
  if (reason === "unsupported-preset") {
    return "未対応のブラシpresetのため、GLB内のPBR Materialを表示しています";
  }
  return reason === "attribute-mismatch"
    ? "必要なMesh attributeがないため、GLB内のPBR Materialを表示しています"
    : "専用shaderを再構築できなかったため、GLB内のPBR Materialを表示しています";
}

function PreviewTurntable({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (enabled && ref.current) ref.current.rotation.y += Math.min(delta, 0.05) * 0.22;
  });
  return <group ref={ref}>{children}</group>;
}

function PreviewMessage({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-slate-100 px-3 text-center ${className}`}
    >
      {children}
    </div>
  );
}
