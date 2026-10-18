import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-r3f-recovery-test",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { createR3fCompilerCache, validateR3fStaticSource } = await server.ssrLoadModule("/src/lib/visual-editor/r3f-static-source.ts");
const { typescript } = await import("monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js");

test("a transient compiler load failure can retry, while concurrent and successful requests share the compiler", async () => {
  let calls = 0, fail;
  const first = new Promise((_resolve, reject) => { fail = reject; });
  const load = createR3fCompilerCache(() => ++calls === 1 ? first : Promise.resolve(typescript));
  const a = load(), b = load();
  assert.equal(a, b);
  const pending = Promise.allSettled([a, b]);
  fail(new Error("temporary compiler fetch failure"));
  assert.ok((await pending).every(result => result.status === "rejected"));
  const recovered = await load();
  const file = recovered.createSourceFile("World.tsx", "export default function World(){return <group name='World'/>}", recovered.ScriptTarget.Latest, true, recovered.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0);
  assert.equal(await load(), recovered);
  assert.equal(calls, 2);
});

test("unsupported nested helpers explain the supported equivalent at module scope", async () => {
  const mesh = '<mesh name="Wall"><boxGeometry args={[2,3,2]}/><meshStandardMaterial color="#ffffff"/></mesh>';
  await assert.rejects(validateR3fStaticSource(`export default function World(){const House=()=>${mesh};return <House/>}`), /ファイル直下/);
  await validateR3fStaticSource(`const House=()=>${mesh};export default function World(){return <House/>}`);
});
