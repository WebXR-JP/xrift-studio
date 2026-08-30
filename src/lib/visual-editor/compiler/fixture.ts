import {
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type AudioAsset,
  type AssetManifest,
  type MaterialAsset,
  type ModelAsset,
  type TextureAsset,
} from "../asset-manifest";
import { instantiateSceneAsset } from "../asset-placement";
import {
  getKhrInteractivityOnStartAnimationCues,
  KHR_INTERACTIVITY_EXTENSION_NAME,
  KHR_INTERACTIVITY_SPEC_STATUS,
} from "../interactivity-graph";
import {
  createInteractionTriggerGraphExtension,
  createModelAnimationGraphExtension,
} from "../interactivity-recipes";
import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
} from "../component-registry";
import {
  createPrefabAsset,
  PREFAB_DOCUMENT_SCHEMA_VERSION,
  type PrefabDocument,
} from "../prefab-document";
import {
  PARTICLE_AUTHORING_PRESETS,
  addDefaultParticleAsset,
  scaleParticleEmission,
  updateParticleAsset,
} from "../particle-system";
import {
  addBuiltinPrimitiveEntity,
  addTerrainEntity,
  createBoxColliderComponent,
  createInteractionTriggerComponent,
  createMeshColliderComponent,
  createTextComponent,
  createRigidBodyComponent,
  createTransformComponent,
  createVegetationWindComponent,
  type ColliderComponent,
  type MeshComponent,
  type SceneDocument,
  type SceneEntity,
} from "../scene-document";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import { applyWaterShaderCatalogInstall } from "../external-store";
import { WATER_SHADER_CATALOG } from "../water-shader-catalog";
import {
  createTerrainFromPreset,
  getTerrainPreset,
} from "../terrain-presets";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
} from "../prototype-project";
import {
  OPEN_BRUSH_BRUSH_BASE_URL,
  OPEN_BRUSH_EXTENSION_NAMES,
  OPEN_BRUSH_RUNTIME_PACKAGE,
} from "../open-brush";
import { resolveSceneSettings } from "../scene-settings";
import {
  compilePrototypeVisualProject,
  compileVisualProject,
  isVisualCompilationStale,
} from "./compile";
import { sha256Utf8 } from "./hash";
import type { VisualCompilerDocuments } from "./types";

export type VisualCompilerFixtureSources = {
  textured: string;
  model: string;
  interactive: string;
  particle: string;
};

