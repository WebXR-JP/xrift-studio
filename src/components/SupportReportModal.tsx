import { useEffect, useMemo, useState } from "react";
import {
  Bug,
  Check,
  Clipboard,
  ExternalLink,
  ImageDown,
  Lightbulb,
  MessageCircle,
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
import { useToast } from "./Toast";

type Props = {
  open: boolean;
  projectCount: number;
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

export function SupportReportModal({ open, projectCount, onClose }: Props) {
  const toast = useToast();
  const [environment, setEnvironment] = useState(EMPTY_ENVIRONMENT);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [copied, setCopied] = useState(false);

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
- 現在の画面: プロジェクト一覧

## 相談内容
<!-- 起きた症状または実現したい機能を書いてください。 -->

## 再現手順または利用シーン
1.
2.
3.

## 期待する結果

## 実際の結果・困っていること
`,
    [environment, projectCount],
  );

  if (!open) return null;

  const copyEnvironment = async () => {
    setCopying(true);
    try {
      await copyText(environmentText);
      setCopied(true);
      toast({
        kind: "success",
        title: "環境情報をコピーしました",
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
      await tauri.openUrl(url);
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/35 px-4 py-4 backdrop-blur-sm animate-fade-in"
      data-support-overlay="true"
      onClick={() => !copying && !savingScreenshot && onClose()}
    >
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-brand-lg animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-zinc-100 bg-gradient-to-br from-violet-50 via-white to-cyan-50 px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={copying || savingScreenshot}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/70 hover:text-zinc-800 disabled:opacity-40"
            aria-label="ヘルプと報告を閉じる"
          >
            <X size={15} />
          </button>
          <div className="flex items-start gap-3 pr-7">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-white">
              <MessageCircle size={21} />
            </span>
            <div>
              <h2 id="support-report-title" className="text-lg font-semibold tracking-tight text-zinc-950">
                ヘルプに相談する準備
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                バグ報告や機能要望を相談する前に、環境情報をまとめて渡せます。
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
            ChatGPTの入力欄へURLだけで自動入力することはできないため、ボタンを押すと環境情報をコピーしてページを開きます。開いた先で貼り付けてください。
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void openWithEnvironment(XRIFT_STUDIO_NEW_ISSUE_URL, "GitHub Issue")}
              disabled={loading || copying || savingScreenshot}
              className="flex min-h-16 items-center gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-left text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <Bug size={19} className="shrink-0 text-rose-300" />
              <span>
                <span className="block text-sm font-semibold">GitHub Issueを作成</span>
                <span className="mt-0.5 block text-[11px] text-zinc-400">環境情報をコピーしてIssue画面を開く</span>
              </span>
              <ExternalLink size={14} className="ml-auto shrink-0 text-zinc-500" />
            </button>
            <button
              type="button"
              onClick={() => void openWithEnvironment(XRIFT_STUDIO_HELP_GPT_URL, "ヘルプセンターGPT")}
              disabled={loading || copying || savingScreenshot}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-violet-950 transition hover:bg-violet-100 disabled:opacity-50"
            >
              <Lightbulb size={19} className="shrink-0 text-violet-600" />
              <span>
                <span className="block text-sm font-semibold">ChatGPTで文章を作成</span>
                <span className="mt-0.5 block text-[11px] text-violet-700/70">環境情報をコピーしてGPTを開く</span>
              </span>
              <ExternalLink size={14} className="ml-auto shrink-0 text-violet-500" />
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void copyEnvironment()}
              disabled={copying || savingScreenshot || loading}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
              {copied ? "コピーしました" : "自分の環境をコピー"}
            </button>
            <button
              type="button"
              onClick={() => void saveScreenshot()}
              disabled={copying || savingScreenshot}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <ImageDown size={14} />
              {savingScreenshot ? "保存中…" : "今の画面を保存"}
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
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

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-zinc-400">あとでヘッダーのヘルプアイコンから開き直せます。</p>
            <button
              type="button"
              onClick={onClose}
              disabled={copying || savingScreenshot}
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              後で
            </button>
          </div>
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
