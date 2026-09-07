import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, FileDown, FolderOpen, PackageOpen, X } from "lucide-react";
import type {
  Project,
  ProjectArchiveExport,
  ProjectArchiveInspection,
} from "../lib/tauri";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidProjectDirectoryName(value: string): boolean {
  return PROJECT_NAME_PATTERN.test(value);
}

/** Picks `base`, `base-2`, `base-3`, ... whichever is not taken yet. */
export function uniqueProjectDirectoryName(
  base: string,
  existing: Iterable<string>,
): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Reduces a free-form name to the lower-case, hyphenated form folders use. */
export function toProjectDirectoryName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function formatArchiveBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function useEscapeToClose(open: boolean, busy: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
}

type FrameProps = {
  titleId: string;
  title: string;
  icon: ReactNode;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

function DialogFrame({ titleId, title, icon, busy, onClose, children, footer }: FrameProps) {
  return (
    <div
      data-app-modal-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm animate-fade-in"
      onClick={() => !busy && onClose()}
    >
      <div
        data-app-modal-surface
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[460px] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {children}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="閉じる"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div
      className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 whitespace-pre-wrap"
      role="alert"
    >
      {error}
    </div>
  );
}

function NameField({
  value,
  onChange,
  disabled,
  onSubmit,
  existingNames,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onSubmit: () => void;
  existingNames: ReadonlySet<string>;
}) {
  const valid = isValidProjectDirectoryName(value);
  const taken = existingNames.has(value);
  return (
    <label className="mt-4 block">
      <span className="text-sm font-medium text-zinc-700">プロジェクト名（フォルダー名）</span>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && valid && !taken) onSubmit();
        }}
        className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
      />
      {value.length > 0 && !valid ? (
        <span className="mt-2 block text-xs text-amber-700">
          先頭を小文字英数字にし、小文字英数字とハイフンだけを使ってください。
        </span>
      ) : null}
      {valid && taken ? (
        <span className="mt-2 block text-xs text-amber-700">
          同じ名前のプロジェクトがすでにあります。別の名前にしてください。
        </span>
      ) : null}
    </label>
  );
}

const primaryButton =
  "rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50";
const secondaryButton =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

type DuplicateProps = {
  project: Project | null;
  existingNames: ReadonlySet<string>;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (directoryName: string, title: string | undefined) => void;
};

export function DuplicateProjectDialog({
  project,
  existingNames,
  busy,
  error,
  onClose,
  onConfirm,
}: DuplicateProps) {
  const open = Boolean(project);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  useEscapeToClose(open, busy, onClose);

  useEffect(() => {
    if (!project) return;
    setName(uniqueProjectDirectoryName(`${project.name}-copy`, existingNames));
    setTitle(project.title ? `${project.title} のコピー` : "");
    // The defaults belong to the project being duplicated, not to later list refreshes.
  }, [project?.path]);

  if (!project) return null;
  const isVisual = project.format === "visual";
  const canSubmit =
    !busy && isValidProjectDirectoryName(name) && !existingNames.has(name);
  const submit = () => {
    if (!canSubmit) return;
    onConfirm(name, isVisual && title.trim() ? title.trim() : undefined);
  };

  return (
    <DialogFrame
      titleId="duplicate-project-title"
      title="プロジェクトを複製"
      icon={<Copy size={16} strokeWidth={2} />}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} className={primaryButton}>
            {busy ? "複製中…" : "複製する"}
          </button>
        </>
      }
    >
      <p className="mt-1 text-xs text-zinc-600">
        「{project.title || project.name}」の全ファイルを同じ保存先に別名でコピーします。
        コピーは未公開の独立したプロジェクトになり、公開しても元のワールドには影響しません。
      </p>
      <NameField
        value={name}
        onChange={setName}
        disabled={busy}
        onSubmit={submit}
        existingNames={existingNames}
      />
      {isVisual ? (
        <label className="mt-3 block">
          <span className="text-sm font-medium text-zinc-700">タイトル</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            空のままなら元のタイトルを引き継ぎます。あとから公開情報で変更できます。
          </span>
        </label>
      ) : (
        <p className="mt-3 text-[11px] text-zinc-500">
          Classicプロジェクトのタイトルは xrift.json をそのまま引き継ぎます。
        </p>
      )}
      <ErrorNote error={error} />
    </DialogFrame>
  );
}

