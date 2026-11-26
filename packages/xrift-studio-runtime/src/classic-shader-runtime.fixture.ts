import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Color,
  CompressedTexture,
  CubeTexture,
  Data3DTexture,
  DataTexture,
  DoubleSide,
  FloatType,
  FrontSide,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MultiplyBlending,
  NearestFilter,
  NoColorSpace,
  NormalBlending,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  SubtractiveBlending,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Material,
} from "three";
import { EXRExporter } from "three/examples/jsm/exporters/EXRExporter.js";
import {
  CLASSIC_SHADER_LIMITS,
  classicShaderTextureAssetIds,
  resolveClassicShaderTimeUniforms,
  resolveClassicShaderVariant,
  resolveClassicShaderVolumeLayout,
  type XriftClassicShader,
} from "./classic-shader-contract.js";
import {
  createClassicShaderDataTexture,
  readExrSampleType,
} from "./classic-shader-data-texture.js";
import {
  applyClassicShaderMeshState,
  attachClassicShaderMaterial,
  classicShaderDisablesFrustumCulling,
  configureClassicShaderSkyMaterial,
  createClassicShaderMaterial,
  sliceClassicShaderVolume,
  type ClassicShaderDiagnostic,
} from "./classic-shader-runtime.js";
import {
  advanceMaterialTimeUniforms,
  advanceObjectTimeUniforms,
} from "./shader-time.js";

const VERTEX =
  "uniform float uTime;\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}";
const FRAGMENT =
  "uniform vec4 _Time;\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}";

function shaderWith(
  patch: Partial<XriftClassicShader> = {},
): XriftClassicShader {
  return {
    kind: "classic-r3f",
    sourceModulePath: "fixture://classic-shader",
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {},
    variants: [
      {
        name: "default",
        defines: {},
        side: "front",
        transparent: false,
        depthWrite: true,
      },
    ],
    ...patch,
  };
}

/** A decoded picture of a known size, standing in for a loaded image. */
function pictureTexture(width: number, height: number): Texture {
  return new Texture({ width, height } as unknown as HTMLImageElement);
}

/**
 * The shared Custom Shader Material builder, without a renderer.
 *
 * Everything here is what a path can get wrong on its own: which variant a
 * mesh wears, what each uniform kind becomes, how a sampler is configured and
 * what the mesh is asked to do. The editor, the generated world and the
 * Runtime JSON loader call this one function, so these assertions hold for
 * all of them.
 */
export async function runClassicShaderRuntimeFixtureAssertions(): Promise<void> {
  assertOldShadersAreDrawnAsBefore();
  assertVariantRenderState();
  assertValueUniformKinds();
  assertTextureUniformSamplers();
  assertVolumeTextures();
  assertCubeTextures();
  assertFrustumCullingFollowsTheMaterial();
  assertTheClock();
  await assertFloatDataKeepsItsPrecision();
}

function assertOldShadersAreDrawnAsBefore(): void {
  // The descriptor shape every project saved before the contract grew.
  const shader = shaderWith({
    uniforms: {
      uTime: { kind: "number", value: 0 },
      uTint: { kind: "color", value: "#336699" },
      uOffset: { kind: "vector", value: [1, 2] },
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
      {
        name: "default",
        defines: { SOLID: "1" },
        side: "back",
        transparent: false,
        depthWrite: true,
      },
    ],
    animatedTimeUniform: "uTime",
  });
  const fallback = createClassicShaderMaterial(shader);
  assert(
    fallback.blending === NormalBlending && !fallback.premultipliedAlpha,
    "a variant without blending must stay normal, as before the field existed",
  );
  assert(
    !classicShaderDisablesFrustumCulling(fallback),
    "a variant without frustumCulled must stay culled",
  );
  assert(
    fallback.side === BackSide &&
      !fallback.transparent &&
      fallback.depthWrite &&
      fallback.defines.SOLID === "1",
    "the fallback variant must keep its side, transparency, depth and defines",
  );
  assert(
    fallback.name === "fixture://classic-shader:default",
    "the Material name must say which shader and variant it is",
  );
  assert(
    fallback.fog &&
      fallback.uniforms.fogColor !== undefined &&
      fallback.uniforms.fogNear !== undefined &&
      fallback.uniforms.fogFar !== undefined,
    "Scene fog must reach the shader on every path, not only in the editor",
  );
  const water = createClassicShaderMaterial(shader, { meshName: "LAKE_water_01" });
  assert(
    water.side === DoubleSide &&
      water.transparent &&
      !water.depthWrite &&
      water.defines.WATER === "",
    "a mesh whose name contains the variant's text, in any case, must wear that variant",
  );
  assert(
    resolveClassicShaderVariant(shader, "Rock")?.name === "default" &&
      resolveClassicShaderVariant(shader)?.name === "default",
    "a mesh no variant names must wear the fallback",
  );
  assert(
    fallback.uniforms.uTint?.value instanceof Color &&
      fallback.uniforms.uOffset?.value instanceof Vector2 &&
      fallback.uniforms.uTime?.value === 0,
    "number, colour and vector uniforms must become what they always became",
  );
  fallback.dispose();
  water.dispose();
}

