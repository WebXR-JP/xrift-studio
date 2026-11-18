/**
 * ライトマップ用のUV（UV2）を自動で作る。
 *
 * ライトマップは「面のどこが何色か」を1枚の画像に焼くので、すべての面が画像の
 * 別々の場所を占めていなければならない。Modelが元から持つUVは模様を繰り返す
 * ために重なっていることが多く、そのままでは使えない。
 *
 * ここでは向きの近い面をひとまとまり（チャート）にし、そのまとまりを正面から
 * 見た形で平面へ写す。計算はワールド座標で行う。8m四方の床と10cmの小物が同じ
 * 細かさで焼けるよう、画像上の広さを実寸に比例させるためである。
 */

const DEFAULT_MAX_ANGLE_DEGREES = 45;

export type ChartMeshInput = {
  /** ワールド座標の頂点位置。1頂点3要素。 */
  positions: Float32Array;
  /** 三角形の索引。索引のないMeshは 0..n-1 を渡す。 */
  indices: Uint32Array;
};

export type ChartMesh = {
  /** 元のMeshの頂点数。 */
  vertexCount: number;
  /**
   * 追加した頂点が、元のどの頂点の写しかを並べたもの。
   *
   * チャートの境目にある頂点は、境目の両側で別々のUVを持つ必要がある。
   * そこだけ頂点を増やし、位置や法線は元の頂点から写す。
   */
  appendedSource: Uint32Array;
  /** 三角形の順番はそのままで、境目の頂点だけ差し替えた索引。 */
  indices: Uint32Array;
  /** 出力頂点ごとの、チャート内の位置（メートル）。チャートの角が原点。 */
  local: Float32Array;
  /** 出力頂点が属するチャート。どの三角形にも使われない頂点は -1。 */
  vertexChart: Int32Array;
  /** 三角形が属するチャート。面積のない三角形は -1。 */
  triangleChart: Int32Array;
  chartCount: number;
  /** チャートの実寸（メートル）。幅が高さ以上になるよう揃えてある。 */
  chartWidth: Float32Array;
  chartHeight: Float32Array;
};

