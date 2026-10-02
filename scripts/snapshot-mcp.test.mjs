// Regression: the former snapshot API is replaced by stateless Editor commands.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
after(()=>server.close());
const {default:worker} = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');
const {createStudioCommand,parseStudioCommand} = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-command.ts');
const env={get DB(){throw new Error('Stateless commands must never access DB');},ASSETS:{fetch(){throw new Error('No assets');}}};
async function rpc(name,args={},owner='isolated-owner') {
 const response=await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',headers:owner?{'oai-authenticated-user-id':owner}:{},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);
 return {status:response.status,...await response.json()};
}
function command(result) {
 assert.equal(result.status,200);assert.notEqual(result.result?.isError,true,JSON.stringify(result));
 assert.equal(result.result.structuredContent.delivery.serverSaved,false);
 assert.equal(result.result.structuredContent.delivery.documentEdited,false);
 assert.equal(result.result.structuredContent.delivery.browserSaved,false);
 assert.equal(result.result.structuredContent.delivery.rendered,false);
 assert.equal(result.result.structuredContent.delivery.status,'awaiting_editor_execution');
 assert.equal(result.result.structuredContent.bundle,undefined);
 assert.equal(result.result.structuredContent.snapshotId,undefined);
 assert.equal(result.result._meta?.xriftStudio,undefined);
 return result.result._meta.xriftCommand;
}
test('MCP only dispatches commands and never reads or writes a project database',async()=>{
 const created=command(await rpc('create_world',{name:'local-only',operationId:'create-local'}));
 assert.equal(created.projectId,'project-mcp-create-local');
 assert.equal(created.arguments.name,'local-only');
 assert.ok(JSON.stringify(created).length<1000);
 const edited=command(await rpc('edit_world',{projectId:created.projectId,expectedRevision:0,operationId:'edit-local',operations:[{tool:'create_primitive',arguments:{shape:'box'}}]}));
 assert.equal(edited.projectId,created.projectId);assert.equal(edited.expectedRevision,0);
 for(const name of ['show_world','capture_scene_view']) assert.equal(command(await rpc(name,{projectId:created.projectId})).projectId,created.projectId);
 const retry=command(await rpc('retry_world',{projectId:created.projectId,operationId:edited.operationId}));assert.equal(retry.operationId,edited.operationId);
 command(await rpc('get_editor_context'));
 command(await rpc('get_operation_status',{operationId:edited.operationId}));
});
test('same create request has a stable local target and identical command digest',async()=>{
 const a=command(await rpc('create_world',{name:'one',operationId:'stable-create'}));
 const b=command(await rpc('create_world',{operationId:'stable-create',name:'one'}));
 assert.deepEqual(a,b);
 const c=command(await rpc('create_world',{operationId:'stable-create',name:'changed'}));
 assert.equal(c.projectId,a.projectId);assert.notEqual(c.inputHash,a.inputHash);
 assert.deepEqual(await parseStudioCommand(a),a);
 await assert.rejects(parseStudioCommand({...a,projectId:'other'}),/一致/);
 await assert.rejects(parseStudioCommand({...a,arguments:{name:'changed',operationId:'stable-create'}}),/一致/);
});
test('legacy snapshots and document uploads are not part of the HTTP tool API',async()=>{
 const missing=await rpc('store_editor_snapshot',{bundle:{},operationId:'old-upload'});assert.equal(missing.error.message,'Unknown tool');
 for(const name of ['show_world','capture_scene_view','retry_world']) {
  const old=await rpc(name,{snapshotId:'snapshot-old'});assert.equal(old.result.isError,true);assert.equal(old.result._meta,undefined);
 }
 const full=await rpc('edit_world',{bundle:{},revision:0,operations:[]});assert.equal(full.result.isError,true);
});
test('Sites identity and command-target guards remain in place',async()=>{
 for(const name of ['create_world','edit_world','show_world','retry_world','capture_scene_view','get_editor_context','get_operation_status','open_studio']) assert.equal((await rpc(name,{},null)).status,401,name);
 for(const args of [{}, {projectId:'../private'}, {projectId:7}]) assert.equal((await rpc('show_world',args)).result.isError,true);
 const noRevision=await rpc('edit_world',{projectId:'project-test',operationId:'edit',operations:[{tool:'create_primitive',arguments:{shape:'box'}}]});assert.equal(noRevision.result.isError,true);
});
test('callers cannot override command names or inject extra control fields',async()=>{
 for(const name of ['get_editor_context','get_operation_status']) {
  const result=await rpc(name,{name:'edit_world',operationId:'hijack',operations:[]});assert.equal(result.result.isError,true);assert.equal(result.result._meta,undefined);
 }
 for(const operations of [[{tool:'not_a_tool',arguments:{}}],[{tool:'create_primitive',arguments:{shape:'box'},name:'delete_entity'}],Array(201).fill({tool:'create_primitive',arguments:{shape:'box'}})]) {
  const result=await rpc('edit_world',{projectId:'project-test',expectedRevision:0,operationId:'edit',operations});assert.equal(result.result.isError,true);
 }
 await assert.rejects(createStudioCommand('edit_world',{projectId:'project-test',expectedRevision:0,operationId:'bytes',operations:[{tool:'create_primitive',arguments:{shape:'box',image:'data:image/png;base64,xyz'}}]}),/バイト/);
});
test('global new mode dispatches local creation instead of generating a server document',async()=>{
 const result=await rpc('open_studio',{mode:'new',name:'local-entry'});
 const value=command(result);assert.equal(value.name,'create_world');assert.equal(value.arguments.name,'local-entry');
});

test('editing metadata discloses possible overwrites/deletions in the local Editor',async()=>{
 const response=await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env);
 const tools=(await response.json()).result.tools;
 assert.equal(tools.find(tool=>tool.name==='edit_world').annotations.destructiveHint,true);
 assert.equal(tools.find(tool=>tool.name==='create_world').annotations.destructiveHint,false);
});