function assertVariantRenderState(): void {
  const variant = (
    blending: XriftClassicShader["variants"][number]["blending"],
  ) =>
    createClassicShaderMaterial(
      shaderWith({
        variants: [
          {
            name: "glow",
            defines: {},
            side: "front",
            transparent: true,
            depthWrite: false,
            ...(blending ? { blending } : {}),
          },
        ],
      }),
    );
  const additive = variant("additive");
  assert(
    additive.blending === AdditiveBlending &&
      additive.transparent &&
      !additive.depthWrite &&
      !additive.premultipliedAlpha,
    "additive must add the colour without changing how it is written",
  );
  const multiply = variant("multiply");
  const subtractive = variant("subtractive");
  assert(
    multiply.blending === MultiplyBlending &&
      multiply.premultipliedAlpha &&
      subtractive.blending === SubtractiveBlending &&
      subtractive.premultipliedAlpha,
    "multiply and subtractive need premultiplied colour, or three.js refuses to set the blend function",
  );
  // Blending and the transparent pass are separate decisions, as they are on
  // a three.js ShaderMaterial: the descriptor is a snapshot of one.
  const opaqueAdditive = createClassicShaderMaterial(
    shaderWith({
      variants: [
        {
          name: "stars",
          defines: {},
          side: "front",
          transparent: false,
          depthWrite: true,
          blending: "additive",
        },
      ],
    }),
  );
  assert(
    opaqueAdditive.blending === AdditiveBlending && !opaqueAdditive.transparent,
    "blending must not move a variant into the transparent pass on its own",
  );
  const sky = configureClassicShaderSkyMaterial(variant(undefined));
  assert(
    sky.side === BackSide && !sky.depthTest && !sky.depthWrite,
    "a sky is seen from inside and drawn behind everything",
  );
  for (const material of [additive, multiply, subtractive, opaqueAdditive, sky]) {
    material.dispose();
  }
}

function assertValueUniformKinds(): void {
  const mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const mat4 = Array.from({ length: 16 }, (_, index) => index + 1);
  const weights = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const material = createClassicShaderMaterial(
    shaderWith({
      uniforms: {
        uNormalMatrix: { kind: "matrix", value: mat3 },
        uProjector: { kind: "matrix", value: mat4 },
        uWeights: { kind: "array", value: weights },
        uPosition: { kind: "vector", value: [1, 2, 3] },
        uPlane: { kind: "vector", value: [1, 2, 3, 4] },
      },
    }),
  );
  const normalMatrix = material.uniforms.uNormalMatrix?.value;
  const projector = material.uniforms.uProjector?.value;
  assert(
    normalMatrix instanceof Matrix3 &&
      JSON.stringify(normalMatrix.elements) === JSON.stringify(mat3),
    "nine numbers must become a mat3 in the order written, which is column-major",
  );
  assert(
    projector instanceof Matrix4 &&
      JSON.stringify(projector.elements) === JSON.stringify(mat4) &&
      // Column-major: the fourth column is the translation.
      projector.elements[12] === 13,
    "sixteen numbers must become a mat4 in the order written, which is column-major",
  );
  const sent = material.uniforms.uWeights?.value as number[];
  assert(
    Array.isArray(sent) &&
      sent !== weights &&
      JSON.stringify(sent) === JSON.stringify(weights),
    "an array uniform must reach three.js as flat numbers, and as its own copy",
  );
  assert(
    material.uniforms.uPosition?.value instanceof Vector3 &&
      material.uniforms.uPlane?.value instanceof Vector4,
    "three and four numbers must stay vectors",
  );
  // A clone, which Scripts and triggers take, must carry the values across.
  const copy = material.clone();
  assert(
    copy.uniforms.uProjector?.value instanceof Matrix4 &&
      copy.uniforms.uProjector.value !== projector &&
      (copy.uniforms.uWeights?.value as number[])[5] === 1.5,
    "a cloned Material must own a copy of its matrix and array uniforms",
  );
  material.dispose();
  copy.dispose();
}

