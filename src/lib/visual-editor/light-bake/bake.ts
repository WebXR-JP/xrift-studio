import {
  quantizeXriftLightmapUv,
  type XriftLightmapData,
  type XriftLightmapMesh,
} from "../../../../packages/xrift-studio-runtime/src/lightmap-data";
import { rasterizeAtlas, type AtlasRaster } from "./raster";
import {
  BAKE_TEXEL_STRIDE,
  LightBakeTracer,
  type BakeEnvironment,
  type BakeLight,
  type BakeMaterial,
  type BakeScene,
  type BakeSettings,
} from "./tracer";
import { packChartAtlas, segmentMeshCharts } from "./unwrap";

/**
 * ライトベイクの全体の流れ。
 *
 * 1. `prepareLightBake`  対象のMeshにUV2を作り、1枚の画像へ並べ、各テクセルの担当を決める。
 * 2. `bakeLightmapTexels` テクセルへ届く光を求める。範囲を分けて複数のWorkerで走らせる。
 * 3. `finishLightmap`     余白を埋め、ざらつきを取り、画像にする。
 *
 * three.js にもDOMにも依存しない。Workerでもfixtureでも同じ結果になる。
 */

export type LightBakeMeshInput = {
  /** このMeshを描くEntity。 */
  entityId: string;
  /** Entityの中で何番目のMeshか。 */
  mesh: number;
  /** ワールド座標の頂点。1頂点3要素。 */
  positions: Float32Array;
  /** ワールド座標の頂点法線。1頂点3要素。 */
  normals: Float32Array;
  /** UV0。無ければnull。 */
  uvs: Float32Array | null;
  /** 三角形の索引。索引のないMeshは 0..n-1。 */
  indices: Uint32Array;
  /** 元のgeometryの索引数。索引なしは0。描画側が形の一致を確かめるために持つ。 */
  sourceIndexCount: number;
  /** 三角形ごとのMaterial番号。全体が一つならその番号。 */
  material: number | Uint16Array;
  /** ライトマップを表示できるMaterialか。できないMeshも、影と跳ね返りには参加する。 */
  receives: boolean;
  /** ライトマップの細かさの倍率。 */
  scale: number;
  /**
   * 鏡写しに置かれたMesh（拡縮の符号が奇数個マイナス）。
   *
   * ワールド座標では三角形の表裏が逆になる。索引の並びは保存データの基準なので
   * 変えず、レイを飛ばす側へ渡すときだけ頂点の順を入れ替える。
   */
  flipWinding?: boolean;
};

export type LightBakeInput = {
  meshes: LightBakeMeshInput[];
  materials: BakeMaterial[];
  lights: BakeLight[];
  environment: BakeEnvironment;
};

export type LightBakeLayoutOptions = {
  /** 画像の一辺の上限。 */
  maxSize: number;
  /** 1メートルあたりのピクセル数の上限。 */
  maxTexelsPerMeter: number;
};

export type PreparedLightBake = {
  scene: BakeScene;
  raster: AtlasRaster;
  /** 保存するUV2データ。 */
  data: XriftLightmapData;
  /** 三角形ごとのチャート番号（全Mesh通し）。ノイズ除去が境目を越えないために使う。 */
  triangleChart: Int32Array;
  atlasSize: number;
  texelsPerMeter: number;
  stats: {
    meshCount: number;
    receiverCount: number;
    triangleCount: number;
    chartCount: number;
    texelCount: number;
    /** 画像のうち、面が実際に使っている割合。 */
    coverage: number;
  };
};

export class LightBakeError extends Error {
  constructor(
    readonly code: "no-receivers" | "atlas-overflow",
    message: string,
  ) {
    super(message);
    this.name = "LightBakeError";
  }
}

