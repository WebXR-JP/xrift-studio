import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { PROJECT_PACKAGE_MIME_TYPE } from "../lib/project-package";

export type BrowserRecentProject = { path: string; name: string; title: string; kind: "world" | "item"; modifiedAt: string };

export type BrowserTransferState =
  | { phase: "select"; operation: "import" }
  | { phase: "preparing"; operation: "export" | "import" | "open" }
  | { phase: "failed"; operation: "export" | "import" | "open"; message: string }
  | { phase: "ready"; blob: Blob; fileName: string; fileCount: number };

/** Keep preparation separate from the user's save tap for Safari activation. */
export function BrowserProjectTransferDialog({ state, onClose, onRetry, onPickFile, recentProjects, onOpenRecent, onNewProject, onChooseProject }: {
  state: BrowserTransferState | null;
  onClose: () => void;
  onRetry: () => void;
  onPickFile: () => void;
  recentProjects: BrowserRecentProject[];
  onOpenRecent: (path: string) => void;
  onNewProject: (kind: "world" | "item") => void;
  onChooseProject: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const ready = state?.phase === "ready" ? state : null;
  const busy = state?.phase === "preparing" || sharing;

  useEffect(() => {
    if (state && !dialog.current?.open) dialog.current?.showModal();
    if (!state) dialog.current?.close();
  }, [state]);

  useEffect(() => {
    setShareMessage(null);
    setUrl(null);
    if (!ready) return;
    const objectUrl = URL.createObjectURL(ready.blob);
    setUrl(objectUrl);
    // Safari can consume the download after the dialog has closed. Releasing
    // immediately after click/unmount can turn the saved file into an error.
    return () => { window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000); };
  }, [ready]);

  const sharedFile = ready ? new File([ready.blob], ready.fileName, { type: PROJECT_PACKAGE_MIME_TYPE }) : null;
  let canShare = false;
  try { canShare = Boolean(sharedFile && navigator.canShare?.({ files: [sharedFile] })); } catch { /* File sharing is optional. */ }

  const share = async () => {
    if (!sharedFile || sharing) return;
    setSharing(true);
    setShareMessage(null);
    try {
      await navigator.share({ files: [sharedFile], title: "XRift Studio プロジェクト" });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareMessage("共有を開けませんでした。「ファイルに保存」からプロジェクトファイルを保存してください。");
      }
    } finally { setSharing(false); }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="browser-transfer-title"
      aria-busy={busy}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-zinc-900/30"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    >
      <h2 id="browser-transfer-title" className="text-base font-semibold">
        {state?.phase === "ready" || (state && state.operation === "export") ? "プロジェクトを書き出す" : "プロジェクトを開く"}
      </h2>
      {state?.phase === "preparing" ? (
        <p role="status" className="mt-5 flex items-center gap-3 text-sm text-zinc-600">
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          {state.operation === "export" ? "シーンと素材をプロジェクトファイルにまとめています…" : "プロジェクトを読み込んでいます…"}
        </p>
      ) : null}
      {state?.phase === "select" ? <div className="mt-4 space-y-4 text-sm text-zinc-600">
        <p>このブラウザのプロジェクトを開くか、XRift Studioで書き出した.xriftstudioファイルを選びます。従来の.zipも開けます。</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onNewProject("world")} className="preview-button preview-button-light min-h-11">新規ワールド</button>
          <button type="button" onClick={() => onNewProject("item")} className="preview-button preview-button-light min-h-11">新規アイテム</button>
        </div>
        {recentProjects.length ? <div>
          <h3 className="mb-2 text-xs font-semibold text-zinc-500">このブラウザに保存したプロジェクト</h3>
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-1">
            {recentProjects.map((project) => <button key={project.path} type="button" onClick={() => onOpenRecent(project.path)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-zinc-100 focus-visible:outline-brand-500">
              <span className="min-w-0 truncate font-medium text-zinc-800">{project.title || project.name}</span>
              <span className="shrink-0 text-xs text-zinc-500">{project.kind === "world" ? "ワールド" : "アイテム"}</span>
            </button>)}
          </div>
        </div> : <p className="text-xs">保存済みのプロジェクトがない場合は、新規作成かファイルの取り込みから始めます。</p>}
      </div> : null}
      {ready ? (
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-600">
          <p>編集データと取り込んだ素材をまとめた.xriftstudioファイルです。保存して、パソコンのXRift Studioで制作を続けられます。</p>
          <p className="break-all rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-medium text-zinc-800">
            {ready.fileName}<span className="ml-2 text-xs font-normal text-zinc-500">{(ready.blob.size / 1024 / 1024).toFixed(1)} MB / {ready.fileCount}ファイル</span>
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>「ファイルに保存」で.xriftstudioファイルをダウンロードします。保存先はSafariのダウンロード一覧で確認できます。</li>
            <li>iCloud DriveなどでMacまたはWindowsへ渡します。</li>
            <li>パソコン版のプロジェクト一覧で「ファイルから取り込む」を選びます。公開はパソコンから行います。</li>
          </ol>
          <p className="text-xs">ファイルは新しい未公開のプロジェクトとして取り込まれます。同じiPadでも「開く」から制作を再開できます。</p>
        </div>
      ) : null}
      {state?.phase === "failed" ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.message}</p> : null}
      {shareMessage ? <p role="status" className="mt-3 text-sm text-zinc-600">{shareMessage}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="preview-button preview-button-light min-h-11 disabled:opacity-50">閉じる</button>
        {state?.phase === "select" ? <button type="button" onClick={onPickFile} className="preview-button preview-button-primary min-h-11">ファイルを選ぶ</button> : null}
        {state?.phase === "failed" ? <button type="button" onClick={onRetry} className="preview-button preview-button-primary min-h-11">もう一度試す</button> : null}
        {state?.phase === "failed" && state.operation !== "export" ? <button type="button" onClick={onChooseProject} className="preview-button preview-button-light min-h-11">プロジェクトを選ぶ</button> : null}
        {ready && canShare ? <button type="button" onClick={() => void share()} disabled={busy} className="preview-button preview-button-light min-h-11"><Share2 size={16} />{sharing ? "共有中…" : "共有する"}</button> : null}
        {ready && url ? <a href={url} download={ready.fileName} className="preview-button preview-button-primary min-h-11"><Download size={16} />ファイルに保存</a> : null}
      </div>
    </dialog>
  );
}
