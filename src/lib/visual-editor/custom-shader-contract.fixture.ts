import {
  MATERIAL_BLEND_MODES,
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type AssetManifest,
  type MaterialAsset,
  type TextureAsset,
} from "./asset-manifest";
import {
  CLASSIC_SHADER_BLEND_MODES,
  CLASSIC_SHADER_LIMITS,
  createDefaultCustomShader,
  isClassicR3fMaterialShader,
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
  type ClassicR3fShaderUniform,
  type ClassicR3fShaderVariant,
} from "./custom-shader-contract";
import {
  classicShaderTextureFormat,
  findClassicShaderTextureIssues,
} from "./custom-shader-textures";
import { collectHierarchyAssetReferences } from "./hierarchy-transfer";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import { assetManifestCodec, stableSerializeJson } from "./serialization";

const BASE_VARIANT: ClassicR3fShaderVariant = {
  name: "default",
  defines: {},
  side: "front",
  transparent: false,
  depthWrite: true,
};

function shaderWith(
  patch: Partial<ClassicR3fMaterialShader>,
): ClassicR3fMaterialShader {
  return { ...createDefaultCustomShader(), ...patch };
}

function texture(
  id: string,
  relativePath: string,
  patch: Partial<TextureAsset> = {},
): TextureAsset {
  return {
    id,
    name: id,
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath },
    importSettings: normalizeTextureImportSettings(),
    ...patch,
  };
}

/**
 * The Custom Shader descriptor as a document: what is accepted, what is
 * refused and why, and that it survives a save.
 */
export function runCustomShaderContractFixtureAssertions(): void {
  assertOldDescriptorsStayValid();
  assertNewFieldsAreValidated();
  assertEveryRefusalHasAReason();
  assertTextureSourcesAreChecked();
  assertDescriptorsSurviveSaving();
}

function assertOldDescriptorsStayValid(): void {
  const starter = createDefaultCustomShader();
  assert(
    validateClassicR3fMaterialShader(starter).length === 0 &&
      isClassicR3fMaterialShader(starter),
    "the starter shader must stay valid",
  );
  // A descriptor as v1.0.20 saved it, with every option it knew.
  const saved: unknown = JSON.parse(
    JSON.stringify({
      kind: "classic-r3f",
      sourceModulePath: "src/components/Town.tsx",
      vertexShader: "void main() { gl_Position = vec4(position, 1.0); }",
      fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
      uniforms: {
        uMap: {
          kind: "texture",
          textureAssetId: "texture-town",
          colorSpace: "linear",
          generateMipmaps: false,
          filter: "nearest",
          wrapS: "repeat",
          wrapT: "clamp-to-edge",
        },
        uTime: { kind: "number", value: 0 },
        uTint: { kind: "color", value: "#A0b1C2" },
        uScale: { kind: "vector", value: [1, 2, 3, 4] },
      },
      variants: [
        {
          name: "water",
          meshNameIncludes: "Water",
          defines: { WATER: "" },
          side: "double",
          transparent: true,
          depthWrite: false,
        },
        { ...BASE_VARIANT, side: "back" },
      ],
      animatedTimeUniform: "uTime",
      sourceModelAssetId: "model-town",
      vertexShaderAssetId: "shader-vertex",
      fragmentShaderAssetId: "shader-fragment",
      // A key this version does not know must not make the document invalid.
      futureField: true,
    }),
  );
  assert(
    isClassicR3fMaterialShader(saved),
    `a descriptor saved by an older version must stay valid: ${validateClassicR3fMaterialShader(saved).join(" / ")}`,
  );
  assert(
    JSON.stringify(CLASSIC_SHADER_BLEND_MODES) ===
      JSON.stringify(MATERIAL_BLEND_MODES),
    "a variant's blending must take exactly the values an ordinary Material does",
  );
}

