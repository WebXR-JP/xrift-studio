import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCredentialStore, InMemoryModelsStore, fauxProvider, fauxAssistantMessage, fauxToolCall, getCurrentTools } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { runStudioAgent } from '../dist/agent.js';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const scope = { projectId: 'world', sceneId: 'scene' };
const schemas = ['get_editor_context', 'get_project_health', 'create_primitive', 'save_scene', 'capture_scene_view'].map(name => ({ name, description: name, inputSchema: { type: 'object' }, readOnly: name.startsWith('get_') }));
const input = { ...scope, token: 'fixture-only', model: 'fixture', prompt: '家を作ってください', mode: 'build', context: '{}', tools: schemas };
const direct = (name, args = {}) => fauxAssistantMessage(fauxToolCall(name, args));
const code = script => direct('codemode', { code: script });
const invoke = (tool, args = {}) => tool === 'create_primitive' ? code(`text(await tools.${tool}(${JSON.stringify(args)}));`) : direct(tool, args);
const finish = () => fauxAssistantMessage(fauxToolCall('studio_finish', { summary: '家を保存し描画を確認しました', criteria: [{ criterion: '依頼された家がある', passed: true, reason: '現在の画像とEntityで確認' }] }));
async function fixture(responses, overrides = {}) {
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, refreshOnCreate: false });
  const faux = fauxProvider({ provider: 'xrift-chatgpt', models: [{ id: 'fixture', reasoning: true, input: ['text', 'image'] }] });
  runtime.registerNativeProvider(faux.provider);
  faux.setResponses(responses);
  let fingerprint = 'before', revision = 0, saved = true;
  const calls = [], events = [];
  const host = async (name, args) => {
    calls.push({ name, args });
    if (overrides.host) {
      const replacement = await overrides.host(name, args);
      if (replacement) return replacement;
    }
    if (name === 'get_editor_context') return { ...scope, fingerprint, revision, editorMode: 'edit', importBusy: false, saveStatus: saved ? 'saved' : 'dirty' };
    if (name === 'create_primitive') {
      if (overrides.noop) return { fingerprint, revisionBefore: revision, revisionAfter: revision };
      const before = revision++; fingerprint = `after-${revision}`; saved = false;
      return { fingerprint, entityId: 'house', revisionBefore: before, revisionAfter: revision };
    }
    if (name === 'save_scene') { saved = true; return { fingerprint, saved: true }; }
    if (name === 'get_project_health') return { fingerprint, health: { status: 'ready', issues: [] } };
    if (name === 'capture_scene_view') return { fingerprint, image: { mimeType: 'image/png', data: 'fixture-rendered-image' } };
    throw new Error(`Unknown tool ${name}`);
  };
  return { run: (request = {}) => runStudioAgent({ ...input, ...request }, host, event => events.push(event), overrides.signal, runtime, overrides.live), calls, events, faux };
}
const finalText = () => fauxAssistantMessage('保存と確認が完了しました');
const verify = () => [invoke('save_scene', scope), invoke('get_project_health', scope), invoke('capture_scene_view', scope), finish(), finalText()];

test('Pi discovers deferred official schemas and edits directly in a single session', async () => {
  const f = await fixture([context => {
    const names = getCurrentTools(context.messages).map(tool => tool.name);
    assert.ok(names.includes('codemode') && names.includes('tool_search'));
    assert.ok(!names.includes('create_primitive'));
    assert.ok(!names.includes('studio') && !names.includes('studio_tools'));
    return direct('tool_search', { query: 'create_primitive', limit: 1 });
  }, context => {
    assert.ok(getCurrentTools(context.messages).some(tool => tool.name === 'create_primitive'));
    return direct('create_primitive', { ...scope, expectedRevision: 0 });
  }, ...verify()]);
  await f.run({ context: JSON.stringify({ options: { teamwork: true } }) }); // obsolete settings cannot create child agents
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 1);
  assert.equal(f.calls.filter(call => call.name === 'get_editor_context').length, 2); // finish checks only
});

test('Pi codemode overlaps independent reads and returns every result', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const f = await fixture([code(`const results = await Promise.allSettled([tools.get_editor_context({}), tools.get_project_health({})]); results.forEach(text);`), context => {
    assert.match(JSON.stringify(context.messages), /fulfilled/);
    return verify()[0];
  }, ...verify().slice(1)], { async host(name) {
    if (['get_editor_context', 'get_project_health'].includes(name) && reads < 2) { if (++reads === 2) release(); await gate; }
  } });
  await f.run();
  assert.equal(reads, 2);
});

