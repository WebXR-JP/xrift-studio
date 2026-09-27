import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, Upload } from "lucide-react";
import { imageDataUrlToPng } from "../lib/project-thumbnail";
import { readBrowserFile } from "../lib/browser-project-storage";
import { tauri } from "../lib/tauri";
import {
  askBrowserToSaveXriftApiKey,
  canUseBrowserPasswordManager,
  readSavedXriftApiKey,
} from "../lib/visual-editor/browser-api-key";
import type { PrototypeVisualProject } from "../lib/visual-editor/prototype-project";
import type { XriftUploadResult } from "../lib/visual-editor/publish";

type WebUploadState =
  | { phase: "review" }
  | { phase: "running"; label: string; percent: number; detail?: string }
  | { phase: "done"; result: XriftUploadResult }
  | { phase: "save-failed"; result: XriftUploadResult; message: string }
  | { phase: "failed"; message: string }
  | { phase: "needs-check"; message: string };

const DEFAULT_DESCRIPTION = "XRift Studioで制作するビジュアルプロジェクト";

function metadataReady(bundle: PrototypeVisualProject): boolean {
  const { title, description } = bundle.project.metadata;
  return Boolean(title.trim() && description.trim());
}

function hasSampleMetadata(bundle: PrototypeVisualProject): boolean {
  const { title, description } = bundle.project.metadata;
  return title.trim() === "新しいワールド" || title.trim() === "サンプルワールド" ||
    description.trim() === DEFAULT_DESCRIPTION ||
    description.trim() === "React Three FiberとRapierで作られたサンプルワールドです";
}

function uploadedWorldId(result: XriftUploadResult): string {
  return result.worldId ?? result.contentId ?? "";
}

