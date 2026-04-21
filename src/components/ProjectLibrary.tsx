import { useMemo, useState } from "react";
import { RefreshCw, Sparkles, Info, ExternalLink } from "lucide-react";
import { getBackend, type Project, type Whoami } from "../lib/backend";
import { ProjectCard, NewProjectCard } from "./ProjectCard";
import { BrandMark, BrandWordmark } from "./Brand";
import { AboutModal } from "./AboutModal";
import { UserMenu } from "./UserMenu";
import { ThumbnailEditorModal } from "./ThumbnailEditorModal";

type Props = {
  projects: Project[];
  loading: boolean;
  user: Whoami | null;
  userLoading: boolean;
  busy: boolean;
  projectsRoot: string;
  onOpen: (p: Project) => void;
  onNew: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

export function ProjectLibrary({
  projects,
  loading,
  user,
  userLoading,
  busy,
  projectsRoot,
  onOpen,
  onNew,
  onLogin,
  onLogout,
  onRefresh,
}: Props) {
  const backend = getBackend();
  const hello = useMemo(() => greeting(), []);
  const displayName = user?.displayName;
  const [showAbout, setShowAbout] = useState(false);
  const [editingThumb, setEditingThumb] = useState<Project | null>(null);
  const [thumbRefresh, setThumbRefresh] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-aurora-subtle text-zinc-900">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/80 px-6 py-3.5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <BrandWordmark sub="プロジェクトライブラリ" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:bg-zinc-50"
            title="バージョン情報"
          >
            <Info size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
            title="再読み込み"
          >
            <RefreshCw size={13} strokeWidth={2} className={loading ? "animate-spin" : ""} />
          </button>
          <UserMenu
            user={user}
            loading={userLoading}
            busy={busy}
            onLogin={onLogin}
            onLogout={onLogout}
          />
        </div>
      </header>
      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      {editingThumb && (
        <ThumbnailEditorModal
          project={editingThumb}
          onClose={() => setEditingThumb(null)}
          onChanged={() => setThumbRefresh((k) => k + 1)}
        />
      )}

      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Hero */}
          <div className="mb-8 flex items-end justify-between gap-6 animate-fade-in">
            <div>
              <div className="text-xs font-medium text-brand-600">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={12} strokeWidth={2.25} />
                  XRift Studio
                </span>
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-zinc-900">
                {hello}
                {displayName && (
                  <>
                    、<span className="text-gradient-brand">{displayName}</span>
                    <span className="text-zinc-400"> さん</span>
                  </>
                )}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {displayName
                  ? "今日はどんなワールドを作りますか？"
                  : "XR ワールドを作って、世界に公開しましょう。"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs text-zinc-500">
              <div className="tabular-nums">{projects.length} 件のプロジェクト</div>
              <div className="truncate font-mono text-[10px] text-zinc-400" title={projectsRoot}>
                {projectsRoot}
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => backend.openUrl("https://xrift.net/").catch(() => {})}
                  className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                  title="XRift の公開ページを開く"
                >
                  <ExternalLink size={10} strokeWidth={2} />
                  XRift で確認
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            style={{ animation: "fade-in 0.5s 0.1s both cubic-bezier(0.22, 1, 0.36, 1)" }}
          >
            <NewProjectCard onClick={onNew} />
            {projects.map((p, i) => (
              <div
                key={p.path}
                style={{ animation: `fade-in 0.5s ${0.15 + i * 0.04}s both cubic-bezier(0.22, 1, 0.36, 1)` }}
              >
                <ProjectCard
                  project={p}
                  onOpen={() => onOpen(p)}
                  onEditThumbnail={() => setEditingThumb(p)}
                  refreshKey={thumbRefresh}
                />
              </div>
            ))}
          </div>

          {!loading && projects.length === 0 && (
            <div className="mx-auto mt-12 max-w-md text-center">
              <div className="relative mx-auto mb-4 h-20 w-20">
                <div className="absolute inset-0 rounded-2xl gradient-brand-soft" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={28} className="text-brand-500" strokeWidth={1.75} />
                </div>
              </div>
              <div className="text-sm text-zinc-700">
                まだワールドがありません。
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                「+ 新規ワールド」から、あなたの最初の XR 空間を作ってみましょう。
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