/** Lightweight fixture assertions that can run in a browser or a TS test runner. */
export function runVisualCompilerFixtureAssertions(
  captureSources?: (sources: VisualCompilerFixtureSources) => void,
): void {
  assert(
    sha256Utf8("abc") ===
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "SHA-256 fixture failed",
  );
  const legacySkyboxSettings = resolveSceneSettings({
    skybox: {
      enabled: true,
      imageAssetId: "legacy-environment",
      topColor: "#87ceeb",
      bottomColor: "#ffffff",
      offset: 0,
      exponent: 1,
      rotationDegrees: 0,
      flipY: false,
      exposure: 1,
    },
  }).skybox;
  assert(
    legacySkyboxSettings.projection === "infinite" &&
      legacySkyboxSettings.iblEnabled &&
      legacySkyboxSettings.meshScale.join(",") === "100,100,100" &&
      legacySkyboxSettings.center.join(",") === "0,0.01,0",
    "Legacy Skybox settings must resolve to the compatible infinite projection",
  );
  const legacyRenderSettings = resolveSceneSettings({
    postprocessing: {
      enabled: true,
      bloom: { enabled: true, threshold: 2, strength: 0.1, radius: 0.2 },
      exposure: 0.9,
    },
  });
  assert(
    legacyRenderSettings.postprocessing.hdr.enabled &&
      legacyRenderSettings.postprocessing.hdr.toneMapping === "aces" &&
      legacyRenderSettings.postprocessing.ao.enabled &&
      legacyRenderSettings.vegetation.enabled,
    "Legacy Scene settings must resolve HDR, AO, and vegetation defaults",
  );

  const newWorld = toCompilerDocuments(
    createPrototypeProject("world", "fixture-world"),
  );
  // A new Scene ships with the skybox off, so a gradient sky is something the
  // author switches on. These assertions are about emitting one, not about the
  // default, so the fixture asks for it explicitly.
  const world = {
    ...newWorld,
    scenes: Object.fromEntries(
      Object.entries(newWorld.scenes).map(([sceneId, scene]) => [
        sceneId,
        {
          ...scene,
          settings: {
            ...resolveSceneSettings(scene.settings),
            skybox: {
              ...resolveSceneSettings(scene.settings).skybox,
              enabled: true,
            },
          },
        },
      ]),
    ),
  };
  const fixedTime = "2026-01-01T00:00:00.000Z";
  const first = compileVisualProject(world, { generatedAt: fixedTime });
  const second = compileVisualProject(world, { generatedAt: fixedTime });
  assert(JSON.stringify(first) === JSON.stringify(second), "Compiler output is not deterministic");
  assert(first.canStage, "Default world fixture should be stageable");
  const defaultWorldSource =
    first.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  [
    "XRiftStudioProjectedSkybox",
    "new SphereGeometry(1, 32, 20)",
    "useFrame(({ camera })",
    "uExposure: { value: 1 }",
    "ACESFilmicToneMapping",
  ].forEach((fragment) =>
    assert(
      defaultWorldSource.includes(fragment),
      `Infinite gradient Skybox source is missing: ${fragment}`,
    ),
  );
  // Post effects are off in a new scene, so a default world must not carry the
  // compositor at all. Keeping the colour handling is deliberate: dropping ACES
  // and the exposure would shift every material.
  assert(
    defaultWorldSource.includes("XRiftStudioToneMapping"),
    "A world without post effects must still apply the authored tone mapping",
  );
  ["new SSAOPass", "EffectComposer", "HalfFloatType", "UnrealBloomPass"].forEach(
    (fragment) =>
      assert(
        !defaultWorldSource.includes(fragment),
        `A world with post effects off must not build the compositor: ${fragment}`,
      ),
  );
  const postprocessingWorld = toCompilerDocuments(
    createPrototypeProject("world", "fixture-postprocessing"),
  );
  const postprocessingScene =
    postprocessingWorld.scenes[postprocessingWorld.project.entrySceneId];
  const enabledPostprocessing = compileVisualProject(
    {
      ...postprocessingWorld,
      scenes: {
        [postprocessingScene.sceneId]: {
          ...postprocessingScene,
          settings: {
            ...resolveSceneSettings(postprocessingScene.settings),
            postprocessing: {
              ...resolveSceneSettings(postprocessingScene.settings)
                .postprocessing,
              enabled: true,
            },
          },
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const enabledPostprocessingSource =
    enabledPostprocessing.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  // The pipeline itself is no longer inlined into World.tsx: the compiler ships
  // the editor's own compositor module, so a published world grades colour with
  // the same code the author was looking at.
  const postprocessingOverlay = enabledPostprocessing.overlayFiles.find(
    (file) => file.relativePath === "src/xrift-studio/scene-postprocessing.tsx",
  );
  assert(
    postprocessingOverlay !== undefined,
    "An explicitly enabled postprocessing world did not ship the compositor",
  );
  [
    "HalfFloatType",
    "new SSAOPass",
    "ACESFilmicToneMapping",
    "uSaturation",
    "uTemperature",
  ].forEach((fragment) =>
    assert(
      postprocessingOverlay.content.includes(fragment),
      `The shipped compositor is missing: ${fragment}`,
    ),
  );
  [
    'import { ScenePostprocessing } from "./xrift-studio/scene-postprocessing"',
    "<ScenePostprocessing settings={",
  ].forEach((fragment) =>
    assert(
      enabledPostprocessingSource.includes(fragment),
      `An explicitly enabled postprocessing world is missing: ${fragment}`,
    ),
  );
  assert(
    !defaultWorldSource.includes('FC<{ settings: {"enabled":'),
    "Generated postprocessing props must not infer literal Scene values as their TypeScript type",
  );
  const windWorld = toCompilerDocuments(
    createPrototypeProject("world", "fixture-wind-world"),
  );
  const windScene = windWorld.scenes[windWorld.project.entrySceneId];
  const windEntity = Object.values(windScene.entities)[0];
  const windComponent = createVegetationWindComponent("fixture-wind-component");
  assert(windEntity && windComponent, "Wind compiler fixture could not create a target");
  const windResult = compileVisualProject(
    {
      ...windWorld,
      scenes: {
        ...windWorld.scenes,
        [windScene.sceneId]: {
          ...windScene,
          entities: {
            ...windScene.entities,
            [windEntity.id]: {
              ...windEntity,
              components: [...windEntity.components, windComponent],
            },
          },
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const windWorldSource =
    windResult.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(windResult.canStage, "A World with an explicit Wind component must be stageable");
  assert(
    !windResult.diagnostics.some(
      (diagnostic) => diagnostic.code === "component-unsupported",
    ),
    "Wind must not be reported as an unsupported component",
  );
  assert(
    windWorldSource.includes("XRiftStudioWind") &&
      windWorldSource.includes(windEntity.id),
    "Wind must compile into the scene-level runtime with its explicit Entity target",
  );
  assert(
    JSON.stringify(first.stagingPlan.requiredPublicationFiles) ===
      JSON.stringify([
        {
          purpose: "thumbnail",
          sourceRelativePath: "public/thumbnail.png",
          targetRelativePath: "public/thumbnail.png",
        },
      ]),
    "The required publication thumbnail must be staged separately from Assets",
  );
  assert(
    !first.stagingPlan.assetCopyPlan.some(
      (entry) =>
        entry.sourceRelativePath === "public/thumbnail.png" ||
        entry.targetRelativePath === "public/thumbnail.png",
    ),
    "The publication thumbnail must not be added to the Asset copy plan",
  );
  const terrainAdded = addTerrainEntity(
    world.scenes[world.project.entrySceneId],
    world.assets,
    BUILTIN_ASSET_IDS.material.green,
    { width: 12, depth: 10, resolution: 17 },
  );
  assert(terrainAdded, "Terrain compiler fixture could not create Terrain");
  const terrainResult = compileVisualProject(
    {
      ...world,
      scenes: { [terrainAdded.scene.sceneId]: terrainAdded.scene },
    },
    { generatedAt: fixedTime },
  );
  const terrainSource =
    terrainResult.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
      terrainResult.canStage &&
      terrainSource.includes("function XriftTerrainGeometry") &&
      terrainSource.includes("Float32BufferAttribute") &&
      terrainSource.includes("terrain.holes?.[cell]") &&
      // The terrain payload is a shared module constant so the surface mesh
      // and the grass reference one copy of the height field.
      /<XriftTerrainGeometry terrain=\{XRIFT_TERRAIN_DATA_\w+\}/.test(terrainSource) &&
      /const XRIFT_TERRAIN_DATA_\w+: XriftTerrainGeometryData = \{"width"/.test(terrainSource) &&
      terrainSource.includes('colliders="trimesh"'),
    "Terrain must compile with its generated geometry and fixed Trimesh Collider",
  );
  const publicationOnlyWorld: VisualCompilerDocuments = {
    ...world,
    project: {
      ...world.project,
      metadata: {
        ...world.project.metadata,
        createdAt: "2025-12-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      lastPublication: {
        uploadedAt: "2026-01-02T00:00:00.000Z",
        worldId: "fixture-world-id",
        versionNumber: 2,
      },
    },
  };
  const publicationOnlyResult = compileVisualProject(publicationOnlyWorld, {
    generatedAt: fixedTime,
  });
  assert(
    JSON.stringify(first.provenance.sourceDocuments) ===
      JSON.stringify(publicationOnlyResult.provenance.sourceDocuments),
    "Publication metadata and audit timestamps must not affect compiler source hashes",
  );
  assert(
    first.stagingPlan.stagingDirectoryName ===
      publicationOnlyResult.stagingPlan.stagingDirectoryName,
    "Publication metadata must not change the project staging identity",
  );
  const changedTitleResult = compileVisualProject(
    {
      ...world,
      project: {
        ...world.project,
        metadata: {
          ...world.project.metadata,
          title: `${world.project.metadata.title} changed`,
        },
      },
    },
    { generatedAt: fixedTime },
  );
  assert(
    JSON.stringify(first.provenance.sourceDocuments) !==
      JSON.stringify(changedTitleResult.provenance.sourceDocuments),
    "Compilation-relevant project metadata must still affect compiler source hashes",
  );
  assert(
    first.stagingPlan.stagingDirectoryName ===
      changedTitleResult.stagingPlan.stagingDirectoryName,
    "Authoring changes must reuse the staging identity for the same projectId",
  );
  const differentProjectResult = compileVisualProject(
    {
      ...world,
      project: {
        ...world.project,
        projectId: `${world.project.projectId}-copy`,
      },
    },
    { generatedAt: fixedTime },
  );
  assert(
    first.stagingPlan.stagingDirectoryName !==
      differentProjectResult.stagingPlan.stagingDirectoryName,
    "Different projectIds must not share a compiler staging identity",
  );
  const worldSource = first.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  const lightRuntime =
    first.overlayFiles.find(
      (file) => file.relativePath === "src/xrift-studio/light-runtime.tsx",
    )?.content ?? "";
  assert(worldSource.includes("<SpawnPoint"), "World SpawnPoint was not generated");
  assert(worldSource.includes("castShadow={true}"), "Mesh shadow settings were not generated");
  assert(
    worldSource.includes(
      'import { XriftScriptLight } from "./xrift-studio/light-runtime";',
    ) &&
      worldSource.includes("<XriftScriptLight") &&
      lightRuntime.includes("export function XriftScriptLight") &&
      lightRuntime.includes("xriftLightRuntime"),
    "Script-free Light output did not use the shared Light runtime",
  );

  const audioEntity = world.scenes[world.project.entrySceneId].entities["entity-world-object"];
  const audioAsset: AudioAsset = {
    id: "fixture-audio-ambient",
    name: "Ambient",
    kind: "audio",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/imported/audio/fixture/ambient.mp3",
    },
    sourceHash: "c".repeat(64),
    thumbnail: { status: "missing" },
    importMetadata: {
      sourceFormat: "mp3",
      mimeType: "audio/mpeg",
      byteLength: 4096,
    },
  };
  const audioAssets: AssetManifest = {
    ...world.assets,
    assets: { ...world.assets.assets, [audioAsset.id]: audioAsset },
  };
  const audioPlacement = instantiateSceneAsset(
    world.scenes[world.project.entrySceneId],
    audioAssets,
    world.prefabs ?? {},
    audioAsset.id,
  );
  assert(audioPlacement.placed, "Audio Asset fixture could not be placed");
  assert(
    audioPlacement.placed &&
      audioPlacement.scene.entities[audioPlacement.entityId]?.components.some(
        (component) =>
          component.type === "audio-source" &&
          component.audioAssetId === audioAsset.id,
      ),
    "Audio Asset placement did not create a linked Audio Source",
  );
  const audioScene: SceneDocument = {
    ...world.scenes[world.project.entrySceneId],
    entities: {
      ...world.scenes[world.project.entrySceneId].entities,
      [audioEntity.id]: {
        ...audioEntity,
        components: [
          ...audioEntity.components,
          {
            id: "fixture-audio-source",
            type: "audio-source",
            enabled: true,
            audioAssetId: audioAsset.id,
            volume: 0.75,
            loop: true,
            autoplay: false,
            spatial: true,
            refDistance: 1,
            rolloffFactor: 1,
            maxDistance: 40,
          },
        ],
      },
    },
  };
  const audioResult = compileVisualProject(
    {
      ...world,
      assets: audioAssets,
      scenes: { [audioScene.sceneId]: audioScene },
    },
    { generatedAt: fixedTime },
  );
  const audioSource =
    audioResult.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  const audioRuntime =
    audioResult.overlayFiles.find(
      (file) =>
        file.relativePath ===
        "src/xrift-studio/audio-source-runtime.tsx",
    )?.content ?? "";
  assert(audioResult.canStage, "Configured Audio Source should be stageable");
  assert(
    audioSource.includes("const XRiftStudioCompiledAudioSource") &&
      audioSource.includes("useCompiledAssetUrl(assetPath)") &&
      audioSource.includes(
        'import { XriftAudioSource } from "./xrift-studio/audio-source-runtime";',
      ) &&
      audioSource.includes(
        '"xrift-studio-fixture-audio-ambient-ambient.mp3" as const',
      ) &&
      !audioSource.includes("new PositionalAudio") &&
      audioRuntime.includes("export function XriftAudioSource") &&
      audioRuntime.includes("new PositionalAudio"),
    "The shared Audio Source runtime was not emitted for a Script-free Scene",
  );
  assert(
    audioResult.stagingPlan.assetCopyPlan.some(
      (entry) =>
        entry.assetId === audioAsset.id &&
        entry.purpose === "audio" &&
        entry.sourceRelativePath ===
          "assets/imported/audio/fixture/ambient.mp3" &&
        entry.targetRelativePath ===
          "public/xrift-studio-fixture-audio-ambient-ambient.mp3" &&
        entry.supportedByCompiler,
    ),
    "Audio Asset was not added to the final staging copy plan",
  );
  const audioRuntimeResult = compileVisualProject(
    {
      ...world,
      assets: audioAssets,
      scenes: { [audioScene.sceneId]: audioScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    audioRuntimeResult.canStage &&
      !audioRuntimeResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "runtime-component-adapter-missing",
      ),
    "Classic runtime Audio Source must be connected to the shared R3F adapter",
  );

  const materialWorld: VisualCompilerDocuments = {
    ...world,
    assets: updateMaterialAsset(
      world.assets,
      BUILTIN_ASSET_IDS.material.blue,
      {
        pbrMetallicRoughness: { baseColorFactor: [1, 0.25, 0.1, 0.5] },
        alphaMode: "BLEND",
        doubleSided: true,
      },
    ),
  };
  const materialResult = compileVisualProject(materialWorld, {
    generatedAt: fixedTime,
  });
  const materialSource =
    materialResult.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(materialSource.includes("transparent={true}"), "Material opacity was not generated");
  assert(materialSource.includes("side={DoubleSide}"), "Double-sided material was not generated");

  const particleTexture: TextureAsset = {
    id: "fixture-particle-texture",
    name: "Fixture Particle Texture",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/textures/fixture-particle.png",
    },
    thumbnail: { status: "missing" },
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      flipY: true,
      generateMipmaps: false,
      sampler: {
        wrapS: "mirrored-repeat",
        wrapT: "clamp-to-edge",
        magFilter: "nearest",
        minFilter: "linear",
      },
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: 128,
      width: 32,
      height: 32,
    },
  };
  const particleManifest: AssetManifest = {
    ...world.assets,
    assets: {
      ...world.assets.assets,
      [particleTexture.id]: particleTexture,
    },
  };
  const particleAssetResult = addDefaultParticleAsset(particleManifest, {
    id: "fixture-particle-fireflies",
    name: "Fixture Fireflies",
    properties: {
      maxParticles: 128,
      emission: { rateOverTime: 12, bursts: [] },
      shape: { type: "sphere", radius: 0.75 },
      colorOverLifetime: {
        start: [1, 0.25, 0.1, 0.8],
        end: [0.1, 0.4, 1, 0],
      },
      renderer: {
        materialAssetId: BUILTIN_ASSET_IDS.material.blue,
        textureAssetId: particleTexture.id,
      },
    },
  });
  assert(particleAssetResult.added, "Particle Asset fixture could not be created");
  const particlePlacement = instantiateSceneAsset(
    world.scenes[world.project.entrySceneId],
    particleAssetResult.manifest,
    world.prefabs ?? {},
    particleAssetResult.assetId,
    { position: [0, 1.5, 0] },
  );
  assert(particlePlacement.placed, "Particle Asset fixture could not be placed");
  const particleResult = compileVisualProject(
    {
      ...world,
      assets: particleAssetResult.manifest,
      scenes: {
        ...world.scenes,
        [world.project.entrySceneId]: particlePlacement.scene,
      },
    },
    { generatedAt: fixedTime },
  );
  assert(particleResult.canStage, "Particle fixture should be stageable");
  const particleSource =
    particleResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  const particleRuntimeSource =
    particleResult.overlayFiles.find(
      (file) =>
        file.relativePath === "src/xrift-studio/particle-runtime.tsx",
    )?.content ?? "";
  assert(
    particleSource.includes(
      'import { XriftScriptParticleEmitter, type XriftParticleConfig } from "./xrift-studio/particle-runtime";',
    ),
    "Shared Particle runtime import was not generated",
  );
  assert(
    particleRuntimeSource.includes(
      "export const XriftScriptParticleEmitter",
    ) &&
      particleRuntimeSource.includes(
        "XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY",
      ) &&
      particleRuntimeSource.includes("useFrame("),
    "Shared Particle runtime overlay was not emitted",
  );
  assert(
    /<XriftScriptParticleEmitter componentId="[^"]+" config=/.test(particleSource),
    "Particle Asset was not wired to its Scene emitter by Component id",
  );
  [
    "const particleMapSource = useTexture(particleMapUrl)",
    "const value = particleMapSource.clone()",
    "value.colorSpace = SRGBColorSpace",
    "value.flipY = true",
    "value.generateMipmaps = false",
    "value.wrapS = MirroredRepeatWrapping",
    "value.wrapT = ClampToEdgeWrapping",
    "value.magFilter = NearestFilter",
    "value.minFilter = LinearFilter",
  ].forEach((fragment) =>
    assert(
      particleSource.includes(fragment),
      `Particle Texture setting was not generated: ${fragment}`,
    ),
  );
  [
    'color="#',
    "opacity={",
  ].forEach((fragment) =>
    assert(
      particleSource.includes(fragment),
      `Particle Color/Alpha setting was not generated: ${fragment}`,
    ),
  );
  [
    "new Float32Array(count * 4)",
    "colors.setXYZW(",
    "mix(startColor[3], endColor[3], normalizedAge)",
    "SRGBColorSpace,",
  ].forEach((fragment) =>
    assert(
      particleRuntimeSource.includes(fragment),
      `Shared Particle Color/Alpha behavior is missing: ${fragment}`,
    ),
  );
  assert(
    particleResult.stagingPlan.assetCopyPlan.some(
      (entry) =>
        entry.assetId === particleTexture.id &&
        entry.sourceRelativePath ===
          "assets/textures/fixture-particle.png" &&
        entry.supportedByCompiler,
    ),
    "Particle Texture was not added to the final staging copy plan",
  );
  assert(
    particleResult.stagingPlan.bundledAssetCopyPlan.length === 0,
    "Non-KTX2 Particle output must not stage the Basis transcoder",
  );
  const particleEntity =
    particlePlacement.scene.entities[particlePlacement.entityId];
  assert(Boolean(particleEntity), "Placed Particle Entity is missing");
  const particleOnlyResult = compileVisualProject(
    {
      ...world,
      assets: particleAssetResult.manifest,
      scenes: {
        [world.project.entrySceneId]: {
          ...world.scenes[world.project.entrySceneId],
          rootEntityIds: [particlePlacement.entityId],
          entities: {
            [particlePlacement.entityId]: particleEntity!,
          },
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const particleOnlySource =
    particleOnlyResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    /import \{[^}]*\buseEffect\b[^}]*\buseMemo\b[^}]*\} from "react";/.test(
      particleOnlySource,
    ),
    "A standalone textured Particle did not import its React hooks",
  );

  const ktx2ParticleTexture: TextureAsset = {
    ...particleTexture,
    source: {
      kind: "project",
      relativePath: "assets/textures/fixture-particle.ktx2",
    },
    importMetadata: {
      ...particleTexture.importMetadata!,
      sourceFormat: "ktx2",
      mimeType: "image/ktx2",
    },
  };
  const ktx2ParticleResult = compileVisualProject(
    {
      ...world,
      assets: {
        ...particleAssetResult.manifest,
        assets: {
          ...particleAssetResult.manifest.assets,
          [ktx2ParticleTexture.id]: ktx2ParticleTexture,
        },
      },
      scenes: {
        ...world.scenes,
        [world.project.entrySceneId]: particlePlacement.scene,
      },
    },
    { generatedAt: fixedTime },
  );
  const ktx2ParticleSource =
    ktx2ParticleResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(ktx2ParticleResult.canStage, "KTX2 Particle fixture should be stageable");
  assert(
    ktx2ParticleSource.includes(
      'const COMPILED_KTX2_TRANSCODER_DIRECTORY = "xrift-studio/vendor/three-basis/" as const;',
    ) &&
      ktx2ParticleSource.includes(
        "return useKTX2(assetUrl, `${baseUrl}${COMPILED_KTX2_TRANSCODER_DIRECTORY}`);",
      ) &&
      ktx2ParticleSource.includes(
        "const particleMapSource = useCompiledKtx2(particleMapUrl);",
      ) &&
      !ktx2ParticleSource.includes("cdn.jsdelivr.net"),
    "KTX2 Particle output must pass an XRift baseUrl-local Basis path to useKTX2",
  );
  assert(
    JSON.stringify(ktx2ParticleResult.stagingPlan.bundledAssetCopyPlan) ===
      JSON.stringify([
        {
          source: "three-basis",
          sourceFileName: "basis_transcoder.js",
          targetRelativePath:
            "public/xrift-studio/vendor/three-basis/basis_transcoder.js",
        },
        {
          source: "three-basis",
          sourceFileName: "basis_transcoder.wasm",
          targetRelativePath:
            "public/xrift-studio/vendor/three-basis/basis_transcoder.wasm",
        },
        {
          source: "three-basis",
          sourceFileName: "README.md",
          targetRelativePath:
            "public/xrift-studio/vendor/three-basis/README.md",
        },
      ]),
    "KTX2 Particle output must stage the pinned Basis JS, WASM, and license",
  );

  const runtimeParticleResult = compileVisualProject(
    {
      ...world,
      assets: particleAssetResult.manifest,
      scenes: {
        ...world.scenes,
        [world.project.entrySceneId]: particlePlacement.scene,
      },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    runtimeParticleResult.canStage &&
      !runtimeParticleResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "runtime-particle-adapter-missing",
      ),
    "Classic runtime Particle output must be connected to the bounded R3F adapter",
  );

  const runtimeKtx2Result = compileVisualProject(
    {
      ...world,
      assets: {
        ...particleAssetResult.manifest,
        assets: {
          ...particleAssetResult.manifest.assets,
          [ktx2ParticleTexture.id]: ktx2ParticleTexture,
        },
      },
      scenes: {
        ...world.scenes,
        [world.project.entrySceneId]: particlePlacement.scene,
      },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    JSON.stringify(runtimeKtx2Result.stagingPlan.bundledAssetCopyPlan) ===
      JSON.stringify(ktx2ParticleResult.stagingPlan.bundledAssetCopyPlan),
    "Runtime JSON output must stage the same Basis files as Classic JSX for KTX2 Textures",
  );
  const particleWithoutTexture = updateParticleAsset(
    particleAssetResult.manifest,
    particleAssetResult.assetId,
    { renderer: { textureAssetId: undefined } },
  ).assets[particleAssetResult.assetId];
  assert(
    particleWithoutTexture?.kind === "particle" &&
      particleWithoutTexture.properties.renderer.textureAssetId === undefined,
    "Particle Texture reference could not be cleared",
  );
  const particleAsset =
    particleAssetResult.manifest.assets[particleAssetResult.assetId];
  assert(particleAsset?.kind === "particle", "Particle fixture Asset is missing");
  if (particleAsset?.kind === "particle") {
    const denser = updateParticleAsset(
      particleAssetResult.manifest,
      particleAsset.id,
      scaleParticleEmission(particleAsset.properties, 2),
    ).assets[particleAsset.id];
    assert(
      denser?.kind === "particle" &&
        denser.properties.maxParticles ===
          particleAsset.properties.maxParticles * 2 &&
        denser.properties.emission.rateOverTime ===
          particleAsset.properties.emission.rateOverTime * 2 &&
        denser.properties.renderer.textureAssetId === particleTexture.id,
      "Particle density tool must scale rate and capacity without clearing Texture",
    );
    for (const preset of PARTICLE_AUTHORING_PRESETS) {
      const presetAsset = updateParticleAsset(
        particleAssetResult.manifest,
        particleAsset.id,
        preset.properties,
      ).assets[particleAsset.id];
      assert(
        presetAsset?.kind === "particle" &&
          presetAsset.properties.renderer.textureAssetId ===
            particleTexture.id &&
          presetAsset.properties.renderer.materialAssetId ===
            BUILTIN_ASSET_IDS.material.blue,
        `Particle preset must retain renderer Asset references: ${preset.id}`,
      );
    }
  }

  const colliderScene = withFixtureColliders(
    world.scenes[world.project.entrySceneId],
    "entity-world-object",
    [
      createBoxColliderComponent("fixture-box-collider", {
        center: [0.25, 0.5, -0.25],
        halfExtents: [1, 2, 3],
        isTrigger: true,
        friction: 0.25,
        restitution: 0.75,
      }),
      createBoxColliderComponent("fixture-box-collider-second", {
        center: [0, 1, 0],
        halfExtents: [0.5, 0.5, 0.5],
      }),
    ],
  );
  const colliderResult = compileVisualProject(
    { ...world, scenes: { [colliderScene.sceneId]: colliderScene } },
    { generatedAt: fixedTime },
  );
  const colliderSource =
    colliderResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  const colliderEntitySource = extractNamedEntitySource(colliderSource, "立方体");
  assert(colliderResult.canStage, "Box Collider fixture should be stageable");
  assert(
    colliderSource.includes('from "@react-three/rapier"'),
    "Rapier import was not generated",
  );
  assert(
    /<RigidBody type="fixed"[^>]*colliders=\{false\}>/.test(colliderSource),
    "Fixed RigidBody with disabled auto colliders was not generated",
  );
  assert(
    colliderSource.includes(
      "<CuboidCollider args={[1, 2, 3]} position={[0.25, 0.5, -0.25]} sensor={true} friction={0.25} restitution={0.75} />",
    ),
    "Box Collider half-extents or surface options were not generated",
  );
  assert(
    (colliderEntitySource.match(/<RigidBody\b/g) ?? []).length === 1 &&
      (colliderEntitySource.match(/<CuboidCollider\b/g) ?? []).length === 2,
    "Multiple Box Colliders must share one RigidBody",
  );

  const colliderEntity = colliderScene.entities["entity-world-object"]!;
  const colliderAndSpawnScene: SceneDocument = {
    ...colliderScene,
    entities: {
      ...colliderScene.entities,
      [colliderEntity.id]: {
        ...colliderEntity,
        components: [
          ...colliderEntity.components,
          {
            id: "fixture-spawn-point",
            type: "spawn-point" as const,
            enabled: true,
            target: "player" as const,
          },
        ],
      },
    },
  };
  const colliderRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: {
        [colliderAndSpawnScene.sceneId]: colliderAndSpawnScene,
      },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    colliderRuntimeResult.canStage &&
      !colliderRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" ||
          diagnostic.code === "runtime-component-adapter-missing",
      ),
    "Static Collider and Spawn Point must be supported by the runtime manifest adapter",
  );

  const xriftSpawnScene: SceneDocument = {
    ...colliderScene,
    entities: {
      ...colliderScene.entities,
      [colliderEntity.id]: {
        ...colliderEntity,
        components: [
          ...colliderEntity.components,
          createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint, {
            componentId: "fixture-xrift-spawn-point",
            properties: { position: [0, 1, 2], yaw: 90 },
          })!,
        ],
      },
    },
  };
  const xriftSpawnRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [xriftSpawnScene.sceneId]: xriftSpawnScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    xriftSpawnRuntimeResult.canStage &&
      !xriftSpawnRuntimeResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "runtime-component-adapter-missing",
      ),
    "The official xrift.spawn-point component must be connected to the runtime adapter",
  );

  const dynamicColliderScene = withFixtureColliders(
    world.scenes[world.project.entrySceneId],
    "entity-world-object",
    [
      createBoxColliderComponent("fixture-dynamic-collider", {
        bodyType: "dynamic",
        gravityScale: 0.75,
        linearDamping: 0.2,
        angularDamping: 0.3,
        ccd: true,
      }),
    ],
  );
  const dynamicColliderSource =
    compileVisualProject(
      {
        ...world,
        scenes: { [dynamicColliderScene.sceneId]: dynamicColliderScene },
      },
      { generatedAt: fixedTime },
    ).overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    /<RigidBody type="dynamic"[^>]*gravityScale=\{0\.75\}[^>]*linearDamping=\{0\.2\}[^>]*angularDamping=\{0\.3\}[^>]*ccd=\{true\}/.test(
      dynamicColliderSource,
    ),
    "Dynamic RigidBody settings were not generated",
  );
  const dynamicColliderRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [dynamicColliderScene.sceneId]: dynamicColliderScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    dynamicColliderRuntimeResult.canStage &&
      !dynamicColliderRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" &&
          diagnostic.componentId === "fixture-dynamic-collider",
      ),
    "Direct dynamic Collider must be connected to the runtime manifest adapter",
  );

  const directRigidBodyEntity = dynamicColliderScene.entities["entity-world-object"]!;
  const directRigidBodyScene: SceneDocument = {
    ...dynamicColliderScene,
    entities: {
      ...dynamicColliderScene.entities,
      [directRigidBodyEntity.id]: {
        ...directRigidBodyEntity,
        components: [
          ...directRigidBodyEntity.components.filter(
            (component) => component.type !== "collider",
          ),
          createRigidBodyComponent("fixture-direct-rigid-body", {
            bodyType: "dynamic",
            autoColliders: "cuboid",
            ccd: true,
          }),
        ],
      },
    },
  };
  const directRigidBodyRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [directRigidBodyScene.sceneId]: directRigidBodyScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    directRigidBodyRuntimeResult.canStage &&
      !directRigidBodyRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" &&
          diagnostic.componentId === "fixture-direct-rigid-body",
      ),
    "Direct Rigid Body with an authored Mesh must be connected to the runtime manifest adapter",
  );

  const bodyParentId = "fixture-rigid-body-parent";
  const bodyChildId = "entity-world-object";
  const bodyChild = world.scenes[world.project.entrySceneId].entities[bodyChildId]!;
  const parentOwnedScene: SceneDocument = {
    ...world.scenes[world.project.entrySceneId],
    rootEntityIds: [
      bodyParentId,
      ...world.scenes[world.project.entrySceneId].rootEntityIds.filter(
        (id) => id !== bodyChildId,
      ),
    ],
    entities: {
      ...world.scenes[world.project.entrySceneId].entities,
      [bodyParentId]: {
        id: bodyParentId,
        name: "Parent Rigid Body",
        parentId: null,
        children: [bodyChildId],
        enabled: true,
        components: [
          createTransformComponent("fixture-rigid-parent-transform"),
          createRigidBodyComponent("fixture-parent-rigid-body", {
            bodyType: "dynamic",
            autoColliders: "none",
          }),
        ],
      },
      [bodyChildId]: {
        ...bodyChild,
        parentId: bodyParentId,
        components: [
          ...bodyChild.components.filter(
            (component) => component.type !== "collider",
          ),
          createBoxColliderComponent("fixture-owned-child-collider", {
            center: [0, 0.5, 0],
            halfExtents: [0.5, 0.5, 0.5],
          }),
        ],
      },
    },
  };
  const parentOwnedSource =
    compileVisualProject(
      {
        ...world,
        scenes: { [parentOwnedScene.sceneId]: parentOwnedScene },
      },
      { generatedAt: fixedTime },
    ).overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  const parentBodySource = extractNamedEntitySource(
    parentOwnedSource,
    "Parent Rigid Body",
  );
  assert(
    (parentBodySource.match(/<RigidBody\b/g) ?? []).length === 1 &&
      (parentBodySource.match(/<CuboidCollider\b/g) ?? []).length === 1 &&
      parentBodySource.includes('type="dynamic"') &&
      parentBodySource.includes('name="立方体"'),
    "Parent Rigid Body must own descendant Collider geometry without creating an origin Box",
  );
  const parentOwnedRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [parentOwnedScene.sceneId]: parentOwnedScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    parentOwnedRuntimeResult.canStage &&
      !parentOwnedRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" &&
          (diagnostic.componentId === "fixture-parent-rigid-body" ||
            diagnostic.componentId === "fixture-owned-child-collider"),
      ),
    "Root Rigid Body must own descendant Collider components in the runtime manifest",
  );
  const autoBodyScene: SceneDocument = {
    ...parentOwnedScene,
    entities: {
      ...parentOwnedScene.entities,
      [bodyParentId]: {
        ...parentOwnedScene.entities[bodyParentId]!,
        components: [
          createTransformComponent("fixture-auto-parent-transform"),
          createRigidBodyComponent("fixture-auto-parent-rigid-body", {
            bodyType: "fixed",
            autoColliders: "cuboid",
          }),
        ],
      },
      [bodyChildId]: {
        ...parentOwnedScene.entities[bodyChildId]!,
        components: parentOwnedScene.entities[bodyChildId]!.components.filter(
          (component) => component.type !== "collider",
        ),
      },
    },
  };
  const autoBodySource =
    compileVisualProject(
      {
        ...world,
        scenes: { [autoBodyScene.sceneId]: autoBodyScene },
      },
      { generatedAt: fixedTime },
    ).overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  const autoParentSource = extractNamedEntitySource(
    autoBodySource,
    "Parent Rigid Body",
  );
  assert(
    autoParentSource.includes('<MeshCollider type="cuboid">') &&
      !autoParentSource.includes("<CuboidCollider"),
    "Parent auto-collider mode must generate descendant mesh colliders without a fake origin Box",
  );
  const autoBodyRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [autoBodyScene.sceneId]: autoBodyScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    autoBodyRuntimeResult.canStage &&
      !autoBodyRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" &&
          diagnostic.componentId === "fixture-auto-parent-rigid-body",
      ),
    "Root auto-collider Rigid Body must own descendant mesh geometry in the runtime manifest",
  );
  const nestedBodyScene: SceneDocument = {
    ...autoBodyScene,
    entities: {
      ...autoBodyScene.entities,
      [bodyChildId]: {
        ...autoBodyScene.entities[bodyChildId]!,
        components: [
          ...autoBodyScene.entities[bodyChildId]!.components,
          createRigidBodyComponent("fixture-nested-rigid-body", {
            bodyType: "dynamic",
            autoColliders: "hull",
          }),
        ],
      },
    },
  };
  const nestedBodySource =
    compileVisualProject(
      {
        ...world,
        scenes: { [nestedBodyScene.sceneId]: nestedBodyScene },
      },
      { generatedAt: fixedTime },
    ).overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  const nestedParentSource = extractNamedEntitySource(
    nestedBodySource,
    "Parent Rigid Body",
  );
  assert(
    (nestedParentSource.match(/<RigidBody\b/g) ?? []).length === 2 &&
      nestedParentSource.includes('<MeshCollider type="hull">') &&
      !nestedParentSource.includes('<MeshCollider type="cuboid">'),
    "A nested Rigid Body must start a new collider ownership boundary",
  );
  const nestedBodyRuntimeResult = compileVisualProject(
    {
      ...world,
      scenes: { [nestedBodyScene.sceneId]: nestedBodyScene },
    },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    nestedBodyRuntimeResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime-component-metadata-only" &&
        diagnostic.componentId === "fixture-auto-parent-rigid-body",
    ),
    "Nested Rigid Body ownership boundaries must remain explicit in the runtime diagnostics",
  );

  const meshColliderScene = withFixtureColliders(
    world.scenes[world.project.entrySceneId],
    "entity-world-object",
    [
      createMeshColliderComponent("fixture-mesh-collider", {
        meshMode: "trimesh",
        friction: 0.8,
        restitution: 0.1,
      }),
    ],
  );
  const meshColliderResult = compileVisualProject(
    { ...world, scenes: { [meshColliderScene.sceneId]: meshColliderScene } },
    { generatedAt: fixedTime },
  );
  const meshColliderSource =
    meshColliderResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(meshColliderResult.canStage, "Mesh Collider fixture should be stageable");
  assert(
    /<RigidBody type="fixed"[^>]*colliders="trimesh" sensor=\{false\} friction=\{0\.8\} restitution=\{0\.1\}>/.test(
      meshColliderSource,
    ),
    "Mesh Collider did not generate one fixed trimesh RigidBody",
  );

  const mixedColliderScene = withFixtureColliders(
    world.scenes[world.project.entrySceneId],
    "entity-world-object",
    [
      createMeshColliderComponent("fixture-mixed-mesh-collider", {
        meshMode: "trimesh",
        friction: 0.6,
        restitution: 0.2,
      }),
      createBoxColliderComponent("fixture-mixed-box-collider", {
        center: [0, 0.5, 0],
        halfExtents: [0.5, 0.5, 0.5],
      }),
      createBoxColliderComponent("fixture-mixed-box-collider-second", {
        center: [0, 1.25, 0],
        halfExtents: [0.25, 0.25, 0.25],
        isTrigger: true,
      }),
    ],
  );
  const mixedColliderResult = compileVisualProject(
    { ...world, scenes: { [mixedColliderScene.sceneId]: mixedColliderScene } },
    { generatedAt: fixedTime },
  );
  const mixedColliderSource =
    mixedColliderResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  const mixedColliderEntitySource = extractNamedEntitySource(
    mixedColliderSource,
    "立方体",
  );
  assert(mixedColliderResult.canStage, "Mixed Collider fixture should be stageable");
  assert(
    (mixedColliderEntitySource.match(/<RigidBody\b/g) ?? []).length === 1 &&
      (mixedColliderEntitySource.match(/<CuboidCollider\b/g) ?? []).length === 2 &&
      mixedColliderEntitySource.includes('colliders="trimesh"'),
    "Box and Mesh Colliders must share one trimesh RigidBody",
  );

  const unsupportedBuiltinTexture: TextureAsset = {
    id: "fixture-texture-builtin-unsupported",
    name: "Unsupported Builtin Texture",
    kind: "texture",
    status: "ready",
    source: { kind: "builtin", key: "fixture/unsupported-texture" },
    thumbnail: { status: "missing" },
    importSettings: normalizeTextureImportSettings(),
  };
  const textureWorld: VisualCompilerDocuments = {
    ...world,
    assets: updateMaterialAsset(
      {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [unsupportedBuiltinTexture.id]: unsupportedBuiltinTexture,
        },
      },
      BUILTIN_ASSET_IDS.material.blue,
      { baseColorTextureId: unsupportedBuiltinTexture.id },
    ),
  };
  const textureResult = compileVisualProject(textureWorld, {
    generatedAt: fixedTime,
  });
  assert(!textureResult.canStage, "Referenced texture must block until runtime wiring exists");
  assert(
    textureResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "material-texture-source-unsupported",
    ),
    "Referenced texture diagnostic is missing",
  );

  const projectTexture: TextureAsset = {
    id: "fixture-texture-project",
    name: "Fixture Texture",
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: "assets/textures/albedo.png" },
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      resize: { mode: "original" },
      compression: { format: "source", quality: 80 },
    }),
  };
  const projectTextureAssets = {
    ...world.assets,
    assets: {
      ...world.assets.assets,
      [projectTexture.id]: projectTexture,
    },
  };
  const texturedProject: VisualCompilerDocuments = {
    ...world,
    assets: updateMaterialAsset(
      projectTextureAssets,
      BUILTIN_ASSET_IDS.material.blue,
      { baseColorTextureId: projectTexture.id },
    ),
  };
  const texturedProjectResult = compileVisualProject(texturedProject, {
    generatedAt: fixedTime,
  });
  const texturedSource =
    texturedProjectResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(texturedProjectResult.canStage, "Project texture should be stageable");
  assert(texturedSource.includes("useTexture"), "Texture hook was not generated");
  assert(
    /import \{[^}]*\buseXRift\b[^}]*\} from "@xrift\/world-components";/.test(
      texturedSource,
    ) &&
      texturedSource.includes("const { baseUrl } = useXRift();"),
    "XRift base URL runtime was not generated for the project texture",
  );
  assert(
    texturedSource.includes(
      '"xrift-studio-fixture-texture-project-albedo.png" as const',
    ) &&
      !texturedSource.includes('"/xrift-studio/assets/'),
    "Project texture path must be relative to the XRift base URL",
  );
  assert(
    texturedSource.includes("const baseColorMapUrl = useCompiledAssetUrl(") &&
      texturedSource.includes("useTexture(baseColorMapUrl)"),
    "Project texture loader did not use the XRift base URL",
  );
  assert(texturedSource.includes("map={baseColorMap}"), "Base-color map was not generated");
  assert(
    texturedProjectResult.assetCopyPlan.some(
      (entry) =>
        entry.assetId === projectTexture.id &&
        entry.supportedByCompiler &&
        entry.targetRelativePath ===
          "public/xrift-studio-fixture-texture-project-albedo.png",
    ),
    "Texture copy plan support flag is incorrect",
  );

  // 最大解像度・圧縮のImport設定は、制作データの原本を書き換えなくても公開できる。
  // 公開を止めず、コピー計画に「出力時だけ効く変換」を載せることで解決する。
  const unappliedRecipeTexture: TextureAsset = {
    ...projectTexture,
    id: "fixture-texture-unapplied-recipe",
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      resize: { mode: "max-size", maxSize: 1024 },
      compression: { format: "ktx2", quality: 80 },
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: 4 * 1024 * 1024,
      width: 4096,
      height: 4096,
    },
  };
  const unappliedRecipeProject: VisualCompilerDocuments = {
    ...world,
    assets: updateMaterialAsset(
      {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [unappliedRecipeTexture.id]: unappliedRecipeTexture,
        },
      },
      BUILTIN_ASSET_IDS.material.blue,
      { baseColorTextureId: unappliedRecipeTexture.id },
    ),
  };
  const unappliedRecipeResult = compileVisualProject(unappliedRecipeProject, {
    generatedAt: fixedTime,
  });
  assert(
    unappliedRecipeResult.canStage,
    "An unapplied Texture recipe must not block publishing",
  );
  assert(
    !unappliedRecipeResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.assetId === unappliedRecipeTexture.id &&
        diagnostic.severity === "blocking",
    ),
    "An unapplied Texture recipe must not raise a blocking diagnostic",
  );
  const unappliedRecipeCopy = unappliedRecipeResult.assetCopyPlan.find(
    (entry) => entry.assetId === unappliedRecipeTexture.id,
  );
  assert(
    unappliedRecipeCopy?.supportedByCompiler === true &&
      unappliedRecipeCopy.sourceRelativePath === "assets/textures/albedo.png" &&
      unappliedRecipeCopy.targetRelativePath ===
        "public/xrift-studio-fixture-texture-unapplied-recipe-albedo.ktx2",
    "Publish-time Texture conversion must retarget the copy to the converted format",
  );
  assert(
    unappliedRecipeCopy?.textureConversion?.outputFormat === "ktx2" &&
      unappliedRecipeCopy.textureConversion.maxSize === 1024 &&
      unappliedRecipeCopy.textureConversion.srgb === true,
    "Publish-time Texture conversion plan is incorrect",
  );
  const unappliedRecipeSource =
    unappliedRecipeResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    unappliedRecipeSource.includes("useCompiledKtx2(baseColorMapUrl)"),
    "A Texture converted to KTX2 at publish time must load through the KTX2 runtime",
  );

  // 変換できない原本（SVG）は設定を反映できない。公開は止めず、理由だけを残す。
  const unconvertibleRecipeTexture: TextureAsset = {
    ...projectTexture,
    id: "fixture-texture-unconvertible-recipe",
    name: "Unconvertible Recipe Texture",
    source: { kind: "project", relativePath: "assets/textures/logo.svg" },
    importSettings: normalizeTextureImportSettings({
      resize: { mode: "max-size", maxSize: 512 },
      compression: { format: "source", quality: 80 },
    }),
    importMetadata: {
      sourceFormat: "svg",
      mimeType: "image/svg+xml",
      byteLength: 12 * 1024,
    },
  };
  const unconvertibleRecipeResult = compileVisualProject(
    {
      ...world,
      assets: updateMaterialAsset(
        {
          ...world.assets,
          assets: {
            ...world.assets.assets,
            [unconvertibleRecipeTexture.id]: unconvertibleRecipeTexture,
          },
        },
        BUILTIN_ASSET_IDS.material.blue,
        { baseColorTextureId: unconvertibleRecipeTexture.id },
      ),
    },
    { generatedAt: fixedTime },
  );
  assert(
    unconvertibleRecipeResult.canStage,
    "A Texture recipe that cannot be applied must not block publishing",
  );
  assert(
    unconvertibleRecipeResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "texture-recipe-not-applicable" &&
        diagnostic.severity === "warning" &&
        diagnostic.assetId === unconvertibleRecipeTexture.id,
    ),
    "An unapplicable Texture recipe must be reported as a warning",
  );
  assert(
    unconvertibleRecipeResult.assetCopyPlan.find(
      (entry) => entry.assetId === unconvertibleRecipeTexture.id,
    )?.textureConversion === undefined,
    "An unapplicable Texture recipe must not schedule a conversion",
  );

  const sourceScene = world.scenes[world.project.entrySceneId];
  const sourceSceneSettings = resolveSceneSettings(sourceScene.settings);
  const imageSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
        iblEnabled: true,
        imageAssetId: projectTexture.id,
        rotationDegrees: 45,
        flipY: true,
        exposure: 1.25,
      },
    },
  };
  const imageSkyboxResult = compileVisualProject(
    {
      ...world,
      assets: projectTextureAssets,
      scenes: { [imageSkyboxScene.sceneId]: imageSkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const imageSkyboxSource =
    imageSkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(imageSkyboxResult.canStage, "Image Skybox fixture should be stageable");
  [
    "XRiftStudioImageSkybox",
    "EquirectangularReflectionMapping",
    "TextureLoader",
    '"xrift-studio-fixture-texture-project-albedo.png"',
    "rotation={0.78539816}",
    "flipY={true}",
    "exposure={1.25}",
    "const src = useCompiledAssetUrl(assetPath);",
    "useLoader(TextureLoader, src)",
  ].forEach((fragment) =>
    assert(
      imageSkyboxSource.includes(fragment),
      `Image Skybox source is missing: ${fragment}`,
    ),
  );
  assert(
    imageSkyboxSource.includes("scene.background = texture;") &&
      imageSkyboxSource.includes("scene.environment = texture;"),
    "Image Skybox should drive both the background and IBL when both are enabled",
  );
  const resolvedImageSkyboxSettings = resolveSceneSettings(
    imageSkyboxScene.settings,
  );

  const iblOnlySkyboxScene: SceneDocument = {
    ...imageSkyboxScene,
    settings: {
      ...resolvedImageSkyboxSettings,
      skybox: {
        ...resolvedImageSkyboxSettings.skybox,
        enabled: false,
        iblEnabled: true,
      },
    },
  };
  const iblOnlySkyboxResult = compileVisualProject(
    {
      ...world,
      assets: projectTextureAssets,
      scenes: { [iblOnlySkyboxScene.sceneId]: iblOnlySkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const iblOnlySkyboxSource =
    iblOnlySkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    iblOnlySkyboxSource.includes("scene.environment = texture;") &&
      !iblOnlySkyboxSource.includes("scene.background = texture;"),
    "IBL-only Skybox should light the scene without rendering the background",
  );

  const backgroundOnlySkyboxScene: SceneDocument = {
    ...imageSkyboxScene,
    settings: {
      ...resolvedImageSkyboxSettings,
      skybox: {
        ...resolvedImageSkyboxSettings.skybox,
        enabled: true,
        iblEnabled: false,
      },
    },
  };
  const backgroundOnlySkyboxResult = compileVisualProject(
    {
      ...world,
      assets: projectTextureAssets,
      scenes: { [backgroundOnlySkyboxScene.sceneId]: backgroundOnlySkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const backgroundOnlySkyboxSource =
    backgroundOnlySkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    backgroundOnlySkyboxSource.includes("scene.background = texture;") &&
      !backgroundOnlySkyboxSource.includes("scene.environment = texture;"),
    "Background-only Skybox should render without contributing IBL",
  );

  const boxSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
        iblEnabled: true,
        projection: "box",
        imageAssetId: projectTexture.id,
        rotationDegrees: 30,
        meshPosition: [1, 2, 3],
        meshRotationDegrees: [0, 90, 0],
        meshScale: [40, 12, 30],
        center: [0, 0.1, 0],
      },
    },
  };
  const boxSkyboxResult = compileVisualProject(
    {
      ...world,
      assets: projectTextureAssets,
      scenes: { [boxSkyboxScene.sceneId]: boxSkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const boxSkyboxSource =
    boxSkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(boxSkyboxResult.canStage, "Box Skybox fixture should be stageable");
  [
    "XRiftStudioProjectedSkybox",
    "new BoxGeometry(1, 1, 1)",
    "next.translate(0, 0.5, 0)",
    "position={[1, 2, 3]}",
    "rotation={[0, 1.57079633, 0]}",
    "scale={[40, 12, 30]}",
    "new Vector3(0, 0.1, 0)",
    "uRotation: { value: 0.52359878 }",
    "<XRiftStudioImageSkybox assetPath={",
    "flipY={false} />",
  ].forEach((fragment) =>
    assert(
      boxSkyboxSource.includes(fragment),
      `Box Skybox source is missing: ${fragment}`,
    ),
  );

  const domeSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
        projection: "dome",
        meshScale: [80, 30, 80],
        center: [0, 0.02, 0],
      },
    },
  };
  const domeSkyboxResult = compileVisualProject(
    {
      ...world,
      scenes: { [domeSkyboxScene.sceneId]: domeSkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const domeSkyboxSource =
    domeSkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(domeSkyboxResult.canStage, "Dome Skybox fixture should be stageable");
  [
    "new SphereGeometry(0.5, 50, 50)",
    "const curvatureRadiusSquared = 0.95 * 0.95",
    "scale={[80, 30, 80]}",
    "new Vector3(0, 0.02, 0)",
    "<XRiftStudioProjectedSkybox texture={null} />",
  ].forEach((fragment) =>
    assert(
      domeSkyboxSource.includes(fragment),
      `Dome Skybox source is missing: ${fragment}`,
    ),
  );

  const projectHdrSkybox: TextureAsset = {
    id: "external-poly-haven-noon_grass-skybox",
    name: "Noon Grass",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath:
        "assets/imported/external/poly-haven/noon_grass/noon_grass_environment_1k.hdr",
    },
    sourceHash: "fixture-noon-grass-sha256",
    usage: "environment",
    projection: "equirectangular",
    importSettings: normalizeTextureImportSettings({
      colorSpace: "linear",
      flipY: true,
    }),
    importMetadata: {
      sourceFormat: "hdr",
      mimeType: "image/vnd.radiance",
      byteLength: 1024,
    },
    thumbnail: { status: "missing" },
  };
  const hdrSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
        iblEnabled: true,
        imageAssetId: projectHdrSkybox.id,
      },
    },
  };
  const hdrSkyboxResult = compileVisualProject(
    {
      ...world,
      assets: {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [projectHdrSkybox.id]: projectHdrSkybox,
        },
      },
      scenes: { [hdrSkyboxScene.sceneId]: hdrSkyboxScene },
    },
    { generatedAt: fixedTime },
  );
  const hdrSkyboxSource =
    hdrSkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(hdrSkyboxResult.canStage, "HDR Skybox fixture should be stageable");
  [
    'import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";',
    '"xrift-studio-external-poly-haven-noon_grass-skybox-noon_grass_environment_1k.hdr" as const',
    "const src = useCompiledAssetUrl(assetPath);",
    "useLoader(HDRLoader, src)",
    "flipY={true}",
  ].forEach((fragment) =>
    assert(
      hdrSkyboxSource.includes(fragment),
      `HDR Skybox source is missing: ${fragment}`,
    ),
  );
  assert(
    hdrSkyboxResult.assetCopyPlan.some(
      (entry) =>
        entry.assetId === projectHdrSkybox.id &&
        entry.supportedByCompiler &&
        entry.targetRelativePath ===
          "public/xrift-studio-external-poly-haven-noon_grass-skybox-noon_grass_environment_1k.hdr",
    ),
    "HDR Skybox copy plan support flag is incorrect",
  );

  const projectExrSkybox: TextureAsset = {
    ...projectHdrSkybox,
    id: "external-poly-haven-noon_grass-exr-skybox",
    source: {
      kind: "project",
      relativePath:
        "assets/imported/external/poly-haven/noon_grass/noon_grass_environment_1k.exr",
    },
    sourceHash: "fixture-noon-grass-exr-sha256",
    importMetadata: {
      sourceFormat: "exr",
      mimeType: "image/x-exr",
      byteLength: 1024,
    },
  };
  const exrSkyboxSceneSettings = resolveSceneSettings(
    hdrSkyboxScene.settings,
  );
  const exrSkyboxResult = compileVisualProject(
    {
      ...world,
      assets: {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [projectExrSkybox.id]: projectExrSkybox,
        },
      },
      scenes: {
        [hdrSkyboxScene.sceneId]: {
          ...hdrSkyboxScene,
          settings: {
            ...exrSkyboxSceneSettings,
            skybox: {
              ...exrSkyboxSceneSettings.skybox,
              imageAssetId: projectExrSkybox.id,
            },
          },
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const exrSkyboxSource =
    exrSkyboxResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(exrSkyboxResult.canStage, "EXR Skybox fixture should be stageable");
  [
    'import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";',
    '"xrift-studio-external-poly-haven-noon_grass-exr-skybox-noon_grass_environment_1k.exr" as const',
    "const src = useCompiledAssetUrl(assetPath);",
    "useLoader(EXRLoader, src)",
  ].forEach((fragment) =>
    assert(
      exrSkyboxSource.includes(fragment),
      `EXR Skybox source is missing: ${fragment}`,
    ),
  );
  assert(
    exrSkyboxResult.assetCopyPlan.some(
      (entry) =>
        entry.assetId === projectExrSkybox.id &&
        entry.supportedByCompiler &&
        entry.targetRelativePath.endsWith("noon_grass_environment_1k.exr"),
    ),
    "EXR Skybox copy plan support flag is incorrect",
  );

  const projectModel: ModelAsset = {
    id: "fixture-model-project",
    name: "Fixture Model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/models/fixture.glb" },
    importSettings: {
      scale: 1,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: true,
    },
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 4096,
      nodeCount: 1,
      meshCount: 1,
      primitiveCount: 2,
      bounds: {
        min: [-0.5, 0, -0.5],
        max: [0.5, 1, 0.5],
        center: [0, 0.5, 0],
        size: [1, 1, 1],
        boundingSphereRadius: 0.866,
      },
      animations: [
        {
          name: "Idle",
          duration: 2,
          trackCount: 4,
          sourceAnimationIndex: 0,
        },
      ],
      nodes: [
        {
          sourceNodeIndex: 0,
          name: "Animated Root",
          childSourceNodeIndices: [],
          meshIndex: 0,
          sourceMaterialIndices: [0, 1],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      extensionsUsed: [],
      extensionsRequired: [],
    },
    materialSlots: [
      {
        slot: "body",
        name: "Body",
        sourceMaterialIndex: 0,
        defaultMaterialAssetId: BUILTIN_ASSET_IDS.material.blue,
      },
      {
        slot: "detail",
        name: "Detail",
        sourceMaterialIndex: 1,
        defaultMaterialAssetId: BUILTIN_ASSET_IDS.material.violet,
      },
    ],
  };
  const modelEntity = world.scenes[world.project.entrySceneId].entities["entity-world-object"];
  const modelScene = {
    ...world.scenes[world.project.entrySceneId],
    entities: {
      ...world.scenes[world.project.entrySceneId].entities,
      [modelEntity.id]: {
        ...modelEntity,
        components: modelEntity.components.map((component) =>
          component.type === "mesh"
            ? {
                ...component,
                geometryAssetId: projectModel.id,
                geometry: { kind: "asset" as const, assetId: projectModel.id },
                materialBindings: [
                  {
                    slot: "body",
                    materialAssetId: BUILTIN_ASSET_IDS.material.blue,
                  },
                  {
                    slot: "detail",
                    materialAssetId: BUILTIN_ASSET_IDS.material.orange,
                    sourceNodeIndex: 0,
                  },
                ],
                maxDistance: 120,
                modelPose: {
                  bones: {},
                  morphTargets: {},
                  nodes: {
                    "0": {
                      position: [0.1, 0, 0] as [number, number, number],
                      rotation: [0, 0.2, 0] as [number, number, number],
                      scale: [1, 1, 1] as [number, number, number],
                    },
                  },
                },
              }
            : component,
        ),
      },
    },
  };
  const modelProject: VisualCompilerDocuments = {
    ...world,
    scenes: { [modelScene.sceneId]: modelScene },
    assets: {
      ...world.assets,
      assets: { ...world.assets.assets, [projectModel.id]: projectModel },
    },
  };
  const modelResult = compileVisualProject(modelProject, {
    generatedAt: fixedTime,
  });
  const modelSource =
    modelResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(modelResult.canStage, "Project GLB should be stageable");
  assert(modelSource.includes("useGLTF"), "GLTF loader was not generated");
  assert(
    /import \{[^}]*\buseXRift\b[^}]*\} from "@xrift\/world-components";/.test(
      modelSource,
    ) &&
      modelSource.includes("const modelUrl = useCompiledAssetUrl(") &&
      modelSource.includes("useGLTF(modelUrl)"),
    "Project GLB loader did not use the XRift base URL",
  );
  // Text fonts: the file is copied for both output modes, and the world must be
  // told where its own copy is. Runtime JSON has no generated source to carry
  // that base, so the manifest names it; without it the catalog falls back to
  // the host root and troika drops to its per-script fallback CDN.
  const textComponent = createTextComponent("component-text-fixture", {
    text: "こんにちは",
    fontId: "noto-sans-jp",
  });
  assert(textComponent !== null, "Text fixture component could not be created");
  const textScene = {
    ...modelScene,
    entities: {
      ...modelScene.entities,
      [modelEntity.id]: {
        ...modelScene.entities[modelEntity.id],
        components: [
          ...modelScene.entities[modelEntity.id].components,
          textComponent,
        ],
      },
    },
  };
  const textProject: VisualCompilerDocuments = {
    ...modelProject,
    scenes: { [textScene.sceneId]: textScene },
  };
  const textJsxResult = compileVisualProject(textProject, {
    generatedAt: fixedTime,
  });
  const textFontCopies = textJsxResult.stagingPlan.bundledAssetCopyPlan.filter(
    (entry) => entry.source === "text-fonts",
  );
  assert(
    textFontCopies.length === 1 &&
      textFontCopies[0].targetRelativePath ===
        "public/xrift-studio/vendor/text-fonts/noto-sans-jp-japanese-400-normal.woff",
    "Classic JSX output must stage the Text font the Scene uses",
  );
  const textRuntimeResult = compileVisualProject(textProject, {
    generatedAt: fixedTime,
    outputMode: "classic-runtime",
  });
  assert(
    JSON.stringify(
      textRuntimeResult.stagingPlan.bundledAssetCopyPlan.filter(
        (entry) => entry.source === "text-fonts",
      ),
    ) === JSON.stringify(textFontCopies),
    "Runtime JSON output must stage the same Text font as Classic JSX",
  );
  const textRuntimeManifest = JSON.parse(
    textRuntimeResult.overlayFiles.find(
      (file) => file.relativePath === "public/xrift/runtime.json",
    )?.content ?? "{}",
  ) as { textFontBaseUrl?: string };
  assert(
    textRuntimeManifest.textFontBaseUrl === "../",
    "Runtime JSON manifest must name where the world serves its bundled font",
  );
  const fontlessRuntimeManifest = JSON.parse(
    compileVisualProject(modelProject, {
      generatedAt: fixedTime,
      outputMode: "classic-runtime",
    }).overlayFiles.find(
      (file) => file.relativePath === "public/xrift/runtime.json",
    )?.content ?? "{}",
  ) as { textFontBaseUrl?: string };
  assert(
    fontlessRuntimeManifest.textFontBaseUrl === undefined,
    "A world with no Text must not declare a font base it does not ship",
  );

  // Draco: a decoder file, like the KTX2 transcoder, must be shipped by the
  // world and pointed at from the world's own base URL, in either output mode.
  const dracoModel: ModelAsset = {
    ...projectModel,
    importMetadata: {
      ...projectModel.importMetadata!,
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
    },
  };
  const dracoProject: VisualCompilerDocuments = {
    ...modelProject,
    assets: {
      ...modelProject.assets,
      assets: { ...modelProject.assets.assets, [dracoModel.id]: dracoModel },
    },
  };
  const dracoResult = compileVisualProject(dracoProject, {
    generatedAt: fixedTime,
  });
  const dracoSource =
    dracoResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    dracoSource.includes(
      'const COMPILED_DRACO_DECODER_DIRECTORY = "xrift-studio/vendor/three-draco/" as const;',
    ) &&
      dracoSource.includes(
        "const dracoDecoderPath = useCompiledDracoDecoderPath();",
      ) &&
      dracoSource.includes("useGLTF(modelUrl, dracoDecoderPath)") &&
      !dracoSource.includes("gstatic.com"),
    "A Draco Model must load through the world's own decoder, never a CDN",
  );
  const dracoCopyTargets = dracoResult.stagingPlan.bundledAssetCopyPlan
    .filter((entry) => entry.source === "three-draco")
    .map((entry) => entry.targetRelativePath);
  assert(
    JSON.stringify(dracoCopyTargets) ===
      JSON.stringify([
        "public/xrift-studio/vendor/three-draco/draco_decoder.js",
        "public/xrift-studio/vendor/three-draco/draco_decoder.wasm",
        "public/xrift-studio/vendor/three-draco/draco_wasm_wrapper.js",
        "public/xrift-studio/vendor/three-draco/README.md",
      ]),
    "Classic JSX output must stage the pinned Draco decoder next to the world",
  );
  const dracoRuntimeResult = compileVisualProject(dracoProject, {
    generatedAt: fixedTime,
    outputMode: "classic-runtime",
  });
  assert(
    JSON.stringify(
      dracoRuntimeResult.stagingPlan.bundledAssetCopyPlan.filter(
        (entry) => entry.source === "three-draco",
      ),
    ) ===
      JSON.stringify(
        dracoResult.stagingPlan.bundledAssetCopyPlan.filter(
          (entry) => entry.source === "three-draco",
        ),
      ),
    "Runtime JSON output must stage the same Draco decoder as Classic JSX",
  );
  const dracoRuntimeManifest = JSON.parse(
    dracoRuntimeResult.overlayFiles.find(
      (file) => file.relativePath === "public/xrift/runtime.json",
    )?.content ?? "{}",
  ) as { decoders?: { dracoDecoderPath?: string; ktx2TranscoderPath?: string } };
  assert(
    dracoRuntimeManifest.decoders?.dracoDecoderPath ===
      "../xrift-studio/vendor/three-draco/" &&
      dracoRuntimeManifest.decoders.ktx2TranscoderPath === undefined,
    "Runtime JSON manifest must name the decoders the world ships, and only those",
  );
  assert(
    modelResult.stagingPlan.bundledAssetCopyPlan.length === 0,
    "A Model without Draco must not drag a decoder into the world",
  );

  assert(
    modelSource.includes(
      '"xrift-studio-fixture-model-project-fixture.glb" as const',
    ) &&
      !modelSource.includes('"/xrift-studio/assets/'),
    "Project GLB path must be relative to the XRift base URL",
  );
  assert(modelSource.includes("<Clone"), "Model clone was not generated");

  // Open Brush brushes carry their motion in `uniform vec4 u_time`, and the
  // Materials come out of three-icosa already compiled, so no generated
  // Material component drives them. Without a frame loop over the loaded
  // strokes a published world shows every animated brush frozen, which reads
  // as a successful import right up until nothing moves.
  const openBrushModel: ModelAsset = {
    ...projectModel,
    importMetadata: {
      ...projectModel.importMetadata!,
      openBrush: {
        renderer: "three-icosa" as const,
        rendererVersion: OPEN_BRUSH_RUNTIME_PACKAGE,
        extensionNames: [...OPEN_BRUSH_EXTENSION_NAMES],
        brushNames: ["NeonPulse", "Fire"],
      },
    },
  };
  const openBrushResult = compileVisualProject(
    {
      ...modelProject,
      assets: {
        ...modelProject.assets,
        assets: { ...modelProject.assets.assets, [openBrushModel.id]: openBrushModel },
      },
    },
    { generatedAt: fixedTime },
  );
  const openBrushSource =
    openBrushResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(openBrushResult.canStage, "Open Brush model should be stageable");
  // Stock three-icosa leaves `#version` inside a RawShaderMaterial and mutates
  // its presets between loads, so a published world must go through the same
  // loader the viewport uses or its brush shaders fail to compile.
  assert(
    openBrushSource.includes("createOpenBrushMaterialExtension"),
    "Open Brush model did not register the shared brush material extension",
  );
  assert(
    !openBrushSource.includes("new GLTFGoogleTiltBrushMaterialExtension"),
    "Open Brush model still constructs the unpatched three-icosa extension",
  );
  const openBrushOverlay = openBrushResult.overlayFiles.find(
    (file) => file.relativePath === "src/xrift-studio/open-brush-runtime.ts",
  );
  assert(
    openBrushOverlay !== undefined,
    "Open Brush world did not emit the brush loader overlay",
  );
  for (const fragment of [
    "normalizeOpenBrushGlslSource",
    "source.glslVersion = GLSL3",
    "installIsolatedLoader",
  ]) {
    assert(
      openBrushOverlay.content.includes(fragment),
      `Open Brush loader overlay is missing: ${fragment}`,
    );
  }
  assert(
    !modelResult.overlayFiles.some(
      (file) => file.relativePath === "src/xrift-studio/open-brush-runtime.ts",
    ),
    "A world without Open Brush must not carry the brush loader overlay",
  );
  [
    "const brushTimeRoot = useRef<Group>(null);",
    "ref={brushTimeRoot}",
    "uniforms?.u_time",
    "value.set(elapsed / 20, elapsed, elapsed * 2, elapsed * 3);",
  ].forEach((fragment) =>
    assert(
      openBrushSource.includes(fragment),
      `Open Brush time loop is missing: ${fragment}`,
    ),
  );
  assert(
    !modelSource.includes("brushTimeRoot"),
    "A plain glTF model must not carry the Open Brush time loop",
  );
  // three-icosa always trips `no-obfuscation`, so an Open Brush world must
  // declare the permission or `xrift check` rejects every publish. A world
  // without Open Brush must keep the rule enforced.
  const xriftConfig = (result: typeof modelResult): Record<string, unknown> =>
    JSON.parse(
      result.overlayFiles.find((file) => file.relativePath === "xrift.json")
        ?.content ?? "{}",
    ).world ?? {};
  assert(
    JSON.stringify(xriftConfig(openBrushResult).permissions) ===
      JSON.stringify({
        allowedCodeRules: ["no-network-without-permission", "no-obfuscation"],
        allowedDomains: ["icosa-foundation.github.io"],
      }),
    "Open Brush world did not declare the permissions its bundle requires",
  );
  assert(
    xriftConfig(modelResult).permissions === undefined,
    "A world without Open Brush must publish with every check enforced",
  );
  // The allowed domain is derived from the brush library URL, so moving the
  // library can never leave the permission pointing at the old host.
  assert(
    openBrushResult.publishPermissions?.allowedDomains.every((domain) =>
      OPEN_BRUSH_BRUSH_BASE_URL.includes(domain),
    ) === true,
    "Open Brush permission domain drifted from the brush library URL",
  );
  assert(
    openBrushResult.publishPermissions?.requirements.some(
      (requirement) => requirement.feature === "OpenBrush",
    ) === true,
    "Publish permissions did not record which feature required them",
  );
  assert(
    modelResult.publishPermissions === undefined,
    "A world without guarded features must report no publish permissions",
  );
  assert(
    modelSource.includes("XriftMeshMaxDistance") &&
      modelSource.includes("maxDistance={120}"),
    "Mesh maxDistance gate was not generated for Classic output",
  );
  const modelRuntimeResult = compileVisualProject(modelProject, {
    generatedAt: fixedTime,
    outputMode: "classic-runtime",
  });
  assert(
    modelRuntimeResult.runtimeManifestFile?.content.includes(
      '"maxDistance": 120',
    ),
    "Runtime manifest did not preserve Mesh maxDistance",
  );
  assert(
    modelSource.includes("sourceNodeObject.parent") &&
      modelSource.includes('"0:Detail"') &&
      modelSource.includes('"0":{"position":[0.1,0,0]'),
    "Expanded Model node pose and Material override were not generated",
  );
  const wildcardModel: ModelAsset = {
    ...projectModel,
    id: "fixture-model-wildcard",
    name: "Fixture Wildcard Model",
    materialSlots: [projectModel.materialSlots[0]],
  };
  const wildcardScene = {
    ...modelScene,
    entities: {
      ...modelScene.entities,
      [modelEntity.id]: {
        ...modelScene.entities[modelEntity.id],
        components: modelScene.entities[modelEntity.id].components.map(
          (component) =>
            component.type === "mesh"
              ? {
                  ...component,
                  geometryAssetId: wildcardModel.id,
                  geometry: {
                    kind: "asset" as const,
                    assetId: wildcardModel.id,
                  },
                  materialBindings: [
                    {
                      slot: "body",
                      materialAssetId: BUILTIN_ASSET_IDS.material.blue,
                    },
                  ],
                  modelPose: undefined,
                }
              : component,
        ),
      },
    },
  };
  const wildcardResult = compileVisualProject(
    {
      ...world,
      scenes: { [wildcardScene.sceneId]: wildcardScene },
      assets: {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [wildcardModel.id]: wildcardModel,
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const wildcardSource =
    wildcardResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(wildcardResult.canStage, "Wildcard Model should be stageable");
  assert(
    wildcardSource.includes(
      "const renderOverride = (_material: unknown, attach: string, key: string)",
    ) &&
      !wildcardSource.includes("let sourceNodeObject:") &&
      !wildcardSource.includes("const materialName ="),
    "Wildcard Model generated unused Material resolver locals",
  );
  const animationPlacement = instantiateSceneAsset(
    sourceScene,
    modelProject.assets,
    modelProject.prefabs ?? {},
    projectModel.id,
  );
  assert(animationPlacement.placed, "Animated GLB fixture could not be placed");
  if (animationPlacement.placed) {
    const placedEntity = animationPlacement.scene.entities[animationPlacement.entityId];
    // v1 places an animated Model with the graph that plays it, not with an
    // Animation Component: one Component could name one clip, and a Model whose
    // motion is split across several of them had no way to say "all of these".
    assert(
      placedEntity?.components.every(
        (component) => (component as { type: string }).type !== "animation",
      ),
      "Animated GLB placement still creates an Animation Component",
    );
    const placedTrigger = placedEntity?.components.find(
      (component) => component.type === "interaction-trigger",
    );
    assert(
      placedTrigger !== undefined && placedTrigger.type === "interaction-trigger",
      "Animated GLB placement did not create the graph that plays it",
    );
    const placedGraph =
      animationPlacement.assets.assets[placedTrigger.interactivityAssetId];
    assert(
      placedGraph?.kind === "interactivity",
      "the placed Trigger points at something that is not an Interactivity Asset",
    );
    const placedCues = getKhrInteractivityOnStartAnimationCues(
      placedGraph.extension,
    );
    assert(
      placedCues.length ===
        (projectModel.importMetadata?.animations.length ?? 0),
      "the placed graph does not play every clip the Model carries",
    );
    assert(
      placedCues.every((cue) => (cue.endTime ?? null) === null),
      "a placed clip carries an end time, so it would play once instead of looping",
    );
    assert(
      placedEntity?.components.some((component) => component.type === "mesh") &&
        placedEntity.children.length > 0 &&
        placedEntity.children.every(
          (childId) =>
            animationPlacement.scene.entities[childId]?.modelNode
              ?.modelEntityId === placedEntity.id,
        ),
      "Animated GLB placement must expose source nodes while keeping one shared renderer",
    );
    const animationDocuments: VisualCompilerDocuments = {
      ...modelProject,
      // Placement created the graph that plays the Model, so the manifest it
      // returned is the one the Scene refers to.
      assets: animationPlacement.assets,
      scenes: {
        [animationPlacement.scene.sceneId]: animationPlacement.scene,
      },
    };
    const animationResult = compileVisualProject(
      animationDocuments,
      { generatedAt: fixedTime },
    );
    const animationSource =
      animationResult.overlayFiles.find(
        (file) => file.relativePath === "src/World.tsx",
      )?.content ?? "";
    assert(animationResult.canStage, "Animated GLB should be stageable");
    [
      "useAnimations",
      "const { scene, animations } = useGLTF(modelUrl);",
      "const animationRoot = useRef<Group>(null);",
      "const { mixer, clips } = useAnimations(animations, animationRoot);",
      "createXriftAnimationRuntimeBridge",
      "createXriftAnimationMixerController",
      "ref={animationRoot}",
    ].forEach((fragment) =>
      assert(
        animationSource.includes(fragment),
        `Animated GLB source is missing: ${fragment}`,
      ),
    );
    // Nothing plays on its own any more: what starts a clip is a node, so the
    // published source must not carry an autoplay effect of its own.
    [
      "const clipName = names[0];",
      "action.setLoop(LoopRepeat, Infinity);",
    ].forEach((fragment) =>
      assert(
        !animationSource.includes(fragment),
        `Animated GLB source still autoplays without a graph: ${fragment}`,
      ),
    );
    const triggerGraphId = "asset-animated-trigger-graph";
    const triggerEntity =
      animationPlacement.scene.entities[animationPlacement.entityId];
    assert(triggerEntity !== undefined, "the animated Entity went missing");
    const triggerComponent = createInteractionTriggerComponent(
      "component-animated-trigger",
      triggerGraphId,
    );
    assert(triggerComponent !== null, "the Interaction Trigger could not be made");
    const triggeredDocuments: VisualCompilerDocuments = {
      ...animationDocuments,
      assets: {
        ...animationDocuments.assets,
        assets: {
          ...animationDocuments.assets.assets,
          [triggerGraphId]: {
            id: triggerGraphId,
            name: "Animation trigger",
            kind: "interactivity",
            status: "ready",
            source: { kind: "document" },
            thumbnail: { status: "missing" },
            folderId: null,
            order: 0,
            extensionName: KHR_INTERACTIVITY_EXTENSION_NAME,
            specStatus: KHR_INTERACTIVITY_SPEC_STATUS,
            extension: createInteractionTriggerGraphExtension(),
          },
        },
      },
      scenes: {
        [animationPlacement.scene.sceneId]: {
          ...animationPlacement.scene,
          entities: {
            ...animationPlacement.scene.entities,
            [triggerEntity.id]: {
              ...triggerEntity,
              components: [...triggerEntity.components, triggerComponent],
            },
          },
        },
      },
    };
    const triggeredResult = compileVisualProject(triggeredDocuments, {
      generatedAt: fixedTime,
    });
    const triggeredSource =
      triggeredResult.overlayFiles.find(
        (file) => file.relativePath === "src/World.tsx",
      )?.content ?? "";
    [
      "createXriftAnimationRuntimeBridge",
      "createXriftAnimationMixerController",
      "XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY",
      "const { mixer, clips } = useAnimations(animations, animationRoot);",
      "animationBridge.current?.sample();",
    ].forEach((fragment) =>
      assert(
        triggeredSource.includes(fragment),
        `An Animation next to a trigger is missing: ${fragment}`,
      ),
    );
    assert(
      triggeredResult.overlayFiles.some(
        (file) =>
          file.relativePath.endsWith("animation-mixer-runtime.ts") &&
          file.content.includes('from "./animation-runtime"'),
      ),
      "the Animation mixer overlay did not ship with its bridge",
    );

    // A graph built from a Model's clips runs without an Animation Component:
    // the Component owns one clip, and having sixty-four is the reason to reach
    // for a graph. Publishing has to ship the mixer anyway, or those clips
    // never move in the world.
    const graphOnlyEntity = {
      ...triggerEntity,
      components: [
        ...triggerEntity.components.filter(
          (component) => (component as { type: string }).type !== "animation",
        ),
        triggerComponent,
      ],
    };
    const graphOnlyResult = compileVisualProject(
      {
        ...triggeredDocuments,
        assets: {
          ...triggeredDocuments.assets,
          assets: {
            ...triggeredDocuments.assets.assets,
            [triggerGraphId]: {
              ...(triggeredDocuments.assets.assets[triggerGraphId] as Extract<
                (typeof triggeredDocuments.assets.assets)[string],
                { kind: "interactivity" }
              >),
              extension: createModelAnimationGraphExtension(["Idle", "Wave"]),
            },
          },
        },
        scenes: {
          [animationPlacement.scene.sceneId]: {
            ...animationPlacement.scene,
            entities: {
              ...animationPlacement.scene.entities,
              [triggerEntity.id]: graphOnlyEntity,
            },
          },
        },
      },
      { generatedAt: fixedTime },
    );
    const graphOnlySource =
      graphOnlyResult.overlayFiles.find(
        (file) => file.relativePath === "src/World.tsx",
      )?.content ?? "";
    assert(
      !graphOnlyEntity.components.some(
        (component) => (component as { type: string }).type === "animation",
      ),
      "the graph-only Entity still carries an Animation Component",
    );
    [
      "createXriftAnimationRuntimeBridge",
      "createXriftAnimationMixerController",
      // No Animation Component means no autoplay bindings; the mixer and the
      // clips are the whole reason this block exists.
      "const { mixer, clips } = useAnimations(animations, animationRoot);",
    ].forEach((fragment) =>
      assert(
        graphOnlySource.includes(fragment),
        `A Model played only by a graph is missing: ${fragment}`,
      ),
    );
    /*
     * The clips the graph starts have to be in the published source itself.
     *
     * The graph runtime is a sibling of the Model and starts as soon as it
     * mounts, while the Model suspends on its glTF: `event/onStart` fires
     * before the animation bridge exists, nothing retries, and the world ships
     * with animations that never play. Compiling the cues in is what makes the
     * published world play what the Editor plays.
     */
    assert(
      graphOnlySource.includes("action.setLoop(cue.loop ? LoopRepeat : LoopOnce"),
      "the published source does not start the clips the graph starts",
    );
    const emittedCues = graphOnlySource.match(/\[\{"index":[^\]]*\}\]/);
    assert(
      emittedCues !== null,
      "the published source carries no cue list for the graph's clips",
    );
    const emitted = JSON.parse(emittedCues[0]) as {
      index: number;
      loop: boolean;
      delaySeconds: number;
    }[];
    assert(
      emitted.length === 2,
      `the published source starts ${emitted.length} clips, not the graph's 2`,
    );
    assert(
      emitted.every((cue) => cue.loop && cue.delaySeconds === 0),
      "a published clip does not start with the world, or does not loop",
    );

    const retainedAnimationResult = compileVisualProject(
      {
        ...animationDocuments,
        assets: {
          ...animationDocuments.assets,
          assets: {
            ...animationDocuments.assets.assets,
            [projectModel.id]: {
              ...projectModel,
              importSettings: {
                ...projectModel.importSettings,
                importAnimations: false,
              },
            },
          },
        },
      },
      { generatedAt: fixedTime },
    );
    // Turning the Model's import recipe off changes what a *new* placement
    // does; a graph already in the Scene keeps playing what it names.
    assert(
      retainedAnimationResult.overlayFiles.some(
        (file) =>
          file.relativePath === "src/World.tsx" &&
          file.content.includes("useAnimations"),
      ),
      "An existing animation graph stopped after the placement recipe changed",
    );
    const runtimeAnimationResult = compileVisualProject(animationDocuments, {
      generatedAt: fixedTime,
      outputMode: "classic-runtime",
    });
    const runtimeAnimationManifest =
      runtimeAnimationResult.runtimeManifestFile?.content ?? "";
    // v1 publishes no Animation Component at all: the graph is what plays a
    // clip, and a Component in the manifest would be one nothing reads.
    assert(
      !runtimeAnimationManifest.includes('"type": "animation"'),
      "Runtime manifest still carries an Animation Component",
    );
    assert(
      runtimeAnimationManifest.includes('"type": "interaction-trigger"'),
      "Runtime manifest lost the Trigger that plays the Model's clips",
    );
  }
  const hierarchyModel: ModelAsset = {
    ...projectModel,
    id: "fixture-model-hierarchy",
    name: "Fixture Hierarchy Model",
    importSettings: {
      ...projectModel.importSettings,
      scale: 0.01,
      importAnimations: false,
    },
    importMetadata: {
      ...projectModel.importMetadata!,
      animations: [],
    },
  };
  const hierarchyAssets: AssetManifest = {
    ...modelProject.assets,
    assets: {
      ...modelProject.assets.assets,
      [hierarchyModel.id]: hierarchyModel,
    },
  };
  const hierarchyPlacement = instantiateSceneAsset(
    sourceScene,
    hierarchyAssets,
    modelProject.prefabs ?? {},
    hierarchyModel.id,
  );
  assert(hierarchyPlacement.placed, "Static hierarchy GLB could not be placed");
  if (hierarchyPlacement.placed) {
    const hierarchyResult = compileVisualProject(
      {
        ...modelProject,
        assets: hierarchyAssets,
        scenes: {
          [hierarchyPlacement.scene.sceneId]: hierarchyPlacement.scene,
        },
      },
      { generatedAt: fixedTime },
    );
    const hierarchySource =
      hierarchyResult.overlayFiles.find(
        (file) => file.relativePath === "src/World.tsx",
      )?.content ?? "";
    assert(hierarchyResult.canStage, "Static hierarchy GLB should be stageable");
    assert(
      hierarchySource.includes(
        "const { scene, parser } = useGLTF(modelUrl);",
      ) && hierarchySource.includes("<group scale={1}>"),
      "Expanded GLB source must retain parser associations without reapplying import scale",
    );
  }
  assert(modelSource.includes('case "Body"'), "Material slot mapping was not generated");
  assert(
    modelResult.assetCopyPlan.some(
      (entry) =>
        entry.assetId === projectModel.id &&
        entry.supportedByCompiler &&
        entry.targetRelativePath ===
          "public/xrift-studio-fixture-model-project-fixture.glb",
    ),
    "Model copy plan support flag is incorrect",
  );

  const objModel: ModelAsset = {
    ...projectModel,
    id: "fixture-model-obj",
    name: "Fixture OBJ",
    source: { kind: "project", relativePath: "assets/models/fixture.obj" },
    importSettings: { ...projectModel.importSettings, importAnimations: false },
    importMetadata: undefined,
    materialSlots: [
      {
        slot: "body",
        name: "Body",
        sourceMaterialIndex: 0,
        defaultMaterialAssetId: BUILTIN_ASSET_IDS.material.blue,
      },
    ],
  };
  const posedObjScene: SceneDocument = {
    ...modelScene,
    entities: {
      ...modelScene.entities,
      [modelEntity.id]: {
        ...modelScene.entities[modelEntity.id],
        components: modelScene.entities[modelEntity.id].components.map(
          (component) =>
            component.type === "mesh"
              ? {
                  ...component,
                  geometryAssetId: objModel.id,
                  geometry: { kind: "asset" as const, assetId: objModel.id },
                  materialBindings: [
                    {
                      slot: "body",
                      materialAssetId: BUILTIN_ASSET_IDS.material.blue,
                    },
                  ],
                  modelPose: {
                    bones: { Head: [0.1, 0.2, 0.3] as [number, number, number] },
                    morphTargets: { Smile: 0.75 },
                  },
                }
              : component,
        ),
      },
    },
  };
  const posedObjResult = compileVisualProject(
    {
      ...world,
      scenes: { [posedObjScene.sceneId]: posedObjScene },
      assets: {
        ...world.assets,
        assets: { ...world.assets.assets, [objModel.id]: objModel },
      },
    },
    { generatedAt: fixedTime },
  );
  const posedObjSource =
    posedObjResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    posedObjResult.canStage,
    `Project OBJ with a static pose should be stageable: ${JSON.stringify(posedObjResult.diagnostics)}`,
  );
  [
    'OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"',
    "useLoader(OBJLoader, modelUrl)",
    "cloneSkeleton(scene)",
    '"Head":[0.1,0.2,0.3]',
    '"Smile":0.75',
  ].forEach((fragment) =>
    assert(
      posedObjSource.includes(fragment),
      `OBJ static pose source is missing: ${fragment}`,
    ),
  );
  assert(
    posedObjResult.assetCopyPlan.some(
      (entry) =>
        entry.assetId === objModel.id &&
        entry.supportedByCompiler &&
        entry.targetRelativePath.endsWith("fixture.obj"),
    ),
    "OBJ copy plan support flag is incorrect",
  );

  const classicTexture: TextureAsset = {
    id: "fixture-classic-texture",
    name: "Fixture Classic Texture",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/textures/fixture-classic.png",
    },
    importSettings: normalizeTextureImportSettings({
      colorSpace: "linear",
      generateMipmaps: false,
      sampler: {
        wrapS: "repeat",
        wrapT: "repeat",
        magFilter: "nearest",
        minFilter: "nearest",
      },
    }),
  };
  const sourceMaterial = world.assets.assets[
    BUILTIN_ASSET_IDS.material.blue
  ] as MaterialAsset;
  const classicMaterial: MaterialAsset = {
    ...sourceMaterial,
    id: "fixture-classic-material",
    name: "Fixture Classic Material",
    source: { kind: "document" },
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "src/components/FixtureTown.tsx",
      sourceModelAssetId: objModel.id,
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "uniform sampler2D uMap; uniform float uTime; varying vec2 vUv; void main(){gl_FragColor=texture2D(uMap,vUv+vec2(uTime*0.0));}",
      uniforms: {
        uMap: {
          kind: "texture",
          textureAssetId: classicTexture.id,
          colorSpace: "linear",
          generateMipmaps: false,
          filter: "nearest",
          wrapS: "repeat",
          wrapT: "repeat",
        },
        uTime: { kind: "number", value: 0 },
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
          defines: {},
          side: "double",
          transparent: false,
          depthWrite: true,
        },
      ],
      animatedTimeUniform: "uTime",
    },
  };
  const classicScene: SceneDocument = {
    ...modelScene,
    entities: {
      ...modelScene.entities,
      [modelEntity.id]: {
        ...modelScene.entities[modelEntity.id],
        components: modelScene.entities[modelEntity.id].components.map(
          (component) =>
            component.type === "mesh"
              ? {
                  ...component,
                  geometryAssetId: objModel.id,
                  geometry: {
                    kind: "asset" as const,
                    assetId: objModel.id,
                    sourceNodeName: "House",
                  },
                  materialBindings: [
                    {
                      slot: "body",
                      materialAssetId: classicMaterial.id,
                    },
                  ],
                }
              : component,
        ),
      },
    },
  };
  const classicResult = compileVisualProject(
    {
      ...world,
      scenes: { [classicScene.sceneId]: classicScene },
      assets: {
        ...world.assets,
        assets: {
          ...world.assets.assets,
          [objModel.id]: objModel,
          [classicTexture.id]: classicTexture,
          [classicMaterial.id]: classicMaterial,
        },
      },
    },
    { generatedAt: fixedTime },
  );
  const classicSource =
    classicResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    classicResult.canStage,
    `Classic custom Material should be stageable: ${JSON.stringify(classicResult.diagnostics)}`,
  );
  [
    "<shaderMaterial",
    'meshName={object.name}',
    'object.name === "House"',
    'material.uniforms["uTime"].value',
    "CLASSIC_MATERIAL_VARIANTS",
    "readonly CompiledClassicShaderVariant[]",
  ].forEach((fragment) =>
    assert(
      classicSource.includes(fragment),
      `Classic custom Material source is missing: ${fragment}`,
    ),
  );

  const interactiveEntity = modelScene.entities[modelEntity.id];
  const skybox = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.skybox);
  const videoScreen = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.videoScreen,
    { properties: { id: "fixture-video-screen", url: "/videos/intro.mp4" } },
  );
  const videoPlayer = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer,
    { properties: { id: "fixture-video-player" } },
  );
  const video180Sphere = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.video180Sphere,
    { properties: { url: "/videos/immersive-180.mp4" } },
  );
  const mirror = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.mirror, {
    properties: {
      position: [0, 2, -4],
      rotation: [0, 0, 0],
      size: [4, 2],
      textureResolution: 256,
      lodDistance: 12,
    },
  });
  const billboardY = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.billboardY, {
    properties: { position: [0, 1.5, -2], scale: 1 },
  });
  const interactable = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.interactable, {
    properties: {
      id: "fixture-interactable",
      type: "button",
      interactionText: "Inspect",
      enabled: true,
    },
  });
  const textInput = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.textInput, {
    properties: {
      id: "fixture-text-input",
      placeholder: "Type here",
      interactionText: "Edit text",
      disabled: false,
    },
  });
  const liveVideoPlayer = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer,
    { properties: { id: "fixture-live-video", url: "https://example.com/live.m3u8" } },
  );
  const screenShareDisplay = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
    { properties: { id: "fixture-screen-share" } },
  );
  const tagBoard = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.tagBoard, {
    properties: { instanceStateKey: "fixture-tags" },
  });
  const entryLogBoard = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.entryLogBoard,
    { properties: { stateNamespace: "fixture-entry-log" } },
  );
  const portal = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.portal, {
    properties: {
      instanceId: "00000000-0000-4000-8000-000000000043",
      disabled: true,
    },
  });
  assert(skybox, "Skybox fixture component could not be created");
  assert(videoScreen, "VideoScreen fixture component could not be created");
  assert(videoPlayer, "VideoPlayer fixture component could not be created");
  assert(video180Sphere, "Video180Sphere fixture component could not be created");
  assert(mirror, "Mirror fixture component could not be created");
  assert(billboardY, "BillboardY fixture component could not be created");
  assert(interactable, "Interactable fixture component could not be created");
  assert(textInput, "TextInput fixture component could not be created");
  assert(liveVideoPlayer, "LiveVideoPlayer fixture component could not be created");
  assert(screenShareDisplay, "ScreenShareDisplay fixture component could not be created");
  assert(tagBoard, "TagBoard fixture component could not be created");
  assert(entryLogBoard, "EntryLogBoard fixture component could not be created");
  assert(portal, "Portal fixture component could not be created");
  const interactiveScene = {
    ...modelScene,
    entities: {
      ...modelScene.entities,
      [interactiveEntity.id]: {
        ...interactiveEntity,
        components: [
          ...interactiveEntity.components,
          {
            id: "component-fixture-grabbable",
            type: "xrift-component" as const,
            enabled: true,
            schemaId: XRIFT_COMPONENT_SCHEMA_IDS.grabbable,
            schemaVersion: "1.0.0",
            properties: {
              id: "fixture-grabbable",
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
              },
            },
            assetReferences: [],
            entityReferences: [],
          },
          skybox,
          videoScreen,
          videoPlayer,
          video180Sphere,
          mirror,
          billboardY,
          interactable,
          textInput,
          liveVideoPlayer,
          screenShareDisplay,
          tagBoard,
          entryLogBoard,
          portal,
        ],
      },
    },
  };
  const interactiveResult = compileVisualProject(
    { ...modelProject, scenes: { [interactiveScene.sceneId]: interactiveScene } },
    { generatedAt: fixedTime },
  );
  const interactiveSource =
    interactiveResult.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(interactiveResult.canStage, "Managed Grabbable should be stageable");
  assert(interactiveSource.includes("useState"), "Managed runtime state was not generated");
  assert(interactiveSource.includes("onMove={(next)"), "Grabbable callback was not generated");
  assert(interactiveSource.includes("Skybox"), "Skybox import/output was not generated");
  assert(
    interactiveSource.includes("Video180Sphere"),
    "Video180Sphere import/output was not generated",
  );
  assert(
    interactiveSource.includes('id={"fixture-video-screen"}') &&
      interactiveSource.includes('url={"/videos/intro.mp4"}'),
    "Current VideoScreen props were not generated",
  );
  assert(
    !/<VideoScreen[^>]*\ssrc=/.test(interactiveSource),
    "Legacy VideoScreen src prop must not be generated",
  );
  assert(
    !/<VideoPlayer[^>]*\ssync=/.test(interactiveSource),
    "VideoPlayer must not receive the LiveVideoPlayer-only sync prop",
  );
  const officialRuntimeResult = compileVisualProject(
    { ...modelProject, scenes: { [interactiveScene.sceneId]: interactiveScene } },
    { generatedAt: fixedTime, outputMode: "classic-runtime" },
  );
  assert(
    officialRuntimeResult.canStage &&
      !officialRuntimeResult.diagnostics.some(
        (diagnostic) =>
          (diagnostic.code === "runtime-component-adapter-missing" ||
            diagnostic.code === "runtime-component-metadata-only") &&
          (diagnostic.componentId === mirror.id ||
            diagnostic.componentId === billboardY.id ||
            diagnostic.componentId === skybox.id ||
            diagnostic.componentId === interactable.id ||
            diagnostic.componentId === textInput.id ||
            diagnostic.componentId === liveVideoPlayer.id ||
            diagnostic.componentId === screenShareDisplay.id ||
            diagnostic.componentId === tagBoard.id ||
            diagnostic.componentId === entryLogBoard.id ||
            diagnostic.componentId === portal.id ||
            diagnostic.componentId === "component-fixture-grabbable"),
      ),
    "Runtime Skybox, Mirror, and BillboardY must use concrete adapters",
  );
  captureSources?.({
    textured: texturedSource,
    model: modelSource,
    interactive: interactiveSource,
    particle: particleSource,
  });

  const prefabFixture = createPrefabCompilerFixture(world);
  const prefabFirst = compileVisualProject(prefabFixture.documents, {
    generatedAt: fixedTime,
  });
  const prefabSecond = compileVisualProject(prefabFixture.documents, {
    generatedAt: fixedTime,
  });
  assert(
    JSON.stringify(prefabFirst) === JSON.stringify(prefabSecond),
    "Prefab compiler output is not deterministic",
  );
  assert(prefabFirst.canStage, "Nested Prefab fixture should be stageable");
  const prefabSource =
    prefabFirst.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    prefabSource.includes('name="Fixture Outer"'),
    "Outer Prefab Entity was not expanded",
  );
  assert(
    prefabSource.includes('name="Fixture Inner"'),
    "Nested Prefab Entity was not expanded",
  );
  const prefabColliderSource = extractNamedEntitySource(
    prefabSource,
    "Fixture Inner",
  );
  assert(
    (prefabColliderSource.match(/<RigidBody\b/g) ?? []).length === 1 &&
      (prefabColliderSource.match(/<CuboidCollider\b/g) ?? []).length === 1,
    "Expanded Prefab Collider must retain one RigidBody and one CuboidCollider",
  );
  assert(
    !prefabFirst.diagnostics.some(
      (diagnostic) => diagnostic.code === "prefab-instance-unresolved",
    ),
    "Resolved Prefab emitted an unsupported diagnostic",
  );
  assert(
    !prefabFirst.assetCopyPlan.some((entry) =>
      [prefabFixture.outerAssetId, prefabFixture.innerAssetId].includes(
        entry.assetId,
      ),
    ),
    "Prefab authoring JSON must not be copied as a runtime static asset",
  );
  assert(
    prefabFirst.provenance.sourceDocuments.some(
      (document) => document.path === "prefabs/fixture-outer.prefab.json",
    ) &&
      prefabFirst.provenance.sourceDocuments.some(
        (document) => document.path === "prefabs/fixture-inner.prefab.json",
      ),
    "Prefab documents are missing from compiler provenance",
  );

  const changedPrefab: VisualCompilerDocuments = {
    ...prefabFixture.documents,
    prefabs: {
      ...prefabFixture.documents.prefabs,
      [prefabFixture.innerPrefabId]: {
        ...prefabFixture.documents.prefabs[prefabFixture.innerPrefabId],
        name: "Fixture Inner Changed",
      },
    },
  };
  assert(
    isVisualCompilationStale(prefabFirst.provenance, changedPrefab),
    "Changed Prefab document must make provenance stale",
  );

  const missingPrefabResult = compileVisualProject(
    {
      ...prefabFixture.documents,
      prefabs: {
        [prefabFixture.outerPrefabId]:
          prefabFixture.documents.prefabs[prefabFixture.outerPrefabId],
      },
    },
    { generatedAt: fixedTime },
  );
  assert(
    !missingPrefabResult.canStage &&
      missingPrefabResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "prefab-document-missing",
      ),
    "Missing nested Prefab document must block compilation",
  );

  const sourceMissingScene = replacePrefabSourceEntity(
    prefabFixture.documents.scenes[prefabFixture.documents.project.entrySceneId],
    prefabFixture.outerAssetId,
    "missing-prefab-source",
  );
  const sourceMissingResult = compileVisualProject(
    {
      ...prefabFixture.documents,
      scenes: { [sourceMissingScene.sceneId]: sourceMissingScene },
    },
    { generatedAt: fixedTime },
  );
  assert(
    !sourceMissingResult.canStage &&
      sourceMissingResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "prefab-source-entity-missing",
      ),
    "Missing Prefab source Entity must block compilation",
  );

  const cyclicInner = addPrefabCycle(
    prefabFixture.documents.prefabs[prefabFixture.innerPrefabId],
    prefabFixture.outerAssetId,
    prefabFixture.outerSourceEntityId,
  );
  const cycleResult = compileVisualProject(
    {
      ...prefabFixture.documents,
      prefabs: {
        ...prefabFixture.documents.prefabs,
        [prefabFixture.innerPrefabId]: cyclicInner,
      },
    },
    { generatedAt: fixedTime },
  );
  assert(
    !cycleResult.canStage &&
      cycleResult.diagnostics.some(
        (diagnostic) => diagnostic.code === "prefab-dependency-cycle",
      ),
    "Prefab dependency cycle must block compilation",
  );

  const changed: VisualCompilerDocuments = {
    ...world,
    project: {
      ...world.project,
      metadata: { ...world.project.metadata, title: "changed" },
    },
  };
  assert(
    isVisualCompilationStale(first.provenance, changed),
    "Changed source documents must make provenance stale",
  );

  const item = createPrototypeProject("item", "fixture-item");
  const itemResult = compilePrototypeVisualProject(item, {
    generatedAt: fixedTime,
  });
  assert(itemResult.canStage, "Default item fixture should be stageable");
  assert(
    itemResult.overlayFiles.some(
      (file) =>
        file.relativePath === "src/Item.tsx" &&
        file.content.includes("export default Item"),
    ),
    "Item source contract was not generated",
  );

  assertImportBindingsStayUnique(fixedTime);
}

