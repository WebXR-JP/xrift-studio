/** Check all built guide pages, native fragments and local assets at their actual publishing depth. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../preview-dist");
const failures=[], pages=[];
const landing=["index.html","preview.html"].find((file)=>fs.existsSync(path.join(root,file)));
if (landing) pages.push(landing);else failures.push("Landing page was not built");
const wiki=path.join(root,"wiki");
if(fs.existsSync(wiki)) { for(const file of fs.readdirSync(wiki)) if(file.endsWith(".html"))pages.push(`wiki/${file}`); }
else failures.push("Guide was not built");
if(!pages.includes("wiki/index.html"))failures.push("Guide home was not built");
const getHtml=(file)=>fs.readFileSync(file,"utf8");
const decode=(text)=>text.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
let count=0;
for(const page of pages){
 const absolute=path.join(root,page),html=getHtml(absolute);
 if(page.startsWith("wiki/") && (!html.includes('<main id="main"') || !/<h1\b/.test(html)))failures.push(`${page}: no static readable article`);
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const reference=decode(match[1]);
  if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference))continue;
  count++;
  const [local,fragment]=reference.split("#");
  let target=local?path.resolve(path.dirname(absolute),decodeURIComponent(local.split("?")[0])):absolute;
  if(!target.startsWith(root+path.sep)){failures.push(`${page}: reference escapes publication ${reference}`);continue;}
  if(target===path.join(root,"index.html") && !fs.existsSync(target) && landing)target=path.join(root,landing);
  if(!fs.existsSync(target)){failures.push(`${page}: missing ${reference}`);continue;}
  if(fragment && target.endsWith(".html")){
    const id=decodeURIComponent(fragment),document=getHtml(target);
    if(![...document.matchAll(/\bid="([^"]+)"/g)].some((m)=>decode(m[1])===id))failures.push(`${page}: missing anchor ${reference}`);
  }
 }
}
for(const file of ["wiki/guide-client.mjs","wiki/guide-utils.mjs","wiki/search-index.json","404.html"]){if(!fs.existsSync(path.join(root,file)))failures.push(`Missing build asset ${file}`);}
if(failures.length)throw new Error(`Published guide validation failed:\n${failures.join("\n")}`);
console.log(`Published page checks: ${count} local references across ${pages.length} HTML pages`);
