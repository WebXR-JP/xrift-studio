/**
 * ライトベイクのレイを飛ばすための三角形BVH。
 *
 * 1テクセルあたり数百本のレイを数十万テクセルぶん飛ばすので、総当たりでは
 * 終わらない。三角形を箱の木にまとめ、当たりえない枝を箱ごと捨てる。
 *
 * three にも three-mesh-bvh にも依存させない。Web Worker へ渡せる型付き配列
 * だけで持ち、Node のfixtureでもブラウザでも同じ結果を返す。
 */

const LEAF_TARGET = 4;
const LEAF_MAX = 8;
const SAH_BINS = 12;
const STACK_DEPTH = 128;
const DIRECTION_EPSILON = 1e-20;

export type TriangleBvh = {
  /**
   * BVH順に並べ替えた三角形。1三角形9要素で、頂点0・辺1・辺2を持つ。
   * 辺で持つと交差判定のたびに引き算をしなくて済む。
   */
  triangles: Float32Array;
  /** BVH順の番号から、渡された順の三角形番号を引く。 */
  order: Uint32Array;
  /** 1ノード6要素の境界箱（min xyz, max xyz）。 */
  bounds: Float32Array;
  /** 内部ノードは右の子の番号（左の子は自分+1）。葉は先頭の三角形番号。 */
  link: Uint32Array;
  /** 内部ノードは0、葉は三角形の数。 */
  count: Uint8Array;
  /** 内部ノードを分けた軸。近い子から調べるために使う。 */
  axis: Uint8Array;
  nodeCount: number;
};

/**
 * 三角形の集まりからBVHを作る。
 *
 * @param positions 1三角形9要素（頂点0, 頂点1, 頂点2）のワールド座標。
 */
