import { isPlainObjectRecord } from "../json-guards";
import { instantiateSceneAsset, isScenePlaceableAsset } from "./asset-placement";
import {
  analyzeComponentCode,
  applyComponentCodeImportPlan,
  type ComponentCodeImportPlan,
} from "./component-code-import";
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
} from "./editor-session";
import { updateModelNodeEntityEnabled } from "./model-hierarchy";
import {
  analyzeAssetDeletion,
  collectAssetReferences,
  deleteAssetIfUnreferenced,
  detachAssetReferences,
  deleteEmptyAssetFolder,
  moveLibraryAsset,
  moveLibraryFolder,
} from "./asset-operations";
import {
  assignMaterialToMeshSlots,
  assignMaterialToPrimaryMeshSlot,
} from "./material-assignment";
import type { PrototypeVisualProject } from "./prototype-project";
import { XRIFT_SCRIPTING_CAPABILITIES } from "./scripting-capabilities.data";
import {
  addBuiltinPrimitiveEntity,
  addTerrainEntity,
  applyTerrainBrushToScene,
  resampleTerrainInScene,
  setTerrainGrassLayersInScene,
  duplicateEntityHierarchy,
  getTerrainGeometry,
  getMeshMaterialSlots,
  renameEntity as renameEntityInScene,
  updateAudioSourceComponent,
  updateVegetationWindComponent,
  updateColliderComponent,
  updateEntityTransform,
  updateLightComponent,
  setMeshMaterialBinding,
  updateMeshShadowSettings,
  updateMeshVisibilitySettings,
  MESH_MAX_DISTANCE_MAX,
  MESH_MAX_DISTANCE_MIN,
  updateRigidBodyComponent,
  updateTextComponent,
  updateInteractionTriggerComponent,
  type AudioSourcePatch,
  type ColliderPatch,
  type InteractionTriggerPatch,
  type LightPatch,
  type RigidBodyPatch,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
  type ScriptComponent,
  type TextPatch,
  type Vec3,
  type ModelPoseState,
  type MeshVisibilityPatch,
} from "./scene-document";
import {
  entityWorldMatrix,
  getEntityWorldBounds,
  transformPointByMatrix,
} from "./entity-bounds";
import {
  DEFAULT_TERRAIN_SPAN,
  TERRAIN_PRESETS,
  createTerrainFromPreset,
  findTerrainOverlaps,
  getTerrainPreset,
  nextTerrainPosition,
  type TerrainFootprint,
} from "./terrain-presets";
import {
  TERRAIN_SURFACE_CATALOG,
  TERRAIN_SURFACE_CATALOG_REVISION,
  defaultTerrainSurfaceParameterValues,
  fitTerrainSurfaceToRange,
  getTerrainSurfacePreset,
} from "./terrain-surface-catalog";
import {
  applySkyShaderCatalogInstall,
  applyTerrainSurfaceCatalogInstall,
  applyWaterShaderCatalogInstall,
} from "./external-store";
import {
  SKY_SHADER_CATALOG,
  defaultSkyShaderParameterValues,
  getSkyShaderCatalogEntry,
  skyShaderCategoryLabel,
  type SkyShaderCatalogEntry,
} from "./sky-shader-catalog";
import {
  WATER_SHADER_CATALOG,
  defaultWaterShaderParameterValues,
  getWaterShaderCatalogEntry,
  type WaterShaderCatalogEntry,
} from "./water-shader-catalog";
import {
  GLOW_MATERIAL_PRESETS,
  createGlowMaterialAsset,
  getGlowMaterialPreset,
} from "./glow-material-catalog";
import {
  SCENE_RECIPE_CATEGORY_LABELS,
  getSceneRecipesForProjectKind,
} from "./scene-recipe-catalog";
import { createTextureCard } from "./texture-card";
import {
  terrainCellHasHole,
  terrainHeightRange,
  TERRAIN_BRUSH_KINDS,
  TERRAIN_MATERIAL_SLOT,
  TERRAIN_HEIGHT_ABSOLUTE_MAX,
  TERRAIN_RESOLUTION_MAX,
  TERRAIN_RESOLUTION_MIN,
  TERRAIN_SIZE_MAX,
  TERRAIN_SIZE_MIN,
  type TerrainBrushOperation,
  type TerrainGeometry,
} from "./terrain";
import {
  TERRAIN_GRASS_BRUSH_MODES,
  TERRAIN_GRASS_DEFAULT_FILL,
  TERRAIN_GRASS_MAX_INSTANCES,
  TERRAIN_GRASS_PRESETS,
  TERRAIN_GRASS_TYPES,
  applyTerrainGrassAppearance,
  createTerrainGrassLayers,
  getTerrainGrassPreset,
  getTerrainGrassType,
  isTerrainGrassLayer,
  resolveTerrainGrassAppearance,
  sampleTerrainGrassMask,
  sampleTerrainHeight,
  sampleTerrainSlopeDegrees,
  type TerrainGrassAppearance,
  type TerrainGrassLayer,
  type TerrainGrassTypeId,
} from "./terrain-grass";
import {
  collectInteractionTriggerTargets,
  syncInteractionTriggerReferences,
} from "./interaction-trigger-targets";
import {
  resolveSceneSettings,
  type SceneAmbientSettings,
  type SceneCameraSettings,
  type ScenePhysicsSettings,
  type SceneFogSettings,
  type SceneGizmoSettings,
  type ScenePostprocessingSettings,
  type SceneVegetationSettings,
  type SceneSettings,
  type SceneSkyboxSettings,
} from "./scene-settings";
import {
  getScriptPropValueValidationError,
  type ScriptContract,
} from "./scripting/script-contract";
import type { ScriptRuntimeReport } from "./scripting/runtime-report";
import {
  INTERACTIVITY_EASINGS,
  KHR_INTERACTIVITY_MAX_GRAPHS,
  KHR_INTERACTIVITY_OPERATION_TEMPLATES,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  addDefaultInteractivityAsset,
  addInteractivityGraph,
  autoLayoutInteractivityGraph,
  collectInteractivityRuntimeDiagnostics,
  configureInteractivityTriggerAction,
  defaultTriggerActionValue,
  dryRunInteractivityGraph,
  duplicateInteractivityGraph,
  duplicateInteractivityNode,
  freeInteractivityNodePosition,
  getInteractivityRuntimeSupport,
  getXriftInteractionProperty,
  cloneKhrInteractivityExtension,
  configureInteractivityMaterialPointer,
  getInteractivityOperationTemplate,
  isInteractivityTriggerActionOp,
  parseKhrInteractivityExtension,
  pasteInteractivityNode,
  readInteractivityNodeForCopy,
  readInteractivityNodePosition,
  readInteractivityTriggerAction,
  readInteractivityTriggerActionAsset,
  readInteractivityTriggerActionDuration,
  readInteractivityTriggerActionText,
  readInteractivityTriggerActionEasing,
  removeInteractivityGraph,
  renameInteractivityGraph,
  setInteractivityTriggerActionDuration,
  setInteractivityTriggerActionEasing,
  setInteractivityTriggerActionAsset,
  setInteractivityTriggerActionText,
  setInteractivityTriggerActionValue,
  validateKhrInteractivityExtension,
  writeInteractivityNodePosition,
  xriftInteractionEnumIndex,
  XRIFT_INTERACTION_OPERATIONS,
  type InteractivityScheduleEntry,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "./interactivity-graph";
import { createModelAnimationGraphExtension } from "./interactivity-recipes";
import {
  addAssetFolder,
  getAudioAsset,
  getMaterialAsset,
  getTextureAsset,
  getModelAsset,
  isUserLibraryAsset,
  renameAssetFolder,
  updateModelAsset,
  updateMaterialAsset,
  updateTextureAsset,
  TEXTURE_COLOR_SPACES,
  TEXTURE_COMPRESSION_FORMATS,
  TEXTURE_MAG_FILTERS,
  TEXTURE_MIN_FILTERS,
  TEXTURE_WRAP_MODES,
  type AssetManifest,
  type InteractivityAsset,
  type MaterialAssetPatch,
  type MaterialProperties,
  type MaterialTextureInfo,
  type MaterialTextureInfoPatch,
  type ModelAssetPatch,
  type TextureImportSettingsPatch,
} from "./asset-manifest";
import {
  createDefaultCustomShader,
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
  type ClassicR3fMaterialShaderPatch,
} from "./custom-shader-contract";
import { isSkyShaderMaterialAsset } from "./sky-shader";
import {
  removeXriftComponent,
  updateXriftComponent,
  type UpdateXriftComponentPatch,
} from "./component-registry";
import { addDefaultDocumentAsset } from "./document-asset-creation";
import {
  addPrefabAsset,
  createPrefabDocument,
} from "./prefab-document";
import {
  updateParticleAsset,
  type ParticlePropertiesPatch,
} from "./particle-system";
import {
  inspectColliderConfiguration,
  optimizeColliderConfiguration,
} from "./collider-diagnostics";

// Tool names and their execution surface come from mcp-tool-registry, which is
// the one place a tool is declared. These re-exports keep existing importers
// working without giving the list a second home.
import type { XriftMcpEditorToolName } from "./mcp-tool-registry";

export {
  XRIFT_MCP_DEBUG_TOOLS,
  XRIFT_MCP_EDITOR_TOOLS,
  XRIFT_MCP_LOCAL_ASSET_TOOLS,
  XRIFT_MCP_SCRIPT_TOOLS,
  type XriftMcpDebugToolName,
  type XriftMcpEditorToolName,
  type XriftMcpLocalAssetToolName,
  type XriftMcpScriptToolName,
} from "./mcp-tool-registry";

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

type XriftMcpDocumentToolHandler = (
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
) => XriftMcpEditorToolOutcome;

/**
 * Every document tool, keyed by the name the registry declares.
 *
 * Typing this as a complete Record is what keeps the two in step: a tool added
 * to the registry without a handler here fails to compile, and a handler with no
 * registry entry has no name to be reached by. The dispatcher that replaced a
 * 130-line switch is the lookup below it.
 */
const XRIFT_MCP_DOCUMENT_TOOL_HANDLERS: Record<
  XriftMcpEditorToolName,
  XriftMcpDocumentToolHandler
> = {
  get_editor_context: readEditorContext,
  get_scripting_capabilities: readScriptingCapabilities,
  analyze_component_code: analyzeComponentCodeTool,
  apply_component_code_import_plan: applyComponentCodeImportPlanTool,
  list_assets: listAssets,
  update_project_metadata: updateProjectMetadata,
  create_asset_folder: createAssetFolder,
  rename_asset: renameLibraryAsset,
  rename_asset_folder: renameLibraryAssetFolder,
  move_asset: moveLibraryAssetTool,
  move_asset_folder: moveLibraryAssetFolderTool,
  detach_asset_references: detachLibraryAssetReferences,
  delete_asset: deleteLibraryAsset,
  delete_asset_folder: deleteLibraryAssetFolder,
  inspect_colliders: inspectColliders,
  optimize_colliders: optimizeColliders,
  get_audio_asset: getAudio,
  get_model_asset: getModel,
  get_texture_asset: getTexture,
  update_model_asset: updateModel,
  update_texture_asset: updateTexture,
  create_document_asset: createDocumentAsset,
  get_particle_asset: getParticleAsset,
  update_particle_asset: updateParticleAssetTool,
  update_scene_settings: updateSceneSettings,
  place_asset: placeAsset,
  list_entities: listEntities,
  list_component_definitions: listComponentDefinitions,
  get_entity_components: getEntityComponents,
  get_entity_bounds: getEntityBounds,
  create_primitive: createPrimitive,
  get_terrain: getTerrain,
  sample_terrain_point: sampleTerrainPoint,
  list_terrain_presets: listTerrainPresets,
  create_terrain: createTerrain,
  create_terrain_from_preset: createTerrainFromPresetTool,
  apply_terrain_surface: applyTerrainSurface,
  sculpt_terrain: sculptTerrain,
  update_terrain: updateTerrain,
  list_terrain_grass_types: listTerrainGrassTypes,
  apply_terrain_grass_preset: applyTerrainGrassPreset,
  add_terrain_grass_layer: addTerrainGrassLayer,
  update_terrain_grass_layer: updateTerrainGrassLayer,
  delete_terrain_grass_layer: deleteTerrainGrassLayer,
  paint_terrain_grass: paintTerrainGrass,
  list_scene_recipes: listSceneRecipes,
  place_builtin_prefab: placeBuiltinPrefab,
  create_prefab: createPrefab,
  add_component: addComponent,
  update_component: updateComponent,
  remove_component: removeComponent,
  set_entity_enabled: setEntityEnabled,
  update_script_component: updateScriptComponent,
  update_transform: updateTransform,
  set_material: setMaterial,
  get_material_asset: getMaterial,
  update_material_asset: updateMaterial,
  list_material_presets: listMaterialPresets,
  create_material_from_preset: createMaterialFromPreset,
  create_texture_card: createTextureCardTool,
  create_custom_shader: createCustomShader,
  get_custom_shader: getCustomShader,
  update_custom_shader: updateCustomShader,
  set_material_texture_transform: setMaterialTextureTransform,
  rename_entity: renameEntity,
  duplicate_entity: duplicateEntity,
  reparent_entity: reparentEntity,
  delete_entity: deleteEntity,
  create_empty_entity: createEmptyEntity,
  list_interactivity_operations: listInteractivityOperations,
  get_interactivity_asset: getInteractivityAsset,
  create_interactivity_asset: createInteractivityAsset,
  create_model_animation_graph: createModelAnimationGraph,
  add_interactivity_node: addInteractivityNode,
  connect_interactivity_nodes: connectInteractivityNodes,
  set_interactivity_value: setInteractivityValue,
  set_interactivity_configuration: setInteractivityConfiguration,
  configure_interactivity_material_pointer: configureInteractivityMaterial,
  disconnect_interactivity_socket: disconnectInteractivitySocket,
  delete_interactivity_node: deleteInteractivityNode,
  validate_interactivity_asset: validateInteractivityAsset,
  update_interactivity_asset: updateInteractivityAssetTool,
  simulate_interactivity_asset: simulateInteractivityAsset,
  add_interactivity_graph: addInteractivityGraphTool,
  update_interactivity_graph: updateInteractivityGraphTool,
  delete_interactivity_graph: deleteInteractivityGraphTool,
  move_interactivity_node: moveInteractivityNode,
  duplicate_interactivity_node: duplicateInteractivityNodeTool,
  layout_interactivity_graph: layoutInteractivityGraph,
  list_interaction_trigger_targets: listInteractionTriggerTargets,
  configure_interactivity_trigger_action: configureInteractivityTriggerActionTool,
};

export function executeXriftMcpEditorTool(
  context: XriftMcpEditorContext,
  request: XriftMcpEditorRequest,
): XriftMcpEditorToolOutcome {
  return XRIFT_MCP_DOCUMENT_TOOL_HANDLERS[request.tool](
    context,
    request.arguments,
  );
}

function readScriptingCapabilities(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  return unchanged(
    context,
    XRIFT_SCRIPTING_CAPABILITIES,
    "Scripting capabilityを取得しました",
  );
}

function analyzeComponentCodeTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const source = requiredString(argumentsValue.source, "source");
  const plan = analyzeComponentCode(source, context.bundle.project.projectKind);
  return unchanged(
    context,
    {
      plan: JSON.parse(JSON.stringify(plan)) as Record<string, unknown>,
      summary: plan.summary,
      diagnostics: plan.diagnostics,
      assetDependencies: plan.assetDependencies,
      imports: plan.imports,
    },
    `R3Fコードを解析しました（Entity ${plan.summary.entityCount}件）`,
  );
}

function applyComponentCodeImportPlanTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const plan = requiredPlan(argumentsValue.plan, "plan");
  const assetIdBySourcePath = optionalStringRecord(
    argumentsValue.assetIdBySourcePath,
    "assetIdBySourcePath",
  );
  const result = applyComponentCodeImportPlan({
    scene: context.bundle.scene,
    assets: context.bundle.assets,
    projectKind: context.bundle.project.projectKind,
    plan,
    assetIdBySourcePath,
  });
  if (result.entityIds.length === 0) {
    throw new XriftMcpEditorToolError(
      "COMPONENT_IMPORT_FAILED",
      result.diagnostics[0]?.message ?? "変換したComponentをSceneへ追加できませんでした",
      { diagnostics: result.diagnostics },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: result.scene,
    assets: result.assets,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: {
      kind: "entity",
      id: result.entityIds[result.entityIds.length - 1]!,
    },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityIds: result.entityIds,
      diagnostics: result.diagnostics,
    },
    activity: `AIがR3FコードをEntity ${result.entityIds.length}件へ変換しました`,
  };
}

function requiredPlan(
  value: unknown,
  name: string,
): ComponentCodeImportPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidArgument(name, "analyze_component_codeが返したplan object");
  }
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.nodes)) {
    invalidArgument(name, "plan.nodes (array)");
  }
  return plan as unknown as ComponentCodeImportPlan;
}

function optionalStringRecord(
  value: unknown,
  name: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidArgument(name, "object of sourcePath -> assetId");
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") invalidArgument(name, "string values");
    record[key] = entry;
  }
  return record;
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
    sceneSettings,
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
      folderId: asset.folderId ?? null,
      placeable: isScenePlaceableAsset(asset),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const folders = Object.values(context.bundle.assets.folders ?? {})
    .filter((folder) => !query || folder.name.toLocaleLowerCase().includes(query))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return unchanged(
    context,
    { assets, folders, count: assets.length, folderCount: folders.length },
    "Asset一覧を取得しました",
  );
}

function updateProjectMetadata(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const patch = recordValue(argumentsValue.patch, "patch");
  assertObjectKeys(patch, "patch", ["title", "description"]);
  if (Object.keys(patch).length === 0) invalidArgument("patch", "non-empty object");
  const nextMetadata = { ...context.bundle.project.metadata };
  for (const field of ["title", "description"] as const) {
    if (patch[field] !== undefined) {
      if (typeof patch[field] !== "string") {
        invalidArgument(`patch.${field}`, "string");
      }
      nextMetadata[field] = patch[field];
    }
  }
  if (
    nextMetadata.title === context.bundle.project.metadata.title &&
    nextMetadata.description === context.bundle.project.metadata.description
  ) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        metadata: JSON.parse(JSON.stringify(context.bundle.project.metadata)),
        revision: context.revision,
      },
      "公開情報はすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    project: { ...context.bundle.project, metadata: nextMetadata },
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      metadata: JSON.parse(JSON.stringify(bundle.project.metadata)),
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: "AIが公開情報を更新しました",
  };
}

function createAssetFolder(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const name = requiredString(argumentsValue.name, "name");
  if (name.length > 100) invalidArgument("name", "100文字以内の文字列");
  const parentId = optionalNullableString(argumentsValue.parentId, "parentId");
  if (parentId && !context.bundle.assets.folders?.[parentId]) {
    throw new XriftMcpEditorToolError(
      "FOLDER_NOT_FOUND",
      "親Folderが見つかりません",
      { parentId },
    );
  }
  const folderId = createDocumentId("folder");
  const added = addAssetFolder(context.bundle.assets, {
    id: folderId,
    name,
    parentId,
  });
  if (!added.added) {
    throw new XriftMcpEditorToolError(
      "FOLDER_CREATE_REJECTED",
      "同じ名前のFolderがあるか、Folder名が不正です",
      { name, parentId },
    );
  }
  const folder = added.manifest.folders?.[folderId];
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: added.manifest,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      folder: folder ? JSON.parse(JSON.stringify(folder)) : null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがFolder「${name}」を作成しました`,
  };
}

function renameLibraryAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const asset = context.bundle.assets.assets[assetId];
  if (!asset || !isUserLibraryAsset(asset)) {
    throw new XriftMcpEditorToolError(
      "ASSET_NOT_FOUND",
      "名前を変更できるLibrary Assetが見つかりません",
      { assetId },
    );
  }
  const name = requiredString(argumentsValue.name, "name");
  if (name.length > 100) invalidArgument("name", "100文字以内の文字列");
  const assets = renameAsset(context.bundle.assets, assetId, name);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      { assetId, asset: JSON.parse(JSON.stringify(asset)), revision: context.revision },
      `Asset「${asset.name}」はすでに指定された名前です`,
    );
  }
  const updated = assets.assets[assetId];
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: assetId,
    result: {
      projectId: bundle.project.projectId,
      asset: updated ? JSON.parse(JSON.stringify(updated)) : null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがAsset「${asset.name}」の名前を変更しました`,
  };
}

