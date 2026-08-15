import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bug,
  Blend,
  Blocks,
  Bot,
  Box,
  BookOpen,
  Check,
  ChevronDown,
  CirclePlay,
  Code2,
  Download,
  ExternalLink,
  FileBox,
  GitBranch,
  Globe2,
  Image,
  Layers3,
  MonitorPlay,
  MousePointer2,
  PackageOpen,
  Play,
  ScanSearch,
  Shapes,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import { VisualEditorErrorBoundary } from "./components/visual-editor/VisualEditorErrorBoundary";
import {
  XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL,
  XRIFT_STUDIO_ISSUES_URL,
  XRIFT_STUDIO_REPOSITORY_URL,
  XRIFT_STUDIO_WIKI_URL,
} from "./lib/support-links";

const VisualEditorPrototype = lazy(() =>
  import("./components/visual-editor/VisualEditorPrototype").then((module) => ({
    default: module.VisualEditorPrototype,
  })),
);

type ProjectKind = "world" | "item";

const releaseUrl = "https://github.com/WebXR-JP/xrift-studio/releases/latest";
const repositoryUrl = XRIFT_STUDIO_REPOSITORY_URL;

const productKinds = [
  {
    icon: Globe2,
    title: "ワールド",
    label: "ワールド",
    text: "人が集まって一緒に過ごせる空間です。ロビーや美術館、遊び場を作ってXRiftに公開できます。",
    tone: "preview-kind-violet",
  },
  {
    icon: Box,
    title: "アイテム",
    label: "アイテム",
    text: "手に取って持ち歩ける道具や飾りです。いろんなワールドで使えるように作って、みんなに共有できます。",
    tone: "preview-kind-cyan",
  },
] as const;

const reasons = [
  {
    icon: PackageOpen,
    title: "持っている素材から始まる",
    text: "3Dモデル、アバター、Unityの素材、音を、そのまま取り込めます。",
  },
  {
    icon: Blend,
    title: "変えた分は、その場で見える",
    text: "配置、色、質感、光、パーティクルの調整が、すぐシーンに反映されます。",
  },
  {
    icon: MonitorPlay,
    title: "確かめてから、そのまま公開",
    text: "編集とプレイを切り替えずに操作感を確認し、整えたらXRiftへ届けられます。",
  },
] as const;

const creationFlow = [
  {
    number: "01",
    icon: PackageOpen,
    title: "素材を持ち込む",
    text: "モデル、アバター、画像、音をドロップ。使いたいものが、そのまま制作の入口になります。",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "シーンを組む",
    text: "画面を見ながら配置し、光、質感、動き、当たり判定を整えます。",
  },
  {
    number: "03",
    icon: CirclePlay,
    title: "中を歩いて確かめる",
    text: "エディターを閉じずにプレイ。ワールドの操作感も、アイテムの見え方もすぐ確認できます。",
  },
  {
    number: "04",
    icon: Upload,
    title: "XRiftへ届ける",
    text: "タイトルやサムネイル、容量の目安を確認したら、そのままアップロードへ進めます。",
  },
] as const;

const importGroups = [
  {
    icon: Box,
    label: "3Dモデル・アバター",
    formats: "GLB / glTF / OBJ / VRM",
    tone: "preview-import-violet",
  },
  {
    icon: Image,
    label: "テクスチャ・空気感",
    formats: "PNG / JPG / WebP / KTX2 / HDR / EXR",
    tone: "preview-import-cyan",
  },
  {
    icon: AudioLines,
    label: "BGM・効果音",
    formats: "MP3 / 3D Audio",
    tone: "preview-import-amber",
  },
] as const;

const tourPoints = [
  {
    icon: Shapes,
    title: "シーンを組む",
    text: "左のHierarchyでオブジェクトの階層を開き、中央の3Dビューで配置。位置・回転・大きさを直感的に調整できます。",
  },
  {
    icon: Layers3,
    title: "素材を取り込む",
    text: "取り込んだモデルやテクスチャを一覧から選び、ドラッグ＆ドロップでシーンに置けます。",
  },
  {
    icon: MousePointer2,
    title: "細部を詰める",
    text: "選んだオブジェクトの詳細を右側で編集。マテリアル、ライト、当たり判定も同じ画面で扱えます。",
  },
] as const;

