import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = new IDBFactory();
globalThis.IDBKeyRange = IDBKeyRange;
const held = new Set();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (name, _options, action) => {
  if (held.has(name)) return action(null);
  held.add(name);
  try { return await action({ name }); } finally { held.delete(name); }
} } } });
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { handleMcp, default: worker } = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');
const { saveBrowserStudioProject } = await server.ssrLoadModule('/src/lib/browser-studio-project-store.ts');
const storage = await server.ssrLoadModule('/src/lib/browser-project-storage.ts');
const { parseBrowserProjectFiles } = await server.ssrLoadModule('/src/lib/visual-editor/browser-project-transfer.ts');
const { openBrowserProjectSession } = await server.ssrLoadModule('/src/preview/browser-project-session.ts');
const env = { ASSETS: { fetch: () => { throw Error('An Editor must not be needed for document editing'); } } };
let id = 0;
async function rpc(method, params) {
  return (await (await handleMcp(new Request('https://example.test/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }), env)).json()).result;
}

test('create -> edit -> retry use the conversation result with no Editor or server storage', async () => {
  const created = (await rpc('tools/call', { name: 'create_world', arguments: { name: '会話の作業用作品' } })).structuredContent;
  const edited = (await rpc('tools/call', { name: 'edit_world', arguments: { bundle: created.bundle, revision: created.revision, projectId: created.projectId, operations: [
    { tool: 'create_primitive', arguments: { shape: 'cylinder' }, ref: 'trunk' },
    { tool: 'update_transform', arguments: { entityId: '$trunk', scale: [0.3, 2, 0.3] } },
  ] } })).structuredContent;
  assert.equal(edited.projectId, created.projectId);
  assert.equal(edited.revision, 1);
  assert.equal(Object.keys(edited.bundle.scene.entities).length, Object.keys(created.bundle.scene.entities).length + 1);
  assert.equal(edited.delivery.documentEdited, true);
  assert.equal(edited.delivery.serverSaved, false);
  assert.equal(edited.delivery.browserSaved, false);
  assert.equal(edited.delivery.rendered, false);
  const capture = (await rpc('tools/call', { name: 'capture_scene_view', arguments: { bundle: edited.bundle, revision: edited.revision, operationId: edited.operationId, baseHash: edited.baseHash } })).structuredContent;
  assert.equal(capture.captureSceneView, true);
  assert.deepEqual(capture.bundle, edited.bundle);
  assert.equal(capture.operationId, edited.operationId);
  assert.equal(capture.delivery.rendered, false);
  const retry = (await rpc('tools/call', { name: 'retry_world', arguments: { bundle: edited.bundle, revision: edited.revision, operationId: edited.operationId, baseHash: edited.baseHash } })).structuredContent;
  assert.deepEqual(retry.bundle, edited.bundle);
  assert.equal(retry.operationId, edited.operationId);
  const conflict = await rpc('tools/call', { name: 'edit_world', arguments: { bundle: edited.bundle, revision: edited.revision, expectedRevision: 0, operations: [{ tool: 'create_primitive', arguments: { shape: 'box' } }] } });
  assert.equal(conflict.isError, true);
  assert.match(conflict.content[0].text, /revision_conflict/);
  const path = await saveBrowserStudioProject(edited.bundle);
  assert.deepEqual(JSON.parse(JSON.stringify(parseBrowserProjectFiles(await storage.getBrowserProjectFiles(path)).scenes[edited.sceneId])), edited.bundle.scene);
});

test('headless browser saves preserve source bytes and release the same Editor lease', async () => {
  const created = (await rpc('tools/call', { name: 'create_world', arguments: {} })).structuredContent;
  const path = await saveBrowserStudioProject(created.bundle);
  const bytes = new Uint8Array([0, 128, 255]);
  await storage.writeBrowserBinaryFile(path, 'assets/imported/keep.glb', `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`);
  const next = structuredClone(created.bundle); next.project.metadata.title = '表示せずに保存';
  assert.equal(await saveBrowserStudioProject(next), path);
  assert.deepEqual(await storage.readBrowserFile(path, 'assets/imported/keep.glb'), bytes);
  const session = await openBrowserProjectSession(path);
  await assert.rejects(saveBrowserStudioProject(created.bundle), /別のタブ/);
  await session.close();
  assert.equal(await saveBrowserStudioProject(next), path);
});

test('MCP text carries state and failed batches return unchanged state with the exact tool definition', async () => {
  const created = await rpc('tools/call', { name: 'create_world', arguments: { name: '復旧検証' } });
  assert.deepEqual(JSON.parse(created.content[1].text), created.structuredContent);
  const original = created.structuredContent;
  const failed = await rpc('tools/call', { name: 'edit_world', arguments: { bundle: original.bundle, revision: 0, operations: [
    { tool: 'create_primitive', arguments: { shape: 'box' } },
    { tool: 'create_primitive', arguments: { primitive_type: 'cylinder' } },
  ] } });
  assert.equal(failed.isError, true);
  const recovery = JSON.parse(failed.content[1].text);
  assert.equal(recovery.batchApplied, false);
  assert.equal(recovery.failedOperationIndex, 1);
  assert.equal(recovery.definition.name, 'create_primitive');
  assert.ok(recovery.definition.inputSchema.properties.shape);
  assert.deepEqual(recovery.bundle, original.bundle);
  assert.equal(recovery.revision, 0);
  const corrected = await rpc('tools/call', { name: 'edit_world', arguments: { bundle: recovery.bundle, revision: recovery.revision, operations: [
    { tool: 'create_primitive', arguments: { shape: 'box' } },
    { tool: 'create_primitive', arguments: { shape: 'cylinder' } },
  ] } });
  assert.equal(corrected.isError, undefined);
  assert.equal(corrected.structuredContent.projectId, original.projectId);
  assert.equal(Object.keys(corrected.structuredContent.bundle.scene.entities).length, Object.keys(original.bundle.scene.entities).length + 2);
  const definition = await rpc('tools/call', { name: 'describe_document_tool', arguments: { tool: 'create_primitive' } });
  assert.deepEqual(JSON.parse(definition.content[1].text).definition, recovery.definition);
});

test('tool schemas carry conversation state and project routes serve the common Editor', async () => {
  const tools = (await rpc('tools/list', {})).tools;
  const edit = tools.find(tool => tool.name === 'edit_world');
  assert.ok(edit.inputSchema.required.includes('bundle'));
  assert.ok(edit.inputSchema.required.includes('revision'));
  assert.equal(edit._meta, undefined);
  assert.equal(tools.find(tool => tool.name === 'create_world')._meta, undefined);
  assert.equal(tools.find(tool => tool.name === 'capture_scene_view')._meta.ui.resourceUri, tools.find(tool => tool.name === 'open_studio')._meta.ui.resourceUri);
  const response = await worker.fetch(new Request('https://example.test/editor/project-example'), { ASSETS: { fetch: request => new Response(new URL(request.url).pathname + new URL(request.url).search) } });
  assert.equal(await response.text(), '/editor.html?project=project-example');
  assert.equal((await worker.fetch(new Request('https://example.test/editor/one%2Ftwo'), env)).status, 400);
});
