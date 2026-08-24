import { Check, ScanSearch, Upload } from "lucide-react";

export function PublishCheck() {
  return (
    <section className="preview-section preview-dark-section px-5 text-white lg:px-8">
      <div className="preview-dark-grid" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div data-reveal>
            <span className="preview-dark-kicker">
              <ScanSearch size={14} />
              公開前まで、ちゃんと見える
            </span>
            <h2 className="mt-6 text-balance text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-5xl">
              「たぶん大丈夫」を、
              <span className="block text-violet-300">公開前に終わらせる。</span>
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              タイトル、説明、サムネイルの見落としをチェックし、ロード容量やVRAMの目安も確認できます。届く形に整えてXRiftへ送れます。
            </p>
          </div>

          <div className="preview-publish-panel" data-reveal>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-black text-white">公開前の最終チェック</p>
                <p className="mt-1 text-[11px] text-zinc-500">Twilight lakeside / World</p>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">
                準備できました
              </span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                {["タイトルと説明を編集済み", "サムネイルを設定済み", "シーンの検査が完了"].map(
                  (item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-xs font-semibold text-zinc-200"
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <Check size={12} strokeWidth={3} />
                      </span>
                      {item}
                    </div>
                  ),
                )}
              </div>
              <div className="rounded-2xl border border-violet-400/20 bg-violet-400/8 p-4">
                <p className="text-[10px] font-bold tracking-[0.14em] text-violet-300">
                  LOAD ESTIMATE
                </p>
                <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">18.4 MB</p>
                <p className="mt-1 text-[11px] text-zinc-400">初回ロードの目安</p>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-violet-400 to-blue-400" />
                </div>
                <p className="mt-3 text-[10px] leading-5 text-zinc-500">
                  容量の大きい素材と最適化候補も確認できます
                </p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-zinc-500">
                アップロード後も結果を同じ画面に表示
              </span>
              <span className="preview-button preview-button-white">
                <Upload size={14} />
                XRiftへアップロード
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
