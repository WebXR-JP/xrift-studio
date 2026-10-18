import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-chatgpt-operation-registry-test",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createSceneOperationRegistry } = await load("chatgpt-operation-registry");
const { applyChatgptOperation, CHATGPT_SCENE_OPERATION_KINDS, createChatgptScaffold, placeChatgptObject } = await load("chatgpt-generation");
const { createEmptyEntity } = await load("editor-session");
const { createDefaultMaterialAsset } = await load("asset-manifest");
const resources = extra => ({ projectAssets: [], builtinCandidates: [], components: [], ...extra });
const blank = () => createChatgptScaffold({ title: "街の制作", description: "", objects: [] }, "operation-registry-isolated-fixture");
const apply = (bundle, operation, context = resources(), execution) => applyChatgptOperation(bundle, operation, new Map(), context, undefined, undefined, execution);
const errorCode = code => error => error.code === code;

test("a trusted host provides one handler per exact kind and can replace its own tool environment", async () => {
  const calls = [];
  const registry = createSceneOperationRegistry({ kinds: ["place", "inspect"], plugins: [
    { kind: "place", requiredCapabilities: ["write"], execute: (operation, host) => { calls.push([operation.kind, host.id]); return host.place(operation.name); } },
    { kind: "inspect", requiredCapabilities: [], execute: (_operation, host) => host.inspect() },
  ] });
  assert.deepEqual(registry.kinds, ["place", "inspect"]);
  assert.equal(Object.isFrozen(registry.kinds), true);
  const one = { id: "editor-1", place: name => `saved:${name}`, inspect: () => "current-1" };
  const two = { id: "editor-2", place: name => `other:${name}`, inspect: () => "current-2" };
  assert.equal(await registry.dispatch({ kind: "place", name: "家" }, one, new Set(["write"])), "saved:家");
  assert.equal(await registry.dispatch({ kind: "inspect" }, two, new Set()), "current-2");
  assert.deepEqual(calls, [["place", "editor-1"]]);
  for (const operation of [{ kind: "exec", command: "untrusted" }, { kind: "constructor" }, { kind: "__proto__" }, Object.create({ kind: "place" }), null]) {
    await assert.rejects(registry.dispatch(operation, one, new Set(["write"])), errorCode("UNKNOWN_OPERATION"));
  }
  assert.equal(calls.length, 1, "unknown discriminants never reach a handler");
});

test("duplicate, unknown and missing plugin registrations fail before any dispatch", () => {
  const plugin = { kind: "place", requiredCapabilities: [], execute() { throw new Error("must not execute"); } };
  assert.throws(() => createSceneOperationRegistry({ kinds: ["place", "place"], plugins: [plugin] }), errorCode("DUPLICATE_OPERATION"));
  assert.throws(() => createSceneOperationRegistry({ kinds: ["place"], plugins: [plugin, plugin] }), errorCode("DUPLICATE_OPERATION"));
  assert.throws(() => createSceneOperationRegistry({ kinds: ["place"], plugins: [{ ...plugin, kind: "shell" }] }), errorCode("UNKNOWN_OPERATION"));
  assert.throws(() => createSceneOperationRegistry({ kinds: ["place", "inspect"], plugins: [plugin] }), errorCode("MISSING_OPERATION"));
});

test("explicit static and conditional capabilities are checked before handler work", async () => {
  const grants = ["write"];
  let called = 0;
  const registry = createSceneOperationRegistry({ kinds: ["edit", "import"], plugins: [
    { kind: "edit", requiredCapabilities: grants, execute: () => ++called },
    { kind: "import", requiredCapabilities: (_operation, host) => host.external ? ["write", "project-files"] : ["write"], execute: () => ++called },
  ] });
  grants.length = 0;
  await assert.rejects(registry.dispatch({ kind: "edit" }, {}, new Set()), error => error.code === "CAPABILITY_REQUIRED" && error.capability === "write");
  await assert.rejects(registry.dispatch({ kind: "import" }, { external: true }, new Set(["write"])), error => error.code === "CAPABILITY_REQUIRED" && error.capability === "project-files");
  assert.equal(called, 0);
  assert.equal(await registry.dispatch({ kind: "import" }, { external: false }, new Set(["write"])), 1);
});

test("the shipped Scene tools have a finite exhaustive surface and unknown operations cannot fall through to audio", async () => {
  assert.equal(new Set(CHATGPT_SCENE_OPERATION_KINDS).size, 15);
  const bundle = blank(), before = JSON.stringify(bundle);
  for (const kind of ["shell", "create_document_asset", "constructor", "__proto__", "dynamic-import"]) {
    await assert.rejects(apply(bundle, { kind, entityId: bundle.scene.rootEntityIds[0], volume: 0.2 }), /対応していないScene操作/);
  }
  assert.equal(JSON.stringify(bundle), before);
});

test("the compatibility adapter checks code, Blender and project-file capabilities before authoring", async () => {
  const bundle = blank(), before = JSON.stringify(bundle);
  await assert.rejects(apply(bundle, { kind: "r3f-scene", name: "街", source: "untrusted source must not be parsed" }, resources({ modelSource: "store" })), /制作環境/);
  await assert.rejects(apply(bundle, { kind: "blender-model", model: { name: "家", brief: "a house" }, position: [0, 0, 0] }, resources({ blenderAvailable: false })), /制作環境/);
  const builtin = { candidateId: "builtin:material:test", actions: ["material"], name: "壁", providerId: "builtin", description: "" };
  await assert.rejects(apply(bundle, { kind: "material-scene", candidateId: builtin.candidateId }, resources({ builtinCandidates: [builtin] })), /制作環境/);
  assert.equal(JSON.stringify(bundle), before);
});

