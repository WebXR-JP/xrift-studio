import { instantiateSceneAsset, isScenePlaceableAsset } from "./asset-placement";
import {
  getBuiltinPrefabRecipe,
  instantiateBuiltinPrefab,
} from "./builtin-prefab-catalog";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import { createDocumentId } from "./document-id";
import {
  EDITOR_COMPONENT_REGISTRY,
  addEditorComponent,
  createEmptyEntity as createEmptySceneEntity,
  deleteEntityHierarchy,
  getEntityReparentDecision,
  renameAsset,
  reparentEntityHierarchy,
  updateEntityEnabled,
} from "./editor-session";
import {
  assignMaterialToMeshSlots,
  assignMaterialToPrimaryMeshSlot,
} from "./material-assignment";
import type { PrototypeVisualProject } from "./prototype-project";
import {
  addBuiltinPrimitiveEntity,
  duplicateEntityHierarchy,
  renameEntity as renameEntityInScene,
  updateAnimationComponent,
  updateAudioSourceComponent,
  updateColliderComponent,
  updateEntityTransform,
  updateLightComponent,
  updateRigidBodyComponent,
  updateTextComponent,
  type AnimationPatch,
  type AudioSourcePatch,
  type ColliderPatch,
  type LightPatch,
  type RigidBodyPatch,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
  type ScriptComponent,
  type TextPatch,
  type Vec3,
} from "./scene-document";
import { resolveSceneSettings, type SceneFogSettings } from "./scene-settings";
import {
  getScriptPropValueValidationError,
  type ScriptContract,
} from "./scripting/script-contract";
import type { ScriptRuntimeReport } from "./scripting/runtime-report";
import {
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  addDefaultInteractivityAsset,
  cloneKhrInteractivityExtension,
  configureInteractivityMaterialPointer,
  getInteractivityOperationTemplate,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
} from "./interactivity-graph";
import {
  getMaterialAsset,
  updateMaterialAsset,
  type InteractivityAsset,
  type MaterialAssetPatch,
  type MaterialProperties,
  type MaterialTextureInfo,
  type MaterialTextureInfoPatch,
} from "./asset-manifest";
import {
  removeXriftComponent,
  updateXriftComponent,
  type UpdateXriftComponentPatch,
} from "./component-registry";
import { addDefaultDocumentAsset } from "./document-asset-creation";
import {
  updateParticleAsset,
  type ParticlePropertiesPatch,
} from "./particle-system";

export const XRIFT_MCP_EDITOR_TOOLS = [
  "get_editor_context",
  "get_scripting_capabilities",
  "list_assets",
  "create_document_asset",
  "get_particle_asset",
  "update_particle_asset",
  "update_scene_settings",
  "place_asset",
  "list_entities",
  "list_component_definitions",
  "get_entity_components",
  "create_primitive",
  "place_builtin_prefab",
  "add_component",
  "update_component",
  "remove_component",
  "set_entity_enabled",
  "update_script_component",
  "update_transform",
  "set_material",
  "get_material_asset",
  "update_material_asset",
  "set_material_texture_transform",
  "rename_entity",
  "duplicate_entity",
  "reparent_entity",
  "delete_entity",
  "create_empty_entity",
  "list_interactivity_operations",
  "get_interactivity_asset",
  "create_interactivity_asset",
  "add_interactivity_node",
  "connect_interactivity_nodes",
  "set_interactivity_value",
  "set_interactivity_configuration",
  "configure_interactivity_material_pointer",
  "disconnect_interactivity_socket",
  "delete_interactivity_node",
  "validate_interactivity_asset",
] as const;

export type XriftMcpEditorToolName = (typeof XRIFT_MCP_EDITOR_TOOLS)[number];

/** Script tools perform project file I/O or change Play mode in the React host. */
export const XRIFT_MCP_SCRIPT_TOOLS = [
  "list_script_templates",
  "get_script_asset",
  "create_script_asset",
  "apply_script_template",
  "update_script_asset",
  "set_play_mode",
] as const;

export type XriftMcpScriptToolName = (typeof XRIFT_MCP_SCRIPT_TOOLS)[number];

export type XriftMcpEditorRequest = {
  id: string;
  tool: XriftMcpEditorToolName;
  arguments: Record<string, unknown>;
};

export type XriftMcpEditorSelection = {
  kind: "entity";
  id: string;
} | null;

export type XriftMcpEditorContext = {
  bundle: PrototypeVisualProject;
  sceneSelection: XriftMcpEditorSelection;
  assetSelection: string | null;
  editorMode: "edit" | "play";
  importBusy: boolean;
  revision: number;
  saveStatus: "dirty" | "saving" | "saved" | "error" | "unavailable";
  /** Derived from source; supplied by the live editor for typed MCP writes. */
  scriptContracts?: Readonly<Record<string, ScriptContract>>;
  /** JSON-safe live diagnostics supplied by the running Script host. */
  scriptRuntime?: ScriptRuntimeReport;
  now?: () => string;
};

export type XriftMcpEditorToolOutcome = {
  changed: boolean;
  bundle: PrototypeVisualProject;
  sceneSelection: XriftMcpEditorSelection;
  assetSelection: string | null;
  result: Record<string, unknown>;
  activity: string;
};

export class XriftMcpEditorToolError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "XriftMcpEditorToolError";
    this.code = code;
    this.details = details;
  }
}

export function executeXriftMcpEditorTool(
  context: XriftMcpEditorContext,
  request: XriftMcpEditorRequest,
): XriftMcpEditorToolOutcome {
  switch (request.tool) {
    case "get_editor_context":
      return readEditorContext(context);
    case "get_scripting_capabilities":
      return readScriptingCapabilities(context);
    case "list_assets":
      return listAssets(context, request.arguments);
    case "create_document_asset":
      return createDocumentAsset(context, request.arguments);
    case "get_particle_asset":
      return getParticleAsset(context, request.arguments);
    case "update_particle_asset":
      return updateParticleAssetTool(context, request.arguments);
    case "update_scene_settings":
      return updateSceneSettings(context, request.arguments);
    case "place_asset":
      return placeAsset(context, request.arguments);
    case "list_entities":
      return listEntities(context);
    case "list_component_definitions":
      return listComponentDefinitions(context);
    case "get_entity_components":
      return getEntityComponents(context, request.arguments);
    case "create_primitive":
      return createPrimitive(context, request.arguments);
    case "place_builtin_prefab":
      return placeBuiltinPrefab(context, request.arguments);
    case "add_component":
      return addComponent(context, request.arguments);
    case "update_component":
      return updateComponent(context, request.arguments);
    case "remove_component":
      return removeComponent(context, request.arguments);
    case "set_entity_enabled":
      return setEntityEnabled(context, request.arguments);
    case "update_script_component":
      return updateScriptComponent(context, request.arguments);
    case "update_transform":
      return updateTransform(context, request.arguments);
    case "set_material":
      return setMaterial(context, request.arguments);
    case "get_material_asset":
      return getMaterial(context, request.arguments);
    case "update_material_asset":
      return updateMaterial(context, request.arguments);
    case "set_material_texture_transform":
      return setMaterialTextureTransform(context, request.arguments);
    case "rename_entity":
      return renameEntity(context, request.arguments);
    case "duplicate_entity":
      return duplicateEntity(context, request.arguments);
    case "reparent_entity":
      return reparentEntity(context, request.arguments);
    case "delete_entity":
      return deleteEntity(context, request.arguments);
    case "create_empty_entity":
      return createEmptyEntity(context, request.arguments);
    case "list_interactivity_operations":
      return listInteractivityOperations(context);
    case "get_interactivity_asset":
      return getInteractivityAsset(context, request.arguments);
    case "create_interactivity_asset":
      return createInteractivityAsset(context, request.arguments);
    case "add_interactivity_node":
      return addInteractivityNode(context, request.arguments);
    case "connect_interactivity_nodes":
      return connectInteractivityNodes(context, request.arguments);
    case "set_interactivity_value":
      return setInteractivityValue(context, request.arguments);
    case "set_interactivity_configuration":
      return setInteractivityConfiguration(context, request.arguments);
    case "configure_interactivity_material_pointer":
      return configureInteractivityMaterial(context, request.arguments);
    case "disconnect_interactivity_socket":
      return disconnectInteractivitySocket(context, request.arguments);
    case "delete_interactivity_node":
      return deleteInteractivityNode(context, request.arguments);
    case "validate_interactivity_asset":
      return validateInteractivityAsset(context, request.arguments);
  }
}

