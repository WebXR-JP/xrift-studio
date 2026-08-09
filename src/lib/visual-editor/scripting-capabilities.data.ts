/**
 * Static documentation payload returned by the `get_scripting_capabilities`
 * MCP tool.
 *
 * This is prose, not logic: it lives in its own module so that editing the
 * scripting docs does not produce diffs inside the tool dispatch code, and so
 * `mcp-editor-tools.ts` stays reviewable. Nothing here depends on editor state.
 */
import {
  TEXTURE_COLOR_SPACES,
  TEXTURE_WRAP_MODES,
  TEXTURE_MAG_FILTERS,
  TEXTURE_MIN_FILTERS,
} from "./asset-manifest";

export const XRIFT_SCRIPTING_CAPABILITIES: Record<string, unknown> = {
  contractVersion: "1.0.0",
  sandboxed: false,
  trustGate: true,
  trustBoundary: {
    executionRealm:
      "Studio Play runs Script modules in the application realm, not an iframe or Worker.",
    hostAccess:
      "Module-scope shadowing reduces accidental access but is not a security boundary; application globals and the application's Tauri IPC bridge may be reachable.",
    approval:
      "Before evaluation, Studio checks the exact source SHA-256, language, contract version, module policy version, project ID, and canonical project path against an approval store outside the project.",
    provenance:
      "Source provenance is shown to the user but never grants trust. A project manifest cannot approve itself.",
    mcpAuthority:
      "The XRift Studio stdio MCP editor tools/server expose no Script approval tool or authority.",
    approvalRequiredError: {
      code: "SCRIPT_APPROVAL_REQUIRED",
      description:
        "set_play_mode returns this error for unapproved Script source. The user can review and approve the exact fingerprint in Studio, or the stdio client can request unapprovedPolicy:'skip' to enter Play with those Scripts disabled; skip never grants approval.",
    },
    debugAutomationBridge:
      "Debug builds may register a privileged Tauri MCP bridge for webview JavaScript and Tauri invoke automation. That developer bridge is outside this stdio editor-tool trust boundary and is not registered or shipped in release builds.",
    clientRule:
      "After SCRIPT_APPROVAL_REQUIRED from the XRift Studio stdio MCP server, ask the user to review in Studio. Use unapprovedPolicy:'skip' only when Play without those Scripts is acceptable.",
  },
  workflow: [
    {
      step: 1,
      tools: ["get_editor_context", "list_assets", "list_entities"],
      purpose: "Read the current revision and resolve Asset and Entity IDs.",
    },
    {
      step: 2,
      tools: [
        "list_script_templates",
        "create_script_asset",
        "apply_script_template",
        "update_script_asset",
        "get_script_asset",
      ],
      purpose:
        "Choose a built-in template, create or attach it, then edit and verify TypeScript source.",
    },
    {
      step: 3,
      tools: ["add_component", "update_script_component"],
      purpose:
        "Attach the Script and declare its property, Asset, and Entity references.",
    },
    {
      step: 4,
      tools: ["set_play_mode"],
      purpose: "Compile and run the Script in Play.",
    },
    {
      step: 5,
      tools: [
        "list_component_definitions",
        "get_entity_components",
        "add_component",
        "update_component",
        "remove_component",
        "set_entity_enabled",
        "import_audio_asset",
        "get_audio_asset",
        "place_asset",
        "import_texture_asset",
        "get_texture_asset",
        "update_texture_asset",
        "set_material",
        "create_document_asset",
        "get_material_asset",
        "update_material_asset",
        "set_material_texture_transform",
        "get_particle_asset",
        "update_particle_asset",
      ],
      purpose:
        "Persist reusable Light, Audio, Texture, Material, and Particle settings independently from runtime-only Script overrides.",
    },
  ],
  recipes: {
    proximityLight: {
      purpose:
        "Emit a runtime event when one authored Entity enters another authored Entity's radius, then fade a Light on a receiver Entity.",
      templates: ["proximity-event", "event-light"],
      steps: [
        "Resolve the sensor, target, and Light receiver Entity IDs with list_entities.",
        "Create/apply proximity-event on the sensor and set properties.target plus entityReferences to the target ID.",
        "If needed, add a core.light.* Component to the receiver with add_component.",
        "Create/apply event-light on the receiver and give both Scripts the same channel property.",
        "Enter Play with set_play_mode; change radius, colors, intensities, and fadeSpeed with update_script_component for live feedback.",
      ],
      boundary:
        "The target must be an authored Entity explicitly declared in entityReferences. The player/avatar is not currently exposed through ctx.find.",
    },
  },
  runtime: {
    import: "xrift:script",
    mode: "play",
    frameUpdates:
      "Return update(delta) from start(ctx). R3F useFrame is rejected in Play and publish because its callback cannot be isolated per Script.",
    diagnostics:
      "Call get_editor_context and inspect scriptRuntime plus scriptRuntime.trust for approval-required, disabled, and running fingerprints; compile errors; lifecycle/event/Render failures; and bounded JSON-safe ctx.log output.",
    render: {
      export: "Named export Render",
      props:
        "Render receives { ctx } as ScriptRenderProps after start(ctx) succeeds. It shares the same live context, declared Asset allowlist, and Inspector/MCP property values.",
      portableModelPattern:
        "Use a TSX Script, ctx.assets.url(declaredModelId), and @react-three/drei useGLTF/Clone. Self-contained GLB is recommended.",
      restriction:
        "R3F useFrame remains unsupported; return update(delta) from start(ctx) for isolated frame work.",
    },
    lifecycle: {
      methods: [
        "ctx.lifecycle.signal: AbortSignal",
        "ctx.lifecycle.onDispose(callback): () => void",
        "ctx.lifecycle.timeout(callback, milliseconds): () => void",
        "ctx.lifecycle.interval(callback, milliseconds): () => void",
        "ctx.lifecycle.task(runWithSignal): Promise<T | undefined>",
      ],
      callbackReturns: "void | PromiseLike<void>",
      errorAttribution:
        "Synchronous throws and Promise rejections from managed callbacks are reported as phase=async failures for the owning Entity, Component, and Script.",
      cleanup:
        "The host aborts the signal, clears registered timeout/interval work, runs dispose callbacks, and cancels managed task results on Script hot reload, runtime failure, Play Stop, or unmount.",
    },
    assets: {
      scope:
        "Only Asset IDs declared in the Script Component assetReferences are accessible.",
      methods: [
        "ctx.assets.url(assetId): string | null",
        "ctx.assets.loadTexture(assetId, { colorSpace?, wrapS?, wrapT?, magFilter?, minFilter?, flipY?, generateMipmaps? }): Promise<ScriptTexture | null>",
        "ctx.assets.loadAudio(assetId, { volume?, loop?, playbackRate?, preload? }): Promise<ScriptAudio | null>",
      ],
      textureOptions: {
        colorSpace: [...TEXTURE_COLOR_SPACES],
        wrapS: [...TEXTURE_WRAP_MODES],
        wrapT: [...TEXTURE_WRAP_MODES],
        magFilter: [...TEXTURE_MAG_FILTERS],
        minFilter: [...TEXTURE_MIN_FILTERS],
        flipY: "boolean",
        generateMipmaps: "boolean",
        assetDefaults:
          "Omitted fields inherit the referenced Texture Asset importSettings (colorSpace, sampler, flipY, and generateMipmaps).",
        precedence:
          "Each explicit loadTexture option overrides only the corresponding Texture Asset default for this Script-owned load.",
        mipmapNormalization:
          "When generateMipmaps is false, a mipmap minFilter is normalized to linear.",
      },
      audioOptions: {
        volume: "0..1",
        loop: "boolean",
        playbackRate: "positive finite number",
        preload: ["none", "metadata", "auto"],
      },
      lifetime:
        "Loaded textures are disposed and Audio players are stopped/released automatically on restart or Stop.",
    },
    audioSources: {
      scope:
        "Controls Audio Source Components owned by the attached Entity and excludes child Entities.",
      methods: [
        "ctx.audioSources.list(): readonly ScriptAudioSourceInfo[]",
        "ctx.audioSources.select({ componentId?, audioAssetId? }): ScriptAudioSourceHandle",
        "ctx.audioSources.count(): number",
        "ctx.audioSources.play(): Promise<number>",
        "ctx.audioSources.pause(): number",
        "ctx.audioSources.stop(): number",
        "ctx.audioSources.seek(seconds): number",
        "ctx.audioSources.setVolume(volume): number",
        "ctx.audioSources.setLoop(loop): number",
        "ctx.audioSources.reset(): void",
      ],
      selection: {
        fields: ["componentId", "audioAssetId"],
        semantics:
          "Fields are combined with AND and selection stays inside the attached Entity. A selector may match multiple Audio Source Components.",
      },
      autoplay:
        "play() always resolves to the number of sources that actually started. Browser or webview autoplay refusal resolves as 0 and is reported by list().status as autoplay-blocked; it is not thrown into the Script.",
      persistence:
        "Runtime-only owner-scoped overrides. They are removed on Script restart or Stop and do not modify Audio Assets or Audio Source Components.",
    },
    lights: {
      scope:
        "Controls Light Components owned by the attached Entity and excludes child Entities.",
      methods: [
        "ctx.lights.list(): readonly ScriptLightInfo[]",
        "ctx.lights.select({ componentId?, lightType? }): ScriptLightHandle",
        "ctx.lights.count(): number",
        "ctx.lights.setEnabled(enabled): number",
        "ctx.lights.setColor(value): number",
        "ctx.lights.setIntensity(intensity): number",
        "ctx.lights.setDistance(distance): number",
        "ctx.lights.reset(): void",
      ],
      selection: {
        fields: ["componentId", "lightType"],
        lightTypes: [
          "ambient",
          "directional",
          "hemisphere",
          "point",
          "spot",
          "rectArea",
        ],
        distance:
          "setDistance applies only to Point and Spot lights and reports only those supported matches.",
      },
      persistence:
        "Runtime-only owner-scoped overrides. They are removed on Script restart, failure, or Stop and do not modify Light Components.",
    },
    materials: {
      scope:
        "Applies to Mesh materials owned by the attached Entity and excludes child Entities.",
      methods: [
        "ctx.materials.list(): readonly ScriptMaterialInfo[]",
        "ctx.materials.select({ meshName?, meshIndex?, materialIndex? }): ScriptMaterialHandle",
        "ctx.materials.count(): number",
        "ctx.materials.setColor(value): number",
        "ctx.materials.setOpacity(value): number",
        "ctx.materials.setEmissive(value, intensity?): number",
        "ctx.materials.setMetalness(value): number",
        "ctx.materials.setRoughness(value): number",
        "ctx.materials.setTexture(slot, textureOrNull): number",
        "ctx.materials.setTextureTransform(slot, { offset?, repeat?, center?, rotation? }): number",
        "ctx.materials.resetTextureTransform(slot): number",
        "ctx.materials.reset(): void",
      ],
      selection: {
        fields: ["meshName", "meshIndex", "materialIndex"],
        semantics:
          "Fields are combined with AND. Names can match multiple slots; indexes select exact entries from the current list() traversal.",
        resultFields: [
          "meshName",
          "meshIndex",
          "materialIndex",
          "materialName",
        ],
      },
      textureSlots: [
        "baseColor",
        "normal",
        "emissive",
        "metallicRoughness",
        "occlusion",
      ],
      textureTransforms: {
        fields: {
          offset: "[number, number]",
          repeat: "[number, number]",
          center: "[number, number]",
          rotation: "finite radians",
        },
        availability:
          "setTextureTransform and resetTextureTransform are available on ctx.materials and handles returned by select(...).",
        isolation:
          "Transforms are applied to Entity-owned, Material-slot Texture clones. They never mutate the loaded source Texture, a shared Texture Asset, another Material slot, or another Entity.",
        cleanup:
          "resetTextureTransform(slot) removes that slot transform. Script restart, failure, and Stop remove every owned clone and override automatically.",
      },
      persistence:
        "Runtime-only isolated overrides. They are restored on Script restart or Stop and do not modify Material or Texture Assets.",
    },
    particles: {
      scope:
        "Controls Particle Emitter Components owned by the attached Entity and excludes child Entities.",
      methods: [
        "ctx.particles.count(): number",
        "ctx.particles.play(): number",
        "ctx.particles.pause(): number",
        "ctx.particles.stop(): number",
        "ctx.particles.restart(): number",
        "ctx.particles.setEmissionRate(particlesPerSecond): number",
        "ctx.particles.setSpeedMultiplier(multiplier): number",
        "ctx.particles.setSizeMultiplier(multiplier): number",
        "ctx.particles.setColor(value): number",
        "ctx.particles.setOpacity(value): number",
        "ctx.particles.reset(): void",
      ],
      persistence:
        "Runtime-only composed overrides. They are removed on Script restart or Stop and do not modify Particle Assets.",
    },
    entities: {
      scope:
        "ctx.find(entityId) only resolves IDs declared in the Script Component entityReferences.",
      worldPosition:
        "Use ctx.object3d.getWorldPosition(Vector3) and target.getWorldPosition(Vector3) for proximity; position is parent-local.",
      playerBoundary:
        "ctx.find resolves authored Entity IDs only. It does not expose the runtime player/avatar.",
    },
    events: {
      methods: [
        "ctx.on(eventName, handler): () => void",
        "ctx.emit(eventName, payload?): void",
      ],
      scope:
        "Runtime-only named bus inside the current XriftScriptRoot. It is not KHR_interactivity and payloads are not cloned or persisted.",
      proximityConvention:
        'Templates proximity-event and event-light share event "xrift:proximity-state", filter by a live channel, and track each sensor by sourceEntityId. Payload kind: "enter" | "exit" | "sync"; enter/exit are edge-only and sync updates late receivers without repeating edge actions.',
    },
  },
  unsupported: [
    "dynamic import(...)",
    "R3F useFrame (use start(ctx) { return { update(delta) {} }; } instead)",
    "undeclared Asset or Entity access",
    "KTX2/HDR/EXR typed loading",
    "persistent Material Asset mutation through ctx.materials",
    "persistent Audio Source mutation through ctx.audioSources",
    "runtime player/avatar lookup through ctx.find",
  ],
  persistentAuthoring: {
    modes: ["edit", "play"],
    playSemantics:
      "Supported writes persist immediately. Scene settings update the shared Scene view. Light scalar fields update their existing runtime without restart; Light type and other structural Component/Entity changes restart only the affected Entity. Material, Texture, and Particle Asset edits restart only consuming Entities.",
    tools: [
      "set_material",
      "get_material_asset",
      "update_material_asset",
      "set_material_texture_transform",
      "get_texture_asset",
      "update_texture_asset",
      "get_audio_asset",
      "place_asset",
      "list_component_definitions",
      "get_entity_components",
      "add_component",
      "update_component",
      "remove_component",
      "set_entity_enabled",
      "create_document_asset",
      "get_particle_asset",
      "update_particle_asset",
      "update_scene_settings",
    ],
    groups: {
      materials: [
        "set_material",
        "get_material_asset",
        "update_material_asset",
        "set_material_texture_transform",
      ],
      components: [
        "list_component_definitions",
        "get_entity_components",
        "add_component",
        "update_component",
        "remove_component",
        "set_entity_enabled",
      ],
      particles: [
        "create_document_asset",
        "get_particle_asset",
        "update_particle_asset",
      ],
      textures: ["get_texture_asset", "update_texture_asset"],
      audio: [
        "get_audio_asset",
        "place_asset",
        "list_component_definitions",
        "get_entity_components",
        "add_component",
        "update_component",
        "remove_component",
      ],
      lights: [
        "list_component_definitions",
        "get_entity_components",
        "add_component",
        "update_component",
        "remove_component",
      ],
      sceneSettings: ["update_scene_settings"],
    },
    assetOperations: {
      textures: {
        read: "get_texture_asset",
        update: "update_texture_asset",
        createInEdit: "import_texture_asset",
        fields: [
          "colorSpace",
          "generateMipmaps",
          "flipY",
          "sampler.wrapS",
          "sampler.wrapT",
          "sampler.magFilter",
          "sampler.minFilter",
          "resize",
          "compression",
        ],
      },
      audio: {
        read: "get_audio_asset",
        createInEdit: "import_audio_asset",
        placeAsSource: "place_asset",
        componentDefinitionId: "core.audio-source",
        addComponent: "add_component",
        updateComponent: "update_component",
        removeComponent: "remove_component",
        componentFields: [
          "enabled",
          "audioAssetId",
          "volume",
          "loop",
          "autoplay",
          "spatial",
          "refDistance",
          "rolloffFactor",
          "maxDistance",
        ],
      },
      lights: {
        componentDefinitionIds: [
          "core.light.ambient",
          "core.light.directional",
          "core.light.hemisphere",
          "core.light.point",
          "core.light.spot",
          "core.light.area",
        ],
        addComponent: "add_component",
        updateComponent: "update_component",
        removeComponent: "remove_component",
        liveFields: [
          "enabled",
          "color",
          "intensity",
          "castShadow",
          "groundColor",
          "distance",
          "decay",
          "angle",
          "penumbra",
          "width",
          "height",
        ],
        structuralFields: ["lightType"],
      },
      materials: {
        assign: "set_material",
        create: 'create_document_asset(kind: "material")',
        read: "get_material_asset",
        update: "update_material_asset",
        updateTextureTransform: "set_material_texture_transform",
        fields: [
          "pbrMetallicRoughness",
          "normalTexture",
          "occlusionTexture",
          "emissiveTexture",
          "emissiveFactor",
          "alphaMode",
          "alphaCutoff",
          "doubleSided",
          "extensions",
          "texture offset/scale/rotation/texCoord",
        ],
      },
    },
    semantics:
      "These editor tools persist Asset, Entity, and Scene settings document changes. Use Light/Audio Source Component tools or the Texture/Material tools instead of ctx.lights, ctx.audioSources, loadTexture options, or ctx.materials when an edit must remain after Stop or be saved.",
  },
  editOnlyAuthoring: {
    modes: ["edit"],
    tools: [
      "import_audio_asset",
      "import_texture_asset",
      "import_model_asset",
      "import_skybox_asset",
      "import_shader_asset",
      "get_shader_asset",
      "update_shader_asset",
      "reimport_model_asset",
      "set_project_thumbnail",
      "get_model_asset",
      "update_model_asset",
    ],
    semantics:
      "Local Audio, Texture, Model, Skybox, and Shader source operations persist through the Editor history and autosave pipeline, but cannot run while Play is active. Model Recipe edits must be reimported before derived geometry changes are applied.",
  },
  example: [
    'import { defineScript, prop } from "xrift:script";',
    "",
    "export default defineScript({",
    '  name: "Texture pulse",',
    "  props: {",
    '    texture: prop.asset({ label: "Texture", kind: "texture" }),',
    "  },",
    "  start(ctx) {",
    "    ctx.materials.setColor(\"#ffffff\");",
    "    void ctx.lifecycle.task(async (signal) => {",
    "      const texture = await ctx.assets.loadTexture(ctx.props.texture, {",
    '        colorSpace: "srgb",',
    '        wrapS: "repeat",',
    '        wrapT: "repeat",',
    "      });",
    "      if (signal.aborted || !texture) return;",
    '      ctx.materials.setTexture("baseColor", texture);',
    '      ctx.materials.setTextureTransform("baseColor", {',
    "        repeat: [2, 2],",
    "        offset: [0, 0],",
    "      });",
    "    });",
    "  },",
    "});",
  ].join("\n"),
  referenceUpdateExample: {
    tool: "update_script_component",
    arguments: {
      entityId: "<entity-id>",
      componentId: "<script-component-id>",
      properties: { texture: "<texture-asset-id>" },
      assetReferences: ["<texture-asset-id>"],
      entityReferences: [],
    },
    note:
      "Also send projectId, sceneId, and expectedRevision from get_editor_context.",
  },
};
