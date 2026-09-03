import {
  normalizeMaterialProperties,
  type Color3,
  type MaterialAsset,
  type MaterialAssetPatch,
  type MaterialExtensionsPatch,
} from "./asset-manifest";

/**
 * Materials that exist to show what one glTF material extension does.
 *
 * The editor has authored `KHR_materials_*` since the Inspector gained the
 * sections, and the compiler emits every one of them, but nothing in the app
 * ships a Material that actually uses one. An author who has never seen
 * clearcoat or dispersion has no way to find out what the sliders are for:
 * the values are all defaults, and a default clearcoat of 0 looks exactly like
 * no clearcoat at all.
 *
 * Each entry below is a material somebody would really build -- car paint,
 * brushed steel, a bottle, velvet -- rather than a test sphere. They are not
 * seeded into new projects; the 見本 sets in `scene-recipe-catalog.ts` bring
 * the ones they place, so the Asset panel stays as short as it was.
 *
 * ## Why most entries come in pairs
 *
 * An extension is only legible next to its own absence. Clearcoat on a red
 * sphere is "a red sphere" until the sphere without it is standing next to it,
 * and dispersion is invisible in a still frame unless something identical
 * refracts without splitting. So an entry may declare `baselineName`, and this
 * module derives a second Material with the same base PBR values and the
 * extension removed. The pair differs in exactly one thing, which is the thing
 * being shown.
 */
export type MaterialShowcaseDefinition = {
  /** Stable key; the Asset ids are derived from it. */
  key: string;
  name: string;
  /** The extension this entry exists to show, for the Inspector hint. */
  extensionLabel: string;
  /** Core PBR the pair shares. Only `extensions` differs between the two. */
  base: MaterialShowcaseBase;
  extensions: MaterialExtensionsPatch;
  /**
   * Name of the derived comparison Material. Omitted for entries that are
   * themselves a comparison (three IOR values, a second use of iridescence),
   * where a fourth object with nothing on it would only add clutter.
   */
  baselineName?: string;
  /**
   * Extensions the comparison keeps.
   *
   * Dispersion needs transmission and volume to be visible at all, so its
   * baseline is "the same glass without dispersion" rather than "no glass".
   * Empty by default, which is right for the entries whose extension is the
   * only one they carry.
   */
  baselineExtensions?: MaterialExtensionsPatch;
};

export type MaterialShowcaseBase = {
  color: string;
  metalness: number;
  roughness: number;
  emissiveFactor?: Color3;
};

const ID_PREFIX = "builtin-material-showcase-";

/** Asset id of the Material that carries the extension. */
export function materialShowcaseAssetId(key: string): string {
  return `${ID_PREFIX}${key}`;
}

/** Asset id of the derived comparison Material. */
export function materialShowcaseBaselineAssetId(key: string): string {
  return `${ID_PREFIX}${key}-plain`;
}

/**
 * Radians. A brushed surface is turned by the UV of what it is on, so the
 * grain direction lives with the Material rather than with each set.
 */
const QUARTER_TURN = 1.5708;