test('persisted SDK history branches from an exact completed response without importing another branch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pi-history-'));
  try {
    const path = join(directory, 'session.jsonl');
    const plan = () => fauxAssistantMessage(fauxToolCall('studio_plan', { title: '制作案', description: '現在のSceneを見て配置を提案する' }));
    const first = await fixture([plan(), finalText()]);
    const result = await first.run({ mode: 'plan', prompt: 'FIRST_BRANCH_ONLY', session: { id: 'root-chat', path } });
    assert.ok(result.history.nodes.find(node => node.id === result.history.leafId)?.canBranch);
    const second = await fixture([context => { assert.match(JSON.stringify(context.messages), /FIRST_BRANCH_ONLY/); return plan(); }, finalText()]);
    await second.run({ mode: 'plan', prompt: 'SECOND_BRANCH_ONLY', session: { id: 'root-chat', path, leafId: result.history.leafId } });
    const other = await fixture([context => {
      assert.match(JSON.stringify(context.messages), /FIRST_BRANCH_ONLY/);
      assert.doesNotMatch(JSON.stringify(context.messages), /SECOND_BRANCH_ONLY/);
      return plan();
    }, finalText()]);
    const branch = await other.run({ mode: 'plan', prompt: 'ANOTHER_DIRECTION', session: { id: 'root-chat', path, leafId: result.history.leafId } });
    assert.ok(branch.history.nodes.length > result.history.nodes.length);
    assert.doesNotMatch(await readFile(path, 'utf8'), /fixture-only/);
    const invalid = await fixture([plan(), finalText()]);
    await assert.rejects(invalid.run({ mode: 'plan', session: { id: 'root-chat', path, leafId: 'missing' } }), /完了した応答を選んで/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('legacy package registrations and local extensions never load in build or Plan', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pi-extension-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'fixture-pi-extension', version: '1.0.0', type: 'module', pi: { extensions: ['./extension.js'] } }));
    await writeFile(join(directory, 'extension.js'), `throw new Error('EXTERNAL_CODE_MUST_NOT_LOAD');`);
    await mkdir(join(directory, 'extensions'));
    await writeFile(join(directory, 'extensions', 'local.js'), `throw new Error('LOCAL_CODE_MUST_NOT_LOAD');`);
    const f = await fixture(verify());
    await f.run({ packages: [{ source: 'npm:fixture-pi-extension@1.0.0', path: directory }], resourceRoot: directory });
    const p = await fixture([fauxAssistantMessage(fauxToolCall('studio_plan', { title: 'Plan', description: '編集しない' })), finalText()]);
    await p.run({ mode: 'plan', packages: [{ source: 'npm:fixture-pi-extension@1.0.0', path: directory }], resourceRoot: directory });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real Pi SDK edits through Studio, receives actual image blocks and completes only after current evidence', async () => {
  const f = await fixture([invoke('create_primitive', { ...scope, expectedRevision: 0 }), ...verify().slice(0, 3), context => {
    assert.ok(context.messages.some(message => message.role === 'toolResult' && message.content.some(block => block.type === 'image' && block.data === 'fixture-rendered-image')));
    return finish();
  }, finalText()]);
  assert.equal((await f.run()).plan, undefined);
  assert.equal(f.events.filter(event => event.changed).length, 1);
  assert.equal(f.events.filter(event => event.saved).length, 1);
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 1);
});

test('codemode cannot hide the captured image or reach shell tools', async () => {
  const f = await fixture([code(`text(ALL_TOOLS.map(tool => tool.name));`), context => {
    const output = context.messages.findLast(message => message.role === 'toolResult').content.map(block => block.text ?? '').join('');
    for (const name of ['capture_scene_view', 'studio_finish', 'read', 'write', 'edit', 'bash', 'powershell']) assert.ok(!output.includes('"' + name + '"'));
    return code(`text(await tools.capture_scene_view({}));`);
  }, finish(), context => {
    assert.match(JSON.stringify(context.messages), /完成条件を満たしていません/);
    return verify()[0];
  }, ...verify().slice(1)]);
  await f.run();
  assert.equal(f.calls.filter(call => call.name === 'capture_scene_view').length, 1);
});

