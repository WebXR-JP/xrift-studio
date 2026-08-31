import {
  TerrainFlattenIcon,
  TerrainGrassEraseIcon,
  TerrainGrassIcon,
  TerrainGrassPaintIcon,
  TerrainHoleAddIcon,
  TerrainHoleRemoveIcon,
  TerrainLowerIcon,
  TerrainRaiseIcon,
  TerrainSettingsIcon,
  TerrainSmoothIcon,
  TerrainStampIcon,
  TerrainSurfaceIcon,
} from "./TerrainToolIcons";
import {
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link2 } from "lucide-react";
import {
  ScriptComponentInspector,
  type ScriptComponentPatch,
  type ScriptEntityOption,
} from "./ScriptComponentInspector";
import type { ScriptContract } from "../../lib/visual-editor/scripting/script-contract";
import { InteractionTriggerInspector } from "./InteractionTriggerInspector";
import {
  collectInteractionTriggerTargets,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "../../lib/visual-editor";
import type { InteractionTriggerPatch } from "../../lib/visual-editor/scene-document";
import {
  AUTOMATIC_TEXT_FONT_ID,
  TEXT_FONT_CATALOG,
  textFontWeightOptions,
  type XriftTextFontDefinition,
} from "../../../packages/xrift-studio-runtime/src/text-font-catalog";
import {
  getGeometryAsset,
  getBuiltinPrimitiveCreation,
  getMaterialAsset,
  normalizeMaterialProperties,
  getMeshMaterialSlots,
  getTransform,
  EDITOR_COMPONENT_CATEGORY_ORDER,
  getEditorComponentMenuDefinitions,
  getXriftComponentDefinition,
  getXriftComponentMenuGroups,
  type AudioSourceComponent,
  type AudioSourcePatch,
  type AssetManifest,
  type ColliderComponent,
  type ColliderPatch,
  type JsonValue,
  type LightComponent,
  type LightPatch,
  type MaterialBinding,
  type MaterialAsset,
  type MaterialAssetPatch,
  type ModelAssetPatch,
  type ModelOptimizationOptions,
  type TextureAsset,
  planTextureProcessing,
  type ModelBoneMetadata,
  type ModelMorphTargetMetadata,
  type ModelPoseState,
  type MaterialSlotDefinition,
  type MeshComponent,
  type ParticleEmitterComponent,
  type ParticlePropertiesPatch,
  type PrefabDocument,
  type SceneDocument,
  type SceneSettings,
  type SceneEntity,
  terrainHeightRange,
  type TerrainGeometry,
  type TerrainGeometryOptions,
  type TerrainViewportEditing,
  type TerrainViewportBrushKind,
  type TerrainSceneBrushOperation,
  type TerrainGrassAppearance,
  type TerrainGrassLayer,
  type TerrainGrassType,
  TERRAIN_GRASS_PRESETS,
  TERRAIN_SURFACE_CATALOG,
  fitTerrainSurfaceToRange,
  getTerrainSurfacePreset,
  type TerrainSurfaceCatalogEntry,
  TERRAIN_GRASS_TYPES,
  TERRAIN_GRASS_MAX_INSTANCES,
  applyTerrainGrassAppearance,
  createTerrainGrassLayers,
  generateTerrainGrassInstances,
  getTerrainGrassType,
  resolveTerrainGrassAppearance,
  type TextureAssetPatch,
  type TextureCardProfile,
  type TextComponent,
  type TextBackgroundFit,
  type TextBackgroundMode,
  type TextBackgroundPatch,
  type TextPatch,
  DEFAULT_TEXT_BACKGROUND,
  type TransformPatch,
  type VegetationWindComponent,
  type VegetationWindPatch,
  type UpdateXriftComponentPatch,
  type Vec3,
  type VisualProjectKind,
  type VisualProjectMetadata,
  type RegisteredSceneComponent,
  type RigidBodyComponent,
  type RigidBodyPatch,
} from "../../lib/visual-editor";
import {
  AssetQuickEditor,
  type TextureProcessingState,
} from "./AssetQuickEditor";
import { tauri } from "../../lib/tauri";
import type {
  ModelOptimizationState,
  ModelReimportImpactNotice,
  ModelReimportState,
} from "./ModelAssetInspector";
import { XRiftComponentInspector } from "./XRiftComponentInspector";
import { SceneSettingsInspector } from "./SceneSettingsPanel";
import {
  commandTitle,
  EDITOR_ICONS,
  getEditorComponentIcon,
} from "./editor-icons";
import { roundTo } from "./editor-utils";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { MATERIAL_DRAG_MIME } from "./types";

export type MeshInspectorPatch = Partial<
  Pick<
    MeshComponent,
    | "enabled"
    | "materialBindings"
    | "castShadow"
    | "receiveShadow"
    | "modelPose"
  >
> & { maxDistance?: number | null; renderOrder?: number | null };

export type ParticleEmitterInspectorPatch = Partial<
  Pick<ParticleEmitterComponent, "enabled" | "particleAssetId">
>;

const LIGHT_LABELS: Record<LightComponent["lightType"], string> = {
  ambient: "Ambient Light",
  directional: "Directional Light",
  hemisphere: "Hemisphere Light",
  point: "Point Light",
  spot: "Spot Light",
  rectArea: "Area Light",
};

type PrefabSourceContext = {
  prefabId: string;
  name: string;
  sourceRootEntityId: string;
};

function findPrefabSourceContext(
  scene: SceneDocument,
  prefabs: Readonly<Record<string, PrefabDocument>>,
  entityId: string,
): PrefabSourceContext | undefined {
  const contains = (rootEntityId: string): boolean => {
    const pending = [rootEntityId];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === entityId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      scene.entities[current]?.children.forEach((childId) => pending.push(childId));
    }
    return false;
  };
  return Object.values(prefabs)
    .filter((document) => document.source.sceneId === scene.sceneId)
    .flatMap((document) =>
      document.source.rootEntityIds
        .filter(contains)
        .map((sourceRootEntityId) => ({
          prefabId: document.prefabId,
          name: document.name,
          sourceRootEntityId,
        })),
    )[0];
}

// Inspectorに専用UIが無いComponentの表示名。種別idをそのまま見せない。
const UNSUPPORTED_COMPONENT_LABELS: Readonly<Record<string, string>> = {
  animation: "Animation（廃止）",
};

