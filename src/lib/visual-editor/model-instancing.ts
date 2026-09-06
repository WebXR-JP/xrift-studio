import type { AssetManifest, ModelAsset } from "./asset-manifest";
import type { SceneDocument } from "./scene-document";

/** Scripts can address arbitrary entities; keep their full object/rendering behavior. */
export function collectModelInstancingEntities(scene: SceneDocument, assets: AssetManifest): string[] {
  if (Object.values(scene.entities).some((entity) => entity.components.some((c) =>
    c.enabled && ["script", "interaction-trigger"].includes(c.type)))) return [];
  return Object.values(scene.entities).filter((entity) => {
    const mesh = entity.components.find((c) => c.type === "mesh" && c.enabled);
    if (!mesh || mesh.type !== "mesh" || mesh.modelPose || mesh.maxDistance) return false;
    const assetId = mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
    const asset = assets.assets[assetId];
    if (asset?.kind !== "model" || !asset.importSettings.instanceMeshes || !canInstanceModel(asset)) return false;
    const seen = new Set<string>();
    let current: typeof entity | undefined = entity;
    while (current) {
      if (seen.has(current.id) || !current.enabled) return false;
      seen.add(current.id);
      if (current.components.some((c) => c.enabled && !["transform", "mesh", "collider"].includes(c.type))) return false;
      current = current.parentId ? scene.entities[current.parentId] : undefined;
    }
    return true;
  }).map((entity) => entity.id).sort();
}

export function canInstanceModel(model: ModelAsset): boolean {
  return model.importMetadata?.sourceFormat === "glb" && !model.importMetadata.openBrush &&
    !model.importMetadata.animations.length && !model.importMetadata.bones?.length && !model.importMetadata.morphTargets?.length &&
    ![...(model.importMetadata.extensionsUsed ?? []), ...(model.importMetadata.extensionsRequired ?? [])].some((x) => /^(VRM|VRMC_)/.test(x));
}

/** Count repeated source meshes, not every different node from the same GLB. */
export function countRepeatedModelMeshes(model: ModelAsset, scene: SceneDocument): number {
  const counts = new Map<number, number>();
  const nodes = model.importMetadata?.nodes ?? [];
  for (const entity of Object.values(scene.entities)) {
    if (!entity.enabled) continue;
    for (const mesh of entity.components) {
      if (mesh.type !== "mesh" || !mesh.enabled) continue;
      const geometry = mesh.geometry;
      if ((geometry?.kind === "asset" ? geometry.assetId : mesh.geometryAssetId) !== model.id) continue;
      const index = geometry?.kind === "asset" ? geometry.sourceNodeIndex : undefined;
      const name = geometry?.kind === "asset" ? geometry.sourceNodeName : undefined;
      const selected = index !== undefined ? nodes.filter((node) => node.sourceNodeIndex === index)
        : name ? nodes.filter((node) => node.name === name) : nodes;
      for (const node of selected) if (node.meshIndex !== undefined) counts.set(node.meshIndex, (counts.get(node.meshIndex) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}
