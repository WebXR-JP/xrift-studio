import { colliderModelNode, collisionSources, setMeshCollision } from "./mesh-collision-actions";
import { createPrototypeProject } from "./prototype-project";
import { getBuiltinPrimitiveCreation } from "./creation-catalog";
import { createBuiltinPrimitiveMeshComponent, createBoxColliderComponent, createMeshColliderComponent, createRigidBodyComponent, createTransformComponent, type SceneDocument, type SceneEntity } from "./scene-document";

export function runMeshCollisionActionsFixtureAssertions() {
  let assertions = 0;
  const assert = (condition: unknown, message: string) => { assertions++; if (!condition) throw new Error(`Mesh collision actions: ${message}`); };
  const base = createPrototypeProject("world", "当たり判定確認").scene;
  const cube = getBuiltinPrimitiveCreation("builtin-primitive/box")!;
  const entity = (id: string, parentId: string | null = null): SceneEntity => ({ id, name: id, parentId, children: [], enabled: true, components: [createTransformComponent(`${id}:transform`), createBuiltinPrimitiveMeshComponent(`${id}:mesh`, cube, [])] });
  const sceneOf = (...items: SceneEntity[]): SceneDocument => ({ ...base, entities: Object.fromEntries(items.map((e) => [e.id, e])), rootEntityIds: items.filter((e) => !e.parentId).map((e) => e.id) });
  const activeMeshes = (scene: SceneDocument, id: string) => scene.entities[id]!.components.filter((c) => c.type === "collider" && c.shape === "mesh" && c.enabled);
  const activeBodies = (scene: SceneDocument, id: string) => scene.entities[id]!.components.filter((c) => c.type === "rigid-body" && c.enabled);
  const rejectWithoutMutation = (scene: SceneDocument, id: string, action: "add" | "remove") => {
    const before = JSON.stringify(scene); let thrown = false;
    try { setMeshCollision(scene, id, action); } catch { thrown = true; }
    assert(thrown, `reject unsupported ${id}:${action}`);
    assert(JSON.stringify(scene) === before, "rejection leaves history untouched");
  };
  const floor = entity("floor"), other = entity("other");
  const initial = sceneOf(floor, other), initialJson = JSON.stringify(initial);
  let scene = setMeshCollision(initial, floor.id, "add");
  assert(activeMeshes(scene, "floor").length === 1, "add creates one mesh collider");
  assert(activeBodies(scene, "floor").length === 1, "add creates one body");
  assert(scene.entities.other === other, "unrelated Entity keeps identity");
  assert(JSON.stringify(initial) === initialJson, "add is immutable for Undo");
  const colliderId = activeMeshes(scene, "floor")[0]!.id;
  for (let i = 0; i < 4; i++) {
    scene = setMeshCollision(scene, "floor", "add");
    assert(activeMeshes(scene, "floor").length === 1 && activeMeshes(scene, "floor")[0]!.id === colliderId, "repeated add is idempotent");
    assert(activeBodies(scene, "floor").length === 1, "repeated add keeps one body");
  }
  scene = setMeshCollision(scene, "floor", "remove");
  assert(activeMeshes(scene, "floor").length === 0, "remove disables actual source");
  assert(scene.entities.floor!.components.some((c) => c.id === colliderId), "remove preserves settings");
  scene = setMeshCollision(scene, "floor", "add");
  assert(activeMeshes(scene, "floor")[0]!.id === colliderId, "re-add reuses component");

  const trigger = entity("trigger");
  trigger.components.push({ ...createRigidBodyComponent("body-old", { bodyType: "dynamic", isTrigger: true }), enabled: false });
  trigger.components.push({ ...createMeshColliderComponent("mesh-old", { meshMode: "convex", isTrigger: true, friction: 0.8 }), enabled: false });
  scene = setMeshCollision(sceneOf(trigger), trigger.id, "add");
  const restored = activeMeshes(scene, trigger.id)[0]!;
  const body = activeBodies(scene, trigger.id)[0]!;
  assert(restored.type === "collider" && restored.shape === "mesh" && restored.meshMode === "trimesh" && !restored.isTrigger && restored.id === "mesh-old" && restored.friction === 0.8, "restore disabled collider as solid trimesh, preserve surface");
  assert(body.type === "rigid-body" && body.bodyType === "fixed" && body.autoColliders === "none" && !body.isTrigger && body.id === "body-old", "restore disabled body as fixed solid, no auto duplication");
  const duplicate = entity("duplicate");
  duplicate.components.push({ ...createRigidBodyComponent("inactive"), enabled: false }, createRigidBodyComponent("active"), createRigidBodyComponent("extra"));
  scene = setMeshCollision(sceneOf(duplicate), duplicate.id, "add");
  assert(activeBodies(scene, duplicate.id).length === 1 && activeBodies(scene, duplicate.id)[0]!.id === "active", "reuse active body instead of waking a disabled duplicate");

  for (const autoColliders of ["ball", "cuboid"] as const) {
    const leaf = entity(`leaf-${autoColliders}`);
    leaf.components.push(createRigidBodyComponent("auto", { autoColliders }));
    for (const action of ["remove", "add"] as const) {
      scene = setMeshCollision(sceneOf(leaf), leaf.id, action);
      assert(!collisionSources(scene).some((r) => r.label.startsWith("自動生成")), `local ${autoColliders} removed for ${action}`);
      assert(activeMeshes(scene, leaf.id).length === (action === "add" ? 1 : 0), `local ${autoColliders} action takes effect`);
    }
  }
  const parent = entity("parent"); parent.components = [createTransformComponent("parent:t"), createRigidBodyComponent("parent:b", { autoColliders: "trimesh", friction: 0.7 })];
  const a = entity("a", parent.id), b = entity("b", parent.id); parent.children = [a.id, b.id];
  b.components.push(createBoxColliderComponent("b:box"));
  scene = setMeshCollision(sceneOf(parent, a, b), a.id, "remove");
  assert(activeMeshes(scene, a.id).length === 0, "selected child excluded from parent auto");
  assert(activeMeshes(scene, b.id).length === 1, "sibling mesh retained even with an explicit box");
  assert(activeMeshes(scene, b.id)[0]!.type === "collider" && (activeMeshes(scene, b.id)[0] as { friction: number }).friction === 0.7, "inherited surface preserved");
  assert(!collisionSources(scene).some((r) => r.entityId === parent.id && r.label.startsWith("自動生成")), "ancestor auto sweep disabled");
  const independent = entity("independent", parent.id); independent.components.push(createRigidBodyComponent("independent:b", { autoColliders: "hull", bodyType: "dynamic" }));
  parent.children.push(independent.id);
  scene = setMeshCollision(sceneOf(parent, a, b, independent), a.id, "remove");
  assert(scene.entities.independent === independent, "separate body is not materialized or changed");
  const primitiveParent = { ...parent, components: [createRigidBodyComponent("parent:b", { autoColliders: "cuboid" })] };
  rejectWithoutMutation(sceneOf(primitiveParent, a, b, independent), a.id, "remove");
  rejectWithoutMutation(sceneOf({ ...parent, enabled: false }, a, b, independent), a.id, "add");

  const shared = entity("shared"); shared.components.push(createMeshColliderComponent("shared:c"));
  const proxy = (id: string, index: number): SceneEntity => ({ ...entity(id, shared.id), components: [createTransformComponent(`${id}:t`)], modelNode: { modelEntityId: shared.id, modelAssetId: "shared:model", sourceNodeIndex: index, nodeType: "mesh", sourceMaterialIndices: [], restPosition: [0,0,0], restRotation: [0,0,0], restScale: [1,1,1] } });
  const p1 = proxy("node1", 0), p2 = proxy("node2", 1); shared.children = [p1.id, p2.id];
  const sharedScene = sceneOf(shared, p1, p2, other);
  scene = setMeshCollision(sharedScene, p1.id, "remove");
  assert(activeMeshes(scene, shared.id).length === 0 && activeMeshes(scene, p1.id).length === 0, "shared root and selected node stop colliding");
  assert(activeMeshes(scene, p2.id).length === 1, "shared sibling retains collision via node geometry");
  assert(activeBodies(scene, shared.id).length === 1, "legacy source becomes explicit owner");
  scene = setMeshCollision(scene, p1.id, "add");
  assert(activeMeshes(scene, p1.id).length === 1 && activeMeshes(scene, p2.id).length === 1, "re-add only selected shared node");
  scene = setMeshCollision(scene, shared.id, "remove");
  assert([shared.id,p1.id,p2.id].every((id) => activeMeshes(scene, id).length === 0), "remove WHOLE shared Model clears proxy colliders too");
  scene = setMeshCollision(setMeshCollision(sharedScene, p1.id, "add"), shared.id, "add");
  assert(activeMeshes(scene, shared.id).length === 1 && activeMeshes(scene, p1.id).length === 0 && activeMeshes(scene, p2.id).length === 0, "whole Model add avoids duplicate proxy coverage");
  const sharedAuto = { ...shared, components: shared.components.filter((c) => c.type !== "collider").concat(createRigidBodyComponent("shared:b", { autoColliders: "trimesh" })) };
  const p1Own = { ...p1, components: [...p1.components, createRigidBodyComponent("p1:b"), createMeshColliderComponent("p1:c")] };
  scene = setMeshCollision(sceneOf(sharedAuto, p1Own, p2), p1.id, "remove");
  assert(!collisionSources(scene).some((r) => r.entityId === shared.id && r.label.startsWith("自動生成")), "shared visible root auto disabled even when proxy has its own body");
  assert(activeMeshes(scene, p2.id).length === 1, "sibling survives shared auto split with independent proxy body");

  const triggerOther = { ...other, components: [...other.components, createMeshColliderComponent("other:c", { isTrigger: true }), createRigidBodyComponent("other:b", { autoColliders: "cuboid" })] };
  scene = setMeshCollision(sceneOf(sharedAuto, p1Own, p2, triggerOther), p1.id, "exclusive");
  assert(collisionSources(scene).length === 1 && collisionSources(scene)[0]!.entityId === p1.id && !collisionSources(scene)[0]!.isTrigger, "exclusive leaves precisely selected solid mesh source");
  assert(scene.entities.other!.components.length === triggerOther.components.length, "exclusive disables, never deletes");
  const imported = entity("imported");
  imported.components = [
    { ...createBuiltinPrimitiveMeshComponent("disabled-source", cube, []), enabled: false, geometry: { kind: "asset", assetId: "wrong", sourceNodeIndex: 1 } },
    { ...createBuiltinPrimitiveMeshComponent("enabled-source", cube, []), geometry: { kind: "asset", assetId: "right", sourceNodeIndex: 3 } },
  ];
  assert(colliderModelNode(imported)?.modelAssetId === "right" && colliderModelNode(imported)?.sourceNodeIndex === 3, "baked collider picks enabled source, not a disabled old Mesh Renderer");
  return { assertions };
}
