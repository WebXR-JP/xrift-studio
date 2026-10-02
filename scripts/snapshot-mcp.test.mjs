import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSnapshotSqliteDatabase } from './fixtures/snapshot-sqlite.mjs';
const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
after(()=>server.close());
const {default:worker, callTool} = await server.ssrLoadModule('/packages/xrift-studio-cloud/worker.ts');
const {bundleHash} = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-project.ts');
function fixture() {
  const db=createSnapshotSqliteDatabase();
  const env={DB:db.db,ASSETS:{fetch(){throw new Error('No asset access');}}};
  return {...db,env,rpc:async(name,args={},owner='owner-a')=>{
    const response=await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',headers:owner?{'oai-authenticated-user-id':owner}:{},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);
    return {status:response.status,...await response.json()};
  }};
}
const summary=r=>{assert.equal(r.status,200);assert.notEqual(r.result?.isError,true,JSON.stringify(r));assert.ok(r.result?.structuredContent);return r.result.structuredContent;};
const edit=(s,id)=>({snapshotId:s.snapshotId,expectedRevision:s.revision,operationId:id,operations:[{tool:'create_primitive',arguments:{shape:'box'},ref:'box'}]});
test('model transfers short IDs and exact app metadata through create, edit, show and retry',async()=>{
  const f=fixture();try{
    const created=summary(await f.rpc('create_world',{name:'snapshot-isolated',operationId:'create-1'}));
    assert.equal(created.bundle,undefined);assert.equal(created.revision,0);assert.equal(created.delivery.serverSaved,true);
    assert.ok(JSON.stringify(created).length<2000);
    const edited=summary(await f.rpc('edit_world',edit(created,'edit-1')));
    assert.equal(edited.projectId,created.projectId);assert.equal(edited.revision,1);assert.equal(edited.bundle,undefined);
    const shown=await f.rpc('show_world',{snapshotId:edited.snapshotId});summary(shown);
    const app=shown.result._meta.xriftStudio;
    assert.equal(await bundleHash(app.bundle),edited.hash);assert.equal(app.snapshotId,edited.snapshotId);
    assert.equal(app.delivery.serverSaved,true);assert.equal(app.delivery.browserSaved,false);assert.equal(app.delivery.rendered,false);
    assert.equal(app.bundle.scene.entities[edited.refs.box].id,edited.refs.box);
    assert.ok(!JSON.stringify(shown.result.content).includes('bundle'));
    const retried=await f.rpc('retry_world',{snapshotId:edited.snapshotId});
    assert.deepEqual(retried.result._meta.xriftStudio,app);assert.equal(summary(retried).expiresAt,edited.expiresAt);
    const stale=await f.rpc('show_world',{snapshotId:created.snapshotId});assert.equal(stale.result.isError,true);
    const replay=summary(await f.rpc('edit_world',edit(created,'edit-1')));assert.equal(replay.snapshotId,edited.snapshotId);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count,2);
  }finally{f.close();}
});
test('data calls reject no identity, other owners and owner arguments without reading their data',async()=>{
  const f=fixture();try{
    for(const name of ['create_world','edit_world','show_world','retry_world','capture_scene_view','get_editor_context','get_operation_status','open_studio','store_editor_snapshot'])assert.equal((await f.rpc(name,{},null)).status,401,name);
    const a=summary(await f.rpc('create_world',{operationId:'create-a'}));
    for(const name of ['show_world','retry_world','capture_scene_view']){
      const denied=await f.rpc(name,{snapshotId:a.snapshotId},'owner-b');assert.equal(denied.result.isError,true);assert.equal(denied.result._meta,undefined);assert.equal(denied.result.structuredContent.error.code,'snapshot_not_found');assert.deepEqual(Object.keys(denied.result.structuredContent),['error']);
    }
    const deniedEdit=await f.rpc('edit_world',edit(a,'steal'),'owner-b');assert.equal(deniedEdit.result.isError,true);
    const spoof=await f.rpc('create_world',{operationId:'fake',owner:'owner-a'},'owner-b');assert.equal(spoof.result.isError,true);
    assert.equal(summary(await f.rpc('show_world',{snapshotId:a.snapshotId})).snapshotId,a.snapshotId);
  }finally{f.close();}
});
test('failed atomic operations disclose only original reference, not the document or partial changes',async()=>{
  const f=fixture();try{
    const a=summary(await f.rpc('create_world',{operationId:'create-error'}));
    const bad=await f.rpc('edit_world',{snapshotId:a.snapshotId,expectedRevision:0,operationId:'edit-error',operations:[{tool:'create_primitive',arguments:{shape:'box'}},{tool:'update_transform',arguments:{entityId:'$missing'}}]});
    assert.equal(bad.result.isError,true);assert.equal(bad.result.structuredContent.bundle,undefined);assert.equal(bad.result.structuredContent.snapshotId,a.snapshotId);assert.equal(bad.result.structuredContent.failedOperationIndex,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count,1);
    const extra=await f.rpc('edit_world',{...edit(a,'extra'),'bundle':{}});assert.equal(extra.result.isError,true);
    const missing=await f.rpc('show_world',{});assert.equal(missing.result.isError,true);assert.equal(missing.result._meta,undefined);
  }finally{f.close();}
});
test('concurrent RPC edits choose one successor and key reuse cannot change the request',async()=>{
  const f=fixture();try{
    const a=summary(await f.rpc('create_world',{operationId:'create-race'}));
    const attempts=await Promise.all([f.rpc('edit_world',edit(a,'edit-a')),f.rpc('edit_world',edit(a,'edit-b'))]);
    assert.equal(attempts.filter(x=>!x.result.isError).length,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count,2);
    const same=await f.rpc('create_world',{operationId:'create-race',name:'changed'});assert.equal(same.result.isError,true);
  }finally{f.close();}
});
test('explicit local capture stores only validated document JSON and does not silently overwrite a live head',async()=>{
  const f=fixture();try{
    const local=await callTool('create_world',{name:'explicit-local-only'});
    const a=summary(await f.rpc('store_editor_snapshot',{bundle:local.bundle,operationId:'capture-local'}));
    const conflict=await f.rpc('store_editor_snapshot',{bundle:local.bundle,operationId:'capture-new'});assert.equal(conflict.result.isError,true);
    const update=summary(await f.rpc('store_editor_snapshot',{bundle:local.bundle,operationId:'capture-update',previousSnapshotId:a.snapshotId}));assert.equal(update.revision,1);
    const malicious=structuredClone(local.bundle);malicious.project.metadata.name='data:application/octet-stream;base64,AA==';
    const binary=await f.rpc('store_editor_snapshot',{bundle:malicious,operationId:'capture-binary',previousSnapshotId:update.snapshotId});assert.equal(binary.result.isError,true);
    const unavailable=await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'owner-a'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_world',arguments:{operationId:'no-db'}}})}),{ASSETS:f.env.ASSETS});
    assert.equal((await unavailable.json()).result.isError,true);
  }finally{f.close();}
});

