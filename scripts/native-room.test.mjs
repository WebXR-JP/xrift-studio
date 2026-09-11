import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { Quaternion, Vector3 } from 'three';
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { nativeRoomToCapture } = await server.ssrLoadModule('/src/lib/visual-editor/value-up/spatial-xr/native-room.ts');
const { spatialSurfaceGeometryToGlb } = await server.ssrLoadModule('/src/lib/visual-editor/value-up/spatial-xr/spatial-mesh-glb.ts');
const { migrateSpatialCapture } = await server.ssrLoadModule('/src/lib/visual-editor/value-up/spatial-xr/spatial-capture.ts');
await server.close();
const surface = { id: 'wall', labels: 'WALL_FACE', position: [2,1,3], rotation: [0,0,0,1], boundaryXY: [[0,0],[2,0],[2,3],[0,3]] };
const room = s => ({ runtime: 'test', referenceSpace: 'bounded-floor', surfaces: [s], warnings: [] });
test('FB XY boundary keeps world geometry when converted to importer XZ', () => {
  const s = nativeRoomToCapture(room(surface)).surfaces[0];
  for (let n=0;n<4;n++) {
    const p = new Vector3(...s.boundary.points[n]).applyQuaternion(new Quaternion(...s.pose.rotation)).add(new Vector3(...s.pose.position));
    assert.ok(p.distanceTo(new Vector3(surface.boundaryXY[n][0]+2,surface.boundaryXY[n][1]+1,3)) < 1e-6);
  }
  assert.equal(s.semanticLabel,'wall');
});
test('mesh and volume preserve native pose without plane rotation', () => {
  const mesh = { vertices: [0,0,0,1,0,0,0,1,0], indices: [0,1,2] };
  const s = nativeRoomToCapture(room({ ...surface, mesh })).surfaces[0];
  assert.deepEqual(s.pose.rotation, surface.rotation);
  assert.deepEqual(s.mesh, mesh);
  const bounds = { min: [-1,-1,-1], max: [1,1,1] };
  const b = nativeRoomToCapture(room({ ...surface, bounds })).surfaces[0];
  assert.deepEqual(b.bounds, bounds);
  assert.equal(b.kind,'bounded-object');
});
test('invalid native payload is rejected before asset persistence', () => {
  assert.throws(() => nativeRoomToCapture(room({ ...surface, position: [NaN,0,0] })));
  assert.throws(() => nativeRoomToCapture(room({ ...surface, rotation: [0,0,0] })));
  assert.throws(() => nativeRoomToCapture(room({ ...surface, rotation: [0,0,0,0] })));
  assert.throws(() => nativeRoomToCapture(room({ ...surface, mesh: { vertices: [0,0,0], indices: [0,1,2] } })));
  assert.throws(() => nativeRoomToCapture({ ...room(surface), referenceSpace: 'local' }));
});
test('full vendor labels survive normalization and identify OpenXR source', () => {
  const c = nativeRoomToCapture(room({ ...surface, labels: 'WALL_FACE,UNKNOWN_VENDOR_TAG' }));
  assert.equal(c.surfaces[0].sourceSemanticLabel,'WALL_FACE,UNKNOWN_VENDOR_TAG');
  assert.equal(c.source.transport,'openxr');
});

test('capture import validates the reference frame and source metadata', () => {
  const capture = nativeRoomToCapture(room(surface));
  assert.throws(() => migrateSpatialCapture({ ...capture, referenceSpace: 'view' }));
  assert.throws(() => migrateSpatialCapture({ ...capture, source: { transport: ['openxr'] } }));
  assert.throws(() => migrateSpatialCapture({ ...capture, source: { transport: 'openxr', runtime: {} } }));
  assert.equal(migrateSpatialCapture({ surfaces: [] }).source.transport, 'import');
});

function glbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
}

test('GLB accessors use the serialized float32 bounds and actual index range', () => {
  const captured = nativeRoomToCapture(room(surface)).surfaces[0];
  const mesh = { vertices: [0,0,0, 0.1,0,0, 1.1,0,0, 0.1,0.1,0], indices: [1,2,3] };
  const bytes = spatialSurfaceGeometryToGlb({ ...captured, mesh });
  const gltf = glbJson(bytes);
  assert.equal(gltf.accessors[0].max[0], Math.fround(1.1));
  assert.equal(gltf.accessors[0].max[1], Math.fround(0.1));
  assert.deepEqual(gltf.accessors[1].min, [1]);
  assert.deepEqual(gltf.accessors[1].max, [3]);
});

test('GLB does not emit empty triangles or a uint16 primitive-restart index', () => {
  const captured = nativeRoomToCapture(room(surface)).surfaces[0];
  assert.equal(spatialSurfaceGeometryToGlb({ ...captured, boundary: { points: [[0,0,0],[1,0,0],[2,0,0]] } }), null);
  const vertices = Array(65536 * 3).fill(0);
  vertices[3] = 1;
  vertices[65535 * 3 + 2] = 1;
  const gltf = glbJson(spatialSurfaceGeometryToGlb({ ...captured, mesh: { vertices, indices: [0,1,65535] } }));
  assert.equal(gltf.accessors[1].componentType, 5125);
});
