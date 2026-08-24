import { Bot } from "lucide-react";
import { aiPoints } from "../content";

/**
 * The MCP integration, at the size it actually is.
 *
 * This is the part of the editor with no counterpart in the tools it sits
 * beside, so it gets a section of its own rather than a bullet among others.
 * The claims here are checked by the build on every run — see the note above
 * `aiPoints` in `../content` for what has to move together with the numbers.
 */
export function AiCollaboration() {
  return (
    <section id="ai" className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div data-reveal>
            <p className="preview-eyebrow">AIと一緒に</p>
            <h2 className="preview-section-title mt-4">
              話しかけると、シーンが変わる。
            </h2>
            <p className="preview-section-copy mt-5">
              手元のAIクライアントをXRift Studioへつなぐと、いま開いているシーンをそのまま編集してもらえます。
              画面の操作を代わりにやってもらう感覚に近く、結果はすぐシーンに現れます。
            </p>
            <div className="mt-9 divide-y divide-zinc-200 border-y border-zinc-200">
              {aiPoints.map((point) => {
                const Icon = point.icon;
                return (
                  <article
                    key={point.title}
                    className="grid grid-cols-[2.75rem_1fr] gap-4 py-6"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                      <Icon size={19} />
                    </span>
                    <div>
                      <h3 className="text-base font-black tracking-tight text-zinc-950">
                        {point.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-zinc-600">{point.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3.5 py-2 text-[11px] font-bold text-violet-800">
              <Bot size={13} />
              デスクトップ版の機能です。このページのデモからは接続できません。
            </p>
          </div>

          <figure className="preview-ai-figure" data-reveal>
            <img
              src="./editor-ai-panel.webp"
              alt="XRift StudioのAI接続画面。Codex、Claude Code、OpenCodeを登録できる一覧を表示している"
              className="block h-auto w-full"
            />
          </figure>
        </div>
      </div>
    </section>
  );
}