function readScriptingCapabilities(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  return unchanged(
    context,
    {
      contractVersion: "1.0.0",
      sandboxed: false,
      trustGate: false,
      trustBoundary: {
        executionRealm:
          "Studio Play runs Script modules in the application realm, not an iframe or Worker.",
        hostAccess:
          "Module-scope shadowing reduces accidental access but is not a security boundary; application globals and the Tauri bridge may be reachable.",
        provenance:
          "No first-Play trust prompt or persisted approval currently distinguishes user-authored, imported, Starter, Prefab, external Store, or MCP-authored Script source.",
        clientRule:
          "Do not run Script source from an untrusted project, Prefab, Starter, Store, or MCP response without showing the source files to the user and obtaining explicit approval.",
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
            "update_component",
            "remove_component",
            "set_entity_enabled",
            "create_document_asset",
            "get_particle_asset",
            "update_particle_asset",
          ],
          purpose:
            "Persist reusable Particle Assets and Entity Component settings independently from runtime-only Script overrides.",
        },
      ],
      runtime: {
        import: "xrift:script",
        mode: "play",
        frameUpdates:
          "Return update(delta) from start(ctx). R3F useFrame is rejected in Play and publish because its callback cannot be isolated per Script.",
        diagnostics:
          "Call get_editor_context and inspect scriptRuntime for compile errors, lifecycle/event/Render failures, and bounded JSON-safe ctx.log output.",
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
            "ctx.assets.loadTexture(assetId, { colorSpace?, wrapS?, wrapT?, flipY? }): Promise<ScriptTexture | null>",
          ],
          textureOptions: {
            colorSpace: ["auto", "srgb", "linear"],
            wrapS: ["repeat", "clamp-to-edge", "mirrored-repeat"],
            wrapT: ["repeat", "clamp-to-edge", "mirrored-repeat"],
          },
          lifetime:
            "Loaded textures are cached per Script instance and disposed automatically on restart or Stop.",
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
          persistence:
            "Runtime-only isolated overrides. They are restored on Script restart or Stop and do not modify Material Assets.",
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
        },
      },
      unsupported: [
        "dynamic import(...)",
        "R3F useFrame (use start(ctx) { return { update(delta) {} }; } instead)",
        "undeclared Asset or Entity access",
        "KTX2/HDR/EXR typed loading",
        "persistent Material Asset mutation through ctx.materials",
      ],
      persistentAuthoring: {
        modes: ["edit", "play"],
        playSemantics:
          "Supported writes persist immediately. Component and Entity changes restart only the affected Entity; Material and Particle Asset edits restart only consuming Entities.",
        tools: [
          "set_material",
          "get_material_asset",
          "update_material_asset",
          "set_material_texture_transform",
          "list_component_definitions",
          "get_entity_components",
          "add_component",
          "update_component",
          "remove_component",
          "set_entity_enabled",
          "create_document_asset",
          "get_particle_asset",
          "update_particle_asset",
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
        },
        semantics:
          "These editor tools persist Asset and Entity document changes. Use them instead of ctx.materials or ctx.particles when the edit must remain after Stop or be saved.",
      },
      example: [
        'import { defineScript, prop } from "xrift:script";',
        "",
        "const props = { texture: prop.asset({ kind: \"texture\" }) };",
        "",
        "export default defineScript({",
        '  name: "Texture pulse",',
        "  props,",
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
    },
    "Scripting capabilityを取得しました",
  );
}

function readEditorContext(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const sceneSettings = resolveSceneSettings(context.bundle.scene.settings);
  const selectedEntity = context.sceneSelection
    ? context.bundle.scene.entities[context.sceneSelection.id]
    : undefined;
  const selectedAsset = context.assetSelection
    ? context.bundle.assets.assets[context.assetSelection]
    : undefined;
  return unchanged(context, {
    projectId: context.bundle.project.projectId,
    projectName: context.bundle.project.metadata.name,
    projectKind: context.bundle.project.projectKind,
    sceneId: context.bundle.scene.sceneId,
    sceneName: context.bundle.scene.name,
    revision: context.revision,
    editorMode: context.editorMode,
    importBusy: context.importBusy,
    saveStatus: context.saveStatus,
    scriptRuntime: context.scriptRuntime ?? null,
    sceneSettings: {
      fog: sceneSettings.fog,
    },
    selectedEntity: selectedEntity
      ? { id: selectedEntity.id, name: selectedEntity.name }
      : null,
    selectedAsset: selectedAsset
      ? { id: selectedAsset.id, name: selectedAsset.name, kind: selectedAsset.kind }
      : null,
  }, "Editor contextを取得しました");
}

function listAssets(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const query = optionalString(argumentsValue.query)?.toLocaleLowerCase();
  const kind = optionalString(argumentsValue.kind);
  const assets = Object.values(context.bundle.assets.assets)
    .filter((asset) => !query || asset.name.toLocaleLowerCase().includes(query))
    .filter((asset) => !kind || asset.kind === kind)
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      status: asset.status,
      placeable: isScenePlaceableAsset(asset),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return unchanged(context, { assets, count: assets.length }, "Asset一覧を取得しました");
}

function createDocumentAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const kind = requiredEnum(
    argumentsValue.kind,
    "kind",
    ["material", "particle"] as const,
  );
  const folderId =
    argumentsValue.folderId === undefined
      ? null
      : requiredString(argumentsValue.folderId, "folderId");
  if (folderId && !context.bundle.assets.folders?.[folderId]) {
    throw new XriftMcpEditorToolError(
      "FOLDER_NOT_FOUND",
      "作成先のFolderが見つかりません",
      { folderId },
    );
  }
  const requestedName =
    argumentsValue.name === undefined
      ? undefined
      : requiredString(argumentsValue.name, "name");
  if (requestedName && requestedName.length > 100) {
    invalidArgument("name", "100文字以内の文字列");
  }
  const created = addDefaultDocumentAsset(context.bundle.assets, {
    kind,
    id: createDocumentId("asset"),
    folderId,
  });
  if (!created.added) {
    throw new XriftMcpEditorToolError(
      "ASSET_CREATE_FAILED",
      `${kind} Assetを作成できませんでした`,
      { kind, folderId },
    );
  }
  const assets = requestedName
    ? renameAsset(created.manifest, created.assetId, requestedName)
    : created.manifest;
  const asset = assets.assets[created.assetId];
  if (!asset) {
    throw new XriftMcpEditorToolError(
      "ASSET_CREATE_FAILED",
      "作成したAssetを取得できませんでした",
      { assetId: created.assetId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: asset.id,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      asset: JSON.parse(JSON.stringify(asset)) as Record<string, unknown>,
    },
    activity: `AIが「${asset.name}」を${kind} Assetとして作成しました`,
  };
}

function getParticleAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const particleAssetId = requiredString(
    argumentsValue.particleAssetId,
    "particleAssetId",
  );
  const asset = context.bundle.assets.assets[particleAssetId];
  if (!asset || asset.kind !== "particle") {
    throw new XriftMcpEditorToolError(
      "PARTICLE_ASSET_NOT_FOUND",
      "指定されたParticle Assetが見つかりません",
      { particleAssetId },
    );
  }
  return unchanged(
    context,
    {
      particleAsset: JSON.parse(JSON.stringify(asset)) as Record<
        string,
        unknown
      >,
    },
    `Particle Asset「${asset.name}」を取得しました`,
  );
}

function updateParticleAssetTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const particleAssetId = requiredString(
    argumentsValue.particleAssetId,
    "particleAssetId",
  );
  const current = context.bundle.assets.assets[particleAssetId];
  if (!current || current.kind !== "particle") {
    throw new XriftMcpEditorToolError(
      "PARTICLE_ASSET_NOT_FOUND",
      "指定されたParticle Assetが見つかりません",
      { particleAssetId },
    );
  }
  const patch = particlePatchValue(argumentsValue.patch);
  const renderer = patch.renderer;
  for (const [field, expectedKind] of [
    ["materialAssetId", "material"],
    ["textureAssetId", "texture"],
  ] as const) {
    const referencedAssetId = renderer?.[field];
    if (!referencedAssetId) continue;
    const referencedAsset = context.bundle.assets.assets[referencedAssetId];
    if (!referencedAsset) {
      throw new XriftMcpEditorToolError(
        "ASSET_NOT_FOUND",
        `patch.renderer.${field}に指定されたAssetが見つかりません`,
        { particleAssetId, referencedAssetId, field },
      );
    }
    if (referencedAsset.kind !== expectedKind) {
      throw new XriftMcpEditorToolError(
        "ASSET_KIND_MISMATCH",
        `patch.renderer.${field}には${expectedKind} Assetを指定してください`,
        {
          particleAssetId,
          referencedAssetId,
          expectedKind,
          actualKind: referencedAsset.kind,
        },
      );
    }
  }
  const assets = updateParticleAsset(
    context.bundle.assets,
    particleAssetId,
    patch,
  );
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        particleAssetId,
        properties: current.properties,
      },
      "Particle Assetはすでに指定された状態です",
    );
  }
  const asset = assets.assets[particleAssetId];
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: particleAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      particleAssetId,
      properties:
        asset?.kind === "particle"
          ? JSON.parse(JSON.stringify(asset.properties))
          : null,
    },
    activity: `AIがParticle Asset「${current.name}」を更新しました`,
  };
}

function updateSceneSettings(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const fogPatch = recordValue(argumentsValue.fog, "fog");
  const currentSettings = resolveSceneSettings(context.bundle.scene.settings);
  const fog = applyFogPatch(currentSettings.fog, fogPatch);
  if (sameFog(currentSettings.fog, fog)) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        fog,
      },
      "Fog設定はすでに指定された状態です",
    );
  }

  const bundle = touchProject(context, {
    ...context.bundle,
    scene: {
      ...context.bundle.scene,
      settings: { ...currentSettings, fog },
    },
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      fog,
    },
    activity: fog.enabled ? "AIがFogを更新しました" : "AIがFogを無効にしました",
  };
}

function placeAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const position = optionalVec3(argumentsValue.position, "position") ?? [0, 0, 0];
  const parentEntityId = optionalNullableString(
    argumentsValue.parentEntityId,
    "parentEntityId",
  );
  const placement = instantiateSceneAsset(
    context.bundle.scene,
    context.bundle.assets,
    context.bundle.prefabs,
    assetId,
    { position, parentEntityId },
  );
  if (!placement.placed) {
    throw new XriftMcpEditorToolError(
      placement.reason === "asset-missing" ? "ASSET_NOT_FOUND" : "ASSET_NOT_PLACEABLE",
      placementFailureMessage(placement.reason),
      { assetId, reason: placement.reason },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: placement.scene,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      assetId,
      assetName: placement.assetName,
      position,
      parentEntityId,
    },
    activity: `AIが「${placement.assetName}」をSceneへ配置しました`,
  };
}

function listEntities(context: XriftMcpEditorContext): XriftMcpEditorToolOutcome {
  const entities = Object.values(context.bundle.scene.entities)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      parentId: entity.parentId,
      children: entity.children,
      enabled: entity.enabled,
      components: entity.components,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return unchanged(context, { entities, count: entities.length }, "Entity一覧を取得しました");
}

