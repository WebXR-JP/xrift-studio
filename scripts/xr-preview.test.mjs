import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript-test-api';
import * as three from 'three';

const source = await readFile(new URL('../src/lib/visual-editor/value-up/spatial-xr/xr-preview.ts', import.meta.url), 'utf8');
const bridge = source.match(/const XR_BRIDGE_SOURCE = String.raw`([\s\S]*?)`;/)[1];
const compiled = ts.transpileModule(bridge, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function mount({ requestSession, setSession = async () => {} }) {
  let cleanup;
  const button = { style: {}, remove() {} };
  button.dataset = {};
  const scene = new three.Scene();
  const gl = { xr: { enabled: false, setReferenceSpaceType() {}, getController: () => new three.Group(), getHand: () => new three.Group(), setSession } };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console: { error() {} },
    navigator: { xr: { isSessionSupported: async () => true, requestSession } },
    document: { createElement: () => button, body: { appendChild() {} } },
    require(name) {
      if (name === 'react') return { useEffect(fn) { cleanup = fn(); } };
      if (name === '@react-three/fiber') return { useThree: fn => fn({ gl, scene }) };
      if (name === '@xrift/world-components') return { LAYERS: { INTERACTABLE: 1 }, useXRift: () => ({ interactableObjects: new Set() }) };
      if (name === 'three') return three;
      throw new Error(name);
    },
  });
  exports.XriftStudioXrBridge();
  return { button, scene, gl, cleanup: () => cleanup() };
}
function session() {
  let onEnd;
  return { ends: 0, addEventListener(_event, fn) { onEnd = fn; }, async end() { this.ends++; onEnd?.(); } };
}

test('failed renderer attachment ends the session and allows retry', async () => {
  const active = session();
  let requests = 0;
  const app = mount({ requestSession: async () => { requests++; return active; }, setSession: async () => { throw new Error('renderer unavailable'); } });
  await app.button.onclick();
  assert.equal(active.ends, 1);
  assert.equal(app.button.disabled, false);
  assert.match(app.button.textContent, /retry/);
  await app.button.onclick();
  assert.equal(requests, 2);
  app.cleanup();
  assert.equal(app.scene.children.length, 0);
});

test('a pending request cannot start twice or attach after unmount', async () => {
  let resolve;
  let requests = 0;
  let attachments = 0;
  const app = mount({ requestSession: () => { requests++; return new Promise(done => { resolve = done; }); }, setSession: async () => { attachments++; } });
  const first = app.button.onclick();
  await app.button.onclick();
  assert.equal(requests, 1);
  app.cleanup();
  const active = session();
  resolve(active);
  await first;
  assert.equal(active.ends, 1);
  assert.equal(attachments, 0);
  assert.equal(app.gl.xr.enabled, false);
});
