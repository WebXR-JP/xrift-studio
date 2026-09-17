import { bakeXriftColliderGeometry, findXriftColliderBody, observeXriftColliderChildren } from "../../../packages/xrift-studio-runtime/src/mesh-collider-geometry.js";
import type { Object3D } from "three";

/** Pure buffer/accessor and child-event contract tests; not a renderer simulation. */
export function runMeshColliderGeometryFixtureAssertions() {
  let assertions = 0;
  const assert = (condition: unknown, name: string) => { assertions++; if (!condition) throw new Error(`Mesh collider geometry: ${name}`); };
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const position = (values: number[], stride = 3, offset = 0) => ({ count: values.length / stride, getX: (i: number) => values[i*stride+offset]!, getY: (i: number) => values[i*stride+offset+1]!, getZ: (i: number) => values[i*stride+offset+2]! });
  const index = (values: number[]) => ({ count: values.length, getX: (i: number) => values[i]! });
  const xyz = [0,0,0, 0,0,2, 2,0,0];
  const raw = [9,0,0,0,8, 9,0,0,2,8, 9,2,0,0,8];
  const snapshot = raw.join();
  const interleaved = bakeXriftColliderGeometry(position(raw, 5, 1), index([0,1,2]), identity)!;
  assert([...interleaved.vertices].join() === xyz.join(), "interleaved coordinates do not copy stride padding");
  assert(raw.join() === snapshot, "cached model buffer remains unchanged");
  const transformed = bakeXriftColliderGeometry(position(xyz), null, [2,0,0,0, 0,3,0,0, 0,0,4,0, 10,5,-7,1])!;
  assert([...transformed.vertices].join() === [10,5,-7,10,5,1,14,5,-7].join(), "translate and nonuniform scale applied exactly once");
  const rotated = bakeXriftColliderGeometry(position(xyz), null, [0,1,0,0, -1,0,0,0, 0,0,1,0, 0,0,0,1])!;
  assert([...rotated.vertices].join() === [0,0,0,0,0,2,0,2,0].join(), "nested rotation baked in coordinates");
  const mirrored = bakeXriftColliderGeometry(position(xyz), index([0,1,2]), [-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], true)!;
  assert([...mirrored.indices].join() === "0,2,1" && mirrored.vertices[6] === -2, "negative scale reverses winding without losing mirrored vertices");
  const nonindexed = bakeXriftColliderGeometry(position([...xyz, ...xyz]), null, identity)!;
  assert(nonindexed.indices.length === 6, "nonindexed triangles receive Uint32 indices");
  assert(bakeXriftColliderGeometry(position([0,0,0,1,0,0]), null, identity) === null, "no phantom shape from fewer than 3 vertices");
  assert(bakeXriftColliderGeometry(position([0,0,0,1,0,0,2,0,0]), null, identity) === null, "degenerate triangles omitted");
  const rejects = (callback: () => unknown, name: string) => { let failed = false; try { callback(); } catch { failed = true; } assert(failed, name); };
  rejects(() => bakeXriftColliderGeometry(position([NaN,0,0,0,0,1,1,0,0]), null, identity), "reject nonfinite source vertex");
  rejects(() => bakeXriftColliderGeometry(position(xyz), index([0,1,100]), identity), "reject out-of-bounds index");
  rejects(() => bakeXriftColliderGeometry(position(xyz), index([0,1,1.5]), identity), "reject fractional index");
  rejects(() => bakeXriftColliderGeometry(position(xyz), index([0,1]), identity), "reject incomplete triangle");
  rejects(() => bakeXriftColliderGeometry(position(xyz), null, [...identity.slice(0,15), NaN]), "reject invalid transform");
  const many = new Array<number>(65_538*3).fill(0); many[65_536*3+2] = 1; many[65_537*3] = 1;
  const big = bakeXriftColliderGeometry(position(many), index([0,65_536,65_537]), identity)!;
  assert(big.indices[2] === 65_537, "large glTF vertex indices are not truncated to Uint16");

  // Deliberately only the Object3D event protocol is represented here. No fake
  // physics or WebGL is used to claim an end-to-end result.
  class Events {
    userData: Record<string, unknown> = {};
    children: Events[] = [];
    parent: Events | null = null;
    listeners = new Map<string, Set<(event: { child: Events }) => void>>();
    addEventListener(type: string, fn: (event: { child: Events }) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(fn); }
    removeEventListener(type: string, fn: (event: { child: Events }) => void) { this.listeners.get(type)?.delete(fn); }
    add(child: Events) { child.parent = this; this.children.push(child); for (const fn of this.listeners.get("childadded") ?? []) fn({ child }); }
    remove(child: Events) { child.parent = null; this.children = this.children.filter((item) => item !== child); for (const fn of this.listeners.get("childremoved") ?? []) fn({ child }); }
  }
  const root = new Events(), model = new Events(); let changes = 0;
  const stop = observeXriftColliderChildren(root as unknown as Object3D, () => { changes++; });
  root.add(model); assert(changes === 1, "late-loaded model schedules generation");
  const mesh = new Events(); model.add(mesh); assert(changes === 2, "late subtree is observed recursively");
  model.remove(mesh); assert(changes === 3, "replacement/removal rebuilds shape");
  mesh.add(new Events()); assert(changes === 3, "removed subtree listeners cleaned up");
  const body = new Events(); body.userData.xriftRigidBodyBoundary = true;
  root.add(body); const afterBody = changes; body.add(new Events());
  assert(changes === afterBody, "nested independent body is not recursively observed");
  const placeholder = new Events(); placeholder.userData.xriftColliderExclude = true;
  root.add(placeholder); const afterPlaceholder = changes; placeholder.add(new Events());
  assert(changes === afterPlaceholder, "loading placeholders and render-only copies are excluded");
  const bodyChild = new Events(); body.add(bodyChild);
  assert(findXriftColliderBody(bodyChild as unknown as Object3D) === (body as unknown as Object3D), "shape portal uses nearest rigid-body coordinates");
  assert(findXriftColliderBody(root as unknown as Object3D) === null, "unowned source has no invented body");
  stop(); root.add(new Events()); model.add(new Events()); assert(changes === afterPlaceholder, "unmount detaches all listeners");
  stop(); assert([...root.listeners.values()].every((entries) => entries.size === 0), "cleanup is idempotent");
  return { assertions };
}
