/**
 * Time-uniform helpers for Classic R3F Custom Shaders.
 *
 * A time uniform is a `float` or `vec4` uniform whose name follows a
 * conventional time spelling (for example `_UTime`, `uTime`, `_Time`, `time`
 * or `fTime`). When a shader declares one, Studio feeds it the wall-clock
 * elapsed seconds automatically in the editor Scene View, Material previews
 * and the exported runtime — no manual wiring required. The author can still
 * pin a single name with `animatedTimeUniform`; it takes precedence.
 */

/** Minimal structural view of a Classic R3F shader used for detection. */
export type TimeUniformSource = {
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: Record<string, unknown>;
  /** Optional manual override. When set, it wins over auto-detection. */
  animatedTimeUniform?: string;
};

export type TimeUniformSpec = {
  name: string;
  /** GLSL type of the declared uniform. */
  glslType: "float" | "vec4";
};

/** Matches conventional time uniform names: _UTime, uTime, _Time, time, fTime, … */
const TIME_UNIFORM_NAME = /^_?(?:[uf]?time)$/i;

const TIME_UNIFORM_TYPE = new Set(["float", "vec4"]);

/** Parses declared GLSL uniforms (float/vec4) from a shader source stage. */
function declaredScalarUniforms(source: string | undefined): Map<string, "float" | "vec4"> {
  const result = new Map<string, "float" | "vec4">();
  if (!source) return result;
  const pattern =
    /\buniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(float|vec4)\s+([A-Za-z_]\w*)\s*;/g;
  for (const match of source.matchAll(pattern)) {
    const type = match[1] as "float" | "vec4";
    const name = match[2];
    if (name) result.set(name, type);
  }
  return result;
}

/**
 * Detects time uniforms from a shader's GLSL source (vertex + fragment).
 *
 * Returns specs in declaration order, deduplicated by name. A manually
 * authored `animatedTimeUniform` is merged in (as the first entry) when it is
 * actually a declared float/vec4 uniform.
 */
export function detectTimeUniforms(shader: TimeUniformSource): TimeUniformSpec[] {
  const declared = new Map<string, "float" | "vec4">();
  for (const source of [shader.vertexShader, shader.fragmentShader]) {
    for (const [name, type] of declaredScalarUniforms(source)) {
      declared.set(name, type);
    }
  }

  const specs: TimeUniformSpec[] = [];
  const seen = new Set<string>();

  // A manually authored animatedTimeUniform overrides auto-detection and may
  // name any declared float/vec4 uniform, even a non-time-named one.
  const manual = shader.animatedTimeUniform;
  if (manual && TIME_UNIFORM_TYPE.has(declared.get(manual) ?? "")) {
    specs.push({ name: manual, glslType: declared.get(manual) as "float" | "vec4" });
    seen.add(manual);
  }

  for (const [name, glslType] of declared) {
    if (seen.has(name)) continue;
    if (TIME_UNIFORM_NAME.test(name)) {
      specs.push({ name, glslType });
      seen.add(name);
    }
  }

  return specs;
}

/** Returns whether a time uniform is declared as `vec4` in the shader. */
export function isVec4TimeUniform(
  shader: TimeUniformSource,
  name: string,
): boolean {
  const spec = detectTimeUniforms(shader).find((candidate) => candidate.name === name);
  return spec?.glslType === "vec4";
}

/**
 * Computes the runtime value for a time uniform.
 *
 * - `float`: elapsed seconds.
 * - `vec4`: Unity-style `_Time` vector `(t/20, t, t*2, t*3)`.
 */
export function resolveTimeUniformValue(
  spec: TimeUniformSpec,
  elapsedSeconds: number,
): number | number[] {
  if (spec.glslType === "vec4") {
    const t = elapsedSeconds;
    return [t / 20, t, t * 2, t * 3];
  }
  return elapsedSeconds;
}

/**
 * A three.js uniform value that can carry a float or a vector. `vec4` values
 * are represented as `Vector4` (or a 4-element array) so it stays compatible
 * with `ShaderMaterial` uniforms.
 */
export type MutableUniformValue =
  | { value: number }
  | { value: number[] }
  | { value: { set: (x: number, y: number, z: number, w: number) => unknown } };

/**
 * Applies the resolved time value onto a live uniform object, tolerating both
 * plain `number`/array uniforms and three.js vector objects (e.g. `Vector4`).
 */
export function applyTimeUniformValue(
  uniform: MutableUniformValue | undefined,
  spec: TimeUniformSpec,
  elapsedSeconds: number,
): void {
  if (!uniform) return;
  if (spec.glslType === "vec4") {
    const t = elapsedSeconds;
    const x = t / 20;
    const y = t;
    const z = t * 2;
    const w = t * 3;
    const value = uniform.value;
    if (value && typeof value === "object" && "set" in value) {
      value.set(x, y, z, w);
    } else if (Array.isArray(value)) {
      value[0] = x;
      value[1] = y;
      value[2] = z;
      value[3] = w;
    } else {
      uniform.value = [x, y, z, w];
    }
    return;
  }
  uniform.value = elapsedSeconds;
}