export function prepareLightBake(
  input: LightBakeInput,
  layoutOptions: LightBakeLayoutOptions,
): PreparedLightBake {
  let triangleTotal = 0;
  for (const mesh of input.meshes) triangleTotal += Math.floor(mesh.indices.length / 3);

  const positions = new Float32Array(triangleTotal * 9);
  const normals = new Float32Array(triangleTotal * 9);
  const uvs = new Float32Array(triangleTotal * 6);
  const lightmapUvs = new Float32Array(triangleTotal * 6).fill(Number.NaN);
  const triangleMaterial = new Uint16Array(triangleTotal);
  const receives = new Uint8Array(triangleTotal);
  const triangleChart = new Int32Array(triangleTotal).fill(-1);

  // 光を受けるMeshだけUV2を作る。受けないMeshは遮蔽と跳ね返りにだけ使う。
  const unwrapped = input.meshes.map((mesh) =>
    mesh.receives
      ? segmentMeshCharts({ positions: mesh.positions, indices: mesh.indices })
      : null,
  );
  let chartTotal = 0;
  const chartStart = unwrapped.map((charts) => {
    const start = chartTotal;
    chartTotal += charts?.chartCount ?? 0;
    return start;
  });
  if (chartTotal === 0) {
    throw new LightBakeError(
      "no-receivers",
      "ライトマップを表示できるMeshがベイクの対象にありません。",
    );
  }
  const width = new Float32Array(chartTotal);
  const height = new Float32Array(chartTotal);
  const scale = new Float32Array(chartTotal);
  unwrapped.forEach((charts, meshIndex) => {
    if (!charts) return;
    const start = chartStart[meshIndex]!;
    width.set(charts.chartWidth, start);
    height.set(charts.chartHeight, start);
    scale.fill(Math.max(input.meshes[meshIndex]!.scale, 0.01), start, start + charts.chartCount);
  });
  const layout = packChartAtlas({ width, height, scale }, layoutOptions);
  if (!layout) {
    throw new LightBakeError(
      "atlas-overflow",
      "対象のMeshが多く、選んだ大きさのライトマップに収まりません。ライトマップを大きくするか、対象を減らしてください。",
    );
  }

  const dataMeshes: XriftLightmapMesh[] = [];
  let triangleCursor = 0;
  input.meshes.forEach((mesh, meshIndex) => {
    const charts = unwrapped[meshIndex];
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const vertexCount = Math.floor(mesh.positions.length / 3);
    const start = chartStart[meshIndex]!;

    // 出力頂点ごとの、画像上の位置（ピクセル）。
    let atlasUv: Float32Array | null = null;
    if (charts) {
      const outputCount = vertexCount + charts.appendedSource.length;
      atlasUv = new Float32Array(outputCount * 2);
      const uv = new Uint16Array(outputCount * 2);
      for (let vertex = 0; vertex < outputCount; vertex += 1) {
        const chart = charts.vertexChart[vertex]!;
        if (chart < 0) continue;
        const global = start + chart;
        const density = layout.texelsPerMeter * scale[global]!;
        const x = layout.originX[global]! + charts.local[vertex * 2]! * density;
        const y = layout.originY[global]! + charts.local[vertex * 2 + 1]! * density;
        // 保存する値へ丸めてから使う。焼いた位置と描画が読む位置を一致させる。
        const qx = quantizeXriftLightmapUv(x / layout.size);
        const qy = quantizeXriftLightmapUv(y / layout.size);
        uv[vertex * 2] = qx;
        uv[vertex * 2 + 1] = qy;
        atlasUv[vertex * 2] = (qx / 65535) * layout.size;
        atlasUv[vertex * 2 + 1] = (qy / 65535) * layout.size;
      }
      const patches: number[] = [];
      for (let corner = 0; corner < charts.indices.length; corner += 1) {
        if (charts.indices[corner] !== mesh.indices[corner]) {
          patches.push(corner, charts.indices[corner]!);
        }
      }
      dataMeshes.push({
        entityId: mesh.entityId,
        mesh: mesh.mesh,
        vertexCount,
        indexCount: mesh.sourceIndexCount,
        appended: charts.appendedSource,
        patches: Uint32Array.from(patches),
        uv,
      });
    }

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const target = triangleCursor + triangle;
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceCorner = mesh.flipWinding && corner > 0 ? 3 - corner : corner;
        const source = mesh.indices[triangle * 3 + sourceCorner]!;
        positions.set(mesh.positions.subarray(source * 3, source * 3 + 3), target * 9 + corner * 3);
        normals.set(mesh.normals.subarray(source * 3, source * 3 + 3), target * 9 + corner * 3);
        if (mesh.uvs) {
          uvs[target * 6 + corner * 2] = mesh.uvs[source * 2]!;
          uvs[target * 6 + corner * 2 + 1] = mesh.uvs[source * 2 + 1]!;
        }
        if (charts && atlasUv) {
          const output = charts.indices[triangle * 3 + sourceCorner]!;
          lightmapUvs[target * 6 + corner * 2] = atlasUv[output * 2]!;
          lightmapUvs[target * 6 + corner * 2 + 1] = atlasUv[output * 2 + 1]!;
        }
      }
      triangleMaterial[target] =
        typeof mesh.material === "number" ? mesh.material : mesh.material[triangle]!;
      if (charts && charts.triangleChart[triangle]! >= 0) {
        receives[target] = 1;
        triangleChart[target] = start + charts.triangleChart[triangle]!;
      }
    }
    triangleCursor += triangleCount;
  });

  const raster = rasterizeAtlas(layout.size, lightmapUvs, receives);
  let inside = 0;
  for (let texel = 0; texel < raster.coverage.length; texel += 1) {
    if (raster.coverage[texel] === 1) inside += 1;
  }

  return {
    scene: {
      positions,
      normals,
      uvs,
      lightmapUvs,
      triangleMaterial,
      materials: input.materials,
      lights: input.lights,
      environment: input.environment,
    },
    raster,
    data: {
      version: 1,
      atlasSize: layout.size,
      meshes: dataMeshes,
    },
    triangleChart,
    atlasSize: layout.size,
    texelsPerMeter: layout.texelsPerMeter,
    stats: {
      meshCount: input.meshes.length,
      receiverCount: dataMeshes.length,
      triangleCount: triangleTotal,
      chartCount: chartTotal,
      texelCount: raster.texels.length,
      coverage: inside / (layout.size * layout.size),
    },
  };
}

