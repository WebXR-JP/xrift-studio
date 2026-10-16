import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-chatgpt-resources-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { parseChatgptWorldPlan, chatgptAssetRequests } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-world.ts");
const { createChatgptScaffold, placeChatgptObject, applyChatgptOperation } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-generation.ts");
const { applyExternalStoreInstall } = await server.ssrLoadModule("/src/lib/visual-editor/external-store.ts");
const { createEmptyEntity } = await server.ssrLoadModule("/src/lib/visual-editor/editor-session.ts");
const { serializeVisualProjectDocuments } = await server.ssrLoadModule("/src/lib/visual-editor/persistence.ts");
const { createDefaultMaterialAsset, normalizeMaterialProperties } = await server.ssrLoadModule("/src/lib/visual-editor/asset-manifest.ts");
const { SKY_SHADER_CATALOG } = await server.ssrLoadModule("/src/lib/visual-editor/sky-shader-catalog.ts");
test.after(() => server.close());
test("one scene Material operation covers more than 32 meshes, every slot and model-node overrides atomically", async () => {
  const { chatgptSceneMaterialTargets } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-scene-material.ts");
  const { chatgptPlanSnapshots, assertChatgptPlanCurrent } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-plan-guards.ts");
  const { createStarterVisualProject } = await server.ssrLoadModule("/src/lib/visual-editor/starter-templates.ts");
  const bundle = createStarterVisualProject("world", "blank", "bulk-material-test");
  const template = Object.values(bundle.scene.entities).find(entity => entity.components.some(component => component.type === "mesh"));
  const originalMaterial = template.components.find(component => component.type === "mesh").materialBindings[0].materialAssetId;
  bundle.assets.assets["bulk-model"] = { id: "bulk-model", name: "Two surfaces", kind: "model", status: "ready", materialSlots: [{ slot: "body", name: "Body", sourceMaterialIndex: 0 }, { slot: "trim", name: "Trim", sourceMaterialIndex: 1 }] };
  bundle.assets.assets["bulk-material"] = createDefaultMaterialAsset({ id: "bulk-material", name: "選んだMaterial" });
  bundle.scene.entities = {}; bundle.scene.rootEntityIds = [];
  for (let index = 0; index < 40; index++) {
    const entity = structuredClone(template); entity.id = `bulk-${index}`; entity.parentId = null; entity.children = [];
    for (const [componentIndex, component] of entity.components.entries()) component.id = `${entity.id}-component-${componentIndex}`;
    const mesh = entity.components.find(component => component.type === "mesh");
    mesh.geometryAssetId = "bulk-model"; mesh.geometry = { kind: "asset", assetId: "bulk-model" }; mesh.materialBindings = ["body", "trim"].map(slot => ({ slot, materialAssetId: originalMaterial }));
    if (!index) mesh.materialBindings.push({ slot: "body", materialAssetId: originalMaterial, sourceNodeIndex: 2 });
    bundle.scene.entities[entity.id] = entity; bundle.scene.rootEntityIds.push(entity.id);
  }
  const child = structuredClone(template); child.id = "model-part"; child.parentId = "bulk-0"; child.components = child.components.filter(component => component.type === "transform");
  child.modelNode = { modelEntityId: "bulk-0", sourceNodeIndex: 2, sourceMaterialIndices: [0, 1] };
  bundle.scene.entities[child.id] = child; bundle.scene.entities["bulk-0"].children = [child.id];
  const context = { projectAssets: [{ id: "bulk-material", name: "選んだMaterial", kind: "material" }], builtinCandidates: [], components: [] };
  const operation = { kind: "material-scene", candidateId: "project:bulk-material" };
  const plan = parseChatgptWorldPlan(JSON.stringify({ title: "一括", description: "", objects: [], operations: [operation] }), [], false, Object.keys(bundle.scene.entities), context);
  const snapshot = JSON.stringify(bundle), guards = chatgptPlanSnapshots(bundle, plan);
  const result = await applyChatgptOperation(bundle, operation, new Map(), context);
  assert.equal(JSON.stringify(bundle), snapshot);
  assert.equal(chatgptSceneMaterialTargets(bundle).length, 82);
  for (const entity of Object.values(result.bundle.scene.entities)) for (const mesh of entity.components.filter(component => component.type === "mesh")) {
    assert.equal(mesh.geometryAssetId, "bulk-model");
    assert.ok(mesh.materialBindings.every(binding => binding.materialAssetId === "bulk-material"));
  }
  assert.deepEqual(result.bundle.assets, bundle.assets);
  const concurrent = structuredClone(bundle); concurrent.scene.entities["bulk-39"].name = "手動変更";
  assert.throws(() => assertChatgptPlanCurrent(concurrent, plan, guards));
  assert.deepEqual(chatgptAssetRequests({ ...plan, operations: [{ kind: "material-scene", candidateId: "ambient-cg:stone" }] }), [{ providerId: "ambient-cg", externalId: "stone", kind: "texture" }]);
  for (const invalid of [{ kind: "material-scene" }, { ...operation, entityId: "bulk-0" }, { ...operation, candidateId: "unknown" }]) assert.throws(() => parseChatgptWorldPlan(JSON.stringify({ ...plan, operations: [invalid] }), [], false, Object.keys(bundle.scene.entities), context));
});
test("twelve ranked Skybox choices preserve exact order and reject unsafe or mismatched candidates", async () => {
  const { listChatgptBuiltinCandidates } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-builtin-catalog.ts");
  const { chatgptChoicePreviews } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-choice-previews.ts");
  const skies = listChatgptBuiltinCandidates("world", "夕暮れの公園").filter(item => item.actions.includes("skybox")).slice(0, 12).reverse();
  assert.equal(skies.length, 12);
  const context = { projectAssets: [], builtinCandidates: skies, components: [] };
  const question = { question: "空を選ぶ", choices: skies.map(item => item.name), choiceCandidateIds: skies.map(item => item.candidateId) };
  const parse = question => parseChatgptWorldPlan(JSON.stringify({ title: "空", description: "おすすめ順", objects: [], questions: [question] }), [], false, [], context);
  assert.deepEqual(parse(question).questions[0], question);
  assert.equal(Object.keys(chatgptChoicePreviews([question], context)).length, 12);
  for (const bad of [
    { ...question, choiceCandidateIds: null },
    { ...question, choiceCandidateIds: question.choiceCandidateIds.slice(1) },
    { ...question, choiceCandidateIds: Array(12).fill(question.choiceCandidateIds[0]) },
    { ...question, choiceCandidateIds: ["builtin:sky:forged", ...question.choiceCandidateIds.slice(1)] },
    { ...question, choices: [...question.choices, "余分な空"], choiceCandidateIds: [...question.choiceCandidateIds, "builtin:sky:overflow"] },
  ]) assert.throws(() => parse(bad));
});

