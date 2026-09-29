/** JSON-safe VRMC_materials_mtoon 1.0 authoring settings. */
export type MToonMaterialSettings<TextureInfo = unknown> = {
  specVersion: "1.0";
  transparentWithZWrite: boolean;
  renderQueueOffsetNumber?: number;
  shadeColorFactor: [number, number, number];
  shadeMultiplyTexture?: TextureInfo;
  shadingShiftFactor: number;
  shadingShiftTexture?: TextureInfo & { scale?: number };
  shadingToonyFactor: number;
  giEqualizationFactor: number;
  matcapFactor?: [number, number, number];
  matcapTexture?: TextureInfo;
  parametricRimColorFactor?: [number, number, number];
  rimMultiplyTexture?: TextureInfo;
  rimLightingMixFactor?: number;
  parametricRimFresnelPowerFactor?: number;
  parametricRimLiftFactor?: number;
  outlineWidthMode: "none" | "worldCoordinates" | "screenCoordinates";
  outlineWidthFactor: number;
  outlineWidthMultiplyTexture?: TextureInfo;
  outlineColorFactor: [number, number, number];
  outlineLightingMixFactor: number;
  uvAnimationMaskTexture?: TextureInfo;
  uvAnimationScrollXSpeedFactor?: number;
  uvAnimationScrollYSpeedFactor?: number;
  uvAnimationRotationSpeedFactor?: number;
  /** Studio's MToon 0.x choice and VRM 0.x imports enable legacy shading; specVersion stays 1.0. */
  extras?: { xriftVrm0CompatShade?: boolean };
};

/** Defaults from the normative MToon 1.0 JSON schema. */
export const MTOON_DEFAULTS = Object.freeze({
  specVersion: "1.0",
  transparentWithZWrite: false,
  renderQueueOffsetNumber: 0,
  shadeColorFactor: [1, 1, 1] as [number, number, number],
  shadingShiftFactor: 0,
  shadingToonyFactor: 0.9,
  giEqualizationFactor: 0.9,
  matcapFactor: [1, 1, 1] as [number, number, number],
  parametricRimColorFactor: [0, 0, 0] as [number, number, number],
  rimLightingMixFactor: 1,
  parametricRimFresnelPowerFactor: 5,
  parametricRimLiftFactor: 0,
  outlineWidthMode: "none",
  outlineWidthFactor: 0,
  outlineColorFactor: [0, 0, 0] as [number, number, number],
  outlineLightingMixFactor: 1,
  uvAnimationScrollXSpeedFactor: 0,
  uvAnimationScrollYSpeedFactor: 0,
  uvAnimationRotationSpeedFactor: 0,
} satisfies MToonMaterialSettings);