export function buildTriangleBvh(positions: Float32Array): TriangleBvh {
  const triangleCount = Math.floor(positions.length / 9);
  const order = new Uint32Array(triangleCount);
  const centroids = new Float32Array(triangleCount * 3);
  const triangleBounds = new Float32Array(triangleCount * 6);
  for (let index = 0; index < triangleCount; index += 1) {
    order[index] = index;
    const base = index * 9;
    for (let axis = 0; axis < 3; axis += 1) {
      const a = positions[base + axis]!;
      const b = positions[base + 3 + axis]!;
      const c = positions[base + 6 + axis]!;
      const low = Math.min(a, b, c);
      const high = Math.max(a, b, c);
      triangleBounds[index * 6 + axis] = low;
      triangleBounds[index * 6 + 3 + axis] = high;
      centroids[index * 3 + axis] = (low + high) * 0.5;
    }
  }

  const maxNodes = Math.max(1, triangleCount * 2);
  const bounds = new Float32Array(maxNodes * 6);
  const link = new Uint32Array(maxNodes);
  const count = new Uint8Array(maxNodes);
  const axisOfNode = new Uint8Array(maxNodes);
  let nodeCount = 0;

  // 明示的なスタックで組む。右の子を先に積み、左の子を直後に取り出すので、
  // 左の子は必ず「親の番号+1」になる。
  const stackStart: number[] = [0];
  const stackEnd: number[] = [triangleCount];
  const stackParent: number[] = [-1];
  const binCount = new Uint32Array(SAH_BINS);
  const binBounds = new Float32Array(SAH_BINS * 6);
  const rightArea = new Float64Array(SAH_BINS);

  while (stackStart.length > 0) {
    const start = stackStart.pop()!;
    const end = stackEnd.pop()!;
    const parent = stackParent.pop()!;
    const node = nodeCount;
    nodeCount += 1;
    if (parent >= 0) link[parent] = node;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    for (let cursor = start; cursor < end; cursor += 1) {
      const triangle = order[cursor]!;
      const b = triangle * 6;
      if (triangleBounds[b]! < minX) minX = triangleBounds[b]!;
      if (triangleBounds[b + 1]! < minY) minY = triangleBounds[b + 1]!;
      if (triangleBounds[b + 2]! < minZ) minZ = triangleBounds[b + 2]!;
      if (triangleBounds[b + 3]! > maxX) maxX = triangleBounds[b + 3]!;
      if (triangleBounds[b + 4]! > maxY) maxY = triangleBounds[b + 4]!;
      if (triangleBounds[b + 5]! > maxZ) maxZ = triangleBounds[b + 5]!;
      const c = triangle * 3;
      if (centroids[c]! < cMinX) cMinX = centroids[c]!;
      if (centroids[c + 1]! < cMinY) cMinY = centroids[c + 1]!;
      if (centroids[c + 2]! < cMinZ) cMinZ = centroids[c + 2]!;
      if (centroids[c]! > cMaxX) cMaxX = centroids[c]!;
      if (centroids[c + 1]! > cMaxY) cMaxY = centroids[c + 1]!;
      if (centroids[c + 2]! > cMaxZ) cMaxZ = centroids[c + 2]!;
    }
    const nodeBase = node * 6;
    bounds[nodeBase] = minX;
    bounds[nodeBase + 1] = minY;
    bounds[nodeBase + 2] = minZ;
    bounds[nodeBase + 3] = maxX;
    bounds[nodeBase + 4] = maxY;
    bounds[nodeBase + 5] = maxZ;

    const size = end - start;
    if (size <= LEAF_TARGET) {
      link[node] = start;
      count[node] = size;
      continue;
    }

    const extentX = cMaxX - cMinX;
    const extentY = cMaxY - cMinY;
    const extentZ = cMaxZ - cMinZ;
    let axis = 0;
    let extent = extentX;
    let axisMin = cMinX;
    if (extentY > extent) { axis = 1; extent = extentY; axisMin = cMinY; }
    if (extentZ > extent) { axis = 2; extent = extentZ; axisMin = cMinZ; }

    let middle = -1;
    if (extent > 0) {
      binCount.fill(0);
      for (let bin = 0; bin < SAH_BINS; bin += 1) {
        const b = bin * 6;
        binBounds[b] = binBounds[b + 1] = binBounds[b + 2] = Infinity;
        binBounds[b + 3] = binBounds[b + 4] = binBounds[b + 5] = -Infinity;
      }
      const scale = SAH_BINS / extent;
      for (let cursor = start; cursor < end; cursor += 1) {
        const triangle = order[cursor]!;
        let bin = Math.floor((centroids[triangle * 3 + axis]! - axisMin) * scale);
        if (bin >= SAH_BINS) bin = SAH_BINS - 1;
        if (bin < 0) bin = 0;
        binCount[bin] += 1;
        const b = bin * 6;
        const t = triangle * 6;
        if (triangleBounds[t]! < binBounds[b]!) binBounds[b] = triangleBounds[t]!;
        if (triangleBounds[t + 1]! < binBounds[b + 1]!) binBounds[b + 1] = triangleBounds[t + 1]!;
        if (triangleBounds[t + 2]! < binBounds[b + 2]!) binBounds[b + 2] = triangleBounds[t + 2]!;
        if (triangleBounds[t + 3]! > binBounds[b + 3]!) binBounds[b + 3] = triangleBounds[t + 3]!;
        if (triangleBounds[t + 4]! > binBounds[b + 4]!) binBounds[b + 4] = triangleBounds[t + 4]!;
        if (triangleBounds[t + 5]! > binBounds[b + 5]!) binBounds[b + 5] = triangleBounds[t + 5]!;
      }
      // 右から掃いて、各分割位置より右側の表面積を先に求めておく。
      let rMinX = Infinity, rMinY = Infinity, rMinZ = Infinity;
      let rMaxX = -Infinity, rMaxY = -Infinity, rMaxZ = -Infinity;
      for (let bin = SAH_BINS - 1; bin > 0; bin -= 1) {
        const b = bin * 6;
        if (binBounds[b]! < rMinX) rMinX = binBounds[b]!;
        if (binBounds[b + 1]! < rMinY) rMinY = binBounds[b + 1]!;
        if (binBounds[b + 2]! < rMinZ) rMinZ = binBounds[b + 2]!;
        if (binBounds[b + 3]! > rMaxX) rMaxX = binBounds[b + 3]!;
        if (binBounds[b + 4]! > rMaxY) rMaxY = binBounds[b + 4]!;
        if (binBounds[b + 5]! > rMaxZ) rMaxZ = binBounds[b + 5]!;
        rightArea[bin] = halfArea(rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ);
      }
      let lMinX = Infinity, lMinY = Infinity, lMinZ = Infinity;
      let lMaxX = -Infinity, lMaxY = -Infinity, lMaxZ = -Infinity;
      let leftCount = 0;
      let bestCost = Infinity;
      let bestBin = -1;
      for (let bin = 0; bin < SAH_BINS - 1; bin += 1) {
        const b = bin * 6;
        if (binBounds[b]! < lMinX) lMinX = binBounds[b]!;
        if (binBounds[b + 1]! < lMinY) lMinY = binBounds[b + 1]!;
        if (binBounds[b + 2]! < lMinZ) lMinZ = binBounds[b + 2]!;
        if (binBounds[b + 3]! > lMaxX) lMaxX = binBounds[b + 3]!;
        if (binBounds[b + 4]! > lMaxY) lMaxY = binBounds[b + 4]!;
        if (binBounds[b + 5]! > lMaxZ) lMaxZ = binBounds[b + 5]!;
        leftCount += binCount[bin]!;
        const rightCount = size - leftCount;
        if (leftCount === 0 || rightCount === 0) continue;
        const cost =
          halfArea(lMinX, lMinY, lMinZ, lMaxX, lMaxY, lMaxZ) * leftCount +
          rightArea[bin + 1]! * rightCount;
        if (cost < bestCost) {
          bestCost = cost;
          bestBin = bin;
        }
      }
      const leafCost = halfArea(minX, minY, minZ, maxX, maxY, maxZ) * size;
      if (bestBin >= 0 && (size > LEAF_MAX || bestCost < leafCost)) {
        // 選んだ位置で、その場で二つに分ける。
        let left = start;
        let right = end - 1;
        while (left <= right) {
          const triangle = order[left]!;
          let bin = Math.floor((centroids[triangle * 3 + axis]! - axisMin) * scale);
          if (bin >= SAH_BINS) bin = SAH_BINS - 1;
          if (bin < 0) bin = 0;
          if (bin <= bestBin) {
            left += 1;
          } else {
            order[left] = order[right]!;
            order[right] = triangle;
            right -= 1;
          }
        }
        middle = left;
      } else if (size <= LEAF_MAX) {
        link[node] = start;
        count[node] = size;
        continue;
      }
    } else if (size <= LEAF_MAX) {
      link[node] = start;
      count[node] = size;
      continue;
    }

    // 重心がすべて同じ場所にある、または分割がどちらかに偏った。葉を大きくしすぎない
    // よう、順番のまま半分に割る。
    if (middle <= start || middle >= end) middle = start + (size >> 1);

    count[node] = 0;
    axisOfNode[node] = axis;
    stackStart.push(middle);
    stackEnd.push(end);
    stackParent.push(node);
    stackStart.push(start);
    stackEnd.push(middle);
    stackParent.push(-1);
  }

  const triangles = new Float32Array(triangleCount * 9);
  for (let index = 0; index < triangleCount; index += 1) {
    const source = order[index]! * 9;
    const target = index * 9;
    const x0 = positions[source]!;
    const y0 = positions[source + 1]!;
    const z0 = positions[source + 2]!;
    triangles[target] = x0;
    triangles[target + 1] = y0;
    triangles[target + 2] = z0;
    triangles[target + 3] = positions[source + 3]! - x0;
    triangles[target + 4] = positions[source + 4]! - y0;
    triangles[target + 5] = positions[source + 5]! - z0;
    triangles[target + 6] = positions[source + 6]! - x0;
    triangles[target + 7] = positions[source + 7]! - y0;
    triangles[target + 8] = positions[source + 8]! - z0;
  }

  return {
    triangles,
    order,
    bounds: bounds.slice(0, nodeCount * 6),
    link: link.slice(0, nodeCount),
    count: count.slice(0, nodeCount),
    axis: axisOfNode.slice(0, nodeCount),
    nodeCount,
  };
}

