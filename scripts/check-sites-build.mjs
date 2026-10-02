// Exercise the deployment artifact, rather than only the TypeScript source.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../dist/server/index.js';
import { createSnapshotSqliteDatabase } from './fixtures/snapshot-sqlite.mjs';
const fixture = createSnapshotSqliteDatabase();

const sourceConfig = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
const outputConfig = JSON.parse(await readFile('dist/.openai/hosting.json', 'utf8'));
assert.deepEqual(outputConfig, sourceConfig);
assert.ok(outputConfig.capabilities.includes('mcp'));
assert.equal(typeof worker.fetch, 'function');

assert.equal(outputConfig.d1, 'DB');
assert.match(await readFile('dist/drizzle/0000_plain_mysterio.sql', 'utf8'), /studio_snapshots/);
const env = { DB: fixture.db, ASSETS: { async fetch(request) {
  assert.equal(new URL(request.url).pathname, '/chatgpt.html');
  return new Response(await readFile('dist/client/chatgpt.html'), { headers: { 'Content-Type': 'text/html' } });
} } };
const rpc = async (method, params = {}) => {
  const response = await worker.fetch(new Request('https://studio.example/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'oai-authenticated-user-id': 'isolated-artifact-check' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), env);
  assert.equal(response.status, 200);
  const message = await response.json();
  assert.equal(message.error, undefined);
  assert.notEqual(message.result.isError, true, JSON.stringify(message.result.content));
  return message.result;
};
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'artifact-check', version: '1' } });
assert.equal(init.protocolVersion, '2025-06-18');
const { tools } = await rpc('tools/list');
const opener = tools.find(tool => tool.name === 'open_studio');
assert.equal(opener._meta['openai/ui'].entrypoints[0].type, 'global');
assert.ok(opener.securitySchemes.some(scheme => scheme.type === 'oauth2'));
const { contents } = await rpc('resources/read', { uri: opener._meta.ui.resourceUri });
const view = contents[0];
assert.equal(view.mimeType, 'text/html;profile=mcp-app');
assert.match(view.text, /DecompressionStream/);
assert.doesNotMatch(view.text, /<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"|\/src\/chatgpt-editor/);
assert.ok(Buffer.byteLength(view.text) < 10 * 1024 * 1024);
const created = (await rpc('tools/call', { name: 'create_world', arguments: { name: 'Sites build check', operationId: 'artifact-create' } })).structuredContent;
const beforeCount = created.document.entityCount;
const edited = (await rpc('tools/call', { name: 'edit_world', arguments: {
  snapshotId: created.snapshotId, expectedRevision: created.revision, operationId: 'artifact-edit',
  operations: [{ tool: 'create_primitive', arguments: { shape: 'box', position: [2, 1, 0] } }],
} })).structuredContent;
assert.equal(edited.projectId, created.projectId);
assert.equal(edited.revision, created.revision + 1);
assert.equal(edited.document.entityCount, beforeCount + 1);
const opened = (await rpc('tools/call', { name: 'show_world', arguments: {
  snapshotId: edited.snapshotId,
} })).structuredContent;
assert.equal(opened.operationId, edited.operationId);
assert.equal(opened.delivery.browserSaved, false);
assert.equal(opened.delivery.rendered, false);
for (const file of ['index.html', 'editor.html']) assert.match(await readFile(`dist/client/${file}`, 'utf8'), /<html/);
fixture.close();
console.log(`Sites artifact verified: ${tools.length} tools, embedded MCP App, create/edit/open flow. Browser rendering requires host verification.`);
