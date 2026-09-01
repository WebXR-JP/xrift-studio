import { readImageDimensions } from "../../lib/visual-editor/gltf-derived-assets";
import { readProjectAssetBytes, textureProcessingSettings } from "../../lib/visual-editor/texture-processing";
import { normalizeTextureImportSettings } from "../../lib/visual-editor/asset-manifest";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  isDrivenShaderUniform,
  resolveShaderUniformLabel,
} from "../../lib/visual-editor";
import { Color, DoubleSide, type Material } from "three";
import { tauri } from "../../lib/tauri";
import {
  TEXTURE_COLOR_SPACES,
  OPEN_BRUSH_CATALOG,
  TEXTURE_COMPRESSION_FORMATS,
  TEXTURE_MAG_FILTERS,
  TEXTURE_MIN_FILTERS,
  TEXTURE_WRAP_MODES,
  createDefaultCustomShader,
  getTextureSourceFormat,
  getPrefabAssetDocumentReference,
  isEnvironmentTextureAsset,
  LIT_MATERIAL_EXTENSION_NAMES,
  ASSET_KIND_UI,
  resolveOpenBrushBuiltinTextureUrl,
  type AudioAsset,
  type AssetManifest,
  type Color3,
  type Color4,
  type ClassicR3fMaterialShader,
  type ClassicR3fShaderUniform,
  type MaterialAsset,
  type MaterialBlendMode,
  type MaterialDepthWrite,
  type MaterialAssetPatch,
  type MaterialExtensionsPatch,
  type MaterialTextureInfo,
  type MaterialTextureInfoPatch,
  type MaterialTextureTransform,
  type ModelAssetPatch,
  type ModelOptimizationOptions,
  type ParticlePropertiesPatch,
  type PrefabDocument,
  type PrefabAsset,
  type SceneAsset,
  type ShaderAsset,
  type ShaderAssetStage,
  type TextureAsset,
  type TextureAssetPatch,
  type TextureCardProfile,
  describeTextureOptimization,
  planTextureProcessing,
  resolveTargetSize,
  TEXTURE_MAX_SIZE_CHOICES,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import { CatalogThumbnailImage } from "./CatalogThumbnailImage";
import { formatFileSize } from "./editor-utils";
import { AssetOptimizationOriginCard } from "./AssetOptimizationOriginCard";
import { ParticleAssetInspector } from "./ParticleAssetInspector";
import { CustomMaterialPreview } from "./CustomMaterialPreview";
import type { ProjectModelMaterialRuntimeInfo } from "./ProjectModelVisual";
import {
  ModelAssetInspector,
  type ModelOptimizationState,
  type ModelReimportImpactNotice,
  type ModelReimportState,
} from "./ModelAssetInspector";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { ScrubNumberInput } from "./ScrubNumberInput";
import { useValueScrubTransaction } from "./value-scrub-transaction";
import { TEXTURE_DRAG_MIME } from "./types";
import {
  type MaterialPreviewTextureLoadStatus,
  type MaterialPreviewTextureStatuses,
  resolveMaterialPreviewTextureDisplayStatus,
  useMaterialPreviewRenderSync,
  useMaterialPreviewTextureState,
} from "./material-texture-preview";
import { WebGlThumbnailCapture } from "./WebGlThumbnailCapture";

const INPUT_CLASS =
  "h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const EMPTY_ASSET_MANIFEST: AssetManifest = {
  schemaVersion: "0.1.0",
  assets: {},
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function channelToHex(value: number): string {
  return Math.round(clampUnit(value) * 255)
    .toString(16)
    .padStart(2, "0");
}

function colorToHex(value: Color3 | Color4 | undefined, fallback: string): string {
  if (!value || value.length < 3) return fallback;
  return `#${channelToHex(value[0])}${channelToHex(value[1])}${channelToHex(value[2])}`;
}

function hexToRgb(value: string): Color3 | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function colorToThree(value: Color3 | undefined, fallback: Color3): Color {
  const source = value ?? fallback;
  return new Color(source[0], source[1], source[2]);
}

function sourceLabel(asset: SceneAsset): string {
  if (asset.source.kind === "builtin") return `Builtin / ${asset.source.key}`;
  if (asset.source.kind === "project") return asset.source.relativePath;
  return "Document内の設定（画像データなし）";
}

function MaterialPreviewScene({
  asset,
  assets,
  projectPath,
  onTextureStatusesChange,
}: {
  asset: MaterialAsset;
  assets?: AssetManifest;
  projectPath?: string;
  onTextureStatusesChange?: (statuses: MaterialPreviewTextureStatuses) => void;
}) {
  const pbr = asset.properties.pbrMetallicRoughness;
  const color = colorToHex(pbr?.baseColorFactor, asset.properties.color ?? "#ffffff");
  const baseAlpha = pbr?.baseColorFactor?.[3] ?? asset.properties.opacity ?? 1;
  const opacity = asset.properties.alphaMode === "OPAQUE" ? 1 : baseAlpha;
  const emissive = colorToHex(asset.properties.emissiveFactor, "#000000");
  const { textures, statuses } = useMaterialPreviewTextureState(
    asset,
    assets ?? EMPTY_ASSET_MANIFEST,
    projectPath,
  );
  useEffect(() => {
    onTextureStatusesChange?.(statuses);
  }, [onTextureStatusesChange, statuses]);
  const previewMaterialRef = useRef<Material | null>(null);
  const capturePreviewMaterial = useCallback((material: Material | null) => {
    previewMaterialRef.current = material;
  }, []);
  useMaterialPreviewRenderSync(previewMaterialRef, textures);
  const extensions = asset.properties.extensions;
  const anisotropy = extensions.KHR_materials_anisotropy;
  const clearcoat = extensions.KHR_materials_clearcoat;
  const dispersion = extensions.KHR_materials_dispersion;
  const emissiveStrength =
    extensions.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
  const ior = extensions.KHR_materials_ior;
  const iridescence = extensions.KHR_materials_iridescence;
  const sheen = extensions.KHR_materials_sheen;
  const specular = extensions.KHR_materials_specular;
  const transmission = extensions.KHR_materials_transmission;
  const volume = extensions.KHR_materials_volume;
  const unlit = extensions.KHR_materials_unlit !== undefined;
  const usesPhysicalMaterial = Boolean(
    anisotropy ||
      clearcoat ||
      dispersion ||
      ior ||
      iridescence ||
      sheen ||
      specular ||
      transmission ||
      volume,
  );
  const transparent = asset.properties.alphaMode === "BLEND";
  const alphaTest =
    asset.properties.alphaMode === "MASK" ? asset.properties.alphaCutoff : 0;
  const side = asset.properties.doubleSided ? DoubleSide : undefined;

  return (
    <>
      <color attach="background" args={["#f8fafc"]} />
      <ambientLight intensity={1.45} />
      <directionalLight position={[2.5, 3, 4]} intensity={2.8} />
      <directionalLight position={[-2, -1, 1]} intensity={0.65} color="#ddd6fe" />
      <mesh rotation={[0.16, 0.42, 0]}>
        <sphereGeometry args={[0.78, 32, 24]} />
        {unlit ? (
          <meshBasicMaterial
            ref={capturePreviewMaterial}
            color={color}
            opacity={opacity}
            transparent={transparent}
            depthWrite={asset.properties.alphaMode !== "BLEND"}
            alphaTest={alphaTest}
            side={side}
            map={textures.baseColorMap}
          />
        ) : usesPhysicalMaterial ? (
          <meshPhysicalMaterial
            ref={capturePreviewMaterial}
            color={color}
            metalness={pbr?.metallicFactor ?? asset.properties.metalness ?? 0}
            roughness={pbr?.roughnessFactor ?? asset.properties.roughness ?? 1}
            emissive={emissive}
            emissiveIntensity={emissiveStrength}
            opacity={opacity}
            transparent={transparent}
            depthWrite={asset.properties.alphaMode !== "BLEND"}
            alphaTest={alphaTest}
            side={side}
            map={textures.baseColorMap}
            metalnessMap={textures.metallicRoughnessMap}
            roughnessMap={textures.metallicRoughnessMap}
            normalMap={textures.normalMap}
            normalScale={[
              asset.properties.normalTexture?.scale ?? 1,
              asset.properties.normalTexture?.scale ?? 1,
            ]}
            aoMap={textures.occlusionMap}
            aoMapIntensity={asset.properties.occlusionTexture?.strength ?? 1}
            emissiveMap={textures.emissiveMap}
            anisotropy={anisotropy?.anisotropyStrength ?? 0}
            anisotropyRotation={anisotropy?.anisotropyRotation ?? 0}
            anisotropyMap={textures.anisotropyMap}
            clearcoat={clearcoat?.clearcoatFactor ?? 0}
            clearcoatMap={textures.clearcoatMap}
            clearcoatRoughness={clearcoat?.clearcoatRoughnessFactor ?? 0}
            clearcoatRoughnessMap={textures.clearcoatRoughnessMap}
            clearcoatNormalMap={textures.clearcoatNormalMap}
            clearcoatNormalScale={[
              clearcoat?.clearcoatNormalTexture?.scale ?? 1,
              clearcoat?.clearcoatNormalTexture?.scale ?? 1,
            ]}
            dispersion={dispersion?.dispersion ?? 0}
            ior={ior?.ior === 0 ? 1000 : (ior?.ior ?? 1.5)}
            iridescence={iridescence?.iridescenceFactor ?? 0}
            iridescenceIOR={iridescence?.iridescenceIor ?? 1.3}
            iridescenceThicknessRange={[
              iridescence?.iridescenceThicknessMinimum ?? 100,
              iridescence?.iridescenceThicknessMaximum ?? 400,
            ]}
            iridescenceMap={textures.iridescenceMap}
            iridescenceThicknessMap={textures.iridescenceThicknessMap}
            sheen={sheen ? 1 : 0}
            sheenColor={colorToThree(sheen?.sheenColorFactor, [0, 0, 0])}
            sheenColorMap={textures.sheenColorMap}
            sheenRoughness={sheen?.sheenRoughnessFactor ?? 0}
            sheenRoughnessMap={textures.sheenRoughnessMap}
            specularIntensity={specular?.specularFactor ?? 1}
            specularIntensityMap={textures.specularIntensityMap}
            specularColor={colorToThree(
              specular?.specularColorFactor,
              [1, 1, 1],
            )}
            specularColorMap={textures.specularColorMap}
            transmission={transmission?.transmissionFactor ?? 0}
            transmissionMap={textures.transmissionMap}
            thickness={volume?.thicknessFactor ?? 0}
            thicknessMap={textures.thicknessMap}
            attenuationDistance={volume?.attenuationDistance ?? Number.POSITIVE_INFINITY}
            attenuationColor={colorToThree(
              volume?.attenuationColor,
              [1, 1, 1],
            )}
          />
        ) : (
          <meshStandardMaterial
            ref={capturePreviewMaterial}
            color={color}
            metalness={pbr?.metallicFactor ?? asset.properties.metalness ?? 0}
            roughness={pbr?.roughnessFactor ?? asset.properties.roughness ?? 1}
            emissive={emissive}
            emissiveIntensity={emissiveStrength}
            opacity={opacity}
            transparent={transparent}
            depthWrite={asset.properties.alphaMode !== "BLEND"}
            alphaTest={alphaTest}
            side={side}
            map={textures.baseColorMap}
            metalnessMap={textures.metallicRoughnessMap}
            roughnessMap={textures.metallicRoughnessMap}
            normalMap={textures.normalMap}
            normalScale={[
              asset.properties.normalTexture?.scale ?? 1,
              asset.properties.normalTexture?.scale ?? 1,
            ]}
            aoMap={textures.occlusionMap}
            aoMapIntensity={asset.properties.occlusionTexture?.strength ?? 1}
            emissiveMap={textures.emissiveMap}
          />
        )}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.83, 0]}>
        <circleGeometry args={[0.86, 32]} />
        <meshStandardMaterial color="#dbe3ec" roughness={1} />
      </mesh>
    </>
  );
}

