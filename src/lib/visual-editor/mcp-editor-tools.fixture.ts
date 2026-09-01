import { createDefaultParticleAsset } from "./particle-system";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import {
  createTextureAsset,
  type AudioAsset,
  type InteractivityAsset,
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
  // The skybox fixture above is an ordinary Texture with an .hdr path, which is
  // not what the environment guards read. This one is marked as one.
  const environmentTexture = {
    ...skyboxTexture,
    id: "asset-mcp-environment-texture",
    name: "MCP Environment",
    usage: "environment" as const,
  };
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
        [environmentTexture.id]: environmentTexture,
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
          grading: { enabled: true, contrast: 1.1, saturation: 0.9, temperature: 0.2, tint: -0.1 },
          order: ["grading", "bloom"],
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
  // The order is what a look is made of as much as the values are, so MCP has
  // to reach it — and grading, which was previously Inspector-only.
  assert(
    sceneSettingsResult.bundle.scene.settings?.postprocessing.order.join(",") ===
      "grading,bloom" &&
      sceneSettingsResult.bundle.scene.settings.postprocessing.grading.enabled &&
      sceneSettingsResult.bundle.scene.settings.postprocessing.grading.temperature === 0.2,
    "Scene settings edit should persist the post effect layer order and grading",
  );
  let invalidPostEffectOrderCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-invalid-post-effect-order",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: context.revision,
        // AO re-renders the scene, so it cannot be placed among the layers,
        // and a partial order would leave the missing layer's slot to a guess.
        postprocessing: { order: ["ao", "bloom"] },
      },
    });
  } catch (error) {
    invalidPostEffectOrderCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    invalidPostEffectOrderCode === "INVALID_ARGUMENT",
    "Post effect order should reject a list that is not every orderable layer once",
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

  // The rejection above is only useful if the agent can act on it, so the same
  // unlink the delete dialog offers is reachable as a tool: detach, then delete.
  const particleReferencesDetached = executeXriftMcpEditorTool(current, {
    id: "fixture-detach-asset-references",
    tool: "detach_asset_references",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: particle.id,
    },
  });
  assert(
    (particleReferencesDetached.result.detached as unknown[]).length > 0 &&
      (particleReferencesDetached.result.remainingReferences as unknown[]).length === 0,
    "detach_asset_references should unlink every reference it reports",
  );
  // The unlink is checked on a branch of the fixture state: the rest of the
  // suite still needs the Particle emitter this would have removed.
  const detachedContext = {
    ...current,
    bundle: particleReferencesDetached.bundle,
    revision: current.revision + 1,
  };
  const detachedParticleDeleted = executeXriftMcpEditorTool(detachedContext, {
    id: "fixture-delete-detached-asset",
    tool: "delete_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: detachedContext.revision,
      assetId: particle.id,
    },
  });
  assert(
    detachedParticleDeleted.changed &&
      detachedParticleDeleted.bundle.assets.assets[particle.id] === undefined,
    "delete_asset should accept an Asset whose references were unlinked",
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

  // A grass card by hand is a plane, an alpha-blended two-sided Material and no
  // collider: four calls whose settings have to agree with each other.
  const textureCard = executeXriftMcpEditorTool(current, {
    id: "fixture-create-texture-card",
    tool: "create_texture_card",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      textureAssetId: texture.id,
      profile: "grass-cross",
    },
  });
  const cardEntityId = textureCard.result.entityId as string;
  const cardEntity = textureCard.bundle.scene.entities[cardEntityId];
  assert(
    textureCard.changed &&
      cardEntity !== undefined &&
      !cardEntity.components.some((component) => component.type === "collider"),
    "create_texture_card should create the card Entity without a collider",
  );
  assert(
    textureCard.bundle.assets.assets[
      textureCard.result.materialAssetId as string
    ]?.kind === "material",
    "create_texture_card should create the card's Material in the same call",
  );
  current = { ...current, bundle: textureCard.bundle, revision: current.revision + 1 };

  let environmentCardCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-create-texture-card-environment",
      tool: "create_texture_card",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        textureAssetId: environmentTexture.id,
        profile: "backdrop-flat",
      },
    });
  } catch (error) {
    environmentCardCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    environmentCardCode === "ASSET_KIND_MISMATCH",
    "An environment Texture belongs on the skybox, not on a card",
  );

  // create_custom_shader takes arbitrary GLSL, so a caller without the catalog
  // invents numbers for "a sky" that the catalog already has.
  const materialPresets = executeXriftMcpEditorTool(current, {
    id: "fixture-list-material-presets",
    tool: "list_material_presets",
    arguments: {},
  });
  const skyPresets = materialPresets.result.sky as Array<{
    id: string;
    parameters: Array<{ uniform: string; default: unknown }>;
  }>;
  const glowPresets = materialPresets.result.glow as Array<{ id: string }>;
  assert(
    skyPresets.length > 0 &&
      (materialPresets.result.water as unknown[]).length > 0 &&
      glowPresets.length > 0,
    "list_material_presets should expose the sky, water and glow catalogs",
  );

  const skyMaterial = executeXriftMcpEditorTool(current, {
    id: "fixture-create-sky-material",
    tool: "create_material_from_preset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "sky",
      presetId: skyPresets[0].id,
    },
  });
  const skyMaterialId = skyMaterial.result.materialAssetId as string;
  assert(
    skyMaterial.changed &&
      skyMaterial.bundle.assets.assets[skyMaterialId]?.kind === "material" &&
      typeof skyMaterial.result.nextStep === "string",
    "create_material_from_preset should install a sky Material and say what is left to do",
  );
  current = { ...current, bundle: skyMaterial.bundle, revision: current.revision + 1 };

  // A preset that is already installed is not a second copy of it.
  const skyAgain = executeXriftMcpEditorTool(current, {
    id: "fixture-create-sky-material-again",
    tool: "create_material_from_preset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "sky",
      presetId: skyPresets[0].id,
    },
  });
  assert(
    skyAgain.result.alreadyInstalled === true &&
      skyAgain.result.materialAssetId === skyMaterialId,
    "Re-creating an installed preset should reuse its Material rather than duplicate it",
  );
  current = { ...current, bundle: skyAgain.bundle, revision: current.revision + 1 };

  let glowParameterCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-glow-parameters-rejected",
      tool: "create_material_from_preset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        kind: "glow",
        presetId: glowPresets[0].id,
        parameters: { uWhatever: 1 },
      },
    });
  } catch (error) {
    glowParameterCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    glowParameterCode === "INVALID_ARGUMENT",
    "A glow preset is a tint, so it should reject shader parameters rather than ignore them",
  );

  // A caller that cannot see the ready-made sets builds a campfire out of
  // primitives, which is a dozen calls for a worse result.
  const sceneRecipes = executeXriftMcpEditorTool(current, {
    id: "fixture-list-scene-recipes",
    tool: "list_scene_recipes",
    arguments: {},
  });
  const listedRecipes = sceneRecipes.result.recipes as Array<{
    id: string;
    note: string;
    partCount: number;
    categoryLabel: string;
  }>;
  assert(
    listedRecipes.length > 0 &&
      listedRecipes.every(
        (recipe) => recipe.partCount > 0 && recipe.categoryLabel.length > 0,
      ),
    "list_scene_recipes should report each set's parts and its category label",
  );
  assert(
    listedRecipes.some((recipe) => recipe.note.length > 0),
    "list_scene_recipes should carry the note about what the author still does",
  );

  // create_terrain makes a flat plate, which is the right primitive and the
  // wrong starting point: everything the Create menu offers arrives shaped.
  const terrainCatalog = executeXriftMcpEditorTool(current, {
    id: "fixture-list-terrain-presets",
    tool: "list_terrain_presets",
    arguments: {},
  });
  const shapePresets = terrainCatalog.result.presets as Array<{ id: string }>;
  const surfacePresets = terrainCatalog.result.surfaces as Array<{
    id: string;
    parameters: Array<{ uniform: string; default: unknown }>;
  }>;
  assert(
    shapePresets.some((preset) => preset.id === "rolling-hills") &&
      surfacePresets.length > 0 &&
      surfacePresets.every((surface) =>
        surface.parameters.every((parameter) => parameter.default !== undefined),
      ),
    "list_terrain_presets should expose both catalogs with usable defaults",
  );

  const presetTerrain = executeXriftMcpEditorTool(current, {
    id: "fixture-create-terrain-from-preset",
    tool: "create_terrain_from_preset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      presetId: "rolling-hills",
    },
  });
  const presetTerrainId = presetTerrain.sceneSelection?.id as string;
  assert(
    presetTerrain.changed &&
      presetTerrain.result.grassPresetId !== null &&
      presetTerrain.result.overlappingTerrainCount === 0,
    "create_terrain_from_preset should place a shaped, planted Terrain clear of the others",
  );
  current = { ...current, bundle: presetTerrain.bundle, revision: current.revision + 1 };

  const presetShape = executeXriftMcpEditorTool(current, {
    id: "fixture-preset-terrain-shape",
    tool: "get_terrain",
    arguments: { entityId: presetTerrainId },
  });
  assert(
    (presetShape.result.maxHeight as number) >
      (presetShape.result.minHeight as number),
    "A preset Terrain should arrive sculpted rather than flat",
  );

  const surfaceApplied = executeXriftMcpEditorTool(current, {
    id: "fixture-apply-terrain-surface",
    tool: "apply_terrain_surface",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: presetTerrainId,
      surfaceId: surfacePresets[0].id,
    },
  });
  const surfaceParameters = surfaceApplied.result.parameters as Record<
    string,
    number | string
  >;
  assert(
    surfaceApplied.changed &&
      typeof surfaceApplied.result.materialAssetId === "string" &&
      Object.keys(surfaceParameters).length > 0,
    "apply_terrain_surface should install a Material and report the values it used",
  );
  // The bands are metres and this Terrain is not the preset's size, so leaving
  // them at the preset's own numbers is what makes the ground one flat colour.
  const range = {
    min: presetShape.result.minHeight as number,
    max: presetShape.result.maxHeight as number,
  };
  const lowBand = surfaceParameters.uLowHeight;
  assert(
    typeof lowBand !== "number" ||
      (lowBand >= range.min - 1e-6 && lowBand <= range.max + 1e-6),
    `The fitted height band ${String(lowBand)} fell outside ${range.min}..${range.max}`,
  );
  current = { ...current, bundle: surfaceApplied.bundle, revision: current.revision + 1 };

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

  // Terrain grass was the one Inspector panel MCP could not reach, so a Terrain
  // an agent built arrived bare. These assertions walk the same path the panel
  // does: catalog, preset, one layer, one stroke, and the layer's removal.
  const grassCatalog = executeXriftMcpEditorTool(current, {
    id: "fixture-list-terrain-grass-types",
    tool: "list_terrain_grass_types",
    arguments: {},
  });
  const grassTypes = grassCatalog.result.types as Array<{ id: string }>;
  const grassPresets = grassCatalog.result.presets as Array<{ id: string }>;
  assert(
    grassTypes.some((type) => type.id === "short-grass") &&
      grassPresets.some((preset) => preset.id === "meadow"),
    "list_terrain_grass_types should expose the grass catalog and its presets",
  );

  const grassPresetApplied = executeXriftMcpEditorTool(current, {
    id: "fixture-apply-terrain-grass-preset",
    tool: "apply_terrain_grass_preset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      presetId: "meadow",
    },
  });
  assert(
    grassPresetApplied.changed &&
      (grassPresetApplied.result.grass as unknown[]).length === 3,
    "apply_terrain_grass_preset should expand a preset into its layer stack",
  );
  current = {
    ...current,
    bundle: grassPresetApplied.bundle,
    revision: current.revision + 1,
  };

  const grassLayerAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-terrain-grass-layer",
    tool: "add_terrain_grass_layer",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      typeId: "dry-grass",
      density: 6,
      appearance: { baseColor: "#4a5f2a" },
    },
  });
  const grassLayerId = grassLayerAdded.result.layerId as string;
  const addedLayer = grassLayerAdded.result.layer as {
    resolvedAppearance: { baseColor: string };
    estimatedBlades: number;
    seed: number;
  };
  assert(
    grassLayerAdded.changed &&
      grassLayerAdded.result.layerCount === 4 &&
      addedLayer.resolvedAppearance.baseColor === "#4a5f2a" &&
      addedLayer.estimatedBlades > 0,
    "add_terrain_grass_layer should append a layer carrying its appearance override",
  );
  current = {
    ...current,
    bundle: grassLayerAdded.bundle,
    revision: current.revision + 1,
  };

  const grassLayerCleared = executeXriftMcpEditorTool(current, {
    id: "fixture-update-terrain-grass-layer",
    tool: "update_terrain_grass_layer",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      layerId: grassLayerId,
      index: 0,
      patch: { density: 9, appearance: null },
    },
  });
  const clearedLayer = grassLayerCleared.result.layer as {
    appearance: unknown;
    density: number;
  };
  assert(
    grassLayerCleared.changed &&
      clearedLayer.appearance === null &&
      clearedLayer.density === 9 &&
      (grassLayerCleared.result.order as string[])[0] === grassLayerId,
    "update_terrain_grass_layer should clear an override and move the layer",
  );
  current = {
    ...current,
    bundle: grassLayerCleared.bundle,
    revision: current.revision + 1,
  };

  const grassPainted = executeXriftMcpEditorTool(current, {
    id: "fixture-paint-terrain-grass",
    tool: "paint_terrain_grass",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      layerId: grassLayerId,
      mode: "erase",
      center: [0, 0],
      radius: 3,
      strength: 1,
    },
  });
  assert(
    grassPainted.changed &&
      (grassPainted.result.layer as { painted: boolean }).painted,
    "paint_terrain_grass should record painted coverage on the layer",
  );
  current = { ...current, bundle: grassPainted.bundle, revision: current.revision + 1 };

  let missingGrassLayerCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-paint-terrain-grass-missing-layer",
      tool: "paint_terrain_grass",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: terrainId,
        layerId: "grass-layer-does-not-exist",
        mode: "paint",
        center: [0, 0],
        radius: 1,
        strength: 0.5,
      },
    });
  } catch (error) {
    missingGrassLayerCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingGrassLayerCode === "TERRAIN_GRASS_LAYER_NOT_FOUND",
    "paint_terrain_grass should reject a layer id the Terrain does not carry",
  );

  const grassLayerDeleted = executeXriftMcpEditorTool(current, {
    id: "fixture-delete-terrain-grass-layer",
    tool: "delete_terrain_grass_layer",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: terrainId,
      layerId: grassLayerId,
    },
  });
  assert(
    grassLayerDeleted.changed && grassLayerDeleted.result.layerCount === 3,
    "delete_terrain_grass_layer should drop the layer it names",
  );
  current = {
    ...current,
    bundle: grassLayerDeleted.bundle,
    revision: current.revision + 1,
  };

  const grassSummary = executeXriftMcpEditorTool(current, {
    id: "fixture-get-terrain-grass",
    tool: "get_terrain",
    arguments: { entityId: terrainId },
  });
  assert(
    (grassSummary.result.grass as unknown[]).length === 3,
    "get_terrain should report the Terrain's remaining grass layers",
  );

  // The sculpt above raised the middle of this Terrain, so a caller that still
  // reads y=0 there is placing things inside the hill.
  const sampledPeak = executeXriftMcpEditorTool(current, {
    id: "fixture-sample-terrain-peak",
    tool: "sample_terrain_point",
    arguments: { entityId: terrainId, point: [0, 0] },
  });
  const sampledEdge = executeXriftMcpEditorTool(current, {
    id: "fixture-sample-terrain-edge",
    tool: "sample_terrain_point",
    arguments: { entityId: terrainId, point: [9.5, 6.5] },
  });
  assert(
    (sampledPeak.result.height as number) >
      (sampledEdge.result.height as number),
    "sample_terrain_point should report the sculpted height, not a flat plane",
  );
  assert(
    (sampledPeak.result.worldPosition as number[])[1] ===
      (sampledPeak.result.height as number),
    "A Terrain at the origin should report the same local and world height",
  );
  assert(
    (sampledPeak.result.grass as unknown[]).length === 3 &&
      sampledPeak.result.insideFootprint === true &&
      sampledPeak.result.hole === false,
    "sample_terrain_point should report holes and grass coverage at the point",
  );

  const outsideFootprint = executeXriftMcpEditorTool(current, {
    id: "fixture-sample-terrain-outside",
    tool: "sample_terrain_point",
    arguments: { entityId: terrainId, point: [500, 500] },
  });
  assert(
    outsideFootprint.result.insideFootprint === false,
    "A point off the Terrain should say so rather than return the clamped rim silently",
  );

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
  current = {
    ...current,
    bundle: primitiveCreated.bundle,
    revision: current.revision + 1,
  };

  // A caller reading only the Transform knows where the box is and not that it
  // is one metre across, which is the whole reason placement over MCP drifts.
  const primitiveBounds = executeXriftMcpEditorTool(current, {
    id: "fixture-get-entity-bounds",
    tool: "get_entity_bounds",
    arguments: { entityId: primitiveId },
  });
  const worldBox = primitiveBounds.result.world as {
    size: number[];
    center: number[];
  };
  assert(
    worldBox.size.every((value) => Math.abs(value - 1) < 1e-6),
    `A builtin box should measure one metre per axis, got ${worldBox.size.join(", ")}`,
  );
  assert(
    worldBox.center.every((value) => Math.abs(value - 1) < 1e-6) &&
      (primitiveBounds.result.measuredEntityIds as string[]).length === 1 &&
      (primitiveBounds.result.unmeasuredEntityIds as string[]).length === 0,
    "get_entity_bounds should place the box at the position it was created at",
  );
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

  /*
   * The Animation Component is gone, and an agent that finds one in a document
   * that has not been opened since must be told, not allowed to keep it alive
   * by editing it. Removing it still works, because that is the way out.
   */
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

  let removedComponentCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
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
  } catch (error) {
    removedComponentCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    removedComponentCode === "COMPONENT_REMOVED",
    "update_component should refuse to edit a removed Animation Component",
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

  // A flow that runs backwards is a loop, which is how a graph repeats. The
  // engine bounds a loop with an activation budget, so the document no longer
  // has to forbid one to stay safe.
  const loopConnected = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-loop",
    tool: "connect_interactivity_nodes",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      kind: "flow",
      sourceNode: 2,
      sourceSocket: "done",
      targetNode: 1,
      targetSocket: "in",
    },
  });
  current = { ...current, bundle: loopConnected.bundle, revision: current.revision + 1 };

  const loopValidation = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-loop-validate",
    tool: "validate_interactivity_asset",
    arguments: { assetId: interactivityAssetId },
  });
  assert(
    loopValidation.result.valid === true,
    "A flow loop should validate now that repeating is expressible",
  );

  // A socket the operation does not declare is refused, the same way the canvas
  // can only draw a wire between handles an operation actually has. Saving one
  // produces valid JSON that the runtime then ignores.
  let unknownSocketCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-interactivity-unknown-socket",
      tool: "connect_interactivity_nodes",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: interactivityAssetId,
        kind: "value",
        sourceNode: 2,
        sourceSocket: "value",
        targetNode: 1,
        targetSocket: "speed",
      },
    });
  } catch (error) {
    unknownSocketCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    unknownSocketCode === "SOCKET_NOT_FOUND",
    "Connecting a socket the operation does not declare should be refused",
  );

  // A cycle among values still cannot be evaluated, so it stays an error and
  // the write is rejected whole rather than leaving half a connection behind.
  for (const label of ["cycle-a", "cycle-b"]) {
    const added = executeXriftMcpEditorTool(current, {
      id: `fixture-interactivity-${label}`,
      tool: "add_interactivity_node",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: interactivityAssetId,
        op: "math/add",
      },
    });
    current = { ...current, bundle: added.bundle, revision: current.revision + 1 };
  }

  const firstValueLink = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-value-link",
    tool: "connect_interactivity_nodes",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      kind: "value",
      sourceNode: 3,
      sourceSocket: "value",
      targetNode: 4,
      targetSocket: "a",
    },
  });
  current = {
    ...current,
    bundle: firstValueLink.bundle,
    revision: current.revision + 1,
  };

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
        kind: "value",
        sourceNode: 4,
        sourceSocket: "value",
        targetNode: 3,
        targetSocket: "a",
      },
    });
  } catch (error) {
    cycleCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    cycleCode === "INTERACTIVITY_VALIDATION_FAILED",
    "MCP graph writes should reject value cycles atomically",
  );

  // An Interaction Trigger records the Entities its graph writes to, and the
  // compiler reads that list rather than the graph. The editor shell re-derives
  // it after every hand edit; these assertions hold the MCP path to the same
  // rule, so a trigger an agent wires up is not published with no dependencies.
  const triggerGraphCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-graph",
    tool: "create_interactivity_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Interaction Trigger",
      template: "empty",
    },
  });
  const triggerGraphId = triggerGraphCreated.result.assetId as string;
  current = {
    ...current,
    bundle: triggerGraphCreated.bundle,
    revision: current.revision + 1,
  };

  const triggerAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-add-component",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "interaction.trigger",
      interactivityAssetId: triggerGraphId,
    },
  });
  current = { ...current, bundle: triggerAdded.bundle, revision: current.revision + 1 };
  const triggerComponent = current.bundle.scene.entities[
    primitiveId as string
  ]?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    triggerComponent?.type === "interaction-trigger" &&
      triggerComponent.interactivityAssetId === triggerGraphId,
    "add_component should attach an Interaction Trigger to the named graph",
  );
  const triggerComponentId = triggerComponent?.id as string;

  // A recipe applied over MCP has to land runnable. The editor's palette drops
  // one into an open graph and the setup panel says what is still missing;
  // there is no panel here, so the tool has to finish the wiring itself or the
  // client is left with the same「テンプレートから作っても動かない」.
  const recipeList = executeXriftMcpEditorTool(current, {
    id: "fixture-recipe-list",
    tool: "list_interactivity_recipes",
    arguments: {},
  });
  const recipes = recipeList.result.recipes as Array<{
    id: string;
    usesInteract: boolean;
  }>;
  assert(
    recipes.some((recipe) => recipe.id === "interact-teleport" && recipe.usesInteract),
    "list_interactivity_recipes should offer the teleport recipe as press-driven",
  );
  const recipeApplied = executeXriftMcpEditorTool(current, {
    id: "fixture-recipe-apply",
    tool: "apply_interactivity_recipe",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      recipeId: "interact-teleport",
      entityId: primitiveId,
    },
  });
  current = {
    ...current,
    bundle: recipeApplied.bundle,
    revision: current.revision + 1,
  };
  assert(
    recipeApplied.result.attached === true &&
      recipeApplied.result.readyToRun === true,
    "apply_interactivity_recipe should attach the graph it created",
  );
  const recipeEntity = current.bundle.scene.entities[primitiveId as string];
  assert(
    (recipeEntity?.components ?? []).some(
      (component) =>
        component.type === "interaction-trigger" &&
        component.interactivityAssetId === recipeApplied.result.assetId,
    ),
    "the recipe's graph was not attached through an Interaction Trigger",
  );
  assert(
    (recipeEntity?.components ?? []).some(
      (component) =>
        component.type === "xrift-component" &&
        component.schemaId === "xrift.interactable",
    ),
    "a press-driven recipe left the Entity with nothing to press",
  );

  const triggerTargets = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-targets",
    tool: "list_interaction_trigger_targets",
    arguments: {},
  });
  const listedTargets = triggerTargets.result.targets as Array<{
    entityId: string;
    components: Array<{ properties: Array<{ name: string }> }>;
  }>;
  const primitiveTarget = listedTargets.find(
    (target) => target.entityId === primitiveId,
  );
  assert(
    primitiveTarget?.components[0]?.properties.some(
      (property) => property.name === "enabled",
    ) === true,
    "list_interaction_trigger_targets should report the writable properties per target",
  );

  let triggerAssetKindCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-trigger-wrong-asset",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: triggerComponentId,
        patch: { interactivityAssetId: BUILTIN_ASSET_IDS.material.blue },
      },
    });
  } catch (error) {
    triggerAssetKindCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    triggerAssetKindCode === "INVALID_ARGUMENT",
    "update_component should reject an Interaction Trigger graph that is not an Interactivity Asset",
  );

  const triggerEntry = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-on-interact",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      op: "xrift/onInteract",
    },
  });
  current = { ...current, bundle: triggerEntry.bundle, revision: current.revision + 1 };

  const triggerAction = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-set-property",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      op: "xrift/setProperty",
    },
  });
  current = { ...current, bundle: triggerAction.bundle, revision: current.revision + 1 };

  const triggerFlow = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-connect",
    tool: "connect_interactivity_nodes",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      kind: "flow",
      sourceNode: 0,
      sourceSocket: "out",
      targetNode: 1,
      targetSocket: "in",
    },
  });
  current = { ...current, bundle: triggerFlow.bundle, revision: current.revision + 1 };

  for (const [key, value] of [
    ["entity", [primitiveId as string]],
    ["targetKind", ["entity"]],
    ["property", ["enabled"]],
  ] as const) {
    const configured = executeXriftMcpEditorTool(current, {
      id: `fixture-trigger-configure-${key}`,
      tool: "set_interactivity_configuration",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: triggerGraphId,
        nodeIndex: 1,
        key,
        value,
      },
    });
    current = { ...current, bundle: configured.bundle, revision: current.revision + 1 };
  }

  const wiredTrigger = current.bundle.scene.entities[
    primitiveId as string
  ]?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    wiredTrigger?.type === "interaction-trigger" &&
      wiredTrigger.entityReferences.includes(primitiveId as string),
    "An MCP graph write should re-derive the Interaction Trigger's entityReferences",
  );

  // The Editor's picker and the MCP tool have to agree on what a valid target
  // is: a graph that saves with an Entity the Scene does not have runs at Play
  // as silence, which is the failure this tool exists to make impossible.
  const actionTargeted = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-action-target",
    tool: "configure_interactivity_trigger_action",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      nodeIndex: 1,
      entityId: primitiveId,
      componentId: "transform",
      property: "position",
      value: [1, 2, 3],
      durationSeconds: 2.5,
      easing: "ease-out-back",
    },
  });
  assert(
    actionTargeted.result.targetKind === "transform" &&
      actionTargeted.result.durationSeconds === 2.5 &&
      actionTargeted.result.easing === "ease-out-back",
    "configure_interactivity_trigger_action should record the target, duration and easing",
  );
  current = { ...current, bundle: actionTargeted.bundle, revision: current.revision + 1 };
  {
    const graph = (
      current.bundle.assets.assets[triggerGraphId as string] as InteractivityAsset
    ).extension.graphs[0]!;
    const action = graph.nodes?.[1];
    assert(
      action?.configuration?.entity?.value?.[0] === primitiveId &&
        action?.configuration?.component?.value?.[0] === "transform" &&
        action?.configuration?.property?.value?.[0] === "position",
      "The action's configuration should name the Entity, Component and property",
    );
    const valueSocket = action?.values?.value;
    assert(
      graph.types?.[valueSocket?.type ?? -1]?.signature === "float3" &&
        JSON.stringify(valueSocket?.value) === JSON.stringify([1, 2, 3]),
      "A vector3 property should write a float3 value socket",
    );
    assert(
      (action?.values?.duration?.value?.[0] as number) === 2.5,
      "The duration should be an inline value on the action node",
    );
  }

  // Re-running the tool without the target keeps it, so adjusting the timing of
  // an action does not silently reset what it points at.
  const actionRetimed = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-action-retime",
    tool: "configure_interactivity_trigger_action",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      nodeIndex: 1,
      durationSeconds: 0,
    },
  });
  assert(
    actionRetimed.result.property === "position" &&
      actionRetimed.result.durationSeconds === 0,
    "Setting only the duration should keep the action's target",
  );
  current = { ...current, bundle: actionRetimed.bundle, revision: current.revision + 1 };

  for (const [id, args, expected] of [
    [
      "unknown-entity",
      { entityId: "entity-does-not-exist", property: "enabled" },
      "TARGET_ENTITY_NOT_FOUND",
    ],
    [
      "unknown-property",
      { entityId: primitiveId, componentId: "transform", property: "loudness" },
      "TARGET_PROPERTY_NOT_FOUND",
    ],
    [
      "wrong-value-shape",
      { entityId: primitiveId, componentId: "transform", property: "position", value: 4 },
      "INVALID_ARGUMENT",
    ],
    [
      "duration-on-a-switch",
      {
        entityId: primitiveId,
        componentId: "",
        property: "enabled",
        durationSeconds: 1,
      },
      "DURATION_NOT_SUPPORTED",
    ],
  ] as const) {
    let code: string | undefined;
    try {
      executeXriftMcpEditorTool(current, {
        id: `fixture-trigger-action-${id}`,
        tool: "configure_interactivity_trigger_action",
        arguments: {
          projectId: bundle.project.projectId,
          sceneId: bundle.scene.sceneId,
          expectedRevision: current.revision,
          assetId: triggerGraphId,
          nodeIndex: 1,
          ...args,
        },
      });
    } catch (error) {
      code = error instanceof XriftMcpEditorToolError ? error.code : undefined;
    }
    assert(
      code === expected,
      `configure_interactivity_trigger_action should reject ${id} with ${expected}`,
    );
  }

  // An enum property takes the option id a client can read off
  // list_interaction_trigger_targets, not the index the socket stores.
  const audioEntityId = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-action-audio-entity",
    tool: "create_empty_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "Speaker",
    },
  });
  current = { ...current, bundle: audioEntityId.bundle, revision: current.revision + 1 };
  const speakerId = audioEntityId.result.entityId as string;
  const audioAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-action-audio-component",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: speakerId,
      definitionId: "core.audio-source",
    },
  });
  current = { ...current, bundle: audioAdded.bundle, revision: current.revision + 1 };
  const audioComponentId = audioAdded.result.componentId as string;
  const playbackSet = executeXriftMcpEditorTool(current, {
    id: "fixture-trigger-action-playback",
    tool: "configure_interactivity_trigger_action",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: triggerGraphId,
      nodeIndex: 1,
      entityId: speakerId,
      componentId: audioComponentId,
      property: "playback",
      value: "play",
    },
  });
  assert(
    Array.isArray(playbackSet.result.value) &&
      typeof (playbackSet.result.value as unknown[])[0] === "number",
    "An enum option id should be stored as its index",
  );
  current = { ...current, bundle: playbackSet.bundle, revision: current.revision + 1 };

  // A second graph in the same Asset, plus the timing the sequence relies on.
  const secondGraph = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-add-graph",
    tool: "add_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      name: "Timeline",
    },
  });
  assert(
    secondGraph.result.graphIndex === 1 && secondGraph.result.graphCount === 2,
    "add_interactivity_graph should append a graph",
  );
  current = { ...current, bundle: secondGraph.bundle, revision: current.revision + 1 };

  const defaultGraph = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-default-graph",
    tool: "update_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      graphIndex: 1,
      name: "Sequence",
      isDefault: true,
    },
  });
  assert(
    defaultGraph.result.defaultGraphIndex === 1 &&
      defaultGraph.result.name === "Sequence",
    "update_interactivity_graph should rename and set the default graph",
  );
  current = { ...current, bundle: defaultGraph.bundle, revision: current.revision + 1 };

  const copiedGraph = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-duplicate-graph",
    tool: "add_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      duplicateFromGraphIndex: 0,
    },
  });
  assert(
    copiedGraph.result.graphIndex === 2 &&
      copiedGraph.result.duplicatedFromGraphIndex === 0,
    "add_interactivity_graph should copy an existing graph",
  );
  current = { ...current, bundle: copiedGraph.bundle, revision: current.revision + 1 };

  const removedGraph = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-delete-graph",
    tool: "delete_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      graphIndex: 2,
    },
  });
  assert(
    removedGraph.result.graphCount === 2 &&
      removedGraph.result.defaultGraphIndex === 1,
    "delete_interactivity_graph should keep the default index pointing where it did",
  );
  current = { ...current, bundle: removedGraph.bundle, revision: current.revision + 1 };

  // A whole sequence written in one call, then simulated: the pair a client
  // uses to build a timeline and check that it lands where it meant.
  const replaced = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-replace-json",
    tool: "update_interactivity_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      extension: {
        graph: 0,
        graphs: [
          {
            name: "Sequence",
            types: [{ signature: "float" }],
            declarations: [
              { op: "event/onStart" },
              { op: "flow/setDelay" },
              { op: "animation/start" },
            ],
            nodes: [
              { declaration: 0, flows: { out: { node: 1 } } },
              {
                declaration: 1,
                values: { duration: { type: 0, value: [3] } },
                flows: { done: { node: 2 } },
              },
              { declaration: 2 },
            ],
          },
        ],
      },
    },
  });
  assert(
    replaced.result.graphCount === 1 && replaced.result.nodeCount === 3,
    "update_interactivity_asset should replace the whole extension",
  );
  current = { ...current, bundle: replaced.bundle, revision: current.revision + 1 };

  const simulated = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-simulate",
    tool: "simulate_interactivity_asset",
    arguments: { assetId: interactivityAssetId, horizonSeconds: 10 },
  });
  const simulatedEntries = simulated.result.entries as Array<{
    kind: string;
    timeSeconds: number;
  }>;
  assert(
    simulatedEntries.some(
      (entry) => entry.kind === "animation-start" && entry.timeSeconds >= 3,
    ),
    "simulate_interactivity_asset should report the animation after the delay",
  );
  assert(
    (simulated.result.unreachedNodes as number[]).length === 0 &&
      simulated.changed === false,
    "A fully wired graph should report no unreached nodes and change nothing",
  );

  const layout = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-layout",
    tool: "layout_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
    },
  });
  const laidOut = layout.result.positions as Array<{
    nodeIndex: number;
    position: [number, number];
  }>;
  assert(
    laidOut.length === 3 &&
      laidOut[0]!.position[0] < laidOut[1]!.position[0] &&
      laidOut[1]!.position[0] < laidOut[2]!.position[0],
    "layout_interactivity_graph should order the flow left to right",
  );
  current = { ...current, bundle: layout.bundle, revision: current.revision + 1 };

  const movedNode = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-move-node",
    tool: "move_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 2,
      position: [640, 320],
    },
  });
  assert(
    JSON.stringify(movedNode.result.position) === JSON.stringify([640, 320]),
    "move_interactivity_node should write the position it was given",
  );
  current = { ...current, bundle: movedNode.bundle, revision: current.revision + 1 };

  const duplicatedNode = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-duplicate-node",
    tool: "duplicate_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 1,
    },
  });
  assert(
    duplicatedNode.result.nodeIndex === 3 &&
      duplicatedNode.result.connectionsCopied === false,
    "duplicate_interactivity_node should append a copy without its connections",
  );
  {
    const graph = (
      current.bundle.assets.assets[interactivityAssetId as string] as InteractivityAsset
    ).extension.graphs[0]!;
    const copy = (
      duplicatedNode.bundle.assets.assets[
        interactivityAssetId as string
      ] as InteractivityAsset
    ).extension.graphs[0]!.nodes?.[3];
    assert(
      copy?.flows === undefined &&
        JSON.stringify(copy?.values?.duration?.value) ===
          JSON.stringify(graph.nodes?.[1]?.values?.duration?.value),
      "The copy should keep its inline values and drop its flows",
    );
  }
  current = {
    ...current,
    bundle: duplicatedNode.bundle,
    revision: current.revision + 1,
  };

  // Carrying a node into another graph is not a clone: over there its
  // declaration index is a different operation and its type index a different
  // signature, so both have to be resolved again on arrival.
  const secondGraphForPaste = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-paste-graph",
    tool: "add_interactivity_graph",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      name: "Paste target",
    },
  });
  const pasteGraphIndex = secondGraphForPaste.result.graphIndex as number;
  current = {
    ...current,
    bundle: secondGraphForPaste.bundle,
    revision: current.revision + 1,
  };

  const pasted = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-paste-node",
    tool: "duplicate_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      graphIndex: 0,
      targetGraphIndex: pasteGraphIndex,
      nodeIndex: 1,
    },
  });
  assert(
    pasted.result.nodeIndex === 0 && pasted.result.op === "flow/setDelay",
    "duplicate_interactivity_node should paste into the graph it was told to",
  );
  {
    const graphs = (
      pasted.bundle.assets.assets[interactivityAssetId as string] as InteractivityAsset
    ).extension.graphs;
    const source = graphs[0]!;
    const target = graphs[pasteGraphIndex]!;
    const copy = target.nodes?.[0];
    assert(
      target.declarations?.[copy?.declaration ?? -1]?.op === "flow/setDelay",
      "the pasted node's declaration was not resolved in the graph it landed in",
    );
    const sourceSocket = source.nodes?.[1]?.values?.duration;
    const copiedSocket = copy?.values?.duration;
    assert(
      target.types?.[copiedSocket?.type ?? -1]?.signature ===
        source.types?.[sourceSocket?.type ?? -1]?.signature &&
        JSON.stringify(copiedSocket?.value) === JSON.stringify(sourceSocket?.value),
      "the pasted node lost the type or the value of its inline socket",
    );
    assert(
      source.nodes?.length === 4,
      "pasting into another graph should not change the graph it came from",
    );
  }
  current = { ...current, bundle: pasted.bundle, revision: current.revision + 1 };

  let replaceRejectedCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-interactivity-replace-invalid",
      tool: "update_interactivity_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: interactivityAssetId,
        extension: { graphs: [{ name: "Broken", nodes: [{ declaration: 7 }] }] },
      },
    });
  } catch (error) {
    replaceRejectedCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    replaceRejectedCode === "INVALID_EXTENSION",
    "update_interactivity_asset should refuse JSON that is not a valid extension",
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
