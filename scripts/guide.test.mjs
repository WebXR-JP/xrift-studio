import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {readGuide,validateGuide,projectRoot,escapeHtml} from "./guide/core.mjs";
import {headingSlug,markdownHeadings,resolveGuideLink,searchGuide,remarkGuideHeadings} from "../src/lib/guide-utils.mjs";
import {pageTemplate} from "./guide/template.mjs";
const data=await readGuide(), manifest=data.manifest, checked=await validateGuide(data);
const read=(p)=>fs.readFile(path.join(projectRoot,p),"utf8");
test("every authored page, relative link, image and fragment resolves",async()=>{
 assert.equal(Object.keys(checked.headings).length,manifest.pages.length);
 assert.ok(manifest.pages.length>=25);assert.ok(checked.search.length>150);
 assert.deepEqual(manifest.firstSteps,["installation","first-world","save-and-open","play-mode"]);
});
test("heading IDs agree for Japanese, formatted text and duplicate headings",()=>{
 assert.equal(headingSlug("**Base Color**：色を決める"),"base-color色を決める");
 assert.deepEqual(markdownHeadings("# 題名\n## 色を変える\n## 色を変える\n```\n## Not a heading\n```\n## [Metallic](./materials.md)").map(h=>h.id),["題名","色を変える","色を変える-1","metallic"]);
 const ast={children:[{type:"heading",children:[{type:"strong",children:[{value:"Base Color"}]},{value:"：色を決める"}]}]};
 remarkGuideHeadings()(ast);assert.equal(ast.children[0].data.hProperties.id,"base-color色を決める");
});
test("page + heading links stay inside the guide; arbitrary schemes and paths do not",()=>{
 assert.equal(resolveGuideLink("./materials.md#作って割り当てる","index",manifest).href,"./materials.html#作って割り当てる");
 assert.equal(resolveGuideLink("#作って割り当てる","materials",manifest).kind,"heading");
 for(const href of ["../../secret.md","javascript:alert(1)","./not-present.md","//evil.example/a","data:text/html,hi"])assert.equal(resolveGuideLink(href,"index",manifest).kind,"invalid",href);
});
test("search includes body, heading targets, Japanese aliases and multi-word queries",()=>{
 for(const [query,slug] of [["ラフネス","materials"],["Tangent Space","textures"],["色 変わらない","materials"],["完全リセット","recovery"]]){
   const hits=searchGuide(checked.search,query);assert.ok(hits.some(h=>h.slug===slug),query);
 }
 assert.ok(searchGuide(checked.search,"Tangent Space")[0].url.includes("#"));
 assert.equal(searchGuide(checked.search,"zzzznotaword").length,0);assert.equal(searchGuide(checked.search," ").length,0);
 assert.equal(searchGuide(checked.search,"Ｒｏｕｇｈｎｅｓｓ")[0].slug,"materials");
});
test("beginners are not asked to build, deploy or configure an AI client",()=>{
 for(const slug of ["installation","first-world","materials","save-and-open"]){assert.doesNotMatch(data.sources[slug],/pnpm |npm install|git clone|tauri:dev|cargo /,slug);}
 const first=data.sources["first-world"];
 for(const word of ["Assets","Inspector","Base Color","Roughness","保存","Play","Stop"])assert.ok(first.includes(word),word);
});
test("static pages expose readable content and true anchors without app bootstrap",()=>{
 const p=manifest.pages.find(p=>p.slug==="materials"),html=pageTemplate(p,manifest,"<p>本文です。</p>",checked.headings[p.slug]);
 assert.ok(html.includes("本文です。"));assert.ok(html.includes('href="#作って割り当てる"'));
 assert.ok(html.includes('id="色と質感を変える"'));
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/src\/index.css|src\/main|id="root"|href="#\/|\.md#/);
});
test("escaping and search result rendering cannot turn queries into markup",async()=>{
 assert.equal(escapeHtml('<script a="x">'),"&lt;script a=&quot;x&quot;&gt;");
 const client=await read("scripts/guide/guide-client.mjs");assert.doesNotMatch(client,/innerHTML|eval\(|localStorage|sessionStorage/);
 assert.ok(client.includes("title.textContent"));
 assert.ok(client.includes(".showModal()"));assert.ok(client.includes("returnFocus?.focus()"));
});
test("one app help host, lazy content and direct context links are wired",async()=>{
 assert.equal(((await read("src/main.tsx")).match(/<GuideHost\s*\/>/g)||[]).length,1);
 for(const [file,target]of [["SetupView.tsx","first-world"],["ProjectLibrary.tsx","first-world"],["visual-editor/AssetsPanel.tsx","assets"],["visual-editor/AssetQuickEditor.tsx","materials"],["visual-editor/SceneSettingsPanel.tsx","lighting"]])assert.ok((await read(`src/components/${file}`)).includes(`page="${target}"`));
 const panel=await read("src/components/guide/GuidePanel.tsx");assert.ok(panel.includes('import.meta.glob<string>("/docs/guide/*.md"'));assert.ok(panel.includes("event.stopPropagation()"));assert.doesNotMatch(panel,/aria-modal="true"|saveVisualProject|publishVisualProject/);
});
test("the creative start precedes optional setup and LP help is not desktop-only",async()=>{
 const setup=await read("src/components/SetupView.tsx");assert.ok(setup.indexOf("ワールドを作る")<setup.indexOf("公開の準備（後からでもできます）"));
 assert.ok(setup.includes("<details"));
 const nav=await read("src/preview/sections/Nav.tsx");const link=nav.match(/href=\{XRIFT_STUDIO_GUIDE_URL\}[\s\S]*?<\/a>/)?.[0];assert.ok(link);assert.doesNotMatch(link,/className="[^"]*hidden xl:/);
});
