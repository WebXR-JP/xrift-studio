import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
after(() => server.close());
const { verifyStudioResult, parseStudioResult, StudioVerificationError, studioReceiptVerification, settleStudioData, assertStudioReplayAllowed, assertStudioProjectOpenAllowed } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-delivery.ts');
const { openBrowserProjectSession } = await server.ssrLoadModule('/src/preview/browser-project-session.ts');
const { callTool, default: cloudWorker } = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');

test('MCP initialization negotiates supported Streamable HTTP revisions', async () => {
  for (const [requested, expected] of [
    ['2025-03-26', '2025-03-26'], ['2025-06-18', '2025-06-18'],
    ['2025-11-25', '2025-11-25'], ['2099-01-01', '2025-11-25'],
  ]) {
    const response = await cloudWorker.fetch(new Request('https://studio.example/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: requested, capabilities: {}, clientInfo: { name: 'compatibility-test', version: '1.0.0' },
      } }),
    }), { ASSETS: { fetch() { throw new Error('Initialization must not load assets'); } } });
    assert.equal(response.status, 200);
    const { result } = await response.json();
    assert.equal(result.protocolVersion, expected);
    assert.deepEqual(result.capabilities, { tools: {}, resources: {} });
  }
});

test('discovered tools declare the OAuth scopes required by Sites hosting', async () => {
  const request = new Request('https://studio.example/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const response = await cloudWorker.fetch(request, { ASSETS: { fetch() { throw new Error('Discovery must not load assets'); } } });
  const { result } = await response.json();
  assert.ok(result.tools.length > 0);
  for (const tool of result.tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: ['openid', 'resource.invoke', 'email'] }], tool.name);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes, tool.name);
  }
  assert.equal(result.tools.find(tool => tool.name === 'open_studio')._meta.ui.resourceUri, 'ui://xrift-studio/worlds-v20');
});

test('discovered bundle inputs require the complete document envelope, including empty prefabs', async () => {
  const response = await cloudWorker.fetch(new Request('https://studio.example/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), { ASSETS: { fetch() { throw new Error('Discovery must not load assets'); } } });
  const { result } = await response.json();
  const created = await callTool('create_world', { name: 'complete-bundle-regression' });
  const bundleTools = result.tools.filter(tool => tool.inputSchema.properties.bundle);
  assert.deepEqual(bundleTools.map(tool => tool.name).sort(), []);
  for (const tool of bundleTools) {
    const schema = tool.inputSchema.properties.bundle;
    assert.deepEqual(schema.required, ['project', 'scene', 'assets', 'prefabs'], tool.name);
    for (const field of schema.required) {
      assert.equal(schema.properties[field].type, 'object', `${tool.name}.${field}`);
      assert.equal(typeof created.bundle[field], 'object');
      assert.equal(Array.isArray(created.bundle[field]), false);
    }
  }
  for (const prefabs of [undefined, null, []]) {
    await assert.rejects(callTool('open_studio', {
      bundle: { ...created.bundle, prefabs }, revision: created.revision,
    }), /bundle.prefabs/);
  }
  const opened = await callTool('open_studio', {
    bundle: created.bundle, revision: created.revision, operationId: created.operationId,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(opened.bundle)), JSON.parse(JSON.stringify(created.bundle)));
  assert.equal(opened.delivery.hash, created.delivery.hash);
  assert.equal(opened.projectId, created.projectId);
});

test('model commands carry local targets while the app global entry accepts empty arguments', async () => {
  const response = await cloudWorker.fetch(new Request('https://studio.example/mcp', {
    method: 'POST', body: JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),
  }), {ASSETS:{fetch(){throw new Error('No asset access');}}});
  const {tools} = (await response.json()).result;
  assert.deepEqual(tools.find(tool=>tool.name==='open_studio')._meta.ui.visibility,['app']);
  assert.equal(tools.find(tool=>tool.name==='store_editor_snapshot'),undefined);
  const visible = tools.filter(tool=>!tool._meta.ui?.visibility || tool._meta.ui.visibility.includes('model'));
  assert.ok(visible.some(tool=>tool.name==='show_world'));
  assert.ok(!visible.some(tool=>tool.inputSchema.properties.bundle));
  for(const name of ['show_world','retry_world','capture_scene_view']) {
    assert.deepEqual(tools.find(tool=>tool.name===name).inputSchema.required,name==='retry_world'?['projectId','operationId']:['projectId']);
  }
  assert.equal((await callTool('open_studio',{})).launch,'new');
});

test('missing conversation state asks the agent to carry data, never to open the Editor', async () => {
  await assert.rejects(callTool('edit_world', { operations: [{ tool: 'create_primitive', arguments: { shape: 'box' } }] }), /conversation_state_required/);
  const original = await callTool('create_world', {});
  const retry = await callTool('retry_world', { operationId: original.operationId });
  assert.equal(retry.studioCommand.operationId, original.operationId);
  assert.equal((await callTool('get_editor_context', {})).studioCommand.name, 'get_editor_context');
  await assert.rejects(callTool('edit_world', { operations: Array(201).fill({}) }), /200/);
});

test('read-only tools cannot be changed into browser write commands through extra arguments', async () => {
  for (const name of ['get_editor_context', 'get_operation_status']) {
    await assert.rejects(callTool(name, { name: 'edit_world', operationId: 'test-id', operations: [] }), /未対応/);
  }
  await assert.rejects(callTool('get_operation_status', {}));
  await assert.rejects(callTool('get_operation_status', { operationId: '__proto__' }), /操作ID/);
  const status = await callTool('get_operation_status', { operationId: 'test-id' });
  assert.equal(status.studioCommand.name, 'get_operation_status');
  assert.equal(status.studioCommand.operationId, 'test-id');
  const retry = await callTool('retry_world', { operationId: 'test-id', name: 'edit_world', operations: [] });
  assert.deepEqual(retry.studioCommand, { name: 'retry_world', operationId: 'test-id' });
  const response = await cloudWorker.fetch(new Request('https://studio.example/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id':'isolated-test-owner' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: 'retry_world', arguments: { operationId: 'test-id', name: 'edit_world', operations: [] },
    } }),
  }), { ASSETS: { fetch() { throw new Error('No assets should be accessed'); } } });
  const { result } = await response.json();
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
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
  assert.deepEqual(verified.verification, { applied: true, saved: true, rendered: true, captured: true });
});

