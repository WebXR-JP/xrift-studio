import { Blocks, Download, ExternalLink, GitBranch } from "lucide-react";
import { releaseUrl, repositoryUrl } from "../content";

export function FinalCta() {
  return (
    <section className="px-5 py-20 lg:px-8 lg:py-28">
      <div
        className="preview-final-cta relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] px-7 py-14 text-center text-white sm:px-12 sm:py-20"
        data-reveal
      >
        <div className="preview-final-grid" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-violet-200 ring-1 ring-white/15">
            <Blocks size={22} />
          </div>
          <h2 className="mt-7 text-balance text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-5xl">
            次のワールドは、ここから始まる。
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
            いま持っている素材と、つくりたい景色を持ってきてください。XRiftへ届けるところまで、一緒に進めます。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="preview-button preview-button-white preview-button-large w-full max-w-xs sm:w-auto"
            >
              <Download size={17} />
              無料でダウンロード
            </a>
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="preview-button preview-button-ghost preview-button-large w-full max-w-xs sm:w-auto"
            >
              <GitBranch size={17} />
              GitHubで見る
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
