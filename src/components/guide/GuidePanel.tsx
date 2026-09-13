import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GUIDE_MANIFEST, guidePage } from "../../lib/guide-config";
import { headingSlug, markdownHeadings, remarkGuideHeadings, resolveGuideLink } from "../../lib/guide-utils.mjs";
import { tauri } from "../../lib/tauri";
import { guideImageFraming } from "../../lib/guide-image-framing.mjs";
import { GuideExternalLink } from "./GuideLink";

const documents = import.meta.glob<string>("/docs/guide/*.md", {query:"?raw",import:"default"});
const media = import.meta.glob<string>("/docs/guide/media/*", {query:"?url",import:"default",eager:true});
export interface GuidePanelProps {initialPage: string; onClose: () => void;}
export function GuidePanel({ initialPage, onClose }: GuidePanelProps) {
  const [route, setRoute] = useState({slug:guidePage(initialPage).slug,fragment:""});
  const [history, setHistory] = useState<typeof route[]>([]);
  const [loaded, setLoaded] = useState<{slug:string;text:string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const page = guidePage(route.slug);
  const text = loaded?.slug === page.slug ? loaded.text : null;
  const headings = text ? markdownHeadings(text).filter((heading) => heading.depth === 2) : [];
  useEffect(() => {close.current?.focus();}, []);
  useEffect(() => {
    let active = true;
    setError(null);setLinkError(null);
    const load = documents[`/docs/guide/${page.file}`];
    if (!load) {setError("このページを読み込めませんでした。");return;}
    void load().then((content) => {
      if(active) setLoaded({slug:page.slug,text:content});
    }).catch(() => {if(active)setError("本文を読み込めませんでした。もう一度お試しください。");});
    return () => {active=false;};
  }, [page.slug, page.file, attempt]);
  useEffect(() => {
    if (!text) return;
    const frame = requestAnimationFrame(() => {
      if (route.fragment) {
        let fragment = route.fragment;
        try { fragment=decodeURIComponent(fragment); } catch { /* Keep literal text. */ }
        const target = document.getElementById(`embedded-guide-${fragment}`);
        if (target && body.current?.contains(target)) {target.scrollIntoView({block:"start"});target.focus({preventScroll:true});}
      } else body.current?.scrollTo({top:0});
    });
    return () => cancelAnimationFrame(frame);
  }, [route, text]);
  const navigate = (slug: string, fragment = "") => {
    setHistory((items) => [...items, route]);setRoute({slug:guidePage(slug).slug,fragment});
    requestAnimationFrame(() => title.current?.focus());
  };
  return <aside className="embedded-guide" role="dialog" aria-labelledby={`embedded-guide-${headingSlug(page.title)}`}
    onKeyDown={(event) => {event.stopPropagation();if(event.key === "Escape"){event.preventDefault();onClose();}}}>
    <header className="embedded-guide-toolbar"><strong>使い方ガイド</strong><button ref={close} type="button" onClick={onClose} aria-label="ガイドを閉じて編集に戻る">閉じる</button></header>
    <div className="embedded-guide-controls">
      <button type="button" disabled={!history.length} onClick={() => { const previous=history[history.length - 1];if(previous){setHistory((items) => items.slice(0,-1));setRoute(previous);} }}>戻る</button>
      <label><span className="sr-only">説明するページ</span><select value={page.slug} onChange={(event) => navigate(event.target.value)}>
        {GUIDE_MANIFEST.groups.map((group) => <optgroup key={group.id} label={group.label}>{GUIDE_MANIFEST.pages.filter((item) => item.group === group.id).map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</optgroup>)}
      </select></label>
    </div>
    <div ref={body} className="embedded-guide-body">
      <h1 id={`embedded-guide-${headingSlug(page.title)}`} ref={title} tabIndex={-1}>{page.title}</h1>
      <p className="embedded-guide-note">編集画面を操作しながら読めます。</p>
      {!text && !error && <p role="status">本文を読み込んでいます…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>もう一度読み込む</button></div>}
      {linkError && <p role="alert">{linkError}</p>}
      {text && <>
        {!!headings.length && <details className="embedded-guide-toc"><summary>このページの内容</summary><ul>{headings.map((heading) => <li key={heading.id}><a href={`#embedded-guide-${heading.id}`} onClick={(event) => {event.preventDefault();setRoute({...route,fragment:heading.id});}}>{heading.text}</a></li>)}</ul></details>}
        <article className="embedded-guide-prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkGuideHeadings]} skipHtml components={{
          h1: () => null,
          h2: ({id,children}) => <h2 id={`embedded-guide-${id}`} tabIndex={-1}>{children}</h2>,
          h3: ({id,children}) => <h3 id={`embedded-guide-${id}`} tabIndex={-1}>{children}</h3>,
          h4: ({id,children}) => <h4 id={`embedded-guide-${id}`} tabIndex={-1}>{children}</h4>,
          h5: ({id,children}) => <h5 id={`embedded-guide-${id}`} tabIndex={-1}>{children}</h5>,
          h6: ({id,children}) => <h6 id={`embedded-guide-${id}`} tabIndex={-1}>{children}</h6>,
          a: ({href,children}) => {
            const target=resolveGuideLink(href ?? "",page.slug,GUIDE_MANIFEST);
            if(target.kind === "invalid" || target.kind === "empty")return <span>{children}</span>;
            if(target.kind === "external") return <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={(event) => {if(tauri.isAvailable()){event.preventDefault();void tauri.openUrl(target.href).catch(() => setLinkError("ブラウザーでリンクを開けませんでした。接続や設定を確認してください。"));}}}>{children}</a>;
            return <a href={target.href} onClick={(event) => {event.preventDefault();if(target.kind === "page")navigate(target.slug!,target.fragment);else if(target.kind === "heading")setRoute({...route,fragment:target.href.slice(1)});}}>{children}</a>;
          },
          img: ({src,alt,title}) => {const url=media[`/docs/guide/${(src ?? "").replace(/^\.\//,"")}`];const framing=guideImageFraming(title);return url ? <span style={framing.frame}><img src={url} alt={alt} style={framing.image} loading="lazy" /></span> : <span>画像はブラウザー版で確認してください。</span>;},
          table: ({children}) => <div className="embedded-guide-table" tabIndex={0} role="region" aria-label="表。横にスクロールできます"><table>{children}</table></div>,
        }}>{text}</ReactMarkdown></article>
        {page.next && <button type="button" className="embedded-guide-next" onClick={() => navigate(page.next!)}>次へ：{guidePage(page.next).title} →</button>}
        {!!page.related.length && <section className="embedded-guide-related"><h2>関連する使い方</h2>{page.related.map((slug) => <button key={slug} type="button" onClick={() => navigate(slug)}>{guidePage(slug).title} →</button>)}</section>}
      </>}
    </div>
    <footer className="embedded-guide-bottom"><GuideExternalLink page={page.slug} label="ブラウザーで大きく読む" /><span>本文の閲覧にログインは不要です。</span></footer>
  </aside>;
}
