import { createDefaultParticleAsset } from "./particle-system";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import {
  createTextureAsset,
  type AudioAsset,
  type ModelAsset,
} from "./asset-manifest";
import { createAnimationComponent } from "./scene-document";
import { createScriptAsset } from "./scripting/script-files";
import { extractScriptContract } from "./scripting/script-contract";
import {
  executeXriftMcpEditorTool,
  XRIFT_MCP_LOCAL_ASSET_TOOLS,
  XriftMcpEditorToolError,
  type XriftMcpEditorContext,
} from "./mcp-editor-tools";
import {
  XRIFT_MCP_DEBUG_TOOLS,
  XRIFT_MCP_EDITOR_TOOLS,
  XRIFT_MCP_EXTERNAL_STORE_TOOLS,
  XRIFT_MCP_SCRIPT_TOOLS,
  XRIFT_MCP_TOOLS,
  xriftMcpToolSurface,
} from "./mcp-tool-registry";

/**
 * The tool contract used to be written out by hand in six places and had
 * already drifted: the Rust allow-list carried three tools the TypeScript
 * arrays did not. These assertions hold the single registry to the shape every
 * derived list and the generated Rust schema depend on.
 */
function assertMcpToolRegistryIsCoherent(): void {
  const names = XRIFT_MCP_TOOLS.map((tool) => tool.name);
  assert(
    new Set(names).size === names.length,
    "A tool name is declared more than once in the MCP registry",
  );
  const surfaces = XRIFT_MCP_TOOLS.reduce<Record<string, number>>(
    (counts, tool) => ({
      ...counts,
      [tool.surface]: (counts[tool.surface] ?? 0) + 1,
    }),
    {},
  );
  const derivedTotal =
    XRIFT_MCP_EDITOR_TOOLS.length +
    XRIFT_MCP_LOCAL_ASSET_TOOLS.length +
    XRIFT_MCP_SCRIPT_TOOLS.length +
    XRIFT_MCP_EXTERNAL_STORE_TOOLS.length +
    XRIFT_MCP_DEBUG_TOOLS.length;
  assert(
    derivedTotal === names.length,
    `Derived tool lists cover ${derivedTotal} of ${names.length} registered tools`,
  );
  assert(
    Object.keys(surfaces).length === 5,
    "A registered tool uses a surface no derived list reads",
  );
  for (const name of names) {
    assert(
      xriftMcpToolSurface(name) !== undefined,
      `Registered tool ${name} has no resolvable surface`,
    );
  }
  assert(
    xriftMcpToolSurface("not_a_registered_tool") === undefined,
    "An unregistered tool name resolved to a surface",
  );
}

