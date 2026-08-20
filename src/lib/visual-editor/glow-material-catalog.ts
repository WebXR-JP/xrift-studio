import {
  normalizeMaterialProperties,
  type MaterialAsset,
} from "./asset-manifest";
import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";

/**
 * Emissive Material presets that read as light once Bloom is on.
 *
 * These are ordinary PBR Materials, not custom shaders. An emissive factor
 * bright enough to clear the Bloom threshold is the whole mechanism, which is
 * why the shelf can offer lighting without adding a rendering path.
 */
export type GlowMaterialPreset = {
  id: string;
  label: string;
  description: string;
  /** sRGB hex used for both the base colour and the emissive factor. */
  tint: string;
};

export const GLOW_MATERIAL_PRESETS: readonly GlowMaterialPreset[] = [
  {
    id: "warm-white",
    label: "ウォームホワイト",
    description: "室内灯のような暖かい白。天井や壁面の間接照明に",
    tint: "#ffedd5",
  },
  {
    id: "cool-white",
    label: "クールホワイト",
    description: "白色灯のような青みのある白。作業空間や通路に",
    tint: "#e0f2fe",
  },
  {
    id: "signal-cyan",
    label: "シアン",
    description: "案内や装飾向けの寒色。暗い場所で強く目立つ",
    tint: "#67e8f9",
  },
  {
    id: "signal-magenta",
    label: "マゼンタ",
    description: "演出向けの暖色寄りのピンク。舞台や看板に",
    tint: "#f0abfc",
  },
];

/**
 * The shapes the glow shelf offers.
 *
 * Shape and colour are separate choices: a tube in warm white and a tube in
 * cyan are the same fixture, so pairing every shape with every tint would turn
 * four decisions into sixteen cards. The shelf lists shapes and lets the tint
 * be chosen alongside, the way the Terrain shelf lists terrains and lets the
 * grass be chosen.
 */
export type GlowFixtureShape = {
  id: string;
  label: string;
  description: string;
  /** Creation the shelf places, shared with the Create menu. */
  creationId: string;
  /** Preview geometry, matching the creation's primitive. */
  preview: "box" | "plane" | "cylinder" | "sphere";
  /** Preview scale, so a card shows the proportions the fixture is placed at. */
  previewScale: readonly [number, number, number];
  /** Tint the shape reads best in, used until the author picks another. */
  defaultTintId: string;
};

export const GLOW_FIXTURE_SHAPES: readonly GlowFixtureShape[] = [
  {
    id: "cube",
    label: "キューブ",
    description: "どこにでも置ける基本の発光体。手軽な間接照明として",
    creationId: BUILTIN_PRIMITIVE_CREATION_IDS.glowCube,
    preview: "box",
    previewScale: [1, 1, 1],
    defaultTintId: "warm-white",
  },
  {
    id: "panel",
    label: "パネル",
    description: "面で照らす板状の光。天井や壁に埋め込む面光源として",
    creationId: BUILTIN_PRIMITIVE_CREATION_IDS.glowPanel,
    preview: "plane",
    previewScale: [1.8, 1, 1],
    defaultTintId: "warm-white",
  },
  {
    id: "tube",
    label: "チューブ",
    description: "細長い蛍光灯のような光。通路や什器の縁に沿わせて",
    creationId: BUILTIN_PRIMITIVE_CREATION_IDS.glowTube,
    preview: "cylinder",
    previewScale: [0.09, 2.2, 0.09],
    defaultTintId: "cool-white",
  },
  {
    id: "bulb",
    label: "球",
    description: "電球のような点の光。ランプや吊り下げ照明の芯に",
    creationId: BUILTIN_PRIMITIVE_CREATION_IDS.glowBulb,
    preview: "sphere",
    previewScale: [0.5, 0.5, 0.5],
    defaultTintId: "warm-white",
  },
];

export function getGlowFixtureShape(
  shapeId: string,
): GlowFixtureShape | undefined {
  return GLOW_FIXTURE_SHAPES.find((shape) => shape.id === shapeId);
}

/** Rec. 709 relative luminance of an sRGB hex, in linear light. */
export function tintRelativeLuminance(tint: string): number {
  const [r, g, b] = tintToLinearRgb(tint);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function tintToLinearRgb(tint: string): [number, number, number] {
  const value = tint.replace("#", "");
  return [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/**
 * The round trip back from linear light to an sRGB hex.
 *
 * Anything that shows an authored colour in a `<input type="color">` needs
 * this: glTF factors and three.js colours are stored linear, and handing a
 * linear triple straight to the picker shows a washed-out swatch that does not
 * match what the author sees in the viewport.
 */
export function linearRgbToTint(rgb: readonly number[]): string {
  const channels = [0, 1, 2].map((index) => {
    const linear = Math.min(Math.max(rgb[index] ?? 0, 0), 1);
    const encoded =
      linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

/**
 * How far above the Bloom threshold a preset is placed.
 *
 * A tint is not free to be as bright as it looks: Bloom compares luminance, and
 * a saturated colour carries far less of it than white at the same emissive
 * strength. Deriving the strength per tint is what keeps a cyan cube from
 * arriving inert while a white one blooms — the alternative is a hand-tuned
 * number per preset that silently stops being right when the threshold moves.
 */
const BLOOM_HEADROOM = 1.5;

export function glowEmissiveStrength(
  tint: string,
  bloomThreshold = DEFAULT_SCENE_SETTINGS.postprocessing.bloom.threshold,
): number {
  const luminance = tintRelativeLuminance(tint);
  if (luminance <= 0) return bloomThreshold * BLOOM_HEADROOM;
  return Number(((bloomThreshold * BLOOM_HEADROOM) / luminance).toFixed(2));
}

export function getGlowMaterialPreset(
  presetId: string,
): GlowMaterialPreset | undefined {
  return GLOW_MATERIAL_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * The first preset is what Studio ships as a builtin, so the Create menu and
 * the store's warm white produce one Material rather than two that look alike.
 */
export const DEFAULT_GLOW_MATERIAL_PRESET = GLOW_MATERIAL_PRESETS[0];

export function glowMaterialAssetId(presetId: string): string {
  return presetId === DEFAULT_GLOW_MATERIAL_PRESET.id
    ? BUILTIN_ASSET_IDS.material.glow
    : `${BUILTIN_ASSET_IDS.material.glow}-${presetId}`;
}

export function createGlowMaterialAsset(
  preset: GlowMaterialPreset,
): MaterialAsset {
  return {
    id: glowMaterialAssetId(preset.id),
    name: `グロー / ${preset.label}`,
    kind: "material",
    status: "ready",
    source: { kind: "builtin", key: `material/glow/${preset.id}` },
    properties: normalizeMaterialProperties({
      color: preset.tint,
      // The emissive term carries the surface, so the PBR response only shows
      // where a scene light grazes it.
      metalness: 0,
      roughness: 1,
      emissiveFactor: tintToUnitRgb(preset.tint),
      extensions: {
        KHR_materials_emissive_strength: {
          emissiveStrength: glowEmissiveStrength(preset.tint),
        },
      },
    }),
  };
}

/** sRGB hex to the 0..1 triple `emissiveFactor` stores, without linearising. */
function tintToUnitRgb(tint: string): [number, number, number] {
  const value = tint.replace("#", "");
  return [0, 2, 4].map((offset) =>
    Number((parseInt(value.slice(offset, offset + 2), 16) / 255).toFixed(4)),
  ) as [number, number, number];
}
