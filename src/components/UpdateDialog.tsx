import { useEffect } from "react";
import { Sparkles, Download, ArrowRight, X } from "lucide-react";

type Props = {
  open: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  busy: boolean;
  onUpdate: () => void;
  onClose: () => void;
};

export function UpdateDialog({
  open,
  currentVersion,
  latestVersion,
  busy,
  onUpdate,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      data-app-modal-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        data-app-modal-surface
        role="dialog"
        aria-modal="true"
        aria-labelledby="cli-update-title"
        className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div data-app-modal-header className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="CLIアップデートを閉じる"
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800 disabled:opacity-50"
          >
            <X size={14} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-brand-700 shadow-sm">
              <Sparkles size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 id="cli-update-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                @xrift/cli アップデート
              </h2>
              <div className="text-xs text-zinc-600">
                新しいバージョンが公開されました
              </div>
            </div>
          </div>
        </div>

        <div data-app-modal-body className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                現在
              </div>
              <div className="font-mono text-sm text-zinc-700 truncate">
                {currentVersion ?? "-"}
              </div>
            </div>
            <ArrowRight size={16} className="text-zinc-400" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                最新
              </div>
              <div className="font-mono text-sm font-semibold text-brand-700 truncate">
                {latestVersion ?? "-"}
              </div>
            </div>
          </div>
        </div>

        <div data-app-modal-footer className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            後で
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-60"
          >
            <Download size={11} strokeWidth={2.25} />
            {busy ? "アップデート中…" : "アップデート"}
          </button>
        </div>
      </div>
    </div>
  );
}
