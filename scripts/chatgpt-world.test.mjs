import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-world-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { parseChatgptWorldPlan, buildChatgptWorld } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-world.ts");
const { placeChatgptAssets } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-world.ts');
const { applyExternalStoreInstall } = await server.ssrLoadModule('/src/lib/visual-editor/external-store.ts');
const { serializeVisualProjectDocuments } = await server.ssrLoadModule('/src/lib/visual-editor/persistence.ts');
const { chatgptAssetRequests } = await server.ssrLoadModule('/src/lib/visual-editor/chatgpt-world.ts');
const { applyExternalStoreInstallAndAnalyzeModel } = await server.ssrLoadModule('/src/lib/visual-editor/external-store.ts');
const { tauri } = await server.ssrLoadModule('/src/lib/tauri.ts');
const { getMaterialShowcaseAsset, materialShowcaseAssetId, MATERIAL_SHOWCASE_DEFINITIONS } = await server.ssrLoadModule('/src/lib/visual-editor/material-showcase-catalog.ts');
test.after(() => server.close());
const input = { title: "秋の公園", description: "木とベンチのある広場", objects: [
  { name: "地面", shape: "plane", position: [0,0,0], scale: [12,12,1] },
  { name: "ベンチ", shape: "box", position: [2,0.5,1], scale: [2,1,0.5], rotation: [0,90,0] }
] };
test("native output becomes a separately identified regular Editor document set", () => {
  const original = JSON.stringify(input);
  const a = buildChatgptWorld(parseChatgptWorldPlan(original), "test-world-a");
  const b = buildChatgptWorld(parseChatgptWorldPlan(original), "test-world-b");
  assert.notEqual(a.project.projectId, b.project.projectId);
  assert.equal(a.project.metadata.title, "秋の公園");
  const entities = Object.values(a.scene.entities);
  for (const name of ["地面", "ベンチ"]) assert.ok(entities.some(v => v.name === name));
  const plane = entities.find(v => v.name === "地面");
  const bench = entities.find(v => v.name === "ベンチ");
  const transform = e => e.components.find(c => c.type === "transform");
  assert.deepEqual(transform(plane).scale, [12,12,1]);
  assert.equal(transform(plane).rotation[0], -Math.PI / 2);
  assert.equal(transform(bench).rotation[1], Math.PI / 2);
  assert.deepEqual(transform(bench).position, [2,0.5,1]);
  assert.equal(JSON.stringify(input), original);
});
test("rejects arbitrary instructions and bounded-data violations before creating documents", () => {
  for (const raw of [
    { ...input, tool: "delete_project" },
    { ...input, objects: [{ ...input.objects[0], shape: "script" }] },
    { ...input, objects: [{ ...input.objects[0], position: [0,null,0] }] },
    { ...input, objects: [{ ...input.objects[0], scale: [-1,1,1] }] },
    { ...input, objects: Array(33).fill(input.objects[0]) },
  ]) assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw)));
  assert.throws(() => parseChatgptWorldPlan("not JSON"));
  assert.throws(() => parseChatgptWorldPlan("x".repeat(100001)));
});
test("strict schema optional nulls preserve default placement and are not persisted", () => {
  const strict = { ...input, objects: input.objects.map(v => ({ externalId: null, materialExternalId: null, gltfMaterialId: null, rotation: null, ...v })) };
  const before = JSON.stringify(strict);
  const parsed = parseChatgptWorldPlan(before);
  assert.deepEqual(parsed, input);
  const built = buildChatgptWorld(parsed, "nullable-plan");
  const ground = Object.values(built.scene.entities).find(v => v.name === "地面");
  assert.equal(ground.components.find(c => c.type === "transform").rotation[0], -Math.PI / 2);
  assert.equal(JSON.stringify(strict), before);
  for (const field of ["name", "shape", "position", "scale"]) {
    assert.throws(() => parseChatgptWorldPlan(JSON.stringify({ ...strict, objects: [{ ...strict.objects[0], [field]: null }] })));
  }
});
test("invalid model plans request a retry without asking the author to repair JSON", () => {
  for (const patch of [{shape:"torus"},{name:" "},{position:[0,51,0]},{scale:[1,0,1]},
    {rotation:[0,361,0]},{color:"red"},{externalId:"forged"},{materialExternalId:"forged"},{gltfMaterialId:"forged"}]) {
    assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...input,objects:[{...input.objects[0],...patch}]})), /編集プランを確認できませんでした。再試行してください/);
  }
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...input,title:""})), /編集プランを確認できませんでした/);
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...input,description:"x".repeat(601)})), /編集プランを確認できませんでした/);
  const noOp = parseChatgptWorldPlan(JSON.stringify({title:"完了",description:"現在のSceneで作業済みです",objects:[],edits:[],hasMore:false,remainingWork:null}));
  assert.deepEqual(noOp.objects,[]); assert.equal(noOp.hasMore,false); assert.equal(noOp.remainingWork,undefined);
});
test("existing Entity edits are bounded, use context IDs and never accept raw documents or duplicate targets", () => {
  const edits = [{ entityId: "current-entity", name: null, position: [2, 1, 0], scale: null, rotation: [0, 90, 0] }];
  const raw = { title: "ベンチを調整", description: "通路を広げる", objects: [], edits };
  const parsed = parseChatgptWorldPlan(JSON.stringify(raw), [], false, ["current-entity"]);
  assert.deepEqual(parsed.edits, [{ entityId: "current-entity", position: [2,1,0], rotation: [0,90,0] }]);
  for (const invalid of [
    { ...raw, edits: [{ ...edits[0], entityId: "other-world-entity" }] },
    { ...raw, edits: [edits[0], edits[0]] },
    { ...raw, edits: [{ entityId: "current-entity", position: null, rotation: null }] },
    { ...raw, edits: [{ ...edits[0], position: [0,51,0] }] },
    { ...raw, edits: [{ ...edits[0], remove: true }] },
    { ...raw, objects: Array(32).fill(input.objects[0]) },
  ]) assert.throws(() => parseChatgptWorldPlan(JSON.stringify(invalid), [], false, ["current-entity"]));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw)));
});
const candidates = [{ providerId: 'poly-haven', externalId: 'bench', assetKind: 'model' }];
const props = { ...input, objects: [input.objects[0], ...[0,1].map(i => ({ name: `外部ベンチ${i}`, shape: 'model', externalId: 'bench', position: [i*3,0,0], scale: [1,1,1], rotation: [0,90,0] }))] };
test('catalog model placements reuse imported geometry and original material bindings', () => {
  const plan = parseChatgptWorldPlan(JSON.stringify(props), candidates);
  const base = buildChatgptWorld(plan, 'external-model-world', candidates);
  const applied = applyExternalStoreInstall(base.assets, { providerId:'poly-haven', providerName:'Poly Haven', externalId:'bench', name:'Bench', assetKind:'model', resolution:'1k', files:[{ role:'model', format:'gltf', relativePath:'assets/bench.gltf', byteLength:1024, sha256:'a'.repeat(64) }], authors:['Artist'], assetUrl:'https://polyhaven.com/a/bench', licenseName:'CC0 1.0', licenseUrl:'https://polyhaven.com/license' });
  const model = applied.manifest.assets[applied.primaryAssetId];
  // Fixture models an already analyzed import; placement must retain its material.
  const materialId = Object.keys(applied.manifest.assets).find(id => applied.manifest.assets[id].kind === 'material');
  model.materialSlots = [{slot:"0", name:'Wood', defaultMaterialAssetId:materialId}];
  const imported = {...base, assets:applied.manifest};
  const before = JSON.stringify(imported);
  const placed = placeChatgptAssets(imported, plan, new Map([['poly-haven:bench',applied.primaryAssetId]]));
  for (const v of plan.objects.filter(v => v.shape === 'model')) {
    const e = Object.values(placed.scene.entities).find(e => e.name === v.name);
    assert.ok(e);
    const mesh = e.components.find(c => c.type === 'mesh');
    assert.equal(mesh.geometryAssetId, applied.primaryAssetId);
    assert.deepEqual(mesh.materialBindings, [{slot:"0",materialAssetId:materialId}]);
    assert.deepEqual(e.components.find(c => c.type === 'transform').position, v.position);
    assert.equal(e.components.find(c => c.type === 'transform').rotation[1], Math.PI/2);
  }
  assert.equal(Object.values(placed.assets.assets).filter(a => a.kind === 'model').length, 1);
  assert.equal(placed.assets.assets[model.id].attribution.licenseName, 'CC0 1.0');
  assert.equal(JSON.stringify(imported), before);
  assert.throws(() => placeChatgptAssets(imported, plan, new Map()));
});
test('external plans reject forged IDs, URLs, wrong providers and excessive downloads', () => {
  for (const candidate of [[], [{...candidates[0],providerId:'other'}], [{...candidates[0],assetKind:'texture'}]]) assert.throws(() => parseChatgptWorldPlan(JSON.stringify(props),candidate));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...props,objects:[{...props.objects[1],url:'https://evil.invalid'}]}), candidates));
  const many = Array.from({length:7},(_,i) => ({...candidates[0],externalId:`model-${i}`}));
  const plan = {...props,objects:many.map(c => ({...props.objects[1],externalId:c.externalId}))};
  assert.throws(() => buildChatgptWorld(plan,'too-many',many));
});

