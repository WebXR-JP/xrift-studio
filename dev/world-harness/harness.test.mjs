import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHarness, readEvents, replay, completionProblems } from './harness.mjs';
import { attachCaptureImage, McpClient } from './stdio-adapter.mjs';
import { requestAction } from './chat-model.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const goal = { blueprint: 'A courtyard with a visible central tree.', criteria: ['Tree is visible.'] };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA2kAAAAASUVORK5CYII=';
const frame = { content: [{ type: 'image', mimeType: 'image/png', data: png }] };
const capture = view => ({ type: 'capture', view });
const review = { type: 'review', criterion: goal.criteria[0], passed: true, reason: 'Tree visible in both views.' };
const finish = { type: 'finish', summary: 'Done.' };

async function setup(actions, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'xrift-harness-'));
  let calls = 0;
  return { journal: join(dir, 'session.jsonl'), goal,
    model: { next: async () => { assert.ok(actions.length, 'Unexpected model request'); return actions.shift(); } },
    tools: {
      list: async () => [{ name: 'create_primitive', effect: 'write' }, { name: 'capture_scene_view', effect: 'view' }],
      capture: async () => structuredClone(frame),
      call: async () => { calls++; return { content: [{ type: 'text', text: 'created' }] }; },
      ...overrides,
    },
    callCount: () => calls,
  };
}

test('completion requires actual images and a reasoned review; resume is idempotent', async () => {
  const options = await setup([finish, capture('spawn'), capture('iso'), review, finish]);
  assert.equal((await runHarness(options)).status, 'complete');
  assert.equal((await runHarness(options)).status, 'complete');
  const events = await readEvents(options.journal);
  assert.equal(events.filter(e => e.type === 'feedback').length, 1);
  assert.equal(completionProblems(replay(events)).length, 0);
});

test('a write invalidates all previous captures and reviews', async () => {
  const options = await setup([capture('spawn'), capture('iso'), review,
    { type: 'tool', name: 'create_primitive' }, finish]);
  assert.equal((await runHarness({ ...options, maxSteps: 5 })).status, 'paused');
  assert.equal(options.callCount(), 1);
  assert.equal(completionProblems(replay(await readEvents(options.journal))).length, 3);
});

test('manual edits during model inference invalidate the proposed completion', async () => {
  let revision = 1;
  const actions = [capture('spawn'), capture('iso'), review, finish];
  const options = await setup(actions, { context: async () => ({ revision }) });
  const next = options.model.next;
  options.model.next = async input => {
    const action = await next(input);
    if (action.type === 'finish') revision++;
    return action;
  };
  assert.equal((await runHarness({ ...options, maxSteps: 4 })).status, 'paused');
  const events = await readEvents(options.journal);
  assert.equal(replay(events).completed, false);
  assert.ok(events.some(event => event.problems?.[0]?.includes('Scene changed')));
});

test('step-budget resume continues from journal without repeating completed writes', async () => {
  const options = await setup([{ type: 'tool', name: 'create_primitive' }, capture('spawn'), capture('iso'), review, finish]);
  assert.equal((await runHarness({ ...options, maxSteps: 1 })).status, 'paused');
  assert.equal((await runHarness(options)).status, 'complete');
  assert.equal(options.callCount(), 1);
});

test('a lost write response remains uncertain and is never retried on resume', async () => {
  let calls = 0;
  const options = await setup([{ type: 'tool', name: 'create_primitive' }], {
    call: async () => { calls++; throw new Error('connection lost after remote write'); },
  });
  assert.equal((await runHarness(options)).status, 'uncertain');
  assert.equal((await runHarness(options)).status, 'uncertain');
  assert.equal(calls, 1);
});

test('failed or text-only captures cannot satisfy completion', async () => {
  for (const result of [{ content: [{ type: 'text', text: 'path.png' }] }, { ...frame, isError: true }]) {
    const options = await setup([capture('spawn'), capture('iso'), review, finish], { capture: async () => result });
    assert.equal((await runHarness({ ...options, maxSteps: 4 })).status, 'paused');
    assert.equal(replay(await readEvents(options.journal)).completed, false);
  }
});

test('unknown tools, wrong goals and concurrent journal use are rejected', async () => {
  const options = await setup([{ type: 'tool', name: 'unconfigured_tool' }]);
  await runHarness({ ...options, maxSteps: 1 });
  assert.equal(options.callCount(), 0);
  await assert.rejects(runHarness({ ...options, goal: { ...goal, blueprint: 'different' } }), /different goal/);
  await writeFile(`${options.journal}.lock`, 'locked');
  await assert.rejects(runHarness(options), /EEXIST/);
});