test('show, retry, capture, edit and edit-operation replay enforce the exact expiry without renewal', {concurrency:false}, async t=>{
  let clock=1_800_000_000_000;
  t.mock.method(Date,'now',()=>clock);
  const f=fixture();try{
    const created=summary(await f.rpc('create_world',{name:'expiry-isolated',operationId:'expiry-create'}));
    const args=edit(created,'expiry-edit');
    const edited=summary(await f.rpc('edit_world',args));
    assert.equal(edited.expiresAt,created.expiresAt);
    const before=f.sqlite.prepare('SELECT snapshot_id, created_at, expires_at FROM studio_snapshots ORDER BY snapshot_id').all().map(row=>({...row}));
    clock=edited.expiresAt-1;
    for(const name of ['show_world','retry_world','capture_scene_view']){
      const response=await f.rpc(name,{snapshotId:edited.snapshotId});
      assert.equal(summary(response).expiresAt,edited.expiresAt,name);
      assert.equal(response.result._meta.xriftStudio.expiresAt,edited.expiresAt,name);
    }
    const replay=summary(await f.rpc('edit_world',args));
    assert.equal(replay.snapshotId,edited.snapshotId);
    assert.equal(replay.expiresAt,edited.expiresAt);
    assert.deepEqual(f.sqlite.prepare('SELECT snapshot_id, created_at, expires_at FROM studio_snapshots ORDER BY snapshot_id').all().map(row=>({...row})),before);
    clock=edited.expiresAt;
    for(const [name,input] of [
      ['show_world',{snapshotId:edited.snapshotId}],
      ['retry_world',{snapshotId:edited.snapshotId}],
      ['capture_scene_view',{snapshotId:edited.snapshotId}],
      ['edit_world',edit(edited,'expiry-new-edit')],
      ['edit_world',args],
    ]){
      const response=await f.rpc(name,input);
      assert.equal(response.result.isError,true,name);
      assert.equal(response.result._meta,undefined,name);
      assert.equal(response.result.structuredContent?.bundle,undefined,name);
      assert.equal(response.result.structuredContent.error.code,'snapshot_not_found',name);
    }
    assert.deepEqual(f.sqlite.prepare('SELECT snapshot_id, created_at, expires_at FROM studio_snapshots ORDER BY snapshot_id').all().map(row=>({...row})),before);
  }finally{f.close();}
});

