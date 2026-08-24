import { BookOpen, ExternalLink } from "lucide-react";
import { XRIFT_STUDIO_WIKI_URL } from "../../lib/support-links";

export function WikiCallout() {
  return (
    <section className="preview-section bg-white px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div
          className="preview-wiki-callout grid gap-8 rounded-[2rem] border border-zinc-200 bg-zinc-50 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center"
          data-reveal
        >
          <div>
            <p className="preview-eyebrow">使い方ガイド</p>
            <h2 className="preview-section-title mt-4">もっと詳しく、使い方を知りたい。</h2>
            <p className="preview-section-copy mt-5 max-w-2xl">
              インストールから、素材の取り込み、シーン編集、プレイ、公開まで。制作の流れに沿った使い方ガイドです。
            </p>
          </div>
          <a
            href={XRIFT_STUDIO_WIKI_URL}
            target="_blank"
            rel="noreferrer"
            className="preview-button preview-button-dark preview-button-large w-full sm:w-auto"
          >
            <BookOpen size={17} />
            使い方ガイドを開く
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </section>
  );
}