/** 同じ位置にある頂点をまとめる。硬い辺で分かれた頂点も、隣り合う面として扱うため。 */
function weldPositions(positions: Float32Array): { welded: Uint32Array; count: number } {
  const vertexCount = Math.floor(positions.length / 3);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < vertexCount; index += 1) {
    const x = positions[index * 3]!;
    const y = positions[index * 3 + 1]!;
    const z = positions[index * 3 + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const epsilon = Math.max(diagonal * 1e-6, 1e-7);
  const scale = 1 / epsilon;

  let tableSize = 16;
  while (tableSize < vertexCount * 2) tableSize *= 2;
  const mask = tableSize - 1;
  const table = new Int32Array(tableSize).fill(-1);
  const quantized = new Float64Array(vertexCount * 3);
  const welded = new Uint32Array(vertexCount);
  let count = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const qx = Math.round((positions[index * 3]! - minX) * scale);
    const qy = Math.round((positions[index * 3 + 1]! - minY) * scale);
    const qz = Math.round((positions[index * 3 + 2]! - minZ) * scale);
    quantized[index * 3] = qx;
    quantized[index * 3 + 1] = qy;
    quantized[index * 3 + 2] = qz;
    let slot =
      (Math.imul(qx | 0, 73856093) ^
        Math.imul(qy | 0, 19349663) ^
        Math.imul(qz | 0, 83492791)) &
      mask;
    for (;;) {
      const other = table[slot]!;
      if (other < 0) {
        table[slot] = index;
        welded[index] = count;
        count += 1;
        break;
      }
      if (
        quantized[other * 3] === qx &&
        quantized[other * 3 + 1] === qy &&
        quantized[other * 3 + 2] === qz
      ) {
        welded[index] = welded[other]!;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }
  return { welded, count };
}

/**
 * Meshをチャートへ分け、チャートごとの平面座標を求める。
 *
 * 種にした面の法線から一定の角度以内にある、つながった面を一つのチャートに
 * する。平らな床は1チャート、箱は6チャート、球は数チャートになる。
 */
export function segmentMeshCharts(
  input: ChartMeshInput,
  options: { maxAngleDegrees?: number } = {},
): ChartMesh {
  const { positions, indices } = input;
  const vertexCount = Math.floor(positions.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const cosLimit = Math.cos(
    ((options.maxAngleDegrees ?? DEFAULT_MAX_ANGLE_DEGREES) * Math.PI) / 180,
  );
  const { welded, count: weldedCount } = weldPositions(positions);

  // 面の法線。面積のない三角形はチャートに入れない。
  const faceNormal = new Float32Array(triangleCount * 3);
  const degenerate = new Uint8Array(triangleCount);
  for (let face = 0; face < triangleCount; face += 1) {
    const a = indices[face * 3]! * 3;
    const b = indices[face * 3 + 1]! * 3;
    const c = indices[face * 3 + 2]! * 3;
    const e1x = positions[b]! - positions[a]!;
    const e1y = positions[b + 1]! - positions[a + 1]!;
    const e1z = positions[b + 2]! - positions[a + 2]!;
    const e2x = positions[c]! - positions[a]!;
    const e2y = positions[c + 1]! - positions[a + 1]!;
    const e2z = positions[c + 2]! - positions[a + 2]!;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz);
    if (!(length > 1e-12)) {
      degenerate[face] = 1;
      continue;
    }
    faceNormal[face * 3] = nx / length;
    faceNormal[face * 3 + 1] = ny / length;
    faceNormal[face * 3 + 2] = nz / length;
  }

  // 辺を共有する面を探す。3枚以上が集まる辺は、どれとも隣り合わない扱いにする。
  const adjacency = new Int32Array(triangleCount * 3).fill(-1);
  const edgeOwner = new Map<number, number>();
  for (let face = 0; face < triangleCount; face += 1) {
    if (degenerate[face]) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const a = welded[indices[face * 3 + edge]!]!;
      const b = welded[indices[face * 3 + ((edge + 1) % 3)]!]!;
      if (a === b) continue;
      const key = a < b ? a * weldedCount + b : b * weldedCount + a;
      const slot = face * 3 + edge;
      const other = edgeOwner.get(key);
      if (other === undefined) {
        edgeOwner.set(key, slot);
      } else if (other >= 0) {
        adjacency[slot] = Math.floor(other / 3);
        adjacency[other] = face;
        edgeOwner.set(key, -1);
      } else {
        // 3枚目以降。先に結んだ2枚の関係はそのままにする。
      }
    }
  }

  const triangleChart = new Int32Array(triangleCount).fill(-1);
  const chartNormal: number[] = [];
  const queue = new Int32Array(Math.max(1, triangleCount));
  let chartCount = 0;
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (degenerate[seed] || triangleChart[seed] !== -1) continue;
    const chart = chartCount;
    chartCount += 1;
    const nx = faceNormal[seed * 3]!;
    const ny = faceNormal[seed * 3 + 1]!;
    const nz = faceNormal[seed * 3 + 2]!;
    chartNormal.push(nx, ny, nz);
    triangleChart[seed] = chart;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    while (head < tail) {
      const face = queue[head++]!;
      for (let edge = 0; edge < 3; edge += 1) {
        const neighbor = adjacency[face * 3 + edge]!;
        if (neighbor < 0 || triangleChart[neighbor] !== -1) continue;
        const dot =
          faceNormal[neighbor * 3]! * nx +
          faceNormal[neighbor * 3 + 1]! * ny +
          faceNormal[neighbor * 3 + 2]! * nz;
        if (dot < cosLimit) continue;
        triangleChart[neighbor] = chart;
        queue[tail++] = neighbor;
      }
    }
  }

  // チャートごとの平面の軸。水平な向きを横軸に取り、壁や床の辺が画像の辺に
  // 沿うようにする。斜めに置くと、同じ面でも余白が増えて細かさを無駄にする。
  const axisU = new Float64Array(chartCount * 3);
  const axisV = new Float64Array(chartCount * 3);
  for (let chart = 0; chart < chartCount; chart += 1) {
    const nx = chartNormal[chart * 3]!;
    const ny = chartNormal[chart * 3 + 1]!;
    const nz = chartNormal[chart * 3 + 2]!;
    let tx: number, ty: number, tz: number;
    if (Math.abs(ny) < 0.999) {
      // cross(Y, N)
      tx = nz;
      ty = 0;
      tz = -nx;
      const length = Math.hypot(tx, tz);
      tx /= length;
      tz /= length;
    } else {
      tx = 1;
      ty = 0;
      tz = 0;
    }
    // B = cross(N, T)
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    axisU[chart * 3] = tx;
    axisU[chart * 3 + 1] = ty;
    axisU[chart * 3 + 2] = tz;
    axisV[chart * 3] = bx;
    axisV[chart * 3 + 1] = by;
    axisV[chart * 3 + 2] = bz;
  }

  // いちばん長い外周の辺が横軸に沿うよう、チャートを平面内で回す。回転した箱の
  // 天面のように、世界の軸に対して斜めな面で余白を減らす。
  const longestEdge = new Float64Array(chartCount);
  const edgeAngleCos = new Float64Array(chartCount).fill(1);
  const edgeAngleSin = new Float64Array(chartCount);
  for (let face = 0; face < triangleCount; face += 1) {
    const chart = triangleChart[face]!;
    if (chart < 0) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const neighbor = adjacency[face * 3 + edge]!;
      if (neighbor >= 0 && triangleChart[neighbor] === chart) continue;
      const a = indices[face * 3 + edge]! * 3;
      const b = indices[face * 3 + ((edge + 1) % 3)]! * 3;
      const dx = positions[b]! - positions[a]!;
      const dy = positions[b + 1]! - positions[a + 1]!;
      const dz = positions[b + 2]! - positions[a + 2]!;
      const u =
        dx * axisU[chart * 3]! + dy * axisU[chart * 3 + 1]! + dz * axisU[chart * 3 + 2]!;
      const v =
        dx * axisV[chart * 3]! + dy * axisV[chart * 3 + 1]! + dz * axisV[chart * 3 + 2]!;
      const length = Math.hypot(u, v);
      if (length > longestEdge[chart]! * 1.0001) {
        longestEdge[chart] = length;
        edgeAngleCos[chart] = u / length;
        edgeAngleSin[chart] = v / length;
      }
    }
  }
  for (let chart = 0; chart < chartCount; chart += 1) {
    if (!(longestEdge[chart]! > 0)) continue;
    const cos = edgeAngleCos[chart]!;
    const sin = edgeAngleSin[chart]!;
    const base = chart * 3;
    const ux = axisU[base]!, uy = axisU[base + 1]!, uz = axisU[base + 2]!;
    const vx = axisV[base]!, vy = axisV[base + 1]!, vz = axisV[base + 2]!;
    axisU[base] = cos * ux + sin * vx;
    axisU[base + 1] = cos * uy + sin * vy;
    axisU[base + 2] = cos * uz + sin * vz;
    axisV[base] = -sin * ux + cos * vx;
    axisV[base + 1] = -sin * uy + cos * vy;
    axisV[base + 2] = -sin * uz + cos * vz;
  }

  // チャートの範囲。
  const minU = new Float64Array(chartCount).fill(Infinity);
  const minV = new Float64Array(chartCount).fill(Infinity);
  const maxU = new Float64Array(chartCount).fill(-Infinity);
  const maxV = new Float64Array(chartCount).fill(-Infinity);
  for (let face = 0; face < triangleCount; face += 1) {
    const chart = triangleChart[face]!;
    if (chart < 0) continue;
    const base = chart * 3;
    for (let corner = 0; corner < 3; corner += 1) {
      const p = indices[face * 3 + corner]! * 3;
      const x = positions[p]!, y = positions[p + 1]!, z = positions[p + 2]!;
      const u = x * axisU[base]! + y * axisU[base + 1]! + z * axisU[base + 2]!;
      const v = x * axisV[base]! + y * axisV[base + 1]! + z * axisV[base + 2]!;
      if (u < minU[chart]!) minU[chart] = u;
      if (u > maxU[chart]!) maxU[chart] = u;
      if (v < minV[chart]!) minV[chart] = v;
      if (v > maxV[chart]!) maxV[chart] = v;
    }
  }
  // 縦長のチャートは90度回して横長に揃える。段に並べて詰めるとき、高さの近い
  // ものが隣り合って無駄が減る。
  const chartWidth = new Float32Array(chartCount);
  const chartHeight = new Float32Array(chartCount);
  for (let chart = 0; chart < chartCount; chart += 1) {
    const width = maxU[chart]! - minU[chart]!;
    const height = maxV[chart]! - minV[chart]!;
    if (height > width) {
      const base = chart * 3;
      const ux = axisU[base]!, uy = axisU[base + 1]!, uz = axisU[base + 2]!;
      axisU[base] = axisV[base]!;
      axisU[base + 1] = axisV[base + 1]!;
      axisU[base + 2] = axisV[base + 2]!;
      axisV[base] = -ux;
      axisV[base + 1] = -uy;
      axisV[base + 2] = -uz;
      const oldMinU = minU[chart]!, oldMaxU = maxU[chart]!;
      minU[chart] = minV[chart]!;
      maxU[chart] = maxV[chart]!;
      minV[chart] = -oldMaxU;
      maxV[chart] = -oldMinU;
    }
    chartWidth[chart] = maxU[chart]! - minU[chart]!;
    chartHeight[chart] = maxV[chart]! - minV[chart]!;
  }

  // 頂点をチャートごとに分ける。最初に使ったチャートが元の頂点を使い、
  // 二つ目以降のチャートには写しを足す。
  const firstChart = new Int32Array(vertexCount).fill(-1);
  const extra = new Map<number, number[]>();
  const appended: number[] = [];
  const appendedChart: number[] = [];
  const outIndices = new Uint32Array(triangleCount * 3);
  for (let face = 0; face < triangleCount; face += 1) {
    const chart = triangleChart[face]!;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[face * 3 + corner]!;
      if (chart < 0) {
        outIndices[face * 3 + corner] = vertex;
        continue;
      }
      if (firstChart[vertex] === -1) {
        firstChart[vertex] = chart;
        outIndices[face * 3 + corner] = vertex;
        continue;
      }
      if (firstChart[vertex] === chart) {
        outIndices[face * 3 + corner] = vertex;
        continue;
      }
      let list = extra.get(vertex);
      if (!list) {
        list = [];
        extra.set(vertex, list);
      }
      let found = -1;
      for (let entry = 0; entry < list.length; entry += 2) {
        if (list[entry] === chart) {
          found = list[entry + 1]!;
          break;
        }
      }
      if (found < 0) {
        found = vertexCount + appended.length;
        appended.push(vertex);
        appendedChart.push(chart);
        list.push(chart, found);
      }
      outIndices[face * 3 + corner] = found;
    }
  }

  const outputCount = vertexCount + appended.length;
  const vertexChart = new Int32Array(outputCount).fill(-1);
  const local = new Float32Array(outputCount * 2);
  const place = (output: number, source: number, chart: number) => {
    vertexChart[output] = chart;
    const base = chart * 3;
    const p = source * 3;
    const x = positions[p]!, y = positions[p + 1]!, z = positions[p + 2]!;
    local[output * 2] =
      x * axisU[base]! + y * axisU[base + 1]! + z * axisU[base + 2]! - minU[chart]!;
    local[output * 2 + 1] =
      x * axisV[base]! + y * axisV[base + 1]! + z * axisV[base + 2]! - minV[chart]!;
  };
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const chart = firstChart[vertex]!;
    if (chart >= 0) place(vertex, vertex, chart);
  }
  for (let index = 0; index < appended.length; index += 1) {
    place(vertexCount + index, appended[index]!, appendedChart[index]!);
  }

  return {
    vertexCount,
    appendedSource: Uint32Array.from(appended),
    indices: outIndices,
    local,
    vertexChart,
    triangleChart,
    chartCount,
    chartWidth,
    chartHeight,
  };
}

