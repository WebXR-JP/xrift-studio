import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { Quaternion, Vector3 } from 'three';
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { nativeRoomToCapture } = await server.ssrLoadModule('/src/lib/visual-editor/value-up/spatial-xr/native-room.ts');
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
  assert.throws(() => nativeRoomToCapture(room({ ...surface, mesh: { vertices: [0,0,0], indices: [0,1,2] } })));
  assert.throws(() => nativeRoomToCapture({ ...room(surface), referenceSpace: 'local' }));
});
test('full vendor labels survive normalization and identify OpenXR source', () => {
  const c = nativeRoomToCapture(room({ ...surface, labels: 'WALL_FACE,UNKNOWN_VENDOR_TAG' }));
  assert.equal(c.surfaces[0].sourceSemanticLabel,'WALL_FACE,UNKNOWN_VENDOR_TAG');
  assert.equal(c.source.transport,'openxr');
});
