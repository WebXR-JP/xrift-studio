import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import worker, { callTool } from '../../packages/xrift-studio-cloud/worker';
const frame = document.querySelector('iframe')!;
let host: AppBridge;
let currentContext: Record<string,unknown> = {};
let latestOperationId: string | undefined;
let lastEdit: { name:string; arguments:Record<string,unknown> } | undefined;
const receipts: Array<Record<string,unknown>> = [];
const contexts: Array<Record<string,unknown>> = [];
const uploads: unknown[] = [];
const toolCalls: Array<Record<string,unknown>> = [];
Object.assign(window,{studioTestEvidence:{contexts,uploads,toolCalls}});
async function envelope(name:string,args:Record<string,unknown>) {
  const response = await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'isolated-browser-test'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{get DB(){throw new Error('MCP must not access project storage');},ASSETS:{fetch:async()=>new Response('No assets',{status:404})}});
  const body = await response.json() as {result:Parameters<AppBridge['sendToolResult']>[0]};
  return body.result;
}
async function send(name:string,args:Record<string,unknown>) { await host.sendToolResult(await envelope(name,args)); }
async function connect() {
  if(host) await host.close();
  host = new AppBridge(null,{name:'検証専用ホスト',version:'2'},{serverTools:{},message:{text:{},image:{}},updateModelContext:{text:{},structuredContent:{}}},{hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline','fullscreen'],...(new URLSearchParams(location.search).has('standalone-new')?{toolInfo:{tool:{name:'open_studio',inputSchema:{type:'object',properties:{}}}}}:{}),...(new URLSearchParams(location.search).has('default-link')?{'openai/deepLink':{url:'/'}}:{}),...(new URLSearchParams(location.search).has('deep-new')?{'openai/deepLink':{url:'/new?name=ChatGPT新規起動・検証専用'}}:{})}});
  host.onrequestdisplaymode = async ({mode})=>{host.setHostContext({displayMode:mode});return {mode};};
  host.onmessage=async({content})=>{
    const text=content.find(item=>item.type==='text');const data=text?.type==='text'?JSON.parse(text.text):{};
    if(data.studioDelivery?.operationId) latestOperationId=data.studioDelivery.operationId;
    receipts.push({...data.studioDelivery,...data.studioCommand,...data.studioContext,...data.sceneCapture,hasScenePng:content.some(item=>item.type==='image'&&item.mimeType==='image/png'&&item.data.length>100)});
    document.querySelector('#receipts')!.textContent=JSON.stringify(receipts,null,2);
    return (document.querySelector('#reject') as HTMLInputElement).checked?{isError:true}:{};
  };
  host.onupdatemodelcontext=async({structuredContent})=>{
    if(structuredContent&&('bundle' in structuredContent||'snapshotId' in structuredContent)) throw new Error('Documents/snapshots must not enter model context');
    if(structuredContent){currentContext=structuredContent;contexts.push(structuredContent);} return {};
  };
  host.oncalltool=async({name,arguments:args={}})=>{toolCalls.push({name,args});uploads.push(args);throw new Error('The Editor must not upload its documents to MCP');};
  host.oninitialized=()=>{document.querySelector('#connection')!.textContent='接続済み';void(async()=>{await host.sendToolInput({arguments:{}});if(new URLSearchParams(location.search).has('auto-new'))await host.sendToolResult({content:[],structuredContent:await callTool('open_studio',{})});})();};
  await host.connect(new PostMessageTransport(frame.contentWindow!,frame.contentWindow!));
  frame.src=new URLSearchParams(location.search).has('anonymous-entry')?'/e2e/fixtures/chatgpt-entry.html':new URLSearchParams(location.search).has('build')?'/dist/client/chatgpt.html':'/chatgpt.html';
}
document.querySelector('#create')!.addEventListener('click',()=>{void send('create_world',{name:'反映確認・検証専用',operationId:'browser-create-test'});});
document.querySelector('#edit')!.addEventListener('click',()=>{
  if(typeof currentContext.projectId!=='string'||typeof currentContext.revision!=='number')throw new Error('Editor context is unavailable');
  lastEdit={name:'edit_world',arguments:{projectId:currentContext.projectId,expectedRevision:currentContext.revision,operationId:'browser-edit-test',operations:[{tool:'create_primitive',ref:'trunk',arguments:{shape:'cylinder',position:[-2,1,0]}},{tool:'update_transform',arguments:{entityId:'$trunk',scale:[0.3,2,0.3]}}]}};
  void send(lastEdit.name,lastEdit.arguments);
});
document.querySelector('#retry')!.addEventListener('click',()=>{if(latestOperationId&&currentContext.projectId)void send('retry_world',{projectId:currentContext.projectId,operationId:latestOperationId});});
document.querySelector('#duplicate')!.addEventListener('click',()=>{if(lastEdit)void send(lastEdit.name,lastEdit.arguments);});
document.querySelector('#stale')!.addEventListener('click',()=>{if(lastEdit)void send(lastEdit.name,{...lastEdit.arguments,operationId:'stale-edit-test'});});
document.querySelector('#reload')!.addEventListener('click',()=>{void connect();});
document.querySelector('#open-target')!.addEventListener('click',()=>{if(currentContext.projectId)void send('show_world',{projectId:currentContext.projectId});});
document.querySelector('#missing-target')!.addEventListener('click',()=>{void send('show_world',{projectId:'project-missing-routing-test'});});
document.querySelector('#deep-target')!.addEventListener('click',()=>{if(currentContext.projectId)host.setHostContext({'openai/deepLink':{url:'/editor/'+currentContext.projectId}} as Parameters<typeof host.setHostContext>[0]);});
void connect();
