import {
  GLSL3,
  LoadingManager,
  type Material,
  RawShaderMaterial,
  RepeatWrapping,
  TextureLoader,
  UniformsLib,
  UniformsUtils,
  type ShaderMaterialParameters,
  type Texture,
  type IUniform,
} from "three";
import { GLTFGoogleTiltBrushMaterialExtension } from "three-icosa/dist/three-icosa.module.js";

type OpenBrushMaterialParameters = ShaderMaterialParameters & {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
};

type InternalTiltShaderLoader = {
  manager: LoadingManager;
  path: string;
  withCredentials: boolean;
  loadedMaterials: Record<string, RawShaderMaterial>;
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
};

type OpenBrushMaterialReplacementExtension = {
  replaceMaterial: (
    mesh: OpenBrushTargetMesh,
    brushName: string,
  ) => Promise<void> | void;
};

type OpenBrushMaterialExtension = OpenBrushMaterialReplacementExtension & {
  tiltShaderLoader: InternalTiltShaderLoader;
};

export type OpenBrushPbrFallbackInfo = {
  renderer: "gltf-pbr";
  reason: "unsupported-preset" | "shader-load-error" | "attribute-mismatch";
  brushName: string;
  message: string;
};

const OPEN_BRUSH_PBR_FALLBACK_USER_DATA_KEY = "xriftOpenBrushPbrFallback";
const OPEN_BRUSH_STANDALONE_MATERIAL_CACHE = new Map<
  string,
  Promise<RawShaderMaterial>
>();
const OPEN_BRUSH_STANDALONE_LOADER_CACHE = new Map<
  string,
  InternalTiltShaderLoader
>();

/**
 * Creates one renderer adapter whose shader parameters and textures are owned
 * by that loader instance. three-icosa@0.4.2-alpha.18 mutates its module-level
 * brush presets while loading; without this adapter a second Model load treats
 * the previous GLSL and Texture objects as URLs.
 */
export function createOpenBrushPreviewExtension(
  parser: unknown,
  brushBaseUrl: string,
) {
  const extension = new GLTFGoogleTiltBrushMaterialExtension(
    parser,
    brushBaseUrl,
  );
  const internal = extension as unknown as {
    tiltShaderLoader: InternalTiltShaderLoader;
  } & OpenBrushMaterialExtension;
  installIsolatedLoader(internal.tiltShaderLoader);
  installOpenBrushPbrFallback(internal);
  return extension;
}

/** Loads one reusable brush preset without requiring its original glTF. */
export function loadOpenBrushPreviewMaterial(
  brushName: string,
  brushBaseUrl: string,
): Promise<RawShaderMaterial> {
  const key = `${brushBaseUrl}\n${brushName}`;
  const cached = OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.get(key);
  if (cached) return cached;
  const loader = getStandaloneOpenBrushLoader(brushBaseUrl);
  const promise = new Promise<RawShaderMaterial>((resolve, reject) => {
    loader.load(brushName, resolve, undefined, reject);
  }).catch((error: unknown) => {
    OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.delete(key);
    throw error;
  });
  OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.set(key, promise);
  return promise;
}

function getStandaloneOpenBrushLoader(
  brushBaseUrl: string,
): InternalTiltShaderLoader {
  const cached = OPEN_BRUSH_STANDALONE_LOADER_CACHE.get(brushBaseUrl);
  if (cached) return cached;
  const extension = createOpenBrushPreviewExtension(
    { options: { manager: new LoadingManager() } },
    brushBaseUrl,
  ) as unknown as OpenBrushMaterialExtension;
  OPEN_BRUSH_STANDALONE_LOADER_CACHE.set(
    brushBaseUrl,
    extension.tiltShaderLoader,
  );
  return extension.tiltShaderLoader;
}

/**
 * Keeps the glTF material created by GLTFLoader when a brush preset is unknown
 * or its custom shader resources cannot be reconstructed. One unsupported
 * brush therefore never prevents the rest of an imported OpenBrush GLB from
 * opening.
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

export function normalizeOpenBrushGlslSource(source: string): string {
  return source.replace(/^\s*#version\s+300\s+es\s*(?:\r?\n|$)/, "");
}

function installIsolatedLoader(loader: InternalTiltShaderLoader): void {
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

export function markOpenBrushPbrFallback(
  material: Material | Material[],
  fallback: OpenBrushPbrFallbackInfo,
): void {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    entry.userData[OPEN_BRUSH_PBR_FALLBACK_USER_DATA_KEY] = { ...fallback };
  });
}

async function loadIsolatedBrushMaterial(
  loader: InternalTiltShaderLoader,
  brushName: string,
): Promise<RawShaderMaterial> {
  const source = cloneMaterialParameters(loader.lookupMaterialParams(brushName));
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
    loadBrushTexture(textureLoader, source.uniforms.u_MainTex, brushName, "MainTex"),
    loadBrushTexture(textureLoader, source.uniforms.u_BumpMap, brushName, "BumpMap"),
    loadBrushTexture(textureLoader, source.uniforms.u_AlphaMask, brushName, "AlphaMask"),
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
    const requestPath = attempt === 0
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
