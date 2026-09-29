import type {
  Color3,
  MaterialExtensionSchemaRegistry,
} from "./asset-manifest";
import { MTOON_DEFAULTS } from "../../../packages/xrift-studio-runtime/src/mtoon-contract";

/**
 * Single source of truth for the material extensions the editor
 * authors. Patch application, deep cloning, glTF import, document validation
 * and the Inspector sections all derive from this table.
 *
 * Adding an extension is a table entry plus the two typed interfaces in
 * `asset-manifest.ts`; nothing else re-enumerates the extension list.
 */

export type MaterialExtensionName = keyof MaterialExtensionSchemaRegistry;

/**
 * Value shapes the extensions use. Each kind fixes both the accepted range
 * and the glTF default, so validation, patching and import agree by
 * construction.
 */
export type MaterialExtensionFieldDescriptor =
  /** Finite number in [0, 1]. */
  | { readonly kind: "unit"; readonly name: string; readonly default: number }
  /** Finite number >= 0. */
  | { readonly kind: "nonNegative"; readonly name: string; readonly default: number }
  /** Any finite number (radians and similar). */
  | { readonly kind: "finite"; readonly name: string; readonly default: number }
  /** Finite number >= 1. */
  | { readonly kind: "atLeastOne"; readonly name: string; readonly default: number }
  /** 0 (legacy dielectric mode) or a finite number >= 1. */
  | { readonly kind: "ior"; readonly name: string; readonly default: number }
  /** Optional finite number > 0; omission means infinity. */
  | { readonly kind: "positiveOptional"; readonly name: string }
  /** Three numbers in [0, 1]. */
  | { readonly kind: "unitColor3"; readonly name: string; readonly default: Color3 }
  /** Three finite numbers >= 0; the extension permits HDR values above 1. */
  | { readonly kind: "nonNegativeColor3"; readonly name: string; readonly default: Color3 }
  /** Boolean setting. */
  | { readonly kind: "boolean"; readonly name: string; readonly default: boolean }
  /** String enumeration; required fields must be present in saved documents. */
  | { readonly kind: "enum"; readonly name: string; readonly values: readonly string[]; readonly default: string; readonly required?: boolean }
  /** Integer in the declared inclusive range. */
  | { readonly kind: "integer"; readonly name: string; readonly minimum: number; readonly maximum: number; readonly default: number }
  /** Optional, explicitly supported Boolean import metadata. */
  | { readonly kind: "booleanRecord"; readonly name: string; readonly keys: readonly string[] }
  /** `MaterialTextureInfo`. */
  | { readonly kind: "texture"; readonly name: string }
  /** `NormalTextureInfo` (adds `scale`). */
  | { readonly kind: "normalTexture"; readonly name: string };

export type MaterialExtensionDescriptor = {
  /**
   * Declaration order is the emission order of the produced object, so it
   * matches the field order of the corresponding interface.
   */
  readonly fields: readonly MaterialExtensionFieldDescriptor[];
  /** Extensions glTF requires to be present alongside this one. */
  readonly requires?: readonly MaterialExtensionName[];
  /** Replaces lit shading; conflicts except where fallback coexistence is declared. */
  readonly exclusive?: boolean;
  /** Allowed alongside an exclusive shading extension as a fallback. */
  readonly compatibleWithUnlit?: boolean;
  /** UI names follow glTF; Japanese explanations are presentation-only metadata. */
  readonly label: string;
  readonly reading: string;
};

export const MATERIAL_EXTENSION_DESCRIPTORS: Readonly<
  Record<MaterialExtensionName, MaterialExtensionDescriptor>