/**
 * Terrain grass constructs `new ShaderMaterial(...)` while an animated classic
 * Material only names the type, so one Scene holding both used to emit
 * `ShaderMaterial` into both the `import type` and the value import from
 * "three". The published project's tsc run rejects that as TS2300/TS1361 and
 * the upload fails at the staging build, so a compiled World must never bind
 * the same import identifier twice.
 */
function assertImportBindingsStayUnique(fixedTime: string): void {
  const prototype = createPrototypeProject("world", "fixture-import-bindings");
  const preset = getTerrainPreset("meadow-plain");
  assert(preset, "Import-binding fixture needs the meadow-plain preset");
  const terrainPlaced = addTerrainEntity(
    prototype.scene,
    prototype.assets,
    BUILTIN_ASSET_IDS.material.green,
    createTerrainFromPreset(preset),
  );
  assert(terrainPlaced, "Import-binding fixture could not place a Terrain");
  const installed = applyWaterShaderCatalogInstall(
    prototype.assets,
    WATER_SHADER_CATALOG[0],
  );
  const placed = addBuiltinPrimitiveEntity(
    terrainPlaced.scene,
    installed.manifest,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    installed.primaryAssetId,
  );
  assert(placed, "Import-binding fixture could not place the Water plane");
  const compiled = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [placed.scene.sceneId]: placed.scene },
      assets: installed.manifest,
      prefabs: prototype.prefabs,
    },
    { generatedAt: fixedTime },
  );
  assert(compiled.canStage, "Grass and Water in one Scene must stay stageable");
  const source =
    compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    source.includes("new ShaderMaterial(") &&
      /import \{[^}]*\bShaderMaterial\b[^}]*\} from "three"/.test(source),
    "The grass material must keep its ShaderMaterial value import",
  );
  for (const file of compiled.overlayFiles) {
    if (!/\.(ts|tsx)$/.test(file.relativePath)) continue;
    const bound = new Map<string, number>();
    for (const statement of file.content.matchAll(
      /^import(?:\s+type)?\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s+from\s+"[^"]+";?\s*$/gm,
    )) {
      for (const raw of statement[1].split(",")) {
        const name = raw.trim();
        if (!name) continue;
        bound.set(name, (bound.get(name) ?? 0) + 1);
      }
    }
    const duplicated = [...bound.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    assert(
      duplicated.length === 0,
      `${file.relativePath} binds the same import twice: ${duplicated.join(", ")}`,
    );
  }
}

