import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-test-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "packages/xrift-studio-runtime/src/script/api.ts").replaceAll("\\", "/");

function diagnosticsFor(source) {
  const fileName = path.join(root, "script-publication-types.fixture.tsx");
  const options = {
    strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, types: [], allowImportingTsExtensions: true,
  };
  const host = ts.createCompilerHost(options);
  const originalSourceFile = host.getSourceFile;
  host.getSourceFile = (name, ...args) => path.resolve(name) === fileName
    ? ts.createSourceFile(fileName, source, options.target, true, ts.ScriptKind.TSX)
    : originalSourceFile.call(host, name, ...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([fileName], options, host));
}

test("published Script API keeps real Three methods and exact Font prop declarations", () => {
  const diagnostics = diagnosticsFor(`
import { defineScript, prop, type CompiledScript, type ScriptRenderProps } from ${JSON.stringify(api)};
import { Object3D, Vector3 } from 'three';
type Settings = { font: { kind: 'asset'; assetKind: 'font' } };
const script: CompiledScript<Settings> = defineScript({
  name: 'Typed scene behavior', props: {font: prop.asset({kind: 'font'})},
  start(ctx) {
    const child = new Object3D();
    ctx.object3d.add(child);
    ctx.object3d.traverse(object => { object.visible = true; });
    const position: Vector3 = ctx.object3d.worldToLocal(new Vector3());
    const worldPosition: Vector3 = ctx.object3d.getWorldPosition(new Vector3());
    ctx.scene.add(child);
    ctx.camera.getWorldPosition(worldPosition);
    ctx.renderer.getPixelRatio();
    // @ts-expect-error Three's real signature must still reject invalid children.
    ctx.object3d.add('not an Object3D');
    return {update(delta) { child.position.x += delta + position.x; }};
  }
});
function render({ctx}: ScriptRenderProps<Settings>) {return ctx.assets.url(ctx.props.font);}
void script; void render;
`);
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("strict publication validation still rejects untyped helpers", () => {
  const diagnostics = diagnosticsFor(`
import { defineScript } from ${JSON.stringify(api)};
function untyped(timestamp) { return timestamp; }
export default defineScript({name:'Invalid helper',start(){untyped(1)}});
`);
  assert(diagnostics.some(d => d.code === 7006), "API fixes must not weaken strict checking");
});