function assertTextureUniformSamplers(): void {
  const picture = pictureTexture(8, 8);
  // The Asset's own settings are for glTF surfaces and must not leak in.
  picture.flipY = false;
  picture.colorSpace = SRGBColorSpace;
  picture.wrapS = ClampToEdgeWrapping;
  const diagnostics: ClassicShaderDiagnostic[] = [];
  const shader = shaderWith({
    uniforms: {
      uDefault: { kind: "texture", textureAssetId: "picture" },
      uTuned: {
        kind: "texture",
        textureAssetId: "picture",
        colorSpace: "srgb",
        generateMipmaps: true,
        filter: "nearest",
        wrapS: "clamp-to-edge",
        wrapT: "clamp-to-edge",
      },
      uMissing: { kind: "texture", textureAssetId: "gone" },
    },
  });
  const material = createClassicShaderMaterial(shader, {
    textures: { picture },
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const plain = material.uniforms.uDefault?.value as Texture;
  const tuned = material.uniforms.uTuned?.value as Texture;
  assert(
    plain !== picture && tuned !== picture && plain !== tuned,
    "every uniform must take its own clone, so one sampler cannot change another",
  );
  assert(
    plain.source === picture.source && tuned.source === picture.source,
    "the clones must share the decoded picture instead of loading it again",
  );
  assert(
    plain.colorSpace === NoColorSpace &&
      plain.generateMipmaps === false &&
      plain.magFilter === LinearFilter &&
      plain.minFilter === LinearFilter &&
      plain.wrapS === RepeatWrapping &&
      plain.wrapT === RepeatWrapping &&
      plain.flipY === true,
    "a texture uniform without options must be sampled the way the editor always sampled it",
  );
  assert(
    tuned.colorSpace === SRGBColorSpace &&
      tuned.generateMipmaps === true &&
      tuned.magFilter === NearestFilter &&
      tuned.minFilter === NearestFilter &&
      tuned.wrapS === ClampToEdgeWrapping &&
      tuned.wrapT === ClampToEdgeWrapping,
    "the options written on the uniform must decide its sampler",
  );
  assert(
    picture.flipY === false && picture.wrapS === ClampToEdgeWrapping,
    "the shared texture must be left as the caller loaded it",
  );
  assert(
    material.uniforms.uMissing?.value === null &&
      diagnostics.length === 1 &&
      diagnostics[0]?.code === "texture-not-loaded" &&
      diagnostics[0]?.uniformName === "uMissing" &&
      diagnostics[0]?.assetId === "gone",
    "a texture that is not loaded must be reported and left unbound, not replaced",
  );
  const same = createClassicShaderMaterial(shader, { textures: new Map([["picture", picture]]) });
  assert(
    (same.uniforms.uDefault?.value as Texture).source === picture.source,
    "a Map of textures must be read like a record of them",
  );

  let released = 0;
  plain.addEventListener("dispose", () => (released += 1));
  tuned.addEventListener("dispose", () => (released += 1));
  let sharedReleased = false;
  picture.addEventListener("dispose", () => (sharedReleased = true));
  material.dispose();
  assert(
    released === 2 && !sharedReleased,
    "disposing the Material must release its clones and leave the shared texture alone",
  );
  same.dispose();

  // A compressed texture cannot be flipped or given new mip levels.
  const compressed = new CompressedTexture([], 4, 4);
  const compressedUse = createClassicShaderMaterial(
    shaderWith({
      uniforms: {
        uMap: { kind: "texture", textureAssetId: "ktx2", generateMipmaps: true },
      },
    }),
    { textures: { ktx2: compressed } },
  ).uniforms.uMap?.value as Texture;
  assert(
    compressedUse.generateMipmaps === false &&
      compressedUse.flipY === compressed.flipY,
    "a compressed texture must keep its encoded mip levels and its orientation",
  );

  // Float data is numbers: no flip, no colour conversion.
  const data = new DataTexture(new Uint16Array(4 * 4), 2, 2, RGBAFormat, HalfFloatType);
  const dataUse = createClassicShaderMaterial(
    shaderWith({
      uniforms: {
        uData: { kind: "texture", textureAssetId: "exr", colorSpace: "srgb", filter: "nearest" },
      },
    }),
    { textures: { exr: data } },
  ).uniforms.uData?.value as Texture;
  assert(
    dataUse.type === HalfFloatType &&
      dataUse.flipY === false &&
      dataUse.colorSpace === NoColorSpace &&
      dataUse.magFilter === NearestFilter,
    "float data must reach the sampler unflipped, unconverted and in its own precision",
  );
}

function assertVolumeTextures(): void {
  // A 4 x 2 strip of two 2 x 2 slices. Each texel's red channel is its
  // position in the strip, so the rearranged order is readable.
  const width = 4;
  const height = 2;
  const strip = new Uint8Array(width * height * 4);
  for (let texel = 0; texel < width * height; texel += 1) {
    strip[texel * 4] = texel;
    strip[texel * 4 + 3] = 255;
  }
  const volume = sliceClassicShaderVolume(strip, width, height, 2);
  const reds = Array.from({ length: 8 }, (_, texel) => volume[texel * 4]);
  assert(
    JSON.stringify(reds) === JSON.stringify([0, 1, 4, 5, 2, 3, 6, 7]),
    `a strip must be cut slice by slice, left to right, rows top to bottom; got ${reds.join(",")}`,
  );

  assert(
    JSON.stringify(resolveClassicShaderVolumeLayout(1024, 32, undefined).layout) ===
      JSON.stringify({ slices: 32, sliceWidth: 32 }),
    "a 1024 x 32 strip without a slice count is a 32-cubed colour table",
  );
  assert(
    JSON.stringify(resolveClassicShaderVolumeLayout(64, 16, 8).layout) ===
      JSON.stringify({ slices: 8, sliceWidth: 8 }) &&
      resolveClassicShaderVolumeLayout(100, 32, undefined).error?.reason === "not-square" &&
      resolveClassicShaderVolumeLayout(100, 32, 3).error?.reason === "width" &&
      resolveClassicShaderVolumeLayout(64, 16, 0).error?.reason === "slices" &&
      resolveClassicShaderVolumeLayout(0, 16, 1).error?.reason === "no-size" &&
      resolveClassicShaderVolumeLayout(
        (CLASSIC_SHADER_LIMITS.volumeAxis + 1) * 2,
        2,
        2,
      ).error?.reason === "too-large",
    "a strip that does not divide into a volume every device can hold must be refused with the reason",
  );

  const picture = pictureTexture(width, height);
  let reads = 0;
  const readImagePixels = () => {
    reads += 1;
    return { data: strip, width, height };
  };
  const shader = shaderWith({
    uniforms: {
      uLut: { kind: "texture-3d", textureAssetId: "lut", slices: 2 },
      uLutNearest: {
        kind: "texture-3d",
        textureAssetId: "lut",
        slices: 2,
        colorSpace: "srgb",
        filter: "nearest",
        wrapS: "repeat",
        wrapT: "repeat",
        wrapR: "repeat",
      },
    },
  });
  const first = createClassicShaderMaterial(shader, {
    textures: { lut: picture },
    readImagePixels,
  });
  const second = createClassicShaderMaterial(shader, {
    textures: { lut: picture },
    readImagePixels,
  });
  const lut = first.uniforms.uLut?.value as Data3DTexture;
  const nearest = first.uniforms.uLutNearest?.value as Data3DTexture;
  assert(
    lut.isData3DTexture === true &&
      lut.image.width === 2 &&
      lut.image.height === 2 &&
      lut.image.depth === 2 &&
      lut.format === RGBAFormat,
    "a texture-3d uniform must become a volume of slice width x height x slices",
  );
  assert(
    lut.flipY === false &&
      lut.generateMipmaps === false &&
      lut.colorSpace === NoColorSpace &&
      lut.magFilter === LinearFilter &&
      lut.wrapS === ClampToEdgeWrapping &&
      lut.wrapT === ClampToEdgeWrapping &&
      lut.wrapR === ClampToEdgeWrapping,
    "a volume without options must be a clamped, linearly filtered table in picture row order",
  );
  assert(
    nearest.colorSpace === SRGBColorSpace &&
      nearest.magFilter === NearestFilter &&
      nearest.wrapS === RepeatWrapping &&
      nearest.wrapR === RepeatWrapping,
    "the options written on a texture-3d uniform must decide its sampler",
  );
  assert(
    reads === 1 &&
      (second.uniforms.uLut?.value as Data3DTexture).source === lut.source &&
      nearest.source === lut.source,
    "one strip must be read and rearranged once, however many Materials sample it",
  );

  const failures: ClassicShaderDiagnostic[] = [];
  const refused = createClassicShaderMaterial(
    shaderWith({
      uniforms: {
        uOdd: { kind: "texture-3d", textureAssetId: "lut", slices: 3 },
        uCompressed: { kind: "texture-3d", textureAssetId: "ktx2" },
      },
    }),
    {
      textures: { lut: picture, ktx2: new CompressedTexture([], 4, 4) },
      readImagePixels,
      onDiagnostic: (diagnostic) => failures.push(diagnostic),
    },
  );
  assert(
    refused.uniforms.uOdd?.value === null &&
      refused.uniforms.uCompressed?.value === null &&
      failures.map((failure) => failure.code).join() ===
        "texture-3d-layout,texture-unsupported",
    "a strip that cannot be cut, or a compressed texture, must be reported and left unbound",
  );
  for (const material of [first, second, refused]) material.dispose();
}

function assertCubeTextures(): void {
  const faces = Array.from({ length: 6 }, () => pictureTexture(16, 16));
  const textures = Object.fromEntries(
    faces.map((face, index) => [`face-${index}`, face]),
  );
  const shader = shaderWith({
    uniforms: {
      uEnvironment: {
        kind: "texture-cube",
        faces: faces.map((_face, index) => ({ textureAssetId: `face-${index}` })),
        colorSpace: "srgb",
      },
    },
  });
  assert(
    classicShaderTextureAssetIds(shader).join() ===
      "face-0,face-1,face-2,face-3,face-4,face-5",
    "a cube map must name all six of its Texture Assets",
  );
  const first = createClassicShaderMaterial(shader, { textures });
  const second = createClassicShaderMaterial(shader, { textures });
  const cube = first.uniforms.uEnvironment?.value as CubeTexture;
  assert(
    cube.isCubeTexture === true &&
      cube.image.length === 6 &&
      cube.image.every(
        (image: unknown, index: number) => image === faces[index]?.image,
      ),
    "the six pictures must become the six faces in the order written",
  );
  assert(
    cube.colorSpace === SRGBColorSpace &&
      cube.flipY === false &&
      cube.generateMipmaps === false &&
      cube.magFilter === LinearFilter,
    "a cube map must take its colour space and filter from the uniform",
  );
  assert(
    (second.uniforms.uEnvironment?.value as CubeTexture).source === cube.source,
    "the same six pictures must be assembled once",
  );

  const failures: ClassicShaderDiagnostic[] = [];
  const mismatched = createClassicShaderMaterial(shader, {
    textures: { ...textures, "face-3": pictureTexture(8, 16) },
    onDiagnostic: (diagnostic) => failures.push(diagnostic),
  });
  const incomplete = createClassicShaderMaterial(shader, {
    textures: { "face-0": faces[0]! },
    onDiagnostic: (diagnostic) => failures.push(diagnostic),
  });
  assert(
    mismatched.uniforms.uEnvironment?.value === null &&
      incomplete.uniforms.uEnvironment?.value === null &&
      failures.map((failure) => failure.code).join() ===
        "texture-cube-layout,texture-not-loaded",
    "faces of different sizes, or a missing face, must be reported and left unbound",
  );
  for (const material of [first, second, mismatched, incomplete]) material.dispose();
}

function assertFrustumCullingFollowsTheMaterial(): void {
  const shader = shaderWith({
    variants: [
      {
        name: "hens",
        meshNameIncludes: "hen",
        defines: {},
        side: "front",
        transparent: false,
        depthWrite: true,
        frustumCulled: false,
      },
      {
        name: "default",
        defines: {},
        side: "front",
        transparent: false,
        depthWrite: true,
      },
    ],
  });
  const moved = createClassicShaderMaterial(shader, { meshName: "Hen_03" });
  const still = createClassicShaderMaterial(shader, { meshName: "Coop" });
  assert(
    classicShaderDisablesFrustumCulling(moved) &&
      !classicShaderDisablesFrustumCulling(still),
    "only the variant that asks for it may opt its meshes out of culling",
  );
  assert(
    classicShaderDisablesFrustumCulling(moved.clone()),
    "a cloned Material must keep asking for the same thing",
  );

  // Read through a function: the values change behind the type checker's back.
  const culled = (object: { frustumCulled: boolean }): boolean =>
    object.frustumCulled;
  const plain = new MeshBasicMaterial();
  const mesh = new Mesh<BoxGeometry, Material>(new BoxGeometry(), plain);
  const detach = attachClassicShaderMaterial(mesh, moved);
  assert(
    mesh.material === moved && !culled(mesh),
    "wearing the Material must take the mesh out of frustum culling",
  );
  detach();
  assert(
    mesh.material === plain && culled(mesh),
    "taking the Material off must put the mesh back as it was",
  );

  const detachStill = attachClassicShaderMaterial(mesh, still);
  assert(
    culled(mesh),
    "a Material that does not ask must leave culling alone",
  );
  detachStill();

  // A mesh an author already took out of culling stays out afterwards.
  mesh.frustumCulled = false;
  attachClassicShaderMaterial(mesh, moved)();
  assert(
    !culled(mesh),
    "undoing must restore the mesh's own setting, not force culling on",
  );
  mesh.frustumCulled = true;

  // Two slots of one mesh: culling comes back only when both are off.
  const slots: Material[] = [plain, plain];
  const multi = new Mesh(new BoxGeometry(), slots);
  const otherMoved = createClassicShaderMaterial(shader, { meshName: "hen" });
  const detachFirst = attachClassicShaderMaterial(multi, moved, "material-0");
  const detachSecond = attachClassicShaderMaterial(multi, otherMoved, "material-1");
  assert(
    Array.isArray(multi.material) &&
      multi.material[0] === moved &&
      multi.material[1] === otherMoved &&
      !culled(multi),
    "each slot of a multi-material mesh must take its own Material",
  );
  detachFirst();
  assert(
    !culled(multi) &&
      Array.isArray(multi.material) &&
      multi.material[0] === plain,
    "the mesh must stay out of culling while another slot still asks",
  );
  detachSecond();
  assert(
    culled(multi),
    "culling must come back when the last such Material is taken off",
  );

  // One Material on two slots is worn twice, so it is taken off twice.
  const twice = new Mesh<BoxGeometry, Material[]>(new BoxGeometry(), [plain, plain]);
  const detachOnce = attachClassicShaderMaterial(twice, moved, "material-0");
  const detachAgain = attachClassicShaderMaterial(twice, moved, "material-1");
  detachOnce();
  assert(
    !culled(twice),
    "a Material still worn on another slot must keep the mesh out of culling",
  );
  detachAgain();
  assert(culled(twice), "culling must come back after both slots are cleared");

  const undo = applyClassicShaderMeshState(mesh, moved);
  undo();
  undo();
  assert(culled(mesh), "undoing twice must be harmless");
  for (const material of [moved, still, otherMoved, plain]) material.dispose();
}

function assertTheClock(): void {
  const shader = shaderWith({
    uniforms: {
      uTime: { kind: "number", value: 0 },
      _Time: { kind: "vector", value: [0, 0, 0, 0] },
      uPhase: { kind: "number", value: 0 },
      uTint: { kind: "color", value: "#ffffff" },
    },
  });
  assert(
    JSON.stringify(resolveClassicShaderTimeUniforms(shader)) ===
      JSON.stringify([
        { name: "uTime", glslType: "float" },
        { name: "_Time", glslType: "vec4" },
      ]),
    "the time uniforms a shader declares must be found without being named",
  );
  // `uPhase` is not declared in a way the scan can read, so naming it is how
  // the author asks for it.
  assert(
    JSON.stringify(
      resolveClassicShaderTimeUniforms({ ...shader, animatedTimeUniform: "uPhase" }),
    ) ===
      JSON.stringify([
        { name: "uPhase", glslType: "float" },
        { name: "uTime", glslType: "float" },
        { name: "_Time", glslType: "vec4" },
      ]),
    "a named number uniform must be animated even when its declaration is not found",
  );
  assert(
    resolveClassicShaderTimeUniforms({ ...shader, animatedTimeUniform: "uTint" })
      .length === 2,
    "a named uniform that is not a number must not be overwritten with seconds",
  );

  const material = createClassicShaderMaterial({
    ...shader,
    animatedTimeUniform: "uPhase",
  });
  advanceMaterialTimeUniforms(material, 2);
  const unity = material.uniforms._Time?.value as Vector4;
  assert(
    material.uniforms.uTime?.value === 2 &&
      material.uniforms.uPhase?.value === 2 &&
      unity.x === 0.1 &&
      unity.y === 2 &&
      unity.z === 4 &&
      unity.w === 6,
    "one call must advance every time uniform of the Material",
  );
  // The Material a mesh wears is the one that has to move, slot by slot.
  const second = createClassicShaderMaterial(shader);
  const mesh = new Mesh(new BoxGeometry(), [material, second]);
  advanceObjectTimeUniforms(mesh, 5);
  assert(
    material.uniforms.uTime?.value === 5 && second.uniforms.uTime?.value === 5,
    "every slot of a multi-material mesh must be advanced",
  );
  const still = createClassicShaderMaterial(
    shaderWith({ vertexShader: "void main() {}", fragmentShader: "void main() {}" }),
  );
  advanceMaterialTimeUniforms(still, 9);
  advanceMaterialTimeUniforms(null, 9);
  assert(
    still.userData.xriftTimeUniforms === undefined,
    "a shader without a time uniform must not be marked as animated",
  );
  for (const entry of [material, second, still]) entry.dispose();
}

async function assertFloatDataKeepsItsPrecision(): Promise<void> {
  // 65535 is a 16-bit value a half float cannot hold exactly; 0.1 shows the
  // difference between 16 and 32 bits of float. Every texel is the same, so
  // the row order of the file does not matter here.
  const side = 16;
  const pixels = new Float32Array(side * side * 4);
  for (let texel = 0; texel < side * side; texel += 1) {
    pixels.set([65535, 0.1, -3.5, 1], texel * 4);
  }
  const source = new DataTexture(pixels, side, side, RGBAFormat, FloatType);
  const exporter = new EXRExporter();
  const asFloat = (await exporter.parse(source, { type: FloatType })).buffer as ArrayBuffer;
  // Values a half float can hold, so writing the file loses nothing.
  const halfSource = new DataTexture(
    new Float32Array(side * side * 4).fill(0.5),
    side,
    side,
    RGBAFormat,
    FloatType,
  );
  const asHalf = (await exporter.parse(halfSource, { type: HalfFloatType })).buffer as ArrayBuffer;
  assert(
    readExrSampleType(asFloat) === "float" && readExrSampleType(asHalf) === "half",
    "the precision an EXR stores must be read from its header",
  );
  assert(
    readExrSampleType(new ArrayBuffer(16)) === null,
    "bytes that are not an EXR must not be given a precision",
  );

  const float = createClassicShaderDataTexture(asFloat);
  const half = createClassicShaderDataTexture(asHalf);
  assert(
    float.type === FloatType &&
      float.image.data instanceof Float32Array &&
      float.image.data[0] === 65535 &&
      float.image.data[1] === Math.fround(0.1) &&
      float.image.data[2] === -3.5,
    "a 32-bit EXR must reach the shader as the 32-bit values it stores",
  );
  assert(
    half.type === HalfFloatType && half.image.data instanceof Uint16Array,
    "a half-float EXR must stay 16-bit, which every device can filter",
  );
  assert(
    float.flipY === false &&
      float.colorSpace === NoColorSpace &&
      float.generateMipmaps === false &&
      float.image.width === side &&
      float.image.height === side,
    "float data must be loaded as numbers, without flipping or colour conversion",
  );
  for (const texture of [source, halfSource, float, half]) texture.dispose();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
