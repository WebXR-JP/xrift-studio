import type { AssetManifest, ModelAsset } from "../asset-manifest";
import type { MeshComponent, SceneDocument } from "../scene-document";

/** Indices and names are both checked against the actual GLB before rewriting. */
export type ModelDownloadPlan = {
  replacedMaterials: Array<{ index: number; name: string }>;
};

/**
 * Keep every declared dependency, including disabled components and graph/script
 * assetReferences. Only authoring provenance is excluded from the closure.
 * Comparing exact IDs also covers custom shader uniforms and nested properties.
 */
export function collectPublishedAssetIds(scene: SceneDocument | null, manifest: AssetManifest): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (Object.prototype.hasOwnProperty.call(manifest.assets, value)) ids.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(scene);
  // Set iteration includes dependencies appended during the walk.
  for (const id of ids) {
    const asset = manifest.assets[id];
    if (asset.kind === "model" || asset.kind === "primitive") visit(asset.materialSlots);
    if (asset.kind === "primitive") visit(asset.defaultMaterialAssetId);
    if (asset.kind === "material") { visit(asset.properties); visit(asset.shader); }
    if (asset.kind === "particle") visit(asset.properties);
    if (asset.kind === "interactivity") visit(asset.extension);
  }
  return ids;
}

/** Strip a slot only when every visible use replaces it globally. */
export function planModelDownload(
  model: ModelAsset,
  scene: SceneDocument | null,
  manifest: AssetManifest,
): ModelDownloadPlan | undefined {
  if (!scene || model.importMetadata?.sourceFormat !== "glb" || model.importMetadata.openBrush) return;
  if ([...(model.importMetadata.extensionsUsed ?? []), ...(model.importMetadata.extensionsRequired ?? [])]
    .some((name) => /^(VRM|VRMC_)/.test(name))) return;
  const uses: MeshComponent[] = [];
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type === "mesh") {
        const id = component.geometry?.kind === "asset" ? component.geometry.assetId : component.geometryAssetId;
        if (id === model.id) uses.push(component);
      } else if (JSON.stringify(component).includes(JSON.stringify(model.id))) {
        // A script, custom component, collider, or graph may load the source
        // without the mesh material injection. Retain its original materials.
        return;
      }
    }
  }
  if (uses.length === 0) return;
  const replacedMaterials = model.materialSlots.flatMap((slot) => {
    if (!Number.isInteger(slot.sourceMaterialIndex) || slot.sourceMaterialIndex! < 0) return [];
    const replaced = uses.every((mesh) => {
      const binding = mesh.materialBindings.find((candidate) => candidate.slot === slot.slot && candidate.sourceNodeIndex === undefined);
      const id = binding?.materialAssetId ?? slot.defaultMaterialAssetId;
      const material = id ? manifest.assets[id] : undefined;
      // OpenBrush presets reuse the source material rather than replacing it.
      if (material?.kind !== "material" || material.shader) return false;
      return mesh.materialBindings.filter((candidate) => candidate.slot === slot.slot).every((candidate) => {
        const override = manifest.assets[candidate.materialAssetId];
        return override?.kind === "material" && !override.shader;
      });
    });
    return replaced ? [{ index: slot.sourceMaterialIndex!, name: slot.name }] : [];
  });
  // Even without replacements, the byte pass can remove unreferenced images.
  return { replacedMaterials };
}