export function MaterialThumbnail({
  asset,
  assets,
  projectPath,
  className = "h-full w-full",
  onTextureStatusesChange,
  captureKey,
  onCapture,
  onCaptureError,
}: {
  asset: MaterialAsset;
  assets?: AssetManifest;
  projectPath?: string;
  className?: string;
  onTextureStatusesChange?: (statuses: MaterialPreviewTextureStatuses) => void;
  captureKey?: string;
  onCapture?: (dataUrl: string) => void;
  onCaptureError?: (message: string) => void;
}) {
  const [previewTextureState, setPreviewTextureState] = useState<{
    assetId: string;
    statuses: MaterialPreviewTextureStatuses;
  } | null>(null);
  const handleTextureStatusesChange = useCallback(
    (statuses: MaterialPreviewTextureStatuses) => {
      setPreviewTextureState({ assetId: asset.id, statuses });
      onTextureStatusesChange?.(statuses);
    },
    [asset.id, onTextureStatusesChange],
  );
  const captureReady = Boolean(
    captureKey &&
      onCapture &&
      previewTextureState?.assetId === asset.id &&
      !Object.values(previewTextureState.statuses).includes("loading"),
  );

  if (
    asset.shader?.kind === "openbrush" ||
    asset.shader?.kind === "classic-r3f"
  ) {
    return (
      <CustomMaterialPreview
        asset={asset}
        assets={assets ?? EMPTY_ASSET_MANIFEST}
        projectPath={projectPath}
        className={className}
        compact
        captureKey={captureKey}
        onCapture={onCapture}
        onCaptureError={onCaptureError}
      />
    );
  }
  return (
    <div className={`overflow-hidden bg-slate-50 ${className}`}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 2.7], fov: 34 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: Boolean(onCapture),
        }}
      >
        <MaterialPreviewScene
          asset={asset}
          assets={assets}
          projectPath={projectPath}
          onTextureStatusesChange={handleTextureStatusesChange}
        />
        {captureKey && onCapture ? (
          <WebGlThumbnailCapture
            captureKey={captureKey}
            ready={captureReady}
            onCapture={onCapture}
            onError={onCaptureError}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

function AssetThumbnailFallback({ asset }: { asset: SceneAsset }) {
  const Icon = EDITOR_ICONS[ASSET_KIND_UI[asset.kind].icon];
  const label =
    asset.status === "invalid"
      ? "解析失敗・再生成"
      : asset.status === "missing"
        ? "ソース未検出・再取込"
        : asset.kind === "audio"
          ? asset.importMetadata.sourceFormat.toUpperCase()
          : asset.kind === "script"
            ? "TypeScript"
          : asset.kind === "shader"
            ? "GLSL"
          : isEnvironmentTextureAsset(asset)
            ? "HDRIプレビューを生成中"
            : asset.kind === "material"
              ? "Material"
              : asset.kind === "model"
                ? "サムネイルを生成中"
                : "プレビュー準備中";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-slate-500">
      <Icon size={24} aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function PrefabQuickEditor({
  asset,
  document,
  readOnly,
  onSelectSourceEntity,
  onUpdate,
}: {
  asset: PrefabAsset;
  document?: PrefabDocument;
  readOnly: boolean;
  onSelectSourceEntity: (entityId: string) => void;
  onUpdate: () => void;
}) {
  if (!document) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
        Prefab documentが見つかりません。Assetの参照先を確認してください。
      </div>
    );
  }
  const rows: Array<{ id: string; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (entityId: string, depth: number) => {
    if (visited.has(entityId) || !document.entities[entityId]) return;
    visited.add(entityId);
    rows.push({ id: entityId, depth });
    document.entities[entityId].children.forEach((childId) =>
      visit(childId, depth + 1),
    );
  };
  document.rootEntityIds.forEach((entityId) => visit(entityId, 0));
  const firstSourceRoot = document.source.rootEntityIds[0];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h3 className="truncate text-[13px] font-semibold text-slate-900">
          {asset.name}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {rows.length} Entity・{document.rootEntityIds.length} Root
        </p>
      </div>
      <EditorSection title="Prefab Hierarchy">
        <div className="max-h-80 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-1">
          {rows.map(({ id, depth }) => {
            const entity = document.entities[id];
            const sourceEntityId = document.sourceEntityMap?.[id];
            return (
              <button
                key={id}
                type="button"
                disabled={!sourceEntityId}
                onClick={() => sourceEntityId && onSelectSourceEntity(sourceEntityId)}
                className="flex h-7 w-full items-center rounded px-2 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-default disabled:text-slate-500"
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                title={
                  sourceEntityId
                    ? `${entity.name}をsource Hierarchyで開く`
                    : entity.name
                }
              >
                <span className="truncate">{entity.name}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-4 text-slate-500">
          Entityを選ぶと編集元のHierarchyへ移動します。構造を変更した後はUpdateでPrefabへ反映します。
        </p>
      </EditorSection>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!firstSourceRoot}
          onClick={() => firstSourceRoot && onSelectSourceEntity(firstSourceRoot)}
          className="rounded border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Sourceを開く
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onUpdate}
          className="rounded border border-violet-300 bg-violet-50 px-2 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-40"
        >
          PrefabをUpdate
        </button>
      </div>
    </div>
  );
}

function AudioAssetInspector({
  asset,
  projectPath,
}: {
  asset: AudioAsset;
  projectPath?: string;
}) {
  const AudioIcon = EDITOR_ICONS.audio;
  const [source, setSource] = useState<
    | { status: "loading" }
    | { status: "ready"; dataUrl: string }
    | { status: "failed" }
  >({ status: "loading" });

  useEffect(() => {
    if (!projectPath || asset.source.kind !== "project") {
      setSource({ status: "failed" });
      return;
    }
    let active = true;
    setSource({ status: "loading" });
    void tauri
      .readAudioDataUrl(projectPath, asset.source.relativePath)
      .then((dataUrl) => {
        if (active) setSource({ status: "ready", dataUrl });
      })
      .catch(() => {
        if (active) setSource({ status: "failed" });
      });
    return () => {
      active = false;
    };
  }, [asset.source, projectPath]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          <AudioIcon size={24} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">
            {asset.name}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {asset.importMetadata.sourceFormat.toUpperCase()}・{formatFileSize(asset.importMetadata.byteLength)}
          </p>
        </div>
      </div>
      <EditorSection title="Source">
        <p className="break-all text-xs leading-4 text-slate-600">
          {sourceLabel(asset)}
        </p>
        <p className="text-[11px] leading-4 text-slate-500">
          Audio Sourceから参照され、実行・公開時に管理済み音声としてコピーされます。
        </p>
      </EditorSection>
      <EditorSection title="試聴">
        {source.status === "loading" ? (
          <p className="text-xs text-slate-500">再生用の音源を読み込んでいます。</p>
        ) : null}
        {source.status === "ready" ? (
          <audio controls preload="metadata" src={source.dataUrl} className="h-9 w-full">
            このブラウザでは音声を再生できません。
          </audio>
        ) : null}
        {source.status === "failed" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-4 text-amber-800">
            このAudio Assetの再生用ファイルを読み込めませんでした。Assetsの保存先を確認して、再取込してください。
          </p>
        ) : null}
      </EditorSection>
    </div>
  );
}

const PROJECT_THUMBNAIL_CACHE = new Map<string, Promise<string>>();

function ProjectAssetThumbnail({
  asset,
  projectPath,
  derivedPath,
  stale,
}: {
  asset: SceneAsset;
  projectPath: string;
  derivedPath: string;
  stale: boolean;
}) {
  const cacheKey = `${projectPath}\n${derivedPath}`;
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; dataUrl: string }
    | { status: "failed" }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const pending =
      PROJECT_THUMBNAIL_CACHE.get(cacheKey) ??
      tauri.readImageDataUrl(projectPath, derivedPath);
    PROJECT_THUMBNAIL_CACHE.set(cacheKey, pending);
    void pending
      .then((dataUrl) => {
        if (active) setState({ status: "ready", dataUrl });
      })
      .catch(() => {
        PROJECT_THUMBNAIL_CACHE.delete(cacheKey);
        if (active) setState({ status: "failed" });
      });
    return () => {
      active = false;
    };
  }, [cacheKey, derivedPath, projectPath]);

  if (state.status === "ready") {
    return (
      <div className="relative h-full w-full bg-white">
        <img
          src={state.dataUrl}
          alt={`${asset.name}のプレビュー`}
          draggable={false}
          className="h-full w-full bg-white object-contain p-1"
        />
        {stale ? (
          <span className="absolute bottom-1 right-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
            古いプレビュー
          </span>
        ) : null}
      </div>
    );
  }

  const Icon = EDITOR_ICONS[ASSET_KIND_UI[asset.kind].icon];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white text-slate-500">
      <Icon size={22} aria-hidden="true" />
      <span className="text-xs font-medium">
        {state.status === "loading"
          ? "プレビュー準備中"
          : "プレビュー読込失敗・再生成"}
      </span>
    </div>
  );
}

export function AssetThumbnail({
  asset,
  assets,
  projectPath,
}: {
  asset: SceneAsset;
  assets?: AssetManifest;
  projectPath?: string;
}) {
  if (asset.status !== "ready") return <AssetThumbnailFallback asset={asset} />;

  if (asset.kind === "material") {
    return projectPath && asset.thumbnail && asset.thumbnail.status !== "missing" ? (
      <ProjectAssetThumbnail
        asset={asset}
        projectPath={projectPath}
        derivedPath={asset.thumbnail.derivedPath}
        stale={asset.thumbnail.status === "stale"}
      />
    ) : (
      <MaterialFallbackThumbnail
        asset={asset}
        assets={assets}
        projectPath={projectPath}
      />
    );
  }
  if (
    projectPath &&
    asset.thumbnail &&
    asset.thumbnail.status !== "missing"
  ) {
    return (
      <ProjectAssetThumbnail
        asset={asset}
        projectPath={projectPath}
        derivedPath={asset.thumbnail.derivedPath}
        stale={asset.thumbnail.status === "stale"}
      />
    );
  }
  if (
    projectPath &&
    asset.kind === "texture" &&
    asset.source.kind === "project" &&
    /\.(?:png|jpe?g|webp)$/i.test(asset.source.relativePath)
  ) {
    return (
      <ProjectAssetThumbnail
        asset={asset}
        projectPath={projectPath}
        derivedPath={asset.source.relativePath}
        stale={false}
      />
    );
  }
  if (asset.kind === "texture" && asset.source.kind === "builtin") {
    const sourceUrl = resolveOpenBrushBuiltinTextureUrl(asset.source.key);
    if (sourceUrl) {
      return (
        <div className="h-full w-full bg-white">
          <img
            src={sourceUrl}
            alt={`${asset.name}のプレビュー`}
            draggable={false}
            className="h-full w-full object-contain p-1"
          />
        </div>
      );
    }
  }
  return <AssetThumbnailFallback asset={asset} />;
}

function MaterialFallbackThumbnail({
  asset,
  assets,
  projectPath,
}: {
  asset: MaterialAsset;
  assets?: AssetManifest;
  projectPath?: string;
}) {
  const shader = asset.shader;
  if (shader?.kind === "openbrush") {
    const entry = OPEN_BRUSH_CATALOG.find(
      (candidate) =>
        candidate.brushGuid === shader.brushGuid ||
        candidate.brushName === shader.brushName,
    );
    if (entry) {
      const Icon = EDITOR_ICONS.material;
      return (
        <CatalogThumbnailImage
          src={entry.thumbnailUrl}
          alt={`${asset.name}のOpen Brushプレビュー`}
          fallback={<Icon size={22} aria-hidden="true" />}
        />
      );
    }
  }
  const textureAssetId =
    asset.properties.pbrMetallicRoughness?.baseColorTexture?.textureAssetId;
  const texture = textureAssetId ? assets?.assets[textureAssetId] : undefined;
  if (texture?.kind === "texture") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-white">
        <AssetThumbnail
          asset={texture}
          assets={assets}
          projectPath={projectPath}
        />
        <span className="absolute bottom-1 right-1 rounded bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
          Material
        </span>
      </div>
    );
  }
  const color = colorToHex(
    asset.properties.pbrMetallicRoughness?.baseColorFactor,
    asset.properties.color ?? "#ffffff",
  );
  const Icon = EDITOR_ICONS.material;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-700"
      style={{
        background: `radial-gradient(circle at 35% 25%, #ffffff 0%, ${color} 42%, #cbd5e1 140%)`,
      }}
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/75 shadow-sm backdrop-blur">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="rounded bg-white/75 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur">
        Material
      </span>
    </div>
  );
}

function EditorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
      <h4 className="mb-2 text-[13px] font-semibold text-slate-800">{title}</h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RangeControl({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  description,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const transaction = useValueScrubTransaction();
  return (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        <ScrubNumberInput
          ariaLabel={`${label}の数値`}
          scrubLabel={label}
          min={min}
          max={max}
          step={step}
          value={Number.isInteger(step) ? value : Number(value.toFixed(3))}
          disabled={disabled}
          size="xs"
          wrapperClassName="w-20 shrink-0"
          onChange={onChange}
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => transaction?.begin()}
        onPointerUp={() => transaction?.end()}
        onPointerCancel={() => transaction?.cancel()}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {description ? (
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  description,
  disabled,
  isAllowed,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  disabled: boolean;
  isAllowed?: (value: number) => boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 block">{label}</span>
      <ScrubNumberInput
        value={Number(value.toFixed(4))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        size="sm"
        ariaLabel={label}
        scrubLabel={label}
        onChange={(next) => {
          if (isAllowed && !isAllowed(next)) return;
          onChange(next);
        }}
      />
      {description ? (
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function Color3Control({
  label,
  value,
  description,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: Color3;
  description: string;
  max?: number;
  disabled: boolean;
  onChange: (value: Color3) => void;
}) {
  const hex = colorToHex(value, "#ffffff");
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-slate-500">{hex}</span>
          <input
            type="color"
            value={hex}
            disabled={disabled}
            aria-label={`${label}のカラーピッカー`}
            onChange={(event) => {
              const color = hexToRgb(event.currentTarget.value);
              if (color) onChange(color);
            }}
            className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(["R", "G", "B"] as const).map((channel, index) => (
          <ScrubNumberInput
            key={channel}
            min={0}
            max={max}
            step={0.01}
            scrubStep={0.005}
            value={Number(value[index].toFixed(3))}
            disabled={disabled}
            size="sm"
            prefix={channel}
            ariaLabel={`${label} ${channel}`}
            scrubLabel={`${label} ${channel}`}
            onChange={(next) => {
              const color: Color3 = [value[0], value[1], value[2]];
              color[index] = next;
              onChange(color);
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
    </fieldset>
  );
}

function MaterialExtensionSection({
  title,
  extensionName,
  description,
  enabled,
  readOnly,
  onToggle,
  children,
}: {
  title: string;
  extensionName: string;
  description: string;
  enabled: boolean;
  readOnly: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-md border bg-white p-2 shadow-sm transition-colors ${
        enabled ? "border-violet-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-slate-800">{title}</h4>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
          <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
            {extensionName}
          </code>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600">
          <span>{enabled ? "有効" : "無効"}</span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={readOnly}
            aria-label={`${title}を有効にする`}
            onChange={(event) => onToggle(event.currentTarget.checked)}
            className="h-4 w-4 accent-violet-600"
          />
        </label>
      </div>
      {enabled ? (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

const DEFAULT_TEXTURE_TRANSFORM: MaterialTextureTransform = {
  offset: [0, 0],
  rotation: 0,
  scale: [1, 1],
};

type TextureSlotPatch = Exclude<MaterialTextureInfoPatch, string>;

function TextureVectorControl({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: [number, number];
  disabled: boolean;
  onChange: (value: [number, number]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-medium text-slate-500">{label}</legend>
      <div className="grid grid-cols-2 gap-1">
        {(["X", "Y"] as const).map((axis, index) => (
          <ScrubNumberInput
            key={axis}
            step={0.01}
            scrubStep={0.01}
            value={value[index]}
            disabled={disabled}
            size="sm"
            prefix={axis}
            ariaLabel={`${label} ${axis}`}
            scrubLabel={`${label} ${axis}`}
            onChange={(next) =>
              onChange(index === 0 ? [next, value[1]] : [value[0], next])
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function TextureSlot({
  label,
  description,
  value,
  textures,
  projectPath,
  disabled,
  previewStatus,
  onChange,
  onOpenTexture,
}: {
  label: string;
  description: string;
  value?: MaterialTextureInfo;
  textures: TextureAsset[];
  projectPath?: string;
  disabled: boolean;
  previewStatus?: MaterialPreviewTextureLoadStatus;
  onChange: (value: TextureSlotPatch) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const [showTransform, setShowTransform] = useState(true);
  const selectedTexture = value
    ? textures.find((texture) => texture.id === value.textureAssetId)
    : undefined;
  const missingReference = Boolean(value && !selectedTexture);
  const displayedPreviewStatus = resolveMaterialPreviewTextureDisplayStatus(
    selectedTexture,
    previewStatus,
  );
  const transform = value?.transform ?? DEFAULT_TEXTURE_TRANSFORM;
  const TextureIcon = EDITOR_ICONS.texture;

  useEffect(() => {
    if (value?.transform) setShowTransform(true);
  }, [value?.transform]);

  const updateTransform = (patch: Partial<MaterialTextureTransform>) => {
    if (!value) return;
    onChange({
      ...value,
      transform: {
        offset: patch.offset ?? transform.offset,
        rotation: patch.rotation ?? transform.rotation,
        scale: patch.scale ?? transform.scale,
      },
    });
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const textureAssetId = readEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME);
    clearEditorDragData();
    setDropActive(false);
    if (!textures.some((texture) => texture.id === textureAssetId)) return;
    onChange({
      ...(value ?? {}),
      textureAssetId,
      texCoord: value?.texCoord ?? 0,
    });
  };

  return (
    <div
      onDragOverCapture={handleDragOver}
      onDragEnterCapture={handleDragOver}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        setDropActive(false);
      }}
      onDropCapture={handleDrop}
      className={`relative rounded-md border p-2 transition-colors ${
        dropActive
          ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
          : missingReference
            ? "border-rose-300 bg-rose-50/60"
            : "border-slate-200 bg-slate-50/70"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800">{label}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
        </div>
        {value?.transform ? (
          <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
            タイリング {transform.scale[0]} × {transform.scale[1]}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
        <div className="h-10 overflow-hidden rounded border border-slate-200 bg-white">
          {selectedTexture ? (
            <AssetThumbnail asset={selectedTexture} projectPath={projectPath} />
          ) : (
            <span className="flex h-full items-center justify-center text-slate-400">
              <TextureIcon size={18} aria-hidden="true" />
            </span>
          )}
        </div>
        <label className="block min-w-0 text-[11px] text-slate-500">
          Texture Asset
          <select
            value={value?.textureAssetId ?? ""}
            disabled={disabled || textures.length === 0}
            onChange={(event) => {
              const textureAssetId = event.currentTarget.value;
              onChange(
                textureAssetId
                  ? {
                      ...(value ?? {}),
                      textureAssetId,
                      texCoord: value?.texCoord ?? 0,
                    }
                  : null,
              );
            }}
            className={INPUT_CLASS}
          >
            <option value="">なし</option>
            {missingReference && value ? (
              <option value={value.textureAssetId}>不明な参照: {value.textureAssetId}</option>
            ) : null}
            {textures.map((texture) => (
              <option key={texture.id} value={texture.id}>
                {texture.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {textures.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] leading-4 text-slate-500">
          利用できるTexture Assetがありません。Assetsへ画像をインポートしてください。
        </p>
      ) : null}
      {missingReference && value ? (
        <p className="mt-2 text-[11px] font-medium leading-4 text-rose-700">
          参照先のTexture Assetが見つかりません。別のTextureを選ぶか解除してください。
        </p>
      ) : null}
      {displayedPreviewStatus ? (
        <p
          role={displayedPreviewStatus === "error" ? "alert" : "status"}
          className={`mt-2 rounded border px-2 py-1.5 text-[11px] font-medium leading-4 ${
            displayedPreviewStatus === "ready"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : displayedPreviewStatus === "loading"
                ? "border-sky-200 bg-sky-50 text-sky-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {displayedPreviewStatus === "ready"
            ? "シーンビューに反映済み"
            : displayedPreviewStatus === "loading"
              ? "シーンビューへ反映中…"
              : "シーンビューでTextureを読み込めませんでした。Texture設定を確認してください。"}
        </p>
      ) : null}

      {value ? (
        <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
            <label className="block text-[11px] text-slate-500">
              UV Set
              <ScrubNumberInput
                min={0}
                step={1}
                precision={0}
                value={value.texCoord}
                disabled={disabled}
                size="sm"
                ariaLabel="UV Set"
                scrubLabel="UV Set"
                onChange={(texCoord) =>
                  onChange({ ...value, texCoord: Math.round(texCoord) })
                }
              />
            </label>
            <div className="min-w-0 text-[11px] text-slate-500">
              <span className="block">Sampler参照</span>
              <p className="mt-1 truncate rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-700" title={selectedTexture ? `${selectedTexture.importSettings.sampler.wrapS} / ${selectedTexture.importSettings.sampler.wrapT} / ${selectedTexture.importSettings.sampler.minFilter}` : "参照先なし"}>
                {selectedTexture
                  ? `${selectedTexture.importSettings.sampler.wrapS} · ${selectedTexture.importSettings.sampler.wrapT} · ${selectedTexture.importSettings.sampler.minFilter}`
                  : "参照先なし"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTransform((current) => !current)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showTransform ? "タイリング設定を閉じる" : "タイリング / UV変換"}
            </button>
            <button
              type="button"
              disabled={!selectedTexture}
              onClick={() => selectedTexture && onOpenTexture(selectedTexture.id)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Texture設定を開く
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              解除
            </button>
          </div>

          {showTransform ? (
            <div className="space-y-2 rounded border border-sky-200 bg-white p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] leading-4 text-slate-500">
                  glTF KHR_texture_transform互換。タイリングを2にするとTextureが2回繰り返されます。
                </p>
                <button
                  type="button"
                  disabled={disabled || !value.transform}
                  onClick={() => onChange({ ...value, transform: null })}
                  className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  初期値へ戻す
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextureVectorControl
                  label="Offset"
                  value={transform.offset}
                  disabled={disabled}
                  onChange={(offset) => updateTransform({ offset })}
                />
                <TextureVectorControl
                  label="タイリング"
                  value={transform.scale}
                  disabled={disabled}
                  onChange={(scale) => updateTransform({ scale })}
                />
              </div>
              <label className="block text-[11px] font-medium text-slate-500">
                Rotation (°)
                <ScrubNumberInput
                  step={1}
                  scrubStep={0.5}
                  value={Number(((transform.rotation * 180) / Math.PI).toFixed(2))}
                  disabled={disabled}
                  size="sm"
                  ariaLabel="Rotation (°)"
                  scrubLabel="Rotation"
                  onChange={(degrees) =>
                    updateTransform({ rotation: (degrees * Math.PI) / 180 })
                  }
                />
              </label>
              {selectedTexture &&
              (transform.scale[0] !== 1 || transform.scale[1] !== 1) &&
              (selectedTexture.importSettings.sampler.wrapS !== "repeat" ||
                selectedTexture.importSettings.sampler.wrapT !== "repeat") ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                  繰り返し表示にはTexture設定のWrap S / TをRepeatにしてください。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {dropActive ? (
        <span className="pointer-events-none absolute inset-1 flex items-center justify-center rounded bg-violet-600/95 px-2 text-center text-xs font-semibold text-white shadow-sm">
          {label}へTextureを設定
        </span>
      ) : null}
    </div>
  );
}

function disabledLitMaterialExtensions(): MaterialExtensionsPatch {
  return Object.fromEntries(
    LIT_MATERIAL_EXTENSION_NAMES.map((name) => [name, null]),
  ) as MaterialExtensionsPatch;
}

type MaterialQuickEditorProps = {
  asset: MaterialAsset;
  assets: AssetManifest;
  projectPath?: string;
  referenceSummary?: { entityCount: number; slotCount: number };
  readOnly: boolean;
  onChange: (patch: MaterialAssetPatch) => void;
  onOpenTexture: (assetId: string) => void;
  onOpenShader: (assetId: string) => void;
  onOpenMaterialShader: (assetId: string, stage: ShaderAssetStage) => void;
  onAssignShaderAsset: (
    materialAssetId: string,
    stage: ShaderAssetStage,
    shaderAssetId: string | null,
  ) => void;
};

export function MaterialQuickEditor(props: MaterialQuickEditorProps) {
  return <StandardMaterialQuickEditor {...props} />;
}

export function OpenBrushMaterialQuickEditor({
  asset,
  assets,
  projectPath,
  referenceSummary,
  readOnly,
  onChange,
}: MaterialQuickEditorProps) {
  const shader = asset.shader;
  const [runtimeInfo, setRuntimeInfo] =
    useState<ProjectModelMaterialRuntimeInfo | null>(null);
  const handleRuntimeInfoChange = useCallback(
    (info: ProjectModelMaterialRuntimeInfo | null) => setRuntimeInfo(info),
    [],
  );
  if (!shader || shader.kind !== "openbrush") return null;
  const updateShaderSource = (
    stage: "vertexShader" | "fragmentShader",
    source: string | undefined,
  ) => {
    const sourceOverrides = { ...(shader.sourceOverrides ?? {}) };
    if (source === undefined) delete sourceOverrides[stage];
    else sourceOverrides[stage] = source;
    onChange({
      shader: {
        ...shader,
        sourceOverrides:
          Object.keys(sourceOverrides).length > 0 ? sourceOverrides : undefined,
      },
    });
  };
  const updateAttributeSource = (
    shaderName: string,
    sourceAttribute: string,
  ) => {
    const attributeBindings = { ...(shader.attributeBindings ?? {}) };
    const normalized = sourceAttribute.trim();
    if (normalized) attributeBindings[shaderName] = { sourceAttribute: normalized };
    else delete attributeBindings[shaderName];
    onChange({
      shader: {
        ...shader,
        attributeBindings:
          Object.keys(attributeBindings).length > 0
            ? attributeBindings
            : undefined,
      },
    });
  };
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-violet-200 bg-white shadow-sm">
        <CustomMaterialPreview
          asset={asset}
          assets={assets}
          projectPath={projectPath}
          className="h-44 w-full"
          onRuntimeInfoChange={handleRuntimeInfoChange}
        />
        <div className="min-w-0 p-3">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">
            {asset.name}
          </h3>
          <p className="text-xs font-medium text-violet-700">
            OpenBrush Brush Material
          </p>
          <p className="mt-2 text-xs leading-4 text-slate-600">
            three-icosaのGLSL・uniform・brush textureを保持する専用Materialです。
          </p>
          <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
            {referenceSummary && referenceSummary.slotCount > 0
              ? `共有中: ${referenceSummary.entityCount} Entity / ${referenceSummary.slotCount} Slot`
              : "シーン内の参照はありません"}
          </p>
        </div>
      </div>

      <EditorSection title="Brush preset">
        <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs">
          <dt className="text-slate-500">Brush</dt>
          <dd className="font-semibold text-slate-800">{shader.brushName}</dd>
          <dt className="text-slate-500">Renderer</dt>
          <dd className="text-slate-700">{shader.rendererVersion}</dd>
          <dt className="text-slate-500">glTF Material</dt>
          <dd className="text-slate-700">#{shader.sourceMaterialIndex}</dd>
          {shader.brushGuid ? (
            <>
              <dt className="text-slate-500">Brush GUID</dt>
              <dd className="break-all font-mono text-[10px] text-slate-700">
                {shader.brushGuid}
              </dd>
            </>
          ) : null}
          <dt className="text-slate-500">Source Model</dt>
          <dd className="break-all font-mono text-[10px] text-slate-700">
            {asset.importedFromModel?.modelAssetId ?? "—"}
          </dd>
        </dl>
      </EditorSection>

      <EditorSection title="Resolved custom shader">
        {runtimeInfo ? (
          <div className="space-y-2 text-xs">
            <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
              <dt className="text-slate-500">Material</dt>
              <dd
                className={`font-semibold ${
                  runtimeInfo.pbrFallback
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {runtimeInfo.materialType} / {runtimeInfo.pbrFallback ? "PBR fallback" : "適用済み"}
              </dd>
              <dt className="text-slate-500">Shader</dt>
              <dd className="text-slate-700">
                {runtimeInfo.pbrFallback
                  ? "glTF 2.0 PBR"
                  : runtimeInfo.shaderKind === "raw"
                  ? "RawShaderMaterial"
                  : runtimeInfo.shaderKind}
              </dd>
              {runtimeInfo.pbrFallback ? (
                <>
                  <dt className="text-slate-500">Fallback</dt>
                  <dd className="text-amber-700">
                    {formatOpenBrushFallbackReason(runtimeInfo.pbrFallback.reason)}
                  </dd>
                  <dt className="text-slate-500">Brush</dt>
                  <dd className="break-all font-mono text-[10px] text-slate-700">
                    {runtimeInfo.pbrFallback.brushName}
                  </dd>
                </>
              ) : (
                <>
                  <dt className="text-slate-500">GLSL</dt>
                  <dd className="text-slate-700">
                    {runtimeInfo.glslVersion ?? "WebGL compatible"}
                  </dd>
                  <dt className="text-slate-500">Vertex</dt>
                  <dd className="text-slate-700">
                    {shaderLineCount(runtimeInfo.vertexShader)} lines
                  </dd>
                  <dt className="text-slate-500">Fragment</dt>
                  <dd className="text-slate-700">
                    {shaderLineCount(runtimeInfo.fragmentShader)} lines
                  </dd>
                  <dt className="text-slate-500">Uniforms</dt>
                  <dd className="text-slate-700">
                    {runtimeInfo.uniformNames.length}
                  </dd>
                  <dt className="text-slate-500">Attributes</dt>
                  <dd className="text-slate-700">
                    {formatAttributeBindingSummary(runtimeInfo.attributeBindings)}
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Textures</dt>
              <dd className="break-words text-slate-700">
                {runtimeInfo.textureNames.length > 0
                  ? runtimeInfo.textureNames.join(", ")
                  : "なし"}
              </dd>
              <dt className="text-slate-500">Resources</dt>
              <dd className="whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-slate-700">
                {runtimeInfo.resourcePaths.length > 0
                  ? runtimeInfo.resourcePaths.join("\n")
                  : runtimeInfo.pbrFallback
                    ? "GLB内のPBR / texture"
                    : "three-icosa preset内"}
              </dd>
            </dl>

            {runtimeInfo.pbrFallback ? (
              <div className="space-y-2">
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                  {runtimeInfo.pbrFallback.message}
                </p>
                {shader.sourceOverrides?.vertexShader !== undefined ? (
                  <ShaderSourceEditor
                    label="Vertex GLSLを修正"
                    source={shader.sourceOverrides.vertexShader}
                    overridden
                    readOnly={readOnly}
                    onChange={(source) =>
                      updateShaderSource("vertexShader", source)
                    }
                  />
                ) : null}
                {shader.sourceOverrides?.fragmentShader !== undefined ? (
                  <ShaderSourceEditor
                    label="Fragment GLSLを修正"
                    source={shader.sourceOverrides.fragmentShader}
                    overridden
                    readOnly={readOnly}
                    onChange={(source) =>
                      updateShaderSource("fragmentShader", source)
                    }
                  />
                ) : null}
              </div>
            ) : (
              <>
                <details className="rounded border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-2 py-1.5 font-semibold text-slate-700">
                    Uniform一覧を表示
                  </summary>
                  <p className="whitespace-pre-wrap break-words border-t border-slate-200 px-2 py-1.5 font-mono text-[10px] leading-4 text-slate-600">
                    {runtimeInfo.uniformBindings.length > 0
                      ? runtimeInfo.uniformBindings
                          .map(
                            (uniform) =>
                              `${uniform.glslType} ${uniform.name} · ${formatUniformBindingStatus(uniform.status)}`,
                          )
                          .join("\n")
                      : runtimeInfo.uniformNames.join(", ") || "Uniformなし"}
                  </p>
                </details>

                <details className="rounded border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-2 py-1.5 font-semibold text-slate-700">
                    Mesh attribute対応を表示
                  </summary>
                  <div className="space-y-1.5 border-t border-slate-200 p-2">
                    {runtimeInfo.attributeBindings.length > 0 ? (
                      runtimeInfo.attributeBindings.map((binding) => (
                        <label
                          key={binding.shaderName}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(88px,0.9fr)] items-center gap-2"
                        >
                          <span className="min-w-0 truncate font-mono text-[10px] text-slate-600">
                            {binding.glslType} {binding.shaderName}
                          </span>
                          <input
                            type="text"
                            value={
                              shader.attributeBindings?.[binding.shaderName]
                                ?.sourceAttribute ?? ""
                            }
                            placeholder={
                              binding.sourceAttribute ??
                              (binding.status === "default" ? "既定値" : "未設定")
                            }
                            disabled={readOnly}
                            onChange={(event) =>
                              updateAttributeSource(
                                binding.shaderName,
                                event.currentTarget.value,
                              )
                            }
                            className="min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[10px] text-slate-700 disabled:bg-slate-100"
                            aria-label={`${binding.shaderName}のMesh attribute`}
                          />
                        </label>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-500">
                        宣言されたvertex attributeなし
                      </p>
                    )}
                    <p className="text-[9px] leading-3 text-slate-500">
                      空欄は自動semantic mapping。任意のgeometry attribute名で上書きできます。
                    </p>
                  </div>
                </details>

                <ShaderSourceEditor
                  label="Vertex GLSLを表示"
                  source={
                    shader.sourceOverrides?.vertexShader ??
                    runtimeInfo.vertexShader
                  }
                  overridden={shader.sourceOverrides?.vertexShader !== undefined}
                  readOnly={readOnly}
                  onChange={(source) => updateShaderSource("vertexShader", source)}
                />
                <ShaderSourceEditor
                  label="Fragment GLSLを表示"
                  source={
                    shader.sourceOverrides?.fragmentShader ??
                    runtimeInfo.fragmentShader
                  }
                  overridden={shader.sourceOverrides?.fragmentShader !== undefined}
                  readOnly={readOnly}
                  onChange={(source) => updateShaderSource("fragmentShader", source)}
                />
              </>
            )}
          </div>
        ) : (
          <p className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] leading-4 text-slate-600">
            リアルタイムプレビューでthree-icosa shaderを解決すると、実際のGLSL・uniform・brush texture情報をここに表示します。
          </p>
        )}
      </EditorSection>

      <p className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] leading-4 text-sky-800">
        このMaterialは元Modelの該当nodeとmaterial indexをPreview Adapterで分離し、埋め込み済みのthree-icosa brush libraryから再構築します。未対応presetまたはshader読込失敗時だけ、GLB内のPBR Materialへ安全にフォールバックします。
      </p>
    </div>
  );
}

function formatOpenBrushFallbackReason(
  reason: "unsupported-preset" | "shader-load-error" | "attribute-mismatch",
): string {
  if (reason === "unsupported-preset") return "未対応preset";
  return reason === "attribute-mismatch"
    ? "Mesh attribute不足"
    : "shader読込失敗";
}

function shaderLineCount(source: string | undefined): number {
  return source ? source.split(/\r?\n/).length : 0;
}

function formatAttributeBindingSummary(
  bindings: ProjectModelMaterialRuntimeInfo["attributeBindings"],
): string {
  if (bindings.length === 0) return "なし";
  const bound = bindings.filter((binding) => binding.status === "bound").length;
  const defaults = bindings.filter(
    (binding) => binding.status === "default",
  ).length;
  const missing = bindings.length - bound - defaults;
  return `${bound} linked / ${defaults} default / ${missing} missing`;
}

function formatUniformBindingStatus(
  status: ProjectModelMaterialRuntimeInfo["uniformBindings"][number]["status"],
): string {
  if (status === "texture") return "texture設定済み";
  return status === "value" ? "値設定済み" : "未設定";
}

function ShaderSourceEditor({
  label,
  source,
  overridden,
  readOnly,
  onChange,
}: {
  label: string;
  source: string | undefined;
  overridden: boolean;
  readOnly: boolean;
  onChange: (source: string | undefined) => void;
}) {
  return (
    <details className="rounded border border-slate-200 bg-slate-950">
      <summary className="cursor-pointer px-2 py-1.5 font-semibold text-slate-200">
        {label}{overridden ? " · Material copy編集中" : ""}
      </summary>
      <div className="border-t border-slate-700 p-2">
        <textarea
          value={source ?? ""}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-56 w-full resize-y bg-transparent font-mono text-[9px] leading-4 text-slate-200 outline-none read-only:text-slate-400"
          aria-label={label}
        />
        {overridden && !readOnly ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="mt-1 rounded border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800"
          >
            presetへ戻す
          </button>
        ) : null}
      </div>
    </details>
  );
}

function CustomShaderQuickEditor({
  asset,
  assets,
  projectPath,
  readOnly,
  onChange,
  onOpenTexture,
  onOpenShader,
  onOpenMaterialShader,
  onAssignShaderAsset,
}: MaterialQuickEditorProps) {
  const shader =
    asset.shader?.kind === "classic-r3f" ? asset.shader : undefined;
  const textures = Object.values(assets.assets).filter(
    (candidate): candidate is TextureAsset =>
      candidate.kind === "texture" && !isEnvironmentTextureAsset(candidate),
  );
  const shaderAssets = Object.values(assets.assets).filter(
    (candidate): candidate is ShaderAsset => candidate.kind === "shader",
  );

  const enableShader = () => onChange({ shader: createDefaultCustomShader() });
  const updateShader = (
    patch: Partial<Omit<ClassicR3fMaterialShader, "kind">>,
  ) => {
    const base = shader ?? createDefaultCustomShader();
    onChange({ shader: { ...base, ...patch, kind: "classic-r3f" } });
  };
  const [showUniformNames, setShowUniformNames] = useState(false);
  const updateUniform = (name: string, value: ClassicR3fShaderUniform) => {
    if (!shader) return;
    updateShader({ uniforms: { ...shader.uniforms, [name]: value } });
  };

  return (
    <EditorSection title="Custom Shader">
      {!shader ? (
        <div className="space-y-2">
          <p className="text-xs leading-4 text-slate-600">
            GLSLをMaterialに保存し、Mesh slotへ割り当てた状態でScene View、Play、公開用コードへ同じShaderを渡します。
          </p>
          <button
            type="button"
            disabled={readOnly}
            onClick={enableShader}
            className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Custom Shaderを作成
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="h-32 overflow-hidden rounded border border-slate-300 bg-slate-950">
            <CustomMaterialPreview
              asset={asset}
              assets={assets}
              projectPath={projectPath}
              className="h-full w-full"
              compact
            />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
            <span>GLSLはMaterialに保存され、参照中のMeshへ反映されます。</span>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onChange({ shader: null })}
              className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              PBRへ戻す
            </button>
          </div>
          <label className="block text-[11px] text-slate-600">
            Shader ID
            <input
              type="text"
              value={shader.sourceModulePath}
              disabled={readOnly}
              onChange={(event) =>
                updateShader({ sourceModulePath: event.currentTarget.value })
              }
              className={`${INPUT_CLASS} mt-1 font-mono text-[10px]`}
            />
          </label>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-700">Shaderコード</span>
              <span className="text-[10px] text-slate-500">GLSL Editorで編集</span>
            </div>
            <div className="space-y-1.5">
              <ShaderSourceReferenceRow
                label="Vertex"
                stage="vertex"
                source={shader.vertexShader}
                sourceAssetId={shader.vertexShaderAssetId}
                shaderAssets={shaderAssets}
                readOnly={readOnly}
                onOpenShader={onOpenShader}
                onOpenMaterialShader={() =>
                  onOpenMaterialShader(asset.id, "vertex")
                }
                onAssign={(shaderAssetId) =>
                  onAssignShaderAsset(asset.id, "vertex", shaderAssetId)
                }
              />
              <ShaderSourceReferenceRow
                label="Fragment"
                stage="fragment"
                source={shader.fragmentShader}
                sourceAssetId={shader.fragmentShaderAssetId}
                shaderAssets={shaderAssets}
                readOnly={readOnly}
                onOpenShader={onOpenShader}
                onOpenMaterialShader={() =>
                  onOpenMaterialShader(asset.id, "fragment")
                }
                onAssign={(shaderAssetId) =>
                  onAssignShaderAsset(asset.id, "fragment", shaderAssetId)
                }
              />
            </div>
          </div>
          <label className="block text-[11px] text-slate-600">
            時間uniform（任意）
            <input
              type="text"
              value={shader.animatedTimeUniform ?? ""}
              disabled={readOnly}
              placeholder="例: uTime"
              onChange={(event) =>
                updateShader({
                  animatedTimeUniform: event.currentTarget.value.trim() || undefined,
                })
              }
              className={`${INPUT_CLASS} mt-1 font-mono text-[10px]`}
            />
          </label>
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-700">
                Uniform values
              </span>
              <button
                type="button"
                aria-pressed={showUniformNames}
                onClick={() => setShowUniformNames((shown) => !shown)}
                title="GLSLのuniform名を表示する"
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                {showUniformNames ? "名前を隠す" : "uniform名"}
              </button>
            </div>
            {/*
              One row per uniform: label on the left, control on the right, the
              same shape the rest of the Inspector uses. The old card gave every
              uniform two full-width rows and a type badge, so a colour swatch
              sat alone in a row of empty panel and the list ran far longer than
              the values in it. The type badge is gone because the control
              already shows what it is.
            */}
            <div className="space-y-1">
              {Object.entries(shader.uniforms).map(([name, uniform]) => {
                const meta = resolveShaderUniformLabel(
                  name,
                  shader.sourceModulePath,
                );
                const driven = isDrivenShaderUniform(name);
                return (
                  <div key={name} className="space-y-0.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2">
                      <span
                        className="truncate text-[11px] text-slate-700"
                        title={meta.hint ? `${name} — ${meta.hint}` : name}
                      >
                        {meta.label}
                        {driven ? (
                          <span className="ml-1 text-[9px] font-semibold text-slate-400">
                            自動
                          </span>
                        ) : null}
                      </span>
                      {uniform.kind === "number" ? (
                        <ScrubNumberInput
                          value={uniform.value}
                          disabled={readOnly}
                          scrubStep={0.01}
                          size="sm"
                          ariaLabel={meta.label}
                          scrubLabel={meta.label}
                          onChange={(value) =>
                            updateUniform(name, { kind: "number", value })
                          }
                          className="font-mono"
                        />
                      ) : uniform.kind === "color" ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={uniform.value}
                            disabled={readOnly}
                            aria-label={meta.label}
                            onChange={(event) =>
                              updateUniform(name, {
                                kind: "color",
                                value: event.currentTarget.value,
                              })
                            }
                            className="h-7 w-7 shrink-0 rounded border border-slate-300 bg-white p-0.5 disabled:opacity-50"
                          />
                          <span className="truncate font-mono text-[10px] uppercase text-slate-500">
                            {uniform.value}
                          </span>
                        </div>
                      ) : uniform.kind === "vector" ? (
                        <input
                          type="text"
                          value={uniform.value.join(", ")}
                          disabled={readOnly}
                          aria-label={meta.label}
                          onChange={(event) => {
                            const value = event.currentTarget.value
                              .split(",")
                              .map((entry) => Number(entry.trim()));
                            if (
                              value.length >= 2 &&
                              value.length <= 4 &&
                              value.every(Number.isFinite)
                            ) {
                              updateUniform(name, { kind: "vector", value });
                            }
                          }}
                          className={`${INPUT_CLASS} font-mono text-[10px]`}
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-1">
                          <select
                            value={uniform.textureAssetId}
                            disabled={readOnly || textures.length === 0}
                            aria-label={meta.label}
                            onChange={(event) =>
                              updateUniform(name, {
                                ...uniform,
                                textureAssetId: event.currentTarget.value,
                              })
                            }
                            className={`${INPUT_CLASS} min-w-0 flex-1 text-[10px]`}
                          >
                            {textures.length === 0 ? (
                              <option value={uniform.textureAssetId}>
                                Textureなし
                              </option>
                            ) : (
                              textures.map((texture) => (
                                <option key={texture.id} value={texture.id}>
                                  {texture.name}
                                </option>
                              ))
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() => onOpenTexture(uniform.textureAssetId)}
                            title="Textureを開く"
                            className="shrink-0 rounded border border-slate-300 px-1 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            開く
                          </button>
                        </div>
                      )}
                    </div>
                    {showUniformNames ? (
                      <div className="font-mono text-[9px] text-slate-400">
                        {name}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onChange({ shader: createDefaultCustomShader() })}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Starter Shaderへ戻す
          </button>
        </div>
      )}
    </EditorSection>
  );
}

function ShaderSourceReferenceRow({
  label,
  stage,
  source,
  sourceAssetId,
  shaderAssets,
  readOnly,
  onOpenShader,
  onOpenMaterialShader,
  onAssign,
}: {
  label: string;
  stage: ShaderAssetStage;
  source: string;
  sourceAssetId?: string;
  shaderAssets: ShaderAsset[];
  readOnly: boolean;
  onOpenShader: (assetId: string) => void;
  onOpenMaterialShader: () => void;
  onAssign: (assetId: string | null) => void;
}) {
  const selected = sourceAssetId
    ? shaderAssets.find((asset) => asset.id === sourceAssetId)
    : undefined;
  const compatibleShaderAssets = shaderAssets.filter(
    (asset) => asset.stage === stage,
  );
  const selectableShaderAssets = selected && selected.stage !== stage
    ? [selected, ...compatibleShaderAssets]
    : compatibleShaderAssets;
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700">{label} GLSL</p>
          <p className="truncate font-mono text-[10px] text-slate-500">
            {selected?.name ?? "Material内のコード"} · {source.split(/\r?\n/).length}行
          </p>
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() =>
            selected ? onOpenShader(selected.id) : onOpenMaterialShader()
          }
          className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          編集
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={sourceAssetId ?? ""}
          disabled={readOnly}
          onChange={(event) => onAssign(event.currentTarget.value || null)}
          className="h-7 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 font-mono text-[10px] text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200 disabled:bg-slate-100 disabled:text-slate-400"
          aria-label={`${label} GLSL Asset`}
        >
          <option value="">Material内のコード</option>
          {selectableShaderAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} ({asset.stage})
            </option>
          ))}
        </select>
        {selected ? (
          <button
            type="button"
            onClick={() => onOpenShader(selected.id)}
            className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Assetを開く
          </button>
        ) : null}
      </div>
      {selected && selected.stage !== stage ? (
        <p className="mt-1 text-[10px] text-amber-700">
          このAssetは {selected.stage} 用として登録されています。
        </p>
      ) : null}
    </div>
  );
}

function StandardMaterialQuickEditor({
  asset,
  assets,
  projectPath,
  referenceSummary,
  readOnly,
  onChange,
  onOpenTexture,
  onOpenShader,
  onOpenMaterialShader,
  onAssignShaderAsset,
}: MaterialQuickEditorProps) {
  const pbr = asset.properties.pbrMetallicRoughness;
  const openBrush = asset.shader?.kind === "openbrush" ? asset.shader : undefined;
  const customShader = asset.shader?.kind === "classic-r3f" ? asset.shader : undefined;
  const textures = Object.values(assets.assets).filter(
    (candidate): candidate is TextureAsset =>
      candidate.kind === "texture" && !isEnvironmentTextureAsset(candidate),
  );
  const [previewTextureState, setPreviewTextureState] = useState<{
    assetId: string;
    statuses: MaterialPreviewTextureStatuses;
  }>({ assetId: asset.id, statuses: {} });
  const previewTextureStatuses =
    previewTextureState.assetId === asset.id ? previewTextureState.statuses : {};
  const handleTextureStatusesChange = useCallback(
    (statuses: MaterialPreviewTextureStatuses) => {
      setPreviewTextureState({ assetId: asset.id, statuses });
    },
    [asset.id],
  );
  const baseColor = colorToHex(pbr.baseColorFactor, asset.properties.color);
  const emissiveColor = colorToHex(asset.properties.emissiveFactor, "#000000");
  const extensions = asset.properties.extensions;
  const anisotropy = extensions.KHR_materials_anisotropy;
  const clearcoat = extensions.KHR_materials_clearcoat;
  const dispersion = extensions.KHR_materials_dispersion;
  const emissiveStrength = extensions.KHR_materials_emissive_strength;
  const ior = extensions.KHR_materials_ior;
  const iridescence = extensions.KHR_materials_iridescence;
  const sheen = extensions.KHR_materials_sheen;
  const specular = extensions.KHR_materials_specular;
  const transmission = extensions.KHR_materials_transmission;
  const unlit = extensions.KHR_materials_unlit;
  const volume = extensions.KHR_materials_volume;
  const updateExtensions = (patch: MaterialExtensionsPatch) =>
    onChange({ extensions: patch });
  const updateLitExtension = (patch: MaterialExtensionsPatch) =>
    updateExtensions({ KHR_materials_unlit: null, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-28 overflow-hidden rounded-md border border-slate-300 shadow-sm">
          <MaterialThumbnail
            asset={asset}
            assets={assets}
            projectPath={projectPath}
            onTextureStatusesChange={handleTextureStatusesChange}
          />
        </div>
        <div className="min-w-0 self-center">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">{asset.name}</h3>
          <p className="text-xs text-slate-500">
            {openBrush
              ? `OpenBrush ブラシ · ${openBrush.brushName}`
              : customShader
                ? "Custom Shader Material"
                : "glTF 2.0 標準マテリアル"}
          </p>
          {asset.importedFromModel ? (
            <p className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${asset.importedFromModel.isUserOverridden ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
              {asset.importedFromModel.isUserOverridden
                ? "モデル由来・ユーザー編集を保護"
                : "モデル由来・再インポートで同期"}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-4 text-slate-600">
            変更はプレビューとシーン内の参照メッシュへ即時反映されます。
          </p>
          <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
            {referenceSummary && referenceSummary.slotCount > 0
              ? `共有中: ${referenceSummary.entityCount} Entity / ${referenceSummary.slotCount} Slot`
              : "シーン内の参照はありません"}
          </p>
        </div>
      </div>

      {openBrush ? (
        <EditorSection title="OpenBrush 表現">
          <p className="text-xs leading-4 text-slate-600">
            ブラシ固有の描画を保ったまま、下のテクスチャと基本値を編集できます。
          </p>
          <details className="rounded border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-700">
              詳細設定
            </summary>
            <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-slate-200 px-2 py-2 text-[11px]">
              <dt className="text-slate-500">ブラシ</dt>
              <dd className="font-medium text-slate-800">{openBrush.brushName}</dd>
              <dt className="text-slate-500">Texture</dt>
              <dd className="text-slate-700">
                {Object.keys(openBrush.textureBindings ?? {}).length > 0
                  ? Object.keys(openBrush.textureBindings ?? {}).length
                  : "GLBのMaterial slotを使用"}
              </dd>
            </dl>
          </details>
        </EditorSection>
      ) : null}

      {!openBrush ? (
        <CustomShaderQuickEditor
          asset={asset}
          assets={assets}
          projectPath={projectPath}
          readOnly={readOnly}
          onChange={onChange}
          onOpenTexture={onOpenTexture}
          onOpenShader={onOpenShader}
          onOpenMaterialShader={onOpenMaterialShader}
          onAssignShaderAsset={onAssignShaderAsset}
        />
      ) : null}

      <MaterialExtensionSection
        title="Unlit"
        extensionName="KHR_materials_unlit"
        description="シーンのライトを使わず、Base Colorをそのまま表示します。"
        enabled={unlit !== undefined}
        readOnly={readOnly}
        onToggle={(enabled) =>
          updateExtensions(
            enabled
              ? {
                  ...disabledLitMaterialExtensions(),
                  KHR_materials_unlit: {},
                }
              : { KHR_materials_unlit: null },
          )
        }
      >
        <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] leading-4 text-sky-800">
          UnlitではBase Colorと透明度だけを使用します。切り替え時に互換性のないライティング拡張は解除されます。
        </p>
      </MaterialExtensionSection>

      <EditorSection title="Base Color RGBA">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
          RGB
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-slate-500">{baseColor}</span>
            <input
              type="color"
              value={baseColor}
              disabled={readOnly}
              onChange={(event) => {
                const rgb = hexToRgb(event.currentTarget.value);
                if (!rgb) return;
                onChange({
                  pbrMetallicRoughness: {
                    baseColorFactor: [rgb[0], rgb[1], rgb[2], pbr.baseColorFactor[3]],
                  },
                });
              }}
              className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </span>
        </label>
        <RangeControl
          label="Alpha"
          value={pbr.baseColorFactor[3]}
          disabled={readOnly}
          onChange={(alpha) =>
            onChange({
              pbrMetallicRoughness: {
                baseColorFactor: [
                  pbr.baseColorFactor[0],
                  pbr.baseColorFactor[1],
                  pbr.baseColorFactor[2],
                  alpha,
                ],
              },
            })
          }
        />
        <TextureSlot
          label="Base Color Texture"
          description="RGBは色、Aは透明度として使用します。"
          value={pbr.baseColorTexture}
          textures={textures}
          projectPath={projectPath}
          disabled={readOnly}
          previewStatus={previewTextureStatuses.baseColorMap}
          onOpenTexture={onOpenTexture}
          onChange={(baseColorTexture) =>
            onChange({ pbrMetallicRoughness: { baseColorTexture } })
          }
        />
      </EditorSection>

      <EditorSection title="Metallic / Roughness">
        <RangeControl
          label="Metallic"
          value={pbr.metallicFactor}
          disabled={readOnly}
          onChange={(metallicFactor) =>
            onChange({ pbrMetallicRoughness: { metallicFactor } })
          }
        />
        <RangeControl
          label="Roughness"
          value={pbr.roughnessFactor}
          disabled={readOnly}
          onChange={(roughnessFactor) =>
            onChange({ pbrMetallicRoughness: { roughnessFactor } })
          }
        />
        <TextureSlot
          label="Metallic / Roughness Texture"
          description="GにRoughness、BにMetallicを格納するglTF packed mapです。"
          value={pbr.metallicRoughnessTexture}
          textures={textures}
          projectPath={projectPath}
          disabled={readOnly}
          previewStatus={previewTextureStatuses.metallicRoughnessMap}
          onOpenTexture={onOpenTexture}
          onChange={(metallicRoughnessTexture) =>
            onChange({ pbrMetallicRoughness: { metallicRoughnessTexture } })
          }
        />
      </EditorSection>

      <EditorSection title="Normal / Occlusion">
        <TextureSlot
          label="Normal"
          description="タンジェント空間の法線マップ。Linearで扱います。"
          value={asset.properties.normalTexture}
          textures={textures}
          projectPath={projectPath}
          disabled={readOnly}
          previewStatus={previewTextureStatuses.normalMap}
          onOpenTexture={onOpenTexture}
          onChange={(value) =>
            onChange({
              normalTexture: value
                ? { ...value, scale: asset.properties.normalTexture?.scale ?? 1 }
                : null,
            })
          }
        />
        <NumberControl
          label="Normal scale"
          value={asset.properties.normalTexture?.scale ?? 1}
          step={0.01}
          description="有限値。負の値では法線方向を反転します。"
          disabled={readOnly || !asset.properties.normalTexture}
          onChange={(scale) => {
            const current = asset.properties.normalTexture;
            if (current) onChange({ normalTexture: { ...current, scale } });
          }}
        />
        <TextureSlot
          label="Occlusion"
          description="Rチャンネルを遮蔽強度として使用します。"
          value={asset.properties.occlusionTexture}
          textures={textures}
          projectPath={projectPath}
          disabled={readOnly}
          previewStatus={previewTextureStatuses.occlusionMap}
          onOpenTexture={onOpenTexture}
          onChange={(value) =>
            onChange({
              occlusionTexture: value
                ? { ...value, strength: asset.properties.occlusionTexture?.strength ?? 1 }
                : null,
            })
          }
        />
        <RangeControl
          label="Occlusion strength"
          value={asset.properties.occlusionTexture?.strength ?? 1}
          disabled={readOnly || !asset.properties.occlusionTexture}
          onChange={(strength) => {
            const current = asset.properties.occlusionTexture;
            if (current) onChange({ occlusionTexture: { ...current, strength } });
          }}
        />
      </EditorSection>

      <EditorSection title="Emissive">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
          Factor
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-slate-500">{emissiveColor}</span>
            <input
              type="color"
              value={emissiveColor}
              disabled={readOnly}
              onChange={(event) => {
                const emissiveFactor = hexToRgb(event.currentTarget.value);
                if (emissiveFactor) onChange({ emissiveFactor });
              }}
              className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </span>
        </label>
        <TextureSlot
          label="Emissive Texture"
          description="発光色へ乗算するsRGBテクスチャです。"
          value={asset.properties.emissiveTexture}
          textures={textures}
          projectPath={projectPath}
          disabled={readOnly}
          previewStatus={previewTextureStatuses.emissiveMap}
          onOpenTexture={onOpenTexture}
          onChange={(emissiveTexture) => onChange({ emissiveTexture })}
        />
      </EditorSection>

      <MaterialExtensionSection
        title="Emissive Strength"
        extensionName="KHR_materials_emissive_strength"
        description="Emissiveの明るさを1倍より強くし、発光表現を調整します。"
        enabled={Boolean(emissiveStrength)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_emissive_strength: { emissiveStrength: 2 },
              })
            : updateExtensions({ KHR_materials_emissive_strength: null })
        }
      >
        {emissiveStrength ? (
          <NumberControl
            label="Strength"
            value={emissiveStrength.emissiveStrength}
            min={0}
            step={0.1}
            description="0以上。1がglTFの標準強度で、1を超える値はBloomやTone Mappingにも影響します。"
            disabled={readOnly}
            onChange={(value) =>
              updateLitExtension({
                KHR_materials_emissive_strength: {
                  emissiveStrength: value,
                },
              })
            }
          />
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Clearcoat"
        extensionName="KHR_materials_clearcoat"
        description="塗装やワニスのような透明な上塗り層を追加します。"
        enabled={Boolean(clearcoat)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_clearcoat: {
                  clearcoatFactor: 1,
                  clearcoatRoughnessFactor: 0.15,
                },
              })
            : updateExtensions({ KHR_materials_clearcoat: null })
        }
      >
        {clearcoat ? (
          <>
            <RangeControl
              label="Layer intensity"
              value={clearcoat.clearcoatFactor}
              description="0〜1。0では上塗り層が無効になり、RチャンネルのTextureと乗算します。"
              disabled={readOnly}
              onChange={(clearcoatFactor) =>
                updateLitExtension({
                  KHR_materials_clearcoat: { clearcoatFactor },
                })
              }
            />
            <TextureSlot
              label="Clearcoat map"
              description="Linear TextureのRチャンネルで層の強さを制御します。"
              value={clearcoat.clearcoatTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.clearcoatMap}
              onOpenTexture={onOpenTexture}
              onChange={(clearcoatTexture) =>
                updateLitExtension({
                  KHR_materials_clearcoat: { clearcoatTexture },
                })
              }
            />
            <RangeControl
              label="Layer roughness"
              value={clearcoat.clearcoatRoughnessFactor}
              description="0〜1。0は鋭い反射、1は粗い反射です。GチャンネルのTextureと乗算します。"
              disabled={readOnly}
              onChange={(clearcoatRoughnessFactor) =>
                updateLitExtension({
                  KHR_materials_clearcoat: { clearcoatRoughnessFactor },
                })
              }
            />
            <TextureSlot
              label="Clearcoat roughness map"
              description="Linear TextureのGチャンネルで上塗り層の粗さを制御します。"
              value={clearcoat.clearcoatRoughnessTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.clearcoatRoughnessMap}
              onOpenTexture={onOpenTexture}
              onChange={(clearcoatRoughnessTexture) =>
                updateLitExtension({
                  KHR_materials_clearcoat: { clearcoatRoughnessTexture },
                })
              }
            />
            <TextureSlot
              label="Clearcoat normal map"
              description="上塗り層だけに適用するタンジェント空間のLinear法線マップです。"
              value={clearcoat.clearcoatNormalTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.clearcoatNormalMap}
              onOpenTexture={onOpenTexture}
              onChange={(value) =>
                updateLitExtension({
                  KHR_materials_clearcoat: {
                    clearcoatNormalTexture: value
                      ? {
                          ...value,
                          scale: clearcoat.clearcoatNormalTexture?.scale ?? 1,
                        }
                      : null,
                  },
                })
              }
            />
            <NumberControl
              label="Clearcoat normal scale"
              value={clearcoat.clearcoatNormalTexture?.scale ?? 1}
              step={0.01}
              description="有限値。負の値では法線方向を反転します。"
              disabled={readOnly || !clearcoat.clearcoatNormalTexture}
              onChange={(scale) => {
                if (!clearcoat.clearcoatNormalTexture) return;
                updateLitExtension({
                  KHR_materials_clearcoat: {
                    clearcoatNormalTexture: {
                      ...clearcoat.clearcoatNormalTexture,
                      scale,
                    },
                  },
                });
              }}
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Anisotropy"
        extensionName="KHR_materials_anisotropy"
        description="ヘアライン金属など、方向性を持つ細長い反射を表現します。"
        enabled={Boolean(anisotropy)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_anisotropy: {
                  anisotropyStrength: 0.5,
                  anisotropyRotation: 0,
                },
              })
            : updateExtensions({ KHR_materials_anisotropy: null })
        }
      >
        {anisotropy ? (
          <>
            <RangeControl
              label="Strength"
              value={anisotropy.anisotropyStrength}
              description="0〜1。Textureを使う場合はBチャンネルの強さと乗算します。"
              disabled={readOnly}
              onChange={(anisotropyStrength) =>
                updateLitExtension({
                  KHR_materials_anisotropy: { anisotropyStrength },
                })
              }
            />
            <NumberControl
              label="Rotation (°)"
              value={(anisotropy.anisotropyRotation * 180) / Math.PI}
              step={1}
              description="タンジェントから反時計回りの角度。保存時はラジアンへ変換します。"
              disabled={readOnly}
              onChange={(degrees) =>
                updateLitExtension({
                  KHR_materials_anisotropy: {
                    anisotropyRotation: (degrees * Math.PI) / 180,
                  },
                })
              }
            />
            <TextureSlot
              label="Anisotropy map"
              description="Linear Texture。RGに方向、Bに強さを格納します。"
              value={anisotropy.anisotropyTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.anisotropyMap}
              onOpenTexture={onOpenTexture}
              onChange={(anisotropyTexture) =>
                updateLitExtension({
                  KHR_materials_anisotropy: { anisotropyTexture },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Sheen"
        extensionName="KHR_materials_sheen"
        description="布やベルベットのような、輪郭側に現れる柔らかな反射層です。"
        enabled={Boolean(sheen)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_sheen: {
                  sheenColorFactor: [0.5, 0.5, 0.5],
                  sheenRoughnessFactor: 0.4,
                },
              })
            : updateExtensions({ KHR_materials_sheen: null })
        }
      >
        {sheen ? (
          <>
            <Color3Control
              label="Sheen color"
              value={sheen.sheenColorFactor}
              max={1}
              description="Linear RGB、各チャンネル0〜1。すべて0でSheen層は無効です。"
              disabled={readOnly}
              onChange={(sheenColorFactor) =>
                updateLitExtension({
                  KHR_materials_sheen: { sheenColorFactor },
                })
              }
            />
            <TextureSlot
              label="Sheen color map"
              description="sRGB TextureのRGBをSheen colorへ乗算します。"
              value={sheen.sheenColorTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.sheenColorMap}
              onOpenTexture={onOpenTexture}
              onChange={(sheenColorTexture) =>
                updateLitExtension({
                  KHR_materials_sheen: { sheenColorTexture },
                })
              }
            />
            <RangeControl
              label="Sheen roughness"
              value={sheen.sheenRoughnessFactor}
              description="0〜1。AlphaチャンネルのTextureと乗算します。"
              disabled={readOnly}
              onChange={(sheenRoughnessFactor) =>
                updateLitExtension({
                  KHR_materials_sheen: { sheenRoughnessFactor },
                })
              }
            />
            <TextureSlot
              label="Sheen roughness map"
              description="Linear TextureのAlphaチャンネルで粗さを制御します。"
              value={sheen.sheenRoughnessTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.sheenRoughnessMap}
              onOpenTexture={onOpenTexture}
              onChange={(sheenRoughnessTexture) =>
                updateLitExtension({
                  KHR_materials_sheen: { sheenRoughnessTexture },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Specular"
        extensionName="KHR_materials_specular"
        description="非金属表面の鏡面反射の強さとF0色を調整します。"
        enabled={Boolean(specular)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_specular: {
                  specularFactor: 1,
                  specularColorFactor: [1, 1, 1],
                },
              })
            : updateExtensions({ KHR_materials_specular: null })
        }
      >
        {specular ? (
          <>
            <RangeControl
              label="Intensity"
              value={specular.specularFactor}
              description="0〜1。Textureを使う場合はAlphaチャンネルと乗算します。"
              disabled={readOnly}
              onChange={(specularFactor) =>
                updateLitExtension({
                  KHR_materials_specular: { specularFactor },
                })
              }
            />
            <TextureSlot
              label="Specular intensity map"
              description="Linear TextureのAlphaチャンネルで鏡面反射の強さを制御します。"
              value={specular.specularTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.specularIntensityMap}
              onOpenTexture={onOpenTexture}
              onChange={(specularTexture) =>
                updateLitExtension({
                  KHR_materials_specular: { specularTexture },
                })
              }
            />
            <Color3Control
              label="F0 color"
              value={specular.specularColorFactor}
              description="Linear RGB、各チャンネル0以上。HDR値は数値欄から1を超えて設定できます。"
              disabled={readOnly}
              onChange={(specularColorFactor) =>
                updateLitExtension({
                  KHR_materials_specular: { specularColorFactor },
                })
              }
            />
            <TextureSlot
              label="Specular color map"
              description="sRGB TextureのRGBをF0 colorへ乗算します。"
              value={specular.specularColorTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.specularColorMap}
              onOpenTexture={onOpenTexture}
              onChange={(specularColorTexture) =>
                updateLitExtension({
                  KHR_materials_specular: { specularColorTexture },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Index of Refraction"
        extensionName="KHR_materials_ior"
        description="誘電体の反射と屈折に使う屈折率を指定します。"
        enabled={Boolean(ior)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({ KHR_materials_ior: { ior: 1.5 } })
            : updateExtensions({ KHR_materials_ior: null })
        }
      >
        {ior ? (
          <NumberControl
            label="IOR"
            value={ior.ior}
            min={0}
            step={0.01}
            isAllowed={(value) => value === 0 || value >= 1}
            description="1以上。一般的な素材は1〜2程度です。0はglTFの特殊な互換モードとして保持されます。"
            disabled={readOnly}
            onChange={(value) =>
              updateLitExtension({ KHR_materials_ior: { ior: value } })
            }
          />
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Transmission"
        extensionName="KHR_materials_transmission"
        description="表面を通過する光の割合を指定し、ガラスなどの透過を表現します。"
        enabled={Boolean(transmission)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_transmission: { transmissionFactor: 1 },
              })
            : updateExtensions({
                KHR_materials_transmission: null,
                KHR_materials_volume: null,
                KHR_materials_dispersion: null,
              })
        }
      >
        {transmission ? (
          <>
            <RangeControl
              label="Transmission"
              value={transmission.transmissionFactor}
              description="0〜1。1で、鏡面反射されなかった光をすべて透過します。RチャンネルのTextureと乗算します。"
              disabled={readOnly}
              onChange={(transmissionFactor) =>
                updateLitExtension({
                  KHR_materials_transmission: { transmissionFactor },
                })
              }
            />
            <TextureSlot
              label="Transmission map"
              description="Linear TextureのRチャンネルで透過率を制御します。"
              value={transmission.transmissionTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.transmissionMap}
              onOpenTexture={onOpenTexture}
              onChange={(transmissionTexture) =>
                updateLitExtension({
                  KHR_materials_transmission: { transmissionTexture },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Volume"
        extensionName="KHR_materials_volume"
        description="閉じたメッシュ内部の厚みと、光が吸収される距離・色を設定します。"
        enabled={Boolean(volume)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_transmission: transmission ?? {
                  transmissionFactor: 1,
                },
                KHR_materials_volume: {
                  thicknessFactor: 0.5,
                  attenuationColor: [1, 1, 1],
                },
              })
            : updateExtensions({
                KHR_materials_volume: null,
                KHR_materials_dispersion: null,
              })
        }
      >
        {volume ? (
          <>
            <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] leading-4 text-sky-800">
              VolumeにはTransmissionが必要です。有効化時に同じ変更として準備されます。厚みが0より大きい場合は閉じたメッシュを使用してください。
            </p>
            <NumberControl
              label="Thickness"
              value={volume.thicknessFactor}
              min={0}
              step={0.01}
              description="0以上、メッシュ座標系の距離。0では薄い表面として扱います。"
              disabled={readOnly}
              onChange={(thicknessFactor) =>
                updateLitExtension({
                  KHR_materials_volume: { thicknessFactor },
                })
              }
            />
            <TextureSlot
              label="Thickness map"
              description="Linear TextureのGチャンネルをThicknessへ乗算します。"
              value={volume.thicknessTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.thicknessMap}
              onOpenTexture={onOpenTexture}
              onChange={(thicknessTexture) =>
                updateLitExtension({
                  KHR_materials_volume: { thicknessTexture },
                })
              }
            />
            <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                有限の減衰距離
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                  無効時はglTF標準の無限距離です。
                </span>
              </span>
              <input
                type="checkbox"
                checked={volume.attenuationDistance !== undefined}
                disabled={readOnly}
                onChange={(event) =>
                  updateLitExtension({
                    KHR_materials_volume: {
                      attenuationDistance: event.currentTarget.checked ? 1 : null,
                    },
                  })
                }
                className="h-4 w-4 accent-violet-600"
              />
            </label>
            {volume.attenuationDistance !== undefined ? (
              <NumberControl
                label="Attenuation distance"
                value={volume.attenuationDistance}
                min={0.0001}
                step={0.01}
                description="0より大きいワールド距離。白色光がAttenuation colorへ変化する平均距離です。"
                disabled={readOnly}
                onChange={(attenuationDistance) =>
                  updateLitExtension({
                    KHR_materials_volume: { attenuationDistance },
                  })
                }
              />
            ) : null}
            <Color3Control
              label="Attenuation color"
              value={volume.attenuationColor}
              max={1}
              description="Linear RGB、各チャンネル0〜1。減衰距離に達した白色光の色です。"
              disabled={readOnly}
              onChange={(attenuationColor) =>
                updateLitExtension({
                  KHR_materials_volume: { attenuationColor },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Dispersion"
        extensionName="KHR_materials_dispersion"
        description="透過する光の色分離を追加し、宝石や高分散ガラスを表現します。"
        enabled={Boolean(dispersion)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_transmission: transmission ?? {
                  transmissionFactor: 1,
                },
                KHR_materials_volume: volume ?? {
                  thicknessFactor: 0.5,
                  attenuationColor: [1, 1, 1],
                },
                KHR_materials_dispersion: { dispersion: 0.2 },
              })
            : updateExtensions({ KHR_materials_dispersion: null })
        }
      >
        {dispersion ? (
          <>
            <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] leading-4 text-sky-800">
              DispersionにはVolumeとTransmissionが必要です。有効化時に同じ変更として準備されます。
            </p>
            <NumberControl
              label="Dispersion"
              value={dispersion.dispersion}
              min={0}
              step={0.01}
              description="0以上。0〜1が現実的な範囲で、1を超える値も強調表現として有効です。"
              disabled={readOnly}
              onChange={(value) =>
                updateLitExtension({
                  KHR_materials_dispersion: { dispersion: value },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <MaterialExtensionSection
        title="Iridescence"
        extensionName="KHR_materials_iridescence"
        description="薄膜干渉による、見る角度で色が変化する遊色効果を追加します。"
        enabled={Boolean(iridescence)}
        readOnly={readOnly}
        onToggle={(enabled) =>
          enabled
            ? updateLitExtension({
                KHR_materials_iridescence: {
                  iridescenceFactor: 1,
                  iridescenceIor: 1.3,
                  iridescenceThicknessMinimum: 100,
                  iridescenceThicknessMaximum: 400,
                },
              })
            : updateExtensions({ KHR_materials_iridescence: null })
        }
      >
        {iridescence ? (
          <>
            <RangeControl
              label="Factor"
              value={iridescence.iridescenceFactor}
              description="0〜1。Linear TextureのRチャンネルと乗算します。"
              disabled={readOnly}
              onChange={(iridescenceFactor) =>
                updateLitExtension({
                  KHR_materials_iridescence: { iridescenceFactor },
                })
              }
            />
            <TextureSlot
              label="Factor map"
              description="Linear TextureのRチャンネルで遊色効果の強さを制御します。"
              value={iridescence.iridescenceTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.iridescenceMap}
              onOpenTexture={onOpenTexture}
              onChange={(iridescenceTexture) =>
                updateLitExtension({
                  KHR_materials_iridescence: { iridescenceTexture },
                })
              }
            />
            <NumberControl
              label="IOR"
              value={iridescence.iridescenceIor}
              min={1}
              step={0.01}
              description="1以上。薄膜層の屈折率で、glTF標準値は1.3です。"
              disabled={readOnly}
              onChange={(iridescenceIor) =>
                updateLitExtension({
                  KHR_materials_iridescence: { iridescenceIor },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberControl
                label="Thickness min"
                value={iridescence.iridescenceThicknessMinimum}
                min={0}
                step={1}
                description="0以上のnm値。TextureのG=0で使われ、Maxより大きい逆方向の範囲も有効です。"
                disabled={readOnly}
                onChange={(iridescenceThicknessMinimum) =>
                  updateLitExtension({
                    KHR_materials_iridescence: {
                      iridescenceThicknessMinimum,
                    },
                  })
                }
              />
              <NumberControl
                label="Thickness max"
                value={iridescence.iridescenceThicknessMaximum}
                min={0}
                step={1}
                description="0以上のnm値。TextureのG=1で使われます。"
                disabled={readOnly}
                onChange={(iridescenceThicknessMaximum) =>
                  updateLitExtension({
                    KHR_materials_iridescence: {
                      iridescenceThicknessMaximum,
                    },
                  })
                }
              />
            </div>
            <TextureSlot
              label="Thickness map"
              description="Linear TextureのGチャンネルで最小〜最大の薄膜厚を補間します。"
              value={iridescence.iridescenceThicknessTexture}
              textures={textures}
              projectPath={projectPath}
              disabled={readOnly}
              previewStatus={previewTextureStatuses.iridescenceThicknessMap}
              onOpenTexture={onOpenTexture}
              onChange={(iridescenceThicknessTexture) =>
                updateLitExtension({
                  KHR_materials_iridescence: {
                    iridescenceThicknessTexture,
                  },
                })
              }
            />
          </>
        ) : null}
      </MaterialExtensionSection>

      <EditorSection title="Alpha / Sidedness">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">Alpha mode</span>
          <select
            value={asset.properties.alphaMode}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                alphaMode: event.currentTarget.value as "OPAQUE" | "MASK" | "BLEND",
              })
            }
            className={INPUT_CLASS}
          >
            <option value="OPAQUE">OPAQUE</option>
            <option value="MASK">MASK</option>
            <option value="BLEND">BLEND</option>
          </select>
        </label>
        {asset.properties.alphaMode === "MASK" ? (
          <>
            <RangeControl
              label="Alpha cutoff"
              value={asset.properties.alphaCutoff}
              disabled={readOnly}
              onChange={(alphaCutoff) => onChange({ alphaCutoff })}
            />
            <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span title="MSAAで切り抜きの境界をならします。葉や柵の縁がMASKより滑らかになり、BLENDと違って並び替えが要りません。">
                Alpha to coverage
              </span>
              <input
                type="checkbox"
                checked={asset.properties.alphaToCoverage}
                disabled={readOnly}
                onChange={(event) =>
                  onChange({ alphaToCoverage: event.currentTarget.checked })
                }
                className="h-4 w-4 accent-violet-600"
              />
            </label>
          </>
        ) : null}
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">Blend mode</span>
          <select
            value={asset.properties.blending}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                blending: event.currentTarget.value as MaterialBlendMode,
              })
            }
            className={INPUT_CLASS}
          >
            <option value="normal">Normal（通常）</option>
            <option value="additive">Additive（加算・光として重なる）</option>
            <option value="multiply">Multiply（乗算・暗く重なる）</option>
            <option value="subtractive">Subtractive（減算）</option>
          </select>
          {asset.properties.blending !== "normal" ? (
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">
              通常以外は透明パスで描くため、Alpha modeに関わらず半透明として扱われます。
            </span>
          ) : null}
        </label>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">Depth write</span>
          <select
            value={asset.properties.depthWrite}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                depthWrite: event.currentTarget.value as MaterialDepthWrite,
              })
            }
            className={INPUT_CLASS}
          >
            <option value="auto">Auto（Alpha modeに従う）</option>
            <option value="on">On（常に書き込む）</option>
            <option value="off">Off（書き込まない）</option>
          </select>
          <span className="mt-1 block text-[11px] leading-4 text-slate-500">
            重なった半透明の前後関係がおかしいときに手で決めます。
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
          Double sided
          <input
            type="checkbox"
            checked={asset.properties.doubleSided}
            disabled={readOnly}
            onChange={(event) => onChange({ doubleSided: event.currentTarget.checked })}
            className="h-4 w-4 accent-violet-600"
          />
        </label>
      </EditorSection>
    </div>
  );
}

export type TextureProcessingState =
  | { phase: "idle" }
  | { phase: "reading" | "encoding" | "saving"; message: string }
  | { phase: "succeeded" | "failed"; message: string };

export function TextureQuickEditor({
  asset: sourceAsset,
  projectPath,
  readOnly,
  processingState = { phase: "idle" },
  onChange: onAssetChange,
  onCreateCard,
  onApplyProcessing,
  onRevertProcessing,
}: {
  asset: TextureAsset;
  projectPath?: string;
  readOnly: boolean;
  processingState?: TextureProcessingState;
  onChange: (patch: TextureAssetPatch) => void;
  onCreateCard?: (profile: TextureCardProfile) => void;
  onApplyProcessing?: () => void;
  onRevertProcessing?: () => void;
}) {
  const [inspection, setInspection] = useState<{ key: string; width?: number; height?: number; message?: string; busy?: boolean } | null>(null);
  const inspectionKey = `${projectPath}:${sourceAsset.id}:${sourceAsset.sourceHash}:${sourceLabel(sourceAsset)}`;
  const currentInspection = inspection?.key === inspectionKey ? inspection : null;
  const asset: TextureAsset = {
    ...sourceAsset,
    importSettings: textureProcessingSettings(sourceAsset),
    ...(currentInspection?.width && sourceAsset.importMetadata ? { importMetadata: { ...sourceAsset.importMetadata, width: currentInspection.width, height: currentInspection.height } } : {}),
  };
  const onChange = (patch: TextureAssetPatch) => onAssetChange({ ...patch, ...(patch.importSettings ? { importSettings: normalizeTextureImportSettings(patch.importSettings, asset.importSettings) } : {}) });
  const inspectDimensions = async () => {
    if (!projectPath || sourceAsset.source.kind !== "project") return;
    setInspection({ key: inspectionKey, busy: true });
    try {
      const bytes = await readProjectAssetBytes(projectPath, sourceAsset.source.relativePath);
      const dimensions = readImageDimensions(bytes, getTextureSourceFormat(sourceAsset) ?? "png")?.dimensions;
      if (dimensions) {
        setInspection({ key: inspectionKey, ...dimensions });
      } else {
        const owned = new Uint8Array(bytes.length);
        owned.set(bytes);
        const bitmap = await createImageBitmap(new Blob([owned.buffer]));
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        setInspection({ key: inspectionKey, ...size });
      }
    } catch {
      setInspection({ key: inspectionKey, message: "サイズを取得できません。元ファイルを確認して再試行してください。" });
    }
  };
  const settings = asset.importSettings;
  const resizeValue = settings.resize.mode === "original" ? "original" : String(settings.resize.maxSize);
  const powerOfTwo = settings.resize.powerOfTwo === true;
  const resizePreview = describeResizePreview(asset);
  const sourceFormat = getTextureSourceFormat(asset);
  const environmentTexture = isEnvironmentTextureAsset(asset);
  const processingBusy =
    processingState.phase === "reading" ||
    processingState.phase === "encoding" ||
    processingState.phase === "saving";
  const settingsDisabled = readOnly || processingBusy;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-28 overflow-hidden rounded-md border border-slate-300 shadow-sm">
          <AssetThumbnail asset={asset} projectPath={projectPath} />
        </div>
        <div className="min-w-0 self-center">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">{asset.name}</h3>
          {environmentTexture ? (
            <p className="mt-1 text-[11px] font-semibold text-sky-700">
              {(sourceFormat ?? "HDRI").toUpperCase()}・環境テクスチャ
            </p>
          ) : null}
          <p className="break-all text-xs leading-4 text-slate-500">{textureSourceDisplayLabel(asset)}</p>
          {asset.importedFromModel ? (
            <p className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${asset.importedFromModel.isUserOverridden ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
              {asset.importedFromModel.isUserOverridden
                ? "モデル由来・Import設定を保護"
                : "モデル由来・再インポートで同期"}
            </p>
          ) : null}
        </div>
      </div>

      <EditorSection title="ソース">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>使用中の解像度: {asset.importMetadata?.width && asset.importMetadata.height ? `${asset.importMetadata.width} × ${asset.importMetadata.height}px` : "未取得"}</span>
          <button type="button" disabled={!projectPath || asset.source.kind !== "project" || currentInspection?.busy} onClick={() => void inspectDimensions()} className="shrink-0 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-45">{currentInspection?.busy ? "取得中" : "サイズを確認"}</button>
        </div>
        {currentInspection?.message ? <p role="status" className="text-xs text-amber-700">{currentInspection.message}</p> : null}
        <dl className="grid grid-cols-[42px_minmax(0,1fr)] gap-1 text-xs">
          <dt className="text-slate-500">状態</dt>
          <dd className="text-right font-medium text-slate-700">{asset.status}</dd>
          <dt className="text-slate-500">ソース</dt>
          <dd className="truncate text-right text-slate-700" title={textureSourceDisplayLabel(asset)}>{textureSourceDisplayLabel(asset)}</dd>
        </dl>
        {asset.optimizedFrom ? <p className="text-[11px] leading-4 text-slate-500">変換済み（{(getTextureSourceFormat(asset) ?? "不明").toUpperCase()}）の画像を、シーンと公開の両方で使っています。元画像は保持してあるので、いつでも戻せます。</p> : null}
      </EditorSection>

      <EditorSection title="サイズと圧縮">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">最大解像度</span>
          <select
            value={resizeValue}
            disabled={settingsDisabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange({
                importSettings: {
                  resize:
                    value === "original"
                      ? { mode: "original", powerOfTwo }
                      : { mode: "max-size", maxSize: Number(value), powerOfTwo },
                },
              });
            }}
            className={INPUT_CLASS}
          >
            <option value="original">原寸のまま</option>
            {TEXTURE_MAX_SIZE_CHOICES.map((size) => (
              <option key={size} value={size}>長辺を最大 {size}px まで</option>
            ))}
          </select>
        </label>
        <label className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate-700">
              辺を2のべき乗に揃える
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
              256、512、1024のような辺にします。mipmap、繰り返しタイリング、GPU圧縮がきれいに効きます
            </span>
          </span>
          <input
            type="checkbox"
            checked={powerOfTwo}
            disabled={settingsDisabled}
            onChange={(event) =>
              onChange({
                importSettings: {
                  resize: { ...settings.resize, powerOfTwo: event.currentTarget.checked },
                },
              })
            }
            className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        {resizePreview ? (
          <dl className="grid grid-cols-[42px_minmax(0,1fr)] gap-1 text-xs">
            <dt className="text-slate-500">現在</dt>
            <dd className="text-right tabular-nums text-slate-700">
              {resizePreview.from}
            </dd>
            <dt className="text-slate-500">変換後</dt>
            <dd
              className={`text-right tabular-nums ${resizePreview.changes ? "font-semibold text-violet-700" : "text-slate-500"}`}
            >
              {resizePreview.changes ? resizePreview.to : "変わりません"}
            </dd>
          </dl>
        ) : null}
        {resizePreview?.upscales ? (
          <p className="text-[11px] leading-4 text-amber-700">
            いちばん近い2のべき乗が原本より大きいため、引き伸ばされます。容量を減らしたい時は最大解像度も下げてください。
          </p>
        ) : null}
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">圧縮方式</span>
          <select
            value={settings.compression.format}
            disabled={settingsDisabled}
            onChange={(event) => onChange({ importSettings: { compression: { format: event.currentTarget.value as (typeof TEXTURE_COMPRESSION_FORMATS)[number] } } })}
            className={INPUT_CLASS}
          >
            {TEXTURE_COMPRESSION_FORMATS.map((value) => (
              <option key={value} value={value}>
                {TEXTURE_COMPRESSION_FORMAT_LABELS[value]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] leading-4 text-slate-500">
            {TEXTURE_COMPRESSION_FORMAT_HINTS[settings.compression.format]}
          </span>
        </label>
        <TextureQualityControl
          format={settings.compression.format}
          quality={settings.compression.quality}
          disabled={settingsDisabled}
          onChange={(quality) => onChange({ importSettings: { compression: { quality } } })}
        />
        <div className="border-t border-slate-200 pt-2">
          <TextureProcessingPanel
            asset={asset}
            state={processingState}
            busy={processingBusy}
            readOnly={readOnly}
            canApply={Boolean(projectPath && onApplyProcessing)}
            onApply={onApplyProcessing}
            onRevert={onRevertProcessing}
          />
        </div>
      </EditorSection>

      {!environmentTexture ? (
        <EditorSection title="遠景 / 草カード">
          <p className="text-[11px] leading-4 text-slate-500">
            テクスチャのアルファを保持した両面Materialと、Colliderを持たないカードをまとめて作成します。
          </p>
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">遠景</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={settingsDisabled || !onCreateCard}
                onClick={() => onCreateCard?.("backdrop-flat")}
                className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                平面
                <span className="mt-0.5 block text-[10px] font-normal leading-3 text-sky-700">20 × 11m</span>
              </button>
              <button
                type="button"
                disabled={settingsDisabled || !onCreateCard}
                onClick={() => onCreateCard?.("backdrop-arc-180")}
                className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                180°カーブ
                <span className="mt-0.5 block text-[10px] font-normal leading-3 text-sky-700">7分割・半円</span>
              </button>
              <button
                type="button"
                disabled={settingsDisabled || !onCreateCard}
                onClick={() => onCreateCard?.("backdrop-arc-270")}
                className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                270°カーブ
                <span className="mt-0.5 block text-[10px] font-normal leading-3 text-sky-700">10分割・広角</span>
              </button>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">草・花</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={settingsDisabled || !onCreateCard}
                onClick={() => onCreateCard?.("grass-single")}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                草カード 1枚
                <span className="mt-0.5 block text-[10px] font-normal leading-3 text-emerald-700">
                  壁際・群生の端に
                </span>
              </button>
              <button
                type="button"
                disabled={settingsDisabled || !onCreateCard}
                onClick={() => onCreateCard?.("grass-cross")}
                className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-2 text-left text-xs font-semibold text-emerald-900 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                草クロス
                <span className="mt-0.5 block text-[10px] font-normal leading-3 text-emerald-800">
                  直交2枚・全方向向け
                </span>
              </button>
            </div>
          </div>
        </EditorSection>
      ) : null}

      <EditorSection title="Color / Mipmap">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">カラースペース</span>
          <select
            value={settings.colorSpace}
            disabled={settingsDisabled}
            onChange={(event) =>
              onChange({ importSettings: { colorSpace: event.currentTarget.value as (typeof TEXTURE_COLOR_SPACES)[number] } })
            }
            className={INPUT_CLASS}
          >
            {TEXTURE_COLOR_SPACES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between text-xs text-slate-600">
          Mipmap生成
          <input
            type="checkbox"
            checked={settings.generateMipmaps}
            disabled={settingsDisabled}
            onChange={(event) => onChange({ importSettings: { generateMipmaps: event.currentTarget.checked } })}
            className="h-4 w-4 accent-violet-600"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-slate-600">
          Flip Y
          <input
            type="checkbox"
            checked={settings.flipY}
            disabled={settingsDisabled}
            onChange={(event) => onChange({ importSettings: { flipY: event.currentTarget.checked } })}
            className="h-4 w-4 accent-violet-600"
          />
        </label>
      </EditorSection>

      <EditorSection title="Sampler">
        <div className="grid grid-cols-2 gap-1.5">
          {(["wrapS", "wrapT"] as const).map((axis) => (
            <label key={axis} className="block text-xs text-slate-600">
              <span className="mb-1 block">{axis}</span>
              <select
                value={settings.sampler[axis]}
                disabled={settingsDisabled}
                onChange={(event) => onChange({ importSettings: { sampler: { [axis]: event.currentTarget.value } } })}
                className={INPUT_CLASS}
              >
                {TEXTURE_WRAP_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ))}
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block">拡大フィルター</span>
            <select
              value={settings.sampler.magFilter}
              disabled={settingsDisabled}
              onChange={(event) => onChange({ importSettings: { sampler: { magFilter: event.currentTarget.value as (typeof TEXTURE_MAG_FILTERS)[number] } } })}
              className={INPUT_CLASS}
            >
              {TEXTURE_MAG_FILTERS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block">縮小フィルター</span>
            <select
              value={settings.sampler.minFilter}
              disabled={settingsDisabled}
              onChange={(event) => onChange({ importSettings: { sampler: { minFilter: event.currentTarget.value as (typeof TEXTURE_MIN_FILTERS)[number] } } })}
              className={INPUT_CLASS}
            >
              {TEXTURE_MIN_FILTERS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </EditorSection>

    </div>
  );
}

/**
 * 変換済みTextureの参照先は `assets/.optimized/` のハッシュ名ファイルになるが、
 * 作者にとってのソースはあくまで取り込んだ元画像。別ファイルが増えたように
 * 見せず、元画像のパスを出し続ける。
 */
function textureSourceDisplayLabel(asset: TextureAsset): string {
  const origin = asset.optimizedFrom;
  if (origin && origin.source.kind === "project") return origin.source.relativePath;
  return sourceLabel(asset);
}

/**
 * Qualityは0..100の数値で保存するが、その数字自体は作者に何も伝えない。
 * 「80%」が何と比べて80なのかは、JPEGの画質とBasisの探索量で意味が違う。
 * 入口では見た目と容量のどちらを優先するかだけを選ばせ、数値は結果として示す。
 */
const TEXTURE_QUALITY_LEVELS = [
  {
    quality: 95,
    label: "最高",
    hint: "元の見た目をほぼ保つ。容量は大きめ",
  },
  {
    quality: 85,
    label: "高",
    hint: "近くで見るものに。既定",
  },
  {
    quality: 70,
    label: "標準",
    hint: "壁や床など、面積の広いものに",
  },
  {
    quality: 50,
    label: "軽量",
    hint: "遠景や小さく映るものに。容量は最小",
  },
] as const;

function TextureQualityControl({
  format,
  quality,
  disabled,
  onChange,
}: {
  format: (typeof TEXTURE_COMPRESSION_FORMATS)[number];
  quality: number;
  disabled: boolean;
  onChange: (quality: number) => void;
}) {
  const ktx2 = format === "ktx2";
  // 一番近い段を選択中として示す。MCPや旧documentの半端な値でも段が消えない。
  const nearest = TEXTURE_QUALITY_LEVELS.reduce((closest, level) =>
    Math.abs(level.quality - quality) < Math.abs(closest.quality - quality)
      ? level
      : closest,
  );
  const exact = TEXTURE_QUALITY_LEVELS.some((level) => level.quality === quality);

  return (
    <div className="text-xs text-slate-600">
      <span className="mb-1 block">{ktx2 ? "圧縮の強さ" : "書き出す画質"}</span>
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="画質の目安">
        {TEXTURE_QUALITY_LEVELS.map((level) => {
          const selected = exact
            ? level.quality === quality
            : level.quality === nearest.quality;
          return (
            <button
              key={level.quality}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              title={level.hint}
              onClick={() => onChange(level.quality)}
              className={`rounded-md border px-1 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                selected
                  ? "border-violet-300 bg-violet-50 text-violet-800"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {level.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        {exact
          ? nearest.hint
          : `${nearest.hint}に近い設定です（保存値 ${quality}）`}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        {ktx2
          ? "KTX2ではGPU上の容量は解像度だけで決まります。ここで変わるのは通信量と見た目、それに変換にかかる時間です。"
          : "PNGは可逆のため、この設定では容量が変わりません。軽くしたい時はWEBPかKTX2を選びます。"}
      </p>
    </div>
  );
}

/** 保存値に一番近い段の名前。数値のままだと何と比べた値なのか伝わらない。 */
function textureQualityLabel(quality: number): string {
  const nearest = TEXTURE_QUALITY_LEVELS.reduce((closest, level) =>
    Math.abs(level.quality - quality) < Math.abs(closest.quality - quality)
      ? level
      : closest,
  );
  return nearest.quality === quality
    ? nearest.label
    : `${nearest.label}相当（${quality}）`;
}

/** 最大解像度と2のべき乗を合わせた結果を、実行前に見せる。 */
function describeResizePreview(asset: TextureAsset): {
  from: string;
  to: string;
  changes: boolean;
  upscales: boolean;
} | null {
  const width = asset.importMetadata?.width;
  const height = asset.importMetadata?.height;
  if (!width || !height) return null;
  const plan = planTextureProcessing(asset);
  if (asset.optimizedFrom && plan.supported) {
    const targetWidth = plan.pending ? plan.targetWidth : width;
    const targetHeight = plan.pending ? plan.targetHeight : height;
    if (!targetWidth || !targetHeight) return null;
    return {
      from: `${width} × ${height}`,
      to: `${targetWidth} × ${targetHeight}`,
      changes: targetWidth !== width || targetHeight !== height,
      upscales: targetWidth > (plan.sourceWidth ?? targetWidth) || targetHeight > (plan.sourceHeight ?? targetHeight),
    };
  }
  const maxSize =
    asset.importSettings.resize.mode === "max-size"
      ? asset.importSettings.resize.maxSize
      : null;
  const target = resolveTargetSize(
    width,
    height,
    maxSize,
    asset.importSettings.resize.powerOfTwo === true,
  );
  return {
    from: `${width} × ${height}`,
    to: `${target.width} × ${target.height}`,
    changes: target.width !== width || target.height !== height,
    upscales: target.width > width || target.height > height,
  };
}

const TEXTURE_COMPRESSION_FORMAT_LABELS: Record<
  (typeof TEXTURE_COMPRESSION_FORMATS)[number],
  string
> = {
  source: "画像形式を維持（サイズのみ変更）",
  webp: "WEBP（配信サイズを下げる）",
  ktx2: "KTX2 / Basis（GPU圧縮）",
};

const TEXTURE_COMPRESSION_FORMAT_HINTS: Record<
  (typeof TEXTURE_COMPRESSION_FORMATS)[number],
  string
> = {
  source: "変換元の画像形式を維持します。変換済みの場合は、保持した元画像の形式です。サイズの指定がなければ追加の変換はしません。",
  webp: "通信量は減りますが、GPU上ではRGBAへ展開されるためVRAMは変わりません。",
  ktx2: "GPUが圧縮のまま扱えるため、通信量とVRAMの両方を下げられます。端末により見た目が変わります。",
};

/**
 * 最大解像度・圧縮の設定は公開時に自動で適用されるので、公開だけが目的なら
 * ここでの書き出しは要らない。Editorの表示と原本そのものを軽くしたいときに使う
 * 操作として、変換前後を並べて示す。
 */
function TextureProcessingPanel({
  asset,
  state,
  busy,
  readOnly,
  canApply,
  onApply,
  onRevert,
}: {
  asset: TextureAsset;
  state: TextureProcessingState;
  busy: boolean;
  readOnly: boolean;
  canApply: boolean;
  onApply?: () => void;
  onRevert?: () => void;
}) {
  const plan = planTextureProcessing(asset);
  const optimization = describeTextureOptimization(asset);
  const inUse = optimization.optimized ? (
    <AssetOptimizationOriginCard
      currentLabel={optimization.current.label}
      currentBytes={optimization.current.byteLength}
      originalLabel={optimization.original.label}
      originalBytes={optimization.original.byteLength}
      revertLabel="原本の画像に戻す"
      disabled={busy || readOnly || !onRevert}
      onRevert={onRevert}
    />
  ) : null;

  if (!plan.supported) {
    return (
      <>
        {inUse}
        <p className="rounded border border-slate-200 bg-slate-50 p-1.5 text-xs leading-4 text-slate-600">
          {plan.reason}
        </p>
      </>
    );
  }

  const currentSize =
    plan.sourceWidth && plan.sourceHeight
      ? `${plan.sourceWidth} × ${plan.sourceHeight}`
      : "解像度不明";
  const targetSize =
    plan.targetWidth && plan.targetHeight
      ? `${plan.targetWidth} × ${plan.targetHeight}`
      : plan.maxSize
        ? `最大 ${plan.maxSize}px`
        : currentSize;
  const targetFormat = plan.outputFormat === "jpeg" ? "JPEG" : plan.outputFormat.toUpperCase();
  const blockedReason = readOnly
    ? "Playを停止すると変換できます。"
    : !canApply
      ? "初回の自動保存が終わると変換できます。"
      : null;

  return (
    <>
      {inUse}
      <dl className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">変換元</dt>
        <dd className="text-right tabular-nums text-slate-700">
          {currentSize}・{plan.sourceFormat.toUpperCase()}・
          {formatFileSize(plan.sourceByteLength)}
        </dd>
        <dt className="text-slate-500">変換後</dt>
        <dd
          className={`text-right tabular-nums ${plan.pending ? "font-semibold text-violet-700" : "text-slate-500"}`}
        >
          {plan.pending
            ? `${targetSize}・${targetFormat}${plan.qualityApplies ? `・画質${textureQualityLabel(plan.quality)}` : ""}`
            : "変更なし"}
        </dd>
      </dl>
      {plan.pending && plan.outputFormatSubstituted ? (
        <p className="text-[11px] leading-4 text-slate-500">
          {plan.sourceFormat.toUpperCase()}は書き戻せないため、{targetFormat}で保存します。
        </p>
      ) : null}
      {plan.pending && plan.powerOfTwo ? (
        <p className="text-[11px] leading-4 text-slate-500">
          辺をいちばん近い2のべき乗へ丸めるため、縦横比がわずかに変わります。
        </p>
      ) : null}
      {plan.pending && !plan.qualityApplies && plan.outputFormat === "png" ? (
        <p className="text-[11px] leading-4 text-slate-500">
          PNGは可逆のため、画質の設定では容量が変わりません。圧縮するときはWEBPかKTX2を選びます。
        </p>
      ) : null}
      <button
        type="button"
        disabled={!plan.pending || busy || readOnly || !canApply}
        onClick={onApply}
        className="h-8 w-full rounded-md border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "変換中" : "この設定で画像を書き出す"}
      </button>
      {state.phase !== "idle" ? (
        <p
          role="status"
          className={`rounded border p-1.5 text-xs leading-4 ${
            state.phase === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : state.phase === "succeeded"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {state.message}
        </p>
      ) : blockedReason ? (
        <p className="text-[11px] leading-4 text-slate-500">{blockedReason}</p>
      ) : plan.pending ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-1.5 text-xs leading-4 text-amber-800">
          変換すると、シーンの表示と公開物の両方がこの画像を使います。元の画像ファイルは残るので、いつでも原本へ戻せます。変換しないまま公開した場合も、公開時に同じ設定で変換されます。
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-slate-500">{plan.settledReason}</p>
      )}
    </>
  );
}

export function AssetQuickEditor({
  asset,
  assets,
  projectPath,
  referenceSummary,
  readOnly,
  onSelectAsset,
  onMaterialChange,
  onOpenShader,
  onOpenMaterialShader,
  onAssignShaderAsset,
  onModelChange,
  onReimportModel,
  onCreateModelAnimationGraph,
  modelReimportState,
  modelReimportImpactNotice,
  modelOptimizationState,
  onApplyModelOptimization,
  onParticleChange,
  onTextureChange,
  onCreateTextureCard,
  textureProcessingState,
  onApplyTextureProcessing,
  onRevertTextureProcessing,
  onRevertModelOptimization,
  prefabs,
  onSelectPrefabSourceEntity,
  onUpdatePrefab,
}: {
  asset: SceneAsset;
  assets: AssetManifest;
  projectPath?: string;
  referenceSummary?: { entityCount: number; slotCount: number };
  readOnly: boolean;
  onSelectAsset: (assetId: string) => void;
  onMaterialChange: (assetId: string, patch: MaterialAssetPatch) => void;
  onOpenShader: (assetId: string) => void;
  onOpenMaterialShader: (assetId: string, stage: ShaderAssetStage) => void;
  onAssignShaderAsset: (
    materialAssetId: string,
    stage: ShaderAssetStage,
    shaderAssetId: string | null,
  ) => void;
  onModelChange: (assetId: string, patch: ModelAssetPatch) => void;
  onReimportModel: (assetId: string) => void;
  onCreateModelAnimationGraph?: (assetId: string) => void;
  modelReimportState: ModelReimportState;
  modelReimportImpactNotice?: ModelReimportImpactNotice | null;
  modelOptimizationState?: ModelOptimizationState;
  onApplyModelOptimization?: (
    assetId: string,
    options: ModelOptimizationOptions,
  ) => void;
  onParticleChange: (assetId: string, patch: ParticlePropertiesPatch) => void;
  onTextureChange: (assetId: string, patch: TextureAssetPatch) => void;
  textureProcessingState?: TextureProcessingState;
  onApplyTextureProcessing?: (assetId: string) => void;
  onRevertTextureProcessing?: (assetId: string) => void;
  onRevertModelOptimization?: (assetId: string) => void;
  onCreateTextureCard?: (
    textureAssetId: string,
    profile: TextureCardProfile,
  ) => void;
  prefabs: Readonly<Record<string, PrefabDocument>>;
  onSelectPrefabSourceEntity: (entityId: string) => void;
  onUpdatePrefab: (prefabId: string) => void;
}) {
  if (asset.kind === "material") {
    return (
      <MaterialQuickEditor
        asset={asset}
        assets={assets}
        projectPath={projectPath}
        referenceSummary={referenceSummary}
        readOnly={readOnly}
        onChange={(patch) => onMaterialChange(asset.id, patch)}
        onOpenTexture={onSelectAsset}
        onOpenShader={onOpenShader}
        onOpenMaterialShader={onOpenMaterialShader}
        onAssignShaderAsset={onAssignShaderAsset}
      />
    );
  }

  if (asset.kind === "model") {
    const reimportBusy =
      modelReimportState.phase === "reading" ||
      modelReimportState.phase === "processing" ||
      modelReimportState.phase === "committing" ||
      modelReimportState.phase === "review";
    return (
      <ModelAssetInspector
        asset={asset}
        assets={assets}
        preview={
          <AssetThumbnail
            asset={asset}
            assets={assets}
            projectPath={projectPath}
          />
        }
        readOnly={readOnly || reimportBusy}
        canReimport={Boolean(projectPath && asset.source.kind === "project")}
        reimportState={modelReimportState}
        reimportImpactNotice={modelReimportImpactNotice}
        optimizationState={modelOptimizationState}
        canOptimize={Boolean(projectPath && onApplyModelOptimization)}
        onChange={(patch) => onModelChange(asset.id, patch)}
        onOpenMaterial={onSelectAsset}
        onReimport={() => onReimportModel(asset.id)}
        onCreateAnimationGraph={
          onCreateModelAnimationGraph
            ? () => onCreateModelAnimationGraph(asset.id)
            : undefined
        }
        onOptimize={
          onApplyModelOptimization
            ? (options) => onApplyModelOptimization(asset.id, options)
            : undefined
        }
        onRevertOptimization={
          onRevertModelOptimization
            ? () => onRevertModelOptimization(asset.id)
            : undefined
        }
      />
    );
  }

  if (asset.kind === "texture") {
    return (
      <TextureQuickEditor
        asset={asset}
        projectPath={projectPath}
        readOnly={readOnly}
        processingState={textureProcessingState}
        onChange={(patch) => onTextureChange(asset.id, patch)}
        onCreateCard={(profile) => onCreateTextureCard?.(asset.id, profile)}
        onApplyProcessing={
          onApplyTextureProcessing
            ? () => onApplyTextureProcessing(asset.id)
            : undefined
        }
        onRevertProcessing={
          onRevertTextureProcessing
            ? () => onRevertTextureProcessing(asset.id)
            : undefined
        }
      />
    );
  }

  if (asset.kind === "particle") {
    return (
      <ParticleAssetInspector
        asset={asset}
        assets={assets}
        readOnly={readOnly}
        onChange={(patch) => onParticleChange(asset.id, patch)}
        onOpenTexture={onSelectAsset}
      />
    );
  }

  if (asset.kind === "audio") {
    return <AudioAssetInspector asset={asset} projectPath={projectPath} />;
  }

  if (asset.kind === "shader") {
    return (
      <EditorSection title="GLSL Shader">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs leading-4 text-slate-600">
            {asset.stage} shaderとしてインポートされています。Materialから参照してScene Viewへ反映できます。
          </p>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onOpenShader(asset.id)}
            className="mt-2 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            GLSLを編集
          </button>
        </div>
      </EditorSection>
    );
  }

  const prefabReference = getPrefabAssetDocumentReference(asset);
  if (prefabReference) {
    const { prefabId } = prefabReference;
    return (
      <PrefabQuickEditor
        asset={prefabReference.asset}
        document={prefabs[prefabId]}
        readOnly={readOnly}
        onSelectSourceEntity={onSelectPrefabSourceEntity}
        onUpdate={() => onUpdatePrefab(prefabId)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-28 w-36 shrink-0 overflow-hidden rounded-md border border-slate-300">
        <AssetThumbnail asset={asset} projectPath={projectPath} />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-slate-900">{asset.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{sourceLabel(asset)}</p>
        <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs leading-4 text-slate-600">
          {projectPath && asset.thumbnail && asset.thumbnail.status !== "missing"
            ? "生成済みサムネイルを表示しています。ソースはプロジェクト相対パスで管理されます。"
            : "生成済みサムネイルがないため代替プレビューを表示しています。ソースの状態は上のアセット情報で確認できます。"}
        </p>
      </div>
    </div>
  );
}
