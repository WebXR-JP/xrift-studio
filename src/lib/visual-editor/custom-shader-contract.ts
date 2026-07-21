import {
  BufferAttribute,
  type BufferGeometry,
  type Material,
} from "three";

export type CustomShaderAttributeBinding = {
  shaderName: string;
  glslType: string;
  sourceAttribute?: string;
  status: "bound" | "default" | "missing";
};

export type CustomShaderUniformBinding = {
  name: string;
  glslType: string;
  status: "texture" | "value" | "missing";
};

export type CustomShaderAttributeOverrides = Record<
  string,
  { sourceAttribute?: string; defaultValue?: number[] }
>;

export type CustomShaderSourceOverrides = {
  vertexShader?: string;
  fragmentShader?: string;
};

export function applyCustomShaderSourceOverrides(
  material: Material,
  overrides: CustomShaderSourceOverrides | undefined,
): Material {
  if (!overrides) return material;
  const shader = material as Material & {
    vertexShader?: string;
    fragmentShader?: string;
  };
  if (overrides.vertexShader !== undefined) {
    shader.vertexShader = overrides.vertexShader;
  }
  if (overrides.fragmentShader !== undefined) {
    shader.fragmentShader = overrides.fragmentShader;
  }
  material.needsUpdate = true;
  return material;
}