function listComponentDefinitions(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const projectKind = context.bundle.project.projectKind;
  const definitions = EDITOR_COMPONENT_REGISTRY.map((definition) => ({
    id: definition.id,
    label: definition.label,
    category: definition.category,
    projectKinds: [...definition.projectKinds],
    supportedInProject: definition.projectKinds.includes(projectKind),
    allowMultiple: definition.allowMultiple,
    componentType: definition.componentType,
    schemaId: definition.schemaId ?? null,
    lightType: definition.lightType ?? null,
    requiredAssetKind:
      definition.componentType === "particle-emitter"
        ? "particle"
        : definition.componentType === "audio-source"
          ? "audio"
          : definition.componentType === "script"
            ? "script"
            : null,
  }));
  return unchanged(
    context,
    { projectKind, definitions, count: definitions.length },
    "Component定義一覧を取得しました",
  );
}

function getEntityComponents(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const entity = context.bundle.scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const components = entity.components.map((component) => ({
    definitionId: componentDefinitionId(component),
    ...JSON.parse(JSON.stringify(component)) as Record<string, unknown>,
  }));
  return unchanged(
    context,
    {
      entityId,
      entityName: entity.name,
      entityEnabled: entity.enabled,
      components,
      count: components.length,
    },
    `Entity「${entity.name}」のComponentを取得しました`,
  );
}

function createPrimitive(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const shape = requiredEnum(
    argumentsValue.shape,
    "shape",
    ["box", "sphere", "cylinder", "cone", "plane"] as const,
  );
  const position = optionalVec3(argumentsValue.position, "position");
  const requestedMaterialAssetId = optionalString(argumentsValue.materialAssetId);
  const materialAssetId =
    requestedMaterialAssetId ??
    Object.values(context.bundle.assets.assets).find((asset) => asset.kind === "material")?.id;
  if (!materialAssetId) {
    throw new XriftMcpEditorToolError(
      "NO_MATERIAL_AVAILABLE",
      "Projectに割り当てられるMaterialがありません",
    );
  }
  const placement = addBuiltinPrimitiveEntity(
    context.bundle.scene,
    context.bundle.assets,
    BUILTIN_PRIMITIVE_CREATION_IDS[shape],
    materialAssetId,
    position,
  );
  if (!placement) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "指定されたMaterialでPrimitiveを作成できません",
      { materialAssetId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: placement.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      shape,
      materialAssetId,
      position,
    },
    activity: `AIが${shape}を作成しました`,
  };
}

function placeBuiltinPrefab(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const recipeId = requiredString(argumentsValue.recipeId, "recipeId");
  const position = optionalVec3(argumentsValue.position, "position");
  const recipe = getBuiltinPrefabRecipe(recipeId);
  if (!recipe) {
    throw new XriftMcpEditorToolError(
      "RECIPE_NOT_FOUND",
      "指定されたPrefab recipeが見つかりません",
      { recipeId },
    );
  }
  const projectKind = context.bundle.project.projectKind;
  if (!recipe.projectKinds.includes(projectKind)) {
    throw new XriftMcpEditorToolError(
      "PROJECT_KIND_MISMATCH",
      `このPrefabは${projectKind} projectでは配置できません`,
      { recipeId, projectKind },
    );
  }
  const placement = instantiateBuiltinPrefab(
    context.bundle.scene,
    projectKind,
    recipeId,
    position,
  );
  if (!placement) {
    throw new XriftMcpEditorToolError(
      "PLACEMENT_FAILED",
      "Prefabを配置できませんでした",
      { recipeId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: placement.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      recipeId,
      recipeName: placement.recipe.name,
      position,
    },
    activity: `AIが「${placement.recipe.name}」をSceneへ配置しました`,
  };
}

function addComponent(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const definitionId = requiredString(argumentsValue.definitionId, "definitionId");
  const scriptAssetId = optionalString(argumentsValue.scriptAssetId);
  if (definitionId === "scripting.script") {
    const scriptAsset = scriptAssetId
      ? context.bundle.assets.assets[scriptAssetId]
      : Object.values(context.bundle.assets.assets).find(
          (asset) => asset.kind === "script",
        );
    if (scriptAsset?.kind === "script") {
      const contract = context.scriptContracts?.[scriptAsset.id];
      if (!contract?.complete) {
        throw new XriftMcpEditorToolError(
          "SCRIPT_CONTRACT_UNAVAILABLE",
          "Scriptのproperty契約を完全に読み取れません。sourceのdefineScript、props、default、enum optionsを静的リテラルで宣言してから再試行してください",
          {
            scriptAssetId: scriptAsset.id,
            issues: contract?.issues ?? [],
          },
        );
      }
    }
  }
  const result = addEditorComponent(
    context.bundle.scene,
    context.bundle.assets,
    entityId,
    definitionId,
    context.bundle.project.projectKind,
    scriptAssetId,
    context.scriptContracts,
  );
  if (!result.added) {
    throw new XriftMcpEditorToolError(
      addComponentFailureCode(result.reason),
      addComponentFailureMessage(result.reason),
      { entityId, definitionId, scriptAssetId, reason: result.reason },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: result.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection:
      definitionId === "scripting.script" && scriptAssetId
        ? scriptAssetId
        : null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      definitionId,
      scriptAssetId,
      componentId: result.componentId,
    },
    activity: `AIが${definitionId}をEntityへ追加しました`,
  };
}

function updateComponent(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const componentId = requiredString(argumentsValue.componentId, "componentId");
  const entity = context.bundle.scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const component = entity.components.find(
    (candidate) => candidate.id === componentId,
  );
  if (!component) {
    throw new XriftMcpEditorToolError(
      "COMPONENT_NOT_FOUND",
      "指定されたComponentが見つかりません",
      { entityId, componentId },
    );
  }
  const patch = componentPatchRecord(argumentsValue.patch);
  let scene: SceneDocument;
  let diagnostics: unknown[] = [];

  switch (component.type) {
    case "rigid-body":
      assertPatchKeys(
        patch,
        [
          "enabled",
          "bodyType",
          "autoColliders",
          "isTrigger",
          "friction",
          "restitution",
          "gravityScale",
          "linearDamping",
          "angularDamping",
          "canSleep",
          "ccd",
          "lockTranslations",
          "lockRotations",
        ],
        component.type,
      );
      scene = updateRigidBodyComponent(
        context.bundle.scene,
        entityId,
        patch as RigidBodyPatch,
        componentId,
      );
      break;
    case "collider":
      assertPatchKeys(
        patch,
        [
          "enabled",
          "isTrigger",
          "friction",
          "restitution",
          "center",
          "halfExtents",
          "fitMode",
          "meshMode",
          "bodyType",
          "gravityScale",
          "linearDamping",
          "angularDamping",
          "canSleep",
          "ccd",
          "lockTranslations",
          "lockRotations",
        ],
        component.type,
      );
      scene = updateColliderComponent(
        context.bundle.scene,
        entityId,
        patch as ColliderPatch,
        componentId,
      );
      break;
    case "light":
      assertPatchKeys(
        patch,
        [
          "enabled",
          "lightType",
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
        component.type,
      );
      scene = updateLightComponent(
        context.bundle.scene,
        entityId,
        patch as LightPatch,
        componentId,
      );
      break;
    case "text":
      assertPatchKeys(
        patch,
        [
          "enabled",
          "text",
          "color",
          "fontSize",
          "maxWidth",
          "anchorX",
          "anchorY",
          "outlineWidth",
          "outlineColor",
        ],
        component.type,
      );
      scene = updateTextComponent(
        context.bundle.scene,
        entityId,
        patch as TextPatch,
        componentId,
      );
      break;
    case "audio-source": {
      assertPatchKeys(
        patch,
        [
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
        component.type,
      );
      const audioAssetId = patch.audioAssetId;
      if (audioAssetId !== undefined) {
        if (typeof audioAssetId !== "string") {
          invalidArgument("patch.audioAssetId", "string");
        }
        const audioAsset = audioAssetId
          ? context.bundle.assets.assets[audioAssetId]
          : undefined;
        if (audioAssetId && audioAsset?.kind !== "audio") {
          throw new XriftMcpEditorToolError(
            audioAsset
              ? "ASSET_KIND_MISMATCH"
              : "ASSET_NOT_FOUND",
            "patch.audioAssetIdには存在するAudio Assetを指定してください",
            { audioAssetId, actualKind: audioAsset?.kind },
          );
        }
      }
      scene = updateAudioSourceComponent(
        context.bundle.scene,
        entityId,
        patch as AudioSourcePatch,
        componentId,
      );
      break;
    }
    case "animation":
      assertPatchKeys(patch, ["enabled", "autoplay", "loop"], component.type);
      scene = updateAnimationComponent(
        context.bundle.scene,
        entityId,
        patch as AnimationPatch,
        componentId,
      );
      break;
    case "particle-emitter": {
      assertPatchKeys(
        patch,
        ["enabled", "particleAssetId"],
        component.type,
      );
      const enabled = optionalBoolean(patch.enabled, "patch.enabled");
      const particleAssetId =
        patch.particleAssetId === undefined
          ? undefined
          : requiredString(patch.particleAssetId, "patch.particleAssetId");
      if (
        particleAssetId &&
        context.bundle.assets.assets[particleAssetId]?.kind !== "particle"
      ) {
        throw new XriftMcpEditorToolError(
          context.bundle.assets.assets[particleAssetId]
            ? "ASSET_KIND_MISMATCH"
            : "ASSET_NOT_FOUND",
          "patch.particleAssetIdには存在するParticle Assetを指定してください",
          { particleAssetId },
        );
      }
      const next = {
        ...component,
        ...(enabled !== undefined ? { enabled } : {}),
        ...(particleAssetId !== undefined ? { particleAssetId } : {}),
      };
      scene =
        next.enabled === component.enabled &&
        next.particleAssetId === component.particleAssetId
          ? context.bundle.scene
          : replaceSceneComponent(
              context.bundle.scene,
              entityId,
              componentId,
              next,
            );
      break;
    }
    case "xrift-component": {
      assertPatchKeys(
        patch,
        ["enabled", "properties", "assetReferences", "entityReferences"],
        component.type,
      );
      const enabled = optionalBoolean(patch.enabled, "patch.enabled");
      const properties =
        patch.properties === undefined
          ? undefined
          : recordValue(patch.properties, "patch.properties");
      if (properties && !isJsonValue(properties)) {
        invalidArgument("patch.properties", "finite JSON object");
      }
      const assetReferences = optionalUniqueStringArray(
        patch.assetReferences,
        "patch.assetReferences",
      );
      const entityReferences = optionalUniqueStringArray(
        patch.entityReferences,
        "patch.entityReferences",
      );
      for (const assetId of assetReferences ?? []) {
        if (!context.bundle.assets.assets[assetId]) {
          throw new XriftMcpEditorToolError(
            "ASSET_NOT_FOUND",
            "patch.assetReferencesに指定されたAssetが見つかりません",
            { assetId },
          );
        }
      }
      for (const referencedEntityId of entityReferences ?? []) {
        if (!context.bundle.scene.entities[referencedEntityId]) {
          throw new XriftMcpEditorToolError(
            "ENTITY_NOT_FOUND",
            "patch.entityReferencesに指定されたEntityが見つかりません",
            { entityId: referencedEntityId },
          );
        }
      }
      const xriftPatch: UpdateXriftComponentPatch = {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(properties ? { properties } : {}),
        ...(assetReferences ? { assetReferences } : {}),
        ...(entityReferences ? { entityReferences } : {}),
      };
      const result = updateXriftComponent(
        context.bundle.scene,
        entityId,
        componentId,
        xriftPatch,
        context.bundle.project.projectKind,
      );
      if (!result.changed) {
        throw new XriftMcpEditorToolError(
          "COMPONENT_UPDATE_REJECTED",
          result.diagnostics[0]?.message ??
            "XRift Componentを更新できませんでした",
          {
            entityId,
            componentId,
            diagnostics: result.diagnostics,
          },
        );
      }
      scene = result.scene;
      diagnostics = result.diagnostics;
      break;
    }
    case "script":
      assertPatchKeys(patch, ["enabled"], component.type, {
        guidance:
          "Scriptのproperties、assetReferences、entityReferencesはupdate_script_componentを使用してください",
      });
      scene = updateSceneComponentEnabled(
        context.bundle.scene,
        entityId,
        componentId,
        requiredPatchEnabled(patch),
      );
      break;
    case "transform":
      assertPatchKeys(patch, ["enabled"], component.type, {
        guidance:
          "Transform値はupdate_transformを使用してください",
      });
      scene = updateSceneComponentEnabled(
        context.bundle.scene,
        entityId,
        componentId,
        requiredPatchEnabled(patch),
      );
      break;
    case "mesh":
    case "spawn-point":
    case "prefab-instance":
      assertPatchKeys(patch, ["enabled"], component.type);
      scene = updateSceneComponentEnabled(
        context.bundle.scene,
        entityId,
        componentId,
        requiredPatchEnabled(patch),
      );
      break;
  }

  if (scene === context.bundle.scene) {
    if (!patchMatchesComponent(component, patch)) {
      throw new XriftMcpEditorToolError(
        "INVALID_COMPONENT_PATCH",
        `${component.type} Componentへpatchを適用できませんでした`,
        { entityId, componentId, componentType: component.type, patch },
      );
    }
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
        componentId,
        component: JSON.parse(JSON.stringify(component)) as Record<
          string,
          unknown
        >,
      },
      "Componentはすでに指定された状態です",
    );
  }
  const updated = scene.entities[entityId]?.components.find(
    (candidate) => candidate.id === componentId,
  );
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      componentId,
      component: updated
        ? JSON.parse(JSON.stringify(updated)) as Record<string, unknown>
        : null,
      diagnostics,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIが「${entity.name}」の${component.type} Componentを更新しました`,
  };
}

function removeComponent(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const componentId = requiredString(argumentsValue.componentId, "componentId");
  const entity = context.bundle.scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const component = entity.components.find(
    (candidate) => candidate.id === componentId,
  );
  if (!component) {
    throw new XriftMcpEditorToolError(
      "COMPONENT_NOT_FOUND",
      "指定されたComponentが見つかりません",
      { entityId, componentId },
    );
  }
  if (component.type === "transform") {
    throw new XriftMcpEditorToolError(
      "TRANSFORM_COMPONENT_REQUIRED",
      "Transform ComponentはEntityに必須のため削除できません",
      { entityId, componentId },
    );
  }
  let scene: SceneDocument;
  if (component.type === "xrift-component") {
    const result = removeXriftComponent(
      context.bundle.scene,
      entityId,
      componentId,
    );
    if (!result.changed) {
      throw new XriftMcpEditorToolError(
        "COMPONENT_REMOVE_REJECTED",
        result.diagnostics[0]?.message ?? "XRift Componentを削除できません",
        { entityId, componentId, diagnostics: result.diagnostics },
      );
    }
    scene = result.scene;
  } else {
    scene = {
      ...context.bundle.scene,
      entities: {
        ...context.bundle.scene.entities,
        [entityId]: {
          ...entity,
          components: entity.components.filter(
            (candidate) => candidate.id !== componentId,
          ),
        },
      },
    };
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      componentId,
      componentType: component.type,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIが「${entity.name}」から${component.type} Componentを削除しました`,
  };
}