export const MATERIAL_SHOWCASE_DEFINITIONS: readonly MaterialShowcaseDefinition[] =
  [
    {
      key: "car-paint",
      name: "カーペイント",
      extensionLabel: "KHR_materials_clearcoat",
      // Metallic flake under a clear lacquer. The base is deliberately close
      // to a matte wrap: clearcoat reads as a second, sharper highlight
      // sitting on top of a duller one, and a base that is already glossy
      // leaves the new highlight nothing to stand out against.
      base: { color: "#9e1b2f", metalness: 0.9, roughness: 0.55 },
      extensions: {
        KHR_materials_clearcoat: {
          clearcoatFactor: 1,
          clearcoatRoughnessFactor: 0.04,
        },
      },
      baselineName: "カーペイント（クリアコートなし）",
    },
    {
      key: "brushed-metal",
      name: "ヘアライン金属",
      extensionLabel: "KHR_materials_anisotropy",
      base: { color: "#c9ced6", metalness: 1, roughness: 0.34 },
      extensions: {
        KHR_materials_anisotropy: {
          anisotropyStrength: 0.9,
          // Across the UV's U direction, which runs around a cylinder -- the
          // way a steel bottle or a saucepan is actually finished.
          anisotropyRotation: QUARTER_TURN,
        },
      },
      baselineName: "ヘアライン金属（異方性なし）",
    },
    {
      key: "clear-glass",
      name: "クリアガラス",
      extensionLabel: "KHR_materials_transmission",
      base: { color: "#ffffff", metalness: 0, roughness: 0.05 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.5 },
      },
      baselineName: "クリアガラス（透過なし）",
    },
    {
      key: "bottle-glass",
      name: "ボトルガラス",
      extensionLabel: "KHR_materials_volume",
      base: { color: "#ffffff", metalness: 0, roughness: 0.08 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.5 },
        KHR_materials_volume: {
          thicknessFactor: 0.7,
          attenuationColor: [0.24, 0.62, 0.36],
          // Metres of glass the light travels before it is fully tinted. Short
          // enough that the thick part of a bottle goes deep green while the
          // thin wall stays pale, which is the whole point of the extension.
          attenuationDistance: 0.28,
        },
      },
      baselineName: "ボトルガラス（厚みなし）",
      baselineExtensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.5 },
      },
    },
    {
      key: "crystal",
      name: "クリスタル",
      extensionLabel: "KHR_materials_dispersion",
      base: { color: "#ffffff", metalness: 0, roughness: 0 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.75 },
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
        // glTF states dispersion as 20 / Abbe number, so 0.9 is around Abbe
        // 22: dense flint, the glass a prism and a chandelier drop are cut
        // from and the reason those throw colour rather than white light.
        // Ordinary window glass is around 0.34 and separates too little to
        // see on a sphere this size.
        KHR_materials_dispersion: { dispersion: 0.9 },
      },
      baselineName: "クリスタル（分散なし）",
      baselineExtensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.75 },
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
      },
    },
    {
      key: "soap-bubble",
      name: "シャボン玉",
      extensionLabel: "KHR_materials_iridescence",
      base: { color: "#ffffff", metalness: 0, roughness: 0.02 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.33 },
        KHR_materials_iridescence: {
          iridescenceFactor: 1,
          iridescenceIor: 1.33,
          // Nanometres. A soap film thins as it drains, so the range is wide
          // and the colour bands sweep across the surface instead of sitting
          // on one hue.
          iridescenceThicknessMinimum: 200,
          iridescenceThicknessMaximum: 800,
        },
      },
    },
    {
      key: "beetle-paint",
      name: "玉虫塗装",
      extensionLabel: "KHR_materials_iridescence",
      // The other half of iridescence: an opaque film over a dark base, which
      // is how a beetle shell, an anodised part and a pearl paint all work.
      // Kept a dielectric rather than a metal on purpose. Iridescence colours
      // the specular reflection, and full metal has no reflection at all
      // without an environment map -- on a scene with no Skybox that reads as
      // a black shape, which is the opposite of a demonstration.
      base: { color: "#0d1524", metalness: 0.1, roughness: 0.16 },
      extensions: {
        KHR_materials_iridescence: {
          iridescenceFactor: 1,
          iridescenceIor: 2,
          iridescenceThicknessMinimum: 100,
          iridescenceThicknessMaximum: 520,
        },
      },
      baselineName: "玉虫塗装（虹色なし）",
    },
    {
      key: "velvet",
      name: "ベルベット",
      extensionLabel: "KHR_materials_sheen",
      base: { color: "#3b1d4d", metalness: 0, roughness: 0.85 },
      extensions: {
        KHR_materials_sheen: {
          sheenColorFactor: [0.85, 0.62, 0.95],
          sheenRoughnessFactor: 0.28,
        },
      },
      baselineName: "ベルベット（シーンなし）",
    },
    {
      key: "matte-coat",
      name: "マット塗装",
      extensionLabel: "KHR_materials_specular",
      // Glossy rather than rough on purpose: the extension scales the
      // reflection, so a surface too rough to reflect anything shows the same
      // black either way and the pair stops being a comparison.
      base: { color: "#1b1e24", metalness: 0, roughness: 0.28 },
      extensions: {
        // Dielectrics reflect about 4% no matter how rough they are, and on a
        // dark prop that 4% is what stops it reading as black. Turning it down
        // is what the extension is for: matte camera bodies, blackout cloth,
        // stage flats.
        KHR_materials_specular: {
          specularFactor: 0.08,
          specularColorFactor: [1, 1, 1],
        },
      },
      baselineName: "マット塗装（スペキュラーそのまま）",
    },
    {
      key: "gold-coat",
      name: "金コーティング",
      extensionLabel: "KHR_materials_specular",
      // The other half of the extension: keep the strength, tint the colour.
      // A dielectric whose reflection is warm without the base going metal.
      base: { color: "#20242c", metalness: 0, roughness: 0.18 },
      extensions: {
        KHR_materials_specular: {
          specularFactor: 1,
          specularColorFactor: [1, 0.78, 0.42],
        },
      },
    },
    {
      key: "neon-tube",
      name: "ネオン管",
      extensionLabel: "KHR_materials_emissive_strength",
      base: {
        color: "#1a0c16",
        metalness: 0,
        roughness: 0.4,
        emissiveFactor: [1, 0.22, 0.55],
      },
      extensions: {
        // glTF caps `emissiveFactor` at 1, so a tube that is meant to be
        // brighter than the wall behind it needs the multiplier. This is also
        // what decides whether Bloom picks the surface up.
        KHR_materials_emissive_strength: { emissiveStrength: 8 },
      },
      baselineName: "ネオン管（強度1）",
    },
    // Three solids that differ in nothing but `ior`.
    //
    // All three carry a volume. Transmission with no thickness is the
    // thin-walled case -- a window pane, a drinking glass -- and a thin wall
    // barely bends anything no matter what its IOR is, so a comparison built
    // on one would show three identical spheres.
    {
      key: "water-ior",
      name: "水（屈折率 1.33）",
      extensionLabel: "KHR_materials_ior",
      base: { color: "#ffffff", metalness: 0, roughness: 0.04 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.33 },
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
      },
    },
    {
      key: "glass-ior",
      name: "ガラス（屈折率 1.5）",
      extensionLabel: "KHR_materials_ior",
      base: { color: "#ffffff", metalness: 0, roughness: 0.04 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 1.5 },
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
      },
    },
    {
      key: "diamond-ior",
      name: "ダイヤモンド（屈折率 2.42）",
      extensionLabel: "KHR_materials_ior",
      base: { color: "#ffffff", metalness: 0, roughness: 0.02 },
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_ior: { ior: 2.42 },
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
      },
    },
    {
      key: "unlit-sign",
      name: "アンリット看板",
      extensionLabel: "KHR_materials_unlit",
      base: { color: "#e8ecf2", metalness: 0, roughness: 1 },
      // Unlit replaces the shading model, so it is the one extension that
      // cannot be combined with anything. The pair shows what that costs: the
      // lit half takes the scene's light and shadow, the unlit half does not.
      extensions: { KHR_materials_unlit: {} },
      baselineName: "アンリット看板（ライティングあり）",
    },
  ];

