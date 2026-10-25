import { authoringSceneProgressFingerprint } from "./lib/visual-editor/authoring-scene-progress";
import { chatgptPlanningSnapshot } from "./lib/visual-editor/chatgpt-plan-guards";
import { authoringFingerprint } from "./lib/visual-editor/world-authoring";
import type { PiRunControl, PiStoredPlan } from "./lib/visual-editor/pi-authoring";
import { createPiAuthoringRunner } from "./lib/visual-editor/pi-authoring-host";
import { createChatgptReasoningPreferences } from "./lib/visual-editor/chatgpt-reasoning";
import { acquireAuthoringProjectWrite } from "./lib/visual-editor/world-authoring-native";
import { hasAuthoringRunOwner, readAuthoringState } from "./lib/visual-editor/world-authoring";








import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rebaseChatgptStep } from "./lib/visual-editor/chatgpt-generation";
import type { PiAuthoringRun as ChatgptGeneration, PiMode as ChatgptGenerationMode } from "./lib/visual-editor/pi-authoring";
import { useChatgptSessions } from "./components/visual-editor/useChatgptSessions";






import { validateChatgptQuestionAnswers, type ChatgptQuestionAnswer } from "./lib/visual-editor/chatgpt-questions";
import { branchChatgptSession, piSessionHistoryRoots, chatgptRevertBundle, chatgptSessionTranscript, createChatgptSession, upsertChatgptSessionTurn, type ChatgptRevertCheckpoint } from "./lib/visual-editor/chatgpt-sessions";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { retryStudioItemLoading } from "./lib/visual-editor/xrift-item-loader";
import { StudioLoading } from "./components/StudioLoading";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SetupView } from "./components/SetupView";
import { UpdateDialog } from "./components/UpdateDialog";
import { suggestedNameForRepositoryUrl } from "./components/ProjectTransferDialogs";
import { projectPackageFileName } from "./lib/project-package";
import { AppUpdateDialog } from "./components/AppUpdateDialog";
import { tauri, type ChatgptAssetOptions, type Project, type ProjectArchiveExport, type ProjectArchiveInspection, type ProjectKind, type RuntimeStatus, type XriftMcpEditorRequestEvent, type XriftMcpEditorResponse } from "./lib/tauri";
import type { VisualEditorMcpProjectBridge } from "./components/visual-editor/VisualEditorPrototype";
import { xrift, clearCaches, openInVSCode, openTerminal, type LogLine, type Whoami } from "./lib/xrift-cli";
import { isNewer } from "./lib/semver";
import { inspectPublishThumbnail, type PublishThumbnailReadiness } from "./lib/publish-readiness";
import { announceProjectThumbnailChanged } from "./lib/project-thumbnail";
import { useToast } from "./components/Toast";
import { checkForAppUpdate, INITIAL_APP_UPDATE_STATE, installAppUpdate, relaunchAfterAppUpdate, type AppUpdateHandle, type AppUpdateState } from "./lib/app-updater";
import { VisualUploadDialog } from "./components/visual-editor/VisualUploadDialog";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { usePublishReview } from "./lib/visual-editor/use-publish-review";
import { PUBLISH_REVIEW_FAILURE, analyzePublishReview } from "./lib/visual-editor/publish-review";
import { ClassicExportDialog } from "./components/visual-editor/ClassicExportDialog";
import { applyAssetOptimizations, exportVisualProjectToClassic, estimateWorldVram, inspectClassicExportTarget, createVisualProjectFromClassicSource, createStarterVisualProject, createPreparedStarterVisualProjectOnDisk, createVisualProjectOnDisk, describeAnimationComponentMigration, defaultVisualStarterTemplateId, publishVisualProject, clearStaleXriftUploadAttempt, XriftMcpEditorToolError, buildPublishReadiness, editorSessionUnavailableError, inspectVisualPublishMetadata, isXriftMcpProjectTool, listStarterTemplates, parseCreateProjectArguments, parseNewProjectDirectoryName, parseOptionalProjectTitle, parseRequiredPath, resolveProjectTarget, resolveTransferableProject, summarizeProject, type VisualPublishPipelineProgress, readVisualProjectFromDisk, prepareStarterVisualProject, saveVisualProjectToDisk, StarterAssetCopyError, listScriptAssets, type AssetManifest, type PrototypeVisualProject, type ClassicExportIntegration, type ClassicExportProgress, type ClassicExportTarget, type StarterVisualProjectPlan, type VisualPublicationRecord, type VisualStarterTemplateId, type ClassicProjectCreationSource } from "./lib/visual-editor";

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
    if (mcpPublishActiveRef.current || chatgptGenerationRef.current || mcpModelingActiveRef.current) {
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
  const mcpModelingActiveRef = useRef(false);
  const [modelingBusy, setModelingBusy] = useState(false);

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

  const { sessions: chatgptSessions, sessionsRef: chatgptSessionsRef, selectedSessionId: selectedChatgptSessionId, selectedSessionIdRef: selectedChatgptSessionIdRef, selectSession: selectChatgptSession, historyError: chatgptHistoryError, updateSessions: updateChatgptSessions, flush: flushChatgptSessions } = useChatgptSessions();
  const chatgptGenerationRef = useRef<string | null>(null);
  const chatgptReasoningPreferences = useRef(createChatgptReasoningPreferences());
  const chatgptGenerationsRef = useRef(new Map<string, ChatgptGeneration>(chatgptSessions.flatMap(session => session.turns.map(turn => [turn.generationId, turn] as const))));
  const chatgptRevertsRef = useRef(new Map<string, ChatgptRevertCheckpoint>());
  const chatgptPlansRef = useRef(new Map<string, PiStoredPlan>());
  const piRunsRef = useRef(new Map<string, PiRunControl>());
  const chatgptControlsRef = useRef(new Map<string, { cancelled: boolean }>());
  const [chatgptGeneration, setChatgptGeneration] = useState<ChatgptGeneration | null>(null);
  const recordChatgptGeneration = (job: ChatgptGeneration, flush = false) => {
    let sessions = chatgptSessionsRef.current;
    const ids = sessions.filter(session => session.id === job.sessionId || session.turns.some(turn => turn.generationId === job.generationId)).map(session => session.id);
    for (const id of ids) sessions = upsertChatgptSessionTurn(sessions, id, job);
    updateChatgptSessions(sessions, flush);
  };
  const generateChatgptWorld = createPiAuthoringRunner({ chatgptGenerationRef, mcpPublishActiveRef, mcpModelingActiveRef, visualSessionRef, projectsRoot, requireMcpProjectBridge, chatgptSessionsRef, selectedChatgptSessionIdRef, updateChatgptSessions, selectChatgptSession, chatgptGenerationsRef, chatgptControlsRef, chatgptPlansRef, chatgptRevertsRef, setChatgptGeneration, recordChatgptGeneration, mcpProjectBridgeRef, uniqueProjectDirectoryName, setVisualCompilationFresh, setVisualThumbnailReadiness, setVisualSession, waitForMcpProjectBridge, refreshProjects, toast, piRunsRef, flushChatgptSessions });
  const handleChatgptGenerate = async (model: string, prompt: string, options: ChatgptAssetOptions, mode: ChatgptGenerationMode = "build", reasoningEffort?: string,
    expectedScope?: { sceneScope: string; scope: string; requestId: string; attachedEntityIds?: readonly string[]; attachedMaterialIds?: readonly string[] }): Promise<void> => {
    let requestedSessionId: string | undefined;
    if (expectedScope) {
      const bundle = mcpProjectBridgeRef.current?.currentBundle();
      const sceneScope = bundle ? `${bundle.project.projectId}:${bundle.scene.sceneId}` : "";
      const scoped = bundle ? chatgptSessionsRef.current.filter(session => session.projectId === bundle.project.projectId && session.sceneId === bundle.scene.sceneId) : [];
      const session = scoped.find(item => item.id === selectedChatgptSessionIdRef.current) ?? scoped[0];
      if (expectedScope.sceneScope !== sceneScope || expectedScope.scope !== (session?.id ?? sceneScope)) {
        throw new Error("送信前に作品・Scene・チャットが変わったため、依頼を保留しました。元のチャットから再開してください");
      }
      requestedSessionId = session?.id;
    }
    await generateChatgptWorld(model, prompt, options, expectedScope?.requestId ?? crypto.randomUUID(), mode, "current", undefined, reasoningEffort, requestedSessionId, undefined, expectedScope?.attachedEntityIds, expectedScope?.attachedMaterialIds);
  };
  const applyChatgptPlan = async (generationId: string) => {
    const job = chatgptGenerationsRef.current.get(generationId);
    const stored = chatgptPlansRef.current.get(generationId);
    if (!stored || job?.status !== "planned") throw new Error("反映できる変更内容がありません。依頼を送り直してください");
    if (stored.plan.questions?.length) throw new Error("確認事項に回答してから制作を進めてください");
    if ((job.projectId ?? job.sourceProjectId) !== visualSessionRef.current?.bundle.project.projectId || (job.sceneId ?? job.sourceSceneId) !== mcpProjectBridgeRef.current?.currentBundle().scene.sceneId) throw new Error("変更を依頼したワールドとSceneを開いてから反映してください");
    await generateChatgptWorld(job.model, job.prompt, job.options, generationId, job.mode === "goal" ? "goal" : "build", stored.target, stored.plan, job.reasoningEffort, job.sessionId);
  };
  const answerChatgptQuestions = async (generationId: string, rawAnswers: ChatgptQuestionAnswer[]) => {
    const job = chatgptGenerationsRef.current.get(generationId), stored = chatgptPlansRef.current.get(generationId);
    if (!job || job.status !== "planned" || !stored?.plan.questions?.length) throw new Error("回答待ちの確認事項がありません");
    const bridge = requireMcpProjectBridge("制作の確認事項に回答");
    const bundle = bridge.currentBundle();
    if ((job.projectId ?? job.sourceProjectId) !== bundle.project.projectId || (job.sceneId ?? job.sourceSceneId) !== bundle.scene.sceneId) throw new Error("確認事項を受け取った作品とSceneを開いてください");
    const answers = validateChatgptQuestionAnswers(stored.plan.questions, rawAnswers);
    const answered = answers.map(answer => {
      const question = stored.plan.questions![answer.questionIndex];
      const candidateId = question.choiceCandidateIds?.[question.choices.indexOf(answer.answer)];
      return { question: question.question, answer: answer.answer, ...(candidateId ? { candidateId } : {}) };
    });
    const clarifications = [...(job.clarifications ?? []), ...answered].slice(-9);
    chatgptGenerationsRef.current.set(generationId, { ...job, clarifications });
    await generateChatgptWorld(job.model, job.prompt, job.options, generationId, job.mode ?? "build", stored.target, undefined, job.reasoningEffort, job.sessionId,
      { kind: "answers", answers: answered });
  };
  const cancelChatgptGeneration = async (generationId: string) => {
    const control = chatgptControlsRef.current.get(generationId);
    const job = chatgptGenerationsRef.current.get(generationId);
    if (job?.status === "planned") {
      const harness = piRunsRef.current.get(generationId);
      if (harness) await harness.stop("user"); else await tauri.chatgptCancelGeneration(generationId);
      const cancelled: ChatgptGeneration = { ...job, status: "cancelled", progress: { ...job.progress, phase: "cancelled", message: job.plan?.questions?.length ? "確認待ちの依頼を終了しました。保存済みの変更は残っています" : "未反映の変更を破棄しました。現在のSceneと保存済みの変更は保持されています" } };
      chatgptPlansRef.current.delete(generationId); chatgptGenerationsRef.current.set(generationId, cancelled); setChatgptGeneration(cancelled);
      if (cancelled.sessionId) updateChatgptSessions(upsertChatgptSessionTurn(chatgptSessionsRef.current, cancelled.sessionId, cancelled), true);
      piRunsRef.current.delete(generationId);
      return { generationId, cancelled: true };
    }
    if (!control || !job || job.status !== "running") return { generationId, cancelled: false };
    control.cancelled = true;
    const cancelling = { ...job, cancelling: true };
    chatgptGenerationsRef.current.set(generationId, cancelling); setChatgptGeneration(cancelling);
    recordChatgptGeneration(cancelling);
    const harness = piRunsRef.current.get(generationId);
    // Acknowledge the stop request while the runtime drains its owned native
    // work. Keeping this MCP call open would prevent later progress/cancel
    // events from closing a lease that was registered just after the request.
    if (harness) void harness.stop("user"); else await tauri.chatgptCancelGeneration(generationId);
    return { generationId, cancelled: true, stopping: true };
  };

  const revertChatgptGeneration = async (generationId: string) => {
    if (chatgptGenerationRef.current || mcpPublishActiveRef.current || mcpModelingActiveRef.current) throw new Error("処理が終わってから変更を戻してください");
    const job = chatgptGenerationsRef.current.get(generationId);
    const checkpoint = chatgptRevertsRef.current.get(generationId);
    if (!job || job.status === "running" || job.revertedAt || !checkpoint) throw new Error("戻せる変更がありません。変更を戻す操作は、この起動中の直近の依頼に使えます。");
    const bridge = requireMcpProjectBridge("制作の変更を戻す");
    if (!bridge.currentContext().canGenerate) throw new Error("Playと素材の読み込みを止めてから変更を戻してください");
    const before = bridge.currentBundle();
    const restored = chatgptRevertBundle(before, [checkpoint]);
    chatgptGenerationRef.current = generationId;
    try {
      if (!bridge.applyGenerationStep({ expectedBundle: before, nextBundle: restored })) throw new Error("別の編集が入りました。変更を戻さず停止しました。");
      const reverted: ChatgptGeneration = { ...job, error: undefined, revertAvailable: false, revertedAt: new Date().toISOString(), progress: { ...job.progress, message: "この依頼の変更を元に戻しました。保存しています" } };
      chatgptRevertsRef.current.delete(generationId);
      const reportRevert = () => {
        chatgptGenerationsRef.current.set(generationId, { ...reverted }); setChatgptGeneration({ ...reverted });
        recordChatgptGeneration(reverted, true);
      };
      reportRevert();
      try {
        if (!(await bridge.saveNow())) throw new Error("変更は戻りましたが保存できませんでした。Studioで保存を再試行してください。");
      } catch (error) {
        reverted.error = "変更は戻りましたが保存できませんでした。Studioで保存を再試行してください。";
        reverted.progress = { ...reverted.progress, message: reverted.error };
        reportRevert(); throw error;
      }
      reverted.progress = { ...reverted.progress, message: "この依頼の変更を元に戻して保存しました" }; reportRevert();
      return { generationId, reverted: true };
    } finally { if (chatgptGenerationRef.current === generationId) chatgptGenerationRef.current = null; }
  };
  const manageChatgptSession = (action: "create" | "select" | "rename" | "delete" | "branch", id?: string, title?: string, entryId?: string) => {
    if (chatgptGenerationRef.current) throw new Error("制作の処理が終わってからチャットを切り替えてください");
    const context = requireMcpProjectBridge("制作チャットの履歴").currentContext();
    const sessions = chatgptSessionsRef.current;
    if (action === "create") {
      const created = createChatgptSession(context.projectId, context.sceneId, title);
      const next = [created, ...sessions].slice(0, 20);
      const retained = new Set(next.flatMap(session => session.turns.map(turn => turn.generationId)));
      for (const removed of sessions.filter(session => !next.some(kept => kept.id === session.id))) {
        for (const turn of removed.turns) if (!retained.has(turn.generationId)) {
          void piRunsRef.current.get(turn.generationId)?.stop("session-removed");
          piRunsRef.current.delete(turn.generationId);
          chatgptPlansRef.current.delete(turn.generationId); chatgptRevertsRef.current.delete(turn.generationId); chatgptGenerationsRef.current.delete(turn.generationId);
        }
      }
      updateChatgptSessions(next, true); selectChatgptSession(created.id);
      return created;
    }
    const found = sessions.find(session => session.id === id && session.projectId === context.projectId && session.sceneId === context.sceneId);
    if (!found) throw new Error("このSceneのチャットを選んでください");
    if (action === "branch") {
      const branched = branchChatgptSession(found, entryId ?? "");
      const next = [branched, ...sessions].slice(0, 20);
      updateChatgptSessions(next, true); flushChatgptSessions(); selectChatgptSession(branched.id);
      return branched;
    }
    if (action === "delete") {
      const next = sessions.filter(session => session.id !== id);
      updateChatgptSessions(next, true);
      const retained = new Set(next.flatMap(session => session.turns.map(turn => turn.generationId)));
      for (const turn of found.turns) if (!retained.has(turn.generationId)) {
        void piRunsRef.current.get(turn.generationId)?.stop("session-removed");
        piRunsRef.current.delete(turn.generationId);
        chatgptPlansRef.current.delete(turn.generationId); chatgptRevertsRef.current.delete(turn.generationId); chatgptGenerationsRef.current.delete(turn.generationId);
      }
      selectChatgptSession(undefined); return found;
    }
    const next = { ...found, updatedAt: new Date().toISOString(), ...(action === "rename" ? { title: title?.trim().slice(0, 80) || "新しいチャット" } : {}) };
    updateChatgptSessions([next, ...sessions.filter(session => session.id !== id)], true); selectChatgptSession(next.id);
    return next;
  };

  const deleteChatgptSession = async (id: string) => {
    if (chatgptGenerationRef.current) throw new Error("制作の処理が終わってから履歴を削除してください");
    const context = requireMcpProjectBridge("制作チャットの履歴").currentContext();
    const found = chatgptSessionsRef.current.find(session => session.id === id && session.projectId === context.projectId && session.sceneId === context.sceneId);
    if (!found) throw new Error("このSceneのチャットを選んでください");
    const retained = new Set(chatgptSessionsRef.current.filter(session => session.id !== id && session.projectId === found.projectId && session.sceneId === found.sceneId).flatMap(session => [...piSessionHistoryRoots(session)]));
    for (const root of piSessionHistoryRoots(found)) if (!retained.has(root)) await tauri.chatgptPiDeleteHistory(found.projectId, found.sceneId, root);
    return manageChatgptSession("delete", id);
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
      case "get_chatgpt_connection": {
        const connection = await tauri.chatgptStatus();
        chatgptReasoningPreferences.current.observeConnection(connection);
        return { ...connection, nextActions: ["connect_chatgpt", "list_chatgpt_models"] };
      }
      case "connect_chatgpt":
        chatgptReasoningPreferences.current.clear();
        return { ...(await tauri.chatgptLogin()), nextActions: ["get_chatgpt_connection"], message: "ブラウザで本人が接続を許可してください。接続完了またはエラーはget_chatgpt_connectionで確認できます。" };
      case "disconnect_chatgpt":
        chatgptReasoningPreferences.current.clear();
        return { ...(await tauri.chatgptLogout()) };
      case "list_chatgpt_models": {
        chatgptReasoningPreferences.current.clear();
        const models = await tauri.chatgptModels();
        chatgptReasoningPreferences.current.remember(models);
        return { models };
      }
      case "get_modeling_tools":
        return { blender: await tauri.getBlenderStatus(), nextActions: ["create_blender_model", "generate_chatgpt_world"] };
      case "create_blender_model": {
        const bridge = requireMcpProjectBridge(request.tool);
        const context = bridge.currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        if (!context.canGenerate || chatgptGenerationRef.current && request.internalGenerationId !== chatgptGenerationRef.current || mcpPublishActiveRef.current || mcpModelingActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "制作と素材の読み込みが終わってからモデルを作成してください");
        mcpModelingActiveRef.current = true; setModelingBusy(true);
        let authoringWrite: Awaited<ReturnType<typeof acquireAuthoringProjectWrite>> = null;
        try {
          const sourceId = context.projectId, sceneId = context.sceneId;
          const before = bridge.currentBundle();
          const path = visualSessionRef.current?.project?.path;
          if (!path) throw new XriftMcpEditorToolError("EDITOR_UNAVAILABLE", "保存先を確認できませんでした");
          const checkModelingSource = () => {
            if (visualSessionRef.current?.bundle.project.projectId !== sourceId || mcpProjectBridgeRef.current !== bridge || bridge.currentContext().projectId !== sourceId || bridge.currentContext().sceneId !== sceneId || bridge.currentContext().revision !== context.revision || !bridge.currentContext().canGenerate) throw new XriftMcpEditorToolError("STALE_REVISION", "モデルの作成中に対象が変わりました。元のSceneから作成結果を確認してください");
          };
          checkModelingSource();
          const { parseBlenderModelSpec, createBlenderModelAsset } = await import("./lib/visual-editor/chatgpt-modeling");
          checkModelingSource();
          const spec = parseBlenderModelSpec(args.model);
          try {
            if (!request.internalGenerationId) {
              authoringWrite = await acquireAuthoringProjectWrite({ projectPath: path, sceneId, requestId: request.id, tool: request.tool, arguments: args, bundle: before,
                journal: { read: tauri.readWorldAuthoring, write: tauri.saveWorldAuthoring }, checkCurrent: checkModelingSource,
                readSource: relativePath => tauri.readTextFile(path, relativePath) });
            }
          } catch (error) {
            if (error instanceof XriftMcpEditorToolError) throw error;
            throw new XriftMcpEditorToolError("AUTHORING_WRITE_STOPPED", error instanceof Error ? error.message : String(error));
          }
          checkModelingSource();
          const imported = await createBlenderModelAsset(before, spec, path, {}, { generationId: request.internalGenerationId, checkCurrent: checkModelingSource });
          checkModelingSource();
          const latest = bridge.currentBundle();
          const nextBundle = rebaseChatgptStep(before, imported.bundle, latest);
          if (!bridge.applyGenerationStep({ expectedBundle: latest, nextBundle })) throw new XriftMcpEditorToolError("STALE_REVISION", "現在のSceneからモデルを取り込み直してください");
          if (!(await bridge.saveNow())) throw new XriftMcpEditorToolError("EDITOR_ERROR", "作成したモデルを保存できませんでした");
          let authoringWarning: string | undefined;
          try { await authoringWrite?.finish(nextBundle, true); } catch (error) { authoringWarning = String(error); }
          return { changed: true, mutationBeforeFingerprint: authoringSceneProgressFingerprint(latest), modelAssetId: imported.modelAssetId, name: spec.name, nextActions: ["get_model_asset", "place_asset"], ...(authoringWarning ? { authoringWarning } : {}) };
        } catch (error) {
          await authoringWrite?.finish(bridge.currentBundle(), false, error instanceof Error ? error.message : String(error)).catch(() => undefined);
          throw error;
        } finally { mcpModelingActiveRef.current = false; setModelingBusy(false); }
      }
      case "list_chatgpt_sessions": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        const sessions = chatgptSessionsRef.current.filter(session => session.projectId === context.projectId && session.sceneId === context.sceneId);
        return { sessions: sessions.map(({ turns, ...session }) => ({ ...session, turnCount: turns.length })), activeSessionId: sessions.find(session => session.id === selectedChatgptSessionIdRef.current)?.id ?? sessions[0]?.id ?? null };
      }
      case "get_chatgpt_session": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        const session = chatgptSessionsRef.current.find(session => session.id === args.sessionId && session.projectId === context.projectId && session.sceneId === context.sceneId);
        if (!session) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "このSceneのsessionIdを指定してください");
        return { session, transcript: chatgptSessionTranscript(session), nextActions: ["generate_chatgpt_world"] };
      }
      case "manage_chatgpt_session":
      case "revert_chatgpt_generation": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        if (request.tool === "revert_chatgpt_generation") {
          if (typeof args.generationId !== "string") throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "戻すgenerationIdを指定してください");
          return revertChatgptGeneration(args.generationId);
        }
        if (!["create", "select", "rename", "delete"].includes(String(args.action)) || (args.sessionId !== undefined && typeof args.sessionId !== "string") || (args.title !== undefined && (typeof args.title !== "string" || !args.title.trim() || args.title.length > 80))) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "チャットの操作とsessionId、80文字以内の名前を指定してください");
        return { session: args.action === "delete" ? await deleteChatgptSession(args.sessionId as string) : manageChatgptSession(args.action as "create" | "select" | "rename", args.sessionId as string | undefined, args.title as string | undefined) };
      }
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
        if (!context.canGenerate || chatgptGenerationRef.current || mcpPublishActiveRef.current || mcpModelingActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "処理中です。Playと素材の読み込みを停止し、公開や生成が終わってから再試行してください");
        if (typeof args.model !== "string" || !args.model.trim() || args.model.length > 128 || typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 2000) {
          throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "モデルと2000文字以内の依頼を指定してください");
        }
        const options = args.options ?? { models: true, materials: true, audio: true };
        if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["models", "materials", "audio", "modelSource"].includes(key)) || !["models", "materials", "audio"].every(key => typeof (options as Record<string, unknown>)[key] === "boolean") || ((options as ChatgptAssetOptions).modelSource !== undefined && !["auto", "blender", "store"].includes((options as ChatgptAssetOptions).modelSource!))) {
          throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "optionsにはmodels・materials・audioのbooleanを指定してください");
        }
        if (args.mode !== undefined && args.mode !== "build" && args.mode !== "plan" && args.mode !== "goal") throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "modeにはbuild・plan・goalを指定してください");
        if (args.target !== undefined && args.target !== "current" && args.target !== "new") throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "targetにはcurrentまたはnewを指定してください");
        if (args.reasoningEffort !== undefined && (typeof args.reasoningEffort !== "string" || !["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(args.reasoningEffort))) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "reasoningEffortはlist_chatgpt_modelsの対応する思考量から指定してください");
        if (args.sessionId !== undefined && (typeof args.sessionId !== "string" || !chatgptSessionsRef.current.some(session => session.id === args.sessionId && session.projectId === context.projectId && session.sceneId === context.sceneId))) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "このSceneのsessionIdを指定してください");
        if (args.attachedEntityIds !== undefined && (!Array.isArray(args.attachedEntityIds) || args.attachedEntityIds.length > 100 || args.attachedEntityIds.some(id => typeof id !== "string" || !bridge.currentBundle().scene.entities[id]) || args.target === "new")) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "添付には現在のSceneにあるEntityを指定してください。新規ワールドへの添付はできません");
        const generationId = crypto.randomUUID();
        if (args.attachedMaterialIds !== undefined && (!Array.isArray(args.attachedMaterialIds) || args.attachedMaterialIds.length > 16 || args.attachedMaterialIds.some(id => typeof id !== "string" || bridge.currentBundle().assets.assets[id]?.kind !== "material" || bridge.currentBundle().assets.assets[id]?.status !== "ready") || args.target === "new")) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "添付には現在の作品で利用できるMaterialを指定してください。新規ワールドへの添付はできません");
        const authoringPath = visualSessionRef.current?.project?.path;
        if (authoringPath && hasAuthoringRunOwner(readAuthoringState(await tauri.readWorldAuthoring(authoringPath, context.sceneId)))) {
          throw new XriftMcpEditorToolError("AUTHORING_RUN_OWNED", "MCPで制作を進めています。同じ制作の編集・撮影・確認を続けるか、cancel_world_authoringで終了してからChatGPTの制作を開始してください", { nextActions: ["get_world_authoring", "cancel_world_authoring"] });
        }
        if (bridge.currentContext().revision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", bridge.currentContext());
        if (!bridge.currentContext().canGenerate || chatgptGenerationRef.current || mcpPublishActiveRef.current || mcpModelingActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "現在の制作や素材の読み込みが終わってから再試行してください");
        const reasoningEffort = args.reasoningEffort as string | undefined ?? chatgptReasoningPreferences.current.forModel(args.model);
        void generateChatgptWorld(args.model, args.prompt, options as ChatgptAssetOptions, generationId, args.mode ?? "build", args.target ?? "current", undefined, reasoningEffort, args.sessionId as string | undefined, undefined, args.attachedEntityIds as string[] | undefined, args.attachedMaterialIds as string[] | undefined).catch(() => undefined);
        return { generationId, status: "running", nextActions: ["get_chatgpt_generation"] };
      }
      case "answer_chatgpt_questions": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        const job = typeof args.generationId === "string" ? chatgptGenerationsRef.current.get(args.generationId) : undefined;
        if (!job || job.status !== "planned" || !job.plan?.questions?.length) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "回答待ちのgenerationIdを指定してください");
        if ((job.projectId ?? job.sourceProjectId) !== context.projectId || (job.sceneId ?? job.sourceSceneId) !== context.sceneId) throw new XriftMcpEditorToolError("STALE_REVISION", "確認事項を受け取ったSceneを開いてください");
        if (!context.canGenerate || chatgptGenerationRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "現在の処理が終わってから回答してください");
        const answers = validateChatgptQuestionAnswers(job.plan.questions, args.answers);
        void answerChatgptQuestions(job.generationId, answers).catch(() => undefined);
        return { generationId: job.generationId, status: "running", nextActions: ["get_chatgpt_generation"] };
      }
      case "apply_chatgpt_plan": {
        const context = requireMcpProjectBridge(request.tool).currentContext();
        if (args.projectId !== context.projectId || args.sceneId !== context.sceneId || args.expectedRevision !== context.revision) throw new XriftMcpEditorToolError("STALE_REVISION", "get_editor_contextで対象とrevisionを再取得してください", context);
        if (!context.canGenerate || chatgptGenerationRef.current || mcpPublishActiveRef.current || mcpModelingActiveRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "Play、素材の読み込み、制作、公開が終わってから再試行してください");
        const job = typeof args.generationId === "string" ? chatgptGenerationsRef.current.get(args.generationId) : undefined;
        if (!job || job.status !== "planned" || !chatgptPlansRef.current.has(job.generationId)) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "反映できる変更内容のgenerationIdを指定してください");
        if (chatgptPlansRef.current.get(job.generationId)!.snapshot !== chatgptPlanningSnapshot(requireMcpProjectBridge(request.tool).currentBundle())) throw new XriftMcpEditorToolError("STALE_REVISION", "プランの確認後にSceneが変わりました。最新のSceneからプランを作り直してください");
        if (job.plan?.questions?.length) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "answer_chatgpt_questionsで確認事項に回答してください");
        if (job.sessionId && !chatgptSessionsRef.current.some(session => session.id === job.sessionId)) throw new XriftMcpEditorToolError("INVALID_ARGUMENTS", "変更を依頼したチャットの履歴がありません。新しく依頼してください");
        if (job.sourceProjectId !== context.projectId || job.sourceSceneId !== context.sceneId) throw new XriftMcpEditorToolError("STALE_REVISION", "変更を依頼したワールドとSceneを開いてください");
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
        if (mcpPublishActiveRef.current || chatgptGenerationRef.current || mcpModelingActiveRef.current) {
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
          void Promise.resolve().then(() => {
            if (request.internalGenerationId) {
              const context = mcpProjectBridgeRef.current?.currentContext();
              if (request.internalGenerationId !== chatgptGenerationRef.current || !context || !request.internalScope || request.internalScope.projectId !== context.projectId || request.internalScope.sceneId !== context.sceneId) throw new XriftMcpEditorToolError("SCOPE_CHANGED", "開いている作品またはSceneが変わりました");
              if (!context.canGenerate) throw new XriftMcpEditorToolError("EDITOR_BUSY", "Editで素材の処理完了を待ってから再試行してください");
            }
            return handleMcpProjectToolRef.current(request);
          })
            .then(async (result) => respond({ id: request.id, ok: true, result: request.internalGenerationId && request.tool === "create_blender_model" && mcpProjectBridgeRef.current ? { ...result, progressFingerprint: authoringSceneProgressFingerprint(mcpProjectBridgeRef.current.currentBundle()), fingerprint: await authoringFingerprint(mcpProjectBridgeRef.current.currentBundle()) } : result }))
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
              onChatgptAnswerQuestions={answerChatgptQuestions}
              onChatgptCancel={cancelChatgptGeneration}
              onChatgptRevert={revertChatgptGeneration}
              chatgptSessionActions={{ sessions: chatgptSessions, activeSessionId: selectedChatgptSessionId,
                onNew: () => { manageChatgptSession("create"); },
                onSelect: id => { manageChatgptSession("select", id); },
                onRename: (id, title) => { manageChatgptSession("rename", id, title); },
                onBranch: (id, entryId) => { manageChatgptSession("branch", id, undefined, entryId); },
                onDelete: async id => { await deleteChatgptSession(id); } }}
              chatgptHistoryError={chatgptHistoryError ?? undefined}
              chatgptBusy={chatgptGenerationRef.current !== null || modelingBusy}
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
