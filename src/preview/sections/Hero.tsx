import { useState } from "react";
import {
  Check,
  MonitorPlay,
  PackageOpen,
  Play,
  Shapes,
  Sparkles,
} from "lucide-react";
import { DownloadButton } from "../DownloadButton";
import { ProductScreenshot } from "../ProductScreenshot";
import { useDownloadCta } from "../lib/useLatestRelease";
import { type ProjectKind } from "../content";

const pills = [
  { icon: Shapes, text: "ワールド制作", tone: "preview-hero-pill-violet" },
  { icon: PackageOpen, text: "アイテム制作", tone: "preview-hero-pill-cyan" },
  { icon: MonitorPlay, text: "画面でも、コードでも", tone: "preview-hero-pill-amber" },
] as const;

export function Hero({ onOpenDemo }: { onOpenDemo: (kind: ProjectKind) => void }) {
  const cta = useDownloadCta();
  const [started, setStarted] = useState(false);

  return (
    <section
      id="top"
      className="preview-hero relative overflow-hidden px-5 pb-20 pt-16 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24"
    >
      <div className="preview-hero-grid" aria-hidden="true" />
      <div className="preview-hero-glow preview-hero-glow-one" aria-hidden="true" />
      <div className="preview-hero-glow preview-hero-glow-two" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <div className="preview-kicker mx-auto" data-reveal>
            <Sparkles size={14} />
            XRiftのワールド・アイテムを、無料で作れるデスクトップアプリ
          </div>
          <h1
            className="preview-hero-title mt-6 text-balance font-black leading-[0.98] tracking-[-0.065em] text-zinc-950"
            data-reveal
          >
            置いて、動かして、
            <span className="preview-gradient-text block">そのままXRiftへ。</span>
          </h1>
          <p
            className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-8 text-zinc-600 sm:text-lg"
            data-reveal
          >
            地形を彫り、草を生やし、水と空をつくる。持っている3Dモデルやアバターを置いて、その場でプレイ。
            書き出しもビルドも挟まず、XRiftへそのまま公開できます。
          </p>
          <ul
            className="mx-auto mt-8 flex max-w-3xl flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:flex-wrap"
            data-reveal
          >
            {pills.map((pill) => {
              const Icon = pill.icon;
              return (
                <li key={pill.text} className={`preview-hero-pill ${pill.tone}`}>
                  <Icon size={15} />
                  {pill.text}
                </li>
              );
            })}
          </ul>
          <div
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            data-reveal
          >
            <DownloadButton
              cta={cta}
              variant="primary"
              large
              className="w-full max-w-xs sm:w-auto"
              onStarted={() => setStarted(true)}
            />
            <button
              type="button"
              onClick={() => onOpenDemo("world")}
              className="preview-button preview-button-light preview-button-large w-full max-w-xs sm:w-auto"
            >
              <Play size={16} fill="currentColor" />
              エディターを試す（このページで）
            </button>
          </div>
          {/*
            The line under the button says what the button is about to do:
            which version, which file, how large. Someone who is unsure what a
            download button on an unfamiliar site will save can read it before
            pressing, and after pressing it says where to go next instead of
            leaving the page silent.
          */}
          <p
            className="mt-4 text-xs font-medium text-zinc-500"
            data-reveal
            aria-live="polite"
          >
            {started ? (
              <>
                ダウンロードを開始しました。
                <a href="#download" className="preview-hero-download-link">
                  インストールの手順を見る
                </a>
              </>
            ) : (
              <>
                {cta.meta}
                <span className="mx-1.5 text-zinc-300">/</span>
                無料・オープンソース
                <span className="mx-1.5 text-zinc-300">/</span>
                <a href="#download" className="preview-hero-download-link">
                  {cta.direct ? "他のOSとインストール手順" : "OSごとのファイルを見る"}
                </a>
              </>
            )}
          </p>
        </div>

        <div
          className="preview-hero-stage relative mx-auto mt-14 max-w-6xl lg:mt-18"
          data-reveal
        >
          {/*
            No floating callouts over the screenshot. They were annotations
            stuck to the outside of the window that repeated the copy above,
            and the "自動保存済み" one imitated app chrome from outside the app.
            The capture is of a real scene now and carries the point on its own.
          */}
          <button
            type="button"
            onClick={() => onOpenDemo("world")}
            className="preview-hero-stage-button block w-full text-left"
            aria-label="ビジュアルエディターのデモを開く"
          >
            <ProductScreenshot interactive />
          </button>
        </div>

        <div
          className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-4 border-y border-zinc-200/80 py-5 text-center sm:grid-cols-4"
          data-reveal
        >
          {["ビジュアル制作", "コード制作", "プレイで確認", "XRiftへ公開"].map((item) => (
            <span
              key={item}
              className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-600 sm:text-sm"
            >
              <Check size={14} className="text-violet-600" strokeWidth={2.5} />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