function renameLibraryAssetFolder(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const folderId = requiredString(argumentsValue.folderId, "folderId");
  const folder = context.bundle.assets.folders?.[folderId];
  if (!folder) {
    throw new XriftMcpEditorToolError("FOLDER_NOT_FOUND", "Folderが見つかりません", { folderId });
  }
  const name = requiredString(argumentsValue.name, "name");
  if (name.length > 100) invalidArgument("name", "100文字以内の文字列");
  const assets = renameAssetFolder(context.bundle.assets, folderId, name);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      { folderId, folder: JSON.parse(JSON.stringify(folder)), revision: context.revision },
      `Folder「${folder.name}」はすでに指定された名前です`,
    );
  }
  const updated = assets.folders?.[folderId];
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      folder: updated ? JSON.parse(JSON.stringify(updated)) : null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがFolder「${folder.name}」の名前を変更しました`,
  };
}

function moveLibraryAssetTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const folderId = optionalNullableString(argumentsValue.folderId, "folderId");
  const asset = context.bundle.assets.assets[assetId];
  if (!asset || !isUserLibraryAsset(asset)) {
    throw new XriftMcpEditorToolError("ASSET_NOT_FOUND", "移動できるLibrary Assetが見つかりません", { assetId });
  }
  const moved = moveLibraryAsset(context.bundle.assets, assetId, folderId);
  if (!moved.changed) {
    throw new XriftMcpEditorToolError("ASSET_MOVE_REJECTED", "Assetを指定されたFolderへ移動できません", {
      assetId,
      folderId,
      reason: moved.reason,
    });
  }
  const updated = moved.assets.assets[assetId];
  const bundle = touchProject(context, { ...context.bundle, assets: moved.assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: assetId,
    result: {
      projectId: bundle.project.projectId,
      assetId,
      folderId: updated?.folderId ?? null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがAsset「${asset.name}」をFolderへ移動しました`,
  };
}

function moveLibraryAssetFolderTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const folderId = requiredString(argumentsValue.folderId, "folderId");
  const parentId = optionalNullableString(argumentsValue.parentId, "parentId");
  const folder = context.bundle.assets.folders?.[folderId];
  if (!folder) {
    throw new XriftMcpEditorToolError("FOLDER_NOT_FOUND", "Folderが見つかりません", { folderId });
  }
  const moved = moveLibraryFolder(context.bundle.assets, folderId, parentId);
  if (!moved.changed) {
    throw new XriftMcpEditorToolError("FOLDER_MOVE_REJECTED", "Folderを指定された親へ移動できません", {
      folderId,
      parentId,
      reason: moved.reason,
    });
  }
  const updated = moved.assets.folders?.[folderId];
  const bundle = touchProject(context, { ...context.bundle, assets: moved.assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      folder: updated ? JSON.parse(JSON.stringify(updated)) : null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがFolder「${folder.name}」を移動しました`,
  };
}

/**
 * Unlinks references to an Asset, the same operation the delete dialog offers.
 *
 * Without this an agent could see the rejection details of `delete_asset` and
 * still have no way to act on them but to guess at the owning Components. Pass
 * `ownerId` to unlink one owner; omit it to unlink every reference.
 */
function detachLibraryAssetReferences(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const ownerId = optionalString(argumentsValue.ownerId);
  let documents = {
    assets: context.bundle.assets,
    scene: context.bundle.scene,
    prefabs: context.bundle.prefabs,
  };
  const analysis = analyzeAssetDeletion(documents, assetId);
  if (!analysis.asset) {
    throw new XriftMcpEditorToolError("ASSET_NOT_FOUND", "Assetが見つかりません", {
      assetId,
    });
  }
  const requested = ownerId
    ? analysis.references.filter((reference) => reference.ownerId === ownerId)
    : analysis.references;
  if (requested.length === 0) {
    throw new XriftMcpEditorToolError(
      "ASSET_REFERENCE_NOT_FOUND",
      "外す参照が見つかりません",
      { assetId, ownerId, references: analysis.references },
    );
  }
  const detached: typeof analysis.references = [];
  for (const reference of requested) {
    const result = detachAssetReferences(documents, assetId, reference);
    if (!result.changed) continue;
    documents = {
      assets: result.assets,
      scene: result.scene,
      prefabs: result.prefabs,
    };
    detached.push(...result.detached);
  }
  if (detached.length === 0) {
    throw new XriftMcpEditorToolError(
      "ASSET_REFERENCE_NOT_FOUND",
      "外す参照が見つかりません",
      { assetId, ownerId },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: documents.assets,
    scene: documents.scene,
    prefabs: documents.prefabs,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      assetId,
      detached,
      remainingReferences: collectAssetReferences(documents, assetId),
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがAsset「${analysis.asset.name}」の参照${detached.length}件を外しました`,
  };
}

function deleteLibraryAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const detachReferences =
    optionalBoolean(argumentsValue.detachReferences, "detachReferences") ?? false;
  const documents = {
    assets: context.bundle.assets,
    scene: context.bundle.scene,
    prefabs: context.bundle.prefabs,
  };
  // Unlinking stays opt-in: a delete that silently rewrote the Scene would be
  // a bigger edit than the one the caller asked for.
  const detached = detachReferences
    ? detachAssetReferences(documents, assetId)
    : null;
  const deleted = deleteAssetIfUnreferenced(
    detached?.changed
      ? {
          assets: detached.assets,
          scene: detached.scene,
          prefabs: detached.prefabs,
        }
      : documents,
    assetId,
  );
  if (!deleted.changed) {
    throw new XriftMcpEditorToolError(
      "ASSET_DELETE_REJECTED",
      "Assetは削除できません。detachReferencesを指定するか、参照を解除してから再試行してください",
      { assetId, reason: deleted.reason, references: deleted.references },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: deleted.assets,
    ...(detached?.changed ? { scene: detached.scene } : {}),
    prefabs: deleted.prefabs,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection === assetId ? null : context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      assetId,
      deleted: true,
      deletedPrefabId: deleted.deletedPrefabId,
      detachedReferences: detached?.detached ?? [],
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがAsset「${deleted.asset?.name ?? assetId}」を削除しました`,
  };
}

function deleteLibraryAssetFolder(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const folderId = requiredString(argumentsValue.folderId, "folderId");
  const folder = context.bundle.assets.folders?.[folderId];
  if (!folder) {
    throw new XriftMcpEditorToolError("FOLDER_NOT_FOUND", "Folderが見つかりません", { folderId });
  }
  const deleted = deleteEmptyAssetFolder(context.bundle.assets, folderId);
  if (!deleted.changed) {
    throw new XriftMcpEditorToolError(
      "FOLDER_DELETE_REJECTED",
      "Folderが空ではないため削除できません",
      { folderId, analysis: deleted.analysis },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, assets: deleted.assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      folderId,
      deleted: true,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがFolder「${folder.name}」を削除しました`,
  };
}

function inspectColliders(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const entityIds = optionalEntityIds(argumentsValue.entityIds);
  const missingEntityId = entityIds?.find(
    (entityId) => !context.bundle.scene.entities[entityId],
  );
  if (missingEntityId) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId: missingEntityId },
    );
  }
  const inspection = inspectColliderConfiguration(context.bundle.scene, {
    entityIds,
  });
  return unchanged(
    context,
    {
      projectId: context.bundle.project.projectId,
      sceneId: context.bundle.scene.sceneId,
      revision: context.revision,
      entityIds: entityIds ?? null,
      inspection,
    },
    entityIds?.length === 1
      ? `Entity「${context.bundle.scene.entities[entityIds[0]!]?.name ?? entityIds[0]}」のColliderを診断しました`
      : "Scene全体のColliderを診断しました",
  );
}

function optimizeColliders(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const entityIds = optionalEntityIds(argumentsValue.entityIds);
  const missingEntityId = entityIds?.find(
    (entityId) => !context.bundle.scene.entities[entityId],
  );
  if (missingEntityId) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId: missingEntityId },
    );
  }
  const optimized = optimizeColliderConfiguration(context.bundle.scene, {
    entityIds,
  });
  if (optimized.changes.length === 0) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityIds: entityIds ?? null,
        inspection: optimized.after,
        changes: [],
      },
      "Colliderに自動修正が必要な問題はありません",
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: optimized.scene,
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
      entityIds: entityIds ?? null,
      inspection: optimized.after,
      changes: optimized.changes,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIがCollider設定を${optimized.changes.length}件最適化しました`,
  };
}

function optionalEntityIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "entityIdsは文字列配列で指定してください",
    );
  }
  const entityIds = value.map((candidate) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throw new XriftMcpEditorToolError(
        "INVALID_ARGUMENT",
        "entityIdsには空でない文字列だけを指定してください",
      );
    }
    return candidate.trim();
  });
  if (new Set(entityIds).size !== entityIds.length) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "entityIdsに重複したEntity IDは指定できません",
    );
  }
  return entityIds;
}

function getAudio(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const audioAssetId = requiredString(
    argumentsValue.audioAssetId,
    "audioAssetId",
  );
  const audio = getAudioAsset(context.bundle.assets, audioAssetId);
  if (!audio) {
    throw new XriftMcpEditorToolError(
      "AUDIO_NOT_FOUND",
      "指定されたAudio Assetが見つかりません",
      { audioAssetId },
    );
  }
  return unchanged(
    context,
    {
      audio: JSON.parse(JSON.stringify(audio)) as Record<string, unknown>,
    },
    `Audio「${audio.name}」を取得しました`,
  );
}

function getTexture(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const textureAssetId = requiredString(
    argumentsValue.textureAssetId,
    "textureAssetId",
  );
  const texture = getTextureAsset(context.bundle.assets, textureAssetId);
  if (!texture) {
    throw new XriftMcpEditorToolError(
      "TEXTURE_NOT_FOUND",
      "指定されたTexture Assetが見つかりません",
      { textureAssetId },
    );
  }
  return unchanged(
    context,
    {
      texture: JSON.parse(JSON.stringify(texture)) as Record<string, unknown>,
    },
    `Texture「${texture.name}」を取得しました`,
  );
}

function updateTexture(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const textureAssetId = requiredString(
    argumentsValue.textureAssetId,
    "textureAssetId",
  );
  const texture = getTextureAsset(context.bundle.assets, textureAssetId);
  if (!texture) {
    throw new XriftMcpEditorToolError(
      "TEXTURE_NOT_FOUND",
      "指定されたTexture Assetが見つかりません",
      { textureAssetId },
    );
  }
  const importSettings = mcpTextureImportSettingsPatch(
    argumentsValue.patch,
    "patch",
  );
  const assets = updateTextureAsset(context.bundle.assets, textureAssetId, {
    importSettings,
  });
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        textureAssetId,
        importSettings: texture.importSettings,
      },
      "Textureはすでに指定された状態です",
    );
  }
  const updated = getTextureAsset(assets, textureAssetId);
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: textureAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      textureAssetId,
      importSettings: updated?.importSettings,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIがTexture「${texture.name}」のImport設定を更新しました`,
  };
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
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const currentSettings = resolveSceneSettings(context.bundle.scene.settings);
  const sections = [
    "skybox",
    "fog",
    "ambient",
    "camera",
    "postprocessing",
    "vegetation",
    "physics",
    "editor",
  ] as const;
  if (!sections.some((section) => argumentsValue[section] !== undefined)) {
    invalidArgument(
      "Scene settings",
      "skybox、fog、ambient、camera、postprocessing、vegetation、physics、editorのいずれかを含むobject",
    );
  }
  const settings: SceneSettings = {
    skybox:
      argumentsValue.skybox === undefined
        ? currentSettings.skybox
        : applySkyboxPatch(
            currentSettings.skybox,
            sceneSettingsPatch(argumentsValue.skybox, "skybox", [
              "enabled",
              "iblEnabled",
              "projection",
              "imageAssetId",
              "materialAssetId",
              "topColor",
              "bottomColor",
              "offset",
              "exponent",
              "rotationDegrees",
              "flipY",
              "exposure",
              "meshPosition",
              "meshRotationDegrees",
              "meshScale",
              "center",
            ]),
            context,
          ),
    fog:
      argumentsValue.fog === undefined
        ? currentSettings.fog
        : applyFogPatch(
            currentSettings.fog,
            sceneSettingsPatch(argumentsValue.fog, "fog", [
              "enabled",
              "color",
              "near",
              "far",
            ]),
          ),
    ambient:
      argumentsValue.ambient === undefined
        ? currentSettings.ambient
        : applyAmbientPatch(
            currentSettings.ambient,
            sceneSettingsPatch(argumentsValue.ambient, "ambient", [
              "color",
              "intensity",
            ]),
          ),
    camera:
      argumentsValue.camera === undefined
        ? currentSettings.camera
        : applyCameraPatch(
            currentSettings.camera,
            sceneSettingsPatch(argumentsValue.camera, "camera", [
              "near",
              "far",
              "fov",
            ]),
          ),
    postprocessing:
      argumentsValue.postprocessing === undefined
        ? currentSettings.postprocessing
        : applyPostprocessingPatch(
            currentSettings.postprocessing,
            sceneSettingsPatch(argumentsValue.postprocessing, "postprocessing", [
              "enabled",
              "hdr",
              "bloom",
              "ao",
              "exposure",
            ]),
          ),
    vegetation:
      argumentsValue.vegetation === undefined
        ? currentSettings.vegetation
        : applyVegetationPatch(
            currentSettings.vegetation,
            sceneSettingsPatch(argumentsValue.vegetation, "vegetation", [
              "enabled",
              "windStrength",
              "windSpeed",
              "gustStrength",
              "windDirectionDegrees",
            ]),
          ),
    physics:
      argumentsValue.physics === undefined
        ? currentSettings.physics
        : applyPhysicsPatch(
            currentSettings.physics,
            sceneSettingsPatch(argumentsValue.physics, "physics", [
              "gravity",
              "allowInfiniteJump",
            ]),
          ),
    editor:
      argumentsValue.editor === undefined
        ? currentSettings.editor
        : applySceneEditorPatch(
            currentSettings.editor,
            sceneSettingsPatch(argumentsValue.editor, "editor", [
              "backgroundColor",
              "gizmo",
            ]),
          ),
  };
  // resolveSceneSettings supplies defaults for old documents. Persist the
  // newly introduced subsections once even when the requested values already
  // equal those defaults; otherwise an apparently successful no-op would
  // leave HDR/AO/vegetation absent from the file forever.
  if (
    sameSceneSettings(currentSettings, settings) &&
    hasCanonicalSceneQualitySettings(context.bundle.scene.settings)
  ) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        sceneSettings: settings,
        synchronizedDuringPlay: context.editorMode === "play",
      },
      "Scene設定はすでに指定された状態です",
    );
  }

  const bundle = touchProject(context, {
    ...context.bundle,
    scene: {
      ...context.bundle.scene,
      settings,
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
      sceneSettings: settings,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: "AIがScene設定を更新しました",
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
    // Placing an animated Model creates the graph that plays it.
    assets: placement.assets,
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
      // Distinguishes a shared-source Model node (transform-only proxy whose
      // geometry the Model root draws) from an Entity that owns its Meshes.
      ...(entity.modelNode ? { modelNode: entity.modelNode } : {}),
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
      ...(entity.modelNode ? { modelNode: entity.modelNode } : {}),
      components,
      count: components.length,
    },
    `Entity「${entity.name}」のComponentを取得しました`,
  );
}

function getModel(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const modelAssetId = requiredString(
    argumentsValue.modelAssetId,
    "modelAssetId",
  );
  const model = getModelAsset(context.bundle.assets, modelAssetId);
  if (!model) {
    throw new XriftMcpEditorToolError(
      "MODEL_NOT_FOUND",
      "指定されたModel Assetが見つかりません",
      { modelAssetId },
    );
  }
  return unchanged(
    context,
    { model: JSON.parse(JSON.stringify(model)) as Record<string, unknown> },
    `Model「${model.name}」を取得しました`,
  );
}

function updateModel(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const modelAssetId = requiredString(
    argumentsValue.modelAssetId,
    "modelAssetId",
  );
  const model = getModelAsset(context.bundle.assets, modelAssetId);
  if (!model) {
    throw new XriftMcpEditorToolError(
      "MODEL_NOT_FOUND",
      "指定されたModel Assetが見つかりません",
      { modelAssetId },
    );
  }
  const patch = modelAssetPatchValue(argumentsValue.patch, context);
  const unknownMaterialSlots = Object.keys(patch.materialSlotBindings ?? {}).filter(
    (slot) => !model.materialSlots.some((candidate) => candidate.slot === slot),
  );
  if (unknownMaterialSlots.length > 0) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "Modelに存在しないMaterial slotは変更できません",
      { modelAssetId, materialSlots: unknownMaterialSlots },
    );
  }
  const assets = updateModelAsset(context.bundle.assets, modelAssetId, patch);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        modelAssetId,
        importSettings: model.importSettings,
        materialSlots: model.materialSlots,
      },
      `Model「${model.name}」はすでに指定された状態です`,
    );
  }
  const updated = getModelAsset(assets, modelAssetId);
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: modelAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      modelAssetId,
      importSettings: updated?.importSettings,
      materialSlots: updated?.materialSlots,
    },
    activity: `AIがModel「${model.name}」のImport設定を更新しました`,
  };
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

/**
 * The Entity, mesh and Terrain geometry a Terrain tool operates on.
 *
 * Every Terrain tool starts from the same three lookups and the same failure,
 * so they resolve it here rather than each carrying its own copy: a tool that
 * disagreed about which mesh counts as the Terrain would read the geometry one
 * way and write it another.
 */
function requireTerrain(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): {
  entityId: string;
  entity: SceneEntity;
  mesh: Extract<SceneComponent, { type: "mesh" }>;
  terrain: TerrainGeometry;
} {
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const componentId = optionalString(argumentsValue.componentId);
  const entity = requireEntity(context.bundle.scene, entityId);
  const mesh = entity.components.find(
    (component): component is Extract<SceneComponent, { type: "mesh" }> =>
      component.type === "mesh" &&
      (componentId === undefined || component.id === componentId),
  );
  const terrain = mesh ? getTerrainGeometry(mesh) : undefined;
  if (!mesh || !terrain) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_NOT_FOUND",
      "指定されたEntityにTerrainが見つかりません",
      { entityId, ...(componentId ? { componentId } : {}) },
    );
  }
  return { entityId, entity, mesh, terrain };
}

function getTerrain(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const { entityId, entity, mesh, terrain } = requireTerrain(
    context,
    argumentsValue,
  );
  const range = terrainHeightRange(terrain);
  return unchanged(
    context,
    {
      entityId,
      componentId: mesh.id,
      name: entity.name,
      width: terrain.width,
      depth: terrain.depth,
      resolution: terrain.resolution,
      sampleCount: terrain.heights.length,
      holeCellCount: terrain.holes?.filter(Boolean).length ?? 0,
      minHeight: range.min,
      maxHeight: range.max,
      materialAssetId: mesh.materialBindings[0]?.materialAssetId ?? null,
      grass: (terrain.grass ?? []).map((layer) =>
        describeTerrainGrassLayer(terrain, layer),
      ),
    },
    `Terrain「${entity.name}」の概要を取得しました`,
  );
}

function createTerrain(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const width = terrainMcpNumber(
    argumentsValue.width,
    "width",
    16,
    TERRAIN_SIZE_MIN,
    TERRAIN_SIZE_MAX,
  );
  const depth = terrainMcpNumber(
    argumentsValue.depth,
    "depth",
    16,
    TERRAIN_SIZE_MIN,
    TERRAIN_SIZE_MAX,
  );
  const resolution = terrainMcpNumber(
    argumentsValue.resolution,
    "resolution",
    33,
    TERRAIN_RESOLUTION_MIN,
    TERRAIN_RESOLUTION_MAX,
    true,
  );
  const position = optionalVec3(argumentsValue.position, "position");
  const name = optionalString(argumentsValue.name);
  if (name !== undefined && name.length > 100) {
    invalidArgument("name", "a string up to 100 characters");
  }
  const requestedMaterialAssetId = optionalString(argumentsValue.materialAssetId);
  const materialAssetId =
    requestedMaterialAssetId ??
    Object.values(context.bundle.assets.assets).find(
      (asset) => asset.kind === "material",
    )?.id;
  if (!materialAssetId) {
    throw new XriftMcpEditorToolError(
      "NO_MATERIAL_AVAILABLE",
      "ProjectにTerrainへ割り当てられるMaterialがありません",
    );
  }
  const created = addTerrainEntity(
    context.bundle.scene,
    context.bundle.assets,
    materialAssetId,
    { width, depth, resolution, position, name },
  );
  if (!created) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_CREATE_FAILED",
      "指定されたMaterialでTerrainを作成できません",
      { materialAssetId },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: created.scene,
  });
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
      width,
      depth,
      resolution,
      materialAssetId,
      position,
    },
    activity: "AIがTerrainをSceneへ作成しました",
  };
}

