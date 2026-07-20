import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Color, DoubleSide, type Material } from "three";
import { tauri } from "../../lib/tauri";
import {
  TEXTURE_COLOR_SPACES,
  TEXTURE_COMPRESSION_FORMATS,
  TEXTURE_MAG_FILTERS,
  TEXTURE_MIN_FILTERS,
  TEXTURE_WRAP_MODES,
  type AssetManifest,
  type Color3,
  type Color4,
  type MaterialAsset,
  type MaterialAssetPatch,
  type MaterialExtensionsPatch,
  type MaterialTextureInfo,
  type MaterialTextureInfoPatch,
  type MaterialTextureTransform,
  type ModelAssetPatch,
  type ParticlePropertiesPatch,
  type SceneAsset,
  type TextureAsset,
  type TextureAssetPatch,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import { ParticleAssetInspector } from "./ParticleAssetInspector";
import {
  ModelAssetInspector,
  type ModelReimportImpactNotice,
  type ModelReimportState,
} from "./ModelAssetInspector";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { TEXTURE_DRAG_MIME } from "./types";
import {
  type MaterialPreviewTextureLoadStatus,
  type MaterialPreviewTextureStatuses,
  useMaterialPreviewRenderSync,
  useMaterialPreviewTextureState,
} from "./material-texture-preview";

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
}: {
  asset: MaterialAsset;
  assets?: AssetManifest;
  projectPath?: string;
  className?: string;
  onTextureStatusesChange?: (statuses: MaterialPreviewTextureStatuses) => void;
}) {
  return (
    <div className={`overflow-hidden bg-slate-50 ${className}`}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 2.7], fov: 34 }}
        gl={{ antialias: true, alpha: false }}
      >
        <MaterialPreviewScene
          asset={asset}
          assets={assets}
          projectPath={projectPath}
          onTextureStatusesChange={onTextureStatusesChange}
        />
      </Canvas>
    </div>
  );
}

