import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkGuideHeadings, resolveGuideLink } from "../../src/lib/guide-utils.mjs";
import { guideImageFraming } from "../../src/lib/guide-image-framing.mjs";
import { tutorialForVideo, tutorialForPage, durationLabel } from "./tutorials.mjs";
const h = React.createElement;
function tutorialVideo(lesson) {
  return h("figure", {className: "guide-video", "aria-label": lesson.title},
    h("video", {controls: true, playsInline: true, preload: "metadata", poster: lesson.poster,
      width: 1920, height: 1080, "aria-label": `${lesson.title}（${durationLabel(lesson.durationSeconds)}）`, "aria-describedby": "video-help"},
      h("source", {src: lesson.video, type: "video/mp4"}),
      "このブラウザーでは動画を再生できません。下のリンクからMP4を開いてください。"),
    h("figcaption", {id: "video-help"},
      h("span", {className: "guide-video-meta"}, `${durationLabel(lesson.durationSeconds)} · ${lesson.narration === "none" ? "字幕で説明" : "動画内に日本語字幕"}`),
      h("span", null, "再生ボタンで開始します。細かな設定は全画面で確認してください。"),
      h("a", {href: lesson.video}, "再生できないときはMP4を直接開く")));
}
function tutorialCard(lesson, href) {
  return h("a", {href, className: "guide-lesson-card"},
    h("span", {className: "guide-lesson-thumbnail"},
      h("img", {src: lesson.poster, alt: "", width: 1920, height: 1080, loading: "lazy", decoding: "async"}),
      h("span", {className: "guide-lesson-duration", "aria-label": `再生時間 ${durationLabel(lesson.durationSeconds)}`}, durationLabel(lesson.durationSeconds))),
    h("span", {className: "guide-lesson-copy"},
      h("span", {className: "guide-lesson-number"}, lesson.id),
      h("strong", null, lesson.title),
      h("span", null, lesson.description),
      h("span", {className: "guide-lesson-watch"}, "動画を見る →")));
}
/** One standard Markdown parser. User-facing pages never ship a React runtime. */
export function renderMarkdown(markdown, page, manifest) {
  return renderToStaticMarkup(h(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkGuideHeadings],
    skipHtml: true,
    components: {
      // The page template owns the single h1 and its metadata.
      h1: () => null,
      p: ({node, children}) => {
        const only = node?.children?.length === 1 ? node.children[0] : null;
        const lesson = only?.type === "element" && only.tagName === "a" ? tutorialForVideo(only.properties?.href) : null;
        return lesson ? tutorialVideo(lesson) : h("p", null, children);
      },
      a: ({ href, children }) => {
        const target = resolveGuideLink(href, page.slug, manifest);
        if (target.kind === "invalid" || target.kind === "empty") return h("span", null, children);
        const lesson = page.slug === "video-tutorials" && target.kind === "page" ? tutorialForPage(target.slug) : null;
        if (lesson) return tutorialCard(lesson, target.href);
        return h("a", { href: target.href, ...(target.kind === "external" ? {target:"_blank",rel:"noopener noreferrer",title:"別のタブで開きます"} : {}) }, children);
      },
      img: ({ src, alt, title }) => {
        const framing = guideImageFraming(title);
        return h("a", {className:"guide-image",href:src,target:"_blank",rel:"noopener noreferrer",title:"全体画像を大きく開きます"},
          h("span", {style:framing.frame}, h("img", {src,alt,style:framing.image,loading:"lazy",decoding:"async"})));
      },
      table: ({ children }) => h("div", {className:"guide-table",tabIndex:0,role:"region","aria-label":"表。横にスクロールできます"}, h("table",null,children)),
    },
    children: markdown,
  }));
}
