import { useState } from "react";
import {
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  ExternalLink,
  Eye,
  FileCode2,
  Folder,
  GitBranch,
  Globe2,
  MonitorPlay,
  Package,
  Play,
  Sparkles,
  TerminalSquare,
  Upload,
  WandSparkles,
} from "lucide-react";

const files = [
  { name: "World.tsx", icon: FileCode2 },
  { name: "materials.ts", icon: Code2 },
  { name: "README.md", icon: FileCode2 },
];

const codeLines = [
  ["import", " Scene, { NeonGarden }", " from", " \"./scene\";"],
  ["", ""],
  ["export", " default", " function", " World() {"],
  ["  return", " ("],
  ["    <Scene", " environment=\"night\"", " camera=\"orbit\""],
  ["      <NeonGarden", " color=\"#8b5cf6\"", " flowers={24}"],
  ["        fog=\"soft\"", " interactive"],
  ["      />"],
  ["    </Scene>"],
  ["  );"],
  ["}"],
];

const featureCards = [
  {
    icon: Package,
    eyebrow: "SETUP",
    title: "準備はアプリにおまかせ",
    text: "Node.js と @xrift/cli を専用フォルダへ用意。既存の環境を汚しません。",
    accent: "from-violet-500 to-indigo-500",
  },
  {
    icon: Code2,
    eyebrow: "CREATE",
    title: "コードを書いて、すぐ確認",
    text: "内蔵エディタから実行。保存した変更はブラウザのプレビューへ反映されます。",
    accent: "from-cyan-500 to-blue-500",
  },
  {
    icon: Upload,
    eyebrow: "PUBLISH",
    title: "できたワールドを公開",
    text: "XRift CLI とつながるデスクトップアプリから、ワンクリックでアップロード。",
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
  const [activeFile, setActiveFile] = useState("World.tsx");
  const [isRunning, setIsRunning] = useState(true);

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
          <a href="#features" className="hidden px-3 py-2 text-xs font-medium text-zinc-600 transition hover:text-zinc-950 sm:inline-flex">
            できること
          </a>
          <a
            href="https://github.com/WebXR-JP/xrift-studio"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-950"
          >
            <GitBranch size={14} />
            GitHub
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
            XRift ワールド制作のためのデスクトップアプリ
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.055em] text-zinc-950 sm:text-6xl lg:text-7xl">
            アイデアを、
            <span className="text-gradient-brand">すぐにワールドへ。</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
            XRift Studio は、セットアップから編集、ブラウザ確認、公開までをひとつにつなぐ非公式クライアントです。ここでは、ブラウザで動く部分をサンプルとして体験できます。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scrollToWorkspace}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-500/20 transition hover:-translate-y-0.5 hover:bg-violet-700"
            >
              サンプルを開く
              <ArrowRight size={16} />
            </button>
            <a
              href="https://xrift.net/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-950"
            >
              XRift について
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> Web で閲覧できます</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> ログイン不要</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> MIT License</span>
          </div>
        </div>
      </section>

      <section id="workspace-preview" className="mx-auto max-w-6xl scroll-mt-8 px-5 pb-24 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-600">Interactive sample</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">制作画面をブラウザで見る</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            サンプルモード
          </div>
        </div>

        <div className="preview-window overflow-hidden rounded-2xl border border-zinc-800/10 bg-zinc-950 shadow-2xl shadow-violet-950/20">
          <div className="flex h-11 items-center justify-between border-b border-white/10 bg-zinc-900 px-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="rounded-md bg-white/5 px-3 py-1 text-[10px] font-medium text-zinc-400">neon-garden / XRift Studio</div>
            <div className="w-12" />
          </div>

          <div className="grid min-h-[520px] lg:grid-cols-[190px_minmax(0,1fr)_minmax(300px,0.9fr)]">
            <aside className="border-b border-white/10 bg-zinc-900/70 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Folder size={14} className="text-violet-300" />
                neon-garden
              </div>
              <div className="space-y-1">
                {files.map((file) => {
                  const Icon = file.icon;
                  const active = activeFile === file.name;
                  return (
                    <button
                      type="button"
                      key={file.name}
                      onClick={() => setActiveFile(file.name)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${active ? "bg-violet-500/20 text-violet-200" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}
                    >
                      <Icon size={14} />
                      {file.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-8 border-t border-white/10 pt-4 text-[10px] leading-5 text-zinc-500">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-zinc-400"><TerminalSquare size={13} /> Runtime</div>
                Node.js 24 LTS
                <br />@xrift/cli 0.24.2
              </div>
            </aside>

            <div className="min-w-0 border-b border-white/10 bg-[#111116] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-zinc-300"><FileCode2 size={14} className="text-violet-300" /> {activeFile}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Saved</div>
              </div>
              <div className="preview-code overflow-auto p-5 font-mono text-[11px] leading-6 sm:text-xs">
                {codeLines.map((line, index) => (
                  <div key={`${line.join("")}-${index}`} className="flex min-w-max">
                    <span className="mr-5 w-4 select-none text-right text-zinc-700">{index + 1}</span>
                    <code>
                      <span className="text-violet-300">{line[0]}</span>
                      <span className="text-zinc-300">{line[1]}</span>
                      <span className="text-cyan-300">{line[2]}</span>
                      <span className="text-amber-200">{line[3]}</span>
                    </code>
                  </div>
                ))}
                <div className="mt-5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-zinc-500">
                  <span className="text-emerald-400">✓</span> Changes are ready to preview
                </div>
              </div>
            </div>

            <div className="bg-zinc-100 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700"><Eye size={14} className="text-violet-600" /> World preview</div>
                <button
                  type="button"
                  onClick={() => setIsRunning((running) => !running)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${isRunning ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600"}`}
                >
                  <Play size={11} fill="currentColor" /> {isRunning ? "Running" : "Run"}
                </button>
              </div>
              <div className={`preview-world relative min-h-[360px] overflow-hidden rounded-xl border border-violet-200/50 bg-[#0d1025] ${isRunning ? "preview-world-running" : ""}`}>
                <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-indigo-900/60 to-transparent" />
                <div className="preview-moon absolute right-8 top-8 h-10 w-10 rounded-full bg-gradient-to-br from-white to-violet-300 shadow-[0_0_30px_rgba(196,181,253,0.7)]" />
                <div className="preview-grid absolute inset-x-[-20%] bottom-[-15%] h-1/2 rotate-[-10deg]" />
                <div className="preview-planet absolute bottom-16 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-gradient-to-br from-fuchsia-400 via-violet-500 to-indigo-950 shadow-[0_0_50px_rgba(139,92,246,0.65)]" />
                <div className="preview-ring absolute bottom-28 left-1/2 h-14 w-52 -translate-x-1/2 rotate-[-14deg] rounded-[50%] border-2 border-cyan-300/70" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[10px] text-white/60">
                  <span className="inline-flex items-center gap-1.5"><Globe2 size={12} /> localhost:1420</span>
                  <span>neon-garden</span>
                </div>
                {!isRunning && <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/55 text-xs font-semibold text-white">Preview paused</div>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-zinc-900 px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] text-zinc-500"><MonitorPlay size={13} className="text-cyan-300" /> Web ではここまでを体験できます</div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500"><WandSparkles size={13} className="text-violet-300" /> Desktop app unlocks the full workflow</div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-white/60 px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-600">From idea to XRift</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950">Web で見えるのは、制作体験の入口。</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-600">ログインやローカルファイル操作はデスクトップ版の役割。GitHub Pages では「何ができるソフトなのか」が伝わるところに絞っています。</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {featureCards.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="group rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-900/10">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-lg`}><Icon size={20} /></div>
                  <p className="mt-6 text-[10px] font-bold tracking-[0.2em] text-zinc-400">{feature.eyebrow}</p>
                  <h3 className="mt-2 text-base font-bold text-zinc-950">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{feature.text}</p>
                  <div className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 transition group-hover:gap-2">詳しく見る <ChevronRight size={13} /></div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-10 text-white shadow-2xl shadow-violet-950/20 sm:px-10 sm:py-14">
          <div className="preview-cta-glow" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300"><CircleHelp size={15} /> Desktop app preview</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">続きは GitHub Releases から。</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">Web プレビューは雰囲気と制作フローを紹介するためのものです。実際の CLI セットアップ、ログイン、ファイル編集、公開は Tauri アプリで動作します。</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="https://github.com/WebXR-JP/xrift-studio/releases/latest" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-violet-100">最新版をダウンロード <ArrowRight size={15} /></a>
              <a href="https://github.com/WebXR-JP/xrift-studio" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/5"><GitBranch size={15} /> ソースを見る</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200/70 px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>XRift Studio — unofficial community client</span>
          <span>Web preview / Tauri desktop app</span>
        </div>
      </footer>
    </main>
  );
}
