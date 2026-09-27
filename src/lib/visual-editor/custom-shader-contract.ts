export * from "../../../packages/xrift-studio-runtime/src/custom-shader-attributes";
import type { OpenBrushMaterialShader } from "./open-brush";

export type ClassicR3fShaderUniform =
  | {
      kind: "texture";
      textureAssetId: string;
      colorSpace?: "srgb" | "linear";
      generateMipmaps?: boolean;
      filter?: "nearest" | "linear";
      wrapS?: "repeat" | "clamp-to-edge";
      wrapT?: "repeat" | "clamp-to-edge";
    }
  | { kind: "number"; value: number }
  | { kind: "color"; value: string }
  | { kind: "vector"; value: number[] };

export type ClassicR3fShaderVariant = {
  name: string;
  /** Case-insensitive Object3D.name substring. Omitted for the fallback variant. */
  meshNameIncludes?: string;
  defines: Record<string, string>;
  side: "front" | "back" | "double";
  transparent: boolean;
  depthWrite: boolean;
};

/**
 * A non-evaluating snapshot of a Classic R3F ShaderMaterial. Studio stores
 * literal GLSL, literal uniforms, and declarative mesh-name variants only.
 */
export type ClassicR3fMaterialShader = {
  kind: "classic-r3f";
  sourceModulePath: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, ClassicR3fShaderUniform>;
  variants: ClassicR3fShaderVariant[];
  animatedTimeUniform?: string;
  sourceModelAssetId?: string;
  /** Project Shader Asset used as the source of the corresponding stage. */
  vertexShaderAssetId?: string;
  fragmentShaderAssetId?: string;
};

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

