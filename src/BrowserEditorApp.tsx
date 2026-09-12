import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PROJECT_PACKAGE_ACCEPT } from "./lib/project-package";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { MobileEditorHelp } from "./preview/MobileEditorHelp";
import { useEditorDevice } from "./components/visual-editor/useEditorDevice";
import { BrowserProjectTransferDialog, type BrowserRecentProject, type BrowserTransferState } from "./preview/BrowserProjectTransferDialog";
import { openBrowserProjectSession, type BrowserProjectSession } from "./preview/browser-project-session";
import type { PrototypeVisualProject } from "./lib/visual-editor/prototype-project";
import type { VisualProjectDocuments } from "./lib/visual-editor/persistence";
import {
  WebUploadDialog,
  type WebUploadBundle,
} from "./preview/WebUploadDialog";
import type { ProjectKind } from "./preview/content";
import { resolveBrowserEditorStart } from "./preview/browser-editor-start";

const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

function EditorFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-6 text-center text-sm font-medium text-zinc-600">
      ビジュアルエディターを準備しています…
    </div>
  );
}

/** The browser editor has its own HTML entry, so its URL survives navigation. */
export default function BrowserEditorApp() {
  const [visualEditorKind, setVisualEditorKind] = useState<ProjectKind | null>(null);
  const [webUploadBundle, setWebUploadBundle] = useState<WebUploadBundle | null>(null);
  const [mobileHelpDismissed, setMobileHelpDismissed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { tablet, phone } = useEditorDevice();
  const startupStarted = useRef(false);
  const [browserSession, setBrowserSession] = useState<BrowserProjectSession | null>(null);
  const activeSession = useRef<BrowserProjectSession | null>(null);
  const closingSession = useRef<Promise<void>>(Promise.resolve());
  const [transfer, setTransfer] = useState<BrowserTransferState | null>(null);
  const [recentProjects, setRecentProjects] = useState<BrowserRecentProject[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(false);
  const chooserGeneration = useRef(0);
  const transferActive = useRef(false);
  const retryTransfer = useRef<() => void>(() => {});
  const importInput = useRef<HTMLInputElement>(null);

  const adoptBrowserSession = (session: BrowserProjectSession) => {
    const previous = activeSession.current;
    activeSession.current = session;
    if (previous && previous !== session) closingSession.current = previous.close();
    setBrowserSession(session);
    setVisualEditorKind(session.initialBundle.project.projectKind);
    document.title = `${session.initialBundle.project.metadata.name} | XRift Studio`;
    // A kind query only chooses the initial project. Reloads resume whichever
    // project the author subsequently opens, including an imported project.
    const url = new URL(window.location.href);
    if (url.searchParams.has("kind")) {
      url.searchParams.delete("kind");
      window.history.replaceState(null, "", url);
    }
  };

  const openStoredBrowserProject = async (path: string) => {
    await closingSession.current;
    if (activeSession.current?.path === path) return;
    const session = await openBrowserProjectSession(path);
    try {
      const { activateBrowserProject } = await import("./lib/browser-project-storage");
      await activateBrowserProject(path);
      adoptBrowserSession(session);
    } catch (error) { await session.close(); throw error; }
  };

  const saveBrowserProject = useCallback(async (bundle: PrototypeVisualProject) => {
    if (!browserSession || activeSession.current !== browserSession) throw new Error("ブラウザの保存先を確認できません。現在のプロジェクトを開き直してください。");
    return browserSession.save(bundle);
  }, [browserSession]);

  const exportBrowserProject = async (bundle: PrototypeVisualProject) => {
    if (transferActive.current || !browserSession) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "export" });
    retryTransfer.current = () => { void exportBrowserProject(bundle); };
    try {
      if (activeSession.current !== browserSession) throw new Error("編集中のプロジェクトが切り替わりました。現在のプロジェクトから書き出し直してください。");
      const archive = await browserSession.export(bundle);
      setTransfer({ phase: "ready", ...archive });
    } catch (error) {
      setTransfer({ phase: "failed", operation: "export", message: error instanceof Error ? error.message : "書き出せませんでした。編集内容を残したまま再試行できます。" });
    } finally { transferActive.current = false; }
  };

  const importBrowserProject = async (file: File) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "import" });
    retryTransfer.current = () => { importInput.current?.click(); };
    try {
      const [{ createBrowserProject }, { readBrowserProjectArchive }] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
      ]);
      const imported = await readBrowserProjectArchive(file);
      const path = await createBrowserProject(imported.files, { activate: false });
      await openStoredBrowserProject(path);
      setTransfer(null);
    } catch (error) {
      setTransfer({ phase: "failed", operation: "import", message: error instanceof Error ? error.message : "プロジェクトファイルを読み取れませんでした。.xriftstudioまたは従来の.zipを選んでください。" });
    } finally { transferActive.current = false; }
  };

  const openProjectChooser = async () => {
    if (transferActive.current) return;
    const generation = ++chooserGeneration.current;
    retryTransfer.current = () => { void openProjectChooser(); };
    setTransfer({ phase: "select", operation: "import" });
    setRecentProjects([]);
    setRecentProjectsLoading(true);
    try {
      const { listBrowserProjects } = await import("./lib/browser-project-storage");
      const projects = await listBrowserProjects();
      if (chooserGeneration.current === generation) setRecentProjects(projects);
    } catch (error) {
      if (chooserGeneration.current === generation) setTransfer((current) => current?.phase === "select" ? { phase: "failed", operation: "open", message: error instanceof Error ? error.message : "保存済みのプロジェクトを読み込めませんでした。" } : current);
    } finally { if (chooserGeneration.current === generation) setRecentProjectsLoading(false); }
  };

  const openBrowserRecent = async (path: string) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void openBrowserRecent(path); };
    try {
      await openStoredBrowserProject(path);
      setTransfer(null);
    } catch (error) {
      setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "プロジェクトを開けませんでした。" });
    } finally { transferActive.current = false; }
  };

  const openProject = async (projectKind?: ProjectKind, fresh = false, name?: string) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void openProject(projectKind, fresh, name); };
    try {
      await closingSession.current;
      const [storage, transferTools, { createPrototypeProject }] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
        import("./lib/visual-editor/prototype-project"),
      ]);
      const target = fresh
        ? { kind: projectKind ?? "world" as const }
        : resolveBrowserEditorStart(projectKind, await storage.restoreBrowserProject(), await storage.listBrowserProjects());
      if ("path" in target) {
        await openStoredBrowserProject(target.path);
      } else {
        const bundle = createPrototypeProject(target.kind, name);
        const documents: VisualProjectDocuments = { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
        const path = await storage.createBrowserProject(transferTools.browserProjectDocumentFiles(documents), { activate: false });
        await openStoredBrowserProject(path);
      }
      setTransfer(null);
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    } catch (error) {
      setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "ブラウザにプロジェクトを保存できませんでした。保存容量やSafariの設定を確認してください。" });
    } finally { transferActive.current = false; }
  };

  useEffect(() => {
    // StrictMode repeats setup in development. Keep one startup operation so a
    // fresh visit cannot create two projects or compete for its own lease.
    if (startupStarted.current) return;
    startupStarted.current = true;
    const requested = new URLSearchParams(window.location.search).get("kind");
    void openProject(requested === "world" || requested === "item" ? requested : undefined);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    // The editor is now unmounted, including its unsaved-changes prompt.
    // This also respects an explicit decision to leave after a save failure.
    const finishLeaving = async () => {
      const session = activeSession.current;
      activeSession.current = null;
      if (session) await session.close();
      await closingSession.current;
      window.location.assign(import.meta.env.DEV ? "preview.html" : "./");
    };
    void finishLeaving();
  }, [leaving]);

  useEffect(() => {
    const restorePage = (event: PageTransitionEvent) => {
      // Back/Forward may restore the document after its editing lease closed.
      // Reload to acquire a fresh session and read the latest saved project.
      if (event.persisted && leaving) window.location.reload();
    };
    window.addEventListener("pageshow", restorePage);
    return () => window.removeEventListener("pageshow", restorePage);
  }, [leaving]);

  const transferControls = <>
    <input ref={importInput} type="file" accept={PROJECT_PACKAGE_ACCEPT} hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void importBrowserProject(file);
    }} />
    <BrowserProjectTransferDialog
      state={transfer}
      recentProjects={recentProjects}
      recentProjectsLoading={recentProjectsLoading}
      activeProjectPath={browserSession?.path}
      onClose={() => { chooserGeneration.current++; setTransfer(null); }}
      onRetry={() => retryTransfer.current()}
      onPickFile={() => importInput.current?.click()}
      onOpenRecent={(path) => { void openBrowserRecent(path); }}
      onNewProject={(kind) => setTransfer({ phase: "create", operation: "open", kind })}
      onCreateProject={(kind, name) => { void openProject(kind, true, name); }}
      onChooseProject={() => { void openProjectChooser(); }}
    />
  </>;

  if (leaving) {
    return <div role="status" className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 text-sm text-zinc-600">紹介ページへ戻っています…</div>;
  }

  if (visualEditorKind) {
    return (
      <div className="relative h-[100dvh] overflow-hidden">
        <VisualEditorErrorBoundary
          key={browserSession?.path ?? visualEditorKind}
          featureName="ビジュアルエディター"
          projectName={browserSession?.initialBundle.project.metadata.name}
          backLabel="紹介ページへ戻る"
          onBack={() => setLeaving(true)}
        >
          <Suspense fallback={<EditorFallback />}>
            {browserSession ? <VisualEditorPrototype
              key={browserSession.path}
              projectKind={visualEditorKind}
              projectName={browserSession.initialBundle.project.metadata.name}
              projectPath={browserSession.path}
              initialBundle={browserSession.initialBundle}
              onSave={saveBrowserProject}
              onProjectExport={exportBrowserProject}
              onProjectImport={openProjectChooser}
              projectTransferBusy={transfer?.phase === "preparing"}
              backLabel="紹介ページ"
              onBack={() => setLeaving(true)}
              onUpload={(bundle) => (tablet || phone) ? exportBrowserProject(bundle) : setWebUploadBundle(bundle)}
            /> : <EditorFallback />}
            {phone && !mobileHelpDismissed && !transfer && browserSession ? <MobileEditorHelp onClose={() => setMobileHelpDismissed(true)} /> : null}
          </Suspense>
        </VisualEditorErrorBoundary>
        <WebUploadDialog
          bundle={webUploadBundle}
          onClose={() => setWebUploadBundle(null)}
        />
        {transferControls}
      </div>
    );
  }

  return (
    <div className="preview-dialog-theme flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-5 text-zinc-900">
      {transfer?.phase === "preparing" ? <EditorFallback /> : (
        <main className="my-8 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6">
          <h1 className="text-xl font-semibold">ビジュアルエディター</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">このブラウザに保存したプロジェクトや、.xriftstudioファイルを開いて編集できます。</p>
          <button type="button" className="preview-button preview-button-primary mt-5 min-h-11 w-full" onClick={() => { void openProjectChooser(); }}>プロジェクトを開く</button>
          <a className="preview-button preview-button-light mt-3 min-h-11 w-full" href={import.meta.env.DEV ? "preview.html" : "./"}>紹介ページへ戻る</a>
        </main>
      )}
      {transferControls}
    </div>
  );
}
