import { buildTriangleBvh, BvhRaycaster, type TriangleBvh } from "./bvh";
import { closestPointOnTriangle } from "./raster";

/**
 * ライトマップの1テクセルへ届く光を、レイを飛ばして求める。
 *
 * 焼くのは「動かない面が受ける、リアルタイム描画には無い光」である。
 *
 * - 「ベイク」にしたライトの直接光と影。そのライトは描画時に消える。
 * - すべてのライトの間接光（面で跳ね返った光）。
 * - 光る面（Emissive）が周りを照らす光。
 * - 環境光が物陰で遮られるぶんの差。環境光そのものは描画時にも足されるので、
 *   遮られて届かないぶんを負の値として持つ。開けた場所では差がちょうど0になる。
 *
 * 値はthree.jsの `lightMap` と同じ意味の放射照度で、描画時に Albedo / π が掛かる。
 */

export type Vec3 = [number, number, number];

/** GPUから読み戻した、リニア色の小さな画像。行0がv=0。 */
export type BakeTexture = {
  width: number;
  height: number;
  data: Uint8Array;
};

/** UVの変換。u' = a*u + c*v + e、v' = b*u + d*v + f。 */
export type BakeTextureTransform = [number, number, number, number, number, number];

export type BakeMaterial = {
  /** 拡散反射率（リニア）。ベースカラー × (1 - メタリック)。 */
  albedo: Vec3;
  /** 面が放つ光（リニア）。Emissive × 強さ。 */
  emissive: Vec3;
  opacity: number;
  /** opaque: 常に遮る。mask: アルファが閾値以上の所だけ遮る。blend: 遮らず、跳ね返さない。 */
  alphaMode: "opaque" | "mask" | "blend";
  alphaCutoff: number;
  doubleSided: boolean;
  albedoTexture?: BakeTexture;
  albedoTransform?: BakeTextureTransform;
  emissiveTexture?: BakeTexture;
  emissiveTransform?: BakeTextureTransform;
};

type BakeLightBase = {
  /** trueなら直接光もライトマップへ入れる。falseなら間接光だけ。 */
  baked: boolean;
  /** 色 × 強さ（リニア）。 */
  color: Vec3;
};

export type BakeLight =
  | (BakeLightBase & {
      type: "directional";
      /** 面からライトへ向かう単位ベクトル。 */
      direction: Vec3;
    })
  | (BakeLightBase & {
      type: "point";
      position: Vec3;
      distance: number;
      decay: number;
    })
  | (BakeLightBase & {
      type: "spot";
      position: Vec3;
      /** 照らす先からライトへ向かう単位ベクトル。 */
      direction: Vec3;
      distance: number;
      decay: number;
      coneCos: number;
      penumbraCos: number;
    })
  | (BakeLightBase & {
      type: "rect";
      position: Vec3;
      /** 中心から辺の中点までのベクトル。 */
      halfU: Vec3;
      halfV: Vec3;
      /** 光を出す向き。 */
      normal: Vec3;
    });

export type BakeHemisphere = {
  baked: boolean;
  sky: Vec3;
  ground: Vec3;
  /** 空側の向き。three.jsと同じく、ライトの位置を正規化したもの。 */
  direction: Vec3;
};

/** 6面 × size × size × 3 の放射輝度。面の並びは `environmentMapTexel` が決める。 */
export type BakeEnvironmentMap = {
  size: number;
  faces: Float32Array;
};

export type BakeEnvironment = {
  /** 描画時にも足される環境光の放射照度。 */
  ambientRealtime: Vec3;
  /** ライトマップへ焼き切り、描画時には消える環境光の放射照度。 */
  ambientBaked: Vec3;
  hemispheres: BakeHemisphere[];
  /** SkyboxのIBL。描画時にも足される。 */
  map?: BakeEnvironmentMap;
};

export type BakeScene = {
  /** 1三角形9要素のワールド座標。 */
  positions: Float32Array;
  /** 1三角形9要素の頂点法線。 */
  normals: Float32Array;
  /** 1三角形6要素のUV0。Textureを引くために使う。 */
  uvs: Float32Array;
  /** 1三角形6要素の、ライトマップ上の位置（ピクセル）。 */
  lightmapUvs: Float32Array;
  triangleMaterial: Uint16Array;
  materials: BakeMaterial[];
  lights: BakeLight[];
  environment: BakeEnvironment;
};

export type BakeSettings = {
  /** 1テクセルあたりのレイの本数。 */
  samples: number;
  /** 光が跳ね返る回数。0なら直接光と環境光の遮蔽だけ。 */
  bounces: number;
  /** 影のやわらかさ。0でくっきり、1で大きくぼける。 */
  softness: number;
  seed?: number;
};