export function runXriftMcpEditorToolFixtures(): void {
  assertMcpToolRegistryIsCoherent();
  const initial = createPrototypeProject("world", "mcp-fixture");
  const particle = createDefaultParticleAsset({
    id: "asset-mcp-particle",
    name: "MCP Fireflies",
  });
  assert(particle, "Particle fixture could not be created");
  const texture = createTextureAsset({
    id: "asset-mcp-texture",
    name: "MCP Grid",
    source: { kind: "document" },
    importSettings: {},
  });
  assert(texture, "Texture fixture could not be created");
  const audio: AudioAsset = {
    id: "asset-mcp-audio",
    name: "MCP Tone",
    kind: "audio",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/audio/mcp-tone.wav",
    },
    sourceHash:
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    thumbnail: { status: "missing" },
    importMetadata: {
      sourceFormat: "wav",
      mimeType: "audio/wav",
      byteLength: 44,
    },
  };
  const skyboxTexture = createTextureAsset({
    id: "asset-mcp-skybox-texture",
    name: "MCP Skybox",
    source: {
      kind: "project",
      relativePath: "assets/environment/mcp-skybox.hdr",
    },
    importSettings: {},
  });
  assert(skyboxTexture, "Skybox Texture fixture could not be created");
  const model: ModelAsset = {
    id: "asset-mcp-model",
    name: "MCP Model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/models/mcp.glb" },
    sourceHash:
      "4f8b42c22dd3729b51b5c7e6b4e2b5f3d6a9c1f4b6a4d79b9f8f3e1f6a1c8d20",
    thumbnail: { status: "missing" },
    importSettings: {
      scale: 1,
      generateColliders: true,
      optimizeMeshes: true,
      importAnimations: true,
    },
    materialSlots: [{ slot: "body", name: "Body", sourceMaterialIndex: 0 }],
  };
  const script = createScriptAsset(
    "asset-mcp-script",
    "MCP Script",
    "scripts/mcp-script.ts",
  );
  const bundle = {
    ...initial,
    assets: {
      ...initial.assets,
      assets: {
        ...initial.assets.assets,
        [particle.id]: particle,
        [texture.id]: texture,
        [audio.id]: audio,
        [skyboxTexture.id]: skyboxTexture,
        [model.id]: model,
        [script.id]: script,
      },
    },
  };
  const context: XriftMcpEditorContext = {
    bundle,
    sceneSelection: null,
    assetSelection: null,
    editorMode: "edit",
    importBusy: false,
    revision: 4,
    saveStatus: "saved",
    now: () => "2026-07-21T00:00:00.000Z",
    scriptContracts: {
      [script.id]: extractScriptContract(`
        import { defineScript, prop } from "xrift:script";
        export default defineScript({
          name: "MCP Script",
          props: {
            speed: prop.number({ default: 2, min: 0, max: 10 }),
            axis: prop.vec3({ default: [0, 1, 0] }),
            tint: prop.color({ default: "#ffffff" }),
          },
        });
      `),
    },
  };

  const sceneSettingsResult = executeXriftMcpEditorTool(
    { ...context, editorMode: "play" },
    {
      id: "fixture-scene-settings",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 4,
        skybox: {
          enabled: true,
          projection: "dome",
          imageAssetId: skyboxTexture.id,
          topColor: "#336699",
          bottomColor: "#ddeeff",
          offset: 0.2,
          exponent: 1.5,
          rotationDegrees: 45,
          flipY: true,
          exposure: 1.25,
          meshPosition: [1, 2, 3],
          meshRotationDegrees: [0, 90, 0],
          meshScale: [80, 90, 100],
          center: [0, 0.02, 0],
        },
        fog: { enabled: false, color: "#102030", near: 12, far: 96 },
        ambient: { color: "#abcdef", intensity: 0.8 },
        camera: { near: 0.05, far: 500, fov: 60 },
        postprocessing: {
          enabled: true,
          hdr: { enabled: true, toneMapping: "aces" },
          bloom: { enabled: true, threshold: 2.4, strength: 0.18, radius: 0.24 },
          ao: { enabled: true, radius: 8, minDistance: 0.005, maxDistance: 0.12 },
          exposure: 0.78,
        },
        vegetation: { enabled: true, windStrength: 0.1, windSpeed: 0.9, gustStrength: 0.4 },
        editor: {
          backgroundColor: "#111827",
          gizmo: {
            size: 1.1,
            gridVisible: false,
            gridSize: 64,
            gridDivisions: 32,
            snapEnabled: true,
            translateSnap: 0.25,
            rotateSnapDegrees: 30,
            scaleSnap: 0.05,
          },
        },
      },
    },
  );

  const editorContext = executeXriftMcpEditorTool(
    {
      ...context,
      bundle: sceneSettingsResult.bundle,
      revision: 5,
    },
    {
      id: "fixture-context",
      tool: "get_editor_context",
      arguments: {},
    },
  );
  const scriptingCapabilities = executeXriftMcpEditorTool(context, {
    id: "fixture-scripting-capabilities",
    tool: "get_scripting_capabilities",
    arguments: {},
  });
  const trustBoundary = scriptingCapabilities.result.trustBoundary as {
    clientRule?: unknown;
    mcpAuthority?: unknown;
    approvalRequiredError?: {
      code?: unknown;
      description?: unknown;
    };
    debugAutomationBridge?: unknown;
  };
  assert(
    ["skybox", "fog", "ambient", "camera", "postprocessing", "vegetation", "editor"].every(
      (section) =>
        typeof (
          editorContext.result.sceneSettings as Record<string, unknown>
        )?.[section] === "object",
    ),
    "Editor context should expose every persisted Scene settings section",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        assets?: { methods?: string[] };
        render?: { props?: string };
      }
    )?.assets?.methods?.some((method) => method.includes("loadTexture")) &&
      (
        scriptingCapabilities.result.runtime as {
          assets?: { methods?: string[] };
        }
      )?.assets?.methods?.some((method) => method.includes("loadAudio")) &&
      (
        scriptingCapabilities.result.runtime as {
          render?: { props?: string };
        }
      )?.render?.props?.includes("ScriptRenderProps"),
    "Scripting capabilities should expose Texture, Audio, and Render context APIs",
  );
  const audioSourceCapabilities = (
    scriptingCapabilities.result.runtime as {
      audioSources?: {
        methods?: string[];
        selection?: { fields?: string[]; semantics?: unknown };
        autoplay?: unknown;
        persistence?: unknown;
      };
    }
  )?.audioSources;
  assert(
    audioSourceCapabilities?.methods?.some((method) =>
      method.includes("audioSources.select"),
    ) &&
      audioSourceCapabilities.methods.some((method) =>
        method.includes("audioSources.play"),
      ) &&
      audioSourceCapabilities.methods.some((method) =>
        method.includes("audioSources.setVolume"),
      ) &&
      audioSourceCapabilities.selection?.fields?.includes("audioAssetId") &&
      typeof audioSourceCapabilities.selection.semantics === "string" &&
      typeof audioSourceCapabilities.autoplay === "string" &&
      audioSourceCapabilities.autoplay.includes("always resolves") &&
      audioSourceCapabilities.autoplay.includes("autoplay-blocked") &&
      typeof audioSourceCapabilities.persistence === "string" &&
      audioSourceCapabilities.persistence.includes("Runtime-only"),
    "Scripting capabilities should expose owner-scoped Audio Source controls",
  );
  const lightCapabilities = (
    scriptingCapabilities.result.runtime as {
      lights?: {
        methods?: string[];
        selection?: {
          fields?: string[];
          lightTypes?: string[];
          distance?: unknown;
        };
        persistence?: unknown;
      };
      events?: {
        methods?: string[];
        scope?: unknown;
        proximityConvention?: unknown;
      };
      entities?: {
        worldPosition?: unknown;
        playerBoundary?: unknown;
      };
    }
  );
  assert(
    lightCapabilities.lights?.methods?.some((method) =>
      method.includes("lights.select"),
    ) &&
      lightCapabilities.lights.methods.some((method) =>
        method.includes("lights.setIntensity"),
      ) &&
      lightCapabilities.lights.methods.some((method) =>
        method.includes("lights.setDistance"),
      ) &&
      lightCapabilities.lights.selection?.fields?.includes("lightType") &&
      lightCapabilities.lights.selection.lightTypes?.includes("spot") &&
      typeof lightCapabilities.lights.selection.distance === "string" &&
      typeof lightCapabilities.lights.persistence === "string" &&
      lightCapabilities.lights.persistence.includes("Runtime-only"),
    "Scripting capabilities should expose owner-scoped Light controls",
  );
  assert(
    lightCapabilities.events?.methods?.some((method) =>
      method.includes("ctx.emit"),
    ) &&
      typeof lightCapabilities.events.scope === "string" &&
      lightCapabilities.events.scope.includes("not KHR_interactivity") &&
      typeof lightCapabilities.events.proximityConvention === "string" &&
      lightCapabilities.events.proximityConvention.includes(
        "xrift:proximity-state",
      ) &&
      lightCapabilities.events.proximityConvention.includes(
        "sourceEntityId",
      ) &&
      lightCapabilities.events.proximityConvention.includes(
        'kind: "enter" | "exit" | "sync"',
      ) &&
      typeof lightCapabilities.entities?.worldPosition === "string" &&
      lightCapabilities.entities.worldPosition.includes("getWorldPosition") &&
      typeof lightCapabilities.entities.playerBoundary === "string" &&
      lightCapabilities.entities.playerBoundary.includes("player/avatar"),
    "Scripting capabilities should document proximity event and Entity boundaries",
  );
  const proximityRecipe = (
    scriptingCapabilities.result.recipes as {
      proximityLight?: {
        templates?: string[];
        steps?: string[];
        boundary?: unknown;
      };
    }
  )?.proximityLight;
  assert(
    proximityRecipe?.templates?.includes("proximity-event") &&
      proximityRecipe.templates.includes("event-light") &&
      proximityRecipe.steps?.some((step) => step.includes("core.light")) &&
      typeof proximityRecipe.boundary === "string" &&
      proximityRecipe.boundary.includes("player/avatar"),
    "Scripting capabilities should expose the MCP proximity-to-Light recipe",
  );
  const textureCapabilities = (
    scriptingCapabilities.result.runtime as {
      assets?: {
        methods?: string[];
        textureOptions?: {
          magFilter?: string[];
          minFilter?: string[];
          flipY?: unknown;
          generateMipmaps?: unknown;
          assetDefaults?: unknown;
          precedence?: unknown;
        };
      };
    }
  )?.assets;
  assert(
    textureCapabilities?.methods?.some(
      (method) =>
        method.includes("magFilter?") &&
        method.includes("minFilter?") &&
        method.includes("generateMipmaps?"),
    ) &&
      textureCapabilities.textureOptions?.magFilter?.includes("linear") &&
      textureCapabilities.textureOptions?.minFilter?.includes(
        "linear-mipmap-linear",
      ) &&
      textureCapabilities.textureOptions.flipY === "boolean" &&
      textureCapabilities.textureOptions.generateMipmaps === "boolean" &&
      typeof textureCapabilities.textureOptions.assetDefaults === "string" &&
      typeof textureCapabilities.textureOptions.precedence === "string",
    "Scripting capabilities should expose Texture Asset defaults, filters, and mipmaps",
  );
  assert(
    (
      scriptingCapabilities.result.persistentAuthoring as {
        modes?: string[];
        tools?: string[];
      }
    )?.tools?.includes("update_material_asset") &&
      (
        scriptingCapabilities.result.persistentAuthoring as {
          modes?: string[];
          tools?: string[];
        }
      )?.tools?.includes("update_scene_settings") &&
      (
        scriptingCapabilities.result.persistentAuthoring as {
          modes?: string[];
        }
      )?.modes?.includes("play"),
    "Scripting capabilities should expose Play-safe Scene settings authoring",
  );
  assert(
    (
      scriptingCapabilities.result.persistentAuthoring as {
        tools?: string[];
      }
    )?.tools?.includes("update_texture_asset") &&
      (
        scriptingCapabilities.result.editOnlyAuthoring as {
          tools?: string[];
        }
      )?.tools?.includes("import_texture_asset"),
    "Scripting capabilities should distinguish Play-safe Texture settings from Edit-only import",
  );
  assert(
    XRIFT_MCP_LOCAL_ASSET_TOOLS.includes("import_audio_asset") &&
      (
        scriptingCapabilities.result.editOnlyAuthoring as {
          tools?: string[];
        }
      )?.tools?.includes("import_audio_asset"),
    "Scripting capabilities should expose Audio import as Edit-only native authoring",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        materials?: { methods?: string[] };
      }
    )?.materials?.methods?.some((method) => method.includes("materials.select")),
    "Scripting capabilities should expose Material slot selection",
  );
  const materialCapabilities = (
    scriptingCapabilities.result.runtime as {
      materials?: {
        methods?: string[];
        textureTransforms?: {
          isolation?: unknown;
          cleanup?: unknown;
        };
      };
    }
  )?.materials;
  assert(
    materialCapabilities?.methods?.some((method) =>
      method.includes("setTextureTransform"),
    ) &&
      materialCapabilities.methods.some((method) =>
        method.includes("resetTextureTransform"),
      ) &&
      typeof materialCapabilities.textureTransforms?.isolation === "string" &&
      materialCapabilities.textureTransforms.isolation.includes(
        "Entity-owned",
      ) &&
      materialCapabilities.textureTransforms.isolation.includes(
        "shared Texture Asset",
      ) &&
      typeof materialCapabilities.textureTransforms.cleanup === "string" &&
      materialCapabilities.textureTransforms.cleanup.includes("Stop"),
    "Scripting capabilities should expose isolated Material Texture transforms",
  );
  const persistentAssetOperations =
    scriptingCapabilities.result.persistentAuthoring as {
      groups?: {
        audio?: string[];
        lights?: string[];
        materials?: string[];
        textures?: string[];
      };
      assetOperations?: {
        audio?: {
          read?: unknown;
          createInEdit?: unknown;
          placeAsSource?: unknown;
          componentDefinitionId?: unknown;
          addComponent?: unknown;
          updateComponent?: unknown;
          removeComponent?: unknown;
          componentFields?: string[];
        };
        lights?: {
          componentDefinitionIds?: string[];
          addComponent?: unknown;
          updateComponent?: unknown;
          removeComponent?: unknown;
          liveFields?: string[];
          structuralFields?: string[];
        };
        textures?: {
          read?: unknown;
          update?: unknown;
          createInEdit?: unknown;
          fields?: string[];
        };
        materials?: {
          assign?: unknown;
          create?: unknown;
          read?: unknown;
          update?: unknown;
          updateTextureTransform?: unknown;
          fields?: string[];
        };
      };
    };
  assert(
    persistentAssetOperations.groups?.textures?.includes(
      "update_texture_asset",
    ) &&
      persistentAssetOperations.groups?.audio?.includes("get_audio_asset") &&
      persistentAssetOperations.assetOperations?.audio?.read ===
        "get_audio_asset" &&
      persistentAssetOperations.assetOperations.audio.createInEdit ===
        "import_audio_asset" &&
      persistentAssetOperations.assetOperations.audio.placeAsSource ===
        "place_asset" &&
      persistentAssetOperations.assetOperations.audio.componentDefinitionId ===
        "core.audio-source" &&
      persistentAssetOperations.assetOperations.audio.addComponent ===
        "add_component" &&
      persistentAssetOperations.assetOperations.audio.updateComponent ===
        "update_component" &&
      persistentAssetOperations.assetOperations.audio.removeComponent ===
        "remove_component" &&
      persistentAssetOperations.assetOperations.audio.componentFields?.includes(
        "spatial",
      ) &&
      persistentAssetOperations.groups?.lights?.includes("add_component") &&
      persistentAssetOperations.assetOperations?.lights
        ?.componentDefinitionIds?.includes("core.light.point") &&
      persistentAssetOperations.assetOperations.lights.updateComponent ===
        "update_component" &&
      persistentAssetOperations.assetOperations.lights.liveFields?.includes(
        "intensity",
      ) &&
      persistentAssetOperations.assetOperations.lights.structuralFields?.includes(
        "lightType",
      ) &&
      persistentAssetOperations.groups?.materials?.includes(
        "update_material_asset",
      ) &&
      persistentAssetOperations.assetOperations?.textures?.read ===
        "get_texture_asset" &&
      persistentAssetOperations.assetOperations.textures.update ===
        "update_texture_asset" &&
      persistentAssetOperations.assetOperations.textures.createInEdit ===
        "import_texture_asset" &&
      persistentAssetOperations.assetOperations.textures.fields?.includes(
        "sampler.minFilter",
      ) &&
      persistentAssetOperations.assetOperations?.materials?.assign ===
        "set_material" &&
      persistentAssetOperations.assetOperations.materials.update ===
        "update_material_asset" &&
      persistentAssetOperations.assetOperations.materials
        .updateTextureTransform === "set_material_texture_transform" &&
      persistentAssetOperations.assetOperations.materials.fields?.includes(
        "pbrMetallicRoughness",
      ),
    "Scripting capabilities should organize persistent Texture and Material authoring tools",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        particles?: { methods?: string[] };
      }
    )?.particles?.methods?.some((method) => method.includes("particles.restart")),
    "Scripting capabilities should expose runtime Particle controls",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        lifecycle?: { methods?: string[] };
      }
    )?.lifecycle?.methods?.some((method) => method.includes("lifecycle.task")),
    "Scripting capabilities should expose managed lifecycle tasks",
  );
  assert(
    scriptingCapabilities.result.sandboxed === false &&
      scriptingCapabilities.result.trustGate === true &&
      typeof trustBoundary?.clientRule === "string" &&
      typeof trustBoundary?.mcpAuthority === "string" &&
      trustBoundary.mcpAuthority.includes("stdio MCP editor tools/server") &&
      trustBoundary.approvalRequiredError?.code ===
        "SCRIPT_APPROVAL_REQUIRED" &&
      typeof trustBoundary.approvalRequiredError.description === "string" &&
      trustBoundary.approvalRequiredError.description.includes(
        "skip never grants approval",
      ) &&
      typeof trustBoundary.debugAutomationBridge === "string" &&
      trustBoundary.debugAutomationBridge.includes("webview JavaScript") &&
      trustBoundary.debugAutomationBridge.includes("release builds"),
    "Scripting capabilities must expose the non-sandboxed MCP trust gate",
  );
  assert(
    sceneSettingsResult.changed &&
      sceneSettingsResult.result.synchronizedDuringPlay === true,
    "Scene settings edit should change the bundle during Play",
  );
  assert(
    sceneSettingsResult.bundle.scene.settings?.skybox.imageAssetId ===
      skyboxTexture.id &&
      sceneSettingsResult.bundle.scene.settings.skybox.iblEnabled &&
      sceneSettingsResult.bundle.scene.settings.skybox.projection === "dome" &&
      sceneSettingsResult.bundle.scene.settings.fog.enabled === false &&
      sceneSettingsResult.bundle.scene.settings.ambient.intensity === 0.8 &&
      sceneSettingsResult.bundle.scene.settings.camera.fov === 60 &&
      sceneSettingsResult.bundle.scene.settings.postprocessing.hdr.enabled &&
      sceneSettingsResult.bundle.scene.settings.postprocessing.ao.maxDistance === 0.12 &&
      sceneSettingsResult.bundle.scene.settings.vegetation.windSpeed === 0.9 &&
      sceneSettingsResult.bundle.scene.settings.editor.gizmo.snapEnabled &&
      sceneSettingsResult.bundle.scene.settings.editor.backgroundColor ===
        "#111827",
    "Scene settings edit should persist Skybox, Fog, Ambient, Camera, and Editor values",
  );
  assert(
    context.bundle.scene.settings?.skybox.imageAssetId === undefined &&
      context.bundle.scene.settings?.fog.enabled !== false,
    "Scene settings edit must not mutate the input bundle",
  );

  const clearedSkybox = executeXriftMcpEditorTool(
    { ...context, bundle: sceneSettingsResult.bundle, revision: 5 },
    {
      id: "fixture-clear-skybox",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 5,
        skybox: { imageAssetId: null },
      },
    },
  );
  assert(
    clearedSkybox.bundle.scene.settings?.skybox.imageAssetId === undefined &&
      clearedSkybox.bundle.scene.settings?.skybox.iblEnabled === false,
    "Clearing the Skybox image should also disable unavailable IBL",
  );
  let invalidSceneSettingsCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-invalid-skybox-asset",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: context.revision,
        skybox: { imageAssetId: particle.id },
      },
    });
  } catch (error) {
    invalidSceneSettingsCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    invalidSceneSettingsCode === "ASSET_KIND_MISMATCH",
    "Skybox settings should reject non-Texture Asset references",
  );
  let invalidSkyboxSourceCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-invalid-skybox-source",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: context.revision,
        skybox: { imageAssetId: texture.id },
      },
    });
  } catch (error) {
    invalidSkyboxSourceCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    invalidSkyboxSourceCode === "INVALID_ARGUMENT",
    "Skybox settings should reject Texture Assets without a project source",
  );

  const textureRead = executeXriftMcpEditorTool(context, {
    id: "fixture-get-texture",
    tool: "get_texture_asset",
    arguments: { textureAssetId: texture.id },
  });
  assert(
    (textureRead.result.texture as { id?: string }).id === texture.id,
    "get_texture_asset should return the requested Texture",
  );

  const audioRead = executeXriftMcpEditorTool(context, {
    id: "fixture-get-audio",
    tool: "get_audio_asset",
    arguments: { audioAssetId: audio.id },
  });
  const audioResult = audioRead.result.audio as {
    id?: string;
    source?: { kind?: string; relativePath?: string };
    importMetadata?: { sourceFormat?: string; byteLength?: number };
  };
  const serializedAudioResult = JSON.stringify(audioRead.result);
  assert(
    audioResult.id === audio.id &&
      audioResult.source?.kind === "project" &&
      audioResult.source.relativePath === "assets/audio/mcp-tone.wav" &&
      audioResult.importMetadata?.sourceFormat === "wav" &&
      audioResult.importMetadata.byteLength === 44 &&
      !serializedAudioResult.includes("data:audio/") &&
      !serializedAudioResult.includes("sourcePath") &&
      !serializedAudioResult.includes('"bytes"'),
    "get_audio_asset should return managed metadata without binary bytes or an external source path",
  );

  let missingAudioCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-get-audio-kind-mismatch",
      tool: "get_audio_asset",
      arguments: { audioAssetId: texture.id },
    });
  } catch (error) {
    missingAudioCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingAudioCode === "AUDIO_NOT_FOUND",
    "get_audio_asset should reject non-Audio Assets",
  );

  const textureUpdated = executeXriftMcpEditorTool(
    { ...context, editorMode: "play" },
    {
      id: "fixture-update-texture",
      tool: "update_texture_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: context.revision,
        textureAssetId: texture.id,
        patch: {
          colorSpace: "linear",
          generateMipmaps: false,
          flipY: true,
          resize: { mode: "max-size", maxSize: 2048 },
          sampler: {
            wrapS: "mirrored-repeat",
            wrapT: "clamp-to-edge",
            magFilter: "nearest",
            minFilter: "linear-mipmap-linear",
          },
          compression: { format: "webp", quality: 72 },
        },
      },
    },
  );
  const updatedTexture = textureUpdated.bundle.assets.assets[texture.id];
  assert(
    textureUpdated.result.synchronizedDuringPlay === true &&
      updatedTexture?.kind === "texture" &&
      updatedTexture.importSettings.colorSpace === "linear" &&
      updatedTexture.importSettings.flipY === true &&
      updatedTexture.importSettings.sampler.wrapS === "mirrored-repeat" &&
      updatedTexture.importSettings.sampler.minFilter === "linear" &&
      updatedTexture.importSettings.compression.quality === 72,
    "update_texture_asset should persist normalized settings during Play",
  );
  assert(
    (
      context.bundle.assets.assets[texture.id] as {
        importSettings?: { flipY?: boolean };
      }
    ).importSettings?.flipY === false,
    "Texture settings update must not mutate the input bundle",
  );

  let invalidTextureCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-invalid-texture",
      tool: "update_texture_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: context.revision,
        textureAssetId: texture.id,
        patch: { sampler: { wrapS: "unsafe-wrap" } },
      },
    });
  } catch (error) {
    invalidTextureCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    invalidTextureCode === "INVALID_ARGUMENT",
    "Texture settings should reject unknown enum values",
  );

  const modelUpdated = executeXriftMcpEditorTool(context, {
    id: "fixture-update-model",
    tool: "update_model_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: context.revision,
      modelAssetId: model.id,
      patch: {
        importSettings: {
          scale: 0.5,
          generateColliders: false,
          importAnimations: false,
        },
        materialSlotBindings: { body: BUILTIN_ASSET_IDS.material.blue },
      },
    },
  });
  const updatedModel = modelUpdated.bundle.assets.assets[model.id];
  assert(
    modelUpdated.changed &&
      updatedModel?.kind === "model" &&
      updatedModel.importSettings.scale === 0.5 &&
      updatedModel.importSettings.generateColliders === false &&
      updatedModel.materialSlots[0]?.defaultMaterialAssetId ===
        BUILTIN_ASSET_IDS.material.blue,
    "update_model_asset should persist import settings and Material slot bindings",
  );

  const placed = executeXriftMcpEditorTool(
    { ...context, bundle: sceneSettingsResult.bundle, revision: 5 },
    {
      id: "fixture-place",
      tool: "place_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 5,
        assetId: particle.id,
        position: [2, 1, -3],
      },
    },
  );
  assert(placed.changed, "Asset placement should change the bundle");
  assert(placed.sceneSelection, "Placed Entity should become selected");
  assert(
    placed.bundle.scene.entities[placed.sceneSelection.id]?.components.some(
      (component) =>
        component.type === "particle-emitter" &&
        component.particleAssetId === particle.id,
    ),
    "Placed Entity should reference the requested Asset",
  );

  const prefabCreated = executeXriftMcpEditorTool(
    { ...context, bundle: placed.bundle, revision: 6 },
    {
      id: "fixture-create-prefab",
      tool: "create_prefab",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 6,
        entityId: placed.sceneSelection.id,
        name: "MCP Particle Prefab",
      },
    },
  );
  const prefabResult = prefabCreated.result as {
    prefabId?: string;
    prefabAssetId?: string;
  };
  assert(
    prefabCreated.changed &&
      prefabResult.prefabId &&
      prefabResult.prefabAssetId &&
      prefabCreated.bundle.prefabs[prefabResult.prefabId],
    "create_prefab should persist a reusable Prefab Asset and document",
  );

  let staleCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-stale",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 3,
        fog: { enabled: false },
      },
    });
  } catch (error) {
    staleCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(staleCode === "STALE_REVISION", "Stale write should be rejected");

  let current: XriftMcpEditorContext = {
    ...context,
    bundle: prefabCreated.bundle,
    revision: 7,
  };
  const placedEntityId = placed.sceneSelection?.id;
  assert(
    typeof placedEntityId === "string",
    "Placed Particle Asset should expose its Entity ID",
  );

  const folderCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-asset-folder",
    tool: "create_asset_folder",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Folder",
    },
  });
  const folderId = (folderCreated.result.folder as { id?: string }).id;
  assert(folderCreated.changed && folderId, "create_asset_folder should create a folder");
  current = { ...current, bundle: folderCreated.bundle, revision: current.revision + 1 };

  const metadataUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-project-metadata",
    tool: "update_project_metadata",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      patch: { title: "MCP Fixture Title", description: "MCP Fixture Description" },
    },
  });
  assert(
    metadataUpdated.changed &&
      (metadataUpdated.result.metadata as { title?: string }).title ===
        "MCP Fixture Title",
    "update_project_metadata should persist publish metadata",
  );
  current = { ...current, bundle: metadataUpdated.bundle, revision: current.revision + 1 };

  const assetRenamed = executeXriftMcpEditorTool(current, {
    id: "fixture-rename-asset",
    tool: "rename_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: texture.id,
      name: "MCP Grid Renamed",
    },
  });
  assert(
    (assetRenamed.result.asset as { name?: string }).name === "MCP Grid Renamed",
    "rename_asset should persist an Asset name",
  );
  current = { ...current, bundle: assetRenamed.bundle, revision: current.revision + 1 };

  const folderRenamed = executeXriftMcpEditorTool(current, {
    id: "fixture-rename-asset-folder",
    tool: "rename_asset_folder",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      folderId,
      name: "MCP Folder Renamed",
    },
  });
  assert(
    (folderRenamed.result.folder as { name?: string }).name === "MCP Folder Renamed",
    "rename_asset_folder should persist a folder name",
  );
  current = { ...current, bundle: folderRenamed.bundle, revision: current.revision + 1 };

  const assetMoved = executeXriftMcpEditorTool(current, {
    id: "fixture-move-asset",
    tool: "move_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: texture.id,
      folderId,
    },
  });
  assert(
    (assetMoved.result as { folderId?: string }).folderId === folderId,
    "move_asset should persist the target folder",
  );
  current = { ...current, bundle: assetMoved.bundle, revision: current.revision + 1 };

  const colliderInspection = executeXriftMcpEditorTool(current, {
    id: "fixture-inspect-colliders",
    tool: "inspect_colliders",
    arguments: { entityIds: [placedEntityId] },
  });
  assert(
    (colliderInspection.result.inspection as { colliderCount?: number }).colliderCount === 0,
    "inspect_colliders should return diagnostics for the requested Entity",
  );
  const colliderOptimization = executeXriftMcpEditorTool(current, {
    id: "fixture-optimize-colliders",
    tool: "optimize_colliders",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityIds: [placedEntityId],
    },
  });
  assert(
    colliderOptimization.changed === false,
    "optimize_colliders should be a no-op when no safe fix is needed",
  );

  const nestedFolderCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-nested-folder",
    tool: "create_asset_folder",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Nested Folder",
      parentId: folderId,
    },
  });
  const nestedFolderId = (nestedFolderCreated.result.folder as { id?: string }).id;
  assert(nestedFolderCreated.changed && nestedFolderId, "create_asset_folder should support nesting");
  current = { ...current, bundle: nestedFolderCreated.bundle, revision: current.revision + 1 };

  const nestedFolderMoved = executeXriftMcpEditorTool(current, {
    id: "fixture-move-asset-folder",
    tool: "move_asset_folder",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      folderId: nestedFolderId,
      parentId: null,
    },
  });
  assert(
    (nestedFolderMoved.result.folder as { parentId?: string | null }).parentId === null,
    "move_asset_folder should persist the target parent",
  );
  current = { ...current, bundle: nestedFolderMoved.bundle, revision: current.revision + 1 };

  const nestedFolderDeleted = executeXriftMcpEditorTool(current, {
    id: "fixture-delete-asset-folder",
    tool: "delete_asset_folder",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      folderId: nestedFolderId,
    },
  });
  assert(nestedFolderDeleted.changed, "delete_asset_folder should remove an empty folder");
  current = { ...current, bundle: nestedFolderDeleted.bundle, revision: current.revision + 1 };

  let referencedAssetDeleteCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-delete-referenced-asset",
      tool: "delete_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: particle.id,
      },
    });
  } catch (error) {
    referencedAssetDeleteCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    referencedAssetDeleteCode === "ASSET_DELETE_REJECTED",
    "delete_asset should protect referenced Assets",
  );

  const componentDefinitions = executeXriftMcpEditorTool(current, {
    id: "fixture-component-definitions",
    tool: "list_component_definitions",
    arguments: {},
  });
  assert(
    (
      componentDefinitions.result.definitions as Array<{
        id: string;
        supportedInProject: boolean;
      }>
    ).some(
      (definition) =>
        definition.id === "physics.rigid-body" &&
        definition.supportedInProject,
    ),
    "Component definitions should be generated from the central registry",
  );

  const materialCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-document-material",
    tool: "create_document_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "material",
      name: "MCP Authored Material",
    },
  });
  assert(
    (materialCreated.result.asset as { kind?: string }).kind === "material",
    "create_document_asset should create a Material",
  );
  current = {
    ...current,
    bundle: materialCreated.bundle,
    revision: current.revision + 1,
  };

  const particleCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-document-particle",
    tool: "create_document_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "particle",
      name: "MCP Authored Particle",
    },
  });
  const authoredParticleId = (
    particleCreated.result.asset as { id?: string }
  ).id;
  assert(
    typeof authoredParticleId === "string",
    "create_document_asset should return the Particle Asset ID",
  );
  current = {
    ...current,
    bundle: particleCreated.bundle,
    revision: current.revision + 1,
  };

  const particleRead = executeXriftMcpEditorTool(current, {
    id: "fixture-get-particle",
    tool: "get_particle_asset",
    arguments: { particleAssetId: authoredParticleId },
  });
  assert(
    (
      particleRead.result.particleAsset as {
        properties?: { emission?: { rateOverTime?: number } };
      }
    ).properties?.emission?.rateOverTime === 28,
    "get_particle_asset should expose normalized authoring properties",
  );

  const particleUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-particle",
    tool: "update_particle_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      particleAssetId: authoredParticleId,
      patch: {
        emission: { rateOverTime: 64 },
        startSize: { min: 0.2, max: 0.4 },
      },
    },
  });
  assert(
    (
      particleUpdated.result.properties as {
        emission?: { rateOverTime?: number };
      }
    ).emission?.rateOverTime === 64,
    "update_particle_asset should persist Particle properties",
  );
  current = {
    ...current,
    bundle: particleUpdated.bundle,
    revision: current.revision + 1,
  };

  const placedComponents = executeXriftMcpEditorTool(current, {
    id: "fixture-get-placed-components",
    tool: "get_entity_components",
    arguments: { entityId: placedEntityId },
  });
  const placedParticleComponent = (
    placedComponents.result.components as Array<{
      id: string;
      type: string;
      definitionId: string | null;
    }>
  ).find((component) => component.type === "particle-emitter");
  assert(
    placedParticleComponent?.definitionId === "core.particle",
    "get_entity_components should include stable definition IDs",
  );

  const particleEmitterUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-particle-emitter",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: placedEntityId,
        componentId: placedParticleComponent?.id,
        patch: { particleAssetId: authoredParticleId },
      },
    },
  );
  assert(
    particleEmitterUpdated.result.synchronizedDuringPlay === true &&
      (
        particleEmitterUpdated.result.component as {
          particleAssetId?: string;
        }
      ).particleAssetId === authoredParticleId,
    "update_component should synchronize Particle Emitter references during Play",
  );
  current = {
    ...current,
    bundle: particleEmitterUpdated.bundle,
    revision: current.revision + 1,
  };

  const entityDisabled = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-disable-entity",
      tool: "set_entity_enabled",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: placedEntityId,
        enabled: false,
      },
    },
  );
  assert(
    entityDisabled.result.synchronizedDuringPlay === true &&
      entityDisabled.bundle.scene.entities[placedEntityId]?.enabled === false,
    "set_entity_enabled should persist and synchronize during Play",
  );
  current = {
    ...current,
    bundle: entityDisabled.bundle,
    revision: current.revision + 1,
  };

  const entityList = executeXriftMcpEditorTool(current, {
    id: "fixture-list-entities",
    tool: "list_entities",
    arguments: {},
  });
  const listedEntities = entityList.result.entities as Array<{ id: string }>;
  assert(
    listedEntities.some((entity) => entity.id === placed.sceneSelection?.id),
    "list_entities should include the previously placed Entity",
  );

  const terrainCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-terrain",
    tool: "create_terrain",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Terrain",
      width: 12,
      depth: 10,
      resolution: 17,
      materialAssetId: BUILTIN_ASSET_IDS.material.green,
    },
  });
  const terrainId = terrainCreated.sceneSelection?.id;
  assert(
    terrainCreated.changed && typeof terrainId === "string",
    "create_terrain should select its new Terrain Entity",
  );
  current = { ...current, bundle: terrainCreated.bundle, revision: current.revision + 1 };

  const terrainSummary = executeXriftMcpEditorTool(current, {
    id: "fixture-get-terrain",
    tool: "get_terrain",
    arguments: { entityId: terrainId },
  });
  assert(
    terrainSummary.result.resolution === 17 &&
      terrainSummary.result.sampleCount === 17 * 17,
    "get_terrain should return Terrain dimensions without exposing samples",
  );

  const terrainSculpted = executeXriftMcpEditorTool(current, {
    id: "fixture-sculpt-terrain",
    tool: "sculpt_terrain",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      kind: "raise",
      center: [0, 0],
      radius: 2,
      strength: 1.5,
    },
  });
  assert(
    terrainSculpted.changed &&
      typeof terrainSculpted.result.maxHeight === "number" &&
      terrainSculpted.result.maxHeight > 1,
    "sculpt_terrain should persist a deterministic brush stamp",
  );
  current = { ...current, bundle: terrainSculpted.bundle, revision: current.revision + 1 };

  const terrainResampled = executeXriftMcpEditorTool(current, {
    id: "fixture-update-terrain",
    tool: "update_terrain",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      width: 20,
      depth: 14,
      resolution: 33,
    },
  });
  assert(
    terrainResampled.changed &&
      terrainResampled.result.width === 20 &&
      terrainResampled.result.resolution === 33,
    "update_terrain should resample Terrain Settings through the MCP boundary",
  );
  current = { ...current, bundle: terrainResampled.bundle, revision: current.revision + 1 };

  const primitiveCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-primitive",
    tool: "create_primitive",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      shape: "box",
      materialAssetId: BUILTIN_ASSET_IDS.material.blue,
      position: [1, 1, 1],
    },
  });
  assert(primitiveCreated.changed, "create_primitive should change the bundle");
  const primitiveId = primitiveCreated.sceneSelection?.id;
  assert(typeof primitiveId === "string", "create_primitive should select the new Entity");
  assert(
    primitiveCreated.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) => component.type === "mesh",
    ),
    "Created primitive should have a Mesh component",
  );
  current = { ...current, bundle: primitiveCreated.bundle, revision: current.revision + 1 };

  const rigidBodyAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-rigid-body",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "physics.rigid-body",
    },
  });
  const rigidBodyComponentId = rigidBodyAdded.result.componentId as string;
  assert(
    typeof rigidBodyComponentId === "string",
    "add_component should return the Rigid Body Component ID",
  );
  current = {
    ...current,
    bundle: rigidBodyAdded.bundle,
    revision: current.revision + 1,
  };

  const rigidBodyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-rigid-body",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: rigidBodyComponentId,
        patch: {
          bodyType: "kinematicPosition",
          gravityScale: 0,
          ccd: true,
        },
      },
    },
  );
  assert(
    rigidBodyUpdated.result.synchronizedDuringPlay === true &&
      (
        rigidBodyUpdated.result.component as {
          bodyType?: string;
          ccd?: boolean;
        }
      ).bodyType === "kinematicPosition" &&
      (
        rigidBodyUpdated.result.component as {
          ccd?: boolean;
        }
      ).ccd === true,
    "update_component should dispatch to the Rigid Body patch helper",
  );
  current = {
    ...current,
    bundle: rigidBodyUpdated.bundle,
    revision: current.revision + 1,
  };

  // add_component gates Animation on a Model that carries clips, so the fixture
  // seeds the component directly to exercise the update_component patch path.
  const modelAnimationComponentId = "component-mcp-animation";
  const seededAnimation = createAnimationComponent(modelAnimationComponentId);
  assert(seededAnimation, "Animation fixture component could not be created");
  const primitiveEntity = current.bundle.scene.entities[primitiveId];
  assert(primitiveEntity, "Animation fixture needs the placed primitive Entity");
  current = {
    ...current,
    bundle: {
      ...current.bundle,
      scene: {
        ...current.bundle.scene,
        entities: {
          ...current.bundle.scene.entities,
          [primitiveId]: {
            ...primitiveEntity,
            components: [...primitiveEntity.components, seededAnimation],
          },
        },
      },
    },
  };

  const modelAnimationUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-animation",
    tool: "update_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      componentId: modelAnimationComponentId,
      patch: { clipName: "Wave", speed: 1.5 },
    },
  });
  const updatedModelAnimation = modelAnimationUpdated.result.component as {
    clipName?: string;
    speed?: number;
  };
  assert(
    updatedModelAnimation.clipName === "Wave" && updatedModelAnimation.speed === 1.5,
    "update_component should persist the Animation clip and speed",
  );
  current = {
    ...current,
    bundle: modelAnimationUpdated.bundle,
    revision: current.revision + 1,
  };

  let invalidAnimationSpeedCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-invalid-animation-speed",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: modelAnimationComponentId,
        patch: { speed: 0 },
      },
    });
  } catch (error) {
    invalidAnimationSpeedCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    invalidAnimationSpeedCode === "INVALID_ARGUMENT",
    "update_component should reject an out-of-range Animation speed",
  );

  const modelAnimationRemoved = executeXriftMcpEditorTool(current, {
    id: "fixture-remove-animation",
    tool: "remove_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      componentId: modelAnimationComponentId,
    },
  });
  current = {
    ...current,
    bundle: modelAnimationRemoved.bundle,
    revision: current.revision + 1,
  };

  const rigidBodyRemoved = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-remove-rigid-body",
      tool: "remove_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: rigidBodyComponentId,
      },
    },
  );
  assert(
    rigidBodyRemoved.result.synchronizedDuringPlay === true &&
      !rigidBodyRemoved.bundle.scene.entities[
        primitiveId as string
      ]?.components.some((component) => component.id === rigidBodyComponentId),
    "remove_component should remove non-Transform Components during Play",
  );
  current = {
    ...current,
    bundle: rigidBodyRemoved.bundle,
    revision: current.revision + 1,
  };

  const primitiveComponents = executeXriftMcpEditorTool(current, {
    id: "fixture-get-primitive-components",
    tool: "get_entity_components",
    arguments: { entityId: primitiveId },
  });
  const transformComponentId = (
    primitiveComponents.result.components as Array<{
      id: string;
      type: string;
    }>
  ).find((component) => component.type === "transform")?.id;
  let transformRemoveCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-remove-transform",
      tool: "remove_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: transformComponentId,
      },
    });
  } catch (error) {
    transformRemoveCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    transformRemoveCode === "TRANSFORM_COMPONENT_REQUIRED",
    "remove_component should protect the required Transform",
  );

  const componentAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-component",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "xrift.interactable",
    },
  });
  assert(componentAdded.changed, "add_component should change the bundle");
  assert(
    componentAdded.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) =>
        component.type === "xrift-component" && component.schemaId === "xrift.interactable",
    ),
    "Entity should gain an Interactable component",
  );
  current = { ...current, bundle: componentAdded.bundle, revision: current.revision + 1 };

  const scriptAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-script",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "scripting.script",
      scriptAssetId: script.id,
    },
  });
  assert(scriptAdded.changed, "add_component should add a Script Component");
  assert(
    scriptAdded.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) =>
        component.type === "script" &&
        component.scriptAssetId === script.id &&
        component.properties.speed === 2 &&
        JSON.stringify(component.properties.axis) === "[0,1,0]",
    ),
    "Script Component should reference the requested Script and persist its declared defaults",
  );
  const scriptComponent = scriptAdded.bundle.scene.entities[
    primitiveId as string
  ]?.components.find((component) => component.type === "script");
  assert(scriptComponent, "Added Script Component should be readable");
  current = {
    ...current,
    bundle: scriptAdded.bundle,
    revision: current.revision + 1,
  };

  let genericScriptUpdateCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-generic-script-update",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        patch: { properties: { speed: 2 } },
      },
    });
  } catch (error) {
    genericScriptUpdateCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    genericScriptUpdateCode === "USE_UPDATE_SCRIPT_COMPONENT",
    "Generic Script property edits should direct MCP clients to update_script_component",
  );

  let missingReferenceCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-missing-script-reference",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        assetReferences: ["asset-does-not-exist"],
      },
    });
  } catch (error) {
    missingReferenceCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingReferenceCode === "ASSET_NOT_FOUND",
    "MCP should reject missing Asset IDs before changing Script references",
  );

  for (const [properties, label] of [
    [{ speed: 99 }, "number range"],
    [{ tint: "red" }, "color format"],
  ] as const) {
    let invalidPropertyCode: string | undefined;
    try {
      executeXriftMcpEditorTool(current, {
        id: `fixture-invalid-script-${label}`,
        tool: "update_script_component",
        arguments: {
          projectId: bundle.project.projectId,
          sceneId: bundle.scene.sceneId,
          expectedRevision: current.revision,
          entityId: primitiveId,
          componentId: scriptComponent?.id,
          properties,
        },
      });
    } catch (error) {
      invalidPropertyCode =
        error instanceof XriftMcpEditorToolError ? error.code : undefined;
    }
    assert(
      invalidPropertyCode === "SCRIPT_PROPERTY_TYPE_MISMATCH",
      `MCP should reject an invalid Script ${label}`,
    );
  }

  const scriptPropertyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-script-property",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        properties: { speed: 4.5 },
        assetReferences: [texture.id],
        entityReferences: [primitiveId],
      },
    },
  );
  assert(
    scriptPropertyUpdated.result.restartedDuringPlay === true,
    "Play-time Script property edits should report an Entity restart",
  );
  assert(
    scriptPropertyUpdated.bundle.scene.entities[
      primitiveId as string
    ]?.components.some(
      (component) =>
        component.type === "script" &&
        component.properties.speed === 4.5,
    ),
    "Play-time Script property edits should update authoring data",
  );
  assert(
    scriptPropertyUpdated.bundle.scene.entities[
      primitiveId as string
    ]?.components.some(
      (component) =>
        component.type === "script" &&
        component.assetReferences.includes(texture.id) &&
        component.entityReferences.includes(primitiveId as string),
    ),
    "MCP should declare the Asset and Entity references used by Script APIs",
  );
  current = {
    ...current,
    bundle: scriptPropertyUpdated.bundle,
    revision: current.revision + 1,
  };

  const liveScriptPropertyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-live-script-property",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        properties: { speed: 6 },
      },
    },
  );
  assert(
    liveScriptPropertyUpdated.result.restartedDuringPlay === false &&
      liveScriptPropertyUpdated.result.appliedOnNextFrame === true,
    "Property-only MCP edits should preserve the running Script instance",
  );
  current = {
    ...current,
    bundle: liveScriptPropertyUpdated.bundle,
    revision: current.revision + 1,
  };

  const transformUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-transform",
    tool: "update_transform",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      position: [9, 9, 9],
    },
  });
  assert(transformUpdated.changed, "update_transform should change the bundle");
  current = { ...current, bundle: transformUpdated.bundle, revision: current.revision + 1 };

  const primitiveMesh = current.bundle.scene.entities[primitiveId as string]?.components.find(
    (component) => component.type === "mesh",
  );
  assert(primitiveMesh?.type === "mesh", "Primitive should expose a Mesh Renderer");
  const meshUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-mesh",
    tool: "update_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      componentId: primitiveMesh.id,
      patch: {
        materialBindings: [
          {
            slot: "default",
            materialAssetId: BUILTIN_ASSET_IDS.material.blue,
          },
        ],
        castShadow: false,
        receiveShadow: false,
        maxDistance: 120,
      },
    },
  });
  const updatedMesh = meshUpdated.result.component as {
    type?: string;
    materialBindings?: Array<{ materialAssetId?: string }>;
    castShadow?: boolean;
    receiveShadow?: boolean;
    maxDistance?: number;
  };
  assert(
    meshUpdated.changed &&
      updatedMesh.type === "mesh" &&
      updatedMesh.materialBindings?.[0]?.materialAssetId ===
        BUILTIN_ASSET_IDS.material.blue &&
      updatedMesh.castShadow === false &&
      updatedMesh.receiveShadow === false &&
      updatedMesh.maxDistance === 120,
    "update_component should persist Mesh Renderer bindings and shadow settings",
  );
  current = { ...current, bundle: meshUpdated.bundle, revision: current.revision + 1 };

  const materialSet = executeXriftMcpEditorTool(current, {
    id: "fixture-set-material",
    tool: "set_material",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
    },
  });
  assert(materialSet.changed, "set_material should change the bundle");
  current = { ...current, bundle: materialSet.bundle, revision: current.revision + 1 };

  const materialUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-material",
    tool: "update_material_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      patch: {
        pbrMetallicRoughness: {
          roughnessFactor: 0.4,
        },
      },
    },
  });
  assert(materialUpdated.changed, "update_material_asset should change the Material");
  current = {
    ...current,
    bundle: materialUpdated.bundle,
    revision: current.revision + 1,
  };

  const materialTextureUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-material-texture-alias",
    tool: "update_material_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      patch: { baseColor: { textureAssetId: texture.id } },
    },
  });
  assert(
    materialTextureUpdated.changed &&
      (
        materialTextureUpdated.result.properties as {
          pbrMetallicRoughness?: {
            baseColorTexture?: { textureAssetId?: string };
          };
        }
      ).pbrMetallicRoughness?.baseColorTexture?.textureAssetId === texture.id,
    "update_material_asset should accept the MCP baseColor texture slot alias",
  );
  current = {
    ...current,
    bundle: materialTextureUpdated.bundle,
    revision: current.revision + 1,
  };

  const customShaderCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-custom-shader",
    tool: "create_custom_shader",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "Fixture Custom Shader",
    },
  });
  const customShaderAssetId = String(
    customShaderCreated.result.materialAssetId,
  );
  assert(
    customShaderCreated.changed &&
      customShaderCreated.result.shader &&
      typeof customShaderAssetId === "string",
    "create_custom_shader should create a Material-backed shader",
  );
  current = {
    ...current,
    bundle: customShaderCreated.bundle,
    revision: current.revision + 1,
  };

  const customShaderRead = executeXriftMcpEditorTool(current, {
    id: "fixture-get-custom-shader",
    tool: "get_custom_shader",
    arguments: { materialAssetId: customShaderAssetId },
  });
  assert(
    (customShaderRead.result.shader as { kind?: string }).kind === "classic-r3f",
    "get_custom_shader should return the Material shader contract",
  );

  const customShaderUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-custom-shader",
    tool: "update_custom_shader",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: customShaderAssetId,
      patch: {
        animatedTimeUniform: "uTime",
        fragmentShader:
          "uniform float uTime; void main() { gl_FragColor = vec4(abs(sin(uTime)), 0.0, 0.0, 1.0); }",
      },
    },
  });
  assert(
    customShaderUpdated.changed &&
      (customShaderUpdated.result.shader as { fragmentShader?: string })
        .fragmentShader?.includes("uTime"),
    "update_custom_shader should persist GLSL source",
  );
  current = {
    ...current,
    bundle: customShaderUpdated.bundle,
    revision: current.revision + 1,
  };

  const textureTransformUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-material-tiling",
    tool: "set_material_texture_transform",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      slot: "baseColor",
      scale: [3, 2],
      offset: [0.25, 0],
    },
  });
  assert(
    JSON.stringify(
      (
        textureTransformUpdated.result.texture as {
          transform?: { scale?: number[] };
        }
      ).transform?.scale,
    ) === JSON.stringify([3, 2]),
    "Material tiling should be authored as KHR_texture_transform scale",
  );
  current = {
    ...current,
    bundle: textureTransformUpdated.bundle,
    revision: current.revision + 1,
  };

  const renamed = executeXriftMcpEditorTool(current, {
    id: "fixture-rename",
    tool: "rename_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      name: "MCP Fixture Box",
    },
  });
  assert(renamed.changed, "rename_entity should change the bundle");
  assert(
    renamed.bundle.scene.entities[primitiveId as string]?.name === "MCP Fixture Box",
    "Entity should be renamed",
  );
  current = { ...current, bundle: renamed.bundle, revision: current.revision + 1 };

  const duplicated = executeXriftMcpEditorTool(current, {
    id: "fixture-duplicate",
    tool: "duplicate_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      position: [2, 2, 2],
    },
  });
  assert(duplicated.changed, "duplicate_entity should change the bundle");
  const duplicateId = duplicated.sceneSelection?.id;
  assert(
    typeof duplicateId === "string" && duplicateId !== primitiveId,
    "Duplicate should get a new Entity ID",
  );
  current = { ...current, bundle: duplicated.bundle, revision: current.revision + 1 };

  const prefabPlaced = executeXriftMcpEditorTool(current, {
    id: "fixture-prefab",
    tool: "place_builtin_prefab",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      recipeId: "xrift-prefab.spawn-point",
    },
  });
  assert(prefabPlaced.changed, "place_builtin_prefab should change the bundle");
  current = { ...current, bundle: prefabPlaced.bundle, revision: current.revision + 1 };

  const emptyCreated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
    id: "fixture-empty",
    tool: "create_empty_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Group",
    },
    },
  );
  assert(emptyCreated.changed, "create_empty_entity should change the bundle");
  const emptyId = emptyCreated.sceneSelection?.id;
  current = { ...current, bundle: emptyCreated.bundle, revision: current.revision + 1 };

  const reparented = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-reparent",
      tool: "reparent_entity",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: duplicateId,
        parentEntityId: emptyId,
      },
    },
  );
  assert(
    reparented.result.synchronizedDuringPlay === true &&
      reparented.bundle.scene.entities[duplicateId as string]?.parentId ===
        emptyId,
    "reparent_entity should synchronize Hierarchy changes during Play",
  );
  current = {
    ...current,
    bundle: reparented.bundle,
    revision: current.revision + 1,
  };

  const deleted = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
    id: "fixture-delete",
    tool: "delete_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: duplicateId,
    },
    },
  );
  assert(deleted.changed, "delete_entity should change the bundle");
  assert(
    !deleted.bundle.scene.entities[duplicateId as string],
    "Deleted Entity should be removed from the Scene",
  );
  current = { ...current, bundle: deleted.bundle, revision: current.revision + 1 };

  const interactivityCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-create",
    tool: "create_interactivity_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Animation Graph",
      template: "empty",
    },
  });
  const interactivityAssetId = interactivityCreated.result.assetId as string;
  assert(interactivityCreated.changed, "create_interactivity_asset should create an Asset");
  current = {
    ...current,
    bundle: interactivityCreated.bundle,
    revision: current.revision + 1,
  };

  const onStartAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-on-start",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "event/onStart",
      position: [80, 120],
    },
  });
  assert(onStartAdded.result.nodeIndex === 0, "onStart should be the first graph node");
  current = { ...current, bundle: onStartAdded.bundle, revision: current.revision + 1 };

  const animationAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-animation",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "animation/start",
      position: [420, 120],
    },
  });
  assert(animationAdded.result.nodeIndex === 1, "animation/start should be the second graph node");
  current = { ...current, bundle: animationAdded.bundle, revision: current.revision + 1 };

  const pointerAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-pointer",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "pointer/interpolate",
      position: [420, 360],
    },
  });
  assert(pointerAdded.result.nodeIndex === 2, "pointer/interpolate should be the third node");
  current = { ...current, bundle: pointerAdded.bundle, revision: current.revision + 1 };

  const pointerConfigured = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-material-pointer",
    tool: "configure_interactivity_material_pointer",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 2,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      presetId: "base-color-tiling",
    },
  });
  assert(
    (pointerConfigured.result.preset as { pointer?: string }).pointer?.includes(
      "KHR_texture_transform/scale",
    ),
    "Interactivity material target should use the official texture transform pointer",
  );
  current = {
    ...current,
    bundle: pointerConfigured.bundle,
    revision: current.revision + 1,
  };

  const graphConnected = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-connect",
    tool: "connect_interactivity_nodes",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      kind: "flow",
      sourceNode: 0,
      sourceSocket: "out",
      targetNode: 1,
      targetSocket: "in",
    },
  });
  current = { ...current, bundle: graphConnected.bundle, revision: current.revision + 1 };

  const speedUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-value",
    tool: "set_interactivity_value",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 1,
      socket: "speed",
      signature: "float",
      value: [1.5],
    },
  });
  current = { ...current, bundle: speedUpdated.bundle, revision: current.revision + 1 };

  const graphValidation = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-validate",
    tool: "validate_interactivity_asset",
    arguments: { assetId: interactivityAssetId },
  });
  assert(graphValidation.result.valid === true, "MCP-authored KHR graph should validate");
  assert(graphValidation.result.nodeCount === 3, "MCP graph should retain all nodes");

  let cycleCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-interactivity-cycle",
      tool: "connect_interactivity_nodes",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: interactivityAssetId,
        kind: "flow",
        sourceNode: 1,
        sourceSocket: "done",
        targetNode: 0,
        targetSocket: "in",
      },
    });
  } catch (error) {
    cycleCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    cycleCode === "INTERACTIVITY_VALIDATION_FAILED",
    "MCP graph writes should reject flow cycles atomically",
  );

  let missingEntityCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-delete-missing",
      tool: "delete_entity",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: "entity-does-not-exist",
      },
    });
  } catch (error) {
    missingEntityCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingEntityCode === "ENTITY_NOT_FOUND",
    "Deleting an unknown Entity should be rejected",
  );

  const analyzed = executeXriftMcpEditorTool(current, {
    id: "fixture-analyze-code",
    tool: "analyze_component_code",
    arguments: {
      source: `import { Box } from '@react-three/drei'

export function Scene() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8b5cf6" />
      </mesh>
    </group>
  )
}`,
    },
  });
  const analyzedResult = analyzed.result as {
    summary: { entityCount: number };
    plan: { nodes: unknown[] };
  };
  assert(
    analyzedResult.summary.entityCount === 2,
    "analyze_component_code should produce a group + primitive plan",
  );
  assert(
    Array.isArray(analyzedResult.plan.nodes) &&
      analyzedResult.plan.nodes.length === 2,
    "analyze_component_code should return a plan with nodes",
  );

  const applied = executeXriftMcpEditorTool(current, {
    id: "fixture-apply-code",
    tool: "apply_component_code_import_plan",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      plan: analyzedResult.plan,
    },
  });
  assert(
    applied.changed === true,
    "apply_component_code_import_plan should change the scene",
  );
  assert(
    (applied.result.entityIds as string[]).length === 2,
    "apply_component_code_import_plan should create two Entities",
  );
  current = { ...current, bundle: applied.bundle, revision: current.revision + 1 };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`XRift MCP fixture failed: ${message}`);
}
