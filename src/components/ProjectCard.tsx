import { useEffect, useState } from "react";
import { ImageOff, Plus, Sparkles, Camera } from "lucide-react";
import { tauri, type Project } from "../lib/tauri";

type Props = {
  project: Project;
  onOpen: () => void;
  onEditThumbnail: () => void;
  refreshKey?: number;
};

export function ProjectCard({
  project,
  onOpen,
  onEditThumbnail,
  refreshKey = 0,
}: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    tauri
      .readThumbnail(project.path)
      .then((t) => {
        if (mounted) setThumb(t);
      })
      .catch(() => mounted && setThumb(null))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [project.path, refreshKey]);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-brand-lg"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-brand-100 via-zinc-100 to-blue-100">
          {thumb ? (
            <img
              src={thumb}
              alt={project.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-1 text-zinc-400">
                <ImageOff size={30} strokeWidth={1.5} />
                <span className="text-[10px]">
                  {loading ? "読み込み中…" : "サムネイルなし"}
                </span>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="flex flex-1 flex-col gap-1 px-4 py-3">
          <div className="font-semibold text-zinc-900 group-hover:text-brand-700">
            {project.name}
          </div>
          {project.title && project.title !== project.name && (
            <div className="line-clamp-1 text-xs text-zinc-500">{project.title}</div>
          )}
          {project.description && (
            <div className="line-clamp-2 text-xs text-zinc-500">{project.description}</div>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditThumbnail();
        }}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-700 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-white group-hover:opacity-100"
        title="サムネイルを編集"
      >
        <Camera size={11} strokeWidth={2} />
        編集
      </button>
    </div>
  );
}

export function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 text-zinc-500 transition-all hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
    >
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="h-full w-full gradient-brand-soft" />
      </div>
      <div className="relative rounded-full border border-current p-2.5 transition-transform duration-300 group-hover:scale-110">
        <Plus size={18} strokeWidth={2.25} />
      </div>
      <span className="relative text-sm font-medium">新規ワールド</span>
      <span className="relative mt-0.5 flex items-center gap-1 text-[10px] text-zinc-400 group-hover:text-brand-500">
        <Sparkles size={9} strokeWidth={2} />
        テンプレートから作成
      </span>
    </button>
  );
}