> = {
  KHR_materials_anisotropy: {
    label: "Anisotropy",
    reading: "異方性反射",
    fields: [
      { kind: "unit", name: "anisotropyStrength", default: 0 },
      { kind: "finite", name: "anisotropyRotation", default: 0 },
      { kind: "texture", name: "anisotropyTexture" },
    ],
  },
  KHR_materials_clearcoat: {
    label: "Clearcoat",
    reading: "透明な上塗り",
    fields: [
      { kind: "unit", name: "clearcoatFactor", default: 0 },
      { kind: "texture", name: "clearcoatTexture" },
      { kind: "unit", name: "clearcoatRoughnessFactor", default: 0 },
      { kind: "texture", name: "clearcoatRoughnessTexture" },
      { kind: "normalTexture", name: "clearcoatNormalTexture" },
    ],
  },
  KHR_materials_dispersion: {
    label: "Dispersion",
    reading: "光の分散",
    requires: ["KHR_materials_volume"],
    fields: [{ kind: "nonNegative", name: "dispersion", default: 0 }],
  },
  KHR_materials_emissive_strength: {
    label: "Emissive Strength",
    reading: "発光の強さ",
    fields: [{ kind: "nonNegative", name: "emissiveStrength", default: 1 }],
  },
  KHR_materials_ior: {
    label: "IOR",
    reading: "屈折率",
    fields: [{ kind: "ior", name: "ior", default: 1.5 }],
  },
  KHR_materials_iridescence: {
    label: "Iridescence",
    reading: "薄膜の虹色反射",
    fields: [
      { kind: "unit", name: "iridescenceFactor", default: 0 },
      { kind: "texture", name: "iridescenceTexture" },
      { kind: "atLeastOne", name: "iridescenceIor", default: 1.3 },
      // A descending range is explicitly valid, so both ends are plain
      // non-negative numbers with no cross-field ordering rule.
      { kind: "nonNegative", name: "iridescenceThicknessMinimum", default: 100 },
      { kind: "nonNegative", name: "iridescenceThicknessMaximum", default: 400 },
      { kind: "texture", name: "iridescenceThicknessTexture" },
    ],
  },
  KHR_materials_sheen: {
    label: "Sheen",
    reading: "布の光沢",
    fields: [
      { kind: "unitColor3", name: "sheenColorFactor", default: [0, 0, 0] },
      { kind: "texture", name: "sheenColorTexture" },
      { kind: "unit", name: "sheenRoughnessFactor", default: 0 },
      { kind: "texture", name: "sheenRoughnessTexture" },
    ],
  },
  KHR_materials_specular: {
    label: "Specular",
    reading: "鏡面反射",
    fields: [
      { kind: "unit", name: "specularFactor", default: 1 },
      { kind: "texture", name: "specularTexture" },
      {
        kind: "nonNegativeColor3",
        name: "specularColorFactor",
        default: [1, 1, 1],
      },
      { kind: "texture", name: "specularColorTexture" },
    ],
  },
  KHR_materials_transmission: {
    label: "Transmission",
    reading: "光の透過",
    fields: [
      { kind: "unit", name: "transmissionFactor", default: 0 },
      { kind: "texture", name: "transmissionTexture" },
    ],
  },
  KHR_materials_unlit: {
    label: "Unlit",
    reading: "照明の影響なし",
    exclusive: true,
    fields: [],
  },
  KHR_materials_volume: {
    label: "Volume",
    reading: "材質の厚み",
    requires: ["KHR_materials_transmission"],
    fields: [
      { kind: "nonNegative", name: "thicknessFactor", default: 0 },
      { kind: "texture", name: "thicknessTexture" },
      { kind: "positiveOptional", name: "attenuationDistance" },
      { kind: "unitColor3", name: "attenuationColor", default: [1, 1, 1] },
    ],
  },
  VRMC_materials_mtoon: {
    label: "MToon",
    reading: "アニメ調の陰影",
    // The VRMC specification explicitly permits an Unlit fallback. MToon
    // takes precedence while its settings and that fallback both round-trip.
    compatibleWithUnlit: true,
    fields: [
      { kind: "enum", name: "specVersion", values: ["1.0"], default: MTOON_DEFAULTS.specVersion, required: true },
      { kind: "boolean", name: "transparentWithZWrite", default: MTOON_DEFAULTS.transparentWithZWrite },
      { kind: "integer", name: "renderQueueOffsetNumber", minimum: -9, maximum: 9, default: MTOON_DEFAULTS.renderQueueOffsetNumber },
      { kind: "unitColor3", name: "shadeColorFactor", default: MTOON_DEFAULTS.shadeColorFactor },
      { kind: "texture", name: "shadeMultiplyTexture" },
      { kind: "finite", name: "shadingShiftFactor", default: MTOON_DEFAULTS.shadingShiftFactor },
      { kind: "normalTexture", name: "shadingShiftTexture" },
      { kind: "unit", name: "shadingToonyFactor", default: MTOON_DEFAULTS.shadingToonyFactor },
      { kind: "unit", name: "giEqualizationFactor", default: MTOON_DEFAULTS.giEqualizationFactor },
      { kind: "unitColor3", name: "matcapFactor", default: MTOON_DEFAULTS.matcapFactor },
      { kind: "texture", name: "matcapTexture" },
      { kind: "unitColor3", name: "parametricRimColorFactor", default: MTOON_DEFAULTS.parametricRimColorFactor },
      { kind: "texture", name: "rimMultiplyTexture" },
      { kind: "unit", name: "rimLightingMixFactor", default: MTOON_DEFAULTS.rimLightingMixFactor },
      { kind: "nonNegative", name: "parametricRimFresnelPowerFactor", default: MTOON_DEFAULTS.parametricRimFresnelPowerFactor },
      { kind: "finite", name: "parametricRimLiftFactor", default: MTOON_DEFAULTS.parametricRimLiftFactor },
      { kind: "enum", name: "outlineWidthMode", values: ["none", "worldCoordinates", "screenCoordinates"], default: MTOON_DEFAULTS.outlineWidthMode },
      { kind: "nonNegative", name: "outlineWidthFactor", default: MTOON_DEFAULTS.outlineWidthFactor },
      { kind: "texture", name: "outlineWidthMultiplyTexture" },
      { kind: "unitColor3", name: "outlineColorFactor", default: MTOON_DEFAULTS.outlineColorFactor },
      { kind: "unit", name: "outlineLightingMixFactor", default: MTOON_DEFAULTS.outlineLightingMixFactor },
      { kind: "texture", name: "uvAnimationMaskTexture" },
      { kind: "finite", name: "uvAnimationScrollXSpeedFactor", default: MTOON_DEFAULTS.uvAnimationScrollXSpeedFactor },
      { kind: "finite", name: "uvAnimationScrollYSpeedFactor", default: MTOON_DEFAULTS.uvAnimationScrollYSpeedFactor },
      { kind: "finite", name: "uvAnimationRotationSpeedFactor", default: MTOON_DEFAULTS.uvAnimationRotationSpeedFactor },
      { kind: "booleanRecord", name: "extras", keys: ["xriftVrm0CompatShade"] },
    ],
  },
};
/** Stable iteration order for every table-driven pass. */
export const MATERIAL_EXTENSION_NAMES = Object.keys(
  MATERIAL_EXTENSION_DESCRIPTORS,
) as readonly MaterialExtensionName[];

