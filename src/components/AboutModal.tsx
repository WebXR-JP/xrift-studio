import { useEffect, useState } from "react";
import { X, ExternalLink, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tauri } from "../lib/tauri";
import { xrift } from "../lib/xrift-cli";
import { BrandMark } from "./Brand";

type Props = {
  open: boolean;
  onClose: () => void;
};

type VersionState = {
  app: string | null;
  node: string | null;
  xrift: string | null;
  xriftLoading: boolean;
};

export function AboutModal({ open, onClose }: Props) {
  const [v, setV] = useState<VersionState>({
    app: null,
    node: null,
    xrift: null,
    xriftLoading: true,
  });

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const ver = await tauri.getVersions();
        if (mounted) {
          setV((prev) => ({
            ...prev,
            app: ver.appVersion,
            node: ver.nodeVersion,
          }));
        }
      } catch {
        /* ignore */
      }
      try {
        const xv = await xrift.version(() => {});
        if (mounted) {
          setV((prev) => ({ ...prev, xrift: xv, xriftLoading: false }));
        }
      } catch {
        if (mounted) setV((prev) => ({ ...prev, xriftLoading: false }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  const reloadXrift = async () => {
    setV((prev) => ({ ...prev, xriftLoading: true }));
    const xv = await xrift.version(() => {}).catch(() => null);
    setV((prev) => ({ ...prev, xrift: xv, xriftLoading: false }));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-[460px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800"
          >
            <X size={14} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <div className="text-lg font-semibold tracking-tight text-zinc-900">
                XRift Studio
              </div>
              <div className="text-xs text-zinc-500">
                XRift の非公式クライアント — 環境構築を高速化
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            本アプリは XRift 公式とは無関係の有志による非公式クライアントです。環境構築の手間を減らすことを目的としています。
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Versions
          </div>
          <dl className="mt-2 divide-y divide-zinc-100">
            <Row label="XRift Studio" value={v.app} hint="アプリ本体" />
            <Row label="Node.js" value={v.node} hint="同梱ランタイム (LTS)" />
            <Row
              label="@xrift/cli"
              value={v.xrift}
              loading={v.xriftLoading}
              hint="プロジェクト作成 / アップロード"
              onReload={reloadXrift}
            />
          </dl>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={() => openUrl("https://docs.xrift.net/").catch(() => {})}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-brand-700"
          >
            <ExternalLink size={11} strokeWidth={2} />
            ドキュメント
          </button>
          <button
            type="button"
            onClick={() => openUrl("https://github.com/WebXR-JP").catch(() => {})}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-brand-700"
          >
            <ExternalLink size={11} strokeWidth={2} />
            GitHub (WebXR-JP)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  loading,
  hint,
  onReload,
}: {
  label: string;
  value: string | null;
  loading?: boolean;
  hint?: string;
  onReload?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-800">{label}</div>
        {hint && <div className="text-[11px] text-zinc-400">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">
        {loading ? (
          <span className="font-mono text-[12px] text-zinc-400">確認中…</span>
        ) : value ? (
          <span className="font-mono text-[12px] font-medium text-zinc-900">
            {value}
          </span>
        ) : (
          <span className="font-mono text-[12px] text-zinc-400">未取得</span>
        )}
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title="再取得"
          >
            <RefreshCw size={10} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
