import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkGuideHeadings, resolveGuideLink } from "../../src/lib/guide-utils.mjs";
import { guideImageFraming } from "../../src/lib/guide-image-framing.mjs";
const h = React.createElement;
/** One standard Markdown parser. User-facing pages never ship a React runtime. */
export function renderMarkdown(markdown, page, manifest) {
  return renderToStaticMarkup(h(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkGuideHeadings],
    skipHtml: true,
    components: {
      // The page template owns the single h1 and its metadata.
      h1: () => null,
      a: ({ href, children }) => {
        const target = resolveGuideLink(href, page.slug, manifest);
        if (target.kind === "invalid" || target.kind === "empty") return h("span", null, children);
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