function sculptTerrain(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const { entityId, mesh, terrain } = requireTerrain(context, argumentsValue);
  const kind = requiredEnum(argumentsValue.kind, "kind", TERRAIN_BRUSH_KINDS);
  const center = optionalNumberTuple(argumentsValue.center, "center", 2);
  if (!center) invalidArgument("center", "[x, z]");
  const radius = terrainMcpNumber(
    argumentsValue.radius,
    "radius",
    1,
    0.05,
    Math.max(terrain.width, terrain.depth),
  );
  const strength = terrainMcpNumber(
    argumentsValue.strength,
    "strength",
    kind === "smooth" || kind === "flatten" || kind === "stamp" ? 0.5 : 0.8,
    0.001,
    kind === "smooth" || kind === "flatten" || kind === "stamp"
      ? 1
      : TERRAIN_HEIGHT_ABSOLUTE_MAX,
  );
  const targetHeight = optionalFiniteNumber(
    argumentsValue.targetHeight,
    "targetHeight",
  );
  if ((kind === "flatten" || kind === "stamp") && targetHeight === undefined) {
    invalidArgument("targetHeight", "a finite number for flatten or stamp");
  }
  if (
    targetHeight !== undefined &&
    Math.abs(targetHeight) > TERRAIN_HEIGHT_ABSOLUTE_MAX
  ) {
    invalidArgument(
      "targetHeight",
      `a number from -${TERRAIN_HEIGHT_ABSOLUTE_MAX} to ${TERRAIN_HEIGHT_ABSOLUTE_MAX}`,
    );
  }
  const falloff = terrainMcpNumber(argumentsValue.falloff, "falloff", 0.5, 0, 1);
  const operation: TerrainBrushOperation = {
    kind,
    center,
    radius,
    strength,
    falloff,
    ...(targetHeight === undefined ? {} : { targetHeight }),
  };
  const scene = applyTerrainBrushToScene(
    context.bundle.scene,
    entityId,
    operation,
    mesh.id,
  );
  if (scene === context.bundle.scene) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_BRUSH_NO_EFFECT",
      "Terrainの範囲内に有効なブラシ操作を適用できませんでした",
      { entityId, componentId: mesh.id, operation },
    );
  }
  const updatedMesh = scene.entities[entityId]?.components.find(
    (component): component is Extract<SceneComponent, { type: "mesh" }> =>
      component.type === "mesh" && component.id === mesh.id,
  );
  const updatedTerrain = updatedMesh ? getTerrainGeometry(updatedMesh) : undefined;
  const range = updatedTerrain ? terrainHeightRange(updatedTerrain) : null;
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
      componentId: mesh.id,
      operation,
      minHeight: range?.min ?? null,
      maxHeight: range?.max ?? null,
    },
    activity: `AIがTerrainへ${kind}ブラシを適用しました`,
  };
}

function updateTerrain(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const { entityId, entity, mesh, terrain } = requireTerrain(
    context,
    argumentsValue,
  );
  const width = terrainMcpNumber(
    argumentsValue.width,
    "width",
    terrain.width,
    TERRAIN_SIZE_MIN,
    TERRAIN_SIZE_MAX,
  );
  const depth = terrainMcpNumber(
    argumentsValue.depth,
    "depth",
    terrain.depth,
    TERRAIN_SIZE_MIN,
    TERRAIN_SIZE_MAX,
  );
  const resolution = terrainMcpNumber(
    argumentsValue.resolution,
    "resolution",
    terrain.resolution,
    TERRAIN_RESOLUTION_MIN,
    TERRAIN_RESOLUTION_MAX,
    true,
  );
  const scene = resampleTerrainInScene(
    context.bundle.scene,
    entityId,
    { width, depth, resolution },
    mesh.id,
  );
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      { entityId, componentId: mesh.id, width, depth, resolution },
      `Terrain「${entity.name}」はすでに指定の設定です`,
    );
  }
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
      componentId: mesh.id,
      width,
      depth,
      resolution,
    },
    activity: `AIがTerrain「${entity.name}」のサイズと解像度を更新しました`,
  };
}

/**
 * The Material catalogs: skies, water, and the glow tints for light fixtures.
 *
 * `create_custom_shader` accepts arbitrary GLSL, which is the wrong tool for
 * "make this look like a sky": a caller writing one from scratch is inventing
 * numbers the catalog already has, and the result is not the sky an author
 * would have picked from the same menu. The sky and water entries are shader
 * Materials with named, ranged parameters; glow is a tint for the emissive
 * fixtures the primitive catalog places.
 */
function listMaterialPresets(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const describeParameters = (
    parameters: readonly {
      uniform: string;
      label: string;
      hint: string;
      kind: "number" | "color";
      min?: number;
      max?: number;
      step?: number;
    }[],
    defaults: Record<string, number | string>,
  ) =>
    parameters.map((parameter) => ({
      uniform: parameter.uniform,
      label: parameter.label,
      hint: parameter.hint,
      kind: parameter.kind,
      ...(parameter.kind === "number"
        ? { min: parameter.min, max: parameter.max, step: parameter.step }
        : {}),
      default: defaults[parameter.uniform],
    }));
  return unchanged(
    context,
    {
      sky: SKY_SHADER_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        categoryLabel: skyShaderCategoryLabel(entry.category),
        description: entry.description,
        parameters: describeParameters(
          entry.parameters,
          defaultSkyShaderParameterValues(entry),
        ),
      })),
      water: WATER_SHADER_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        parameters: describeParameters(
          entry.parameters,
          defaultWaterShaderParameterValues(entry),
        ),
      })),
      glow: GLOW_MATERIAL_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        tint: preset.tint,
      })),
      // Terrain ground surfaces are their own catalog because they are chosen
      // with a Terrain shape rather than on their own.
      terrainSurfacesIn: "list_terrain_presets",
    },
    "Material presetの一覧を取得しました",
  );
}

const MATERIAL_PRESET_KINDS = ["sky", "water", "glow"] as const;

function createMaterialFromPreset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const kind = requiredEnum(argumentsValue.kind, "kind", MATERIAL_PRESET_KINDS);
  const presetId = requiredString(argumentsValue.presetId, "presetId");

  if (kind === "glow") {
    if (argumentsValue.parameters !== undefined) {
      invalidArgument("parameters", "omitted for a glow preset");
    }
    const preset = getGlowMaterialPreset(presetId);
    if (!preset) {
      throw new XriftMcpEditorToolError(
        "MATERIAL_PRESET_NOT_FOUND",
        "指定されたglow presetが見つかりません",
        {
          presetId,
          presetIds: GLOW_MATERIAL_PRESETS.map((entry) => entry.id),
        },
      );
    }
    const asset = createGlowMaterialAsset(preset);
    const existing = context.bundle.assets.assets[asset.id];
    if (existing?.kind === "material") {
      return unchanged(
        context,
        {
          projectId: context.bundle.project.projectId,
          sceneId: context.bundle.scene.sceneId,
          revision: context.revision,
          kind,
          presetId,
          materialAssetId: asset.id,
          alreadyInstalled: true,
        },
        `glow「${preset.label}」はすでにProjectにあります`,
      );
    }
    const assets = {
      ...context.bundle.assets,
      assets: { ...context.bundle.assets.assets, [asset.id]: asset },
    };
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
        kind,
        presetId,
        materialAssetId: asset.id,
        alreadyInstalled: false,
      },
      activity: `AIがglow Material「${preset.label}」を追加しました`,
    };
  }

  const entry =
    kind === "sky"
      ? getSkyShaderCatalogEntry(presetId)
      : getWaterShaderCatalogEntry(presetId);
  if (!entry) {
    throw new XriftMcpEditorToolError(
      "MATERIAL_PRESET_NOT_FOUND",
      "指定されたMaterial presetが見つかりません",
      {
        kind,
        presetId,
        presetIds: (kind === "sky"
          ? SKY_SHADER_CATALOG
          : WATER_SHADER_CATALOG
        ).map((candidate) => candidate.id),
      },
    );
  }
  const values =
    kind === "sky"
      ? defaultSkyShaderParameterValues(entry as SkyShaderCatalogEntry)
      : defaultWaterShaderParameterValues(entry as WaterShaderCatalogEntry);
  if (argumentsValue.parameters !== undefined) {
    const supplied = recordValue(argumentsValue.parameters, "parameters");
    assertObjectKeys(
      supplied,
      "parameters",
      entry.parameters.map((parameter) => parameter.uniform),
    );
    for (const parameter of entry.parameters) {
      const value = supplied[parameter.uniform];
      if (value === undefined) continue;
      if (parameter.kind === "number") {
        values[parameter.uniform] = terrainMcpNumber(
          value,
          `parameters.${parameter.uniform}`,
          parameter.min,
          parameter.min,
          parameter.max,
        );
        continue;
      }
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
        invalidArgument(`parameters.${parameter.uniform}`, "a #rrggbb colour");
      }
      values[parameter.uniform] = value.toLowerCase();
    }
  }
  const installed =
    kind === "sky"
      ? applySkyShaderCatalogInstall(
          context.bundle.assets,
          entry as SkyShaderCatalogEntry,
          values,
        )
      : applyWaterShaderCatalogInstall(
          context.bundle.assets,
          entry as WaterShaderCatalogEntry,
          values,
        );
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: installed.manifest,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: installed.primaryAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      kind,
      presetId,
      materialAssetId: installed.primaryAssetId,
      alreadyInstalled: installed.alreadyInstalled,
      parameters: values,
      // A sky Material only becomes the sky once the Scene points at it, and
      // water is a Material on a plane. Neither happens here.
      nextStep:
        kind === "sky"
          ? "update_scene_settings の skybox でこのMaterialを指定してください"
          : "set_material で板ポリなどのMesh slotへ割り当ててください",
    },
    activity: `AIが${kind === "sky" ? "Skybox" : "Water"} Material「${entry.label}」を追加しました`,
  };
}

const TEXTURE_CARD_PROFILES = [
  "backdrop-flat",
  "backdrop-arc-180",
  "backdrop-arc-270",
  "grass-single",
  "grass-cross",
] as const;

/**
 * A cut-out card from a transparent Texture: a distant backdrop, or grass.
 *
 * Assembling one by hand means a plane, an alpha-blended two-sided Material,
 * no collider, and for the arcs a fan of segments that meet without seams —
 * four or five calls whose settings have to agree. The single call keeps the
 * Material and the Entity in one transaction, so an undone card does not leave
 * its Material behind.
 */
function createTextureCardTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const textureAssetId = requiredString(
    argumentsValue.textureAssetId,
    "textureAssetId",
  );
  const profile = requiredEnum(
    argumentsValue.profile,
    "profile",
    TEXTURE_CARD_PROFILES,
  );
  const created = createTextureCard(context.bundle.scene, context.bundle.assets, {
    textureAssetId,
    materialId: createDocumentId("material-card"),
    profile,
  });
  if (!created.created) {
    throw new XriftMcpEditorToolError(
      created.reason === "texture-missing"
        ? "TEXTURE_NOT_FOUND"
        : created.reason === "environment-texture"
          ? "ASSET_KIND_MISMATCH"
          : "TEXTURE_CARD_CREATE_FAILED",
      created.reason === "texture-missing"
        ? "指定されたTexture Assetが見つかりません"
        : created.reason === "environment-texture"
          ? "環境Textureは遠景・草カードに使用できません"
          : "カードを作成できませんでした",
      { textureAssetId, profile, reason: created.reason },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: created.assets,
    scene: created.scene,
  });
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
      textureAssetId,
      profile,
      entityId: created.entityId,
      entityName: created.entityName,
      materialAssetId: created.materialId,
    },
    activity: `AIが「${created.entityName}」をSceneへ作成しました`,
  };
}

/**
 * The ready-made sets: a campfire, a well, a stairway, a recording studio.
 *
 * Each recipe is a small subtree with its lights, particles and materials
 * already agreeing with one another. Built part by part from primitives the
 * result is recognisably worse, and takes a dozen tool calls to get there, so
 * a caller that cannot see this catalog reaches for the harder path by default.
 *
 * `note` is what the author still has to do themselves after placing, and it
 * is carried through rather than dropped: it is the difference between a set
 * that works and one that looks placed and does nothing.
 */
function listSceneRecipes(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const projectKind = context.bundle.project.projectKind;
  const recipes = getSceneRecipesForProjectKind(projectKind);
  return unchanged(
    context,
    {
      projectKind,
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        category: recipe.category,
        categoryLabel: SCENE_RECIPE_CATEGORY_LABELS[recipe.category],
        note: recipe.note,
        partCount: recipe.parts.length,
        partKinds: [...new Set(recipe.parts.map((part) => part.kind))],
      })),
      count: recipes.length,
      categories: Object.entries(SCENE_RECIPE_CATEGORY_LABELS).map(
        ([id, label]) => ({ id, label }),
      ),
    },
    "3Dセットの一覧を取得しました",
  );
}

/**
 * The shaped Terrains and the ground surfaces an author can start from.
 *
 * `create_terrain` makes a flat plate, which is the right primitive and the
 * wrong starting point: the Create menu offers eight shaped presets and a
 * surface catalog, and a caller with only the primitive had to sculpt a valley
 * one brush stamp at a time. Both catalogs come back together because the two
 * choices are made together — a shape and what it is made of.
 */
function listTerrainPresets(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  return unchanged(
    context,
    {
      presets: TERRAIN_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        width: preset.width,
        depth: preset.depth,
        resolution: preset.resolution,
        grassPresetId: preset.grassPresetId,
      })),
      surfaces: TERRAIN_SURFACE_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        description: entry.description,
        parameters: entry.parameters.map((parameter) => ({
          uniform: parameter.uniform,
          label: parameter.label,
          hint: parameter.hint,
          kind: parameter.kind,
          ...(parameter.kind === "number"
            ? { min: parameter.min, max: parameter.max, step: parameter.step }
            : {}),
          default: defaultTerrainSurfaceParameterValues(entry)[
            parameter.uniform
          ],
        })),
      })),
      catalogRevision: TERRAIN_SURFACE_CATALOG_REVISION,
    },
    "Terrainのpresetと表面カタログを取得しました",
  );
}

function createTerrainFromPresetTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const presetId = requiredString(argumentsValue.presetId, "presetId");
  const preset = getTerrainPreset(presetId);
  if (!preset) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_PRESET_NOT_FOUND",
      "指定されたTerrain presetが見つかりません",
      { presetId, presetIds: TERRAIN_PRESETS.map((entry) => entry.id) },
    );
  }
  // `undefined` keeps the preset's own grass; an explicit null places it bare.
  const hasGrassOverride = Object.prototype.hasOwnProperty.call(
    argumentsValue,
    "grassPresetId",
  );
  const grassPresetId = hasGrassOverride
    ? optionalNullableString(argumentsValue.grassPresetId, "grassPresetId")
    : undefined;
  if (grassPresetId && !getTerrainGrassPreset(grassPresetId)) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_GRASS_PRESET_NOT_FOUND",
      "指定された草のセットが見つかりません",
      { grassPresetId },
    );
  }
  const geometry = createTerrainFromPreset(preset, grassPresetId);
  const requestedMaterialAssetId = optionalString(
    argumentsValue.materialAssetId,
  );
  const materialAssetId =
    requestedMaterialAssetId ??
    Object.values(context.bundle.assets.assets).find(
      (asset) => asset.kind === "material",
    )?.id;
  if (!materialAssetId) {
    throw new XriftMcpEditorToolError(
      "NO_MATERIAL_AVAILABLE",
      "ProjectにTerrainへ割り当てられるMaterialがありません",
    );
  }
  // Two Terrains over the same ground are two nearly coplanar surfaces that
  // tear into moire bands, so a new one lands clear of the existing row unless
  // the caller places it deliberately.
  const position =
    optionalVec3(argumentsValue.position, "position") ??
    nextTerrainPosition(
      collectTerrainFootprintsForMcp(context.bundle.scene),
      geometry.width || DEFAULT_TERRAIN_SPAN,
    );
  const created = addTerrainEntity(
    context.bundle.scene,
    context.bundle.assets,
    materialAssetId,
    { ...geometry, name: preset.label, position },
  );
  if (!created) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_CREATE_FAILED",
      "指定されたMaterialでTerrainを作成できません",
      { materialAssetId },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: created.scene,
  });
  const overlaps = findTerrainOverlaps(
    collectTerrainFootprintsForMcp(created.scene),
  );
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
      presetId,
      grassPresetId: grassPresetId ?? preset.grassPresetId,
      width: geometry.width,
      depth: geometry.depth,
      resolution: geometry.resolution,
      position,
      materialAssetId,
      // Reported rather than blocked: an author may want two Terrains meeting
      // on purpose, but they should never find out from the moire.
      overlappingTerrainCount: overlaps.length,
    },
    activity: `AIがTerrain preset「${preset.label}」をSceneへ配置しました`,
  };
}

/**
 * Paints a Terrain's ground with one of the catalog's height/slope surfaces.
 *
 * The preset's height bands are metres, and a Terrain may span two of them or
 * eighty. Applied unchanged, every edge would fall outside the range and the
 * ground would come out one flat colour, which reads as a broken shader rather
 * than a mistuned one — so the bands are fitted to this Terrain's own range
 * unless the caller supplies values.
 */
function applyTerrainSurface(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const surfaceId = requiredString(argumentsValue.surfaceId, "surfaceId");
  const entry = getTerrainSurfacePreset(surfaceId);
  if (!entry) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_SURFACE_NOT_FOUND",
      "指定された表面presetが見つかりません",
      {
        surfaceId,
        surfaceIds: TERRAIN_SURFACE_CATALOG.map((candidate) => candidate.id),
      },
    );
  }
  const fitted = fitTerrainSurfaceToRange(
    entry,
    terrainHeightRange(target.terrain),
  );
  const values = { ...fitted };
  if (argumentsValue.parameters !== undefined) {
    const supplied = recordValue(argumentsValue.parameters, "parameters");
    assertObjectKeys(
      supplied,
      "parameters",
      entry.parameters.map((parameter) => parameter.uniform),
    );
    for (const parameter of entry.parameters) {
      const value = supplied[parameter.uniform];
      if (value === undefined) continue;
      if (parameter.kind === "number") {
        values[parameter.uniform] = terrainMcpNumber(
          value,
          `parameters.${parameter.uniform}`,
          parameter.min,
          parameter.min,
          parameter.max,
        );
        continue;
      }
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
        invalidArgument(`parameters.${parameter.uniform}`, "a #rrggbb colour");
      }
      values[parameter.uniform] = value.toLowerCase();
    }
  }
  const installed = applyTerrainSurfaceCatalogInstall(
    context.bundle.assets,
    entry,
    values,
  );
  const scene = setMeshMaterialBinding(
    context.bundle.scene,
    installed.manifest,
    target.entityId,
    TERRAIN_MATERIAL_SLOT,
    installed.primaryAssetId,
    target.mesh.id,
  );
  const assetsChanged = installed.manifest !== context.bundle.assets;
  if (scene === context.bundle.scene && !assetsChanged) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId: target.entityId,
        componentId: target.mesh.id,
        surfaceId,
        materialAssetId: installed.primaryAssetId,
        parameters: values,
      },
      `Terrainの表面はすでに「${entry.label}」です`,
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: installed.manifest,
    scene,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: target.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: target.entityId,
      componentId: target.mesh.id,
      surfaceId,
      // The surface lands as a normal Material, so it can be retuned with the
      // Material tools afterwards rather than only through this catalog.
      materialAssetId: installed.primaryAssetId,
      parameters: values,
    },
    activity: `AIがTerrain「${target.entity.name}」の表面へ「${entry.label}」を適用しました`,
  };
}

