import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { callTool } from '../../packages/xrift-studio-cloud/worker';
import type { StudioResult } from '../../src/lib/visual-editor/chatgpt-delivery';
import { bundleHash } from '../../src/lib/visual-editor/chatgpt-project';
import type { SnapshotStudioResult } from '../../src/lib/visual-editor/chatgpt-snapshot';
const frame = document.querySelector('iframe')!;
let host: AppBridge;
let result: SnapshotStudioResult | undefined;
let latestOperationId: string | undefined;
const receipts: unknown[] = [];
const snapshots = new Map<string, SnapshotStudioResult>();
const contexts: unknown[] = [];
const uploads: unknown[] = [];
Object.assign(window, { studioTestEvidence: { contexts, uploads } });
async function snapshot(value: StudioResult): Promise<SnapshotStudioResult> {
  const saved = { ...value, snapshotId: `snapshot-${crypto.randomUUID()}`, projectId: value.bundle.project.projectId,
    expiresAt: Date.now() + 86400000, delivery: { hash: await bundleHash(value.bundle) } };
  snapshots.set(saved.snapshotId, saved);
  return saved;
}
function envelope(value: SnapshotStudioResult) {
  const { bundle, ...summary } = value;
  return { content: [{ type: 'text' as const, text: '一時保存済み・Studio反映は未確認' }], structuredContent: summary, _meta: { xriftStudio: { ...summary, bundle } } };
}
async function connect() {
  if (host) await host.close();
  host = new AppBridge(null, { name: '検証専用ホスト', version: '1' }, { message: { text: {}, image: {} }, updateModelContext: { text: {}, structuredContent: {} } }, { hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], ...(new URLSearchParams(location.search).has('standalone-new') ? {toolInfo:{tool:{name:'open_studio',inputSchema:{type:'object',properties:{}}}}}:{}), ...(new URLSearchParams(location.search).has('default-link') ? { 'openai/deepLink': {url:'/'} } : {}), ...(new URLSearchParams(location.search).has('deep-new') ? { 'openai/deepLink': {url:'/new?name=ChatGPT新規起動・検証専用'} } : {}) } });
  host.onrequestdisplaymode = async ({ mode }) => { host.setHostContext({ displayMode: mode }); document.querySelector('#connection')!.textContent = `接続済み / ${mode}`; return { mode }; };
  host.onmessage = async ({ content }) => {
    const text = content.find(item => item.type === 'text');
    const data = text?.type === 'text' ? JSON.parse(text.text) : {};
    if (data.studioDelivery?.operationId) latestOperationId = data.studioDelivery.operationId;
    receipts.push({ ...data.studioDelivery, ...data.studioCommand, ...data.studioContext, ...data.sceneCapture, hasScenePng: content.some(item => item.type === 'image' && item.mimeType === 'image/png' && item.data.length > 100), rejected: (document.querySelector('#reject') as HTMLInputElement).checked });
    document.querySelector('#receipts')!.textContent = JSON.stringify(receipts, null, 2);
    return (document.querySelector('#reject') as HTMLInputElement).checked ? { isError: true } : {};
  };
  host.onupdatemodelcontext = async ({structuredContent}) => {
    if (structuredContent && 'bundle' in structuredContent) throw new Error('The app must not send document JSON in model context');
    contexts.push(structuredContent);
    if (typeof structuredContent?.snapshotId === 'string') result = snapshots.get(structuredContent.snapshotId) ?? result;
    return {};
  };
  // This isolated host emulates metadata transport. Real persistence/authentication
  // is exercised separately by snapshot-mcp and snapshot-store integration tests.
  host.oncalltool = async ({name, arguments: args = {}}) => {
    if (name !== 'store_editor_snapshot') throw new Error(`Unexpected app tool: ${name}`);
    uploads.push(args);
    const previous = typeof args.previousSnapshotId === 'string' ? snapshots.get(args.previousSnapshotId) : undefined;
    if (args.previousSnapshotId && !previous) return { isError: true, content: [{ type: 'text', text: 'snapshot_not_found' }] };
    const stored = await callTool('open_studio', { bundle: args.bundle, revision: previous ? previous.revision + 1 : 0,
      operationId: args.operationId, baseHash: previous?.delivery?.hash ?? null }) as StudioResult;
    result = await snapshot(stored);
    return envelope(result);
  };
  host.oninitialized = () => { document.querySelector('#connection')!.textContent = '接続済み'; void (async () => { await host.sendToolInput({ arguments: {} }); if(new URLSearchParams(location.search).has('auto-new')) await host.sendToolResult({content:[],structuredContent:await callTool('open_studio',{})}); })(); };
  await host.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
  frame.src = new URLSearchParams(location.search).has('anonymous-entry') ? '/e2e/fixtures/chatgpt-entry.html' : new URLSearchParams(location.search).has('build') ? '/dist/client/chatgpt.html' : '/chatgpt.html';
}
async function send() {
  if (!result) return;
  await host.sendToolResult(envelope(result));
}
document.querySelector('#create')!.addEventListener('click', async () => { result = await snapshot(await callTool('create_world', { name: '反映確認・検証専用' }) as StudioResult); await send(); });
document.querySelector('#edit')!.addEventListener('click', async () => {
  if (!result) throw new Error('先に検証ワールドを作成するか、Editorの現在のデータを受信してください');
  // Produce documents in the isolated host, then deliver them exclusively in app metadata.
  const cube = Object.values(result.bundle.scene.entities).find(entity => entity.name === '立方体');
  result = await snapshot(await callTool('edit_world', { bundle: result.bundle, revision: result.revision, operations: [
    ...(cube ? [{ tool: 'update_transform', arguments: { entityId: cube.id, position: [2, 1, 0] } }] : []),
    { tool: 'create_primitive', ref: 'trunk', arguments: { shape: 'cylinder', position: [-2, 1, 0] } },
    { tool: 'update_transform', arguments: { entityId: '$trunk', scale: [0.3, 2, 0.3] } },
  ] }) as StudioResult);
  await send();
});
document.querySelector('#retry')!.addEventListener('click', async () => { if (latestOperationId) {
  const saved = [...snapshots.values()].find(item => item.operationId === latestOperationId);
  if (saved) await host.sendToolResult(envelope(saved));
  else await host.sendToolResult({ content: [], structuredContent: await callTool('retry_world', { operationId: latestOperationId }) });
} });
document.querySelector('#reload')!.addEventListener('click', () => { void connect(); });
void connect();

document.querySelector('#open-target')!.addEventListener('click', async () => { if (result) await host.sendToolResult({ content: [], structuredContent: await callTool('open_studio', { projectId: result.bundle.project.projectId }) }); });
document.querySelector('#missing-target')!.addEventListener('click', async () => { await host.sendToolResult({ content: [], structuredContent: await callTool('open_studio', { projectId: 'project-missing-routing-test' }) }); });
document.querySelector('#deep-target')!.addEventListener('click', () => { if (result) host.setHostContext({ 'openai/deepLink': { url: '/editor/'+result.bundle.project.projectId } } as Parameters<typeof host.setHostContext>[0]); });