function ComponentCard({
  title,
  subtitle,
  enabled,
  actions,
  remove,
  children,
}: {
  title: string;
  subtitle?: string;
  enabled?: {
    checked: boolean;
    disabled: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  };
  actions?: ReactNode;
  // Componentごとに削除ボタンを書き分けず、カード共通の位置と見た目にそろえる。
  remove?: {
    label: string;
    disabled: boolean;
    onRemove: () => void;
  };
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="flex min-h-8 items-center justify-between bg-slate-50/80 px-2.5 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          {enabled ? (
            <input
              type="checkbox"
              checked={enabled.checked}
              disabled={enabled.disabled}
              onChange={(event) => enabled.onChange(event.currentTarget.checked)}
              aria-label={enabled.label}
              title={enabled.label}
              className="h-3.5 w-3.5 shrink-0 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
          <h3 className="truncate text-[13px] font-semibold text-slate-800">{title}</h3>
        </span>
        <span className="flex items-center gap-1.5">
          {subtitle ? <span className="text-xs text-slate-400">{subtitle}</span> : null}
          {actions}
          {remove ? (
            <button
              type="button"
              disabled={remove.disabled}
              onClick={remove.onRemove}
              aria-label={remove.label}
              title={remove.label}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EDITOR_ICONS.delete size={13} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="space-y-2 p-2.5">{children}</div>
    </section>
  );
}

function EntityNameField({
  entity,
  disabled,
  compact = false,
  onRename,
}: {
  entity: SceneEntity;
  disabled: boolean;
  compact?: boolean;
  onRename: (name: string) => void;
}) {
  const [draftName, setDraftName] = useState(entity.name);
  useEffect(() => setDraftName(entity.name), [entity.id, entity.name]);

  const commitName = () => {
    const normalized = draftName.trim();
    if (!normalized) {
      setDraftName(entity.name);
      return;
    }
    onRename(normalized);
    setDraftName(normalized);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraftName(entity.name);
      event.currentTarget.blur();
    }
  };

  return (
    <label
      className={compact ? "min-w-0 flex-1" : "block"}
      title="Entity名。Enterまたはフォーカス移動で確定します"
    >
      <span
        className={
          compact
            ? "sr-only"
            : "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        }
      >
        Entity name
      </span>
      <input
        type="text"
        aria-label="Entity名"
        value={draftName}
        disabled={disabled}
        onChange={(event) => setDraftName(event.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={handleKeyDown}
        className={`w-full rounded border border-slate-300 bg-white text-[12px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
          compact ? "h-7 px-2" : "h-8 px-2.5"
        }`}
      />
    </label>
  );
}

const MIN_SCALE_MAGNITUDE = 0.0001;

type TransformValueKind = "position" | "rotation" | "scale";

type AxisScrubState = {
  pointerId: number;
  axis: "X" | "Y" | "Z";
  axisIndex: number;
  clientX: number;
  clientY: number;
  startValue: Vec3;
  currentValue: Vec3;
  scaleLinked: boolean;
};

function normalizeScaleAxis(value: number, fallback: number): number {
  if (Math.abs(value) >= MIN_SCALE_MAGNITUDE) return value;
  const sign = value < 0 ? -1 : value > 0 ? 1 : fallback < 0 ? -1 : 1;
  return sign * MIN_SCALE_MAGNITUDE;
}

function updateVectorAxis(
  value: Vec3,
  axisIndex: number,
  axisValue: number,
  valueKind: TransformValueKind,
  scaleLinked: boolean,
): Vec3 {
  const next: Vec3 = [value[0], value[1], value[2]];
  if (valueKind !== "scale") {
    next[axisIndex] = axisValue;
    return next;
  }

  const normalizedAxisValue = normalizeScaleAxis(axisValue, value[axisIndex]);
  if (!scaleLinked) {
    next[axisIndex] = normalizedAxisValue;
    return next;
  }

  const ratio = normalizedAxisValue / value[axisIndex];
  return value.map((entry) =>
    normalizeScaleAxis(entry * ratio, entry),
  ) as Vec3;
}

function axisScrubSensitivity(valueKind: TransformValueKind): number {
  return valueKind === "rotation" ? Math.PI / 180 : 0.01;
}

function formatTransformAxis(valueKind: TransformValueKind, value: number): string {
  const displayed = valueKind === "rotation" ? (value * 180) / Math.PI : value;
  return displayed.toFixed(valueKind === "position" ? 3 : 2);
}

function VectorEditor({
  label,
  value,
  valueKind,
  disabled,
  scaleLinked = false,
  onScaleLinkedChange,
  onChange,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  onScrubCancel,
}: {
  label: string;
  value: Vec3;
  valueKind: TransformValueKind;
  disabled: boolean;
  scaleLinked?: boolean;
  onScaleLinkedChange?: (linked: boolean) => void;
  onChange: (value: Vec3) => void;
  onScrubStart?: () => void;
  onScrubChange?: (value: Vec3) => void;
  onScrubEnd?: () => void;
  onScrubCancel?: () => void;
}) {
  const axes = ["X", "Y", "Z"] as const;
  const scrubEnabled = Boolean(
    onScrubStart && onScrubChange && onScrubEnd && onScrubCancel,
  );
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const scrubRef = useRef<AxisScrubState | null>(null);
  const [scrub, setScrub] = useState<AxisScrubState | null>(null);
  const displayedValues: Vec3 =
    valueKind === "rotation"
      ? (value.map((axis) => roundTo((axis * 180) / Math.PI, 2)) as Vec3)
      : (value.map((axis) => roundTo(axis, 3)) as Vec3);

  const cancelScrub = (pointerId?: number) => {
    const active = scrubRef.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    scrubRef.current = null;
    setScrub(null);
    onScrubCancel?.();
  };

  const focusAxisInput = (axisIndex: number) => {
    inputRefs.current[axisIndex]?.focus({ preventScroll: true });
  };

  const handleAxisPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: (typeof axes)[number],
    axisIndex: number,
  ) => {
    if (!scrubEnabled || disabled || event.button !== 0 || scrubRef.current) return;
    event.preventDefault();
    focusAxisInput(axisIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
    const startValue: Vec3 = [value[0], value[1], value[2]];
    const nextScrub: AxisScrubState = {
      pointerId: event.pointerId,
      axis,
      axisIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      startValue,
      currentValue: startValue,
      scaleLinked: valueKind === "scale" && scaleLinked,
    };
    scrubRef.current = nextScrub;
    setScrub(nextScrub);
    onScrubStart?.();
  };

  const handleAxisPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = scrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const horizontalDelta = event.clientX - active.clientX;
    if (horizontalDelta === 0) {
      const nextScrub = { ...active, clientY: event.clientY };
      scrubRef.current = nextScrub;
      setScrub(nextScrub);
      return;
    }
    const modifier = event.shiftKey ? 0.1 : event.ctrlKey || event.altKey ? 10 : 1;
    const axisValue =
      active.currentValue[active.axisIndex] +
      horizontalDelta * axisScrubSensitivity(valueKind) * modifier;
    const currentValue = updateVectorAxis(
      active.currentValue,
      active.axisIndex,
      axisValue,
      valueKind,
      active.scaleLinked,
    );
    const nextScrub = {
      ...active,
      clientX: event.clientX,
      clientY: event.clientY,
      currentValue,
    };
    scrubRef.current = nextScrub;
    setScrub(nextScrub);
    onScrubChange?.(currentValue);
  };

  const handleAxisPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = scrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    scrubRef.current = null;
    setScrub(null);
    focusAxisInput(active.axisIndex);
    onScrubEnd?.();
  };

  return (
    <div className="relative">
      <fieldset className="grid grid-cols-[54px_repeat(3,minmax(0,1fr))] items-center gap-1.5">
        <legend className="sr-only">{label}</legend>
        <span className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
          <span>{label}</span>
          {valueKind === "scale" && onScaleLinkedChange ? (
            <button
              type="button"
              disabled={disabled}
              aria-label={scaleLinked ? "Scale比率の固定を解除" : "Scale比率を固定"}
              aria-pressed={scaleLinked}
              title={scaleLinked ? "Scale比率を固定中" : "Scaleを軸ごとに変更"}
              onClick={() => onScaleLinkedChange?.(!scaleLinked)}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                scaleLinked
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-transparent text-slate-400 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Link2 size={12} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        {axes.map((axis, index) => (
          <div key={axis} className="relative block min-w-0">
            {scrubEnabled ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`${label} ${axis}をドラッグして調整`}
                title={`${label} ${axis}を左右にドラッグ。Shift: 微調整、Ctrl/Alt: 大きく調整。ダブルクリック: 数値入力`}
                onPointerDown={(event) => handleAxisPointerDown(event, axis, index)}
                onPointerMove={handleAxisPointerMove}
                onPointerUp={handleAxisPointerUp}
                onPointerCancel={(event) => cancelScrub(event.pointerId)}
                onLostPointerCapture={(event) => cancelScrub(event.pointerId)}
                onDoubleClick={() => {
                  focusAxisInput(index);
                  inputRefs.current[index]?.select();
                }}
                onKeyDown={(event) => {
                  if (!scrubRef.current) return;
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelScrub();
                  }
                }}
                className="absolute inset-y-px left-px z-10 w-5 touch-none cursor-ew-resize rounded-l text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                {axis}
              </button>
            ) : (
              <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                {axis}
              </span>
            )}
            <input
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              type="number"
              value={displayedValues[index]}
              disabled={disabled}
              step={valueKind === "rotation" ? 1 : 0.1}
              aria-label={`${label} ${axis}`}
              onKeyDown={(event) => {
                if (!scrubRef.current) return;
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelScrub();
                }
              }}
              onChange={(event) => {
                const nextValue = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(nextValue)) return;
                const normalizedValue =
                  valueKind === "rotation" ? (nextValue * Math.PI) / 180 : nextValue;
                if (
                  valueKind === "scale" &&
                  Math.abs(normalizedValue) < MIN_SCALE_MAGNITUDE
                ) {
                  return;
                }
                onChange(
                  updateVectorAxis(
                    value,
                    index,
                    normalizedValue,
                    valueKind,
                    valueKind === "scale" && scaleLinked,
                  ),
                );
              }}
              className="h-7 w-full rounded border border-slate-300 bg-white py-1 pl-5 pr-1 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        ))}
      </fieldset>
      {scrub ? (
        <div
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium tabular-nums text-slate-700 shadow-md"
          style={{
            left: Math.max(8, Math.min(scrub.clientX + 12, window.innerWidth - 190)),
            top: Math.max(8, Math.min(scrub.clientY + 12, window.innerHeight - 36)),
          }}
        >
          {label} {scrub.axis}{" "}
          {formatTransformAxis(valueKind, scrub.startValue[scrub.axisIndex])}
          {" → "}
          {formatTransformAxis(valueKind, scrub.currentValue[scrub.axisIndex])}
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-slate-700">
      {label}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

function replaceMaterialBinding(
  bindings: MaterialBinding[],
  slot: string,
  materialAssetId: string,
  sourceNodeIndex?: number,
): MaterialBinding[] {
  const found = bindings.some(
    (binding) =>
      binding.slot === slot &&
      binding.sourceNodeIndex === sourceNodeIndex,
  );
  if (!found) {
    return [
      ...bindings,
      {
        slot,
        materialAssetId,
        ...(sourceNodeIndex === undefined ? {} : { sourceNodeIndex }),
      },
    ];
  }
  return bindings.map((binding) =>
    binding.slot === slot && binding.sourceNodeIndex === sourceNodeIndex
      ? { ...binding, materialAssetId }
      : binding,
  );
}

function draggedMaterialId(event: DragEvent<HTMLElement>): string | null {
  const value = readEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME);
  return value || null;
}

const MATERIAL_SWATCH_THUMBNAIL_CACHE = new Map<string, Promise<string>>();

function MaterialSwatch({
  material,
  projectPath,
}: {
  material?: MaterialAsset;
  projectPath?: string;
}) {
  const derivedPath =
    material?.thumbnail && material.thumbnail.status !== "missing"
      ? material.thumbnail.derivedPath
      : undefined;
  const thumbnailKey = projectPath && derivedPath
    ? `${projectPath}\n${derivedPath}`
    : undefined;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setThumbnailUrl(null);
    if (!thumbnailKey || !projectPath || !derivedPath) {
      return () => {
        active = false;
      };
    }
    const pending =
      MATERIAL_SWATCH_THUMBNAIL_CACHE.get(thumbnailKey) ??
      tauri.readImageDataUrl(projectPath, derivedPath);
    MATERIAL_SWATCH_THUMBNAIL_CACHE.set(thumbnailKey, pending);
    void pending
      .then((dataUrl) => {
        if (active) setThumbnailUrl(dataUrl);
      })
      .catch(() => {
        MATERIAL_SWATCH_THUMBNAIL_CACHE.delete(thumbnailKey);
      });
    return () => {
      active = false;
    };
  }, [derivedPath, projectPath, thumbnailKey]);

  if (!material) {
    return (
      <span
        className="relative h-7 w-7 shrink-0 overflow-hidden rounded-sm border border-slate-300 bg-slate-100"
        title="Material未設定"
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-slate-400" />
      </span>
    );
  }

  const properties = normalizeMaterialProperties(material.properties);
  const [red, green, blue, alpha] =
    properties.pbrMetallicRoughness.baseColorFactor;
  const hasBaseColorTexture = Boolean(
    properties.pbrMetallicRoughness.baseColorTexture ??
      properties.baseColorTextureId,
  );
  const color = `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;

  if (thumbnailUrl) {
    return (
      <span
        className="h-7 w-7 shrink-0 overflow-hidden rounded-sm border border-slate-300 bg-white"
        title={`${material.name}のプレビュー`}
        aria-hidden="true"
      >
        <img
          src={thumbnailUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className="relative h-7 w-7 shrink-0 overflow-hidden rounded-sm border border-slate-300"
      title={`${material.name}・${properties.color}`}
      aria-hidden="true"
      style={{
        backgroundImage:
          "conic-gradient(#e2e8f0 25%, #ffffff 0 50%, #e2e8f0 0 75%, #ffffff 0)",
        backgroundPosition: "0 0",
        backgroundSize: "8px 8px",
      }}
    >
      <span className="absolute inset-0" style={{ backgroundColor: color }} />
      {hasBaseColorTexture ? (
        <span className="absolute bottom-0 right-0 grid h-3.5 w-3.5 place-items-center rounded-tl bg-slate-950/70 text-white">
          <EDITOR_ICONS.texture size={9} />
        </span>
      ) : null}
    </span>
  );
}

function MeshInspector({
  component,
  assets,
  projectPath,
  readOnly,
  onChange,
  onOpenMaterial,
  onTerrainBrush,
  onGrassLayersChange,
  onTerrainSettings,
  onTerrainEditingChange,
  terrainSceneEditing,
  onApplyTerrainSurface,
  showModelPose = true,
  materialBindingSourceNodeIndex,
  onRemove,
}: {
  component: MeshComponent;
  assets: AssetManifest;
  projectPath?: string;
  readOnly: boolean;
  onChange: (patch: MeshInspectorPatch) => void;
  onOpenMaterial: (assetId: string) => void;
  onRemove?: () => void;
  onTerrainBrush?: (operation: TerrainSceneBrushOperation) => void;
  onGrassLayersChange?: (grass: TerrainGrassLayer[], notice: string) => void;
  onTerrainSettings?: (
    options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
  ) => void;
  onTerrainEditingChange?: (
    editing: Omit<TerrainViewportEditing, "entityId" | "componentId"> | null,
  ) => void;
  terrainSceneEditing?: Omit<
    TerrainViewportEditing,
    "entityId" | "componentId"
  > | null;
  onApplyTerrainSurface?: (
    entry: TerrainSurfaceCatalogEntry,
    values: Record<string, number | string>,
  ) => void;
  showModelPose?: boolean;
  materialBindingSourceNodeIndex?: number;
}) {
  const geometryAssetId =
    component.geometry?.kind === "asset"
      ? component.geometry.assetId
      : component.geometryAssetId;
  const geometry = getGeometryAsset(assets, geometryAssetId);
  const terrain =
    component.geometry?.kind === "terrain"
      ? component.geometry.terrain
      : undefined;
  const builtinDefinition =
    component.geometry?.kind === "builtin-primitive"
      ? getBuiltinPrimitiveCreation(component.geometry.creationId)
      : getBuiltinPrimitiveCreation(component.geometryAssetId);
  const materials = Object.values(assets.assets).filter(
    (asset) => asset.kind === "material",
  );
  const definedSlots = getMeshMaterialSlots(component, assets);
  const slots: MaterialSlotDefinition[] =
    definedSlots.length > 0
      ? definedSlots
      : component.materialBindings.map((binding) => ({
          slot: binding.slot,
          name: binding.slot,
        }));
  const model = geometry?.kind === "model" ? geometry : undefined;
  const openBrush = model?.importMetadata?.openBrush;
  const bones = model?.importMetadata?.bones ?? [];
  const morphTargets = model?.importMetadata?.morphTargets ?? [];
  const [selectedBoneKey, setSelectedBoneKey] = useState(bones[0]?.key ?? "");
  useEffect(() => {
    if (bones.some((bone) => bone.key === selectedBoneKey)) return;
    setSelectedBoneKey(bones[0]?.key ?? "");
  }, [bones, selectedBoneKey]);

  return (
    <div className="space-y-3">
      <ComponentCard
      title="Mesh Renderer"
      remove={
        onRemove
          ? {
              label: "Mesh Rendererを削除",
              disabled: readOnly,
              onRemove,
            }
          : undefined
      }
      enabled={{
        checked: component.enabled,
        disabled: readOnly,
        label: component.enabled
          ? "Mesh Rendererを無効にする"
          : "Mesh Rendererを有効にする",
        onChange: (enabled) => onChange({ enabled }),
      }}
    >
      <dl className="grid grid-cols-[62px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">形状</dt>
        <dd className="truncate text-right font-medium text-slate-700">
          {terrain ? "地形" : geometry?.name ?? builtinDefinition?.name ?? `Missing: ${geometryAssetId}`}
        </dd>
        <dt className="text-slate-500">スロット</dt>
        <dd className="text-right text-slate-700">{slots.length}</dd>
      </dl>

      <div className="border-t border-slate-100 pt-2">
        <h4 className="pb-1 text-[11px] font-medium text-slate-500">
          マテリアル
        </h4>
        {slots.map((slot) => {
          const binding = component.materialBindings.find(
            (candidate) =>
              candidate.slot === slot.slot &&
              candidate.sourceNodeIndex === materialBindingSourceNodeIndex,
          );
          const assignedId = binding?.materialAssetId ?? slot.defaultMaterialAssetId ?? "";
          const assigned = assignedId ? getMaterialAsset(assets, assignedId) : undefined;
          const materialStatusTitle = assigned?.shader?.kind === "openbrush"
            ? `${assigned.shader.brushName}をthree-icosa専用Materialとして設定済み。Materialをドロップして変更できます`
            : openBrush && !assigned
              ? "source brushを使用中。MaterialをドロップするとXRift Materialで上書きします"
              : openBrush
                ? "XRift MaterialでOpenBrush shaderを上書き中。Materialをドロップして変更できます"
                : "Materialをドロップして割り当てできます";
          return (
            <div
              key={slot.slot}
              title={materialStatusTitle}
              className="border-t border-slate-100 py-1.5 first:border-t-0"
              onDragOverCapture={(event) => {
                if (
                  readOnly ||
                  !hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)
                ) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDropCapture={(event) => {
                if (readOnly) return;
                if (!hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const materialAssetId = draggedMaterialId(event);
                clearEditorDragData();
                if (
                  !materialAssetId ||
                  assets.assets[materialAssetId]?.kind !== "material"
                ) return;
                onChange({
                  materialBindings: replaceMaterialBinding(
                    component.materialBindings,
                    slot.slot,
                    materialAssetId,
                    materialBindingSourceNodeIndex,
                  ),
                });
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                <span className="truncate text-xs font-medium text-slate-600" title={slot.slot}>
                  {slot.name}
                </span>
                {slot.sourceMaterialIndex !== undefined ? (
                  <span className="text-xs text-slate-400">glTF #{slot.sourceMaterialIndex}</span>
                ) : null}
              </div>
              <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5">
                <MaterialSwatch material={assigned} projectPath={projectPath} />
                <select
                  value={assignedId}
                  disabled={readOnly || materials.length === 0}
                  onChange={(event) =>
                    onChange({
                      materialBindings: replaceMaterialBinding(
                        component.materialBindings,
                        slot.slot,
                        event.currentTarget.value,
                        materialBindingSourceNodeIndex,
                      ),
                    })
                  }
                  aria-label={`${slot.name}のMaterial`}
                  title={`${slot.name}のMaterialを選択`}
                  className="h-7 min-w-0 rounded-sm border border-slate-300 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {openBrush ? "OpenBrush Brush Shader" : "未設定"}
                  </option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>{material.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!assigned}
                  onClick={() => assigned && onOpenMaterial(assigned.id)}
                  aria-label="割り当て中のMaterialをInspectorで開く"
                  title={commandTitle("マテリアルをインスペクターで開く", "EditAssignedMaterial")}
                  className="flex h-7 items-center justify-center rounded-sm text-slate-500 hover:bg-violet-100 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <EDITOR_ICONS.asset size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
        {slots.length === 0 ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-4 text-amber-800">
            形状にマテリアルスロット情報がありません。インポート解析を確認してください。
          </p>
        ) : null}
      </div>

      {model && showModelPose ? (
        <ModelPoseEditor
          pose={component.modelPose}
          bones={bones}
          morphTargets={morphTargets}
          selectedBoneKey={selectedBoneKey}
          readOnly={readOnly}
          onSelectedBoneChange={setSelectedBoneKey}
          onChange={(modelPose) => onChange({ modelPose })}
        />
      ) : null}

      <div className="space-y-2 border-t border-slate-100 pt-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`mesh-max-distance-${component.id}`}
              className="text-xs font-medium text-slate-600"
              title="このMeshをカメラから何メートルまで描画するか。未設定ならScene CameraのFarを使用します。"
            >
              描画距離 (Far Clip)
            </label>
            {component.maxDistance !== undefined ? (
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChange({ maxDistance: null })}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-45"
                title="Mesh固有の描画距離を解除してScene CameraのFarへ戻す"
              >
                Scene Farへ戻す
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`mesh-max-distance-${component.id}`}
              type="number"
              min={0.1}
              max={1_000_000}
              step={1}
              value={component.maxDistance ?? ""}
              placeholder="Scene Farを使用"
              disabled={readOnly}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                onChange({
                  maxDistance: raw === "" ? null : Number(raw),
                });
              }}
              className="h-7 min-w-0 flex-1 rounded-sm border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
            <span className="text-[11px] text-slate-400">m</span>
          </div>
          <p className="text-[11px] leading-4 text-slate-500">
            葉や遠景モデルの負荷を抑える任意設定です。Editor / Play / 公開先で同じ距離判定を使います。
          </p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`mesh-render-order-${component.id}`}
              className="text-xs font-medium text-slate-600"
              title="半透明の描画順を手で決めます。大きいほど後に描かれ、手前に出ます。0はレンダラー任せです。"
            >
              描画順 (Render Order)
            </label>
            {component.renderOrder !== undefined ? (
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChange({ renderOrder: null })}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-45"
                title="描画順の指定を解除してレンダラー任せへ戻す"
              >
                自動へ戻す
              </button>
            ) : null}
          </div>
          <input
            id={`mesh-render-order-${component.id}`}
            type="number"
            min={-1000}
            max={1000}
            step={1}
            value={component.renderOrder ?? ""}
            placeholder="自動 (0)"
            disabled={readOnly}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              onChange({
                renderOrder: raw === "" ? null : Number(raw),
              });
            }}
            className="h-7 w-full min-w-0 rounded-sm border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
          <p className="text-[11px] leading-4 text-slate-500">
            半透明どうしはカメラからの距離で並ぶため、ガラスに貼ったデカールやランプの中の発光体のように重なる面では順序が定まりません。そこだけ手で決めます。
          </p>
        </div>
        <ToggleRow
          label="Cast Shadows"
          checked={component.castShadow}
          disabled={readOnly}
          onChange={(castShadow) => onChange({ castShadow })}
        />
        <ToggleRow
          label="Receive Shadows"
          checked={component.receiveShadow}
          disabled={readOnly}
          onChange={(receiveShadow) => onChange({ receiveShadow })}
        />
      </div>
      </ComponentCard>
      {terrain ? (
        <TerrainInspector
          terrain={terrain}
          readOnly={readOnly}
          onBrush={onTerrainBrush}
          onGrassLayersChange={onGrassLayersChange}
          onSettings={onTerrainSettings}
          onSceneEditingChange={onTerrainEditingChange}
          sceneEditing={terrainSceneEditing}
          onApplySurface={onApplyTerrainSurface}
        />
      ) : null}
    </div>
  );
}

/**
 * Terrain authoring, arranged the way Unity arranges it: a toolbar of modes
 * across the top, and only the selected mode's settings below. A dropdown of
 * operations could not show which one was live, and stacking every setting at
 * once made the panel unreadable about what it was currently editing.
 */
type TerrainEditorMode = "sculpt" | "hole" | "grass" | "surface" | "settings";

const TERRAIN_MODE_TABS: ReadonlyArray<{
  mode: TerrainEditorMode;
  label: string;
  title: string;
  Icon: (props: { className?: string }) => ReactElement;
}> = [
  {
    mode: "sculpt",
    label: "形",
    title: "地形の高さを編集する",
    Icon: TerrainRaiseIcon,
  },
  {
    mode: "hole",
    label: "穴",
    title: "地形に穴を開ける・埋める",
    Icon: TerrainHoleAddIcon,
  },
  {
    mode: "grass",
    label: "草",
    title: "草のレイヤーを編集する",
    Icon: TerrainGrassIcon,
  },
  {
    mode: "surface",
    label: "表面",
    title: "高さと傾斜でマテリアルを混ぜる",
    Icon: TerrainSurfaceIcon,
  },
  {
    mode: "settings",
    label: "設定",
    title: "大きさと解像度を変更する",
    Icon: TerrainSettingsIcon,
  },
];

const TERRAIN_SCULPT_BRUSHES: ReadonlyArray<{
  kind: TerrainViewportBrushKind;
  label: string;
  title: string;
  Icon: (props: { className?: string }) => ReactElement;
}> = [
  {
    kind: "raise",
    label: "盛る",
    title: "ブラシの下を盛り上げる",
    Icon: TerrainRaiseIcon,
  },
  {
    kind: "lower",
    label: "掘る",
    title: "ブラシの下を掘り下げる",
    Icon: TerrainLowerIcon,
  },
  {
    kind: "flatten",
    label: "高さを揃える",
    title: "目標の高さへ揃える",
    Icon: TerrainFlattenIcon,
  },
  {
    kind: "smooth",
    label: "ならす",
    title: "凹凸をなだらかにする",
    Icon: TerrainSmoothIcon,
  },
  {
    kind: "stamp",
    label: "スタンプ",
    title: "円形の起伏を押し当てる",
    Icon: TerrainStampIcon,
  },
];

const TERRAIN_HOLE_BRUSHES: ReadonlyArray<{
  kind: TerrainViewportBrushKind;
  label: string;
  title: string;
  Icon: (props: { className?: string }) => ReactElement;
}> = [
  {
    kind: "hole-add",
    label: "開ける",
    title: "セルを抜いて穴にする",
    Icon: TerrainHoleAddIcon,
  },
  {
    kind: "hole-remove",
    label: "埋める",
    title: "抜いたセルを戻す",
    Icon: TerrainHoleRemoveIcon,
  },
];

const TERRAIN_GRASS_BRUSHES: ReadonlyArray<{
  kind: TerrainViewportBrushKind;
  label: string;
  title: string;
  Icon: (props: { className?: string }) => ReactElement;
}> = [
  {
    kind: "grass-paint",
    label: "生やす",
    title: "選択中のレイヤーへ草を塗り足す",
    Icon: TerrainGrassPaintIcon,
  },
  {
    kind: "grass-erase",
    label: "消す",
    title: "選択中のレイヤーの草を消す",
    Icon: TerrainGrassEraseIcon,
  },
];

function TerrainToolButton({
  active,
  disabled,
  label,
  title,
  Icon,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  title: string;
  Icon: (props: { className?: string }) => ReactElement;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded border px-1 py-1.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-violet-500 bg-violet-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="leading-none">{label}</span>
    </button>
  );
}

function TerrainInspector({
  terrain,
  readOnly,
  onBrush,
  onGrassLayersChange,
  onSettings,
  onSceneEditingChange,
  sceneEditing: armedBrush,
  onApplySurface,
}: {
  terrain: TerrainGeometry;
  readOnly: boolean;
  onBrush?: (operation: TerrainSceneBrushOperation) => void;
  onGrassLayersChange?: (grass: TerrainGrassLayer[], notice: string) => void;
  onSettings?: (
    options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
  ) => void;
  onSceneEditingChange?: (
    editing: Omit<TerrainViewportEditing, "entityId" | "componentId"> | null,
  ) => void;
  /** What the Scene View currently has armed, so shortcuts reach the panel. */
  sceneEditing?: Omit<TerrainViewportEditing, "entityId" | "componentId"> | null;
  onApplySurface?: (
    entry: TerrainSurfaceCatalogEntry,
    values: Record<string, number | string>,
  ) => void;
}) {
  const [mode, setMode] = useState<TerrainEditorMode>("sculpt");
  const [sculptKind, setSculptKind] = useState<TerrainViewportBrushKind>("raise");
  const [holeKind, setHoleKind] = useState<TerrainViewportBrushKind>("hole-add");
  const [grassKind, setGrassKind] = useState<TerrainViewportBrushKind>("grass-paint");
  const [grassLayerId, setGrassLayerId] = useState<string | null>(null);
  const [addGrassTypeId, setAddGrassTypeId] = useState<string>(
    TERRAIN_GRASS_TYPES[0]?.id ?? "short-grass",
  );
  const [grassPresetChoice, setGrassPresetChoice] = useState(
    TERRAIN_GRASS_PRESETS[0]?.id ?? "",
  );
  const [centerX, setCenterX] = useState(0);
  const [centerZ, setCenterZ] = useState(0);
  const [radius, setRadius] = useState(2);
  const [strength, setStrength] = useState(0.8);
  const [targetHeight, setTargetHeight] = useState(0);
  const [falloff, setFalloff] = useState(0.5);
  const [width, setWidth] = useState(terrain.width);
  const [depth, setDepth] = useState(terrain.depth);
  const [resolution, setResolution] = useState(terrain.resolution);

  const range = terrainHeightRange(terrain);
  const maximumRadius = Math.max(terrain.width, terrain.depth);
  const grassLayers = terrain.grass ?? [];
  const activeGrassLayer =
    grassLayers.find((layer) => layer.id === grassLayerId) ?? grassLayers[0];
  const kind =
    mode === "grass" ? grassKind : mode === "hole" ? holeKind : sculptKind;
  const grassTool = mode === "grass";
  const holeTool = mode === "hole";
  const heightTargetRequired =
    mode === "sculpt" && (sculptKind === "flatten" || sculptKind === "stamp");
  const paintable = mode !== "settings" && mode !== "surface";
  // Derived, never stored: two sources of truth for "is a brush armed" let the
  // panel show one tool while the Scene View held another, so a click meant to
  // paint grass carved the ground instead.
  const sceneEditing = Boolean(armedBrush);
  const disabled =
    readOnly || !onBrush || !paintable || (grassTool && !activeGrassLayer);

  // Radius, target height and brush kind can all change from the Scene View
  // (bracket keys, Alt-pick). Mirroring them keeps the panel from showing a
  // stale brush while the ground is being edited with a different one.
  useEffect(() => {
    if (!armedBrush) return;
    setRadius(armedBrush.radius);
    if (armedBrush.targetHeight !== undefined) {
      setTargetHeight(armedBrush.targetHeight);
    }
    if (armedBrush.kind === "grass-paint" || armedBrush.kind === "grass-erase") {
      setMode("grass");
      setGrassKind(armedBrush.kind);
      if (armedBrush.grassLayerId) setGrassLayerId(armedBrush.grassLayerId);
    } else if (
      armedBrush.kind === "hole-add" ||
      armedBrush.kind === "hole-remove"
    ) {
      setMode("hole");
      setHoleKind(armedBrush.kind);
    } else {
      setMode("sculpt");
      setSculptKind(armedBrush.kind);
    }
  }, [armedBrush]);

  useEffect(() => {
    if (sceneEditing) return;
    setWidth(terrain.width);
    setDepth(terrain.depth);
    setResolution(terrain.resolution);
  }, [sceneEditing, terrain.depth, terrain.resolution, terrain.width]);

  const buildBrushFor = (
    nextKind: TerrainViewportBrushKind,
    layerId = activeGrassLayer?.id,
  ): Omit<TerrainViewportEditing, "entityId" | "componentId"> =>
    nextKind === "grass-paint" || nextKind === "grass-erase"
      ? {
          kind: nextKind,
          radius,
          strength: Math.min(strength, 1),
          grassLayerId: layerId,
        }
      : {
          kind: nextKind,
          radius,
          strength:
            nextKind === "hole-add" || nextKind === "hole-remove" ? 1 : strength,
          falloff,
          ...(nextKind === "flatten" || nextKind === "stamp"
            ? { targetHeight }
            : {}),
        };

  const buildBrush = () => buildBrushFor(kind);

  const updateSceneBrush = (
    patch: Partial<Omit<TerrainViewportEditing, "entityId" | "componentId">>,
  ) => {
    if (!sceneEditing || !onSceneEditingChange) return;
    onSceneEditingChange({ ...buildBrush(), ...patch });
  };

  /**
   * Arms the Scene View with a tool, and switches the panel to its mode.
   *
   * Both halves have to happen together. Changing only the panel leaves the
   * previous tool armed, which is how choosing "paint grass" could still carve
   * the ground on the next drag.
   */
  const armTool = (
    nextMode: TerrainEditorMode,
    nextKind: TerrainViewportBrushKind,
    layerId = activeGrassLayer?.id,
  ) => {
    setMode(nextMode);
    if (nextKind === "grass-paint" || nextKind === "grass-erase") {
      setGrassKind(nextKind);
      if (layerId) setGrassLayerId(layerId);
    } else if (nextKind === "hole-add" || nextKind === "hole-remove") {
      setHoleKind(nextKind);
    } else {
      setSculptKind(nextKind);
    }
    onSceneEditingChange?.(buildBrushFor(nextKind, layerId));
  };

  /** Selecting a brush arms the Scene View with it, so the tool is the gesture. */
  const selectBrush = (nextKind: TerrainViewportBrushKind) => {
    armTool(mode, nextKind);
  };

  const selectMode = (nextMode: TerrainEditorMode) => {
    if (nextMode === "settings" || nextMode === "surface") {
      setMode(nextMode);
      // Neither mode holds a gesture, so leaving the Scene View armed would let
      // a stray click edit the ground with a brush that is no longer shown.
      onSceneEditingChange?.(null);
      return;
    }
    // Grass with no layer has nothing to paint into, and arming anyway would
    // put the Scene View in a state where every stroke is silently dropped.
    if (nextMode === "grass" && !activeGrassLayer) {
      setMode(nextMode);
      onSceneEditingChange?.(null);
      return;
    }
    armTool(
      nextMode,
      nextMode === "grass"
        ? grassKind
        : nextMode === "hole"
          ? holeKind
          : sculptKind,
    );
  };

  const applySettings = () => {
    onSettings?.({ width, depth, resolution });
  };

  const modeBrushes =
    mode === "grass"
      ? TERRAIN_GRASS_BRUSHES
      : mode === "hole"
        ? TERRAIN_HOLE_BRUSHES
        : TERRAIN_SCULPT_BRUSHES;

  return (
    <ComponentCard title="地形" subtitle="高さマップ・固定コライダー">
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">大きさ</dt>
        <dd className="text-right font-medium text-slate-700">
          {terrain.width} × {terrain.depth} m
        </dd>
        <dt className="text-slate-500">解像度</dt>
        <dd className="text-right font-medium text-slate-700">
          {terrain.resolution} × {terrain.resolution}
        </dd>
        <dt className="text-slate-500">高さの範囲</dt>
        <dd className="text-right font-medium text-slate-700">
          {range.min.toFixed(2)} – {range.max.toFixed(2)} m
        </dd>
      </dl>

      <div
        className="flex gap-1 border-t border-slate-100 pt-2"
        role="group"
        aria-label="地形の編集モード"
      >
        {TERRAIN_MODE_TABS.map((tab) => (
          <TerrainToolButton
            key={tab.mode}
            active={mode === tab.mode}
            disabled={readOnly}
            label={tab.label}
            title={tab.title}
            Icon={tab.Icon}
            onClick={() => selectMode(tab.mode)}
          />
        ))}
      </div>

      {mode === "surface" ? (
        <TerrainSurfaceSection
          terrain={terrain}
          readOnly={readOnly}
          onApplySurface={onApplySurface}
        />
      ) : mode === "settings" ? (
        <section className="space-y-2" aria-label="地形設定">
          <TerrainNumberField
            label="幅"
            value={width}
            min={0.5}
            max={512}
            step={0.5}
            disabled={readOnly || !onSettings}
            onChange={setWidth}
          />
          <TerrainNumberField
            label="奥行き"
            value={depth}
            min={0.5}
            max={512}
            step={0.5}
            disabled={readOnly || !onSettings}
            onChange={setDepth}
          />
          <TerrainNumberField
            label="Heightmap 解像度"
            value={resolution}
            min={9}
            max={257}
            step={1}
            disabled={readOnly || !onSettings}
            onChange={(value) =>
              setResolution(Math.max(9, Math.min(257, Math.round(value))))
            }
          />
          <button
            type="button"
            disabled={
              readOnly ||
              !onSettings ||
              (width === terrain.width &&
                depth === terrain.depth &&
                resolution === terrain.resolution)
            }
            onClick={applySettings}
            className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            サイズ・解像度を適用
          </button>
          <p className="text-[11px] leading-4 text-slate-500">
            解像度を変えても高さは補間、穴はセル単位で保持します。
          </p>
        </section>
      ) : (
        <section className="space-y-2" aria-label="地形ブラシ">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-700">
              {mode === "grass" ? "草ブラシ" : mode === "hole" ? "穴ブラシ" : "筆"}
            </h4>
            <button
              type="button"
              disabled={disabled || !onSceneEditingChange}
              aria-pressed={sceneEditing}
              onClick={() =>
                sceneEditing ? onSceneEditingChange?.(null) : armTool(mode, kind)
              }
              className={`rounded px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
                sceneEditing
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              {sceneEditing ? "Scene編集を終了" : "Sceneで編集"}
            </button>
          </div>

          <div className="flex gap-1" role="group" aria-label="ブラシの種類">
            {modeBrushes.map((brush) => (
              <TerrainToolButton
                key={brush.kind}
                active={kind === brush.kind}
                disabled={disabled}
                label={brush.label}
                title={brush.title}
                Icon={brush.Icon}
                onClick={() => selectBrush(brush.kind)}
              />
            ))}
          </div>

          {mode === "grass" && grassLayers.length === 0 ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
              草のレイヤーがありません。下の一覧から追加するか、セットを適用すると塗れます。
            </p>
          ) : mode === "grass" &&
            grassKind === "grass-paint" &&
            !activeGrassLayer?.mask ? (
            // Coverage starts full, so "生やす" has nothing to add until part of
            // the layer has been erased. Without saying so, the first stroke an
            // author tries looks like a broken brush.
            <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-4 text-slate-600">
              このレイヤーはまだ全面に生えています。「生やす」は消した所を戻す筆なので、先に「消す」で間引いてください。
            </p>
          ) : null}

          <TerrainNumberField
            label="半径"
            value={radius}
            min={0.1}
            max={maximumRadius}
            step={0.1}
            disabled={disabled}
            onChange={(value) => {
              setRadius(value);
              updateSceneBrush({ radius: value });
            }}
          />
          <TerrainNumberField
            label={
              grassTool
                ? "濃さ"
                : sculptKind === "smooth" || heightTargetRequired
                  ? "なじませる量"
                  : "強さ"
            }
            value={strength}
            min={0.01}
            max={
              grassTool || sculptKind === "smooth" || heightTargetRequired ? 1 : 16
            }
            step={0.05}
            disabled={disabled || holeTool}
            onChange={(value) => {
              setStrength(value);
              updateSceneBrush({ strength: value });
            }}
          />
          {heightTargetRequired ? (
            <TerrainNumberField
              label="目標の高さ"
              value={targetHeight}
              min={-256}
              max={256}
              step={0.1}
              disabled={disabled}
              onChange={(value) => {
                setTargetHeight(value);
                updateSceneBrush({ targetHeight: value });
              }}
            />
          ) : null}
          {grassTool ? null : (
            <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
              ブラシの柔らかさ
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={falloff}
                disabled={disabled}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setFalloff(value);
                  updateSceneBrush({ falloff: value });
                }}
                className="h-2 w-full cursor-ew-resize accent-violet-600 disabled:cursor-not-allowed"
              />
            </label>
          )}

          <details className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
              数値の位置へ1回適用
            </summary>
            <div className="space-y-2 pt-2">
              <TerrainNumberField
                label="中心 X"
                value={centerX}
                min={-terrain.width / 2}
                max={terrain.width / 2}
                step={0.25}
                disabled={disabled}
                onChange={setCenterX}
              />
              <TerrainNumberField
                label="中心 Z"
                value={centerZ}
                min={-terrain.depth / 2}
                max={terrain.depth / 2}
                step={0.25}
                disabled={disabled}
                onChange={setCenterZ}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onBrush?.({
                    ...buildBrush(),
                    center: [centerX, centerZ],
                  } as TerrainSceneBrushOperation)
                }
                className="w-full rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                この位置へ適用
              </button>
            </div>
          </details>

          <p className="text-[11px] leading-4 text-slate-500">
            {sceneEditing
              ? "Scene上を左ドラッグして編集します。1ストロークは1件のUndoです。Escで取り消せます。"
              : "「Sceneで編集」を押すと、Scene上を直接ドラッグして編集できます。"}
          </p>
        </section>
      )}

      {mode === "grass" ? (
        <TerrainGrassLayerList
          terrain={terrain}
          grassLayers={grassLayers}
          activeLayerId={activeGrassLayer?.id ?? null}
          readOnly={readOnly}
          addGrassTypeId={addGrassTypeId}
          grassPresetChoice={grassPresetChoice}
          onSelectLayer={(id) => {
            // Picking a layer while a grass brush is armed must retarget it,
            // not leave the stroke landing on the previous layer.
            if (sceneEditing && grassTool) armTool("grass", grassKind, id);
            else setGrassLayerId(id);
          }}
          onAddGrassTypeChange={setAddGrassTypeId}
          onGrassPresetChange={setGrassPresetChoice}
          onGrassLayersChange={onGrassLayersChange}
        />
      ) : null}
    </ComponentCard>
  );
}


