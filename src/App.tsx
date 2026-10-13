import { MATERIAL_SHOWCASE_DEFINITIONS, materialShowcaseAssetId, getMaterialShowcaseAsset } from "./lib/visual-editor/material-showcase-catalog";
import { ensureCatalogMaterialTextures } from "./lib/visual-editor/asset-import-persistence";
import { applyExternalStoreInstallAndAnalyzeModel } from "./lib/visual-editor/external-store";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseChatgptWorldPlan, chatgptAssetRequests, type ChatgptWorldPlan } from "./lib/visual-editor/chatgpt-world";
import { createChatgptScaffold, editChatgptEntity, placeChatgptObject, type ChatgptGeneration, type ChatgptGenerationEvent, type ChatgptGenerationMode } from "./lib/visual-editor/chatgpt-generation";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { retryStudioItemLoading } from "./lib/visual-editor/xrift-item-loader";
import { StudioLoading } from "./components/StudioLoading";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SetupView } from "./components/SetupView";
import { UpdateDialog } from "./components/UpdateDialog";
import { suggestedNameForRepositoryUrl } from "./components/ProjectTransferDialogs";
import { projectPackageFileName } from "./lib/project-package";
import { AppUpdateDialog } from "./components/AppUpdateDialog";
import {
  tauri,
  type ChatgptAssetOptions,
  type ChatgptSceneContext,
  type Project,
  type ProjectArchiveExport,
  type ProjectArchiveInspection,
  type ProjectKind,
  type RuntimeStatus,
  type XriftMcpEditorRequestEvent,
  type XriftMcpEditorResponse,
} from "./lib/tauri";
import type { VisualEditorMcpProjectBridge } from "./components/visual-editor/VisualEditorPrototype";
import {
  xrift,
  clearCaches,
  openInVSCode,
  openTerminal,
  type LogLine,
  type Whoami,
} from "./lib/xrift-cli";
import { isNewer } from "./lib/semver";
import {
  inspectPublishThumbnail,
  type PublishThumbnailReadiness,
} from "./lib/publish-readiness";
import { announceProjectThumbnailChanged } from "./lib/project-thumbnail";
import { useToast } from "./components/Toast";
import {
  checkForAppUpdate,
  INITIAL_APP_UPDATE_STATE,
  installAppUpdate,
  relaunchAfterAppUpdate,
  type AppUpdateHandle,
  type AppUpdateState,
} from "./lib/app-updater";
import {
  VisualUploadDialog,
} from "./components/visual-editor/VisualUploadDialog";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { usePublishReview } from "./lib/visual-editor/use-publish-review";
import { PUBLISH_REVIEW_FAILURE, analyzePublishReview } from "./lib/visual-editor/publish-review";
import { ClassicExportDialog } from "./components/visual-editor/ClassicExportDialog";
import {
  applyAssetOptimizations,
  exportVisualProjectToClassic,
  estimateWorldVram,
  inspectClassicExportTarget,
  createVisualProjectFromClassicSource,
  createStarterVisualProject,
  createPreparedStarterVisualProjectOnDisk,
  createVisualProjectOnDisk,
  describeAnimationComponentMigration,
  defaultVisualStarterTemplateId,
  publishVisualProject,
  clearStaleXriftUploadAttempt,
  XriftMcpEditorToolError,
  buildPublishReadiness,
  editorSessionUnavailableError,
  inspectVisualPublishMetadata,
  isXriftMcpProjectTool,
  listStarterTemplates,
  parseCreateProjectArguments,
  parseNewProjectDirectoryName,
  parseOptionalProjectTitle,
  parseRequiredPath,
  resolveProjectTarget,
  resolveTransferableProject,
  summarizeProject,
  type VisualPublishPipelineProgress,
  readVisualProjectFromDisk,
  prepareStarterVisualProject,
  saveVisualProjectToDisk,
  StarterAssetCopyError,
  listScriptAssets,
  type AssetManifest,
  type PrototypeVisualProject,
  type ClassicExportIntegration,
  type ClassicExportProgress,
  type ClassicExportTarget,
  type StarterVisualProjectPlan,
  type VisualPublicationRecord,
  type VisualStarterTemplateId,
  type ClassicProjectCreationSource,
} from "./lib/visual-editor";

const EditorView = lazy(() => import("./components/EditorView").then(module => ({ default: module.EditorView })));
const McpConnectionSettings = lazy(() => import("./components/visual-editor/McpConnectionSettings").then(module => ({ default: module.McpConnectionSettings })));
const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

const APP_UPDATE_TARGET_KEY = "xrift-studio:update-target";

/**
 * Reads every Script Asset's source for the compiler.
 *
 * A missing file is omitted so the compiler reports it as a blocking
 * diagnostic naming the Asset, instead of failing here without context.
 */
async function readScriptSources(
  projectPath: string | undefined,
  assets: AssetManifest,
): Promise<Record<string, string>> {
  if (!projectPath) return {};
  const reads = await Promise.all(
    listScriptAssets(assets).map(async (asset) => {
      try {
        return {
          id: asset.id,
          source: await tauri.readTextFile(
            projectPath,
            asset.source.relativePath,
          ),
        };
      } catch {
        // Surfaces as script-source-unreadable during compile.
        return null;
      }
    }),
  );
  const sources: Record<string, string> = {};
  for (const read of reads) {
    if (read) sources[read.id] = read.source;
  }
  return sources;
}

function withLatestPublication(
  bundle: PrototypeVisualProject,
  knownPublication?: VisualPublicationRecord,
): PrototypeVisualProject {
  if (!knownPublication) return bundle;
  const bundledPublication = bundle.project.lastPublication;
  if (
    bundledPublication &&
    Date.parse(bundledPublication.uploadedAt) >=
      Date.parse(knownPublication.uploadedAt)
  ) {
    return bundle;
  }
  return {
    ...bundle,
    project: {
      ...bundle.project,
      lastPublication: knownPublication,
    },
  };
}

/**
 * `name`, then `name-2`, `name-3`, whichever does not exist under the
 * projects root yet. Listing is what the library itself uses, so the check
 * sees exactly the directories it would show.
 */
