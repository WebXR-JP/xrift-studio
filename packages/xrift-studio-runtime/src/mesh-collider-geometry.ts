import type { BufferGeometry, InstancedMesh, Matrix4, Mesh, Object3D } from "three";

export type XriftMeshColliderType = "trimesh" | "hull" | "cuboid" | "ball";
export type XriftMeshColliderGeometry = { vertices: Float32Array; indices: Uint32Array };
export type XriftMeshColliderShape = {
  key: string;
  geometry: XriftMeshColliderGeometry;
  position: [number, number, number];
  ballPosition: [number, number, number];
  quaternion: [number, number, number, number];
  halfExtents: [number, number, number];
  radius: number;
};

/** Read accessors, not .array: imported glTF can have interleaved attributes. */
export function bakeXriftColliderGeometry(
  position: { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number },
  index: { count: number; getX(index: number): number } | null,
  matrix: readonly number[],
  flipWinding = false,
): XriftMeshColliderGeometry | null {
  if (position.count < 3) return null;
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) throw new Error("衝突判定のTransformが不正です");
  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const offset = i * 3;
    vertices[offset] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    vertices[offset + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    vertices[offset + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
    if (!Number.isFinite(vertices[offset]) || !Number.isFinite(vertices[offset + 1]) || !Number.isFinite(vertices[offset + 2])) {
      throw new Error("衝突判定のメッシュに不正な頂点があります");
    }
  }
  const count = index?.count ?? position.count;
  if (count % 3 !== 0) throw new Error("衝突判定のメッシュが三角形になっていません");
  const triangles: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    if (![a, b, c].every((value) => Number.isInteger(value) && value >= 0 && value < position.count)) {
      throw new Error("衝突判定のメッシュに範囲外の頂点番号があります");
    }
    const abx = vertices[b * 3]! - vertices[a * 3]!;
    const aby = vertices[b * 3 + 1]! - vertices[a * 3 + 1]!;
    const abz = vertices[b * 3 + 2]! - vertices[a * 3 + 2]!;
    const acx = vertices[c * 3]! - vertices[a * 3]!;
    const acy = vertices[c * 3 + 1]! - vertices[a * 3 + 1]!;
    const acz = vertices[c * 3 + 2]! - vertices[a * 3 + 2]!;
    if (aby * acz - abz * acy === 0 && abz * acx - abx * acz === 0 && abx * acy - aby * acx === 0) continue;
    triangles.push(a, flipWinding ? c : b, flipWinding ? b : c);
  }
  return triangles.length ? { vertices, indices: new Uint32Array(triangles) } : null;
}

/** Rendering visibility/distance/materials must not switch physical floors off. */
function skipsXriftColliderObject(object: Object3D, root: Object3D): boolean {
  return object.userData.xriftColliderExclude === true ||
    object.userData.xriftCollisionDisabled === true ||
    (object !== root && (object.userData.xriftRigidBodyBoundary === true ||
      object.userData.r3RapierType === "MeshCollider"));
}

/** Colliders use the owning body's coordinate space, not nested scaled groups. */
export function findXriftColliderBody(root: Object3D): Object3D | null {
  let parent = root.parent;
  while (parent) {
    if (parent.userData.xriftRigidBodyBoundary === true) return parent;
    parent = parent.parent;
  }
  return null;
}

export function collectXriftMeshColliderShapes(root: Object3D, collisionSpace: Object3D = root): XriftMeshColliderShape[] {
  root.updateWorldMatrix(true, true);
  if (root.matrixWorld.determinant() === 0) throw new Error("衝突判定のScaleに0が含まれています");
  collisionSpace.updateWorldMatrix(true, false);
  const inverse = collisionSpace.matrixWorld.clone().invert();
  const result: XriftMeshColliderShape[] = [];
  let candidateCount = 0;
  const append = (mesh: Mesh, geometry: BufferGeometry, matrix: Matrix4, key: string, worldDeterminant: number) => {
    candidateCount += 1;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const baked = bakeXriftColliderGeometry(position, geometry.getIndex(), matrix.elements, worldDeterminant < 0);
    if (!baked) return;
    // Bounding primitives retain the mesh's own orientation, unlike an AABB of
    // the entire Entity. Mesh colliders bake child transforms only once.
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const center = mesh.position.clone();
    const scale = mesh.scale.clone();
    const rotation = mesh.quaternion.clone();
    matrix.decompose(center, rotation, scale);
    const box = geometry.boundingBox;
    const half = box ? box.getSize(mesh.position.clone()).multiplyScalar(0.5) : mesh.position.clone().set(0, 0, 0);
    if (box) box.getCenter(center).applyMatrix4(matrix);
    const ballCenter = geometry.boundingSphere?.center.clone().applyMatrix4(matrix) ?? center;
    result.push({
      key, geometry: baked,
      position: [center.x, center.y, center.z],
      ballPosition: [ballCenter.x, ballCenter.y, ballCenter.z],
      quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
      halfExtents: [half.x * Math.abs(scale.x), half.y * Math.abs(scale.y), half.z * Math.abs(scale.z)],
      radius: (geometry.boundingSphere?.radius ?? 0) * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)),
    });
  };
  const visit = (object: Object3D) => {
    if (skipsXriftColliderObject(object, root)) return;
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const local = inverse.clone().multiply(mesh.matrixWorld);
      const instanced = mesh as InstancedMesh;
      if (instanced.isInstancedMesh) {
        const instanceMatrix = local.clone();
        for (let i = 0; i < instanced.count; i += 1) {
          instanced.getMatrixAt(i, instanceMatrix);
          append(mesh, mesh.geometry, local.clone().multiply(instanceMatrix), `${mesh.uuid}:${i}`, mesh.matrixWorld.determinant() * instanceMatrix.determinant());
        }
      } else append(mesh, mesh.geometry, local, mesh.uuid, mesh.matrixWorld.determinant());
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  if (candidateCount > 0 && result.length === 0) throw new Error("Mesh Colliderに有効な三角形がありません");
  return result;
}

/** Watch actual Three children, including asynchronous <primitive> replacement. */
export function observeXriftColliderChildren(root: Object3D, changed: () => void): () => void {
  const observed = new Set<Object3D>();
  const onAdded = (event: { child: Object3D }) => { attach(event.child); changed(); };
  const onRemoved = (event: { child: Object3D }) => { detach(event.child); changed(); };
  const attach = (object: Object3D) => {
    if (observed.has(object) || skipsXriftColliderObject(object, root)) return;
    observed.add(object);
    object.addEventListener("childadded", onAdded);
    object.addEventListener("childremoved", onRemoved);
    for (const child of object.children) attach(child);
  };
  const detach = (object: Object3D) => {
    observed.delete(object);
    object.removeEventListener("childadded", onAdded);
    object.removeEventListener("childremoved", onRemoved);
    for (const child of object.children) detach(child);
  };
  attach(root);
  return () => {
    for (const object of observed) {
      object.removeEventListener("childadded", onAdded);
      object.removeEventListener("childremoved", onRemoved);
    }
    observed.clear();
  };
}
