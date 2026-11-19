import {
  BoxGeometry,
  DataTexture,
  FloatType,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { EXRExporter } from "three/examples/jsm/exporters/EXRExporter.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import {
  collectXriftLightmapMeshes,
  createXriftLightmapApplier,
  XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY,
  xriftLightmapSourceGeometry,
} from "../../../../packages/xrift-studio-runtime/src/lightmap-apply";
import {
  encodeXriftLightmapData,
  parseXriftLightmapData,
} from "../../../../packages/xrift-studio-runtime/src/lightmap-data";
import { LIGHTMAP_ASSET_FORMAT_VERSION, type LightmapAsset } from "../asset-manifest";
import { compileVisualProject } from "../compiler/compile";
import {
  executeXriftMcpEditorTool,
  XriftMcpEditorToolError,
  type XriftMcpEditorContext,
} from "../mcp-editor-tools";
import { collectModelInstancingEntities } from "../model-instancing";
import { createPrototypeProject } from "../prototype-project";
import {
  updateLightComponent,
  updateMeshLightBakeSettings,
  type SceneDocument,
} from "../scene-document";
import { resolveSceneSettings } from "../scene-settings";
import { assetManifestCodec, sceneDocumentCodec } from "../serialization";
import {
  computeLightBakeSignature,
  lightmappedEntityIds,
  listLightBakeLights,
  listLightBakeMeshes,
  resolveLightBakeStatus,
  setSceneLightmap,
  suppressedBakedLightComponentIds,
} from "./light-bake-scene";
import {
  bakeLightmapSynchronously,
  finishLightmap,
  prepareLightBake,
  type LightBakeInput,
  type LightBakeMeshInput,
  type PreparedLightBake,
} from "./bake";
import { buildTriangleBvh, BvhRaycaster } from "./bvh";
import { rasterizeAtlas } from "./raster";
import { BAKE_TEXEL_STRIDE, type BakeEnvironment, type BakeMaterial } from "./tracer";
import { packChartAtlas, segmentMeshCharts } from "./unwrap";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const EMPTY_ENVIRONMENT: BakeEnvironment = {
  ambientRealtime: [0, 0, 0],
  ambientBaked: [0, 0, 0],
  hemispheres: [],
};

const GREY: BakeMaterial = {
  albedo: [0.5, 0.5, 0.5],
  emissive: [0, 0, 0],
  opacity: 1,
  alphaMode: "opaque",
  alphaCutoff: 0.5,
  doubleSided: false,
};

/** threeのgeometryを、位置と大きさを決めてベイク入力のMeshへ変える。 */
function meshInput(
  entityId: string,
  geometry: BufferGeometry,
  transform: { position?: [number, number, number]; scale?: [number, number, number]; rotateX?: number },
  material = 0,
  receives = true,
): LightBakeMeshInput {
  const copy = geometry.clone();
  if (transform.rotateX) copy.rotateX(transform.rotateX);
  const scale = transform.scale ?? [1, 1, 1];
  copy.scale(scale[0], scale[1], scale[2]);
  const position = transform.position ?? [0, 0, 0];
  copy.translate(position[0], position[1], position[2]);
  const positions = copy.getAttribute("position").array as Float32Array;
  const normals = copy.getAttribute("normal").array as Float32Array;
  const uv = copy.getAttribute("uv");
  const index = copy.getIndex();
  const vertexCount = positions.length / 3;
  return {
    entityId,
    mesh: 0,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: uv ? Float32Array.from(uv.array as Float32Array) : null,
    indices: index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: vertexCount }, (_, i) => i),
    sourceIndexCount: index ? index.count : 0,
    material,
    receives,
    scale: 1,
  };
}

/** 画像上のある点の色を、担当テクセルから読む。 */
function texelAt(
  prepared: IndexedPrepared,
  image: Float32Array,
  entityIndex: number,
  predicate: (x: number, y: number, z: number) => boolean,
): { mean: [number, number, number]; count: number } {
  const { raster, scene } = prepared;
  let r = 0, g = 0, b = 0, count = 0;
  for (const texel of raster.texels) {
    if (raster.coverage[texel] !== 1) continue;
    const triangle = raster.triangle[texel]!;
    if (prepared.meshOfTriangle[triangle] !== entityIndex) continue;
    const u = raster.barycentric[texel * 2]!;
    const v = raster.barycentric[texel * 2 + 1]!;
    const w = 1 - u - v;
    const base = triangle * 9;
    const x = scene.positions[base]! * w + scene.positions[base + 3]! * u + scene.positions[base + 6]! * v;
    const y = scene.positions[base + 1]! * w + scene.positions[base + 4]! * u + scene.positions[base + 7]! * v;
    const z = scene.positions[base + 2]! * w + scene.positions[base + 5]! * u + scene.positions[base + 8]! * v;
    if (!predicate(x, y, z)) continue;
    r += image[texel * 4]!;
    g += image[texel * 4 + 1]!;
    b += image[texel * 4 + 2]!;
    count += 1;
  }
  return { mean: count > 0 ? [r / count, g / count, b / count] : [0, 0, 0], count };
}

function fixtureBvh(): void {
  // 乱数の三角形で、BVHと総当たりの結果が一致することを確かめる。
  let state = 12345;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
  const triangleCount = 600;
  const positions = new Float32Array(triangleCount * 9);
  for (let index = 0; index < triangleCount; index += 1) {
    const cx = random() * 10 - 5;
    const cy = random() * 10 - 5;
    const cz = random() * 10 - 5;
    for (let corner = 0; corner < 3; corner += 1) {
      positions[index * 9 + corner * 3] = cx + random() - 0.5;
      positions[index * 9 + corner * 3 + 1] = cy + random() - 0.5;
      positions[index * 9 + corner * 3 + 2] = cz + random() - 0.5;
    }
  }
  const bvh = buildTriangleBvh(positions);
  assert(bvh.order.length === triangleCount, "BVH must keep every triangle");
  const seen = new Uint8Array(triangleCount);
  for (const triangle of bvh.order) seen[triangle] = 1;
  assert(seen.every((value) => value === 1), "BVH order must be a permutation");
  const raycaster = new BvhRaycaster(bvh);
  let hits = 0;
  for (let ray = 0; ray < 400; ray += 1) {
    const ox = random() * 12 - 6, oy = random() * 12 - 6, oz = random() * 12 - 6;
    let dx = random() - 0.5, dy = random() - 0.5, dz = random() - 0.5;
    const length = Math.hypot(dx, dy, dz);
    dx /= length; dy /= length; dz /= length;
    // 総当たり
    let best = Infinity;
    let bestTriangle = -1;
    for (let index = 0; index < triangleCount; index += 1) {
      const b = index * 9;
      const e1x = positions[b + 3]! - positions[b]!, e1y = positions[b + 4]! - positions[b + 1]!, e1z = positions[b + 5]! - positions[b + 2]!;
      const e2x = positions[b + 6]! - positions[b]!, e2y = positions[b + 7]! - positions[b + 1]!, e2z = positions[b + 8]! - positions[b + 2]!;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det;
      const tx = ox - positions[b]!, ty = oy - positions[b + 1]!, tz = oz - positions[b + 2]!;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < best) { best = t; bestTriangle = index; }
    }
    const found = raycaster.closest(ox, oy, oz, dx, dy, dz, 1e-6, Infinity);
    assert(found === bestTriangle >= 0, "BVH closest hit must agree with brute force on hit or miss");
    if (found) {
      hits += 1;
      assert(Math.abs(raycaster.t - best) < 1e-4, "BVH closest hit distance must match brute force");
      assert(
        raycaster.occluded(ox, oy, oz, dx, dy, dz, 1e-6, best + 1e-3),
        "A ray with a closest hit must also be occluded",
      );
      assert(
        !raycaster.occluded(ox, oy, oz, dx, dy, dz, 1e-6, best - 1e-3),
        "Nothing may occlude before the closest hit",
      );
    }
  }
  assert(hits > 50, "The BVH fixture must exercise real hits");
}

