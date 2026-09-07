import type { ClassicR3fMaterialShader } from "./custom-shader-contract";
import type { SkyShaderCatalogEntry } from "./sky-shader-catalog";

export type SkyShaderQuality = "low" | "balanced" | "high";
export const SKY_SHADER_QUALITY_OPTIONS = [
  { id: "low", label: "軽量", description: "雲・オーロラのサンプル数を減らします。端末上で負荷を確認してください。" },
  { id: "balanced", label: "標準", description: "細部と描画量のバランスを取った既定値です。" },
  { id: "high", label: "高精細", description: "雲・オーロラ・ノイズのサンプル数を増やします。GPU負荷も増えます。" },
] as const;

const QUALITY_DEFINES: Record<SkyShaderQuality, Record<string, string>> = {
  low: { XRIFT_SKY_DETAIL: "3", XRIFT_SKY_CLOUD_STEPS: "10", XRIFT_SKY_AURORA_STEPS: "10", XRIFT_CLOUD_STEPS: "12", XRIFT_CLOUD_LIGHT_STEPS: "2" },
  balanced: { XRIFT_SKY_DETAIL: "4", XRIFT_SKY_CLOUD_STEPS: "18", XRIFT_SKY_AURORA_STEPS: "18", XRIFT_CLOUD_STEPS: "24", XRIFT_CLOUD_LIGHT_STEPS: "3" },
  high: { XRIFT_SKY_DETAIL: "5", XRIFT_SKY_CLOUD_STEPS: "28", XRIFT_SKY_AURORA_STEPS: "28", XRIFT_CLOUD_STEPS: "40", XRIFT_CLOUD_LIGHT_STEPS: "4" },
};

/** Quality travels with the ordinary Material, through save/MCP/World export.
 * It never overrides uniforms, so changing quality does not erase a palette. */
export function withSkyShaderQuality(
  shader: ClassicR3fMaterialShader,
  quality: SkyShaderQuality,
): ClassicR3fMaterialShader {
  const defines = Object.fromEntries(Object.entries(QUALITY_DEFINES[quality]).filter(
    ([key]) => shader.fragmentShader.includes(key),
  ));
  return {
    ...shader,
    variants: shader.variants.map((variant) => ({
      ...variant, defines: { ...variant.defines, ...defines },
    })),
  };
}

export function skyShaderCostLabel(entry: SkyShaderCatalogEntry): string {
  const cost = entry.cost ?? (entry.id.startsWith("volumetric-") ? "heavy" : "light");
  return cost === "heavy" ? "描画量: 多" : cost === "medium" ? "描画量: 中" : "描画量: 少";
}