function AssetThumbnailFallback({ asset }: { asset: SceneAsset }) {
  const Icon =
    asset.kind === "particle"
      ? EDITOR_ICONS.particle
      : asset.kind === "template"
        ? EDITOR_ICONS.prefab
        : asset.kind === "texture"
          ? EDITOR_ICONS.texture
          : asset.kind === "model"
            ? EDITOR_ICONS.model
            : EDITOR_ICONS.asset;
  const label =
    asset.status === "invalid"
      ? "解析失敗・再生成"
      : asset.status === "missing"
        ? "ソース未検出・再取込"
        : "プレビュー準備中";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-slate-500">
      <Icon size={24} aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
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

  const Icon = EDITOR_ICONS[asset.kind === "texture" ? "texture" : "model"];
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
    return (
      <MaterialThumbnail
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
  return <AssetThumbnailFallback asset={asset} />;
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
  return (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        <input
          type="number"
          aria-label={`${label}の数値`}
          min={min}
          max={max}
          step={step}
          value={Number.isInteger(step) ? value : Number(value.toFixed(3))}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
          }}
          className="h-6 w-20 rounded border border-slate-300 bg-white px-1.5 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
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
      <input
        type="number"
        value={Number(value.toFixed(4))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (!Number.isFinite(next)) return;
          if (min !== undefined && next < min) return;
          if (max !== undefined && next > max) return;
          if (isAllowed && !isAllowed(next)) return;
          onChange(next);
        }}
        className={INPUT_CLASS}
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
          <label key={channel} className="relative block">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
              {channel}
            </span>
            <input
              type="number"
              min={0}
              max={max}
              step={0.01}
              value={Number(value[index].toFixed(3))}
              disabled={disabled}
              aria-label={`${label} ${channel}`}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(next) || next < 0) return;
                if (max !== undefined && next > max) return;
                const color: Color3 = [value[0], value[1], value[2]];
                color[index] = next;
                onChange(color);
              }}
              className="h-7 w-full rounded border border-slate-300 bg-white py-1 pl-5 pr-1 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
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
          <label key={axis} className="relative block">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
              {axis}
            </span>
            <input
              type="number"
              step={0.01}
              value={value[index]}
              disabled={disabled}
              aria-label={`${label} ${axis}`}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(next)) return;
                onChange(index === 0 ? [next, value[1]] : [value[0], next]);
              }}
              className="h-7 w-full rounded border border-slate-300 bg-white py-1 pl-5 pr-1 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
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
  const [showTransform, setShowTransform] = useState(Boolean(value?.transform));
  const selectedTexture = value
    ? textures.find((texture) => texture.id === value.textureAssetId)
    : undefined;
  const missingReference = Boolean(value && !selectedTexture);
  const displayedPreviewStatus = selectedTexture
    ? selectedTexture.status !== "ready" || selectedTexture.source.kind !== "project"
      ? "error"
      : previewStatus
    : undefined;
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
            UV変換
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
              <input
                type="number"
                min={0}
                step={1}
                value={value.texCoord}
                disabled={disabled}
                onChange={(event) => {
                  const texCoord = event.currentTarget.valueAsNumber;
                  if (Number.isInteger(texCoord) && texCoord >= 0) {
                    onChange({ ...value, texCoord });
                  }
                }}
                className={INPUT_CLASS}
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
              {showTransform ? "UV Transformを閉じる" : "UV Transformを設定"}
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
                  glTF KHR_texture_transform互換。未設定時はOffset 0、Rotation 0°、Scale 1です。
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
                  label="Scale"
                  value={transform.scale}
                  disabled={disabled}
                  onChange={(scale) => updateTransform({ scale })}
                />
              </div>
              <label className="block text-[11px] font-medium text-slate-500">
                Rotation (°)
                <input
                  type="number"
                  step={1}
                  value={Number(((transform.rotation * 180) / Math.PI).toFixed(2))}
                  disabled={disabled}
                  onChange={(event) => {
                    const degrees = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(degrees)) {
                      updateTransform({ rotation: (degrees * Math.PI) / 180 });
                    }
                  }}
                  className={INPUT_CLASS}
                />
              </label>
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
  return {
    KHR_materials_anisotropy: null,
    KHR_materials_clearcoat: null,
    KHR_materials_dispersion: null,
    KHR_materials_emissive_strength: null,
    KHR_materials_ior: null,
    KHR_materials_iridescence: null,
    KHR_materials_sheen: null,
    KHR_materials_specular: null,
    KHR_materials_transmission: null,
    KHR_materials_volume: null,
  };
}

