import { GuideLink } from "./guide/GuideLink";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ExternalLink,
  GitBranch,
  LifeBuoy,
  PackageOpen,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  Project,
  ProjectArchiveExport,
  ProjectArchiveInspection,
} from "../lib/tauri";
import type { AppUpdateState } from "../lib/app-updater";
import type { Whoami } from "../lib/xrift-cli";
import { NewProjectCard, ProjectCard } from "./ProjectCard";
import { BrandMark, BrandWordmark } from "./Brand";
import { AboutModal } from "./AboutModal";
import { UserMenu } from "./UserMenu";
import { ThumbnailEditorModal } from "./ThumbnailEditorModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { SupportReportModal } from "./SupportReportModal";
import {
  DuplicateProjectDialog,
  ExportProjectResultDialog,
  ImportProjectArchiveDialog,
  ImportProjectRepositoryDialog,
} from "./ProjectTransferDialogs";

type ProjectSort =
  | "updated-desc"
  | "updated-asc"
  | "uploaded-desc"
  | "name-asc";
type PublishFilter = "all" | "published" | "unpublished";

const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  "updated-desc": "最近更新した順",
  "updated-asc": "更新が古い順",
  "uploaded-desc": "最近公開した順",
  "name-asc": "名前順",
};

type Props = {
  projects: Project[];
  loading: boolean;
  user: Whoami | null;
  userLoading: boolean;
  busy: boolean;
  projectsRoot: string;
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => Promise<boolean>;
  /** Copies the project to a new folder; resolves to the copy or null on failure. */
  onDuplicate: (
    project: Project,
    directoryName: string,
    title: string | undefined,
  ) => Promise<Project | null>;
  /** Writes the project to a zip; null when the person cancelled the save dialog. */
  onExport: (project: Project) => Promise<ProjectArchiveExport | null>;
  /** Reads a zip picked by the person; null when the picker was cancelled. */
  onInspectArchive: () => Promise<ProjectArchiveInspection | null>;
  onImportArchive: (
    inspection: ProjectArchiveInspection,
    directoryName: string,
  ) => Promise<Project | null>;
  onImportRepository: (
    repositoryUrl: string,
    directoryName: string,
  ) => Promise<Project | null>;
  onOpenPath: (path: string) => void;
  onNew: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  appUpdate: AppUpdateState;
  onCheckAppUpdate: () => void;
  onShowAppUpdate: () => void;
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
  onDuplicate,
  onExport,
  onInspectArchive,
  onImportArchive,
  onImportRepository,
  onOpenPath,
  onNew,
  onLogin,
  onLogout,
  onRefresh,
  appUpdate,
  onCheckAppUpdate,
  onShowAppUpdate,
}: Props) {
  const [showAbout, setShowAbout] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [editingThumb, setEditingThumb] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<Project | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<
    (ProjectArchiveExport & { projectLabel: string }) | null
  >(null);
  const [inspectingArchive, setInspectingArchive] = useState(false);
  const [importInspection, setImportInspection] =
    useState<ProjectArchiveInspection | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showRepositoryImport, setShowRepositoryImport] = useState(false);
  const [importingRepository, setImportingRepository] = useState(false);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
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

  const existingNames = useMemo(
    () => new Set(projects.map((project) => project.name)),
    [projects],
  );

  const confirmDuplicate = async (directoryName: string, title: string | undefined) => {
    if (!duplicateTarget || duplicating) return;
    setDuplicating(true);
    setDuplicateError(null);
    try {
      const copy = await onDuplicate(duplicateTarget, directoryName, title);
      if (copy) setDuplicateTarget(null);
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : String(error));
    } finally {
      setDuplicating(false);
    }
  };

  const runExport = async (project: Project) => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await onExport(project);
      if (result) {
        setExportResult({ ...result, projectLabel: project.title || project.name });
      }
    } finally {
      setExporting(false);
    }
  };

  const startImport = async () => {
    if (inspectingArchive) return;
    setInspectingArchive(true);
    setImportError(null);
    try {
      const inspection = await onInspectArchive();
      if (inspection) setImportInspection(inspection);
    } finally {
      setInspectingArchive(false);
    }
  };

  const confirmImport = async (directoryName: string) => {
    if (!importInspection || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const imported = await onImportArchive(importInspection, directoryName);
      if (imported) setImportInspection(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const confirmRepositoryImport = async (repositoryUrl: string, directoryName: string) => {
    if (importingRepository) return;
    setImportingRepository(true);
    setRepositoryError(null);
    try {
      const imported = await onImportRepository(repositoryUrl, directoryName);
      if (imported) setShowRepositoryImport(false);
    } catch (error) {
      setRepositoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingRepository(false);
    }
  };

  const transferBusy =
    duplicating || exporting || inspectingArchive || importing || importingRepository;
  const filtered = publishFilter !== "all" || query.trim().length > 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-zinc-900">
      <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <BrandWordmark sub="プロジェクト" />
        </div>

        <div className="flex items-center gap-1.5">
          <GuideLink page="first-world" label="使い方" />
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            title="ヘルプと報告"
            aria-label="ヘルプと報告"
          >
            <LifeBuoy size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="relative flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            title="設定"
            aria-label={
              appUpdate.phase === "available"
                ? "設定（アップデートあり）"
                : "設定"
            }
          >
            <Settings size={14} aria-hidden="true" />
            {appUpdate.phase === "available" && (
              <span
                className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-white"
                aria-hidden="true"
              />
            )}
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
        onClose={() => setShowAbout(false)}
        appUpdate={appUpdate}
        onCheckAppUpdate={onCheckAppUpdate}
        onShowAppUpdate={onShowAppUpdate}
      />
      <SupportReportModal
        open={showSupport}
        projectCount={projects.length}
        onClose={() => setShowSupport(false)}
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
      <DuplicateProjectDialog
        project={duplicateTarget}
        existingNames={existingNames}
        busy={duplicating}
        error={duplicateError}
        onConfirm={(directoryName, title) => void confirmDuplicate(directoryName, title)}
        onClose={() => {
          if (duplicating) return;
          setDuplicateTarget(null);
          setDuplicateError(null);
        }}
      />
      <ImportProjectArchiveDialog
        inspection={importInspection}
        existingNames={existingNames}
        busy={importing}
        error={importError}
        onConfirm={(directoryName) => void confirmImport(directoryName)}
        onClose={() => {
          if (importing) return;
          setImportInspection(null);
          setImportError(null);
        }}
      />
      <ImportProjectRepositoryDialog
        open={showRepositoryImport}
        existingNames={existingNames}
        busy={importingRepository}
        error={repositoryError}
        onConfirm={(repositoryUrl, directoryName) =>
          void confirmRepositoryImport(repositoryUrl, directoryName)
        }
        onClose={() => {
          if (importingRepository) return;
          setShowRepositoryImport(false);
          setRepositoryError(null);
        }}
      />
      <ExportProjectResultDialog
        result={exportResult}
        onOpenFolder={() => {
          if (!exportResult) return;
          const parent = exportResult.archivePath.replace(/[\\/][^\\/]*$/, "");
          onOpenPath(parent || exportResult.archivePath);
        }}
        onClose={() => setExportResult(null)}
      />

      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[1120px] px-5 py-5">
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
                  <option value="updated-desc">最近更新した順</option>
                  <option value="updated-asc">更新が古い順</option>
                  <option value="uploaded-desc">最近公開した順</option>
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="min-w-0 flex-1">
              <NewProjectCard busy={busy || transferBusy} onClick={onNew} />
            </div>
            <button
              type="button"
              disabled={busy || transferBusy}
              onClick={() => void startImport()}
              className="flex min-h-20 shrink-0 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/70 px-4 text-left text-zinc-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50 sm:w-64"
              title="ZIPファイルからプロジェクトを取り込む"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-current">
                <PackageOpen size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {inspectingArchive ? "ZIPを確認中…" : "ZIPから取り込む"}
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  書き出したプロジェクトを開く
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy || transferBusy}
              onClick={() => {
                setRepositoryError(null);
                setShowRepositoryImport(true);
              }}
              className="flex min-h-20 shrink-0 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/70 px-4 text-left text-zinc-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50 sm:w-64"
              title="Gitリポジトリからプロジェクトをコピーする"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-current">
                <GitBranch size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {importingRepository ? "取得中…" : "Gitから取り込む"}
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  リポジトリの内容をコピーして始める
                </span>
              </span>
            </button>
          </div>

          <div className="mb-2 mt-4 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3">
            <h2 className="text-xs font-semibold text-zinc-700">
              {PROJECT_SORT_LABELS[sort]}
            </h2>
            <span className="text-[10px] text-zinc-400">
              並び順
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                busy={busy || deleting || transferBusy}
                onOpen={() => onOpen(project)}
                onEditThumbnail={() => setEditingThumb(project)}
                onDuplicate={() => {
                  setDuplicateError(null);
                  setDuplicateTarget(project);
                }}
                onExport={() => void runExport(project)}
                onDelete={() => setDeleteTarget(project)}
                refreshKey={thumbRefresh}
              />
            ))}
          </div>

          {!loading && projects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white/60 px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-700">まだプロジェクトがありません</p>
              <p className="mt-1 text-xs text-zinc-500">「新規プロジェクト」から作り始めましょう。既存のプロジェクトはZIPやGitから取り込めます。</p>
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
