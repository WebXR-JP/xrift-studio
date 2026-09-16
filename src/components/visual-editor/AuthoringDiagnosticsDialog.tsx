import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, X } from "lucide-react";
import { collectAuthoringDiagnostics, type AuthoringDiagnostic } from "../../lib/visual-editor/authoring-diagnostics";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";

export function AuthoringDiagnosticsDialog({ bundle, onClose, onSelect, onShowColliders, onContinuePublish }: {
  bundle: PrototypeVisualProject;
  onClose: () => void;
  onSelect: (issue: AuthoringDiagnostic) => void;
  onShowColliders: () => void;
  onContinuePublish?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const issues = useMemo(() => collectAuthoringDiagnostics(bundle), [bundle]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  useEffect(() => { setPage(0); }, [issues]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialogRef} aria-labelledby="authoring-check-heading"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[calc(100dvh-24px)] w-[min(42rem,calc(100vw-24px))] overflow-y-auto rounded-lg border border-slate-300 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-black/30">
    <section onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
        <h2 id="authoring-check-heading" className="text-sm font-semibold">制作データの確認</h2>
        <button type="button" aria-label="制作データの確認を閉じる" title="閉じる" onClick={onClose} className="rounded p-2 hover:bg-slate-100"><X size={16} /></button>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-xs leading-5 text-slate-600">現在のシーンとAssetsの参照・設定を確認します。ファイルの実在、Scriptの実行、公開サーバーへの接続は検査しません。制作データは変更しません。</p>
        <p role="status" className="flex items-center gap-2 text-sm font-semibold">
          {issues.length ? <AlertTriangle size={17} aria-hidden="true" /> : <CircleCheck size={17} aria-hidden="true" />}
          {issues.length ? `エラー ${errors}件・注意 ${issues.length - errors}件` : "この確認で見つかった問題はありません"}
        </p>
        <ul className="space-y-2">
          {issues.slice(page * 30, (page + 1) * 30).map((issue, index) => <li key={`${page}-${index}`} className="rounded border border-slate-200 p-3 text-xs">
            <p className="mb-1 font-semibold">{issue.severity === "error" ? "エラー" : "注意"} · {issue.entityId ? bundle.scene.entities[issue.entityId]?.name ?? issue.entityId : issue.assetId ? bundle.assets.assets[issue.assetId]?.name ?? issue.assetId : "シーン"}</p>
            <p className="break-words leading-5">{issue.message}</p>
            {(issue.entityId && bundle.scene.entities[issue.entityId]) || (issue.assetId && bundle.assets.assets[issue.assetId]) ? (
              <button type="button" onClick={() => onSelect(issue)} className="mt-2 min-h-9 rounded border px-3 font-semibold hover:bg-slate-50">{issue.entityId ? "Entityを選択" : "Assetを選択"}</button>
            ) : null}
          </li>)}
        </ul>
        {issues.length > 30 ? <div className="flex items-center justify-between text-xs">
          <button type="button" disabled={!page} onClick={() => setPage((current) => current - 1)} className="min-h-10 rounded border px-3 disabled:opacity-40">前のページ</button>
          <span>{page + 1} / {Math.ceil(issues.length / 30)}</span>
          <button type="button" disabled={(page + 1) * 30 >= issues.length} onClick={() => setPage((current) => current + 1)} className="min-h-10 rounded border px-3 disabled:opacity-40">次のページ</button>
        </div> : null}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t px-4 py-3 text-xs">
        <button type="button" onClick={onShowColliders} className="min-h-10 rounded border px-3">Colliderを表示して確認</button>
        <button type="button" onClick={onClose} className="min-h-10 rounded border px-3">編集へ戻る</button>
        {onContinuePublish ? <button type="button" onClick={onContinuePublish} title="公開画面で改めて検証します。この操作だけでは公開しません" className="min-h-10 rounded bg-brand-600 px-3 font-semibold text-white hover:bg-brand-700">公開画面へ</button> : null}
      </footer>
    </section>
  </dialog>;
}
