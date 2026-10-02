// Tests the actual document factories, persistence, compiler and shipped Rapier
// WASM. It does not claim pixel, WebGL, or native Tauri coverage.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { Euler, Quaternion } from "three";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  configFile: false,
  cacheDir: ".cache/starting-template-tests",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
});
after(() => server.close());
const load = (name) => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const starter = await load("starter-templates");
const sceneTools = await load("scene-document");
const { ensureBuiltinMaterialAsset, createPrototypeProject, BUILTIN_PRIMITIVE_ASSETS } = await load("prototype-project");
const { BUILTIN_PRIMITIVE_CREATION_IDS, getBuiltinPrimitiveCreation } = await load("creation-catalog");
const { serializeVisualProjectDocuments, parseVisualProjectFiles } = await load("persistence");
const { browserProjectDocumentFiles } = await load("browser-project-transfer");
const { compileVisualProject } = await load("compiler/compile");
const { setMeshCollision } = await load("mesh-collision-actions");
const { WORLD_PLAY_PLAYER_HALF_HEIGHT, WORLD_PLAY_PLAYER_RADIUS, WORLD_PLAY_CAPSULE_GROUND_OFFSET, resolveWorldPlayCapsuleSpawn } = await server.ssrLoadModule("/src/components/visual-editor/world-play-spawn.ts");
const { MeshCollisionControls } = await server.ssrLoadModule("/src/components/visual-editor/MeshCollisionControls.tsx");
const documents = (bundle) => ({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs });
const blank = () => starter.createStarterVisualProject("world", starter.defaultVisualStarterTemplateId("world"), "minimal-world");
const transform = (entity) => entity.components.find((c) => c.type === "transform");
const collider = (entity) => entity.components.find((c) => c.type === "collider");

function addedPlane(bundle = blank()) {
  const definition = getBuiltinPrimitiveCreation(BUILTIN_PRIMITIVE_CREATION_IDS.plane);
  const assets = ensureBuiltinMaterialAsset(bundle.assets, definition.preferredMaterialAssetId);
  const added = sceneTools.addBuiltinPrimitiveEntity(bundle.scene, assets, definition.creationId, definition.preferredMaterialAssetId);
  assert.ok(added);
  return { ...bundle, assets, scene: added.scene, entity: added.scene.entities[added.entityId] };
}

test("new World exposes four useful root Entities and only their two Materials", () => {
  const bundle = blank();
  const entities = Object.values(bundle.scene.entities);
  assert.deepEqual(bundle.scene.rootEntityIds.map((id) => bundle.scene.entities[id].name), ["Plane", "Box", "Light", "SpawnPoint"]);
  assert.equal(entities.length, 4);
  assert.ok(entities.every((entity) => entity.parentId === null && entity.children.length === 0));
  assert.deepEqual(Object.values(bundle.assets.assets).map((asset) => asset.name), ["Plane Material", "Box Material"]);
  assert.deepEqual(bundle.assets.folders, {});
  assert.deepEqual(bundle.prefabs, {});
  assert.deepEqual(bundle.bundledAssetCopies, []);
  const referenced = new Set(entities.flatMap((e) => e.components.flatMap((c) => c.type === "mesh" ? c.materialBindings.map((binding) => binding.materialAssetId) : [])));
  assert.deepEqual([...referenced].sort(), Object.keys(bundle.assets.assets).sort());
  const floor = bundle.scene.entities["starter-floor"];
  assert.equal(collider(floor).shape, "box");
  assert.deepEqual(transform(floor).scale, [8, 8, 1]);
  assert.deepEqual(collider(floor).halfExtents, [0.5, 0.5, 0.01]);
  const spawn = bundle.scene.entities["starter-spawn"];
  assert.ok(spawn.components.some((c) => c.type === "xrift-component" && c.schemaId === "xrift.spawn-point"));
  assert.ok(Math.abs(transform(spawn).position[2]) < transform(floor).scale[1] / 2 - 0.5, "SpawnPoint has margin from the edge");
});

test("browser and fallback creation use the same starter entry point as desktop", async () => {
  const browser = await fs.readFile("src/BrowserEditorApp.tsx", "utf8");
  assert.match(browser, /createStarterVisualProject\(projectKind, defaultVisualStarterTemplateId\(projectKind\), name\)/);
  assert.doesNotMatch(browser, /createPrototypeProject/);
  const editor = await fs.readFile("src/components/visual-editor/VisualEditorPrototype.tsx", "utf8");
  assert.match(editor, /sourceBundle \?\? createStarterVisualProject/);
});

