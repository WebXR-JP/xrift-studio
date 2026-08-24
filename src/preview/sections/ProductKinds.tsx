import { productKinds } from "../content";

export function ProductKinds() {
  return (
    <section className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl" data-reveal>
          <p className="preview-eyebrow">作れるもの</p>
          <h2 className="preview-section-title mt-4">ふたつのものを作れます。</h2>
          <p className="preview-section-copy mt-5 max-w-2xl">
            XRiftには「人が集まる空間」と「持ち歩けるもの」があります。どちらもこのアプリで作れます。
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2" data-reveal>
          {productKinds.map((kind) => {
            const Icon = kind.icon;
            return (
              <article key={kind.title} className={`preview-kind-card ${kind.tone}`}>
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-zinc-950 shadow-sm">
                    <Icon size={22} />
                  </span>
                  <span className="text-[11px] font-black tracking-[0.2em] opacity-70">
                    {kind.label}
                  </span>
                </div>
                <h3 className="mt-7 text-2xl font-black tracking-[-0.04em]">{kind.title}</h3>
                <p className="mt-3 max-w-md text-sm leading-7 opacity-80">{kind.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
