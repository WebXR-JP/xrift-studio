import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  PackageOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { BrandMark, BrandWordmark } from "../components/Brand";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NewProjectCard, ProjectCard } from "../components/ProjectCard";
import { ThumbnailEditorModal } from "../components/ThumbnailEditorModal";
import type { Project } from "../lib/tauri";
import type { BrowserStoredProject } from "../lib/browser-project-storage";

type ProjectSort = "updated-desc" | "updated-asc" | "name-asc";

const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  "updated-desc": "最近更新した順",
  "updated-asc": "更新が古い順",
  "name-asc": "名前順",
};

type Props = {
  projects: BrowserStoredProject[];
  loading: boolean;
  busy: boolean;
  onOpen: (path: string) => void;
  onExport: (project: BrowserStoredProject) => void;
  onDelete: (project: BrowserStoredProject) => Promise<boolean>;
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onBack: () => void;
};

function asProject(project: BrowserStoredProject): Project {
  const modifiedAt = Date.parse(project.modifiedAt);
  return {
    name: project.name,
    path: project.path,
    kind: project.kind,
    format: "visual",
    title: project.title || null,
    description: null,
    modifiedAtMs: Number.isFinite(modifiedAt) ? modifiedAt : null,
    uploadedAt: null,
    publicationId: null,
  };
}

export function BrowserProjectLibrary({
  projects,
  loading,
  busy,
  onOpen,
  onExport,
  onDelete,
  onNew,
  onImport,
  onRefresh,
  onBack,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("updated-desc");
  const [editingThumbnail, setEditingThumbnail] = useState<BrowserStoredProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrowserStoredProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [thumbnailRefresh, setThumbnailRefresh] = useState(0);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ja");
    return projects
      .filter((project) => {
        if (!normalizedQuery) return true;
        return [project.name, project.title]
          .some((value) => value.toLocaleLowerCase("ja").includes(normalizedQuery));
      })
      .sort((left, right) => {
        if (sort === "name-asc") {
          return (left.title || left.name).localeCompare(right.title || right.name, "ja");
        }
        const direction = sort === "updated-asc" ? 1 : -1;
        const leftUpdated = Date.parse(left.modifiedAt) || 0;
        const rightUpdated = Date.parse(right.modifiedAt) || 0;
        return (
          (leftUpdated - rightUpdated) * direction ||
          (left.title || left.name).localeCompare(right.title || right.name, "ja")
        );
      });
  }, [projects, query, sort]);

  const filtered = query.trim().length > 0;

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (await onDelete(deleteTarget)) setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-zinc-100 text-zinc-900">
      {editingThumbnail ? (
        <ThumbnailEditorModal
          project={asProject(editingThumbnail)}
          onClose={() => setEditingThumbnail(null)}
          onChanged={() => setThumbnailRefresh((value) => value + 1)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="プロジェクトを削除"
        description={deleteTarget ? `「${deleteTarget.title || deleteTarget.name}」をこのブラウザから完全に削除します。\n\nこの操作は元に戻せません。` : undefined}
        confirmLabel="削除する"
        destructive
        busy={deleting}
        onConfirm={() => { void confirmDelete(); }}
        onClose={() => !deleting && setDeleteTarget(null)}
      />

      <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark size={28} />
          <BrandWordmark sub="プロジェクト" />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            title="紹介ページへ戻る"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span className="hidden sm:inline">紹介ページ</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || busy}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            title="プロジェクトを再読み込み"
            aria-label="プロジェクトを再読み込み"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[1120px] px-3 py-4 sm:px-5 sm:py-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-zinc-900">プロジェクト</h1>
                <span className="text-xs tabular-nums text-zinc-500">
                  {filtered ? `${visibleProjects.length} / ${projects.length}件` : `${projects.length}件`}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-400">このブラウザに保存</p>
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <label className="relative block min-w-0 flex-1 sm:w-52 sm:flex-none">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <span className="sr-only">プロジェクトを検索</span>
                <input
                  type="search"
                  name="browser-project-search"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="プロジェクトを検索…"
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-8 text-xs text-zinc-800 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    aria-label="検索をクリア"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </label>

              <label className="relative shrink-0">
                <ArrowUpDown size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <span className="sr-only">並び順</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.currentTarget.value as ProjectSort)}
                  className="h-8 rounded-md border border-zinc-200 bg-white pl-7 pr-7 text-xs text-zinc-700 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                >
                  <option value="updated-desc">最近更新した順</option>
                  <option value="updated-asc">更新が古い順</option>
                  <option value="name-asc">名前順</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="min-w-0 flex-1">
              <NewProjectCard busy={busy} onClick={onNew} />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onImport}
              className="flex min-h-20 w-full shrink-0 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/70 px-4 text-left text-zinc-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50 sm:w-64"
              title=".xriftstudioからプロジェクトを取り込む"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-current">
                <PackageOpen size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">ファイルから取り込む</span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">書き出したプロジェクトを開く</span>
              </span>
            </button>
          </div>

          <div className="mb-2 mt-4 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3">
            <h2 className="text-xs font-semibold text-zinc-700">{PROJECT_SORT_LABELS[sort]}</h2>
            <span className="text-[10px] text-zinc-400">並び順</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.path}
                project={asProject(project)}
                busy={busy || deleting}
                onOpen={() => onOpen(project.path)}
                onEditThumbnail={() => setEditingThumbnail(project)}
                onExport={() => onExport(project)}
                onDelete={() => setDeleteTarget(project)}
                refreshKey={thumbnailRefresh}
              />
            ))}
          </div>

          {loading ? (
            <div role="status" className="mt-6 rounded-lg border border-zinc-200 bg-white/70 px-4 py-5 text-center text-xs text-zinc-500">
              プロジェクトを読み込んでいます…
            </div>
          ) : null}

          {!loading && projects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white/60 px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-700">まだプロジェクトがありません</p>
              <p className="mt-1 text-xs text-zinc-500">「新規プロジェクト」から作るか、.xriftstudioファイルを取り込めます。</p>
            </div>
          ) : null}

          {!loading && projects.length > 0 && visibleProjects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-700">条件に一致するプロジェクトがありません</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                検索をクリア
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
