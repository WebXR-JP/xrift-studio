import { detectTimeUniforms, type TimeUniformSpec } from "./shader-time.js";

/**
 * The Classic R3F Custom Shader descriptor.
 *
 * One definition is read by the editor document, the compiler, the generated
 * world and the Runtime JSON loader, so a field added here exists in every
 * path or in none. The descriptor is data only: literal GLSL, literal uniform
 * values and declarative per-mesh variants. Nothing in it is evaluated.
 *
 * Every field added after the first release of the contract is optional and
 * defaults to the behaviour older documents were drawn with.
 */

/** How a variant combines with the frame. Same values as an ordinary Material. */
export type XriftClassicShaderBlending =
  | "normal"
  | "additive"
  | "multiply"
  | "subtractive";

export const CLASSIC_SHADER_BLEND_MODES = [
  "normal",
  "additive",
  "multiply",
  "subtractive",
] as const satisfies readonly XriftClassicShaderBlending[];

export type XriftClassicShaderWrap = "repeat" | "clamp-to-edge";
export type XriftClassicShaderFilter = "nearest" | "linear";
export type XriftClassicShaderColorSpace = "srgb" | "linear";

/** One face of a cube map. An object so that Asset reference walkers find it. */
export type XriftClassicShaderCubeFace = { textureAssetId: string };

export type XriftClassicShaderUniform =
  | {
      /**
       * `sampler2D`. An image Texture Asset is read as 8-bit RGBA; an EXR
       * Texture Asset is read as float data in the precision the file stores.
       */
      kind: "texture";
      textureAssetId: string;
      colorSpace?: XriftClassicShaderColorSpace;
      generateMipmaps?: boolean;
      filter?: XriftClassicShaderFilter;
      wrapS?: XriftClassicShaderWrap;
      wrapT?: XriftClassicShaderWrap;
    }
  | {
      /**
       * `sampler3D`, built from a strip image whose slices sit side by side
       * from left to right. A 32-cubed colour table is a 1024 x 32 picture.
       */
      kind: "texture-3d";
      textureAssetId: string;
      /** Number of slices. Omitted means square slices: width / height. */
      slices?: number;
      colorSpace?: XriftClassicShaderColorSpace;
      filter?: XriftClassicShaderFilter;
      wrapS?: XriftClassicShaderWrap;
      wrapT?: XriftClassicShaderWrap;
      wrapR?: XriftClassicShaderWrap;
    }
  | {
      /** `samplerCube`. Faces in three.js order: +X, -X, +Y, -Y, +Z, -Z. */
      kind: "texture-cube";
      faces: XriftClassicShaderCubeFace[];
      colorSpace?: XriftClassicShaderColorSpace;
      generateMipmaps?: boolean;
      filter?: XriftClassicShaderFilter;
    }
  | { kind: "number"; value: number }
  | { kind: "color"; value: string }
  | { kind: "vector"; value: number[] }
  | {
      /** `mat3` (9 numbers) or `mat4` (16 numbers), column-major. */
      kind: "matrix";
      value: number[];
    }
  | {
      /** Flat numbers for a GLSL array: `float[]`, `vecN[]` or `matN[]`. */
      kind: "array";
      value: number[];
    };

export type XriftClassicShaderVariant = {
  name: string;
  /** Case-insensitive Object3D.name substring. Omitted for the fallback variant. */
  meshNameIncludes?: string;
  defines: Record<string, string>;
  side: "front" | "back" | "double";
  transparent: boolean;
  depthWrite: boolean;
  /** Omitted means "normal", which is how older documents were drawn. */
  blending?: XriftClassicShaderBlending;
  /**
   * `false` keeps the meshes wearing this variant out of frustum culling, for
   * a vertex shader that moves them away from their own bounds. Omitted means
   * culled, as three.js meshes are by default.
   */
  frustumCulled?: boolean;
};

/**
 * A non-evaluating snapshot of a Classic R3F ShaderMaterial. Studio stores
 * literal GLSL, literal uniforms, and declarative mesh-name variants only.
 */
export type XriftClassicShader = {
  kind: "classic-r3f";
  sourceModulePath: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, XriftClassicShaderUniform>;
  variants: XriftClassicShaderVariant[];
  animatedTimeUniform?: string;
  sourceModelAssetId?: string;
  /** Project Shader Asset used as the source of the corresponding stage. */
  vertexShaderAssetId?: string;
  fragmentShaderAssetId?: string;
};

export const CLASSIC_SHADER_LIMITS = {
  /** Characters of GLSL per stage. */
  sourceLength: 512 * 1024,
  uniforms: 128,
  variants: 32,
  defines: 32,
  /**
   * Numbers in one `array` uniform. 4096 numbers are 1024 `vec4` rows, which is
   * all a fragment program may declare on common desktop drivers. A program
   * that needs more cannot be linked there, so a longer array is a mistake
   * rather than a larger world. Mobile and standalone headsets guarantee only
   * 224 rows per fragment program and 256 per vertex program.
   */
  arrayLength: 4096,
  /**
   * Texels along one axis of a `texture-3d`. WebGL 2 guarantees no more than
   * 256 (MAX_3D_TEXTURE_SIZE), so a larger volume would draw on one device and
   * come out black on another.
   */
  volumeAxis: 256,
  cubeFaces: 6,
} as const;

