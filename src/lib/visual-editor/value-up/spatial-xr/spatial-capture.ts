export const SPATIAL_CAPTURE_SCHEMA_VERSION = "0.2.0" as const;

export const META_SCENE_LABEL_ALIASES: Readonly<Record<string, string>> = {
  FLOOR: "floor",
  CEILING: "ceiling",
  WALL_FACE: "wall",
  INNER_WALL_FACE: "wall",
  OTHER_ROOM_FACE: "wall",
  INVISIBLE_WALL_FACE: "invisible-wall",
  DOOR_FRAME: "door",
  WINDOW_FRAME: "window",
  WALL_ART: "wall-art",
  TABLE: "table",
  DESK: "desk",
  COUCH: "couch",
  SOFA: "couch",
  CHAIR: "chair",
  BED: "bed",
  SCREEN: "screen",
  LAMP: "lamp",
  STORAGE: "storage",
  PLANT: "plant",
  GLOBAL_MESH: "global-mesh",
  SCENE_MESH: "global-mesh",
  OPENING: "opening",
  OTHER: "other",
};

export type SpatialSemanticLabel =
  | "floor" | "ceiling" | "wall" | "invisible-wall" | "door" | "window"
  | "wall-art" | "opening" | "table" | "desk" | "couch" | "chair" | "bed"
  | "screen" | "lamp" | "storage" | "plant" | "global-mesh" | "other";

export type SpatialPose = {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale?: [number, number, number];
};

export type SpatialBoundary = { points: Array<[number, number, number]> };
export type SpatialMesh = {
  /** xyz triples in local surface coordinates. */
  vertices: number[];
  /** triangle indices. */
  indices: number[];
};

export type SpatialSurfacePurpose = "authoring-reference" | "visible-proxy" | "static-collider" | "occlusion";

export type SpatialSurface = {
  id: string;
  kind: "plane" | "mesh" | "anchor" | "bounded-object" | "hit-test";
  semanticLabel?: SpatialSemanticLabel | string;
  /** Original runtime/vendor label, preserved for round-trip diagnostics. */
  sourceSemanticLabel?: string;
  pose: SpatialPose;
  orientation?: "horizontal" | "vertical" | "unknown";
  boundary?: SpatialBoundary;
  mesh?: SpatialMesh;
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  persistentAnchorHandle?: string;
  confidence?: number;
  lastChangedTime?: number;
  purposes?: SpatialSurfacePurpose[];
};

export type SpatialPlacement = {
  id: string;
  pose: SpatialPose;
  source: "hit-test" | "controller" | "hand" | "gaze";
  inputHandedness?: "left" | "right" | "none";
  anchorHandle?: string;
  semanticLabel?: string;
};

export type SpatialDepthSummary = {
  available: boolean;
  usage?: "cpu-optimized" | "gpu-optimized" | string;
  dataFormat?: "float32" | "luminance-alpha" | string;
  width?: number;
  height?: number;
  rawValueToMeters?: number;
};

export type SpatialFeatureSnapshot = {
  mode: "immersive-ar" | "immersive-vr" | "inline";
  enabled: string[];
  environmentBlendMode?: string;
  interactionMode?: string;
  inputProfiles?: string[];
  handTracking?: boolean;
  layers?: boolean;
  webgpu?: boolean;
  depth?: SpatialDepthSummary;
};

export type SpatialCaptureDocument = {
  schemaVersion: typeof SPATIAL_CAPTURE_SCHEMA_VERSION;
  captureId: string;
  createdAt: string;
  source: {
    transport: "webxr" | "openxr" | "import";
    runtime?: string;
    device?: string;
    userAgent?: string;
  };
  referenceSpace: "local-floor" | "local" | "bounded-floor" | "unbounded";
  coordinateSystem: "webxr-right-handed-y-up-meters";
  features?: SpatialFeatureSnapshot;
  surfaces: SpatialSurface[];
  placements?: SpatialPlacement[];
  roomBounds?: { min: [number, number, number]; max: [number, number, number] };
};

export function normalizeSpatialSemanticLabel(value: unknown): SpatialSemanticLabel | string {
  const original = String(value ?? "").trim();
  if (!original) return "other";
  const upper = original.replace(/[\s-]+/g, "_").toUpperCase();
  const alias = META_SCENE_LABEL_ALIASES[upper];
  if (alias) return alias;
  const normalized = original.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "wall-face") return "wall";
  if (normalized === "door-frame") return "door";
  if (normalized === "window-frame") return "window";
  return normalized;
}

