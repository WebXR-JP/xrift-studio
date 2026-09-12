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
            <h1>XRiftのワールドを<br />ブラウザでつくる。</h1>
            <p className="landing-lead">
              3Dモデルを並べて、質感や光を調整。Playで歩きながら、空間を仕上げられます。
              ワールドで使うアイテムも作れます。
            </p>
            <div className="landing-actions">
              <a href={editorUrl} className="preview-button preview-button-primary preview-button-large">
                ビジュアルエディターを開く<ArrowRight size={17} aria-hidden="true" />
              </a>
              <a href="#download" className="preview-button preview-button-light preview-button-large">
                デスクトップ版をダウンロード
              </a>
            </div>
            <p className="landing-caption">インストール不要。パソコン・iPad・スマートフォンで編集できます。XRiftへの公開はデスクトップ版から。</p>
            <figure className="landing-editor-figure">
              <a href={editorUrl} aria-label="ビジュアルエディターを開く" className="landing-screenshot-link">
                <img
                  src={assetUrl("visual-editor-screenshot.webp")}
                  alt="湖畔のワールドを開いたXRift Studio。Hierarchy、シーン、Assets、Inspectorで配置や質感を編集する画面"
                  width={2240}
                  height={1400}
                  fetchPriority="high"
                />
              </a>
              <figcaption>デスクトップ版の編集・Play画面。タッチ端末ではパネルを切り替えて操作します。</figcaption>
            </figure>
          </div>
        </section>

        <section id="tools" className="landing-section landing-section-bordered">
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">ビジュアルエディター</p>
              <h2>素材を配置して、<br className="sm:hidden" />見た目と動きを整える。</h2>
              <p>手持ちの3Dモデルや画像、音声を追加できます。素材や機能を探すときは「外部から追加」へ。</p>
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
              <p className="landing-eyebrow">制作を始める</p>
              <h2>ブラウザで編集。<br />パソコンで公開。</h2>
              <p>ブラウザ版で作ったプロジェクトは、素材ごとデスクトップ版へ引き継げます。</p>
            </div>
            <div className="landing-platform-grid">
              <article className="landing-platform">
                <Globe2 size={24} aria-hidden="true" />
                <h3>ブラウザ版</h3>
                <p>すぐに編集を始めたいときに。変更は使っているブラウザへ自動保存され、次に開いたときは、続きから編集するか新しく作るかを選べます。</p>
                <div className="landing-platform-links">
                  <a href={editorUrl} className="landing-text-link">エディターを開く<ArrowRight size={16} aria-hidden="true" /></a>
                </div>
              </article>
              <article className="landing-platform">
                <Monitor size={24} aria-hidden="true" />
                <h3>デスクトップ版</h3>
                <p>Windows・macOS・Linuxに対応。XRiftへの公開やAIとの連携、コードエディターを使った制作ができます。</p>
                <a href="#download" className="landing-text-link">ダウンロードへ<ArrowRight size={16} aria-hidden="true" /></a>
              </article>
            </div>
            <div className="landing-handoff">
              <PackageOpen size={23} aria-hidden="true" />
              <div>
                <h3>パソコンで続きを編集するには</h3>
                <p>「ファイル」→「プロジェクトを書き出す」で.xriftstudioファイルをダウンロード。パソコンに移して、デスクトップ版で開きます。</p>
                <a href={`${XRIFT_STUDIO_GUIDE_URL}ipad.html`} className="landing-text-link">タッチ操作と引き継ぎの手順<ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="landing-section">
          <div className="landing-container landing-ai-grid">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">デスクトップ版のAI連携</p>
              <h2>AIと一緒に、<br />シーンを編集。</h2>
              <p>CodexやClaude CodeなどとMCPで接続。モデルの配置やマテリアルの調整を会話で頼み、結果をエディターで確認できます。</p>
              <p>AIに頼んだモデルの配置や質感の変更も、Undoで戻せます。</p>
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