/** Footprints as the Terrain layout helpers expect them. */
function collectTerrainFootprintsForMcp(
  scene: SceneDocument,
): TerrainFootprint[] {
  const footprints: TerrainFootprint[] = [];
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      const terrain = getTerrainGeometry(component);
      if (!terrain) continue;
      const transform = entity.components.find(
        (candidate): candidate is Extract<SceneComponent, { type: "transform" }> =>
          candidate.type === "transform",
      );
      footprints.push({
        entityId: entity.id,
        name: entity.name,
        centerX: transform?.position?.[0] ?? 0,
        centerZ: transform?.position?.[2] ?? 0,
        width: terrain.width,
        depth: terrain.depth,
      });
    }
  }
  return footprints;
}

/**
 * What is actually at a point on a Terrain.
 *
 * Placement over MCP had no way to ask: a caller could sculpt a hill and then
 * put a bench at y=0 through the middle of it, because the document records
 * heights as a flat array the caller cannot index into meaningfully. Height,
 * slope, holes and grass coverage are the four things that decide whether a
 * spot is usable, so they are answered together rather than one tool each.
 */
function sampleTerrainPoint(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const target = requireTerrain(context, argumentsValue);
  const point = optionalNumberTuple(argumentsValue.point, "point", 2);
  if (!point) invalidArgument("point", "[x, z] in Terrain-local metres");
  const { terrain } = target;
  const [localX, localZ] = point;
  const insideFootprint =
    Math.abs(localX) <= terrain.width / 2 + 1e-6 &&
    Math.abs(localZ) <= terrain.depth / 2 + 1e-6;
  const height = sampleTerrainHeight(terrain, localX, localZ);
  const cells = terrain.resolution - 1;
  const cellX = Math.min(
    Math.max(
      Math.floor(((localX + terrain.width / 2) / terrain.width) * cells),
      0,
    ),
    cells - 1,
  );
  const cellZ = Math.min(
    Math.max(
      Math.floor(((localZ + terrain.depth / 2) / terrain.depth) * cells),
      0,
    ),
    cells - 1,
  );
  const worldMatrix = entityWorldMatrix(context.bundle.scene, target.entityId);
  return unchanged(
    context,
    {
      entityId: target.entityId,
      componentId: target.mesh.id,
      point: [localX, localZ],
      // Outside the footprint the height field is clamped to its edge, so the
      // answer is the rim rather than the ground under the caller's point.
      insideFootprint,
      height,
      localPosition: [localX, height, localZ],
      worldPosition: transformPointByMatrix(worldMatrix, [
        localX,
        height,
        localZ,
      ]),
      slopeDegrees: sampleTerrainSlopeDegrees(terrain, localX, localZ),
      hole: terrainCellHasHole(terrain, cellX, cellZ),
      grass: (terrain.grass ?? []).map((layer) => ({
        id: layer.id,
        typeId: layer.typeId,
        coverage: sampleTerrainGrassMask(terrain, layer.mask, localX, localZ),
      })),
    },
    `Terrain「${target.entity.name}」の地点を取得しました`,
  );
}

/**
 * The axis-aligned world box of an Entity, and the size the caller never had.
 *
 * `get_entity_components` returns a Transform and no extent, so anything
 * reasoning about the Scene from MCP alone has been placing things without
 * knowing how big they are. `unmeasured` names the Entities whose Mesh could
 * not be resolved — a Model imported before its metadata existed — because
 * silently leaving one out of the union reads as "small", not as "unknown".
 */
function getEntityBounds(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const entity = requireEntity(context.bundle.scene, entityId);
  const includeDescendants =
    optionalBoolean(argumentsValue.includeDescendants, "includeDescendants") ??
    true;
  const bounds = getEntityWorldBounds(
    context.bundle.scene,
    context.bundle.assets,
    entityId,
    { includeDescendants },
  );
  return unchanged(
    context,
    {
      entityId,
      name: entity.name,
      includeDescendants,
      world: bounds.world,
      local: bounds.local,
      worldPosition: transformPointByMatrix(
        entityWorldMatrix(context.bundle.scene, entityId),
        [0, 0, 0],
      ),
      measuredEntityIds: bounds.measured,
      unmeasuredEntityIds: bounds.unmeasured,
    },
    bounds.world
      ? `Entity「${entity.name}」のboundsを取得しました`
      : `Entity「${entity.name}」に測れるgeometryがありません`,
  );
}

/**
 * Terrain grass over MCP.
 *
 * The Inspector's grass panel is the one Terrain feature an agent could not
 * reach: it could raise ground and cut holes, but a Terrain it built arrived
 * bare, and the author had to finish it by hand. These tools mirror the panel
 * one operation at a time — the catalog, a preset, a layer, a stroke — rather
 * than taking a whole grass array, so a partially wrong request fails on the
 * field that is wrong instead of replacing a tuned stack with a guess.
 */

/** The Inspector's density slider ceiling, in blades per square metre. */
const TERRAIN_GRASS_DENSITY_MAX = 40;

/**
 * How far a layer's height band may reach.
 *
 * The presets use ±1000 to mean "every altitude", which is far outside the
 * ±256 a Terrain can actually be sculpted to, so the band is bounded by that
 * sentinel rather than by the height limit.
 */
const TERRAIN_GRASS_BAND_LIMIT = 1000;

const TERRAIN_GRASS_APPEARANCE_RANGES = {
  colorVariation: [0, 1],
  heightScale: [0.2, 4],
  widthScale: [0.2, 4],
  fill: [0, 1],
} as const;

/** A layer with no seed gets one from its id, so no two share a field. */
function terrainGrassSeedFromId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_147_483_647;
}

/**
 * What a layer looks like to a caller.
 *
 * The stored layer is rules, not blades, so the numbers that matter to an
 * agent — the colours it will actually be drawn with, and how many blades the
 * density buys on this Terrain — are resolved here rather than left for the
 * caller to work out from the catalog.
 */
function describeTerrainGrassLayer(
  terrain: TerrainGeometry,
  layer: TerrainGrassLayer,
): Record<string, unknown> {
  const type = getTerrainGrassType(layer.typeId);
  const area = Math.max(terrain.width, 0) * Math.max(terrain.depth, 0);
  const requested = Math.max(0, Math.floor(area * Math.max(layer.density, 0)));
  return {
    id: layer.id,
    typeId: layer.typeId,
    typeLabel: type?.label ?? null,
    density: layer.density,
    heightRange: [...layer.heightRange],
    slopeLimitDegrees: layer.slopeLimitDegrees,
    seed: layer.seed,
    appearance: layer.appearance ? { ...layer.appearance } : null,
    resolvedAppearance: type
      ? resolveTerrainGrassAppearance(type, layer.appearance)
      : null,
    painted: layer.mask !== undefined,
    estimatedBlades: Math.min(requested, TERRAIN_GRASS_MAX_INSTANCES),
    clampedByInstanceLimit: requested > TERRAIN_GRASS_MAX_INSTANCES,
  };
}

function requireTerrainGrassLayer(
  terrain: TerrainGeometry,
  entityId: string,
  layerId: string,
): { layers: readonly TerrainGrassLayer[]; index: number } {
  const layers = terrain.grass ?? [];
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_GRASS_LAYER_NOT_FOUND",
      "指定された草のレイヤーが見つかりません",
      { entityId, layerId, layerIds: layers.map((layer) => layer.id) },
    );
  }
  return { layers, index };
}

/** Writes a layer stack back through the same Scene boundary the Inspector uses. */
function commitTerrainGrass(
  context: XriftMcpEditorContext,
  target: { entityId: string; entity: SceneEntity; mesh: { id: string } },
  layers: readonly TerrainGrassLayer[],
  result: Record<string, unknown>,
  activity: string,
): XriftMcpEditorToolOutcome {
  const scene = setTerrainGrassLayersInScene(
    context.bundle.scene,
    target.entityId,
    layers,
    target.mesh.id,
  );
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: target.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: target.entityId,
      componentId: target.mesh.id,
      ...result,
    },
    activity,
  };
}

function listTerrainGrassTypes(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  return unchanged(
    context,
    {
      types: TERRAIN_GRASS_TYPES.map((type) => ({
        id: type.id,
        label: type.label,
        description: type.description,
        height: type.height,
        width: type.width,
        cullDistance: type.cullDistance,
        baseColor: type.baseColor,
        tipColor: type.tipColor,
        colorVariation: type.colorVariation,
        clumpSize: type.clumpSize,
        clumpRadius: type.clumpRadius,
      })),
      presets: TERRAIN_GRASS_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        layers: preset.layers.map((layer) => ({
          typeId: layer.typeId,
          density: layer.density,
          heightRange: [...layer.heightRange],
          slopeLimitDegrees: layer.slopeLimitDegrees,
        })),
      })),
      limits: {
        densityMax: TERRAIN_GRASS_DENSITY_MAX,
        slopeLimitDegreesMax: 90,
        heightBandLimit: TERRAIN_GRASS_BAND_LIMIT,
        maxInstancesPerLayer: TERRAIN_GRASS_MAX_INSTANCES,
        defaultFill: TERRAIN_GRASS_DEFAULT_FILL,
        appearance: TERRAIN_GRASS_APPEARANCE_RANGES,
      },
    },
    "Terrainの草の種類とセットを取得しました",
  );
}

function applyTerrainGrassPreset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const presetId = requiredString(argumentsValue.presetId, "presetId");
  const preset = getTerrainGrassPreset(presetId);
  if (!preset) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_GRASS_PRESET_NOT_FOUND",
      "指定された草のセットが見つかりません",
      { presetId, presetIds: TERRAIN_GRASS_PRESETS.map((entry) => entry.id) },
    );
  }
  // The Inspector's "セットを適用" replaces the stack rather than appending to
  // it: a preset is a whole look, and layering two of them is what produced
  // the unreadably dense fields this button exists to avoid.
  const layers = createTerrainGrassLayers(preset);
  return commitTerrainGrass(
    context,
    target,
    layers,
    {
      presetId,
      grass: layers.map((layer) =>
        describeTerrainGrassLayer(target.terrain, layer),
      ),
    },
    `AIがTerrain「${target.entity.name}」へ草のセット「${preset.label}」を適用しました`,
  );
}

function addTerrainGrassLayer(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const typeId = requiredEnum(
    argumentsValue.typeId,
    "typeId",
    TERRAIN_GRASS_TYPES.map((type) => type.id),
  ) as TerrainGrassTypeId;
  const id = createDocumentId("grass-layer");
  const layer: TerrainGrassLayer = {
    id,
    typeId,
    density: terrainMcpNumber(
      argumentsValue.density,
      "density",
      4,
      0,
      TERRAIN_GRASS_DENSITY_MAX,
    ),
    heightRange: terrainGrassHeightRange(argumentsValue.heightRange),
    slopeLimitDegrees: terrainMcpNumber(
      argumentsValue.slopeLimitDegrees,
      "slopeLimitDegrees",
      40,
      0,
      90,
    ),
    seed: terrainMcpNumber(
      argumentsValue.seed,
      "seed",
      terrainGrassSeedFromId(id),
      0,
      2_147_483_647,
      true,
    ),
  };
  const withAppearance =
    argumentsValue.appearance === undefined
      ? layer
      : applyTerrainGrassAppearance(
          layer,
          terrainGrassAppearancePatch(argumentsValue.appearance, "appearance"),
        );
  if (!isTerrainGrassLayer(withAppearance)) {
    invalidArgument("appearance", "a usable grass appearance override");
  }
  const layers = [...(target.terrain.grass ?? []), withAppearance];
  return commitTerrainGrass(
    context,
    target,
    layers,
    {
      layerId: id,
      layer: describeTerrainGrassLayer(target.terrain, withAppearance),
      layerCount: layers.length,
    },
    `AIがTerrain「${target.entity.name}」へ草のレイヤーを追加しました`,
  );
}

function updateTerrainGrassLayer(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const layerId = requiredString(argumentsValue.layerId, "layerId");
  const { layers, index } = requireTerrainGrassLayer(
    target.terrain,
    target.entityId,
    layerId,
  );
  const current = layers[index];
  const patch = componentPatchRecord(argumentsValue.patch);
  assertObjectKeys(patch, "patch", [
    "typeId",
    "density",
    "heightRange",
    "slopeLimitDegrees",
    "seed",
    "appearance",
    "mask",
  ]);
  let next: TerrainGrassLayer = {
    ...current,
    ...(patch.typeId === undefined
      ? {}
      : {
          typeId: requiredEnum(
            patch.typeId,
            "patch.typeId",
            TERRAIN_GRASS_TYPES.map((type) => type.id),
          ) as TerrainGrassTypeId,
        }),
    ...(patch.density === undefined
      ? {}
      : {
          density: terrainMcpNumber(
            patch.density,
            "patch.density",
            current.density,
            0,
            TERRAIN_GRASS_DENSITY_MAX,
          ),
        }),
    ...(patch.heightRange === undefined
      ? {}
      : {
          heightRange: terrainGrassHeightRange(
            patch.heightRange,
            "patch.heightRange",
          ),
        }),
    ...(patch.slopeLimitDegrees === undefined
      ? {}
      : {
          slopeLimitDegrees: terrainMcpNumber(
            patch.slopeLimitDegrees,
            "patch.slopeLimitDegrees",
            current.slopeLimitDegrees,
            0,
            90,
          ),
        }),
    ...(patch.seed === undefined
      ? {}
      : {
          seed: terrainMcpNumber(
            patch.seed,
            "patch.seed",
            current.seed,
            0,
            2_147_483_647,
            true,
          ),
        }),
  };
  if (patch.appearance !== undefined) {
    next = applyTerrainGrassAppearance(
      next,
      // `null` is the whole override going away, which is not the same as an
      // absent field: it takes the layer back to its type's colours.
      patch.appearance === null
        ? {}
        : terrainGrassAppearancePatch(patch.appearance, "patch.appearance"),
    );
  }
  if (patch.mask !== undefined) {
    if (patch.mask !== null) {
      invalidArgument("patch.mask", "null to clear the painted coverage");
    }
    const { mask: _dropped, ...rest } = next;
    next = rest;
  }
  if (!isTerrainGrassLayer(next)) {
    invalidArgument("patch", "a usable grass layer");
  }
  // Draw order is what decides which layer a blade of another sits behind, so
  // moving a layer belongs with editing it rather than in a tool of its own.
  const moveTo = optionalNonNegativeInteger(argumentsValue.index, "index");
  let nextLayers = layers.map((layer, at) => (at === index ? next : layer));
  if (moveTo !== undefined) {
    if (moveTo >= layers.length) {
      invalidArgument("index", `an integer from 0 to ${layers.length - 1}`);
    }
    const moved = [...nextLayers];
    moved.splice(index, 1);
    moved.splice(moveTo, 0, next);
    nextLayers = moved;
  }
  if (JSON.stringify(nextLayers) === JSON.stringify(layers)) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId: target.entityId,
        componentId: target.mesh.id,
        layerId,
        layer: describeTerrainGrassLayer(target.terrain, current),
      },
      "草のレイヤーはすでに指定された状態です",
    );
  }
  return commitTerrainGrass(
    context,
    target,
    nextLayers,
    {
      layerId,
      layer: describeTerrainGrassLayer(target.terrain, next),
      order: nextLayers.map((layer) => layer.id),
    },
    `AIがTerrain「${target.entity.name}」の草のレイヤーを更新しました`,
  );
}

function deleteTerrainGrassLayer(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const layerId = requiredString(argumentsValue.layerId, "layerId");
  const { layers } = requireTerrainGrassLayer(
    target.terrain,
    target.entityId,
    layerId,
  );
  const nextLayers = layers.filter((layer) => layer.id !== layerId);
  return commitTerrainGrass(
    context,
    target,
    nextLayers,
    { layerId, layerCount: nextLayers.length },
    `AIがTerrain「${target.entity.name}」の草のレイヤーを削除しました`,
  );
}

function paintTerrainGrass(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const target = requireTerrain(context, argumentsValue);
  const layerId = requiredString(argumentsValue.layerId, "layerId");
  requireTerrainGrassLayer(target.terrain, target.entityId, layerId);
  const mode = requiredEnum(
    argumentsValue.mode,
    "mode",
    TERRAIN_GRASS_BRUSH_MODES,
  );
  const center = optionalNumberTuple(argumentsValue.center, "center", 2);
  if (!center) invalidArgument("center", "[x, z]");
  const radius = terrainMcpNumber(
    argumentsValue.radius,
    "radius",
    1,
    0.05,
    Math.max(target.terrain.width, target.terrain.depth),
  );
  const strength = terrainMcpNumber(
    argumentsValue.strength,
    "strength",
    0.5,
    0.001,
    1,
  );
  const operation = {
    kind: mode === "paint" ? ("grass-paint" as const) : ("grass-erase" as const),
    center,
    radius,
    strength,
    grassLayerId: layerId,
  };
  const scene = applyTerrainBrushToScene(
    context.bundle.scene,
    target.entityId,
    operation,
    target.mesh.id,
  );
  if (scene === context.bundle.scene) {
    throw new XriftMcpEditorToolError(
      "TERRAIN_BRUSH_NO_EFFECT",
      "Terrainの範囲内に有効な草のブラシ操作を適用できませんでした",
      { entityId: target.entityId, componentId: target.mesh.id, operation },
    );
  }
  const updatedMesh = scene.entities[target.entityId]?.components.find(
    (component): component is Extract<SceneComponent, { type: "mesh" }> =>
      component.type === "mesh" && component.id === target.mesh.id,
  );
  const updatedTerrain = updatedMesh ? getTerrainGeometry(updatedMesh) : undefined;
  const updatedLayer = updatedTerrain?.grass?.find(
    (layer) => layer.id === layerId,
  );
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: target.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: target.entityId,
      componentId: target.mesh.id,
      layerId,
      operation,
      layer:
        updatedTerrain && updatedLayer
          ? describeTerrainGrassLayer(updatedTerrain, updatedLayer)
          : null,
    },
    activity: `AIがTerrainの草へ${mode}ブラシを適用しました`,
  };
}

function terrainGrassHeightRange(
  value: unknown,
  name = "heightRange",
): [number, number] {
  const range = optionalNumberTuple(value, name, 2);
  if (!range) return [-TERRAIN_GRASS_BAND_LIMIT, TERRAIN_GRASS_BAND_LIMIT];
  const [low, high] = range;
  if (
    Math.abs(low) > TERRAIN_GRASS_BAND_LIMIT ||
    Math.abs(high) > TERRAIN_GRASS_BAND_LIMIT
  ) {
    invalidArgument(
      name,
      `two numbers from -${TERRAIN_GRASS_BAND_LIMIT} to ${TERRAIN_GRASS_BAND_LIMIT}`,
    );
  }
  return [Math.min(low, high), Math.max(low, high)];
}

/**
 * One appearance change, with `null` meaning "back to the type" per field.
 *
 * Absent and null have to differ here: an absent field leaves whatever the
 * author already tuned alone, while a null clears that one override without
 * touching the rest of them.
 */
function terrainGrassAppearancePatch(
  value: unknown,
  name: string,
): TerrainGrassAppearance {
  const record = recordValue(value, name);
  const change: TerrainGrassAppearance = {};
  for (const key of ["baseColor", "tipColor"] as const) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const entry = record[key];
    if (entry === null) {
      change[key] = undefined;
      continue;
    }
    if (typeof entry !== "string" || !/^#[0-9a-f]{6}$/i.test(entry)) {
      invalidArgument(`${name}.${key}`, "a #rrggbb colour, or null to clear");
    }
    change[key] = entry;
  }
  for (const [key, [low, high]] of Object.entries(
    TERRAIN_GRASS_APPEARANCE_RANGES,
  ) as ReadonlyArray<
    [keyof typeof TERRAIN_GRASS_APPEARANCE_RANGES, readonly [number, number]]
  >) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const entry = record[key];
    if (entry === null) {
      change[key] = undefined;
      continue;
    }
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < low || entry > high) {
      invalidArgument(`${name}.${key}`, `a number from ${low} to ${high}, or null to clear`);
    }
    change[key] = entry;
  }
  const unsupported = Object.keys(record).find(
    (key) =>
      key !== "baseColor" &&
      key !== "tipColor" &&
      !(key in TERRAIN_GRASS_APPEARANCE_RANGES),
  );
  if (unsupported) {
    invalidArgument(`${name}.${unsupported}`, "a supported appearance field");
  }
  return change;
}