test('a capture failure retains confirmed application and save without changing the project', async () => {
  const result = await callTool('create_world', { name: 'capture-failure-regression' });
  const original = structuredClone(result.bundle);
  const persistedOriginal = JSON.parse(JSON.stringify(original));
  let documents = { project: original.project, scenes: { [original.scene.sceneId]: original.scene }, assets: original.assets, prefabs: original.prefabs };
  const backend = {
    acquire: async () => () => {},
    read: async () => structuredClone(documents),
    save: async (_path, next) => { documents = JSON.parse(JSON.stringify(next)); },
  };
  const session = await openBrowserProjectSession('capture-failure-project', backend);
  const events = [];
  const editor = {
    currentBundle: () => result.bundle,
    saveNow: async () => { events.push('save'); return session.save(result.bundle); },
    captureSceneView: async () => { events.push('capture'); return { ok: false, message: 'シーンのフレームを取得できませんでした' }; },
  };
  try {
    await assert.rejects(verifyStudioResult(result, editor, () => true), error => {
      assert.ok(error instanceof StudioVerificationError);
      assert.match(error.message, /フレーム/);
      // These are the exact fields emitted in studioDelivery, even though the
      // overall receipt remains failed until a real PNG can be confirmed.
      assert.deepEqual(studioReceiptVerification({ status: 'failed', verification: error.verification }), {
        applied: true, saved: true, rendered: false, captured: false,
      });
      return true;
    });
    assert.deepEqual(events, ['save', 'capture']);
    assert.deepEqual(result.bundle, original);
  } finally { await session.close(); }
  const reopened = await openBrowserProjectSession('capture-failure-project', backend);
  try {
    assert.deepEqual(reopened.initialBundle, persistedOriginal);
    const retried = await verifyStudioResult(result, {
      currentBundle: () => reopened.initialBundle,
      saveNow: () => reopened.save(reopened.initialBundle),
      captureSceneView: async () => ({ ok: true, dataUrl: 'data:image/png;base64,rendered-frame' }),
    }, () => true);
    assert.deepEqual(retried.verification, { applied: true, saved: true, rendered: true, captured: true });
    assert.deepEqual(reopened.initialBundle, persistedOriginal);
  } finally { await reopened.close(); }
});

test('verification receipts keep failed saves and stale captures distinct from saved data', async () => {
  const result = await callTool('create_world', { name: 'verification-stages-regression' });
  const editor = {
    currentBundle: () => result.bundle,
    saveNow: async () => undefined,
    captureSceneView: async () => { throw new Error('A failed save must not attempt capture'); },
  };
  await assert.rejects(verifyStudioResult(result, editor, () => true), error => {
    assert.deepEqual(error.verification, { applied: true, saved: false, rendered: false, captured: false });
    return true;
  });
  let current = true;
  await assert.rejects(verifyStudioResult(result, {
    ...editor, saveNow: async () => 'saved-project',
    captureSceneView: async () => { current = false; return { ok: false, message: 'capture unavailable' }; },
  }, () => current), error => {
    assert.match(error.message, /切り替わり/);
    assert.deepEqual(error.verification, { applied: false, saved: true, rendered: false, captured: false });
    return true;
  });
  assert.deepEqual(studioReceiptVerification({ status: 'failed' }), { applied: false, saved: false, rendered: false, captured: false });
  assert.deepEqual(studioReceiptVerification({ status: 'verified' }), { applied: true, saved: true, rendered: true, captured: true });
});