const experimentalFeatures = [
  {
    icon: FileBox,
    title: "Unityの素材を取り込む",
    text: "UnityPackage、Scene、Prefabを読み取って、対応する階層や素材をXRift Studioへ引き継げます。",
  },
  {
    icon: WandSparkles,
    title: "Open Brushの作品を持ち込む",
    text: "Open Brush／Tilt Brushで描いた線を、専用の描画経路でシーンへ再現します。",
  },
  {
    icon: Bot,
    title: "AIと一緒にシーンを編集",
    text: "CodexやClaudeなどを接続して、いま開いているシーンを安全な範囲で共同編集できます。",
  },
] as const;

const faqs = [
  {
    question: "XRift Studioで、何が作れますか？",
    answer:
      "XRiftで遊べる「ワールド」と、ワールドをまたいで持ち歩ける「アイテム」の両方を作れます。新規作成時にどちらを選ぶか指定します。",
  },
  {
    question: "ワールドとアイテムは、どう違いますか？",
    answer:
      "ワールドは人が集まる空間です。アイテムはそのワールドをまたいで持ち歩ける道具や飾りです。どちらも同じアプリで作れます。",
  },
  {
    question: "コードが書けなくても使えますか？",
    answer:
      "はい。画面での制作なら、素材の取り込み、配置、調整、プレイ、公開まで進められます。コードで作りたい人向けのクラシック制作も同じアプリにあります。",
  },
  {
    question: "料金はかかりますか？",
    answer:
      "XRift Studioは無料で使えるオープンソースソフトウェアです。ソースコードはMIT Licenseで公開しています。",
  },
  {
    question: "このページのデモでは、どこまでできますか？",
    answer:
      "画面の操作感を試せます。ファイルの保存、AIクライアント接続、XRiftへのアップロードはデスクトップ版で行います。",
  },
  {
    question: "WindowsやMac、Linuxで使えますか？",
    answer:
      "はい。Windows・macOS・Linuxに対応しています。インストーラーはGitHubのリリースページからダウンロードできます。",
  },
] as const;

function RevealObserver() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.dataset.revealed = "true");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return null;
}

function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="preview-brand-mark grid h-9 w-9 place-items-center rounded-xl text-white">
        <Box size={18} strokeWidth={2.2} />
      </span>
      <span className="text-sm font-black tracking-[-0.025em] text-zinc-950">XRift Studio</span>
    </span>
  );
}

function ProductScreenshot({
  compact = false,
  interactive = false,
}: {
  compact?: boolean;
  interactive?: boolean;
}) {
  return (
    <figure
      className={`preview-product-frame relative overflow-hidden rounded-[1.6rem] border border-white/80 bg-white shadow-2xl shadow-violet-950/15 ${
        compact ? "preview-product-frame-compact" : ""
      } ${interactive ? "preview-product-frame-interactive" : ""}`}
    >
      <div className="flex h-9 items-center border-b border-zinc-200/80 bg-zinc-100/90 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="flex-1 text-center text-[10px] font-semibold text-zinc-500">XRift Studio</span>
        <span className="w-12" />
      </div>
      <img
        src="./visual-editor-screenshot.png"
        alt="XRift Studioのビジュアルエディター。Hierarchy、3Dシーン、Assets、Inspectorを一つの画面に表示している"
        className="block h-auto w-full"
      />
      {interactive ? (
        <span className="preview-screenshot-cta" aria-hidden="true">
          <Play size={14} fill="currentColor" />
          この画面をクリックして試す
        </span>
      ) : null}
    </figure>
  );
}

function DemoFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 px-6 text-center text-sm font-medium text-zinc-600">
      ビジュアルエディターを準備しています…
    </div>
  );
}

