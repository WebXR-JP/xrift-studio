import {
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type AudioAsset,
  type AssetManifest,
  type ModelAsset,
  type SkyboxAsset,
  type TextureAsset,
} from "../asset-manifest";
import { instantiateSceneAsset } from "../asset-placement";
import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
} from "../component-registry";
import {
  createPrefabAsset,
  PREFAB_DOCUMENT_SCHEMA_VERSION,
  type PrefabDocument,
} from "../prefab-document";
import { addDefaultParticleAsset } from "../particle-system";
import {
  createBoxColliderComponent,
  createMeshColliderComponent,
  createTransformComponent,
  type ColliderComponent,
  type MeshComponent,
  type SceneDocument,
  type SceneEntity,
} from "../scene-document";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
} from "../prototype-project";
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

  const world = toCompilerDocuments(createPrototypeProject("world", "fixture-world"));
  const fixedTime = "2026-01-01T00:00:00.000Z";
  const first = compileVisualProject(world, { generatedAt: fixedTime });
  const second = compileVisualProject(world, { generatedAt: fixedTime });
  assert(JSON.stringify(first) === JSON.stringify(second), "Compiler output is not deterministic");
  assert(first.canStage, "Default world fixture should be stageable");
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
  assert(worldSource.includes("<SpawnPoint"), "World SpawnPoint was not generated");
  assert(worldSource.includes("castShadow={true}"), "Mesh shadow settings were not generated");

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
  assert(audioResult.canStage, "Configured Audio Source should be stageable");
  assert(
    audioSource.includes("const XRiftStudioAudioSource") &&
      audioSource.includes("useCompiledAssetUrl(assetPath)") &&
      audioSource.includes(
        '"xrift-studio-fixture-audio-ambient-ambient.mp3" as const',
      ) &&
      audioSource.includes("new PositionalAudio"),
    "Three.js Audio Source runtime was not generated",
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

  const particleAssetResult = addDefaultParticleAsset(world.assets, {
    id: "fixture-particle-fireflies",
    name: "Fixture Fireflies",
    properties: {
      maxParticles: 128,
      emission: { rateOverTime: 12, bursts: [] },
      shape: { type: "sphere", radius: 0.75 },
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
  assert(
    /import \{[^}]*\buseFrame\b[^}]*\} from "@react-three\/fiber";/.test(
      particleSource,
    ),
    "Particle runtime frame loop was not generated",
  );
  assert(
    particleSource.includes("const CompiledParticleEmitter"),
    "Particle runtime component was not generated",
  );
  assert(
    particleSource.includes("<CompiledParticleEmitter config="),
    "Particle Asset was not wired to its Scene emitter",
  );

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
    colliderSource.includes('<RigidBody type="fixed" colliders={false}>'),
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
    meshColliderSource.includes(
      '<RigidBody type="fixed" colliders="trimesh" sensor={false} friction={0.8} restitution={0.1}>',
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

  const sourceScene = world.scenes[world.project.entrySceneId];
  const sourceSceneSettings = resolveSceneSettings(sourceScene.settings);
  const imageSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
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

  const projectHdrSkybox: SkyboxAsset = {
    id: "external-poly-haven-noon_grass-skybox",
    name: "Noon Grass",
    kind: "skybox",
    status: "ready",
    source: {
      kind: "project",
      relativePath:
        "assets/imported/external/poly-haven/noon_grass/noon_grass_environment_1k.hdr",
    },
    sourceHash: "fixture-noon-grass-sha256",
    projection: "equirectangular",
    sourceFormat: "hdr",
    thumbnail: { status: "missing" },
  };
  const hdrSkyboxScene: SceneDocument = {
    ...sourceScene,
    settings: {
      ...sourceSceneSettings,
      skybox: {
        ...sourceSceneSettings.skybox,
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

  const projectExrSkybox: SkyboxAsset = {
    ...projectHdrSkybox,
    id: "external-poly-haven-noon_grass-exr-skybox",
    source: {
      kind: "project",
      relativePath:
        "assets/imported/external/poly-haven/noon_grass/noon_grass_environment_1k.exr",
    },
    sourceHash: "fixture-noon-grass-exr-sha256",
    sourceFormat: "exr",
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
                    materialAssetId: BUILTIN_ASSET_IDS.material.violet,
                  },
                ],
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
  assert(
    modelSource.includes(
      '"xrift-studio-fixture-model-project-fixture.glb" as const',
    ) &&
      !modelSource.includes('"/xrift-studio/assets/'),
    "Project GLB path must be relative to the XRift base URL",
  );
  assert(modelSource.includes("<Clone"), "Model clone was not generated");
  const animationPlacement = instantiateSceneAsset(
    sourceScene,
    modelProject.assets,
    modelProject.prefabs ?? {},
    projectModel.id,
  );
  assert(animationPlacement.placed, "Animated GLB fixture could not be placed");
  if (animationPlacement.placed) {
    const placedEntity = animationPlacement.scene.entities[animationPlacement.entityId];
    assert(
      placedEntity?.components.some(
        (component) =>
          component.type === "animation" &&
          component.autoplay &&
          component.loop,
      ),
      "Animated GLB placement did not create an autoplay loop component",
    );
    assert(
      placedEntity?.components.some((component) => component.type === "mesh") &&
        placedEntity.children.length === 0,
      "Animated GLB placement must keep the source hierarchy together for clip playback",
    );
    const animationDocuments: VisualCompilerDocuments = {
      ...modelProject,
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
      "const firstAnimationName = names[0];",
      "action.setLoop(LoopRepeat, Infinity);",
      "ref={animationRoot}",
    ].forEach((fragment) =>
      assert(
        animationSource.includes(fragment),
        `Animated GLB source is missing: ${fragment}`,
      ),
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
    assert(
      retainedAnimationResult.overlayFiles.some(
        (file) =>
          file.relativePath === "src/World.tsx" &&
          file.content.includes("useAnimations"),
      ),
      "An existing Animation component stopped after the placement recipe changed",
    );
    const runtimeAnimationResult = compileVisualProject(animationDocuments, {
      generatedAt: fixedTime,
      outputMode: "classic-runtime",
    });
    assert(
      runtimeAnimationResult.runtimeManifestFile?.content.includes(
        '"type": "animation"',
      ),
      "Runtime manifest did not preserve the Animation component",
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
  assert(skybox, "Skybox fixture component could not be created");
  assert(videoScreen, "VideoScreen fixture component could not be created");
  assert(videoPlayer, "VideoPlayer fixture component could not be created");
  assert(video180Sphere, "Video180Sphere fixture component could not be created");
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