export function hasCustomShaderEntrypoints(material: Material): boolean {
  const shader = material as Material & {
    vertexShader?: unknown;
    fragmentShader?: unknown;
  };
  return (
    typeof shader.vertexShader === "string" &&
    /\bvoid\s+main\s*\(/.test(shader.vertexShader) &&
    typeof shader.fragmentShader === "string" &&
    /\bvoid\s+main\s*\(/.test(shader.fragmentShader)
  );
}

const CUSTOM_SHADER_ATTRIBUTE_BINDINGS_USER_DATA_KEY =
  "xriftCustomShaderAttributeBindings";

const ATTRIBUTE_SOURCE_CANDIDATES: Record<string, string[]> = {
  a_position: ["position"],
  a_normal: ["normal"],
  a_color: ["color"],
  a_tangent: ["tangent"],
  a_texcoord0: ["_tb_unity_texcoord_0", "uv"],
  a_texcoord1: ["_tb_unity_texcoord_1", "uv1", "uv2"],
};

/** Parses the vertex-input declarations supported by WebGL GLSL 1 and 3. */
export function parseCustomShaderAttributes(
  vertexShader: string | undefined,
): Array<{ name: string; glslType: string }> {
  if (!vertexShader) return [];
  const declarations: Array<{ name: string; glslType: string }> = [];
  const pattern = /(?:^|\n)\s*(?:layout\s*\([^)]*\)\s*)?(?:attribute|in)\s+(?:(?:lowp|mediump|highp)\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*;/g;
  for (const match of vertexShader.matchAll(pattern)) {
    declarations.push({ glslType: match[1], name: match[2] });
  }
  return declarations;
}

export function inspectCustomShaderUniforms(material: Material): CustomShaderUniformBinding[] {
  const shader = material as Material & {
    vertexShader?: unknown;
    fragmentShader?: unknown;
    uniforms?: Record<string, { value?: unknown }>;
  };
  const sources = [shader.vertexShader, shader.fragmentShader]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const declarations = new Map<string, string>();
  const pattern = /(?:^|\n)\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(?:\s*\[[^\]]+\])?\s*;/g;
  for (const match of sources.matchAll(pattern)) {
    declarations.set(match[2], match[1]);
  }
  return [...declarations.entries()].map(([name, glslType]) => {
    const uniform = shader.uniforms?.[name];
    return {
      name,
      glslType,
      status: isTextureValue(uniform?.value)
        ? "texture"
        : uniform
          ? "value"
          : "missing",
    };
  });
}

/**
 * Binds shader attribute names to glTF/Three geometry semantics. Optional
 * color, UV, normal and tangent inputs receive deterministic defaults so a
 * copied Shader Material can be assigned to another Mesh Renderer safely.
 */
export function bindCustomShaderGeometryAttributes(
  geometry: BufferGeometry,
  material: Material,
  overrides: CustomShaderAttributeOverrides = {},
): CustomShaderAttributeBinding[] {
  const shader = material as Material & { vertexShader?: unknown };
  const declarations = parseCustomShaderAttributes(
    typeof shader.vertexShader === "string" ? shader.vertexShader : undefined,
  );
  const bindings = declarations.map(({ name, glslType }) => {
    const override = overrides[name];
    const exact = geometry.getAttribute(name);
    if (exact && !override) {
      return {
        shaderName: name,
        glslType,
        sourceAttribute: name,
        status: "bound" as const,
      };
    }
    if (name === "a_normal" && !geometry.getAttribute("normal")) {
      geometry.computeVertexNormals();
    }
    if (override?.defaultValue) {
      const fallback = createDefaultAttribute(
        geometry,
        name,
        glslType,
        override.defaultValue,
      );
      if (fallback) {
        geometry.setAttribute(name, fallback);
        return {
          shaderName: name,
          glslType,
          status: "default" as const,
        };
      }
    }
    const candidates = override?.sourceAttribute
      ? [override.sourceAttribute]
      : ATTRIBUTE_SOURCE_CANDIDATES[name] ?? [name];
    const sourceName = candidates.find(
      (candidate) => geometry.getAttribute(candidate),
    );
    if (sourceName) {
      geometry.setAttribute(name, geometry.getAttribute(sourceName));
      return {
        shaderName: name,
        glslType,
        sourceAttribute: sourceName,
        status: "bound" as const,
      };
    }
    const fallback = createDefaultAttribute(
      geometry,
      name,
      glslType,
      undefined,
    );
    if (fallback) {
      geometry.setAttribute(name, fallback);
      return {
        shaderName: name,
        glslType,
        status: "default" as const,
      };
    }
    return { shaderName: name, glslType, status: "missing" as const };
  });
  material.userData[CUSTOM_SHADER_ATTRIBUTE_BINDINGS_USER_DATA_KEY] = bindings;
  return bindings;
}

export function readCustomShaderAttributeBindings(
  material: Material,
): CustomShaderAttributeBinding[] {
  const value = material.userData[CUSTOM_SHADER_ATTRIBUTE_BINDINGS_USER_DATA_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isCustomShaderAttributeBinding);
}

function createDefaultAttribute(
  geometry: BufferGeometry,
  shaderName: string,
  glslType: string,
  overrideValue: number[] | undefined,
): BufferAttribute | undefined {
  const position = geometry.getAttribute("position");
  if (!position) return undefined;
  const itemSize = glslItemSize(glslType);
  if (!itemSize) return undefined;
  const defaults = overrideValue ?? defaultAttributeValues(shaderName, itemSize);
  if (!defaults) return undefined;
  if (defaults.length !== itemSize || defaults.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  const values = new Float32Array(position.count * itemSize);
  for (let index = 0; index < position.count; index += 1) {
    values.set(defaults, index * itemSize);
  }
  return new BufferAttribute(values, itemSize);
}

function defaultAttributeValues(
  shaderName: string,
  itemSize: number,
): number[] | undefined {
  if (shaderName === "a_color") return Array.from({ length: itemSize }, () => 1);
  if (shaderName === "a_tangent") return [1, 0, 0, 1].slice(0, itemSize);
  if (shaderName.startsWith("a_texcoord")) {
    return Array.from({ length: itemSize }, () => 0);
  }
  return undefined;
}

function glslItemSize(glslType: string): number | undefined {
  if (glslType === "float") return 1;
  const match = /^vec([234])$/.exec(glslType);
  return match ? Number(match[1]) : undefined;
}

function isTextureValue(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "isTexture" in value);
}

function isCustomShaderAttributeBinding(
  value: unknown,
): value is CustomShaderAttributeBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Partial<CustomShaderAttributeBinding>;
  return (
    typeof binding.shaderName === "string" &&
    typeof binding.glslType === "string" &&
    (binding.status === "bound" ||
      binding.status === "default" ||
      binding.status === "missing") &&
    (binding.sourceAttribute === undefined ||
      typeof binding.sourceAttribute === "string")
  );
}
