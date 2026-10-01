import { useEffect } from "react";
import { ArrowRight, BookOpen, Bot, Globe2, Monitor, PackageOpen } from "lucide-react";
import { XRIFT_STUDIO_GUIDE_URL } from "../lib/support-links";
import { editorFeatures, editorUrl } from "./content";
import { Nav } from "./sections/Nav";
import { DownloadSection } from "./sections/DownloadSection";
import { Faq } from "./sections/Faq";
import { Footer } from "./sections/Footer";

const assetUrl = (name: string) => `${import.meta.env.BASE_URL}${name}`;

export default function LandingPage() {
  useEffect(() => {
    let targetId: string;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!targetId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="preview-shell landing-page">
      <a href="#main" className="landing-skip-link">本文へ</a>
      <Nav />
      <main id="main">
        <section id="top" className="landing-hero landing-section">
          <div className="landing-container">
            <p className="landing-eyebrow">XRift Studio · 無料のワールド・アイテム制作ツール</p>
            <h1>3Dモデルを並べて、<br />XRiftのワールドを作る。</h1>
            <p className="landing-lead">
              モデルの配置、質感、照明を画面上で編集できます。Playで歩き、見た目や動きを確認できます。
              ワールドで使うアイテムも作れます。
            </p>
            <div className="landing-actions">
              <a href="#download" className="preview-button preview-button-primary preview-button-large">
                デスクトップ版をダウンロード
              </a>
              <a href={editorUrl} className="preview-button preview-button-light preview-button-large">
                ブラウザ版を試す<span className="landing-beta-mark">β</span><ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <p className="landing-caption">ブラウザ版βではAPIキーを使ってワールドを送信できます。アイテムやスクリプトを含むワールドは、デスクトップ版から公開してください。</p>
            <figure className="landing-editor-figure">
              <a href={editorUrl} aria-label="ブラウザ版βを試す" className="landing-screenshot-link">
                <img
                  src={assetUrl("visual-editor-screenshot.webp")}
                  alt="湖畔のワールドを開いたXRift Studio。Hierarchy、シーン、Assets、Inspectorで配置や質感を編集する画面"
                  width={2240}
                  height={1400}
                  fetchPriority="high"
                />
                <span className="landing-screenshot-beta">ブラウザ版を試す <span className="landing-beta-mark">β</span></span>
              </a>
              <figcaption>デスクトップ版の編集画面とPlay画面。タッチ端末ではパネルを切り替えて操作できます。</figcaption>
            </figure>
          </div>
        </section>

        <section id="tools" className="landing-section landing-section-bordered">
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">ビジュアルエディター</p>
              <h2>素材を配置し、<br className="sm:hidden" />見た目と動きを設定する。</h2>
              <p>手持ちの3Dモデルや画像、音声を取り込めます。カタログから素材や機能を追加するには「外部から追加」を開いてください。</p>
            </div>
            <div className="landing-feature-grid">
              {editorFeatures.map(({ title, text, icon: Icon, formats }) => (
                <article key={title} className="landing-feature">
                  <Icon size={23} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <p className="landing-feature-meta">{formats}</p>
                </article>
              ))}
            </div>
            <a href={`${XRIFT_STUDIO_GUIDE_URL}first-world.html`} className="landing-text-link">
              <BookOpen size={17} aria-hidden="true" />最初のワールドの作り方<ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="create" className="landing-section landing-section-soft">
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">XRift Studioを始める</p>
              <h2>パソコンでも、<br />タッチ端末でも編集できる。</h2>
              <p>デスクトップ版ではワールドとアイテムを制作・公開できます。ブラウザ版βはパソコン、iPad、スマートフォンで使えます。</p>
            </div>
            <div className="landing-platform-grid">
              <article className="landing-platform">
                <Monitor size={24} aria-hidden="true" />
                <h3>デスクトップ版</h3>
                <p>Windows・macOS・Linuxで使えます。ワールドとアイテムの公開、AIとの連携、コード編集にも対応しています。</p>
                <a href="#download" className="landing-text-link">ダウンロードへ<ArrowRight size={16} aria-hidden="true" /></a>
              </article>
              <article className="landing-platform">
                <Globe2 size={24} aria-hidden="true" />
                <h3>ブラウザ版 <span className="landing-beta-mark">β</span></h3>
                <p>インストールせずに編集できます。変更は使っているブラウザに自動保存されます。APIキーでワールドを送信したり、プロジェクトをデスクトップ版へ移したりできます。</p>
                <div className="landing-platform-links">
                  <a href={editorUrl} className="landing-text-link">ブラウザ版を試す<span className="landing-beta-mark">β</span><ArrowRight size={16} aria-hidden="true" /></a>
                </div>
              </article>
            </div>
            <div className="landing-handoff">
              <PackageOpen size={23} aria-hidden="true" />
              <div>
                <h3>パソコンで続きを編集するには</h3>
                <p>「ファイル」の「プロジェクトを書き出す」で.xriftstudioファイルを保存してください。パソコンにファイルを移し、デスクトップ版で開けば続きを編集できます。</p>
                <a href={`${XRIFT_STUDIO_GUIDE_URL}ipad.html`} className="landing-text-link">タッチ操作と引き継ぎの手順<ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="landing-section">
          <div className="landing-container landing-ai-grid">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">デスクトップ版のAI連携</p>
              <h2>AIに頼んで、<br />シーンを編集する。</h2>
              <p>CodexやClaude CodeなどをMCPで接続できます。モデルの配置やマテリアルの調整を会話で依頼し、結果をエディターで確認してください。</p>
              <p>AIが変更した配置や質感も「元に戻す」で取り消せます。</p>
              <a href={`${XRIFT_STUDIO_GUIDE_URL}ai-connection.html`} className="landing-text-link">
                <Bot size={17} aria-hidden="true" />AIの接続方法<ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <figure className="landing-ai-figure">
              <img src={assetUrl("editor-ai-panel.webp")} alt="デスクトップ版のAI接続画面。Codex、Claude Codeなどの接続設定を登録できる" width={1760} height={1192} loading="lazy" decoding="async" />
            </figure>
          </div>
        </section>

        <DownloadSection />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