/** Extensions that participate in the lit shading model. */
export const LIT_MATERIAL_EXTENSION_NAMES = MATERIAL_EXTENSION_NAMES.filter(
  (name) => MATERIAL_EXTENSION_DESCRIPTORS[name].exclusive !== true,
);

/**
 * Extensions three can only express through `MeshPhysicalMaterial`.
 *
 * Emissive strength is the one lit extension that is not here: it lands on
 * `emissiveIntensity`, which `MeshStandardMaterial` already has, so a glowing
 * Material does not have to pay for the physical shader. Every surface that
 * renders a Material — the viewport, the Asset preview, the recipe cards and
 * the compiler — picks its shading model from this one list, so a Material
 * cannot look physical in one of them and flat in another.
 */
export const PHYSICAL_MATERIAL_EXTENSION_NAMES =
  LIT_MATERIAL_EXTENSION_NAMES.filter(
    (name) => name !== "KHR_materials_emissive_strength" && name !== "VRMC_materials_mtoon",
  );

export function isMaterialExtensionName(
  value: string,
): value is MaterialExtensionName {
  return Object.prototype.hasOwnProperty.call(
    MATERIAL_EXTENSION_DESCRIPTORS,
    value,
  );
}

/** Field names an extension object may carry, for `validateKnownKeys`. */
export function materialExtensionFieldNames(
  name: MaterialExtensionName,
): readonly string[] {
  return MATERIAL_EXTENSION_DESCRIPTORS[name].fields.map(
    (field) => field.name,
  );
}

export type MaterialExtensionDropReason = "dependency" | "unlit-conflict";

/**
 * Removes entries whose declared dependencies are unmet and, when an
 * exclusive extension is present, everything it conflicts with. Runs to a
 * fixed point so a chain (dispersion -> volume -> transmission) collapses in
 * one call.
 */
export function pruneMaterialExtensions<Value>(
  present: Readonly<Partial<Record<MaterialExtensionName, Value>>>,
  onDrop?: (
    name: MaterialExtensionName,
    reason: MaterialExtensionDropReason,
  ) => void,
): Partial<Record<MaterialExtensionName, Value>> {
  const result: Partial<Record<MaterialExtensionName, Value>> = { ...present };

  const exclusive = MATERIAL_EXTENSION_NAMES.find(
    (name) =>
      MATERIAL_EXTENSION_DESCRIPTORS[name].exclusive === true &&
      result[name] !== undefined,
  );
  if (exclusive) {
    for (const name of MATERIAL_EXTENSION_NAMES) {
      if (name === exclusive || result[name] === undefined || MATERIAL_EXTENSION_DESCRIPTORS[name].compatibleWithUnlit) continue;
      delete result[name];
      onDrop?.(name, "unlit-conflict");
    }
    return result;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of MATERIAL_EXTENSION_NAMES) {
      if (result[name] === undefined) continue;
      const requires = MATERIAL_EXTENSION_DESCRIPTORS[name].requires ?? [];
      if (requires.every((required) => result[required] !== undefined)) continue;
      delete result[name];
      onDrop?.(name, "dependency");
      changed = true;
    }
  }
  return result;
}
