import {
  BufferAttribute,
  GLSL3,
  type Material,
  RawShaderMaterial,
  RepeatWrapping,
  TextureLoader,
  UniformsLib,
  UniformsUtils,
  type ShaderMaterialParameters,
  type Texture,
  type IUniform,
  type LoadingManager,
  type BufferGeometry,
} from "three";
import type { GLTF, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
// three-icosa publishes no TypeScript declarations. Studio supplies its own
// ambient declaration, a published world does not, so this file has to compile
// in both places — `@ts-ignore` rather than `@ts-expect-error`, which would
// itself become an error wherever the declaration is present.
// @ts-ignore
import { GLTFGoogleTiltBrushMaterialExtension } from "three-icosa/dist/three-icosa.module.js";

/**
 * Open Brush brush presets, loaded the way both the Studio viewport and a
 * published world need them.
 *
 * `three-icosa@0.4.2-alpha.18` needs these compatibility fixes:
 *
 * 1. It mutates its module-level brush presets while loading, so the second
 *    brush in a scene reads the first brush's already-resolved GLSL and Texture
 *    objects as if they were URLs.
 * 2. Its brush GLSL starts with `#version 300 es` while the material it builds
 *    leaves `glslVersion` unset, so three prepends its own prefix ahead of the
 *    `#version` directive and the shader fails to compile.
 * 3. Its parser hooks assume every glTF has a materials array and names,
 *    although glTF allows both to be omitted.
 *
 * They are fixed here, once, so the published world renders what the editor
 * previewed instead of falling back to a broken shader.
 */

type OpenBrushMaterialParameters = ShaderMaterialParameters & {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
};

export type InternalTiltShaderLoader = {
  manager: LoadingManager;
  path: string;
  withCredentials: boolean;
  loadedMaterials: Record<string, RawShaderMaterial>;
  lookupMaterialName: (brushName: string) => string;
  lookupMaterialParams: (brushName: string) => unknown;
  load: (
    brushName: string,
    onLoad: (material: RawShaderMaterial) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) => void;
};

type OpenBrushTargetMesh = {
  material: Material | Material[];
  geometry?: BufferGeometry;
};

type OpenBrushMaterialReplacementExtension = {
  replaceMaterial: (
    mesh: OpenBrushTargetMesh,
    brushName: string,
  ) => Promise<void> | void;
};

export type OpenBrushMaterialExtension =
  OpenBrushMaterialReplacementExtension & {
    tiltShaderLoader: InternalTiltShaderLoader;
  };

export type OpenBrushPbrFallbackInfo = {
  renderer: "gltf-pbr";
  reason: "unsupported-preset" | "shader-load-error" | "attribute-mismatch";
  brushName: string;
  message: string;
};

const OPEN_BRUSH_PBR_FALLBACK_USER_DATA_KEY = "xriftOpenBrushPbrFallback";

/**
 * Creates one renderer adapter whose shader parameters and textures are owned
 * by that loader instance, so loading a second brush never corrupts the first.
 */
export function createOpenBrushMaterialExtension(
  parser: unknown,
  brushBaseUrl: string,
) {
  const extension = new GLTFGoogleTiltBrushMaterialExtension(
    parser,
    brushBaseUrl,
  );
  const internal = extension as unknown as OpenBrushMaterialExtension;
  installIsolatedLoader(internal.tiltShaderLoader);
  installOpenBrushGeometryCompatibility(internal);
  installOpenBrushPbrFallback(internal);
  installOpenBrushDocumentGuard(extension, parser);
  return extension;
}

/** glTF permits both the materials array and material names to be omitted. */
function installOpenBrushDocumentGuard(
  extension: {
    beforeRoot: () => unknown;
    afterRoot: (gltf: GLTF) => unknown;
  },
  parser: unknown,
): void {
  const internal = extension as unknown as OpenBrushMaterialExtension;
  const gltfParser = parser as GLTFParser;
  const brushMaterials = () => {
    const json = (parser as { json?: Record<string, unknown> } | undefined)?.json;
    if (!json || !Array.isArray(json.materials)) return undefined;
    const materials = json.materials as Array<{
      name?: string;
      extensions?: Record<string, unknown>;
    }>;
    const extensionNames = ["GOOGLE_tilt_brush_material", "GOOGLE_tilt_brush_techniques"];
    const hasBrushExtension = (value: unknown) =>
      value !== null && typeof value === "object" &&
      extensionNames.some((name) => name in value);
    const generator = (json.asset as { generator?: unknown } | undefined)?.generator;
    const isBrushDocument =
      [json.extensionsUsed, json.extensionsRequired].some((names) =>
        Array.isArray(names) && extensionNames.some((name) => names.includes(name)),
      ) || hasBrushExtension(json.extensions) ||
      (typeof generator === "string" && /(?:open|tilt)\s*brush/i.test(generator)) ||
      materials.some((material) =>
        hasBrushExtension(material.extensions) || /^ob-/i.test(material.name ?? ""),
      );
    return isBrushDocument ? materials : undefined;
  };
  extension.beforeRoot = () => {
    const materials = brushMaterials();
    if (!materials) return;
    // Only the in-memory parser document is normalized. The original GLB and
    // its optional names stay untouched, and extension GUIDs still select brushes.
    materials.forEach((material) => { material.name ??= ""; });
    // Embedded images already contain the author's pixels. The stock hook
    // overwrites them and treats a texture index as an image index. Resolve
    // legacy external URLs through textures[].source instead.
    const json = gltfParser.json;
    for (const material of materials) {
      const name = internal.tiltShaderLoader.lookupMaterialName(resolveOpenBrushMaterialName(material));
      const params = internal.tiltShaderLoader.lookupMaterialParams(name) as
        OpenBrushMaterialParameters | undefined;
      if (!params) continue;
      const definition = material as typeof material & {
        pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
        normalTexture?: { index: number };
      };
      for (const [texture, uniform] of [
        [definition.pbrMetallicRoughness?.baseColorTexture, params.uniforms.u_MainTex],
        [definition.normalTexture, params.uniforms.u_BumpMap],
      ] as const) {
        if (!texture || typeof uniform?.value !== "string") continue;
        const image = json.images?.[json.textures?.[texture.index]?.source];
        if (image?.bufferView === undefined && typeof image?.uri === "string" &&
          /^https?:\/\//i.test(image.uri)) {
          image.uri = new URL(uniform.value, internal.tiltShaderLoader.path).href;
        }
      }
    }
  };
  extension.afterRoot = (gltf) => {
    const materials = brushMaterials();
    if (!materials) return;
    const pending: Promise<void>[] = [];
    const visited = new Set<object>();
    for (const scene of gltf.scenes) scene.traverse((object) => {
      if (!(object as { isMesh?: boolean }).isMesh || visited.has(object)) return;
      visited.add(object);
      const association = gltfParser.associations.get(object) as
        { meshes?: number; primitives?: number } | undefined;
      if (association?.meshes === undefined) return;
      const primitive = gltfParser.json.meshes[association.meshes].primitives[
        association.primitives ?? 0
      ];
      const material = materials[primitive?.material];
      if (!material) return;
      const brushName = resolveOpenBrushMaterialName(material);
      if (brushName) pending.push(Promise.resolve(internal.replaceMaterial(
        object as unknown as OpenBrushTargetMesh, brushName,
      )));
    });
    return Promise.all(pending);
  };
}

function resolveOpenBrushMaterialName(
  material: { name?: string; extensions?: Record<string, unknown> },
): string {
  for (const name of ["GOOGLE_tilt_brush_material", "GOOGLE_tilt_brush_techniques"]) {
    const definition = material.extensions?.[name] as { guid?: unknown } | undefined;
    if (typeof definition?.guid === "string" && definition.guid) return definition.guid;
  }
  const name = (material.name ?? "").trim()
    .replace(/^(?:ob-|brush_|material_)/i, "")
    .replace(/\s*\(Instance\)$/i, "").trim();
  for (const block of ["BlocksPaper", "BlocksGlass", "BlocksGem"]) {
    if (name.includes(`_${block} `)) return block;
  }
  // Only documents already identified as Open Brush reach this resolver.
  // Unknown brush names retain the existing diagnostic PBR fallback.
  return name;
}

/** Keep the library's brush-specific setup without its unbound THREE global. */
function installOpenBrushGeometryCompatibility(extension: OpenBrushMaterialExtension): void {
  const replaceMaterial = extension.replaceMaterial.bind(extension);
  extension.replaceMaterial = async (mesh, brushName) => {
    const geometry = mesh.geometry;
    if (!geometry) return replaceMaterial(mesh, brushName);
    const color = geometry.getAttribute("color");
    let pending: Promise<void> | void;
    try {
      if (color?.array instanceof Float32Array) {
        const bytes = new Uint8Array(color.count * color.itemSize);
        for (let i = 0; i < color.count; i += 1) {
          const values = [color.getX(i), color.getY(i), color.getZ(i), color.getW(i)];
          for (let channel = 0; channel < color.itemSize; channel += 1) {
            const linear = values[channel] ?? 0;
            const value = channel === 3 ? linear : linear <= 0.0031308
              ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
            bytes[i * color.itemSize + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
          }
        }
        // The vendor copies color synchronously, before its first shader await.
        // A byte attribute bypasses its `new THREE.BufferAttribute` branch.
        // Restore the linear glTF attribute immediately for standard materials.
        geometry.setAttribute("color", new BufferAttribute(bytes, color.itemSize, true));
      }
      pending = replaceMaterial(mesh, brushName);
    } finally {
      if (color) geometry.setAttribute("color", color);
    }
    await pending;
    for (const [target, candidates] of [
      ["a_texcoord0", ["_tb_unity_texcoord_0", "texcoord_0", "uv"]],
      ["a_texcoord1", ["_tb_unity_texcoord_1", "texcoord_1", "uv1", "uv2"]],
    ] as const) {
      const source = candidates.map((name) => geometry.getAttribute(name)).find(Boolean);
      if (source) geometry.setAttribute(target, source);
    }
  };
}

/**
 * Keeps the glTF material created by GLTFLoader when a brush preset is unknown
 * or its custom shader resources cannot be reconstructed. One unsupported
 * brush therefore never prevents the rest of an Open Brush GLB from rendering.
 */
export function installOpenBrushPbrFallback(
  extension: OpenBrushMaterialReplacementExtension,
): void {
  const replaceMaterial = extension.replaceMaterial.bind(extension);
  extension.replaceMaterial = async (mesh, brushName) => {
    const pbrMaterial = mesh.material;
    try {
      await replaceMaterial(mesh, brushName);
      if (mesh.material === pbrMaterial) {
        markOpenBrushPbrFallback(pbrMaterial, {
          renderer: "gltf-pbr",
          reason: "unsupported-preset",
          brushName,
          message: `three-icosa preset was not found for ${brushName}`,
        });
      }
    } catch (error) {
      mesh.material = pbrMaterial;
      markOpenBrushPbrFallback(pbrMaterial, {
        renderer: "gltf-pbr",
        reason: "shader-load-error",
        brushName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function readOpenBrushPbrFallback(
  material: Material,
): OpenBrushPbrFallbackInfo | undefined {
  const value = material.userData[OPEN_BRUSH_PBR_FALLBACK_USER_DATA_KEY];
  if (!value || typeof value !== "object") return undefined;
  const fallback = value as Partial<OpenBrushPbrFallbackInfo>;
  if (
    fallback.renderer !== "gltf-pbr" ||
    (fallback.reason !== "unsupported-preset" &&
      fallback.reason !== "shader-load-error" &&
      fallback.reason !== "attribute-mismatch") ||
    typeof fallback.brushName !== "string" ||
    typeof fallback.message !== "string"
  ) {
    return undefined;
  }
  return fallback as OpenBrushPbrFallbackInfo;
}

export function markOpenBrushPbrFallback(
  material: Material | Material[],
  fallback: OpenBrushPbrFallbackInfo,
): void {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    entry.userData[OPEN_BRUSH_PBR_FALLBACK_USER_DATA_KEY] = { ...fallback };
  });
}

/**
 * three prepends its own prefix to a RawShaderMaterial's source, so a leading
 * `#version` directive has to be removed and declared through `glslVersion`
 * instead. Left in place, the directive stops being the first line and the
 * shader fails to compile.
 */
export function normalizeOpenBrushGlslSource(source: string): string {
  return source.replace(/^\s*#version\s+300\s+es\s*(?:\r?\n|$)/, "");
}

export function installIsolatedLoader(loader: InternalTiltShaderLoader): void {
  const schedule = createOpenBrushLoadScheduler(2);
  const pendingMaterials = new Map<string, Promise<RawShaderMaterial>>();
  loader.load = (brushName, onLoad, _onProgress, onError) => {
    const cached = loader.loadedMaterials[brushName];
    if (cached) {
      onLoad(cached);
      return;
    }
    const pending =
      pendingMaterials.get(brushName) ??
      schedule(() => loadIsolatedBrushMaterial(loader, brushName));
    pendingMaterials.set(brushName, pending);
    void pending
      .then(onLoad)
      .catch((error: unknown) => onError?.(error))
      .finally(() => {
        if (pendingMaterials.get(brushName) === pending) {
          pendingMaterials.delete(brushName);
        }
      });
  };
}

function createOpenBrushLoadScheduler(limit: number) {
  let active = 0;
  const pending: Array<() => void> = [];
  const runNext = () => {
    while (active < limit && pending.length > 0) {
      active += 1;
      pending.shift()?.();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending.push(() => {
        void task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            runNext();
          });
      });
      runNext();
    });
}

async function loadIsolatedBrushMaterial(
  loader: InternalTiltShaderLoader,
  brushName: string,
): Promise<RawShaderMaterial> {
  const source = cloneMaterialParameters(
    loader.lookupMaterialParams(brushName),
  );
  if (!source) {
    throw new Error(`OpenBrush preset was not found: ${brushName}`);
  }

  const textureLoader = new TextureLoader(loader.manager);
  textureLoader.setPath(loader.path);
  textureLoader.setWithCredentials(loader.withCredentials);

  const vertexShaderPath = source.vertexShader;
  const fragmentShaderPath = source.fragmentShader;
  const texturePaths = brushTexturePaths(source.uniforms);
  const [vertexShader, fragmentShader] = await Promise.all([
    loadShaderSource(loader.path, brushName, "vertex", vertexShaderPath),
    loadShaderSource(loader.path, brushName, "fragment", fragmentShaderPath),
  ]);
  source.vertexShader = normalizeOpenBrushGlslSource(String(vertexShader));
  source.fragmentShader = normalizeOpenBrushGlslSource(String(fragmentShader));
  source.glslVersion = GLSL3;

  await Promise.all([
    loadBrushTexture(
      textureLoader,
      source.uniforms.u_MainTex,
      brushName,
      "MainTex",
    ),
    loadBrushTexture(
      textureLoader,
      source.uniforms.u_BumpMap,
      brushName,
      "BumpMap",
    ),
    loadBrushTexture(
      textureLoader,
      source.uniforms.u_AlphaMask,
      brushName,
      "AlphaMask",
    ),
  ]);
  source.uniforms = UniformsUtils.merge([
    UniformsLib.lights,
    UniformsLib.fog,
    source.uniforms,
  ]);

  const material = new RawShaderMaterial(source);
  material.userData.xriftOpenBrushResourcePaths = [
    vertexShaderPath,
    fragmentShaderPath,
    ...texturePaths,
  ];
  loader.loadedMaterials[brushName] = material;
  return material;
}

async function loadShaderSource(
  brushBaseUrl: string,
  brushName: string,
  stage: "vertex" | "fragment",
  relativePath: string,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestPath =
      attempt === 0
        ? relativePath
        : `${relativePath}?xrift-openbrush-retry=${attempt}`;
    const resourceUrl = new URL(requestPath, brushBaseUrl).href;
    const response = await fetch(resourceUrl, { cache: "no-store" });
    if (!response.ok) continue;
    const result = await response.text();
    if (!/^\s*(?:<!doctype|<html)/i.test(result)) return result;
  }
  throw new Error(
    `${brushName} ${stage} shader resource could not be resolved: ${new URL(relativePath, brushBaseUrl).href}`,
  );
}

function cloneMaterialParameters(
  value: unknown,
): OpenBrushMaterialParameters | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<OpenBrushMaterialParameters>;
  if (
    typeof source.vertexShader !== "string" ||
    typeof source.fragmentShader !== "string" ||
    !source.uniforms ||
    typeof source.uniforms !== "object"
  ) {
    return undefined;
  }
  return {
    ...(source as OpenBrushMaterialParameters),
    ...(source.defines ? { defines: { ...source.defines } } : {}),
    uniforms: UniformsUtils.clone(source.uniforms),
  };
}

async function loadBrushTexture(
  loader: TextureLoader,
  uniform: IUniform | undefined,
  brushName: string,
  textureName: string,
): Promise<void> {
  if (!uniform || typeof uniform.value !== "string" || !uniform.value) return;
  const relativePath = uniform.value;
  const texture = await loader.loadAsync(relativePath);
  configureBrushTexture(texture, `${brushName}_${textureName}`);
  uniform.value = texture;
}

function configureBrushTexture(texture: Texture, name: string): void {
  texture.name = name;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
}

function brushTexturePaths(uniforms: Record<string, IUniform>): string[] {
  return ["u_MainTex", "u_BumpMap", "u_AlphaMask"].flatMap((name) => {
    const value = uniforms[name]?.value;
    if (typeof value === "string" && value) return [value];
    return value && typeof value === "object" && "name" in value
      ? [String((value as { name?: unknown }).name ?? name)]
      : [];
  });
}