function setEntityEnabled(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const enabled = optionalBoolean(argumentsValue.enabled, "enabled");
  if (enabled === undefined) invalidArgument("enabled", "boolean");
  const entity = context.bundle.scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const scene = updateEntityEnabled(context.bundle.scene, entityId, enabled);
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
        enabled,
      },
      "Entityはすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      enabled,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIが「${entity.name}」を${enabled ? "有効" : "無効"}にしました`,
  };
}

function updateScriptComponent(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const componentId = requiredString(
    argumentsValue.componentId,
    "componentId",
  );
  const properties =
    argumentsValue.properties === undefined
      ? {}
      : recordValue(argumentsValue.properties, "properties");
  if (!isJsonValue(properties)) {
    invalidArgument("properties", "finite JSON object");
  }
  const assetReferences = optionalUniqueStringArray(
    argumentsValue.assetReferences,
    "assetReferences",
  );
  const entityReferences = optionalUniqueStringArray(
    argumentsValue.entityReferences,
    "entityReferences",
  );
  if (
    argumentsValue.properties === undefined &&
    assetReferences === undefined &&
    entityReferences === undefined
  ) {
    invalidArgument(
      "properties, assetReferences, entityReferences",
      "at least one update",
    );
  }
  const entity = context.bundle.scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const targetComponent = entity.components.find(
    (component) =>
      component.id === componentId && component.type === "script",
  );
  if (!targetComponent || targetComponent.type !== "script") {
    throw new XriftMcpEditorToolError(
      "SCRIPT_COMPONENT_NOT_FOUND",
      "指定されたScript Componentが見つかりません",
      { entityId, componentId },
    );
  }
  for (const assetId of assetReferences ?? []) {
    if (!context.bundle.assets.assets[assetId]) {
      throw new XriftMcpEditorToolError(
        "ASSET_NOT_FOUND",
        "assetReferencesに指定されたAssetが見つかりません",
        { assetId },
      );
    }
  }
  for (const referencedEntityId of entityReferences ?? []) {
    if (!context.bundle.scene.entities[referencedEntityId]) {
      throw new XriftMcpEditorToolError(
        "ENTITY_NOT_FOUND",
        "entityReferencesに指定されたEntityが見つかりません",
        { entityId: referencedEntityId },
      );
    }
  }
  const contract = context.scriptContracts?.[targetComponent.scriptAssetId];
  if (argumentsValue.properties !== undefined && !contract?.complete) {
    throw new XriftMcpEditorToolError(
      "SCRIPT_CONTRACT_UNAVAILABLE",
      "Scriptのproperty契約を完全に読み取れないためpropertiesを更新できません。sourceの静的宣言を修正してから再試行してください",
      {
        scriptAssetId: targetComponent.scriptAssetId,
        issues: contract?.issues ?? [],
      },
    );
  }
  if (contract && argumentsValue.properties !== undefined) {
    validateScriptPropertyPatch({
      contract,
      properties,
      component: targetComponent,
      assets: context.bundle.assets.assets,
      scene: context.bundle.scene,
      assetReferences,
      entityReferences,
    });
  }
  let found = false;
  let referencesChanged = false;
  const components = entity.components.map((component) => {
    if (component.id !== componentId || component.type !== "script") {
      return component;
    }
    found = true;
    referencesChanged =
      (assetReferences !== undefined &&
        !sameStringSet(component.assetReferences, assetReferences)) ||
      (entityReferences !== undefined &&
        !sameStringSet(component.entityReferences, entityReferences));
    return {
      ...component,
      properties: {
        ...component.properties,
        ...(properties as typeof component.properties),
      },
      ...(assetReferences !== undefined
        ? { assetReferences: [...assetReferences] }
        : {}),
      ...(entityReferences !== undefined
        ? { entityReferences: [...entityReferences] }
        : {}),
    };
  });
  if (!found) throw new Error("validated Script Component disappeared");
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: {
      ...context.bundle.scene,
      entities: {
        ...context.bundle.scene.entities,
        [entityId]: { ...entity, components },
      },
    },
  });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      componentId,
      properties,
      assetReferences,
      entityReferences,
      restartedDuringPlay:
        context.editorMode === "play" && referencesChanged,
      appliedOnNextFrame:
        context.editorMode === "play" && !referencesChanged,
    },
    activity:
      context.editorMode === "play"
        ? referencesChanged
          ? `AIがScript参照を更新し「${entity.name}」だけ再起動しました`
          : `AIが「${entity.name}」のScript propertyを次のフレームへ反映しました`
        : `AIが「${entity.name}」のScript propertyを更新しました`,
  };
}

