import { normalizeSpatialSemanticLabel, type SpatialCaptureDocument, type SpatialSemanticLabel, type SpatialSurface, type SpatialSurfacePurpose } from "./spatial-capture";

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

function dimensions(surface: SpatialSurface): [number, number, number] {
  if (surface.bounds) {
    return [
      Math.max(0.01, surface.bounds.max[0] - surface.bounds.min[0]),
      Math.max(0.01, surface.bounds.max[1] - surface.bounds.min[1]),
      Math.max(0.01, surface.bounds.max[2] - surface.bounds.min[2]),
    ];
  }
  if (surface.boundary?.points.length) {
    const xs = surface.boundary.points.map((p) => p[0]);
    const ys = surface.boundary.points.map((p) => p[1]);
    const zs = surface.boundary.points.map((p) => p[2]);
    // Plane polygons are local to planeSpace and therefore usually have y=0.
    // Keep a thin axis instead of collapsing the proxy to zero.
    return [
      Math.max(0.01, Math.max(...xs) - Math.min(...xs)),
      Math.max(0.01, Math.max(...ys) - Math.min(...ys)),
      Math.max(0.01, Math.max(...zs) - Math.min(...zs)),
    ];
  }
  return [0.5, 0.5, 0.5];
}

export function buildSpatialConversionPlan(
  capture: SpatialCaptureDocument,
  rules: readonly SemanticPrefabRule[] = DEFAULT_SEMANTIC_PREFAB_RULES,
): SpatialConversionAction[] {
  const byLabel = new Map(rules.map((rule) => [String(rule.label).toLowerCase(), rule]));
  return capture.surfaces.map((surface) => {
    const label = String(normalizeSpatialSemanticLabel(surface.semanticLabel)).toLowerCase();
    const rule = byLabel.get(label);
    const scale = dimensions(surface);
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
