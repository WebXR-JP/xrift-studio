// Emit the actual publication outputs, and the Texture files they read, for
// the Custom Shader render parity checks.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));

// The plane is placed by a mat4 and one row of a vec3 array, and slides with
// the clock. Row 0 of the array would throw it out of view.
const VERTEX = `uniform mat4 uPlacement;
uniform vec3 uOffsets[2];
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 placed = uPlacement * vec4(position + uOffsets[1], 1.0);
  placed.x += 0.2 * sin(uTime);
  gl_Position = projectionMatrix * modelViewMatrix * placed;
}`;
// Six bands from the bottom, one uniform kind each, so that a pixel in a band
// has one known colour.
const FRAGMENT = `uniform sampler2D uPicture;
uniform sampler2D uData;
uniform sampler3D uLut;
uniform samplerCube uSky;
uniform mat3 uColorMatrix;
uniform float uWeights[4];
uniform vec3 uTint;
uniform float uGain;
varying vec2 vUv;
vec3 faceDirection(float face) {
  if (face < 1.0) return vec3(1.0, 0.0, 0.0);
  if (face < 2.0) return vec3(-1.0, 0.0, 0.0);
  if (face < 3.0) return vec3(0.0, 1.0, 0.0);
  if (face < 4.0) return vec3(0.0, -1.0, 0.0);
  if (face < 5.0) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0, 0.0, -1.0);
}
void main() {
  float band = floor(vUv.y * 6.0);
  vec3 color;
  if (band < 1.0) {
    color = texture2D(uPicture, vec2(vUv.x, fract(vUv.y * 6.0))).rgb;
  } else if (band < 2.0) {
    // Across the columns of row 1 in slice 3 of the 3D table.
    color = texture(uLut, vec3(vUv.x, 0.375, 0.875)).rgb;
  } else if (band < 3.0) {
    color = textureCube(uSky, faceDirection(floor(vUv.x * 6.0))).rgb;
  } else if (band < 4.0) {
    // The file holds 4.0 in green and 1000.3 in blue: an 8-bit picture loses
    // the first and a half float the second.
    vec4 data = texture2D(uData, vec2(vUv.x, 0.5));
    color = vec3(data.r * 0.25, data.g * 0.125, data.b - 1000.0);
  } else if (band < 5.0) {
    float quarter = floor(vUv.x * 4.0);
    float weight = quarter < 1.0 ? uWeights[0] : quarter < 2.0 ? uWeights[1] : quarter < 3.0 ? uWeights[2] : uWeights[3];
    color = uColorMatrix * vec3(1.0, 0.5, 0.25) * weight;
  } else {
    color = uTint * uGain;
  }
  gl_FragColor = vec4(color, 1.0);
#ifdef GLOW
  gl_FragColor.rgb *= 0.5;
#endif
}`;

// A plane that reads two pictures through five samplers, each drawn much
// smaller than it is, so that only a sampler that reads mip levels shows the
// average of the picture. Five bands from the bottom.
const SAMPLER_VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SAMPLER_FRAGMENT = `uniform sampler2D uPlain;
uniform sampler2D uMipped;
uniform sampler2D uMippedNearest;
uniform sampler2D uFlat;
uniform sampler2D uSlanted;
varying vec2 vUv;
void main() {
  // The checker tiled 7.3 times: one pixel of the frame covers almost six texels.
  vec2 tiled = vUv * 7.3;
  // The stripes squeezed along x only, as a floor is seen at a slant: one
  // pixel covers 32 texels across and 4 down.
  vec2 slanted = vec2(vUv.x * 40.0, vUv.y * 5.0);
  // Every sampler is read outside the branch, where its derivatives are defined.
  vec3 plain = texture2D(uPlain, tiled).rgb;
  vec3 mipped = texture2D(uMipped, tiled).rgb;
  vec3 mippedNearest = texture2D(uMippedNearest, tiled).rgb;
  vec3 flat_ = texture2D(uFlat, slanted).rgb;
  vec3 slantedColor = texture2D(uSlanted, slanted).rgb;
  float band = floor(vUv.y * 5.0);
  vec3 color = band < 1.0 ? plain : band < 2.0 ? mipped : band < 3.0 ? mippedNearest : band < 4.0 ? flat_ : slantedColor;
  gl_FragColor = vec4(color, 1.0);
}`;

