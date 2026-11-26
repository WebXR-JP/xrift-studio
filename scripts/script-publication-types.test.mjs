import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

test("ctx.materials.setUniform takes every documented value form and no other", () => {
  const diagnostics = diagnosticsFor(`
import { defineScript, prop } from ${JSON.stringify(api)};
import { Color, DataTexture, Matrix3, Matrix4, Vector2, Vector3, Vector4 } from 'three';
export default defineScript({
  name: 'Uniform driver',
  props: {
    walker: prop.entity(),
    tint: prop.color({default: '#7fbf5a'}),
    axis: prop.vec3({default: [0, 1, 0]}),
    texture: prop.asset({kind: 'texture'}),
  },
  start(ctx) {
    const position = new Vector3();
    const data = new DataTexture(new Uint8Array(4), 1, 1);
    void ctx.lifecycle.task(async signal => {
      const texture = await ctx.assets.loadTexture(ctx.props.texture);
      if (!signal.aborted) ctx.materials.setUniform('uMap', texture);
    });
    return {
      update() {
        ctx.find(ctx.props.walker)?.getWorldPosition(position);
        const changed: number = ctx.materials.setUniform('uWalker', position);
        ctx.materials.setUniform('uTint', ctx.props.tint);
        ctx.materials.setUniform('uTint', 0xff6600);
        ctx.materials.setUniform('uTint', new Color('#ffffff'));
        ctx.materials.setUniform('uAxis', ctx.props.axis);
        ctx.materials.setUniform('uGain', ctx.time.elapsed);
        ctx.materials.setUniform('uUv', new Vector2());
        ctx.materials.setUniform('uPlane', new Vector4());
        ctx.materials.setUniform('uMatrix', new Matrix4());
        ctx.materials.setUniform('uNormal', new Matrix3());
        ctx.materials.setUniform('uPoints', new Float32Array(12));
        ctx.materials.setUniform('uWeights', [0, 1, 2, 3] as const);
        ctx.materials.setUniform('uData', data);
        ctx.materials.setUniform('uData', null);
        const body = ctx.materials.select({meshName: 'Body'});
        const cleared: number = body.setUniform('uGain', changed) + body.resetUniform('uGain');
        // @ts-expect-error A GLSL bool takes 0 or 1; a boolean is refused in Play as well.
        ctx.materials.setUniform('uFlag', true);
        // @ts-expect-error A missing value is not a value.
        ctx.materials.setUniform('uGain', undefined);
        // @ts-expect-error An array uniform takes one flat list of numbers.
        ctx.materials.setUniform('uPoints', [[0, 0, 0]]);
        // @ts-expect-error The uniform is chosen by name.
        ctx.materials.setUniform(0, 1);
        void cleared;
      },
      dispose() { data.dispose(); },
    };
  },
});
`);
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("the uniform example given to MCP clients passes strict publication checking", () => {
  const capabilities = fs.readFileSync(path.join(root, "src/lib/visual-editor/scripting-capabilities.data.ts"), "utf8");
  const lines = capabilities.match(/uniforms: \{[\s\S]*?example: \[([\s\S]*?)\]\.join\("\\n"\)/)?.[1];
  assert(lines, "runtime.materials.uniforms.example is missing");
  const example = Function(`"use strict"; return [${lines}];`)().join("\n");
  assert.match(example, /ctx\.materials\.setUniform\(/);
  const diagnostics = diagnosticsFor(example.replace('"xrift:script"', JSON.stringify(api)));
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