function halfArea(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number {
  const x = maxX - minX;
  const y = maxY - minY;
  const z = maxZ - minZ;
  if (!(x >= 0) || !(y >= 0) || !(z >= 0)) return 0;
  return x * y + y * z + z * x;
}

/**
 * 当たった三角形を採用するかどうかを決める。抜きのあるMaterial（葉など）の
 * 透明な部分を素通りさせるために使う。
 *
 * @param triangle 渡された順の三角形番号。
 */
export type BvhHitFilter = (triangle: number, u: number, v: number) => boolean;

/**
 * BVHへレイを飛ばす。結果は自分のフィールドに書くので、1本ごとに
 * オブジェクトを作らない。Worker一つにつき一つ持つ。
 */
export class BvhRaycaster {
  /** 当たった位置までの距離。 */
  t = 0;
  /** 当たった位置の重心座標。頂点0の重みは 1 - u - v。 */
  u = 0;
  v = 0;
  /** 当たった三角形（渡された順の番号）。 */
  triangle = -1;
  /** 三角形を裏から突いた。閉じた形の内側から外を見たときに立つ。 */
  backface = false;

  private readonly stack = new Int32Array(STACK_DEPTH);

  constructor(
    private readonly bvh: TriangleBvh,
    /** 立っている三角形だけ `filter` に問い合わせる。BVH順ではなく渡された順。 */
    private readonly filtered?: Uint8Array,
    private readonly filter?: BvhHitFilter,
  ) {}

  /** いちばん近い交差を探す。見つかれば true を返し、フィールドへ書く。 */
  closest(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    tMin: number, tMax: number,
  ): boolean {
    const { triangles, order, bounds, link, count, axis, nodeCount } = this.bvh;
    if (nodeCount === 0) return false;
    const invX = 1 / (Math.abs(dx) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dx);
    const invY = 1 / (Math.abs(dy) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dy);
    const invZ = 1 / (Math.abs(dz) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dz);
    const negative = [dx < 0, dy < 0, dz < 0];
    const stack = this.stack;
    const filtered = this.filtered;
    const filter = this.filter;
    let depth = 0;
    stack[depth++] = 0;
    let best = tMax;
    let found = false;
    while (depth > 0) {
      const node = stack[--depth]!;
      const b = node * 6;
      let t1 = (bounds[b]! - ox) * invX;
      let t2 = (bounds[b + 3]! - ox) * invX;
      let near = t1 < t2 ? t1 : t2;
      let far = t1 < t2 ? t2 : t1;
      t1 = (bounds[b + 1]! - oy) * invY;
      t2 = (bounds[b + 4]! - oy) * invY;
      let low = t1 < t2 ? t1 : t2;
      let high = t1 < t2 ? t2 : t1;
      if (low > near) near = low;
      if (high < far) far = high;
      t1 = (bounds[b + 2]! - oz) * invZ;
      t2 = (bounds[b + 5]! - oz) * invZ;
      low = t1 < t2 ? t1 : t2;
      high = t1 < t2 ? t2 : t1;
      if (low > near) near = low;
      if (high < far) far = high;
      if (!(near <= far) || far < tMin || near > best) continue;

      const size = count[node]!;
      if (size === 0) {
        // 近い側の子を後に積んで先に調べる。先に近い当たりが見つかれば、
        // 遠い側は箱の判定だけで捨てられる。
        const left = node + 1;
        const right = link[node]!;
        if (depth + 2 > STACK_DEPTH) continue;
        if (negative[axis[node]!]) {
          stack[depth++] = left;
          stack[depth++] = right;
        } else {
          stack[depth++] = right;
          stack[depth++] = left;
        }
        continue;
      }
      const first = link[node]!;
      for (let index = first; index < first + size; index += 1) {
        const base = index * 9;
        const e1x = triangles[base + 3]!;
        const e1y = triangles[base + 4]!;
        const e1z = triangles[base + 5]!;
        const e2x = triangles[base + 6]!;
        const e2y = triangles[base + 7]!;
        const e2z = triangles[base + 8]!;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-14 && det < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - triangles[base]!;
        const ty = oy - triangles[base + 1]!;
        const tz = oz - triangles[base + 2]!;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= tMin || t >= best) continue;
        const triangle = order[index]!;
        if (filtered && filter && filtered[triangle] !== 0 && !filter(triangle, u, v)) {
          continue;
        }
        best = t;
        found = true;
        this.t = t;
        this.u = u;
        this.v = v;
        this.triangle = triangle;
        // det = -(d・n)。正なら、法線がレイの来た側を向いている表の面。
        this.backface = det < 0;
      }
    }
    return found;
  }

  /** 途中に何かあるかだけを調べる。影のレイ用で、一つ見つけた時点でやめる。 */
  occluded(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    tMin: number, tMax: number,
  ): boolean {
    const { triangles, order, bounds, link, count, nodeCount } = this.bvh;
    if (nodeCount === 0) return false;
    const invX = 1 / (Math.abs(dx) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dx);
    const invY = 1 / (Math.abs(dy) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dy);
    const invZ = 1 / (Math.abs(dz) < DIRECTION_EPSILON ? DIRECTION_EPSILON : dz);
    const stack = this.stack;
    const filtered = this.filtered;
    const filter = this.filter;
    let depth = 0;
    stack[depth++] = 0;
    while (depth > 0) {
      const node = stack[--depth]!;
      const b = node * 6;
      let t1 = (bounds[b]! - ox) * invX;
      let t2 = (bounds[b + 3]! - ox) * invX;
      let near = t1 < t2 ? t1 : t2;
      let far = t1 < t2 ? t2 : t1;
      t1 = (bounds[b + 1]! - oy) * invY;
      t2 = (bounds[b + 4]! - oy) * invY;
      let low = t1 < t2 ? t1 : t2;
      let high = t1 < t2 ? t2 : t1;
      if (low > near) near = low;
      if (high < far) far = high;
      t1 = (bounds[b + 2]! - oz) * invZ;
      t2 = (bounds[b + 5]! - oz) * invZ;
      low = t1 < t2 ? t1 : t2;
      high = t1 < t2 ? t2 : t1;
      if (low > near) near = low;
      if (high < far) far = high;
      if (!(near <= far) || far < tMin || near > tMax) continue;

      const size = count[node]!;
      if (size === 0) {
        if (depth + 2 > STACK_DEPTH) continue;
        stack[depth++] = link[node]!;
        stack[depth++] = node + 1;
        continue;
      }
      const first = link[node]!;
      for (let index = first; index < first + size; index += 1) {
        const base = index * 9;
        const e1x = triangles[base + 3]!;
        const e1y = triangles[base + 4]!;
        const e1z = triangles[base + 5]!;
        const e2x = triangles[base + 6]!;
        const e2y = triangles[base + 7]!;
        const e2z = triangles[base + 8]!;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-14 && det < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - triangles[base]!;
        const ty = oy - triangles[base + 1]!;
        const tz = oz - triangles[base + 2]!;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= tMin || t >= tMax) continue;
        if (filtered && filter) {
          const triangle = order[index]!;
          if (filtered[triangle] !== 0 && !filter(triangle, u, v)) continue;
        }
        return true;
      }
    }
    return false;
  }
}
