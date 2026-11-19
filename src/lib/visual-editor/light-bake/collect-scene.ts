import {
  FloatType,
  FrontSide,
  LinearSRGBColorSpace,
  Matrix3,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type Color,
  type Light,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  canXriftMaterialShowLightmap,
  collectXriftLightmapMeshes,
  XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY,
  xriftLightmapSourceGeometry,
} from "../../../../packages/xrift-studio-runtime/src/lightmap-apply";
import {
  XRIFT_LIGHT_BAKED_USER_DATA_KEY,
  XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
  type XriftLightRuntimeBridge,
} from "../../../../packages/xrift-studio-runtime/src/script/light";
import type { LightBakeInput, LightBakeMeshInput } from "./bake";
import {
  environmentMapDirection,
  type BakeEnvironment,
  type BakeEnvironmentMap,
  type BakeLight,
  type BakeMaterial,
  type BakeTexture,
  type BakeTextureTransform,
  type Vec3,
} from "./tracer";

/**
 * Scene Viewが今描いているシーンから、ライトベイクの入力を集める。
 *
 * 保存した文書から組み立て直さず、描画中のthree.jsのシーンをそのまま読む。
 * Modelの読み込み結果、割り当てたMaterial、親子の変換がすべて反映された
 * 「作者が見ているもの」を焼くためである。
 */

/** Meshコンポーネントごとの細かさの倍率を入れる userData の名前。 */
export const XRIFT_LIGHTMAP_SCALE_USER_DATA_KEY = "xriftLightmapScale";

export type CollectedLightBake = {
  input: LightBakeInput;
  /** ライトマップを受けるMeshを持つEntity。 */
  entityIds: string[];
  /** 直接光まで焼くLightコンポーネント。 */
  bakedLightComponentIds: string[];
  /** 作者へ伝える注意。 */
  warnings: string[];
};

type MaterialLike = Material & {
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  metalness?: number;
  map?: Texture | null;
  emissiveMap?: Texture | null;
};

const SURFACE_TEXTURE_SIZE = 64;
/** 葉や柵の抜きは、輪郭が影の形になる。色より細かく読む。 */
const CUTOUT_TEXTURE_SIZE = 256;
const ENVIRONMENT_FACE_SIZE = 16;
const ENVIRONMENT_CAPTURE_SIZE = 64;
/** 反射率の上限。1に近いと光が減らずに跳ね続ける。 */
const MAX_ALBEDO = 0.95;

function isVisibleInScene(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function nearestScale(object: Object3D): number {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY] === true) {
      const scale = current.userData[XRIFT_LIGHTMAP_SCALE_USER_DATA_KEY];
      return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
  }
  return 1;
}

