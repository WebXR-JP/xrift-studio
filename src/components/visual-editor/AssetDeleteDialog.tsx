import type {
  AssetFolderDeletionAnalysis,
  AssetReferenceLocation,
} from "../../lib/visual-editor";
import {
  assetReferenceDetachEffectLabel,
  assetReferenceKey,
  assetReferenceKindLabel,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import { EditorDialog } from "./EditorDialog";

export type AssetDeleteDialogTarget =
  | {
      kind: "asset";
      id: string;
      name: string;
      canDelete: boolean;
      references: AssetReferenceLocation[];
    }
  | {
      kind: "folder";
      id: string;
      name: string;
      canDelete: boolean;
      analysis: AssetFolderDeletionAnalysis;
    };

export function AssetDeleteDialog({
  target,
  onCancel,
  onConfirm,
  onDetachReference,
  onDetachAllReferences,
  onRevealReference,
}: {
  target: AssetDeleteDialogTarget;
  onCancel: () => void;
  onConfirm: () => void;
  /** Unlinks one listed reference and leaves the dialog open on the rest. */
  onDetachReference: (reference: AssetReferenceLocation) => void;
  /** Unlinks every listed reference, then deletes the Asset. */
  onDetachAllReferences: () => void;
  /** Selects the owner of a reference so the author can see where it lives. */
  onRevealReference: (reference: AssetReferenceLocation) => void;
}) {
  const DeleteIcon = EDITOR_ICONS.delete;
  const DetachIcon = EDITOR_ICONS.close;

  const title = target.kind === "asset" ? "Assetを削除" : "Folderを削除";
  const referenceCount = target.kind === "asset" ? target.references.length : 0;
  // Only an Asset held by other documents can be unlinked from here. A Folder
  // is blocked by its own contents, which the author moves or deletes instead.
  const detachable = target.kind === "asset" && referenceCount > 0;
  const blockedMessage =
    target.kind === "asset"
      ? `${referenceCount}件の参照があります。参照を外すと削除できます。`
      : target.analysis.assetCount > 0
        ? `${target.analysis.assetCount}件のAssetが入っています。中身を移動してから削除してください。`
        : `${target.analysis.childFolderCount}件の子Folderがあります。子Folderを移動または削除してから操作してください。`;

  return (
    <EditorDialog
      onDismiss={onCancel}
      ariaLabelledBy="asset-delete-dialog-title"
      ariaDescribedBy="asset-delete-dialog-description"
      backdropClassName="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
      surfaceClassName="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
    >
        <header data-app-modal-header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className={`rounded-lg p-2 ${target.canDelete ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
            <DeleteIcon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="asset-delete-dialog-title" className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-700" title={target.name}>{target.name}</p>
          </div>
        </header>

        <div data-app-modal-body className="min-h-0 overflow-y-auto px-5 py-4">
          <p id="asset-delete-dialog-description" className="text-xs leading-5 text-slate-600">
            {target.canDelete
              ? `Assetsから削除します。この操作は「元に戻す」で復元できます。`
              : blockedMessage}
          </p>
          {detachable ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              参照を外すと、Material slotは空になり、Geometryのように参照なしでは成立しないComponentは外れます。Entityは残り、「元に戻す」で復元できます。
            </p>
          ) : null}

          {target.kind === "asset" && referenceCount > 0 ? (
            <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <ul className="space-y-1.5" aria-label="Assetの参照元">
                {target.references.map((reference) => (
                  <li key={assetReferenceKey(reference)} className="rounded border border-amber-100 bg-white px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{reference.ownerName}</span>
                      <span className="shrink-0 text-[11px] font-medium text-amber-800">{assetReferenceKindLabel(reference.kind)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{reference.detail}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] text-slate-500">
                        {assetReferenceDetachEffectLabel(reference.detachEffect)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onRevealReference(reference)}
                          title={`${reference.ownerName}を選択して参照元を確認`}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                        >
                          選択
                        </button>
                        <button
                          type="button"
                          onClick={() => onDetachReference(reference)}
                          aria-label={`${reference.ownerName}の参照を外す`}
                          title={`${reference.ownerName}の参照を外す（${assetReferenceDetachEffectLabel(reference.detachEffect)}）`}
                          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <DetachIcon size={12} aria-hidden="true" />
                          外す
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer data-app-modal-footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {target.canDelete || detachable ? "キャンセル" : "閉じる"}
          </button>
          {target.canDelete ? (
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1.5 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <DeleteIcon size={13} aria-hidden="true" />
              削除
            </button>
          ) : detachable ? (
            <button
              type="button"
              onClick={onDetachAllReferences}
              title={`${referenceCount}件の参照をすべて外してから削除`}
              className="flex items-center gap-1.5 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <DeleteIcon size={13} aria-hidden="true" />
              参照を外して削除
            </button>
          ) : null}
        </footer>
    </EditorDialog>
  );
}
