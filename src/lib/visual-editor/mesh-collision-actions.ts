import {
  createMeshColliderComponent, createRigidBodyComponent,
  type SceneDocument, type SceneEntity, type ColliderComponent,
  type RigidBodyComponent,
} from "./scene-document";
import { createDocumentId } from "./document-id";
type SceneEntityModelNode = NonNullable<SceneEntity["modelNode"]>;

export type MeshCollisionAction = "add" | "remove" | "exclusive";

/** Both shared Model nodes and independently rendered imported nodes have a source mesh. */
export function colliderModelNode(entity: SceneEntity): SceneEntityModelNode | undefined {
  if (entity.modelNode) return entity.modelNode;
  const mesh = entity.components.find((c) => c.type === "mesh");
  if (mesh?.geometry?.kind !== "asset" || mesh.geometry.sourceNodeIndex === undefined) return;
  return {
    modelEntityId: entity.id, modelAssetId: mesh.geometry.assetId,
    sourceNodeIndex: mesh.geometry.sourceNodeIndex, nodeType: "mesh",
    sourceMaterialIndices: [], restPosition: [0, 0, 0], restRotation: [0, 0, 0], restScale: [1, 1, 1],
  };
}

export function hasCollisionMesh(entity: SceneEntity): boolean {
  return entity.components.some((c) => c.type === "mesh" && c.enabled) ||
    entity.modelNode?.nodeType === "mesh" || entity.modelNode?.nodeType === "skinned-mesh";
}

export function collisionAncestors(scene: SceneDocument, entityId: string): SceneEntity[] {
  const result: SceneEntity[] = [];
  const seen = new Set<string>();
  let entity: SceneEntity | undefined = scene.entities[entityId];
  while (entity && !seen.has(entity.id)) {
    seen.add(entity.id); result.push(entity);
    entity = entity.parentId ? scene.entities[entity.parentId] : undefined;
  }
  return result;
}

export function collisionSources(scene: SceneDocument) {
  return Object.values(scene.entities).flatMap((entity) => {
    const active = collisionAncestors(scene, entity.id).every((e) => e.enabled);
    return entity.components.flatMap((component) => {
      if (!component.enabled || (component.type !== "collider" &&
        !(component.type === "rigid-body" && component.autoColliders !== "none"))) return [];
      return [{ entityId: entity.id, entityName: entity.name, componentId: component.id,
        active, label: component.type === "collider"
          ? `${component.shape === "mesh" ? "Mesh" : "Box"} Collider${component.isTrigger ? "（Trigger）" : ""}`
          : `自動生成: ${component.autoColliders}${component.isTrigger ? "（Trigger）" : ""}` }];
    });
  });
}

