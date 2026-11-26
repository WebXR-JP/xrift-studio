import {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  Color,
  CubeTexture,
  Data3DTexture,
  DoubleSide,
  FloatType,
  FrontSide,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Matrix4,
  MultiplyBlending,
  NearestFilter,
  NearestMipmapLinearFilter,
  NoColorSpace,
  NormalBlending,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SubtractiveBlending,
  UVMapping,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import {
  CLASSIC_SHADER_LIMITS,
  resolveClassicShaderTimeUniforms,
  resolveClassicShaderVariant,
  resolveClassicShaderVolumeLayout,
  type ClassicShaderVolumeLayoutError,
  type XriftClassicShader,
  type XriftClassicShaderUniform,
  type XriftClassicShaderWrap,
} from "./classic-shader-contract.js";

/**
 * Builds the three.js ShaderMaterial for a Classic R3F Custom Shader.
 *
 * The editor's Scene View, Play, the Material previews, the generated world and
 * the Runtime JSON loader all call `createClassicShaderMaterial`. A sampler
 * option, a blend mode or a uniform kind therefore means one thing everywhere,
 * and a difference between what an author sees and what is published can only
 * come from the inputs, never from a second implementation.
 */

/**
 * One loaded texture per Texture Asset id.
 *
 * The caller loads each Asset once and keeps ownership. This module never
 * changes or disposes an entry: every uniform gets its own clone, which shares
 * the decoded picture and carries that uniform's sampler state.
 */
export type ClassicShaderTextureLookup =
  | ReadonlyMap<string, Texture>
  | Readonly<Record<string, Texture | null | undefined>>;

export type ClassicShaderDiagnostic = {
  code:
    | "texture-not-loaded"
    | "texture-unsupported"
    | "texture-3d-layout"
    | "texture-cube-layout";
  uniformName: string;
  assetId?: string;
  message: string;
};

export type ClassicShaderImagePixels = {
  data: ArrayLike<number>;
  width: number;
  height: number;
};

/** Reads 8-bit RGBA rows, top row first, from a decoded picture. */
export type ClassicShaderImageReader = (
  image: unknown,
) => ClassicShaderImagePixels | null;

export type ClassicShaderMaterialOptions = {
  /** Object3D.name of the mesh that will wear the Material; picks the variant. */
  meshName?: string;
  textures?: ClassicShaderTextureLookup;
  /** A uniform that could not be built is reported here and bound to null. */
  onDiagnostic?: (diagnostic: ClassicShaderDiagnostic) => void;
  /** Replaces the canvas read of a strip image, for hosts without a DOM. */
  readImagePixels?: ClassicShaderImageReader;
};

const CLASSIC_SHADER_BLENDING = {
  normal: NormalBlending,
  additive: AdditiveBlending,
  multiply: MultiplyBlending,
  subtractive: SubtractiveBlending,
} as const;

const TIME_UNIFORMS_USER_DATA_KEY = "xriftTimeUniforms";
const FRUSTUM_CULLING_USER_DATA_KEY = "xriftClassicShaderFrustumCulled";

export function createClassicShaderMaterial(
  shader: XriftClassicShader,
  options: ClassicShaderMaterialOptions = {},
): ShaderMaterial {
  const variant = resolveClassicShaderVariant(shader, options.meshName);
  const ownedTextures: Texture[] = [];
  const authoredUniforms: Record<string, { value: unknown }> = {};
  for (const [name, uniform] of Object.entries(shader.uniforms)) {
    authoredUniforms[name] = {
      value: createUniformValue(name, uniform, options, ownedTextures),
    };
  }
  // Scene Settings fog has to reach an authored shader. ShaderMaterial.fog is
  // false by default, and then three.js neither defines USE_FOG nor supplies
  // fogColor / fogNear / fogFar, so a `#include <fog_fragment>` does nothing.
  // UniformsUtils.merge would clone the textures too, so only the fog uniforms
  // are cloned; the authored ones come last and win a name clash.
  const uniforms = {
    ...UniformsUtils.clone(UniformsLib.fog),
    ...authoredUniforms,
  };
  const blending = variant?.blending ?? "normal";
  const material = new ShaderMaterial({
    name: `${shader.sourceModulePath}:${variant?.name ?? ""}`,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    defines: { ...(variant?.defines ?? {}) },
    side:
      variant?.side === "back"
        ? BackSide
        : variant?.side === "double"
          ? DoubleSide
          : FrontSide,
    transparent: variant?.transparent ?? false,
    depthWrite: variant?.depthWrite ?? true,
    blending: CLASSIC_SHADER_BLENDING[blending] ?? NormalBlending,
    // three.js draws multiply and subtractive only with premultiplied colour:
    // without it the renderer reports an error and leaves the previous blend
    // function in place. The two modes read the colour as it is written, so
    // nothing else about the shader changes.
    premultipliedAlpha: blending === "multiply" || blending === "subtractive",
    // A shader that includes no fog chunk ignores USE_FOG, so this is safe.
    fog: true,
  });
  const timeUniforms = resolveClassicShaderTimeUniforms(shader);
  if (timeUniforms.length > 0) {
    material.userData[TIME_UNIFORMS_USER_DATA_KEY] = timeUniforms;
  }
  if (variant?.frustumCulled === false) {
    material.userData[FRUSTUM_CULLING_USER_DATA_KEY] = false;
  }
  if (ownedTextures.length > 0) {
    // The clones belong to this Material, so they go when it goes. Listening
    // for the event keeps every existing `material.dispose()` call correct. A
    // disposed Material can be drawn again, which uploads its textures again,
    // so the list is kept for the next dispose.
    material.addEventListener("dispose", () => {
      for (const texture of ownedTextures) texture.dispose();
    });
  }
  material.needsUpdate = true;
  return material;
}

/** Draws a shader on a sky mesh: seen from inside, behind everything else. */
export function configureClassicShaderSkyMaterial<T extends Material>(
  material: T,
): T {
  material.side = BackSide;
  material.depthTest = false;
  material.depthWrite = false;
  material.needsUpdate = true;
  return material;
}

/** True when the variant this Material was built from opts out of culling. */
export function classicShaderDisablesFrustumCulling(
  material: Material | null | undefined,
): boolean {
  return material?.userData?.[FRUSTUM_CULLING_USER_DATA_KEY] === false;
}

type FrustumCullingHold = { original: boolean; holders: Set<object> };
const FRUSTUM_CULLING_HOLDS = new WeakMap<Object3D, FrustumCullingHold>();
const NOTHING_TO_UNDO = (): void => {};

/**
 * Applies what a Material asks of the mesh wearing it, and returns the undo.
 *
 * Frustum culling belongs to the mesh, not to the Material, so it is switched
 * off while a Material that asks for it is worn and put back when the last
 * such Material is taken off. A mesh with several slots keeps one count.
 */
export function applyClassicShaderMeshState(
  mesh: Object3D,
  material: Material | null | undefined,
): () => void {
  if (!material || !classicShaderDisablesFrustumCulling(material)) {
    return NOTHING_TO_UNDO;
  }
  let hold = FRUSTUM_CULLING_HOLDS.get(mesh);
  if (!hold) {
    hold = { original: mesh.frustumCulled, holders: new Set() };
    FRUSTUM_CULLING_HOLDS.set(mesh, hold);
  }
  // One entry per wearing: the same Material can sit on two slots of a mesh.
  const wearing = {};
  hold.holders.add(wearing);
  mesh.frustumCulled = false;
  return () => {
    const current = FRUSTUM_CULLING_HOLDS.get(mesh);
    if (!current || !current.holders.delete(wearing)) return;
    if (current.holders.size > 0) return;
    FRUSTUM_CULLING_HOLDS.delete(mesh);
    mesh.frustumCulled = current.original;
  };
}

/**
 * Puts a Material on a mesh slot and returns the function that takes it off.
 *
 * `attach` is the React Three Fiber form: "material" for the whole mesh,
 * "material-2" for one slot of a multi-material mesh.
 */
export function attachClassicShaderMaterial(
  mesh: Mesh,
  material: Material,
  attach = "material",
): () => void {
  const slot = /^material-(\d+)$/.exec(attach);
  const index = slot ? Number(slot[1]) : undefined;
  const previous = mesh.material;
  const previousSlot =
    index !== undefined && Array.isArray(previous) ? previous[index] : undefined;
  if (index !== undefined && Array.isArray(previous)) {
    const next = previous.slice();
    next[index] = material;
    mesh.material = next;
  } else {
    mesh.material = material;
  }
  const releaseMeshState = applyClassicShaderMeshState(mesh, material);
  return () => {
    releaseMeshState();
    if (index !== undefined && Array.isArray(mesh.material)) {
      if (mesh.material[index] === material && previousSlot) {
        const next = mesh.material.slice();
        next[index] = previousSlot;
        mesh.material = next;
      }
    } else if (mesh.material === material) {
      mesh.material = previous;
    }
  };
}

function createUniformValue(
  name: string,
  uniform: XriftClassicShaderUniform,
  options: ClassicShaderMaterialOptions,
  ownedTextures: Texture[],
): unknown {
  switch (uniform.kind) {
    case "number":
      return uniform.value;
    case "color":
      return new Color(uniform.value);
    case "vector": {
      const value = uniform.value;
      return value.length === 2
        ? new Vector2(value[0] ?? 0, value[1] ?? 0)
        : value.length === 3
          ? new Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0)
          : new Vector4(
              value[0] ?? 0,
              value[1] ?? 0,
              value[2] ?? 0,
              value[3] ?? 0,
            );
    }
    case "matrix":
      // Column-major, which is the order three.js stores and GLSL reads.
      return uniform.value.length === 9
        ? new Matrix3().fromArray(uniform.value)
        : new Matrix4().fromArray(uniform.value);
    case "array":
      // three.js sends a flat array of numbers as it is, for float[], vecN[]
      // and matN[] alike. A copy keeps the document's array out of the renderer.
      return uniform.value.slice();
    case "texture":
    case "texture-3d":
    case "texture-cube": {
      const texture = createUniformTexture(name, uniform, options);
      if (texture) ownedTextures.push(texture);
      return texture;
    }
    default:
      // A kind written by a newer Studio. Binding nothing is the honest result.
      return null;
  }
}

