import { useEffect, useMemo, useState } from "react";
import {
  Bug,
  Check,
  Clipboard,
  ExternalLink,
  ImageDown,
  MessageCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import { arch, platform, version as osVersion } from "@tauri-apps/plugin-os";
import { xrift } from "../lib/xrift-cli";
import { captureCurrentAppAsPng } from "../lib/screenshot";
import { tauri } from "../lib/tauri";
import {
  XRIFT_STUDIO_HELP_GPT_URL,
  XRIFT_STUDIO_NEW_ISSUE_URL,
} from "../lib/support-links";
import {
  createSupportReportDraft,
  sanitizeSupportErrorDetail,
  sanitizeSupportErrorMessage,
  type SupportReportContext,
} from "../lib/support-report";
import { useToast } from "./Toast";

type Props = {
  open: boolean;
  projectCount?: number;
  context?: SupportReportContext;
  onClose: () => void;
};

type Environment = {
  appVersion: string | null;
  nodeVersion: string | null;
  cliVersion: string | null;
  os: string | null;
  osVersion: string | null;
  arch: string | null;
};

const EMPTY_ENVIRONMENT: Environment = {
  appVersion: null,
  nodeVersion: null,
  cliVersion: null,
  os: null,
  osVersion: null,
  arch: null,
};

function valueOrUnknown(value: string | number | null) {
  return value === null || value === "" ? "取得できませんでした" : String(value);
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("クリップボードへコピーできませんでした。");
}

export function SupportReportModal({
  open,
  projectCount = 0,
  context,
  onClose,
}: Props) {
  const toast = useToast();
  const [environment, setEnvironment] = useState(EMPTY_ENVIRONMENT);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [copied, setCopied] = useState(false);
  const sanitizedErrorMessage = useMemo(
    () => sanitizeSupportErrorMessage(context?.errorMessage),
    [context?.errorMessage],
  );
  const sanitizedErrorDetail = useMemo(
    () => sanitizeSupportErrorDetail(context?.errorDetail),
    [context?.errorDetail],
  );
  const sanitizedDiagnostics = useMemo(
    () =>
      context?.diagnostics
        ?.map((diagnostic) => sanitizeSupportErrorMessage(diagnostic))
        .filter((diagnostic): diagnostic is string => Boolean(diagnostic)) ?? [],
    [context?.diagnostics],
  );

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    void Promise.all([
      tauri.getVersions().catch(() => null),
      xrift.version(() => {}).catch(() => null),
      Promise.resolve().then(() => {
        try {
          return {
            os: platform(),
            osVersion: osVersion(),
            arch: arch(),
          };
        } catch {
          return { os: null, osVersion: null, arch: null };
        }
      }),
    ]).then(([versions, cliVersion, os]) => {
      if (!mounted) return;
      setEnvironment({
        appVersion: versions?.appVersion ?? null,
        nodeVersion: versions?.nodeVersion ?? null,
        cliVersion,
        ...os,
      });
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !copying && !savingScreenshot) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [copying, onClose, open, savingScreenshot]);

  const environmentText = useMemo(
    () => `XRift Studioのヘルプセンターに相談したいです。

以下はXRift Studioから自動取得した環境情報です。アクセストークン、Cookie、パスワード、プロジェクトの絶対パスは含めていません。

## 環境情報
- XRift Studio: ${valueOrUnknown(environment.appVersion)}
- OS: ${valueOrUnknown(environment.os)} ${valueOrUnknown(environment.osVersion)}
- CPU architecture: ${valueOrUnknown(environment.arch)}
- Node.js: ${valueOrUnknown(environment.nodeVersion)}
- @xrift/cli: ${valueOrUnknown(environment.cliVersion)}
- プロジェクト数: ${projectCount}
- 現在の画面: ${context?.currentScreen ?? "プロジェクト一覧"}
${sanitizedErrorMessage ? `\n## 発生したエラー\n${sanitizedErrorMessage}\n` : ""}
${sanitizedErrorDetail ? `\n## エラーの詳細な出力\n\`\`\`\n${sanitizedErrorDetail}\n\`\`\`\n` : ""}
${sanitizedDiagnostics.length > 0 ? `\n## 関連する診断\n${sanitizedDiagnostics.map((diagnostic) => `- ${diagnostic}`).join("\n")}\n` : ""}

${createSupportReportDraft(context, sanitizedErrorMessage)}
`,
    [
      context?.currentScreen,
      context?.failureTiming,
      context?.project?.description,
      context?.project?.name,
      environment,
      projectCount,
      sanitizedDiagnostics,
      sanitizedErrorDetail,
      sanitizedErrorMessage,
    ],
  );

  if (!open) return null;

  const copyEnvironment = async () => {
    setCopying(true);
    try {
      await copyText(environmentText);
      setCopied(true);
      toast({
        kind: "success",
        title: "相談情報をコピーしました",
        description: "ChatGPTまたはGitHubの入力欄へ貼り付けてください。",
      });
      window.setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      toast({ kind: "error", title: "コピーに失敗しました", description: String(error) });
    } finally {
      setCopying(false);
    }
  };

  const openWithEnvironment = async (url: string, label: string) => {
    setCopying(true);
    try {
      await copyText(environmentText);
      if (tauri.isAvailable()) {
        await tauri.openUrl(url);
      } else {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) window.location.assign(url);
      }
      toast({
        kind: "info",
        title: `${label}を開きました`,
        description: "コピーした環境情報を入力欄へ貼り付けてください。",
      });
    } catch (error) {
      toast({ kind: "error", title: `${label}を開けませんでした`, description: String(error) });
    } finally {
      setCopying(false);
    }
  };

  const saveScreenshot = async () => {
    setSavingScreenshot(true);
    try {
      const dataUrl = await captureCurrentAppAsPng();
      if (tauri.isAvailable()) {
        const path = await tauri.saveScreenshot(dataUrl);
        if (path) {
          toast({ kind: "success", title: "スクリーンショットを保存しました", description: path });
        }
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "xrift-studio-support.png";
        link.click();
        toast({ kind: "success", title: "スクリーンショットを保存しました" });
      }
    } catch (error) {
      toast({
        kind: "error",
        title: "スクリーンショットを保存できませんでした",
        description: String(error),
      });
    } finally {
      setSavingScreenshot(false);
    }
  };

  return (
    <div
      data-app-modal-backdrop
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/30 px-4 py-4 backdrop-blur-sm animate-fade-in"
      data-support-overlay="true"
      onClick={() => !copying && !savingScreenshot && onClose()}
    >
      <div
        data-app-modal-surface
        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div data-app-modal-header className="relative gradient-brand-soft px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={copying || savingScreenshot}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-40"
            aria-label="ヘルプと報告を閉じる"
          >
            <X size={15} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3 pr-7">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70 text-brand-700 shadow-sm">
              <MessageCircle size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id="support-report-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                ヘルプと報告
              </h2>
              <p className="text-xs text-zinc-600">
                環境情報を添えて、相談内容をまとめられます。
              </p>
            </div>
          </div>
        </div>

        <div data-app-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            相談先
          </div>
          <div className="mt-2 grid gap-2">
            <button
              type="button"
              onClick={() => void openWithEnvironment(XRIFT_STUDIO_HELP_GPT_URL, "ヘルプセンターGPT")}
              disabled={loading || copying || savingScreenshot}
              className="flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2.5 text-left text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            >
              <MessageCircle size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">
                <span className="block">ヘルプセンターGPTを開く</span>
                <span className="mt-0.5 block text-[10px] font-normal text-white/75">相談情報をコピーしてChatGPTの相談ページを開く</span>
              </span>
              <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void openWithEnvironment(XRIFT_STUDIO_NEW_ISSUE_URL, "GitHub Issue")}
              disabled={loading || copying || savingScreenshot}
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            >
              <Bug size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">
                <span className="block">GitHub Issueを作成</span>
                <span className="mt-0.5 block text-[10px] font-normal text-zinc-400">相談情報をコピーしてIssue画面を開く</span>
              </span>
              <ExternalLink size={12} className="shrink-0 text-zinc-400" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            相談に添付する情報
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void copyEnvironment()}
              disabled={copying || savingScreenshot || loading}
              className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            >
              {copied ? <Check size={13} className="text-emerald-600" aria-hidden="true" /> : <Clipboard size={13} aria-hidden="true" />}
              {copied ? "コピーしました" : "相談情報をコピー"}
            </button>
            <button
              type="button"
              onClick={() => void saveScreenshot()}
              disabled={copying || savingScreenshot}
              className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            >
              <ImageDown size={13} aria-hidden="true" />
              {savingScreenshot ? "保存中…" : "今の画面を保存"}
            </button>
          </div>

          {sanitizedErrorMessage || sanitizedDiagnostics.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-900">
                <TriangleAlert size={13} aria-hidden="true" />
                自動添付されるエラーと診断
              </div>
              <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-amber-950">
                {sanitizedErrorMessage ? <p>{sanitizedErrorMessage}</p> : null}
                {sanitizedDiagnostics.length > 0 ? (
                  <ul className={sanitizedErrorMessage ? "mt-2 space-y-1" : "space-y-1"}>
                    {sanitizedDiagnostics.map((diagnostic) => (
                      <li key={diagnostic}>- {diagnostic}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-amber-800">
                絶対パスや認証情報は伏せています。GPTsへ貼り付けた後も内容を確認できます。
              </p>
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-3">
            <div className="flex items-center justify-between gap-3" aria-live="polite">
              <p className="text-[11px] font-semibold text-zinc-700">コピーされる環境情報</p>
              {loading ? <span className="text-[10px] text-zinc-400">取得中…</span> : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <EnvironmentRow label="XRift Studio" value={valueOrUnknown(environment.appVersion)} />
              <EnvironmentRow label="OS" value={`${valueOrUnknown(environment.os)} ${valueOrUnknown(environment.osVersion)}`} />
              <EnvironmentRow label="Node.js" value={valueOrUnknown(environment.nodeVersion)} />
              <EnvironmentRow label="@xrift/cli" value={valueOrUnknown(environment.cliVersion)} />
            </dl>
            <p className="mt-2 text-[10px] leading-4 text-zinc-400">
              アクセストークン、Cookie、パスワード、プロジェクトの絶対パスはコピーしません。
            </p>
          </div>
        </div>
        <div data-app-modal-footer className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={copying || savingScreenshot}
            className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvironmentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="truncate font-mono text-zinc-700" title={value}>{value}</dd>
    </div>
  );
}
