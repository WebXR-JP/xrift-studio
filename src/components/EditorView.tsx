import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Play,
  Square,
  Code2,
  Upload,
  ExternalLink,
  TerminalSquare,
  RefreshCw,
  Camera,
  Globe,
} from "lucide-react";
import { tauri, type Project } from "../lib/tauri";
import {
  xrift,
  openInVSCode,
  openTerminal,
  startDevServer,
  type DevHandle,
  type LogLine,
  type Whoami,
} from "../lib/xrift-cli";
import { EditorPane } from "./EditorPane";
import { LogsPane } from "./LogsPane";
import { FileTree, classifyFile, languageOf, type FileKind } from "./FileTree";
import { ThumbnailEditor } from "./ThumbnailEditor";
import { ImageViewer } from "./ImageViewer";
import { ModelViewer } from "./ModelViewer";
import { XriftJsonEditor } from "./XriftJsonEditor";
import { useToast } from "./Toast";

type Props = {
  project: Project;
  user: Whoami | null;
  busy: boolean;
  appendLog: (line: LogLine) => void;
  logs: LogLine[];
  setBusy: (b: boolean) => void;
  clearLogs: () => void;
  onBack: () => void;
  onProjectChanged: () => void;
};

const DEFAULT_CANDIDATES = [
  "src/World.tsx",
  "src/index.tsx",
  "src/main.tsx",
  "src/App.tsx",
  "xrift.json",
  "package.json",
  "README.md",
];

