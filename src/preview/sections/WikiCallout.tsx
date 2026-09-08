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
            <h2 className="preview-section-title mt-4">最初の作品を、ここから。</h2>
            <p className="preview-section-copy mt-5 max-w-2xl">
              インストールして画面を開き、物を置いて色を変える。保存してPlayで歩くところまで、順番に進められます。
            </p>
          </div>
          <a
            href={`${XRIFT_STUDIO_WIKI_URL}first-world.html`}
            target="_blank"
            rel="noreferrer"
            className="preview-button preview-button-dark preview-button-large w-full sm:w-auto"
          >
            <BookOpen size={17} />
            最初のワールドを作る
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </section>
  );
}