export type AtlasPackInput = {
  /** チャートの実寸（メートル）。 */
  width: Float32Array;
  height: Float32Array;
  /** チャートごとの細かさの倍率。Meshごとに指定した値をチャートへ配る。 */
  scale: Float32Array;
};

export type AtlasPackOptions = {
  /** 画像の一辺の上限（ピクセル）。 */
  maxSize: number;
  /** これ以上細かくしない上限（1メートルあたりのピクセル数）。 */
  maxTexelsPerMeter: number;
  /** チャートの周りに空けるピクセル数。隣のチャートの色がにじまないための余白。 */
  padding?: number;
  /** 画像の一辺の下限。 */
  minSize?: number;
};

export type AtlasLayout = {
  /** 実際に使う画像の一辺（2のべき乗）。 */
  size: number;
  /** 1メートルあたりのピクセル数。 */
  texelsPerMeter: number;
  /** チャートの中身が始まる位置（ピクセル）。余白の内側。 */
  originX: Float32Array;
  originY: Float32Array;
  padding: number;
};

/**
 * すべてのチャートを1枚の画像へ並べる。
 *
 * 細かさは上限から始め、収まる最小の画像を選ぶ。上限の大きさでも入らなければ、
 * 入るところまで細かさを下げる。作者が選ぶのは画像の大きさだけで、細かさは
 * そこから決まる。
 */