/** TextureをGPUで小さく描いて読み戻す。圧縮Texture（KTX2）も同じ経路で読める。 */
class TextureReader {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new ShaderMaterial({
    uniforms: { map: { value: null as Texture | null } },
    vertexShader:
      "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }",
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new Mesh(new PlaneGeometry(2, 2), this.material);
  private readonly cache = new Map<string, BakeTexture | null>();

  constructor(private readonly renderer: WebGLRenderer) {
    this.scene.add(this.quad);
  }

  read(texture: Texture, maxSize: number): BakeTexture | undefined {
    const key = `${texture.uuid}:${maxSize}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached ?? undefined;
    let result: BakeTexture | null = null;
    try {
      const image = texture.image as { width?: number; height?: number } | undefined;
      const sourceWidth = Math.max(1, Math.floor(image?.width ?? maxSize));
      const sourceHeight = Math.max(1, Math.floor(image?.height ?? maxSize));
      const ratio = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * ratio));
      const height = Math.max(1, Math.round(sourceHeight * ratio));
      const target = new WebGLRenderTarget(width, height, {
        type: UnsignedByteType,
        format: RGBAFormat,
        depthBuffer: false,
        colorSpace: LinearSRGBColorSpace,
      });
      const renderer = this.renderer;
      const previous = renderer.getRenderTarget();
      const previousXr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      try {
        this.material.uniforms.map!.value = texture;
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        const data = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
        result = { width, height, data };
      } finally {
        renderer.setRenderTarget(previous);
        renderer.xr.enabled = previousXr;
        this.material.uniforms.map!.value = null;
        target.dispose();
      }
    } catch {
      result = null;
    }
    this.cache.set(key, result);
    return result ?? undefined;
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

function textureTransform(texture: Texture): BakeTextureTransform {
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  const m = texture.matrix.elements;
  return [m[0]!, m[1]!, m[3]!, m[4]!, m[6]!, m[7]!];
}

function convertMaterial(material: Material, reader: TextureReader): BakeMaterial {
  const source = material as MaterialLike;
  const color = source.color?.isColor ? source.color : undefined;
  const metalness =
    typeof source.metalness === "number" ? Math.min(Math.max(source.metalness, 0), 1) : 0;
  const diffuse = 1 - metalness;
  const albedo: Vec3 = color
    ? [
        Math.min(color.r * diffuse, MAX_ALBEDO),
        Math.min(color.g * diffuse, MAX_ALBEDO),
        Math.min(color.b * diffuse, MAX_ALBEDO),
      ]
    : [0.5, 0.5, 0.5];
  const emissiveColor = source.emissive?.isColor ? source.emissive : undefined;
  const emissiveIntensity =
    typeof source.emissiveIntensity === "number" ? source.emissiveIntensity : 1;
  const emissive: Vec3 = emissiveColor
    ? [
        emissiveColor.r * emissiveIntensity,
        emissiveColor.g * emissiveIntensity,
        emissiveColor.b * emissiveIntensity,
      ]
    : [0, 0, 0];
  const alphaTest = material.alphaTest > 0 ? material.alphaTest : 0;
  const cutout = alphaTest > 0 || material.alphaHash || material.alphaToCoverage;
  const result: BakeMaterial = {
    albedo,
    emissive,
    opacity: material.opacity,
    alphaMode: cutout ? "mask" : material.transparent ? "blend" : "opaque",
    alphaCutoff: alphaTest > 0 ? alphaTest : 0.5,
    doubleSided: material.side !== FrontSide,
  };
  // UV0以外で貼るTextureは、色の平均を取れないので単色として扱う。
  if (source.map && source.map.channel === 0) {
    const texture = reader.read(source.map, cutout ? CUTOUT_TEXTURE_SIZE : SURFACE_TEXTURE_SIZE);
    if (texture) {
      result.albedoTexture = texture;
      result.albedoTransform = textureTransform(source.map);
    }
  }
  if (source.emissiveMap && source.emissiveMap.channel === 0 && emissive.some((value) => value > 0)) {
    const texture = reader.read(source.emissiveMap, SURFACE_TEXTURE_SIZE);
    if (texture) {
      result.emissiveTexture = texture;
      result.emissiveTransform = textureTransform(source.emissiveMap);
    }
  }
  return result;
}

const scratch = new Vector3();
const normalMatrix = new Matrix3();

function collectMesh(
  mesh: Mesh,
  entityId: string,
  ordinal: number,
  materialIndex: (material: Material) => number,
): LightBakeMeshInput | null {
  const geometry = xriftLightmapSourceGeometry(mesh.geometry as BufferGeometry);
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return null;
  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld;
  normalMatrix.getNormalMatrix(matrix);
  const count = position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const normal = geometry.getAttribute("normal");
  for (let index = 0; index < count; index += 1) {
    scratch.fromBufferAttribute(position, index).applyMatrix4(matrix);
    positions[index * 3] = scratch.x;
    positions[index * 3 + 1] = scratch.y;
    positions[index * 3 + 2] = scratch.z;
    if (normal) {
      scratch.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix);
      const length = scratch.length();
      if (length > 0) scratch.multiplyScalar(1 / length);
      normals[index * 3] = scratch.x;
      normals[index * 3 + 1] = scratch.y;
      normals[index * 3 + 2] = scratch.z;
    }
  }
  const uv = geometry.getAttribute("uv");
  let uvs: Float32Array | null = null;
  if (uv) {
    uvs = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      uvs[index * 2] = uv.getX(index);
      uvs[index * 2 + 1] = uv.getY(index);
    }
  }
  const sourceIndex = geometry.getIndex();
  const cornerCount = sourceIndex ? sourceIndex.count : count;
  const usable = cornerCount - (cornerCount % 3);
  if (usable === 0) return null;
  const indices = new Uint32Array(usable);
  for (let corner = 0; corner < usable; corner += 1) {
    indices[corner] = sourceIndex ? sourceIndex.getX(corner) : corner;
  }

  const meshMaterial = mesh.material;
  let material: number | Uint16Array;
  let receives: boolean;
  if (Array.isArray(meshMaterial)) {
    const perTriangle = new Uint16Array(usable / 3);
    const fallback = meshMaterial[0] ? materialIndex(meshMaterial[0]) : 0;
    perTriangle.fill(fallback);
    for (const group of geometry.groups) {
      const assigned = meshMaterial[group.materialIndex ?? 0];
      if (!assigned) continue;
      const index = materialIndex(assigned);
      const first = Math.floor(group.start / 3);
      const last = Math.min(perTriangle.length, Math.ceil((group.start + group.count) / 3));
      for (let triangle = first; triangle < last; triangle += 1) perTriangle[triangle] = index;
    }
    material = perTriangle;
    receives = meshMaterial.some((entry) => canXriftMaterialShowLightmap(entry));
  } else {
    material = materialIndex(meshMaterial);
    receives = canXriftMaterialShowLightmap(meshMaterial);
  }

  return {
    entityId,
    mesh: ordinal,
    positions,
    normals,
    uvs,
    indices,
    sourceIndexCount: sourceIndex ? sourceIndex.count : 0,
    material,
    receives,
    scale: nearestScale(mesh),
    flipWinding: matrix.determinant() < 0,
  };
}

function lightBridge(light: Object3D): XriftLightRuntimeBridge | undefined {
  const bridge = light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY] as
    | XriftLightRuntimeBridge
    | undefined;
  return bridge && typeof bridge.read === "function" ? bridge : undefined;
}

type ThreeLight = Light & {
  isAmbientLight?: boolean;
  isDirectionalLight?: boolean;
  isHemisphereLight?: boolean;
  isPointLight?: boolean;
  isSpotLight?: boolean;
  isRectAreaLight?: boolean;
  target?: Object3D;
  groundColor?: Color;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  width?: number;
  height?: number;
};

function collectLights(
  scene: Object3D,
  bakedComponentIds: ReadonlySet<string>,
): { lights: BakeLight[]; environment: BakeEnvironment; bakedLightComponentIds: string[] } {
  const lights: BakeLight[] = [];
  const environment: BakeEnvironment = {
    ambientRealtime: [0, 0, 0],
    ambientBaked: [0, 0, 0],
    hemispheres: [],
  };
  const bakedLightComponentIds: string[] = [];
  const position = new Vector3();
  const targetPosition = new Vector3();
  scene.traverse((object) => {
    const light = object as ThreeLight;
    if (!light.isLight) return;
    const bridge = lightBridge(light);
    const state = bridge?.read();
    // 前回のベイクで消しているライトは、作者が有効にしていれば読む。
    const suppressed = light.userData[XRIFT_LIGHT_BAKED_USER_DATA_KEY] === true;
    if (suppressed ? state?.enabled !== true : !light.visible) return;
    if (light.parent && !isVisibleInScene(light.parent)) return;
    if (!(light.intensity > 0)) return;
    const baked = state !== undefined && bakedComponentIds.has(state.componentId);
    const color: Vec3 = [
      light.color.r * light.intensity,
      light.color.g * light.intensity,
      light.color.b * light.intensity,
    ];
    light.updateWorldMatrix(true, false);
    position.setFromMatrixPosition(light.matrixWorld);
    let included = true;
    if (light.isAmbientLight) {
      const target = baked ? environment.ambientBaked : environment.ambientRealtime;
      target[0] += color[0];
      target[1] += color[1];
      target[2] += color[2];
    } else if (light.isHemisphereLight) {
      const ground = light.groundColor;
      const direction = position.clone();
      if (direction.lengthSq() > 0) direction.normalize();
      environment.hemispheres.push({
        baked,
        sky: color,
        ground: ground
          ? [ground.r * light.intensity, ground.g * light.intensity, ground.b * light.intensity]
          : [0, 0, 0],
        direction: [direction.x, direction.y, direction.z],
      });
    } else if (light.isDirectionalLight && light.target) {
      light.target.updateWorldMatrix(true, false);
      targetPosition.setFromMatrixPosition(light.target.matrixWorld);
      const direction = position.clone().sub(targetPosition);
      if (direction.lengthSq() === 0) return;
      direction.normalize();
      lights.push({ type: "directional", baked, color, direction: [direction.x, direction.y, direction.z] });
    } else if (light.isSpotLight && light.target) {
      light.target.updateWorldMatrix(true, false);
      targetPosition.setFromMatrixPosition(light.target.matrixWorld);
      const direction = position.clone().sub(targetPosition);
      if (direction.lengthSq() === 0) return;
      direction.normalize();
      const angle = light.angle ?? Math.PI / 3;
      lights.push({
        type: "spot",
        baked,
        color,
        position: [position.x, position.y, position.z],
        direction: [direction.x, direction.y, direction.z],
        distance: light.distance ?? 0,
        decay: light.decay ?? 2,
        coneCos: Math.cos(angle),
        penumbraCos: Math.cos(angle * (1 - (light.penumbra ?? 0))),
      });
    } else if (light.isPointLight) {
      lights.push({
        type: "point",
        baked,
        color,
        position: [position.x, position.y, position.z],
        distance: light.distance ?? 0,
        decay: light.decay ?? 2,
      });
    } else if (light.isRectAreaLight) {
      const elements = light.matrixWorld.elements;
      const halfWidth = (light.width ?? 1) / 2;
      const halfHeight = (light.height ?? 1) / 2;
      const axisX = new Vector3(elements[0], elements[1], elements[2]);
      const axisY = new Vector3(elements[4], elements[5], elements[6]);
      const axisZ = new Vector3(elements[8], elements[9], elements[10]).normalize();
      lights.push({
        type: "rect",
        baked,
        color,
        position: [position.x, position.y, position.z],
        halfU: [axisX.x * halfWidth, axisX.y * halfWidth, axisX.z * halfWidth],
        halfV: [axisY.x * halfHeight, axisY.y * halfHeight, axisY.z * halfHeight],
        // 面光源はローカルの-Zへ向けて光る。
        normal: [-axisZ.x, -axisZ.y, -axisZ.z],
      });
    } else {
      included = false;
    }
    if (included && baked && state) bakedLightComponentIds.push(state.componentId);
  });
  return { lights, environment, bakedLightComponentIds };
}

/**
 * SkyboxのIBLを、6方向へ描いて読み戻す。
 *
 * three.jsが背景として描く経路をそのまま使うので、回転や強さの解釈がSceneの
 * 描画と一致する。
 */
function captureEnvironmentMap(
  renderer: WebGLRenderer,
  scene: Scene,
): BakeEnvironmentMap | undefined {
  const environment = scene.environment;
  if (!environment || !(scene.environmentIntensity > 0)) return undefined;
  const capture = new Scene();
  capture.background = environment;
  capture.backgroundIntensity = scene.environmentIntensity;
  capture.backgroundRotation.copy(scene.environmentRotation);
  const size = ENVIRONMENT_CAPTURE_SIZE;
  const target = new WebGLRenderTarget(size, size, {
    type: FloatType,
    format: RGBAFormat,
    depthBuffer: false,
    colorSpace: LinearSRGBColorSpace,
  });
  const camera = new PerspectiveCamera(90, 1, 0.1, 10);
  const views: { forward: Vector3; up: Vector3; right: Vector3; pixels: Float32Array }[] = [];
  const axes: [Vector3, Vector3][] = [
    [new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
    [new Vector3(-1, 0, 0), new Vector3(0, 1, 0)],
    [new Vector3(0, 1, 0), new Vector3(0, 0, -1)],
    [new Vector3(0, -1, 0), new Vector3(0, 0, 1)],
    [new Vector3(0, 0, 1), new Vector3(0, 1, 0)],
    [new Vector3(0, 0, -1), new Vector3(0, 1, 0)],
  ];
  const previous = renderer.getRenderTarget();
  const previousXr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  try {
    for (const [forward, up] of axes) {
      camera.position.set(0, 0, 0);
      camera.up.copy(up);
      camera.lookAt(forward);
      camera.updateMatrixWorld(true);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(capture, camera);
      const pixels = new Float32Array(size * size * 4);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const elements = camera.matrixWorld.elements;
      views.push({
        forward: forward.clone(),
        right: new Vector3(elements[0], elements[1], elements[2]),
        up: new Vector3(elements[4], elements[5], elements[6]),
        pixels,
      });
    }
  } finally {
    renderer.setRenderTarget(previous);
    renderer.xr.enabled = previousXr;
    target.dispose();
  }

  // 細かく描いたものを、粗い面へ平均して詰める。太陽のような小さく強い光が
  // 1点に集まらず、レイの当たり外れによるざらつきが減る。
  const faceSize = ENVIRONMENT_FACE_SIZE;
  const faces = new Float32Array(6 * faceSize * faceSize * 3);
  const subSamples = 4;
  for (let face = 0; face < 6; face += 1) {
    for (let y = 0; y < faceSize; y += 1) {
      for (let x = 0; x < faceSize; x += 1) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < subSamples; sy += 1) {
          for (let sx = 0; sx < subSamples; sx += 1) {
            const direction = environmentMapDirection(
              faceSize * subSamples,
              face,
              x * subSamples + sx,
              y * subSamples + sy,
            );
            let best = views[0]!;
            let bestDot = -Infinity;
            for (const view of views) {
              const dot =
                direction[0] * view.forward.x +
                direction[1] * view.forward.y +
                direction[2] * view.forward.z;
              if (dot > bestDot) {
                bestDot = dot;
                best = view;
              }
            }
            const u =
              (direction[0] * best.right.x + direction[1] * best.right.y + direction[2] * best.right.z) /
              bestDot;
            const v =
              (direction[0] * best.up.x + direction[1] * best.up.y + direction[2] * best.up.z) /
              bestDot;
            const px = Math.min(size - 1, Math.max(0, Math.floor((u * 0.5 + 0.5) * size)));
            const py = Math.min(size - 1, Math.max(0, Math.floor((v * 0.5 + 0.5) * size)));
            const index = (py * size + px) * 4;
            r += best.pixels[index]!;
            g += best.pixels[index + 1]!;
            b += best.pixels[index + 2]!;
          }
        }
        const scale = 1 / (subSamples * subSamples);
        const out = ((face * faceSize + y) * faceSize + x) * 3;
        faces[out] = Number.isFinite(r) ? r * scale : 0;
        faces[out + 1] = Number.isFinite(g) ? g * scale : 0;
        faces[out + 2] = Number.isFinite(b) ? b * scale : 0;
      }
    }
  }
  return { size: faceSize, faces };
}

export function collectLightBakeInput(options: {
  /** Scene Viewのthree.jsのシーン。 */
  scene: Scene;
  renderer: WebGLRenderer;
  /** Entityのidを持つ userData の名前。 */
  entityKey: string;
  /** 「ベイク」にしたLightコンポーネント。 */
  bakedLightComponentIds: ReadonlySet<string>;
}): CollectedLightBake {
  const { scene, renderer, entityKey } = options;
  const warnings: string[] = [];
  const reader = new TextureReader(renderer);
  const materials: BakeMaterial[] = [];
  const materialIndices = new Map<Material, number>();
  const materialIndex = (material: Material): number => {
    let index = materialIndices.get(material);
    if (index === undefined) {
      index = materials.length;
      materials.push(convertMaterial(material, reader));
      materialIndices.set(material, index);
    }
    return index;
  };

  const meshes: LightBakeMeshInput[] = [];
  const entityIds = new Set<string>();
  try {
    scene.updateMatrixWorld(true);
    for (const entry of collectXriftLightmapMeshes(scene, entityKey)) {
      if (!isVisibleInScene(entry.object)) continue;
      const mesh = collectMesh(entry.object, entry.entityId, entry.mesh, materialIndex);
      if (!mesh) continue;
      meshes.push(mesh);
      if (mesh.receives) entityIds.add(entry.entityId);
    }
  } finally {
    reader.dispose();
  }

  const collected = collectLights(scene, options.bakedLightComponentIds);
  try {
    const map = captureEnvironmentMap(renderer, scene);
    if (map) collected.environment.map = map;
  } catch {
    warnings.push(
      "SkyboxのIBLを読み取れなかったため、ベイクに含めていません。IBLの光は遮られずに届きます。",
    );
  }

  return {
    input: {
      meshes,
      materials,
      lights: collected.lights,
      environment: collected.environment,
    },
    entityIds: [...entityIds].sort(),
    bakedLightComponentIds: [...new Set(collected.bakedLightComponentIds)].sort(),
    warnings,
  };
}
