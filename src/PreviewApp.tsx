import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { CompactEditorGate } from "./preview/CompactEditorGate";
import { RevealObserver } from "./preview/RevealObserver";
import { useCompactViewport } from "./preview/useCompactViewport";
import { useEditorDevice } from "./components/visual-editor/useEditorDevice";
import { BrowserProjectTransferDialog, type BrowserRecentProject, type BrowserTransferState } from "./preview/BrowserProjectTransferDialog";
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
  const [compactEditorConfirmed, setCompactEditorConfirmed] = useState(false);
  const compactViewport = useCompactViewport();
  const { tablet } = useEditorDevice();
  const landingScrollPosition = useRef(0);
  const [browserSession, setBrowserSession] = useState<{ path: string; initialBundle: PrototypeVisualProject } | null>(null);
  const documentsRef = useRef<VisualProjectDocuments | null>(null);
  const activeSessionPath = useRef<string | null>(null);
  const [transfer, setTransfer] = useState<BrowserTransferState | null>(null);
  const [recentProjects, setRecentProjects] = useState<BrowserRecentProject[]>([]);
  const transferActive = useRef(false);
  const retryTransfer = useRef<() => void>(() => {});
  const importInput = useRef<HTMLInputElement>(null);

  const adoptBrowserSession = (path: string, documents: VisualProjectDocuments) => {
    activeSessionPath.current = path;
    documentsRef.current = documents;
    const initialBundle: PrototypeVisualProject = {
      project: documents.project,
      scene: documents.scenes[documents.project.entrySceneId],
      assets: documents.assets,
      prefabs: documents.prefabs,
    };
    setBrowserSession({ path, initialBundle });
    setVisualEditorKind(documents.project.projectKind);
  };

  const saveBrowserProject = useCallback(async (bundle: PrototypeVisualProject) => {
    const sourceDocuments = documentsRef.current;
    if (!browserSession || !sourceDocuments || activeSessionPath.current !== browserSession.path || sourceDocuments.project.projectId !== bundle.project.projectId) throw new Error("ブラウザの保存先を確認できません。現在のプロジェクトを開き直してください。");
    const { saveVisualProjectToDisk } = await import("./lib/visual-editor/persistence");
    const documents = {
      ...sourceDocuments,
      project: bundle.project,
      scenes: { ...sourceDocuments.scenes, [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
    };
    await saveVisualProjectToDisk(browserSession.path, documents);
    if (activeSessionPath.current === browserSession.path && documentsRef.current?.project.projectId === documents.project.projectId) documentsRef.current = documents;
    return browserSession.path;
  }, [browserSession]);

  const exportBrowserProject = async (bundle: PrototypeVisualProject) => {
    if (transferActive.current || !browserSession) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "export" });
    retryTransfer.current = () => { void exportBrowserProject(bundle); };
    try {
      await saveBrowserProject(bundle);
      const documents = documentsRef.current;
      if (!documents || activeSessionPath.current !== browserSession.path || documents.project.projectId !== bundle.project.projectId) throw new Error("編集中のプロジェクトが切り替わりました。現在のプロジェクトから書き出し直してください。");
      const [{ getBrowserProjectFiles }, { createBrowserProjectArchive }] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
      ]);
      const archive = await createBrowserProjectArchive(documents, await getBrowserProjectFiles(browserSession.path));
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
      const path = await createBrowserProject(imported.files);
      adoptBrowserSession(path, imported.documents);
      setTransfer(null);
    } catch (error) {
      setTransfer({ phase: "failed", operation: "import", message: error instanceof Error ? error.message : "ZIPを読み取れませんでした。別のファイルを選んでください。" });
    } finally { transferActive.current = false; }
  };

  const openProjectChooser = async () => {
    retryTransfer.current = () => { void openProjectChooser(); };
    setTransfer({ phase: "select", operation: "import" });
    setRecentProjects([]);
    try {
      const { listBrowserProjects } = await import("./lib/browser-project-storage");
      setRecentProjects(await listBrowserProjects());
    } catch (error) {
      setTransfer((current) => current?.phase === "select" ? { phase: "failed", operation: "open", message: error instanceof Error ? error.message : "保存済みのプロジェクトを読み込めませんでした。" } : current);
    }
  };

  const openBrowserRecent = async (path: string) => {
    if (transferActive.current) return;
    transferActive.current = true;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void openBrowserRecent(path); };
    try {
      const [{ readVisualProjectFromDisk }, { activateBrowserProject }] = await Promise.all([
        import("./lib/visual-editor/persistence"), import("./lib/browser-project-storage"),
      ]);
      const documents = await readVisualProjectFromDisk(path);
      await activateBrowserProject(path);
      adoptBrowserSession(path, documents);
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

  const openDemo = async (projectKind: ProjectKind, fresh = false) => {
    if (transferActive.current) return;
    transferActive.current = true;
    if (!visualEditorKind) landingScrollPosition.current = window.scrollY;
    setTransfer({ phase: "preparing", operation: "open" });
    retryTransfer.current = () => { void openDemo(projectKind, fresh); };
    try {
      const [storage, transferTools, { createPrototypeProject }] = await Promise.all([
        import("./lib/browser-project-storage"),
        import("./lib/visual-editor/browser-project-transfer"),
        import("./lib/visual-editor/prototype-project"),
      ]);
      const previousPath = fresh ? null : await storage.restoreBrowserProject();
      let resumed = false;
      if (previousPath) {
        const { readVisualProjectFromDisk } = await import("./lib/visual-editor/persistence");
        const documents = await readVisualProjectFromDisk(previousPath);
        if (documents.project.projectKind === projectKind) {
          adoptBrowserSession(previousPath, documents);
          resumed = true;
        }
      }
      if (!resumed) {
        const bundle = createPrototypeProject(projectKind);
        const documents: VisualProjectDocuments = { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
        const path = await storage.createBrowserProject(transferTools.browserProjectDocumentFiles(documents));
        adoptBrowserSession(path, documents);
      }
      setTransfer(null);
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    } catch (error) {
      setTransfer({ phase: "failed", operation: "open", message: error instanceof Error ? error.message : "ブラウザにプロジェクトを保存できませんでした。保存容量やSafariの設定を確認してください。" });
    } finally { transferActive.current = false; }
  };

  const transferControls = <>
    <input ref={importInput} type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void importBrowserProject(file);
    }} />
    <BrowserProjectTransferDialog
      state={transfer}
      recentProjects={recentProjects}
      onClose={() => setTransfer(null)}
      onRetry={() => retryTransfer.current()}
      onPickFile={() => importInput.current?.click()}
      onOpenRecent={(path) => { void openBrowserRecent(path); }}
      onNewProject={(kind) => { void openDemo(kind, true); }}
      onChooseProject={() => { void openProjectChooser(); }}
    />
  </>;

  if (visualEditorKind) {
    const closeDemo = () => {
      setVisualEditorKind(null);
      setCompactEditorConfirmed(false);
      requestAnimationFrame(() =>
        window.scrollTo({ top: landingScrollPosition.current }),
      );
    };

    if (compactViewport && !tablet && !compactEditorConfirmed) {
      return (
        <CompactEditorGate
          projectKind={visualEditorKind}
          onBack={closeDemo}
          onContinue={() => {
            setCompactEditorConfirmed(true);
            requestAnimationFrame(() => window.scrollTo({ top: 0 }));
          }}
        />
      );
    }

    return (
      <div className="relative h-[100dvh] overflow-hidden">
        {compactViewport && !tablet ? (
          <button
            type="button"
            onClick={closeDemo}
            className="preview-mobile-editor-exit preview-button preview-button-light"
          >
            <ArrowLeft size={15} />
            紹介ページへ戻る
          </button>
        ) : null}
        <VisualEditorErrorBoundary
          key={visualEditorKind}
          featureName="ビジュアルエディターのデモ"
          projectName={`visual-${visualEditorKind}-demo`}
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
              onUpload={(bundle) => tablet ? exportBrowserProject(bundle) : setWebUploadBundle(bundle)}
            /> : <DemoFallback />}
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
      <Nav />
      <Hero onOpenDemo={openDemo} />
      <ProductKinds />
      <WorldTools />
      <CreationFlow />
      <Materials />
      <AiCollaboration />
      <PublishCheck />
      <TryDemo onOpenDemo={openDemo} />
      <ClassicBridge />
      <DownloadSection />
      <Faq />
      <GuideCallout />
      <FinalCta />
      <Footer />
    </main>{transferControls}</>
  );
}
