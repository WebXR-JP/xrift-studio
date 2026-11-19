/**
 * ライトマップの各ピクセル（テクセル）が、どの三角形のどこを担当するかを決める。
 *
 * テクセルの中心が三角形の中にあれば、その位置を担当する。中心がわずかに外れた
 * テクセルも、チャートの縁から1ピクセル以内なら縁の位置を担当させる。描画時に
 * 隣のテクセルと混ぜて読むため、縁のすぐ外のテクセルにも正しい色が要る。
 */

/** チャートの縁から、これ以内にあるテクセルへ縁の色を焼く（ピクセル）。 */
const EDGE_REACH = 1;

export type AtlasRaster = {
  size: number;
  /** テクセルが担当する三角形。担当なしは -1。 */
  triangle: Int32Array;
  /** 担当位置の重心座標（頂点1の重み、頂点2の重み）。 */
  barycentric: Float32Array;
  /** 0: 担当なし、1: 中心が三角形の中、2: 縁から伸ばした。 */
  coverage: Uint8Array;
  /** 担当のあるテクセルの番号を並べたもの。 */
  texels: Uint32Array;
};

/**
 * @param lightmapUvs 三角形の頂点のライトマップ上の位置。1三角形6要素、単位はピクセル。
 * @param receives 立っている三角形だけを焼く。ライトマップを受けない面を除くため。
 */
export function rasterizeAtlas(
  size: number,
  lightmapUvs: Float32Array,
  receives: Uint8Array,
): AtlasRaster {
  const texelCount = size * size;
  const triangle = new Int32Array(texelCount).fill(-1);
  const barycentric = new Float32Array(texelCount * 2);
  const distance = new Float32Array(texelCount).fill(Infinity);
  const triangleCount = Math.floor(lightmapUvs.length / 6);

  for (let index = 0; index < triangleCount; index += 1) {
    if (!receives[index]) continue;
    const base = index * 6;
    const x0 = lightmapUvs[base]!;
    const y0 = lightmapUvs[base + 1]!;
    const x1 = lightmapUvs[base + 2]!;
    const y1 = lightmapUvs[base + 3]!;
    const x2 = lightmapUvs[base + 4]!;
    const y2 = lightmapUvs[base + 5]!;
    if (!Number.isFinite(x0 + y0 + x1 + y1 + x2 + y2)) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - EDGE_REACH - 0.5));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) + EDGE_REACH - 0.5));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - EDGE_REACH - 0.5));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) + EDGE_REACH - 0.5));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const invArea = Math.abs(area) > 1e-12 ? 1 / area : 0;
    for (let y = minY; y <= maxY; y += 1) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        let u = 0;
        let v = 0;
        let reach = 0;
        let inside = false;
        if (invArea !== 0) {
          u = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) * invArea;
          v = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) * invArea;
          inside = u >= 0 && v >= 0 && u + v <= 1;
        }
        if (!inside) {
          const closest = closestPointOnTriangle(px, py, x0, y0, x1, y1, x2, y2);
          reach = closest.distance;
          if (reach > EDGE_REACH) continue;
          u = closest.u;
          v = closest.v;
        }
        const texel = y * size + x;
        if (reach >= distance[texel]!) continue;
        distance[texel] = reach;
        triangle[texel] = index;
        barycentric[texel * 2] = u;
        barycentric[texel * 2 + 1] = v;
      }
    }
  }

  const coverage = new Uint8Array(texelCount);
  let covered = 0;
  for (let texel = 0; texel < texelCount; texel += 1) {
    if (triangle[texel]! < 0) continue;
    coverage[texel] = distance[texel] === 0 ? 1 : 2;
    covered += 1;
  }
  const texels = new Uint32Array(covered);
  let cursor = 0;
  for (let texel = 0; texel < texelCount; texel += 1) {
    if (triangle[texel]! >= 0) texels[cursor++] = texel;
  }
  return { size, triangle, barycentric, coverage, texels };
}

const closestResult = { u: 0, v: 0, distance: 0 };

/**
 * 平面上の点から三角形へのいちばん近い点。三角形の外にある点を、縁へ寄せるために使う。
 * 戻り値は使い回すので、次に呼ぶ前に読み切ること。
 */
export function closestPointOnTriangle(
  px: number, py: number,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
): { u: number; v: number; distance: number } {
  let best = Infinity;
  let bestU = 0;
  let bestV = 0;
  // 辺 0-1
  {
    const dx = x1 - x0, dy = y1 - y0;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq > 0 ? ((px - x0) * dx + (py - y0) * dy) / lengthSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x0 + dx * t - px, cy = y0 + dy * t - py;
    const d = cx * cx + cy * cy;
    if (d < best) { best = d; bestU = t; bestV = 0; }
  }
  // 辺 1-2
  {
    const dx = x2 - x1, dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lengthSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + dx * t - px, cy = y1 + dy * t - py;
    const d = cx * cx + cy * cy;
    if (d < best) { best = d; bestU = 1 - t; bestV = t; }
  }
  // 辺 0-2
  {
    const dx = x2 - x0, dy = y2 - y0;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq > 0 ? ((px - x0) * dx + (py - y0) * dy) / lengthSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x0 + dx * t - px, cy = y0 + dy * t - py;
    const d = cx * cx + cy * cy;
    if (d < best) { best = d; bestU = 0; bestV = t; }
  }
  closestResult.u = bestU;
  closestResult.v = bestV;
  closestResult.distance = Math.sqrt(best);
  return closestResult;
}
