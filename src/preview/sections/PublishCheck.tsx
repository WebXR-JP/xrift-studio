import { Check, ScanSearch } from "lucide-react";

/**
 * What the editor checks before a world leaves the machine.
 *
 * The screen shown here is a capture of the real publish dialog. Screens that
 * exist are shown, never rebuilt in DOM: a hand-drawn copy invents numbers the
 * app never produced, and it reads as cheaper than the thing it depicts. Text
 * dressed up as a button is the same problem — the reader cannot tell what is
 * a picture and what they can press.
 */
const checks = [
  {
    title: "タイトルと説明",
    text: "テンプレートのままになっていないかを見て、その場で直せます。",
  },
  {
    title: "サムネイル",
    text: "いま開いているワールドの画を、そのままサムネイルにできます。送信のときは、コピー元とコピー先のSHA-256を照合します。",
  },
  {
    title: "公開先",
    text: "アカウントと公開先IDを確認し、新規作成か既存の更新かを決めてから送ります。",
  },
] as const;

export function PublishCheck() {
  return (
    <section className="preview-section preview-dark-section px-5 text-white lg:px-8">
      <div className="preview-dark-grid" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.66fr] lg:items-center">
          <div data-reveal>
            <span className="preview-dark-kicker">
              <ScanSearch size={14} />
              公開する前に、全部見える
            </span>
            <h2 className="mt-6 text-balance text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-5xl">
              「たぶん大丈夫」を、
              <span className="block text-violet-300">公開前に終わらせる。</span>
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              送信を始める前に、届く形になっているかを一つずつ確かめます。足りないものがあれば、
              同じ画面で直してから先へ進めます。
            </p>

            <div className="mt-10 max-w-xl divide-y divide-white/10 border-y border-white/10">
              {checks.map((check) => (
                <article key={check.title} className="flex gap-4 py-5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black tracking-tight text-white">
                      {check.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-7 text-zinc-400">{check.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <p className="mt-7 text-xs leading-6 text-zinc-500">
              ロード容量とVRAMの目安は、エディターの診断で確認できます。
            </p>
          </div>

          <figure className="preview-publish-figure" data-reveal>
            <img
              src="./editor-publish-check.webp"
              alt="XRift Studioの公開前確認ダイアログ。タイトル、説明、サムネイル、XRiftアカウント、公開先の確認が並び、すべて緑のチェックが付いている"
              className="block h-auto w-full"
            />
          </figure>
        </div>
      </div>
    </section>
  );
}
