import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({configFile:false,cacheDir:"node_modules/.vite-disabled-hierarchy-test",
  server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:"custom",
  optimizeDeps:{noDiscovery:true,include:[]}});
test.after(() => server.close());
const {compileVisualProject} = await server.ssrLoadModule("/src/lib/visual-editor/compiler/compile.ts");
const {createPrototypeProject} = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");

test("disabled descendants stay omitted without false orphan warnings, real orphans remain diagnosed", () => {
  const base = createPrototypeProject("world", "Disabled hierarchy regression");
  const node = (id, parentId, children, enabled = true) => ({id,name:id,parentId,children,enabled,components:[]});
  const scene = {...base.scene,rootEntityIds:["hidden-root"],entities:{
    "hidden-root":node("hidden-root",null,["hidden-child"],false),
    "hidden-child":node("hidden-child","hidden-root",["hidden-grandchild"]),
    "hidden-grandchild":node("hidden-grandchild","hidden-child",[]),
    "real-orphan":node("real-orphan",null,[]),
  }};
  const result = compileVisualProject({project:base.project,assets:base.assets,
    scenes:{[scene.sceneId]:scene},prefabs:{}}, {generatedAt:"2026-10-25T00:00:00.000Z"});
  const orphans=result.diagnostics.filter(d=>d.code==="orphan-entity-not-compiled");
  assert.deepEqual(orphans.map(d=>d.entityId),["real-orphan"]);
  const world=result.overlayFiles.find(f=>f.relativePath==="src/World.tsx");
  assert(world, "compiler must still emit the world");
  assert(!world.content.includes('name="hidden-child"'), "hidden work must not be resurrected");
  assert.deepEqual(scene.rootEntityIds,["hidden-root"], "compilation must not repair or mutate authored roots");
});