/** One publish attempt. The API key lives only in this mounted dialog. */
export function WebUploadDialog({ bundle, projectPath, thumbnailRefreshKey, thumbnailCaptureBusy, thumbnailCaptureError, onCaptureThumbnail, onClose, onExport, onUploaded }: {
  bundle: PrototypeVisualProject;
  projectPath: string;
  thumbnailRefreshKey: number;
  thumbnailCaptureBusy: boolean;
  thumbnailCaptureError: string | null;
  onCaptureThumbnail: () => void;
  onClose: () => void;
  onExport: () => void;
  onUploaded: (bundle: PrototypeVisualProject, result: XriftUploadResult) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [canSaveWithBrowser, setCanSaveWithBrowser] = useState(canUseBrowserPasswordManager);
  const [savedKeyInUse, setSavedKeyInUse] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const tokenEdited = useRef(false);
  const [state, setState] = useState<WebUploadState>({ phase: "review" });
  const [thumbnail, setThumbnail] = useState<Uint8Array | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  const [thumbnailSaving, setThumbnailSaving] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const running = state.phase === "running";
  const isWorld = bundle.project.projectKind === "world";
  const complete = metadataReady(bundle);
  const sampleMetadata = hasSampleMetadata(bundle);
  const targetWorldId = bundle.project.lastPublication?.worldId ?? bundle.project.lastPublication?.contentId;

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  useEffect(() => {
    if (!canSaveWithBrowser) return;
    let active = true;
    void readSavedXriftApiKey().then((saved) => {
      if (active && saved && !tokenEdited.current) {
        setToken(saved);
        setSavedKeyInUse(true);
        setCredentialMessage("ブラウザのパスワード管理機能からキーを読み込みました。");
      }
    }).catch((error: unknown) => {
      if (active && error instanceof Error && (error.name === "NotSupportedError" || error.name === "SecurityError")) {
        setCanSaveWithBrowser(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setThumbnailLoading(true);
    void readBrowserFile(projectPath, "public/thumbnail.png")
      .then((bytes) => { if (active) setThumbnail(bytes); })
      .catch((error: unknown) => {
        if (active && !(error instanceof Error && error.message.includes("見つかりません"))) {
          setThumbnailError("サムネイルを読み込めませんでした。もう一度選択してください。");
        }
      })
      .finally(() => { if (active) setThumbnailLoading(false); });
    return () => { active = false; };
  }, [projectPath, thumbnailRefreshKey]);

  useEffect(() => {
    if (!thumbnail) { setThumbnailUrl(null); return; }
    const url = URL.createObjectURL(new Blob([new Uint8Array(thumbnail).buffer], { type: "image/png" }));
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const close = () => { setToken(""); onClose(); };

  const chooseSavedKey = async () => {
    try {
      const saved = await readSavedXriftApiKey("required");
      if (saved) {
        tokenEdited.current = false;
        setToken(saved);
        setSavedKeyInUse(true);
        setCredentialMessage("ブラウザのパスワード管理機能からキーを読み込みました。");
      } else {
        setCredentialMessage("このサイト用の保存済みキーが見つかりませんでした。");
      }
    } catch {
      setCredentialMessage("保存済みキーを読み込めませんでした。手入力してください。");
    }
  };

  const saveCredential = async () => {
    if (!canSaveWithBrowser || credentialSaving || !token.trim()) return;
    setCredentialSaving(true);
    setCredentialMessage("ブラウザの保存確認と保存済みキーの選択を待っています。");
    try {
      const result = await askBrowserToSaveXriftApiKey(token.trim());
      if (result === "verified") {
        setSavedKeyInUse(true);
        setToken("");
        setCredentialMessage("保存済みキーを確認しました。次回の公開時はブラウザからキーを選べます。");
      } else {
        setCredentialMessage("保存を確認できませんでした。ブラウザの保存確認とキー選択を完了したか確かめてください。ここから再試行できます。");
      }
    } catch (error) {
      if (error instanceof Error && (error.name === "NotSupportedError" || error.name === "SecurityError")) {
        setCanSaveWithBrowser(false);
        setCredentialMessage("このブラウザではパスワード管理機能への保存を利用できません。次回はキーを入力してください。");
      } else {
        setCredentialMessage("ブラウザに保存できませんでした。パスワード保存の設定を確認して、もう一度試してください。");
      }
    } finally {
      setCredentialSaving(false);
    }
  };

  const chooseThumbnail = async (file: File | undefined) => {
    if (!file || thumbnailSaving) return;
    setThumbnailSaving(true);
    setThumbnailError(null);
    const sourceUrl = URL.createObjectURL(file);
    try {
      const png = await imageDataUrlToPng(sourceUrl);
      await tauri.writeThumbnail(projectPath, png);
      setThumbnail(await readBrowserFile(projectPath, "public/thumbnail.png"));
    } catch (error) {
      setThumbnailError(error instanceof Error ? error.message : "サムネイルを保存できませんでした。");
    } finally {
      URL.revokeObjectURL(sourceUrl);
      setThumbnailSaving(false);
    }
  };

  const start = async () => {
    if (running || !isWorld) return;
    if (!complete) {
      setState({ phase: "failed", message: "タイトルと説明を入力してください。「シーン設定」内の「公開情報」で編集できます。" });
      return;
    }
    const submittedToken = (token || tokenInput.current?.value || "").trim();
    if (!submittedToken) {
      setState({ phase: "failed", message: "XRift APIキーを入力してください。設定画面で write:worlds 権限付きのキーを発行できます。" });
      return;
    }
    setToken(submittedToken);
    tokenEdited.current = true;
    if (thumbnailLoading || thumbnailSaving) {
      setState({ phase: "failed", message: "サムネイルの処理が終わってから送信してください。" });
      return;
    }
    setShowToken(false);
    setCredentialMessage(null);
    setState({ phase: "running", label: "送信するファイルを準備しています", percent: 4 });
    let remoteStarted = false;
    let result: XriftUploadResult;
    try {
      const { loadRuntimeShell, uploadVisualProjectFromWeb } = await import("../lib/visual-editor/web-upload");
      const shellFiles = await loadRuntimeShell();
      result = await uploadVisualProjectFromWeb({
        kind: "world",
        documents: {
          project: bundle.project,
          scenes: { [bundle.scene.sceneId]: bundle.scene },
          assets: bundle.assets,
          prefabs: bundle.prefabs,
        },
        token: submittedToken,
        shellFiles,
        thumbnail: thumbnail ?? undefined,
        worldId: targetWorldId,
        readAssetBytes: (relativePath) => readBrowserFile(projectPath, relativePath),
        report: (progress) => {
          if (progress.stage === "uploading" || progress.stage === "processing") remoteStarted = true;
          setState({ phase: "running", label: progress.label, percent: progress.percent ?? 0, detail: progress.detail });
        },
        signal: new AbortController().signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retrySafe = error instanceof Error && "retrySafe" in error && error.retrySafe === true;
      setState(remoteStarted && !retrySafe ? { phase: "needs-check", message } : { phase: "failed", message });
      return;
    }
    // Keep the key in this mounted dialog only so saving can be started by a
    // direct user action after the upload. close() discards it.
    if (!canSaveWithBrowser || savedKeyInUse) setToken("");
    try {
      await onUploaded(bundle, result);
      setState({ phase: "done", result });
    } catch (error) {
      setState({ phase: "save-failed", result, message: error instanceof Error ? error.message : String(error) });
    }
  };

  const retrySavingResult = async (result: XriftUploadResult) => {
    setState({ phase: "running", label: "公開結果をこのブラウザに保存しています", percent: 99 });
    try {
      await onUploaded(bundle, result);
      setState({ phase: "done", result });
    } catch (error) {
      setState({ phase: "save-failed", result, message: error instanceof Error ? error.message : String(error) });
    }
  };

  return <dialog
    ref={dialog}
    aria-labelledby="web-upload-title"
    aria-busy={running || credentialSaving}
    className="preview-dialog-theme m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl open:flex backdrop:bg-zinc-900/45"
    onKeyDown={(event) => event.stopPropagation()}
    onCancel={(event) => { event.preventDefault(); if (!running && !credentialSaving) close(); }}
  >
    <h2 id="web-upload-title" className="shrink-0 border-b border-zinc-200 px-5 py-4 text-base font-semibold">XRiftへ公開</h2>
    <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4 text-sm">
      {!isWorld ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">ブラウザ版から公開できるのはワールドです。アイテムはプロジェクトを書き出してデスクトップ版から公開してください。</p> : null}
      {isWorld && state.phase !== "done" && state.phase !== "save-failed" ? <>
        <section aria-label="公開する作品" className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-500">公開する作品</p>
          <p className="font-semibold text-zinc-900">{bundle.project.metadata.title || "タイトル未設定"}</p>
          <p className="text-xs leading-relaxed text-zinc-600">{bundle.project.metadata.description || "説明未設定"}</p>
          <p className="break-all text-xs text-zinc-500">{targetWorldId ? `更新先: ${targetWorldId}` : "新しいワールドとして送信"}</p>
        </section>
        {!complete ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">タイトルと説明が未入力です。閉じて「シーン設定」内の「公開情報」で編集してください。</p> : null}
        {complete && sampleMetadata ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">タイトルまたは説明が初期値です。この内容で送信できます。作品に合わせて変える場合は「シーン設定」内の「公開情報」で編集してください。</p> : null}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-zinc-700">サムネイル</p>
          {thumbnailUrl ? <img src={thumbnailUrl} alt="公開用サムネイル" className="max-h-40 w-full rounded-lg border border-zinc-200 bg-zinc-100 object-contain" /> : <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-600">サムネイルは未設定です。このまま送信することもできます。</p>}
          <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCaptureThumbnail} disabled={running || thumbnailCaptureBusy || thumbnailSaving} className="preview-button preview-button-light min-h-10 text-xs disabled:opacity-50">{thumbnailCaptureBusy ? "シーンを撮影中…" : "シーンから撮影"}</button>
          <label className="preview-button preview-button-light inline-flex min-h-10 cursor-pointer text-xs">
            {thumbnailSaving ? "画像を保存中…" : thumbnail ? "画像を変更" : "画像を選ぶ"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={running || thumbnailSaving} onChange={(event) => { void chooseThumbnail(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          </div>
          {thumbnailCaptureError ? <p role="alert" className="text-xs text-rose-700">{thumbnailCaptureError}</p> : null}
          {thumbnailError ? <p role="alert" className="text-xs text-rose-700">{thumbnailError}</p> : null}
        </section>
        <section className="space-y-2 border-t border-zinc-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="web-upload-token" className="text-xs font-semibold text-zinc-700">XRift APIキー</label>
            <a href="https://app.xrift.net/settings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 underline underline-offset-2">設定画面で取得 <ExternalLink size={12} aria-hidden="true" /></a>
          </div>
          <div className="flex items-center gap-2">
            <input ref={tokenInput} id="web-upload-token" type={showToken ? "text" : "password"} value={token} onChange={(event) => { tokenEdited.current = true; setSavedKeyInUse(false); setToken(event.target.value); setCredentialMessage(null); }} placeholder="xrift_sk_..." autoComplete="current-password" spellCheck={false} disabled={running} className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 font-mono text-sm focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100" />
            <button type="button" onClick={() => setShowToken(!showToken)} disabled={running} aria-label={showToken ? "APIキーを隠す" : "APIキーを表示"} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 disabled:opacity-50">{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">設定画面で <code>write:worlds</code> を付けて発行してください。XRift Studio はキーをプロジェクトや Web Storage に保存しません。</p>
          {canSaveWithBrowser ? <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            <p className="leading-relaxed text-zinc-600">送信が完了したら、この画面からブラウザのパスワード管理機能へキーを保存できます。保存と端末間の同期はブラウザの設定に従います。</p>
            {!token ? <button type="button" onClick={() => void chooseSavedKey()} disabled={running} className="font-medium text-brand-600 underline underline-offset-2 disabled:opacity-50">保存済みキーを選ぶ</button> : null}
          </div> : null}
          {credentialMessage ? <p role="status" className="text-xs text-zinc-600">{credentialMessage}</p> : null}
        </section>
        <p className="text-xs leading-relaxed text-zinc-500">スクリプトを含むワールドはデスクトップ版から公開してください。</p>
      </> : null}
      {running ? <div role="status" className="space-y-2">
        <p className="text-sm font-semibold">{state.label}</p>
        <div role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100} aria-label="公開の進捗" className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-brand-600 transition-[width]" style={{ width: `${state.percent}%` }} /></div>
        {state.detail ? <p className="break-all text-xs text-zinc-500">{state.detail}</p> : null}
      </div> : null}
      {state.phase === "done" || state.phase === "save-failed" ? <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="font-semibold">{state.phase === "done" ? "XRiftへのファイル送信が完了しました" : "ファイル送信は完了しました"}</p>
        <p className="break-all text-xs text-zinc-600">ワールドID: {uploadedWorldId(state.result)}</p>
        {state.result.versionNumber !== undefined ? <p className="text-xs text-zinc-600">バージョン: {state.result.versionNumber}</p> : null}
        {state.phase === "save-failed" ? <p role="alert" className="text-xs leading-relaxed text-rose-700">公開結果をこのブラウザに保存できませんでした。{state.message} 同じワールドを再送せず、まず保存をやり直してください。</p> : <p className="text-xs text-zinc-500">送信完了だけでは再生可能とは限りません。XRiftのマイワールドで状態を確認してください。</p>}
        {canSaveWithBrowser && !savedKeyInUse && token ? <button type="button" onClick={() => void saveCredential()} disabled={credentialSaving} className="preview-button preview-button-light min-h-10 text-xs disabled:opacity-50">{credentialSaving ? "キーを保存中…" : "APIキーをブラウザに保存"}</button> : null}
        {credentialMessage ? <p role="status" className="text-xs text-zinc-600">{credentialMessage}</p> : null}
        <p className="text-xs text-zinc-500">この画面を閉じると Play に戻れます。</p>
        <a className="preview-button preview-button-light inline-flex min-h-10 text-xs" href="https://app.xrift.net/worlds" target="_blank" rel="noreferrer">ワールド一覧を開く <ExternalLink size={13} aria-hidden="true" /></a>
      </div> : null}
      {state.phase === "failed" ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{state.message}</p> : null}
      {state.phase === "needs-check" ? <div role="alert" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><p>{state.message}</p><p>送信結果を確認できません。XRiftのワールド一覧で公開状態を確かめてください。結果が分かるまで再送しないでください。</p><a href="https://app.xrift.net/worlds" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">ワールド一覧を開く <ExternalLink size={12} aria-hidden="true" /></a></div> : null}
    </div>
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3">
      <button type="button" onClick={close} disabled={running || credentialSaving} className="preview-button preview-button-light min-h-11 disabled:opacity-50">{state.phase === "done" || complete ? "閉じる" : "編集に戻る"}</button>
      {!isWorld ? <button type="button" onClick={onExport} className="preview-button preview-button-primary min-h-11">プロジェクトを書き出す</button> : null}
      {state.phase === "save-failed" ? <button type="button" onClick={() => void retrySavingResult(state.result)} className="preview-button preview-button-primary min-h-11">公開結果を保存し直す</button> : null}
      {isWorld && (state.phase === "review" || state.phase === "failed") ? <button type="button" onClick={() => void start()} className="preview-button preview-button-primary min-h-11"><Upload size={15} aria-hidden="true" />{targetWorldId ? "このワールドを更新" : "ワールドをアップロード"}</button> : null}
    </div>
  </dialog>;
}
