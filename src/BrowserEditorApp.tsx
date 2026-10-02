import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { VisualEditorMcpProjectBridge } from './components/visual-editor/VisualEditorPrototype';
import { PROJECT_PACKAGE_ACCEPT } from "./lib/project-package";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { MobileEditorHelp } from "./preview/MobileEditorHelp";
import { useEditorDevice } from "./components/visual-editor/useEditorDevice";
import { BrowserProjectTransferDialog, type BrowserRecentProject, type BrowserTransferState } from "./preview/BrowserProjectTransferDialog";
import { BrowserProjectLibrary } from "./preview/BrowserProjectLibrary";
import { openBrowserProjectSession, type BrowserProjectSession } from "./preview/browser-project-session";
import type { PrototypeVisualProject } from "./lib/visual-editor/prototype-project";
import { saveBrowserStudioProject } from './lib/browser-studio-project-store';
import {
  WebUploadDialog,
} from "./preview/WebUploadDialog";
import type { XriftUploadResult } from "./lib/visual-editor/publish";
import { imageDataUrlToPng } from "./lib/project-thumbnail";
import { tauri } from "./lib/tauri";
import type { ProjectKind } from "./preview/content";
import type { BrowserStoredProject } from './lib/browser-project-storage';
import { browserProjectEditorUrl, prepareStudioProjectImport, resolveStudioProject, studioLaunchFromUrl } from './lib/browser-project-routing';

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
export type BrowserStudioApi = {
  open(path: string): Promise<void>;
  create(name: string): Promise<string>;
  openProject(projectId: string): Promise<void>;
  apply(bundle: PrototypeVisualProject): Promise<string>;
};
export type BrowserStudioHost = {
  controls: ReactNode;
  busy: boolean;
  onReady(api: BrowserStudioApi): void;
  onProjectChange(path: string | null): Promise<void>;
  onSaved(path: string, bundle: PrototypeVisualProject): Promise<void>;
  onBridge(bridge: VisualEditorMcpProjectBridge | null): void;
  onLanding?: () => void;
};
export default function BrowserEditorApp({ host }: { host?: BrowserStudioHost } = {}) {
  const hostRef = useRef(host); hostRef.current = host;
  const [externalGeneration, setExternalGeneration] = useState(0);
  const [visualEditorKind, setVisualEditorKind] = useState<ProjectKind | null>(null);
  const [webUploadBundle, setWebUploadBundle] = useState<PrototypeVisualProject | null>(null);
  const [editorInitialBundle, setEditorInitialBundle] = useState<PrototypeVisualProject | null>(null);
  const [thumbnailCaptureRequest, setThumbnailCaptureRequest] = useState(0);
  const [thumbnailCaptureBusy, setThumbnailCaptureBusy] = useState(false);
  const [thumbnailCaptureError, setThumbnailCaptureError] = useState<string | null>(null);
  const [thumbnailRefreshKey, setThumbnailRefreshKey] = useState(0);
  const [mobileHelpDismissed, setMobileHelpDismissed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { phone } = useEditorDevice();
  const startupStarted = useRef(false);
  const [browserSession, setBrowserSession] = useState<BrowserProjectSession | null>(null);
  const activeSession = useRef<BrowserProjectSession | null>(null);
  const editorBridge = useRef<VisualEditorMcpProjectBridge | null>(null);
  const registerEditorBridge = useCallback((bridge: VisualEditorMcpProjectBridge | null) => {
    editorBridge.current = bridge;
    hostRef.current?.onBridge(bridge);
  }, []);
  const closingSession = useRef<Promise<void>>(Promise.resolve());
  const [transfer, setTransfer] = useState<BrowserTransferState | null>(null);
  const [recentProjects, setRecentProjects] = useState<BrowserStoredProject[]>([]);
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
    setEditorInitialBundle(session.initialBundle);
    setThumbnailCaptureBusy(false);
    setThumbnailCaptureError(null);
    setVisualEditorKind(session.initialBundle.project.projectKind);
    document.title = `${session.initialBundle.project.metadata.name} | XRift Studio`;
    const url = browserProjectEditorUrl(session.initialBundle.project.projectId, window.location.href);
    if (url !== window.location.href) window.history.replaceState(null, '', url);
  };

  const openStoredBrowserProject = async (path: string, notify = true) => {
    await closingSession.current;
    if (activeSession.current?.path === path) return;
    if (activeSession.current && (!editorBridge.current || !(await editorBridge.current.saveNow()))) throw new Error('現在の作品を保存できませんでした。書き出してからもう一度開いてください。');
    const session = await openBrowserProjectSession(path);
    try {
      const { activateBrowserProject } = await import("./lib/browser-project-storage");
      await activateBrowserProject(path);
      adoptBrowserSession(session);
    } catch (error) { await session.close(); throw error; }
    if (notify) await hostRef.current?.onProjectChange(session.path);
  };

  const openProjectById = async (projectId: string) => {
    const project = await resolveStudioProject(projectId);
    await openStoredBrowserProject(project.path);
  };

  const openProjectRoute = async (projectId: string) => {
    if (transferActive.current) throw new Error('プロジェクトの処理が終わってからもう一度開いてください。');
    transferActive.current = true;
    setTransfer({ phase: 'preparing', operation: 'open' });
    retryTransfer.current = () => { void openProjectRoute(projectId); };
    try { await openProjectById(projectId); setTransfer(null); }
    catch (error) { setTransfer({ phase: 'failed', operation: 'open', message: error instanceof Error ? error.message : 'プロジェクトを開けませんでした。' }); }
    finally { transferActive.current = false; }
  };

  const saveBrowserProject = useCallback(async (bundle: PrototypeVisualProject) => {
    if (!browserSession || activeSession.current !== browserSession) throw new Error("ブラウザの保存先を確認できません。現在のプロジェクトを開き直してください。");
    const path = await browserSession.save(bundle);
    await hostRef.current?.onSaved(path, bundle);
    return path;
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
      const path = await createBrowserProject(await prepareStudioProjectImport(imported.files), { activate: false });
      await openStoredBrowserProject(path);
      setTransfer(null);
    } catch (error) {
      setTransfer({ phase: "failed", operation: "import", message: error instanceof Error ? error.message : "プロジェクトファイルを読み取れませんでした。.xriftstudioまたは従来の.zipを選んでください。" });
    } finally { transferActive.current = false; }
  };

  const refreshBrowserProjects = async () => {
    const generation = ++chooserGeneration.current;
    setRecentProjectsLoading(true);
    try {
      const { listBrowserProjects } = await import("./lib/browser-project-storage");
      const projects = await listBrowserProjects();
      if (chooserGeneration.current === generation) setRecentProjects(projects);
    } catch (error) {
      if (chooserGeneration.current === generation) {
        setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "保存済みのプロジェクトを読み込めませんでした。" });
      }
    } finally { if (chooserGeneration.current === generation) setRecentProjectsLoading(false); }
  };

  const openProjectChooser = async () => {
    if (transferActive.current) return;
    retryTransfer.current = () => { void openProjectChooser(); };
    setTransfer({ phase: "select", operation: "import" });
    await refreshBrowserProjects();
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

  const exportStoredBrowserProject = async (project: BrowserRecentProject) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "export" });
    retryTransfer.current = () => { void exportStoredBrowserProject(project); };
    try {
      const [storage, transferTools] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
      ]);
      const files = await storage.getBrowserProjectFiles(project.path);
      const documents = transferTools.parseBrowserProjectFiles(files);
      const archive = await transferTools.createBrowserProjectArchive(documents, files);
      setTransfer({ phase: "ready", ...archive });
    } catch (error) {
      setTransfer({ phase: "failed", operation: "export", message: error instanceof Error ? error.message : "プロジェクトを書き出せませんでした。" });
    } finally {
      transferActive.current = false;
    }
  };

  const deleteStoredBrowserProject = async (project: BrowserRecentProject): Promise<boolean> => {
    if (transferActive.current) return false;
    transferActive.current = true;
    try {
      const { deleteBrowserProject } = await import("./lib/browser-project-storage");
      await deleteBrowserProject(project.path);
      await refreshBrowserProjects();
      return true;
    } catch (error) {
      setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "プロジェクトを削除できませんでした。" });
      return false;
    } finally {
      transferActive.current = false;
    }
  };

  const applyBrowserBundle = async (bundle: PrototypeVisualProject): Promise<string> => {
    const session = activeSession.current;
    if (session?.initialBundle.project.projectId === bundle.project.projectId) {
      await session.save(bundle);
      setEditorInitialBundle(bundle);
      setExternalGeneration(value => value + 1);
      return session.path;
    }
    const path = await saveBrowserStudioProject(bundle);
    await openStoredBrowserProject(path, false);
    return path;
  };

  const createProject = async (projectKind: ProjectKind, name: string) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void createProject(projectKind, name); };
    try {
      await closingSession.current;
      const { createStarterVisualProject, defaultVisualStarterTemplateId } = await import('./lib/visual-editor/starter-templates');
      const path = await applyBrowserBundle(createStarterVisualProject(projectKind, defaultVisualStarterTemplateId(projectKind), name));
      await hostRef.current?.onProjectChange(path);
      setTransfer(null);
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
      return path;
    } catch (error) {
      setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "ブラウザにプロジェクトを保存できませんでした。保存容量やSafariの設定を確認してください。" });
    } finally { transferActive.current = false; }
  };

  useEffect(() => {
    // Explicit /new and project links select the startup action. The ordinary
    // entry lists metadata without restoring an unrelated or broken project.
    if (startupStarted.current) return;
    startupStarted.current = true;
    void refreshBrowserProjects();
    if (!hostRef.current) {
      try {
        const launch = studioLaunchFromUrl(window.location.href);
        if (launch.kind === 'new') void createProject('world', launch.name);
        else if (launch.kind === 'project') void openProjectRoute(launch.projectId);
      }
      catch (error) { setTransfer({ phase: 'failed', operation: 'open', message: error instanceof Error ? error.message : 'プロジェクトIDが不正です。' }); }
    }
    hostRef.current?.onReady({
      open: async (path) => { await openStoredBrowserProject(path, false); },
      openProject: async (projectId) => {
        if (transferActive.current) throw new Error('プロジェクトの処理が終わってからもう一度開いてください。');
        transferActive.current = true; setTransfer({ phase: 'preparing', operation: 'open' });
        retryTransfer.current = () => { void openProjectRoute(projectId); };
        try { await openProjectById(projectId); setTransfer(null); }
        catch (error) { setTransfer({ phase: 'failed', operation: 'open', message: error instanceof Error ? error.message : 'プロジェクトを開けませんでした。' }); throw error; }
        finally { transferActive.current = false; }
      },
      create: async (name) => {
        const path = await createProject('world', name);
        if (!path) throw new Error('新しい作品を作成できませんでした。表示されたエラーを確認して再試行してください。');
        return path;
      },
      apply: applyBrowserBundle,
    });
    return () => { void activeSession.current?.close(); };
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
      if (hostRef.current?.onLanding) { hostRef.current.onLanding(); setLeaving(false); return; }
      window.location.assign(import.meta.env.DEV ? "preview.html" : "./");
    };
    void finishLeaving();
  }, [leaving]);

  const returnToProjectLibrary = async () => {
    chooserGeneration.current++;
    setTransfer(null);
    const session = activeSession.current;
    activeSession.current = null;
    setBrowserSession(null);
    setVisualEditorKind(null);
    setWebUploadBundle(null);
    setEditorInitialBundle(null);
    setThumbnailCaptureBusy(false);
    setThumbnailCaptureError(null);
    document.title = "XRift Studio";
    window.history.replaceState(null, '', browserProjectEditorUrl(null, window.location.href));
    if (session) await session.close();
    await closingSession.current;
    await refreshBrowserProjects();
    await hostRef.current?.onProjectChange(null);
  };

  const recordBrowserPublication = async (
    bundle: PrototypeVisualProject,
    result: XriftUploadResult,
  ) => {
    const session = browserSession;
    if (!session || activeSession.current !== session) {
      throw new Error("編集中のプロジェクトが切り替わりました。XRiftの公開結果を確認してください。");
    }
    const published = await session.recordPublication(bundle, result);
    setEditorInitialBundle(published);
    setWebUploadBundle(published);
    await refreshBrowserProjects();
  };

  const captureBrowserThumbnail = async (dataUrl: string) => {
    const session = activeSession.current;
    if (!session) {
      setThumbnailCaptureError("プロジェクトを確認できません。開き直してから撮影してください。");
      setThumbnailCaptureBusy(false);
      return;
    }
    try {
      await tauri.writeThumbnail(session.path, await imageDataUrlToPng(dataUrl));
      setThumbnailRefreshKey((current) => current + 1);
      setThumbnailCaptureError(null);
    } catch (error) {
      setThumbnailCaptureError(error instanceof Error ? error.message : "シーンを撮影できませんでした。");
    } finally {
      setThumbnailCaptureBusy(false);
    }
  };

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
      inline={false}
      state={transfer}
      recentProjects={recentProjects}
      recentProjectsLoading={recentProjectsLoading}
      activeProjectPath={browserSession?.path}
      onClose={() => { chooserGeneration.current++; setTransfer(null); }}
      onRetry={() => retryTransfer.current()}
      onPickFile={() => importInput.current?.click()}
      onOpenRecent={(path) => { void openBrowserRecent(path); }}
      onNewProject={(kind) => setTransfer({ phase: "create", operation: "open", kind })}
      onCreateProject={(kind, name) => { void createProject(kind, name); }}
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
          backLabel="プロジェクトへ戻る"
          onBack={() => { void returnToProjectLibrary(); }}
        >
          <Suspense fallback={<EditorFallback />}>
            {browserSession ? <VisualEditorPrototype
              key={browserSession.path + ':' + externalGeneration}
              projectKind={visualEditorKind}
              projectName={browserSession.initialBundle.project.metadata.name}
              projectPath={browserSession.path}
              initialBundle={editorInitialBundle ?? browserSession.initialBundle}
              onSave={saveBrowserProject}
              onProjectExport={exportBrowserProject}
              onProjectImport={openProjectChooser}
              onRegisterMcpProjectBridge={registerEditorBridge}
              hostControls={host?.controls}
              projectTransferBusy={transfer?.phase === "preparing"}
              backLabel="プロジェクト"
              onBack={() => { void returnToProjectLibrary(); }}
              onUpload={async (bundle) => {
                await saveBrowserProject(bundle);
                setWebUploadBundle(bundle);
              }}
              thumbnailCaptureRequest={thumbnailCaptureRequest}
              onThumbnailCaptured={(dataUrl) => { void captureBrowserThumbnail(dataUrl); }}
              onThumbnailCaptureError={(message) => { setThumbnailCaptureError(message); setThumbnailCaptureBusy(false); }}
            /> : <EditorFallback />}
            {phone && !host && !mobileHelpDismissed && !transfer && browserSession ? <MobileEditorHelp onClose={() => setMobileHelpDismissed(true)} /> : null}
          </Suspense>
        </VisualEditorErrorBoundary>
        {webUploadBundle && browserSession ? <WebUploadDialog
          bundle={webUploadBundle}
          projectPath={browserSession.path}
          thumbnailRefreshKey={thumbnailRefreshKey}
          thumbnailCaptureBusy={thumbnailCaptureBusy}
          thumbnailCaptureError={thumbnailCaptureError}
          onCaptureThumbnail={() => {
            setThumbnailCaptureError(null);
            setThumbnailCaptureBusy(true);
            setThumbnailCaptureRequest((current) => current + 1);
          }}
          onClose={() => setWebUploadBundle(null)}
          onExport={() => {
            const bundle = webUploadBundle;
            setWebUploadBundle(null);
            void exportBrowserProject(bundle);
          }}
          onUploaded={recordBrowserPublication}
        /> : null}
        {transferControls}
        {host?.busy && <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 text-sm" role="status">Studioへの反映を確認しています…</div>}
      </div>
    );
  }

  return (
    <div className="preview-dialog-theme min-h-[100dvh] bg-zinc-100 text-zinc-900">
      <BrowserProjectLibrary
        projects={recentProjects}
        loading={recentProjectsLoading}
        busy={transfer?.phase === "preparing"}
        onOpen={(path) => { void openBrowserRecent(path); }}
        onExport={(project) => { void exportStoredBrowserProject(project); }}
        onDelete={deleteStoredBrowserProject}
        onNew={() => setTransfer({ phase: "new", operation: "open" })}
        onImport={() => importInput.current?.click()}
        onRefresh={() => { void refreshBrowserProjects(); }}
        onBack={host && !host.onLanding ? undefined : () => setLeaving(true)}
        hostControls={host?.controls}
      />
      {transferControls}
    </div>
  );
}
