import { Code2 } from "lucide-react";

export function ClassicBridge() {
  return (
    <section className="preview-section px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div
          className="grid gap-10 rounded-[2rem] bg-zinc-950 p-7 text-white sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:p-14"
          data-reveal
        >
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-black text-blue-300">
              <Code2 size={15} />
              コードで続けたいときも
            </span>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-[-0.045em] sm:text-4xl">
              作ったシーンを、コードの世界へも渡せる。
            </h2>
            <p className="mt-5 text-sm leading-7 text-zinc-400">
              画面で作ったものをClassicプロジェクトへ書き出したり、既存のR3F／XRiftコードをシーンへ取り込めます。どの作り方から始めても先へ進めます。
            </p>
            <p className="mt-4 text-[11px] font-semibold text-zinc-500">
              Classic変換は開発版として提供中です
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 font-mono text-xs shadow-inner">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              World.tsx
            </div>
            <div className="overflow-x-auto p-5 leading-7 text-zinc-300">
              <p>
                <span className="text-violet-300">import</span>{" "}
                {"{ XRiftStudioScene }"} <span className="text-violet-300">from</span>{" "}
                <span className="text-amber-200">'./xrift-studio/twilight-lakeside'</span>
              </p>
              <p className="mt-3">
                <span className="text-violet-300">export const</span> World = () =&gt; {"("}
              </p>
              <p className="pl-5 text-blue-200">&lt;XRiftStudioScene /&gt;</p>
              <p>{")"}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