function assertNewFieldsAreValidated(): void {
  const accepted: Record<string, ClassicR3fShaderUniform> = {
    uNormalMatrix: { kind: "matrix", value: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
    uProjector: { kind: "matrix", value: Array.from({ length: 16 }, () => 0.5) },
    uWeights: { kind: "array", value: [0.25] },
    uPalette: {
      kind: "array",
      value: Array.from({ length: CLASSIC_SHADER_LIMITS.arrayLength }, () => 1),
    },
    uLut: {
      kind: "texture-3d",
      textureAssetId: "texture-lut",
      slices: 32,
      colorSpace: "srgb",
      filter: "linear",
      wrapS: "clamp-to-edge",
      wrapT: "clamp-to-edge",
      wrapR: "repeat",
    },
    uLutAuto: { kind: "texture-3d", textureAssetId: "texture-lut" },
    uSky: {
      kind: "texture-cube",
      faces: Array.from({ length: 6 }, (_, face) => ({
        textureAssetId: `texture-face-${face}`,
      })),
      colorSpace: "srgb",
      generateMipmaps: true,
      filter: "linear",
    },
  };
  const shader = shaderWith({
    uniforms: accepted,
    variants: [
      { ...BASE_VARIANT, blending: "additive", frustumCulled: false },
      { ...BASE_VARIANT, name: "shade", meshNameIncludes: "shade", blending: "multiply" },
      { ...BASE_VARIANT, name: "ink", meshNameIncludes: "ink", blending: "subtractive", frustumCulled: true },
      { ...BASE_VARIANT, name: "plain", meshNameIncludes: "plain", blending: "normal" },
    ],
  });
  assert(
    validateClassicR3fMaterialShader(shader).length === 0,
    `every new field must be accepted: ${validateClassicR3fMaterialShader(shader).join(" / ")}`,
  );

  const refused: Array<[string, unknown]> = [
    ["a matrix of 12 numbers", { kind: "matrix", value: Array(12).fill(0) }],
    ["a matrix of 4 numbers", { kind: "matrix", value: [1, 0, 0, 1] }],
    ["a matrix with a non-number", { kind: "matrix", value: [...Array(8).fill(0), "1"] }],
    ["an empty array", { kind: "array", value: [] }],
    [
      "an array over the limit",
      { kind: "array", value: Array(CLASSIC_SHADER_LIMITS.arrayLength + 1).fill(0) },
    ],
    ["an array holding null", { kind: "array", value: [1, null] }],
    ["a volume without an Asset", { kind: "texture-3d", textureAssetId: " " }],
    ["a volume with zero slices", { kind: "texture-3d", textureAssetId: "t", slices: 0 }],
    ["a volume with 1.5 slices", { kind: "texture-3d", textureAssetId: "t", slices: 1.5 }],
    [
      "a volume deeper than every device holds",
      { kind: "texture-3d", textureAssetId: "t", slices: CLASSIC_SHADER_LIMITS.volumeAxis + 1 },
    ],
    ["a volume with a bad wrapR", { kind: "texture-3d", textureAssetId: "t", wrapR: "mirror" }],
    ["a volume asking for mipmaps", { kind: "texture-3d", textureAssetId: "t", generateMipmaps: true }],
    ["a cube map with five faces", { kind: "texture-cube", faces: Array(5).fill({ textureAssetId: "t" }) }],
    ["a cube map with a face without an Asset", { kind: "texture-cube", faces: [...Array(5).fill({ textureAssetId: "t" }), {}] }],
    ["a cube map with a bad colour space", { kind: "texture-cube", faces: Array(6).fill({ textureAssetId: "t" }), colorSpace: "p3" }],
    ["an unknown kind", { kind: "sampler", value: 1 }],
  ];
  for (const [label, uniform] of refused) {
    const errors = validateClassicR3fMaterialShader(
      shaderWith({ uniforms: { uValue: uniform as ClassicR3fShaderUniform } }),
    );
    assert(
      errors.length === 1 && errors[0]!.startsWith("uniforms.uValue: "),
      `${label} must be refused with its uniform named: ${JSON.stringify(errors)}`,
    );
  }
  for (const [label, variant] of [
    ["an unknown blending", { ...BASE_VARIANT, blending: "screen" }],
    ["a blending that is not text", { ...BASE_VARIANT, blending: 2 }],
    ["a frustumCulled that is not a switch", { ...BASE_VARIANT, frustumCulled: "no" }],
  ] as const) {
    const errors = validateClassicR3fMaterialShader(
      shaderWith({ variants: [variant as unknown as ClassicR3fShaderVariant] }),
    );
    assert(
      errors.length === 1 && errors[0]!.startsWith("variants[0]: "),
      `${label} must be refused with its variant named: ${JSON.stringify(errors)}`,
    );
  }
}

function assertEveryRefusalHasAReason(): void {
  // Before the reasons were complete, a bad uniform returned no reason at all
  // and so passed as valid everywhere except the document codec.
  const cases: Array<[string, Partial<ClassicR3fMaterialShader> | unknown, string]> = [
    ["a five-number vector", { uniforms: { uOffset: { kind: "vector", value: [1, 2, 3, 4, 5] } } }, "uniforms.uOffset"],
    ["a colour name", { uniforms: { uTint: { kind: "color", value: "red" } } }, "uniforms.uTint"],
    ["an infinite number", { uniforms: { uGain: { kind: "number", value: Number.POSITIVE_INFINITY } } }, "uniforms.uGain"],
    ["a texture without an Asset", { uniforms: { uMap: { kind: "texture", textureAssetId: "" } } }, "uniforms.uMap"],
    ["a texture with a bad filter", { uniforms: { uMap: { kind: "texture", textureAssetId: "t", filter: "cubic" } } }, "uniforms.uMap"],
    ["a uniform name GLSL cannot use", { uniforms: { "u-bad": { kind: "number", value: 1 } } }, "uniforms.u-bad"],
    ["a variant without a name", { variants: [{ ...BASE_VARIANT, name: " " }] }, "variants[0]"],
    ["a variant with an unknown side", { variants: [{ ...BASE_VARIANT, side: "both" }] }, "variants[0]"],
    ["a define that is not text", { variants: [{ ...BASE_VARIANT, defines: { QUALITY: 2 } }] }, "variants[0]"],
    ["no variant", { variants: [] }, "variants"],
    ["a time uniform name with a space", { animatedTimeUniform: "u Time" }, "animatedTimeUniform"],
    ["an empty Shader Asset reference", { vertexShaderAssetId: "" }, "vertexShaderAssetId"],
    ["GLSL without main", { fragmentShader: "uniform float uTime;" }, "fragmentShader"],
    ["GLSL over the size limit", { vertexShader: `void main(){}${" ".repeat(CLASSIC_SHADER_LIMITS.sourceLength)}` }, "vertexShader"],
  ];
  for (const [label, patch, where] of cases) {
    const shader = shaderWith(patch as Partial<ClassicR3fMaterialShader>);
    const errors = validateClassicR3fMaterialShader(shader);
    assert(
      errors.length > 0 && errors.some((error) => error.startsWith(where)),
      `${label} must be refused with a reason naming ${where}: ${JSON.stringify(errors)}`,
    );
    assert(
      !isClassicR3fMaterialShader(shader),
      `${label}: what the validator refuses, the document codec must refuse too`,
    );
  }
  assert(
    validateClassicR3fMaterialShader(null).length === 1 &&
      validateClassicR3fMaterialShader({ kind: "openbrush" }).length > 1,
    "a value that is not a shader must be refused",
  );
  const tooMany = shaderWith({
    uniforms: Object.fromEntries(
      Array.from({ length: CLASSIC_SHADER_LIMITS.uniforms + 1 }, (_, index) => [
        `u${index}`,
        { kind: "number", value: index } as const,
      ]),
    ),
  });
  assert(
    validateClassicR3fMaterialShader(tooMany).length === 1,
    "more uniforms than the limit must be refused once, not once per uniform",
  );
}

function assertTextureSourcesAreChecked(): void {
  const assets: AssetManifest = {
    schemaVersion: "0.1.0",
    assets: {
      picture: texture("picture", "assets/textures/picture.png", {
        importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 1, width: 64, height: 64 },
      }),
      lut: texture("lut", "assets/textures/lut.png", {
        importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 1, width: 1024, height: 32 },
      }),
      odd: texture("odd", "assets/textures/odd.png", {
        importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 1, width: 100, height: 32 },
      }),
      unmeasured: texture("unmeasured", "assets/textures/unmeasured.png"),
      compressed: texture("compressed", "assets/textures/compressed.ktx2"),
      data: texture("data", "assets/textures/data.exr", { usage: "environment" }),
      sky: texture("sky", "assets/textures/sky.hdr", { usage: "environment" }),
    },
  };
  assert(
    classicShaderTextureFormat(assets.assets.picture as TextureAsset) === "image" &&
      classicShaderTextureFormat(assets.assets.compressed as TextureAsset) === "ktx2" &&
      classicShaderTextureFormat(assets.assets.data as TextureAsset) === "float" &&
      classicShaderTextureFormat(assets.assets.sky as TextureAsset) === "unsupported",
    "each Texture Asset must be read the way its file allows",
  );
  const issues = (uniforms: Record<string, ClassicR3fShaderUniform>) =>
    findClassicShaderTextureIssues({ uniforms }, assets).map(
      (issue) => issue.uniformName,
    );
  const face = (id: string) => ({ textureAssetId: id });
  assert(
    issues({
      uPicture: { kind: "texture", textureAssetId: "picture" },
      uCompressed: { kind: "texture", textureAssetId: "compressed" },
      uData: { kind: "texture", textureAssetId: "data" },
      uLut: { kind: "texture-3d", textureAssetId: "lut" },
      uLutSlices: { kind: "texture-3d", textureAssetId: "odd", slices: 4 },
      uUnmeasured: { kind: "texture-3d", textureAssetId: "unmeasured", slices: 7 },
      uCube: { kind: "texture-cube", faces: Array.from({ length: 6 }, () => face("picture")) },
      uGain: { kind: "number", value: 1 },
    }).length === 0,
    "a picture, a KTX2 or an EXR for a sampler2D, a strip that divides and six equal squares must be accepted",
  );
  assert(
    issues({
      uHdr: { kind: "texture", textureAssetId: "sky" },
      uGone: { kind: "texture", textureAssetId: "gone" },
      uOdd: { kind: "texture-3d", textureAssetId: "odd" },
      uOddSlices: { kind: "texture-3d", textureAssetId: "odd", slices: 3 },
      uCompressed: { kind: "texture-3d", textureAssetId: "compressed" },
      uFloat: { kind: "texture-3d", textureAssetId: "data" },
      uCubeKtx: { kind: "texture-cube", faces: [...Array.from({ length: 5 }, () => face("picture")), face("compressed")] },
      uCubeSizes: { kind: "texture-cube", faces: [...Array.from({ length: 5 }, () => face("picture")), face("lut")] },
      uCubeGone: { kind: "texture-cube", faces: [...Array.from({ length: 5 }, () => face("picture")), face("gone")] },
    }).join() ===
      "uHdr,uGone,uOdd,uOddSlices,uCompressed,uFloat,uCubeKtx,uCubeSizes,uCubeGone",
    "an HDR, a missing Asset, a strip that does not divide, a compressed or float volume and unequal cube faces must each be reported",
  );
}

