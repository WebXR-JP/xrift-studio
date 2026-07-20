import {
  getMaterialAsset,
  type AssetManifest,
  type MaterialSlotDefinition,
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

export type MaterialAssignmentTargetResult =
  | {
      ready: true;
      meshId: string;
      slots: MaterialSlotDefinition[];
    }
  | {
      ready: false;
      reason: "entity-missing" | "mesh-missing" | "slot-missing";
    };

export type MaterialSlotAssignmentResult =
  | {
      applied: true;
      scene: SceneDocument;
      slots: string[];
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

export function getMaterialAssignmentTarget(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  meshComponentId?: string,
): MaterialAssignmentTargetResult {
  const entity = scene.entities[entityId];
  if (!entity?.enabled) return { ready: false, reason: "entity-missing" };
  const mesh = getMesh(entity, meshComponentId);
  if (!mesh?.enabled) return { ready: false, reason: "mesh-missing" };
  const slots = getMeshMaterialSlots(mesh, assets);
  if (slots.length === 0) return { ready: false, reason: "slot-missing" };
  return {
    ready: true,
    meshId: mesh.id,
    slots: slots.map((slot) => ({ ...slot })),
  };
}

/** Assigns one Material to explicitly selected slots on one exact Mesh. */
export function assignMaterialToMeshSlots(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  materialAssetId: string,
  requestedSlots: readonly string[],
  meshComponentId?: string,
): MaterialSlotAssignmentResult {
  const target = getMaterialAssignmentTarget(
    scene,
    assets,
    entityId,
    meshComponentId,
  );
  if (!target.ready) return { applied: false, scene, reason: target.reason };
  if (!getMaterialAsset(assets, materialAssetId)) {
    return { applied: false, scene, reason: "material-missing" };
  }

  const availableSlots = new Set(target.slots.map((slot) => slot.slot));
  const normalizedRequestedSlots = [
    ...new Set(requestedSlots.map((slot) => slot.trim())),
  ].filter((slot) => slot.length > 0);
  const slots = normalizedRequestedSlots.filter(
    (slot) => slot.length > 0 && availableSlots.has(slot),
  );
  if (
    slots.length === 0 ||
    slots.length !== normalizedRequestedSlots.length
  ) {
    return { applied: false, scene, reason: "slot-missing" };
  }

  let nextScene = scene;
  for (const slot of slots) {
    nextScene = setMeshMaterialBinding(
      nextScene,
      assets,
      entityId,
      slot,
      materialAssetId,
      target.meshId,
    );
  }
  if (nextScene === scene) {
    return { applied: false, scene, reason: "unchanged" };
  }
  return { applied: true, scene: nextScene, slots };
}

/**
 * Assigns a Material Asset to the primary authoring slot of the requested
 * Mesh, or the first Mesh when no component ID is supplied. Disabled Meshes
 * are always rejected.
 */
export function assignMaterialToPrimaryMeshSlot(
  scene: SceneDocument,
  assets: AssetManifest,
  entityId: string,
  materialAssetId: string,
  meshComponentId?: string,
): PrimaryMaterialAssignmentResult {
  const target = getMaterialAssignmentTarget(
    scene,
    assets,
    entityId,
    meshComponentId,
  );
  if (!target.ready) return { applied: false, scene, reason: target.reason };
  const slots = target.slots;
  const slot =
    slots.find((candidate) => candidate.slot === "default")?.slot ??
    slots[0]?.slot;
  if (!slot) return { applied: false, scene, reason: "slot-missing" };
  const result = assignMaterialToMeshSlots(
    scene,
    assets,
    entityId,
    materialAssetId,
    [slot],
    target.meshId,
  );
  if (!result.applied) {
    return { applied: false, scene, reason: result.reason };
  }
  return { applied: true, scene: result.scene, slot };
}
