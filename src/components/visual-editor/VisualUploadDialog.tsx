import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  ExternalLink,
  FileCheck2,
  Gauge,
  Image,
  ImagePlus,
  LifeBuoy,
  Loader2,
  LogIn,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import type { ProjectKind } from "../../lib/tauri";
import { imageDataUrlToPng } from "../../lib/project-thumbnail";
import type { AssetOptimizationProgress } from "../../lib/visual-editor/asset-optimization";
import { VisualPublishCancellationController } from "../../lib/visual-editor/publish-cancellation";
import {
  isUnresolvedXriftUploadAttempt,
  PublishCommandError,
} from "../../lib/visual-editor/publish";
import {
  formatVramBytes,
  type WorldVramEstimate,
} from "../../lib/visual-editor/vram-estimate";
import { VramEstimateDialog } from "./VramEstimateDialog";
import { SupportReportModal } from "../SupportReportModal";

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
  thumbnailStaging?: {
    state: "verified";
    sha256: string;
  };
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
  uploadedAt?: string;
  /** Only use a URL explicitly returned by XRift. */
  url?: string;
};

export type VisualPublishReview = {
  title: string;
  description: string;
  thumbnailReady: boolean;
  thumbnailSource?: "scene" | "project" | "template";
  thumbnailPreview?: string | null;
  signedIn: boolean;
  displayName?: string | null;
  saved: boolean;
  compilationFresh: boolean;
  /** Existing remote target restored before invoking the official CLI. */
  remoteId?: string;
  /** A legacy project has upload history whose target must be recovered. */
  previouslyPublished?: boolean;
  diagnostics: VisualPublishDiagnostic[];
  vramEstimate?: WorldVramEstimate;
};

