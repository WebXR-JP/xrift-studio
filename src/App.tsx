import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { EditorView } from "./components/EditorView";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SetupView } from "./components/SetupView";
import { UpdateDialog } from "./components/UpdateDialog";
import {
  tauri,
  type Project,
  type ProjectKind,
  type RuntimeStatus,
} from "./lib/tauri";
import { xrift, clearCaches, type LogLine, type Whoami } from "./lib/xrift-cli";
import { isNewer } from "./lib/semver";
import { useToast } from "./components/Toast";
import {
  VisualUploadDialog,
  type VisualPublishDiagnostic,
} from "./components/visual-editor/VisualUploadDialog";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import {
  compilePrototypeVisualProject,
  createStarterVisualProject,
  createStarterVisualProjectOnDisk,
  createVisualProjectOnDisk,
  defaultVisualStarterTemplateId,
  publishVisualProject,
  readVisualProjectFromDisk,
  sanitizePublishFailure,
  saveVisualProjectToDisk,
  type PrototypeVisualProject,
  type StarterVisualProjectPlan,
  type VisualStarterTemplateId,
} from "./lib/visual-editor";

const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

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
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualPublishBundle, setVisualPublishBundle] =
    useState<PrototypeVisualProject | null>(null);

  const [updateInfo, setUpdateInfo] = useState<{
    current: string | null;
    latest: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateChecked, setUpdateChecked] = useState(false);

  const projectsRoot = runtime?.paths.projectsRoot ?? "";

  const appendLog = useCallback((line: LogLine) => {
    setLogs((prev) => [...prev, line]);
  }, []);

  const silentLog = useCallback((_l: LogLine) => {}, []);

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
    const bundle: PrototypeVisualProject = {
      project: starterPlan.project,
      scene: starterPlan.scene,
      assets: starterPlan.assets,
      prefabs: starterPlan.prefabs,
    };
    if (!name || !projectsRoot) {
      setShowNewDialog(false);
      setVisualSession({ bundle, project: null });
      return;
    }

    void wrap(async () => {
      try {
        const project = await createStarterVisualProjectOnDisk(
          projectsRoot,
          name,
          starterPlan,
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
        toast({
          kind: "error",
          title: "ビジュアルプロジェクトを作成できませんでした",
          description: String(error),
        });
      }
    });
  };

  const handleOpenProject = (project: Project) => {
    if (project.format === "classic") {
      setSelected(project);
      return;
    }
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
  ): Promise<string> => {
    const documents = {
      project: bundle.project,
      scenes: { [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
    };
    try {
      if (visualSession?.project) {
        await saveVisualProjectToDisk(visualSession.project.path, documents);
        setVisualSession((current) =>
          current ? { ...current, bundle } : current,
        );
        await refreshProjects();
        if (notify) {
          toast({
            kind: "success",
            title: "ビジュアルプロジェクトを保存しました",
            description: bundle.project.metadata.name,
          });
        }
        return visualSession.project.path;
      } else {
        const project = await createVisualProjectOnDisk(
          projectsRoot,
          bundle.project.metadata.name,
          documents,
        );
        setVisualSession({ bundle, project });
        await refreshProjects();
        if (notify) {
          toast({
            kind: "success",
            title: "ビジュアルプロジェクトを保存しました",
            description: bundle.project.metadata.name,
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
              onSave={(bundle) => handleSaveVisualProject(bundle)}
              onUpload={(bundle) => setVisualPublishBundle(bundle)}
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
            thumbnailReady: true,
            thumbnailSource: "template",
            signedIn: user !== null,
            displayName: user?.displayName,
            saved: false,
            compilationFresh: false,
            diagnostics: visualPublishDiagnostics,
          }}
          onClose={() => setVisualPublishBundle(null)}
          onMetadataChange={(title, description) => {
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
            toast({
              kind: "info",
              title: "Scene Viewの画像を公開用サムネイルとして使用します",
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
          onPublish={async (report, signal) => {
            if (!publishBundle) throw new Error("公開する制作データがありません。");
            let savedProjectPath: string | null = null;
            const result = await publishVisualProject({
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
              report,
              onLog: appendLog,
              signal,
            });
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
                  uploadedAt: new Date().toISOString(),
                },
              },
            };
            setVisualPublishBundle(publishedBundle);
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
              setVisualSession((current) =>
                current ? { ...current, bundle: publishedBundle } : current,
              );
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

  const updateDialog = (
    <UpdateDialog
      open={updateInfo !== null}
      currentVersion={updateInfo?.current ?? null}
      latestVersion={updateInfo?.latest ?? null}
      busy={updating}
      onUpdate={handleUpdateXrift}
      onClose={() => !updating && setUpdateInfo(null)}
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
        {updateDialog}
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
        onNew={() => setShowNewDialog(true)}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefresh={refreshProjects}
      />
      <NewProjectDialog
        open={showNewDialog}
        busy={busy}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreate}
        onOpenVisualEditor={handleOpenVisualEditor}
      />
      {updateDialog}
    </>
  );
}

export default App;
