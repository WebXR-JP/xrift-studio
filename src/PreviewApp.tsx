import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Camera,
  Check,
  CircleHelp,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  Package,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  TerminalSquare,
  Upload,
  WandSparkles,
} from "lucide-react";

// ---- 実アプリ (EditorView) を再現するサンプルデータ ----

type SampleKind = "world" | "item";
type SampleFileId = "src/World.tsx" | "src/Item.tsx" | "xrift.json" | "README.md";

type TreeRow = {
  rel: string;
  label: string;
  depth: number;
  icon: "dir" | "dirOpen" | "code" | "json" | "image" | "text" | "package";
  openas?: SampleFileId;
};

// xrift create world が生成するワールドテンプレートのファイル構成
const worldTree: TreeRow[] = [
  { rel: "public", label: "public", depth: 0, icon: "dir" },
  { rel: "public/thumbnail.png", label: "thumbnail.png", depth: 1, icon: "image" },
  { rel: "src", label: "src", depth: 0, icon: "dirOpen" },
  { rel: "src/components", label: "components", depth: 1, icon: "dir" },
  { rel: "src/World.tsx", label: "World.tsx", depth: 1, icon: "code", openas: "src/World.tsx" },
  { rel: "src/constants.ts", label: "constants.ts", depth: 1, icon: "code" },
  { rel: "src/index.tsx", label: "index.tsx", depth: 1, icon: "code" },
  { rel: "index.html", label: "index.html", depth: 0, icon: "code" },
  { rel: "package.json", label: "package.json", depth: 0, icon: "package" },
  { rel: "README.md", label: "README.md", depth: 0, icon: "text", openas: "README.md" },
  { rel: "xrift.json", label: "xrift.json", depth: 0, icon: "json", openas: "xrift.json" },
];

// xrift create item が生成するアイテムテンプレートのファイル構成
const itemTree: TreeRow[] = [
  { rel: "public", label: "public", depth: 0, icon: "dir" },
  { rel: "public/thumbnail.png", label: "thumbnail.png", depth: 1, icon: "image" },
  { rel: "src", label: "src", depth: 0, icon: "dirOpen" },
  { rel: "src/Item.tsx", label: "Item.tsx", depth: 1, icon: "code", openas: "src/Item.tsx" },
  { rel: "src/dev.tsx", label: "dev.tsx", depth: 1, icon: "code" },
  { rel: "src/index.tsx", label: "index.tsx", depth: 1, icon: "code" },
  { rel: "index.html", label: "index.html", depth: 0, icon: "code" },
  { rel: "vite.config.ts", label: "vite.config.ts", depth: 0, icon: "code" },
  { rel: "package.json", label: "package.json", depth: 0, icon: "package" },
  { rel: "README.md", label: "README.md", depth: 0, icon: "text", openas: "README.md" },
  { rel: "xrift.json", label: "xrift.json", depth: 0, icon: "json", openas: "xrift.json" },
];

function TreeIcon({ icon, selected }: { icon: TreeRow["icon"]; selected: boolean }) {
  const cls = selected
    ? "text-violet-600"
    : icon === "dir" || icon === "dirOpen"
      ? "text-zinc-500"
      : "text-zinc-400";
  const p = { size: 14, strokeWidth: 1.75, className: cls } as const;
  switch (icon) {
    case "dir":
      return <Folder {...p} />;
    case "dirOpen":
      return <FolderOpen {...p} />;
    case "json":
      return <FileJson {...p} />;
    case "image":
      return <FileImage {...p} />;
    case "text":
      return <FileText {...p} />;
    case "package":
      return <Package {...p} />;
    default:
      return <FileCode2 {...p} />;
  }
}

// World.tsx テンプレートの抜粋 (トークン: [テキスト, 色クラス])
type Tok = [string] | [string, string];
const K = "text-violet-600"; // キーワード
const S = "text-amber-700"; // 文字列
const T = "text-sky-700"; // コンポーネント / タグ
const A = "text-violet-500"; // 属性
const C = "text-emerald-600"; // コメント
const N = "text-teal-700"; // 数値・式
const P = "text-zinc-400"; // 記号

