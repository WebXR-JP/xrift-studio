import {
  CompressedTexture,
  DataTexture,
  HalfFloatType,
  RGBAFormat,
  Texture,
  type Material,
  type ShaderMaterial,
} from "three";
import classicShaderMaterialSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-material.tsx?raw";
import classicShaderRuntimeSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-runtime.ts?raw";
import {
  classicShaderDisablesFrustumCulling,
  createClassicShaderMaterial,
} from "../../../../packages/xrift-studio-runtime/src/classic-shader-runtime";
import {
  XriftThreeLoader,
  disposeXriftLoadResult,
} from "../../../../packages/xrift-studio-runtime/src/three/index";
import { createClassicR3fMaterial } from "../../../components/visual-editor/ProjectModelVisual";
import {
  normalizeModelImportSettings,
  normalizeTextureImportSettings,
  type MaterialAsset,
  type ModelAsset,
  type TextureAsset,
} from "../asset-manifest";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import type { ClassicR3fMaterialShader } from "../custom-shader-contract";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "../prototype-project";
import { compileVisualProject } from "./compile";
import type { VisualCompileResult } from "./types";

const VERTEX = `uniform float uTime;
uniform mat4 uProjector;
uniform float uWeights[4];
varying vec2 vUv;
void main() {
  vUv = uv + uWeights[0] * 0.0 + uTime * 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * uProjector * vec4(position, 1.0);
}`;
const FRAGMENT = `precision highp sampler3D;
uniform sampler2D uPicture;
uniform sampler2D uPictureNearest;
uniform sampler2D uData;
uniform sampler2D uCompressed;
uniform sampler3D uLut;
uniform samplerCube uSky;
uniform mat3 uNormalMatrix;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(uPicture, vUv).rgb + texture2D(uPictureNearest, vUv).rgb + texture2D(uData, vUv).rgb + texture2D(uCompressed, vUv).rgb;
  color = texture(uLut, color).rgb + textureCube(uSky, uNormalMatrix * vec3(vUv, 1.0)).rgb;
  gl_FragColor = vec4(color * uTint, 1.0);
}`;

function textureAsset(id: string, fileName: string, patch: Partial<TextureAsset> = {}): TextureAsset {
  return {
    id,
    name: id,
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: `assets/textures/${fileName}` },
    importSettings: normalizeTextureImportSettings(),
    ...patch,
  };
}

const FACE_IDS = Array.from({ length: 6 }, (_, face) => `fixture-shader-face-${face}`);

/** A shader that uses every uniform kind and every variant setting. */
function fixtureShader(): ClassicR3fMaterialShader {
  return {
    kind: "classic-r3f",
    sourceModulePath: "fixture://every-field",
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { kind: "number", value: 0 },
      uTint: { kind: "color", value: "#8040c0" },
      uProjector: { kind: "matrix", value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.25, -0.5, 0.75, 1] },
      uNormalMatrix: { kind: "matrix", value: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      uWeights: { kind: "array", value: [0.125, 0.25, 0.5, 1] },
      uPicture: { kind: "texture", textureAssetId: "fixture-shader-picture" },
      // The same Asset again with another sampler: one load, two clones.
      uPictureNearest: {
        kind: "texture",
        textureAssetId: "fixture-shader-picture",
        colorSpace: "srgb",
        filter: "nearest",
        wrapS: "clamp-to-edge",
        wrapT: "clamp-to-edge",
      },
      uData: { kind: "texture", textureAssetId: "fixture-shader-data", filter: "nearest" },
      uCompressed: { kind: "texture", textureAssetId: "fixture-shader-compressed" },
      uLut: { kind: "texture-3d", textureAssetId: "fixture-shader-lut", slices: 4 },
      uSky: {
        kind: "texture-cube",
        faces: FACE_IDS.map((textureAssetId) => ({ textureAssetId })),
        colorSpace: "srgb",
      },
    },
    variants: [
      {
        name: "glow",
        meshNameIncludes: "Lamp",
        defines: { GLOW: "1" },
        side: "double",
        transparent: true,
        depthWrite: false,
        blending: "additive",
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
    animatedTimeUniform: "uTime",
  };
}

function fixtureTextureAssets(): TextureAsset[] {
  return [
    textureAsset("fixture-shader-picture", "picture.png"),
    textureAsset("fixture-shader-lut", "lut.png", {
      importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 64, width: 16, height: 4 },
    }),
    textureAsset("fixture-shader-data", "data.exr", { usage: "environment" }),
    textureAsset("fixture-shader-compressed", "compressed.ktx2"),
    ...FACE_IDS.map((id, face) => textureAsset(id, `face-${face}.png`)),
  ];
}