/** 1テクセルの結果は5要素。RGB、有効かどうか、明るさのばらつき。 */
export const BAKE_TEXEL_STRIDE = 5;

/** 最初のレイのうち、これを超える割合が裏面に当たったテクセルは、形の内側にあるとみなす。 */
const BACKFACE_TOLERANCE = 0.4;

// 4次元の準乱数列（R4）。1テクセル内のレイを偏りなく散らす。
const R4_A = 0.8566748838545029;
const R4_B = 0.733891856627126;
const R4_C = 0.6287067210378087;
const R4_D = 0.5385972572236101;

const INV_PI = 1 / Math.PI;

/** 環境マップの方向から、面とテクセルを引く。書く側と読む側が同じ関数を使う。 */
export function environmentMapTexel(
  size: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  let face: number;
  let major: number;
  let u: number;
  let v: number;
  if (ax >= ay && ax >= az) {
    face = dx >= 0 ? 0 : 1;
    major = ax;
    u = dy;
    v = dz;
  } else if (ay >= az) {
    face = dy >= 0 ? 2 : 3;
    major = ay;
    u = dz;
    v = dx;
  } else {
    face = dz >= 0 ? 4 : 5;
    major = az;
    u = dx;
    v = dy;
  }
  if (!(major > 0)) return 0;
  let x = Math.floor(((u / major) * 0.5 + 0.5) * size);
  let y = Math.floor(((v / major) * 0.5 + 0.5) * size);
  if (x < 0) x = 0; else if (x >= size) x = size - 1;
  if (y < 0) y = 0; else if (y >= size) y = size - 1;
  return ((face * size + y) * size + x) * 3;
}