test('material-only mode binds PBR textures to the floor without downloading models', () => {
  const catalog = [{providerId:'poly-haven',externalId:'wood',assetKind:'texture'}];
  const plan = parseChatgptWorldPlan(JSON.stringify({...input,objects:[{...input.objects[0],materialExternalId:'wood'}]}),catalog);
  const base = buildChatgptWorld(plan,'material-only',catalog);
  const installed = applyExternalStoreInstall(base.assets, {providerId:'poly-haven',providerName:'Poly Haven',externalId:'wood',name:'Wood',assetKind:'texture',resolution:'1k',files:[{role:'base-color',format:'jpg',relativePath:'assets/wood.jpg',byteLength:10,sha256:'a'.repeat(64)},{role:'normal',format:'png',relativePath:'assets/normal.png',byteLength:10,sha256:'b'.repeat(64)}],authors:['Artist'],assetUrl:'https://polyhaven.com/a/wood',licenseName:'CC0 1.0',licenseUrl:'https://polyhaven.com/license'});
  const placed = placeChatgptAssets({...base,assets:installed.manifest},plan,new Map([['poly-haven:wood',installed.primaryAssetId]]));
  const floor = Object.values(placed.scene.entities).find(e => e.name === '地面');
  assert.equal(floor.components.find(c => c.type === 'transform').rotation[0],-Math.PI/2);
  assert.ok(floor.components.find(c => c.type === 'mesh').materialBindings.some(b => b.materialAssetId === installed.primaryAssetId));
  const material = placed.assets.assets[installed.primaryAssetId];
  assert.ok(material.properties.pbrMetallicRoughness.baseColorTexture.textureAssetId);
  assert.ok(material.properties.normalTexture.textureAssetId);
  assert.equal(Object.values(placed.assets.assets).some(a => a.kind === 'model'),false);
  assert.deepEqual(chatgptAssetRequests(plan),[{providerId:'poly-haven',externalId:'wood',kind:'texture'}]);
  assert.doesNotThrow(() => serializeVisualProjectDocuments({project:placed.project,scenes:{[placed.scene.sceneId]:placed.scene},assets:placed.assets,prefabs:placed.prefabs}));
});
test('otogura audio is a normal looping Audio Source with persisted credit', () => {
  const catalog = [{providerId:'otogura',externalId:'birds',assetKind:'audio'}];
  const sound = {name:'鳥の声',shape:'audio',externalId:'birds',position:[0,0,0],scale:[1,1,1]};
  const plan = parseChatgptWorldPlan(JSON.stringify({...input,objects:[sound]}),catalog);
  const base = buildChatgptWorld(plan,'audio-world',catalog);
  const installed = applyExternalStoreInstall(base.assets,{providerId:'otogura',providerName:'音蔵',externalId:'birds',name:'Birds',assetKind:'audio',resolution:'src',files:[{role:'audio',format:'wav',relativePath:'assets/birds.wav',byteLength:10,sha256:'a'.repeat(64)}],authors:['音蔵'],assetUrl:'https://yushimatenjin.github.io/sound-generator/',licenseName:'Free to use',licenseUrl:''});
  const placed = placeChatgptAssets({...base,assets:installed.manifest},plan,new Map([['otogura:birds',installed.primaryAssetId]]));
  const source = Object.values(placed.scene.entities).find(e => e.name === sound.name).components.find(c => c.type === 'audio-source');
  assert.equal(source.audioAssetId,installed.primaryAssetId);
  assert.equal(source.loop,true);assert.equal(source.autoplay,true);assert.equal(source.spatial,false);assert.equal(source.volume,0.35);
  assert.equal(placed.assets.assets[installed.primaryAssetId].attribution.providerId,'otogura');
  assert.doesNotThrow(() => serializeVisualProjectDocuments({project:placed.project,scenes:{[placed.scene.sceneId]:placed.scene},assets:placed.assets,prefabs:placed.prefabs}));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...input,objects:[{...sound,materialExternalId:'wood'}]}),catalog));
});

