import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {commitExistingBlends} from './commit-existing-model-blends.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blend-migration-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const project = path.join(root,'project'), prepared=path.join(root,'prepared');
  const source='assets/imported/models/person.glb', blend='assets/imported/blender/person/model.blend';
  await fs.mkdir(path.dirname(path.join(project,source)), {recursive:true});
  await fs.mkdir(path.dirname(path.join(prepared,blend)), {recursive:true});
  await fs.writeFile(path.join(project,source),'original GLB');
  await fs.writeFile(path.join(prepared,blend),'BLENDER-v500payload');
  const original={assets:{person:{id:'person',kind:'model',source:{kind:'project',relativePath:source}}}};
  const bytes=JSON.stringify(original);
  await fs.writeFile(path.join(project,'assets/assets.json'),bytes);
  const candidate=structuredClone(original); candidate.assets.person.blenderSource={kind:'project',relativePath:blend};
  await fs.writeFile(path.join(prepared,'candidate-assets.json'),JSON.stringify(candidate));
  await fs.writeFile(path.join(prepared,'report.json'),JSON.stringify({project,manifestSha256:hash(bytes),models:[{id:'person',source,sourceSha256:hash('original GLB'),blend,blendSha256:hash('BLENDER-v500payload'),verifiedBlendSha256:hash('BLENDER-v500payload')}]}));
  return {project,prepared,original,source,blend};
}
test('attaches source, preserves GLB and keeps exact manifest backup',async t=>{
 const f=await fixture(t), result=await commitExistingBlends(f.prepared);
 assert.equal(result.models,1);
 assert.deepEqual(JSON.parse(await fs.readFile(result.backup)),f.original);
 assert.equal(await fs.readFile(path.join(f.project,f.source),'utf8'),'original GLB');
 assert.equal(JSON.parse(await fs.readFile(path.join(f.project,'assets/assets.json'))).assets.person.blenderSource.relativePath,f.blend);
});
test('rejects stale manifest without modifying the project',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.project,'assets/assets.json'),'new user edits');
 await assert.rejects(commitExistingBlends(f.prepared),/Project changed/);
 assert.equal(await fs.readFile(path.join(f.project,'assets/assets.json'),'utf8'),'new user edits');
});
test('rejects candidate changes unrelated to Blender metadata',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.prepared,'candidate-assets.json'),'{}');
 await assert.rejects(commitExistingBlends(f.prepared),/more than Blender/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.project,'assets/assets.json'))),f.original);
});
test('rejects unverified or modified Blender sources',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.prepared,f.blend),'changed after verification');
 await assert.rejects(commitExistingBlends(f.prepared),/roundtrip verification/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.project,'assets/assets.json'))),f.original);
});
test('rejects source GLB edits made after preparation',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.project,f.source),'user model edit');
 await assert.rejects(commitExistingBlends(f.prepared),/Model changed/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.project,'assets/assets.json'))),f.original);
});
