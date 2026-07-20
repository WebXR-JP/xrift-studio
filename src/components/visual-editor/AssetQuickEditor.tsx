import { useEffect, useState, type DragEvent } from "react";
import { Canvas } from "@react-three/fiber";
import { DoubleSide } from "three";
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
  type MaterialTextureInfo,
  type ParticlePropertiesPatch,
  type SceneAsset,
  type TextureAsset,
  type TextureAssetPatch,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import { ParticleAssetInspector } from "./ParticleAssetInspector";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { TEXTURE_DRAG_MIME } from "./types";

const INPUT_CLASS =
  "h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

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

function sourceLabel(asset: SceneAsset): string {
  if (asset.source.kind === "builtin") return `Builtin / ${asset.source.key}`;
  if (asset.source.kind === "project") return asset.source.relativePath;
  return "Document内の設定（画像データなし）";
}

function MaterialPreviewScene({ asset }: { asset: MaterialAsset }) {
  const pbr = asset.properties.pbrMetallicRoughness;
  const color = colorToHex(pbr?.baseColorFactor, asset.properties.color ?? "#ffffff");
  const opacity = pbr?.baseColorFactor?.[3] ?? asset.properties.opacity ?? 1;
  const emissive = colorToHex(asset.properties.emissiveFactor, "#000000");

  return (
    <>
      <color attach="background" args={["#f8fafc"]} />
      <ambientLight intensity={1.45} />
      <directionalLight position={[2.5, 3, 4]} intensity={2.8} />
      <directionalLight position={[-2, -1, 1]} intensity={0.65} color="#ddd6fe" />
      <mesh rotation={[0.16, 0.42, 0]}>
        <sphereGeometry args={[0.78, 32, 24]} />
        <meshStandardMaterial
          color={color}
          metalness={pbr?.metallicFactor ?? asset.properties.metalness ?? 0}
          roughness={pbr?.roughnessFactor ?? asset.properties.roughness ?? 1}
          emissive={emissive}
          opacity={opacity}
          transparent={asset.properties.alphaMode === "BLEND" || opacity < 1}
          alphaTest={asset.properties.alphaMode === "MASK" ? asset.properties.alphaCutoff : 0}
          side={asset.properties.doubleSided ? DoubleSide : undefined}
        />
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
  className = "h-full w-full",
}: {
  asset: MaterialAsset;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden bg-slate-50 ${className}`}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 2.7], fov: 34 }}
        gl={{ antialias: true, alpha: false }}
      >
        <MaterialPreviewScene asset={asset} />
      </Canvas>
    </div>
  );
}

function CheckerSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden text-slate-600"
      style={{
        backgroundColor: "#e2e8f0",
        backgroundImage:
          "linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%)",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        backgroundSize: "16px 16px",
      }}
    >
      {children}
    </div>
  );
}

function ProxyModelThumbnail() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        camera={{ position: [2.2, 1.8, 2.5], fov: 38 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 4, 2]} intensity={2.8} />
        <mesh rotation={[0.15, 0.5, 0]}>
          <boxGeometry args={[1.05, 1.05, 1.05]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.72} metalness={0.08} />
        </mesh>
      </Canvas>
      <span className="absolute bottom-1 right-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-xs text-slate-100">
        Proxy / 未生成
      </span>
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
          alt={`${asset.name}の生成済みサムネイル`}
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
        {state.status === "loading" ? "サムネイル読み込み中" : "サムネイルを読み込めません"}
      </span>
    </div>
  );
}

export function AssetThumbnail({
  asset,
  projectPath,
}: {
  asset: SceneAsset;
  projectPath?: string;
}) {
  if (asset.kind === "material") return <MaterialThumbnail asset={asset} />;
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
  if (asset.kind === "model") return <ProxyModelThumbnail />;

  if (asset.kind === "texture") {
    const TextureIcon = EDITOR_ICONS.texture;
    return (
      <CheckerSurface>
        <div className="flex flex-col items-center gap-1 rounded bg-white/85 px-2 py-1.5 shadow-sm">
          <TextureIcon size={22} aria-hidden="true" />
          <span className="text-xs font-semibold">プレビュー未生成</span>
        </div>
      </CheckerSurface>
    );
  }

  const Icon =
    asset.kind === "particle"
      ? EDITOR_ICONS.particle
      : asset.kind === "template"
        ? EDITOR_ICONS.prefab
        : EDITOR_ICONS.asset;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-200 text-slate-500">
      <Icon size={24} aria-hidden="true" />
      <span className="text-xs font-medium">サムネイル未生成</span>
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
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        <output className="tabular-nums text-slate-800">{value.toFixed(2)}</output>
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
    </label>
  );
}

function TextureSlot({
  label,
  value,
  textures,
  disabled,
  onChange,
}: {
  label: string;
  value?: MaterialTextureInfo;
  textures: TextureAsset[];
  disabled: boolean;
  onChange: (value: MaterialTextureInfo | null) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const textureAssetId = readEditorDragData(
      event.dataTransfer,
      TEXTURE_DRAG_MIME,
    );
    clearEditorDragData();
    setDropActive(false);
    if (!textures.some((texture) => texture.id === textureAssetId)) return;
    onChange({ textureAssetId, texCoord: value?.texCoord ?? 0 });
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
      className={`relative grid grid-cols-[68px_minmax(0,1fr)_54px] items-end gap-1.5 rounded border p-1 transition-colors ${dropActive ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : "border-transparent"}`}
    >
      <label className="block min-w-0 text-xs text-slate-600">
        <span className="mb-1 block truncate">{label}</span>
        <select
          value={value?.textureAssetId ?? ""}
          disabled={disabled || textures.length === 0}
          onChange={(event) => {
            const textureAssetId = event.currentTarget.value;
            onChange(
              textureAssetId
                ? { textureAssetId, texCoord: value?.texCoord ?? 0 }
                : null,
            );
          }}
          className={INPUT_CLASS}
        >
          <option value="">なし</option>
          {textures.map((texture) => (
            <option key={texture.id} value={texture.id}>
              {texture.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-slate-600">
        <span className="mb-1 block">UV</span>
        <input
          type="number"
          min={0}
          step={1}
          value={value?.texCoord ?? 0}
          disabled={disabled || !value}
          onChange={(event) => {
            if (!value) return;
            const texCoord = event.currentTarget.valueAsNumber;
            if (Number.isInteger(texCoord) && texCoord >= 0) {
              onChange({ ...value, texCoord });
            }
          }}
          className={INPUT_CLASS}
        />
      </label>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => onChange(null)}
        className="h-7 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        解除
      </button>
      {dropActive ? (
        <span className="pointer-events-none absolute inset-x-1 bottom-0 rounded bg-violet-600 px-1 py-0.5 text-center text-[11px] font-semibold text-white">
          {label}へTextureを設定
        </span>
      ) : null}
    </div>
  );
}

export function MaterialQuickEditor({
  asset,
  assets,
  readOnly,
  onChange,
}: {
  asset: MaterialAsset;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: MaterialAssetPatch) => void;
}) {
  const pbr = asset.properties.pbrMetallicRoughness;
  const textures = Object.values(assets.assets).filter(
    (candidate): candidate is TextureAsset => candidate.kind === "texture",
  );
  const baseColor = colorToHex(pbr.baseColorFactor, asset.properties.color);
  const emissiveColor = colorToHex(asset.properties.emissiveFactor, "#000000");
  const iridescence = asset.properties.extensions.KHR_materials_iridescence;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-28 overflow-hidden rounded-md border border-slate-300 shadow-sm">
          <MaterialThumbnail asset={asset} />
        </div>
        <div className="min-w-0 self-center">
          <h3 className="truncate text-[13px] font-semibold text-slate-900">{asset.name}</h3>
          <p className="text-xs text-slate-500">glTF 2.0 標準マテリアル</p>
          <p className="mt-2 text-xs leading-4 text-slate-600">
            変更はプレビューとシーン内の参照メッシュへ即時反映されます。
          </p>
        </div>
      </div>

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
          label="Texture"
          value={pbr.baseColorTexture}
          textures={textures}
          disabled={readOnly}
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
          label="Packed Map"
          value={pbr.metallicRoughnessTexture}
          textures={textures}
          disabled={readOnly}
          onChange={(metallicRoughnessTexture) =>
            onChange({ pbrMetallicRoughness: { metallicRoughnessTexture } })
          }
        />
      </EditorSection>

      <EditorSection title="Normal / Occlusion">
        <TextureSlot
          label="Normal"
          value={asset.properties.normalTexture}
          textures={textures}
          disabled={readOnly}
          onChange={(value) =>
            onChange({
              normalTexture: value
                ? { ...value, scale: asset.properties.normalTexture?.scale ?? 1 }
                : null,
            })
          }
        />
        <RangeControl
          label="Normal scale"
          value={asset.properties.normalTexture?.scale ?? 1}
          min={0}
          max={2}
          disabled={readOnly || !asset.properties.normalTexture}
          onChange={(scale) => {
            const current = asset.properties.normalTexture;
            if (current) onChange({ normalTexture: { ...current, scale } });
          }}
        />
        <TextureSlot
          label="Occlusion"
          value={asset.properties.occlusionTexture}
          textures={textures}
          disabled={readOnly}
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
          label="Texture"
          value={asset.properties.emissiveTexture}
          textures={textures}
          disabled={readOnly}
          onChange={(emissiveTexture) => onChange({ emissiveTexture })}
        />
      </EditorSection>

      <EditorSection title="KHR_materials_iridescence">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
          Iridescence
          <input
            type="checkbox"
            checked={Boolean(iridescence)}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                extensions: {
                  KHR_materials_iridescence: event.currentTarget.checked
                    ? {
                        iridescenceFactor: 1,
                        iridescenceIor: 1.3,
                        iridescenceThicknessMinimum: 100,
                        iridescenceThicknessMaximum: 400,
                      }
                    : null,
                },
              })
            }
            className="h-4 w-4 accent-violet-600"
          />
        </label>
        {iridescence ? (
          <>
            <RangeControl
              label="Factor"
              value={iridescence.iridescenceFactor}
              disabled={readOnly}
              onChange={(iridescenceFactor) =>
                onChange({
                  extensions: {
                    KHR_materials_iridescence: { iridescenceFactor },
                  },
                })
              }
            />
            <TextureSlot
              label="Factor map"
              value={iridescence.iridescenceTexture}
              textures={textures}
              disabled={readOnly}
              onChange={(iridescenceTexture) =>
                onChange({
                  extensions: {
                    KHR_materials_iridescence: { iridescenceTexture },
                  },
                })
              }
            />
            <RangeControl
              label="IOR"
              value={iridescence.iridescenceIor}
              min={1}
              max={3}
              disabled={readOnly}
              onChange={(iridescenceIor) =>
                onChange({
                  extensions: {
                    KHR_materials_iridescence: { iridescenceIor },
                  },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <RangeControl
                label="Thickness min"
                value={iridescence.iridescenceThicknessMinimum}
                min={0}
                max={1200}
                step={1}
                disabled={readOnly}
                onChange={(iridescenceThicknessMinimum) =>
                  onChange({
                    extensions: {
                      KHR_materials_iridescence: {
                        iridescenceThicknessMinimum,
                      },
                    },
                  })
                }
              />
              <RangeControl
                label="Thickness max"
                value={iridescence.iridescenceThicknessMaximum}
                min={0}
                max={1200}
                step={1}
                disabled={readOnly}
                onChange={(iridescenceThicknessMaximum) =>
                  onChange({
                    extensions: {
                      KHR_materials_iridescence: {
                        iridescenceThicknessMaximum,
                      },
                    },
                  })
                }
              />
            </div>
            <TextureSlot
              label="Thickness map"
              value={iridescence.iridescenceThicknessTexture}
              textures={textures}
              disabled={readOnly}
              onChange={(iridescenceThicknessTexture) =>
                onChange({
                  extensions: {
                    KHR_materials_iridescence: {
                      iridescenceThicknessTexture,
                    },
                  },
                })
              }
            />
          </>
        ) : (
          <p className="text-xs leading-4 text-slate-500">
            有効にするとFactor mapとThickness mapへTextureをドロップできます。
          </p>
        )}
      </EditorSection>

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
  readOnly,
  onMaterialChange,
  onParticleChange,
  onTextureChange,
}: {
  asset: SceneAsset;
  assets: AssetManifest;
  projectPath?: string;
  readOnly: boolean;
  onMaterialChange: (assetId: string, patch: MaterialAssetPatch) => void;
  onParticleChange: (assetId: string, patch: ParticlePropertiesPatch) => void;
  onTextureChange: (assetId: string, patch: TextureAssetPatch) => void;
}) {
  if (asset.kind === "material") {
    return (
      <MaterialQuickEditor
        asset={asset}
        assets={assets}
        readOnly={readOnly}
        onChange={(patch) => onMaterialChange(asset.id, patch)}
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