/**
 * The Entities and Components an Interaction Trigger action can be pointed at.
 *
 * The node editor builds its target pickers from this, and an agent writing a
 * trigger graph needs the same list: the property names a `xrift/interaction`
 * action may write are per Component kind, so guessing one produces a graph
 * that validates and then does nothing.
 */
function listInteractionTriggerTargets(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const targets = collectInteractionTriggerTargets(context.bundle.scene, context.bundle.assets);
  return unchanged(
    context,
    {
      targets: targets.map((target) => ({
        entityId: target.entityId,
        name: target.name,
        path: target.path,
        components: target.components.map((component) => ({
          componentId: component.componentId,
          targetKind: component.targetKind,
          label: component.label,
          properties: component.properties.map((property) => ({
            name: property.name,
            label: property.label,
            description: property.description,
            kind: property.kind,
            defaultValue: property.defaultValue,
            ...(property.min === undefined ? {} : { min: property.min }),
            ...(property.max === undefined ? {} : { max: property.max }),
            ...(property.step === undefined ? {} : { step: property.step }),
            ...(property.options
              ? { options: property.options.map((option) => ({ ...option })) }
              : {}),
            // An Asset property is configured with `valueAssetId`, not `value`,
            // and only accepts these kinds. Saying so here is what keeps a
            // client from writing a graph that validates and does nothing.
            ...(property.assetKinds
              ? { assetKinds: [...property.assetKinds], argument: "valueAssetId" }
              : {}),
            ...(property.kind === "string" ? { argument: "text" } : {}),
          })),
        })),
      })),
      count: targets.length,
    },
    "Interaction Triggerの対象一覧を取得しました",
  );
}

function terrainMcpNumber(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  const number = optionalFiniteNumber(value, name) ?? fallback;
  if (
    number < minimum ||
    number > maximum ||
    (integer && !Number.isInteger(number))
  ) {
    invalidArgument(
      name,
      `${integer ? "integer" : "number"} from ${minimum} to ${maximum}`,
    );
  }
  return number;
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

function createPrefab(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const entity = requireEntity(context.bundle.scene, entityId);
  const name =
    argumentsValue.name === undefined
      ? `${entity.name} Prefab`
      : requiredString(argumentsValue.name, "name");
  if (name.length > 100) invalidArgument("name", "100文字以内の文字列");

  const prefabId = createDocumentId("prefab");
  const prefabAssetId = createDocumentId("asset-prefab");
  const prefabPath = `prefabs/${prefabId}.prefab.json`;
  const created = createPrefabDocument(context.bundle.scene, context.bundle.assets, {
    prefabId,
    name,
    sourceRootEntityIds: [entityId],
  });
  if (!created) {
    throw new XriftMcpEditorToolError(
      "PREFAB_CREATE_FAILED",
      "指定されたEntityからPrefabを作成できませんでした",
      { entityId },
    );
  }
  const added = addPrefabAsset(context.bundle.assets, {
    id: prefabAssetId,
    name,
    prefabPath,
  });
  if (!added.added) {
    throw new XriftMcpEditorToolError(
      "PREFAB_CREATE_FAILED",
      "Prefab AssetをProjectへ追加できませんでした",
      { prefabAssetId, reason: added.reason },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    assets: added.manifest,
    prefabs: {
      ...context.bundle.prefabs,
      [prefabId]: created.document,
    },
  });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: prefabAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      prefabId,
      prefabAssetId,
      name,
      prefabPath,
      document: created.document,
      references: created.references,
    },
    activity: `AIがEntity「${entity.name}」からPrefab「${name}」を作成しました`,
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
  const interactivityAssetId = optionalString(
    argumentsValue.interactivityAssetId,
  );
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
    // One preferred Asset per Component kind; only one of these is ever set
    // because a definition consumes a single Asset kind.
    scriptAssetId ?? interactivityAssetId,
    context.scriptContracts,
  );
  if (!result.added) {
    throw new XriftMcpEditorToolError(
      addComponentFailureCode(result.reason),
      addComponentFailureMessage(result.reason),
      {
        entityId,
        definitionId,
        scriptAssetId,
        interactivityAssetId,
        reason: result.reason,
      },
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
      interactivityAssetId,
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
        RIGID_BODY_PATCH_KEYS,
        component.type,
      );
      scene = updateRigidBodyComponent(
        context.bundle.scene,
        entityId,
        patch as RigidBodyPatch,
        componentId,
      );
      break;
    case "collider": {
      assertPatchKeys(
        patch,
        COLLIDER_PATCH_KEYS,
        component.type,
      );
      // 差し替え先が本当にModelかは、Assetを持つここでしか確かめられない。
      const collisionModelAssetId = patch.collisionModelAssetId;
      if (
        typeof collisionModelAssetId === "string" &&
        context.bundle.assets.assets[collisionModelAssetId]?.kind !== "model"
      ) {
        invalidArgument(
          "patch.collisionModelAssetId",
          "existing model asset id",
        );
      }
      scene = updateColliderComponent(
        context.bundle.scene,
        entityId,
        patch as ColliderPatch,
        componentId,
      );
      break;
    }
    case "light":
      assertPatchKeys(
        patch,
        LIGHT_PATCH_KEYS,
        component.type,
      );
      scene = updateLightComponent(
        context.bundle.scene,
        entityId,
        patch as LightPatch,
        componentId,
      );
      break;
    case "text": {
      assertPatchKeys(
        patch,
        TEXT_PATCH_KEYS,
        component.type,
      );
      const background = patch.background;
      if (background !== undefined) {
        if (!isPlainObjectRecord(background)) {
          invalidArgument("patch.background", "object");
        }
        const textureAssetId = background.textureAssetId;
        if (textureAssetId !== undefined) {
          if (typeof textureAssetId !== "string") {
            invalidArgument("patch.background.textureAssetId", "string");
          }
          // Resolved here rather than in the document layer, which has no
          // Asset manifest: an id pointing at a Model would render a blank
          // plate with no explanation.
          if (
            textureAssetId &&
            context.bundle.assets.assets[textureAssetId]?.kind !== "texture"
          ) {
            invalidArgument(
              "patch.background.textureAssetId",
              "existing texture asset id",
            );
          }
        }
      }
      const fontAssetId = patch.fontAssetId;
      if (fontAssetId !== undefined) {
        if (typeof fontAssetId !== "string") {
          invalidArgument("patch.fontAssetId", "string");
        }
        const fontAsset = fontAssetId
          ? context.bundle.assets.assets[fontAssetId]
          : undefined;
        if (fontAssetId && fontAsset?.kind !== "font") {
          throw new XriftMcpEditorToolError(
            fontAsset ? "ASSET_KIND_MISMATCH" : "ASSET_NOT_FOUND",
            "patch.fontAssetIdには存在するFont Assetを指定してください。空文字で同梱書体へ戻せます",
            { fontAssetId, actualKind: fontAsset?.kind },
          );
        }
      }
      scene = updateTextComponent(
        context.bundle.scene,
        entityId,
        patch as TextPatch,
        componentId,
      );
      break;
    }
    case "audio-source": {
      assertPatchKeys(
        patch,
        AUDIO_SOURCE_PATCH_KEYS,
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
    case "animation": {
      // v1 removed the Animation Component. Opening a project converts any that
      // are left into a graph, so an agent finding one is looking at a document
      // that has not been opened since; editing it would keep it alive.
      throw new XriftMcpEditorToolError(
        "COMPONENT_REMOVED",
        "Animation Componentは廃止されました。clipの再生はInteractivity Graphのanimation/startノードで行います",
        { entityId, componentId, componentType: component.type },
      );
    }
    case "vegetation-wind": {
      assertPatchKeys(
        patch,
        ["enabled"],
        component.type,
        {
          guidance:
            "Windの強さ・速度・突風はScene SettingsのWind（グローバル）で変更してください（MCPではupdate_scene_settingsのvegetation section）",
        },
      );
      const enabled = optionalBoolean(patch.enabled, "patch.enabled");
      scene =
        enabled === undefined
          ? context.bundle.scene
          : updateVegetationWindComponent(
              context.bundle.scene,
              entityId,
              { enabled },
              componentId,
            );
      break;
    }
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
    case "mesh": {
      assertPatchKeys(
        patch,
        [
          "enabled",
          "materialBindings",
          "castShadow",
          "receiveShadow",
          "modelPose",
          "maxDistance",
          "renderOrder",
        ],
        component.type,
      );
      const mesh = component;
      const enabled = optionalBoolean(patch.enabled, "patch.enabled");
      const castShadow = optionalBoolean(patch.castShadow, "patch.castShadow");
      const receiveShadow = optionalBoolean(
        patch.receiveShadow,
        "patch.receiveShadow",
      );
      const hasMaxDistance = Object.prototype.hasOwnProperty.call(
        patch,
        "maxDistance",
      );
      const hasRenderOrder = Object.prototype.hasOwnProperty.call(
        patch,
        "renderOrder",
      );
      const renderOrder = hasRenderOrder
        ? optionalNullableFiniteNumber(patch.renderOrder, "patch.renderOrder")
        : undefined;
      const maxDistance = hasMaxDistance
        ? optionalNullableFiniteNumber(patch.maxDistance, "patch.maxDistance")
        : undefined;
      if (
        maxDistance !== undefined &&
        maxDistance !== null &&
        (maxDistance < MESH_MAX_DISTANCE_MIN ||
          maxDistance > MESH_MAX_DISTANCE_MAX)
      ) {
        invalidArgument(
          "patch.maxDistance",
          `number between ${MESH_MAX_DISTANCE_MIN} and ${MESH_MAX_DISTANCE_MAX}, or null to clear`,
        );
      }
      const materialBindings =
        patch.materialBindings === undefined
          ? undefined
          : meshMaterialBindingsValue(
              patch.materialBindings,
              context,
              mesh,
            );
      const hasModelPose = Object.prototype.hasOwnProperty.call(
        patch,
        "modelPose",
      );
      const modelPose = hasModelPose
        ? meshModelPoseValue(patch.modelPose)
        : undefined;

      scene = context.bundle.scene;
      if (enabled !== undefined) {
        scene = updateSceneComponentEnabled(
          scene,
          entityId,
          componentId,
          enabled,
        );
      }
      if (materialBindings !== undefined) {
        for (const binding of mesh.materialBindings) {
          scene = setMeshMaterialBinding(
            scene,
            context.bundle.assets,
            entityId,
            binding.slot,
            null,
            componentId,
            binding.sourceNodeIndex,
          );
        }
        for (const binding of materialBindings) {
          scene = setMeshMaterialBinding(
            scene,
            context.bundle.assets,
            entityId,
            binding.slot,
            binding.materialAssetId,
            componentId,
            binding.sourceNodeIndex,
          );
        }
      }
      if (castShadow !== undefined || receiveShadow !== undefined) {
        scene = updateMeshShadowSettings(
          scene,
          entityId,
          { castShadow, receiveShadow },
          componentId,
        );
      }
      if (hasMaxDistance || hasRenderOrder) {
        scene = updateMeshVisibilitySettings(
          scene,
          entityId,
          {
            ...(hasMaxDistance ? { maxDistance } : {}),
            ...(hasRenderOrder ? { renderOrder } : {}),
          } satisfies MeshVisibilityPatch,
          componentId,
        );
      }
      if (hasModelPose) {
        const currentMesh = scene.entities[entityId]?.components.find(
          (candidate): candidate is typeof mesh =>
            candidate.id === componentId && candidate.type === "mesh",
        );
        if (!currentMesh) {
          throw new XriftMcpEditorToolError(
            "COMPONENT_UPDATE_REJECTED",
            "Mesh Rendererを更新できませんでした",
            { entityId, componentId },
          );
        }
        const currentPose = currentMesh.modelPose;
        const nextPose = modelPose === null ? undefined : modelPose;
        if (JSON.stringify(currentPose) !== JSON.stringify(nextPose)) {
          scene = replaceSceneComponent(scene, entityId, componentId, {
            ...currentMesh,
            ...(nextPose === undefined
              ? { modelPose: undefined }
              : { modelPose: nextPose }),
          });
        }
      }
      break;
    }
    case "interaction-trigger": {
      assertPatchKeys(
        patch,
        INTERACTION_TRIGGER_PATCH_KEYS,
        component.type,
      );
      // entityReferences is derived from the graph rather than authored, so it
      // is not in the patch: the sync below re-reads it from whichever Asset
      // the Component now points at.
      const interactivityAssetId = patch.interactivityAssetId;
      if (interactivityAssetId !== undefined) {
        if (typeof interactivityAssetId !== "string") {
          invalidArgument("patch.interactivityAssetId", "string");
        }
        if (
          context.bundle.assets.assets[interactivityAssetId]?.kind !==
          "interactivity"
        ) {
          invalidArgument(
            "patch.interactivityAssetId",
            "existing interactivity asset id",
          );
        }
      }
      scene = context.bundle.scene;
      if (patch.enabled !== undefined) {
        scene = updateSceneComponentEnabled(
          scene,
          entityId,
          componentId,
          requiredPatchEnabled(patch),
        );
      }
      if (interactivityAssetId !== undefined) {
        scene = syncInteractionTriggerReferences(
          updateInteractionTriggerComponent(scene, entityId, componentId, {
            interactivityAssetId: interactivityAssetId as string,
          }),
          context.bundle.assets,
        );
      }
      break;
    }
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
  // updateModelNodeEntityEnabled also mirrors a shared-source Model node's
  // flag into the root Mesh pose, which is what actually renders.
  const scene = updateModelNodeEntityEnabled(
    context.bundle.scene,
    entityId,
    enabled,
  );
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
      ...(entity.modelNode
        ? { modelNodeVisibility: enabled ? "visible" : "hidden" }
        : {}),
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: entity.modelNode
      ? `AIが「${entity.name}」を${enabled ? "表示" : "非表示"}にしました`
      : `AIが「${entity.name}」を${enabled ? "有効" : "無効"}にしました`,
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

function createCustomShader(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue, { allowPlay: true });
  const requestedName = optionalString(argumentsValue.name);
  if (requestedName && requestedName.length > 100) {
    invalidArgument("name", "100文字以内の文字列");
  }
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

  const requestedShader =
    argumentsValue.shader === undefined
      ? createDefaultCustomShader()
      : customShaderValue(argumentsValue.shader, "shader");
  const materialAssetId = optionalString(argumentsValue.materialAssetId);
  let assets = context.bundle.assets;
  let selectedMaterialId: string;

  if (materialAssetId) {
    const material = getMaterialAsset(assets, materialAssetId);
    if (!material) {
      throw new XriftMcpEditorToolError(
        "MATERIAL_NOT_FOUND",
        "指定されたMaterial Assetが見つかりません",
        { materialAssetId },
      );
    }
    selectedMaterialId = material.id;
    assets = updateMaterialAsset(assets, material.id, { shader: requestedShader });
  } else {
    selectedMaterialId = createDocumentId("material-custom-shader");
    const created = addDefaultDocumentAsset(context.bundle.assets, {
      kind: "material",
      id: selectedMaterialId,
      folderId,
    });
    if (!created.added) {
      throw new XriftMcpEditorToolError(
        "ASSET_CREATE_FAILED",
        "Custom Shader用Materialを作成できませんでした",
        { folderId },
      );
    }
    assets = updateMaterialAsset(created.manifest, selectedMaterialId, {
      shader: requestedShader,
    });
    if (requestedName) {
      assets = renameAsset(assets, selectedMaterialId, requestedName);
    }
  }

  const material = getMaterialAsset(assets, selectedMaterialId);
  if (!material?.shader || material.shader.kind !== "classic-r3f") {
    throw new XriftMcpEditorToolError(
      "CUSTOM_SHADER_INVALID",
      "Custom ShaderをMaterialへ保存できませんでした",
      { materialAssetId: selectedMaterialId },
    );
  }
  assertCustomShaderAssetReferences(assets, material.shader);
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      {
        materialAssetId: selectedMaterialId,
        shader: JSON.parse(JSON.stringify(material.shader)),
        revision: context.revision,
      },
      `Material「${material.name}」のCustom Shaderはすでに設定済みです`,
    );
  }
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: selectedMaterialId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      materialAssetId: selectedMaterialId,
      name: material.name,
      shader: JSON.parse(JSON.stringify(material.shader)),
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
    },
    activity: `AIがMaterial「${material.name}」にCustom Shaderを設定しました`,
  };
}

function getCustomShader(
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
  if (!material.shader || material.shader.kind !== "classic-r3f") {
    throw new XriftMcpEditorToolError(
      "CUSTOM_SHADER_NOT_FOUND",
      "MaterialにCustom Shaderが設定されていません",
      { materialAssetId },
    );
  }
  return unchanged(
    context,
    {
      materialAssetId,
      materialName: material.name,
      shader: JSON.parse(JSON.stringify(material.shader)),
    },
    `Material「${material.name}」のCustom Shaderを取得しました`,
  );
}

function updateCustomShader(
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
  const patch = customShaderPatchValue(argumentsValue.patch);
  const current =
    material.shader?.kind === "classic-r3f"
      ? material.shader
      : createDefaultCustomShader();
  const shader = {
    ...current,
    ...patch,
    kind: "classic-r3f" as const,
  } satisfies ClassicR3fMaterialShader;
  const validation = validateClassicR3fMaterialShader(shader);
  if (validation.length > 0) {
    throw new XriftMcpEditorToolError(
      "CUSTOM_SHADER_INVALID",
      "Custom Shaderの形式が不正です",
      { materialAssetId, diagnostics: validation },
    );
  }
  assertCustomShaderAssetReferences(context.bundle.assets, shader);
  const assets = updateMaterialAsset(context.bundle.assets, materialAssetId, {
    shader,
  });
  if (assets === context.bundle.assets) {
    return unchanged(
      context,
      {
        materialAssetId,
        shader: JSON.parse(JSON.stringify(shader)),
        revision: context.revision,
      },
      `Material「${material.name}」のCustom Shaderはすでに指定された状態です`,
    );
  }
  const updated = getMaterialAsset(assets, materialAssetId);
  const bundle = touchProject(context, { ...context.bundle, assets });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: materialAssetId,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      materialAssetId,
      shader: updated?.shader
        ? JSON.parse(JSON.stringify(updated.shader))
        : null,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      synchronizedDuringPlay: context.editorMode === "play",
    },
    activity: `AIがMaterial「${material.name}」のCustom Shaderを更新しました`,
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
  const target = context.bundle.scene.entities[entityId];
  // A shared-source Model node is part of the Model: deleting its Entity
  // would keep the geometry on screen and orphan its pose. Hide it instead,
  // and say so, so the caller knows the row is still there to re-show.
  if (target?.modelNode) {
    const hiddenScene = updateModelNodeEntityEnabled(
      context.bundle.scene,
      entityId,
      false,
    );
    if (hiddenScene === context.bundle.scene) {
      return unchanged(
        context,
        {
          projectId: context.bundle.project.projectId,
          sceneId: context.bundle.scene.sceneId,
          revision: context.revision,
          entityId,
          deleted: false,
          modelNodeVisibility: "hidden",
        },
        "このEntityはModel内のノードで、すでに非表示です。削除するにはModel Assetを編集して再インポートしてください",
      );
    }
    const bundle = touchProject(context, { ...context.bundle, scene: hiddenScene });
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
        entityId,
        deleted: false,
        modelNodeVisibility: "hidden",
        message:
          "Model内のノードはModel本体の一部のため、Entityとしては削除せず非表示にしました。再表示はset_entity_enabled(enabled: true)。Modelから完全に取り除くにはソースを編集して再インポートしてください",
      },
      activity: `AIが「${target.name}」を非表示にしました`,
    };
  }
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
      operations: KHR_INTERACTIVITY_OPERATION_TEMPLATES.map((template) => {
        // Carried on the listing so a client picks an operation knowing whether
        // Play will run it, instead of discovering it only after authoring.
        const runtime = getInteractivityRuntimeSupport(template.op);
        return {
          op: template.op,
          label: template.label,
          category: template.category,
          flowInputs: template.flowInputs,
          flowOutputs: template.flowOutputs,
          valueInputs: template.valueInputs,
          valueOutputs: template.valueOutputs,
          runtimeSupport: runtime.support,
          runtimeNote: runtime.note,
        };
      }),
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
    argumentsValue.template ?? "start",
    "template",
    ["start", "empty"] as const,
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

