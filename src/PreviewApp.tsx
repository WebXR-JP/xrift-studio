import { lazy, Suspense, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import { CompactEditorGate } from "./preview/CompactEditorGate";
import { RevealObserver } from "./preview/RevealObserver";
import { useCompactViewport } from "./preview/useCompactViewport";
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
import { Faq } from "./preview/sections/Faq";
import { WikiCallout } from "./preview/sections/WikiCallout";
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
  const landingScrollPosition = useRef(0);

  const openDemo = (projectKind: ProjectKind) => {
    landingScrollPosition.current = window.scrollY;
    setVisualEditorKind(projectKind);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };

  if (visualEditorKind) {
    const closeDemo = () => {
      setVisualEditorKind(null);
      setCompactEditorConfirmed(false);
      requestAnimationFrame(() =>
        window.scrollTo({ top: landingScrollPosition.current }),
      );
    };

    if (compactViewport && !compactEditorConfirmed) {
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
        {compactViewport ? (
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
            <VisualEditorPrototype
              projectKind={visualEditorKind}
              projectName={`visual-${visualEditorKind}-demo`}
              backLabel="紹介ページ"
              onBack={closeDemo}
              onUpload={(bundle) => setWebUploadBundle(bundle)}
            />
          </Suspense>
        </VisualEditorErrorBoundary>
        <WebUploadDialog
          bundle={webUploadBundle}
          onClose={() => setWebUploadBundle(null)}
        />
      </div>
    );
  }

  return (
    <main className="preview-shell">
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
      <Faq />
      <WikiCallout />
      <FinalCta />
      <Footer />
    </main>
  );
}
