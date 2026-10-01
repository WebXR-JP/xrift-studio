import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { verifyStudioResult, parseStudioResult } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-delivery.ts');
const { callTool } = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');

test('active-project commands need no bundle and retain an operation identity', async () => {
  const command = await callTool('edit_world', { operations: [{ tool: 'create_primitive', arguments: { shape: 'box' } }] });
  assert.equal(command.studioCommand.name, 'edit_world');
  assert.ok(command.studioCommand.operationId);
  assert.equal(command.bundle, undefined);
  const retry = await callTool('retry_world', { operationId: command.studioCommand.operationId });
  assert.equal(retry.studioCommand.operationId, command.studioCommand.operationId);
  assert.equal((await callTool('get_editor_context', {})).studioCommand.name, 'get_editor_context');
  await assert.rejects(callTool('edit_world', { operations: Array(201).fill({}) }), /200/);
});

test('a batch uses temporary IDs, advances revision once and rolls back invalid references', async () => {
  const original = await callTool('create_world', { name: 'batch-regression' });
  const count = Object.keys(original.bundle.scene.entities).length;
  const edited = await callTool('edit_world', { bundle: original.bundle, revision: 0, operations: [
    { tool: 'create_primitive', ref: 'trunk', arguments: { shape: 'cylinder', name: '幹', position: [0, 1, 0] } },
    { tool: 'update_transform', arguments: { entityId: '$trunk', scale: [0.3, 2, 0.3] } },
  ] });
  assert.equal(edited.revision, 1);
  assert.equal(Object.keys(edited.bundle.scene.entities).length, count + 1);
  assert.equal(edited.bundle.scene.entities[edited.refs.trunk].name, 'Cylinder');
  assert.equal(Object.keys(original.bundle.scene.entities).length, count);
  await assert.rejects(callTool('edit_world', { bundle: original.bundle, revision: 0, operations: [{ tool: 'update_transform', arguments: { entityId: '$missing' } }] }), /未定義/);
  const many = await callTool('edit_world', { bundle: original.bundle, revision: 0, operations: Array.from({ length: 200 }, (_, i) => ({ tool: 'create_primitive', arguments: { shape: 'box', name: `木${i}` } })) });
  assert.equal(many.revision, 1);
  assert.equal(Object.keys(many.bundle.scene.entities).length, count + 200);
});
test('retry keeps operation, revision, document and hash without running edits again', async () => {
  const original = await callTool('create_world', { name: 'delivery-regression' });
  const retry = await callTool('retry_world', original);
  assert.deepEqual(JSON.parse(JSON.stringify(retry)), JSON.parse(JSON.stringify(original)));
  assert.equal(retry.delivery.status, 'awaiting_studio_verification');
  assert.throws(() => parseStudioResult({ ...retry, revision: -1 }));
});
test('document creation, save failure, missing render and changing editors cannot confirm delivery', async () => {
  const result = await callTool('create_world', { name: 'delivery-regression' });
  const editor = { currentBundle: () => result.bundle, saveNow: async () => 'browser-project', captureSceneView: async () => ({ ok: true, dataUrl: 'data:image/png;base64,rendered-frame' }) };
  const different = await callTool('create_world', { name: 'different' });
  await assert.rejects(verifyStudioResult(result, { ...editor, currentBundle: () => different.bundle }, () => true), /一致/);
  await assert.rejects(verifyStudioResult(result, { ...editor, saveNow: async () => undefined }, () => true), /保存/);
  await assert.rejects(verifyStudioResult(result, { ...editor, captureSceneView: async () => ({ ok: false, message: '描画未完了' }) }, () => true), /描画/);
  let switched = false;
  await assert.rejects(verifyStudioResult(result, { ...editor, captureSceneView: async () => { switched = true; return editor.captureSceneView(); } }, () => !switched), /切り替わり/);
  const verified = await verifyStudioResult(result, editor, () => true);
  assert.equal(verified.hash, result.delivery.hash);
  assert.equal(verified.data, 'rendered-frame');
});


