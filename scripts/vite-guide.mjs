import path from "node:path";
import fs from "node:fs/promises";
import { buildGuide } from "./guide/build.mjs";
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
export function staticGuide({ publish = false } = {}) {
  let config;
  return {
    name:"xrift-static-user-guide",
    configResolved(resolved) { config=resolved; },
    configureServer(server) {
      let pending, generation=0, built=-1;
      server.watcher.add([path.join(config.root,"docs/guide"),path.join(config.root,"scripts/guide"),path.join(config.root,"src/lib/guide-utils.mjs")]);
      server.watcher.on("all", (_event, file) => {
        if (/\/(docs\/guide|scripts\/guide)\//.test(file.replaceAll("\\","/")) || file.endsWith("guide-utils.mjs")) {
          generation++;
          server.ws.send({type:"full-reload",path:"/wiki/*"});
        }
      });
      server.middlewares.use(async (req,res,next) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname); } catch { res.statusCode=400;res.end("Invalid URL");return; }
        if (pathname === "/wiki") { res.writeHead(302,{Location:"/wiki/"});res.end();return; }
        if (!pathname.startsWith("/wiki/")) return next();
        try {
          if (!pending && built !== generation) {
            const version=generation;
            pending=buildGuide({outDir:".guide-dev/wiki"}).then((result) => {built=version;return result;}).finally(() => {pending=undefined;});
          }
          if (pending) await pending;
          const root=path.join(config.root,".guide-dev/wiki"), relative=pathname.slice("/wiki/".length)||"index.html";
          if (relative.split("/").some((part) => part===".." || part===".") || relative.includes("\\") || relative.includes("\0")) {res.statusCode=400;res.end("Invalid path");return;}
          let file=path.join(root,relative), status=200;
          try { await fs.access(file); } catch {file=path.join(root,"404.html");status=404;}
          res.writeHead(status,{"Content-Type":types[path.extname(file)]??"application/octet-stream","Cache-Control":"no-cache"});
          res.end(await fs.readFile(file));
        } catch(error) { server.config.logger.error(String(error));res.statusCode=503;res.end("Guide generation failed. See the development server log."); }
      });
    },
    async closeBundle() {
      if (publish && config.command === "build") await buildGuide({outDir:path.join(config.build.outDir,"wiki")});
    },
  };
}
