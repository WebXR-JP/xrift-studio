import { ShapeUtils, Vector2 } from "three";
import type { SpatialCaptureDocument, SpatialSurface } from "./spatial-capture";

const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

function pad4(value: number): number { return (value + 3) & ~3; }
function pushU32(view: DataView, offset: number, value: number): number { view.setUint32(offset, value, true); return offset + 4; }

function triangulateSurface(surface: SpatialSurface): { vertices: number[]; indices: number[] } | null {
  if (surface.mesh?.vertices.length) {
    const vertices = [...surface.mesh.vertices];
    const count = Math.floor(vertices.length / 3);
    const indices = surface.mesh.indices.length
      ? [...surface.mesh.indices]
      : Array.from({ length: Math.floor(count / 3) * 3 }, (_, index) => index);
    return indices.length >= 3 ? { vertices, indices } : null;
  }
  const points = surface.boundary?.points ?? [];
  if (points.length < 3) return null;
  const vertices = points.flatMap((point) => [point[0], point[1], point[2]]);
  // WebXR plane polygons use local X/Z; ear clipping preserves concave rooms.
  const indices = ShapeUtils.triangulateShape(points.map(p => new Vector2(p[0], p[2])), []).flat();
  return { vertices, indices };
}

function minMax(vertices: readonly number[]) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < vertices.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], Number(vertices[index + axis]));
      max[axis] = Math.max(max[axis], Number(vertices[index + axis]));
    }
  }
  return { min, max };
}

/**
 * Serializes the exact local Plane/Mesh geometry returned by WebXR/Quest Scene
 * Understanding to a standard GLB 2.0 model. Pose is intentionally not baked
 * into vertices; XRift places the model Entity with the captured pose.
 */
export function spatialSurfaceGeometryToGlb(surface: SpatialSurface, capture?: SpatialCaptureDocument): Uint8Array | null {
  const geometry = triangulateSurface(surface);
  if (!geometry) return null;
  const positions = new Float32Array(geometry.vertices);
  const maxIndex = geometry.indices.reduce((max, value) => Math.max(max, value), 0);
  const useU32 = maxIndex > 65535;
  const indices = useU32 ? new Uint32Array(geometry.indices) : new Uint16Array(geometry.indices);
  const positionBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  const indexBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const indexOffset = pad4(positionBytes.byteLength);
  const binaryLength = pad4(indexOffset + indexBytes.byteLength);
  const binary = new Uint8Array(binaryLength);
  binary.set(positionBytes, 0);
  binary.set(indexBytes, indexOffset);
  const bounds = minMax(geometry.vertices);
  const semantic = String(surface.semanticLabel ?? "other");
  const gltf = {
    asset: {
      version: "2.0",
      generator: "XRift Studio Spatial Capture",
      extras: {
        xriftSpatialCapture: true,
        captureId: capture?.captureId,
        sourceSurfaceId: surface.id,
        semanticLabel: semantic,
        sourceSemanticLabel: surface.sourceSemanticLabel,
        sourceTransport: capture?.source.transport,
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: `Spatial ${semantic}`, mesh: 0, extras: { semanticLabel: semantic, sourceSemanticLabel: surface.sourceSemanticLabel, sourceSurfaceId: surface.id, captureId: capture?.captureId } }],
    meshes: [{ name: `Spatial ${semantic}`, primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4, material: 0 }] }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: bounds.min, max: bounds.max },
      { bufferView: 1, componentType: useU32 ? 5125 : 5123, count: indices.length, type: "SCALAR", min: [0], max: [maxIndex] },
    ],
  };
  const jsonRaw = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = pad4(jsonRaw.byteLength);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  let offset = 0;
  offset = pushU32(view, offset, 0x46546c67);
  offset = pushU32(view, offset, 2);
  offset = pushU32(view, offset, totalLength);
  offset = pushU32(view, offset, jsonLength);
  offset = pushU32(view, offset, GLB_JSON);
  output.set(jsonRaw, offset);
  output.fill(0x20, offset + jsonRaw.length, offset + jsonLength);
  offset += jsonLength;
  offset = pushU32(view, offset, binaryLength);
  offset = pushU32(view, offset, GLB_BIN);
  output.set(binary, offset);
  return output;
}
