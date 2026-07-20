import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ExternalLink,
  FileCheck2,
  Image,
  Loader2,
  LogIn,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import type { ProjectKind } from "../../lib/tauri";
import { VisualPublishCancellationController } from "../../lib/visual-editor/publish-cancellation";

export type VisualPublishStage =
  | "review"
  | "saving"
  | "compiling"
  | "checking"
  | "uploading"
  | "processing"
  | "succeeded"
  | "cancelled"
  | "failed";

export type VisualPublishProgress = {
  stage: Exclude<
    VisualPublishStage,
    "review" | "succeeded" | "cancelled" | "failed"
  >;
  label: string;
  detail?: string;
  percent?: number;
  /** Remote commit stages cannot promise cancellation. */
  cancelSafe: boolean;
};

export type VisualPublishDiagnostic = {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  entityId?: string;
  assetId?: string;
  fieldPath?: string;
};

export type VisualPublishResult = {
  worldId?: string;
  itemId?: string;
  contentId?: string;
  versionId?: string;
  versionNumber?: number;
  contentHash?: string;
  status?: string;
  /** Only use a URL explicitly returned by XRift. */
  url?: string;
};

export type VisualPublishReview = {
  title: string;
  description: string;
  thumbnailReady: boolean;
  thumbnailSource?: "scene" | "project" | "template";
  signedIn: boolean;
  displayName?: string | null;
  saved: boolean;
  compilationFresh: boolean;
  diagnostics: VisualPublishDiagnostic[];
};

type Props = {
  open: boolean;
  projectKind: ProjectKind;
  review: VisualPublishReview;
  onClose: () => void;
  onEditMetadata?: () => void;
  onMetadataChange?: (title: string, description: string) => void;
  onEditThumbnail: () => void;
  onLogin: () => void;
  onLocateDiagnostic?: (diagnostic: VisualPublishDiagnostic) => void;
  onPublish: (
    report: (progress: VisualPublishProgress) => void,
    signal: AbortSignal,
  ) => Promise<VisualPublishResult>;
};

type Requirement = {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
  action?: () => void;
  actionLabel?: string;
};

const ACTIVE_STAGES = new Set<VisualPublishStage>([
  "saving",
  "compiling",
  "checking",
  "uploading",
  "processing",
]);

