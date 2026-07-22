import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { ThumbnailEditor } from "../ThumbnailEditor";
import {
  resolveSceneSettings,
  type AssetManifest,
  type SceneDocument,
  type SceneSettings,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { SKYBOX_DRAG_MIME, TEXTURE_DRAG_MIME } from "./types";

type SceneSettingsInspectorProps = {
  scene: SceneDocument;
  assets: AssetManifest;
  projectKind: VisualProjectKind;
  projectPath?: string;
  readOnly: boolean;
  onChange: (settings: SceneSettings) => void;
  onThumbnailChanged: () => void;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-xs font-medium text-slate-700">{label}</span>
        {description ? <span className="block text-[11px] leading-4 text-slate-500">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function ColorField({
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
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}の色`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed"
        />
        <code className="w-[58px] text-right text-[11px] text-slate-500">{value}</code>
      </span>
    </label>
  );
}

function NumberField({
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
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step ?? "any"}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        className="h-7 w-24 rounded border border-slate-300 bg-white px-2 text-right text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

function ThumbnailDialog({
  projectPath,
  projectKind,
  onClose,
  onChanged,
}: {
  projectPath: string;
  projectKind: VisualProjectKind;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="サムネイルを編集"
      onPointerDown={onClose}
    >
      <div
        className="flex h-[min(640px,calc(100vh-40px))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">サムネイル</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">一覧と公開情報に使う画像を設定します</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="サムネイル設定を閉じる"
            title="サムネイル設定を閉じる"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ThumbnailEditor
            projectPath={projectPath}
            projectKind={projectKind}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}

function SkyboxImageField({
  assets,
  imageAssetId,
  disabled,
  onChange,
}: {
  assets: AssetManifest;
  imageAssetId: string | undefined;
  disabled: boolean;
  onChange: (imageAssetId: string | undefined) => void;
}) {
  const skyboxes = Object.values(assets.assets).filter(
    (asset) =>
      (asset.kind === "skybox" || asset.kind === "texture") &&
      asset.source.kind === "project",
  );
  const assigned = imageAssetId ? assets.assets[imageAssetId] : undefined;
  const canDrop = (event: DragEvent<HTMLDivElement>) =>
    !disabled &&
    (hasEditorDragData(event.dataTransfer, SKYBOX_DRAG_MIME) ||
      hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME));

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Skybox（Assets）</span>
        <select
          value={imageAssetId ?? ""}
          disabled={disabled || skyboxes.length === 0}
          onChange={(event) => onChange(event.currentTarget.value || undefined)}
          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">グラデーションを使用</option>
          {skyboxes.map((skybox) => (
            <option key={skybox.id} value={skybox.id}>{skybox.name}{skybox.kind === "texture" ? "（従来Texture）" : ""}</option>
          ))}
        </select>
      </label>
      <div
        className={`rounded border border-dashed px-2.5 py-2 text-xs leading-4 transition-colors ${
          disabled
            ? "border-slate-200 bg-slate-50 text-slate-400"
            : "border-slate-300 bg-slate-50 text-slate-600 hover:border-violet-400 hover:bg-violet-50"
        }`}
        onDragOverCapture={(event) => {
          if (!canDrop(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDropCapture={(event) => {
          if (!canDrop(event)) return;
          event.preventDefault();
          event.stopPropagation();
          const nextAssetId =
            readEditorDragData(event.dataTransfer, SKYBOX_DRAG_MIME) ||
            readEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME);
          clearEditorDragData();
          if (
            assets.assets[nextAssetId]?.kind === "skybox" ||
            assets.assets[nextAssetId]?.kind === "texture"
          ) onChange(nextAssetId);
        }}
      >
        {(assigned?.kind === "skybox" || assigned?.kind === "texture") && assigned.source.kind === "project"
          ? `設定中: ${assigned.name}。Assetsから別のSkyboxをここへドロップできます。`
          : imageAssetId
            ? "設定済みの画像がAssetsに見つかりません。別のTextureを選択してください。"
            : "Skybox AssetをAssetsからここへドロップできます。"}
      </div>
    </div>
  );
}

/** Content for the right Inspector view; it intentionally has no modal shell. */
export function SceneSettingsInspector({
  scene,
  assets,
  projectKind,
  projectPath,
  readOnly,
  onChange,
  onThumbnailChanged,
}: SceneSettingsInspectorProps) {
  const [thumbnailOpen, setThumbnailOpen] = useState(false);
  const settings = resolveSceneSettings(scene.settings);
  const update = (next: SceneSettings) => onChange(next);
  const disabledHint = readOnly
    ? "Play中は停止してから設定を変更できます"
    : undefined;
  const imageControlsDisabled =
    readOnly || !settings.skybox.enabled || !settings.skybox.imageAssetId;

  return (
    <>
      <div className="space-y-3">
        <Section title="サムネイル" description="一覧と公開情報に表示する画像です。">
          <button
            type="button"
            disabled={!projectPath}
            onClick={() => setThumbnailOpen(true)}
            title={projectPath ? "サムネイルを編集" : "保存済みプロジェクトを開くと設定できます"}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {projectPath ? "サムネイルを編集" : "保存後にサムネイルを設定"}
          </button>
        </Section>

        <Section title="スカイボックス" description="グラデーションまたはequirectangular画像を、Scene Viewと生成Worldに適用します。">
          <Toggle
            label="スカイボックスを有効にする"
            checked={settings.skybox.enabled}
            disabled={readOnly}
            onChange={(enabled) => update({ ...settings, skybox: { ...settings.skybox, enabled } })}
          />
          <SkyboxImageField
            assets={assets}
            imageAssetId={settings.skybox.imageAssetId}
            disabled={readOnly || !settings.skybox.enabled}
            onChange={(imageAssetId) =>
              update({ ...settings, skybox: { ...settings.skybox, imageAssetId } })
            }
          />
          <NumberField label="画像の回転 (度)" value={settings.skybox.rotationDegrees} step={1} disabled={imageControlsDisabled} onChange={(rotationDegrees) => update({ ...settings, skybox: { ...settings.skybox, rotationDegrees } })} />
          <Toggle
            label="画像を上下反転"
            description="HDRIが上下逆に見える場合に有効にします。"
            checked={settings.skybox.flipY}
            disabled={imageControlsDisabled}
            onChange={(flipY) => update({ ...settings, skybox: { ...settings.skybox, flipY } })}
          />
          <NumberField label="画像の露出" value={settings.skybox.exposure} min={0} step={0.05} disabled={imageControlsDisabled} onChange={(exposure) => update({ ...settings, skybox: { ...settings.skybox, exposure } })} />
          <ColorField label="上空の色" value={settings.skybox.topColor} disabled={readOnly || !settings.skybox.enabled || Boolean(settings.skybox.imageAssetId)} onChange={(topColor) => update({ ...settings, skybox: { ...settings.skybox, topColor } })} />
          <ColorField label="地平線の色" value={settings.skybox.bottomColor} disabled={readOnly || !settings.skybox.enabled || Boolean(settings.skybox.imageAssetId)} onChange={(bottomColor) => update({ ...settings, skybox: { ...settings.skybox, bottomColor } })} />
          <NumberField label="オフセット" value={settings.skybox.offset} step={0.05} disabled={readOnly || !settings.skybox.enabled || Boolean(settings.skybox.imageAssetId)} onChange={(offset) => update({ ...settings, skybox: { ...settings.skybox, offset } })} />
          <NumberField label="グラデーション" value={settings.skybox.exponent} min={0.01} step={0.01} disabled={readOnly || !settings.skybox.enabled || Boolean(settings.skybox.imageAssetId)} onChange={(exponent) => update({ ...settings, skybox: { ...settings.skybox, exponent } })} />
        </Section>

        <Section title="フォグ" description="Scene Viewと生成されたWorldに同じ距離フォグを適用します。">
          <Toggle label="フォグを有効にする" checked={settings.fog.enabled} disabled={readOnly} onChange={(enabled) => update({ ...settings, fog: { ...settings.fog, enabled } })} />
          <ColorField label="フォグの色" value={settings.fog.color} disabled={readOnly || !settings.fog.enabled} onChange={(color) => update({ ...settings, fog: { ...settings.fog, color } })} />
          <NumberField label="開始距離" value={settings.fog.near} min={0} max={settings.fog.far - 0.001} step={0.5} disabled={readOnly || !settings.fog.enabled} onChange={(near) => update({ ...settings, fog: { ...settings.fog, near } })} />
          <NumberField label="終了距離" value={settings.fog.far} min={0} step={0.5} disabled={readOnly || !settings.fog.enabled} onChange={(far) => update({ ...settings, fog: { ...settings.fog, far: Math.max(far, settings.fog.near + 0.001) } })} />
        </Section>

        <Section title="環境光" description="全体を照らすアンビエントライトです。">
          <ColorField label="環境光の色" value={settings.ambient.color} disabled={readOnly} onChange={(color) => update({ ...settings, ambient: { ...settings.ambient, color } })} />
          <NumberField label="強さ" value={settings.ambient.intensity} min={0} step={0.05} disabled={readOnly} onChange={(intensity) => update({ ...settings, ambient: { ...settings.ambient, intensity } })} />
        </Section>

        <Section title="カメラ" description="編集ビューのクリッピング範囲と画角です。">
          <NumberField label="Near" value={settings.camera.near} min={0.01} max={settings.camera.far - 0.0001} step={0.01} disabled={readOnly} onChange={(near) => update({ ...settings, camera: { ...settings.camera, near } })} />
          <NumberField label="Far" value={settings.camera.far} min={1} step={1} disabled={readOnly} onChange={(far) => update({ ...settings, camera: { ...settings.camera, far: Math.max(far, settings.camera.near + 0.0001) } })} />
          <NumberField label="視野角" value={settings.camera.fov} min={1} max={179} step={1} disabled={readOnly} onChange={(fov) => update({ ...settings, camera: { ...settings.camera, fov } })} />
        </Section>

        <Section title="ギズモとグリッド" description="編集時だけ使う表示・スナップ設定です。">
          <Toggle label="グリッドを表示" checked={settings.editor.gizmo.gridVisible} disabled={readOnly} onChange={(gridVisible) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, gridVisible } } })} />
          <NumberField label="グリッドサイズ" value={settings.editor.gizmo.gridSize} min={1} step={1} disabled={readOnly || !settings.editor.gizmo.gridVisible} onChange={(gridSize) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, gridSize } } })} />
          <NumberField label="分割数" value={settings.editor.gizmo.gridDivisions} min={1} step={1} disabled={readOnly || !settings.editor.gizmo.gridVisible} onChange={(gridDivisions) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, gridDivisions: Math.round(gridDivisions) } } })} />
          <NumberField label="ギズモの大きさ" value={settings.editor.gizmo.size} min={0.1} step={0.01} disabled={readOnly} onChange={(size) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, size } } })} />
          <Toggle label="スナップを有効にする" description="移動・回転・拡縮の操作を一定間隔にそろえます。" checked={settings.editor.gizmo.snapEnabled} disabled={readOnly} onChange={(snapEnabled) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, snapEnabled } } })} />
          <NumberField label="移動スナップ" value={settings.editor.gizmo.translateSnap} min={0.001} step={0.1} disabled={readOnly || !settings.editor.gizmo.snapEnabled} onChange={(translateSnap) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, translateSnap } } })} />
          <NumberField label="回転スナップ (度)" value={settings.editor.gizmo.rotateSnapDegrees} min={0.1} step={1} disabled={readOnly || !settings.editor.gizmo.snapEnabled} onChange={(rotateSnapDegrees) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, rotateSnapDegrees } } })} />
          <NumberField label="拡縮スナップ" value={settings.editor.gizmo.scaleSnap} min={0.001} step={0.05} disabled={readOnly || !settings.editor.gizmo.snapEnabled} onChange={(scaleSnap) => update({ ...settings, editor: { ...settings.editor, gizmo: { ...settings.editor.gizmo, scaleSnap } } })} />
          <ColorField label="編集背景" value={settings.editor.backgroundColor} disabled={readOnly} onChange={(backgroundColor) => update({ ...settings, editor: { ...settings.editor, backgroundColor } })} />
        </Section>

        {disabledHint ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-4 text-amber-800">{disabledHint}</p> : null}
      </div>

      {thumbnailOpen && projectPath ? (
        <ThumbnailDialog
          projectPath={projectPath}
          projectKind={projectKind}
          onClose={() => setThumbnailOpen(false)}
          onChanged={onThumbnailChanged}
        />
      ) : null}
    </>
  );
}