export function MaterialQuickEditor({
  asset,
  assets,
  projectPath,
  referenceSummary,
  readOnly,
  onChange,
  onOpenTexture,
}: {
  asset: MaterialAsset;
  assets: AssetManifest;
  projectPath?: string;
  referenceSummary?: { entityCount: number; slotCount: number };
  readOnly: boolean;
  onChange: (patch: MaterialAssetPatch) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  const pbr = asset.properties.pbrMetallicRoughness;
  const textures = Object.values(assets.assets).filter(
    (candidate): candidate is TextureAsset => candidate.kind === "texture",
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
          <p className="text-xs text-slate-500">glTF 2.0 標準マテリアル</p>
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
          <RangeControl
            label="Alpha cutoff"
            value={asset.properties.alphaCutoff}
            disabled={readOnly}
            onChange={(alphaCutoff) => onChange({ alphaCutoff })}
          />
        ) : null}
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

export function TextureQuickEditor({
  asset,
  projectPath,
  readOnly,
  onChange,
}: {
  asset: TextureAsset;
  projectPath?: string;
  readOnly: boolean;
  onChange: (patch: TextureAssetPatch) => void;
}) {
  const settings = asset.importSettings;
  const resizeValue = settings.resize.mode === "original" ? "original" : String(settings.resize.maxSize);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-28 overflow-hidden rounded-md border border-slate-300 shadow-sm">
          <AssetThumbnail asset={asset} projectPath={projectPath} />
        </div>
        <div className="min-w-0 self-center">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">{asset.name}</h3>
          <p className="break-all text-xs leading-4 text-slate-500">{sourceLabel(asset)}</p>
          {asset.importedFromModel ? (
            <p className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${asset.importedFromModel.isUserOverridden ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
              {asset.importedFromModel.isUserOverridden
                ? "モデル由来・Import設定を保護"
                : "モデル由来・再インポートで同期"}
            </p>
          ) : null}
        </div>
      </div>

      <EditorSection title="ソース / サイズ">
        <dl className="grid grid-cols-[42px_minmax(0,1fr)] gap-1 text-xs">
          <dt className="text-slate-500">状態</dt>
          <dd className="text-right font-medium text-slate-700">{asset.status}</dd>
          <dt className="text-slate-500">ソース</dt>
          <dd className="truncate text-right text-slate-700" title={sourceLabel(asset)}>{sourceLabel(asset)}</dd>
        </dl>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">最大解像度</span>
          <select
            value={resizeValue}
            disabled={readOnly}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange({
                importSettings: {
                  resize: value === "original" ? { mode: "original" } : { mode: "max-size", maxSize: Number(value) },
                },
              });
            }}
            className={INPUT_CLASS}
          >
            <option value="original">原寸</option>
            {[256, 512, 1024, 2048, 4096, 8192].map((size) => (
              <option key={size} value={size}>最大 {size}px</option>
            ))}
          </select>
        </label>
      </EditorSection>

      <EditorSection title="Color / Mipmap">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">カラースペース</span>
          <select
            value={settings.colorSpace}
            disabled={readOnly}
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
            disabled={readOnly}
            onChange={(event) => onChange({ importSettings: { generateMipmaps: event.currentTarget.checked } })}
            className="h-4 w-4 accent-violet-600"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-slate-600">
          Flip Y
          <input
            type="checkbox"
            checked={settings.flipY}
            disabled={readOnly}
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
                disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
              onChange={(event) => onChange({ importSettings: { sampler: { minFilter: event.currentTarget.value as (typeof TEXTURE_MIN_FILTERS)[number] } } })}
              className={INPUT_CLASS}
            >
              {TEXTURE_MIN_FILTERS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </EditorSection>

      <EditorSection title="Compression">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block">方式</span>
          <select
            value={settings.compression.format}
            disabled={readOnly}
            onChange={(event) => onChange({ importSettings: { compression: { format: event.currentTarget.value as (typeof TEXTURE_COMPRESSION_FORMATS)[number] } } })}
            className={INPUT_CLASS}
          >
            {TEXTURE_COMPRESSION_FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <RangeControl
          label="Quality"
          value={settings.compression.quality}
          min={0}
          max={100}
          step={1}
          disabled={readOnly}
          onChange={(quality) => onChange({ importSettings: { compression: { quality } } })}
        />
        <p className="rounded border border-amber-200 bg-amber-50 p-1.5 text-xs leading-4 text-amber-800">
          設定IRを更新しました。リサイズ・mipmap・圧縮は処理待ちです。
        </p>
      </EditorSection>
    </div>
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
  onModelChange,
  onReimportModel,
  modelReimportState,
  modelReimportImpactNotice,
  onParticleChange,
  onTextureChange,
}: {
  asset: SceneAsset;
  assets: AssetManifest;
  projectPath?: string;
  referenceSummary?: { entityCount: number; slotCount: number };
  readOnly: boolean;
  onSelectAsset: (assetId: string) => void;
  onMaterialChange: (assetId: string, patch: MaterialAssetPatch) => void;
  onModelChange: (assetId: string, patch: ModelAssetPatch) => void;
  onReimportModel: (assetId: string) => void;
  modelReimportState: ModelReimportState;
  modelReimportImpactNotice?: ModelReimportImpactNotice | null;
  onParticleChange: (assetId: string, patch: ParticlePropertiesPatch) => void;
  onTextureChange: (assetId: string, patch: TextureAssetPatch) => void;
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
        onChange={(patch) => onModelChange(asset.id, patch)}
        onOpenMaterial={onSelectAsset}
        onReimport={() => onReimportModel(asset.id)}
      />
    );
  }

  if (asset.kind === "texture") {
    return (
      <TextureQuickEditor
        asset={asset}
        projectPath={projectPath}
        readOnly={readOnly}
        onChange={(patch) => onTextureChange(asset.id, patch)}
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
