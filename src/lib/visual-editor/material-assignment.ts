import {
  getMaterialAsset,
  type AssetManifest,
} from "./asset-manifest";
import {
  getMesh,
  getMeshMaterialSlots,
  setMeshMaterialBinding,
  type SceneDocument,
} from "./scene-document";

export type PrimaryMaterialAssignmentResult =
  | {
      applied: true;
      scene: SceneDocument;
      slot: string;
    }
  | {
      applied: false;
      scene: SceneDocument;
      reason:
        | "entity-missing"
        | "mesh-missing"
        | "material-missing"
        | "slot-missing"
        | "unchanged";
    };

/**
 * Assigns a Material Asset to the primary authoring slot of the first Mesh on
 * an Entity. Keeping this as a pure IR operation makes viewport and hierarchy
 * drops produce the same undoable document change.
 */
export function assignMaterialToPrimaryMeshSlot(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  materialAssetId: string,
): PrimaryMaterialAssignmentResult {
  const entity = scene.entities[entityId];
  if (!entity) return { applied: false, scene, reason: "entity-missing" };
  const mesh = getMesh(entity);
  if (!mesh) return { applied: false, scene, reason: "mesh-missing" };
  if (!getMaterialAsset(assets, materialAssetId)) {
    return { applied: false, scene, reason: "material-missing" };
  }

  const slots = getMeshMaterialSlots(mesh, assets);
  const slot =
    slots.find((candidate) => candidate.slot === "default")?.slot ??
    slots[0]?.slot;
  if (!slot) return { applied: false, scene, reason: "slot-missing" };

  const nextScene = setMeshMaterialBinding(
    scene,
    assets,
    entityId,
    slot,
    materialAssetId,
    mesh.id,
  );
  if (nextScene === scene) {
    return { applied: false, scene, reason: "unchanged" };
  }
  return { applied: true, scene: nextScene, slot };
}