export function packChartAtlas(
  input: AtlasPackInput,
  options: AtlasPackOptions,
): AtlasLayout | null {
  const chartCount = input.width.length;
  const padding = options.padding ?? 1;
  const maxSize = options.maxSize;
  const minSize = Math.min(options.minSize ?? 64, maxSize);
  const order = new Uint32Array(chartCount);
  const pixelWidth = new Int32Array(chartCount);
  const pixelHeight = new Int32Array(chartCount);
  const originX = new Float32Array(chartCount);
  const originY = new Float32Array(chartCount);

  const tryPack = (density: number, size: number): boolean => {
    for (let chart = 0; chart < chartCount; chart += 1) {
      const scale = density * input.scale[chart]!;
      const width = Math.max(1, Math.ceil(input.width[chart]! * scale - 1e-6)) + padding * 2;
      const height = Math.max(1, Math.ceil(input.height[chart]! * scale - 1e-6)) + padding * 2;
      if (width > size || height > size) return false;
      pixelWidth[chart] = width;
      pixelHeight[chart] = height;
      order[chart] = chart;
    }
    // 高い順に並べて段に詰める。同じ高さなら幅の広い順で、結果を入力順に依存させない。
    order.sort(
      (left, right) =>
        pixelHeight[right]! - pixelHeight[left]! ||
        pixelWidth[right]! - pixelWidth[left]! ||
        left - right,
    );
    let cursorX = 0;
    let cursorY = 0;
    let shelfHeight = 0;
    for (let index = 0; index < chartCount; index += 1) {
      const chart = order[index]!;
      const width = pixelWidth[chart]!;
      const height = pixelHeight[chart]!;
      if (cursorX + width > size) {
        cursorX = 0;
        cursorY += shelfHeight;
        shelfHeight = 0;
      }
      if (cursorY + height > size) return false;
      originX[chart] = cursorX + padding;
      originY[chart] = cursorY + padding;
      cursorX += width;
      if (height > shelfHeight) shelfHeight = height;
    }
    return true;
  };

  if (chartCount === 0) {
    return { size: minSize, texelsPerMeter: options.maxTexelsPerMeter, originX, originY, padding };
  }

  for (let size = minSize; size <= maxSize; size *= 2) {
    if (tryPack(options.maxTexelsPerMeter, size)) {
      return { size, texelsPerMeter: options.maxTexelsPerMeter, originX, originY, padding };
    }
  }

  // 上限の画像でも入らない。細かさを二分探索で下げる。
  let low = 0;
  let high = options.maxTexelsPerMeter;
  let best = -1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (tryPack(middle, maxSize)) {
      best = middle;
      low = middle;
    } else {
      high = middle;
    }
  }
  if (best < 0) {
    // チャートが多すぎて、1チャート1ピクセルでも入らない。
    if (!tryPack(0, maxSize)) return null;
    best = 0;
  } else {
    tryPack(best, maxSize);
  }
  return { size: maxSize, texelsPerMeter: best, originX, originY, padding };
}
