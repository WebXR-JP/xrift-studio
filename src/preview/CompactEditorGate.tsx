import { ArrowLeft, Download, MonitorPlay, Play } from "lucide-react";
import { ProductScreenshot } from "./ProductScreenshot";
import { releaseUrl, type ProjectKind } from "./content";

/** Warns before opening the four-panel editor on a phone-sized viewport. */
export function CompactEditorGate({
  projectKind,
  onBack,
  onContinue,
}: {
  projectKind: ProjectKind;
  onBack: () => void;
  onContinue: () => void;
}) {
  const kindLabel = projectKind === "world" ? "World" : "Item";

  return (
    <main className="preview-compact-editor-gate min-h-screen overflow-x-hidden px-5 py-5">
      <div className="mx-auto flex max-w-xl items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="preview-button preview-button-light"
        >
          <ArrowLeft size={15} />
          紹介ページ
        </button>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
          最新{kindLabel} Editor
        </span>
      </div>

      <div className="mx-auto max-w-xl pb-10 pt-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <MonitorPlay size={22} />
        </span>
        <h1 className="mt-6 text-balance text-3xl font-black leading-tight tracking-[-0.045em] text-zinc-950">
          エディターは、広い画面でいちばん使いやすく。
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-600">
          最新版はHierarchy、Scene、Assets、Inspectorを同時に使う制作画面です。スマホでは横向きにするか、タブレット・PCでの操作をおすすめします。
        </p>

        <div className="mx-auto mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-violet-950/10">
          <ProductScreenshot compact />
        </div>

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="preview-button preview-button-primary preview-button-large w-full"
          >
            <Play size={16} fill="currentColor" />
            このまま最新エディターを開く
          </button>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="preview-button preview-button-light preview-button-large w-full"
          >
            <Download size={16} />
            デスクトップ版をダウンロード
          </a>
        </div>
      </div>
    </main>
  );
}
