import { productKinds } from "../content";

export function ProductKinds() {
  return (
    <section className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl" data-reveal>
          <p className="preview-eyebrow">作れるもの</p>
          <h2 className="preview-section-title mt-4">作れるのは、ワールドとアイテム。</h2>
          <p className="preview-section-copy mt-5 max-w-2xl">
            XRiftには「人が集まる空間」と「持ち歩けるもの」があります。どちらも、このアプリだけで作れます。
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2" data-reveal>
          {productKinds.map((kind) => {
            const Icon = kind.icon;
            return (
              <article key={kind.title} className="preview-kind-card">
                {/*
                  The corner used to repeat the card's own heading — "ワールド"
                  above "ワールド" — so it is gone. The icon already says which
                  card this is, and the heading says it in words.
                */}
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                  <Icon size={22} />
                </span>
                <h3 className="mt-7 text-2xl font-black tracking-[-0.04em] text-zinc-950">
                  {kind.title}
                </h3>
                <p className="mt-3 max-w-md text-sm leading-7 text-zinc-600">{kind.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
