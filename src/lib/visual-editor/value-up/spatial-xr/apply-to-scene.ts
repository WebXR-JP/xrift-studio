import { quaternionToEuler, localOffsetPosition, spatialSurfaceBounds } from "./spatial-transform";
import type { AssetManifest } from "../../asset-manifest";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../../creation-catalog";
import { createDocumentId } from "../../document-id";
import {
  addBuiltinPrimitiveEntity,
  createBoxColliderComponent,
  getTransform,
  type SceneDocument,
  type Vec3,
} from "../../scene-document";
import { buildSpatialConversionPlan, type SemanticPrefabRule } from "./semantic-conversion";
import { normalizeSpatialSemanticLabel, type SpatialCaptureDocument } from "./spatial-capture";

export type ApplySpatialCaptureOptions = {
  materialAssetId: string;
  rules?: readonly SemanticPrefabRule[];
  includeLabels?: readonly string[];
};

export type ApplySpatialCaptureResult = {
  scene: SceneDocument;
  createdEntityIds: string[];
  skippedSurfaceIds: string[];
};


export function applySpatialCaptureToScene(
  scene: SceneDocument,
  assets: AssetManifest,
  capture: SpatialCaptureDocument,
  options: ApplySpatialCaptureOptions,
): ApplySpatialCaptureResult {
  let nextScene = scene;
  const createdEntityIds: string[] = [];
  const skippedSurfaceIds: string[] = [];
  const include = options.includeLabels?.length
    ? new Set(options.includeLabels.map(normalizeSpatialSemanticLabel))
    : null;
  const surfacesById = new Map(capture.surfaces.map(surface => [surface.id, surface]));

  for (const action of buildSpatialConversionPlan(capture, options.rules)) {
    if (include && !include.has(action.semanticLabel.toLowerCase())) {
      skippedSurfaceIds.push(action.sourceSurfaceId);
      continue;
    }
    // Prefab replacement is intentionally a second pass: when a project has no
    // matching prefab, its real-world geometry must still be preserved.
    const primitive = action.primitive;
    if (!primitive || action.action === "ignore") {
      skippedSurfaceIds.push(action.sourceSurfaceId);
      continue;
    }

    // Capture plane space uses +Y as the plane normal while Three PlaneGeometry uses
    // +Z. A thin box keeps the runtime pose exact without inserting an implicit
    // 90-degree conversion, and it is also a better collider proxy.
    const creationId = BUILTIN_PRIMITIVE_CREATION_IDS.box;
    const placed = addBuiltinPrimitiveEntity(
      nextScene,
      assets,
      creationId,
      options.materialAssetId,
      primitive.position,
    );
    if (!placed) {
      skippedSurfaceIds.push(action.sourceSurfaceId);
      continue;
    }

    const entity = placed.scene.entities[placed.entityId];
    const transform = entity ? getTransform(entity) : null;
    if (entity && transform) {
      entity.name = `Spatial ${action.semanticLabel}`;
      transform.rotation = quaternionToEuler(primitive.rotationQuaternion);
      const surface = surfacesById.get(action.sourceSurfaceId)!;
      const bounds = spatialSurfaceBounds(surface);
      if (bounds) transform.position = localOffsetPosition(surface, bounds.min.map((v, i) => (v + bounds.max[i]!) / 2) as Vec3);
      // Dimensions already give flat geometry a thin axis. Keep that local basis
      // for both XZ polygons and bounds supplied in other local orientations.
      transform.scale = primitive.scale.map((v, i) => v * (surface.pose.scale?.[i] ?? 1)) as Vec3;
      if (action.purposes.includes("static-collider") && !entity.components.some((component) => component.type === "collider")) {
        entity.components = [
          ...entity.components,
          createBoxColliderComponent(createDocumentId("component-spatial-collider"), { fitMode: "auto" }),
        ];
      }
    }
    nextScene = placed.scene;
    createdEntityIds.push(placed.entityId);
  }

  return { scene: nextScene, createdEntityIds, skippedSurfaceIds };
}