function useCompactViewport() {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

function CompactEditorGate({
  projectKind,
  onBack,
  onContinue,
}: {
  projectKind: ProjectKind;
  onBack: () => void;
  onContinue: () => void;
}) {
  const kindLabel = projectKind === "world" ? "World" : "Item";

  return (
    <main className="preview-compact-editor-gate min-h-screen overflow-x-hidden px-5 py-5">
      <div className="mx-auto flex max-w-xl items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="preview-button preview-button-light"
        >
          <ArrowLeft size={15} />
          紹介ページ
        </button>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
          最新{kindLabel} Editor
        </span>
      </div>

      <div className="mx-auto max-w-xl pb-10 pt-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <MonitorPlay size={22} />
        </span>
        <h1 className="mt-6 text-balance text-3xl font-black leading-tight tracking-[-0.045em] text-zinc-950">
          エディターは、広い画面でいちばん使いやすく。
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-600">
          最新版はHierarchy、Scene、Assets、Inspectorを同時に使う制作画面です。スマホでは横向きにするか、タブレット・PCでの操作をおすすめします。
        </p>

        <div className="mx-auto mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-violet-950/10">
          <ProductScreenshot compact />
        </div>

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="preview-button preview-button-primary preview-button-large w-full"
          >
            <Play size={16} fill="currentColor" />
            このまま最新エディターを開く
          </button>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="preview-button preview-button-light preview-button-large w-full"
          >
            <Download size={16} />
            デスクトップ版をダウンロード
          </a>
        </div>
      </div>
    </main>
  );
}

/** Documents the editor hands over when the author asks to publish. */
type WebUploadBundle = {
  project: { metadata: { title: string; description: string } };
  scene: { sceneId: string };
  assets: unknown;
  prefabs: unknown;
};

type WebUploadState =
  | { phase: "form" }
  | { phase: "running"; label: string; percent: number; detail?: string }
  | { phase: "done"; worldId: string; versionNumber: number }
  | { phase: "failed"; message: string };

/**
 * Publishes the browser editor's scene straight to XRift.
 *
 * The desktop build hands this job to the official CLI, which needs a shell
 * and a filesystem. Here the scene travels as data (`xrift/runtime.json`)
 * alongside the prebuilt runtime shell, so no build step is involved. The
 * token is typed in each time rather than stored: this page keeps no account
 * state, and an upload-capable credential should not outlive the tab by
 * accident.
 */
function WebUploadDialog({
  bundle,
  onClose,
}: {
  bundle: WebUploadBundle | null;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<WebUploadState>({ phase: "form" });

  useEffect(() => {
    if (bundle) setState({ phase: "form" });
  }, [bundle]);

  if (!bundle) return null;

  const running = state.phase === "running";

  const start = async () => {
    setState({ phase: "running", label: "準備しています", percent: 4 });
    try {
      // Loaded on demand so the landing page does not carry the SDK.
      const [{ uploadVisualProjectFromWeb, loadRuntimeShell }] = await Promise.all([
        import("./lib/visual-editor/web-upload"),
      ]);
      setState({
        phase: "running",
        label: "ランタイムシェルを読み込んでいます",
        percent: 12,
      });
      const shellFiles = await loadRuntimeShell();

      const result = await uploadVisualProjectFromWeb({
        kind: "world",
        documents: {
          project: bundle.project,
          scenes: { [bundle.scene.sceneId]: bundle.scene },
          assets: bundle.assets,
          prefabs: bundle.prefabs,
        } as never,
        token,
        shellFiles,
        // The browser editor has no Asset storage: imports are written to disk
        // over Tauri IPC, so a scene built here can only reference built-ins.
        readAssetBytes: async (relativePath) => {
          throw new Error(
            `素材「${relativePath}」はブラウザ版では読み取れません。素材を含むワールドはデスクトップ版から公開してください。`,
          );
        },
        report: (progress) =>
          setState({
            phase: "running",
            label: progress.label,
            percent: progress.percent ?? 0,
            detail: progress.detail,
          }),
        signal: new AbortController().signal,
      });

      setState({
        phase: "done",
        worldId: result.worldId ?? result.contentId ?? "",
        versionNumber: result.versionNumber ?? 0,
      });
    } catch (error) {
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="preview-web-upload-backdrop" role="dialog" aria-modal="true">
      <div className="preview-web-upload">
        <h2 className="preview-web-upload-title">XRiftへ公開</h2>

        {state.phase === "form" ? (
          <>
            <p className="preview-web-upload-lead">
              ブラウザから直接アップロードします。
              <code>xrift login</code>
              で取得したCLIトークン（xrf_）か、
              <code>write:worlds</code>
              スコープを付けて発行したAPIキー（xrift_sk_）を入力してください。
            </p>
            <label className="preview-web-upload-field">
              <span>XRiftトークン</span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="xrf_..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="preview-web-upload-note">
              素材を取り込んだワールドと、Scriptを含むワールドは、まだデスクトップ版から公開してください。
            </p>
          </>
        ) : null}

        {running ? (
          <div className="preview-web-upload-progress">
            <p className="preview-web-upload-label">{state.label}</p>
            <div className="preview-web-upload-track">
              <div
                className="preview-web-upload-bar"
                style={{ width: `${state.percent}%` }}
              />
            </div>
            {state.detail ? (
              <p className="preview-web-upload-detail">{state.detail}</p>
            ) : null}
          </div>
        ) : null}

        {state.phase === "done" ? (
          <div className="preview-web-upload-result">
            <p className="preview-web-upload-label">アップロードが完了しました</p>
            <p className="preview-web-upload-detail">
              ワールドID {state.worldId} / バージョン {state.versionNumber}
            </p>
            {/*
              Links to the app root rather than a per-world path. The SDK's
              completion response carries no URL, and XRift's site answers 200
              for every path, so a deep link cannot be confirmed from here —
              guessing one risks sending the author to a page that is not
              their world. The id above is what identifies it.
            */}
            <a
              className="preview-button preview-button-primary"
              href="https://app.xrift.net"
              target="_blank"
              rel="noreferrer"
            >
              XRiftを開く
              <ExternalLink size={14} />
            </a>
          </div>
        ) : null}

        {state.phase === "failed" ? (
          <p className="preview-web-upload-error">{state.message}</p>
        ) : null}

        <div className="preview-web-upload-actions">
          <button
            type="button"
            className="preview-button preview-button-light"
            onClick={onClose}
            disabled={running}
          >
            {state.phase === "done" ? "閉じる" : "やめる"}
          </button>
          {state.phase === "form" || state.phase === "failed" ? (
            <button
              type="button"
              className="preview-button preview-button-primary"
              onClick={() => void start()}
              disabled={!token.trim()}
            >
              <Upload size={15} />
              {state.phase === "failed" ? "もう一度試す" : "アップロード"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PreviewApp() {
  const [visualEditorKind, setVisualEditorKind] = useState<ProjectKind | null>(null);
  const [webUploadBundle, setWebUploadBundle] = useState<WebUploadBundle | null>(
    null,
  );
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

      <nav className="preview-nav sticky top-0 z-40 border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#top" aria-label="XRift Studioのトップへ">
            <BrandMark />
          </a>
          <div className="flex items-center gap-1">
            <a href="#create" className="preview-nav-link hidden sm:inline-flex">
              できること
            </a>
            <a href="#try" className="preview-nav-link hidden md:inline-flex">
              最新エディター
            </a>
            <a href="#faq" className="preview-nav-link hidden lg:inline-flex">
              よくある質問
            </a>
            <a
              href={XRIFT_STUDIO_WIKI_URL}
              target="_blank"
              rel="noreferrer"
              className="preview-nav-link hidden lg:inline-flex"
            >
              使い方ガイド
            </a>
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="preview-button preview-button-dark ml-2"
            >
              <Download size={15} />
              <span className="hidden sm:inline">無料でダウンロード</span>
              <span className="sm:hidden">ダウンロード</span>
            </a>
          </div>
        </div>
      </nav>

      <section id="top" className="preview-hero relative overflow-hidden px-5 pb-20 pt-16 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="preview-hero-grid" aria-hidden="true" />
        <div className="preview-hero-glow preview-hero-glow-one" aria-hidden="true" />
        <div className="preview-hero-glow preview-hero-glow-two" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="preview-kicker mx-auto" data-reveal>
              <Sparkles size={14} />
              XRiftのワールド・アイテムを、無料で作れるデスクトップアプリ
            </div>
            <h1 className="preview-hero-title mt-6 text-balance font-black leading-[0.98] tracking-[-0.065em] text-zinc-950" data-reveal>
              置いて、動かして、
              <span className="preview-gradient-text block">そのままXRiftへ。</span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-8 text-zinc-600 sm:text-lg" data-reveal>
              3Dモデルやアバター、Unityの素材を読み込んで、画面で配置して、その場でプレイ。
              作ったワールドやアイテムは、XRiftへそのまま公開できます。
            </p>
            <ul className="mx-auto mt-8 flex max-w-3xl flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:flex-wrap" data-reveal>
              {[
                { icon: Shapes, text: "ワールド制作", tone: "preview-hero-pill-violet" },
                { icon: PackageOpen, text: "アイテム制作", tone: "preview-hero-pill-cyan" },
                { icon: MonitorPlay, text: "画面でも、コードでも", tone: "preview-hero-pill-amber" },
              ].map((pill) => {
                const Icon = pill.icon;
                return (
                  <li key={pill.text} className={`preview-hero-pill ${pill.tone}`}>
                    <Icon size={15} />
                    {pill.text}
                  </li>
                );
              })}
            </ul>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal>
              <a
                href={releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="preview-button preview-button-primary preview-button-large w-full max-w-xs sm:w-auto"
              >
                <Download size={17} />
                無料でダウンロード
              </a>
              <button
                type="button"
                onClick={() => openDemo("world")}
                className="preview-button preview-button-light preview-button-large w-full max-w-xs sm:w-auto"
              >
                <Play size={16} fill="currentColor" />
                エディターを試す（このページで）
              </button>
            </div>
            <p className="mt-4 text-xs font-medium text-zinc-500" data-reveal>
              Windows・macOS・Linux / 無料・オープンソース
            </p>
          </div>

          <div className="preview-hero-stage relative mx-auto mt-14 max-w-6xl lg:mt-18" data-reveal>
            <div className="preview-stage-label preview-stage-label-left">
              <Layers3 size={14} />
              Sceneを見ながら編集
            </div>
            <div className="preview-stage-label preview-stage-label-right">
              <Play size={13} fill="currentColor" />
              その場でPlay
            </div>
            <button
              type="button"
              onClick={() => openDemo("world")}
              className="preview-hero-stage-button block w-full text-left"
              aria-label="ビジュアルエディターのデモを開く"
            >
              <ProductScreenshot interactive />
            </button>
            <div className="preview-stage-status">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              自動保存済み
              <span className="mx-1 h-4 w-px bg-zinc-200" />
              World
            </div>
          </div>

          <div className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-4 border-y border-zinc-200/80 py-5 text-center sm:grid-cols-4" data-reveal>
            {["ビジュアル制作", "コード制作", "プレイで確認", "XRiftへ公開"].map((item) => (
              <span key={item} className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-600 sm:text-sm">
                <Check size={14} className="text-violet-600" strokeWidth={2.5} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="preview-section bg-white px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl" data-reveal>
            <p className="preview-eyebrow">作れるもの</p>
            <h2 className="preview-section-title mt-4">ふたつのものを作れます。</h2>
            <p className="preview-section-copy mt-5 max-w-2xl">
              XRiftには「人が集まる空間」と「持ち歩けるもの」があります。どちらもこのアプリで作れます。
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2" data-reveal>
            {productKinds.map((kind) => {
              const Icon = kind.icon;
              return (
                <article key={kind.title} className={`preview-kind-card ${kind.tone}`}>
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-zinc-950 shadow-sm">
                      <Icon size={22} />
                    </span>
                    <span className="text-[11px] font-black tracking-[0.2em] opacity-70">{kind.label}</span>
                  </div>
                  <h3 className="mt-7 text-2xl font-black tracking-[-0.04em]">{kind.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-7 opacity-80">{kind.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="preview-section preview-section-soft px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center" data-reveal>
            <p className="preview-eyebrow">選ばれる理由</p>
            <h2 className="preview-section-title mt-4">制作に必要なものが、ひとつの画面に揃っている。</h2>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3" data-reveal>
            {reasons.map((reason) => {
              const Icon = reason.icon;
              return (
                <article key={reason.title} className="preview-benefit-card">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                    <Icon size={22} />
                  </span>
                  <h3 className="mt-6 text-lg font-black tracking-[-0.03em] text-zinc-950">{reason.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-600">{reason.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="create" className="preview-section bg-white px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl" data-reveal>
            <p className="preview-eyebrow">制作の流れ</p>
            <h2 className="preview-section-title mt-4">持ち込んで、組んで、確かめて、公開する。</h2>
            <p className="preview-section-copy mt-5 max-w-2xl">
              素材の取り込みから公開までを、ひとつのアプリで進められます。別のツールを行き来する手間を省けます。
            </p>
          </div>

          <div className="preview-flow mt-14 grid gap-0 md:grid-cols-2 lg:grid-cols-4" data-reveal>
            {creationFlow.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.number} className="preview-flow-step relative">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-950 text-white">
                      <Icon size={19} />
                    </span>
                    <span className="text-xs font-black tracking-[0.16em] text-violet-600">{step.number}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-black tracking-[-0.035em] text-zinc-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-600">{step.text}</p>
                  {index < creationFlow.length - 1 ? <ArrowRight className="preview-flow-arrow" size={18} /> : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="preview-section preview-section-soft px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <div data-reveal>
              <p className="preview-eyebrow">使える素材</p>
              <h2 className="preview-section-title mt-4">いつもの素材から、すぐ始める。</h2>
              <p className="preview-section-copy mt-5">
                手元の3Dモデル、テクスチャ、音をそのまま取り込んで、シーンへ置けます。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3" data-reveal>
              {importGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <article key={group.label} className={`preview-import-card ${group.tone}`}>
                    <Icon size={22} />
                    <h3 className="mt-8 text-base font-black tracking-tight text-zinc-950">{group.label}</h3>
                    <p className="mt-2 text-xs font-bold leading-6 text-zinc-600">{group.formats}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="preview-source-strip mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" data-reveal>
            <div>
              <span className="preview-source-mark">P</span>
              <p className="mt-4 text-sm font-black text-zinc-950">Poly Haven</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">HDRIや素材を検索して、そのまま追加</p>
            </div>
            <div>
              <span className="preview-source-mark">X</span>
              <p className="mt-4 text-sm font-black text-zinc-950">XRift公式パーツ</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Portal、Mirror、Spawn Pointなどを配置</p>
            </div>
            <div>
              <span className="preview-source-mark">O</span>
              <p className="mt-4 text-sm font-black text-zinc-950">Open Brush</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">検証済みブラシと描いた線の素材</p>
            </div>
            <div>
              <span className="preview-source-mark">U</span>
              <p className="mt-4 text-sm font-black text-zinc-950">Unity</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Package、Scene、Prefabを変換</p>
            </div>
          </div>
        </div>
      </section>

      <section className="preview-section bg-white px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="relative" data-reveal>
              <div className="preview-screenshot-backdrop" aria-hidden="true" />
              <ProductScreenshot compact />
            </div>
            <div data-reveal>
              <p className="preview-eyebrow">操作感</p>
              <h2 className="preview-section-title mt-4">画面を見れば、次に触る場所がわかる。</h2>
              <div className="mt-8 divide-y divide-zinc-200">
                {tourPoints.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <article key={feature.title} className="grid grid-cols-[2.75rem_1fr] gap-4 py-6 first:pt-0">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                        <Icon size={19} />
                      </span>
                      <div>
                        <h3 className="text-base font-black tracking-tight text-zinc-950">{feature.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-zinc-600">{feature.text}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="preview-section preview-dark-section px-5 text-white lg:px-8">
        <div className="preview-dark-grid" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div data-reveal>
              <span className="preview-dark-kicker">
                <ScanSearch size={14} />
                公開前まで、ちゃんと見える
              </span>
              <h2 className="mt-6 text-balance text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-5xl">
                「たぶん大丈夫」を、
                <span className="block text-violet-300">公開前に終わらせる。</span>
              </h2>
              <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                タイトル、説明、サムネイルの見落としをチェックし、ロード容量やVRAMの目安も確認できます。届く形に整えてXRiftへ送れます。
              </p>
            </div>

            <div className="preview-publish-panel" data-reveal>
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-xs font-black text-white">公開前の最終チェック</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Night gallery / World</p>
                </div>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">
                  準備できました
                </span>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-3">
                  {[
                    "タイトルと説明を編集済み",
                    "サムネイルを設定済み",
                    "シーンの検査が完了",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-xs font-semibold text-zinc-200">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <Check size={12} strokeWidth={3} />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/8 p-4">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-violet-300">LOAD ESTIMATE</p>
                  <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">18.4 MB</p>
                  <p className="mt-1 text-[11px] text-zinc-400">初回ロードの目安</p>
                  <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
                  </div>
                  <p className="mt-3 text-[10px] leading-5 text-zinc-500">容量の大きい素材と最適化候補も確認できます</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] text-zinc-500">アップロード後も結果を同じ画面に表示</span>
                <span className="preview-button preview-button-white">
                  <Upload size={14} />
                  XRiftへアップロード
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="preview-section preview-section-soft px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div data-reveal>
              <p className="preview-eyebrow">挑戦中の機能</p>
              <h2 className="preview-section-title mt-4">少し先の作り方も、もう試せる。</h2>
              <p className="preview-section-copy mt-5">
                検証中の機能もデスクトップ版から触れられます。Unity素材の変換、Open Brushの描画、AIとの共同編集などです。
              </p>
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800">
                <Sparkles size={13} />
                検証中のため、対応範囲は順次更新しています
              </p>
            </div>
            <div className="preview-experiment-list" data-reveal>
              {experimentalFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="preview-experiment-row">
                    <span className="text-xs font-black text-zinc-300">0{index + 1}</span>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 text-zinc-700">
                      <Icon size={19} />
                    </span>
                    <div>
                      <h3 className="text-base font-black tracking-tight text-zinc-950">{feature.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-zinc-600">{feature.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="try" className="preview-section bg-white px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="preview-demo-callout relative overflow-hidden rounded-[2rem] border border-violet-200 bg-white p-7 shadow-xl shadow-violet-950/5 sm:p-10 lg:p-14" data-reveal>
            <div className="preview-demo-glow" aria-hidden="true" />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-3xl">
                <p className="preview-eyebrow">実際に触る</p>
                <h2 className="preview-section-title mt-4">ダウンロードしなくても、触ってみられます。</h2>
                <p className="preview-section-copy mt-5 max-w-2xl">
                  実際のXRift Studioと同じビジュアルエディターが、このページで開きます。シーンを選び、素材を置き、見た目を整える流れを、インストール前に確かめられます。
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">現在のエディター本体を使用</span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-600">World / Item対応</span>
                </div>
                <p className="mt-4 text-xs font-medium leading-6 text-zinc-500">
                  Webで操作感を確認できます。ファイル保存、AI接続、XRiftへのアップロードはデスクトップ版で行います。
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <button
                  type="button"
                  onClick={() => openDemo("world")}
                  className="preview-button preview-button-primary preview-button-large w-full sm:w-auto"
                >
                  <Globe2 size={17} />
                  Worldエディターを試す
                </button>
                <button
                  type="button"
                  onClick={() => openDemo("item")}
                  className="preview-button preview-button-light preview-button-large w-full sm:w-auto"
                >
                  <Box size={17} />
                  Itemエディターを試す
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="preview-section px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 rounded-[2rem] bg-zinc-950 p-7 text-white sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:p-14" data-reveal>
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-black text-cyan-300">
                <Code2 size={15} />
                コードで続けたいときも
              </span>
              <h2 className="mt-5 text-3xl font-black leading-tight tracking-[-0.045em] sm:text-4xl">作ったシーンを、コードの世界へも渡せる。</h2>
              <p className="mt-5 text-sm leading-7 text-zinc-400">
                画面で作ったものをClassicプロジェクトへ書き出したり、既存のR3F／XRiftコードをシーンへ取り込めます。どの作り方から始めても先へ進めます。
              </p>
              <p className="mt-4 text-[11px] font-semibold text-zinc-500">Classic変換は開発版として提供中です</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 font-mono text-xs shadow-inner">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                World.tsx
              </div>
              <div className="overflow-x-auto p-5 leading-7 text-zinc-300">
                <p><span className="text-violet-300">import</span> {"{ XRiftStudioScene }"} <span className="text-violet-300">from</span> <span className="text-amber-200">'./xrift-studio/night-gallery'</span></p>
                <p className="mt-3"><span className="text-violet-300">export const</span> World = () =&gt; {"("}</p>
                <p className="pl-5 text-cyan-200">&lt;XRiftStudioScene /&gt;</p>
                <p>{")"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="preview-section preview-section-soft px-5 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.6fr_1.4fr]">
          <div data-reveal>
            <p className="preview-eyebrow">気になること</p>
            <h2 className="preview-section-title mt-4">始める前に、気になること。</h2>
          </div>
          <div className="divide-y divide-zinc-200 border-y border-zinc-200" data-reveal>
            {faqs.map((faq) => (
              <details key={faq.question} className="preview-faq group">
                <summary>
                  <span>{faq.question}</span>
                  <ChevronDown size={18} className="shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="preview-section bg-white px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="preview-wiki-callout grid gap-8 rounded-[2rem] border border-zinc-200 bg-zinc-50 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center" data-reveal>
            <div>
              <p className="preview-eyebrow">使い方ガイド</p>
              <h2 className="preview-section-title mt-4">もっと詳しく、使い方を知りたい。</h2>
              <p className="preview-section-copy mt-5 max-w-2xl">
                インストールから、素材の取り込み、シーン編集、プレイ、公開まで。制作の流れに沿った使い方ガイドです。
              </p>
            </div>
            <a
              href={XRIFT_STUDIO_WIKI_URL}
              target="_blank"
              rel="noreferrer"
              className="preview-button preview-button-dark preview-button-large w-full sm:w-auto"
            >
              <BookOpen size={17} />
              使い方ガイドを開く
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 lg:px-8 lg:py-28">
        <div className="preview-final-cta relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] px-7 py-14 text-center text-white sm:px-12 sm:py-20" data-reveal>
          <div className="preview-final-grid" aria-hidden="true" />
          <div className="relative mx-auto max-w-3xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-violet-200 ring-1 ring-white/15">
              <Blocks size={22} />
            </div>
            <h2 className="mt-7 text-balance text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-5xl">
              次のワールドは、ここから始まる。
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
              いま持っている素材と、つくりたい景色を持ってきてください。XRiftへ届けるところまで、一緒に進めます。
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="preview-button preview-button-white preview-button-large w-full max-w-xs sm:w-auto"
              >
                <Download size={17} />
                無料でダウンロード
              </a>
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="preview-button preview-button-ghost preview-button-large w-full max-w-xs sm:w-auto"
              >
                <GitBranch size={17} />
                GitHubで見る
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200/80 px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-zinc-500">
            <a href="https://xrift.net/" target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-violet-700">
              XRift公式サイト
            </a>
            {XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL ? (
              <a href={XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-violet-700">
                <Bug size={13} aria-hidden="true" />
                Issue相談GPT
              </a>
            ) : (
              <a href={`${XRIFT_STUDIO_ISSUES_URL}/new`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-violet-700">
                <Bug size={13} aria-hidden="true" />
                Issueを相談
              </a>
            )}
            <a href={repositoryUrl} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-violet-700">
              GitHub
            </a>
            <a href={XRIFT_STUDIO_WIKI_URL} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-violet-700">
              使い方ガイド
            </a>
            <a href={`${repositoryUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-violet-700">
              MIT License
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