/** The loaded texture of each Asset, as each path hands it to the builder. */
function fixtureTextures(): Record<string, Texture> {
  const picture = (width: number, height: number) =>
    new Texture({ width, height } as unknown as HTMLImageElement);
  const strip = new Uint8Array(16 * 4 * 4).map((_, index) => index % 251);
  return {
    "fixture-shader-picture": picture(8, 8),
    "fixture-shader-lut": new DataTexture(strip, 16, 4, RGBAFormat),
    "fixture-shader-data": new DataTexture(new Uint16Array(4 * 4 * 4), 4, 4, RGBAFormat, HalfFloatType),
    "fixture-shader-compressed": new CompressedTexture([], 4, 4),
    ...Object.fromEntries(FACE_IDS.map((id) => [id, picture(4, 4)])),
  };
}

function compileShaderWorld(
  shader: ClassicR3fMaterialShader,
  mode: "primitive" | "model",
  outputMode: "classic-jsx" | "classic-runtime" = "classic-jsx",
  textures: readonly TextureAsset[] = fixtureTextureAssets(),
): { result: VisualCompileResult; material: MaterialAsset } {
  const prototype = createPrototypeProject("world", `fixture-classic-shader-${mode}`);
  const source = prototype.assets.assets[BUILTIN_ASSET_IDS.material.violet] as MaterialAsset;
  const material: MaterialAsset = {
    ...source,
    id: "fixture-shader-material",
    name: "Every field",
    source: { kind: "document" },
    shader,
  };
  const model: ModelAsset = {
    id: "fixture-shader-model",
    name: "Lamp post",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/lamp.glb" },
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [{ slot: "default", name: "Lamp", sourceMaterialIndex: 0 }],
  };
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = mode === "model"
        ? { kind: "asset", assetId: model.id }
        : { kind: "builtin-primitive", creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: "sphere" };
      component.materialBindings = [{ slot: "default", materialAssetId: material.id }];
    }
  }
  prototype.assets.assets[material.id] = material;
  for (const texture of textures) prototype.assets.assets[texture.id] = texture;
  if (mode === "model") prototype.assets.assets[model.id] = model;
  const result = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [prototype.scene.sceneId]: prototype.scene },
      assets: prototype.assets,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-11-26T00:00:00.000Z", outputMode },
  );
  return { result, material };
}

function worldSource(result: VisualCompileResult): string {
  return result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
}

/** The descriptor the generated world hands to the shared builder. */
function emittedShader(source: string): ClassicR3fMaterialShader {
  const match = /^const CLASSIC_SHADER_\w+: XriftClassicShader = (.*);$/m.exec(source);
  assert(match?.[1], "the generated world must carry the shader descriptor as data");
  return JSON.parse(match[1]) as ClassicR3fMaterialShader;
}

/** Everything about a Material that decides what it draws. */
function drawnState(material: ShaderMaterial): string {
  const describe = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(describe);
    const entry = value as Record<string, unknown> & {
      isTexture?: boolean;
      isColor?: boolean;
      elements?: number[];
      toArray?: () => number[];
    };
    if (entry.isTexture) {
      const texture = value as Texture & { wrapR?: number; isCubeTexture?: boolean; isData3DTexture?: boolean };
      const image = texture.image as { width?: number; height?: number; depth?: number; data?: ArrayLike<number> } | unknown[];
      return {
        kind: texture.isCubeTexture ? "cube" : texture.isData3DTexture ? "3d" : "2d",
        // The decoded picture itself: the same shared source, or equal texels.
        image: Array.isArray(image)
          ? image.length
          : [image?.width, image?.height, image?.depth, image?.data ? Array.from(image.data).join() : null],
        type: texture.type,
        format: texture.format,
        colorSpace: texture.colorSpace,
        flipY: texture.flipY,
        generateMipmaps: texture.generateMipmaps,
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
        wrapS: texture.wrapS,
        wrapT: texture.wrapT,
        wrapR: texture.wrapR,
      };
    }
    if (entry.elements) return entry.elements;
    if (typeof entry.toArray === "function") return entry.toArray();
    return value;
  };
  return JSON.stringify({
    vertexShader: material.vertexShader,
    fragmentShader: material.fragmentShader,
    uniforms: Object.fromEntries(
      Object.entries(material.uniforms)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, uniform]) => [name, describe(uniform.value)]),
    ),
    defines: material.defines,
    side: material.side,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    blending: material.blending,
    premultipliedAlpha: material.premultipliedAlpha,
    fog: material.fog,
    timeUniforms: material.userData.xriftTimeUniforms,
    frustumCulled: !classicShaderDisablesFrustumCulling(material),
  });
}

/**
 * Compiles a world whose Custom Shader uses every uniform kind and variant
 * setting, and checks what reaches the published world.
 *
 * Returned so the staged sources can be typechecked with the publish
 * template's compiler options.
 */