/** 環境マップの各テクセルが向く方向。`environmentMapTexel` の逆。 */
export function environmentMapDirection(
  size: number,
  face: number,
  x: number,
  y: number,
): Vec3 {
  const u = ((x + 0.5) / size) * 2 - 1;
  const v = ((y + 0.5) / size) * 2 - 1;
  const sign = face % 2 === 0 ? 1 : -1;
  let direction: Vec3;
  if (face < 2) direction = [sign, u, v];
  else if (face < 4) direction = [v, sign, u];
  else direction = [u, v, sign];
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

export class LightBakeTracer {
  private readonly raycaster: BvhRaycaster;
  /** BVHに入れた三角形の番号から、Scene全体の三角形番号を引く。 */
  private readonly occluders: Uint32Array;
  private readonly bakedLights: BakeLight[];
  private readonly epsilon: number;
  private readonly directionalSpread: number;
  private readonly lightRadius: number;
  private readonly samples: number;
  private readonly bounces: number;
  private readonly seed: number;
  private rngState = 1;

  // 関数の戻り値を配列で返さないための置き場。
  private sr = 0;
  private sg = 0;
  private sb = 0;
  private sa = 1;
  private pathBackface = false;

  constructor(
    private readonly scene: BakeScene,
    settings: BakeSettings,
    prebuilt?: { bvh: TriangleBvh; occluders: Uint32Array },
  ) {
    this.samples = Math.max(1, Math.floor(settings.samples));
    this.bounces = Math.max(0, Math.floor(settings.bounces));
    this.seed = (settings.seed ?? 1) >>> 0;
    const softness = Math.min(Math.max(settings.softness, 0), 1);
    // 太陽の見かけの半径。0.1度（ほぼ点）から4度（大きな光源）まで。
    this.directionalSpread = Math.tan(((0.1 + 3.9 * softness * softness) * Math.PI) / 180);
    // 電球の半径。5mmから30cmまで。
    this.lightRadius = 0.005 + 0.295 * softness * softness;
    this.bakedLights = scene.lights.filter((light) => light.baked);

    const built = prebuilt ?? buildBakeOccluders(scene);
    this.occluders = built.occluders;
    const filtered = new Uint8Array(built.occluders.length);
    let anyFiltered = false;
    for (let index = 0; index < built.occluders.length; index += 1) {
      const material = scene.materials[scene.triangleMaterial[built.occluders[index]!]!];
      if (material?.alphaMode === "mask" && material.albedoTexture) {
        filtered[index] = 1;
        anyFiltered = true;
      }
    }
    this.raycaster = anyFiltered
      ? new BvhRaycaster(built.bvh, filtered, (triangle, u, v) =>
          this.cutoutBlocks(triangle, u, v),
        )
      : new BvhRaycaster(built.bvh);

    let extent = 1;
    const positions = scene.positions;
    for (let index = 0; index < positions.length; index += 1) {
      const value = Math.abs(positions[index]!);
      if (value > extent) extent = value;
    }
    // float32の桁落ちに負けない最小の浮かせ幅。原点から遠い面ほど大きく取る。
    this.epsilon = Math.max(1e-4, extent * 2e-6);
  }

  /** 抜きのあるMaterialで、当たった位置が不透明かどうか。 */
  private cutoutBlocks(occluder: number, u: number, v: number): boolean {
    const triangle = this.occluders[occluder]!;
    const material = this.scene.materials[this.scene.triangleMaterial[triangle]!]!;
    this.sampleAlbedo(material, triangle, u, v);
    return this.sa >= material.alphaCutoff;
  }

  private random(): number {
    // mulberry32
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private sampleTexture(
    texture: BakeTexture,
    transform: BakeTextureTransform | undefined,
    triangle: number,
    u: number,
    v: number,
  ): void {
    const uvs = this.scene.uvs;
    const base = triangle * 6;
    const w = 1 - u - v;
    let s = uvs[base]! * w + uvs[base + 2]! * u + uvs[base + 4]! * v;
    let t = uvs[base + 1]! * w + uvs[base + 3]! * u + uvs[base + 5]! * v;
    if (transform) {
      const s2 = transform[0] * s + transform[2] * t + transform[4];
      t = transform[1] * s + transform[3] * t + transform[5];
      s = s2;
    }
    s -= Math.floor(s);
    t -= Math.floor(t);
    let x = Math.floor(s * texture.width);
    let y = Math.floor(t * texture.height);
    if (x >= texture.width) x = texture.width - 1;
    if (y >= texture.height) y = texture.height - 1;
    const index = (y * texture.width + x) * 4;
    const data = texture.data;
    this.sr = data[index]! / 255;
    this.sg = data[index + 1]! / 255;
    this.sb = data[index + 2]! / 255;
    this.sa = data[index + 3]! / 255;
  }

  private sampleAlbedo(material: BakeMaterial, triangle: number, u: number, v: number): void {
    if (material.albedoTexture) {
      this.sampleTexture(material.albedoTexture, material.albedoTransform, triangle, u, v);
      this.sr *= material.albedo[0];
      this.sg *= material.albedo[1];
      this.sb *= material.albedo[2];
      this.sa *= material.opacity;
    } else {
      this.sr = material.albedo[0];
      this.sg = material.albedo[1];
      this.sb = material.albedo[2];
      this.sa = material.opacity;
    }
  }

  /** 描画時にも足される環境の放射輝度。結果は sr/sg/sb。 */
  private environmentRealtime(dx: number, dy: number, dz: number): void {
    const environment = this.scene.environment;
    let r = environment.ambientRealtime[0] * INV_PI;
    let g = environment.ambientRealtime[1] * INV_PI;
    let b = environment.ambientRealtime[2] * INV_PI;
    for (const hemisphere of environment.hemispheres) {
      if (hemisphere.baked) continue;
      const weight = hemisphereWeight(hemisphere, dx, dy, dz);
      r += Math.max(0, hemisphere.ground[0] + (hemisphere.sky[0] - hemisphere.ground[0]) * weight) * INV_PI;
      g += Math.max(0, hemisphere.ground[1] + (hemisphere.sky[1] - hemisphere.ground[1]) * weight) * INV_PI;
      b += Math.max(0, hemisphere.ground[2] + (hemisphere.sky[2] - hemisphere.ground[2]) * weight) * INV_PI;
    }
    const map = environment.map;
    if (map) {
      const index = environmentMapTexel(map.size, dx, dy, dz);
      r += map.faces[index]!;
      g += map.faces[index + 1]!;
      b += map.faces[index + 2]!;
    }
    this.sr = r;
    this.sg = g;
    this.sb = b;
  }

  /** ライトマップへ焼き切る環境の放射輝度。結果は sr/sg/sb。 */
  private environmentBaked(dx: number, dy: number, dz: number): void {
    const environment = this.scene.environment;
    let r = environment.ambientBaked[0] * INV_PI;
    let g = environment.ambientBaked[1] * INV_PI;
    let b = environment.ambientBaked[2] * INV_PI;
    for (const hemisphere of environment.hemispheres) {
      if (!hemisphere.baked) continue;
      const weight = hemisphereWeight(hemisphere, dx, dy, dz);
      r += Math.max(0, hemisphere.ground[0] + (hemisphere.sky[0] - hemisphere.ground[0]) * weight) * INV_PI;
      g += Math.max(0, hemisphere.ground[1] + (hemisphere.sky[1] - hemisphere.ground[1]) * weight) * INV_PI;
      b += Math.max(0, hemisphere.ground[2] + (hemisphere.sky[2] - hemisphere.ground[2]) * weight) * INV_PI;
    }
    this.sr = r;
    this.sg = g;
    this.sb = b;
  }

  /**
   * ライト一つが、ある点へ届ける放射照度。影のレイを1本飛ばす。結果は sr/sg/sb。
   * 減衰の式はthree.jsの物理ベースのライトと同じにしてある。
   */
  private lightIrradiance(
    light: BakeLight,
    ox: number, oy: number, oz: number,
    nx: number, ny: number, nz: number,
  ): void {
    this.sr = 0;
    this.sg = 0;
    this.sb = 0;
    const raycaster = this.raycaster;
    const epsilon = this.epsilon;
    if (light.type === "directional") {
      let lx = light.direction[0];
      let ly = light.direction[1];
      let lz = light.direction[2];
      const centerCos = nx * lx + ny * ly + nz * lz;
      if (centerCos <= 0) return;
      const spread = this.directionalSpread;
      if (spread > 0) {
        // 光源の円盤の中の1点を狙う。本数を重ねると半影になる。
        const radius = Math.sqrt(this.random()) * spread;
        const angle = this.random() * Math.PI * 2;
        const a = Math.cos(angle) * radius;
        const b = Math.sin(angle) * radius;
        let tx: number, ty: number, tz: number;
        if (Math.abs(lx) > 0.9) { tx = 0; ty = 1; tz = 0; } else { tx = 1; ty = 0; tz = 0; }
        // T = normalize(cross(T0, L)), B = cross(L, T)
        let ux = ty * lz - tz * ly;
        let uy = tz * lx - tx * lz;
        let uz = tx * ly - ty * lx;
        const length = Math.hypot(ux, uy, uz);
        ux /= length; uy /= length; uz /= length;
        const vx = ly * uz - lz * uy;
        const vy = lz * ux - lx * uz;
        const vz = lx * uy - ly * ux;
        lx += ux * a + vx * b;
        ly += uy * a + vy * b;
        lz += uz * a + vz * b;
        const norm = Math.hypot(lx, ly, lz);
        lx /= norm; ly /= norm; lz /= norm;
        if (nx * lx + ny * ly + nz * lz <= 0) return;
      }
      if (raycaster.occluded(ox, oy, oz, lx, ly, lz, epsilon, Infinity)) return;
      this.sr = light.color[0] * centerCos;
      this.sg = light.color[1] * centerCos;
      this.sb = light.color[2] * centerCos;
      return;
    }
    if (light.type === "rect") {
      const a = this.random() * 2 - 1;
      const b = this.random() * 2 - 1;
      const qx = light.position[0] + light.halfU[0] * a + light.halfV[0] * b;
      const qy = light.position[1] + light.halfU[1] * a + light.halfV[1] * b;
      const qz = light.position[2] + light.halfU[2] * a + light.halfV[2] * b;
      let lx = qx - ox;
      let ly = qy - oy;
      let lz = qz - oz;
      const distanceSq = lx * lx + ly * ly + lz * lz;
      if (!(distanceSq > 1e-10)) return;
      const distance = Math.sqrt(distanceSq);
      lx /= distance; ly /= distance; lz /= distance;
      const surfaceCos = nx * lx + ny * ly + nz * lz;
      const lightCos = -(lx * light.normal[0] + ly * light.normal[1] + lz * light.normal[2]);
      if (surfaceCos <= 0 || lightCos <= 0) return;
      if (raycaster.occluded(ox, oy, oz, lx, ly, lz, epsilon, distance - epsilon)) return;
      const area =
        4 *
        Math.hypot(light.halfU[0], light.halfU[1], light.halfU[2]) *
        Math.hypot(light.halfV[0], light.halfV[1], light.halfV[2]);
      // 面光源のごく近くでは1本のレイの寄与が発散する。上限で抑える。
      const factor = Math.min((surfaceCos * lightCos * area) / distanceSq, 16);
      this.sr = light.color[0] * factor;
      this.sg = light.color[1] * factor;
      this.sb = light.color[2] * factor;
      return;
    }
    // point / spot
    const cx = light.position[0] - ox;
    const cy = light.position[1] - oy;
    const cz = light.position[2] - oz;
    const centerDistance = Math.hypot(cx, cy, cz);
    if (!(centerDistance > 1e-6)) return;
    const clx = cx / centerDistance;
    const cly = cy / centerDistance;
    const clz = cz / centerDistance;
    const centerCos = nx * clx + ny * cly + nz * clz;
    if (centerCos <= 0) return;
    let attenuation = 1 / Math.max(Math.pow(centerDistance, light.decay), 0.01);
    if (light.distance > 0) {
      const ratio = centerDistance / light.distance;
      const window = Math.min(Math.max(1 - ratio * ratio * ratio * ratio, 0), 1);
      attenuation *= window * window;
    }
    if (light.type === "spot") {
      const angleCos =
        clx * light.direction[0] + cly * light.direction[1] + clz * light.direction[2];
      attenuation *= smoothstep(light.coneCos, light.penumbraCos, angleCos);
    }
    if (!(attenuation > 0)) return;
    // 電球の球の中の1点を狙う。
    let lx = cx;
    let ly = cy;
    let lz = cz;
    const radius = Math.min(this.lightRadius, centerDistance * 0.5);
    if (radius > 0) {
      const r = Math.sqrt(this.random()) * radius;
      const angle = this.random() * Math.PI * 2;
      const a = Math.cos(angle) * r;
      const b = Math.sin(angle) * r;
      let tx: number, ty: number, tz: number;
      if (Math.abs(clx) > 0.9) { tx = 0; ty = 1; tz = 0; } else { tx = 1; ty = 0; tz = 0; }
      let ux = ty * clz - tz * cly;
      let uy = tz * clx - tx * clz;
      let uz = tx * cly - ty * clx;
      const length = Math.hypot(ux, uy, uz);
      ux /= length; uy /= length; uz /= length;
      const vx = cly * uz - clz * uy;
      const vy = clz * ux - clx * uz;
      const vz = clx * uy - cly * ux;
      lx += ux * a + vx * b;
      ly += uy * a + vy * b;
      lz += uz * a + vz * b;
    }
    const distance = Math.hypot(lx, ly, lz);
    lx /= distance; ly /= distance; lz /= distance;
    if (raycaster.occluded(ox, oy, oz, lx, ly, lz, epsilon, distance - epsilon)) return;
    this.sr = light.color[0] * attenuation * centerCos;
    this.sg = light.color[1] * attenuation * centerCos;
    this.sb = light.color[2] * attenuation * centerCos;
  }

  /**
   * 1本の経路を追い、最初のレイの向きから届く放射輝度を求める。結果は pr/pg/pb。
   *
   * 環境光は描画時に「遮るものが無い」前提で足される。そこでこの関数は、
   * 最初のレイが何かに当たったら、その向きの環境光を引く。何にも当たらなければ
   * 何も足さない。こうすると開けた場所の結果は誤差なしの0になる。
   */
  private pr = 0;
  private pg = 0;
  private pb = 0;
  private tracePath(
    startX: number, startY: number, startZ: number,
    startDx: number, startDy: number, startDz: number,
  ): void {
    const scene = this.scene;
    const raycaster = this.raycaster;
    const positions = scene.positions;
    const normals = scene.normals;
    const lights = scene.lights;
    const epsilon = this.epsilon;
    let ox = startX, oy = startY, oz = startZ;
    let dx = startDx, dy = startDy, dz = startDz;
    let tr = 1, tg = 1, tb = 1;
    let r = 0, g = 0, b = 0;
    this.pathBackface = false;
    for (let depth = 0; depth <= this.bounces; depth += 1) {
      if (!raycaster.closest(ox, oy, oz, dx, dy, dz, epsilon, Infinity)) {
        this.environmentBaked(dx, dy, dz);
        r += tr * this.sr;
        g += tg * this.sg;
        b += tb * this.sb;
        if (depth > 0) {
          this.environmentRealtime(dx, dy, dz);
          r += tr * this.sr;
          g += tg * this.sg;
          b += tb * this.sb;
        }
        break;
      }
      if (depth === 0) {
        this.environmentRealtime(dx, dy, dz);
        r -= this.sr;
        g -= this.sg;
        b -= this.sb;
      }
      const triangle = this.occluders[raycaster.triangle]!;
      const material = scene.materials[scene.triangleMaterial[triangle]!]!;
      const backface = raycaster.backface;
      if (backface && !material.doubleSided) {
        // 閉じた形の内側から外へ出ようとしている。光は通さない。
        if (depth === 0) this.pathBackface = true;
        break;
      }
      const u = raycaster.u;
      const v = raycaster.v;
      const t = raycaster.t;
      const w = 1 - u - v;
      const base = triangle * 9;

      if (material.emissiveTexture) {
        this.sampleTexture(material.emissiveTexture, material.emissiveTransform, triangle, u, v);
        r += tr * material.emissive[0] * this.sr;
        g += tg * material.emissive[1] * this.sg;
        b += tb * material.emissive[2] * this.sb;
      } else {
        r += tr * material.emissive[0];
        g += tg * material.emissive[1];
        b += tb * material.emissive[2];
      }
      if (depth === this.bounces) break;

      // 面の向き。裏から当たった両面Materialは、当たった側へ向け直す。
      const e1x = positions[base + 3]! - positions[base]!;
      const e1y = positions[base + 4]! - positions[base + 1]!;
      const e1z = positions[base + 5]! - positions[base + 2]!;
      const e2x = positions[base + 6]! - positions[base]!;
      const e2y = positions[base + 7]! - positions[base + 1]!;
      const e2z = positions[base + 8]! - positions[base + 2]!;
      let gx = e1y * e2z - e1z * e2y;
      let gy = e1z * e2x - e1x * e2z;
      let gz = e1x * e2y - e1y * e2x;
      const gLength = Math.hypot(gx, gy, gz);
      if (!(gLength > 0)) break;
      const flip = backface ? -1 : 1;
      gx = (gx / gLength) * flip;
      gy = (gy / gLength) * flip;
      gz = (gz / gLength) * flip;
      let nx = (normals[base]! * w + normals[base + 3]! * u + normals[base + 6]! * v) * flip;
      let ny = (normals[base + 1]! * w + normals[base + 4]! * u + normals[base + 7]! * v) * flip;
      let nz = (normals[base + 2]! * w + normals[base + 5]! * u + normals[base + 8]! * v) * flip;
      const nLength = Math.hypot(nx, ny, nz);
      if (nLength > 1e-8 && (nx * gx + ny * gy + nz * gz) / nLength > 0.05) {
        nx /= nLength; ny /= nLength; nz /= nLength;
      } else {
        nx = gx; ny = gy; nz = gz;
      }

      this.sampleAlbedo(material, triangle, u, v);
      const ar = this.sr;
      const ag = this.sg;
      const ab = this.sb;
      const hx = ox + dx * t + gx * epsilon;
      const hy = oy + dy * t + gy * epsilon;
      const hz = oz + dz * t + gz * epsilon;

      // 当たった面を照らすライトを足す。リアルタイムのライトの間接光もここで入る。
      for (let index = 0; index < lights.length; index += 1) {
        this.lightIrradiance(lights[index]!, hx, hy, hz, nx, ny, nz);
        r += tr * ar * INV_PI * this.sr;
        g += tg * ag * INV_PI * this.sg;
        b += tb * ab * INV_PI * this.sb;
      }

      tr *= ar;
      tg *= ag;
      tb *= ab;
      if (depth >= 1) {
        // ほとんど光を運ばなくなった経路は、確率で打ち切る。
        const survive = Math.min(Math.max(Math.max(tr, tg, tb), 0.05), 0.95);
        if (this.random() > survive) break;
        tr /= survive;
        tg /= survive;
        tb /= survive;
      }
      if (!(tr + tg + tb > 1e-5)) break;

      const direction = this.cosineDirection(nx, ny, nz, gx, gy, gz, this.random(), this.random());
      ox = hx;
      oy = hy;
      oz = hz;
      dx = direction[0];
      dy = direction[1];
      dz = direction[2];
    }
    this.pr = r;
    this.pg = g;
    this.pb = b;
  }

  private readonly directionScratch: Vec3 = [0, 0, 1];

  /** 法線の周りの、余弦に比例した向き。面の下へ向いたら面の上へ折り返す。 */
  private cosineDirection(
    nx: number, ny: number, nz: number,
    gx: number, gy: number, gz: number,
    u1: number, u2: number,
  ): Vec3 {
    const radius = Math.sqrt(u1);
    const angle = u2 * Math.PI * 2;
    const a = radius * Math.cos(angle);
    const b = radius * Math.sin(angle);
    const c = Math.sqrt(Math.max(0, 1 - u1));
    // 法線に直交する二つの軸（Duffらの方法）。
    const sign = nz >= 0 ? 1 : -1;
    const p = -1 / (sign + nz);
    const q = nx * ny * p;
    const t1x = 1 + sign * nx * nx * p;
    const t1y = sign * q;
    const t1z = -sign * nx;
    const t2x = q;
    const t2y = sign + ny * ny * p;
    const t2z = -ny;
    let dx = t1x * a + t2x * b + nx * c;
    let dy = t1y * a + t2y * b + ny * c;
    let dz = t1z * a + t2z * b + nz * c;
    const below = dx * gx + dy * gy + dz * gz;
    if (below < 1e-4) {
      // なめらかな法線は面より傾くことがある。面の下へ出たレイは隣の面に
      // すぐ当たって黒い筋になるので、面の上へ折り返す。
      const push = 1e-4 - below * 2;
      dx += gx * push;
      dy += gy * push;
      dz += gz * push;
    }
    const length = Math.hypot(dx, dy, dz);
    const out = this.directionScratch;
    out[0] = dx / length;
    out[1] = dy / length;
    out[2] = dz / length;
    return out;
  }

  /**
   * 1テクセルを焼く。
   *
   * @param texelX テクセルの列。
   * @param texelY テクセルの行。
   * @param triangle 担当する三角形。
   * @param baryU 担当位置の重心座標。
   */
  bakeTexel(
    texelX: number,
    texelY: number,
    triangle: number,
    baryU: number,
    baryV: number,
    out: Float32Array,
    offset: number,
  ): void {
    const scene = this.scene;
    const positions = scene.positions;
    const normals = scene.normals;
    const lightmapUvs = scene.lightmapUvs;
    const base = triangle * 9;
    const p0x = positions[base]!, p0y = positions[base + 1]!, p0z = positions[base + 2]!;
    const e1x = positions[base + 3]! - p0x;
    const e1y = positions[base + 4]! - p0y;
    const e1z = positions[base + 5]! - p0z;
    const e2x = positions[base + 6]! - p0x;
    const e2y = positions[base + 7]! - p0y;
    const e2z = positions[base + 8]! - p0z;
    let gx = e1y * e2z - e1z * e2y;
    let gy = e1z * e2x - e1x * e2z;
    let gz = e1x * e2y - e1y * e2x;
    const gLength = Math.hypot(gx, gy, gz);
    if (!(gLength > 0)) {
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = 0;
      out[offset + 4] = 0;
      return;
    }
    gx /= gLength; gy /= gLength; gz /= gLength;
    const uvBase = triangle * 6;
    const l0x = lightmapUvs[uvBase]!, l0y = lightmapUvs[uvBase + 1]!;
    const l1x = lightmapUvs[uvBase + 2]!, l1y = lightmapUvs[uvBase + 3]!;
    const l2x = lightmapUvs[uvBase + 4]!, l2y = lightmapUvs[uvBase + 5]!;
    const uvArea = (l1x - l0x) * (l2y - l0y) - (l2x - l0x) * (l1y - l0y);
    const invUvArea = Math.abs(uvArea) > 1e-12 ? 1 / uvArea : 0;
    const epsilon = this.epsilon;
    const raycaster = this.raycaster;
    const samples = this.samples;
    const centerX = texelX + 0.5;
    const centerY = texelY + 0.5;

    // テクセルの中心。にじみ防止の基準点になる。
    const cw = 1 - baryU - baryV;
    const cpx = p0x + e1x * baryU + e2x * baryV;
    const cpy = p0y + e1y * baryU + e2y * baryV;
    const cpz = p0z + e1z * baryU + e2z * baryV;
    const cox = cpx + gx * epsilon;
    const coy = cpy + gy * epsilon;
    const coz = cpz + gz * epsilon;

    this.rngState = (Math.imul(texelY * 4099 + texelX + 1, 0x9e3779b1) ^ this.seed) | 0;
    const rot1 = this.random();
    const rot2 = this.random();
    const rot3 = this.random();
    const rot4 = this.random();

    let sumR = 0, sumG = 0, sumB = 0;
    let sumL = 0, sumL2 = 0;
    let backfaces = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      let u = baryU;
      let v = baryV;
      let w = cw;
      let ox = cox, oy = coy, oz = coz;
      if (samples > 1 && invUvArea !== 0) {
        // テクセルの中で位置をずらす。影の縁がテクセルの格子でギザギザにならない。
        let j1 = rot1 + sample * R4_A;
        let j2 = rot2 + sample * R4_B;
        j1 -= Math.floor(j1);
        j2 -= Math.floor(j2);
        const px = centerX + j1 - 0.5;
        const py = centerY + j2 - 0.5;
        let ju = ((px - l0x) * (l2y - l0y) - (l2x - l0x) * (py - l0y)) * invUvArea;
        let jv = ((l1x - l0x) * (py - l0y) - (px - l0x) * (l1y - l0y)) * invUvArea;
        if (ju < 0 || jv < 0 || ju + jv > 1) {
          const closest = closestPointOnTriangle(px, py, l0x, l0y, l1x, l1y, l2x, l2y);
          ju = closest.u;
          jv = closest.v;
        }
        const jx = p0x + e1x * ju + e2x * jv + gx * epsilon;
        const jy = p0y + e1y * ju + e2y * jv + gy * epsilon;
        const jz = p0z + e1z * ju + e2z * jv + gz * epsilon;
        // ずらした先が、壁の向こう側など中心から見えない場所なら使わない。
        // 壁の裏の光や影が、手前の床へにじむのを防ぐ。
        const sx = jx - cox;
        const sy = jy - coy;
        const sz = jz - coz;
        const span = Math.hypot(sx, sy, sz);
        if (
          span < epsilon * 4 ||
          !raycaster.occluded(cox, coy, coz, sx / span, sy / span, sz / span, 0, span)
        ) {
          u = ju;
          v = jv;
          w = 1 - ju - jv;
          ox = jx;
          oy = jy;
          oz = jz;
        }
      }
      let nx = normals[base]! * w + normals[base + 3]! * u + normals[base + 6]! * v;
      let ny = normals[base + 1]! * w + normals[base + 4]! * u + normals[base + 7]! * v;
      let nz = normals[base + 2]! * w + normals[base + 5]! * u + normals[base + 8]! * v;
      const nLength = Math.hypot(nx, ny, nz);
      if (nLength > 1e-8 && (nx * gx + ny * gy + nz * gz) / nLength > 0.05) {
        nx /= nLength; ny /= nLength; nz /= nLength;
      } else {
        nx = gx; ny = gy; nz = gz;
      }

      let r = 0, g = 0, b = 0;
      for (let index = 0; index < this.bakedLights.length; index += 1) {
        this.lightIrradiance(this.bakedLights[index]!, ox, oy, oz, nx, ny, nz);
        r += this.sr;
        g += this.sg;
        b += this.sb;
      }

      let u1 = rot3 + sample * R4_C;
      let u2 = rot4 + sample * R4_D;
      u1 -= Math.floor(u1);
      u2 -= Math.floor(u2);
      const direction = this.cosineDirection(nx, ny, nz, gx, gy, gz, u1, u2);
      this.tracePath(ox, oy, oz, direction[0], direction[1], direction[2]);
      if (this.pathBackface) backfaces += 1;
      // 余弦に比例して向きを選んだので、放射照度は 放射輝度の平均 × π。
      r += this.pr * Math.PI;
      g += this.pg * Math.PI;
      b += this.pb * Math.PI;

      sumR += r;
      sumG += g;
      sumB += b;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumL += luminance;
      sumL2 += luminance * luminance;
    }

    const inv = 1 / samples;
    const meanL = sumL * inv;
    out[offset] = sumR * inv;
    out[offset + 1] = sumG * inv;
    out[offset + 2] = sumB * inv;
    out[offset + 3] = backfaces * inv > BACKFACE_TOLERANCE ? 0 : 1;
    out[offset + 4] = Math.max(0, sumL2 * inv - meanL * meanL) * inv;
  }
}

function hemisphereWeight(
  hemisphere: BakeHemisphere,
  dx: number,
  dy: number,
  dz: number,
): number {
  // three.jsは面の法線nに対し mix(地面, 空, 0.5 * dot(n, 向き) + 0.5) を放射照度に
  // する。同じ結果になる環境の輝度分布は、係数0.5ではなく0.75の傾きを持つ。
  return (
    0.5 +
    0.75 *
      (dx * hemisphere.direction[0] + dy * hemisphere.direction[1] + dz * hemisphere.direction[2])
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * 光を遮る三角形だけを集めてBVHを作る。
 *
 * 半透明（blend）のMaterialと、全体が閾値未満の抜きMaterialは遮らない。
 * 面積のない三角形も入れない。
 */
export function buildBakeOccluders(scene: BakeScene): {
  bvh: TriangleBvh;
  occluders: Uint32Array;
} {
  const triangleCount = Math.floor(scene.positions.length / 9);
  const kept: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const material = scene.materials[scene.triangleMaterial[triangle]!];
    if (!material || material.alphaMode === "blend") continue;
    if (
      material.alphaMode === "mask" &&
      !material.albedoTexture &&
      material.opacity < material.alphaCutoff
    ) {
      continue;
    }
    kept.push(triangle);
  }
  const occluders = Uint32Array.from(kept);
  const positions = new Float32Array(occluders.length * 9);
  for (let index = 0; index < occluders.length; index += 1) {
    const source = occluders[index]! * 9;
    positions.set(scene.positions.subarray(source, source + 9), index * 9);
  }
  return { bvh: buildTriangleBvh(positions), occluders };
}