function lookupTexture(
  textures: ClassicShaderTextureLookup | undefined,
  assetId: string,
): Texture | null {
  if (!textures) return null;
  if (textures instanceof Map) {
    return (textures as ReadonlyMap<string, Texture>).get(assetId) ?? null;
  }
  return (
    (textures as Readonly<Record<string, Texture | null | undefined>>)[
      assetId
    ] ?? null
  );
}

function wrapping(
  value: XriftClassicShaderWrap | undefined,
  fallback: XriftClassicShaderWrap,
) {
  return (value ?? fallback) === "clamp-to-edge"
    ? ClampToEdgeWrapping
    : RepeatWrapping;
}

function isCompressedTexture(texture: Texture): boolean {
  return (
    (texture as Texture & { isCompressedTexture?: boolean })
      .isCompressedTexture === true
  );
}

function isDataTexture(texture: Texture): boolean {
  return (
    (texture as Texture & { isDataTexture?: boolean }).isDataTexture === true
  );
}

function isFloatTexture(texture: Texture): boolean {
  return texture.type === HalfFloatType || texture.type === FloatType;
}

/**
 * Sets how a `texture` or `texture-cube` uniform is filtered.
 *
 * `mipmapped` says the texture has mip levels to read. `filter` then still
 * picks the texels inside one level, and the two closest levels are blended,
 * so a surface shows no line where the level changes. Without mip levels the
 * full-size picture alone is sampled, as it always was.
 *
 * three.js applies `anisotropy` only on this pairing: mip levels blended and a
 * linear `filter`. Anywhere else the number is ignored by the renderer.
 */