/** One history transaction; untouched entities keep their identity. Never deletes authored settings. */
export function setMeshCollision(scene: SceneDocument, entityId: string, action: MeshCollisionAction): SceneDocument {
  const selected = scene.entities[entityId];
  if (!selected || !hasCollisionMesh(selected)) throw new Error("有効なMesh Rendererを選んでください。");
  if (!collisionAncestors(scene, entityId).every((e) => e.enabled)) {
    throw new Error("このEntityと親を有効にしてから当たり判定を設定してください。");
  }
  const entities = { ...scene.entities };
  const edit = (id: string, fn: (components: SceneEntity["components"]) => SceneEntity["components"]) => {
    const entity = entities[id];
    const components = fn(entity.components);
    if (components.some((c, i) => c !== entity.components[i]) || components.length !== entity.components.length) {
      entities[id] = { ...entity, components };
    }
  };
  if (action === "exclusive") {
    for (const entity of Object.values(entities)) edit(entity.id, (cs) => cs.map((c) =>
      c.type === "collider" && c.enabled ? { ...c, enabled: false } :
      c.type === "rigid-body" && c.autoColliders !== "none" ? { ...c, autoColliders: "none" } : c));
  } else {
    // Replace inherited mesh generation with explicit per-mesh settings before excluding one mesh.
    // Cuboid/Ball have different geometry; do not silently replace their shapes with hulls.
    const chain = collisionAncestors(scene, entityId);
    const sharedRootId = selected.modelNode?.modelEntityId;
    const bodyOwner = chain.find((e) => e.components.some((c) => c.type === "rigid-body" && c.enabled));
    const sources: Array<{ entity: SceneEntity; component: ColliderComponent | RigidBodyComponent }> = [];
    for (const entity of chain) {
      for (const c of entity.components) {
        if (!c.enabled) continue;
        if (c.type === "rigid-body" && entity === bodyOwner && c.autoColliders !== "none") {
          if (c.autoColliders === "ball" || c.autoColliders === "cuboid") {
            throw new Error(`「${entity.name}」の自動${c.autoColliders}を使っています。物理挙動の自動生成を解除し、必要なメッシュを一覧へ追加してください。`);
          }
          sources.push({ entity, component: c });
        }
        if (c.type === "collider" && c.shape === "mesh" &&
          (entity.id === sharedRootId || (!bodyOwner && (entity.id !== entityId || entity.children.length > 0)))) {
          if (c.bodyType && c.bodyType !== "fixed") throw new Error(`「${entity.name}」は動く衝突判定です。物理挙動の設定元で範囲を分けてください。`);
          sources.push({ entity, component: c });
        }
      }
    }
    for (const source of sources) {
      const c = source.component;
      if (c.type === "collider" && !bodyOwner) {
        // Legacy Mesh Colliders sweep their entire subtree. Give the source an explicit
        // fixed body so newly materialized colliders cover only their own local meshes.
        const movingChild = Object.values(scene.entities).find((candidate) =>
          collisionAncestors(scene, candidate.id).some((e) => e.id === source.entity.id) &&
          candidate.components.some((entry) => entry.type === "collider" && entry.enabled && entry.bodyType && entry.bodyType !== "fixed") &&
          !candidate.components.some((entry) => entry.type === "rigid-body" && entry.enabled));
        if (movingChild) throw new Error(`「${movingChild.name}」の動く衝突判定を物理挙動で分けてから実行してください。`);
        edit(source.entity.id, (cs) => {
          const previous = cs.find((entry) => entry.type === "rigid-body");
          const body = createRigidBodyComponent(previous?.id ?? createDocumentId("component-rigid-body"), {
            bodyType: "fixed", friction: c.friction, restitution: c.restitution, isTrigger: c.isTrigger,
          });
          return previous ? cs.map((entry) => entry === previous ? body : entry) : [...cs, body];
        });
      }
      edit(source.entity.id, (cs) => cs.map((entry) => entry.id !== c.id ? entry :
        entry.type === "rigid-body" ? { ...entry, autoColliders: "none" } : { ...entry, enabled: false }));
      for (const candidate of Object.values(scene.entities)) {
        if (!hasCollisionMesh(candidate)) continue;
        if (c.type === "collider" && bodyOwner && candidate.modelNode?.modelEntityId !== source.entity.id) continue;
        const ancestry = collisionAncestors(scene, candidate.id);
        const sourceIndex = ancestry.findIndex((e) => e.id === source.entity.id);
        if (sourceIndex < 0) continue;
        if (ancestry.slice(0, sourceIndex).some((e) => e.components.some((entry) => entry.type === "rigid-body" && entry.enabled))) continue;
        // Shared Models render at the root, but collision must live on their individual nodes.
        if (Object.values(scene.entities).some((e) => e.modelNode?.modelEntityId === candidate.id)) continue;
        if (entities[candidate.id].components.some((entry) => entry.type === "collider" && entry.enabled)) continue;
        edit(candidate.id, (cs) => [...cs, createMeshColliderComponent(createDocumentId("component-collider"), {
          meshMode: c.type === "rigid-body" ? c.autoColliders === "hull" ? "convex" : "trimesh" : c.shape === "mesh" ? c.meshMode : "trimesh",
          isTrigger: c.isTrigger, friction: c.friction, restitution: c.restitution,
        })]);
      }
    }
  }
  edit(entityId, (cs) => cs.map((c) => c.type === "collider" && c.enabled ? { ...c, enabled: false } : c));
  if (action !== "remove") {
    edit(entityId, (cs) => {
      const body = cs.find((c) => c.type === "rigid-body");
      const collider = cs.find((c) => c.type === "collider" && c.shape === "mesh");
      return [
        ...cs.map((c) => c === body ? { ...body, enabled: true, bodyType: "fixed" as const, autoColliders: "none" as const, isTrigger: false } :
          c === collider ? { ...collider, enabled: true, meshMode: "trimesh" as const, isTrigger: false, bodyType: "fixed" as const } : c),
        ...(!body ? [createRigidBodyComponent(createDocumentId("component-rigid-body"), { bodyType: "fixed" })] : []),
        ...(!collider ? [createMeshColliderComponent(createDocumentId("component-collider"), { meshMode: "trimesh" })] : []),
      ];
    });
  }
  return { ...scene, entities };
}
