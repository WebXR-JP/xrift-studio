import { Quaternion } from "three";
import { createSpatialCapture, migrateSpatialCapture, type SpatialSurface } from "./spatial-capture";

export type NativeRoomCapabilities = {
  runtime: string;
  available: boolean;
  missingExtensions: string[];
  mesh: boolean;
  message: string;
};
export type NativeRoom = {
  runtime: string;
  referenceSpace: "bounded-floor";
  warnings: string[];
  surfaces: Array<{
    id: string;
    labels: string;
    position: [number, number, number];
    rotation: [number, number, number, number];
    boundaryXY?: Array<[number, number]>;
    bounds?: SpatialSurface["bounds"];
    mesh?: SpatialSurface["mesh"];
  }>;
};

/** FB planes use local XY; the shared importer uses XZ. Preserve world geometry. */
export function nativeRoomToCapture(room: NativeRoom) {
  if (room.referenceSpace !== "bounded-floor") throw new Error("OpenXRの床基準座標を確認できませんでした。");
  const rotatePlane = new Quaternion(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  const surfaces: SpatialSurface[] = room.surfaces.map(s => {
    const label = s.labels.split(",").map(x => x.trim()).find(Boolean) ?? "other";
    const pose = { position: s.position, rotation: s.rotation };
    if (s.mesh?.vertices.length) return { id: s.id, kind: "mesh", pose, semanticLabel: label, sourceSemanticLabel: s.labels, mesh: s.mesh, bounds: s.bounds };
    // Prefer volume bounds for furniture. Its original local frame must remain intact.
    if (s.bounds) return { id: s.id, kind: "bounded-object", pose, semanticLabel: label, sourceSemanticLabel: s.labels, bounds: s.bounds };
    if (s.boundaryXY && s.boundaryXY.length >= 3) {
      const rotation = new Quaternion(...s.rotation).multiply(rotatePlane).toArray() as [number, number, number, number];
      return { id: s.id, kind: "plane", pose: { ...pose, rotation }, semanticLabel: label, sourceSemanticLabel: s.labels, boundary: { points: s.boundaryXY.map(([x,y]) => [x,0,-y]) } };
    }
    throw new Error(`形状または寸法がない部屋データです: ${s.id}`);
  });
  // Reuse the same limits/finite values/index validation as file imports before disk writes.
  return migrateSpatialCapture(createSpatialCapture({ captureId: crypto.randomUUID(), createdAt: new Date().toISOString(), source: { transport: "openxr", runtime: room.runtime }, referenceSpace: "bounded-floor", surfaces }));
}
