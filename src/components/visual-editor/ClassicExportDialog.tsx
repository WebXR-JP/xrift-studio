import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  FolderOpen,
  Loader2,
  PackageCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import type { ProjectKind } from "../../lib/tauri";
import type {
  ClassicExportIntegration,
  ClassicExportProgress,
  ClassicExportResult,
  ClassicExportTarget,
} from "../../lib/visual-editor";
import { ClassicExportError } from "../../lib/visual-editor";

type Props = {
  open: boolean;
  projectKind: ProjectKind;
  projectName: string;
  onClose: () => void;
  onChooseTarget: () => Promise<ClassicExportTarget | null>;
  onExport: (
    target: ClassicExportTarget,
    integration: ClassicExportIntegration,
    installDependencies: boolean,
    report: (progress: ClassicExportProgress) => void,
  ) => Promise<ClassicExportResult>;
  onOpenFolder: (path: string) => void | Promise<void>;
  onOpenVSCode: (path: string) => void | Promise<void>;
  onOpenTerminal: (path: string) => void | Promise<void>;
};

export function ClassicExportDialog({
  open,
  projectKind,
  projectName,
  onClose,
  onChooseTarget,
  onExport,
  onOpenFolder,
  onOpenVSCode,
  onOpenTerminal,
}: Props) {
  const [target, setTarget] = useState<ClassicExportTarget | null>(null);
  const [integration, setIntegration] =
    useState<ClassicExportIntegration>("component");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [installDependencies, setInstallDependencies] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState<ClassicExportProgress | null>(null);
  const [result, setResult] = useState<ClassicExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const busy = choosing || progress !== null;
  const canExport =
    target !== null &&
    !busy &&
    (integration !== "replace-entry" || replaceConfirmed);

  useEffect(() => {
    if (!open) return;
    setTarget(null);
    setIntegration("component");
    setReplaceConfirmed(false);
    setInstallDependencies(true);
    setChoosing(false);
    setProgress(null);
    setResult(null);
    setError(null);
    setErrorDetails([]);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const chooseTarget = async () => {
    if (busy) return;
    setChoosing(true);
    setError(null);
    setErrorDetails([]);
    try {
      const next = await onChooseTarget();
      if (!next) return;
      setTarget(next);
      setInstallDependencies(next.canInstallAutomatically);
      setResult(null);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Classicプロジェクトを確認できませんでした。",
      );
    } finally {
      setChoosing(false);
    }
  };

  const startExport = async () => {
    if (!target || !canExport) return;
    setError(null);
    setErrorDetails([]);
    setResult(null);
    setCopied(false);
    setProgress({
      stage: "saving",
      label: "書き出しを準備しています",
      percent: 2,
    });
    try {
      const next = await onExport(
        target,
        integration,
        installDependencies,
        setProgress,
      );
      setResult(next);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Classicへの書き出しに失敗しました。",
      );
      setErrorDetails(
        exportError instanceof ClassicExportError
          ? exportError.diagnostics.map((diagnostic) => diagnostic.message)
          : [],
      );
    } finally {
      setProgress(null);
    }
  };

  const copySnippet = async () => {
    if (!result?.importSnippet) return;
    try {
      await navigator.clipboard.writeText(result.importSnippet);
      setCopied(true);
    } catch {
      setError("接続コードをコピーできませんでした。VS Codeで生成ファイルを確認してください。");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="classic-export-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
              Classic Export
            </p>
            <h2 id="classic-export-title" className="mt-1 text-xl font-semibold text-slate-950">
              XRift Classicへ書き出す
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              {projectName}のRuntime JSONとAssetを、選択したClassicプロジェクトへ一方向に追加します。
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Classic exportを閉じる"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          {result ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 text-emerald-700" size={22} aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-emerald-950">Classicへの書き出しが完了しました</h3>
                    <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                      Runtime JSON、Asset、接続コンポーネントを追加しました。
                      {result.packageInstallation === "installed"
                        ? " Runtime packageもインストール済みです。"
                        : " Runtime依存関係はpackage.jsonへ記録しました。"}
                    </p>
                  </div>
                </div>
              </div>

              {result.importSnippet ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">既存Sceneへ接続する</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        既存の{projectKind === "world" ? "World.tsx" : "Item.tsx"}へ次のコンポーネントを追加してください。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copySnippet()}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {copied ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
                      {copied ? "コピー済み" : "接続コードをコピー"}
                    </button>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    <code>{result.importSnippet}</code>
                  </pre>
                </div>
              ) : null}

              {result.installCommand ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-950">依存packageのinstallを完了する</h3>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    書き出し先で次のコマンドを実行してください。
                  </p>
                  <code className="mt-2 block rounded-lg bg-amber-950 px-3 py-2 text-xs text-amber-50">
                    {result.installCommand}
                  </code>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void onOpenFolder(result.targetPath)} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FolderOpen size={16} aria-hidden="true" /> フォルダーを開く
                </button>
                <button type="button" onClick={() => void onOpenVSCode(result.targetPath)} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Code2 size={16} aria-hidden="true" /> VS Codeで開く
                </button>
                <button type="button" onClick={() => void onOpenTerminal(result.targetPath)} className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
                  <TerminalSquare size={16} aria-hidden="true" /> ターミナルを開く
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">1. 書き出し先</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">package.json、xrift.json、{projectKind === "world" ? "World.tsx" : "Item.tsx"}を検査します。</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void chooseTarget()} className="flex shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50">
                    {choosing ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <FolderOpen size={16} aria-hidden="true" />}
                    {target ? "選び直す" : "Classicプロジェクトを選ぶ"}
                  </button>
                </div>
                {target ? (
                  <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                    <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Project</p><p className="mt-1 truncate text-sm font-semibold text-slate-900" title={target.packageName}>{target.packageName}</p></div>
                    <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Target</p><p className="mt-1 text-sm text-slate-800">{target.kind === "world" ? "World" : "Item"}</p></div>
                    <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Package manager</p><p className="mt-1 text-sm text-slate-800">{target.packageManager}</p></div>
                  </div>
                ) : null}
              </section>

              <section className={!target ? "pointer-events-none opacity-45" : undefined}>
                <h3 className="text-sm font-semibold text-slate-900">2. 接続方法</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-xl border p-4 ${integration === "component" ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 hover:bg-slate-50"}`}>
                    <span className="flex items-start gap-3"><input type="radio" name="classic-integration" checked={integration === "component"} onChange={() => { setIntegration("component"); setReplaceConfirmed(false); }} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-900">コンポーネントとして追加</span><span className="mt-1 block text-xs leading-5 text-slate-600">推奨。既存コードを保ち、接続コードと生成ファイルだけを追加します。</span></span></span>
                  </label>
                  <label className={`cursor-pointer rounded-xl border p-4 ${integration === "replace-entry" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "border-slate-200 hover:bg-slate-50"}`}>
                    <span className="flex items-start gap-3"><input type="radio" name="classic-integration" checked={integration === "replace-entry"} onChange={() => setIntegration("replace-entry")} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-900">エントリーを切り替える</span><span className="mt-1 block text-xs leading-5 text-slate-600">既存エントリーをバックアップし、Visual Sceneをプロジェクトの入口にします。</span></span></span>
                  </label>
                </div>
                {integration === "replace-entry" ? (
                  <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
                    <input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} className="mt-0.5" />
                    {target?.entryFile}をバックアップしたうえで置き換えることを確認しました
                  </label>
                ) : null}
              </section>

              <section className={!target ? "pointer-events-none opacity-45" : undefined}>
                <h3 className="text-sm font-semibold text-slate-900">3. Runtime package</h3>
                <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                  <input type="checkbox" checked={installDependencies} disabled={!target?.canInstallAutomatically} onChange={(event) => setInstallDependencies(event.target.checked)} className="mt-1" />
                  <span><span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><PackageCheck size={16} aria-hidden="true" />xrift-studio-runtimeをインストール</span><span className="mt-1 block text-xs leading-5 text-slate-600">{target?.canInstallAutomatically ? "npmを使用して固定versionを追加します。" : target ? `${target.packageManager} projectのためpackage.jsonへの記録まで行います。完了後に既存のpackage managerでinstallしてください。` : "書き出し先を選ぶと利用方法を確認できます。"}</span></span>
                </label>
              </section>

              {progress ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4" role="status" aria-live="polite">
                  <div className="flex items-center gap-3"><Loader2 className="animate-spin text-violet-700" size={18} aria-hidden="true" /><div><p className="text-sm font-semibold text-violet-950">{progress.label}</p>{progress.detail ? <p className="mt-0.5 text-xs text-violet-800">{progress.detail}</p> : null}</div></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-200"><div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} /></div>
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4" role="alert"><AlertCircle className="mt-0.5 shrink-0 text-rose-700" size={18} aria-hidden="true" /><div><p className="text-sm font-semibold text-rose-950">書き出しを完了できませんでした</p><p className="mt-1 text-xs leading-5 text-rose-800">{error}</p>{errorDetails.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-rose-800">{errorDetails.slice(0, 8).map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}</ul> : null}</div></div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">Classic側の変更をVisual Editorへ逆変換しません。</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50">{result ? "閉じる" : "キャンセル"}</button>
            {!result ? <button type="button" disabled={!canExport} onClick={() => void startExport()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "書き出しています" : "Classicへ書き出す"}</button> : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