test('external glTF goes through the real importer before it can be saved', async () => {
  const bytes = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
  const gltf = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{name:'Wood',pbrMetallicRoughness:{baseColorFactor:[0.4,0.2,0.1,1]}}],buffers:[{byteLength:bytes.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(bytes.buffer).toString('base64')}],bufferViews:[{buffer:0,byteLength:bytes.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
  const source = Buffer.from(JSON.stringify(gltf));
  const originalRead = tauri.readProjectFileDataUrl;
  const originalCommit = tauri.commitVisualAssetImport;
  const originalProgress = globalThis.ProgressEvent;
  const originalFileReader = globalThis.FileReader;
  globalThis.FileReader ??= class FileReader extends EventTarget {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => {this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.dispatchEvent(new Event('load'));},error => {this.error=error;this.dispatchEvent(new Event('error'));}); }
  };
  globalThis.ProgressEvent ??= class ProgressEvent { constructor(type,init){Object.assign(this,{type},init);} };
  let committed = false;
  tauri.readProjectFileDataUrl = async(path,file) => {assert.equal(path,'/isolated/new-world');assert.equal(file,'assets/bench.gltf');return 'data:model/gltf+json;base64,'+source.toString('base64');};
  tauri.commitVisualAssetImport = async(path) => {assert.equal(path,'/isolated/new-world');committed=true;};
  try {
    const plan = parseChatgptWorldPlan(JSON.stringify(props),candidates);
    const base = buildChatgptWorld(plan,'real-import',candidates);
    const applied = await applyExternalStoreInstallAndAnalyzeModel('/isolated/new-world',base.assets,{providerId:'poly-haven',providerName:'Poly Haven',externalId:'bench',name:'Bench',assetKind:'model',resolution:'1k',files:[{role:'model',format:'gltf',relativePath:'assets/bench.gltf',byteLength:source.length,sha256:'a'.repeat(64)}],authors:['Artist'],assetUrl:'https://polyhaven.com/a/bench',licenseName:'CC0 1.0',licenseUrl:'https://polyhaven.com/license'});
    assert.equal(committed,true);
    const model = applied.manifest.assets[applied.primaryAssetId];
    assert.ok(model.importMetadata);assert.equal(model.materialSlots.length,1);
    assert.equal(model.attribution.providerId,'poly-haven');
    assert.equal(model.attribution.licenseName,'CC0 1.0');
    const derived = applied.manifest.assets[model.materialSlots[0].defaultMaterialAssetId];
    assert.equal(derived.attribution.externalId,'bench');
    assert.deepEqual(derived.attribution.authors,['Artist']);
    const placed = placeChatgptAssets({...base,assets:applied.manifest},plan,new Map([['poly-haven:bench',applied.primaryAssetId]]));
    assert.doesNotThrow(() => serializeVisualProjectDocuments({project:placed.project,scenes:{[placed.scene.sceneId]:placed.scene},assets:placed.assets,prefabs:placed.prefabs}));
    tauri.readProjectFileDataUrl = async() => 'data:model/gltf+json;base64,'+Buffer.from('invalid').toString('base64');
    await assert.rejects(() => applyExternalStoreInstallAndAnalyzeModel('/isolated/new-world',base.assets,{providerId:'poly-haven',providerName:'Poly Haven',externalId:'bench',name:'Bench',assetKind:'model',resolution:'1k',files:[{role:'model',format:'gltf',relativePath:'assets/bench.gltf',byteLength:10,sha256:'a'.repeat(64)}],authors:[],assetUrl:'',licenseName:'CC0 1.0',licenseUrl:''}));
  } finally {tauri.readProjectFileDataUrl=originalRead;tauri.commitVisualAssetImport=originalCommit;globalThis.ProgressEvent=originalProgress;globalThis.FileReader=originalFileReader;}
});

