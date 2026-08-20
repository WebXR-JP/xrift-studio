import {
  materialAlphaRenderProps,
  materialBlendingConstant,
  materialIsTransparent,
  materialWritesDepth,
  normalizeMaterialProperties,
  MATERIAL_BLEND_MODES,
} from "./asset-manifest";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Deterministic assertions for the Material alpha and blending contract. */
export function runMaterialAlphaFixtureAssertions(): void {
  // A new Material is opaque and blends normally, so nothing about the defaults
  // pushes a surface into the transparent pass it does not need.
  const base = normalizeMaterialProperties({});
  assert(base.blending === "normal", "A new Material does not blend normally");
  assert(base.depthWrite === "auto", "A new Material overrides depth write");
  assert(
    base.alphaToCoverage === false,
    "A new Material resolves cutouts through MSAA",
  );
  const opaque = materialAlphaRenderProps(base);
  assert(!opaque.transparent, "An opaque Material was sent to the blend pass");
  assert(opaque.depthWrite, "An opaque Material stopped writing depth");
  assert(opaque.alphaTest === 0, "An opaque Material clips fragments");

  // A blend mode other than normal only does anything in the transparent pass.
  // Drawn opaquely, an additive surface simply covers what is behind it, which
  // is the opposite of what the author asked for.
  for (const blending of MATERIAL_BLEND_MODES) {
    const properties = normalizeMaterialProperties({ blending });
    assert(
      properties.blending === blending,
      `Blend mode ${blending} did not survive normalization`,
    );
    assert(
      materialIsTransparent(properties) === (blending !== "normal"),
      `Blend mode ${blending} resolved to the wrong pass`,
    );
  }

  // MASK is the only mode that clips. A cutoff carried into BLEND would punch
  // holes the author never asked for.
  const masked = normalizeMaterialProperties({
    alphaMode: "MASK",
    alphaCutoff: 0.3,
  });
  assert(
    materialAlphaRenderProps(masked).alphaTest === 0.3,
    "A MASK Material did not clip at its cutoff",
  );
  const blended = normalizeMaterialProperties({
    alphaMode: "BLEND",
    alphaCutoff: 0.3,
  });
  assert(
    materialAlphaRenderProps(blended).alphaTest === 0,
    "A BLEND Material clipped at the MASK cutoff",
  );

  // Depth write: auto follows the alpha mode, and an explicit choice wins over
  // it — which is the whole reason the override exists.
  assert(
    materialWritesDepth({ alphaMode: "OPAQUE", depthWrite: "auto" }),
    "An opaque Material stopped writing depth on auto",
  );
  assert(
    !materialWritesDepth({ alphaMode: "BLEND", depthWrite: "auto" }),
    "A blended Material wrote depth on auto",
  );
  assert(
    materialWritesDepth({ alphaMode: "BLEND", depthWrite: "on" }),
    "An explicit depth write was ignored on a blended Material",
  );
  assert(
    !materialWritesDepth({ alphaMode: "OPAQUE", depthWrite: "off" }),
    "An explicit depth write was ignored on an opaque Material",
  );

  // The constant names are what both the editor lookup and the emitted world
  // are keyed on, so a rename here silently breaks one of them.
  assert(
    materialBlendingConstant("normal") === "NormalBlending" &&
      materialBlendingConstant("additive") === "AdditiveBlending" &&
      materialBlendingConstant("multiply") === "MultiplyBlending" &&
      materialBlendingConstant("subtractive") === "SubtractiveBlending",
    "A blend mode resolved to a three.js constant that does not exist",
  );

  // A Material saved before these fields existed still loads, and loads inert.
  const legacy = normalizeMaterialProperties({
    alphaMode: "BLEND",
  });
  assert(
    legacy.blending === "normal" && legacy.depthWrite === "auto",
    "A Material without the new fields did not fall back to inert values",
  );
}
