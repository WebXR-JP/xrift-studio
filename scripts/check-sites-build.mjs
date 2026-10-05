// Exercise the deployment artifact, rather than only the TypeScript source.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../dist/server/index.js';


const sourceConfig = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
const outputConfig = JSON.parse(await readFile('dist/.openai/hosting.json', 'utf8'));
assert.deepEqual(outputConfig, sourceConfig);
assert.ok(outputConfig.capabilities.includes('mcp'));
assert.equal(typeof worker.fetch, 'function');

assert.equal(outputConfig.d1, 'DB');
assert.match(await readFile('dist/drizzle/0000_plain_mysterio.sql', 'utf8'), /studio_snapshots/);
const env = { get DB() { throw new Error("MCP commands must not use the database"); }, ASSETS: { async fetch(request) {
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
assert.equal(created.command.projectId, 'project-mcp-artifact-create');
assert.equal(created.delivery.serverSaved, false);
const edited = await rpc('tools/call', { name: 'edit_world', arguments: {
  projectId: created.command.projectId, expectedRevision: 0, operationId: 'artifact-edit',
  operations: [{ tool: 'create_primitive', arguments: { shape: 'box', position: [2,1,0] } }],
} });
assert.equal(edited._meta.xriftCommand.projectId, created.command.projectId);
assert.equal(edited.structuredContent.delivery.documentEdited, false);
assert.equal(edited.structuredContent.delivery.browserSaved, false);
const opened = await rpc('tools/call', { name: 'show_world', arguments: { projectId: created.command.projectId } });
assert.equal(opened._meta.xriftCommand.name, 'show_world');
assert.equal(opened.structuredContent.delivery.rendered, false);
for (const file of ['index.html', 'editor.html']) assert.match(await readFile(`dist/client/${file}`, 'utf8'), /<html/);
console.log(`Sites artifact verified: ${tools.length} tools, embedded MCP App, stateless create/edit/open commands. Browser rendering requires host verification.`);