/**
 * テクセルの範囲 [from, to) を焼く。`texels` は `raster.texels`。
 * 結果は1テクセル5要素で、範囲の先頭から詰めて返す。
 */
export function bakeLightmapTexels(
  tracer: LightBakeTracer,
  raster: Pick<AtlasRaster, "size" | "triangle" | "barycentric" | "texels">,
  from: number,
  to: number,
): Float32Array {
  const out = new Float32Array((to - from) * BAKE_TEXEL_STRIDE);
  const size = raster.size;
  for (let index = from; index < to; index += 1) {
    const texel = raster.texels[index]!;
    tracer.bakeTexel(
      texel % size,
      Math.floor(texel / size),
      raster.triangle[texel]!,
      raster.barycentric[texel * 2]!,
      raster.barycentric[texel * 2 + 1]!,
      out,
      (index - from) * BAKE_TEXEL_STRIDE,
    );
  }
  return out;
}

/** 範囲を分けずに全テクセルを焼く。fixtureと小さなSceneで使う。 */
export function bakeLightmapSynchronously(
  prepared: PreparedLightBake,
  settings: BakeSettings,
): Float32Array {
  const tracer = new LightBakeTracer(prepared.scene, settings);
  return bakeLightmapTexels(tracer, prepared.raster, 0, prepared.raster.texels.length);
}

export type FinishLightmapOptions = {
  /** ざらつきを取るかどうか。 */
  denoise: boolean;
};

/**
 * 焼いた結果を画像にする。
 *
 * @param baked `raster.texels` と同じ並びの、1テクセル5要素の結果。
 * @returns RGBAのリニア色。行0が画像の v=0。アルファは常に1。
 */
export function finishLightmap(
  prepared: Pick<PreparedLightBake, "raster" | "scene" | "triangleChart">,
  baked: Float32Array,
  options: FinishLightmapOptions,
): Float32Array {
  const { raster, scene, triangleChart } = prepared;
  const size = raster.size;
  const texelCount = size * size;
  const color = new Float32Array(texelCount * 3);
  const variance = new Float32Array(texelCount);
  /** 0: 値なし、1: 焼いた有効な値。 */
  const valid = new Uint8Array(texelCount);
  const chart = new Int32Array(texelCount).fill(-1);
  for (let index = 0; index < raster.texels.length; index += 1) {
    const texel = raster.texels[index]!;
    const base = index * BAKE_TEXEL_STRIDE;
    chart[texel] = triangleChart[raster.triangle[texel]!]!;
    if (baked[base + 3]! < 0.5) continue;
    const r = baked[base]!;
    const g = baked[base + 1]!;
    const b = baked[base + 2]!;
    if (!Number.isFinite(r + g + b)) continue;
    color[texel * 3] = r;
    color[texel * 3 + 1] = g;
    color[texel * 3 + 2] = b;
    variance[texel] = baked[base + 4]!;
    valid[texel] = 1;
  }

  // 形の内側にあって無効になったテクセルを、同じチャートの隣から埋める。
  // 先に埋めておくと、ノイズ除去が穴の縁で止まらない。
  fillInvalid(color, valid, chart, size, 8, true);

  if (options.denoise) {
    denoise(color, variance, valid, chart, raster, scene, size);
  }

  // チャートの外の余白を、近くの色で埋める。描画時に縁のテクセルが黒い余白と
  // 混ざって暗い線になるのを防ぐ。
  fillInvalid(color, valid, chart, size, 4, false);

  const image = new Float32Array(texelCount * 4);
  for (let texel = 0; texel < texelCount; texel += 1) {
    image[texel * 4] = color[texel * 3]!;
    image[texel * 4 + 1] = color[texel * 3 + 1]!;
    image[texel * 4 + 2] = color[texel * 3 + 2]!;
    image[texel * 4 + 3] = 1;
  }
  return image;
}