/** An 8-bit RGBA PNG, top row first. */
function png(width, height, texel) {
  const row = width * 4 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raw.set(texel(x, y), y * row + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

(async () => {
  const load = (file) => import(pathToFileURL(path.resolve(file)).href);
  const { createPrototypeProject } = await load("src/lib/visual-editor/prototype-project.ts");
  const { normalizeMaterialProperties, normalizeTextureImportSettings } = await load("src/lib/visual-editor/asset-manifest.ts");
  const { BUILTIN_PRIMITIVE_CREATION_CATALOG } = await load("src/lib/visual-editor/creation-catalog.ts");
  const { createBuiltinPrimitiveMeshComponent, createTransformComponent } = await load("src/lib/visual-editor/scene-document.ts");
  const { compileVisualProject } = await load("src/lib/visual-editor/compiler/compile.ts");
  const { DataTexture, FloatType, RGBAFormat } = await import("three");
  const { EXRExporter } = await import("three/examples/jsm/exporters/EXRExporter.js");

  // A 16 x 16 picture of 32-bit floats: red rises from 0 to 2 across it.
  const side = 16;
  const floats = new Float32Array(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) floats.set([(2 * x) / (side - 1), 4, 1000.3, 1], (y * side + x) * 4);
  }
  const exr = Buffer.from(await new EXRExporter().parse(new DataTexture(floats, side, side, RGBAFormat, FloatType), { type: FloatType }));

  // +X, -X, +Y, -Y, +Z, -Z. The grey face shows that the cube is read as sRGB.
  const faceColors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [128, 128, 128]];
  const files = {
    "parity-picture": { name: "picture.png", bytes: png(8, 8, (x, y) => [x * 36, y * 36, ((x ^ y) & 1) * 255, 255]), width: 8, height: 8 },
    // Four 4 x 4 slices side by side. Red is the slice, green the column and
    // blue the row counted from the top, so a lookup shows which axis is which.
    "parity-lut": { name: "lut.png", bytes: png(16, 4, (x, y) => [(x >> 2) * 85, (x & 3) * 85, y * 85, 255]), width: 16, height: 4 },
    "parity-data": { name: "data.exr", bytes: exr, environment: true },
    // Black and white texels in turn: any average of it is mid grey, and any
    // single texel is not.
    "parity-checker": { name: "checker.png", bytes: png(64, 64, (x, y) => { const v = ((x ^ y) & 1) * 255; return [v, v, v, 255]; }), width: 64, height: 64 },
    // Rows of black and white, eight texels each: grey once averaged down, but
    // unchanged along x.
    "parity-stripes": { name: "stripes.png", bytes: png(64, 64, (_x, y) => { const v = ((y >> 3) & 1) * 255; return [v, v, v, 255]; }), width: 64, height: 64 },
    ...Object.fromEntries(faceColors.map((color, face) => [
      `parity-face-${face}`,
      { name: `face-${face}.png`, bytes: png(4, 4, () => [...color, 255]), width: 4, height: 4 },
    ])),
  };
  const textures = Object.entries(files).map(([id, file]) => ({
    id, name: id, kind: "texture", status: "ready",
    source: { kind: "project", relativePath: `assets/textures/${file.name}` },
    importSettings: normalizeTextureImportSettings(),
    ...(file.environment ? { usage: "environment" } : {
      importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: file.bytes.length, width: file.width, height: file.height },
    }),
  }));

  const uniforms = {
    uTime: { kind: "number", value: 0 },
    uGain: { kind: "number", value: 1.5 },
    uTint: { kind: "color", value: "#808080" },
    // mat4, column-major: scale 1.2, then the last column moves the plane.
    uPlacement: { kind: "matrix", value: [1.2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1, 0, 0.1, -0.1, 0, 1] },
    // mat3, column-major: read by rows it gives another colour.
    uColorMatrix: { kind: "matrix", value: [0.2, 0.6, 0, 0, 0.3, 0.5, 0.4, 0, 0.1] },
    uOffsets: { kind: "array", value: [9, 9, 9, 0.05, 0.1, 0] },
    uWeights: { kind: "array", value: [1, 0.75, 0.5, 0.25] },
    uPicture: { kind: "texture", textureAssetId: "parity-picture", filter: "nearest", wrapS: "clamp-to-edge", wrapT: "clamp-to-edge" },
    // A table of numbers is read texel by texel.
    uData: { kind: "texture", textureAssetId: "parity-data", filter: "nearest" },
    uLut: { kind: "texture-3d", textureAssetId: "parity-lut" },
    uSky: { kind: "texture-cube", faces: faceColors.map((_color, face) => ({ textureAssetId: `parity-face-${face}` })), colorSpace: "srgb" },
  };
  const material = (id, name, variants) => ({
    id, name, kind: "material", status: "ready", source: { kind: "document" },
    properties: normalizeMaterialProperties({}),
    shader: {
      kind: "classic-r3f", sourceModulePath: "e2e://custom-shader-parity",
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, variants, animatedTimeUniform: "uTime",
    },
  });
  const materials = [
    material("custom-shader-parity", "Custom Shader parity", [
      { name: "default", defines: {}, side: "double", transparent: false, depthWrite: true },
    ]),
    // The same shader as a lamp glow: added to the frame and kept out of culling.
    material("custom-shader-parity-glow", "Custom Shader parity glow", [
      { name: "glow", defines: { GLOW: "1" }, side: "double", transparent: true, depthWrite: false, blending: "additive", frustumCulled: false },
    ]),
    // The sampler options: mip levels with each filter, and anisotropy.
    {
      id: "custom-shader-parity-samplers", name: "Custom Shader parity samplers", kind: "material", status: "ready", source: { kind: "document" },
      properties: normalizeMaterialProperties({}),
      shader: {
        kind: "classic-r3f", sourceModulePath: "e2e://custom-shader-parity-samplers",
        vertexShader: SAMPLER_VERTEX, fragmentShader: SAMPLER_FRAGMENT,
        uniforms: {
          uPlain: { kind: "texture", textureAssetId: "parity-checker" },
          uMipped: { kind: "texture", textureAssetId: "parity-checker", generateMipmaps: true },
          uMippedNearest: { kind: "texture", textureAssetId: "parity-checker", generateMipmaps: true, filter: "nearest" },
          uFlat: { kind: "texture", textureAssetId: "parity-stripes", generateMipmaps: true },
          uSlanted: { kind: "texture", textureAssetId: "parity-stripes", generateMipmaps: true, anisotropy: 8 },
        },
        variants: [{ name: "default", defines: {}, side: "double", transparent: false, depthWrite: true }],
      },
    },
  ];

  // Three planes at the origin, one per Material, and nothing else to draw.
  const project = createPrototypeProject("world", "custom-shader-render-parity");
  for (const asset of [...textures, ...materials]) project.assets.assets[asset.id] = asset;
  const plane = BUILTIN_PRIMITIVE_CREATION_CATALOG.find((definition) => definition.primitive === "plane");
  if (!plane) throw new Error("The creation catalog has no plane");
  const entities = materials.map((entry) => ({
    id: `entity-${entry.id}`, name: entry.name, parentId: null, children: [], enabled: true,
    components: [
      createTransformComponent(`transform-${entry.id}`),
      createBuiltinPrimitiveMeshComponent(`mesh-${entry.id}`, plane, [{ slot: "default", materialAssetId: entry.id }]),
    ],
  }));
  project.scene.entities = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
  project.scene.rootEntityIds = entities.map((entity) => entity.id);
  const settings = project.scene.settings;
  settings.skybox.enabled = false;
  settings.skybox.iblEnabled = false;
  settings.postprocessing.enabled = false;
  settings.postprocessing.hdr.enabled = false;
  settings.fog.enabled = false;
  const compile = (outputMode) => {
    const output = compileVisualProject(
      { project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs },
      { outputMode },
    );
    if (!output.canStage) throw new Error(`${outputMode}: ${JSON.stringify(output.diagnostics.filter((entry) => entry.severity === "blocking"))}`);
    return output;
  };
  const jsx = compile("classic-jsx");
  const runtime = compile("classic-runtime");

  const root = path.resolve("node_modules/.cache/xrift-studio/custom-shader-render-parity");
  fs.rmSync(root, { recursive: true, force: true });
  const write = (relativePath, content) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  // The Texture files, under the names each published output asks for.
  const published = {};
  for (const output of [jsx, runtime]) {
    for (const [id, file] of Object.entries(files)) {
      const entry = output.assetCopyPlan.find((candidate) => candidate.assetId === id && candidate.supportedByCompiler);
      if (!entry) throw new Error(`A published output does not carry the Texture ${id}`);
      write(entry.targetRelativePath, file.bytes);
      published[`assets/textures/${file.name}`] = entry.targetRelativePath.replace(/^public\//, "");
    }
  }
  write(runtime.runtimeManifestFile.relativePath, runtime.runtimeManifestFile.content);
  for (const file of jsx.overlayFiles) {
    if (!/\.(ts|tsx|js)$/.test(file.relativePath)) continue;
    let source = file.content;
    if (file.relativePath === "src/World.tsx") {
      // The emitted World, unchanged. Its two Material components and the
      // documents they were compiled from are exported for the page.
      const names = materials.slice(0, 2).map((entry) => {
        const stem = entry.id.replace(/[^a-zA-Z0-9_$]+/g, "_");
        const name = new RegExp(`^const (CompiledMaterial_${stem}_[0-9a-f]{8}):`, "m").exec(source)?.[1];
        if (!name) throw new Error(`Published Custom Shader component not emitted for ${entry.id}`);
        return name;
      });
      source += `\nexport { ${names[0]} as PublishedCustomShaderMaterial, ${names[1]} as PublishedCustomShaderGlowMaterial };\n`;
      source += `export const parityAssets = ${JSON.stringify(project.assets)};\n`;
      source += `export const parityEntities = ${JSON.stringify(entities)};\n`;
      source += `export const parityFiles = ${JSON.stringify(published)};\n`;
      source += `export const parityRuntimeManifest = ${JSON.stringify(runtime.runtimeManifestFile.relativePath)};\n`;
    }
    write(file.relativePath, source);
  }
  console.log("Prepared actual published Custom Shader outputs for render parity");
})().catch((error) => { console.error(error); process.exitCode = 1; });
