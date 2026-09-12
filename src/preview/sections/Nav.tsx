import { Download } from "lucide-react";
import { BrandLockup } from "../BrandLockup";
import { XRIFT_STUDIO_GUIDE_URL } from "../../lib/support-links";

export function Nav({ onOpenProjects }: { onOpenProjects?: () => void }) {
  return (
    <nav className="preview-nav sticky top-0 z-40 border-b border-white/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-y-1 px-4 py-2 lg:px-8">
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
            href={XRIFT_STUDIO_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="preview-nav-link inline-flex"
          >
            <span className="hidden sm:inline">使い方ガイド</span>
            <span className="sm:hidden">使い方</span>
          </a>
          {/*
            Scrolls rather than downloads. A sticky button that starts saving a
            40MB installer the moment it is touched, while someone is still
            reading, is its own kind of alarming — the download section a click
            away shows the file first and downloads on the button there.
          */}
          {onOpenProjects ? <button type="button" onClick={onOpenProjects} className="preview-button preview-button-dark ml-2">プロジェクトを開く</button> : <a href="#download" className="preview-button preview-button-dark ml-2">
            <Download size={15} />
            <span className="hidden sm:inline">無料でダウンロード</span>
            <span className="sm:hidden">入手</span>
          </a>}
        </div>
      </div>
    </nav>
  );
}