test('a read-only accepted edit keeps the emitted revision and all hash fields consistent',async()=>{
  const f=fixture();try{
    const created=summary(await f.rpc('create_world',{operationId:'readonly-create'}));
    const response=await f.rpc('edit_world',{snapshotId:created.snapshotId,expectedRevision:created.revision,operationId:'readonly-edit',operations:[{tool:'get_editor_context',arguments:{}}]});
    const edited=summary(response);
    assert.equal(edited.revision,created.revision+1);
    assert.equal(edited.delivery.revision,edited.revision);
    assert.equal(edited.hash,created.hash);
    assert.equal(edited.delivery.hash,edited.hash);
    const shown=await f.rpc('show_world',{snapshotId:edited.snapshotId});
    const app=shown.result._meta.xriftStudio;
    assert.equal(app.revision,edited.revision);
    assert.equal(app.delivery.revision,edited.revision);
    assert.equal(app.hash,await bundleHash(app.bundle));
    assert.equal(app.delivery.hash,app.hash);
    assert.equal(response.result._meta,undefined);
    assert.equal(edited.bundle,undefined);
    const persisted=JSON.parse(f.sqlite.prepare('SELECT result_json FROM studio_snapshots WHERE snapshot_id = ?').get(edited.snapshotId).result_json);
    assert.equal(persisted.delivery.revision,edited.revision);
    assert.equal(persisted.delivery.hash,edited.hash);
    assert.equal(persisted.delivery.serverSaved,true);
  }finally{f.close();}
});

test('a known expired creation or local-capture operation cannot silently create a fresh project', {concurrency:false}, async t=>{
  let clock=1_800_000_000_000;
  t.mock.method(Date,'now',()=>clock);
  const f=fixture();try{
    const args={name:'expiry-create-only',operationId:'create-replay-expiry'};
    const created=summary(await f.rpc('create_world',args));
    const local=await callTool('create_world',{name:'expiry-local-only'});
    const captureArgs={bundle:local.bundle,operationId:'local-replay-expiry'};
    const captured=summary(await f.rpc('store_editor_snapshot',captureArgs));
    assert.equal(captured.expiresAt,created.expiresAt);
    const before=f.sqlite.prepare('SELECT snapshot_id, project_id, created_at, expires_at FROM studio_snapshots ORDER BY snapshot_id').all().map(row=>({...row}));
    clock=created.expiresAt;
    for(const [name,input] of [['create_world',args],['store_editor_snapshot',captureArgs]]){
      const response=await f.rpc(name,input);
      assert.equal(response.result.isError,true);
      assert.equal(response.result.structuredContent.error.code,'snapshot_not_found');
      assert.equal(response.result._meta,undefined);
    }
    assert.deepEqual(f.sqlite.prepare('SELECT snapshot_id, project_id, created_at, expires_at FROM studio_snapshots ORDER BY snapshot_id').all().map(row=>({...row})),before);
    const fresh=summary(await f.rpc('store_editor_snapshot',{bundle:local.bundle,operationId:'explicit-fresh-local'}));
    assert.notEqual(fresh.snapshotId,captured.snapshotId);
    assert.equal(fresh.projectId,captured.projectId);
  }finally{f.close();}
});

test('the local-only new-project entry carries its full bundle only in app metadata',async()=>{
  const f=fixture();try{
    const response=await f.rpc('open_studio',{mode:'new',name:'metadata-only-new'});
    const visible=summary(response);
    assert.equal(visible.bundle,undefined);
    assert.ok(!JSON.stringify(response.result.content).includes('"bundle"'));
    const app=response.result._meta.xriftStudio;
    assert.equal(app.bundle.project.metadata.name,'metadata-only-new');
    assert.equal(app.delivery.hash,await bundleHash(app.bundle));
    assert.equal(app.delivery.serverSaved,false);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM studio_snapshots').get().count,0);
  }finally{f.close();}
});

test('discovery declares explicit editor capture as a write and bounds the idempotency promise',async()=>{
  const f=fixture();try{
    const response=await worker.fetch(new Request('https://isolated.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),f.env);
    const tools=(await response.json()).result.tools;
    assert.equal(tools.find(tool=>tool.name==='get_editor_context').annotations.readOnlyHint,false);
    assert.equal(tools.find(tool=>tool.name==='get_operation_status').annotations.readOnlyHint,true);
    assert.match(tools.find(tool=>tool.name==='create_world').description,/Idempotency is guaranteed only during the 24-hour snapshot lifetime/);
  }finally{f.close();}
});