function updateTransform(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  requireEntity(context.bundle.scene, entityId);
  const position = optionalVec3(argumentsValue.position, "position");
  const rotation = optionalVec3(argumentsValue.rotation, "rotation");
  const scale = optionalVec3(argumentsValue.scale, "scale");
  const componentId = optionalString(argumentsValue.componentId);
  if (!position && !rotation && !scale) {
    invalidArgument("position, rotation, scale", "少なくとも1つ");
  }
  const scene = updateEntityTransform(
    context.bundle.scene,
    entityId,
    { position, rotation, scale },
    componentId,
  );
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
      },
      "Transformはすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      position,
      rotation,
      scale,
    },
    activity: "AIがTransformを更新しました",
  };
}

function setMaterial(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const materialAssetId = requiredString(argumentsValue.materialAssetId, "materialAssetId");
  const slot = optionalString(argumentsValue.slot);
  const meshComponentId = optionalString(argumentsValue.meshComponentId);
  const outcome = slot
    ? assignMaterialToMeshSlots(
        context.bundle.scene,
        context.bundle.assets,
        entityId,
        materialAssetId,
        [slot],
        meshComponentId,
      )
    : assignMaterialToPrimaryMeshSlot(
        context.bundle.scene,
        context.bundle.assets,
        entityId,
        materialAssetId,
        meshComponentId,
      );
  if (!outcome.applied) {
    if (outcome.reason === "unchanged") {
      return unchanged(
        context,
        {
          projectId: context.bundle.project.projectId,
          sceneId: context.bundle.scene.sceneId,
          revision: context.revision,
          entityId,
          materialAssetId,
        },
        "Materialはすでに指定された状態です",
      );
    }
    throw new XriftMcpEditorToolError(
      setMaterialFailureCode(outcome.reason),
      setMaterialFailureMessage(outcome.reason),
      { entityId, materialAssetId, slot, reason: outcome.reason },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: outcome.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      materialAssetId,
      slots: "slots" in outcome ? outcome.slots : [outcome.slot],
    },
    activity: "AIがMaterialを割り当てました",
  };
}

function getMaterial(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const materialAssetId = requiredString(
    argumentsValue.materialAssetId,
    "materialAssetId",
  );
  const material = getMaterialAsset(context.bundle.assets, materialAssetId);
  if (!material) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_NOT_FOUND",
      "指定されたMaterial Assetが見つかりません",
      { materialAssetId },
    );
  }
  return unchanged(
    context,
    { material: JSON.parse(JSON.stringify(material)) as Record<string, unknown> },
    `Material「${material.name}」を取得しました`,
  );
}

function updateMaterial(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const materialAssetId = requiredString(
    argumentsValue.materialAssetId,
    "materialAssetId",
  );
  const material = getMaterialAsset(context.bundle.assets, materialAssetId);
  if (!material) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_NOT_FOUND",
      "指定されたMaterial Assetが見つかりません",
      { materialAssetId },
    );
  }
  const patch = materialPatchValue(argumentsValue.patch);
  const assets = updateMaterialAsset(context.bundle.assets, materialAssetId, patch);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      { materialAssetId, revision: context.revision },
      "Materialはすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: materialAssetId,
    result: {
      materialAssetId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      properties: getMaterialAsset(assets, materialAssetId)?.properties,
    },
    activity: `AIがMaterial「${material.name}」を更新しました`,
  };
}

type CoreMaterialTextureSlot =
  | "baseColor"
  | "metallicRoughness"
  | "normal"
  | "occlusion"
  | "emissive";

