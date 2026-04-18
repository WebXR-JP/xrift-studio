import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { tauri, type RuntimeStatus } from "../lib/tauri";
import { BrandMark } from "./Brand";

type SetupProgress = {
  step: string;
  percent: number;
  message: string;
};

type Props = {
  status: RuntimeStatus;
  onReady: (status: RuntimeStatus) => void;
};

export function SetupView({ status, onReady }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<SetupProgress[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let mounted = true;
    listen<SetupProgress>("setup-progress", (event) => {
      if (!mounted) return;
      setProgress(event.payload);
      setLogs((prev) => [...prev, event.payload]);
    }).then((un) => {
      unlistenRef.current = un;
    });
    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, []);

  const start = async () => {
    setRunning(true);
    setError(null);
    setLogs([]);
    setProgress(null);
    try {
      const next = await tauri.setupRuntime();
      if (next.ready) onReady(next);
      else setError("セットアップが完了しませんでした。");
    } catch (e) {
      setError(`${e}`);
    } finally {
      setRunning(false);
    }
  };

  const percent = Math.min(100, Math.max(0, progress?.percent ?? 0));

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-aurora px-8">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-[10%] top-[15%] h-64 w-64 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="absolute right-[15%] top-[10%] h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute bottom-[10%] left-[30%] h-72 w-72 rounded-full bg-pink-400/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg animate-scale-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={72} animate />
          <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-zinc-900">
            <span className="text-gradient-brand">XRift Studio</span> へようこそ
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            XRift の非公式クライアント — 環境構築を高速化
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            ※ 本アプリは XRift 公式とは無関係の有志製ツールです
          </p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-brand backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Sparkles size={14} className="text-brand-500" strokeWidth={2} />
            <span>準備はアプリにおまかせ。ワンクリックで始められます</span>
          </div>

          <ul className="mt-4 space-y-2.5 text-sm">
            <SetupItem done={status.nodeInstalled} label="Node.js v24 LTS" hint="Node.js 本体と npm を同梱（約 30MB）" />
            <SetupItem done={status.xriftInstalled} label="@xrift/cli" hint="ワールドの作成・公開に使う公式ツール" />
          </ul>

          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
            <div>インストール先</div>
            <div className="mt-0.5 truncate font-mono text-zinc-700" title={status.paths.appRoot}>
              {status.paths.appRoot}
            </div>
          </div>

          {running && (
            <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 animate-fade-in">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-brand-700">
                  <Loader2 size={12} className="animate-spin" strokeWidth={2.25} />
                  {progress?.step ?? "..."}
                </span>
                <span className="tabular-nums text-brand-500">{percent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full gradient-brand transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-2 text-[12px] text-brand-900">{progress?.message}</div>
              {logs.length > 2 && (
                <div className="scrollbar-thin mt-3 max-h-28 overflow-y-auto rounded bg-white/70 p-2 font-mono text-[10px] leading-4 text-zinc-500">
                  {logs.slice(-10).map((l, i) => (
                    <div key={i}>
                      [{l.step}] {l.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 animate-fade-in">
              <div className="font-semibold">エラー</div>
              <div className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{error}</div>
            </div>
          )}

          <button
            type="button"
            onClick={start}
            disabled={running}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-3 text-sm font-semibold text-white shadow-brand-lg transition hover:shadow-brand-lg hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" strokeWidth={2.25} />
                セットアップ中…
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={2.25} />
                セットアップを開始
              </>
            )}
          </button>
        </div>

        <div className="mt-5 text-center text-[11px] text-zinc-400">
          お使いのシステムには影響しません。すべてアプリ専用のフォルダで完結します。
        </div>
      </div>
    </div>
  );
}

function SetupItem({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="shrink-0">
        {done ? (
          <CheckCircle2 size={18} className="text-emerald-500" strokeWidth={2} />
        ) : (
          <span className="block h-[18px] w-[18px] rounded-full border-2 border-zinc-300" />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-zinc-800">{label}</span>
        <span className="block text-[11px] text-zinc-500">{hint}</span>
      </span>
      {done && <span className="text-[11px] font-medium text-emerald-600">導入済み</span>}
    </li>
  );
}
