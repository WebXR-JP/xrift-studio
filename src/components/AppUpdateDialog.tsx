import { useEffect } from "react";
import {
  AlertCircle,
  ArrowRight,
  Download,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import type { AppUpdateState } from "../lib/app-updater";

type Props = {
  open: boolean;
  state: AppUpdateState;
  onInstall: () => void;
  onRetry: () => void;
  onClose: () => void;
};

const ACTIVE_PHASES = new Set([
  "checking",
  "downloading",
  "installing",
  "restarting",
]);

export function AppUpdateDialog({
  open,
  state,
  onInstall,
  onRetry,
  onClose,
}: Props) {
  const busy = ACTIVE_PHASES.has(state.phase);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const progress =
    state.totalBytes && state.totalBytes > 0
      ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-[480px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800 disabled:opacity-40"
            aria-label="閉じる"
          >
            <X size={14} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-brand-700 shadow-sm">
              <Download size={20} strokeWidth={2} />
            </div>
            <div>
              <div
                id="app-update-title"
                className="text-lg font-semibold tracking-tight text-zinc-900"
              >
                XRift Studio のアップデート
              </div>
              <div className="text-xs text-zinc-600">
                署名を確認してからインストールします
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <Version label="現在" value={state.currentVersion} />
            <ArrowRight size={16} className="text-zinc-400" strokeWidth={2} />
            <Version label="最新版" value={state.latestVersion} latest />
          </div>

          {state.phase === "error" ? (
            <div
              className="mt-4 flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-rose-800"
              role="alert"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold">
                  アップデートを完了できませんでした
                </div>
                <div className="mt-1 break-words text-[11px] leading-relaxed">
                  {state.error}
                </div>
                <div className="mt-1 text-[11px] text-rose-700">
                  現在のバージョンはそのまま利用できます。
                </div>
              </div>
            </div>
          ) : busy ? (
            <UpdateProgress state={state} progress={progress} />
          ) : (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                更新内容
              </div>
              <div className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-600 scrollbar-thin">
                {state.releaseNotes?.trim() || "このリリースの更新内容はありません。"}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                ダウンロード後にアプリを再起動します。プロジェクトとアプリ内ランタイムは変更しません。
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            後で
          </button>
          {state.phase === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500"
            >
              <RefreshCw size={11} strokeWidth={2.25} />
              もう一度確認
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              disabled={busy || state.phase !== "available"}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
            >
              {busy ? (
                <RotateCw size={11} className="animate-spin" strokeWidth={2.25} />
              ) : (
                <Download size={11} strokeWidth={2.25} />
              )}
              {buttonLabel(state.phase)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Version({
  label,
  value,
  latest = false,
}: {
  label: string;
  value: string | null;
  latest?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div
        className={`truncate font-mono text-sm ${
          latest ? "font-semibold text-brand-700" : "text-zinc-700"
        }`}
      >
        {value ? `v${value.replace(/^v/, "")}` : "-"}
      </div>
    </div>
  );
}

function UpdateProgress({
  state,
  progress,
}: {
  state: AppUpdateState;
  progress: number | null;
}) {
  const downloading = state.phase === "downloading";
  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-zinc-700">
          {state.phase === "checking"
            ? "更新情報を確認しています…"
            : downloading
              ? "アップデートをダウンロードしています…"
              : state.phase === "installing"
                ? "署名を確認してインストールしています…"
                : "XRift Studio を再起動しています…"}
        </span>
        {downloading && (
          <span className="font-mono text-zinc-500">
            {progress !== null
              ? `${progress}%`
              : formatBytes(state.downloadedBytes)}
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full bg-brand-500 transition-[width] duration-200 ${
            progress === null || !downloading ? "animate-pulse" : ""
          }`}
          style={{
            width:
              downloading && progress !== null
                ? `${Math.max(progress, 2)}%`
                : "45%",
          }}
        />
      </div>
      {downloading && state.totalBytes !== null && (
        <div className="mt-1.5 text-right font-mono text-[10px] text-zinc-400">
          {formatBytes(state.downloadedBytes)} / {formatBytes(state.totalBytes)}
        </div>
      )}
    </div>
  );
}

function buttonLabel(phase: AppUpdateState["phase"]): string {
  if (phase === "checking") return "確認中…";
  if (phase === "downloading") return "ダウンロード中…";
  if (phase === "installing") return "インストール中…";
  if (phase === "restarting") return "再起動中…";
  return "更新して再起動";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
