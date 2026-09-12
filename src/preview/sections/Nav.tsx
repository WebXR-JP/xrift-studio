import { ArrowUpRight } from "lucide-react";
import { BrandLockup } from "../BrandLockup";
import { editorUrl } from "../content";
import { XRIFT_STUDIO_GUIDE_URL } from "../../lib/support-links";

export function Nav() {
  return (
    <header className="landing-nav">
      <nav className="landing-container landing-nav-inner" aria-label="メインナビゲーション">
        <a href="#top" aria-label="XRift Studioのトップへ" className="landing-nav-brand">
          <BrandLockup size={32} />
        </a>
        <div className="landing-nav-links">
          <a href="#tools" className="preview-nav-link hidden md:inline-flex">機能</a>
          <a href={editorUrl} className="preview-nav-link hidden sm:inline-flex">ブラウザ版を試す<span className="landing-beta-mark">β</span></a>
          <a href={XRIFT_STUDIO_GUIDE_URL} className="preview-nav-link inline-flex">使い方</a>
          <a href="#download" className="preview-button preview-button-primary">
            ダウンロード<ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </nav>
    </header>
  );
}
