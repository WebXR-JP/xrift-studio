import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link2 } from "lucide-react";
import {
  getGeometryAsset,
  getBuiltinPrimitiveCreation,
  getMaterialAsset,
  getMeshMaterialSlots,
  getTransform,
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
  type MaterialAssetPatch,
  type ModelAssetPatch,
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
  type TextureAssetPatch,
  type TransformPatch,
  type UpdateXriftComponentPatch,
  type Vec3,
  type VisualProjectKind,
  type RegisteredSceneComponent,
} from "../../lib/visual-editor";
import { AssetQuickEditor } from "./AssetQuickEditor";
import type {
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
    "materialBindings" | "castShadow" | "receiveShadow" | "modelPose"
  >
>;

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

function ComponentCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        <span className="flex items-center gap-1.5">
          {subtitle ? <span className="text-xs text-slate-400">{subtitle}</span> : null}
          {actions}
        </span>
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

function EntityNameField({
  entity,
  disabled,
  onRename,
}: {
  entity: SceneEntity;
  disabled: boolean;
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
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Entity name
      </span>
      <input
        type="text"
        value={draftName}
        disabled={disabled}
        onChange={(event) => setDraftName(event.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={handleKeyDown}
        className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-[12px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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

  const handleAxisPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: (typeof axes)[number],
    axisIndex: number,
  ) => {
    if (!scrubEnabled || disabled || event.button !== 0 || scrubRef.current) return;
    event.preventDefault();
    event.currentTarget.focus();
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
    const modifier = event.shiftKey ? 0.1 : event.ctrlKey || event.altKey ? 10 : 1;
    const axisValue =
      active.currentValue[active.axisIndex] +
      (event.clientX - active.clientX) *
        axisScrubSensitivity(valueKind) *
        modifier;
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
                  inputRefs.current[index]?.focus();
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
): MaterialBinding[] {
  const found = bindings.some((binding) => binding.slot === slot);
  if (!found) return [...bindings, { slot, materialAssetId }];
  return bindings.map((binding) =>
    binding.slot === slot ? { ...binding, materialAssetId } : binding,
  );
}

function draggedMaterialId(event: DragEvent<HTMLElement>): string | null {
  const value = readEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME);
  return value || null;
}

function MeshInspector({
  component,
  assets,
  readOnly,
  onChange,
  onOpenMaterial,
}: {
  component: MeshComponent;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: MeshInspectorPatch) => void;
  onOpenMaterial: (assetId: string) => void;
}) {
  const geometryAssetId =
    component.geometry?.kind === "asset"
      ? component.geometry.assetId
      : component.geometryAssetId;
  const geometry = getGeometryAsset(assets, geometryAssetId);
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
    <ComponentCard title="Mesh Renderer" subtitle="シーン">
      <dl className="grid grid-cols-[62px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">形状</dt>
        <dd className="truncate text-right font-medium text-slate-700">
          {geometry?.name ?? builtinDefinition?.name ?? `Missing: ${geometryAssetId}`}
        </dd>
        <dt className="text-slate-500">スロット</dt>
        <dd className="text-right text-slate-700">{slots.length}</dd>
      </dl>

      <div className="space-y-2 border-t border-slate-100 pt-2">
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-slate-600">
          マテリアル
        </h4>
        {slots.map((slot) => {
          const binding = component.materialBindings.find((candidate) => candidate.slot === slot.slot);
          const assignedId = binding?.materialAssetId ?? slot.defaultMaterialAssetId ?? "";
          const assigned = assignedId ? getMaterialAsset(assets, assignedId) : undefined;
          return (
            <div
              key={slot.slot}
              className="rounded border border-slate-200 bg-slate-50 p-2 transition-colors hover:border-violet-300"
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
                  ),
                });
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-600" title={slot.slot}>
                  {slot.name}
                </span>
                {slot.sourceMaterialIndex !== undefined ? (
                  <span className="text-xs text-slate-400">glTF #{slot.sourceMaterialIndex}</span>
                ) : null}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_58px] gap-1.5">
                <select
                  value={assignedId}
                  disabled={readOnly || materials.length === 0}
                  onChange={(event) =>
                    onChange({
                      materialBindings: replaceMaterialBinding(
                        component.materialBindings,
                        slot.slot,
                        event.currentTarget.value,
                      ),
                    })
                  }
                  className="h-7 min-w-0 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                  title={commandTitle("マテリアルをインスペクターで開く", "EditAssignedMaterial")}
                  className="h-7 rounded border border-violet-300 bg-violet-50 px-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  編集
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {assigned?.shader?.kind === "openbrush"
                  ? `${assigned.shader.brushName}をthree-icosa専用Materialとして設定済み`
                  : openBrush && !assigned
                    ? "source brushを使用中。ドロップするとXRift Materialで上書きします"
                    : openBrush
                      ? "通常のXRift MaterialでOpenBrush shaderを上書き中"
                      : "マテリアルをここへドロップ"}
              </p>
            </div>
          );
        })}
        {slots.length === 0 ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-4 text-amber-800">
            形状にマテリアルスロット情報がありません。インポート解析を確認してください。
          </p>
        ) : null}
      </div>

      {model ? (
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
  readOnly,
  onChange,
  onAutoFit,
  onRemove,
}: {
  component: ColliderComponent;
  entityScale: Vec3;
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

function LightInspector({
  component,
  readOnly,
  onChange,
}: {
  component: LightComponent;
  readOnly: boolean;
  onChange: (patch: LightPatch) => void;
}) {
  const supportsShadow = ["directional", "point", "spot"].includes(component.lightType);

  return (
    <ComponentCard title={LIGHT_LABELS[component.lightType]} subtitle="Three.js">
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
          {Object.entries(LIGHT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
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

function AudioSourceInspector({
  component,
  assets,
  readOnly,
  onChange,
  onOpenAsset,
}: {
  component: AudioSourceComponent;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: AudioSourcePatch) => void;
  onOpenAsset: (assetId: string) => void;
}) {
  const audioAssets = Object.values(assets.assets)
    .filter((asset) => asset.kind === "audio")
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedAudio = component.audioAssetId
    ? assets.assets[component.audioAssetId]
    : undefined;
  return (
    <ComponentCard title="Audio Source" subtitle="Three.js">
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
          AssetsのインポートからMP3を追加してください。
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
          label="Spatial"
          checked={component.spatial}
          disabled={readOnly}
          onChange={(spatial) => onChange({ spatial })}
        />
      </div>
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

function EntityInspector({
  entity,
  assets,
  readOnly,
  onRename,
  onTransformChange,
  onTransformScrubStart,
  onTransformScrubChange,
  onTransformScrubEnd,
  onTransformScrubCancel,
  onMeshChange,
  onColliderChange,
  onAutoFitCollider,
  onRemoveCollider,
  onLightChange,
  onAudioSourceChange,
  onParticleEmitterChange,
  onRemoveParticleEmitter,
  onOpenMaterial,
  projectKind,
  onAddComponent,
  onUpdateXriftComponent,
  onRemoveXriftComponent,
  prefabSource,
  onUpdatePrefab,
}: {
  entity: SceneEntity;
  assets: AssetManifest;
  readOnly: boolean;
  onRename: (name: string) => void;
  onTransformChange: (patch: TransformPatch) => void;
  onTransformScrubStart: () => void;
  onTransformScrubChange: (patch: TransformPatch) => void;
  onTransformScrubEnd: () => void;
  onTransformScrubCancel: () => void;
  onMeshChange: (componentId: string, patch: MeshInspectorPatch) => void;
  onColliderChange: (componentId: string, patch: ColliderPatch) => void;
  onAutoFitCollider: (componentId: string) => void;
  onRemoveCollider: (componentId: string) => void;
  onLightChange: (componentId: string, patch: LightPatch) => void;
  onAudioSourceChange: (componentId: string, patch: AudioSourcePatch) => void;
  onParticleEmitterChange: (
    componentId: string,
    patch: ParticleEmitterInspectorPatch,
  ) => void;
  onRemoveParticleEmitter: (componentId: string) => void;
  onOpenMaterial: (assetId: string) => void;
  projectKind: VisualProjectKind;
  onAddComponent: (definitionId: string) => void;
  onUpdateXriftComponent: (
    componentId: string,
    patch: UpdateXriftComponentPatch,
  ) => void;
  onRemoveXriftComponent: (componentId: string) => void;
  prefabSource?: PrefabSourceContext;
  onUpdatePrefab: (prefabId: string) => void;
}) {
  const transform = getTransform(entity);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [scaleLinked, setScaleLinked] = useState(true);
  const registeredComponents = entity.components as RegisteredSceneComponent[];

  return (
    <div className="space-y-3">
      <EntityNameField entity={entity} disabled={readOnly} onRename={onRename} />

      {prefabSource ? (
        <ComponentCard title="Prefab Source" subtitle={prefabSource.name}>
          <p className="text-xs leading-4 text-slate-600">
            このEntityを含むHierarchyがPrefabの編集元です。構造や値を変更した後、UpdateでPrefab documentへ反映します。
          </p>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onUpdatePrefab(prefabSource.prefabId)}
            className="w-full rounded border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-40"
          >
            PrefabをUpdate
          </button>
        </ComponentCard>
      ) : null}

      {transform ? (
        <ComponentCard title="Transform" subtitle="Local">
          <VectorEditor
            label="Position"
            value={transform.position}
            valueKind="position"
            disabled={readOnly}
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
            disabled={readOnly}
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
            disabled={readOnly}
            scaleLinked={scaleLinked}
            onScaleLinkedChange={setScaleLinked}
            onChange={(scale) => onTransformChange({ scale })}
            onScrubStart={onTransformScrubStart}
            onScrubChange={(scale) => onTransformScrubChange({ scale })}
            onScrubEnd={onTransformScrubEnd}
            onScrubCancel={onTransformScrubCancel}
          />
          <p className="text-xs leading-4 text-slate-500">
            軸ラベルを左右にドラッグできます。Shiftで微調整、CtrlまたはAltで大きく調整します。回転は度単位です。
          </p>
        </ComponentCard>
      ) : null}

      {entity.components.map((component) => {
        if (component.type === "transform") return null;
        if (component.type === "mesh") {
          return (
            <MeshInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly}
              onChange={(patch) => onMeshChange(component.id, patch)}
              onOpenMaterial={onOpenMaterial}
            />
          );
        }
        if (component.type === "collider") {
          return (
            <ColliderInspector
              key={component.id}
              component={component}
              entityScale={transform?.scale ?? [1, 1, 1]}
              readOnly={readOnly}
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
              readOnly={readOnly}
              onChange={(patch) => onLightChange(component.id, patch)}
            />
          );
        }
        if (component.type === "audio-source") {
          return (
            <AudioSourceInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly}
              onChange={(patch) => onAudioSourceChange(component.id, patch)}
              onOpenAsset={onOpenMaterial}
            />
          );
        }
        if (component.type === "particle-emitter") {
          return (
            <ParticleEmitterInspector
              key={component.id}
              component={component}
              assets={assets}
              readOnly={readOnly}
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
            <ComponentCard key={component.id} title="Spawn Point" subtitle={component.target}>
              <p className="text-xs leading-4 text-slate-600">
                Play開始位置の基準点です。Play中の移動結果はシーンに保存されません。
              </p>
            </ComponentCard>
          );
        }
        return null;
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
            readOnly={readOnly}
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
          disabled={readOnly}
          aria-expanded={addComponentOpen}
          onClick={() => setAddComponentOpen((open) => !open)}
          className="w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-45"
        >
          Add Component
        </button>
        {addComponentOpen ? (
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto rounded-md border border-slate-300 bg-white p-1 shadow-lg">
            {(["core", "rendering", "physics", "interaction", "media", "world"] as const).map(
              (category) => {
                const definitions = getEditorComponentMenuDefinitions(
                  projectKind,
                ).filter(
                  (definition) => definition.category === category,
                );
                if (definitions.length === 0) return null;
                return (
                  <details
                    key={category}
                    open={category === "rendering"}
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
            {getXriftComponentMenuGroups(projectKind).map((group) => (
              <details
                key={`xrift-${group.category}`}
                className="overflow-hidden rounded border border-slate-200"
              >
                <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  XRift {group.label} <span className="text-slate-400">({group.components.length})</span>
                </summary>
                <div className="space-y-0.5 border-t border-slate-100 p-1">
                  {group.components.map((definition) => {
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
            ))}
          </div>
        ) : null}
      </div>

    </div>
  );
}

export function InspectorPanel({
  scene,
  assets,
  projectPath,
  selectedEntityId,
  selectedAssetId,
  readOnly,
  onRenameEntity,
  onTransformChange,
  onTransformScrubStart,
  onTransformScrubChange,
  onTransformScrubEnd,
  onTransformScrubCancel,
  onMeshChange,
  onColliderChange,
  onAutoFitCollider,
  onRemoveCollider,
  onLightChange,
  onAudioSourceChange,
  onSelectAsset,
  onCloseAsset,
  onMaterialChange,
  onModelChange,
  onReimportModel,
  modelReimportState,
  modelReimportImpactNotice,
  onParticleChange,
  onTextureChange,
  onParticleEmitterChange,
  onRemoveParticleEmitter,
  projectKind,
  onAddComponent,
  onUpdateXriftComponent,
  onRemoveXriftComponent,
  sceneSettingsOpen,
  onCloseSceneSettings,
  onSceneSettingsChange,
  onThumbnailChanged,
  prefabs,
  onSelectPrefabSourceEntity,
  onUpdatePrefab,
}: {
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  selectedEntityId: string | null;
  selectedAssetId: string | null;
  readOnly: boolean;
  onRenameEntity: (entityId: string, name: string) => void;
  onTransformChange: (entityId: string, patch: TransformPatch) => void;
  onTransformScrubStart: (entityId: string) => void;
  onTransformScrubChange: (entityId: string, patch: TransformPatch) => void;
  onTransformScrubEnd: (entityId: string) => void;
  onTransformScrubCancel: (entityId: string) => void;
  onMeshChange: (entityId: string, componentId: string, patch: MeshInspectorPatch) => void;
  onColliderChange: (entityId: string, componentId: string, patch: ColliderPatch) => void;
  onAutoFitCollider: (entityId: string, componentId: string) => void;
  onRemoveCollider: (entityId: string, componentId: string) => void;
  onLightChange: (entityId: string, componentId: string, patch: LightPatch) => void;
  onAudioSourceChange: (entityId: string, componentId: string, patch: AudioSourcePatch) => void;
  onSelectAsset: (assetId: string) => void;
  onCloseAsset: () => void;
  onMaterialChange: (assetId: string, patch: MaterialAssetPatch) => void;
  onModelChange: (assetId: string, patch: ModelAssetPatch) => void;
  onReimportModel: (assetId: string) => void;
  modelReimportState: ModelReimportState;
  modelReimportImpactNotice?: ModelReimportImpactNotice | null;
  onParticleChange: (assetId: string, patch: ParticlePropertiesPatch) => void;
  onTextureChange: (assetId: string, patch: TextureAssetPatch) => void;
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
  onThumbnailChanged: () => void;
  prefabs: Readonly<Record<string, PrefabDocument>>;
  onSelectPrefabSourceEntity: (entityId: string) => void;
  onUpdatePrefab: (prefabId: string) => void;
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

  return (
    <aside className="row-span-2 flex min-h-0 flex-col border-l border-editor-border bg-editor-canvas" aria-labelledby="inspector-heading">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-editor-border bg-editor-surface px-3">
        <div className="flex items-center gap-2">
          <InspectorIcon size={14} className="text-editor-muted" aria-hidden="true" />
          <h2 id="inspector-heading" className="text-[13px] font-semibold text-editor-text">
            {sceneSettingsOpen
              ? "Scene Inspector"
              : asset
                ? "Asset Inspector"
                : "Entity Inspector"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {sceneSettingsOpen ? (
            <button
              type="button"
              onClick={onCloseSceneSettings}
              title="前のInspectorへ戻る"
              className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              戻る
            </button>
          ) : asset && entity ? (
            <button
              type="button"
              onClick={onCloseAsset}
              title={commandTitle(`${entity.name}のEntity Inspectorへ戻る`, "ShowEntityInspector")}
              className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Entity
            </button>
          ) : null}
          <span className="max-w-28 truncate text-xs text-slate-500">
            {sceneSettingsOpen ? scene.name : asset?.name ?? entity?.name ?? "未選択"}
          </span>
        </div>
      </div>
      {readOnly ? (
        <div className="border-b border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-4 text-violet-800">
          Play中はシーンを変更できません。アセット設定も閲覧のみです。
        </div>
      ) : null}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {sceneSettingsOpen ? (
          <SceneSettingsInspector
            scene={scene}
            assets={assets}
            projectKind={projectKind}
            projectPath={projectPath}
            readOnly={readOnly}
            onChange={onSceneSettingsChange}
            onThumbnailChanged={onThumbnailChanged}
          />
        ) : asset ? (
          <AssetQuickEditor
            asset={asset}
            assets={assets}
            projectPath={projectPath}
            referenceSummary={materialReferenceSummary}
            readOnly={readOnly}
            onSelectAsset={onSelectAsset}
            onMaterialChange={onMaterialChange}
            onModelChange={onModelChange}
            onReimportModel={onReimportModel}
            modelReimportState={modelReimportState}
            modelReimportImpactNotice={modelReimportImpactNotice}
            onParticleChange={onParticleChange}
            onTextureChange={onTextureChange}
            prefabs={prefabs}
            onSelectPrefabSourceEntity={onSelectPrefabSourceEntity}
            onUpdatePrefab={onUpdatePrefab}
          />
        ) : entity ? (
          <EntityInspector
            entity={entity}
            assets={assets}
            readOnly={readOnly}
            onRename={(name) => onRenameEntity(entity.id, name)}
            onTransformChange={(patch) => onTransformChange(entity.id, patch)}
            onTransformScrubStart={() => onTransformScrubStart(entity.id)}
            onTransformScrubChange={(patch) =>
              onTransformScrubChange(entity.id, patch)
            }
            onTransformScrubEnd={() => onTransformScrubEnd(entity.id)}
            onTransformScrubCancel={() => onTransformScrubCancel(entity.id)}
            onMeshChange={(componentId, patch) => onMeshChange(entity.id, componentId, patch)}
            onColliderChange={(componentId, patch) =>
              onColliderChange(entity.id, componentId, patch)
            }
            onAutoFitCollider={(componentId) =>
              onAutoFitCollider(entity.id, componentId)
            }
            onRemoveCollider={(componentId) =>
              onRemoveCollider(entity.id, componentId)
            }
            onLightChange={(componentId, patch) =>
              onLightChange(entity.id, componentId, patch)
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
