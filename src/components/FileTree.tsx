import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileCode2,
  FileJson,
  FileImage,
  FileText,
  Package,
  Box,
  UploadCloud,
  Pencil,
  Trash2,
} from "lucide-react";
import { tauri, type FsEntry } from "../lib/tauri";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";

const TEXT_EXT = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".json",
  ".md",
  ".css",
  ".html",
  ".txt",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".gitignore",
]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const MODEL_EXT = new Set([".glb", ".gltf", ".vrm", ".fbx", ".obj", ".drc"]);

const PROTECTED = new Set([
  "node_modules",
  "dist",
  ".git",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "xrift.json",
  "index.html",
]);

export type FileKind = "text" | "image" | "model" | "binary";

export function classifyFile(rel: string): FileKind {
  const lower = rel.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (IMAGE_EXT.has(ext)) return "image";
  if (MODEL_EXT.has(ext)) return "model";
  if (TEXT_EXT.has(ext)) return "text";
  if (!rel.includes(".")) return "text";
  return "binary";
}

export function languageOf(
  rel: string,
): "typescript" | "json" | "markdown" | "plaintext" | "css" | "html" {
  const l = rel.toLowerCase();
  if (l.endsWith(".tsx") || l.endsWith(".jsx") || l.endsWith(".ts") || l.endsWith(".js"))
    return "typescript";
  if (l.endsWith(".json")) return "json";
  if (l.endsWith(".md")) return "markdown";
  if (l.endsWith(".css")) return "css";
  if (l.endsWith(".html")) return "html";
  return "plaintext";
}

function FileIcon({
  rel,
  isDir,
  expanded,
  selected,
}: {
  rel: string;
  isDir: boolean;
  expanded?: boolean;
  selected: boolean;
}) {
  const cls = selected ? "text-violet-600" : isDir ? "text-zinc-500" : "text-zinc-400";
  if (isDir) {
    return expanded ? (
      <FolderOpen size={14} className={cls} strokeWidth={1.75} />
    ) : (
      <Folder size={14} className={cls} strokeWidth={1.75} />
    );
  }
  const lower = rel.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (MODEL_EXT.has(ext))
    return <Box size={14} className={cls} strokeWidth={1.75} />;
  if (IMAGE_EXT.has(ext))
    return <FileImage size={14} className={cls} strokeWidth={1.75} />;
  if (lower.endsWith("package.json"))
    return <Package size={14} className={cls} strokeWidth={1.75} />;
  if (lower.endsWith(".json"))
    return <FileJson size={14} className={cls} strokeWidth={1.75} />;
  if (lower.endsWith(".md") || lower.endsWith(".txt"))
    return <FileText size={14} className={cls} strokeWidth={1.75} />;
  if (lower.endsWith(".tsx") || lower.endsWith(".ts") || lower.endsWith(".jsx") || lower.endsWith(".js"))
    return <FileCode2 size={14} className={cls} strokeWidth={1.75} />;
  return <File size={14} className={cls} strokeWidth={1.75} />;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dirOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

function basenameOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}

type Props = {
  projectPath: string;
  selected: string | null;
  onSelect: (rel: string, kind: FileKind) => void;
  onPathChanged?: (
    change:
      | { type: "rename"; oldRel: string; newRel: string }
      | { type: "delete"; rel: string },
  ) => void;
  refreshKey?: number;
};

type Node = FsEntry & { expanded?: boolean; children?: Node[] };

type ContextMenuState = {
  rel: string;
  isDir: boolean;
  x: number;
  y: number;
};

