/** Stateless document transformations. No project storage or user identity headers. */
import { createPrototypeProject } from '../../src/lib/visual-editor/prototype-project';
import { executeXriftMcpEditorTool } from '../../src/lib/visual-editor/mcp-editor-tools';
import type { XriftMcpEditorToolName } from '../../src/lib/visual-editor/mcp-tool-registry';
import { validateBundle, bundleHash } from '../../src/lib/visual-editor/chatgpt-project';
import documentTools from './document-tools.json';
export interface Environment { ASSETS: { fetch(request: Request): Promise<Response> } }
const MAX_BYTES = 1024 * 1024;
const UI_URI = 'ui://xrift-studio/worlds';
const names = documentTools.map((tool) => tool.name);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSONオブジェクトで指定してください');
  return value as Record<string, unknown>;
};
const string = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('空でない文字列で指定してください');
  return value;
};
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const ui = { ui: { resourceUri: UI_URI }, 'openai/ui': { entrypoints: [{ type: 'global' }] } };
const icons = [{ src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><path d="m10 2 7 4v8l-7 4-7-4V6Zm0 8 7-4M10 10 3 6m7 4v8"/></svg>'), mimeType: 'image/svg+xml', sizes: ['any'] }];
const tools = [
  { name: 'open_studio', icons, title: 'XRift Studio', description: 'Open the local browser project library. Projects and source assets stay in this browser; there is no cloud project list.', inputSchema: schema({}), annotations: { readOnlyHint: true }, _meta: ui },
  { name: 'capture_scene_view', icons, title: 'Capture Scene View', description: 'Ask the open XRift Studio app to capture the currently rendered Scene View. The app sends the PNG back into the conversation so it can be inspected before making further edits. Requires an open Studio view in an MCP Apps-capable host.', inputSchema: schema({}), annotations: { readOnlyHint: true }, _meta: ui },
  { name: 'describe_document_tool', description: 'Read the original Studio inputSchema before adding an operation to edit_world. The transformer supplies projectId, sceneId and expectedRevision for each operation.', inputSchema: schema({ tool: { type: 'string', enum: names } }, ['tool']), annotations: { readOnlyHint: true } },
  { name: 'create_world', description: 'Generate a new Studio world document. Returns bundle and revision; use them in edit_world to build the requested scene. No server storage. Open the result in the app to save/export.', inputSchema: schema({ name: { type: 'string', minLength: 1, maxLength: 80 } }, ['name']), annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'edit_world', description: 'Transform the supplied Studio bundle, without storing it. Use the exact latest bundle and revision from create_world, edit_world, or app context. Up to 64 original document operations in order. Each operation has tool and arguments; projectId, sceneId and expectedRevision are supplied automatically. On error no partial result is applied. Returns the complete next bundle for subsequent edits and app display. No source asset bytes, filesystem, script execution or publication.', inputSchema: schema({ bundle: { type: 'object' }, revision: { type: 'integer', minimum: 0 }, operations: { type: 'array', minItems: 1, maxItems: 64, items: schema({ tool: { type: 'string', enum: names }, arguments: { type: 'object' } }, ['tool', 'arguments']) } }, ['bundle', 'revision', 'operations']), annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: UI_URI } } },
].map(tool => ({ ...tool, securitySchemes: [{ type: 'noauth' }] }));
export async function callTool(name: string, args: Record<string, unknown>) {
  if (name === 'open_studio') return { localProjects: true };
  if (name === 'capture_scene_view') return { captureSceneView: true };
  if (name === 'describe_document_tool') {
    const definition = documentTools.find(tool => tool.name === args.tool);
    if (!definition) throw new Error('Unknown document tool');
    return { definition };
  }
  if (name === 'create_world') {
    const name = string(args.name).trim();
    if (name.length > 80) throw new Error('名前は80文字までです');
    return { bundle: createPrototypeProject('world', name), revision: 0, baseHash: null };
  }
  if (name !== 'edit_world') throw new Error('Unknown tool');
  let bundle = validateBundle(args.bundle);
  const baseHash = await bundleHash(bundle);
  if (!Number.isSafeInteger(args.revision) || (args.revision as number) < 0) throw new Error('revisionが不正です');
  let revision = args.revision as number;
  if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 64) throw new Error('編集操作は1〜64個で指定してください');
  const results: unknown[] = [];
  for (const raw of args.operations) {
    const operation = object(raw); const tool = string(operation.tool);
    if (!names.includes(tool)) throw new Error('この接続では使えない操作です');
    const outcome = executeXriftMcpEditorTool({ bundle, sceneSelection: null, assetSelection: null, editorMode: 'edit', importBusy: false, revision, saveStatus: 'saved' }, { id: crypto.randomUUID(), tool: tool as XriftMcpEditorToolName, arguments: { ...object(operation.arguments), projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: revision } });
    if (outcome.changed) { bundle = validateBundle(outcome.bundle); revision++; }
    results.push(outcome.result);
  }
  return { bundle, revision, baseHash, results };
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleMcp(request: Request, env: Environment): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  let size = 0;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return response({ error: 'Request too large' }, 413); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  let message: Record<string, unknown>;
  try { message = object(JSON.parse(raw)); } catch { return response({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const id = message.id ?? null;
  const ok = (result: unknown) => response({ jsonrpc: '2.0', id, result });
  try {
    const params = message.params === undefined ? {} : object(message.params);
    if (message.id === undefined) return new Response(null, { status: 202 });
    switch (message.method) {
      case 'initialize': return ok({ protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'xrift-studio-cloud', version: '0.1.1' }, instructions: 'Stateless Studio document transformer: no accounts, database, saved worlds or publication. Call create_world, then edit_world with the complete latest bundle and revision returned by the preceding call. Read describe_document_tool before using a document operation. Batch operations to build the requested world. Never invent source files. Results open in the app and can be exported locally. When visual confirmation matters, call capture_scene_view after the result is open; the app will capture the rendered Scene View and send the PNG into the conversation. For an existing imported world, ask the user to share its editing context from the app. Documents are sent through ChatGPT and processed transiently by this endpoint. No background job continues after the tool call. Rendering and Play require the app.' });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools });
      case 'resources/list': return ok({ resources: [{ uri: UI_URI, name: 'XRift Studio', mimeType: 'text/html;profile=mcp-app' }] });
      case 'resources/read': {
        if (params.uri !== UI_URI) throw new Error('Unknown resource');
        const asset = await env.ASSETS.fetch(new Request(new URL('/chatgpt.html', request.url)));
        if (!asset.ok) throw new Error('ChatGPT App assets are not deployed');
        return ok({ contents: [{ uri: UI_URI, mimeType: 'text/html;profile=mcp-app', text: (await asset.text()).replace('<head>', `<head><base href="${new URL(request.url).origin}/">`).replace(/(src|href)="\.\//g, `$1="${new URL(request.url).origin}/`), _meta: { 'openai/ui': { availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen' }, ui: { csp: { resourceDomains: [new URL(request.url).origin], connectDomains: [new URL(request.url).origin] } } } }] });
      }
      case 'tools/call': {
        const name = string(params.name); if (!tools.some((tool) => tool.name === name)) throw new Error('Unknown tool');
        try {
          const result = await callTool(name, params.arguments === undefined ? {} : object(params.arguments));
          const text = name === 'capture_scene_view'
            ? 'XRift Studioに現在のScene Viewのキャプチャを依頼しました。アプリから届く画像を確認してから必要な編集を続けてください。'
            : 'Studioの編集結果を返しました。structuredContentのbundleとrevisionを次の編集に使ってください。';
          return ok({ content: [{ type: 'text', text, annotations: { audience: ['assistant'] } }], structuredContent: result });
        } catch (error) { return ok({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Studio operation failed' }] }); }
      }
      default: return response({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
  } catch (error) { return response({ jsonrpc: '2.0', id, error: { code: -32602, message: error instanceof Error ? error.message : 'Invalid request' } }); }
}

export default { fetch(request: Request, env: Environment) {
  return new URL(request.url).pathname === '/mcp' ? handleMcp(request, env) : env.ASSETS.fetch(request);
} };
