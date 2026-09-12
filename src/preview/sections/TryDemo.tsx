import { Box, Globe2 } from "lucide-react";
import type { ProjectKind } from "../content";

export function TryDemo({ onOpenDemo, tablet = false }: { onOpenDemo: (kind: ProjectKind) => void; tablet?: boolean }) {
  return (
    <section id="try" className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div
          className="preview-demo-callout relative overflow-hidden rounded-[2rem] border border-violet-200 bg-white p-7 shadow-xl shadow-violet-950/5 sm:p-10 lg:p-14"
          data-reveal
        >
          <div className="preview-demo-glow" aria-hidden="true" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="preview-eyebrow">実際に触る</p>
              <h2 className="preview-section-title mt-4">
                {tablet ? "このiPadで、制作を続けられます。" : "ダウンロードする前に、ここで触れます。"}
              </h2>
              <p className="preview-section-copy mt-5 max-w-2xl">
                ビジュアルエディターを、このページで開けます。素材を配置してPlayで確かめ、Stopで編集へ戻れます。編集内容はブラウザへ自動保存します。
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                  ブラウザで編集・保存
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-600">
                  ワールド / アイテム対応
                </span>
              </div>
              <p className="mt-4 text-xs font-medium leading-6 text-zinc-500">
                .xriftstudioファイルに書き出すと、素材ごとパソコンへ引き継げます。AI接続とXRiftへの公開はデスクトップ版で行います。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={() => onOpenDemo("world")}
                className="preview-button preview-button-primary preview-button-large w-full sm:w-auto"
              >
                <Globe2 size={17} />
                {tablet ? "ワールドを開く" : "ワールドのデモを開く"}
              </button>
              <button
                type="button"
                onClick={() => onOpenDemo("item")}
                className="preview-button preview-button-light preview-button-large w-full sm:w-auto"
              >
                <Box size={17} />
                {tablet ? "アイテムを開く" : "アイテムのデモを開く"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