export function runClassicShaderCompilerFixtureAssertions(
  mode: "primitive" | "model" = "primitive",
): VisualCompileResult {
  const shader = fixtureShader();
  const { result } = compileShaderWorld(shader, mode);
  assert(
    result.canStage,
    `a Custom Shader with every field must compile: ${JSON.stringify(result.diagnostics.filter((entry) => entry.severity === "blocking"))}`,
  );
  const source = worldSource(result);

  // The world draws through the shared module, not through code of its own.
  assert(
    source.includes('import { XriftClassicShaderMaterial, type XriftClassicShader } from "./xrift-studio/classic-shader-material";') &&
      source.includes("<XriftClassicShaderMaterial attach={attach} meshName={meshName} shader={CLASSIC_SHADER_") &&
      !source.includes("<shaderMaterial"),
    "the generated world must build the Material with the shared module",
  );
  const overlay = (name: string) =>
    result.overlayFiles.find((file) => file.relativePath === `src/xrift-studio/${name}`)?.content;
  for (const name of [
    "classic-shader-contract.ts",
    "classic-shader-material.tsx",
    "classic-shader-runtime.ts",
    "classic-shader-data-texture.ts",
    "shader-time.ts",
  ]) {
    const content = overlay(name);
    assert(content, `the published world must carry ${name}`);
    assert(
      !/from\s*["']\.\/[\w-]+\.js["']/.test(content),
      `${name} must import its siblings the way the staged project resolves them`,
    );
  }
  // What ships is the editor's own source, with only the import paths changed.
  const asShipped = (text: string) =>
    text.replace(/(from\s*["']\.\/[\w-]+)\.js(["'])/g, "$1$2");
  assert(
    overlay("classic-shader-runtime.ts") === asShipped(classicShaderRuntimeSource) &&
      overlay("classic-shader-material.tsx") === asShipped(classicShaderMaterialSource),
    "the published builder must be the source the editor draws with",
  );

  // Every new field reaches the world as the author wrote it.
  const emitted = emittedShader(source);
  assert(
    JSON.stringify(emitted.uniforms) === JSON.stringify(shader.uniforms) &&
      JSON.stringify(emitted.variants) === JSON.stringify(shader.variants) &&
      emitted.animatedTimeUniform === "uTime",
    "the published descriptor must carry every uniform kind and variant setting unchanged",
  );

  // One load per Texture Asset, by the loader its file needs.
  const count = (pattern: RegExp) => (source.match(pattern) ?? []).length;
  assert(
    count(/= useLoader\(TextureLoader, classicTexture_/g) === 2 + FACE_IDS.length &&
      !/useTexture\(classicTexture_/.test(source),
    `an image Asset must be loaded once however many uniforms read it, without an upload of its own; got ${count(/= useLoader\(TextureLoader, classicTexture_/g)}`,
  );
  assert(
    count(/= useCompiledKtx2\(classicTexture_/g) === 1 &&
      count(/= useLoader\(XriftClassicShaderDataTextureLoader, classicTexture_/g) === 1 &&
      source.includes('import { XriftClassicShaderDataTextureLoader } from "./xrift-studio/classic-shader-data-texture";'),
    "a KTX2 Asset and an EXR Asset must each be read by their own loader",
  );
  assert(
    !source.includes("useCompiledTexture("),
    "the sampler state must be set by the shared builder, not by generated code",
  );
  for (const texture of fixtureTextureAssets()) {
    assert(
      result.assetCopyPlan.some((entry) => entry.assetId === texture.id && entry.supportedByCompiler),
      `the Texture ${texture.id} must be copied into the published world`,
    );
  }
  if (mode === "model") {
    assert(
      source.includes("meshName={object.name}"),
      "a Model slot must tell the Material which mesh wears it, for the variant",
    );
  }

  assertEditorAndWorldBuildTheSameMaterial(shader, emitted);
  assertUnreadableTexturesStopPublication();
  return result;
}

function assertEditorAndWorldBuildTheSameMaterial(
  authored: ClassicR3fMaterialShader,
  emitted: ClassicR3fMaterialShader,
): void {
  for (const meshName of ["", "Street_Lamp_02"]) {
    const textures = fixtureTextures();
    // The editor: Scene View, Play and the previews.
    const editor = createClassicR3fMaterial(authored, textures, meshName);
    // The generated world: what XriftClassicShaderMaterial runs.
    const world = createClassicShaderMaterial(emitted, { textures, meshName });
    assert(
      drawnState(editor) === drawnState(world),
      `the editor and the generated world must build the same Material for a mesh named "${meshName}"`,
    );
    assert(
      classicShaderDisablesFrustumCulling(editor) === (meshName !== ""),
      "only the mesh the variant names may leave frustum culling",
    );
    editor.dispose();
    world.dispose();
  }
}

function assertUnreadableTexturesStopPublication(): void {
  const blocked = (shader: ClassicR3fMaterialShader, textures: TextureAsset[]) =>
    compileShaderWorld(shader, "primitive", "classic-jsx", textures).result.diagnostics.filter(
      (entry) => entry.severity === "blocking" && entry.code === "classic-shader-texture-unavailable",
    );
  const base = fixtureShader();
  const cases: Array<[string, ClassicR3fMaterialShader["uniforms"], TextureAsset[]]> = [
    [
      "an HDR image on a sampler2D",
      { uPicture: { kind: "texture", textureAssetId: "hdr" } },
      [textureAsset("hdr", "sky.hdr", { usage: "environment" })],
    ],
    [
      "a KTX2 strip",
      { uLut: { kind: "texture-3d", textureAssetId: "ktx2" } },
      [textureAsset("ktx2", "lut.ktx2")],
    ],
    [
      "a strip that does not divide",
      { uLut: { kind: "texture-3d", textureAssetId: "odd", slices: 3 } },
      [
        textureAsset("odd", "odd.png", {
          importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: 8, width: 16, height: 4 },
        }),
      ],
    ],
    [
      "a missing Texture",
      { uPicture: { kind: "texture", textureAssetId: "gone" } },
      [],
    ],
  ];
  for (const [label, uniforms, textures] of cases) {
    const diagnostics = blocked({ ...base, uniforms }, textures);
    assert(
      diagnostics.length > 0,
      `${label} must stop publication with a reason instead of drawing something else`,
    );
    assert(
      diagnostics.every((entry) => entry.fieldPath?.includes(".shader.uniforms")),
      `${label} must point at the uniform that caused it`,
    );
  }
}

/**
 * The Runtime JSON loader, which browser publication draws with, builds the
 * same Materials from the same manifest.
 */
export async function runClassicShaderRuntimeManifestFixtureAssertions(): Promise<void> {
  // No textures: the loader reads its Assets over the network.
  const authored = fixtureShader();
  const shader: ClassicR3fMaterialShader = {
    ...authored,
    uniforms: Object.fromEntries(
      Object.entries(authored.uniforms).filter(
        ([, uniform]) =>
          uniform.kind !== "texture" &&
          uniform.kind !== "texture-3d" &&
          uniform.kind !== "texture-cube",
      ),
    ),
  };
  const { result, material } = compileShaderWorld(shader, "primitive", "classic-runtime", []);
  assert(
    result.canStage && result.runtimeManifestFile,
    `the Runtime JSON output must carry the shader: ${JSON.stringify(result.diagnostics.filter((entry) => entry.severity === "blocking"))}`,
  );
  const manifest = JSON.parse(result.runtimeManifestFile.content) as {
    assets: Record<string, { shader?: ClassicR3fMaterialShader }>;
  };
  assert(
    JSON.stringify(manifest.assets[material.id]?.shader?.uniforms) ===
      JSON.stringify(
        Object.fromEntries(
          Object.entries(shader.uniforms).sort(([left], [right]) => left.localeCompare(right)),
        ),
      ) &&
      manifest.assets[material.id]?.shader?.variants[0]?.blending === "additive" &&
      manifest.assets[material.id]?.shader?.variants[0]?.frustumCulled === false,
    "the Runtime JSON manifest must carry the new uniform kinds and variant settings",
  );

  const loaded = await new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" }).parse(manifest);
  try {
    const worn: Array<{ mesh: { frustumCulled: boolean }; material: ShaderMaterial }> = [];
    loaded.root.traverse((object) => {
      const mesh = object as { isMesh?: boolean; frustumCulled: boolean; material?: Material | Material[] };
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const candidate = mesh.material as ShaderMaterial | undefined;
      if (candidate?.isShaderMaterial && candidate.name === material.name) {
        worn.push({ mesh, material: candidate });
      }
    });
    assert(worn.length > 0, "the loader must put the Custom Shader on the meshes that use it");
    // A primitive has no name of its own, so it wears the fallback variant.
    const editor = createClassicR3fMaterial(shader, {}, "");
    for (const entry of worn) {
      assert(
        drawnState(entry.material) === drawnState(editor),
        "the Runtime JSON loader and the editor must build the same Material",
      );
      assert(
        entry.mesh.frustumCulled === true,
        "a mesh on the fallback variant must stay in frustum culling",
      );
    }
    editor.dispose();
    assert(
      new Set(worn.map((entry) => entry.material)).size === 1,
      "meshes on the same variant must share one Material, as they did",
    );
  } finally {
    disposeXriftLoadResult(loaded);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
