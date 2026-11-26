import {
  normalizeModelImportSettings,
  normalizeTextureImportSettings,
  type MaterialAsset,
  type ModelAsset,
  type TextureAsset,
} from "./asset-manifest";
import { BUILTIN_RECIPE_MODELS } from "./builtin-recipe-models";
import {
  catalogMaterialTextureSource,
  catalogMaterialTextures,
} from "./catalog-material-dependencies";
import { compileVisualProject } from "./compiler/compile";
import {
  isClassicR3fMaterialShader,
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
} from "./custom-shader-contract";
import { safeIdSegment } from "./document-id";
import { FOLIAGE_RECIPE_MODELS } from "./foliage-recipe-models";
import {
  FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID,
  FOLIAGE_SHADER_CATALOG,
  foliageMaterialAssetId,
  getFoliageMaterialAsset,
} from "./foliage-shader-catalog";
import {
  FOLIAGE_LEAVES_DEFINE,
  FOLIAGE_LEAVES_MESH_NAME,
} from "./foliage-shader-core";
import { FOLIAGE_TEXTURES } from "./foliage-textures";
import {
  LIGHTING_DRIVEN_UNIFORMS,
  usesLightingContract,
} from "./lighting-contract";
import { createPrototypeProject, ensureBuiltinMaterialAsset } from "./prototype-project";
import { SCENE_RECIPES, SCENE_RECIPE_IDS } from "./scene-recipe-catalog";
import { resolveSceneSettings } from "./scene-settings";
import { WIND_DRIVEN_UNIFORMS, usesWindContract } from "./wind-contract";

/**
 * Filesystem-free assertions for the foliage Material and the trees that wear
 * it: the shader's contract with the Scene and with the tree models, its
 * bundled pictures, the recipes, and what reaches a published world.
 *
 * Whether the GLSL compiles and what it draws is checked in a browser by
 * `e2e/foliage-trees.spec.ts`; whether the bundled files match the values
 * pinned here by `scripts/recipe-models.test.mjs`.
 */
export function runFoliageShaderFixtureAssertions(): void {
  assertShaderContract();
  assertParametersNameUniforms();
  assertBundledTextures();
  assertMaterialAsset();
  assertRecipes();
  assertPublishedWorld();
}

const DRIVEN_UNIFORMS = new Set<string>([
  "uTime",
  ...Object.values(WIND_DRIVEN_UNIFORMS),
  ...Object.values(LIGHTING_DRIVEN_UNIFORMS),
]);

function broadleaf(): ClassicR3fMaterialShader {
  const entry = FOLIAGE_SHADER_CATALOG.find((candidate) => candidate.id === "broadleaf");
  assert(entry, "the catalog must hold the broadleaf entry");
  return entry.shader;
}

