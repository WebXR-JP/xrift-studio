import { useCallback, useEffect, useState } from "react";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { EditorView } from "./components/EditorView";
import { NewWorldDialog } from "./components/NewWorldDialog";
import { getBackend, type Project, type RuntimeStatus, type LogLine, type Whoami } from "./lib/backend";
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

  if (selected) {
    return (
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
    </>
  );
}

export default App;