/**
 * 値のないテクセルを、値のある隣の平均で埋める。`passes` 回くり返して少しずつ広げる。
 *
 * @param sameChartOnly trueなら、担当のあるテクセルを同じチャートの隣だけで埋める。
 *   falseなら、どのテクセルも近くの値で埋める（余白用）。
 */
function fillInvalid(
  color: Float32Array,
  valid: Uint8Array,
  chart: Int32Array,
  size: number,
  passes: number,
  sameChartOnly: boolean,
): void {
  const texelCount = size * size;
  let pending: number[] = [];
  for (let texel = 0; texel < texelCount; texel += 1) {
    if (valid[texel]) continue;
    if (sameChartOnly && chart[texel]! < 0) continue;
    pending.push(texel);
  }
  for (let pass = 0; pass < passes && pending.length > 0; pass += 1) {
    const filled: number[] = [];
    const values: number[] = [];
    const remaining: number[] = [];
    for (const texel of pending) {
      const x = texel % size;
      const y = (texel - x) / size;
      let r = 0, g = 0, b = 0, weight = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= size) continue;
          const neighbor = ny * size + nx;
          if (!valid[neighbor]) continue;
          if (sameChartOnly && chart[neighbor] !== chart[texel]) continue;
          // 斜めの隣は遠いぶん軽くする。
          const w = dx === 0 || dy === 0 ? 1 : 0.7071;
          r += color[neighbor * 3]! * w;
          g += color[neighbor * 3 + 1]! * w;
          b += color[neighbor * 3 + 2]! * w;
          weight += w;
        }
      }
      if (weight > 0) {
        filled.push(texel);
        values.push(r / weight, g / weight, b / weight);
      } else {
        remaining.push(texel);
      }
    }
    // 同じ回の中で埋めた値を次の隣が読まないよう、最後にまとめて書く。
    for (let index = 0; index < filled.length; index += 1) {
      const texel = filled[index]!;
      color[texel * 3] = values[index * 3]!;
      color[texel * 3 + 1] = values[index * 3 + 1]!;
      color[texel * 3 + 2] = values[index * 3 + 2]!;
      valid[texel] = 1;
    }
    pending = remaining;
  }
}

const KERNEL = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16];

/**
 * ばらつきに応じた、縁を保つぼかし（à-trous）。
 *
 * レイの本数が少ないテクセルほど明るさがざらつく。ばらつきの大きい所だけ
 * 隣と混ぜ、影の縁のように本当に明るさが変わる所は混ぜない。チャートの境目と、
 * 面の向きや位置が大きく違う所も越えない。
 */
