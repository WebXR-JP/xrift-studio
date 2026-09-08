import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { EditorView } from "./components/EditorView";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SetupView } from "./components/SetupView";
import { UpdateDialog } from "./components/UpdateDialog";
import { suggestedNameForRepositoryUrl } from "./components/ProjectTransferDialogs";
import { AppUpdateDialog } from "./components/AppUpdateDialog";
import {
  tauri,
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
  applyTextureProcessingBatch,
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
  const [updateChecked, setUpdateChecked] = useState(false);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>(
    INITIAL_APP_UPDATE_STATE,
  );
  const [showAppUpdate, setShowAppUpdate] = useState(false);
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
            title: "XRift Studio をアップデートしました",
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
    setUpdating(true);
    try {
      await tauri.updateXrift();
      clearCaches();
      toast({
        kind: "success",
        title: "@xrift/cli をアップデートしました",
        description: updateInfo?.latest
          ? `v${updateInfo.latest}`
          : undefined,
      });
      setUpdateInfo(null);
    } catch (e) {
      toast({
        kind: "error",
        title: "アップデートに失敗しました",
        description: String(e),
      });
    } finally {
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
        `${project.name}.zip`,
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
          title: "ZIPを読み込めませんでした",
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
          description: `${name} / ビジュアル編集`,
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
    const session = visualSessionRef.current;
    let savedProjectPath: string | null = null;
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
        save: async () => {
          savedProjectPath = await handleSaveVisualProject(
            publishBundle,
            false,
          );
          return savedProjectPath;
        },
        report: (progress) => {
          if (progress.thumbnailStaging?.state === "verified") {
            setVisualCompilationFresh(true);
          }
          report(progress);
        },
        onLog: appendLog,
        signal,
      });
    } catch (error) {
      setVisualCompilationFresh(false);
      throw error;
    }
    const publishedBundle: PrototypeVisualProject = {
      ...publishBundle,
      project: {
        ...publishBundle.project,
        metadata: {
          ...publishBundle.project.metadata,
          updatedAt: new Date().toISOString(),
        },
        lastPublication: {
          ...result,
          uploadedAt: result.uploadedAt ?? new Date().toISOString(),
        },
      },
    };
    setVisualPublishBundle((current) => (current ? publishedBundle : current));
    // Keep the authoritative remote result in memory even if the
    // follow-up manifest write fails. A later Save must not restore an
    // older publication target over the durable CLI sidecar.
    setVisualSession((current) =>
      current ? { ...current, bundle: publishedBundle } : current,
    );
    try {
      if (!savedProjectPath) {
        throw new Error("保存先を確認できませんでした。");
      }
      await saveVisualProjectToDisk(savedProjectPath, {
        project: publishedBundle.project,
        scenes: {
          [publishedBundle.scene.sceneId]: publishedBundle.scene,
        },
        assets: publishedBundle.assets,
        prefabs: publishedBundle.prefabs,
      });
      await refreshProjects();
    } catch {
      toast({
        kind: "error",
        title: "アップロードは完了しましたが、結果をプロジェクトへ保存できませんでした",
      });
    }
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
  ): Promise<VisualEditorMcpProjectBridge> => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const bridge = mcpProjectBridgeRef.current;
      if (bridge && bridge !== previous && visualSessionRef.current) return bridge;
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
    const bundle = withLatestPublication(
      bridge.currentBundle(),
      session.bundle.project.lastPublication,
    );
    if (
      (typeof args.projectId === "string" && args.projectId !== bundle.project.projectId) ||
      (typeof args.sceneId === "string" && args.sceneId !== bundle.scene.sceneId)
    ) {
      throw new XriftMcpEditorToolError(
        "STALE_REVISION",
        "対象シーンが現在のEditorと一致しません。get_editor_contextで再取得してください",
        { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId },
      );
    }
    const path = (await bridge.saveNow()) ?? visualSessionRef.current?.project?.path;
    if (!path) {
      throw new XriftMcpEditorToolError(
        "EDITOR_ERROR",
        "プロジェクトを保存できませんでした。Studioの画面で保存の失敗を確認してください",
      );
    }
    const kind = bundle.project.projectKind;
    const [thumbnail, account, scriptSources] = await Promise.all([
      inspectPublishThumbnail(path, kind),
      readMcpAccount(),
      readScriptSources(path, bundle.assets),
    ]);
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
        const archivePath = `${root}/.cache/exports/${source.name}-${stamp}.zip`;
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
            "zipはLibraryの.cache/exportsに書きました。人に渡すときはこのファイルを移動または送信してください",
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
        if (mcpPublishActiveRef.current) {
          throw new XriftMcpEditorToolError(
            "EDITOR_BUSY",
            "公開を処理中です。完了してからget_publish_readinessで状態を確認してください",
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
        mcpPublishActiveRef.current = true;
        const progress: string[] = [];
        try {
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
        } finally {
          mcpPublishActiveRef.current = false;
        }
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
          title: "コード編集プロジェクトを変換しました",
          description: detailParts.join(" / "),
        });
      } catch (error) {
        toast({
          kind: "error",
          title: "コード編集プロジェクトを変換できませんでした",
          description:
            error instanceof Error
              ? error.message
              : "コード編集プロジェクトとプロジェクト種別を確認して、もう一度お試しください。",
        });
      }
    });
  };

  const handleSelectClassicProjectDirectory = async (
    kind: ProjectKind,
  ): Promise<string | null> => {
    if (!tauri.isAvailable()) {
      throw new Error(
        "コード編集プロジェクトのフォルダー選択はデスクトップ版で利用できます。",
      );
    }
    const selected = await tauri.selectDirectory(
      `コード編集の${kind === "world" ? "ワールド" : "アイテム"}プロジェクトを選択`,
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
        visualSessionRef.current = nextSession;
        setVisualSession(nextSession);
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
        visualSessionRef.current = nextSession;
        setVisualSession(nextSession);
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
      setVisualPublishBundle(null);
      setVisualClassicExportBundle(null);
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
        >
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
                ビジュアルエディターを準備しています…
              </div>
            }
          >
            <VisualEditorPrototype
              projectKind={visualSession.bundle.project.projectKind}
              projectName={visualSession.bundle.project.metadata.name}
              projectPath={visualSession.project?.path}
              initialBundle={visualSession.bundle}
              compilationFresh={visualCompilationFresh}
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
            textureConversions: visualPublishReview.result?.textureConversions,
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
          onApplyTextureConversions={async (assetIds, report) => {
            if (!publishBundle) {
              throw new Error("変換する制作データがありません。");
            }
            const projectPath = await handleSaveVisualProject(
              publishBundle,
              false,
              false,
            );
            const result = await applyTextureProcessingBatch(
              projectPath,
              publishBundle.assets,
              assetIds,
              (progress) =>
                report({
                  message: progress.message,
                  completed: progress.completed,
                  total: progress.total,
                }),
            );
            if (!result.ok) throw new Error(result.message);
            const nextBundle = { ...publishBundle, assets: result.manifest };
            await handleSaveVisualProject(nextBundle, false, false);
            setVisualPublishBundle(nextBundle);
            setVisualCompilationFresh(false);
            // シーンと公開物は同じ画像を使う。変換はダイアログ側で走るので、
            // 開いたままのEditor履歴へも同じManifestを取り込む。
            visualExternalAssetsCommitRef.current?.({
              expectedAssets: publishBundle.assets,
              nextAssets: result.manifest,
              notice: `${result.convertedAssetNames.length}件のテクスチャを変換しました。シーンも変換後の画像を使います`,
            });
            return {
              convertedAssetCount: result.convertedAssetNames.length,
              beforeBytes: result.beforeBytes,
              afterBytes: result.afterBytes,
              skipped: result.skipped.map((entry) => ({
                assetName: entry.assetName,
                reason: entry.reason,
              })),
            };
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
              "XRift コード編集プロジェクトを選択",
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
              throw new Error("書き出すビジュアル編集のプロジェクトがありません。");
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
              title: "XRift コード編集へ書き出しました",
              description:
                integration === "component"
                  ? "組み込み用コードを追加すると、既存のシーンと一緒に使えます。"
                  : "バックアップを残してエントリーを切り替えました。",
            });
            return result;
          }}
          onOpenFolder={(path) => tauri.openPath(path)}
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
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        ビジュアルプロジェクトを読み込んでいます…
      </div>
    );
  }

  if (runtimeLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        起動中…
      </div>
    );
  }

  if (!runtime || !runtime.ready) {
    return (
      runtime && (
        <SetupView
          status={runtime}
          onReady={(s) => setRuntime(s)}
          onOpenVisualEditor={handleOpenVisualEditor}
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
        <EditorView
          project={selected}
          user={user}
          busy={busy}
          appendLog={appendLog}
          logs={logs}
          setBusy={setBusy}
          clearLogs={() => setLogs([])}
          onBack={() => setSelected(null)}
          onProjectChanged={refreshProjects}
        />
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
        onImportArchive={handleImportProjectArchive}
        onImportRepository={handleImportProjectRepository}
        onOpenPath={(path) => void tauri.openPath(path).catch(() => undefined)}
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
      />
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
        ? `${label}を読み込めませんでした。アプリを再起動して、もう一度お試しください。`
        : `${label}を読み込めませんでした（HTTP ${details.responseStatus}）。アプリを再起動して、もう一度お試しください。`;
    case "empty":
      return `${label}が空です。アプリを再起動して、もう一度お試しください。`;
    case "size":
      return `${label}のサイズが一致しません。取得値: ${formatBytes(receivedSize ?? 0)}、期待値: ${formatBytes(copy.expectedByteLength)}。アプリを再起動して、もう一度お試しください。`;
    case "hash":
      return `${label}のSHA-256が一致しません。取得値: ${formatBytes(receivedSize ?? 0)}。アプリを再起動して、もう一度お試しください。`;
    case "license-content":
      return `${label}の内容を確認できませんでした。アプリを再起動して、もう一度お試しください。`;
  }
}

export default App;
