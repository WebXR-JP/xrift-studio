/** Stateless document transformations. No project storage or user identity headers. */
import { createPrototypeProject } from '../../src/lib/visual-editor/prototype-project';
import { executeXriftMcpEditorTool } from '../../src/lib/visual-editor/mcp-editor-tools';
import type { XriftMcpEditorToolName } from '../../src/lib/visual-editor/mcp-tool-registry';
import { validateBundle, bundleHash } from '../../src/lib/visual-editor/chatgpt-project';
import documentTools from './document-tools.json';
import { studioProjectRoute, validateStudioProjectId } from '../../src/lib/browser-project-routing';
export interface Environment { ASSETS: { fetch(request: Request): Promise<Response> } }
const MAX_BYTES = 1024 * 1024;
const UI_URI = 'ui://xrift-studio/worlds-v13';
const NEW_UI_URI = 'ui://xrift-studio/new-v13';
const LEGACY_UI_URIS = ['ui://xrift-studio/worlds-v12', 'ui://xrift-studio/worlds-v11', 'ui://xrift-studio/worlds-v10', 'ui://xrift-studio/worlds-v9', 'ui://xrift-studio/worlds-v8', 'ui://xrift-studio/worlds-v7', 'ui://xrift-studio/worlds-v6', 'ui://xrift-studio/worlds-v5', 'ui://xrift-studio/worlds-v3', 'ui://xrift-studio/worlds-v4'];
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
const ui = { ui: { resourceUri: UI_URI } };
const entryUi = { ui: { resourceUri: NEW_UI_URI }, 'openai/ui': { entrypoints: [{ type: 'global' }] } };
const icons = [{ src: 'data:image/svg+xml;base64,' + btoa("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"brand\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#a78bfa\"/><stop offset=\".4\" stop-color=\"#8b5cf6\"/><stop offset=\".8\" stop-color=\"#6366f1\"/><stop offset=\"1\" stop-color=\"#3b82f6\"/></linearGradient></defs><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"url(#brand)\"/><path d=\"m189.5 189.5 133 133m0-133-133 133\" fill=\"none\" stroke=\"#fff\" stroke-width=\"33.3\" stroke-linecap=\"round\"/></svg>"), mimeType: 'image/svg+xml', sizes: ['any'] }];
const deliveryDescription = 'Document generation is not Studio application. Always report awaiting verification until a matching studioDelivery operationId/projectId/revision/hash with status verified AND a Scene View PNG arrives from the app. If no app, disconnected, failed, or no receipt, say the data is prepared but Studio application remains unverified. Use retry_world with operationId to recover its stored browser result; do not regenerate or re-run edits.';
async function delivery(bundle: ReturnType<typeof validateBundle>, revision: number, baseHash: string | null, operationId: string = crypto.randomUUID()) {
  return { bundle, revision, baseHash, operationId, projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId,
    editorUrl: `https://chatgpt.com/plugins/plugin_asdk_app_sites_a7e0e2c988c08191aa694d396a182112/app/open_studio?path=${encodeURIComponent(studioProjectRoute(bundle.project.projectId))}`,
    delivery: { status: 'awaiting_studio_verification', projectId: bundle.project.projectId, revision, hash: await bundleHash(bundle) } };
}
const tools = [
  { name: 'open_studio', icons, title: 'XRift Studio', description: 'Open the shared Studio editor. With no arguments, start a new saved project directly in the editor. Use mode new for explicit creation, or mode resume to browse/resume saved work. Pass projectId to open that saved project directly. Wait for studioContext.projectMatched before claiming the target is open. Projects and source assets stay in this browser; there is no cloud project list.', inputSchema: schema({ projectId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$' }, mode: { type: 'string', enum: ['new', 'resume'] }, name: { type: 'string', minLength: 1, maxLength: 80 } }), annotations: { readOnlyHint: true }, _meta: entryUi },
  { name: 'capture_scene_view', icons, title: 'Capture Scene View', description: 'Ask the open XRift Studio app to capture the currently rendered Scene View. The app sends the PNG back into the conversation so it can be inspected before making further edits. Requires an open Studio view in an MCP Apps-capable host.', inputSchema: schema({}), annotations: { readOnlyHint: true }, _meta: ui },
  ...['get_editor_context', 'get_operation_status'].map(name => ({ name, description: 'Ask the connected Studio for its actual active project or operation status. A null activeProjectId does not block creation: for a new world, call create_world immediately without asking the user to open a project. Await studioContext from the app; an unconnected app cannot confirm state.', inputSchema: schema(name === 'get_operation_status' ? { operationId: { type: 'string' } } : {}, name === 'get_operation_status' ? ['operationId'] : []), annotations: { readOnlyHint: true }, _meta: ui })),
  { name: 'describe_document_tool', description: 'Read the original Studio inputSchema before adding an operation to edit_world. The transformer supplies projectId, sceneId and expectedRevision for each operation.', inputSchema: schema({ tool: { type: 'string', enum: names } }, ['tool']), annotations: { readOnlyHint: true } },
  { name: 'create_world', description: 'Create a new project even when activeProjectId is null or no project is open. No manual project creation, selection, or name is required; omitted name defaults to a new world. The app opens and saves this world as active. Continue with edit_world({operations}) without resending bundle.', inputSchema: schema({ name: { type: 'string', minLength: 1, maxLength: 80 } }), annotations: { readOnlyHint: false }, _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'edit_world', description: 'Edit the active Studio project with operations only. The connected app supplies latest local state. Optional bundle/revision remain supported. Optional projectId guards the target, expectedRevision guards conflicting edits. One batch advances revision once. Use ref on creation and $ref in later arguments. Up to 200 original document operations in order. Each operation has tool and arguments; projectId, sceneId and expectedRevision are supplied automatically. On error no partial result is applied. Returns the complete next bundle for subsequent edits and app display. No source asset bytes, filesystem, script execution or publication.', inputSchema: schema({ bundle: { type: 'object' }, revision: { type: 'integer', minimum: 0 }, projectId: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 }, operations: { type: 'array', minItems: 1, maxItems: 200, items: schema({ tool: { type: 'string', enum: names }, arguments: { type: 'object' }, ref: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,63}$' } }, ['tool', 'arguments']) } }, ['operations']), annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'retry_world', description: 'Re-deliver a previously generated result without re-running edits or changing its revision. Pass operationId only to recover the original saved result from the app. Complete legacy result fields are also accepted. Opens the Studio app; still requires its matching verification receipt and PNG. No server storage.', inputSchema: schema({ bundle: { type: 'object' }, revision: { type: 'integer', minimum: 0 }, baseHash: { type: ['string', 'null'] }, operationId: { type: 'string', pattern: '^[A-Za-z0-9-]{1,120}$' } }, ['operationId']), annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: UI_URI } } },
].map(tool => ({ ...tool, description: tool.description + (['create_world', 'edit_world', 'retry_world'].includes(tool.name) ? ' ' + deliveryDescription : tool.name === 'capture_scene_view' ? ' This request remains incomplete until a matching sceneCapture.operationId with status verified AND a Scene View PNG arrives. Failure or no app means no capture was confirmed.' : ''), annotations: { ...tool.annotations, readOnlyHint: !['open_studio', 'create_world', 'edit_world', 'retry_world'].includes(tool.name), destructiveHint: false, openWorldHint: false }, securitySchemes: [{ type: 'noauth' }] }));
export async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  if (name === 'open_studio') {
    if (args.mode !== undefined && args.mode !== 'new' && args.mode !== 'resume') throw new Error('起動方法が不正です');
    if (args.mode === 'new' && args.projectId !== undefined) throw new Error('新規作成と既存作品の指定を同時に使えません');
    if (args.projectId !== undefined) return { studioCommand: { name: 'open_project', projectId: validateStudioProjectId(string(args.projectId)), requestId: crypto.randomUUID() }, delivery: { status: 'awaiting_studio_verification' } };
    if (args.mode === 'new') return callTool('create_world', { name: args.name });
    return { localProjects: true, launch: args.mode === 'resume' ? 'resume' : 'new', delivery: { status: 'studio_connection_unverified' } };
  }
  if (name === 'capture_scene_view') return { captureSceneView: true, operationId: crypto.randomUUID(), delivery: { status: 'awaiting_studio_verification' } };
  if (name === 'get_editor_context' || name === 'get_operation_status') return { studioCommand: { name, ...args, requestId: crypto.randomUUID() }, delivery: { status: 'awaiting_studio_verification' } };
  if ((name === 'edit_world' || name === 'retry_world') && !args.bundle) {
    if (name === 'edit_world' && (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 200)) throw new Error('編集操作は1〜200個で指定してください');
    if (name === 'retry_world') string(args.operationId);
    return { studioCommand: { name, ...args, operationId: name === 'retry_world' ? args.operationId : crypto.randomUUID() }, delivery: { status: 'awaiting_studio_verification' } };
  }
  if (name === 'describe_document_tool') {
    const definition = documentTools.find(tool => tool.name === args.tool);
    if (!definition) throw new Error('Unknown document tool');
    return { definition };
  }
  if (name === 'create_world') {
    const name = args.name === undefined ? '新しいワールド' : string(args.name).trim();
    if (name.length > 80) throw new Error('名前は80文字までです');
    return delivery(createPrototypeProject('world', name), 0, null);
  }
  if (name === 'retry_world') {
    const id = string(args.operationId);
    if (!/^[A-Za-z0-9-]{1,120}$/.test(id) || !Number.isSafeInteger(args.revision) || (args.revision as number) < 0 || !(args.baseHash === null || typeof args.baseHash === 'string')) throw new Error('再送する結果が不正です');
    return delivery(validateBundle(args.bundle), args.revision as number, args.baseHash as string | null, id);
  }
  if (name !== 'edit_world') throw new Error('Unknown tool');
  let bundle = validateBundle(args.bundle);
  const baseHash = await bundleHash(bundle);
  if (!Number.isSafeInteger(args.revision) || (args.revision as number) < 0) throw new Error('revisionが不正です');
  let revision = args.revision as number;
  if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 200) throw new Error('編集操作は1〜200個で指定してください');
  const initialRevision = revision;
  const refs: Record<string, string> = {};
  const resolveRefs = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('$')) { const id = refs[value.slice(1)]; if (!id) throw new Error('未定義の操作参照です: ' + value); return id; }
    if (Array.isArray(value)) return value.map(resolveRefs);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(item)]));
    return value;
  };
  const results: unknown[] = [];
  for (const raw of args.operations) {
    const operation = object(raw); const tool = string(operation.tool);
    if (!names.includes(tool)) throw new Error('この接続では使えない操作です');
    const outcome = executeXriftMcpEditorTool({ bundle, sceneSelection: null, assetSelection: null, editorMode: 'edit', importBusy: false, revision, saveStatus: 'saved' }, { id: crypto.randomUUID(), tool: tool as XriftMcpEditorToolName, arguments: { ...object(resolveRefs(operation.arguments)), projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: revision } });
    if (outcome.changed) { bundle = validateBundle(outcome.bundle); revision++; }
    if (operation.ref !== undefined) {
      const ref = string(operation.ref);
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(ref) || refs[ref]) throw new Error('操作参照が不正または重複しています');
      const result = object(outcome.result); const id = result.entityId ?? result.assetId ?? result.id;
      if (typeof id !== 'string') throw new Error('この操作は参照可能なIDを返しません'); refs[ref] = id;
    }
    results.push(outcome.result);
  }
  return { ...await delivery(bundle, initialRevision + (revision > initialRevision ? 1 : 0), baseHash, typeof args.operationId === 'string' ? args.operationId : undefined), results, refs };
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
      case 'initialize': return ok({ protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'XRift Studio', title: 'XRift Studio', version: '0.1.2', icons }, instructions: deliveryDescription + ' Stateless Studio document transformer: no accounts, database, saved worlds or publication. A null activeProjectId means no existing edit target, not inability to create. When asked for a new world, call create_world immediately; do not ask the user to open or create a project manually. Opening the plugin starts a new project directly; mode resume or projectId reopens existing work. Call create_world, await its matching receipt and PNG, then edit_world with operations only to edit the active project. Use get_editor_context for actual context, retry_world({operationId}) for recovery, and get_operation_status for its receipt. Read describe_document_tool before using a document operation. Batch operations to build the requested world. Never invent source files. Results open in the app and can be exported locally. When visual confirmation matters, call capture_scene_view after the result is open; the app will capture the rendered Scene View and send the PNG into the conversation. For an existing imported world, ask the user to share its editing context from the app. Documents are sent through ChatGPT and processed transiently by this endpoint. No background job continues after the tool call. Rendering and Play require the app.' });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools });
      case 'resources/list': return ok({ resources: [{ uri: NEW_UI_URI, name: 'XRift Studio 新規起動', mimeType: 'text/html;profile=mcp-app' }, { uri: UI_URI, name: 'XRift Studio', mimeType: 'text/html;profile=mcp-app' }] });
      case 'resources/read': {
        if (params.uri !== UI_URI && params.uri !== NEW_UI_URI && !LEGACY_UI_URIS.includes(String(params.uri))) throw new Error('Unknown resource');
        const asset = await env.ASSETS.fetch(new Request(new URL('/chatgpt.html', request.url)));
        if (!asset.ok) throw new Error('ChatGPT App assets are not deployed');
        const html = (await asset.text()).replace('<html', params.uri === NEW_UI_URI ? '<html data-studio-new-entry="true"' : '<html');
        return ok({ contents: [{ uri: String(params.uri), mimeType: 'text/html;profile=mcp-app', text: html.replace('<head>', `<head><base href="${new URL(request.url).origin}/">`).replace(/(src|href)="\.\//g, `$1="${new URL(request.url).origin}/`), _meta: { 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'inline' }, ui: { csp: { resourceDomains: [new URL(request.url).origin], connectDomains: [new URL(request.url).origin] } } } }] });
      }
      case 'tools/call': {
        const name = string(params.name); if (!tools.some((tool) => tool.name === name)) throw new Error('Unknown tool');
        try {
          const result = await callTool(name, params.arguments === undefined ? {} : object(params.arguments));
          const text = name === 'capture_scene_view'
            ? 'XRift Studioに現在のScene Viewのキャプチャを依頼しました。アプリから届く画像を確認してから必要な編集を続けてください。'
            : 'データを返しました。Studioへの反映・保存・描画は未確認です。該当するoperationIdの反映報告とScene View画像が届くまで完了扱いにしないでください。画面が開いていない、接続が切れている、報告がない場合は未完了と伝えてください。';
          return ok({ content: [{ type: 'text', text, annotations: { audience: ['assistant'] } }], structuredContent: result });
        } catch (error) { return ok({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Studio operation failed' }] }); }
      }
      default: return response({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
  } catch (error) { return response({ jsonrpc: '2.0', id, error: { code: -32602, message: error instanceof Error ? error.message : 'Invalid request' } }); }
}

export default { fetch(request: Request, env: Environment) {
  const url = new URL(request.url);
  if (url.pathname === '/new' || url.pathname === '/new/') {
    url.pathname = '/editor.html'; url.searchParams.set('new', '1');
    return Response.redirect(url.href, 307);
  }
  return url.pathname === '/mcp' ? handleMcp(request, env) : env.ASSETS.fetch(request);
} };
