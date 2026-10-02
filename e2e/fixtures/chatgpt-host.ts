import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { callTool } from '../../packages/xrift-studio-cloud/worker';
import type { StudioResult } from '../../src/lib/visual-editor/chatgpt-delivery';
const frame = document.querySelector('iframe')!;
let host: AppBridge;
let result: StudioResult | undefined;
let latestOperationId: string | undefined;
const receipts: unknown[] = [];
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
  host.onupdatemodelcontext = async ({structuredContent}) => { if (structuredContent?.bundle) result = structuredContent as unknown as StudioResult; return {}; };
  host.oninitialized = () => { document.querySelector('#connection')!.textContent = '接続済み'; void (async () => { await host.sendToolInput({ arguments: {} }); if(new URLSearchParams(location.search).has('auto-new')) await host.sendToolResult({content:[],structuredContent:await callTool('open_studio',{})}); })(); };
  await host.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
  frame.src = new URLSearchParams(location.search).has('anonymous-entry') ? '/e2e/fixtures/chatgpt-entry.html' : new URLSearchParams(location.search).has('build') ? '/dist/client/chatgpt.html' : '/chatgpt.html';
}
async function send() {
  if (!result) return;
  await host.sendToolResult({ content: [{ type: 'text', text: 'データ作成済み・Studio反映は未確認' }], structuredContent: result });
}
document.querySelector('#create')!.addEventListener('click', async () => { result = await callTool('create_world', { name: '反映確認・検証専用' }) as StudioResult; await send(); });
document.querySelector('#edit')!.addEventListener('click', async () => {
  if (!result) throw new Error('先に検証ワールドを作成するか、Editorの現在のデータを受信してください');
  // Exercise the same stateless conversation contract as the real plugin.
  const cube = Object.values(result.bundle.scene.entities).find(entity => entity.name === '立方体');
  result = await callTool('edit_world', { bundle: result.bundle, revision: result.revision, operations: [
    ...(cube ? [{ tool: 'update_transform', arguments: { entityId: cube.id, position: [2, 1, 0] } }] : []),
    { tool: 'create_primitive', ref: 'trunk', arguments: { shape: 'cylinder', position: [-2, 1, 0] } },
    { tool: 'update_transform', arguments: { entityId: '$trunk', scale: [0.3, 2, 0.3] } },
  ] }) as StudioResult;
  await send();
});
document.querySelector('#retry')!.addEventListener('click', async () => { if (latestOperationId) await host.sendToolResult({ content: [], structuredContent: await callTool('retry_world', { operationId: latestOperationId }) }); });
document.querySelector('#reload')!.addEventListener('click', () => { void connect(); });
void connect();

document.querySelector('#open-target')!.addEventListener('click', async () => { if (result) await host.sendToolResult({ content: [], structuredContent: await callTool('open_studio', { projectId: result.bundle.project.projectId }) }); });
document.querySelector('#missing-target')!.addEventListener('click', async () => { await host.sendToolResult({ content: [], structuredContent: await callTool('open_studio', { projectId: 'project-missing-routing-test' }) }); });
document.querySelector('#deep-target')!.addEventListener('click', () => { if (result) host.setHostContext({ 'openai/deepLink': { url: '/editor/'+result.bundle.project.projectId } } as Parameters<typeof host.setHostContext>[0]); });
