import { worldTools } from "../content";

/**
 * What a world is made of.
 *
 * The page used to describe the workflow three times over and never once show
 * what an author can actually build, while terrain, water, sky, light, audio
 * and the interactivity graph went unmentioned. This section is the answer to
 * that: one honest capture of a scene built entirely in the editor, then the
 * six materials it was built from.
 */
export function WorldTools() {
  return (
    <section
      id="tools"
      className="preview-section preview-section-soft px-5 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl" data-reveal>
          <p className="preview-eyebrow">世界を作る道具</p>
          <h2 className="preview-section-title mt-4">地形も、水も、空も、光も。</h2>
          <p className="preview-section-copy mt-5 max-w-2xl">
            素材を置いていくだけではありません。地面を彫って草を生やし、水面を揺らし、空の色を決める。
            世界そのものを、このアプリの中で作れます。
          </p>
        </div>

        <figure className="preview-showcase mt-12" data-reveal>
          <img
            src="./world-showcase.webp"
            alt="XRift Studioで作った湖畔のシーン。起伏のある地形に草が生え、手前に波の立つ水面、奥に夕暮れの空が広がっている"
            className="block h-auto w-full"
          />
          <figcaption className="preview-showcase-caption">
            このページのエディター画面と同じシーンです。地形、草、水、空、光のすべてをXRift Studioの中で作っています。
          </figcaption>
        </figure>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-reveal>
          {worldTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <article key={tool.title} className="preview-tool-card">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                  <Icon size={20} />
                </span>
                <h3 className="mt-5 text-base font-black tracking-tight text-zinc-950">
                  {tool.title}
                </h3>
                <p className="mt-2.5 text-sm leading-7 text-zinc-600">{tool.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
