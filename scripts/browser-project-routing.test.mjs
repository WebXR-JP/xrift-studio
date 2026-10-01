import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const routing = await server.ssrLoadModule('/src/lib/browser-project-routing.ts');

test('static hosting and ChatGPT routes resolve the same persistent ID', () => {
  const id = 'project-a1b2-c3d4';
  for (const route of [`/editor.html?project=${id}`, `/editor/${id}`, `/#/editor/${id}`]) assert.equal(routing.studioProjectIdFromUrl(route), id);
  const url = routing.browserProjectEditorUrl(id, 'https://webxr-jp.github.io/xrift-studio/editor.html?kind=world');
  assert.equal(url, `https://webxr-jp.github.io/xrift-studio/editor.html?project=${id}`);
  assert.equal(routing.studioProjectIdFromUrl(url), id);
  assert.equal(routing.browserProjectEditorUrl(null, url), 'https://webxr-jp.github.io/xrift-studio/editor.html');
  assert.equal(routing.browserProjectEditorUrl(id, 'https://studio.example/editor/old'), `https://studio.example/editor.html?project=${id}`);
  assert.equal(routing.browserProjectEditorUrl(id, 'https://sandbox.example/chatgpt.html'), `https://sandbox.example/chatgpt.html?project=${id}`);
});

test('missing, malformed and ambiguous IDs never open another project', () => {
  const projects = [{ projectId: 'project-one', path: 'browser-project://one' }, { projectId: 'project-two', path: 'browser-project://two' }];
  assert.equal(routing.findStudioProject('project-two', projects).path, 'browser-project://two');
  assert.throws(() => routing.findStudioProject('project-missing', projects), /見つかりません/);
  assert.throws(() => routing.findStudioProject('project-one', [...projects, projects[0]]), /複数/);
  for (const id of ['../one', 'one/two', '', 'one%2Ftwo', 'one?x=1']) assert.throws(() => routing.validateStudioProjectId(id), /不正/);
  assert.throws(() => routing.studioProjectIdFromUrl('/editor/one%2Ftwo'), /不正/);
});