test('glTF catalog material alone retains its extension and adds no sample model', () => {
  assert.ok(MATERIAL_SHOWCASE_DEFINITIONS.length <= 128);
  const id = materialShowcaseAssetId('car-paint');
  const material = getMaterialShowcaseAsset(id);
  const raw = {...input,objects:[{...input.objects[0],gltfMaterialId:id}]};
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw)));
  const plan = parseChatgptWorldPlan(JSON.stringify(raw),[],true);
  const base = buildChatgptWorld(plan,'gltf-material-only',[],true);
  const imported = {...base,assets:{...base.assets,assets:{...base.assets.assets,[id]:structuredClone(material)}}};
  const placed = placeChatgptAssets(imported,plan,new Map());
  const floor = Object.values(placed.scene.entities).find(e => e.name === '地面');
  assert.ok(floor.components.find(c => c.type === 'mesh').materialBindings.some(b => b.materialAssetId === id));
  assert.deepEqual(placed.assets.assets[id].properties,material.properties);
  assert.ok(placed.assets.assets[id].properties.extensions.KHR_materials_clearcoat);
  assert.equal(Object.values(placed.assets.assets).some(a => a.kind === 'model'),false);
  assert.doesNotThrow(() => serializeVisualProjectDocuments({project:placed.project,scenes:{[placed.scene.sceneId]:placed.scene},assets:placed.assets,prefabs:placed.prefabs}));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...raw,objects:[{...raw.objects[0],gltfMaterialId:'forged'}]}),[],true));
  assert.throws(() => parseChatgptWorldPlan(JSON.stringify({...raw,objects:[{...raw.objects[0],materialExternalId:'wood'}]}),[{providerId:'poly-haven',assetKind:'texture',externalId:'wood'}],true));
});
