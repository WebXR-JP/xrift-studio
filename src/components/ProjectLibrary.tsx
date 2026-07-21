import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Project } from "../lib/tauri";
import type { Whoami } from "../lib/xrift-cli";
import { NewProjectCard, ProjectCard } from "./ProjectCard";
import { BrandMark, BrandWordmark } from "./Brand";
import { AboutModal } from "./AboutModal";
import { UserMenu } from "./UserMenu";
import { ThumbnailEditorModal } from "./ThumbnailEditorModal";
import { ConfirmDialog } from "./ConfirmDialog";

type ProjectSort =
  | "updated-desc"
  | "updated-asc"
  | "uploaded-desc"
  | "name-asc";
type PublishFilter = "all" | "published" | "unpublished";

type Props = {
  projects: Project[];
  loading: boolean;
  user: Whoami | null;
  userLoading: boolean;
  busy: boolean;
  projectsRoot: string;
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => Promise<boolean>;
  onNew: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  appUpdatePhase:
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "installing"
    | "error";
  latestAppVersion: string | null;
  onCheckAppUpdate: () => void;
  onOpenAppUpdate: () => void;
};

function compareProjects(sort: ProjectSort) {
  return (left: Project, right: Project) => {
    if (sort === "name-asc") {
      return (left.title || left.name).localeCompare(right.title || right.name, "ja");
    }
    if (sort === "uploaded-desc") {
      return (
        (Date.parse(right.uploadedAt ?? "") || 0) -
          (Date.parse(left.uploadedAt ?? "") || 0) ||
        (right.modifiedAtMs ?? 0) - (left.modifiedAtMs ?? 0)
      );
    }
    const direction = sort === "updated-asc" ? 1 : -1;
    return (
      ((left.modifiedAtMs ?? 0) - (right.modifiedAtMs ?? 0)) * direction ||
      (left.title || left.name).localeCompare(right.title || right.name, "ja")
    );
  };
}

export function ProjectLibrary({
  projects,
  loading,
  user,
  userLoading,
  busy,
  projectsRoot,
  onOpen,
  onDelete,
  onNew,
  onLogin,
  onLogout,
  onRefresh,
  appUpdatePhase,
  latestAppVersion,
  onCheckAppUpdate,
  onOpenAppUpdate,
}: Props) {
  const [showAbout, setShowAbout] = useState(false);
  const [editingThumb, setEditingThumb] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [thumbRefresh, setThumbRefresh] = useState(0);
  const [sort, setSort] = useState<ProjectSort>("updated-desc");
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");
  const [query, setQuery] = useState("");

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ja");
    return projects
      .filter((project) => {
        if (publishFilter === "published" && !project.uploadedAt) return false;
        if (publishFilter === "unpublished" && project.uploadedAt) return false;
        if (!normalizedQuery) return true;
        return [project.name, project.title, project.description]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase("ja").includes(normalizedQuery));
      })
      .sort(compareProjects(sort));
  }, [projects, publishFilter, query, sort]);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const deleted = await onDelete(deleteTarget);
      if (deleted) setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = publishFilter !== "all" || query.trim().length > 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-zinc-900">
      <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <BrandWordmark sub="プロジェクト" />
        </div>

        <div className="flex items-center gap-1.5">
          {appUpdatePhase === "available" ? (
            <button
              type="button"
              onClick={onOpenAppUpdate}
              className="flex h-7 items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 text-[11px] font-medium text-brand-700 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              title={`XRift Studio v${latestAppVersion ?? "最新"}へアップデート`}
            >
              <Download size={11} aria-hidden="true" />
              v{latestAppVersion ?? "最新"} 更新
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            title="バージョン情報"
            aria-label="バージョン情報"
          >
            <Info size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            title="プロジェクトを再読み込み"
            aria-label="プロジェクトを再読み込み"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
          <UserMenu
            user={user}
            loading={userLoading}
            busy={busy}
            onLogin={onLogin}
            onLogout={onLogout}
          />
        </div>
      </header>

      <AboutModal
        open={showAbout}
        appUpdatePhase={appUpdatePhase}
        latestAppVersion={latestAppVersion}
        onCheckAppUpdate={onCheckAppUpdate}
        onOpenAppUpdate={onOpenAppUpdate}
        onClose={() => setShowAbout(false)}
      />
      {editingThumb ? (
        <ThumbnailEditorModal
          project={editingThumb}
          onClose={() => setEditingThumb(null)}
          onChanged={() => setThumbRefresh((key) => key + 1)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="プロジェクトを削除"
        description={
          deleteTarget
            ? `「${deleteTarget.title || deleteTarget.name}」を保存先から完全に削除します。\n${deleteTarget.path}\n\nこの操作は元に戻せません。`
            : undefined
        }
        confirmLabel="削除する"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => !deleting && setDeleteTarget(null)}
      />

      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[1600px] px-4 py-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
                  プロジェクト
                </h1>
                <span className="text-xs tabular-nums text-zinc-500">
                  {filtered ? `${visibleProjects.length} / ${projects.length}件` : `${projects.length}件`}
                </span>
              </div>
              <p className="mt-0.5 max-w-xl truncate font-mono text-[10px] text-zinc-400" title={projectsRoot}>
                {projectsRoot}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="relative block w-52">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <span className="sr-only">プロジェクトを検索</span>
                <input
                  type="search"
                  name="project-search"
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

              <select
                value={publishFilter}
                onChange={(event) => setPublishFilter(event.currentTarget.value as PublishFilter)}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                aria-label="公開状態で絞り込み"
              >
                <option value="all">すべての公開状態</option>
                <option value="published">公開済み</option>
                <option value="unpublished">未公開</option>
              </select>

              <label className="relative">
                <ArrowUpDown size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <span className="sr-only">並び順</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.currentTarget.value as ProjectSort)}
                  className="h-8 rounded-md border border-zinc-200 bg-white pl-7 pr-7 text-xs text-zinc-700 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                >
                  <option value="updated-desc">更新日時・新しい順</option>
                  <option value="updated-asc">更新日時・古い順</option>
                  <option value="uploaded-desc">公開日時・新しい順</option>
                  <option value="name-asc">名前順</option>
                </select>
              </label>

              {user ? (
                <button
                  type="button"
                  onClick={() => openUrl("https://xrift.net/").catch(() => {})}
                  className="flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                  title="XRiftの公開ページを開く"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  XRift
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2.5">
            <NewProjectCard busy={busy} onClick={onNew} />
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                busy={busy || deleting}
                onOpen={() => onOpen(project)}
                onEditThumbnail={() => setEditingThumb(project)}
                onDelete={() => setDeleteTarget(project)}
                refreshKey={thumbRefresh}
              />
            ))}
          </div>

          {!loading && projects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white/60 px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-700">まだプロジェクトがありません</p>
              <p className="mt-1 text-xs text-zinc-500">上の「新規プロジェクト」から制作を始められます。</p>
            </div>
          ) : null}

          {!loading && projects.length > 0 && visibleProjects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-700">条件に一致するプロジェクトがありません</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPublishFilter("all");
                }}
                className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                絞り込みを解除
              </button>
            </div>
          ) : null}

        </div>
      </main>
    </div>
  );
}
