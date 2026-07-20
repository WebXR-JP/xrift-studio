import { useEffect } from "react";
import { Check, FileText, Image, Pencil, X } from "lucide-react";
import type { PublishReadiness, PublishReadinessState } from "../lib/publish-readiness";
import type { ProjectKind } from "../lib/tauri";

type Props = {
  readiness: PublishReadiness | null;
  projectKind: ProjectKind;
  onEditMetadata: () => void;
  onEditThumbnail: () => void;
  onClose: () => void;
};

function StateMark({ state }: { state: PublishReadinessState }) {
  if (state === "ready") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check size={12} strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
      <Pencil size={11} strokeWidth={2.25} />
    </span>
  );
}

function stateLabel(state: PublishReadinessState, templateLabel: string) {
  if (state === "ready") return "設定済み";
  if (state === "unavailable") return "確認できません";
  return templateLabel;
}

export function PublishReadinessDialog({
  readiness,
  projectKind,
  onEditMetadata,
  onEditThumbnail,
  onClose,
}: Props) {
  useEffect(() => {
    if (!readiness) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readiness, onClose]);

  if (!readiness) return null;

  const projectLabel = projectKind === "item" ? "アイテム" : "ワールド";

  const metadataNeedsAttention = readiness.metadata.state !== "ready";
  const nextLabel = metadataNeedsAttention
    ? `${projectLabel}情報を編集`
    : "サムネイルを設定";
  const nextAction = metadataNeedsAttention ? onEditMetadata : onEditThumbnail;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800"
            title="公開準備を閉じる"
          >
            <X size={14} strokeWidth={2} />
          </button>
          <div className="text-lg font-semibold tracking-tight text-zinc-900">
            公開前の準備
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            このまま公開すると、XRift 上で初期{projectLabel}のように表示される可能性があります。公開情報を整えてからアップロードします。
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
            <StateMark state={readiness.metadata.state} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                <FileText size={14} strokeWidth={2} className="text-zinc-500" />
                {projectLabel}情報
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {stateLabel(readiness.metadata.state, "テンプレートのままです")}
              </div>
              {readiness.metadata.title && (
                <div className="mt-1.5 truncate text-xs text-zinc-700">
                  {readiness.metadata.title}
                </div>
              )}
              {readiness.metadata.description && (
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                  {readiness.metadata.description}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
            <StateMark state={readiness.thumbnail.state} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                <Image size={14} strokeWidth={2} className="text-zinc-500" />
                サムネイル
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {stateLabel(readiness.thumbnail.state, "初期画像のままです")}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={nextAction}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500"
          >
            <Pencil size={12} strokeWidth={2.25} />
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
