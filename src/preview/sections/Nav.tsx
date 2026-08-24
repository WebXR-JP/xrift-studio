import { Download } from "lucide-react";
import { BrandLockup } from "../BrandLockup";
import { releaseUrl } from "../content";
import { XRIFT_STUDIO_WIKI_URL } from "../../lib/support-links";

export function Nav() {
  return (
    <nav className="preview-nav sticky top-0 z-40 border-b border-white/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <a href="#top" aria-label="XRift Studioのトップへ">
          <BrandLockup />
        </a>
        <div className="flex items-center gap-1">
          <a href="#tools" className="preview-nav-link hidden sm:inline-flex">
            作れるもの
          </a>
          <a href="#create" className="preview-nav-link hidden md:inline-flex">
            作り方
          </a>
          <a href="#ai" className="preview-nav-link hidden lg:inline-flex">
            AIと一緒に
          </a>
          <a href="#try" className="preview-nav-link hidden lg:inline-flex">
            試す
          </a>
          <a
            href={XRIFT_STUDIO_WIKI_URL}
            target="_blank"
            rel="noreferrer"
            className="preview-nav-link hidden xl:inline-flex"
          >
            使い方ガイド
          </a>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="preview-button preview-button-dark ml-2"
          >
            <Download size={15} />
            <span className="hidden sm:inline">無料でダウンロード</span>
            <span className="sm:hidden">ダウンロード</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
