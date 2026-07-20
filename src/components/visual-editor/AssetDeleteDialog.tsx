import { useEffect, useRef } from "react";
import type {
  AssetFolderDeletionAnalysis,
  AssetReferenceLocation,
} from "../../lib/visual-editor";
import { assetReferenceKindLabel } from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

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
}: {
  target: AssetDeleteDialogTarget;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const DeleteIcon = EDITOR_ICONS.delete;

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const title = target.kind === "asset" ? "Assetを削除" : "Folderを削除";
  const blockedMessage =
    target.kind === "asset"
      ? `${target.references.length}件の参照があります。先に参照元で別のAssetへ置き換えるか、参照を外してください。`
      : target.analysis.assetCount > 0
        ? `${target.analysis.assetCount}件のAssetが入っています。中身を移動してから削除してください。`
        : `${target.analysis.childFolderCount}件の子Folderがあります。子Folderを移動または削除してから操作してください。`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-delete-dialog-title"
        aria-describedby="asset-delete-dialog-description"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className={`rounded-lg p-2 ${target.canDelete ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
            <DeleteIcon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="asset-delete-dialog-title" className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-700" title={target.name}>{target.name}</p>
          </div>
        </header>

        <div className="px-5 py-4">
          <p id="asset-delete-dialog-description" className="text-xs leading-5 text-slate-600">
            {target.canDelete
              ? `Assetsから削除します。この操作は「元に戻す」で復元できます。`
              : blockedMessage}
          </p>

          {target.kind === "asset" && target.references.length > 0 ? (
            <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <ul className="space-y-1.5" aria-label="Assetの参照元">
                {target.references.map((reference, index) => (
                  <li key={`${reference.kind}/${reference.ownerId}/${reference.detail}/${index}`} className="rounded border border-amber-100 bg-white px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{reference.ownerName}</span>
                      <span className="shrink-0 text-[11px] font-medium text-amber-800">{assetReferenceKindLabel(reference.kind)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{reference.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {target.canDelete ? "キャンセル" : "閉じる"}
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
          ) : null}
        </footer>
      </section>
    </div>
  );
}
