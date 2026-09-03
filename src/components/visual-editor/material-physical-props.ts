import { Color } from "three";

import type { Color3, MaterialProperties } from "../../lib/visual-editor/asset-manifest";
import { PHYSICAL_MATERIAL_EXTENSION_NAMES } from "../../lib/visual-editor/material-extension-registry";

/**
 * `MeshPhysicalMaterial` props for the `KHR_materials_*` extensions a Material
 * declares.
 *
 * The compiler already turns these extensions into the same props for the
 * published world, but the editor used to render primitives through
 * `MeshStandardMaterial`, which has no clearcoat, no transmission and no
 * iridescence. A glass Material therefore looked like white plastic while it
 * was being authored and like glass after publishing — the one place an author
 * cannot check. This module is the shared mapping, so the viewport, the Asset
 * preview and the shelf cards all resolve an extension the way the compiler
 * will.
 *
 * Values are the glTF defaults where the extension is absent, which is what
 * the extension registry declares.
 */
export type PhysicalMaterialExtensionProps = {
  anisotropy: number;
  anisotropyRotation: number;
  clearcoat: number;
  clearcoatRoughness: number;
  dispersion: number;
  ior: number;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThicknessRange: [number, number];
  sheen: number;
  sheenColor: Color;
  sheenRoughness: number;
  specularIntensity: number;
  specularColor: Color;
  transmission: number;
  thickness: number;
  attenuationColor: Color;
  attenuationDistance: number;
};

function toColor(value: Color3 | undefined, fallback: Color3): Color {
  const source = value ?? fallback;
  return new Color(source[0], source[1], source[2]);
}

/**
 * True when the Material needs the physical shading model.
 *
 * Unlit is excluded by construction: it replaces the shading model rather than
 * extending it, and the caller renders `MeshBasicMaterial` for it instead.
 */
export function usesPhysicalMaterial(
  properties: MaterialProperties | undefined,
): boolean {
  if (!properties) return false;
  return PHYSICAL_MATERIAL_EXTENSION_NAMES.some(
    (name) => properties.extensions[name] !== undefined,
  );
}

/** True when the Material replaces lighting entirely. */
export function isUnlitMaterial(
  properties: MaterialProperties | undefined,
): boolean {
  return properties?.extensions.KHR_materials_unlit !== undefined;
}

export function physicalMaterialExtensionProps(
  properties: MaterialProperties | undefined,
): PhysicalMaterialExtensionProps {
  const extensions = properties?.extensions ?? {};
  const anisotropy = extensions.KHR_materials_anisotropy;
  const clearcoat = extensions.KHR_materials_clearcoat;
  const dispersion = extensions.KHR_materials_dispersion;
  const ior = extensions.KHR_materials_ior;
  const iridescence = extensions.KHR_materials_iridescence;
  const sheen = extensions.KHR_materials_sheen;
  const specular = extensions.KHR_materials_specular;
  const transmission = extensions.KHR_materials_transmission;
  const volume = extensions.KHR_materials_volume;

  return {
    anisotropy: anisotropy?.anisotropyStrength ?? 0,
    anisotropyRotation: anisotropy?.anisotropyRotation ?? 0,
    clearcoat: clearcoat?.clearcoatFactor ?? 0,
    clearcoatRoughness: clearcoat?.clearcoatRoughnessFactor ?? 0,
    dispersion: dispersion?.dispersion ?? 0,
    // glTF's legacy 0 means "no Fresnel at all"; three expresses that as a
    // very large IOR, which is the path GLTFLoader documents.
    ior: ior?.ior === 0 ? 1000 : (ior?.ior ?? 1.5),
    iridescence: iridescence?.iridescenceFactor ?? 0,
    iridescenceIOR: iridescence?.iridescenceIor ?? 1.3,
    iridescenceThicknessRange: [
      iridescence?.iridescenceThicknessMinimum ?? 100,
      iridescence?.iridescenceThicknessMaximum ?? 400,
    ],
    // The extension's own strength lives in the colour, so presence is the
    // only thing the scalar carries.
    sheen: sheen ? 1 : 0,
    sheenColor: toColor(sheen?.sheenColorFactor, [0, 0, 0]),
    sheenRoughness: sheen?.sheenRoughnessFactor ?? 0,
    specularIntensity: specular?.specularFactor ?? 1,
    specularColor: toColor(specular?.specularColorFactor, [1, 1, 1]),
    transmission: transmission?.transmissionFactor ?? 0,
    thickness: volume?.thicknessFactor ?? 0,
    attenuationColor: toColor(volume?.attenuationColor, [1, 1, 1]),
    // Omitted in glTF means no attenuation at any depth. Passing it explicitly
    // rather than leaving the prop off matters here: three keeps whatever the
    // material last held, and a re-used material would carry the previous
    // Material's tint.
    attenuationDistance: volume?.attenuationDistance ?? Infinity,
  };
}
