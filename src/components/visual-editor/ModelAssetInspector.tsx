import type { ReactNode } from "react";
import type {
  AssetManifest,
  ModelAsset,
  ModelAssetPatch,
  ModelReimportImpact,
} from "../../lib/visual-editor";

export type ModelReimportState =
  | { phase: "idle" }
  | { phase: "reading" | "processing" | "committing"; message: string }
  | { phase: "review"; message: string }
  | { phase: "succeeded" | "failed"; message: string };

export type ModelReimportImpactNotice = {
  /** The same summary can be shown before commit or retained after commit. */
  context: "before-apply" | "applied-result";
  impact: ModelReimportImpact;
};

const INPUT_CLASS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function ModelAssetInspector({
  asset,
  assets,
  preview,
  readOnly,
  canReimport,
  reimportState,
  reimportImpactNotice,
  onChange,
  onOpenMaterial,
  onReimport,
}: {
  asset: ModelAsset;
  assets: AssetManifest;
  preview: ReactNode;
  readOnly: boolean;
  canReimport: boolean;
  reimportState: ModelReimportState;
  reimportImpactNotice?: ModelReimportImpactNotice | null;
  onChange: (patch: ModelAssetPatch) => void;
  onOpenMaterial: (assetId: string) => void;
  onReimport: () => void;
}) {
  const metadata = asset.importMetadata;
  const openBrush = metadata?.openBrush;
  const materials = Object.values(assets.assets)
    .filter((candidate) => candidate.kind === "material")
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
  const reimportBusy =
    reimportState.phase === "reading" ||
    reimportState.phase === "processing" ||
    reimportState.phase === "committing" ||
    reimportState.phase === "review";
  const source =
    asset.source.kind === "project"
      ? asset.source.relativePath
      : asset.source.kind === "builtin"
        ? `Built-in: ${asset.source.key}`
        : "Document内のModel";

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-28 overflow-hidden rounded-md border border-slate-300 bg-slate-100">
          {preview}
        </div>
        <div className="min-w-0 self-center">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {asset.name}
            </h3>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                asset.status === "ready"
                  ? "bg-emerald-100 text-emerald-800"
                  : asset.status === "missing"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
              }`}
            >
              {asset.status === "ready"
                ? "Ready"
                : asset.status === "missing"
                  ? "Missing"
                  : "Invalid"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500" title={source}>
            {source}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {metadata
              ? `${metadata.sourceFormat.toUpperCase()}${metadata.vrmVersion ? ` ${metadata.vrmVersion}.x` : ""} · ${formatBytes(metadata.byteLength)} · ${asset.materialSlots.length} Material Slot`
              : "構造解析結果がありません"}
          </p>
          <button
            type="button"
            disabled={readOnly || !canReimport || reimportBusy}
            onClick={onReimport}
            className="mt-2 h-8 rounded-md border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {reimportBusy ? "再インポート中" : "ソースから再インポート"}
          </button>
        </div>
      </section>

      {openBrush ? (
        <section className="rounded-lg border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-violet-50 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-fuchsia-950">
              OpenBrush / three-icosa
            </h3>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-fuchsia-700 shadow-sm">
              {openBrush.brushNames.length} Brushes
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-fuchsia-900/80">
            ソースのブラシシェーダーを既定表示に使います。Material SlotへXRift Materialを割り当てると、そのブラシだけを上書きできます。
          </p>
          <dl className="mt-2 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
            <dt className="text-fuchsia-700">Exporter</dt>
            <dd className="truncate text-fuchsia-950">
              {openBrush.exporter ?? "Open Brush glTF"}
            </dd>
            <dt className="text-fuchsia-700">Renderer</dt>
            <dd className="truncate font-mono text-fuchsia-950">
              {openBrush.rendererVersion}
            </dd>
          </dl>
          <p className="mt-2 text-[11px] leading-4 text-fuchsia-800">
            プレビューと公開実行時は、three-icosa公式テンプレートのブラシ素材をネットワークから読み込みます。
          </p>
        </section>
      ) : null}

      {reimportState.phase !== "idle" ? (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-xs leading-5 ${
            reimportState.phase === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : reimportState.phase === "review"
                ? "border-amber-200 bg-amber-50 text-amber-800"
              : reimportState.phase === "succeeded"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {reimportState.message}
        </div>
      ) : !canReimport ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          保存済みのproject-relative sourceがあるGLB / glTF / OBJ / VRMだけ再インポートできます。
        </div>
      ) : null}

      {reimportImpactNotice?.impact.requiresAttention ? (
        <ModelReimportImpactSummary
          notice={reimportImpactNotice}
          assets={assets}
        />
      ) : null}

      <InspectorSection
        title="Import Recipe"
        description="配置に反映する設定と、将来用に保持している設定"
      >
        <label className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 text-xs text-slate-700">
          <span>
            Import Scale
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Scene表示、Collider bounds、変換結果へ反映
            </span>
          </span>
          <input
            type="number"
            min={0.0001}
            max={10000}
            step={0.1}
            value={asset.importSettings.scale}
            disabled={readOnly}
            onChange={(event) => {
              const scale = event.currentTarget.valueAsNumber;
              if (Number.isFinite(scale) && scale > 0) {
                onChange({ importSettings: { scale } });
              }
            }}
            className={INPUT_CLASS}
          />
        </label>
        <RecipeToggle
          label="配置時にMesh Colliderを追加"
          description="このModelを新しくSceneへ配置する時の既定値"
          checked={asset.importSettings.generateColliders}
          disabled={readOnly}
          onChange={(generateColliders) =>
            onChange({ importSettings: { generateColliders } })
          }
        />
        <RecipeToggle
          label="Mesh最適化"
          description="保存値のみ表示。現在の変換・再インポート処理には反映されません"
          checked={asset.importSettings.optimizeMeshes}
          disabled
          status="未対応"
        />
        <RecipeToggle
          label="Animationを取り込む"
          description="保存値のみ表示。現在の再インポート処理には反映されません"
          checked={asset.importSettings.importAnimations}
          disabled
          status="未対応"
        />
      </InspectorSection>

      <InspectorSection
        title="Model Structure"
        description="ソースを最後に正常解析した時の構造"
      >
        {metadata ? (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="Nodes" value={metadata.nodeCount} />
              <Metric label="Meshes" value={metadata.meshCount} />
              <Metric label="Primitives" value={metadata.primitiveCount} />
            </dl>
            <dl className="grid grid-cols-2 gap-2">
              <Metric label="Bones" value={metadata.bones?.length ?? 0} />
              <Metric label="Shape Keys" value={metadata.morphTargets?.length ?? 0} />
            </dl>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-xs font-semibold text-slate-700">Local Bounds</p>
              <dl className="mt-2 grid grid-cols-[58px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                <dt className="text-slate-500">Size</dt>
                <dd className="font-mono text-slate-700">
                  {formatVector(metadata.bounds.size)}
                </dd>
                <dt className="text-slate-500">Center</dt>
                <dd className="font-mono text-slate-700">
                  {formatVector(metadata.bounds.center)}
                </dd>
                <dt className="text-slate-500">Radius</dt>
                <dd className="font-mono text-slate-700">
                  {formatNumber(metadata.bounds.boundingSphereRadius)}
                </dd>
              </dl>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            構造解析結果がありません。ソースから再インポートするとnode、mesh、boundsを確認できます。
          </p>
        )}
      </InspectorSection>

      <InspectorSection
        title={`Material Slots (${asset.materialSlots.length})`}
        description={openBrush
          ? "OpenBrush Brush Shaderが既定。割り当てたSlotだけXRift Materialで上書きします"
          : "Model全体の既定Material。Entity側の割当が優先されます"}
      >
        {asset.materialSlots.length > 0 ? (
          asset.materialSlots.map((slot) => {
            const selected = slot.defaultMaterialAssetId
              ? assets.assets[slot.defaultMaterialAssetId]
              : undefined;
            const missing = Boolean(slot.defaultMaterialAssetId && selected?.kind !== "material");
            return (
              <div
                key={slot.slot}
                className={`rounded-md border p-2.5 ${
                  missing
                    ? "border-rose-200 bg-rose-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {slot.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                      {slot.slot}
                    </p>
                  </div>
                  {slot.sourceMaterialIndex !== undefined ? (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      Source #{slot.sourceMaterialIndex}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_62px] gap-2">
                  <select
                    value={slot.defaultMaterialAssetId ?? ""}
                    disabled={readOnly}
                    onChange={(event) =>
                      onChange({
                        materialSlotBindings: {
                          [slot.slot]: event.currentTarget.value || null,
                        },
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">
                      {openBrush ? "OpenBrush Brush Shader" : "Model内のMaterial"}
                    </option>
                    {missing && slot.defaultMaterialAssetId ? (
                      <option value={slot.defaultMaterialAssetId}>
                        Missing: {slot.defaultMaterialAssetId}
                      </option>
                    ) : null}
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={selected?.kind !== "material"}
                    onClick={() =>
                      selected?.kind === "material" && onOpenMaterial(selected.id)
                    }
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    開く
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            ソース内で使用されるMaterial Slotはありません。
          </p>
        )}
      </InspectorSection>

      <InspectorSection
        title={`Animations (${metadata?.animations.length ?? 0})`}
        description="ソース内で検出したanimation clip"
      >
        {metadata?.animations.length ? (
          <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {metadata.animations.map((animation, index) => (
              <div
                key={`${animation.sourceAnimationIndex ?? index}-${animation.name}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2"
              >
                <span className="truncate text-xs font-medium text-slate-700">
                  {animation.name}
                </span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {formatNumber(animation.duration)}s · {animation.trackCount} tracks
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Animationは検出されていません。</p>
        )}
      </InspectorSection>

      {metadata &&
      (metadata.extensionsUsed.length > 0 || metadata.extensionsRequired.length > 0) ? (
        <InspectorSection title="glTF Extensions" description="ソースが宣言する拡張">
          <ExtensionList label="Required" values={metadata.extensionsRequired} />
          <ExtensionList label="Used" values={metadata.extensionsUsed} />
        </InspectorSection>
      ) : null}
    </div>
  );
}

function InspectorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            {description}
          </p>
        ) : null}
      </header>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

function ModelReimportImpactSummary({
  notice,
  assets,
}: {
  notice: ModelReimportImpactNotice;
  assets: AssetManifest;
}) {
  const { slotDiff, bindingReferences } = notice.impact;
  const removedDefaultCount = slotDiff.removedSlots.filter(
    (slot) => slot.defaultMaterialAssetId,
  ).length;
  const isPreview = notice.context === "before-apply";

  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm"
    >
      <h3 className="text-[13px] font-semibold">
        {isPreview ? "再インポート前の確認" : "再インポート結果の確認"}
      </h3>
      <p className="mt-1 text-xs leading-5">
        Material Slot {slotDiff.removedSlots.length}件が
        {isPreview ? "ソースから消えます" : "ソースから削除されました"}。
        {bindingReferences.length > 0
          ? ` Scene / Prefabの割当 ${bindingReferences.length}件を確認してください。`
          : " Scene / Prefabの明示的な割当は見つかりませんでした。"}
      </p>
      {removedDefaultCount > 0 ? (
        <p className="mt-1 text-[11px] leading-4 text-amber-800">
          削除対象にはModel既定Materialの割当が{removedDefaultCount}件あります。
        </p>
      ) : null}
      {slotDiff.addedSlots.length > 0 ? (
        <p className="mt-1 text-[11px] leading-4 text-amber-800">
          新しいMaterial Slotは{slotDiff.addedSlots.length}件です。必要に応じてMaterialを割り当ててください。
        </p>
      ) : null}

      <div className="mt-2 rounded-md border border-amber-200 bg-white/80 px-2.5 py-2">
        <p className="text-[11px] font-semibold text-amber-900">削除されるSlot</p>
        <ul className="mt-1.5 space-y-1">
          {slotDiff.removedSlots.map((slot) => {
            const material = slot.defaultMaterialAssetId
              ? assets.assets[slot.defaultMaterialAssetId]
              : undefined;
            return (
              <li key={slot.slot} className="text-[11px] leading-4 text-amber-900">
                <span className="font-medium">{slot.name}</span>
                <span className="ml-1 font-mono text-amber-700">{slot.slot}</span>
                {slot.defaultMaterialAssetId ? (
                  <span className="block text-amber-700">
                    既定Material: {material?.name ?? slot.defaultMaterialAssetId}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {bindingReferences.length > 0 ? (
        <details className="mt-2 rounded-md border border-amber-200 bg-white/80 px-2.5 py-2" open={isPreview}>
          <summary className="cursor-pointer text-[11px] font-semibold text-amber-900">
            影響する割当 {bindingReferences.length}件
          </summary>
          <ul className="mt-2 space-y-1.5">
            {bindingReferences.map((reference) => {
              const material = assets.assets[reference.materialAssetId];
              return (
                <li
                  key={`${reference.documentKind}:${reference.documentId}:${reference.entityId}:${reference.componentId}:${reference.bindingIndex}`}
                  className="text-[11px] leading-4 text-amber-900"
                >
                  <span className="font-medium">
                    {reference.documentKind === "scene" ? "Scene" : "Prefab"}: {reference.documentName}
                  </span>
                  <span className="block text-amber-700">
                    {reference.entityName} / {reference.slot} / {material?.name ?? reference.materialAssetId}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function RecipeToggle({
  label,
  description,
  checked,
  disabled,
  status,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  status?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          {label}
          {status ? (
            <span className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-500">
              {status}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || !onChange}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
        className="h-4 w-4 shrink-0 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-center">
      <div className="text-base font-semibold tabular-nums text-slate-800">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

function ExtensionList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[10px] text-slate-600"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatVector(value: readonly number[]): string {
  return value.map(formatNumber).join(" × ");
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "—";
}