function createShowcaseMaterial(
  id: string,
  name: string,
  key: string,
  base: MaterialShowcaseBase,
  extensions: MaterialExtensionsPatch,
): MaterialAsset {
  const patch: MaterialAssetPatch = {
    color: base.color,
    metalness: base.metalness,
    roughness: base.roughness,
    ...(base.emissiveFactor ? { emissiveFactor: base.emissiveFactor } : {}),
    extensions,
  };
  return {
    id,
    name,
    kind: "material",
    status: "ready",
    source: { kind: "builtin", key: `material/showcase/${key}` },
    properties: normalizeMaterialProperties(patch),
  };
}

/**
 * Every showcase Material, extension-carrying and comparison alike.
 *
 * Resolved on demand by `ensureBuiltinMaterialAsset` rather than seeded, so a
 * project only ever holds the ones a placed 見本 actually uses.
 */
export const MATERIAL_SHOWCASE_ASSETS: readonly MaterialAsset[] =
  MATERIAL_SHOWCASE_DEFINITIONS.flatMap((definition) => {
    const primary = createShowcaseMaterial(
      materialShowcaseAssetId(definition.key),
      definition.name,
      definition.key,
      definition.base,
      definition.extensions,
    );
    if (!definition.baselineName) return [primary];
    return [
      primary,
      createShowcaseMaterial(
        materialShowcaseBaselineAssetId(definition.key),
        definition.baselineName,
        `${definition.key}-plain`,
        definition.base,
        definition.baselineExtensions ?? {},
      ),
    ];
  });

export function getMaterialShowcaseAsset(
  assetId: string,
): MaterialAsset | undefined {
  return MATERIAL_SHOWCASE_ASSETS.find((asset) => asset.id === assetId);
}

export function getMaterialShowcaseDefinition(
  key: string,
): MaterialShowcaseDefinition | undefined {
  return MATERIAL_SHOWCASE_DEFINITIONS.find(
    (definition) => definition.key === key,
  );
}
