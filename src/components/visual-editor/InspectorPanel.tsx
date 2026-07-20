import {
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  getGeometryAsset,
  getBuiltinPrimitiveCreation,
  getMaterialAsset,
  getMeshMaterialSlots,
  getTransform,
  getXriftComponentDefinition,
  EDITOR_COMPONENT_REGISTRY,
  type AssetManifest,
  type ColliderComponent,
  type ColliderPatch,
  type JsonValue,
  type MaterialBinding,
  type MaterialAssetPatch,
  type ModelAssetPatch,
  type MaterialSlotDefinition,
  type MeshComponent,
  type ParticleEmitterComponent,
  type ParticlePropertiesPatch,
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
  Pick<MeshComponent, "materialBindings" | "castShadow" | "receiveShadow">
>;

export type ParticleEmitterInspectorPatch = Partial<
  Pick<ParticleEmitterComponent, "enabled" | "particleAssetId">
>;

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

function VectorEditor({
  label,
  value,
  valueKind,
  disabled,
  onChange,
}: {
  label: string;
  value: Vec3;
  valueKind: "position" | "rotation" | "scale";
  disabled: boolean;
  onChange: (value: Vec3) => void;
}) {
  const axes = ["X", "Y", "Z"] as const;
  const displayedValues: Vec3 =
    valueKind === "rotation"
      ? (value.map((axis) => roundTo((axis * 180) / Math.PI, 2)) as Vec3)
      : (value.map((axis) => roundTo(axis, 3)) as Vec3);

  return (
    <fieldset className="grid grid-cols-[54px_repeat(3,minmax(0,1fr))] items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      <span className="text-xs text-slate-600">{label}</span>
      {axes.map((axis, index) => (
        <label key={axis} className="relative block min-w-0">
          <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
            {axis}
          </span>
          <input
            type="number"
            value={displayedValues[index]}
            disabled={disabled}
            step={valueKind === "rotation" ? 1 : 0.1}
            aria-label={`${label} ${axis}`}
            onChange={(event) => {
              const nextValue = event.currentTarget.valueAsNumber;
              if (!Number.isFinite(nextValue)) return;
              const next: Vec3 = [value[0], value[1], value[2]];
              next[index] = valueKind === "rotation" ? (nextValue * Math.PI) / 180 : nextValue;
              onChange(next);
            }}
            className="h-7 w-full rounded border border-slate-300 bg-white py-1 pl-4 pr-1 text-right text-xs tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>
      ))}
    </fieldset>
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
                  <option value="">未設定</option>
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
              <p className="mt-1 text-xs text-slate-500">マテリアルをここへドロップ</p>
            </div>
          );
        })}
        {slots.length === 0 ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-4 text-amber-800">
            形状にマテリアルスロット情報がありません。インポート解析を確認してください。
          </p>
        ) : null}
      </div>

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
  onMeshChange,
  onColliderChange,
  onAutoFitCollider,
  onRemoveCollider,
  onParticleEmitterChange,
  onRemoveParticleEmitter,
  onOpenMaterial,
  projectKind,
  onAddComponent,
  onUpdateXriftComponent,
  onRemoveXriftComponent,
}: {
  entity: SceneEntity;
  assets: AssetManifest;
  readOnly: boolean;
  onRename: (name: string) => void;
  onTransformChange: (patch: TransformPatch) => void;
  onMeshChange: (componentId: string, patch: MeshInspectorPatch) => void;
  onColliderChange: (componentId: string, patch: ColliderPatch) => void;
  onAutoFitCollider: (componentId: string) => void;
  onRemoveCollider: (componentId: string) => void;
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
}) {
  const transform = getTransform(entity);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const registeredComponents = entity.components as RegisteredSceneComponent[];

  return (
    <div className="space-y-3">
      <EntityNameField entity={entity} disabled={readOnly} onRename={onRename} />

      {transform ? (
        <ComponentCard title="Transform" subtitle="シーン">
          <VectorEditor label="Position" value={transform.position} valueKind="position" disabled={readOnly} onChange={(position) => onTransformChange({ position })} />
          <VectorEditor label="Rotation" value={transform.rotation} valueKind="rotation" disabled={readOnly} onChange={(rotation) => onTransformChange({ rotation })} />
          <VectorEditor label="Scale" value={transform.scale} valueKind="scale" disabled={readOnly} onChange={(scale) => onTransformChange({ scale })} />
          <p className="text-xs leading-4 text-slate-500">
            回転は度単位で編集します。
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
            <ComponentCard key={component.id} title="Light" subtitle={component.lightType}>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-slate-500">カラー</dt>
                <dd className="text-right font-mono text-slate-700">{component.color}</dd>
                <dt className="text-slate-500">強度</dt>
                <dd className="text-right tabular-nums text-slate-700">{component.intensity}</dd>
                <dt className="text-slate-500">影</dt>
                <dd className="text-right text-slate-700">{component.castShadow ? "On" : "Off"}</dd>
              </dl>
            </ComponentCard>
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
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-300 bg-white p-1 shadow-lg">
            {(["core", "rendering", "physics", "interaction", "media", "world"] as const).map(
              (category) => {
                const definitions = EDITOR_COMPONENT_REGISTRY.filter(
                  (definition) =>
                    definition.category === category &&
                    definition.projectKinds.includes(projectKind),
                );
                if (definitions.length === 0) return null;
                return (
                  <div key={category} className="mb-1 last:mb-0">
                    <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {category}
                    </p>
                    {definitions.map((definition) => {
                      const DefinitionIcon = getEditorComponentIcon(definition);
                      const duplicate =
                        !definition.allowMultiple &&
                        registeredComponents.some((component) =>
                          definition.componentType === "official-xrift"
                            ? component.type === "xrift-component" &&
                              component.schemaId === definition.schemaId
                            : definition.componentType === "builtin-mesh"
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
                );
              },
            )}
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
  onMeshChange,
  onColliderChange,
  onAutoFitCollider,
  onRemoveCollider,
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
}: {
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  selectedEntityId: string | null;
  selectedAssetId: string | null;
  readOnly: boolean;
  onRenameEntity: (entityId: string, name: string) => void;
  onTransformChange: (entityId: string, patch: TransformPatch) => void;
  onMeshChange: (entityId: string, componentId: string, patch: MeshInspectorPatch) => void;
  onColliderChange: (entityId: string, componentId: string, patch: ColliderPatch) => void;
  onAutoFitCollider: (entityId: string, componentId: string) => void;
  onRemoveCollider: (entityId: string, componentId: string) => void;
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
}) {
  const entity = selectedEntityId ? scene.entities[selectedEntityId] : undefined;
  const asset = selectedAssetId ? assets.assets[selectedAssetId] : undefined;
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
    : entity?.components.some((component) => component.type === "particle-emitter")
      ? EDITOR_ICONS.particle
      : xriftDefinition
        ? EDITOR_ICONS[xriftDefinition.icon]
        : EDITOR_ICONS.sceneEntity;
  const InspectorIcon = sceneSettingsOpen ? EDITOR_ICONS.settings : EntityIcon;

  return (
    <aside className="row-span-2 flex min-h-0 flex-col border-l border-slate-300 bg-slate-100" aria-labelledby="inspector-heading">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-50 px-3">
        <div className="flex items-center gap-2">
          <InspectorIcon size={14} className="text-slate-500" aria-hidden="true" />
          <h2 id="inspector-heading" className="text-[13px] font-semibold text-slate-800">
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
          />
        ) : entity ? (
          <EntityInspector
            entity={entity}
            assets={assets}
            readOnly={readOnly}
            onRename={(name) => onRenameEntity(entity.id, name)}
            onTransformChange={(patch) => onTransformChange(entity.id, patch)}
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