/**
 * The Model Inspector's「アニメーションのGraphを作る」, for an agent.
 *
 * A Model whose motion is spread over dozens of clips cannot be played by the
 * Animation Component, which owns one; building the graph by hand is one node
 * and three inline values per clip. The Asset is created and left unattached,
 * because which Entity carries it is a placement decision this tool cannot make.
 */
function createModelAnimationGraph(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const modelAssetId = requiredString(argumentsValue.modelAssetId, "modelAssetId");
  const model = context.bundle.assets.assets[modelAssetId];
  if (model?.kind !== "model") {
    throw new XriftMcpEditorToolError("ASSET_NOT_FOUND", "Model Assetが見つかりません", {
      modelAssetId,
    });
  }
  const clips = model.importMetadata?.animations ?? [];
  if (clips.length === 0) {
    throw new XriftMcpEditorToolError(
      "MODEL_HAS_NO_ANIMATION",
      "このModelにはanimation clipがありません",
      { modelAssetId },
    );
  }
  const folderId =
    optionalNullableString(argumentsValue.folderId, "folderId") ?? model.folderId ?? null;
  if (folderId && !context.bundle.assets.folders?.[folderId]) {
    throw new XriftMcpEditorToolError("FOLDER_NOT_FOUND", "指定されたAsset Folderが見つかりません", {
      folderId,
    });
  }
  const name = optionalString(argumentsValue.name) ?? `${model.name} のアニメーション`;
  const assetId = createDocumentId("interactivity");
  const added = addDefaultInteractivityAsset(context.bundle.assets, {
    id: assetId,
    name,
    folderId,
    extension: createModelAnimationGraphExtension(clips.map((clip) => clip.name)),
  });
  if (!added.added) {
    throw new XriftMcpEditorToolError("ASSET_NOT_CREATED", "Interactivity Assetを作成できませんでした");
  }
  const bundle = touchProject(context, { ...context.bundle, assets: added.manifest });
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
      modelAssetId,
      clipCount: clips.length,
      clipNames: clips.map((clip) => clip.name),
      attached: false,
      extension: (added.manifest.assets[assetId] as InteractivityAsset).extension,
    },
    activity: `AIが${clips.length}件のclipを再生するInteractivity Asset「${name}」を作成しました`,
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
  const position = optionalVec2(argumentsValue.position, "position");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const template = getInteractivityOperationTemplate(op);
  // An operation KHR_interactivity does not define is only legal when its
  // declaration names the extension that does. The palette reads that name off
  // the operation template; a caller that had to supply it by hand met a
  // validation failure the Editor never produces, so the template answers here
  // too and the argument is only an override.
  const definingExtension =
    optionalString(argumentsValue.extension) ?? template?.extension;
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
  // The canvas can only offer the sockets an operation declares, so a wire it
  // draws always lands somewhere the runtime reads. A socket name invented over
  // MCP saves as valid JSON and then does nothing, which is the hardest kind of
  // failure to see. Operations with no template stay unchecked: they are the
  // deliberate escape hatch for extensions this build does not know.
  assertInteractivitySocket(graph, sourceNode, kind === "flow" ? "flowOutputs" : "valueOutputs", sourceSocket);
  assertInteractivitySocket(graph, targetNode, kind === "flow" ? "flowInputs" : "valueInputs", targetSocket);
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
  assertInteractivitySocket(graph, nodeIndex, "valueInputs", socket);
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
  // Schema validity and Play-runtime support are reported separately so `valid`
  // keeps meaning "this graph can be written", while a client can still see
  // which operations the runtime adapter will not execute.
  const runtimeDiagnostics = collectInteractivityRuntimeDiagnostics(asset.extension);
  return unchanged(
    context,
    {
      assetId: asset.id,
      valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      diagnostics,
      runtimeDiagnostics,
      graphCount: asset.extension.graphs.length,
      nodeCount: asset.extension.graphs.reduce(
        (count, graph) => count + (graph.nodes?.length ?? 0),
        0,
      ),
    },
    diagnostics.length === 0 && runtimeDiagnostics.length === 0
      ? "KHR_interactivity validationに成功しました"
      : "KHR_interactivity diagnosticsを取得しました",
  );
}

/**
 * The list of graphs inside one Asset.
 *
 * The Editor grew add / duplicate / rename / delete / "make this the default"
 * for graphs; without the same four tools a client could target a second graph
 * by index but never create one, so every MCP-authored Asset was stuck at one
 * graph.
 */
function addInteractivityGraphTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const duplicateFrom = optionalNonNegativeInteger(
    argumentsValue.duplicateFromGraphIndex,
    "duplicateFromGraphIndex",
  );
  const name = optionalString(argumentsValue.name);
  const extension = cloneKhrInteractivityExtension(asset.extension);
  if (duplicateFrom !== undefined) {
    requireInteractivityGraph(extension.graphs, duplicateFrom);
  }
  const graphIndex =
    duplicateFrom === undefined
      ? addInteractivityGraph(
          extension,
          name ?? `Graph ${extension.graphs.length + 1}`,
        )
      : duplicateInteractivityGraph(extension, duplicateFrom);
  if (graphIndex < 0) {
    throw new XriftMcpEditorToolError(
      "GRAPH_LIMIT_REACHED",
      `1つのAssetが持てるgraphは${KHR_INTERACTIVITY_MAX_GRAPHS}個までです`,
      { graphCount: extension.graphs.length, limit: KHR_INTERACTIVITY_MAX_GRAPHS },
    );
  }
  if (name !== undefined) renameInteractivityGraph(extension, graphIndex, name);
  const graphName = extension.graphs[graphIndex]?.name ?? "";
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      name: graphName,
      duplicatedFromGraphIndex: duplicateFrom ?? null,
      graphCount: extension.graphs.length,
    },
    `AIがbehavior graph「${graphName}」を追加しました`,
  );
}

function updateInteractivityGraphTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = requiredInteger(argumentsValue.graphIndex, "graphIndex");
  const name = optionalString(argumentsValue.name);
  const isDefault = optionalBoolean(argumentsValue.isDefault, "isDefault");
  if (name === undefined && isDefault === undefined) {
    invalidArgument("name or isDefault", "at least one of them");
  }
  if (isDefault === false) {
    // Clearing it would leave the extension without a default. A different
    // graph becomes the default by naming that graph, not by unsetting this.
    invalidArgument("isDefault", "true (別のgraphをisDefault: trueで指定してください)");
  }
  const extension = cloneKhrInteractivityExtension(asset.extension);
  requireInteractivityGraph(extension.graphs, graphIndex);
  if (name !== undefined) renameInteractivityGraph(extension, graphIndex, name);
  if (isDefault) extension.graph = graphIndex;
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      name: extension.graphs[graphIndex]?.name ?? "",
      defaultGraphIndex: extension.graph ?? 0,
    },
    isDefault
      ? "AIが既定のbehavior graphを変更しました"
      : "AIがbehavior graphの名前を変更しました",
  );
}

function deleteInteractivityGraphTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex = requiredInteger(argumentsValue.graphIndex, "graphIndex");
  const extension = cloneKhrInteractivityExtension(asset.extension);
  requireInteractivityGraph(extension.graphs, graphIndex);
  if (!removeInteractivityGraph(extension, graphIndex)) {
    throw new XriftMcpEditorToolError(
      "LAST_GRAPH",
      "Assetの最後のbehavior graphは削除できません",
      { graphIndex },
    );
  }
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      deletedGraphIndex: graphIndex,
      graphCount: extension.graphs.length,
      defaultGraphIndex: extension.graph ?? 0,
    },
    "AIがbehavior graphを削除しました",
  );
}

/**
 * Where a card sits on the canvas.
 *
 * Position is authoring state, not behaviour, but a graph whose cards overlap
 * is unreadable, and the client that built it is the one that knows which node
 * belongs where. `add_interactivity_node` can only place a card at creation.
 */
function moveInteractivityNode(
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
  const position = optionalVec2(argumentsValue.position, "position");
  if (!position) invalidArgument("position", "[x, y]");
  const avoidOverlap =
    optionalBoolean(argumentsValue.avoidOverlap, "avoidOverlap") ?? false;
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const node = graph.nodes?.[nodeIndex];
  if (!node) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  const placed = avoidOverlap
    ? freeInteractivityNodePosition(
        {
          ...graph,
          nodes: graph.nodes?.filter((_, index) => index !== nodeIndex),
        },
        position,
      )
    : { x: Math.round(position.x), y: Math.round(position.y) };
  graph.nodes![nodeIndex] = writeInteractivityNodePosition(node, placed);
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    { assetId: asset.id, graphIndex, nodeIndex, position: [placed.x, placed.y] },
    "AIがInteractivity nodeを移動しました",
  );
}

/** The canvas's「整列」: flow order left to right, one column per depth. */
function layoutInteractivityGraph(
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
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  autoLayoutInteractivityGraph(graph);
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      positions: (graph.nodes ?? []).map((node, index) => {
        const position = readInteractivityNodePosition(node, index);
        return { nodeIndex: index, position: [position.x, position.y] };
      }),
    },
    "AIがInteractivity graphを整列しました",
  );
}

function duplicateInteractivityNodeTool(
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
  const targetGraphIndex =
    optionalNonNegativeInteger(argumentsValue.targetGraphIndex, "targetGraphIndex") ??
    graphIndex;
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const target = requireInteractivityGraph(extension.graphs, targetGraphIndex);
  // Within one graph the node can be copied as-is. Into another one its
  // `declaration` and its inline `type` indexes mean something else entirely,
  // so the copy carries the names and they are resolved on arrival.
  const created =
    targetGraphIndex === graphIndex
      ? duplicateInteractivityNode(graph, nodeIndex)
      : (() => {
          const entry = readInteractivityNodeForCopy(graph, nodeIndex);
          return entry ? pasteInteractivityNode(target, entry) : -1;
        })();
  if (created < 0) {
    throw new XriftMcpEditorToolError("NODE_NOT_FOUND", "指定されたnodeが見つかりません", {
      nodeIndex,
    });
  }
  const op = target.declarations?.[target.nodes![created]!.declaration]?.op ?? "";
  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      targetGraphIndex,
      sourceNodeIndex: nodeIndex,
      nodeIndex: created,
      op,
      // Said out loud because the Editor's copy behaves the same way and a
      // client that assumed the wires came along would build a broken graph.
      connectionsCopied: false,
    },
    `AIが${op} nodeを複製しました`,
  );
}

/**
 * An Interaction Trigger action's target, value, duration and easing.
 *
 * `set_interactivity_configuration` and `set_interactivity_value` can write the
 * same four configuration keys by hand, but nothing checks that the Entity has
 * that component, that the property exists on that target kind, or that the
 * value socket carries the type the property needs. Getting one of those wrong
 * produces a graph that saves and then does nothing at Play, which is the
 * failure the Editor's picker exists to prevent.
 */
function configureInteractivityTriggerActionTool(
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
  const extension = cloneKhrInteractivityExtension(asset.extension);
  const graph = requireInteractivityGraph(extension.graphs, graphIndex);
  const node = graph.nodes?.[nodeIndex];
  const op = node ? graph.declarations?.[node.declaration]?.op : undefined;
  if (!node || !isInteractivityTriggerActionOp(op)) {
    throw new XriftMcpEditorToolError(
      "NOT_A_TRIGGER_ACTION",
      "指定されたnodeはプロパティを変えるaction（xrift/setProperty または xrift/toggleProperty）ではありません",
      { nodeIndex, op: op ?? null },
    );
  }

  const current = readInteractivityTriggerAction(graph, nodeIndex);
  // The Entity's own row and the Scene row carry an empty component id, so an
  // empty string here is a real choice rather than an omission.
  let componentIdArgument: string | undefined;
  if (argumentsValue.componentId !== undefined) {
    if (typeof argumentsValue.componentId !== "string") {
      invalidArgument("componentId", "string");
    }
    componentIdArgument = argumentsValue.componentId.trim();
  }
  const entityId = optionalString(argumentsValue.entityId) ?? current?.entityId ?? "";
  const componentId = componentIdArgument ?? current?.componentId ?? "";
  const property = optionalString(argumentsValue.property) ?? current?.property ?? "";
  const retargeted =
    optionalString(argumentsValue.entityId) !== undefined ||
    componentIdArgument !== undefined ||
    optionalString(argumentsValue.property) !== undefined;

  const targets = collectInteractionTriggerTargets(context.bundle.scene, context.bundle.assets);
  const targetEntity = targets.find((candidate) => candidate.entityId === entityId);
  if (!targetEntity) {
    throw new XriftMcpEditorToolError(
      "TARGET_ENTITY_NOT_FOUND",
      "指定されたEntityはInteraction Triggerの対象になりません",
      {
        entityId,
        hint: "list_interaction_trigger_targets で対象と対応プロパティを確認できます",
      },
    );
  }
  const targetComponent = targetEntity.components.find(
    (candidate) => candidate.componentId === componentId,
  );
  if (!targetComponent) {
    throw new XriftMcpEditorToolError(
      "TARGET_COMPONENT_NOT_FOUND",
      "指定されたcomponentがそのEntityにありません",
      {
        entityId,
        componentId,
        availableComponentIds: targetEntity.components.map(
          (candidate) => candidate.componentId,
        ),
      },
    );
  }
  const descriptor = getXriftInteractionProperty(
    targetComponent.targetKind as XriftInteractionTargetKind,
    property,
  );
  if (!descriptor) {
    throw new XriftMcpEditorToolError(
      "TARGET_PROPERTY_NOT_FOUND",
      "指定されたプロパティはこの対象にありません",
      {
        targetKind: targetComponent.targetKind,
        property,
        availableProperties: targetComponent.properties.map(
          (candidate) => candidate.name,
        ),
      },
    );
  }

  if (
    retargeted &&
    !configureInteractivityTriggerAction(graph, nodeIndex, {
      entityId,
      componentId,
      targetKind: targetComponent.targetKind as XriftInteractionTargetKind,
      property,
    })
  ) {
    throw new XriftMcpEditorToolError(
      "TARGET_NOT_APPLIED",
      "Interaction Triggerのactionへ対象を設定できませんでした",
      { nodeIndex, entityId, componentId, property },
    );
  }

  const isToggle = op === XRIFT_INTERACTION_OPERATIONS.toggleProperty;
  // An Asset id and a sentence live in `configuration`, not in the value
  // socket, so they arrive as their own arguments. Sending `value` for one of
  // those is a mistake worth naming rather than silently ignoring.
  // `assetId` on this tool is the Interactivity Asset being edited, so the
  // Asset an action points at needs its own name.
  const assetArgument = optionalString(argumentsValue.valueAssetId);
  const textArgument = optionalString(argumentsValue.text);
  if (assetArgument !== undefined && descriptor.kind !== "asset") {
    invalidArgument("valueAssetId", "Assetを取るpropertyだけが受け付けます");
  }
  if (textArgument !== undefined && descriptor.kind !== "string") {
    invalidArgument("text", "文字列を取るpropertyだけが受け付けます");
  }
  if (assetArgument !== undefined) {
    if (assetArgument !== "" && !context.bundle.assets.assets[assetArgument]) {
      invalidArgument("valueAssetId", "ProjectにあるAssetのid、または空文字");
    }
    setInteractivityTriggerActionAsset(graph, nodeIndex, assetArgument);
  }
  if (textArgument !== undefined) {
    setInteractivityTriggerActionText(graph, nodeIndex, textArgument);
  }
  let value: KhrInteractivityJsonValue[] | null = null;
  if (argumentsValue.value !== undefined) {
    if (isToggle) {
      throw new XriftMcpEditorToolError(
        "VALUE_NOT_SUPPORTED",
        "xrift/toggleProperty は値を持ちません。反転するだけの操作です",
        { nodeIndex },
      );
    }
    value = triggerActionValueFromArgument(argumentsValue.value, descriptor);
    setInteractivityTriggerActionValue(graph, nodeIndex, descriptor, value);
  } else if (
    retargeted &&
    !isToggle &&
    descriptor.kind !== "asset" &&
    descriptor.kind !== "string"
  ) {
    value = defaultTriggerActionValue(descriptor);
  }

  const durationSeconds = optionalFiniteNumber(
    argumentsValue.durationSeconds,
    "durationSeconds",
  );
  if (durationSeconds !== undefined) {
    if (durationSeconds < 0) invalidArgument("durationSeconds", "number >= 0");
    // ON/OFF and a choice have no midpoint, so a duration on one would promise
    // a gradual change the runtime cannot make. The Editor hides the field for
    // the same reason.
    if (durationSeconds > 0 && !TIMED_TRIGGER_PROPERTY_KINDS.has(descriptor.kind)) {
      throw new XriftMcpEditorToolError(
        "DURATION_NOT_SUPPORTED",
        "このプロパティは中間の値を持たないため、時間をかけて変えられません",
        { property: descriptor.name, kind: descriptor.kind },
      );
    }
    setInteractivityTriggerActionDuration(graph, nodeIndex, durationSeconds);
  }

  const easing = optionalString(argumentsValue.easing);
  if (easing !== undefined) {
    if (!(INTERACTIVITY_EASINGS as readonly string[]).includes(easing)) {
      invalidArgument("easing", INTERACTIVITY_EASINGS.join(" | "));
    }
    setInteractivityTriggerActionEasing(graph, nodeIndex, easing);
  }

  return commitInteractivityMutation(
    context,
    asset,
    extension,
    {
      assetId: asset.id,
      graphIndex,
      nodeIndex,
      op,
      entityId,
      componentId,
      targetKind: targetComponent.targetKind,
      property,
      value,
      ...(descriptor.kind === "asset"
        ? { valueAssetId: readInteractivityTriggerActionAsset(graph, nodeIndex) }
        : {}),
      ...(descriptor.kind === "string"
        ? { text: readInteractivityTriggerActionText(graph, nodeIndex) }
        : {}),
      durationSeconds: readInteractivityTriggerActionDuration(graph, nodeIndex),
      easing: readInteractivityTriggerActionEasing(graph, nodeIndex),
    },
    `AIがactionの対象を「${targetEntity.name} / ${descriptor.label}」に設定しました`,
  );
}

/** Property kinds that can hold a midpoint, so a duration means something. */
const TIMED_TRIGGER_PROPERTY_KINDS: ReadonlySet<string> = new Set([
  "float",
  "color",
  "vector3",
]);

/**
 * Accepts the shapes a caller naturally writes, in the type the socket needs.
 *
 * An enum arrives as its option id rather than the index the socket stores,
 * because the index is an implementation detail of the property table and a
 * caller reading `list_interaction_trigger_targets` sees ids.
 */
function triggerActionValueFromArgument(
  value: unknown,
  descriptor: XriftInteractionPropertyDescriptor,
): KhrInteractivityJsonValue[] {
  switch (descriptor.kind) {
    case "bool": {
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single !== "boolean") invalidArgument("value", "true or false");
      return [single];
    }
    case "float": {
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single !== "number" || !Number.isFinite(single)) {
        invalidArgument("value", "a finite number");
      }
      return [single];
    }
    case "color":
    case "vector3": {
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
      ) {
        invalidArgument(
          "value",
          descriptor.kind === "color"
            ? "[r, g, b]（0〜1のlinear RGB）"
            : "[x, y, z]",
        );
      }
      return [value[0] as number, value[1] as number, value[2] as number];
    }
    case "enum": {
      const single = Array.isArray(value) ? value[0] : value;
      const options = descriptor.options ?? [];
      if (typeof single === "number" && Number.isInteger(single)) {
        if (single < 0 || single >= options.length) {
          invalidArgument("value", options.map((option) => option.value).join(" | "));
        }
        return [single];
      }
      if (
        typeof single !== "string" ||
        !options.some((option) => option.value === single)
      ) {
        invalidArgument("value", options.map((option) => option.value).join(" | "));
      }
      return [xriftInteractionEnumIndex(descriptor, single)];
    }
    case "asset":
      // Handled before this point: an Asset property takes `assetId`, not
      // `value`, because the id is configuration rather than a socket value.
      invalidArgument("value", "assetId（このpropertyはAssetを指定します）");
    case "string":
      invalidArgument("value", "text（このpropertyは文字列を指定します）");
  }
}

/**
 * Runs the graph without a renderer and reports what happens, and when.
 *
 * This is the Editor's timeline as data. Reading the JSON tells a client what a
 * graph is wired to do; only running it says whether the delay it wrote lands
 * where it meant, whether a loop terminates, and which nodes are never reached.
 * Nothing is written: the same simulation the timeline draws, over MCP.
 */
function simulateInteractivityAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const graphIndex =
    optionalNonNegativeInteger(argumentsValue.graphIndex, "graphIndex") ??
    asset.extension.graph ??
    0;
  requireInteractivityGraph(asset.extension.graphs, graphIndex);
  const horizonSeconds = optionalFiniteNumber(
    argumentsValue.horizonSeconds,
    "horizonSeconds",
  );
  if (horizonSeconds !== undefined && (horizonSeconds <= 0 || horizonSeconds > 600)) {
    invalidArgument("horizonSeconds", "number from 0 to 600");
  }
  const stepSeconds = optionalFiniteNumber(argumentsValue.stepSeconds, "stepSeconds");
  if (stepSeconds !== undefined && (stepSeconds <= 0 || stepSeconds > 1)) {
    invalidArgument("stepSeconds", "number from 0 to 1");
  }
  const entry = requiredEnum(argumentsValue.entry ?? "start", "entry", [
    "start",
    "interact",
  ] as const);
  const run = dryRunInteractivityGraph(asset.extension, {
    graphIndex,
    entry,
    ...(horizonSeconds === undefined ? {} : { horizonSeconds }),
    ...(stepSeconds === undefined ? {} : { stepSeconds }),
  });
  const graph = asset.extension.graphs[graphIndex]!;
  const nodeCount = graph.nodes?.length ?? 0;
  const unreached: number[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    if (!run.visitedNodes.has(index)) unreached.push(index);
  }
  return unchanged(
    context,
    {
      assetId: asset.id,
      graphIndex,
      entry,
      simulatedSeconds: run.simulatedSeconds,
      // True when the horizon ran out with work still pending: the sequence is
      // longer than the window, not necessarily stuck.
      truncated: run.truncated,
      entries: run.entries.map(describeSimulationEntry),
      issues: run.issues.map((issue) => ({
        nodeIndex: issue.nodeIndex,
        reason: issue.reason,
        ...(issue.detail === undefined ? {} : { detail: issue.detail }),
      })),
      visitedNodes: [...run.visitedNodes.entries()]
        .map(([nodeIndex, timeSeconds]) => ({ nodeIndex, firstRunSeconds: timeSeconds }))
        .sort((left, right) => left.nodeIndex - right.nodeIndex),
      unreachedNodes: unreached,
      nodeCount,
    },
    run.entries.length === 0
      ? "Interactivity graphを実行しましたが、起きることはありませんでした"
      : `Interactivity graphの${run.simulatedSeconds}秒ぶんの進行を取得しました`,
  );
}

function describeSimulationEntry(
  entry: InteractivityScheduleEntry,
): Record<string, unknown> {
  // Exhaustive over the union: a new entry kind must decide what it reports
  // rather than reaching a client as a bare timestamp.
  const base = { kind: entry.kind, timeSeconds: entry.timeSeconds, nodeIndex: entry.nodeIndex };
  switch (entry.kind) {
    case "animation-start":
      return {
        ...base,
        animationIndex: entry.animationIndex,
        startTime: entry.startTime,
        endTime: entry.endTime,
        speed: entry.speed,
      };
    case "animation-stop":
      return { ...base, animationIndex: entry.animationIndex };
    case "property":
      return {
        ...base,
        target: entry.target,
        value: entry.value.data,
        signature: entry.value.signature,
        durationSeconds: entry.durationSeconds,
      };
    case "pointer":
      return { ...base, pointer: entry.pointer, value: entry.value.data };
    case "event":
      return { ...base, name: entry.name };
    case "log":
      return { ...base, message: entry.message };
  }
}

/**
 * Replaces the Asset's whole KHR_interactivity extension.
 *
 * The Editor has the same escape hatch as a JSON panel, and it is the only way
 * to write a graph in one call rather than one node at a time. The JSON is
 * parsed through the same reader the Editor uses, so a document that is not a
 * valid extension is refused before it can replace a working graph.
 */
function updateInteractivityAssetTool(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const asset = requireInteractivityAsset(
    context,
    requiredString(argumentsValue.assetId, "assetId"),
  );
  const parsed = parseKhrInteractivityExtension(argumentsValue.extension);
  if (!parsed) {
    throw new XriftMcpEditorToolError(
      "INVALID_EXTENSION",
      "KHR_interactivity extensionとして読めませんでした",
      {
        diagnostics: isPlainObjectRecord(argumentsValue.extension)
          ? validateKhrInteractivityExtension(
              argumentsValue.extension as unknown as InteractivityAsset["extension"],
            )
          : [],
      },
    );
  }
  return commitInteractivityMutation(
    context,
    asset,
    parsed,
    {
      assetId: asset.id,
      graphCount: parsed.graphs.length,
      defaultGraphIndex: parsed.graph ?? 0,
      nodeCount: parsed.graphs.reduce(
        (count, graph) => count + (graph.nodes?.length ?? 0),
        0,
      ),
    },
    `AIがInteractivity Asset「${asset.name}」のgraphを置き換えました`,
  );
}

/**
 * Rejects a socket the operation does not declare.
 *
 * Named sockets are part of an operation's signature, and the runtime reads
 * only the ones it knows. Writing to another name produces a graph that
 * validates, saves and silently does nothing.
 */