test("editor Component, Material, Scene, collision and audio tools keep the existing native edit boundary", async () => {
  let bundle = blank();
  const created = createEmptyEntity(bundle.scene, null, "House");
  bundle = { ...bundle, scene: created.scene };
  const id = created.entityId, original = bundle.scene.entities[id];
  const light = await apply(bundle, { kind: "component-add", entityId: id, definitionId: "core.light.point", propertiesJson: JSON.stringify({ intensity: 2 }) });
  assert.equal(bundle.scene.entities[id], original, "input Entity remains unchanged");
  const component = light.bundle.scene.entities[id].components.find(value => value.type === "light");
  assert.ok(component);
  const adjusted = await apply(light.bundle, { kind: "component-update", entityId: id, componentId: component.id, propertiesJson: JSON.stringify({ intensity: 3 }) });
  assert.equal(adjusted.bundle.scene.entities[id].components.find(value => value.id === component.id).intensity, 3);
  const removed = await apply(adjusted.bundle, { kind: "component-remove", entityId: id, componentId: component.id });
  assert.equal(removed.bundle.scene.entities[id].components.some(value => value.id === component.id), false);
  let withMaterial = { ...removed.bundle, assets: { ...removed.bundle.assets, assets: { ...removed.bundle.assets.assets,
    "operation-wall": createDefaultMaterialAsset({ id: "operation-wall", name: "壁" }),
  } } };
  const material = await apply(withMaterial, { kind: "material-update", candidateId: "project:operation-wall", propertiesJson: JSON.stringify({ roughness: 0.8 }) });
  assert.equal(material.bundle.assets.assets["operation-wall"].properties.roughness, 0.8);
  assert.equal(material.bundle.scene, withMaterial.scene);
  const sky = await apply(material.bundle, { kind: "skybox", enabled: false, iblEnabled: false, exposure: 0.75 });
  assert.equal(sky.bundle.scene.settings.skybox.exposure, 0.75);
  const settings = await apply(sky.bundle, { kind: "scene-settings", settingsJson: JSON.stringify({ fog: { enabled: true } }) });
  assert.equal(settings.bundle.scene.settings.fog.enabled, true);
  const audio = await apply(settings.bundle, { kind: "component-add", entityId: id, definitionId: "core.audio-source" });
  const sound = await apply(audio.bundle, { kind: "audio", entityId: id, volume: 0.2, loop: true });
  assert.equal(sound.bundle.scene.entities[id].components.find(value => value.type === "audio-source").volume, 0.2);
  const primitive = placeChatgptObject(sound.bundle, { name: "Floor", shape: "box", position: [0, 0, 0], scale: [4, 0.1, 4] }, new Map());
  const collision = await apply(primitive.bundle, { kind: "mesh-collision", entityId: primitive.entityId, action: "add" });
  assert.ok(collision.bundle.scene.entities[primitive.entityId].components.some(value => value.type === "collider" && value.shape === "mesh" && value.enabled));
  const deleted = await apply(collision.bundle, { kind: "entity-delete", entityId: id });
  assert.equal(deleted.bundle.scene.entities[id], undefined);
  assert.ok(deleted.bundle.scene.entities[primitive.entityId]);
});

test("code-authored Scene originals, stable IDs and manual overrides survive registry dispatch", async () => {
  const source = height => `export default function World(){return <group name="Street"><mesh name="House" key="house"><boxGeometry args={[3,${height},4]}/><meshStandardMaterial color="#d5b98b" roughness={0.8}/></mesh></group>}`;
  const one = await apply(blank(), { kind: "r3f-scene", name: "通り", source: source(3) });
  const metadata = one.bundle.scene.entities[one.entityId].codeAuthoring;
  const houseId = Object.values(metadata.nodes).find(value => JSON.parse(value.baseline).name === "House").entityId;
  const edited = structuredClone(one.bundle);
  edited.scene.entities[houseId].components.find(value => value.type === "transform").position[0] = 12;
  const two = await apply(edited, { kind: "r3f-scene", entityId: one.entityId, name: "通り", source: source(5) });
  assert.equal(two.entityId, one.entityId);
  assert.equal(two.bundle.scene.entities[houseId].components.find(value => value.type === "transform").position[0], 12);
  assert.deepEqual(two.bundle.scene.entities[houseId].components.find(value => value.type === "transform").scale, [3, 5, 4]);
  assert.equal(two.bundle.scene.entities[one.entityId].codeAuthoring.source, source(5));
});

test("cancellation is checked before tool work and again before an async adapter returns a result", async () => {
  const bundle = blank(), before = JSON.stringify(bundle), stop = new Error("stopped");
  const operation = { kind: "scene-settings", settingsJson: JSON.stringify({ fog: { enabled: true } }) };
  await assert.rejects(apply(bundle, operation, resources(), { checkCurrent() { throw stop; } }), error => error === stop);
  let checks = 0;
  await assert.rejects(apply(bundle, operation, resources(), { checkCurrent() { if (++checks === 3) throw stop; } }), error => error === stop);
  assert.equal(checks, 3);
  assert.equal(JSON.stringify(bundle), before, "stopped in-memory results cannot mutate the caller's saved Scene");
});