const worldCode: Tok[][] = [
  [["import", K], [" { "], ["SpawnPoint", T], [" } "], ["from", K], [" "], ["'@xrift/world-components'", S]],
  [["import", K], [" { "], ["RigidBody", T], [" } "], ["from", K], [" "], ["'@react-three/rapier'", S]],
  [[""]],
  [["export", K], [" "], ["const", K], [" World "], ["=", P], [" () "], ["=>", K], [" ("]],
  [["  <", P], ["group", T], [">", P]],
  [["    "], ["{/* プレイヤーのスポーン地点 */}", C]],
  [["    <", P], ["SpawnPoint", T], [" />", P]],
  [[""]],
  [["    <", P], ["ambientLight", T], [" intensity", A], ["=", P], ["{0.3}", N], [" />", P]],
  [["    <", P], ["directionalLight", T], [" position", A], ["=", P], ["{[5, 10, 5]}", N], [" castShadow", A], [" />", P]],
  [[""]],
  [["    "], ["{/* 地面 */}", C]],
  [["    <", P], ["RigidBody", T], [" type", A], ["=", P], ['"fixed"', S], [" colliders", A], ["=", P], ['"cuboid"', S], [">", P]],
  [["      <", P], ["mesh", T], [" rotation", A], ["=", P], ["{[-Math.PI / 2, 0, 0]}", N], [" receiveShadow", A], [">", P]],
  [["        <", P], ["planeGeometry", T], [" args", A], ["=", P], ["{[30, 30]}", N], [" />", P]],
  [["        <", P], ["meshLambertMaterial", T], [" color", A], ["=", P], ['"#7fb069"', S], [" />", P]],
  [["      </", P], ["mesh", T], [">", P]],
  [["    </", P], ["RigidBody", T], [">", P]],
  [["  </", P], ["group", T], [">", P]],
  [[")"]],
];

const itemCode: Tok[][] = [
  [["import", K], [" { "], ["useRef", T], [" } "], ["from", K], [" "], ["'react'", S]],
  [["import", K], [" { "], ["useFrame", T], [" } "], ["from", K], [" "], ["'@react-three/fiber'", S]],
  [["import", K], [" { "], ["RigidBody", T], [" } "], ["from", K], [" "], ["'@react-three/rapier'", S]],
  [["import", K], [" "], ["type", K], [" { "], ["Mesh", T], [" } "], ["from", K], [" "], ["'three'", S]],
  [[""]],
  [["export", K], [" "], ["interface", K], [" ItemProps "], ["{"]],
  [["  position", A], ["?: "], ["[number, number, number]", T], [";"]],
  [["  scale", A], ["?: "], ["number", T], [";"]],
  [["}"]],
  [[""]],
  [["export", K], [" "], ["const", K], [" Item "], ["=", P], [" ({ position = [0, 0, 0], scale = 1 }) "], ["=>", K], [" {"]],
  [["  "], ["const", K], [" meshRef "], ["=", P], [" useRef<Mesh>(null)"]],
  [["  useFrame((_state, delta) "], ["=>", K], [" {"]],
  [["    "], ["if", K], [" (meshRef.current) meshRef.current.rotation.y += delta"]],
  [["  }"]],
  [["  "], ["return", K], [" ("]],
  [["    <", P], ["group", T], [" position", A], ["=", P], ["{position}", N], [" scale", A], ["=", P], ["{scale}", N], [">", P]],
  [["      <", P], ["RigidBody", T], [" type", A], ["=", P], ['"fixed"', S], [" colliders", A], ["=", P], ['"cuboid"', S], [">", P]],
  [["        <", P], ["mesh", T], [" ref", A], ["=", P], ["{meshRef}", N], [" castShadow", A], [">", P]],
  [["          <", P], ["boxGeometry", T], [" args", A], ["=", P], ["{[0.5, 0.5, 0.5]}", N], [" />", P]],
  [["          <", P], ["meshStandardMaterial", T], [" color", A], ["=", P], ['"orange"', S], [" />", P]],
  [["        </", P], ["mesh", T], [">", P]],
  [["      </", P], ["RigidBody", T], [">", P]],
  [["    </", P], ["group", T], [">", P]],
  [["  )"]],
  [["}"]],
];

const worldReadmeLines = [
  "# my-world",
  "",
  "React Three Fiber と Rapier で作られたサンプルワールドです。",
  "",
  "## 開発",
  "",
  "- 「実行」を押す (またはターミナルで npm run dev)",
  "- ブラウザで 3D プレビューを確認",
  "- src/World.tsx を編集して保存すると即反映",
];

