export * from "../../../packages/xrift-studio-runtime/src/custom-shader-attributes";
import {
  CLASSIC_SHADER_BLEND_MODES,
  CLASSIC_SHADER_LIMITS,
  type XriftClassicShader,
  type XriftClassicShaderUniform,
  type XriftClassicShaderVariant,
} from "../../../packages/xrift-studio-runtime/src/classic-shader-contract";
import type { OpenBrushMaterialShader } from "./open-brush";

export {
  CLASSIC_SHADER_BLEND_MODES,
  CLASSIC_SHADER_LIMITS,
  classicShaderTextureAssetIds,
  classicShaderUniformTextureAssetIds,
  isClassicShaderTextureUniform,
  resolveClassicShaderVariant,
} from "../../../packages/xrift-studio-runtime/src/classic-shader-contract";

/**
 * The descriptor is defined once, beside the code that draws it, so the editor
 * document, the compiler and every runtime read the same fields. These names
 * are the ones the editor has always used for it.
 */
export type ClassicR3fShaderUniform = XriftClassicShaderUniform;
export type ClassicR3fShaderVariant = XriftClassicShaderVariant;
export type ClassicR3fMaterialShader = XriftClassicShader;

/** A partial, JSON-safe update accepted by the Inspector and MCP. */
export type ClassicR3fMaterialShaderPatch = Partial<
  Omit<ClassicR3fMaterialShader, "kind">
>;

export type MaterialShader =
  | OpenBrushMaterialShader
  | ClassicR3fMaterialShader;

export const DEFAULT_CUSTOM_SHADER_VERTEX = `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const DEFAULT_CUSTOM_SHADER_FRAGMENT = `uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;