test('ordinary assistant claims never mark an unverified result completed', async () => {
  const f = await fixture([fauxAssistantMessage('家を64件保存しました。完了です')]);
  const response = await f.run();
  assert.equal(response.completionVerified, false);
  assert.match(response.text, /家を64件/);
  assert.equal(f.calls.length, 0);
});

test('steering is received after the active tool, records attachments and deduplicates retries', async () => {
  let send, captured;
  const message = { id: 'input-one', prompt: '入口を広くしてください', delivery: 'steer', attachedEntityIds: ['house'] };
  const f = await fixture([invoke('create_primitive', scope), context => {
    assert.match(JSON.stringify(context.messages), /入口を広くしてください/);
    assert.match(JSON.stringify(context.messages), /attachedEntityIds/);
    assert.equal(f.events.filter(event => event.type === 'input' && event.state === 'applied').length, 1);
    return verify()[0];
  }, ...verify().slice(1)], {
    live: { attach(handler) { captured = send = handler; return () => { send = undefined; }; } },
    async host(name) {
      if (name === 'create_primitive') { await send(message); await send(message); }
    },
  });
  const response = await f.run();
  assert.equal(response.completionVerified, true);
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 1);
  assert.equal(f.events.filter(event => event.type === 'input' && event.state === 'queued').length, 1);
  assert.equal(send, undefined);
  await assert.rejects(captured({ ...message, id: 'late-message' }), /応答は終了/);
});

test('follow-up waits for the first response and can edit after its completion gate', async () => {
  let send, queued = false;
  const message = { id: 'follow-one', prompt: '次は窓を調整してください', delivery: 'follow_up' };
  const f = await fixture([invoke('create_primitive', scope), ...verify().slice(0, -1), context => {
    assert.doesNotMatch(JSON.stringify(context.messages), /次は窓を調整/);
    return finalText();
  }, context => {
    assert.match(JSON.stringify(context.messages), /次は窓を調整/);
    return invoke('create_primitive', scope);
  }, ...verify()], {
    live: { attach(handler) { send = handler; return () => {}; } },
    async host(name) {
      if (name === 'create_primitive' && !queued) { queued = true; await send(message); }
    },
  });
  assert.equal((await f.run()).completionVerified, true);
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 2);
  assert.equal(f.events.filter(event => event.type === 'input' && event.state === 'applied').length, 1);
});

test('late steering during the final reply invalidates the previous completion evidence', async () => {
  let send;
  const f = await fixture([...verify().slice(0, -1), async () => {
    await send({ id: 'late-steer', delivery: 'steer', prompt: '屋根も調整してください' });
    return finalText();
  }, context => {
    assert.match(JSON.stringify(context.messages), /屋根も調整してください/);
    return fauxAssistantMessage('屋根の調整について応答しました');
  }], { live: { attach(handler) { send = handler; return () => {}; } } });
  assert.equal((await f.run()).completionVerified, false);
  assert.equal(f.events.filter(event => event.type === 'input' && event.state === 'applied').length, 1);
});

test('plan is read-only, including refusing save and capture, then returns a reviewable plan', async () => {
  const f = await fixture([invoke('create_primitive', scope), invoke('save_scene', scope), context => {
    assert.match(JSON.stringify(context.messages), /not found|Unknown|not available/i);
    return fauxAssistantMessage(fauxToolCall('studio_plan', { title: '家の制作', description: '本体、屋根、窓、玄関を配置し、保存と撮影で確認する' }));
  }, finalText()]);
  assert.equal((await f.run({ mode: 'plan' })).plan.title, '家の制作');
  assert.equal(f.calls.length, 0);
});

test('Studio validation errors reach Pi so it can repair the arguments', async () => {
  let first = true;
  const f = await fixture([invoke('create_primitive', { ...scope, badField: true }), context => {
    assert.match(JSON.stringify(context.messages), /INVALID_ARGUMENTS/);
    return invoke('create_primitive', { ...scope, expectedRevision: 0 });
  }, ...verify()], { host(name) { if (name === 'create_primitive' && first) { first = false; throw new Error('INVALID_ARGUMENTS: badField'); } } });
  await f.run();
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 2);
});

