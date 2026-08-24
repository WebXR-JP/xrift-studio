import { ProductScreenshot } from "../ProductScreenshot";
import { creationFlow } from "../content";

/**
 * How the work actually goes.
 *
 * This replaces three separate sections — "選ばれる理由", "制作の流れ" and
 * "操作感" — which between them told the same 素材→編集→確認→公開 story three
 * times. One screenshot beside the four steps says it once.
 */
export function CreationFlow() {
  return (
    <section id="create" className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl" data-reveal>
          <p className="preview-eyebrow">作り方</p>
          <h2 className="preview-section-title mt-4">
            持ち込んで、組んで、確かめて、公開する。
          </h2>
          <p className="preview-section-copy mt-5 max-w-2xl">
            素材の取り込みから公開までを、ひとつのアプリで進められます。必要なものが同じ画面に揃っているので、
            別のツールを行き来する手間がありません。
          </p>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="relative" data-reveal>
            <div className="preview-screenshot-backdrop" aria-hidden="true" />
            <ProductScreenshot compact />
          </div>
          <div className="preview-flow-list" data-reveal>
            {creationFlow.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.number} className="preview-flow-row">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-white">
                    <Icon size={19} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-black tracking-[0.16em] text-violet-600">
                        {step.number}
                      </span>
                      <h3 className="text-base font-black tracking-tight text-zinc-950">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-zinc-600">{step.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