void main() {
  float pulse = 0.92 + 0.08 * sin(uTime * 2.0 + vUv.y * 6.28318);
  vec3 color = uColor * uIntensity * pulse;
  gl_FragColor = vec4(color, 1.0);
}`;

/** The starter shader used by the Material Inspector and MCP create tool. */
export function createDefaultCustomShader(): ClassicR3fMaterialShader {
  return {
    kind: "classic-r3f",
    sourceModulePath: "studio://custom-shader",
    vertexShader: DEFAULT_CUSTOM_SHADER_VERTEX,
    fragmentShader: DEFAULT_CUSTOM_SHADER_FRAGMENT,
    uniforms: {
      uColor: { kind: "color", value: "#8b5cf6" },
      uIntensity: { kind: "number", value: 1 },
      uTime: { kind: "number", value: 0 },
    },
    variants: [
      {
        name: "default",
        defines: {},
        side: "front",
        transparent: false,
        depthWrite: true,
      },
    ],
    animatedTimeUniform: "uTime",
  };
}

export function isCustomAuthoredShader(
  value: MaterialShader | undefined,
): value is ClassicR3fMaterialShader {
  return value?.kind === "classic-r3f" && !value.sourceModelAssetId;
}

const UNIFORM_NAME = /^[A-Za-z_]\w{0,79}$/;

/**
 * Returns every reason a shader cannot be drawn, in the author's words.
 *
 * An empty list is the only way a shader counts as valid: the Inspector, the
 * MCP tools, the compiler and the document codec all ask this one function, so
 * a value one of them accepts cannot be a value another rejects on reload.
 */
export function validateClassicR3fMaterialShader(
  value: unknown,
): string[] {
  if (!value || typeof value !== "object") return ["シェーダーはオブジェクトで指定してください"];
  const shader = value as Partial<ClassicR3fMaterialShader>;
  const errors: string[] = [];
  if (shader.kind !== "classic-r3f") errors.push('kindは"classic-r3f"で指定してください');
  if (typeof shader.sourceModulePath !== "string" || !shader.sourceModulePath.trim()) {
    errors.push("sourceModulePathは空にできません");
  }
  for (const stage of ["vertexShader", "fragmentShader"] as const) {
    const source = shader[stage];
    if (typeof source !== "string" || !/\bvoid\s+main\s*\(/.test(source)) {
      errors.push(`${stage}にvoid main()が必要です`);
    } else if (source.length > CLASSIC_SHADER_LIMITS.sourceLength) {
      errors.push(`${stage}は${CLASSIC_SHADER_LIMITS.sourceLength}文字以内にしてください`);
    }
  }
  if (!shader.uniforms || typeof shader.uniforms !== "object" || Array.isArray(shader.uniforms)) {
    errors.push("uniformsはオブジェクトで指定してください");
  } else {
    const entries = Object.entries(shader.uniforms);
    if (entries.length > CLASSIC_SHADER_LIMITS.uniforms) {
      errors.push(`uniformsは${CLASSIC_SHADER_LIMITS.uniforms}件以内にしてください`);
    }
    for (const [name, uniform] of entries) {
      if (!UNIFORM_NAME.test(name)) {
        errors.push(`uniforms.${name}: uniform名は英字か_で始まる80文字以内の英数字にしてください`);
        continue;
      }
      const reason = describeInvalidUniform(uniform);
      if (reason) errors.push(`uniforms.${name}: ${reason}`);
    }
  }
  if (!Array.isArray(shader.variants) || shader.variants.length === 0) {
    errors.push("variantsを1件以上指定してください");
  } else {
    if (shader.variants.length > CLASSIC_SHADER_LIMITS.variants) {
      errors.push(`variantsは${CLASSIC_SHADER_LIMITS.variants}件以内にしてください`);
    }
    shader.variants.forEach((variant, index) => {
      const reason = describeInvalidVariant(variant);
      if (reason) errors.push(`variants[${index}]: ${reason}`);
    });
  }
  if (
    shader.animatedTimeUniform !== undefined &&
    (typeof shader.animatedTimeUniform !== "string" ||
      !UNIFORM_NAME.test(shader.animatedTimeUniform))
  ) {
    errors.push("animatedTimeUniformはuniform名で指定してください");
  }
  for (const field of [
    "sourceModelAssetId",
    "vertexShaderAssetId",
    "fragmentShaderAssetId",
  ] as const) {
    const assetId = shader[field];
    if (
      assetId !== undefined &&
      (typeof assetId !== "string" || assetId.trim().length === 0)
    ) {
      errors.push(`${field}は空にできません`);
    }
  }
  return errors;
}

export function isClassicR3fMaterialShader(
  value: unknown,
): value is ClassicR3fMaterialShader {
  return validateClassicR3fMaterialShader(value).length === 0;
}

function isFiniteNumberList(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Sampler options shared by the texture kinds. Returns the first bad one. */
function describeInvalidSampler(
  uniform: Record<string, unknown>,
  wrapFields: readonly string[],
): string | undefined {
  if (
    uniform.colorSpace !== undefined &&
    uniform.colorSpace !== "srgb" &&
    uniform.colorSpace !== "linear"
  ) {
    return 'colorSpaceは"srgb"か"linear"で指定してください';
  }
  if (
    uniform.generateMipmaps !== undefined &&
    typeof uniform.generateMipmaps !== "boolean"
  ) {
    return "generateMipmapsはtrueかfalseで指定してください";
  }
  if (
    uniform.filter !== undefined &&
    uniform.filter !== "nearest" &&
    uniform.filter !== "linear"
  ) {
    return 'filterは"nearest"か"linear"で指定してください';
  }
  for (const field of wrapFields) {
    const wrap = uniform[field];
    if (wrap !== undefined && wrap !== "repeat" && wrap !== "clamp-to-edge") {
      return `${field}は"repeat"か"clamp-to-edge"で指定してください`;
    }
  }
  return undefined;
}

function describeInvalidUniform(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return "オブジェクトで指定してください";
  const uniform = value as Record<string, unknown>;
  switch (uniform.kind) {
    case "texture":
      if (!isNonEmptyString(uniform.textureAssetId)) {
        return "textureAssetIdにテクスチャのIDを指定してください";
      }
      return describeInvalidSampler(uniform, ["wrapS", "wrapT"]);
    case "texture-3d":
      if (!isNonEmptyString(uniform.textureAssetId)) {
        return "textureAssetIdにテクスチャのIDを指定してください";
      }
      if (
        uniform.slices !== undefined &&
        (typeof uniform.slices !== "number" ||
          !Number.isInteger(uniform.slices) ||
          uniform.slices < 1 ||
          uniform.slices > CLASSIC_SHADER_LIMITS.volumeAxis)
      ) {
        return `slicesは1〜${CLASSIC_SHADER_LIMITS.volumeAxis}の整数で指定してください`;
      }
      if (uniform.generateMipmaps !== undefined) {
        return "texture-3dはgenerateMipmapsを指定できません";
      }
      return describeInvalidSampler(uniform, ["wrapS", "wrapT", "wrapR"]);
    case "texture-cube":
      if (
        !Array.isArray(uniform.faces) ||
        uniform.faces.length !== CLASSIC_SHADER_LIMITS.cubeFaces ||
        !uniform.faces.every(
          (face) =>
            Boolean(face) &&
            typeof face === "object" &&
            isNonEmptyString((face as { textureAssetId?: unknown }).textureAssetId),
        )
      ) {
        return "facesに+X、-X、+Y、-Y、+Z、-Zの順で6件のtextureAssetIdを指定してください";
      }
      return describeInvalidSampler(uniform, []);
    case "number":
      return typeof uniform.value === "number" && Number.isFinite(uniform.value)
        ? undefined
        : "numberのvalueは数値で指定してください";
    case "color":
      return typeof uniform.value === "string" &&
        /^#[0-9a-f]{6}$/i.test(uniform.value)
        ? undefined
        : "colorのvalueは#rrggbbで指定してください";
    case "vector":
      return isFiniteNumberList(uniform.value, 2, 4)
        ? undefined
        : "vectorのvalueは2〜4個の数値で指定してください";
    case "matrix":
      return isFiniteNumberList(uniform.value, 9, 16) &&
        (uniform.value.length === 9 || uniform.value.length === 16)
        ? undefined
        : "matrixのvalueは9個（mat3）か16個（mat4）の数値を列優先で指定してください";
    case "array":
      return isFiniteNumberList(uniform.value, 1, CLASSIC_SHADER_LIMITS.arrayLength)
        ? undefined
        : `arrayのvalueは1〜${CLASSIC_SHADER_LIMITS.arrayLength}個の数値で指定してください`;
    default:
      return "kindはtexture、texture-3d、texture-cube、number、color、vector、matrix、arrayのいずれかで指定してください";
  }
}

function describeInvalidVariant(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return "オブジェクトで指定してください";
  const variant = value as Record<string, unknown>;
  if (
    typeof variant.name !== "string" ||
    variant.name.trim().length === 0 ||
    variant.name.length > 80
  ) {
    return "nameは1〜80文字で指定してください";
  }
  if (
    variant.meshNameIncludes !== undefined &&
    (typeof variant.meshNameIncludes !== "string" ||
      variant.meshNameIncludes.length === 0 ||
      variant.meshNameIncludes.length > 80)
  ) {
    return "meshNameIncludesは1〜80文字で指定してください";
  }
  if (
    !variant.defines ||
    typeof variant.defines !== "object" ||
    Array.isArray(variant.defines)
  ) {
    return "definesはオブジェクトで指定してください";
  }
  const defines = Object.entries(variant.defines);
  if (
    defines.length > CLASSIC_SHADER_LIMITS.defines ||
    !defines.every(
      ([name, define]) => UNIFORM_NAME.test(name) && typeof define === "string",
    )
  ) {
    return `definesは${CLASSIC_SHADER_LIMITS.defines}件以内で、名前と文字列の値を指定してください`;
  }
  if (
    variant.side !== "front" &&
    variant.side !== "back" &&
    variant.side !== "double"
  ) {
    return 'sideは"front"、"back"、"double"のいずれかで指定してください';
  }
  if (typeof variant.transparent !== "boolean") {
    return "transparentはtrueかfalseで指定してください";
  }
  if (typeof variant.depthWrite !== "boolean") {
    return "depthWriteはtrueかfalseで指定してください";
  }
  if (
    variant.blending !== undefined &&
    !(CLASSIC_SHADER_BLEND_MODES as readonly unknown[]).includes(variant.blending)
  ) {
    return `blendingは${CLASSIC_SHADER_BLEND_MODES.map((mode) => `"${mode}"`).join("、")}のいずれかで指定してください`;
  }
  if (
    variant.frustumCulled !== undefined &&
    typeof variant.frustumCulled !== "boolean"
  ) {
    return "frustumCulledはtrueかfalseで指定してください";
  }
  return undefined;
}