test('saved data advances the queue after capture failure and stale retries cannot overwrite later edits', async () => {
  const original = await callTool('create_world', { name: 'saved-data-queue-regression' });
  const first = await callTool('edit_world', { bundle: original.bundle, revision: 0, operations: [
    { tool: 'create_primitive', arguments: { shape: 'box' } },
  ] });
  const latest = await callTool('edit_world', { bundle: first.bundle, revision: 1, operations: [
    { tool: 'create_primitive', arguments: { shape: 'sphere' } },
  ] });
  const saved = { applied: true, saved: true, rendered: false, captured: false };
  const receipt = { operationId: original.operationId, projectId: original.projectId, revision: original.revision,
    hash: original.delivery.hash, status: 'failed', message: 'capture unavailable', at: new Date().toISOString(), reported: false, verification: saved };
  const state = { active: null, pending: original, queue: [latest], history: [receipt], projects: {} };
  const settled = settleStudioData(state, original, saved);
  assert.equal(state.pending, original);
  assert.deepEqual(state.queue, [latest]);
  assert.equal(settled.pending, latest);
  assert.deepEqual(settled.queue, []);
  assert.equal(settled.operations[original.operationId], original);
  assert.deepEqual(settled.history, [receipt]);
  const done = settleStudioData(settled, latest, saved);
  assert.equal(done.pending, null);
  assert.equal(done.operations[latest.operationId], latest);
  assert.doesNotThrow(() => assertStudioProjectOpenAllowed('another-project', latest.projectId, done.pending));
  assert.throws(() => assertStudioReplayAllowed(receipt, latest.delivery.hash), /巻き戻さず/);
  assert.doesNotThrow(() => assertStudioReplayAllowed(receipt, original.delivery.hash));
  assert.equal(settleStudioData(state, original, { ...saved, saved: false }), state);
  assert.equal(settleStudioData(state, latest, saved), state);
  assert.equal(original.revision, 0);
  assert.equal(latest.revision, 2);
});

test('startup can restore a saved pending project without allowing a different project or bypassing ownership', async () => {
  const pending = await callTool('create_world', { name: 'pending-restore-regression' });
  const projectId = pending.bundle.project.projectId;
  const active = { projectId, path: 'pending-project', revision: pending.revision, hash: pending.delivery.hash };
  assert.doesNotThrow(() => assertStudioProjectOpenAllowed(projectId, null, pending, active));
  assert.doesNotThrow(() => assertStudioProjectOpenAllowed(projectId, projectId, pending));
  assert.throws(() => assertStudioProjectOpenAllowed(projectId, null, pending), /未完了/);
  assert.throws(() => assertStudioProjectOpenAllowed('different-project', null, pending, active), /未完了/);
  assert.throws(() => assertStudioProjectOpenAllowed(projectId, null, pending, { ...active, projectId: 'different-project' }), /未完了/);
  assert.throws(() => assertStudioProjectOpenAllowed(projectId, 'different-project', pending, active), /未完了/);
  // Passing the startup guard still uses the ordinary project lease. Another
  // live Editor remains the owner and its documents must not even be read.
  await assert.rejects(openBrowserProjectSession(active.path, {
    acquire: async () => { throw new Error('already editing'); },
    read: async () => { assert.fail('A locked project must not be read'); },
  }), /already editing/);
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
  assert.equal(edit._meta.ui.resourceUri,entry._meta.ui.resourceUri);
  assert.equal(entry._meta.ui.resourceUri,tools.find(tool=>tool.name==='capture_scene_view')._meta.ui.resourceUri);
  assert.equal(tools.find(tool=>tool.name==='create_world')._meta.ui.resourceUri,entry._meta.ui.resourceUri);
  assert.equal(entry._meta['openai/ui'].entrypoints[0].type,'global');
  assert.deepEqual(entry._meta.ui.visibility,['app']);
  assert.equal(tools.find(tool=>tool.name==='show_world')._meta.ui.visibility,undefined);
  assert.equal(tools.find(tool=>tool.name==='show_world')._meta.ui.resourceUri,entry._meta.ui.resourceUri);
  assert.equal(tools.find(tool=>tool.name==='capture_scene_view')._meta['openai/ui'],undefined);
  const fresh=(await rpc('resources/read',{uri:entry._meta.ui.resourceUri})).contents[0];
  assert.equal(fresh.uri,entry._meta.ui.resourceUri); assert.match(fresh.text,/data-studio-new-entry="true"/);
  assert.ok(fresh._meta.ui.csp.connectDomains.includes('https://public.xrift.net'));
  assert.ok(fresh._meta.ui.csp.resourceDomains.includes('https://public.xrift.net'));
  assert.equal((await rpc('resources/list')).resources.length,1);
});