test('project opening targets a validated ID and generated links retain the same identity', async () => {
  const created = await callTool('create_world', {name:'routing-test'});
  assert.equal(created.projectId, created.bundle.project.projectId);
  assert.equal(created.sceneId, created.bundle.scene.sceneId);
  assert.equal(new URL(created.editorUrl).searchParams.get('path'), '/editor/'+created.projectId);
  const opened = await callTool('open_studio', {projectId:created.projectId});
  assert.equal(opened.studioCommand.name, 'open_project');
  assert.equal(opened.studioCommand.projectId, created.projectId);
  assert.equal(opened.delivery.status, 'awaiting_studio_verification');
  assert.equal((await callTool('open_studio', {})).localProjects, true);
  await assert.rejects(() => callTool('open_studio', {projectId:'../other'}), /不正/);
});

test('new worlds need no active project or name and each new request gets its own ID', async () => {
  const first = await callTool('create_world', {});
  const second = await callTool('open_studio', {mode:'new'});
  assert.equal(first.bundle.project.metadata.name, '新しいワールド');
  assert.notEqual(first.projectId, second.projectId);
  assert.equal(first.delivery.status, 'awaiting_studio_verification');
  assert.equal((await callTool('open_studio', {})).launch, 'new');
  assert.equal((await callTool('open_studio', {mode:'resume'})).launch, 'resume');
  await assert.rejects(callTool('open_studio', {mode:'new',projectId:first.projectId}), /同時/);
  await assert.rejects(callTool('open_studio', {mode:'unknown'}), /不正/);
  await assert.rejects(callTool('create_world', {name:''}));
});

test('Sites new entry redirects without touching saved projects or assets', async () => {
  const {default:worker} = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');
  const response = await worker.fetch(new Request('https://example.test/new?name=秋の公園'), {ASSETS:{fetch(){throw new Error('Unexpected asset access');}}});
  assert.equal(response.status,307);
  const url = new URL(response.headers.get('location'));
  assert.equal(url.pathname, '/editor.html'); assert.equal(url.searchParams.get('new'),'1'); assert.equal(url.searchParams.get('name'),'秋の公園');
});

test('global entry and later operations address the same live editor resource', async () => {
  const {default:worker} = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');
  const rpc = async (method,params={}) => (await (await worker.fetch(new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{ASSETS:{fetch:async()=>new Response('<!doctype html><html lang="ja"><head></head><body></body></html>')}})).json()).result;
  const tools=(await rpc('tools/list')).tools;
  const entry=tools.find(tool=>tool.name==='open_studio'); const edit=tools.find(tool=>tool.name==='edit_world');
  assert.equal(entry._meta.ui.resourceUri,edit._meta.ui.resourceUri);
  assert.equal(entry._meta.ui.resourceUri,tools.find(tool=>tool.name==='capture_scene_view')._meta.ui.resourceUri);
  assert.equal(entry._meta.ui.resourceUri,tools.find(tool=>tool.name==='create_world')._meta.ui.resourceUri);
  assert.equal(entry._meta['openai/ui'].entrypoints[0].type,'global');
  assert.equal(entry._meta.ui.visibility,undefined);
  assert.equal(tools.find(tool=>tool.name==='capture_scene_view')._meta['openai/ui'],undefined);
  const fresh=(await rpc('resources/read',{uri:entry._meta.ui.resourceUri})).contents[0];
  assert.equal(fresh.uri,entry._meta.ui.resourceUri); assert.match(fresh.text,/data-studio-new-entry="true"/);
  assert.ok(fresh._meta.ui.csp.connectDomains.includes('https://public.xrift.net'));
  assert.ok(fresh._meta.ui.csp.resourceDomains.includes('https://public.xrift.net'));
  assert.equal((await rpc('resources/list')).resources.length,1);
});
