import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const server = await createServer({configFile:false, cacheDir:'node_modules/.vite-transparent-textures-test',server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
test.after(()=>server.close());
const store=await server.ssrLoadModule('/src/lib/transparent-textures-store.ts');
const {applyExternalStoreInstall}=await server.ssrLoadModule('/src/lib/visual-editor/external-store.ts');
const catalog=JSON.parse(readFileSync('src/lib/visual-editor/transparent-textures.manifest.json','utf8'));
const root='public/visual-editor/transparent-textures/v1/';
const originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;});
globalThis.FileReader=class { readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();}).catch(error=>{this.error=error;this.onerror?.();});} };
let corrupt=false;
globalThis.fetch=async url=>{
  const name=String(url).split('/').at(-1);
  const bytes=Buffer.from(readFileSync(root+name));
  if(corrupt&&name==='rabbit.png')bytes[bytes.length-20]^=1;
  return new Response(bytes,{status:200});
};

test('all 30 shipped PNGs match the catalog and are RGBA images with unique IDs',async()=>{
  const assets=await store.listTransparentTextureAssets();
  assert.equal(assets.length,30);assert.equal(new Set(assets.map(a=>a.externalId)).size,30);
  assert.equal(new Set(assets.map(a=>a.category)).size,4);
  for(const entry of catalog){
    const bytes=readFileSync(root+entry.id+'.png');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    assert.equal(bytes.length,entry.byteLength);assert.equal(bytes.readUInt32BE(16),entry.width);assert.equal(bytes[25],6);
  }
  assert.ok(assets.find(a=>a.name==='うさぎ').tags.includes('rabbit'));
});
test('imports the exact PNG and license in one transaction and creates a reusable transparent material',async()=>{
  const writes=[];
  const options=await store.getTransparentTextureOptions('rabbit');assert.equal(options.resolutions[0].id,'original');
  const result=await store.installTransparentTexture('isolated-project',{providerId:store.TRANSPARENT_TEXTURES_PROVIDER_ID,externalId:'rabbit',resolution:'original'},async(path,id,files)=>{assert.equal(path,'isolated-project');writes.push(...files);});
  assert.equal(writes.length,2);
  assert.deepEqual(Buffer.from(writes[0].dataUrl.split(',')[1],'base64'),readFileSync(root+'rabbit.png'));
  assert.match(Buffer.from(writes[1].dataUrl.split(',')[1],'base64').toString(),/^MIT License/);
  const applied=applyExternalStoreInstall({schemaVersion:'0.1.0',assets:{}},result);
  assert.equal(applied.installedAssetIds.length,2);
  const material=applied.manifest.assets[applied.primaryAssetId];
  assert.equal(material.properties.alphaMode,'BLEND');assert.equal(material.properties.doubleSided,true);
  assert.equal(material.properties.pbrMetallicRoughness.metallicFactor,0);
  const texture=applied.manifest.assets[material.properties.pbrMetallicRoughness.baseColorTexture.textureAssetId];
  assert.equal(texture.source.relativePath,result.files[0].relativePath);assert.equal(texture.importSettings.flipY,true);
  assert.equal(texture.importSettings.resize.mode,'original');assert.equal(texture.importSettings.compression.format,'source');
  material.name='作者が編集したうさぎ';material.properties.pbrMetallicRoughness.roughnessFactor=.35;
  const again=applyExternalStoreInstall(applied.manifest,result);
  assert.equal(again.manifest,applied.manifest);assert.equal(again.manifest.assets[material.id].name,'作者が編集したうさぎ');
});
test('rejects corrupt or unknown data before committing any file',async()=>{
  let commits=0;corrupt=true;
  try{await assert.rejects(store.installTransparentTexture('isolated-project',{providerId:store.TRANSPARENT_TEXTURES_PROVIDER_ID,externalId:'rabbit',resolution:'original'},async()=>{commits++;}),/一致しません/);}finally{corrupt=false;}
  assert.equal(commits,0);
  await assert.rejects(store.getTransparentTextureOptions('../secret'),/見つかりません/);
});