function fixtureUnwrap(): void {
  // 箱は面ごとに頂点が分かれているので、6チャートになり、頂点は増えない。
  const box = new BoxGeometry(2, 1, 4);
  const boxCharts = segmentMeshCharts({
    positions: box.getAttribute("position").array as Float32Array,
    indices: Uint32Array.from(box.getIndex()!.array),
  });
  assert(boxCharts.chartCount === 6, `A box must unwrap into 6 charts, got ${boxCharts.chartCount}`);
  assert(boxCharts.appendedSource.length === 0, "A box already splits its vertices per face");
  const sizes = Array.from({ length: 6 }, (_, chart) =>
    [boxCharts.chartWidth[chart]!, boxCharts.chartHeight[chart]!]
      .map((value) => Math.round(value * 100) / 100)
      .join("x"),
  ).sort();
  assert(
    sizes.join(",") === "2x1,2x1,4x1,4x1,4x2,4x2",
    `Box charts must keep their real size in meters, got ${sizes.join(",")}`,
  );

  // 球はなめらかにつながった頂点を共有している。チャートの境目で頂点が増える。
  const sphere = new SphereGeometry(1, 24, 16);
  const spherePositions = sphere.getAttribute("position").array as Float32Array;
  const sphereIndices = Uint32Array.from(sphere.getIndex()!.array);
  const sphereCharts = segmentMeshCharts({ positions: spherePositions, indices: sphereIndices });
  assert(sphereCharts.chartCount >= 6, "A sphere needs several charts to flatten without folding");
  assert(sphereCharts.chartCount < 60, "A sphere must not shatter into a chart per face");
  assert(sphereCharts.appendedSource.length > 0, "Chart seams on a smooth mesh must add vertices");
  for (let index = 0; index < sphereCharts.appendedSource.length; index += 1) {
    assert(
      sphereCharts.appendedSource[index]! < spherePositions.length / 3,
      "An appended vertex must copy an original vertex",
    );
  }
  // どの三角形も、3頂点が同じチャートに属している。
  for (let face = 0; face < sphereIndices.length / 3; face += 1) {
    const chart = sphereCharts.triangleChart[face]!;
    if (chart < 0) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = sphereCharts.indices[face * 3 + corner]!;
      assert(sphereCharts.vertexChart[vertex] === chart, "A triangle's vertices must share its chart");
      const source =
        vertex < spherePositions.length / 3
          ? vertex
          : sphereCharts.appendedSource[vertex - spherePositions.length / 3]!;
      const original = sphereIndices[face * 3 + corner]!;
      assert(
        spherePositions[source * 3] === spherePositions[original * 3] &&
          spherePositions[source * 3 + 1] === spherePositions[original * 3 + 1] &&
          spherePositions[source * 3 + 2] === spherePositions[original * 3 + 2],
        "Splitting a vertex must not move the triangle",
      );
    }
  }

  // 並べた結果、どのチャートも重ならず、画像からはみ出さない。
  const layout = packChartAtlas(
    {
      width: sphereCharts.chartWidth,
      height: sphereCharts.chartHeight,
      scale: new Float32Array(sphereCharts.chartCount).fill(1),
    },
    { maxSize: 256, maxTexelsPerMeter: 64 },
  );
  assert(layout, "The sphere charts must fit a 256px lightmap");
  const occupied = new Int32Array(layout.size * layout.size).fill(-1);
  for (let chart = 0; chart < sphereCharts.chartCount; chart += 1) {
    const x0 = Math.floor(layout.originX[chart]!) - layout.padding;
    const y0 = Math.floor(layout.originY[chart]!) - layout.padding;
    // 中身は少なくとも1ピクセルを占める。端数は切り上げる。
    const x1 = layout.originX[chart]! + Math.max(1, Math.ceil(sphereCharts.chartWidth[chart]! * layout.texelsPerMeter - 1e-6)) + layout.padding;
    const y1 = layout.originY[chart]! + Math.max(1, Math.ceil(sphereCharts.chartHeight[chart]! * layout.texelsPerMeter - 1e-6)) + layout.padding;
    assert(x0 >= 0 && y0 >= 0 && x1 <= layout.size && y1 <= layout.size, "A chart must stay inside the lightmap");
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        assert(occupied[y * layout.size + x] === -1, "Charts must not overlap, padding included");
        occupied[y * layout.size + x] = chart;
      }
    }
  }

  // 上限の細かさで入らないときは、細かさを下げて必ず1枚に収める。
  const tight = packChartAtlas(
    { width: Float32Array.of(100, 100), height: Float32Array.of(100, 50), scale: Float32Array.of(1, 1) },
    { maxSize: 64, maxTexelsPerMeter: 64 },
  );
  assert(tight && tight.size === 64 && tight.texelsPerMeter < 1, "Oversized charts must lower the density instead of failing");
}

function fixtureRaster(): void {
  // 4x4ピクセルの正方形を二つの三角形で覆う。中は16テクセル、縁から1ピクセルまで伸びる。
  const uvs = Float32Array.of(2, 2, 6, 2, 6, 6, 2, 2, 6, 6, 2, 6);
  const raster = rasterizeAtlas(16, uvs, Uint8Array.of(1, 1));
  let inside = 0;
  let edge = 0;
  for (let texel = 0; texel < raster.coverage.length; texel += 1) {
    if (raster.coverage[texel] === 1) inside += 1;
    if (raster.coverage[texel] === 2) edge += 1;
  }
  assert(inside === 16, `A 4px square must cover exactly 16 texel centers, got ${inside}`);
  assert(edge >= 16 && edge <= 20, `The edge ring must be one texel wide, got ${edge}`);
  assert(raster.texels.length === inside + edge, "The texel list must hold every covered texel");
  // 受けない三角形は焼かない。
  assert(rasterizeAtlas(16, uvs, Uint8Array.of(0, 0)).texels.length === 0, "Non-receiving triangles must not be rasterized");
}