export function FileTree({
  projectPath,
  selected,
  onSelect,
  onPathChanged,
  refreshKey,
}: Props) {
  const toast = useToast();
  const [tree, setTree] = useState<Node[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "public"]));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bumpCounter, setBumpCounter] = useState(0);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    rel: string;
    isDir: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(
    async (rel: string): Promise<Node[]> => {
      try {
        const entries = await tauri.listFiles(projectPath, rel);
        return entries.map((e) => ({ ...e, expanded: false, children: undefined }));
      } catch (e) {
        if (rel === "") setError(`${e}`);
        return [];
      }
    },
    [projectPath],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      const root = await loadDir("");
      if (cancelled) return;
      for (const node of root) {
        if (node.isDir && expanded.has(node.rel)) {
          node.children = await loadDir(node.rel);
        }
      }
      if (!cancelled) setTree(root);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, refreshKey, bumpCounter]);

  useEffect(() => {
    if (!menu) return;
    const onClick = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (renaming) {
      const t = window.setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [renaming]);

  const refreshTree = () => setBumpCounter((c) => c + 1);

  const toggle = async (node: Node) => {
    const next = new Set(expanded);
    if (next.has(node.rel)) {
      next.delete(node.rel);
    } else {
      next.add(node.rel);
      if (!node.children) {
        setLoadingPaths((p) => new Set(p).add(node.rel));
        try {
          const kids = await loadDir(node.rel);
          node.children = kids;
          setTree((t) => [...t]);
        } finally {
          setLoadingPaths((p) => {
            const n = new Set(p);
            n.delete(node.rel);
            return n;
          });
        }
      }
    }
    setExpanded(next);
  };

  const uploadToDir = async (dirRel: string, files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      for (const f of arr) {
        const dataUrl = await fileToDataUrl(f);
        const destRel = dirRel ? `${dirRel}/${f.name}` : f.name;
        await tauri.writeBinaryFile(projectPath, destRel, dataUrl);
      }
      toast({
        kind: "success",
        title: `${arr.length} 個のファイルをアップロードしました`,
        description: dirRel || "(ルート)",
      });
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(dirRel);
        return n;
      });
      refreshTree();
    } catch (e) {
      toast({
        kind: "error",
        title: "アップロードに失敗しました",
        description: `${e}`,
      });
    } finally {
      setUploading(false);
    }
  };

  const startRename = (rel: string) => {
    setRenaming(rel);
    setRenameValue(basenameOf(rel));
    setMenu(null);
  };

  const commitRename = async (oldRel: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === basenameOf(oldRel)) {
      setRenaming(null);
      return;
    }
    if (/[\\/]/.test(trimmed)) {
      toast({ kind: "error", title: "名前に / や \\ は使えません" });
      return;
    }
    const newRel = dirOf(oldRel) ? `${dirOf(oldRel)}/${trimmed}` : trimmed;
    try {
      await tauri.renamePath(projectPath, oldRel, newRel);
      toast({
        kind: "success",
        title: "名前を変更しました",
        description: `${basenameOf(oldRel)} → ${trimmed}`,
      });
      setRenaming(null);
      onPathChanged?.({ type: "rename", oldRel, newRel });
      refreshTree();
    } catch (e) {
      toast({
        kind: "error",
        title: "名前変更に失敗しました",
        description: `${e}`,
      });
    }
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await tauri.deletePath(projectPath, confirmDelete.rel);
      toast({
        kind: "success",
        title: confirmDelete.isDir
          ? "フォルダを削除しました"
          : "ファイルを削除しました",
        description: confirmDelete.rel,
      });
      onPathChanged?.({ type: "delete", rel: confirmDelete.rel });
      setConfirmDelete(null);
      refreshTree();
    } catch (e) {
      toast({
        kind: "error",
        title: "削除に失敗しました",
        description: `${e}`,
      });
    } finally {
      setDeleting(false);
    }
  };

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const isSelected = selected === node.rel;
    const isExp = expanded.has(node.rel);
    const fileKind = node.isDir ? undefined : classifyFile(node.rel);
    const clickable =
      node.isDir || fileKind === "text" || fileKind === "image" || fileKind === "model";
    const isDropTarget = node.isDir && dropTarget === node.rel;
    const isRenaming = renaming === node.rel;
    const isProtected = PROTECTED.has(node.name) || PROTECTED.has(node.rel);

    return (
      <div
        key={node.rel}
        onDragOver={
          node.isDir
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                if (dropTarget !== node.rel) setDropTarget(node.rel);
              }
            : undefined
        }
        onDragLeave={
          node.isDir
            ? (e) => {
                e.stopPropagation();
                setDropTarget((cur) => (cur === node.rel ? null : cur));
              }
            : undefined
        }
        onDrop={
          node.isDir
            ? async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(null);
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                  await uploadToDir(node.rel, files);
                }
              }
            : undefined
        }
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ rel: node.rel, isDir: node.isDir, x: e.clientX, y: e.clientY });
        }}
      >
        <div
          className={`group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] transition ${
            isSelected
              ? "bg-violet-100 text-violet-900"
              : isDropTarget
                ? "bg-brand-50 ring-1 ring-brand-300"
                : "text-zinc-700 hover:bg-zinc-100"
          } ${!clickable && !isRenaming ? "text-zinc-400" : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <button
            type="button"
            onClick={() => {
              if (isRenaming) return;
              if (node.isDir) {
                toggle(node);
              } else if (
                fileKind === "text" ||
                fileKind === "image" ||
                fileKind === "model"
              ) {
                onSelect(node.rel, fileKind);
              }
            }}
            disabled={!clickable && !isRenaming}
            className="flex flex-1 min-w-0 items-center gap-1.5"
            title={
              !clickable
                ? "編集できないファイル形式"
                : node.isDir
                  ? `${node.name}（ファイルをドロップでアップロード / 右クリックで操作）`
                  : `${node.name}（右クリックで操作）`
            }
          >
            <span
              className={`text-zinc-400 ${node.isDir ? "" : "opacity-0"}`}
              style={{
                transform: isExp && node.isDir ? "rotate(90deg)" : "none",
                transition: "transform 100ms",
              }}
            >
              <ChevronRight size={11} strokeWidth={2.5} />
            </span>
            <FileIcon rel={node.rel} isDir={node.isDir} expanded={isExp} selected={isSelected} />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename(node.rel);
                  else if (e.key === "Escape") cancelRename();
                }}
                onBlur={() => commitRename(node.rel)}
                className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-1 py-0 text-[13px] outline-none focus:ring-2 focus:ring-brand-200"
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </button>
          {isDropTarget && (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-brand-600">
              <UploadCloud size={10} strokeWidth={2} />
              drop
            </span>
          )}
          {!isRenaming && !isDropTarget && (
            <span className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              {!isProtected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(node.rel);
                  }}
                  className="rounded p-0.5 text-zinc-400 hover:bg-white hover:text-zinc-700"
                  title="名前を変更"
                >
                  <Pencil size={10} strokeWidth={2} />
                </button>
              )}
              {!isProtected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete({ rel: node.rel, isDir: node.isDir });
                  }}
                  className="rounded p-0.5 text-zinc-400 hover:bg-white hover:text-rose-600"
                  title="削除"
                >
                  <Trash2 size={10} strokeWidth={2} />
                </button>
              )}
            </span>
          )}
          {!isRenaming && !isDropTarget && node.isDir && loadingPaths.has(node.rel) && (
            <span className="ml-1 text-[10px] text-zinc-400">…</span>
          )}
        </div>
        {node.isDir && isExp && node.children && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="flex flex-col gap-0.5 px-1 py-2"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={async (e) => {
          e.preventDefault();
          if (dropTarget) return;
          const files = e.dataTransfer.files;
          if (files && files.length > 0) {
            await uploadToDir("", files);
          }
        }}
      >
        {uploading && (
          <div className="mx-1 mb-1 flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-[11px] text-brand-700">
            <UploadCloud size={11} strokeWidth={2} className="animate-pulse" />
            アップロード中…
          </div>
        )}
        {error && (
          <div className="mx-1 mb-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
            {error}
          </div>
        )}
        {tree.length === 0 && !error ? (
          <div className="px-3 py-2 text-xs text-zinc-400">読み込み中…</div>
        ) : (
          tree.map((n) => renderNode(n, 0))
        )}
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-brand animate-fade-in"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Pencil size={12} strokeWidth={2} />}
            label="名前を変更"
            onClick={() => startRename(menu.rel)}
            disabled={PROTECTED.has(basenameOf(menu.rel)) || PROTECTED.has(menu.rel)}
          />
          <MenuItem
            icon={<Trash2 size={12} strokeWidth={2} />}
            label="削除"
            destructive
            onClick={() => {
              setMenu(null);
              setConfirmDelete({ rel: menu.rel, isDir: menu.isDir });
            }}
            disabled={PROTECTED.has(basenameOf(menu.rel)) || PROTECTED.has(menu.rel)}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.isDir ? "フォルダを削除" : "ファイルを削除"}
        description={
          confirmDelete
            ? `${confirmDelete.rel}\n\n${confirmDelete.isDir ? "中身ごと完全に削除されます。" : "完全に削除されます。"} 元に戻せません。`
            : undefined
        }
        confirmLabel="削除する"
        destructive
        busy={deleting}
        onConfirm={performDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
        disabled
          ? "text-zinc-300"
          : destructive
            ? "text-rose-600 hover:bg-rose-50"
            : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      <span className={destructive ? "text-rose-500" : "text-zinc-400"}>{icon}</span>
      {label}
    </button>
  );
}
