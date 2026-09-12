import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PROJECT_PACKAGE_ACCEPT } from "./lib/project-package";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { MobileEditorHelp } from "./preview/MobileEditorHelp";
import { RevealObserver } from "./preview/RevealObserver";
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
import { Nav } from "./preview/sections/Nav";
import { Hero } from "./preview/sections/Hero";
import { ProductKinds } from "./preview/sections/ProductKinds";
import { WorldTools } from "./preview/sections/WorldTools";
import { CreationFlow } from "./preview/sections/CreationFlow";
import { Materials } from "./preview/sections/Materials";
import { AiCollaboration } from "./preview/sections/AiCollaboration";
import { PublishCheck } from "./preview/sections/PublishCheck";
import { TryDemo } from "./preview/sections/TryDemo";
import { ClassicBridge } from "./preview/sections/ClassicBridge";
import { DownloadSection } from "./preview/sections/DownloadSection";
import { Faq } from "./preview/sections/Faq";
import { GuideCallout } from "./preview/sections/GuideCallout";
import { FinalCta } from "./preview/sections/FinalCta";
import { Footer } from "./preview/sections/Footer";

const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

function DemoFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 px-6 text-center text-sm font-medium text-zinc-600">
      ビジュアルエディターを準備しています…
    </div>
  );
}

/**
 * The landing page, and the door into the real editor running in the browser.
 *
 * The page itself is assembled from `src/preview/`: one file per section, with
 * every claim it makes kept in `preview/content.ts` so the copy can be read
 * against the implementation in one place.
 */
export default function PreviewApp() {
  const [visualEditorKind, setVisualEditorKind] = useState<ProjectKind | null>(null);
  const [webUploadBundle, setWebUploadBundle] = useState<WebUploadBundle | null>(null);
  const [mobileHelpDismissed, setMobileHelpDismissed] = useState(false);
  const { tablet, phone } = useEditorDevice();
  const landingScrollPosition = useRef(0);
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
    if (!visualEditorKind) landingScrollPosition.current = window.scrollY;
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

  useEffect(() => {
    // Direct guide links arrive before React has mounted the target section.
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const openDemo = async (projectKind: ProjectKind, fresh = false, name?: string) => {
    if (transferActive.current) return;
    transferActive.current = true;
    if (!visualEditorKind) landingScrollPosition.current = window.scrollY;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void openDemo(projectKind, fresh, name); };
    try {
      await closingSession.current;
      const [storage, transferTools, { createPrototypeProject }] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
        import("./lib/visual-editor/prototype-project"),
      ]);
      const previousPath = fresh ? null : await storage.restoreBrowserProject();
      // Do not acquire a World's editing lease when the author asked for an Item.
      const previous = previousPath ? (await storage.listBrowserProjects()).find((project) => project.path === previousPath && project.kind === projectKind) : null;
      const resumed = Boolean(previous);
      if (previous) await openStoredBrowserProject(previous.path);
      if (!resumed) {
        const bundle = createPrototypeProject(projectKind, name);
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
      onCreateProject={(kind, name) => { void openDemo(kind, true, name); }}
      onChooseProject={() => { void openProjectChooser(); }}
    />
  </>;

  if (visualEditorKind) {
    const closeDemo = () => {
      const session = activeSession.current;
      activeSession.current = null;
      if (session) closingSession.current = session.close();
      setBrowserSession(null);
      setVisualEditorKind(null);
      setWebUploadBundle(null);
      requestAnimationFrame(() =>
        window.scrollTo({ top: landingScrollPosition.current }),
      );
    };

    return (
      <div className="relative h-[100dvh] overflow-hidden">
        <VisualEditorErrorBoundary
          key={browserSession?.path ?? visualEditorKind}
          featureName="ビジュアルエディター"
          projectName={browserSession?.initialBundle.project.metadata.name}
          backLabel="紹介ページへ戻る"
          onBack={closeDemo}
        >
          <Suspense fallback={<DemoFallback />}>
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
              onBack={closeDemo}
              onUpload={(bundle) => (tablet || phone) ? exportBrowserProject(bundle) : setWebUploadBundle(bundle)}
            /> : <DemoFallback />}
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
    <><main className="preview-shell">
      <RevealObserver />
      <Nav onOpenProjects={tablet ? openProjectChooser : undefined} />
      <Hero onOpenDemo={openDemo} tablet={tablet} onOpenProjects={openProjectChooser} />
      <ProductKinds />
      <WorldTools />
      <CreationFlow />
      <Materials />
      <AiCollaboration />
      <PublishCheck />
      <TryDemo onOpenDemo={openDemo} tablet={tablet} />
      <ClassicBridge />
      <DownloadSection />
      <Faq />
      <GuideCallout />
      <FinalCta onOpenProjects={tablet ? openProjectChooser : undefined} />
      <Footer />
    </main>{transferControls}</>
  );
}