function fixtureDataRoundTrip(): void {
  const data = {
    version: 1,
    atlasSize: 512,
    meshes: [
      {
        entityId: "entity-a",
        mesh: 0,
        vertexCount: 3,
        indexCount: 3,
        appended: Uint32Array.of(1, 2),
        patches: Uint32Array.of(4, 3, 5, 4),
        uv: Uint16Array.of(0, 0, 65535, 0, 0, 65535, 100, 200, 300, 400),
      },
      {
        // 同じ形をもう一つ。頂点の増やし方は一度だけ書かれる。
        entityId: "entity-b",
        mesh: 1,
        vertexCount: 3,
        indexCount: 3,
        appended: Uint32Array.of(1, 2),
        patches: Uint32Array.of(4, 3, 5, 4),
        uv: Uint16Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
      },
      {
        entityId: "entity-c",
        mesh: 0,
        vertexCount: 2,
        indexCount: 0,
        appended: new Uint32Array(0),
        patches: new Uint32Array(0),
        uv: Uint16Array.of(11, 12, 13, 14),
      },
    ],
  };
  const bytes = encodeXriftLightmapData(data);
  const single = encodeXriftLightmapData({ ...data, meshes: [data.meshes[0]!, data.meshes[2]!] });
  assert(
    bytes.byteLength - single.byteLength < 80,
    "Meshes that split the same way must share one copy of the split data",
  );
  const parsed = parseXriftLightmapData(bytes);
  assert(parsed.atlasSize === 512 && parsed.meshes.length === 3, "Lightmap data must round-trip its header");
  for (let index = 0; index < data.meshes.length; index += 1) {
    const before = data.meshes[index]!;
    const after = parsed.meshes[index]!;
    assert(after.entityId === before.entityId && after.mesh === before.mesh, "Mesh identity must round-trip");
    assert(after.vertexCount === before.vertexCount && after.indexCount === before.indexCount, "Geometry facts must round-trip");
    assert(Array.from(after.appended).join() === Array.from(before.appended).join(), "Appended vertices must round-trip");
    assert(Array.from(after.patches).join() === Array.from(before.patches).join(), "Index patches must round-trip");
    assert(Array.from(after.uv).join() === Array.from(before.uv).join(), "UVs must round-trip");
  }
  // 先頭が4バイト境界にないバイト列でも読める。
  const shifted = new Uint8Array(bytes.byteLength + 1);
  shifted.set(bytes, 1);
  assert(
    parseXriftLightmapData(shifted.subarray(1)).meshes.length === 3,
    "Unaligned input must still parse",
  );
  let rejected = false;
  try {
    parseXriftLightmapData(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
  } catch {
    rejected = true;
  }
  assert(rejected, "Bytes that are not lightmap data must be rejected");
}

function fixtureBakedShadow(): void {
  // 10m四方の床の上に箱を浮かせ、真上からベイクしたライトで照らす。
  const floor = meshInput("floor", new PlaneGeometry(10, 10), { rotateX: -Math.PI / 2 });
  const box = meshInput("box", new BoxGeometry(2, 0.5, 2), { position: [0, 1, 0] });
  const input: LightBakeInput = {
    meshes: [floor, box],
    materials: [GREY],
    lights: [{ type: "directional", baked: true, color: [2, 2, 2], direction: [0, 1, 0] }],
    environment: EMPTY_ENVIRONMENT,
  };
  const prepared = withMeshIndex(prepareLightBake(input, { maxSize: 128, maxTexelsPerMeter: 16 }), input);
  assert(prepared.data.meshes.length === 2, "Both meshes must receive lightmap UVs");
  const baked = bakeLightmapSynchronously(prepared, { samples: 16, bounces: 0, softness: 0, seed: 7 });
  assert(baked.length === prepared.raster.texels.length * BAKE_TEXEL_STRIDE, "Every covered texel must be baked");
  const image = finishLightmap(prepared, baked, { denoise: false });

  const open = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) > 3 || Math.abs(z) > 3);
  const shadow = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) < 0.6 && Math.abs(z) < 0.6);
  assert(open.count > 50 && shadow.count > 4, "The fixture must sample lit and shadowed floor texels");
  // 真上からの強さ2のライト。法線と同じ向きなので、放射照度はそのまま2。
  assert(Math.abs(open.mean[0] - 2) < 0.02, `Open floor must receive the light's full irradiance, got ${open.mean[0]}`);
  assert(shadow.mean[0] < 0.02, `Floor under the box must be in baked shadow, got ${shadow.mean[0]}`);
  const top = texelAt(prepared, image, 1, (_x, y) => y > 1.24);
  const bottom = texelAt(prepared, image, 1, (_x, y) => y < 0.76);
  assert(top.count > 4 && Math.abs(top.mean[0] - 2) < 0.02, "The top of the box faces the light");
  assert(bottom.count > 4 && bottom.mean[0] < 0.02, "The underside of the box faces away from the light");

  // 同じライトを「リアルタイム」にすると、直接光は焼かれない。跳ね返りが無ければ0。
  const realtime: LightBakeInput = {
    ...input,
    lights: [{ type: "directional", baked: false, color: [2, 2, 2], direction: [0, 1, 0] }],
  };
  const realtimePrepared = withMeshIndex(prepareLightBake(realtime, { maxSize: 128, maxTexelsPerMeter: 16 }), realtime);
  const realtimeImage = finishLightmap(
    realtimePrepared,
    bakeLightmapSynchronously(realtimePrepared, { samples: 16, bounces: 0, softness: 0, seed: 7 }),
    { denoise: false },
  );
  const realtimeOpen = texelAt(realtimePrepared, realtimeImage, 0, (x, _y, z) => Math.abs(x) > 3 || Math.abs(z) > 3);
  assert(Math.abs(realtimeOpen.mean[0]) < 1e-6, "A realtime light's direct light must stay out of the lightmap");

  // 跳ね返りを入れると、リアルタイムのライトでも箱の下面が床からの光で明るくなる。
  const bounced = finishLightmap(
    realtimePrepared,
    bakeLightmapSynchronously(realtimePrepared, { samples: 64, bounces: 1, softness: 0, seed: 7 }),
    { denoise: true },
  );
  const bouncedBottom = texelAt(realtimePrepared, bounced, 1, (_x, y) => y < 0.76);
  assert(
    bouncedBottom.mean[0] > 0.05,
    `Light bounced off the floor must reach the underside of the box, got ${bouncedBottom.mean[0]}`,
  );
  // 床の反射率0.5、放射照度2。真下の広い床が見える下面は、多くても 2 * 0.5 = 1 まで。
  assert(bouncedBottom.mean[0] < 1.0, "A bounce may not create more light than the floor reflects");
}