function denoise(
  color: Float32Array,
  variance: Float32Array,
  valid: Uint8Array,
  chart: Int32Array,
  raster: AtlasRaster,
  scene: BakeScene,
  size: number,
): void {
  const texelCount = size * size;
  // テクセルごとの位置と面の向き。
  const position = new Float32Array(texelCount * 3);
  const normal = new Float32Array(texelCount * 3);
  const positions = scene.positions;
  for (let index = 0; index < raster.texels.length; index += 1) {
    const texel = raster.texels[index]!;
    const triangle = raster.triangle[texel]!;
    const u = raster.barycentric[texel * 2]!;
    const v = raster.barycentric[texel * 2 + 1]!;
    const base = triangle * 9;
    const e1x = positions[base + 3]! - positions[base]!;
    const e1y = positions[base + 4]! - positions[base + 1]!;
    const e1z = positions[base + 5]! - positions[base + 2]!;
    const e2x = positions[base + 6]! - positions[base]!;
    const e2y = positions[base + 7]! - positions[base + 1]!;
    const e2z = positions[base + 8]! - positions[base + 2]!;
    position[texel * 3] = positions[base]! + e1x * u + e2x * v;
    position[texel * 3 + 1] = positions[base + 1]! + e1y * u + e2y * v;
    position[texel * 3 + 2] = positions[base + 2]! + e1z * u + e2z * v;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz) || 1;
    normal[texel * 3] = nx / length;
    normal[texel * 3 + 1] = ny / length;
    normal[texel * 3 + 2] = nz / length;
  }

  let source: Float32Array = color;
  let sourceVariance: Float32Array = variance;
  let target: Float32Array = new Float32Array(color.length);
  let targetVariance: Float32Array = new Float32Array(variance.length);
  for (let pass = 0; pass < 3; pass += 1) {
    const step = 1 << pass;
    for (let index = 0; index < raster.texels.length; index += 1) {
      const texel = raster.texels[index]!;
      if (!valid[texel]) continue;
      const x = texel % size;
      const y = (texel - x) / size;
      const cr = source[texel * 3]!;
      const cg = source[texel * 3 + 1]!;
      const cb = source[texel * 3 + 2]!;
      const centerLuminance = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      const sigma = 4 * Math.sqrt(Math.max(sourceVariance[texel]!, 0)) + 1e-4;
      const px = position[texel * 3]!;
      const py = position[texel * 3 + 1]!;
      const pz = position[texel * 3 + 2]!;
      const nx = normal[texel * 3]!;
      const ny = normal[texel * 3 + 1]!;
      const nz = normal[texel * 3 + 2]!;
      const ownChart = chart[texel]!;
      let r = 0, g = 0, b = 0, weightSum = 0, varianceSum = 0;
      for (let ky = -2; ky <= 2; ky += 1) {
        const sy = y + ky * step;
        if (sy < 0 || sy >= size) continue;
        for (let kx = -2; kx <= 2; kx += 1) {
          const sx = x + kx * step;
          if (sx < 0 || sx >= size) continue;
          const neighbor = sy * size + sx;
          if (!valid[neighbor] || chart[neighbor] !== ownChart) continue;
          let weight = KERNEL[kx + 2]! * KERNEL[ky + 2]!;
          if (neighbor !== texel) {
            const dot =
              normal[neighbor * 3]! * nx +
              normal[neighbor * 3 + 1]! * ny +
              normal[neighbor * 3 + 2]! * nz;
            if (dot <= 0.7) continue;
            // 同じ平面に乗っているほど重くする。段差の向こうとは混ぜない。
            const dx = position[neighbor * 3]! - px;
            const dy = position[neighbor * 3 + 1]! - py;
            const dz = position[neighbor * 3 + 2]! - pz;
            const span = Math.hypot(dx, dy, dz);
            const offPlane = Math.abs(dx * nx + dy * ny + dz * nz);
            weight *= Math.pow(dot, 16) * Math.exp(-offPlane / (span * 0.2 + 1e-5));
            const luminance =
              0.2126 * source[neighbor * 3]! +
              0.7152 * source[neighbor * 3 + 1]! +
              0.0722 * source[neighbor * 3 + 2]!;
            weight *= Math.exp(-Math.abs(luminance - centerLuminance) / sigma);
          }
          r += source[neighbor * 3]! * weight;
          g += source[neighbor * 3 + 1]! * weight;
          b += source[neighbor * 3 + 2]! * weight;
          varianceSum += sourceVariance[neighbor]! * weight * weight;
          weightSum += weight;
        }
      }
      target[texel * 3] = r / weightSum;
      target[texel * 3 + 1] = g / weightSum;
      target[texel * 3 + 2] = b / weightSum;
      targetVariance[texel] = varianceSum / (weightSum * weightSum);
    }
    const swap = source;
    source = target;
    target = swap === color ? new Float32Array(color.length) : swap;
    const swapVariance = sourceVariance;
    sourceVariance = targetVariance;
    targetVariance = swapVariance === variance ? new Float32Array(variance.length) : swapVariance;
  }
  // 結果を元の配列へ戻す。担当のないテクセルは触らない。
  for (let index = 0; index < raster.texels.length; index += 1) {
    const texel = raster.texels[index]!;
    if (!valid[texel]) continue;
    color[texel * 3] = source[texel * 3]!;
    color[texel * 3 + 1] = source[texel * 3 + 1]!;
    color[texel * 3 + 2] = source[texel * 3 + 2]!;
  }
}

/** 画質のプリセット。 */
export const LIGHT_BAKE_QUALITIES = ["draft", "standard", "high"] as const;
export type LightBakeQuality = (typeof LIGHT_BAKE_QUALITIES)[number];

export function lightBakeQualitySettings(quality: LightBakeQuality): {
  samples: number;
  bounces: number;
} {
  switch (quality) {
    case "draft":
      return { samples: 24, bounces: 1 };
    case "high":
      return { samples: 256, bounces: 4 };
    case "standard":
    default:
      return { samples: 96, bounces: 2 };
  }
}