function toCompilerDocuments(
  prototype: ReturnType<typeof createPrototypeProject>,
): VisualCompilerDocuments {
  return {
    project: prototype.project,
    scenes: { [prototype.scene.sceneId]: prototype.scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  };
}

function withFixtureColliders(
  scene: SceneDocument,
  entityId: string,
  colliders: readonly ColliderComponent[],
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) throw new Error(`Collider fixture Entity is missing: ${entityId}`);
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: [
          ...entity.components.filter((component) => component.type !== "collider"),
          ...colliders,
        ],
      },
    },
  };
}

type PrefabFixtureDocuments = VisualCompilerDocuments & {
  prefabs: Record<string, PrefabDocument>;
};

type PrefabCompilerFixture = {
  documents: PrefabFixtureDocuments;
  outerAssetId: string;
  innerAssetId: string;
  outerPrefabId: string;
  innerPrefabId: string;
  outerSourceEntityId: string;
};

function createPrefabCompilerFixture(
  world: VisualCompilerDocuments,
): PrefabCompilerFixture {
  const outerAssetId = "fixture-prefab-outer-asset";
  const innerAssetId = "fixture-prefab-inner-asset";
  const outerPrefabId = "fixture-outer";
  const innerPrefabId = "fixture-inner";
  const outerSourceEntityId = "fixture-outer-root";
  const innerSourceEntityId = "fixture-inner-root";
  const outerAsset = createPrefabAsset(
    outerAssetId,
    "Fixture Outer Prefab",
    `prefabs/${outerPrefabId}.prefab.json`,
  );
  const innerAsset = createPrefabAsset(
    innerAssetId,
    "Fixture Inner Prefab",
    `prefabs/${innerPrefabId}.prefab.json`,
  );
  if (!outerAsset || !innerAsset) {
    throw new Error("Prefab fixture Asset could not be created");
  }

  const entryScene = world.scenes[world.project.entrySceneId];
  const sourceEntity = entryScene.entities["entity-world-object"];
  const sourceMesh = sourceEntity?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
  if (!sourceEntity || !sourceMesh) {
    throw new Error("Prefab fixture source Mesh is missing");
  }

  const innerEntity: SceneEntity = {
    id: innerSourceEntityId,
    name: "Fixture Inner",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent("fixture-inner-transform", [0, 0.5, 0]),
      cloneFixtureMesh(sourceMesh, "fixture-inner-mesh"),
      createBoxColliderComponent("fixture-inner-collider", {
        halfExtents: [0.5, 0.5, 0.5],
        fitMode: "auto",
      }),
    ],
  };
  const outerEntity: SceneEntity = {
    id: outerSourceEntityId,
    name: "Fixture Outer",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent("fixture-outer-transform", [0, 0, 0]),
      {
        id: "fixture-nested-prefab-instance",
        type: "prefab-instance",
        enabled: true,
        prefabAssetId: innerAssetId,
        sourceEntityId: innerSourceEntityId,
      },
    ],
  };
  const sourceReference = {
    sceneId: entryScene.sceneId,
    rootEntityIds: [sourceEntity.id],
  };
  const outerPrefab: PrefabDocument = {
    schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
    prefabId: outerPrefabId,
    name: "Fixture Outer",
    source: sourceReference,
    rootEntityIds: [outerEntity.id],
    entities: { [outerEntity.id]: outerEntity },
  };
  const innerPrefab: PrefabDocument = {
    schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
    prefabId: innerPrefabId,
    name: "Fixture Inner",
    source: sourceReference,
    rootEntityIds: [innerEntity.id],
    entities: { [innerEntity.id]: innerEntity },
  };
  const hostEntity: SceneEntity = {
    id: "fixture-prefab-host",
    name: "Fixture Prefab Host",
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent("fixture-prefab-host-transform", [3, 0, 0]),
      {
        id: "fixture-outer-prefab-instance",
        type: "prefab-instance",
        enabled: true,
        prefabAssetId: outerAssetId,
        sourceEntityId: outerSourceEntityId,
      },
    ],
  };
  const scene: SceneDocument = {
    ...entryScene,
    rootEntityIds: [...entryScene.rootEntityIds, hostEntity.id],
    entities: { ...entryScene.entities, [hostEntity.id]: hostEntity },
  };
  const assets: AssetManifest = {
    ...world.assets,
    assets: {
      ...world.assets.assets,
      [outerAsset.id]: outerAsset,
      [innerAsset.id]: innerAsset,
    },
  };
  return {
    documents: {
      project: world.project,
      scenes: { [scene.sceneId]: scene },
      assets,
      prefabs: {
        [outerPrefab.prefabId]: outerPrefab,
        [innerPrefab.prefabId]: innerPrefab,
      },
    },
    outerAssetId,
    innerAssetId,
    outerPrefabId,
    innerPrefabId,
    outerSourceEntityId,
  };
}