const itemReadmeLines = [
  "# my-first-item",
  "",
  "React Three Fiber で作られた再利用可能な XRift アイテムです。",
  "",
  "## 開発",
  "",
  "- 「実行」を押す (またはターミナルで npm run dev)",
  "- ブラウザで単体の 3D プレビューを確認",
  "- src/Item.tsx を編集して保存すると即反映",
  "- 公開前に xrift check item --build を実行",
];

const devLogs = [
  { text: "$ npm run dev", cls: "text-zinc-700" },
  { text: "  VITE v7.3.1  ready in 432 ms", cls: "text-zinc-700" },
  { text: "  ➜  Local:   http://localhost:5173/", cls: "text-zinc-700" },
  { text: "ブラウザでプレビューを開きました", cls: "text-violet-700 font-medium" },
];

const steps = [
  {
    icon: Download,
    eyebrow: "準備する",
    title: "アプリを入れる",
    text: "GitHub Releases から OS に合うデスクトップ版を入れます。初回に必要な制作環境は、アプリが専用フォルダへ準備します。",
    accent: "from-violet-500 to-indigo-500",
  },
  {
    icon: WandSparkles,
    eyebrow: "作り始める",
    title: "ワールドかアイテムを選ぶ",
    text: "作りたい種別と名前を選ぶと、すぐ編集できるプロジェクトが開きます。作成したものはライブラリからいつでも再開できます。",
    accent: "from-cyan-500 to-blue-500",
  },
  {
    icon: Play,
    eyebrow: "確かめる",
    title: "編集しながら動かす",
    text: "コードや素材を編集して「実行」を押すと、ブラウザで動きを確認できます。保存した変更は、そのままプレビューへ反映されます。",
    accent: "from-emerald-500 to-teal-500",
  },
  {
    icon: Upload,
    eyebrow: "公開する",
    title: "見せ方を整えて届ける",
    text: "タイトル、説明、サムネイルを確認してから XRift へアップロードします。アイテムは公開前のセキュリティチェックも実行できます。",
    accent: "from-fuchsia-500 to-pink-500",
  },
];

