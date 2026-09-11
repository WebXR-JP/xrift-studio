import { quaternionToEuler, localOffsetPosition } from "./spatial-transform";
import { instantiateSceneAsset } from "../../asset-placement";
import { createAssetImportPlan } from "../../asset-import";
import { commitAssetImportPlanToDisk, ensureBuiltinModelAsset } from "../../asset-import-persistence";
import { getTransform, type Vec3 } from "../../scene-document";
import type { PrototypeVisualProject } from "../../prototype-project";
import { migrateSpatialCapture, normalizeSpatialSemanticLabel, type SpatialCaptureDocument, type SpatialSurface } from "./spatial-capture";
import { findSpatialSemanticSample } from "./semantic-sample-models";
import { spatialSurfaceGeometryToGlb } from "./spatial-mesh-glb";

export type SpatialModelSource = "captured-geometry" | "semantic-sample" | "proxy";
export type AppliedSpatialModel = { surfaceId: string; semanticLabel: string; source: SpatialModelSource; assetId?: string; entityId?: string };
export type ApplySpatialModelsResult = { bundle: PrototypeVisualProject; applied: AppliedSpatialModel[]; skipped: string[] };


function sizeOf(surface: SpatialSurface): [number, number, number] | null {
  if (surface.bounds) return [
    Math.max(0.01, surface.bounds.max[0] - surface.bounds.min[0]),
    Math.max(0.01, surface.bounds.max[1] - surface.bounds.min[1]),
    Math.max(0.01, surface.bounds.max[2] - surface.bounds.min[2]),
  ];
  const points = surface.boundary?.points;
  if (!points?.length) return null;
  const values = [0, 1, 2].map((axis) => points.map((point) => point[axis]!));
  return values.map((axis) => Math.max(0.01, Math.max(...axis) - Math.min(...axis))) as [number, number, number];
}

async function importCapturedGeometry(projectPath: string, bundle: PrototypeVisualProject, capture: SpatialCaptureDocument, surface: SpatialSurface) {
  const bytes = spatialSurfaceGeometryToGlb(surface, capture);
  if (!bytes) return null;
  const label = String(normalizeSpatialSemanticLabel(surface.semanticLabel));
  const safe = surface.id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  const fileName = `spatial-${label.replace(/[^a-zA-Z0-9-]/g, "-")}-${safe}.glb`;
  const plan = await createAssetImportPlan({ fileName, bytes, mimeType: "model/gltf-binary", displayName: `Spatial ${label}`, folderId: null, existingManifest: bundle.assets });
  if (!plan.canCommit || !plan.asset) return null;
  const assets = await commitAssetImportPlanToDisk(projectPath, bundle.assets, plan);
  return { assets, assetId: plan.asset.id };
}

/**
 * Applies Quest/WebXR scene understanding with a preserve-first policy:
 * 1. Exact detected plane/mesh geometry -> imported GLB and used directly.
 * 2. No geometry but a known semantic -> bundled sample GLB, scaled to bounds.
 * 3. Otherwise leave it for the existing primitive proxy pass.
 */
export async function applySpatialCaptureModels(
  projectPath: string,
  initial: PrototypeVisualProject,
  capture: SpatialCaptureDocument,
): Promise<ApplySpatialModelsResult> {
  capture = migrateSpatialCapture(capture);
  let bundle = initial;
  const applied: AppliedSpatialModel[] = [];
  const skipped: string[] = [];

  for (const surface of capture.surfaces) {
    const label = String(normalizeSpatialSemanticLabel(surface.semanticLabel));
    let assetId: string | undefined;
    let source: SpatialModelSource = "proxy";
    const direct = await importCapturedGeometry(projectPath, bundle, capture, surface);
    if (direct) {
      bundle = { ...bundle, assets: direct.assets };
      assetId = direct.assetId;
      source = "captured-geometry";
    } else {
      const sample = label === "global-mesh" ? undefined : findSpatialSemanticSample(label);
      if (sample) {
        const withModel = await ensureBuiltinModelAsset(projectPath, bundle.assets, sample);
        if (withModel) {
          bundle = { ...bundle, assets: withModel };
          assetId = sample.assetId;
          source = "semantic-sample";
        }
      }
    }
    if (!assetId) { skipped.push(surface.id); continue; }

    const placement = instantiateSceneAsset(bundle.scene, bundle.assets, bundle.prefabs, assetId, { position: surface.pose.position });
    if (!placement.placed) { skipped.push(surface.id); continue; }
    const entity = placement.scene.entities[placement.entityId];
    const transform = entity ? getTransform(entity) : null;
    if (entity && transform) {
      entity.name = `Spatial ${label}`;
      transform.rotation = quaternionToEuler(surface.pose.rotation);
      transform.scale = surface.pose.scale ?? [1, 1, 1];
      if (source === "semantic-sample") {
        const sample = findSpatialSemanticSample(label);
        const detected = sizeOf(surface);
        if (sample?.nominalSize && detected) {
          transform.scale = detected.map((value, axis) => value / Math.max(0.001, sample.nominalSize![axis]!) * (surface.pose.scale?.[axis] ?? 1)) as Vec3;
          if (surface.bounds) transform.position = localOffsetPosition(surface, [
            (surface.bounds.min[0] + surface.bounds.max[0]) / 2,
            surface.bounds.min[1],
            (surface.bounds.min[2] + surface.bounds.max[2]) / 2,
          ]);
        }
      }
    }
    bundle = { ...bundle, scene: placement.scene, assets: placement.assets };
    applied.push({ surfaceId: surface.id, semanticLabel: label, source, assetId, entityId: placement.entityId });
  }
  return { bundle, applied, skipped };
}