function fixtureAmbientOcclusion(): void {
  // 環境光は描画時にも足される。ライトマップが持つのは、物陰で届かないぶんの差。
  const floor = meshInput("floor", new PlaneGeometry(10, 10), { rotateX: -Math.PI / 2 });
  const wall = meshInput("wall", new BoxGeometry(0.4, 3, 6), { position: [0, 1.5, 0] });
  const input: LightBakeInput = {
    meshes: [floor, wall],
    materials: [{ ...GREY, albedo: [0, 0, 0] }],
    lights: [],
    environment: { ...EMPTY_ENVIRONMENT, ambientRealtime: [1, 1, 1] },
  };
  const prepared = withMeshIndex(prepareLightBake(input, { maxSize: 128, maxTexelsPerMeter: 16 }), input);
  const image = finishLightmap(
    prepared,
    bakeLightmapSynchronously(prepared, { samples: 64, bounces: 1, softness: 0, seed: 3 }),
    { denoise: false },
  );
  const far = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) > 4.4 && Math.abs(z) > 4.4);
  const near = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) > 0.3 && Math.abs(x) < 0.7 && Math.abs(z) < 2);
  assert(far.count > 4 && near.count > 4, "The fixture must sample floor texels near and far from the wall");
  assert(far.mean[0] > -0.05 && far.mean[0] <= 1e-6, `Open floor loses almost no ambient light, got ${far.mean[0]}`);
  // 壁の根元では、空の半分近くが壁に隠れる。
  assert(near.mean[0] < -0.25 && near.mean[0] > -0.75, `Floor at the foot of a wall loses ambient light, got ${near.mean[0]}`);

  // 同じ環境光を「ベイク」すると、遮られずに届くぶんがそのまま入る。
  const bakedAmbient: LightBakeInput = {
    ...input,
    environment: { ...EMPTY_ENVIRONMENT, ambientBaked: [1, 1, 1] },
  };
  const bakedPrepared = withMeshIndex(prepareLightBake(bakedAmbient, { maxSize: 128, maxTexelsPerMeter: 16 }), bakedAmbient);
  const bakedImage = finishLightmap(
    bakedPrepared,
    bakeLightmapSynchronously(bakedPrepared, { samples: 64, bounces: 1, softness: 0, seed: 3 }),
    { denoise: false },
  );
  const bakedFar = texelAt(bakedPrepared, bakedImage, 0, (x, _y, z) => Math.abs(x) > 4.4 && Math.abs(z) > 4.4);
  const bakedNear = texelAt(bakedPrepared, bakedImage, 0, (x, _y, z) => Math.abs(x) > 0.3 && Math.abs(x) < 0.7 && Math.abs(z) < 2);
  assert(bakedFar.mean[0] > 0.95 && bakedFar.mean[0] <= 1 + 1e-6, `Open floor receives the whole baked ambient, got ${bakedFar.mean[0]}`);
  // 差で持つ場合と、焼き切る場合は、描画時の合計が一致する。
  assert(
    Math.abs(bakedNear.mean[0] - (1 + near.mean[0])) < 0.02,
    "Baked ambient and realtime ambient plus its difference must light the same",
  );
}

function fixtureEmissiveAndClosedShapes(): void {
  // 光る板が床を照らす。板に近い床ほど明るい。
  const floor = meshInput("floor", new PlaneGeometry(8, 8), { rotateX: -Math.PI / 2 });
  const panel = meshInput("panel", new PlaneGeometry(1, 1), { rotateX: Math.PI / 2, position: [0, 1, 0] }, 1, false);
  // 床に半分埋まった箱。箱の中に入った床のテクセルは、外の色で埋められる。
  const sunk = meshInput("sunk", new BoxGeometry(1, 1, 1), { position: [2.5, 0.25, 2.5] });
  const input: LightBakeInput = {
    meshes: [floor, panel, sunk],
    materials: [
      GREY,
      { ...GREY, albedo: [0, 0, 0], emissive: [10, 0, 0], doubleSided: true },
    ],
    lights: [],
    environment: EMPTY_ENVIRONMENT,
  };
  const prepared = withMeshIndex(prepareLightBake(input, { maxSize: 128, maxTexelsPerMeter: 16 }), input);
  assert(prepared.data.meshes.length === 2, "A mesh that cannot show a lightmap gets no lightmap UVs");
  const baked = bakeLightmapSynchronously(prepared, { samples: 128, bounces: 1, softness: 0, seed: 11 });
  const image = finishLightmap(prepared, baked, { denoise: true });
  const under = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) < 0.5 && Math.abs(z) < 0.5);
  const away = texelAt(prepared, image, 0, (x, _y, z) => Math.abs(x) > 3.5 && Math.abs(z) < 1 && x < 0);
  assert(under.mean[0] > 0.5, `An emissive surface must light what it faces, got ${under.mean[0]}`);
  assert(under.mean[1] < 1e-3, "Red emission must not create green light");
  assert(away.mean[0] < under.mean[0] * 0.2, "Emitted light must fall off with distance");

  // 箱に埋まった床のテクセルは、無効として焼かれている。
  let buried = 0;
  let buriedInvalid = 0;
  for (let index = 0; index < prepared.raster.texels.length; index += 1) {
    const texel = prepared.raster.texels[index]!;
    const triangle = prepared.raster.triangle[texel]!;
    if (prepared.meshOfTriangle[triangle] !== 0 || prepared.raster.coverage[texel] !== 1) continue;
    const u = prepared.raster.barycentric[texel * 2]!;
    const v = prepared.raster.barycentric[texel * 2 + 1]!;
    const w = 1 - u - v;
    const base = triangle * 9;
    const x = prepared.scene.positions[base]! * w + prepared.scene.positions[base + 3]! * u + prepared.scene.positions[base + 6]! * v;
    const z = prepared.scene.positions[base + 2]! * w + prepared.scene.positions[base + 5]! * u + prepared.scene.positions[base + 8]! * v;
    if (Math.abs(x - 2.5) < 0.35 && Math.abs(z - 2.5) < 0.35) {
      buried += 1;
      if (baked[index * BAKE_TEXEL_STRIDE + 3]! < 0.5) buriedInvalid += 1;
    }
  }
  assert(buried > 4 && buriedInvalid === buried, "Floor texels inside a closed shape must be marked invalid");
}

type IndexedPrepared = PreparedLightBake & { meshOfTriangle: Uint32Array };

/** 三角形がどのMeshのものかを引けるようにする。fixtureが場所ごとの色を読むために使う。 */
function withMeshIndex(prepared: PreparedLightBake, input: LightBakeInput): IndexedPrepared {
  const meshOfTriangle = new Uint32Array(prepared.scene.positions.length / 9);
  let cursor = 0;
  input.meshes.forEach((mesh, index) => {
    const count = mesh.indices.length / 3;
    meshOfTriangle.fill(index, cursor, cursor + count);
    cursor += count;
  });
  return Object.assign(prepared, { meshOfTriangle });
}