test("new Item keeps its used Material without seeding the entire palette", () => {
  const item = starter.createStarterVisualProject("item", starter.defaultVisualStarterTemplateId("item"), "minimal-item");
  const used = new Set(Object.values(item.scene.entities).flatMap((e) => e.components.flatMap((c) => c.type === "mesh" ? c.materialBindings.map((b) => b.materialAssetId) : [])));
  assert.equal(used.size, 1);
  assert.deepEqual(Object.keys(item.assets.assets), [...used]);
  assert.deepEqual(item.bundledAssetCopies, []);
  assert.equal(compileVisualProject(documents(item)).canStage, true);
});

test("Plane creation uses one thin Box Collider and resolves its Material on demand", () => {
  const bundle = addedPlane();
  assert.equal(bundle.entity.name, "Plane");
  assert.deepEqual(transform(bundle.entity).scale, [6, 6, 1]);
  assert.equal(collider(bundle.entity).shape, "box");
  assert.deepEqual(collider(bundle.entity).halfExtents, [0.5, 0.5, 0.01]);
  assert.equal(bundle.entity.components.filter((c) => c.type === "collider").length, 1);
  assert.equal(Object.keys(bundle.assets.assets).length, 3);
  const twice = addedPlane(bundle);
  assert.equal(Object.keys(twice.assets.assets).length, 3, "repeated creation reuses its Material");
});

test("placing a legacy Plane Asset also creates a thin Box without changing saved Planes", () => {
  const bundle = createPrototypeProject("world", "legacy-plane");
  const planeAsset = BUILTIN_PRIMITIVE_ASSETS.find((asset) => asset.primitive === "plane");
  const assets = { ...bundle.assets, assets: { ...bundle.assets.assets, [planeAsset.id]: planeAsset } };
  const before = JSON.stringify(bundle.scene);
  const added = sceneTools.addBuiltinAssetEntity(bundle.scene, assets, planeAsset.id);
  const entity = added.scene.entities[added.entityId];
  assert.deepEqual(transform(entity).scale, [6, 6, 1]);
  assert.equal(collider(entity).shape, "box");
  assert.equal(JSON.stringify(bundle.scene), before);
  assert.deepEqual(transform(added.scene.entities["entity-world-floor"]).scale, [6, 6, 6]);
});

test("explicit Mesh Collider conversion remains available, single and undo-safe", () => {
  const bundle = addedPlane();
  const before = JSON.stringify(bundle.scene);
  let scene = setMeshCollision(bundle.scene, bundle.entity.id, "add");
  for (let i = 0; i < 3; i++) scene = setMeshCollision(scene, bundle.entity.id, "add");
  const active = scene.entities[bundle.entity.id].components.filter((c) => c.type === "collider" && c.enabled);
  assert.equal(active.length, 1);
  assert.equal(active[0].shape, "mesh");
  assert.equal(JSON.stringify(bundle.scene), before);
  assert.equal(collider(scene.entities["starter-floor"]).shape, "box");
  const html = renderToStaticMarkup(createElement(MeshCollisionControls, { scene: bundle.scene, entity: bundle.entity, readOnly: false, onAction() {} }));
  assert.match(html, /Box Collider/);
  assert.match(html, /固定Mesh Colliderにする/);
  assert.match(html, /既存設定を無効/);
  assert.doesNotMatch(html, />Colliderを追加</);
});

test("new and legacy projects round-trip without rewriting legacy hierarchy or explicit Mesh Collider", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  const storage = await server.ssrLoadModule("/src/lib/browser-project-storage.ts");
  const legacy = createPrototypeProject("world", "legacy-world");
  legacy.scene.entities["legacy-environment"] = {
    id: "legacy-environment", name: "Environment", parentId: null,
    children: ["entity-world-floor"], enabled: true,
    components: [sceneTools.createTransformComponent("legacy-environment-transform")],
  };
  legacy.scene.rootEntityIds = [...legacy.scene.rootEntityIds.filter((id) => id !== "entity-world-floor"), "legacy-environment"];
  legacy.scene.entities["entity-world-floor"].parentId = "legacy-environment";
  legacy.scene.entities["entity-world-floor"].name = "My existing floor";
  legacy.scene = setMeshCollision(legacy.scene, "entity-world-floor", "add");
  legacy.scene.entities["entity-world-floor"].components.find((c) => c.type === "collider" && c.shape === "mesh").meshMode = "convex";
  assert.equal(Object.keys(legacy.assets.assets).length, 10);
  for (const bundle of [blank(), legacy]) {
    const original = JSON.parse(JSON.stringify(documents(bundle)));
    const path = await storage.createBrowserProject(browserProjectDocumentFiles(original), { activate: false });
    const restored = parseVisualProjectFiles(await storage.readBrowserVisualProject(path));
    assert.deepEqual(restored, original);
    await storage.saveBrowserVisualProject(path, serializeVisualProjectDocuments(restored));
    assert.deepEqual(parseVisualProjectFiles(await storage.readBrowserVisualProject(path)), original);
  }
});

