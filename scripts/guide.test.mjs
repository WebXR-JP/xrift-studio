import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
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
 for(const [query,slug] of [["表面の粗さ","materials"],["Tangent Space","textures"],["色 変わらない","materials"],["完全リセット","recovery"]]){
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
 for(const [file,target]of [["SetupView.tsx","installation"],["ProjectLibrary.tsx","first-world"],["visual-editor/AssetsPanelBase.tsx","assets"],["visual-editor/AssetQuickEditor.tsx","materials"],["visual-editor/SceneSettingsPanel.tsx","lighting"]])assert.ok((await read(`src/components/${file}`)).includes(`page="${target}"`));
 const panel=await read("src/components/guide/GuidePanel.tsx");assert.ok(panel.includes('import.meta.glob<string>("/docs/guide/*.md"'));assert.ok(panel.includes("event.stopPropagation()"));assert.doesNotMatch(panel,/aria-modal="true"|saveVisualProject|publishVisualProject/);
});
test("setup comes before creating a desktop project and LP help is not desktop-only",async()=>{
 const setup=await read("src/components/SetupView.tsx");assert.ok(setup.includes("最初にセットアップ"));assert.ok(data.sources.installation.includes("セットアップを開始"));assert.doesNotMatch(setup,/onOpenVisualEditor/);
 assert.ok(setup.includes("<details"));
 const nav=await read("src/preview/sections/Nav.tsx");const link=nav.match(/href=\{XRIFT_STUDIO_GUIDE_URL\}[\s\S]*?<\/a>/)?.[0];assert.ok(link);assert.doesNotMatch(link,/className="[^"]*hidden xl:/);
});

test("home screen links reach real editor headings and detail images keep their originals", async () => {
 const {renderMarkdown}=await import('./guide/render.mjs');
 const home=pageTemplate(manifest.pages.find(p=>p.slug==='index'),manifest,'',checked.headings.index);
 for(const match of home.matchAll(/href="\.\/editor-basics\.html#([^"]+)"/g))assert.ok(checked.headings['editor-basics'].some(h=>h.id===match[1]),match[1]);
 const page=manifest.pages.find(p=>p.slug==='first-world');
 const html=renderMarkdown(data.sources['first-world'],page,manifest);
 assert.ok(html.includes('aspect-ratio:254 / 180'));
 assert.ok(html.includes('href="./media/first-world.png"'));
 const fallback=renderMarkdown('![見本](./media/first-world.png "unknown")',page,manifest);
 assert.doesNotMatch(fallback,/position:absolute/);
});

test("current guide version agrees with the desktop version and new features are searchable", async () => {
 const config = JSON.parse(await read("src-tauri/tauri.conf.json"));
 assert.equal(manifest.reviewedVersion, config.version);
 for (const [query, slug] of [["MToon", "materials"], ["録画", "recording"], ["GLSL", "custom-shaders"]]) {
   assert.ok(searchGuide(checked.search, query).some(hit => hit.slug === slug), query);
 }
 const recording = manifest.pages.find(page => page.slug === "recording");
 const html = pageTemplate(recording, manifest, "<p>録画</p>", checked.headings.recording);
 assert.ok(html.includes(`内容の確認基準：v${config.version}`));
 assert.ok(html.includes(manifest.reviewedOn));
 assert.ok((await read("src/components/visual-editor/RecordingPanel.tsx")).includes('page="recording"'));
});

test("tutorial catalog contains 19 finished, local MP4 lessons with posters and text alternatives", async () => {
 const {tutorials, durationLabel} = await import("./guide/tutorials.mjs");
 assert.equal(tutorials.length, 19);
 assert.equal(new Set(tutorials.map(lesson => lesson.id)).size, 19);
 let totalBytes = 0;
 for (const lesson of tutorials) {
   assert.match(lesson.video, /^\.\/media\/tutorials\/lesson-\d{2}-\d{2}\.mp4$/);
   assert.match(lesson.poster, /^\.\/media\/tutorials\/lesson-\d{2}-\d{2}-poster\.jpg$/);
   assert.equal(resolveGuideLink(lesson.video, lesson.slug, manifest).kind, "video");
   assert.ok(lesson.durationSeconds > 0 && lesson.durationSeconds < 90);
   for (const file of [lesson.video, lesson.poster]) {
     const stat = await fs.stat(path.join(projectRoot, "docs/guide", file));
     assert.ok(stat.size > 0 && stat.size < 100_000_000, file);
     if (file.endsWith(".mp4")) totalBytes += stat.size;
   }
   assert.ok(manifest.pages.some(page => page.slug === lesson.slug));
   assert.ok(data.sources[lesson.slug].includes(lesson.video));
   assert.ok(data.sources[lesson.slug].includes("## 操作の要点"));
   assert.ok(data.sources[lesson.slug].includes(`./${lesson.guide}.md`));
   assert.doesNotMatch(JSON.stringify(lesson), /drive\.google|file_attachments|localhost|token|pending/i);
 }
 assert.ok(totalBytes < 100_000_000, `video bytes: ${totalBytes}`);
 assert.equal(durationLabel(60.5), "1:01");
 for (const href of ["./media/tutorials/../secret.mp4", "./media/tutorials/not-a-lesson.mp4", "./media/tutorials/lesson-01-01.mp4?token=secret", "//example.com/video.mp4"]) {
   assert.equal(resolveGuideLink(href, "index", manifest).kind, "invalid", href);
 }
});

