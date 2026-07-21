import { useEffect } from "react";
import {
  AlertCircle,
  ArrowRight,
  Download,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import type { AppUpdateInfo } from "../lib/tauri";

export type AppUpdatePhase =
  | "available"
  | "downloading"
  | "installing"
  | "error";

type Props = {
  open: boolean;
  info: AppUpdateInfo | null;
  phase: AppUpdatePhase;
  downloaded: number;
  contentLength: number | null;
  error: string | null;
  onUpdate: () => void;
  onClose: () => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 0).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AppUpdateDialog({
  open,
  info,
  phase,
  downloaded,
  contentLength,
  error,
  onUpdate,
  onClose,
}: Props) {
  const busy = phase === "downloading" || phase === "installing";
  const percent =
    contentLength && contentLength > 0
      ? Math.min(Math.round((downloaded / contentLength) * 100), 100)
      : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, open]);

  if (!open || !info) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
        className="w-[480px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800 disabled:opacity-40"
            aria-label="アプリのアップデートを後で行う"
          >
            <X size={14} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-brand-700 shadow-sm">
              <RotateCw size={20} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="app-update-title"
                className="text-lg font-semibold tracking-tight text-zinc-900"
              >
                XRift Studio をアップデート
              </h2>
              <p className="text-xs text-zinc-600">
                新しいアプリ本体が公開されました
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                現在
              </div>
              <div className="truncate font-mono text-sm text-zinc-700">
                v{info.currentVersion}
              </div>
            </div>
            <ArrowRight size={16} className="text-zinc-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                最新
              </div>
              <div className="truncate font-mono text-sm font-semibold text-brand-700">
                v{info.version}
              </div>
            </div>
          </div>

          {info.body ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                更新内容
              </div>
              <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-600 scrollbar-thin">
                {info.body}
              </p>
            </div>
          ) : null}

          {busy ? (
            <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-brand-800">
                <span>
                  {phase === "installing"
                    ? "インストールしています…"
                    : "アップデートをダウンロードしています…"}
                </span>
                {phase === "downloading" && percent !== null ? (
                  <span className="font-mono tabular-nums">{percent}%</span>
                ) : null}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
                <div
                  className={`h-full rounded-full bg-brand-600 transition-[width] duration-200 ${
                    percent === null || phase === "installing" ? "animate-pulse" : ""
                  }`}
                  style={{
                    width:
                      phase === "installing"
                        ? "100%"
                        : percent === null
                          ? "35%"
                          : `${percent}%`,
                  }}
                />
              </div>
              {phase === "downloading" && downloaded > 0 ? (
                <div className="mt-1.5 text-[10px] text-brand-700/75">
                  {formatBytes(downloaded)}
                  {contentLength ? ` / ${formatBytes(contentLength)}` : ""}
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-medium">アップデートできませんでした</div>
                <div className="mt-0.5 break-words text-[11px] leading-relaxed text-rose-600">
                  {error ?? "ネットワーク接続を確認して、もう一度お試しください。"}
                </div>
              </div>
            </div>
          ) : null}

          {!busy ? (
            <p className="text-[11px] leading-relaxed text-zinc-500">
              更新のインストール後にアプリを自動で再起動します。作業中の変更を保存してから実行してください。
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-500">
              完了すると自動で再起動します。この画面を閉じずにお待ちください。
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {phase === "error" ? "閉じる" : "後で"}
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-60"
          >
            {phase === "error" ? (
              <RefreshCw size={12} aria-hidden="true" />
            ) : (
              <Download size={12} aria-hidden="true" />
            )}
            {busy
              ? phase === "installing"
                ? "インストール中…"
                : "ダウンロード中…"
              : phase === "error"
                ? "再試行"
                : "更新して再起動"}
          </button>
        </div>
      </div>
    </div>
  );
}