function assertInteractivitySocket(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  kind: "flowInputs" | "flowOutputs" | "valueInputs" | "valueOutputs",
  socket: string,
): void {
  const node = graph.nodes?.[nodeIndex];
  const op = node ? graph.declarations?.[node.declaration]?.op : undefined;
  const template = op ? getInteractivityOperationTemplate(op) : undefined;
  if (!template) return;
  if (template[kind].includes(socket)) return;
  // `flow/sequence` is numbered, not fixed: the spec runs whatever outputs the
  // author connected, in socket order, so the template's three are a starting
  // point rather than a limit. A generated graph can fan out to far more.
  if (op === "flow/sequence" && kind === "flowOutputs" && /^(0|[1-9][0-9]*)$/.test(socket)) {
    return;
  }
  throw new XriftMcpEditorToolError(
    "SOCKET_NOT_FOUND",
    `${op} には${socket} socketがありません`,
    { nodeIndex, op, socket, availableSockets: template[kind] },
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
  // An Interaction Trigger records the Entities its graph writes to, and the
  // graph just moved. The editor shell re-derives that list after every hand
  // edit; a graph built over MCP has to go through the same step, or the
  // compiler sees a trigger with no dependencies and drops the Entities the
  // agent just wired up.
  const scene = syncInteractionTriggerReferences(
    context.bundle.scene,
    assets,
  );
  const bundle = touchProject(context, { ...context.bundle, assets, scene });
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

function sceneSettingsPatch(
  value: unknown,
  name: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  const patch = recordValue(value, name);
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(patch).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}.${unsupported}はScene設定で変更できません`,
      { section: name, unsupportedField: unsupported },
    );
  }
  if (Object.keys(patch).length === 0) {
    invalidArgument(name, "non-empty object");
  }
  return patch;
}

function applySkyboxPatch(
  current: SceneSkyboxSettings,
  patch: Record<string, unknown>,
  context: XriftMcpEditorContext,
): SceneSkyboxSettings {
  const next: SceneSkyboxSettings = {
    ...current,
    meshPosition: [...current.meshPosition],
    meshRotationDegrees: [...current.meshRotationDegrees],
    meshScale: [...current.meshScale],
    center: [...current.center],
  };
  const enabled = optionalBoolean(patch.enabled, "skybox.enabled");
  if (enabled !== undefined) next.enabled = enabled;
  if (patch.projection !== undefined) {
    next.projection = requiredEnum(
      patch.projection,
      "skybox.projection",
      ["infinite", "box", "dome"] as const,
    );
  }
  if (patch.imageAssetId !== undefined) {
    if (patch.imageAssetId === null) {
      delete next.imageAssetId;
      if (patch.iblEnabled === undefined) next.iblEnabled = false;
    } else {
      const imageAssetId = requiredString(
        patch.imageAssetId,
        "skybox.imageAssetId",
      );
      assertSkyboxImageAsset(context, imageAssetId);
      const hadImage = Boolean(next.imageAssetId);
      next.imageAssetId = imageAssetId;
      if (!hadImage && patch.iblEnabled === undefined) next.iblEnabled = true;
    }
  }
  if (patch.materialAssetId !== undefined) {
    if (patch.materialAssetId === null) {
      delete next.materialAssetId;
    } else {
      const materialAssetId = requiredString(
        patch.materialAssetId,
        "skybox.materialAssetId",
      );
      assertSkyShaderMaterialAsset(context, materialAssetId);
      next.materialAssetId = materialAssetId;
    }
  }
  const iblEnabled = optionalBoolean(
    patch.iblEnabled,
    "skybox.iblEnabled",
  );
  if (iblEnabled !== undefined) {
    if (iblEnabled && !next.imageAssetId) {
      throw new XriftMcpEditorToolError(
        "INVALID_ARGUMENT",
        "skybox.iblEnabledを有効にするにはimageAssetIdが必要です",
      );
    }
    next.iblEnabled = iblEnabled;
  }
  for (const field of ["topColor", "bottomColor"] as const) {
    if (patch[field] !== undefined) {
      next[field] = sceneColor(patch[field], `skybox.${field}`);
    }
  }
  for (const [field, minimum] of [
    ["offset", undefined],
    ["exponent", 0.01],
    ["rotationDegrees", undefined],
    ["exposure", 0],
  ] as const) {
    if (patch[field] !== undefined) {
      next[field] = sceneNumber(patch[field], `skybox.${field}`, minimum);
    }
  }
  const flipY = optionalBoolean(patch.flipY, "skybox.flipY");
  if (flipY !== undefined) next.flipY = flipY;
  for (const [field, minimum] of [
    ["meshPosition", undefined],
    ["meshRotationDegrees", undefined],
    ["meshScale", 0.001],
    ["center", undefined],
  ] as const) {
    if (patch[field] !== undefined) {
      next[field] = sceneVec3(patch[field], `skybox.${field}`, minimum);
    }
  }
  return next;
}

function assertSkyboxImageAsset(
  context: XriftMcpEditorContext,
  imageAssetId: string,
): void {
  const asset = context.bundle.assets.assets[imageAssetId];
  if (!asset) {
    throw new XriftMcpEditorToolError(
      "ASSET_NOT_FOUND",
      "skybox.imageAssetIdに指定されたAssetが見つかりません",
      { imageAssetId },
    );
  }
  if (asset.kind !== "texture" && asset.kind !== "skybox") {
    throw new XriftMcpEditorToolError(
      "ASSET_KIND_MISMATCH",
      "skybox.imageAssetIdにはTexture Assetを指定してください",
      { imageAssetId, actualKind: asset.kind },
    );
  }
  if (asset.source.kind !== "project") {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "skybox.imageAssetIdにはproject sourceを持つTexture Assetを指定してください",
      { imageAssetId, sourceKind: asset.source.kind },
    );
  }
}

function assertSkyShaderMaterialAsset(
  context: XriftMcpEditorContext,
  materialAssetId: string,
): void {
  const asset = context.bundle.assets.assets[materialAssetId];
  if (!asset) {
    throw new XriftMcpEditorToolError(
      "ASSET_NOT_FOUND",
      "skybox.materialAssetIdに指定されたAssetが見つかりません",
      { materialAssetId },
    );
  }
  if (asset.kind !== "material") {
    throw new XriftMcpEditorToolError(
      "ASSET_KIND_MISMATCH",
      "skybox.materialAssetIdにはMaterial Assetを指定してください",
      { materialAssetId, actualKind: asset.kind },
    );
  }
  if (!isSkyShaderMaterialAsset(asset)) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "skybox.materialAssetIdにはCustom Shader（classic-r3f）を持つMaterial Assetを指定してください",
      { materialAssetId },
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

function applyAmbientPatch(
  current: SceneAmbientSettings,
  patch: Record<string, unknown>,
): SceneAmbientSettings {
  const next = { ...current };
  if (patch.color !== undefined) {
    next.color = sceneColor(patch.color, "ambient.color");
  }
  if (patch.intensity !== undefined) {
    next.intensity = sceneNumber(
      patch.intensity,
      "ambient.intensity",
      0,
    );
  }
  return next;
}

function applyCameraPatch(
  current: SceneCameraSettings,
  patch: Record<string, unknown>,
): SceneCameraSettings {
  const next = { ...current };
  if (patch.near !== undefined) {
    next.near = sceneNumber(patch.near, "camera.near", 0.01);
  }
  if (patch.far !== undefined) {
    next.far = sceneNumber(patch.far, "camera.far", 1);
  }
  if (patch.fov !== undefined) {
    next.fov = sceneNumber(patch.fov, "camera.fov", 1, 179);
  }
  if (next.far <= next.near) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "camera.farはcamera.nearより大きい値にしてください",
    );
  }
  return next;
}

function applyPostprocessingPatch(
  current: ScenePostprocessingSettings,
  patch: Record<string, unknown>,
): ScenePostprocessingSettings {
  const next: ScenePostprocessingSettings = {
    ...current,
    hdr: { ...current.hdr },
    bloom: { ...current.bloom },
    ao: { ...current.ao },
  };
  const enabled = optionalBoolean(patch.enabled, "postprocessing.enabled");
  if (enabled !== undefined) next.enabled = enabled;
  if (patch.hdr !== undefined) {
    const hdrPatch = sceneSettingsPatch(patch.hdr, "postprocessing.hdr", [
      "enabled",
      "toneMapping",
    ]);
    const hdrEnabled = optionalBoolean(
      hdrPatch.enabled,
      "postprocessing.hdr.enabled",
    );
    if (hdrEnabled !== undefined) next.hdr.enabled = hdrEnabled;
    if (
      hdrPatch.toneMapping !== undefined &&
      hdrPatch.toneMapping !== "aces" &&
      hdrPatch.toneMapping !== "none"
    ) {
      invalidArgument("postprocessing.hdr.toneMapping", "aces または none");
    }
    if (hdrPatch.toneMapping !== undefined) {
      next.hdr.toneMapping = hdrPatch.toneMapping;
    }
  }
  if (patch.exposure !== undefined) {
    next.exposure = sceneNumber(patch.exposure, "postprocessing.exposure", 0);
  }
  if (patch.bloom !== undefined) {
    const bloomPatch = sceneSettingsPatch(patch.bloom, "postprocessing.bloom", [
      "enabled",
      "threshold",
      "strength",
      "radius",
    ]);
    const bloomEnabled = optionalBoolean(
      bloomPatch.enabled,
      "postprocessing.bloom.enabled",
    );
    if (bloomEnabled !== undefined) next.bloom.enabled = bloomEnabled;
    for (const [field, minimum] of [
      ["threshold", 0],
      ["strength", 0],
      ["radius", 0],
    ] as const) {
      if (bloomPatch[field] !== undefined) {
        next.bloom[field] = sceneNumber(
          bloomPatch[field],
          `postprocessing.bloom.${field}`,
          minimum,
        );
      }
    }
  }
  if (patch.ao !== undefined) {
    const aoPatch = sceneSettingsPatch(patch.ao, "postprocessing.ao", [
      "enabled",
      "radius",
      "minDistance",
      "maxDistance",
    ]);
    const aoEnabled = optionalBoolean(
      aoPatch.enabled,
      "postprocessing.ao.enabled",
    );
    if (aoEnabled !== undefined) next.ao.enabled = aoEnabled;
    for (const [field, minimum] of [
      ["radius", 0.1],
      ["minDistance", 0],
      ["maxDistance", 0.001],
    ] as const) {
      if (aoPatch[field] !== undefined) {
        next.ao[field] = sceneNumber(
          aoPatch[field],
          `postprocessing.ao.${field}`,
          minimum,
        );
      }
    }
    if (next.ao.maxDistance <= next.ao.minDistance) {
      throw new XriftMcpEditorToolError(
        "INVALID_ARGUMENT",
        "postprocessing.ao.maxDistanceはminDistanceより大きい値にしてください",
      );
    }
  }
  return next;
}

function applyVegetationPatch(
  current: SceneVegetationSettings,
  patch: Record<string, unknown>,
): SceneVegetationSettings {
  const next = { ...current };
  if (patch.enabled !== undefined) {
    const enabled = optionalBoolean(patch.enabled, "vegetation.enabled");
    if (enabled !== undefined) next.enabled = enabled;
  }
  for (const [field, minimum] of [
    ["windStrength", 0],
    ["windSpeed", 0],
    ["gustStrength", 0],
  ] as const) {
    if (patch[field] !== undefined) {
      next[field] = sceneNumber(patch[field], `vegetation.${field}`, minimum);
    }
  }
  if (patch.windDirectionDegrees !== undefined) {
    next.windDirectionDegrees = sceneNumber(
      patch.windDirectionDegrees,
      "vegetation.windDirectionDegrees",
    );
  }
  return next;
}

function applyPhysicsPatch(
  current: ScenePhysicsSettings,
  patch: Record<string, unknown>,
): ScenePhysicsSettings {
  const next = { ...current };
  if (patch.gravity !== undefined) {
    // Zero is allowed — a weightless world is a legitimate setting — but a
    // negative value would invert the direction XRift derives from this.
    next.gravity = sceneNumber(patch.gravity, "physics.gravity", 0, 100);
  }
  if (patch.allowInfiniteJump !== undefined) {
    if (typeof patch.allowInfiniteJump !== "boolean") {
      invalidArgument("physics.allowInfiniteJump", "boolean");
    }
    next.allowInfiniteJump = patch.allowInfiniteJump;
  }
  return next;
}

function applySceneEditorPatch(
  current: SceneSettings["editor"],
  patch: Record<string, unknown>,
): SceneSettings["editor"] {
  const next: SceneSettings["editor"] = {
    ...current,
    gizmo: { ...current.gizmo },
  };
  if (patch.backgroundColor !== undefined) {
    next.backgroundColor = sceneColor(
      patch.backgroundColor,
      "editor.backgroundColor",
    );
  }
  if (patch.gizmo !== undefined) {
    next.gizmo = applyGizmoPatch(
      current.gizmo,
      sceneSettingsPatch(patch.gizmo, "editor.gizmo", [
        "size",
        "gridVisible",
        "gridSize",
        "gridDivisions",
        "snapEnabled",
        "snapHoldShift",
        "translateSnap",
        "rotateSnapDegrees",
        "scaleSnap",
      ]),
    );
  }
  return next;
}

function applyGizmoPatch(
  current: SceneGizmoSettings,
  patch: Record<string, unknown>,
): SceneGizmoSettings {
  const next = { ...current };
  for (const field of [
    "gridVisible",
    "snapEnabled",
    "snapHoldShift",
  ] as const) {
    const value = optionalBoolean(patch[field], `editor.gizmo.${field}`);
    if (value !== undefined) next[field] = value;
  }
  for (const [field, minimum] of [
    ["size", 0.1],
    ["gridSize", 1],
    ["translateSnap", 0.001],
    ["rotateSnapDegrees", 0.1],
    ["scaleSnap", 0.001],
  ] as const) {
    if (patch[field] !== undefined) {
      next[field] = sceneNumber(
        patch[field],
        `editor.gizmo.${field}`,
        minimum,
      );
    }
  }
  if (patch.gridDivisions !== undefined) {
    if (
      typeof patch.gridDivisions !== "number" ||
      !Number.isSafeInteger(patch.gridDivisions) ||
      patch.gridDivisions < 1
    ) {
      invalidArgument("editor.gizmo.gridDivisions", "integer >= 1");
    }
    next.gridDivisions = patch.gridDivisions;
  }
  return next;
}

function sceneColor(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    invalidArgument(name, "#rrggbb");
  }
  return value.toLowerCase();
}

function sceneNumber(
  value: unknown,
  name: string,
  minimum?: number,
  maximum?: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (minimum !== undefined && value < minimum) ||
    (maximum !== undefined && value > maximum)
  ) {
    invalidArgument(
      name,
      minimum === undefined
        ? "finite number"
        : maximum === undefined
          ? `number >= ${minimum}`
          : `number between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function sceneVec3(
  value: unknown,
  name: string,
  minimum?: number,
): Vec3 {
  const vector = optionalVec3(value, name);
  if (
    !vector ||
    (minimum !== undefined && vector.some((entry) => entry < minimum))
  ) {
    invalidArgument(
      name,
      minimum === undefined ? "[x, y, z]" : `[x, y, z] (each >= ${minimum})`,
    );
  }
  return vector;
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

function sameSceneSettings(
  left: SceneSettings,
  right: SceneSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasCanonicalSceneQualitySettings(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const vegetation = settings.vegetation;
  const postprocessing = settings.postprocessing;
  if (!postprocessing || typeof postprocessing !== "object" || Array.isArray(postprocessing)) {
    return false;
  }
  const post = postprocessing as Record<string, unknown>;
  return (
    vegetation !== undefined &&
    typeof vegetation === "object" &&
    vegetation !== null &&
    !Array.isArray(vegetation) &&
    post.hdr !== undefined &&
    typeof post.hdr === "object" &&
    post.hdr !== null &&
    !Array.isArray(post.hdr) &&
    post.ao !== undefined &&
    typeof post.ao === "object" &&
    post.ao !== null &&
    !Array.isArray(post.ao)
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
    // The Animation Component is gone; a document still carrying one has not
    // been opened since v1, and it maps to no definition an agent can add.
    case "animation":
      return null;
    case "vegetation-wind":
      return "core.wind";
    case "audio-source":
      return "core.audio-source";
    case "text":
      return "core.text";
    case "script":
      return "scripting.script";
    case "interaction-trigger":
      return "interaction.trigger";
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

export function mcpTextureImportSettingsPatch(
  value: unknown,
  name = "patch",
  options: { allowEmpty?: boolean } = {},
): TextureImportSettingsPatch {
  const patch = recordValue(value, name);
  if (!isJsonValue(patch)) invalidArgument(name, "finite JSON object");
  assertObjectKeys(patch, name, [
    "colorSpace",
    "generateMipmaps",
    "flipY",
    "resize",
    "sampler",
    "compression",
  ]);
  if (!options.allowEmpty && Object.keys(patch).length === 0) {
    invalidArgument(name, "non-empty object");
  }

  const result: TextureImportSettingsPatch = {};
  if (patch.colorSpace !== undefined) {
    result.colorSpace = requiredEnum(
      patch.colorSpace,
      `${name}.colorSpace`,
      TEXTURE_COLOR_SPACES,
    );
  }
  if (patch.generateMipmaps !== undefined) {
    result.generateMipmaps = requiredBoolean(
      patch.generateMipmaps,
      `${name}.generateMipmaps`,
    );
  }
  if (patch.flipY !== undefined) {
    result.flipY = requiredBoolean(patch.flipY, `${name}.flipY`);
  }
  if (patch.resize !== undefined) {
    const resize = recordValue(patch.resize, `${name}.resize`);
    assertObjectKeys(resize, `${name}.resize`, ["mode", "maxSize"]);
    const mode = requiredEnum(
      resize.mode,
      `${name}.resize.mode`,
      ["original", "max-size"] as const,
    );
    if (mode === "original") {
      if (resize.maxSize !== undefined) {
        invalidArgument(`${name}.resize.maxSize`, "omitted for original mode");
      }
      result.resize = { mode };
    } else {
      const maxSize = requiredInteger(
        resize.maxSize,
        `${name}.resize.maxSize`,
      );
      if (maxSize < 1 || maxSize > 16_384) {
        invalidArgument(`${name}.resize.maxSize`, "integer from 1 to 16384");
      }
      result.resize = { mode, maxSize };
    }
  }
  if (patch.sampler !== undefined) {
    const sampler = recordValue(patch.sampler, `${name}.sampler`);
    assertObjectKeys(sampler, `${name}.sampler`, [
      "wrapS",
      "wrapT",
      "magFilter",
      "minFilter",
    ]);
    if (Object.keys(sampler).length === 0) {
      invalidArgument(`${name}.sampler`, "non-empty object");
    }
    result.sampler = {
      ...(sampler.wrapS === undefined
        ? {}
        : {
            wrapS: requiredEnum(
              sampler.wrapS,
              `${name}.sampler.wrapS`,
              TEXTURE_WRAP_MODES,
            ),
          }),
      ...(sampler.wrapT === undefined
        ? {}
        : {
            wrapT: requiredEnum(
              sampler.wrapT,
              `${name}.sampler.wrapT`,
              TEXTURE_WRAP_MODES,
            ),
          }),
      ...(sampler.magFilter === undefined
        ? {}
        : {
            magFilter: requiredEnum(
              sampler.magFilter,
              `${name}.sampler.magFilter`,
              TEXTURE_MAG_FILTERS,
            ),
          }),
      ...(sampler.minFilter === undefined
        ? {}
        : {
            minFilter: requiredEnum(
              sampler.minFilter,
              `${name}.sampler.minFilter`,
              TEXTURE_MIN_FILTERS,
            ),
          }),
    };
  }
  if (patch.compression !== undefined) {
    const compression = recordValue(
      patch.compression,
      `${name}.compression`,
    );
    assertObjectKeys(compression, `${name}.compression`, [
      "format",
      "quality",
    ]);
    if (Object.keys(compression).length === 0) {
      invalidArgument(`${name}.compression`, "non-empty object");
    }
    const quality =
      compression.quality === undefined
        ? undefined
        : optionalFiniteNumber(
            compression.quality,
            `${name}.compression.quality`,
          );
    if (quality !== undefined && (quality < 0 || quality > 100)) {
      invalidArgument(`${name}.compression.quality`, "number from 0 to 100");
    }
    result.compression = {
      ...(compression.format === undefined
        ? {}
        : {
            format: requiredEnum(
              compression.format,
              `${name}.compression.format`,
              TEXTURE_COMPRESSION_FORMATS,
            ),
          }),
      ...(quality === undefined ? {} : { quality }),
    };
  }
  return result;
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

/**
 * Declares which Patch fields `update_component` accepts, and fails the build
 * when the Patch type and this list stop agreeing.
 *
 * The allow-list has to exist at runtime, so it cannot be read off the type.
 * That made it a hand-copy of the Patch definition, and a field added to a
 * component without being copied here becomes quietly unsettable through MCP —
 * the same silent-drift failure that already produced one shipped bug in the
 * document validators. Passing the list through here turns that into a compile
 * error naming the field that was left out.
 */
function patchKeysOf<Patch>() {
  return <const Keys extends readonly (keyof Patch)[]>(
    keys: Exclude<keyof Patch, Keys[number]> extends never
      ? Keys
      : {
          error: "update_component is missing a Patch field";
          missing: Exclude<keyof Patch, Keys[number]>;
        },
  ): readonly string[] => keys as readonly string[];
}

const RIGID_BODY_PATCH_KEYS = patchKeysOf<RigidBodyPatch>()([
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
]);

const COLLIDER_PATCH_KEYS = patchKeysOf<ColliderPatch>()([
  "collisionModelAssetId",
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
]);

const LIGHT_PATCH_KEYS = patchKeysOf<LightPatch>()([
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
]);

const TEXT_PATCH_KEYS = patchKeysOf<TextPatch>()([
  "enabled",
  "text",
  "color",
  "fontSize",
  "maxWidth",
  "anchorX",
  "anchorY",
  "outlineWidth",
  "outlineColor",
  "fontId",
  "fontWeight",
  "fontAssetId",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "background",
]);

const AUDIO_SOURCE_PATCH_KEYS = patchKeysOf<AudioSourcePatch>()([
  "enabled",
  "audioAssetId",
  "volume",
  "loop",
  "autoplay",
  "spatial",
  "refDistance",
  "rolloffFactor",
  "maxDistance",
]);

/**
 * `entityReferences` is deliberately absent.
 *
 * It is derived from the graph the Component points at, not authored, so a
 * caller that could set it would be able to write a list the graph disagrees
 * with. Pointing the Component at another Asset re-derives it instead.
 */
const INTERACTION_TRIGGER_PATCH_KEYS = patchKeysOf<
  Pick<InteractionTriggerPatch, "enabled" | "interactivityAssetId">
>()(["enabled", "interactivityAssetId"]);

function assertPatchKeys(  patch: Record<string, unknown>,
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
      key === "modelPose" && value === null
        ? component[key as keyof SceneComponent] === undefined
        : JSON.stringify(component[key as keyof SceneComponent]) ===
          JSON.stringify(value),
  );
}

function modelAssetPatchValue(
  value: unknown,
  context: XriftMcpEditorContext,
): ModelAssetPatch {
  const patch = recordValue(value, "patch");
  assertObjectKeys(patch, "patch", ["importSettings", "materialSlotBindings"]);
  if (Object.keys(patch).length === 0) invalidArgument("patch", "non-empty object");

  let importSettings: Record<string, unknown> | undefined;
  if (patch.importSettings !== undefined) {
    importSettings = recordValue(patch.importSettings, "patch.importSettings");
    assertObjectKeys(importSettings, "patch.importSettings", [
      "scale",
      "generateColliders",
      "optimizeMeshes",
      "importAnimations",
    ]);
    if (importSettings.scale !== undefined) {
      sceneNumber(importSettings.scale, "patch.importSettings.scale", 0.000001);
    }
    for (const field of [
      "generateColliders",
      "optimizeMeshes",
      "importAnimations",
    ]) {
      optionalBoolean(importSettings[field], `patch.importSettings.${field}`);
    }
    if (Object.keys(importSettings).length === 0) {
      invalidArgument("patch.importSettings", "non-empty object");
    }
  }

  let materialSlotBindings: Record<string, string | null> | undefined;
  if (patch.materialSlotBindings !== undefined) {
    const modelSlotBindings = recordValue(
      patch.materialSlotBindings,
      "patch.materialSlotBindings",
    );
    materialSlotBindings = {};
    for (const [slot, value] of Object.entries(modelSlotBindings)) {
      if (value === null) {
        materialSlotBindings[slot] = null;
        continue;
      }
      const materialAssetId = requiredString(
        value,
        `patch.materialSlotBindings.${slot}`,
      );
      const material = context.bundle.assets.assets[materialAssetId];
      if (!material) {
        throw new XriftMcpEditorToolError(
          "ASSET_NOT_FOUND",
          "ModelのMaterial slotに指定されたAssetが見つかりません",
          { materialAssetId, slot },
        );
      }
      if (material.kind !== "material") {
        throw new XriftMcpEditorToolError(
          "ASSET_KIND_MISMATCH",
          "ModelのMaterial slotにはMaterial Assetを指定してください",
          { materialAssetId, slot, actualKind: material.kind },
        );
      }
      materialSlotBindings[slot] = materialAssetId;
    }
  }

  return {
    ...(importSettings
      ? { importSettings: JSON.parse(JSON.stringify(importSettings)) }
      : {}),
    ...(materialSlotBindings ? { materialSlotBindings } : {}),
  };
}

type McpMeshMaterialBinding = {
  slot: string;
  materialAssetId: string;
  sourceNodeIndex?: number;
};

function meshMaterialBindingsValue(
  value: unknown,
  context: XriftMcpEditorContext,
  mesh: Extract<SceneComponent, { type: "mesh" }>,
): McpMeshMaterialBinding[] {
  if (!Array.isArray(value)) {
    invalidArgument("patch.materialBindings", "array");
  }
  const availableSlots = new Set(
    getMeshMaterialSlots(mesh, context.bundle.assets).map((slot) => slot.slot),
  );
  const bindings: McpMeshMaterialBinding[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const binding = recordValue(candidate, `patch.materialBindings[${index}]`);
    assertObjectKeys(binding, `patch.materialBindings[${index}]`, [
      "slot",
      "materialAssetId",
      "sourceNodeIndex",
    ]);
    const slot = requiredString(
      binding.slot,
      `patch.materialBindings[${index}].slot`,
    );
    if (!availableSlots.has(slot)) {
      throw new XriftMcpEditorToolError(
        "INVALID_COMPONENT_PATCH",
        `指定されたMaterial slot「${slot}」はMesh Rendererにありません`,
        { slot, availableSlots: [...availableSlots] },
      );
    }
    const materialAssetId = requiredString(
      binding.materialAssetId,
      `patch.materialBindings[${index}].materialAssetId`,
    );
    const material = context.bundle.assets.assets[materialAssetId];
    if (!material) {
      throw new XriftMcpEditorToolError(
        "ASSET_NOT_FOUND",
        "Material bindingに指定されたAssetが見つかりません",
        { materialAssetId },
      );
    }
    if (material.kind !== "material") {
      throw new XriftMcpEditorToolError(
        "ASSET_KIND_MISMATCH",
        "Mesh RendererのbindingにはMaterial Assetを指定してください",
        { materialAssetId, actualKind: material.kind },
      );
    }
    const sourceNodeIndex = optionalNonNegativeInteger(
      binding.sourceNodeIndex,
      `patch.materialBindings[${index}].sourceNodeIndex`,
    );
    const key = `${slot}\u0000${sourceNodeIndex ?? ""}`;
    if (seen.has(key)) {
      invalidArgument(
        `patch.materialBindings[${index}]`,
        "同じslotとsourceNodeIndexの重複がないarray",
      );
    }
    seen.add(key);
    bindings.push({
      slot,
      materialAssetId,
      ...(sourceNodeIndex === undefined ? {} : { sourceNodeIndex }),
    });
  }
  return bindings;
}

function meshModelPoseValue(value: unknown): ModelPoseState | null {
  if (value === null) return null;
  const pose = recordValue(value, "patch.modelPose");
  assertObjectKeys(pose, "patch.modelPose", ["bones", "morphTargets", "nodes"]);

  const bones: Record<string, Vec3> = {};
  const boneValues =
    pose.bones === undefined
      ? {}
      : recordValue(pose.bones, "patch.modelPose.bones");
  for (const [name, value] of Object.entries(boneValues)) {
    const rotation = optionalVec3(value, `patch.modelPose.bones.${name}`);
    if (!rotation) {
      invalidArgument(`patch.modelPose.bones.${name}`, "3要素の有限数array");
    }
    bones[name] = rotation;
  }

  const morphTargets: Record<string, number> = {};
  const morphValues =
    pose.morphTargets === undefined
      ? {}
      : recordValue(pose.morphTargets, "patch.modelPose.morphTargets");
  for (const [name, value] of Object.entries(morphValues)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      invalidArgument(
        `patch.modelPose.morphTargets.${name}`,
        "0から1の有限数",
      );
    }
    morphTargets[name] = value;
  }

  let nodes: ModelPoseState["nodes"];
  if (pose.nodes !== undefined) {
    const nodeValues = recordValue(pose.nodes, "patch.modelPose.nodes");
    nodes = {};
    for (const [name, value] of Object.entries(nodeValues)) {
      const node = recordValue(value, `patch.modelPose.nodes.${name}`);
      assertObjectKeys(node, `patch.modelPose.nodes.${name}`, [
        "position",
        "rotation",
        "scale",
        "visible",
      ]);
      const position = optionalVec3(
        node.position,
        `patch.modelPose.nodes.${name}.position`,
      );
      const rotation = optionalVec3(
        node.rotation,
        `patch.modelPose.nodes.${name}.rotation`,
      );
      const scale = optionalVec3(
        node.scale,
        `patch.modelPose.nodes.${name}.scale`,
      );
      if (!position || !rotation || !scale) {
        invalidArgument(
          `patch.modelPose.nodes.${name}`,
          "position、rotation、scaleを持つobject",
        );
      }
      if (node.visible !== undefined && typeof node.visible !== "boolean") {
        invalidArgument(`patch.modelPose.nodes.${name}.visible`, "boolean");
      }
      nodes[name] = {
        position,
        rotation,
        scale,
        ...(node.visible === false ? { visible: false } : {}),
      };
    }
  }
  return {
    bones,
    morphTargets,
    ...(nodes === undefined ? {} : { nodes }),
  };
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidArgument(name, "object");
  }
  return value as Record<string, unknown>;
}

function assertObjectKeys(
  value: Record<string, unknown>,
  name: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}.${unsupported}は変更できません`,
      { field: `${name}.${unsupported}` },
    );
  }
}

function customShaderValue(value: unknown, name: string): ClassicR3fMaterialShader {
  const input = recordValue(value, name);
  if (!isJsonValue(input)) invalidArgument(name, "JSON object");
  const shader = {
    ...createDefaultCustomShader(),
    ...JSON.parse(JSON.stringify(input)),
    kind: "classic-r3f" as const,
  } as ClassicR3fMaterialShader;
  const diagnostics = validateClassicR3fMaterialShader(shader);
  if (diagnostics.length > 0) {
    throw new XriftMcpEditorToolError(
      "CUSTOM_SHADER_INVALID",
      "Custom Shaderの形式が不正です",
      { diagnostics },
    );
  }
  return shader;
}

function customShaderPatchValue(value: unknown): ClassicR3fMaterialShaderPatch {
  const patch = recordValue(value, "patch");
  if (!isJsonValue(patch)) invalidArgument("patch", "JSON object");
  assertObjectKeys(patch, "patch", [
    "sourceModulePath",
    "vertexShader",
    "fragmentShader",
    "uniforms",
    "variants",
    "animatedTimeUniform",
    "sourceModelAssetId",
    "vertexShaderAssetId",
    "fragmentShaderAssetId",
  ]);
  if (Object.keys(patch).length === 0) {
    invalidArgument("patch", "non-empty object");
  }
  return JSON.parse(JSON.stringify(patch)) as ClassicR3fMaterialShaderPatch;
}

function assertCustomShaderAssetReferences(
  assets: AssetManifest,
  shader: ClassicR3fMaterialShader,
): void {
  const references: Array<[
    "vertexShaderAssetId" | "fragmentShaderAssetId",
    "vertex" | "fragment",
  ]> = [
    ["vertexShaderAssetId", "vertex"],
    ["fragmentShaderAssetId", "fragment"],
  ];
  for (const [field, stage] of references) {
    const assetId = shader[field];
    if (!assetId) continue;
    const asset = assets.assets[assetId];
    if (!asset || asset.kind !== "shader") {
      throw new XriftMcpEditorToolError(
        "SHADER_ASSET_NOT_FOUND",
        `${field}で指定されたShader Assetが見つかりません`,
        { field, assetId },
      );
    }
    if (asset.stage !== stage) {
      throw new XriftMcpEditorToolError(
        "SHADER_STAGE_MISMATCH",
        `${field}には${stage} Shader Assetを指定してください`,
        { field, assetId, expectedStage: stage, actualStage: asset.stage },
      );
    }
  }
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
    "blending",
    "depthWrite",
    "alphaToCoverage",
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
    // MCP-friendly texture slot names. These match the slot names exposed by
    // the texture tools while the canonical persisted shape remains glTF.
    "baseColor",
    "baseColorTexture",
    "metallicRoughness",
    "metallicRoughnessTexture",
    "normal",
    "occlusion",
    "emissive",
  ]);
  const unsupported = Object.keys(patch).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `patch.${unsupported}は変更できません`,
    );
  }
  if (Object.keys(patch).length === 0) invalidArgument("patch", "non-empty object");

  const normalized = JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
  const pbr =
    normalized.pbrMetallicRoughness === undefined
      ? {}
      : recordValue(normalized.pbrMetallicRoughness, "patch.pbrMetallicRoughness");
  const moveTextureAlias = (
    aliases: readonly string[],
    target: Record<string, unknown>,
    targetKey: string,
  ) => {
    const supplied = aliases.filter((alias) => normalized[alias] !== undefined);
    if (supplied.length === 0) return;
    if (supplied.length > 1 || target[targetKey] !== undefined) {
      invalidArgument(`patch.${supplied[0]}`, `single value for ${targetKey}`);
    }
    target[targetKey] = normalized[supplied[0]];
    supplied.forEach((alias) => delete normalized[alias]);
  };
  moveTextureAlias(["baseColor", "baseColorTexture"], pbr, "baseColorTexture");
  moveTextureAlias(
    ["metallicRoughness", "metallicRoughnessTexture"],
    pbr,
    "metallicRoughnessTexture",
  );
  moveTextureAlias(["normal"], normalized, "normalTexture");
  moveTextureAlias(["occlusion"], normalized, "occlusionTexture");
  moveTextureAlias(["emissive"], normalized, "emissiveTexture");
  if (Object.keys(pbr).length > 0) normalized.pbrMetallicRoughness = pbr;
  return normalized as MaterialAssetPatch;
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

function requiredBoolean(value: unknown, name: string): boolean {
  const result = optionalBoolean(value, name);
  if (result === undefined) invalidArgument(name, "boolean");
  return result;
}

function optionalFiniteNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidArgument(name, "finite number");
  }
  return value;
}

function optionalNullableFiniteNumber(
  value: unknown,
  name: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalFiniteNumber(value, name) ?? null;
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
