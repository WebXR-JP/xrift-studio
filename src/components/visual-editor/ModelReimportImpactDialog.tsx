import { useId } from "react";
import type {
  AssetManifest,
  ModelReimportImpact,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import { EditorDialog } from "./EditorDialog";

export function ModelReimportImpactDialog({
  modelName,
  impact,
  assets,
  onCancel,
  onConfirm,
}: {
  modelName: string;
  impact: ModelReimportImpact;
  assets: AssetManifest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const removedBindings = impact.bindingReferences.length;

  const WarningIcon = EDITOR_ICONS.warning;
  return (
    <EditorDialog
      onDismiss={onCancel}
      role="alertdialog"
      ariaLabelledBy={titleId}
      backdropClassName="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/30 p-5"
      surfaceClassName="flex max-h-[min(680px,90vh)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-amber-300 bg-white shadow-2xl"
    >
        <header data-app-modal-header className="border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-700">
              <WarningIcon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-amber-950">
                マテリアルスロットの変更を確認
              </h2>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                「{modelName}」の再インポート結果から
                {impact.slotDiff.removedSlots.length}件のスロットが消えます。
              </p>
            </div>
          </div>
        </header>

        <div data-app-modal-body className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
            適用すると、削除されるスロットを参照するシーン / プレハブのマテリアルの割り当て
            {removedBindings}件を解除します。キャンセルすると現在の3Dモデルと割り当てを変更しません。
          </p>

          <section>
            <h3 className="text-xs font-semibold text-slate-800">削除されるスロット</h3>
            <ul className="mt-1.5 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
              {impact.slotDiff.removedSlots.map((slot) => {
                const material = slot.defaultMaterialAssetId
                  ? assets.assets[slot.defaultMaterialAssetId]
                  : undefined;
                return (
                  <li key={slot.slot} className="px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold">{slot.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">
                      {slot.slot}
                    </span>
                    {slot.defaultMaterialAssetId ? (
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        モデルの既定マテリアル: {material?.name ?? slot.defaultMaterialAssetId}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {impact.bindingReferences.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold text-slate-800">
                解除する割り当て ({impact.bindingReferences.length})
              </h3>
              <ul className="mt-1.5 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {impact.bindingReferences.map((reference) => {
                  const material = assets.assets[reference.materialAssetId];
                  return (
                    <li
                      key={`${reference.documentKind}:${reference.documentId}:${reference.entityId}:${reference.componentId}:${reference.bindingIndex}`}
                      className="px-3 py-2 text-xs text-slate-700"
                    >
                      <span className="font-semibold">
                        {reference.documentKind === "scene" ? "シーン" : "プレハブ"}: {reference.documentName}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {reference.entityName} / {reference.slot} / {material?.name ?? reference.materialAssetId}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <footer data-app-modal-footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] leading-4 text-slate-500">
            モデルの差し替えと割り当ての解除は、1回の「元に戻す」で取り消せます。
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className="h-8 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
            >
              割り当てを解除して適用
            </button>
          </div>
        </footer>
    </EditorDialog>
  );
}
