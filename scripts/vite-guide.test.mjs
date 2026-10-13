import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { staticGuide } from "./vite-guide.mjs";

test("guide source changes rebuild the guide without reloading an open Editor", async () => {
  const cache = path.resolve("node_modules/.cache/xrift-studio/guide-plugin-tests");
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, "guide-"));
  const watcher = new EventEmitter();
  watcher.add = () => {};
  const httpServer = new EventEmitter();
  const messages = [];
  let middleware;
  let builds = 0;
  const plugin = staticGuide({ build: async () => {
    builds++;
    const output = path.join(root, ".guide-dev/guide");
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "index.html"), `guide ${builds}`);
  } });
  plugin.configResolved({ root, command: "serve" });
  plugin.configureServer({
    watcher, httpServer, ws: { send: value => messages.push(value) },
    config: { logger: { error: error => { throw new Error(error); } } },
    middlewares: { use: fn => { middleware = fn; } },
  });
  const read = async () => {
    let body;
    await middleware({ url: "/guide/" }, {
      writeHead: status => assert.equal(status, 200),
      end: value => { body = value.toString(); },
    }, () => assert.fail("guide middleware did not handle request"));
    return body;
  };
  try {
    assert.equal(await read(), "guide 1");
    watcher.emit("all", "change", path.join(root, "docs/guide/editor-basics.md"));
    assert.equal(await read(), "guide 2");
    assert.equal(await read(), "guide 2");
    // Another dev server emits generated files with the same utility basename.
    watcher.emit("all", "change", path.join(root, ".guide-dev/guide/guide-utils.mjs"));
    watcher.emit("all", "change", path.join(root, "dev/capture/guide-utils.mjs"));
    watcher.emit("all", "change", path.join(root, "docs/guide-review/README.md"));
    assert.equal(await read(), "guide 2");
    watcher.emit("all", "change", path.join(root, "src/lib/guide-utils.mjs"));
    assert.equal(await read(), "guide 3");
    watcher.emit("all", "change", path.join(root, "scripts/guide/render.mjs"));
    assert.equal(await read(), "guide 4");
    assert.deepEqual(messages, []);
    httpServer.emit("close");
    assert.equal(watcher.listenerCount("all"), 0);
  } finally {
    const relative = path.relative(cache, root);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    await fs.rm(root, { recursive: true, force: true });
  }
});
