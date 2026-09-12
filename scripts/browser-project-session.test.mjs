import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, cacheDir: "node_modules/.vite-browser-session-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(() => server.close());
const { openBrowserProjectSession } = await server.ssrLoadModule("/src/preview/browser-project-session.ts");
const { createPrototypeProject } = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const bundle = createPrototypeProject("world", "session-world");
  const secondScene = { ...bundle.scene, sceneId: "second-scene", name: "Second scene" };
  bundle.project = { ...bundle.project, scenePaths: { ...bundle.project.scenePaths, [secondScene.sceneId]: "scenes/second.scene.json" } };
  const documents = { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene, [secondScene.sceneId]: secondScene }, assets: bundle.assets, prefabs: bundle.prefabs };
  const events = [];
  let held = false;
  let saved = documents;
  const backend = {
    acquire: async () => {
      if (held) throw new Error("already editing");
      held = true;
      events.push("acquire");
      return () => { held = false; events.push("release"); };
    },
    read: async () => { assert.equal(held, true); events.push("read"); return saved; },
    save: async (_path, next) => { assert.equal(held, true); saved = next; },
    files: async () => new Map([["title", new TextEncoder().encode(saved.project.metadata.title)]]),
    archive: async (next, files) => {
      assert.equal(new TextDecoder().decode(files.get("title")), next.project.metadata.title);
      return { blob: new Blob([next.project.metadata.title]), fileName: "session.xriftstudio", fileCount: files.size };
    },
  };
  const edit = (title) => ({ ...bundle, project: { ...bundle.project, metadata: { ...bundle.project.metadata, title } } });
  return { backend, events, edit, bundle, documents, saved: () => saved };
}

test("ownership is acquired before reading and released if opening fails", async () => {
  const f = fixture();
  await assert.rejects(openBrowserProjectSession("project", { ...f.backend, read: async () => { throw new Error("missing scene"); } }), /missing scene/);
  assert.deepEqual(f.events, ["acquire", "release"]);
  const session = await openBrowserProjectSession("project", f.backend);
  await session.close();
});

test("another tab cannot read until the closing session finishes its accepted saves", async () => {
  const f = fixture();
  const writing = deferred();
  const started = deferred();
  const session = await openBrowserProjectSession("project", { ...f.backend, save: async (...args) => {
    started.resolve(); await writing.promise; await f.backend.save(...args);
  } });
  const save = session.save(f.edit("latest"));
  await started.promise;
  const close = session.close();
  await assert.rejects(openBrowserProjectSession("project", f.backend), /already editing/);
  await assert.rejects(session.save(f.edit("stale")), /閉じられています/);
  writing.resolve();
  await Promise.all([save, close]);
  const reopened = await openBrowserProjectSession("project", f.backend);
  assert.equal(reopened.initialBundle.project.metadata.title, "latest");
  await reopened.close();
});

test("autosave and export use one queue and export captures matching documents and files", async () => {
  const f = fixture();
  const gate = deferred();
  const started = deferred();
  const events = [];
  const session = await openBrowserProjectSession("project", { ...f.backend,
    save: async (path, documents) => {
      const title = documents.project.metadata.title;
      events.push(`save:${title}`);
      if (title === "first") { started.resolve(); await gate.promise; }
      await f.backend.save(path, documents);
    },
    archive: async (...args) => { events.push("archive"); return f.backend.archive(...args); },
  });
  const first = session.save(f.edit("first"));
  await started.promise;
  const exporting = session.export(f.edit("exported"));
  const latest = session.save(f.edit("latest"));
  assert.deepEqual(events, ["save:first"]);
  gate.resolve();
  const [, archive] = await Promise.all([first, exporting, latest]);
  assert.equal(await archive.blob.text(), "exported");
  assert.deepEqual(events, ["save:first", "save:exported", "archive", "save:latest"]);
  assert.equal(f.saved().project.metadata.title, "latest");
  assert.deepEqual(f.saved().scenes["second-scene"], f.documents.scenes["second-scene"]);
  await session.close();
});

test("failed saves can be retried and cannot switch the project identity", async () => {
  const f = fixture();
  let fail = true;
  const session = await openBrowserProjectSession("project", { ...f.backend, save: async (...args) => {
    if (fail) { fail = false; throw new Error("quota exceeded"); }
    await f.backend.save(...args);
  } });
  await assert.rejects(session.save(f.edit("failed")), /quota exceeded/);
  assert.equal(f.saved(), f.documents);
  await session.save(f.edit("retried"));
  assert.equal(f.saved().project.metadata.title, "retried");
  await assert.rejects(session.save({ ...f.bundle, project: { ...f.bundle.project, projectId: "another-project" } }), /一致しません/);
  assert.equal(f.saved().project.metadata.title, "retried");
  await session.close();
  await session.close();
  assert.equal(f.events.filter((event) => event === "release").length, 1);
});