export function VisualUploadDialog({
  open,
  projectKind,
  review,
  onClose,
  onEditMetadata,
  onMetadataChange,
  onEditThumbnail,
  onLogin,
  onLocateDiagnostic,
  onPublish,
}: Props) {
  const [stage, setStage] = useState<VisualPublishStage>("review");
  const [progress, setProgress] = useState<VisualPublishProgress | null>(null);
  const [result, setResult] = useState<VisualPublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancellationRef = useRef<VisualPublishCancellationController | null>(
    null,
  );
  if (!cancellationRef.current) {
    cancellationRef.current = new VisualPublishCancellationController();
  }
  const cancellation = cancellationRef.current;
  const wasOpenRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const blockingDiagnostics = review.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  const requirements: Requirement[] = [
    {
      id: "metadata",
      label: "公開情報",
      detail:
        review.title.trim() && review.description.trim()
          ? `${review.title} / 説明設定済み`
          : "タイトルと説明を設定してください",
      ready: Boolean(review.title.trim() && review.description.trim()),
      action: () => {
        titleInputRef.current?.focus();
        onEditMetadata?.();
      },
      actionLabel: "編集",
    },
    {
      id: "thumbnail",
      label: "サムネイル",
      detail: review.thumbnailReady
        ? review.thumbnailSource === "template"
          ? "XRiftテンプレートの既定画像を使用"
          : review.thumbnailSource === "scene"
            ? "Scene Viewから生成する画像を使用"
            : "公開用画像を確認済み"
        : "公開用サムネイルを設定してください",
      ready: review.thumbnailReady,
      action: onEditThumbnail,
      actionLabel: "設定",
    },
    {
      id: "auth",
      label: "XRiftアカウント",
      detail: review.signedIn
        ? review.displayName || "ログイン済み"
        : "アップロード前にログインしてください",
      ready: review.signedIn,
      action: onLogin,
      actionLabel: "ログイン",
    },
    {
      id: "documents",
      label: "保存と変換",
      detail:
        review.saved && review.compilationFresh
          ? "保存済み・変換結果は最新"
          : "開始時に保存し、最新データから再変換します",
      ready: true,
    },
    {
      id: "diagnostics",
      label: "変換診断",
      detail:
        blockingDiagnostics.length === 0
          ? "アップロードを止める問題はありません"
          : `${blockingDiagnostics.length}件の問題を修正してください`,
      ready: blockingDiagnostics.length === 0,
    },
  ];
  const ready = requirements.every((requirement) => requirement.ready);
  const busy = ACTIVE_STAGES.has(stage);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStage("review");
      setProgress(null);
      setResult(null);
      setError(null);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  useEffect(
    () => () => {
      // This cleanup runs only when the dialog component itself unmounts.
      // Progress changes must never abort the active pipeline.
      cancellation.abortOnUnmount();
    },
    [cancellation],
  );

  if (!open) return null;

  const startPublish = async () => {
    if (!ready || busy || cancellation.active) return;
    const controller = cancellation.begin();
    setError(null);
    setResult(null);
    setStage("saving");
    setProgress({
      stage: "saving",
      label: "制作データを保存しています",
      percent: 0,
      cancelSafe: true,
    });
    try {
      const nextResult = await onPublish((nextProgress) => {
        if (!cancellation.isCurrent(controller) || controller.signal.aborted) {
          return;
        }
        cancellation.update(controller, nextProgress.cancelSafe);
        setProgress(nextProgress);
        setStage(nextProgress.stage);
      }, controller.signal);
      if (controller.signal.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      setResult(nextResult);
      setProgress(null);
      setStage("succeeded");
    } catch (publishError) {
      const aborted = controller.signal.aborted;
      setError(
        aborted
          ? "アップロード開始前の処理を取り消しました。制作データは保持されています。"
          : publishError instanceof Error
            ? publishError.message
            : String(publishError),
      );
      setProgress(null);
      setStage(aborted ? "cancelled" : "failed");
    } finally {
      cancellation.finish(controller);
    }
  };

  const requestCancel = () => {
    if (!progress?.cancelSafe) return;
    cancellation.requestCancel();
  };

  const projectLabel = projectKind === "world" ? "ワールド" : "アイテム";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onPointerDown={() => !busy && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-upload-title"
        className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-violet-700">
              <UploadCloud size={18} aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                XRift Upload
              </span>
            </div>
            <h2 id="visual-upload-title" className="mt-1 text-xl font-semibold text-slate-950">
              {projectLabel}をアップロード
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              保存、XRift向け変換、検査、アップロードをこの画面で続けて実行します。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="アップロード画面を閉じる"
            title={busy ? "処理が完了するまで閉じられません" : "アップロード画面を閉じる"}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          {stage === "review" ? (
            <div className="space-y-3">
              {onMetadataChange ? (
                <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <legend className="px-1 text-xs font-semibold text-slate-700">
                    公開情報
                  </legend>
                  <label className="block text-xs font-medium text-slate-600">
                    タイトル
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={review.title}
                      maxLength={120}
                      onChange={(event) =>
                        onMetadataChange(event.currentTarget.value, review.description)
                      }
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-slate-600">
                    説明
                    <textarea
                      value={review.description}
                      maxLength={1000}
                      rows={3}
                      onChange={(event) =>
                        onMetadataChange(review.title, event.currentTarget.value)
                      }
                      className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                </fieldset>
              ) : null}
              {requirements.map((requirement) => (
                <div
                  key={requirement.id}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                    requirement.ready
                      ? "border-slate-200 bg-white"
                      : "border-amber-300 bg-amber-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      requirement.ready
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {requirement.ready ? (
                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <AlertCircle size={14} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {requirement.label}
                    </div>
                    <div className="mt-0.5 text-xs leading-5 text-slate-500">
                      {requirement.detail}
                    </div>
                  </div>
                  {!requirement.ready && requirement.action ? (
                    <button
                      type="button"
                      onClick={requirement.action}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {requirement.actionLabel}
                    </button>
                  ) : null}
                </div>
              ))}

              {review.diagnostics.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FileCheck2 size={15} aria-hidden="true" />
                    変換診断
                  </div>
                  <div className="space-y-1.5">
                    {review.diagnostics.slice(0, 8).map((diagnostic, index) => (
                      <button
                        key={`${diagnostic.code}-${diagnostic.entityId ?? diagnostic.assetId ?? index}`}
                        type="button"
                        onClick={() => onLocateDiagnostic?.(diagnostic)}
                        className="flex w-full items-start gap-2 rounded-md bg-white px-2.5 py-2 text-left hover:bg-slate-100"
                      >
                        <AlertCircle
                          size={13}
                          className={
                            diagnostic.severity === "blocking"
                              ? "mt-0.5 shrink-0 text-rose-600"
                              : "mt-0.5 shrink-0 text-amber-600"
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-slate-700">
                            {diagnostic.message}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-slate-400">
                            {[diagnostic.entityId, diagnostic.assetId, diagnostic.fieldPath]
                              .filter(Boolean)
                              .join(" / ") || diagnostic.code}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : busy && progress ? (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Loader2 size={27} className="animate-spin" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{progress.label}</h3>
              {progress.detail ? (
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  {progress.detail}
                </p>
              ) : null}
              <div className="mx-auto mt-5 h-2 max-w-md overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-violet-600 transition-[width] duration-200"
                  style={{ width: `${Math.max(4, Math.min(100, progress.percent ?? 12))}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {progress.cancelSafe
                  ? "この段階は安全に取り消せます。"
                  : "XRiftへの送信開始後は結果を確認するまで閉じません。"}
              </p>
            </div>
          ) : stage === "succeeded" ? (
            <div className="py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={28} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-slate-950">
                アップロードが完了しました
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                XRiftから返された結果をこのプロジェクトに保持します。
              </p>
              <dl className="mx-auto mt-5 grid max-w-md grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs">
                {projectKind === "world" && result?.worldId ? <><dt className="text-slate-500">World ID</dt><dd className="truncate font-mono text-slate-800">{result.worldId}</dd></> : null}
                {projectKind === "item" && result?.itemId ? <><dt className="text-slate-500">Item ID</dt><dd className="truncate font-mono text-slate-800">{result.itemId}</dd></> : null}
                {!result?.worldId && !result?.itemId && result?.contentId ? <><dt className="text-slate-500">Content ID</dt><dd className="truncate font-mono text-slate-800">{result.contentId}</dd></> : null}
                {result?.versionId ? <><dt className="text-slate-500">Version ID</dt><dd className="truncate font-mono text-slate-800">{result.versionId}</dd></> : null}
                {result?.versionNumber !== undefined ? <><dt className="text-slate-500">Version</dt><dd className="text-slate-800">{result.versionNumber}</dd></> : null}
                {result?.contentHash ? <><dt className="text-slate-500">Content hash</dt><dd className="truncate font-mono text-slate-800">{result.contentHash}</dd></> : null}
                {result?.status ? <><dt className="text-slate-500">Status</dt><dd className="text-slate-800">{result.status}</dd></> : null}
              </dl>
              {result && Object.keys(result).length === 0 ? (
                <p className="mx-auto mt-3 max-w-md rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                  XRift CLIは正常終了しました。識別子はCLIの出力に含まれていなかったため、推測せずに完了のみを記録します。
                </p>
              ) : null}
              {result?.url ? (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  XRiftで結果を開く
                </a>
              ) : null}
            </div>
          ) : stage === "cancelled" ? (
            <div className="py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <RotateCcw size={27} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">
                アップロード準備を取り消しました
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {error || "制作データと保存済みの内容は保持されています。"}
              </p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertCircle size={27} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">
                アップロードを完了できませんでした
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {error || "処理を再実行するか、Editorへ戻って診断を確認してください。"}
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {review.thumbnailReady ? <Image size={13} aria-hidden="true" /> : null}
            {review.signedIn ? <LogIn size={13} aria-hidden="true" /> : null}
            {stage === "review"
              ? ready
                ? "公開準備が整っています"
                : "未完了の項目を修正してください"
              : stage === "succeeded"
                ? "XRiftからアップロード結果を受信しました"
                : stage === "cancelled"
                  ? "制作データは保持されています"
                  : stage === "failed"
                    ? "原因を確認してから再試行できます"
                    : progress?.label ?? "処理中です"}
          </div>
          <div className="flex items-center gap-2">
            {busy ? (
              <button
                type="button"
                onClick={requestCancel}
                disabled={!progress?.cancelSafe}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                取り消す
              </button>
            ) : stage === "succeeded" ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Editorへ戻る
              </button>
            ) : stage === "failed" || stage === "cancelled" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Editorへ戻る
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("review");
                    setError(null);
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  準備を再確認
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  戻る
                </button>
                <button
                  type="button"
                  onClick={() => void startPublish()}
                  disabled={!ready}
                  className="flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <UploadCloud size={15} aria-hidden="true" />
                  保存してアップロード
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
