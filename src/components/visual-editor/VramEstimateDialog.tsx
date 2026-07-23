import { useEffect, type ReactNode } from "react";
import {
  Box,
  Gauge,
  Info,
  Lightbulb,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";
import {
  formatVramBytes,
  type VramDeviceRating,
  type WorldVramEstimate,
} from "../../lib/visual-editor/vram-estimate";

type Props = {
  open: boolean;
  estimate: WorldVramEstimate;
  subjectLabel: string;
  onClose: () => void;
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
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        event.stopPropagation();
        onClose();
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
              {subjectLabel}のVRAM使用量目安
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              公開対象のTextureとModelを解析し、GPU上へ展開した場合を概算しています。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="VRAM使用量の詳細を閉じる"
            title="VRAM使用量の詳細を閉じる"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Asset VRAM"
              value={formatVramBytes(estimate.assetBytes)}
              detail={`${estimate.textureCount} Texture / ${estimate.modelCount} Model`}
              icon={<Box size={16} aria-hidden="true" />}
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
                className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${RATING_CLASSES[estimate.smartphoneRating]}`}
              >
                {RATING_LABELS[estimate.smartphoneRating]}
              </span>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                256 MB以下を余裕あり、384 MB超を高負荷とするStudio基準
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
                  使用量が多い順
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
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">改善候補</h3>
            </div>
            {estimate.recommendations.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {estimate.recommendations.map((recommendation) => (
                  <div
                    key={recommendation.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-800">
                        {recommendation.title}
                      </div>
                      {recommendation.estimatedSavingBytes &&
                      recommendation.estimatedSavingBytes > 0 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          最大 約
                          {formatVramBytes(recommendation.estimatedSavingBytes)}削減
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {recommendation.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                現在のStudio基準で優先度の高い改善候補はありません。
              </div>
            )}
          </section>

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Info size={15} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-xs leading-5 text-slate-600">
              これは実測値ではありません。ブラウザ、GPU、画面解像度、影、ポストエフェクト、KTX2の転送先形式で変動します。
              PNG・JPEG・WebPはファイルサイズではなくGPU上のRGBA展開を基準にし、mipmap有効時は約33%を加算しています。
            </p>
          </div>
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            公開前の確認へ戻る
          </button>
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
