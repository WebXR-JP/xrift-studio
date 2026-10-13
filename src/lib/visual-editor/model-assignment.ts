import type { AssetManifest, ModelAsset } from "./asset-manifest";
import { createDocumentId } from "./document-id";
import { createMeshComponent, createMeshColliderComponent, fitBoxColliderToMesh, type MeshComponent, type SceneDocument, type SceneEntity } from "./scene-document";

export type EntityModelAssignment = { changed: boolean; scene: SceneDocument; componentId: string; modelAssetId: string };

/** Change one Entity's geometry without moving, renaming or recreating it. */
export function setEntityModel(scene: SceneDocument, assets: AssetManifest, entityId: string, modelAssetId: string, componentId?: string): EntityModelAssignment {
  const entity = scene.entities[entityId];
  if (!entity) throw new Error("モデルを設定するEntityが見つかりません。");
  const model = assets.assets[modelAssetId];
  if (model?.kind !== "model") throw new Error("Assetsにある3Dモデルを選んでください。");
  if (model.status !== "ready" || !model.importMetadata) throw new Error("モデルの読み込み完了を待ってから設定してください。");
  const meshes = entity.components.filter((component): component is MeshComponent => component.type === "mesh");
  if (entity.modelNode || meshes.some(mesh => mesh.geometry?.kind === "asset" && (mesh.geometry.sourceNodeIndex !== undefined || mesh.geometry.sourceNodeName !== undefined))) throw new Error("モデルの一部には設定できません。Hierarchyで元モデルのEntityを選んでください。");
  const existing = componentId ? meshes.find(mesh => mesh.id === componentId) : meshes.length === 1 ? meshes[0] : undefined;
  if (componentId && !existing) throw new Error("設定するMesh Rendererが見つかりません。");
  if (!componentId && meshes.length > 1) throw new Error("Mesh Rendererが複数あります。設定するComponentを選んでください。");
  const previousAssetId = existing?.geometry?.kind === "asset" ? existing.geometry.assetId : existing?.geometryAssetId;
  if (previousAssetId === modelAssetId && existing?.geometry?.kind === "asset") return { changed: false, scene, componentId: existing.id, modelAssetId };
  if (entity.components.some(component => component.type === "collider" && component.shape === "mesh" && component.collisionModelAssetId)) throw new Error("Colliderに別のモデルが設定されています。InspectorでColliderの差し替えを解除してから、表示モデルを変更してください。");

  const generated = ownedGeneratedNodes(scene, entityId);
  for (const id of generated) {
    const node = scene.entities[id];
    if (node.children.some(child => !generated.has(child)) || node.components.some(component => ![`${id}-transform`, `${id}-mesh`, `${id}-collider`].includes(component.id))) throw new Error("元モデルの子に手動の編集があります。子のComponentsやEntityを別へ移してから、モデルを変更してください。");
    if (node.components.some(component => component.type === "collider" && (component.shape !== "mesh" || component.collisionModelAssetId))) throw new Error("元モデルの子に個別のCollider形状があります。Inspectorで設定を整理してから、モデルを変更してください。");
  }
  const mesh = modelMesh(existing?.id ?? createDocumentId("component-mesh"), model, assets, existing);
  const components = entity.components.map(component => {
    if (component.id === existing?.id) return mesh;
    if (component.type === "collider" && component.shape === "box" && component.fitMode === "auto") return fitBoxColliderToMesh(component, mesh, assets);
    return component;
  });
  if (!existing) components.push(mesh);
  const priorCollider = [...generated].flatMap(id => scene.entities[id].components).find(component => component.type === "collider" && component.shape === "mesh");
  if (priorCollider?.type === "collider" && priorCollider.shape === "mesh" && !components.some(component => component.type === "collider")) {
    components.push(createMeshColliderComponent(createDocumentId("component-collider"), { ...priorCollider, meshMode: dynamicBodyBoundary(scene, entityId) ? "convex" : "trimesh" }));
  }
  const entities = Object.fromEntries(Object.entries(scene.entities).filter(([id]) => !generated.has(id)));
  entities[entityId] = { ...entity, children: entity.children.filter(child => !generated.has(child)), components };
  return { changed: true, scene: { ...scene, entities }, componentId: mesh.id, modelAssetId };
}
function modelMesh(id: string, model: ModelAsset, assets: AssetManifest, previous?: MeshComponent): MeshComponent {
  const defaults = model.materialSlots.flatMap(slot => slot.defaultMaterialAssetId && assets.assets[slot.defaultMaterialAssetId]?.kind === "material" ? [{ slot: slot.slot, materialAssetId: slot.defaultMaterialAssetId }] : []);
  const mesh = createMeshComponent(id, model.id, defaults);
  return { ...mesh, ...(previous ? { enabled: previous.enabled, castShadow: previous.castShadow, receiveShadow: previous.receiveShadow,
    ...(previous.maxDistance === undefined ? {} : { maxDistance: previous.maxDistance }), ...(previous.renderOrder === undefined ? {} : { renderOrder: previous.renderOrder }) } : {}) };
}
/** Generated model nodes have stable IDs and component IDs in both old formats. */
function ownedGeneratedNodes(scene: SceneDocument, rootId: string): Set<string> {
  const descendants = new Set<string>();
  const pending = [...scene.entities[rootId].children];
  while (pending.length) {
    const id = pending.pop()!;
    if (descendants.has(id)) continue;
    descendants.add(id); pending.push(...(scene.entities[id]?.children ?? []));
  }
  const prefixes = [`${rootId}-model-node-`, `${rootId}-openbrush-node-`];
  return new Set([...descendants].filter(id => {
    const entity: SceneEntity | undefined = scene.entities[id];
    if (!entity) return false;
    if (entity.modelNode?.modelEntityId === rootId) return true;
    return prefixes.some(prefix => id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)));
  }));
}
function dynamicBodyBoundary(scene: SceneDocument, entityId: string): boolean {
  const seen = new Set<string>();
  let id: string | null = entityId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const entity: SceneEntity | undefined = scene.entities[id];
    const body = entity?.components.find(component => component.type === "rigid-body");
    if (body?.type === "rigid-body") return body.bodyType === "dynamic";
    const collider = entity?.components.find(component => component.type === "collider" && component.bodyType === "dynamic");
    if (collider) return true;
    id = entity?.parentId ?? null;
  }
  return false;
}