test("all starter fixtures still compile and preserve the official sample", async () => {
  const { runStarterTemplateFixtureAssertions } = await load("starter-templates.fixture");
  runStarterTemplateFixtureAssertions();
  for (const bundle of [blank(), addedPlane()]) {
    const result = compileVisualProject(documents(bundle), { outputMode: "classic-jsx" });
    assert.equal(result.canStage, true, JSON.stringify(result.diagnostics));
    const source = result.overlayFiles.map((artifact) => artifact.content).join("\n");
    assert.match(source, /CuboidCollider args=\{\[0.5, 0.5, 0.01\]\}/);
    assert.doesNotMatch(source, /<XRiftStudioMeshColliders type="trimesh"/);
    const runtime = compileVisualProject(documents(bundle), { outputMode: "classic-runtime" });
    assert.equal(runtime.canStage, true, JSON.stringify(runtime.diagnostics));
    const manifest = JSON.parse(runtime.runtimeManifestFile.content);
    const entities = manifest.scenes[manifest.entryScene].entities;
    assert.equal(collider(entities["starter-floor"]).shape, "box");
    assert.deepEqual(collider(entities["starter-floor"]).halfExtents, [0.5, 0.5, 0.01]);
    if (bundle.entity) assert.equal(collider(entities[bundle.entity.id]).shape, "box");
  }
});

const shell = new URL("../public/xrift-runtime-shell/", import.meta.url);
const rapierNames = (await fs.readdir(shell)).filter((name) => /^rapier-.*\.js$/.test(name));
assert.equal(rapierNames.length, 1);
const R = (await import(new URL(rapierNames[0], shell).href)).default;
await R.init();

function physicalFloor(world, entity) {
  const t = transform(entity), c = collider(entity);
  const q = new Quaternion().setFromEuler(new Euler(...t.rotation));
  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...t.position).setRotation(q));
  world.createCollider(R.ColliderDesc.cuboid(...c.halfExtents.map((h, axis) => h * Math.abs(t.scale[axis]))).setFriction(c.friction).setRestitution(c.restitution), body);
}
function capsule(world, x, y, z) {
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCanSleep(false));
  world.createCollider(R.ColliderDesc.capsule(WORLD_PLAY_PLAYER_HALF_HEIGHT, WORLD_PLAY_PLAYER_RADIUS).setRestitution(0), body);
  return body;
}
for (const [name, floor, x, z, expectedY] of [
  ["template Plane", blank().scene.entities["starter-floor"], 0, 3, WORLD_PLAY_CAPSULE_GROUND_OFFSET + 0.01],
  ["added Plane", addedPlane().entity, 2, 0, WORLD_PLAY_CAPSULE_GROUND_OFFSET + 0.01],
  ["translated scaled Plane", (() => { const e = addedPlane().entity; Object.assign(transform(e), { position: [7, 2, -4], scale: [-3, 2, 1] }); return e; })(), 7, -4, WORLD_PLAY_CAPSULE_GROUND_OFFSET + 2.01],
]) {
  test(`Rapier ${R.version()}: ${name} supports a capsule at its thin top surface`, () => {
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    try {
      physicalFloor(world, floor);
      const player = capsule(world, x, expectedY + 3, z);
      const outside = capsule(world, x + 10, expectedY + 3, z);
      for (let frame = 0; frame < 240; frame++) world.step();
      assert.ok(Math.abs(player.translation().y - expectedY) < 0.04, `contact height ${player.translation().y}`);
      assert.ok(outside.translation().y < -5, "no invisible floor outside bounds");
    } finally { world.free(); }
  });
}


test("the Play-sized character starts above the Plane and becomes grounded", () => {
  const bundle = blank();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    physicalFloor(world, bundle.scene.entities["starter-floor"]);
    const spawn = resolveWorldPlayCapsuleSpawn(transform(bundle.scene.entities["starter-spawn"]).position);
    assert.ok(spawn[1] - WORLD_PLAY_CAPSULE_GROUND_OFFSET > 0.01, "capsule starts fully above the floor");
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...spawn));
    const shape = world.createCollider(R.ColliderDesc.capsule(WORLD_PLAY_PLAYER_HALF_HEIGHT, WORLD_PLAY_PLAYER_RADIUS), body);
    const controller = world.createCharacterController(0.01);
    for (let frame = 0; frame < 180; frame++) {
      world.step();
      controller.computeColliderMovement(shape, { x: 0, y: -0.05, z: 0 });
      const pos = body.translation(), move = controller.computedMovement();
      body.setNextKinematicTranslation({ x: pos.x + move.x, y: pos.y + move.y, z: pos.z + move.z });
    }
    world.step();
    assert.equal(controller.computedGrounded(), true);
    assert.ok(Math.abs(body.translation().y - WORLD_PLAY_CAPSULE_GROUND_OFFSET - 0.02) < 0.04);
    world.removeCharacterController(controller);
  } finally { world.free(); }
});