function assertDescriptorsSurviveSaving(): void {
  const project = createPrototypeProject("world", "custom-shader-contract");
  const lut = texture("texture-lut", "assets/textures/lut.png");
  const faces = Array.from({ length: 6 }, (_, face) =>
    texture(`texture-face-${face}`, `assets/textures/face-${face}.png`),
  );
  const shader = shaderWith({
    uniforms: {
      uProjector: { kind: "matrix", value: Array.from({ length: 16 }, (_, index) => index / 7) },
      uWeights: { kind: "array", value: [0.1, -0.2, 1e-7, 3] },
      uLut: { kind: "texture-3d", textureAssetId: lut.id, slices: 16, wrapR: "repeat" },
      uSky: { kind: "texture-cube", faces: faces.map((face) => ({ textureAssetId: face.id })) },
      uTime: { kind: "number", value: 0 },
    },
    variants: [{ ...BASE_VARIANT, blending: "additive", transparent: true, depthWrite: false, frustumCulled: false }],
  });
  const materialId = BUILTIN_ASSET_IDS.material.violet;
  const assets = updateMaterialAsset(
    {
      ...project.assets,
      assets: {
        ...project.assets.assets,
        [lut.id]: lut,
        ...Object.fromEntries(faces.map((face) => [face.id, face])),
      },
    },
    materialId,
    { shader },
  );
  const parsed = assetManifestCodec.parse(assetManifestCodec.serialize(assets));
  assert(
    parsed.ok,
    `a Material with every new field must load again: ${parsed.ok ? "" : JSON.stringify(parsed.issues)}`,
  );
  const reloaded = parsed.document.assets[materialId] as MaterialAsset;
  assert(
    stableSerializeJson(reloaded.shader) === stableSerializeJson(shader),
    "saving and loading must not drop or round a shader field",
  );

  // A descriptor without the new fields is written back without them.
  const old = updateMaterialAsset(project.assets, materialId, {
    shader: createDefaultCustomShader(),
  });
  const written = JSON.parse(assetManifestCodec.serialize(old)) as AssetManifest;
  const writtenShader = (written.assets[materialId] as MaterialAsset).shader;
  assert(
    writtenShader?.kind === "classic-r3f" &&
      writtenShader.variants.every(
        (variant) => !("blending" in variant) && !("frustumCulled" in variant),
      ),
    "saving an older descriptor must not add the new fields to it",
  );

  // A reference to an Asset that is not a Texture is refused at the uniform.
  for (const [label, broken, path] of [
    [
      "a volume",
      { ...shader.uniforms, uLut: { kind: "texture-3d", textureAssetId: materialId } },
      "uniforms.uLut.textureAssetId",
    ],
    [
      "a cube face",
      {
        ...shader.uniforms,
        uSky: {
          kind: "texture-cube",
          faces: [...faces.slice(0, 5).map((face) => ({ textureAssetId: face.id })), { textureAssetId: "texture-gone" }],
        },
      },
      "uniforms.uSky.faces.5.textureAssetId",
    ],
  ] as const) {
    const result = assetManifestCodec.parse(
      assetManifestCodec.serialize(
        updateMaterialAsset(assets, materialId, {
          shader: { ...shader, uniforms: broken as ClassicR3fMaterialShader["uniforms"] },
        }),
      ),
    );
    assert(
      !result.ok && result.issues.some((entry) => entry.path.endsWith(path)),
      `${label} that names something other than a Texture must be reported at ${path}`,
    );
  }

  // Copying a hierarchy to another project has to find and rename every
  // Texture a shader reads, the faces of a cube map included.
  const references = collectHierarchyAssetReferences(reloaded);
  for (const id of [lut.id, ...faces.map((face) => face.id)]) {
    assert(
      references.has(id),
      `the Texture ${id} must be found as a dependency of the Material`,
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
