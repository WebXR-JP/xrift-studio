import { assetSources, importGroups } from "../content";

export function Materials() {
  return (
    <section className="preview-section preview-section-soft px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div data-reveal>
            <p className="preview-eyebrow">使える素材</p>
            <h2 className="preview-section-title mt-4">いつもの素材から、すぐ始める。</h2>
            <p className="preview-section-copy mt-5">
              手元の3Dモデル、テクスチャ、音をそのまま取り込んで、シーンへ置けます。
              FBXやSTLのようにXRiftがそのままでは読めない形式も、取り込むときにGLBへ変換します。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3" data-reveal>
            {importGroups.map((group) => {
              const Icon = group.icon;
              return (
                <article key={group.label} className={`preview-import-card ${group.tone}`}>
                  <Icon size={22} />
                  <h3 className="mt-8 text-base font-black tracking-tight text-zinc-950">
                    {group.label}
                  </h3>
                  <p className="mt-2 text-xs font-bold leading-6 text-zinc-600">
                    {group.formats}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        <div
          className="preview-source-strip mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          data-reveal
        >
          {assetSources.map((source) => (
            <div key={source.name}>
              <span className="preview-source-mark">{source.mark}</span>
              <p className="mt-4 text-sm font-black text-zinc-950">{source.name}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{source.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