/** threeのMeshを、ベイク入力のMeshへ変える。Meshの位置はそのままワールド座標とみなす。 */
function meshInputFromObject(entityId: string, ordinal: number, mesh: Mesh): LightBakeMeshInput {
  const input = meshInput(entityId, mesh.geometry, {});
  return { ...input, mesh: ordinal };
}

async function fixtureApplier(): Promise<void> {
  // 同じgeometryと同じMaterialを使う二つのEntity。片方だけがベイクの対象。
  const sphere = new SphereGeometry(1, 16, 12);
  const sharedMaterial = new MeshStandardMaterial({ color: "#ff0000", roughness: 0.4 });
  const root = new Group();
  const bakedEntity = new Group();
  bakedEntity.userData.xriftEntityId = "baked";
  const scope = new Group();
  scope.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY] = true;
  const bakedMesh: Mesh = new Mesh(sphere, sharedMaterial);
  const helper = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  helper.userData.editorHelper = true;
  scope.add(helper, bakedMesh);
  bakedEntity.add(scope);
  const plainEntity = new Group();
  plainEntity.userData.xriftEntityId = "plain";
  const plainMesh = new Mesh(sphere, sharedMaterial);
  plainEntity.add(plainMesh);
  // 対象のEntityの子にある別のEntityは、親の印を引き継がない。
  const child = new Group();
  child.userData.xriftEntityId = "child";
  const childMesh = new Mesh(sphere, sharedMaterial);
  child.add(childMesh);
  scope.add(child);
  root.add(bakedEntity, plainEntity);

  const collected = collectXriftLightmapMeshes(root, "xriftEntityId");
  assert(
    collected.length === 1 && collected[0]!.object === bakedMesh && collected[0]!.mesh === 0,
    "Only meshes inside a marked scope count, and editor helpers are skipped",
  );

  const input: LightBakeInput = {
    meshes: [meshInputFromObject("baked", 0, bakedMesh)],
    materials: [GREY],
    lights: [],
    environment: EMPTY_ENVIRONMENT,
  };
  const prepared = prepareLightBake(input, { maxSize: 64, maxTexelsPerMeter: 8 });
  const data = parseXriftLightmapData(encodeXriftLightmapData(prepared.data));
  const record = data.meshes[0]!;
  assert(record.appended.length > 0, "A smooth sphere needs vertices split at chart seams");

  const texture = new DataTexture(new Float32Array(4 * 4 * 4), 4, 4, RGBAFormat, FloatType);
  const applier = createXriftLightmapApplier({ root, entityKey: "xriftEntityId", data, texture });
  // 関数越しに読む。直接比べると、前の検査で絞り込まれた型が次の検査を誤って弾く。
  const appliedCount = (): number => applier.appliedCount;
  applier.update();
  assert(appliedCount() === 1, "The baked mesh must receive the lightmap");
  assert(bakedMesh.geometry !== sphere, "The baked mesh must draw a geometry with lightmap UVs");
  assert(xriftLightmapSourceGeometry(bakedMesh.geometry) === sphere, "The patched geometry must remember its source");
  assert(plainMesh.geometry === sphere && plainMesh.material === sharedMaterial, "A mesh outside the bake keeps the shared geometry and Material");
  assert(childMesh.geometry === sphere && childMesh.material === sharedMaterial, "A child Entity does not inherit its parent's bake");
  assert(!("lightMap" in sharedMaterial) || sharedMaterial.lightMap === null, "The shared Material itself must stay without a lightmap");
  const lit = bakedMesh.material as MeshStandardMaterial;
  assert(lit !== sharedMaterial && lit.lightMap !== null && lit.lightMap.channel === 1, "The baked mesh draws a copy of the Material that reads the lightmap from UV1");
  const patched = bakedMesh.geometry;
  const uv1 = patched.getAttribute("uv1");
  const position = patched.getAttribute("position");
  const sourcePosition = sphere.getAttribute("position");
  assert(uv1 && uv1.count === record.vertexCount + record.appended.length, "Lightmap UVs must cover every vertex including the split ones");
  assert(position.count === uv1.count, "Every attribute must grow with the split vertices");
  // 頂点を分けても、三角形の位置は1つも動かない。
  const index = patched.getIndex()!;
  const sourceIndex = sphere.getIndex()!;
  for (let corner = 0; corner < index.count; corner += 1) {
    const a = index.getX(corner);
    const b = sourceIndex.getX(corner);
    assert(
      position.getX(a) === sourcePosition.getX(b) &&
        position.getY(a) === sourcePosition.getY(b) &&
        position.getZ(a) === sourcePosition.getZ(b),
      "Splitting vertices must not move any triangle",
    );
  }
  assert(lit.clone() instanceof MeshStandardMaterial && (lit.clone() as MeshStandardMaterial).lightMap === null, "Cloning the lit copy must give a Material without the lightmap");

  // 元のMaterialの変更は、写しへ届く。
  sharedMaterial.color.set("#00ff00");
  sharedMaterial.roughness = 0.9;
  assert(applier.sync() === false, "Nothing replaced the mesh's geometry or Material");
  assert(lit.color.getHexString() === "00ff00" && lit.roughness === 0.9, "Edits to the source Material must reach the lit copy");

  // 他の処理がMaterialを差し替えたら、新しいMaterialから作り直す。
  const replacement = new MeshStandardMaterial({ color: "#0000ff" });
  bakedMesh.material = replacement;
  assert(applier.sync() === true, "A replaced Material must be noticed");
  applier.update();
  const relit = bakedMesh.material as MeshStandardMaterial;
  assert(relit !== replacement && relit.lightMap !== null && relit.color.getHexString() === "0000ff", "A replaced Material must be lit again from the new source");

  // ライトマップを表示できないMaterialには貼らない。
  bakedMesh.material = new MeshBasicMaterial();
  applier.update();
  assert(appliedCount() === 0 && applier.skipped.get("baked\n0") === "material-unsupported", "An unlit Material must be left alone");
  assert(bakedMesh.geometry === sphere, "A skipped mesh must draw its original geometry");
  bakedMesh.material = replacement;
  applier.update();
  assert(appliedCount() === 1, "A supported Material must be lit once it returns");

  // 形が変わったMeshには貼らない。でたらめなUVを付けない。
  bakedMesh.geometry = new SphereGeometry(1, 8, 6);
  applier.update();
  assert(appliedCount() === 0 && applier.skipped.get("baked\n0") === "geometry-changed", "A mesh whose geometry no longer matches the bake must be skipped");
  bakedMesh.geometry = sphere;
  applier.update();
  assert(appliedCount() === 1, "The original geometry must be lit again");

  // 対象から外したMeshは、すぐ元へ戻る。
  delete scope.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY];
  applier.update();
  assert(appliedCount() === 0 && bakedMesh.geometry === sphere && bakedMesh.material === replacement, "Removing the scope must restore the mesh");
  scope.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY] = true;
  applier.update();
  applier.dispose();
  assert(bakedMesh.geometry === sphere && bakedMesh.material === replacement, "Disposing must restore the original geometry and Material");

  // 同じMaterialを使う二つのMeshは、ライトマップ付きの写しも一つを共有する。
  {
    const box = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: "#888888" });
    const pair = new Group();
    const meshes = ["left", "right"].map((entityId, index) => {
      const entity = new Group();
      entity.userData.xriftEntityId = entityId;
      entity.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY] = true;
      const mesh: Mesh = new Mesh(box, material);
      mesh.position.x = index * 3;
      entity.add(mesh);
      pair.add(entity);
      return mesh;
    });
    const pairPrepared = prepareLightBake(
      {
        meshes: [
          meshInput("left", box, {}),
          meshInput("right", box, { position: [3, 0, 0] }),
        ],
        materials: [GREY],
        lights: [],
        environment: EMPTY_ENVIRONMENT,
      },
      { maxSize: 64, maxTexelsPerMeter: 8 },
    );
    const pairApplier = createXriftLightmapApplier({
      root: pair,
      entityKey: "xriftEntityId",
      data: parseXriftLightmapData(encodeXriftLightmapData(pairPrepared.data)),
      texture,
    });
    // こちらも関数越しに読む。前の検査で絞り込まれた型を、次の検査へ持ち越さない。
    const pairMaterialCount = (): number => pairApplier.materialCount;
    pairApplier.update();
    assert(pairApplier.appliedCount === 2, "Both meshes must receive the lightmap");
    assert(pairMaterialCount() === 1 && meshes[0]!.material === meshes[1]!.material, "Meshes sharing a Material must share one lit copy");
    assert(meshes[0]!.geometry !== meshes[1]!.geometry, "Each mesh keeps its own lightmap UVs");
    assert(
      meshes[0]!.geometry.getAttribute("position") === box.getAttribute("position"),
      "A mesh that needs no split vertices shares the original vertex data",
    );
    pairApplier.dispose();
    assert(pairMaterialCount() === 0 && meshes.every((mesh) => mesh.material === material && mesh.geometry === box), "Disposing must release the shared copy and restore both meshes");
  }

  // 画像はEXRにして読み戻しても、行の並びと負の値が保たれる。
  // 16の倍数の大きさで確かめる。ライトマップは64px以上の2のべき乗にしかならない。
  const side = 16;
  const pixels = new Float32Array(side * side * 4);
  for (let texel = 0; texel < side * side; texel += 1) {
    pixels[texel * 4] = texel < side ? -0.5 : 3.25;
    pixels[texel * 4 + 1] = (texel % 8) * 0.125;
    pixels[texel * 4 + 2] = 0;
    pixels[texel * 4 + 3] = 1;
  }
  const exr = await new EXRExporter().parse(new DataTexture(pixels, side, side, RGBAFormat, FloatType));
  const decoded = new EXRLoader().parse(
    exr.buffer.slice(exr.byteOffset, exr.byteOffset + exr.byteLength) as ArrayBuffer,
  ) as unknown as { data: Uint16Array | Float32Array; width: number; height: number };
  assert(decoded.width === side && decoded.height === side, "The lightmap must keep its size through EXR");
  const half = (value: number): number => {
    // 半精度の値を数値へ戻す。
    const exponent = (value >> 10) & 0x1f;
    const fraction = value & 0x3ff;
    const sign = value & 0x8000 ? -1 : 1;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  };
  const read = (index: number): number =>
    decoded.data instanceof Float32Array ? decoded.data[index]! : half(decoded.data[index]!);
  assert(Math.abs(read(0) - -0.5) < 1e-3, "Row 0 must stay row 0, and negative light must survive");
  assert(Math.abs(read(side * 4) - 3.25) < 1e-3, "Light above 1 must survive, in the second row");
  assert(Math.abs(read((side + 5) * 4 + 1) - 0.625) < 1e-3, "Columns must keep their order");
}