export function createSpatialCapture(input: Omit<SpatialCaptureDocument, "schemaVersion" | "coordinateSystem"> & { coordinateSystem?: SpatialCaptureDocument["coordinateSystem"] }): SpatialCaptureDocument {
  return {
    schemaVersion: SPATIAL_CAPTURE_SCHEMA_VERSION,
    coordinateSystem: "webxr-right-handed-y-up-meters",
    ...input,
    surfaces: input.surfaces.map((surface) => ({
      ...surface,
      sourceSemanticLabel: surface.sourceSemanticLabel ?? (surface.semanticLabel ? String(surface.semanticLabel) : undefined),
      semanticLabel: normalizeSpatialSemanticLabel(surface.semanticLabel),
    })),
  };
}

export function migrateSpatialCapture(value: unknown): SpatialCaptureDocument {
  if (!value || typeof value !== "object") throw new Error("Spatial Capture JSONがオブジェクトではありません");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== undefined && !["0.1.0", SPATIAL_CAPTURE_SCHEMA_VERSION].includes(String(input.schemaVersion))) throw new Error("未対応のSpatial Captureバージョンです");
  if (input.coordinateSystem !== undefined && input.coordinateSystem !== "webxr-right-handed-y-up-meters") throw new Error("座標系は右手系・Y-up・メートルで指定してください");
  if (!Array.isArray(input.surfaces) || input.surfaces.length > 10000) throw new Error("surfacesは10000件以下の配列で指定してください");
  const ids = new Set<string>();
  const vector = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(x => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e8);
  const surfaces = input.surfaces.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Surfaceが不正です");
    const s = value as SpatialSurface;
    if (typeof s.id !== "string" || !s.id || ids.has(s.id)) throw new Error("Surface IDは重複しない文字列で指定してください");
    ids.add(s.id);
    if (!["plane", "mesh", "anchor", "bounded-object", "hit-test"].includes(s.kind)) throw new Error("Surface kindが不正です");
    if (!s.pose || !vector(s.pose.position, 3) || !vector(s.pose.rotation, 4)) throw new Error("Surface poseが不正です");
    const length = Math.hypot(...s.pose.rotation);
    if (length < 1e-8) throw new Error("回転Quaternionがゼロです");
    if (s.pose.scale && (!vector(s.pose.scale, 3) || s.pose.scale.some(v => v <= 0))) throw new Error("Scaleが不正です");
    if (s.bounds && (!vector(s.bounds.min, 3) || !vector(s.bounds.max, 3) || s.bounds.min.some((v, i) => v > s.bounds!.max[i]!))) throw new Error("Boundsが不正です");
    if (s.boundary && (!Array.isArray(s.boundary.points) || s.boundary.points.length > 100000 || s.boundary.points.some(p => !vector(p, 3)))) throw new Error("Plane polygonが不正です");
    if (s.mesh) {
      const { vertices, indices } = s.mesh;
      if (!Array.isArray(vertices) || vertices.length > 3000000 || vertices.length % 3 || !vertices.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e8)) throw new Error("Mesh頂点が不正です");
      if (!Array.isArray(indices) || indices.length > 6000000 || indices.length % 3 || !indices.every(v => Number.isInteger(v) && v >= 0 && v < vertices.length / 3)) throw new Error("Mesh indexが不正です");
    }
    if (s.semanticLabel !== undefined && typeof s.semanticLabel !== "string") throw new Error("Semantic Labelが不正です");
    if (s.purposes && (!Array.isArray(s.purposes) || s.purposes.some(p => !["authoring-reference", "visible-proxy", "static-collider", "occlusion"].includes(p)))) throw new Error("Surface purposeが不正です");
    return { ...s, pose: { ...s.pose, rotation: s.pose.rotation.map(v => v / length) as [number, number, number, number] } };
  });
  return createSpatialCapture({
    captureId: String(input.captureId ?? `import-${Date.now().toString(36)}`),
    createdAt: String(input.createdAt ?? new Date().toISOString()),
    source: (input.source && typeof input.source === "object" ? input.source : { transport: "import" }) as SpatialCaptureDocument["source"],
    referenceSpace: (input.referenceSpace as SpatialCaptureDocument["referenceSpace"]) ?? "local-floor",
    features: input.features as SpatialFeatureSnapshot | undefined,
    surfaces: surfaces as SpatialSurface[],
    placements: Array.isArray(input.placements) ? input.placements as SpatialPlacement[] : undefined,
    roomBounds: input.roomBounds as SpatialCaptureDocument["roomBounds"],
  });
}