function applySamplerFilters(
  texture: Texture,
  uniform: { filter?: "nearest" | "linear"; anisotropy?: number },
  mipmapped: boolean,
): void {
  const nearest = uniform.filter === "nearest";
  texture.magFilter = nearest ? NearestFilter : LinearFilter;
  texture.minFilter = !mipmapped
    ? texture.magFilter
    : nearest
      ? NearestMipmapLinearFilter
      : LinearMipmapLinearFilter;
  // Written even when omitted: the Asset's own sampler must not leak in.
  texture.anisotropy = uniform.anisotropy ?? 1;
}

function createUniformTexture(
  name: string,
  uniform: Extract<
    XriftClassicShaderUniform,
    { kind: "texture" | "texture-3d" | "texture-cube" }
  >,
  options: ClassicShaderMaterialOptions,
): Texture | null {
  const report = (diagnostic: Omit<ClassicShaderDiagnostic, "uniformName">) =>
    options.onDiagnostic?.({ ...diagnostic, uniformName: name });

  if (uniform.kind === "texture") {
    const source = lookupTexture(options.textures, uniform.textureAssetId);
    if (!source) {
      report({
        code: "texture-not-loaded",
        assetId: uniform.textureAssetId,
        message: `Custom Shader texture could not be loaded: ${uniform.textureAssetId}`,
      });
      return null;
    }
    const texture = source.clone();
    const compressed = isCompressedTexture(texture);
    const data = isDataTexture(texture);
    const float = isFloatTexture(texture);
    // Float data is numbers, not colour: it has no sRGB encoding to undo.
    texture.colorSpace =
      uniform.colorSpace === "srgb" && !float ? SRGBColorSpace : NoColorSpace;
    // Where the mip levels come from. A decoded picture has them built when it
    // is uploaded. A compressed texture carries the levels its file was encoded
    // with, and WebGL cannot build more. Float data gets none: WebGL builds
    // them only with optional extensions, and a sampler that asks for levels
    // the device could not build reads black.
    const mipmaps = uniform.generateMipmaps === true;
    texture.generateMipmaps = mipmaps && !compressed && !float;
    applySamplerFilters(
      texture,
      uniform,
      texture.generateMipmaps ||
        (mipmaps && compressed && texture.mipmaps.length > 1),
    );
    texture.wrapS = wrapping(uniform.wrapS, "repeat");
    texture.wrapT = wrapping(uniform.wrapT, "repeat");
    // The orientation three.js loaders hand a ShaderMaterial: a decoded picture
    // is flipped so its top row is v = 1, while data and compressed textures
    // arrive already arranged. The Asset's own flipY is for glTF surfaces.
    if (data) texture.flipY = false;
    else if (!compressed) texture.flipY = true;
    texture.mapping = UVMapping;
    texture.needsUpdate = true;
    return texture;
  }

  if (uniform.kind === "texture-3d") {
    const source = lookupTexture(options.textures, uniform.textureAssetId);
    if (!source) {
      report({
        code: "texture-not-loaded",
        assetId: uniform.textureAssetId,
        message: `Custom Shader texture could not be loaded: ${uniform.textureAssetId}`,
      });
      return null;
    }
    const volume = resolveVolume(source, uniform.slices, options.readImagePixels);
    if (typeof volume === "string") {
      report({
        code: volume.startsWith("unsupported")
          ? "texture-unsupported"
          : "texture-3d-layout",
        assetId: uniform.textureAssetId,
        message: `Custom Shader 3D texture could not be built from ${uniform.textureAssetId}: ${volume}`,
      });
      return null;
    }
    const texture = volume.clone();
    texture.colorSpace =
      uniform.colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
    // A volume is a table: it is read at full size, without mip levels.
    texture.generateMipmaps = false;
    applySamplerFilters(texture, { filter: uniform.filter }, false);
    texture.wrapS = wrapping(uniform.wrapS, "clamp-to-edge");
    texture.wrapT = wrapping(uniform.wrapT, "clamp-to-edge");
    texture.wrapR = wrapping(uniform.wrapR, "clamp-to-edge");
    // WebGL refuses to flip a volume upload, so rows stay in picture order.
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }

  const sources: Texture[] = [];
  for (const face of uniform.faces) {
    const source = lookupTexture(options.textures, face.textureAssetId);
    if (!source) {
      report({
        code: "texture-not-loaded",
        assetId: face.textureAssetId,
        message: `Custom Shader texture could not be loaded: ${face.textureAssetId}`,
      });
      return null;
    }
    sources.push(source);
  }
  const cube = resolveCube(sources);
  if (typeof cube === "string") {
    report({
      code: cube.startsWith("unsupported")
        ? "texture-unsupported"
        : "texture-cube-layout",
      message: `Custom Shader cube map could not be built: ${cube}`,
    });
    return null;
  }
  const texture = cube.clone();
  texture.colorSpace =
    uniform.colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
  // The faces are decoded pictures, so their mip levels can always be built.
  texture.generateMipmaps = uniform.generateMipmaps === true;
  applySamplerFilters(texture, uniform, texture.generateMipmaps);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Rearranges a strip of slices into the row order of a 3D texture.
 *
 * `pixels` is 8-bit RGBA, top row first, `width` x `height`, holding `slices`
 * pictures side by side. The result is slice by slice, each slice row by row:
 * `u` runs along a slice's width, `v` down its height from the top row, and
 * `w` from the leftmost slice to the rightmost.
 */
export function sliceClassicShaderVolume(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  slices: number,
): Uint8Array {
  const sliceWidth = width / slices;
  const rowBytes = sliceWidth * 4;
  const rows =
    pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray
      ? pixels
      : Uint8Array.from(pixels);
  const volume = new Uint8Array(rowBytes * height * slices);
  for (let slice = 0; slice < slices; slice += 1) {
    for (let row = 0; row < height; row += 1) {
      const source = (row * width + slice * sliceWidth) * 4;
      volume.set(
        rows.subarray(source, source + rowBytes),
        (slice * height + row) * rowBytes,
      );
    }
  }
  return volume;
}

function describeVolumeLayoutError(error: ClassicShaderVolumeLayoutError): string {
  switch (error.reason) {
    case "no-size":
      return "the image has no size";
    case "not-square":
      return `the image is ${error.width} x ${error.height}, which is not a row of square slices; set slices`;
    case "slices":
      return "slices must be a whole number of 1 or more";
    case "width":
      return `the image width ${error.width} is not a multiple of ${error.slices} slices`;
    default:
      return `the volume is ${error.sliceWidth} x ${error.height} x ${error.slices}; each side may be ${error.limit} texels at most`;
  }
}

const readImagePixelsWithCanvas: ClassicShaderImageReader = (image) => {
  if (!image || typeof image !== "object") return null;
  const picture = image as {
    data?: ArrayLike<number> | null;
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = picture.naturalWidth || picture.width || 0;
  const height = picture.naturalHeight || picture.height || 0;
  if (picture.data) {
    // Already rows of 8-bit RGBA, for example a DataTexture's image.
    return picture.data.length === width * height * 4
      ? { data: picture.data, width, height }
      : null;
  }
  if (typeof document === "undefined" || !(width > 0) || !(height > 0)) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image as CanvasImageSource, 0, 0);
  try {
    return context.getImageData(0, 0, width, height);
  } catch {
    // A picture from another origin without CORS cannot be read back.
    return null;
  }
};

/** Volumes already built from a decoded picture, so Materials share them. */
const VOLUME_CACHE = new WeakMap<object, Map<string, Data3DTexture | string>>();

function resolveVolume(
  source: Texture,
  slices: number | undefined,
  readImagePixels: ClassicShaderImageReader = readImagePixelsWithCanvas,
): Data3DTexture | string {
  if (isCompressedTexture(source)) {
    return "unsupported: a compressed (KTX2) texture cannot be sliced";
  }
  if (isFloatTexture(source)) {
    return "unsupported: a float texture cannot be sliced";
  }
  const cacheOwner = source.source as object;
  let cache = VOLUME_CACHE.get(cacheOwner);
  if (!cache) {
    cache = new Map();
    VOLUME_CACHE.set(cacheOwner, cache);
  }
  const cacheKey = slices === undefined ? "auto" : String(slices);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const build = (): Data3DTexture | string => {
    const pixels = readImagePixels(source.image);
    if (!pixels) return "the image could not be read";
    const { layout, error } = resolveClassicShaderVolumeLayout(
      pixels.width,
      pixels.height,
      slices,
    );
    if (!layout) return describeVolumeLayoutError(error);
    const volume = new Data3DTexture(
      sliceClassicShaderVolume(
        pixels.data,
        pixels.width,
        pixels.height,
        layout.slices,
      ),
      layout.sliceWidth,
      pixels.height,
      layout.slices,
    );
    volume.format = RGBAFormat;
    volume.type = UnsignedByteType;
    volume.unpackAlignment = 1;
    return volume;
  };
  const built = build();
  cache.set(cacheKey, built);
  return built;
}

/** Cube maps already assembled from six decoded pictures. */
const CUBE_CACHE = new WeakMap<object, Map<string, CubeTexture | string>>();

function resolveCube(sources: readonly Texture[]): CubeTexture | string {
  if (sources.length !== CLASSIC_SHADER_LIMITS.cubeFaces) {
    return `a cube map needs ${CLASSIC_SHADER_LIMITS.cubeFaces} faces`;
  }
  if (sources.some((source) => isCompressedTexture(source))) {
    return "unsupported: a compressed (KTX2) texture cannot be a cube face";
  }
  if (sources.some((source) => isFloatTexture(source))) {
    return "unsupported: a float texture cannot be a cube face";
  }
  const first = sources[0];
  if (!first) return "a cube map needs 6 faces";
  const cacheOwner = first.source as object;
  let cache = CUBE_CACHE.get(cacheOwner);
  if (!cache) {
    cache = new Map();
    CUBE_CACHE.set(cacheOwner, cache);
  }
  const cacheKey = sources.map((source) => source.source.uuid).join("|");
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const build = (): CubeTexture | string => {
    const images = sources.map((source) => source.image as unknown);
    const sizes = images.map((image) => {
      const picture = (image ?? {}) as {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      };
      return [
        picture.naturalWidth || picture.width || 0,
        picture.naturalHeight || picture.height || 0,
      ] as const;
    });
    const size = sizes[0]?.[0] ?? 0;
    if (!(size > 0)) return "a face image has no size";
    if (sizes.some(([width, height]) => width !== size || height !== size)) {
      return `every face must be the same square size; got ${sizes
        .map(([width, height]) => `${width} x ${height}`)
        .join(", ")}`;
    }
    const cube = new CubeTexture(images as unknown as HTMLImageElement[]);
    cube.format = first.format;
    cube.type = first.type;
    return cube;
  };
  const built = build();
  cache.set(cacheKey, built);
  return built;
}