function setMaterialTextureTransform(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const materialAssetId = requiredString(
    argumentsValue.materialAssetId,
    "materialAssetId",
  );
  const slot = requiredEnum(
    argumentsValue.slot,
    "slot",
    ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"] as const,
  );
  const material = getMaterialAsset(context.bundle.assets, materialAssetId);
  if (!material) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_NOT_FOUND",
      "指定されたMaterial Assetが見つかりません",
      { materialAssetId },
    );
  }
  const current = coreMaterialTextureInfo(material.properties, slot);
  if (!current) {
    throw new XriftMcpEditorToolError(
      "TEXTURE_SLOT_EMPTY",
      "指定されたMaterial texture slotにTextureがありません",
      { materialAssetId, slot },
    );
  }
  const reset = optionalBoolean(argumentsValue.reset, "reset") ?? false;
  const offset = optionalNumberTuple(argumentsValue.offset, "offset", 2);
  const scale = optionalNumberTuple(argumentsValue.scale, "scale", 2);
  const rotationDegrees = optionalFiniteNumber(
    argumentsValue.rotationDegrees,
    "rotationDegrees",
  );
  const texCoord = optionalNonNegativeInteger(argumentsValue.texCoord, "texCoord");
  if (!reset && !offset && !scale && rotationDegrees === undefined && texCoord === undefined) {
    invalidArgument(
      "texture transform",
      "offset, scale, rotationDegrees, texCoord, resetのいずれか",
    );
  }
  const next = {
    ...current,
    ...(texCoord === undefined ? {} : { texCoord }),
    transform: reset
      ? null
      : {
          offset: offset ?? current.transform?.offset ?? [0, 0],
          rotation:
            rotationDegrees === undefined
              ? current.transform?.rotation ?? 0
              : (rotationDegrees * Math.PI) / 180,
          scale: scale ?? current.transform?.scale ?? [1, 1],
        },
  };
  const patch = coreMaterialTexturePatch(slot, next);
  const assets = updateMaterialAsset(context.bundle.assets, materialAssetId, patch);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      { materialAssetId, slot, revision: context.revision },
      "Texture transformはすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: materialAssetId,
    result: {
      materialAssetId,
      slot,
      texture: coreMaterialTextureInfo(
        getMaterialAsset(assets, materialAssetId)!.properties,
        slot,
      ),
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがMaterial「${material.name}」のタイリングを更新しました`,
  };
}

function coreMaterialTextureInfo(
  properties: MaterialProperties,
  slot: CoreMaterialTextureSlot,
): MaterialTextureInfo | undefined {
  if (slot === "baseColor") return properties.pbrMetallicRoughness.baseColorTexture;
  if (slot === "metallicRoughness") {
    return properties.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  if (slot === "normal") return properties.normalTexture;
  if (slot === "occlusion") return properties.occlusionTexture;
  return properties.emissiveTexture;
}

function coreMaterialTexturePatch(
  slot: CoreMaterialTextureSlot,
  value: MaterialTextureInfoPatch,
): MaterialAssetPatch {
  if (slot === "baseColor") {
    return { pbrMetallicRoughness: { baseColorTexture: value } };
  }
  if (slot === "metallicRoughness") {
    return { pbrMetallicRoughness: { metallicRoughnessTexture: value } };
  }
  if (slot === "normal") return { normalTexture: value };
  if (slot === "occlusion") return { occlusionTexture: value };
  return { emissiveTexture: value };
}

function renameEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const name = requiredString(argumentsValue.name, "name");
  requireEntity(context.bundle.scene, entityId);
  const scene = renameEntityInScene(context.bundle.scene, entityId, name);
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
        name,
      },
      "Entity名はすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      name,
    },
    activity: `AIがEntityを「${name}」に改名しました`,
  };
}

function duplicateEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const parentEntityId = optionalNullableString(argumentsValue.parentEntityId, "parentEntityId");
  const position = optionalVec3(argumentsValue.position, "position");
  requireEntity(context.bundle.scene, entityId);
  if (parentEntityId !== null) {
    requireEntity(context.bundle.scene, parentEntityId);
  }
  const duplication = duplicateEntityHierarchy(
    context.bundle.scene,
    [entityId],
    (kind) => createDocumentId(kind),
    parentEntityId,
  );
  if (!duplication) {
    throw new XriftMcpEditorToolError(
      "DUPLICATE_FAILED",
      "Entityを複製できませんでした",
      { entityId, parentEntityId },
    );
  }
  const newEntityId = duplication.clone.rootEntityIds[0];
  const scene = position
    ? updateEntityTransform(duplication.scene, newEntityId, { position })
    : duplication.scene;
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: newEntityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      sourceEntityId: entityId,
      entityId: newEntityId,
      parentEntityId,
      position,
    },
    activity: "AIがEntityを複製しました",
  };
}

function reparentEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const parentEntityId = optionalNullableString(
    argumentsValue.parentEntityId,
    "parentEntityId",
  );
  const siblingIndex = optionalNonNegativeInteger(
    argumentsValue.siblingIndex,
    "siblingIndex",
  );
  const decision = getEntityReparentDecision(
    context.bundle.scene,
    entityId,
    parentEntityId,
    siblingIndex,
  );
  if (!decision.allowed) {
    throw new XriftMcpEditorToolError(
      "REPARENT_REJECTED",
      "指定された場所へEntityを移動できません",
      { entityId, parentEntityId, siblingIndex, reason: decision.reason },
    );
  }
  const scene = reparentEntityHierarchy(
    context.bundle.scene,
    entityId,
    parentEntityId,
    siblingIndex,
  );
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      parentEntityId,
      siblingIndex,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity:
      context.editorMode === "play"
        ? "AIがHierarchyを変更し実行中のSceneへ同期しました"
        : "AIがHierarchyを変更しました",
  };
}

function deleteEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const scene = deleteEntityHierarchy(context.bundle.scene, [entityId]);
  if (scene === context.bundle.scene) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const wasSelected = context.sceneSelection?.id === entityId;
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: wasSelected ? null : context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
    },
    activity: "AIがEntityを削除しました",
  };
}

function createEmptyEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const name = optionalString(argumentsValue.name) ?? "Empty Entity";
  const parentEntityId = optionalNullableString(argumentsValue.parentEntityId, "parentEntityId");
  if (parentEntityId !== null) {
    requireEntity(context.bundle.scene, parentEntityId);
  }
  const created = createEmptySceneEntity(context.bundle.scene, parentEntityId, name);
  if (!created) {
    throw new XriftMcpEditorToolError(
      "PARENT_NOT_FOUND",
      "指定された親Entityが見つかりません",
      { parentEntityId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: created.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: created.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: created.entityId,
      name,
      parentEntityId,
    },
    activity: "AIが空のEntityを作成しました",
  };
}

function listInteractivityOperations(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  return unchanged(
    context,
    {
      extension: "KHR_interactivity",
      status: "release-candidate-2026-07-16",
      operations: KHR_INTERACTIVITY_OPERATION_TEMPLATES.map((template) => ({
        op: template.op,
        label: template.label,
        category: template.category,
        flowInputs: template.flowInputs,
        flowOutputs: template.flowOutputs,
        valueInputs: template.valueInputs,
        valueOutputs: template.valueOutputs,
      })),
    },
    "KHR_interactivity operation一覧を取得しました",
  );
}

function getInteractivityAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  return unchanged(
    context,
    {
      assetId: asset.id,
      name: asset.name,
      extensionName: asset.extensionName,
      specStatus: asset.specStatus,
      extension: cloneKhrInteractivityExtension(asset.extension),
      diagnostics: validateKhrInteractivityExtension(asset.extension),
    },
    `Interactivity Asset「${asset.name}」を取得しました`,
  );
}

function createInteractivityAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const name = optionalString(argumentsValue.name) ?? "Interactivity Graph";
  const folderId = optionalNullableString(argumentsValue.folderId, "folderId");
  const template = requiredEnum(
    argumentsValue.template ?? "animation-on-start",
    "template",
    ["animation-on-start", "empty"] as const,
  );
  if (folderId && !context.bundle.assets.folders?.[folderId]) {
    throw new XriftMcpEditorToolError("FOLDER_NOT_FOUND", "指定されたAsset Folderが見つかりません", {
      folderId,
    });
  }
  const assetId = createDocumentId("interactivity");
  const added = addDefaultInteractivityAsset(context.bundle.assets, {
    id: assetId,
    name,
    folderId,
  });
  if (!added.added) {
    throw new XriftMcpEditorToolError("ASSET_NOT_CREATED", "Interactivity Assetを作成できませんでした");
  }
  let assets = added.manifest;
  if (template === "empty") {
    const asset = assets.assets[assetId] as InteractivityAsset;
    assets = {
      ...assets,
      assets: {
        ...assets.assets,
        [assetId]: {
          ...asset,
          extension: { graph: 0, graphs: [{ name: "Behavior Graph" }] },
        },
      },
    };
  }
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: assetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      assetId,
      name,
      template,
      extension: (assets.assets[assetId] as InteractivityAsset).extension,
    },
    activity: `AIがInteractivity Asset「${name}」を作成しました`,
  };
}

function addInteractivityNode(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const op = requiredString(argumentsValue.op, "op");
  const definingExtension = optionalString(argumentsValue.extension);
  const position = optionalVec2(argumentsValue.position, "position");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const template = getInteractivityOperationTemplate(op);
  graph.declarations ??= [];
  graph.nodes ??= [];
  let declaration = graph.declarations.findIndex(
    (candidate) => candidate.op === op && candidate.extension === definingExtension,
  );
  if (declaration < 0) {
    graph.declarations.push({ op, ...(definingExtension ? { extension: definingExtension } : {}) });
    declaration = graph.declarations.length - 1;
  }
  const types = ensureMcpGraphTypes(graph);
  let node = {
    declaration,
    ...(template?.createNode?.(types) ?? {}),
  };
  node = writeInteractivityNodePosition(
    node,
    position ?? {
      x: 120 + (graph.nodes.length % 3) * 280,
      y: 120 + Math.floor(graph.nodes.length / 3) * 200,
    },
  );
  graph.nodes.push(node);
  const nodeIndex = graph.nodes.length - 1;
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      nodeIndex,
      declaration,
      op,
    },
    `AIが${op} nodeを追加しました`,
  );
}

function connectInteractivityNodes(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const kind = requiredEnum(argumentsValue.kind, "kind", ["flow", "value"] as const);
  const sourceNode = requiredInteger(argumentsValue.sourceNode, "sourceNode");
  const targetNode = requiredInteger(argumentsValue.targetNode, "targetNode");
  const sourceSocket = requiredString(argumentsValue.sourceSocket, "sourceSocket");
  const targetSocket = requiredString(argumentsValue.targetSocket, "targetSocket");
  if (sourceNode === targetNode) invalidArgument("targetNode", "a different node index");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const source = graph.nodes?.[sourceNode];
  const target = graph.nodes?.[targetNode];
  if (!source || !target) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "接続元または接続先nodeが見つかりません", {
      sourceNode,
      targetNode,
    });
  }
  if (kind === "flow") {
    source.flows = {
      ...(source.flows ?? {}),
      [sourceSocket]: {
        node: targetNode,
        ...(targetSocket === "in" ? {} : { socket: targetSocket }),
      },
    };
  } else {
    target.values = {
      ...(target.values ?? {}),
      [targetSocket]: {
        node: sourceNode,
        ...(sourceSocket === "value" ? {} : { socket: sourceSocket }),
      },
    };
  }
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, kind, sourceNode, sourceSocket, targetNode, targetSocket },
    `AIがInteractivity ${kind} socketを接続しました`,
  );
}

function setInteractivityValue(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const nodeIndex = requiredInteger(argumentsValue.nodeIndex, "nodeIndex");
  const socket = requiredString(argumentsValue.socket, "socket");
  const signature = requiredString(argumentsValue.signature, "signature");
  const value = argumentsValue.value;
  if (!Array.isArray(value) || value.length === 0 || !isJsonValue(value)) {
    invalidArgument("value", "a non-empty JSON array matching the type signature");
  }
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const node = graph.nodes?.[nodeIndex];
  if (!node) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  graph.types ??= [];
  let type = graph.types.findIndex((candidate) => candidate.signature === signature);
  if (type < 0) {
    graph.types.push({ signature });
    type = graph.types.length - 1;
  }
  node.values = {
    ...(node.values ?? {}),
    [socket]: { type, value: value as KhrInteractivityJsonValue[] },
  };
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, nodeIndex, socket, signature, value },
    `AIが${socket}のinline valueを設定しました`,
  );
}

function setInteractivityConfiguration(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const nodeIndex = requiredInteger(argumentsValue.nodeIndex, "nodeIndex");
  const key = requiredString(argumentsValue.key, "key");
  const value = argumentsValue.value;
  if (!Array.isArray(value) || value.length === 0 || !isJsonValue(value)) {
    invalidArgument("value", "a non-empty JSON array");
  }
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const node = graph.nodes?.[nodeIndex];
  if (!node) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  node.configuration = {
    ...(node.configuration ?? {}),
    [key]: { value: value as KhrInteractivityJsonValue[] },
  };
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, nodeIndex, key, value },
    `AIが${key} configurationを設定しました`,
  );
}

function configureInteractivityMaterial(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex =
    optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ??
    asset.extension.graph ??
    0;
  const nodeIndex = requiredInteger(argumentsValue.nodeIndex, "nodeIndex");
  const materialAssetId = requiredString(
    argumentsValue.materialAssetId,
    "materialAssetId",
  );
  const presetId = requiredString(argumentsValue.presetId, "presetId");
  const preset = KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_POINTER_PRESET_NOT_FOUND",
      "指定されたMaterial pointer presetが見つかりません",
      {
        presetId,
        supportedPresetIds: KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.map(
          (candidate) => candidate.id,
        ),
      },
    );
  }
  const materials = Object.values(context.bundle.assets.assets)
    .filter((candidate) => candidate.kind === "material")
    .sort((left, right) => left.id.localeCompare(right.id));
  const materialIndex = materials.findIndex(
    (candidate) => candidate.id === materialAssetId,
  );
  if (materialIndex < 0) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_NOT_FOUND",
      "指定されたMaterial Assetが見つかりません",
      { materialAssetId },
    );
  }
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  if (
    !configureInteractivityMaterialPointer(
      graph,
      nodeIndex,
      preset.id,
      materialIndex,
    )
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_POINTER_NODE",
      "指定されたnodeはMaterialを設定できるpointer operationではありません",
      { nodeIndex, graphIndex },
    );
  }
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      nodeIndex,
      materialAssetId,
      materialIndex,
      preset,
    },
    `AIがInteractivity nodeのMaterial targetを「${preset.label}」に設定しました`,
  );
}

function disconnectInteractivitySocket(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const kind = requiredEnum(argumentsValue.kind, "kind", ["flow", "value"] as const);
  const nodeIndex = requiredInteger(argumentsValue.nodeIndex, "nodeIndex");
  const socket = requiredString(argumentsValue.socket, "socket");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const node = graph.nodes?.[nodeIndex];
  if (!node) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  const sockets = kind === "flow" ? node.flows : node.values;
  if (!sockets?.[socket]) {
    throw new XriftMcpEditorToolError("SOCKET_NOT_CONNECTED", "指定されたsocketに接続はありません", {
      nodeIndex,
      socket,
      kind,
    });
  }
  delete sockets[socket];
  if (Object.keys(sockets).length === 0) {
    if (kind === "flow") delete node.flows;
    else delete node.values;
  }
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, nodeIndex, socket, kind },
    `AIがInteractivity ${kind} socketの接続を解除しました`,
  );
}

function deleteInteractivityNode(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ?? asset.extension.graph ?? 0;
  const nodeIndex = requiredInteger(argumentsValue.nodeIndex, "nodeIndex");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  if (!graph.nodes?.[nodeIndex]) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  graph.nodes = graph.nodes.filter((_, index) => index !== nodeIndex);
  for (const node of graph.nodes) {
    if (node.flows) {
      node.flows = Object.fromEntries(
        Object.entries(node.flows)
          .filter(([, target]) => target.node !== nodeIndex)
          .map(([socket, target]) => [
            socket,
            { ...target, node: target.node > nodeIndex ? target.node - 1 : target.node },
          ]),
      );
      if (Object.keys(node.flows).length === 0) delete node.flows;
    }
    if (node.values) {
      node.values = Object.fromEntries(
        Object.entries(node.values)
          .filter(([, input]) => input.node !== nodeIndex)
          .map(([socket, input]) => [
            socket,
            input.node !== undefined && input.node > nodeIndex
              ? { ...input, node: input.node - 1 }
              : input,
          ]),
      );
      if (Object.keys(node.values).length === 0) delete node.values;
    }
  }
  if (graph.nodes.length === 0) delete graph.nodes;
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, deletedNodeIndex: nodeIndex },
    "AIがInteractivity nodeを削除しました",
  );
}

function validateInteractivityAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const diagnostics = validateKhrInteractivityExtension(asset.extension);
  return unchanged(
    context,
    {
      assetId: asset.id,
      valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      diagnostics,
      graphCount: asset.extension.graphs.length,
      nodeCount: asset.extension.graphs.reduce(
        (count, graph) => count + (graph.nodes?.length ?? 0),
        0,
      ),
    },
    diagnostics.length === 0
      ? "KHR_interactivity validationに成功しました"
      : "KHR_interactivity diagnosticsを取得しました",
  );
}

function commitInteractivityMutation(
  context: XriftMcpEditorContext,
  asset: InteractivityAsset,
  extension: InteractivityAsset["extension"],
  result: Record<string, unknown>,
  activity: string,
): XriftMcpEditorToolOutcome {
  const diagnostics = validateKhrInteractivityExtension(extension);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new XriftMcpEditorToolError(
      "INTERACTIVITY_VALIDATION_FAILED",
      "変更するとKHR_interactivity graphが不正になるため適用しませんでした",
      { diagnostics: errors },
    );
  }
  const assets = {
    ...context.bundle.assets,
    assets: {
      ...context.bundle.assets.assets,
      [asset.id]: { ...asset, extension },
    },
  };
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: asset.id,
    result: {
      ...result,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      diagnostics,
    },
    activity,
  };
}

function requireInteractivityAsset(
  context: XriftMcpEditorContext,
  assetId: string,
): InteractivityAsset {
  const asset = context.bundle.assets.assets[assetId];
  if (asset?.kind !== "interactivity") {
    throw new XriftMcpEditorToolError(
      asset ? "ASSET_KIND_MISMATCH" : "ASSET_NOT_FOUND",
      asset ? "指定されたAssetはInteractivity Graphではありません" : "指定されたAssetが見つかりません",
      { assetId },
    );
  }
  return asset;
}

function requireInteractivityGraph(
  graphs: KhrInteractivityGraph[],
  graphIndex: number,
): KhrInteractivityGraph {
  const graph = graphs[graphIndex];
  if (!graph) {
    throw new XriftMcpEditorToolError("GRAPH_NOT_FOUND", "指定されたbehavior graphが見つかりません", {
      graphIndex,
    });
  }
  return graph;
}

function ensureMcpGraphTypes(graph: KhrInteractivityGraph): Record<string, number> {
  graph.types ??= [];
  const ensure = (signature: string) => {
    const index = graph.types!.findIndex((type) => type.signature === signature);
    if (index >= 0) return index;
    graph.types!.push({ signature });
    return graph.types!.length - 1;
  };
  return { float: ensure("float"), int: ensure("int"), bool: ensure("bool") };
}

function isJsonValue(value: unknown): value is KhrInteractivityJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (value && typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function assertWritableContext(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
  options: { allowPlay?: boolean } = {},
): void {
  if (context.editorMode !== "edit" && !options.allowPlay) {
    throw new XriftMcpEditorToolError(
      "EDITOR_READ_ONLY",
      "Playを停止してからAI編集を実行してください",
    );
  }
  if (context.importBusy) {
    throw new XriftMcpEditorToolError(
      "EDITOR_BUSY",
      "Asset Importの完了後にAI編集を再試行してください",
    );
  }
  const projectId = requiredString(argumentsValue.projectId, "projectId");
  const sceneId = requiredString(argumentsValue.sceneId, "sceneId");
  const expectedRevision = requiredInteger(
    argumentsValue.expectedRevision,
    "expectedRevision",
  );
  if (projectId !== context.bundle.project.projectId) {
    throw new XriftMcpEditorToolError(
      "PROJECT_MISMATCH",
      "現在開いているProjectと要求されたProjectが一致しません",
      { currentProjectId: context.bundle.project.projectId },
    );
  }
  if (sceneId !== context.bundle.scene.sceneId) {
    throw new XriftMcpEditorToolError(
      "SCENE_MISMATCH",
      "現在開いているSceneと要求されたSceneが一致しません",
      { currentSceneId: context.bundle.scene.sceneId },
    );
  }
  if (expectedRevision !== context.revision) {
    throw new XriftMcpEditorToolError(
      "STALE_REVISION",
      "Sceneが更新されています。最新のEditor contextを取得してください",
      { expectedRevision, currentRevision: context.revision },
    );
  }
}

function applyFogPatch(
  current: SceneFogSettings,
  patch: Record<string, unknown>,
): SceneFogSettings {
  for (const key of Object.keys(patch)) {
    if (!new Set(["enabled", "color", "near", "far"]).has(key)) {
      throw new XriftMcpEditorToolError(
        "INVALID_ARGUMENT",
        `fog.${key}は変更できません`,
      );
    }
  }
  const next: SceneFogSettings = { ...current };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== "boolean") invalidArgument("fog.enabled", "boolean");
    next.enabled = patch.enabled;
  }
  if (patch.color !== undefined) {
    if (typeof patch.color !== "string" || !/^#[0-9a-f]{6}$/i.test(patch.color)) {
      invalidArgument("fog.color", "#rrggbb");
    }
    next.color = patch.color.toLowerCase();
  }
  if (patch.near !== undefined) next.near = finiteNumber(patch.near, "fog.near", 0);
  if (patch.far !== undefined) next.far = finiteNumber(patch.far, "fog.far", 0.001);
  if (next.far <= next.near) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "fog.farはfog.nearより大きい値にしてください",
    );
  }
  return next;
}

function unchanged(
  context: XriftMcpEditorContext,
  result: Record<string, unknown>,
  activity: string,
): XriftMcpEditorToolOutcome {
  return {
    changed: false,
    bundle: context.bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result,
    activity,
  };
}

function touchProject(
  context: XriftMcpEditorContext,
  bundle: PrototypeVisualProject,
): PrototypeVisualProject {
  return {
    ...bundle,
    project: {
      ...bundle.project,
      metadata: {
        ...bundle.project.metadata,
        updatedAt: context.now?.() ?? new Date().toISOString(),
      },
    },
  };
}

function sameFog(left: SceneFogSettings, right: SceneFogSettings): boolean {
  return (
    left.enabled === right.enabled &&
    left.color === right.color &&
    left.near === right.near &&
    left.far === right.far
  );
}

function placementFailureMessage(reason: string): string {
  switch (reason) {
    case "asset-missing":
      return "指定されたAssetが見つかりません";
    case "parent-missing":
      return "配置先のEntityが見つかりません";
    case "prefab-document-missing":
    case "prefab-empty":
      return "Prefab documentを読み込めないため配置できません";
    default:
      return "指定されたAssetはSceneへ配置できません";
  }
}

function requireEntity(scene: SceneDocument, entityId: string): SceneEntity {
  const entity = scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  return entity;
}

function addComponentFailureCode(reason?: string): string {
  switch (reason) {
    case "entity-missing":
      return "ENTITY_NOT_FOUND";
    case "definition-missing":
      return "DEFINITION_NOT_FOUND";
    case "project-kind":
      return "PROJECT_KIND_MISMATCH";
    case "duplicate":
      return "DUPLICATE_COMPONENT";
    case "dependency-missing":
      return "DEPENDENCY_MISSING";
    default:
      return "COMPONENT_NOT_ADDED";
  }
}

function addComponentFailureMessage(reason?: string): string {
  switch (reason) {
    case "entity-missing":
      return "指定されたEntityが見つかりません";
    case "definition-missing":
      return "指定されたComponentの定義が見つかりません";
    case "project-kind":
      return "このComponentは現在のProject種別では追加できません";
    case "duplicate":
      return "同じComponentが既に追加されています";
    case "dependency-missing":
      return "依存する条件が満たされていないため追加できません";
    default:
      return "Componentを追加できませんでした";
  }
}

function setMaterialFailureCode(reason: string): string {
  switch (reason) {
    case "entity-missing":
      return "ENTITY_NOT_FOUND";
    case "mesh-missing":
      return "MESH_NOT_FOUND";
    case "material-missing":
      return "MATERIAL_NOT_FOUND";
    case "slot-missing":
      return "SLOT_NOT_FOUND";
    default:
      return "MATERIAL_NOT_APPLIED";
  }
}

function setMaterialFailureMessage(reason: string): string {
  switch (reason) {
    case "entity-missing":
      return "指定されたEntityが見つかりません";
    case "mesh-missing":
      return "指定されたEntityにMeshがありません";
    case "material-missing":
      return "指定されたMaterial Assetが見つかりません";
    case "slot-missing":
      return "指定されたMaterial slotが見つかりません";
    default:
      return "Materialを割り当てられませんでした";
  }
}

function componentDefinitionId(component: SceneComponent): string | null {
  switch (component.type) {
    case "transform":
      return "core.transform";
    case "mesh":
      return "core.mesh";
    case "rigid-body":
      return "physics.rigid-body";
    case "collider":
      return component.shape === "box"
        ? "physics.box-collider"
        : "physics.mesh-collider";
    case "light":
      return `core.light.${
        component.lightType === "rectArea" ? "area" : component.lightType
      }`;
    case "spawn-point":
      return "core.spawn";
    case "particle-emitter":
      return "core.particle";
    case "animation":
      return "core.animation";
    case "audio-source":
      return "core.audio-source";
    case "text":
      return "core.text";
    case "script":
      return "scripting.script";
    case "xrift-component":
      return component.schemaId;
    case "prefab-instance":
      return null;
  }
}

function componentPatchRecord(value: unknown): Record<string, unknown> {
  const patch = recordValue(value, "patch");
  if (!isJsonValue(patch)) invalidArgument("patch", "finite JSON object");
  if (Object.keys(patch).length === 0) {
    invalidArgument("patch", "non-empty object");
  }
  return JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
}

function particlePatchValue(value: unknown): ParticlePropertiesPatch {
  const patch = recordValue(value, "patch");
  if (!isJsonValue(patch)) invalidArgument("patch", "finite JSON object");
  const allowed = new Set([
    "maxParticles",
    "duration",
    "looping",
    "prewarm",
    "simulationSpace",
    "startDelay",
    "startLifetime",
    "startSpeed",
    "startSize",
    "startRotation",
    "gravity",
    "emission",
    "shape",
    "colorOverLifetime",
    "sizeOverLifetime",
    "velocityOverLifetime",
    "renderer",
  ]);
  const unsupported = Object.keys(patch).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `patch.${unsupported}はParticle Assetで変更できません`,
    );
  }
  if (Object.keys(patch).length === 0) {
    invalidArgument("patch", "non-empty object");
  }
  return JSON.parse(JSON.stringify(patch)) as ParticlePropertiesPatch;
}

function assertPatchKeys(
  patch: Record<string, unknown>,
  allowedKeys: readonly string[],
  componentType: SceneComponent["type"],
  options: { guidance?: string } = {},
): void {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(patch).find((key) => !allowed.has(key));
  if (!unsupported) return;
  throw new XriftMcpEditorToolError(
    componentType === "script"
      ? "USE_UPDATE_SCRIPT_COMPONENT"
      : componentType === "transform"
        ? "USE_UPDATE_TRANSFORM"
        : "INVALID_ARGUMENT",
    options.guidance ??
      `patch.${unsupported}は${componentType} Componentで変更できません`,
    { componentType, unsupportedField: unsupported },
  );
}

function requiredPatchEnabled(patch: Record<string, unknown>): boolean {
  const enabled = optionalBoolean(patch.enabled, "patch.enabled");
  if (enabled === undefined) invalidArgument("patch.enabled", "boolean");
  return enabled;
}

function updateSceneComponentEnabled(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
  enabled: boolean,
): SceneDocument {
  const entity = scene.entities[entityId];
  const component = entity?.components.find(
    (candidate) => candidate.id === componentId,
  );
  if (!entity || !component || component.enabled === enabled) return scene;
  return replaceSceneComponent(scene, entityId, componentId, {
    ...component,
    enabled,
  });
}

function replaceSceneComponent(
  scene: SceneDocument,
  entityId: string,
  componentId: string,
  component: SceneComponent,
): SceneDocument {
  const entity = scene.entities[entityId];
  if (!entity) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: entity.components.map((candidate) =>
          candidate.id === componentId ? component : candidate,
        ),
      },
    },
  };
}

function patchMatchesComponent(
  component: SceneComponent,
  patch: Record<string, unknown>,
): boolean {
  return Object.entries(patch).every(
    ([key, value]) =>
      JSON.stringify(component[key as keyof SceneComponent]) ===
      JSON.stringify(value),
  );
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidArgument(name, "object");
  }
  return value as Record<string, unknown>;
}

function materialPatchValue(value: unknown): MaterialAssetPatch {
  const patch = recordValue(value, "patch");
  if (!isJsonValue(patch)) invalidArgument("patch", "JSON object");
  const allowed = new Set([
    "pbrMetallicRoughness",
    "normalTexture",
    "occlusionTexture",
    "emissiveFactor",
    "emissiveTexture",
    "alphaMode",
    "alphaCutoff",
    "doubleSided",
    "extensions",
    "color",
    "opacity",
    "metalness",
    "roughness",
    "baseColorTextureId",
    "normalTextureId",
    "occlusionTextureId",
    "metallicRoughnessTextureId",
    "emissiveTextureId",
  ]);
  const unsupported = Object.keys(patch).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `patch.${unsupported}は変更できません`,
    );
  }
  if (Object.keys(patch).length === 0) invalidArgument("patch", "non-empty object");
  return JSON.parse(JSON.stringify(patch)) as MaterialAssetPatch;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) invalidArgument(name, "non-empty string");
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalUniqueStringArray(
  value: unknown,
  name: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalidArgument(name, "unique string array");
  const result = value.map((entry, index) =>
    requiredString(entry, `${name}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    invalidArgument(name, "unique string array");
  }
  return result;
}

