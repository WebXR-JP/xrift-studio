import { useEffect, useState } from "react";
import {
  Box,
  CalendarClock,
  Camera,
  Cloud,
  Code2,
  Globe2,
  ImageOff,
  PanelsTopLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { tauri, type Project } from "../lib/tauri";

const PROJECT_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  project: Project;
  busy: boolean;
  onOpen: () => void;
  onEditThumbnail: () => void;
  onDelete: () => void;
  refreshKey?: number;
};

export function formatProjectDate(value: number | string | null): string {
  if (value === null) return "日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return PROJECT_DATE_FORMATTER.format(date);
}

export function ProjectCard({
  project,
  busy,
  onOpen,
  onEditThumbnail,
  onDelete,
  refreshKey = 0,
}: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    tauri
      .readThumbnail(project.path)
      .then((thumbnail) => {
        if (mounted) setThumb(thumbnail);
      })
      .catch(() => mounted && setThumb(null))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [project.path, refreshKey]);

  return (
    <article className="group flex min-h-28 overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300 hover:bg-zinc-50/60">
      <button
        type="button"
        disabled={busy}
        onClick={onOpen}
        className="flex min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 disabled:cursor-wait"
        title={`${project.title || project.name}を開く`}
      >
        <span className="relative w-28 shrink-0 overflow-hidden border-r border-zinc-200 bg-zinc-100">
          {thumb ? (
            <img
              src={thumb}
              alt={`${project.title || project.name}の表紙`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-zinc-400">
              <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[9px]">
                {loading ? "読込中" : "表紙なし"}
              </span>
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500">
              {project.kind === "item" ? (
                <Box size={11} aria-hidden="true" />
              ) : (
                <Globe2 size={11} aria-hidden="true" />
              )}
              {project.kind === "item" ? "Item" : "World"}
            </span>
            <span className="text-zinc-300" aria-hidden="true">/</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500">
              {project.format === "visual" ? (
                <PanelsTopLeft size={11} aria-hidden="true" />
              ) : (
                <Code2 size={11} aria-hidden="true" />
              )}
              {project.format === "visual" ? "Visual" : "Classic"}
            </span>
          </span>
          <span className="mt-1 truncate text-sm font-semibold text-zinc-900 group-hover:text-brand-700">
            {project.title || project.name}
          </span>
          {project.title && project.title !== project.name ? (
            <span className="truncate text-[10px] text-zinc-400">{project.name}</span>
          ) : null}
          {project.description ? (
            <span className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
              {project.description}
            </span>
          ) : null}
          <span className="mt-auto flex items-center gap-3 pt-2 text-[10px] text-zinc-500">
            <span
              className="inline-flex min-w-0 items-center gap-1"
              title={`更新: ${formatProjectDate(project.modifiedAtMs)}`}
            >
              <CalendarClock size={11} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{formatProjectDate(project.modifiedAtMs)}</span>
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1 ${
                project.uploadedAt ? "text-emerald-700" : "text-zinc-400"
              }`}
              title={
                project.uploadedAt
                  ? `公開: ${formatProjectDate(project.uploadedAt)}${project.publicationId ? ` / ${project.publicationId}` : ""}`
                  : "まだXRiftへ公開されていません"
              }
            >
              <Cloud size={11} aria-hidden="true" />
              {project.uploadedAt ? "公開済み" : "未公開"}
            </span>
          </span>
        </span>
      </button>

      <div className="flex w-10 shrink-0 flex-col items-center justify-start gap-1 border-l border-zinc-100 py-2">
        <button
          type="button"
          disabled={busy}
          onClick={onEditThumbnail}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-40"
          title="表紙を編集"
          aria-label={`${project.title || project.name}の表紙を編集`}
        >
          <Camera size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-40"
          title="プロジェクトを削除"
          aria-label={`${project.title || project.name}を削除`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function NewProjectCard({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex min-h-28 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/70 px-4 text-left text-zinc-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-current">
        <Plus size={16} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold">新規プロジェクト</span>
        <span className="mt-0.5 block text-[11px] text-zinc-500">
          種別と制作方法を選んで開始
        </span>
      </span>
    </button>
  );
}
