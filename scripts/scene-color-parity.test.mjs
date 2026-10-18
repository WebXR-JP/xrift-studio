import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript-test-api");
const three = require("three");
const source = readFileSync(new URL("../packages/xrift-studio-runtime/src/scene/postprocessing.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Exercise the shared compositor with a renderer boundary instead of a GPU.
// The low-quality path must never allocate a composer, but must still apply
// exactly the same renderer colour settings as the published/high-quality path.
function mountCompositor(settings, effectsEnabled) {
  const counts = { composers: 0, compositeFrames: 0, directFrames: 0 };
  const cleanups = [];
  let frame;
  const gl = {
    toneMapping: three.NoToneMapping, toneMappingExposure: 1,
    outputColorSpace: three.LinearSRGBColorSpace,
    render() { counts.directFrames++; },
  };
  const state = { gl, camera: new three.PerspectiveCamera(50, 1, 0.1, 100), scene: new three.Scene(), size: { width: 64, height: 64 } };
  const passes = [];
  const rendered = [];
  let failRender = false;
  class Composer {
    constructor() { counts.composers++; }
    addPass() {}
    setSize() {}
    dispose() {}
    render() {
      counts.compositeFrames++;
      const ao = passes.find(pass => pass.ssaoMaterial);
      rendered.push({ camera: passes[0]?.camera, aoCamera: ao?.camera, near: ao?.ssaoMaterial.uniforms.cameraNear.value,
        far: ao?.ssaoMaterial.uniforms.cameraFar.value, projection: ao?.ssaoMaterial.uniforms.cameraProjectionMatrix.value.clone() });
      if (failRender) throw new Error("renderer fixture failure");
    }
  }
  class Pass {
    constructor(config, camera) { this.uniforms = config?.uniforms; this.camera = camera; passes.push(this); }
  }
  class AoPass extends Pass {
    constructor(scene, camera) {
      super(scene, camera);
      this.ssaoMaterial = { uniforms: { cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
        cameraProjectionMatrix: { value: camera.projectionMatrix.clone() }, cameraInverseProjectionMatrix: { value: camera.projectionMatrixInverse.clone() } } };
      this.depthRenderMaterial = { uniforms: { cameraNear: { value: camera.near }, cameraFar: { value: camera.far } } };
    }
  }
  const imports = {
    react: {
      useMemo: factory => factory(),
      useRef: current => ({ current }),
      useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
      useLayoutEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    },
    "@react-three/fiber": {
      useThree: () => state,
      useFrame: callback => { frame = callback; },
    },
    "../script/scene-runtime.js": {
      findXriftSceneRuntimeBridge: () => null,
      publishXriftScenePostprocessingBaseline: () => () => {},
    },
    three,
  };
  for (const name of ["RenderPass", "ShaderPass", "SSAOPass", "UnrealBloomPass", "EffectComposer"]) {
    imports[`three/examples/jsm/postprocessing/${name}.js`] = {
      [name]: name === "EffectComposer" ? Composer : name === "SSAOPass" ? AoPass : Pass,
    };
  }
  const exports = {};
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in imports, `unhandled runtime dependency: ${name}`);
    return imports[name];
  }, exports);
  exports.ScenePostprocessing({ settings, effectsEnabled });
  frame();
  return { gl, counts, state, passes, rendered, frame, render: camera => exports.renderXriftSceneFrame(gl, state.scene, camera),
    fail: () => { failRender = true; }, cleanup: () => cleanups.reverse().forEach(cleanup => cleanup()) };
}

test("low-quality effects skip buffers while preserving authored exposure and tone mapping", () => {
  for (const toneMapping of ["aces", "none"]) {
    const settings = {
      enabled: true, order: ["bloom", "grading"], exposure: 0.2,
      hdr: { enabled: true, toneMapping },
      bloom: { enabled: true, threshold: 1, strength: 1, radius: 0.3 },
      ao: { enabled: true, radius: 8, minDistance: 0.005, maxDistance: 0.1 },
      grading: { enabled: false, contrast: 1, saturation: 1, temperature: 0, tint: 0 },
    };
    const high = mountCompositor(settings, true);
    const low = mountCompositor(settings, false);
    assert.equal(low.gl.toneMappingExposure, 0.2);
    assert.equal(low.gl.toneMapping, high.gl.toneMapping);
    assert.equal(low.gl.outputColorSpace, three.SRGBColorSpace);
    assert.equal(low.counts.composers, 0);
    assert.equal(low.counts.directFrames, 1);
    assert.equal(high.counts.composers, 1);
    assert.equal(high.counts.compositeFrames, 1);
    high.cleanup();
    low.cleanup();
    assert.equal(low.gl.toneMappingExposure, 1);
    assert.equal(low.gl.outputColorSpace, three.LinearSRGBColorSpace);
  }
});

test("temporary review cameras use the compositor and restore RenderPass and SSAO state after success or failure", () => {
  const settings = { enabled: true, exposure: 1, hdr: { enabled: false, toneMapping: "none" },
    bloom: { enabled: true, threshold: 0.5, strength: 1, radius: 0.3 },
    ao: { enabled: true, radius: 8, minDistance: 0.005, maxDistance: 0.1 },
    grading: { enabled: true, contrast: 1, saturation: 0, temperature: 0.3, tint: 0 } };
  const mounted = mountCompositor(settings, true);
  const camera = new three.PerspectiveCamera(35, 1.5, 0.03, 300);
  const ao = mounted.passes.find(pass => pass.ssaoMaterial);
  const previous = ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.clone();
  assert.equal(mounted.render(camera), true);
  const captured = mounted.rendered.at(-1);
  assert.equal(captured.camera, camera);
  assert.equal(captured.aoCamera, camera);
  assert.equal(captured.near, 0.03);
  assert.equal(captured.far, 300);
  assert.deepEqual(captured.projection.elements, camera.projectionMatrix.elements);
  assert.equal(mounted.passes[0].camera, mounted.state.camera);
  assert.equal(ao.camera, mounted.state.camera);
  assert.equal(ao.ssaoMaterial.uniforms.cameraNear.value, mounted.state.camera.near);
  assert.deepEqual(ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.elements, previous.elements);
  mounted.frame();
  assert.equal(mounted.rendered.at(-1).camera, mounted.state.camera);
  mounted.fail();
  assert.throws(() => mounted.render(camera), /renderer fixture failure/);
  assert.equal(mounted.passes[0].camera, mounted.state.camera);
  assert.equal(ao.camera, mounted.state.camera);
  assert.deepEqual(ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.elements, previous.elements);
  mounted.cleanup();
  assert.equal(mounted.render(camera), false);
});
