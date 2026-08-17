import { SKY_SHADER_CATALOG } from "./sky-shader-catalog";
import { WATER_SHADER_CATALOG } from "./water-shader-catalog";
import { TERRAIN_SURFACE_CATALOG } from "./terrain-surface-catalog";

/**
 * Readable names for a Custom Shader's uniforms.
 *
 * The uniform editor is generic — it reads whatever the shader declares — so
 * by default it can only show raw GLSL identifiers. Every official preset
 * already carries proper labels and hints for the same uniforms, and the
 * Material remembers which preset it came from, so those labels can be
 * recovered instead of making the author read `uSlopeStart` and guess.
 *
 * Anything not from a catalog still gets a readable name: the `u` prefix goes
 * and camelCase is split into words, which is a better default than the raw
 * identifier and costs nothing.
 */
export type ShaderUniformLabel = {
  label: string;
  hint?: string;
};

type CatalogParameter = {
  uniform: string;
  label: string;
  hint: string;
};

function collectCatalog(
  entries: ReadonlyArray<{
    shader: { sourceModulePath: string };
    parameters: readonly CatalogParameter[];
  }>,
): Map<string, Map<string, ShaderUniformLabel>> {
  const byModule = new Map<string, Map<string, ShaderUniformLabel>>();
  for (const entry of entries) {
    const labels = new Map<string, ShaderUniformLabel>();
    for (const parameter of entry.parameters) {
      labels.set(parameter.uniform, {
        label: parameter.label,
        hint: parameter.hint,
      });
    }
    byModule.set(entry.shader.sourceModulePath, labels);
  }
  return byModule;
}

const CATALOG_LABELS: Map<string, Map<string, ShaderUniformLabel>> = new Map([
  ...collectCatalog(SKY_SHADER_CATALOG),
  ...collectCatalog(WATER_SHADER_CATALOG),
  ...collectCatalog(TERRAIN_SURFACE_CATALOG),
]);

/**
 * Uniforms the wind contract and the Studio runtime drive on the author's
 * behalf. Naming them matters more than the others: an author who edits them
 * by hand is fighting a value that is about to be overwritten every frame.
 */
const DRIVEN_UNIFORM_LABELS: Readonly<Record<string, ShaderUniformLabel>> = {
  uTime: { label: "時間", hint: "毎フレーム自動で進みます" },
  uWindDirection: { label: "風向き", hint: "Sceneの風から自動で入ります" },
  uWindSpeed: { label: "風速", hint: "Sceneの風から自動で入ります" },
  uWindTurbulence: { label: "風の乱れ", hint: "Sceneの風から自動で入ります" },
  uCenter: { label: "中心", hint: "空のSlotから自動で入ります" },
  uRotation: { label: "回転", hint: "空のSlotから自動で入ります" },
  uExposure: { label: "露出", hint: "空のSlotから自動で入ります" },
};

/** True when Studio writes this uniform itself, so editing it has no effect. */
export function isDrivenShaderUniform(name: string): boolean {
  return name in DRIVEN_UNIFORM_LABELS;
}

function humanizeUniformName(name: string): string {
  const withoutPrefix = /^u[A-Z]/.test(name) ? name.slice(1) : name;
  return (
    withoutPrefix
      // Split camelCase and runs of capitals ("RGBValue" -> "RGB Value").
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/^./, (character) => character.toUpperCase())
  );
}

export function resolveShaderUniformLabel(
  uniformName: string,
  sourceModulePath?: string,
): ShaderUniformLabel {
  const fromCatalog = sourceModulePath
    ? CATALOG_LABELS.get(sourceModulePath)?.get(uniformName)
    : undefined;
  if (fromCatalog) return fromCatalog;
  const driven = DRIVEN_UNIFORM_LABELS[uniformName];
  if (driven) return driven;
  return { label: humanizeUniformName(uniformName) };
}