test('capture adapter reads PNG only inside its configured directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xrift-images-'));
  const captures = join(dir, 'captures');
  await mkdir(captures);
  const file = join(captures, 'frame.png');
  await writeFile(file, Buffer.from(png, 'base64'));
  const result = await attachCaptureImage({ structuredContent: { path: file }, content: [] }, captures);
  assert.equal(result.content[0].data, png);
  const outside = join(dir, 'outside.png');
  await writeFile(outside, Buffer.from(png, 'base64'));
  await assert.rejects(attachCaptureImage({ structuredContent: { path: outside } }, captures), /outside/);
  await writeFile(file, 'not an image');
  await assert.rejects(attachCaptureImage({ structuredContent: { path: file } }, captures), /PNG/);
});

test('model adapter sends image parts and decodes a JSON action', async () => {
  let body;
  const action = await requestAction({ protocol: 'Return JSON', instructions: '', state: {}, tools: [],
    events: [{ type: 'result', result: frame }] }, {
    endpoint: 'https://example.invalid/chat/completions', model: 'test-vision',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(finish) } }] }) };
    },
  });
  assert.deepEqual(action, finish);
  assert.equal(body.messages[1].content.at(-1).image_url.url, `data:image/png;base64,${png}`);
  assert.ok(!body.messages[1].content[1].text.includes(png));
});

test('stdio MCP initializes, receives results, and reports remote errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xrift-mcp-'));
  const file = join(dir, 'server.mjs');
  await writeFile(file, `import { createInterface } from 'node:readline';
createInterface({ input: process.stdin }).on('line', line => {
 const m = JSON.parse(line); if (m.id === undefined) return;
 const reply = m.method === 'bad' ? {error:{message:'failure'}} : {result:{method:m.method}};
 console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,...reply}));
});`);
  const client = new McpClient(process.execPath, [file], { timeoutMs: 2000 });
  try {
    assert.equal((await client.initialize()).method, 'initialize');
    assert.equal((await client.request('tools/list', {})).method, 'tools/list');
    await assert.rejects(client.request('bad', {}), /failure/);
  } finally { client.close(); }
  assert.ok((await readFile(file, 'utf8')).length);
});

test('CLI runs the real stdio adapter through camera placement, image loading and completion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xrift-cli-harness-'));
  const image = join(dir, 'frame.png');
  await writeFile(image, Buffer.from(png, 'base64'));
  const server = join(dir, 'server.mjs');
  await writeFile(server, `import { createInterface } from 'node:readline';
createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line); if(m.id===undefined)return;
 let result={};
 if(m.method==='initialize')result={instructions:'test server'};
 if(m.method==='tools/list')result={tools:[{name:'capture_scene_view',inputSchema:{type:'object'}}]};
 if(m.method==='tools/call') {
  const name=m.params.name;
  if(name==='get_editor_context')result={structuredContent:{projectId:'p',sceneId:'s',revision:1}};
  else if(name==='capture_scene_view')result={structuredContent:{path:${JSON.stringify(image)}},content:[]};
  else if(name==='set_scene_view_camera')result={content:[]};
  else result={isError:true,content:[]};
 }
 console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));
});`);
  const model = join(dir, 'model.mjs');
  await writeFile(model, `let raw='';for await(const c of process.stdin)raw+=c;
const {state,events}=JSON.parse(raw);
let action;
if(!state.captures.spawn)action={type:'capture',view:'spawn'};
else if(!state.captures.iso)action={type:'capture',view:'iso'};
else if(!state.reviews['Tree is visible.']) {
 if(!events.some(e=>e.result?.content?.some(c=>c.type==='image')))throw Error('No image');
 action=${JSON.stringify(review)};
} else action=${JSON.stringify(finish)};
process.stdout.write(JSON.stringify(action));`);
  const config = join(dir, 'config.json');
  await writeFile(config, JSON.stringify({
    adapter: fileURLToPath(new URL('./stdio-adapter.mjs', import.meta.url)), journal: './session.jsonl', goal,
    model: { command: process.execPath, args: [model] },
    mcp: { command: process.execPath, args: [server] }, captureDirectory: dir,
    captureArguments: { projectId: 'p', sceneId: 's' },
    cameras: { spawn: { projectId: 'p', sceneId: 's', position: [0, 1.6, 5], target: [0, 1, 0] },
      iso: { projectId: 'p', sceneId: 's', preset: 'iso' } },
    effects: { capture_scene_view: 'view' },
  }));
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./run.mjs', import.meta.url)), config], { timeout: 10000 });
  assert.equal(JSON.parse(stdout).status, 'complete');
  assert.equal(replay(await readEvents(join(dir, 'session.jsonl'))).completed, true);
});