type Props = {
  open: boolean;
  projectKind: ProjectKind;
  review: VisualPublishReview;
  onClose: () => void;
  onEditMetadata?: () => void;
  onMetadataChange?: (title: string, description: string) => void;
  onEditThumbnail: () => void;
  onGenerateThumbnail?: () => Promise<string>;
  onSaveThumbnail?: (dataUrl: string) => Promise<void>;
  onLogin: () => void;
  onLocateDiagnostic?: (diagnostic: VisualPublishDiagnostic) => void;
  onApplyOptimizations?: (
    recommendationIds: string[],
    report: (progress: AssetOptimizationProgress) => void,
  ) => Promise<{
    optimizedAssetCount: number;
    beforeBytes: number;
    afterBytes: number;
  }>;
  onPublish: (
    report: (progress: VisualPublishProgress) => void,
    signal: AbortSignal,
  ) => Promise<VisualPublishResult>;
  /**
   * Discards a previous upload attempt whose outcome Studio could not confirm.
   * Present only when the project is in that state; the author decides, after
   * checking XRift, that the previous attempt did not land.
   */
  onClearStaleUploadAttempt?: () => Promise<void>;
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
  onGenerateThumbnail,
  onSaveThumbnail,
  onLogin,
  onLocateDiagnostic,
  onApplyOptimizations,
  onPublish,
  onClearStaleUploadAttempt,
}: Props) {
  const [stage, setStage] = useState<VisualPublishStage>("review");
  const [progress, setProgress] = useState<VisualPublishProgress | null>(null);
  const [result, setResult] = useState<VisualPublishResult | null>(null);
  // Message and CLI output travel together so clearing one can never leave the
  // other showing a stale reason.
  const [failure, setFailure] = useState<{
    message: string;
    /** Full CLI output, shown verbatim so the reason stays legible. */
    detail: string | null;
  } | null>(null);
  const error = failure?.message ?? null;
  const [thumbnailStagingSha256, setThumbnailStagingSha256] = useState<
    string | null
  >(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    review.thumbnailPreview ?? null,
  );
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [vramDetailsOpen, setVramDetailsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [clearingAttempt, setClearingAttempt] = useState(false);
  const [clearAttemptError, setClearAttemptError] = useState<string | null>(null);
  const [attemptCleared, setAttemptCleared] = useState(false);
  // One publish failure is the author's to resolve rather than Studio's: a
  // previous upload that never confirmed. Every later publish stops at the same
  // point until it is settled, so the way out belongs on this screen.
  const unresolvedUploadAttempt =
    stage === "failed" && isUnresolvedXriftUploadAttempt(error);
  const cancellationRef = useRef<VisualPublishCancellationController | null>(
    null,
  );
  if (!cancellationRef.current) {
    cancellationRef.current = new VisualPublishCancellationController();
  }
  const cancellation = cancellationRef.current;
  const wasOpenRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);

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
        ? "public/thumbnail.pngを確認済み。開始時にステージングへコピーしてSHA-256を照合します"
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
        : "公開前にログインしてください",
      ready: review.signedIn,
      action: onLogin,
      actionLabel: "ログイン",
    },
    {
      id: "target",
      label: "公開先",
      detail: review.remoteId
        ? `既存の${projectKind === "world" ? "ワールド" : "アイテム"}を更新します: ${review.remoteId}`
        : review.previouslyPublished
          ? `以前の${projectKind === "world" ? "ワールド" : "アイテム"}の公開先IDを確認して更新します`
          : "公開先IDを確認して、新規作成または既存更新を安全に決定します",
      ready: true,
    },
    {
      id: "documents",
      label: "公開データ",
      detail:
        review.saved && review.compilationFresh
          ? "最新の編集内容を使用できます"
          : "公開時に最新の編集内容を自動で保存・変換します",
      ready: true,
    },
    {
      id: "diagnostics",
      label: "公開チェック",
      detail:
        blockingDiagnostics.length === 0
          ? "公開を止める問題はありません"
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
      setFailure(null);
      setThumbnailStagingSha256(null);
      setThumbnailPreview(review.thumbnailPreview ?? null);
      setThumbnailBusy(false);
      setThumbnailError(null);
      setVramDetailsOpen(false);
      setSupportOpen(false);
    }
    wasOpenRef.current = open;
  }, [open, review.thumbnailPreview]);

  useEffect(() => {
    setThumbnailPreview(review.thumbnailPreview ?? null);
  }, [review.thumbnailPreview]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        busy ||
        thumbnailBusy ||
        vramDetailsOpen ||
        supportOpen
      ) return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open, supportOpen, thumbnailBusy, vramDetailsOpen]);

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
    setFailure(null);
    setResult(null);
    setThumbnailStagingSha256(null);
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
        if (nextProgress.thumbnailStaging?.state === "verified") {
          setThumbnailStagingSha256(nextProgress.thumbnailStaging.sha256);
        }
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
      setFailure({
        message: aborted
          ? "公開処理を始める前に取り消しました。制作データは保持されています。"
          : publishError instanceof Error
            ? publishError.message
            : String(publishError),
        detail:
          !aborted && publishError instanceof PublishCommandError
            ? publishError.detail || null
            : null,
      });
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

  const persistThumbnail = async (source: string) => {
    if (!onSaveThumbnail) {
      throw new Error("サムネイルを保存できるプロジェクトがありません");
    }
    const png = await imageDataUrlToPng(source);
    await onSaveThumbnail(png);
    setThumbnailPreview(png);
    setThumbnailError(null);
  };

  const generateThumbnail = async () => {
    if (!onGenerateThumbnail || thumbnailBusy) return;
    setThumbnailBusy(true);
    setThumbnailError(null);
    try {
      await persistThumbnail(await onGenerateThumbnail());
    } catch (captureError) {
      setThumbnailError(
        captureError instanceof Error
          ? captureError.message
          : String(captureError),
      );
    } finally {
      setThumbnailBusy(false);
    }
  };

  const readThumbnailFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("画像ファイルを読み込めませんでした"));
      };
      reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
      reader.readAsDataURL(file);
    });

  const selectThumbnailFile = async (file: File | undefined) => {
    if (!file || thumbnailBusy) return;
    if (!file.type.startsWith("image/")) {
      setThumbnailError("画像ファイルを選んでください");
      return;
    }
    setThumbnailBusy(true);
    setThumbnailError(null);
    try {
      await persistThumbnail(await readThumbnailFile(file));
    } catch (fileError) {
      setThumbnailError(
        fileError instanceof Error ? fileError.message : String(fileError),
      );
    } finally {
      setThumbnailBusy(false);
    }
  };

  const projectLabel = projectKind === "world" ? "ワールド" : "アイテム";

  return (
    <>
    <div
      data-app-modal-backdrop
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onPointerDown={() => !busy && !thumbnailBusy && onClose()}
    >
      <section
        data-app-modal-surface
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-upload-title"
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header data-app-modal-header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="flex items-center gap-2">
              <UploadCloud size={18} aria-hidden="true" />
              <h2 id="visual-upload-title" className="text-xl font-semibold text-slate-950">
                {projectLabel}を公開
              </h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              最新の編集内容を保存・変換し、公開前の確認からXRiftへの送信まで進めます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || thumbnailBusy}
            aria-label="公開画面を閉じる"
            title={
              busy || thumbnailBusy
                ? "処理が完了するまで閉じられません"
                : "公開画面を閉じる"
            }
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div data-app-modal-body className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
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
              <fieldset className="rounded-xl border border-slate-200 bg-white p-3.5">
                <legend className="px-1 text-xs font-semibold text-slate-700">
                  サムネイル
                </legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] sm:items-center">
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {thumbnailPreview ? (
                      <img
                        src={thumbnailPreview}
                        alt="現在設定されているサムネイル"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-500">
                        <ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" />
                        <span className="text-xs font-medium">サムネイル未設定</span>
                      </div>
                    )}
                    {thumbnailBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 text-xs font-semibold text-white">
                        サムネイルを保存中…
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs leading-5 text-slate-600">
                      現在の{projectLabel}のScene Viewをもとに、公開用画像を作成・更新できます。
                      保存した画像は <code>public/thumbnail.png</code> に反映されます。
                    </p>
                    <input
                      ref={thumbnailFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void selectThumbnailFile(event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void generateThumbnail()}
                        disabled={thumbnailBusy || !onGenerateThumbnail || !onSaveThumbnail}
                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Camera size={14} aria-hidden="true" />
                        {thumbnailBusy ? "作成中…" : `現在の${projectLabel}から作成`}
                      </button>
                      <button
                        type="button"
                        onClick={() => thumbnailFileInputRef.current?.click()}
                        disabled={thumbnailBusy || !onSaveThumbnail}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Image size={14} aria-hidden="true" />
                        画像を選択
                      </button>
                    </div>
                    {thumbnailError ? (
                      <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs leading-5 text-rose-700">
                        {thumbnailError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={onEditThumbnail}
                      disabled={thumbnailBusy}
                      className="mt-2 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Editorで詳細設定
                    </button>
                  </div>
                </div>
              </fieldset>
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

              {review.vramEstimate ? (
                <button
                  type="button"
                  onClick={() => setVramDetailsOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-left hover:border-violet-300 hover:bg-violet-100"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 shadow-sm">
                    <Gauge size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">
                      ロード容量・VRAMの目安
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                      ロード 約
                      {formatVramBytes(review.vramEstimate.loadBytes)}
                      {" / "}
                      VRAM 約
                      {formatVramBytes(review.vramEstimate.runtimeLowBytes)}〜
                      {formatVramBytes(review.vramEstimate.runtimeHighBytes)}
                      {" / "}
                      {review.vramEstimate.recommendations.length > 0
                        ? `${review.vramEstimate.recommendations.length}件の改善候補`
                        : "優先度の高い改善候補なし"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-violet-700">
                    詳細を見る
                  </span>
                </button>
              ) : null}

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
                XRiftへの送信が完了しました
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
                公開準備を取り消しました
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
                {unresolvedUploadAttempt
                  ? "前回の送信結果を確認できていません"
                  : "XRiftへ送信できませんでした"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {unresolvedUploadAttempt
                  ? "前回の送信がXRiftへ届いたかどうかを判断できないため、二重公開を避けて送信を止めています。"
                  : error || "処理を再実行するか、Editorへ戻って診断を確認してください。"}
              </p>
              {!unresolvedUploadAttempt && failure?.detail ? (
                <div className="mx-auto mt-5 max-w-2xl text-left">
                  <p className="text-xs font-semibold text-slate-700">
                    CLIの出力
                  </p>
                  <pre className="scrollbar-thin mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">
                    {failure.detail}
                  </pre>
                </div>
              ) : null}
              {unresolvedUploadAttempt ? (
                <div className="mx-auto mt-5 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left">
                  <p className="text-xs font-semibold text-amber-900">
                    XRiftで公開状況を確認してください
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    すでに公開されている場合は、解除せずEditorへ戻ってください。公開されていなければ、前回の試行を解除して送信し直せます。
                  </p>
                  {attemptCleared ? (
                    <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs leading-5 text-emerald-800">
                      前回の試行を解除しました。「準備を再確認」から送信し直せます。
                    </p>
                  ) : null}
                  {clearAttemptError ? (
                    <p
                      className="mt-2 rounded border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs leading-5 text-rose-800"
                      role="alert"
                    >
                      {clearAttemptError}
                    </p>
                  ) : null}
                  {onClearStaleUploadAttempt && !attemptCleared ? (
                    <button
                      type="button"
                      disabled={clearingAttempt}
                      onClick={() => {
                        setClearingAttempt(true);
                        setClearAttemptError(null);
                        void onClearStaleUploadAttempt()
                          .then(() => {
                            setAttemptCleared(true);
                            setFailure(null);
                          })
                          .catch((reason: unknown) => {
                            setClearAttemptError(
                              reason instanceof Error
                                ? reason.message
                                : String(reason),
                            );
                          })
                          .finally(() => setClearingAttempt(false));
                      }}
                      className="mt-2.5 flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {clearingAttempt ? (
                        <>
                          <RotateCcw size={13} className="animate-spin" aria-hidden="true" />
                          解除中
                        </>
                      ) : (
                        "公開されていないので前回の試行を解除する"
                      )}
                    </button>
                  ) : null}
                  <p className="mt-2 break-words font-mono text-[10px] leading-4 text-amber-700">
                    {error}
                  </p>
                </div>
              ) : null}
            </div>
          )}
          {thumbnailStagingSha256 ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left">
              <Check
                size={14}
                strokeWidth={2.5}
                className="mt-0.5 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-emerald-900">
                  公開用ステージングへコピー済み
                </div>
                <div className="mt-0.5 text-xs leading-5 text-emerald-800">
                  サムネイルのコピー元とコピー先のSHA-256が一致しました。
                </div>
                <code className="mt-0.5 block truncate text-xs text-emerald-700">
                  {thumbnailStagingSha256}
                </code>
              </div>
            </div>
          ) : null}
        </div>

        <footer data-app-modal-footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            {review.thumbnailReady ? <Image size={13} aria-hidden="true" /> : null}
            {review.signedIn ? <LogIn size={13} aria-hidden="true" /> : null}
            {stage === "review"
              ? ready
                ? "公開前の確認が完了しました"
                : "未完了の項目を修正してください"
              : stage === "succeeded"
                ? "XRiftから公開結果を受信しました"
                : stage === "cancelled"
                  ? "制作データは保持されています"
                  : stage === "failed"
                    ? "原因を確認してから再試行できます"
                    : progress?.label ?? "処理中…"}
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
                {stage === "failed" ? (
                  <button
                    type="button"
                    onClick={() => setSupportOpen(true)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <LifeBuoy size={14} aria-hidden="true" />
                    ヘルプと報告
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={thumbnailBusy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Editorへ戻る
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("review");
                    setFailure(null);
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
                  disabled={thumbnailBusy}
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
                  XRiftへ公開
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
      {review.vramEstimate ? (
        <VramEstimateDialog
          open={vramDetailsOpen}
          estimate={review.vramEstimate}
          subjectLabel={projectLabel}
          onClose={() => setVramDetailsOpen(false)}
          onApplyOptimizations={onApplyOptimizations}
        />
      ) : null}
    </div>
    <SupportReportModal
      open={supportOpen}
      context={{
        currentScreen: `${projectLabel}公開の失敗画面`,
        errorMessage: error,
        diagnostics: thumbnailStagingSha256
          ? [
              "公開用ステージングへコピー済み",
              "サムネイルのコピー元とコピー先のSHA-256が一致しました。",
              `SHA-256: ${thumbnailStagingSha256}`,
            ]
          : [],
      }}
      onClose={() => setSupportOpen(false)}
    />
    </>
  );
}