export function EditorView({
  project,
  user,
  busy,
  appendLog,
  logs,
  setBusy,
  clearLogs,
  onBack,
  onProjectChanged,
}: Props) {
  const toast = useToast();
  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<FileKind>("text");
  const [content, setContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsCollapsed, setLogsCollapsed] = useState(true);
  const [fileTreeKey, setFileTreeKey] = useState(0);
  const [xriftJsonRaw, setXriftJsonRaw] = useState(false);

  const [devHandle, setDevHandle] = useState<DevHandle | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [devStarting, setDevStarting] = useState(false);
  const devHandleRef = useRef<DevHandle | null>(null);

  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const isDirty = content !== savedContent;
  const isXriftJson = selectedRel === "xrift.json";
  const isXriftJsonForm = isXriftJson && !xriftJsonRaw;
  const isText = selectedKind === "text" && !isXriftJsonForm;
  const isThumbnail = selectedRel === "public/thumbnail.png";
  const isImage = selectedKind === "image" && !isThumbnail;
  const isModel = selectedKind === "model";

  useEffect(() => {
    devHandleRef.current = devHandle;
  }, [devHandle]);

  useEffect(() => {
    if (busy) setLogsCollapsed(false);
  }, [busy]);

  useEffect(() => {
    return () => {
      const h = devHandleRef.current;
      if (h) h.stop().catch(() => {});
    };
  }, []);

  // Auto-select a sensible file when project changes.
  useEffect(() => {
    let cancelled = false;
    setXriftJsonRaw(false);
    (async () => {
      for (const candidate of DEFAULT_CANDIDATES) {
        try {
          await tauri.readTextFile(project.path, candidate);
          if (!cancelled) {
            setSelectedRel(candidate);
            setSelectedKind("text");
          }
          return;
        } catch {
          /* try next */
        }
      }
      // Fallback: pick the first text file in root
      try {
        const entries = await tauri.listFiles(project.path, "");
        const first = entries.find(
          (e) => !e.isDir && classifyFile(e.rel) === "text",
        );
        if (first && !cancelled) {
          setSelectedRel(first.rel);
          setSelectedKind("text");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.path]);

  const loadFile = useCallback(async () => {
    if (!selectedRel || !isText) return;
    setLoading(true);
    setError(null);
    try {
      const txt = await tauri.readTextFile(project.path, selectedRel);
      setContent(txt);
      setSavedContent(txt);
    } catch (e) {
      setError(`${e}`);
      setContent("");
      setSavedContent("");
    } finally {
      setLoading(false);
    }
  }, [project.path, selectedRel, isText]);

  useEffect(() => {
    if (selectedRel && isText) loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, selectedRel, isText]);

  const handleSave = useCallback(async () => {
    if (!selectedRel || !isText || !isDirty) return;
    try {
      await tauri.writeTextFile(project.path, selectedRel, content);
      setSavedContent(content);
      toast({ kind: "success", title: "保存しました", description: selectedRel });
    } catch (e) {
      toast({ kind: "error", title: "保存に失敗しました", description: `${e}` });
      appendLog({ kind: "stderr", text: `save failed: ${e}`, ts: Date.now() });
    }
  }, [isText, isDirty, project.path, selectedRel, content, appendLog, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = () =>
    wrap(async () => {
      const result = await xrift.upload(project.path, appendLog);
      onProjectChanged();
      const combined = `${result.stdout}\n${result.stderr}`.replace(
        /\u001b\[[0-9;]*m/g,
        "",
      );
      const match = combined.match(
        /https?:\/\/(?:[a-z0-9-]+\.)?xrift\.net\/[\S]+?(?=[\s)\]"'>]|$)/i,
      );
      if (result.code === 0) {
        if (match) {
          const url = match[0].replace(/[.,;:]+$/, "");
          setPublishedUrl(url);
          toast({
            kind: "success",
            title: "アップロード完了",
            description: "XRift で確認できます",
          });
        } else {
          toast({ kind: "success", title: "アップロード完了" });
        }
      } else {
        toast({
          kind: "error",
          title: "アップロードに失敗しました",
          description: "ログを確認してください",
        });
      }
    });
  const handleOpenVSCode = () =>
    wrap(() => openInVSCode(project.path, appendLog));
  const handleOpenTerminal = () =>
    openTerminal(project.path, appendLog).catch((e) =>
      appendLog({ kind: "stderr", text: `terminal failed: ${e}`, ts: Date.now() }),
    );

  const handleStartDev = async () => {
    if (devHandle || devStarting) return;
    setDevStarting(true);
    setDevUrl(null);
    setLogsCollapsed(false);
    try {
      const handle = await startDevServer(
        project.path,
        appendLog,
        async (url) => {
          setDevUrl(url);
          try {
            await openUrl(url);
          } catch (e) {
            appendLog({ kind: "stderr", text: `open url failed: ${e}`, ts: Date.now() });
          }
        },
      );
      setDevHandle(handle);
    } catch (e) {
      appendLog({ kind: "stderr", text: `dev start failed: ${e}`, ts: Date.now() });
    } finally {
      setDevStarting(false);
    }
  };

  const handleStopDev = async () => {
    const h = devHandle;
    if (!h) return;
    try {
      await h.stop();
    } catch (e) {
      appendLog({ kind: "stderr", text: `dev stop failed: ${e}`, ts: Date.now() });
    } finally {
      setDevHandle(null);
      setDevUrl(null);
    }
  };

  const handleOpenDevUrl = async () => {
    if (!devUrl) return;
    try {
      await openUrl(devUrl);
    } catch (e) {
      appendLog({ kind: "stderr", text: `open url failed: ${e}`, ts: Date.now() });
    }
  };

  const handleOpenPublished = async () => {
    const target = publishedUrl ?? "https://xrift.net/";
    try {
      await openUrl(target);
    } catch (e) {
      appendLog({ kind: "stderr", text: `open url failed: ${e}`, ts: Date.now() });
    }
  };

  const handleOpenThumbnail = () => {
    setSelectedRel("public/thumbnail.png");
    setSelectedKind("image");
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            <ArrowLeft size={12} strokeWidth={2} />
            ライブラリ
          </button>
          <span className="text-zinc-300">/</span>
          <div>
            <div className="text-sm font-semibold text-zinc-900">{project.name}</div>
            {project.title && project.title !== project.name && (
              <div className="text-[10px] text-zinc-500">{project.title}</div>
            )}
          </div>
          {devUrl && (
            <button
              type="button"
              onClick={handleOpenDevUrl}
              className="ml-2 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              title="ブラウザで開く"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {devUrl}
              <ExternalLink size={10} strokeWidth={2} />
            </button>
          )}
          {publishedUrl && (
            <button
              type="button"
              onClick={handleOpenPublished}
              className="ml-2 flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
              title="アップロード済みワールドを XRift で開く"
            >
              <Globe size={10} strokeWidth={2} />
              XRift で開く
              <ExternalLink size={10} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {devHandle ? (
            <button
              type="button"
              onClick={handleStopDev}
              className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Square size={10} fill="currentColor" strokeWidth={0} />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartDev}
              disabled={devStarting || busy}
              className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              title="npm run dev でローカルサーバーを起動してブラウザで開く"
            >
              <Play size={11} fill="currentColor" strokeWidth={0} />
              {devStarting ? "起動中…" : "実行"}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenThumbnail}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            title="サムネイル画像を設定"
          >
            <Camera size={12} strokeWidth={2} />
            サムネイル
          </button>
          <button
            type="button"
            onClick={handleOpenTerminal}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            title="プロジェクトディレクトリでターミナルを開く（Claude Code などを起動できます）"
          >
            <TerminalSquare size={12} strokeWidth={2} />
            ターミナル
          </button>
          <button
            type="button"
            onClick={handleOpenVSCode}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            title="プロジェクトを VS Code で開く"
          >
            <Code2 size={12} strokeWidth={2} />
            VS Code
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={busy || !user}
            title={!user ? "ログインしてください" : "XRift にアップロード"}
            className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50"
          >
            <Upload size={12} strokeWidth={2} />
            アップロード
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Files
            </span>
            <button
              type="button"
              onClick={() => setFileTreeKey((k) => k + 1)}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              title="再読み込み"
            >
              <RefreshCw size={11} strokeWidth={2} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree
              projectPath={project.path}
              selected={selectedRel}
              refreshKey={fileTreeKey}
              onSelect={(rel, kind) => {
                setSelectedRel(rel);
                setSelectedKind(kind);
                if (rel === "xrift.json") setXriftJsonRaw(false);
              }}
              onPathChanged={(change) => {
                if (change.type === "rename") {
                  if (selectedRel === change.oldRel) {
                    setSelectedRel(change.newRel);
                  } else if (selectedRel?.startsWith(change.oldRel + "/")) {
                    setSelectedRel(
                      change.newRel + selectedRel.slice(change.oldRel.length),
                    );
                  }
                } else if (change.type === "delete") {
                  if (
                    selectedRel === change.rel ||
                    selectedRel?.startsWith(change.rel + "/")
                  ) {
                    setSelectedRel(null);
                  }
                }
                onProjectChanged();
              }}
            />
          </div>
          <div className="border-t border-zinc-200 px-3 py-2 text-[10px] text-zinc-400 break-all">
            {project.path}
          </div>
        </aside>

        <div className="flex flex-1 min-w-0 flex-col">
          {selectedRel == null ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              左のファイル一覧から開くファイルを選んでください。
            </div>
          ) : error && isText ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white p-8 text-sm">
              <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                <div className="font-medium">ファイルを開けませんでした</div>
                <div className="mt-1 font-mono text-[11px]">{error}</div>
                <div className="mt-2 text-[11px] text-rose-600">
                  このファイルはまだ生成されていないか、アクセスできない可能性があります。
                </div>
              </div>
              <button
                type="button"
                onClick={loadFile}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                <RefreshCw size={12} strokeWidth={2} />
                再試行
              </button>
            </div>
          ) : isXriftJsonForm ? (
            <XriftJsonEditor
              projectPath={project.path}
              onOpenRaw={() => setXriftJsonRaw(true)}
              onRefresh={onProjectChanged}
            />
          ) : isText ? (
            <EditorPane
              language={languageOf(selectedRel)}
              filename={selectedRel}
              content={content}
              isDirty={isDirty}
              loading={loading}
              error={null}
              onChange={setContent}
              onSave={handleSave}
            />
          ) : isThumbnail ? (
            <ThumbnailEditor
              projectPath={project.path}
              onChanged={() => {
                onProjectChanged();
                setFileTreeKey((k) => k + 1);
                toast({ kind: "success", title: "サムネイルを更新しました" });
              }}
            />
          ) : isImage ? (
            <ImageViewer projectPath={project.path} rel={selectedRel} />
          ) : isModel ? (
            <ModelViewer projectPath={project.path} rel={selectedRel} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              プレビューできないファイルです
            </div>
          )}
          <LogsPane
            logs={logs}
            busy={busy || devStarting || !!devHandle}
            collapsed={logsCollapsed}
            onToggle={() => setLogsCollapsed((c) => !c)}
            onClear={clearLogs}
          />
        </div>
      </div>
    </div>
  );
}