/** The variant a mesh wears: its own name first, then the fallback. */
export function resolveClassicShaderVariant(
  shader: Pick<XriftClassicShader, "variants">,
  meshName = "",
): XriftClassicShaderVariant | undefined {
  const normalizedMeshName = meshName.toLocaleLowerCase();
  return (
    shader.variants.find(
      (candidate) =>
        candidate.meshNameIncludes &&
        normalizedMeshName.includes(
          candidate.meshNameIncludes.toLocaleLowerCase(),
        ),
    ) ??
    shader.variants.find((candidate) => !candidate.meshNameIncludes) ??
    shader.variants[0]
  );
}

/** Texture Asset ids one uniform reads, in declaration order. */
export function classicShaderUniformTextureAssetIds(
  uniform: XriftClassicShaderUniform,
): string[] {
  if (uniform.kind === "texture" || uniform.kind === "texture-3d") {
    return [uniform.textureAssetId];
  }
  if (uniform.kind === "texture-cube") {
    return uniform.faces.map((face) => face.textureAssetId);
  }
  return [];
}

/** Every Texture Asset a shader reads, each id once. */
export function classicShaderTextureAssetIds(
  shader: Pick<XriftClassicShader, "uniforms">,
): string[] {
  const ids = new Set<string>();
  for (const uniform of Object.values(shader.uniforms)) {
    for (const id of classicShaderUniformTextureAssetIds(uniform)) ids.add(id);
  }
  return [...ids];
}

/** True for the uniform kinds that bind a sampler rather than a value. */
export function isClassicShaderTextureUniform(
  uniform: XriftClassicShaderUniform,
): uniform is Extract<
  XriftClassicShaderUniform,
  { kind: "texture" | "texture-3d" | "texture-cube" }
> {
  return (
    uniform.kind === "texture" ||
    uniform.kind === "texture-3d" ||
    uniform.kind === "texture-cube"
  );
}

export type ClassicShaderVolumeLayout = {
  /** Slices in the strip, which is the depth of the volume. */
  slices: number;
  /** Width of one slice in texels. */
  sliceWidth: number;
};

export type ClassicShaderVolumeLayoutError =
  /** The image has no width or height. */
  | { reason: "no-size" }
  /** No slice count was given and the strip is not a row of square slices. */
  | { reason: "not-square"; width: number; height: number }
  /** The slice count is not a whole number of 1 or more. */
  | { reason: "slices" }
  /** The image width does not divide into that many slices. */
  | { reason: "width"; width: number; slices: number }
  /** One side of the volume is longer than every device can hold. */
  | {
      reason: "too-large";
      sliceWidth: number;
      height: number;
      slices: number;
      limit: number;
    };

/**
 * How a strip image of `width` x `height` divides into a volume, or why it
 * does not. The editor, the compiler and the code that builds the texture all
 * decide with this function, so an image accepted while authoring is an image
 * that draws.
 */
export function resolveClassicShaderVolumeLayout(
  width: number,
  height: number,
  slices: number | undefined,
):
  | { layout: ClassicShaderVolumeLayout; error?: undefined }
  | { layout?: undefined; error: ClassicShaderVolumeLayoutError } {
  if (!(width > 0) || !(height > 0)) return { error: { reason: "no-size" } };
  const count = slices ?? width / height;
  if (!Number.isInteger(count) || count < 1) {
    return {
      error:
        slices === undefined
          ? { reason: "not-square", width, height }
          : { reason: "slices" },
    };
  }
  const sliceWidth = width / count;
  if (!Number.isInteger(sliceWidth) || sliceWidth < 1) {
    return { error: { reason: "width", width, slices: count } };
  }
  const limit = CLASSIC_SHADER_LIMITS.volumeAxis;
  if (sliceWidth > limit || height > limit || count > limit) {
    return {
      error: { reason: "too-large", sliceWidth, height, slices: count, limit },
    };
  }
  return { layout: { slices: count, sliceWidth } };
}

/**
 * The time uniforms a shader animates: the ones its GLSL declares under a
 * conventional name, plus the authored `animatedTimeUniform` when it names a
 * number uniform the declaration scan could not see.
 */
export function resolveClassicShaderTimeUniforms(
  shader: Pick<
    XriftClassicShader,
    "vertexShader" | "fragmentShader" | "uniforms" | "animatedTimeUniform"
  >,
): TimeUniformSpec[] {
  const specs = detectTimeUniforms(shader);
  const manual = shader.animatedTimeUniform;
  if (
    manual &&
    !specs.some((spec) => spec.name === manual) &&
    shader.uniforms[manual]?.kind === "number"
  ) {
    return [{ name: manual, glslType: "float" }, ...specs];
  }
  return specs;
}