test('a later edit invalidates a saved image and health check; Pi must save and inspect again', async () => {
  const f = await fixture([invoke('create_primitive', scope), ...verify().slice(0, 3), invoke('create_primitive', scope), finish(), context => {
    assert.match(JSON.stringify(context.messages), /完成条件を満たしていません/); return invoke('save_scene', scope);
  }, ...verify().slice(1)]);
  await f.run();
  assert.equal(f.calls.filter(call => call.name === 'capture_scene_view').length, 2);
});

test('old no-op, tool-call and turn budgets no longer truncate a Pi session', async () => {
  const f = await fixture([code(`for (let i = 0; i < 270; i++) await tools.create_primitive(${JSON.stringify(scope)}); text('all calls finished');`), ...Array.from({ length: 70 }, () => invoke('get_editor_context')), ...verify()], { noop: true });
  await f.run();
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 270);
  assert.equal(f.events.filter(event => event.changed).length, 0);
});

test('cross-project calls and unknown tools never reach the Editor', async () => {
  const f = await fixture([invoke('publish_project', {}), invoke('create_primitive', { projectId: 'other', sceneId: 'scene' }), finalText()]);
  const response = await f.run();
  assert.equal(response.completionVerified, false);
  assert.equal(f.calls.some(call => ['publish_project', 'create_primitive'].includes(call.name)), false);
});

test('cancellation drains an admitted tool and prevents a subsequent edit', async () => {
  const controller = new AbortController();
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture([invoke('create_primitive', scope), invoke('create_primitive', scope), ...verify()], { signal: controller.signal,
    async host(name) { if (name === 'create_primitive') { started(); await gate; } } });
  let settled = false;
  const running = f.run().finally(() => { settled = true; });
  const rejection = assert.rejects(running, /停止/);
  await ready; controller.abort(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); release(); await rejection;
  assert.equal(f.calls.filter(call => call.name === 'create_primitive').length, 1);
});

test('OpenAI Responses transport uses native-supplied bearer auth, the selected effort and SDK tool turns', async () => {
  const { createServer } = await import('node:http');
  const requests = [];
  const steps = [
    ['save_scene', scope],
    ['get_project_health', scope],
    ['capture_scene_view', scope],
    ['studio_finish', { summary: '確認しました', criteria: [{ criterion: '既存の家を確認', passed: true, reason: '最新の画像で確認' }] }],
  ];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
    const step = steps[requests.length - 1];
    const id = `response-${requests.length}`;
    const item = step ? { type: 'function_call', id: `fc-${id}`, call_id: `call-${id}`, name: step[0], arguments: JSON.stringify(step[1]), status: 'completed' }
      : { type: 'message', id: `msg-${id}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '確認しました', annotations: [] }] };
    const send = event => res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    send({ type: 'response.created', response: { id, status: 'in_progress' } });
    send({ type: 'response.output_item.added', output_index: 0, item });
    send({ type: 'response.output_item.done', output_index: 0, item });
    send({ type: 'response.completed', response: { id, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 } } } });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, refreshOnCreate: false });
    runtime.registerProvider('xrift-chatgpt', { api: 'openai-responses', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'native-fixture-token', models: [{ id: 'fixture', name: 'fixture', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 32768, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
    const host = async name => {
      if (name === 'get_editor_context') return { ...scope, fingerprint: 'saved', editorMode: 'edit', importBusy: false, saveStatus: 'saved' };
      if (name === 'get_project_health') return { fingerprint: 'saved', health: { status: 'ready', issues: [] } };
      if (name === 'capture_scene_view') return { fingerprint: 'saved', image: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } };
      return { fingerprint: 'saved' };
    };
    const result = await runStudioAgent({ ...input, reasoningEffort: 'high' }, host, () => {}, undefined, runtime);
    assert.match(result.text, /確認しました/);
    assert.equal(requests.length, 5);
    assert.ok(requests.every(request => request.path === '/v1/responses' && request.authorization === 'Bearer native-fixture-token' && request.body.store === false && request.body.reasoning.effort === 'high'));
    assert.ok(requests[0].body.tools.every(tool => !['read', 'write', 'bash', 'edit'].includes(tool.name)));
    assert.match(JSON.stringify(requests[3].body.input), /input_image/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
