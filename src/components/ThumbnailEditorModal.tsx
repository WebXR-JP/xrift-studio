import { X } from "lucide-react";
import type { Project } from "../lib/tauri";
import { ThumbnailEditor } from "./ThumbnailEditor";

type Props = {
  project: Project;
  onClose: () => void;
  onChanged: () => void;
};

export function ThumbnailEditorModal({ project, onClose, onChanged }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex h-[640px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">サムネイル</div>
            <div className="text-[11px] text-zinc-500">
              {project.name} · ワールド一覧やカードに表示される画像
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ThumbnailEditor
            projectPath={project.path}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}