function validateScriptPropertyPatch({
  contract,
  properties,
  component,
  assets,
  scene,
  assetReferences,
  entityReferences,
}: {
  contract: ScriptContract;
  properties: Record<string, unknown>;
  component: ScriptComponent;
  assets: PrototypeVisualProject["assets"]["assets"];
  scene: SceneDocument;
  assetReferences?: readonly string[];
  entityReferences?: readonly string[];
}): void {
  const descriptors = new Map(
    contract.props.map((descriptor) => [descriptor.name, descriptor]),
  );
  const allowedAssets = new Set(
    assetReferences ?? component.assetReferences,
  );
  const allowedEntities = new Set(
    entityReferences ?? component.entityReferences,
  );
  for (const [name, value] of Object.entries(properties)) {
    const descriptor = descriptors.get(name);
    if (!descriptor) {
      throw new XriftMcpEditorToolError(
        "SCRIPT_PROPERTY_UNKNOWN",
        `Scriptに宣言されていないpropertyです: ${name}`,
        { property: name, scriptName: contract.name },
      );
    }
    const validationError = getScriptPropValueValidationError(
      descriptor,
      value,
    );
    if (validationError) {
      throw new XriftMcpEditorToolError(
        "SCRIPT_PROPERTY_TYPE_MISMATCH",
        `${name}: ${validationError}`,
        {
          property: name,
          expectedKind: descriptor.kind,
          validationError,
        },
      );
    }
    if (descriptor.kind === "asset" && value) {
      const asset = assets[value as string];
      if (!asset) {
        throw new XriftMcpEditorToolError(
          "ASSET_NOT_FOUND",
          `${name} が参照するAssetが見つかりません`,
          { property: name, assetId: value },
        );
      }
      if (descriptor.assetKind && asset.kind !== descriptor.assetKind) {
        throw new XriftMcpEditorToolError(
          "SCRIPT_PROPERTY_TYPE_MISMATCH",
          `${name} は ${descriptor.assetKind} Assetを参照してください`,
          {
            property: name,
            assetId: value,
            expectedAssetKind: descriptor.assetKind,
            actualAssetKind: asset.kind,
          },
        );
      }
      if (!allowedAssets.has(value as string)) {
        throw new XriftMcpEditorToolError(
          "SCRIPT_REFERENCE_NOT_DECLARED",
          `${name} のAsset IDをassetReferencesにも指定してください`,
          { property: name, assetId: value },
        );
      }
    }
    if (descriptor.kind === "entity" && value) {
      if (!scene.entities[value as string]) {
        throw new XriftMcpEditorToolError(
          "ENTITY_NOT_FOUND",
          `${name} が参照するEntityが見つかりません`,
          { property: name, entityId: value },
        );
      }
      if (!allowedEntities.has(value as string)) {
        throw new XriftMcpEditorToolError(
          "SCRIPT_REFERENCE_NOT_DECLARED",
          `${name} のEntity IDをentityReferencesにも指定してください`,
          { property: name, entityId: value },
        );
      }
    }
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return right.every((entry) => expected.has(entry));
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalidArgument(name, "boolean");
  return value;
}

function optionalFiniteNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidArgument(name, "finite number");
  }
  return value;
}

function optionalNumberTuple<N extends number>(
  value: unknown,
  name: string,
  length: N,
): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    invalidArgument(name, `[${Array.from({ length }, (_, index) => `n${index + 1}`).join(", ")}]`);
  }
  return [value[0] as number, value[1] as number];
}

function requiredEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    invalidArgument(name, allowed.join(" | "));
  }
  return value as T;
}

function optionalNullableString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, name);
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalidArgument(name, "non-negative integer");
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : requiredInteger(value, name);
}

function optionalVec2(
  value: unknown,
  name: string,
): { x: number; y: number } | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    invalidArgument(name, "[x, y]");
  }
  return { x: value[0] as number, y: value[1] as number };
}

function optionalVec3(value: unknown, name: string): Vec3 | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    invalidArgument(name, "[x, y, z]");
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function finiteNumber(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    invalidArgument(name, `number >= ${minimum}`);
  }
  return value;
}

function invalidArgument(name: string, expected: string): never {
  throw new XriftMcpEditorToolError(
    "INVALID_ARGUMENT",
    `${name}は${expected}で指定してください`,
  );
}