function cloneFixtureMesh(mesh: MeshComponent, id: string): MeshComponent {
  return {
    ...mesh,
    id,
    ...(mesh.geometry ? { geometry: { ...mesh.geometry } } : {}),
    materialBindings: mesh.materialBindings.map((binding) => ({ ...binding })),
  };
}

function replacePrefabSourceEntity(
  scene: SceneDocument,
  prefabAssetId: string,
  sourceEntityId: string,
): SceneDocument {
  return {
    ...scene,
    entities: Object.fromEntries(
      Object.entries(scene.entities).map(([entityId, entity]) => [
        entityId,
        {
          ...entity,
          components: entity.components.map((component) =>
            component.type === "prefab-instance" &&
            component.prefabAssetId === prefabAssetId
              ? { ...component, sourceEntityId }
              : component,
          ),
        },
      ]),
    ),
  };
}

function addPrefabCycle(
  prefab: PrefabDocument,
  targetPrefabAssetId: string,
  targetSourceEntityId: string,
): PrefabDocument {
  const rootEntityId = prefab.rootEntityIds[0];
  const root = prefab.entities[rootEntityId];
  return {
    ...prefab,
    entities: {
      ...prefab.entities,
      [rootEntityId]: {
        ...root,
        components: [
          ...root.components,
          {
            id: "fixture-cycle-prefab-instance",
            type: "prefab-instance",
            enabled: true,
            prefabAssetId: targetPrefabAssetId,
            sourceEntityId: targetSourceEntityId,
          },
        ],
      },
    },
  };
}

/** Returns one generated Entity group without counting sibling physics bodies. */
function extractNamedEntitySource(source: string, entityName: string): string {
  const marker = `<group name=${JSON.stringify(entityName)}`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Generated Entity group is missing: ${entityName}`);
  }

  const groupTag = /<\/?group\b[^>]*>/g;
  groupTag.lastIndex = start;
  let depth = 0;
  for (let match = groupTag.exec(source); match; match = groupTag.exec(source)) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      depth -= 1;
    } else if (!tag.endsWith("/>")) {
      depth += 1;
    }
    if (depth === 0) return source.slice(start, groupTag.lastIndex);
  }
  throw new Error(`Generated Entity group is not closed: ${entityName}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
