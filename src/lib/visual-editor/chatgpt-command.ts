/** Stateless MCP commands. Project documents and execution receipts stay in the Editor. */
import documentTools from '../../../packages/xrift-studio-cloud/document-tools.json';
import { validateStudioProjectId } from '../browser-project-routing';
export type StudioCommand = {
  protocol: 'xrift-command-v1'; name: string; operationId: string; inputHash: string;
  projectId?: string; expectedRevision?: number; arguments: Record<string, unknown>;
};
const idSchema = { type: 'string', pattern: '^[A-Za-z0-9-]{1,120}$' };
const projectSchema = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$' };
const revisionSchema = { type: 'integer', minimum: 0 };
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
const operationSchema = { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', properties: {
  tool: { type: 'string', enum: documentTools.map(tool => tool.name) },
  arguments: { type: 'object', description: 'Exact arguments from describe_document_tool. Use ref/$ref for newly created objects.' },
  ref: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,63}$' },
}, required: ['tool', 'arguments'], additionalProperties: false } };
export const studioCommandSchemas: Record<string, ReturnType<typeof schema>> = {
  create_world: schema({ name: { type: 'string', minLength: 1, maxLength: 80 }, operationId: idSchema }, ['operationId']),
  edit_world: schema({ projectId: projectSchema, expectedRevision: revisionSchema, operationId: idSchema, operations: operationSchema }, ['projectId', 'expectedRevision', 'operationId', 'operations']),
  show_world: schema({ projectId: projectSchema }, ['projectId']),
  capture_scene_view: schema({ projectId: projectSchema }, ['projectId']),
  retry_world: schema({ projectId: projectSchema, operationId: idSchema }, ['projectId', 'operationId']),
  get_editor_context: schema({}, []),
  get_operation_status: schema({ operationId: idSchema }, ['operationId']),
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('操作の引数はオブジェクトで指定してください');
  return value as Record<string, unknown>;
}
function id(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,120}$/.test(value)) throw new Error('操作IDが不正です');
  return value;
}
function bounded(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 1024 * 1024) throw new Error('操作の引数は1 MBまでです');
}
function rejectBinary(value: unknown): void {
  if (typeof value === 'string' && /^data:/i.test(value)) throw new Error('素材のバイト列はMCPへ送らず、Assetsから取り込んでください');
  if (Array.isArray(value)) value.forEach(rejectBinary);
  else if (value && typeof value === 'object') Object.values(value).forEach(rejectBinary);
}
export function validateStudioCommandArguments(name: string, value: unknown): Record<string, unknown> {
  const args = record(value); bounded(args); rejectBinary(args);
  const expected = studioCommandSchemas[name];
  if (!expected) throw new Error('未対応のStudio操作です');
  if (Object.keys(args).some(key => !Object.prototype.hasOwnProperty.call(expected.properties, key))) throw new Error('未対応の引数が含まれています');
  if (expected.required.some(key => !Object.prototype.hasOwnProperty.call(args, key))) throw new Error('editor_context_required: 必須の引数がありません。Editorの実際の報告から対象とrevisionを確認してください');
  if (args.operationId !== undefined) id(args.operationId);
  if (args.projectId !== undefined) { if (typeof args.projectId !== 'string') throw new Error('作品IDが不正です'); validateStudioProjectId(args.projectId); }
  if (args.expectedRevision !== undefined && (!Number.isSafeInteger(args.expectedRevision) || Number(args.expectedRevision) < 0)) throw new Error('revisionが不正です');
  if (args.name !== undefined && (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 80)) throw new Error('名前は1〜80文字で指定してください');
  if (name === 'edit_world') {
    if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 200) throw new Error('編集操作は1〜200個で指定してください');
    const refs = new Set<string>();
    for (const raw of args.operations) {
      const operation = record(raw);
      if (Object.keys(operation).some(key => !['tool','arguments','ref'].includes(key))) throw new Error('編集操作に未対応の引数があります');
      if (!documentTools.some(tool => tool.name === operation.tool)) throw new Error('この接続では使えない操作です');
      record(operation.arguments);
      if (operation.ref !== undefined) {
        if (typeof operation.ref !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(operation.ref) || refs.has(operation.ref)) throw new Error('操作参照が不正または重複しています');
        refs.add(operation.ref);
      }
    }
  }
  return structuredClone(args);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export async function studioCommandHash(name: string, args: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical({ name, args })));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
}
export async function createStudioCommand(name: string, value: unknown): Promise<StudioCommand> {
  const args = validateStudioCommandArguments(name, value);
  const operationId = args.operationId === undefined ? crypto.randomUUID() : id(args.operationId);
  return { protocol: 'xrift-command-v1', name, operationId, inputHash: await studioCommandHash(name,args), arguments: args,
    ...(name === 'create_world' ? { projectId: `project-mcp-${operationId}` } : args.projectId ? { projectId: String(args.projectId) } : {}),
    ...(args.expectedRevision !== undefined ? { expectedRevision: Number(args.expectedRevision) } : {}) };
}
export async function parseStudioCommand(value: unknown): Promise<StudioCommand> {
  const raw = record(value);
  if (raw.protocol !== 'xrift-command-v1' || typeof raw.name !== 'string') throw new Error('Studio操作の形式が不正です');
  const command = await createStudioCommand(raw.name, raw.arguments);
  if (raw.inputHash !== command.inputHash || raw.projectId !== command.projectId || raw.expectedRevision !== command.expectedRevision) throw new Error('Studio操作と対象情報が一致しません');
  if (command.arguments.operationId !== undefined && raw.operationId !== command.operationId) throw new Error('Studioの操作IDが一致しません');
  return { ...command, operationId: id(raw.operationId) };
}
export function studioCommandEnvelope(command: StudioCommand) {
  return { command: { name: command.name, operationId: command.operationId, projectId: command.projectId, inputHash: command.inputHash },
    delivery: { status: 'awaiting_editor_execution', documentEdited: false, serverSaved: false, browserSaved: false, rendered: false, captureStatus: 'not_requested' } };
}
