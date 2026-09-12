import { ensureCatalogMaterialTextures } from "../../lib/visual-editor/asset-import-persistence";
import { catalogMaterialTextures } from "../../lib/visual-editor/catalog-material-dependencies";
import { getEditorEntityCreationDefinitions, getEditorComponentLabel } from "../../lib/visual-editor/editor-session";
import { applyModelReimportSettings } from "../../lib/visual-editor/model-reimport-impact";
import { colliderModelNode, setMeshCollision } from "../../lib/visual-editor/mesh-collision-actions";
import { textureProcessingSettings } from "../../lib/visual-editor/texture-processing";
import { normalizeTextureImportSettings } from "../../lib/visual-editor/asset-manifest";
import { authoringFingerprint, authoringStatus, changeAuthoringState, readAuthoringState } from "../../lib/visual-editor/world-authoring";
import { getWorldComponentAuthoring } from "../../lib/visual-editor/world-component-authoring";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  ASSET_IMPORT_ACCEPT,
  BUILTIN_ASSET_IDS,
  addDefaultDocumentAsset,
  applyExternalStoreInstall,
  applyExternalStoreInstallAndAnalyzeModel,
  applyOpenBrushCatalogInstall,
  applySkyShaderCatalogInstall,
  applyWaterShaderCatalogInstall,
  applyTerrainSurfaceCatalogInstall,
  setMeshMaterialBinding,
  TERRAIN_MATERIAL_SLOT,
  type TerrainSurfaceCatalogEntry,
  applyComponentCodeImportPlan,
  applyClassicProjectVisualImportEnhancements,
  analyzeComponentCode,
  prepareClassicProjectVisualAssetImports,
  addDefaultParticleAsset,
  analyzeAssetDeletion,
  detachAssetReferences,
  analyzeAssetFolderDeletion,
  autoFitBoxCollider,
  commitAssetImportPlanToDisk,
  commitAssetImportPlansToDisk,
  createAssetImportPlan,
  sha256AssetBytes,
  planModelCompanionBatch,
  type ThreeModelCompanionFile,
  createUnityPackageImportPlan,
  addEditorComponent,
  addAssetFolder,
  addPrefabAsset,
  addBuiltinPrimitiveEntity,
  assignMaterialToMeshSlots,
  commitEditorHistory,
  createEditorHistory,
  type EditorHistory,
  createDocumentId,
  createTextureCard,
  createOfficialXriftComponentSample,
  createEmptyEntity,
  createPrefabDocument,
  createPlaySession,
  createPrototypeProject,
  createDefaultScriptComponentState,
  createScriptRuntimeReport,
  classifyMcpPlayStartFailure,
  didScriptRuntimeApplyLatestSources,
  getBuiltinPrimitiveCreation,
  getColliderAutoFitBounds,
  getTransform,
  getMaterialAssignmentTarget,
  getMesh,
  getXriftComponentDefinition,
  normalizeMaterialProperties,
  commandForKeyboardEvent,
  copyEntityHierarchy,
  deleteEntityHierarchy,
  duplicateEntityHierarchy,
  deleteAssetIfUnreferenced,
  deleteEmptyAssetFolder,
  getEntityReparentDecision,
  instantiateBuiltinPrefab,
  instantiateSceneAsset,
  isEnvironmentTextureAsset,
  isUnityImportFileName,
  listBuiltinPrefabRecipes,
  moveLibraryAsset,
  moveLibraryFolder,
  pasteEntityHierarchy,
  removeXriftComponent,
  resolveAssetCreationFolderId,
  resolveSceneSettings,
  resolveSceneWind,
  formatSnapStep,
  nudgeTransformPatch,
  snapStepForMode,
  type NudgeAxis,
  type NudgeDirection,
  renameAsset,
  renameAssetFolder,
  renameEntity,
  resolvePrefabInstances,
  resolveEditorCommands,
  executeXriftMcpEditorTool,
  extractScriptContract,
  kindForPath,
  PROJECT_PACKAGE_EXTENSION_PATTERN,
  type AssetFormatKind,
  XriftMcpEditorToolError,
  type ScriptContract,
  shortcutForCommand,
  synchronizePlaySession,
  redoEditorHistory,
  replaceEditorHistoryPresent,
  reparentEntityHierarchy,
  reimportModelAssetFromDisk,
  undoEditorHistory,
  updateModelNodeEntityEnabled,
  updateModelNodeEntityTransform,
  updateAudioSourceComponent,
  updateVegetationWindComponent,
  updateColliderComponent,
  type ColliderComponent,
  optimizeColliderConfiguration,
  updateRigidBodyComponent,
  updateLightComponent,
  updateTextComponent,
  updateImageComponent,
  updateMeshShadowSettings,
  MESH_MAX_DISTANCE_MAX,
  MESH_MAX_DISTANCE_MIN,
  updateMaterialAsset,
  updateAssetThumbnail,
  updateModelAsset,
  updateParticleAsset,
  updatePrefabDocumentFromSource,
  updateTextureAsset,
  addDefaultInteractivityAsset,
  applyModelOptimization,
  applyTextureProcessing,
  applyTextureProcessingBatch,
  type ModelOptimizationOptions,
  MODEL_OPTIMIZATION_STEP_LABELS,
  bakeNodeColliderModel,
  isValidSimplifyRatio,
  planModelOptimization,
  planTextureProcessing,
  revertModelOptimization,
  revertTextureOptimization,
  collectInteractionTriggerTargets,
  createInteractionTriggerGraphExtension,
  createModelAnimationGraphExtension,
  syncInteractionTriggerReferences,
  XRIFT_COMPONENT_SCHEMA_IDS,
  updateInteractionTriggerComponent,
  updateInteractivityAsset,
  updateXriftComponent,
  type ColliderPatch,
  type RigidBodyPatch,
  type ComponentCodeImportPlan,
  type ClassicProjectVisualImportPreview,
  type ClassicProjectVisualImportSource,
  type AssetManifest,
  type AssetReferenceLocation,
  type ParticleAuthoringPreset,
  type SceneRecipe,
  instantiateSceneRecipe,
  type AudioSourcePatch,
  type InteractionTriggerPatch,
  type VegetationWindPatch,
  type LightPatch,
  type MaterialAssetPatch,
  type AssetThumbnailDescriptor,
  type ModelAssetPatch,
  type ModelReimportProgress,
  type OpenBrushCatalogEntry,
  type SkyShaderCatalogEntry,
  type WaterShaderCatalogEntry,
  type TerrainPreset,
  type EditorCommandId,
  type EntityClipboard,
  type ParticlePropertiesPatch,
  type PlaySession,
  type PrototypeVisualProject,
  type SceneGizmoSettings,
  type SceneSettings,
  type ScriptAsset,
  type ShaderAssetStage,
  type SceneDocument,
  type TextureAssetPatch,
  type TextureCardProfile,
  type TerrainViewportEditing,
  type TextPatch,
  type ImagePatch,
  type TransformPatch,
  type UpdateXriftComponentPatch,
  type Vec3,
  type VisualProjectKind,
  type KhrInteractivityExtension,
  type XriftMcpEditorToolName,
  type XriftComponentDefinition,
  mcpTextureImportSettingsPatch,
  describeVisualUploadCapabilities,
  createGlowMaterialAsset,
  ensureBuiltinMaterialAsset,
  glowMaterialAssetId,
  sceneBloomIsActive,
  type GlowFixtureShape,
  type GlowMaterialPreset,
  type MaterialAsset,
  xriftMcpToolSurface,
} from "../../lib/visual-editor";
import {
  tauri,
  type XriftMcpClientId,
  type XriftMcpClientStatus,
  type XriftMcpEditorRequestEvent,
  type XriftOllamaConfigurationResult,
  type XriftOllamaIntegrationId,
  type XriftOllamaStatus,
} from "../../lib/tauri";
import {
  EMPTY_MCP_HARNESS_STATE,
  recordMcpHarnessCall,
  withMcpHarnessWarning,
  type McpHarnessState,
} from "../../lib/visual-editor/mcp-harness-guard";
import { setProjectThumbnailFromAsset } from "../../lib/project-thumbnail";
import { AssetsPanel } from "./AssetsPanel";
import {
  ValueScrubContext,
  type ValueScrubTransaction,
} from "./value-scrub-transaction";
import { EnvironmentTextureThumbnailGenerationQueue } from "./EnvironmentTextureThumbnailGenerationQueue";
import { MaterialThumbnailGenerationQueue } from "./MaterialThumbnailGenerationQueue";
import { ModelThumbnailGenerationQueue } from "./ModelThumbnailGenerationQueue";
import { ExternalAssetStoreDialog } from "./ExternalAssetStoreDialog";
import type { SkyShaderInstallResult } from "./SkyShaderStore";
import type { WaterShaderInstallResult } from "./WaterShaderStore";
import type { TerrainPresetInstallResult } from "./TerrainPresetStore";
import type { GlowMaterialInstallResult } from "./GlowMaterialStore";
import type { ParticlePresetInstallResult } from "./ParticlePresetStore";
import type { SceneRecipeInstallResult } from "./SceneRecipeStore";
import {
  hasActiveAssetImport,
  resolveAssetOperationAvailability,
} from "./asset-operation-lock";
import {
  AUTOSAVE_SUPERSEDED,
  createSerializedAutosaveCoordinator,
  type SerializedAutosaveCoordinator,
} from "./autosave-coordinator";
import {
  AssetDeleteDialog,
  type AssetDeleteDialogTarget,
} from "./AssetDeleteDialog";
import { EditorCreateMenu } from "./EditorCreateMenu";
import { TextureImportSettingsPanel } from "./TextureImportSettingsPanel";
import { EditorImportMenu } from "./EditorImportMenu";
import { ComponentCodeImportDialog } from "./ComponentCodeImportDialog";
import { InteractivityGraphEditor } from "./InteractivityGraphEditor";
import { GuideLink } from "../guide/GuideLink";
import { EditorUtilityRail } from "./EditorUtilityRail";
import { useEditorDevice } from "./useEditorDevice";
import { EditorPanelVisibilityContext } from "./editor-panel-visibility";
import { SupportReportModal } from "../SupportReportModal";
import { ConfirmDialog } from "../ConfirmDialog";
import type { XriftMcpActivity } from "./AiConnectionPanel";
import { commandTitle, EDITOR_ICONS } from "./editor-icons";
import { HierarchyPanel } from "./HierarchyPanel";
import {
  ALL_MATERIAL_SLOTS,
  MaterialSlotAssignmentDialog,
  type MaterialSlotAssignmentOption,
} from "./MaterialSlotAssignmentDialog";
import type {
  ModelOptimizationState,
  ModelReimportState,
} from "./ModelAssetInspector";
import type { TextureProcessingState } from "./AssetQuickEditor";
import {
  InspectorPanel,
  type MeshInspectorPatch,
  type ParticleEmitterInspectorPatch,
} from "./InspectorPanel";
import {
  SceneViewport,
  SCENE_VIEW_TAB_ID,
  SCENE_VIEW_CAMERA_PRESETS,
  type SceneFocusState,
  type SceneViewCameraPreset,
  type SceneViewCameraRequest,
  type SceneViewCameraResult,
  type SceneBoundsRequest,
  type SceneBoundsResult,
} from "./SceneViewport";
import { recordingSession } from "../../lib/recording/recording-session";
import {
  isRecordingAspectRatio,
  isRecordingFrameRate,
  isRecordingShortEdge,
  normalizeRecordingProfile,
  recordingAspectValue,
  type RecordingProfile,
  type RecordingViewportSettings,
} from "../../lib/recording/recording-profile";
import {
  isRecordingCameraPreset,
  resolveRecordingCameraPose,
  type RecordingCameraBounds,
  type RecordingCameraMove,
  type RecordingCameraPose,
} from "../../lib/recording/recording-camera";
import { useRecordingClock, useRecordingSelector } from "./useRecordingSession";

/** Debug-surface tools the recording controller answers, before any project check. */
/**
 * The Assets a recipe added, laid over a manifest that moved underneath it.
 *
 * Anything the recipe created (Particle Assets, exported Models) is copied
 * onto the latest manifest; everything else keeps whatever the background
 * update wrote, such as a thumbnail that finished while the recipe's files
 * were being written.
 */
function mergeRecipeAssetsOntoLatest(
  before: AssetManifest,
  placed: AssetManifest,
  latest: AssetManifest,
): AssetManifest {
  const assets = { ...latest.assets };
  for (const [id, asset] of Object.entries(placed.assets)) {
    if (!(id in before.assets) || before.assets[id] !== asset) {
      assets[id] = asset;
    }
  }
  const folders = { ...(latest.folders ?? {}) };
  for (const [id, folder] of Object.entries(placed.folders ?? {})) {
    if (!(id in (before.folders ?? {}))) folders[id] = folder;
  }
  return {
    ...latest,
    assets,
    ...(Object.keys(folders).length > 0 || latest.folders ? { folders } : {}),
  };
}

/** How long set_play_mode waits for React to commit the requested mode. */
const PLAY_MODE_SETTLE_TIMEOUT_MS = 15_000;

const RECORDING_TOOL_NAMES: ReadonlySet<string> = new Set([
  "start_recording",
  "stop_recording",
  "get_recording_status",
  "set_recording_profile",
  "set_recording_viewport",
  "get_recording_viewport",
  "set_recording_camera",
  "get_recording_camera",
]);
import type { SceneScreenshotRequest } from "./SceneScreenshotCapture";
import type {
  SceneDebugCaptureRequest,
  SceneDebugCaptureResult,
} from "./SceneDebugCapture";
import type { ScriptViewportRuntime } from "./EntityScriptVisual";
import type { ScriptComponentPatch } from "./ScriptComponentInspector";
import {
  useScriptRuntime,
  type ScriptCompileError,
} from "./useScriptRuntime";
import { useScriptEditor } from "./useScriptEditor";
import { ScriptEditorWorkspace } from "./ScriptEditorWorkspace";
import { useShaderEditor } from "./useShaderEditor";
import { ShaderEditorDialog } from "./ShaderEditorDialog";
import {
  ScriptTemplateDialog,
  type ScriptTemplateCreateRequest,
} from "./ScriptTemplateDialog";
import {
  addScriptAsset,
  createScriptAsset,
  createScriptRelativePath,
  createScriptSampleSource,
} from "../../lib/visual-editor/scripting/script-files";
import {
  addShaderAsset,
  createShaderAsset,
  createShaderRelativePath,
  shaderStageFromFileName,
} from "../../lib/visual-editor/shader-files";
import { createScriptAssetRuntimeInputKey } from "../../lib/visual-editor/scripting/asset-runtime";
import {
  createScriptTemplateSource,
  DEFAULT_SCRIPT_TEMPLATE_ID,
  getScriptTemplate,
  listScriptTemplateSummaries,
  SCRIPT_TEMPLATE_CATALOG_VERSION,
} from "../../lib/visual-editor/scripting/script-templates";
import {
  collectRequiredScriptAssetIds,
  collectScriptReferencedAssetIds,
  collectScheduledScripts,
} from "../../lib/visual-editor/scripting/script-schedule";
import {
  normalizeScriptProvenance,
  type ScriptProvenanceDto,
  type ScriptSourceSnapshot,
} from "../../lib/visual-editor/scripting/script-trust";
import { formatFileSize, roundTo } from "./editor-utils";
import {
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_LAYOUT_STORAGE_KEY,
  loadEditorLayout,
  type VisualEditorLayout,
} from "./editor-layout";
import {
  DEFAULT_TEXTURE_IMPORT_COMPRESSION,
  DEFAULT_TEXTURE_IMPORT_MAX_SIZE,
  loadTextureImportCompression,
  loadTextureImportMaxSize,
  saveTextureImportCompression,
  saveTextureImportMaxSize,
  textureImportSettingsPatch,
  type TextureImportCompression,
  type TextureImportMaxSize,
} from "./texture-import-defaults";
import {
  assertMcpExternalStoreWrite,
  mcpFiniteNumber,
  mcpOptionalInteger,
  mcpOptionalScriptLanguage,
  mcpOptionalString,
  mcpOptionalVec3,
  mcpRequiredString,
  scriptCompileErrorsForMcp,
  waitForEditorCommit,
  waitForEditorState,
} from "./mcp-request-guards";
import {
  approvalRequiredSnapshots,
  blockingScriptCompileErrors,
  sameScriptExecutionScopeInput,
  type ScriptExecutionScopeInput,
} from "./script-execution-scope";
import type {
  EditorMode,
  EditorSelection,
  PendingImport,
  TransformMode,
  TransformSpace,
} from "./types";
import { useTerrainAuthoring } from "./useTerrainAuthoring";

export type { VisualEditorLayout } from "./editor-layout";

const IMPORT_RESOURCE_KIND: Readonly<
  Partial<Record<AssetFormatKind, PendingImport["resourceKind"]>>
> = {
  texture: "texture",
  model: "model",
  skybox: "skybox",
  audio: "audio",
  font: "font",
  shader: "shader",
};
const AUTOSAVE_DELAY_MS = 800;
const AUTOSAVE_MAX_ATTEMPTS = 4;
const AUTOSAVE_RETRY_DELAYS_MS = [300, 900, 1_800] as const;

type SceneSelection = Extract<EditorSelection, { kind: "entity" }> | null;

function sceneEntityIdsInHierarchyOrder(
  scene: PrototypeVisualProject["scene"],
): string[] {
  const entityIds: string[] = [];
  const visited = new Set<string>();
  const visit = (entityId: string) => {
    if (visited.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    visited.add(entityId);
    entityIds.push(entityId);
    entity.children.forEach(visit);
  };
  scene.rootEntityIds.forEach(visit);
  Object.keys(scene.entities).forEach(visit);
  return entityIds;
}

/**
 * Re-reads an Asset's delete dialog state from the current documents.
 *
 * Unlinking a reference changes what blocks the delete, so the dialog is
 * rebuilt from the analysis rather than edited in place; a row that is gone
 * cannot linger and a delete that is now possible is offered immediately.
 */
function describeAssetDeleteTarget(
  bundle: PrototypeVisualProject,
  assetId: string,
): AssetDeleteDialogTarget | null {
  const analysis = analyzeAssetDeletion(
    { assets: bundle.assets, scene: bundle.scene, prefabs: bundle.prefabs },
    assetId,
  );
  if (!analysis.asset) return null;
  return {
    kind: "asset",
    id: assetId,
    name: analysis.asset.name,
    canDelete: analysis.canDelete,
    references: analysis.references,
  };
}

type EditorSessionSnapshot = {
  bundle: PrototypeVisualProject;
  sceneSelection: SceneSelection;
  assetSelection: string | null;
};

type SaveStatus = "dirty" | "saving" | "saved" | "error" | "unavailable";

type TransformScrubTransaction = {
  entityId: string;
  before: EditorSessionSnapshot;
  saveStatus: SaveStatus;
};

type QueuedAssetImport = PendingImport & {
  file: File | null;
  folderId: string | null;
  /** Sidecar files the model referenced inside the same import batch. */
  companions: File[];
};

/**
 * Identifies a dropped file inside one import batch. A folder drop carries a
 * relative path, which keeps sidecars in nested texture folders resolvable.
 */
function importBatchPath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relative && relative.length > 0 ? relative : file.name;
}

type PendingMaterialAssignment = {
  entityId: string;
  meshComponentId: string;
  entityName: string;
  materialAssetId: string;
  materialName: string;
  slots: MaterialSlotAssignmentOption[];
} | null;

type ModelReimportFeedback = {
  assetId: string;
  state: ModelReimportState;
} | null;

type TextureProcessingFeedback = {
  assetId: string;
  state: TextureProcessingState;
} | null;

type ModelOptimizationFeedback = {
  assetId: string;
  state: ModelOptimizationState;
} | null;

function entityTransformMatches(
  left: PrototypeVisualProject["scene"],
  right: PrototypeVisualProject["scene"],
  entityId: string,
): boolean {
  const leftTransform = getTransform(left, entityId);
  const rightTransform = getTransform(right, entityId);
  if (!leftTransform || !rightTransform) return leftTransform === rightTransform;
  return (["position", "rotation", "scale"] as const).every((field) =>
    leftTransform[field].every(
      (value, index) => value === rightTransform[field][index],
    ),
  );
}

function assignSkyboxToScene(
  scene: PrototypeVisualProject["scene"],
  assetId: string,
): PrototypeVisualProject["scene"] {
  const settings = resolveSceneSettings(scene.settings);
  if (settings.skybox.imageAssetId === assetId) {
    return scene;
  }
  return {
    ...scene,
    settings: {
      ...settings,
      skybox: {
        ...settings.skybox,
        enabled: true,
        iblEnabled: true,
        imageAssetId: assetId,
      },
    },
  };
}

function assignSkyShaderToScene(
  scene: PrototypeVisualProject["scene"],
  assetId: string,
): PrototypeVisualProject["scene"] {
  const settings = resolveSceneSettings(scene.settings);
  if (
    settings.skybox.materialAssetId === assetId &&
    settings.skybox.enabled
  ) {
    return scene;
  }
  return {
    ...scene,
    settings: {
      ...settings,
      skybox: {
        ...settings.skybox,
        enabled: true,
        materialAssetId: assetId,
      },
    },
  };
}

function modelReimportStateFromProgress(
  progress: ModelReimportProgress,
): ModelReimportState {
  switch (progress.phase) {
    case "reading-source":
      return { phase: "reading", message: progress.message };
    case "inspecting-source":
      return { phase: "processing", message: progress.message };
    case "committing-assets":
      return { phase: "committing", message: progress.message };
    case "complete":
      return { phase: "succeeded", message: progress.message };
    case "failed":
      return { phase: "failed", message: progress.message };
  }
}

type RenameTarget =
  | { kind: "entity"; id: string; requestId: number }
  | { kind: "asset"; id: string; requestId: number }
  | { kind: "folder"; id: string; requestId: number }
  | null;

type ShaderEditorRequest =
  | { kind: "asset"; assetId: string }
  | { kind: "material"; assetId: string; stage: ShaderAssetStage }
  | null;

type EditorCommandPayload = {
  creationId?: string;
  entityId?: string;
  assetId?: string;
  folderId?: string | null;
  parentEntityId?: string | null;
  siblingIndex?: number;
  componentDefinitionId?: string;
};

/**
 * Editorの外（公開ダイアログの一括変換・最適化）で更新されたAsset Manifestを
 * Editorの履歴へ取り込む。`expectedAssets` が現在のManifestと参照ごと一致する
 * ときだけ適用し、途中で編集が入っていた場合は何もせずfalseを返す。
 */
export type ExternalAssetsCommit = (update: {
  expectedAssets: AssetManifest;
  nextAssets: AssetManifest;
  notice: string;
}) => boolean;

export type VisualEditorMcpProjectBridge = {
  /** The Editor's current documents, ahead of any pending autosave. */
  currentBundle: () => PrototypeVisualProject;
  /** Flushes the pending autosave. Resolves to the project path when known. */
  saveNow: () => Promise<string | undefined>;
  /** Saves, then leaves to the Library. Resolves false when the save failed. */
  leave: () => Promise<boolean>;
};

export type VisualEditorPrototypeProps = {
  projectKind: VisualProjectKind;
  onBack: () => void;
  /** Lets embedded surfaces name the actual destination instead of always saying Library. */
  backLabel?: string;
  projectName?: string;
  /** Desktop-only root used to resolve project-relative Asset sources. */
  projectPath?: string;
  /** Saved visual project documents take precedence over generated defaults. */
  initialBundle?: PrototypeVisualProject;
  /** Persistence is injected by the desktop shell; the editor remains IR-only. */
  onSave?: (
    bundle: PrototypeVisualProject,
  ) => void | string | Promise<void | string>;
  /** Upload/export orchestration is injected by the shell when available. */
  onUpload?: (bundle: PrototypeVisualProject) => void | Promise<void>;
  /** Portable project transfer is supplied by the browser shell. */
  onProjectExport?: (bundle: PrototypeVisualProject) => void | Promise<void>;
  onProjectImport?: () => void | Promise<void>;
  projectTransferBusy?: boolean;
  /**
   * 公開ダイアログなど、Editorの外で作られたAsset Manifestの更新を、この
   * セッションの履歴へ取り込むための登録口。外の処理がディスクへ書いた変換を
   * Editorが知らないままだと、次の保存が変換前のManifestで上書きしてしまう。
   */
  onRegisterExternalAssetsCommit?: (
    commit: ExternalAssetsCommit | null,
  ) => void;
  /**
   * MCP の project tool（公開・閉じる）を扱う shell に、この Editor の最新
   * bundle、保存、退出を渡す登録口。Editor が MCP 要求を受け取れる状態に
   * なってから登録し、unmount で null に戻す。shell はこれが null のあいだ、
   * Editor 向けの tool を「プロジェクトが開いていない」として断る。
   */
  onRegisterMcpProjectBridge?: (
    bridge: VisualEditorMcpProjectBridge | null,
  ) => void;
  /** Opens the desktop Classic export flow without changing authoring data. */
  onClassicExport?: (bundle: PrototypeVisualProject) => void | Promise<void>;
  /** Fresh only after the current documents and required publication files were staged. */
  compilationFresh?: boolean;
  /** The thumbnail is persisted outside the authoring document set. */
  onThumbnailChanged?: () => void;
  /** Upload review can request a clean capture from the current Scene View. */
  thumbnailCaptureRequest?: number;
  onThumbnailCaptured?: (dataUrl: string) => void;
  onThumbnailCaptureError?: (message: string) => void;
  /** The shell can persist and restore this value per workspace. */
  initialLayout?: Partial<VisualEditorLayout>;
  onLayoutChange?: (layout: VisualEditorLayout) => void;
};

/**
 * Gizmo settings - snap, its step sizes, the grid - are how the editor is set
 * up rather than what the scene contains, so they are carried across Undo and
 * Redo instead of being rewound with the document. Without this, turning snap
 * off and then undoing an unrelated move would turn snap back on, because the
 * restored snapshot still holds the value from when it was taken.
 */
function carryGizmoSettingsForward(
  restored: PrototypeVisualProject,
  live: PrototypeVisualProject,
): PrototypeVisualProject {
  const liveGizmo = resolveSceneSettings(live.scene.settings).editor.gizmo;
  const restoredSettings = resolveSceneSettings(restored.scene.settings);
  if (
    JSON.stringify(restoredSettings.editor.gizmo) === JSON.stringify(liveGizmo)
  ) {
    return restored;
  }
  return {
    ...restored,
    scene: {
      ...restored.scene,
      settings: {
        ...restoredSettings,
        editor: { ...restoredSettings.editor, gizmo: liveGizmo },
      },
    },
  };
}

/** Applies carryGizmoSettingsForward to the snapshot Undo or Redo restored. */
function withLiveGizmoSettings(
  history: EditorHistory<EditorSessionSnapshot>,
  live: PrototypeVisualProject,
): EditorHistory<EditorSessionSnapshot> {
  const bundle = carryGizmoSettingsForward(history.present.bundle, live);
  return bundle === history.present.bundle
    ? history
    : replaceEditorHistoryPresent(history, { ...history.present, bundle });
}

function touchProject(bundle: PrototypeVisualProject): PrototypeVisualProject {
  return {
    ...bundle,
    project: {
      ...bundle.project,
      metadata: {
        ...bundle.project.metadata,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function preparePrototypeProject(
  projectKind: VisualProjectKind,
  projectName?: string,
  sourceBundle?: PrototypeVisualProject,
): PrototypeVisualProject {
  const bundle = sourceBundle ?? createPrototypeProject(projectKind, projectName);
  const normalizedAssets = Object.fromEntries(
    Object.entries(bundle.assets.assets).map(([id, asset]) => [
      id,
      asset.kind === "material"
        ? {
            ...asset,
            properties: normalizeMaterialProperties(
              asset.properties as unknown as MaterialAssetPatch,
            ),
          }
        : asset,
    ]),
  );

  return {
    ...bundle,
    assets: { ...bundle.assets, assets: normalizedAssets },
  };
}

function synchronizeProjectShellSnapshot(
  snapshot: EditorSessionSnapshot,
  project: PrototypeVisualProject["project"],
): EditorSessionSnapshot {
  const currentProject = snapshot.bundle.project;
  if (
    currentProject.projectId !== project.projectId ||
    (currentProject.metadata === project.metadata &&
      currentProject.lastPublication === project.lastPublication)
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    bundle: {
      ...snapshot.bundle,
      project: {
        ...currentProject,
        metadata: project.metadata,
        lastPublication: project.lastPublication,
      },
    },
  };
}

/**
 * A display name no other Asset already uses.
 *
 * Preset names are fixed, so adding 炎 twice would otherwise leave two Assets
 * called 炎 and no way to tell which Entity holds which. IDs stay unique on
 * their own; this is only about what the author reads.
 */
function uniqueAssetName(assets: AssetManifest, base: string): string {
  const taken = new Set(
    Object.values(assets.assets).map((asset) => asset.name),
  );
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

function firstAssetId(bundle: PrototypeVisualProject): string | null {
  return (
    Object.values(bundle.assets.assets).find((asset) => asset.kind === "material")?.id ??
    Object.values(bundle.assets.assets).find((asset) => asset.kind !== "primitive")?.id ??
    null
  );
}

function importIsActive(status: PendingImport["status"]): boolean {
  return (
    status === "queued" ||
    status === "reading" ||
    status === "processing" ||
    status === "committing"
  );
}

function createScriptRuntimeInputKey(
  scene: SceneDocument,
  assets: AssetManifest,
): string {
  const scriptAssetIds = collectRequiredScriptAssetIds(scene);
  const referencedAssetIds = collectScriptReferencedAssetIds(scene);
  return JSON.stringify({
    scripts: scriptAssetIds.map((assetId) => {
      const asset = assets.assets[assetId];
      return [
        assetId,
        asset?.kind === "script" ? asset.source.relativePath : null,
      ];
    }),
    assets: createScriptAssetRuntimeInputKey(assets, referencedAssetIds),
  });
}

type EnterPlayModeOptions = {
  /** Identifies a direct Studio Play action (legacy caller compatibility). */
  interactive?: boolean;
  unapprovedPolicy?: "block" | "skip";
  /** Used only after the current import transaction has already committed. */
  ignoreImportBusy?: boolean;
};

type EnterPlayModeResult = {
  started: boolean;
  errors: ScriptCompileError[];
  approvalRequired: ScriptSourceSnapshot[];
  skippedAssetIds: string[];
};

function sanitizedImportMessage(error: unknown, projectPath: string): string {
  let message = error instanceof Error ? error.message : String(error);
  if (message.includes("asset import target has different content")) {
    return "既存のインポート済みデータと内容が一致しません。元ファイルを確認するか、別名で取り込んでください";
  }
  if (
    message.includes("asset import target is not a regular file") ||
    message.includes("asset import target cannot be verified")
  ) {
    return "既存のインポート済みデータを安全に確認できませんでした。保存先の状態を確認してください";
  }
  const pathVariants = [projectPath, projectPath.replace(/\\/g, "/")].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  for (const path of pathVariants) {
    message = message.split(path).join("プロジェクト");
  }
  return message.replace(/data:[^\s]+/gi, "[アセットデータ]");
}

/** The graph editor's tab in the Scene View's cell. */
const INTERACTIVITY_GRAPH_TAB_ID = "interactivity-graph";
const SCRIPT_TAB_ID = "script-editor";

export function VisualEditorPrototype({
  projectKind,
  onBack,
  backLabel = "プロジェクト一覧",
  projectName,
  projectPath,
  initialBundle: providedInitialBundle,
  onSave,
  onUpload,
  onProjectExport,
  onProjectImport,
  projectTransferBusy = false,
  onRegisterExternalAssetsCommit,
  onRegisterMcpProjectBridge,
  onClassicExport,
  compilationFresh = false,
  onThumbnailChanged,
  thumbnailCaptureRequest = 0,
  onThumbnailCaptured,
  onThumbnailCaptureError,
  initialLayout,
  onLayoutChange,
}: VisualEditorPrototypeProps) {
  const { tablet: isTablet, phone, touch, viewportHeight } = useEditorDevice();
  const tablet = isTablet || phone;
  const headerActionsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!tablet) return;
    const closeOutside = (event: PointerEvent) => {
      if (!headerActionsRef.current?.contains(event.target as Node)) headerActionsRef.current?.removeAttribute("open");
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [tablet]);
  const [tabletPanel, setTabletPanel] = useState<"hierarchy" | "assets" | "inspector" | null>(phone ? null : "hierarchy");
  const projectExportLock = useRef(false);
  const [projectExportBusy, setProjectExportBusy] = useState(false);
  const initialBundle = useMemo(
    () => preparePrototypeProject(projectKind, projectName, providedInitialBundle),
    [projectKind, projectName, providedInitialBundle],
  );
  const createInitialSnapshot = useCallback(
    (): EditorSessionSnapshot => ({
      bundle: initialBundle,
      sceneSelection: initialBundle.scene.rootEntityIds[0]
        ? { kind: "entity", id: initialBundle.scene.rootEntityIds[0] }
        : null,
      assetSelection: firstAssetId(initialBundle),
    }),
    [initialBundle],
  );
  const [history, setRenderedHistory] = useState(() =>
    createEditorHistory(createInitialSnapshot(), 80),
  );
  const bundle = history.present.bundle;
  const bundleRef = useRef(bundle);
  const historyRef = useRef(history);
  // Editor commands also update notices, selection and save status. Execute
  // them once at dispatch, not inside a React updater which can be replayed
  // during render. Keep consecutive commands on the latest pending history.
  const setHistory = useCallback((action: SetStateAction<typeof history>) => {
    const current = historyRef.current;
    const next = typeof action === "function" ? action(current) : action;
    if (next === current) return;
    historyRef.current = next;
    bundleRef.current = next.present.bundle;
    setRenderedHistory(next);
  }, []);
  /**
   * 数値をドラッグで動かしている間に立つ。ドラッグ中の変更は present を
   * 置き換えるだけにし、ポインタを離した時に Undo 一件へまとめる。
   */
  const valueScrubRef = useRef<{
    before: (typeof history)["present"];
    saveStatus: SaveStatus;
  } | null>(null);
  const [debugCaptureRequest, setDebugCaptureRequest] =
    useState<SceneDebugCaptureRequest | null>(null);
  const debugCaptureRequestIdRef = useRef(0);
  const debugCaptureWaitersRef = useRef(
    new Map<number, (result: SceneDebugCaptureResult) => void>(),
  );
  const requestDebugCapture = useCallback(
    (request: Omit<SceneDebugCaptureRequest, "id">) =>
      new Promise<SceneDebugCaptureResult>((resolve) => {
        const id = debugCaptureRequestIdRef.current + 1;
        debugCaptureRequestIdRef.current = id;
        debugCaptureWaitersRef.current.set(id, resolve);
        setDebugCaptureRequest({ ...request, id });
      }),
    [],
  );
  const resolveDebugCapture = useCallback((result: SceneDebugCaptureResult) => {
    const waiter = debugCaptureWaitersRef.current.get(result.requestId);
    if (!waiter) return;
    debugCaptureWaitersRef.current.delete(result.requestId);
    waiter(result);
  }, []);

  // A still frame and a camera move, requested the same way the debug capture
  // is: an id the viewport reacts to, and a waiter the request resolves.
  const [sceneScreenshotRequest, setSceneScreenshotRequest] =
    useState<SceneScreenshotRequest | null>(null);
  const sceneScreenshotIdRef = useRef(0);
  const requestSceneScreenshot = useCallback(
    () =>
      new Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }>(
        (resolve) => {
          const id = sceneScreenshotIdRef.current + 1;
          sceneScreenshotIdRef.current = id;
          let settled = false;
          const settle = (
            result: { ok: true; dataUrl: string } | { ok: false; message: string },
          ) => {
            if (settled) return;
            settled = true;
            resolve(result);
          };
          setSceneScreenshotRequest({
            id,
            onCapture: (dataUrl) => settle({ ok: true, dataUrl }),
            onError: (message) => settle({ ok: false, message }),
          });
          // The Canvas does not render while the window is hidden, so a request
          // that never reaches a frame must still answer the MCP client.
          window.setTimeout(
            () =>
              settle({
                ok: false,
                message: "シーンのフレームを取得できませんでした",
              }),
            5_000,
          );
        },
      ),
    [],
  );
  const [sceneCameraRequest, setSceneCameraRequest] =
    useState<SceneViewCameraRequest | null>(null);
  const sceneCameraRequestIdRef = useRef(0);
  const sceneCameraWaitersRef = useRef(
    new Map<number, (result: SceneViewCameraResult) => void>(),
  );
  const requestSceneCamera = useCallback(
    (request: Omit<SceneViewCameraRequest, "id">) =>
      new Promise<SceneViewCameraResult>((resolve) => {
        const id = sceneCameraRequestIdRef.current + 1;
        sceneCameraRequestIdRef.current = id;
        sceneCameraWaitersRef.current.set(id, resolve);
        setSceneCameraRequest({ ...request, id });
      }),
    [],
  );
  const resolveSceneCamera = useCallback((result: SceneViewCameraResult) => {
    const waiter = sceneCameraWaitersRef.current.get(result.requestId);
    if (!waiter) return;
    sceneCameraWaitersRef.current.delete(result.requestId);
    waiter(result);
  }, []);
  // Bounds for the recording camera, measured by the viewport the same way a
  // camera move is requested: an id it reacts to, and a waiter the result
  // resolves. A hidden Canvas never answers, so the waiter times out.
  const [sceneBoundsRequest, setSceneBoundsRequest] =
    useState<SceneBoundsRequest | null>(null);
  const sceneBoundsRequestIdRef = useRef(0);
  const sceneBoundsWaitersRef = useRef(
    new Map<number, (result: SceneBoundsResult) => void>(),
  );
  const requestSceneBounds = useCallback(
    (entityId?: string) =>
      new Promise<SceneBoundsResult>((resolve) => {
        const id = sceneBoundsRequestIdRef.current + 1;
        sceneBoundsRequestIdRef.current = id;
        sceneBoundsWaitersRef.current.set(id, resolve);
        setSceneBoundsRequest({ id, ...(entityId ? { entityId } : {}) });
        window.setTimeout(() => {
          const waiter = sceneBoundsWaitersRef.current.get(id);
          if (!waiter) return;
          sceneBoundsWaitersRef.current.delete(id);
          waiter({
            requestId: id,
            ok: false,
            bounds: null,
            measuredEntityCount: 0,
            message: "シーンが表示されていないため測定できませんでした",
          });
        }, 5_000);
      }),
    [],
  );
  const resolveSceneBounds = useCallback((result: SceneBoundsResult) => {
    const waiter = sceneBoundsWaitersRef.current.get(result.requestId);
    if (!waiter) return;
    sceneBoundsWaitersRef.current.delete(result.requestId);
    waiter(result);
  }, []);

  // Recording lives in its own controller so a take survives this component;
  // the shell only binds it to the open project and gives it a place to move
  // the camera from.
  const recordingViewport = useRecordingSelector((state) => state.viewport);
  useRecordingClock();
  useEffect(() => {
    recordingSession.setActiveProject(bundle.project.projectId);
  }, [bundle.project.projectId]);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const moveRecordingCamera = useCallback(
    async (
      move: RecordingCameraMove & { fitScene?: boolean; focusEntityId?: string },
    ): Promise<{
      pose: RecordingCameraPose;
      bounds: RecordingCameraBounds | null;
      skippedLargeMeshCount: number;
    }> => {
      let bounds: RecordingCameraBounds | null = null;
      let skippedLargeMeshCount = 0;
      if (move.fitScene || move.focusEntityId) {
        const measured = await requestSceneBounds(move.focusEntityId);
        if (!measured.ok || !measured.bounds) {
          throw new Error(
            measured.message ?? "録画用カメラの対象を測定できませんでした",
          );
        }
        bounds = measured.bounds;
        skippedLargeMeshCount = measured.skippedLargeMeshCount ?? 0;
      }
      const current = recordingSession.getState();
      const pose = resolveRecordingCameraPose(
        current.camera,
        {
          ...(move.preset ? { preset: move.preset } : {}),
          ...(move.position ? { position: move.position } : {}),
          ...(move.target ? { target: move.target } : {}),
          ...(move.distance === undefined ? {} : { distance: move.distance }),
          ...(move.fov === undefined ? {} : { fov: move.fov }),
          bounds,
        },
        { aspect: recordingAspectValue(current.profile.aspectRatio) },
      );
      return { pose: recordingSession.setCamera(pose), bounds, skippedLargeMeshCount };
    },
    [requestSceneBounds],
  );
  const startRecordingTake = useCallback(
    async (options: {
      label?: string | null;
      clientName?: string | null;
      profile?: RecordingProfile;
      showViewport?: boolean;
    }) => {
      if (options.showViewport !== false) {
        recordingSession.setViewport({ visible: true });
      }
      setRecordingBusy(true);
      try {
        const current = bundleRef.current;
        return await recordingSession.startRecording({
          projectPath: projectPathRef.current,
          label: options.label ?? null,
          clientName: options.clientName ?? null,
          ...(options.profile ? { profile: options.profile } : {}),
          projectId: current.project.projectId,
          projectTitle: current.project.metadata.title,
          sceneId: current.scene.sceneId,
        });
      } finally {
        setRecordingBusy(false);
      }
    },
    [],
  );
  const stopRecordingTake = useCallback(async () => {
    setRecordingBusy(true);
    try {
      return await recordingSession.stopRecording();
    } finally {
      setRecordingBusy(false);
    }
  }, []);
  const mcpRevisionRef = useRef(0);
  // Streak of same-category writes since the last capture. Session memory only;
  // it is never written to the project.
  const mcpHarnessStateRef = useRef<McpHarnessState>(EMPTY_MCP_HARNESS_STATE);
  const mcpRevisionBundleRef = useRef(bundle);
  const mcpRevisionProjectRef = useRef(bundle.project.projectId);
  if (mcpRevisionProjectRef.current !== bundle.project.projectId) {
    mcpRevisionProjectRef.current = bundle.project.projectId;
    mcpRevisionBundleRef.current = bundle;
    mcpRevisionRef.current = 0;
  } else if (mcpRevisionBundleRef.current !== bundle) {
    mcpRevisionBundleRef.current = bundle;
    mcpRevisionRef.current += 1;
  }
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const activePlayUnapprovedPolicyRef = useRef<"block" | "skip">("block");
  const playPreparationGenerationRef = useRef(0);
  const playPreparationActiveRef = useRef(false);
  const scriptExecutionScopeInput: ScriptExecutionScopeInput = {
    projectId: bundle.project.projectId,
    projectPath: projectPath ?? null,
  };
  const scriptExecutionScopeInputRef = useRef(scriptExecutionScopeInput);
  const scriptExecutionScopeInputKey = JSON.stringify([
    scriptExecutionScopeInput.projectId,
    scriptExecutionScopeInput.projectPath,
  ]);
  const observedScriptExecutionScopeInputKeyRef = useRef(
    scriptExecutionScopeInputKey,
  );
  const resetScriptExecutionScopeInputKeyRef = useRef(
    scriptExecutionScopeInputKey,
  );
  if (
    observedScriptExecutionScopeInputKeyRef.current !==
    scriptExecutionScopeInputKey
  ) {
    observedScriptExecutionScopeInputKeyRef.current =
      scriptExecutionScopeInputKey;
    playPreparationGenerationRef.current += 1;
    playPreparationActiveRef.current = false;
    activePlayUnapprovedPolicyRef.current = "block";
  }
  // A project switch is first observed during render, while the cleanup
  // effect runs after commit. Never expose the previous project's compiled
  // modules or Play copy during that intervening render.
  const scriptExecutionScopeRenderCurrent =
    resetScriptExecutionScopeInputKeyRef.current ===
    scriptExecutionScopeInputKey;
  scriptExecutionScopeInputRef.current = scriptExecutionScopeInput;
  const scriptProvenanceRef = useRef(
    new Map<string, ScriptProvenanceDto>(),
  );
  const resolveScriptProvenance = useCallback(
    (assetId: string): ScriptProvenanceDto =>
      scriptProvenanceRef.current.get(assetId) ??
      normalizeScriptProvenance({ kind: "filesystem", detail: null }),
    [],
  );
  const resolvedScriptScene = useMemo(
    () =>
      resolvePrefabInstances(
        bundle.scene,
        bundle.assets,
        bundle.prefabs,
      ).scene,
    [bundle.assets, bundle.prefabs, bundle.scene],
  );
  const scriptRuntime = useScriptRuntime({
    scene: resolvedScriptScene,
    assets: bundle.assets,
    ...(projectPath ? { projectPath } : {}),
    resolveScriptProvenance,
  });
  const scriptRuntimeReport = useMemo(
    () =>
      scriptExecutionScopeRenderCurrent
        ? createScriptRuntimeReport(scriptRuntime.state)
        : createScriptRuntimeReport({
            status: "idle",
            failureRevision: 0,
            errors: [],
            failures: [],
            logs: [],
            trust: {
              status: "not-required",
              pending: [],
              skipped: [],
              running: [],
            },
          }),
    [scriptExecutionScopeRenderCurrent, scriptRuntime.state],
  );
  const scriptRuntimeReportRef = useRef(scriptRuntimeReport);
  scriptRuntimeReportRef.current = scriptRuntimeReport;
  const scriptSourceRevisionRef = useRef(0);
  const pendingScriptPathsRef = useRef(new Set<string>());
  const writeScriptEditorSource = useCallback(
    async (
      currentProjectPath: string,
      asset: ScriptAsset,
      source: string,
    ) => {
      const relativePath = asset.source.relativePath;
      if (pendingScriptPathsRef.current.has(relativePath)) {
        throw new Error("スクリプトを保存中です。完了後にやり直してください");
      }
      pendingScriptPathsRef.current.add(relativePath);
      try {
        await tauri.writeTextFile(currentProjectPath, relativePath, source);
      } finally {
        pendingScriptPathsRef.current.delete(relativePath);
      }
    },
    [],
  );
  const scriptRuntimeInputKey = useMemo(
    () => createScriptRuntimeInputKey(resolvedScriptScene, bundle.assets),
    [bundle.assets, resolvedScriptScene],
  );
  const preparedScriptRuntimeInputKeyRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const scriptEditor = useScriptEditor({
    assets: bundle.assets,
    ...(projectPath ? { projectPath } : {}),
    writeSource: writeScriptEditorSource,
    // Recompiling swaps the module object, and the host restarts on identity
    // change, so only Entities using this Script restart. Player position,
    // camera and physics keep running. See MI-72.
    onSaved: async (assetId) => {
      scriptSourceRevisionRef.current += 1;
      // Script source is outside the document bundle, but it is still part of
      // the MCP optimistic-concurrency boundary.
      mcpRevisionRef.current += 1;
      const asset = bundleRef.current.assets.assets[assetId];
      if (asset?.kind === "script") {
        scriptProvenanceRef.current.set(
          asset.id,
          normalizeScriptProvenance({ kind: "studio-editor", detail: null }),
        );
      }
      if (playingRef.current) {
        const runtimeErrors = await scriptRuntime.compile({
          unapprovedPolicy: activePlayUnapprovedPolicyRef.current,
        });
        const blockingErrors =
          blockingScriptCompileErrors(runtimeErrors);
        if (blockingErrors.length > 0) {
          setNotice(
            `スクリプトを更新できません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`,
          );
        }
      }
    },
  });
  const shaderSourceSavedRef = useRef<
    (assetId: string, source: string) => void | Promise<void>
  >(() => {});
  const shaderEditor = useShaderEditor({
    assets: bundle.assets,
    ...(projectPath ? { projectPath } : {}),
    onSaved: (assetId, source) => shaderSourceSavedRef.current(assetId, source),
  });
  const [shaderEditorRequest, setShaderEditorRequest] =
    useState<ShaderEditorRequest>(null);
  const shaderEditorDirtyRef = useRef(false);
  const handleShaderEditorDirtyChange = useCallback((dirty: boolean) => {
    shaderEditorDirtyRef.current = dirty;
  }, []);
  const scriptContractsRef = useRef(scriptEditor.contracts);
  scriptContractsRef.current = scriptEditor.contracts;
  const setScriptContractRef = useRef(
    (_assetId: string, _contract: ScriptContract) => {},
  );
  setScriptContractRef.current = (assetId, contract) => {
    scriptContractsRef.current = {
      ...scriptContractsRef.current,
      [assetId]: contract,
    };
    scriptEditor.setContract(assetId, contract);
  };
  const acceptExternalScriptSourceRef = useRef<
    (assetId: string, source: string) => boolean
  >(
    (_assetId: string, _source: string) => false,
  );
  acceptExternalScriptSourceRef.current = scriptEditor.acceptExternalSource;
  const scriptCompileRef = useRef(scriptRuntime.compile);
  scriptCompileRef.current = scriptRuntime.compile;
  const [activeEditorTab, setActiveEditorTab] = useState(SCENE_VIEW_TAB_ID);
  const graphTabActive = activeEditorTab === INTERACTIVITY_GRAPH_TAB_ID;
  const scriptTabActive = activeEditorTab === SCRIPT_TAB_ID;
  const setGraphTabActive = useCallback((active: boolean) => {
    setActiveEditorTab(active ? INTERACTIVITY_GRAPH_TAB_ID : SCENE_VIEW_TAB_ID);
    if (phone && active) setTabletPanel(null);
  }, [phone]);
  const scriptEditorSavingRef = useRef(false);
  const handleScriptEditorSavingChange = useCallback((saving: boolean) => {
    scriptEditorSavingRef.current = saving;
  }, []);
  const scriptEditorDirtyRef = useRef(false);
  const [scriptEditorDirty, setScriptEditorDirty] = useState(false);
  const handleScriptEditorDirtyChange = useCallback((dirty: boolean) => {
    scriptEditorDirtyRef.current = dirty;
    setScriptEditorDirty(dirty);
  }, []);
  const scriptEditorOpenAssetIdRef = useRef(
    scriptEditor.state.openAssetId,
  );
  scriptEditorOpenAssetIdRef.current = scriptEditor.state.openAssetId;
  const openScriptEditor = useCallback(
    async (assetId: string, createdAsset?: ScriptAsset): Promise<boolean> => {
      if (scriptEditorSavingRef.current) return false;
      const currentAssetId = scriptEditorOpenAssetIdRef.current;
      if (currentAssetId === assetId) {
        setActiveEditorTab(SCRIPT_TAB_ID);
        if (phone) setTabletPanel(null);
        return true;
      }
      if (
        scriptEditorDirtyRef.current &&
        currentAssetId !== null &&
        currentAssetId !== assetId
      ) {
        const discard = window.confirm(
          "編集中のスクリプトに保存していない変更があります。破棄して別のスクリプトを開きますか。",
        );
        if (!discard) return false;
        scriptEditorDirtyRef.current = false;
      }
      setActiveEditorTab(SCRIPT_TAB_ID);
      if (phone) setTabletPanel(null);
      await scriptEditor.open(assetId, createdAsset);
      return true;
    },
    [scriptEditor.open, phone],
  );
  const closeScriptEditor = useCallback(() => {
    if (scriptEditorSavingRef.current) return;
    if (scriptEditorDirtyRef.current && !window.confirm("保存していない変更があります。破棄して閉じますか。")) return;
    scriptEditor.close();
    setActiveEditorTab((current) => current === SCRIPT_TAB_ID ? SCENE_VIEW_TAB_ID : current);
  }, [scriptEditor.close]);
  const scriptOpenRef = useRef(openScriptEditor);
  scriptOpenRef.current = openScriptEditor;
  const enterPlayModeRef = useRef<
    (options?: EnterPlayModeOptions) => Promise<EnterPlayModeResult>
  >(async () => ({
    started: false,
    errors: [],
    approvalRequired: [],
    skippedAssetIds: [],
  }));
  const stopPlayModeRef = useRef<() => void>(() => {});
  const scriptEntityOptions = useMemo(
    () =>
      Object.values(bundle.scene.entities)
        .map((entity) => ({ id: entity.id, name: entity.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [bundle.scene.entities],
  );
  const scriptEditorAsset = scriptEditor.state.openAssetId
    ? (() => {
        const candidate =
          bundle.assets.assets[scriptEditor.state.openAssetId];
        return candidate?.kind === "script" ? candidate : null;
      })()
    : null;
  const shaderEditorAsset =
    shaderEditorRequest?.kind === "asset"
      ? (() => {
          const candidate = bundle.assets.assets[shaderEditorRequest.assetId];
          return candidate?.kind === "shader" ? candidate : null;
        })()
      : null;
  const shaderEditorMaterial =
    shaderEditorRequest?.kind === "material"
      ? (() => {
          const candidate = bundle.assets.assets[shaderEditorRequest.assetId];
          return candidate?.kind === "material" &&
            candidate.shader?.kind === "classic-r3f"
            ? candidate
            : null;
        })()
      : null;
  const shaderEditorStage: ShaderAssetStage =
    shaderEditorRequest?.kind === "material"
      ? shaderEditorRequest.stage
      : shaderEditorAsset?.stage ?? "fragment";
  const shaderEditorSource =
    shaderEditorRequest?.kind === "material" && shaderEditorMaterial
      ? shaderEditorMaterial.shader?.kind === "classic-r3f"
        ? shaderEditorStage === "vertex"
          ? shaderEditorMaterial.shader.vertexShader
          : shaderEditorMaterial.shader.fragmentShader
        : ""
      : shaderEditor.state.source;
  const shaderEditorMaterialShader =
    shaderEditorMaterial?.shader?.kind === "classic-r3f"
      ? shaderEditorMaterial.shader
      : null;
  const scriptViewportRuntime = useMemo<ScriptViewportRuntime>(() => {
    if (!scriptExecutionScopeRenderCurrent) {
      return {
        scripts: new Map(),
        assetDescriptors: new Map(),
        assetDescriptorVersions: new Map(),
        assetUrls: new Map(),
        assetUrlVersions: new Map(),
        orderByComponentId: new Map(),
        resolveAsset: () => null,
        resolveAssetUrl: () => null,
        onLog: scriptRuntime.handleLog,
        onFailure: scriptRuntime.handleFailure,
      };
    }
    const orderByComponentId = new Map(
      collectScheduledScripts(resolvedScriptScene).map((entry) => [
        entry.componentId,
        entry.order,
      ]),
    );
    return {
      scripts: scriptRuntime.state.scripts,
      assetDescriptors: scriptRuntime.state.assetDescriptors,
      assetDescriptorVersions:
        scriptRuntime.state.assetDescriptorVersions,
      assetUrls: scriptRuntime.state.assetUrls,
      assetUrlVersions: scriptRuntime.state.assetUrlVersions,
      orderByComponentId,
      resolveAsset: (assetId) =>
        scriptRuntime.state.assetDescriptors.get(assetId) ?? null,
      resolveAssetUrl: (assetId) =>
        scriptRuntime.state.assetUrls.get(assetId) ?? null,
      onLog: scriptRuntime.handleLog,
      onFailure: scriptRuntime.handleFailure,
    };
  }, [
    resolvedScriptScene,
    scriptExecutionScopeRenderCurrent,
    scriptRuntime.state.scripts,
    scriptRuntime.state.assetDescriptors,
    scriptRuntime.state.assetDescriptorVersions,
    scriptRuntime.state.assetUrls,
    scriptRuntime.state.assetUrlVersions,
    scriptRuntime.handleLog,
    scriptRuntime.handleFailure,
  ]);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lastSavedBundleRef = useRef<PrototypeVisualProject | null>(
    projectPath || !onSave ? bundle : null,
  );
  const lastSavedPathRef = useRef<string | undefined>(projectPath);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveCoordinatorRef = useRef<SerializedAutosaveCoordinator<
    PrototypeVisualProject,
    void | string
  > | null>(null);
  if (!autosaveCoordinatorRef.current) {
    autosaveCoordinatorRef.current = createSerializedAutosaveCoordinator(
      async (savingBundle) => {
        const save = onSaveRef.current;
        if (!save) {
          throw new Error("Desktop shellから自動保存callbackを指定してください");
        }
        return await save(savingBundle);
      },
      {
        maxAttempts: AUTOSAVE_MAX_ATTEMPTS,
        retryDelayMs: (failedAttempt) =>
          AUTOSAVE_RETRY_DELAYS_MS[
            Math.min(failedAttempt - 1, AUTOSAVE_RETRY_DELAYS_MS.length - 1)
          ],
      },
    );
  }
  const sceneSelection = history.present.sceneSelection;
  const assetSelection = history.present.assetSelection;
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(() =>
    sceneSelection?.id ? [sceneSelection.id] : [],
  );
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(() =>
    assetSelection ? [assetSelection] : [],
  );
  const sceneSelectionRef = useRef(sceneSelection);
  sceneSelectionRef.current = sceneSelection;
  const assetSelectionRef = useRef(assetSelection);
  assetSelectionRef.current = assetSelection;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    onSave ? (projectPath ? "saved" : "dirty") : "unavailable",
  );
  const clipboardRef = useRef<EntityClipboard | null>(null);
  const transformScrubRef = useRef<TransformScrubTransaction | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [deleteDialog, setDeleteDialog] = useState<AssetDeleteDialogTarget | null>(null);
  const [pendingMaterialAssignment, setPendingMaterialAssignment] =
    useState<PendingMaterialAssignment>(null);
  const [modelReimportFeedback, setModelReimportFeedback] =
    useState<ModelReimportFeedback>(null);
  const [textureProcessingFeedback, setTextureProcessingFeedback] =
    useState<TextureProcessingFeedback>(null);
  const [modelOptimizationFeedback, setModelOptimizationFeedback] =
    useState<ModelOptimizationFeedback>(null);
  const [textureBatchFeedback, setTextureBatchFeedback] =
    useState<TextureProcessingState>({ phase: "idle" });
  const [activeAssetFolderId, setActiveAssetFolderId] = useState<string | null>(null);
  const [frameSelectionRequest, setFrameSelectionRequest] = useState(0);
  const [exitFocusRequest, setExitFocusRequest] = useState(0);
  const [focusedEntity, setFocusedEntity] =
    useState<SceneFocusState | null>(null);
  const resolvedCommands = useMemo(() => resolveEditorCommands(), []);
  const mainRef = useRef<HTMLElement>(null);
  const globalModelImportInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<VisualEditorLayout>({
    ...loadEditorLayout(initialLayout),
  });
  // 取り込むTextureに入れておく最大解像度と圧縮方式。取り込み時に編集用画像へ
  // 適用され、シーンと公開の両方がその画像を使う。元画像は保持する。
  const [textureImportMaxSize, setTextureImportMaxSize] =
    useState<TextureImportMaxSize>(DEFAULT_TEXTURE_IMPORT_MAX_SIZE);
  const textureImportMaxSizeRef = useRef(textureImportMaxSize);
  textureImportMaxSizeRef.current = textureImportMaxSize;
  const [textureImportCompression, setTextureImportCompression] =
    useState<TextureImportCompression>(DEFAULT_TEXTURE_IMPORT_COMPRESSION);
  const textureImportCompressionRef = useRef(textureImportCompression);
  textureImportCompressionRef.current = textureImportCompression;
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transformSpace, setTransformSpace] = useState<TransformSpace>("world");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [playSession, setPlaySession] = useState<PlaySession | null>(null);
  const renderedEditorMode: EditorMode = scriptExecutionScopeRenderCurrent
    ? editorMode
    : "edit";
  const renderedPlaySession = scriptExecutionScopeRenderCurrent
    ? playSession
    : null;
  const renderedReadOnly = renderedEditorMode === "play";
  /** Play waits for Script compilation; the button reflects it. */
  const [playPreparing, setPlayPreparing] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [scriptTemplateFolderId, setScriptTemplateFolderId] = useState<
    string | null | undefined
  >(undefined);
  const [componentImportOpen, setComponentImportOpen] = useState(false);
  const [componentImportBusy, setComponentImportBusy] = useState(false);
  const [mcpLocalAssetImportBusy, setMcpLocalAssetImportBusy] = useState(false);
  const [sceneRecipeImportBusy, setSceneRecipeImportBusy] = useState(false);
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false);
  const [externalStoreOpen, setExternalStoreOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  /**
   * Gives the Scene View's cell the whole editor area.
   *
   * The cell is one column of three and one row of two, so whatever is in it —
   * the viewport or the graph — works in about half the window. Collapsing the
   * three panels is the difference between reading a graph and panning around
   * one, and it applies to whichever tab is in front rather than being an
   * editor-only trick.
   */
  const [viewportMaximized, setViewportMaximized] = useState(false);
  const [interactivityEditorAssetId, setInteractivityEditorAssetId] =
    useState<string | null>(null);
  const [pendingImports, setPendingImports] = useState<QueuedAssetImport[]>([]);
  const importQueueRef = useRef<QueuedAssetImport[]>([]);
  const importRunningRef = useRef(false);
  const assetOperationRef = useRef<{
    kind: "asset-import" | "model-reimport" | "texture-processing";
    token: symbol;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticedScriptFailureRevisionRef = useRef(
    scriptRuntimeReport.failureRevision,
  );
  useEffect(() => {
    if (
      scriptRuntimeReport.failureRevision >
      noticedScriptFailureRevisionRef.current
    ) {
      const failure =
        scriptRuntimeReport.failures[
          scriptRuntimeReport.failures.length - 1
        ];
      if (failure) {
        setNotice(
          `${failure.scriptName} を ${failure.phase} エラーで停止しました。スクリプトを開いてConsoleを確認してください: ${failure.message}`,
        );
      }
    }
    noticedScriptFailureRevisionRef.current =
      scriptRuntimeReport.failureRevision;
  }, [scriptRuntimeReport.failureRevision, scriptRuntimeReport.failures]);
  const [leaving, setLeaving] = useState(false);
  const mcpNativeAvailable = tauri.isAvailable();
  // The bridge is registered in the same step that installs the MCP listener,
  // so the shell never sees a moment where Editor tools have a listener but no
  // bridge (it would answer EDITOR_UNAVAILABLE while the Editor also answers).
  // Save and leave are defined further down, so the bridge reaches them
  // through a ref that every render refreshes.
  const onRegisterMcpProjectBridgeRef = useRef(onRegisterMcpProjectBridge);
  onRegisterMcpProjectBridgeRef.current = onRegisterMcpProjectBridge;
  const mcpProjectBridgeActionsRef = useRef<{
    saveNow: () => Promise<string | undefined>;
    leave: () => Promise<boolean>;
  } | null>(null);
  const [mcpClients, setMcpClients] = useState<XriftMcpClientStatus[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpRegisteringClientId, setMcpRegisteringClientId] =
    useState<XriftMcpClientId | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<XriftOllamaStatus | null>(null);
  const [ollamaConfiguring, setOllamaConfiguring] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaResult, setOllamaResult] =
    useState<XriftOllamaConfigurationResult | null>(null);
  const [mcpLastActivity, setMcpLastActivity] =
    useState<XriftMcpActivity>(null);

  useEffect(() => {
    if (editorMode !== "play") {
      preparedScriptRuntimeInputKeyRef.current = null;
      return;
    }
    if (
      preparedScriptRuntimeInputKeyRef.current === scriptRuntimeInputKey
    ) {
      return;
    }
    preparedScriptRuntimeInputKeyRef.current = scriptRuntimeInputKey;
    let cancelled = false;
    void scriptRuntime
      .compile({
        unapprovedPolicy: activePlayUnapprovedPolicyRef.current,
      })
      .then((errors) => {
        if (cancelled || errors.length === 0) return;
        const blockingErrors = blockingScriptCompileErrors(errors);
        setNotice(
          `スクリプトを更新できません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editorMode, scriptRuntime.compile, scriptRuntimeInputKey]);

  const refreshMcpClients = useCallback(async () => {
    if (!mcpNativeAvailable) return;
    setMcpLoading(true);
    setMcpError(null);
    setOllamaError(null);
    setOllamaResult(null);
    try {
      const [clients, ollama] = await Promise.all([
        tauri.detectXriftMcpClients(),
        tauri.detectXriftOllama(),
      ]);
      setMcpClients(clients);
      setOllamaStatus(ollama);
    } catch {
      setMcpError(
        "AIクライアントまたはOllamaを確認できませんでした。XRift Studioを再起動して再試行してください",
      );
    } finally {
      setMcpLoading(false);
    }
  }, [mcpNativeAvailable]);

  const registerMcpClient = useCallback(
    async (clientId: XriftMcpClientId) => {
      if (
        !mcpNativeAvailable ||
        mcpRegisteringClientId ||
        ollamaConfiguring
      ) {
        return;
      }
      setMcpRegisteringClientId(clientId);
      setMcpError(null);
      try {
        const status = await tauri.registerXriftMcpClient(clientId);
        setMcpClients((current) =>
          current.map((client) => (client.id === status.id ? status : client)),
        );
        setNotice(
          `${status.label}に登録しました。AIクライアントを再起動してください`,
        );
      } catch (error) {
        setMcpError(
          typeof error === "string" && error.trim()
            ? error
            : "登録できません。AIクライアントがインストールされているか確認してください",
        );
      } finally {
        setMcpRegisteringClientId(null);
      }
    },
    [mcpNativeAvailable, mcpRegisteringClientId, ollamaConfiguring],
  );

  const configureOllama = useCallback(
    async (integrationId: XriftOllamaIntegrationId, model: string) => {
      if (
        !mcpNativeAvailable ||
        ollamaConfiguring ||
        mcpRegisteringClientId
      ) {
        return;
      }
      const target = mcpClients.find((client) => client.id === integrationId);
      if (!target?.installed) {
        setOllamaError(
          "AIクライアントをインストールしてください",
        );
        return;
      }

      setOllamaConfiguring(true);
      setOllamaError(null);
      setOllamaResult(null);
      try {
        if (!target.registered || target.needsUpdate) {
          setMcpRegisteringClientId(integrationId);
          const status = await tauri.registerXriftMcpClient(integrationId);
          setMcpClients((current) =>
            current.map((client) =>
              client.id === status.id ? status : client,
            ),
          );
        }
        const result = await tauri.configureXriftOllama(
          integrationId,
          model,
        );
        setOllamaResult(result);
        setNotice(
          `${result.integrationLabel}にOllamaの${result.model}を設定しました。AIクライアントを起動し直してください`,
        );
      } catch (error) {
        setOllamaError(
          typeof error === "string" && error.trim()
            ? error
            : "設定できません。OllamaとAIクライアントの状態を確認してください",
        );
      } finally {
        setMcpRegisteringClientId(null);
        setOllamaConfiguring(false);
      }
    },
    [
      mcpClients,
      mcpNativeAvailable,
      mcpRegisteringClientId,
      ollamaConfiguring,
    ],
  );

  const requestAutosave = useCallback(
    async (
      savingBundle: PrototypeVisualProject,
    ): Promise<string | undefined> => {
      if (lastSavedBundleRef.current === savingBundle) {
        return lastSavedPathRef.current ?? projectPathRef.current;
      }

      const coordinator = autosaveCoordinatorRef.current;
      if (!coordinator) return undefined;
      setSaveStatus("saving");
      try {
        const result = await coordinator.request(savingBundle);
        if (result === AUTOSAVE_SUPERSEDED) {
          // A newer snapshot superseded this save; it is not a failure.
          setSaveStatus("saving");
          return undefined;
        }
        lastSavedBundleRef.current = savingBundle;
        const savedPath =
          typeof result === "string" ? result : projectPathRef.current;
        if (savedPath) lastSavedPathRef.current = savedPath;

        if (
          coordinator.latestRequested() === savingBundle &&
          bundleRef.current === savingBundle
        ) {
          setSaveStatus("saved");
        } else if (coordinator.latestRequested() !== savingBundle) {
          setSaveStatus("saving");
        } else {
          setSaveStatus("dirty");
        }
        return savedPath;
      } catch (error) {
        if (coordinator.latestRequested() === savingBundle) {
          setSaveStatus("error");
          // Tauri rejects with a plain string, so a native save error would
          // otherwise be reported as nothing more than "failed".
          setNotice(
            error instanceof Error
              ? error.message
              : typeof error === "string" && error
                ? error
                : "自動保存に失敗しました",
          );
        }
        return undefined;
      }
    },
    [],
  );

  const updateImportQueue = useCallback(
    (
      update: (
        current: QueuedAssetImport[],
      ) => QueuedAssetImport[],
    ) => {
      const next = update(importQueueRef.current);
      importQueueRef.current = next;
      setPendingImports(next);
    },
    [],
  );

  const setBundle = useCallback(
    (action: SetStateAction<PrototypeVisualProject>) => {
      setHistory((current) => {
        const nextBundle =
          typeof action === "function"
            ? action(current.present.bundle)
            : action;
        if (nextBundle === current.present.bundle) return current;
        setSaveStatus("dirty");
        const next = { ...current.present, bundle: nextBundle };
        // ドラッグ中は履歴を増やさず、確定時に一件だけ積む。
        return valueScrubRef.current
          ? replaceEditorHistoryPresent(current, next)
          : commitEditorHistory(current, next);
      });
    },
    [],
  );

  /**
   * 数値入力の左右ドラッグを一つの操作として扱う。ドラッグ中の中間値は
   * 履歴へ積まず、離した時に変化があれば Undo 一件、Escape では開始前へ戻す。
   */
  const valueScrubTransaction = useMemo<ValueScrubTransaction>(
    () => ({
      begin: () => {
        if (valueScrubRef.current) return;
        valueScrubRef.current = {
          before: historyRef.current.present,
          saveStatus: saveStatusRef.current,
        };
      },
      end: () => {
        const transaction = valueScrubRef.current;
        if (!transaction) return;
        valueScrubRef.current = null;
        setHistory((current) => {
          if (current.present === transaction.before) {
            setSaveStatus(transaction.saveStatus);
            return current;
          }
          return commitEditorHistory(
            replaceEditorHistoryPresent(current, transaction.before),
            current.present,
          );
        });
      },
      cancel: () => {
        const transaction = valueScrubRef.current;
        if (!transaction) return;
        valueScrubRef.current = null;
        setHistory((current) => {
          if (current.present === transaction.before) return current;
          bundleRef.current = transaction.before.bundle;
          setSaveStatus(transaction.saveStatus);
          return replaceEditorHistoryPresent(current, transaction.before);
        });
      },
    }),
    [],
  );

  const handleShaderSourceSaved = useCallback(
    (shaderAssetId: string, source: string) => {
      setBundle((current) => {
        let changed = false;
        const nextAssets = Object.fromEntries(
          Object.entries(current.assets.assets).map(([assetId, asset]) => {
            if (
              asset.kind !== "material" ||
              asset.shader?.kind !== "classic-r3f"
            ) {
              return [assetId, asset];
            }
            const shader = asset.shader;
            const nextShader = {
              ...shader,
              ...(shader.vertexShaderAssetId === shaderAssetId
                ? { vertexShader: source }
                : {}),
              ...(shader.fragmentShaderAssetId === shaderAssetId
                ? { fragmentShader: source }
                : {}),
            };
            if (
              shader.vertexShaderAssetId === shaderAssetId ||
              shader.fragmentShaderAssetId === shaderAssetId
            ) {
              changed = true;
              return [assetId, { ...asset, shader: nextShader }];
            }
            return [assetId, asset];
          }),
        );
        if (!changed) return current;
        setNotice("GLSLを保存し、使用中のマテリアルに反映しました");
        return touchProject({
          ...current,
          assets: { ...current.assets, assets: nextAssets },
        });
      });
    },
    [setBundle],
  );
  const [terrainEditing, setTerrainEditing] =
    useState<TerrainViewportEditing | null>(null);
  shaderSourceSavedRef.current = handleShaderSourceSaved;

  const closeShaderEditor = useCallback(() => {
    setShaderEditorRequest(null);
    shaderEditor.close();
    shaderEditorDirtyRef.current = false;
  }, [shaderEditor.close]);

  const confirmShaderEditorSwitch = useCallback(() => {
    if (!shaderEditorDirtyRef.current) return true;
    const discard = window.confirm(
      "編集中のGLSLに保存していない変更があります。破棄して別のコードを開きますか。",
    );
    if (discard) shaderEditorDirtyRef.current = false;
    return discard;
  }, []);

  const openShaderAssetEditor = useCallback(
    async (assetId: string) => {
      if (!confirmShaderEditorSwitch()) return false;
      shaderEditor.close();
      setShaderEditorRequest({ kind: "asset", assetId });
      await shaderEditor.open(assetId);
      return true;
    },
    [confirmShaderEditorSwitch, shaderEditor.close, shaderEditor.open],
  );

  const openMaterialShaderEditor = useCallback(
    (assetId: string, stage: ShaderAssetStage) => {
      if (!confirmShaderEditorSwitch()) return false;
      shaderEditor.close();
      setShaderEditorRequest({ kind: "material", assetId, stage });
      return true;
    },
    [confirmShaderEditorSwitch, shaderEditor.close],
  );

  const saveMaterialShaderSource = useCallback(
    async (assetId: string, stage: ShaderAssetStage, source: string) => {
      setBundle((current) => {
        const asset = current.assets.assets[assetId];
        if (
          asset?.kind !== "material" ||
          asset.shader?.kind !== "classic-r3f"
        ) {
          return current;
        }
        const nextAssets = updateMaterialAsset(current.assets, assetId, {
          shader: {
            ...asset.shader,
            [stage === "vertex" ? "vertexShader" : "fragmentShader"]: source,
          },
        });
        return nextAssets === current.assets
          ? current
          : touchProject({ ...current, assets: nextAssets });
      });
    },
    [setBundle],
  );

  const setSceneSelection = useCallback((selection: SceneSelection) => {
    setSelectedEntityIds(selection?.id ? [selection.id] : []);
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        sceneSelection: selection,
      }),
    );
  }, []);

  const setAssetSelection = useCallback((assetId: string | null) => {
    setSelectedAssetIds(assetId ? [assetId] : []);
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        assetSelection: assetId,
      }),
    );
  }, []);

  /**
   * Store からのインストール直後の選択を揃える。Inspector は新しい Asset へ切り替
   * わるが、Entity の選択は残す。Inspector の「戻る」は Entity Inspector への導線
   * なので、ここで Entity を捨てると Asset Inspector から戻れなくなる。複数選択の
   * ままだと Multi Selection Inspector が前に出て、追加した Asset が見えないので、
   * 表示中の Entity 1件へ畳む。
   */
  const selectInstalledAsset = useCallback((assetId: string) => {
    setSelectedAssetIds([assetId]);
    const primaryEntityId = sceneSelectionRef.current?.id ?? null;
    setSelectedEntityIds(primaryEntityId ? [primaryEntityId] : []);
  }, []);

  const handleEntitySelectionChange = useCallback((entityIds: string[], primaryEntityId: string | null) => {
    const validIds = [...new Set(entityIds)].filter((id) => Boolean(bundleRef.current.scene.entities[id]));
    setSceneSettingsOpen(false);
    setSelectedEntityIds(validIds);
    setSelectedAssetIds([]);
    setAssetSelection(null);
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        sceneSelection: primaryEntityId && validIds.includes(primaryEntityId)
          ? { kind: "entity", id: primaryEntityId }
          : validIds[0]
            ? { kind: "entity", id: validIds[0] }
            : null,
      }),
    );
  }, [setAssetSelection]);

  const handleSceneViewportSelection = useCallback(
    (selection: SceneSelection, modifiers: { additive: boolean }) => {
      if (!selection?.id) {
        if (!modifiers.additive) handleEntitySelectionChange([], null);
        return;
      }

      const entityId = selection.id;
      if (!modifiers.additive) {
        handleEntitySelectionChange([entityId], entityId);
        return;
      }

      const currentIds = selectedEntityIds.filter((id) =>
        Boolean(bundleRef.current.scene.entities[id]),
      );
      const alreadySelected = currentIds.includes(entityId);
      const nextIds = alreadySelected
        ? currentIds.filter((id) => id !== entityId)
        : [...currentIds, entityId];
      handleEntitySelectionChange(
        nextIds,
        alreadySelected ? nextIds[nextIds.length - 1] ?? null : entityId,
      );
    },
    [handleEntitySelectionChange, selectedEntityIds],
  );

  const handleAssetSelectionChange = useCallback((assetIds: string[], primaryAssetId: string | null) => {
    const validIds = [...new Set(assetIds)].filter((id) => Boolean(bundleRef.current.assets.assets[id]));
    setSceneSettingsOpen(false);
    setSelectedAssetIds(validIds);
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        assetSelection: primaryAssetId && validIds.includes(primaryAssetId)
          ? primaryAssetId
          : validIds[0] ?? null,
      }),
    );
  }, []);

  useEffect(() => {
    setHistory(createEditorHistory(createInitialSnapshot(), 80));
    setSaveStatus(onSave ? (projectPath ? "saved" : "dirty") : "unavailable");
    lastSavedBundleRef.current = projectPath || !onSave ? initialBundle : null;
    lastSavedPathRef.current = projectPath;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setEditorMode("edit");
    setPlaySession(null);
    scriptProvenanceRef.current.clear();
    clipboardRef.current = null;
    transformScrubRef.current = null;
    setRenameTarget(null);
    setDeleteDialog(null);
    setPendingMaterialAssignment(null);
    setModelReimportFeedback(null);
    setTextureProcessingFeedback(null);
    setModelOptimizationFeedback(null);
    setTextureBatchFeedback({ phase: "idle" });
    setActiveAssetFolderId(null);
    setSelectedEntityIds(initialBundle.scene.rootEntityIds[0] ? [initialBundle.scene.rootEntityIds[0]] : []);
    setSelectedAssetIds(firstAssetId(initialBundle) ? [firstAssetId(initialBundle)!] : []);
    setFrameSelectionRequest(0);
    setExitFocusRequest((current) => current + 1);
    setFocusedEntity(null);
    setSceneSettingsOpen(false);
    importQueueRef.current = [];
    setPendingImports([]);
    setImportError(null);
    setNotice(null);
    setMcpLastActivity(null);
    setLeaving(false);
    // Saving can replace the shell bundle object without changing the open
    // project. Reset only when the actual project identity changes so queued
    // File objects and editor history survive the first save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBundle.project.projectId]);

  useEffect(() => {
    const project = initialBundle.project;
    setHistory((current) => {
      const past = current.past.map((snapshot) =>
        synchronizeProjectShellSnapshot(snapshot, project),
      );
      const present = synchronizeProjectShellSnapshot(current.present, project);
      const future = current.future.map((snapshot) =>
        synchronizeProjectShellSnapshot(snapshot, project),
      );
      const changed =
        present !== current.present ||
        past.some((snapshot, index) => snapshot !== current.past[index]) ||
        future.some((snapshot, index) => snapshot !== current.future[index]);

      return changed ? { ...current, past, present, future } : current;
    });
  }, [
    initialBundle.project.lastPublication,
    initialBundle.project.metadata,
    initialBundle.project.projectId,
  ]);

  useEffect(() => {
    if (!onSaveRef.current) {
      setSaveStatus("unavailable");
      return;
    }
    if (lastSavedBundleRef.current === bundle) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (transformScrubRef.current || terrainStrokeActiveRef.current) {
        // A scrub or terrain stroke is in progress. Reschedule so the pending
        // changes are saved once the interaction settles.
        autosaveTimerRef.current = window.setTimeout(() => {
          autosaveTimerRef.current = null;
          void requestAutosave(bundle);
        }, AUTOSAVE_DELAY_MS);
        return;
      }
      void requestAutosave(bundle);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [bundle, requestAutosave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!onSaveRef.current) return;
      if (lastSavedBundleRef.current === bundleRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    setTextureImportMaxSize(loadTextureImportMaxSize());
    setTextureImportCompression(loadTextureImportCompression());
  }, []);

  useEffect(() => {
    setLayout(loadEditorLayout(initialLayout));
  }, [
    initialLayout?.assetsHeight,
    initialLayout?.hierarchyWidth,
    initialLayout?.inspectorWidth,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Layout persistence is best-effort; resizing remains functional.
    }
  }, [layout]);

  const modelReimportBusy = Boolean(
    modelReimportFeedback &&
      (modelReimportFeedback.state.phase === "reading" ||
        modelReimportFeedback.state.phase === "processing" ||
        modelReimportFeedback.state.phase === "committing"),
  );
  const textureProcessingBusy = Boolean(
    textureProcessingFeedback &&
      (textureProcessingFeedback.state.phase === "reading" ||
        textureProcessingFeedback.state.phase === "encoding" ||
        textureProcessingFeedback.state.phase === "saving"),
  );
  const modelOptimizationBusy = Boolean(
    modelOptimizationFeedback &&
      (modelOptimizationFeedback.state.phase === "reading" ||
        modelOptimizationFeedback.state.phase === "encoding" ||
        modelOptimizationFeedback.state.phase === "saving"),
  );
  const textureBatchBusy =
    textureBatchFeedback.phase === "reading" ||
    textureBatchFeedback.phase === "encoding" ||
    textureBatchFeedback.phase === "saving";
  const importBusy =
    componentImportBusy ||
    mcpLocalAssetImportBusy ||
    sceneRecipeImportBusy ||
    modelReimportBusy ||
    textureProcessingBusy ||
    modelOptimizationBusy ||
    textureBatchBusy ||
    pendingImports.some((entry) => importIsActive(entry.status));
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  const importBusyRef = useRef(importBusy);
  importBusyRef.current = importBusy;
  const invalidateScriptExecutionScope = useCallback(() => {
    resetScriptExecutionScopeInputKeyRef.current =
      scriptExecutionScopeInputKey;
    playPreparationGenerationRef.current += 1;
    playPreparationActiveRef.current = false;
    activePlayUnapprovedPolicyRef.current = "block";
    preparedScriptRuntimeInputKeyRef.current = null;
    scriptProvenanceRef.current.clear();
    setPlaySession(null);
    setEditorMode("edit");
    setPlayPreparing(false);
    scriptRuntime.reset();
    setNotice(
      "プロジェクトの実行範囲が変わったため動作確認準備を中止しました。現在のプロジェクトで改めて動作確認してください",
    );
  }, [scriptExecutionScopeInputKey, scriptRuntime.reset]);
  useEffect(() => {
    if (
      resetScriptExecutionScopeInputKeyRef.current ===
      scriptExecutionScopeInputKey
    ) {
      return;
    }
    invalidateScriptExecutionScope();
  }, [
    invalidateScriptExecutionScope,
    scriptExecutionScopeInputKey,
  ]);
  const projectThumbnailBusyRef = useRef(false);
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  useEffect(() => {
    if (editorMode !== "play") return;
    setPlaySession((current) =>
      current
        ? synchronizePlaySession(current, bundle.scene, bundle.assets)
        : createPlaySession(bundle.scene, bundle.assets),
    );
  }, [bundle.assets, bundle.scene, editorMode]);

  // Recording tools never touch the document, so they run before the project
  // check the other debug tools make: a stop after the author switched
  // projects must still stop the take. Given ids are still verified.
  const handleRecordingTool = async (
    request: XriftMcpEditorRequestEvent,
  ): Promise<Record<string, unknown>> => {
    const args = request.arguments;
    const projectId = mcpOptionalString(args.projectId);
    const sceneId = mcpOptionalString(args.sceneId);
    const current = bundleRef.current;
    if (
      (projectId && projectId !== current.project.projectId) ||
      (sceneId && sceneId !== current.scene.sceneId)
    ) {
      throw new XriftMcpEditorToolError(
        "STALE_REVISION",
        "対象シーンが現在のEditorと一致しません。get_editor_contextで再取得してください",
        { projectId, sceneId },
      );
    }
    const context = {
      projectId: current.project.projectId,
      sceneId: current.scene.sceneId,
      revision: mcpRevisionRef.current,
    };
    const optionalBoolean = (value: unknown, name: string) => {
      if (value === undefined) return undefined;
      if (typeof value !== "boolean") {
        throw new XriftMcpEditorToolError(
          "INVALID_ARGUMENT",
          `${name}はtrueまたはfalseで指定してください`,
        );
      }
      return value;
    };
    const profilePatch = (source: Record<string, unknown>) => {
      const patch: Partial<RecordingProfile> = {};
      if (source.aspectRatio !== undefined) {
        if (!isRecordingAspectRatio(source.aspectRatio)) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "aspectRatioは16:9、9:16、1:1、4:5のいずれかで指定してください",
          );
        }
        patch.aspectRatio = source.aspectRatio;
      }
      if (source.shortEdge !== undefined) {
        if (!isRecordingShortEdge(source.shortEdge)) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "shortEdgeは720、1080、1440のいずれかで指定してください",
          );
        }
        patch.shortEdge = source.shortEdge;
      }
      if (source.frameRate !== undefined) {
        if (!isRecordingFrameRate(source.frameRate)) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "frameRateは30または60で指定してください",
          );
        }
        patch.frameRate = source.frameRate;
      }
      return patch;
    };
    const cameraLive = () => {
      const state = recordingSession.getState();
      return (
        state.viewport.visible &&
        state.viewport.cameraSource === "recording" &&
        editorModeRef.current === "edit"
      );
    };
    switch (request.tool) {
      case "start_recording": {
        const label = mcpOptionalString(args.label);
        if (label && label.length > 80) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "labelは80文字以内で指定してください",
          );
        }
        let profile: RecordingProfile | undefined;
        if (args.profile !== undefined) {
          if (!args.profile || typeof args.profile !== "object") {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "profileはEntityで指定してください",
            );
          }
          profile = normalizeRecordingProfile(
            {
              ...recordingSession.getState().profile,
              ...profilePatch(args.profile as Record<string, unknown>),
            },
            recordingSession.getState().profile,
          );
        }
        const showViewport = optionalBoolean(args.showViewport, "showViewport");
        const started = await startRecordingTake({
          label: label ?? null,
          clientName: request.clientName,
          ...(profile ? { profile } : {}),
          ...(showViewport === undefined ? {} : { showViewport }),
        });
        if (started.started) {
          setNotice(
            `${request.clientName}が録画を開始しました${label ? `: ${label}` : ""}`,
          );
        }
        return {
          ...context,
          started: started.started,
          ...(started.message ? { message: started.message } : {}),
          ...recordingSession.describe(),
        };
      }
      case "stop_recording": {
        const stopped = await stopRecordingTake();
        if (stopped.stopped) {
          setNotice(
            stopped.snapshot.status === "completed" && stopped.snapshot.path
              ? `録画を保存しました: ${stopped.snapshot.path}`
              : stopped.snapshot.message ?? "録画を停止しました",
          );
        }
        return {
          ...context,
          stopped: stopped.stopped,
          ...recordingSession.describe(),
        };
      }
      case "get_recording_status":
      case "get_recording_viewport":
        return { ...context, cameraLive: cameraLive(), ...recordingSession.describe() };
      case "set_recording_profile": {
        const applied = recordingSession.setProfile(profilePatch(args));
        return {
          ...context,
          effectiveFrom: applied.effectiveFrom,
          ...recordingSession.describe(),
        };
      }
      case "set_recording_viewport": {
        const patch: Partial<RecordingViewportSettings> = {};
        for (const key of [
          "visible",
          "showEditorUi",
          "showEditorHelpers",
          "showRecordingIndicator",
        ] as const) {
          const value = optionalBoolean(args[key], key);
          if (value !== undefined) patch[key] = value;
        }
        if (args.cameraSource !== undefined) {
          if (args.cameraSource !== "recording" && args.cameraSource !== "editor") {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "cameraSourceはrecordingまたはeditorで指定してください",
            );
          }
          patch.cameraSource = args.cameraSource;
        }
        recordingSession.setViewport(patch);
        return { ...context, cameraLive: cameraLive(), ...recordingSession.describe() };
      }
      case "set_recording_camera": {
        const preset = mcpOptionalString(args.preset);
        if (preset !== undefined && !isRecordingCameraPreset(preset)) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "プリセットはtop、front、back、left、right、isoのいずれかで指定してください",
          );
        }
        const focusEntityId = mcpOptionalString(args.focusEntityId);
        if (focusEntityId && !current.scene.entities[focusEntityId]) {
          throw new XriftMcpEditorToolError(
            "ENTITY_NOT_FOUND",
            "指定されたEntityが見つかりません",
            { entityId: focusEntityId },
          );
        }
        const fitScene = optionalBoolean(args.fitScene, "fitScene");
        const position = mcpOptionalVec3(args.position, "position");
        const target = mcpOptionalVec3(args.target, "target");
        const distance =
          args.distance === undefined
            ? undefined
            : mcpFiniteNumber(args.distance, "distance", 0.1, 5_000);
        const fov =
          args.fov === undefined
            ? undefined
            : mcpFiniteNumber(args.fov, "fov", 10, 150);
        if (
          !preset &&
          !focusEntityId &&
          !fitScene &&
          !position &&
          !target &&
          distance === undefined &&
          fov === undefined
        ) {
          throw new XriftMcpEditorToolError(
            "INVALID_ARGUMENT",
            "fitScene、focusEntityId、プリセット、position/target、distance、fovのいずれかを指定してください",
          );
        }
        let moved: Awaited<ReturnType<typeof moveRecordingCamera>>;
        try {
          moved = await moveRecordingCamera({
            ...(preset ? { preset } : {}),
            ...(focusEntityId ? { focusEntityId } : {}),
            ...(fitScene ? { fitScene } : {}),
            ...(position ? { position } : {}),
            ...(target ? { target } : {}),
            ...(distance === undefined ? {} : { distance }),
            ...(fov === undefined ? {} : { fov }),
          });
        } catch (error) {
          throw new XriftMcpEditorToolError(
            "RECORDING_CAMERA_FAILED",
            error instanceof Error
              ? error.message
              : "録画用カメラを動かせませんでした",
          );
        }
        return {
          ...context,
          camera: moved.pose,
          ...(moved.bounds ? { framedBounds: moved.bounds } : {}),
          ...(moved.skippedLargeMeshCount > 0
            ? { skippedLargeMeshCount: moved.skippedLargeMeshCount }
            : {}),
          ...(focusEntityId ? { framedEntityId: focusEntityId } : {}),
          cameraLive: cameraLive(),
        };
      }
      case "get_recording_camera": {
        const state = recordingSession.getState();
        return {
          ...context,
          camera: state.camera,
          cameraSource: state.viewport.cameraSource,
          viewportVisible: state.viewport.visible,
          cameraLive: cameraLive(),
        };
      }
      default:
        throw new XriftMcpEditorToolError(
          "TOOL_NOT_FOUND",
          "対応していないAI editor toolです",
        );
    }
  };
  const handleRecordingToolRef = useRef(handleRecordingTool);
  handleRecordingToolRef.current = handleRecordingTool;

  useEffect(() => {
    if (!mcpNativeAvailable) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const complete = async (
      request: XriftMcpEditorRequestEvent,
    ): Promise<void> => {
      const completeResponse = async (response: Parameters<typeof tauri.completeXriftMcpRequest>[0]) => {
        // Preserve successful edit results even when auxiliary history cannot be saved.
        // Reporting the edit itself as failed could make a client execute it twice.
        const root = projectPathRef.current;
        const sceneId = bundleRef.current.scene.sceneId;
        if (root && response.ok && request.arguments.sceneId === sceneId && request.arguments.projectId === bundleRef.current.project.projectId) {
          try {
            const state = readAuthoringState(await tauri.readWorldAuthoring(root, sceneId));
            const fingerprint = await authoringFingerprint(bundleRef.current);
            if (state && state.activity.fingerprint !== fingerprint) {
              const next = { ...state, sequence: state.sequence + 1, completedFingerprint: null,
                activity: { tool: request.tool, at: new Date().toISOString(), fingerprint } };
              await tauri.saveWorldAuthoring(root, sceneId, state.sequence, next);
            }
          } catch (error) {
            response = { ...response, result: { ...response.result, authoringWarning: String(error) } };
          }
        }
        return tauri.completeXriftMcpRequest(response);
      };
      // Project tools (create, open, publish) belong to the shell, which
      // answers them itself. Answering here too would complete one request
      // twice.
      if (xriftMcpToolSurface(request.tool) === "project") return;
      const harness = recordMcpHarnessCall(
        mcpHarnessStateRef.current,
        request.tool,
        request.arguments,
      );
      mcpHarnessStateRef.current = harness.state;
      try {
        // The registry says which surface owns a tool, so an unknown name is
        // simply one with no surface rather than something five membership
        // tests have to agree about.
        const surface = xriftMcpToolSurface(request.tool);
        if (!surface) {
          throw new XriftMcpEditorToolError(
            "TOOL_NOT_FOUND",
            "対応していないAI editor toolです",
          );
        }
        if (RECORDING_TOOL_NAMES.has(request.tool)) {
          const result = await handleRecordingToolRef.current(request);
          await completeResponse({
            id: request.id,
            ok: true,
            result: { ...result, outputDirectory: projectPathRef.current
              ? `${projectPathRef.current}/Recording` : result.outputDirectory },
          });
          return;
        }
        const localAssetTool = surface === "local-asset";
        const debugTool = surface === "debug";
        const externalStoreTool = surface === "external-store";
        const scriptTool = surface === "script";
        if (debugTool) {
          const args = request.arguments;
          const projectId = mcpRequiredString(args.projectId, "projectId");
          const sceneId = mcpRequiredString(args.sceneId, "sceneId");
          if (
            projectId !== bundleRef.current.project.projectId ||
            sceneId !== bundleRef.current.scene.sceneId
          ) {
            throw new XriftMcpEditorToolError(
              "STALE_REVISION",
              "対象シーンが現在のEditorと一致しません。get_editor_contextで再取得してください",
              { projectId, sceneId },
            );
          }
          if (["begin_world_authoring", "get_world_authoring", "review_world_authoring", "complete_world_authoring"].includes(request.tool)) {
            const root = projectPathRef.current;
            if (!root) throw new Error("プロジェクトを保存してから制作を開始してください。");
            const worldComponents = getWorldComponentAuthoring(bundleRef.current.scene, bundleRef.current.project.projectKind);
            const fingerprint = await authoringFingerprint(bundleRef.current);
            let state = readAuthoringState(await tauri.readWorldAuthoring(root, sceneId));
            if (request.tool === "complete_world_authoring" && (!state || authoringStatus(state, fingerprint).uncheckedCriteria?.length)) {
              await completeResponse({ id: request.id, ok: true, result: { projectId, sceneId,
                ...authoringStatus(state, fingerprint), worldComponents, completionAccepted: false } });
              return;
            }
            if (request.tool === "complete_world_authoring") {
              try {
                if ((await tauri.readWorldAuthoringImages(root, sceneId, fingerprint)).length !== 2) throw new Error("Missing images");
              } catch {
                await completeResponse({ id: request.id, ok: true, result: { projectId, sceneId,
                  ...authoringStatus(state, fingerprint), worldComponents, completed: false, completionAccepted: false,
                  imageWarning: "保存画像を読み取れません。両視点を撮り直してください。",
                  missingViews: ["spawn", "iso"], nextActions: ["set_scene_view_camera", "capture_scene_view"] } });
                return;
              }
            }
            if (request.tool !== "get_world_authoring") {
              const next = changeAuthoringState(state, request.tool, args, fingerprint);
              if (fingerprint !== await authoringFingerprint(bundleRef.current)) throw new Error("シーンが変更されました。状態を読み直してください。");
              await tauri.saveWorldAuthoring(root, sceneId, state?.sequence ?? 0, next);
              state = next;
            }
            let images;
            let imageWarning;
            if (request.tool === "get_world_authoring") {
              try { images = await tauri.readWorldAuthoringImages(root, sceneId, fingerprint); }
              catch { imageWarning = "保存画像を読み取れません。両視点を撮り直してください。"; }
            }
            await completeResponse({ id: request.id, ok: true, result: {
              projectId, sceneId, ...authoringStatus(state, fingerprint), worldComponents, images, imageWarning,
              ...(imageWarning ? { completed: false, missingViews: ["spawn", "iso"], nextActions: ["set_scene_view_camera", "capture_scene_view"] } : {}),
            } });
            return;
          }
          if (request.tool === "set_scene_view_camera") {
            const preset = mcpOptionalString(args.preset);
            if (
              preset !== undefined &&
              !(SCENE_VIEW_CAMERA_PRESETS as readonly string[]).includes(preset)
            ) {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                `プリセットは${SCENE_VIEW_CAMERA_PRESETS.join("、")}のいずれかで指定してください`,
              );
            }
            const focusEntityId = mcpOptionalString(args.focusEntityId);
            if (
              focusEntityId &&
              !bundleRef.current.scene.entities[focusEntityId]
            ) {
              throw new XriftMcpEditorToolError(
                "ENTITY_NOT_FOUND",
                "指定されたEntityが見つかりません",
                { entityId: focusEntityId },
              );
            }
            const position = mcpOptionalVec3(args.position, "position");
            const target = mcpOptionalVec3(args.target, "target");
            const distance =
              args.distance === undefined
                ? undefined
                : mcpFiniteNumber(args.distance, "distance", 0.1, 5_000);
            if (!preset && !focusEntityId && !position && !target) {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "プリセット、focusEntityId、position/targetのいずれかを指定してください",
              );
            }
            const moved = await requestSceneCamera({
              ...(preset ? { preset: preset as SceneViewCameraPreset } : {}),
              ...(focusEntityId ? { focusEntityId } : {}),
              ...(position ? { position } : {}),
              ...(target ? { target } : {}),
              ...(distance === undefined ? {} : { distance }),
            });
            if (!moved.ok) {
              throw new XriftMcpEditorToolError(
                "SCENE_VIEW_CAMERA_FAILED",
                moved.message ?? "シーンのカメラを動かせませんでした",
              );
            }
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId,
                sceneId,
                revision: mcpRevisionRef.current,
                position: moved.position,
                target: moved.target,
                ...(moved.framedEntityId
                  ? { framedEntityId: moved.framedEntityId }
                  : {}),
                ...(preset ? { preset } : {}),
              },
            });
            return;
          }
          if (request.tool === "capture_scene_view") {
            const fingerprint = await authoringFingerprint(bundleRef.current);
            // A frame is only worth anything from the Edit camera the caller
            // just placed; during Play the viewport is the play copy.
            const captured = await requestSceneScreenshot();
            if (!captured.ok) {
              throw new XriftMcpEditorToolError(
                "SCENE_VIEW_CAPTURE_FAILED",
                captured.message,
              );
            }
            if (!tauri.isAvailable()) {
              throw new XriftMcpEditorToolError(
                "SCENE_VIEW_CAPTURE_FAILED",
                "デスクトップ版でのみシーンを保存できます",
              );
            }
            const path = await tauri.saveDebugImage(
              captured.dataUrl,
              "scene-view",
            );
            const byteLength = Math.floor(
              ((captured.dataUrl.length - captured.dataUrl.indexOf(",") - 1) *
                3) /
                4,
            );
            let authoring = undefined;
            if (args.authoringView !== undefined) {
              const root = projectPathRef.current;
              if (!root) throw new Error("プロジェクトを保存してください。");
              if (fingerprint !== await authoringFingerprint(bundleRef.current)) throw new Error("撮影中にシーンが変更されました。撮り直してください。");
              const state = readAuthoringState(await tauri.readWorldAuthoring(root, sceneId));
              const next = changeAuthoringState(state, request.tool, { ...args, path }, fingerprint);
              await tauri.saveWorldAuthoring(root, sceneId, state?.sequence ?? 0, next);
              authoring = authoringStatus(next, fingerprint);
            }
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId,
                sceneId,
                revision: mcpRevisionRef.current,
                path,
                byteLength,
                editorMode: editorModeRef.current,
                image: {
                  mimeType: "image/png",
                  data: captured.dataUrl.slice(captured.dataUrl.indexOf(",") + 1),
                },
                authoring,
              },
            });
            return;
          }
          const action = mcpRequiredString(args.action, "action");
          if (action !== "metrics" && action !== "start" && action !== "stop") {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "actionはmetrics、start、stopのいずれかで指定してください",
            );
          }
          const requestedDuration =
            args.durationMs === undefined
              ? undefined
              : mcpOptionalInteger(args.durationMs, "durationMs");
          if (
            requestedDuration !== undefined &&
            (requestedDuration < 1_000 || requestedDuration > 15_000)
          ) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "durationMsは1000〜15000の範囲で指定してください",
            );
          }
          const result = await requestDebugCapture({
            action,
            ...(requestedDuration !== undefined
              ? { durationMs: requestedDuration }
              : {}),
            autoSave: true,
          });
          await completeResponse({
            id: request.id,
            ok: result.status !== "error",
            result,
            ...(result.status === "error"
              ? {
                  error: {
                    code: "DEBUG_CAPTURE_FAILED",
                    message: result.message ?? "シーンの診断取得に失敗しました",
                  },
                }
              : {}),
          });
          return;
        }
        const currentProjectPath = projectPathRef.current;
        if (request.tool === "import_shader_asset") {
          const args = request.arguments;
          const sourceBundle = bundleRef.current;
          assertMcpExternalStoreWrite(args, {
            bundle: sourceBundle,
            editorMode: editorModeRef.current,
            importBusy: importBusyRef.current,
            revision: mcpRevisionRef.current,
          });
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              "シェーダーを追加する前にプロジェクトを保存してください",
            );
          }
          if (importRunningRef.current || assetOperationRef.current !== null) {
            throw new XriftMcpEditorToolError(
              "EDITOR_BUSY",
              "別の素材操作の完了後にシェーダー読み込みを再試行してください",
            );
          }
          const sourcePath = mcpRequiredString(args.sourcePath, "sourcePath");
          const name = mcpOptionalString(args.name);
          if (name && name.length > 100) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "nameは100文字以内で指定してください",
            );
          }
          const folderId = mcpOptionalString(args.folderId) ?? null;
          if (folderId && !sourceBundle.assets.folders?.[folderId]) {
            throw new XriftMcpEditorToolError(
              "FOLDER_NOT_FOUND",
              "作成先のフォルダーが見つかりません",
              { folderId },
            );
          }
          const operationToken = Symbol("mcp-shader-import");
          importRunningRef.current = true;
          assetOperationRef.current = { kind: "asset-import", token: operationToken };
          setMcpLocalAssetImportBusy(true);
          try {
            let source: Awaited<ReturnType<typeof tauri.readLocalShaderImportSource>>;
            try {
              source = await tauri.readLocalShaderImportSource(sourcePath);
            } catch {
              throw new XriftMcpEditorToolError(
                "SHADER_SOURCE_REJECTED",
                "ローカルシェーダーを読み取れませんでした。絶対パス、GLSL拡張子、通常ファイル、8MiB上限を確認してください",
              );
            }
            const sourceHash = await sha256AssetBytes(
              new TextEncoder().encode(source.source),
            );
            const duplicate = Object.values(sourceBundle.assets.assets).find(
              (asset) => asset.kind === "shader" && asset.sourceHash === sourceHash,
            );
            if (duplicate?.kind === "shader") {
              assetSelectionRef.current = duplicate.id;
              setHistory((current) =>
                replaceEditorHistoryPresent(current, {
                  ...current.present,
                  assetSelection: duplicate.id,
                }),
              );
              setActiveAssetFolderId(duplicate.folderId ?? null);
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: sourceBundle.project.projectId,
                  sceneId: sourceBundle.scene.sceneId,
                  shaderAssetId: duplicate.id,
                  name: duplicate.name,
                  duplicate: true,
                  revisionBefore: mcpRevisionRef.current,
                  revisionAfter: mcpRevisionRef.current,
                },
              });
              return;
            }
            const relativePath = createShaderRelativePath(
              source.fileName,
              sourceBundle.assets,
            );
            const shader = createShaderAsset(
              createDocumentId("shader"),
              name ?? (source.fileName.replace(/\.[^.]+$/, "") || "Shader"),
              relativePath,
              sourceHash,
              folderId,
              shaderStageFromFileName(source.fileName),
            );
            await tauri.writeTextFile(
              currentProjectPath,
              relativePath,
              source.source,
            );
            const latestBundle = bundleRef.current;
            assertMcpExternalStoreWrite(
              args,
              {
                bundle: latestBundle,
                editorMode: editorModeRef.current,
                importBusy: false,
                revision: mcpRevisionRef.current,
              },
            );
            if (folderId && !latestBundle.assets.folders?.[folderId]) {
              await tauri.deletePath(currentProjectPath, relativePath).catch(() => undefined);
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                "シェーダー検証中に作成先フォルダーが更新されました。最新の編集状態を取得してから再試行してください",
                { folderId },
              );
            }
            const assets = addShaderAsset(latestBundle.assets, shader);
            const nextBundle = touchProject({ ...latestBundle, assets });
            const revisionBefore = mcpRevisionRef.current;
            mcpRevisionRef.current += 1;
            mcpRevisionBundleRef.current = nextBundle;
            bundleRef.current = nextBundle;
            assetSelectionRef.current = shader.id;
            saveStatusRef.current = "dirty";
            setHistory((current) =>
              commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                assetSelection: shader.id,
              }),
            );
            setActiveAssetFolderId(shader.folderId ?? null);
            setSaveStatus("dirty");
            const activity = `AIがシェーダー「${shader.name}」をインポートしました`;
            setNotice(`${activity}。変更を自動保存します`);
            setMcpLastActivity({
              clientName: request.clientName || "AI client",
              message: activity,
              at: new Intl.DateTimeFormat("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date()),
              revision: mcpRevisionRef.current,
            });
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId: nextBundle.project.projectId,
                sceneId: nextBundle.scene.sceneId,
                shaderAssetId: shader.id,
                name: shader.name,
                duplicate: false,
                relativePath,
                stage: shader.stage,
                revisionBefore,
                revisionAfter: mcpRevisionRef.current,
                sourceHash,
              },
            });
            return;
          } finally {
            importRunningRef.current = false;
            if (assetOperationRef.current?.token === operationToken) {
              assetOperationRef.current = null;
            }
            setMcpLocalAssetImportBusy(false);
          }
        }
        if (
          request.tool === "get_shader_asset" ||
          request.tool === "update_shader_asset" ||
          request.tool === "reimport_model_asset" ||
          request.tool === "process_texture_asset" ||
          request.tool === "bake_mesh_collider" ||
          request.tool === "optimize_model_asset" ||
          request.tool === "revert_asset_optimization" ||
          request.tool === "apply_scene_recipe" ||
          request.tool === "set_project_thumbnail"
        ) {
          const args = request.arguments;
          const sourceBundle = bundleRef.current;
          if (request.tool === "get_shader_asset") {
            const shaderAssetId = mcpRequiredString(
              args.shaderAssetId,
              "shaderAssetId",
            );
            const shader = sourceBundle.assets.assets[shaderAssetId];
            if (!shader || shader.kind !== "shader") {
              throw new XriftMcpEditorToolError(
                "SHADER_NOT_FOUND",
                "指定されたシェーダー素材が見つかりません",
                { shaderAssetId },
              );
            }
            if (!currentProjectPath) {
              throw new XriftMcpEditorToolError(
                "PROJECT_NOT_SAVED",
                "シェーダーを読み取る前にプロジェクトを保存してください",
              );
            }
            const source = await tauri.readTextFile(
              currentProjectPath,
              shader.source.relativePath,
            );
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                shaderAssetId: shader.id,
                name: shader.name,
                stage: shader.stage,
                relativePath: shader.source.relativePath,
                sourceHash: shader.sourceHash,
                source,
              },
            });
            return;
          }

          assertMcpExternalStoreWrite(
            args,
            {
              bundle: sourceBundle,
              editorMode: editorModeRef.current,
              importBusy: importBusyRef.current,
              revision: mcpRevisionRef.current,
            },
          );
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              "このMCP操作の前にプロジェクトを保存してください",
            );
          }
          if (request.tool === "set_project_thumbnail") {
            const assetId = mcpRequiredString(args.assetId, "assetId");
            const asset = sourceBundle.assets.assets[assetId];
            if (
              !asset ||
              (asset.kind !== "texture" && asset.kind !== "skybox")
            ) {
              throw new XriftMcpEditorToolError(
                "THUMBNAIL_ASSET_INVALID",
                "サムネイルにはテクスチャを指定してください",
                { assetId },
              );
            }
            await setProjectThumbnailFromAsset(currentProjectPath, asset);
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId: sourceBundle.project.projectId,
                sceneId: sourceBundle.scene.sceneId,
                assetId,
                revision: mcpRevisionRef.current,
                changed: true,
              },
            });
            return;
          }
          if (request.tool === "reimport_model_asset") {
            const modelAssetId = mcpRequiredString(
              args.modelAssetId,
              "modelAssetId",
            );
            if (!currentProjectPath) {
              throw new XriftMcpEditorToolError(
                "PROJECT_NOT_SAVED",
                "3Dモデルを再インポートする前にプロジェクトを保存してください",
              );
            }
            const model = sourceBundle.assets.assets[modelAssetId];
            if (!model || model.kind !== "model") {
              throw new XriftMcpEditorToolError(
                "MODEL_NOT_FOUND",
                "指定された3Dモデルが見つかりません",
                { modelAssetId },
              );
            }
            if (
              importRunningRef.current ||
              assetOperationRef.current !== null
            ) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                "別の素材操作の完了後に3Dモデル再インポートを再試行してください",
              );
            }
            const operationToken = Symbol("mcp-model-reimport");
            const startingRevision = mcpRevisionRef.current;
            importRunningRef.current = true;
            assetOperationRef.current = {
              kind: "model-reimport",
              token: operationToken,
            };
            try {
              const result = await reimportModelAssetFromDisk(
                currentProjectPath,
                sourceBundle.assets,
                modelAssetId,
                (progress) =>
                  setModelReimportFeedback({
                    assetId: modelAssetId,
                    state: modelReimportStateFromProgress(progress),
                  }),
                textureImportSettingsPatch(
                  textureImportMaxSizeRef.current,
                  textureImportCompressionRef.current,
                ),
              );
              if (!result.ok) {
                setModelReimportFeedback({
                  assetId: modelAssetId,
                  state: { phase: "failed", message: result.message },
                });
                throw new XriftMcpEditorToolError(
                  "MODEL_REIMPORT_REJECTED",
                  result.message,
                  { diagnostics: result.diagnostics },
                );
              }
              const latestBundle = bundleRef.current;
              if (
                latestBundle.assets.assets[modelAssetId] !== model ||
                mcpRevisionRef.current !== startingRevision
              ) {
                throw new XriftMcpEditorToolError(
                  "STALE_REVISION",
                  "3Dモデル再インポート中にプロジェクトが更新されました。最新の編集状態を取得してから再試行してください",
                  { modelAssetId },
                );
              }
              const importedModel = result.manifest.assets[modelAssetId];
              if (importedModel.kind !== "model") throw new Error("再インポートした3Dモデルが見つかりません");
              const nextBundle = touchProject(applyModelReimportSettings({
                ...latestBundle,
                assets: result.manifest,
              }, importedModel));
              const revisionBefore = mcpRevisionRef.current;
              mcpRevisionRef.current += 1;
              mcpRevisionBundleRef.current = nextBundle;
              bundleRef.current = nextBundle;
              assetSelectionRef.current = modelAssetId;
              saveStatusRef.current = "dirty";
              setHistory((current) =>
                commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection: modelAssetId,
                }),
              );
              setSaveStatus("dirty");
              setModelReimportFeedback({
                assetId: modelAssetId,
                state: {
                  phase: "succeeded",
                  message: "3Dモデルを読み込み直しました",
                },
              });
              const activity = `AIが3Dモデル「${model.name}」を再インポートしました`;
              setNotice(`${activity}。変更を自動保存します`);
              setMcpLastActivity({
                clientName: request.clientName || "AI client",
                message: activity,
                at: new Intl.DateTimeFormat("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date()),
                revision: mcpRevisionRef.current,
              });
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: nextBundle.project.projectId,
                  sceneId: nextBundle.scene.sceneId,
                  modelAssetId,
                  revisionBefore,
                  revisionAfter: mcpRevisionRef.current,
                  diagnostics: result.diagnostics,
                },
              });
              return;
            } finally {
              importRunningRef.current = false;
              if (assetOperationRef.current?.token === operationToken) {
                assetOperationRef.current = null;
              }
            }
          }

          // 3Dセットは、部品のModelをprojectへ書き出してから組み立てる。
          // Assetのfile I/Oを伴うので、documentのtoolではなくshellが持つ。
          if (request.tool === "apply_scene_recipe") {
            const recipeId = mcpRequiredString(args.recipeId, "recipeId");
            const sourceScene = sourceBundle.scene;
            const position =
              mcpOptionalVec3(args.position, "position") ??
              // 何も指定されなければ、店から置いたときと同じ格子へ並べる。
              // 全部が原点へ重なると、置いた結果が読めなくなる。
              ([
                roundTo(((sourceScene.rootEntityIds.length % 5) - 2) * 1.35, 1),
                0,
                roundTo(
                  (Math.floor(sourceScene.rootEntityIds.length / 5) - 0.5) *
                    1.35,
                  1,
                ),
              ] as [number, number, number]);
            // 部品のModel書き出しを待つ間にEditorが動くことがある。
            // 待つ前のrevisionを覚えておき、動いていたら適用しない。
            const placed = await instantiateSceneRecipe(
              sourceScene,
              sourceBundle.assets,
              recipeId,
              sourceBundle.project.projectKind,
              currentProjectPath,
              position,
            );
            if (!placed) {
              throw new XriftMcpEditorToolError(
                "SCENE_RECIPE_UNAVAILABLE",
                "この3Dセットを現在のプロジェクトへ配置できませんでした。recipeIdとproject kindを確認してください",
                { recipeId, projectKind: sourceBundle.project.projectKind },
              );
            }
            // Only the documents the recipe writes into can conflict. The
            // AssetManifest moves on its own while Models are exported: the
            // thumbnail queue records each generated (or failed) thumbnail,
            // so right after an import this check used to fail every time.
            // Those background updates are kept and the recipe's new Assets
            // are added on top; a Scene that moved is still a conflict.
            const latestBundle = bundleRef.current;
            if (
              latestBundle.scene !== sourceBundle.scene ||
              latestBundle.prefabs !== sourceBundle.prefabs ||
              latestBundle.project !== sourceBundle.project
            ) {
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                "3Dセットの配置中にプロジェクトが更新されました。最新の編集状態を取得してから再試行してください",
                { recipeId },
              );
            }
            const mergedAssets =
              latestBundle.assets === sourceBundle.assets
                ? placed.assets
                : mergeRecipeAssetsOntoLatest(
                    sourceBundle.assets,
                    placed.assets,
                    latestBundle.assets,
                  );
            // Subtree と、その Particle Asset を一件の history にする。
            // セットを Undo したときに Asset だけ残らないようにするため。
            const nextBundle = touchProject({
              ...latestBundle,
              assets: mergedAssets,
              scene: placed.scene,
            });
            const revisionBefore = mcpRevisionRef.current;
            mcpRevisionRef.current += 1;
            mcpRevisionBundleRef.current = nextBundle;
            bundleRef.current = nextBundle;
            sceneSelectionRef.current = {
              kind: "entity",
              id: placed.rootEntityId,
            };
            assetSelectionRef.current = null;
            saveStatusRef.current = "dirty";
            setHistory((current) =>
              commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                sceneSelection: { kind: "entity", id: placed.rootEntityId },
                assetSelection: null,
              }),
            );
            setSaveStatus("dirty");
            const entityName =
              placed.scene.entities[placed.rootEntityId]?.name ?? recipeId;
            const activity = `AIが3Dセット「${entityName}」をシーンへ配置しました`;
            setNotice(`${activity}。変更を自動保存します`);
            setMcpLastActivity({
              clientName: request.clientName || "AI client",
              message: activity,
              at: new Intl.DateTimeFormat("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date()),
              revision: mcpRevisionRef.current,
            });
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId: nextBundle.project.projectId,
                sceneId: nextBundle.scene.sceneId,
                revisionBefore,
                revisionAfter: mcpRevisionRef.current,
                recipeId,
                entityId: placed.rootEntityId,
                entityName,
                position,
                childEntityIds:
                  placed.scene.entities[placed.rootEntityId]?.children ?? [],
                createdAssetIds: placed.createdAssetIds,
              },
            });
            return;
          }

          // Texture Inspector の解像度変更と圧縮を MCP から実行する。
          // update_texture_asset が書けるのは Import 設定だけで、原本の画像は
          // そのまま残る。設定だけ書き換えて終わると、Editor では「未反映」と
          // 表示されている状態を AI が「圧縮した」と報告してしまうため、実際の
          // 変換までを一つの tool にする。
          if (request.tool === "process_texture_asset") {
            const textureAssetId = mcpRequiredString(
              args.textureAssetId,
              "textureAssetId",
            );
            const texture = sourceBundle.assets.assets[textureAssetId];
            if (!texture || texture.kind !== "texture") {
              throw new XriftMcpEditorToolError(
                "TEXTURE_NOT_FOUND",
                "指定されたテクスチャが見つかりません",
                { textureAssetId },
              );
            }
            const availability = resolveAssetOperationAvailability(
              "texture-processing",
              {
                readOnly: editorModeRef.current !== "edit",
                assetImportActive:
                  importRunningRef.current ||
                  hasActiveAssetImport(importQueueRef.current),
                modelReimportActive:
                  assetOperationRef.current?.kind === "model-reimport",
                textureProcessingActive:
                  assetOperationRef.current?.kind === "texture-processing",
              },
            );
            if (!availability.allowed) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                availability.disabledReason ?? "いまはテクスチャを変換できません",
                { textureAssetId },
              );
            }
            const plan = planTextureProcessing(texture);
            if (!plan.supported) {
              throw new XriftMcpEditorToolError(
                "TEXTURE_PROCESSING_UNSUPPORTED",
                plan.reason,
                { textureAssetId },
              );
            }
            // 何も変わらない変換は実行しない。原本を書き直せば内容が同じでも
            // ハッシュとファイルサイズが動き、差分だけが増える。
            if (!plan.pending) {
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: sourceBundle.project.projectId,
                  sceneId: sourceBundle.scene.sceneId,
                  textureAssetId,
                  revision: mcpRevisionRef.current,
                  changed: false,
                  settledReason: plan.settledReason,
                  sourceFormat: plan.sourceFormat,
                  width: plan.sourceWidth,
                  height: plan.sourceHeight,
                  byteLength: plan.sourceByteLength,
                },
              });
              return;
            }
            const operationToken = Symbol("mcp-texture-processing");
            const startingRevision = mcpRevisionRef.current;
            assetOperationRef.current = {
              kind: "texture-processing",
              token: operationToken,
            };
            setTextureProcessingFeedback({
              assetId: textureAssetId,
              state: {
                phase: "reading",
                message: `${texture.name}を読み込んでいます`,
              },
            });
            try {
              const result = await applyTextureProcessing(
                currentProjectPath,
                sourceBundle.assets,
                textureAssetId,
                (progress) =>
                  setTextureProcessingFeedback({
                    assetId: textureAssetId,
                    state: {
                      phase: progress.phase,
                      message: progress.message,
                    },
                  }),
              );
              if (!result.ok) {
                setTextureProcessingFeedback({
                  assetId: textureAssetId,
                  state: { phase: "failed", message: result.message },
                });
                throw new XriftMcpEditorToolError(
                  "TEXTURE_PROCESSING_FAILED",
                  result.message,
                  { textureAssetId },
                );
              }
              // 変換中に設定が動いていたら書き出した画像を採用しない。
              // Inspector の手動変換と同じ判断で、原本を残す方を選ぶ。
              if (
                bundleRef.current.assets.assets[textureAssetId] !== texture ||
                mcpRevisionRef.current !== startingRevision
              ) {
                const staleMessage =
                  "変換中にテクスチャ設定が変更されたため、適用を取り消しました。元の画像は残っています";
                setTextureProcessingFeedback({
                  assetId: textureAssetId,
                  state: { phase: "failed", message: staleMessage },
                });
                throw new XriftMcpEditorToolError(
                  "STALE_REVISION",
                  staleMessage,
                  { textureAssetId },
                );
              }
              const formatLabel =
                result.outputFormat === "jpeg"
                  ? "JPEG"
                  : result.outputFormat.toUpperCase();
              const summary = `${result.width} × ${result.height}の${formatLabel}へ変換しました（${formatFileSize(result.beforeBytes)} → ${formatFileSize(result.afterBytes)}）`;
              const nextBundle = touchProject({
                ...bundleRef.current,
                assets: result.manifest,
              });
              const revisionBefore = mcpRevisionRef.current;
              mcpRevisionRef.current += 1;
              mcpRevisionBundleRef.current = nextBundle;
              bundleRef.current = nextBundle;
              assetSelectionRef.current = textureAssetId;
              saveStatusRef.current = "dirty";
              setHistory((current) =>
                commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection: textureAssetId,
                }),
              );
              setSaveStatus("dirty");
              setTextureProcessingFeedback({
                assetId: textureAssetId,
                state: { phase: "succeeded", message: summary },
              });
              const activity = `AIがテクスチャ「${result.assetName}」を${summary}`;
              setNotice(`${activity}。変更を自動保存します`);
              setMcpLastActivity({
                clientName: request.clientName || "AI client",
                message: activity,
                at: new Intl.DateTimeFormat("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date()),
                revision: mcpRevisionRef.current,
              });
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: nextBundle.project.projectId,
                  sceneId: nextBundle.scene.sceneId,
                  textureAssetId,
                  revisionBefore,
                  revisionAfter: mcpRevisionRef.current,
                  changed: true,
                  outputFormat: result.outputFormat,
                  width: result.width,
                  height: result.height,
                  beforeWidth: result.beforeWidth,
                  beforeHeight: result.beforeHeight,
                  beforeBytes: result.beforeBytes,
                  afterBytes: result.afterBytes,
                },
              });
              return;
            } finally {
              if (assetOperationRef.current?.token === operationToken) {
                assetOperationRef.current = null;
              }
            }
          }

          // 変換・最適化の解除。原本は消していないので、参照先と Import 設定を
          // 戻すだけで済む。AI が圧縮を試して戻せないと、作者が手で直すことに
          // なるため、実行と同じ surface に解除も置く。
          if (request.tool === "revert_asset_optimization") {
            const assetId = mcpRequiredString(args.assetId, "assetId");
            const target = sourceBundle.assets.assets[assetId];
            if (!target || (target.kind !== "texture" && target.kind !== "model")) {
              throw new XriftMcpEditorToolError(
                "ASSET_NOT_FOUND",
                "テクスチャまたは 3Dモデルが見つかりません",
                { assetId },
              );
            }
            const availability = resolveAssetOperationAvailability(
              target.kind === "texture" ? "texture-processing" : "model-optimization",
              {
                readOnly: editorModeRef.current !== "edit",
                assetImportActive:
                  importRunningRef.current ||
                  hasActiveAssetImport(importQueueRef.current),
                modelReimportActive:
                  assetOperationRef.current?.kind === "model-reimport",
                textureProcessingActive:
                  assetOperationRef.current?.kind === "texture-processing",
              },
            );
            if (!availability.allowed) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                availability.disabledReason ?? "いまは原本へ戻せません",
                { assetId },
              );
            }
            const result =
              target.kind === "texture"
                ? revertTextureOptimization(sourceBundle.assets, assetId)
                : revertModelOptimization(sourceBundle.assets, assetId);
            if (!result.ok) {
              throw new XriftMcpEditorToolError(
                "ASSET_NOT_OPTIMIZED",
                result.message,
                { assetId },
              );
            }
            const nextBundle = touchProject({
              ...bundleRef.current,
              assets: result.manifest,
            });
            const revisionBefore = mcpRevisionRef.current;
            mcpRevisionRef.current += 1;
            mcpRevisionBundleRef.current = nextBundle;
            bundleRef.current = nextBundle;
            assetSelectionRef.current = assetId;
            saveStatusRef.current = "dirty";
            setHistory((current) =>
              commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                assetSelection: assetId,
              }),
            );
            setSaveStatus("dirty");
            const activity = `AIが「${result.assetName}」を原本に戻しました`;
            setNotice(`${activity}。変更を自動保存します`);
            setMcpLastActivity({
              clientName: request.clientName || "AI client",
              message: activity,
              at: new Intl.DateTimeFormat("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date()),
              revision: mcpRevisionRef.current,
            });
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId: nextBundle.project.projectId,
                sceneId: nextBundle.scene.sceneId,
                assetId,
                assetKind: target.kind,
                revisionBefore,
                revisionAfter: mcpRevisionRef.current,
                reverted: true,
              },
            });
            return;
          }

          if (request.tool === "bake_mesh_collider") {
            const entityId = mcpRequiredString(args.entityId, "entityId");
            const componentId = mcpRequiredString(args.componentId, "componentId");
            const entity = sourceBundle.scene.entities[entityId];
            const node = entity && colliderModelNode(entity);
            const collider = entity?.components.find((c) => c.id === componentId && c.type === "collider");
            if (!node || collider?.type !== "collider" || collider.shape !== "mesh" || typeof args.ratio !== "number") throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "3Dモデルのメッシュノードとメッシュ衝突判定、残す割合を指定してください");
            if (assetOperationRef.current || importRunningRef.current) throw new XriftMcpEditorToolError("EDITOR_BUSY", "素材の処理が終わってから再実行してください");
            const token = Symbol("mcp-collider-bake");
            assetOperationRef.current = { kind: "model-reimport", token };
            try {
              const result = await bakeNodeColliderModel(currentProjectPath, sourceBundle.assets, {
                modelAssetId: node.modelAssetId, sourceNodeIndex: node.sourceNodeIndex,
                ratio: args.ratio, nodeName: entity.name, existingAssetId: collider.collisionModelAssetId,
                createAssetId: () => createDocumentId("model-collision"),
              });
              if (!result.ok) throw new XriftMcpEditorToolError("COLLIDER_BAKE_FAILED", result.message);
              if (bundleRef.current !== sourceBundle) throw new XriftMcpEditorToolError("STALE_REVISION", "作成中にシーンが変わったため適用しませんでした。再実行してください");
              const nextBundle = touchProject({ ...sourceBundle, assets: result.manifest,
                scene: updateColliderComponent(sourceBundle.scene, entityId, { collisionModelAssetId: result.assetId }, componentId) });
              const revisionBefore = mcpRevisionRef.current;
              mcpRevisionRef.current += 1; mcpRevisionBundleRef.current = nextBundle; bundleRef.current = nextBundle;
              saveStatusRef.current = "dirty"; setSaveStatus("dirty");
              setHistory((current) => commitEditorHistory(current, { ...current.present, bundle: nextBundle }));
              await completeResponse({ id: request.id, ok: true, result: { entityId, componentId, assetId: result.assetId, triangles: result.triangles, revisionBefore, revisionAfter: mcpRevisionRef.current } });
            } finally { if (assetOperationRef.current?.token === token) assetOperationRef.current = null; }
            return;
          }

          // Model Inspector の Mesh 最適化 / Draco 圧縮を MCP から実行する。
          // update_model_asset が書けるのは Import 設定だけで、原本の GLB は
          // そのまま残る。設定だけ書き換えて「軽くした」と報告させないため、
          // 実際の書き出しまでを一つの tool にする。
          if (request.tool === "optimize_model_asset") {
            const modelAssetId = mcpRequiredString(args.modelAssetId, "modelAssetId");
            const model = sourceBundle.assets.assets[modelAssetId];
            if (!model || model.kind !== "model") {
              throw new XriftMcpEditorToolError(
                "MODEL_NOT_FOUND",
                "3Dモデルが見つかりません",
                { modelAssetId },
              );
            }
            const simplifyRatio =
              typeof args.simplifyRatio === "number"
                ? args.simplifyRatio
                : undefined;
            if (simplifyRatio !== undefined && !isValidSimplifyRatio(simplifyRatio)) {
              throw new XriftMcpEditorToolError(
                "MODEL_OPTIMIZATION_UNSUPPORTED",
                "simplifyRatioは0より大きく1未満で指定してください",
                { modelAssetId, simplifyRatio },
              );
            }
            const simplifySourceNodeIndex =
              typeof args.simplifySourceNodeIndex === "number"
                ? args.simplifySourceNodeIndex
                : undefined;
            const options: ModelOptimizationOptions = {
              optimizeMeshes: args.optimizeMeshes !== false,
              compressWithDraco: args.compressWithDraco !== false,
              ...(simplifyRatio !== undefined
                ? {
                    simplify: {
                      ratio: simplifyRatio,
                      target:
                        simplifySourceNodeIndex === undefined
                          ? { kind: "model" as const }
                          : {
                              kind: "node" as const,
                              sourceNodeIndex: simplifySourceNodeIndex,
                            },
                    },
                  }
                : {}),
            };
            const availability = resolveAssetOperationAvailability(
              "model-optimization",
              {
                readOnly: editorModeRef.current !== "edit",
                assetImportActive:
                  importRunningRef.current ||
                  hasActiveAssetImport(importQueueRef.current),
                modelReimportActive:
                  assetOperationRef.current?.kind === "model-reimport",
                textureProcessingActive:
                  assetOperationRef.current?.kind === "texture-processing",
              },
            );
            if (!availability.allowed) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                availability.disabledReason ?? "いまは3Dモデルを最適化できません",
                { modelAssetId },
              );
            }
            const plan = planModelOptimization(model, options);
            if (!plan.supported) {
              throw new XriftMcpEditorToolError(
                "MODEL_OPTIMIZATION_UNSUPPORTED",
                plan.reason,
                { modelAssetId },
              );
            }
            // 何も変わらない最適化は実行しない。原本を書き直せば内容が同じでも
            // ハッシュとファイルサイズが動き、差分だけが増える。
            if (plan.steps.length === 0) {
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: sourceBundle.project.projectId,
                  sceneId: sourceBundle.scene.sceneId,
                  modelAssetId,
                  revision: mcpRevisionRef.current,
                  changed: false,
                  alreadyDraco: plan.alreadyDraco,
                  byteLength: plan.sourceByteLength,
                },
              });
              return;
            }
            const operationToken = Symbol("mcp-model-optimization");
            const startingRevision = mcpRevisionRef.current;
            assetOperationRef.current = {
              kind: "model-reimport",
              token: operationToken,
            };
            setModelOptimizationFeedback({
              assetId: modelAssetId,
              state: { phase: "reading", message: `${model.name}を読み込んでいます` },
            });
            try {
              const result = await applyModelOptimization(
                currentProjectPath,
                sourceBundle.assets,
                modelAssetId,
                options,
                (progress) =>
                  setModelOptimizationFeedback({
                    assetId: modelAssetId,
                    state: { phase: progress.phase, message: progress.message },
                  }),
              );
              if (!result.ok) {
                setModelOptimizationFeedback({
                  assetId: modelAssetId,
                  state: { phase: "failed", message: result.message },
                });
                throw new XriftMcpEditorToolError(
                  "MODEL_OPTIMIZATION_FAILED",
                  result.message,
                  { modelAssetId },
                );
              }
              if (
                bundleRef.current.assets.assets[modelAssetId] !== model ||
                mcpRevisionRef.current !== startingRevision
              ) {
                const staleMessage =
                  "最適化中に3Dモデル設定が変更されたため、適用を取り消しました。元の3Dモデルは残っています";
                setModelOptimizationFeedback({
                  assetId: modelAssetId,
                  state: { phase: "failed", message: staleMessage },
                });
                throw new XriftMcpEditorToolError("STALE_REVISION", staleMessage, {
                  modelAssetId,
                });
              }
              const summary = `${formatFileSize(result.beforeBytes)} → ${formatFileSize(result.afterBytes)}へ最適化しました（${result.steps
                .map((step) => MODEL_OPTIMIZATION_STEP_LABELS[step])
                .join(" / ")}）`;
              const nextBundle = touchProject({
                ...bundleRef.current,
                assets: result.manifest,
              });
              const revisionBefore = mcpRevisionRef.current;
              mcpRevisionRef.current += 1;
              mcpRevisionBundleRef.current = nextBundle;
              bundleRef.current = nextBundle;
              assetSelectionRef.current = modelAssetId;
              saveStatusRef.current = "dirty";
              setHistory((current) =>
                commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection: modelAssetId,
                }),
              );
              setSaveStatus("dirty");
              setModelOptimizationFeedback({
                assetId: modelAssetId,
                state: { phase: "succeeded", message: summary },
              });
              const activity = `AIが3Dモデル「${result.assetName}」を${summary}`;
              setNotice(`${activity}。変更を自動保存します`);
              setMcpLastActivity({
                clientName: request.clientName || "AI client",
                message: activity,
                at: new Intl.DateTimeFormat("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date()),
                revision: mcpRevisionRef.current,
              });
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: nextBundle.project.projectId,
                  sceneId: nextBundle.scene.sceneId,
                  modelAssetId,
                  revisionBefore,
                  revisionAfter: mcpRevisionRef.current,
                  changed: true,
                  steps: result.steps,
                  beforeBytes: result.beforeBytes,
                  afterBytes: result.afterBytes,
                  ...(result.triangles ? { triangles: result.triangles } : {}),
                },
              });
              return;
            } finally {
              if (assetOperationRef.current?.token === operationToken) {
                assetOperationRef.current = null;
              }
            }
          }

          const shaderAssetId = mcpRequiredString(
            args.shaderAssetId,
            "shaderAssetId",
          );
          const shader = sourceBundle.assets.assets[shaderAssetId];
          if (!shader || shader.kind !== "shader") {
            throw new XriftMcpEditorToolError(
              "SHADER_NOT_FOUND",
              "指定されたシェーダー素材が見つかりません",
              { shaderAssetId },
            );
          }
          if (typeof args.source !== "string" || !args.source.trim()) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "元データは空でない文字列で指定してください",
            );
          }
          if (new TextEncoder().encode(args.source).byteLength > 8 * 1024 * 1024) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "元データは8MiB以内で指定してください",
            );
          }
          const previousSource = await tauri.readTextFile(
            currentProjectPath,
            shader.source.relativePath,
          );
          const sourceHash = await sha256AssetBytes(
            new TextEncoder().encode(args.source),
          );
          await tauri.writeTextFile(
            currentProjectPath,
            shader.source.relativePath,
            args.source,
          );
          if (bundleRef.current.assets.assets[shaderAssetId] !== shader) {
            await tauri.writeTextFile(
              currentProjectPath,
              shader.source.relativePath,
              previousSource,
            ).catch(() => undefined);
            throw new XriftMcpEditorToolError(
              "STALE_REVISION",
              "シェーダー保存中に素材が更新されました。最新の編集状態を取得してから再試行してください",
              { shaderAssetId },
            );
          }
          const updatedShader = { ...shader, sourceHash };
          const nextBundle = touchProject({
            ...bundleRef.current,
            assets: {
              ...bundleRef.current.assets,
              assets: {
                ...bundleRef.current.assets.assets,
                [shaderAssetId]: updatedShader,
              },
            },
          });
          const revisionBefore = mcpRevisionRef.current;
          mcpRevisionRef.current += 1;
          mcpRevisionBundleRef.current = nextBundle;
          bundleRef.current = nextBundle;
          assetSelectionRef.current = shaderAssetId;
          saveStatusRef.current = "dirty";
          setHistory((current) =>
            commitEditorHistory(current, {
              ...current.present,
              bundle: nextBundle,
              assetSelection: shaderAssetId,
            }),
          );
          setSaveStatus("dirty");
          const activity = `AIがシェーダー「${shader.name}」を更新しました`;
          setNotice(`${activity}。変更を自動保存します`);
          setMcpLastActivity({
            clientName: request.clientName || "AI client",
            message: activity,
            at: new Intl.DateTimeFormat("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
            revision: mcpRevisionRef.current,
          });
          await completeResponse({
            id: request.id,
            ok: true,
            result: {
              projectId: nextBundle.project.projectId,
              sceneId: nextBundle.scene.sceneId,
              shaderAssetId,
              revisionBefore,
              revisionAfter: mcpRevisionRef.current,
              sourceHash,
              sourceSaved: true,
            },
          });
          return;
        }
        if (localAssetTool) {
          const args = request.arguments;
          const isAudioImport = request.tool === "import_audio_asset";
          const isFontImport = request.tool === "import_font_asset";
          const isModelImport = request.tool === "import_model_asset";
          const isSkyboxImport = request.tool === "import_skybox_asset";
          const importedKind = isAudioImport
            ? "audio"
            : isFontImport
              ? "font"
              : isModelImport
                ? "model"
                : "texture";
          const expectedClassificationKind = isSkyboxImport
            ? "skybox"
            : importedKind;
          const assetLabel = isAudioImport
            ? "Audio"
            : isFontImport
              ? "Font"
              : isModelImport
                ? "Model"
                : isSkyboxImport
                  ? "HDRI"
                  : "Texture";
          const sourceRejectedCode = isAudioImport
            ? "AUDIO_SOURCE_REJECTED"
            : isFontImport
              ? "FONT_SOURCE_REJECTED"
              : isModelImport
                ? "MODEL_SOURCE_REJECTED"
                : isSkyboxImport
                  ? "SKYBOX_SOURCE_REJECTED"
                  : "TEXTURE_SOURCE_REJECTED";
          const importRejectedCode = isAudioImport
            ? "AUDIO_IMPORT_REJECTED"
            : isFontImport
              ? "FONT_IMPORT_REJECTED"
              : isModelImport
                ? "MODEL_IMPORT_REJECTED"
                : isSkyboxImport
                  ? "SKYBOX_IMPORT_REJECTED"
                  : "TEXTURE_IMPORT_REJECTED";
          const importFailedCode = isAudioImport
            ? "AUDIO_IMPORT_FAILED"
            : isFontImport
              ? "FONT_IMPORT_FAILED"
              : isModelImport
                ? "MODEL_IMPORT_FAILED"
                : isSkyboxImport
                  ? "SKYBOX_IMPORT_FAILED"
                  : "TEXTURE_IMPORT_FAILED";
          const sourceBundle = bundleRef.current;
          assertMcpExternalStoreWrite(args, {
            bundle: sourceBundle,
            editorMode: editorModeRef.current,
            importBusy: importBusyRef.current,
            revision: mcpRevisionRef.current,
          });
          if (
            importRunningRef.current ||
            assetOperationRef.current !== null
          ) {
            throw new XriftMcpEditorToolError(
              "EDITOR_BUSY",
              `別の素材操作の完了後に${assetLabel} 読み込みを再試行してください`,
            );
          }
          const currentProjectPath = projectPathRef.current;
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              `${assetLabel}を追加する前にプロジェクトを保存してください`,
            );
          }
          const sourcePath = mcpRequiredString(args.sourcePath, "sourcePath");
          const name = mcpOptionalString(args.name);
          if (name && name.length > 100) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "nameは100文字以内で指定してください",
            );
          }
          const folderId = mcpOptionalString(args.folderId) ?? null;
          if (folderId && !sourceBundle.assets.folders?.[folderId]) {
            throw new XriftMcpEditorToolError(
              "FOLDER_NOT_FOUND",
              "作成先のフォルダーが見つかりません",
              { folderId },
            );
          }
          const importSettings =
            isAudioImport || isFontImport || isSkyboxImport
            ? undefined
            : args.importSettings === undefined || isModelImport
            ? textureImportSettingsPatch(textureImportMaxSizeRef.current, textureImportCompressionRef.current)
            : mcpTextureImportSettingsPatch(
                args.importSettings,
                "importSettings",
                { allowEmpty: true },
              );
          const operationToken = Symbol(`mcp-local-${importedKind}-import`);
          importRunningRef.current = true;
          assetOperationRef.current = {
            kind: "asset-import",
            token: operationToken,
          };
          setMcpLocalAssetImportBusy(true);
          try {
            let source: Awaited<
              ReturnType<typeof tauri.readLocalTextureImportSource>
            >;
            try {
              source = isAudioImport
                ? await tauri.readLocalAudioImportSource(sourcePath)
                : isFontImport
                  ? await tauri.readLocalFontImportSource(sourcePath)
                  : isModelImport
                    ? await tauri.readLocalModelImportSource(sourcePath)
                    : await tauri.readLocalTextureImportSource(sourcePath);
            } catch {
              throw new XriftMcpEditorToolError(
                sourceRejectedCode,
                `ローカル${assetLabel}を読み取れませんでした。絶対パス、対応形式、通常ファイル、128MB上限を確認してください`,
              );
            }
            let bytes: ArrayBuffer;
            try {
              const response = await fetch(source.dataUrl);
              if (!response.ok) throw new Error("decode failed");
              bytes = await response.arrayBuffer();
            } catch {
              throw new XriftMcpEditorToolError(
                sourceRejectedCode,
                `ローカル${assetLabel}の内容を安全に読み取れませんでした`,
              );
            }
            if (
              bytes.byteLength === 0 ||
              bytes.byteLength !== source.byteLength
            ) {
              throw new XriftMcpEditorToolError(
                sourceRejectedCode,
                `ローカル${assetLabel}のサイズが読み取り中に変わりました。ファイルを閉じて再試行してください`,
              );
            }
            const plan = await createAssetImportPlan({
              fileName: source.fileName,
              bytes,
              mimeType: source.mimeType,
              ...(name ? { displayName: name } : {}),
              folderId,
              ...(importSettings
                ? {
                    textureImportSettings: importSettings,
                    ...(isModelImport ? {} : { preferredKind: "texture" as const }),
                  }
                : {}),
              ...(isModelImport ? { preferredKind: "model" as const } : {}),
              existingManifest: sourceBundle.assets,
            });
            if (
              !plan.canCommit ||
              !plan.asset ||
              plan.asset.kind !== importedKind ||
              plan.classification?.kind !== expectedClassificationKind
            ) {
              const diagnostics = plan.diagnostics.map(
                ({ severity, code, message, fieldPath }) => ({
                  severity,
                  code,
                  message,
                  ...(fieldPath ? { fieldPath } : {}),
                }),
              );
              throw new XriftMcpEditorToolError(
                importRejectedCode,
                diagnostics.find(
                  (diagnostic) => diagnostic.severity === "blocking",
                )?.message ??
                  `対応する${assetLabel}として検証できませんでした`,
                { diagnostics },
              );
            }

            const latestBundle = bundleRef.current;
            assertMcpExternalStoreWrite(
              args,
              {
                bundle: latestBundle,
                editorMode: editorModeRef.current,
                // This operation owns the import lock at this point.
                importBusy: false,
                revision: mcpRevisionRef.current,
              },
            );
            if (folderId && !latestBundle.assets.folders?.[folderId]) {
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                `${assetLabel}検証中に作成先フォルダーが更新されました。最新の編集状態を取得してから再試行してください`,
                { folderId },
              );
            }
            const duplicate = Object.values(latestBundle.assets.assets).find(
              (asset) =>
                asset.kind === importedKind &&
                asset.sourceHash === plan.sourceHash,
            );
            if (
              duplicate?.kind === "audio" ||
              duplicate?.kind === "font" ||
              duplicate?.kind === "model" ||
              duplicate?.kind === "texture"
            ) {
              const duplicateScene = isSkyboxImport
                ? assignSkyboxToScene(latestBundle.scene, duplicate.id)
                : latestBundle.scene;
              const duplicateChanged = duplicateScene !== latestBundle.scene;
              const duplicateRevisionBefore = mcpRevisionRef.current;
              if (duplicateChanged) {
                const nextBundle = touchProject({
                  ...latestBundle,
                  scene: duplicateScene,
                });
                mcpRevisionRef.current += 1;
                mcpRevisionBundleRef.current = nextBundle;
                bundleRef.current = nextBundle;
                saveStatusRef.current = "dirty";
                setHistory((current) =>
                  commitEditorHistory(current, {
                    ...current.present,
                    bundle: nextBundle,
                    assetSelection: duplicate.id,
                  }),
                );
                setSaveStatus("dirty");
              }
              assetSelectionRef.current = duplicate.id;
              if (!duplicateChanged) {
                setHistory((current) =>
                  replaceEditorHistoryPresent(current, {
                    ...current.present,
                    assetSelection: duplicate.id,
                  }),
                );
              }
              setActiveAssetFolderId(duplicate.folderId ?? null);
              const activity = `AIが登録済み${assetLabel}「${duplicate.name}」を選択しました`;
              setNotice(activity);
              setMcpLastActivity({
                clientName: request.clientName || "AI client",
                message: activity,
                at: new Intl.DateTimeFormat("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date()),
                revision: mcpRevisionRef.current,
              });
              await completeResponse({
                id: request.id,
                ok: true,
                result: {
                  projectId: latestBundle.project.projectId,
                  sceneId: latestBundle.scene.sceneId,
                  [
                    isAudioImport
                      ? "audioAssetId"
                      : isModelImport
                        ? "modelAssetId"
                        : "textureAssetId"
                  ]: duplicate.id,
                  name: duplicate.name,
                  duplicate: true,
                  revisionBefore: duplicateRevisionBefore,
                  revisionAfter: mcpRevisionRef.current,
                  relativePath:
                    duplicate.source.kind === "project"
                      ? duplicate.source.relativePath
                      : null,
                  ...(duplicate.kind === "texture"
                    ? { importSettings: duplicate.importSettings }
                    : { importMetadata: duplicate.importMetadata }),
                },
              });
              return;
            }

            let committedAssets: AssetManifest;
            try {
              committedAssets = await commitAssetImportPlanToDisk(
                currentProjectPath,
                latestBundle.assets,
                plan,
              );
            } catch (error) {
              throw new XriftMcpEditorToolError(
                importFailedCode,
                sanitizedImportMessage(error, currentProjectPath),
              );
            }
            assertMcpExternalStoreWrite(
              args,
              {
                bundle: bundleRef.current,
                editorMode: editorModeRef.current,
                importBusy: false,
                revision: mcpRevisionRef.current,
              },
            );
            const imported = committedAssets.assets[plan.asset.id];
            if (
              !imported ||
              (imported.kind !== "audio" &&
                imported.kind !== "model" &&
                imported.kind !== "texture") ||
              imported.kind !== importedKind
            ) {
              throw new XriftMcpEditorToolError(
                importFailedCode,
                `保存した${assetLabel}をAssetManifestへ反映できませんでした`,
              );
            }
            const revisionBefore = mcpRevisionRef.current;
            const nextBundle = touchProject({
              ...bundleRef.current,
              assets: committedAssets,
              scene: isSkyboxImport
                ? assignSkyboxToScene(bundleRef.current.scene, imported.id)
                : bundleRef.current.scene,
            });
            mcpRevisionRef.current += 1;
            mcpRevisionBundleRef.current = nextBundle;
            bundleRef.current = nextBundle;
            assetSelectionRef.current = imported.id;
            saveStatusRef.current = "dirty";
            setHistory((current) =>
              commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                assetSelection: imported.id,
              }),
            );
            setActiveAssetFolderId(imported.folderId ?? null);
            setSaveStatus("dirty");
            const activity = `AIがローカル${assetLabel}「${imported.name}」をインポートしました`;
            setNotice(`${activity}。変更を自動保存します`);
            setMcpLastActivity({
              clientName: request.clientName || "AI client",
              message: activity,
              at: new Intl.DateTimeFormat("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date()),
              revision: mcpRevisionRef.current,
            });
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                projectId: nextBundle.project.projectId,
                sceneId: nextBundle.scene.sceneId,
                [
                  isAudioImport
                    ? "audioAssetId"
                    : isModelImport
                      ? "modelAssetId"
                      : "textureAssetId"
                ]: imported.id,
                name: imported.name,
                duplicate: false,
                revisionBefore,
                revisionAfter: mcpRevisionRef.current,
                relativePath:
                  imported.source.kind === "project"
                    ? imported.source.relativePath
                    : null,
                ...(imported.kind === "audio"
                  ? { importMetadata: imported.importMetadata }
                  : {
                      importSettings: imported.importSettings,
                      importMetadata: imported.importMetadata,
                    }),
                diagnostics: plan.diagnostics.map(
                  ({ severity, code, message, fieldPath }) => ({
                    severity,
                    code,
                    message,
                    ...(fieldPath ? { fieldPath } : {}),
                  }),
                ),
              },
            });
            return;
          } finally {
            importRunningRef.current = false;
            if (assetOperationRef.current?.token === operationToken) {
              assetOperationRef.current = null;
            }
            setMcpLocalAssetImportBusy(false);
          }
        }
        if (scriptTool) {
          const args = request.arguments;
          const sourceBundle = bundleRef.current;
          if (request.tool === "list_script_templates") {
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                catalogVersion: SCRIPT_TEMPLATE_CATALOG_VERSION,
                defaultTemplateId: DEFAULT_SCRIPT_TEMPLATE_ID,
                templates: listScriptTemplateSummaries(),
              },
            });
            return;
          }
          const currentProjectPath = projectPathRef.current;
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              "スクリプトを操作する前にプロジェクトを保存してください",
            );
          }
          if (request.tool === "get_script_asset") {
            const assetId = mcpRequiredString(args.scriptAssetId, "scriptAssetId");
            const asset = sourceBundle.assets.assets[assetId];
            if (!asset || asset.kind !== "script") {
              throw new XriftMcpEditorToolError(
                "SCRIPT_NOT_FOUND",
                "指定されたスクリプトが見つかりません",
                { scriptAssetId: assetId },
              );
            }
            const source = await tauri.readTextFile(
              currentProjectPath,
              asset.source.relativePath,
            );
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                scriptAssetId: asset.id,
                name: asset.name,
                relativePath: asset.source.relativePath,
                language: asset.language,
                source,
              },
            });
            return;
          }
          if (request.tool === "set_play_mode") {
            const mode = mcpRequiredString(args.mode, "mode");
            if (mode !== "play" && mode !== "edit") {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "modeはplayまたはeditで指定してください",
              );
            }
            const unapprovedPolicy = mcpOptionalString(
              args.unapprovedPolicy,
            );
            if (
              unapprovedPolicy !== undefined &&
              (unapprovedPolicy !== "skip" || mode !== "play")
            ) {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "unapprovedPolicyは動作確認開始時にskipだけ指定できます",
              );
            }
            assertMcpExternalStoreWrite(
              args,
              {
                bundle: sourceBundle,
                editorMode: editorModeRef.current,
                importBusy: importBusyRef.current,
                revision: mcpRevisionRef.current,
              },
              { allowPlay: true },
            );
            const playResult =
              mode === "play"
                ? await enterPlayModeRef.current({
                    interactive: false,
                    unapprovedPolicy:
                      unapprovedPolicy === "skip" ? "skip" : "block",
                  })
                : null;
            if (mode === "edit") stopPlayModeRef.current();
            await waitForEditorCommit();
            const requestedUnapprovedPolicy =
              unapprovedPolicy === "skip" ? "skip" : "block";
            const playStartFailure =
              mode === "play" && playResult
                ? classifyMcpPlayStartFailure({
                    started: playResult.started,
                    unapprovedPolicy: requestedUnapprovedPolicy,
                    approvalRequiredCount:
                      playResult.approvalRequired.length,
                    errors: playResult.errors,
                  })
                : null;
            if (playStartFailure === "compile-failed") {
              const blockingErrors = blockingScriptCompileErrors(
                playResult?.errors ?? [],
              );
              throw new XriftMcpEditorToolError(
                "SCRIPT_COMPILE_FAILED",
                `スクリプトを変換できないため動作確認を開始しません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`.trim(),
                {
                  compileErrors:
                    scriptCompileErrorsForMcp(blockingErrors),
                },
              );
            }
            const modeSettled = await waitForEditorState(
              () => editorModeRef.current === mode,
              PLAY_MODE_SETTLE_TIMEOUT_MS,
            );
            if (!modeSettled) {
              throw new XriftMcpEditorToolError(
                "PLAY_MODE_CHANGE_FAILED",
                mode === "play"
                  ? "スクリプトの変換または動作確認初期化に失敗しました。Editorの通知を確認してください"
                  : "動作確認を停止できませんでした。もう一度実行してください",
                { requestedMode: mode, currentMode: editorModeRef.current },
              );
            }
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                mode,
                skippedUnapprovedScriptAssetIds:
                  playResult?.skippedAssetIds ?? [],
              },
            });
            return;
          }

          assertMcpExternalStoreWrite(
            args,
            {
              bundle: sourceBundle,
              editorMode: editorModeRef.current,
              importBusy: importBusyRef.current,
              revision: mcpRevisionRef.current,
            },
            {
              allowPlay: request.tool === "update_script_asset",
            },
          );

          if (request.tool === "apply_script_template") {
            const templateId = mcpRequiredString(args.templateId, "templateId");
            const template = getScriptTemplate(templateId);
            if (!template) {
              throw new XriftMcpEditorToolError(
                "SCRIPT_TEMPLATE_NOT_FOUND",
                "指定されたスクリプト Templateが見つかりません",
                { templateId },
              );
            }
            const entityId = mcpRequiredString(args.entityId, "entityId");
            const entity = sourceBundle.scene.entities[entityId];
            if (!entity) {
              throw new XriftMcpEditorToolError(
                "ENTITY_NOT_FOUND",
                "指定されたEntityが見つかりません",
                { entityId },
              );
            }
            const name = mcpOptionalString(args.name) ?? template.suggestedName;
            const folderId = mcpOptionalString(args.folderId) ?? null;
            if (folderId && !sourceBundle.assets.folders?.[folderId]) {
              throw new XriftMcpEditorToolError(
                "FOLDER_NOT_FOUND",
                "作成先のフォルダーが見つかりません",
                { folderId },
              );
            }
            const relativePath = createScriptRelativePath(
              name,
              sourceBundle.assets,
              pendingScriptPathsRef.current,
              template.language,
            );
            const source = createScriptTemplateSource(template.id, name);
            if (source === null) {
              throw new XriftMcpEditorToolError(
                "SCRIPT_TEMPLATE_NOT_FOUND",
                "指定されたスクリプト Templateを生成できません",
                { templateId },
              );
            }
            const asset = createScriptAsset(
              createDocumentId("asset"),
              name,
              relativePath,
              folderId,
              template.language,
            );
            const nextAssets = addScriptAsset(sourceBundle.assets, asset);
            const scriptContract = extractScriptContract(source);
            const componentResult = addEditorComponent(
              sourceBundle.scene,
              nextAssets,
              entityId,
              "scripting.script",
              sourceBundle.project.projectKind,
              asset.id,
              { [asset.id]: scriptContract },
            );
            if (!componentResult.added || !componentResult.componentId) {
              throw new XriftMcpEditorToolError(
                "SCRIPT_TEMPLATE_APPLY_FAILED",
                "スクリプトComponentを指定されたEntityへ追加できません",
                {
                  templateId,
                  entityId,
                  reason: componentResult.reason,
                },
              );
            }
            const previewBundle = touchProject({
              ...sourceBundle,
              assets: nextAssets,
              scene: componentResult.scene,
            });

            // Validate and construct the complete document change before I/O.
            // The new source is written first; the Asset and Component then
            // enter one history entry and consume one MCP revision.
            pendingScriptPathsRef.current.add(relativePath);
            try {
              await tauri.writeTextFile(
                currentProjectPath,
                relativePath,
                source,
              );
            } finally {
              pendingScriptPathsRef.current.delete(relativePath);
            }
            scriptSourceRevisionRef.current += 1;
            const latestBundle = bundleRef.current;
            const latestEntity = latestBundle.scene.entities[entityId];
            const targetStillValid =
              Boolean(latestEntity) &&
              (!folderId || Boolean(latestBundle.assets.folders?.[folderId])) &&
              !latestBundle.assets.assets[asset.id];
            const latestAssets = targetStillValid
              ? addScriptAsset(latestBundle.assets, asset)
              : latestBundle.assets;
            const latestComponentResult = targetStillValid
              ? addEditorComponent(
                  latestBundle.scene,
                  latestAssets,
                  entityId,
                  "scripting.script",
                  latestBundle.project.projectKind,
                  asset.id,
                  { [asset.id]: scriptContract },
                )
              : { added: false as const };
            if (
              !targetStillValid ||
              !latestComponentResult.added ||
              !latestComponentResult.componentId
            ) {
              pendingScriptPathsRef.current.add(relativePath);
              try {
                await tauri
                  .deletePath(currentProjectPath, relativePath)
                  .catch(() => undefined);
              } finally {
                pendingScriptPathsRef.current.delete(relativePath);
              }
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                "スクリプト作成中にEntityまたはフォルダーが更新されました。最新の編集状態を取得してから再試行してください",
                {
                  entityId,
                  folderId,
                  previewSceneId: previewBundle.scene.sceneId,
                },
              );
            }
            const nextBundle = touchProject({
              ...latestBundle,
              assets: latestAssets,
              scene: latestComponentResult.scene,
            });
            scriptProvenanceRef.current.set(
              asset.id,
              normalizeScriptProvenance({
                kind: "mcp",
                detail: request.clientName || null,
              }),
            );
            setScriptContractRef.current(asset.id, scriptContract);
            const revisionBefore = mcpRevisionRef.current;
            mcpRevisionRef.current += 1;
            mcpRevisionBundleRef.current = nextBundle;
            bundleRef.current = nextBundle;
            sceneSelectionRef.current = { kind: "entity", id: entityId };
            assetSelectionRef.current = asset.id;
            saveStatusRef.current = "dirty";
            setHistory((current) =>
              commitEditorHistory(current, {
                bundle: nextBundle,
                sceneSelection: { kind: "entity", id: entityId },
                assetSelection: asset.id,
              }),
            );
            setSaveStatus("dirty");
            const activity = `AIが「${template.name}」から「${name}」を作成し「${latestEntity?.name ?? entity.name}」へ追加しました`;
            setNotice(`${activity}。変更を自動保存します`);
            await completeResponse({
              id: request.id,
              ok: true,
              result: {
                templateId,
                scriptAssetId: asset.id,
                componentId: latestComponentResult.componentId,
                entityId,
                name: asset.name,
                relativePath: asset.source.relativePath,
                language: asset.language,
                requiredAssetKinds: template.requiredAssetKinds,
                requiredComponents: template.requiredComponents,
                entityReferenceCount: template.entityReferenceCount,
                revisionBefore,
                revisionAfter: mcpRevisionRef.current,
                sourceSaved: true,
              },
            });
            return;
          }

          let asset: ScriptAsset;
          let activity: string;
          let writtenSource: string;
          let createdRelativePath: string | undefined;
          let requestedFolderId: string | null | undefined;
          let previousSource: string | undefined;
          if (request.tool === "create_script_asset") {
            const scriptCount = Object.values(sourceBundle.assets.assets).filter(
              (candidate) => candidate.kind === "script",
            ).length;
            const requestedTemplateId =
              args.templateId === undefined
                ? undefined
                : mcpRequiredString(args.templateId, "templateId");
            if (
              requestedTemplateId !== undefined &&
              args.source !== undefined
            ) {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "templateIdと元データは同時に指定できません",
              );
            }
            if (args.source !== undefined && typeof args.source !== "string") {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "元データは文字列で指定してください",
              );
            }
            const templateId =
              args.source === undefined
                ? requestedTemplateId ?? DEFAULT_SCRIPT_TEMPLATE_ID
                : null;
            const template = templateId
              ? getScriptTemplate(templateId)
              : undefined;
            if (templateId && !template) {
              throw new XriftMcpEditorToolError(
                "SCRIPT_TEMPLATE_NOT_FOUND",
                "指定されたスクリプト Templateが見つかりません",
                { templateId },
              );
            }
            const requestedLanguage = mcpOptionalScriptLanguage(args.language);
            if (
              template &&
              requestedLanguage !== undefined &&
              requestedLanguage !== template.language
            ) {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                `Template ${template.id} は${template.language} スクリプトです`,
                {
                  templateId: template.id,
                  requestedLanguage,
                  templateLanguage: template.language,
                },
              );
            }
            const language =
              template?.language ?? requestedLanguage ?? "ts";
            const name =
              mcpOptionalString(args.name) ??
              (requestedTemplateId
                ? template?.suggestedName
                : `Script ${scriptCount + 1}`) ??
              `Script ${scriptCount + 1}`;
            const folderId = mcpOptionalString(args.folderId) ?? null;
            requestedFolderId = folderId;
            if (folderId && !sourceBundle.assets.folders?.[folderId]) {
              throw new XriftMcpEditorToolError(
                "FOLDER_NOT_FOUND",
                "作成先のフォルダーが見つかりません",
                { folderId },
              );
            }
            const relativePath = createScriptRelativePath(
              name,
              sourceBundle.assets,
              pendingScriptPathsRef.current,
              language,
            );
            const source =
              typeof args.source === "string"
                ? args.source
                : createScriptTemplateSource(templateId!, name) ??
                  createScriptSampleSource(name);
            writtenSource = source;
            asset = createScriptAsset(
              createDocumentId("asset"),
              name,
              relativePath,
              folderId,
              language,
            );
            createdRelativePath = relativePath;
            pendingScriptPathsRef.current.add(relativePath);
            try {
              await tauri.writeTextFile(
                currentProjectPath,
                relativePath,
                source,
              );
            } finally {
              pendingScriptPathsRef.current.delete(relativePath);
            }
            scriptSourceRevisionRef.current += 1;
            activity = `AIが「${name}」をスクリプトとして作成しました`;
          } else {
            const assetId = mcpRequiredString(args.scriptAssetId, "scriptAssetId");
            const candidate = sourceBundle.assets.assets[assetId];
            if (!candidate || candidate.kind !== "script") {
              throw new XriftMcpEditorToolError(
                "SCRIPT_NOT_FOUND",
                "指定されたスクリプトが見つかりません",
                { scriptAssetId: assetId },
              );
            }
            if (
              scriptEditorDirtyRef.current &&
              scriptEditorOpenAssetIdRef.current === candidate.id
            ) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                "このスクリプトにはEditorで保存していない変更があります。保存または破棄してから再試行してください",
                { scriptAssetId: candidate.id },
              );
            }
            const source =
              typeof args.source === "string"
                ? args.source
                : (() => {
                    throw new XriftMcpEditorToolError(
                      "INVALID_ARGUMENT",
                      "元データは文字列で指定してください",
                    );
                  })();
            writtenSource = source;
            if (
              pendingScriptPathsRef.current.has(
                candidate.source.relativePath,
              )
            ) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                "スクリプトを保存中です。完了後にやり直してください",
                { scriptAssetId: candidate.id },
              );
            }
            pendingScriptPathsRef.current.add(candidate.source.relativePath);
            try {
              previousSource = await tauri.readTextFile(
                currentProjectPath,
                candidate.source.relativePath,
              );
              await tauri.writeTextFile(
                currentProjectPath,
                candidate.source.relativePath,
                source,
              );
            } finally {
              pendingScriptPathsRef.current.delete(
                candidate.source.relativePath,
              );
            }
            scriptSourceRevisionRef.current += 1;
            asset = candidate;
            activity = `AIが「${candidate.name}」のスクリプト元データを更新しました`;
          }

          const latestBundle = bundleRef.current;
          if (request.tool === "create_script_asset") {
            if (
              latestBundle.assets.assets[asset.id] ||
              (requestedFolderId &&
                !latestBundle.assets.folders?.[requestedFolderId])
            ) {
              if (createdRelativePath) {
                pendingScriptPathsRef.current.add(createdRelativePath);
                try {
                  await tauri
                    .deletePath(currentProjectPath, createdRelativePath)
                    .catch(() => undefined);
                } finally {
                  pendingScriptPathsRef.current.delete(createdRelativePath);
                }
              }
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                "スクリプト作成中に素材またはフォルダーが更新されました。最新の編集状態を取得してから再試行してください",
                { folderId: requestedFolderId ?? null },
              );
            }
          } else {
            const latestCandidate = latestBundle.assets.assets[asset.id];
            if (
              !latestCandidate ||
              latestCandidate.kind !== "script" ||
              latestCandidate.source.relativePath !==
                asset.source.relativePath
            ) {
              if (previousSource !== undefined) {
                pendingScriptPathsRef.current.add(
                  asset.source.relativePath,
                );
                try {
                  await tauri
                    .writeTextFile(
                      currentProjectPath,
                      asset.source.relativePath,
                      previousSource,
                    )
                    .catch(() => undefined);
                } finally {
                  pendingScriptPathsRef.current.delete(
                    asset.source.relativePath,
                  );
                }
                scriptSourceRevisionRef.current += 1;
              }
              throw new XriftMcpEditorToolError(
                "STALE_REVISION",
                "スクリプト保存中に素材が更新されました。最新の編集状態を取得してから再試行してください",
                { scriptAssetId: asset.id },
              );
            }
            asset = latestCandidate;
            activity = `AIが「${latestCandidate.name}」のスクリプト元データを更新しました`;
          }
          const nextAssets =
            request.tool === "create_script_asset"
              ? addScriptAsset(latestBundle.assets, asset)
              : {
                  ...latestBundle.assets,
                  assets: { ...latestBundle.assets.assets },
                };
          const nextBundle = touchProject({
            ...latestBundle,
            assets: nextAssets,
          });
          scriptProvenanceRef.current.set(
            asset.id,
            normalizeScriptProvenance({
              kind: "mcp",
              detail: request.clientName || null,
            }),
          );
          const nextContract = extractScriptContract(writtenSource);
          const syncedOpenEditor =
            request.tool === "update_script_asset" &&
            acceptExternalScriptSourceRef.current(asset.id, writtenSource);
          if (syncedOpenEditor) {
            scriptContractsRef.current = {
              ...scriptContractsRef.current,
              [asset.id]: nextContract,
            };
          } else {
            setScriptContractRef.current(asset.id, nextContract);
          }
          const revisionBefore = mcpRevisionRef.current;
          mcpRevisionRef.current += 1;
          mcpRevisionBundleRef.current = nextBundle;
          bundleRef.current = nextBundle;
          assetSelectionRef.current = asset.id;
          saveStatusRef.current = "dirty";
          setHistory((current) =>
            commitEditorHistory(current, {
              bundle: nextBundle,
              sceneSelection: sceneSelectionRef.current,
              assetSelection: asset.id,
            }),
          );
          setSaveStatus("dirty");
          setNotice(`${activity}。変更を自動保存します`);
          let runtimeErrors: Awaited<
            ReturnType<typeof scriptRuntime.compile>
          > = [];
          let runtimeUnapprovedPolicy: "block" | "skip" = "block";
          if (
            request.tool === "update_script_asset" &&
            editorModeRef.current === "play"
          ) {
            runtimeUnapprovedPolicy =
              activePlayUnapprovedPolicyRef.current;
            runtimeErrors = await scriptCompileRef.current({
              scene: resolvePrefabInstances(
                nextBundle.scene,
                nextBundle.assets,
                nextBundle.prefabs,
              ).scene,
              assets: nextBundle.assets,
              unapprovedPolicy: runtimeUnapprovedPolicy,
            });
            if (runtimeErrors.length > 0) {
              const blockingErrors =
                blockingScriptCompileErrors(runtimeErrors);
              setNotice(
                `「${asset.name}」は保存しましたが、変換できないため実行中のスクリプトは更新していません: ${blockingErrors[0]?.message ?? ""}`,
              );
            }
          }
          await completeResponse({
            id: request.id,
            ok: true,
            result: {
              scriptAssetId: asset.id,
              templateId:
                request.tool === "create_script_asset" &&
                args.source === undefined
                  ? mcpOptionalString(args.templateId) ??
                    DEFAULT_SCRIPT_TEMPLATE_ID
                  : null,
              name: asset.name,
              relativePath: asset.source.relativePath,
              language: asset.language,
              revisionBefore,
              revisionAfter: mcpRevisionRef.current,
              sourceSaved: true,
              runtimeUpdated:
                editorModeRef.current === "play"
                  ? didScriptRuntimeApplyLatestSources(
                      runtimeErrors,
                      {
                        unapprovedPolicy: runtimeUnapprovedPolicy,
                        targetAssetIds: [asset.id],
                      },
                    )
                  : null,
              compileErrors: scriptCompileErrorsForMcp(runtimeErrors),
            },
          });
          return;
        }
        if (externalStoreTool) {
          const args = request.arguments;
          const providerId = mcpOptionalString(args.providerId) ?? "poly-haven";
          if (request.tool === "search_external_assets") {
            const query = (mcpOptionalString(args.query) ?? "").toLocaleLowerCase();
            const kind = mcpOptionalString(args.kind);
            const limit = Math.min(
              120,
              Math.max(1, mcpOptionalInteger(args.limit, "limit") ?? 40),
            );
            const assets = (await tauri.listExternalStoreAssets(providerId))
              .filter((asset) => !kind || asset.assetKind === kind)
              .filter((asset) => {
                if (!query) return true;
                return [asset.name, asset.description, asset.category, ...asset.tags]
                  .join(" ")
                  .toLocaleLowerCase()
                  .includes(query);
              })
              .slice(0, limit);
            await completeResponse({
              id: request.id,
              ok: true,
              result: { providerId, assets, count: assets.length },
            });
            return;
          }
          const externalId = mcpRequiredString(args.externalId, "externalId");
          if (request.tool === "get_external_asset_options") {
            const options = await tauri.getExternalStoreAssetOptions(
              providerId,
              externalId,
            );
            await completeResponse({
              id: request.id,
              ok: true,
              result: { options },
            });
            return;
          }
          assertMcpExternalStoreWrite(args, {
            bundle: bundleRef.current,
            editorMode: editorModeRef.current,
            importBusy: importBusyRef.current,
            revision: mcpRevisionRef.current,
          });
          const currentProjectPath = projectPathRef.current;
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              "外部アセットを追加する前にプロジェクトを保存してください",
            );
          }
          const resolution = mcpRequiredString(args.resolution, "resolution");
          const format = mcpOptionalString(args.format);
          if (format !== undefined && format !== "hdr" && format !== "exr") {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "formatはhdrまたはexrで指定してください",
            );
          }
          const installed = await tauri.installExternalStoreAsset(
            currentProjectPath,
            {
              providerId,
              externalId,
              resolution,
              ...(format ? { format } : {}),
            },
          );
          const sourceBundle = bundleRef.current;
          let applied;
          try {
            applied = await applyExternalStoreInstallAndAnalyzeModel(
              currentProjectPath,
              sourceBundle.assets,
              installed,
            );
          } catch (error) {
            throw new XriftMcpEditorToolError(
              "MODEL_ANALYSIS_FAILED",
              error instanceof Error
                ? error.message
                : "追加した3Dモデルの構造を解析できませんでした",
            );
          }
          const installedAssets = applied.installedAssetIds.flatMap(
            (assetId) => {
              const asset = applied.manifest.assets[assetId];
              return asset
                ? [
                    {
                      id: asset.id,
                      name: asset.name,
                      kind: asset.kind,
                      role:
                        asset.id === applied.primaryAssetId
                          ? "primary"
                          : "dependency",
                    },
                  ]
                : [];
            },
          );
          const applySkybox = args.applySkybox === true && applied.kind === "skybox";
          const nextBundle = touchProject({
            ...sourceBundle,
            assets: applied.manifest,
            scene: applySkybox
              ? assignSkyboxToScene(sourceBundle.scene, applied.primaryAssetId)
              : sourceBundle.scene,
          });
          mcpRevisionRef.current += 1;
          mcpRevisionBundleRef.current = nextBundle;
          bundleRef.current = nextBundle;
          assetSelectionRef.current = applied.primaryAssetId;
          saveStatusRef.current = "dirty";
          selectInstalledAsset(applied.primaryAssetId);
          setHistory((current) =>
            commitEditorHistory(current, {
              bundle: nextBundle,
              sceneSelection: current.present.sceneSelection,
              assetSelection: applied.primaryAssetId,
            }),
          );
          setSaveStatus("dirty");
          const activity = `AIが${installed.providerName}から「${installed.name}」を追加しました`;
          setNotice(`${activity}。変更を自動保存します`);
          setMcpLastActivity({
            clientName: request.clientName || "AI client",
            message: activity,
            at: new Intl.DateTimeFormat("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
            revision: mcpRevisionRef.current,
          });
          await completeResponse({
            id: request.id,
            ok: true,
            result: {
              providerId,
              externalId,
              assetKind: installed.assetKind,
              primaryAssetId: applied.primaryAssetId,
              installedAssetIds: applied.installedAssetIds,
              installedAssets,
              revisionBefore: mcpRevisionRef.current - 1,
              revisionAfter: mcpRevisionRef.current,
            },
          });
          return;
        }
        const sourceBundle = bundleRef.current;
        const outcome = executeXriftMcpEditorTool(
          {
            bundle: sourceBundle,
            sceneSelection: sceneSelectionRef.current,
            assetSelection: assetSelectionRef.current,
            editorMode: editorModeRef.current,
            importBusy: importBusyRef.current,
            revision: mcpRevisionRef.current,
            saveStatus: saveStatusRef.current,
            scriptContracts: scriptContractsRef.current,
            scriptRuntime: scriptRuntimeReportRef.current,
          },
          {
            id: request.id,
            tool: request.tool as XriftMcpEditorToolName,
            arguments: request.arguments,
          },
        );

        if (request.tool === "create_material_from_preset" && request.arguments.kind === "gltf") {
          const id = outcome.result.materialAssetId;
          const material = typeof id === "string" ? outcome.bundle.assets.assets[id] : undefined;
          if (material?.kind === "material" && catalogMaterialTextures(material.properties).some(
            texture => outcome.bundle.assets.assets[texture.assetId]?.kind !== "texture",
          )) {
            if (!currentProjectPath) throw new XriftMcpEditorToolError("PROJECT_NOT_SAVED", "テクスチャ付きMaterialを追加する前にプロジェクトを保存してください");
            if (importRunningRef.current || assetOperationRef.current !== null) throw new XriftMcpEditorToolError("IMPORT_BUSY", "素材の処理が終わってから再試行してください");
            const revisionBefore = mcpRevisionRef.current;
            importRunningRef.current = true;
            setMcpLocalAssetImportBusy(true);
            try {
              const assets = await ensureCatalogMaterialTextures(currentProjectPath, outcome.bundle.assets, material.properties);
              if (!assets) throw new XriftMcpEditorToolError("CATALOG_TEXTURE_IMPORT_FAILED", "Materialのテクスチャを追加できませんでした。接続を確認して再試行してください");
              const latest = bundleRef.current;
              if (projectPathRef.current !== currentProjectPath || mcpRevisionRef.current !== revisionBefore ||
                  latest.scene !== sourceBundle.scene || latest.project !== sourceBundle.project || latest.prefabs !== sourceBundle.prefabs) {
                throw new XriftMcpEditorToolError("STALE_REVISION", "素材の追加中にプロジェクトが変更されました。最新の編集状態を取得して再試行してください");
              }
              const merged = latest.assets === sourceBundle.assets ? assets : mergeRecipeAssetsOntoLatest(sourceBundle.assets, assets, latest.assets);
              outcome.bundle = touchProject({ ...outcome.bundle, assets: merged });
              outcome.changed = true;
              outcome.result.revisionAfter = revisionBefore + 1;
              outcome.result.textureAssetIds = catalogMaterialTextures(material.properties).map(texture => texture.assetId);
            } finally {
              importRunningRef.current = false;
              setMcpLocalAssetImportBusy(false);
            }
          }
        }

        if (outcome.changed) {
          mcpRevisionRef.current += 1;
          mcpRevisionBundleRef.current = outcome.bundle;
          bundleRef.current = outcome.bundle;
          sceneSelectionRef.current = outcome.sceneSelection;
          assetSelectionRef.current = outcome.assetSelection;
          saveStatusRef.current = "dirty";
          setHistory((current) =>
            commitEditorHistory(current, {
              bundle: outcome.bundle,
              sceneSelection: outcome.sceneSelection,
              assetSelection: outcome.assetSelection,
            }),
          );
          setSaveStatus("dirty");
          setNotice(`${outcome.activity}。変更を自動保存します`);
          setMcpLastActivity({
            clientName: request.clientName || "AI client",
            message: outcome.activity,
            at: new Intl.DateTimeFormat("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
            revision: mcpRevisionRef.current,
          });
        }
        const synchronizesScriptRuntime =
          editorModeRef.current === "play" &&
          outcome.changed &&
          ((request.tool === "update_script_component" &&
            (request.arguments.assetReferences !== undefined ||
              request.arguments.entityReferences !== undefined)) ||
            request.tool === "duplicate_entity" ||
            request.tool === "reparent_entity" ||
            request.tool === "delete_entity" ||
            request.tool === "place_asset" ||
            (request.tool === "add_component" &&
              request.arguments.definitionId === "scripting.script"));
        const synchronizedUnapprovedPolicy =
          activePlayUnapprovedPolicyRef.current;
        const synchronizedRuntimeErrors = synchronizesScriptRuntime
          ? await scriptCompileRef.current({
              scene: resolvePrefabInstances(
                outcome.bundle.scene,
                outcome.bundle.assets,
                outcome.bundle.prefabs,
              ).scene,
              assets: outcome.bundle.assets,
              unapprovedPolicy: synchronizedUnapprovedPolicy,
            })
          : [];
        if (synchronizesScriptRuntime) {
          await waitForEditorCommit();
        }
        try {
          await completeResponse({
            id: request.id,
            ok: true,
            result: withMcpHarnessWarning(
              synchronizesScriptRuntime
                ? {
                    ...outcome.result,
                    runtimeUpdated: didScriptRuntimeApplyLatestSources(
                      synchronizedRuntimeErrors,
                      {
                        unapprovedPolicy:
                          synchronizedUnapprovedPolicy,
                      },
                    ),
                    compileErrors: scriptCompileErrorsForMcp(
                      synchronizedRuntimeErrors,
                    ),
                  }
                : outcome.result,
              harness.warning,
            ),
          });
        } catch {
          setMcpError(
            "AIクライアントへ編集結果を返せませんでした。もう一度実行してください",
          );
        }
      } catch (error) {
        const editorError =
          error instanceof XriftMcpEditorToolError
            ? error
            : new XriftMcpEditorToolError(
                "EDITOR_ERROR",
                request.tool.includes("world_authoring") || request.arguments.authoringView !== undefined
                  ? (error instanceof Error ? error.message : String(error))
                  : "AI編集を完了できませんでした",
              );
        try {
          await completeResponse({
            id: request.id,
            ok: false,
            error: {
              code: editorError.code,
              message: editorError.message,
              details: editorError.details,
            },
          });
        } catch {
          setMcpError(
            "AIクライアントへエラーの内容を返せませんでした。もう一度実行してください",
          );
        }
      }
    };

    void tauri
      .onXriftMcpEditorRequest((request) => {
        if (!disposed) void complete(request);
      })
      .then(async (dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        // The shell keeps the bridge's heartbeat alive for the whole app
        // lifetime; registering here tells it that Editor tools now have a
        // listener, so it stops answering them with EDITOR_UNAVAILABLE.
        onRegisterMcpProjectBridgeRef.current?.({
          currentBundle: () => bundleRef.current,
          saveNow: () =>
            mcpProjectBridgeActionsRef.current?.saveNow() ??
            Promise.resolve(undefined),
          leave: () =>
            mcpProjectBridgeActionsRef.current?.leave() ??
            Promise.resolve(false),
        });
      })
      .catch(() => {
        if (!disposed) {
          setMcpError(
            "AI編集用の接続を確立できませんでした。XRift Studioを再起動してください",
          );
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
      onRegisterMcpProjectBridgeRef.current?.(null);
    };
  }, [mcpNativeAvailable]);
  const assetImportPanelAvailability = resolveAssetOperationAvailability(
    "asset-import",
    {
      readOnly: false,
      assetImportActive:
        importRunningRef.current || hasActiveAssetImport(pendingImports),
      modelReimportActive:
        modelReimportBusy ||
        assetOperationRef.current?.kind === "model-reimport",
      textureProcessingActive:
        textureProcessingBusy ||
        assetOperationRef.current?.kind === "texture-processing",
    },
  );
  const builtinPrefabRecipes = useMemo(
    () => listBuiltinPrefabRecipes(projectKind),
    [projectKind],
  );

  const updateScene = useCallback(
    (update: (scene: PrototypeVisualProject["scene"]) => PrototypeVisualProject["scene"]) => {
      setBundle((current) => {
        const scene = update(current.scene);
        if (scene === current.scene) return current;
        return touchProject({ ...current, scene });
      });
    },
    [],
  );

  /**
   * Snap gets flipped many times while a scene is laid out, so the toolbar
   * patches the present snapshot instead of pushing an Undo entry: an Undo
   * after a move should return the Entity, not the toolbar. The value still
   * belongs to the scene document, so autosave still picks it up.
   */
  const handleGizmoSettingsChange = useCallback(
    (patch: Partial<SceneGizmoSettings>) => {
      if (editorMode !== "edit") return;
      setHistory((current) => {
        const currentBundle = current.present.bundle;
        const settings = resolveSceneSettings(currentBundle.scene.settings);
        const gizmo = { ...settings.editor.gizmo, ...patch };
        if (JSON.stringify(gizmo) === JSON.stringify(settings.editor.gizmo)) {
          return current;
        }
        setSaveStatus("dirty");
        return replaceEditorHistoryPresent(current, {
          ...current.present,
          bundle: touchProject({
            ...currentBundle,
            scene: {
              ...currentBundle.scene,
              settings: {
                ...settings,
                editor: { ...settings.editor, gizmo },
              },
            },
          }),
        });
      });
    },
    [editorMode],
  );

  const handleSceneSettingsChange = useCallback(
    (settings: SceneSettings) => {
      if (editorMode !== "edit") return;
      // Gizmo settings take the same Undo-free path as the Scene View toolbar,
      // so the panel and the toolbar cannot disagree about whether flipping
      // snap belongs in the history.
      const { gizmo, ...editor } = settings.editor;
      updateScene((scene) => {
        const kept: SceneSettings = {
          ...settings,
          editor: { ...editor, gizmo: resolveSceneSettings(scene.settings).editor.gizmo },
        };
        return JSON.stringify(scene.settings) === JSON.stringify(kept)
          ? scene
          : { ...scene, settings: kept };
      });
      handleGizmoSettingsChange(gizmo);
      setNotice("シーン設定を更新しました。変更を自動保存します");
    },
    [editorMode, handleGizmoSettingsChange, updateScene],
  );

  /**
   * One keyboard step of the active gizmo tool, applied to every selected
   * Entity. The step comes from the same snap settings the gizmo drag uses, so
   * "move by exactly this much" needs no dragging at all.
   */
  const handleNudgeSelection = useCallback(
    (axis: NudgeAxis, direction: NudgeDirection): boolean => {
      if (editorMode !== "edit") return false;
      const scene = bundleRef.current.scene;
      const targets = selectedEntityIds.filter((entityId) =>
        Boolean(getTransform(scene, entityId)),
      );
      if (targets.length === 0) return false;
      const gizmo = resolveSceneSettings(scene.settings).editor.gizmo;
      const step = snapStepForMode(gizmo, transformMode);
      if (!Number.isFinite(step) || step <= 0) return false;

      updateScene((current) => {
        let next = current;
        for (const entityId of targets) {
          const transform = getTransform(next, entityId);
          if (!transform) continue;
          const patch = nudgeTransformPatch(
            transform,
            transformMode,
            axis,
            direction,
            gizmo,
            gizmo.snapEnabled,
          );
          if (patch) next = updateModelNodeEntityTransform(next, entityId, patch);
        }
        return next;
      });

      const action =
        transformMode === "rotate"
          ? "回転"
          : transformMode === "scale"
            ? "拡縮"
            : "移動";
      setNotice(
        `${targets.length}件を${axis.toUpperCase()}${
          direction > 0 ? "+" : "-"
        }へ ${formatSnapStep(transformMode, step)} ${action}しました`,
      );
      return true;
    },
    [editorMode, selectedEntityIds, transformMode, updateScene],
  );

  const handleUndo = useCallback(() => {
    setHistory((current) => {
      const transition = undoEditorHistory(current);
      if (!transition.changed) return transition.history;
      setSaveStatus("dirty");
      setNotice("元に戻しました");
      return withLiveGizmoSettings(transition.history, current.present.bundle);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((current) => {
      const transition = redoEditorHistory(current);
      if (!transition.changed) return transition.history;
      setSaveStatus("dirty");
      setNotice("やり直しました");
      return withLiveGizmoSettings(transition.history, current.present.bundle);
    });
  }, []);

  const handleCopy = useCallback((requestedEntityId?: string) => {
    const entityId = requestedEntityId ?? sceneSelection?.id;
    if (!entityId) return;
    clipboardRef.current = copyEntityHierarchy(bundle.scene, [entityId]);
    if (clipboardRef.current) setNotice(`「${bundle.scene.entities[entityId]?.name}」をコピーしました`);
  }, [bundle.scene, sceneSelection?.id]);

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current) return;
    const selected = sceneSelection?.id
      ? bundle.scene.entities[sceneSelection.id]
      : undefined;
    const parentId = selected?.parentId ?? null;
    const result = pasteEntityHierarchy(bundle.scene, clipboardRef.current, parentId);
    if (!result) return;
    setBundle(touchProject({ ...bundle, scene: result.scene }));
    setSceneSelection(
      result.rootEntityIds[0]
        ? { kind: "entity", id: result.rootEntityIds[0] }
        : sceneSelection,
    );
    setAssetSelection(null);
    setNotice("コピーしたEntityを貼り付けました");
  }, [bundle, editorMode, sceneSelection, setAssetSelection, setBundle, setSceneSelection]);

  const handleDuplicate = useCallback((requestedEntityId?: string) => {
    const entityId = requestedEntityId ?? sceneSelection?.id;
    if (!entityId) return;
    const source = bundle.scene.entities[entityId];
    if (!source) return;
    const result = duplicateEntityHierarchy(
      bundle.scene,
      [source.id],
      (kind) => createDocumentId(kind),
      source.parentId,
    );
    if (!result) return;
    setBundle(touchProject({ ...bundle, scene: result.scene }));
    setSceneSelection({ kind: "entity", id: result.clone.rootEntityIds[0] });
    setAssetSelection(null);
    setNotice(`「${source.name}」を複製しました`);
  }, [bundle, editorMode, sceneSelection?.id, setAssetSelection, setBundle, setSceneSelection]);

  const handleDelete = useCallback((requestedEntityId?: string) => {
    const entityIds = requestedEntityId
      ? [requestedEntityId]
      : selectedEntityIds.length > 0
        ? selectedEntityIds
        : sceneSelection?.id
          ? [sceneSelection.id]
          : [];
    if (entityIds.length === 0) return;
    // A shared-source Model node is part of the Model: deleting its Entity
    // would keep the geometry on screen and orphan its pose, so Delete hides
    // it instead. The row stays, showing the eye toggle that brings it back.
    const modelNodeIds = entityIds.filter(
      (entityId) => bundle.scene.entities[entityId]?.modelNode,
    );
    const deletableIds = entityIds.filter(
      (entityId) =>
        bundle.scene.entities[entityId] &&
        !bundle.scene.entities[entityId]?.modelNode,
    );
    const sourceNames = deletableIds
      .map((entityId) => bundle.scene.entities[entityId]?.name)
      .filter((name): name is string => Boolean(name));
    const hiddenNames = modelNodeIds
      .map((entityId) => bundle.scene.entities[entityId]?.name)
      .filter((name): name is string => Boolean(name));
    let scene = bundle.scene;
    for (const entityId of modelNodeIds) {
      scene = updateModelNodeEntityEnabled(scene, entityId, false);
    }
    scene = deleteEntityHierarchy(scene, deletableIds);
    if (scene === bundle.scene) return;
    setBundle(touchProject({ ...bundle, scene }));
    if (deletableIds.length > 0) {
      setSceneSelection(null);
      setAssetSelection(null);
    }
    const messages: string[] = [];
    if (sourceNames.length > 0) {
      messages.push(
        sourceNames.length === 1
          ? `「${sourceNames[0]}」を削除しました`
          : `${sourceNames.length}件のEntityを削除しました`,
      );
    }
    if (hiddenNames.length > 0) {
      messages.push(
        hiddenNames.length === 1
          ? `「${hiddenNames[0]}」は3Dモデルの一部のため非表示にしました。目のアイコンで再表示できます`
          : `${hiddenNames.length}件のノードは3Dモデルの一部のため非表示にしました。目のアイコンで再表示できます`,
      );
    }
    if (messages.length > 0) setNotice(messages.join("。"));
  }, [bundle, editorMode, sceneSelection?.id, selectedEntityIds, setAssetSelection, setBundle, setSceneSelection]);

  const requestDeleteAsset = useCallback(
    (assetId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してから素材を削除してください"
            : "アセットのインポート完了後に削除してください",
        );
        return;
      }
      const target = describeAssetDeleteTarget(bundle, assetId);
      if (!target) {
        setNotice("削除する素材が見つかりませんでした");
        return;
      }
      setDeleteDialog(target);
    },
    [bundle, editorMode, importBusy],
  );

  const requestDeleteAssetFolder = useCallback(
    (folderId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してからフォルダーを削除してください"
            : "アセットのインポート完了後にフォルダーを削除してください",
        );
        return;
      }
      const folder = bundle.assets.folders?.[folderId];
      if (!folder) {
        setNotice("削除するフォルダーが見つかりませんでした");
        return;
      }
      const analysis = analyzeAssetFolderDeletion(bundle.assets, folderId);
      setDeleteDialog({
        kind: "folder",
        id: folderId,
        name: folder.name,
        canDelete: analysis.canDelete,
        analysis,
      });
    },
    [bundle.assets, editorMode, importBusy],
  );

  const confirmAssetLibraryDelete = useCallback(() => {
    if (
      !deleteDialog ||
      !deleteDialog.canDelete ||
      editorMode !== "edit" ||
      importBusy
    ) return;
    const target = deleteDialog;
    setHistory((current) => {
      if (target.kind === "asset") {
        const result = deleteAssetIfUnreferenced(
          {
            assets: current.present.bundle.assets,
            scene: current.present.bundle.scene,
            prefabs: current.present.bundle.prefabs,
          },
          target.id,
        );
        if (!result.changed) {
          setNotice(
            result.reason === "referenced"
              ? "参照が追加されたため削除を中止しました"
              : "素材は削除されませんでした",
          );
          return current;
        }
        const assetSelection =
          current.present.assetSelection === target.id
            ? Object.values(result.assets.assets).find(
                (asset) => asset.kind !== "primitive",
              )?.id ?? null
            : current.present.assetSelection;
        setSaveStatus("dirty");
        setNotice(`「${target.name}」をAssetsから削除しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: result.assets,
            prefabs: result.prefabs,
          }),
          assetSelection,
        });
      }

      const result = deleteEmptyAssetFolder(
        current.present.bundle.assets,
        target.id,
      );
      if (!result.changed) {
        setNotice("フォルダーに内容が追加されたため削除を中止しました");
        return current;
      }
      setSaveStatus("dirty");
      setNotice(`「${target.name}」を削除しました`);
      return commitEditorHistory(current, {
        ...current.present,
        bundle: touchProject({
          ...current.present.bundle,
          assets: result.assets,
        }),
      });
    });
    if (target.kind === "folder" && activeAssetFolderId === target.id) {
      setActiveAssetFolderId(null);
    }
    setDeleteDialog(null);
  }, [activeAssetFolderId, deleteDialog, editorMode, importBusy]);

  /**
   * Unlinks one row of the blocked delete dialog and re-analyzes in place.
   *
   * The dialog used to name the references and stop there, which left the
   * author to find every owner by hand before the delete became possible. The
   * list stays open on what is left, so clearing a Material used by twelve
   * Entities happens where the author is already reading.
   */
  const detachAssetReferenceFromDialog = useCallback(
    (reference: AssetReferenceLocation) => {
      const target = deleteDialog;
      if (!target || target.kind !== "asset") return;
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してから参照を外してください"
            : "アセットのインポート完了後に参照を外してください",
        );
        return;
      }
      setHistory((current) => {
        const detached = detachAssetReferences(
          {
            assets: current.present.bundle.assets,
            scene: current.present.bundle.scene,
            prefabs: current.present.bundle.prefabs,
          },
          target.id,
          reference,
        );
        if (!detached.changed) {
          setNotice("この参照はすでに外れています");
          setDeleteDialog(
            describeAssetDeleteTarget(current.present.bundle, target.id) ?? null,
          );
          return current;
        }
        const bundle = touchProject({
          ...current.present.bundle,
          assets: detached.assets,
          scene: detached.scene,
          prefabs: detached.prefabs,
        });
        setDeleteDialog(describeAssetDeleteTarget(bundle, target.id) ?? null);
        setSaveStatus("dirty");
        setNotice(`「${reference.ownerName}」の参照を外しました`);
        return commitEditorHistory(current, { ...current.present, bundle });
      });
    },
    [deleteDialog, editorMode, importBusy],
  );

  /** Unlinks everything the dialog lists, then deletes, as one undo step. */
  const detachReferencesAndDeleteAsset = useCallback(() => {
    const target = deleteDialog;
    if (!target || target.kind !== "asset") return;
    if (editorMode !== "edit" || importBusy) {
      setNotice(
        editorMode !== "edit"
          ? "動作確認を停止してから素材を削除してください"
          : "アセットのインポート完了後に削除してください",
      );
      return;
    }
    setHistory((current) => {
      const detached = detachAssetReferences(
        {
          assets: current.present.bundle.assets,
          scene: current.present.bundle.scene,
          prefabs: current.present.bundle.prefabs,
        },
        target.id,
      );
      const result = deleteAssetIfUnreferenced(
        {
          assets: detached.assets,
          scene: detached.scene,
          prefabs: detached.prefabs,
        },
        target.id,
      );
      if (!result.changed) {
        // The detach is dropped with the delete: a half-applied unlink would
        // leave the Scene changed for an Asset that is still there.
        setNotice(
          result.reason === "referenced"
            ? "外せない参照が残っているため削除を中止しました"
            : "素材は削除されませんでした",
        );
        setDeleteDialog(
          describeAssetDeleteTarget(current.present.bundle, target.id) ?? null,
        );
        return current;
      }
      const assetSelection =
        current.present.assetSelection === target.id
          ? Object.values(result.assets.assets).find(
              (asset) => asset.kind !== "primitive",
            )?.id ?? null
          : current.present.assetSelection;
      setSaveStatus("dirty");
      setNotice(
        detached.detached.length > 0
          ? `参照${detached.detached.length}件を外して「${target.name}」を削除しました`
          : `「${target.name}」をAssetsから削除しました`,
      );
      setDeleteDialog(null);
      return commitEditorHistory(current, {
        ...current.present,
        bundle: touchProject({
          ...current.present.bundle,
          assets: result.assets,
          scene: detached.scene,
          prefabs: result.prefabs,
        }),
        assetSelection,
      });
    });
  }, [deleteDialog, editorMode, importBusy]);

  /**
   * Selects the owner of a reference so "where is this used?" is answered by
   * the editor rather than by the author searching for the name.
   */
  const revealAssetReference = useCallback(
    (reference: AssetReferenceLocation) => {
      if (reference.kind.startsWith("scene-")) {
        setSceneSelection({ kind: "entity", id: reference.ownerId });
        setDeleteDialog(null);
        setNotice(`「${reference.ownerName}」を選択しました`);
        return;
      }
      if (reference.kind.startsWith("prefab-")) {
        setNotice(
          `「${reference.ownerName}」はプレハブの中の参照です。ここから外すか、プレハブを編集してください`,
        );
        return;
      }
      setAssetSelection(reference.ownerId);
      setDeleteDialog(null);
      setNotice(`Asset「${reference.ownerName}」を選択しました`);
    },
    [setAssetSelection, setSceneSelection],
  );

  const handleMoveAsset = useCallback(
    (assetId: string, folderId: string | null) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してから素材を移動してください"
            : "アセットのインポート完了後に移動してください",
        );
        return;
      }
      setHistory((current) => {
        const result = moveLibraryAsset(
          current.present.bundle.assets,
          assetId,
          folderId,
        );
        if (!result.changed) {
          setNotice(
            result.reason === "same-parent"
              ? "素材はすでにこのフォルダーにあります"
              : "この場所へ素材を移動できませんでした",
          );
          return current;
        }
        const assetName = current.present.bundle.assets.assets[assetId]?.name ?? "アセット";
        const folderName = folderId
          ? current.present.bundle.assets.folders?.[folderId]?.name ?? "フォルダー"
          : "Assets直下";
        setSaveStatus("dirty");
        setNotice(`「${assetName}」を${folderName}へ移動しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: result.assets,
          }),
          assetSelection: assetId,
        });
      });
    },
    [editorMode, importBusy],
  );

  const handleMoveAssetFolder = useCallback(
    (folderId: string, parentId: string | null) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してからフォルダーを移動してください"
            : "アセットのインポート完了後にフォルダーを移動してください",
        );
        return;
      }
      setHistory((current) => {
        const result = moveLibraryFolder(
          current.present.bundle.assets,
          folderId,
          parentId,
        );
        if (!result.changed) {
          const message =
            result.reason === "cycle"
              ? "フォルダーを自分自身またはサブフォルダーへ移動できません"
              : result.reason === "same-parent"
                ? "フォルダーはすでにこの場所にあります"
                : result.reason === "duplicate-name"
                  ? "同じ名前のフォルダーが移動先にあります"
                  : "この場所へフォルダーを移動できませんでした";
          setNotice(message);
          return current;
        }
        const folderName =
          current.present.bundle.assets.folders?.[folderId]?.name ?? "フォルダー";
        const parentName = parentId
          ? current.present.bundle.assets.folders?.[parentId]?.name ?? "フォルダー"
          : "Assets直下";
        setSaveStatus("dirty");
        setNotice(`「${folderName}」を${parentName}へ移動しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: result.assets,
          }),
        });
      });
    },
    [editorMode, importBusy],
  );

  const handlePlaceBuiltinPrefab = useCallback(
    (
      recipeId: string,
      position?: Vec3,
      parentEntityId: string | null = null,
    ) => {
      if (importBusy) {
        setNotice("素材の読み込み後に配置してください");
        return;
      }
      setHistory((current) => {
        if (
          parentEntityId !== null &&
          !current.present.bundle.scene.entities[parentEntityId]
        ) {
          setNotice("配置先のEntityが見つかりません");
          return current;
        }
        const result = instantiateBuiltinPrefab(
          current.present.bundle.scene,
          projectKind,
          recipeId,
          position,
        );
        if (!result) {
          setNotice("このプロジェクトには配置できません");
          return current;
        }
        const scene =
          parentEntityId === null
            ? result.scene
            : reparentEntityHierarchy(
                result.scene,
                result.entityId,
                parentEntityId,
              );
        setSaveStatus("dirty");
        const parentName =
          parentEntityId === null
            ? null
            : current.present.bundle.scene.entities[parentEntityId]?.name;
        setNotice(
          parentName
            ? `「${result.recipe.name}」を「${parentName}」の子へ配置しました`
            : `「${result.recipe.name}」をシーンへ配置しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            scene,
          }),
          sceneSelection: { kind: "entity", id: result.entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy, projectKind],
  );

  const handleReparentEntity = useCallback(
    (
      entityId: string,
      parentEntityId: string | null,
      siblingIndex?: number,
    ) => {
      if (importBusy) {
        setNotice("素材の読み込み後にEntityを移動してください");
        return;
      }
      setHistory((current) => {
        const decision = getEntityReparentDecision(
          current.present.bundle.scene,
          entityId,
          parentEntityId,
          siblingIndex,
        );
        if (!decision.allowed) {
          const message =
            decision.reason === "descendant-parent" ||
            decision.reason === "same-entity"
              ? "Entityを自分自身または子Entityへ移動できません"
              : decision.reason === "unchanged-parent" ||
                  decision.reason === "unchanged-order"
                ? "Entityはすでにこの場所にあります"
                : "移動先のEntityが見つかりません";
          setNotice(message);
          return current;
        }
        const scene = reparentEntityHierarchy(
          current.present.bundle.scene,
          entityId,
          parentEntityId,
          siblingIndex,
        );
        if (scene === current.present.bundle.scene) return current;
        const entityName = scene.entities[entityId]?.name ?? "Entity";
        const parentName = parentEntityId
          ? scene.entities[parentEntityId]?.name ?? "Entity"
          : "Scene Root";
        const previousParentId =
          current.present.bundle.scene.entities[entityId]?.parentId ?? null;
        setSaveStatus("dirty");
        setNotice(
          previousParentId === parentEntityId
            ? `「${entityName}」のHierarchy順を変更しました`
            : `「${entityName}」を${parentName}へ移動しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({ ...current.present.bundle, scene }),
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy],
  );

  const handlePlaceSceneAsset = useCallback(
    (
      assetId: string,
      options: { position?: Vec3; parentEntityId?: string | null } = {},
    ) => {
      if (importBusy) {
        setNotice("アセットのインポート完了後に配置してください");
        return;
      }
      setHistory((current) => {
        const result = instantiateSceneAsset(
          current.present.bundle.scene,
          current.present.bundle.assets,
          current.present.bundle.prefabs,
          assetId,
          options,
        );
        if (!result.placed) {
          const message =
            result.reason === "prefab-document-missing" ||
            result.reason === "prefab-empty"
              ? "プレハブのデータが見つからないため配置できませんでした"
              : result.reason === "parent-missing"
                ? "配置先のEntityが見つかりませんでした"
                : "この素材はシーンへ配置できません";
          setNotice(message);
          return current;
        }
        const parentName = options.parentEntityId
          ? result.scene.entities[options.parentEntityId]?.name
          : null;
        setSaveStatus("dirty");
        setNotice(
          `「${result.assetName}」を${parentName ? `「${parentName}」の子` : "シーン"}へ配置しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            scene: result.scene,
            // Placing an animated Model creates the graph that plays it, so the
            // manifest has to be committed with the Scene.
            assets: result.assets,
          }),
          sceneSelection: { kind: "entity", id: result.entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy],
  );

  const handlePlacePrimitive = useCallback(
    (
      creationId: string,
      position?: Vec3,
      /** Placed with this Material instead of the creation's own, and added to
       *  the library if the project does not have it yet. Store presets use it
       *  so every tint reaches the same placement path. */
      overrideMaterial?: MaterialAsset,
    ) => {
      const definition = getBuiltinPrimitiveCreation(creationId);
      if (!definition) return;

      // The creation names the Material it wants, and a project made before
      // that Material existed gets it added rather than silently falling back —
      // a glow cube placed with an ordinary Material is not a glow cube.
      const preferredMaterialId =
        overrideMaterial?.id ?? definition.preferredMaterialAssetId;
      const assets = overrideMaterial
        ? bundle.assets.assets[overrideMaterial.id]?.kind === "material"
          ? bundle.assets
          : {
              ...bundle.assets,
              assets: {
                ...bundle.assets.assets,
                [overrideMaterial.id]: overrideMaterial,
              },
            }
        : ensureBuiltinMaterialAsset(bundle.assets, preferredMaterialId);
      const materialAssetId =
        assets.assets[preferredMaterialId]?.kind === "material"
          ? preferredMaterialId
          : Object.values(assets.assets).find(
              (asset) => asset.kind === "material",
            )?.id;
      if (!materialAssetId) {
        setNotice("プリミティブに使用するマテリアルがありません");
        return;
      }

      const count = bundle.scene.rootEntityIds.length;
      const fallbackPosition: Vec3 = [
        roundTo(((count % 5) - 2) * 1.35, 1),
        definition.defaultTransform.position[1],
        roundTo((Math.floor(count / 5) - 0.5) * 1.35, 1),
      ];
      const result = addBuiltinPrimitiveEntity(
        bundle.scene,
        assets,
        creationId,
        materialAssetId,
        position ?? fallbackPosition,
      );
      if (!result) {
        setNotice("このプリミティブを現在のシーンへ配置できませんでした");
        return;
      }
      setBundle(touchProject({ ...bundle, assets, scene: result.scene }));
      setSceneSelection({ kind: "entity", id: result.entityId });
      setAssetSelection(null);
      // An emissive Material only reads as light once Bloom runs, and post
      // effects are off in a new scene. Say where the switch is instead of
      // letting the author wonder why the cube looks flat.
      setNotice(
        materialAssetId.startsWith(BUILTIN_ASSET_IDS.material.glow) &&
          !sceneBloomIsActive(bundle.scene)
          ? `「${definition.name}」を追加しました。光をにじませるにはシーン設定のPost ProcessingとBloomを有効にしてください`
          : `「${definition.name}」をシーンへ追加しました`,
      );
    },
    [bundle, editorMode, setAssetSelection, setBundle, setSceneSelection],
  );

  const handleCreateEmpty = useCallback(
    (parentEntityId: string | null = null) => {
      if (importBusy) {
        setNotice("アセットのインポート完了後にEntityを作成してください");
        return;
      }
      setHistory((current) => {
        const result = createEmptyEntity(
          current.present.bundle.scene,
          parentEntityId,
        );
        if (!result) {
          setNotice("Entityの作成先が見つかりませんでした");
          return current;
        }
        setSaveStatus("dirty");
        const parentName = parentEntityId
          ? result.scene.entities[parentEntityId]?.name
          : null;
        setNotice(
          parentName
            ? `「${parentName}」の子に空のEntityを作成しました`
            : "シーンの直下に空のEntityを作成しました",
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            scene: result.scene,
          }),
          sceneSelection: { kind: "entity", id: result.entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy],
  );

  const handleCreateXriftObject = useCallback(
    (componentDefinitionId: string) => {
      if (importBusy) return;
      const definition = getXriftComponentDefinition(componentDefinitionId);
      if (!definition || definition.attachBehavior.kind !== "leaf") {
        setNotice("既存のEntityに追加してください");
        return;
      }
      setHistory((current) => {
        const created = createEmptyEntity(
          current.present.bundle.scene,
          null,
          definition.label,
        );
        if (!created) return current;
        const added = addEditorComponent(
          created.scene,
          current.present.bundle.assets,
          created.entityId,
          definition.schemaId,
          projectKind,
        );
        if (!added.added) {
          setNotice(`${definition.label}をシーンへ作成できませんでした`);
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          `${definition.label}をシーンに追加しました。Inspectorで調整できます。`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            scene: added.scene,
          }),
          sceneSelection: { kind: "entity", id: created.entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy, projectKind],
  );

  const handleProjectMetadataChange = useCallback(
    (metadata: { title: string; description: string }) => {
      if (editorMode !== "edit") return;
      setBundle((current) => {
        if (
          current.project.metadata.title === metadata.title &&
          current.project.metadata.description === metadata.description
        ) {
          return current;
        }
        return touchProject({
          ...current,
          project: {
            ...current.project,
            metadata: {
              ...current.project.metadata,
              ...metadata,
            },
          },
        });
      });
      setNotice("公開情報を更新しました。変更を自動保存します");
    },
    [editorMode, setBundle],
  );

  const handleComponentCodeImport = useCallback(
    async (
      plan: ComponentCodeImportPlan,
      classicSource: ClassicProjectVisualImportSource | null,
      enterPlayAfterImport = false,
    ): Promise<boolean> => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "追加するには動作確認を停止してください"
            : "素材の読み込み後に追加してください",
        );
        return false;
      }
      setComponentImportBusy(true);
      try {
        let preparedAssets = bundle.assets;
        let assetIdBySourcePath: Record<string, string> | undefined;
        let assetPlans = [] as Awaited<
          ReturnType<typeof prepareClassicProjectVisualAssetImports>
        >["plans"];
        let assetWarningCount = 0;
        let unavailableAssetCount = 0;
        if (classicSource && plan.assetDependencies.length > 0) {
          if (!projectPath) {
            setNotice(
              "コード素材の保存先が必要です。先にビジュアルエディターのプロジェクトを保存してから変換してください",
            );
            return false;
          }
          const prepared = await prepareClassicProjectVisualAssetImports({
            source: classicSource,
            componentPlan: plan,
            existingManifest: bundle.assets,
          });
          preparedAssets = prepared.manifest;
          assetIdBySourcePath = prepared.assetIdBySourcePath;
          assetPlans = prepared.plans;
          unavailableAssetCount = prepared.unavailableSourcePaths.length;
          assetWarningCount = prepared.diagnostics.filter(
            (diagnostic) => diagnostic.severity === "warning",
          ).length;
        }

        let result = applyComponentCodeImportPlan({
          scene: bundle.scene,
          assets: preparedAssets,
          projectKind,
          plan,
          assetIdBySourcePath,
        });
        if (result.entityIds.length === 0) {
          setNotice(
            result.diagnostics[0]?.message ??
              "変換結果をシーンに追加できません",
          );
          return false;
        }
        if (classicSource) {
          result = applyClassicProjectVisualImportEnhancements({
            source: classicSource,
            componentPlan: plan,
            result,
            assetIdBySourcePath: assetIdBySourcePath ?? {},
          });
        }
        const committedAssets =
          classicSource && assetPlans.length > 0 && projectPath
            ? await commitAssetImportPlansToDisk(
                projectPath,
                result.assets,
                assetPlans,
              )
            : result.assets;
        const selectedEntityId = result.entityIds[result.entityIds.length - 1];
        const nextBundle = touchProject({
          ...bundle,
          scene: result.scene,
          assets: committedAssets,
        });
        bundleRef.current = nextBundle;
        setHistory((current) =>
          commitEditorHistory(current, {
            ...current.present,
            bundle: nextBundle,
            sceneSelection: { kind: "entity", id: selectedEntityId },
            assetSelection: null,
          }),
        );
        setSaveStatus("dirty");
        const warningCount = assetWarningCount + [
          ...plan.diagnostics,
          ...result.diagnostics,
        ].filter((diagnostic) => diagnostic.severity === "warning").length;
        const assetCount = assetPlans.length;
        for (const asset of Object.values(committedAssets.assets)) {
          if (
            asset.kind === "script" &&
            !bundle.assets.assets[asset.id]
          ) {
            scriptProvenanceRef.current.set(
              asset.id,
              normalizeScriptProvenance({
                kind: "classic-import",
                detail: null,
              }),
            );
          }
        }
        let playStarted = false;
        if (enterPlayAfterImport) {
          const playResult = await enterPlayModeRef.current({
            interactive: true,
            ignoreImportBusy: true,
          });
          playStarted = playResult.started;
        }
        const importMessage =
          unavailableAssetCount > 0
            ? `Entity ${result.entityIds.length}件と素材 ${assetCount}件を追加しました。素材 ${unavailableAssetCount}件は読み込めませんでした`
            : warningCount > 0
            ? `Entity ${result.entityIds.length}件と素材 ${assetCount}件を追加しました。変換時の注意が${warningCount}件あります`
            : `Entity ${result.entityIds.length}件と素材 ${assetCount}件をシーンへ変換しました`;
        setNotice(
          enterPlayAfterImport && playStarted
            ? `${importMessage}。動作確認で実行結果を確認しています`
            : enterPlayAfterImport
              ? `${importMessage}。スクリプトの確認または変換が完了していないため、動作確認は開始していません`
            : importMessage,
        );
        return true;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "コードプロジェクトを変換できませんでした",
        );
        return false;
      } finally {
        setComponentImportBusy(false);
      }
    },
    [
      bundle.assets,
      bundle.scene,
      editorMode,
      importBusy,
      projectKind,
      projectPath,
    ],
  );

  const handlePrepareComponentCodeImportPreview = useCallback(
    async (
      plan: ComponentCodeImportPlan,
      classicSource: ClassicProjectVisualImportSource,
    ): Promise<ClassicProjectVisualImportPreview> => {
      const prepared = await prepareClassicProjectVisualAssetImports({
        source: classicSource,
        componentPlan: plan,
        existingManifest: bundle.assets,
      });
      return prepared.preview;
    },
    [bundle.assets],
  );

  const handleAddOfficialComponent = useCallback(
    async (definition: XriftComponentDefinition): Promise<boolean> =>
      handleComponentCodeImport(
        analyzeComponentCode(
          createOfficialXriftComponentSample(definition.importName),
          projectKind,
        ),
        null,
      ),
    [handleComponentCodeImport, projectKind],
  );

  const handleTransformChange = useCallback(
    (entityId: string, patch: TransformPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateModelNodeEntityTransform(scene, entityId, patch),
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleTransformScrubStart = useCallback(
    (entityId: string) => {
      if ((editorMode !== "edit" && !playSession) || transformScrubRef.current) return;
      transformScrubRef.current = {
        entityId,
        before: history.present,
        saveStatus,
      };
    },
    [editorMode, history.present, playSession, saveStatus],
  );

  const handleTransformScrubChange = useCallback(
    (entityId: string, patch: TransformPatch) => {
      const transaction = transformScrubRef.current;
      if (
        (editorMode !== "edit" && !playSession) ||
        !transaction ||
        transaction.entityId !== entityId
      ) {
        return;
      }
      setHistory((current) => {
        const scene = updateModelNodeEntityTransform(
          current.present.bundle.scene,
          entityId,
          patch,
        );
        if (scene === current.present.bundle.scene) return current;
        const nextBundle = { ...current.present.bundle, scene };
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        return replaceEditorHistoryPresent(current, {
          ...current.present,
          bundle: nextBundle,
        });
      });
    },
    [editorMode, playSession],
  );

  const handleTransformScrubEnd = useCallback((entityId: string) => {
    const transaction = transformScrubRef.current;
    if (!transaction || transaction.entityId !== entityId) return;
    transformScrubRef.current = null;
    setHistory((current) => {
      if (
        entityTransformMatches(
          transaction.before.bundle.scene,
          current.present.bundle.scene,
          entityId,
        )
      ) {
        bundleRef.current = transaction.before.bundle;
        setSaveStatus(
          lastSavedBundleRef.current === transaction.before.bundle
            ? "saved"
            : transaction.saveStatus,
        );
        return replaceEditorHistoryPresent(current, transaction.before);
      }

      const committed = {
        ...current.present,
        bundle: touchProject(current.present.bundle),
      };
      bundleRef.current = committed.bundle;
      setSaveStatus("dirty");
      setNotice("位置・回転・大きさの変更をシーンへ反映しました");
      return commitEditorHistory(
        { ...current, present: transaction.before },
        committed,
      );
    });
  }, []);

  const handleTransformScrubCancel = useCallback((entityId: string) => {
    const transaction = transformScrubRef.current;
    if (!transaction || transaction.entityId !== entityId) return;
    transformScrubRef.current = null;
    setHistory((current) => {
      const changed = !entityTransformMatches(
        transaction.before.bundle.scene,
        current.present.bundle.scene,
        entityId,
      );
      bundleRef.current = transaction.before.bundle;
      setSaveStatus(
        lastSavedBundleRef.current === transaction.before.bundle
          ? "saved"
          : transaction.saveStatus,
      );
      if (changed) setNotice("位置・回転・大きさの変更を取り消しました");
      return replaceEditorHistoryPresent(current, transaction.before);
    });
  }, []);

  const handleGizmoCommit = useCallback(
    (entityId: string, patch: TransformPatch) => {
      if (editorMode !== "edit") return;
      updateScene((scene) =>
        updateModelNodeEntityTransform(scene, entityId, patch),
      );
      setNotice("ギズモの変更をシーンへ反映しました");
    },
    [editorMode, updateScene],
  );

  const handleRenameEntity = useCallback(
    (entityId: string, name: string) => {
      updateScene((scene) => renameEntity(scene, entityId, name));
      setNotice(
        editorMode === "play"
          ? "Entity名を保存し、実行中のシーンへ即時反映しました"
          : "Entity名を変更しました",
      );
    },
    [editorMode, updateScene],
  );

  const handleEntityEnabledChange = useCallback(
    (entityId: string, enabled: boolean) => {
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        const next = updateModelNodeEntityEnabled(scene, entityId, enabled);
        if (next !== scene) {
          setNotice(
            entity?.modelNode
              ? `「${entity.name}」を${enabled ? "表示" : "非表示"}にしました`
              : `「${entity?.name ?? "Entity"}」を${enabled ? "有効" : "無効"}にしました`,
          );
        }
        return next;
      });
    },
    [editorMode, updateScene],
  );

  const handleMeshChange = useCallback(
    (entityId: string, componentId: string, patch: MeshInspectorPatch) => {
      if (editorMode !== "edit") return;
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        if (!entity) return scene;
        let changed = false;
        const components = entity.components.map((component) => {
          if (component.id !== componentId || component.type !== "mesh") return component;
          const next = {
            ...component,
            ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
            ...(patch.materialBindings
              ? { materialBindings: patch.materialBindings.map((binding) => ({ ...binding })) }
              : {}),
            ...(typeof patch.castShadow === "boolean" ? { castShadow: patch.castShadow } : {}),
            ...(typeof patch.receiveShadow === "boolean" ? { receiveShadow: patch.receiveShadow } : {}),
            ...(patch.maxDistance === null
              ? { maxDistance: undefined }
              : typeof patch.maxDistance === "number" &&
                  Number.isFinite(patch.maxDistance) &&
                  patch.maxDistance >= MESH_MAX_DISTANCE_MIN &&
                  patch.maxDistance <= MESH_MAX_DISTANCE_MAX
                ? { maxDistance: patch.maxDistance }
                : {}),
            ...(patch.modelPose
              ? {
                  modelPose: {
                    bones: Object.fromEntries(
                      Object.entries(patch.modelPose.bones).map(([key, value]) => [
                        key,
                        [value[0], value[1], value[2]] as [number, number, number],
                      ]),
                    ),
                    morphTargets: { ...patch.modelPose.morphTargets },
                    ...(patch.modelPose.nodes
                      ? {
                          nodes: Object.fromEntries(
                            Object.entries(patch.modelPose.nodes).map(
                              ([key, value]) => [
                                key,
                                {
                                  position: [...value.position] as [number, number, number],
                                  rotation: [...value.rotation] as [number, number, number],
                                  scale: [...value.scale] as [number, number, number],
                                },
                              ],
                            ),
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          };
          changed = JSON.stringify(next) !== JSON.stringify(component);
          return next;
        });
        if (!changed) return scene;
        return {
          ...scene,
          entities: { ...scene.entities, [entityId]: { ...entity, components } },
        };
      });
      setNotice(
        typeof patch.enabled === "boolean"
          ? `Mesh Rendererを${patch.enabled ? "有効" : "無効"}にしました`
          : patch.modelPose
          ? "モデルポーズをこの配置へ保存しました"
          : patch.maxDistance !== undefined
          ? patch.maxDistance === null
            ? "メッシュ固有の描画距離を解除しました"
            : "メッシュ固有の描画距離をシーンへ反映しました"
          : "メッシュのマテリアルスロットと影の設定をシーンへ反映しました",
      );
    },
    [editorMode, updateScene],
  );

  const handleColliderChange = useCallback(
    (entityId: string, componentId: string, patch: ColliderPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        let next = updateColliderComponent(scene, entityId, patch, componentId);
        const bodyPatch: ColliderPatch = {};
        for (const key of [
          "bodyType",
          "gravityScale",
          "linearDamping",
          "angularDamping",
          "canSleep",
          "ccd",
          "lockTranslations",
          "lockRotations",
        ] as const) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            Object.assign(bodyPatch, { [key]: patch[key] });
          }
        }
        if (Object.keys(bodyPatch).length === 0) return next;
        for (const component of next.entities[entityId]?.components ?? []) {
          if (component.type !== "collider" || component.id === componentId) {
            continue;
          }
          next = updateColliderComponent(
            next,
            entityId,
            bodyPatch,
            component.id,
          );
        }
        return next;
      });
      setNotice(
        editorMode === "play"
          ? "衝突判定設定を保存し、このEntityの動作確認を先頭から再実行しました"
          : "衝突判定設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleRigidBodyChange = useCallback(
    (entityId: string, componentId: string, patch: RigidBodyPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateRigidBodyComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? "Rigid Body設定を保存し、このRigidBodyの動作確認をやり直しました"
          : "Rigid Body設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleExternalStoreInstalled = useCallback(
    async (
      result: Parameters<typeof applyExternalStoreInstall>[1],
      applySkybox: boolean,
    ) => {
      const projectPath = projectPathRef.current;
      if (!projectPath) {
        throw new Error("初回の自動保存完了後に外部素材を追加できます");
      }
      // A Model must never be committed with sourceHash but no importMetadata
      // (the manifest contract requires both), so the structure analysis has
      // to complete before this reaches history/autosave. That analysis is
      // async, so the starting assets are re-checked after the await instead
      // of mutating state from inside a single synchronous updater.
      const startingAssets = bundleRef.current.assets;
      const applied = await applyExternalStoreInstallAndAnalyzeModel(
        projectPath,
        startingAssets,
        result,
      );
      setHistory((current) => {
        if (current.present.bundle.assets !== startingAssets) {
          setNotice(
            "処理中に素材が変更されたため、追加を取り消しました。もう一度お試しください",
          );
          return current;
        }
        const scene = applySkybox
          ? assignSkyboxToScene(
              current.present.bundle.scene,
              applied.primaryAssetId,
            )
          : current.present.bundle.scene;
        const primary = applied.manifest.assets[applied.primaryAssetId];
        setActiveAssetFolderId(primary?.folderId ?? null);
        selectInstalledAsset(applied.primaryAssetId);
        setSaveStatus("dirty");
        setNotice(
          applySkybox
            ? `「${result.name}」を追加し、Skyboxに設定しました`
            : `「${result.name}」をAssetsに追加しました`,
        );
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: applied.manifest,
          scene,
        });
        bundleRef.current = nextBundle;
        return commitEditorHistory(current, {
          bundle: nextBundle,
          sceneSelection: current.present.sceneSelection,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
    },
    [selectInstalledAsset],
  );

  const handleAddOpenBrushMaterial = useCallback(
    async (
      entry: OpenBrushCatalogEntry,
    ): Promise<{ alreadyInstalled: boolean }> => {
      const preview = applyOpenBrushCatalogInstall(bundle.assets, entry);
      setHistory((current) => {
        const applied = applyOpenBrushCatalogInstall(
          current.present.bundle.assets,
          entry,
        );
        const primary = applied.manifest.assets[applied.primaryAssetId];
        setActiveAssetFolderId(primary?.folderId ?? null);
        selectInstalledAsset(applied.primaryAssetId);
        setNotice(
          applied.alreadyInstalled
            ? `「${entry.label}」は追加済みです。Assetsで選択しました`
            : `「${entry.label}」をOpen Brush マテリアルとして追加しました`,
        );
        if (applied.alreadyInstalled) {
          return {
            ...current,
            present: {
              ...current.present,
              sceneSelection: current.present.sceneSelection,
              assetSelection: applied.primaryAssetId,
            },
          };
        }
        setSaveStatus("dirty");
        return commitEditorHistory(current, {
          bundle: touchProject({
            ...current.present.bundle,
            assets: applied.manifest,
          }),
          sceneSelection: current.present.sceneSelection,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
      return { alreadyInstalled: preview.alreadyInstalled };
    },
    [bundle.assets, selectInstalledAsset],
  );

  const handleAddSkyShader = useCallback(
    async (
      entry: SkyShaderCatalogEntry,
      parameterValues: Readonly<Record<string, number | string>>,
      applyToSky: boolean,
    ): Promise<SkyShaderInstallResult> => {
      const preview = applySkyShaderCatalogInstall(
        bundle.assets,
        entry,
        parameterValues,
      );
      setHistory((current) => {
        const applied = applySkyShaderCatalogInstall(
          current.present.bundle.assets,
          entry,
          parameterValues,
        );
        const scene = applyToSky
          ? assignSkyShaderToScene(
              current.present.bundle.scene,
              applied.primaryAssetId,
            )
          : current.present.bundle.scene;
        const primary = applied.manifest.assets[applied.primaryAssetId];
        setActiveAssetFolderId(primary?.folderId ?? null);
        selectInstalledAsset(applied.primaryAssetId);
        setSaveStatus("dirty");
        setNotice(
          applyToSky
            ? `「${entry.label}」をSkybox Shaderに設定しました。色や動きはInspectorで調整できます`
            : `「${entry.label}」をマテリアルとしてAssetsに追加しました`,
        );
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: applied.manifest,
          scene,
        });
        bundleRef.current = nextBundle;
        return commitEditorHistory(current, {
          bundle: nextBundle,
          sceneSelection: current.present.sceneSelection,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
      return {
        alreadyInstalled: preview.alreadyInstalled,
        appliedToSky: applyToSky,
      };
    },
    [bundle.assets, selectInstalledAsset],
  );

  const handleAddWaterShader = useCallback(
    async (
      entry: WaterShaderCatalogEntry,
      parameterValues: Readonly<Record<string, number | string>>,
    ): Promise<WaterShaderInstallResult> => {
      const preview = applyWaterShaderCatalogInstall(
        bundle.assets,
        entry,
        parameterValues,
      );
      setHistory((current) => {
        const applied = applyWaterShaderCatalogInstall(
          current.present.bundle.assets,
          entry,
          parameterValues,
        );
        const primary = applied.manifest.assets[applied.primaryAssetId];
        setActiveAssetFolderId(primary?.folderId ?? null);
        selectInstalledAsset(applied.primaryAssetId);
        setSaveStatus("dirty");
        setNotice(
          `「${entry.label}」をマテリアルとして追加しました。板ポリなどへ割り当てると水面になります`,
        );
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: applied.manifest,
        });
        bundleRef.current = nextBundle;
        return commitEditorHistory(current, {
          bundle: nextBundle,
          sceneSelection: current.present.sceneSelection,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
      return { alreadyInstalled: preview.alreadyInstalled };
    },
    [bundle.assets, selectInstalledAsset],
  );

  /**
   * Installs a surface preset and binds it to the Terrain in one step.
   *
   * Splitting these would leave the author in the store with a Material and no
   * indication of where it goes; the whole point of the surface mode is that
   * the ground changes when the button is pressed.
   */
  const handleApplyTerrainSurface = useCallback(
    (
      entityId: string,
      componentId: string,
      entry: TerrainSurfaceCatalogEntry,
      values: Record<string, number | string>,
    ) => {
      if (editorMode !== "edit") {
        setNotice("表面は編集モードで適用してください");
        return;
      }
      setHistory((current) => {
        const installed = applyTerrainSurfaceCatalogInstall(
          current.present.bundle.assets,
          entry,
          values,
        );
        const scene = setMeshMaterialBinding(
          current.present.bundle.scene,
          installed.manifest,
          entityId,
          TERRAIN_MATERIAL_SLOT,
          installed.primaryAssetId,
          componentId,
        );
        // Re-applying the same preset leaves the binding untouched, so an
        // unchanged Scene is only a failure when the Asset side did not move
        // either. Treating it as one made a retune report as an error.
        const assetsChanged =
          installed.manifest !== current.present.bundle.assets;
        if (scene === current.present.bundle.scene && !assetsChanged) {
          setNotice("表面を適用できませんでした。対象の地形を確認してください");
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          `表面に「${entry.label}」を適用しました。マテリアルとして細かく調整できます`,
        );
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: installed.manifest,
          scene,
        });
        bundleRef.current = nextBundle;
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, setHistory, setNotice, setSaveStatus, touchProject],
  );

  const handleAssignSkybox = useCallback(
    (assetId: string) => {
      if (editorMode !== "edit") return;
      const asset = bundle.assets.assets[assetId];
      if (!isEnvironmentTextureAsset(asset) && asset?.kind !== "skybox") {
        setNotice("Skyboxに使えるテクスチャを読み取れませんでした");
        return;
      }
      updateScene((scene) => assignSkyboxToScene(scene, assetId));
      setNotice(`「${asset.name}」をSkyboxへ設定しました`);
    },
    [bundle.assets.assets, editorMode, updateScene],
  );

  const handleCreateComponentObject = useCallback(
    (componentDefinitionId: string) => {
      if (importBusy) return;
      const definition = getEditorEntityCreationDefinitions(projectKind).find(
        (candidate) => candidate.id === componentDefinitionId,
      );
      if (!definition) {
        setNotice("既存のEntityに追加してください");
        return;
      }
      const fallbackParticleId = createDocumentId("particle");
      setHistory((current) => {
        let assets = current.present.bundle.assets;
        let createdParticle = false;
        if (
          componentDefinitionId === "core.particle" &&
          !Object.values(assets.assets).some((asset) => asset.kind === "particle")
        ) {
          const addedParticle = addDefaultParticleAsset(assets, {
            id: fallbackParticleId,
            name: "新規パーティクル 1",
          });
          if (addedParticle.added) {
            assets = addedParticle.manifest;
            createdParticle = true;
          }
        }
        const created = createEmptyEntity(
          current.present.bundle.scene,
          null,
          definition.label,
        );
        if (!created) return current;
        const added = addEditorComponent(
          created.scene,
          assets,
          created.entityId,
          componentDefinitionId,
          projectKind,
          // Create > Image right after selecting a picture in Assets puts that
          // picture up, the same courtesy Add Component gives a Script.
          componentDefinitionId === "core.image"
            ? assetSelection ?? undefined
            : undefined,
        );
        if (!added.added) {
          setNotice(`${definition.label}をシーンへ作成できませんでした`);
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          createdParticle
            ? "パーティクルと、放出用のEntityを作成しました"
            : `${definition.label} Entityを作成しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets,
            scene: added.scene,
          }),
          sceneSelection: { kind: "entity", id: created.entityId },
          assetSelection: null,
        });
      });
    },
    [assetSelection, editorMode, importBusy, projectKind],
  );

  const handleLightChange = useCallback(
    (entityId: string, componentId: string, patch: LightPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateLightComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? Object.prototype.hasOwnProperty.call(patch, "lightType")
            ? "ライト種別を保存し、このEntityの動作確認を先頭から再実行しました"
            : "ライト設定を保存し、実行状態を保ったまま動作確認へ即時反映しました"
          : "ライト設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleTextChange = useCallback(
    (entityId: string, componentId: string, patch: TextPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateTextComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? "テキスト設定を保存し、このEntityの動作確認を先頭から再実行しました"
          : "テキスト設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleImageChange = useCallback(
    (entityId: string, componentId: string, patch: ImagePatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateImageComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? "画像設定を保存し、このEntityの動作確認を先頭から再実行しました"
          : "画像設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleSetSelectedEntitiesEnabled = useCallback(
    (enabled: boolean) => {
      if (editorMode !== "edit" || selectedEntityIds.length < 2) return;
      updateScene((scene) => selectedEntityIds.reduce(
        (next, entityId) => updateModelNodeEntityEnabled(next, entityId, enabled),
        scene,
      ));
      setNotice(`${selectedEntityIds.length}件のEntityを${enabled ? "有効" : "無効"}にしました`);
    },
    [editorMode, selectedEntityIds, updateScene],
  );

  const handleSetSelectedMeshShadow = useCallback(
    (patch: Pick<MeshInspectorPatch, "castShadow" | "receiveShadow">) => {
      if (editorMode !== "edit" || selectedEntityIds.length < 2) return;
      updateScene((scene) => selectedEntityIds.reduce((next, entityId) => {
        const entity = next.entities[entityId];
        if (!entity) return next;
        return entity.components
          .filter((component) => component.type === "mesh")
          .reduce(
            (withComponent, component) => updateMeshShadowSettings(withComponent, entityId, patch, component.id),
            next,
          );
      }, scene));
      setNotice(`${selectedEntityIds.length}件のMesh Rendererへ影設定を反映しました`);
    },
    [editorMode, selectedEntityIds, updateScene],
  );

  const handleSetSelectedLightShadow = useCallback(
    (castShadow: boolean) => {
      if (editorMode !== "edit" || selectedEntityIds.length < 2) return;
      updateScene((scene) => selectedEntityIds.reduce((next, entityId) => {
        const entity = next.entities[entityId];
        if (!entity) return next;
        return entity.components
          .filter((component) => component.type === "light")
          .reduce(
            (withComponent, component) => updateLightComponent(withComponent, entityId, { castShadow }, component.id),
            next,
          );
      }, scene));
      setNotice(`${selectedEntityIds.length}件のライトへ影を落とす設定を反映しました`);
    },
    [editorMode, selectedEntityIds, updateScene],
  );

  const handleApplySelectedMaterialPatch = useCallback(
    (patch: MaterialAssetPatch) => {
      if (editorMode !== "edit" || selectedAssetIds.length < 2) return;
      setBundle((current) => {
        const materialIds = selectedAssetIds.filter(
          (assetId) => current.assets.assets[assetId]?.kind === "material",
        );
        if (materialIds.length !== selectedAssetIds.length) return current;
        const assets = materialIds.reduce(
          (next, assetId) => updateMaterialAsset(next, assetId, patch),
          current.assets,
        );
        if (assets === current.assets) return current;
        setNotice(`${materialIds.length}件のマテリアルを更新し、使用しているメッシュの表示に反映しました`);
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, selectedAssetIds, setBundle],
  );

  const handleAudioSourceChange = useCallback(
    (entityId: string, componentId: string, patch: AudioSourcePatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateAudioSourceComponent(scene, entityId, patch, componentId),
      );
      const restartsEntity =
        Object.prototype.hasOwnProperty.call(patch, "enabled") ||
        Object.prototype.hasOwnProperty.call(patch, "audioAssetId") ||
        Object.prototype.hasOwnProperty.call(patch, "spatial");
      setNotice(
        editorMode === "play"
          ? restartsEntity
            ? "音源構成を保存し、このEntityの動作確認を先頭から再実行しました"
            : "音源設定を保存し、実行状態を保ったまま動作確認へ即時反映しました"
          : "音源設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleInteractionTriggerChange = useCallback(
    (entityId: string, componentId: string, patch: InteractionTriggerPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        syncInteractionTriggerReferences(
          updateInteractionTriggerComponent(scene, entityId, componentId, patch),
          bundleRef.current.assets,
        ),
      );
      setNotice(
        editorMode === "play"
          ? "Interaction Triggerを保存し、このEntityの動作確認を先頭から再実行しました"
          : "Interaction Triggerをシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleVegetationWindChange = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: VegetationWindPatch,
    ) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateVegetationWindComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? "風設定を保存し、動作確認へ即時反映しました"
          : "風設定をシーンへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleAutoFitCollider = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      const entity = bundle.scene.entities[entityId];
      const mesh = entity ? getMesh(entity) : undefined;
      if (!mesh || !getColliderAutoFitBounds(mesh, bundle.assets)) {
        setNotice("大きさを取得できるメッシュがありません");
        return;
      }
      const fitted = autoFitBoxCollider(
        bundle.scene,
        bundle.assets,
        entityId,
        componentId,
      );
      if (fitted === bundle.scene) {
        setNotice("Box Colliderは、すでにメッシュの大きさに合っています");
        return;
      }
      updateScene(() => fitted);
      setNotice("Box Colliderをメッシュの大きさに合わせました");
    },
    [bundle.assets, bundle.scene, editorMode, playSession, updateScene],
  );

  const markEditorDirty = useCallback(() => setSaveStatus("dirty"), []);
  const {
    handleCreateTerrain,
    handleTerrainGrassLayersChange,
    terrainOverlapCount,
    handleArrangeTerrains,
    handleTerrainBrush,
    handleTerrainSettings,
    handleTerrainStrokeStart,
    handleTerrainStroke,
    handleTerrainStrokeEnd,
    handleTerrainStrokeCancel,
    strokeActiveRef: terrainStrokeActiveRef,
  } = useTerrainAuthoring({
    editorMode,
    importBusy,
    historyPresent: history.present,
    setHistory,
    notify: setNotice,
    markDirty: markEditorDirty,
    touchProject,
    saveStatus,
    setSaveStatus,
    bundleRef,
    lastSavedBundleRef,
  });

  const reportedTerrainOverlapRef = useRef(0);
  useEffect(() => {
    if (terrainOverlapCount === 0) {
      reportedTerrainOverlapRef.current = 0;
      return;
    }
    if (reportedTerrainOverlapRef.current === terrainOverlapCount) return;
    reportedTerrainOverlapRef.current = terrainOverlapCount;
    // Overlapping Terrains tear into moire bands, and the cause is invisible:
    // the author sees broken ground, not two surfaces. Naming it is the fix.
    setNotice(
      `地形が${terrainOverlapCount}組重なっています。同じ場所に2つの地面があると表示が縞状に乱れます。「追加」メニューの「地形を横へ並べ直す」で解消できます`,
    );
  }, [terrainOverlapCount]);

  const handleAddTerrainPreset = useCallback(
    async (
      preset: TerrainPreset,
      grassPresetId: string | null,
    ): Promise<TerrainPresetInstallResult> => {
      // Placing a Terrain reuses the same path the Create menu takes, so a
      // preset from the store and one from the menu produce the same Entity.
      handleCreateTerrain(preset.id, grassPresetId);
      setExternalStoreOpen(false);
      return { entityName: preset.label };
    },
    [handleCreateTerrain],
  );

  const handleAddGlowMaterial = useCallback(
    async (
      shape: GlowFixtureShape,
      preset: GlowMaterialPreset,
    ): Promise<GlowMaterialInstallResult> => {
      // Placing goes through the Create menu path, so a fixture from the store
      // and one from the menu are the same Entity. Only the Material differs,
      // and that difference travels with the tint.
      handlePlacePrimitive(
        shape.creationId,
        undefined,
        glowMaterialAssetId(preset.id) === BUILTIN_ASSET_IDS.material.glow
          ? undefined
          : createGlowMaterialAsset(preset),
      );
      setExternalStoreOpen(false);
      return { entityName: `${preset.label}の光る${shape.label}` };
    },
    [handlePlacePrimitive],
  );

  const handleAddParticlePreset = useCallback(
    async (
      preset: ParticleAuthoringPreset,
      placeInScene: boolean,
    ): Promise<ParticlePresetInstallResult> => {
      // The store throws so the shelf shows the reason next to the button the
      // author just pressed, rather than a notice behind the modal.
      if (editorMode !== "edit") {
        throw new Error("動作確認を停止してからパーティクルを追加してください");
      }
      if (importBusy) {
        throw new Error("アセットのインポート完了後に追加してください");
      }

      const assetId = createDocumentId("particle");
      const folderId = resolveAssetCreationFolderId(
        bundle.assets,
        activeAssetFolderId,
      );
      const name = uniqueAssetName(bundle.assets, preset.name);
      const added = addDefaultParticleAsset(bundle.assets, {
        id: assetId,
        name,
        folderId,
        properties: preset.properties,
      });
      if (!added.added) {
        throw new Error("パーティクルを作成できませんでした");
      }

      // Asset creation and placement land as one history entry: undoing a
      // preset the author did not want should not leave its Asset behind.
      let scene = bundle.scene;
      let placedAssets = added.manifest;
      let placedEntityId: string | null = null;
      if (placeInScene) {
        const count = bundle.scene.rootEntityIds.length;
        const placement = instantiateSceneAsset(
          scene,
          added.manifest,
          bundle.prefabs,
          assetId,
          {
            position: [
              roundTo(((count % 5) - 2) * 1.35, 1),
              0,
              roundTo((Math.floor(count / 5) - 0.5) * 1.35, 1),
            ],
          },
        );
        if (!placement.placed) {
          throw new Error("パーティクルをシーンへ配置できませんでした");
        }
        scene = placement.scene;
        placedAssets = placement.assets;
        placedEntityId = placement.entityId;
      }

      setBundle(touchProject({ ...bundle, assets: placedAssets, scene }));
      if (placedEntityId) {
        setSceneSelection({ kind: "entity", id: placedEntityId });
        // Placing puts something in the Scene, so get out of the way and let
        // the author look at it — the same rule Terrain and the glow shelf use.
        setExternalStoreOpen(false);
        setNotice(
          `「${name}」をシーンへ配置しました。放出量や色はInspectorで調整できます`,
        );
      } else {
        setNotice(`「${name}」をAssetsに追加しました`);
      }
      setAssetSelection(assetId);
      return { assetName: name, placed: Boolean(placedEntityId) };
    },
    [
      activeAssetFolderId,
      bundle,
      editorMode,
      importBusy,
      setAssetSelection,
      setBundle,
      setSceneSelection,
    ],
  );

  const handleAddSceneRecipe = useCallback(
    async (recipe: SceneRecipe): Promise<SceneRecipeInstallResult> => {
      if (editorModeRef.current !== "edit") throw new Error("Playを停止してから追加してください");
      if (importBusyRef.current || importRunningRef.current || assetOperationRef.current !== null) {
        throw new Error("素材の処理が終わってから追加してください");
      }
      const path = projectPathRef.current;
      if (!path) throw new Error("プロジェクトを保存してから追加してください");
      const source = bundleRef.current;
      importRunningRef.current = true;
      setSceneRecipeImportBusy(true);
      try {
        const count = source.scene.rootEntityIds.length;
        const result = await instantiateSceneRecipe(source.scene, source.assets, recipe.id,
          source.project.projectKind, path,
          [roundTo(((count % 5) - 2) * 1.35, 1), 0, roundTo((Math.floor(count / 5) - 0.5) * 1.35, 1)]);
        if (!result) throw new Error("モデル・テクスチャ・音の追加に失敗しました。接続を確認して再試行してください");
        const latest = bundleRef.current;
        if (projectPathRef.current !== path || editorModeRef.current !== "edit" ||
            latest.scene !== source.scene || latest.project !== source.project || latest.prefabs !== source.prefabs) {
          throw new Error("追加中にプロジェクトが変更されました。現在の編集内容はそのままです。もう一度追加してください");
        }
        // Thumbnail updates are mergeable; user document edits are not.
        const assets = latest.assets === source.assets ? result.assets : mergeRecipeAssetsOntoLatest(source.assets, result.assets, latest.assets);
        setBundle(touchProject({ ...latest, assets, scene: result.scene }));
        setSceneSelection({ kind: "entity", id: result.rootEntityId });
        setAssetSelection(null);
        if (!recipe.lesson) setExternalStoreOpen(false);
        const entityName = result.scene.entities[result.rootEntityId]?.name ?? recipe.name;
        setNotice(`「${entityName}」を追加しました。Hierarchyで各パーツを編集し、Playで動作を確認できます`);
        return { entityName, createdAssetCount: Object.keys(result.assets.assets).filter(id => !source.assets.assets[id]).length };
      } finally {
        importRunningRef.current = false;
        setSceneRecipeImportBusy(false);
      }
    },
    [setAssetSelection, setBundle, setSceneSelection],
  );

  const handleOptimizeColliders = useCallback(
    (entityIds?: readonly string[]) => {
      if (editorMode !== "edit" && !playSession) return;
      const optimized = optimizeColliderConfiguration(bundle.scene, { entityIds });
      if (optimized.changes.length === 0) {
        setNotice("衝突判定の設定に自動修正できる問題はありません");
        return;
      }
      updateScene(() => optimized.scene);
      setNotice(
        `${optimized.changes.length}件の衝突判定の設定を最適化しました`,
      );
    },
    [bundle.scene, editorMode, playSession, updateScene],
  );

  const handleRemoveCollider = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        if (!entity) return scene;
        const components = entity.components.filter(
          (component) =>
            component.id !== componentId || component.type !== "collider",
        );
        if (components.length === entity.components.length) return scene;
        return {
          ...scene,
          entities: {
            ...scene.entities,
            [entityId]: { ...entity, components },
          },
        };
      });
      setNotice("Colliderを削除しました");
    },
    [editorMode, playSession, updateScene],
  );

  const handleParticleEmitterChange = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: ParticleEmitterInspectorPatch,
    ) => {
      if (editorMode !== "edit" && !playSession) return;
      if (
        patch.particleAssetId &&
        bundle.assets.assets[patch.particleAssetId]?.kind !== "particle"
      ) {
        setNotice("選択したパーティクルを参照できませんでした");
        return;
      }
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        if (!entity) return scene;
        let changed = false;
        const components = entity.components.map((component) => {
          if (
            component.id !== componentId ||
            component.type !== "particle-emitter"
          ) {
            return component;
          }
          const next = { ...component, ...patch };
          changed =
            next.enabled !== component.enabled ||
            next.particleAssetId !== component.particleAssetId;
          return changed ? next : component;
        });
        if (!changed) return scene;
        return {
          ...scene,
          entities: {
            ...scene.entities,
            [entityId]: { ...entity, components },
          },
        };
      });
      setNotice(
        editorMode === "play"
          ? "Particle Emitter設定を保存し、このEntityの動作確認を先頭から再実行しました"
          : "Particle Emitterの設定を更新しました",
      );
    },
    [bundle.assets.assets, editorMode, playSession, updateScene],
  );

  const handleRemoveParticleEmitter = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        if (!entity) return scene;
        const components = entity.components.filter(
          (component) =>
            component.id !== componentId ||
            component.type !== "particle-emitter",
        );
        if (components.length === entity.components.length) return scene;
        return {
          ...scene,
          entities: {
            ...scene.entities,
            [entityId]: { ...entity, components },
          },
        };
      });
      setNotice(
        editorMode === "play"
          ? "Particle Emitterを削除し、このEntityの動作確認を先頭から再実行しました"
          : "Particle Emitterを削除しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const commitMaterialAssignment = useCallback(
    (
      entityId: string,
      materialAssetId: string,
      slots: readonly string[],
      meshComponentId?: string,
    ) => {
      if (editorMode !== "edit") {
        setNotice("動作確認を停止してからマテリアルを適用してください");
        return;
      }
      setHistory((current) => {
        const assignment = assignMaterialToMeshSlots(
          current.present.bundle.scene,
          current.present.bundle.assets,
          entityId,
          materialAssetId,
          slots,
          meshComponentId,
        );
        if (!assignment.applied) {
          const message = {
            "entity-missing": "マテリアルの適用先Entityが見つかりません",
            "mesh-missing": "マテリアルはメッシュを持つEntityへドロップしてください",
            "material-missing": "ドラッグしたマテリアルが見つかりません",
            "slot-missing": "メッシュに適用できるマテリアルスロットがありません",
            unchanged: "選択したスロットにはこのマテリアルが適用済みです",
          }[assignment.reason];
          setNotice(message);
          return current;
        }
        const nextBundle = touchProject({
          ...current.present.bundle,
          scene: assignment.scene,
        });
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        setNotice(
          assignment.slots.length === 1
            ? `マテリアルを「${assignment.slots[0]}」スロットに適用しました`
            : `マテリアルを${assignment.slots.length}個のスロットに適用しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: materialAssetId,
        });
      });
    },
    [editorMode],
  );

  const handleAssignMaterial = useCallback(
    (
      entityId: string,
      materialAssetId: string,
      meshComponentId?: string,
    ) => {
      if (editorMode !== "edit") {
        setNotice("動作確認を停止してからマテリアルを適用してください");
        return;
      }
      const target = getMaterialAssignmentTarget(
        bundle.scene,
        bundle.assets,
        entityId,
        meshComponentId,
      );
      if (!target.ready) {
        const message = {
          "entity-missing": "マテリアルの適用先Entityが見つかりません",
          "mesh-missing": "マテリアルはメッシュを持つEntityへドロップしてください",
          "slot-missing": "メッシュに適用できるマテリアルスロットがありません",
        }[target.reason];
        setNotice(message);
        return;
      }
      const material = bundle.assets.assets[materialAssetId];
      if (material?.kind !== "material") {
        setNotice("ドラッグしたマテリアルが見つかりません");
        return;
      }
      if (target.slots.length === 1) {
        commitMaterialAssignment(
          entityId,
          materialAssetId,
          [target.slots[0].slot],
          target.meshId,
        );
        return;
      }

      const entity = bundle.scene.entities[entityId];
      const meshEntity = bundle.scene.entities[target.meshEntityId];
      const mesh = meshEntity?.components.find(
        (component) => component.id === target.meshId && component.type === "mesh",
      );
      if (!entity || mesh?.type !== "mesh") {
        setNotice("マテリアルの適用先メッシュが見つかりません");
        return;
      }
      const geometryAssetId =
        mesh.geometry?.kind === "asset"
          ? mesh.geometry.assetId
          : mesh.geometryAssetId;
      const geometryAsset = bundle.assets.assets[geometryAssetId];
      const usesOpenBrushSource =
        geometryAsset?.kind === "model" &&
        Boolean(geometryAsset.importMetadata?.openBrush);
      const slots = target.slots.map((slot) => {
        const binding = mesh.materialBindings.find(
          (candidate) =>
            candidate.slot === slot.slot &&
            candidate.sourceNodeIndex === target.sourceNodeIndex,
        );
        const globalBinding = mesh.materialBindings.find(
          (candidate) =>
            candidate.slot === slot.slot &&
            candidate.sourceNodeIndex === undefined,
        );
        const currentMaterialId =
          binding?.materialAssetId ??
          globalBinding?.materialAssetId ??
          slot.defaultMaterialAssetId;
        const currentMaterial = currentMaterialId
          ? bundle.assets.assets[currentMaterialId]
          : undefined;
        return {
          ...slot,
          currentMaterialName:
            currentMaterial?.kind === "material"
              ? currentMaterial.name
              : usesOpenBrushSource
                ? "OpenBrush Brush Shader"
                : undefined,
        };
      });
      setPendingMaterialAssignment({
        entityId,
        meshComponentId: target.meshId,
        entityName: entity.name,
        materialAssetId,
        materialName: material.name,
        slots,
      });
      setNotice("適用するマテリアルスロットを選択してください");
    },
    [bundle, commitMaterialAssignment, editorMode],
  );

  const handleMaterialChange = useCallback(
    (assetId: string, patch: MaterialAssetPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      // Native color pickers can emit many synchronous input events before
      // yielding. Commit each edit immediately, but let React batch rendering
      // instead of nesting a synchronous render for every intermediate color.
      startTransition(() => {
        setBundle((current) => {
          const assets = updateMaterialAsset(current.assets, assetId, patch);
          if (assets === current.assets) {
            setNotice("マテリアルは変更していません。入力できない値は、元の値に戻します");
            return current;
          }
          setNotice(
            editorMode === "play"
              ? "マテリアル設定を保存し、参照中のEntityだけ動作確認へ再反映しました"
              : "マテリアルの設定を更新し、使用しているメッシュの表示に反映しました",
          );
          return touchProject({ ...current, assets });
        });
      });
    },
    [editorMode, playSession],
  );

  const handleAssignShaderAsset = useCallback(
    async (
      materialAssetId: string,
      stage: ShaderAssetStage,
      shaderAssetId: string | null,
    ) => {
      const material = bundleRef.current.assets.assets[materialAssetId];
      if (material?.kind !== "material" || material.shader?.kind !== "classic-r3f") {
        return;
      }
      if (!shaderAssetId) {
        const { [stage === "vertex" ? "vertexShaderAssetId" : "fragmentShaderAssetId"]: _removed, ...shader } = material.shader;
        handleMaterialChange(materialAssetId, { shader });
        return;
      }
      const shaderAsset = bundleRef.current.assets.assets[shaderAssetId];
      if (shaderAsset?.kind === "shader" && shaderAsset.stage !== stage) {
        setNotice(`このシェーダー素材は${shaderAsset.stage}用です。${stage}用の素材を選択してください`);
        return;
      }
      if (shaderAsset?.kind !== "shader" || !projectPath) {
        setNotice("GLSL 素材を読み込むにはプロジェクトを保存してください");
        return;
      }
      try {
        const source = await tauri.readTextFile(
          projectPath,
          shaderAsset.source.relativePath,
        );
        const sourceField =
          stage === "vertex" ? "vertexShader" : "fragmentShader";
        const assetField =
          stage === "vertex" ? "vertexShaderAssetId" : "fragmentShaderAssetId";
        const latestMaterial = bundleRef.current.assets.assets[materialAssetId];
        if (
          latestMaterial?.kind !== "material" ||
          latestMaterial.shader?.kind !== "classic-r3f"
        ) {
          return;
        }
        handleMaterialChange(materialAssetId, {
          shader: {
            ...latestMaterial.shader,
            [sourceField]: source,
            [assetField]: shaderAssetId,
          },
        });
        setNotice(`「${shaderAsset.name}」を${stage} GLSLとしてマテリアルへ設定しました`);
      } catch (cause) {
        setNotice(
          cause instanceof Error
            ? `GLSL 素材を読み込めませんでした: ${cause.message}`
            : "GLSL 素材を読み込めませんでした",
        );
      }
    },
    [handleMaterialChange, projectPath],
  );

  const handleModelChange = useCallback(
    (assetId: string, patch: ModelAssetPatch) => {
      if (editorMode !== "edit") return;
      if (modelReimportBusy) {
        setNotice("3Dモデルの再インポート完了後に設定を変更できます");
        return;
      }
      setBundle((current) => {
        const assets = updateModelAsset(current.assets, assetId, patch);
        if (assets === current.assets) {
          setNotice("モデルの設定は変更していません。入力できない値は、元の値に戻します");
          return current;
        }
        setNotice("モデルの読み込み設定と既定マテリアルの割り当てを更新しました");
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, modelReimportBusy, setBundle],
  );

  const handleReimportModel = useCallback(
    async (assetId: string) => {
      const availability = resolveAssetOperationAvailability(
        "model-reimport",
        {
          readOnly: editorMode !== "edit",
          assetImportActive:
            importRunningRef.current ||
            hasActiveAssetImport(importQueueRef.current),
          modelReimportActive:
            assetOperationRef.current?.kind === "model-reimport",
          textureProcessingActive:
            assetOperationRef.current?.kind === "texture-processing",
        },
      );
      if (!availability.allowed) {
        setNotice(availability.disabledReason);
        return;
      }
      if (!projectPath) {
        setNotice("初回の自動保存完了後に3Dモデルを再インポートできます");
        return;
      }

      const startingBundle = bundleRef.current;
      const startingAsset = startingBundle.assets.assets[assetId];
      if (startingAsset?.kind !== "model") {
        setNotice("再インポートする3Dモデルが見つかりません");
        return;
      }
      if (startingAsset.source.kind !== "project") {
        setNotice("プロジェクト内に保存された3Dモデルだけ再インポートできます");
        return;
      }

      const operationToken = Symbol("model-reimport");
      assetOperationRef.current = {
        kind: "model-reimport",
        token: operationToken,
      };

      setModelReimportFeedback({
        assetId,
        state: { phase: "reading", message: "モデルファイルを読み込んでいます" },
      });
      setNotice(`「${startingAsset.name}」の再インポートを開始しました`);

      try {
        const result = await reimportModelAssetFromDisk(
          projectPath,
          startingBundle.assets,
          assetId,
          (progress) => {
            setModelReimportFeedback({
              assetId,
              state: modelReimportStateFromProgress(progress),
            });
          },
          textureImportSettingsPatch(
            textureImportMaxSizeRef.current,
            textureImportCompressionRef.current,
          ),
        );

      if (!result.ok) {
        setModelReimportFeedback({
          assetId,
          state: { phase: "failed", message: result.message },
        });
        setNotice(result.message);
        return;
      }

      const reimportedAsset = result.manifest.assets[assetId];
      if (reimportedAsset?.kind !== "model") {
        const message = "再インポート結果を確認できませんでした。元の素材は保持されています";
        setModelReimportFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }

      if (bundleRef.current.assets.assets[assetId] !== startingAsset) {
        const message =
          "処理中に3Dモデル設定が変更されたため、自動適用を取り消しました。元の素材は保持されています";
        setModelReimportFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }

        setHistory((current) => {
        if (current.present.bundle.assets.assets[assetId] !== startingAsset) {
          const message =
            "処理中に3Dモデル設定が変更されたため、自動適用を取り消しました。元の素材は保持されています";
          setModelReimportFeedback({
            assetId,
            state: { phase: "failed", message },
          });
          setNotice(message);
          return current;
        }
        const nextBundle = touchProject(applyModelReimportSettings({
          ...current.present.bundle,
          assets: result.manifest,
        }, reimportedAsset));
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        setModelReimportFeedback({
          assetId,
          state: {
            phase: "succeeded",
            message: "3Dモデルを読み込み直しました",
          },
        });
        setNotice(
          `「${reimportedAsset.name}」を再インポートし、モデル由来マテリアルとテクスチャを更新しました`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
          assetSelection: assetId,
        });
        });
      } finally {
        if (assetOperationRef.current?.token === operationToken) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, projectPath],
  );

  const handleTextureChange = useCallback(
    (assetId: string, patch: TextureAssetPatch) => {
      if (editorMode !== "edit") return;
      if (textureProcessingBusy) {
        setNotice("テクスチャの変換完了後に設定を変更できます");
        return;
      }
      setBundle((current) => {
        const assets = updateTextureAsset(current.assets, assetId, patch);
        if (assets === current.assets) return current;
        // 直前の変換結果は新しい設定に対する答えではないので、案内を戻す。
        setTextureProcessingFeedback((feedback) =>
          feedback?.assetId === assetId ? null : feedback,
        );
        setNotice(
          "テクスチャ読み込み設定を更新しました。公開時にこの設定で変換します。編集画面の表示にも適用するには「この設定で画像を書き出す」を使います",
        );
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, textureProcessingBusy],
  );


  const handleApplyTextureProcessing = useCallback(
    async (assetId: string) => {
      const availability = resolveAssetOperationAvailability(
        "texture-processing",
        {
          readOnly: editorMode !== "edit",
          assetImportActive:
            importRunningRef.current ||
            hasActiveAssetImport(importQueueRef.current),
          modelReimportActive:
            assetOperationRef.current?.kind === "model-reimport",
          textureProcessingActive:
            assetOperationRef.current?.kind === "texture-processing",
        },
      );
      if (!availability.allowed) {
        const message = availability.disabledReason ?? "いまはテクスチャを変換できません";
        setTextureProcessingFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }
      if (!projectPath) {
        const message = "初回の自動保存完了後にテクスチャを変換できます";
        setTextureProcessingFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }

      const startingAsset = bundleRef.current.assets.assets[assetId];
      if (startingAsset?.kind !== "texture") {
        const message = "変換するテクスチャが見つかりません";
        setTextureProcessingFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }

      const operationToken = Symbol("texture-processing");
      assetOperationRef.current = {
        kind: "texture-processing",
        token: operationToken,
      };
      setTextureProcessingFeedback({
        assetId,
        state: {
          phase: "reading",
          message: `${startingAsset.name}を読み込んでいます`,
        },
      });

      try {
        const result = await applyTextureProcessing(
          projectPath,
          bundleRef.current.assets,
          assetId,
          (progress) => {
            setTextureProcessingFeedback({
              assetId,
              state: { phase: progress.phase, message: progress.message },
            });
          },
        );

        if (!result.ok) {
          setTextureProcessingFeedback({
            assetId,
            state: { phase: "failed", message: result.message },
          });
          setNotice(result.message);
          return;
        }

        // 変換中に設定が動いた場合は、書き出した画像を採用せず原本のまま残す。
        const staleMessage =
          "変換中にテクスチャ設定が変更されたため、適用を取り消しました。元の画像は残っています";
        if (bundleRef.current.assets.assets[assetId] !== startingAsset) {
          setTextureProcessingFeedback({
            assetId,
            state: { phase: "failed", message: staleMessage },
          });
          setNotice(staleMessage);
          return;
        }

        const formatLabel =
          result.outputFormat === "jpeg"
            ? "JPEG"
            : result.outputFormat.toUpperCase();
        const summary = `${result.width} × ${result.height}の${formatLabel}へ変換しました（${formatFileSize(result.beforeBytes)} → ${formatFileSize(result.afterBytes)}）`;

        setHistory((current) => {
          if (current.present.bundle.assets.assets[assetId] !== startingAsset) {
            setTextureProcessingFeedback({
              assetId,
              state: { phase: "failed", message: staleMessage },
            });
            setNotice(staleMessage);
            return current;
          }
          const nextBundle = touchProject({
            ...current.present.bundle,
            assets: result.manifest,
          });
          bundleRef.current = nextBundle;
          setSaveStatus("dirty");
          setTextureProcessingFeedback({
            assetId,
            state: { phase: "succeeded", message: summary },
          });
          setNotice(`「${result.assetName}」を${summary}`);
          return commitEditorHistory(current, {
            ...current.present,
            bundle: nextBundle,
            assetSelection: assetId,
          });
        });
      } finally {
        if (assetOperationRef.current?.token === operationToken) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, projectPath],
  );

  const handleApplyTextureProcessingBatch = useCallback(
    async (assetIds: readonly string[], settings?: import("../../lib/visual-editor/asset-manifest").TextureImportSettingsPatch) => {
      const availability = resolveAssetOperationAvailability(
        "texture-processing",
        {
          readOnly: editorMode !== "edit",
          assetImportActive:
            importRunningRef.current ||
            hasActiveAssetImport(importQueueRef.current),
          modelReimportActive:
            assetOperationRef.current?.kind === "model-reimport",
          textureProcessingActive:
            assetOperationRef.current?.kind === "texture-processing",
        },
      );
      const fail = (message: string) => {
        setTextureBatchFeedback({ phase: "failed", message });
        setNotice(message);
      };
      if (!availability.allowed) {
        fail(availability.disabledReason ?? "いまはテクスチャを変換できません");
        return;
      }
      if (!projectPath) {
        fail("初回の自動保存完了後にテクスチャを変換できます");
        return;
      }
      const targets = assetIds.filter(
        (assetId) => bundleRef.current.assets.assets[assetId]?.kind === "texture",
      );
      if (targets.length === 0) {
        fail("変換するテクスチャが見つかりません");
        return;
      }

      const operationToken = Symbol("texture-processing-batch");
      assetOperationRef.current = {
        kind: "texture-processing",
        token: operationToken,
      };
      const startingAssets = targets.map(
        (assetId) => bundleRef.current.assets.assets[assetId],
      );
      setTextureBatchFeedback({
        phase: "reading",
        message: `${targets.length}件のテクスチャを読み込んでいます`,
      });

      try {
        let processingManifest = bundleRef.current.assets;
        if (settings) {
          for (const id of targets) {
            const asset = processingManifest.assets[id];
            if (asset.kind === "texture") processingManifest = updateTextureAsset(processingManifest, id, { importSettings: normalizeTextureImportSettings(settings, textureProcessingSettings(asset)) });
          }
        }
        const result = await applyTextureProcessingBatch(
          projectPath,
          processingManifest,
          targets,
          (progress) => {
            setTextureBatchFeedback({
              phase: progress.phase,
              message: `${progress.message}（${Math.min(progress.completed + 1, progress.total)}/${progress.total}）`,
            });
          },
        );
        if (!result.ok) {
          fail(result.message);
          return;
        }

        // 変換中に設定が動いたTextureがあれば、どのAssetも差し替えない。
        const staleMessage =
          "変換中にテクスチャ設定が変更されたため、適用を取り消しました。元の画像は残っています";
        const unchanged = targets.every(
          (assetId, index) =>
            bundleRef.current.assets.assets[assetId] === startingAssets[index],
        );
        if (!unchanged) {
          fail(staleMessage);
          return;
        }

        const skippedSummary =
          result.skipped.length > 0 ? `（${result.skipped.length}件は対象外）` : "";
        const summary = `${result.convertedAssetNames.length}件を変換しました${skippedSummary}（${formatFileSize(result.beforeBytes)} → ${formatFileSize(result.afterBytes)}）`;

        setHistory((current) => {
          const stillUnchanged = targets.every(
            (assetId, index) =>
              current.present.bundle.assets.assets[assetId] === startingAssets[index],
          );
          if (!stillUnchanged) {
            fail(staleMessage);
            return current;
          }
          const nextBundle = touchProject({
            ...current.present.bundle,
            assets: result.manifest,
          });
          bundleRef.current = nextBundle;
          setSaveStatus("dirty");
          setTextureBatchFeedback({ phase: "succeeded", message: summary });
          setNotice(summary);
          return commitEditorHistory(current, {
            ...current.present,
            bundle: nextBundle,
          });
        });
      } finally {
        if (assetOperationRef.current?.token === operationToken) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, projectPath],
  );

  // 公開ダイアログの一括変換・最適化はEditorの外（App）で走り、ディスクと
  // 公開バンドルだけを更新していた。ここで受け口を登録して、変換後のManifestを
  // 同じ操作の中で履歴へ取り込む。これが無いと、シーンは変換前の画像を見せ
  // 続け、次の保存が変換をManifestごと巻き戻してしまう。
  useEffect(() => {
    if (!onRegisterExternalAssetsCommit) return;
    const commit: ExternalAssetsCommit = ({ expectedAssets, nextAssets, notice }) => {
      if (editorModeRef.current !== "edit") return false;
      if (assetOperationRef.current) return false;
      if (bundleRef.current.assets !== expectedAssets) return false;
      setHistory((current) => {
        if (current.present.bundle.assets !== expectedAssets) return current;
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: nextAssets,
        });
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
        });
      });
      setNotice(notice);
      return true;
    };
    onRegisterExternalAssetsCommit(commit);
    return () => onRegisterExternalAssetsCommit(null);
  }, [onRegisterExternalAssetsCommit]);

  /**
   * 変換・最適化の解除。原本ファイルは残してあるので、Manifestの参照先と
   * Import設定を戻すだけで済む。書き出したファイルは消さない。
   */
  const handleRevertAssetOptimization = useCallback(
    (assetId: string, kind: "texture" | "model") => {
      if (editorMode !== "edit") {
        setNotice("動作確認を停止してから原本に戻してください");
        return;
      }
      if (
        assetOperationRef.current?.kind === "model-reimport" ||
        assetOperationRef.current?.kind === "texture-processing"
      ) {
        setNotice("変換の完了後に原本へ戻せます");
        return;
      }
      setHistory((current) => {
        const result =
          kind === "texture"
            ? revertTextureOptimization(current.present.bundle.assets, assetId)
            : revertModelOptimization(current.present.bundle.assets, assetId);
        if (!result.ok) {
          setNotice(result.message);
          return current;
        }
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: result.manifest,
        });
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        if (kind === "texture") {
          setTextureProcessingFeedback({
            assetId,
            state: {
              phase: "succeeded",
              message: "原本に戻しました。変換前の読み込み設定も復元しています",
            },
          });
        } else {
          setModelOptimizationFeedback({
            assetId,
            state: {
              phase: "succeeded",
              message: "原本に戻しました。変換前の読み込み設定も復元しています",
            },
          });
        }
        setNotice(`「${result.assetName}」を原本に戻しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
          assetSelection: assetId,
        });
      });
    },
    [editorMode],
  );

  /*
   * 当たり判定だけを軽量化する。
   *
   * 見た目のMeshは触らない。地面のように重いまま見せたいものほど、当たりは
   * 荒くて構わない。焼き出した軽量Modelを別Assetにして、Mesh Colliderから
   * そこを指す。元に戻すのは参照を外すだけで済む。
   */
  const handleBakeNodeCollider = useCallback(
    async (entityId: string, componentId: string, ratio: number) => {
      const availability = resolveAssetOperationAvailability(
        "model-optimization",
        {
          readOnly: editorMode !== "edit",
          assetImportActive:
            importRunningRef.current ||
            hasActiveAssetImport(importQueueRef.current),
          modelReimportActive:
            assetOperationRef.current?.kind === "model-reimport",
          textureProcessingActive:
            assetOperationRef.current?.kind === "texture-processing",
        },
      );
      if (!availability.allowed) {
        setNotice(availability.disabledReason ?? "いまは当たり判定を作れません");
        return;
      }
      if (!projectPath) {
        setNotice("プロジェクトの保存後に当たり判定を作成できます");
        return;
      }
      const entity = bundleRef.current.scene.entities[entityId];
      const modelNode = entity ? colliderModelNode(entity) : undefined;
      const collider = entity?.components.find(
        (component): component is ColliderComponent =>
          component.type === "collider" && component.id === componentId,
      );
      if (!entity || !modelNode || collider?.shape !== "mesh") {
        setNotice("当たり判定を作るメッシュ衝突判定が見つかりませんでした");
        return;
      }
      const startingModel = bundleRef.current.assets.assets[modelNode.modelAssetId];
      const token = Symbol("collider-bake");
      assetOperationRef.current = { kind: "model-reimport", token };
      setNotice(`「${entity.name}」の当たり判定を作成しています`);
      try {
        const result = await bakeNodeColliderModel(
          projectPath,
          bundleRef.current.assets,
          {
            modelAssetId: modelNode.modelAssetId,
            sourceNodeIndex: modelNode.sourceNodeIndex,
            ratio,
            nodeName: entity.name,
            existingAssetId: collider.collisionModelAssetId,
            createAssetId: () => createDocumentId("model-collision"),
          },
        );
        if (!result.ok) {
          setNotice(result.message);
          return;
        }
        if (bundleRef.current.scene.entities[entityId]?.components.find((c) => c.id === componentId) !== collider || bundleRef.current.assets.assets[modelNode.modelAssetId] !== startingModel) {
          setNotice("作成中に対象の設定が変わったため適用しませんでした。もう一度実行してください"); return;
        }
        setHistory((current) => {
          const scene = updateColliderComponent(
            current.present.bundle.scene,
            entityId,
            { collisionModelAssetId: result.assetId },
            componentId,
          );
          const nextBundle = touchProject({
            ...current.present.bundle,
            scene,
            assets: { ...current.present.bundle.assets, assets: { ...current.present.bundle.assets.assets, [result.assetId]: result.manifest.assets[result.assetId] } },
          });
          bundleRef.current = nextBundle;
          setSaveStatus("dirty");
          return commitEditorHistory(current, {
            ...current.present,
            bundle: nextBundle,
          });
        });
        setNotice(
          `「${entity.name}」の当たり判定を ${result.triangles.before.toLocaleString()} → ${result.triangles.after.toLocaleString()} ポリゴンで作成しました。見た目はそのままです`,
        );
      } finally {
        if (assetOperationRef.current?.token === token) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, projectPath],
  );

  const handleClearNodeCollider = useCallback(
    (entityId: string, componentId: string) => {
      updateScene((scene) =>
        updateColliderComponent(
          scene,
          entityId,
          { collisionModelAssetId: null },
          componentId,
        ),
      );
      setNotice("当たり判定を見た目のジオメトリへ戻しました");
    },
    [updateScene],
  );

  const handleApplyModelOptimization = useCallback(
    async (assetId: string, options: ModelOptimizationOptions) => {
      const availability = resolveAssetOperationAvailability(
        "model-optimization",
        {
          readOnly: editorMode !== "edit",
          assetImportActive:
            importRunningRef.current ||
            hasActiveAssetImport(importQueueRef.current),
          modelReimportActive:
            assetOperationRef.current?.kind === "model-reimport",
          textureProcessingActive:
            assetOperationRef.current?.kind === "texture-processing",
        },
      );
      const fail = (message: string) => {
        setModelOptimizationFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
      };
      if (!availability.allowed) {
        fail(availability.disabledReason ?? "いまは3Dモデルを最適化できません");
        return;
      }
      if (!projectPath) {
        fail("初回の自動保存完了後に3Dモデルを最適化できます");
        return;
      }
      const startingAsset = bundleRef.current.assets.assets[assetId];
      if (startingAsset?.kind !== "model") {
        fail("最適化する3Dモデルが見つかりません");
        return;
      }

      const operationToken = Symbol("model-optimization");
      // 原本を差し替える点は再インポートと同じなので、同じ排他区間を使う。
      assetOperationRef.current = { kind: "model-reimport", token: operationToken };
      setModelOptimizationFeedback({
        assetId,
        state: { phase: "reading", message: `${startingAsset.name}を読み込んでいます` },
      });

      try {
        const result = await applyModelOptimization(
          projectPath,
          bundleRef.current.assets,
          assetId,
          options,
          (progress) => {
            setModelOptimizationFeedback({
              assetId,
              state: { phase: progress.phase, message: progress.message },
            });
          },
        );
        if (!result.ok) {
          fail(result.message);
          return;
        }

        // 最適化中に設定が動いた場合は、書き出したGLBを採用せず原本のまま残す。
        const staleMessage =
          "最適化中に3Dモデル設定が変更されたため、適用を取り消しました。元の3Dモデルは残っています";
        if (bundleRef.current.assets.assets[assetId] !== startingAsset) {
          fail(staleMessage);
          return;
        }

        // 間引きの手応えは容量ではなく三角形の数で伝わる。描画の重さはそちらで
        // 決まるし、圧縮のかかり方しだいで容量はほとんど動かないこともある。
        const triangleSummary = result.triangles
          ? `ポリゴン ${result.triangles.before.toLocaleString()} → ${result.triangles.after.toLocaleString()}、`
          : "";
        const summary = `${triangleSummary}${formatFileSize(result.beforeBytes)} → ${formatFileSize(result.afterBytes)}へ最適化しました（${result.steps
          .map((step) => MODEL_OPTIMIZATION_STEP_LABELS[step])
          .join(" / ")}）`;
        setHistory((current) => {
          if (current.present.bundle.assets.assets[assetId] !== startingAsset) {
            fail(staleMessage);
            return current;
          }
          const nextBundle = touchProject({
            ...current.present.bundle,
            assets: result.manifest,
          });
          bundleRef.current = nextBundle;
          setSaveStatus("dirty");
          setModelOptimizationFeedback({
            assetId,
            state: { phase: "succeeded", message: summary },
          });
          setNotice(`「${result.assetName}」を${summary}`);
          return commitEditorHistory(current, {
            ...current.present,
            bundle: nextBundle,
            assetSelection: assetId,
          });
        });
      } finally {
        if (assetOperationRef.current?.token === operationToken) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, projectPath],
  );

  const handleCreateTextureCard = useCallback(
    (textureAssetId: string, profile: TextureCardProfile) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してからカードを作成してください"
            : "アセットのインポート完了後にカードを作成してください",
        );
        return;
      }
      const materialId = createDocumentId("material-card");
      setHistory((current) => {
        const created = createTextureCard(
          current.present.bundle.scene,
          current.present.bundle.assets,
          { textureAssetId, materialId, profile },
        );
        if (!created.created) {
          setNotice(
            created.reason === "environment-texture"
              ? "環境テクスチャは遠景・草カードに使用できません"
              : created.reason === "texture-missing"
                ? "テクスチャが見つかりません。素材を開き直してください"
                : "カードを作成できませんでした。テクスチャと素材の状態を確認してください",
          );
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          `「${created.entityName}」を配置しました。選択中のEntityを移動し、マテリアルのAlphaで透明度を調整できます`,
        );
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: created.assets,
            scene: created.scene,
          }),
          sceneSelection: { kind: "entity", id: created.entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy],
  );

  const handleParticleChange = useCallback(
    (assetId: string, patch: ParticlePropertiesPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      setBundle((current) => {
        const assets = updateParticleAsset(current.assets, assetId, patch);
        if (assets === current.assets) return current;
        setNotice(
          editorMode === "play"
            ? "パーティクル設定を保存し、参照中のEmitterだけ動作確認へ再反映しました"
            : "パーティクル設定を更新し、参照中のEmitterへ反映しました",
        );
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, playSession, setBundle],
  );

  const handleCreateDocumentAsset = useCallback(
    (
      kind: "material" | "particle" | "interactivity",
      requestedFolderId?: string | null,
    ) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してから素材を作成してください"
            : "アセットのインポート完了後に作成してください",
        );
        return;
      }
      const assetId = createDocumentId(kind);
      setHistory((current) => {
        const assets = current.present.bundle.assets;
        if (
          requestedFolderId !== undefined &&
          requestedFolderId !== null &&
          !assets.folders?.[requestedFolderId]
        ) {
          setNotice("作成先のフォルダーが見つかりません。フォルダーを開き直してください");
          return current;
        }
        const folderId =
          requestedFolderId === undefined
            ? resolveAssetCreationFolderId(assets, activeAssetFolderId)
            : requestedFolderId;
        const added = addDefaultDocumentAsset(assets, {
          kind,
          id: assetId,
          folderId,
        });
        if (!added.added) {
          setNotice("素材を作成できませんでした。作成先を確認してください");
          return current;
        }
        const destination = folderId
          ? `「${assets.folders?.[folderId]?.name ?? "Folder"}」`
          : "Assets直下";
        setSaveStatus("dirty");
        setNotice(
          kind === "material"
            ? `標準glTFマテリアルを${destination}に作成し、Inspectorで開きました`
            : kind === "particle"
              ? `パーティクルを${destination}に作成し、Inspectorで開きました`
              : `ノードグラフを${destination}に作成し、ノードエディターで開きました`,
        );
        if (kind === "interactivity") {
          setInteractivityEditorAssetId(added.assetId);
          setGraphTabActive(true);
        }
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: added.manifest,
          }),
          assetSelection: added.assetId,
        });
      });
    },
    [activeAssetFolderId, editorMode, importBusy],
  );

  /**
   * Builds a graph that plays every clip a Model carries, from the Model.
   *
   * The Animation Component keeps working and keeps playing its one clip; this
   * is the other reading of "play the animations", for a Model whose motion is
   * spread over dozens of clips meant to run together. The Asset is created and
   * opened, but not attached to anything: which Entity should carry it is the
   * author's decision, and generating sixty-four nodes is already enough of a
   * change to make in one click.
   */
  const handleCreateModelAnimationGraph = useCallback(
    (assetId: string) => {
      if (editorMode !== "edit") {
        setNotice("動作確認を停止してからノードグラフを作成してください");
        return;
      }
      const model = bundleRef.current.assets.assets[assetId];
      if (model?.kind !== "model") return;
      const clips = model.importMetadata?.animations ?? [];
      if (clips.length === 0) {
        setNotice("この3Dモデルにはアニメーションクリップがありません");
        return;
      }
      const graphAssetId = createDocumentId("asset");
      setHistory((current) => {
        const assets = current.present.bundle.assets;
        const added = addDefaultInteractivityAsset(assets, {
          id: graphAssetId,
          name: `${model.name} のアニメーション`,
          folderId: model.folderId ?? null,
          extension: createModelAnimationGraphExtension(
            clips.map((clip) => clip.name),
          ),
        });
        if (!added.added) {
          setNotice("ノードグラフを作成できませんでした");
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          `${clips.length}件のクリップを再生するノードグラフを作成しました。Entityに付けると動作確認でループ再生されます`,
        );
        setInteractivityEditorAssetId(added.assetId);
        setGraphTabActive(true);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: added.manifest,
          }),
          assetSelection: added.assetId,
        });
      });
    },
    [editorMode],
  );

  const handleCreateAssetFolder = useCallback(() => {
    if (editorMode !== "edit") return;
    const folderId = createDocumentId("folder");
    setBundle((current) => {
      const count = Object.keys(current.assets.folders ?? {}).length;
      const parentId =
        activeAssetFolderId && current.assets.folders?.[activeAssetFolderId]
          ? activeAssetFolderId
          : null;
      const added = addAssetFolder(current.assets, {
        id: folderId,
        name: `新規フォルダー ${count + 1}`,
        parentId,
      });
      if (!added.added) return current;
      setActiveAssetFolderId(folderId);
      setNotice("フォルダーを作成しました");
      return touchProject({ ...current, assets: added.manifest });
    });
  }, [activeAssetFolderId, editorMode, setBundle]);

  const handleCreatePrefab = useCallback(
    (entityId: string) => {
      if (editorMode !== "edit") return;
      const prefabId = createDocumentId("prefab");
      const assetId = createDocumentId("asset-prefab");
      setHistory((current) => {
        const entity = current.present.bundle.scene.entities[entityId];
        if (!entity) return current;
        const result = createPrefabDocument(
          current.present.bundle.scene,
          current.present.bundle.assets,
          {
            prefabId,
            name: `${entity.name} Prefab`,
            sourceRootEntityIds: [entityId],
          },
        );
        if (!result) return current;
        const path = `prefabs/${prefabId}.prefab.json`;
        const added = addPrefabAsset(current.present.bundle.assets, {
          id: assetId,
          name: `${entity.name} Prefab`,
          prefabPath: path,
        });
        if (!added.added) return current;
        setSaveStatus("dirty");
        setNotice(`「${entity.name}」からプレハブを作成しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            assets: added.manifest,
            prefabs: {
              ...current.present.bundle.prefabs,
              [prefabId]: result.document,
            },
          }),
          assetSelection: assetId,
        });
      });
    },
    [editorMode],
  );

  const handleRemoveRigidBody = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        if (!entity) return scene;
        const components = entity.components.filter(
          (component) =>
            component.id !== componentId || component.type !== "rigid-body",
        );
        if (components.length === entity.components.length) return scene;
        return {
          ...scene,
          entities: {
            ...scene.entities,
            [entityId]: { ...entity, components },
          },
        };
      });
      setNotice("Rigid Bodyを削除しました。子孫の衝突判定は保持されています");
    },
    [editorMode, playSession, updateScene],
  );

  /**
   * Creates a Script Asset and its source file, then opens the editor.
   *
   * The file write happens before the manifest entry is committed so a failed
   * write never leaves a Script Asset pointing at nothing.
   */
  const handleUpdateScriptComponent = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: ScriptComponentPatch,
    ) => {
      const restartsRuntime =
        patch.scriptAssetId !== undefined ||
        patch.assetReferences !== undefined ||
        patch.entityReferences !== undefined ||
        patch.runIn !== undefined;
      setBundle((current) => {
        const entity = current.scene.entities[entityId];
        if (!entity) return current;
        let changed = false;
        const components = entity.components.map((component) => {
          if (component.id !== componentId || component.type !== "script") {
            return component;
          }
          changed = true;
          const switchedScript =
            patch.scriptAssetId !== undefined &&
            patch.scriptAssetId !== component.scriptAssetId;
          const nextContract = switchedScript
            ? scriptContractsRef.current[patch.scriptAssetId!]
            : undefined;
          const resetState = switchedScript
            ? nextContract
              ? createDefaultScriptComponentState(nextContract)
              : {
                  properties: {},
                  assetReferences: [],
                  entityReferences: [],
                }
            : undefined;
          return {
            ...component,
            ...(patch.scriptAssetId !== undefined
              ? { scriptAssetId: patch.scriptAssetId }
              : {}),
            ...(patch.properties !== undefined || resetState
              ? {
                  properties:
                    patch.properties ?? resetState?.properties ?? {},
                }
              : {}),
            ...(patch.assetReferences !== undefined || resetState
              ? {
                  assetReferences:
                    patch.assetReferences ??
                    resetState?.assetReferences ??
                    [],
                }
              : {}),
            ...(patch.entityReferences !== undefined || resetState
              ? {
                  entityReferences:
                    patch.entityReferences ??
                    resetState?.entityReferences ??
                    [],
                }
              : {}),
            ...(patch.runIn !== undefined ? { runIn: patch.runIn } : {}),
          };
        });
        if (!changed) return current;
        setNotice(
          editorMode === "play"
            ? restartsRuntime
              ? `「${entity.name}」のスクリプト設定を反映し、このEntityだけ再起動しました`
              : `「${entity.name}」のスクリプトのプロパティを次のフレームに反映しました`
            : "スクリプトComponentを更新しました",
        );
        return touchProject({
          ...current,
          scene: {
            ...current.scene,
            entities: {
              ...current.scene.entities,
              [entityId]: { ...entity, components },
            },
          },
        });
      });
    },
    [editorMode, setBundle],
  );

  const handleCreateScriptFromTemplate = useCallback(async (
    request: ScriptTemplateCreateRequest,
  ): Promise<boolean> => {
    if (editorMode !== "edit" || scriptTemplateFolderId === undefined) {
      return false;
    }
    if (!projectPathRef.current) {
      setNotice("プロジェクトを保存するとスクリプトを作成できます");
      return false;
    }
    const template = getScriptTemplate(request.templateId);
    const source = createScriptTemplateSource(request.templateId, request.name);
    if (!template || source === null) {
      setNotice("選択したスクリプトのテンプレートを読み込めませんでした");
      return false;
    }
    const currentAssets = bundleRef.current.assets;
    const folderId = scriptTemplateFolderId;
    if (folderId && !currentAssets.folders?.[folderId]) {
      setNotice("作成先のフォルダーが見つかりません。フォルダーを開き直してください");
      return false;
    }
    const name = request.name.trim();
    if (!name) {
      setNotice("スクリプト名を入力してください");
      return false;
    }
    const relativePath = createScriptRelativePath(
      name,
      currentAssets,
      pendingScriptPathsRef.current,
      template.language,
    );
    const asset = createScriptAsset(
      createDocumentId("asset"),
      name,
      relativePath,
      folderId,
      template.language,
    );
    const previewAssets = addScriptAsset(currentAssets, asset);
    const scriptContract = extractScriptContract(source);
    const entityId = request.attachToSelectedEntity
      ? sceneSelectionRef.current?.id
      : undefined;
    const previewScene = bundleRef.current.scene;
    if (entityId) {
      const entity = previewScene.entities[entityId];
      if (!entity) {
        setNotice("Entityが見つかりません。Hierarchyで選び直してください");
        return false;
      }
      const componentResult = addEditorComponent(
        previewScene,
        previewAssets,
        entityId,
        "scripting.script",
        projectKind,
        asset.id,
        { [asset.id]: scriptContract },
      );
      if (!componentResult.added) {
        setNotice(
          componentResult.reason ??
            "選択中のEntityへスクリプトComponentを追加できませんでした",
        );
        return false;
      }
    }
    pendingScriptPathsRef.current.add(relativePath);
    try {
      await tauri.writeTextFile(
        projectPathRef.current,
        relativePath,
        source,
      );
      scriptSourceRevisionRef.current += 1;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `スクリプトを作成できませんでした: ${error.message}`
          : "スクリプトを作成できませんでした",
      );
      return false;
    } finally {
      pendingScriptPathsRef.current.delete(relativePath);
    }
    const templateProvenance = normalizeScriptProvenance({
      kind: "studio-template",
      detail: template.name,
    });
    scriptProvenanceRef.current.set(asset.id, templateProvenance);
    setScriptContractRef.current(asset.id, scriptContract);
    setHistory((current) => {
      const latestBundle = current.present.bundle;
      const latestFolderId =
        folderId && latestBundle.assets.folders?.[folderId] ? folderId : null;
      const committedAsset =
        latestFolderId === asset.folderId
          ? asset
          : { ...asset, folderId: latestFolderId };
      const mergedAssets = addScriptAsset(
        latestBundle.assets,
        committedAsset,
      );
      let mergedScene = latestBundle.scene;
      let attachedEntityName: string | undefined;
      if (entityId && mergedScene.entities[entityId]) {
        const componentResult = addEditorComponent(
          mergedScene,
          mergedAssets,
          entityId,
          "scripting.script",
          projectKind,
          committedAsset.id,
          { [committedAsset.id]: scriptContract },
        );
        if (componentResult.added) {
          mergedScene = componentResult.scene;
          attachedEntityName = latestBundle.scene.entities[entityId]?.name;
        }
      }
      const nextBundle = touchProject({
        ...latestBundle,
        assets: mergedAssets,
        scene: mergedScene,
      });
      bundleRef.current = nextBundle;
      const destination = latestFolderId
        ? `「${latestBundle.assets.folders?.[latestFolderId]?.name ?? "Folder"}」`
        : "Assets直下";
      setNotice(
        attachedEntityName
          ? `${template.name}から「${name}」を${destination}に作成し、「${attachedEntityName}」へ追加しました`
          : entityId
            ? `${template.name}から「${name}」を${destination}に作成しました。選択中のEntityが変わったため、Componentは追加していません`
            : `${template.name}から「${name}」を${destination}に作成しました`,
      );
      return commitEditorHistory(current, {
        ...current.present,
        bundle: nextBundle,
        assetSelection: committedAsset.id,
      });
    });
    setSaveStatus("dirty");
    void scriptOpenRef.current(asset.id, asset);
    return true;
  }, [
    editorMode,
    projectKind,
    scriptEditor,
    scriptTemplateFolderId,
  ]);

  /**
   * Entities an Interactivity Graph can write to.
   *
   * Built here rather than inside the graph editor so the pickers always show
   * the Scene the author is actually looking at, including edits made while the
   * editor is open.
   */
  const interactionTriggerTargets = useMemo(
    () => collectInteractionTriggerTargets(bundle.scene, bundle.assets),
    // The Animation row now comes from the Model's clips, so the manifest is
    // part of the answer: re-importing a Model to add clips has to refresh it.
    [bundle.scene, bundle.assets],
  );

  /**
   * The bundle the graph editor's autosave last produced.
   *
   * Used to decide whether an autosave continues the same editing session. The
   * first write opens one project Undo entry; the rest replace it, because the
   * graph editor has its own per-change undo and a stroke-by-stroke project
   * history would bury every entry an author actually looks for. Any other
   * edit in between ends the session, so nothing unrelated gets folded in.
   */
  const interactivityAutosavedBundleRef = useRef<PrototypeVisualProject | null>(
    null,
  );

  const handleSaveInteractivityAsset = useCallback(
    (
      assetId: string,
      extension: KhrInteractivityExtension,
      options?: { auto?: boolean },
    ) => {
      if (editorMode !== "edit") return;
      const auto = options?.auto === true;
      setHistory((current) => {
        const bundle = current.present.bundle;
        const assets = updateInteractivityAsset(bundle.assets, assetId, extension);
        if (assets === bundle.assets) {
          // Autosave holds a graph the validator refuses rather than reporting
          // it: the editor's own footer already says so, next to the errors.
          if (!auto) {
            setNotice("KHR_interactivity Graphに検証エラーがあるため保存しませんでした");
          }
          return current;
        }
        if (!auto) {
          setNotice("ノードグラフをAssetsに保存しました");
        }
        // The Entities the graph writes to are Component data, so saving the
        // graph is what keeps each trigger's reference list true.
        const nextBundle = touchProject({
          ...bundle,
          assets,
          scene: syncInteractionTriggerReferences(bundle.scene, assets),
        });
        setSaveStatus("dirty");
        const nextPresent = { ...current.present, bundle: nextBundle };
        const continuesSession =
          auto && interactivityAutosavedBundleRef.current === bundle;
        interactivityAutosavedBundleRef.current = auto ? nextBundle : null;
        return continuesSession
          ? replaceEditorHistoryPresent(current, nextPresent)
          : commitEditorHistory(current, nextPresent);
      });
    },
    [editorMode],
  );

  /**
   * The graph draft the editor has not written yet, if any.
   *
   * Play reads the saved Asset, so this is flushed before Play prepares: an
   * author who edits a graph and immediately presses Play would otherwise watch
   * the previous version run, with nothing on screen saying why.
   */
  const pendingInteractivityDraftRef = useRef<{
    assetId: string;
    extension: KhrInteractivityExtension;
  } | null>(null);

  const flushInteractivityDraft = useCallback(() => {
    const pending = pendingInteractivityDraftRef.current;
    if (!pending) return;
    pendingInteractivityDraftRef.current = null;
    handleSaveInteractivityAsset(pending.assetId, pending.extension, {
      auto: true,
    });
  }, [handleSaveInteractivityAsset]);

  const handleSetProjectThumbnailFromAsset = useCallback(
    async (assetId: string) => {
      if (projectThumbnailBusyRef.current) return;
      if (!projectPath) {
        setNotice("プロジェクトを保存するとサムネイルを設定できます");
        return;
      }
      const asset = bundleRef.current.assets.assets[assetId];
      if (!asset || (asset.kind !== "texture" && asset.kind !== "skybox")) {
        setNotice("サムネイルに使用できるテクスチャが見つかりません");
        return;
      }
      projectThumbnailBusyRef.current = true;
      setNotice(`「${asset.name}」をサムネイルに設定中です`);
      try {
        await setProjectThumbnailFromAsset(projectPath, asset);
        onThumbnailChanged?.();
        setSceneSettingsOpen(true);
        setNotice(
          `「${asset.name}」をサムネイルに設定しました。シーン設定で現在の画像を確認できます`,
        );
      } catch (error) {
        setNotice(`サムネイルを設定できませんでした: ${error}`);
      } finally {
        projectThumbnailBusyRef.current = false;
      }
    },
    [onThumbnailChanged, projectPath],
  );

  const handleAssetThumbnailGenerated = useCallback(
    (assetId: string, thumbnail: AssetThumbnailDescriptor) => {
      if (editorModeRef.current !== "edit" || importBusyRef.current) return;
      setHistory((current) => {
        const assets = updateAssetThumbnail(
          current.present.bundle.assets,
          assetId,
          thumbnail,
        );
        if (assets === current.present.bundle.assets) return current;
        const nextBundle = { ...current.present.bundle, assets };
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        return replaceEditorHistoryPresent(current, {
          ...current.present,
          bundle: nextBundle,
        });
      });
    },
    [],
  );

  const handleMaterialThumbnailFailure = useCallback(
    (assetId: string, _message: string) => {
      const asset = bundleRef.current.assets.assets[assetId];
      setNotice(
        asset?.kind === "material"
          ? `「${asset.name}」のサムネイルを更新できませんでした。プロジェクトを開き直すかマテリアルを変更すると再試行します`
          : "マテリアルサムネイルの準備に失敗しました。プロジェクトを開き直すと再試行します",
      );
    },
    [],
  );

  const handleEnvironmentTextureThumbnailFailure = useCallback(
    (assetId: string, _message: string) => {
      const asset = bundleRef.current.assets.assets[assetId];
      setNotice(
        asset?.kind === "texture"
          ? `「${asset.name}」のHDRIプレビューを生成できませんでした。ソースを確認してプロジェクトを開き直すと再試行します`
          : "HDRIプレビューの自動生成に失敗しました。プロジェクトを開き直すと再試行します",
      );
    },
    [],
  );

  const handleModelThumbnailFailure = useCallback(
    (assetId: string, _message: string) => {
      const asset = bundleRef.current.assets.assets[assetId];
      setNotice(
        asset?.kind === "model"
          ? `「${asset.name}」のサムネイルを生成できませんでした。ソースを確認してプロジェクトを開き直すと再試行します`
          : "3Dモデルサムネイルの自動生成に失敗しました。プロジェクトを開き直すと再試行します",
      );
    },
    [],
  );

  const handleUpdatePrefab = useCallback(
    (prefabId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "動作確認を停止してからプレハブを更新してください"
            : "アセットのインポート完了後にプレハブを更新してください",
        );
        return;
      }
      setHistory((current) => {
        const document = current.present.bundle.prefabs[prefabId];
        if (!document) {
          setNotice("更新するプレハブのデータが見つかりません");
          return current;
        }
        const updated = updatePrefabDocumentFromSource(
          current.present.bundle.scene,
          current.present.bundle.assets,
          document,
        );
        if (!updated) {
          setNotice("プレハブの構造を読み取れません");
          return current;
        }
        setSaveStatus("dirty");
        setNotice(`「${document.name}」に現在の構造を反映しました`);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({
            ...current.present.bundle,
            prefabs: {
              ...current.present.bundle.prefabs,
              [prefabId]: updated.document,
            },
          }),
        });
      });
    },
    [editorMode, importBusy],
  );

  /**
   * Puts this graph on an Entity, or gives that Entity what it still needs.
   *
   * A graph runs because an Interaction Trigger on some Entity points at it —
   * true even for a graph that starts itself. Nothing in the editor said so,
   * so the usual first experience was to wire a graph, press Play, and watch
   * nothing happen.
   */
  const handleAttachInteractivityAsset = useCallback(
    (entityId: string, assetId: string) => {
      if (editorMode !== "edit") return;
      setBundle((current) => {
        const result = addEditorComponent(
          current.scene,
          current.assets,
          entityId,
          "interaction.trigger",
          projectKind,
          assetId,
        );
        if (!result.added) return current;
        return touchProject({
          ...current,
          scene: syncInteractionTriggerReferences(
            result.scene,
            current.assets,
          ),
        });
      });
      const name = bundleRef.current.scene.entities[entityId]?.name ?? "Entity";
      setNotice(`${name}へこのグラフを付けました`);
    },
    [editorMode, projectKind, setBundle],
  );

  const handleAddComponent = useCallback(
    (entityId: string, componentDefinitionId: string) => {
      const fallbackParticleId = createDocumentId("particle");
      // Decided before the update so the editor can be opened afterwards: a
      // state updater may run later than this callback, and reading its result
      // from a captured variable would open nothing on the first click.
      const needsInteractivityAsset =
        componentDefinitionId === "interaction.trigger" &&
        !Object.values(bundleRef.current.assets.assets).some(
          (asset) => asset.kind === "interactivity",
        );
      const createdInteractivityAssetId = needsInteractivityAsset
        ? createDocumentId("asset")
        : null;
      setBundle((current) => {
        let assets = current.assets;
        let createdParticle = false;
        let createdGraph = false;
        // The same courtesy the Particle Emitter gets: a Component whose whole
        // job is to run a graph is useless without one, so the graph is created
        // here rather than sending the author to Assets and back.
        if (createdInteractivityAssetId) {
          const added = addDefaultInteractivityAsset(assets, {
            id: createdInteractivityAssetId,
            name: "新規ノードグラフ 1",
            folderId: null,
          });
          if (added.added) {
            assets = updateInteractivityAsset(
              added.manifest,
              added.assetId,
              createInteractionTriggerGraphExtension(),
            );
            createdGraph = true;
          }
        }
        if (
          componentDefinitionId === "core.particle" &&
          !Object.values(assets.assets).some((asset) => asset.kind === "particle")
        ) {
          const added = addDefaultParticleAsset(assets, {
            id: fallbackParticleId,
            name: "新規パーティクル 1",
          });
          if (added.added) {
            assets = added.manifest;
            createdParticle = true;
          }
        }
        const result = addEditorComponent(
          current.scene,
          assets,
          entityId,
          componentDefinitionId,
          projectKind,
          componentDefinitionId === "scripting.script" ||
          componentDefinitionId === "interaction.trigger" ||
          componentDefinitionId === "core.image"
            ? createdInteractivityAssetId ?? assetSelection ?? undefined
            : undefined,
          componentDefinitionId === "scripting.script"
            ? scriptContractsRef.current
            : undefined,
        );
        if (!result.added) {
          const reason =
            result.reason === "duplicate"
              ? "同じComponentは重複追加できません"
              : result.reason === "project-kind"
                ? "このプロジェクト種別では追加できません"
                : result.reason === "dependency-missing"
                  ? componentDefinitionId === "scripting.script"
                    ? "Assetsでスクリプトを作成してください"
                    : componentDefinitionId === "interaction.trigger"
                      ? "Assetsでノードグラフを作成してください"
                      : "必要なメッシュまたは素材がありません"
                  : "Componentを追加できませんでした";
          setNotice(reason);
          return current;
        }
        setNotice(
          createdParticle
            ? "パーティクルを作成し、Particle Emitterを追加しました"
            : createdGraph
              ? "ノードグラフを作成し、Interaction Triggerを追加しました"
              : "Componentを追加しました",
        );
        return touchProject({ ...current, assets, scene: result.scene });
      });
      // A graph created for this Component is empty apart from its entry point,
      // so the next step is always the node editor. Opening it is what keeps
      // "追加した" from ending at a card the author has to hunt through.
      if (createdInteractivityAssetId) {
        setInteractivityEditorAssetId(createdInteractivityAssetId);
        setGraphTabActive(true);
      }
    },
    [assetSelection, editorMode, projectKind, setBundle],
  );

  const handleUpdateXriftComponent = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: UpdateXriftComponentPatch,
    ) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        const result = updateXriftComponent(
          scene,
          entityId,
          componentId,
          patch,
          projectKind,
        );
        if (!result.changed) {
          setNotice(
            result.diagnostics[0]?.message ??
              "XRiftのComponentを更新できませんでした",
          );
          return scene;
        }
        const error = result.diagnostics.find(
          (diagnostic) => diagnostic.severity === "error",
        );
        setNotice(
          error?.message ??
            (editorMode === "play"
              ? "設定を保存し、このEntityの動作確認をやり直しました"
              : "設定を反映しました"),
        );
        return result.scene;
      });
    },
    [editorMode, playSession, projectKind, updateScene],
  );

  const handleRemoveXriftComponent = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) => {
        const result = removeXriftComponent(scene, entityId, componentId);
        if (!result.changed) {
          setNotice(
            result.diagnostics[0]?.message ??
              "XRiftのComponentを削除できませんでした",
          );
          return scene;
        }
        setNotice(
          editorMode === "play"
            ? "Componentを削除し、このEntityの動作確認をやり直しました"
            : "XRiftのComponentを削除しました",
        );
        return result.scene;
      });
    },
    [editorMode, playSession, updateScene],
  );

  // Transform以外のComponentは、種類ごとの専用ボタンを増やさずここでまとめて外す。
  const handleRemoveComponent = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" && !playSession) return;
      const entity = bundleRef.current.scene.entities[entityId];
      const target = entity?.components.find(
        (component) => component.id === componentId,
      );
      if (!target) return;
      if (target.type === "transform") {
        setNotice("TransformはEntityに必須のため削除できません");
        return;
      }
      if (target.type === "xrift-component") {
        handleRemoveXriftComponent(entityId, componentId);
        return;
      }
      updateScene((scene) => {
        const current = scene.entities[entityId];
        if (!current) return scene;
        const components = current.components.filter(
          (component) => component.id !== componentId,
        );
        if (components.length === current.components.length) return scene;
        return {
          ...scene,
          entities: {
            ...scene.entities,
            [entityId]: { ...current, components },
          },
        };
      });
      const label = getEditorComponentLabel(target);
      setNotice(
        editorMode === "play"
          ? `${label}を削除し、このEntityの動作確認を先頭から再実行しました`
          : `${label}を削除しました。取り消すには「元に戻す」を使ってください`,
      );
    },
    [editorMode, handleRemoveXriftComponent, playSession, updateScene],
  );

  const handleSelectAsset = useCallback((assetId: string) => {
    setSceneSettingsOpen(false);
    setAssetSelection(assetId);
    if (tablet) { setTabletPanel("inspector"); setViewportMaximized(false); }
    setNotice("Inspectorで素材を開きました。シーン内の選択は維持しています");
  }, [tablet]);

  const requestRename = useCallback(
    (kind: "entity" | "asset" | "folder", id: string) => {
      setRenameTarget({ kind, id, requestId: Date.now() });
    },
    [],
  );

  const commitRename = useCallback(
    (target: Exclude<RenameTarget, null>, name: string) => {
      if (editorMode !== "edit") return;
      if (target.kind === "entity") {
        updateScene((scene) => renameEntity(scene, target.id, name));
      } else {
        setBundle((current) => {
          const assets =
            target.kind === "asset"
              ? renameAsset(current.assets, target.id, name)
              : renameAssetFolder(current.assets, target.id, name);
          return assets === current.assets
            ? current
            : touchProject({ ...current, assets });
        });
      }
      setRenameTarget(null);
      setNotice("名前を変更しました");
    },
    [editorMode, setBundle, updateScene],
  );

  const processImportQueue = useCallback(
    async (targetProjectPath: string) => {
      if (
        !targetProjectPath ||
        importRunningRef.current ||
        assetOperationRef.current?.kind === "model-reimport" ||
        editorMode !== "edit"
      ) {
        return;
      }
      const operationToken = Symbol("asset-import");
      assetOperationRef.current = {
        kind: "asset-import",
        token: operationToken,
      };
      importRunningRef.current = true;
      let workingManifest = bundleRef.current.assets;
      const knownByHash = new Map(
        Object.values(workingManifest.assets)
          .filter((asset) => asset.sourceHash)
          .map((asset) => [asset.sourceHash as string, asset]),
      );

      try {
        while (true) {
          const queued = importQueueRef.current.find(
            (entry) =>
              entry.status === "queued" || entry.status === "waiting-save",
          );
          if (!queued) break;
          const sourceFile = queued.file;
          if (!sourceFile) {
            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                  ? {
                      ...entry,
                      status: "failed",
                      progress: 100,
                      diagnostics: [
                        {
                          severity: "blocking",
                          code: "asset-import-source-released",
                          message: "読み込み元ファイルを読み直してください",
                        },
                      ],
                    }
                  : entry,
              ),
            );
            continue;
          }

          updateImportQueue((current) =>
            current.map((entry) =>
              entry.id === queued.id
                ? {
                    ...entry,
                    status: "reading",
                    progress: 12,
                    diagnostics: [],
                  }
                : entry,
            ),
          );

          try {
            const bytes = await sourceFile.arrayBuffer();
            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                  ? { ...entry, status: "processing", progress: 38 }
                  : entry,
              ),
            );
            const folderId = queued.folderId &&
              workingManifest.folders?.[queued.folderId]
              ? queued.folderId
              : null;
            if (
              queued.resourceKind === "unity-package" ||
              isUnityImportFileName(sourceFile.name)
            ) {
              const unityPlan = await createUnityPackageImportPlan({
                fileName: sourceFile.name,
                bytes,
                bundle: bundleRef.current,
                parentFolderId: folderId,
                onProgress: (progress) => {
                  updateImportQueue((current) =>
                    current.map((entry) =>
                      entry.id === queued.id
                        ? {
                            ...entry,
                            status: "processing",
                            progress: Math.max(18, Math.min(78, progress)),
                          }
                        : entry,
                    ),
                  );
                },
              });
              const unityDiagnostics = unityPlan.diagnostics.map(
                ({ severity, code, message }) => ({ severity, code, message }),
              );
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        progress: 80,
                        sourceHash: unityPlan.sourceHash || undefined,
                        assetId: unityPlan.selectedAssetId,
                        diagnostics: unityDiagnostics,
                      }
                    : entry,
                ),
              );
              if (!unityPlan.canCommit) {
                updateImportQueue((current) =>
                  current.map((entry) =>
                    entry.id === queued.id
                      ? {
                          ...entry,
                          status: "failed",
                          progress: 100,
                          file: null,
                        }
                      : entry,
                  ),
                );
                setNotice(
                  unityPlan.diagnostics.find(
                    (diagnostic) => diagnostic.severity === "blocking",
                  )?.message ?? `${queued.name}を変換できませんでした`,
                );
                continue;
              }

              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? { ...entry, status: "committing", progress: 88 }
                    : entry,
                ),
              );
              await commitAssetImportPlansToDisk(
                targetProjectPath,
                unityPlan.assetCommitBaseManifest,
                unityPlan.assetPlans,
              );
              workingManifest = unityPlan.assets;
              Object.values(workingManifest.assets).forEach((asset) => {
                if (asset.sourceHash) knownByHash.set(asset.sourceHash, asset);
              });
              setHistory((current) => {
                const nextBundle = touchProject({
                  ...current.present.bundle,
                  scene: unityPlan.scene,
                  assets: unityPlan.assets,
                  prefabs: unityPlan.prefabs,
                });
                bundleRef.current = nextBundle;
                setSaveStatus("dirty");
                return commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection:
                    unityPlan.selectedAssetId ?? current.present.assetSelection,
                  sceneSelection:
                    unityPlan.result.entityCount > 0 && unityPlan.scene.rootEntityIds.length > 0
                      ? {
                          kind: "entity",
                          id:
                            unityPlan.scene.rootEntityIds[
                              unityPlan.scene.rootEntityIds.length - 1
                            ],
                        }
                      : current.present.sceneSelection,
                });
              });
              const selectedAsset = unityPlan.selectedAssetId
                ? unityPlan.assets.assets[unityPlan.selectedAssetId]
                : undefined;
              setActiveAssetFolderId(selectedAsset?.folderId ?? null);
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        status: "succeeded",
                        progress: 100,
                        file: null,
                        assetId: unityPlan.selectedAssetId,
                        diagnostics: unityDiagnostics,
                        result: {
                          materialCount: unityPlan.result.materialCount,
                          textureCount: 0,
                          prefabCount: unityPlan.result.prefabCount,
                          entityCount: unityPlan.result.entityCount,
                          assetCount: unityPlan.result.assetCount,
                          warningCount: unityPlan.result.warningCount,
                        },
                      }
                    : entry,
                ),
              );
              setNotice(
                `「${queued.name}」からプレハブ ${unityPlan.result.prefabCount}件、Entity ${unityPlan.result.entityCount}件、素材 ${unityPlan.result.assetCount}件を再構築しました`,
              );
              continue;
            }
            if (queued.resourceKind === "shader") {
              const source = await sourceFile.text();
              const sourceHash = await sha256AssetBytes(bytes);
              const duplicate = knownByHash.get(sourceHash);
              if (duplicate?.kind === "shader") {
                setHistory((current) =>
                  replaceEditorHistoryPresent(current, {
                    ...current.present,
                    assetSelection: duplicate.id,
                  }),
                );
                setActiveAssetFolderId(duplicate.folderId ?? null);
                updateImportQueue((current) =>
                  current.map((entry) =>
                    entry.id === queued.id
                      ? {
                          ...entry,
                          status: "duplicate",
                          progress: 100,
                          file: null,
                          assetId: duplicate.id,
                          sourceHash,
                          diagnostics: [
                            {
                              severity: "warning",
                              code: "duplicate-source-hash",
                              message: `同じ内容のシェーダー素材「${duplicate.name}」を選択しました。`,
                            },
                          ],
                        }
                      : entry,
                  ),
                );
                setNotice(`同じ内容のシェーダー素材「${duplicate.name}」は登録済みです`);
                continue;
              }
              if (!source.trim()) {
                updateImportQueue((current) =>
                  current.map((entry) =>
                    entry.id === queued.id
                      ? {
                          ...entry,
                          status: "failed",
                          progress: 100,
                          file: null,
                          sourceHash,
                          diagnostics: [
                            {
                              severity: "blocking",
                              code: "shader-source-empty",
                              message: "GLSLファイルが空です",
                            },
                          ],
                        }
                      : entry,
                  ),
                );
                setNotice(`${queued.name}をシェーダー素材にできませんでした`);
                continue;
              }
              const relativePath = createShaderRelativePath(
                sourceFile.name,
                workingManifest,
              );
              const imported = createShaderAsset(
                createDocumentId("shader"),
                sourceFile.name.replace(/\.[^.]+$/, "") || "Shader",
                relativePath,
                sourceHash,
                folderId,
                shaderStageFromFileName(sourceFile.name),
              );
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        status: "committing",
                        progress: 82,
                        sourceHash,
                        assetId: imported.id,
                      }
                    : entry,
                ),
              );
              await tauri.writeTextFile(
                targetProjectPath,
                relativePath,
                source,
              );
              workingManifest = addShaderAsset(workingManifest, imported);
              knownByHash.set(sourceHash, imported);
              setHistory((current) => {
                const nextBundle = touchProject({
                  ...current.present.bundle,
                  assets: workingManifest,
                });
                bundleRef.current = nextBundle;
                setSaveStatus("dirty");
                return commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection: imported.id,
                });
              });
              setActiveAssetFolderId(imported.folderId ?? null);
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        status: "succeeded",
                        progress: 100,
                        file: null,
                        assetId: imported.id,
                        result: {
                          materialCount: 0,
                          textureCount: 0,
                          shaderCount: 1,
                        },
                      }
                    : entry,
                ),
              );
              setNotice(`「${imported.name}」をGLSL シェーダー素材としてインポートしました`);
              continue;
            }
            // Sidecars stay out of the manifest as standalone Assets: the
            // converter embeds them, and the resulting GLB derives its own
            // Material and Texture Assets.
            const companionFiles: ThreeModelCompanionFile[] = await Promise.all(
              queued.companions.map(async (companion) => ({
                relativePath: importBatchPath(companion),
                bytes: new Uint8Array(await companion.arrayBuffer()),
                ...(companion.type ? { mimeType: companion.type } : {}),
              })),
            );
            // 取り込み時の最大解像度・圧縮方式は、単体のTextureにもモデル内蔵の
            // Textureにも同じように入れる。取り込み後に編集用画像へ適用され、
            // シーンと公開の両方がその画像を使う。元画像は保持する。
            const textureImportSettings = textureImportSettingsPatch(
              textureImportMaxSizeRef.current,
              textureImportCompressionRef.current,
            );
            const plan = await createAssetImportPlan({
              fileName: sourceFile.name,
              bytes,
              mimeType: sourceFile.type,
              folderId,
              existingManifest: workingManifest,
              ...(companionFiles.length > 0 ? { companionFiles } : {}),
              ...(textureImportSettings ? { textureImportSettings } : {}),
              preferredKind:
                queued.resourceKind === "model" ||
                queued.resourceKind === "texture"
                  ? queued.resourceKind
                  : undefined,
            });
            const diagnostics = plan.diagnostics.map(
              ({ severity, code, message }) => ({ severity, code, message }),
            );
            updateImportQueue((current) =>
              current
                .filter(
                  (entry) =>
                    entry.id === queued.id ||
                    entry.name.toLocaleLowerCase() !==
                      queued.name.toLocaleLowerCase() ||
                    entry.sourceHash !== plan.sourceHash ||
                    ![
                      "succeeded",
                      "updated",
                      "duplicate",
                      "failed",
                    ].includes(entry.status),
                )
                .map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        progress: 68,
                        sourceHash: plan.sourceHash || undefined,
                        assetId: plan.asset?.id,
                        diagnostics,
                      }
                    : entry,
                ),
            );

            if (!plan.canCommit || !plan.asset) {
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        status: "failed",
                        progress: 100,
                        file: null,
                      }
                    : entry,
                ),
              );
              setNotice(
                plan.diagnostics.find(
                  (diagnostic) => diagnostic.severity === "blocking",
                )?.message ?? `${queued.name}を読み込めませんでした`,
              );
              continue;
            }

            const duplicate = knownByHash.get(plan.sourceHash);
            if (
              duplicate &&
              duplicate.kind === plan.asset.kind &&
              !plan.replacesAssetId
            ) {
              setHistory((current) => {
                if (!isEnvironmentTextureAsset(duplicate)) {
                  return replaceEditorHistoryPresent(current, {
                    ...current.present,
                    assetSelection: duplicate.id,
                  });
                }
                const scene = assignSkyboxToScene(
                  current.present.bundle.scene,
                  duplicate.id,
                );
                if (scene === current.present.bundle.scene) {
                  return replaceEditorHistoryPresent(current, {
                    ...current.present,
                    assetSelection: duplicate.id,
                  });
                }
                const nextBundle = touchProject({
                  ...current.present.bundle,
                  scene,
                });
                bundleRef.current = nextBundle;
                setSaveStatus("dirty");
                return commitEditorHistory(current, {
                  ...current.present,
                  bundle: nextBundle,
                  assetSelection: duplicate.id,
                });
              });
              setActiveAssetFolderId(duplicate.folderId ?? null);
              updateImportQueue((current) =>
                current.map((entry) =>
                  entry.id === queued.id
                    ? {
                        ...entry,
                        status: "duplicate",
                        progress: 100,
                        file: null,
                        assetId: duplicate.id,
                        diagnostics: [
                          {
                            severity: "warning",
                            code: "duplicate-source-hash",
                            message: `同じ内容のアセット「${duplicate.name}」があるため、既存のものを選択しました。`,
                          },
                          ...entry.diagnostics,
                        ],
                      }
                    : entry,
                ),
              );
              setNotice(
                isEnvironmentTextureAsset(duplicate)
                  ? `登録済みの「${duplicate.name}」をSkyboxへ設定しました`
                  : `同じ内容のアセット「${duplicate.name}」は登録済みです`,
              );
              continue;
            }

            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                  ? { ...entry, status: "committing", progress: 84 }
                  : entry,
              ),
            );
            const committedManifest = await commitAssetImportPlanToDisk(
              targetProjectPath,
              workingManifest,
              plan,
            );
            const importedAsset = committedManifest.assets[plan.asset.id];
            if (!importedAsset) {
              throw new Error("読み込んだ素材をプロジェクトに登録できませんでした");
            }
            workingManifest = committedManifest;
            knownByHash.set(plan.sourceHash, importedAsset);
            setHistory((current) => {
              const scene = isEnvironmentTextureAsset(importedAsset)
                ? assignSkyboxToScene(
                    current.present.bundle.scene,
                    importedAsset.id,
                  )
                : current.present.bundle.scene;
              const nextBundle = touchProject({
                ...current.present.bundle,
                assets: committedManifest,
                scene,
              });
              bundleRef.current = nextBundle;
              setSaveStatus("dirty");
              return commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                assetSelection: importedAsset.id,
              });
            });
            setActiveAssetFolderId(importedAsset.folderId ?? null);
            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                    ? {
                        ...entry,
                        status: plan.replacesAssetId ? "updated" : "succeeded",
                        progress: 100,
                        file: null,
                        assetId: importedAsset.id,
                        result: {
                          materialCount:
                            plan.derivedAssets?.filter(
                              (asset) => asset.kind === "material",
                            ).length ?? 0,
                          textureCount:
                            plan.derivedAssets?.filter(
                              (asset) => asset.kind === "texture",
                            ).length ?? 0,
                        },
                      }
                  : entry,
              ),
            );
            setNotice(
              isEnvironmentTextureAsset(importedAsset)
                ? `「${importedAsset.name}」をインポートし、Skyboxへ設定しました`
                : plan.replacesAssetId
                  ? `「${importedAsset.name}」を更新し、マテリアルとテクスチャの参照を維持しました`
                  : `「${importedAsset.name}」をインポートし、マテリアル ${plan.derivedAssets?.filter((asset) => asset.kind === "material").length ?? 0}件、テクスチャ ${plan.derivedAssets?.filter((asset) => asset.kind === "texture").length ?? 0}件を展開しました`,
            );
          } catch (error) {
            const message = sanitizedImportMessage(error, targetProjectPath);
            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                  ? {
                      ...entry,
                      status: "failed",
                      progress: 100,
                      file: null,
                      diagnostics: [
                        ...entry.diagnostics,
                        {
                          severity: "blocking",
                          code: "asset-import-failed",
                          message,
                        },
                      ],
                    }
                  : entry,
              ),
            );
            setNotice(`${queued.name}の読み込みに失敗しました: ${message}`);
          }
        }
      } finally {
        importRunningRef.current = false;
        if (assetOperationRef.current?.token === operationToken) {
          assetOperationRef.current = null;
        }
      }
    },
    [editorMode, updateImportQueue],
  );

  const handleQueueFiles = useCallback(async (files: File[]) => {
    const availability = resolveAssetOperationAvailability("asset-import", {
      readOnly: editorMode !== "edit",
      assetImportActive:
        importRunningRef.current || hasActiveAssetImport(importQueueRef.current),
      modelReimportActive:
        assetOperationRef.current?.kind === "model-reimport",
      textureProcessingActive:
        assetOperationRef.current?.kind === "texture-processing",
    });
    if (!availability.allowed) {
      setNotice(availability.disabledReason);
      return;
    }
    // A `.gltf` or `.obj` dropped together with its sidecars is normalized as
    // one self-contained Model instead of failing on a missing dependency and
    // importing the sidecars as unrelated Texture Assets.
    const companionPlan = await planModelCompanionBatch(
      files.map((file) => ({
        path: importBatchPath(file),
        readText: () => file.text(),
      })),
    );
    const companionPaths = new Set(companionPlan.consumedPaths);
    const filesByBatchPath = new Map(
      files.map((file) => [importBatchPath(file), file] as const),
    );

    const accepted: Array<{
      file: File;
      resourceKind: PendingImport["resourceKind"];
    }> = [];
    const unsupported: File[] = [];
    for (const file of files) {
      if (companionPaths.has(importBatchPath(file))) continue;
      if (PROJECT_PACKAGE_EXTENSION_PATTERN.test(file.name)) {
        accepted.push({ file, resourceKind: "unity-package" });
        continue;
      }
      const kind = kindForPath(file.name);
      const resourceKind = kind ? IMPORT_RESOURCE_KIND[kind] : undefined;
      if (resourceKind) accepted.push({ file, resourceKind });
      else unsupported.push(file);
    }

    if (unsupported.length > 0) {
      const names = unsupported.slice(0, 3).map((file) => file.name).join("、");
      setImportError(
        `${names}${unsupported.length > 3 ? " ほか" : ""} は対象外です。Unity、Three.js Editor対応モデル、画像、HDR / EXR、MP3 / WAV、フォント（.ttf / .otf / .woff）、GLSL（.glsl / .vert / .frag）に対応します。`,
      );
    } else {
      setImportError(null);
    }
    if (accepted.length === 0) return;

    const targetFolderId = activeAssetFolderId &&
      bundleRef.current.assets.folders?.[activeAssetFolderId]
      ? activeAssetFolderId
      : null;
    const queued = accepted.map(({ file, resourceKind }) => ({
        id: createDocumentId("pending-import"),
        name: file.name,
        size: file.size,
        resourceKind,
        status: projectPath ? "queued" as const : "waiting-save" as const,
        progress: 0,
        diagnostics: [],
        file,
        folderId: targetFolderId,
        companions: (
          companionPlan.companionsByModelPath[importBatchPath(file)] ?? []
        )
          .map((path) => filesByBatchPath.get(path))
          .filter((companion): companion is File => companion !== undefined),
      }));
    updateImportQueue((current) => [...current, ...queued]);
    if (projectPath) {
      setNotice(
        companionPaths.size > 0
          ? `アセット${accepted.length}件のインポートを開始しました。依存ファイル${companionPaths.size}件を3Dモデルへ同梱します`
          : `アセット${accepted.length}件のインポートを開始しました`,
      );
      void processImportQueue(projectPath);
    } else {
      setNotice("初回の自動保存完了後にアセットをインポートします");
    }
  }, [
    activeAssetFolderId,
    editorMode,
    processImportQueue,
    projectPath,
    updateImportQueue,
  ]);

  /**
   * Play now has an awaited preparation step: Script Assets are compiled
   * first, and a scene whose scripts do not compile stays in Edit instead of
   * starting broken. See MI-70.
   */
  const enterPlayMode = useCallback(async (
    options: EnterPlayModeOptions = {},
  ): Promise<EnterPlayModeResult> => {
    const stopped = (
      errors: ScriptCompileError[] = [],
      approvalRequired = approvalRequiredSnapshots(errors),
    ): EnterPlayModeResult => ({
      started: false,
      errors,
      approvalRequired,
      skippedAssetIds: [],
    });
    if (importBusy && !options.ignoreImportBusy) {
      setNotice("アセットのインポート完了後に動作確認を開始できます");
      return stopped();
    }
    if (playPreparationActiveRef.current) return stopped();
    playPreparationActiveRef.current = true;
    const preparationGeneration =
      playPreparationGenerationRef.current + 1;
    playPreparationGenerationRef.current = preparationGeneration;
    const preparationScopeInput = {
      ...scriptExecutionScopeInputRef.current,
    };
    const preparationIsCurrent = (): boolean =>
      playPreparationGenerationRef.current === preparationGeneration &&
      sameScriptExecutionScopeInput(
        scriptExecutionScopeInputRef.current,
        preparationScopeInput,
      );
    const stoppedForScopeChange = (): EnterPlayModeResult => {
      activePlayUnapprovedPolicyRef.current = "block";
      preparedScriptRuntimeInputKeyRef.current = null;
      setPlaySession(null);
      setEditorMode("edit");
      scriptRuntime.reset();
      setNotice(
        "プロジェクトの実行範囲が変わったため動作確認準備を中止しました。現在のプロジェクトで改めて動作確認してください",
      );
      return stopped();
    };
    setCreateMenuOpen(false);
    setRenameTarget(null);
    // Play reads the saved Assets. A graph edited in the last few hundred
    // milliseconds is still a draft, and running its previous version is
    // exactly the confusion autosave exists to remove.
    flushInteractivityDraft();

    setPlayPreparing(true);
    try {
      const writeDeadline = performance.now() + 5_000;
      while (
        pendingScriptPathsRef.current.size > 0 &&
        performance.now() < writeDeadline
      ) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 10);
        });
        if (!preparationIsCurrent()) {
          return stoppedForScopeChange();
        }
      }
      if (pendingScriptPathsRef.current.size > 0) {
        setNotice(
          "スクリプトを保存中のため動作確認を開始できません。保存完了後にもう一度開始してください",
        );
        return stopped();
      }
      // Script source lives outside the document bundle. Re-check both the
      // bundle identity and an explicit source revision after every awaited
      // compile so Play can never pair a new Scene with stale modules.
      let unapprovedPolicy = options.unapprovedPolicy ?? "block";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        while (
          pendingScriptPathsRef.current.size > 0 &&
          performance.now() < writeDeadline
        ) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 10);
          });
          if (!preparationIsCurrent()) {
            return stoppedForScopeChange();
          }
        }
        if (pendingScriptPathsRef.current.size > 0) break;
        const preparingBundle = bundleRef.current;
        const preparingSourceRevision = scriptSourceRevisionRef.current;
        const currentResolvedScriptScene = resolvePrefabInstances(
          preparingBundle.scene,
          preparingBundle.assets,
          preparingBundle.prefabs,
        ).scene;
        const errors = await scriptRuntime.compile({
          scene: currentResolvedScriptScene,
          assets: preparingBundle.assets,
          unapprovedPolicy,
        });
        if (!preparationIsCurrent()) {
          return stoppedForScopeChange();
        }
        if (
          bundleRef.current !== preparingBundle ||
          scriptSourceRevisionRef.current !== preparingSourceRevision ||
          pendingScriptPathsRef.current.size > 0
        ) {
          continue;
        }
        const blockingErrors = blockingScriptCompileErrors(errors);
        if (blockingErrors.length > 0) {
          setNotice(
            `スクリプトを変換できないため動作確認を開始しません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`,
          );
          return stopped(errors);
        }
        if (!preparationIsCurrent()) {
          return stoppedForScopeChange();
        }
        activePlayUnapprovedPolicyRef.current = unapprovedPolicy;
        preparedScriptRuntimeInputKeyRef.current = createScriptRuntimeInputKey(
          currentResolvedScriptScene,
          preparingBundle.assets,
        );
        setPlaySession(
          createPlaySession(preparingBundle.scene, preparingBundle.assets),
        );
        setEditorMode("play");
        setNotice(
          projectKind === "world"
              ? "ワールドの動作確認を開始しました"
              : "アイテムの動作確認を開始しました",
        );
        return {
          started: true,
          errors,
          approvalRequired: [],
          skippedAssetIds: [],
        };
      }
      setNotice(
        "動作確認準備中にスクリプトまたはシーンが続けて更新されました。更新が落ち着いてからもう一度開始してください",
      );
      return stopped();
    } finally {
      if (
        playPreparationGenerationRef.current === preparationGeneration
      ) {
        playPreparationActiveRef.current = false;
        setPlayPreparing(false);
      }
    }
  }, [
    flushInteractivityDraft,
    importBusy,
    projectKind,
    scriptRuntime,
  ]);

  const stopPlayMode = useCallback(() => {
    playPreparationGenerationRef.current += 1;
    activePlayUnapprovedPolicyRef.current = "block";
    playPreparationActiveRef.current = false;
    preparedScriptRuntimeInputKeyRef.current = null;
    setPlaySession(null);
    setEditorMode("edit");
    // Script modules own blob URLs and event subscriptions that React unmount
    // does not release, so Stop disposes them explicitly.
    scriptRuntime.reset();
    setNotice("動作確認を停止しました。動作確認中の状態を破棄し、編集カメラへ戻りました");
  }, [scriptRuntime]);
  enterPlayModeRef.current = enterPlayMode;
  stopPlayModeRef.current = stopPlayMode;

  playingRef.current = editorMode === "play";

  const runSave = useCallback(async (): Promise<string | undefined> => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    return requestAutosave(bundleRef.current);
  }, [requestAutosave]);

  useEffect(() => {
    if (!onProjectExport) return;
    const saveBeforeSuspending = () => {
      flushInteractivityDraft();
      void runSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveBeforeSuspending();
    };
    window.addEventListener("pagehide", saveBeforeSuspending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", saveBeforeSuspending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onProjectExport, flushInteractivityDraft, runSave]);

  const handleSaveBeforeImport = useCallback(async () => {
    const savedProjectPath = await runSave();
    if (savedProjectPath) await processImportQueue(savedProjectPath);
  }, [processImportQueue, runSave]);

  const handleRemovePendingImport = useCallback(
    (id: string) => {
      updateImportQueue((current) =>
        current.filter((entry) =>
          entry.id !== id || importIsActive(entry.status),
        ),
      );
    },
    [updateImportQueue],
  );

  useEffect(() => {
    if (!projectPath || editorMode !== "edit") return;
    if (
      importQueueRef.current.some(
        (entry) =>
          entry.status === "waiting-save" || entry.status === "queued",
      )
    ) {
      void processImportQueue(projectPath);
    }
  }, [editorMode, processImportQueue, projectPath]);

  const runUpload = useCallback(async () => {
    if (!onUpload) {
      // The host injects the upload path, so a missing callback means this
      // environment has none wired rather than a programming mistake. Say
      // which environment it is instead of naming an internal callback.
      const capabilities = describeVisualUploadCapabilities();
      setNotice(
        capabilities.environment === "web"
          ? "ブラウザ版はビルド済みランタイムシェルが必要なため、まだアップロードできません。デスクトップ版から公開してください。"
          : "アップロード処理がこの画面に接続されていません。",
      );
      return;
    }
    try {
      await onUpload(bundle);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "アップロードに失敗しました");
    }
  }, [bundle, onUpload]);

  const runClassicExport = useCallback(async () => {
    if (!onClassicExport) {
      setNotice("コードエディターへの書き出しはデスクトップ版で利用できます");
      return;
    }
    try {
      await onClassicExport(bundle);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "コードエディターへの書き出しを開始できませんでした",
      );
    }
  }, [bundle, onClassicExport]);

  const runProjectExport = async () => {
    if (!onProjectExport || projectExportLock.current || projectTransferBusy || importBusy || editorMode !== "edit") return;
    if (scriptEditorDirtyRef.current || scriptEditorSavingRef.current || shaderEditorDirtyRef.current) {
      setNotice("スクリプトとShaderの変更を保存してから、プロジェクトを書き出してください。");
      return;
    }
    projectExportLock.current = true;
    setProjectExportBusy(true);
    try {
      flushInteractivityDraft();
      if (onSaveRef.current && !(await runSave())) return;
      await onProjectExport(bundleRef.current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "プロジェクトを書き出せませんでした。もう一度お試しください。");
    } finally {
      projectExportLock.current = false;
      setProjectExportBusy(false);
    }
  };

  const runProjectImport = async () => {
    if (!onProjectImport || projectExportLock.current || projectTransferBusy || importBusy || editorMode !== "edit") return;
    if (scriptEditorDirtyRef.current || scriptEditorSavingRef.current || shaderEditorDirtyRef.current) {
      setNotice("スクリプトとShaderの変更を保存してから、別のプロジェクトを開いてください。");
      return;
    }
    projectExportLock.current = true;
    setProjectExportBusy(true);
    try {
      flushInteractivityDraft();
      if (onSaveRef.current && !(await runSave())) return;
      await onProjectImport();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "プロジェクトを開けませんでした。もう一度お試しください。");
    } finally {
      projectExportLock.current = false;
      setProjectExportBusy(false);
    }
  };

  const beginResize = (
    kind: "hierarchy" | "inspector" | "assets",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const bounds = mainRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();

    const handleMove = (pointerEvent: PointerEvent) => {
      setLayout((current) => {
        const next = { ...current };
        if (kind === "hierarchy") {
          next.hierarchyWidth = Math.max(
            150,
            Math.min(280, pointerEvent.clientX - bounds.left),
          );
        } else if (kind === "inspector") {
          next.inspectorWidth = Math.max(
            280,
            Math.min(460, bounds.right - pointerEvent.clientX),
          );
        } else {
          next.assetsHeight = Math.max(
            160,
            Math.min(340, bounds.bottom - pointerEvent.clientY),
          );
        }
        onLayoutChange?.(next);
        return next;
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const executeCommand = useCallback(
    (commandId: EditorCommandId, payload: EditorCommandPayload = {}): boolean => {
      switch (commandId) {
        case "project.save":
          if (!onSaveRef.current || saveStatus === "saving") return false;
          void runSave();
          return true;
        case "project.publish":
          void runUpload();
          return true;
        case "edit.undo":
          if (editorMode !== "edit" || importBusy) return false;
          handleUndo();
          return history.past.length > 0;
        case "edit.redo":
          if (editorMode !== "edit" || importBusy) return false;
          handleRedo();
          return history.future.length > 0;
        case "edit.copy":
          if (!payload.entityId && assetSelection) return false;
          handleCopy(payload.entityId);
          return Boolean(payload.entityId ?? sceneSelection?.id);
        case "edit.paste":
          if (assetSelection) return false;
          handlePaste();
          return Boolean(clipboardRef.current);
        case "edit.duplicate":
          if (!payload.entityId && assetSelection) return false;
          handleDuplicate(payload.entityId);
          return Boolean(payload.entityId ?? sceneSelection?.id);
        case "edit.delete":
          if (!payload.entityId && (payload.assetId ?? assetSelection)) {
            requestDeleteAsset(payload.assetId ?? assetSelection ?? "");
            return editorMode === "edit";
          }
          handleDelete(payload.entityId);
          return Boolean(payload.entityId ?? sceneSelection?.id);
        case "selection.select-all": {
          if (assetSelection) return false;
          const entityIds = sceneEntityIdsInHierarchyOrder(bundle.scene);
          if (entityIds.length === 0) return false;
          const primaryEntityId =
            sceneSelection?.id && entityIds.includes(sceneSelection.id)
              ? sceneSelection.id
              : entityIds[0]!;
          handleEntitySelectionChange(entityIds, primaryEntityId);
          return true;
        }
        case "selection.rename": {
          if (editorMode !== "edit") return false;
          if (payload.entityId) requestRename("entity", payload.entityId);
          else if (payload.assetId) requestRename("asset", payload.assetId);
          else if (payload.folderId) requestRename("folder", payload.folderId);
          else if (assetSelection) requestRename("asset", assetSelection);
          else if (sceneSelection?.id) requestRename("entity", sceneSelection.id);
          else if (
            activeAssetFolderId &&
            bundle.assets.folders?.[activeAssetFolderId]
          ) {
            requestRename("folder", activeAssetFolderId);
          }
          else return false;
          return true;
        }
        case "view.frame-selection":
          if (
            editorMode !== "edit" ||
            assetSelection ||
            !sceneSelection?.id
          ) return false;
          setFrameSelectionRequest((current) => current + 1);
          return true;
        case "view.exit-focus":
          if (editorMode !== "edit" || !focusedEntity) return false;
          setExitFocusRequest((current) => current + 1);
          return true;
        case "transform.translate":
          if (editorMode !== "edit") return false;
          setTransformMode("translate");
          return true;
        case "transform.rotate":
          if (editorMode !== "edit") return false;
          setTransformMode("rotate");
          return true;
        case "transform.scale":
          if (editorMode !== "edit") return false;
          setTransformMode("scale");
          return true;
        case "transform.toggle-space":
          if (editorMode !== "edit") return false;
          setTransformSpace((current) =>
            current === "world" ? "local" : "world",
          );
          return true;
        case "transform.toggle-snap": {
          if (editorMode !== "edit") return false;
          const gizmo = resolveSceneSettings(
            bundleRef.current.scene.settings,
          ).editor.gizmo;
          const snapEnabled = !gizmo.snapEnabled;
          handleGizmoSettingsChange({ snapEnabled });
          setNotice(
            snapEnabled
              ? `スナップをオンにしました（移動 ${formatSnapStep(
                  "translate",
                  gizmo.translateSnap,
                )} / 回転 ${formatSnapStep(
                  "rotate",
                  gizmo.rotateSnapDegrees,
                )} / 拡縮 ${formatSnapStep("scale", gizmo.scaleSnap)}）`
              : "スナップをオフにしました",
          );
          return true;
        }
        case "transform.nudge-x-negative":
          return handleNudgeSelection("x", -1);
        case "transform.nudge-x-positive":
          return handleNudgeSelection("x", 1);
        case "transform.nudge-y-negative":
          return handleNudgeSelection("y", -1);
        case "transform.nudge-y-positive":
          return handleNudgeSelection("y", 1);
        case "transform.nudge-z-negative":
          return handleNudgeSelection("z", -1);
        case "transform.nudge-z-positive":
          return handleNudgeSelection("z", 1);
        case "play.toggle":
          if (editorMode === "play") stopPlayMode();
          else if (importBusy) {
            void enterPlayMode({ interactive: true });
            return false;
          } else void enterPlayMode({ interactive: true });
          return true;
        case "layout.reset":
          setLayout(DEFAULT_EDITOR_LAYOUT);
          try {
            window.localStorage.removeItem(EDITOR_LAYOUT_STORAGE_KEY);
          } catch {
            // The in-memory reset still applies when storage is unavailable.
          }
          onLayoutChange?.(DEFAULT_EDITOR_LAYOUT);
          return true;
        case "entity.create-empty":
          handleCreateEmpty(payload.parentEntityId ?? null);
          return !importBusy;
        case "entity.create-primitive":
          if (!payload.creationId) return false;
          handlePlacePrimitive(payload.creationId);
          return true;
        case "entity.add-component":
          if (!payload.entityId || !payload.componentDefinitionId) return false;
          handleAddComponent(payload.entityId, payload.componentDefinitionId);
          return true;
        case "entity.reparent":
          if (!payload.entityId) return false;
          handleReparentEntity(
            payload.entityId,
            payload.parentEntityId ?? null,
            payload.siblingIndex,
          );
          return !importBusy;
        case "prefab.create":
          if (!payload.entityId) return false;
          handleCreatePrefab(payload.entityId);
          return editorMode === "edit";
        case "asset.create-folder":
          handleCreateAssetFolder();
          return editorMode === "edit";
        case "asset.create-material":
          handleCreateDocumentAsset("material", payload.folderId);
          return editorMode === "edit" && !importBusy;
        case "asset.create-particle":
          handleCreateDocumentAsset("particle", payload.folderId);
          return editorMode === "edit" && !importBusy;
        case "asset.create-interactivity":
          handleCreateDocumentAsset("interactivity", payload.folderId);
          return editorMode === "edit" && !importBusy;
        case "asset.create-script":
          if (editorMode !== "edit" || importBusy) return false;
          if (!projectPathRef.current) {
            setNotice("プロジェクトを保存するとスクリプトを作成できます");
            return false;
          }
          if (
            payload.folderId &&
            !bundle.assets.folders?.[payload.folderId]
          ) {
            setNotice("作成先のフォルダーが見つかりません。フォルダーを開き直してください");
            return false;
          }
          setScriptTemplateFolderId(
            payload.folderId === undefined
              ? resolveAssetCreationFolderId(
                  bundle.assets,
                  activeAssetFolderId,
                )
              : payload.folderId,
          );
          return true;
        case "asset.edit-script": {
          if (
            !payload.assetId ||
            bundle.assets.assets[payload.assetId]?.kind !== "script"
          ) {
            return false;
          }
          void scriptOpenRef.current(payload.assetId);
          return true;
        }
        case "asset.edit-shader": {
          if (
            !payload.assetId ||
            bundle.assets.assets[payload.assetId]?.kind !== "shader"
          ) {
            return false;
          }
          void openShaderAssetEditor(payload.assetId);
          return true;
        }
        case "asset.edit-interactivity": {
          if (!payload.assetId || bundle.assets.assets[payload.assetId]?.kind !== "interactivity") {
            return false;
          }
          setInteractivityEditorAssetId(payload.assetId);
          setGraphTabActive(true);
          return true;
        }
        case "asset.import":
          return editorMode === "edit";
      }
    },
    [
      activeAssetFolderId,
      assetSelection,
      bundle.assets.folders,
      editorMode,
      enterPlayMode,
      handleAddComponent,
      handleCopy,
      handleCreateAssetFolder,
      handleCreateDocumentAsset,
      scriptEditor,
      handleCreatePrefab,
      handleCreateEmpty,
      handleDelete,
      handleDuplicate,
      handleEntitySelectionChange,
      handleGizmoSettingsChange,
      handleNudgeSelection,
      handlePaste,
      handlePlacePrimitive,
      handleReparentEntity,
      handleRedo,
      handleUndo,
      history.future.length,
      history.past.length,
      importBusy,
      openShaderAssetEditor,
      focusedEntity,
      onLayoutChange,
      requestRename,
      requestDeleteAsset,
      runSave,
      runUpload,
      saveStatus,
      setAssetSelection,
      bundle.scene,
      sceneSelection?.id,
      stopPlayMode,
    ],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        deleteDialog ||
        pendingMaterialAssignment ||
        scriptTemplateFolderId !== undefined ||
        // The graph editor has its own Delete, Undo and Redo. Left unguarded,
        // cutting a wire also deleted the selected Entity and undo stepped
        // through two histories at once. Only while it is the tab in front:
        // behind the Scene View it is not taking keystrokes.
        (interactivityEditorAssetId !== null && graphTabActive) ||
        (scriptEditor.state.openAssetId !== null && scriptTabActive)
      ) {
        return;
      }
      if (event.repeat) return;
      const command = commandForKeyboardEvent(event, resolvedCommands);
      if (!command) return;
      if (executeCommand(command.id)) event.preventDefault();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    deleteDialog,
    scriptEditor.state.openAssetId,
    scriptTabActive,
    graphTabActive,
    interactivityEditorAssetId,
    executeCommand,
    pendingMaterialAssignment,
    resolvedCommands,
    scriptTemplateFolderId,
  ]);

  const shortcutLabel = useCallback(
    (commandId: EditorCommandId) =>
      shortcutForCommand(commandId, resolvedCommands) ?? "",
    [resolvedCommands],
  );

  // When the save that guards leaving fails, the author must still be able
  // to leave: the failure and its message are shown, and leaving without the
  // save is an explicit choice rather than a dead end.
  const [leaveWithoutSaveError, setLeaveWithoutSaveError] = useState<
    string | null
  >(null);
  const noticeRef = useRef<string | null>(null);
  noticeRef.current = notice;
  const handleBack = useCallback(async (): Promise<boolean> => {
    if (leaving || projectExportBusy || projectTransferBusy) return false;
    if (onProjectExport) {
      if (importBusy) {
        setNotice("素材の取り込みが終わってから、紹介ページへ戻ってください。");
        return false;
      }
      if (scriptEditorDirtyRef.current || scriptEditorSavingRef.current || shaderEditorDirtyRef.current) {
        setNotice("スクリプトとShaderの変更を保存してから、紹介ページへ戻ってください。");
        return false;
      }
      flushInteractivityDraft();
    }
    setPlaySession(null);
    setEditorMode("edit");
    if (!onSaveRef.current) {
      onBack();
      return true;
    }
    setLeaving(true);
    while (lastSavedBundleRef.current !== bundleRef.current) {
      const target = bundleRef.current;
      await requestAutosave(target);
      if (lastSavedBundleRef.current !== target) {
        setLeaving(false);
        setLeaveWithoutSaveError(
          noticeRef.current ?? "自動保存に失敗しました",
        );
        return false;
      }
    }
    setLeaving(false);
    onBack();
    return true;
  }, [leaving, projectExportBusy, projectTransferBusy, importBusy, onProjectExport, flushInteractivityDraft, onBack, requestAutosave]);

  mcpProjectBridgeActionsRef.current = { saveNow: runSave, leave: handleBack };

  const kindLabel = projectKind === "world" ? "ワールド" : "アイテム";
  const KindIcon = projectKind === "world" ? EDITOR_ICONS.world : EDITOR_ICONS.item;
  const BackIcon = EDITOR_ICONS.back;
  const SaveIcon = EDITOR_ICONS.save;
  const UploadIcon = EDITOR_ICONS.upload;
  const ExportIcon = EDITOR_ICONS.export;
  const CreateIcon = EDITOR_ICONS.create;
  const saveStatusLabel =
    saveStatus === "saved"
      ? onProjectExport ? "ブラウザに保存済み" : "保存済み"
      : saveStatus === "saving"
        ? "保存中"
        : saveStatus === "error"
          ? "保存エラー"
          : saveStatus === "unavailable"
            ? "デモ"
            : "保存待ち";
  const saveStatusTitle =
    saveStatus === "saved"
      ? "変更は自動保存されています"
      : saveStatus === "saving"
        ? "変更を自動保存しています"
        : saveStatus === "error"
          ? "変更を保存できませんでした"
          : saveStatus === "unavailable"
            ? "Webデモでは保存されません"
            : "変更はまもなく自動保存されます";
  const SaveStatusIcon =
    saveStatus === "saved"
      ? EDITOR_ICONS.saved
      : saveStatus === "saving"
        ? EDITOR_ICONS.saving
        : saveStatus === "error"
          ? EDITOR_ICONS.warning
          : EDITOR_ICONS.save;
  const interactivityEditorAsset =
    interactivityEditorAssetId &&
    bundle.assets.assets[interactivityEditorAssetId]?.kind === "interactivity"
      ? bundle.assets.assets[interactivityEditorAssetId]
      : null;
  /**
   * Which Entities run this graph, and whether they can be pressed.
   *
   * The editor shows the graph; only the Scene knows whether anything will run
   * it. Reading that here lets the editor say so instead of leaving the author
   * to find out at Play.
   */
  const interactivityAttachments = interactivityEditorAsset
    ? Object.values(bundle.scene.entities).flatMap((entity) =>
        entity.components.some(
          (component) =>
            component.type === "interaction-trigger" &&
            component.enabled &&
            component.interactivityAssetId === interactivityEditorAsset.id,
        )
          ? [
              {
                entityId: entity.id,
                name: entity.name,
                hasInteractable: entity.components.some(
                  (component) =>
                    component.type === "xrift-component" &&
                    component.schemaId ===
                      XRIFT_COMPONENT_SCHEMA_IDS.interactable &&
                    component.enabled,
                ),
                // A graph that plays clips is attached to the Entity that has
                // them, and「Modelを間違えた」looks exactly like「グラフが壊れて
                // いる」in Play. Counted here because the canvas cannot see it.
                animationClipCount: entity.components.reduce((total, component) => {
                  if (component.type !== "mesh") return total;
                  const assetId =
                    component.geometry?.kind === "asset"
                      ? component.geometry.assetId
                      : component.geometryAssetId;
                  const asset = assetId ? bundle.assets.assets[assetId] : undefined;
                  return (
                    total +
                    (asset?.kind === "model"
                      ? asset.importMetadata?.animations.length ?? 0
                      : 0)
                  );
                }, 0),
              },
            ]
          : [],
      )
    : [];
  const interactivitySelectedEntity = (() => {
    const entityId = selectedEntityIds[0];
    const entity = entityId ? bundle.scene.entities[entityId] : undefined;
    return entity ? { entityId: entity.id, name: entity.name } : null;
  })();

  const viewportEditorTabs = interactivityEditorAsset
    ? [
        {
          id: INTERACTIVITY_GRAPH_TAB_ID,
          label: interactivityEditorAsset.name,
          closable: true,
        },
      ]
    : [];
  if (scriptEditorAsset) viewportEditorTabs.push({
    id: SCRIPT_TAB_ID,
    label: `${scriptEditorAsset.name}${scriptEditorDirty ? " · 未保存" : ""}`,
    closable: true,
  });

  // The recording view without editor UI is the same layout as a maximized
  // viewport: the frame gets the whole editor area and the panels fold away.
  const recordingUiHidden =
    recordingViewport.visible && !recordingViewport.showEditorUi;
  const panelsHidden = viewportMaximized || recordingUiHidden;
  const sceneContentVisible = !phone || panelsHidden || !tabletPanel;
  const hierarchyTrack = panelsHidden || tablet
    ? "0px"
    : `min(${layout.hierarchyWidth}px, 22%)`;
  const inspectorTrack = panelsHidden || (tablet && !tabletPanel)
    ? "0px"
    : tablet ? "var(--editor-tablet-side-track)" : `min(${layout.inspectorWidth}px, 36%)`;
  const assetsTrack = panelsHidden || (tablet && !tabletPanel)
    ? "0px"
    : tablet ? "var(--editor-tablet-bottom-track)" : `min(${layout.assetsHeight}px, calc(100% - 240px))`;
  /*
   * `contents` while they are shown, so the wrapper is invisible to the grid
   * and placement is exactly as before. Maximized it becomes the grid item
   * itself and clips: the track is 0px, so the panel inside is simply not
   * drawn. `hidden` would be simpler but takes the item out of the flow, and
   * auto-placement then walks the remaining panels one cell to the left —
   * putting the Scene View in the 0px column with its own header clipped away.
   */
  const saveStatusIndicator = (<span
              className={`flex items-center gap-1.5 text-xs font-medium ${
                saveStatus === "error" ? "text-rose-700" : "text-editor-muted"
              }`}
              title={saveStatusTitle}
              role="status"
              aria-live="polite"
            >
              <SaveStatusIcon
                size={13}
                className={saveStatus === "saving" ? "animate-spin" : undefined}
                aria-hidden="true"
              />
              {saveStatusLabel}
            </span>);
  const HeaderActions = tablet ? "details" : "div";
  const sidePanelClass = (panel: "hierarchy" | "assets" | "inspector", spansBothRows: boolean) =>
    tablet ? `editor-tablet-panel ${panelsHidden || tabletPanel !== panel ? "hidden" : "flex"}` : panelsHidden
      ? `overflow-hidden ${spansBothRows ? "row-span-2" : ""}`
      : "contents";

  return (
    <ValueScrubContext.Provider value={valueScrubTransaction}>
    <div className="visual-editor-shell h-screen overflow-hidden bg-editor-canvas"
      data-tablet={tablet || undefined} data-phone={phone || undefined} data-panel-open={phone && !panelsHidden && tabletPanel ? tabletPanel : undefined} data-touch={touch || undefined}
      style={tablet ? { height: viewportHeight ? `${viewportHeight}px` : "100dvh" } : undefined}>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor-canvas text-editor-text">
        <header className="editor-main-header flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editor-border bg-editor-surface px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              disabled={leaving}
              onClick={() => void handleBack()}
              title={commandTitle(`${backLabel}へ戻る`, "CloseVisualEditor")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-2.5 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle disabled:cursor-wait disabled:opacity-50"
            >
              <BackIcon size={13} aria-hidden="true" />
              {leaving ? "保存中…" : tablet ? "戻る" : backLabel}
            </button>
            <div className="min-w-0 border-l border-editor-border pl-2.5">
              <p className="truncate text-sm font-semibold text-editor-text">
                {bundle.project.metadata.title}
              </p>
              {tablet ? saveStatusIndicator : <p className="flex items-center gap-1 text-xs text-editor-muted">
                <KindIcon size={11} aria-hidden="true" />
                {kindLabel} · ビジュアルエディター
              </p>}
            </div>
          </div>

          <HeaderActions ref={(element: HTMLDetailsElement | HTMLDivElement | null) => { headerActionsRef.current = element; }} className="editor-header-actions relative shrink-0"
            onKeyDown={(event) => {
              if (!tablet) return;
              event.stopPropagation();
              if (event.key === "Escape") {
                headerActionsRef.current?.removeAttribute("open");
                headerActionsRef.current?.querySelector("summary")?.focus();
              }
            }}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (tablet && target.closest("button, a") && (!target.closest(".editor-import-menu") || target.closest('[role="menuitem"]'))) headerActionsRef.current?.removeAttribute("open");
            }}>
            {tablet ? <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 rounded-md border border-editor-border bg-editor-surface px-3 text-xs font-semibold text-editor-text">ファイル <span aria-hidden="true">⌄</span></summary> : null}
            <div className="editor-project-actions flex items-center gap-2">
            {!tablet ? saveStatusIndicator : null}
            {saveStatus === "error" ? (
              <button
                type="button"
                onClick={() => executeCommand("project.save")}
                title={commandTitle("自動保存を再試行", "project.save", shortcutLabel("project.save"))}
                className="flex items-center gap-1 rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <SaveIcon size={13} aria-hidden="true" />
                再試行
              </button>
            ) : null}
            <span className="h-5 w-px bg-editor-border" aria-hidden="true" />
            <EditorImportMenu
              disabledReason={
                renderedReadOnly
                  ? "動作確認を停止してから読み込んでください"
                  : assetImportPanelAvailability.disabledReason
              }
              onImportModel={() => globalModelImportInputRef.current?.click()}
              onImportR3f={() => setComponentImportOpen(true)}
            />
            {onProjectImport ? <button
              type="button"
              disabled={projectTransferBusy || projectExportBusy || importBusy || leaving || renderedEditorMode !== "edit"}
              onClick={() => void runProjectImport()}
              className="rounded-md border border-editor-border bg-editor-surface px-3 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle disabled:opacity-45"
              title="このブラウザに保存したプロジェクトや.xriftstudioファイルを開きます"
            >プロジェクトを開く</button> : null}
            {onProjectExport ? <button
              type="button"
              disabled={projectTransferBusy || projectExportBusy || importBusy || leaving || renderedEditorMode !== "edit"}
              onClick={() => void runProjectExport()}
              title="シーンと素材を.xriftstudioファイルにまとめます"
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-45"
            ><ExportIcon size={13} aria-hidden="true" />{projectExportBusy ? "書き出しを準備中…" : "プロジェクトを書き出す"}</button> : <>
            <button
              type="button"
              onClick={() => void runClassicExport()}
              title="制作データと素材を、コードで編集できるXRiftプロジェクトへ書き出します。"
              className="flex items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-3 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle"
            >
              <ExportIcon size={13} aria-hidden="true" />
              コードエディターへ書き出す
            </button>
            <button
              type="button"
              onClick={() => executeCommand("project.publish")}
              title={commandTitle(
                compilationFresh
                  ? "公開内容を確認してXRiftへ送信"
                  : "最新の編集内容は公開画面で自動的に保存・変換されます",
                "project.publish",
                shortcutLabel("project.publish"),
              )}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-200/60 hover:bg-brand-700"
            >
              <UploadIcon size={13} aria-hidden="true" />
              XRiftへ公開
            </button>
            </>}
            {tablet ? <>
              <button type="button" onClick={() => { setSceneSettingsOpen(true); setTabletPanel("inspector"); setViewportMaximized(false); }}
                className="min-h-11 rounded-md border border-editor-border bg-editor-surface px-3 text-left text-xs font-semibold text-editor-text">シーン設定</button>
              <GuideLink page="ipad" label="タッチ操作の使い方" />
            </> : null}
            </div>
          </HeaderActions>
        </header>

        <div
          className={`editor-main-toolbar ${recordingUiHidden ? "hidden" : "flex"} h-10 shrink-0 items-center border-b border-editor-border bg-editor-surface px-2.5`}
          role="toolbar"
          aria-label="ビジュアルエディターのツール"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={
                renderedReadOnly || importBusy || history.past.length === 0
              }
              onClick={() => executeCommand("edit.undo")}
              aria-label="元に戻す"
              title={commandTitle("元に戻す", "edit.undo", shortcutLabel("edit.undo"))}
              className="flex h-7 items-center gap-1 rounded border border-editor-border bg-editor-surface px-1.5 text-xs text-editor-muted hover:bg-editor-subtle hover:text-editor-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EDITOR_ICONS.undo size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={
                renderedReadOnly || importBusy || history.future.length === 0
              }
              onClick={() => executeCommand("edit.redo")}
              aria-label="やり直す"
              title={commandTitle("やり直す", "edit.redo", shortcutLabel("edit.redo"))}
              className="flex h-7 items-center gap-1 rounded border border-editor-border bg-editor-surface px-1.5 text-xs text-editor-muted hover:bg-editor-subtle hover:text-editor-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EDITOR_ICONS.redo size={13} aria-hidden="true" />
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={importBusy}
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
                onClick={() => setCreateMenuOpen((open) => !open)}
                title={commandTitle("シーンEntityを作成", "OpenCreateMenu", "Ctrl+Shift+A")}
                className="flex h-7 items-center gap-1.5 rounded border border-editor-border bg-editor-surface px-2 text-xs font-semibold text-editor-text hover:bg-editor-subtle disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CreateIcon size={13} aria-hidden="true" />
                追加
              </button>
              <EditorCreateMenu
                open={createMenuOpen}
                readOnly={false}
                importBusy={importBusy}
                projectKind={projectKind}
                builtinPrefabRecipes={builtinPrefabRecipes}
                onClose={() => setCreateMenuOpen(false)}
                onCreateEmpty={() => executeCommand("entity.create-empty")}
                onCreatePrimitive={(creationId) =>
                  executeCommand("entity.create-primitive", { creationId })
                }
                onCreateTerrain={handleCreateTerrain}
            terrainOverlapCount={terrainOverlapCount}
            onArrangeTerrains={handleArrangeTerrains}
                onPlaceBuiltinPrefab={handlePlaceBuiltinPrefab}
                onCreateXriftObject={handleCreateXriftObject}
                onCreateComponentObject={handleCreateComponentObject}
              />
            </div>
          </div>
          {tablet && !recordingUiHidden ? <div className="editor-panel-switcher ml-auto flex items-center gap-1" aria-label="編集パネル">
            {phone ? <button type="button" aria-pressed={panelsHidden || !tabletPanel}
              onClick={() => { setTabletPanel(null); setViewportMaximized(false); setActiveEditorTab(SCENE_VIEW_TAB_ID); }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${panelsHidden || !tabletPanel ? "bg-brand-100 text-brand-800" : "text-editor-muted hover:bg-editor-subtle"}`}>シーン</button> : null}
            {([['hierarchy', 'Hierarchy'], ['assets', 'Assets'], ['inspector', 'Inspector']] as const).map(([panel, label]) =>
              <button key={panel} type="button"
                aria-pressed={!panelsHidden && tabletPanel === panel}
                aria-controls={`editor-panel-${panel}`}
                onClick={() => {
                  setViewportMaximized(false);
                  setTabletPanel((current) => current === panel && !panelsHidden ? null : panel);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!panelsHidden && tabletPanel === panel ? "bg-brand-100 text-brand-800" : "text-editor-muted hover:bg-editor-subtle"}`}
              >{label}</button>,
            )}
          </div> : null}
        </div>

        <ComponentCodeImportDialog
          open={componentImportOpen}
          projectKind={projectKind}
          onClose={() => setComponentImportOpen(false)}
          onPreparePreview={handlePrepareComponentCodeImportPreview}
          onImport={handleComponentCodeImport}
        />
        <ScriptTemplateDialog
          open={scriptTemplateFolderId !== undefined}
          folderName={
            scriptTemplateFolderId
              ? bundle.assets.folders?.[scriptTemplateFolderId]?.name ??
                "選択中のフォルダー"
              : "Assets直下"
          }
          selectedEntityName={
            sceneSelection?.id
              ? bundle.scene.entities[sceneSelection.id]?.name
              : undefined
          }
          onClose={() => setScriptTemplateFolderId(undefined)}
          onCreate={handleCreateScriptFromTemplate}
        />
        <input
          ref={globalModelImportInputRef}
          type="file"
          accept={ASSET_IMPORT_ACCEPT}
          multiple
          className="hidden"
          aria-label="3Dモデルまたは3Dアセットを読み込み"
          onChange={(event) => {
            handleQueueFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />

        <main
          ref={mainRef}
          className="editor-workspace relative grid min-h-0 flex-1 overflow-hidden"
          style={
            {
              gridTemplateColumns: `${hierarchyTrack} minmax(${tablet ? "0px" : "360px"}, 1fr) ${inspectorTrack}`,
              gridTemplateRows: `minmax(${tablet ? "0px" : "240px"}, 1fr) ${assetsTrack}`,
              // Published as custom properties so a panel that floats over the
              // Scene View can stop at the columns instead of guessing their
              // width. The tracks are draggable, so a hand-tuned inset drifts
              // out of step the moment the author resizes one.
              "--xrift-hierarchy-track": hierarchyTrack,
              "--xrift-inspector-track": inspectorTrack,
              "--xrift-assets-track": assetsTrack,
            } as CSSProperties
          }
        >
          <div id="editor-panel-hierarchy" className={sidePanelClass("hierarchy", true)}>
          <HierarchyPanel
            scene={bundle.scene}
            selection={sceneSelection}
            selectedEntityIds={selectedEntityIds}
            readOnly={false}
            playMode={renderedEditorMode === "play"}
            projectKind={projectKind}
            onSelectionChange={handleEntitySelectionChange}
            onAssignMaterial={handleAssignMaterial}
            onDropSceneAsset={(assetId, parentEntityId) =>
              handlePlaceSceneAsset(assetId, { parentEntityId })
            }
            onDropBuiltinPrefab={(recipeId, parentEntityId) =>
              handlePlaceBuiltinPrefab(recipeId, undefined, parentEntityId)
            }
            builtinPrefabRecipes={builtinPrefabRecipes}
            onEntityEnabledChange={handleEntityEnabledChange}
            onCreateXriftObject={handleCreateXriftObject}
            onCreateComponentObject={handleCreateComponentObject}
            onCommand={executeCommand}
            renameRequest={
              renameTarget?.kind === "entity"
                ? { id: renameTarget.id, requestId: renameTarget.requestId }
                : null
            }
            onRename={(entityId, name) =>
              commitRename(
                { kind: "entity", id: entityId, requestId: Date.now() },
                name,
              )
            }
          />
          </div>
          <SceneViewport
            scene={renderedPlaySession?.runtimeScene ?? bundle.scene}
            assets={renderedPlaySession?.runtimeAssets ?? bundle.assets}
            prefabs={bundle.prefabs}
            projectPath={projectPath}
            projectKind={projectKind}
            selection={sceneSelection}
            selectedEntityIds={selectedEntityIds}
            editorMode={renderedEditorMode}
            runtimeEntityRevisions={renderedPlaySession?.entityRevisions}
            runtimeRevision={renderedPlaySession?.revision ?? 0}
            lastReloadedEntityName={
              renderedPlaySession?.lastReloads.length === 1
                ? bundle.scene.entities[
                    renderedPlaySession.lastReloads[0]!.entityId
                  ]?.name ?? null
                : renderedPlaySession?.lastReloads.length
                  ? `${renderedPlaySession.lastReloads.length} Entities`
                  : null
            }
            transformMode={transformMode}
            transformSpace={transformSpace}
            playDisabled={renderedEditorMode === "edit" && importBusy}
            playPreparing={playPreparing}
            playShortcut={shortcutLabel("play.toggle")}
            snapShortcut={shortcutLabel("transform.toggle-snap")}
            onTogglePlay={() => {
              // Play is something you watch, so it brings the Scene View
              // forward. The graph stays open in its tab.
              setGraphTabActive(false);
              executeCommand("play.toggle");
            }}
            tabs={viewportEditorTabs}
            activeTabId={
              viewportEditorTabs.some((tab) => tab.id === activeEditorTab)
                ? activeEditorTab
                : SCENE_VIEW_TAB_ID
            }
            onSelectTab={setActiveEditorTab}
            onCloseTab={(id) => {
              if (id === SCRIPT_TAB_ID) closeScriptEditor();
              else {
                setInteractivityEditorAssetId(null);
                setActiveEditorTab((current) => current === id ? SCENE_VIEW_TAB_ID : current);
              }
            }}
            maximized={viewportMaximized}
            onToggleMaximize={() => setViewportMaximized((current) => !current)}
            onTransformModeChange={(mode) => {
              if (!renderedReadOnly) setTransformMode(mode);
            }}
            onToggleTransformSpace={() => {
              if (!renderedReadOnly) {
                executeCommand("transform.toggle-space");
              }
            }}
            onGizmoSettingsChange={
              renderedReadOnly ? undefined : handleGizmoSettingsChange
            }
            notice={null}
            onSelect={handleSceneViewportSelection}
            onTransformCommit={handleGizmoCommit}
            onDropPrimitive={(creationId, position) =>
              handlePlacePrimitive(creationId, position)
            }
            onDropMaterial={handleAssignMaterial}
            onDropSkybox={handleAssignSkybox}
            onDropBuiltinPrefab={handlePlaceBuiltinPrefab}
            onDropSceneAsset={(assetId, position) =>
              handlePlaceSceneAsset(assetId, { position })
            }
            onCreatePrimitive={(creationId) =>
              executeCommand("entity.create-primitive", {
                creationId,
              })
            }
            onDeleteEntity={(entityId) =>
              executeCommand("edit.delete", { entityId })
            }
            scriptRuntime={scriptViewportRuntime}
            frameSelectionRequest={frameSelectionRequest}
            exitFocusRequest={exitFocusRequest}
            focusedEntity={focusedEntity}
            onFocusChange={setFocusedEntity}
            onExitFocus={() => executeCommand("view.exit-focus")}
            onViewportFileDrop={() => setNotice("外部の素材はAssetsへドロップしてください")}
            onPlayDropAttempt={() => setNotice("動作確認中もHierarchyまたは追加メニューからEntityを配置できます")}
            onDropRejected={setNotice}
            onOptimizeColliders={handleOptimizeColliders}
            terrainEditing={terrainEditing}
            onTerrainEditingPatch={(patch) =>
              setTerrainEditing((current) =>
                current ? { ...current, ...patch } : current,
              )
            }
            onTerrainEditingExit={() => setTerrainEditing(null)}
            onTerrainStrokeStart={handleTerrainStrokeStart}
            onTerrainStroke={handleTerrainStroke}
            onTerrainStrokeEnd={handleTerrainStrokeEnd}
            onTerrainStrokeCancel={handleTerrainStrokeCancel}
            thumbnailCaptureRequest={thumbnailCaptureRequest}
            onThumbnailCaptured={onThumbnailCaptured}
            onThumbnailCaptureError={onThumbnailCaptureError}
            debugCaptureRequest={debugCaptureRequest}
            onDebugCaptureResult={resolveDebugCapture}
            screenshotRequest={sceneScreenshotRequest}
            onScreenshotComplete={() => setSceneScreenshotRequest(null)}
            cameraRequest={sceneCameraRequest}
            onCameraResult={resolveSceneCamera}
            boundsRequest={sceneBoundsRequest}
            onBoundsResult={resolveSceneBounds}
            onExitRecordingView={() =>
              recordingSession.setViewport({ visible: false })
            }
          />
          <div id="editor-panel-inspector" className={sidePanelClass("inspector", true)}>
          <EditorPanelVisibilityContext.Provider value={!panelsHidden && (!tablet || tabletPanel === "inspector")}>
          <InspectorPanel
            scene={bundle.scene}
            assets={renderedPlaySession?.runtimeAssets ?? bundle.assets}
            metadata={bundle.project.metadata}
            prefabs={bundle.prefabs}
            projectPath={projectPath}
            selectedEntityId={sceneSelection?.id ?? null}
            selectedAssetId={assetSelection}
            selectedEntityIds={selectedEntityIds}
            selectedAssetIds={selectedAssetIds}
            readOnly={renderedReadOnly}
            playMode={renderedEditorMode === "play"}
            onRenameEntity={handleRenameEntity}
            onEntityEnabledChange={handleEntityEnabledChange}
            onTransformChange={handleTransformChange}
            onTransformScrubStart={handleTransformScrubStart}
            onTransformScrubChange={handleTransformScrubChange}
            onTransformScrubEnd={handleTransformScrubEnd}
            onTransformScrubCancel={handleTransformScrubCancel}
            onMeshChange={handleMeshChange}
            onTerrainBrush={handleTerrainBrush}
            onTerrainSettings={handleTerrainSettings}
            onTerrainGrassLayersChange={handleTerrainGrassLayersChange}
            onTerrainEditingChange={setTerrainEditing}
            terrainSceneEditing={terrainEditing}
            onApplyTerrainSurface={handleApplyTerrainSurface}
            onColliderChange={handleColliderChange}
            onRigidBodyChange={handleRigidBodyChange}
            onAutoFitCollider={handleAutoFitCollider}
            onRemoveCollider={handleRemoveCollider}
            onRemoveRigidBody={handleRemoveRigidBody}
            onRemoveComponent={handleRemoveComponent}
            onLightChange={handleLightChange}
            onTextChange={handleTextChange}
            onImageChange={handleImageChange}
            onVegetationWindChange={handleVegetationWindChange}
            onAudioSourceChange={handleAudioSourceChange}
            onSelectAsset={handleSelectAsset}
            onOpenInteractivity={(assetId) =>
              executeCommand("asset.edit-interactivity", { assetId })
            }
            scriptContracts={scriptEditor.contracts}
            scriptEntityOptions={scriptEntityOptions}
            onUpdateScriptComponent={handleUpdateScriptComponent}
            onUpdateInteractionTrigger={handleInteractionTriggerChange}
            onOpenScript={(assetId) =>
              executeCommand("asset.edit-script", { assetId })
            }
            onOpenShader={(assetId) => {
              void openShaderAssetEditor(assetId);
            }}
            onOpenMaterialShader={openMaterialShaderEditor}
            onAssignShaderAsset={handleAssignShaderAsset}
            onCloseAsset={() => setAssetSelection(null)}
            onMaterialChange={handleMaterialChange}
            onModelChange={handleModelChange}
            onReimportModel={handleReimportModel}
            onCreateModelAnimationGraph={handleCreateModelAnimationGraph}
            modelReimportState={
              modelReimportFeedback?.assetId === assetSelection
                ? modelReimportFeedback.state
                : { phase: "idle" }
            }
            modelOptimizationState={
              modelOptimizationFeedback?.assetId === assetSelection
                ? modelOptimizationFeedback.state
                : { phase: "idle" }
            }
            onApplyModelOptimization={(assetId, options) => {
              void handleApplyModelOptimization(assetId, options);
            }}
            textureBatchState={textureBatchFeedback}
            onApplyTextureBatch={(assetIds, settings) => {
              void handleApplyTextureProcessingBatch(assetIds, settings);
            }}
            onParticleChange={handleParticleChange}
            onTextureChange={handleTextureChange}
            onCreateTextureCard={handleCreateTextureCard}
            textureProcessingState={
              textureProcessingFeedback?.assetId === assetSelection
                ? textureProcessingFeedback.state
                : { phase: "idle" }
            }
            onApplyTextureProcessing={(assetId) => {
              void handleApplyTextureProcessing(assetId);
            }}
            onRevertTextureProcessing={(assetId) =>
              handleRevertAssetOptimization(assetId, "texture")
            }
            onMeshCollision={(entityId, action) => {
              if (editorMode !== "edit") return;
              try {
                const next = setMeshCollision(bundleRef.current.scene, entityId, action);
                updateScene(() => next);
                setNotice(action === "exclusive" ? "選んだメッシュだけを当たり判定にしました。「元に戻す」で取り消せます" : action === "remove" ? "このメッシュの当たり判定を外しました" : "固定の当たり判定に追加しました");
              } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
            }}
            onInspectCollisionEntity={(entityId) => setSceneSelection({ kind: "entity", id: entityId })}
            onBakeNodeCollider={(entityId, componentId, ratio) => {
              return handleBakeNodeCollider(entityId, componentId, ratio);
            }}
            onClearNodeCollider={handleClearNodeCollider}
            onRevertModelOptimization={(assetId) =>
              handleRevertAssetOptimization(assetId, "model")
            }
            onParticleEmitterChange={handleParticleEmitterChange}
            onRemoveParticleEmitter={handleRemoveParticleEmitter}
            projectKind={projectKind}
            onAddComponent={(entityId, definitionId) =>
              executeCommand("entity.add-component", {
                entityId,
                componentDefinitionId: definitionId,
              })
            }
            onUpdateXriftComponent={handleUpdateXriftComponent}
            onRemoveXriftComponent={handleRemoveXriftComponent}
            assetImportSettings={<TextureImportSettingsPanel
              textureMaxSize={textureImportMaxSize}
              onTextureMaxSizeChange={(value) => {
                setTextureImportMaxSize(value);
                saveTextureImportMaxSize(value);
              }}
              textureCompression={textureImportCompression}
              onTextureCompressionChange={(value) => {
                setTextureImportCompression(value);
                saveTextureImportCompression(value);
              }}
            />}
            sceneSettingsOpen={sceneSettingsOpen}
            onCloseSceneSettings={() => setSceneSettingsOpen(false)}
            onSceneSettingsChange={handleSceneSettingsChange}
            onProjectMetadataChange={handleProjectMetadataChange}
            onThumbnailChanged={() => {
              onThumbnailChanged?.();
              setNotice("サムネイルを更新しました。変更は公開時に反映されます");
            }}
            onSelectPrefabSourceEntity={(entityId) => {
              if (!bundle.scene.entities[entityId]) {
                setNotice("プレハブ元データEntityが見つかりません");
                return;
              }
              setAssetSelection(null);
              setSceneSettingsOpen(false);
              setSceneSelection({ kind: "entity", id: entityId });
              setNotice("プレハブの編集元を開きました");
            }}
            onUpdatePrefab={handleUpdatePrefab}
            onSetEntitiesEnabled={handleSetSelectedEntitiesEnabled}
            onSetMeshShadow={handleSetSelectedMeshShadow}
            onSetLightShadow={handleSetSelectedLightShadow}
            onApplyMaterialPatch={handleApplySelectedMaterialPatch}
          />
          </EditorPanelVisibilityContext.Provider>
          </div>
          <div id="editor-panel-assets" className={sidePanelClass("assets", false)}>
          <AssetsPanel
            assets={bundle.assets}
            projectPath={projectPath}
            projectKind={projectKind}
            editorMode={renderedEditorMode}
            selectedAssetId={assetSelection}
            selectedAssetIds={selectedAssetIds}
            pendingImports={pendingImports}
            importError={importError}
            statusMessage={notice}
            onSelectAsset={handleSelectAsset}
            onAssetSelectionChange={handleAssetSelectionChange}
            onQueueFiles={handleQueueFiles}
            onRemovePending={handleRemovePendingImport}
            onClearImportError={() => setImportError(null)}
            projectSaving={saveStatus === "saving"}
            onSaveBeforeImport={handleSaveBeforeImport}
            onPhaseNotice={setNotice}
            activeFolderId={activeAssetFolderId}
            onActiveFolderChange={(folderId) => {
              setActiveAssetFolderId(folderId);
              setAssetSelection(null);
            }}
            onCommand={executeCommand}
            renameRequest={
              renameTarget?.kind === "asset" || renameTarget?.kind === "folder"
                ? renameTarget
                : null
            }
            onRename={(target, name) =>
              commitRename({ ...target, requestId: Date.now() }, name)
            }
            onRequestDeleteAsset={requestDeleteAsset}
            onSetProjectThumbnail={handleSetProjectThumbnailFromAsset}
            onRequestDeleteFolder={requestDeleteAssetFolder}
            onMoveAsset={handleMoveAsset}
            onMoveFolder={handleMoveAssetFolder}
            onPlaceBuiltinPrefab={handlePlaceBuiltinPrefab}
            onPlaceSceneAsset={(assetId) => handlePlaceSceneAsset(assetId)}
            onOpenExternalStore={() => setExternalStoreOpen(true)}
            onOpenInteractivity={(assetId) =>
              executeCommand("asset.edit-interactivity", { assetId })
            }
            onOpenAssetLocation={async (sourceRelativePath) => {
              if (onProjectExport) {
                setNotice("ブラウザに保存した素材は、プロジェクトを書き出して確認できます。");
                return;
              }
              if (!projectPath) {
                setNotice(
                  "プロジェクトを保存してから素材の保存先を開いてください",
                );
                return;
              }
              try {
                await tauri.openVisualAssetLocation(
                  projectPath,
                  sourceRelativePath,
                );
                setNotice(
                  sourceRelativePath
                    ? "アセットの保存先を開きました"
                    : "素材のフォルダーを開きました",
                );
              } catch {
                setNotice(
                  sourceRelativePath
                    ? "アセットの保存先を開けませんでした。ソースファイルを確認してください"
                    : "素材のフォルダーを開けませんでした。プロジェクトの保存場所を確認してください",
                );
              }
            }}
            canOpenAssetLocation={!onProjectExport}
            externalOperationLockReason={
              assetImportPanelAvailability.disabledReason
            }
          />
          </div>
          <MaterialThumbnailGenerationQueue
            assets={bundle.assets}
            projectPath={projectPath}
            enabled={renderedEditorMode === "edit" && !importBusy && (!tablet || (!panelsHidden && tabletPanel === "assets"))}
            onGenerated={handleAssetThumbnailGenerated}
            onFailed={handleMaterialThumbnailFailure}
          />
          <EnvironmentTextureThumbnailGenerationQueue
            assets={bundle.assets}
            projectPath={projectPath}
            enabled={renderedEditorMode === "edit" && !importBusy && (!tablet || (!panelsHidden && tabletPanel === "assets"))}
            onGenerated={handleAssetThumbnailGenerated}
            onFailed={handleEnvironmentTextureThumbnailFailure}
          />
          <ModelThumbnailGenerationQueue
            assets={bundle.assets}
            projectPath={projectPath}
            enabled={renderedEditorMode === "edit" && !importBusy && (!tablet || (!panelsHidden && tabletPanel === "assets"))}
            onGenerated={handleAssetThumbnailGenerated}
            onFailed={handleModelThumbnailFailure}
          />
          {!tablet ? <EditorUtilityRail
            commands={resolvedCommands}
            sceneSettingsOpen={sceneSettingsOpen}
            onToggleSceneSettings={() => {
              setSceneSettingsOpen((current) => !current);
              if (tablet) { setTabletPanel("inspector"); setViewportMaximized(false); }
            }}
            onResetLayout={() => executeCommand("layout.reset")}
            mcpNativeAvailable={mcpNativeAvailable}
            mcpClients={mcpClients}
            mcpLoading={mcpLoading}
            mcpRegisteringClientId={mcpRegisteringClientId}
            mcpError={mcpError}
            ollamaStatus={ollamaStatus}
            ollamaConfiguring={ollamaConfiguring}
            ollamaError={ollamaError}
            ollamaResult={ollamaResult}
            mcpLastActivity={mcpLastActivity}
            canUndo={
              !renderedReadOnly &&
              !importBusy &&
              history.past.length > 0 &&
              mcpLastActivity?.revision === mcpRevisionRef.current
            }
            onOpenMcp={() => {
              if (
                (mcpClients.length === 0 || ollamaStatus === null) &&
                !mcpLoading
              ) {
                void refreshMcpClients();
              }
            }}
            onRefreshMcp={() => void refreshMcpClients()}
            onRegisterMcpClient={(clientId) => void registerMcpClient(clientId)}
            onConfigureOllama={(integrationId, model) =>
              void configureOllama(integrationId, model)
            }
            onUndo={handleUndo}
            onOpenSupport={() => setSupportOpen(true)}
            recording={{
              busy: recordingBusy,
              nativeAvailable: tauri.isAvailable(),
              onStart: () => {
                void startRecordingTake({}).then((result) => {
                  if (!result.started && result.message) setNotice(result.message);
                });
              },
              onStop: () => {
                void stopRecordingTake().then((result) => {
                  if (!result.stopped) return;
                  setNotice(
                    result.snapshot.status === "completed" && result.snapshot.path
                      ? `録画を保存しました: ${result.snapshot.path}`
                      : result.snapshot.message ?? "録画を停止しました",
                  );
                });
              },
              onProfileChange: (patch) => {
                recordingSession.setProfile(patch);
              },
              onViewportChange: (patch) => {
                recordingSession.setViewport(patch);
              },
              projectRecordingDirectory: projectPath ? `${projectPath}/Recording` : undefined,
              onChooseDirectory: () => {
                void tauri
                  .selectDirectory(
                    "録画の保存先を選ぶ",
                    recordingSession.getState().outputDirectory ?? undefined,
                  )
                  .then((directory) => {
                    if (typeof directory === "string" && directory) {
                      recordingSession.setOutputDirectory(directory);
                    }
                  })
                  .catch(() => setNotice("保存先を選べませんでした"));
              },
              onResetDirectory: () => recordingSession.setOutputDirectory(null),
              onRevealRecording: (path) => {
                const folder = path.replace(/[\\/][^\\/]+$/, "");
                void tauri.openPath(folder || path).catch(() => {
                  setNotice("録画の保存先を開けませんでした");
                });
              },
              onFitCamera: () => {
                void moveRecordingCamera({ fitScene: true }).catch((error) => {
                  setNotice(
                    error instanceof Error ? error.message : "録画用カメラを動かせませんでした",
                  );
                });
              },
              onCameraPreset: (preset) => {
                void moveRecordingCamera({ preset }).catch((error) => {
                  setNotice(
                    error instanceof Error ? error.message : "録画用カメラを動かせませんでした",
                  );
                });
              },
            }}
          /> : null}
          <ExternalAssetStoreDialog
            open={externalStoreOpen}
            projectPath={projectPath}
            projectKind={projectKind}
            disabledReason={
              renderedReadOnly
                ? "動作確認を停止してから外部アセットを追加してください"
                : assetImportPanelAvailability.disabledReason
            }
            onClose={() => setExternalStoreOpen(false)}
            onInstalled={handleExternalStoreInstalled}
            onAddOpenBrush={handleAddOpenBrushMaterial}
            onAddSkyShader={handleAddSkyShader}
            onAddWaterShader={handleAddWaterShader}
            onAddTerrainPreset={handleAddTerrainPreset}
            onAddGlowMaterial={handleAddGlowMaterial}
            onAddParticlePreset={handleAddParticlePreset}
            onAddSceneRecipe={handleAddSceneRecipe}
            sceneBloomActive={sceneBloomIsActive(bundle.scene)}
            sceneWind={resolveSceneWind(
              resolveSceneSettings(bundle.scene.settings).vegetation,
            )}
            onAddOfficialComponent={handleAddOfficialComponent}
          />
          <ConfirmDialog
            open={leaveWithoutSaveError !== null}
            title="保存できませんでした"
            description={`${leaveWithoutSaveError ?? ""}。このまま戻ると、未保存の変更は失われます。`}
            confirmLabel="保存せずに戻る"
            cancelLabel="編集を続ける"
            destructive
            onConfirm={() => {
              setLeaveWithoutSaveError(null);
              onBack();
            }}
            onClose={() => setLeaveWithoutSaveError(null)}
          />
          <SupportReportModal
            open={supportOpen}
            context={{
              currentScreen: "ビジュアルエディター",
              project: {
                name: bundle.project.metadata.title || bundle.project.metadata.name,
                description: bundle.project.metadata.description || undefined,
              },
            }}
            onClose={() => setSupportOpen(false)}
          />
          {/*
            Hidden, not unmounted. A tab that threw away the draft and its undo
            history the moment you looked at the Scene View would be worse than
            the window it replaced — the reason to look is usually to check
            what the graph you are half way through writing is pointing at.
          */}
          {interactivityEditorAsset ? (
            <div className={graphTabActive && sceneContentVisible ? "contents" : "hidden"}>
            <InteractivityGraphEditor
              active={graphTabActive && sceneContentVisible}
              key={interactivityEditorAsset.id}
              asset={interactivityEditorAsset}
              materials={Object.values(bundle.assets.assets).filter(
                (asset) => asset.kind === "material",
              )}
              assetChoices={Object.values(bundle.assets.assets).map((asset) => ({
                id: asset.id,
                name: asset.name,
                kind: asset.kind,
              }))}
              triggerTargets={interactionTriggerTargets}
              readOnly={renderedReadOnly}
              onSave={handleSaveInteractivityAsset}
              onPendingDraftChange={(pending) => {
                pendingInteractivityDraftRef.current = pending;
              }}
              onRenameAsset={(name) =>
                commitRename(
                  {
                    kind: "asset",
                    id: interactivityEditorAsset.id,
                    requestId: Date.now(),
                  },
                  name,
                )
              }
              onClose={() => setInteractivityEditorAssetId(null)}
              setup={{
                attachments: interactivityAttachments,
                selectedEntity: interactivitySelectedEntity,
                onAttach: (entityId) =>
                  handleAttachInteractivityAsset(
                    entityId,
                    interactivityEditorAsset.id,
                  ),
                onAddInteractable: (entityId) =>
                  handleAddComponent(
                    entityId,
                    XRIFT_COMPONENT_SCHEMA_IDS.interactable,
                  ),
                onSelectEntity: (entityId) =>
                  handleEntitySelectionChange([entityId], entityId),
              }}
            />
            </div>
          ) : null}
          {scriptEditorAsset ? (
            <ScriptEditorWorkspace
              assets={bundle.assets}
              active={scriptTabActive && sceneContentVisible}
              onOpen={(assetId) => { void openScriptEditor(assetId); }}
              onCreate={() => setScriptTemplateFolderId(null)}
              createDisabled={renderedEditorMode === "play" || !projectPath}
              onRetry={() => { void scriptEditor.open(scriptEditorAsset.id); }}
              onSavingChange={handleScriptEditorSavingChange}
              asset={scriptEditorAsset}
              source={scriptEditor.state.source}
              loading={scriptEditor.state.loading}
              error={scriptEditor.state.error}
              playing={renderedEditorMode === "play"}
              runtime={scriptRuntimeReport}
              onSave={scriptEditor.save}
              onDirtyChange={handleScriptEditorDirtyChange}
              onClose={closeScriptEditor}
            />
          ) : null}
          {shaderEditorAsset && shaderEditorRequest?.kind === "asset" ? (
            <ShaderEditorDialog
              key={`shader:${shaderEditorAsset.id}`}
              title={shaderEditorAsset.name}
              stage={shaderEditorStage}
              sourcePath={shaderEditorAsset.source.relativePath}
              source={shaderEditorSource}
              loading={shaderEditor.state.loading}
              error={shaderEditor.state.error}
              onSave={shaderEditor.save}
              onDirtyChange={handleShaderEditorDirtyChange}
              onClose={closeShaderEditor}
            />
          ) : shaderEditorMaterialShader && shaderEditorRequest?.kind === "material" ? (
            <ShaderEditorDialog
              key={`material-shader:${shaderEditorRequest.assetId}:${shaderEditorRequest.stage}`}
              title={shaderEditorMaterial?.name ?? "Material Shader"}
              stage={shaderEditorRequest.stage}
              source={shaderEditorSource}
              loading={false}
              error={null}
              onSave={(source) =>
                saveMaterialShaderSource(
                  shaderEditorRequest.assetId,
                  shaderEditorRequest.stage,
                  source,
                )
              }
              onDirtyChange={handleShaderEditorDirtyChange}
              onClose={closeShaderEditor}
            />
          ) : null}
          <button
            type="button"
            aria-label="Hierarchyの幅を変更"
            title={commandTitle("Hierarchyの幅を変更", "ResizePanel.Hierarchy")}
            onPointerDown={(event) => beginResize("hierarchy", event)}
            className={`absolute bottom-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70 ${
              panelsHidden || tablet ? "hidden" : ""
            }`}
            style={{ left: `calc(${hierarchyTrack} - 2px)` }}
          />
          {deleteDialog ? (
            <AssetDeleteDialog
              target={deleteDialog}
              onCancel={() => setDeleteDialog(null)}
              onConfirm={confirmAssetLibraryDelete}
              onDetachReference={detachAssetReferenceFromDialog}
              onDetachAllReferences={detachReferencesAndDeleteAsset}
              onRevealReference={revealAssetReference}
            />
          ) : null}
          {pendingMaterialAssignment ? (
            <MaterialSlotAssignmentDialog
              entityName={pendingMaterialAssignment.entityName}
              materialName={pendingMaterialAssignment.materialName}
              slots={pendingMaterialAssignment.slots}
              onCancel={() => {
                setPendingMaterialAssignment(null);
                setNotice("マテリアルの適用を取り消しました");
              }}
              onConfirm={(choice) => {
                const pending = pendingMaterialAssignment;
                setPendingMaterialAssignment(null);
                commitMaterialAssignment(
                  pending.entityId,
                  pending.materialAssetId,
                  choice === ALL_MATERIAL_SLOTS
                    ? pending.slots.map((slot) => slot.slot)
                    : [choice],
                  pending.meshComponentId,
                );
              }}
            />
          ) : null}
          <button
            type="button"
            aria-label="Inspectorの幅を変更"
            title={commandTitle("Inspectorの幅を変更", "ResizePanel.Inspector")}
            onPointerDown={(event) => beginResize("inspector", event)}
            className={`absolute bottom-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70 ${
              panelsHidden || tablet ? "hidden" : ""
            }`}
            style={{ right: `calc(${inspectorTrack} - 2px)` }}
          />
          <button
            type="button"
            aria-label="Assetsの高さを変更"
            title={commandTitle("Assetsの高さを変更", "ResizePanel.Assets")}
            onPointerDown={(event) => beginResize("assets", event)}
            className={`absolute z-40 h-1 cursor-row-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70 ${
              panelsHidden || tablet ? "hidden" : ""
            }`}
            style={{
              bottom: `calc(${assetsTrack} - 2px)`,
              left: hierarchyTrack,
              right: inspectorTrack,
            }}
          />
        </main>
        {tablet && !recordingUiHidden && notice && (tabletPanel !== "assets" || panelsHidden) ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-editor-border bg-editor-surface px-3 py-1.5 text-xs text-editor-text">
            <p role="status" className="min-w-0 flex-1 whitespace-pre-wrap break-words">{notice}</p>
            <button type="button" aria-label="通知を閉じる" onClick={() => setNotice(null)}
              className="min-h-11 shrink-0 rounded-md px-3 text-editor-muted hover:bg-editor-subtle">閉じる</button>
          </div>
        ) : null}
      </div>
    </div>
    </ValueScrubContext.Provider>
  );
}