test("tutorial index shows lightweight cards and each lesson has one accessible native player", async () => {
 const {renderMarkdown} = await import("./guide/render.mjs");
 const {tutorials} = await import("./guide/tutorials.mjs");
 const landing = manifest.pages.find(page => page.slug === "video-tutorials");
 const index = renderMarkdown(data.sources[landing.slug], landing, manifest);
 assert.equal((index.match(/class="guide-lesson-card"/g) || []).length, 19);
 assert.equal((index.match(/loading="lazy"/g) || []).length, 19);
 assert.doesNotMatch(index, /<video|<source|<iframe/);
 for (const lesson of tutorials) {
   const page = manifest.pages.find(page => page.slug === lesson.slug);
   const html = renderMarkdown(data.sources[lesson.slug], page, manifest);
   assert.equal((html.match(/<video\b/g) || []).length, 1);
   assert.ok(html.includes('controls=""'));
   assert.ok(html.includes('playsInline=""'));
   assert.ok(html.includes('preload="metadata"'));
   assert.ok(html.includes(`poster="${lesson.poster}"`));
   assert.ok(html.includes(`src="${lesson.video}"`));
   assert.ok(html.includes('type="video/mp4"'));
   assert.ok(html.includes('aria-describedby="video-help"'));
   assert.ok(html.includes(`href="${lesson.video}"`));
   assert.doesNotMatch(html, /autoplay|autoPlay|<iframe|<p><figure/);
 }
 const panel = await read("src/components/guide/GuidePanel.tsx");
 assert.ok(panel.includes('target.kind === "video"'));
 assert.ok(panel.includes('new URL(target.href, GUIDE_MANIFEST.siteUrl)'));
 assert.doesNotMatch(panel, /import\.meta\.glob[^\n]*tutorials/);
});

test("the learning course reaches publishing, updates and invitations through complete lessons", async () => {
 const course = JSON.parse(await read("docs/guide/curriculum.json"));
 const lessons = course.chapters.flatMap(chapter => chapter.lessons);
 assert.equal(course.chapters.length, 8);
 assert.equal(new Set(lessons.map(lesson => lesson.slug)).size, lessons.length);
 assert.equal(lessons.filter(lesson => lesson.format === "video").length, 19);
 assert.equal(lessons.filter(lesson => lesson.format === "article").length, 10);
 for (const [index, lesson] of lessons.entries()) {
   const page = manifest.pages.find(page => page.slug === lesson.slug);
   assert.ok(page, lesson.slug);
   assert.equal(page.next, lessons[index + 1]?.slug ?? "learning-course");
   const source = data.sources[lesson.slug];
   for (const heading of ["## このレッスンでできること", "## 始める前に", "## できたか確認する", "## うまくいかないとき", "## 次のレッスン"]) {
     assert.ok(source.includes(heading), `${lesson.slug}: ${heading}`);
   }
   assert.match(source, /## (?:手順|操作の要点)/, lesson.slug);
   if (lesson.format === "article") {
     assert.ok(source.includes("動画：未収録（文章で進められます）"), lesson.slug);
     assert.doesNotMatch(source, /media\/tutorials\/[^)]+\.mp4|<video|<iframe/);
   }
 }
 const index = data.sources["learning-course"];
 for (const lesson of lessons) assert.ok(index.includes(`./${lesson.slug}.md`), lesson.slug);
 assert.ok(data.sources["video-tutorials"].includes("./learning-course.md"));
 assert.ok(data.sources.index.includes("./learning-course.md"));
});

test("the course distinguishes authority, review and device limitations without teaching unsafe shortcuts", () => {
 assert.match(data.sources["course-publish-account"], /APIキー/);
 assert.match(data.sources["course-publish-review"], /PENDING/);
 assert.match(data.sources["course-publish-review"], /ACTIVE/);
 assert.match(data.sources["course-publish-review"], /REJECTED/);
 assert.match(data.sources["course-publish-invite"], /インスタンス/);
 assert.match(data.sources["course-publish-invite"], /ゲスト/);
 assert.match(data.sources["lesson-03-04"], /スクリプトを含むワールドの公開にはデスクトップ版/);
 for (const page of manifest.pages.filter(page => page.slug.startsWith("course-") || page.slug.startsWith("lesson-") || page.slug === "learning-course")) {
   assert.doesNotMatch(data.sources[page.slug], /drive\.google\.com|file_attachments|localhost:\d+|Bearer [A-Za-z0-9]/, page.slug);
 }
});

test("narrated tutorial metadata matches all 19 published MP4 files", async () => {
 const {tutorials} = await import("./guide/tutorials.mjs");
 const catalog = JSON.parse(await read("docs/guide/media/tutorials/catalog.json"));
 assert.equal(catalog.videoCount, 19);
 assert.equal(catalog.lessons.length, 19);
 let totalBytes = 0;
 for (const lesson of tutorials) {
   assert.equal(lesson.narration, "recorded", lesson.slug);
   const media = catalog.lessons.find(item => item.file === `${lesson.slug}.mp4`);
   assert.ok(media, lesson.slug);
   const bytes = await fs.readFile(path.join(projectRoot, "docs/guide", lesson.video));
   assert.equal(media.sizeBytes, bytes.length, lesson.slug);
   assert.equal(lesson.sizeBytes, bytes.length, lesson.slug);
   assert.equal(media.sha256, createHash("sha256").update(bytes).digest("hex"), lesson.slug);
   assert.equal(media.durationSeconds, lesson.durationSeconds, lesson.slug);
   assert.ok(Math.abs(media.audioDurationSeconds - media.durationSeconds) < 0.05, lesson.slug);
   totalBytes += bytes.length;
 }
 assert.equal(catalog.totalVideoBytes, totalBytes);
 assert.ok(totalBytes < 100_000_000);
 assert.doesNotMatch(data.sources["video-credits"], /「ノードをつないで箱を動かす」は字幕で説明/);
});
