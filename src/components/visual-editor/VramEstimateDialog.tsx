import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Box,
  CheckCircle2,
  Download,
  Gauge,
  Info,
  Lightbulb,
  Loader2,
  Monitor,
  Music,
  Sparkles,
  Smartphone,
  X,
} from "lucide-react";
import type { AssetOptimizationProgress } from "../../lib/visual-editor/asset-optimization";
import {
  formatVramBytes,
  formatLoadSeconds,
  type VramDeviceRating,
  type WorldVramEstimate,
} from "../../lib/visual-editor/vram-estimate";

type Props = {
  open: boolean;
  estimate: WorldVramEstimate;
  subjectLabel: string;
  onClose: () => void;
  onApplyOptimizations?: (
    recommendationIds: string[],
    report: (progress: AssetOptimizationProgress) => void,
  ) => Promise<{
    optimizedAssetCount: number;
    beforeBytes: number;
    afterBytes: number;
  }>;
};

const RATING_LABELS: Record<VramDeviceRating, string> = {
  comfortable: "余裕あり",
  watch: "要確認",
  high: "負荷が高い",
};

const RATING_CLASSES: Record<VramDeviceRating, string> = {
  comfortable: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800",
};

export function VramEstimateDialog({
  open,
  estimate,
  subjectLabel,
  onClose,
  onApplyOptimizations,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<AssetOptimizationProgress | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{
    optimizedAssetCount: number;
    beforeBytes: number;
    afterBytes: number;
  } | null>(null);
  const actionableRecommendations = useMemo(
    () =>
      estimate.recommendations.filter(
        (recommendation) => Boolean(recommendation.operation),
      ),
    [estimate.recommendations],
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (applying) return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applying, onClose, open]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setProgress(null);
      setApplyError(null);
      setApplyResult(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!applying) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vram-estimate-title"
        className="flex max-h-[86vh] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-violet-700">
              <Gauge size={18} aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Performance estimate
              </span>
            </div>
            <h2
              id="vram-estimate-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              {subjectLabel}の容量・パフォーマンス目安
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              公開対象のTexture・Model・Audioから、ロード容量とGPU使用量を概算しています。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label="VRAM使用量の詳細を閉じる"
            title="VRAM使用量の詳細を閉じる"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Asset VRAM"
              value={formatVramBytes(estimate.assetBytes)}
              detail={`${estimate.textureCount} Texture / ${estimate.modelCount} Model`}
              icon={<Box size={16} aria-hidden="true" />}
            />
            <SummaryCard
              label="初回Assetロード"
              value={formatVramBytes(estimate.loadBytes)}
              detail={`10 Mbpsで約${formatLoadSeconds(estimate.mobileLoadSeconds)}`}
              icon={<Download size={16} aria-hidden="true" />}
            />
            <SummaryCard
              label="実行時の全体目安"
              value={`${formatVramBytes(estimate.runtimeLowBytes)}〜${formatVramBytes(estimate.runtimeHighBytes)}`}
              detail="描画バッファ等の32〜96 MBを加算"
              icon={<Gauge size={16} aria-hidden="true" />}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Smartphone size={16} aria-hidden="true" />
                スマートフォン目安
              </div>
              <span
                className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${RATING_CLASSES[
                  estimate.smartphoneRating === "high" ||
                  estimate.smartphoneLoadRating === "high"
                    ? "high"
                    : estimate.smartphoneRating === "watch" ||
                        estimate.smartphoneLoadRating === "watch"
                      ? "watch"
                      : "comfortable"
                ]}`}
              >
                {RATING_LABELS[
                  estimate.smartphoneRating === "high" ||
                  estimate.smartphoneLoadRating === "high"
                    ? "high"
                    : estimate.smartphoneRating === "watch" ||
                        estimate.smartphoneLoadRating === "watch"
                      ? "watch"
                      : "comfortable"
                ]}
              </span>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                VRAM 256 MB、初回Asset 20 MB以下を余裕ありとするStudio基準
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-slate-700">
              <Monitor size={13} aria-hidden="true" />
              デスクトップ: {RATING_LABELS[estimate.desktopRating]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-slate-700">
              メッシュ配置: {estimate.meshPlacementCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-slate-700">
              <Download size={13} aria-hidden="true" />
              高速回線50 Mbps: 約{formatLoadSeconds(estimate.fastLoadSeconds)}
            </span>
            {estimate.unknownDimensionTextureCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1.5 text-amber-800">
                解像度不明: {estimate.unknownDimensionTextureCount} Texture
              </span>
            ) : null}
          </div>

          <section className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  VRAM使用量が多い順
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  同じAssetの複数配置はGPUリソースを共有する前提です。
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {estimate.contributions.length} Assets
              </span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {estimate.contributions.length > 0 ? (
                estimate.contributions.map((contribution, index) => {
                  const share =
                    estimate.assetBytes > 0
                      ? (contribution.estimatedBytes / estimate.assetBytes) * 100
                      : 0;
                  return (
                    <div
                      key={contribution.assetId}
                      className="border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-sm font-semibold text-slate-800">
                              {contribution.name}
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                {contribution.kind === "texture" ? "Texture" : "Model"}
                                {contribution.referenceCount > 1
                                  ? ` / ${contribution.referenceCount}参照`
                                  : ""}
                              </span>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                              {formatVramBytes(contribution.estimatedBytes)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {contribution.detail}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${Math.max(1, share)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  VRAMを概算できる公開対象Assetはありません。
                </div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Download size={16} className="text-sky-600" aria-hidden="true" />
                  ロード容量が多い順
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  公開時にコピーされるAsset原本の合計です。アプリ本体と通信オーバーヘッドは含みません。
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {estimate.loadContributions.length} Assets
              </span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {estimate.loadContributions.length > 0 ? (
                estimate.loadContributions.map((contribution, index) => {
                  const share =
                    estimate.loadBytes > 0
                      ? (contribution.estimatedBytes / estimate.loadBytes) * 100
                      : 0;
                  return (
                    <div
                      key={`load:${contribution.assetId}`}
                      className="border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-sm font-semibold text-slate-800">
                              {contribution.kind === "audio" ? (
                                <Music
                                  size={13}
                                  className="mr-1.5 inline text-slate-400"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {contribution.name}
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                {contribution.kind === "texture"
                                  ? "Texture"
                                  : contribution.kind === "model"
                                    ? "Model"
                                    : "Audio"}
                              </span>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                              {formatVramBytes(contribution.estimatedBytes)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {contribution.detail}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${Math.max(1, share)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  ロード容量を概算できる公開対象Assetはありません。
                </div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900">改善候補</h3>
              </div>
              {onApplyOptimizations && actionableRecommendations.length > 0 ? (
                <button
                  type="button"
                  disabled={applying}
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.size === actionableRecommendations.length
                        ? new Set()
                        : new Set(
                            actionableRecommendations.map(
                              (recommendation) => recommendation.id,
                            ),
                          ),
                    )
                  }
                  className="text-xs font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-40"
                >
                  {selectedIds.size === actionableRecommendations.length
                    ? "選択を解除"
                    : "自動対応をすべて選択"}
                </button>
              ) : null}
            </div>
            {estimate.recommendations.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {estimate.recommendations.map((recommendation) => {
                  const actionable = Boolean(
                    onApplyOptimizations && recommendation.operation,
                  );
                  const checked = selectedIds.has(recommendation.id);
                  return (
                  <label
                    key={recommendation.id}
                    className={`rounded-xl border px-4 py-3 ${
                      checked
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-slate-50"
                    } ${actionable ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      {actionable ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={applying}
                          onChange={(event) => {
                            setApplyError(null);
                            setApplyResult(null);
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(recommendation.id);
                              else next.delete(recommendation.id);
                              return next;
                            });
                          }}
                          className="mt-1 size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                      ) : (
                        <span className="mt-0.5 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          個別対応
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-800">
                        {recommendation.title}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recommendation.estimatedLoadSavingBytes &&
                        recommendation.estimatedLoadSavingBytes > 0 ? (
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">
                            ロード 最大 約
                            {formatVramBytes(
                              recommendation.estimatedLoadSavingBytes,
                            )}削減
                          </span>
                        ) : null}
                        {recommendation.estimatedVramSavingBytes &&
                        recommendation.estimatedVramSavingBytes > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                            VRAM 最大 約
                            {formatVramBytes(
                              recommendation.estimatedVramSavingBytes,
                            )}削減
                          </span>
                        ) : null}
                        {recommendation.impact === "render" ? (
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">
                            描画負荷を改善
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {recommendation.detail}
                    </p>
                    {actionable ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                        <Sparkles size={13} aria-hidden="true" />
                        選択するとStudio内で変換して同じAssetへ反映します
                      </p>
                    ) : null}
                      </div>
                    </div>
                  </label>
                )})}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                現在のStudio基準で優先度の高い改善候補はありません。
              </div>
            )}
          </section>

          {progress ? (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                {progress.label}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-violet-600 transition-[width]"
                  style={{
                    width: `${Math.max(
                      4,
                      (progress.completed / Math.max(1, progress.total)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
          {applyResult ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">
                  {applyResult.optimizedAssetCount}件のAssetを最適化しました
                </div>
                <div className="mt-0.5 text-xs">
                  原本 {formatVramBytes(applyResult.beforeBytes)} → 変換後{" "}
                  {formatVramBytes(applyResult.afterBytes)}
                </div>
              </div>
            </div>
          ) : null}
          {applyError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {applyError}
              <div className="mt-1 text-xs">
                元のAssetは変更されていません。選択内容を確認して再試行できます。
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Info size={15} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-xs leading-5 text-slate-600">
              これは実測値ではありません。ロード時間はAsset原本と回線速度からの単純計算で、キャッシュ、CDN、アプリ本体、HTTP処理を含みません。
              VRAMはブラウザ、GPU、画面解像度、影、ポストエフェクト、KTX2の転送先形式で変動します。
              PNG・JPEG・WebPはGPU上のRGBA展開を基準にし、mipmap有効時は約33%を加算しています。
            </p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500">
            {selectedIds.size > 0
              ? `${selectedIds.size}件の改善を選択中`
              : "チェックした改善だけをAssetへ反映します"}
          </div>
          <div className="flex items-center gap-2">
          {onApplyOptimizations && actionableRecommendations.length > 0 ? (
            <button
              type="button"
              disabled={applying || selectedIds.size === 0}
              onClick={() => {
                setApplying(true);
                setApplyError(null);
                setApplyResult(null);
                setProgress(null);
                void onApplyOptimizations([...selectedIds], setProgress)
                  .then((result) => {
                    setApplyResult(result);
                    setSelectedIds(new Set());
                  })
                  .catch((error) =>
                    setApplyError(
                      error instanceof Error
                        ? error.message
                        : "Assetを最適化できませんでした。",
                    ),
                  )
                  .finally(() => {
                    setApplying(false);
                    setProgress(null);
                  });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles size={15} aria-hidden="true" />
              )}
              {applying ? "最適化しています" : "選択した最適化を適用"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            公開前の確認へ戻る
          </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}
