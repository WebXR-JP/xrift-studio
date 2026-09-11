import { normalizeSpatialSemanticLabel, type SpatialCaptureDocument, type SpatialSemanticLabel, type SpatialSurfacePurpose } from "./spatial-capture";
import { spatialSurfaceSize } from "./spatial-transform";

export type SpatialPrimitiveShape = "box" | "plane";
export type SpatialConversionAction = {
  sourceSurfaceId: string;
  semanticLabel: string;
  action: "primitive" | "prefab" | "collision-mesh" | "occlusion-mesh" | "ignore";
  primitive?: {
    shape: SpatialPrimitiveShape;
    position: [number, number, number];
    rotationQuaternion: [number, number, number, number];
    scale: [number, number, number];
  };
  prefabRecipeId?: string;
  purposes: SpatialSurfacePurpose[];
  tags: string[];
};

export type SemanticPrefabRule = {
  label: SpatialSemanticLabel | string;
  prefabRecipeId?: string;
  fallback: "box" | "plane" | "mesh" | "ignore";
  purposes?: SpatialSurfacePurpose[];
};

export const DEFAULT_SEMANTIC_PREFAB_RULES: SemanticPrefabRule[] = [
  { label: "floor", fallback: "plane", purposes: ["visible-proxy", "static-collider"] },
  { label: "ceiling", fallback: "plane", purposes: ["visible-proxy", "occlusion"] },
  { label: "wall", fallback: "plane", purposes: ["visible-proxy", "static-collider", "occlusion"] },
  { label: "invisible-wall", fallback: "plane", purposes: ["authoring-reference", "static-collider"] },
  { label: "window", fallback: "plane", purposes: ["visible-proxy", "occlusion"] },
  { label: "door", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "opening", fallback: "plane", purposes: ["authoring-reference"] },
  { label: "wall-art", fallback: "plane", purposes: ["visible-proxy"] },
  { label: "table", prefabRecipeId: "spatial.table", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "desk", prefabRecipeId: "spatial.desk", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "couch", prefabRecipeId: "spatial.couch", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "chair", prefabRecipeId: "spatial.chair", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "bed", prefabRecipeId: "spatial.bed", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "screen", prefabRecipeId: "spatial.screen", fallback: "box", purposes: ["visible-proxy"] },
  { label: "lamp", prefabRecipeId: "spatial.lamp", fallback: "box", purposes: ["visible-proxy"] },
  { label: "storage", prefabRecipeId: "spatial.storage", fallback: "box", purposes: ["visible-proxy", "static-collider"] },
  { label: "plant", prefabRecipeId: "spatial.plant", fallback: "box", purposes: ["visible-proxy"] },
  { label: "global-mesh", fallback: "mesh", purposes: ["occlusion", "static-collider"] },
];

export function buildSpatialConversionPlan(
  capture: SpatialCaptureDocument,
  rules: readonly SemanticPrefabRule[] = DEFAULT_SEMANTIC_PREFAB_RULES,
): SpatialConversionAction[] {
  const byLabel = new Map(rules.map((rule) => [normalizeSpatialSemanticLabel(rule.label), rule]));
  return capture.surfaces.map((surface) => {
    const label = String(normalizeSpatialSemanticLabel(surface.semanticLabel)).toLowerCase();
    const rule = byLabel.get(label);
    const scale: [number, number, number] = spatialSurfaceSize(surface) ?? [0.5, 0.5, 0.5];
    const purposes = surface.purposes?.length ? surface.purposes : (rule?.purposes ?? ["authoring-reference"]);
    const tags = ["spatial-capture", `semantic:${label}`, `source:${capture.source.transport}`, ...purposes.map((v) => `purpose:${v}`)];

    if (rule?.prefabRecipeId) {
      return {
        sourceSurfaceId: surface.id,
        semanticLabel: label,
        action: "prefab",
        prefabRecipeId: rule.prefabRecipeId,
        primitive: { shape: "box", position: surface.pose.position, rotationQuaternion: surface.pose.rotation, scale },
        purposes,
        tags,
      };
    }

    const fallback = rule?.fallback ?? (surface.mesh ? "mesh" : "box");
    if (fallback === "ignore") return { sourceSurfaceId: surface.id, semanticLabel: label, action: "ignore", purposes, tags };
    if (fallback === "mesh") return { sourceSurfaceId: surface.id, semanticLabel: label, action: purposes.includes("occlusion") ? "occlusion-mesh" : "collision-mesh", purposes, tags };
    return {
      sourceSurfaceId: surface.id,
      semanticLabel: label,
      action: "primitive",
      primitive: { shape: fallback, position: surface.pose.position, rotationQuaternion: surface.pose.rotation, scale },
      purposes,
      tags,
    };
  });
}