function scrollToWorkspace() {
  document.getElementById("workspace-preview")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function PreviewApp() {
  const [sampleKind, setSampleKind] = useState<SampleKind>("world");
  const [activeFile, setActiveFile] = useState<SampleFileId>("src/World.tsx");
  const [running, setRunning] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const isItem = sampleKind === "item";
  const projectName = isItem ? "my-first-item" : "my-world";
  const projectLabel = isItem ? "アイテム" : "ワールド";
  const sourceFile: SampleFileId = isItem ? "src/Item.tsx" : "src/World.tsx";
  const tree = isItem ? itemTree : worldTree;
  const sourceCode = isItem ? itemCode : worldCode;
  const readmeLines = isItem ? itemReadmeLines : worldReadmeLines;
  const templateTitle = isItem ? "Sample Item" : "サンプルワールド";
  const templateDescription = isItem
    ? "A sample item created with XRift item template"
    : "React Three FiberとRapierで作られたサンプルワールドです";

  const selectSample = (kind: SampleKind, scroll = false) => {
    setSampleKind(kind);
    setActiveFile(kind === "item" ? "src/Item.tsx" : "src/World.tsx");
    if (scroll) {
      requestAnimationFrame(scrollToWorkspace);
    }
  };

  const startDev = () => {
    setRunning(true);
    setLogsOpen(true);
  };
  const stopDev = () => {
    setRunning(false);
  };

  const headerButton =
    "hidden items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 md:flex";

  return (
    <main className="preview-shell overflow-hidden">
      <nav className="preview-nav mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="XRift Studio home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-lg shadow-violet-500/20">
            <Box size={18} strokeWidth={2.2} />
          </span>
          <span className="text-sm font-bold tracking-tight text-zinc-950">XRift Studio</span>
          <span className="hidden rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:inline-flex">
            WEB PREVIEW
          </span>
        </a>
        <div className="flex items-center gap-2">
          <a href="#how-to-use" className="hidden px-3 py-2 text-xs font-medium text-zinc-600 transition hover:text-zinc-950 sm:inline-flex">
            制作の流れ
          </a>
          <a
            href="https://github.com/WebXR-JP/xrift-studio"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-950"
          >
            <GitBranch size={14} />
            ソースコード
            <ExternalLink size={11} className="text-zinc-400" />
          </a>
        </div>
      </nav>

      <section id="top" className="preview-hero relative mx-auto max-w-6xl px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="preview-orb preview-orb-one" />
        <div className="preview-orb preview-orb-two" />
        <div className="relative max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-violet-700 shadow-sm backdrop-blur">
            <Sparkles size={13} />
            有志でつくる XRift 制作アプリ
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.055em] text-zinc-950 sm:text-6xl lg:text-7xl">
            作りたいものを、
            <span className="text-gradient-brand">すぐ XRift へ。</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
            環境を整えるところから、編集、動作確認、公開まで。XRift Studio は、ワールドやアイテムを作る流れをひとつにつなぐ、有志製のデスクトップアプリです。
          </p>
          <div className="mt-7 grid max-w-2xl gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => selectSample("world", true)}
              className={`rounded-2xl border bg-white/75 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md ${
                sampleKind === "world" ? "border-violet-300 ring-2 ring-violet-100" : "border-violet-200"
              }`}
              aria-label="ワールドの画面サンプルを開く"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Globe2 size={18} /></span>
              <div className="mt-3 text-sm font-semibold text-zinc-950">ワールドを作る</div>
              <p className="mt-1 text-xs leading-5 text-zinc-600">人が集まり、歩き回れる XR 空間から作り始められます。</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700">ワールドの画面を見る <ArrowRight size={12} /></span>
            </button>
            <button
              type="button"
              onClick={() => selectSample("item", true)}
              className={`rounded-2xl border bg-white/75 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md ${
                sampleKind === "item" ? "border-cyan-300 ring-2 ring-cyan-100" : "border-cyan-200"
              }`}
              aria-label="アイテムの画面サンプルを開く"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700"><Box size={18} /></span>
              <div className="mt-3 text-sm font-semibold text-zinc-950">アイテムを作る</div>
              <p className="mt-1 text-xs leading-5 text-zinc-600">ワールドへ置いて使える 3D コンポーネントを作り始められます。</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700">アイテムの画面を見る <ArrowRight size={12} /></span>
            </button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/WebXR-JP/xrift-studio/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-500/20 transition hover:-translate-y-0.5 hover:bg-violet-700"
            >
              <Download size={16} />
              デスクトップ版を入手
            </a>
            <button
              type="button"
              onClick={scrollToWorkspace}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-950"
            >
              画面を試す
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> Windows・macOS・Linux</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> 画面サンプルはログイン不要</span>
            <a href="https://xrift.net/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-violet-700">
              XRift 公式サイト
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </section>

      <section id="workspace-preview" className="mx-auto max-w-6xl scroll-mt-8 px-5 pb-24 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-violet-600">画面を試す</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">触ると、制作の流れが見える。</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">ファイルを切り替え、「実行」を押して、編集からプレビューまでのつながりを確かめられます。</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="w-full sm:w-auto">
              <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-500 sm:text-right">表示するサンプル</div>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-white/80 p-1 shadow-sm" role="group" aria-label="表示するプロジェクト種別">
                <button
                  type="button"
                  onClick={() => selectSample("world")}
                  aria-pressed={sampleKind === "world"}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    sampleKind === "world"
                      ? "bg-violet-100 text-violet-800 shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <Globe2 size={13} />
                  World
                </button>
                <button
                  type="button"
                  onClick={() => selectSample("item")}
                  aria-pressed={sampleKind === "item"}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    sampleKind === "item"
                      ? "bg-cyan-100 text-cyan-800 shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <Box size={13} />
                  Item
                </button>
              </div>
            </div>
            <div className="inline-flex self-end items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              デモ表示
            </div>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ---- アプリ本体のウィンドウ (EditorView の再現) ---- */}
          <div className="preview-window overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-violet-950/10">
            <div className="flex h-9 items-center border-b border-zinc-200 bg-zinc-100 px-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 text-center text-[10px] font-medium text-zinc-500">XRift Studio</div>
              <div className="w-12" />
            </div>

            {/* ヘッダー (実アプリと同じ並び) */}
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-600">
                  <ArrowLeft size={11} strokeWidth={2} />
                  <span className="hidden sm:inline">ライブラリ</span>
                </span>
                <span className="hidden text-zinc-300 sm:inline">/</span>
                <span className="max-w-[72px] truncate text-[11px] font-semibold text-zinc-900 sm:max-w-none sm:text-xs">{projectName}</span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    isItem ? "bg-cyan-100 text-cyan-800" : "bg-violet-100 text-violet-800"
                  }`}
                >
                  {isItem ? <Box size={9} strokeWidth={2} /> : <Globe2 size={9} strokeWidth={2} />}
                  {isItem ? "Item" : "World"}
                </span>
                {running && (
                  <span className="hidden items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:flex">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    http://localhost:5173
                    <ExternalLink size={9} strokeWidth={2} />
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {running ? (
                  <button
                    type="button"
                    onClick={stopDev}
                    className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <Square size={9} fill="currentColor" strokeWidth={0} />
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startDev}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    title="ローカルで起動してブラウザでプレビュー"
                  >
                    <Play size={10} fill="currentColor" strokeWidth={0} />
                    実行
                  </button>
                )}
                <span className={headerButton}>
                  <Camera size={11} strokeWidth={2} />
                  サムネイル
                </span>
                <span className={headerButton}>
                  <TerminalSquare size={11} strokeWidth={2} />
                  ターミナル
                </span>
                <span className={headerButton}>
                  <Code2 size={11} strokeWidth={2} />
                  VS Code
                </span>
                <span className="flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm">
                  <Upload size={11} strokeWidth={2} />
                  アップロード
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)]">
              {/* ファイルツリー */}
              <aside className="hidden flex-col border-r border-zinc-200 bg-white sm:flex">
                <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Files</span>
                  <RefreshCw size={11} strokeWidth={2} className="text-zinc-400" />
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {tree.map((row) => {
                    const selected = row.openas === activeFile;
                    const openable = row.openas !== undefined;
                    return (
                      <button
                        type="button"
                        key={row.rel}
                        onClick={openable ? () => setActiveFile(row.openas as SampleFileId) : undefined}
                        className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] ${
                          selected
                            ? "bg-violet-50 font-medium text-violet-700"
                            : openable
                              ? "text-zinc-600 hover:bg-zinc-50"
                              : "cursor-default text-zinc-500"
                        }`}
                        style={{ paddingLeft: `${12 + row.depth * 14}px` }}
                      >
                        <TreeIcon icon={row.icon} selected={selected} />
                        {row.label}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-zinc-200 px-3 py-1.5 text-[9px] text-zinc-400">
                  projects/{projectName}
                </div>
              </aside>

              {/* エディタ領域 */}
              <div className="flex min-w-0 flex-col">
                <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50 p-2 sm:hidden">
                  {tree.filter((row) => row.openas).map((row) => {
                    const selected = row.openas === activeFile;
                    return (
                      <button
                        type="button"
                        key={`mobile-${row.rel}`}
                        onClick={() => setActiveFile(row.openas as SampleFileId)}
                        className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                          selected
                            ? "bg-violet-100 text-violet-700"
                            : "bg-white text-zinc-600"
                        }`}
                      >
                        {row.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-700">
                    {activeFile === "xrift.json" ? (
                      <FileJson size={13} className="text-violet-500" />
                    ) : activeFile === "README.md" ? (
                      <FileText size={13} className="text-violet-500" />
                    ) : (
                      <FileCode2 size={13} className="text-violet-500" />
                    )}
                    <span className="truncate">{activeFile}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    保存済み
                  </div>
                </div>

                <div className="h-[300px] overflow-auto bg-white sm:h-[340px]">
                  {activeFile === sourceFile && (
                    <div className="preview-code p-4 font-mono text-[10.5px] leading-5 sm:text-[11px]">
                      {sourceCode.map((line, i) => (
                        <div key={i} className="flex min-w-max">
                          <span className="mr-4 w-5 select-none text-right text-zinc-300">{i + 1}</span>
                          <code>
                            {line.map((tok, j) => (
                              <span key={j} className={tok[1] ?? "text-zinc-700"}>{tok[0]}</span>
                            ))}
                          </code>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeFile === "xrift.json" && (
                    <div className="p-4">
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-zinc-900">公開情報</div>
                        <div className="mt-0.5 text-[10px] text-zinc-500">
                          XRift の{projectLabel}一覧で表示されるタイトルと説明文です。
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-medium text-zinc-700">{projectLabel}タイトル</div>
                            <code className="text-[9px] text-zinc-400">{sampleKind}.title</code>
                          </div>
                          <div className="mt-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-900">{templateTitle}</div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-zinc-700">{projectLabel}の説明</span>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">テンプレートのまま</span>
                          </div>
                          <div className="mt-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] leading-5 text-zinc-500">
                            {templateDescription}
                          </div>
                          <div className="mt-1 text-[10px] text-amber-700">アップロード前に編集を求められます。</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-zinc-700">サムネイル</div>
                          <div className="mt-1 flex items-center gap-3">
                            <div
                              className={`flex h-12 w-20 items-center justify-center rounded-md border border-zinc-200 bg-gradient-to-br ${
                                isItem
                                  ? "from-amber-100 via-orange-100 to-cyan-100"
                                  : "from-indigo-100 via-violet-100 to-fuchsia-100"
                              }`}
                            >
                              {isItem ? <Box size={15} className="text-orange-500" /> : <FileImage size={14} className="text-violet-400" />}
                            </div>
                            <div className="text-[10px] leading-4 text-zinc-500">
                              public/thumbnail.png
                              <br />{isItem ? "アイテムカードとインベントリ" : "ワールドカード"}に表示されます
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeFile === "README.md" && (
                    <div className="p-4 font-mono text-[11px] leading-6 text-zinc-700">
                      {readmeLines.map((line, i) => (
                        <div key={i} className={line.startsWith("#") ? "font-semibold text-zinc-900" : ""}>
                          {line || " "}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ログペイン (実アプリの LogsPane) */}
                {logsOpen ? (
                  <div className="border-t border-zinc-200">
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-medium">Logs</span>
                        {running && (
                          <span className="flex items-center gap-1 text-violet-600">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                            実行中
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLogsOpen(false)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        たたむ
                      </button>
                    </div>
                    <div className="h-24 overflow-y-auto bg-white px-4 py-2 font-mono text-[10px] leading-5">
                      {running ? (
                        devLogs.map((l, i) => (
                          <div key={i} className={l.cls}>{l.text}</div>
                        ))
                      ) : (
                        <div className="text-zinc-400">コマンドを実行するとここにログが流れます。</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-8 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4">
                    <button
                      type="button"
                      onClick={() => setLogsOpen(true)}
                      className="flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-800"
                    >
                      <span className="font-medium">Logs</span>
                      {running && (
                        <span className="flex items-center gap-1 text-[10px] text-violet-600">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                          実行中
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogsOpen(true)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-700"
                    >
                      展開
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[10px] text-zinc-500">
              これは画面を試すためのデモです。ファイル保存、CLI 実行、XRift への公開はデスクトップ版で動作します。
            </div>
          </div>

          {/* ---- ブラウザプレビューのウィンドウ ---- */}
          <div className="flex flex-col gap-3">
            <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-violet-950/10 ${running ? "" : "opacity-90"}`}>
              <div className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-300" />
                  <span className="h-2 w-2 rounded-full bg-zinc-300" />
                </div>
                <div className="flex flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[10px] text-zinc-500">
                  <Globe2 size={11} className={running ? "text-emerald-500" : "text-zinc-400"} />
                  localhost:5173
                </div>
                <RefreshCw size={11} className="text-zinc-400" />
              </div>
              {running ? (
                isItem ? (
                  <div className="preview-world preview-world-running relative h-64 overflow-hidden bg-[#101827]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(34,211,238,0.22),transparent_42%)]" />
                    <div className="preview-grid absolute inset-x-[-20%] bottom-[-18%] h-1/2 rotate-[-6deg] opacity-50" />
                    <div className="absolute bottom-[70px] left-1/2 h-20 w-14 -translate-x-1/2 rotate-45 rounded-xl bg-gradient-to-br from-amber-200 via-orange-400 to-fuchsia-700 shadow-[0_0_42px_rgba(251,146,60,0.72)]">
                      <div className="absolute inset-2 rounded-lg border border-white/35 bg-gradient-to-br from-white/50 to-transparent" />
                    </div>
                    <div className="absolute bottom-10 left-1/2 h-7 w-28 -translate-x-1/2 rounded-[50%] border border-cyan-200/40 bg-gradient-to-b from-slate-400 to-slate-700 shadow-[0_10px_22px_rgba(0,0,0,0.45)]" />
                    <div className="absolute bottom-6 left-1/2 h-8 w-24 -translate-x-1/2 rounded-b-xl bg-gradient-to-b from-slate-600 to-slate-900" />
                    <div className="absolute left-3 top-3 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] font-medium text-cyan-100">
                      Item 単体確認
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[9px] text-white/60">
                      <span>{projectName}</span>
                      <span>アイテム 3D プレビュー</span>
                    </div>
                  </div>
                ) : (
                  <div className="preview-world preview-world-running relative h-64 overflow-hidden bg-[#0d1025]">
                    <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-indigo-900/60 to-transparent" />
                    <div className="preview-moon absolute right-6 top-6 h-8 w-8 rounded-full bg-gradient-to-br from-white to-violet-300 shadow-[0_0_25px_rgba(196,181,253,0.7)]" />
                    <div className="preview-grid absolute inset-x-[-20%] bottom-[-15%] h-1/2 rotate-[-10deg]" />
                    <div className="preview-planet absolute bottom-12 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-gradient-to-br from-fuchsia-400 via-violet-500 to-indigo-950 shadow-[0_0_40px_rgba(139,92,246,0.65)]" />
                    <div className="preview-ring absolute bottom-20 left-1/2 h-10 w-40 -translate-x-1/2 rotate-[-14deg] rounded-[50%] border-2 border-cyan-300/70" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[9px] text-white/60">
                      <span>{projectName}</span>
                      <span>ワールド 3D プレビュー</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 bg-zinc-50 px-6 text-center">
                  {isItem ? <Box size={18} className="text-cyan-400" /> : <Play size={18} className="text-zinc-300" />}
                  <p className="text-[11px] leading-5 text-zinc-500">
                    「実行」を押すとローカルサーバーが起動し、{projectLabel}の 3D プレビューが開きます。
                  </p>
                </div>
              )}
            </div>
            <p className="px-1 text-[11px] leading-5 text-zinc-500">
              デスクトップ版では、保存した変更がブラウザへ反映されます。アプリとプレビューを並べたまま制作を続けられます。
            </p>
          </div>
        </div>
      </section>

      <section id="how-to-use" className="bg-white/60 px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold tracking-[0.18em] text-violet-600">制作の流れ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950">迷わず、公開まで進める。</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-600">準備、作成、確認、公開が同じ流れの中にあるので、次に開くツールや打つコマンドを探し直す必要がありません。</p>
          </div>
          <div className="relative mt-12">
            <div className="absolute left-5 right-5 top-5 hidden h-px bg-gradient-to-r from-violet-200 via-cyan-200 to-fuchsia-200 lg:block" />
            <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="relative pl-16 lg:pl-0">
                  <div className={`absolute left-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${step.accent} text-white shadow-lg lg:relative`}><Icon size={20} /></div>
                  <p className="text-[10px] font-bold tracking-[0.16em] text-zinc-400 lg:mt-6">{step.eyebrow}</p>
                  <h3 className="mt-2 text-base font-bold text-zinc-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{step.text}</p>
                </article>
              );
            })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-10 text-white shadow-2xl shadow-violet-950/20 sm:px-10 sm:py-14">
          <div className="preview-cta-glow" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300"><CircleHelp size={15} /> デスクトップ版</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">作り始める準備ができたら。</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">デスクトップ版は GitHub Releases で配布しています。お使いの OS に合うファイルを選び、XRift Studio を起動してください。</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="https://github.com/WebXR-JP/xrift-studio/releases/latest" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-violet-100"><Download size={15} /> 最新リリースを見る</a>
              <a href="https://github.com/WebXR-JP/xrift-studio#readme" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/5"><FileText size={15} /> 使い方を読む</a>
            </div>
            <p className="mt-5 text-xs leading-6 text-zinc-500">XRift Studio は XRift 公式とは無関係の有志製ツールです。</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200/70 px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>XRift Studio は有志が制作する非公式デスクトップアプリです。</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="https://xrift.net/" target="_blank" rel="noreferrer" className="hover:text-violet-700">XRift 公式サイト</a>
            <a href="https://github.com/WebXR-JP/xrift-studio" target="_blank" rel="noreferrer" className="hover:text-violet-700">GitHub</a>
            <a href="https://github.com/WebXR-JP/xrift-studio/blob/main/LICENSE" target="_blank" rel="noreferrer" className="hover:text-violet-700">MIT License</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