function assertShaderContract(): void {
  for (const entry of FOLIAGE_SHADER_CATALOG) {
    const shader = entry.shader;
    assert(isClassicR3fMaterialShader(shader), `${entry.id} must be a classic-r3f shader`);
    const errors = validateClassicR3fMaterialShader(shader);
    assert(errors.length === 0, `${entry.id} must pass the Custom Shader validator: ${errors.join("; ")}`);

    // The Scene drives the clock, the wind and the key light. A foliage shader
    // with a sun or a wind of its own would disagree with everything around it.
    assert(shader.animatedTimeUniform === "uTime", `${entry.id} must run on the shared clock`);
    assert(usesWindContract(shader), `${entry.id} must read the Scene's wind`);
    assert(usesLightingContract(shader), `${entry.id} must read the Scene's key light`);
    for (const name of DRIVEN_UNIFORMS) {
      assert(shader.uniforms[name], `${entry.id} must declare ${name}`);
      assert(
        new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`).test(shader.vertexShader + shader.fragmentShader),
        `${entry.id} must read ${name} in its GLSL`,
      );
    }
    assert(
      !/uSunAzimuth|uSunElevation|uWind\b/.test(shader.vertexShader + shader.fragmentShader),
      `${entry.id} must not keep a private sun or wind`,
    );

    // Still air stops the tree: the wind rate scales the clock and the reach.
    assert(
      /float pace = max\(uWindSpeed, 0\.0\)/.test(shader.vertexShader) &&
        /float clock = uTime \* pace;/.test(shader.vertexShader) &&
        /float force = min\(pace, /.test(shader.vertexShader),
      `${entry.id} must stand still when the Scene's wind is zero`,
    );

    // Bark is the fallback and leaves are picked by mesh name, so both halves
    // of one model wear one Material.
    const [bark, leaves] = shader.variants;
    assert(shader.variants.length === 2 && bark && leaves, `${entry.id} must have a bark and a leaves variant`);
    assert(
      bark.meshNameIncludes === undefined && Object.keys(bark.defines).length === 0 && bark.side === "front",
      `${entry.id}: bark must be the fallback variant`,
    );
    assert(
      leaves.meshNameIncludes === FOLIAGE_LEAVES_MESH_NAME &&
        leaves.defines[FOLIAGE_LEAVES_DEFINE] === "1" &&
        leaves.side === "double" &&
        !leaves.transparent &&
        leaves.depthWrite,
      `${entry.id}: leaves must be cut out, two-sided and written to depth`,
    );

    // What the tree models carry per vertex.
    for (const attribute of ["_acrown", "_aleaf", "_acore"]) {
      assert(
        new RegExp(`attribute\\s+\\w+\\s+${attribute}\\s*;`).test(shader.vertexShader),
        `${entry.id} must read ${attribute} from the model`,
      );
    }

    // Fog and the frame's tone mapping, like every other surface in the Scene.
    assert(
      shader.vertexShader.includes("#include <fog_pars_vertex>") &&
        shader.vertexShader.includes("#include <fog_vertex>") &&
        shader.fragmentShader.includes("#include <fog_pars_fragment>") &&
        /#include <tonemapping_fragment>\s*#include <colorspace_fragment>\s*#include <fog_fragment>\s*}\s*$/.test(shader.fragmentShader),
      `${entry.id} must end with tone mapping, the output colour space and fog`,
    );

    // GLSL reserved words that look like good variable names. A driver refuses
    // the whole program for one of them, and a tree then draws nothing.
    const reserved = /\b(?:float|int|bool|vec[234]|mat[234])\s+(flat|smooth|sample|input|output|filter|half|patch|common|active|partition|centroid|precise|resource|common|layout)\b/;
    const offender = reserved.exec(shader.vertexShader) ?? reserved.exec(shader.fragmentShader);
    assert(!offender, `${entry.id} names a variable with a reserved word: ${offender?.[1]}`);
  }
}

function assertParametersNameUniforms(): void {
  for (const entry of FOLIAGE_SHADER_CATALOG) {
    const named = new Set<string>();
    for (const parameter of entry.parameters) {
      const uniform = entry.shader.uniforms[parameter.uniform];
      assert(uniform, `${entry.id}: the parameter ${parameter.uniform} must name a uniform`);
      assert(uniform.kind === parameter.kind, `${entry.id}: ${parameter.uniform} must be a ${parameter.kind}`);
      assert(!named.has(parameter.uniform), `${entry.id}: ${parameter.uniform} is listed twice`);
      named.add(parameter.uniform);
      if (parameter.kind === "number" && uniform.kind === "number") {
        assert(
          uniform.value >= parameter.min && uniform.value <= parameter.max,
          `${entry.id}: the default of ${parameter.uniform} must be inside its range`,
        );
      }
      assert(parameter.label.length > 0 && parameter.hint.length > 0, `${entry.id}: ${parameter.uniform} needs a label and a hint`);
    }
    // Every value an author can change has a readable name in the Inspector.
    for (const [name, uniform] of Object.entries(entry.shader.uniforms)) {
      if (DRIVEN_UNIFORMS.has(name) || uniform.kind === "texture") continue;
      assert(named.has(name), `${entry.id}: the uniform ${name} has no parameter`);
    }
  }
}

function assertBundledTextures(): void {
  const shader = broadleaf();
  const material = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  assert(material, "the foliage Material must resolve by its Asset id");
  const textures = catalogMaterialTextures(catalogMaterialTextureSource(material));
  assert(
    textures.length === 2 &&
      textures.every((texture) => texture.mimeType === "image/webp") &&
      new Set(textures.map((texture) => texture.assetId)).size === 2,
    "the foliage Material must bring its two WebP pictures",
  );
  // Without the shader, the walk finds nothing: the pictures hang on uniforms.
  assert(
    catalogMaterialTextures(material.properties).length === 0,
    "the pictures must be found through the shader's uniforms",
  );
  for (const definition of FOLIAGE_TEXTURES) {
    const stem = definition.fileName.replace(/\.[^.]+$/, "");
    assert(
      definition.assetId === `texture-${safeIdSegment(stem)}-${definition.sha256.slice(0, 12)}`,
      `${definition.fileName} must pin the id the import pipeline derives`,
    );
    assert(
      definition.publicPath.endsWith(`/${definition.fileName}`) && /^[0-9a-f]{64}$/.test(definition.sha256),
      `${definition.fileName} must name its public file and hash`,
    );
  }
  for (const name of ["uLeafMap", "uBarkMap"]) {
    const uniform = shader.uniforms[name];
    assert(
      uniform?.kind === "texture" &&
        FOLIAGE_TEXTURES.some((texture) => texture.assetId === uniform.textureAssetId) &&
        uniform.colorSpace === "srgb" &&
        uniform.generateMipmaps === true &&
        uniform.filter === "linear" &&
        (uniform.anisotropy ?? 1) > 1,
      `${name} must sample a bundled picture as sRGB colour through mip levels, with anisotropic filtering`,
    );
  }
}

function assertMaterialAsset(): void {
  const first = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  const second = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  assert(first && second && first !== second, "each project gets its own copy of the Material");
  assert(
    first.id === foliageMaterialAssetId("broadleaf") &&
      first.attribution?.licenseName === "MIT" &&
      first.attribution.providerId === "xrift-foliage-shaders" &&
      first.sourceHash?.endsWith(":broadleaf"),
    "the Material must say where it came from",
  );
  // An author's edit stays in the author's project.
  assert(isClassicR3fMaterialShader(first.shader), "the Material must carry the shader");
  first.shader.uniforms.uSway = { kind: "number", value: 0 };
  const fresh = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  assert(
    isClassicR3fMaterialShader(fresh?.shader) &&
      fresh.shader.uniforms.uSway?.kind === "number" &&
      fresh.shader.uniforms.uSway.value === 1 &&
      broadleaf().uniforms.uSway?.kind === "number" &&
      (broadleaf().uniforms.uSway as { value: number }).value === 1,
    "editing a project's Material must not reach the catalog",
  );
  assert(getFoliageMaterialAsset("foliage-shader-unknown-material") === undefined, "an unknown id resolves to nothing");

  const prototype = createPrototypeProject("world", "fixture-foliage-material");
  assert(!prototype.assets.assets[FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID], "a new project does not carry the Material");
  const ensured = ensureBuiltinMaterialAsset(prototype.assets, FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID);
  assert(
    ensured.assets[FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID]?.kind === "material" &&
      ensureBuiltinMaterialAsset(ensured, FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID) === ensured,
    "placing a tree brings the Material once",
  );
}

function assertRecipes(): void {
  const ids = [
    SCENE_RECIPE_IDS.foliageBroadleaf,
    SCENE_RECIPE_IDS.foliageBroadleafLight,
    SCENE_RECIPE_IDS.foliageGardenTree,
    SCENE_RECIPE_IDS.foliageGardenTreeLight,
    SCENE_RECIPE_IDS.foliageShrub,
    SCENE_RECIPE_IDS.foliageShrubLight,
  ];
  const foliageModelIds = new Set(FOLIAGE_RECIPE_MODELS.map((model) => model.modelId));
  const placed = new Set<string>();
  for (const id of ids) {
    const recipe = SCENE_RECIPES.find((candidate) => candidate.id === id);
    assert(recipe, `the recipe ${id} must be on the shelf`);
    assert(recipe.category === "nature", `${id} belongs to the nature category`);
    const [part] = recipe.parts;
    assert(
      recipe.parts.length === 1 &&
        part?.kind === "model" &&
        part.materialAssetId === FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID &&
        foliageModelIds.has(part.modelId),
      `${id} must place one tree model wearing the foliage Material`,
    );
    // The model stands on the ground it is placed on.
    assert(
      part.position.every((value) => value === 0) && part.scale.every((value) => value === 1),
      `${id} must place its tree at the recipe's origin at its own size`,
    );
    // A lighter tree says so in its name, and is the lighter file.
    const light = id.endsWith("-light");
    assert(
      recipe.name.includes("軽量版") === light && part.modelId.endsWith("Light") === light,
      `${id} must name the lighter model, and only that one, as the lighter version`,
    );
    placed.add(part.modelId);
  }
  assert(
    placed.size === ids.length && placed.size === foliageModelIds.size,
    "every bundled tree model must be placed by one recipe of its own",
  );
  for (const model of FOLIAGE_RECIPE_MODELS) {
    const stem = model.fileName.replace(/\.glb$/, "");
    assert(
      model.assetId === `model-${safeIdSegment(stem)}-${model.sha256.slice(0, 12)}` &&
        BUILTIN_RECIPE_MODELS.includes(model),
      `${model.fileName} must be a bundled recipe model with the id its import derives`,
    );
    assert(model.byteLength < 1_000_000, `${model.fileName} must stay under 1 MB`);
    const lighter = FOLIAGE_RECIPE_MODELS.find((candidate) => candidate.modelId === `${model.modelId}Light`);
    if (!model.modelId.endsWith("Light")) {
      assert(
        lighter && lighter.byteLength < model.byteLength * 0.6,
        `${model.fileName} must come with a version that is clearly lighter`,
      );
    }
  }
}

function textureAsset(definition: (typeof FOLIAGE_TEXTURES)[number]): TextureAsset {
  return {
    id: definition.assetId,
    name: definition.displayName,
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: `assets/textures/${definition.fileName}` },
    importSettings: normalizeTextureImportSettings({ colorSpace: "srgb" }),
    importMetadata: {
      sourceFormat: "webp",
      mimeType: "image/webp",
      byteLength: definition.byteLength,
      width: definition.width,
      height: definition.height,
    },
  };
}