/**
 * The surface mode.
 *
 * Ground painted one flat colour reads as a shape rather than as terrain. The
 * presets blend by height and slope — both already known from the geometry —
 * so a usable result needs no hand painting. Their band edges are metres, so
 * they are refitted to this Terrain's own elevation range before applying;
 * a preset tuned for an 18m mountain would otherwise come out as one colour on
 * a 2m field, which reads as a broken shader rather than a mistuned one.
 */
function TerrainSurfaceSection({
  terrain,
  readOnly,
  onApplySurface,
}: {
  terrain: TerrainGeometry;
  readOnly: boolean;
  onApplySurface?: (
    entry: TerrainSurfaceCatalogEntry,
    values: Record<string, number | string>,
  ) => void;
}) {
  const [presetId, setPresetId] = useState(
    TERRAIN_SURFACE_CATALOG[0]?.id ?? "",
  );
  const preset = getTerrainSurfacePreset(presetId);
  const range = terrainHeightRange(terrain);
  const editable = !readOnly && Boolean(onApplySurface);
  const fitted = useMemo(
    () => (preset ? fitTerrainSurfaceToRange(preset, range) : null),
    [preset, range.max, range.min],
  );

  return (
    <section className="space-y-2" aria-label="地形の表面">
      <p className="text-[11px] leading-4 text-slate-500">
        高さと傾斜でマテリアルを混ぜます。急斜面には岩、高い所には別の色が自動で出るので、塗らなくても地形らしくなります。
      </p>

      <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs text-slate-700">
        <select
          value={presetId}
          disabled={!editable}
          onChange={(event) => setPresetId(event.currentTarget.value)}
          aria-label="表面のプリセット"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          {TERRAIN_SURFACE_CATALOG.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!editable || !preset || !fitted}
          onClick={() => {
            if (!preset || !fitted) return;
            onApplySurface?.(preset, fitted);
          }}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          この地形へ適用
        </button>
      </label>

      {preset ? (
        <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-[11px] leading-4 text-slate-600">
            {preset.description}
          </p>
          <div className="flex items-center gap-1">
            {(["uLowColor", "uMidColor", "uHighColor", "uSlopeColor"] as const).map(
              (uniform) => {
                const value = preset.shader.uniforms[uniform];
                if (value?.kind !== "color") return null;
                return (
                  <span
                    key={uniform}
                    className="h-4 flex-1 rounded-sm border border-slate-300"
                    style={{ background: value.value }}
                    title={
                      preset.parameters.find((p) => p.uniform === uniform)?.label ??
                      uniform
                    }
                  />
                );
              },
            )}
          </div>
          {fitted ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-[11px] text-slate-600">
              <dt>この地形の高さ</dt>
              <dd className="text-right font-mono">
                {range.min.toFixed(1)} – {range.max.toFixed(1)} m
              </dd>
              <dt>低い所の境界</dt>
              <dd className="text-right font-mono">
                {Number(fitted.uLowHeight).toFixed(1)} m
              </dd>
              <dt>高い所の境界</dt>
              <dd className="text-right font-mono">
                {Number(fitted.uHighHeight).toFixed(1)} m
              </dd>
            </dl>
          ) : null}
          <p className="text-[10px] leading-4 text-slate-500">
            境界はこの地形の高さに合わせて調整されます。適用後はMaterialとしてInspectorから細かく調整できます。
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The grass layer stack.
 *
 * Layers are a list you build up, with exactly one selected — painting always
 * lands on the selection rather than asking which layer each time.
 */
function TerrainGrassLayerList({
  terrain,
  grassLayers,
  activeLayerId,
  readOnly,
  addGrassTypeId,
  grassPresetChoice,
  onSelectLayer,
  onAddGrassTypeChange,
  onGrassPresetChange,
  onGrassLayersChange,
}: {
  terrain: TerrainGeometry;
  grassLayers: readonly TerrainGrassLayer[];
  activeLayerId: string | null;
  readOnly: boolean;
  addGrassTypeId: string;
  grassPresetChoice: string;
  onSelectLayer: (id: string) => void;
  onAddGrassTypeChange: (id: string) => void;
  onGrassPresetChange: (id: string) => void;
  onGrassLayersChange?: (grass: TerrainGrassLayer[], notice: string) => void;
}) {
  const [countsOpen, setCountsOpen] = useState(false);
  const editable = !readOnly && Boolean(onGrassLayersChange);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= grassLayers.length) return;
    const next = [...grassLayers];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onGrassLayersChange?.(next, "草のレイヤーを並べ替えました");
  };

  return (
    <section className="space-y-2 border-t border-slate-100 pt-2" aria-label="草のレイヤー">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-700">草のレイヤー</h4>
        <span className="text-[10px] font-semibold text-slate-400">
          {grassLayers.length}層
        </span>
      </div>

      {grassLayers.length === 0 ? (
        <p className="text-[11px] leading-4 text-slate-500">
          レイヤーを追加すると草が生えます。密度・高さ帯・傾斜のルールが配置を決め、ブラシで部分的に足し引きできます。
        </p>
      ) : (
        <ul className="space-y-1">
          {grassLayers.map((layer, index) => {
            const active = layer.id === activeLayerId;
            const type = getTerrainGrassType(layer.typeId);
            const appearance = type
              ? resolveTerrainGrassAppearance(type, layer.appearance)
              : undefined;
            const tuned = layer.appearance !== undefined;
            return (
              <li key={layer.id}>
                <div
                  className={`rounded border p-2 ${
                    active
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectLayer(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title="このレイヤーを塗りの対象にする"
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-sm border border-slate-300"
                        style={{
                          background: `linear-gradient(to top, ${
                            appearance?.baseColor ?? "#4d7c0f"
                          }, ${appearance?.tipColor ?? "#a3e635"})`,
                        }}
                      />
                      <span
                        className={`truncate text-[11px] font-semibold ${
                          active ? "text-violet-800" : "text-slate-700"
                        }`}
                      >
                        {type?.label ?? layer.typeId}
                      </span>
                      {tuned ? (
                        <span className="shrink-0 rounded border border-slate-300 px-1 py-0.5 text-[9px] font-semibold text-slate-500">
                          調整済み
                        </span>
                      ) : null}
                      {active ? (
                        <span className="shrink-0 rounded bg-violet-600 px-1 py-0.5 text-[9px] font-semibold text-white">
                          編集中
                        </span>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={!editable || index === 0}
                        onClick={() => move(index, -1)}
                        title="上へ移動"
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={!editable || index === grassLayers.length - 1}
                        onClick={() => move(index, 1)}
                        title="下へ移動"
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() =>
                          onGrassLayersChange?.(
                            grassLayers.filter((entry) => entry.id !== layer.id),
                            "草のレイヤーを削除しました",
                          )
                        }
                        title="このレイヤーを削除"
                        className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <TerrainNumberField
                    label="密度 (本/m2)"
                    value={layer.density}
                    min={0}
                    max={40}
                    step={0.2}
                    disabled={!editable}
                    onChange={(density) =>
                      onGrassLayersChange?.(
                        grassLayers.map((entry) =>
                          entry.id === layer.id ? { ...entry, density } : entry,
                        ),
                        "草の密度を変更しました",
                      )
                    }
                  />
                  <TerrainNumberField
                    label="傾斜の上限 (度)"
                    value={layer.slopeLimitDegrees}
                    min={0}
                    max={90}
                    step={1}
                    disabled={!editable}
                    onChange={(slopeLimitDegrees) =>
                      onGrassLayersChange?.(
                        grassLayers.map((entry) =>
                          entry.id === layer.id
                            ? { ...entry, slopeLimitDegrees }
                            : entry,
                        ),
                        "草の傾斜上限を変更しました",
                      )
                    }
                  />
                  {active && type ? (
                    <TerrainGrassAppearanceFields
                      type={type}
                      layer={layer}
                      disabled={!editable}
                      onChange={(appearanceChange, notice) =>
                        onGrassLayersChange?.(
                          grassLayers.map((entry) =>
                            entry.id === layer.id
                              ? applyTerrainGrassAppearance(entry, appearanceChange)
                              : entry,
                          ),
                          notice,
                        )
                      }
                    />
                  ) : null}
                  {layer.mask ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] text-slate-500">
                        ブラシで調整済み
                      </span>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() =>
                          onGrassLayersChange?.(
                            grassLayers.map((entry) =>
                              entry.id === layer.id
                                ? (({ mask: _dropped, ...rest }) => rest)(entry)
                                : entry,
                            ),
                            "ブラシの調整を戻しました",
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        塗りを戻す
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <select
          value={addGrassTypeId}
          disabled={!editable}
          onChange={(event) => onAddGrassTypeChange(event.currentTarget.value)}
          aria-label="追加する草の種類"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          {TERRAIN_GRASS_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            const typeId = TERRAIN_GRASS_TYPES.find(
              (type) => type.id === addGrassTypeId,
            )?.id;
            if (!typeId) return;
            onGrassLayersChange?.(
              [
                ...grassLayers,
                {
                  id: `grass-layer-${Math.random().toString(36).slice(2, 10)}`,
                  typeId,
                  density: 4,
                  heightRange: [-1000, 1000],
                  slopeLimitDegrees: 40,
                  seed: Math.floor(Math.random() * 2_147_483_647),
                },
              ],
              "草のレイヤーを追加しました",
            );
          }}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          レイヤーを追加
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <select
          value={grassPresetChoice}
          disabled={!editable}
          onChange={(event) => onGrassPresetChange(event.currentTarget.value)}
          aria-label="適用する草のセット"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          {TERRAIN_GRASS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            const preset = TERRAIN_GRASS_PRESETS.find(
              (entry) => entry.id === grassPresetChoice,
            );
            if (!preset) return;
            onGrassLayersChange?.(
              createTerrainGrassLayers(preset),
              `草のセット「${preset.label}」を適用しました`,
            );
          }}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          セットを適用
        </button>
      </div>

      {grassLayers.length > 0 ? (
        <button
          type="button"
          aria-expanded={countsOpen}
          onClick={() => setCountsOpen((open) => !open)}
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          {countsOpen ? "本数を隠す" : "本数を確認"}
        </button>
      ) : null}
      {countsOpen && grassLayers.length > 0 ? (
        <TerrainGrassCounts terrain={terrain} />
      ) : null}
    </section>
  );
}

/**
 * Blade counts per layer, mounted only while open: placement runs the full
 * generator, and recomputing it on every sculpt stroke would drag the brush.
 */
function TerrainGrassCounts({ terrain }: { terrain: TerrainGeometry }) {
  const counts = useMemo(
    () =>
      (terrain.grass ?? []).map((layer) => ({
        id: layer.id,
        label: getTerrainGrassType(layer.typeId)?.label ?? layer.typeId,
        placement: generateTerrainGrassInstances(terrain, layer),
      })),
    [terrain],
  );
  const clamped = counts.some((entry) => entry.placement.clampedByLimit);
  return (
    <div className="space-y-1">
      <ul className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        {counts.map((entry) => (
          <li key={entry.id} className="flex justify-between gap-2">
            <span>{entry.label}</span>
            <span className="font-mono text-slate-500">
              {entry.placement.placed.toLocaleString()}本
              {entry.placement.clampedByLimit
                ? `（上限で丸め・要求${entry.placement.requested.toLocaleString()}）`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      {/* A layer that hit the cap is thinner than its density says, and that
          reads on the ground as bare patches rather than as a limit. Naming
          the two ways out beats leaving the author to raise the density that
          is already being ignored. */}
      {clamped ? (
        <p className="text-[10px] leading-4 text-slate-500">
          上限（1層{TERRAIN_GRASS_MAX_INSTANCES.toLocaleString()}本）に達した層は、密度どおりには生えず地面が透けます。密度を下げるか、Terrainを分けて層ごとの面積を小さくしてください。
        </p>
      ) : null}
    </div>
  );
}

/**
 * A layer's own colour and size.
 *
 * The type is a starting point, not a verdict: an author who wants a paler
 * meadow or a lower one should not have to leave the layer they are painting
 * to get it. Only the selected layer shows these, so the stack stays a list
 * you can read while the controls sit where the work is.
 *
 * Every field starts at the type's value and writes an override only once it
 * is moved, so an untouched layer keeps following the catalog and「種類の既定
 * に戻す」puts it back there in one step.
 */
function TerrainGrassAppearanceFields({
  type,
  layer,
  disabled,
  onChange,
}: {
  type: TerrainGrassType;
  layer: TerrainGrassLayer;
  disabled: boolean;
  onChange: (appearance: TerrainGrassAppearance, notice: string) => void;
}) {
  const resolved = resolveTerrainGrassAppearance(type, layer.appearance);
  const tuned = layer.appearance !== undefined;
  return (
    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-slate-500">見た目</span>
        <button
          type="button"
          disabled={disabled || !tuned}
          onClick={() => onChange({}, "草の見た目を種類の既定に戻しました")}
          title="この層の色と大きさを種類の既定に戻す"
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          種類の既定に戻す
        </button>
      </div>
      <TerrainGrassColorField
        label="根元の色"
        value={resolved.baseColor}
        disabled={disabled}
        onChange={(baseColor) => onChange({ baseColor }, "草の根元の色を変更しました")}
      />
      <TerrainGrassColorField
        label="穂先の色"
        value={resolved.tipColor}
        disabled={disabled}
        onChange={(tipColor) => onChange({ tipColor }, "草の穂先の色を変更しました")}
      />
      <TerrainNumberField
        label="色のばらつき"
        value={round2(resolved.colorVariation)}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
        onChange={(colorVariation) =>
          onChange({ colorVariation }, "草の色のばらつきを変更しました")
        }
      />
      <TerrainNumberField
        label="高さ (倍)"
        value={round2(resolved.height / type.height)}
        min={0.2}
        max={4}
        step={0.05}
        disabled={disabled}
        onChange={(heightScale) => onChange({ heightScale }, "草の高さを変更しました")}
      />
      <TerrainNumberField
        label="葉の幅 (倍)"
        value={round2(resolved.width / type.width)}
        min={0.2}
        max={4}
        step={0.05}
        disabled={disabled}
        onChange={(widthScale) => onChange({ widthScale }, "草の葉の幅を変更しました")}
      />
      <TerrainNumberField
        label="空の明るさ"
        value={round2(resolved.fill)}
        min={0}
        max={1}
        step={0.02}
        disabled={disabled}
        onChange={(fill) => onChange({ fill }, "草の空の明るさを変更しました")}
      />
      <p className="text-[10px] leading-4 text-slate-500">
        空の明るさは、Sceneの光が届かない面を空からの照り返しでどれだけ起こすかです。0にすると光源だけで陰影が決まり、Skyboxしか光源がないSceneでは草が暗くなります。
      </p>
    </div>
  );
}

/** Rounds a display value so a slider round-trip does not print 0.30000000004. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Merges one appearance change into a layer, and drops the override entirely
 * once nothing is left in it — an empty change is「戻す」, and a layer that
 * carries no override follows its type again and costs the document nothing.
 */
function TerrainGrassColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-8 w-12 rounded border border-slate-300 bg-white p-0.5 disabled:opacity-45"
        />
        <span className="font-normal text-[10px] text-slate-500">{value}</span>
      </span>
    </label>
  );
}

function TerrainNumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.max(min, Math.min(max, next)));
        }}
        className="h-8 rounded border border-slate-300 bg-white px-2 text-right text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
      />
    </label>
  );
}

function ModelNodeInspector({
  entity,
  scene,
  assets,
  projectPath,
  readOnly,
  onMeshChange,
  onOpenMaterial,
}: {
  entity: SceneEntity;
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  readOnly: boolean;
  onMeshChange: (
    entityId: string,
    componentId: string,
    patch: MeshInspectorPatch,
  ) => void;
  onOpenMaterial: (assetId: string) => void;
}) {
  const node = entity.modelNode;
  if (!node) return null;
  const modelEntity = scene.entities[node.modelEntityId];
  const mesh = modelEntity?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
  const model = assets.assets[node.modelAssetId];
  const nodeSourceIndices = new Set(node.sourceMaterialIndices);
  const nodeSlots = model?.kind === "model"
    ? model.materialSlots.filter(
        (slot) =>
          slot.sourceMaterialIndex !== undefined &&
          nodeSourceIndices.has(slot.sourceMaterialIndex),
      )
    : [];
  const nodeBindings = mesh
    ? nodeSlots.flatMap((slot) => {
        const binding = mesh.materialBindings.find(
          (candidate) =>
            candidate.slot === slot.slot &&
            candidate.sourceNodeIndex === node.sourceNodeIndex,
        ) ?? mesh.materialBindings.find(
          (candidate) =>
            candidate.slot === slot.slot &&
            candidate.sourceNodeIndex === undefined,
        );
        return binding
          ? [{ ...binding, sourceNodeIndex: node.sourceNodeIndex }]
          : [];
      })
    : [];
  const nodeMesh = mesh
    ? {
        ...mesh,
        geometryAssetId: node.modelAssetId,
        geometry: {
          kind: "asset" as const,
          assetId: node.modelAssetId,
          sourceNodeIndex: node.sourceNodeIndex,
        },
        materialBindings: nodeBindings,
      }
    : undefined;

  return (
    <div className="space-y-3">
      <ComponentCard
        title={
          node.nodeType === "bone"
            ? "Bone"
            : node.nodeType === "skinned-mesh"
              ? "Skinned Mesh Node"
              : node.nodeType === "mesh"
                ? "Mesh Node"
                : "Model Node"
        }
        subtitle={`glTF #${node.sourceNodeIndex}`}
      >
        <dl className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
          <dt className="text-slate-500">Model</dt>
          <dd className="truncate text-right font-medium text-slate-700">
            {model?.name ?? node.modelAssetId}
          </dd>
          <dt className="text-slate-500">編集</dt>
          <dd className="text-right text-slate-700">
            {node.nodeType === "bone" ? "関節Transform" : "Node Transform"}
          </dd>
        </dl>
        <p className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">
          Transformは共有Modelのこのノードだけへ適用されます。SkinとAnimationは親のModel Entityで維持します。
        </p>
      </ComponentCard>
      {nodeMesh && node.sourceMaterialIndices.length > 0 ? (
        <MeshInspector
          component={nodeMesh}
          assets={assets}
          projectPath={projectPath}
          readOnly={readOnly}
          showModelPose={false}
          materialBindingSourceNodeIndex={node.sourceNodeIndex}
          onOpenMaterial={onOpenMaterial}
          onChange={(patch) => {
            if (!mesh || !modelEntity) return;
            const preserved = mesh.materialBindings.filter(
              (binding) => binding.sourceNodeIndex !== node.sourceNodeIndex,
            );
            const materialBindings = patch.materialBindings
              ? [
                  ...preserved,
                  ...patch.materialBindings.map((binding) => ({
                    ...binding,
                    sourceNodeIndex: node.sourceNodeIndex,
                  })),
                ]
              : undefined;
            onMeshChange(modelEntity.id, mesh.id, {
              ...patch,
              ...(materialBindings ? { materialBindings } : {}),
            });
          }}
        />
      ) : null}
    </div>
  );
}

function MultiSelectionInspector({
  scene,
  assets,
  selectedEntityIds,
  selectedAssetIds,
  readOnly,
  textureBatchState,
  onSetEntitiesEnabled,
  onSetMeshShadow,
  onSetLightShadow,
  onApplyMaterialPatch,
  onApplyTextureBatch,
}: {
  scene: SceneDocument;
  assets: AssetManifest;
  selectedEntityIds: readonly string[];
  selectedAssetIds: readonly string[];
  readOnly: boolean;
  textureBatchState?: TextureProcessingState;
  onSetEntitiesEnabled: (enabled: boolean) => void;
  onSetMeshShadow: (patch: Pick<MeshInspectorPatch, "castShadow" | "receiveShadow">) => void;
  onSetLightShadow: (castShadow: boolean) => void;
  onApplyMaterialPatch: (patch: MaterialAssetPatch) => void;
  onApplyTextureBatch?: (assetIds: readonly string[]) => void;
}) {
  const entities = selectedEntityIds
    .map((id) => scene.entities[id])
    .filter((entity): entity is SceneEntity => Boolean(entity));
  const selectedAssets = selectedAssetIds
    .map((id) => assets.assets[id])
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const entityMode = entities.length > 1 && selectedAssets.length === 0;
  const materials = selectedAssets.filter((asset) => asset.kind === "material");
  const allMaterials = selectedAssets.length > 1 && materials.length === selectedAssets.length;
  const allHaveMesh = entityMode && entities.every((entity) => entity.components.some((component) => component.type === "mesh"));
  const allHaveLight = entityMode && entities.every((entity) => entity.components.some((component) => component.type === "light"));
  const sameBoolean = (values: boolean[]) =>
    values.length > 0 && values.every((value) => value === values[0]) ? values[0] : null;
  const meshCastShadow = sameBoolean(entities.flatMap((entity) => entity.components.filter((component) => component.type === "mesh").map((component) => component.castShadow)));
  const meshReceiveShadow = sameBoolean(entities.flatMap((entity) => entity.components.filter((component) => component.type === "mesh").map((component) => component.receiveShadow)));
  const lightCastShadow = sameBoolean(entities.flatMap((entity) => entity.components.filter((component) => component.type === "light").map((component) => component.castShadow)));
  const textures = selectedAssets.filter((asset) => asset.kind === "texture");
  const materialProperties = materials.map((asset) => normalizeMaterialProperties(asset.properties as MaterialAssetPatch));
  const sameValue = <T,>(values: T[]) => values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined;
  const materialColor = sameValue(materialProperties.map((properties) => properties.color));
  const materialMetalness = sameValue(materialProperties.map((properties) => properties.metalness));
  const materialRoughness = sameValue(materialProperties.map((properties) => properties.roughness));

  if (entityMode) {
    return (
      <div className="space-y-3">
        <ComponentCard title="複数のEntity" subtitle={`${entities.length}件`}>
          <p className="text-xs leading-5 text-slate-600">共通するコンポーネントだけを一括変更できます。変更は一回のUndoにまとまります。</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={readOnly} onClick={() => onSetEntitiesEnabled(true)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">有効にする</button>
            <button type="button" disabled={readOnly} onClick={() => onSetEntitiesEnabled(false)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">無効にする</button>
          </div>
        </ComponentCard>
        {allHaveMesh ? (
          <ComponentCard title="Mesh Renderer" subtitle="全選択で共通">
            <p className="text-xs text-slate-500">Cast Shadow: {meshCastShadow === null ? "一部異なる" : meshCastShadow ? "有効" : "無効"} / Receive Shadow: {meshReceiveShadow === null ? "一部異なる" : meshReceiveShadow ? "有効" : "無効"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={readOnly} onClick={() => onSetMeshShadow({ castShadow: true })} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Cast Shadowを有効</button>
              <button type="button" disabled={readOnly} onClick={() => onSetMeshShadow({ castShadow: false })} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Cast Shadowを無効</button>
              <button type="button" disabled={readOnly} onClick={() => onSetMeshShadow({ receiveShadow: true })} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Receive Shadowを有効</button>
              <button type="button" disabled={readOnly} onClick={() => onSetMeshShadow({ receiveShadow: false })} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Receive Shadowを無効</button>
            </div>
          </ComponentCard>
        ) : null}
        {allHaveLight ? (
          <ComponentCard title="Light" subtitle="全選択で共通">
            <p className="text-xs text-slate-500">Cast Shadow: {lightCastShadow === null ? "一部異なる" : lightCastShadow ? "有効" : "無効"}</p>
            <div className="flex gap-2">
              <button type="button" disabled={readOnly} onClick={() => onSetLightShadow(true)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Cast Shadowを有効</button>
              <button type="button" disabled={readOnly} onClick={() => onSetLightShadow(false)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Cast Shadowを無効</button>
            </div>
          </ComponentCard>
        ) : null}
        {!allHaveMesh && !allHaveLight ? <p className="rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">共通のMesh RendererまたはLightコンポーネントはありません。</p> : null}
      </div>
    );
  }

  if (textures.length > 1) {
    return (
      <div className="space-y-3">
        <TextureBatchProcessingCard
          textures={textures}
          otherSelectionCount={selectedAssets.length - textures.length}
          readOnly={readOnly}
          state={textureBatchState ?? { phase: "idle" }}
          onApply={onApplyTextureBatch}
        />
      </div>
    );
  }

  if (allMaterials) {
    return (
      <div className="space-y-3">
        <ComponentCard title="複数のMaterial" subtitle={`${materials.length}件`}>
          <p className="text-xs leading-5 text-slate-600">共通のPBR値をまとめて変更します。カラー、Metalness、Roughnessは参照中のすべてのMesh previewへ反映されます。</p>
          <label className="block text-xs font-semibold text-slate-600">Base Color
            <span className="mt-1 flex items-center gap-2"><input type="color" disabled={readOnly} value={materialColor ?? "#ffffff"} onChange={(event) => onApplyMaterialPatch({ color: event.currentTarget.value })} className="h-8 w-12 rounded border border-slate-300 bg-white p-0.5 disabled:opacity-45" /><span className="font-normal text-slate-500">{materialColor ?? "一部異なる"}</span></span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Metalness<input type="number" min="0" max="1" step="0.01" disabled={readOnly} value={materialMetalness ?? ""} placeholder="一部異なる" onChange={(event) => { const value = Number(event.currentTarget.value); if (Number.isFinite(value)) onApplyMaterialPatch({ metalness: value }); }} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:opacity-45" /></label>
            <label className="text-xs font-semibold text-slate-600">Roughness<input type="number" min="0" max="1" step="0.01" disabled={readOnly} value={materialRoughness ?? ""} placeholder="一部異なる" onChange={(event) => { const value = Number(event.currentTarget.value); if (Number.isFinite(value)) onApplyMaterialPatch({ roughness: value }); }} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:opacity-45" /></label>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return <p className="rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">複数選択では同種のEntityまたはMaterialを選ぶと共通プロパティを編集できます。Textureを2件以上選ぶと、Import設定でまとめて変換できます。</p>;
}

/**
 * Textureの変換は1枚ずつしか実行できず、数十枚あるModel由来のTextureを
 * KTX2へ寄せるのが現実的でなかった。選択中のTextureのうち、変換待ちの
 * ものだけをまとめて書き出す。
 */
function TextureBatchProcessingCard({
  textures,
  otherSelectionCount,
  readOnly,
  state,
  onApply,
}: {
  textures: readonly TextureAsset[];
  otherSelectionCount: number;
  readOnly: boolean;
  state: TextureProcessingState;
  onApply?: (assetIds: readonly string[]) => void;
}) {
  const plans = textures.map((texture) => ({
    texture,
    plan: planTextureProcessing(texture),
  }));
  const pending = plans.filter((entry) => entry.plan.supported && entry.plan.pending);
  const blocked = plans.filter((entry) => !entry.plan.supported);
  const settled = plans.length - pending.length - blocked.length;
  const busy =
    state.phase === "reading" || state.phase === "encoding" || state.phase === "saving";
  const outputSummary = [
    ...new Set(
      pending.map((entry) =>
        entry.plan.supported
          ? entry.plan.outputFormat === "jpeg"
            ? "JPEG"
            : entry.plan.outputFormat.toUpperCase()
          : "",
      ),
    ),
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <ComponentCard title="複数のTexture" subtitle={`${textures.length}件`}>
      <p className="text-xs leading-5 text-slate-600">
        各TextureのImport設定（最大解像度・圧縮方式）で、選択中のTextureをまとめて書き出します。公開時の変換とは別に、Editorの表示と原本そのものを軽くしたいときに使います。
      </p>
      <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">変換対象</dt>
        <dd className="text-right tabular-nums font-semibold text-violet-700">
          {pending.length}件{outputSummary ? `・${outputSummary}` : ""}
        </dd>
        <dt className="text-slate-500">変更なし</dt>
        <dd className="text-right tabular-nums text-slate-500">{settled}件</dd>
        {blocked.length > 0 ? (
          <>
            <dt className="text-slate-500">対象外</dt>
            <dd className="text-right tabular-nums text-slate-500">{blocked.length}件</dd>
          </>
        ) : null}
      </dl>
      {otherSelectionCount > 0 ? (
        <p className="text-[11px] leading-4 text-slate-500">
          Texture以外の{otherSelectionCount}件は変換しません。
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending.length === 0 || busy || readOnly || !onApply}
        onClick={() => onApply?.(pending.map((entry) => entry.texture.id))}
        className="h-8 w-full rounded-md border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "変換中" : `選択した${pending.length}件をまとめて変換する`}
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
      ) : pending.length === 0 ? (
        <p className="text-[11px] leading-4 text-slate-500">
          変換待ちのTextureがありません。1件ずつ選んでCompressionの方式か最大解像度を設定してください。
        </p>
      ) : (
        <p className="rounded border border-amber-200 bg-amber-50 p-1.5 text-xs leading-4 text-amber-800">
          元の画像ファイルは残したまま、Assetの参照先が変換後の画像へ切り替わります。1件でも失敗した場合は、どのAssetも差し替えません。
        </p>
      )}
    </ComponentCard>
  );
}

function ModelPoseEditor({
  pose,
  bones,
  morphTargets,
  selectedBoneKey,
  readOnly,
  onSelectedBoneChange,
  onChange,
}: {
  pose?: ModelPoseState;
  bones: readonly ModelBoneMetadata[];
  morphTargets: readonly ModelMorphTargetMetadata[];
  selectedBoneKey: string;
  readOnly: boolean;
  onSelectedBoneChange: (key: string) => void;
  onChange: (pose: ModelPoseState) => void;
}) {
  const [poseOpen, setPoseOpen] = useState(
    bones.length > 0 || morphTargets.length > 0,
  );
  const current: ModelPoseState = pose ?? { bones: {}, morphTargets: {} };
  const rotation = current.bones[selectedBoneKey] ?? [0, 0, 0];
  const hasPose =
    Object.keys(current.bones).length > 0 ||
    Object.keys(current.morphTargets).length > 0;
  const availableBoneKeys = new Set(bones.map((bone) => bone.key));
  const availableMorphKeys = new Set(morphTargets.map((target) => target.key));
  const missingTargetCount =
    Object.keys(current.bones).filter((key) => !availableBoneKeys.has(key)).length +
    Object.keys(current.morphTargets).filter(
      (key) => !availableMorphKeys.has(key),
    ).length;

  const updateBoneAxis = (axis: number, degrees: number) => {
    if (!selectedBoneKey || !Number.isFinite(degrees)) return;
    const nextRotation: [number, number, number] = [...rotation];
    nextRotation[axis] = (degrees * Math.PI) / 180;
    const bonesNext = { ...current.bones };
    if (nextRotation.every((value) => Math.abs(value) < 1e-7)) {
      delete bonesNext[selectedBoneKey];
    } else {
      bonesNext[selectedBoneKey] = nextRotation;
    }
    onChange({ bones: bonesNext, morphTargets: { ...current.morphTargets } });
  };

  const updateMorphTarget = (key: string, weight: number) => {
    if (!Number.isFinite(weight)) return;
    const morphTargetsNext = { ...current.morphTargets };
    const normalized = Math.min(1, Math.max(0, weight));
    if (normalized < 1e-7) delete morphTargetsNext[key];
    else morphTargetsNext[key] = normalized;
    onChange({ bones: { ...current.bones }, morphTargets: morphTargetsNext });
  };

  return (
    <details
      className="border-t border-slate-100 pt-2"
      open={poseOpen}
      onToggle={(event) => setPoseOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-[13px] font-semibold uppercase tracking-wide text-slate-600">
        モデルポーズ
      </summary>
      <p className="mt-1 text-xs leading-4 text-slate-500">
        この配置だけに保存する静的なポーズです。Asset共通値や別の配置は変更しません。
      </p>

      {bones.length > 0 ? (
        <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              ボーン {bones.length}件
            </span>
            <span className="text-[11px] text-slate-500">回転は度単位</span>
          </div>
          <select
            value={selectedBoneKey}
            disabled={readOnly}
            onChange={(event) => onSelectedBoneChange(event.currentTarget.value)}
            className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
          >
            {bones.map((bone) => (
              <option key={bone.key} value={bone.key}>
                {bone.humanoidName
                  ? `${bone.humanoidName} / ${bone.name}`
                  : bone.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-1.5">
            {(["X", "Y", "Z"] as const).map((axis, index) => (
              <label key={axis} className="text-[11px] font-medium text-slate-600">
                {axis}
                <input
                  type="number"
                  min={-360}
                  max={360}
                  step={1}
                  value={roundTo((rotation[index] * 180) / Math.PI, 2)}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateBoneAxis(index, event.currentTarget.valueAsNumber)
                  }
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {morphTargets.length > 0 ? (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold text-slate-700">
            シェイプキー {morphTargets.length}件
          </p>
          <div className="scrollbar-thin mt-2 max-h-52 space-y-2 overflow-auto pr-1">
            {morphTargets.map((target) => {
              const weight = current.morphTargets[target.key] ?? 0;
              return (
                <label
                  key={target.key}
                  className="grid grid-cols-[minmax(72px,1fr)_minmax(80px,1.4fr)_42px] items-center gap-2 text-[11px] text-slate-600"
                >
                  <span className="truncate" title={target.name}>{target.name}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weight}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateMorphTarget(target.key, event.currentTarget.valueAsNumber)
                    }
                    className="w-full accent-violet-600"
                  />
                  <span className="text-right tabular-nums text-slate-500">
                    {weight.toFixed(2)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {bones.length === 0 && morphTargets.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-xs leading-4 text-slate-500">
          このモデルには編集できるボーンまたはシェイプキーがありません。
        </p>
      ) : null}

      {missingTargetCount > 0 ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-4 text-amber-800">
          再インポート後に見つからないポーズ対象が{missingTargetCount}件あります。残っている対象だけを適用しています。リセットすると未適用値を整理できます。
        </p>
      ) : null}

      <button
        type="button"
        disabled={readOnly || !hasPose}
        onClick={() => onChange({ bones: {}, morphTargets: {} })}
        className="mt-2 h-8 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ポーズをリセット
      </button>
    </details>
  );
}

function ColliderNumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 text-xs text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        value={roundTo(value, 3)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-8 rounded border border-slate-300 bg-white px-2 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

function ColliderInspector({
  component,
  entityScale,
  bodyOwner,
  readOnly,
  onChange,
  onAutoFit,
  onRemove,
}: {
  component: ColliderComponent;
  entityScale: Vec3;
  bodyOwner?: SceneEntity;
  readOnly: boolean;
  onChange: (patch: ColliderPatch) => void;
  onAutoFit: () => void;
  onRemove: () => void;
}) {
  const effectiveSize =
    component.shape === "box"
      ? component.halfExtents.map(
          (halfExtent, index) =>
            Math.abs(halfExtent * entityScale[index] * 2),
        ) as Vec3
      : null;

  return (
    <ComponentCard
      title={component.shape === "box" ? "Box Collider" : "Mesh Collider"}
      subtitle="Physics"
    >
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />

      {bodyOwner ? (
        <p className="rounded border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-xs leading-5 text-indigo-800">
          Rigid Body: {bodyOwner.name}。このColliderは親Bodyの形状として使われます。
        </p>
      ) : (
      <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Rigid Body · Entity共通
        </p>
        <label className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-3 text-xs text-slate-700">
          Rigid Body
          <select
            value={component.bodyType ?? "fixed"}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                bodyType: event.currentTarget.value as NonNullable<
                  ColliderComponent["bodyType"]
                >,
              })
            }
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
          >
            <option value="fixed">Static（Fixed）</option>
            <option value="dynamic">Dynamic</option>
            <option value="kinematicPosition">Kinematic Position</option>
            <option value="kinematicVelocity">Kinematic Velocity</option>
          </select>
        </label>
        <ColliderNumberField
          label="Gravity Scale"
          value={component.gravityScale ?? 1}
          min={-100}
          max={100}
          step={0.1}
          disabled={readOnly}
          onChange={(gravityScale) => onChange({ gravityScale })}
        />
        <ColliderNumberField
          label="Linear Damping"
          value={component.linearDamping ?? 0}
          min={0}
          step={0.05}
          disabled={readOnly}
          onChange={(linearDamping) => onChange({ linearDamping })}
        />
        <ColliderNumberField
          label="Angular Damping"
          value={component.angularDamping ?? 0}
          min={0}
          step={0.05}
          disabled={readOnly}
          onChange={(angularDamping) => onChange({ angularDamping })}
        />
        <ToggleRow
          label="Can Sleep"
          checked={component.canSleep ?? true}
          disabled={readOnly}
          onChange={(canSleep) => onChange({ canSleep })}
        />
        <ToggleRow
          label="CCD"
          checked={component.ccd ?? false}
          disabled={readOnly}
          onChange={(ccd) => onChange({ ccd })}
        />
        <ToggleRow
          label="Lock Position"
          checked={component.lockTranslations ?? false}
          disabled={readOnly}
          onChange={(lockTranslations) => onChange({ lockTranslations })}
        />
        <ToggleRow
          label="Lock Rotation"
          checked={component.lockRotations ?? false}
          disabled={readOnly}
          onChange={(lockRotations) => onChange({ lockRotations })}
        />
      </div>
      )}

      {component.shape === "box" ? (
        <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-700">
              Fit
              <select
                value={component.fitMode}
                disabled={readOnly}
                onChange={(event) => {
                  if (event.currentTarget.value === "auto") onAutoFit();
                  else onChange({ fitMode: "manual" });
                }}
                className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
              >
                <option value="auto">Meshに追従</option>
                <option value="manual">手動</option>
              </select>
            </label>
            <button
              type="button"
              disabled={readOnly}
              onClick={onAutoFit}
              className="h-8 shrink-0 rounded border border-violet-300 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-45"
            >
              再フィット
            </button>
          </div>
          <VectorEditor
            label="Center"
            value={component.center}
            valueKind="position"
            disabled={readOnly}
            onChange={(center) => onChange({ center, fitMode: "manual" })}
          />
          <VectorEditor
            label="Half Extents"
            value={component.halfExtents}
            valueKind="scale"
            disabled={readOnly}
            onChange={(halfExtents) =>
              onChange({ halfExtents, fitMode: "manual" })
            }
          />
          {effectiveSize ? (
            <p className="rounded bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-500">
              現在のScale適用後サイズ: {effectiveSize.map((value) => roundTo(value, 3)).join(" × ")}
            </p>
          ) : null}
        </div>
      ) : (
        <label className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-700">
          Mesh Mode
          <select
            value={component.meshMode}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ meshMode: event.currentTarget.value as "convex" | "trimesh" })
            }
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
          >
            <option value="trimesh">Trimesh（地形・固定物）</option>
            <option value="convex">Convex Hull（軽量）</option>
          </select>
        </label>
      )}

      <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
        <ToggleRow
          label="Is Trigger"
          checked={component.isTrigger}
          disabled={readOnly}
          onChange={(isTrigger) => onChange({ isTrigger })}
        />
        <ColliderNumberField
          label="Friction"
          value={component.friction}
          min={0}
          step={0.05}
          disabled={readOnly}
          onChange={(friction) => onChange({ friction })}
        />
        <ColliderNumberField
          label="Restitution"
          value={component.restitution}
          min={0}
          max={1}
          step={0.05}
          disabled={readOnly}
          onChange={(restitution) => onChange({ restitution })}
        />
      </div>

      <button
        type="button"
        disabled={readOnly}
        onClick={onRemove}
        className="w-full rounded border border-rose-200 bg-white px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-45"
      >
        Colliderを削除
      </button>
    </ComponentCard>
  );
}

function RigidBodyInspector({
  component,
  descendantColliderCount,
  descendantMeshCount,
  readOnly,
  onChange,
  onRemove,
}: {
  component: RigidBodyComponent;
  descendantColliderCount: number;
  descendantMeshCount: number;
  readOnly: boolean;
  onChange: (patch: RigidBodyPatch) => void;
  onRemove: () => void;
}) {
  return (
    <ComponentCard
      title="Rigid Body"
      subtitle="Physics · 子孫を所有"
      enabled={{
        checked: component.enabled,
        disabled: readOnly,
        label: "Rigid Bodyを有効化",
        onChange: (enabled) => onChange({ enabled }),
      }}
      actions={
        <button
          type="button"
          disabled={readOnly}
          onClick={onRemove}
          aria-label="Rigid Bodyを削除"
          title="Rigid Bodyを削除"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
        >
          <EDITOR_ICONS.delete size={13} aria-hidden="true" />
        </button>
      }
    >
      <p className="rounded bg-indigo-50 px-2 py-1.5 text-xs leading-5 text-indigo-800">
        このEntityを原点に、入れ子のRigid Bodyまでの子孫をまとめます。
        Collider {descendantColliderCount} / Mesh {descendantMeshCount}
      </p>
      {(component.autoColliders === "none" &&
        descendantColliderCount === 0) ||
      (component.autoColliders !== "none" && descendantMeshCount === 0) ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-800">
          {component.autoColliders === "none"
            ? "このBody範囲に有効なColliderがありません。子EntityへColliderを追加してください。"
            : "自動Colliderを作成できるMeshがこのBody範囲にありません。"}
        </p>
      ) : null}
      {component.autoColliders === "trimesh" &&
      component.bodyType !== "fixed" ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-800">
          Dynamic / Kinematicでは安全なConvex Hullとして実行・出力します。
        </p>
      ) : null}
      <label className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-3 text-xs text-slate-700">
        Type
        <select
          value={component.bodyType}
          disabled={readOnly}
          onChange={(event) =>
            onChange({
              bodyType: event.currentTarget.value as RigidBodyComponent["bodyType"],
            })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          <option value="fixed">Static（Fixed）</option>
          <option value="dynamic">Dynamic</option>
          <option value="kinematicPosition">Kinematic Position</option>
          <option value="kinematicVelocity">Kinematic Velocity</option>
        </select>
      </label>
      <label className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-3 text-xs text-slate-700">
        Auto Colliders
        <select
          value={component.autoColliders}
          disabled={readOnly}
          onChange={(event) =>
            onChange({
              autoColliders:
                event.currentTarget.value as RigidBodyComponent["autoColliders"],
            })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          <option value="none">Off（明示Colliderのみ）</option>
          <option value="cuboid">Cuboid</option>
          <option value="ball">Ball</option>
          <option value="hull">Convex Hull</option>
          <option value="trimesh">Trimesh</option>
        </select>
      </label>
      <ToggleRow
        label="Auto Collider Trigger"
        checked={component.isTrigger}
        disabled={readOnly}
        onChange={(isTrigger) => onChange({ isTrigger })}
      />
      <ColliderNumberField
        label="Auto Friction"
        value={component.friction}
        min={0}
        step={0.05}
        disabled={readOnly}
        onChange={(friction) => onChange({ friction })}
      />
      <ColliderNumberField
        label="Auto Restitution"
        value={component.restitution}
        min={0}
        max={1}
        step={0.05}
        disabled={readOnly}
        onChange={(restitution) => onChange({ restitution })}
      />
      <ColliderNumberField
        label="Gravity Scale"
        value={component.gravityScale}
        min={-100}
        max={100}
        step={0.1}
        disabled={readOnly}
        onChange={(gravityScale) => onChange({ gravityScale })}
      />
      <ColliderNumberField
        label="Linear Damping"
        value={component.linearDamping}
        min={0}
        step={0.05}
        disabled={readOnly}
        onChange={(linearDamping) => onChange({ linearDamping })}
      />
      <ColliderNumberField
        label="Angular Damping"
        value={component.angularDamping}
        min={0}
        step={0.05}
        disabled={readOnly}
        onChange={(angularDamping) => onChange({ angularDamping })}
      />
      <ToggleRow
        label="Can Sleep"
        checked={component.canSleep}
        disabled={readOnly}
        onChange={(canSleep) => onChange({ canSleep })}
      />
      <ToggleRow
        label="CCD"
        checked={component.ccd}
        disabled={readOnly}
        onChange={(ccd) => onChange({ ccd })}
      />
      <ToggleRow
        label="Lock Position"
        checked={component.lockTranslations}
        disabled={readOnly}
        onChange={(lockTranslations) => onChange({ lockTranslations })}
      />
      <ToggleRow
        label="Lock Rotation"
        checked={component.lockRotations}
        disabled={readOnly}
        onChange={(lockRotations) => onChange({ lockRotations })}
      />
    </ComponentCard>
  );
}

function LightInspector({
  component,
  readOnly,
  onChange,
  onRemove,
}: {
  component: LightComponent;
  readOnly: boolean;
  onChange: (patch: LightPatch) => void;
  onRemove?: () => void;
}) {
  const supportsShadow = ["directional", "point", "spot"].includes(component.lightType);

  return (
    <ComponentCard
      title={LIGHT_LABELS[component.lightType]}
      subtitle="Three.js"
      remove={
        onRemove
          ? { label: "Lightを削除", disabled: readOnly, onRemove }
          : undefined
      }
    >
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        Type
        <select
          value={component.lightType}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ lightType: event.currentTarget.value as LightComponent["lightType"] })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          {Object.entries(LIGHT_LABELS)
            // Ambient is Scene-wide, not something an Entity can hold: it has
            // no position and no direction, so a second one on an object does
            // nothing an author can reason about. Scene設定の環境光 owns it.
            // A Scene saved with one still opens and still lists it here.
            .filter(
              ([value]) =>
                value !== "ambient" || component.lightType === "ambient",
            )
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        <span>Color</span>
        <input
          type="color"
          value={component.color}
          disabled={readOnly}
          onChange={(event) => onChange({ color: event.currentTarget.value })}
          className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <ColliderNumberField
        label="Intensity"
        value={component.intensity}
        min={0}
        step={0.1}
        disabled={readOnly}
        onChange={(intensity) => onChange({ intensity })}
      />

      {component.lightType === "hemisphere" ? (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-700">
          <span>Ground Color</span>
          <input
            type="color"
            value={component.groundColor ?? "#334155"}
            disabled={readOnly}
            onChange={(event) => onChange({ groundColor: event.currentTarget.value })}
            className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      ) : null}

      {component.lightType === "point" || component.lightType === "spot" ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <ColliderNumberField
            label="Distance"
            value={component.distance ?? 0}
            min={0}
            step={0.1}
            disabled={readOnly}
            onChange={(distance) => onChange({ distance })}
          />
          <ColliderNumberField
            label="Decay"
            value={component.decay ?? 2}
            min={0}
            step={0.1}
            disabled={readOnly}
            onChange={(decay) => onChange({ decay })}
          />
        </div>
      ) : null}

      {component.lightType === "spot" ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <ColliderNumberField
            label="Angle (°)"
            value={((component.angle ?? Math.PI / 3) * 180) / Math.PI}
            min={1}
            max={90}
            step={1}
            disabled={readOnly}
            onChange={(degrees) => onChange({ angle: (degrees * Math.PI) / 180 })}
          />
          <ColliderNumberField
            label="Penumbra"
            value={component.penumbra ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            disabled={readOnly}
            onChange={(penumbra) => onChange({ penumbra })}
          />
        </div>
      ) : null}

      {component.lightType === "rectArea" ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <ColliderNumberField
            label="Width"
            value={component.width ?? 1}
            min={0.01}
            step={0.1}
            disabled={readOnly}
            onChange={(width) => onChange({ width })}
          />
          <ColliderNumberField
            label="Height"
            value={component.height ?? 1}
            min={0.01}
            step={0.1}
            disabled={readOnly}
            onChange={(height) => onChange({ height })}
          />
        </div>
      ) : null}

      {supportsShadow ? (
        <div className="border-t border-slate-100 pt-2">
          <ToggleRow
            label="Cast Shadows"
            checked={component.castShadow}
            disabled={readOnly}
            onChange={(castShadow) => onChange({ castShadow })}
          />
        </div>
      ) : null}
    </ComponentCard>
  );
}

function TextInspector({
  component,
  assets,
  readOnly,
  onChange,
  onOpenAsset,
  onRemove,
}: {
  component: TextComponent;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: TextPatch) => void;
  onOpenAsset: (assetId: string) => void;
  onRemove?: () => void;
}) {
  const background = component.background ?? DEFAULT_TEXT_BACKGROUND;
  const patchBackground = (patch: TextBackgroundPatch) =>
    onChange({ background: patch });
  const fontGroups = useMemo(() => groupTextFonts(), []);
  const weightOptions = textFontWeightOptions(component.fontId);
  const textureAssets = useMemo(
    () =>
      Object.values(assets.assets)
        .filter((asset) => asset.kind === "texture")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assets],
  );
  const selectedTexture = background.textureAssetId
    ? assets.assets[background.textureAssetId]
    : undefined;

  return (
    <ComponentCard
      title="Text"
      subtitle="SDF"
      remove={
        onRemove
          ? { label: "Textを削除", disabled: readOnly, onRemove }
          : undefined
      }
    >
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />
      <label className="block text-xs font-medium text-slate-600">
        Content
        <textarea
          value={component.text}
          disabled={readOnly}
          rows={3}
          onChange={(event) => onChange({ text: event.currentTarget.value })}
          className="mt-1 w-full resize-y rounded border border-slate-300 bg-white px-2 py-1.5 text-xs leading-5 text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Font
        <select
          value={component.fontId ?? AUTOMATIC_TEXT_FONT_ID}
          disabled={readOnly}
          onChange={(event) => onChange({ fontId: event.currentTarget.value })}
          className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
        >
          <option value={AUTOMATIC_TEXT_FONT_ID}>自動（文字に合わせて選ぶ）</option>
          {fontGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label} — {font.labelJa}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="text-[11px] leading-4 text-slate-500">
        {component.fontId && component.fontId !== AUTOMATIC_TEXT_FONT_ID
          ? "選んだ書体はGoogle Fontsから初回だけ取得します。取得できないときは自動の書体で表示します。"
          : "文字に含まれる文字種から書体を選びます。日本語と欧文が混ざっていても表示できます。"}
      </p>
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        Weight
        <select
          value={String(component.fontWeight ?? 400)}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ fontWeight: Number(event.currentTarget.value) })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          {weightOptions.map((weight) => (
            <option key={weight} value={weight}>
              {weight === 700 ? "Bold (700)" : `Regular (${weight})`}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        <span>Color</span>
        <input
          type="color"
          value={component.color}
          disabled={readOnly}
          onChange={(event) => onChange({ color: event.currentTarget.value })}
          className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:opacity-50"
        />
      </div>
      <ColliderNumberField
        label="Font Size"
        value={component.fontSize}
        min={0.001}
        step={0.01}
        disabled={readOnly}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        <span className="text-[11px] text-slate-500">大きさを引いて調整</span>
        <input
          type="range"
          aria-label="Font Sizeのスライダー"
          min={0.01}
          // 大きな見出しを数値で入れた後もつまみが端に張り付かないよう、上限を追従させる。
          max={Math.max(1, roundTo(component.fontSize, 2))}
          step={0.01}
          value={component.fontSize}
          disabled={readOnly}
          onChange={(event) => {
            const fontSize = event.currentTarget.valueAsNumber;
            if (Number.isFinite(fontSize) && fontSize > 0) onChange({ fontSize });
          }}
          className="h-2 w-full cursor-ew-resize accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>
      <ColliderNumberField
        label="Max Width"
        value={component.maxWidth ?? 10}
        min={0.01}
        step={0.1}
        disabled={readOnly}
        onChange={(maxWidth) => onChange({ maxWidth })}
      />
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        Text Align
        <select
          value={component.textAlign ?? "center"}
          disabled={readOnly}
          onChange={(event) =>
            onChange({
              textAlign: event.currentTarget.value as NonNullable<
                TextComponent["textAlign"]
              >,
            })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </label>
      <ColliderNumberField
        label="Line Height"
        value={component.lineHeight ?? 1.25}
        min={0.5}
        step={0.05}
        disabled={readOnly}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <ColliderNumberField
        label="Letter Spacing"
        value={component.letterSpacing ?? 0}
        min={-0.5}
        step={0.005}
        disabled={readOnly}
        onChange={(letterSpacing) => onChange({ letterSpacing })}
      />
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        Anchor X
        <select
          value={component.anchorX}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ anchorX: event.currentTarget.value as TextComponent["anchorX"] })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        Anchor Y
        <select
          value={component.anchorY}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ anchorY: event.currentTarget.value as TextComponent["anchorY"] })
          }
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <ColliderNumberField
        label="Outline"
        value={component.outlineWidth}
        min={0}
        step={0.005}
        disabled={readOnly}
        onChange={(outlineWidth) => onChange({ outlineWidth })}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
        <span>Outline Color</span>
        <input
          type="color"
          value={component.outlineColor}
          disabled={readOnly}
          onChange={(event) => onChange({ outlineColor: event.currentTarget.value })}
          className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:opacity-50"
        />
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-2">
        <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs font-medium text-slate-700">
          Background
          <select
            value={background.mode}
            disabled={readOnly}
            onChange={(event) =>
              patchBackground({
                mode: event.currentTarget.value as TextBackgroundMode,
              })
            }
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
          >
            <option value="none">なし</option>
            <option value="color">色</option>
            <option value="texture">画像</option>
          </select>
        </label>
        {background.mode === "none" ? (
          <p className="text-[11px] leading-4 text-slate-500">
            文字だけを空間に置きます。壁の解説や看板を作るときは「色」または「画像」を選ぶと、文字の後ろに板が付きます。
          </p>
        ) : null}
      </div>

      {background.mode !== "none" ? (
        <div className="space-y-2">
          {background.mode === "texture" ? (
            <>
              <label className="block text-xs font-medium text-slate-600">
                背景の画像 (Texture Asset)
                <select
                  value={background.textureAssetId ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchBackground({ textureAssetId: event.currentTarget.value })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
                >
                  <option value="">未設定</option>
                  {textureAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTexture?.kind === "texture" ? (
                <button
                  type="button"
                  onClick={() => onOpenAsset(selectedTexture.id)}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {selectedTexture.name}を開く
                </button>
              ) : null}
              {textureAssets.length === 0 ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800">
                  Assetsのインポートから画像を追加すると、背景に選べます。
                </p>
              ) : !background.textureAssetId ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800">
                  画像が未選択のため、背景は色だけで表示されます。
                </p>
              ) : null}
            </>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
            <span>{background.mode === "texture" ? "画像の色味" : "背景色"}</span>
            <input
              type="color"
              value={background.color}
              disabled={readOnly}
              onChange={(event) =>
                patchBackground({ color: event.currentTarget.value })
              }
              className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:opacity-50"
            />
          </div>
          <ColliderNumberField
            label="不透明度"
            value={background.opacity}
            min={0}
            max={1}
            step={0.05}
            disabled={readOnly}
            onChange={(opacity) => patchBackground({ opacity })}
          />
          <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-xs text-slate-700">
            板のサイズ
            <select
              value={background.fit}
              disabled={readOnly}
              onChange={(event) =>
                patchBackground({
                  fit: event.currentTarget.value as TextBackgroundFit,
                })
              }
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100"
            >
              <option value="text">文字に合わせる</option>
              <option value="fixed">サイズを指定</option>
            </select>
          </label>
          {background.fit === "text" ? (
            <>
              <ColliderNumberField
                label="左右の余白"
                value={background.paddingX}
                min={0}
                step={0.01}
                disabled={readOnly}
                onChange={(paddingX) => patchBackground({ paddingX })}
              />
              <ColliderNumberField
                label="上下の余白"
                value={background.paddingY}
                min={0}
                step={0.01}
                disabled={readOnly}
                onChange={(paddingY) => patchBackground({ paddingY })}
              />
            </>
          ) : (
            <>
              <ColliderNumberField
                label="幅"
                value={background.width}
                min={0.01}
                step={0.05}
                disabled={readOnly}
                onChange={(width) => patchBackground({ width })}
              />
              <ColliderNumberField
                label="高さ"
                value={background.height}
                min={0.01}
                step={0.05}
                disabled={readOnly}
                onChange={(height) => patchBackground({ height })}
              />
            </>
          )}
          <ColliderNumberField
            label="文字との奥行き"
            value={background.offset}
            min={0}
            step={0.001}
            disabled={readOnly}
            onChange={(offset) => patchBackground({ offset })}
          />
          <ToggleRow
            label="裏からも見える"
            checked={background.doubleSided}
            disabled={readOnly}
            onChange={(doubleSided) => patchBackground({ doubleSided })}
          />
          <p className="text-[11px] leading-4 text-slate-500">
            背景と文字はライトの影響を受けません。展示の解説パネルのように、部屋の明るさに関わらず同じ見え方になります。
          </p>
        </div>
      ) : null}
    </ComponentCard>
  );
}

/** Splits the catalog into the two script groups the picker shows. */
function groupTextFonts(): Array<{
  label: string;
  fonts: readonly XriftTextFontDefinition[];
}> {
  return [
    {
      label: "日本語",
      fonts: TEXT_FONT_CATALOG.filter((font) => font.subset === "japanese"),
    },
    {
      label: "欧文",
      fonts: TEXT_FONT_CATALOG.filter((font) => font.subset === "latin"),
    },
  ].filter((group) => group.fonts.length > 0);
}

function AudioSourceInspector({
  component,
  assets,
  readOnly,
  onChange,
  onOpenAsset,
  onRemove,
}: {
  component: AudioSourceComponent;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: AudioSourcePatch) => void;
  onOpenAsset: (assetId: string) => void;
  onRemove?: () => void;
}) {
  const audioAssets = Object.values(assets.assets)
    .filter((asset) => asset.kind === "audio")
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedAudio = component.audioAssetId
    ? assets.assets[component.audioAssetId]
    : undefined;
  return (
    <ComponentCard
      title="Audio Source"
      subtitle="Three.js"
      remove={
        onRemove
          ? { label: "Audio Sourceを削除", disabled: readOnly, onRemove }
          : undefined
      }
    >
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />
      <label className="block text-xs font-medium text-slate-600">
        Audio Asset
        <select
          value={component.audioAssetId ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ audioAssetId: event.currentTarget.value })
          }
          className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
        >
          <option value="">未設定</option>
          {audioAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      {selectedAudio?.kind === "audio" ? (
        <button
          type="button"
          onClick={() => onOpenAsset(selectedAudio.id)}
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {selectedAudio.name}を開く
        </button>
      ) : null}
      {audioAssets.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800">
          AssetsのインポートからMP3またはWAVを追加してください。
        </p>
      ) : null}
      <ColliderNumberField
        label="Volume"
        value={component.volume}
        min={0}
        max={1}
        step={0.05}
        disabled={readOnly}
        onChange={(volume) => onChange({ volume })}
      />
      <div className="space-y-2 border-t border-slate-100 pt-2">
        <ToggleRow
          label="Loop"
          checked={component.loop}
          disabled={readOnly}
          onChange={(loop) => onChange({ loop })}
        />
        <ToggleRow
          label="Autoplay"
          checked={component.autoplay}
          disabled={readOnly}
          onChange={(autoplay) => onChange({ autoplay })}
        />
        <ToggleRow
          label="距離で減衰 (Spatial)"
          checked={component.spatial}
          disabled={readOnly}
          onChange={(spatial) => onChange({ spatial })}
        />
      </div>
      {!component.spatial ? (
        <p className="border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">
          距離減衰なしで再生します。Entityの位置に関わらずシーン全体へ同じ音量で届くので、BGMや環境音に向きます。
        </p>
      ) : null}
      {component.spatial ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <ColliderNumberField
            label="Reference Distance"
            value={component.refDistance}
            min={0.01}
            step={0.1}
            disabled={readOnly}
            onChange={(refDistance) =>
              onChange({
                refDistance,
                maxDistance: Math.max(component.maxDistance, refDistance),
              })
            }
          />
          <ColliderNumberField
            label="Rolloff"
            value={component.rolloffFactor}
            min={0}
            step={0.1}
            disabled={readOnly}
            onChange={(rolloffFactor) => onChange({ rolloffFactor })}
          />
          <ColliderNumberField
            label="Max Distance"
            value={component.maxDistance}
            min={component.refDistance}
            step={1}
            disabled={readOnly}
            onChange={(maxDistance) => onChange({ maxDistance })}
          />
        </div>
      ) : null}
    </ComponentCard>
  );
}
function VegetationWindInspector({
  component,
  readOnly,
  onChange,
  onRemove,
}: {
  component: VegetationWindComponent;
  readOnly: boolean;
  onChange: (patch: VegetationWindPatch) => void;
  onRemove?: () => void;
}) {
  return (
    <ComponentCard
      title="Wind"
      subtitle="Entity Component"
      remove={
        onRemove
          ? { label: "Windを削除", disabled: readOnly, onRemove }
          : undefined
      }
    >
      <p className="text-xs leading-4 text-slate-600">
        このEntityと子Meshを風の対象にします。風の強さ・速度・突風はScene Settingsのグローバル設定を使います。Mesh名からは判定しません。
      </p>
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />
      <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-4 text-slate-600">
        Scene Settingsの「Wind（グローバル）」から、対象Entity全体の風を調整できます。
      </p>
    </ComponentCard>
  );
}

function ParticleEmitterInspector({
  component,
  assets,
  readOnly,
  onChange,
  onOpenAsset,
  onRemove,
}: {
  component: ParticleEmitterComponent;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: ParticleEmitterInspectorPatch) => void;
  onOpenAsset: (assetId: string) => void;
  onRemove: () => void;
}) {
  const particles = Object.values(assets.assets).filter(
    (asset) => asset.kind === "particle",
  );
  const selectedParticle = assets.assets[component.particleAssetId];
  const particleReady = selectedParticle?.kind === "particle";
  const DeleteIcon = EDITOR_ICONS.delete;

  return (
    <ComponentCard
      title="Particle Emitter"
      subtitle="Rendering"
      actions={
        <button
          type="button"
          disabled={readOnly}
          onClick={onRemove}
          aria-label="Particle Emitterを削除"
          title="Particle Emitterを削除"
          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <DeleteIcon size={13} aria-hidden="true" />
        </button>
      }
    >
      <ToggleRow
        label="Enabled"
        checked={component.enabled}
        disabled={readOnly}
        onChange={(enabled) => onChange({ enabled })}
      />
      <label className="block text-xs font-medium text-slate-600">
        Particle Asset
        <select
          value={component.particleAssetId}
          disabled={readOnly || particles.length === 0}
          onChange={(event) =>
            onChange({ particleAssetId: event.currentTarget.value })
          }
          className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {!particleReady ? (
            <option value={component.particleAssetId}>
              {particles.length === 0
                ? "Particle Assetがありません"
                : `参照が見つかりません: ${component.particleAssetId}`}
            </option>
          ) : null}
          {particles.map((particle) => (
            <option key={particle.id} value={particle.id}>
              {particle.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!particleReady}
        onClick={() => onOpenAsset(component.particleAssetId)}
        className="w-full rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Particle Assetを編集
      </button>
      {!particleReady ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-4 text-amber-800">
          AssetsでParticleを作成し、このコンポーネントへ割り当ててください。
        </p>
      ) : null}
    </ComponentCard>
  );
}

function findEnabledRigidBodyOwner(
  scene: SceneDocument,
  entity: SceneEntity,
): SceneEntity | undefined {
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (
      current.components.some(
        (component) => component.type === "rigid-body" && component.enabled,
      )
    ) {
      return current;
    }
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return undefined;
}

function countRigidBodyDescendants(
  scene: SceneDocument,
  rootEntityId: string,
): { colliderCount: number; meshCount: number } {
  let colliderCount = 0;
  let meshCount = 0;
  const pending = [rootEntityId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const entityId = pending.pop()!;
    if (visited.has(entityId)) continue;
    visited.add(entityId);
    const current = scene.entities[entityId];
    if (!current) continue;
    const nestedBoundary =
      entityId !== rootEntityId &&
      current.components.some(
        (component) => component.type === "rigid-body" && component.enabled,
      );
    if (nestedBoundary) continue;
    colliderCount += current.components.filter(
      (component) => component.type === "collider" && component.enabled,
    ).length;
    meshCount += current.components.filter(
      (component) => component.type === "mesh" && component.enabled,
    ).length;
    pending.push(...current.children);
  }
  return { colliderCount, meshCount };
}

function EntityInspector({
  entity,
  scene,
  assets,
  projectPath,
  readOnly,
  playMode,
  onEnabledChange,
  onRename,
  onTransformChange,
  onTransformScrubStart,
  onTransformScrubChange,
  onTransformScrubEnd,
  onTransformScrubCancel,
  onMeshChange,
  onTerrainBrush,
  onTerrainGrassLayersChange,
  onTerrainSettings,
  onTerrainEditingChange,
  terrainSceneEditing,
  onApplyTerrainSurface,
  onModelNodeMeshChange,
  onColliderChange,
  onRigidBodyChange,
  onAutoFitCollider,
  onRemoveCollider,
  onRemoveRigidBody,
  onRemoveComponent,
  onLightChange,
  onTextChange,
  onVegetationWindChange,
  onAudioSourceChange,
  onParticleEmitterChange,
  onRemoveParticleEmitter,
  onOpenMaterial,
  onOpenInteractivity,
  projectKind,
  onAddComponent,
  onUpdateXriftComponent,
  onRemoveXriftComponent,
  prefabSource,
  onUpdatePrefab,
  scriptContracts,
  scriptEntityOptions,
  onUpdateScriptComponent,
  onOpenScript,
  onUpdateInteractionTrigger,
}: {
  entity: SceneEntity;
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  readOnly: boolean;
  playMode: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRename: (name: string) => void;
  onTransformChange: (patch: TransformPatch) => void;
  onTransformScrubStart: () => void;
  onTransformScrubChange: (patch: TransformPatch) => void;
  onTransformScrubEnd: () => void;
  onTransformScrubCancel: () => void;
  onMeshChange: (componentId: string, patch: MeshInspectorPatch) => void;
  onTerrainBrush: (
    componentId: string,
    operation: TerrainSceneBrushOperation,
  ) => void;
  onTerrainGrassLayersChange: (
    componentId: string,
    grass: TerrainGrassLayer[],
    notice: string,
  ) => void;
  onTerrainSettings: (
    componentId: string,
    options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
  ) => void;
  onTerrainEditingChange: (
    editing: Omit<TerrainViewportEditing, "entityId"> | null,
  ) => void;
  terrainSceneEditing: TerrainViewportEditing | null;
  onApplyTerrainSurface: (
    componentId: string,
    entry: TerrainSurfaceCatalogEntry,
    values: Record<string, number | string>,
  ) => void;
  onModelNodeMeshChange: (
    entityId: string,
    componentId: string,
    patch: MeshInspectorPatch,
  ) => void;
  onColliderChange: (componentId: string, patch: ColliderPatch) => void;
  onRigidBodyChange: (componentId: string, patch: RigidBodyPatch) => void;
  onAutoFitCollider: (componentId: string) => void;
  onRemoveCollider: (componentId: string) => void;
  onRemoveRigidBody: (componentId: string) => void;
  onRemoveComponent: (componentId: string) => void;
  onLightChange: (componentId: string, patch: LightPatch) => void;
  onTextChange: (componentId: string, patch: TextPatch) => void;
  onVegetationWindChange: (
    componentId: string,
    patch: VegetationWindPatch,
  ) => void;
  onAudioSourceChange: (componentId: string, patch: AudioSourcePatch) => void;
  onParticleEmitterChange: (
    componentId: string,
    patch: ParticleEmitterInspectorPatch,
  ) => void;
  onRemoveParticleEmitter: (componentId: string) => void;
  onOpenMaterial: (assetId: string) => void;
  onOpenInteractivity: (assetId: string) => void;
  projectKind: VisualProjectKind;
  onAddComponent: (definitionId: string) => void;
  onUpdateXriftComponent: (
    componentId: string,
    patch: UpdateXriftComponentPatch,
  ) => void;
  onRemoveXriftComponent: (componentId: string) => void;
  prefabSource?: PrefabSourceContext;
  onUpdatePrefab: (prefabId: string) => void;
  /** Declarations read from each Script Asset's source. */
  scriptContracts?: Readonly<Record<string, ScriptContract>>;
  scriptEntityOptions?: readonly ScriptEntityOption[];
  onUpdateScriptComponent?: (
    entityId: string,
    componentId: string,
    patch: ScriptComponentPatch,
  ) => void;
  onOpenScript?: (scriptAssetId: string) => void;
  onUpdateInteractionTrigger?: (
    componentId: string,
    patch: InteractionTriggerPatch,
  ) => void;
}) {
  const transform = getTransform(entity);
  // Trigger targets follow the Scene, so an Entity renamed or added while the
  // Inspector is open shows up in the summary without reopening it.
  const interactionTriggerTargets = useMemo(
    () => collectInteractionTriggerTargets(scene, assets),
    // The Animation row is derived from the Model's clips, not from a
    // Component, so the manifest belongs in the dependencies.
    [scene, assets],
  );
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [addComponentSearchQuery, setAddComponentSearchQuery] = useState("");
  const addComponentSearchInputRef = useRef<HTMLInputElement>(null);
  const [scaleLinked, setScaleLinked] = useState(true);
  const registeredComponents = entity.components as RegisteredSceneComponent[];
  const liveRuntimeTuning = readOnly && playMode;
  const addComponentSearchTerms = addComponentSearchQuery
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const searchingComponents = addComponentSearchTerms.length > 0;
  const matchesComponentSearch = (...values: Array<string | undefined>) => {
    if (!searchingComponents) return true;
    const text = values
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLocaleLowerCase();
    return addComponentSearchTerms.every((term) => text.includes(term));
  };
  const componentSearchResultCount =
    getEditorComponentMenuDefinitions(projectKind).filter((definition) =>
      matchesComponentSearch(
        definition.label,
        definition.id,
        definition.category,
        "component",
      ),
    ).length +
    getXriftComponentMenuGroups(projectKind).flatMap((group) =>
      group.components.filter((definition) =>
        matchesComponentSearch(
          definition.label,
          definition.description,
          definition.schemaId,
          definition.importName,
          group.label,
          "xrift component",
        ),
      ),
    ).length;
  useEffect(() => {
    if (addComponentOpen) addComponentSearchInputRef.current?.focus();
  }, [addComponentOpen]);
  const disabledAncestor = (() => {
    const visited = new Set<string>([entity.id]);
    let parentId = entity.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = scene.entities[parentId];
      if (!parent) return undefined;
      if (!parent.enabled) return parent;
      parentId = parent.parentId;
    }
    return undefined;
  })();
  const effectivelyEnabled = entity.enabled && !disabledAncestor;
  const rigidBodyOwner = findEnabledRigidBodyOwner(scene, entity);
  const rigidBodyDescendants = countRigidBodyDescendants(scene, entity.id);

  return (
    <div className="space-y-3">
      <section className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2">
        <input
          type="checkbox"
          checked={entity.enabled}
          disabled={readOnly && !liveRuntimeTuning}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          aria-label={`${entity.name}のEnabled`}
          title={
            disabledAncestor && entity.enabled
              ? `自身はEnabledですが、親Entity「${disabledAncestor.name}」が無効なため表示されません`
              : entity.enabled
                ? "Entityと子Entityを無効にする"
                : "Entityを有効にする。親が無効な場合は親の状態を継承します"
          }
          className="h-4 w-4 shrink-0 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <EntityNameField
          entity={entity}
          disabled={readOnly && !liveRuntimeTuning}
          compact
          onRename={onRename}
        />
        {!effectivelyEnabled && entity.enabled && disabledAncestor ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-amber-600"
            title={`親Entity「${disabledAncestor.name}」が無効なため非表示です`}
            aria-label={`親Entity「${disabledAncestor.name}」が無効なため非表示`}
          >
            <EDITOR_ICONS.hidden size={14} aria-hidden="true" />
          </span>
        ) : null}
        {liveRuntimeTuning ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-violet-600"
            title="Play中も保存されます。Script propertyは次のフレーム、構造変更は対象Entityだけへ反映します"
            aria-label="Play中のEntity調整"
          >
            <EDITOR_ICONS.play size={13} aria-hidden="true" />
          </span>
        ) : null}
      </section>

      {prefabSource ? (
        <section
          className="flex h-9 items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2"
          title={`編集元Prefab: ${prefabSource.name}`}
        >
          <EDITOR_ICONS.prefab
            size={14}
            className="shrink-0 text-violet-600"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
            {prefabSource.name}
          </span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onUpdatePrefab(prefabSource.prefabId)}
            aria-label={`${prefabSource.name}へ変更を反映`}
            title="現在のHierarchyと設定をPrefabへ反映"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-violet-100 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <EDITOR_ICONS.refresh size={13} aria-hidden="true" />
          </button>
        </section>
      ) : null}

      {transform ? (
        <ComponentCard title="Transform" subtitle="Local">
          <VectorEditor
            label="Position"
            value={transform.position}
            valueKind="position"
            disabled={readOnly && !liveRuntimeTuning}
            onChange={(position) => onTransformChange({ position })}
            onScrubStart={onTransformScrubStart}
            onScrubChange={(position) => onTransformScrubChange({ position })}
            onScrubEnd={onTransformScrubEnd}
            onScrubCancel={onTransformScrubCancel}
          />
          <VectorEditor
            label="Rotation"
            value={transform.rotation}
            valueKind="rotation"
            disabled={readOnly && !liveRuntimeTuning}
            onChange={(rotation) => onTransformChange({ rotation })}
            onScrubStart={onTransformScrubStart}
            onScrubChange={(rotation) => onTransformScrubChange({ rotation })}
            onScrubEnd={onTransformScrubEnd}
            onScrubCancel={onTransformScrubCancel}
          />
          <VectorEditor
            label="Scale"
            value={transform.scale}
            valueKind="scale"
            disabled={readOnly && !liveRuntimeTuning}
            scaleLinked={scaleLinked}
            onScaleLinkedChange={setScaleLinked}
            onChange={(scale) => onTransformChange({ scale })}
            onScrubStart={onTransformScrubStart}
            onScrubChange={(scale) => onTransformScrubChange({ scale })}
            onScrubEnd={onTransformScrubEnd}
            onScrubCancel={onTransformScrubCancel}
          />
        </ComponentCard>
      ) : null}

      {entity.modelNode ? (
        <ModelNodeInspector
          entity={entity}
          scene={scene}
          assets={assets}
          projectPath={projectPath}
          readOnly={readOnly}
          onMeshChange={onModelNodeMeshChange}
          onOpenMaterial={onOpenMaterial}
        />
      ) : null}

      {entity.components.map((component) => {
        if (component.type === "transform") return null;
        if (component.type === "mesh") {
          return (
            <MeshInspector
              key={component.id}
              component={component}
              assets={assets}
              projectPath={projectPath}
              readOnly={readOnly}
              onChange={(patch) => onMeshChange(component.id, patch)}
              onTerrainBrush={(operation) =>
                onTerrainBrush(component.id, operation)
              }
              onGrassLayersChange={(grass, notice) =>
                onTerrainGrassLayersChange(component.id, grass, notice)
              }
              onTerrainSettings={(options) => onTerrainSettings(component.id, options)}
              onTerrainEditingChange={(editing) =>
                onTerrainEditingChange(
                  editing ? { ...editing, componentId: component.id } : null,
                )
              }
              terrainSceneEditing={
                terrainSceneEditing?.componentId === component.id
                  ? terrainSceneEditing
                  : null
              }
              onApplyTerrainSurface={(entry, values) =>
                onApplyTerrainSurface(component.id, entry, values)
              }
              onOpenMaterial={onOpenMaterial}
              onRemove={() => onRemoveComponent(component.id)}
            />
          );
        }
        if (component.type === "rigid-body") {
          return (
            <RigidBodyInspector
              key={component.id}
              component={component}
              descendantColliderCount={rigidBodyDescendants.colliderCount}
              descendantMeshCount={rigidBodyDescendants.meshCount}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onRigidBodyChange(component.id, patch)}
              onRemove={() => onRemoveRigidBody(component.id)}
            />
          );
        }
        if (component.type === "collider") {
          return (
            <ColliderInspector
              key={component.id}
              component={component}
              entityScale={transform?.scale ?? [1, 1, 1]}
              bodyOwner={rigidBodyOwner}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onColliderChange(component.id, patch)}
              onAutoFit={() => onAutoFitCollider(component.id)}
              onRemove={() => onRemoveCollider(component.id)}
            />
          );
        }
        if (component.type === "light") {
          return (
            <LightInspector
              key={component.id}
              component={component}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onLightChange(component.id, patch)}
              onRemove={() => onRemoveComponent(component.id)}
            />
          );
        }
        if (component.type === "text") {
          return (
            <TextInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onTextChange(component.id, patch)}
              onOpenAsset={onOpenMaterial}
              onRemove={() => onRemoveComponent(component.id)}
            />
          );
        }
        if (component.type === "audio-source") {
          return (
            <AudioSourceInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onAudioSourceChange(component.id, patch)}
              onOpenAsset={onOpenMaterial}
              onRemove={() => onRemoveComponent(component.id)}
            />
          );
        }
        if (component.type === "vegetation-wind") {
          return (
            <VegetationWindInspector
              key={component.id}
              component={component}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) => onVegetationWindChange(component.id, patch)}
              onRemove={() => onRemoveComponent(component.id)}
            />
          );
        }
        if (component.type === "particle-emitter") {
          return (
            <ParticleEmitterInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly && !liveRuntimeTuning}
              onChange={(patch) =>
                onParticleEmitterChange(component.id, patch)
              }
              onOpenAsset={onOpenMaterial}
              onRemove={() => onRemoveParticleEmitter(component.id)}
            />
          );
        }
        if (component.type === "spawn-point") {
          return (
            <ComponentCard
              key={component.id}
              title="Spawn Point"
              subtitle={component.target}
              remove={{
                label: "Spawn Pointを削除",
                disabled: readOnly && !liveRuntimeTuning,
                onRemove: () => onRemoveComponent(component.id),
              }}
            >
              <p className="text-xs leading-4 text-slate-600">
                Play開始位置の基準点です。Play中の移動結果はシーンに保存されません。
              </p>
            </ComponentCard>
          );
        }
        if (component.type === "interaction-trigger") {
          const graphAsset = assets.assets[component.interactivityAssetId];
          return (
            <ComponentCard
              key={component.id}
              title="Interaction Trigger"
              subtitle={graphAsset?.name ?? "未設定"}
              remove={{
                label: "Interaction Triggerを削除",
                disabled: readOnly && !liveRuntimeTuning,
                onRemove: () => onRemoveComponent(component.id),
              }}
            >
              <InteractionTriggerInspector
                component={component}
                entity={entity}
                assets={assets}
                targets={interactionTriggerTargets}
                readOnly={readOnly}
                onPatch={(patch) =>
                  onUpdateInteractionTrigger?.(component.id, patch)
                }
                onOpenGraph={onOpenInteractivity}
                onAddInteractable={() =>
                  onAddComponent(XRIFT_COMPONENT_SCHEMA_IDS.interactable)
                }
              />
            </ComponentCard>
          );
        }
        if (component.type === "script") {
          const scriptAsset = assets.assets[component.scriptAssetId];
          return (
            <ComponentCard
              key={component.id}
              title="Script"
              subtitle={scriptAsset?.name ?? "未設定"}
              remove={{
                label: "Scriptを削除",
                disabled: readOnly && !liveRuntimeTuning,
                onRemove: () => onRemoveComponent(component.id),
              }}
            >
              <ScriptComponentInspector
                component={component}
                contract={scriptContracts?.[component.scriptAssetId] ?? null}
                assets={assets}
                entities={scriptEntityOptions ?? []}
                readOnly={readOnly}
                liveTuning={liveRuntimeTuning}
                onPatch={(patch) =>
                  onUpdateScriptComponent?.(entity.id, component.id, patch)
                }
                onOpenScript={(assetId) => onOpenScript?.(assetId)}
              />
            </ComponentCard>
          );
        }
        // Inspectorに編集UIを持たないComponentも、カードだけは出して外せる
        // ようにする。廃止されたAnimation Componentのように、表示されないまま
        // Entityに残り続けるものを作らない。prefab-instanceとxrift-componentは
        // 後続のブロックが描くので、ここでは触らない。
        if (
          component.type === "prefab-instance" ||
          component.type === "xrift-component"
        ) {
          return null;
        }
        return (
          <ComponentCard
            key={component.id}
            title={UNSUPPORTED_COMPONENT_LABELS[component.type] ?? component.type}
            subtitle="Inspector未対応"
            remove={{
              label: `${
                UNSUPPORTED_COMPONENT_LABELS[component.type] ?? component.type
              }を削除`,
              disabled: readOnly && !liveRuntimeTuning,
              onRemove: () => onRemoveComponent(component.id),
            }}
          >
            <p className="text-xs leading-4 text-slate-600">
              {component.type === "animation"
                ? "Animation Componentは廃止されました。clipの再生はInteractivity Graphのanimation/startノードで行います。プロジェクトを開き直すと自動で変換されますが、ここから削除もできます。"
                : "このComponentはInspectorで編集できません。不要であれば削除できます。"}
            </p>
          </ComponentCard>
        );
      })}

      {registeredComponents
        .filter(
          (component) => component.type === "prefab-instance",
        )
        .map((component) => (
          <ComponentCard
            key={component.id}
            title="Prefab Instance"
            subtitle={component.type}
            remove={{
              label: "Prefab Instanceを削除",
              disabled: readOnly && !liveRuntimeTuning,
              onRemove: () => onRemoveComponent(component.id),
            }}
          >
            <p className="text-xs leading-4 text-slate-600">
              コンポーネント設定はシーンと一緒に保存されます。
            </p>
          </ComponentCard>
        ))}

      {registeredComponents
        .filter((component) => component.type === "xrift-component")
        .map((component) => (
          <XRiftComponentInspector
            key={component.id}
            component={component}
            readOnly={readOnly && !liveRuntimeTuning}
            onPropertyChange={(name: string, value: JsonValue | undefined) =>
              onUpdateXriftComponent(component.id, {
                properties: { [name]: value },
              })
            }
            onEnabledChange={(enabled) =>
              onUpdateXriftComponent(component.id, { enabled })
            }
            onRemove={() => onRemoveXriftComponent(component.id)}
          />
        ))}

      <div className="relative">
        <button
          type="button"
          disabled={readOnly && !playMode}
          aria-expanded={addComponentOpen}
          onClick={() => {
            setAddComponentOpen((open) => !open);
            if (addComponentOpen) setAddComponentSearchQuery("");
          }}
          className="w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-45"
        >
          Add Component
        </button>
        {addComponentOpen ? (
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto rounded-md border border-slate-300 bg-white p-1 shadow-lg">
            <label className="relative block px-1 pb-1">
              <span className="sr-only">追加するComponentを検索</span>
              <input
                ref={addComponentSearchInputRef}
                type="search"
                value={addComponentSearchQuery}
                onChange={(event) => setAddComponentSearchQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !addComponentSearchQuery) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setAddComponentSearchQuery("");
                }}
                placeholder="Componentを検索…"
                className="h-8 w-full rounded border border-slate-300 bg-white px-2 pr-14 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              {searchingComponents ? (
                <button
                  type="button"
                  onClick={() => setAddComponentSearchQuery("")}
                  className="absolute right-2 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Componentの検索をクリア"
                >
                  クリア
                </button>
              ) : null}
            </label>
            {searchingComponents && componentSearchResultCount === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-5 text-slate-500">
                「{addComponentSearchQuery.trim()}」に一致するComponentはありません。
              </p>
            ) : null}
            {EDITOR_COMPONENT_CATEGORY_ORDER.map(
              (category) => {
                const definitions = getEditorComponentMenuDefinitions(
                  projectKind,
                ).filter(
                  (definition) =>
                    definition.category === category &&
                    matchesComponentSearch(
                      definition.label,
                      definition.id,
                      definition.category,
                      "component",
                    ),
                );
                if (definitions.length === 0) return null;
                return (
                  <details
                    key={category}
                    open={searchingComponents || category === "rendering"}
                    className="overflow-hidden rounded border border-slate-200"
                  >
                    <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold capitalize text-slate-600 hover:bg-slate-100">
                      {category} <span className="text-slate-400">({definitions.length})</span>
                    </summary>
                    <div className="space-y-0.5 border-t border-slate-100 p-1">
                    {definitions.map((definition) => {
                      const DefinitionIcon = getEditorComponentIcon(definition);
                      const duplicate =
                        !definition.allowMultiple &&
                        registeredComponents.some((component) =>
                          definition.componentType === "builtin-mesh"
                            ? component.type === "mesh"
                            : component.type === definition.componentType,
                        );
                      return (
                        <button
                          key={definition.id}
                          type="button"
                          disabled={duplicate}
                          onClick={() => {
                            onAddComponent(definition.id);
                            setAddComponentOpen(false);
                            setAddComponentSearchQuery("");
                          }}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{definition.label}</span>
                          </span>
                          {duplicate ? <span className="text-xs">追加済み</span> : null}
                        </button>
                      );
                    })}
                    </div>
                  </details>
                );
              },
            )}
            {getXriftComponentMenuGroups(projectKind).map((group) => {
              const definitions = group.components.filter((definition) =>
                matchesComponentSearch(
                  definition.label,
                  definition.description,
                  definition.schemaId,
                  definition.importName,
                  group.label,
                  "xrift component",
                ),
              );
              if (definitions.length === 0) return null;
              return (
                <details
                  key={`xrift-${group.category}`}
                  open={searchingComponents}
                  className="overflow-hidden rounded border border-slate-200"
                >
                  <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    XRift {group.label} <span className="text-slate-400">({definitions.length})</span>
                  </summary>
                  <div className="space-y-0.5 border-t border-slate-100 p-1">
                  {definitions.map((definition) => {
                    const DefinitionIcon = EDITOR_ICONS[definition.icon];
                    const duplicate =
                      !definition.allowMultiplePerEntity &&
                      registeredComponents.some(
                        (component) =>
                          component.type === "xrift-component" &&
                          component.schemaId === definition.schemaId,
                      );
                    return (
                      <button
                        key={definition.schemaId}
                        type="button"
                        disabled={duplicate}
                        onClick={() => {
                          onAddComponent(definition.schemaId);
                          setAddComponentOpen(false);
                          setAddComponentSearchQuery("");
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{definition.label}</span>
                        </span>
                        {duplicate ? <span className="text-xs">追加済み</span> : null}
                      </button>
                    );
                  })}
                  </div>
                </details>
              );
            })}
          </div>
        ) : null}
      </div>

    </div>
  );
}

