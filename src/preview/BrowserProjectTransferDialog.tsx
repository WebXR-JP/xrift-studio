import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { PROJECT_PACKAGE_MIME_TYPE } from "../lib/project-package";
import { useEditorDevice } from "../components/visual-editor/useEditorDevice";

export type BrowserRecentProject = { path: string; name: string; title: string; kind: "world" | "item"; modifiedAt: string };

export type BrowserTransferState =
  | { phase: "select"; operation: "import" }
  | { phase: "create"; operation: "open"; kind: "world" | "item" }
  | { phase: "preparing"; operation: "export" | "import" | "open" }
  | { phase: "failed"; operation: "export" | "import" | "open"; message: string }
  | { phase: "ready"; blob: Blob; fileName: string; fileCount: number };

/** Keep preparation separate from the user's save tap for Safari activation. */
export function BrowserProjectTransferDialog({ state, onClose, onRetry, onPickFile, recentProjects, recentProjectsLoading, activeProjectPath, onOpenRecent, onNewProject, onCreateProject, onChooseProject }: {
  state: BrowserTransferState | null;
  onClose: () => void;
  onRetry: () => void;
  onPickFile: () => void;
  recentProjects: BrowserRecentProject[];
  recentProjectsLoading: boolean;
  activeProjectPath?: string;
  onOpenRecent: (path: string) => void;
  onNewProject: (kind: "world" | "item") => void;
  onCreateProject: (kind: "world" | "item", name: string) => void;
  onChooseProject: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [downloadStarted, setDownloadStarted] = useState(false);
  const { tablet, viewportHeight } = useEditorDevice();
  const ready = state?.phase === "ready" ? state : null;
  const busy = state?.phase === "preparing" || sharing;

  useEffect(() => {
    if (state?.phase === "create") setProjectName("");
    if (state && !dialog.current?.open) dialog.current?.showModal();
    if (!state) dialog.current?.close();
  }, [state]);

  useEffect(() => {
    setShareMessage(null);
    setDownloadStarted(false);
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
      className={`${tablet ? "fixed inset-x-0 top-4 bottom-auto mx-auto my-0" : "m-auto"} max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl open:flex backdrop:bg-zinc-900/30`}
      style={tablet && viewportHeight ? { maxHeight: Math.max(160, viewportHeight - 32) } : undefined}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    >
      <h2 id="browser-transfer-title" className="shrink-0 border-b border-zinc-200 px-5 py-4 text-base font-semibold">
        {state?.phase === "create" ? `新しい${state.kind === "world" ? "ワールド" : "アイテム"}` : state?.phase === "ready" || (state && state.operation === "export") ? "プロジェクトを書き出す" : "プロジェクトを開く"}
      </h2>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
      {state?.phase === "create" ? <form id="browser-new-project" className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (projectName.trim()) onCreateProject(state.kind, projectName.trim());
      }}>
        <label className="block text-sm font-medium text-zinc-700">作品の名前
          <input type="text" required maxLength={96} autoComplete="off" enterKeyHint="done" value={projectName} onChange={(event) => setProjectName(event.currentTarget.value)} className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-500">保存した作品を見分ける名前です。書き出すファイル名にも使います。</p>
      </form> : null}
      {state?.phase === "preparing" ? (
        <p role="status" className="mt-5 flex items-center gap-3 text-sm text-zinc-600">
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          {state.operation === "export" ? "シーンと素材をプロジェクトファイルにまとめています…" : "プロジェクトを読み込んでいます…"}
        </p>
      ) : null}
      {state?.phase === "select" ? <div className="mt-4 space-y-4 text-sm text-zinc-600">
        <p>保存した作品を選ぶか、.xriftstudioファイルを開きます。</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onNewProject("world")} className="preview-button preview-button-light min-h-11">新規ワールド</button>
          <button type="button" onClick={() => onNewProject("item")} className="preview-button preview-button-light min-h-11">新規アイテム</button>
        </div>
        {recentProjectsLoading ? <p role="status" className="text-xs">保存済みのプロジェクトを読み込んでいます…</p> : recentProjects.length ? <div>
          <h3 className="mb-2 text-xs font-semibold text-zinc-500">このブラウザに保存したプロジェクト</h3>
          <div className="space-y-1 rounded-lg border border-zinc-200 p-1">
            {recentProjects.map((project) => <button key={project.path} type="button" onClick={() => onOpenRecent(project.path)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-zinc-100 focus-visible:outline-brand-500">
              <span className="min-w-0"><span className="block truncate font-medium text-zinc-800">{project.title || project.name}</span><span className="mt-1 block text-xs text-zinc-500">{Number.isFinite(Date.parse(project.modifiedAt)) ? new Date(project.modifiedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span></span>
              <span className="shrink-0 text-xs text-zinc-500">{project.path === activeProjectPath ? "編集中" : project.kind === "world" ? "ワールド" : "アイテム"}</span>
            </button>)}
          </div>
        </div> : <p className="text-xs">保存済みのプロジェクトがない場合は、新規作成かファイルの取り込みから始めます。</p>}
      </div> : null}
      {ready ? (
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-600">
          <p>作品と素材を一つのファイルにまとめました。「ファイルに保存」で手元に残せます。</p>
          <p className="break-all rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-medium text-zinc-800">
            {ready.fileName}<span className="ml-2 text-xs font-normal text-zinc-500">{(ready.blob.size / 1024 / 1024).toFixed(1)} MB / {ready.fileCount}ファイル</span>
          </p>
          <details className="rounded-lg border border-zinc-200 px-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-zinc-700">パソコンへ引き継ぐには</summary>
          <ol className="list-decimal space-y-2 pb-3 pl-5">
            <li>「ファイルに保存」で.xriftstudioファイルをダウンロードします。保存先はSafariのダウンロード一覧で確認できます。</li>
            <li>iCloud DriveなどでMacまたはWindowsへ渡します。</li>
            <li>パソコン版のプロジェクト一覧で「ファイルから取り込む」を選びます。公開はパソコンから行います。</li>
          </ol>
          </details>
          {downloadStarted ? <p role="status">ダウンロードを開始しました。Safariのダウンロード一覧で確認できます。</p> : null}
        </div>
      ) : null}
      {state?.phase === "failed" ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.message}</p> : null}
      {shareMessage ? <p role="status" className="mt-3 text-sm text-zinc-600">{shareMessage}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3">
        <button type="button" onClick={onClose} disabled={busy} className="preview-button preview-button-light min-h-11 disabled:opacity-50">閉じる</button>
        {state?.phase === "create" ? <><button type="button" onClick={onChooseProject} className="preview-button preview-button-light min-h-11">一覧へ戻る</button><button type="submit" form="browser-new-project" disabled={!projectName.trim()} className="preview-button preview-button-primary min-h-11 disabled:opacity-50">作成して開く</button></> : null}
        {state?.phase === "select" ? <button type="button" onClick={onPickFile} className="preview-button preview-button-primary min-h-11">ファイルを選ぶ</button> : null}
        {state?.phase === "failed" ? <button type="button" onClick={onRetry} className="preview-button preview-button-primary min-h-11">もう一度試す</button> : null}
        {state?.phase === "failed" && state.operation !== "export" ? <button type="button" onClick={onChooseProject} className="preview-button preview-button-light min-h-11">プロジェクトを選ぶ</button> : null}
        {ready && canShare ? <button type="button" onClick={() => void share()} disabled={busy} className="preview-button preview-button-light min-h-11"><Share2 size={16} />{sharing ? "共有中…" : "共有する"}</button> : null}
        {ready && url ? <a href={url} download={ready.fileName} onClick={() => setDownloadStarted(true)} className="preview-button preview-button-primary min-h-11"><Download size={16} />ファイルに保存</a> : null}
      </div>
    </dialog>
  );
}