test("catalog proposals resolve real builtin, project and HTTPS previews without accepting model URLs", async () => {
  const { listChatgptBuiltinCandidates } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-builtin-catalog.ts");
  const { chatgptCandidatePreview } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-choice-previews.ts");
  const builtinCandidates = listChatgptBuiltinCandidates();
  const context = { projectAssets: [{ id: "chair", kind: "model", name: "椅子" }], builtinCandidates, components: [] };
  for (const item of builtinCandidates.filter(item => item.providerId !== "xrift-sky-shaders")) assert.deepEqual(chatgptCandidatePreview(item.candidateId, context), { kind: "builtin", name: item.name, candidateId: item.candidateId });
  assert.deepEqual(chatgptCandidatePreview("project:chair", context), { kind: "project", name: "椅子", assetId: "chair" });
  assert.equal(chatgptCandidatePreview("https://example.invalid/made-up.png", context), undefined);
  for (const thumbnailUrl of ["https://example.invalid/chair.webp", "file:///private.png", "https://user:secret@example.invalid/private.png"]) {
    const remote = [{ providerId: "poly-haven", externalId: "chair", name: "Chair", assetKind: "model", thumbnailUrl }];
    assert.equal(chatgptCandidatePreview("poly-haven:chair", context, remote)?.kind, thumbnailUrl === "https://example.invalid/chair.webp" ? "remote" : undefined);
  }
});
const noOp = { title: "調整", description: "現在のSceneを調整します", objects: [], hasMore: false, remainingWork: null };
const resources = { projectAssets: [{id:"local-model",kind:"model",name:"Model"},{id:"local-audio",kind:"audio",name:"Audio"},{id:"local-material",kind:"material",name:"PBR"},{id:"local-sky",kind:"material",name:"Sky",skyboxMaterial:true}], builtinCandidates: [{candidateId:"builtin:material:glass",providerId:"material",name:"Glass",description:"",actions:["material"]},{candidateId:"builtin:sky:night",providerId:"sky",name:"Night",description:"",actions:["skybox"]},{candidateId:"builtin:props:bench",providerId:"props",name:"Bench",description:"",actions:["catalog"]}], components: [{entityId:"bgm",componentId:"source",type:"audio-source"}] };
const remote = [
  {providerId:"poly-haven",externalId:"same",assetKind:"model"},
  {providerId:"ai-lowpoly-props",externalId:"same",assetKind:"model"},
  {providerId:"ambient-cg",externalId:"ground",assetKind:"texture"},
  {providerId:"poly-haven",externalId:"sky",assetKind:"hdri"},
  {providerId:"otogura",externalId:"birds",assetKind:"audio"},
];
const obj = (shape, externalId) => ({name:"配置",shape,externalId,position:[0,0,0],scale:[1,1,1]});
const parse = (plan, candidates=remote) => parseChatgptWorldPlan(JSON.stringify(plan),candidates,false,["bgm","target"],resources);
test("remote providers use qualified IDs while project resources require no downloads", () => {
  const plan = parse({...noOp,objects:[obj("model","poly-haven:same"),obj("model","ai-lowpoly-props:same"),obj("model","project:local-model")],operations:[
    {kind:"skybox",candidateId:"poly-haven:sky"}, {kind:"material",entityId:"target",candidateId:"ambient-cg:ground"}, {kind:"audio",entityId:"bgm",candidateId:"otogura:birds"},
    {kind:"material",entityId:"target",candidateId:"project:local-material"}, {kind:"catalog",candidateId:"builtin:props:bench",position:[2,0,1]},
  ]});
  assert.deepEqual(chatgptAssetRequests(plan),[
    {providerId:"poly-haven",externalId:"same",kind:"model"}, {providerId:"ai-lowpoly-props",externalId:"same",kind:"model"},
    {providerId:"poly-haven",externalId:"sky",kind:"hdri"}, {providerId:"ambient-cg",externalId:"ground",kind:"texture"}, {providerId:"otogura",externalId:"birds",kind:"audio"},
  ]);
  const seven = Array.from({length:7},(_,i)=>({providerId:"ai-lowpoly-props",externalId:`prop${i}`,assetKind:"model"}));
  assert.throws(()=>parse({...noOp,objects:seven.map(a=>obj("model",`ai-lowpoly-props:${a.externalId}`))},seven));
});
test("resource references reject URLs, unavailable provider formats, wrong actions and ambiguous components", () => {
  for (const plan of [
    {...noOp,objects:[obj("model","https://example.invalid/model.glb")]},
    {...noOp,objects:[obj("model","ambient-cg:ground")]},
    {...noOp,objects:[{...obj("box",undefined),materialExternalId:"builtin:material:glass"}]},
    {...noOp,operations:[{kind:"skybox",candidateId:"project:local-material"}]},
    {...noOp,operations:[{kind:"material",entityId:"target",candidateId:"builtin:sky:night"}]},
    {...noOp,operations:[{kind:"audio",entityId:"target",volume:0.2}]},
    {...noOp,operations:[{kind:"audio",entityId:"target",componentId:"source",volume:0.2}]},
    {...noOp,operations:[{kind:"mesh-collision",entityId:"another-scene",action:"add"}]},
    {...noOp,operations:[{kind:"skybox",enabled:null,exposure:null}]},
    {...noOp,objects:Array(32).fill(obj("box",undefined)),operations:[{kind:"skybox",enabled:false}]},
  ]) assert.throws(()=>parse(plan),/編集プランを確認できませんでした/);
  assert.throws(()=>parse({...noOp,objects:[obj("model","ambient-cg:mesh")]},[{providerId:"ambient-cg",externalId:"mesh",assetKind:"model"}]));
  const ambiguous = {...resources,components:[...resources.components,{entityId:"bgm",componentId:"second",type:"audio-source"}]};
  assert.throws(()=>parseChatgptWorldPlan(JSON.stringify({...noOp,operations:[{kind:"audio",entityId:"bgm",volume:0.2}]}),[],false,["bgm"],ambiguous));
  assert.doesNotThrow(()=>parse({...noOp,operations:[{kind:"skybox",candidateId:"project:local-sky"},{kind:"audio",entityId:"bgm",componentId:"source",volume:0.2}]}));
});
test("audio Plan volume stays within the range the editor can apply", () => {
  for (const volume of [0, 0.35, 1]) assert.doesNotThrow(() => parse({ ...noOp, operations: [{ kind: "audio", entityId: "bgm", volume }] }));
  for (const volume of [-0.01, 1.01, 4]) assert.throws(() => parse({ ...noOp, operations: [{ kind: "audio", entityId: "bgm", volume }] }), /編集プランを確認できませんでした/);
});
function imported() {
  let bundle = createChatgptScaffold(noOp,"resource-regression"); const ids = new Map();
  for (const asset of [{providerId:"poly-haven",externalId:"chair",assetKind:"model",role:"model",format:"gltf"},{providerId:"otogura",externalId:"birds",assetKind:"audio",role:"audio",format:"wav"}]) {
    const applied=applyExternalStoreInstall(bundle.assets,{...asset,providerName:asset.providerId,name:asset.externalId,resolution:"src",files:[{role:asset.role,format:asset.format,relativePath:`assets/${asset.externalId}.${asset.format}`,byteLength:32,sha256:"a".repeat(64)}],authors:[],assetUrl:"",licenseName:"CC0 1.0",licenseUrl:""});
    bundle={...bundle,assets:applied.manifest}; ids.set(`${asset.providerId}:${asset.externalId}`,applied.primaryAssetId);
  }
  const modelId=ids.get("poly-haven:chair");
  bundle={...bundle,assets:{...bundle.assets,assets:{...bundle.assets.assets,[modelId]:{...bundle.assets.assets[modelId],importMetadata:{sourceFormat:"gltf",byteLength:32,nodeCount:1,meshCount:1,primitiveCount:1,bounds:{min:[-1,0,-.5],max:[1,1,.5],center:[0,.5,0],size:[2,1,1],boundingSphereRadius:1.225},animations:[],extensionsUsed:[],extensionsRequired:[]}}}}};
  return {bundle,ids,modelId};
}
const serialize = bundle => serializeVisualProjectDocuments({project:bundle.project,scenes:{[bundle.scene.sceneId]:bundle.scene},assets:bundle.assets,prefabs:bundle.prefabs});
test("Skybox, BGM and Mesh Collision use ordinary MCP transactions without mutating their source", async () => {
  const {bundle:initial,ids}=imported();
  let bundle=placeChatgptObject(initial,obj("audio","otogura:birds"),ids).bundle;
  const bgm=Object.values(bundle.scene.entities).find(e=>e.components.some(c=>c.type==="audio-source"));
  const primitive=placeChatgptObject(bundle,obj("box",undefined),ids); bundle=primitive.bundle;
  const source=bgm.components.find(c=>c.type==="audio-source"); const original=JSON.stringify(bundle);
  const local={projectAssets:[],builtinCandidates:[],components:[{entityId:bgm.id,componentId:source.id,type:"audio-source"}]};
  const sky=await applyChatgptOperation(bundle,{kind:"skybox",enabled:false,iblEnabled:false,rotationDegrees:45,exposure:0.7},ids,local);
  assert.equal(sky.bundle.scene.settings.skybox.enabled,false); assert.equal(sky.bundle.scene.settings.skybox.rotationDegrees,45);
  assert.equal(sky.bundle.assets,bundle.assets); assert.equal(sky.bundle.scene.entities,bundle.scene.entities);
  const sound=await applyChatgptOperation(sky.bundle,{kind:"audio",entityId:bgm.id,componentId:source.id,volume:0.1,loop:false,spatial:true},ids,local);
  const changed=sound.bundle.scene.entities[bgm.id].components.find(c=>c.id===source.id);
  assert.equal(changed.audioAssetId,source.audioAssetId); assert.equal(changed.volume,0.1); assert.equal(changed.spatial,true); assert.equal(changed.loop,false);
  assert.equal(sound.bundle.scene.entities[primitive.entityId],bundle.scene.entities[primitive.entityId]);
  const collided=await applyChatgptOperation(sound.bundle,{kind:"mesh-collision",entityId:primitive.entityId,action:"add"},ids,local);
  assert.ok(collided.bundle.scene.entities[primitive.entityId].components.some(c=>c.type==="collider"&&c.shape==="mesh"&&c.enabled));
  assert.equal(collided.bundle.project.projectId,bundle.project.projectId); assert.deepEqual(collided.bundle.project.scenePaths,bundle.project.scenePaths); assert.equal(collided.bundle.project.metadata.title,bundle.project.metadata.title); assert.equal(JSON.stringify(bundle),original); assert.doesNotThrow(()=>serialize(collided.bundle));
});
test("model attachment preserves existing and empty Entity names, transforms and unrelated components", async () => {
  const {bundle:initial,ids,modelId}=imported();
  const primitive=placeChatgptObject(initial,{...obj("box",undefined),name:"既存Entity",position:[2,3,4],rotation:[0,90,0],scale:[2,1,3]},ids);
  const created=createEmptyEntity(primitive.bundle.scene,null,"空Entity"); assert.ok(created);
  let bundle={...primitive.bundle,scene:created.scene};
  const local={projectAssets:[{id:modelId,kind:"model",name:"Chair"}],builtinCandidates:[],components:[]}; const original=JSON.stringify(bundle);
  for (const entityId of [primitive.entityId,created.entityId]) {
    const before=bundle.scene.entities[entityId]; const tf=before.components.find(c=>c.type==="transform");
    const out=await applyChatgptOperation(bundle,{kind:"model-attachment",entityId,candidateId:`project:${modelId}`},new Map(),local);
    const after=out.bundle.scene.entities[entityId]; assert.equal(after.id,before.id); assert.equal(after.name,before.name); assert.deepEqual(after.components.find(c=>c.type==="transform"),tf);
    for (const c of before.components.filter(c=>c.type!=="mesh")) {
      const next=after.components.find(v=>v.id===c.id);
      if (c.type==="collider" && c.shape==="box" && c.fitMode==="auto") {
        assert.deepEqual({...next,center:c.center,halfExtents:c.halfExtents},c);
        assert.deepEqual(next.center,[0,.5,0]); assert.deepEqual(next.halfExtents,[1,.5,.5]);
      } else assert.deepEqual(next,c);
    }
    assert.equal(after.components.find(c=>c.type==="mesh").geometryAssetId,modelId); assert.equal(out.entityId,entityId); bundle=out.bundle;
  }
  assert.equal(JSON.stringify({...primitive.bundle,scene:created.scene}),original); assert.doesNotThrow(()=>serialize(bundle));
  const snapshot=JSON.stringify(bundle); await assert.rejects(()=>applyChatgptOperation(bundle,{kind:"model-attachment",entityId:created.entityId,candidateId:"ai-lowpoly-props:missing"},ids,local)); assert.equal(JSON.stringify(bundle),snapshot);
});
test("adding BGM to an empty Entity preserves its identity and rejects missing audio atomically", async () => {
  const {bundle:initial,ids}=imported(); const created=createEmptyEntity(initial.scene,null,"BGM用Entity");
  const bundle={...initial,scene:created.scene}; const original=JSON.stringify(bundle); const local={projectAssets:[],builtinCandidates:[],components:[]};
  const out=await applyChatgptOperation(bundle,{kind:"audio",entityId:created.entityId,candidateId:"otogura:birds",volume:0.2,spatial:false,loop:true,autoplay:true},ids,local);
  const entity=out.bundle.scene.entities[created.entityId]; assert.equal(entity.name,"BGM用Entity");
  assert.deepEqual(entity.components.find(c=>c.type==="transform"),created.scene.entities[created.entityId].components.find(c=>c.type==="transform"));
  const source=entity.components.find(c=>c.type==="audio-source"); assert.equal(source.audioAssetId,ids.get("otogura:birds")); assert.equal(source.volume,0.2); assert.equal(source.spatial,false); assert.equal(source.loop,true); assert.equal(source.autoplay,true);
  assert.equal(JSON.stringify(bundle),original); assert.doesNotThrow(()=>serialize(out.bundle));
  await assert.rejects(()=>applyChatgptOperation(bundle,{kind:"audio",entityId:created.entityId,volume:0.1},ids,local)); assert.equal(JSON.stringify(bundle),original);
});
test("unspecified primitive material never inherits an existing Sky Shader and reuses only normal default PBR", () => {
  const initial=createChatgptScaffold(noOp,"primitive-default");
  const sky=createDefaultMaterialAsset({id:"authored-sky",name:"Sky",properties:{shader:SKY_SHADER_CATALOG[0].shader}}); assert.ok(sky);
  const bundle={...initial,assets:{...initial.assets,assets:{[sky.id]:sky}}}; const snapshot=JSON.stringify(bundle);
  const first=placeChatgptObject(bundle,obj("box",undefined),new Map());
  const materialId=first.bundle.scene.entities[first.entityId].components.find(c=>c.type==="mesh").materialBindings[0].materialAssetId;
  assert.notEqual(materialId,sky.id); assert.deepEqual(first.bundle.assets.assets[materialId].properties,normalizeMaterialProperties({pbrMetallicRoughness:{baseColorFactor:[.82,.84,.9,1],metallicFactor:0,roughnessFactor:.65}}));
  const second=placeChatgptObject(first.bundle,obj("sphere",undefined),new Map());
  assert.equal(second.bundle.scene.entities[second.entityId].components.find(c=>c.type==="mesh").materialBindings[0].materialAssetId,materialId);
  assert.equal(second.bundle.assets.assets[sky.id],sky); assert.equal(Object.values(second.bundle.assets.assets).filter(a=>a.kind==="material").length,2);
  assert.equal(JSON.stringify(bundle),snapshot); assert.doesNotThrow(()=>serialize(second.bundle));
});