function fixtureDocumentsAndCompiler(): void {
  const prototype = createPrototypeProject("world", "light-bake-fixture");
  const floorId = "entity-world-floor";
  const objectId = "entity-world-object";
  const light = prototype.scene.entities["entity-world-light"]!.components.find(
    (component) => component.type === "light",
  )!;

  let scene: SceneDocument = prototype.scene;
  assert(listLightBakeMeshes(scene, prototype.assets).every((entry) => !entry.target), "Nothing is a bake target until the author chooses");
  scene = updateMeshLightBakeSettings(scene, floorId, { enabled: true });
  scene = updateMeshLightBakeSettings(scene, objectId, { enabled: true, scale: 2 });
  assert(updateMeshLightBakeSettings(scene, floorId, { enabled: true }) === scene, "Marking a target twice must not change the Scene");
  assert(updateMeshLightBakeSettings(scene, floorId, { scale: 100 }) === scene, "An out-of-range scale must be refused");
  scene = updateLightComponent(scene, "entity-world-light", { bakeMode: "baked" }, light.id);
  const meshes = listLightBakeMeshes(scene, prototype.assets);
  assert(meshes.filter((entry) => entry.target).length === 2, "Both marked meshes must be listed as targets");
  assert(meshes.find((entry) => entry.entityId === objectId)?.scale === 2, "A mesh keeps its density multiplier");
  assert(listLightBakeLights(scene)[0]?.bakeMode === "baked", "The Light must report its bake mode");

  // 保存して読み直しても、対象・ライトの扱い・ライトマップが残る。
  const signature = computeLightBakeSignature(scene, prototype.assets);
  const lightmap: LightmapAsset = {
    id: "lightmap-fixture",
    name: "Fixture lightmap",
    kind: "lightmap",
    status: "ready",
    source: { kind: "project", relativePath: "assets/imported/lightmaps/abc/lightmap.exr" },
    sourceHash: "a".repeat(64),
    lightmap: {
      formatVersion: LIGHTMAP_ASSET_FORMAT_VERSION,
      size: 256,
      byteLength: 10,
      dataPath: "assets/imported/lightmaps/abc/lightmap-uv.bin",
      dataHash: "b".repeat(64),
      dataByteLength: 10,
      sceneId: scene.sceneId,
      bakedAt: "2026-11-18T00:00:00.000Z",
      signature,
      entityIds: [floorId, objectId],
      bakedLightComponentIds: [light.id],
      settings: { quality: "standard", softness: 0.35, samples: 96, bounces: 2 },
      stats: { meshCount: 2, triangleCount: 14, texelCount: 100, texelsPerMeter: 20, durationMs: 5 },
    },
  };
  const assets = {
    ...prototype.assets,
    assets: { ...prototype.assets.assets, [lightmap.id]: lightmap },
  };
  scene = setSceneLightmap(scene, lightmap.id);
  const savedScene = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(scene));
  const savedAssets = assetManifestCodec.parse(assetManifestCodec.serialize(assets));
  assert(savedScene.ok && savedAssets.ok, "A Scene with a lightmap must save and load");
  assert(
    resolveSceneSettings(savedScene.document.settings).lightBake.lightmapAssetId === lightmap.id &&
      savedAssets.document.assets[lightmap.id]?.kind === "lightmap",
    "The lightmap reference and the Lightmap Asset must survive a save",
  );

  assert(resolveLightBakeStatus(scene, assets).state === "current", "A fresh bake matches its Scene");
  assert(suppressedBakedLightComponentIds(scene, assets).has(light.id), "A baked Light is switched off while its lightmap is in use");
  assert([...lightmappedEntityIds(scene, assets)].sort().join() === [floorId, objectId].sort().join(), "Both targets wear the lightmap");
  // 対象を動かすと、焼き直しが要る。
  const moved = {
    ...scene,
    entities: {
      ...scene.entities,
      [objectId]: {
        ...scene.entities[objectId]!,
        components: scene.entities[objectId]!.components.map((component) =>
          component.type === "transform" ? { ...component, position: [3, 0.5, 0] as [number, number, number] } : component,
        ),
      },
    },
  };
  assert(resolveLightBakeStatus(moved, assets).state === "stale", "Moving a target makes the bake stale");
  // ライトを「リアルタイム」へ戻すと、焼き直す前でもすぐ点く。
  const realtime = updateLightComponent(scene, "entity-world-light", { bakeMode: "realtime" }, light.id);
  assert(suppressedBakedLightComponentIds(realtime, assets).size === 0, "A Light set back to realtime lights the Scene again at once");
  // 対象から外したMeshは、ライトマップも外れる。
  const untargeted = updateMeshLightBakeSettings(scene, objectId, { enabled: false });
  assert(!lightmappedEntityIds(untargeted, assets).has(objectId), "A mesh removed from the targets stops wearing the lightmap");
  // 別のScene用のライトマップは使わない。
  const foreign = { ...assets, assets: { ...assets.assets, [lightmap.id]: { ...lightmap, lightmap: { ...lightmap.lightmap, sceneId: "other-scene" } } } };
  assert(resolveLightBakeStatus(scene, foreign).state === "none", "A lightmap baked for another Scene must not be used");

  // ベイクの対象は、同じ形として束ねない。
  assert(
    !collectModelInstancingEntities(scene, assets).some((id) => id === floorId || id === objectId),
    "Lightmapped meshes must stay out of instancing",
  );

  const compiled = compileVisualProject(
    { project: prototype.project, scenes: { [scene.sceneId]: scene }, assets, prefabs: prototype.prefabs },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  assert(compiled.canStage, `A Scene with a lightmap must compile: ${compiled.diagnostics.map((entry) => entry.message).join(" / ")}`);
  const world = compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")!.content;
  const copies = compiled.assetCopyPlan.filter((entry) => entry.assetId === lightmap.id);
  assert(copies.length === 2, "The lightmap image and its UV data must both be copied");
  assert(
    copies.every((entry) => /^public\/[^/]+$/.test(entry.targetRelativePath) && entry.supportedByCompiler),
    "Lightmap files must sit flat in the published world's root",
  );
  assert(
    copies.map((entry) => entry.sourceRelativePath).sort().join() ===
      [lightmap.lightmap.dataPath, lightmap.source.relativePath].sort().join(),
    "The published files must be the very files the editor draws with",
  );
  assert(world.includes("<XRiftStudioLightmap />") && world.includes('from "./xrift-studio/lightmap-runtime"'), "The published world must mount the shared lightmap runtime");
  for (const copy of copies) {
    assert(world.includes(JSON.stringify(copy.targetRelativePath.replace(/^public\//, ""))), "The published world must load each copied lightmap file");
  }
  assert(world.split("xriftLightmapScope: true").length - 1 === 2, "Each target mesh must carry the scope marker the editor uses");
  assert(/<XriftScriptLight[^>]* baked[ />]/.test(world), "A baked Light must be switched off in the published world too");
  for (const path of ["lightmap-runtime.tsx", "lightmap-apply.ts", "lightmap-data.ts"]) {
    const overlay = compiled.overlayFiles.find((file) => file.relativePath === `src/xrift-studio/${path}`);
    assert(overlay, `The published world must carry ${path}`);
    assert(!/from\s+["']\.\.?\/[^"']*\.js["']/.test(overlay.content), `${path} must import its siblings by their published names`);
  }

  // Runtime JSONの公開は、まだライトマップを貼れない。違う見た目で出さずに止める。
  const runtime = compileVisualProject(
    { project: prototype.project, scenes: { [scene.sceneId]: scene }, assets, prefabs: prototype.prefabs },
    { generatedAt: "2026-01-01T00:00:00.000Z", outputMode: "classic-runtime" },
  );
  assert(
    !runtime.canStage &&
      runtime.diagnostics.some(
        (entry) => entry.severity === "blocking" && entry.code === "lightmap-unsupported-runtime-output",
      ),
    "A Runtime JSON publish must refuse a Scene whose baked lighting it cannot show",
  );

  // ライトマップを外したSceneは、ライトマップに関するものを何も出さない。
  const plain = compileVisualProject(
    { project: prototype.project, scenes: { [scene.sceneId]: setSceneLightmap(scene, undefined) }, assets, prefabs: prototype.prefabs },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const plainWorld = plain.overlayFiles.find((file) => file.relativePath === "src/World.tsx")!.content;
  assert(!plainWorld.includes("Lightmap") && !plainWorld.includes("xriftLightmapScope"), "Without a lightmap the published world carries no lightmap code");
  assert(!/<XriftScriptLight[^>]* baked[ />]/.test(plainWorld), "Without a lightmap a baked Light lights the Scene in realtime");
  assert(!plain.assetCopyPlan.some((entry) => entry.assetId === lightmap.id), "An unused Lightmap Asset must not be published");
  assert(!plain.overlayFiles.some((file) => file.relativePath.includes("lightmap")), "Without a lightmap no lightmap runtime file is emitted");
  const plainRuntime = compileVisualProject(
    { project: prototype.project, scenes: { [scene.sceneId]: setSceneLightmap(scene, undefined) }, assets, prefabs: prototype.prefabs },
    { generatedAt: "2026-01-01T00:00:00.000Z", outputMode: "classic-runtime" },
  );
  assert(
    !plainRuntime.diagnostics.some((entry) => entry.code === "lightmap-unsupported-runtime-output"),
    "Without a lightmap the Runtime JSON publish is not refused for baked lighting",
  );
}

/** MCPのdocument toolで、対象・ライトの扱い・設定を読み書きする。 */
function fixtureMcpTools(): void {
  const prototype = createPrototypeProject("world", "light-bake-mcp");
  const base = {
    projectId: prototype.project.projectId,
    sceneId: prototype.scene.sceneId,
  };
  const context: XriftMcpEditorContext = {
    bundle: prototype,
    sceneSelection: null,
    assetSelection: null,
    editorMode: "edit",
    importBusy: false,
    revision: 3,
    saveStatus: "saved",
    now: () => "2026-11-18T00:00:00.000Z",
  };
  type ToolName = Parameters<typeof executeXriftMcpEditorTool>[1]["tool"];
  const rejects = (tool: ToolName, argumentsValue: Record<string, unknown>, target = context): string => {
    try {
      executeXriftMcpEditorTool(target, { id: `fixture-${tool}`, tool, arguments: argumentsValue });
    } catch (error) {
      if (error instanceof XriftMcpEditorToolError) return error.code;
      throw error;
    }
    return "";
  };

  const read = executeXriftMcpEditorTool(context, { id: "read", tool: "get_light_bake", arguments: {} });
  const snapshot = read.result as {
    lightmap: { state: string };
    meshes: { entityId: string; target: boolean }[];
    lights: { bakeMode: string }[];
    settings: { resolution: number; quality: string; softness: number };
  };
  assert(!read.changed && snapshot.lightmap.state === "none", "A new Scene has no lightmap");
  assert(snapshot.meshes.length >= 2 && snapshot.meshes.every((mesh) => !mesh.target), "get_light_bake lists every mesh, none targeted yet");
  assert(snapshot.lights[0]?.bakeMode === "realtime", "Lights start as realtime");
  assert(snapshot.settings.resolution === 1024 && snapshot.settings.quality === "standard", "get_light_bake reports the default settings");

  const selected = executeXriftMcpEditorTool(context, {
    id: "select",
    tool: "set_light_bake_targets",
    arguments: { ...base, expectedRevision: 3, selectStatic: true, enabled: true },
  });
  assert(selected.changed, "selectStatic must mark the static meshes");
  assert(
    (selected.result.meshes as { target: boolean }[]).every((mesh) => mesh.target),
    "Every static mesh becomes a target",
  );
  assert(selected.result.revisionAfter === 4, "A target change advances the revision");
  const repeated = executeXriftMcpEditorTool(
    { ...context, bundle: selected.bundle, revision: 4 },
    { id: "repeat", tool: "set_light_bake_targets", arguments: { ...base, expectedRevision: 4, selectStatic: true, enabled: true } },
  );
  assert(!repeated.changed, "Marking the same targets again changes nothing");
  const removed = executeXriftMcpEditorTool(
    { ...context, bundle: selected.bundle, revision: 4 },
    { id: "remove", tool: "set_light_bake_targets", arguments: { ...base, expectedRevision: 4, entityIds: ["entity-world-object"], enabled: false } },
  );
  assert(
    (removed.result.meshes as { entityId: string; target: boolean }[]).find((mesh) => mesh.entityId === "entity-world-object")?.target === false,
    "A named Entity can be removed from the targets",
  );
  assert(rejects("set_light_bake_targets", { ...base, expectedRevision: 3, enabled: true }) === "INVALID_ARGUMENT", "Targets need entityIds or selectStatic");
  assert(rejects("set_light_bake_targets", { ...base, expectedRevision: 3, entityIds: ["missing"], enabled: true }) === "ENTITY_NOT_FOUND", "An unknown Entity is refused");
  assert(rejects("set_light_bake_targets", { ...base, expectedRevision: 3, entityIds: ["entity-world-light"], enabled: true }) === "INVALID_ARGUMENT", "An Entity without a mesh cannot be a target");
  assert(rejects("set_light_bake_targets", { ...base, expectedRevision: 2, selectStatic: true, enabled: true }) === "STALE_REVISION", "A stale revision is refused");
  assert(rejects("set_light_bake_targets", { ...base, expectedRevision: 3, selectStatic: true, enabled: true }, { ...context, editorMode: "play" }) === "EDITOR_READ_ONLY", "Targets cannot change during Play");

  const settings = executeXriftMcpEditorTool(context, {
    id: "settings",
    tool: "update_light_bake_settings",
    arguments: { ...base, expectedRevision: 3, resolution: 2048, quality: "high", softness: 0.8 },
  });
  const updated = (settings.result.settings as { resolution: number; quality: string; softness: number });
  assert(settings.changed && updated.resolution === 2048 && updated.quality === "high" && updated.softness === 0.8, "update_light_bake_settings stores the new settings");
  assert(rejects("update_light_bake_settings", { ...base, expectedRevision: 3, resolution: 1000 }) === "INVALID_ARGUMENT", "An unsupported lightmap size is refused");
  assert(rejects("update_light_bake_settings", { ...base, expectedRevision: 3, softness: 2 }) === "INVALID_ARGUMENT", "Softness outside 0..1 is refused");
  assert(rejects("update_light_bake_settings", { ...base, expectedRevision: 3 }) === "INVALID_ARGUMENT", "A settings call must change something");

  // ライトの扱いは、Lightへのupdate_componentで変える。
  const light = prototype.scene.entities["entity-world-light"]!.components.find((component) => component.type === "light")!;
  const baked = executeXriftMcpEditorTool(context, {
    id: "light",
    tool: "update_component",
    arguments: { ...base, expectedRevision: 3, entityId: "entity-world-light", componentId: light.id, patch: { bakeMode: "baked" } },
  });
  assert(baked.changed && listLightBakeLights(baked.bundle.scene)[0]?.bakeMode === "baked", "update_component sets a Light's bake mode");
  assert(
    rejects("update_component", { ...base, expectedRevision: 3, entityId: "entity-world-light", componentId: light.id, patch: { bakeMode: "mixed" } }) !== "",
    "An unknown bake mode is refused",
  );

  // removeLightmapは、Sceneからライトマップを外す。
  const withLightmap = setSceneLightmap(prototype.scene, "lightmap-any");
  const detached = executeXriftMcpEditorTool(
    { ...context, bundle: { ...prototype, scene: withLightmap } },
    { id: "detach", tool: "update_light_bake_settings", arguments: { ...base, expectedRevision: 3, removeLightmap: true } },
  );
  assert(
    detached.changed && resolveSceneSettings(detached.bundle.scene.settings).lightBake.lightmapAssetId === undefined,
    "removeLightmap detaches the lightmap from the Scene",
  );
}

export async function runLightBakeFixtureAssertions(): Promise<void> {
  fixtureBvh();
  fixtureUnwrap();
  fixtureRaster();
  fixtureDataRoundTrip();
  fixtureBakedShadow();
  fixtureAmbientOcclusion();
  fixtureEmissiveAndClosedShapes();
  await fixtureApplier();
  fixtureDocumentsAndCompiler();
  fixtureMcpTools();
}
