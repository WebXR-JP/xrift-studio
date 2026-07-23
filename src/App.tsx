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
import { AppUpdateDialog } from "./components/AppUpdateDialog";
import {
  tauri,
  type Project,
  type ProjectKind,
  type RuntimeStatus,
} from "./lib/tauri";
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
  type VisualPublishDiagnostic,
} from "./components/visual-editor/VisualUploadDialog";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { ClassicExportDialog } from "./components/visual-editor/ClassicExportDialog";
import {
  compilePrototypeVisualProject,
  applyAssetOptimizations,
  exportVisualProjectToClassic,
  estimateWorldVram,
  inspectClassicExportTarget,
  createStarterVisualProject,
  createPreparedStarterVisualProjectOnDisk,
  createVisualProjectOnDisk,
  defaultVisualStarterTemplateId,
  publishVisualProject,
  readVisualProjectFromDisk,
  prepareStarterVisualProject,
  sanitizePublishFailure,
  saveVisualProjectToDisk,
  StarterAssetCopyError,
  type PrototypeVisualProject,
  type ClassicExportIntegration,
  type ClassicExportProgress,
  type ClassicExportTarget,
  type StarterVisualProjectPlan,
  type VisualPublicationRecord,
  type VisualStarterTemplateId,
} from "./lib/visual-editor";

const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

const APP_UPDATE_TARGET_KEY = "xrift-studio:update-target";

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
  const [visualSession, setVisualSession] = useState<{
    bundle: PrototypeVisualProject;
    project: Project | null;
  } | null>(null);
  const visualSessionRef = useRef(visualSession);
  visualSessionRef.current = visualSession;
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualPublishBundle, setVisualPublishBundle] =
    useState<PrototypeVisualProject | null>(null);
  const [visualClassicExportBundle, setVisualClassicExportBundle] =
    useState<PrototypeVisualProject | null>(null);
  const [visualThumbnailReadiness, setVisualThumbnailReadiness] =
    useState<PublishThumbnailReadiness | null>(null);
  const [visualCompilationFresh, setVisualCompilationFresh] = useState(false);

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
      toast({
        kind: "error",
        title: "スターターを選択できませんでした",
        description: String(error),
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
          description: `${name} / ビジュアル`,
        });
      } catch (error) {
        const starterCopyError =
          error instanceof StarterAssetCopyError ? error : undefined;
        toast({
          kind: "error",
          title:
            starterCopyError?.copy.assetId.includes("license")
              ? "スターターのライセンスをコピーできませんでした"
              : starterCopyError
                ? "スターター素材を検証できませんでした"
                : "スターターを準備できませんでした",
          description: describeStarterPreparationError(error),
        });
      }
    });
  };

  const handleOpenProject = (project: Project) => {
    if (project.format === "classic") {
      setSelected(project);
      return;
    }
    setVisualCompilationFresh(false);
    setVisualThumbnailReadiness(null);
    setVisualLoading(true);
    void readVisualProjectFromDisk(project.path)
      .then((documents) => {
        const scene = documents.scenes[documents.project.entrySceneId];
        if (!scene) throw new Error("Entry Sceneが見つかりません");
        setVisualSession({
          project,
          bundle: {
            project: documents.project,
            scene,
            assets: documents.assets,
            prefabs: documents.prefabs,
          },
        });
      })
      .catch((error) => {
        toast({
          kind: "error",
          title: "ビジュアルプロジェクトを開けませんでした",
          description: String(error),
        });
      })
      .finally(() => setVisualLoading(false));
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
        const project = await createVisualProjectOnDisk(
          projectsRoot,
          persistedBundle.project.metadata.name,
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

  const visualPublishDiagnostics = useMemo<VisualPublishDiagnostic[]>(
    () => {
      if (!visualPublishBundle) return [];
      try {
        return compilePrototypeVisualProject(visualPublishBundle).diagnostics;
      } catch (error) {
        return [
          {
            severity: "blocking",
            code: "visual-compiler-unavailable",
            message:
              error instanceof Error
                ? `XRift向け変換を開始できません: ${sanitizePublishFailure(
                    error.message,
                    visualSession?.project?.path
                      ? [visualSession.project.path]
                      : [],
                  )}`
                : "XRift向け変換を開始できません。Editorを再読み込みしてください。",
          },
        ];
      }
    },
    [visualPublishBundle, visualSession?.project?.path],
  );

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
                  return;
                }
                void inspectPublishThumbnail(
                  path,
                  visualSession.bundle.project.projectKind,
                ).then(setVisualThumbnailReadiness);
              }}
              onUpload={(bundle) => {
                const publishBundle = withLatestPublication(
                  bundle,
                  visualSession.bundle.project.lastPublication,
                );
                setVisualPublishBundle(publishBundle);
                setVisualThumbnailReadiness(null);
                const path = visualSession.project?.path;
                if (path) {
                  void inspectPublishThumbnail(
                    path,
                    publishBundle.project.projectKind,
                  ).then(setVisualThumbnailReadiness);
                }
              }}
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
            diagnostics: visualPublishDiagnostics,
            vramEstimate: publishBundle
              ? estimateWorldVram(publishBundle)
              : undefined,
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
            return {
              optimizedAssetCount: result.optimizedAssetCount,
              beforeBytes: result.beforeBytes,
              afterBytes: result.afterBytes,
            };
          }}
          onPublish={async (report, signal) => {
            if (!publishBundle) throw new Error("公開する制作データがありません。");
            let savedProjectPath: string | null = null;
            let result: Awaited<ReturnType<typeof publishVisualProject>>;
            try {
              result = await publishVisualProject({
                authoringProjectPath: visualSession.project?.path,
                kind: publishBundle.project.projectKind,
                documents: {
                  project: publishBundle.project,
                  scenes: { [publishBundle.scene.sceneId]: publishBundle.scene },
                  assets: publishBundle.assets,
                  prefabs: publishBundle.prefabs,
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
            setVisualPublishBundle(publishedBundle);
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
          }}
        />
        <ClassicExportDialog
          open={visualClassicExportBundle !== null}
          projectKind={visualSession.bundle.project.projectKind}
          projectName={visualSession.bundle.project.metadata.name}
          onClose={() => setVisualClassicExportBundle(null)}
          onChooseTarget={async () => {
            const selectedPath = await tauri.selectDirectory(
              "XRift Classicプロジェクトを選択",
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
              throw new Error("書き出すVisualプロジェクトがありません。");
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
              title: "XRift Classicへ書き出しました",
              description:
                integration === "component"
                  ? "接続コードを追加すると既存Sceneと一緒に利用できます。"
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
        onNew={() => setShowNewDialog(true)}
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
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreate}
        onOpenVisualEditor={handleOpenVisualEditor}
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
    ? "スターターのライセンス"
    : copy.mediaType.startsWith("text/")
      ? "スターターの由来ファイル"
      : "スターター素材";
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
