import { escapeHtml as e } from "./core.mjs";
const href = (slug) => `./${slug}.html`;
function navigation(manifest, current) {
  return `<a class="guide-nav-home" href="./index.html"${current.slug === "index" ? ' aria-current="page"' : ""}>ガイドのトップ</a>${manifest.groups.map((group) => {
    const pages = manifest.pages.filter((page) => page.group === group.id && page.slug !== "index");
    if (!pages.length) return "";
    return `<details class="guide-chapter"${current.group === group.id ? " open" : ""}><summary>${e(group.label)}</summary><ul>${pages.map((page) => `<li><a href="${href(page.slug)}"${current.slug === page.slug ? ' aria-current="page"' : ""}>${e(page.title)}</a></li>`).join("")}</ul></details>`;
  }).join("")}`;
}
function toc(headings) {
  return `<ol>${headings.filter((head) => head.depth === 2).map((head) => `<li><a href="#${e(head.id)}">${e(head.text)}</a></li>`).join("")}</ol>`;
}
function home(manifest, headings) {
  const page = (slug) => manifest.pages.find((p) => p.slug === slug);
  return `<section id="${e(headings[0]?.id || "welcome")}" class="guide-welcome" aria-labelledby="welcome-title"><p class="guide-eyebrow">はじめての制作</p><h1 id="welcome-title">配置して、色を変えて、<br>ワールドを作ろう。</h1><p class="guide-lead">セットアップから、配置・保存・Playまで。コードを書かずに、小さな作品を一つ作ります。</p><a class="guide-primary" href="./installation.html">インストールから始める <span aria-hidden="true">→</span></a><a class="guide-secondary" href="./first-world.html">セットアップ済み：制作を始める →</a><p class="guide-note">デスクトップ版は最初にセットアップします。iPadでの制作は専用の案内をご覧ください。</p></section>
<figure class="guide-overview"><a href="./media/index.png" target="_blank" rel="noopener noreferrer" title="編集画面を大きく開きます"><img src="./media/index.png" width="1280" height="800" alt="床と青い球を配置したビジュアルエディター。左にHierarchy、右にInspector、下にAssets" decoding="async"></a><figcaption>最初に作るのは、床と色のついた球。配置する場所と調整する場所を、実際の画面で覚えます。</figcaption><ul class="guide-screen-key"><li><a href="./editor-basics.html#hierarchy配置したものを選ぶ"><strong>左 · Hierarchy</strong>配置したものを選ぶ</a></li><li><a href="./editor-basics.html#シーン作っている空間を見る"><strong>中央 · シーン</strong>形と色を確認する</a></li><li><a href="./editor-basics.html#inspector選んだものを調整する"><strong>右 · Inspector</strong>位置や質感を調整する</a></li><li><a href="./editor-basics.html#assets使う素材を管理する"><strong>下 · Assets</strong>使う素材を管理する</a></li></ul></figure>
<section class="guide-home-section" aria-labelledby="first-steps"><h2 id="first-steps">最初は、この順番で</h2><ol class="guide-steps">${manifest.firstSteps.map((slug, index) => { const p = page(slug); return `<li><a href="${href(slug)}"><span class="guide-step-number">${index + 1}</span><span><strong>${e(p.title)}</strong><span>${e(p.description)}</span></span><span aria-hidden="true">→</span></a></li>`; }).join("")}</ol></section>
<section class="guide-home-section" aria-labelledby="topics"><h2 id="topics">やりたいことから探す</h2><div class="guide-topic-grid">${manifest.homeTopics.map((slug) => { const p = page(slug); return `<a class="guide-topic" href="${href(slug)}"><strong>${e(p.title)}</strong><span>${e(p.description)}</span></a>`; }).join("")}</div><a class="guide-all-topics" href="./contents.html">すべてのページを見る →</a></section>
<section class="guide-help-box" aria-labelledby="help-title"><h2 id="help-title">思ったように動かないとき</h2><p>色が変わらない、床をすり抜ける、保存できない。症状から確認する場所を探せます。</p><a href="./troubleshooting.html">困ったときの確認方法 →</a></section>`;
}
export function pageTemplate(page, manifest, rendered, headings = []) {
  const isHome = page.slug === "index";
  const isContents = page.slug === "contents";
  const chapter = manifest.groups.find((group) => group.id === page.group)?.label;
  const meta = `${e(page.title)} | XRift Studio`;
  const nav = navigation(manifest, page);
  const hasToc = headings.some((h) => h.depth === 2) && !isHome;
  const next = page.next && manifest.pages.find((entry) => entry.slug === page.next);
  const related = (page.related ?? []).map((slug) => manifest.pages.find((p) => p.slug === slug)).filter(Boolean);
  const article = isHome ? home(manifest, headings) : `<nav class="guide-breadcrumb" aria-label="現在の位置"><a href="./index.html">使い方ガイド</a>${chapter ? ` <span aria-hidden="true">/</span> <span>${e(chapter)}</span>` : ""}</nav><header class="guide-article-header"><h1 id="${e(headings[0]?.id || "page-title")}">${e(page.title)}</h1><p class="guide-description">${e(page.description)}</p><p class="guide-version">内容の確認基準：v${e(manifest.reviewedVersion)} のソース</p></header>${hasToc ? `<details class="guide-inline-toc"><summary>このページの内容</summary>${toc(headings)}</details>` : ""}<article class="guide-prose">${rendered}</article>${next ? `<a class="guide-next" href="${href(next.slug)}"><span>次に進む</span><strong>${e(next.title)} →</strong></a>` : ""}${related.length ? `<aside class="guide-related" aria-labelledby="related-title"><h2 id="related-title">関連する使い方</h2><ul>${related.map((p) => `<li><a href="${href(p.slug)}">${e(p.title)} →</a></li>`).join("")}</ul></aside>` : ""}`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${meta}</title><meta name="description" content="${e(page.description)}"><link rel="canonical" href="${e(manifest.siteUrl)}${isHome ? "" : `${page.slug}.html`}"><meta property="og:type" content="article"><meta property="og:title" content="${meta}"><meta property="og:description" content="${e(page.description)}"><meta property="og:url" content="${e(manifest.siteUrl)}${isHome ? "" : `${page.slug}.html`}"><meta name="theme-color" content="#ffffff"><link rel="stylesheet" href="./guide.css"><script type="module" src="./guide-client.mjs"></script></head>
<body data-guide-page="${e(page.slug)}"><a class="guide-skip" href="#main">本文へ移動</a>
<header class="guide-header"><div class="guide-header-inner"><a class="guide-brand" href="./index.html"><span class="guide-brand-mark" aria-hidden="true">X</span><span>XRift Studio<small>使い方ガイド</small></span></a><div class="guide-header-actions"><button class="guide-search-trigger" type="button" data-open-search hidden><span aria-hidden="true">⌕</span> 使い方を検索</button><a class="guide-product-link" href="../index.html#download">ダウンロード</a></div></div></header>
<div class="guide-mobile-bar"><details data-mobile-nav class="guide-mobile-nav"><summary>目次から探す</summary><nav aria-label="ガイドの目次（モバイル）">${nav}</nav></details><a href="./troubleshooting.html">困ったとき</a></div>
<div class="guide-layout${isHome || isContents ? " guide-layout-home" : ""}"><aside class="guide-sidebar"><nav aria-label="ガイドの目次">${nav}</nav><a class="guide-sidebar-help" href="./contents.html">すべてのページ</a></aside><main id="main" class="guide-main" tabindex="-1">${article}<footer class="guide-footer"><p><a href="./index.html">ガイドのトップ</a> · <a href="./recovery.html">不具合・説明の問題を報告</a> · <a href="https://github.com/WebXR-JP/xrift-studio/tree/main/docs" target="_blank" rel="noopener noreferrer">開発者向け資料（別のタブ）</a></p><small>確認対象 v${e(manifest.reviewedVersion)} · ${e(manifest.reviewedOn)}</small></footer></main>${hasToc ? `<aside class="guide-toc" aria-label="このページの内容"><strong>このページの内容</strong>${toc(headings)}</aside>` : ""}</div>
<dialog class="guide-search-dialog" aria-labelledby="search-title"><div class="guide-search-top"><h2 id="search-title">使い方を検索</h2><button type="button" data-close-search aria-label="検索を閉じる">閉じる <kbd>Esc</kbd></button></div><label for="guide-search-input">操作・画面の名前・困っていること</label><input id="guide-search-input" type="search" placeholder="例：ラフネス、色 変わらない、保存" autocomplete="off" maxlength="160"><p class="guide-search-status" role="status" aria-live="polite">本文から検索します。</p><button class="guide-retry" type="button" data-search-retry hidden>読み込みをやり直す</button><ol class="guide-search-results" aria-label="検索結果"></ol><p class="guide-search-footer"><a href="./contents.html">目次から探す</a><span>Tabで結果へ移動・Enterで開く</span></p></dialog>
<noscript><p class="guide-noscript">本文と目次はそのまま読めます。検索にはJavaScriptが必要です。<a href="./contents.html">すべてのページ</a></p></noscript>
</body></html>`;
}
export function contentsHtml(manifest) {
  return manifest.groups.map((group) => `<section><h2>${e(group.label)}</h2><ul>${manifest.pages.filter((p) => p.group === group.id && p.slug !== "index").map((p) => `<li><a href="${href(p.slug)}">${e(p.title)}</a><p>${e(p.description)}</p></li>`).join("")}</ul></section>`).join("");
}