function assertPublishedWorld(): void {
  const prototype = createPrototypeProject("world", "fixture-foliage-world");
  const material = getFoliageMaterialAsset(FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID) as MaterialAsset;
  const model: ModelAsset = {
    id: "fixture-foliage-model",
    name: "Tree",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/models/tree.glb" },
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [
      { slot: "bark", name: "bark", sourceMaterialIndex: 0 },
      { slot: "leaves", name: "leaves", sourceMaterialIndex: 1 },
    ],
  };
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = { kind: "asset", assetId: model.id };
      component.materialBindings = model.materialSlots.map((slot) => ({
        slot: slot.slot,
        materialAssetId: material.id,
      }));
    }
  }
  prototype.assets.assets[material.id] = material;
  prototype.assets.assets[model.id] = model;
  for (const definition of FOLIAGE_TEXTURES) {
    prototype.assets.assets[definition.assetId] = textureAsset(definition);
  }
  const result = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [prototype.scene.sceneId]: prototype.scene },
      assets: prototype.assets,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-11-26T00:00:00.000Z", outputMode: "classic-jsx" },
  );
  assert(
    result.canStage,
    `a world with a tree must compile: ${JSON.stringify(result.diagnostics.filter((entry) => entry.severity === "blocking"))}`,
  );
  const source = result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  assert(
    source.includes("<XriftClassicShaderMaterial attach={attach} meshName={meshName} shader={CLASSIC_SHADER_") &&
      source.includes("meshName={object.name}"),
    "the published tree must pick its variant from the mesh it is put on",
  );
  // Each picture is loaded once and copied into the world.
  assert(
    (source.match(/= useLoader\(TextureLoader, classicTexture_/g) ?? []).length === FOLIAGE_TEXTURES.length,
    "the published world must load each foliage picture once",
  );
  for (const definition of FOLIAGE_TEXTURES) {
    assert(
      result.assetCopyPlan.some((entry) => entry.assetId === definition.assetId && entry.supportedByCompiler),
      `${definition.fileName} must be copied into the published world`,
    );
  }
  // The Scene's wind and key light replace the Material's own defaults.
  const literal = /const CLASSIC_SHADER_\w+: XriftClassicShader = (\{.*\});/.exec(source)?.[1];
  assert(literal, "the published world must carry the shader descriptor");
  const published = JSON.parse(literal) as ClassicR3fMaterialShader;
  const windSpeed = published.uniforms.uWindSpeed;
  const sunIntensity = published.uniforms.uSunIntensity;
  assert(
    windSpeed?.kind === "number" &&
      windSpeed.value === resolveSceneSettings(prototype.scene.settings).vegetation.windSpeed &&
      sunIntensity?.kind === "number" &&
      sunIntensity.value === 2.4,
    "the published tree must be blown and lit by the Scene, not by the Material's defaults",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
