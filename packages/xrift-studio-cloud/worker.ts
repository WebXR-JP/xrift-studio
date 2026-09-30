/** Private cloud adapter. Run behind an authenticated boundary; never expose identity headers directly. */
import { createPrototypeProject, type PrototypeVisualProject } from '../../src/lib/visual-editor/prototype-project';
import { executeXriftMcpEditorTool } from '../../src/lib/visual-editor/mcp-editor-tools';
import { type XriftMcpEditorToolName } from '../../src/lib/visual-editor/mcp-tool-registry';
import { browserProjectDocumentFiles, parseBrowserProjectFiles, readBrowserProjectArchive, createBrowserProjectArchive } from '../../src/lib/visual-editor/browser-project-transfer';
import documentTools from './document-tools.json';
const XRIFT_MCP_EDITOR_TOOLS = documentTools.map((tool) => tool.name);
import type { VisualProjectDocuments } from '../../src/lib/visual-editor/persistence';
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Environment {
  DB: { prepare(sql: string): Statement };
  ASSETS: { fetch(request: Request): Promise<Response> };
  WORLD_FILES: { put(key: string, value: string): Promise<unknown>; get(key: string): Promise<{ text(): Promise<string> } | null> };
  /** Injection is mandatory. Validate OAuth/session at the deployment boundary. */
  authenticate(request: Request): Promise<string | null>;
}
export type WorldState = { documents: VisualProjectDocuments; files: Record<string, string> };
type WorldRow = { id: string; name: string; revision: number; state: string; updated_at: string };
const UI_URI = 'ui://xrift-studio/worlds';
const MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSONオブジェクトで指定してください');
  return value as Record<string, unknown>;
};
const string = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('空でない文字列で指定してください');
  return value;
};
function decode(value: string) {
  if (value.length > MAX_BYTES * 4 / 3 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('ファイルは8 MB以内のbase64で指定してください');
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function encode(bytes: Uint8Array) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
function fileMap(state: WorldState): Map<string, Uint8Array> { return new Map(Object.entries(state.files).map(([name, bytes]) => [name, decode(bytes) as Uint8Array<ArrayBuffer>])); }
export function validateState(value: unknown): WorldState {
  const state = object(value); const files = object(state.files);
  const entries = new Map(Object.entries(files).map(([path, data]) => [path, decode(typeof data === 'string' ? data : (() => { throw new Error('ファイル形式が不正です'); })())]));
  if ([...entries.values()].reduce((size, data) => size + data.byteLength, 0) > MAX_BYTES) throw new Error('展開後のプロジェクトは8 MBまでです');
  const documents = parseBrowserProjectFiles(entries);
  // Documents are reconstructed from validated portable files, never trusted separately.
  return { documents, files: Object.fromEntries([...entries].map(([name, bytes]) => [name, encode(bytes)])) };
}
function pack(state: WorldState) {
  const text = JSON.stringify(state);
  if (encoder.encode(text).byteLength > MAX_BYTES) throw new Error('プロジェクトは保存形式で8 MBまでです。ブラウザ版で編集してください');
  return text;
}
function bundle(state: WorldState): PrototypeVisualProject {
  const d = state.documents;
  return { project: d.project, scene: d.scenes[d.project.entrySceneId], assets: d.assets, prefabs: d.prefabs };
}
function updated(state: WorldState, next: PrototypeVisualProject): WorldState {
  if (next.project.projectId !== state.documents.project.projectId || next.project.projectKind !== state.documents.project.projectKind || next.scene.sceneId !== state.documents.project.entrySceneId) throw new Error('編集対象が一致しません');
  const documents = { ...state.documents, project: next.project, assets: next.assets, prefabs: next.prefabs, scenes: { ...state.documents.scenes, [next.scene.sceneId]: next.scene } };
  const files = fileMap(state);
  for (const [name, bytes] of browserProjectDocumentFiles(documents)) files.set(name, bytes);
  return validateState({ files: Object.fromEntries([...files].map(([name, bytes]) => [name, encode(bytes)])) });
}
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const textField = { type: 'string', minLength: 1 };
const revisionField = { type: 'integer', minimum: 0 };
const ui = { ui: { resourceUri: UI_URI }, 'openai/ui': { entrypoints: [{ type: 'global' }] } };
const tools = [
  { name: 'describe_document_tool', description: 'Read the original Studio description and input schema before edit_world. Native-only tools and helper-dependent schemas are excluded. Use the returned normal inputSchema inside edit_world.arguments.', inputSchema: schema({ tool: { type: 'string', enum: XRIFT_MCP_EDITOR_TOOLS } }, ['tool']), annotations: { readOnlyHint: true } },
  { name: 'list_worlds', title: 'XRift Studio', description: 'List your private cloud worlds. Open the sidebar to create or import a portable Studio project.', inputSchema: schema({}), annotations: { readOnlyHint: true }, icons: [{ src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><path d="m10 2 7 4v8l-7 4-7-4V6Zm0 8 7-4M10 10 3 6m7 4v8"/></svg>'), mimeType: 'image/svg+xml', sizes: ['any'] }], _meta: ui },
  { name: 'create_world', description: 'Create a private world from the same starter used by browser Studio. Read get_world_context before editing. Does not publish.', inputSchema: schema({ name: textField }, ['name']), _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'read_world', description: 'Read the selected cloud project, all scenes and source files. Refresh after a revision conflict; never overwrite newer work.', inputSchema: schema({ id: textField }, ['id']), annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'get_world_context', description: 'Read the editor context and revision before edit_world. Rendering, Play and screenshots require the app view; document edits alone do not verify appearance.', inputSchema: schema({ id: textField }, ['id']), annotations: { readOnlyHint: true } },
  { name: 'edit_world', description: 'Run an existing Studio document tool in the private cloud world. Supply its normal arguments, including projectId, sceneId and expectedRevision on writes. Read available tools in get_world_context, then describe_document_tool before calling each one. No local filesystem, Scripts execution, publication or desktop control.', inputSchema: schema({ id: textField, tool: { type: 'string', enum: [...XRIFT_MCP_EDITOR_TOOLS] }, arguments: { type: 'object' } }, ['id', 'tool', 'arguments']) },
  { name: 'import_project', description: 'Import a .xriftstudio/ZIP exported by Studio as a separate private cloud project, preserving source assets and every scene. Max 8 MB including saved state. Use the app file picker; base64 refers to actual file bytes, not an image description.', inputSchema: schema({ name: textField, base64: textField }, ['name', 'base64']), _meta: { ui: { resourceUri: UI_URI } } },
  { name: 'save_world', description: 'Save the app editor documents with optimistic concurrency. A stale revision rejects the save. Source files and other scenes remain in the cloud project.', inputSchema: schema({ id: textField, expectedRevision: revisionField, bundle: { type: 'object' }, files: { type: 'object', additionalProperties: { type: 'string' } } }, ['id', 'expectedRevision', 'bundle']), _meta: { ui: { visibility: ['app'] } } },
  { name: 'export_project', description: 'Export a portable .xriftstudio file to continue in browser or desktop Studio. This does not publish to XRift.', inputSchema: schema({ id: textField }, ['id']), annotations: { readOnlyHint: true }, _meta: { ui: { visibility: ['app'] } } },
];
async function load(env: Environment, owner: string, id: unknown) {
  const row = await env.DB.prepare('SELECT * FROM worlds WHERE owner_id = ? AND id = ?').bind(owner, string(id)).first<WorldRow>();
  if (!row) throw new Error('プロジェクトが見つかりません');
  const stored = await env.WORLD_FILES.get(row.state);
  if (!stored) throw new Error('保存されたプロジェクトが見つかりません');
  return { row, state: JSON.parse(await stored.text()) as WorldState };
}
async function save(env: Environment, owner: string, row: WorldRow, state: WorldState, revision: unknown) {
  if (!Number.isSafeInteger(revision) || revision !== row.revision) throw new Error('STALE_REVISION: 最新のプロジェクトを読み直してください');
  const key = `${encodeURIComponent(owner)}/${row.id}/${crypto.randomUUID()}`;
  await env.WORLD_FILES.put(key, pack(state));
  const result = await env.DB.prepare('UPDATE worlds SET state = ?, name = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?')
    .bind(key, state.documents.project.metadata.name, new Date().toISOString(), owner, row.id, revision).run();
  if (result.meta.changes !== 1) throw new Error('STALE_REVISION: 別の編集が保存されました');
  return row.revision + 1;
}
async function insert(env: Environment, owner: string, state: WorldState) {
  const id = crypto.randomUUID();
  const key = `${encodeURIComponent(owner)}/${id}/${crypto.randomUUID()}`;
  await env.WORLD_FILES.put(key, pack(state));
  await env.DB.prepare('INSERT INTO worlds (owner_id, id, name, state, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(owner, id, state.documents.project.metadata.name, key, new Date().toISOString()).run();
  return { id, revision: 0, state };
}
export async function callTool(env: Environment, owner: string, name: string, args: Record<string, unknown>) {
  if (name === 'describe_document_tool') {
    const definition = documentTools.find((tool) => tool.name === args.tool);
    if (!definition) throw new Error('Unknown document tool');
    return { definition };
  }
  if (name === 'list_worlds') {
    const rows = await env.DB.prepare('SELECT id, name, revision, updated_at FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC').bind(owner).all<Omit<WorldRow, 'state'>>();
    return { worlds: rows.results };
  }
  if (name === 'create_world') {
    const name = string(args.name).trim(); if (name.length > 80) throw new Error('名前は80文字までです');
    const b = createPrototypeProject('world', name);
    const documents = { project: b.project, assets: b.assets, prefabs: b.prefabs, scenes: { [b.scene.sceneId]: b.scene } };
    return insert(env, owner, { documents, files: Object.fromEntries([...browserProjectDocumentFiles(documents)].map(([name, bytes]) => [name, encode(bytes)])) });
  }
  if (name === 'import_project') {
    const bytes = decode(string(args.base64));
    const imported = await readBrowserProjectArchive(new File([bytes], string(args.name)), MAX_BYTES);
    const state = validateState({ files: Object.fromEntries([...imported.files].map(([name, data]) => [name, encode(data)])) });
    return insert(env, owner, state);
  }
  const { row, state } = await load(env, owner, args.id);
  if (name === 'read_world') return { id: row.id, revision: row.revision, state };
  if (name === 'export_project') {
    const archive = await createBrowserProjectArchive(state.documents, fileMap(state));
    return { fileName: archive.fileName, base64: encode(new Uint8Array(await archive.blob.arrayBuffer())) };
  }
  const context = { bundle: bundle(state), sceneSelection: null, assetSelection: null, editorMode: 'edit' as const, importBusy: false, revision: row.revision, saveStatus: 'saved' as const };
  if (name === 'get_world_context') {
    const result = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool: 'get_editor_context', arguments: {} });
    return { ...result.result, id: row.id, revision: row.revision, availableDocumentTools: XRIFT_MCP_EDITOR_TOOLS, limitations: ['No live viewport or Play on the server', 'Imported Scripts are not executed on the server', 'No XRift publication'] };
  }
  if (name === 'save_world') {
    const next = object(args.bundle) as unknown as PrototypeVisualProject;
    return { id: row.id, revision: await save(env, owner, row, updated(args.files ? validateState({ files: { ...state.files, ...object(args.files) } }) : state, next), args.expectedRevision) };
  }
  if (name === 'edit_world') {
    const tool = string(args.tool);
    if (!(XRIFT_MCP_EDITOR_TOOLS as readonly string[]).includes(tool)) throw new Error('このクラウド接続では使えない操作です');
    const arguments_ = object(args.arguments);
    const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool: tool as XriftMcpEditorToolName, arguments: arguments_ });
    const revision = outcome.changed ? await save(env, owner, row, updated(state, outcome.bundle), arguments_.expectedRevision) : row.revision;
    return { id: row.id, revision, ...outcome.result };
  }
  throw new Error('Unknown tool');
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleMcp(request: Request, env: Environment): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const owner = await env.authenticate(request);
  if (!owner) return response({ error: 'Authentication required' }, 401);
  let size = 0;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES * 2) { await reader.cancel(); return response({ error: 'Request too large' }, 413); }
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
      case 'initialize': return ok({ protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'xrift-studio-cloud', version: '0.1.0' }, instructions: 'Create or import a private Studio world. Use get_world_context before edit_world; writes require current projectId, sceneId and expectedRevision. Open the app to inspect the real browser editor. Server edits are not visual verification. Export to continue in browser or desktop Studio. Do not publish unless explicitly requested; publication is not available on this server.' });
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
          const result = await callTool(env, owner, name, params.arguments === undefined ? {} : object(params.arguments));
          return ok({ content: [{ type: 'text', text: JSON.stringify(result), annotations: { audience: ['assistant'] } }], structuredContent: result });
        } catch (error) { return ok({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Studio operation failed' }] }); }
      }
      default: return response({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
  } catch (error) { return response({ jsonrpc: '2.0', id, error: { code: -32602, message: error instanceof Error ? error.message : 'Invalid request' } }); }
}
