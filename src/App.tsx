import { useCallback, useEffect, useState } from "react";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { EditorView } from "./components/EditorView";
import { NewWorldDialog } from "./components/NewWorldDialog";
import { SetupView } from "./components/SetupView";
import { UpdateDialog } from "./components/UpdateDialog";
import { getBackend, type Project, type RuntimeStatus, type LogLine, type Whoami } from "./lib/backend";
import { isNewer } from "./lib/semver";
import { useToast } from "./components/Toast";

function App() {
  const toast = useToast();
  const backend = getBackend();

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
    backend
      .runtimeStatus()
      .then((s) => setRuntime(s))
      .catch((e) =>
        appendLog({ kind: "stderr", text: `runtime_status: ${e}`, ts: Date.now() }),
      )
      .finally(() => setRuntimeLoading(false));
  }, [backend, appendLog]);

  const refreshUser = useCallback(async () => {
    setUserLoading(true);
    try {
      const u = await backend.whoami(silentLog);
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setUserLoading(false);
    }
  }, [backend, silentLog]);

  const refreshProjects = useCallback(async () => {
    if (!projectsRoot) return;
    setProjectsLoading(true);
    try {
      await backend.ensureDir(projectsRoot);
      const list = await backend.listProjects(projectsRoot);
      setProjects(list);
      setSelected((cur) =>
        cur ? list.find((p) => p.path === cur.path) ?? null : cur,
      );
    } catch (err) {
      appendLog({ kind: "stderr", text: `list_projects: ${err}`, ts: Date.now() });
    } finally {
      setProjectsLoading(false);
    }
  }, [backend, projectsRoot, appendLog]);

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
          backend.cliVersion(silentLog),
          backend.checkXriftLatest(),
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
  }, [backend, runtime?.ready, updateChecked, silentLog]);

  const handleUpdateXrift = async () => {
    setUpdating(true);
    try {
      await backend.updateXrift();
      backend.clearCaches();
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
      await backend.login(appendLog);
      await refreshUser();
      const u = await backend.whoami(silentLog).catch(() => null);
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
      await backend.logout(appendLog);
      setUser(null);
      toast({ kind: "info", title: "ログアウトしました" });
    });

  const handleCreate = (name: string) =>
    wrap(async () => {
      const result = await backend.createWorld(projectsRoot, name, appendLog);
      setShowNewDialog(false);
      await refreshProjects();
      const list = await backend.listProjects(projectsRoot);
      const created = list.find((p) => p.name === name);
      if (result.code === 0) {
        toast({
          kind: "success",
          title: "ワールドを作成しました",
          description: name,
        });
        if (created) setSelected(created);
      } else {
        toast({
          kind: "error",
          title: "ワールド作成に失敗しました",
          description: "ログを確認してください",
        });
      }
    });

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
        <SetupView status={runtime} onReady={(s) => setRuntime(s)} />
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
        onOpen={setSelected}
        onNew={() => setShowNewDialog(true)}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefresh={refreshProjects}
      />
      <NewWorldDialog
        open={showNewDialog}
        busy={busy}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreate}
      />
      {updateDialog}
    </>
  );
}

export default App;