/** Returns a user-readable reason instead of silently accepting bad GLSL IR. */
export function validateClassicR3fMaterialShader(
  value: unknown,
): string[] {
  if (isClassicR3fMaterialShader(value)) return [];
  if (!value || typeof value !== "object") return ["シェーダーはobjectで指定してください"];
  const shader = value as Partial<ClassicR3fMaterialShader>;
  const errors: string[] = [];
  if (shader.kind !== "classic-r3f") errors.push('kindは"classic-r3f"で指定してください');
  if (typeof shader.sourceModulePath !== "string" || !shader.sourceModulePath.trim()) {
    errors.push("sourceModulePathは空にできません");
  }
  if (typeof shader.vertexShader !== "string" || !/\bvoid\s+main\s*\(/.test(shader.vertexShader)) {
    errors.push("vertexShaderにvoid main()が必要です");
  }
  if (typeof shader.fragmentShader !== "string" || !/\bvoid\s+main\s*\(/.test(shader.fragmentShader)) {
    errors.push("fragmentShaderにvoid main()が必要です");
  }
  if (!shader.uniforms || typeof shader.uniforms !== "object" || Array.isArray(shader.uniforms)) {
    errors.push("uniformsはobjectで指定してください");
  }
  if (!Array.isArray(shader.variants) || shader.variants.length === 0) {
    errors.push("variantsを1件以上指定してください");
  }
  return errors;
}

export function isClassicR3fMaterialShader(
  value: unknown,
): value is ClassicR3fMaterialShader {
  if (!value || typeof value !== "object") return false;
  const shader = value as Partial<ClassicR3fMaterialShader>;
  if (
    shader.kind !== "classic-r3f" ||
    typeof shader.sourceModulePath !== "string" ||
    !shader.sourceModulePath.trim() ||
    typeof shader.vertexShader !== "string" ||
    shader.vertexShader.length > 512 * 1024 ||
    !/\bvoid\s+main\s*\(/.test(shader.vertexShader) ||
    typeof shader.fragmentShader !== "string" ||
    shader.fragmentShader.length > 512 * 1024 ||
    !/\bvoid\s+main\s*\(/.test(shader.fragmentShader) ||
    !shader.uniforms ||
    typeof shader.uniforms !== "object" ||
    Array.isArray(shader.uniforms) ||
    !Array.isArray(shader.variants) ||
    shader.variants.length === 0 ||
    shader.variants.length > 32
  ) {
    return false;
  }
  if (
    Object.entries(shader.uniforms).length > 128 ||
    !Object.entries(shader.uniforms).every(
      ([name, uniform]) =>
        /^[A-Za-z_]\w{0,79}$/.test(name) &&
        isClassicR3fShaderUniform(uniform),
    )
  ) {
    return false;
  }
  if (!shader.variants.every(isClassicR3fShaderVariant)) return false;
  return (
    (shader.animatedTimeUniform === undefined ||
      (typeof shader.animatedTimeUniform === "string" &&
        /^[A-Za-z_]\w{0,79}$/.test(shader.animatedTimeUniform))) &&
    (shader.sourceModelAssetId === undefined ||
      (typeof shader.sourceModelAssetId === "string" &&
        shader.sourceModelAssetId.trim().length > 0)) &&
    (shader.vertexShaderAssetId === undefined ||
      (typeof shader.vertexShaderAssetId === "string" &&
        shader.vertexShaderAssetId.trim().length > 0)) &&
    (shader.fragmentShaderAssetId === undefined ||
      (typeof shader.fragmentShaderAssetId === "string" &&
        shader.fragmentShaderAssetId.trim().length > 0))
  );
}

function isClassicR3fShaderUniform(
  value: unknown,
): value is ClassicR3fShaderUniform {
  if (!value || typeof value !== "object") return false;
  const uniform = value as Partial<ClassicR3fShaderUniform>;
  if (uniform.kind === "texture") {
    return (
      typeof uniform.textureAssetId === "string" &&
      uniform.textureAssetId.trim().length > 0 &&
      (uniform.colorSpace === undefined ||
        uniform.colorSpace === "srgb" ||
        uniform.colorSpace === "linear") &&
      (uniform.generateMipmaps === undefined ||
        typeof uniform.generateMipmaps === "boolean") &&
      (uniform.filter === undefined ||
        uniform.filter === "nearest" ||
        uniform.filter === "linear") &&
      (uniform.wrapS === undefined ||
        uniform.wrapS === "repeat" ||
        uniform.wrapS === "clamp-to-edge") &&
      (uniform.wrapT === undefined ||
        uniform.wrapT === "repeat" ||
        uniform.wrapT === "clamp-to-edge")
    );
  }
  if (uniform.kind === "number") {
    return typeof uniform.value === "number" && Number.isFinite(uniform.value);
  }
  if (uniform.kind === "color") {
    return (
      typeof uniform.value === "string" &&
      /^#[0-9a-f]{6}$/i.test(uniform.value)
    );
  }
  return (
    uniform.kind === "vector" &&
    Array.isArray(uniform.value) &&
    uniform.value.length >= 2 &&
    uniform.value.length <= 4 &&
    uniform.value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function isClassicR3fShaderVariant(
  value: unknown,
): value is ClassicR3fShaderVariant {
  if (!value || typeof value !== "object") return false;
  const variant = value as Partial<ClassicR3fShaderVariant>;
  return (
    typeof variant.name === "string" &&
    variant.name.trim().length > 0 &&
    variant.name.length <= 80 &&
    (variant.meshNameIncludes === undefined ||
      (typeof variant.meshNameIncludes === "string" &&
        variant.meshNameIncludes.length > 0 &&
        variant.meshNameIncludes.length <= 80)) &&
    Boolean(variant.defines) &&
    typeof variant.defines === "object" &&
    !Array.isArray(variant.defines) &&
    Object.entries(variant.defines).length <= 32 &&
    Object.entries(variant.defines).every(
      ([name, define]) =>
        /^[A-Za-z_]\w{0,79}$/.test(name) && typeof define === "string",
    ) &&
    (variant.side === "front" ||
      variant.side === "back" ||
      variant.side === "double") &&
    typeof variant.transparent === "boolean" &&
    typeof variant.depthWrite === "boolean"
  );
}