async function uniqueProjectDirectoryName(
  projectsRoot: string,
  name: string,
): Promise<string> {
  let taken = new Set<string>();
  try {
    const projects = await tauri.listProjects(projectsRoot);
    taken = new Set(
      projects.map(
        (project) =>
          project.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "",
      ),
    );
  } catch {
    return name;
  }
  if (!taken.has(name)) return name;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${name}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${name}-${Date.now()}`;
}

function App() {
  const toast = useToast();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);

  const [user, setUser] = useState<Whoami | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [openedArchivePaths, setOpenedArchivePaths] = useState<string[]>([]);
  const [openedArchiveInspection, setOpenedArchiveInspection] =
    useState<ProjectArchiveInspection | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectError, setNewProjectError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [visualSession, setVisualSession] = useState<{
    bundle: PrototypeVisualProject;
    project: Project | null;
  } | null>(null);
  const visualSessionRef = useRef(visualSession);
  visualSessionRef.current = visualSession;
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualPublishBundle, setVisualPublishBundle] =
    useState<PrototypeVisualProject | null>(null);
  // 公開ダイアログの一括変換・最適化を、開いたままのEditor履歴へ返す受け口。
  const visualExternalAssetsCommitRef = useRef<
    | ((update: {
        expectedAssets: PrototypeVisualProject["assets"];
        nextAssets: PrototypeVisualProject["assets"];
        notice: string;
      }) => boolean)
    | null
  >(null);
  const [visualClassicExportBundle, setVisualClassicExportBundle] =
    useState<PrototypeVisualProject | null>(null);
  const [visualThumbnailReadiness, setVisualThumbnailReadiness] =
    useState<PublishThumbnailReadiness | null>(null);
  const [visualThumbnailPreview, setVisualThumbnailPreview] = useState<
    string | null
  >(null);
  const [visualThumbnailCaptureRequest, setVisualThumbnailCaptureRequest] =
    useState(0);
  const visualThumbnailCapturePendingRef = useRef<{
    resolve: (dataUrl: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const visualThumbnailRefreshRunRef = useRef(0);
  const [visualCompilationFresh, setVisualCompilationFresh] = useState(false);
  const [visualPublishScriptSources, setVisualPublishScriptSources] = useState<{
    requestKey: string | null;
    loading: boolean;
    sources: Record<string, string>;
  }>({
    requestKey: null,
    loading: false,
    sources: {},
  });

  const [updateInfo, setUpdateInfo] = useState<{
    current: string | null;
    latest: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);
  const [updateChecked, setUpdateChecked] = useState(false);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>(
    INITIAL_APP_UPDATE_STATE,
  );
  const [showAppUpdate, setShowAppUpdate] = useState(false);
  const [libraryMcpOpen, setLibraryMcpOpen] = useState(false);
  const appUpdateHandleRef = useRef<AppUpdateHandle | null>(null);
  const appUpdateCheckRunRef = useRef(0);
  const appUpdateInitialCheckRef = useRef(false);
  const appUpdateVerificationRef = useRef(false);

  const projectsRoot = runtime?.paths.projectsRoot ?? "";

  const refreshVisualThumbnail = useCallback(
    async (projectPath: string, projectKind: ProjectKind) => {
      const run = ++visualThumbnailRefreshRunRef.current;
      const [readiness, preview] = await Promise.all([
        inspectPublishThumbnail(projectPath, projectKind),
        tauri.readThumbnail(projectPath).catch(() => null),
      ]);
      if (run !== visualThumbnailRefreshRunRef.current) return;
      setVisualThumbnailReadiness(readiness);
      setVisualThumbnailPreview(preview);
    },
    [],
  );

  const requestVisualThumbnailCapture = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        const pending = visualThumbnailCapturePendingRef.current;
        if (pending) {
          reject(new Error("サムネイルの作成がすでに実行中です"));
          return;
        }
        visualThumbnailCapturePendingRef.current = {
          resolve,
          reject: (error) => reject(error),
        };
        setVisualThumbnailCaptureRequest((current) => current + 1);
      }),
    [],
  );

  const handleVisualThumbnailCaptured = useCallback((dataUrl: string) => {
    const pending = visualThumbnailCapturePendingRef.current;
    visualThumbnailCapturePendingRef.current = null;
    pending?.resolve(dataUrl);
  }, []);

  const handleVisualThumbnailCaptureError = useCallback((message: string) => {
    const pending = visualThumbnailCapturePendingRef.current;
    visualThumbnailCapturePendingRef.current = null;
    pending?.reject(new Error(message));
  }, []);

  const appendLog = useCallback((line: LogLine) => {
    setLogs((prev) => [...prev, line]);
  }, []);

  const silentLog = useCallback((_l: LogLine) => {}, []);

  const checkAppUpdate = useCallback(async (showWhenAvailable = false) => {
    const run = ++appUpdateCheckRunRef.current;
    setAppUpdate((current) => ({
      ...current,
      phase: "checking",
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }));

    try {
      const [versions, update] = await Promise.all([
        tauri.getVersions(),
        checkForAppUpdate(),
      ]);

      if (run !== appUpdateCheckRunRef.current) {
        if (update) await update.close().catch(() => {});
        return;
      }

      const previous = appUpdateHandleRef.current;
      appUpdateHandleRef.current = update;
      if (previous && previous !== update) {
        void previous.close().catch(() => {});
      }

      if (!update) {
        setAppUpdate({
          phase: "latest",
          currentVersion: versions.appVersion,
          latestVersion: versions.appVersion,
          releaseNotes: null,
          releaseDate: null,
          downloadedBytes: 0,
          totalBytes: null,
          error: null,
        });
        return;
      }

      setAppUpdate({
        phase: "available",
        currentVersion: update.currentVersion || versions.appVersion,
        latestVersion: update.version,
        releaseNotes: update.body ?? null,
        releaseDate: update.date ?? null,
        downloadedBytes: 0,
        totalBytes: null,
        error: null,
      });
      if (showWhenAvailable || !appUpdateInitialCheckRef.current) {
        setShowAppUpdate(true);
      }
    } catch (error) {
      if (run !== appUpdateCheckRunRef.current) return;
      setAppUpdate((current) => ({
        ...current,
        phase: "error",
        error: String(error),
      }));
    }
  }, []);

  const handleInstallAppUpdate = useCallback(async () => {
    const update = appUpdateHandleRef.current;
    if (!update) {
      await checkAppUpdate(true);
      return;
    }

    const targetVersion = update.version;
    window.localStorage.setItem(APP_UPDATE_TARGET_KEY, targetVersion);
    setAppUpdate((current) => ({
      ...current,
      phase: "downloading",
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }));

    try {
      await installAppUpdate(update, (progress) => {
        setAppUpdate((current) => ({ ...current, ...progress }));
      });
      setAppUpdate((current) => ({ ...current, phase: "restarting" }));
      await relaunchAfterAppUpdate();
    } catch (error) {
      window.localStorage.removeItem(APP_UPDATE_TARGET_KEY);
      setAppUpdate((current) => ({
        ...current,
        phase: "error",
        error: String(error),
      }));
    }
  }, [checkAppUpdate]);

  useEffect(() => {
    if (appUpdateVerificationRef.current) return;
    appUpdateVerificationRef.current = true;
    const targetVersion = window.localStorage.getItem(APP_UPDATE_TARGET_KEY);
    if (!targetVersion) return;

    tauri
      .getVersions()
      .then((versions) => {
        if (
          versions.appVersion.replace(/^v/, "") ===
          targetVersion.replace(/^v/, "")
        ) {
          toast({
            kind: "success",
            title: "XRift Studioをアップデートしました",
            description: `v${versions.appVersion.replace(/^v/, "")}`,
          });
        }
      })
      .finally(() => {
        window.localStorage.removeItem(APP_UPDATE_TARGET_KEY);
      });
  }, [toast]);

  useEffect(() => {
    if (appUpdateInitialCheckRef.current) return;
    appUpdateInitialCheckRef.current = true;
    void checkAppUpdate(true);
  }, [checkAppUpdate]);

  useEffect(() => {
    tauri
      .runtimeStatus()
      .then((s) => setRuntime(s))
      .catch((e) =>
        appendLog({ kind: "stderr", text: `runtime_status: ${e}`, ts: Date.now() }),
      )
      .finally(() => setRuntimeLoading(false));
  }, [appendLog]);

  useEffect(() => {
    if (!tauri.isAvailable()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const collectOpenedArchives = () => {
      void tauri.takeOpenedProjectArchives().then((paths) => {
        if (!disposed && paths.length > 0) {
          setOpenedArchivePaths((current) => [...current, ...paths]);
        }
      });
    };
    void tauri.onOpenProjectArchives(collectOpenedArchives).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
      collectOpenedArchives();
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (
      !runtime?.ready ||
      selected ||
      visualSession ||
      openedArchiveInspection ||
      openedArchivePaths.length === 0
    ) {
      return;
    }
    const archivePath = openedArchivePaths[0];
    let cancelled = false;
    void tauri
      .inspectProjectArchive(archivePath)
      .then((inspection) => {
        if (!cancelled) setOpenedArchiveInspection(inspection);
      })
      .catch((error) => {
        if (!cancelled) {
          toast({
            kind: "error",
            title: "プロジェクトファイルを読み込めませんでした",
            description: String(error),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setOpenedArchivePaths((current) => current.slice(1));
      });
    return () => {
      cancelled = true;
    };
  }, [
    openedArchiveInspection,
    openedArchivePaths,
    runtime?.ready,
    selected,
    toast,
    visualSession,
  ]);

  const handleOpenedArchiveInspectionHandled = useCallback(() => {
    setOpenedArchiveInspection(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUserLoading(true);
    try {
      const u = await xrift.whoami(silentLog);
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setUserLoading(false);
    }
  }, [silentLog]);

  const refreshProjects = useCallback(async () => {
    if (!projectsRoot) return;
    setProjectsLoading(true);
    try {
      await tauri.ensureDir(projectsRoot);
      const list = await tauri.listProjects(projectsRoot);
      setProjects(list);
      setSelected((cur) =>
        cur ? list.find((p) => p.path === cur.path) ?? null : cur,
      );
    } catch (err) {
      appendLog({ kind: "stderr", text: `list_projects: ${err}`, ts: Date.now() });
    } finally {
      setProjectsLoading(false);
    }
  }, [projectsRoot, appendLog]);

  useEffect(() => {
    if (runtime?.ready) {
      refreshProjects();
      refreshUser();
    }
  }, [runtime?.ready, refreshProjects, refreshUser]);

  useEffect(() => {
    if (!runtime?.ready || updateChecked) return;
    let mounted = true;
    (async () => {
      try {
        const [current, latest] = await Promise.all([
          xrift.version(silentLog),
          tauri.checkXriftLatest(),
        ]);
        if (!mounted) return;
        setUpdateChecked(true);
        if (!latest) return;
        if (!current || isNewer(latest, current)) {
          setUpdateInfo({ current, latest });
        }
      } catch {
        if (mounted) setUpdateChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [runtime?.ready, updateChecked, silentLog]);

  const handleUpdateXrift = async () => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await tauri.updateXrift();
      clearCaches();
      const next = await tauri.runtimeStatus();
      if (!next.ready || !next.xriftVersion) {
        throw new Error("更新後のCLIを確認できませんでした。");
      }
      if (updateInfo?.latest && isNewer(updateInfo.latest, next.xriftVersion)) {
        throw new Error(`CLIはv${next.xriftVersion}です。v${updateInfo.latest}へ更新してください。`);
      }
      setRuntime(next);
      toast({
        kind: "success",
        title: "@xrift/cliをアップデートしました",
        description: `v${next.xriftVersion}`,
      });
      setUpdateInfo(null);
    } catch (e) {
      toast({
        kind: "error",
        title: "アップデートに失敗しました",
        description: String(e),
      });
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = () =>
    wrap(async () => {
      await xrift.login(appendLog);
      await refreshUser();
      const u = await xrift.whoami(silentLog).catch(() => null);
      if (u) {
        toast({
          kind: "success",
          title: "ログインしました",
          description: u.displayName ?? undefined,
        });
      } else {
        toast({ kind: "info", title: "ログインを完了してください" });
      }
    });

  const handleLogout = () =>
    wrap(async () => {
      await xrift.logout(appendLog);
      setUser(null);
      toast({ kind: "info", title: "ログアウトしました" });
    });

  const handleDeleteProject = async (project: Project): Promise<boolean> => {
    setBusy(true);
    try {
      await tauri.deleteProject(projectsRoot, project.path);
      setProjects((current) =>
        current.filter((candidate) => candidate.path !== project.path),
      );
      await refreshProjects();
      toast({
        kind: "success",
        title: "プロジェクトを削除しました",
        description: project.title || project.name,
      });
      return true;
    } catch (error) {
      toast({
        kind: "error",
        title: "プロジェクトを削除できませんでした",
        description: String(error),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateProject = async (
    project: Project,
    directoryName: string,
    title: string | undefined,
  ): Promise<Project | null> => {
    setBusy(true);
    try {
      const copy = await tauri.duplicateProject(
        projectsRoot,
        project.path,
        directoryName,
        title,
      );
      appendLog({
        kind: "info",
        text: `duplicated project: ${project.path} -> ${copy.path}`,
        ts: Date.now(),
      });
      await refreshProjects();
      toast({
        kind: "success",
        title: "プロジェクトを複製しました",
        description: `${copy.title || copy.name}（${copy.name}）を一覧に追加しました`,
      });
      return copy;
    } finally {
      setBusy(false);
    }
  };

  const handleExportProject = async (
    project: Project,
  ): Promise<ProjectArchiveExport | null> => {
    setBusy(true);
    try {
      const destination = await tauri.selectProjectArchiveDestination(
        projectPackageFileName(project.name),
      );
      if (!destination) return null;
      const result = await tauri.exportProjectArchive(
        projectsRoot,
        project.path,
        destination,
      );
      appendLog({
        kind: "info",
        text: `exported project archive: ${result.archivePath} (${result.fileCount} files)`,
        ts: Date.now(),
      });
      return result;
    } catch (error) {
      toast({
        kind: "error",
        title: "プロジェクトを書き出せませんでした",
        description: String(error),
      });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleInspectProjectArchive =
    async (): Promise<ProjectArchiveInspection | null> => {
      const archivePath = await tauri.selectProjectArchive();
      if (!archivePath) return null;
      try {
        return await tauri.inspectProjectArchive(archivePath);
      } catch (error) {
        toast({
          kind: "error",
          title: "プロジェクトファイルを読み込めませんでした",
          description: String(error),
        });
        return null;
      }
    };

  const handleImportProjectArchive = async (
    inspection: ProjectArchiveInspection,
    directoryName: string,
  ): Promise<Project | null> => {
    setBusy(true);
    try {
      const imported = await tauri.importProjectArchive(
        projectsRoot,
        inspection.archivePath,
        directoryName,
      );
      appendLog({
        kind: "info",
        text: `imported project archive: ${inspection.archivePath} -> ${imported.path}`,
        ts: Date.now(),
      });
      await refreshProjects();
      toast({
        kind: "success",
        title: "プロジェクトを取り込みました",
        description: `${imported.title || imported.name}（${imported.name}）を一覧に追加しました`,
      });
      return imported;
    } finally {
      setBusy(false);
    }
  };

  const handleImportProjectRepository = async (
    repositoryUrl: string,
    directoryName: string,
  ): Promise<Project | null> => {
    setBusy(true);
    try {
      const imported = await tauri.importProjectFromRepository(
        projectsRoot,
        repositoryUrl,
        directoryName,
      );
      appendLog({
        kind: "info",
        text: `imported project from repository: ${repositoryUrl} -> ${imported.path}`,
        ts: Date.now(),
      });
      await refreshProjects();
      toast({
        kind: "success",
        title: "Gitリポジトリから取り込みました",
        description: `${imported.title || imported.name}（${imported.name}）を一覧に追加しました`,
      });
      return imported;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (kind: ProjectKind, name: string) =>
    wrap(async () => {
      const result = await xrift.createProject(projectsRoot, kind, name, appendLog);
      setShowNewDialog(false);
      await refreshProjects();
      const list = await tauri.listProjects(projectsRoot);
      const created = list.find((p) => p.name === name && p.kind === kind);
      if (result.code === 0) {
        toast({
          kind: "success",
          title: `${kind === "item" ? "アイテム" : "ワールド"}を作成しました`,
          description: name,
        });
        if (created) setSelected(created);
      } else {
        toast({
          kind: "error",
          title: `${kind === "item" ? "アイテム" : "ワールド"}の作成に失敗しました`,
          description: "ログを確認してください",
        });
      }
    });

  const handleOpenVisualEditor = (
    kind: ProjectKind,
    name?: string,
    starterTemplateId: VisualStarterTemplateId =
      defaultVisualStarterTemplateId(kind),
  ) => {
    setNewProjectError(null);
    setVisualCompilationFresh(false);
    setVisualThumbnailReadiness(null);
    let starterPlan: StarterVisualProjectPlan;
    try {
      starterPlan = createStarterVisualProject(
        kind,
        starterTemplateId,
        name,
      );
    } catch (error) {
      const title = "テンプレートを選択できませんでした";
      const message = String(error);
      setNewProjectError({ title, message });
      toast({
        kind: "error",
        title,
        description: message,
      });
      return;
    }
    void wrap(async () => {
      try {
        const prepared = await prepareStarterVisualProject(starterPlan);
        const bundle: PrototypeVisualProject = {
          project: prepared.plan.project,
          scene: prepared.plan.scene,
          assets: prepared.plan.assets,
          prefabs: prepared.plan.prefabs,
        };
        if (!name || !projectsRoot) {
          setShowNewDialog(false);
          setVisualSession({ bundle, project: null });
          return;
        }

        const project = await createPreparedStarterVisualProjectOnDisk(
          projectsRoot,
          name,
          prepared,
        );
        setShowNewDialog(false);
        setVisualSession({ bundle, project });
        await refreshProjects();
        toast({
          kind: "success",
          title: `${kind === "item" ? "アイテム" : "ワールド"}を作成しました`,
          description: `${name} / ビジュアルエディター`,
        });
      } catch (error) {
        const starterCopyError =
          error instanceof StarterAssetCopyError ? error : undefined;
        const title = starterCopyError?.copy.assetId.includes("license")
          ? "テンプレートのライセンスをコピーできませんでした"
          : starterCopyError
            ? "テンプレート素材を検証できませんでした"
            : "テンプレートを準備できませんでした";
        const message = describeStarterPreparationError(error);
        setNewProjectError({ title, message });
        toast({
          kind: "error",
          title,
          description: message,
        });
      }
    });
  };

  /**
   * Save, compile, check and upload one Visual project. Shared by the upload
   * dialog and the MCP publish_project tool so both leave the same
   * publication record behind.
   */
  const runVisualPublish = async (
    publishBundle: PrototypeVisualProject,
    report: (progress: VisualPublishPipelineProgress) => void,
    signal: AbortSignal,
  ) => {
    if (mcpPublishActiveRef.current || chatgptGenerationRef.current) {
      throw new XriftMcpEditorToolError(
        "EDITOR_BUSY",
        "公開または制作の依頼を処理中です。完了してから公開してください",
      );
    }
    mcpPublishActiveRef.current = true;
    try {
      return await performVisualPublish(publishBundle, report, signal);
    } finally {
      mcpPublishActiveRef.current = false;
    }
  };

  const performVisualPublish = async (
    publishBundle: PrototypeVisualProject,
    report: (progress: VisualPublishPipelineProgress) => void,
    signal: AbortSignal,
  ) => {
    const session = visualSessionRef.current;
    if (!session || session.bundle.project.projectId !== publishBundle.project.projectId) {
      throw new Error("公開するプロジェクトが変わりました。現在の作品から公開画面を開き直してください");
    }
    let result: Awaited<ReturnType<typeof publishVisualProject>>;
    try {
      result = await publishVisualProject({
        authoringProjectPath: session?.project?.path,
        kind: publishBundle.project.projectKind,
        documents: {
          project: publishBundle.project,
          scenes: { [publishBundle.scene.sceneId]: publishBundle.scene },
          assets: publishBundle.assets,
          prefabs: publishBundle.prefabs,
          // The compiler stays synchronous, so Script sources are read
          // here and handed over with the rest of the documents.
          scriptSources: await readScriptSources(
            session?.project?.path,
            publishBundle.assets,
          ),
        },
        save: () => handleSaveVisualProject(publishBundle, false),
        report: (progress) => {
          if (progress.thumbnailStaging?.state === "verified" &&
              visualSessionRef.current?.bundle.project.projectId === publishBundle.project.projectId) {
            setVisualCompilationFresh(true);
          }
          report(progress);
        },
        onLog: appendLog,
        signal,
      });
    } catch (error) {
      if (visualSessionRef.current?.bundle.project.projectId === publishBundle.project.projectId) {
        setVisualCompilationFresh(false);
      }
      throw error;
    }
    const currentBundle = mcpProjectBridgeRef.current?.currentBundle();
    const currentSession = visualSessionRef.current;
    if (currentSession?.bundle.project.projectId === publishBundle.project.projectId) {
      const resultBundle = currentBundle?.project.projectId === publishBundle.project.projectId
        ? currentBundle : currentSession.bundle;
      const publishedBundle: PrototypeVisualProject = {
        ...resultBundle,
        project: {
          ...resultBundle.project,
          metadata: {
            ...resultBundle.project.metadata,
            updatedAt: new Date().toISOString(),
          },
          lastPublication: {
            ...result,
            uploadedAt: result.uploadedAt ?? new Date().toISOString(),
          },
        },
      };
      // The native pipeline merges the publication record into the latest
      // manifest under the project I/O lock. Never re-save a Scene snapshot
      // here: its author may have edited or closed the project during upload.
      const nextSession = { ...currentSession, bundle: publishedBundle };
      visualSessionRef.current = nextSession;
      setVisualSession(current => current === currentSession ? nextSession : current);
      setVisualPublishBundle(current => current?.project.projectId === publishBundle.project.projectId ? publishedBundle : current);
    }
    await refreshProjects().catch(() => {
      toast({ kind: "error", title: "公開は完了しましたが、プロジェクト一覧を更新できませんでした" });
    });
    return result;
  };

  // ---------------------------------------------------------------------
  // MCP project tools. The Editor answers document, asset, script and debug
  // tools once a project is open; the shell answers the tools that make a
  // project exist (create, open, close), publish it, and read the account.
  // The shell also owns the bridge heartbeat, so a client that connects while
  // the Library is showing gets a clear "open a project" answer instead of a
  // timeout.
  // ---------------------------------------------------------------------
  const mcpProjectBridgeRef = useRef<VisualEditorMcpProjectBridge | null>(null);
  const registerMcpProjectBridge = useCallback(
    (bridge: VisualEditorMcpProjectBridge | null) => {
      mcpProjectBridgeRef.current = bridge;
    },
    [],
  );
  const mcpPublishActiveRef = useRef(false);

  const requireMcpProjectsRoot = (): string => {
    if (!projectsRoot) {
      throw new XriftMcpEditorToolError(
        "EDITOR_UNAVAILABLE",
        "XRift Studioのセットアップが完了していません。Studioのセットアップ画面を先に終えてください",
      );
    }
    return projectsRoot;
  };

  const requireMcpProjectBridge = (tool: string): VisualEditorMcpProjectBridge => {
    const bridge = mcpProjectBridgeRef.current;
    if (!bridge || !visualSessionRef.current) {
      throw editorSessionUnavailableError(tool);
    }
    return bridge;
  };

  /** Resolves once the Editor for a newly opened project has registered its bridge. */
  const waitForMcpProjectBridge = async (
    previous: VisualEditorMcpProjectBridge | null,
    expected?: { projectId: string; sceneId: string },
    assertWaiting?: () => void,
  ): Promise<VisualEditorMcpProjectBridge> => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      assertWaiting?.();
      const session = visualSessionRef.current;
      if (expected && (session?.bundle.project.projectId !== expected.projectId || session.bundle.scene.sceneId !== expected.sceneId)) {
        throw new XriftMcpEditorToolError("STALE_REVISION", "開いている作品またはSceneが変わりました。依頼を反映せず停止しました");
      }
      const bridge = mcpProjectBridgeRef.current;
      if (bridge && bridge !== previous && session) {
        const bundle = bridge.currentBundle();
        if (expected && (bundle.project.projectId !== expected.projectId || bundle.scene.sceneId !== expected.sceneId)) {
          throw new XriftMcpEditorToolError("STALE_REVISION", "反映先のEditorが変わりました。依頼を反映せず停止しました");
        }
        return bridge;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new XriftMcpEditorToolError(
      "EDITOR_TIMEOUT",
      "Editorの起動を確認できませんでした。get_editor_contextで状態を確認してください",
    );
  };

  /** Leaves the current Editor session, saving first. */
  const leaveMcpProjectSession = async (): Promise<void> => {
    const bridge = mcpProjectBridgeRef.current;
    if (!bridge || !visualSessionRef.current) return;
    const left = await bridge.leave();
    if (!left || visualSessionRef.current) {
      throw new XriftMcpEditorToolError(
        "EDITOR_BUSY",
        "開いているプロジェクトを保存して閉じられませんでした。Studioの画面で保存の失敗を確認してください",
      );
    }
  };

  const describeOpenMcpSession = (extra: Record<string, unknown> = {}) => {
    const session = visualSessionRef.current;
    if (!session) throw editorSessionUnavailableError("open_project");
    return {
      path: session.project?.path ?? null,
      name: session.project?.name ?? session.bundle.project.metadata.name,
      kind: session.bundle.project.projectKind,
      projectId: session.bundle.project.projectId,
      sceneId: session.bundle.scene.sceneId,
      ...extra,
    };
  };

  const readMcpAccount = async () => {
    const account = await xrift.whoami(silentLog).catch(() => null);
    if (account) setUser(account);
    return {
      signedIn: account !== null,
      displayName: account?.displayName ?? null,
      id: account?.id ?? null,
    };
  };

  const inspectMcpPublishReadiness = async (
    tool: string,
    args: Record<string, unknown>,
  ) => {
    const bridge = requireMcpProjectBridge(tool);
    const session = visualSessionRef.current;
    if (!session) throw editorSessionUnavailableError(tool);
    const initial = bridge.currentBundle();
    if (
      (typeof args.projectId === "string" && args.projectId !== initial.project.projectId) ||
      (typeof args.sceneId === "string" && args.sceneId !== initial.scene.sceneId)
    ) {
      throw new XriftMcpEditorToolError(
        "STALE_REVISION",
        "対象シーンが現在のEditorと一致しません。get_editor_contextで再取得してください",
        { projectId: initial.project.projectId, sceneId: initial.scene.sceneId },
      );
    }
    const assertCurrent = () => {
      if (mcpProjectBridgeRef.current !== bridge || visualSessionRef.current?.bundle.project.projectId !== initial.project.projectId || bridge.currentBundle().scene.sceneId !== initial.scene.sceneId) {
        throw new XriftMcpEditorToolError("STALE_REVISION", "確認中に対象が変わりました。get_editor_contextで再取得してください");
      }
    };
    let path: string | undefined;
    let saved: PrototypeVisualProject | undefined;
    // saveNow first flushes code and Graph drafts. A flush can change the
    // document set; only inspect a snapshot that was actually saved unchanged.
    for (let attempt = 0; attempt < 3; attempt++) {
      assertCurrent();
      const before = bridge.currentBundle();
      path = await bridge.saveNow();
      assertCurrent();
      if (!path) break;
      if (before === bridge.currentBundle()) { saved = before; break; }
    }
    if (!path || !saved) {
      throw new XriftMcpEditorToolError(
        "EDITOR_ERROR",
        "保存が完了していないか、確認中に編集されました。保存状態を確認して再試行してください",
      );
    }
    const bundle = withLatestPublication(saved, visualSessionRef.current?.bundle.project.lastPublication);
    const kind = bundle.project.projectKind;
    const [thumbnail, account, scriptSources] = await Promise.all([
      inspectPublishThumbnail(path, kind),
      readMcpAccount(),
      readScriptSources(path, bundle.assets),
    ]);
    assertCurrent();
    if (bridge.currentBundle() !== saved) throw new XriftMcpEditorToolError("STALE_REVISION", "確認中に作品が編集されました。保存してから再試行してください");
    const review = analyzePublishReview({ bundle, scriptSources });
    const publication = bundle.project.lastPublication;
    const readiness = buildPublishReadiness({
      kind,
      metadata: inspectVisualPublishMetadata(bundle),
      thumbnail,
      signedIn: account.signedIn,
      displayName: account.displayName,
      diagnostics: review.diagnostics,
      remoteId:
        kind === "world"
          ? publication?.worldId ?? publication?.contentId
          : publication?.itemId ?? publication?.contentId,
    });
    return {
      bundle,
      path,
      readiness,
      review,
      result: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        path,
        kind,
        ...readiness,
        vramEstimate: review.vramEstimate,
        previousPublication: publication ?? null,
      },
    };
  };

  const chatgptGenerationRef = useRef<string | null>(null);
  const chatgptGenerationsRef = useRef(new Map<string, ChatgptGeneration>());
  const chatgptPlansRef = useRef(new Map<string, { plan: ChatgptWorldPlan; snapshots: Record<string, string>; target: "current" | "new" }>());
  const chatgptControlsRef = useRef(new Map<string, { cancelled: boolean }>());
  const [chatgptGeneration, setChatgptGeneration] = useState<ChatgptGeneration | null>(null);
  const generateChatgptWorld = async (model: string, prompt: string, options: ChatgptAssetOptions, generationId: string = crypto.randomUUID(), mode: ChatgptGenerationMode = "build", target: "current" | "new" = "current", approved?: ChatgptWorldPlan): Promise<Project | null> => {
    if (chatgptGenerationRef.current) throw new Error("制作の依頼を処理中です。完了するか停止してから、次の依頼を送ってください");
    if (mcpPublishActiveRef.current) throw new Error("公開を処理中です。完了してから制作の依頼を送ってください");
    const sourceId = visualSessionRef.current?.bundle.project.projectId;
    if (!sourceId || !projectsRoot || !tauri.isAvailable()) throw new Error("デスクトップ版でワールドを開いてください");
    const sourceBridge = requireMcpProjectBridge("ChatGPTの制作チャット");
    const sourceSceneId = sourceBridge.currentBundle().scene.sceneId;
    if (sourceBridge.currentBundle().project.projectKind !== "world") throw new Error("ワールドのプロジェクトを開いてください");
    if (!sourceBridge.currentContext().canGenerate) throw new Error("Playを停止し、素材の読み込み完了を待ってから依頼を送ってください");
    chatgptGenerationRef.current = generationId;
    const control = { cancelled: false };
    chatgptControlsRef.current.set(generationId, control);
    let job: ChatgptGeneration = { ...chatgptGenerationsRef.current.get(generationId), generationId, status: "running", mode, cancelling: false, model, prompt, options: { ...options }, sourceProjectId: sourceId, sourceSceneId, sceneId: sourceSceneId,
      progress: { phase: "planning", message: approved ? "確認したPlanを反映する準備をしています" : "現在のSceneと依頼を確認しています", completed: 0, total: 0, recentEvents: [] } };
    const jobs = chatgptGenerationsRef.current;
    if (!jobs.has(generationId) && jobs.size >= 8) { const oldest = jobs.keys().next().value!; jobs.delete(oldest); chatgptPlansRef.current.delete(oldest); }
    const report = (patch: Partial<ChatgptGeneration>, event?: Omit<ChatgptGenerationEvent, "sequence">) => {
      job = { ...job, ...patch, cancelling: control.cancelled && patch.status !== "cancelled" };
      if (event) job = { ...job, progress: { ...job.progress, recentEvents: [...job.progress.recentEvents,
        { ...event, sequence: (job.progress.recentEvents[job.progress.recentEvents.length - 1]?.sequence ?? 0) + 1 }].slice(-128) } };
      jobs.set(generationId, job); setChatgptGeneration(job);
    };
    const phase = (value: ChatgptGeneration["progress"]["phase"], message: string) => report({ progress: { ...job.progress, phase: value, message } }, { phase: value, message });
    report({}, { phase: "planning", message: job.progress.message });
    let createdProject: Project | null = null;
    let unlisten: (() => void) | undefined;
    const checkCancelled = () => { if (control.cancelled) throw new Error("制作を停止しました。保存済みの変更は残っています"); };
    try {
      sourceBridge.openChatgpt();
      const baseline = sourceBridge.currentBundle();
      const selectedEntityId = sourceBridge.currentContext().selectedEntityId;
      const sceneContext: ChatgptSceneContext = { title: [...(baseline.project.metadata.title ?? baseline.project.metadata.name)].slice(0, 100).join(""), entities: [] };
      const entities = Object.values(baseline.scene.entities).sort((a,b) => Number(b.id === selectedEntityId) - Number(a.id === selectedEntityId));
      for (const entity of target === "current" ? entities.slice(0, 100) : []) {
        const transform = entity.components.find(c => c.type === "transform");
        if (!transform) continue;
        const summary = { id: entity.id, name: [...entity.name].slice(0, 80).join(""), components: entity.components.map(c => c.type), position: [...transform.position], scale: [...transform.scale], rotation: transform.rotation.map(n => n * 180 / Math.PI) };
        sceneContext.entities.push(summary);
        if (new TextEncoder().encode(JSON.stringify(sceneContext)).byteLength > 15000) { sceneContext.entities.pop(); break; }
      }
      if (selectedEntityId && sceneContext.entities.some(e => e.id === selectedEntityId)) sceneContext.selectedEntityId = selectedEntityId;
      unlisten = await tauri.onChatgptGenerationProgress(progress => {
        if (progress.generationId !== generationId || job.status !== "running" || job.progress.phase !== "planning") return;
        if (control.cancelled) { void tauri.chatgptCancelGeneration(generationId).catch(() => undefined); return; }
        phase("planning", progress.message);
      });
      checkCancelled();
      const result = approved ? null : await tauri.chatgptPlan(model, prompt, options, options.materials ? MATERIAL_SHOWCASE_DEFINITIONS.map(v => ({id: materialShowcaseAssetId(v.key), name: v.name, extension: v.extensionLabel})) : [], generationId, target === "current" ? sceneContext : undefined);
      checkCancelled();
      const plan = approved ?? parseChatgptWorldPlan(result!.plan, result!.assetCandidates, options.materials, sceneContext.entities.map(e => e.id));
      const checkSource = () => {
        checkCancelled();
        if (visualSessionRef.current?.bundle.project.projectId !== sourceId || mcpProjectBridgeRef.current !== sourceBridge || sourceBridge.currentBundle().scene.sceneId !== sourceSceneId) throw new Error("開いている作品またはSceneが変わりました。依頼を反映せず停止しました");
        if (!sourceBridge.currentContext().canGenerate) throw new Error("Playまたは素材の読み込みが始まりました。停止してから再試行してください");
      };
      checkSource();
      const previousPlan = chatgptPlansRef.current.get(generationId);
      for (const edit of plan.edits ?? []) {
        const expected = approved ? previousPlan?.snapshots[edit.entityId] : JSON.stringify(baseline.scene.entities[edit.entityId]);
        if (!expected || JSON.stringify(sourceBridge.currentBundle().scene.entities[edit.entityId]) !== expected) throw new Error("調整するEntityがPlanの作成後に編集されました。Planを見直してください");
      }
      report({ plan: { title: plan.title, description: plan.description, objects: [...(plan.edits ?? []).map(v => ({ name: v.name ?? baseline.scene.entities[v.entityId]?.name ?? "Entity", shape: "調整" })), ...plan.objects.map(v => ({ name: v.name, shape: v.shape }))] },
        progress: { ...job.progress, total: plan.objects.length + (plan.edits?.length ?? 0) } });
      if (mode === "plan") {
        chatgptPlansRef.current.set(generationId, { plan, target, snapshots: Object.fromEntries((plan.edits ?? []).map(e => [e.entityId, JSON.stringify(sourceBridge.currentBundle().scene.entities[e.entityId])])) });
        report({ status: "planned", progress: { ...job.progress, phase: "planned", message: "Planを確認してください。反映するまでSceneは変更されません" } });
        return null;
      }
      phase("preparing", "依頼の反映前に、現在の作品を保存しています");
      const saveSource = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          checkSource();
          const before = sourceBridge.currentBundle();
          if (!(await sourceBridge.saveNow())) throw new Error("現在の作品を保存できませんでした。保存先を確認して再試行してください");
          checkSource();
          if (sourceBridge.currentBundle() === before) return before;
        }
        throw new Error("現在の作品が編集中です。操作を止めて再試行してください");
      };
      await saveSource();
      let project = visualSessionRef.current?.project;
      let targetBridge = sourceBridge;
      if (target === "new") {
      const name = await uniqueProjectDirectoryName(projectsRoot, `chatgpt-world-${Date.now()}`);
      const prepared = await prepareStarterVisualProject(createChatgptScaffold(plan, name));
      project = await createPreparedStarterVisualProjectOnDisk(projectsRoot, name, prepared);
      createdProject = project;
      checkSource();
      // Creating the new files is asynchronous; flush edits made during that
      // interval before the old Editor and its autosave timer are unmounted.
      const savedSource = await saveSource();
      checkSource();
      if (sourceBridge.currentBundle() !== savedSource) throw new Error("現在の作品が編集中です。操作を止めて再試行してください");
      const initial = prepared.plan;
      report({ projectId: initial.project.projectId, sceneId: initial.scene.sceneId, path: project.path, name: project.name,
        progress: { ...job.progress, projectId: initial.project.projectId } });
      setVisualCompilationFresh(false);
      setVisualThumbnailReadiness(null);
      const nextSession = { project, bundle: { project: initial.project, scene: initial.scene, assets: initial.assets, prefabs: initial.prefabs } };
      visualSessionRef.current = nextSession;
      setVisualSession(nextSession);
      targetBridge = await waitForMcpProjectBridge(sourceBridge, { projectId: initial.project.projectId, sceneId: initial.scene.sceneId }, checkCancelled);
      }
      if (!project) throw new Error("保存先を確認できませんでした");
      const targetId = targetBridge.currentBundle().project.projectId;
      const targetSceneId = targetBridge.currentBundle().scene.sceneId;
      report({ projectId: targetId, sceneId: targetSceneId, path: project.path, name: project.name, progress: { ...job.progress, projectId: targetId } });
      const checkTarget = (checkCancellation = true) => {
        if (checkCancellation) checkCancelled();
        if (visualSessionRef.current?.bundle.project.projectId !== targetId || mcpProjectBridgeRef.current !== targetBridge || targetBridge.currentBundle().scene.sceneId !== targetSceneId) throw new Error("開いている作品またはSceneが変わりました。保存済みの変更はプロジェクト一覧から確認できます");
        if (!targetBridge.currentContext().canGenerate) throw new Error("Playまたは素材の読み込みが始まったため依頼の反映を停止しました。保存済みのEntityは残っています");
      };
      checkTarget(); targetBridge.openChatgpt();
      const commit = (expectedBundle: PrototypeVisualProject, nextBundle: PrototypeVisualProject, entityId?: string) => {
        checkTarget();
        if (!targetBridge.applyGenerationStep({ expectedBundle, nextBundle, entityId })) throw new Error("反映中に作品が編集されました。編集内容を保ち、依頼の反映を停止しました");
      };
      const saveTarget = async () => {
        checkTarget(false);
        if (!(await targetBridge.saveNow())) throw new Error("作成中のワールドを保存できませんでした。保存先を確認し、Studioで保存を再試行してください");
        checkTarget(false);
      };
      const assetIds = new Map<string, string>();
      const requests = chatgptAssetRequests(plan);
      for (const [index, edit] of (plan.edits ?? []).entries()) {
        phase("placing", `${index + 1}/${job.progress.total}：${targetBridge.currentBundle().scene.entities[edit.entityId]?.name ?? "Entity"}を調整しています`);
        const before = targetBridge.currentBundle();
        const snapshot = approved ? previousPlan?.snapshots[edit.entityId] : JSON.stringify(baseline.scene.entities[edit.entityId]);
        if (JSON.stringify(before.scene.entities[edit.entityId]) !== snapshot) throw new Error("調整するEntityが編集中です。編集内容を保ち、Planの反映を停止しました");
        const changed = editChatgptEntity(before, edit);
        commit(before, changed.bundle, changed.entityId);
        await saveTarget();
        const name = changed.bundle.scene.entities[changed.entityId].name;
        report({ progress: { ...job.progress, completed: index + 1, message: `${name}を調整して保存しました` } }, { phase: "placing", message: `${name}を調整して保存しました`, entityId: changed.entityId, name });
        await new Promise(resolve => window.setTimeout(resolve, 40));
      }
      for (const [index, value] of plan.objects.entries()) {
        checkTarget();
        const needed = requests.filter(v => (v.kind === "texture" && v.externalId === value.materialExternalId) || (v.kind === value.shape && v.externalId === value.externalId));
        for (const asset of needed) {
          const key = `${asset.providerId}:${asset.externalId}`;
          if (assetIds.has(key)) continue;
          phase("importing", `${value.name}に使う素材を取り込んでいます`);
          const before = targetBridge.currentBundle();
          const choices = await tauri.getExternalStoreAssetOptions(asset.providerId, asset.externalId);
          const resolution = choices.resolutions.filter(v => v.byteLength > 0 && v.byteLength <= 32 * 1024 * 1024).sort((a,b) => a.byteLength - b.byteLength)[0];
          if (choices.assetKind !== asset.kind || !resolution) throw new Error(`${value.name}に使えるサイズの素材がありません。別の素材を使う依頼で再試行してください`);
          checkTarget();
          const installed = await tauri.installExternalStoreAsset(project.path, { providerId: asset.providerId, externalId: asset.externalId, resolution: resolution.id });
          const applied = await applyExternalStoreInstallAndAnalyzeModel(project.path, before.assets, installed);
          commit(before, { ...before, assets: applied.manifest });
          assetIds.set(key, applied.primaryAssetId);
          await saveTarget();
        }
        if (value.gltfMaterialId && !targetBridge.currentBundle().assets.assets[value.gltfMaterialId]) {
          phase("importing", `${value.name}のglTFマテリアルを取り込んでいます`);
          const before = targetBridge.currentBundle();
          const material = getMaterialShowcaseAsset(value.gltfMaterialId);
          if (!material) throw new Error(`${value.name}のglTFマテリアルが見つかりません`);
          const manifest = { ...before.assets, assets: { ...before.assets.assets, [material.id]: structuredClone(material) } };
          const withTextures = await ensureCatalogMaterialTextures(project.path, manifest, material.properties);
          if (!withTextures) throw new Error(`${value.name}のテクスチャを取り込めませんでした`);
          commit(before, { ...before, assets: withTextures });
          await saveTarget();
        }
        phase("placing", `${index + 1 + (plan.edits?.length ?? 0)}/${job.progress.total}：${value.name}を配置しています`);
        const before = targetBridge.currentBundle();
        const placed = placeChatgptObject(before, value, assetIds);
        commit(before, placed.bundle, placed.entityId);
        await saveTarget();
        report({ progress: { ...job.progress, completed: index + 1 + (plan.edits?.length ?? 0), message: `${value.name}を配置して保存しました` } },
          { phase: "placing", message: `${value.name}を配置して保存しました`, entityId: placed.entityId, name: value.name });
        // Yield to the live Scene and Inspector between actual saved operations.
        await new Promise(resolve => window.setTimeout(resolve, 40));
      }
      phase("saving", "ワールドの保存結果を確認しています");
      await saveTarget(); await refreshProjects();
      checkTarget();
      report({ status: "completed", nextActions: ["get_editor_context", "capture_scene_view"],
        progress: { ...job.progress, phase: "completed", message: "依頼を反映して保存しました。Scene ViewとInspectorで確認できます" } },
        { phase: "completed", message: "依頼した追加と調整を保存しました" });
      chatgptPlansRef.current.delete(generationId);
      toast({ kind: "success", title: "依頼を反映しました", description: "Scene ViewとInspectorで結果を確認できます。" });
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report({ status: control.cancelled ? "cancelled" : "failed", cancelling: false, error: control.cancelled ? undefined : message, nextActions: ["get_chatgpt_connection", "get_editor_context"],
        progress: { ...job.progress, phase: control.cancelled ? "cancelled" : "failed", message } }, { phase: control.cancelled ? "cancelled" : "failed", message });
      if (createdProject) await refreshProjects().catch(() => undefined);
      toast({ kind: control.cancelled ? "success" : "error", title: "制作を停止しました", description: message });
      throw error;
    } finally {
      unlisten?.(); chatgptControlsRef.current.delete(generationId);
      if (chatgptGenerationRef.current === generationId) chatgptGenerationRef.current = null;
    }
  };
  const handleChatgptGenerate = async (model: string, prompt: string, options: ChatgptAssetOptions, mode: ChatgptGenerationMode = "build"): Promise<void> => {
    await generateChatgptWorld(model, prompt, options, crypto.randomUUID(), mode);
  };
  const applyChatgptPlan = async (generationId: string) => {
    const job = chatgptGenerationsRef.current.get(generationId);
    const stored = chatgptPlansRef.current.get(generationId);
    if (!stored || job?.status !== "planned") throw new Error("反映できるPlanがありません。依頼を送ってPlanを作り直してください");
    if (job.sourceProjectId !== visualSessionRef.current?.bundle.project.projectId || job.sourceSceneId !== mcpProjectBridgeRef.current?.currentBundle().scene.sceneId) throw new Error("Planを作成したワールドとSceneを開いてから反映してください");
    await generateChatgptWorld(job.model, job.prompt, job.options, generationId, "build", stored.target, stored.plan);
  };
  const cancelChatgptGeneration = async (generationId: string) => {
    const control = chatgptControlsRef.current.get(generationId);
    const job = chatgptGenerationsRef.current.get(generationId);
    if (job?.status === "planned") {
      const cancelled: ChatgptGeneration = { ...job, status: "cancelled", progress: { ...job.progress, phase: "cancelled", message: "Planを破棄しました。Sceneは変更されていません" } };
      chatgptPlansRef.current.delete(generationId); chatgptGenerationsRef.current.set(generationId, cancelled); setChatgptGeneration(cancelled);
      return { generationId, cancelled: true };
    }
    if (!control || !job || job.status !== "running") return { generationId, cancelled: false };
    control.cancelled = true;
    const cancelling = { ...job, cancelling: true };
    chatgptGenerationsRef.current.set(generationId, cancelling); setChatgptGeneration(cancelling);
    if (job.progress.phase === "planning") await tauri.chatgptCancelGeneration(generationId);
    return { generationId, cancelled: true };
  };

  const handleMcpProjectTool = async (
    request: XriftMcpEditorRequestEvent,
  ): Promise<Record<string, unknown>> => {
    const args = request.arguments ?? {};
    switch (request.tool) {
      case "list_starter_templates":
        return { templates: listStarterTemplates() };
      case "list_projects": {
        const root = requireMcpProjectsRoot();
        await tauri.ensureDir(root);
        const list = await tauri.listProjects(root);
        setProjects(list);
        const openPath = visualSessionRef.current?.project?.path ?? null;
        return {
          projectsRoot: root,
          openProjectPath: openPath,
          projects: list.map((project) => summarizeProject(project, openPath)),
        };
      }
      case "get_account":
        return readMcpAccount();
      case "get_chatgpt_connection":
        return { ...(await tauri.chatgptStatus()), nextActions: ["connect_chatgpt", "list_chatgpt_models"] };
      case "connect_chatgpt":
        return { ...(await tauri.chatgptLogin()), nextActions: ["get_chatgpt_connection"], message: "ブラウザで本人が接続を許可してください。接続完了またはエラーはget_chatgpt_connectionで確認できます。" };
      case "disconnect_chatgpt":
        return { ...(await tauri.chatgptLogout()) };
      case "list_chatgpt_models":
        return { models: await tauri.chatgptModels() };
      case "open_chatgpt_panel": {
        const bridge = requireMcpProjectBridge(request.tool);
        if (bridge.currentBundle().project.projectKind !== "world") throw new XriftMcpEditorToolError("PROJECT_NOT_EDITABLE", "ワールドを開いてください");
        bridge.openChatgpt();
        return { opened: true, nextActions: ["get_chatgpt_connection"] };
      }
      case "generate_chatgpt_world": {
        const bridge = requireMcpProjectBridge(request.tool);
        if (bridge.currentBundle().project.projectKind !== "world") throw new XriftMcpEditorToolError("PROJECT_NOT_EDITABLE", "ワールドを開いてください");
        const context = bridge.currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) {
          throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        }
        if (!context.canGenerate || chatgptGenerationRef.current || mcpPublishActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "処理中です。Playと素材の読み込みを停止し、公開や生成が終わってから再試行してください");
        if (typeof args.model !== "string" || !args.model.trim() || args.model.length > 128 || typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 2000) {
          throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "モデルと2000文字以内の依頼を指定してください");
        }
        const options = args.options ?? { models: true, materials: true, audio: true };
        if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["models", "materials", "audio"].includes(key)) || !["models", "materials", "audio"].every(key => typeof (options as Record<string, unknown>)[key] === "boolean")) {
          throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "optionsにはmodels・materials・audioのbooleanを指定してください");
        }
        if (args.mode !== undefined && args.mode !== "build" && args.mode !== "plan") throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "modeにはbuildまたはplanを指定してください");
        if (args.target !== undefined && args.target !== "current" && args.target !== "new") throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "targetにはcurrentまたはnewを指定してください");
        const generationId = crypto.randomUUID();
        void generateChatgptWorld(args.model, args.prompt, options as ChatgptAssetOptions, generationId, args.mode ?? "build", args.target ?? "current").catch(() => undefined);
        return { generationId, status: "running", nextActions: ["get_chatgpt_generation"] };
      }
      case "apply_chatgpt_plan": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        if (!context.canGenerate || chatgptGenerationRef.current || mcpPublishActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "Play、素材の読み込み、制作、公開が終わってから再試行してください");
        const job = typeof args.generationId === "string" ? chatgptGenerationsRef.current.get(args.generationId) : undefined;
        if (!job || job.status !== "planned" || !chatgptPlansRef.current.has(job.generationId)) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "反映できるPlanのgenerationIdを指定してください");
        if (job.sourceProjectId !== context.projectId || job.sourceSceneId !== context.sceneId) throw new XriftMcpEditorToolError("STALE_REVISION", "Planを作成したワールドとSceneを開いてください");
        void applyChatgptPlan(job.generationId).catch(() => undefined);
        return { generationId: job.generationId, status: "running", nextActions: ["get_chatgpt_generation"] };
      }
      case "cancel_chatgpt_generation": {
        if (typeof args.generationId !== "string" || !chatgptGenerationsRef.current.has(args.generationId)) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "このStudioで開始したgenerationIdを指定してください");
        return cancelChatgptGeneration(args.generationId);
      }
      case "get_chatgpt_generation": {
        const result = typeof args.generationId === "string" ? chatgptGenerationsRef.current.get(args.generationId) : undefined;
        if (!result) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "このStudioで開始したgenerationIdを指定してください");
        return { ...result };
      }
      case "reload_xrift_items":
        retryStudioItemLoading();
        return { reloading: true, nextActions: ["capture_scene_view"] };
      case "login": {
        const account = await readMcpAccount();
        if (account.signedIn) return { ...account, started: false };
        void handleLogin();
        return {
          ...account,
          started: true,
          message:
            "ブラウザでXRiftのログインを完了してください。完了したかどうかはget_accountで確認します",
          nextActions: ["get_account"],
        };
      }
      case "create_project": {
        const root = requireMcpProjectsRoot();
        const { kind, name, templateId } = parseCreateProjectArguments(args);
        const existing = (await tauri.listProjects(root)).find(
          (project) => project.name === name,
        );
        if (existing) {
          throw new XriftMcpEditorToolError(
            "PROJECT_EXISTS",
            "同じ名前のプロジェクトがすでにあります。open_projectで開くか、別の名前を使ってください",
            { path: existing.path, name },
          );
        }
        const previousBridge = mcpProjectBridgeRef.current;
        await leaveMcpProjectSession();
        const plan = createStarterVisualProject(kind, templateId, name);
        const prepared = await prepareStarterVisualProject(plan);
        const bundle: PrototypeVisualProject = {
          project: prepared.plan.project,
          scene: prepared.plan.scene,
          assets: prepared.plan.assets,
          prefabs: prepared.plan.prefabs,
        };
        const project = await createPreparedStarterVisualProjectOnDisk(
          root,
          name,
          prepared,
        );
        setNewProjectError(null);
        setShowNewDialog(false);
        setVisualCompilationFresh(false);
        setVisualThumbnailReadiness(null);
        setVisualSession({ bundle, project });
        await refreshProjects();
        await waitForMcpProjectBridge(previousBridge);
        return describeOpenMcpSession({
          created: true,
          templateId,
          nextActions: ["get_editor_context", "begin_world_authoring"],
        });
      }
      case "open_project": {
        const root = requireMcpProjectsRoot();
        const target = resolveProjectTarget(await tauri.listProjects(root), args);
        const current = visualSessionRef.current;
        if (current?.project?.path === target.path && mcpProjectBridgeRef.current) {
          return describeOpenMcpSession({
            alreadyOpen: true,
            nextActions: ["get_editor_context"],
          });
        }
        const previousBridge = mcpProjectBridgeRef.current;
        await leaveMcpProjectSession();
        await loadVisualProjectSession(target);
        await waitForMcpProjectBridge(previousBridge);
        return describeOpenMcpSession({
          alreadyOpen: false,
          nextActions: ["get_editor_context", "get_world_authoring"],
        });
      }
      case "duplicate_project": {
        const root = requireMcpProjectsRoot();
        const list = await tauri.listProjects(root);
        const source = resolveTransferableProject(list, args);
        const directoryName = parseNewProjectDirectoryName(args, "newName", list);
        const title = parseOptionalProjectTitle(args);
        const copy = await tauri.duplicateProject(root, source.path, directoryName, title);
        await refreshProjects();
        const openPath = visualSessionRef.current?.project?.path ?? null;
        return {
          source: summarizeProject(source, openPath),
          project: summarizeProject(copy, openPath),
          nextActions: copy.format === "visual" ? ["open_project"] : ["list_projects"],
        };
      }
      case "export_project": {
        const root = requireMcpProjectsRoot();
        const list = await tauri.listProjects(root);
        const source = resolveTransferableProject(list, args);
        // The destination is fixed under the Library so a client can never
        // point the zip at a file outside it.
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        // Reserve room for the timestamp so long project names cannot make
        // successive exports target the same truncated filename.
        const archivePath = `${root}/.cache/exports/${projectPackageFileName(`${source.name.slice(0, 60)}-${stamp}`)}`;
        const result = await tauri.exportProjectArchive(root, source.path, archivePath);
        appendLog({
          kind: "info",
          text: `exported project archive: ${result.archivePath} (${result.fileCount} files)`,
          ts: Date.now(),
        });
        return {
          project: summarizeProject(source, visualSessionRef.current?.project?.path ?? null),
          archivePath: result.archivePath,
          fileCount: result.fileCount,
          totalBytes: result.totalBytes,
          excluded: ["node_modules", ".git", "dist", ".cache", "publication record"],
          message:
            ".xriftstudioファイルはLibraryの.cache/exportsに書きました。人に渡すときはこのファイルを移動または送信してください",
          nextActions: ["import_project"],
        };
      }
      case "import_project": {
        const root = requireMcpProjectsRoot();
        if (typeof args.repositoryUrl === "string" && args.repositoryUrl.trim()) {
          const repositoryUrl = args.repositoryUrl.trim();
          const list = await tauri.listProjects(root);
          const requestedName =
            typeof args.name === "string" && args.name.trim()
              ? args.name.trim()
              : suggestedNameForRepositoryUrl(repositoryUrl);
          const directoryName = parseNewProjectDirectoryName(
            { name: requestedName },
            "name",
            list,
          );
          const imported = await tauri.importProjectFromRepository(
            root,
            repositoryUrl,
            directoryName,
          );
          appendLog({
            kind: "info",
            text: `imported project from repository: ${repositoryUrl} -> ${imported.path}`,
            ts: Date.now(),
          });
          await refreshProjects();
          return {
            repositoryUrl,
            project: summarizeProject(imported, visualSessionRef.current?.project?.path ?? null),
            nextActions: imported.format === "visual" ? ["open_project"] : ["list_projects"],
          };
        }
        const archivePath = parseRequiredPath(args, "archivePath");
        const inspection = await tauri.inspectProjectArchive(archivePath);
        const list = await tauri.listProjects(root);
        const requestedName =
          typeof args.name === "string" && args.name.trim()
            ? args.name.trim()
            : inspection.suggestedName;
        const directoryName = parseNewProjectDirectoryName(
          { name: requestedName },
          "name",
          list,
        );
        const imported = await tauri.importProjectArchive(root, archivePath, directoryName);
        appendLog({
          kind: "info",
          text: `imported project archive: ${archivePath} -> ${imported.path}`,
          ts: Date.now(),
        });
        await refreshProjects();
        return {
          archive: {
            path: inspection.archivePath,
            kind: inspection.kind,
            format: inspection.format,
            title: inspection.title,
            fileCount: inspection.fileCount,
            totalBytes: inspection.totalBytes,
          },
          project: summarizeProject(imported, visualSessionRef.current?.project?.path ?? null),
          nextActions: imported.format === "visual" ? ["open_project"] : ["list_projects"],
        };
      }
      case "close_project": {
        const closing = describeOpenMcpSession();
        requireMcpProjectBridge(request.tool);
        await leaveMcpProjectSession();
        return { ...closing, closed: true, nextActions: ["list_projects"] };
      }
      case "get_publish_readiness":
        return (await inspectMcpPublishReadiness(request.tool, args)).result;
      case "publish_project": {
        if (mcpPublishActiveRef.current || chatgptGenerationRef.current) {
          throw new XriftMcpEditorToolError(
            "EDITOR_BUSY",
            "公開または制作の依頼を処理中です。完了してからget_publish_readinessで状態を確認してください",
          );
        }
        const inspected = await inspectMcpPublishReadiness(request.tool, args);
        if (!inspected.readiness.ready) {
          throw new XriftMcpEditorToolError(
            "PUBLISH_NOT_READY",
            "公開の条件が揃っていません。requirementsとnextActionsに従って直してから、もう一度publish_projectを呼んでください",
            {
              requirements: inspected.readiness.requirements,
              nextActions: inspected.readiness.nextActions,
              blockingDiagnostics: inspected.readiness.blockingDiagnostics,
            },
          );
        }
        const progress: string[] = [];
          const controller = new AbortController();
          const result = await runVisualPublish(
            inspected.bundle,
            (step) => {
              const line = step.detail ? `${step.label}: ${step.detail}` : step.label;
              if (progress[progress.length - 1] !== line) progress.push(line);
            },
            controller.signal,
          );
          const kind = inspected.bundle.project.projectKind;
          const remoteId =
            kind === "world"
              ? result.worldId ?? result.contentId
              : result.itemId ?? result.contentId;
          toast({
            kind: "success",
            title: `AIクライアントから${kind === "world" ? "ワールド" : "アイテム"}を公開しました`,
            description: result.url ?? remoteId ?? undefined,
          });
          return {
            projectId: inspected.bundle.project.projectId,
            sceneId: inspected.bundle.scene.sceneId,
            kind,
            published: true,
            remoteId: remoteId ?? null,
            url: result.url ?? null,
            versionId: result.versionId ?? null,
            versionNumber: result.versionNumber ?? null,
            uploadedAt: result.uploadedAt ?? null,
            status: result.status ?? null,
            warnings: inspected.readiness.warningDiagnostics,
            progress,
            message: result.url
              ? "公開しました。URLを利用者に伝えてください"
              : "公開しました。XRiftの公開先を確認してください",
          };
      }
      default:
        throw new XriftMcpEditorToolError(
          "TOOL_NOT_FOUND",
          "対応していないAI editor toolです",
        );
    }
  };
  const handleMcpProjectToolRef = useRef(handleMcpProjectTool);
  handleMcpProjectToolRef.current = handleMcpProjectTool;

  useEffect(() => {
    if (!tauri.isAvailable()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let heartbeat: number | undefined;
    const respond = (response: XriftMcpEditorResponse) =>
      tauri.completeXriftMcpRequest(response).catch(() => undefined);
    const fail = (id: string, error: unknown) => {
      const editorError =
        error instanceof XriftMcpEditorToolError
          ? error
          : new XriftMcpEditorToolError(
              "EDITOR_ERROR",
              error instanceof Error ? error.message : String(error),
            );
      return respond({
        id,
        ok: false,
        error: {
          code: editorError.code,
          message: editorError.message,
          details: editorError.details,
        },
      });
    };
    void tauri
      .onXriftMcpEditorRequest((request) => {
        if (disposed) return;
        if (isXriftMcpProjectTool(request.tool)) {
          void handleMcpProjectToolRef
            .current(request)
            .then((result) => respond({ id: request.id, ok: true, result }))
            .catch((error) => fail(request.id, error));
          return;
        }
        // Editor tools with no Editor listening would otherwise wait for the
        // broker's timeout. Editor-backed project tools are handled above.
        if (!mcpProjectBridgeRef.current) {
          void fail(request.id, editorSessionUnavailableError(request.tool));
        }
      })
      .then(async (dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        try {
          await tauri.setXriftMcpEditorReady(true);
          heartbeat = window.setInterval(() => {
            void tauri.setXriftMcpEditorReady(true).catch(() => undefined);
          }, 5_000);
        } catch (error) {
          appendLog({ kind: "stderr", text: `mcp bridge: ${String(error)}`, ts: Date.now() });
        }
      })
      .catch((error) => {
        appendLog({ kind: "stderr", text: `mcp bridge: ${String(error)}`, ts: Date.now() });
      });
    return () => {
      disposed = true;
      unlisten?.();
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      void tauri.setXriftMcpEditorReady(false).catch(() => undefined);
    };
  }, [appendLog]);

  const handleImportClassicProject = (
    kind: ProjectKind,
    name: string,
    source: ClassicProjectCreationSource,
  ) => {
    setVisualCompilationFresh(false);
    setVisualThumbnailReadiness(null);
    void wrap(async () => {
      try {
        const imported = await createVisualProjectFromClassicSource({
          projectsRoot,
          directoryName: name,
          projectKind: kind,
          source,
        });
        setShowNewDialog(false);
        setVisualSession({
          bundle: imported.bundle,
          project: imported.project,
        });
        await refreshProjects();

        const detailParts = [
          `${imported.importedEntityCount}件のシーン要素`,
          `${imported.importedAssetCount}件の素材`,
        ];
        if (imported.unavailableAssetCount > 0) {
          detailParts.push(
            `${imported.unavailableAssetCount}件の未対応素材をスキップ`,
          );
        } else if (imported.warningCount > 0) {
          detailParts.push(`変換時の注意${imported.warningCount}件`);
        }
        toast({
          kind: "success",
          title: "コードプロジェクトを変換しました",
          description: detailParts.join(" / "),
        });
      } catch (error) {
        toast({
          kind: "error",
          title: "コードプロジェクトを変換できませんでした",
          description:
            error instanceof Error
              ? error.message
              : "コードプロジェクトとプロジェクト種別を確認してください。",
        });
      }
    });
  };

  const handleSelectClassicProjectDirectory = async (
    kind: ProjectKind,
  ): Promise<string | null> => {
    if (!tauri.isAvailable()) {
      throw new Error(
        "コードプロジェクトのフォルダー選択はデスクトップ版で利用できます。",
      );
    }
    const selected = await tauri.selectDirectory(
      `コードエディターの${kind === "world" ? "ワールド" : "アイテム"}プロジェクトを選択`,
    );
    const projectPath = Array.isArray(selected) ? selected[0] : selected;
    return typeof projectPath === "string" && projectPath.trim()
      ? projectPath
      : null;
  };

  /** Reads a Visual project from disk and makes it the open Editor session. */
  const loadVisualProjectSession = async (project: Project) => {
    setVisualCompilationFresh(false);
    setVisualThumbnailReadiness(null);
    setVisualLoading(true);
    try {
      await readVisualProjectFromDisk(project.path).then((documents) => {
        const scene = documents.scenes[documents.project.entrySceneId];
        if (!scene) throw new Error("開始時に読み込むシーンが見つかりません");
        // v1 removed the Animation Component, so a project saved before it was
        // converted while it loaded. Said once, on open, because the author is
        // about to look at a Scene whose Hierarchy changed under them.
        const migrationNotice = documents.animationMigration
          ? describeAnimationComponentMigration(documents.animationMigration)
          : null;
        if (migrationNotice) {
          toast({
            kind: "info",
            title: "Animationをグラフへ変換しました",
            description: `${migrationNotice}。保存すると確定します。`,
          });
        }
        // Node visibility used to be a flag nothing read. Opening realigns the
        // stale flags with what renders, and the author should hear why the
        // Hierarchy's eye icons just changed under them.
        if (documents.modelNodeEnabledReconciled) {
          toast({
            kind: "info",
            title: "モデルノードの表示状態を整えました",
            description: `${documents.modelNodeEnabledReconciled}件のノードの目アイコンを、実際の表示と一致させました。以後は目アイコンでモデル内のノードを非表示にできます。`,
          });
        }
        setVisualSession({
          project,
          bundle: {
            project: documents.project,
            scene,
            assets: documents.assets,
            prefabs: documents.prefabs,
          },
        });
      });
    } finally {
      setVisualLoading(false);
    }
  };

  const handleOpenProject = (project: Project) => {
    if (project.format === "classic") {
      setSelected(project);
      return;
    }
    void loadVisualProjectSession(project).catch((error) => {
      toast({
        kind: "error",
        title: "ビジュアルプロジェクトを開けませんでした",
        description: String(error),
      });
    });
  };

  const handleSaveVisualProject = async (
    bundle: PrototypeVisualProject,
    notify = true,
    refreshLibrary = notify,
  ): Promise<string> => {
    const currentSession = visualSessionRef.current;
    if (!currentSession || currentSession.bundle.project.projectId !== bundle.project.projectId) {
      throw new Error("保存対象のプロジェクトが変わりました。現在の作品を開き直してから保存してください");
    }
    const persistedBundle = withLatestPublication(
      bundle,
      currentSession?.bundle.project.lastPublication,
    );
    const documents = {
      project: persistedBundle.project,
      scenes: { [persistedBundle.scene.sceneId]: persistedBundle.scene },
      assets: persistedBundle.assets,
      prefabs: persistedBundle.prefabs,
    };
    try {
      if (currentSession?.project) {
        await saveVisualProjectToDisk(currentSession.project.path, documents);
        const nextSession = { ...currentSession, bundle: persistedBundle };
        if (visualSessionRef.current === currentSession) {
          visualSessionRef.current = nextSession;
          setVisualSession(current => current === currentSession ? nextSession : current);
        }
        if (refreshLibrary) await refreshProjects();
        if (notify) {
          toast({
            kind: "success",
            title: "ビジュアルプロジェクトを保存しました",
            description: persistedBundle.project.metadata.name,
          });
        }
        return currentSession.project.path;
      } else {
        // A demo opened from the setup screen carries the template's name, so
        // a second one would collide with the first's directory forever and
        // the editor could neither save nor leave.
        const project = await createVisualProjectOnDisk(
          projectsRoot,
          await uniqueProjectDirectoryName(
            projectsRoot,
            persistedBundle.project.metadata.name,
          ),
          documents,
        );
        const nextSession = { bundle: persistedBundle, project };
        if (visualSessionRef.current === currentSession) {
          visualSessionRef.current = nextSession;
          setVisualSession(current => current === currentSession ? nextSession : current);
        }
        if (refreshLibrary) await refreshProjects();
        if (notify) {
          toast({
            kind: "success",
            title: "ビジュアルプロジェクトを保存しました",
            description: persistedBundle.project.metadata.name,
          });
        }
        return project.path;
      }
    } catch (error) {
      if (notify) {
        toast({
          kind: "error",
          title: "保存できませんでした",
          description: String(error),
        });
      }
      throw error;
    }
  };

  const visualPublishScriptSourceRequestKey = useMemo(
    () =>
      visualPublishBundle
        ? JSON.stringify([
            visualSession?.project?.path ?? "",
            listScriptAssets(visualPublishBundle.assets).map((asset) => [
              asset.id,
              asset.source.relativePath,
            ]),
          ])
        : null,
    [
      visualPublishBundle?.assets,
      visualSession?.project?.path,
    ],
  );
  useEffect(() => {
    const assets = visualPublishBundle?.assets;
    const requestKey = visualPublishScriptSourceRequestKey;
    if (!assets || requestKey === null) {
      setVisualPublishScriptSources({
        requestKey: null,
        loading: false,
        sources: {},
      });
      return;
    }
    let active = true;
    setVisualPublishScriptSources({
      requestKey,
      loading: true,
      sources: {},
    });
    void readScriptSources(
      visualSession?.project?.path,
      assets,
    ).then((sources) => {
      if (!active) return;
      setVisualPublishScriptSources({
        requestKey,
        loading: false,
        sources,
      });
    });
    return () => {
      active = false;
    };
  }, [
    visualPublishBundle?.assets,
    visualPublishScriptSourceRequestKey,
    visualSession?.project?.path,
  ]);
  const visualPublishReviewRequest = useMemo(() => {
    if (!visualPublishBundle ||
      visualPublishScriptSources.requestKey !== visualPublishScriptSourceRequestKey ||
      visualPublishScriptSources.loading) return null;
    return { bundle: visualPublishBundle, scriptSources: visualPublishScriptSources.sources };
  }, [visualPublishBundle, visualPublishScriptSourceRequestKey, visualPublishScriptSources]);
  const visualPublishReview = usePublishReview(visualPublishReviewRequest);

  if (visualSession) {
    const publishBundle = visualPublishBundle;
    const handleVisualEditorBack = () => {
      // An explicit leave makes this Scene's running request inaccessible.
      // Abort its native plan; retain the lease until safe cleanup completes.
      const generationId = chatgptGenerationRef.current;
      if (generationId) void cancelChatgptGeneration(generationId).catch(error => {
        toast({ kind: "error", title: "制作の停止を確認できませんでした", description: error instanceof Error ? error.message : String(error) });
      });
      setVisualPublishBundle(null);
      setVisualClassicExportBundle(null);
      // MCP leave() resolves before React's next render. Publish the closed
      // session immediately so close_project and in-flight guards see it.
      visualSessionRef.current = null;
      setVisualSession(null);
      void refreshProjects();
    };
    return (
      <>
        <VisualEditorErrorBoundary
          key={visualSession.bundle.project.projectId}
          featureName="ビジュアルエディター"
          projectName={visualSession.bundle.project.metadata.name}
          projectDescription={visualSession.bundle.project.metadata.description}
          projectCount={projects.length}
          onBack={handleVisualEditorBack}
          backLabel={runtime?.ready ? "プロジェクト一覧に戻る" : "セットアップに戻る"}
        >
          <Suspense
            fallback={
              <StudioLoading message="ビジュアルエディターを準備しています…" />
            }
          >
            <VisualEditorPrototype
              projectKind={visualSession.bundle.project.projectKind}
              projectName={visualSession.bundle.project.metadata.name}
              projectPath={visualSession.project?.path}
              initialBundle={visualSession.bundle}
              compilationFresh={visualCompilationFresh}
              onChatgptGenerate={handleChatgptGenerate}
              onChatgptApplyPlan={async id => { await applyChatgptPlan(id); }}
              onChatgptCancel={cancelChatgptGeneration}
              appUpdate={appUpdate}
              onCheckAppUpdate={() => void checkAppUpdate(true)}
              onShowAppUpdate={() => setShowAppUpdate(true)}
              chatgptGeneration={chatgptGeneration}
              chatgptConversation={Array.from(chatgptGenerationsRef.current.values())}
              onSave={(bundle) => {
                setVisualCompilationFresh(false);
                return handleSaveVisualProject(bundle, false, false);
              }}
              onThumbnailChanged={() => {
                setVisualCompilationFresh(false);
                const path = visualSession.project?.path;
                if (!path) {
                  setVisualThumbnailReadiness(null);
                  setVisualThumbnailPreview(null);
                  return;
                }
                void refreshVisualThumbnail(
                  path,
                  visualSession.bundle.project.projectKind,
                );
              }}
              thumbnailCaptureRequest={visualThumbnailCaptureRequest}
              onThumbnailCaptured={handleVisualThumbnailCaptured}
              onThumbnailCaptureError={handleVisualThumbnailCaptureError}
              onUpload={(bundle) => {
                const publishBundle = withLatestPublication(
                  bundle,
                  visualSession.bundle.project.lastPublication,
                );
                setVisualPublishBundle(publishBundle);
                setVisualThumbnailReadiness(null);
                setVisualThumbnailPreview(null);
                const path = visualSession.project?.path;
                if (path) {
                  void refreshVisualThumbnail(
                    path,
                    publishBundle.project.projectKind,
                  );
                }
              }}
              onRegisterExternalAssetsCommit={(commit) => {
                visualExternalAssetsCommitRef.current = commit;
              }}
              onRegisterMcpProjectBridge={registerMcpProjectBridge}
              onClassicExport={(bundle) => {
                setVisualClassicExportBundle(bundle);
              }}
              onBack={handleVisualEditorBack}
            />
          </Suspense>
        </VisualEditorErrorBoundary>
        <VisualUploadDialog
          open={publishBundle !== null}
          projectKind={visualSession.bundle.project.projectKind}
          review={{
            title: publishBundle?.project.metadata.title ?? "",
            description: publishBundle?.project.metadata.description ?? "",
            thumbnailReady: visualThumbnailReadiness?.state === "ready",
            thumbnailSource:
              visualThumbnailReadiness?.source === "project"
                ? "project"
                : visualThumbnailReadiness?.source === "template"
                  ? "template"
                  : undefined,
            thumbnailPreview: visualThumbnailPreview,
            signedIn: user !== null,
            displayName: user?.displayName,
            saved: false,
            compilationFresh: visualCompilationFresh,
            remoteId:
              visualSession.bundle.project.projectKind === "world"
                ? publishBundle?.project.lastPublication?.worldId ??
                  publishBundle?.project.lastPublication?.contentId
                : publishBundle?.project.lastPublication?.itemId ??
                  publishBundle?.project.lastPublication?.contentId,
            previouslyPublished: Boolean(
              publishBundle?.project.lastPublication,
            ),
            checking: Boolean(publishBundle && (!visualPublishReviewRequest || visualPublishReview.checking)),
            diagnostics: visualPublishReview.failed
              ? [PUBLISH_REVIEW_FAILURE]
              : visualPublishReview.result?.diagnostics ?? [],
            vramEstimate: visualPublishReview.result?.vramEstimate,
          }}
          onClose={() => setVisualPublishBundle(null)}
          onMetadataChange={(title, description) => {
            setVisualCompilationFresh(false);
            setVisualPublishBundle((current) =>
              current
                ? {
                    ...current,
                    project: {
                      ...current.project,
                      metadata: {
                        ...current.project.metadata,
                        title,
                        description,
                        updatedAt: new Date().toISOString(),
                      },
                    },
                  }
                : current,
            );
          }}
          onEditThumbnail={() => {
            setVisualPublishBundle(null);
            toast({
              kind: "info",
              title: "シーン設定からサムネイルを編集してください",
              description: "左下の歯車を開き、「サムネイルを編集」を選択します。",
            });
          }}
          onGenerateThumbnail={requestVisualThumbnailCapture}
          onSaveThumbnail={async (dataUrl) => {
            const currentSession = visualSessionRef.current;
            const path = currentSession?.project?.path;
            if (!path) {
              throw new Error("プロジェクトを保存してからサムネイルを設定してください");
            }
            await tauri.writeThumbnail(path, dataUrl);
            announceProjectThumbnailChanged();
            setVisualCompilationFresh(false);
            await refreshVisualThumbnail(
              path,
              currentSession.bundle.project.projectKind,
            );
          }}
          onLogin={() => void handleLogin()}
          onLocateDiagnostic={(diagnostic) => {
            setVisualPublishBundle(null);
            toast({
              kind: diagnostic.severity === "blocking" ? "error" : "info",
              title: diagnostic.message,
              description:
                diagnostic.entityId ?? diagnostic.assetId ?? diagnostic.fieldPath,
            });
          }}
          onApplyOptimizations={async (recommendationIds, report) => {
            if (!publishBundle) {
              throw new Error("最適化する制作データがありません。");
            }
            const projectPath = await handleSaveVisualProject(
              publishBundle,
              false,
              false,
            );
            const recommendations =
              estimateWorldVram(publishBundle).recommendations;
            const result = await applyAssetOptimizations(
              projectPath,
              publishBundle,
              recommendations,
              recommendationIds,
              report,
            );
            await handleSaveVisualProject(result.bundle, false, false);
            setVisualPublishBundle(result.bundle);
            setVisualCompilationFresh(false);
            visualExternalAssetsCommitRef.current?.({
              expectedAssets: publishBundle.assets,
              nextAssets: result.bundle.assets,
              notice: `${result.optimizedAssetCount}件の素材を最適化しました。シーンも最適化後の素材を使います`,
            });
            return {
              optimizedAssetCount: result.optimizedAssetCount,
              beforeBytes: result.beforeBytes,
              afterBytes: result.afterBytes,
              skipped: result.skipped,
            };
          }}
          onClearStaleUploadAttempt={(() => {
            const stuckProjectPath = visualSession.project?.path;
            if (!stuckProjectPath || !publishBundle) return undefined;
            // Only reachable from the unresolved-attempt panel, after the author
            // has checked XRift. Tauri still refuses if the staging publication
            // moved after the attempt started, so an upload that actually
            // completed can never be erased here.
            return async () => {
              await clearStaleXriftUploadAttempt(
                stuckProjectPath,
                publishBundle.project.projectId,
                publishBundle.project.projectKind,
              );
            };
          })()}
          onPublish={async (report, signal) => {
            if (!publishBundle) throw new Error("公開する制作データがありません。");
            return runVisualPublish(publishBundle, report, signal);
          }}
        />
        <ClassicExportDialog
          open={visualClassicExportBundle !== null}
          projectKind={visualSession.bundle.project.projectKind}
          projectName={visualSession.bundle.project.metadata.name}
          onClose={() => setVisualClassicExportBundle(null)}
          onChooseTarget={async () => {
            const selectedPath = await tauri.selectDirectory(
              "XRiftコードプロジェクトを選択",
              projectsRoot || undefined,
            );
            if (!selectedPath || Array.isArray(selectedPath)) return null;
            return inspectClassicExportTarget(
              selectedPath,
              visualSession.bundle.project.projectKind,
            );
          }}
          onExport={async (
            target: ClassicExportTarget,
            integration: ClassicExportIntegration,
            installDependencies: boolean,
            report: (progress: ClassicExportProgress) => void,
          ) => {
            const exportBundle = visualClassicExportBundle;
            if (!exportBundle) {
              throw new Error("書き出すビジュアルエディターのプロジェクトがありません。");
            }
            const result = await exportVisualProjectToClassic({
              authoringProjectPath: visualSession.project?.path ?? "",
              target,
              documents: {
                project: exportBundle.project,
                scenes: { [exportBundle.scene.sceneId]: exportBundle.scene },
                assets: exportBundle.assets,
                prefabs: exportBundle.prefabs,
              },
              integration,
              installDependencies,
              save: () => handleSaveVisualProject(exportBundle, false),
              report,
              onLog: appendLog,
            });
            toast({
              kind: "success",
              title: "XRiftコードエディターへ書き出しました",
              description:
                integration === "component"
                  ? "組み込み用コードを追加すると、既存のシーンと一緒に使えます。"
                  : "バックアップを残してエントリーを切り替えました。",
            });
            return result;
          }}
          onOpenFolder={(path) => tauri.openDirectory(path)}
          onOpenVSCode={async (path) => {
            await openInVSCode(path, appendLog);
          }}
          onOpenTerminal={(path) => openTerminal(path, appendLog)}
        />
      </>
    );
  }

  if (visualLoading) {
    return (
      <StudioLoading message="プロジェクトを開いています…" />
    );
  }

  if (runtimeLoading) {
    return (
      <StudioLoading message="制作環境を準備しています…" />
    );
  }

  if (!runtime || !runtime.ready) {
    return (
      runtime && (
        <SetupView
          status={runtime}
          onReady={(s) => setRuntime(s)}
        />
      )
    );
  }

  const cliUpdateDialog = (
    <UpdateDialog
      open={updateInfo !== null}
      currentVersion={updateInfo?.current ?? null}
      latestVersion={updateInfo?.latest ?? null}
      busy={updating}
      onUpdate={handleUpdateXrift}
      onClose={() => !updating && setUpdateInfo(null)}
    />
  );
  const appUpdateDialog = (
    <AppUpdateDialog
      open={showAppUpdate}
      state={appUpdate}
      onInstall={() => void handleInstallAppUpdate()}
      onRetry={() => void checkAppUpdate(true)}
      onClose={() => {
        if (
          appUpdate.phase !== "checking" &&
          appUpdate.phase !== "downloading" &&
          appUpdate.phase !== "installing" &&
          appUpdate.phase !== "restarting"
        ) {
          setShowAppUpdate(false);
        }
      }}
    />
  );

  if (selected) {
    return (
      <>
        <Suspense fallback={<StudioLoading message="コードエディターを準備しています…" />}><EditorView
          project={selected}
          user={user}
          busy={busy}
          appendLog={appendLog}
          logs={logs}
          setBusy={setBusy}
          clearLogs={() => setLogs([])}
          onBack={() => setSelected(null)}
          onProjectChanged={refreshProjects}
        /></Suspense>
        {cliUpdateDialog}
        {appUpdateDialog}
      </>
    );
  }

  return (
    <>
      <ProjectLibrary
        projects={projects}
        loading={projectsLoading}
        user={user}
        userLoading={userLoading}
        busy={busy}
        projectsRoot={projectsRoot}
        onOpen={handleOpenProject}
        onDelete={handleDeleteProject}
        onDuplicate={handleDuplicateProject}
        onExport={handleExportProject}
        onInspectArchive={handleInspectProjectArchive}
        requestedImportInspection={openedArchiveInspection}
        onRequestedImportInspectionHandled={handleOpenedArchiveInspectionHandled}
        onImportArchive={handleImportProjectArchive}
        onImportRepository={handleImportProjectRepository}
        onRevealFile={(path) => void tauri.revealItemInDir(path).catch((error) => {
          toast({ kind: "error", title: "保存先を開けませんでした", description: String(error) });
        })}
        onNew={() => {
          setNewProjectError(null);
          setShowNewDialog(true);
        }}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefresh={refreshProjects}
        appUpdate={appUpdate}
        onCheckAppUpdate={() => void checkAppUpdate(true)}
        onShowAppUpdate={() => setShowAppUpdate(true)}
        onOpenMcp={() => setLibraryMcpOpen(true)}
      />
      {libraryMcpOpen ? <Suspense fallback={null}><McpConnectionSettings onClose={() => setLibraryMcpOpen(false)} /></Suspense> : null}
      <NewProjectDialog
        open={showNewDialog}
        busy={busy}
        creationError={newProjectError}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreate}
        onOpenVisualEditor={handleOpenVisualEditor}
        onImportClassicProject={handleImportClassicProject}
        onSelectClassicProjectDirectory={handleSelectClassicProjectDirectory}
      />
      {cliUpdateDialog}
      {appUpdateDialog}
    </>
  );
}

function describeStarterPreparationError(error: unknown): string {
  if (!(error instanceof StarterAssetCopyError)) return String(error);

  const { copy, details, reason } = error;
  const label = copy.assetId.includes("license")
    ? "テンプレートのライセンス"
    : copy.mediaType.startsWith("text/")
      ? "テンプレートの由来ファイル"
      : "テンプレート素材";
  const receivedSize = details.actualByteLength;
  const formatBytes = (value: number) => `${value.toLocaleString("ja-JP")} bytes`;

  switch (reason) {
    case "load":
      return details.responseStatus === undefined
        ? `${label}を読み込めませんでした。アプリを再起動してください。`
        : `${label}を読み込めませんでした（HTTP ${details.responseStatus}）。アプリを再起動してください。`;
    case "empty":
      return `${label}が空です。アプリを再起動してください。`;
    case "size":
      return `${label}のサイズが一致しません。取得値: ${formatBytes(receivedSize ?? 0)}、期待値: ${formatBytes(copy.expectedByteLength)}。アプリを再起動してください。`;
    case "hash":
      return `${label}のSHA-256が一致しません。取得値: ${formatBytes(receivedSize ?? 0)}。アプリを再起動してください。`;
    case "license-content":
      return `${label}の内容を確認できませんでした。アプリを再起動してください。`;
  }
}

export default App;