type ImportProps = {
  inspection: ProjectArchiveInspection | null;
  existingNames: ReadonlySet<string>;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (directoryName: string) => void;
};

export function ImportProjectArchiveDialog({
  inspection,
  existingNames,
  busy,
  error,
  onClose,
  onConfirm,
}: ImportProps) {
  const open = Boolean(inspection);
  const [name, setName] = useState("");
  useEscapeToClose(open, busy, onClose);

  useEffect(() => {
    if (!inspection) return;
    const base = toProjectDirectoryName(inspection.suggestedName) || "imported-project";
    setName(uniqueProjectDirectoryName(base, existingNames));
    // The default name belongs to the archive that was picked, not to later list refreshes.
  }, [inspection?.archivePath]);

  const archiveFileName = useMemo(
    () => inspection?.archivePath.split(/[\\/]/).pop() ?? "",
    [inspection?.archivePath],
  );

  if (!inspection) return null;
  const canSubmit =
    !busy && isValidProjectDirectoryName(name) && !existingNames.has(name);
  const submit = () => {
    if (canSubmit) onConfirm(name);
  };

  return (
    <DialogFrame
      titleId="import-project-title"
      title="zipからプロジェクトを取り込む"
      icon={<PackageOpen size={16} strokeWidth={2} />}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} className={primaryButton}>
            {busy ? "取り込み中…" : "取り込む"}
          </button>
        </>
      }
    >
      <p className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={inspection.archivePath}>
        {archiveFileName}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-zinc-500">内容</dt>
        <dd className="text-zinc-800">
          {inspection.kind === "item" ? "Item" : "World"} /{" "}
          {inspection.format === "visual" ? "Visual" : "Classic"}
        </dd>
        <dt className="text-zinc-500">タイトル</dt>
        <dd className="truncate text-zinc-800">{inspection.title || "（未設定）"}</dd>
        {inspection.description ? (
          <>
            <dt className="text-zinc-500">説明</dt>
            <dd className="line-clamp-2 text-zinc-800">{inspection.description}</dd>
          </>
        ) : null}
        <dt className="text-zinc-500">サイズ</dt>
        <dd className="text-zinc-800">
          {inspection.fileCount}ファイル / 展開後 {formatArchiveBytes(inspection.totalBytes)}
        </dd>
      </dl>
      <NameField
        value={name}
        onChange={setName}
        disabled={busy}
        onSubmit={submit}
        existingNames={existingNames}
      />
      <p className="mt-3 text-[11px] text-zinc-500">
        取り込んだプロジェクトは未公開の状態から始まります。
        {inspection.format === "classic"
          ? " Classicは node_modules を含まないので、初回の起動前にプロジェクトフォルダーで依存関係をインストールしてください。"
          : ""}
      </p>
      <ErrorNote error={error} />
    </DialogFrame>
  );
}

type ExportResultProps = {
  result: (ProjectArchiveExport & { projectLabel: string }) | null;
  onOpenFolder: () => void;
  onClose: () => void;
};

export function ExportProjectResultDialog({ result, onOpenFolder, onClose }: ExportResultProps) {
  useEscapeToClose(Boolean(result), false, onClose);
  if (!result) return null;
  const fileName = result.archivePath.split(/[\\/]/).pop() ?? result.archivePath;
  return (
    <DialogFrame
      titleId="export-project-title"
      title="プロジェクトを書き出しました"
      icon={<FileDown size={16} strokeWidth={2} />}
      busy={false}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            閉じる
          </button>
          <button
            type="button"
            onClick={onOpenFolder}
            className={`${primaryButton} inline-flex items-center gap-1.5`}
          >
            <FolderOpen size={13} aria-hidden="true" />
            保存先のフォルダーを開く
          </button>
        </>
      }
    >
      <p className="mt-1 text-xs text-zinc-600">
        「{result.projectLabel}」を1つのzipにまとめました。このファイルを渡すと、相手のXRift
        Studioで「zipから取り込む」からプロジェクトとして開けます。
      </p>
      <p className="mt-3 truncate font-mono text-[11px] text-zinc-700" title={result.archivePath}>
        {fileName}
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        {result.fileCount}ファイル / {formatArchiveBytes(result.totalBytes)}（node_modules、.git、公開記録は含みません）
      </p>
    </DialogFrame>
  );
}