export function InspectorPanel({
  scene,
  assets,
  metadata,
  projectPath,
  selectedEntityId,
  selectedAssetId,
  selectedEntityIds,
  selectedAssetIds,
  readOnly,
  playMode = false,
  onRenameEntity,
  onEntityEnabledChange,
  onTransformChange,
  onTransformScrubStart,
  onTransformScrubChange,
  onTransformScrubEnd,
  onTransformScrubCancel,
  onMeshChange,
  onTerrainBrush,
  onTerrainGrassLayersChange,
  onTerrainSettings,
  onTerrainEditingChange,
  terrainSceneEditing = null,
  onApplyTerrainSurface,
  onColliderChange,
  onRigidBodyChange,
  onAutoFitCollider,
  onRemoveCollider,
  onRemoveRigidBody,
  onRemoveComponent,
  onLightChange,
  onTextChange,
  onVegetationWindChange,
  onAudioSourceChange,
  onSelectAsset,
  onOpenInteractivity,
  scriptContracts,
  scriptEntityOptions,
  onUpdateScriptComponent,
  onUpdateInteractionTrigger,
  onOpenScript,
  onOpenShader,
  onOpenMaterialShader,
  onAssignShaderAsset,
  onCloseAsset,
  onMaterialChange,
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
  textureBatchState,
  onApplyTextureBatch,
  onParticleEmitterChange,
  onRemoveParticleEmitter,
  projectKind,
  onAddComponent,
  onUpdateXriftComponent,
  onRemoveXriftComponent,
  sceneSettingsOpen,
  onCloseSceneSettings,
  onSceneSettingsChange,
  onProjectMetadataChange,
  onThumbnailChanged,
  prefabs,
  onSelectPrefabSourceEntity,
  onUpdatePrefab,
  onSetEntitiesEnabled,
  onSetMeshShadow,
  onSetLightShadow,
  onApplyMaterialPatch,
}: {
  scene: SceneDocument;
  assets: AssetManifest;
  metadata: VisualProjectMetadata;
  projectPath?: string;
  selectedEntityId: string | null;
  selectedAssetId: string | null;
  selectedEntityIds: readonly string[];
  selectedAssetIds: readonly string[];
  readOnly: boolean;
  playMode?: boolean;
  onRenameEntity: (entityId: string, name: string) => void;
  onEntityEnabledChange: (entityId: string, enabled: boolean) => void;
  onTransformChange: (entityId: string, patch: TransformPatch) => void;
  onTransformScrubStart: (entityId: string) => void;
  onTransformScrubChange: (entityId: string, patch: TransformPatch) => void;
  onTransformScrubEnd: (entityId: string) => void;
  onTransformScrubCancel: (entityId: string) => void;
  onMeshChange: (entityId: string, componentId: string, patch: MeshInspectorPatch) => void;
  onTerrainBrush: (
    entityId: string,
    componentId: string,
    operation: TerrainSceneBrushOperation,
  ) => void;
  onTerrainGrassLayersChange: (
    entityId: string,
    componentId: string,
    grass: TerrainGrassLayer[],
    notice: string,
  ) => void;
  onTerrainSettings: (
    entityId: string,
    componentId: string,
    options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
  ) => void;
  onTerrainEditingChange: (editing: TerrainViewportEditing | null) => void;
  terrainSceneEditing?: TerrainViewportEditing | null;
  onApplyTerrainSurface: (
    entityId: string,
    componentId: string,
    entry: TerrainSurfaceCatalogEntry,
    values: Record<string, number | string>,
  ) => void;
  onColliderChange: (entityId: string, componentId: string, patch: ColliderPatch) => void;
  onRigidBodyChange: (
    entityId: string,
    componentId: string,
    patch: RigidBodyPatch,
  ) => void;
  onAutoFitCollider: (entityId: string, componentId: string) => void;
  onRemoveCollider: (entityId: string, componentId: string) => void;
  onRemoveRigidBody: (entityId: string, componentId: string) => void;
  onRemoveComponent: (entityId: string, componentId: string) => void;
  onLightChange: (entityId: string, componentId: string, patch: LightPatch) => void;
  onTextChange: (entityId: string, componentId: string, patch: TextPatch) => void;
  onVegetationWindChange: (
    entityId: string,
    componentId: string,
    patch: VegetationWindPatch,
  ) => void;
  onAudioSourceChange: (entityId: string, componentId: string, patch: AudioSourcePatch) => void;
  onSelectAsset: (assetId: string) => void;
  onOpenInteractivity: (assetId: string) => void;
  scriptContracts?: Readonly<Record<string, ScriptContract>>;
  scriptEntityOptions?: readonly ScriptEntityOption[];
  onUpdateScriptComponent?: (
    entityId: string,
    componentId: string,
    patch: ScriptComponentPatch,
  ) => void;
  onOpenScript?: (scriptAssetId: string) => void;
  onUpdateInteractionTrigger?: (
    entityId: string,
    componentId: string,
    patch: InteractionTriggerPatch,
  ) => void;
  onOpenShader: (shaderAssetId: string) => void;
  onOpenMaterialShader: (
    materialAssetId: string,
    stage: import("../../lib/visual-editor").ShaderAssetStage,
  ) => void;
  onAssignShaderAsset: (
    materialAssetId: string,
    stage: import("../../lib/visual-editor").ShaderAssetStage,
    shaderAssetId: string | null,
  ) => void;
  onCloseAsset: () => void;
  onMaterialChange: (assetId: string, patch: MaterialAssetPatch) => void;
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
  onCreateTextureCard: (
    textureAssetId: string,
    profile: TextureCardProfile,
  ) => void;
  textureProcessingState?: TextureProcessingState;
  onApplyTextureProcessing?: (assetId: string) => void;
  onRevertTextureProcessing?: (assetId: string) => void;
  onRevertModelOptimization?: (assetId: string) => void;
  textureBatchState?: TextureProcessingState;
  onApplyTextureBatch?: (assetIds: readonly string[]) => void;
  onParticleEmitterChange: (
    entityId: string,
    componentId: string,
    patch: ParticleEmitterInspectorPatch,
  ) => void;
  onRemoveParticleEmitter: (entityId: string, componentId: string) => void;
  projectKind: VisualProjectKind;
  onAddComponent: (entityId: string, definitionId: string) => void;
  onUpdateXriftComponent: (
    entityId: string,
    componentId: string,
    patch: UpdateXriftComponentPatch,
  ) => void;
  onRemoveXriftComponent: (entityId: string, componentId: string) => void;
  /** The right inspector can temporarily present scene-wide settings. */
  sceneSettingsOpen: boolean;
  onCloseSceneSettings: () => void;
  onSceneSettingsChange: (settings: SceneSettings) => void;
  onProjectMetadataChange: (
    metadata: Pick<VisualProjectMetadata, "title" | "description">,
  ) => void;
  onThumbnailChanged: () => void;
  prefabs: Readonly<Record<string, PrefabDocument>>;
  onSelectPrefabSourceEntity: (entityId: string) => void;
  onUpdatePrefab: (prefabId: string) => void;
  onSetEntitiesEnabled: (enabled: boolean) => void;
  onSetMeshShadow: (patch: Pick<MeshInspectorPatch, "castShadow" | "receiveShadow">) => void;
  onSetLightShadow: (castShadow: boolean) => void;
  onApplyMaterialPatch: (patch: MaterialAssetPatch) => void;
}) {
  const entity = selectedEntityId ? scene.entities[selectedEntityId] : undefined;
  const asset = selectedAssetId ? assets.assets[selectedAssetId] : undefined;
  const prefabSource = entity
    ? findPrefabSourceContext(scene, prefabs, entity.id)
    : undefined;
  const materialReferenceSummary =
    asset?.kind === "material"
      ? countMaterialSceneReferences(scene, assets, asset.id)
      : undefined;
  const xriftDefinition = entity?.components
    .filter((component) => component.type === "xrift-component")
    .map((component) => getXriftComponentDefinition(component.schemaId))
    .find((definition) => definition !== undefined);
  const EntityIcon = entity?.components.some((component) => component.type === "light")
    ? EDITOR_ICONS.light
    : entity?.components.some((component) => component.type === "audio-source")
      ? EDITOR_ICONS.audio
    : entity?.components.some((component) => component.type === "particle-emitter")
      ? EDITOR_ICONS.particle
      : xriftDefinition
        ? EDITOR_ICONS[xriftDefinition.icon]
        : EDITOR_ICONS.sceneEntity;
  const InspectorIcon = sceneSettingsOpen ? EDITOR_ICONS.settings : EntityIcon;
  const multiSelectionActive =
    !sceneSettingsOpen && (selectedEntityIds.length > 1 || selectedAssetIds.length > 1);
  const inspectorContextLabel = sceneSettingsOpen
    ? scene.name
    : multiSelectionActive
      ? `${Math.max(selectedEntityIds.length, selectedAssetIds.length)}件を選択`
      : asset?.name ?? (entity ? null : "未選択");

  return (
    <aside className="row-span-2 flex min-h-0 flex-col border-l border-editor-border bg-editor-canvas" aria-labelledby="inspector-heading">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-editor-border bg-editor-surface px-3">
        <div className="flex items-center gap-2">
          <InspectorIcon size={14} className="text-editor-muted" aria-hidden="true" />
          <h2 id="inspector-heading" className="text-[13px] font-semibold text-editor-text">
            Inspector
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {sceneSettingsOpen ? (
            <button
              type="button"
              onClick={onCloseSceneSettings}
              aria-label="前のInspectorへ戻る"
              title="前のInspectorへ戻る"
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            >
              <EDITOR_ICONS.back size={13} aria-hidden="true" />
            </button>
          ) : asset && entity ? (
            <button
              type="button"
              onClick={onCloseAsset}
              aria-label={`${entity.name}のInspectorへ戻る`}
              title={commandTitle(`${entity.name}のEntity Inspectorへ戻る`, "ShowEntityInspector")}
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            >
              <EDITOR_ICONS.sceneEntity size={13} aria-hidden="true" />
            </button>
          ) : null}
          {inspectorContextLabel ? (
            <span className="max-w-28 truncate text-xs text-slate-500">
              {inspectorContextLabel}
            </span>
          ) : null}
        </div>
      </div>
      {readOnly ? (
        <div className="border-b border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-4 text-violet-800">
          {playMode
            ? "Play Windowは分離された実行コピーです。Entityの構成と許可された設定は実行中のSceneへ即時反映されます。"
            : "シーンとアセット設定は閲覧のみです。"}
        </div>
      ) : null}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {sceneSettingsOpen ? (
          <SceneSettingsInspector
            scene={scene}
            assets={assets}
            metadata={metadata}
            projectKind={projectKind}
            projectPath={projectPath}
            readOnly={readOnly}
            onChange={onSceneSettingsChange}
            onMetadataChange={onProjectMetadataChange}
            onThumbnailChanged={onThumbnailChanged}
            onOpenAsset={onSelectAsset}
          />
        ) : multiSelectionActive ? (
          <MultiSelectionInspector
            scene={scene}
            assets={assets}
            selectedEntityIds={selectedEntityIds}
            selectedAssetIds={selectedAssetIds}
            readOnly={readOnly}
            textureBatchState={textureBatchState}
            onSetEntitiesEnabled={onSetEntitiesEnabled}
            onSetMeshShadow={onSetMeshShadow}
            onSetLightShadow={onSetLightShadow}
            onApplyMaterialPatch={onApplyMaterialPatch}
            onApplyTextureBatch={onApplyTextureBatch}
          />
        ) : asset ? (
          <div className="space-y-3">
            {asset.attribution ? (
              <section className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs leading-5 text-slate-600" aria-label="外部アセットのクレジット">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p><span className="font-semibold text-slate-800">{asset.attribution.providerName}</span> から追加</p>
                    <p>作者: {asset.attribution.authors.join("、") || "contributors"}</p>
                  </div>
                  <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">{asset.attribution.licenseName}</span>
                </div>
                <div className="mt-1 flex gap-3">
                  <button type="button" onClick={() => void tauri.openUrl(asset.attribution!.assetUrl)} className="font-semibold text-brand-700 hover:underline">配布ページを開く</button>
                  <button type="button" onClick={() => void tauri.openUrl(asset.attribution!.licenseUrl)} className="font-semibold text-brand-700 hover:underline">ライセンスを確認</button>
                </div>
              </section>
            ) : null}
            <AssetQuickEditor
              asset={asset}
              assets={assets}
              projectPath={projectPath}
              referenceSummary={materialReferenceSummary}
              readOnly={
                readOnly &&
                !(playMode && (asset.kind === "material" || asset.kind === "particle"))
              }
              onSelectAsset={onSelectAsset}
              onMaterialChange={onMaterialChange}
              onOpenShader={onOpenShader}
              onOpenMaterialShader={onOpenMaterialShader}
              onAssignShaderAsset={onAssignShaderAsset}
              onModelChange={onModelChange}
              onReimportModel={onReimportModel}
              onCreateModelAnimationGraph={onCreateModelAnimationGraph}
              modelReimportState={modelReimportState}
              modelReimportImpactNotice={modelReimportImpactNotice}
              modelOptimizationState={modelOptimizationState}
              onApplyModelOptimization={onApplyModelOptimization}
              onParticleChange={onParticleChange}
              onTextureChange={onTextureChange}
              onCreateTextureCard={onCreateTextureCard}
              textureProcessingState={textureProcessingState}
              onApplyTextureProcessing={onApplyTextureProcessing}
              onRevertTextureProcessing={onRevertTextureProcessing}
              onRevertModelOptimization={onRevertModelOptimization}
              prefabs={prefabs}
              onSelectPrefabSourceEntity={onSelectPrefabSourceEntity}
              onUpdatePrefab={onUpdatePrefab}
            />
          </div>
        ) : entity ? (
          <EntityInspector
            entity={entity}
            scene={scene}
            assets={assets}
            projectPath={projectPath}
            readOnly={readOnly}
            playMode={playMode}
            onEnabledChange={(enabled) =>
              onEntityEnabledChange(entity.id, enabled)
            }
            onRename={(name) => onRenameEntity(entity.id, name)}
            onTransformChange={(patch) => onTransformChange(entity.id, patch)}
            onTransformScrubStart={() => onTransformScrubStart(entity.id)}
            onTransformScrubChange={(patch) =>
              onTransformScrubChange(entity.id, patch)
            }
            onTransformScrubEnd={() => onTransformScrubEnd(entity.id)}
            onTransformScrubCancel={() => onTransformScrubCancel(entity.id)}
            onMeshChange={(componentId, patch) => onMeshChange(entity.id, componentId, patch)}
            onTerrainBrush={(componentId, operation) =>
              onTerrainBrush(entity.id, componentId, operation)
            }
            onTerrainGrassLayersChange={(componentId, grass, notice) =>
              onTerrainGrassLayersChange(entity.id, componentId, grass, notice)
            }
            terrainSceneEditing={
              terrainSceneEditing?.entityId === entity.id
                ? terrainSceneEditing
                : null
            }
            onApplyTerrainSurface={(componentId, entry, values) =>
              onApplyTerrainSurface(entity.id, componentId, entry, values)
            }
            onTerrainSettings={(componentId, options) =>
              onTerrainSettings(entity.id, componentId, options)
            }
            onTerrainEditingChange={(editing) =>
              onTerrainEditingChange(
                editing ? { ...editing, entityId: entity.id } : null,
              )
            }
            onModelNodeMeshChange={onMeshChange}
            onColliderChange={(componentId, patch) =>
              onColliderChange(entity.id, componentId, patch)
            }
            onRigidBodyChange={(componentId, patch) =>
              onRigidBodyChange(entity.id, componentId, patch)
            }
            onAutoFitCollider={(componentId) =>
              onAutoFitCollider(entity.id, componentId)
            }
            onRemoveCollider={(componentId) =>
              onRemoveCollider(entity.id, componentId)
            }
            onRemoveRigidBody={(componentId) =>
              onRemoveRigidBody(entity.id, componentId)
            }
            onRemoveComponent={(componentId) =>
              onRemoveComponent(entity.id, componentId)
            }
            onLightChange={(componentId, patch) =>
              onLightChange(entity.id, componentId, patch)
            }
            onTextChange={(componentId, patch) =>
              onTextChange(entity.id, componentId, patch)
            }
            onVegetationWindChange={(componentId, patch) =>
              onVegetationWindChange(entity.id, componentId, patch)
            }
            onAudioSourceChange={(componentId, patch) =>
              onAudioSourceChange(entity.id, componentId, patch)
            }
            onParticleEmitterChange={(componentId, patch) =>
              onParticleEmitterChange(entity.id, componentId, patch)
            }
            onRemoveParticleEmitter={(componentId) =>
              onRemoveParticleEmitter(entity.id, componentId)
            }
            onOpenMaterial={onSelectAsset}
            onOpenInteractivity={onOpenInteractivity}
            {...(scriptContracts ? { scriptContracts } : {})}
            {...(scriptEntityOptions ? { scriptEntityOptions } : {})}
            {...(onUpdateScriptComponent ? { onUpdateScriptComponent } : {})}
            {...(onOpenScript ? { onOpenScript } : {})}
            {...(onUpdateInteractionTrigger
              ? {
                  onUpdateInteractionTrigger: (
                    componentId: string,
                    patch: InteractionTriggerPatch,
                  ) => onUpdateInteractionTrigger(entity.id, componentId, patch),
                }
              : {})}
            projectKind={projectKind}
            onAddComponent={(definitionId) =>
              onAddComponent(entity.id, definitionId)
            }
            onUpdateXriftComponent={(componentId, patch) =>
              onUpdateXriftComponent(entity.id, componentId, patch)
            }
            onRemoveXriftComponent={(componentId) =>
              onRemoveXriftComponent(entity.id, componentId)
            }
            prefabSource={prefabSource}
            onUpdatePrefab={onUpdatePrefab}
          />
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs leading-5 text-slate-500">
            HierarchyまたはScene ViewでEntityを選択してください。<br />
            下のAssetsでアセットを選ぶとAsset Inspectorへ切り替わります。
          </div>
        )}
      </div>
    </aside>
  );
}

function countMaterialSceneReferences(
  scene: SceneDocument,
  assets: AssetManifest,
  materialAssetId: string,
): { entityCount: number; slotCount: number } {
  const entityIds = new Set<string>();
  let slotCount = 0;
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      const slots = getMeshMaterialSlots(component, assets);
      for (const slot of slots) {
        const binding = component.materialBindings.find(
          (candidate) => candidate.slot === slot.slot,
        );
        const assignedId = binding?.materialAssetId ?? slot.defaultMaterialAssetId;
        if (assignedId !== materialAssetId) continue;
        slotCount += 1;
        entityIds.add(entity.id);
      }
    }
  }
  return { entityCount: entityIds.size, slotCount };
}
