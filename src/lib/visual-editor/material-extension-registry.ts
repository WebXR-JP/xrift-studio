import type {
  Color3,
  MaterialExtensionSchemaRegistry,
} from "./asset-manifest";

/**
 * Single source of truth for the KHR_materials_* extensions the editor
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
  /** Replaces the lit shading model and cannot be combined with any other. */
  readonly exclusive?: boolean;
  /** Inspector section title. */
  readonly label: string;
};

export const MATERIAL_EXTENSION_DESCRIPTORS: Readonly<
  Record<MaterialExtensionName, MaterialExtensionDescriptor>
> = {
  KHR_materials_anisotropy: {
    label: "Anisotropy",
    fields: [
      { kind: "unit", name: "anisotropyStrength", default: 0 },
      { kind: "finite", name: "anisotropyRotation", default: 0 },
      { kind: "texture", name: "anisotropyTexture" },
    ],
  },
  KHR_materials_clearcoat: {
    label: "Clearcoat",
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
    requires: ["KHR_materials_volume"],
    fields: [{ kind: "nonNegative", name: "dispersion", default: 0 }],
  },
  KHR_materials_emissive_strength: {
    label: "Emissive strength",
    fields: [{ kind: "nonNegative", name: "emissiveStrength", default: 1 }],
  },
  KHR_materials_ior: {
    label: "IOR",
    fields: [{ kind: "ior", name: "ior", default: 1.5 }],
  },
  KHR_materials_iridescence: {
    label: "Iridescence",
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
    fields: [
      { kind: "unitColor3", name: "sheenColorFactor", default: [0, 0, 0] },
      { kind: "texture", name: "sheenColorTexture" },
      { kind: "unit", name: "sheenRoughnessFactor", default: 0 },
      { kind: "texture", name: "sheenRoughnessTexture" },
    ],
  },
  KHR_materials_specular: {
    label: "Specular",
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
    fields: [
      { kind: "unit", name: "transmissionFactor", default: 0 },
      { kind: "texture", name: "transmissionTexture" },
    ],
  },
  KHR_materials_unlit: {
    label: "Unlit",
    exclusive: true,
    fields: [],
  },
  KHR_materials_volume: {
    label: "Volume",
    requires: ["KHR_materials_transmission"],
    fields: [
      { kind: "nonNegative", name: "thicknessFactor", default: 0 },
      { kind: "texture", name: "thicknessTexture" },
      { kind: "positiveOptional", name: "attenuationDistance" },
      { kind: "unitColor3", name: "attenuationColor", default: [1, 1, 1] },
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
    (name) => name !== "KHR_materials_emissive_strength",
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
      if (name === exclusive || result[name] === undefined) continue;
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
