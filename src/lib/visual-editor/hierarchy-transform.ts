import type { SceneDocument, SceneEntity, TransformComponent, Vec3 } from "./scene-document";

/** Column-major affine matrices; no renderer or mutable Object3D is required. */
export type HierarchyMatrix = number[];
export const identityHierarchyMatrix = (): HierarchyMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiplyHierarchyMatrices(a: HierarchyMatrix, b: HierarchyMatrix): HierarchyMatrix {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}

export function hierarchyTransformMatrix(transform?: Pick<TransformComponent, "position" | "rotation" | "scale">): HierarchyMatrix {
  if (!transform) return identityHierarchyMatrix();
  const [x, y, z] = transform.rotation;
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const [sx, sy, sz] = transform.scale;
  const [px, py, pz] = transform.position;
  return [c * e * sx, (a * f + b * e * d) * sx, (b * f - a * e * d) * sx, 0,
    -c * f * sy, (a * e - b * f * d) * sy, (b * e + a * f * d) * sy, 0,
    d * sz, -b * c * sz, a * c * sz, 0, px, py, pz, 1];
}

export function hierarchyWorldMatrix(scene: SceneDocument, entityId: string): HierarchyMatrix {
  const ancestors: (TransformComponent | undefined)[] = [];
  const visited = new Set<string>();
  let id: string | null = entityId;
  while (id !== null) {
    if (visited.has(id)) throw new Error("Hierarchyが循環しています。親子関係を確認してください。");
    visited.add(id);
    const entity: SceneEntity | undefined = scene.entities[id];
    if (!entity) throw new Error(`親Entityが見つかりません: ${id}`);
    ancestors.push(entity.components.find((component): component is TransformComponent => component.type === "transform"));
    id = entity.parentId;
  }
  return ancestors.reverse().reduce((matrix, transform) => multiplyHierarchyMatrices(matrix, hierarchyTransformMatrix(transform)), identityHierarchyMatrix());
}

export function inverseHierarchyMatrix(m: HierarchyMatrix): HierarchyMatrix {
  const [a, b, c] = [m[0], m[4], m[8]], [d, e, f] = [m[1], m[5], m[9]], [g, h, i] = [m[2], m[6], m[10]];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error("追加先のScaleに0が含まれています。Scene直下を選んでください。");
  const k = 1 / determinant;
  const result = [(e * i - f * h) * k, (f * g - d * i) * k, (d * h - e * g) * k, 0,
    (c * h - b * i) * k, (a * i - c * g) * k, (b * g - a * h) * k, 0,
    (b * f - c * e) * k, (c * d - a * f) * k, (a * e - b * d) * k, 0, 0, 0, 0, 1];
  for (let row = 0; row < 3; row++) result[12 + row] = -(result[row] * m[12] + result[4 + row] * m[13] + result[8 + row] * m[14]);
  return result;
}

/** A rotated non-uniform scale may contain shear, which Transform cannot store. Never silently approximate it. */
export function hierarchyMatrixTransform(m: HierarchyMatrix): Pick<TransformComponent, "position" | "rotation" | "scale"> {
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  if (det < 0) sx = -sx;
  if (![sx, sy, sz].every((value) => Number.isFinite(value) && Math.abs(value) > 1e-12)) throw new Error("Scaleが0の階層は元の配置を保てません。「ローカル座標」を選んでください。");
  const r11 = m[0] / sx, r12 = m[4] / sy, r13 = m[8] / sz;
  const r21 = m[1] / sx, r22 = m[5] / sy, r23 = m[9] / sz;
  const r31 = m[2] / sx, r32 = m[6] / sy, r33 = m[10] / sz;
  const shear = Math.max(Math.abs(r11 * r12 + r21 * r22 + r31 * r32), Math.abs(r11 * r13 + r21 * r23 + r31 * r33), Math.abs(r12 * r13 + r22 * r23 + r32 * r33));
  if (shear > 1e-6) throw new Error("親の回転と非均一Scaleを含むため、元の配置を保てません。親ごと選ぶか「ローカル座標」を選んでください。");
  const rotation: Vec3 = Math.abs(r13) < 0.9999999
    ? [Math.atan2(-r23, r33), Math.asin(Math.max(-1, Math.min(1, r13))), Math.atan2(-r12, r11)]
    : [Math.atan2(r32, r22), Math.asin(Math.max(-1, Math.min(1, r13))), 0];
  return { position: [m[12], m[13], m[14]], rotation, scale: [sx, sy, sz] };
}
