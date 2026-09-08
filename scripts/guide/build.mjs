import fs from "node:fs/promises";
import path from "node:path";
import { readGuide, validateGuide, projectRoot, sourceRoot, escapeHtml as e } from "./core.mjs";
import { pageTemplate, contentsHtml } from "./template.mjs";
export async function buildGuide({ outDir = "preview-dist/wiki", renderer } = {}) {
  const out = path.resolve(projectRoot, outDir);
  const relative = path.relative(projectRoot, out);
  // Never allow a typo to erase the repository or a user-selected arbitrary directory.
  if (!relative || relative.startsWith("..") || path.basename(out) !== "wiki") throw new Error("Guide output must be a wiki directory inside this project");
  const data = await readGuide(), validated = await validateGuide(data);
  const render = renderer ?? (await import("./render.mjs")).renderMarkdown;
  // Validate and render before replacing the old publication directory.
  const pages = new Map();
  for (const page of data.manifest.pages) pages.set(`${page.slug}.html`, pageTemplate(page, data.manifest, render(data.sources[page.slug], page, data.manifest), validated.headings[page.slug]));
  const special = (slug, title, description, html) => pageTemplate({slug,title,description,group:"support",related:[]}, data.manifest, html);
  pages.set("contents.html", special("contents", "すべてのページ", "やりたいことに合わせて、必要な説明を選んでください。", contentsHtml(data.manifest)));
  pages.set("404.html", special("404", "ページが見つかりません", "URLが変わったか、ページが存在しない可能性があります。", '<p>検索か目次から、目的の説明を探してください。作成中のプロジェクトには影響しません。</p><p><a href="./contents.html">目次から探す</a> · <a href="./index.html">ガイドのトップへ</a></p>'));
  await fs.mkdir(out, {recursive:true});
  const oldFiles = await fs.readdir(out, {withFileTypes:true});
  for (const old of oldFiles) await fs.rm(path.join(out, old.name), {recursive:true,force:true});
  for (const [file, html] of pages) await fs.writeFile(path.join(out,file),html);
  for (const file of ["guide.css","guide-client.mjs"]) await fs.copyFile(path.join(projectRoot,"scripts/guide",file),path.join(out,file));
  await fs.copyFile(path.join(projectRoot,"src/lib/guide-utils.mjs"),path.join(out,"guide-utils.mjs"));
  await fs.cp(path.join(sourceRoot,"media"),path.join(out,"media"),{recursive:true});
  await fs.writeFile(path.join(out,"search-index.json"),JSON.stringify(validated.search));
  const notFound = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ページが見つかりません | XRift Studio</title><style>body{font:17px/1.9 system-ui,sans-serif;color:#27272a;max-width:42rem;margin:8vh auto;padding:24px;overflow-wrap:anywhere}h1{font-size:28px;line-height:1.5}a{color:#6d28d9;display:inline-block;padding:10px 0}a:focus-visible{outline:3px solid #6d28d9}</style></head><body><main><p>XRift Studio</p><h1>ページが見つかりません</h1><p>URLが変わったか、ページが存在しない可能性があります。</p><p><a href="${e(data.manifest.siteUrl)}contents.html">使い方ガイドの目次から探す →</a></p><p><a href="${e(new URL("../",data.manifest.siteUrl).href)}">紹介サイトへ戻る →</a></p></main></body></html>`;
  await fs.writeFile(path.join(path.dirname(out),"404.html"),notFound);
  console.log(`Guide: ${data.manifest.pages.length} articles, ${pages.size} HTML pages, ${validated.search.length} search sections → ${relative}`);
  return {out, pages:pages.size, articles:data.manifest.pages.length, sections:validated.search.length};
}
